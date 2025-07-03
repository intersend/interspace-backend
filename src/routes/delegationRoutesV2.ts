import { Router, Request, Response } from 'express';
import { authenticateAccount } from '@/middleware/authMiddlewareV2';
import { ensureProfileAccess } from '@/middleware/authCompatibility';
import { apiRateLimit, transactionRateLimit } from '@/middleware/rateLimiter';
import { validateRequest } from '@/middleware/validateRequest';
import { body, param } from 'express-validator';
import { asyncHandler } from '@/utils/asyncHandler';
import { delegationService } from '@/services/delegationService';

const router = Router();

// Apply authentication middleware to all routes
router.use(authenticateAccount);

// Create delegation authorization
router.post(
  '/profiles/:profileId/accounts/:accountId/delegate',
  apiRateLimit,
  param('profileId').isString().notEmpty(),
  param('accountId').isString().notEmpty(),
  body('chainId').isNumeric(),
  body('contractAddress').isEthereumAddress(),
  body('permissions').isArray().notEmpty(),
  body('permissions.*.method').isString().notEmpty(),
  body('permissions.*.params').optional().isObject(),
  body('expirationTime').optional().isISO8601(),
  body('maxGasPrice').optional().isString(),
  body('nonce').optional().isNumeric(),
  validateRequest,
  ensureProfileAccess,
  asyncHandler(async (req: Request, res: Response) => {
    const { profileId, accountId } = req.params;
    const delegationData = req.body;

    const result = await delegationService.createDelegationAuthorization(
      (req as any).account.id,
      accountId!,
      delegationData.sessionWallet || '',
      delegationData.chainId,
      delegationData.permissions,
      delegationData.expirationTime ? new Date(delegationData.expirationTime) : undefined
    );

    res.json({
      success: true,
      data: result
    });
  })
);

// Confirm delegation with signature
router.post(
  '/profiles/:profileId/accounts/:accountId/delegate/confirm',
  apiRateLimit,
  param('profileId').isString().notEmpty(),
  param('accountId').isString().notEmpty(),
  body('delegationId').isString().notEmpty(),
  body('signature').isString().notEmpty(),
  body('authorizationList').isArray().notEmpty(),
  validateRequest,
  ensureProfileAccess,
  asyncHandler(async (req: Request, res: Response) => {
    const { profileId, accountId } = req.params;
    const { delegationId, signature, authorizationList } = req.body;

    // Using storeDelegation instead of confirmDelegation
    const result = await delegationService.storeDelegation(
      (req as any).account.id,
      accountId!,
      authorizationList[0], // Assuming first authorization in list
      undefined, // permissions
      undefined  // expiresAt
    );

    res.json({
      success: true,
      data: result
    });
  })
);

// Get profile delegations
router.get(
  '/profiles/:profileId/delegations',
  apiRateLimit,
  param('profileId').isString().notEmpty(),
  validateRequest,
  ensureProfileAccess,
  asyncHandler(async (req: Request, res: Response) => {
    const { profileId } = req.params;
    const { chainId, status } = req.query;

    const delegations = await delegationService.getProfileDelegations(
      (req as any).account.id,
      profileId!
    );

    res.json({
      success: true,
      data: delegations
    });
  })
);

// Revoke delegation
router.delete(
  '/profiles/:profileId/delegations/:delegationId',
  apiRateLimit,
  param('profileId').isString().notEmpty(),
  param('delegationId').isString().notEmpty(),
  validateRequest,
  ensureProfileAccess,
  asyncHandler(async (req: Request, res: Response) => {
    const { profileId, delegationId } = req.params;

    await delegationService.revokeDelegation(
      (req as any).account.id,
      delegationId!
    );

    res.json({
      success: true,
      message: 'Delegation revoked successfully'
    });
  })
);

// Execute delegated transaction
router.post(
  '/profiles/:profileId/delegated-tx',
  transactionRateLimit,
  param('profileId').isString().notEmpty(),
  body('delegationId').isString().notEmpty(),
  body('chainId').isNumeric(),
  body('to').isEthereumAddress(),
  body('data').isString(),
  body('value').optional().isString(),
  body('gasLimit').optional().isString(),
  validateRequest,
  ensureProfileAccess,
  asyncHandler(async (req: Request, res: Response) => {
    const { profileId } = req.params;
    const transactionData = req.body;

    // Using executeWithDelegation instead of executeDelegatedTransaction
    const result = await delegationService.executeWithDelegation(
      (req as any).account.id,
      transactionData.delegationId,
      {
        to: transactionData.to,
        value: transactionData.value,
        data: transactionData.data,
        chainId: transactionData.chainId
      }
    );

    res.json({
      success: true,
      data: result
    });
  })
);

// Get execution path for delegated transaction
router.post(
  '/profiles/:profileId/delegation-path',
  apiRateLimit,
  param('profileId').isString().notEmpty(),
  body('from').isEthereumAddress(),
  body('to').isEthereumAddress(),
  body('chainId').isNumeric(),
  validateRequest,
  ensureProfileAccess,
  asyncHandler(async (req: Request, res: Response) => {
    const { profileId } = req.params;
    const { from, to, chainId } = req.body;

    // Using determineBestExecutionPath instead of getExecutionPath
    const path = await delegationService.determineBestExecutionPath(
      profileId!,
      {
        to,
        chainId,
        value: undefined,
        data: undefined
      }
    );

    res.json({
      success: true,
      data: path
    });
  })
);

export default router;