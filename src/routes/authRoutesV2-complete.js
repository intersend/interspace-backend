const express = require('express');
const { body } = require('express-validator');
const authControllerV2 = require('../controllers/authControllerV2');
const { authenticateAccount } = require('../middleware/authMiddlewareV2');
const { authRateLimit, userRateLimit } = require('../middleware/rateLimiter');

const router = express.Router();

// ===== PUBLIC ENDPOINTS (No Auth Required) =====

/**
 * @route   POST /api/v2/auth/authenticate
 * @desc    Unified authentication endpoint (flat identity model)
 * @access  Public
 */
router.post('/authenticate',
  authRateLimit,
  [
    body('strategy').isIn(['email', 'wallet', 'google', 'apple', 'passkey', 'guest']).withMessage('Invalid authentication strategy'),
    // Email strategy validation
    body('email').if(body('strategy').equals('email')).isEmail().normalizeEmail(),
    body('verificationCode').if(body('strategy').equals('email')).isLength({ min: 6, max: 6 }),
    // Wallet strategy validation
    body('walletAddress').if(body('strategy').equals('wallet')).isEthereumAddress(),
    body('signature').if(body('strategy').equals('wallet')).notEmpty(),
    body('message').if(body('strategy').equals('wallet')).notEmpty(),
    body('walletType').if(body('strategy').equals('wallet')).optional().isString(),
    // Social strategy validation
    body('idToken').if(body('strategy').isIn(['google', 'apple'])).notEmpty(),
    // Privacy mode
    body('privacyMode').optional().isIn(['linked', 'partial', 'isolated']),
    // Device info
    body('deviceId').optional().isString(),
    body('deviceName').optional().isString(),
    body('deviceType').optional().isIn(['ios', 'android', 'web'])
  ],
  authControllerV2.authenticateV2
);

/**
 * @route   POST /api/v2/auth/send-email-code
 * @desc    Send email verification code
 * @access  Public
 */
router.post('/send-email-code',
  authRateLimit,
  [
    body('email').isEmail().normalizeEmail()
  ],
  require('../controllers/emailAuthControllerV2').sendEmailCode
);

/**
 * @route   POST /api/v2/auth/resend-email-code
 * @desc    Resend email verification code
 * @access  Public
 */
router.post('/resend-email-code',
  authRateLimit,
  [
    body('email').isEmail().normalizeEmail()
  ],
  require('../controllers/emailAuthControllerV2').resendEmailCode
);

/**
 * @route   POST /api/v2/auth/verify-email-code
 * @desc    Verify email code (without authentication)
 * @access  Public
 */
router.post('/verify-email-code',
  authRateLimit,
  [
    body('email').isEmail().normalizeEmail(),
    body('code').isLength({ min: 6, max: 6 })
  ],
  require('../controllers/emailAuthControllerV2').verifyEmailCode
);

/**
 * @route   POST /api/v2/auth/refresh
 * @desc    Refresh access token
 * @access  Public
 */
router.post('/refresh',
  [
    body('refreshToken').notEmpty().withMessage('Refresh token is required')
  ],
  authControllerV2.refreshTokenV2
);

// Development only routes
if (process.env.NODE_ENV === 'development') {
  /**
   * @route   GET /api/v2/auth/dev/last-email-code
   * @desc    Get last email code for development
   * @access  Public (Dev only)
   */
  router.get('/dev/last-email-code',
    require('../controllers/emailAuthControllerV2').getLastCodeForDevelopment
  );
}

// ===== PROTECTED ENDPOINTS (Auth Required) =====

/**
 * @route   GET /api/v2/auth/me
 * @desc    Get current account and profile info
 * @access  Private
 */
router.get('/me',
  authenticateAccount,
  authControllerV2.getCurrentAccount
);

/**
 * @route   POST /api/v2/auth/logout
 * @desc    Logout and invalidate session
 * @access  Private
 */
router.post('/logout',
  authenticateAccount,
  authControllerV2.logout
);

/**
 * @route   POST /api/v2/auth/logout-all
 * @desc    Logout from all devices
 * @access  Private
 */
router.post('/logout-all',
  authenticateAccount,
  authControllerV2.logoutAllDevices
);

/**
 * @route   POST /api/v2/auth/link-accounts
 * @desc    Link two accounts together
 * @access  Private
 */
router.post('/link-accounts',
  authenticateAccount,
  [
    body('targetType').isIn(['email', 'wallet', 'social']).withMessage('Invalid account type'),
    body('targetIdentifier').notEmpty().withMessage('Target identifier is required'),
    body('targetProvider').optional().isString(),
    body('linkType').optional().isIn(['direct', 'inferred']).default('direct'),
    body('privacyMode').optional().isIn(['linked', 'partial', 'isolated']).default('linked')
  ],
  authControllerV2.linkAccounts
);

/**
 * @route   PUT /api/v2/auth/link-privacy
 * @desc    Update privacy mode for an account link
 * @access  Private
 */
router.put('/link-privacy',
  authenticateAccount,
  [
    body('targetAccountId').isString().notEmpty(),
    body('privacyMode').isIn(['linked', 'partial', 'isolated'])
  ],
  authControllerV2.updateLinkPrivacyMode
);

/**
 * @route   DELETE /api/v2/auth/unlink-account/:accountId
 * @desc    Unlink an account
 * @access  Private
 */
router.delete('/unlink-account/:accountId',
  authenticateAccount,
  authControllerV2.unlinkAccount
);

/**
 * @route   GET /api/v2/auth/identity-graph
 * @desc    Get identity graph for current account
 * @access  Private
 */
router.get('/identity-graph',
  authenticateAccount,
  authControllerV2.getIdentityGraph
);

/**
 * @route   POST /api/v2/auth/switch-profile/:profileId
 * @desc    Switch active profile
 * @access  Private
 */
router.post('/switch-profile/:profileId',
  authenticateAccount,
  authControllerV2.switchProfile
);

/**
 * @route   GET /api/v2/auth/devices
 * @desc    Get all devices for current account
 * @access  Private
 */
router.get('/devices',
  authenticateAccount,
  authControllerV2.getDevices
);

/**
 * @route   DELETE /api/v2/auth/devices/:deviceId
 * @desc    Deactivate a specific device
 * @access  Private
 */
router.delete('/devices/:deviceId',
  authenticateAccount,
  authControllerV2.deactivateDevice
);

/**
 * @route   POST /api/v2/auth/revoke-token
 * @desc    Revoke a specific token
 * @access  Private
 */
router.post('/revoke-token',
  authenticateAccount,
  [
    body('token').optional().isString(),
    body('tokenType').optional().isIn(['access', 'refresh'])
  ],
  authControllerV2.revokeToken
);

/**
 * @route   GET /api/v2/auth/sessions
 * @desc    Get all active sessions
 * @access  Private
 */
router.get('/sessions',
  authenticateAccount,
  authControllerV2.getActiveSessions
);

/**
 * @route   DELETE /api/v2/auth/sessions/:sessionId
 * @desc    Terminate a specific session
 * @access  Private
 */
router.delete('/sessions/:sessionId',
  authenticateAccount,
  authControllerV2.terminateSession
);

/**
 * @route   GET /api/v2/auth/security-log
 * @desc    Get security audit log for account
 * @access  Private
 */
router.get('/security-log',
  authenticateAccount,
  authControllerV2.getSecurityLog
);

module.exports = router;