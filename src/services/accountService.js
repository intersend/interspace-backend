const { v4: uuidv4 } = require('uuid');
const { logger } = require('../utils/logger');
const { PrismaClient } = require('@prisma/client');

// Create a singleton instance of PrismaClient
const prismaClientSingleton = () => {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });
};

// Use global to ensure we don't create multiple instances
const globalForPrisma = global;
const prisma = globalForPrisma.prisma || prismaClientSingleton();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Debug log
console.log('[AccountService] Prisma initialized successfully');

class AccountService {
  /**
   * Find or create an account based on auth method
   */
  async findOrCreateAccount({ type, identifier, provider = null, metadata = {} }) {
    try {
      // First, try to find existing account
      let account = await prisma.account.findUnique({
        where: {
          type_identifier: {
            type,
            identifier: identifier.toLowerCase()
          }
        }
      });

      if (!account) {
        // Create new account
        account = await prisma.account.create({
          data: {
            type,
            identifier: identifier.toLowerCase(),
            provider,
            metadata,
            verified: type === 'wallet' // Wallets are verified by signature
          }
        });

        logger.info(`Created new account: ${account.id} (${type}:${identifier})`);
      }

      return account;
    } catch (error) {
      logger.error('Error in findOrCreateAccount:', error);
      throw error;
    }
  }

  /**
   * Get all linked accounts through identity graph
   */
  async getLinkedAccounts(accountId) {
    try {
      // Get direct links where this account is either A or B
      const links = await prisma.identityLink.findMany({
        where: {
          OR: [
            { accountAId: accountId },
            { accountBId: accountId }
          ],
          privacyMode: { not: 'isolated' } // Respect privacy boundaries
        },
        include: {
          accountA: true,
          accountB: true
        }
      });

      // Collect all linked account IDs
      const linkedAccountIds = new Set([accountId]);
      
      links.forEach(link => {
        if (link.accountAId === accountId) {
          linkedAccountIds.add(link.accountBId);
        } else {
          linkedAccountIds.add(link.accountAId);
        }
      });

      return Array.from(linkedAccountIds);
    } catch (error) {
      logger.error('Error in getLinkedAccounts:', error);
      throw error;
    }
  }

  /**
   * Link two accounts together
   */
  async linkAccounts(accountIdA, accountIdB, linkType = 'direct', privacyMode = 'linked') {
    try {
      // Ensure consistent ordering to prevent duplicates
      const [firstId, secondId] = [accountIdA, accountIdB].sort();

      const link = await prisma.identityLink.upsert({
        where: {
          accountAId_accountBId: {
            accountAId: firstId,
            accountBId: secondId
          }
        },
        update: {
          linkType,
          privacyMode,
          updatedAt: new Date()
        },
        create: {
          accountAId: firstId,
          accountBId: secondId,
          linkType,
          privacyMode
        }
      });

      logger.info(`Linked accounts: ${accountIdA} <-> ${accountIdB} (${linkType}, ${privacyMode})`);
      return link;
    } catch (error) {
      logger.error('Error in linkAccounts:', error);
      throw error;
    }
  }

  /**
   * Get all accessible profiles for an account
   */
  async getAccessibleProfiles(accountId) {
    try {
      // Get all linked accounts
      const linkedAccountIds = await this.getLinkedAccounts(accountId);

      // Get all profiles linked to any of these accounts
      const profileAccounts = await prisma.profileAccount.findMany({
        where: {
          accountId: { in: linkedAccountIds }
        },
        include: {
          profile: {
            include: {
              linkedAccounts: true,
              folders: {
                include: {
                  apps: true
                }
              }
            }
          }
        }
      });

      // Deduplicate profiles
      const profileMap = new Map();
      profileAccounts.forEach(pa => {
        if (!profileMap.has(pa.profile.id)) {
          profileMap.set(pa.profile.id, pa.profile);
        }
      });

      return Array.from(profileMap.values());
    } catch (error) {
      logger.error('Error in getAccessibleProfiles:', error);
      throw error;
    }
  }

