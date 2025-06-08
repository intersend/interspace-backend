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

// General API limiter
const apiLimiter = new RateLimiterMemory({
  points: config.RATE_LIMIT_MAX_REQUESTS,
  duration: windowSeconds
});

// Auth-specific limiter (5x stricter)
const authLimiter = new RateLimiterMemory({
  points: Math.max(1, Math.floor(config.RATE_LIMIT_MAX_REQUESTS / 5)),
  duration: windowSeconds
});

// Transaction limiter tied to user ID when available
const txLimiter = new RateLimiterMemory({
  points: config.RATE_LIMIT_MAX_REQUESTS,
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

console.log('🛡️  Rate limiting enabled');
