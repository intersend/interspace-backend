import { Router } from 'express';
import { authController } from '@/controllers/authController';
import { authenticate } from '@/middleware/auth';
import { authRateLimit } from '@/middleware/rateLimiter';

const router = Router();

// Public routes (no auth required)
router.post('/authenticate', authRateLimit, authController.authenticate);
router.post('/refresh', authRateLimit, authController.refreshToken);
router.post('/logout', authController.logout);

// Protected routes (auth required)
router.use(authenticate);

router.get('/me', authController.getCurrentUser);
router.post('/link-auth', authController.linkAuthMethod);
router.get('/devices', authController.getUserDevices);
router.delete('/devices/:deviceId', authController.deactivateDevice);

export default router;
