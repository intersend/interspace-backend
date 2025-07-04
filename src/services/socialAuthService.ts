import { prisma, withTransaction } from '../utils/database';
const { generateTokens } = require('../utils/tokenUtils');
import { passkeyService } from './passkeyService';
import { auditService } from './auditService';
import { oauthProviderService } from './oauthProviderService';
import { 
  AuthTokens,
  AuthResult,
  AuthenticationError,
  ConflictError,
  NotFoundError 
} from '@/types';
import { randomBytes } from 'crypto';

export interface SocialAuthRequest {
  authToken: string; // OAuth or passkey token
  authStrategy: string; // "google", "apple", "passkey", "wallet", "guest", etc.
  deviceId: string | null;
  deviceName: string;
  deviceType: 'ios' | 'android' | 'web';
  walletAddress?: string; // For wallet auth
  email?: string; // For email auth
  socialData?: {
    provider: string;
    providerId: string;
    username?: string;
    displayName?: string;
    avatarUrl?: string;
    emailVerified?: boolean;
    metadata?: Record<string, any>;
  };
  ipAddress?: string;
  userAgent?: string;
}

export class SocialAuthService {
  
  /**
   * Verify social auth token and create/login user
   */
  async authenticate(data: SocialAuthRequest): Promise<AuthResult> {
    try {
      // Verify the provided social token or passkey
      const verificationResult = await this.verifySocialAuth(data.authToken, data.authStrategy);

      
      if (!verificationResult.isValid) {
        await auditService.logSecurityEvent({
          type: 'LOGIN_FAILED',
          details: { authStrategy: data.authStrategy, reason: 'invalid_token' },
          ipAddress: data.ipAddress,
          userAgent: data.userAgent
        });
        throw new AuthenticationError('Invalid social auth token');
      }

      // For social auth strategies that return user data, merge it with the request
      if (verificationResult.userData) {
        data.socialData = verificationResult.userData;
        if (verificationResult.userData.email) {
          data.email = verificationResult.userData.email;
        }
      }

      return withTransaction(async (tx) => {
        let account;
        
        // Find or create account based on auth strategy
        switch (data.authStrategy) {
          case 'email':
            account = await this.handleEmailAuth(tx, data);
            break;
          case 'wallet':
            account = await this.handleWalletAuth(tx, data);
            break;
          case 'guest':
            account = await this.handleGuestAuth(tx, data);
            break;
          default:
            // Social auth (google, discord, etc.)
            account = await this.handleSocialAuth(tx, data);
            break;
        }

        // Create session
        const sessionToken = randomBytes(32).toString('hex');
        const sessionId = `ses_${randomBytes(16).toString('hex')}`;
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
        
        await tx.accountSession.create({
          data: {
            accountId: account.id,
            sessionId,
            deviceId: data.deviceId,
            deviceName: data.deviceName,
            ipAddress: data.ipAddress,
            userAgent: data.userAgent,
            privacyMode: 'linked',
            expiresAt
          }
        });

        // Handle device registration (optional)
        if (data.deviceId) {
          await this.handleDeviceRegistration(tx, account.id, data);
        }

        // Generate tokens
        const tokens = generateTokens({
          accountId: account.id,
          sessionToken,
          deviceId: data.deviceId || undefined,
          activeProfileId: undefined // Can be set later when profile is selected
        });

        // Log successful authentication
        await auditService.log({
          accountId: account.id,
          action: 'ACCOUNT_LOGIN',
          resource: 'Authentication',
          details: JSON.stringify({
            authStrategy: data.authStrategy,
            deviceId: data.deviceId,
            deviceType: data.deviceType
          }),
          ipAddress: data.ipAddress,
          userAgent: data.userAgent
        });

        return {
          ...tokens,
          account,
          isNewAccount: false // We can determine this based on account creation
        };
      });
    } catch (error) {
      console.error('Social authentication error:', error);
      throw error;
    }
  }

