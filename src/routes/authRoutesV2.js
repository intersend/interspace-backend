const express = require('express');
const { body } = require('express-validator');
const jwt = require('jsonwebtoken');
const authControllerV2 = require('../controllers/authControllerV2');
const { authenticateAccount } = require('../middleware/authMiddlewareV2');
const { authRateLimit, userRateLimit } = require('../middleware/rateLimiter');

const router = express.Router();

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
    body('idToken').if(body('strategy').equals('google')).notEmpty(),
    // Apple can have idToken at root or nested in appleAuth
    body().custom((value, { req }) => {
      if (req.body.strategy === 'apple') {
        // Accept either format: idToken at root or appleAuth.identityToken
        if (!req.body.idToken && !req.body.appleAuth?.identityToken) {
          throw new Error('Apple ID token required');
        }
      }
      return true;
    }),
    // Privacy mode
    body('privacyMode').optional().isIn(['linked', 'partial', 'isolated']),
    // Device info
    body('deviceId').optional().isString()
  ],
  authControllerV2.authenticateV2
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
 * @route   POST /api/v2/auth/unlink-accounts
 * @desc    Unlink an account from the identity graph
 * @access  Private
 */
router.post('/unlink-accounts',
  authenticateAccount,
  [
    body('targetAccountId').isString().notEmpty().withMessage('Target account ID is required')
  ],
  authControllerV2.unlinkAccounts
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

/**
 * @route   POST /api/v2/auth/logout
 * @desc    Logout and invalidate session
 * @access  Public (but processes auth token if present)
 */
router.post('/logout',
  async (req, res, next) => {
    try {
      const { prisma } = require('../utils/database');
      
      // Try to extract session info from token if present
      let sessionToken = null;
      let accountId = null;
      
      if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
        const token = req.headers.authorization.replace('Bearer ', '');
        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          sessionToken = decoded.sessionToken;
          accountId = decoded.accountId;
        } catch (error) {
          // Token might be expired or invalid, but we still want to allow logout
          console.log('Token verification failed during logout (ignored):', error.message);
          try {
            // Try to decode without verification to get session info
            const decoded = jwt.decode(token);
            if (decoded) {
              sessionToken = decoded.sessionToken;
              accountId = decoded.accountId;
            }
          } catch (decodeError) {
            console.log('Token decode failed during logout (ignored):', decodeError.message);
          }
        }
      }
      
      // Delete session if it exists
      if (sessionToken) {
        try {
          await prisma.accountSession.delete({
            where: { sessionId: sessionToken }
          });
        } catch (error) {
          // Session might already be deleted or not exist
          console.log('Session deletion error (ignored):', error.message);
        }
      }
      
      // Blacklist tokens if needed
      if (req.headers.authorization) {
        const token = req.headers.authorization.replace('Bearer ', '');
        const { tokenBlacklistService } = require('../services/tokenBlacklistService');
        
        // Use the accountId we extracted from the token
        const userId = accountId;
        
        if (userId) {
          // Extract expiration from JWT token
          let ttlSeconds = 86400; // Default 24 hours
          
          try {
            const decoded = jwt.decode(token);
            if (decoded && decoded.exp) {
              // Calculate remaining TTL in seconds
              const expirationTime = decoded.exp * 1000; // Convert to milliseconds
              const remainingTime = expirationTime - Date.now();
              if (remainingTime > 0) {
                ttlSeconds = Math.ceil(remainingTime / 1000);
              }
            }
          } catch (error) {
            console.log('Failed to decode token for TTL, using default:', error.message);
          }
          
          await tokenBlacklistService.blacklistToken(
            token,
            'logout',  // Use valid BlacklistReason
            userId,
            ttlSeconds,
            'access'  // Token type from Authorization header is always access token
          );
        }
      }
      
      res.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
      console.error('Logout error:', error);
      // Always return success for logout even if there are issues
      res.json({ success: true, message: 'Logged out' });
    }
  }
);

/**
 * @route   GET /api/v2/auth/oauth/callback/:provider
 * @desc    OAuth callback handler for providers that don't support custom URL schemes
 * @access  Public
 */
router.get('/oauth/callback/:provider',
  require('../controllers/oauthCallbackController').handleOAuthCallback
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

module.exports = router;