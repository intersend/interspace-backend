import { Router, Request, Response } from 'express';
import { authenticateAccount } from '@/middleware/authMiddlewareV2';
import { authRateLimit } from '@/middleware/rateLimiter';
import { validateRequest } from '@/middleware/validateRequest';
import { body } from 'express-validator';
import { asyncHandler } from '@/utils/asyncHandler';
import { twoFactorService } from '@/services/twoFactorService';

const router = Router();

// Apply authentication middleware to all routes
router.use(authenticateAccount);

// Get 2FA status
router.get(
  '/status',
  authRateLimit,
  asyncHandler(async (req: Request, res: Response) => {
    const accountId = (req as any).account.id;

    const isEnabled = await twoFactorService.isEnabled(accountId);
    const status = { enabled: isEnabled, method: isEnabled ? 'authenticator' : null };

    res.json({
      success: true,
      data: status
    });
  })
);

// Enable 2FA
router.post(
  '/enable',
  authRateLimit,
  body('password').isString().notEmpty(),
  validateRequest,
  asyncHandler(async (req: Request, res: Response) => {
    const accountId = (req as any).account.id;
    const { password } = req.body;

    // TODO: Verify password before enabling 2FA
    const result = await twoFactorService.setupTwoFactor(accountId);

    res.json({
      success: true,
      data: result
    });
  })
);

// Verify 2FA setup
router.post(
  '/verify-setup',
  authRateLimit,
  body('token').isString().isLength({ min: 6, max: 6 }),
  validateRequest,
  asyncHandler(async (req: Request, res: Response) => {
    const accountId = (req as any).account.id;
    const { token } = req.body;

    await twoFactorService.verifyAndEnableTwoFactor(accountId, token);
    const result = { success: true };

    res.json({
      success: true,
      data: result
    });
  })
);

// Verify 2FA token (for critical operations)
router.post(
  '/verify',
  authRateLimit,
  body('token').isString(),
  body('operation').optional().isString(),
  validateRequest,
  asyncHandler(async (req: Request, res: Response) => {
    const accountId = (req as any).account.id;
    const { token, operation } = req.body;

    const isValid = await twoFactorService.verifyToken(accountId, token);
    // TODO: Handle operation-specific verification if needed

    res.json({
      success: true,
      data: { valid: isValid }
    });
  })
);

// Disable 2FA
router.post(
  '/disable',
  authRateLimit,
  body('password').isString().notEmpty(),
  body('token').isString(),
  validateRequest,
  asyncHandler(async (req: Request, res: Response) => {
    const accountId = (req as any).account.id;
    const { password, token } = req.body;

    // TODO: Verify token before disabling
    await twoFactorService.disableTwoFactor(accountId, password);

    res.json({
      success: true,
      message: '2FA disabled successfully'
    });
  })
);

// Generate backup codes
router.post(
  '/backup-codes',
  authRateLimit,
  body('password').isString().notEmpty(),
  validateRequest,
  asyncHandler(async (req: Request, res: Response) => {
    const accountId = (req as any).account.id;
    const { password } = req.body;

    const codes = await twoFactorService.generateBackupCodes(accountId);

    res.json({
      success: true,
      data: { backupCodes: codes }
    });
  })
);

// Verify backup code
router.post(
  '/verify-backup',
  authRateLimit,
  body('code').isString().notEmpty(),
  validateRequest,
  asyncHandler(async (req: Request, res: Response) => {
    const accountId = (req as any).account.id;
    const { code } = req.body;

    // TODO: Implement verifyBackupCode as public method
    const isValid = false;
    // await twoFactorService.verifyBackupCode(accountId, code);

    res.json({
      success: true,
      data: { valid: isValid }
    });
  })
);

// Get recovery options
router.get(
  '/recovery',
  authRateLimit,
  asyncHandler(async (req: Request, res: Response) => {
    const accountId = (req as any).account.id;

    // TODO: Implement getRecoveryOptions method in twoFactorService
    const options = { backupCodesRemaining: 0, recoveryEmail: null };
    // await twoFactorService.getRecoveryOptions(accountId);

    res.json({
      success: true,
      data: options
    });
  })
);

export default router;