  /**
   * Handle email-based authentication
   */
  private async handleEmailAuth(tx: any, data: SocialAuthRequest) {
    if (!data.email) {
      throw new AuthenticationError('Email required for email auth strategy');
    }

    // Normalize email
    const normalizedEmail = data.email.toLowerCase().trim();

    // For email auth, we don't need to check verification here
    // The email verification is handled separately by the /auth/email/verify-code endpoint
    // Once verified, users can authenticate with just their email

    // Find existing account by email
    let account = await tx.account.findUnique({
      where: { 
        type_identifier: {
          type: 'email',
          identifier: normalizedEmail
        }
      }
    });

    if (!account) {
      // For email auth, we only create accounts after they've verified their email
      // This happens in the email verification flow
      throw new AuthenticationError('Email not found. Please verify your email first.');
    }

    // Check if email is verified
    if (!account.verified) {
      throw new AuthenticationError('Email not verified. Please verify your email first.');
    }

    return account;
  }

  /**
   * Handle wallet-based authentication (SIWE)
   */
  private async handleWalletAuth(tx: any, data: SocialAuthRequest) {
    if (!data.walletAddress) {
      throw new AuthenticationError('Wallet address required for wallet auth strategy');
    }

    const normalizedWallet = data.walletAddress.toLowerCase();

    // Find existing account by wallet
    let account = await tx.account.findUnique({
      where: { 
        type_identifier: {
          type: 'wallet',
          identifier: normalizedWallet
        }
      }
    });

    if (!account) {
      // Create new account
      account = await tx.account.create({
        data: {
          type: 'wallet',
          identifier: normalizedWallet,
          verified: true, // Wallet auth is verified by signature
          metadata: {
            walletType: data.socialData?.provider || 'external'
          }
        }
      });
    }

    return account;
  }

  /**
   * Handle guest authentication
   */
  private async handleGuestAuth(tx: any, data: SocialAuthRequest) {
    // Create guest account with unique identifier
    const guestId = `guest_${randomBytes(16).toString('hex')}`;
    
    const account = await tx.account.create({
      data: {
        type: 'guest',
        identifier: guestId,
        verified: true,
        metadata: {
          deviceId: data.deviceId,
          createdFrom: data.deviceType
        }
      }
    });

    return account;
  }

  /**
   * Handle social authentication (Google, Discord, Telegram, etc.)
   */
  private async handleSocialAuth(tx: any, data: SocialAuthRequest) {
    // For Telegram and other providers that may have minimal data
    if (!data.socialData && data.authStrategy === 'telegram' && data.walletAddress) {
      // Handle Telegram with minimal data - use wallet address as identifier
      data.socialData = {
        provider: 'telegram',
        providerId: data.walletAddress,
        username: 'telegram',
        displayName: 'Telegram User'
      };
    }
    
    if (!data.socialData) {
      throw new AuthenticationError('Social data required for social auth strategy');
    }

    const { provider, providerId } = data.socialData;

    // Find existing account
    let account = await tx.account.findUnique({
      where: { 
        type_identifier: {
          type: 'social',
          identifier: `${provider}:${providerId}`
        }
      }
    });

    if (!account) {
      // Create new account
      account = await tx.account.create({
        data: {
          type: 'social',
          identifier: `${provider}:${providerId}`,
          provider: provider,
          verified: true, // Social accounts are verified by OAuth provider
          metadata: {
            username: data.socialData.username,
            displayName: data.socialData.displayName,
            avatarUrl: data.socialData.avatarUrl,
            email: data.email,
            emailVerified: data.socialData.emailVerified,
            ...(data.socialData.metadata || {})
          }
        }
      });
    } else {
      // Update metadata if needed
      const updatedMetadata = {
        ...(account.metadata as any || {}),
        lastLogin: new Date().toISOString()
      };
      
      if (data.socialData.displayName) {
        updatedMetadata.displayName = data.socialData.displayName;
      }
      if (data.socialData.avatarUrl) {
        updatedMetadata.avatarUrl = data.socialData.avatarUrl;
      }
      if (data.socialData.username) {
        updatedMetadata.username = data.socialData.username;
      }
      if (data.email) {
        updatedMetadata.email = data.email;
      }
      if (data.socialData.emailVerified !== undefined) {
        updatedMetadata.emailVerified = data.socialData.emailVerified;
      }
      // Merge any provider-specific metadata
      if (data.socialData.metadata) {
        updatedMetadata.providerMetadata = data.socialData.metadata;
      }

      await tx.account.update({
        where: { id: account.id },
        data: { metadata: updatedMetadata }
      });
    }

    return account;
  }

