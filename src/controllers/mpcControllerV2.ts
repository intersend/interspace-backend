import { Request, Response, NextFunction } from 'express';
import { mpcKeyShareService } from '@/services/mpcKeyShareService';
import { mpcDuoNodeService } from '@/services/mpcDuoNodeService';
import { smartProfileService } from '@/services/smartProfileService';
import { auditService } from '@/services/auditService';
import { twoFactorService } from '@/services/twoFactorService';
import { securityMonitoringService } from '@/services/securityMonitoringService';
import { prisma } from '@/utils/database';
import { ApiError } from '@/utils/errors';
import { config } from '@/utils/config';

// Extend Request to include v2 auth properties
interface AuthenticatedRequest extends Request {
  account?: any;
  session?: any;
  activeProfile?: any;
}

export class MpcControllerV2 {
  /**
   * Generate MPC key for a profile
   * This endpoint returns the cloud public key needed by the iOS client
   */
  async generateKey(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { profileId } = req.body;
      const accountId = req.account!.id;

      // Verify profile ownership
      const profile = await prisma.smartProfile.findFirst({
        where: {
          id: profileId,
          profileAccounts: {
            some: {
              accountId: accountId
            }
          }
        }
      });

      if (!profile) {
        throw new ApiError('Profile not found or access denied', 404);
      }

      // Check if profile already has an MPC key
      const existingKey = await prisma.mpcKeyMapping.findUnique({
        where: { profileId }
      });

      if (existingKey) {
        throw new ApiError('Profile already has an MPC wallet', 409);
      }

      // Get the cloud public key from Silence Labs configuration
      const cloudPublicKey = await mpcKeyShareService.getCloudPublicKey();
      
      // Determine algorithm based on key prefix
      // 01 = Ed25519 (EdDSA), 02/03 = ECDSA
      const algorithm = cloudPublicKey.startsWith('01') ? 'eddsa' : 'ecdsa';

      // Audit log the key generation request
      await auditService.log({
        userId: accountId,
        profileId,
        action: 'MPC_KEY_GENERATION_INITIATED',
        resource: 'mpc_key',
        details: JSON.stringify({
          algorithm
        }),
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });

      res.json({
        success: true,
        data: {
          profileId,
          cloudPublicKey,
          algorithm,
          duoNodeUrl: config.DUO_NODE_URL || process.env.DUO_NODE_URL,
          message: 'Use this cloud public key to initiate key generation from iOS client'
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Generate a verifiable backup of the server's keyshare
   * Requires additional authentication (2FA or similar) in production
   */
  async backupKey(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { profileId, rsaPubkeyPem, label, twoFactorCode } = req.body;
      const accountId = req.account!.id;

      // Verify profile ownership - check if profile belongs to account
      const profile = await prisma.smartProfile.findFirst({
        where: {
          id: profileId,
          profileAccounts: {
            some: {
              accountId: accountId
            }
          }
        }
      });

      if (!profile) {
        throw new ApiError('Profile not found or access denied', 404);
      }

      // Get the Silence Labs key ID for this profile
      const keyMapping = await prisma.mpcKeyMapping.findUnique({
        where: { profileId }
      });

      if (!keyMapping) {
        throw new ApiError('No MPC key found for this profile', 404);
      }

      // Verify 2FA for this critical operation
      // For v2, we use accountId instead of userId
      await twoFactorService.requireTwoFactor(accountId, twoFactorCode, 'MPC_KEY_BACKUP');

      // Generate the backup
      const backup = await mpcKeyShareService.backupKey(
        keyMapping.silenceLabsKeyId,
        rsaPubkeyPem,
        label
      );

      // Audit log the backup operation
      await auditService.log({
        userId: accountId, // Using accountId as userId for compatibility
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
      await securityMonitoringService.checkMpcAbuse(accountId);

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
  async exportKey(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { profileId, clientEncKey, twoFactorCode } = req.body;
      const accountId = req.account!.id;

      // Verify profile ownership - check if profile belongs to account
      const profile = await prisma.smartProfile.findFirst({
        where: {
          id: profileId,
          profileAccounts: {
            some: {
              accountId: accountId
            }
          }
        }
      });

      if (!profile) {
        throw new ApiError('Profile not found or access denied', 404);
      }

      // Get the Silence Labs key ID for this profile
      const keyMapping = await prisma.mpcKeyMapping.findUnique({
        where: { profileId }
      });

      if (!keyMapping) {
        throw new ApiError('No MPC key found for this profile', 404);
      }

      // Verify 2FA for this critical operation
      await twoFactorService.requireTwoFactor(accountId, twoFactorCode, 'MPC_KEY_EXPORT');

      // Export the key
      const exportData = await mpcKeyShareService.exportKey(
        keyMapping.silenceLabsKeyId,
        clientEncKey
      );

      // Audit log the export operation - this is a critical security event
      await auditService.log({
        userId: accountId, // Using accountId as userId for compatibility
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
  async getKeyStatus(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const profileId = req.params.profileId;
      const accountId = req.account!.id;

      if (!profileId) {
        throw new ApiError('Profile ID is required', 400);
      }

      // Verify profile ownership - check if profile belongs to account
      const profile = await prisma.smartProfile.findFirst({
        where: {
          id: profileId,
          profileAccounts: {
            some: {
              accountId: accountId
            }
          }
        }
      });

      if (!profile) {
        throw new ApiError('Profile not found or access denied', 404);
      }

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
  async rotateKey(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { profileId, twoFactorCode } = req.body;
      const accountId = req.account!.id;

      // Verify profile ownership - check if profile belongs to account
      const profile = await prisma.smartProfile.findFirst({
        where: {
          id: profileId,
          profileAccounts: {
            some: {
              accountId: accountId
            }
          }
        }
      });

      if (!profile) {
        throw new ApiError('Profile not found or access denied', 404);
      }

      // Verify 2FA for this critical operation
      await twoFactorService.requireTwoFactor(accountId, twoFactorCode, 'MPC_KEY_ROTATE');

      // TODO: Implement key rotation logic with Silence Labs SDK
      // This would involve:
      // 1. Initiating key refresh protocol
      // 2. Coordinating with client for new shares
      // 3. Updating the key mapping
      // 4. Invalidating old shares

      // Audit log the rotation
      await auditService.log({
        userId: accountId, // Using accountId as userId for compatibility
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

  /**
   * Start MPC key generation session
   * This proxies the WebSocket communication to duo-node
   */
  async startKeyGeneration(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { profileId, p1Messages } = req.body;
      const accountId = req.account!.id;

      // Verify profile ownership
      const profile = await prisma.smartProfile.findFirst({
        where: {
          id: profileId,
          profileAccounts: {
            some: {
              accountId: accountId
            }
          }
        }
      });

      if (!profile) {
        throw new ApiError('Profile not found or access denied', 404);
      }

      // Check if profile already has an MPC key
      const existingKey = await prisma.mpcKeyMapping.findUnique({
        where: { profileId }
      });

      if (existingKey) {
        throw new ApiError('Profile already has an MPC wallet', 409);
      }

      // Start key generation via duo-node
      const result = await mpcDuoNodeService.startKeyGeneration(profileId, p1Messages || []);

      // Get the algorithm from the verifying key
      const cloudPublicKey = await mpcKeyShareService.getCloudPublicKey();
      const algorithm = cloudPublicKey.startsWith('01') ? 'eddsa' : 'ecdsa';
      
      // Store the key mapping
      await mpcKeyShareService.createKeyMapping(
        profileId,
        result.keyId,
        result.publicKey,
        algorithm
      );

      // Update profile with MPC wallet address
      await smartProfileService.updateProfileWalletAddress(profileId, result.address);

      // Audit log
      await auditService.log({
        userId: accountId,
        profileId,
        action: 'MPC_KEY_GENERATION_COMPLETED',
        resource: 'mpc_key',
        details: JSON.stringify({
          keyId: result.keyId,
          algorithm: 'ecdsa',
          address: result.address
        }),
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });

      res.json({
        success: true,
        data: {
          profileId,
          keyId: result.keyId,
          publicKey: result.publicKey,
          address: result.address
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Forward P1 message to duo-node
   */
  async forwardP1Message(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { sessionId, messageType, message } = req.body;
      const accountId = req.account!.id;

      // Get session info to verify ownership
      const session = mpcDuoNodeService.getSessionStatus(sessionId);
      if (!session) {
        throw new ApiError('Session not found', 404);
      }

      // Verify profile ownership
      const profile = await prisma.smartProfile.findFirst({
        where: {
          id: session.profileId,
          profileAccounts: {
            some: {
              accountId: accountId
            }
          }
        }
      });

      if (!profile) {
        throw new ApiError('Unauthorized access to session', 403);
      }

      // Forward message
      await mpcDuoNodeService.forwardP1Message(sessionId, messageType, message);

      res.json({
        success: true,
        message: 'Message forwarded'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Start MPC signing session
   */
  async startSigning(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { profileId, message, p1Messages } = req.body;
      const accountId = req.account!.id;

      // Verify profile ownership
      const profile = await prisma.smartProfile.findFirst({
        where: {
          id: profileId,
          profileAccounts: {
            some: {
              accountId: accountId
            }
          }
        }
      });

      if (!profile) {
        throw new ApiError('Profile not found or access denied', 404);
      }

      // Get key mapping
      const keyMapping = await mpcKeyShareService.getKeyMapping(profileId);
      if (!keyMapping) {
        throw new ApiError('No MPC key found for profile', 404);
      }

      // Start signing via duo-node
      const result = await mpcDuoNodeService.startSigning(
        profileId,
        keyMapping.silenceLabsKeyId,
        message,
        p1Messages || []
      );

      // Audit log
      await auditService.log({
        userId: accountId,
        profileId,
        action: 'MPC_SIGNING_COMPLETED',
        resource: 'mpc_key',
        details: JSON.stringify({
          keyId: keyMapping.silenceLabsKeyId,
          messageHash: message,
          signatureLength: result.signature.length
        }),
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });

      res.json({
        success: true,
        data: {
          profileId,
          signature: result.signature
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get MPC session status
   */
  async getSessionStatus(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { sessionId } = req.params;
      const accountId = req.account!.id;

      //@ts-ignore
      const session = mpcDuoNodeService.getSessionStatus(sessionId);
      if (!session || !session.profileId) {
        throw new ApiError('Session not found', 404);
      }

      // Verify profile ownership
      const profile = await prisma.smartProfile.findFirst({
        where: {
          id: session.profileId,
          profileAccounts: {
            some: {
              accountId: accountId
            }
          }
        }
      });

      if (!profile) {
        throw new ApiError('Unauthorized access to session', 403);
      }

      res.json({
        success: true,
        data: {
          sessionId: session.sessionId,
          profileId: session.profileId,
          type: session.type,
          status: session.status,
          createdAt: session.createdAt,
          expiresAt: session.expiresAt,
          result: session.result,
          error: session.error
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Handle MPC key generation completion from iOS client
   * This is called by the iOS app after successfully generating the MPC wallet with sigpair
   */
  async handleKeyGenerated(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { profileId, keyId, publicKey, address } = req.body;
      const accountId = req.account!.id;

      // Verify profile ownership
      const profile = await prisma.smartProfile.findFirst({
        where: {
          id: profileId,
          profileAccounts: {
            some: {
              accountId: accountId
            }
          }
        }
      });

      if (!profile) {
        throw new ApiError('Profile not found or access denied', 404);
      }

      console.log('[MPC] Key generation notification received', { profileId, address });

      // Update the profile with the MPC wallet address
      const updatedProfile = await prisma.smartProfile.update({
        where: { id: profileId },
        data: { sessionWalletAddress: address }
      });

      // Determine algorithm from public key prefix
      // 01 = Ed25519 (EdDSA), 02/03/04 = ECDSA
      const algorithm = publicKey.startsWith('01') ? 'eddsa' : 'ecdsa';

      // Create key mapping
      await mpcKeyShareService.createKeyMapping(profileId, keyId, publicKey, algorithm);

      // Create or update LinkedAccount for the MPC wallet
      try {
        const existingLinkedAccount = await prisma.linkedAccount.findFirst({
          where: {
            profileId: profileId,
            walletType: 'mpc'
          }
        });

        if (existingLinkedAccount) {
          // Update existing MPC linked account
          await prisma.linkedAccount.update({
            where: { id: existingLinkedAccount.id },
            data: {
              address: address.toLowerCase(),
              isActive: true,
              metadata: JSON.stringify({
                keyId,
                publicKey: publicKey.substring(0, 64),
                algorithm,
                updatedAt: new Date().toISOString()
              })
            }
          });
          console.log('[MPC] Updated existing LinkedAccount', { profileId, address });
        } else {
          // Create new LinkedAccount for MPC wallet
          await prisma.linkedAccount.create({
            data: {
              userId: profile.userId,
              profileId: profileId,
              address: address.toLowerCase(),
              authStrategy: 'mpc',
              walletType: 'mpc',
              customName: 'Session Wallet',
              isPrimary: false,
              isActive: true,
              chainId: 1, // Default to mainnet
              metadata: JSON.stringify({
                keyId,
                publicKey: publicKey.substring(0, 64),
                algorithm,
                createdAt: new Date().toISOString()
              })
            }
          });
          console.log('[MPC] Created new LinkedAccount', { profileId, address });
        }
      } catch (error) {
        console.error('[MPC] Failed to create/update LinkedAccount', { profileId, error });
      }

      // Update Orby cluster with the new wallet address
      try {
        const { orbyService } = await import('@/services/orbyService');
        await orbyService.updateAccountCluster(profileId);
        console.log('[MPC] Orby cluster updated successfully', { profileId });
      } catch (error) {
        // Log error but don't fail the request
        console.error('[MPC] Failed to update Orby cluster', { profileId, error });
      }

      // Audit log
      await auditService.log({
        userId: accountId,
        profileId,
        action: 'MPC_KEY_GENERATED',
        resource: 'mpc_key',
        details: JSON.stringify({
          keyId,
          address,
          algorithm,
          publicKey: publicKey.substring(0, 20) + '...'
        }),
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });

      res.json({
        success: true,
        message: 'MPC key generation processed successfully'
      });
    } catch (error) {
      next(error);
    }
  }
}

export const mpcControllerV2 = new MpcControllerV2();