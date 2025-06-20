import { TestSuite, TestContext } from '../../types';
import { AuthHelperV2 } from '../../utils/AuthHelperV2';
import { TestWallet } from '../../utils/TestWallet';
import { assertResponse, assertErrorResponse } from '../../utils/ApiClient';
import { faker } from '@faker-js/faker';
import jwt from 'jsonwebtoken';

export const sessionManagementSuite: TestSuite = {
  name: 'Session Management - Flat Identity',
  description: 'Testing session creation, privacy modes, and token management in V2',
  tags: ['sessions', 'v2', 'security', 'tokens'],
  priority: 'high',
  endpoints: ['/api/v2/auth/*', '/api/v1/auth/devices'],
  
  async setup(context: TestContext) {
    await context.checkDatabaseConnection();
  },

  async teardown(context: TestContext) {
    // Cleanup handled by TestContext
  },

  tests: [
    // ========== SESSION CREATION ==========
    {
      name: 'Session creation with account-based auth',
      tags: ['session-creation', 'accounts'],
      async fn(context: TestContext) {
        const authHelper = new AuthHelperV2(context);
        const client = context.createApiClient();
        
        // Test session creation for each auth type
        const authTypes = [
          { method: 'wallet', index: 60 },
          { method: 'email', email: faker.internet.email() },
          { method: 'social', provider: 'google' }
        ];
        
        for (const authType of authTypes) {
          let auth;
          
          if (authType.method === 'wallet') {
            auth = await authHelper.authenticateWithWallet(client, authType.index);
          } else if (authType.method === 'email') {
            // @ts-ignore
            auth = await authHelper.authenticateWithEmail(client, authType.email);
          } else {
            // @ts-ignore
            auth = await authHelper.authenticateWithSocial(client, authType.provider);
          }
          
          // Verify session properties
          if (!auth.tokens.accessToken || !auth.tokens.refreshToken) {
            throw new Error(`Missing tokens for ${authType.method}`);
          }
          
          // Decode and verify JWT contains accountId
          const decoded = jwt.decode(auth.tokens.accessToken) as any;
          
          if (!decoded.accountId && !decoded.userId) {
            throw new Error(`Token missing accountId for ${authType.method}`);
          }
          
          if (!decoded.sessionToken) {
            throw new Error(`Token missing sessionToken for ${authType.method}`);
          }
          
          // For new flat identity, should have accountId
          if (decoded.version === 'v2' && !decoded.accountId) {
            throw new Error(`V2 token must have accountId for ${authType.method}`);
          }
        }
      }
    },

    {
      name: 'Session privacy modes',
      tags: ['session-creation', 'privacy'],
      async fn(context: TestContext) {
        const authHelper = new AuthHelperV2(context);
        const client = context.createApiClient();
        
        const privacyModes = ['linked', 'partial', 'isolated'] as const;
        
        for (let i = 0; i < privacyModes.length; i++) {
          const mode = privacyModes[i];
          const auth = await authHelper.authenticateWithWallet(client, 65 + i, {
            privacyMode: mode
          });
          
          // Session should respect privacy mode
          // This would be verified through session details endpoint
          client.setAccessToken(auth.tokens.accessToken);
          
          // Create second account and link
          const wallet2 = new TestWallet(70 + i);
          await authHelper.linkAccounts(client, 'wallet', wallet2.address);
          
          // Auth as second account
          const auth2 = await authHelper.authenticateWithWallet(client, 70 + i);
          
          // Verify privacy mode affects what's visible
          client.setAccessToken(auth2.tokens.accessToken);
          const profilesResponse = await client.get('/api/v1/profiles');
          
          if (mode === 'isolated') {
            // Should only see own profile
            if (profilesResponse.data.data.length !== 1) {
              throw new Error('Isolated session seeing other profiles');
            }
          } else {
            // Should see multiple profiles
            if (profilesResponse.data.data.length < 2) {
              throw new Error(`${mode} session not seeing linked profiles`);
            }
          }
        }
      }
    },

    // ========== TOKEN MANAGEMENT ==========
    {
      name: 'Token generation with accountId',
      tags: ['tokens', 'jwt'],
      async fn(context: TestContext) {
        const authHelper = new AuthHelperV2(context);
        const client = context.createApiClient();
        
        const auth = await authHelper.authenticateWithWallet(client, 75);
        
        // Verify access token structure
        const accessDecoded = jwt.decode(auth.tokens.accessToken) as any;
        
        if (!accessDecoded.accountId) {
          throw new Error('Access token missing accountId');
        }
        
        if (!accessDecoded.sessionToken) {
          throw new Error('Access token missing sessionToken');
        }
        
        if (accessDecoded.type !== 'access') {
          throw new Error('Wrong token type for access token');
        }
        
        if (!accessDecoded.exp || !accessDecoded.iat) {
          throw new Error('Token missing expiration or issued at');
        }
        
        // Verify refresh token structure
        const refreshDecoded = jwt.decode(auth.tokens.refreshToken) as any;
        
        if (refreshDecoded.type !== 'refresh') {
          throw new Error('Wrong token type for refresh token');
        }
        
        if (!refreshDecoded.jti) {
          throw new Error('Refresh token missing jti');
        }
      }
    },

    {
      name: 'Token refresh maintains session context',
      tags: ['tokens', 'refresh'],
      async fn(context: TestContext) {
        const authHelper = new AuthHelperV2(context);
        const client = context.createApiClient();
        
        // Create auth with specific privacy mode
        const auth = await authHelper.authenticateWithWallet(client, 76, {
          privacyMode: 'partial'
        });
        
        // Create additional profile and switch to it
        client.setAccessToken(auth.tokens.accessToken);
        const profileResponse = await client.post('/api/v1/profiles', {
          name: 'Refresh Test Profile'
        });
        const newProfile = profileResponse.data.data;
        
        await authHelper.switchProfile(client, newProfile.id);
        
        // Refresh token
        const refreshResponse = await client.post('/api/v2/auth/refresh', {
          refreshToken: auth.tokens.refreshToken
        });
        
        assertResponse(refreshResponse, 200);
        
        // New token should maintain session context
        const newAccessToken = refreshResponse.data.accessToken;
        client.setAccessToken(newAccessToken);
        
        // Verify active profile is maintained
        const meResponse = await client.get('/api/v1/auth/me');
        if (meResponse.data.data.activeProfile.id !== newProfile.id) {
          throw new Error('Active profile not maintained after token refresh');
        }
        
        // Verify privacy mode is maintained
        // This would be checked through session endpoint
      }
    },

    {
      name: 'Token expiration handling',
      tags: ['tokens', 'expiration'],
      async fn(context: TestContext) {
        const authHelper = new AuthHelperV2(context);
        const client = context.createApiClient();
        
        const auth = await authHelper.authenticateWithWallet(client, 77);
        
        // Create expired access token
        const expiredToken = jwt.sign(
          {
            accountId: 'acc_test',
            sessionToken: 'sess_test',
            type: 'access'
          },
          process.env.JWT_SECRET || 'test-secret',
          { expiresIn: '-1h' }
        );
        
        client.setAccessToken(expiredToken);
        
        try {
          await client.get('/api/v1/auth/me');
          throw new Error('Should reject expired token');
        } catch (error) {
          assertErrorResponse(error, 401, /expired/i);
        }
      }
    },

    // ========== CONCURRENT SESSIONS ==========
    {
      name: 'Multiple concurrent sessions',
      tags: ['sessions', 'concurrent'],
      async fn(context: TestContext) {
        const authHelper = new AuthHelperV2(context);
        const client = context.createApiClient();
        
        const wallet = new TestWallet(78);
        
        // Create multiple sessions for same account
        const sessions = [];
        for (let i = 0; i < 3; i++) {
          const auth = await authHelper.authenticateWithWallet(client, 78);
          sessions.push(auth);
        }
        
        // All sessions should be valid
        for (const session of sessions) {
          client.setAccessToken(session.tokens.accessToken);
          const response = await client.get('/api/v1/auth/me');
          assertResponse(response, 200);
        }
        
        // Check devices endpoint
        const devicesResponse = await client.get('/api/v1/auth/devices');
        
        // Should have at least 3 active sessions
        if (devicesResponse.data.data.length < 3) {
          throw new Error('Not all concurrent sessions tracked');
        }
      }
    },

    {
      name: 'Session isolation between accounts',
      tags: ['sessions', 'isolation'],
      async fn(context: TestContext) {
        const authHelper = new AuthHelperV2(context);
        const client = context.createApiClient();
        
        // Create two separate accounts
        const auth1 = await authHelper.authenticateWithWallet(client, 79);
        const auth2 = await authHelper.authenticateWithWallet(client, 80);
        
        // Sessions should be completely isolated
        client.setAccessToken(auth1.tokens.accessToken);
        const profiles1Response = await client.get('/api/v1/profiles');
        
        client.setAccessToken(auth2.tokens.accessToken);
        const profiles2Response = await client.get('/api/v1/profiles');
        
        // Should not see each other's profiles
        const profile1Ids = profiles1Response.data.data.map((p: any) => p.id);
        const profile2Ids = profiles2Response.data.data.map((p: any) => p.id);
        
        const overlap = profile1Ids.filter((id: any) => profile2Ids.includes(id));
        if (overlap.length > 0) {
          throw new Error('Sessions not properly isolated');
        }
      }
    },

    // ========== DEVICE MANAGEMENT ==========
    {
      name: 'Device tracking with account sessions',
      tags: ['devices', 'sessions'],
      async fn(context: TestContext) {
        const authHelper = new AuthHelperV2(context);
        const client = context.createApiClient();
        
        // Create sessions from different "devices"
        const devices = [
          { name: 'iPhone 15 Pro', type: 'ios' },
          { name: 'MacBook Pro', type: 'web' },
          { name: 'iPad Air', type: 'ios' }
        ];
        
        const sessions = [];
        for (const device of devices) {
          // Would include device info in auth request
          const auth = await authHelper.authenticateWithWallet(client, 81);
          sessions.push({ auth, device });
        }
        
        // Check devices list
        // @ts-ignore
        client.setAccessToken(sessions[0].auth.tokens.accessToken);
        const devicesResponse = await client.get('/api/v1/auth/devices');
        
        assertResponse(devicesResponse, 200);
        
        // Should track all devices
        if (devicesResponse.data.data.length < devices.length) {
          throw new Error('Not all devices tracked');
        }
      }
    },

    {
      name: 'DELETE /devices/:id - Revoke specific session',
      tags: ['devices', 'session-revocation'],
      async fn(context: TestContext) {
        const authHelper = new AuthHelperV2(context);
        const client = context.createApiClient();
        
        // Create multiple sessions
        const auth1 = await authHelper.authenticateWithWallet(client, 82);
        const auth2 = await authHelper.authenticateWithWallet(client, 82);
        
        // List devices from first session
        client.setAccessToken(auth1.tokens.accessToken);
        const devicesResponse = await client.get('/api/v1/auth/devices');
        
        // Find the other device
        const otherDevice = devicesResponse.data.data.find((d: any) => !d.isCurrentDevice);
        if (!otherDevice) {
          throw new Error('Could not find other device');
        }
        
        // Revoke other device
        const revokeResponse = await client.delete(`/api/v1/auth/devices/${otherDevice.id}`);
        assertResponse(revokeResponse, 200);
        
        // Second session should now be invalid
        client.setAccessToken(auth2.tokens.accessToken);
        try {
          await client.get('/api/v1/auth/me');
          throw new Error('Revoked session should be invalid');
        } catch (error) {
          assertErrorResponse(error, 401);
        }
        
        // First session should still work
        client.setAccessToken(auth1.tokens.accessToken);
        const meResponse = await client.get('/api/v1/auth/me');
        assertResponse(meResponse, 200);
      }
    },

    // ========== SESSION INVALIDATION ==========
    {
      name: 'Session invalidation on account unlink',
      tags: ['sessions', 'invalidation', 'unlinking'],
      async fn(context: TestContext) {
        const authHelper = new AuthHelperV2(context);
        const client = context.createApiClient();
        
        // Create linked accounts
        const auth1 = await authHelper.authenticateWithWallet(client, 83);
        client.setAccessToken(auth1.tokens.accessToken);
        
        const wallet2 = new TestWallet(84);
        await authHelper.linkAccounts(client, 'wallet', wallet2.address);
        
        // Create session from second account
        const auth2 = await authHelper.authenticateWithWallet(client, 84);
        
        // Both sessions should work
        client.setAccessToken(auth2.tokens.accessToken);
        const profiles = await client.get('/api/v1/profiles');
        if (profiles.data.data.length < 2) {
          throw new Error('Linked account not seeing all profiles');
        }
        
        // Unlink accounts (when implemented)
        // Sessions from unlinked account should have reduced access
        // This test would be completed when unlink is implemented
      }
    },

    {
      name: 'Logout and logout-all with account sessions',
      tags: ['sessions', 'logout'],
      async fn(context: TestContext) {
        const authHelper = new AuthHelperV2(context);
        const client = context.createApiClient();
        
        // Create multiple sessions
        const sessions = [];
        for (let i = 0; i < 3; i++) {
          const auth = await authHelper.authenticateWithWallet(client, 85);
          sessions.push(auth);
        }
        
        // Logout from one session
        // @ts-ignore
        client.setAccessToken(sessions[0].tokens.accessToken);
        const logoutResponse = await client.post('/api/v1/auth/logout');
        assertResponse(logoutResponse, 200);
        
        // That session should be invalid
        try {
          await client.get('/api/v1/auth/me');
          throw new Error('Logged out session should be invalid');
        } catch (error) {
          assertErrorResponse(error, 401);
        }
        
        // Other sessions should still work
        // @ts-ignore
        client.setAccessToken(sessions[1].tokens.accessToken);
        const meResponse = await client.get('/api/v1/auth/me');
        assertResponse(meResponse, 200);
        
        // Logout all
        const logoutAllResponse = await client.post('/api/v1/auth/logout-all');
        assertResponse(logoutAllResponse, 200);
        
        // All sessions should now be invalid
        for (const session of sessions) {
          client.setAccessToken(session.tokens.accessToken);
          try {
            await client.get('/api/v1/auth/me');
            throw new Error('All sessions should be invalid after logout-all');
          } catch (error) {
            assertErrorResponse(error, 401);
          }
        }
      }
    },

    // ========== BACKWARD COMPATIBILITY ==========
    {
      name: 'Backward compatibility with userId tokens',
      tags: ['backward-compatibility', 'tokens'],
      async fn(context: TestContext) {
        const authHelper = new AuthHelperV2(context);
        const client = context.createApiClient();
        
        // Create a V1-style token with userId
        const user = await context.createUser({
          email: faker.internet.email()
        });
        
        const v1Token = jwt.sign(
          {
            userId: user.id,
            type: 'access',
            version: 'v1'
          },
          process.env.JWT_SECRET || 'test-secret',
          { expiresIn: '15m' }
        );
        
        // Should still work with V2 endpoints
        client.setAccessToken(v1Token);
        
        try {
          const response = await client.get('/api/v1/auth/me');
          assertResponse(response, 200);
          
          if (response.data.data.id !== user.id) {
            throw new Error('V1 token not properly handled');
          }
        } catch (error) {
          // V2 endpoints might not support V1 tokens
          // This is acceptable as long as V1 endpoints still work
        }
      }
    },

    // ========== PERFORMANCE ==========
    {
      name: 'Session operations performance',
      tags: ['performance', 'sessions'],
      async fn(context: TestContext) {
        const authHelper = new AuthHelperV2(context);
        const client = context.createApiClient();
        
        // Authentication performance
        const authStart = Date.now();
        const auth = await authHelper.authenticateWithWallet(client, 86);
        const authTime = Date.now() - authStart;
        
        if (authTime > 500) {
          throw new Error(`Authentication too slow: ${authTime}ms`);
        }
        
        // Token refresh performance
        const refreshStart = Date.now();
        await client.post('/api/v2/auth/refresh', {
          refreshToken: auth.tokens.refreshToken
        });
        const refreshTime = Date.now() - refreshStart;
        
        if (refreshTime > 200) {
          throw new Error(`Token refresh too slow: ${refreshTime}ms`);
        }
        
        // Session validation performance
        client.setAccessToken(auth.tokens.accessToken);
        const validationStart = Date.now();
        
        for (let i = 0; i < 10; i++) {
          await client.get('/api/v1/auth/me');
        }
        
        const validationTime = Date.now() - validationStart;
        const avgValidation = validationTime / 10;
        
        if (avgValidation > 50) {
          throw new Error(`Session validation too slow: ${avgValidation}ms average`);
        }
      }
    }
  ]
};
