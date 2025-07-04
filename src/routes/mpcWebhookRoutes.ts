import { Router } from 'express';
import { mpcWebhookController } from '../controllers/mpcWebhookController';
import { validateRequest } from '../middleware/validation';
import { asyncHandler } from '../utils/asyncHandler';
import Joi from 'joi';
import { config } from '../utils/config';

const router = Router();

// Validation schemas
const keyGeneratedSchema = Joi.object({
  profileId: Joi.string().required(),
  keyId: Joi.string().required(),
  publicKey: Joi.string().required(),
  address: Joi.string().required().pattern(/^0x[a-fA-F0-9]{40}$/)
});

const keyShareUpdateSchema = Joi.object({
  profileId: Joi.string().required(),
  keyId: Joi.string().required(),
  operation: Joi.string().valid('backup', 'restore', 'rotate').required()
});

// Simple webhook authentication middleware
const authenticateWebhook = (req: any, res: any, next: any) => {
  const webhookSecret = req.headers['x-webhook-secret'];
  
  // In production, use a proper webhook secret
  const expectedSecret = config.MPC_WEBHOOK_SECRET || 'development-webhook-secret';
  
  if (webhookSecret !== expectedSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  next();
};

/**
 * @route   POST /api/webhooks/mpc/key-generated
 * @desc    Handle MPC key generation completion
 * @access  Webhook (authenticated)
 */
router.post(
  '/key-generated',
  authenticateWebhook,
  validateRequest(keyGeneratedSchema),
  asyncHandler(mpcWebhookController.handleKeyGenerated)
);

/**
 * @route   POST /api/webhooks/mpc/key-share-update
 * @desc    Handle MPC key share updates
 * @access  Webhook (authenticated)
 */
router.post(
  '/key-share-update',
  authenticateWebhook,
  validateRequest(keyShareUpdateSchema),
  asyncHandler(mpcWebhookController.handleKeyShareUpdate)
);

export default router;