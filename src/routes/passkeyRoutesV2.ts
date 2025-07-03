import express from 'express';
import { body } from 'express-validator';
import { passkeyControllerV2 } from '../controllers/passkeyControllerV2';
import { authenticateAccount } from '../middleware/authMiddlewareV2';
import { authRateLimit } from '../middleware/rateLimiter';

const router = express.Router();

/**
 * @route   POST /api/v2/auth/passkey/register-options
 * @desc    Generate passkey registration options
 * @access  Private
 */
router.post('/register-options',
  authenticateAccount,
  authRateLimit,
  [
    body('username').notEmpty().withMessage('Username is required'),
    body('displayName').optional().isString(),
    body('deviceName').optional().isString()
  ],
  passkeyControllerV2.generateRegistrationOptions
);

/**
 * @route   POST /api/v2/auth/passkey/register
 * @desc    Verify passkey registration and store credential
 * @access  Private
 */
router.post('/register',
  authenticateAccount,
  authRateLimit,
  [
    body('response').isObject().withMessage('Response object is required'),
    body('challenge').notEmpty().withMessage('Challenge is required'),
    body('username').notEmpty().withMessage('Username is required'),
    body('displayName').optional().isString(),
    body('deviceName').optional().isString()
  ],
  passkeyControllerV2.verifyRegistration
);

/**
 * @route   POST /api/v2/auth/passkey/authenticate-options
 * @desc    Generate passkey authentication options
 * @access  Public
 */
router.post('/authenticate-options',
  authRateLimit,
  [
    body('username').optional().isString()
  ],
  passkeyControllerV2.generateAuthenticationOptions
);

/**
 * @route   POST /api/v2/auth/passkey/authenticate
 * @desc    Verify passkey authentication
 * @access  Public
 */
router.post('/authenticate',
  authRateLimit,
  [
    body('response').isObject().withMessage('Response object is required'),
    body('challenge').notEmpty().withMessage('Challenge is required')
  ],
  passkeyControllerV2.verifyAuthentication
);

/**
 * @route   POST /api/v2/auth/passkey/register-new-options
 * @desc    Generate passkey registration options for new users (no auth required)
 * @access  Public
 */
router.post('/register-new-options',
  authRateLimit,
  [
    body('username').notEmpty().withMessage('Username is required'),
    body('displayName').optional().isString(),
    body('deviceName').optional().isString()
  ],
  passkeyControllerV2.generateNewUserRegistrationOptions
);

/**
 * @route   POST /api/v2/auth/passkey/register-new
 * @desc    Register a new passkey and create a new account
 * @access  Public
 */
router.post('/register-new',
  authRateLimit,
  [
    body('response').isObject().withMessage('Response object is required'),
    body('challenge').notEmpty().withMessage('Challenge is required'),
    body('username').notEmpty().withMessage('Username is required'),
    body('displayName').optional().isString(),
    body('deviceName').optional().isString()
  ],
  passkeyControllerV2.registerNewUserWithPasskey
);

export default router;