import { prisma, withTransaction } from '@/utils/database';
import { orbyService } from './orbyService';
import { siweService } from './siweService';
import { ethers } from 'ethers';
import { 
  LinkAccountRequest,
  UpdateLinkedAccountRequest,
  LinkedAccountResponse,
  TokenAllowanceRequest,
  TokenAllowanceResponse,
  AccountSearchResponse,
  NotFoundError,
  ConflictError,
  AuthorizationError 
} from '@/types';

export class LinkedAccountService {
  
  /**
   * Link an external account to a profile
   */
  async linkAccount(
    profileId: string, 
    userId: string, 
    data: LinkAccountRequest
  ): Promise<LinkedAccountResponse> {
    return withTransaction(async (tx) => {
      // Verify profile ownership
      const profile = await tx.smartProfile.findFirst({
        where: { 
          id: profileId,
          userId 
        }
      });

      if (!profile) {
        throw new NotFoundError('SmartProfile');
      }

      // Check if account is already linked to THIS SPECIFIC PROFILE
      const existingAccount = await tx.linkedAccount.findFirst({
        where: { 
          address: data.address.toLowerCase(),
          profileId: profileId,
          isActive: true
        }
      });

      if (existingAccount) {
        throw new ConflictError(`Account ${data.address} is already linked to this profile`);
      }

      // Verify account ownership
      const verificationResult = await this.verifyAccountOwnership(
        data.address, 
        data.signature, 
        data.message, 
        data.walletType,
        data.ipAddress,
        data.userAgent
      );
      
      if (!verificationResult.valid) {
        throw new AuthorizationError(verificationResult.error || 'Invalid signature - account ownership not verified');
      }

      // If this is the first account, make it primary
      const existingAccountsCount = await tx.linkedAccount.count({
        where: { 
          profileId,
          isActive: true 
        }
      });

      const isPrimary = existingAccountsCount === 0;

      // Create linked account
      const linkedAccount = await tx.linkedAccount.create({
        data: {
          userId,
          profileId,
          address: data.address.toLowerCase(),
          authStrategy: 'wallet',
          walletType: data.walletType,
          customName: data.customName,
          isPrimary,
          chainId: data.chainId,
          isActive: true
        },
        include: {
          allowances: true,
          _count: {
            select: {
              allowances: true
            }
          }
        }
      });

      // Log the account linking
      await tx.auditLog.create({
        data: {
          userId,
          profileId,
          action: 'ACCOUNT_LINKED',
          resource: 'LinkedAccount',
          details: JSON.stringify({
            address: data.address,
            walletType: data.walletType,
            isPrimary
          })
        }
      });

      // Update Orby account cluster with the newly linked account
      try {
        await orbyService.updateAccountCluster(profileId, tx);
      } catch (err) {
        console.error('Failed to update Orby cluster after linking account:', err);
      }

      return this.formatLinkedAccountResponse(linkedAccount);
    });
  }

  /**
   * Get all linked accounts for a profile
   */
  async getProfileAccounts(profileId: string, userId: string): Promise<LinkedAccountResponse[]> {
    // Verify profile ownership
    const profile = await prisma.smartProfile.findFirst({
      where: { 
        id: profileId,
        userId 
      }
    });

    if (!profile) {
      throw new NotFoundError('SmartProfile');
    }

    const accounts = await prisma.linkedAccount.findMany({
      where: { 
        profileId,
        isActive: true 
      },
      include: {
        _count: {
          select: {
            allowances: true
          }
        }
      },
      orderBy: [
        { isPrimary: 'desc' },
        { createdAt: 'asc' }
      ]
    });

    return accounts.map(account => this.formatLinkedAccountResponse(account));
  }

  /**
   * Search for a profile that owns a specific EOA address
   */
  async searchAccountByAddress(address: string): Promise<AccountSearchResponse | null> {
    if (!address || !this.isValidEthereumAddress(address)) {
      throw new Error('Valid Ethereum address required');
    }

    const account = await prisma.linkedAccount.findFirst({
      where: {
        address: address.toLowerCase(),
        isActive: true
      },
      include: {
        profile: {
          select: {
            id: true,
            name: true,
            isActive: true
          }
        },
        _count: {
          select: {
            allowances: true
          }
        }
      }
    });

    if (!account || !account.profile) {
      return null;
    }

    return {
      profileId: account.profile.id,
      profileName: account.profile.name,
      isActive: account.profile.isActive,
      linkedAccount: this.formatLinkedAccountResponse(account)
    };
  }

