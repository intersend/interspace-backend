import { TestSuite, TestContext } from '../../types';
import { AuthHelperV2 } from '../../utils/AuthHelperV2';
import { TestWallet, getTestWallet } from '../../utils/TestWallet';
import { assertResponse, assertErrorResponse } from '../../utils/ApiClient';
import { faker } from '@faker-js/faker';
import crypto from 'crypto';

export const authenticationV2Suite: TestSuite = {
  name: 'Authentication V2 - Flat Identity',
  description: 'Comprehensive testing of V2 authentication with flat identity model',
  tags: ['auth', 'v2', 'critical', 'security'],
  priority: 'critical',
  endpoints: ['/api/v2/auth/*'],
  
  async setup(context: TestContext) {
    // Setup is minimal as accounts are created dynamically
    await context.checkDatabaseConnection();
  },

  async teardown(context: TestContext) {
    // Cleanup handled by TestContext
  },

  tests: [
    // ========== WALLET AUTHENTICATION (SIWE) ==========
    {
      name: 'POST /auth/authenticate - Wallet auth with automatic profile creation',
      tags: ['wallet', 'siwe', 'profile-creation'],
      async fn(context: TestContext) {
        const authHelper = new AuthHelperV2(context);
        const client = context.createApiClient();
        
        // Generate a unique wallet for this test
        const randomPrivateKey = '0x' + crypto.randomBytes(32).toString('hex');
        const wallet = new TestWallet(randomPrivateKey);
        
        // Get SIWE nonce
        const nonceResponse = await client.get('/api/v1/siwe/nonce');
        assertResponse(nonceResponse, 200);
        const { nonce } = nonceResponse.data.data;
        
        // Generate auth payload
        const authPayload = await wallet.generateAuthPayload({ nonce });
        
        // Authenticate
        const response = await client.post('/api/v2/auth/authenticate', {
          strategy: 'wallet',
          ...authPayload
        });
        
        // Debug logging
        console.log('Auth response:', JSON.stringify(response.data, null, 2));
        
        assertResponse(response, 200);
        const { account, profiles, tokens, isNewUser } = response.data;
        
        // Verify account creation
        if (!account || account.type !== 'wallet') {
          throw new Error('Expected wallet account to be created');
        }
        if (account.identifier !== wallet.address.toLowerCase()) {
          throw new Error('Account identifier mismatch');
        }
        if (!account.verified) {
          throw new Error('Wallet account should be auto-verified');
        }
        
        // Verify automatic profile creation
        if (!profiles || profiles.length !== 1) {
          throw new Error('Expected one profile to be created automatically');
        }
        if (profiles[0].name !== 'My Smartprofile') {
          throw new Error('Expected profile name to be "My Smartprofile"');
        }
        if (!profiles[0].isActive) {
          throw new Error('First profile should be active');
        }
        
        // Verify tokens
        if (!tokens.accessToken || !tokens.refreshToken) {
          throw new Error('Missing authentication tokens');
        }
        
        // Verify new user flag
        if (!isNewUser) {
          throw new Error('Expected isNewUser to be true');
        }
        
        // Measure performance
        if (response.duration > 500) {
          throw new Error(`Authentication too slow: ${response.duration}ms`);
        }
      }
    },

    {
      name: 'POST /auth/authenticate - Wallet auth with invalid signature',
      tags: ['wallet', 'siwe', 'security'],
      async fn(context: TestContext) {
        const client = context.createApiClient();
        
        const nonceResponse = await client.get('/api/v1/siwe/nonce');
        const { nonce } = nonceResponse.data.data;
        
        const wallet = getTestWallet(0);
        const message = await wallet.generateSiweMessage({ nonce });
        
        try {
          await client.post('/api/v2/auth/authenticate', {
            strategy: 'wallet',
            walletAddress: wallet.address,
            message,
            signature: TestWallet.generateInvalidSignature(),
            walletType: 'metamask'
          });
          throw new Error('Should reject invalid signature');
        } catch (error) {
          assertErrorResponse(error, 401, /address mismatch|invalid.*signature|non-canonical/i);
        }
      }
    },

    {
      name: 'POST /auth/authenticate - Wallet auth with expired nonce',
      tags: ['wallet', 'siwe', 'security'],
      async fn(context: TestContext) {
        const client = context.createApiClient();
        const wallet = getTestWallet(0);
        
        // Use an expired nonce
        const expiredNonce = 'expired_nonce_12345';
        const authPayload = await wallet.generateAuthPayload({ nonce: expiredNonce });
        
        try {
          await client.post('/api/v2/auth/authenticate', {
            strategy: 'wallet',
            ...authPayload
          });
          throw new Error('Should reject expired nonce');
        } catch (error) {
          assertErrorResponse(error, 401, /nonce/i);
        }
      }
    },

    {
      name: 'POST /auth/authenticate - Wallet auth with message tampering',
      tags: ['wallet', 'siwe', 'security'],
      async fn(context: TestContext) {
        const client = context.createApiClient();
        
        const nonceResponse = await client.get('/api/v1/siwe/nonce');
        const { nonce } = nonceResponse.data.data;
        
        const wallet = getTestWallet(0);
        const authPayload = await wallet.generateAuthPayload({ nonce });
        
        // Tamper with message
        authPayload.message = authPayload.message.replace(wallet.address, getTestWallet(1).address);
        
        try {
          await client.post('/api/v2/auth/authenticate', {
            strategy: 'wallet',
            ...authPayload
          });
          throw new Error('Should reject tampered message');
        } catch (error) {
          assertErrorResponse(error, 401);
        }
      }
    },

    {
      name: 'POST /auth/authenticate - Wallet auth with wrong domain',
      tags: ['wallet', 'siwe', 'security'],
      async fn(context: TestContext) {
        const client = context.createApiClient();
        
        const nonceResponse = await client.get('/api/v1/siwe/nonce');
        const { nonce } = nonceResponse.data.data;
        
        const wallet = getTestWallet(0);
        const message = await wallet.generateWrongDomainMessage({
          actualDomain: 'localhost:3000',
          nonce
        });
        const signature = await wallet.signMessage(message);
        
        try {
          await client.post('/api/v2/auth/authenticate', {
            strategy: 'wallet',
            walletAddress: wallet.address,
            message,
            signature,
            walletType: 'metamask'
          });
          throw new Error('Should reject wrong domain');
        } catch (error) {
          assertErrorResponse(error, 401, /domain/i);
        }
      }
    },

    {
      name: 'POST /auth/authenticate - Wallet auth replay attack prevention',
      tags: ['wallet', 'siwe', 'security'],
      async fn(context: TestContext) {
        const client = context.createApiClient();
        
        // First authentication
        const nonceResponse = await client.get('/api/v1/siwe/nonce');
        const { nonce } = nonceResponse.data.data;
        
        const wallet = getTestWallet(0);
        const authPayload = await wallet.generateAuthPayload({ nonce });
        
        const response = await client.post('/api/v2/auth/authenticate', {
          strategy: 'wallet',
          ...authPayload
        });
        assertResponse(response, 200);
        
        // Try to replay the same authentication
        try {
          await client.post('/api/v2/auth/authenticate', {
            strategy: 'wallet',
            ...authPayload
          });
          throw new Error('Should prevent replay attack');
        } catch (error) {
          assertErrorResponse(error, 401, /nonce.*used/i);
        }
      }
    },

    // ========== EMAIL AUTHENTICATION ==========
    {
      name: 'POST /auth/authenticate - Email auth with automatic profile creation',
      tags: ['email', 'profile-creation'],
      async fn(context: TestContext) {
        const client = context.createApiClient();
        const email = faker.internet.email();
        
        // First request a verification code
        await client.post('/api/v2/auth/send-email-code', { email });
        
        // In dev mode, retrieve the code
        let verificationCode;
        try {
          const codeResponse = await client.get(`/api/v1/auth/email/dev/last-code?email=${encodeURIComponent(email)}`);
          verificationCode = codeResponse.data.code;
        } catch (error: any) {
          console.log('Failed to get dev code:', error.response?.status, error.response?.data);
          throw error;
        }
        
        const response = await client.post('/api/v2/auth/authenticate', {
          strategy: 'email',
          email,
          verificationCode
        });
        
        assertResponse(response, 200);
        const { account, profiles, isNewUser } = response.data;
        
        // Verify account
        if (account.type !== 'email') {
          throw new Error('Expected email account type');
        }
        if (account.identifier !== email.toLowerCase()) {
          throw new Error('Email should be normalized to lowercase');
        }
        
        // Verify profile creation
        if (profiles.length !== 1 || profiles[0].name !== 'My Smartprofile') {
          throw new Error('Expected automatic profile creation');
        }
        
        if (!isNewUser) {
          throw new Error('Expected new user flag');
        }
      }
    },

    {
      name: 'POST /auth/authenticate - Email auth case insensitivity',
      tags: ['email'],
      async fn(context: TestContext) {
        const client = context.createApiClient();
        const baseEmail = faker.internet.email();
        
        // Request code for lowercase email
        await client.post('/api/v2/auth/send-email-code', { email: baseEmail.toLowerCase() });
        const codeResponse1 = await client.get(`/api/v1/auth/email/dev/last-code?email=${encodeURIComponent(baseEmail.toLowerCase())}`);
        
        // First auth with lowercase
        const response1 = await client.post('/api/v2/auth/authenticate', {
          strategy: 'email',
          email: baseEmail.toLowerCase(),
          verificationCode: codeResponse1.data.code
        });
        assertResponse(response1, 200);
        
        // Request code for uppercase email (should work with same account)
        await client.post('/api/v2/auth/send-email-code', { email: baseEmail.toUpperCase() });
        const codeResponse2 = await client.get(`/api/v1/auth/email/dev/last-code?email=${encodeURIComponent(baseEmail.toUpperCase())}`);
        
        // Second auth with uppercase - should return same account
        const response2 = await client.post('/api/v2/auth/authenticate', {
          strategy: 'email',
          email: baseEmail.toUpperCase(),
          verificationCode: codeResponse2.data.code
        });
        assertResponse(response2, 200);
        
        if (response2.data.isNewUser) {
          throw new Error('Should recognize existing user despite case difference');
        }
        
        if (response1.data.account.id !== response2.data.account.id) {
          throw new Error('Should return same account for different email cases');
        }
      }
    },

    {
      name: 'POST /auth/authenticate - Email auth with invalid code',
      tags: ['email', 'security'],
      async fn(context: TestContext) {
        const client = context.createApiClient();
        const email = faker.internet.email();
        
        try {
          await client.post('/api/v2/auth/authenticate', {
            strategy: 'email',
            email,
            verificationCode: 'wrong_code'
          });
          throw new Error('Should reject invalid verification code');
        } catch (error) {
          assertErrorResponse(error, 401, /invalid.*code/i);
        }
      }
    },

    // ========== SOCIAL AUTHENTICATION ==========
    {
      name: 'POST /auth/authenticate - Google auth with automatic profile',
      tags: ['social', 'google', 'profile-creation'],
      async fn(context: TestContext) {
        const client = context.createApiClient();
        
        // In test environment, social auth is mocked
        const response = await client.post('/api/v2/auth/authenticate', {
          strategy: 'google',
          idToken: 'mock_google_token'
        });
        
        assertResponse(response, 200);
        const { account, profiles } = response.data;
        
        if (account.type !== 'social' || account.provider !== 'google') {
          throw new Error('Expected Google social account');
        }
        
        if (profiles.length !== 1) {
          throw new Error('Expected automatic profile creation');
        }
      }
    },

    {
      name: 'POST /auth/authenticate - Apple auth with automatic profile',
      tags: ['social', 'apple', 'profile-creation'],
      async fn(context: TestContext) {
        const client = context.createApiClient();
        
        const response = await client.post('/api/v2/auth/authenticate', {
          strategy: 'apple',
          idToken: 'mock_apple_token'
        });
        
        assertResponse(response, 200);
        const { account, profiles } = response.data;
        
        if (account.type !== 'social' || account.provider !== 'apple') {
          throw new Error('Expected Apple social account');
        }
        
        if (profiles.length !== 1) {
          throw new Error('Expected automatic profile creation');
        }
      }
    },

    // ========== GUEST AUTHENTICATION ==========
    {
      name: 'POST /auth/authenticate - Guest auth with automatic profile',
      tags: ['guest', 'profile-creation'],
      async fn(context: TestContext) {
        const client = context.createApiClient();
        
        const response = await client.post('/api/v2/auth/authenticate', {
          strategy: 'guest'
        });
        
        assertResponse(response, 200);
        const { account, profiles, user } = response.data;
        
        if (account.type !== 'guest') {
          throw new Error('Expected guest account type');
        }
        
        if (!account.identifier.startsWith('guest_')) {
          throw new Error('Expected guest identifier format');
        }
        
        if (!user.isGuest) {
          throw new Error('Expected guest user flag');
        }
        
        if (profiles.length !== 1) {
          throw new Error('Expected automatic profile for guest');
        }
      }
    },

    // ========== PRIVACY MODES ==========
    {
      name: 'POST /auth/authenticate - Auth with privacy mode selection',
      tags: ['privacy', 'wallet'],
      async fn(context: TestContext) {
        const authHelper = new AuthHelperV2(context);
        const client = context.createApiClient();
        
        // Test each privacy mode
        for (const privacyMode of ['linked', 'partial', 'isolated'] as const) {
          const walletIndex = privacyMode === 'linked' ? 3 : privacyMode === 'partial' ? 4 : 5;
          const result = await authHelper.authenticateWithWallet(client, walletIndex, {
            privacyMode
          });
          
          if (result.isNewUser) {
            // Verify session has correct privacy mode
            // This would be verified through session endpoint
          }
        }
      }
    },

    // ========== EXISTING USER AUTHENTICATION ==========
    {
      name: 'POST /auth/authenticate - Existing user returns all profiles',
      tags: ['existing-user', 'profiles'],
      async fn(context: TestContext) {
        const authHelper = new AuthHelperV2(context);
        const client = context.createApiClient();
        
        // First authentication creates account and profile
        const firstAuth = await authHelper.authenticateWithWallet(client, 6);
        client.setAccessToken(firstAuth.tokens.accessToken);
        
        // Create additional profile
        const profileResponse = await client.post('/api/v1/profiles', {
          name: 'Trading Profile'
        });
        assertResponse(profileResponse, 201);
        
        // Re-authenticate - should return both profiles
        const secondAuth = await authHelper.authenticateWithWallet(client, 6);
        
        if (secondAuth.isNewUser) {
          throw new Error('Should recognize existing user');
        }
        
        if (secondAuth.profiles.length !== 2) {
          throw new Error('Expected to return all profiles');
        }
        
        const profileNames = secondAuth.profiles.map(p => p.name).sort();
        if (!profileNames.includes('My Smartprofile') || !profileNames.includes('Trading Profile')) {
          throw new Error('Missing expected profiles');
        }
      }
    },

    // ========== RATE LIMITING ==========
    {
      name: 'Authentication rate limiting',
      tags: ['security', 'rate-limit'],
      async fn(context: TestContext) {
        const authHelper = new AuthHelperV2(context);
        const client = context.createApiClient();
        
        await authHelper.testAuthRateLimiting(client);
      }
    },

    // ========== TOKEN MANAGEMENT ==========
    {
      name: 'POST /auth/refresh - Token refresh with accountId',
      tags: ['tokens'],
      async fn(context: TestContext) {
        const authHelper = new AuthHelperV2(context);
        const client = context.createApiClient();
        
        // Initial auth
        const auth = await authHelper.authenticateWithWallet(client, 7);
        
        // Refresh token
        const refreshResponse = await client.post('/api/v2/auth/refresh', {
          refreshToken: auth.tokens.refreshToken
        });
        
        assertResponse(refreshResponse, 200);
        const { tokens } = refreshResponse.data;
        
        if (!tokens || !tokens.accessToken || !tokens.refreshToken) {
          throw new Error('Missing tokens in refresh response');
        }
        
        // Verify new tokens work by making an authenticated request
        client.setAccessToken(tokens.accessToken);
        // For V2, we don't have a /me endpoint yet, so just verify the token format
        if (!tokens.accessToken.includes('.')) {
          throw new Error('Invalid access token format');
        }
      }
    },

    // ========== COMPREHENSIVE FLOW TEST ==========
    {
      name: 'Complete V2 authentication flow test',
      tags: ['integration', 'comprehensive'],
      async fn(context: TestContext) {
        const authHelper = new AuthHelperV2(context);
        const client = context.createApiClient();
        
        await authHelper.testCompleteAuthFlow(client, {
          primaryStrategy: 'wallet',
          linkStrategies: ['email', 'social'],
          testPrivacyModes: true
        });
      }
    },

    // ========== ERROR CASES ==========
    {
      name: 'POST /auth/authenticate - Invalid strategy',
      tags: ['error-handling'],
      async fn(context: TestContext) {
        const client = context.createApiClient();
        
        try {
          await client.post('/api/v2/auth/authenticate', {
            strategy: 'invalid_strategy'
          });
          throw new Error('Should reject invalid strategy');
        } catch (error) {
          assertErrorResponse(error, 400, /unsupported.*strategy|invalid.*strategy/i);
        }
      }
    },

    {
      name: 'POST /auth/authenticate - Missing required fields',
      tags: ['error-handling', 'validation'],
      async fn(context: TestContext) {
        const client = context.createApiClient();
        
        // Missing strategy
        try {
          await client.post('/api/v2/auth/authenticate', {});
          throw new Error('Should require strategy');
        } catch (error) {
          assertErrorResponse(error, 400);
        }
        
        // Missing wallet fields
        try {
          await client.post('/api/v2/auth/authenticate', {
            strategy: 'wallet'
          });
          throw new Error('Should require wallet fields');
        } catch (error) {
          assertErrorResponse(error, 400);
        }
      }
    }
  ]
};