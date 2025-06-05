import { Router } from 'express';
import { linkedAccountController } from '@/controllers/linkedAccountController';
import { authenticate } from '@/middleware/auth';
import { userRateLimit, transactionRateLimit } from '@/middleware/rateLimiter';

const router = Router();

// All routes require authentication
router.use(authenticate);
router.use(userRateLimit);

// Linked account routes
router.post('/profiles/:profileId/accounts', linkedAccountController.linkAccount);
router.get('/profiles/:profileId/accounts', linkedAccountController.getProfileAccounts);
router.get('/accounts/search', linkedAccountController.searchAccountByAddress);
router.put('/accounts/:accountId', linkedAccountController.updateLinkedAccount);
router.delete('/accounts/:accountId', linkedAccountController.unlinkAccount);

// Token allowance routes (with transaction rate limiting)
router.post('/accounts/:accountId/allowances', transactionRateLimit, linkedAccountController.grantTokenAllowance);
router.get('/accounts/:accountId/allowances', linkedAccountController.getAccountAllowances);
router.delete('/allowances/:allowanceId', transactionRateLimit, linkedAccountController.revokeTokenAllowance);

export default router;