  /**
   * Update a linked account
   */
  async updateLinkedAccount(
    accountId: string,
    userId: string,
    data: UpdateLinkedAccountRequest
  ): Promise<LinkedAccountResponse> {
    return withTransaction(async (tx) => {
      // Verify account ownership
      const account = await tx.linkedAccount.findFirst({
        where: { 
          id: accountId,
          userId 
        },
        include: { profile: true }
      });

      if (!account) {
        throw new NotFoundError('LinkedAccount');
      }

      // Handle primary account changes
      if (data.isPrimary === true && !account.isPrimary) {
        // Remove primary status from other accounts in the same profile
        await tx.linkedAccount.updateMany({
          where: { 
            profileId: account.profileId,
            id: { not: accountId }
          },
          data: { isPrimary: false }
        });
      }

      // Update the account
      const updatedAccount = await tx.linkedAccount.update({
        where: { id: accountId },
        data: {
          ...(data.customName !== undefined && { customName: data.customName }),
          ...(data.isPrimary !== undefined && { isPrimary: data.isPrimary }),
          updatedAt: new Date()
        },
        include: {
          _count: {
            select: {
              allowances: true
            }
          }
        }
      });

      return this.formatLinkedAccountResponse(updatedAccount);
    });
  }

  /**
   * Remove a linked account
   */
  async unlinkAccount(accountId: string, userId: string): Promise<void> {
    return withTransaction(async (tx) => {
      // Verify account ownership
      const account = await tx.linkedAccount.findFirst({
        where: { 
          id: accountId,
          userId 
        },
        include: {
          profile: {
            include: {
              linkedAccounts: {
                where: { isActive: true }
              }
            }
          }
        }
      });

      if (!account) {
        throw new NotFoundError('LinkedAccount');
      }

      // Allow removing the last account - profile can exist without linked accounts
      console.log(`Unlinking account from profile ${account.profileId}. Active accounts: ${account.profile?.linkedAccounts.length || 0}`);

      // If removing primary account, assign primary to another account (if one exists)
      if (account.isPrimary && account.profile && account.profile.linkedAccounts.length > 1) {
        const nextAccount = account.profile.linkedAccounts.find(acc => 
          acc.id !== accountId && acc.isActive
        );
        
        if (nextAccount) {
          await tx.linkedAccount.update({
            where: { id: nextAccount.id },
            data: { isPrimary: true }
          });
        }
      }

      // Soft delete the account first
      await tx.linkedAccount.update({
        where: { id: accountId },
        data: { isActive: false }
      });

      // Check if this EOA is linked to any other active profiles for the same user
      const otherActiveAccounts = await tx.linkedAccount.findMany({
        where: {
          userId: account.userId,
          address: account.address,
          isActive: true,
          id: { not: accountId } // Exclude the current account
        }
      });

      // If no other active profiles use this EOA, completely remove it
      if (otherActiveAccounts.length === 0) {
        console.log(`🗑️ Completely removing EOA ${account.address} from user ${account.userId} as it's not linked to any other profiles`);
        
        // Delete the record entirely
        await tx.linkedAccount.delete({
          where: { id: accountId }
        });

        // Log the complete removal
        await tx.auditLog.create({
          data: {
            userId: account.userId,
            profileId: account.profileId,
            action: 'ACCOUNT_COMPLETELY_REMOVED',
            resource: 'LinkedAccount',
            details: JSON.stringify({
              address: account.address,
              reason: 'Not linked to any other profiles'
            })
          }
        });
      } else {
        console.log(`🔗 Keeping EOA ${account.address} for user ${account.userId} as it's still linked to ${otherActiveAccounts.length} other profile(s)`);

        // Log the soft delete
        await tx.auditLog.create({
          data: {
            userId: account.userId,
            profileId: account.profileId,
            action: 'ACCOUNT_UNLINKED',
            resource: 'LinkedAccount',
            details: JSON.stringify({
              address: account.address,
              remainingProfiles: otherActiveAccounts.length
            })
          }
        });
      }

      // Update Orby cluster to reflect removed account
      try {
        await orbyService.updateAccountCluster(account.profileId!, tx);
      } catch (err) {
        console.error('Failed to update Orby cluster after unlinking account:', err);
      }
    });
  }

  /**
   * Grant token allowance to session wallet
   */
  async grantTokenAllowance(
    accountId: string,
    userId: string,
    data: TokenAllowanceRequest
  ): Promise<TokenAllowanceResponse> {
    return withTransaction(async (tx) => {
      // Verify account ownership
      const account = await tx.linkedAccount.findFirst({
        where: { 
          id: accountId,
          userId,
          isActive: true
        }
      });

      if (!account) {
        throw new NotFoundError('LinkedAccount');
      }

      // Check if allowance already exists
      const existingAllowance = await tx.tokenAllowance.findUnique({
        where: {
          linkedAccountId_tokenAddress_chainId: {
            linkedAccountId: accountId,
            tokenAddress: data.tokenAddress.toLowerCase(),
            chainId: data.chainId
          }
        }
      });

      let allowance;
      if (existingAllowance) {
        // Update existing allowance
        allowance = await tx.tokenAllowance.update({
          where: { id: existingAllowance.id },
          data: {
            allowanceAmount: BigInt(data.allowanceAmount),
            updatedAt: new Date()
          }
        });
      } else {
        // Create new allowance
        allowance = await tx.tokenAllowance.create({
          data: {
            linkedAccountId: accountId,
            tokenAddress: data.tokenAddress.toLowerCase(),
            allowanceAmount: BigInt(data.allowanceAmount),
            chainId: data.chainId
          }
        });
      }

      return this.formatTokenAllowanceResponse(allowance);
    });
  }

