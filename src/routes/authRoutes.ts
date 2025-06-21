import { Router } from 'express';
import { authController } from '@/controllers/authController';
import { authenticate } from '@/middleware/auth';
import { authRateLimit } from '@/middleware/rateLimiter';
import { distributedAuthRateLimit } from '@/middleware/distributedRateLimiter';
import { config } from '@/utils/config';
import emailAuthRoutes from './emailAuthRoutes';
import passkeyRoutes from './passkeyRoutes';

const router = Router();

// Email authentication routes (public - no auth required)
router.use('/email', emailAuthRoutes);

// Passkey authentication routes
router.use('/passkey', passkeyRoutes);

// Use distributed rate limiting if Redis is available
const rateLimiter = config.REDIS_ENABLED ? distributedAuthRateLimit : authRateLimit;

// Public routes (no auth required)
router.post('/authenticate', rateLimiter, authController.authenticate);
router.post('/refresh', rateLimiter, authController.refreshToken);
router.post('/logout', authController.logout);

// Protected routes (auth required) - apply auth middleware after public routes
router.get('/me', authenticate, authController.getCurrentUser);
router.post('/link-auth', authenticate, authController.linkAuthMethod);
router.get('/devices', authenticate, authController.getUserDevices);
router.delete('/devices/:deviceId', authenticate, authController.deactivateDevice);

// Token management endpoints
router.post('/logout-all', authenticate, authController.logoutAllDevices);
router.post('/revoke-token', authenticate, authController.revokeToken);
router.get('/blacklist-stats', authenticate, authController.getBlacklistStats);

export default router;
