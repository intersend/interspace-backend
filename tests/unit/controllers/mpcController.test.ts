import { Request, Response, NextFunction } from 'express';
import { mpcController } from '@/controllers/mpcController';
import { mpcKeyShareService } from '@/services/mpcKeyShareService';
import { smartProfileService } from '@/services/smartProfileService';
import { auditService } from '@/services/auditService';
import { twoFactorService } from '@/services/twoFactorService';
import { securityMonitoringService } from '@/services/securityMonitoringService';
import { prisma } from '@/utils/database';
import { ApiError } from '@/utils/errors';
import { config } from '@/utils/config';

jest.mock('@/services/mpcKeyShareService', () => ({
  mpcKeyShareService: {
    backupKey: jest.fn(),
    exportKey: jest.fn(),
    createKeyMapping: jest.fn(),
    getKeyMapping: jest.fn(),
    deleteKeyMapping: jest.fn()
  }
}));

jest.mock('@/services/smartProfileService', () => ({
  smartProfileService: {
    getProfile: jest.fn(),
    getProfileById: jest.fn()
  }
}));

jest.mock('@/services/auditService', () => ({
  auditService: {
    log: jest.fn()
  }
}));

jest.mock('@/utils/database', () => ({
  prisma: {
    mpcKeyMapping: {
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn()
    }
  }
}));

jest.mock('@/services/twoFactorService', () => ({
  twoFactorService: {
    requireTwoFactor: jest.fn()
  }
}));

jest.mock('@/services/securityMonitoringService', () => ({
  securityMonitoringService: {
    checkMpcAbuse: jest.fn()
  }
}));

