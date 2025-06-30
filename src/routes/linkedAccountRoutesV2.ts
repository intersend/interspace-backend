import { Router } from 'express';
import { linkedAccountController } from '@/controllers/linkedAccountController';
import { asyncHandler } from '@/middleware/errorHandler';
import { validateRequest } from '@/middleware/validation';
import { userRateLimit } from '@/middleware/rateLimiter';
import { v2AuthAdapter } from '@/middleware/v2AuthAdapter';
import Joi from 'joi';

const { authenticateAccount } = require('@/middleware/authMiddlewareV2');

const router = Router();

// All routes require authentication
router.use(authenticateAccount);
router.use(asyncHandler(v2AuthAdapter)); // Adapt v2 auth for v1 controllers
router.use(userRateLimit);

// Validation schemas
const linkAccountSchema = Joi.object({
  address: Joi.string().required(),
  walletType: Joi.string().valid('metamask', 'walletconnect', 'coinbase', 'other').default('other'),
  customName: Joi.string().max(50).optional(),
  isPrimary: Joi.boolean().default(false)
});

const updateAccountSchema = Joi.object({
  customName: Joi.string().max(50).allow(null, '').optional(),
  isPrimary: Joi.boolean().optional()
});

const searchByAddressSchema = Joi.object({
  address: Joi.string().required()
});

const tokenAllowanceSchema = Joi.object({
  spender: Joi.string().required(),
  amount: Joi.string().required(),
  tokenAddress: Joi.string().required(),
  chainId: Joi.number().required()
});

// Profile-specific routes
router.get('/profiles/:profileId/accounts', asyncHandler(linkedAccountController.getProfileAccounts));

router.post(
  '/profiles/:profileId/accounts',
  validateRequest(linkAccountSchema),
  asyncHandler(linkedAccountController.linkAccount)
);

// Account-specific routes
router.put(
  '/accounts/:accountId',
  validateRequest(updateAccountSchema),
  asyncHandler(linkedAccountController.updateLinkedAccount)
);

router.delete('/accounts/:accountId', asyncHandler(linkedAccountController.unlinkAccount));

// Set primary account route - needs to be implemented in controller
// router.post('/accounts/:accountId/primary', asyncHandler(linkedAccountController.setPrimaryAccount));

// Search route
router.post(
  '/accounts/search',
  validateRequest(searchByAddressSchema),
  asyncHandler(linkedAccountController.searchAccountByAddress)
);

// Token allowance routes
router.post(
  '/profiles/:profileId/accounts/:accountId/allowances',
  validateRequest(tokenAllowanceSchema),
  asyncHandler(linkedAccountController.grantTokenAllowance)
);

router.get(
  '/profiles/:profileId/accounts/:accountId/allowances',
  asyncHandler(linkedAccountController.getAccountAllowances)
);

export default router;