import { Router } from 'express';
import { mpcController } from '@/controllers/mpcController';
import { authenticate as requireAuth, requireProfile } from '@/middleware/auth';
import { validateRequest } from '@/middleware/validation';
import { passwordResetRateLimit as authRateLimiter, transactionRateLimit as transactionRateLimiter } from '@/middleware/rateLimiter';
import Joi from 'joi';

const router = Router();

// Validation schemas
const backupKeySchema = Joi.object({
  profileId: Joi.string().required(),
  rsaPubkeyPem: Joi.string().required().min(100), // RSA public key in PEM format
  label: Joi.string().required().max(255),
  twoFactorCode: Joi.string().optional().length(6)
});

const exportKeySchema = Joi.object({
  profileId: Joi.string().required(),
  clientEncKey: Joi.string().required().base64().length(44), // 32 bytes base64 encoded
  twoFactorCode: Joi.string().optional().length(6)
});

const rotateKeySchema = Joi.object({
  profileId: Joi.string().required(),
  twoFactorCode: Joi.string().optional().length(6)
});

// Apply auth and strict rate limiting to all MPC routes
router.use(requireAuth);
router.use(authRateLimiter); // Stricter rate limits for sensitive operations

/**
 * @route   POST /api/v1/mpc/backup
 * @desc    Generate a verifiable backup of the server's keyshare
 * @access  Private + 2FA in production
 */
router.post(
  '/backup',
  validateRequest(backupKeySchema),
  transactionRateLimiter, // Extra rate limiting for critical operations
  mpcController.backupKey
);

/**
 * @route   POST /api/v1/mpc/export
 * @desc    Export the full private key of the MPC wallet
 * @access  Private + 2FA in production
 */
router.post(
  '/export',
  validateRequest(exportKeySchema),
  transactionRateLimiter, // Extra rate limiting for critical operations
  mpcController.exportKey
);

/**
 * @route   GET /api/v1/mpc/status/:profileId
 * @desc    Get the MPC key status for a profile
 * @access  Private
 */
router.get(
  '/status/:profileId',
  requireProfile,
  mpcController.getKeyStatus
);

/**
 * @route   POST /api/v1/mpc/rotate
 * @desc    Initiate key rotation for a profile
 * @access  Private + 2FA in production
 */
router.post(
  '/rotate',
  validateRequest(rotateKeySchema),
  transactionRateLimiter, // Extra rate limiting for critical operations
  mpcController.rotateKey
);

export default router;