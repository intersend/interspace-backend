import bcrypt from 'bcryptjs';
import { prisma, withTransaction } from '@/utils/database';
import { generateTokens, verifyRefreshToken } from '@/utils/tokenUtils';
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
      const existingAccount = await tx.account.findUnique({
        where: { 
          type_identifier: {
            type: 'email',
            identifier: data.email.toLowerCase()
          }
        }
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

      // Create account
      const account = await tx.account.create({
        data: {
          type: 'email',
          identifier: data.email.toLowerCase(),
          verified: false,
          metadata: {
            hashedPassword
          }
        }
      });

      // Register device
      await tx.deviceRegistration.create({
        data: {
          accountId: account.id,
          deviceId: data.deviceId,
          deviceName: data.deviceName,
          deviceType: data.deviceType,
          isActive: true
        }
      });

      // Create session
      const sessionId = uuidv4();
      await tx.accountSession.create({
        data: {
          accountId: account.id,
          sessionId,
          deviceId: data.deviceId,
          deviceName: data.deviceName,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
        }
      });

      // Generate tokens
      const tokens = generateTokens({
        accountId: account.id,
        sessionToken: sessionId,
        deviceId: data.deviceId
      });

      return tokens;
    });
  }

  async login(data: LoginRequest): Promise<AuthTokens> {
    // Find account with email
    const account = await prisma.account.findUnique({
      where: { 
        type_identifier: {
          type: 'email',
          identifier: data.email.toLowerCase()
        }
      },
      include: {
        devices: {
          where: { deviceId: data.deviceId }
        }
      }
    });

    const hashedPassword = (account?.metadata as any)?.hashedPassword as string;
    
    if (!account || !hashedPassword) {
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
    const isValidPassword = await bcrypt.compare(data.password, hashedPassword);
    if (!isValidPassword) {
      // Log failed login attempt
      await auditService.logSecurityEvent({
        type: 'LOGIN_FAILED',
        accountId: account.id,
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
            accountId: account.id,
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

      // Create session
      const sessionId = uuidv4();
      await tx.accountSession.create({
        data: {
          accountId: account.id,
          sessionId,
          deviceId: data.deviceId,
          deviceName: data.deviceName,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
        }
      });

      // Generate tokens
      const tokens = generateTokens({
        accountId: account.id,
        sessionToken: sessionId,
        deviceId: data.deviceId
      });

      return tokens;
    });
  }

  async refreshAccessToken(refreshToken: string): Promise<AuthTokens> {
    // Verify refresh token
    const payload = verifyRefreshToken(refreshToken);

    return withTransaction(async (tx) => {
      // Get session
      const session = await tx.accountSession.findUnique({
        where: { sessionId: payload.sessionToken },
        include: { account: true }
      });

      if (!session || session.expiresAt < new Date()) {
        throw new AuthenticationError('Invalid or expired session');
      }

      // Verify account matches
      if (session.accountId !== payload.accountId) {
        throw new AuthenticationError('Session account mismatch');
      }

      // Verify device is still active if deviceId is provided
      if (payload.deviceId) {
        const device = await tx.deviceRegistration.findUnique({
          where: { deviceId: payload.deviceId }
        });

        if (!device || !device.isActive) {
          throw new AuthenticationError('Device not registered or inactive');
        }
      }

      // Generate new tokens with same session
      const newTokens = generateTokens({
        accountId: session.accountId,
        sessionToken: session.sessionId,
        deviceId: payload.deviceId,
        activeProfileId: (session as any).activeProfileId
      });

      // Update session last activity
      await tx.accountSession.update({
        where: { id: session.id },
        data: { } // Just touching the record updates updatedAt
      });

      // Blacklist the old refresh token (for 30 days to match refresh token expiry)
      await tokenBlacklistService.blacklistToken(
        refreshToken,
        'rotation' as any,
        session.accountId,
        30 * 24 * 60 * 60, // 30 days in seconds
        'refresh' // This is a refresh token
      );

      return newTokens;
    });
  }

  async logout(refreshToken: string): Promise<void> {
    try {
      const payload = verifyRefreshToken(refreshToken);
      
      if (payload.sessionToken) {
        // Find and delete the session
        const session = await prisma.accountSession.findUnique({
          where: { sessionId: payload.sessionToken }
        });
        
        if (session) {
          // Blacklist the token (for remaining session duration)
          const remainingTtl = Math.max(
            Math.floor((session.expiresAt.getTime() - Date.now()) / 1000),
            86400 // minimum 24 hours
          );
          await tokenBlacklistService.blacklistToken(
            refreshToken,
            'logout' as any,
            session.accountId,
            remainingTtl,
            'refresh' // This is a refresh token
          );
          
          // Delete the session
          await prisma.accountSession.delete({
            where: { sessionId: payload.sessionToken }
          });
        }
      }
    } catch (error) {
      // Ignore errors if token doesn't exist or is invalid
    }
  }

  async logoutAllDevices(accountId: string): Promise<void> {
    // Blacklist all account tokens
    await tokenBlacklistService.blacklistAllAccountTokens(
      accountId,
      'logout' as any
    );

    // Delete all sessions for this account
    await prisma.accountSession.deleteMany({
      where: { accountId }
    });

    // Deactivate all devices
    await prisma.deviceRegistration.updateMany({
      where: { accountId },
      data: { isActive: false }
    });
  }

  async getAccountById(accountId: string) {
    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        type: true,
        identifier: true,
        provider: true,
        verified: true,
        metadata: true,
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
    return prisma.account.findUnique({
      where: { 
        type_identifier: {
          type: 'email',
          identifier: email.toLowerCase()
        }
      },
      select: {
        id: true,
        type: true,
        identifier: true,
        provider: true,
        verified: true,
        metadata: true,
        createdAt: true,
        updatedAt: true
      }
    });
  }

  async updatePassword(accountId: string, newPassword: string): Promise<void> {
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Get current account to preserve other metadata
    const account = await prisma.account.findUnique({
      where: { id: accountId }
    });

    if (!account) {
      throw new NotFoundError('Account not found');
    }

    // Update password in metadata
    await prisma.account.update({
      where: { id: accountId },
      data: { 
        metadata: {
          ...((account.metadata as any) || {}),
          hashedPassword
        }
      }
    });

    // Invalidate all existing tokens
    await this.logoutAllDevices(accountId);
  }
}

export const authService = new AuthService();