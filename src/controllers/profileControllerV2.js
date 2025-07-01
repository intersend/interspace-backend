const { validationResult } = require('express-validator');
const { logger } = require('../utils/logger');
const { smartProfileService } = require('../services/smartProfileService');
const accountService = require('../services/accountService');

/**
 * V2 Profile Controller - Works with flat identity model
 */
class ProfileControllerV2 {
  /**
   * Get all profiles accessible to the current account
   */
  async getProfiles(req, res, next) {
    try {
      const accountId = req.account?.id || req.user?.accountId;
      
      // Debug logging
      logger.info('ProfileControllerV2.getProfiles - Request details:', {
        accountId,
        hasAccount: !!req.account,
        accountObj: req.account,
        hasUser: !!req.user,
        userObj: req.user
      });
      
      if (!accountId) {
        return res.status(401).json({
          success: false,
          error: 'Account ID required'
        });
      }

      // Get all accessible profiles based on identity graph
      const profiles = await accountService.getAccessibleProfiles(accountId);
      
      res.json({
        success: true,
        data: profiles.map(p => ({
          id: p.id,
          name: p.name,
          sessionWalletAddress: p.sessionWalletAddress,
          isActive: p.isActive,
          linkedAccountsCount: p.linkedAccounts?.length || 0,
          appsCount: p._count?.apps || 0,
          foldersCount: p._count?.folders || 0,
          developmentMode: p.developmentMode,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt
        }))
      });
    } catch (error) {
      logger.error('Get profiles error:', error);
      next(error);
    }
  }

