import axios from 'axios';
import { config } from '../utils/config';
import { GoogleAuth } from 'google-auth-library';
import { encrypt, decrypt } from '../utils/crypto';
import { logger } from '../utils/logger';

class MpcKeyShareService {
  private duoNodeUrl: string;
  private duoNodeAudienceUrl: string;
  private googleAuth: GoogleAuth;

  constructor() {
    this.duoNodeUrl = config.DUO_NODE_URL;
    this.duoNodeAudienceUrl = config.DUO_NODE_AUDIENCE_URL;
    this.googleAuth = new GoogleAuth();
  }

  private async getAuthenticatedClient() {
    if (!this.duoNodeAudienceUrl) {
      logger.warn('DUO_NODE_AUDIENCE_URL is not set. Requests to Duo Node will not be authenticated.');
      return axios; // Return unauthenticated axios if audience is not set
    }

    const client = await this.googleAuth.getIdTokenClient(this.duoNodeAudienceUrl);
    const headers = await client.getRequestHeaders();
    return axios.create({ headers });
  }

  async backupKey(keyId: string, rsaPubkeyPem: string, label: string): Promise<any> {
    try {
      const authenticatedAxios = await this.getAuthenticatedClient();
      const response = await authenticatedAxios.post(`${this.duoNodeUrl}/v3/backup-key`, {
        key_id: keyId,
        rsa_pubkey_pem: rsaPubkeyPem,
        label: label,
      });
      return response.data;
    } catch (error: any) {
      logger.error('Error backing up key:', error);
      throw new Error(`Failed to backup key: ${error.response?.data?.message || error.message}`);
    }
  }

  async exportKey(keyId: string, clientEncKey: string): Promise<any> {
    try {
      const authenticatedAxios = await this.getAuthenticatedClient();
      const response = await authenticatedAxios.post(`${this.duoNodeUrl}/v3/export-key`, {
        key_id: keyId,
        client_enc_key: clientEncKey,
      });
      return response.data;
    } catch (error: any) {
      logger.error('Error exporting key:', error);
      throw new Error(`Failed to export key: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Create a mapping between profileId and Silence Labs keyId
   * This is called after successful key generation on the Duo Server
   */
  async createKeyMapping(profileId: string, silenceLabsKeyId: string, publicKey: string, keyAlgorithm: string = 'ecdsa') {
    const { prisma } = await import('@/utils/database');
    
    // Encrypt the key ID before storing
    const encryptedKeyId = encrypt(silenceLabsKeyId);
    
    return prisma.mpcKeyMapping.create({
      data: {
        profileId,
        silenceLabsKeyId: encryptedKeyId,
        publicKey,
        keyAlgorithm
      }
    });
  }

  /**
   * Get the Silence Labs key ID for a profile
   */
  async getKeyMapping(profileId: string) {
    const { prisma } = await import('@/utils/database');
    
    const mapping = await prisma.mpcKeyMapping.findUnique({
      where: { profileId }
    });
    
    if (mapping) {
      // Decrypt the key ID before returning
      return {
        ...mapping,
        silenceLabsKeyId: decrypt(mapping.silenceLabsKeyId)
      };
    }
    
    return null;
  }

  /**
   * Get the cloud public key for MPC operations
   * This is the server's public key that iOS clients need for key generation
   */
  async getCloudPublicKey(): Promise<string> {
    // Check if we have a configured cloud public key
    if (process.env.SILENCE_CLOUD_PUBLIC_KEY) {
      return process.env.SILENCE_CLOUD_PUBLIC_KEY;
    }
    
    // For local development, fetch the verifying key from sigpair directly
    try {
      // Determine sigpair URL based on environment
      let sigpairUrl: string;
      
      if (process.env.SILENCE_NODE_URL) {
        // Use explicitly configured URL if available
        sigpairUrl = process.env.SILENCE_NODE_URL;
      } else if (process.env.NODE_ENV === 'development') {
        // Local development default
        sigpairUrl = 'http://sigpair:8080';
      } else {
        // Production/staging: Use the deployed sigpair service URL
        // Format: https://sigpair-{env}-{hash}.{region}.run.app
        const env = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';
        const hash = env === 'dev' ? 'e67lrclhcq' : '784862970473'; // Update prod hash when deployed
        sigpairUrl = `https://sigpair-${env}-${hash}-uc.a.run.app`;
      }
      
      // Check if we need to use authenticated requests
      const isLocalDevelopment = process.env.NODE_ENV === 'development' || 
                                 sigpairUrl.includes('localhost') || 
                                 sigpairUrl.includes('sigpair:8080');
      
      if (isLocalDevelopment) {
        // Direct call without authentication for local development
        const response = await axios.get(`${sigpairUrl}/v3/verifying-key`);
        
        if (response.data && response.data.verifying_key) {
          const fullKey = response.data.verifying_key;
          logger.info('Fetched verifying key from sigpair', {
            verifyingKey: fullKey.substring(0, 10) + '...',
            length: fullKey.length,
            prefix: fullKey.substring(0, 2),
            source: sigpairUrl
          });
          
          // Return the full key with prefix - iOS SDK needs it to identify the algorithm
          // Prefix "01" = Ed25519, "02" = ECDSA
          return fullKey;
        }
      } else {
        // Use authenticated client for production
        const authenticatedAxios = await this.getAuthenticatedClient();
        const response = await authenticatedAxios.get(`${sigpairUrl}/v3/verifying-key`);
        
        if (response.data && response.data.verifying_key) {
          logger.info('Fetched verifying key from duo-server');
          return response.data.verifying_key;
        }
      }
    } catch (error) {
      logger.error('Failed to fetch verifying key from sigpair:', error);
    }
    
    // If we can't fetch the key, throw an error
    throw new Error('Failed to fetch cloud public key from sigpair');
  }

