import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, extractTokenFromHeader } from '@/utils/jwt';
import { prisma } from '@/utils/database';
import { config } from '@/utils/config';
import { getDevUser } from '@/utils/devUser';
import { auditService } from '@/services/auditService';
import { tokenBlacklistService } from '@/services/tokenBlacklistService';
import { AuthenticationError, AuthorizationError } from '@/types';
const { isPublicEndpoint } = require('./publicEndpoints');

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    // Skip authentication for public endpoints
    if (isPublicEndpoint(req)) {
      return next();
    }
    
    // BYPASS_LOGIN is only allowed in development environment
    if (config.BYPASS_LOGIN && config.NODE_ENV === 'development') {
      // Log security warning
      console.warn('⚠️  BYPASS_LOGIN is active - authentication bypassed for development');
      
      const user = await getDevUser();
      req.user = {
        userId: user.id,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      };
      
      // Audit log the bypass
      await auditService.logSecurityEvent({
        type: 'PERMISSION_DENIED',
        userId: user.id,
        details: { reason: 'BYPASS_LOGIN_USED' },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });
      
      return next();
    } else if (config.BYPASS_LOGIN && config.NODE_ENV !== 'development') {
      // This should never happen due to config validation, but extra safety
      throw new Error('BYPASS_LOGIN cannot be used outside development environment');
    }

    const token = extractTokenFromHeader(req.headers.authorization);
    if (!token) {
      throw new AuthenticationError('Access token required');
    }

    // Check if token is blacklisted
    const isBlacklisted = await tokenBlacklistService.isTokenBlacklisted(token);
    if (isBlacklisted) {
      throw new AuthenticationError('Token has been revoked');
    }

    const payload = verifyAccessToken(token);
    
    // Verify user exists (remove device requirement)
    const user = await prisma.user.findUnique({
      where: { id: payload.userId }
    });

    if (!user) {
      throw new AuthenticationError('User not found');
    }

    // Optional: Update device last active if deviceId exists
    if (payload.deviceId) {
      try {
        await prisma.deviceRegistration.updateMany({
          where: { 
            deviceId: payload.deviceId,
            userId: payload.userId 
          },
          data: { lastActiveAt: new Date() }
        });
      } catch (error) {
        // Don't fail auth if device update fails
        console.log('Device update failed (non-blocking):', error);
      }
    }

    // Attach user context to request
    req.user = {
      userId: payload.userId,
      deviceId: payload.deviceId, // Optional
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    };

    next();
  } catch (error) {
    next(error);
  }
}

export async function requireProfile(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user?.userId) {
      throw new AuthenticationError('Authentication required');
    }

    const profileId = req.params.profileId || req.body.profileId;
    if (!profileId) {
      throw new AuthorizationError('Profile ID required');
    }

    // Verify user owns the profile
    const profile = await prisma.smartProfile.findFirst({
      where: {
        id: profileId,
        userId: req.user.userId
      }
    });

    if (!profile) {
      throw new AuthorizationError('Profile not found or access denied');
    }

    req.user.profileId = profileId;
    next();
  } catch (error) {
    next(error);
  }
}

export function optionalAuth(req: Request, res: Response, next: NextFunction) {
  const token = extractTokenFromHeader(req.headers.authorization);
  if (!token) {
    return next();
  }

  authenticate(req, res, next);
}
