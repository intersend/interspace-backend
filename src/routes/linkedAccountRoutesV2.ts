import { Router, Request, Response } from 'express';
import { authenticateAccount } from '@/middleware/authMiddlewareV2';
import { ensureProfileAccess } from '@/middleware/authCompatibility';
import { apiRateLimit } from '@/middleware/rateLimiter';
import { validateRequest } from '@/middleware/validateRequest';
import { body, param, query } from 'express-validator';
import { asyncHandler } from '@/utils/asyncHandler';
import { linkedAccountService } from '@/services/linkedAccountService';

const router = Router();

// Apply authentication middleware to all routes
router.use(authenticateAccount);

// Link wallet account to profile
router.post(
  '/profiles/:profileId/accounts',
  apiRateLimit,
  param('profileId').isString().notEmpty(),
  body('address').isEthereumAddress(),
  body('walletType').isString().notEmpty(),
  body('chainId').isNumeric(),
  body('signature').isString().notEmpty(),
  body('message').isString().notEmpty(),
  body('name').optional().isString(),
  body('isPrimary').optional().isBoolean(),
  validateRequest,
  asyncHandler(ensureProfileAccess),
  asyncHandler(async (req: Request, res: Response) => {
    const { profileId } = req.params;
    const linkData = req.body;

    // Convert chainId to number if it exists
    if (linkData.chainId) {
      linkData.chainId = parseInt(linkData.chainId);
    }

    const result = await linkedAccountService.linkAccount(
      profileId!,
      (req as any).account.id,
      linkData
    );

    res.json({
      success: true,
      data: result
    });
  })
);

// Get profile accounts
router.get(
  '/profiles/:profileId/accounts',
  apiRateLimit,
  param('profileId').isString().notEmpty(),
  query('chainId').optional().isNumeric(),
  query('walletType').optional().isString(),
  validateRequest,
  asyncHandler(ensureProfileAccess),
  asyncHandler(async (req: Request, res: Response) => {
    const { profileId } = req.params;
    const { chainId, walletType } = req.query;

    const accounts = await linkedAccountService.getProfileAccounts(
      profileId!,
      (req as any).account.id
    );

    res.json({
      success: true,
      data: accounts
    });
  })
);

// Update linked account
router.patch(
  '/profiles/:profileId/accounts/:accountId',
  apiRateLimit,
  param('profileId').isString().notEmpty(),
  param('accountId').isString().notEmpty(),
  body('name').optional().isString(),
  body('isPrimary').optional().isBoolean(),
  validateRequest,
  asyncHandler(ensureProfileAccess),
  asyncHandler(async (req: Request, res: Response) => {
    const { profileId, accountId } = req.params;
    const updateData = req.body;

    const result = await linkedAccountService.updateLinkedAccount(
      accountId!, // linkedAccountId
      (req as any).account.id,
      updateData
    );

    res.json({
      success: true,
      data: result
    });
  })
);

// Unlink account
router.delete(
  '/profiles/:profileId/accounts/:accountId',
  apiRateLimit,
  param('profileId').isString().notEmpty(),
  param('accountId').isString().notEmpty(),
  validateRequest,
  asyncHandler(ensureProfileAccess),
  asyncHandler(async (req: Request, res: Response) => {
    const { profileId, accountId } = req.params;

    await linkedAccountService.unlinkAccount(
      accountId!, // linkedAccountId
      (req as any).account.id
    );

    res.json({
      success: true,
      message: 'Account unlinked successfully'
    });
  })
);

// Search account by address
router.get(
  '/accounts/search',
  apiRateLimit,
  query('address').isEthereumAddress(),
  validateRequest,
  asyncHandler(async (req: Request, res: Response) => {
    const { address } = req.query;

    const result = await linkedAccountService.searchAccountByAddress(
      address as string
    );

    res.json({
      success: true,
      data: result
    });
  })
);

// Grant token allowance
router.post(
  '/profiles/:profileId/accounts/:accountId/allowances',
  apiRateLimit,
  param('profileId').isString().notEmpty(),
  param('accountId').isString().notEmpty(),
  body('tokenAddress').isEthereumAddress(),
  body('spender').isEthereumAddress(),
  body('amount').isString().notEmpty(),
  body('chainId').isNumeric(),
  body('signature').isString().notEmpty(),
  validateRequest,
  asyncHandler(ensureProfileAccess),
  asyncHandler(async (req: Request, res: Response) => {
    const { profileId, accountId } = req.params;
    const allowanceData = req.body;

    // Convert chainId to number if it exists
    if (allowanceData.chainId) {
      allowanceData.chainId = parseInt(allowanceData.chainId);
    }

    const result = await linkedAccountService.grantTokenAllowance(
      accountId!, // linkedAccountId
      (req as any).account.id,
      allowanceData
    );

    res.json({
      success: true,
      data: result
    });
  })
);

// Get account allowances
router.get(
  '/profiles/:profileId/accounts/:accountId/allowances',
  apiRateLimit,
  param('profileId').isString().notEmpty(),
  param('accountId').isString().notEmpty(),
  query('chainId').optional().isNumeric(),
  query('tokenAddress').optional().isEthereumAddress(),
  validateRequest,
  asyncHandler(ensureProfileAccess),
  asyncHandler(async (req: Request, res: Response) => {
    const { profileId, accountId } = req.params;
    const { chainId, tokenAddress } = req.query;

    const allowances = await linkedAccountService.getAccountAllowances(
      accountId!, // linkedAccountId
      (req as any).account.id
    );

    res.json({
      success: true,
      data: allowances
    });
  })
);

export default router;