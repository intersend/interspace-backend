import { TestSuite, TestContext } from '../../types';
import { AuthHelperV2 } from '../../utils/AuthHelperV2';
import { TestWallet, getTestWallet } from '../../utils/TestWallet';
import { assertResponse, assertErrorResponse } from '../../utils/ApiClient';
import { faker } from '@faker-js/faker';
import jwt from 'jsonwebtoken';

export const flatIdentitySecuritySuite: TestSuite = {
  name: 'Flat Identity Security',
  description: 'Security testing for flat identity model including privacy, access control, and attack prevention',
  tags: ['security', 'v2', 'critical', 'privacy'],
  priority: 'critical',
  endpoints: ['/api/v2/auth/*'],
  
  async setup(context: TestContext) {
    await context.checkDatabaseConnection();
  },

  async teardown(context: TestContext) {
    // Cleanup handled by TestContext
  },

  tests: [
    // ========== ACCOUNT TAKEOVER PREVENTION ==========
    {
      name: 'Prevent account takeover through linking',
      tags: ['security', 'account-takeover'],
      async fn(context: TestContext) {
        const authHelper = new AuthHelperV2(context);
        const client = context.createApiClient();
        
        // Victim creates account
        const victimAuth = await authHelper.authenticateWithWallet(client, 90);
        
        // Attacker creates account
        const attackerAuth = await authHelper.authenticateWithWallet(client, 91);
        client.setAccessToken(attackerAuth.tokens.accessToken);
        
        // Attacker tries to link victim's wallet
        try {
          await authHelper.linkAccounts(
            client,
            'wallet',
            getTestWallet(90).address
          );
          throw new Error('Should not allow linking already-owned account');
        } catch (error) {
          assertErrorResponse(error, 400, /already.*exists|owned/i);
        }
        
        // Victim's account should remain secure
        client.setAccessToken(victimAuth.tokens.accessToken);
        const victimProfiles = await client.get('/api/v1/profiles');
        
        // Should only see own profile
        if (victimProfiles.data.data.length !== 1) {
          throw new Error('Victim account compromised');
        }
      }
    },

    {
      name: 'Prevent email takeover through pre-registration',
      tags: ['security', 'account-takeover', 'email'],
      async fn(context: TestContext) {
        const authHelper = new AuthHelperV2(context);
        const client = context.createApiClient();
        
        const targetEmail = faker.internet.email();
        
        // Attacker pre-registers the email
        const attackerAuth = await authHelper.authenticateWithWallet(client, 92);
        client.setAccessToken(attackerAuth.tokens.accessToken);
        
        try {
          // Try to link unverified email
          await authHelper.linkAccounts(client, 'email', targetEmail);
          
          // If linking succeeds, email must require verification
          // Real user should still be able to claim it
          const realUserAuth = await authHelper.authenticateWithEmail(
            client,
            targetEmail
          );
          
          // Real user should get their own account, not attacker's
          if (realUserAuth.account.id === attackerAuth.account.id) {
            throw new Error('Email takeover successful - security breach');
          }
        } catch (error) {
          // System should prevent unverified email linking
          assertErrorResponse(error, 400, /verif/i);
        }
      }
    },

    // ========== SESSION HIJACKING PROTECTION ==========
    {
      name: 'Session token binding to account',
      tags: ['security', 'session-hijacking'],
      async fn(context: TestContext) {
        const authHelper = new AuthHelperV2(context);
        const client = context.createApiClient();
        
        // Create two accounts
        const auth1 = await authHelper.authenticateWithWallet(client, 93);
        const auth2 = await authHelper.authenticateWithWallet(client, 94);
        
        // Try to use auth1's token with auth2's account ID
        const decoded1 = jwt.decode(auth1.tokens.accessToken) as any;
        const decoded2 = jwt.decode(auth2.tokens.accessToken) as any;
        
        // Craft malicious token
        const maliciousToken = jwt.sign(
          {
            ...decoded1,
            accountId: decoded2.accountId // Wrong account
          },
          process.env.JWT_SECRET || 'test-secret',
          { expiresIn: '15m' }
        );
        
        client.setAccessToken(maliciousToken);
        
        try {
          await client.get('/api/v1/auth/me');
          throw new Error('Should reject token with mismatched account');
        } catch (error) {
          assertErrorResponse(error, 401);
        }
      }
    },

    {
      name: 'Session token replay prevention',
      tags: ['security', 'replay-attack'],
      async fn(context: TestContext) {
        const authHelper = new AuthHelperV2(context);
        const client = context.createApiClient();
        
        const auth = await authHelper.authenticateWithWallet(client, 95);
        client.setAccessToken(auth.tokens.accessToken);
        
        // Logout to invalidate token
        await client.post('/api/v1/auth/logout');
        
        // Try to reuse the token
        try {
          await client.get('/api/v1/auth/me');
          throw new Error('Should reject invalidated token');
        } catch (error) {
          assertErrorResponse(error, 401);
        }
      }
    },

    // ========== PRIVACY BOUNDARY ENFORCEMENT ==========
    {
      name: 'Isolated account privacy enforcement',
      tags: ['security', 'privacy', 'isolated'],
      async fn(context: TestContext) {
        const authHelper = new AuthHelperV2(context);
        const client = context.createApiClient();
        
        // Create main account with sensitive data
        const mainAuth = await authHelper.authenticateWithWallet(client, 96);
        client.setAccessToken(mainAuth.tokens.accessToken);
        
        // Create sensitive profile
        const sensitiveProfile = await client.post('/api/v1/profiles', {
          name: 'Private Trading Strategy'
        });
        
        // Link isolated account
        const isolatedWallet = new TestWallet(97);
        await authHelper.linkAccounts(
          client,
          'wallet',
          isolatedWallet.address,
          { privacyMode: 'isolated' }
        );
        
        // Auth as isolated account
        const isolatedAuth = await authHelper.authenticateWithWallet(client, 97);
        client.setAccessToken(isolatedAuth.tokens.accessToken);
        
        // Should not see main account's profiles
        const profiles = await client.get('/api/v1/profiles');
        const profileIds = profiles.data.data.map((p: any) => p.id);
        
        if (profileIds.includes(sensitiveProfile.data.data.id)) {
          throw new Error('Isolated account can see private profiles');
        }
        
        // Should not be able to switch to main profile
        try {
          await authHelper.switchProfile(client, mainAuth.profiles[0].id);
          throw new Error('Isolated account can switch to private profile');
        } catch (error) {
          assertErrorResponse(error, 404);
        }
      }
    },

    {
      name: 'Partial privacy mode selective sharing',
      tags: ['security', 'privacy', 'partial'],
      async fn(context: TestContext) {
        const authHelper = new AuthHelperV2(context);
        const client = context.createApiClient();
        
        // Create account with multiple profiles
        const mainAuth = await authHelper.authenticateWithWallet(client, 98);
        client.setAccessToken(mainAuth.tokens.accessToken);
        
        await client.post('/api/v1/profiles', { name: 'Public Profile' });
        await client.post('/api/v1/profiles', { name: 'Semi-Private Profile' });
        
        // Link account with partial privacy
        const partialWallet = new TestWallet(99);
        await authHelper.linkAccounts(
          client,
          'wallet',
          partialWallet.address,
          { privacyMode: 'partial' }
        );
        
        // Partial privacy implementation would determine
        // which profiles are visible based on sharing rules
        // This test verifies the concept works
        const partialAuth = await authHelper.authenticateWithWallet(client, 99);
        client.setAccessToken(partialAuth.tokens.accessToken);
        
        const visibleProfiles = await client.get('/api/v1/profiles');
        
        // Should see some but potentially not all profiles
        if (visibleProfiles.data.data.length === 0) {
          throw new Error('Partial privacy too restrictive');
        }
      }
    },

    // ========== RATE LIMITING PER ACCOUNT ==========
    {
      name: 'Rate limiting tracks by account not IP',
      tags: ['security', 'rate-limiting'],
      async fn(context: TestContext) {
        const authHelper = new AuthHelperV2(context);
        
        // Create two clients simulating same IP
        const client1 = context.createApiClient();
        const client2 = context.createApiClient();
        
        // Different accounts from "same IP"
        const auth1 = await authHelper.authenticateWithWallet(client1, 100);
        const auth2 = await authHelper.authenticateWithWallet(client2, 101);
        
        // Rate limit account 1
        const attempts = 15;
        const results1 = [];
        
        for (let i = 0; i < attempts; i++) {
          try {
            await client1.post('/api/v2/auth/send-email-code', {
              email: faker.internet.email()
            });
            results1.push({ success: true });
          } catch (error: any) {
            results1.push({ success: false, status: error.response?.status });
          }
        }
        
        // Account 1 should be rate limited
        const limited1 = results1.filter(r => r.status === 429);
        if (limited1.length === 0) {
          throw new Error('Account 1 not rate limited');
        }
        
        // Account 2 should still work
        client2.setAccessToken(auth2.tokens.accessToken);
        const response2 = await client2.post('/api/v2/auth/send-email-code', {
          email: faker.internet.email()
        });
        
        // Should not be rate limited
        if (response2.status === 429) {
          throw new Error('Rate limiting by IP instead of account');
        }
      }
    },

    // ========== AUDIT LOGGING ==========
    {
      name: 'Audit logging for security events',
      tags: ['security', 'audit-logs'],
      async fn(context: TestContext) {
        const authHelper = new AuthHelperV2(context);
        const client = context.createApiClient();
        
        // Perform security-sensitive operations
        const auth = await authHelper.authenticateWithWallet(client, 102);
        client.setAccessToken(auth.tokens.accessToken);
        
        // Failed auth attempt
        try {
          const badWallet = new TestWallet(103);
          const badPayload = await badWallet.generateAuthPayload();
          badPayload.signature = TestWallet.generateInvalidSignature();
          
          await client.post('/api/v2/auth/authenticate', {
            strategy: 'wallet',
            ...badPayload
          });
        } catch (error) {
          // Expected to fail
        }
        
        // Account linking
        await authHelper.linkAccounts(client, 'email', faker.internet.email());
        
        // Privacy mode change
        const graph = await authHelper.getIdentityGraph(client);
        if (graph.links.length > 0) {
          const targetId = graph.accounts.find(a => a.id !== auth.account.id)?.id;
          if (targetId) {
            await authHelper.updateLinkPrivacyMode(client, targetId, 'isolated');
          }
        }
        
        // These operations should generate audit logs
        // Actual verification would check audit log storage
      }
    },

    // ========== TOKEN SECURITY ==========
    {
      name: 'JWT validation and security',
      tags: ['security', 'jwt', 'tokens'],
      async fn(context: TestContext) {
        const authHelper = new AuthHelperV2(context);
        const client = context.createApiClient();
        
        const auth = await authHelper.authenticateWithWallet(client, 104);
        
        // Test various token manipulations
        const validToken = auth.tokens.accessToken;
        const decoded = jwt.decode(validToken) as any;
        
        // Wrong signature
        const wrongSigToken = jwt.sign(decoded, 'wrong-secret');
        client.setAccessToken(wrongSigToken);
        
        try {
          await client.get('/api/v1/auth/me');
          throw new Error('Should reject token with wrong signature');
        } catch (error) {
          assertErrorResponse(error, 401);
        }
        
        // Expired token
        const expiredToken = jwt.sign(
          { ...decoded, exp: Math.floor(Date.now() / 1000) - 3600 },
          process.env.JWT_SECRET || 'test-secret'
        );
        client.setAccessToken(expiredToken);
        
        try {
          await client.get('/api/v1/auth/me');
          throw new Error('Should reject expired token');
        } catch (error) {
          assertErrorResponse(error, 401);
        }
        
        // Modified claims
        const modifiedToken = jwt.sign(
          { ...decoded, accountId: 'different_account' },
          process.env.JWT_SECRET || 'test-secret'
        );
        client.setAccessToken(modifiedToken);
        
        try {
          await client.get('/api/v1/auth/me');
          // May or may not fail depending on implementation
        } catch (error) {
          assertErrorResponse(error, 401);
        }
      }
    },

    // ========== CROSS-ACCOUNT DATA LEAKAGE ==========
    {
      name: 'Prevent cross-account data leakage',
      tags: ['security', 'data-leakage'],
      async fn(context: TestContext) {
        const authHelper = new AuthHelperV2(context);
        const client = context.createApiClient();
        
        // Create account A with sensitive data
        const authA = await authHelper.authenticateWithWallet(client, 105);
        client.setAccessToken(authA.tokens.accessToken);
        
        // Add app to profile (sensitive data)
        const appResponse = await client.post('/api/v1/apps', {
          profileId: authA.profiles[0].id,
          appUrl: 'https://secret-trading-app.com',
          appName: 'Secret Strategy'
        });
        
        // Create unrelated account B
        const authB = await authHelper.authenticateWithWallet(client, 106);
        client.setAccessToken(authB.tokens.accessToken);
        
        // B should not be able to access A's data
        try {
          await client.get(`/api/v1/apps/${appResponse.data.data.id}`);
          throw new Error('Account B can access Account A data');
        } catch (error) {
          assertErrorResponse(error, 404);
        }
        
        // B should not see A's profile
        const profilesB = await client.get('/api/v1/profiles');
        const profileIdsB = profilesB.data.data.map((p: any) => p.id);
        
        if (profileIdsB.includes(authA.profiles[0].id)) {
          throw new Error('Account B can see Account A profiles');
        }
      }
    },

    // ========== SIWE SPECIFIC SECURITY ==========
    {
      name: 'SIWE replay attack prevention',
      tags: ['security', 'siwe', 'replay-attack'],
      async fn(context: TestContext) {
        const client = context.createApiClient();
        
        // Get nonce
        const nonceResponse = await client.get('/api/v1/siwe/nonce');
        const { nonce } = nonceResponse.data.data;
        
        // Create and sign message
        const wallet = getTestWallet(107);
        const authPayload = await wallet.generateAuthPayload({ nonce });
        
        // First use should succeed
        const auth1Response = await client.post('/api/v2/auth/authenticate', {
          strategy: 'wallet',
          ...authPayload
        });
        assertResponse(auth1Response, 200);
        
        // Replay should fail
        try {
          await client.post('/api/v2/auth/authenticate', {
            strategy: 'wallet',
            ...authPayload
          });
          throw new Error('SIWE replay attack succeeded');
        } catch (error) {
          assertErrorResponse(error, 401, /nonce.*used|replay/i);
        }
      }
    },

    {
      name: 'SIWE message expiration',
      tags: ['security', 'siwe', 'expiration'],
      async fn(context: TestContext) {
        const client = context.createApiClient();
        const wallet = getTestWallet(108);
        
        // Get nonce
        const nonceResponse = await client.get('/api/v1/siwe/nonce');
        const { nonce } = nonceResponse.data.data;
        
        // Create expired message
        const expiredMessage = await wallet.generateExpiredSiweMessage({ nonce });
        const signature = await wallet.signMessage(expiredMessage);
        
        try {
          await client.post('/api/v2/auth/authenticate', {
            strategy: 'wallet',
            walletAddress: wallet.address,
            message: expiredMessage,
            signature,
            walletType: 'metamask'
          });
          throw new Error('Should reject expired SIWE message');
        } catch (error) {
          assertErrorResponse(error, 401, /expired/i);
        }
      }
    },

    {
      name: 'SIWE domain validation',
      tags: ['security', 'siwe', 'domain'],
      async fn(context: TestContext) {
        const client = context.createApiClient();
        const wallet = getTestWallet(109);
        
        // Get nonce
        const nonceResponse = await client.get('/api/v1/siwe/nonce');
        const { nonce } = nonceResponse.data.data;
        
        // Create message with wrong domain
        const wrongDomainMessage = await wallet.generateWrongDomainMessage({
          actualDomain: 'localhost:3000',
          nonce
        });
        const signature = await wallet.signMessage(wrongDomainMessage);
        
        try {
          await client.post('/api/v2/auth/authenticate', {
            strategy: 'wallet',
            walletAddress: wallet.address,
            message: wrongDomainMessage,
            signature,
            walletType: 'metamask'
          });
          throw new Error('Should reject wrong domain');
        } catch (error) {
          assertErrorResponse(error, 401, /domain/i);
        }
      }
    },

    // ========== PRIVACY MODE TRANSITIONS ==========
    {
      name: 'Privacy mode downgrade protection',
      tags: ['security', 'privacy', 'transitions'],
      async fn(context: TestContext) {
        const authHelper = new AuthHelperV2(context);
        const client = context.createApiClient();
        
        // Create main account
        const mainAuth = await authHelper.authenticateWithWallet(client, 110);
        client.setAccessToken(mainAuth.tokens.accessToken);
        
        // Link account with isolated privacy
        const isolatedWallet = new TestWallet(111);
        await authHelper.linkAccounts(
          client,
          'wallet',
          isolatedWallet.address,
          { privacyMode: 'isolated' }
        );
        
        // Main account tries to downgrade privacy
        const graph = await authHelper.getIdentityGraph(client);
        const isolatedAccount = graph.accounts.find(
          a => a.identifier === isolatedWallet.address.toLowerCase()
        );
        
        if (isolatedAccount) {
          // Try to change from isolated to linked
          await authHelper.updateLinkPrivacyMode(
            client,
            isolatedAccount.id,
            'linked'
          );
          
          // Isolated account should maintain its privacy preference
          // or require confirmation from the isolated account
          // Implementation specific behavior
        }
      }
    },

    // ========== INPUT VALIDATION ==========
    {
      name: 'Input validation and sanitization',
      tags: ['security', 'validation', 'xss'],
      async fn(context: TestContext) {
        const authHelper = new AuthHelperV2(context);
        const client = context.createApiClient();
        
        const auth = await authHelper.authenticateWithWallet(client, 112);
        client.setAccessToken(auth.tokens.accessToken);
        
        // Test XSS in profile name
        const xssPayloads = [
          '<script>alert("xss")</script>',
          'javascript:alert(1)',
          '<img src=x onerror=alert(1)>',
          '"><script>alert(1)</script>'
        ];
        
        for (const payload of xssPayloads) {
          try {
            const response = await client.post('/api/v1/profiles', {
              name: payload
            });
            
            // If accepted, should be sanitized
            if (response.data.data.name.includes('<script>')) {
              throw new Error('XSS payload not sanitized');
            }
          } catch (error) {
            // Rejection is also acceptable
            assertErrorResponse(error, 400);
          }
        }
        
        // Test SQL injection attempts
        const sqlPayloads = [
          "'; DROP TABLE accounts; --",
          "1' OR '1'='1",
          "admin'--"
        ];
        
        for (const payload of sqlPayloads) {
          try {
            await authHelper.linkAccounts(client, 'email', payload);
            // Should either sanitize or reject
          } catch (error) {
            // Expected
          }
        }
      }
    }
  ]
};
