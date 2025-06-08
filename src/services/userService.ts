import { prisma, withTransaction } from '@/utils/database';
import { OAuth2Client } from 'google-auth-library';
import verifyAppleToken from 'apple-signin-auth';
import { decrypt, encrypt } from '@/utils/crypto';
import { config } from '@/utils/config';
import { passkeyService } from './passkeyService';
import { 
  UserResponse,
  SocialAccountResponse,
  LinkSocialAccountRequest,
  NotFoundError,
  ConflictError,
  AuthenticationError
} from '@/types';

export class UserService {
  
  /**
   * Get user profile with social accounts
   */
  async getUserProfile(userId: string): Promise<UserResponse> {
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
        },
        socialProfiles: {
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!user) {
      throw new NotFoundError('User');
    }

    return {
      id: user.id,
      email: user.email || undefined,
      authStrategies: JSON.parse(user.authStrategies || '[]'),
      isGuest: user.isGuest,
      profilesCount: user.smartProfiles.length,
      linkedAccountsCount: user.linkedAccounts.length,
      activeDevicesCount: user.devices.length,
      socialAccounts: user.socialProfiles.map(this.formatSocialAccountResponse),
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString()
    };
  }

  /**
   * Get all social accounts for a user
   */
  async getUserSocialAccounts(userId: string): Promise<SocialAccountResponse[]> {
    const socialAccounts = await prisma.socialProfile.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });

    return socialAccounts.map(this.formatSocialAccountResponse);
  }

  /**
   * Link a social account to user
   */
  async linkSocialAccount(
    userId: string,
    data: LinkSocialAccountRequest
  ): Promise<SocialAccountResponse> {
    return withTransaction(async (tx) => {
      // Verify user exists
      const user = await tx.user.findUnique({
        where: { id: userId }
      });

      if (!user) {
        throw new NotFoundError('User');
      }

      // Check if social account already linked to this user
      const existingAccount = await tx.socialProfile.findFirst({
        where: {
          userId,
          provider: data.provider
        }
      });

      if (existingAccount) {
        throw new ConflictError(`${data.provider} account is already linked to this user`);
      }

      // Verify OAuth code and get social profile data
      const socialData = await this.verifySocialAuth(data.provider, data.oauthCode, data.redirectUri);

      // Check if this social account is already linked to another user
      const existingUserAccount = await tx.socialProfile.findUnique({
        where: {
          provider_providerId: {
            provider: data.provider,
            providerId: socialData.providerId
          }
        }
      });

      if (existingUserAccount) {
        throw new ConflictError(`This ${data.provider} account is already linked to another user`);
      }

      // Create social profile
      const socialProfile = await tx.socialProfile.create({
        data: {
          userId,
          provider: data.provider,
          providerId: socialData.providerId,
          username: socialData.username,
          displayName: socialData.displayName,
          avatarUrl: socialData.avatarUrl,
          accessToken: socialData.accessToken ? encrypt(socialData.accessToken) : undefined,
          refreshToken: socialData.refreshToken ? encrypt(socialData.refreshToken) : undefined
        }
      });

      // Update user's auth strategies
      const authStrategies = JSON.parse(user.authStrategies || '[]');
      if (!authStrategies.includes(data.provider)) {
        authStrategies.push(data.provider);
        await tx.user.update({
          where: { id: userId },
          data: {
            authStrategies: JSON.stringify(authStrategies),
            isGuest: false // Upgrade from guest if linking social
          }
        });
      }

      // Log the action
      await tx.auditLog.create({
        data: {
          userId,
          action: 'SOCIAL_ACCOUNT_LINKED',
          resource: 'SocialProfile',
          details: JSON.stringify({
            provider: data.provider,
            username: socialData.username
          })
        }
      });

      return this.formatSocialAccountResponse(socialProfile);
    });
  }

  /**
   * Unlink a social account from user
   */
  async unlinkSocialAccount(userId: string, socialAccountId: string): Promise<void> {
    return withTransaction(async (tx) => {
      // Verify ownership
      const socialAccount = await tx.socialProfile.findFirst({
        where: {
          id: socialAccountId,
          userId
        }
      });

      if (!socialAccount) {
        throw new NotFoundError('Social account');
      }

      // Check if this is the last auth method
      const user = await tx.user.findUnique({
        where: { id: userId },
        include: {
          socialProfiles: true,
          linkedAccounts: {
            where: { isActive: true }
          }
        }
      });

      if (!user) {
        throw new NotFoundError('User');
      }

      const authStrategies = JSON.parse(user.authStrategies || '[]');
      const hasOtherAuth = 
        user.email || // Has email auth
        user.linkedAccounts.length > 0 || // Has wallet auth
        user.socialProfiles.length > 1; // Has other social accounts

      if (!hasOtherAuth && !user.isGuest) {
        throw new ConflictError('Cannot remove the last authentication method');
      }

      // Delete the social account
      await tx.socialProfile.delete({
        where: { id: socialAccountId }
      });

      // Update auth strategies
      const updatedStrategies = authStrategies.filter((s: string) => s !== socialAccount.provider);
      await tx.user.update({
        where: { id: userId },
        data: {
          authStrategies: JSON.stringify(updatedStrategies)
        }
      });

      // Log the action
      await tx.auditLog.create({
        data: {
          userId,
          action: 'SOCIAL_ACCOUNT_UNLINKED',
          resource: 'SocialProfile',
          details: JSON.stringify({
            provider: socialAccount.provider,
            username: socialAccount.username
          })
        }
      });
    });
  }

  /**
   * Verify social auth and get profile data
   */
  private async verifySocialAuth(
    provider: string,
    oauthToken: string,
    redirectUri?: string
  ): Promise<{
    providerId: string;
    username?: string;
    displayName?: string;
    avatarUrl?: string;
    accessToken?: string;
    refreshToken?: string;
  }> {
    switch (provider) {
      case 'google': {
        const client = new OAuth2Client(config.GOOGLE_CLIENT_ID);
        const ticket = await client.verifyIdToken({
          idToken: oauthToken,
          audience: config.GOOGLE_CLIENT_ID
        });
        const payload = ticket.getPayload();
        if (!payload) throw new AuthenticationError('Invalid Google token');
        return {
          providerId: payload.sub,
          username: payload.email ?? undefined,
          displayName: payload.name ?? undefined,
          avatarUrl: payload.picture ?? undefined
        };
      }
      case 'apple': {
        const result = await verifyAppleToken({
          idToken: oauthToken,
          clientId: config.APPLE_CLIENT_ID!
        });
        return {
          providerId: result.sub,
          username: result.email ?? undefined,
          displayName: result.email ?? undefined
        };
      }
      case 'passkey': {
        const data = await passkeyService.verifyAuthentication(oauthToken);
        return {
          providerId: data.credentialId,
          username: data.username,
          displayName: data.username
        };
      }
      default:
        throw new AuthenticationError(`Unsupported social provider: ${provider}`);
    }
  }

  /**
   * Format social account response
   */
  private formatSocialAccountResponse(socialProfile: any): SocialAccountResponse {
    return {
      id: socialProfile.id,
      provider: socialProfile.provider,
      username: socialProfile.username || undefined,
      displayName: socialProfile.displayName || undefined,
      avatarUrl: socialProfile.avatarUrl || undefined,
      createdAt: socialProfile.createdAt.toISOString(),
      updatedAt: socialProfile.updatedAt.toISOString()
    };
  }
}

export const userService = new UserService();
