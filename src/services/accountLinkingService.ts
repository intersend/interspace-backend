import { prisma } from '@/utils/database';
import { logger } from '@/utils/logger';
import { orbyService } from './orbyService';
import type { Account, SmartProfile, Prisma } from '@prisma/client';

/**
 * Service to handle standardized account linking across all auth types
 * Ensures that authentication accounts are automatically linked to profiles
 * for transaction capabilities when appropriate
 */
class AccountLinkingService {
  /**
   * Automatically link an account to a profile based on its capabilities
   * @param {Object} account - The Account record
   * @param {Object} profile - The SmartProfile record
   * @param {Object} tx - Optional Prisma transaction
   */
  async autoLinkAccountToProfile(account: Account, profile: SmartProfile, tx: Prisma.TransactionClient | null = null) {
    const dbContext = tx || prisma;
    
    try {
      logger.info(`Auto-linking account ${account.id} (${account.type}) to profile ${profile.id}`);
      
      switch (account.type) {
        case 'wallet':
          // Wallet accounts should always be linked for transaction capabilities
          await this.linkWalletAccount(account, profile, dbContext);
          break;
          
        case 'social':
          // Some social accounts (like Telegram) might have associated wallets
          if (account.metadata && typeof account.metadata === 'object' && 'walletAddress' in account.metadata) {
            await this.linkSocialWallet(account, profile, dbContext);
          }
          break;
          
        case 'email':
        case 'passkey':
        case 'guest':
          // These account types don't have inherent wallet capabilities
          // They rely on the MPC session wallet for transactions
          logger.info(`Account type ${account.type} does not require wallet linking`);
          break;
          
        default:
          logger.warn(`Unknown account type for auto-linking: ${account.type}`);
      }
      
      // Update Orby cluster to include any newly linked accounts
      if (profile.id) {
        try {
          await orbyService.updateAccountCluster(profile.id, dbContext);
          logger.info(`Updated Orby cluster for profile ${profile.id}`);
        } catch (error) {
          // Don't fail the whole operation if Orby update fails
          logger.error(`Failed to update Orby cluster for profile ${profile.id}:`, error);
        }
      }
      
    } catch (error) {
      logger.error(`Error auto-linking account ${account.id} to profile ${profile.id}:`, error);
      throw error;
    }
  }
  
  /**
   * Link a wallet account to a profile
   * @param {Object} account - The wallet Account record
   * @param {Object} profile - The SmartProfile record
   * @param {Object} tx - Prisma transaction context
   */
  async linkWalletAccount(account: Account, profile: SmartProfile, tx: any) {
    const address = account.identifier.toLowerCase();
    
    // Check if this wallet is already linked to this profile
    const existingLink = await tx.linkedAccount.findFirst({
      where: {
        profileId: profile.id,
        address: address
      }
    });
    
    if (existingLink) {
      logger.info(`Wallet ${address} already linked to profile ${profile.id}`);
      return existingLink;
    }
    
    // Check if this is the first linked account for the profile
    const linkedAccountCount = await tx.linkedAccount.count({
      where: {
        profileId: profile.id,
        isActive: true
      }
    });
    
    // Create the linked account
    const metadata = account.metadata as any || {};
    const linkedAccount = await tx.linkedAccount.create({
      data: {
        userId: profile.userId,
        profileId: profile.id,
        address: address,
        authStrategy: 'wallet',
        walletType: metadata.walletType || 'external',
        customName: metadata.customName || null,
        isPrimary: linkedAccountCount === 0, // First account is primary
        isActive: true,
        chainId: metadata.chainId || 1,
        metadata: JSON.stringify(metadata)
      }
    });
    
    logger.info(`Successfully linked wallet ${address} to profile ${profile.id} (primary: ${linkedAccount.isPrimary})`);
    
    // Log the linking action
    await tx.auditLog.create({
      data: {
        userId: profile.userId,
        profileId: profile.id,
        action: 'WALLET_AUTO_LINKED',
        resource: 'LinkedAccount',
        details: JSON.stringify({
          accountId: account.id,
          address: address,
          walletType: linkedAccount.walletType,
          isPrimary: linkedAccount.isPrimary,
          source: 'authentication'
        })
      }
    });
    
    return linkedAccount;
  }
  
