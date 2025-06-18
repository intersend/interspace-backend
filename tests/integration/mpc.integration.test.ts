import request from 'supertest';
import app from '@/index';
import { prisma } from '@/utils/database';
import { generateAccessToken } from '@/utils/jwt';
import { mpcKeyShareService } from '@/services/mpcKeyShareService';

// Mock server startup to prevent conflicts
jest.mock('@/index', () => {
  const express = require('express');
  const actualIndex = jest.requireActual('@/index');
  return actualIndex.default || actualIndex;
});

jest.mock('@/services/mpcKeyShareService');
jest.mock('google-auth-library', () => ({
  GoogleAuth: jest.fn().mockImplementation(() => ({
    getIdTokenClient: jest.fn().mockResolvedValue({
      getRequestHeaders: jest.fn().mockResolvedValue({
        'Authorization': 'Bearer mock-google-token'
      })
    })
  }))
}));

describe('MPC API Integration Tests', () => {
  let authToken: string;
  let userId: string;
  let profileId: string;

  beforeAll(async () => {
    // Create test user
    const user = await prisma.user.create({
      data: {
        email: 'mpc-test@example.com',
        emailVerified: true
      }
    });
    userId = user.id;

    // Create test profile
    const profile = await prisma.smartProfile.create({
      data: {
        userId,
        name: 'MPC Test Profile',
        sessionWalletAddress: '0x1234567890123456789012345678901234567890'
      }
    });
    profileId = profile.id;

    // Create MPC key mapping
    await prisma.mpcKeyMapping.create({
      data: {
        profileId,
        silenceLabsKeyId: 'test-key-123',
        publicKey: 'test-public-key',
        keyAlgorithm: 'ecdsa'
      }
    });

    // Generate auth token
    authToken = generateAccessToken({ userId, deviceId: 'test-device' });
  });

  afterAll(async () => {
    // Clean up
    await prisma.mpcKeyMapping.deleteMany();
    await prisma.smartProfile.deleteMany();
    await prisma.user.deleteMany();
  });

  describe('POST /api/v1/mpc/backup', () => {
    const backupPayload = {
      profileId: '',
      rsaPubkeyPem: 'RSA_PUBLIC_KEY_PEM_DATA_'.repeat(10), // Make it > 100 chars
      label: 'Test Backup',
      twoFactorCode: '123456'
    };

    beforeEach(() => {
      backupPayload.profileId = profileId;
    });

    it('should successfully backup a key with valid request', async () => {
      const mockBackupResponse = {
        key_id: 'test-key-123',
        algo: 'ecdsa',
        verifiable_backup: 'encrypted-backup-data'
      };

      (mpcKeyShareService.backupKey as jest.Mock).mockResolvedValue(mockBackupResponse);

      const response = await request(app)
        .post('/api/v1/mpc/backup')
        .set('Authorization', `Bearer ${authToken}`)
        .send(backupPayload);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        data: {
          profileId,
          keyId: 'test-key-123',
          algorithm: 'ecdsa',
          verifiableBackup: 'encrypted-backup-data',
          timestamp: expect.any(String)
        }
      });
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app)
        .post('/api/v1/mpc/backup')
        .send(backupPayload);

      expect(response.status).toBe(401);
    });

    it('should return 400 with invalid payload', async () => {
      const response = await request(app)
        .post('/api/v1/mpc/backup')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          profileId,
          // Missing required fields
        });

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
    });

    it('should return 404 for non-existent profile', async () => {
      const response = await request(app)
        .post('/api/v1/mpc/backup')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          ...backupPayload,
          profileId: 'non-existent-profile'
        });

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Profile not found');
    });

    it('should handle rate limiting', async () => {
      // Make multiple requests to trigger rate limit
      const promises = Array(20).fill(null).map(() =>
        request(app)
          .post('/api/v1/mpc/backup')
          .set('Authorization', `Bearer ${authToken}`)
          .send(backupPayload)
      );

      const responses = await Promise.all(promises);
      const rateLimited = responses.some(r => r.status === 429);
      
      expect(rateLimited).toBe(true);
    });
  });

  describe('POST /api/v1/mpc/export', () => {
    const exportPayload = {
      profileId: '',
      clientEncKey: 'Y2xpZW50X2VuY3J5cHRpb25fa2V5XzMyX2J5dGVzXw==', // 32 bytes base64
      twoFactorCode: '123456'
    };

    beforeEach(() => {
      exportPayload.profileId = profileId;
    });

    it('should successfully export a key with valid request', async () => {
      const mockExportResponse = {
        key_id: 'test-key-123',
        server_public_key: [1, 2, 3, 4, 5],
        enc_server_share: 'encrypted-server-share'
      };

      (mpcKeyShareService.exportKey as jest.Mock).mockResolvedValue(mockExportResponse);

      const response = await request(app)
        .post('/api/v1/mpc/export')
        .set('Authorization', `Bearer ${authToken}`)
        .send(exportPayload);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        data: {
          profileId,
          keyId: 'test-key-123',
          serverPublicKey: [1, 2, 3, 4, 5],
          encryptedServerShare: 'encrypted-server-share',
          timestamp: expect.any(String)
        }
      });
    });

    it('should validate clientEncKey length', async () => {
      const response = await request(app)
        .post('/api/v1/mpc/export')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          ...exportPayload,
          clientEncKey: 'invalid-key' // Not 44 chars
        });

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
    });
  });

  describe('GET /api/v1/mpc/status/:profileId', () => {
    it('should return key status for existing key', async () => {
      const response = await request(app)
        .get(`/api/v1/mpc/status/${profileId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        data: {
          profileId,
          hasKey: true,
          keyAlgorithm: 'ecdsa',
          publicKey: 'test-public-key',
          createdAt: expect.any(String)
        }
      });
    });

    it('should return hasKey false for profile without key', async () => {
      // Create profile without key mapping
      const profileWithoutKey = await prisma.smartProfile.create({
        data: {
          userId,
          name: 'Profile Without Key',
          sessionWalletAddress: '0x9999999999999999999999999999999999999999'
        }
      });

      const response = await request(app)
        .get(`/api/v1/mpc/status/${profileWithoutKey.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        data: {
          profileId: profileWithoutKey.id,
          hasKey: false
        }
      });

      // Clean up
      await prisma.smartProfile.delete({ where: { id: profileWithoutKey.id } });
    });
  });

  describe('POST /api/v1/mpc/rotate', () => {
    const rotatePayload = {
      profileId: '',
      twoFactorCode: '123456'
    };

    beforeEach(() => {
      rotatePayload.profileId = profileId;
    });

    it('should initiate key rotation', async () => {
      const response = await request(app)
        .post('/api/v1/mpc/rotate')
        .set('Authorization', `Bearer ${authToken}`)
        .send(rotatePayload);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        message: 'Key rotation initiated',
        data: {
          profileId,
          status: 'rotation_in_progress'
        }
      });
    });
  });

  describe('Security Tests', () => {
    it('should check audit logs are created for sensitive operations', async () => {
      const mockBackupResponse = {
        key_id: 'test-key-123',
        algo: 'ecdsa',
        verifiable_backup: 'encrypted-backup-data'
      };

      (mpcKeyShareService.backupKey as jest.Mock).mockResolvedValue(mockBackupResponse);

      await request(app)
        .post('/api/v1/mpc/backup')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          profileId,
          rsaPubkeyPem: 'RSA_PUBLIC_KEY_PEM_DATA_'.repeat(10),
          label: 'Security Test Backup',
          twoFactorCode: '123456'
        });

      // Check if audit log was created
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          profileId,
          action: 'MPC_KEY_BACKUP'
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      expect(auditLog).toBeTruthy();
      expect(auditLog?.resource).toBe('mpc_key');
      expect(auditLog?.details).toContain('Security Test Backup');
    });

    it('should not expose sensitive error details in production', async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      (mpcKeyShareService.backupKey as jest.Mock).mockRejectedValue(
        new Error('Database connection failed with credentials xyz')
      );

      const response = await request(app)
        .post('/api/v1/mpc/backup')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          profileId,
          rsaPubkeyPem: 'RSA_PUBLIC_KEY_PEM_DATA_'.repeat(10),
          label: 'Test Backup',
          twoFactorCode: '123456'
        });

      expect(response.status).toBe(500);
      expect(response.body.message).not.toContain('credentials');
      expect(response.body.message).toBe('Internal server error');

      process.env.NODE_ENV = originalNodeEnv;
    });
  });
});