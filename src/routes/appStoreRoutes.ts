import { Router } from 'express';
import { appStoreController } from '../controllers/appStoreController';
import { userRateLimit } from '../middleware/rateLimiter';

const router = Router();

// Apply rate limiting to all app store routes
router.use(userRateLimit);

// Public routes - no authentication required
// Categories
router.get('/app-store/categories', appStoreController.getCategories);

// Apps - Public endpoints
router.get('/app-store/apps', appStoreController.getApps);
router.get('/app-store/featured', appStoreController.getFeaturedApps);
router.get('/app-store/search', appStoreController.searchApps);
router.get('/app-store/apps/:id', appStoreController.getAppById);
router.get('/app-store/apps/share/:shareableId', appStoreController.getAppByShareableId);

// Admin routes - TODO: Add admin authentication middleware
// const { authenticateAdmin } = require('../middleware/authMiddlewareV2');
// router.use(authenticateAdmin); // Uncomment when admin auth is implemented

// Apps - Admin endpoints
router.post('/app-store/apps', appStoreController.createApp);
router.put('/app-store/apps/:id', appStoreController.updateApp);
router.delete('/app-store/apps/:id', appStoreController.deleteApp);

// Categories - Admin endpoints
router.post('/app-store/categories', appStoreController.createCategory);
router.put('/app-store/categories/:id', appStoreController.updateCategory);
router.delete('/app-store/categories/:id', appStoreController.deleteCategory);

export default router;