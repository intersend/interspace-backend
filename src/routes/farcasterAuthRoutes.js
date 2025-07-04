const express = require('express');
const { body, validationResult } = require('express-validator');
const { farcasterAuthService } = require('../services/farcasterAuthService');
const { logger } = require('../utils/logger');
const { auditService } = require('../services/auditService');

const router = express.Router();

/**
 * Create a new Farcaster authentication channel
 * POST /api/v2/auth/farcaster/channel
 */
router.post('/channel', [
  body('domain').optional().isString().trim(),
  body('siweUri').optional().isURL()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const domain = req.body.domain || (process.env.FRONTEND_URL?.replace(/^https?:\/\//, '') || 'interspace.so');
    const siweUri = req.body.siweUri || process.env.FRONTEND_URL || 'https://interspace.so';

    // Create channel
    const channel = await farcasterAuthService.createChannel({
      domain,
      siweUri
    });

    // Log channel creation
    await auditService.log({
      action: 'farcaster_channel_created',
      resource: 'auth_channel',
      details: JSON.stringify({
        channelToken: channel.channelToken,
        domain
      }),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json({
      success: true,
      channel: {
        channelToken: channel.channelToken,
        url: channel.url,
        nonce: channel.nonce,
        domain,
        siweUri,
        expiresAt: channel.expiresAt
      }
    });
  } catch (error) {
    logger.error('Failed to create Farcaster channel', error);
    next(error);
  }
});

/**
 * Check Farcaster authentication channel status
 * GET /api/v2/auth/farcaster/channel/:channelToken
 */
router.get('/channel/:channelToken', async (req, res, next) => {
  try {
    const { channelToken } = req.params;

    const status = await farcasterAuthService.checkChannelStatus(channelToken);

    if (!status) {
      return res.json({
        success: true,
        status: 'pending'
      });
    }

    res.json({
      success: true,
      status: 'completed',
      authData: {
        signature: status.signature,
        message: status.message,
        fid: status.fid,
        username: status.username,
        displayName: status.displayName,
        bio: status.bio,
        pfpUrl: status.pfpUrl
      }
    });
  } catch (error) {
    logger.error('Failed to check Farcaster channel status', error);
    
    if (error.message === 'Channel not found') {
      return res.status(404).json({ 
        success: false, 
        error: 'Channel not found' 
      });
    }
    
    if (error.message === 'Channel expired') {
      return res.status(410).json({ 
        success: false, 
        error: 'Channel expired' 
      });
    }
    
    next(error);
  }
});

/**
 * Complete Farcaster authentication (webhook endpoint for relay callback)
 * POST /api/v2/auth/farcaster/callback
 * This would be called by the Farcaster relay service
 */
router.post('/callback', [
  body('channelToken').isString(),
  body('signature').isString(),
  body('message').isString(),
  body('fid').isString(),
  body('username').optional().isString(),
  body('displayName').optional().isString(),
  body('bio').optional().isString(),
  body('pfpUrl').optional().isURL(),
  body('custody').optional().isString()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      channelToken,
      signature,
      message,
      fid,
      username,
      displayName,
      bio,
      pfpUrl,
      custody
    } = req.body;

    // Update channel with auth data
    await farcasterAuthService.updateChannel(channelToken, {
      signature,
      message,
      fid,
      username,
      displayName,
      bio,
      pfpUrl,
      custody
    });

    // Log completion
    await auditService.log({
      action: 'farcaster_auth_completed',
      resource: 'auth_channel',
      details: JSON.stringify({
        channelToken,
        fid,
        username
      }),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to process Farcaster callback', error);
    next(error);
  }
});

module.exports = router;