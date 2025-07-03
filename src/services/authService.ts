import bcrypt from 'bcryptjs';
import { prisma, withTransaction } from '@/utils/database';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '@/utils/jwt';
import { auditService } from './auditService';
import { tokenBlacklistService } from './tokenBlacklistService';
import { securityMonitoringService } from './securityMonitoringService';
import { v4 as uuidv4 } from 'uuid';
import { 
  LoginRequest, 
  RegisterRequest, 
  AuthTokens,
  AuthenticationError,
  ConflictError,
  NotFoundError 
} from '@/types';

export class AuthService {
  async register(data: RegisterRequest): Promise<AuthTokens> {
    return withTransaction(async (tx) => {
      // Check if account already exists
      const existingAccount = await tx.user.findUnique({
        where: { email: data.email }
      });

      if (existingAccount) {
        throw new ConflictError('Account already exists with this email');
      }

      // Check if device is already registered
      const existingDevice = await tx.deviceRegistration.findUnique({
        where: { deviceId: data.deviceId }
      });

      if (existingDevice) {
        throw new ConflictError('Device already registered');
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(data.password, 12);

      // Create account (using legacy user table)
      const account = await tx.user.create({
        data: {
          email: data.email,
          hashedPassword,
          emailVerified: false
        }
      });

      // Register device
      await tx.deviceRegistration.create({
        data: {
          userId: account.id,  // Field name remains userId for DB compatibility
          deviceId: data.deviceId,
          deviceName: data.deviceName,
          deviceType: data.deviceType,
          isActive: true
        }
      });

      // Generate tokens with token family
      const familyId = uuidv4();
      const accessToken = generateAccessToken(account.id, data.deviceId);
      const refreshToken = generateRefreshToken(account.id, data.deviceId);

      // Store refresh token with family ID
      await tx.refreshToken.create({
        data: {
          userId: account.id,  // Field name remains userId for DB compatibility
          token: refreshToken,
          familyId,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
        }
      });

      return {
        accessToken,
        refreshToken,
        expiresIn: 15 * 60 // 15 minutes
      };
    });
  }

  async login(data: LoginRequest): Promise<AuthTokens> {
    // Find account with email
    const account = await prisma.user.findUnique({
      where: { email: data.email },
      include: {
        devices: {
          where: { deviceId: data.deviceId }
        }
      }
    });

    if (!account || !account.hashedPassword) {
      // Log failed login attempt
      await auditService.logSecurityEvent({
        type: 'LOGIN_FAILED',
        details: { email: data.email, reason: 'account_not_found' },
        ipAddress: data.ipAddress,
        userAgent: data.userAgent
      });
      
      // Check for brute force attempts
      await securityMonitoringService.checkBruteForce(undefined, data.ipAddress);
      
      throw new AuthenticationError('Invalid credentials');
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(data.password, account.hashedPassword);
    if (!isValidPassword) {
      // Log failed login attempt
      await auditService.logSecurityEvent({
        type: 'LOGIN_FAILED',
        userId: account.id,  // Field name remains userId for DB compatibility
        details: { email: data.email, reason: 'invalid_password' },
        ipAddress: data.ipAddress,
        userAgent: data.userAgent
      });
      
      // Check for brute force attempts
      await securityMonitoringService.checkBruteForce(account.id, data.ipAddress);
      
      throw new AuthenticationError('Invalid credentials');
    }

    return withTransaction(async (tx) => {
      // Handle device registration
      if (account.devices.length === 0) {
        // Register new device
        await tx.deviceRegistration.create({
          data: {
            userId: account.id,  // Field name remains userId for DB compatibility
            deviceId: data.deviceId,
            deviceName: data.deviceName,
            deviceType: data.deviceType,
            isActive: true
          }
        });
      } else {
        // Update existing device
        await tx.deviceRegistration.update({
          where: { deviceId: data.deviceId },
          data: {
            deviceName: data.deviceName,
            deviceType: data.deviceType,
            isActive: true,
            lastActiveAt: new Date()
          }
        });
      }

      // Generate tokens with token family
      const familyId = uuidv4();
      const accessToken = generateAccessToken(account.id, data.deviceId);
      const refreshToken = generateRefreshToken(account.id, data.deviceId);

      // Clean up old refresh tokens for this account
      await tx.refreshToken.deleteMany({
        where: {
          userId: account.id,  // Field name remains userId for DB compatibility
          expiresAt: { lt: new Date() }
        }
      });

      // Store new refresh token with family ID
      await tx.refreshToken.create({
        data: {
          userId: account.id,  // Field name remains userId for DB compatibility
          token: refreshToken,
          familyId,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
        }
      });

      return {
        accessToken,
        refreshToken,
        expiresIn: 15 * 60 // 15 minutes
      };
    });
  }

  async refreshAccessToken(refreshToken: string): Promise<AuthTokens> {
    // Verify refresh token
    const payload = verifyRefreshToken(refreshToken);

    return withTransaction(async (tx) => {
      // Check if refresh token exists in database
      const storedToken = await tx.refreshToken.findUnique({
        where: { token: refreshToken },
        include: { user: true }  // Legacy table reference
      });

      if (!storedToken || storedToken.expiresAt < new Date()) {
        throw new AuthenticationError('Invalid or expired refresh token');
      }

      // Check if token has already been rotated (replay attack detection)
      if (storedToken.rotatedAt) {
        // Token has been used before - possible token theft
        // Invalidate entire token family
        if (storedToken.familyId) {
          await tx.refreshToken.deleteMany({
            where: { familyId: storedToken.familyId }
          });
        }
        
        // Log security event
        await auditService.logSecurityEvent({
          type: 'TOKEN_THEFT_DETECTED',
          userId: storedToken.userId,  // Field name remains userId for DB compatibility
          details: { 
            familyId: storedToken.familyId,
            tokenId: storedToken.id 
          }
        });
        
        throw new AuthenticationError('Token has been compromised');
      }

      // Verify device is still active
      const device = await tx.deviceRegistration.findUnique({
        where: { deviceId: payload.deviceId }
      });

      if (!device || !device.isActive) {
        throw new AuthenticationError('Device not registered or inactive');
      }

      // Generate new tokens
      const newAccessToken = generateAccessToken(payload.userId, payload.deviceId);  // payload field name unchanged
      const newRefreshToken = generateRefreshToken(payload.userId, payload.deviceId);  // payload field name unchanged

      // Mark old token as rotated
      await tx.refreshToken.update({
        where: { token: refreshToken },
        data: {
          rotatedAt: new Date()
        }
      });

      // Create new refresh token in the same family
      await tx.refreshToken.create({
        data: {
          userId: storedToken.userId,  // Field name remains userId for DB compatibility
          token: newRefreshToken,
          familyId: storedToken.familyId,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        }
      });

      // Blacklist the old refresh token
      await tokenBlacklistService.blacklistToken(
        refreshToken,
        'refresh',
        storedToken.userId,  // Field name remains userId for DB compatibility
        { reason: 'rotation' }
      );

      return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        expiresIn: 15 * 60
      };
    });
  }

  async logout(refreshToken: string): Promise<void> {
    try {
      const token = await prisma.refreshToken.findUnique({
        where: { token: refreshToken }
      });

      if (token) {
        // Blacklist the token
        await tokenBlacklistService.blacklistToken(
          refreshToken,
          'refresh',
          token.userId,  // Field name remains userId for DB compatibility
          { reason: 'logout' }
        );

        // Delete the refresh token
        await prisma.refreshToken.delete({
          where: { token: refreshToken }
        });
      }
    } catch (error) {
      // Ignore errors if token doesn't exist
    }
  }

  async logoutAllDevices(accountId: string): Promise<void> {
    // Blacklist all account tokens
    await tokenBlacklistService.blacklistAllUserTokens(
      accountId,
      { reason: 'logout' }
    );

    // Delete all refresh tokens for this account
    await prisma.refreshToken.deleteMany({
      where: { userId: accountId }  // Field name remains userId for DB compatibility
    });

    // Deactivate all devices
    await prisma.deviceRegistration.updateMany({
      where: { userId: accountId },  // Field name remains userId for DB compatibility
      data: { isActive: false }
    });
  }

  async getAccountById(accountId: string) {
    const account = await prisma.user.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        email: true,
        emailVerified: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!account) {
      throw new NotFoundError('Account not found');
    }

    return account;
  }

  async findAccountByEmail(email: string) {
    return prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        emailVerified: true,
        createdAt: true,
        updatedAt: true
      }
    });
  }

  async updatePassword(accountId: string, newPassword: string): Promise<void> {
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    await prisma.user.update({
      where: { id: accountId },
      data: { hashedPassword }
    });

    // Invalidate all existing tokens
    await this.logoutAllDevices(accountId);
  }
}

export const authService = new AuthService();