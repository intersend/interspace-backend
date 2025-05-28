import { Router } from 'express';
import { thirdwebAuthController } from '@/controllers/thirdwebAuthController';
import { authenticate } from '@/middleware/auth';
import { authRateLimit } from '@/middleware/rateLimiter';

const router = Router();

// Public routes (no auth required)
router.post('/authenticate', authRateLimit, thirdwebAuthController.authenticateWithThirdweb);
router.post('/refresh', authRateLimit, thirdwebAuthController.refreshToken);
router.post('/logout', thirdwebAuthController.logout);

// Protected routes (auth required)
router.use(authenticate);

router.get('/me', thirdwebAuthController.getCurrentUser);
router.post('/link-auth', thirdwebAuthController.linkAuthMethod);
router.get('/devices', thirdwebAuthController.getUserDevices);
router.delete('/devices/:deviceId', thirdwebAuthController.deactivateDevice);

export default router;