  /**
   * Link a social account's wallet to a profile
   * @param {Object} account - The social Account record with wallet metadata
   * @param {Object} profile - The SmartProfile record
   * @param {Object} tx - Prisma transaction context
   */
  async linkSocialWallet(account: Account, profile: SmartProfile, tx: any) {
    const walletAddress = account.metadata && typeof account.metadata === 'object' && 'walletAddress' in account.metadata 
      ? (account.metadata as any).walletAddress 
      : null;
    if (!walletAddress) {
      logger.warn(`Social account ${account.id} has no wallet address to link`);
      return null;
    }
    
    const address = walletAddress.toLowerCase();
    
    // Check if already linked
    const existingLink = await tx.linkedAccount.findFirst({
      where: {
        profileId: profile.id,
        address: address
      }
    });
    
    if (existingLink) {
      logger.info(`Social wallet ${address} already linked to profile ${profile.id}`);
      return existingLink;
    }
    
    // Check if this is the first linked account
    const linkedAccountCount = await tx.linkedAccount.count({
      where: {
        profileId: profile.id,
        isActive: true
      }
    });
    
    // Create the linked account for the social wallet
    const metadata = account.metadata as any || {};
    const linkedAccount = await tx.linkedAccount.create({
      data: {
        userId: profile.userId,
        profileId: profile.id,
        address: address,
        authStrategy: account.provider || account.type, // e.g., 'telegram'
        walletType: 'social',
        customName: `${account.provider || account.type} Wallet`,
        isPrimary: linkedAccountCount === 0,
        isActive: true,
        chainId: metadata.chainId || 1,
        metadata: JSON.stringify({
          provider: account.provider,
          providerId: account.identifier,
          ...(account.metadata as object || {})
        })
      }
    });
    
    logger.info(`Successfully linked social wallet ${address} from ${account.provider} to profile ${profile.id}`);
    
    return linkedAccount;
  }
  
  /**
   * Ensure all wallet-capable accounts for a profile are properly linked
   * This can be used during profile creation or as a cleanup operation
   * @param {string} profileId - The profile ID
   */
  async ensureAllAccountsLinked(profileId: string) {
    const profile = await prisma.smartProfile.findUnique({
      where: { id: profileId },
      include: {
        linkedAccounts: true
      }
    });
    
    if (!profile) {
      throw new Error(`Profile ${profileId} not found`);
    }
    
    // Get all accounts linked to this profile through ProfileAccount
    const profileAccounts = await prisma.profileAccount.findMany({
      where: { profileId },
      include: {
        account: true
      }
    });
    
    let linkedCount = 0;
    
    // Process each account
    for (const pa of profileAccounts) {
      const account = pa.account;
      
      // Check if this account should have a linked wallet
      const hasWalletAddress = account.metadata && typeof account.metadata === 'object' && 'walletAddress' in account.metadata;
      if (account.type === 'wallet' || 
          (account.type === 'social' && hasWalletAddress)) {
        
        // Check if it's already linked
        const address = account.type === 'wallet' 
          ? account.identifier 
          : (account.metadata as any).walletAddress;
          
        const isLinked = profile.linkedAccounts.some(
          la => la.address.toLowerCase() === address.toLowerCase()
        );
        
        if (!isLinked) {
          // Link it
          await this.autoLinkAccountToProfile(account, profile);
          linkedCount++;
        }
      }
    }
    
    if (linkedCount > 0) {
      logger.info(`Linked ${linkedCount} additional accounts to profile ${profileId}`);
    }
    
    return linkedCount;
  }
}

export const accountLinkingService = new AccountLinkingService();