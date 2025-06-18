import { authenticator } from 'otplib';
import { prisma } from '@/utils/database';
import { encrypt, decrypt } from '@/utils/crypto';
import { AuthenticationError } from '@/types';
import { auditService } from './auditService';
import * as QRCode from 'qrcode';

interface TwoFactorSetupResult {
  secret: string;
  qrCodeUrl: string;
  backupCodes: string[];
}

export class TwoFactorService {
  /**
   * Enable 2FA for a user
   */
  async enableTwoFactor(userId: string): Promise<TwoFactorSetupResult> {
    // Check if 2FA is already enabled
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new AuthenticationError('User not found');
    }

    if (user.twoFactorEnabled) {
      throw new AuthenticationError('2FA is already enabled');
    }

    // Generate secret
    const secret = authenticator.generateSecret();
    
    // Generate backup codes
    const backupCodes = this.generateBackupCodes(8);
    
    // Store encrypted secret and backup codes
    const encryptedSecret = encrypt(secret);
    const encryptedBackupCodes = encrypt(JSON.stringify(backupCodes));
    
    await prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorSecret: encryptedSecret,
        twoFactorBackupCodes: encryptedBackupCodes,
        twoFactorEnabled: false // Will be enabled after verification
      }
    });

    // Generate QR code
    const otpauth = authenticator.keyuri(user.email || userId, 'Interspace Wallet', secret);
    const qrCodeUrl = await QRCode.toDataURL(otpauth);

    // Log the action
    await auditService.log({
      userId,
      action: '2FA_SETUP_INITIATED',
      resource: 'TwoFactor',
      details: JSON.stringify({ method: 'totp' })
    });

    return {
      secret,
      qrCodeUrl,
      backupCodes
    };
  }

  /**
   * Verify and complete 2FA setup
   */
  async verifyAndCompleteTwoFactorSetup(userId: string, token: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user || !user.twoFactorSecret) {
      throw new AuthenticationError('2FA setup not initiated');
    }

    const secret = decrypt(user.twoFactorSecret);
    const isValid = authenticator.verify({ token, secret });

    if (!isValid) {
      await auditService.logSecurityEvent({
        type: 'INVALID_TOKEN',
        userId,
        details: { reason: '2FA setup verification failed' }
      });
      throw new AuthenticationError('Invalid 2FA token');
    }

    // Enable 2FA
    await prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: true,
        twoFactorEnabledAt: new Date()
      }
    });

    await auditService.log({
      userId,
      action: '2FA_ENABLED',
      resource: 'TwoFactor',
      details: JSON.stringify({ method: 'totp' })
    });
  }

  /**
   * Verify 2FA token
   */
  async verifyTwoFactorToken(userId: string, token: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      return false;
    }

    // Check if it's a backup code
    if (token.length === 8 && user.twoFactorBackupCodes) {
      return this.verifyBackupCode(userId, token);
    }

    // Verify TOTP token
    const secret = decrypt(user.twoFactorSecret);
    const isValid = authenticator.verify({ token, secret });

    if (isValid) {
      await auditService.log({
        userId,
        action: '2FA_VERIFIED',
        resource: 'TwoFactor',
        details: JSON.stringify({ method: 'totp' })
      });
    } else {
      await auditService.logSecurityEvent({
        type: 'INVALID_TOKEN',
        userId,
        details: { reason: '2FA verification failed' }
      });
    }

    return isValid;
  }

  /**
   * Verify backup code
   */
  private async verifyBackupCode(userId: string, code: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user || !user.twoFactorBackupCodes) {
      return false;
    }

    const backupCodes = JSON.parse(decrypt(user.twoFactorBackupCodes));
    const codeIndex = backupCodes.indexOf(code);

    if (codeIndex === -1) {
      await auditService.logSecurityEvent({
        type: 'INVALID_TOKEN',
        userId,
        details: { reason: 'Invalid backup code' }
      });
      return false;
    }

    // Remove used backup code
    backupCodes.splice(codeIndex, 1);
    const encryptedBackupCodes = encrypt(JSON.stringify(backupCodes));

    await prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorBackupCodes: encryptedBackupCodes
      }
    });

    await auditService.log({
      userId,
      action: '2FA_BACKUP_CODE_USED',
      resource: 'TwoFactor',
      details: JSON.stringify({ remainingCodes: backupCodes.length })
    });

    return true;
  }

  /**
   * Disable 2FA
   */
  async disableTwoFactor(userId: string, password: string): Promise<void> {
    // Verify password before disabling 2FA
    const { authService } = await import('./authService');
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new AuthenticationError('User not found');
    }

    const isPasswordValid = await authService.verifyPassword(password, user.hashedPassword!);
    if (!isPasswordValid) {
      await auditService.logSecurityEvent({
        type: 'PERMISSION_DENIED',
        userId,
        details: { reason: 'Invalid password for 2FA disable' }
      });
      throw new AuthenticationError('Invalid password');
    }

    // Disable 2FA
    await prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorBackupCodes: null,
        twoFactorEnabledAt: null
      }
    });

    await auditService.log({
      userId,
      action: '2FA_DISABLED',
      resource: 'TwoFactor',
      details: JSON.stringify({ method: 'totp' })
    });
  }

  /**
   * Generate new backup codes
   */
  async regenerateBackupCodes(userId: string, password: string): Promise<string[]> {
    // Verify password
    const { authService } = await import('./authService');
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user || !user.twoFactorEnabled) {
      throw new AuthenticationError('2FA not enabled');
    }

    const isPasswordValid = await authService.verifyPassword(password, user.hashedPassword!);
    if (!isPasswordValid) {
      throw new AuthenticationError('Invalid password');
    }

    // Generate new backup codes
    const backupCodes = this.generateBackupCodes(8);
    const encryptedBackupCodes = encrypt(JSON.stringify(backupCodes));

    await prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorBackupCodes: encryptedBackupCodes
      }
    });

    await auditService.log({
      userId,
      action: '2FA_BACKUP_CODES_REGENERATED',
      resource: 'TwoFactor',
      details: JSON.stringify({ count: backupCodes.length })
    });

    return backupCodes;
  }

  /**
   * Check if user has 2FA enabled
   */
  async isTwoFactorEnabled(userId: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { twoFactorEnabled: true }
    });

    return user?.twoFactorEnabled || false;
  }

  /**
   * Generate backup codes
   */
  private generateBackupCodes(count: number): string[] {
    const codes: string[] = [];
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

    for (let i = 0; i < count; i++) {
      let code = '';
      for (let j = 0; j < 8; j++) {
        code += characters.charAt(Math.floor(Math.random() * characters.length));
      }
      codes.push(code);
    }

    return codes;
  }

  /**
   * Require 2FA for critical operations
   */
  async requireTwoFactor(userId: string, token: string, operation: string): Promise<void> {
    const isEnabled = await this.isTwoFactorEnabled(userId);
    
    // In production, 2FA is required for critical operations
    if (process.env.NODE_ENV === 'production' && !isEnabled) {
      throw new AuthenticationError('2FA is required for this operation');
    }

    // If 2FA is enabled, verify the token
    if (isEnabled) {
      const isValid = await this.verifyTwoFactorToken(userId, token);
      if (!isValid) {
        throw new AuthenticationError('Invalid 2FA token');
      }
    }

    await auditService.log({
      userId,
      action: '2FA_REQUIRED_OPERATION',
      resource: 'TwoFactor',
      details: JSON.stringify({ operation })
    });
  }
}

export const twoFactorService = new TwoFactorService();