import { Request, Response, NextFunction } from 'express';
import { smartProfileService } from '@/services/smartProfileService';
import { orbyService } from '@/services/orbyService';
import { mpcKeyShareService } from '@/services/mpcKeyShareService';
import { auditService } from '@/services/auditService';
import { prisma } from '@/utils/database';
import { ApiError } from '@/utils/errors';
import { logger } from '@/utils/logger';

export class MpcWebhookController {
  /**
   * Handle MPC key generation completion webhook
   * This is called by the duo-node when MPC key generation is complete
   */
  async handleKeyGenerated(req: Request, res: Response, next: NextFunction) {
    try {
      const { profileId, keyId, publicKey, address } = req.body;

      if (!profileId || !keyId || !publicKey || !address) {
        throw new ApiError('Missing required fields', 400);
      }

      logger.info('MPC key generation webhook received', { profileId, address });

      // Update the profile with the actual MPC wallet address
      const updatedProfile = await prisma.smartProfile.update({
        where: { id: profileId },
        data: { sessionWalletAddress: address }
      });

      // Create key mapping
      await mpcKeyShareService.createKeyMapping(profileId, keyId, publicKey, 'ecdsa');

      // Update Orby cluster with the new wallet address
      try {
        await orbyService.updateAccountCluster(profileId);
        logger.info('Orby cluster updated successfully', { profileId });
      } catch (error) {
        // Log error but don't fail the webhook
        logger.error('Failed to update Orby cluster', { profileId, error });
      }

      // Audit log
      await auditService.log({
        profileId,
        action: 'MPC_KEY_GENERATED',
        resource: 'mpc_key',
        details: JSON.stringify({
          keyId,
          address,
          publicKey: publicKey.substring(0, 20) + '...'
        })
      });

      res.json({
        success: true,
        message: 'MPC key generation processed successfully'
      });
    } catch (error) {
      logger.error('MPC webhook error:', error);
      next(error);
    }
  }

  /**
   * Handle MPC key share update webhook
   * This is called when key shares are updated (e.g., after backup/restore)
   */
  async handleKeyShareUpdate(req: Request, res: Response, next: NextFunction) {
    try {
      const { profileId, keyId, operation } = req.body;

      if (!profileId || !keyId || !operation) {
        throw new ApiError('Missing required fields', 400);
      }

      logger.info('MPC key share update webhook received', { profileId, operation });

      // Audit log
      await auditService.log({
        profileId,
        action: 'MPC_KEY_SHARE_UPDATE',
        resource: 'mpc_key',
        details: JSON.stringify({
          keyId,
          operation
        })
      });

      res.json({
        success: true,
        message: 'Key share update processed successfully'
      });
    } catch (error) {
      logger.error('MPC webhook error:', error);
      next(error);
    }
  }
}

export const mpcWebhookController = new MpcWebhookController();