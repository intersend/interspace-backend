const jwt = require('jsonwebtoken');
const { config } = require('./config');

/**
 * Generate tokens for V2 authentication supporting accountId
 * Backward compatible with userId for legacy support
 */
function generateTokens(payload) {
  const { 
    accountId, 
    userId, 
    sessionToken, 
    deviceId,
    activeProfileId 
  } = payload;

  // Create base payload
  const tokenPayload = {
    type: 'access',
    iat: Math.floor(Date.now() / 1000),
    version: 'v2'
  };

  // Add accountId for V2 or userId for legacy
  if (accountId) {
    tokenPayload.accountId = accountId;
    tokenPayload.sessionToken = sessionToken;
    if (activeProfileId) {
      tokenPayload.activeProfileId = activeProfileId;
    }
  } else if (userId) {
    // Legacy support
    tokenPayload.userId = userId;
    tokenPayload.version = 'v1';
  }

  // Add optional deviceId
  if (deviceId) {
    tokenPayload.deviceId = deviceId;
  }

  // Generate access token
  const accessToken = jwt.sign(tokenPayload, config.JWT_SECRET, {
    expiresIn: config.JWT_EXPIRES_IN || '15m',
    issuer: 'interspace-api',
    audience: 'interspace-app'
  });

  // Generate refresh token
  const refreshPayload = {
    ...tokenPayload,
    type: 'refresh',
    jti: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  };

  const refreshToken = jwt.sign(refreshPayload, config.JWT_REFRESH_SECRET, {
    expiresIn: config.JWT_REFRESH_EXPIRES_IN || '30d',
    issuer: 'interspace-api',
    audience: 'interspace-app'
  });

  // Convert expiresIn to seconds
  const expiresInSeconds = 15 * 60; // Default 15 minutes
  
  return {
    accessToken,
    refreshToken,
    expiresIn: expiresInSeconds
  };
}

/**
 * Verify refresh token for V2 authentication
 * Supports both accountId (V2) and userId (legacy)
 */
function verifyRefreshToken(token) {
  try {
    const decoded = jwt.verify(token, config.JWT_REFRESH_SECRET, {
      issuer: 'interspace-api',
      audience: 'interspace-app'
    });

    if (decoded.type !== 'refresh') {
      throw new Error('Invalid token type');
    }

    return decoded;
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      throw new Error('Invalid refresh token');
    }
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('Refresh token expired');
    }
    throw error;
  }
}

/**
 * Verify access token for V2 authentication
 * Supports both accountId (V2) and userId (legacy)
 */
function verifyAccessToken(token) {
  try {
    const decoded = jwt.verify(token, config.JWT_SECRET, {
      issuer: 'interspace-api',
      audience: 'interspace-app'
    });

    if (decoded.type !== 'access') {
      throw new Error('Invalid token type');
    }

    return decoded;
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      throw new Error('Invalid access token');
    }
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('Access token expired');
    }
    throw error;
  }
}

/**
 * Extract token from Authorization header
 */
function extractTokenFromHeader(authHeader) {
  if (!authHeader) return null;
  
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
  
  return parts[1];
}

/**
 * Check if token is expired
 */
function isTokenExpired(token) {
  try {
    const decoded = jwt.decode(token);
    if (!decoded || !decoded.exp) return true;
    
    return Date.now() >= decoded.exp * 1000;
  } catch {
    return true;
  }
}

module.exports = {
  generateTokens,
  verifyRefreshToken,
  verifyAccessToken,
  extractTokenFromHeader,
  isTokenExpired
};