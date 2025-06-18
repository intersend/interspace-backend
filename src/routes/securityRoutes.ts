import { Router } from 'express';
import { securityController } from '@/controllers/securityController';
import { authenticate } from '@/middleware/auth';

const router = Router();

// All security routes require authentication
router.use(authenticate);

// Security monitoring endpoints
router.get('/metrics', securityController.getMetrics);
router.get('/alerts', securityController.getAlerts);
router.get('/dashboard', securityController.getDashboard);
router.post('/check-anomalies', securityController.checkAnomalies);

export default router;