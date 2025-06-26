import { Router } from 'express';
import { securityController } from '@/controllers/securityController';
import { v2AuthAdapter } from '@/middleware/v2AuthAdapter';

const { authenticateAccount } = require('@/middleware/authMiddlewareV2');

const router = Router();

// All security routes require authentication
router.use(authenticateAccount);
router.use(v2AuthAdapter); // Adapt v2 auth for v1 controllers

// Security monitoring endpoints
router.get('/metrics', securityController.getMetrics);
router.get('/alerts', securityController.getAlerts);
router.get('/dashboard', securityController.getDashboard);
router.post('/check-anomalies', securityController.checkAnomalies);

export default router;