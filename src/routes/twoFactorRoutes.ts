import { Router } from 'express';
import { twoFactorController } from '@/controllers/twoFactorController';
import { authenticate } from '@/middleware/auth';
import { validateRequest } from '@/middleware/validation';
import { authRateLimit } from '@/middleware/rateLimiter';
import Joi from 'joi';

const router = Router();

// Validation schemas
const verifyTokenSchema = Joi.object({
  token: Joi.string().required().length(6)
});

const disableTwoFactorSchema = Joi.object({
  password: Joi.string().required()
});

const regenerateBackupCodesSchema = Joi.object({
  password: Joi.string().required()
});

// All 2FA routes require authentication
router.use(authenticate);
router.use(authRateLimit);

// Get 2FA status
router.get('/status', twoFactorController.getTwoFactorStatus);

// Enable 2FA
router.post('/enable', twoFactorController.enableTwoFactor);

// Verify and complete 2FA setup
router.post(
  '/verify-setup',
  validateRequest(verifyTokenSchema),
  twoFactorController.verifyTwoFactorSetup
);

// Verify 2FA token
router.post(
  '/verify',
  validateRequest(verifyTokenSchema),
  twoFactorController.verifyTwoFactor
);

// Disable 2FA
router.post(
  '/disable',
  validateRequest(disableTwoFactorSchema),
  twoFactorController.disableTwoFactor
);

// Regenerate backup codes
router.post(
  '/regenerate-backup-codes',
  validateRequest(regenerateBackupCodesSchema),
  twoFactorController.regenerateBackupCodes
);

export default router;