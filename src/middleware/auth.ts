import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, extractTokenFromHeader } from '@/utils/jwt';
import { prisma } from '@/utils/database';
import { config } from '@/utils/config';
import { getDevUser } from '@/utils/devUser';
import { AuthenticationError, AuthorizationError } from '@/types';

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    if (config.BYPASS_LOGIN) {
      const user = await getDevUser();
      req.user = {
        userId: user.id,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      };
      return next();
    }

    const token = extractTokenFromHeader(req.headers.authorization);
    if (!token) {
      throw new AuthenticationError('Access token required');
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