  /**
   * Handle device registration
   */
  private async handleDeviceRegistration(tx: any, accountId: string, data: SocialAuthRequest) {
    // Only register device if deviceId is provided
    if (!data.deviceId) {
      return; // Skip device registration
    }

    await tx.deviceRegistration.upsert({
      where: { deviceId: data.deviceId },
      update: {
        accountId: accountId, // Always update accountId to current account
        deviceName: data.deviceName,
        deviceType: data.deviceType,
        isActive: true,
        lastActiveAt: new Date()
      },
      create: {
        accountId,
        deviceId: data.deviceId,
        deviceName: data.deviceName,
        deviceType: data.deviceType,
        isActive: true,
        lastActiveAt: new Date()
      }
    });
  }

  /**
   * Verify social auth token and extract user data
   */
  private async verifySocialAuth(authToken: string, strategy: string): Promise<any> {
    try {
      // Handle non-OAuth strategies
      switch (strategy) {
        case 'passkey':
          // For passkey, authToken should contain both response and challenge
          // This would need proper implementation based on how passkey auth is handled
          return { isValid: true };
        
        case 'guest':
          return { isValid: true };
        
        case 'email':
          // For email auth, no token verification needed
          // Email verification is handled separately
          return { isValid: true };
        
        case 'wallet':
        case 'telegram':
          // For wallet auth (SIWE), verification is done in the SIWE controller
          // The authToken here is the signature which has already been verified
          return { isValid: true };
      }

      // For OAuth providers, use the standardized service
      const provider = oauthProviderService.getProvider(strategy);
      if (!provider) {
        return { isValid: false };
      }

      // Get user info from OAuth provider
      const userInfo = await oauthProviderService.verifyTokenAndFetchUserInfo(
        strategy,
        authToken,
        this.getIdTokenFromAuthToken(authToken, strategy)
      );

      return {
        isValid: true,
        userData: {
          provider: provider.name,
          providerId: userInfo.id,
          email: userInfo.email,
          displayName: userInfo.name || userInfo.username,
          username: userInfo.username,
          avatarUrl: userInfo.avatarUrl,
          emailVerified: userInfo.emailVerified,
          metadata: userInfo.metadata
        }
      };
    } catch (error) {
      console.error('Token verification error:', error);
      return { isValid: false };
    }
  }

  /**
   * Extract ID token from auth token if it's a combined token
   * Some providers send both access and ID tokens
   */
  private getIdTokenFromAuthToken(authToken: string, strategy: string): string | undefined {
    // For Google and Apple, the authToken might be the ID token itself
    if (strategy === 'google' || strategy === 'apple') {
      // If authToken looks like a JWT (has 3 parts), it's likely an ID token
      const parts = authToken.split('.');
      if (parts.length === 3) {
        return authToken;
      }
    }
    return undefined;
  }

