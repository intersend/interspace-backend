import { Router } from 'express';
import { delegationController } from '@/controllers/delegationController';
import { asyncHandler } from '@/middleware/errorHandler';
import { validateRequest } from '@/middleware/validation';
import { userRateLimit, transactionRateLimit } from '@/middleware/rateLimiter';
import { v2AuthAdapter } from '@/middleware/v2AuthAdapter';
import { body, param } from 'express-validator';

const { authenticateAccount } = require('@/middleware/authMiddlewareV2');

const router = Router();

// All routes require authentication
router.use(authenticateAccount);
router.use(asyncHandler(v2AuthAdapter)); // Adapt v2 auth for v1 controllers
router.use(userRateLimit);

// Validation schemas
const createDelegationValidation = [
  param('profileId').isUUID().withMessage('Invalid profile ID'),
  param('accountId').isUUID().withMessage('Invalid account ID'),
  body('permissions').isObject().withMessage('Permissions must be an object'),
  body('permissions.transfer').optional().isBoolean(),
  body('permissions.swap').optional().isBoolean(),
  body('permissions.approve').optional().isBoolean(),
  body('permissions.all').optional().isBoolean(),
  body('expiresAt').optional().isISO8601().withMessage('Invalid expiration date')
];

const confirmDelegationValidation = [
  param('profileId').isUUID().withMessage('Invalid profile ID'),
  param('accountId').isUUID().withMessage('Invalid account ID'),
  body('signature').notEmpty().withMessage('Signature is required'),
  body('authorizationData').isObject().withMessage('Authorization data is required'),
  body('authorizationData.chainId').isInt().withMessage('Chain ID must be an integer'),
  body('authorizationData.address').isEthereumAddress().withMessage('Invalid session wallet address'),
  body('authorizationData.nonce').isString().withMessage('Nonce is required')
];

const executeDelegatedValidation = [
  param('profileId').isUUID().withMessage('Invalid profile ID'),
  body('delegationId').isUUID().withMessage('Invalid delegation ID'),
  body('transaction').isObject().withMessage('Transaction data is required'),
  body('transaction.to').isEthereumAddress().withMessage('Invalid recipient address'),
  body('transaction.value').isString().withMessage('Transaction value is required'),
  body('transaction.data').optional().isHexadecimal().withMessage('Transaction data must be hex')
];

// Routes
router.post(
  '/profiles/:profileId/accounts/:accountId/delegate',
  createDelegationValidation,
  asyncHandler(delegationController.createDelegationAuthorization)
);

router.post(
  '/profiles/:profileId/accounts/:accountId/delegate/confirm',
  confirmDelegationValidation,
  asyncHandler(delegationController.confirmDelegation)
);

router.get(
  '/profiles/:profileId/delegations',
  param('profileId').isUUID(),
  asyncHandler(delegationController.getProfileDelegations)
);

router.delete(
  '/profiles/:profileId/delegations/:delegationId',
  [
    param('profileId').isUUID(),
    param('delegationId').isUUID()
  ],
  asyncHandler(delegationController.revokeDelegation)
);

router.post(
  '/profiles/:profileId/execute-delegated',
  executeDelegatedValidation,
  transactionRateLimit,
  asyncHandler(delegationController.executeDelegated)
);

router.get(
  '/profiles/:profileId/execution-path',
  param('profileId').isUUID(),
  asyncHandler(delegationController.getExecutionPath)
);

export default router;