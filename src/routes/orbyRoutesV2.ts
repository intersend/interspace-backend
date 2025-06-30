import { Router } from 'express';
import { orbyController } from '@/controllers/orbyController';
import { asyncHandler } from '@/middleware/errorHandler';
import { validateRequest } from '@/middleware/validation';
import { userRateLimit, transactionRateLimit } from '@/middleware/rateLimiter';
import { v2AuthAdapter } from '@/middleware/v2AuthAdapter';
import Joi from 'joi';

const { authenticateAccount } = require('@/middleware/authMiddlewareV2');

const router = Router();

// Health check endpoint - no authentication required
router.get('/health', asyncHandler(orbyController.checkHealth));

// All other routes require authentication and standard rate limiting
router.use(authenticateAccount);
router.use(asyncHandler(v2AuthAdapter)); // Adapt v2 auth for v1 controllers
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
  tokenAddress: Joi.string().optional(),
  chainId: Joi.number().required()
});

const batchIntentSchema = Joi.object({
  operations: Joi.array().items(Joi.object({
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
  })).min(1).max(10).required(),
  atomicExecution: Joi.boolean().optional().default(false),
  profile: Joi.object({
    priorityFee: Joi.string().optional(),
    slippageTolerance: Joi.number().optional()
  }).optional()
});

const executeBatchSchema = Joi.object({
  signedOperations: Joi.array().items(Joi.object({
    operationSetId: Joi.string().required(),
    signatures: Joi.array().items(Joi.object({
      index: Joi.number().required(),
      signature: Joi.string().required(),
      signedData: Joi.string().optional()
    })).required()
  })).required()
});

// Profile-specific routes
router.get('/:profileId/balance', asyncHandler(orbyController.getUnifiedBalance));
router.get('/:profileId/orby-rpc-url', asyncHandler(orbyController.getVirtualNodeRpcUrl));
router.post('/:profileId/intent', validateRequest(createIntentSchema), transactionRateLimit, asyncHandler(orbyController.createIntent));
// Get unsigned operations route - needs to be implemented in controller
// router.get('/:profileId/operations/:operationSetId/unsigned', asyncHandler(orbyController.getUnsignedOperations));
router.post('/:profileId/operations/:operationSetId/submit', validateRequest(submitOperationsSchema), transactionRateLimit, asyncHandler(orbyController.submitSignedOperations));
router.get('/:profileId/operations/:operationSetId/status', asyncHandler(orbyController.getOperationStatus));
router.get('/:profileId/transactions', asyncHandler(orbyController.getTransactionHistory));
router.get('/:profileId/gas-tokens', asyncHandler(orbyController.getGasTokens));
router.post('/:profileId/gas-tokens/preference', validateRequest(setGasTokenPreferenceSchema), asyncHandler(orbyController.setPreferredGasToken));
// Batch intent route - needs to be implemented in controller
// router.post('/:profileId/batch-intent', validateRequest(batchIntentSchema), transactionRateLimit, asyncHandler(orbyController.createBatchIntent));
// Execute batch route - needs to be implemented in controller
// router.post('/:profileId/batch/:batchId/execute', validateRequest(executeBatchSchema), transactionRateLimit, asyncHandler(orbyController.executeBatch));
// Get batch status route - needs to be implemented in controller
// router.get('/:profileId/batch/:batchId/status', asyncHandler(orbyController.getBatchStatus));

// General operation routes (not profile-specific)
router.get('/operations/:operationSetId/status', asyncHandler(orbyController.getOperationStatus));
router.post('/operations/:operationSetId/submit', validateRequest(submitOperationsSchema), transactionRateLimit, asyncHandler(orbyController.submitSignedOperations));

export default router;