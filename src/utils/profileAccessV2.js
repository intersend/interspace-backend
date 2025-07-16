const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Verify if an account has access to a profile
 * Uses profile-centric model - profiles are accessed via LinkedAccount
 */
async function verifyProfileAccess(profileId, accountId) {
  try {
    if (!accountId) {
      return { hasAccess: false, profile: null };
    }

    // Get account details to determine authStrategy
    const account = await prisma.account.findUnique({
      where: { id: accountId }
    });
    
    if (!account) {
      console.error('Account not found:', accountId);
      return { hasAccess: false, profile: null };
    }
    
    // Determine authStrategy based on account type
    let authStrategy;
    if (account.type === 'social') {
      authStrategy = account.provider; // 'apple', 'google', etc.
    } else {
      authStrategy = account.type; // 'wallet', 'email', 'passkey'
    }
    
    // Check LinkedAccount table (single source of truth for profile access)
    const linkedAccount = await prisma.linkedAccount.findFirst({
      where: {
        profileId,
        address: account.identifier.toLowerCase(),
        authStrategy: authStrategy,
        isActive: true
      }
    });
    
    if (linkedAccount) {
      console.log(`Access granted via LinkedAccount for profile ${profileId}, account ${accountId}`);
      return { hasAccess: true, profile: null };
    }
    
    // Fallback: Check ProfileAccount for backward compatibility
    const profileAccount = await prisma.profileAccount.findFirst({
      where: {
        profileId,
        accountId
      }
    });
    
    if (profileAccount) {
      console.log(`Access granted via ProfileAccount (backward compatibility) for profile ${profileId}, account ${accountId}`);
      
      // Auto-migrate to LinkedAccount for future requests
      try {
        await prisma.linkedAccount.create({
          data: {
            profileId,
            address: account.identifier.toLowerCase(),
            authStrategy: authStrategy,
            walletType: account.type === 'wallet' ? (account.metadata?.walletType || 'external') : null,
            isPrimary: profileAccount.isPrimary,
            isActive: true,
            chainId: account.metadata?.chainId ? parseInt(account.metadata.chainId) : 1,
            metadata: account.metadata ? JSON.stringify(account.metadata) : null
          }
        });
        console.log(`Auto-migrated ProfileAccount to LinkedAccount for profile ${profileId}, account ${accountId}`);
      } catch (migrationError) {
        // Might already exist or other error, ignore
        console.warn(`Could not auto-migrate to LinkedAccount:`, migrationError.message);
      }
      
      return { hasAccess: true, profile: null };
    }
    
    console.log(`Access denied for profile ${profileId}, account ${accountId} (${authStrategy})`);
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