  /**
   * Delete the key mapping (used when rotating or deleting keys)
   */
  async deleteKeyMapping(profileId: string) {
    const { prisma } = await import('@/utils/database');
    
    return prisma.mpcKeyMapping.delete({
      where: { profileId }
    });
  }

  // Legacy methods - kept for backward compatibility but will use the new mapping
  async createKeyShare(profileId: string, share: any) {
    // Extract key information from the share
    const keyId = share.key_id || share.keyId;
    const publicKey = share.public_key || share.publicKey;
    
    if (keyId && publicKey) {
      await this.createKeyMapping(profileId, keyId, publicKey);
    }
    
    // Still store in legacy table for now - but encrypt the share
    const { prisma } = await import('@/utils/database');
    const encryptedShare = encrypt(JSON.stringify(share));
    
    return prisma.mpcKeyShare.create({
      data: {
        profileId,
        serverShare: encryptedShare
      }
    });
  }

  async getKeyShare(profileId: string): Promise<any | null> {
    const { prisma } = await import('@/utils/database');
    
    const keyShare = await prisma.mpcKeyShare.findUnique({
      where: { profileId }
    });
    
    if (keyShare) {
      // Decrypt the share before parsing
      const decryptedShare = decrypt(keyShare.serverShare);
      return JSON.parse(decryptedShare);
    }
    
    return null;
  }

  async updateKeyShare(profileId: string, share: any) {
    const { prisma } = await import('@/utils/database');
    
    const encryptedShare = encrypt(JSON.stringify(share));
    
    return prisma.mpcKeyShare.upsert({
      where: { profileId },
      update: {
        serverShare: encryptedShare
      },
      create: {
        profileId,
        serverShare: encryptedShare
      }
    });
  }

  async deleteKeyShare(profileId: string) {
    const { prisma } = await import('@/utils/database');
    
    // Delete both the mapping and the legacy share
    await this.deleteKeyMapping(profileId).catch(() => {});
    
    return prisma.mpcKeyShare.delete({
      where: { profileId }
    });
  }
}

export const mpcKeyShareService = new MpcKeyShareService();
