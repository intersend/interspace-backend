import { Router } from 'express';
import { dragOperationController } from '../controllers/dragOperationController';
import { authenticate } from '../middleware/auth';
import { userRateLimit } from '../middleware/rateLimiter';

const router = Router();

// All routes require authentication
router.use(authenticate);
router.use(userRateLimit);

// Drag operation routes
router.get('/profiles/:profileId/operations/history', dragOperationController.getOperationHistory);
router.post('/profiles/:profileId/operations/undo', dragOperationController.undoLastOperation);
router.delete('/profiles/:profileId/operations/history', dragOperationController.clearHistory);

export default router;