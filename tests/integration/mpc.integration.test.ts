import request from 'supertest';
import express from 'express';
import { generateAccessToken } from '@/utils/jwt';
import { mpcKeyShareService } from '@/services/mpcKeyShareService';
import mpcRoutes from '@/routes/mpcRoutes';
import { errorHandler } from '@/middleware/errorHandler';

// We need the real prisma for test setup
const { prisma } = jest.requireActual('@/utils/database');

// Mock authentication middleware for testing
jest.mock('@/middleware/auth', () => ({
  authenticate: (req: any, res: any, next: any) => {
    // Extract user ID from token for test purposes
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      try {
        const jwt = require('jsonwebtoken');
        const payload = jwt.verify(token, process.env.JWT_SECRET || 'test-jwt-secret');
        req.user = { userId: payload.userId, deviceId: payload.deviceId };
        next();
      } catch (err) {
        res.status(401).json({ message: 'Invalid token' });
      }
    } else {
      res.status(401).json({ message: 'No token provided' });
    }
  },
  requireProfile: (req: any, res: any, next: any) => {
    req.profile = { id: req.params.profileId };
    next();
  }
}));

// Mock rate limiting middleware for testing
jest.mock('@/middleware/rateLimiter', () => ({
  passwordResetRateLimit: (req: any, res: any, next: any) => next(),
  transactionRateLimit: (req: any, res: any, next: any) => next(),
  apiRateLimit: (req: any, res: any, next: any) => next()
}));

// Create a test app instance
const app = express();
app.use(express.json());
app.use('/api/v1/mpc', mpcRoutes);
app.use(errorHandler);

// Set test environment
process.env.NODE_ENV = 'test';

jest.mock('@/services/mpcKeyShareService');
jest.mock('@/services/smartProfileService', () => ({
  smartProfileService: {
    getProfileById: jest.fn().mockImplementation((profileId, userId) => {
      // Simulate profile not found for certain tests
      if (profileId === 'non-existent-profile') {
        const error = new Error('Profile not found');
        (error as any).statusCode = 404;
        throw error;
      }
      return Promise.resolve({
        id: profileId,
        userId,
        name: 'Test Profile',
        sessionWalletAddress: '0x1234567890123456789012345678901234567890'
      });
    })
  }
}));
jest.mock('@/services/twoFactorService', () => ({
  twoFactorService: {
    requireTwoFactor: jest.fn().mockResolvedValue(true)
  }
}));
jest.mock('@/services/securityMonitoringService', () => ({
  securityMonitoringService: {
    checkMpcAbuse: jest.fn().mockResolvedValue(true)
  }
}));
jest.mock('@/services/auditService', () => ({
  auditService: {
    log: jest.fn().mockResolvedValue(true)
  }
}));
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
    authToken = generateAccessToken(userId, 'test-device');
  });

  afterAll(async () => {
    // Clean up in proper order to respect foreign key constraints
    await prisma.mpcKeyMapping.deleteMany();
    await prisma.mpcKeyShare.deleteMany();
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
      // Ensure user still exists before creating profile
      const userExists = await prisma.user.findUnique({ where: { id: userId } });
      if (!userExists) {
        // Re-create user if it was cleaned up
        const user = await prisma.user.create({
          data: {
            email: 'mpc-test-no-key@example.com',
            emailVerified: true
          }
        });
        userId = user.id;
      }

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