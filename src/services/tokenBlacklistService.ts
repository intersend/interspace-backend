import { prisma, withTransaction } from '../utils/database';
import { getRedisClient } from '../utils/redis';
import { logger } from '../utils/logger';

export type BlacklistReason = 
  | 'logout' 
  | 'rotation'
  | 'security'
  | 'password_change'
  | 'USER_LOGOUT' 
  | 'SECURITY_BREACH' 
  | 'TOKEN_REFRESH' 
  | 'PERMISSION_CHANGE' 
  | 'ACCOUNT_DEACTIVATED'
  | 'SUSPICIOUS_ACTIVITY';

interface BlacklistEntry {
  token: string;
  accountId?: string;
  reason: BlacklistReason;
  expiresAt: Date;
}

export class TokenBlacklistService {
  private redis: any;
  private readonly BLACKLIST_PREFIX = 'token:blacklist:';
  private readonly BLACKLIST_SET = 'token:blacklist:set';
  
  constructor() {
    this.redis = getRedisClient();
  }

  /**
   * Add a token to the blacklist
   */
  async blacklistToken(token: string, reason: BlacklistReason, accountId?: string, ttlSeconds?: number, tokenType: 'access' | 'refresh' = 'access'): Promise<void> {
    try {
      // Validate and sanitize ttlSeconds
      let validTtlSeconds = 86400; // Default 24 hours
      
      if (ttlSeconds !== undefined && ttlSeconds !== null) {
        const parsed = Number(ttlSeconds);
        if (!isNaN(parsed) && parsed > 0) {
          validTtlSeconds = Math.floor(parsed);
        } else {
          logger.warn('Invalid ttlSeconds provided, using default', { ttlSeconds, defaultUsed: validTtlSeconds });
        }
      }
      
      // Calculate expiration date with validated ttlSeconds
      const expiresAt = new Date(Date.now() + validTtlSeconds * 1000);
      
      // Verify the date is valid
      if (isNaN(expiresAt.getTime())) {
        throw new Error(`Failed to create valid expiration date with ttlSeconds: ${ttlSeconds}`);
      }
      
      // Store in database
      const tokenData: any = {
        token,
        tokenType,
        reason,
        expiresAt
      };
      
      if (accountId) {
        tokenData.accountId = accountId;
      }
      
      await prisma.blacklistedToken.create({
        data: tokenData
      });

      // Also store in Redis for fast lookups
      if (this.redis && this.redis.status === 'ready') {
        const key = `${this.BLACKLIST_PREFIX}${token}`;
        await this.redis.setex(key, validTtlSeconds, JSON.stringify({ accountId, reason }));
        await this.redis.sadd(this.BLACKLIST_SET, token);
      }

      logger.info('Token blacklisted', { accountId, reason, expiresAt });
    } catch (error) {
      logger.error('Failed to blacklist token', { error, accountId, reason });
      throw error;
    }
  }

  /**
   * Blacklist all tokens for an account (used for security events)
   */
  async blacklistAllAccountTokens(accountId: string, reason: BlacklistReason): Promise<void> {
    try {
      await withTransaction(async (tx) => {
        // Get all active sessions for this account
        const sessions = await tx.accountSession.findMany({
          where: { 
            accountId,
            expiresAt: { gt: new Date() }
          }
        });

        // Blacklist each session's access token
        for (const session of sessions) {
          // We don't have the actual token stored, so we'll need to handle this differently
          // For now, we'll mark the session as invalidated
          await tx.accountSession.update({
            where: { id: session.id },
            data: { 
              expiresAt: new Date() // Expire immediately
            }
          });
        }

        // Log the security event
        logger.warn('All tokens blacklisted for account', { 
          accountId, 
          reason, 
          sessionsInvalidated: sessions.length 
        });
      });

      // Clear Redis cache for this account if available
      if (this.redis && this.redis.status === 'ready') {
        // This would require tracking tokens by account in Redis
        // For now, we rely on session expiration
      }
    } catch (error) {
      logger.error('Failed to blacklist all account tokens', { error, accountId, reason });
      throw error;
    }
  }

  /**
   * Check if a token is blacklisted
   */
  async isTokenBlacklisted(token: string): Promise<boolean> {
    try {
      // Check Redis first for performance
      if (this.redis && this.redis.status === 'ready') {
        const key = `${this.BLACKLIST_PREFIX}${token}`;
        const exists = await this.redis.exists(key);
        if (exists) {
          return true;
        }
      }

      // Fall back to database
      const blacklistedToken = await prisma.blacklistedToken.findFirst({
        where: {
          token,
          expiresAt: { gt: new Date() }
        }
      });

      return !!blacklistedToken;
    } catch (error) {
      logger.error('Failed to check token blacklist', { error });
      // In case of error, assume token is not blacklisted to avoid blocking users
      return false;
    }
  }

  /**
   * Clean up expired blacklist entries
   */
  async cleanupExpiredTokens(): Promise<number> {
    try {
      const result = await prisma.blacklistedToken.deleteMany({
        where: {
          expiresAt: { lt: new Date() }
        }
      });

      // Also clean up Redis if available
      if (this.redis && this.redis.status === 'ready') {
        // This would require iterating through the set and checking TTLs
        // Redis keys with TTL will auto-expire, so this is optional
      }

      logger.info('Cleaned up expired blacklisted tokens', { count: result.count });
      return result.count;
    } catch (error) {
      logger.error('Failed to cleanup expired tokens', { error });
      throw error;
    }
  }

  /**
   * Get blacklist statistics
   */
  async getBlacklistStats(): Promise<{
    total: number;
    byReason: Record<string, number>;
    activeCount: number;
  }> {
    try {
      const [total, byReason, activeCount] = await Promise.all([
        prisma.blacklistedToken.count(),
        prisma.blacklistedToken.groupBy({
          by: ['reason'],
          _count: { reason: true }
        }),
        prisma.blacklistedToken.count({
          where: { expiresAt: { gt: new Date() } }
        })
      ]);

      const reasonCounts = byReason.reduce((acc, curr) => {
        acc[curr.reason] = curr._count.reason;
        return acc;
      }, {} as Record<string, number>);

      return {
        total,
        byReason: reasonCounts,
        activeCount
      };
    } catch (error) {
      logger.error('Failed to get blacklist stats', { error });
      throw error;
    }
  }

  /**
   * Blacklist tokens by pattern (for emergency security response)
   */
  async blacklistTokensByPattern(pattern: string, reason: BlacklistReason): Promise<number> {
    try {
      // This is a placeholder - in production, you'd want to implement
      // a more sophisticated pattern matching system
      logger.warn('Token pattern blacklisting requested', { pattern, reason });
      
      // For now, we don't support pattern-based blacklisting
      // This would require storing token metadata or patterns
      return 0;
    } catch (error) {
      logger.error('Failed to blacklist tokens by pattern', { error, pattern, reason });
      throw error;
    }
  }
}

export const tokenBlacklistService = new TokenBlacklistService();