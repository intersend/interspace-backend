const express = require('express');
const { siweService } = require('../services/siweService');
const { apiRateLimit } = require('../middleware/rateLimiter');

const router = express.Router();

/**
 * @route   GET /api/v2/siwe/nonce
 * @desc    Generate a nonce for SIWE authentication
 * @access  Public
 */
router.get('/nonce', 
  apiRateLimit,
  async (req, res, next) => {
    try {
      const nonce = await siweService.generateNonce();
      
      res.json({
        success: true,
        data: {
          nonce
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   POST /api/v2/siwe/verify
 * @desc    Verify SIWE message signature
 * @access  Public
 */
router.post('/verify',
  apiRateLimit,
  async (req, res, next) => {
    try {
      const { message, signature } = req.body;
      
      if (!message || !signature) {
        return res.status(400).json({
          success: false,
          error: 'Message and signature are required'
        });
      }

      // This endpoint is handled by authRoutesV2 authenticate endpoint with strategy='wallet'
      // Redirecting to maintain compatibility
      res.json({
        success: false,
        error: 'Please use /api/v2/auth/authenticate with strategy="wallet"'
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;