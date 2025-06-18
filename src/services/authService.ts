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
      // Check if user already exists
      const existingUser = await tx.user.findUnique({
        where: { email: data.email }
      });

      if (existingUser) {
        throw new ConflictError('User already exists with this email');
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

      // Create user
      const user = await tx.user.create({
        data: {
          email: data.email,
          hashedPassword,
          emailVerified: false
        }
      });

      // Register device
      await tx.deviceRegistration.create({
        data: {
          userId: user.id,
          deviceId: data.deviceId,
          deviceName: data.deviceName,
          deviceType: data.deviceType,
          isActive: true
        }
      });

      // Generate tokens with token family
      const familyId = uuidv4();
      const accessToken = generateAccessToken(user.id, data.deviceId);
      const refreshToken = generateRefreshToken(user.id, data.deviceId);

      // Store refresh token with family ID
      await tx.refreshToken.create({
        data: {
          userId: user.id,
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
    // Find user with email
    const user = await prisma.user.findUnique({
      where: { email: data.email },
      include: {
        devices: {
          where: { deviceId: data.deviceId }
        }
      }
    });

    if (!user || !user.hashedPassword) {
      // Log failed login attempt
      await auditService.logSecurityEvent({
        type: 'LOGIN_FAILED',
        details: { email: data.email, reason: 'user_not_found' },
        ipAddress: data.ipAddress,
        userAgent: data.userAgent
      });
      
      // Check for brute force attempts
      await securityMonitoringService.checkBruteForce(undefined, data.ipAddress);
      
      throw new AuthenticationError('Invalid credentials');
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(data.password, user.hashedPassword);
    if (!isValidPassword) {
      // Log failed login attempt
      await auditService.logSecurityEvent({
        type: 'LOGIN_FAILED',
        userId: user.id,
        details: { email: data.email, reason: 'invalid_password' },
        ipAddress: data.ipAddress,
        userAgent: data.userAgent
      });
      
      // Check for brute force attempts
      await securityMonitoringService.checkBruteForce(user.id, data.ipAddress);
      
      throw new AuthenticationError('Invalid credentials');
    }

    return withTransaction(async (tx) => {
      // Handle device registration
      if (user.devices.length === 0) {
        // Register new device
        await tx.deviceRegistration.create({
          data: {
            userId: user.id,
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
      const accessToken = generateAccessToken(user.id, data.deviceId);
      const refreshToken = generateRefreshToken(user.id, data.deviceId);

      // Clean up old refresh tokens for this user
      await tx.refreshToken.deleteMany({
        where: {
          userId: user.id,
          expiresAt: { lt: new Date() }
        }
      });

      // Store new refresh token with family ID
      await tx.refreshToken.create({
        data: {
          userId: user.id,
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
        include: { user: true }
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
          userId: storedToken.userId,
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
      const newAccessToken = generateAccessToken(payload.userId, payload.deviceId);
      const newRefreshToken = generateRefreshToken(payload.userId, payload.deviceId);

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
          userId: storedToken.userId,
          token: newRefreshToken,
          familyId: storedToken.familyId,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        }
      });

      // Blacklist the old refresh token
      await tokenBlacklistService.blacklistToken(
        refreshToken,
        'refresh',
        storedToken.userId,
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
          token.userId,
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

  async logoutAllDevices(userId: string): Promise<void> {
    // Blacklist all user tokens
    await tokenBlacklistService.blacklistAllUserTokens(
      userId,
      { reason: 'logout' }
    );
    
    // Delete all refresh tokens (handled by blacklistAllUserTokens)
  }

  async verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
    return bcrypt.compare(password, hashedPassword);
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user || !user.hashedPassword) {
      throw new NotFoundError('User');
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, user.hashedPassword);
    if (!isValidPassword) {
      throw new AuthenticationError('Current password is incorrect');
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 12);

    await withTransaction(async (tx) => {
      // Update password
      await tx.user.update({
        where: { id: userId },
        data: { hashedPassword: hashedNewPassword }
      });

      // Logout all devices (security measure)
      await tokenBlacklistService.blacklistAllUserTokens(
        userId,
        { reason: 'password_change' }
      );
    });
  }

  async deactivateDevice(deviceId: string): Promise<void> {
    await withTransaction(async (tx) => {
      // Deactivate device
      await tx.deviceRegistration.update({
        where: { deviceId },
        data: { isActive: false }
      });

      // Remove refresh tokens for this device
      const device = await tx.deviceRegistration.findUnique({
        where: { deviceId }
      });

      if (device) {
        await tx.refreshToken.deleteMany({
          where: { userId: device.userId }
        });
      }
    });
  }

  async getUserDevices(userId: string) {
    return prisma.deviceRegistration.findMany({
      where: { userId },
      orderBy: { lastActiveAt: 'desc' },
      select: {
        id: true,
        deviceId: true,
        deviceName: true,
        deviceType: true,
        isActive: true,
        lastActiveAt: true,
        createdAt: true
      }
    });
  }
}

export const authService = new AuthService();
