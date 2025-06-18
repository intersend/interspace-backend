import { Request, Response, NextFunction } from 'express';
import { RateLimiterRedis, RateLimiterMemory, RateLimiterAbstract } from 'rate-limiter-flexible';
import { getRedisClient } from '@/utils/redis';
import { config } from '@/utils/config';
import { logger } from '@/utils/logger';
import { auditService } from '@/services/auditService';
import { securityMonitoringService } from '@/services/securityMonitoringService';
import { RateLimitError } from '@/types';

export interface RateLimiterOptions {
  points: number; // Number of points
  duration: number; // Per duration in seconds
  blockDuration?: number; // Block duration in seconds
  keyPrefix?: string; // Key prefix for Redis
  customKeyFn?: (req: Request) => string; // Custom key generation
}

/**
 * Create a distributed rate limiter that falls back to memory if Redis is unavailable
 */
export function createDistributedRateLimiter(options: RateLimiterOptions): RateLimiterAbstract {
  const redisClient = getRedisClient();
  
  if (redisClient) {
    logger.info(`Creating Redis rate limiter with prefix: ${options.keyPrefix || 'rl'}`);
    return new RateLimiterRedis({
      storeClient: redisClient,
      keyPrefix: options.keyPrefix || 'rl',
      points: options.points,
      duration: options.duration,
      blockDuration: options.blockDuration || 0,
      execEvenly: false,
    });
  } else {
    logger.warn('Redis not available, falling back to in-memory rate limiter');
    return new RateLimiterMemory({
      points: options.points,
      duration: options.duration,
      blockDuration: options.blockDuration || 0,
      execEvenly: false,
    });
  }
}

/**
 * Create rate limiting middleware with distributed support
 */
export function createRateLimitMiddleware(
  limiter: RateLimiterAbstract,
  keyFn?: (req: Request) => string
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Generate key for rate limiting
      const key = keyFn ? keyFn(req) : req.ip || 'unknown';
      
      // Consume a point
      const rateLimiterRes = await limiter.consume(key);
      
      // Set rate limit headers
      res.set({
        'X-RateLimit-Limit': String(limiter.points),
        'X-RateLimit-Remaining': String(rateLimiterRes.remainingPoints),
        'X-RateLimit-Reset': new Date(Date.now() + rateLimiterRes.msBeforeNext).toISOString()
      });
      
      next();
    } catch (rateLimiterRes: any) {
      // Rate limit exceeded
      const retrySecs = Math.round((rateLimiterRes.msBeforeNext || 0) / 1000) || 1;
      
      res.set({
        'Retry-After': String(retrySecs),
        'X-RateLimit-Limit': String(limiter.points),
        'X-RateLimit-Remaining': String(rateLimiterRes.remainingPoints || 0),
        'X-RateLimit-Reset': new Date(Date.now() + rateLimiterRes.msBeforeNext).toISOString()
      });
      
      // Log rate limit violation
      const violationKey = keyFn ? keyFn(req) : req.ip;
      logger.warn('Rate limit exceeded', {
        key: violationKey,
        endpoint: req.path,
        method: req.method
      });
      
      // Log security event
      const userId = (req as any).user?.userId;
      auditService.logSecurityEvent({
        type: 'RATE_LIMIT_EXCEEDED',
        userId,
        details: { 
          endpoint: req.path,
          method: req.method,
          key: violationKey
        },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      }).catch(err => logger.error('Failed to log rate limit event', err));
      
      // Check for rate limit abuse
      securityMonitoringService.checkRateLimitAbuse(userId, req.ip)
        .catch(err => logger.error('Failed to check rate limit abuse', err));
      
      next(new RateLimitError('Too many requests - please try again later'));
    }
  };
}

// Environment-aware configuration
const isDevelopment = config.NODE_ENV === 'development';
const windowSeconds = Math.ceil(config.RATE_LIMIT_WINDOW_MS / 1000);

// Calculate points based on environment
const basePoints = isDevelopment ? config.RATE_LIMIT_MAX_REQUESTS * 5 : config.RATE_LIMIT_MAX_REQUESTS;

// Create distributed rate limiters with fallback to memory
export const distributedApiLimiter = createDistributedRateLimiter({
  points: basePoints,
  duration: windowSeconds,
  keyPrefix: 'rl:api',
});

export const distributedAuthLimiter = createDistributedRateLimiter({
  points: isDevelopment ? basePoints : Math.max(1, Math.floor(config.RATE_LIMIT_MAX_REQUESTS / 5)),
  duration: windowSeconds,
  keyPrefix: 'rl:auth',
  blockDuration: isDevelopment ? 0 : 60 * 60, // Block for 1 hour in production after limit exceeded
});

export const distributedTransactionLimiter = createDistributedRateLimiter({
  points: isDevelopment ? basePoints * 2 : config.RATE_LIMIT_MAX_REQUESTS,
  duration: windowSeconds,
  keyPrefix: 'rl:tx',
});

// Export middleware
export const distributedApiRateLimit = createRateLimitMiddleware(distributedApiLimiter);
export const distributedAuthRateLimit = createRateLimitMiddleware(distributedAuthLimiter);
export const distributedTransactionRateLimit = createRateLimitMiddleware(
  distributedTransactionLimiter,
  (req: Request) => (req as any).user?.userId || req.ip || 'unknown'
);

// Endpoint-specific rate limiters
export function createEndpointRateLimiter(endpoint: string, points: number, duration: number = windowSeconds) {
  const limiter = createDistributedRateLimiter({
    points,
    duration,
    keyPrefix: `rl:endpoint:${endpoint.replace(/[^a-zA-Z0-9]/g, '_')}`,
  });
  
  return createRateLimitMiddleware(limiter);
}

// Log configuration
if (config.REDIS_ENABLED) {
  logger.info('🛡️  Distributed rate limiting enabled (Redis)', {
    apiLimit: basePoints,
    authLimit: distributedAuthLimiter.points,
    transactionLimit: distributedTransactionLimiter.points,
    windowSeconds,
    mode: isDevelopment ? 'development' : 'production'
  });
} else {
  logger.info('🛡️  Rate limiting enabled (In-memory fallback)', {
    apiLimit: basePoints,
    authLimit: distributedAuthLimiter.points,
    transactionLimit: distributedTransactionLimiter.points,
    windowSeconds,
    mode: isDevelopment ? 'development' : 'production'
  });
}