  /**
   * Create automatic profile for new user
   */
  async createAutomaticProfile(account, sessionWallet = null, profileId = null) {
    try {
      // For backward compatibility, we still need a user record
      // In future, this can be removed
      let user = await prisma.user.findFirst({
        where: {
          OR: [
            { email: account.type === 'email' ? account.identifier : undefined },
            { walletAddress: account.type === 'wallet' ? account.identifier : undefined }
          ]
        }
      });

      if (!user) {
        // Create a minimal user record for backward compatibility
        user = await prisma.user.create({
          data: {
            id: uuidv4(),
            email: account.type === 'email' ? account.identifier : null,
            walletAddress: account.type === 'wallet' ? account.identifier : null,
            isGuest: false,
            authStrategies: account.type
          }
        });
      }

      // Create the profile
      const profile = await prisma.smartProfile.create({
        data: {
          id: profileId || undefined, // Use provided ID or let Prisma generate one
          name: 'My Smartprofile',
          user: {
            connect: { id: user.id }
          },
          sessionWalletAddress: sessionWallet?.address || '0x' + '0'.repeat(40), // Fallback address for edge cases
          isActive: true,
          isDevelopmentWallet: sessionWallet?.isDevelopment || false
        }
      });

      // Link account to profile
      await prisma.profileAccount.create({
        data: {
          profileId: profile.id,
          accountId: account.id,
          isPrimary: true
        }
      });

      logger.info(`Created automatic profile for account ${account.id}: ${profile.id}`);
      return profile;
    } catch (error) {
      logger.error('Error in createAutomaticProfile:', error);
      throw error;
    }
  }

  /**
   * Create session for account
   */
  async createSession(accountId, { deviceId, ipAddress, userAgent, privacyMode = 'linked', expiresIn = 7 * 24 * 60 * 60 * 1000 }) {
    try {
      const sessionId = uuidv4();
      const expiresAt = new Date(Date.now() + expiresIn);

      const session = await prisma.accountSession.create({
        data: {
          accountId,
          sessionId,
          deviceId,
          ipAddress,
          userAgent,
          privacyMode,
          expiresAt
        }
      });

      // Add sessionToken for backward compatibility
      session.sessionToken = sessionId;

      return session;
    } catch (error) {
      logger.error('Error in createSession:', error);
      throw error;
    }
  }

  /**
   * Verify account ownership (for wallet accounts)
   */
  async verifyAccount(accountId) {
    try {
      await prisma.account.update({
        where: { id: accountId },
        data: { verified: true }
      });

      logger.info(`Account verified: ${accountId}`);
    } catch (error) {
      logger.error('Error in verifyAccount:', error);
      throw error;
    }
  }

  /**
   * Update account metadata
   */
  async updateAccountMetadata(accountId, metadata) {
    try {
      const account = await prisma.account.update({
        where: { id: accountId },
        data: {
          metadata: {
            ...(await prisma.account.findUnique({ where: { id: accountId }, select: { metadata: true } }))?.metadata,
            ...metadata
          }
        }
      });

      return account;
    } catch (error) {
      logger.error('Error in updateAccountMetadata:', error);
      throw error;
    }
  }

  /**
   * Set privacy mode for account link
   */
  async setLinkPrivacyMode(accountIdA, accountIdB, privacyMode) {
    try {
      const [firstId, secondId] = [accountIdA, accountIdB].sort();

      const link = await prisma.identityLink.update({
        where: {
          accountAId_accountBId: {
            accountAId: firstId,
            accountBId: secondId
          }
        },
        data: { privacyMode }
      });

      logger.info(`Updated privacy mode for link ${accountIdA} <-> ${accountIdB}: ${privacyMode}`);
      return link;
    } catch (error) {
      logger.error('Error in setLinkPrivacyMode:', error);
      throw error;
    }
  }

  /**
   * Update profile session wallet address
   */
  async updateProfileSessionWallet(profileId, sessionWalletAddress) {
    try {
      const profile = await prisma.smartProfile.update({
        where: { id: profileId },
        data: { sessionWalletAddress }
      });

      logger.info(`Updated session wallet for profile ${profileId}: ${sessionWalletAddress}`);
      return profile;
    } catch (error) {
      logger.error('Error in updateProfileSessionWallet:', error);
      throw error;
    }
  }

  /**
   * Link a profile to an account
   */
  async linkProfileToAccount(accountId, profileId) {
    try {
      // Check if the link already exists
      const existingLink = await prisma.profileAccount.findUnique({
        where: {
          profileId_accountId: {
            profileId,
            accountId
          }
        }
      });

      if (existingLink) {
        return existingLink;
      }

      // Create the link
      const link = await prisma.profileAccount.create({
        data: {
          profileId,
          accountId,
          isPrimary: false, // Not primary by default
          permissions: { role: 'owner' } // Store role in permissions JSON
        }
      });

      logger.info(`Linked profile ${profileId} to account ${accountId}`);
      return link;
    } catch (error) {
      logger.error('Error in linkProfileToAccount:', error);
      throw error;
    }
  }
}

module.exports = new AccountService();