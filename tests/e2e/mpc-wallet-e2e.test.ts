import request from 'supertest';
import WebSocket from 'ws';
import { app } from '@/app';
import { prisma } from '@/utils/database';
import jwt from 'jsonwebtoken';
import { config } from '@/utils/config';
import axios from 'axios';
import { OAuth2Client } from 'google-auth-library';

// Mock external services
jest.mock('axios');
jest.mock('google-auth-library');

describe('MPC Wallet End-to-End Tests', () => {
  let authToken: string;
  let userId: string;
  let profileId: string;
  let wsClient: WebSocket;
  let mockDuoNodeClient: jest.Mocked<typeof axios>;
  let mockOAuth2Client: jest.Mocked<OAuth2Client>;

  beforeAll(async () => {
    // Setup test user
    const user = await prisma.user.create({
      data: {
        email: 'e2e-mpc@example.com',
        isEmailVerified: true,
        twoFactorEnabled: true,
        twoFactorSecret: 'test-secret'
      }
    });
    userId = user.id;

    // Generate auth token
    authToken = jwt.sign(
      { userId: user.id, email: user.email },
      config.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Setup mocks
    mockDuoNodeClient = axios as jest.Mocked<typeof axios>;
    mockOAuth2Client = new OAuth2Client() as jest.Mocked<OAuth2Client>;
  });

  afterAll(async () => {
    if (wsClient) {
      wsClient.close();
    }
    await prisma.$disconnect();
  });

  describe('Complete MPC Wallet User Journey', () => {
    it('should complete full MPC wallet lifecycle from creation to transaction', async () => {
      // Step 1: iOS client initiates profile creation with MPC wallet
      console.log('Step 1: Creating profile with MPC wallet...');
      
      // Simulate client-side key generation (would happen on iOS)
      const clientKeyGeneration = simulateClientKeyGeneration();
      
      const createProfileResponse = await request(app)
        .post('/api/v2/profiles')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'E2E MPC Wallet',
          clientShare: JSON.stringify(clientKeyGeneration.clientShare),
          developmentMode: false
        });

      expect(createProfileResponse.status).toBe(201);
      profileId = createProfileResponse.body.data.id;
      
      console.log(`Profile created with ID: ${profileId}`);

      // Step 2: Establish WebSocket connection for MPC operations
      console.log('Step 2: Establishing WebSocket connection...');
      
      await new Promise<void>((resolve, reject) => {
        wsClient = new WebSocket(`ws://localhost:${process.env.PORT || 3000}/ws/mpc`);
        
        wsClient.on('open', () => {
          console.log('WebSocket connected');
          wsClient.send(JSON.stringify({
            type: 'auth',
            token: authToken
          }));
        });

        wsClient.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'auth_success') {
            resolve();
          }
        });

        wsClient.on('error', reject);
      });

      // Step 3: Test transaction signing flow
      console.log('Step 3: Testing transaction signing...');
      
      const transactionRequest = {
        profileId,
        to: '0x742d35Cc6634C0532925a3b844Bc9e7595f62794',
        value: '1000000000000000000', // 1 ETH
        data: '0x',
        chainId: 1
      };

      // Simulate iOS client signing request via WebSocket
      const signingPromise = new Promise((resolve, reject) => {
        wsClient.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'sign_request') {
            // iOS would perform client-side signing here
            const clientSignature = simulateClientSigning(message.payload);
            wsClient.send(JSON.stringify({
              type: 'sign_response',
              requestId: message.requestId,
              signature: clientSignature
            }));
          } else if (message.type === 'transaction_complete') {
            resolve(message.payload);
          } else if (message.type === 'error') {
            reject(new Error(message.message));
          }
        });
      });

      // Backend initiates transaction
      const transactionResponse = await request(app)
        .post('/api/v2/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .send(transactionRequest);

      expect(transactionResponse.status).toBe(202);

      // Wait for transaction completion
      const transactionResult = await signingPromise;
      expect(transactionResult).toHaveProperty('hash');
      
      console.log(`Transaction completed with hash: ${(transactionResult as any).hash}`);

      // Step 4: Test backup functionality
      console.log('Step 4: Testing backup functionality...');
      
      // Mock Duo Node response for backup
      mockDuoNodeClient.post = jest.fn().mockResolvedValue({
        status: 200,
        data: {
          key_id: 'test-key-id',
          algo: 'ecdsa',
          verifiable_backup: 'encrypted-backup-data'
        }
      });

      const backupResponse = await request(app)
        .post('/api/v1/mpc/backup')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          profileId,
          rsaPubkeyPem: generateTestRSAKey(),
          label: 'E2E Test Backup',
          twoFactorCode: '123456'
        });

      expect(backupResponse.status).toBe(200);
      expect(backupResponse.body.data).toHaveProperty('verifiableBackup');
      
      console.log('Backup created successfully');

      // Step 5: Test key rotation
      console.log('Step 5: Testing key rotation...');
      
      // Simulate key rotation via WebSocket
      const rotationPromise = new Promise((resolve, reject) => {
        wsClient.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'rotate_request') {
            // iOS would perform client-side rotation here
            const newClientShare = simulateClientKeyRotation(message.payload);
            wsClient.send(JSON.stringify({
              type: 'rotate_response',
              requestId: message.requestId,
              newShare: newClientShare
            }));
          } else if (message.type === 'rotation_complete') {
            resolve(message.payload);
          }
        });
      });

      const rotationResponse = await request(app)
        .post('/api/v1/mpc/rotate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          profileId,
          twoFactorCode: '123456'
        });

      expect(rotationResponse.status).toBe(200);
      
      // Wait for rotation completion
      await rotationPromise;
      console.log('Key rotation completed successfully');

      // Step 6: Test export functionality
      console.log('Step 6: Testing export functionality...');
      
      // Mock Duo Node response for export
      mockDuoNodeClient.post = jest.fn().mockResolvedValue({
        status: 200,
        data: {
          key_id: 'test-key-id',
          server_public_key: Array(32).fill(1),
          enc_server_share: 'encrypted-server-share'
        }
      });

      const exportResponse = await request(app)
        .post('/api/v1/mpc/export')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          profileId,
          clientEncKey: Buffer.from(new Uint8Array(32)).toString('base64'),
          twoFactorCode: '123456'
        });

      expect(exportResponse.status).toBe(200);
      expect(exportResponse.body.data).toHaveProperty('encryptedServerShare');
      
      console.log('Export completed successfully');
    });

    it('should handle concurrent MPC operations correctly', async () => {
      // Test that multiple MPC operations don't interfere with each other
      const operations = Array(5).fill(null).map((_, index) => 
        request(app)
          .get(`/api/v1/mpc/status/${profileId}`)
          .set('Authorization', `Bearer ${authToken}`)
      );

      const responses = await Promise.all(operations);
      
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.data.hasKey).toBe(true);
      });
    });

    it('should maintain security throughout the flow', async () => {
      // Test unauthorized access is blocked
      const unauthorizedResponse = await request(app)
        .get(`/api/v1/mpc/status/${profileId}`)
        .set('Authorization', 'Bearer invalid-token');

      expect(unauthorizedResponse.status).toBe(401);

      // Test 2FA is enforced for sensitive operations
      const noTwoFactorResponse = await request(app)
        .post('/api/v1/mpc/export')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          profileId,
          clientEncKey: Buffer.from(new Uint8Array(32)).toString('base64')
          // Missing twoFactorCode
        });

      expect(noTwoFactorResponse.status).toBe(403);
    });
  });

  describe('Error Recovery Scenarios', () => {
    it('should handle network failures gracefully', async () => {
      // Simulate network failure during MPC operation
      mockDuoNodeClient.post = jest.fn().mockRejectedValue(new Error('Network error'));

      const response = await request(app)
        .post('/api/v1/mpc/backup')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          profileId,
          rsaPubkeyPem: generateTestRSAKey(),
          label: 'Network Test',
          twoFactorCode: '123456'
        });

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });

    it('should handle WebSocket disconnection and reconnection', async () => {
      // Force disconnect
      wsClient.close();

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 100));

      // Reconnect
      await new Promise<void>((resolve) => {
        wsClient = new WebSocket(`ws://localhost:${process.env.PORT || 3000}/ws/mpc`);
        wsClient.on('open', () => {
          wsClient.send(JSON.stringify({
            type: 'auth',
            token: authToken
          }));
        });
        wsClient.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'auth_success') {
            resolve();
          }
        });
      });

      // Should be able to continue operations
      const response = await request(app)
        .get(`/api/v1/mpc/status/${profileId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
    });
  });

  describe('Performance and Load Tests', () => {
    it('should handle multiple concurrent wallet creations', async () => {
      const concurrentCreations = 10;
      const creationPromises = Array(concurrentCreations).fill(null).map((_, index) =>
        request(app)
          .post('/api/v2/profiles')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            name: `Load Test Profile ${index}`,
            clientShare: JSON.stringify(simulateClientKeyGeneration().clientShare),
            developmentMode: false
          })
      );

      const responses = await Promise.all(creationPromises);
      const successCount = responses.filter(r => r.status === 201).length;
      
      expect(successCount).toBeGreaterThan(0);
      console.log(`Successfully created ${successCount}/${concurrentCreations} wallets concurrently`);

      // Cleanup
      for (const response of responses) {
        if (response.status === 201) {
          await prisma.smartProfile.delete({
            where: { id: response.body.data.id }
          });
        }
      }
    });

    it('should complete MPC operations within acceptable time limits', async () => {
      const startTime = Date.now();
      
      const response = await request(app)
        .get(`/api/v1/mpc/status/${profileId}`)
        .set('Authorization', `Bearer ${authToken}`);

      const duration = Date.now() - startTime;
      
      expect(response.status).toBe(200);
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
      
      console.log(`MPC status check completed in ${duration}ms`);
    });
  });
});

// Helper functions

function simulateClientKeyGeneration() {
  return {
    clientShare: {
      p1_key_share: {
        secret_share: 'mock-secret-share',
        public_key: 'mock-public-key'
      },
      public_key: '0x' + '1'.repeat(128),
      address: '0x' + '2'.repeat(40)
    }
  };
}

function simulateClientSigning(payload: any) {
  // In real implementation, this would use Silence Labs SDK
  return {
    r: '0x' + '3'.repeat(64),
    s: '0x' + '4'.repeat(64),
    v: 27
  };
}

function simulateClientKeyRotation(payload: any) {
  return {
    p1_key_share: {
      secret_share: 'mock-rotated-secret',
      public_key: 'mock-rotated-public'
    },
    public_key: '0x' + '5'.repeat(128)
  };
}

function generateTestRSAKey() {
  return `-----BEGIN RSA PUBLIC KEY-----
MIIBCgKCAQEAp69leU/BZJUTrrdUht/fb+REtPuNIGCH8lV+98p3oZDFi7u1XLOA
ZDxanD0pqnWrZJ0DNM2g7Ve/5/zIAQAUgIrkhu7DSFQjg5OgQH2TnzDdWLofVILq
UW42YkZ+smXaur8LsvgghSAQQng8fVYfoAZC/QPVHe9PX3BG4rvuaRziXP0DcX0I
NGuzk7r++6FgDwaN8oyy/1CvCUNLfEmXytqBl9xy5ElipZAguRZVybHE2wndCWln
zC3lwmPppr8tiWMYNlJO3VjL3wgchYzoZUXBSUa3ZyocI7jLYp9qNelEWlbukYBY
TrtUcVKIxp3OfyZ0edqcR8xKD1wBQKRzLQIDAQAB
-----END RSA PUBLIC KEY-----`;
}