  /**
   * Link additional auth method to existing account
   */
  async linkAuthMethod(accountId: string, data: Omit<SocialAuthRequest, 'deviceId' | 'deviceName' | 'deviceType'>): Promise<void> {
    const verificationResult = await this.verifySocialAuth(data.authToken, data.authStrategy);
    
    if (!verificationResult.isValid) {
      throw new AuthenticationError('Invalid social auth token');
    }

    // For social auth strategies that return user data, merge it with the request
    if (verificationResult.userData && (data.authStrategy === 'google' || data.authStrategy === 'apple')) {
      data.socialData = verificationResult.userData;
      if (verificationResult.userData.email) {
        data.email = verificationResult.userData.email;
      }
    }

    await withTransaction(async (tx) => {
      const existingAccount = await tx.account.findUnique({
        where: { id: accountId }
      });

      if (!existingAccount) {
        throw new NotFoundError('Account');
      }

      // Check if this auth method already exists
      let identifier: string;
      let type: string;
      
      switch (data.authStrategy) {
        case 'email':
          if (!data.email) throw new AuthenticationError('Email required');
          type = 'email';
          identifier = data.email.toLowerCase();
          break;
        case 'wallet':
          if (!data.walletAddress) throw new AuthenticationError('Wallet address required');
          type = 'wallet';
          identifier = data.walletAddress.toLowerCase();
          break;
        case 'google':
        case 'apple':
        case 'discord':
        case 'telegram':
          if (!data.socialData) throw new AuthenticationError('Social data required');
          type = 'social';
          identifier = `${data.socialData.provider}:${data.socialData.providerId}`;
          break;
        default:
          throw new AuthenticationError('Unsupported auth strategy');
      }

      // Check if this identity already exists
      const existingIdentity = await tx.account.findUnique({
        where: {
          type_identifier: {
            type,
            identifier
          }
        }
      });

      if (existingIdentity) {
        if (existingIdentity.id === accountId) {
          // Already linked to this account
          return;
        }
        
        // Link the two accounts
        await tx.identityLink.create({
          data: {
            accountAId: accountId,
            accountBId: existingIdentity.id,
            linkType: 'direct',
            privacyMode: 'linked'
          }
        });
      } else {
        // Create new account for this identity and link it
        const newAccount = await tx.account.create({
          data: {
            type,
            identifier,
            provider: type === 'social' ? data.socialData?.provider : undefined,
            verified: true,
            metadata: type === 'social' ? {
              username: data.socialData?.username,
              displayName: data.socialData?.displayName,
              avatarUrl: data.socialData?.avatarUrl,
              email: data.email
            } : {}
          }
        });

        // Link the accounts
        await tx.identityLink.create({
          data: {
            accountAId: accountId,
            accountBId: newAccount.id,
            linkType: 'direct',
            privacyMode: 'linked'
          }
        });
      }
    });
  }

  /**
   * Get account by ID with auth info
   */
  async getAccountById(accountId: string) {
    const account = await prisma.account.findUnique({
      where: { id: accountId },
      include: {
        devices: {
          where: { isActive: true },
          orderBy: { lastActiveAt: 'desc' }
        },
        profileAccounts: {
          include: {
            profile: {
              include: {
                _count: {
                  select: {
                    linkedAccounts: true,
                    apps: true,
                    folders: true
                  }
                }
              }
            }
          }
        },
        identityLinksA: {
          include: {
            accountB: true
          }
        },
        identityLinksB: {
          include: {
            accountA: true
          }
        },
        sessions: {
          where: {
            expiresAt: {
              gt: new Date()
            }
          },
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!account) {
      throw new NotFoundError('Account');
    }

    // Gather all linked accounts
    const linkedAccounts = [
      ...account.identityLinksA.map(link => link.accountB),
      ...account.identityLinksB.map(link => link.accountA)
    ];

    return {
      id: account.id,
      type: account.type,
      identifier: account.identifier,
      provider: account.provider,
      verified: account.verified,
      metadata: account.metadata,
      profilesCount: account.profileAccounts.length,
      linkedAccountsCount: linkedAccounts.length,
      activeDevicesCount: account.devices.length,
      activeSessionsCount: account.sessions.length,
      createdAt: account.createdAt.toISOString(),
      updatedAt: account.updatedAt.toISOString()
    };
  }
}

export const socialAuthService = new SocialAuthService();
