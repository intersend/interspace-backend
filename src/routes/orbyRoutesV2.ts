import { Router, Request, Response } from 'express';
import { authenticateAccount } from '@/middleware/authMiddlewareV2';
import { ensureProfileAccess } from '@/middleware/authCompatibility';
import { apiRateLimit, transactionRateLimit } from '@/middleware/rateLimiter';
import { validateRequest } from '@/middleware/validateRequest';
import { body, param, query } from 'express-validator';
import { asyncHandler } from '@/utils/asyncHandler';
import { orbyService } from '@/services/orbyService';

const router = Router();

// Apply authentication middleware to all routes
router.use(authenticateAccount);

// Get unified balance for profile
router.get(
  '/profiles/:profileId/balance',
  apiRateLimit,
  param('profileId').isString().notEmpty(),
  query('chainIds').optional().isString(), // comma-separated list
  query('tokenAddresses').optional().isString(), // comma-separated list
  validateRequest,
  asyncHandler(ensureProfileAccess),
  asyncHandler(async (req: Request, res: Response) => {
    const { profileId } = req.params;
    const { chainIds, tokenAddresses } = req.query;

    // TODO: Implement getUnifiedBalance method in orbyService
    const balance = { totalValue: '0', tokens: [] };
    // await orbyService.getUnifiedBalance(...);

    res.json({
      success: true,
      data: balance
    });
  })
);

// Get account cluster info
router.get(
  '/profiles/:profileId/cluster',
  apiRateLimit,
  param('profileId').isString().notEmpty(),
  validateRequest,
  asyncHandler(ensureProfileAccess),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { profileId } = req.params;

    // Fetch the profile with linked accounts
    const { prisma } = await import('@/utils/database');
    const profile = await prisma.smartProfile.findUnique({
      where: { id: profileId },
      include: { linkedAccounts: true }
    });
    
    if (!profile) {
      res.status(404).json({
        success: false,
        error: 'Profile not found'
      });
      return;
    }

    // Using createOrGetAccountCluster with profile object
    const cluster = await orbyService.createOrGetAccountCluster(profile);

    res.json({
      success: true,
      data: cluster
    });
  })
);

// Update account cluster
router.patch(
  '/profiles/:profileId/cluster',
  apiRateLimit,
  param('profileId').isString().notEmpty(),
  body('accounts').isArray().notEmpty(),
  body('accounts.*.address').isEthereumAddress(),
  body('accounts.*.accountType').isIn(['EOA', 'CONTRACT', 'SESSION']),
  validateRequest,
  asyncHandler(ensureProfileAccess),
  asyncHandler(async (req: Request, res: Response) => {
    const { profileId } = req.params;
    const { accounts } = req.body;

    if (!profileId) {
      res.status(400).json({
        success: false,
        error: 'Profile ID is required'
      });
      return;
    }

    // updateAccountCluster accepts profileId as string
    await orbyService.updateAccountCluster(profileId);
    const result = { success: true, accounts };

    res.json({
      success: true,
      data: result
    });
  })
);

// Get virtual node RPC URL
router.get(
  '/profiles/:profileId/rpc/:chainId',
  apiRateLimit,
  param('profileId').isString().notEmpty(),
  param('chainId').isNumeric(),
  validateRequest,
  asyncHandler(ensureProfileAccess),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { profileId, chainId } = req.params;

    // Fetch the profile
    const { prisma } = await import('@/utils/database');
    const profile = await prisma.smartProfile.findUnique({
      where: { id: profileId }
    });
    
    if (!profile) {
      res.status(404).json({
        success: false,
        error: 'Profile not found'
      });
      return;
    }

    const rpcInfo = await orbyService.getVirtualNodeRpcUrl(
      profile,
      Number(chainId)
    );

    res.json({
      success: true,
      data: rpcInfo
    });
  })
);

// Execute cross-chain operation
router.post(
  '/profiles/:profileId/cross-chain',
  transactionRateLimit,
  param('profileId').isString().notEmpty(),
  body('operation').isIn(['swap', 'bridge', 'transfer']),
  body('fromChainId').isNumeric(),
  body('toChainId').isNumeric(),
  body('fromToken').isEthereumAddress(),
  body('toToken').isEthereumAddress(),
  body('amount').isString().notEmpty(),
  body('recipient').optional().isEthereumAddress(),
  body('slippage').optional().isNumeric(),
  validateRequest,
  asyncHandler(ensureProfileAccess),
  asyncHandler(async (req: Request, res: Response) => {
    const { profileId } = req.params;
    const operationData = req.body;

    // TODO: Implement executeCrossChainOperation method in orbyService
    const result = { operationId: 'placeholder', status: 'pending' };
    // await orbyService.executeCrossChainOperation(...);

    res.json({
      success: true,
      data: result
    });
  })
);

// Get transaction history
router.get(
  '/profiles/:profileId/transactions',
  apiRateLimit,
  param('profileId').isString().notEmpty(),
  query('chainId').optional().isNumeric(),
  query('limit').optional().isNumeric().toInt(),
  query('offset').optional().isNumeric().toInt(),
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601(),
  validateRequest,
  asyncHandler(ensureProfileAccess),
  asyncHandler(async (req: Request, res: Response) => {
    const { profileId } = req.params;
    const filters = req.query;

    // TODO: Implement getTransactionHistory method in orbyService
    const transactions = { transactions: [], total: 0 };
    // await orbyService.getTransactionHistory(...);

    res.json({
      success: true,
      data: transactions
    });
  })
);

// Get gas estimates across chains
router.post(
  '/profiles/:profileId/gas-estimate',
  apiRateLimit,
  param('profileId').isString().notEmpty(),
  body('transactions').isArray().notEmpty(),
  body('transactions.*.chainId').isNumeric(),
  body('transactions.*.to').isEthereumAddress(),
  body('transactions.*.data').isString(),
  body('transactions.*.value').optional().isString(),
  validateRequest,
  asyncHandler(ensureProfileAccess),
  asyncHandler(async (req: Request, res: Response) => {
    const { profileId } = req.params;
    const { transactions } = req.body;

    // TODO: Implement getGasEstimates method in orbyService
    const estimates = { estimates: [] };
    // await orbyService.getGasEstimates(...);

    res.json({
      success: true,
      data: estimates
    });
  })
);

// Get optimal route for operation
router.post(
  '/profiles/:profileId/route',
  apiRateLimit,
  param('profileId').isString().notEmpty(),
  body('fromChainId').isNumeric(),
  body('toChainId').isNumeric(),
  body('fromToken').isEthereumAddress(),
  body('toToken').isEthereumAddress(),
  body('amount').isString().notEmpty(),
  body('optimizeFor').optional().isIn(['speed', 'cost', 'security']),
  validateRequest,
  asyncHandler(ensureProfileAccess),
  asyncHandler(async (req: Request, res: Response) => {
    const { profileId } = req.params;
    const routeData = req.body;

    // TODO: Implement getOptimalRoute method in orbyService
    const route = { path: [], estimatedGas: '0', estimatedTime: 0 };
    // await orbyService.getOptimalRoute(...);

    res.json({
      success: true,
      data: route
    });
  })
);

export default router;