  /**
   * Create a new profile - V2 version with development mode
   */
  async createProfile(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ 
          success: false,
          errors: errors.array() 
        });
      }

      const { name, developmentMode = false } = req.body;
      const accountId = req.account?.id || req.user?.accountId;
      
      if (!accountId) {
        return res.status(401).json({
          success: false,
          error: 'Account ID required'
        });
      }

      // Get account details (for backward compatibility)
      const { prisma } = require('../utils/database');
      const account = await prisma.account.findUnique({
        where: { id: accountId }
      });
      let userId = req.user?.userId;
      
      if (!userId) {
        // Find or create user based on account
        const { prisma } = require('../utils/database');
        let user = await prisma.user.findFirst({
          where: {
            OR: [
              account.type === 'email' ? { email: account.identifier } : {},
              account.type === 'wallet' ? { walletAddress: account.identifier } : {}
            ].filter(condition => Object.keys(condition).length > 0)
          }
        });
        
        if (!user) {
          user = await prisma.user.create({
            data: {
              email: account.type === 'email' ? account.identifier : undefined,
              walletAddress: account.type === 'wallet' ? account.identifier : undefined,
              authStrategies: JSON.stringify([account.type]),
              emailVerified: account.verified
            }
          });
        }
        
        userId = user.id;
      }

      // Create profile with development mode
      const profile = await smartProfileService.createProfile(userId, {
        name,
        developmentMode,
        clientShare: developmentMode ? undefined : req.body.clientShare
      });

      // Link profile to account
      await accountService.linkProfileToAccount(accountId, profile.id);

      res.status(201).json({
        success: true,
        data: profile
      });
    } catch (error) {
      logger.error('Create profile error:', error);
      next(error);
    }
  }

  /**
   * Get a specific profile by ID
   */
  async getProfile(req, res, next) {
    try {
      const { profileId } = req.params;
      const accountId = req.account?.id || req.user?.accountId;
      
      if (!accountId) {
        return res.status(401).json({
          success: false,
          error: 'Account ID required'
        });
      }

      // Check if account has access to this profile
      const profiles = await accountService.getAccessibleProfiles(accountId);
      const profile = profiles.find(p => p.id === profileId);

      if (!profile) {
        return res.status(404).json({
          success: false,
          error: 'Profile not found or not accessible'
        });
      }

      res.json({
        success: true,
        data: {
          id: profile.id,
          name: profile.name,
          sessionWalletAddress: profile.sessionWalletAddress,
          isActive: profile.isActive,
          linkedAccountsCount: profile.linkedAccounts?.length || 0,
          appsCount: profile._count?.apps || 0,
          foldersCount: profile._count?.folders || 0,
          developmentMode: profile.developmentMode,
          createdAt: profile.createdAt,
          updatedAt: profile.updatedAt
        }
      });
    } catch (error) {
      logger.error('Get profile error:', error);
      next(error);
    }
  }

  /**
   * Update profile metadata
   */
  async updateProfile(req, res, next) {
    try {
      const { profileId } = req.params;
      const { name } = req.body;
      const accountId = req.account?.id || req.user?.accountId;
      
      if (!accountId) {
        return res.status(401).json({
          success: false,
          error: 'Account ID required'
        });
      }

      // Check if account has access to this profile
      const profiles = await accountService.getAccessibleProfiles(accountId);
      const profile = profiles.find(p => p.id === profileId);

      if (!profile) {
        return res.status(404).json({
          success: false,
          error: 'Profile not found or not accessible'
        });
      }

      // Update profile
      const userId = profile.userId || req.user?.userId;
      const updatedProfile = await smartProfileService.updateProfile(profileId, userId, { name });

      res.json({
        success: true,
        data: {
          id: updatedProfile.id,
          name: updatedProfile.name,
          sessionWalletAddress: updatedProfile.sessionWalletAddress,
          isActive: updatedProfile.isActive,
          developmentMode: updatedProfile.developmentMode,
          updatedAt: updatedProfile.updatedAt
        }
      });
    } catch (error) {
      logger.error('Update profile error:', error);
      next(error);
    }
  }

  /**
   * Delete a profile
   */
  async deleteProfile(req, res, next) {
    try {
      const { profileId } = req.params;
      const accountId = req.account?.id || req.user?.accountId;
      
      if (!accountId) {
        return res.status(401).json({
          success: false,
          error: 'Account ID required'
        });
      }

      // Check if account has access to this profile
      const profiles = await accountService.getAccessibleProfiles(accountId);
      const profile = profiles.find(p => p.id === profileId);

      if (!profile) {
        return res.status(404).json({
          success: false,
          error: 'Profile not found or not accessible'
        });
      }

      // Check if it's the last profile
      if (profiles.length === 1) {
        return res.status(400).json({
          success: false,
          error: 'Cannot delete the last profile'
        });
      }

      // Delete profile
      const userId = profile.userId || req.user?.userId;
      await smartProfileService.deleteProfile(profileId, userId);

      res.json({
        success: true,
        message: 'Profile deleted successfully'
      });
    } catch (error) {
      logger.error('Delete profile error:', error);
      next(error);
    }
  }

  /**
   * Rotate session wallet for a profile
   */
  async rotateSessionWallet(req, res, next) {
    try {
      const { profileId } = req.params;
      const accountId = req.account?.id || req.user?.accountId;
      
      if (!accountId) {
        return res.status(401).json({
          success: false,
          error: 'Account ID required'
        });
      }

      // Check if account has access to this profile
      const profiles = await accountService.getAccessibleProfiles(accountId);
      const profile = profiles.find(p => p.id === profileId);

      if (!profile) {
        return res.status(404).json({
          success: false,
          error: 'Profile not found or not accessible'
        });
      }

      // Rotate wallet
      const userId = profile.userId || req.user?.userId;
      const updatedProfile = await smartProfileService.rotateSessionWallet(profileId, userId);

      res.json({
        success: true,
        data: {
          id: updatedProfile.id,
          name: updatedProfile.name,
          sessionWalletAddress: updatedProfile.sessionWalletAddress,
          message: 'Session wallet rotated successfully'
        }
      });
    } catch (error) {
      logger.error('Rotate session wallet error:', error);
      next(error);
    }
  }

  /**
   * Get linked accounts for a profile
   */
  async getProfileAccounts(req, res, next) {
    try {
      const { profileId } = req.params;
      const accountId = req.account?.id || req.user?.accountId;
      
      if (!accountId) {
        return res.status(401).json({
          success: false,
          error: 'Account ID required'
        });
      }

      // Check if account has access to this profile
      const profiles = await accountService.getAccessibleProfiles(accountId);
      const profile = profiles.find(p => p.id === profileId);

      if (!profile) {
        return res.status(404).json({
          success: false,
          error: 'Profile not found or not accessible'
        });
      }

      // Get linked accounts from the linked_accounts table for this profile
      const linkedAccounts = await prisma.linkedAccount.findMany({
        where: {
          profileId: profileId,
          isActive: true
        },
        orderBy: [
          { isPrimary: 'desc' },
          { createdAt: 'asc' }
        ]
      });

      // Return the actual LinkedAccount records with their correct IDs
      const formattedAccounts = linkedAccounts.map(account => ({
        id: account.id, // This is the LinkedAccount ID
        userId: account.userId,
        profileId: account.profileId,
        address: account.address,
        authStrategy: account.authStrategy,
        walletType: account.walletType,
        customName: account.customName,
        isPrimary: account.isPrimary,
        isActive: account.isActive,
        chainId: account.chainId,
        metadata: account.metadata,
        createdAt: account.createdAt,
        updatedAt: account.updatedAt
      }));

      res.json({
        success: true,
        data: formattedAccounts
      });
    } catch (error) {
      logger.error('Get profile accounts error:', error);
      next(error);
    }
  }
}

module.exports = new ProfileControllerV2();