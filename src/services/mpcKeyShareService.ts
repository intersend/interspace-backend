import axios from 'axios';
import { config } from '@/utils/config';
import { GoogleAuth } from 'google-auth-library';
import { encrypt, decrypt } from '@/utils/crypto';
import { logger } from '@/utils/logger';

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
    
    return prisma.mpcKeyShare.update({
      where: { profileId },
      data: {
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
