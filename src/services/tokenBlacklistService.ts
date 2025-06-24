import { prisma, withTransaction } from '@/utils/database';
import { logger } from '@/utils/logger';
import jwt from 'jsonwebtoken';

export interface BlacklistReason {
  reason: 'logout' | 'rotation' | 'security' | 'password_change';
  details?: string;
}

export class TokenBlacklistService {
  /**
   * Blacklist a token
   */
  async blacklistToken(
    token: string,
    tokenType: 'access' | 'refresh',
    accountId: string,
    reason: BlacklistReason
  ): Promise<void> {
    try {
      // Decode token to get expiration
      const decoded = jwt.decode(token) as any;
      const expiresAt = decoded?.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 24 * 60 * 60 * 1000);

      await prisma.blacklistedToken.create({
        data: {
          token,
          tokenType,
          accountId,
          reason: reason.reason,
          expiresAt
        }
      });

      logger.info('Token blacklisted', { tokenType, accountId, reason: reason.reason });
    } catch (error) {
      logger.error('Failed to blacklist token', { error, tokenType, accountId });
      throw error;
    }
  }

  /**
   * Check if a token is blacklisted
   */
  async isTokenBlacklisted(token: string): Promise<boolean> {
    try {
      const blacklistedToken = await prisma.blacklistedToken.findUnique({
        where: { token }
      });

      return !!blacklistedToken;
    } catch (error) {
      logger.error('Failed to check token blacklist', { error });
      // In case of error, assume token is not blacklisted to avoid blocking users
      return false;
    }
  }

  /**
   * Blacklist all tokens for a user (used for security events)
   * Note: This is a V1 compatibility method. V2 uses account-based tokens.
   */
  async blacklistAllUserTokens(userId: string, reason: BlacklistReason): Promise<void> {
    try {
      await withTransaction(async (tx) => {
        // Get all active refresh tokens
        const refreshTokens = await tx.refreshToken.findMany({
          where: { userId }
        });

        // Find the account associated with this user
        const user = await tx.user.findUnique({
          where: { id: userId },
          select: { email: true, walletAddress: true }
        });

        if (!user) {
          logger.warn('User not found for blacklisting tokens', { userId });
          return;
        }

        // Find the account
        const account = await tx.account.findFirst({
          where: {
            OR: [
              user.email ? { type: 'email', identifier: user.email } : {},
              user.walletAddress ? { type: 'wallet', identifier: user.walletAddress.toLowerCase() } : {}
            ].filter(condition => Object.keys(condition).length > 0)
          }
        });

        if (!account) {
          logger.warn('No account found for user', { userId });
          // Still delete refresh tokens
          await tx.refreshToken.deleteMany({
            where: { userId }
          });
          return;
        }

        // Blacklist each token
        for (const refreshToken of refreshTokens) {
          await tx.blacklistedToken.create({
            data: {
              token: refreshToken.token,
              tokenType: 'refresh',
              accountId: account.id,
              reason: reason.reason,
              expiresAt: refreshToken.expiresAt
            }
          });
        }

        // Delete all refresh tokens
        await tx.refreshToken.deleteMany({
          where: { userId }
        });

        logger.info('All user tokens blacklisted', { userId, accountId: account.id, reason: reason.reason });
      });
    } catch (error) {
      logger.error('Failed to blacklist all user tokens', { error, userId });
      throw error;
    }
  }

  /**
   * Clean up expired blacklisted tokens
   */
  async cleanupExpiredTokens(): Promise<number> {
    try {
      const result = await prisma.blacklistedToken.deleteMany({
        where: {
          expiresAt: { lt: new Date() }
        }
      });

      if (result.count > 0) {
        logger.info('Cleaned up expired blacklisted tokens', { count: result.count });
      }

      return result.count;
    } catch (error) {
      logger.error('Failed to cleanup expired blacklisted tokens', { error });
      return 0;
    }
  }

  /**
   * Get blacklist statistics for monitoring
   */
  async getBlacklistStats(): Promise<{
    total: number;
    byReason: Record<string, number>;
    recentCount: number;
  }> {
    try {
      const [total, byReason, recentCount] = await Promise.all([
        // Total blacklisted tokens
        prisma.blacklistedToken.count(),
        
        // Count by reason
        prisma.blacklistedToken.groupBy({
          by: ['reason'],
          _count: true
        }),
        
        // Recent blacklists (last 24 hours)
        prisma.blacklistedToken.count({
          where: {
            createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
          }
        })
      ]);

      const reasonCounts = byReason.reduce((acc, item) => {
        acc[item.reason] = item._count;
        return acc;
      }, {} as Record<string, number>);

      return {
        total,
        byReason: reasonCounts,
        recentCount
      };
    } catch (error) {
      logger.error('Failed to get blacklist stats', { error });
      return {
        total: 0,
        byReason: {},
        recentCount: 0
      };
    }
  }
}

export const tokenBlacklistService = new TokenBlacklistService();