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

interface TwoFactorMetadata {
  enabled: boolean;
  secret?: string;
  backupCodes?: string[];
  enabledAt?: string;
}

export class TwoFactorService {
  /**
   * Get 2FA metadata from account
   */
  private async get2FAMetadata(accountId: string): Promise<TwoFactorMetadata> {
    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: { metadata: true }
    });

    if (!account) {
      throw new AuthenticationError('Account not found');
    }

    const metadata = account.metadata as any || {};
    return metadata.twoFactor || { enabled: false };
  }

  /**
   * Update 2FA metadata for account
   */
  private async update2FAMetadata(accountId: string, twoFactorData: TwoFactorMetadata): Promise<void> {
    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: { metadata: true }
    });

    if (!account) {
      throw new AuthenticationError('Account not found');
    }

    const metadata = account.metadata as any || {};
    metadata.twoFactor = twoFactorData;

    await prisma.account.update({
      where: { id: accountId },
      data: { metadata }
    });
  }

  /**
   * Check if 2FA is enabled for an account
   */
  async isEnabled(accountId: string): Promise<boolean> {
    const twoFactorData = await this.get2FAMetadata(accountId);
    return twoFactorData.enabled;
  }

  /**
   * Setup 2FA for an account (generates secret and QR code)
   */
  async setupTwoFactor(accountId: string): Promise<TwoFactorSetupResult> {
    const account = await prisma.account.findUnique({
      where: { id: accountId }
    });

    if (!account) {
      throw new AuthenticationError('Account not found');
    }

    const twoFactorData = await this.get2FAMetadata(accountId);
    if (twoFactorData.enabled) {
      throw new AuthenticationError('2FA is already enabled');
    }

    // Generate secret
    const secret = authenticator.generateSecret();
    
    // Generate backup codes
    const backupCodes = this.generateBackupCodesList();
    
    // Store encrypted secret and backup codes temporarily (not enabled yet)
    const encryptedSecret = encrypt(secret);
    const encryptedBackupCodes = backupCodes.map(code => encrypt(code));
    
    await this.update2FAMetadata(accountId, {
      enabled: false,
      secret: encryptedSecret,
      backupCodes: encryptedBackupCodes
    });

    // Generate QR code
    const otpauth = authenticator.keyuri(
      account.identifier,
      'Interspace',
      secret
    );
    
    const qrCodeUrl = await QRCode.toDataURL(otpauth);

    await auditService.log({
      accountId,
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
   * Verify token and enable 2FA
   */
  async verifyAndEnableTwoFactor(accountId: string, token: string): Promise<boolean> {
    const twoFactorData = await this.get2FAMetadata(accountId);
    
    if (twoFactorData.enabled) {
      throw new AuthenticationError('2FA is already enabled');
    }

    if (!twoFactorData.secret) {
      throw new AuthenticationError('2FA setup not initiated');
    }

    const decryptedSecret = decrypt(twoFactorData.secret);
    const isValid = authenticator.verify({
      token,
      secret: decryptedSecret
    });

    if (!isValid) {
      await auditService.logSecurityEvent({
        type: 'INVALID_TOKEN',
        accountId,
        details: { reason: '2FA setup verification failed' }
      });
      throw new AuthenticationError('Invalid verification code');
    }

    // Enable 2FA
    await this.update2FAMetadata(accountId, {
      ...twoFactorData,
      enabled: true,
      enabledAt: new Date().toISOString()
    });

    await auditService.log({
      accountId,
      action: '2FA_ENABLED',
      resource: 'TwoFactor',
      details: JSON.stringify({ method: 'totp' })
    });

    return true;
  }

  /**
   * Verify 2FA token
   */
  async verifyToken(accountId: string, token: string): Promise<boolean> {
    const twoFactorData = await this.get2FAMetadata(accountId);
    
    if (!twoFactorData.enabled) {
      return true; // 2FA not enabled, consider it valid
    }

    if (!twoFactorData.secret) {
      throw new AuthenticationError('2FA not properly configured');
    }

    const decryptedSecret = decrypt(twoFactorData.secret);
    
    // Try to verify as TOTP token first
    const isValidTotp = authenticator.verify({
      token,
      secret: decryptedSecret
    });

    if (isValidTotp) {
      await auditService.log({
        accountId,
        action: '2FA_VERIFIED',
        resource: 'TwoFactor',
        details: JSON.stringify({ method: 'totp' })
      });
      return true;
    }

    // Try backup codes
    if (twoFactorData.backupCodes) {
      const backupCodeIndex = twoFactorData.backupCodes.findIndex(
        encryptedCode => decrypt(encryptedCode) === token
      );

      if (backupCodeIndex !== -1) {
        // Remove used backup code
        const newBackupCodes = [...twoFactorData.backupCodes];
        newBackupCodes.splice(backupCodeIndex, 1);
        
        await this.update2FAMetadata(accountId, {
          ...twoFactorData,
          backupCodes: newBackupCodes
        });

        await auditService.log({
          accountId,
          action: '2FA_BACKUP_CODE_USED',
          resource: 'TwoFactor',
          details: JSON.stringify({ remainingCodes: newBackupCodes.length })
        });

        return true;
      }
    }

    await auditService.logSecurityEvent({
      type: 'INVALID_TOKEN',
      accountId,
      details: { reason: '2FA verification failed' }
    });

    return false;
  }

  /**
   * Disable 2FA
   */
  async disableTwoFactor(accountId: string, password: string): Promise<void> {
    // For email accounts, we might want to verify password
    // For now, we'll skip password verification since auth is handled differently
    
    const twoFactorData = await this.get2FAMetadata(accountId);
    
    if (!twoFactorData.enabled) {
      throw new AuthenticationError('2FA is not enabled');
    }

    // Disable 2FA
    await this.update2FAMetadata(accountId, {
      enabled: false
    });

    await auditService.log({
      accountId,
      action: '2FA_DISABLED',
      resource: 'TwoFactor',
      details: JSON.stringify({ method: 'totp' })
    });
  }

  /**
   * Generate new backup codes
   */
  async generateBackupCodes(accountId: string): Promise<string[]> {
    const twoFactorData = await this.get2FAMetadata(accountId);
    
    if (!twoFactorData.enabled) {
      throw new AuthenticationError('2FA is not enabled');
    }

    const backupCodes = this.generateBackupCodesList();
    const encryptedBackupCodes = backupCodes.map(code => encrypt(code));
    
    await this.update2FAMetadata(accountId, {
      ...twoFactorData,
      backupCodes: encryptedBackupCodes
    });

    await auditService.log({
      accountId,
      action: '2FA_BACKUP_CODES_REGENERATED',
      resource: 'TwoFactor',
      details: JSON.stringify({ count: backupCodes.length })
    });

    return backupCodes;
  }

  /**
   * Generate a list of backup codes
   */
  private generateBackupCodesList(count: number = 10): string[] {
    const codes: string[] = [];
    for (let i = 0; i < count; i++) {
      // Generate 8-character alphanumeric codes
      const code = Math.random().toString(36).substring(2, 10).toUpperCase();
      codes.push(code);
    }
    return codes;
  }

  /**
   * Require 2FA for a specific operation
   */
  async requireTwoFactor(accountId: string, token: string, operation: string): Promise<void> {
    const isEnabled = await this.isEnabled(accountId);
    
    if (!isEnabled) {
      // 2FA not enabled, operation allowed
      return;
    }

    // If 2FA is enabled, verify the token
    const isValid = await this.verifyToken(accountId, token);
    if (!isValid) {
      throw new AuthenticationError('Invalid 2FA token');
    }

    await auditService.log({
      accountId,
      action: '2FA_REQUIRED_OPERATION',
      resource: 'TwoFactor',
      details: JSON.stringify({ operation })
    });
  }
}

export const twoFactorService = new TwoFactorService();