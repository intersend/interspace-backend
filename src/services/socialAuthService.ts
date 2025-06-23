import { prisma, withTransaction } from '@/utils/database';
import { generateAccessToken, generateRefreshToken } from '@/utils/jwt';
import { OAuth2Client } from 'google-auth-library';
import { verifyIdToken } from 'apple-signin-auth';
import { passkeyService } from './passkeyService';
import { auditService } from './auditService';
import { config } from '@/utils/config';
import { 
  AuthTokens,
  AuthenticationError,
  ConflictError,
  NotFoundError 
} from '@/types';

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
  };
  ipAddress?: string;
  userAgent?: string;
}

export class SocialAuthService {
  
  /**
   * Verify social auth token and create/login user
   */
  async authenticate(data: SocialAuthRequest): Promise<AuthTokens> {
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
      if (verificationResult.userData && (data.authStrategy === 'google' || data.authStrategy === 'apple')) {
        data.socialData = verificationResult.userData;
        if (verificationResult.userData.email) {
          data.email = verificationResult.userData.email;
        }
      }

      return withTransaction(async (tx) => {
        let user;
        
        // Find or create user based on auth strategy
        switch (data.authStrategy) {
          case 'email':
            user = await this.handleEmailAuth(tx, data);
            break;
          case 'wallet':
            user = await this.handleWalletAuth(tx, data);
            break;
          case 'guest':
            user = await this.handleGuestAuth(tx, data);
            break;
          default:
            // Social auth (google, discord, etc.)
            user = await this.handleSocialAuth(tx, data);
            break;
        }

        // Handle device registration (optional)
        if (data.deviceId) {
          await this.handleDeviceRegistration(tx, user.id, data);
        }

        // Generate tokens
        const accessToken = generateAccessToken(user.id, data.deviceId || undefined);
        const refreshToken = generateRefreshToken(user.id, data.deviceId || undefined);

        // Store refresh token
        await tx.refreshToken.create({
          data: {
            userId: user.id,
            token: refreshToken,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
          }
        });

        // Log successful authentication
        await auditService.log({
          userId: user.id,
          action: 'USER_LOGIN',
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
          accessToken,
          refreshToken,
          expiresIn: 15 * 60 // 15 minutes
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

    // Find existing user by email
    let user = await tx.user.findUnique({
      where: { email: normalizedEmail }
    });

    if (!user) {
      // For email auth, we only create users after they've verified their email
      // This happens in the email verification flow
      throw new AuthenticationError('Email not found. Please verify your email first.');
    }

    // Check if email is verified
    if (!user.emailVerified) {
      throw new AuthenticationError('Email not verified. Please verify your email first.');
    }

    // Update auth strategies if needed
    const currentStrategies = JSON.parse(user.authStrategies || '[]');
    if (!currentStrategies.includes('email')) {
      currentStrategies.push('email');
      await tx.user.update({
        where: { id: user.id },
        data: { 
          authStrategies: JSON.stringify(currentStrategies)
        }
      });
    }

    return user;
  }

  /**
   * Handle wallet-based authentication (SIWE)
   */
  private async handleWalletAuth(tx: any, data: SocialAuthRequest) {
    if (!data.walletAddress) {
      throw new AuthenticationError('Wallet address required for wallet auth strategy');
    }

    // Find existing linked account
    const linkedAccount = await tx.linkedAccount.findFirst({
      where: { address: data.walletAddress.toLowerCase() },
      include: { 
        user: {
          include: {
            smartProfiles: {
              orderBy: { createdAt: 'desc' },
              take: 1
            }
          }
        }
      }
    });

    let user;
    if (linkedAccount) {
      user = linkedAccount.user;
      // Update auth strategies
      const currentStrategies = JSON.parse(user.authStrategies || '[]');
      if (!currentStrategies.includes('wallet')) {
        currentStrategies.push('wallet');
        await tx.user.update({
          where: { id: user.id },
          data: { authStrategies: JSON.stringify(currentStrategies) }
        });
      }
    } else {
      // Create new user and linked account
      user = await tx.user.create({
        data: {
          authStrategies: JSON.stringify(['wallet']),
          isGuest: false
        }
      });

      // Check if user has any profiles
      const userProfiles = await tx.smartProfile.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' }
      });

      // If user has profiles, link to the most recent one (which should be the one they just created)
      const profileId = userProfiles.length > 0 ? userProfiles[0].id : null;

      await tx.linkedAccount.create({
        data: {
          userId: user.id,
          profileId: profileId, // Link to profile if exists
          address: data.walletAddress.toLowerCase(),
          authStrategy: 'wallet',
          walletType: 'external',
          isActive: true
        }
      });
    }

    // Check if this is an orphan wallet (has account but no profile linked)
    if (!linkedAccount?.profileId) {
      // Find the user's most recent profile without a wallet
      const unlinkedProfile = await tx.smartProfile.findFirst({
        where: {
          userId: user.id,
          linkedAccounts: {
            none: {
              authStrategy: 'wallet'
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      if (unlinkedProfile) {
        // Link this wallet to the unlinked profile
        if (linkedAccount) {
          await tx.linkedAccount.update({
            where: { id: linkedAccount.id },
            data: { profileId: unlinkedProfile.id }
          });
        }
      }
    }

    return user;
  }

  /**
   * Handle guest authentication
   */
  private async handleGuestAuth(tx: any, data: SocialAuthRequest) {
    // Create guest user
    const user = await tx.user.create({
      data: {
        authStrategies: JSON.stringify(['guest']),
        isGuest: true
      }
    });

    return user;
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

    // Find existing user by wallet address first (for Telegram)
    let user;
    if (data.walletAddress && (provider === 'telegram' || data.authStrategy === 'telegram')) {
      const linkedAccount = await tx.linkedAccount.findFirst({
        where: { 
          address: data.walletAddress.toLowerCase(),
          authStrategy: 'telegram'
        },
        include: { user: true }
      });
      
      if (linkedAccount) {
        user = linkedAccount.user;
      }
    }
    
    // If not found by wallet, try finding by auth strategy
    if (!user) {
      user = await tx.user.findFirst({
        where: {
          authStrategies: {
            contains: provider
          }
        }
      });
    }

    if (!user) {
      // Create new user
      user = await tx.user.create({
        data: {
          authStrategies: JSON.stringify([provider]),
          isGuest: false
        }
      });
      
      // For Telegram, also create a linked account with the wallet address
      if (data.walletAddress && (provider === 'telegram' || data.authStrategy === 'telegram')) {
        await tx.linkedAccount.create({
          data: {
            userId: user.id,
            address: data.walletAddress.toLowerCase(),
            authStrategy: 'telegram',
            walletType: 'external',
            isActive: true
          }
        });
      }
    } else {
      // Update auth strategies
      const currentStrategies = JSON.parse(user.authStrategies || '[]');
      if (!currentStrategies.includes(provider)) {
        currentStrategies.push(provider);
        await tx.user.update({
          where: { id: user.id },
          data: { authStrategies: JSON.stringify(currentStrategies) }
        });
      }
    }

    return user;
  }

  /**
   * Handle device registration
   */
  private async handleDeviceRegistration(tx: any, userId: string, data: SocialAuthRequest) {
    // Only register device if deviceId is provided
    if (!data.deviceId) {
      return; // Skip device registration
    }

    await tx.deviceRegistration.upsert({
      where: { deviceId: data.deviceId },
      update: {
        userId: userId, // Always update userId to current user
        deviceName: data.deviceName,
        deviceType: data.deviceType,
        isActive: true,
        lastActiveAt: new Date()
      },
      create: {
        userId,
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
      switch (strategy) {
        case 'google': {
          const client = new OAuth2Client(config.GOOGLE_CLIENT_ID);
          const ticket = await client.verifyIdToken({ idToken: authToken, audience: config.GOOGLE_CLIENT_ID });
          const payload = ticket.getPayload();
          return {
            isValid: true,
            userData: {
              provider: 'google',
              providerId: payload?.sub,
              email: payload?.email,
              displayName: payload?.name,
              avatarUrl: payload?.picture
            }
          };
        }
        case 'apple': {
          const decodedToken = await verifyIdToken(authToken, { audience: config.APPLE_CLIENT_ID! });
          return {
            isValid: true,
            userData: {
              provider: 'apple',
              providerId: decodedToken.sub,
              email: decodedToken.email,
              displayName: decodedToken.email?.split('@')[0] || 'Apple User'
            }
          };
        }
        case 'passkey': {
          // For passkey, authToken should contain both response and challenge
          // This would need proper implementation based on how passkey auth is handled
          return { isValid: true };
        }
        case 'guest': {
          return { isValid: true };
        }
        case 'email': {
          // For email auth, no token verification needed
          // Email verification is handled separately
          return { isValid: true };
        }
        case 'wallet': {
          // For wallet auth (SIWE), verification is done in the SIWE controller
          // The authToken here is the signature which has already been verified
          return { isValid: true };
        }
        default:
          return { isValid: false };
      }
    } catch (error) {
      console.error('Token verification error:', error);
      return { isValid: false };
    }
  }

  /**
   * Link additional auth method to existing user
   */
  async linkAuthMethod(userId: string, data: Omit<SocialAuthRequest, 'deviceId' | 'deviceName' | 'deviceType'>): Promise<void> {
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
      const user = await tx.user.findUnique({
        where: { id: userId }
      });

      if (!user) {
        throw new NotFoundError('User');
      }

      // Update auth strategies
      const currentStrategies = JSON.parse(user.authStrategies || '[]');
      if (!currentStrategies.includes(data.authStrategy)) {
        currentStrategies.push(data.authStrategy);
        
        await tx.user.update({
          where: { id: userId },
          data: { 
            authStrategies: JSON.stringify(currentStrategies),
            isGuest: false // Upgrade from guest if linking auth
          }
        });
      }

      // Handle wallet linking if wallet auth
      if (data.authStrategy === 'wallet' && data.walletAddress) {
        const existingLinkedAccount = await tx.linkedAccount.findFirst({
          where: { 
            address: data.walletAddress.toLowerCase(),
            userId: userId
          }
        });

        if (!existingLinkedAccount) {
          await tx.linkedAccount.create({
            data: {
              userId,
              address: data.walletAddress.toLowerCase(),
              authStrategy: 'wallet',
              walletType: 'external',
              isActive: true
            }
          });
        }
      }
    });
  }

  /**
   * Get user by ID with auth info
   */
  async getUserById(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        devices: {
          where: { isActive: true },
          orderBy: { lastActiveAt: 'desc' }
        },
        smartProfiles: {
          include: {
            _count: {
              select: {
                linkedAccounts: true,
                apps: true,
                folders: true
              }
            }
          }
        },
        linkedAccounts: {
          where: { isActive: true }
        }
      }
    });

    if (!user) {
      throw new NotFoundError('User');
    }

    return {
      id: user.id,
      email: user.email,
      authStrategies: JSON.parse(user.authStrategies || '[]'),
      isGuest: user.isGuest,
      profilesCount: user.smartProfiles.length,
      linkedAccountsCount: user.linkedAccounts.length,
      activeDevicesCount: user.devices.length,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString()
    };
  }
}

export const socialAuthService = new SocialAuthService();
