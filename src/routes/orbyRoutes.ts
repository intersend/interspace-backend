import { Router } from 'express';
import { orbyController } from '@/controllers/orbyController';
import { authenticate } from '@/middleware/auth';
import { asyncHandler } from '@/middleware/errorHandler';
import { validateRequest } from '@/middleware/validation';
import Joi from 'joi';

const router = Router();

// Validation schemas
const createIntentSchema = Joi.object({
  type: Joi.string().valid('transfer', 'swap').required(),
  from: Joi.object({
    token: Joi.string().required(),
    chainId: Joi.number().required(),
    amount: Joi.string().required()
  }).required(),
  to: Joi.object({
    address: Joi.string().when('$type', { is: 'transfer', then: Joi.required() }),
    token: Joi.string().when('$type', { is: 'swap', then: Joi.required() }),
    chainId: Joi.number().optional()
  }).required(),
  gasToken: Joi.object({
    standardizedTokenId: Joi.string().required(),
    tokenSources: Joi.array().items(Joi.object({
      chainId: Joi.number().required(),
      address: Joi.string().optional()
    })).optional()
  }).optional()
});

const submitOperationsSchema = Joi.object({
  signedOperations: Joi.array().items(Joi.object({
    index: Joi.number().required(),
    signature: Joi.string().required(),
    signedData: Joi.string().optional()
  })).required()
});

const setGasTokenPreferenceSchema = Joi.object({
  standardizedTokenId: Joi.string().required(),
  tokenSymbol: Joi.string().required(),
  chainPreferences: Joi.object().pattern(
    Joi.number(),
    Joi.string()
  ).optional()
});

// Routes
router.get(
  '/profiles/:id/balance',
  authenticate,
  asyncHandler(orbyController.getUnifiedBalance)
);

router.post(
  '/profiles/:id/intent',
  authenticate,
  validateRequest(createIntentSchema),
  asyncHandler(orbyController.createIntent)
);

router.post(
  '/operations/:operationSetId/submit',
  authenticate,
  validateRequest(submitOperationsSchema),
  asyncHandler(orbyController.submitSignedOperations)
);

router.get(
  '/operations/:operationSetId/status',
  authenticate,
  asyncHandler(orbyController.getOperationStatus)
);

router.get(
  '/profiles/:id/transactions',
  authenticate,
  asyncHandler(orbyController.getTransactionHistory)
);

router.get(
  '/profiles/:id/gas-tokens',
  authenticate,
  asyncHandler(orbyController.getGasTokens)
);

router.post(
  '/profiles/:id/gas-tokens/preference',
  authenticate,
  validateRequest(setGasTokenPreferenceSchema),
  asyncHandler(orbyController.setPreferredGasToken)
);

export default router;
