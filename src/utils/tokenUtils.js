const jwt = require('jsonwebtoken');
const { config } = require('./config');

/**
 * Generate tokens for V2 authentication
 */
function generateTokens(payload) {
  const { 
    accountId, 
    sessionToken, 
    deviceId,
    activeProfileId 
  } = payload;

  if (!accountId || !sessionToken) {
    throw new Error('accountId and sessionToken are required for token generation');
  }

  // Create base payload
  const tokenPayload = {
    type: 'access',
    iat: Math.floor(Date.now() / 1000),
    version: 'v2',
    accountId,
    sessionToken
  };

  if (activeProfileId) {
    tokenPayload.activeProfileId = activeProfileId;
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
  // Parse the expiresIn string (e.g., '100y', '15m', '7d') to seconds
  function parseExpiresIn(expiresIn) {
    const match = expiresIn.match(/^(\d+)([ymwdhs])$/);
    if (!match) return 900; // Default 15 minutes if parsing fails
    
    const value = parseInt(match[1]);
    const unit = match[2];
    
    const multipliers = {
      y: 365 * 24 * 60 * 60, // years
      m: 30 * 24 * 60 * 60,  // months (approximate)
      w: 7 * 24 * 60 * 60,   // weeks
      d: 24 * 60 * 60,       // days
      h: 60 * 60,            // hours
      s: 1                   // seconds
    };
    
    return value * (multipliers[unit] || 900);
  }
  
  const expiresInSeconds = parseExpiresIn(config.JWT_EXPIRES_IN || '15m');
  
  return {
    accessToken,
    refreshToken,
    expiresIn: expiresInSeconds
  };
}

/**
 * Verify refresh token for V2 authentication
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