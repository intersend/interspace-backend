import { Router } from 'express';
import { orbyController } from '@/controllers/orbyController';
import { authenticate } from '@/middleware/auth';
import { asyncHandler } from '@/middleware/errorHandler';
import { validateRequest } from '@/middleware/validation';
import { userRateLimit, transactionRateLimit } from '@/middleware/rateLimiter';
import Joi from 'joi';

const router = Router();

// Health check endpoint - no authentication required
router.get('/health', asyncHandler(orbyController.checkHealth));

// All other routes require authentication and standard rate limiting
router.use(authenticate);
router.use(userRateLimit);

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
router.get('/profiles/:id/balance', asyncHandler(orbyController.getUnifiedBalance));

router.get(
  '/profiles/:id/orby-rpc-url',
  asyncHandler(orbyController.getVirtualNodeRpcUrl)
);

router.post(
  '/profiles/:id/intent',
  transactionRateLimit,
  validateRequest(createIntentSchema),
  asyncHandler(orbyController.createIntent)
);

router.post(
  '/operations/:operationSetId/submit',
  transactionRateLimit,
  validateRequest(submitOperationsSchema),
  asyncHandler(orbyController.submitSignedOperations)
);

router.get('/operations/:operationSetId/status', asyncHandler(orbyController.getOperationStatus));

router.get('/profiles/:id/transactions', asyncHandler(orbyController.getTransactionHistory));

router.get('/profiles/:id/gas-tokens', asyncHandler(orbyController.getGasTokens));

router.post(
  '/profiles/:id/gas-tokens/preference',
  validateRequest(setGasTokenPreferenceSchema),
  asyncHandler(orbyController.setPreferredGasToken)
);

export default router;
