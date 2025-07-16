const express = require('express');
const { body, param } = require('express-validator');
const profileControllerV2 = require('../controllers/profileControllerV2');
const { authenticateAccount, authenticateUser, requireActiveProfile } = require('../middleware/authMiddlewareV2');
const { userRateLimit } = require('../middleware/rateLimiter');

const router = express.Router();

// All routes require authentication
router.use(authenticateAccount);
router.use(userRateLimit);

/**
 * @route   GET /api/v2/profiles
 * @desc    Get all accessible profiles
 * @access  Private
 */
router.get('/', profileControllerV2.getProfiles);

/**
 * @route   POST /api/v2/profiles
 * @desc    Create a new profile
 * @access  Private
 */
router.post('/',
  [
    body('name')
      .trim()
      .isLength({ min: 1, max: 50 })
      .withMessage('Profile name must be between 1 and 50 characters'),
    body('clientShare')
      .optional()
      .isString()
      .withMessage('clientShare must be a string when provided')
  ],
  profileControllerV2.createProfile
);

/**
 * @route   GET /api/v2/profiles/:profileId
 * @desc    Get a specific profile
 * @access  Private
 */
router.get('/:profileId',
  [
    param('profileId').isString().notEmpty()
  ],
  profileControllerV2.getProfile
);

/**
 * @route   PUT /api/v2/profiles/:profileId
 * @desc    Update profile metadata
 * @access  Private
 */
router.put('/:profileId',
  [
    param('profileId').isString().notEmpty(),
    body('name')
      .optional()
      .trim()
      .isLength({ min: 1, max: 50 })
      .withMessage('Profile name must be between 1 and 50 characters')
  ],
  profileControllerV2.updateProfile
);

/**
 * @route   DELETE /api/v2/profiles/:profileId
 * @desc    Delete a profile
 * @access  Private
 */
router.delete('/:profileId',
  [
    param('profileId').isString().notEmpty()
  ],
  profileControllerV2.deleteProfile
);

/**
 * @route   POST /api/v2/profiles/:profileId/rotate-wallet
 * @desc    Rotate session wallet
 * @access  Private
 */
router.post('/:profileId/rotate-wallet',
  [
    param('profileId').isString().notEmpty()
  ],
  profileControllerV2.rotateSessionWallet
);

/**
 * @route   POST /api/v2/profiles/:profileId/activate
 * @desc    Switch to this profile (same as /auth/switch-profile/:profileId)
 * @access  Private
 */
router.post('/:profileId/activate',
  [
    param('profileId').isString().notEmpty()
  ],
  async (req, res) => {
    // Redirect to auth controller's switch profile
    req.params.profileId = req.params.profileId;
    const authControllerV2 = require('../controllers/authControllerV2');
    return authControllerV2.switchProfile(req, res);
  }
);

/**
 * @route   GET /api/v2/profiles/:profileId/accounts
 * @desc    Get linked accounts for a profile
 * @access  Private
 */
router.get('/:profileId/accounts',
  [
    param('profileId').isString().notEmpty()
  ],
  profileControllerV2.getProfileAccounts
);

/**
 * @route   POST /api/v2/profiles/:profileId/accounts
 * @desc    Link a new account (wallet) to a profile
 * @access  Private
 */
router.post('/:profileId/accounts',
  [
    param('profileId').isString().notEmpty(),
    body('address').custom((value, { req }) => {
      // For email accounts, validate as email; otherwise validate as Ethereum address
      if (req.body.walletType === 'email') {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
      }
      return /^0x[a-fA-F0-9]{40}$/.test(value);
    }).withMessage('Invalid address format'),
    body('walletType').optional().isString(),
    body('signature').optional().isString(),
    body('message').optional().isString(),
    body('verificationCode').optional().isString()
  ],
  profileControllerV2.linkAccountToProfile
);

/**
 * @route   DELETE /api/v2/profiles/:profileId/accounts/:accountId
 * @desc    Unlink an account from a profile
 * @access  Private
 */
router.delete('/:profileId/accounts/:accountId',
  [
    param('profileId').isString().notEmpty(),
    param('accountId').isString().notEmpty()
  ],
  profileControllerV2.unlinkAccountFromProfile
);

/**
 * @route   PATCH /api/v2/profiles/:profileId/accounts/:accountId
 * @desc    Update account metadata (customName, isPrimary)
 * @access  Private
 */
router.patch('/:profileId/accounts/:accountId',
  [
    param('profileId').isString().notEmpty(),
    param('accountId').isString().notEmpty(),
    body('customName')
      .optional()
      .isString()
      .trim()
      .isLength({ max: 100 })
      .withMessage('Custom name must not exceed 100 characters'),
    body('isPrimary')
      .optional()
      .isBoolean()
      .withMessage('isPrimary must be a boolean value')
  ],
  profileControllerV2.updateLinkedAccount
);

/**
 * @route   GET /api/v2/profiles/:profileId/balance
 * @desc    Get unified balance for a profile
 * @access  Private
 */
router.get('/:profileId/balance',
  [
    param('profileId').isString().notEmpty()
  ],
  async (req, res, next) => {
    // Use the Orby controller but through the profile route
    const { orbyController } = require('../controllers/orbyController');
    // Map profileId to id for compatibility
    req.params.id = req.params.profileId;
    return orbyController.getUnifiedBalance(req, res, next);
  }
);


module.exports = router;