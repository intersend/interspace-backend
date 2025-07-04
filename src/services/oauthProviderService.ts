import { config } from '../utils/config';
import { logger } from '../utils/logger';
import { AuthenticationError } from '../types';
import { OAUTH_PROVIDERS, OAuthProviderConfig, OAuthUserInfo } from '../types/oauth';
import { OAuth2Client } from 'google-auth-library';
import { verifyIdToken } from 'apple-signin-auth';

export class OAuthProviderService {
  private googleClient?: OAuth2Client;

  constructor() {
    if (config.GOOGLE_CLIENT_ID) {
      this.googleClient = new OAuth2Client(config.GOOGLE_CLIENT_ID);
    }
  }

  /**
   * Get OAuth provider configuration
   */
  getProvider(providerName: string): OAuthProviderConfig | null {
    return OAUTH_PROVIDERS[providerName.toLowerCase()] || null;
  }

  /**
   * Verify OAuth token and fetch user info
   */
  async verifyTokenAndFetchUserInfo(
    providerName: string, 
    accessToken: string, 
    idToken?: string
  ): Promise<OAuthUserInfo> {
    const provider = this.getProvider(providerName);
    if (!provider) {
      throw new AuthenticationError(`Unknown OAuth provider: ${providerName}`);
    }

    try {
      switch (provider.name) {
        case 'google':
          return await this.verifyGoogleToken(idToken || accessToken);
        
        case 'apple':
          return await this.verifyAppleToken(idToken || accessToken);
        
        default:
          // For other providers, fetch user info from their API
          return await this.fetchUserInfoFromAPI(provider, accessToken);
      }
    } catch (error) {
      logger.error(`OAuth verification error for ${providerName}:`, error);
      throw new AuthenticationError(`${provider.displayName} authentication failed`);
    }
  }

  /**
   * Verify Google ID token
   */
  private async verifyGoogleToken(idToken: string): Promise<OAuthUserInfo> {
    if (!this.googleClient) {
      throw new AuthenticationError('Google client not configured');
    }

    const ticket = await this.googleClient.verifyIdToken({
      idToken,
      audience: config.GOOGLE_CLIENT_ID
    });
    
    const payload = ticket.getPayload();
    if (!payload) {
      throw new AuthenticationError('Invalid Google token');
    }

    return {
      id: payload.sub,
      email: payload.email,
      emailVerified: payload.email_verified,
      name: payload.name,
      avatarUrl: payload.picture,
      metadata: {
        locale: payload.locale,
        hostedDomain: payload.hd
      }
    };
  }

  /**
   * Verify Apple ID token
   */
  private async verifyAppleToken(idToken: string): Promise<OAuthUserInfo> {
    const decodedToken = await verifyIdToken(idToken, {
      audience: config.APPLE_CLIENT_ID!
    });

    return {
      id: decodedToken.sub,
      email: decodedToken.email,
      emailVerified: decodedToken.email_verified === 'true',
      name: decodedToken.email?.split('@')[0] || 'Apple User',
      metadata: {
        isPrivateEmail: decodedToken.is_private_email
      }
    };
  }

  /**
   * Fetch user info from OAuth provider API
   */
  private async fetchUserInfoFromAPI(
    provider: OAuthProviderConfig, 
    accessToken: string
  ): Promise<OAuthUserInfo> {
    if (!provider.userInfoEndpoint) {
      throw new AuthenticationError(`No user info endpoint for ${provider.displayName}`);
    }

    // Handle provider-specific headers and query params
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json'
    };

    // Provider-specific adjustments
    let url = provider.userInfoEndpoint;
    
    if (provider.name === 'github') {
      headers['Accept'] = 'application/vnd.github.v3+json';
    } else if (provider.name === 'twitter') {
      url += '?user.fields=profile_image_url,description,created_at,verified';
    } else if (provider.name === 'tiktok') {
      // TikTok requires access token in query params
      url += `?access_token=${accessToken}`;
      delete headers['Authorization'];
    } else if (provider.name === 'shopify') {
      // Shopify requires special handling
      throw new AuthenticationError('Shopify requires special implementation with shop domain');
    }

    const response = await fetch(url, { headers });
    
    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`OAuth API error for ${provider.name}:`, errorText);
      throw new AuthenticationError(`Failed to fetch user info from ${provider.displayName}`);
    }

    const data = await response.json();

    // Map provider response to standard format
    const userInfo = this.mapUserInfoResponse(provider, data);

    // Fetch additional data if needed
    if (provider.name === 'github' && !userInfo.email) {
      // GitHub might not return email in main endpoint
      userInfo.email = await this.fetchGitHubEmail(accessToken);
    }

    return userInfo;
  }

  /**
   * Map provider-specific response to standard user info
   */
  private mapUserInfoResponse(provider: OAuthProviderConfig, data: any): OAuthUserInfo {
    const mapping = provider.userInfoMapping;
    const userInfo: OAuthUserInfo = {
      id: '',
      metadata: {}
    };

    if (!mapping) {
      throw new AuthenticationError(`No user info mapping for ${provider.displayName}`);
    }

    // Map fields using dot notation support
    for (const [field, path] of Object.entries(mapping)) {
      const value = this.getNestedValue(data, path);
      if (value !== undefined) {
        switch (field) {
          case 'id':
            userInfo.id = String(value);
            break;
          case 'email':
            userInfo.email = value;
            break;
          case 'name':
            userInfo.name = value;
            break;
          case 'username':
            userInfo.username = value;
            break;
          case 'avatarUrl':
            userInfo.avatarUrl = value;
            // Discord avatar needs special handling
            if (provider.name === 'discord' && value && !value.startsWith('http')) {
              userInfo.avatarUrl = `https://cdn.discordapp.com/avatars/${userInfo.id}/${value}.png`;
            }
            break;
          case 'verified':
            if (field === 'verified') {
              userInfo.emailVerified = value === true || value === 'true';
            }
            break;
        }
      }
    }

    // Store provider-specific data in metadata
    userInfo.metadata = {
      ...userInfo.metadata,
      provider: provider.name,
      rawData: data
    };

    return userInfo;
  }

  /**
   * Get nested value from object using dot notation
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => {
      // Handle array notation like "images[0].url"
      const arrayMatch = key.match(/^(\w+)\[(\d+)\]$/);
      if (arrayMatch && arrayMatch[1] && arrayMatch[2]) {
        const arrayKey = arrayMatch[1];
        const index = parseInt(arrayMatch[2]);
        return current?.[arrayKey]?.[index];
      }
      return current?.[key];
    }, obj);
  }

  /**
   * Fetch GitHub email separately if needed
   */
  private async fetchGitHubEmail(accessToken: string): Promise<string | undefined> {
    try {
      const response = await fetch('https://api.github.com/user/emails', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (response.ok) {
        const emails = await response.json();
        const primary = emails.find((e: any) => e.primary && e.verified);
        return primary?.email;
      }
    } catch (error) {
      logger.error('Failed to fetch GitHub email:', error);
    }
    return undefined;
  }
}

export const oauthProviderService = new OAuthProviderService();