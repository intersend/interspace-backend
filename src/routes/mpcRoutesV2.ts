import { Router } from 'express';
import { mpcControllerV2 } from '@/controllers/mpcControllerV2';
const { authenticateAccount: requireAuth, requireActiveProfile } = require('@/middleware/authMiddlewareV2');
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

// Apply v2 auth and strict rate limiting to all MPC routes
router.use(requireAuth);
router.use(authRateLimiter); // Stricter rate limits for sensitive operations

/**
 * @route   POST /api/v2/mpc/backup
 * @desc    Generate a verifiable backup of the server's keyshare
 * @access  Private + 2FA in production
 */
router.post(
  '/backup',
  validateRequest(backupKeySchema),
  transactionRateLimiter, // Extra rate limiting for critical operations
  mpcControllerV2.backupKey
);

/**
 * @route   POST /api/v2/mpc/export
 * @desc    Export the full private key of the MPC wallet
 * @access  Private + 2FA in production
 */
router.post(
  '/export',
  validateRequest(exportKeySchema),
  transactionRateLimiter, // Extra rate limiting for critical operations
  mpcControllerV2.exportKey
);

/**
 * @route   GET /api/v2/mpc/status/:profileId
 * @desc    Get the MPC key status for a profile
 * @access  Private
 */
router.get(
  '/status/:profileId',
  requireActiveProfile,
  mpcControllerV2.getKeyStatus
);

/**
 * @route   POST /api/v2/mpc/rotate
 * @desc    Initiate key rotation for a profile
 * @access  Private + 2FA in production
 */
router.post(
  '/rotate',
  validateRequest(rotateKeySchema),
  transactionRateLimiter, // Extra rate limiting for critical operations
  mpcControllerV2.rotateKey
);

export default router;