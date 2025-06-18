import { Router } from 'express';
import { emailAuthController } from '../controllers/emailAuthController';
import { asyncHandler } from '../utils/asyncHandler';
import { authRateLimit } from '../middleware/rateLimiter';

const router = Router();

// Email authentication routes
router.post(
  '/request-code',
  authRateLimit,
  asyncHandler(emailAuthController.requestCode.bind(emailAuthController))
);

router.post(
  '/verify-code',
  authRateLimit,
  asyncHandler(emailAuthController.verifyCode.bind(emailAuthController))
);

router.post(
  '/resend-code',
  authRateLimit,
  asyncHandler(emailAuthController.resendCode.bind(emailAuthController))
);

// Development only route
if (process.env.NODE_ENV === 'development') {
  router.get(
    '/dev/last-code',
    asyncHandler(emailAuthController.getLastCodeForDevelopment.bind(emailAuthController))
  );
}

export default router;