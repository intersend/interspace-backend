import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, extractTokenFromHeader } from '@/utils/jwt';
import { prisma } from '@/utils/database';
import { AuthenticationError, AuthorizationError } from '@/types';

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    const token = extractTokenFromHeader(req.headers.authorization);
    if (!token) {
      throw new AuthenticationError('Access token required');
    }

    const payload = verifyAccessToken(token);
    
    // Verify user exists and device is active
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: {
        devices: {
          where: {
            deviceId: payload.deviceId,
            isActive: true
          }
        }
      }
    });

    if (!user) {
      throw new AuthenticationError('User not found');
    }

    if (user.devices.length === 0) {
      throw new AuthenticationError('Device not registered or inactive');
    }

    // Update device last active
    await prisma.deviceRegistration.update({
      where: { deviceId: payload.deviceId },
      data: { lastActiveAt: new Date() }
    });

    // Attach user context to request
    req.user = {
      userId: payload.userId,
      deviceId: payload.deviceId,
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
