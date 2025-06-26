const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const { logger } = require('../utils/logger');
const socialAuthService = require('../services/socialAuthService');
const { auditService } = require('../services/auditService');
const sessionWalletService = require('../services/sessionWalletService');
const accountService = require('../services/accountService');
const { smartProfileService } = require('../services/smartProfileService');
const { siweService } = require('../services/siweService');
const { generateTokens, verifyRefreshToken } = require('../utils/tokenUtils');
const { prisma } = require('../utils/database');

/**
 * Unified authentication endpoint for flat identity model
 */
const authenticateV2 = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { strategy, ...authData } = req.body;
    const deviceInfo = {
      deviceId: req.body.deviceId || req.headers['x-device-id'],
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip
    };

    logger.info(`Authentication attempt with strategy: ${strategy}`, {
      strategy,
      email: authData.email,
      walletAddress: authData.walletAddress,
      deviceId: deviceInfo.deviceId,
      ipAddress: deviceInfo.ipAddress,
      userAgent: deviceInfo.userAgent,
      privacyMode: authData.privacyMode || 'linked'
    });

    // Step 1: Authenticate and get/create account
    let account;
    let authResult;

    switch (strategy) {
      case 'email':
        // Email authentication requires verification code
        if (!authData.email || !authData.verificationCode) {
          return res.status(400).json({ 
            success: false, 
            error: 'Email and verification code required' 
          });
        }
        
        // Verify the email code directly
        const bcrypt = require('bcryptjs');
        const email = authData.email.toLowerCase().trim();
        
        try {
          // Find active verification for this email
          const verifications = await prisma.emailVerification.findMany({
            where: {
              email,
              expiresAt: { gt: new Date() },
              attempts: { lt: 5 }
            }
          });
          
          // Check each verification's hashed code
          let validVerification = null;
          for (const v of verifications) {
            const isValid = await bcrypt.compare(authData.verificationCode, v.code);
            if (isValid) {
              validVerification = v;
              break;
            }
          }
          
          if (!validVerification) {
            // Increment attempts
            await prisma.emailVerification.updateMany({
              where: { 
                email,
                expiresAt: { gt: new Date() }
              },
              data: { 
                attempts: { increment: 1 },
                lastAttemptAt: new Date()
              }
            });
            
            // Log failed attempt
            logger.warn('Email authentication failed - invalid code', {
              email,
              ipAddress: deviceInfo.ipAddress,
              userAgent: deviceInfo.userAgent
            });
            
            // Audit log for security monitoring
            await auditService.logSecurityEvent({
              type: 'AUTH_FAILED',
              details: {
                strategy: 'email',
                reason: 'invalid_code',
                email,
                ipAddress: deviceInfo.ipAddress
              },
              ipAddress: deviceInfo.ipAddress,
              userAgent: deviceInfo.userAgent
            });
            
            return res.status(401).json({ 
              success: false, 
              error: 'Invalid or expired verification code' 
            });
          }
          
          // Code is valid - delete all verifications for this email
          await prisma.emailVerification.deleteMany({
            where: { email }
          });
          
          // Create or find account
          account = await accountService.findOrCreateAccount({
            type: 'email',
            identifier: email,
            metadata: { 
              emailVerified: "true",  // String instead of boolean
              verifiedAt: new Date().toISOString()  // ISO string
            }
          });
          
          // Mark account as verified
          await accountService.verifyAccount(account.id);
          
        } catch (error) {
          logger.error('Email auth error:', error);
          return res.status(500).json({ 
            success: false, 
            error: 'Email authentication failed' 
          });
        }
        break;

      case 'wallet':
        // Verify SIWE message and signature
        const verifyResult = await siweService.verifyMessage({
          message: authData.message,
          signature: authData.signature,
          expectedAddress: authData.walletAddress,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        });

        if (!verifyResult.valid) {
          logger.warn('Wallet authentication failed - invalid signature', {
            walletAddress: authData.walletAddress,
            error: verifyResult.error,
            ipAddress: deviceInfo.ipAddress,
            userAgent: deviceInfo.userAgent
          });
          
          await auditService.logSecurityEvent({
            type: 'AUTH_FAILED',
            details: {
              strategy: 'wallet',
              reason: 'invalid_signature',
              walletAddress: authData.walletAddress,
              error: verifyResult.error,
              ipAddress: deviceInfo.ipAddress
            },
            ipAddress: deviceInfo.ipAddress,
            userAgent: deviceInfo.userAgent
          });
          
          return res.status(401).json({ 
            success: false, 
            error: verifyResult.error || 'Invalid signature' 
          });
        }

        // Create or find account
        account = await accountService.findOrCreateAccount({
          type: 'wallet',
          identifier: verifyResult.address.toLowerCase(),
          metadata: { 
            walletType: authData.walletType,
            chainId: authData.chainId || 1
          }
        });
        
        // Mark account as verified since wallet ownership is proven
        await accountService.verifyAccount(account.id);
        break;

      case 'google':
        // Google authentication requires ID token
        if (!authData.idToken) {
          return res.status(400).json({ 
            success: false, 
            error: 'Google ID token required' 
          });
        }
        
        try {
          // Use socialAuthService to verify Google token
          const authResult = await socialAuthService.authenticate({
            authToken: authData.idToken,
            authStrategy: 'google',
            deviceId: deviceInfo.deviceId,
            deviceName: authData.deviceName || 'Unknown Device',
            deviceType: authData.deviceType || 'web',
            ipAddress: deviceInfo.ipAddress,
            userAgent: deviceInfo.userAgent
          });
          
          // Extract user info from the Google token
          const { OAuth2Client } = require('google-auth-library');
          const client = new OAuth2Client();
          const ticket = await client.verifyIdToken({ 
            idToken: authData.idToken,
            audience: process.env.GOOGLE_CLIENT_ID
          });
          const payload = ticket.getPayload();
          
          // Create or find account
          account = await accountService.findOrCreateAccount({
            type: 'social',
            identifier: payload.sub, // Google user ID
            provider: 'google',
            metadata: { 
              email: payload.email,
              emailVerified: payload.email_verified,
              name: payload.name,
              picture: payload.picture
            }
          });
          
          // Mark account as verified if email is verified by Google
          if (payload.email_verified) {
            await accountService.verifyAccount(account.id);
          }
          
        } catch (error) {
          logger.error('Google auth error:', error);
          return res.status(401).json({ 
            success: false, 
            error: 'Google authentication failed' 
          });
        }
        break;

      case 'guest':
        // Guest authentication - no verification needed
        try {
          // Generate a unique guest identifier
          const guestId = `guest_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
          
          // Create guest account
          account = await accountService.findOrCreateAccount({
            type: 'guest',
            identifier: guestId,
            metadata: { 
              createdAt: new Date(),
              deviceInfo: {
                deviceId: deviceInfo.deviceId,
                userAgent: deviceInfo.userAgent,
                ipAddress: deviceInfo.ipAddress
              }
            }
          });
          
          // Guest accounts are not verified by default
          // They can be upgraded later by linking other auth methods
          
        } catch (error) {
          logger.error('Guest auth error:', error);
          return res.status(500).json({ 
            success: false, 
            error: 'Guest authentication failed' 
          });
        }
        break;

      case 'apple':
        // Apple authentication requires ID token
        // Handle both formats: idToken at root level or nested in appleAuth
        const appleIdToken = authData.idToken || authData.appleAuth?.identityToken;
        const appleAuthCode = authData.authorizationCode || authData.appleAuth?.authorizationCode;
        
        if (!appleIdToken) {
          return res.status(400).json({ 
            success: false, 
            error: 'Apple ID token required' 
          });
        }
        
        try {
          // Use socialAuthService to verify Apple token
          const authResult = await socialAuthService.authenticate({
            authToken: appleIdToken,
            authStrategy: 'apple',
            deviceId: deviceInfo.deviceId,
            deviceName: authData.deviceName || 'Unknown Device',
            deviceType: authData.deviceType || 'ios',
            ipAddress: deviceInfo.ipAddress,
            userAgent: deviceInfo.userAgent
          });
          
          // Extract user info from the Apple token
          const { verifyIdToken } = require('apple-signin-auth');
          const decodedToken = await verifyIdToken(appleIdToken, { 
            audience: process.env.APPLE_CLIENT_ID 
          });
          
          // Create or find account
          // Use email from appleAuth if decodedToken doesn't have it (first sign in)
          const email = decodedToken.email || authData.appleAuth?.user?.email;
          
          account = await accountService.findOrCreateAccount({
            type: 'social',
            identifier: decodedToken.sub, // Apple user ID
            provider: 'apple',
            metadata: { 
              email: email,
              emailVerified: true, // Apple verifies emails
              isPrivateEmail: decodedToken.is_private_email,
              firstName: authData.appleAuth?.user?.firstName,
              lastName: authData.appleAuth?.user?.lastName
            }
          });
          
          // Apple accounts are always verified
          await accountService.verifyAccount(account.id);
          
        } catch (error) {
          logger.error('Apple auth error:', error);
          return res.status(401).json({ 
            success: false, 
            error: 'Apple authentication failed' 
          });
        }
        break;

      // Add other strategies as needed

      default:
        return res.status(400).json({ 
          success: false, 
          error: `Unsupported authentication strategy: ${strategy}` 
        });
    }

    // Step 2: Get linked profiles
    const profiles = await accountService.getAccessibleProfiles(account.id);
    
    // Step 3: Check if new user (no profiles)
    let isNewUser = false;
    let activeProfile = null;

    if (profiles.length === 0) {
      isNewUser = true;
      
      // Generate a temporary profile ID first
      const { v4: uuidv4 } = require('uuid');
      const profileId = uuidv4();
      
      // Create session wallet with the profile ID
      const sessionWallet = await sessionWalletService.createSessionWallet(profileId);
      
      // Create automatic profile with session wallet
      activeProfile = await accountService.createAutomaticProfile(account, sessionWallet, profileId);
      
      // Add to profiles array
      profiles.push(activeProfile);
      
      logger.info(`New user detected. Created automatic profile: ${activeProfile.id}`);
    } else {
      // Use the most recently active profile
      activeProfile = profiles.find(p => p.isActive) || profiles[0];
    }

    // Step 4: Create session
    const session = await accountService.createSession(account.id, {
      ...deviceInfo,
      privacyMode: authData.privacyMode || 'linked'
    });

    // Step 5: Generate JWT tokens (for backward compatibility)
    const { accessToken, refreshToken, expiresIn } = await generateTokens({
      userId: account.userId || undefined, // Still use user ID for backward compatibility if available
      accountId: account.id,
      sessionToken: session.sessionToken,
      activeProfileId: activeProfile.id,
      deviceId: deviceInfo.deviceId
    });

    // Step 6: Audit log
    await auditService.log({
      userId: account.userId || undefined,
      profileId: activeProfile.id,
      action: 'authenticate',
      resource: 'account',
      details: JSON.stringify({
        accountId: account.id,
        strategy,
        isNewUser,
        privacyMode: session.privacyMode,
        deviceId: deviceInfo.deviceId
      }),
      ipAddress: deviceInfo.ipAddress,
      userAgent: deviceInfo.userAgent
    });
    
    // Log successful authentication
    logger.info('Authentication successful', {
      accountId: account.id,
      strategy,
      isNewUser,
      activeProfileId: activeProfile.id,
      privacyMode: session.privacyMode,
      ipAddress: deviceInfo.ipAddress
    });

    // Ensure metadata values are all strings for iOS compatibility
    const stringifiedMetadata = {};
    if (account.metadata && typeof account.metadata === 'object') {
      Object.keys(account.metadata).forEach(key => {
        const value = account.metadata[key];
        stringifiedMetadata[key] = value != null ? String(value) : null;
      });
    }
    
    // Response
    res.json({
      success: true,
      account: {
        id: account.id,
        strategy: account.type, // Frontend expects 'strategy' not 'type'
        identifier: account.identifier,
        metadata: stringifiedMetadata,
        createdAt: account.createdAt.toISOString(),
        updatedAt: account.updatedAt.toISOString()
      },
      user: {
        id: account.userId || account.id, // Use account ID if no user ID
        email: account.type === 'email' ? account.identifier : null,
        isGuest: account.type === 'guest'
      },
      profiles: profiles.map(p => ({
        id: p.id,
        displayName: p.name, // Frontend expects 'displayName' not 'name'
        username: null, // TODO: Add username support
        avatarUrl: null, // TODO: Add avatar support
        privacyMode: session.privacyMode,
        isActive: p.id === activeProfile.id
      })),
      activeProfile: {
        id: activeProfile.id,
        displayName: activeProfile.name, // Frontend expects 'displayName'
        username: null,
        avatarUrl: null,
        privacyMode: session.privacyMode,
        isActive: true
      },
      tokens: {
        accessToken,
        refreshToken,
        expiresIn
      },
      isNewUser,
      sessionId: session.id,
      privacyMode: session.privacyMode
    });

  } catch (error) {
    logger.error('Authentication error:', error);
    next(error);
  }
};

/**
 * Refresh access token using refresh token
 */
const refreshTokenV2 = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({ 
        success: false, 
        error: 'Refresh token required' 
      });
    }

    // Verify and decode refresh token
    const decoded = await verifyRefreshToken(refreshToken);
    
    if (!decoded || !decoded.accountId) {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid refresh token' 
      });
    }

    // Fetch account details
    const account = await prisma.account.findUnique({
      where: { id: decoded.accountId }
    });

    if (!account) {
      return res.status(401).json({ 
        success: false, 
        error: 'Account not found' 
      });
    }

    // Get session if sessionToken exists (sessionToken is the sessionId in the database)
    let session = null;
    if (decoded.sessionToken) {
      session = await prisma.accountSession.findUnique({
        where: { sessionId: decoded.sessionToken }
      });
    }

    // Get all accessible profiles
    const profiles = await accountService.getAccessibleProfiles(account.id);
    
    // Find active profile
    const activeProfile = decoded.activeProfileId 
      ? profiles.find(p => p.id === decoded.activeProfileId)
      : profiles.find(p => p.isActive);

    // Generate new tokens
    const { 
      accessToken, 
      refreshToken: newRefreshToken,
      expiresIn 
    } = await generateTokens({
      userId: decoded.userId || undefined,
      accountId: decoded.accountId,
      sessionToken: decoded.sessionToken,
      activeProfileId: activeProfile?.id || decoded.activeProfileId,
      deviceId: decoded.deviceId
    });

    // Ensure metadata values are all strings for iOS compatibility
    const stringifiedMetadata = {};
    if (account.metadata && typeof account.metadata === 'object') {
      Object.keys(account.metadata).forEach(key => {
        const value = account.metadata[key];
        stringifiedMetadata[key] = value != null ? String(value) : null;
      });
    }

    // Return full auth response matching AuthResponseV2 structure
    res.json({
      success: true,
      account: {
        id: account.id,
        strategy: account.type, // Frontend expects 'strategy' not 'type'
        identifier: account.identifier,
        metadata: stringifiedMetadata,
        createdAt: account.createdAt.toISOString(),
        updatedAt: account.updatedAt.toISOString()
      },
      user: {
        id: account.userId || account.id, // Use account ID if no user ID
        email: account.type === 'email' ? account.identifier : null,
        isGuest: account.type === 'guest'
      },
      profiles: profiles.map(p => ({
        id: p.id,
        displayName: p.name, // Frontend expects 'displayName' not 'name'
        username: null, // TODO: Add username support
        avatarUrl: null, // TODO: Add avatar support
        privacyMode: session?.privacyMode || 'linked',
        isActive: activeProfile ? p.id === activeProfile.id : p.isActive
      })),
      activeProfile: activeProfile ? {
        id: activeProfile.id,
        displayName: activeProfile.name, // Frontend expects 'displayName'
        username: null,
        avatarUrl: null,
        privacyMode: session?.privacyMode || 'linked',
        isActive: true
      } : null,
      tokens: {
        accessToken,
        refreshToken: newRefreshToken,
        expiresIn
      },
      isNewUser: false, // Token refresh means not a new user
      sessionId: session?.id || null,
      privacyMode: session?.privacyMode || 'linked'
    });
  } catch (error) {
    logger.error('Token refresh error:', error);
    next(error);
  }
};

/**
 * Link accounts together
 */
const linkAccounts = async (req, res, next) => {
  try {
    const { targetType, targetIdentifier, targetProvider, linkType = 'direct', privacyMode = 'linked' } = req.body;
    const currentAccountId = req.account?.id;
    
    if (!currentAccountId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    if (!targetType || !targetIdentifier) {
      return res.status(400).json({
        success: false,
        error: 'Target account type and identifier required'
      });
    }

    // Check if current account is verified (except for guest accounts)
    const currentAccount = await prisma.account.findUnique({
      where: { id: currentAccountId }
    });
    
    if (!currentAccount) {
      return res.status(404).json({
        success: false,
        error: 'Current account not found'
      });
    }
    
    if (currentAccount.type !== 'guest' && !currentAccount.verified) {
      return res.status(403).json({
        success: false,
        error: 'Please verify your account before linking other accounts'
      });
    }

    // For email accounts, require verification before linking
    if (targetType === 'email') {
      // Check if email is verified in the request (from prior verification)
      const { verificationCode } = req.body;
      if (!verificationCode) {
        return res.status(400).json({
          success: false,
          error: 'Email verification code required for linking email accounts'
        });
      }
      
      // Verify the email code
      const verification = await prisma.emailVerification.findFirst({
        where: {
          email: targetIdentifier,
          code: verificationCode,
          expiresAt: { gte: new Date() }
        }
      });
      
      if (!verification) {
        return res.status(401).json({
          success: false,
          error: 'Invalid or expired verification code'
        });
      }
      
      // Delete the verification record
      await prisma.emailVerification.deleteMany({
        where: { email: targetIdentifier }
      });
    }
    
    // Find or create target account
    const targetAccount = await accountService.findOrCreateAccount({
      type: targetType,
      identifier: targetIdentifier,
      provider: targetProvider,
      metadata: targetType === 'email' ? { 
        emailVerified: "true",
        verifiedAt: new Date().toISOString()
      } : {}
    });

    // Check if accounts are already linked
    const existingLink = await prisma.identityLink.findFirst({
      where: {
        OR: [
          { accountAId: currentAccountId, accountBId: targetAccount.id },
          { accountAId: targetAccount.id, accountBId: currentAccountId }
        ]
      }
    });

    if (existingLink) {
      return res.status(409).json({
        success: false,
        error: 'Accounts are already linked'
      });
    }

    // Check if target account is already linked to a different identity
    const targetLinks = await accountService.getLinkedAccounts(targetAccount.id);
    if (targetLinks.length > 1) { // More than just itself
      return res.status(409).json({
        success: false,
        error: 'Target account is already linked to another identity'
      });
    }

    // Link the accounts
    const link = await accountService.linkAccounts(
      currentAccountId,
      targetAccount.id,
      linkType,
      privacyMode
    );

    // Log the linking action
    await auditService.log({
      accountId: currentAccountId,
      action: 'link_account',
      resource: 'account',
      details: JSON.stringify({
        targetAccountId: targetAccount.id,
        targetType,
        linkType,
        privacyMode
      }),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    // Get updated accessible profiles
    const profiles = await accountService.getAccessibleProfiles(currentAccountId);
    
    // Link the new account to all accessible profiles
    // This ensures email accounts show up in profile accounts
    for (const profile of profiles) {
      try {
        await accountService.linkProfileToAccount(targetAccount.id, profile.id);
        logger.info(`Linked ${targetType} account ${targetAccount.id} to profile ${profile.id}`);
      } catch (linkError) {
        logger.warn(`Failed to link account to profile ${profile.id}:`, linkError);
      }
    }

    res.json({
      success: true,
      link,
      linkedAccount: {
        id: targetAccount.id,
        type: targetAccount.type,
        identifier: targetAccount.identifier,
        verified: targetAccount.verified
      },
      accessibleProfiles: profiles.map(p => ({
        id: p.id,
        name: p.name,
        linkedAccountsCount: p.linkedAccounts?.length || 0
      }))
    });

  } catch (error) {
    logger.error('Link accounts error:', error);
    next(error);
  }
};

/**
 * Update privacy mode for a link
 */
const updateLinkPrivacyMode = async (req, res, next) => {
  try {
    const { targetAccountId, privacyMode } = req.body;
    const currentAccountId = req.account.id;

    const link = await accountService.setLinkPrivacyMode(
      currentAccountId,
      targetAccountId,
      privacyMode
    );

    res.json({
      success: true,
      link
    });

  } catch (error) {
    logger.error('Update privacy mode error:', error);
    next(error);
  }
};

/**
 * Get identity graph for current account
 */
const getIdentityGraph = async (req, res, next) => {
  try {
    const accountId = req.account.id;
    
    // Get all linked accounts
    const linkedAccountIds = await accountService.getLinkedAccounts(accountId);
    
    // Get account details
    const accounts = await prisma.account.findMany({
      where: { id: { in: linkedAccountIds } }
    });

    // Get all links
    const links = await prisma.identityLink.findMany({
      where: {
        OR: [
          { accountAId: { in: linkedAccountIds } },
          { accountBId: { in: linkedAccountIds } }
        ]
      }
    });

    res.json({
      success: true,
      accounts,
      links,
      currentAccountId: accountId
    });

  } catch (error) {
    logger.error('Get identity graph error:', error);
    next(error);
  }
};

/**
 * Switch active profile
 */
const switchProfile = async (req, res, next) => {
  try {
    const { profileId } = req.params;
    const accountId = req.account.id;

    // Verify account has access to this profile
    const profiles = await accountService.getAccessibleProfiles(accountId);
    const targetProfile = profiles.find(p => p.id === profileId);

    if (!targetProfile) {
      return res.status(404).json({
        success: false,
        error: 'Profile not found or not accessible'
      });
    }

    // Note: AccountSession doesn't store activeProfileId, it's managed in the JWT token
    // We'll need to regenerate tokens with the new activeProfileId
    // For now, just log the switch
    logger.info(`Profile switch requested for session ${req.sessionToken} to profile ${profileId}`);

    // Update profile active status
    await smartProfileService.switchActiveProfile(profileId, targetProfile.userId);

    res.json({
      success: true,
      data: {
        id: targetProfile.id,
        name: targetProfile.name,
        sessionWalletAddress: targetProfile.sessionWalletAddress,
        isActive: true,
        linkedAccountsCount: 0,  // TODO: Add actual count
        appsCount: 0,  // TODO: Add actual count
        foldersCount: 0,  // TODO: Add actual count
        isDevelopmentWallet: targetProfile.isDevelopmentWallet || true,
        createdAt: targetProfile.createdAt,
        updatedAt: targetProfile.updatedAt
      },
      message: 'Profile switched successfully'
    });

  } catch (error) {
    logger.error('Switch profile error:', error);
    next(error);
  }
};

module.exports = {
  authenticateV2,
  refreshTokenV2,
  linkAccounts,
  updateLinkPrivacyMode,
  getIdentityGraph,
  switchProfile
};