describe('MpcController', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    req = {
      body: {},
      params: {},
      user: { userId: 'user123' },
      ip: '127.0.0.1',
      get: jest.fn().mockReturnValue('test-user-agent')
    };
    res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis()
    };
    next = jest.fn();
    jest.clearAllMocks();
  });

  describe('backupKey', () => {
    const mockProfile = { id: 'profile123', name: 'Test Profile' };
    const mockKeyMapping = {
      silenceLabsKeyId: 'key123',
      keyAlgorithm: 'ecdsa'
    };
    const mockBackupResponse = {
      key_id: 'key123',
      algo: 'ecdsa',
      verifiable_backup: 'encrypted-backup-data'
    };

    beforeEach(() => {
      req.body = {
        profileId: 'profile123',
        rsaPubkeyPem: 'RSA_PUBLIC_KEY_PEM_DATA',
        label: 'Test Backup',
        twoFactorCode: '123456'
      };
    });

    it('should successfully backup a key', async () => {
      (smartProfileService.getProfileById as jest.Mock).mockResolvedValue(mockProfile);
      (prisma.mpcKeyMapping.findUnique as jest.Mock).mockResolvedValue(mockKeyMapping);
      (twoFactorService.requireTwoFactor as jest.Mock).mockResolvedValue(true);
      (mpcKeyShareService.backupKey as jest.Mock).mockResolvedValue(mockBackupResponse);
      (auditService.log as jest.Mock).mockResolvedValue(undefined);

      await mpcController.backupKey(req as Request, res as Response, next);

      expect(smartProfileService.getProfileById).toHaveBeenCalledWith('profile123', 'user123');
      expect(prisma.mpcKeyMapping.findUnique).toHaveBeenCalledWith({
        where: { profileId: 'profile123' }
      });
      expect(mpcKeyShareService.backupKey).toHaveBeenCalledWith(
        'key123',
        'RSA_PUBLIC_KEY_PEM_DATA',
        'Test Backup'
      );
      expect(auditService.log).toHaveBeenCalledWith({
        userId: 'user123',
        profileId: 'profile123',
        action: 'MPC_KEY_BACKUP',
        resource: 'mpc_key',
        details: JSON.stringify({
          keyId: 'key123',
          label: 'Test Backup',
          algorithm: 'ecdsa'
        }),
        ipAddress: '127.0.0.1',
        userAgent: 'test-user-agent'
      });
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          profileId: 'profile123',
          keyId: 'key123',
          algorithm: 'ecdsa',
          verifiableBackup: 'encrypted-backup-data',
          timestamp: expect.any(String)
        }
      });
    });

    it('should throw error if profile not found', async () => {
      (smartProfileService.getProfileById as jest.Mock).mockRejectedValue(new ApiError('Profile not found', 404));

      await mpcController.backupKey(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      const error = (next as jest.Mock).mock.calls[0][0];
      expect(error.message).toBe('Profile not found');
      expect(error.statusCode).toBe(404);
    });

    it('should throw error if no MPC key found', async () => {
      (smartProfileService.getProfileById as jest.Mock).mockResolvedValue(mockProfile);
      (prisma.mpcKeyMapping.findUnique as jest.Mock).mockResolvedValue(null);

      await mpcController.backupKey(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      const error = (next as jest.Mock).mock.calls[0][0];
      expect(error.message).toBe('No MPC key found for this profile');
      expect(error.statusCode).toBe(404);
    });

    it('should require 2FA in production when bypass login is disabled', async () => {
      const originalBypassLogin = config.BYPASS_LOGIN;
      const originalNodeEnv = config.NODE_ENV;
      config.BYPASS_LOGIN = false;
      config.NODE_ENV = 'production';
      req.body.twoFactorCode = undefined;

      (smartProfileService.getProfileById as jest.Mock).mockResolvedValue(mockProfile);
      (prisma.mpcKeyMapping.findUnique as jest.Mock).mockResolvedValue(mockKeyMapping);
      (twoFactorService.requireTwoFactor as jest.Mock).mockRejectedValue(
        new ApiError('Two-factor authentication required', 403)
      );

      await mpcController.backupKey(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      const error = (next as jest.Mock).mock.calls[0][0];
      expect(error.message).toBe('Two-factor authentication required');
      expect(error.statusCode).toBe(403);

      config.BYPASS_LOGIN = originalBypassLogin;
      config.NODE_ENV = originalNodeEnv;
    });
  });

  describe('exportKey', () => {
    const mockProfile = { id: 'profile123', name: 'Test Profile' };
    const mockKeyMapping = {
      silenceLabsKeyId: 'key123',
      keyAlgorithm: 'ecdsa'
    };
    const mockExportResponse = {
      key_id: 'key123',
      server_public_key: [1, 2, 3, 4, 5],
      enc_server_share: 'encrypted-server-share'
    };

    beforeEach(() => {
      req.body = {
        profileId: 'profile123',
        clientEncKey: 'Y2xpZW50X2VuY3J5cHRpb25fa2V5XzMyX2J5dGVzXw==', // 32 bytes base64
        twoFactorCode: '123456'
      };
    });

    it('should successfully export a key', async () => {
      (smartProfileService.getProfileById as jest.Mock).mockResolvedValue(mockProfile);
      (prisma.mpcKeyMapping.findUnique as jest.Mock).mockResolvedValue(mockKeyMapping);
      (twoFactorService.requireTwoFactor as jest.Mock).mockResolvedValue(true);
      (securityMonitoringService.checkMpcAbuse as jest.Mock).mockResolvedValue(true);
      (mpcKeyShareService.exportKey as jest.Mock).mockResolvedValue(mockExportResponse);
      (auditService.log as jest.Mock).mockResolvedValue(undefined);

      await mpcController.exportKey(req as Request, res as Response, next);

      expect(mpcKeyShareService.exportKey).toHaveBeenCalledWith(
        'key123',
        'Y2xpZW50X2VuY3J5cHRpb25fa2V5XzMyX2J5dGVzXw=='
      );
      expect(auditService.log).toHaveBeenCalledWith({
        userId: 'user123',
        profileId: 'profile123',
        action: 'MPC_KEY_EXPORT',
        resource: 'mpc_key',
        details: JSON.stringify({
          keyId: 'key123',
          algorithm: 'ecdsa',
          severity: 'critical'
        }),
        ipAddress: '127.0.0.1',
        userAgent: 'test-user-agent'
      });
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          profileId: 'profile123',
          keyId: 'key123',
          serverPublicKey: [1, 2, 3, 4, 5],
          encryptedServerShare: 'encrypted-server-share',
          timestamp: expect.any(String)
        }
      });
    });
  });

  describe('getKeyStatus', () => {
    const mockProfile = { id: 'profile123', name: 'Test Profile' };
    const mockKeyMapping = {
      silenceLabsKeyId: 'key123',
      keyAlgorithm: 'ecdsa',
      publicKey: 'public-key-data',
      createdAt: new Date('2024-01-01')
    };

    beforeEach(() => {
      req.params = { profileId: 'profile123' };
    });

    it('should return key status when key exists', async () => {
      (smartProfileService.getProfileById as jest.Mock).mockResolvedValue(mockProfile);
      (prisma.mpcKeyMapping.findUnique as jest.Mock).mockResolvedValue(mockKeyMapping);

      await mpcController.getKeyStatus(req as Request, res as Response, next);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          profileId: 'profile123',
          hasKey: true,
          keyAlgorithm: 'ecdsa',
          createdAt: new Date('2024-01-01'),
          publicKey: 'public-key-data'
        }
      });
    });

    it('should return hasKey false when no key exists', async () => {
      (smartProfileService.getProfileById as jest.Mock).mockResolvedValue(mockProfile);
      (prisma.mpcKeyMapping.findUnique as jest.Mock).mockResolvedValue(null);

      await mpcController.getKeyStatus(req as Request, res as Response, next);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          profileId: 'profile123',
          hasKey: false,
          keyAlgorithm: undefined,
          createdAt: undefined,
          publicKey: undefined
        }
      });
    });
  });

  describe('rotateKey', () => {
    const mockProfile = { id: 'profile123', name: 'Test Profile' };

    beforeEach(() => {
      req.body = {
        profileId: 'profile123',
        twoFactorCode: '123456'
      };
    });

    it('should initiate key rotation', async () => {
      (smartProfileService.getProfileById as jest.Mock).mockResolvedValue(mockProfile);
      (auditService.log as jest.Mock).mockResolvedValue(undefined);

      await mpcController.rotateKey(req as Request, res as Response, next);

      expect(auditService.log).toHaveBeenCalledWith({
        userId: 'user123',
        profileId: 'profile123',
        action: 'MPC_KEY_ROTATE',
        resource: 'mpc_key',
        details: JSON.stringify({
          reason: 'user_initiated',
          severity: 'high'
        }),
        ipAddress: '127.0.0.1',
        userAgent: 'test-user-agent'
      });
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Key rotation initiated',
        data: {
          profileId: 'profile123',
          status: 'rotation_in_progress'
        }
      });
    });
  });
});