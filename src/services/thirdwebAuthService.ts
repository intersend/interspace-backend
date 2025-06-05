import { prisma, withTransaction } from '@/utils/database';
import { generateAccessToken, generateRefreshToken } from '@/utils/jwt';
import { 
  AuthTokens,
  AuthenticationError,
  ConflictError,
  NotFoundError 
} from '@/types';

export interface ThirdwebAuthRequest {
  authToken: string; // Thirdweb auth token
  authStrategy: string; // "email", "google", "wallet", "guest", etc.
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
}

export class ThirdwebAuthService {
  
  /**
   * Verify Thirdweb auth token and create/login user
   */
  async authenticateWithThirdweb(data: ThirdwebAuthRequest): Promise<AuthTokens> {
    try {
      // In a real implementation, you would verify the Thirdweb token here
      // For now, we'll create a placeholder verification
      const isValidToken = await this.verifyThirdwebToken(data.authToken);
      
      if (!isValidToken) {
        throw new AuthenticationError('Invalid Thirdweb auth token');
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

        return {
          accessToken,
          refreshToken,
          expiresIn: 15 * 60 // 15 minutes
        };
      });
    } catch (error) {
      console.error('Thirdweb authentication error:', error);
      throw error;
    }
  }

  /**
   * Handle email-based authentication
   */
  private async handleEmailAuth(tx: any, data: ThirdwebAuthRequest) {
    if (!data.email) {
      throw new AuthenticationError('Email required for email auth strategy');
    }

    // Find existing user by email
    let user = await tx.user.findUnique({
      where: { email: data.email }
    });

    if (!user) {
      // Create new user
      user = await tx.user.create({
        data: {
          email: data.email,
          authStrategies: JSON.stringify(['email']),
          isGuest: false
        }
      });
    } else {
      // Update auth strategies if needed
      const currentStrategies = JSON.parse(user.authStrategies || '[]');
      if (!currentStrategies.includes('email')) {
        currentStrategies.push('email');
        await tx.user.update({
          where: { id: user.id },
          data: { authStrategies: JSON.stringify(currentStrategies) }
        });
      }
    }

    return user;
  }

  /**
   * Handle wallet-based authentication (SIWE)
   */
  private async handleWalletAuth(tx: any, data: ThirdwebAuthRequest) {
    if (!data.walletAddress) {
      throw new AuthenticationError('Wallet address required for wallet auth strategy');
    }

    // Find existing linked account
    const linkedAccount = await tx.linkedAccount.findFirst({
      where: { address: data.walletAddress.toLowerCase() },
      include: { user: true }
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

      await tx.linkedAccount.create({
        data: {
          userId: user.id,
          address: data.walletAddress.toLowerCase(),
          authStrategy: 'wallet',
          walletType: 'external', // Will be updated when linking to profile
          isActive: true
        }
      });
    }

    return user;
  }

  /**
   * Handle guest authentication
   */
  private async handleGuestAuth(tx: any, data: ThirdwebAuthRequest) {
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
  private async handleSocialAuth(tx: any, data: ThirdwebAuthRequest) {
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
  private async handleDeviceRegistration(tx: any, userId: string, data: ThirdwebAuthRequest) {
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
   * Verify Thirdweb auth token (placeholder implementation)
   */
  private async verifyThirdwebToken(authToken: string): Promise<boolean> {
    try {
      // In a real implementation, you would:
      // 1. Validate the token format
      // 2. Verify the signature
      // 3. Check expiration
      // 4. Validate against Thirdweb's verification endpoint
      
      // For now, accept any non-empty token
      //@ts-ignore
      return authToken && authToken.length > 0;
    } catch (error) {
      console.error('Token verification error:', error);
      return false;
    }
  }

  /**
   * Link additional auth method to existing user
   */
  async linkAuthMethod(userId: string, data: Omit<ThirdwebAuthRequest, 'deviceId' | 'deviceName' | 'deviceType'>): Promise<void> {
    const isValidToken = await this.verifyThirdwebToken(data.authToken);
    
    if (!isValidToken) {
      throw new AuthenticationError('Invalid Thirdweb auth token');
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

export const thirdwebAuthService = new ThirdwebAuthService();
