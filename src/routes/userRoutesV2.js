const express = require('express');
const router = express.Router();
const { authenticateAccount } = require('../middleware/authMiddlewareV2');
const { prisma } = require('../utils/database');
const { logger } = require('../utils/logger');

// All routes require authentication
router.use(authenticateAccount);

/**
 * Get current user/account information
 * GET /api/v2/users/me
 */
router.get('/me', async (req, res, next) => {
  try {
    const account = req.account;
    const session = req.session;
    
    if (!account) {
      return res.status(401).json({
        success: false,
        error: 'Not authenticated'
      });
    }

    // Get all accessible profiles for the account
    const accountService = require('../services/accountService');
    const profiles = await accountService.getAccessibleProfiles(account.id);
    
    // Find active profile
    const activeProfile = session?.activeProfileId 
      ? profiles.find(p => p.id === session.activeProfileId)
      : profiles.find(p => p.isActive);

    // Get additional counts for the user
    const linkedAccountIds = await accountService.getLinkedAccounts(account.id);
    const linkedAccountsCount = linkedAccountIds.length - 1; // Exclude self
    
    // Get social accounts
    const socialAccounts = await prisma.account.findMany({
      where: { 
        id: { in: linkedAccountIds },
        type: { in: ['google', 'apple', 'twitter', 'discord'] }
      }
    });
    
    // Count active devices (sessions)
    const activeDevicesCount = await prisma.accountSession.count({
      where: {
        accountId: account.id,
        expiresAt: { gt: new Date() }
      }
    });
    
    // Determine auth strategies
    const authStrategies = [];
    if (account.type === 'email') authStrategies.push('email');
    if (account.type === 'wallet') authStrategies.push('wallet');
    if (account.type === 'guest') authStrategies.push('guest');
    // Add social strategies from linked accounts
    for (const social of socialAccounts) {
      authStrategies.push(social.type);
    }
    
    // Build response data matching iOS User struct
    const userData = {
      id: account.id,
      email: account.type === 'email' ? account.identifier : null,
      walletAddress: account.type === 'wallet' ? account.identifier : null,
      isGuest: account.type === 'guest',
      authStrategies: authStrategies,
      profilesCount: profiles.length,
      linkedAccountsCount: linkedAccountsCount,
      activeDevicesCount: activeDevicesCount,
      socialAccounts: socialAccounts.map(acc => ({
        id: acc.id,
        provider: acc.type,
        email: acc.identifier,
        displayName: acc.metadata?.displayName || null,
        avatarUrl: acc.metadata?.avatarUrl || null
      })),
      createdAt: account.createdAt.toISOString(),
      updatedAt: account.updatedAt.toISOString()
    };

    // Wrap in data field as expected by iOS app
    const response = {
      success: true,
      data: userData
    };

    res.json(response);
  } catch (error) {
    logger.error('Get current user error:', error);
    next(error);
  }
});

/**
 * Get social accounts linked to current user
 * GET /api/v2/users/me/social-accounts
 */
router.get('/me/social-accounts', async (req, res, next) => {
  try {
    const accountId = req.account.id;
    
    // Get all linked accounts
    const accountService = require('../services/accountService');
    const linkedAccountIds = await accountService.getLinkedAccounts(accountId);
    
    // Get account details for social accounts only
    const socialAccounts = await prisma.account.findMany({
      where: { 
        id: { in: linkedAccountIds },
        type: { in: ['google', 'apple', 'twitter', 'discord'] }
      }
    });

    res.json({
      success: true,
      data: socialAccounts.map(acc => ({
        id: acc.id,
        type: acc.type,
        identifier: acc.identifier,
        verified: acc.verified,
        metadata: acc.metadata || {},
        createdAt: acc.createdAt.toISOString(),
        updatedAt: acc.updatedAt.toISOString()
      }))
    });
  } catch (error) {
    logger.error('Get social accounts error:', error);
    next(error);
  }
});

/**
 * Link a social account to current user
 * POST /api/v2/users/me/social-accounts
 */
router.post('/me/social-accounts', async (req, res, next) => {
  try {
    const { type, identifier, credential, metadata } = req.body;
    const currentAccountId = req.account.id;
    
    if (!type || !identifier) {
      return res.status(400).json({
        success: false,
        error: 'Account type and identifier required'
      });
    }

    // Verify it's a social account type
    const socialTypes = ['google', 'apple', 'twitter', 'discord'];
    if (!socialTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid social account type'
      });
    }

    // TODO: Verify the credential based on type
    // For now, we'll just create/link the account

    // Find or create the social account
    const accountService = require('../services/accountService');
    const socialAccount = await accountService.findOrCreateAccount({
      type,
      identifier,
      metadata
    });

    // Link the accounts
    const link = await accountService.linkAccounts(
      currentAccountId,
      socialAccount.id,
      'direct',
      'linked'
    );

    res.json({
      success: true,
      socialAccount: {
        id: socialAccount.id,
        type: socialAccount.type,
        identifier: socialAccount.identifier,
        verified: socialAccount.verified,
        metadata: socialAccount.metadata || {},
        createdAt: socialAccount.createdAt.toISOString(),
        updatedAt: socialAccount.updatedAt.toISOString()
      },
      link
    });
  } catch (error) {
    logger.error('Link social account error:', error);
    next(error);
  }
});

/**
 * Unlink a social account from current user
 * DELETE /api/v2/users/me/social-accounts/:id
 */
router.delete('/me/social-accounts/:id', async (req, res, next) => {
  try {
    const { id: targetAccountId } = req.params;
    const currentAccountId = req.account.id;
    
    // Find the link
    const link = await prisma.identityLink.findFirst({
      where: {
        OR: [
          { accountAId: currentAccountId, accountBId: targetAccountId },
          { accountAId: targetAccountId, accountBId: currentAccountId }
        ]
      }
    });

    if (!link) {
      return res.status(404).json({
        success: false,
        error: 'Social account not linked'
      });
    }

    // Delete the link
    await prisma.identityLink.delete({
      where: { id: link.id }
    });

    res.json({
      success: true,
      message: 'Social account unlinked successfully'
    });
  } catch (error) {
    logger.error('Unlink social account error:', error);
    next(error);
  }
});

module.exports = router;