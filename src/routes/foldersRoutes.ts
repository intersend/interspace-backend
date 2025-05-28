import { Router } from 'express';
import { foldersController } from '@/controllers/foldersController';
import { authenticate, optionalAuth } from '@/middleware/auth';
import { userRateLimit } from '@/middleware/rateLimiter';

const router = Router();

// Public route for shared folders
router.get('/shared/:shareableId', optionalAuth, foldersController.getSharedFolder);

// Protected routes
router.use(authenticate);
router.use(userRateLimit);

// Folders routes
router.post('/profiles/:profileId/folders', foldersController.createFolder);
router.get('/profiles/:profileId/folders', foldersController.getProfileFolders);
router.get('/profiles/:profileId/folders/:folderId', foldersController.getFolderById);
router.put('/folders/:folderId', foldersController.updateFolder);
router.delete('/folders/:folderId', foldersController.deleteFolder);
router.post('/profiles/:profileId/folders/reorder', foldersController.reorderFolders);
router.post('/folders/:folderId/share', foldersController.shareFolder);
router.delete('/folders/:folderId/share', foldersController.unshareFolder);
router.get('/folders/:folderId/contents', foldersController.getFolderContents);

export default router;
