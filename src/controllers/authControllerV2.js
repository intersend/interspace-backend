const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const { logger } = require('../utils/logger');
const { socialAuthService } = require('../services/socialAuthService');
const { auditService } = require('../services/auditService');
const sessionWalletService = require('../services/sessionWalletService');
const accountService = require('../services/accountService');
const { accountLinkingService } = require('../services/accountLinkingService');
const { smartProfileService } = require('../services/smartProfileService');
const { siweService } = require('../services/siweService');
const { passkeyService } = require('../services/passkeyService');
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
              error: 'Invalid or expired verification code. Please request a new code.',
              errorCode: 'INVALID_VERIFICATION_CODE'
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
            error: verifyResult.error || 'Invalid wallet signature. Please try signing the message again.',
            errorCode: 'INVALID_WALLET_SIGNATURE'
          });
        }

        // Create or find account
        account = await accountService.findOrCreateAccount({
          type: 'wallet',
          identifier: verifyResult.address.toLowerCase(),
          metadata: { 
            walletType: authData.walletType,
            chainId: authData.chainId || 1  // Store as integer for database
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
          
          // Decode and verify Google token
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
            identifier: payload?.sub, // Google user ID
            provider: 'google',
            metadata: { 
              email: payload?.email,
              emailVerified: payload?.email_verified,
              name: payload?.name,
              picture: payload?.picture
            }
          });
          
          // Google accounts are always verified
          await accountService.verifyAccount(account.id);
          
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

      case 'discord':
        // Discord authentication requires access token
        if (!authData.accessToken) {
          return res.status(400).json({ 
            success: false, 
            error: 'Discord access token required' 
          });
        }
        
        try {
          // Use socialAuthService to verify Discord token and get user info
          const authResult = await socialAuthService.authenticate({
            authToken: authData.accessToken,
            authStrategy: 'discord',
            deviceId: deviceInfo.deviceId,
            deviceName: authData.deviceName || 'Unknown Device',
            deviceType: authData.deviceType || 'web',
            ipAddress: deviceInfo.ipAddress,
            userAgent: deviceInfo.userAgent
          });
          
          // Use the standardized pattern
          const userData = authResult.userData;
          
          // Create or find account
          account = await accountService.findOrCreateAccount({
            type: 'social',
            identifier: userData?.providerId || authResult.userId, // Discord user ID from auth result
            provider: 'discord',
            metadata: { 
              email: userData?.email,
              emailVerified: userData?.emailVerified || false,
              name: userData?.displayName,
              username: userData?.username,
              avatar: userData?.avatarUrl,
              discriminator: userData?.discriminator
            }
          });
          
          // Mark account as verified if email is verified by Discord
          if (userData?.emailVerified) {
            await accountService.verifyAccount(account.id);
          }
          
        } catch (error) {
          logger.error('Discord auth error:', error);
          return res.status(401).json({ 
            success: false, 
            error: 'Discord authentication failed' 
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
          // First decode the Apple token to get user info
          const jwt = require('jsonwebtoken');
          const decodedToken = jwt.decode(appleIdToken);
          
          if (!decodedToken || !decodedToken.sub) {
            logger.error('Invalid Apple token - missing sub claim', { decodedToken });
            return res.status(401).json({ 
              success: false, 
              error: 'Invalid Apple token' 
            });
          }
          
          // Log the decoded token for debugging
          logger.info('Apple token decoded:', {
            sub: decodedToken.sub,
            email: decodedToken.email,
            email_verified: decodedToken.email_verified,
            is_private_email: decodedToken.is_private_email
          });
          
          // Verify the token with socialAuthService
          const authResult = await socialAuthService.authenticate({
            authToken: appleIdToken,
            authStrategy: 'apple',
            deviceId: deviceInfo.deviceId,
            deviceName: authData.deviceName || 'Unknown Device',
            deviceType: authData.deviceType || 'ios',
            ipAddress: deviceInfo.ipAddress,
            userAgent: deviceInfo.userAgent
          });
          
          // Extract email - Apple may provide it in the token or in the user object (first sign in)
          const email = decodedToken.email || authData.appleAuth?.user?.email;
          
          // Log first-time user info for debugging
          if (authData.appleAuth?.user) {
            logger.info('Apple Sign In - First time user info:', {
              firstName: authData.appleAuth.user.firstName,
              lastName: authData.appleAuth.user.lastName,
              email: authData.appleAuth.user.email
            });
          }
          
          account = await accountService.findOrCreateAccount({
            type: 'social',
            identifier: decodedToken.sub, // Apple user ID from decoded token
            provider: 'apple',
            metadata: { 
              email: email,
              emailVerified: true, // Apple verifies emails
              isPrivateEmail: decodedToken.is_private_email,
              firstName: authData.appleAuth?.user?.firstName,
              lastName: authData.appleAuth?.user?.lastName,
              name: authData.appleAuth?.user ? 
                `${authData.appleAuth.user.firstName || ''} ${authData.appleAuth.user.lastName || ''}`.trim() : 
                null
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

      case 'spotify':
        // Spotify OAuth authentication
        if (!authData.accessToken) {
          return res.status(400).json({ 
            success: false, 
            error: 'Spotify access token required' 
          });
        }
        
        try {
          // Verify token and get user info from Spotify
          const spotifyResponse = await fetch('https://api.spotify.com/v1/me', {
            headers: {
              'Authorization': `Bearer ${authData.accessToken}`
            }
          });
          
          if (!spotifyResponse.ok) {
            throw new Error('Invalid Spotify token');
          }
          
          const spotifyUser = await spotifyResponse.json();
          
          // Create or find account
          account = await accountService.findOrCreateAccount({
            type: 'social',
            identifier: spotifyUser.id,
            provider: 'spotify',
            metadata: { 
              email: spotifyUser.email,
              emailVerified: true,
              displayName: spotifyUser.display_name,
              country: spotifyUser.country,
              product: spotifyUser.product,
              images: spotifyUser.images
            }
          });
          
          // Mark account as verified
          await accountService.verifyAccount(account.id);
          
        } catch (error) {
          logger.error('Spotify auth error:', error);
          return res.status(401).json({ 
            success: false, 
            error: 'Spotify authentication failed' 
          });
        }
        break;

      case 'github':
        // GitHub OAuth authentication
        if (!authData.accessToken) {
          return res.status(400).json({ 
            success: false, 
            error: 'GitHub access token required' 
          });
        }
        
        try {
          // Use socialAuthService to verify GitHub token and authenticate
          authResult = await socialAuthService.authenticate({
            authToken: authData.accessToken,
            authStrategy: 'github',
            deviceId: deviceInfo.deviceId,
            deviceName: authData.deviceName || 'Unknown Device',
            deviceType: authData.deviceType || 'web',
            ipAddress: deviceInfo.ipAddress,
            userAgent: deviceInfo.userAgent
          });
          
          // Extract account from authResult
          account = authResult.account;
          
        } catch (error) {
          logger.error('GitHub auth error:', error);
          return res.status(401).json({ 
            success: false, 
            error: 'GitHub authentication failed' 
          });
        }
        break;

      case 'twitter':
        // Twitter/X OAuth authentication
        if (!authData.accessToken) {
          return res.status(400).json({ 
            success: false, 
            error: 'Twitter access token required' 
          });
        }
        
        try {
          // Use socialAuthService to verify Twitter token and authenticate
          authResult = await socialAuthService.authenticate({
            authToken: authData.accessToken,
            authStrategy: 'twitter',
            deviceId: deviceInfo.deviceId,
            deviceName: authData.deviceName || 'Unknown Device',
            deviceType: authData.deviceType || 'web',
            ipAddress: deviceInfo.ipAddress,
            userAgent: deviceInfo.userAgent
          });
          
          // Extract account from authResult
          account = authResult.account;
          
        } catch (error) {
          logger.error('Twitter auth error:', error);
          return res.status(401).json({ 
            success: false, 
            error: 'Twitter authentication failed' 
          });
        }
        break;

      case 'facebook':
        // Facebook OAuth authentication
        if (!authData.accessToken) {
          return res.status(400).json({ 
            success: false, 
            error: 'Facebook access token required' 
          });
        }
        
        try {
          // Use socialAuthService to verify Facebook token and authenticate
          authResult = await socialAuthService.authenticate({
            authToken: authData.accessToken,
            authStrategy: 'facebook',
            deviceId: deviceInfo.deviceId,
            deviceName: authData.deviceName || 'Unknown Device',
            deviceType: authData.deviceType || 'web',
            ipAddress: deviceInfo.ipAddress,
            userAgent: deviceInfo.userAgent
          });
          
          // Extract account from authResult
          account = authResult.account;
          
        } catch (error) {
          logger.error('Facebook auth error:', error);
          return res.status(401).json({ 
            success: false, 
            error: 'Facebook authentication failed' 
          });
        }
        break;

      case 'tiktok':
        // TikTok OAuth authentication
        if (!authData.accessToken) {
          return res.status(400).json({ 
            success: false, 
            error: 'TikTok access token required' 
          });
        }
        
        try {
          // Use socialAuthService to verify TikTok token and authenticate
          authResult = await socialAuthService.authenticate({
            authToken: authData.accessToken,
            authStrategy: 'tiktok',
            deviceId: deviceInfo.deviceId,
            deviceName: authData.deviceName || 'Unknown Device',
            deviceType: authData.deviceType || 'web',
            ipAddress: deviceInfo.ipAddress,
            userAgent: deviceInfo.userAgent
          });
          
          // Extract account from authResult
          account = authResult.account;
          
        } catch (error) {
          logger.error('TikTok auth error:', error);
          return res.status(401).json({ 
            success: false, 
            error: 'TikTok authentication failed' 
          });
        }
        break;

      case 'epicgames':
        // Epic Games OAuth authentication
        if (!authData.accessToken) {
          return res.status(400).json({ 
            success: false, 
            error: 'Epic Games access token required' 
          });
        }
        
        try {
          // Use socialAuthService to verify Epic Games token and authenticate
          authResult = await socialAuthService.authenticate({
            authToken: authData.accessToken,
            authStrategy: 'epicgames',
            deviceId: deviceInfo.deviceId,
            deviceName: authData.deviceName || 'Unknown Device',
            deviceType: authData.deviceType || 'web',
            ipAddress: deviceInfo.ipAddress,
            userAgent: deviceInfo.userAgent
          });
          
          // Extract account from authResult
          account = authResult.account;
          
        } catch (error) {
          logger.error('Epic Games auth error:', error);
          return res.status(401).json({ 
            success: false, 
            error: 'Epic Games authentication failed' 
          });
        }
        break;

      case 'shopify':
        // Shopify OAuth authentication
        if (!authData.accessToken || !authData.shopDomain) {
          return res.status(400).json({ 
            success: false, 
            error: 'Shopify access token and shop domain required' 
          });
        }
        
        try {
          // Use socialAuthService to verify Shopify token and authenticate
          authResult = await socialAuthService.authenticate({
            authToken: authData.accessToken,
            authStrategy: 'shopify',
            deviceId: deviceInfo.deviceId,
            deviceName: authData.deviceName || 'Unknown Device',
            deviceType: authData.deviceType || 'web',
            ipAddress: deviceInfo.ipAddress,
            userAgent: deviceInfo.userAgent,
            socialData: {
              provider: 'shopify',
              providerId: authData.shopDomain,
              metadata: { shopDomain: authData.shopDomain }
            }
          });
          
          // Extract account from authResult
          account = authResult.account;
          
        } catch (error) {
          logger.error('Shopify auth error:', error);
          return res.status(401).json({ 
            success: false, 
            error: 'Shopify authentication failed' 
          });
        }
        break;

      case 'passkey':
        // Passkey authentication only - registration is handled separately
        const { passkeyResponse, challenge } = authData;
        
        if (!passkeyResponse || !challenge) {
          return res.status(400).json({
            success: false,
            error: 'Passkey response and challenge required'
          });
        }
        
        try {
          // Verify the passkey authentication
          const verificationResult = await passkeyService.verifyAuthentication(
            passkeyResponse,
            challenge
          );
          
          if (!verificationResult.verified || !verificationResult.credentialId) {
            return res.status(401).json({
              success: false,
              error: 'Passkey verification failed'
            });
          }
          
          // Find the account by credential ID
          account = await accountService.findAccountByIdentifier({
            type: 'passkey',
            identifier: verificationResult.credentialId
          });
          
          if (!account) {
            logger.warn('Passkey authentication failed - account not found', {
              credentialId: verificationResult.credentialId,
              ipAddress: deviceInfo.ipAddress
            });
            
            return res.status(401).json({
              success: false,
              error: 'This passkey is not registered. Please sign in with your email or wallet first, then add this passkey in your account settings.',
              errorCode: 'PASSKEY_NOT_REGISTERED'
            });
          }
          
          // Mark account as verified (passkey proves ownership)
          await accountService.verifyAccount(account.id);
          
        } catch (error) {
          logger.error('Passkey auth error:', error);
          return res.status(401).json({
            success: false,
            error: 'Passkey authentication failed'
          });
        }
        break;

      case 'farcaster':
        // Farcaster authentication requires signature and message
        if (!authData.signature || !authData.message) {
          return res.status(400).json({ 
            success: false, 
            error: 'Farcaster signature and message required' 
          });
        }
        
        try {
          // Import farcasterAuthService
          const { farcasterAuthService } = require('../services/farcasterAuthService');
          
          // Verify Farcaster auth
          const farcasterResult = await farcasterAuthService.verifyFarcasterAuth({
            message: authData.message,
            signature: authData.signature,
            expectedFid: authData.fid,
            ipAddress: deviceInfo.ipAddress,
            userAgent: deviceInfo.userAgent
          });
          
          if (!farcasterResult.valid || !farcasterResult.userData) {
            logger.warn('Farcaster authentication failed', {
              error: farcasterResult.error,
              ipAddress: deviceInfo.ipAddress
            });
            
            await auditService.logSecurityEvent({
              type: 'AUTH_FAILED',
              details: {
                strategy: 'farcaster',
                reason: farcasterResult.error || 'invalid_signature',
                ipAddress: deviceInfo.ipAddress
              },
              ipAddress: deviceInfo.ipAddress,
              userAgent: deviceInfo.userAgent
            });
            
            return res.status(401).json({ 
              success: false, 
              error: farcasterResult.error || 'Farcaster authentication failed' 
            });
          }
          
          const userData = farcasterResult.userData;
          
          // Create or find account
          account = await accountService.findOrCreateAccount({
            type: 'social',
            identifier: userData.fid, // Use FID as identifier
            provider: 'farcaster',
            metadata: { 
              fid: userData.fid,
              username: userData.username,
              displayName: userData.displayName,
              bio: userData.bio,
              pfpUrl: userData.pfpUrl,
              custody: userData.custody,
              verifications: userData.verifications
            }
          });
          
          // Mark account as verified (Farcaster ownership is proven)
          await accountService.verifyAccount(account.id);
          
        } catch (error) {
          logger.error('Farcaster auth error:', error);
          return res.status(401).json({ 
            success: false, 
            error: 'Farcaster authentication failed' 
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
    // CRITICAL SECURITY: Only get profiles directly linked to the authenticating account
    // This ensures users only see profiles where their specific auth method (e.g., MetaMask wallet)
    // is actually linked to the profile, not all profiles accessible through the identity graph
    // DO NOT use getAccessibleProfiles() here as it traverses the identity graph!
    const linkedAccountIds = await accountService.getLinkedAccounts(account.id);
    logger.info(`Authentication - found linked accounts (for logging only)`, {
      accountId: account.id,
      accountType: account.type,
      identifier: account.identifier,
      linkedAccountCount: linkedAccountIds.length,
      linkedAccountIds
    });
    
    // SECURITY: Use getDirectlyLinkedProfiles, NOT getAccessibleProfiles
    const profiles = await accountService.getDirectlyLinkedProfiles(account.id);
    logger.info(`Authentication - found directly linked profiles`, {
      accountId: account.id,
      profileCount: profiles.length,
      profileIds: profiles.map(p => p.id),
      profileNames: profiles.map(p => p.name)
    });
    
    // Step 3: Check if new user (no profiles)
    let isNewAccount = false;
    let activeProfile = null;

    if (profiles.length === 0) {
      // Check if this is truly a new account
      const accountCreatedAt = new Date(account.createdAt);
      const accountAgeInMinutes = (Date.now() - accountCreatedAt.getTime()) / (1000 * 60);
      
      // Consider it a new account if created less than 5 minutes ago
      isNewAccount = accountAgeInMinutes < 5;
      
      logger.info(`Account ${account.id} has no profiles (account age: ${accountAgeInMinutes.toFixed(1)} minutes, isNewAccount: ${isNewAccount})`);
      
      // No automatic profile creation - user must manually create profile
      // Create a minimal session without a profile
      const session = await accountService.createSession(account.id, {
        ...deviceInfo,
        privacyMode: authData.privacyMode || 'linked'
      });
      
      // Generate JWT tokens without activeProfileId
      const { accessToken, refreshToken, expiresIn } = await generateTokens({
        userId: account.userId || undefined,
        accountId: account.id,
        sessionToken: session.sessionToken,
        activeProfileId: null, // No active profile
        deviceId: deviceInfo.deviceId
      });
      
      // Response that tells iOS to show profile creation
      return res.json({
        success: true,
        account: {
          id: account.id,
          strategy: account.type,
          identifier: account.identifier,
          metadata: account.metadata || {},
          createdAt: account.createdAt.toISOString(),
          updatedAt: account.updatedAt.toISOString()
        },
        user: {
          id: account.userId || account.id, // Use account ID if no user ID
          email: account.type === 'email' ? account.identifier : null,
          isGuest: account.type === 'guest'
        },
        profiles: [], // Empty profiles array
        activeProfile: null,
        tokens: {
          accessToken,
          refreshToken,
          expiresIn
        },
        requiresProfile: true,
        isNewAccount,
        sessionId: session.id,
        privacyMode: session.privacyMode,
        message: isNewAccount ? 'Welcome! Please create your first profile to continue' : 'Please create a new profile to continue'
      });
    } else {
      // Use the most recently active profile
      activeProfile = profiles.find(p => p.isActive) || profiles[0];
      
      // REMOVED: Auto-linking for existing users
      // Auto-linking should only happen for new users during their first profile creation
      // Existing users who create new profiles should have clean profiles with only MPC wallets
      logger.info(`Existing user detected with ${profiles.length} profiles. Using active profile: ${activeProfile?.id}`);
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
        isNewAccount,
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
      isNewAccount,
      activeProfileId: activeProfile.id,
      privacyMode: session.privacyMode,
      ipAddress: deviceInfo.ipAddress
    });

    // Ensure metadata values are properly handled for iOS compatibility
    const stringifiedMetadata = {};
    if (account.metadata && typeof account.metadata === 'object') {
      Object.keys(account.metadata).forEach(key => {
        const value = account.metadata[key];
        // Don't include null values in metadata - iOS expects non-null strings
        if (value != null) {
          stringifiedMetadata[key] = String(value);
        }
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
        isActive: p.id === activeProfile.id,
        linkedAccountsCount: p.linkedAccounts?.length || 0,
        appsCount: p.folders?.reduce((total, folder) => total + (folder.apps?.length || 0), 0) || 0,
        foldersCount: p.folders?.length || 0
      })),
      activeProfile: {
        id: activeProfile.id,
        displayName: activeProfile.name, // Frontend expects 'displayName'
        username: null,
        avatarUrl: null,
        privacyMode: session.privacyMode,
        isActive: true,
        linkedAccountsCount: activeProfile.linkedAccounts?.length || 0,
        appsCount: activeProfile.folders?.reduce((total, folder) => total + (folder.apps?.length || 0), 0) || 0,
        foldersCount: activeProfile.folders?.length || 0
      },
      tokens: {
        accessToken,
        refreshToken,
        expiresIn
      },
      isNewAccount,
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

    // Get directly linked profiles for the account
    // CRITICAL SECURITY: Only return profiles where the account is directly linked
    // DO NOT use getAccessibleProfiles() here as it would traverse the identity graph
    const profiles = await accountService.getDirectlyLinkedProfiles(account.id);
    
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

    // Ensure metadata values are properly handled for iOS compatibility
    const stringifiedMetadata = {};
    if (account.metadata && typeof account.metadata === 'object') {
      Object.keys(account.metadata).forEach(key => {
        const value = account.metadata[key];
        // Don't include null values in metadata - iOS expects non-null strings
        if (value != null) {
          stringifiedMetadata[key] = String(value);
        }
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
        isActive: activeProfile ? p.id === activeProfile.id : p.isActive,
        linkedAccountsCount: p.linkedAccounts?.length || 0,
        appsCount: p.folders?.reduce((total, folder) => total + (folder.apps?.length || 0), 0) || 0,
        foldersCount: p.folders?.length || 0
      })),
      activeProfile: activeProfile ? {
        id: activeProfile.id,
        displayName: activeProfile.name, // Frontend expects 'displayName'
        username: null,
        avatarUrl: null,
        privacyMode: session?.privacyMode || 'linked',
        isActive: true,
        linkedAccountsCount: activeProfile.linkedAccounts?.length || 0,
        appsCount: activeProfile.folders?.reduce((total, folder) => total + (folder.apps?.length || 0), 0) || 0,
        foldersCount: activeProfile.folders?.length || 0
      } : null,
      tokens: {
        accessToken,
        refreshToken: newRefreshToken,
        expiresIn
      },
      isNewAccount: false, // Token refresh means not a new account
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
    logger.info('linkAccounts - Controller called', {
      hasAccount: !!req.account,
      accountId: req.account?.id,
      body: req.body,
      headers: {
        authorization: req.headers.authorization ? 'Present' : 'Missing'
      }
    });
    
    const { targetType, targetIdentifier, targetProvider, linkType = 'direct', privacyMode = 'linked' } = req.body;
    const currentAccountId = req.account?.id;
    
    if (!currentAccountId) {
      logger.error('linkAccounts - No account ID found', {
        account: req.account,
        user: req.user,
        session: req.session
      });
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
      const bcrypt = require('bcryptjs');
      const verifications = await prisma.emailVerification.findMany({
        where: {
          email: targetIdentifier,
          expiresAt: { gte: new Date() },
          attempts: { lt: 5 }
        }
      });
      
      // Check each verification's hashed code
      let validVerification = null;
      for (const v of verifications) {
        const isValid = await bcrypt.compare(verificationCode, v.code);
        if (isValid) {
          validVerification = v;
          break;
        }
      }
      
      if (!validVerification) {
        // Increment attempts
        await prisma.emailVerification.updateMany({
          where: { 
            email: targetIdentifier,
            expiresAt: { gte: new Date() }
          },
          data: { 
            attempts: { increment: 1 },
            lastAttemptAt: new Date()
          }
        });
        
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
    
    // For Farcaster accounts, require SIWE verification
    if (targetType === 'social' && targetProvider === 'farcaster') {
      const { message, signature, fid } = req.body;
      
      if (!message || !signature) {
        return res.status(400).json({
          success: false,
          error: 'Farcaster authentication requires message and signature'
        });
      }
      
      // Verify Farcaster authentication
      const { farcasterAuthService } = require('../services/farcasterAuthService');
      const farcasterResult = await farcasterAuthService.verifyFarcasterAuth({
        message,
        signature,
        expectedFid: fid || targetIdentifier,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });
      
      if (!farcasterResult.valid || !farcasterResult.userData) {
        await auditService.logSecurityEvent({
          type: 'LINK_FAILED',
          details: {
            reason: 'invalid_farcaster_auth',
            error: farcasterResult.error,
            targetType: 'farcaster',
            ipAddress: req.ip
          },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        });
        
        return res.status(401).json({
          success: false,
          error: farcasterResult.error || 'Invalid Farcaster authentication'
        });
      }
      
      // Use the verified FID as the identifier
      targetIdentifier = farcasterResult.userData.fid;
    }
    
    // For wallet accounts, require SIWE verification
    if (targetType === 'wallet') {
      const { message, signature } = req.body;
      
      if (!message || !signature) {
        return res.status(400).json({
          success: false,
          error: 'Wallet linking requires message and signature'
        });
      }
      
      // Verify SIWE message and signature
      const verifyResult = await siweService.verifyMessage({
        message,
        signature,
        expectedAddress: targetIdentifier,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });
      
      if (!verifyResult.valid) {
        await auditService.logSecurityEvent({
          type: 'LINK_FAILED',
          details: {
            reason: 'invalid_wallet_signature',
            error: verifyResult.error,
            targetType: 'wallet',
            walletAddress: targetIdentifier,
            ipAddress: req.ip
          },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        });
        
        return res.status(401).json({
          success: false,
          error: verifyResult.error || 'Invalid wallet signature'
        });
      }
      
      // Use the verified address
      targetIdentifier = verifyResult.address.toLowerCase();
    }
    
    // Find or create target account
    const targetAccount = await accountService.findOrCreateAccount({
      type: targetType,
      identifier: targetIdentifier,
      provider: targetProvider,
      metadata: targetType === 'email' ? { 
        emailVerified: "true",
        verifiedAt: new Date().toISOString()
      } : targetType === 'wallet' ? {
        walletType: req.body.walletType || targetProvider || 'metamask',
        chainId: req.body.chainId || 1  // Default to Ethereum mainnet
      } : targetType === 'social' && targetProvider === 'farcaster' && req.body.farcasterData ? {
        fid: req.body.farcasterData.fid || targetIdentifier,
        username: req.body.farcasterData.username,
        displayName: req.body.farcasterData.displayName,
        bio: req.body.farcasterData.bio,
        pfpUrl: req.body.farcasterData.pfpUrl,
        custody: req.body.farcasterData.custody
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
      // These specific accounts are already linked in the identity graph
      // But we still need to check if the target account needs to be linked to more profiles
      logger.info('Accounts already linked in identity graph, checking profile links', {
        currentAccountId,
        targetAccountId: targetAccount.id,
        existingLinkId: existingLink.id
      });
    }

    // We allow the same email/wallet to be linked to multiple profiles
    // This is a key feature of the identity graph design
    // Only prevent circular links or linking the same accounts twice

    // Link the accounts if not already linked
    let link = existingLink;
    if (!existingLink) {
      link = await accountService.linkAccounts(
        currentAccountId,
        targetAccount.id,
        linkType,
        privacyMode
      );
    }

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

    // SECURITY FIX: Only link to profiles where the current account is directly linked
    // Do NOT traverse the identity graph to find all accessible profiles
    const profiles = await accountService.getDirectlyLinkedProfiles(currentAccountId);
    
    logger.info(`Linking ${targetType} account to directly linked profiles only`, {
      currentAccountId,
      targetAccountId: targetAccount.id,
      targetType,
      profileCount: profiles.length,
      profileIds: profiles.map(p => p.id)
    });
    
    // Link the new account ONLY to profiles where the current account is directly linked
    // This prevents the security issue where linking an email would give access to all
    // profiles accessible through the identity graph
    for (const profile of profiles) {
      try {
        await accountService.linkProfileToAccount(targetAccount.id, profile.id);
        logger.info(`Successfully linked ${targetType} account ${targetAccount.id} to profile ${profile.id}`);
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

    // Transform accounts to ensure chainId is a string in metadata
    const transformedAccounts = accounts.map(account => {
      if (account.metadata && typeof account.metadata === 'object') {
        // Create a copy to avoid mutating the original
        const transformedMetadata = { ...account.metadata };
        
        // Convert chainId to string if it exists and is a number
        if (typeof transformedMetadata.chainId === 'number') {
          transformedMetadata.chainId = transformedMetadata.chainId.toString();
        }
        
        return {
          ...account,
          metadata: transformedMetadata
        };
      }
      return account;
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
      accounts: transformedAccounts,
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
        linkedAccountsCount: targetProfile.linkedAccounts?.length || 0,
        appsCount: targetProfile.folders?.reduce((total, folder) => total + (folder.apps?.length || 0), 0) || 0,
        foldersCount: targetProfile.folders?.length || 0,
        developmentMode: targetProfile.developmentMode || false,
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

/**
 * Unlink accounts from identity graph
 */
const unlinkAccounts = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { targetAccountId } = req.body;
    const currentAccountId = req.account?.id;
    
    if (!currentAccountId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    // In flat identity model, get all accounts in the identity graph
    const allLinkedAccounts = await accountService.getLinkedAccounts(currentAccountId);
    
    logger.info(`Unlink request - Identity graph for account ${currentAccountId}:`, {
      currentAccountId,
      targetAccountId,
      linkedAccounts: allLinkedAccounts,
      linkedCount: allLinkedAccounts.length
    });

    // Check if target account is part of the identity graph
    if (!allLinkedAccounts.includes(targetAccountId)) {
      return res.status(404).json({
        success: false,
        error: 'Target account is not part of your identity graph'
      });
    }

    // In flat identity model, we allow unlinking any account
    // Even if it's the last one in the identity graph

    // Find all identity links involving the target account within this graph
    const linksToDelete = await prisma.identityLink.findMany({
      where: {
        AND: [
          {
            OR: [
              { accountAId: targetAccountId },
              { accountBId: targetAccountId }
            ]
          },
          {
            OR: [
              { accountAId: { in: allLinkedAccounts } },
              { accountBId: { in: allLinkedAccounts } }
            ]
          }
        ]
      }
    });

    logger.info(`Found ${linksToDelete.length} links to delete for account ${targetAccountId}`);

    // Delete all links for the target account within this identity graph
    for (const link of linksToDelete) {
      await prisma.identityLink.delete({
        where: { id: link.id }
      });
    }

    // Remove ProfileAccount links for the unlinked account
    // After unlinking, the target account should no longer have access to profiles
    // that were only accessible through this identity graph
    const profilesBeforeUnlink = await accountService.getAccessibleProfiles(targetAccountId);
    
    // Remove all ProfileAccount entries for the target account
    // The account will need to be re-linked to access these profiles again
    await prisma.profileAccount.deleteMany({
      where: {
        accountId: targetAccountId
      }
    });

    logger.info(`Unlinked account ${targetAccountId} from identity graph. Removed access to ${profilesBeforeUnlink.length} profiles.`);

    // Log the unlinking action
    await auditService.log({
      accountId: currentAccountId,
      action: 'unlink_account',
      resource: 'account',
      details: JSON.stringify({
        targetAccountId,
        unlinkedAt: new Date()
      }),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json({
      success: true,
      message: 'Accounts unlinked successfully'
    });

  } catch (error) {
    logger.error('Unlink accounts error:', error);
    next(error);
  }
};

module.exports = {
  authenticateV2,
  refreshTokenV2,
  linkAccounts,
  unlinkAccounts,
  updateLinkPrivacyMode,
  getIdentityGraph,
  switchProfile
};