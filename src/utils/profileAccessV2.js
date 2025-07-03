const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Verify if an account has access to a profile
 * Uses flat identity model - profiles are only accessed via ProfileAccount
 */
async function verifyProfileAccess(profileId, accountId) {
  try {
    if (!accountId) {
      return { hasAccess: false, profile: null };
    }

    // Check via ProfileAccount relationship
    const profileAccount = await prisma.profileAccount.findFirst({
      where: {
        profileId,
        accountId
      }
    });
    
    if (profileAccount) {
      return { hasAccess: true, profile: null };
    }
    
    // Check if account has access via linked accounts
    const accountService = require('../services/accountService');
    const linkedAccountIds = await accountService.getLinkedAccounts(accountId);
    
    const linkedProfileAccount = await prisma.profileAccount.findFirst({
      where: {
        profileId,
        accountId: { in: linkedAccountIds }
      }
    });
    
    if (linkedProfileAccount) {
      return { hasAccess: true, profile: null };
    }
    
    return { hasAccess: false, profile: null };
  } catch (error) {
    console.error('Error verifying profile access:', error);
    return { hasAccess: false, profile: null };
  }
}

/**
 * Get the account ID for authorization based on the request
 * Only supports account-based authorization (flat identity model)
 */
function getAuthorizationId(req) {
  // Only support account-based authorization
  if (req.account && req.sessionToken) {
    return {
      id: req.account.id,
      isV2: true
    };
  }
  
  return null;
}

module.exports = {
  verifyProfileAccess,
  getAuthorizationId
};