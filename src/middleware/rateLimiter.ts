import { Request, Response, NextFunction } from 'express';
import { RateLimiterRedis, RateLimiterMemory } from 'rate-limiter-flexible';
import { createClient } from 'redis';
import { config } from '@/utils/config';
import { RateLimitError } from '@/types';

// Create Redis client with error handling
let redisClient: any = null;
let useRedis = false;

try {
  redisClient = createClient({
    url: config.REDIS_URL,
    password: config.REDIS_PASSWORD
  });

  redisClient.on('error', (err: any) => {
    console.warn('Redis Client Error (falling back to memory):', err.message);
    useRedis = false;
  });

  redisClient.on('connect', () => {
    console.log('✅ Redis connected for rate limiting');
    useRedis = true;
  });

  redisClient.connect().catch(() => {
    console.warn('⚠️  Redis unavailable, using memory-based rate limiting');
    useRedis = false;
  });
} catch (error) {
  console.warn('⚠️  Redis unavailable, using memory-based rate limiting');
  useRedis = false;
}

// Very generous API rate limiter - only catches extreme abuse
const createApiLimiter = () => useRedis ? new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'api_limit',
  points: 10000, // 10,000 requests (very generous)
  duration: 3600, // Per hour
  blockDuration: 300, // Block for 5 minutes if exceeded
}) : new RateLimiterMemory({
  keyPrefix: 'api_limit',
  points: 10000,
  duration: 3600,
  blockDuration: 300,
});

// Authentication rate limiter - prevent brute force but allow normal usage
const createAuthLimiter = () => useRedis ? new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'auth_limit',
  points: 100, // 100 auth attempts
  duration: 3600, // Per hour
  blockDuration: 300, // Block for 5 minutes if exceeded
}) : new RateLimiterMemory({
  keyPrefix: 'auth_limit',
  points: 100,
  duration: 3600,
  blockDuration: 300,
});

// Password reset limiter - still strict but reasonable
const createPasswordResetLimiter = () => useRedis ? new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'password_reset_limit',
  points: 10, // 10 requests
  duration: 3600, // Per hour
  blockDuration: 1800, // Block for 30 minutes if exceeded
}) : new RateLimiterMemory({
  keyPrefix: 'password_reset_limit',
  points: 10,
  duration: 3600,
  blockDuration: 1800,
});

// Transaction limiter - generous for normal usage
const createTransactionLimiter = () => useRedis ? new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'tx_limit',
  points: 1000, // 1000 transactions
  duration: 3600, // Per hour
  blockDuration: 300, // Block for 5 minutes if exceeded
}) : new RateLimiterMemory({
  keyPrefix: 'tx_limit',
  points: 1000,
  duration: 3600,
  blockDuration: 300,
});

// Initialize limiters
let apiLimiter = createApiLimiter();
let authLimiter = createAuthLimiter();
let passwordResetLimiter = createPasswordResetLimiter();
let transactionLimiter = createTransactionLimiter();

// Recreate limiters when Redis status changes
setInterval(() => {
  try {
    const newApiLimiter = createApiLimiter();
    const newAuthLimiter = createAuthLimiter();
    const newPasswordResetLimiter = createPasswordResetLimiter();
    const newTransactionLimiter = createTransactionLimiter();
    
    apiLimiter = newApiLimiter;
    authLimiter = newAuthLimiter;
    passwordResetLimiter = newPasswordResetLimiter;
    transactionLimiter = newTransactionLimiter;
  } catch (error) {
    // Ignore errors during limiter recreation
  }
}, 30000); // Check every 30 seconds

function createRateLimitMiddleware(
  getLimiter: () => any, 
  keyGenerator?: (req: Request) => string
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Skip rate limiting for health/monitoring endpoints
      if (req.path === '/health' || 
          req.path === '/ping' || 
          req.path === '/' ||
          req.path.startsWith('/static') ||
          req.path.startsWith('/public')) {
        return next();
      }

      const limiter = getLimiter();
      const key = keyGenerator ? keyGenerator(req) : (req.ip || 'unknown');
      
      await limiter.consume(key);
      next();
    } catch (rateLimiterRes: any) {
      // Handle rate limiter errors gracefully
      if (rateLimiterRes && rateLimiterRes.remainingPoints !== undefined) {
        // This is a rate limit violation
        const remainingPoints = rateLimiterRes.remainingPoints || 0;
        const msBeforeNext = rateLimiterRes.msBeforeNext || 0;
        const currentLimiter = getLimiter();
        
        res.set({
          'Retry-After': Math.round(msBeforeNext / 1000) || 1,
          'X-RateLimit-Limit': currentLimiter.points || 'unknown',
          'X-RateLimit-Remaining': remainingPoints,
          'X-RateLimit-Reset': new Date(Date.now() + msBeforeNext).toISOString()
        });
        
        throw new RateLimitError('Too many requests - please wait a moment');
      } else {
        // This is a limiter error (e.g., Redis connection issue)
        console.warn('Rate limiter error (allowing request):', rateLimiterRes);
        next(); // Allow the request to proceed
      }
    }
  };
}

// Middleware exports with generous limits
export const apiRateLimit = createRateLimitMiddleware(() => apiLimiter);

export const authRateLimit = createRateLimitMiddleware(() => authLimiter);

export const passwordResetRateLimit = createRateLimitMiddleware(() => passwordResetLimiter);

export const transactionRateLimit = createRateLimitMiddleware(
  () => transactionLimiter,
  (req: Request) => req.user?.userId || req.ip || 'unknown'
);

// User-specific rate limiter - very generous
export const userRateLimit = createRateLimitMiddleware(
  () => useRedis ? new RateLimiterRedis({
    storeClient: redisClient,
    keyPrefix: 'user_limit',
    points: 50000, // 50,000 requests
    duration: 3600, // Per hour
    blockDuration: 300, // Block for 5 minutes if exceeded
  }) : new RateLimiterMemory({
    keyPrefix: 'user_limit',
    points: 50000,
    duration: 3600,
    blockDuration: 300,
  }),
  (req: Request) => req.user?.userId || req.ip || 'unknown'
);

// Export Redis client for other uses
export { redisClient };

console.log('🛡️  Rate limiter initialized:', {
  storage: useRedis ? 'Redis' : 'Memory',
  apiLimit: '10,000/hour',
  authLimit: '100/hour',
  healthEndpoints: 'No limits',
  mode: 'Generous (edge-case prevention only)'
});
