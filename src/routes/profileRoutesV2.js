const express = require('express');
const { body, param } = require('express-validator');
const profileControllerV2 = require('../controllers/profileControllerV2');
const { authenticateAccount, requireActiveProfile } = require('../middleware/authMiddlewareV2');
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
    body('isDevelopmentWallet')
      .optional()
      .isBoolean()
      .withMessage('isDevelopmentWallet must be a boolean'),
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

module.exports = router;