import { TestSuite, TestContext } from '../../types';
import { AuthHelperV2 } from '../../utils/AuthHelperV2';
import { TestWallet, getTestWallet } from '../../utils/TestWallet';
import { assertResponse, assertErrorResponse } from '../../utils/ApiClient';
import { faker } from '@faker-js/faker';

export const accountLinkingSuite: TestSuite = {
  name: 'Account Linking - Flat Identity',
  description: 'Comprehensive testing of account linking with privacy modes and identity graph',
  tags: ['identity', 'linking', 'v2', 'critical'],
  priority: 'critical',
  endpoints: ['/api/v2/auth/link-accounts', '/api/v2/auth/identity-graph'],
  
  async setup(context: TestContext) {
    await context.checkDatabaseConnection();
  },

  async teardown(context: TestContext) {
    // Cleanup handled by TestContext
  },

  tests: [
    // ========== BASIC LINKING ==========
    {
      name: 'POST /link-accounts - Link wallet to email account',
      tags: ['linking', 'wallet', 'email'],
      async fn(context: TestContext) {
        const authHelper = new AuthHelperV2(context);
        const client = context.createApiClient();
        
        // Create primary email account
        const email = faker.internet.email();
        const emailAuth = await authHelper.authenticateWithEmail(client, email);
        client.setAccessToken(emailAuth.tokens.accessToken);
        
        // Link wallet account
        const wallet = getTestWallet(1);
        const linkResult = await authHelper.linkAccounts(
          client,
          'wallet',
          wallet.address
        );
        
        // Verify link created
        if (!linkResult.link) {
          throw new Error('Expected link to be created');
        }
        if (linkResult.link.linkType !== 'direct') {
          throw new Error('Expected direct link type');
        }
        if (linkResult.link.privacyMode !== 'linked') {
          throw new Error('Expected default privacy mode to be linked');
        }
        
        // Verify linked account
        if (linkResult.linkedAccount.type !== 'wallet') {
          throw new Error('Expected wallet account type');
        }
        if (linkResult.linkedAccount.identifier !== wallet.address.toLowerCase()) {
          throw new Error('Wallet address mismatch');
        }
        
        // Verify accessible profiles remain the same
        if (linkResult.accessibleProfiles.length !== emailAuth.profiles.length) {
          throw new Error('Accessible profiles should not change after linking');
        }
      }
    },

    {
      name: 'POST /link-accounts - Link social to wallet account',
      tags: ['linking', 'social', 'wallet'],
      async fn(context: TestContext) {
        const authHelper = new AuthHelperV2(context);
        const client = context.createApiClient();
        
        // Create primary wallet account
        const walletAuth = await authHelper.authenticateWithWallet(client, 2);
        client.setAccessToken(walletAuth.tokens.accessToken);
        
        // Link Google account
        const googleId = `google_${faker.string.uuid()}`;
        const linkResult = await authHelper.linkAccounts(
          client,
          'social',
          googleId,
          { targetProvider: 'google' }
        );
        
        if (linkResult.linkedAccount.provider !== 'google') {
          throw new Error('Expected Google provider');
        }
      }
    },

    {
      name: 'POST /link-accounts - Link multiple wallets',
      tags: ['linking', 'wallet', 'multiple'],
      async fn(context: TestContext) {
        const authHelper = new AuthHelperV2(context);
        const client = context.createApiClient();
        
        // Create primary account
        const primaryAuth = await authHelper.authenticateWithWallet(client, 3);
        client.setAccessToken(primaryAuth.tokens.accessToken);
        
        // Link multiple wallets
        const walletIds = [4, 5, 6];
        for (const walletId of walletIds) {
          const wallet = getTestWallet(walletId);
          await authHelper.linkAccounts(client, 'wallet', wallet.address);
        }
        
        // Verify identity graph
        const graph = await authHelper.getIdentityGraph(client);
        
        // Should have 4 accounts total (1 primary + 3 linked)
        if (graph.accounts.length !== 4) {
          throw new Error(`Expected 4 accounts, got ${graph.accounts.length}`);
        }
        
        // Should have 3 links
        if (graph.links.length !== 3) {
          throw new Error(`Expected 3 links, got ${graph.links.length}`);
        }
      }
    },

    // ========== PRIVACY MODES ==========
    {
      name: 'Account linking with different privacy modes',
      tags: ['linking', 'privacy'],
      async fn(context: TestContext) {
        const authHelper = new AuthHelperV2(context);
        const client = context.createApiClient();
        
        // Create primary account
        const primaryAuth = await authHelper.authenticateWithWallet(client, 7);
        client.setAccessToken(primaryAuth.tokens.accessToken);
        
        // Link with each privacy mode
        const privacyTests = [
          { mode: 'linked' as const, walletIndex: 8 },
          { mode: 'partial' as const, walletIndex: 9 },
          { mode: 'isolated' as const, walletIndex: 10 }
        ];
        
        for (const test of privacyTests) {
          const wallet = getTestWallet(test.walletIndex);
          const linkResult = await authHelper.linkAccounts(
            client,
            'wallet',
            wallet.address,
            { privacyMode: test.mode }
          );
          
          if (linkResult.link.privacyMode !== test.mode) {
            throw new Error(`Expected privacy mode ${test.mode}, got ${linkResult.link.privacyMode}`);
          }
        }
      }
    },

    {
      name: 'PUT /link-privacy - Update privacy mode',
      tags: ['privacy', 'update'],
      async fn(context: TestContext) {
        const authHelper = new AuthHelperV2(context);
        const client = context.createApiClient();
        
        // Create linked accounts
        const primaryAuth = await authHelper.authenticateWithWallet(client, 11);
        client.setAccessToken(primaryAuth.tokens.accessToken);
        
        const wallet = getTestWallet(12);
        const linkResult = await authHelper.linkAccounts(
          client,
          'wallet',
          wallet.address,
          { privacyMode: 'linked' }
        );
        
        // Update privacy mode
        const modes = ['partial', 'isolated', 'linked'] as const;
        for (const mode of modes) {
          const updateResult = await authHelper.updateLinkPrivacyMode(
            client,
            linkResult.linkedAccount.id,
            mode
          );
          
          if (updateResult.link.privacyMode !== mode) {
            throw new Error(`Failed to update privacy mode to ${mode}`);
          }
        }
      }
    },

    // ========== IDENTITY GRAPH ==========
    {
      name: 'GET /identity-graph - Basic graph retrieval',
      tags: ['identity-graph'],
      async fn(context: TestContext) {
        const authHelper = new AuthHelperV2(context);
        const client = context.createApiClient();
        
        // Create primary account
        const primaryAuth = await authHelper.authenticateWithWallet(client, 13);
        client.setAccessToken(primaryAuth.tokens.accessToken);
        
        // Initial graph should have just the primary account
        let graph = await authHelper.getIdentityGraph(client);
        if (graph.accounts.length !== 1) {
          throw new Error('Initial graph should have one account');
        }
        if (graph.links.length !== 0) {
          throw new Error('Initial graph should have no links');
        }
        
        // Link an email
        const email = faker.internet.email();
        await authHelper.linkAccounts(client, 'email', email);
        
        // Graph should now have 2 accounts and 1 link
        graph = await authHelper.getIdentityGraph(client);
        if (graph.accounts.length !== 2) {
          throw new Error('Graph should have two accounts after linking');
        }
        if (graph.links.length !== 1) {
          throw new Error('Graph should have one link');
        }
      }
    },

    {
      name: 'Identity graph with privacy boundaries',
      tags: ['identity-graph', 'privacy'],
      async fn(context: TestContext) {
        const authHelper = new AuthHelperV2(context);
        const client = context.createApiClient();
        
        // Create complex graph with different privacy modes
        const { accounts } = await authHelper.createComplexIdentityGraph(client);
        
        // Get full graph
        const graph = await authHelper.getIdentityGraph(client);
        
        // Verify isolated accounts are included in graph but marked as isolated
        const isolatedLinks = graph.links.filter(l => l.privacyMode === 'isolated');
        if (isolatedLinks.length !== 1) {
          throw new Error('Expected one isolated link');
        }
        
        // Verify partial links
        const partialLinks = graph.links.filter(l => l.privacyMode === 'partial');
        if (partialLinks.length !== 1) {
          throw new Error('Expected one partial link');
        }
      }
    },

    {
      name: 'Identity graph transitive relationships',
      tags: ['identity-graph', 'transitive'],
      async fn(context: TestContext) {
        const authHelper = new AuthHelperV2(context);
        const client = context.createApiClient();
        
        // Create A → B → C relationship
        // A: Primary wallet
        const authA = await authHelper.authenticateWithWallet(client, 14);
        client.setAccessToken(authA.tokens.accessToken);
        
        // Link B: Email
        const emailB = faker.internet.email();
        await authHelper.linkAccounts(client, 'email', emailB);
        
        // Authenticate as B
        const authB = await authHelper.authenticateWithEmail(client, emailB);
        client.setAccessToken(authB.tokens.accessToken);
        
        // Link C: Another wallet
        const walletC = getTestWallet(15);
        await authHelper.linkAccounts(client, 'wallet', walletC.address);
        
        // From A's perspective, should see all three accounts
        client.setAccessToken(authA.tokens.accessToken);
        const graphFromA = await authHelper.getIdentityGraph(client);
        if (graphFromA.accounts.length < 3) {
          throw new Error('Should see transitive relationships from A');
        }
        
        // From C's perspective, should also see all three
        const authC = await authHelper.authenticateWithWallet(client, 15);
        client.setAccessToken(authC.tokens.accessToken);
        const graphFromC = await authHelper.getIdentityGraph(client);
        if (graphFromC.accounts.length < 3) {
          throw new Error('Should see transitive relationships from C');
        }
      }
    },

    // ========== PROFILE ACCESS ==========
    {
      name: 'Profile access after linking accounts',
      tags: ['linking', 'profiles'],
      async fn(context: TestContext) {
        const authHelper = new AuthHelperV2(context);
        const client = context.createApiClient();
        
        // Create account A with profile
        const authA = await authHelper.authenticateWithWallet(client, 16);
        client.setAccessToken(authA.tokens.accessToken);
        
        // Create additional profile
        const profileResponse = await client.post('/api/v1/profiles', {
          name: 'Gaming Profile'
        });
        assertResponse(profileResponse, 201);
        
        // Create account B with its own profile
        const authB = await authHelper.authenticateWithEmail(
          client,
          faker.internet.email()
        );
        
        // Link accounts
        client.setAccessToken(authA.tokens.accessToken);
        await authHelper.linkAccounts(client, 'email', authB.account.identifier);
        
        // Account B should now see both profiles
        client.setAccessToken(authB.tokens.accessToken);
        const profilesResponse = await client.get('/api/v1/profiles');
        
        // Should see at least 3 profiles (A's 2 profiles + B's 1 profile)
        if (profilesResponse.data.data.length < 3) {
          throw new Error('Linked account should see all profiles');
        }
      }
    },

    // ========== ERROR CASES ==========
    {
      name: 'POST /link-accounts - Prevent self-linking',
      tags: ['linking', 'error-handling'],
      async fn(context: TestContext) {
        const authHelper = new AuthHelperV2(context);
        const client = context.createApiClient();
        
        // Authenticate
        const auth = await authHelper.authenticateWithWallet(client, 17);
        client.setAccessToken(auth.tokens.accessToken);
        
        // Try to link to self
        try {
          await authHelper.linkAccounts(
            client,
            'wallet',
            getTestWallet(17).address
          );
          throw new Error('Should prevent self-linking');
        } catch (error) {
          assertErrorResponse(error, 400, /already.*linked|self/i);
        }
      }
    },

    {
      name: 'POST /link-accounts - Prevent duplicate linking',
      tags: ['linking', 'error-handling'],
      async fn(context: TestContext) {
        const authHelper = new AuthHelperV2(context);
        const client = context.createApiClient();
        
        // Create two accounts
        const authA = await authHelper.authenticateWithWallet(client, 18);
        const authB = await authHelper.authenticateWithWallet(client, 19);
        
        // Link them
        client.setAccessToken(authA.tokens.accessToken);
        await authHelper.linkAccounts(client, 'wallet', getTestWallet(19).address);
        
        // Try to link again
        try {
          await authHelper.linkAccounts(client, 'wallet', getTestWallet(19).address);
          throw new Error('Should prevent duplicate linking');
        } catch (error) {
          assertErrorResponse(error, 400, /already.*linked/i);
        }
      }
    },

    {
      name: 'POST /link-accounts - Circular linking prevention',
      tags: ['linking', 'error-handling'],
      async fn(context: TestContext) {
        const authHelper = new AuthHelperV2(context);
        const client = context.createApiClient();
        
        // This is actually allowed in the flat model as all accounts
        // in the identity graph are interconnected
        // Test is to ensure it doesn't cause errors
        
        // Create A → B
        const authA = await authHelper.authenticateWithWallet(client, 20);
        client.setAccessToken(authA.tokens.accessToken);
        const walletB = getTestWallet(21);
        await authHelper.linkAccounts(client, 'wallet', walletB.address);
        
        // Create B → C
        const authB = await authHelper.authenticateWithWallet(client, 21);
        client.setAccessToken(authB.tokens.accessToken);
        const walletC = getTestWallet(22);
        await authHelper.linkAccounts(client, 'wallet', walletC.address);
        
        // Create C → A (completing the circle)
        const authC = await authHelper.authenticateWithWallet(client, 22);
        client.setAccessToken(authC.tokens.accessToken);
        
        // This should either succeed (creating a fully connected graph)
        // or fail gracefully if the system prevents it
        try {
          await authHelper.linkAccounts(client, 'wallet', getTestWallet(20).address);
          // If it succeeds, verify the graph is complete
          const graph = await authHelper.getIdentityGraph(client);
          if (graph.accounts.length !== 3) {
            throw new Error('Expected 3 accounts in circular graph');
          }
        } catch (error) {
          // If it fails, it should be with a clear message
          assertErrorResponse(error, 400, /already.*linked|circular/i);
        }
      }
    },

    {
      name: 'POST /link-accounts - Invalid account type',
      tags: ['linking', 'validation'],
      async fn(context: TestContext) {
        const authHelper = new AuthHelperV2(context);
        const client = context.createApiClient();
        
        const auth = await authHelper.authenticateWithWallet(client, 23);
        client.setAccessToken(auth.tokens.accessToken);
        
        try {
          await client.post('/api/v2/auth/link-accounts', {
            targetType: 'invalid_type',
            targetIdentifier: 'something'
          });
          throw new Error('Should reject invalid account type');
        } catch (error) {
          assertErrorResponse(error, 400, /invalid.*type/i);
        }
      }
    },

    // ========== PERFORMANCE ==========
    {
      name: 'Large identity graph performance',
      tags: ['performance', 'identity-graph'],
      async fn(context: TestContext) {
        const authHelper = new AuthHelperV2(context);
        const client = context.createApiClient();
        
        // Create primary account
        const primaryAuth = await authHelper.authenticateWithWallet(client, 24);
        client.setAccessToken(primaryAuth.tokens.accessToken);
        
        // Link 10 accounts (reasonable for testing)
        const startTime = Date.now();
        
        for (let i = 0; i < 10; i++) {
          if (i % 3 === 0) {
            await authHelper.linkAccounts(client, 'email', faker.internet.email());
          } else if (i % 3 === 1) {
            const wallet = TestWallet.fromSeed(`test_wallet_${i}`);
            await authHelper.linkAccounts(client, 'wallet', wallet.address);
          } else {
            await authHelper.linkAccounts(
              client,
              'social',
              `google_${faker.string.uuid()}`,
              { targetProvider: 'google' }
            );
          }
        }
        
        const linkTime = Date.now() - startTime;
        
        // Verify performance
        if (linkTime > 10000) { // 10 seconds for 10 links
          throw new Error(`Linking too slow: ${linkTime}ms for 10 accounts`);
        }
        
        // Test graph retrieval performance
        const graphStartTime = Date.now();
        const graph = await authHelper.getIdentityGraph(client);
        const graphTime = Date.now() - graphStartTime;
        
        if (graphTime > 500) { // 500ms for graph retrieval
          throw new Error(`Graph retrieval too slow: ${graphTime}ms`);
        }
        
        if (graph.accounts.length !== 11) { // 1 primary + 10 linked
          throw new Error(`Expected 11 accounts, got ${graph.accounts.length}`);
        }
      }
    },

    // ========== PROFILE SWITCHING ==========
    {
      name: 'POST /switch-profile - Switch between accessible profiles',
      tags: ['profiles', 'switching'],
      async fn(context: TestContext) {
        const authHelper = new AuthHelperV2(context);
        const client = context.createApiClient();
        
        // Create account with multiple profiles
        const auth = await authHelper.authenticateWithWallet(client, 25);
        client.setAccessToken(auth.tokens.accessToken);
        
        // Create additional profiles
        const profile2Response = await client.post('/api/v1/profiles', {
          name: 'Work Profile'
        });
        const profile2 = profile2Response.data.data;
        
        const profile3Response = await client.post('/api/v1/profiles', {
          name: 'Personal Profile'
        });
        const profile3 = profile3Response.data.data;
        
        // Switch to profile 2
        const switch2Result = await authHelper.switchProfile(client, profile2.id);
        if (switch2Result.activeProfile.id !== profile2.id) {
          throw new Error('Failed to switch to profile 2');
        }
        
        // Switch to profile 3
        const switch3Result = await authHelper.switchProfile(client, profile3.id);
        if (switch3Result.activeProfile.id !== profile3.id) {
          throw new Error('Failed to switch to profile 3');
        }
        
        // Switch back to original
        const switch1Result = await authHelper.switchProfile(client, auth.profiles[0].id);
        if (switch1Result.activeProfile.id !== auth.profiles[0].id) {
          throw new Error('Failed to switch back to original profile');
        }
      }
    },

    {
      name: 'POST /switch-profile - Cannot switch to inaccessible profile',
      tags: ['profiles', 'switching', 'security'],
      async fn(context: TestContext) {
        const authHelper = new AuthHelperV2(context);
        const client = context.createApiClient();
        
        // Create two separate accounts
        const auth1 = await authHelper.authenticateWithWallet(client, 26);
        const auth2 = await authHelper.authenticateWithWallet(client, 27);
        
        // Try to switch from account 1 to account 2's profile
        client.setAccessToken(auth1.tokens.accessToken);
        
        try {
          await authHelper.switchProfile(client, auth2.profiles[0].id);
          throw new Error('Should not allow switching to inaccessible profile');
        } catch (error) {
          assertErrorResponse(error, 404, /not.*found|not.*accessible/i);
        }
      }
    }
  ]
};
