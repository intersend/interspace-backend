import { prisma, withTransaction } from '@/utils/database';
import { 
  LinkAccountRequest,
  UpdateLinkedAccountRequest,
  LinkedAccountResponse,
  TokenAllowanceRequest,
  TokenAllowanceResponse,
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

      // Check if account is already linked
      const existingAccount = await tx.linkedAccount.findUnique({
        where: { address: data.address.toLowerCase() }
      });

      if (existingAccount) {
        throw new ConflictError('Account already linked');
      }

      // Verify signature (placeholder - in real implementation, verify ownership)
      if (!this.verifyAccountOwnership(data.address, data.signature, data.message)) {
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

      // Soft delete the account
      await tx.linkedAccount.update({
        where: { id: accountId },
        data: { isActive: false }
      });
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
   * Verify account ownership (placeholder implementation)
   */
  private verifyAccountOwnership(address: string, signature: string, message: string): boolean {
    // In a real implementation, you would verify the signature
    // For now, just check that signature is provided and not empty
    return typeof signature === 'string' && signature.length > 0;
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
}

export const linkedAccountService = new LinkedAccountService();
