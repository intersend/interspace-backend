import { Request, Response, NextFunction } from 'express';
import { authenticate as authenticateV1 } from './auth';
import { logger } from '@/utils/logger';

/**
 * Authentication compatibility middleware
 * Allows v1 routes to work with both v1 and v2 authentication
 */
export const authenticateCompatible = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Check if this is a v2 request (has account info from v2 auth)
    if ((req as any).account && (req as any).session) {
      logger.info('Using V2 authentication context for V1 route');
      
      // Map v2 auth to v1 format
      const account = (req as any).account;
      const session = (req as any).session;
      
      // For v2, we need to find the user associated with the account
      // This depends on the account type
      let userId: string | undefined;
      
      if (account.type === 'email' || account.type === 'google' || account.type === 'apple') {
        // For email/social accounts, the identifier often maps to a user
        const { prisma } = await import('@/utils/database');
        const user = await prisma.user.findFirst({
          where: {
            OR: [
              { email: account.identifier }
            ]
          }
        });
        userId = user?.id;
      } else if (account.type === 'wallet') {
        // For wallet accounts, we might need to look up via linked profiles
        const { prisma } = await import('@/utils/database');
        const profileAccount = await prisma.profileAccount.findFirst({
          where: { accountId: account.id },
          include: { profile: true }
        });
        
        if (profileAccount?.profile) {
          // Get the user who owns this profile
          userId = profileAccount.profile.userId;
        }
      }
      
      // Set v1 compatible user object
      req.user = {
        userId: userId || account.id, // Fallback to account ID if no user found
        // accountId: account.id, // Not part of v1 RequestContext
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      };
      
      // Store additional v2 context
      (req as any).isV2Auth = true;
      (req as any).privacyMode = session.privacyMode;
      (req as any).activeProfileId = session.activeProfileId;
      
      return next();
    }
    
    // Fall back to v1 authentication
    logger.info('Using V1 authentication for request');
    return authenticateV1(req, res, next);
  } catch (error) {
    logger.error('Authentication compatibility error:', error);
    return authenticateV1(req, res, next);
  }
};

/**
 * Middleware to ensure profile access based on authentication version
 */
export const ensureProfileAccess = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const profileId = req.params.profileId || req.params.id;
    
    if (!profileId) {
      return next();
    }
    
    // For v2 auth, check profile access via ProfileAccount
    if ((req as any).isV2Auth && (req as any).account) {
      const { prisma } = await import('@/utils/database');
      
      const hasAccess = await prisma.profileAccount.findFirst({
        where: {
          profileId,
          accountId: (req as any).account.id
        }
      });
      
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          error: 'You do not have access to this profile'
        });
      }
    }
    // For v1 auth, the existing profile ownership checks in controllers will handle it
    
    return next();
  } catch (error) {
    logger.error('Profile access check error:', error);
    return next();
  }
};