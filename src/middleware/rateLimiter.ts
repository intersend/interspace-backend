import { Request, Response, NextFunction } from 'express';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { config } from '@/utils/config';
import { RateLimitError } from '@/types';

// Helper to create an Express middleware from a rate limiter
function createRateLimitMiddleware(
  limiter: RateLimiterMemory,
  keyFn?: (req: Request) => string
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const key = keyFn ? keyFn(req) : req.ip || 'unknown';
      await limiter.consume(key);
      next();
    } catch (rateLimiterRes: any) {
      const retrySecs = Math.round((rateLimiterRes.msBeforeNext || 0) / 1000) || 1;
      res.set('Retry-After', String(retrySecs));
      next(new RateLimitError('Too many requests - please try again later'));
    }
  };
}

const windowSeconds = Math.ceil(config.RATE_LIMIT_WINDOW_MS / 1000);

// Environment-aware rate limiting - more permissive in development
const isDevelopment = config.NODE_ENV === 'development';
const basePoints = isDevelopment ? config.RATE_LIMIT_MAX_REQUESTS * 5 : config.RATE_LIMIT_MAX_REQUESTS;

// General API limiter
const apiLimiter = new RateLimiterMemory({
  points: basePoints,
  duration: windowSeconds
});

// Auth-specific limiter (5x stricter, but still generous in development)
const authLimiter = new RateLimiterMemory({
  points: isDevelopment ? basePoints : Math.max(1, Math.floor(config.RATE_LIMIT_MAX_REQUESTS / 5)),
  duration: windowSeconds
});

// Transaction limiter tied to user ID when available
const txLimiter = new RateLimiterMemory({
  points: isDevelopment ? basePoints * 2 : config.RATE_LIMIT_MAX_REQUESTS,
  duration: windowSeconds
});

export const apiRateLimit = createRateLimitMiddleware(apiLimiter);
export const authRateLimit = createRateLimitMiddleware(authLimiter);
export const passwordResetRateLimit = createRateLimitMiddleware(authLimiter);
export const transactionRateLimit = createRateLimitMiddleware(
  txLimiter,
  (req: Request) => (req as any).user?.userId || req.ip || 'unknown'
);
export const userRateLimit = createRateLimitMiddleware(
  apiLimiter,
  (req: Request) => (req as any).user?.userId || req.ip || 'unknown'
);

// Log rate limiting configuration
if (isDevelopment) {
  console.log('🛡️  Rate limiting enabled (Development mode - increased limits):', {
    apiLimit: basePoints,
    authLimit: authLimiter.points,
    transactionLimit: txLimiter.points,
    windowSeconds
  });
} else {
  console.log('🛡️  Rate limiting enabled (Production mode)');
}
