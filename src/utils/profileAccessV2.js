const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Verify if an account has access to a profile
 * This supports both V1 (user-based) and V2 (account-based) authorization
 */
async function verifyProfileAccess(profileId, accountOrUserId, isV2Token = false) {
  try {
    if (isV2Token && accountOrUserId) {
      // V2: Check via ProfileAccount relationship
      const profileAccount = await prisma.profileAccount.findFirst({
        where: {
          profileId,
          accountId: accountOrUserId
        }
      });
      
      if (profileAccount) {
        return { hasAccess: true, profile: null };
      }
      
      // Check if account has access via linked accounts
      const accountService = require('../services/accountService');
      const linkedAccountIds = await accountService.getLinkedAccounts(accountOrUserId);
      
      const linkedProfileAccount = await prisma.profileAccount.findFirst({
        where: {
          profileId,
          accountId: { in: linkedAccountIds }
        }
      });
      
      if (linkedProfileAccount) {
        return { hasAccess: true, profile: null };
      }
    }
    
    // V1 fallback or direct user check: Check via SmartProfile.userId
    if (accountOrUserId) {
      const profile = await prisma.smartProfile.findFirst({
        where: {
          id: profileId,
          userId: accountOrUserId
        }
      });
      
      if (profile) {
        return { hasAccess: true, profile };
      }
    }
    
    return { hasAccess: false, profile: null };
  } catch (error) {
    console.error('Error verifying profile access:', error);
    return { hasAccess: false, profile: null };
  }
}

/**
 * Get the appropriate ID for authorization based on the request
 */
function getAuthorizationId(req) {
  // For V2 tokens with account
  if (req.account && req.sessionToken) {
    return {
      id: req.account.id,
      isV2: true,
      userId: req.user?.id || req.user?.userId // Fallback user ID if available
    };
  }
  
  // For V1 tokens or backward compatibility
  const userId = req.user?.userId || req.user?.id;
  if (userId) {
    return {
      id: userId,
      isV2: false,
      userId
    };
  }
  
  return null;
}

module.exports = {
  verifyProfileAccess,
  getAuthorizationId
};