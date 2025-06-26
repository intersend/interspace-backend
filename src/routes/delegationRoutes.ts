import { Router } from 'express';
import { delegationController } from '@/controllers/delegationController';
import { authenticate } from '@/middleware/auth';
import { asyncHandler } from '@/middleware/errorHandler';
import { userRateLimit, transactionRateLimit } from '@/middleware/rateLimiter';

const router = Router();

// All routes require authentication
router.use(authenticate);
router.use(userRateLimit);

// Create delegation authorization (for frontend to sign)
router.post(
  '/profiles/:profileId/accounts/:accountId/delegate',
  asyncHandler(delegationController.createDelegationAuthorization)
);

// Confirm delegation with signed authorization
router.post(
  '/profiles/:profileId/accounts/:accountId/delegate/confirm',
  asyncHandler(delegationController.confirmDelegation)
);

// Get all active delegations for a profile
router.get(
  '/profiles/:profileId/delegations',
  asyncHandler(delegationController.getProfileDelegations)
);

// Revoke a delegation
router.delete(
  '/profiles/:profileId/delegations/:delegationId',
  asyncHandler(delegationController.revokeDelegation)
);

// Execute a transaction using delegation
router.post(
  '/profiles/:profileId/execute-delegated',
  transactionRateLimit,
  asyncHandler(delegationController.executeDelegated)
);

// Get recommended execution path for a transaction
router.get(
  '/profiles/:profileId/execution-path',
  asyncHandler(delegationController.getExecutionPath)
);

export default router;