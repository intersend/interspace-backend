const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const { logger } = require('../utils/logger');
const { isPublicEndpoint } = require('./publicEndpoints');

const prisma = new PrismaClient();

// Simple error class for now
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
  }
}

/**
 * Authentication middleware for flat identity model
 */
const authenticateAccount = async (req, res, next) => {
  try {
    logger.info('AuthMiddlewareV2.authenticateAccount - Called for:', {
      path: req.path,
      originalUrl: req.originalUrl,
      baseUrl: req.baseUrl,
      method: req.method,
      hasAuthHeader: !!req.headers.authorization,
      fullPath: req.originalUrl || req.path,
      pathWithoutQuery: (req.originalUrl || req.path).split('?')[0]
    });
    
    // Skip authentication for public endpoints
    if (isPublicEndpoint(req)) {
      logger.info('AuthMiddlewareV2.authenticateAccount - Skipping auth for public endpoint');
      return next();
    }
    
    // Get token from header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logger.warn('AuthMiddlewareV2.authenticateAccount - No valid authorization header', {
        hasAuthHeader: !!authHeader,
        authHeaderValue: authHeader ? '[REDACTED]' : 'undefined',
        userAgent: req.headers['user-agent'],
        method: req.method,
        path: req.path,
        fullUrl: req.originalUrl,
        headers: Object.keys(req.headers)
      });
      throw new AppError('No token provided', 401);
    }

    const token = authHeader.replace('Bearer ', '');
    
    // Log token prefix for debugging
    logger.info('AuthMiddlewareV2.authenticateAccount - Token received', {
      tokenPrefix: token.substring(0, 20) + '...',
      path: req.path,
      method: req.method
    });

    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
      logger.info('AuthMiddlewareV2.authenticateAccount - Token verified', {
        accountId: decoded.accountId,
        sessionToken: decoded.sessionToken,
        tokenType: decoded.type,
        version: decoded.version
      });
    } catch (error) {
      logger.error('AuthMiddlewareV2.authenticateAccount - Token verification failed', {
        errorName: error.name,
        errorMessage: error.message,
        tokenPrefix: token.substring(0, 20) + '...'
      });
      if (error.name === 'TokenExpiredError') {
        throw new AppError('Token expired', 401);
      }
      throw new AppError('Invalid token', 401);
    }

    // Check if token is blacklisted
    const blacklisted = await prisma.blacklistedToken.findUnique({
      where: { token }
    });

    if (blacklisted) {
      logger.warn('AuthMiddlewareV2.authenticateAccount - Token is blacklisted', {
        tokenPrefix: token.substring(0, 20) + '...',
        blacklistedAt: blacklisted.createdAt,
        reason: blacklisted.reason
      });
      throw new AppError('Token has been revoked', 401);
    }

    // Get account and session
    let account, session;

    if (!decoded.accountId || !decoded.sessionToken) {
      throw new AppError('Invalid token format', 401);
    }

    // New token format with accountId
    account = await prisma.account.findUnique({
      where: { id: decoded.accountId }
    });

    session = await prisma.accountSession.findUnique({
      where: { sessionId: decoded.sessionToken }
    });

    if (!session || session.accountId !== decoded.accountId) {
      throw new AppError('Invalid session', 401);
    }

    if (new Date() > session.expiresAt) {
      throw new AppError('Session expired', 401);
    }

    // Update last active (updatedAt is automatically updated by Prisma)
    await prisma.accountSession.update({
      where: { id: session.id },
      data: { } // Just touching the record updates updatedAt
    });

    if (!account) {
      throw new AppError('Account not found', 401);
    }

    // Attach to request
    req.account = account;
    req.session = session;
    req.sessionToken = decoded.sessionToken;
    req.decoded = decoded; // Store decoded token for other middleware
    
    // Get activeProfileId from JWT token (not from session)
    if (decoded.activeProfileId) {
      req.activeProfileId = decoded.activeProfileId;
    }

    logger.info('AuthMiddlewareV2.authenticateAccount - Setting req.account:', {
      accountId: account.id,
      accountType: account.type,
      hasSession: !!session,
      activeProfileId: decoded.activeProfileId || null
    });

    next();
  } catch (error) {
    logger.error('Authentication error:', error);
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        error: error.message
      });
    }
    return res.status(401).json({
      error: 'Authentication failed'
    });
  }
};

/**
 * Optional authentication - doesn't fail if no token
 */
const optionalAuthenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  // If token is provided, validate it
  return authenticateAccount(req, res, (err) => {
    if (err) {
      // Log error but continue without authentication
      logger.warn('Optional authentication failed:', err.message);
      req.account = null;
      req.session = null;
    }
    next();
  });
};

/**
 * Require active profile
 */
const requireActiveProfile = async (req, res, next) => {
  try {
    // Check if we have activeProfileId from JWT token
    if (!req.activeProfileId) {
      logger.warn('RequireActiveProfile - No active profile ID in request', {
        accountId: req.account?.id,
        hasActiveProfile: !!req.activeProfile,
        hasDecoded: !!req.decoded
      });
      
      return res.status(403).json({
        error: 'Active profile required',
        code: 'NO_ACTIVE_PROFILE'
      });
    }

    // Load active profile if not already loaded
    if (!req.activeProfile) {
      req.activeProfile = await prisma.smartProfile.findUnique({
        where: { id: req.activeProfileId }
      });
      
      if (!req.activeProfile) {
        logger.error('RequireActiveProfile - Profile not found', {
          profileId: req.activeProfileId,
          accountId: req.account?.id
        });
        
        return res.status(403).json({
          error: 'Profile not found',
          code: 'PROFILE_NOT_FOUND'
        });
      }
      
      // Verify the account has access to this profile
      const profileAccessV2 = require('../utils/profileAccessV2');
      const { hasAccess } = await profileAccessV2.verifyProfileAccess(
        req.activeProfileId,
        req.account.id
      );
      
      if (!hasAccess) {
        logger.error('RequireActiveProfile - Access denied to profile', {
          profileId: req.activeProfileId,
          accountId: req.account?.id
        });
        
        return res.status(403).json({
          error: 'Access denied to this profile',
          code: 'PROFILE_ACCESS_DENIED'
        });
      }
    }

    next();
  } catch (error) {
    logger.error('RequireActiveProfile error:', error);
    return res.status(500).json({
      error: 'Failed to verify profile access',
      code: 'PROFILE_VERIFICATION_ERROR'
    });
  }
};

/**
 * Check privacy mode for operations
 */
const checkPrivacyMode = (allowedModes = ['linked']) => {
  return (req, res, next) => {
    if (!req.session || !allowedModes.includes(req.session.privacyMode)) {
      return res.status(403).json({
        error: 'Operation not allowed in current privacy mode',
        code: 'PRIVACY_MODE_RESTRICTION',
        currentMode: req.session?.privacyMode,
        allowedModes
      });
    }
    next();
  };
};

module.exports = {
  authenticateAccount,
  optionalAuthenticate,
  requireActiveProfile,
  checkPrivacyMode
};