import { Router } from 'express';
import { smartProfileController } from '@/controllers/smartProfileController';
import { authenticate, requireProfile } from '@/middleware/auth';
import { userRateLimit } from '@/middleware/rateLimiter';

const router = Router();

// All routes require authentication
router.use(authenticate);
router.use(userRateLimit);

// SmartProfile routes
router.post('/', smartProfileController.createProfile);
router.get('/', smartProfileController.getUserProfiles);
router.get('/active', smartProfileController.getActiveProfile);
router.get('/:profileId', smartProfileController.getProfileById);
router.put('/:profileId', smartProfileController.updateProfile);
router.delete('/:profileId', smartProfileController.deleteProfile);
router.post('/:profileId/activate', smartProfileController.switchActiveProfile);
router.post('/:profileId/rotate-wallet', smartProfileController.rotateSessionWallet);

// Social profile endpoints have been moved to user level (/users/me/social-accounts)

export default router;
