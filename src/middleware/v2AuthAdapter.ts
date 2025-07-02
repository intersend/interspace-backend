import { Request, Response, NextFunction } from 'express';
import { logger } from '@/utils/logger';

/**
 * Middleware to adapt v2 authentication context for v1-style controllers
 * This allows v1 controllers to work with v2 authentication without modification
 */
export const v2AuthAdapter = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    // If this is a v2 authenticated request
    if ((req as any).account && (req as any).session) {
      const account = (req as any).account;
      const session = (req as any).session;
      
      // For profile-based routes, verify profile access
      const profileId = req.params.profileId || req.params.id;
      
      logger.info('Adapting V2 auth for V1 controller', {
        accountId: account.id,
        accountType: account.type,
        accountIdentifier: account.identifier,
        sessionId: session.sessionId,
        profileId: profileId || 'none'
      });
      
      console.log('\n========== V2 AUTH ADAPTER DEBUG ==========');
      console.log('Account:', account);
      console.log('Profile ID from params:', profileId);
      if (profileId) {
        const { prisma } = await import('@/utils/database');
        
        // Check if account has access to this profile
        const profileAccess = await prisma.profileAccount.findFirst({
          where: {
            profileId,
            accountId: account.id
          },
          include: {
            profile: true
          }
        });
        
        if (!profileAccess) {
          return res.status(403).json({
            success: false,
            error: 'You do not have access to this profile'
          });
        }
        
        // Find the user associated with this profile for v1 compatibility
        let userId: string | undefined;
        
        console.log('Looking for userId...');
        console.log('Profile userId:', profileAccess.profile.userId);
        
        // Try to find user through profile owner
        if (profileAccess.profile.userId) {
          userId = profileAccess.profile.userId;
          console.log('Found userId from profile:', userId);
        }
        
        // If no user found through profile, try to find through account
        if (!userId) {
          console.log('No userId in profile, searching by account identifier...');
          console.log('Account type:', account.type);
          console.log('Account identifier:', account.identifier);
          
          const user = await prisma.user.findFirst({
            where: {
              OR: [
                { email: account.identifier },
                // Also check if there's a user with this wallet address
                ...(account.type === 'wallet' ? [{ walletAddress: account.identifier }] : [])
              ]
            }
          });
          
          if (user) {
            userId = user.id;
            console.log('Found existing user:', userId);
          } else {
            console.log('No existing user found');
          }
        }
        
        // Create a synthetic userId if none exists (for v1 compatibility)
        if (!userId) {
          // For v2-only accounts, use a prefixed account ID as userId
          userId = `v2_account_${account.id}`;
          console.log('Created synthetic userId:', userId);
          
          // Optionally create a user record for better compatibility
          if (process.env.CREATE_V1_USERS_FOR_V2_ACCOUNTS === 'true') {
            console.log('CREATE_V1_USERS_FOR_V2_ACCOUNTS is enabled, creating user record...');
            const user = await prisma.user.create({
              data: {
                email: account.type === 'email' ? account.identifier : null,
                walletAddress: account.type === 'wallet' ? account.identifier : null,
                // Social identifiers are stored in socialProfiles
                emailVerified: account.verified,
                // Mark as v2 user for tracking
                authStrategies: JSON.stringify({
                  v2AccountId: account.id,
                  createdFromV2: true,
                  type: account.type
                })
              }
            });
            userId = user.id;
            console.log('Created new user record:', userId);
          }
        }
        
        // Set v1-compatible user object with all required fields
        req.user = {
          userId,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent')
        } as any;
        
        console.log('Set req.user with userId:', userId);
        console.log('============================================\n');
      } else {
        // For non-profile routes, create basic user context
        let userId = `v2_account_${account.id}`;
        
        // Try to find existing user
        const { prisma } = await import('@/utils/database');
        const user = await prisma.user.findFirst({
          where: {
            OR: [
              { email: account.identifier },
              { walletAddress: account.identifier }
            ]
          }
        });
        
        if (user) {
          userId = user.id;
        }
        
        req.user = {
          userId,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent')
        } as any;
      }
      
      // Store v2 context for reference
      (req as any).isV2Auth = true;
      (req as any).v2Account = account;
      (req as any).v2Session = session;
    }
    
    next();
  } catch (error) {
    logger.error('V2 auth adapter error:', error);
    res.status(500).json({
      success: false,
      error: 'Authentication context error'
    });
  }
};

/**
 * Helper to get profile access for v2 authenticated requests
 */
export const getV2ProfileAccess = async (req: Request, profileId: string) => {
  if (!(req as any).account) {
    return null;
  }
  
  const { prisma } = await import('@/utils/database');
  
  return prisma.profileAccount.findFirst({
    where: {
      profileId,
      accountId: (req as any).account.id
    },
    include: {
      profile: true
    }
  });
};