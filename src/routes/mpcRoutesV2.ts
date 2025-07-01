import { Router } from 'express';
import { mpcControllerV2 } from '@/controllers/mpcControllerV2';
const { authenticateAccount: requireAuth, requireActiveProfile } = require('@/middleware/authMiddlewareV2');
import { validateRequest } from '@/middleware/validation';
import { passwordResetRateLimit as authRateLimiter, transactionRateLimit as transactionRateLimiter } from '@/middleware/rateLimiter';
import Joi from 'joi';

const router = Router();

// Validation schemas
const generateKeySchema = Joi.object({
  profileId: Joi.string().required()
});

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

const startKeyGenerationSchema = Joi.object({
  profileId: Joi.string().required(),
  p1Messages: Joi.array().items(Joi.any()).optional()
});

const forwardP1MessageSchema = Joi.object({
  sessionId: Joi.string().required(),
  messageType: Joi.string().valid('keyGen', 'sign').required(),
  message: Joi.any().required()
});

const startSigningSchema = Joi.object({
  profileId: Joi.string().required(),
  message: Joi.string().required(),
  p1Messages: Joi.array().items(Joi.any()).optional()
});

const keyGeneratedSchema = Joi.object({
  profileId: Joi.string().required(),
  keyId: Joi.string().required(),
  publicKey: Joi.string().required(),
  address: Joi.string().required().pattern(/^0x[a-fA-F0-9]{40}$/)
});

// Apply v2 auth and strict rate limiting to all MPC routes
router.use(requireAuth);
router.use(authRateLimiter); // Stricter rate limits for sensitive operations

/**
 * @route   POST /api/v2/mpc/generate
 * @desc    Generate MPC key for a profile (returns cloud public key)
 * @access  Private
 */
router.post(
  '/generate',
  validateRequest(generateKeySchema),
  mpcControllerV2.generateKey
);

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

/**
 * @route   POST /api/v2/mpc/keygen/start
 * @desc    Start MPC key generation session
 * @access  Private
 */
router.post(
  '/keygen/start',
  validateRequest(startKeyGenerationSchema),
  mpcControllerV2.startKeyGeneration
);

/**
 * @route   POST /api/v2/mpc/message/forward
 * @desc    Forward P1 message to duo-node
 * @access  Private
 */
router.post(
  '/message/forward',
  validateRequest(forwardP1MessageSchema),
  mpcControllerV2.forwardP1Message
);

/**
 * @route   POST /api/v2/mpc/sign/start
 * @desc    Start MPC signing session
 * @access  Private
 */
router.post(
  '/sign/start',
  validateRequest(startSigningSchema),
  mpcControllerV2.startSigning
);

/**
 * @route   GET /api/v2/mpc/session/:sessionId
 * @desc    Get MPC session status
 * @access  Private
 */
router.get(
  '/session/:sessionId',
  mpcControllerV2.getSessionStatus
);

/**
 * @route   POST /api/v2/mpc/key-generated
 * @desc    Notify backend about generated MPC key from iOS client
 * @access  Private
 */
router.post(
  '/key-generated',
  validateRequest(keyGeneratedSchema),
  mpcControllerV2.handleKeyGenerated
);

export default router;