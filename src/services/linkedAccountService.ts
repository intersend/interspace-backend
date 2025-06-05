import { prisma, withTransaction } from '@/utils/database';
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

      // Verify signature (flexible for development and test wallets)
      if (!this.verifyAccountOwnership(data.address, data.signature, data.message, data.walletType)) {
        throw new AuthorizationError('Invalid signature - account ownership not verified');
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

      // Check if this is the last account - prevent removal
      if (account.profile && account.profile.linkedAccounts.length <= 1) {
        throw new ConflictError('Cannot remove the last linked account from a profile');
      }

      // If removing primary account, assign primary to another account
      if (account.isPrimary && account.profile) {
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
            allowanceAmount: data.allowanceAmount,
            updatedAt: new Date()
          }
        });
      } else {
        // Create new allowance
        allowance = await tx.tokenAllowance.create({
          data: {
            linkedAccountId: accountId,
            tokenAddress: data.tokenAddress.toLowerCase(),
            allowanceAmount: data.allowanceAmount,
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
   * Verify account ownership with flexible validation for development and test wallets
   */
  private verifyAccountOwnership(address: string, signature: string, message: string, walletType?: string): boolean {
    const isDevelopment = process.env.NODE_ENV === 'development';
    const isTestWallet = walletType === 'test' || (walletType === 'metamask' && isDevelopment);
    
    console.log('🔐 Verifying account ownership:', {
      address: `${address.slice(0, 6)}...${address.slice(-4)}`,
      walletType,
      isDevelopment,
      isTestWallet,
      hasSignature: !!signature,
      hasMessage: !!message,
      signatureLength: signature?.length || 0
    });

    // For development and test wallets, be more flexible
    if (isDevelopment || isTestWallet) {
      console.log('🧪 Development/test mode: Using relaxed signature verification');
      // Accept any non-empty signature or development bypass
      return signature === 'dev_bypass' || (typeof signature === 'string' && signature.length > 0);
    }
    
    // Production signature verification
    if (!signature || !message) {
      console.log('❌ Missing signature or message for verification');
      return false;
    }
    
    // TODO: Implement proper signature verification here
    // For now, just check that signature is provided and not empty
    const isValid = typeof signature === 'string' && signature.length > 0;
    console.log(`${isValid ? '✅' : '❌'} Signature verification result:`, { isValid });
    
    return isValid;
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
      allowanceAmount: allowance.allowanceAmount,
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
