const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const { logger } = require('../utils/logger');

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
    // Get token from header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('No token provided', 401);
    }

    const token = authHeader.replace('Bearer ', '');

    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
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
      throw new AppError('Token has been revoked', 401);
    }

    // Get account and session
    let account, session;

    if (decoded.accountId && decoded.sessionToken) {
      // New token format with accountId
      account = await prisma.account.findUnique({
        where: { id: decoded.accountId }
      });

      session = await prisma.accountSession.findUnique({
        where: { sessionToken: decoded.sessionToken },
        include: {
          activeProfile: true
        }
      });

      if (!session || session.accountId !== decoded.accountId) {
        throw new AppError('Invalid session', 401);
      }

      if (new Date() > session.expiresAt) {
        throw new AppError('Session expired', 401);
      }

      // Update last active
      await prisma.accountSession.update({
        where: { id: session.id },
        data: { lastActiveAt: new Date() }
      });

    } else if (decoded.userId) {
      // Legacy token format - handle backward compatibility
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId }
      });

      if (!user) {
        throw new AppError('User not found', 401);
      }

      // Find or create account for legacy user
      if (user.email) {
        account = await prisma.account.findUnique({
          where: {
            type_identifier: {
              type: 'email',
              identifier: user.email.toLowerCase()
            }
          }
        });
      } else if (user.walletAddress) {
        account = await prisma.account.findUnique({
          where: {
            type_identifier: {
              type: 'wallet',
              identifier: user.walletAddress.toLowerCase()
            }
          }
        });
      }

      if (!account) {
        // Create account for legacy user
        const accountService = require('../services/accountService');
        account = await accountService.findOrCreateAccount({
          type: user.email ? 'email' : 'wallet',
          identifier: (user.email || user.walletAddress).toLowerCase(),
          metadata: { migratedFromLegacy: true, userId: user.id }
        });
      }

      // Create a temporary session for legacy token
      session = {
        privacyMode: 'linked',
        activeProfile: null
      };
    } else {
      throw new AppError('Invalid token format', 401);
    }

    if (!account) {
      throw new AppError('Account not found', 401);
    }

    // Attach to request
    req.account = account;
    req.session = session;
    req.sessionToken = decoded.sessionToken;
    req.user = { id: decoded.userId }; // For backward compatibility

    // Get active profile if available
    if (session.activeProfile) {
      req.activeProfile = session.activeProfile;
    }

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
  if (!req.activeProfile && !req.session?.activeProfileId) {
    return res.status(403).json({
      error: 'Active profile required',
      code: 'NO_ACTIVE_PROFILE'
    });
  }

  // Load active profile if not already loaded
  if (!req.activeProfile && req.session?.activeProfileId) {
    req.activeProfile = await prisma.smartProfile.findUnique({
      where: { id: req.session.activeProfileId }
    });
  }

  if (!req.activeProfile) {
    return res.status(403).json({
      error: 'Profile not found',
      code: 'PROFILE_NOT_FOUND'
    });
  }

  next();
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