const { v4: uuidv4 } = require('uuid');
const { logger } = require('../utils/logger');
const { prisma, withTransaction } = require('../utils/database');

// Debug log
console.log('[AccountService] Using shared prisma instance from database.ts');

class AccountService {
  /**
   * Find or create an account based on auth method
   */
  async findOrCreateAccount({ type, identifier, provider = null, metadata = {} }) {
    try {
      // Validate required parameters
      if (!type || !identifier) {
        throw new Error(`Missing required parameters: type=${type}, identifier=${identifier}`);
      }
      
      // Ensure identifier is a string
      // For passkey accounts, preserve case as credential IDs are case-sensitive base64url strings
      const normalizedIdentifier = type === 'passkey' 
        ? String(identifier) 
        : String(identifier).toLowerCase();
      
      // First, try to find existing account
      let account = await prisma.account.findUnique({
        where: {
          type_identifier: {
            type,
            identifier: normalizedIdentifier
          }
        }
      });

      if (!account) {
        // Create new account
        account = await prisma.account.create({
          data: {
            type,
            identifier: normalizedIdentifier,
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
   * DEPRECATED: Identity graph is being removed
   * DO NOT USE - This method will be removed soon
   * Use getProfilesForLinkedAccount instead for authentication
   * @deprecated
   */
  async getLinkedAccounts(accountId) {
    logger.warn('DEPRECATED: getLinkedAccounts called - identity graph is being removed');
    // Return only the single account for now
    try {
      // Use BFS to traverse the entire identity graph
      const visited = new Set([accountId]);
      const queue = [accountId];
      
      while (queue.length > 0) {
        const currentAccountId = queue.shift();
        
        // Get all links for the current account
        const links = await prisma.identityLink.findMany({
          where: {
            OR: [
              { accountAId: currentAccountId },
              { accountBId: currentAccountId }
            ],
            privacyMode: { not: 'isolated' } // Respect privacy boundaries
          }
        });
        
        // Process each link
        for (const link of links) {
          const connectedAccountId = link.accountAId === currentAccountId 
            ? link.accountBId 
            : link.accountAId;
          
          // If we haven't visited this account yet, add it to the queue
          if (!visited.has(connectedAccountId)) {
            visited.add(connectedAccountId);
            queue.push(connectedAccountId);
          }
        }
      }
      
      // Log the traversal result for debugging
      logger.debug(`Identity graph traversal for account ${accountId}: found ${visited.size} linked accounts`, {
        accountId,
        linkedAccounts: Array.from(visited)
      });

      return Array.from(visited);
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
   * DEPRECATED: Identity graph is being removed
   * DO NOT USE - This method will be removed soon
   * Use getProfilesForLinkedAccount instead
   * @deprecated
   */
  async getAccessibleProfiles(accountId) {
    logger.warn('DEPRECATED: getAccessibleProfiles called - identity graph is being removed');
    try {
      // Get all linked accounts
      const linkedAccountIds = await this.getLinkedAccounts(accountId);
      
      logger.debug(`Getting accessible profiles for account ${accountId}`, {
        accountId,
        linkedAccountIds,
        linkedCount: linkedAccountIds.length
      });

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
      
      logger.debug(`Found ProfileAccount entries`, {
        accountId,
        profileAccountCount: profileAccounts.length,
        profileAccountDetails: profileAccounts.map(pa => ({
          accountId: pa.accountId,
          profileId: pa.profileId,
          profileName: pa.profile?.name
        }))
      });

      // Deduplicate profiles
      const profileMap = new Map();
      profileAccounts.forEach(pa => {
        if (!profileMap.has(pa.profile.id)) {
          profileMap.set(pa.profile.id, pa.profile);
        }
      });

      const profiles = Array.from(profileMap.values());
      logger.debug(`Returning accessible profiles`, {
        accountId,
        profileCount: profiles.length,
        profiles: profiles.map(p => ({ id: p.id, name: p.name }))
      });

      return profiles;
    } catch (error) {
      logger.error('Error in getAccessibleProfiles:', error);
      throw error;
    }
  }

  /**
   * Get profiles linked to a specific account identifier via LinkedAccount
   * This is the PRIMARY method for authentication - LinkedAccount is the single source of truth
   * 
   * @param {string} identifier - The email, wallet address, or social ID
   * @param {string} authStrategy - The type of account (email, wallet, social provider)
   */
  async getProfilesForLinkedAccount(identifier, authStrategy) {
    try {
      logger.info(`Getting profiles for linked account`, {
        identifier,
        authStrategy,
        normalizedIdentifier: identifier.toLowerCase()
      });

      const linkedAccounts = await prisma.linkedAccount.findMany({
        where: {
          address: identifier.toLowerCase(),
          authStrategy: authStrategy,
          isActive: true
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
      
      logger.debug(`Found LinkedAccount entries`, {
        identifier,
        authStrategy,
        linkedAccountCount: linkedAccounts.length,
        linkedAccountDetails: linkedAccounts.map(la => ({
          id: la.id,
          profileId: la.profileId,
          profileName: la.profile?.name
        }))
      });

      // Extract unique profiles
      const profilesBeforeFilter = [...new Map(linkedAccounts.map(la => [la.profile.id, la.profile])).values()];
      const profiles = profilesBeforeFilter; // Return all profiles, not just active ones
      
      // Critical debugging with console.log to ensure it shows
      logger.info(`Profile results - returning all profiles`, {
        identifier,
        linkedAccountsCount: linkedAccounts.length,
        profileCount: profiles.length,
        profiles: profiles.map(p => ({
          id: p.id,
          name: p.name,
          isActive: p.isActive
        }))
      });
      
      logger.debug(`Returning profiles via LinkedAccount`, {
        identifier,
        profileCount: profiles.length,
        profiles: profiles.map(p => ({ id: p.id, name: p.name }))
      });

      return profiles;
    } catch (error) {
      logger.error('Error in getProfilesForLinkedAccount:', error);
      throw error;
    }
  }

  /**
   * DEPRECATED: Use getProfilesForLinkedAccount instead
   * Kept for backward compatibility during migration
   */
  async getDirectlyLinkedProfiles(accountId) {
    try {
      // Get account details first
      const account = await prisma.account.findUnique({
        where: { id: accountId }
      });
      
      if (!account) {
        return [];
      }

      // Map account type to authStrategy for LinkedAccount
      const authStrategy = account.type === 'social' ? account.provider : account.type;
      
      // Use the new method
      return this.getProfilesForLinkedAccount(account.identifier, authStrategy);
    } catch (error) {
      logger.error('Error in getDirectlyLinkedProfiles:', error);
      throw error;
    }
  }

  /**
   * Create automatic profile for new user
   */
  async createAutomaticProfile(account, sessionWallet = null, profileId = null) {
    return withTransaction(async (tx) => {
      try {
        // In flat identity model, profiles are top-level entities
        // No user model needed
        
        // Determine profile name based on account metadata
        let profileName = 'My Smartprofile';
        if (account.metadata?.displayName) {
          profileName = `${account.metadata.displayName}'s Profile`;
        } else if (account.metadata?.username) {
          profileName = `${account.metadata.username}'s Profile`;
        }

        // Create the profile
        const profile = await tx.smartProfile.create({
          data: {
            id: profileId || undefined, // Use provided ID or let Prisma generate one
            name: profileName,
            sessionWalletAddress: sessionWallet?.address || '0x' + '0'.repeat(40), // Fallback address for edge cases
            isActive: true
          }
        });

        // Link account to profile (keep for backward compatibility)
        await tx.profileAccount.create({
          data: {
            profileId: profile.id,
            accountId: account.id,
            isPrimary: true
          }
        });

        // CRITICAL: Create LinkedAccount for ALL account types (not just wallets)
        // This ensures any account can authenticate and find its profiles
        const authStrategy = account.type === 'social' ? account.provider : account.type;
        
        await tx.linkedAccount.create({
          data: {
            profileId: profile.id,
            address: account.identifier, // Email, wallet address, or social ID
            authStrategy: authStrategy,
            walletType: account.type === 'wallet' 
              ? (account.metadata?.walletType || 'external')
              : account.type === 'email' 
                ? 'email' 
                : authStrategy, // For social, use the provider name
            customName: account.metadata?.customName || null,
            isPrimary: true, // First account is primary
            isActive: true,
            chainId: account.type === 'wallet' 
              ? (account.metadata?.chainId ? parseInt(account.metadata.chainId.toString()) : 1)
              : null,
            metadata: JSON.stringify(account.metadata || {})
          }
        });
        
        logger.info(`Auto-linked ${account.type} account ${account.identifier} to profile ${profile.id}`);

        // Auto-link MPC/session wallet as LinkedAccount
        if (sessionWallet?.address && sessionWallet.address !== '0x' + '0'.repeat(40)) {
          await tx.linkedAccount.create({
            data: {
              profileId: profile.id,
              address: sessionWallet.address.toLowerCase(),
              authStrategy: 'mpc',
              walletType: 'mpc',
              customName: 'Session Wallet',
              isPrimary: false, // MPC wallet is not primary
              isActive: true,
              chainId: 1, // Default to mainnet, can be updated later
              metadata: JSON.stringify({
                createdAt: new Date().toISOString()
              })
            }
          });
          
          logger.info(`Auto-linked MPC wallet ${sessionWallet.address} to profile ${profile.id}`);
        }

        // Update Orby cluster after linking all accounts
        const { orbyService } = require('./orbyService');
        try {
          await orbyService.updateAccountCluster(profile.id, tx);
        } catch (error) {
          // Don't fail profile creation if Orby update fails
          logger.error(`Failed to update Orby cluster during profile creation:`, error);
        }

        logger.info(`Created automatic profile for account ${account.id}: ${profile.id}`);
        
        // Fetch the complete profile with linkedAccounts
        const completeProfile = await tx.smartProfile.findUnique({
          where: { id: profile.id },
          include: {
            linkedAccounts: true,
            folders: {
              include: {
                apps: true
              }
            }
          }
        });
        
        return completeProfile;
      } catch (error) {
        logger.error('Error in createAutomaticProfile:', error);
        throw error;
      }
    });
  }

  /**
   * Create session for account
   */
  async createSession(accountId, { deviceId, ipAddress, userAgent, privacyMode = 'linked', expiresIn = 100 * 365 * 24 * 60 * 60 * 1000 }) {
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

  /**
   * Find account by type and identifier
   */
  async findAccountByIdentifier({ type, identifier }) {
    try {
      // For passkey accounts, preserve case as credential IDs are case-sensitive base64url strings
      const normalizedIdentifier = type === 'passkey' 
        ? String(identifier) 
        : String(identifier).toLowerCase();

      const account = await prisma.account.findUnique({
        where: {
          type_identifier: {
            type,
            identifier: normalizedIdentifier
          }
        }
      });

      return account;
    } catch (error) {
      logger.error('Error in findAccountByIdentifier:', error);
      throw error;
    }
  }

  /**
   * Check if an account has access to a specific profile
   * @param {string} accountId - The account ID
   * @param {string} profileId - The profile ID to check access for
   * @returns {Promise<boolean>} - True if the account has access, false otherwise
   */
  async hasAccessToProfile(accountId, profileId) {
    try {
      // Get all profiles accessible to this account
      const accessibleProfiles = await this.getAccessibleProfiles(accountId);
      
      // Check if the requested profile is in the list
      return accessibleProfiles.some(profile => profile.id === profileId);
    } catch (error) {
      logger.error('Error checking profile access:', { accountId, profileId, error });
      return false;
    }
  }
}

module.exports = new AccountService();