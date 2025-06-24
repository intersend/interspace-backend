import request from 'supertest';
import { app } from '@/app';
import { prisma } from '@/utils/database';
import { sessionWalletService } from '@/blockchain/sessionWalletService';
import { mpcKeyShareService } from '@/services/mpcKeyShareService';
import { authService } from '@/services/authService';
import { twoFactorService } from '@/services/twoFactorService';
import { config } from '@/utils/config';
import jwt from 'jsonwebtoken';

describe('MPC Wallet Integration Flow', () => {
  let authToken: string;
  let userId: string;
  let profileId: string;
  const testEmail = 'mpc-test@example.com';

  beforeAll(async () => {
    // Setup test user and authentication
    const user = await prisma.user.create({
      data: {
        email: testEmail,
        isEmailVerified: true,
        twoFactorEnabled: false
      }
    });
    userId = user.id;

    // Generate auth token
    authToken = jwt.sign(
      { userId: user.id, email: user.email },
      config.JWT_SECRET,
      { expiresIn: '1h' }
    );
  });

  afterAll(async () => {
    // Cleanup
    await prisma.transaction.deleteMany({ where: { profileId } });
    await prisma.mpcKeyMapping.deleteMany({ where: { profileId } });
    await prisma.mpcKeyShare.deleteMany({ where: { profileId } });
    await prisma.smartProfile.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  describe('Complete MPC Wallet Lifecycle', () => {
    it('should create profile with MPC wallet', async () => {
      // 1. Create profile with client share (simulated)
      const clientShare = {
        p1_key_share: { secret_share: 'mock-secret', public_key: 'mock-public' },
        public_key: '0x04' + '1'.repeat(128),
        address: '0x1234567890123456789012345678901234567890'
      };

      const response = await request(app)
        .post('/api/v2/profiles')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'MPC Test Profile',
          clientShare: JSON.stringify(clientShare),
          developmentMode: false
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.sessionWalletAddress).toBe(clientShare.address);

      profileId = response.body.data.id;
    });

    it('should get MPC key status', async () => {
      const response = await request(app)
        .get(`/api/v1/mpc/status/${profileId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        profileId,
        hasKey: true,
        keyAlgorithm: 'ecdsa'
      });
    });

    it('should create verifiable backup with 2FA', async () => {
      // Enable 2FA for the user
      await prisma.user.update({
        where: { id: userId },
        data: { twoFactorEnabled: true }
      });

      // Mock 2FA verification
      jest.spyOn(twoFactorService, 'requireTwoFactor').mockResolvedValueOnce(true);

      const rsaPublicKey = `-----BEGIN RSA PUBLIC KEY-----
MIIBCgKCAQEAp69leU/BZJUTrrdUht/fb+REtPuNIGCH8lV+98p3oZDFi7u1XLOA
ZDxanD0pqnWrZJ0DNM2g7Ve/5/zIAQAUgIrkhu7DSFQjg5OgQH2TnzDdWLofVILq
UW42YkZ+smXaur8LsvgghSAQQng8fVYfoAZC/QPVHe9PX3BG4rvuaRziXP0DcX0I
NGuzk7r++6FgDwaN8oyy/1CvCUNLfEmXytqBl9xy5ElipZAguRZVybHE2wndCWln
zC3lwmPppr8tiWMYNlJO3VjL3wgchYzoZUXBSUa3ZyocI7jLYp9qNelEWlbukYBY
TrtUcVKIxp3OfyZ0edqcR8xKD1wBQKRzLQIDAQAB
-----END RSA PUBLIC KEY-----`;

      const response = await request(app)
        .post('/api/v1/mpc/backup')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          profileId,
          rsaPubkeyPem: rsaPublicKey,
          label: 'Test Backup',
          twoFactorCode: '123456'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('verifiableBackup');
      expect(response.body.data.keyId).toBeDefined();
      expect(response.body.data.algorithm).toBe('ecdsa');
    });

    it('should export key with enhanced security', async () => {
      // Mock 2FA verification
      jest.spyOn(twoFactorService, 'requireTwoFactor').mockResolvedValueOnce(true);

      const clientEncKey = Buffer.from(new Uint8Array(32)).toString('base64'); // 32 bytes

      const response = await request(app)
        .post('/api/v1/mpc/export')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          profileId,
          clientEncKey,
          twoFactorCode: '123456'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('encryptedServerShare');
      expect(response.body.data).toHaveProperty('serverPublicKey');
      expect(Array.isArray(response.body.data.serverPublicKey)).toBe(true);
    });

    it('should handle key rotation request', async () => {
      // Mock 2FA verification
      jest.spyOn(twoFactorService, 'requireTwoFactor').mockResolvedValueOnce(true);

      const response = await request(app)
        .post('/api/v1/mpc/rotate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          profileId,
          twoFactorCode: '123456'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Key rotation initiated');
      expect(response.body.data.status).toBe('rotation_in_progress');
    });

    it('should enforce rate limiting on MPC operations', async () => {
      // Make multiple requests to trigger rate limit
      const requests = Array(11).fill(null).map(() =>
        request(app)
          .post('/api/v1/mpc/export')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            profileId,
            clientEncKey: Buffer.from(new Uint8Array(32)).toString('base64'),
            twoFactorCode: '123456'
          })
      );

      const responses = await Promise.all(requests);
      const rateLimited = responses.some(res => res.status === 429);
      
      expect(rateLimited).toBe(true);
    });
  });

  describe('Error Scenarios', () => {
    it('should reject backup without valid RSA key', async () => {
      const response = await request(app)
        .post('/api/v1/mpc/backup')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          profileId,
          rsaPubkeyPem: 'invalid-rsa-key',
          label: 'Test Backup'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should reject export with invalid client encryption key', async () => {
      const response = await request(app)
        .post('/api/v1/mpc/export')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          profileId,
          clientEncKey: 'invalid-key',
          twoFactorCode: '123456'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should reject operations on non-existent profile', async () => {
      const response = await request(app)
        .get('/api/v1/mpc/status/non-existent-profile')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });

    it('should reject unauthorized access to other user profiles', async () => {
      // Create another user and profile
      const otherUser = await prisma.user.create({
        data: {
          email: 'other@example.com',
          isEmailVerified: true
        }
      });

      const otherProfile = await prisma.smartProfile.create({
        data: {
          userId: otherUser.id,
          name: 'Other Profile',
          sessionWalletAddress: '0x' + '9'.repeat(40),
          isActive: false
        }
      });

      const response = await request(app)
        .get(`/api/v1/mpc/status/${otherProfile.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);

      // Cleanup
      await prisma.smartProfile.delete({ where: { id: otherProfile.id } });
      await prisma.user.delete({ where: { id: otherUser.id } });
    });
  });

  describe('WebSocket MPC Operations', () => {
    it('should handle WebSocket key generation flow', async () => {
      // This would require WebSocket testing setup
      // Placeholder for WebSocket integration tests
      expect(true).toBe(true);
    });

    it('should handle WebSocket signature generation', async () => {
      // This would require WebSocket testing setup
      // Placeholder for WebSocket integration tests
      expect(true).toBe(true);
    });
  });
});