import { TestSuite, TestContext } from '../../types';
import { AuthHelperV2 } from '../../utils/AuthHelperV2';
import { TestWallet } from '../../utils/TestWallet';
import { assertResponse, assertErrorResponse } from '../../utils/ApiClient';
import { faker } from '@faker-js/faker';

export const profileManagementV2Suite: TestSuite = {
  name: 'Profile Management V2 - Flat Identity',
  description: 'Testing automatic profile creation and management in flat identity model',
  tags: ['profiles', 'v2', 'critical'],
  priority: 'high',
  endpoints: ['/api/v1/profiles', '/api/v2/auth/switch-profile'],
  
  async setup(context: TestContext) {
    await context.checkDatabaseConnection();
  },

  async teardown(context: TestContext) {
    // Cleanup handled by TestContext
  },

  tests: [
    // ========== AUTOMATIC PROFILE CREATION ==========
    {
      name: 'Automatic "My Smartprofile" creation on first auth',
      tags: ['profile-creation', 'automatic'],
      async fn(context: TestContext) {
        const authHelper = new AuthHelperV2(context);
        const client = context.createApiClient();
        
        // Test with each authentication strategy
        const strategies = [
          { type: 'wallet', index: 30 },
          { type: 'email', email: faker.internet.email() },
          { type: 'social', provider: 'google' },
          { type: 'guest' }
        ];
        
        for (const strategy of strategies) {
          let auth;
          
          if (strategy.type === 'wallet') {
            auth = await authHelper.authenticateWithWallet(client, strategy.index);
          } else if (strategy.type === 'email' && strategy.email) {
            auth = await authHelper.authenticateWithEmail(client, strategy.email);
          } else if (strategy.type === 'social' && strategy.provider) {
            auth = await authHelper.authenticateWithSocial(client, strategy.provider as 'google' | 'apple');
          } else {
            const response = await client.post('/api/v2/auth/authenticate', {
              strategy: 'guest'
            });
            auth = response.data;
          }
          
          // Verify automatic profile creation
          if (!auth.profiles || auth.profiles.length !== 1) {
            throw new Error(`No automatic profile for ${strategy.type} auth`);
          }
          
          const profile = auth.profiles[0];
          if (profile.name !== 'My Smartprofile') {
            throw new Error(`Wrong profile name for ${strategy.type}: ${profile.name}`);
          }
          
          if (!profile.isActive) {
            throw new Error(`Profile not active for ${strategy.type}`);
          }
          
          if (!profile.sessionWalletAddress) {
            throw new Error(`No session wallet for ${strategy.type}`);
          }
          
          // Verify it's the active profile
          if (!auth.activeProfile || auth.activeProfile.id !== profile.id) {
            throw new Error(`Profile not set as active for ${strategy.type}`);
          }
        }
      }
    },

    {
      name: 'Session wallet creation modes',
      tags: ['profile-creation', 'session-wallet'],
      async fn(context: TestContext) {
        const authHelper = new AuthHelperV2(context);
        const client = context.createApiClient();
        
        // In development mode, should create development wallet
        if (process.env.MPC_DISABLED === 'true') {
          const auth = await authHelper.authenticateWithWallet(client, 35);
          
          // Development wallets have specific properties
          // This would be verified through additional endpoints
          if (!auth.profiles[0].sessionWalletAddress) {
            throw new Error('Expected session wallet even in dev mode');
          }
        }
      }
    },

    {
      name: 'Profile naming conflict handling',
      tags: ['profile-creation', 'edge-case'],
      async fn(context: TestContext) {
        const authHelper = new AuthHelperV2(context);
        const client = context.createApiClient();
        
        // Create first account
        const auth1 = await authHelper.authenticateWithWallet(client, 36);
        client.setAccessToken(auth1.tokens.accessToken);
        
        // Manually create a profile with same name
        try {
          const response = await client.post('/api/v1/profiles', {
            name: 'My Smartprofile'
          });
          
          // Should either allow duplicate names or generate unique name
          assertResponse(response, 201);
          const newProfile = response.data.data;
          
          // Profile should be created with either same name or modified name
          if (!newProfile.name.includes('Smartprofile')) {
            throw new Error('Profile name should contain Smartprofile');
          }
        } catch (error) {
          // If it rejects duplicate names, that's also acceptable
          assertErrorResponse(error, 400, /name.*exists|duplicate/i);
        }
      }
    },

    // ========== PROFILE ACCESS CONTROL ==========
    {
      name: 'Profile access based on identity graph',
      tags: ['access-control', 'identity-graph'],
      async fn(context: TestContext) {
        const authHelper = new AuthHelperV2(context);
        const client = context.createApiClient();
        
        // Create account A with multiple profiles
        const authA = await authHelper.authenticateWithWallet(client, 37);
        client.setAccessToken(authA.tokens.accessToken);
        
        const profileB = await client.post('/api/v1/profiles', {
          name: 'Business Profile'
        });
        
        const profileC = await client.post('/api/v1/profiles', {
          name: 'Creative Profile'
        });
        
        // Create separate account B
        const authB = await authHelper.authenticateWithWallet(client, 38);
        
        // Account B should only see its own profile
        client.setAccessToken(authB.tokens.accessToken);
        let profilesResponse = await client.get('/api/v1/profiles');
        if (profilesResponse.data.data.length !== 1) {
          throw new Error('Unlinked account should only see own profiles');
        }
        
        // Link accounts
        client.setAccessToken(authA.tokens.accessToken);
        await authHelper.linkAccounts(client, 'wallet', new TestWallet(38).address);
        
        // Now account B should see all profiles
        client.setAccessToken(authB.tokens.accessToken);
        profilesResponse = await client.get('/api/v1/profiles');
        if (profilesResponse.data.data.length !== 4) { // A's 3 + B's 1
          throw new Error('Linked account should see all profiles');
        }
      }
    },

    {
      name: 'Privacy mode enforcement on profile access',
      tags: ['access-control', 'privacy'],
      async fn(context: TestContext) {
        const authHelper = new AuthHelperV2(context);
        const client = context.createApiClient();
        
        // Create primary account with profile
        const authPrimary = await authHelper.authenticateWithWallet(client, 39);
        client.setAccessToken(authPrimary.tokens.accessToken);
        
        // Link account with isolated privacy
        const isolatedWallet = new TestWallet(40);
        await authHelper.linkAccounts(
          client,
          'wallet',
          isolatedWallet.address,
          { privacyMode: 'isolated' }
        );
        
        // Authenticate as isolated account
        const authIsolated = await authHelper.authenticateWithWallet(client, 40);
        
        // Isolated account should only see its own profile
        client.setAccessToken(authIsolated.tokens.accessToken);
        const profilesResponse = await client.get('/api/v1/profiles');
        
        if (profilesResponse.data.data.length !== 1) {
          throw new Error('Isolated account should only see own profile');
        }
        
        if (profilesResponse.data.data[0].id === authPrimary.profiles[0].id) {
          throw new Error('Isolated account should not see primary profile');
        }
      }
    },

    // ========== PROFILE OPERATIONS ==========
    {
      name: 'POST /profiles - Create additional profiles',
      tags: ['profile-operations', 'create'],
      async fn(context: TestContext) {
        const authHelper = new AuthHelperV2(context);
        const client = context.createApiClient();
        
        const auth = await authHelper.authenticateWithWallet(client, 41);
        client.setAccessToken(auth.tokens.accessToken);
        
        // Create multiple profiles
        const profileNames = [
          'Trading Profile',
          'Gaming Profile',
          'NFT Collection',
          'DeFi Portfolio'
        ];
        
        const createdProfiles = [];
        for (const name of profileNames) {
          const response = await client.post('/api/v1/profiles', { name });
          assertResponse(response, 201);
          createdProfiles.push(response.data.data);
        }
        
        // Verify all profiles exist
        const profilesResponse = await client.get('/api/v1/profiles');
        if (profilesResponse.data.data.length !== profileNames.length + 1) {
          throw new Error('Not all profiles created');
        }
        
        // Verify each has session wallet
        for (const profile of createdProfiles) {
          if (!profile.sessionWalletAddress) {
            throw new Error(`Profile ${profile.name} missing session wallet`);
          }
        }
      }
    },

    {
      name: 'PUT /profiles/:id - Update profile metadata',
      tags: ['profile-operations', 'update'],
      async fn(context: TestContext) {
        const authHelper = new AuthHelperV2(context);
        const client = context.createApiClient();
        
        const auth = await authHelper.authenticateWithWallet(client, 42);
        client.setAccessToken(auth.tokens.accessToken);
        
        const profileId = auth.profiles[0].id;
        
        // Update profile name
        const updateResponse = await client.put(`/api/v1/profiles/${profileId}`, {
          name: 'Updated Profile Name'
        });
        
        assertResponse(updateResponse, 200);
        
        if (updateResponse.data.data.name !== 'Updated Profile Name') {
          throw new Error('Profile name not updated');
        }
      }
    },

    {
      name: 'DELETE /profiles/:id - Delete profile with reassignment',
      tags: ['profile-operations', 'delete'],
      async fn(context: TestContext) {
        const authHelper = new AuthHelperV2(context);
        const client = context.createApiClient();
        
        const auth = await authHelper.authenticateWithWallet(client, 43);
        client.setAccessToken(auth.tokens.accessToken);
        
        // Create additional profile
        const profile2Response = await client.post('/api/v1/profiles', {
          name: 'Temporary Profile'
        });
        const profile2 = profile2Response.data.data;
        
        // Try to delete the only active profile (should fail)
        try {
          await client.delete(`/api/v1/profiles/${auth.profiles[0].id}`);
          throw new Error('Should not delete only active profile');
        } catch (error) {
          assertErrorResponse(error, 400, /active|cannot.*delete/i);
        }
        
        // Make profile2 active
        await authHelper.switchProfile(client, profile2.id);
        
        // Now delete the original profile
        const deleteResponse = await client.delete(`/api/v1/profiles/${auth.profiles[0].id}`);
        assertResponse(deleteResponse, 200);
        
        // Verify profile is gone
        const profilesResponse = await client.get('/api/v1/profiles');
        const remainingProfiles = profilesResponse.data.data;
        
        if (remainingProfiles.find((p: any) => p.id === auth.profiles[0].id)) {
          throw new Error('Profile not deleted');
        }
      }
    },

    {
      name: 'Cannot delete last profile',
      tags: ['profile-operations', 'delete', 'validation'],
      async fn(context: TestContext) {
        const authHelper = new AuthHelperV2(context);
        const client = context.createApiClient();
        
        const auth = await authHelper.authenticateWithWallet(client, 44);
        client.setAccessToken(auth.tokens.accessToken);
        
        // Try to delete the only profile
        try {
          await client.delete(`/api/v1/profiles/${auth.profiles[0].id}`);
          throw new Error('Should not delete last profile');
        } catch (error) {
          assertErrorResponse(error, 400, /last.*profile|cannot.*delete/i);
        }
      }
    },

    // ========== PROFILE SWITCHING ==========
    {
      name: 'Profile switching updates session state',
      tags: ['profile-switching', 'session'],
      async fn(context: TestContext) {
        const authHelper = new AuthHelperV2(context);
        const client = context.createApiClient();
        
        const auth = await authHelper.authenticateWithWallet(client, 45);
        client.setAccessToken(auth.tokens.accessToken);
        
        // Create second profile
        const profile2Response = await client.post('/api/v1/profiles', {
          name: 'Alt Profile'
        });
        const profile2 = profile2Response.data.data;
        
        // Get current active profile
        let meResponse = await client.get('/api/v1/auth/me');
        const initialActiveProfile = meResponse.data.data.activeProfile;
        
        if (initialActiveProfile.id !== auth.profiles[0].id) {
          throw new Error('Initial active profile mismatch');
        }
        
        // Switch profile
        await authHelper.switchProfile(client, profile2.id);
        
        // Verify active profile changed
        meResponse = await client.get('/api/v1/auth/me');
        const newActiveProfile = meResponse.data.data.activeProfile;
        
        if (newActiveProfile.id !== profile2.id) {
          throw new Error('Active profile not updated after switch');
        }
      }
    },

    {
      name: 'Profile switching persists across sessions',
      tags: ['profile-switching', 'persistence'],
      async fn(context: TestContext) {
        const authHelper = new AuthHelperV2(context);
        const client = context.createApiClient();
        
        // Initial auth
        const auth1 = await authHelper.authenticateWithWallet(client, 46);
        client.setAccessToken(auth1.tokens.accessToken);
        
        // Create and switch to second profile
        const profile2Response = await client.post('/api/v1/profiles', {
          name: 'Persistent Profile'
        });
        const profile2 = profile2Response.data.data;
        
        await authHelper.switchProfile(client, profile2.id);
        
        // Re-authenticate
        const auth2 = await authHelper.authenticateWithWallet(client, 46);
        
        // Check if authentication response includes activeProfile
        // This would be implementation specific
        client.setAccessToken(auth2.tokens.accessToken);
        const meResponse = await client.get('/api/v1/auth/me');
        
        if (meResponse.data.data.activeProfile?.id !== profile2.id) {
          throw new Error('Profile switch did not persist across sessions');
        }
      }
    },

    // ========== LINKED ACCOUNTS & PROFILES ==========
    {
      name: 'Linked accounts share profiles correctly',
      tags: ['linked-accounts', 'profile-sharing'],
      async fn(context: TestContext) {
        const authHelper = new AuthHelperV2(context);
        const client = context.createApiClient();
        
        // Create primary account with multiple profiles
        const authPrimary = await authHelper.authenticateWithWallet(client, 47);
        client.setAccessToken(authPrimary.tokens.accessToken);
        
        await client.post('/api/v1/profiles', { name: 'Shared Profile 1' });
        await client.post('/api/v1/profiles', { name: 'Shared Profile 2' });
        
        // Link email account
        const email = faker.internet.email();
        await authHelper.linkAccounts(client, 'email', email);
        
        // Auth with email
        const authEmail = await authHelper.authenticateWithEmail(client, email);
        
        // Should see all profiles plus its own
        if (authEmail.profiles.length !== 4) { // 3 from primary + 1 auto-created
          throw new Error('Linked account not seeing all profiles');
        }
        
        // Can switch between any profile
        client.setAccessToken(authEmail.tokens.accessToken);
        for (const profile of authEmail.profiles) {
          await authHelper.switchProfile(client, profile.id);
        }
      }
    },

    {
      name: 'Profile operations across linked accounts',
      tags: ['linked-accounts', 'profile-operations'],
      async fn(context: TestContext) {
        const authHelper = new AuthHelperV2(context);
        const client = context.createApiClient();
        
        // Create two linked accounts
        const auth1 = await authHelper.authenticateWithWallet(client, 48);
        client.setAccessToken(auth1.tokens.accessToken);
        
        const wallet2 = new TestWallet(49);
        await authHelper.linkAccounts(client, 'wallet', wallet2.address);
        
        // Create profile from account 1
        const profileResponse = await client.post('/api/v1/profiles', {
          name: 'Cross-Account Profile'
        });
        const profile = profileResponse.data.data;
        
        // Switch to account 2
        const auth2 = await authHelper.authenticateWithWallet(client, 49);
        client.setAccessToken(auth2.tokens.accessToken);
        
        // Should be able to update profile created by account 1
        const updateResponse = await client.put(`/api/v1/profiles/${profile.id}`, {
          name: 'Updated by Account 2'
        });
        
        assertResponse(updateResponse, 200);
        
        // Both accounts should see the update
        client.setAccessToken(auth1.tokens.accessToken);
        const profileCheck = await client.get(`/api/v1/profiles/${profile.id}`);
        
        if (profileCheck.data.data.name !== 'Updated by Account 2') {
          throw new Error('Profile update not visible across accounts');
        }
      }
    },

    // ========== ERROR HANDLING ==========
    {
      name: 'Profile operations on non-existent profile',
      tags: ['error-handling'],
      async fn(context: TestContext) {
        const authHelper = new AuthHelperV2(context);
        const client = context.createApiClient();
        
        const auth = await authHelper.authenticateWithWallet(client, 50);
        client.setAccessToken(auth.tokens.accessToken);
        
        const fakeProfileId = faker.string.uuid();
        
        // Update non-existent
        try {
          await client.put(`/api/v1/profiles/${fakeProfileId}`, {
            name: 'New Name'
          });
          throw new Error('Should fail on non-existent profile');
        } catch (error) {
          assertErrorResponse(error, 404);
        }
        
        // Delete non-existent
        try {
          await client.delete(`/api/v1/profiles/${fakeProfileId}`);
          throw new Error('Should fail on non-existent profile');
        } catch (error) {
          assertErrorResponse(error, 404);
        }
        
        // Switch to non-existent
        try {
          await authHelper.switchProfile(client, fakeProfileId);
          throw new Error('Should fail on non-existent profile');
        } catch (error) {
          assertErrorResponse(error, 404);
        }
      }
    },

    // ========== PERFORMANCE ==========
    {
      name: 'Profile operations performance',
      tags: ['performance'],
      async fn(context: TestContext) {
        const authHelper = new AuthHelperV2(context);
        const client = context.createApiClient();
        
        const auth = await authHelper.authenticateWithWallet(client, 51);
        client.setAccessToken(auth.tokens.accessToken);
        
        // Create 10 profiles
        const startCreate = Date.now();
        for (let i = 0; i < 10; i++) {
          await client.post('/api/v1/profiles', {
            name: `Performance Test ${i}`
          });
        }
        const createTime = Date.now() - startCreate;
        
        if (createTime > 5000) { // 5 seconds for 10 profiles
          throw new Error(`Profile creation too slow: ${createTime}ms`);
        }
        
        // List profiles
        const startList = Date.now();
        const profilesResponse = await client.get('/api/v1/profiles');
        const listTime = Date.now() - startList;
        
        if (listTime > 200) { // 200ms for listing
          throw new Error(`Profile listing too slow: ${listTime}ms`);
        }
        
        // Profile switching
        const profiles = profilesResponse.data.data;
        const startSwitch = Date.now();
        
        for (let i = 0; i < 5; i++) {
          const profile = profiles[i % profiles.length];
          await authHelper.switchProfile(client, profile.id);
        }
        
        const switchTime = Date.now() - startSwitch;
        if (switchTime > 1000) { // 1 second for 5 switches
          throw new Error(`Profile switching too slow: ${switchTime}ms`);
        }
      }
    }
  ]
};
