import { TestContext, ApiClient } from '../types';
import { TestWallet } from './TestWallet';
import { faker } from '@faker-js/faker';
import crypto from 'crypto';

/**
 * Authentication helper for V2 flat identity model testing
 */
export class AuthHelperV2 {
  constructor(private context: TestContext) {}

  /**
   * Authenticate with wallet (SIWE)
   */
  async authenticateWithWallet(
    client: ApiClient,
    walletIndex: number = 0,
    options: {
      nonce?: string;
      privacyMode?: 'linked' | 'partial' | 'isolated';
      expectNewUser?: boolean;
    } = {}
  ): Promise<{
    account: any;
    profiles: any[];
    tokens: any;
    isNewUser: boolean;
  }> {
    // Get nonce if not provided
    let nonce = options.nonce;
    if (!nonce) {
      const nonceResponse = await client.get('/api/v1/siwe/nonce');
      nonce = nonceResponse.data.data.nonce;
    }

    // Generate auth payload
    const wallet = new TestWallet(walletIndex);
    const authPayload = await wallet.generateAuthPayload({ nonce });

    // Authenticate
    const response = await client.post('/api/v2/auth/authenticate', {
      strategy: 'wallet',
      ...authPayload,
      privacyMode: options.privacyMode
    });

    const { account, profiles, tokens, isNewUser } = response.data;

    // Verify expectations
    if (options.expectNewUser !== undefined) {
      if (isNewUser !== options.expectNewUser) {
        throw new Error(`Expected isNewUser to be ${options.expectNewUser}, got ${isNewUser}`);
      }
    }

    return { account, profiles, tokens, isNewUser };
  }

  /**
   * Authenticate with email
   */
  async authenticateWithEmail(
    client: ApiClient,
    email: string,
    options: {
      verificationCode?: string;
      privacyMode?: 'linked' | 'partial' | 'isolated';
      expectNewUser?: boolean;
    } = {}
  ): Promise<{
    account: any;
    profiles: any[];
    tokens: any;
    isNewUser: boolean;
  }> {
    // Send verification code if not provided
    let verificationCode = options.verificationCode;
    if (!verificationCode) {
      await client.post('/api/v2/auth/send-email-code', { email });
      // In test environment, we'd mock the email service to return a known code
      verificationCode = '123456';
    }

    // Authenticate
    const response = await client.post('/api/v2/auth/authenticate', {
      strategy: 'email',
      email,
      verificationCode,
      privacyMode: options.privacyMode
    });

    const { account, profiles, tokens, isNewUser } = response.data;

    if (options.expectNewUser !== undefined && isNewUser !== options.expectNewUser) {
      throw new Error(`Expected isNewUser to be ${options.expectNewUser}, got ${isNewUser}`);
    }

    return { account, profiles, tokens, isNewUser };
  }

  /**
   * Authenticate with social provider
   */
  async authenticateWithSocial(
    client: ApiClient,
    provider: 'google' | 'apple',
    options: {
      providerId?: string;
      email?: string;
      privacyMode?: 'linked' | 'partial' | 'isolated';
    } = {}
  ): Promise<{
    account: any;
    profiles: any[];
    tokens: any;
  }> {
    // Generate mock ID token
    const idToken = this.generateMockIdToken(provider, {
      sub: options.providerId || faker.string.uuid(),
      email: options.email || faker.internet.email()
    });

    const response = await client.post('/api/v2/auth/authenticate', {
      strategy: provider,
      idToken,
      privacyMode: options.privacyMode
    });

    return response.data;
  }

  /**
   * Link accounts together
   */
  async linkAccounts(
    client: ApiClient,
    targetType: 'wallet' | 'email' | 'social',
    targetIdentifier: string,
    options: {
      targetProvider?: string;
      privacyMode?: 'linked' | 'partial' | 'isolated';
      linkType?: 'direct' | 'inferred';
    } = {}
  ): Promise<{
    link: any;
    linkedAccount: any;
    accessibleProfiles: any[];
  }> {
    const payload: any = {
      targetType,
      targetIdentifier,
      privacyMode: options.privacyMode || 'linked',
      linkType: options.linkType || 'direct'
    };

    if (targetType === 'social' && options.targetProvider) {
      payload.targetProvider = options.targetProvider;
    }

    const response = await client.post('/api/v2/auth/link-accounts', payload);
    return response.data;
  }

  /**
   * Update link privacy mode
   */
  async updateLinkPrivacyMode(
    client: ApiClient,
    targetAccountId: string,
    privacyMode: 'linked' | 'partial' | 'isolated'
  ): Promise<{ link: any }> {
    const response = await client.put('/api/v2/auth/link-privacy', {
      targetAccountId,
      privacyMode
    });
    return response.data;
  }

  /**
   * Get identity graph
   */
  async getIdentityGraph(client: ApiClient): Promise<{
    accounts: any[];
    links: any[];
    currentAccountId: string;
  }> {
    const response = await client.get('/api/v2/auth/identity-graph');
    return response.data;
  }

  /**
   * Switch active profile
   */
  async switchProfile(client: ApiClient, profileId: string): Promise<{
    activeProfile: any;
  }> {
    const response = await client.post(`/api/v2/auth/switch-profile/${profileId}`);
    return response.data;
  }

