const { validationResult } = require('express-validator');
const { logger } = require('../utils/logger');
const { smartProfileService } = require('../services/smartProfileService');
const accountService = require('../services/accountService');
const { prisma, withRetryableTransaction } = require('../utils/database');

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

      // Get profiles via LinkedAccount (single source of truth)
      const account = await prisma.account.findUnique({
        where: { id: accountId }
      });
      
      if (!account) {
        return res.status(404).json({
          success: false,
          error: 'Account not found'
        });
      }
      
      const authStrategy = account.type === 'social' ? account.provider : account.type;
      
      logger.info('Fetching profiles for account', {
        accountId: account.id,
        accountType: account.type,
        provider: account.provider,
        identifier: account.identifier,
        authStrategy: authStrategy
      });
      
      let profiles = await accountService.getProfilesForLinkedAccount(account.identifier, authStrategy);
      
      // Debug: Log all LinkedAccount entries for this address
      const allLinkedAccounts = await prisma.linkedAccount.findMany({
        where: {
          address: account.identifier.toLowerCase()
        },
        include: {
          profile: true
        }
      });
      
      
      logger.info('Debug: All LinkedAccount entries for this address', {
        address: account.identifier.toLowerCase(),
        count: allLinkedAccounts.length,
        entries: allLinkedAccounts.map(la => ({
          id: la.id,
          profileId: la.profileId,
          profileName: la.profile.name,
          authStrategy: la.authStrategy,
          isActive: la.isActive,
          isPrimary: la.isPrimary
        }))
      });
      
      // Fallback: If no profiles found via LinkedAccount, check ProfileAccount for backward compatibility
      if (profiles.length === 0) {
        logger.info('No profiles found via LinkedAccount, checking ProfileAccount for backward compatibility', {
          accountId,
          identifier: account.identifier,
          authStrategy
        });
        
        const profileAccounts = await prisma.profileAccount.findMany({
          where: { accountId },
          include: {
            profile: {
              include: {
                linkedAccounts: true,
                folders: {
                  include: {
                    apps: true
                  }
                },
                _count: {
                  select: {
                    linkedAccounts: true,
                    apps: true,
                    folders: true
                  }
                }
              }
            }
          }
        });
        
        // For each profile found, create a LinkedAccount entry
        for (const pa of profileAccounts) {
          try {
            await prisma.linkedAccount.create({
              data: {
                profileId: pa.profile.id,
                address: account.identifier.toLowerCase(),
                authStrategy: authStrategy,
                walletType: account.type === 'wallet' ? (account.metadata?.walletType || 'external') : null,
                isPrimary: pa.isPrimary,
                isActive: true,
                chainId: account.metadata?.chainId ? parseInt(account.metadata.chainId) : 1,
                metadata: JSON.stringify(account.metadata || {})
              }
            });
            logger.info(`Created LinkedAccount for backward compatibility: profile ${pa.profile.id}, account ${accountId}`);
          } catch (error) {
            // Might already exist, ignore
            logger.warn(`Could not create LinkedAccount (may already exist):`, error.message);
          }
        }
        
        profiles = profileAccounts.map(pa => pa.profile);
      }
      
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

      // Check if account has access to this profile via LinkedAccount
      const account = await prisma.account.findUnique({
        where: { id: accountId }
      });
      
      if (!account) {
        return res.status(404).json({
          success: false,
          error: 'Account not found'
        });
      }
      
      const hasAccess = await prisma.linkedAccount.findFirst({
        where: {
          profileId: profileId,
          address: account.identifier.toLowerCase(),
          isActive: true
        }
      });

      if (!hasAccess) {
        return res.status(404).json({
          success: false,
          error: 'Profile not found or not accessible'
        });
      }

      // Fetch the actual profile data
      const profile = await prisma.smartProfile.findUnique({
        where: { id: profileId },
        include: {
          linkedAccounts: true,
          folders: true,
          _count: {
            select: {
              apps: true,
              folders: true
            }
          }
        }
      });

      if (!profile || !profile.isActive) {
        return res.status(404).json({
          success: false,
          error: 'Profile not found or inactive'
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

      // Check if account has access to this profile via LinkedAccount
      const account = await prisma.account.findUnique({
        where: { id: accountId }
      });
      
      if (!account) {
        return res.status(404).json({
          success: false,
          error: 'Account not found'
        });
      }
      
      const hasAccess = await prisma.linkedAccount.findFirst({
        where: {
          profileId: profileId,
          address: account.identifier.toLowerCase(),
          isActive: true
        }
      });

      if (!hasAccess) {
        return res.status(404).json({
          success: false,
          error: 'Profile not found or not accessible'
        });
      }

      // Update profile
      const updatedProfile = await smartProfileService.updateProfile(profileId, accountId, { name });

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

      // Check if account has access to this profile via LinkedAccount
      const account = await prisma.account.findUnique({
        where: { id: accountId }
      });
      
      if (!account) {
        return res.status(404).json({
          success: false,
          error: 'Account not found'
        });
      }
      
      const hasAccess = await prisma.linkedAccount.findFirst({
        where: {
          profileId: profileId,
          address: account.identifier.toLowerCase(),
          isActive: true
        }
      });

      if (!hasAccess) {
        return res.status(404).json({
          success: false,
          error: 'Profile not found or not accessible'
        });
      }

      // In flat identity model, we allow deleting any profile
      // Even if it's the last one

      // Delete profile
      await smartProfileService.deleteProfile(profileId, accountId);

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

      // Check if account has access to this profile via LinkedAccount
      const account = await prisma.account.findUnique({
        where: { id: accountId }
      });
      
      if (!account) {
        return res.status(404).json({
          success: false,
          error: 'Account not found'
        });
      }
      
      const hasAccess = await prisma.linkedAccount.findFirst({
        where: {
          profileId: profileId,
          address: account.identifier.toLowerCase(),
          isActive: true
        }
      });

      if (!hasAccess) {
        return res.status(404).json({
          success: false,
          error: 'Profile not found or not accessible'
        });
      }

      // Rotate wallet
      const updatedProfile = await smartProfileService.rotateSessionWallet(profileId, accountId);

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

      // Check if account has access to this profile via LinkedAccount
      const account = await prisma.account.findUnique({
        where: { id: accountId }
      });
      
      if (!account) {
        return res.status(404).json({
          success: false,
          error: 'Account not found'
        });
      }
      
      const hasAccess = await prisma.linkedAccount.findFirst({
        where: {
          profileId: profileId,
          address: account.identifier.toLowerCase(),
          isActive: true
        }
      });

      if (!hasAccess) {
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
   * Link a new account (wallet or email) to a profile
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
      const { address, walletType, signature, message, verificationCode } = req.body;
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

      // Use linkedAccountService to handle all account types (wallet, email, etc.)
      const { linkedAccountService } = require('../services/linkedAccountService');
      
      try {
        const result = await linkedAccountService.linkAccount(
          profileId,
          accountId,
          {
            address,
            walletType: walletType || 'unknown',
            signature,
            message,
            verificationCode,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
          }
        );

        logger.info('ProfileControllerV2.linkAccountToProfile - Success:', {
          profileId,
          linkedAccountId: result.id,
          address: result.address,
          walletType: result.walletType
        });

        res.json({
          success: true,
          data: result
        });
      } catch (serviceError) {
        // Handle specific service errors
        if (serviceError.name === 'NotFoundError') {
          return res.status(404).json({
            success: false,
            error: serviceError.message
          });
        } else if (serviceError.name === 'ConflictError') {
          return res.status(409).json({
            success: false,
            error: serviceError.message
          });
        } else if (serviceError.name === 'AuthorizationError') {
          return res.status(403).json({
            success: false,
            error: serviceError.message
          });
        }
        
        // Re-throw other errors to be handled by the global error handler
        throw serviceError;
      }
    } catch (error) {
      logger.error('Link account to profile error:', error);
      next(error);
    }
  }

  /**
   * Unlink an account from a profile
   */
  async unlinkAccountFromProfile(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      const { profileId, accountId: linkedAccountId } = req.params;
      const accountId = req.account?.id;

      logger.info('ProfileControllerV2.unlinkAccountFromProfile - Request:', {
        profileId,
        linkedAccountId,
        accountId
      });

      if (!accountId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      // Use linkedAccountService to handle unlinking
      const { linkedAccountService } = require('../services/linkedAccountService');
      
      try {
        await linkedAccountService.unlinkAccount(linkedAccountId, accountId);

        logger.info('ProfileControllerV2.unlinkAccountFromProfile - Success:', {
          profileId,
          linkedAccountId
        });

        res.json({
          success: true,
          message: 'Account unlinked successfully'
        });
      } catch (serviceError) {
        // Handle specific service errors
        if (serviceError.name === 'NotFoundError') {
          return res.status(404).json({
            success: false,
            error: 'Account not found'
          });
        }
        
        if (serviceError.name === 'AuthorizationError') {
          return res.status(403).json({
            success: false,
            error: serviceError.message || 'You do not have permission to unlink this account'
          });
        }
        
        // Let other errors bubble up to error handler
        throw serviceError;
      }

    } catch (error) {
      logger.error('Unlink account from profile error:', error);
      next(error);
    }
  }

  /**
   * Update linked account metadata
   */
  async updateLinkedAccount(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      const { profileId, accountId: linkedAccountId } = req.params;
      const { customName, isPrimary } = req.body;
      const accountId = req.account?.id;

      logger.info('ProfileControllerV2.updateLinkedAccount - Request:', {
        profileId,
        linkedAccountId,
        accountId,
        customName,
        isPrimary
      });

      if (!accountId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      // Use linkedAccountService to handle the update
      const { linkedAccountService } = require('../services/linkedAccountService');
      
      try {
        const updatedAccount = await linkedAccountService.updateLinkedAccount(
          linkedAccountId,
          accountId,
          {
            customName,
            isPrimary
          }
        );

        logger.info('ProfileControllerV2.updateLinkedAccount - Success:', {
          profileId,
          linkedAccountId,
          updatedAccount
        });

        res.json({
          success: true,
          data: updatedAccount
        });
      } catch (serviceError) {
        // Handle specific service errors
        if (serviceError.name === 'NotFoundError') {
          return res.status(404).json({
            success: false,
            error: 'Account not found'
          });
        }
        
        if (serviceError.name === 'AuthorizationError') {
          return res.status(403).json({
            success: false,
            error: serviceError.message || 'You do not have permission to update this account'
          });
        }
        
        // Let other errors bubble up to error handler
        throw serviceError;
      }

    } catch (error) {
      logger.error('Update linked account error:', error);
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
      
      // Verify account has access via LinkedAccount
      const account = await prisma.account.findUnique({
        where: { id: accountId }
      });
      
      if (!account) {
        return res.status(404).json({
          success: false,
          error: 'Account not found'
        });
      }
      
      const hasAccess = await prisma.linkedAccount.findFirst({
        where: {
          profileId: profileId,
          address: account.identifier.toLowerCase(),
          isActive: true
        }
      });
      
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          error: 'Not authorized to delete this profile'
        });
      }
      
      // Check if this is the last profile for the user
      const profiles = await accountService.getProfilesForLinkedAccount(account);
      const isLastProfile = profiles.length <= 1;
      
      // Delete profile and all related data in transaction
      await withRetryableTransaction(async (tx) => {
        // Delete linked accounts
        await tx.linkedAccount.deleteMany({
          where: { profileId }
        });
        
        // Delete profile accounts
        await tx.profileAccount.deleteMany({
          where: { profileId }
        });
        
        // Delete folders
        await tx.folder.deleteMany({
          where: { profileId }
        });
        
        // Delete apps
        await tx.app.deleteMany({
          where: { profileId }
        });
        
        // Delete the profile
        await tx.smartProfile.delete({
          where: { id: profileId }
        });
      });
      
      // If not the last profile, activate another profile
      let newActiveProfile = null;
      if (!isLastProfile) {
        const remainingProfiles = await accountService.getProfilesForLinkedAccount(account);
        if (remainingProfiles.length > 0) {
          newActiveProfile = remainingProfiles[0];
          await smartProfileService.activateProfile(newActiveProfile.id, accountId);
        }
      }
      
      res.json({
        success: true,
        isLastProfile,
        activeProfile: newActiveProfile,
        remainingProfiles: isLastProfile ? [] : await accountService.getProfilesForLinkedAccount(account)
      });
      
    } catch (error) {
      logger.error('Delete profile error:', error);
      next(error);
    }
  }
}

module.exports = new ProfileControllerV2();