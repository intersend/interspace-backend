import { Router } from 'express';
import { metadataController } from '../controllers/metadataController';
import { authenticate } from '../middleware/auth';
import { userRateLimit } from '../middleware/rateLimiter';

const router = Router();

// All routes require authentication
router.use(authenticate);
router.use(userRateLimit);

// Metadata routes
router.post('/apps/enrich-metadata', metadataController.enrichMetadata);
router.get('/apps/metadata', metadataController.getMetadata);

export default router;