  /**
   * Test rate limiting on auth endpoints
   */
  async testAuthRateLimiting(client: ApiClient): Promise<void> {
    const attempts = 15; // Assuming rate limit is 10 per window
    const results: Array<{ attempt: number; success: boolean; status?: number }> = [];

    for (let i = 0; i < attempts; i++) {
      try {
        await client.post('/api/v2/auth/authenticate', {
          strategy: 'guest'
        });
        results.push({ attempt: i + 1, success: true });
      } catch (error: any) {
        results.push({ 
          attempt: i + 1, 
          success: false, 
          status: error.response?.status || error.status
        });
      }
    }

    // Verify rate limiting kicked in
    const rateLimited = results.filter(r => r.status === 429);
    if (rateLimited.length === 0) {
      throw new Error('Rate limiting not working - no 429 responses');
    }
  }

  /**
   * Test complete V2 authentication flow
   */
  async testCompleteAuthFlow(
    client: ApiClient,
    options: {
      primaryStrategy: 'wallet' | 'email' | 'social';
      linkStrategies?: Array<'wallet' | 'email' | 'social'>;
      testPrivacyModes?: boolean;
    } = { primaryStrategy: 'wallet' }
  ): Promise<void> {
    // 1. Initial authentication
    let authResult: {
      account: any;
      profiles: any[];
      tokens: any;
      isNewUser: boolean;
    };
    
    if (options.primaryStrategy === 'wallet') {
      // Use a unique wallet index for this test
      const uniqueWalletIndex = Math.floor(Math.random() * 1000) + 100;
      authResult = await this.authenticateWithWallet(client, uniqueWalletIndex, { expectNewUser: true });
    } else if (options.primaryStrategy === 'email') {
      const email = faker.internet.email();
      authResult = await this.authenticateWithEmail(client, email, { expectNewUser: true });
    } else {
      throw new Error(`Unsupported primary strategy: ${options.primaryStrategy}`);
    }

    // Verify automatic profile creation
    if (!authResult.profiles || authResult.profiles.length !== 1) {
      throw new Error('Expected automatic profile creation');
    }
    if (authResult.profiles[0].name !== 'My Smartprofile') {
      throw new Error('Expected profile name to be "My Smartprofile"');
    }

    // Set auth token
    client.setAccessToken(authResult.tokens.accessToken);

    // 2. Link additional accounts
    if (options.linkStrategies) {
      for (const strategy of options.linkStrategies) {
        if (strategy === 'wallet') {
          const wallet = new TestWallet(1);
          await this.linkAccounts(client, 'wallet', wallet.address);
        } else if (strategy === 'email') {
          const email = faker.internet.email();
          await this.linkAccounts(client, 'email', email);
        }
      }
    }

    // 3. Test privacy modes
    if (options.testPrivacyModes) {
      const graph = await this.getIdentityGraph(client);
      if (graph.links.length > 0) {
        const link = graph.links[0];
        const targetId = link.accountAId === authResult.account.id 
          ? link.accountBId 
          : link.accountAId;

        // Test each privacy mode
        for (const mode of ['partial', 'isolated', 'linked'] as const) {
          await this.updateLinkPrivacyMode(client, targetId, mode);
        }
      }
    }

    // 4. Test profile switching if multiple profiles
    const profilesResponse = await client.get('/api/v1/profiles');
    if (profilesResponse.data.data.length > 1) {
      const otherProfile = profilesResponse.data.data.find(
        (p: any) => p.id !== authResult!.profiles[0].id
      );
      if (otherProfile) {
        await this.switchProfile(client, otherProfile.id);
      }
    }

    // 5. Test token refresh
    const refreshResponse = await client.post('/api/v2/auth/refresh', {
      refreshToken: authResult.tokens.refreshToken
    });
    if (!refreshResponse.data.accessToken) {
      throw new Error('Token refresh failed');
    }
  }

  /**
   * Generate mock ID token for social auth testing
   */
  private generateMockIdToken(provider: string, claims: any): string {
    // In real tests, this would be properly mocked
    return `mock_${provider}_token_${JSON.stringify(claims)}`;
  }

  /**
   * Test account unlinking
   */
  async testAccountUnlinking(
    client: ApiClient,
    accountId: string
  ): Promise<void> {
    // This would be implemented when unlink endpoint is available
    throw new Error('Unlink endpoint not yet implemented');
  }

  /**
   * Create test scenario with multiple linked accounts
   */
  async createComplexIdentityGraph(client: ApiClient): Promise<{
    accounts: any[];
    profiles: any[];
  }> {
    const accounts = [];
    const profiles = [];

    // Create primary wallet account
    const wallet1 = await this.authenticateWithWallet(client, 0);
    accounts.push(wallet1.account);
    profiles.push(...wallet1.profiles);
    client.setAccessToken(wallet1.tokens.accessToken);

    // Link email
    const email = faker.internet.email();
    const emailLink = await this.linkAccounts(client, 'email', email);
    accounts.push(emailLink.linkedAccount);

    // Link social
    const socialLink = await this.linkAccounts(client, 'social', 'google_123', {
      targetProvider: 'google'
    });
    accounts.push(socialLink.linkedAccount);

    // Link second wallet with partial privacy
    const wallet2 = new TestWallet(1);
    const wallet2Link = await this.linkAccounts(
      client, 
      'wallet', 
      wallet2.address,
      { privacyMode: 'partial' }
    );
    accounts.push(wallet2Link.linkedAccount);

    // Create isolated account
    const wallet3 = new TestWallet(2);
    const wallet3Link = await this.linkAccounts(
      client,
      'wallet',
      wallet3.address,
      { privacyMode: 'isolated' }
    );
    accounts.push(wallet3Link.linkedAccount);

    return { accounts, profiles };
  }
}