  /**
   * Get token allowances for an account
   */
  async getAccountAllowances(accountId: string, userId: string): Promise<TokenAllowanceResponse[]> {
    // Verify account ownership
    const account = await prisma.linkedAccount.findFirst({
      where: { 
        id: accountId,
        userId,
        isActive: true
      }
    });

    if (!account) {
      throw new NotFoundError('LinkedAccount');
    }

    const allowances = await prisma.tokenAllowance.findMany({
      where: { linkedAccountId: accountId },
      orderBy: { createdAt: 'desc' }
    });

    return allowances.map(allowance => this.formatTokenAllowanceResponse(allowance));
  }

  /**
   * Revoke token allowance
   */
  async revokeTokenAllowance(allowanceId: string, userId: string): Promise<void> {
    // Verify allowance ownership through linked account
    const allowance = await prisma.tokenAllowance.findUnique({
      where: { id: allowanceId },
      include: {
        linkedAccount: true
      }
    });

    if (!allowance || allowance.linkedAccount.userId !== userId) {
      throw new NotFoundError('TokenAllowance');
    }

    await prisma.tokenAllowance.delete({
      where: { id: allowanceId }
    });
  }

  /**
   * Verify account ownership using the provided signature and message.
   * Supports both SIWE (EIP-4361) and legacy simple message signing.
   */
  private async verifyAccountOwnership(
    address: string,
    signature: string,
    message: string,
    _walletType?: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ valid: boolean; error?: string }> {
    if (!signature || !message || !address) {
      console.log('❌ Missing signature, message or address for verification');
      return { valid: false, error: 'Missing required verification data' };
    }

    try {
      // Check if this is a SIWE message (contains required SIWE fields)
      const isSiweMessage = message.includes('wants you to sign in with your Ethereum account:') &&
                           message.includes('URI:') &&
                           message.includes('Version:') &&
                           message.includes('Chain ID:') &&
                           message.includes('Nonce:');

      if (isSiweMessage) {
        // Use SIWE verification with replay protection
        const result = await siweService.verifyMessage({
          message,
          signature,
          expectedAddress: address,
          ipAddress,
          userAgent
        });
        
        console.log(`${result.valid ? '✅' : '❌'} SIWE verification result:`, {
          address: result.address,
          expected: address,
          error: result.error
        });
        
        return result;
      } else {
        // Legacy simple message verification (for backward compatibility)
        const recovered = ethers.verifyMessage(message, signature);
        const normalizedRecovered = recovered.toLowerCase();
        const normalizedAddress = address.toLowerCase();

        const isValid = normalizedRecovered === normalizedAddress;
        console.log(`${isValid ? '✅' : '❌'} Legacy signature verification result:`, {
          recovered: normalizedRecovered,
          expected: normalizedAddress
        });

        return { 
          valid: isValid, 
          error: isValid ? undefined : 'Signature verification failed'
        };
      }
    } catch (error: any) {
      console.log('❌ Signature verification error:', error);
      return { valid: false, error: error.message };
    }
  }

  /**
   * Format linked account response
   */
  private formatLinkedAccountResponse(account: any): LinkedAccountResponse {
    return {
      id: account.id,
      address: account.address,
      walletType: account.walletType,
      customName: account.customName,
      isPrimary: !!account.isPrimary,
      isActive: !!account.isActive,
      chainId: account.chainId,
      allowancesCount: account._count?.allowances || 0,
      createdAt: account.createdAt.toISOString(),
      updatedAt: account.updatedAt.toISOString()
    };
  }

  /**
   * Format token allowance response
   */
  private formatTokenAllowanceResponse(allowance: any): TokenAllowanceResponse {
    return {
      id: allowance.id,
      tokenAddress: allowance.tokenAddress,
      allowanceAmount: allowance.allowanceAmount.toString(),
      chainId: allowance.chainId,
      createdAt: allowance.createdAt.toISOString(),
      updatedAt: allowance.updatedAt.toISOString()
    };
  }

  /**
   * Validate Ethereum address format
   */
  private isValidEthereumAddress(address: string): boolean {
    if (!address || typeof address !== 'string') {
      return false;
    }
    
    // Check if it's a valid Ethereum address format (0x followed by 40 hex characters)
    const ethereumAddressRegex = /^0x[a-fA-F0-9]{40}$/;
    return ethereumAddressRegex.test(address);
  }
}

export const linkedAccountService = new LinkedAccountService();
