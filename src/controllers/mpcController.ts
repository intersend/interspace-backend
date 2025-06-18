import { Request, Response, NextFunction } from 'express';
import { mpcKeyShareService } from '@/services/mpcKeyShareService';
import { smartProfileService } from '@/services/smartProfileService';
import { auditService } from '@/services/auditService';
import { twoFactorService } from '@/services/twoFactorService';
import { securityMonitoringService } from '@/services/securityMonitoringService';
import { prisma } from '@/utils/database';
import { ApiError } from '@/utils/errors';
import { config } from '@/utils/config';

export class MpcController {
  /**
   * Generate a verifiable backup of the server's keyshare
   * Requires additional authentication (2FA or similar) in production
   */
  async backupKey(req: Request, res: Response, next: NextFunction) {
    try {
      const { profileId, rsaPubkeyPem, label, twoFactorCode } = req.body;
      const userId = req.user!.userId!;

      // Verify profile ownership - getProfileById throws if not found
      await smartProfileService.getProfileById(profileId, userId);

      // Get the Silence Labs key ID for this profile
      const keyMapping = await prisma.mpcKeyMapping.findUnique({
        where: { profileId }
      });

      if (!keyMapping) {
        throw new ApiError('No MPC key found for this profile', 404);
      }

      // Verify 2FA for this critical operation
      await twoFactorService.requireTwoFactor(userId, twoFactorCode, 'MPC_KEY_BACKUP');

      // Generate the backup
      const backup = await mpcKeyShareService.backupKey(
        keyMapping.silenceLabsKeyId,
        rsaPubkeyPem,
        label
      );

      // Audit log the backup operation
      await auditService.log({
        userId,
        profileId,
        action: 'MPC_KEY_BACKUP',
        resource: 'mpc_key',
        details: JSON.stringify({
          keyId: keyMapping.silenceLabsKeyId,
          label,
          algorithm: keyMapping.keyAlgorithm
        }),
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });

      // Check for MPC operation abuse
      await securityMonitoringService.checkMpcAbuse(userId);

      res.json({
        success: true,
        data: {
          profileId,
          keyId: backup.key_id,
          algorithm: backup.algo,
          verifiableBackup: backup.verifiable_backup,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Export the full private key of the MPC wallet
   * Requires additional authentication and should be used sparingly
   */
  async exportKey(req: Request, res: Response, next: NextFunction) {
    try {
      const { profileId, clientEncKey, twoFactorCode } = req.body;
      const userId = req.user!.userId!;

      // Verify profile ownership - getProfileById throws if not found
      await smartProfileService.getProfileById(profileId, userId);

      // Get the Silence Labs key ID for this profile
      const keyMapping = await prisma.mpcKeyMapping.findUnique({
        where: { profileId }
      });

      if (!keyMapping) {
        throw new ApiError('No MPC key found for this profile', 404);
      }

      // Verify 2FA for this critical operation
      await twoFactorService.requireTwoFactor(userId, twoFactorCode, 'MPC_KEY_EXPORT');

      // Export the key
      const exportData = await mpcKeyShareService.exportKey(
        keyMapping.silenceLabsKeyId,
        clientEncKey
      );

      // Audit log the export operation - this is a critical security event
      await auditService.log({
        userId,
        profileId,
        action: 'MPC_KEY_EXPORT',
        resource: 'mpc_key',
        details: JSON.stringify({
          keyId: keyMapping.silenceLabsKeyId,
          algorithm: keyMapping.keyAlgorithm,
          severity: 'critical'
        }),
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });

      res.json({
        success: true,
        data: {
          profileId,
          keyId: exportData.key_id,
          serverPublicKey: exportData.server_public_key,
          encryptedServerShare: exportData.enc_server_share,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get the status of MPC key for a profile
   */
  async getKeyStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const profileId = req.params.profileId;
      const userId = req.user!.userId!;

      if (!profileId) {
        throw new ApiError('Profile ID is required', 400);
      }

      // Verify profile ownership - getProfileById throws if not found
      await smartProfileService.getProfileById(profileId, userId);

      // Get the key mapping
      const keyMapping = await prisma.mpcKeyMapping.findUnique({
        where: { profileId }
      });

      res.json({
        success: true,
        data: {
          profileId,
          hasKey: !!keyMapping,
          keyAlgorithm: keyMapping?.keyAlgorithm,
          createdAt: keyMapping?.createdAt,
          publicKey: keyMapping?.publicKey
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Initiate key rotation for a profile
   * This will trigger the key refresh protocol between client and server
   */
  async rotateKey(req: Request, res: Response, next: NextFunction) {
    try {
      const { profileId, twoFactorCode } = req.body;
      const userId = req.user!.userId!;

      // Verify profile ownership - getProfileById throws if not found
      await smartProfileService.getProfileById(profileId, userId);

      // Verify 2FA for this critical operation
      await twoFactorService.requireTwoFactor(userId, twoFactorCode, 'MPC_KEY_ROTATE');

      // TODO: Implement key rotation logic with Silence Labs SDK
      // This would involve:
      // 1. Initiating key refresh protocol
      // 2. Coordinating with client for new shares
      // 3. Updating the key mapping
      // 4. Invalidating old shares

      // Audit log the rotation
      await auditService.log({
        userId,
        profileId,
        action: 'MPC_KEY_ROTATE',
        resource: 'mpc_key',
        details: JSON.stringify({
          reason: 'user_initiated',
          severity: 'high'
        }),
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });

      res.json({
        success: true,
        message: 'Key rotation initiated',
        data: {
          profileId,
          status: 'rotation_in_progress'
        }
      });
    } catch (error) {
      next(error);
    }
  }
}

export const mpcController = new MpcController();