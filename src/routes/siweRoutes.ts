import { Router } from 'express';
import { siweController } from '@/controllers/siweController';
import { validateRequest } from '@/middleware/validation';
import { authRateLimit } from '@/middleware/rateLimiter';
import Joi from 'joi';

const router = Router();

// Validation schemas
const createMessageSchema = Joi.object({
  address: Joi.string().required().pattern(/^0x[a-fA-F0-9]{40}$/),
  chainId: Joi.number().required(),
  nonce: Joi.string().required(),
  statement: Joi.string().optional(),
  resources: Joi.array().items(Joi.string()).optional()
});

const verifyMessageSchema = Joi.object({
  message: Joi.string().required(),
  signature: Joi.string().required()
});

// Apply rate limiting to all SIWE routes
router.use(authRateLimit);

// Generate nonce for SIWE
router.get('/nonce', siweController.generateNonce);

// Create SIWE message
router.post(
  '/message',
  validateRequest(createMessageSchema),
  siweController.createMessage
);

// Verify SIWE message
router.post(
  '/verify',
  validateRequest(verifyMessageSchema),
  siweController.verifyMessage
);

// Authenticate with SIWE (verify and generate JWT)
const authenticateSchema = Joi.object({
  message: Joi.string().required(),
  signature: Joi.string().required(),
  address: Joi.string().required().pattern(/^0x[a-fA-F0-9]{40}$/),
  deviceId: Joi.string().optional(),
  deviceName: Joi.string().optional(),
  deviceType: Joi.string().valid('ios', 'android', 'web').optional()
});

router.post(
  '/authenticate',
  validateRequest(authenticateSchema),
  siweController.authenticate
);

export default router;