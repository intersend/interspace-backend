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
      const accountId = req.account?.id || req.user?.accountId;  // Support both account and legacy user objects
      
      // Debug logging
      logger.info('ProfileControllerV2.getProfiles - Request details:', {
        accountId,
        hasAccount: !!req.account,
        accountObj: req.account,
        hasUser: !!req.user,  // Legacy user object support
        userObj: req.user  // Legacy user object
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

      const { name, clientShare } = req.body;
      const accountId = req.account?.id;
      
      if (!accountId) {
        return res.status(401).json({
          success: false,
          error: 'Account ID required'
        });
      }

      // Create profile using accountId (flat identity model)
      const profile = await smartProfileService.createProfile(accountId, {
        name,
        clientShare
      });

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

      // In flat identity model, we allow deleting any profile
      // Even if it's the last one

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

  /**
   * Link a new account (wallet) to a profile
   */
  async linkAccountToProfile(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      const { profileId } = req.params;
      const { address, walletType, signature, message } = req.body;
      const accountId = req.account?.id;

      logger.info('ProfileControllerV2.linkAccountToProfile - Request:', {
        profileId,
        accountId,
        address,
        walletType,
        hasSignature: !!signature,
        hasMessage: !!message
      });

      if (!accountId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      // Check if the account has access to this profile
      const hasAccess = await accountService.hasAccessToProfile(accountId, profileId);
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          error: 'Access denied to this profile'
        });
      }

      // Verify the wallet signature
      const { siweService } = require('../services/siweService');
      const verificationResult = await siweService.verifyMessage({
        message,
        signature
      });

      if (!verificationResult.valid || verificationResult.address.toLowerCase() !== address.toLowerCase()) {
        return res.status(401).json({
          success: false,
          error: 'Invalid wallet signature'
        });
      }

      // Check if this wallet is already linked to this specific profile
      const { prisma } = require('../utils/database');
      const existingLinkedAccount = await prisma.linkedAccount.findFirst({
        where: {
          address: address.toLowerCase(),
          profileId: profileId,
          isActive: true
        }
      });

      if (existingLinkedAccount) {
        return res.status(409).json({
          success: false,
          error: 'This wallet is already linked to this profile'
        });
      }

      // Get the profile to find the userId
      const profile = await prisma.smartProfile.findUnique({
        where: { id: profileId }
      });

      if (!profile) {
        return res.status(404).json({
          success: false,
          error: 'Profile not found'
        });
      }

      // Create the linked account
      const linkedAccount = await prisma.linkedAccount.create({
        data: {
          userId: profile.userId,
          profileId: profileId,
          address: address.toLowerCase(),
          authStrategy: 'wallet',
          walletType: walletType || 'unknown',
          isPrimary: false, // New linked accounts are not primary by default
          isActive: true,
          metadata: JSON.stringify({
            linkedAt: new Date().toISOString(),
            linkedBy: accountId
          })
        }
      });

      // Also create/link the wallet account in the identity graph
      const walletAccount = await accountService.findOrCreateAccount({
        type: 'wallet',
        identifier: address.toLowerCase(),
        verified: true,
        metadata: {
          walletType: walletType || 'unknown'
        }
      });

      // Link to the current account in the identity graph
      await accountService.linkAccounts(
        accountId,
        walletAccount.id,
        'direct',
        'linked'
      );

      logger.info('ProfileControllerV2.linkAccountToProfile - Success:', {
        profileId,
        linkedAccountId: linkedAccount.id,
        walletAccountId: walletAccount.id,
        address: linkedAccount.address
      });

      res.json({
        success: true,
        data: {
          id: linkedAccount.id,
          userId: linkedAccount.userId,
          profileId: linkedAccount.profileId,
          address: linkedAccount.address,
          authStrategy: linkedAccount.authStrategy,
          walletType: linkedAccount.walletType,
          customName: linkedAccount.customName,
          isPrimary: linkedAccount.isPrimary,
          isActive: linkedAccount.isActive,
          chainId: linkedAccount.chainId,
          metadata: linkedAccount.metadata,
          createdAt: linkedAccount.createdAt,
          updatedAt: linkedAccount.updatedAt
        }
      });
    } catch (error) {
      logger.error('Link account to profile error:', error);
      next(error);
    }
  }
}

module.exports = new ProfileControllerV2();