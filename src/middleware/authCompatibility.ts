import { Request, Response, NextFunction } from 'express';
const { verifyProfileAccess } = require('../utils/profileAccessV2');

// Type for the account object that's already defined elsewhere
interface AccountInfo {
  id: string;
  identifier: string;
  authProvider: string;
  createdAt: Date;
  updatedAt: Date;
}

// Custom request type with our properties
interface AuthRequest extends Request {
  account?: AccountInfo;
  profileId?: string;
  hasProfileAccess?: boolean;
}

/**
 * Middleware to ensure authenticated account has access to the requested profile
 * Used by V2 routes that operate on specific profiles
 */
export async function ensureProfileAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // Use type assertion to access custom properties
    const authReq = req as AuthRequest;
    
    // Get profileId from params or body
    const profileId = req.params.profileId || req.body.profileId;
    
    if (!profileId) {
      res.status(400).json({
        success: false,
        error: 'Profile ID is required'
      });
      return;
    }

    // Check if account is authenticated
    if (!authReq.account || !authReq.account.id) {
      res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
      return;
    }

    // Verify profile access
    const { hasAccess } = await verifyProfileAccess(profileId, authReq.account.id);

    if (!hasAccess) {
      res.status(403).json({
        success: false,
        error: 'Access denied to this profile'
      });
      return;
    }

    // Add profileId to request for convenience
    authReq.profileId = profileId;
    
    next();
  } catch (error) {
    console.error('Error in ensureProfileAccess middleware:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
    return;
  }
}

/**
 * Optional middleware to verify profile access without blocking
 * Sets req.hasProfileAccess to true/false
 */
export async function checkProfileAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
  // Use type assertion to access custom properties
  const authReq = req as AuthRequest;
  
  try {
    const profileId = req.params.profileId || req.body.profileId;
    const accountId = authReq.account?.id;

    if (profileId && accountId) {
      const { hasAccess } = await verifyProfileAccess(profileId, accountId);
      authReq.hasProfileAccess = hasAccess;
    } else {
      authReq.hasProfileAccess = false;
    }

    next();
  } catch (error) {
    console.error('Error in checkProfileAccess middleware:', error);
    authReq.hasProfileAccess = false;
    next();
  }
}