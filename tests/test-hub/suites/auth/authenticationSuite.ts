import { TestSuite, TestContext } from '../../types';
import { AuthHelper } from '../../utils/AuthHelper';
import { assertResponse, assertErrorResponse, getErrorMessage } from '../../utils/ApiClient';
import { faker } from '@faker-js/faker';
import jwt from 'jsonwebtoken';

export const authenticationSuite: TestSuite = {
  name: 'Authentication',
  description: 'Comprehensive authentication endpoint testing',
  tags: ['auth', 'critical', 'security'],
  priority: 'critical',
  endpoints: ['/api/v1/auth/*'],
  
  async setup(context: TestContext) {
    // Create test users for various scenarios
    await context.createUser({
      email: 'test.auth@example.com',
      password: 'TestPassword123!'
    });
    
    await context.createUser({
      email: 'test.2fa@example.com',
      password: 'TestPassword123!',
      enable2FA: true
    });
    
    await context.createUser({
      walletAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fA49'
    });
  },

  async teardown(context: TestContext) {
    // Cleanup handled by TestContext
  },

  tests: [
    {
      name: 'POST /auth/authenticate - Guest authentication success',
      async fn(context: TestContext) {
        const authToken = `guest-${faker.string.uuid()}`;
        
        const client = context.createApiClient();
        const response = await client.post('/api/v1/auth/authenticate', {
          authToken,
          authStrategy: 'guest'
        });

        assertResponse(response, 200);
        
        // Validate response structure
        const { data } = response.data;
        if (!data.accessToken || !data.refreshToken) {
          throw new Error('Missing tokens in response');
        }
        
        // Validate JWT structure
        const decoded = jwt.decode(data.accessToken) as any;
        if (!decoded.userId) {
          throw new Error('No user ID in token');
        }
        
        // Measure authentication time
        if (response.duration > 500) {
          throw new Error(`Authentication too slow: ${response.duration}ms`);
        }
      }
    },

    {
      name: 'POST /auth/authenticate - Invalid auth strategy',
      async fn(context: TestContext) {
        const client = context.createApiClient();
        
        try {
          await client.post('/api/v1/auth/authenticate', {
            authToken: 'invalid-token',
            authStrategy: 'invalid-strategy'
          });
          throw new Error('Should not authenticate with wrong password');
        } catch (error) {
          assertErrorResponse(error, 401, 'Invalid credentials');
        }
      }
    },

    {
      name: 'POST /auth/authenticate - Missing fields validation',
      async fn(context: TestContext) {
        const client = context.createApiClient();
        
        // Test missing email
        try {
          await client.post('/api/v1/auth/authenticate', {
            password: 'password',
            type: 'email'
          });
          throw new Error('Should require email field');
        } catch (error) {
          assertErrorResponse(error, 400);
        }

        // Test missing password
        try {
          await client.post('/api/v1/auth/authenticate', {
            email: 'test@example.com',
            type: 'email'
          });
          throw new Error('Should require password field');
        } catch (error) {
          assertErrorResponse(error, 400);
        }

        // Test missing type
        try {
          await client.post('/api/v1/auth/authenticate', {
            email: 'test@example.com',
            password: 'password'
          });
          throw new Error('Should require type field');
        } catch (error) {
          assertErrorResponse(error, 400);
        }
      }
    },

    {
      name: 'POST /auth/refresh - Token refresh success',
      async fn(context: TestContext) {
        const user = await context.createUser();
        const { accessToken, refreshToken } = await context.authenticate(user);
        
        const client = context.createApiClient();
        const response = await client.post('/api/v1/auth/refresh', {
          refreshToken
        });

        assertResponse(response, 200);
        
        const { data } = response.data;
        if (!data.accessToken || !data.refreshToken) {
          throw new Error('Missing tokens in refresh response');
        }
        
        // Verify new tokens are different
        if (data.accessToken === accessToken) {
          throw new Error('Access token should be rotated');
        }
        if (data.refreshToken === refreshToken) {
          throw new Error('Refresh token should be rotated');
        }
      }
    },

    {
      name: 'POST /auth/refresh - Invalid refresh token',
      async fn(context: TestContext) {
        const client = context.createApiClient();
        
        try {
          await client.post('/api/v1/auth/refresh', {
            refreshToken: 'invalid-refresh-token'
          });
          throw new Error('Should not accept invalid refresh token');
        } catch (error) {
          assertErrorResponse(error, 401);
        }
      }
    },

    {
      name: 'POST /auth/refresh - Expired refresh token',
      async fn(context: TestContext) {
        const user = await context.createUser();
        const expiredRefreshToken = jwt.sign(
          { userId: user.id, type: 'refresh' },
          process.env.JWT_REFRESH_SECRET || 'test-refresh-secret',
          { expiresIn: '-1h' }
        );
        
        const client = context.createApiClient();
        
        try {
          await client.post('/api/v1/auth/refresh', {
            refreshToken: expiredRefreshToken
          });
          throw new Error('Should not accept expired refresh token');
        } catch (error) {
          assertErrorResponse(error, 401, /expired/i);
        }
      }
    },

    {
      name: 'POST /auth/logout - Logout success',
      async fn(context: TestContext) {
        const user = await context.createUser();
        const { accessToken } = await context.authenticate(user);
        
        const client = context.createApiClient(accessToken);
        const response = await client.post('/api/v1/auth/logout');
        
        assertResponse(response, 200);
        
        // Verify token is blacklisted
        try {
          await client.get('/api/v1/auth/me');
          throw new Error('Token should be invalid after logout');
        } catch (error) {
          assertErrorResponse(error, 401);
        }
      }
    },

    {
      name: 'POST /auth/logout-all - Logout all devices',
      async fn(context: TestContext) {
        const user = await context.createUser();
        
        // Create multiple sessions
        const tokens1 = await context.authenticate(user);
        const tokens2 = await context.authenticate(user);
        const tokens3 = await context.authenticate(user);
        
        // Logout all from one session
        const client = context.createApiClient(tokens1.accessToken);
        const response = await client.post('/api/v1/auth/logout-all');
        
        assertResponse(response, 200);
        
        // Verify all tokens are invalid
        for (const token of [tokens1.accessToken, tokens2.accessToken, tokens3.accessToken]) {
          const testClient = context.createApiClient(token);
          try {
            await testClient.get('/api/v1/auth/me');
            throw new Error('All tokens should be invalid after logout-all');
          } catch (error) {
            assertErrorResponse(error, 401);
          }
        }
      }
    },

    {
      name: 'GET /auth/me - Get current user',
      async fn(context: TestContext) {
        const user = await context.createUser({
          email: faker.internet.email()
        });
        const { accessToken } = await context.authenticate(user);
        
        const client = context.createApiClient(accessToken);
        const response = await client.get('/api/v1/auth/me');
        
        assertResponse(response, 200);
        
        const { data } = response.data;
        if (data.id !== user.id) {
          throw new Error('User ID mismatch');
        }
        if (data.email !== user.email) {
          throw new Error('Email mismatch');
        }
      }
    },

    {
      name: 'GET /auth/me - Unauthorized without token',
      async fn(context: TestContext) {
        const client = context.createApiClient();
        
        try {
          await client.get('/api/v1/auth/me');
          throw new Error('Should require authentication');
        } catch (error) {
          assertErrorResponse(error, 401);
        }
      }
    },

    {
      name: 'GET /auth/devices - List user devices',
      async fn(context: TestContext) {
        const user = await context.createUser();
        
        // Create multiple sessions from different devices
        const { accessToken } = await context.authenticate(user);
        await context.authenticate(user);
        await context.authenticate(user);
        
        const client = context.createApiClient(accessToken);
        const response = await client.get('/api/v1/auth/devices');
        
        assertResponse(response, 200);
        
        const { data } = response.data;
        if (!Array.isArray(data) || data.length < 3) {
          throw new Error('Should have at least 3 active devices');
        }
        
        // Validate device structure
        for (const device of data) {
          if (!device.id || !device.lastActiveAt || !device.createdAt) {
            throw new Error('Invalid device structure');
          }
        }
      }
    },

    {
      name: 'DELETE /auth/devices/:id - Deactivate device',
      async fn(context: TestContext) {
        const user = await context.createUser();
        const { accessToken: token1 } = await context.authenticate(user);
        const { accessToken: token2 } = await context.authenticate(user);
        
        // Get devices
        const client1 = context.createApiClient(token1);
        const devicesResponse = await client1.get('/api/v1/auth/devices');
        const devices = devicesResponse.data.data;
        
        // Find the other device
        const otherDevice = devices.find((d: any) => d.isCurrentDevice === false);
        if (!otherDevice) {
          throw new Error('Could not find other device');
        }
        
        // Deactivate other device
        const response = await client1.delete(`/api/v1/auth/devices/${otherDevice.id}`);
        assertResponse(response, 200);
        
        // Verify other token is invalid
        const client2 = context.createApiClient(token2);
        try {
          await client2.get('/api/v1/auth/me');
          throw new Error('Deactivated device token should be invalid');
        } catch (error) {
          assertErrorResponse(error, 401);
        }
        
        // Verify current token still works
        const meResponse = await client1.get('/api/v1/auth/me');
        assertResponse(meResponse, 200);
      }
    },

    {
      name: 'POST /auth/link-auth - Link additional auth method',
      async fn(context: TestContext) {
        const user = await context.createUser({
          email: faker.internet.email(),
          password: 'TestPassword123!'
        });
        const { accessToken } = await context.authenticate(user);
        
        const client = context.createApiClient(accessToken);
        const walletAddress = faker.finance.ethereumAddress();
        
        const response = await client.post('/api/v1/auth/link-auth', {
          type: 'wallet',
          identifier: walletAddress
        });
        
        assertResponse(response, 200);
        
        // Verify wallet is linked
        const userResponse = await client.get('/api/v1/auth/me');
        if (userResponse.data.data.walletAddress !== walletAddress.toLowerCase()) {
          throw new Error('Wallet address not properly linked');
        }
      }
    },

    {
      name: 'GET /auth/blacklist-stats - Token blacklist statistics',
      async fn(context: TestContext) {
        const user = await context.createUser();
        const { accessToken } = await context.authenticate(user);
        
        // Logout to add token to blacklist
        const client = context.createApiClient(accessToken);
        await client.post('/api/v1/auth/logout');
        
        // Get stats (requires new auth)
        const newTokens = await context.authenticate(user);
        const statsClient = context.createApiClient(newTokens.accessToken);
        const response = await statsClient.get('/api/v1/auth/blacklist-stats');
        
        assertResponse(response, 200);
        
        const { data } = response.data;
        if (typeof data.totalBlacklisted !== 'number') {
          throw new Error('Invalid blacklist stats structure');
        }
      }
    },

    {
      name: 'Authentication with 2FA enabled',
      async fn(context: TestContext) {
        const authHelper = new AuthHelper(context);
        const user = await context.createUser({
          email: faker.internet.email(),
          password: 'SecurePassword123!',
          enable2FA: true
        });
        
        const client = context.createApiClient();
        
        // First auth attempt should require 2FA
        const response = await client.post('/api/v1/auth/authenticate', {
          email: user.email,
          password: user.password,
          type: 'email'
        });
        
        // Should get 200 but with requires2FA flag
        assertResponse(response, 200);
        
        const { data } = response.data;
        if (!data.requires2FA) {
          throw new Error('Should require 2FA verification');
        }
        
        // Complete 2FA verification
        await authHelper.verify2FA(user, client);
      }
    },

    {
      name: 'Rate limiting on authentication endpoints',
      tags: ['security', 'rate-limit'],
      async fn(context: TestContext) {
        const authHelper = new AuthHelper(context);
        const client = context.createApiClient();
        
        await authHelper.testAuthRateLimiting(client);
      }
    },

    {
      name: 'Complete authentication flow test',
      tags: ['integration'],
      async fn(context: TestContext) {
        const authHelper = new AuthHelper(context);
        const user = await context.createUser({
          email: faker.internet.email(),
          password: 'TestPassword123!'
        });
        
        const client = context.createApiClient();
        await authHelper.testCompleteAuthFlow(user, client);
      }
    },

    {
      name: 'Token security validations',
      tags: ['security'],
      async fn(context: TestContext) {
        const user = await context.createUser();
        const client = context.createApiClient();
        
        // Test manipulated token
        const manipulatedToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxMjM0NTYiLCJpYXQiOjE1MTYyMzkwMjJ9.invalid';
        client.setAccessToken(manipulatedToken);
        
        try {
          await client.get('/api/v1/auth/me');
          throw new Error('Should reject manipulated token');
        } catch (error) {
          assertErrorResponse(error, 401);
        }
        
        // Test token with wrong signature
        const wrongSignatureToken = jwt.sign(
          { userId: user.id, type: 'access' },
          'wrong-secret',
          { expiresIn: '15m' }
        );
        
        client.setAccessToken(wrongSignatureToken);
        
        try {
          await client.get('/api/v1/auth/me');
          throw new Error('Should reject token with wrong signature');
        } catch (error) {
          assertErrorResponse(error, 401);
        }
      }
    }
  ]
};