import { Router } from 'express';
import { passkeyController } from '@/controllers/passkeyController';
import { authenticate } from '@/middleware/auth';
import { authRateLimit } from '@/middleware/rateLimiter';
import { body } from 'express-validator';
import { validateRequest } from '@/middleware/validateRequest';

const router = Router();

// Public routes (no auth required)

/**
 * @route   POST /api/auth/passkey/authenticate-options
 * @desc    Generate authentication options for passkey sign-in
 * @access  Public
 */
router.post('/authenticate-options',
  authRateLimit,
  [
    body('username').optional().isString().trim()
  ],
  validateRequest,
  passkeyController.generateAuthenticationOptions
);

/**
 * @route   POST /api/auth/passkey/authenticate-verify
 * @desc    Verify passkey authentication and sign in user
 * @access  Public
 */
router.post('/authenticate-verify',
  authRateLimit,
  [
    body('response').notEmpty().withMessage('Response is required'),
    body('challenge').notEmpty().withMessage('Challenge is required'),
    body('deviceId').optional().isString(),
    body('deviceName').optional().isString(),
    body('deviceType').optional().isIn(['ios', 'android', 'web']).default('web')
  ],
  validateRequest,
  passkeyController.verifyAuthentication
);

// Protected routes (auth required)

/**
 * @route   POST /api/auth/passkey/register-options
 * @desc    Generate registration options for creating a new passkey
 * @access  Private
 */
router.post('/register-options',
  authenticate,
  [
    body('deviceName').optional().isString().trim()
  ],
  validateRequest,
  passkeyController.generateRegistrationOptions
);

/**
 * @route   POST /api/auth/passkey/register-verify
 * @desc    Verify passkey registration and save credential
 * @access  Private
 */
router.post('/register-verify',
  authenticate,
  [
    body('response').notEmpty().withMessage('Response is required'),
    body('challenge').notEmpty().withMessage('Challenge is required'),
    body('deviceName').optional().isString().trim()
  ],
  validateRequest,
  passkeyController.verifyRegistration
);

/**
 * @route   GET /api/auth/passkey/credentials
 * @desc    Get user's passkey credentials
 * @access  Private
 */
router.get('/credentials',
  authenticate,
  passkeyController.getUserPasskeys
);

/**
 * @route   DELETE /api/auth/passkey/credentials/:credentialId
 * @desc    Delete a passkey credential
 * @access  Private
 */
router.delete('/credentials/:credentialId',
  authenticate,
  passkeyController.deletePasskey
);

export default router;