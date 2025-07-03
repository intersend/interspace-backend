import { Router } from 'express';
import { appsController } from '../controllers/appsController';
const { authenticateAccount } = require('../middleware/authMiddlewareV2');
import { userRateLimit } from '../middleware/rateLimiter';

const router = Router();

// All routes require authentication
router.use(authenticateAccount);
router.use(userRateLimit);

// Apps routes
router.post('/profiles/:profileId/apps', appsController.createApp);
router.get('/profiles/:profileId/apps', appsController.getProfileApps);
router.get('/profiles/:profileId/apps/root', appsController.getRootApps);
router.get('/profiles/:profileId/apps/search', appsController.searchApps);
router.get('/profiles/:profileId/folders/:folderId/apps', appsController.getFolderApps);
router.put('/apps/:appId', appsController.updateApp);
router.delete('/apps/:appId', appsController.deleteApp);
router.post('/profiles/:profileId/apps/reorder', appsController.reorderApps);
router.put('/apps/:appId/move', appsController.moveAppToFolder);

export default router;
