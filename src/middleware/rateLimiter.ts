import { Request, Response, NextFunction } from 'express';

// Simple no-op middleware that passes through all requests
function createNoOpRateLimitMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Rate limiting is disabled - allow all requests to pass through
    next();
  };
}

// Export all the same middleware functions as no-ops
export const apiRateLimit = createNoOpRateLimitMiddleware();
export const authRateLimit = createNoOpRateLimitMiddleware();
export const passwordResetRateLimit = createNoOpRateLimitMiddleware();
export const transactionRateLimit = createNoOpRateLimitMiddleware();
export const userRateLimit = createNoOpRateLimitMiddleware();

// Export null for redisClient since it's not needed anymore
export const redisClient = null;

console.log('🚫 Rate limiting DISABLED - All requests will pass through without limits');
