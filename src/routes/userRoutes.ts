import { Router } from 'express';
import { userController } from '@/controllers/userController';
import { authenticate } from '@/middleware/auth';
import { userRateLimit } from '@/middleware/rateLimiter';

const router = Router();

// All routes require authentication
router.use(authenticate);
router.use(userRateLimit);

// User profile routes
router.get('/me', userController.getCurrentUser);

// Social account management routes
router.get('/me/social-accounts', userController.getSocialAccounts);
router.post('/me/social-accounts', userController.linkSocialAccount);
router.delete('/me/social-accounts/:id', userController.unlinkSocialAccount);

export default router;
