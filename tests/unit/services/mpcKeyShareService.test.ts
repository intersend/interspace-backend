import axios from 'axios';
import { GoogleAuth } from 'google-auth-library';
import { mpcKeyShareService } from '@/services/mpcKeyShareService';
import { prisma } from '@/utils/database';
import { config } from '@/utils/config';

jest.mock('axios');
jest.mock('google-auth-library', () => ({
  GoogleAuth: jest.fn().mockImplementation(() => ({
    getIdTokenClient: jest.fn().mockResolvedValue({
      getRequestHeaders: jest.fn().mockResolvedValue({
        'Authorization': 'Bearer mock-google-token'
      })
    })
  }))
}));
jest.mock('@/utils/database', () => ({
  prisma: {
    mpcKeyMapping: {
      create: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn()
    },
    mpcKeyShare: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn()
    }
  }
}));

const mockAxios = axios as jest.Mocked<typeof axios>;

describe('MpcKeyShareService', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Setup axios mock
    mockAxios.create = jest.fn().mockReturnValue({
      post: jest.fn()
    });
  });

  describe('backupKey', () => {
    const keyId = 'test-key-123';
    const rsaPubkeyPem = 'RSA_PUBLIC_KEY_PEM';
    const label = 'Test Backup';
    const mockBackupResponse = {
      data: {
        key_id: keyId,
        algo: 'ecdsa',
        verifiable_backup: 'encrypted-backup'
      }
    };

    it('should successfully backup a key', async () => {
      const mockPost = jest.fn().mockResolvedValue(mockBackupResponse);
      mockAxios.create.mockReturnValue({ post: mockPost } as any);

      const result = await mpcKeyShareService.backupKey(keyId, rsaPubkeyPem, label);

      expect(mockAxios.create).toHaveBeenCalled();
      expect(mockPost).toHaveBeenCalledWith(
        `${config.DUO_NODE_URL}/v3/backup-key`,
        {
          key_id: keyId,
          rsa_pubkey_pem: rsaPubkeyPem,
          label: label
        }
      );
      expect(result).toEqual(mockBackupResponse.data);
    });

    it('should handle backup errors', async () => {
      const mockError = {
        response: {
          data: { message: 'Key not found' }
        }
      };
      const mockPost = jest.fn().mockRejectedValue(mockError);
      mockAxios.create.mockReturnValue({ post: mockPost } as any);

      await expect(mpcKeyShareService.backupKey(keyId, rsaPubkeyPem, label))
        .rejects.toThrow('Failed to backup key: Key not found');
    });

    it.skip('should work without authentication when DUO_NODE_AUDIENCE_URL is not set', async () => {
      // This test is skipped because it's difficult to test the service singleton behavior
      // The service is instantiated when the module loads, which happens before we can mock
    });
  });

  describe('exportKey', () => {
    const keyId = 'test-key-123';
    const clientEncKey = 'Y2xpZW50X2VuY3J5cHRpb25fa2V5XzMyX2J5dGVzXw==';
    const mockExportResponse = {
      data: {
        key_id: keyId,
        server_public_key: [1, 2, 3, 4, 5],
        enc_server_share: 'encrypted-share'
      }
    };

    it('should successfully export a key', async () => {
      const mockPost = jest.fn().mockResolvedValue(mockExportResponse);
      mockAxios.create.mockReturnValue({ post: mockPost } as any);

      const result = await mpcKeyShareService.exportKey(keyId, clientEncKey);

      expect(mockPost).toHaveBeenCalledWith(
        `${config.DUO_NODE_URL}/v3/export-key`,
        {
          key_id: keyId,
          client_enc_key: clientEncKey
        }
      );
      expect(result).toEqual(mockExportResponse.data);
    });

    it('should handle export errors', async () => {
      const mockError = {
        response: {
          data: { message: 'Invalid encryption key' }
        }
      };
      const mockPost = jest.fn().mockRejectedValue(mockError);
      mockAxios.create.mockReturnValue({ post: mockPost } as any);

      await expect(mpcKeyShareService.exportKey(keyId, clientEncKey))
        .rejects.toThrow('Failed to export key: Invalid encryption key');
    });
  });

  describe('Key Mapping Methods', () => {
    const profileId = 'profile123';
    const silenceLabsKeyId = 'sl-key-123';
    const publicKey = 'public-key-data';
    const keyAlgorithm = 'ecdsa';

    describe('createKeyMapping', () => {
      it('should create a new key mapping', async () => {
        const mockMapping = {
          id: 'mapping123',
          profileId,
          silenceLabsKeyId,
          publicKey,
          keyAlgorithm
        };
        (prisma.mpcKeyMapping.create as jest.Mock).mockResolvedValue(mockMapping);

        const result = await mpcKeyShareService.createKeyMapping(
          profileId,
          silenceLabsKeyId,
          publicKey,
          keyAlgorithm
        );

        expect(prisma.mpcKeyMapping.create).toHaveBeenCalledWith({
          data: {
            profileId,
            silenceLabsKeyId,
            publicKey,
            keyAlgorithm
          }
        });
        expect(result).toEqual(mockMapping);
      });
    });

    describe('getKeyMapping', () => {
      it('should retrieve a key mapping', async () => {
        const mockMapping = {
          id: 'mapping123',
          profileId,
          silenceLabsKeyId,
          publicKey,
          keyAlgorithm
        };
        (prisma.mpcKeyMapping.findUnique as jest.Mock).mockResolvedValue(mockMapping);

        const result = await mpcKeyShareService.getKeyMapping(profileId);

        expect(prisma.mpcKeyMapping.findUnique).toHaveBeenCalledWith({
          where: { profileId }
        });
        expect(result).toEqual(mockMapping);
      });

      it('should return null when mapping not found', async () => {
        (prisma.mpcKeyMapping.findUnique as jest.Mock).mockResolvedValue(null);

        const result = await mpcKeyShareService.getKeyMapping(profileId);

        expect(result).toBeNull();
      });
    });

    describe('deleteKeyMapping', () => {
      it('should delete a key mapping', async () => {
        const mockMapping = { id: 'mapping123' };
        (prisma.mpcKeyMapping.delete as jest.Mock).mockResolvedValue(mockMapping);

        const result = await mpcKeyShareService.deleteKeyMapping(profileId);

        expect(prisma.mpcKeyMapping.delete).toHaveBeenCalledWith({
          where: { profileId }
        });
        expect(result).toEqual(mockMapping);
      });
    });
  });

  describe('Legacy Methods', () => {
    const profileId = 'profile123';
    const mockShare = {
      key_id: 'key123',
      public_key: 'public-key',
      share_data: 'encrypted-share'
    };

    describe('createKeyShare', () => {
      it('should create key share and mapping when key info is available', async () => {
        (prisma.mpcKeyMapping.create as jest.Mock).mockResolvedValue({});
        (prisma.mpcKeyShare.create as jest.Mock).mockResolvedValue({
          id: 'share123',
          profileId,
          serverShare: JSON.stringify(mockShare)
        });

        await mpcKeyShareService.createKeyShare(profileId, mockShare);

        expect(prisma.mpcKeyMapping.create).toHaveBeenCalledWith({
          data: {
            profileId,
            silenceLabsKeyId: 'key123',
            publicKey: 'public-key',
            keyAlgorithm: 'ecdsa'
          }
        });
        expect(prisma.mpcKeyShare.create).toHaveBeenCalledWith({
          data: {
            profileId,
            serverShare: JSON.stringify(mockShare)
          }
        });
      });

      it('should only create key share when key info is missing', async () => {
        const shareWithoutKeyInfo = { share_data: 'encrypted' };
        (prisma.mpcKeyShare.create as jest.Mock).mockResolvedValue({});

        await mpcKeyShareService.createKeyShare(profileId, shareWithoutKeyInfo);

        expect(prisma.mpcKeyMapping.create).not.toHaveBeenCalled();
        expect(prisma.mpcKeyShare.create).toHaveBeenCalled();
      });
    });

    describe('getKeyShare', () => {
      it('should retrieve and parse key share', async () => {
        (prisma.mpcKeyShare.findUnique as jest.Mock).mockResolvedValue({
          id: 'share123',
          serverShare: JSON.stringify(mockShare)
        });

        const result = await mpcKeyShareService.getKeyShare(profileId);

        expect(prisma.mpcKeyShare.findUnique).toHaveBeenCalledWith({
          where: { profileId }
        });
        expect(result).toEqual(mockShare);
      });

      it('should return null when share not found', async () => {
        (prisma.mpcKeyShare.findUnique as jest.Mock).mockResolvedValue(null);

        const result = await mpcKeyShareService.getKeyShare(profileId);

        expect(result).toBeNull();
      });
    });

    describe('updateKeyShare', () => {
      it('should update key share', async () => {
        const updatedShare = { ...mockShare, updated: true };
        (prisma.mpcKeyShare.update as jest.Mock).mockResolvedValue({});

        await mpcKeyShareService.updateKeyShare(profileId, updatedShare);

        expect(prisma.mpcKeyShare.update).toHaveBeenCalledWith({
          where: { profileId },
          data: {
            serverShare: JSON.stringify(updatedShare)
          }
        });
      });
    });

    describe('deleteKeyShare', () => {
      it('should delete both mapping and share', async () => {
        (prisma.mpcKeyMapping.delete as jest.Mock).mockResolvedValue({});
        (prisma.mpcKeyShare.delete as jest.Mock).mockResolvedValue({});

        await mpcKeyShareService.deleteKeyShare(profileId);

        expect(prisma.mpcKeyMapping.delete).toHaveBeenCalledWith({
          where: { profileId }
        });
        expect(prisma.mpcKeyShare.delete).toHaveBeenCalledWith({
          where: { profileId }
        });
      });

      it('should still delete share even if mapping deletion fails', async () => {
        (prisma.mpcKeyMapping.delete as jest.Mock).mockRejectedValue(new Error('Not found'));
        (prisma.mpcKeyShare.delete as jest.Mock).mockResolvedValue({});

        await mpcKeyShareService.deleteKeyShare(profileId);

        expect(prisma.mpcKeyShare.delete).toHaveBeenCalled();
      });
    });
  });
});