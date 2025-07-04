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
  AuthorizationError, 
  AppError
} from '@/types';
import { logger } from '@/utils/logger';

export class LinkedAccountService {
  
  /**
   * Link an external account to a profile
   */
  async linkAccount(
    profileId: string, 
    accountId: string, // Changed from accountId to accountId for access control
    data: LinkAccountRequest
  ): Promise<LinkedAccountResponse> {
    return withTransaction(async (tx) => {
      // Verify profile access via ProfileAccount
      const profileAccess = await tx.profileAccount.findFirst({
        where: { 
          profileId,
          accountId 
        },
        include: {
          profile: true
        }
      });

      if (!profileAccess) {
        throw new NotFoundError('Profile not found or access denied');
      }

      const profile = profileAccess.profile;

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
          accountId: accountId, // Using accountId for audit trail
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

      // Note: Orby cluster will be created fresh with all accounts when needed

      return this.formatLinkedAccountResponse(linkedAccount);
    });
  }

  /**
   * Get all linked accounts for a profile
   */
  async getProfileAccounts(profileId: string, accountId: string): Promise<LinkedAccountResponse[]> {
    // Verify profile access via ProfileAccount
    const profileAccess = await prisma.profileAccount.findFirst({
      where: { 
        profileId,
        accountId 
      },
      include: {
        profile: true
      }
    });

    if (!profileAccess) {
      throw new NotFoundError('Profile not found or access denied');
    }

    const linkedAccounts = await prisma.linkedAccount.findMany({
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

    return linkedAccounts.map(linkedAccount => this.formatLinkedAccountResponse(linkedAccount));
  }

  /**
   * Search for a profile that owns a specific EOA address
   */
  async searchAccountByAddress(address: string): Promise<AccountSearchResponse | null> {
    if (!address || !this.isValidEthereumAddress(address)) {
      throw new Error('Valid Ethereum address required');
    }

    const linkedAccount = await prisma.linkedAccount.findFirst({
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

    if (!linkedAccount || !linkedAccount.profile) {
      return null;
    }

    return {
      profileId: linkedAccount.profile.id,
      profileName: linkedAccount.profile.name,
      isActive: linkedAccount.profile.isActive,
      linkedAccount: this.formatLinkedAccountResponse(linkedAccount)
    };
  }

  /**
   * Update a linked account
   */
  async updateLinkedAccount(
    linkedAccountId: string,
    accountId: string, // Account making the request
    data: UpdateLinkedAccountRequest
  ): Promise<LinkedAccountResponse> {
    return withTransaction(async (tx) => {
      // Get the linked account with profile
      const linkedAccount = await tx.linkedAccount.findUnique({
        where: { 
          id: linkedAccountId
        },
        include: { profile: true }
      });

      if (!linkedAccount) {
        throw new NotFoundError('LinkedAccount');
      }

      // Verify the requesting account has access to this profile
      const profileAccess = await tx.profileAccount.findFirst({
        where: {
          profileId: linkedAccount.profileId,
          accountId
        }
      });

      if (!profileAccess) {
        throw new AuthorizationError('You do not have access to this profile');
      }

      // Handle primary account changes
      if (data.isPrimary === true && !linkedAccount.isPrimary) {
        // Remove primary status from other accounts in the same profile
        await tx.linkedAccount.updateMany({
          where: { 
            profileId: linkedAccount.profileId,
            id: { not: linkedAccountId }
          },
          data: { isPrimary: false }
        });
      }

      // Update the account
      const updatedAccount = await tx.linkedAccount.update({
        where: { id: linkedAccountId },
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
  async unlinkAccount(linkedAccountId: string, accountId: string): Promise<void> {
    return withTransaction(async (tx) => {
      console.log('Attempting to unlink account:', { linkedAccountId, accountId });
      
      // Get the linked account
      const linkedAccount = await tx.linkedAccount.findUnique({
        where: { id: linkedAccountId },
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

      if (!linkedAccount) {
        throw new NotFoundError('LinkedAccount');
      }
      
      // Verify the requesting account has access to this profile
      const profileAccess = await tx.profileAccount.findFirst({
        where: {
          profileId: linkedAccount.profileId,
          accountId
        }
      });

      if (!profileAccess) {
        throw new AuthorizationError('You do not have access to this profile');
      }

      // Allow removing the last account - profile can exist without linked accounts
      console.log(`Unlinking account from profile ${linkedAccount.profileId}. Active accounts: ${linkedAccount.profile?.linkedAccounts.length || 0}`);

      // If removing primary account, assign primary to another account (if one exists)
      if (linkedAccount.isPrimary && linkedAccount.profile && linkedAccount.profile.linkedAccounts.length > 1) {
        const nextAccount = linkedAccount.profile.linkedAccounts.find(acc => 
          acc.id !== linkedAccountId && acc.isActive
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
        where: { id: linkedAccountId },
        data: { isActive: false }
      });

      // Check if this EOA is linked to any other active profiles
      const otherActiveAccounts = await tx.linkedAccount.findMany({
        where: {
          address: linkedAccount.address,
          isActive: true,
          id: { not: linkedAccountId } // Exclude the current account
        }
      });

      // If no other active profiles use this EOA, completely remove it
      if (otherActiveAccounts.length === 0) {
        console.log(`🗑️ Completely removing EOA ${linkedAccount.address} as it's not linked to any other profiles`);
        
        // Delete the record entirely
        await tx.linkedAccount.delete({
          where: { id: linkedAccountId }
        });

        // Log the complete removal
        await tx.auditLog.create({
          data: {
            accountId: accountId, // Using accountId for audit trail
            profileId: linkedAccount.profileId,
            action: 'ACCOUNT_COMPLETELY_REMOVED',
            resource: 'LinkedAccount',
            details: JSON.stringify({
              address: linkedAccount.address,
              reason: 'Not linked to any other profiles'
            })
          }
        });
      } else {
        console.log(`🔗 Keeping EOA ${linkedAccount.address} as it's still linked to ${otherActiveAccounts.length} other profile(s)`);

        // Log the soft delete
        await tx.auditLog.create({
          data: {
            accountId: accountId, // Using accountId for audit trail
            profileId: linkedAccount.profileId,
            action: 'ACCOUNT_UNLINKED',
            resource: 'LinkedAccount',
            details: JSON.stringify({
              address: linkedAccount.address,
              remainingProfiles: otherActiveAccounts.length
            })
          }
        });
      }

      // Note: Orby cluster will be created fresh with all accounts when needed
    });
  }

  /**
   * Grant token allowance to session wallet
   */
  async grantTokenAllowance(
    linkedAccountId: string,
    accountId: string, // Changed from accountId to accountId for access control
    data: TokenAllowanceRequest
  ): Promise<TokenAllowanceResponse> {
    return withTransaction(async (tx) => {
      // Get the linked account with profile info
      const linkedAccount = await tx.linkedAccount.findFirst({
        where: { 
          id: linkedAccountId,
          isActive: true
        },
        include: {
          profile: true
        }
      });

      if (!linkedAccount) {
        throw new NotFoundError('LinkedAccount');
      }

      // Verify the requesting account has access to this profile
      const profileAccess = await tx.profileAccount.findFirst({
        where: {
          profileId: linkedAccount.profileId,
          accountId
        }
      });

      if (!profileAccess) {
        throw new AuthorizationError('You do not have access to this profile');
      }

      // Check if allowance already exists
      const existingAllowance = await tx.tokenAllowance.findUnique({
        where: {
          linkedAccountId_tokenAddress_chainId: {
            linkedAccountId: linkedAccountId,
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
            linkedAccountId: linkedAccountId,
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
  async getAccountAllowances(linkedAccountId: string, accountId: string): Promise<TokenAllowanceResponse[]> {
    // Get the linked account with profile info
    const linkedAccount = await prisma.linkedAccount.findFirst({
      where: { 
        id: linkedAccountId,
        isActive: true
      },
      include: {
        profile: true
      }
    });

    if (!linkedAccount) {
      throw new NotFoundError('LinkedAccount');
    }

    // Verify the requesting account has access to this profile
    const profileAccess = await prisma.profileAccount.findFirst({
      where: {
        profileId: linkedAccount.profileId,
        accountId
      }
    });

    if (!profileAccess) {
      throw new AuthorizationError('You do not have access to this profile');
    }

    const allowances = await prisma.tokenAllowance.findMany({
      where: { linkedAccountId: linkedAccountId },
      orderBy: { createdAt: 'desc' }
    });

    return allowances.map(allowance => this.formatTokenAllowanceResponse(allowance));
  }

  /**
   * Revoke token allowance
   */
  async revokeTokenAllowance(allowanceId: string, accountId: string): Promise<void> {
    // Verify allowance ownership through linked account and profile access
    const allowance = await prisma.tokenAllowance.findUnique({
      where: { id: allowanceId },
      include: {
        linkedAccount: {
          include: {
            profile: true
          }
        }
      }
    });

    if (!allowance) {
      throw new NotFoundError('TokenAllowance');
    }

    // Verify the requesting account has access to this profile
    const profileAccess = await prisma.profileAccount.findFirst({
      where: {
        profileId: allowance.linkedAccount.profileId,
        accountId
      }
    });

    if (!profileAccess) {
      throw new AuthorizationError('You do not have access to this profile');
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

    // Development mode bypass
    if (process.env.NODE_ENV === 'development' && signature === 'dev_bypass' && message === 'dev_bypass') {
      console.log('✅ Development mode bypass - skipping signature verification for address:', address);
      return { valid: true };
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
        // @ts-ignore
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
