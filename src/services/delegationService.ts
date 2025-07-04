import { prisma } from '../utils/database';
import { NotFoundError, ValidationError, ConflictError } from '../types';
import { ethers } from 'ethers';
import { LinkedAccount, AccountDelegation, SmartProfile } from '@prisma/client';
import { sessionWalletService } from '../blockchain/sessionWalletService';
// import { auditLogService } from './auditLogService'; // TODO: Implement audit logging

interface DelegationPermissions {
  transfer?: boolean;
  swap?: boolean;
  approve?: boolean;
  all?: boolean;
}

interface SignedAuthorization {
  chainId: number;
  address: string; // Session wallet address
  nonce: bigint;
  yParity: number;
  r: string;
  s: string;
}

interface DelegationAuthorizationRequest {
  linkedAccountId: string;
  sessionWallet: string;
  chainId: number;
  permissions?: DelegationPermissions;
  expiresAt?: Date;
}

interface DelegationAuthorizationResponse {
  authorizationData: {
    chainId: number;
    address: string;
    nonce: string;
  };
  message: string; // Message to sign
  permissions: DelegationPermissions;
  expiresAt?: Date;
}

interface TransactionRequest {
  to: string;
  value?: string;
  data?: string;
  chainId: number;
}

class DelegationService {
  /**
   * Create an EIP-7702 authorization request for frontend signing
   */
  async createDelegationAuthorization(
    accountId: string,
    linkedAccountId: string,
    sessionWallet: string,
    chainId: number,
    permissions: DelegationPermissions = { all: true },
    expiresAt?: Date
  ): Promise<DelegationAuthorizationResponse> {
    // Verify linked account ownership
    const linkedAccount = await prisma.linkedAccount.findFirst({
      where: {
        id: linkedAccountId,
        profile: {
          profileAccounts: {
            some: {
              accountId
            }
          }
        }
      }
    });

    if (!linkedAccount) {
      throw new NotFoundError('Linked account not found');
    }

    // Check if delegation already exists and is active
    const existingDelegation = await prisma.accountDelegation.findFirst({
      where: {
        linkedAccountId,
        sessionWallet,
        chainId,
        isActive: true
      }
    });

    if (existingDelegation) {
      throw new ConflictError('Active delegation already exists for this account');
    }

    // Get current nonce for the linked account
    // In a real implementation, this would query the blockchain
    const nonce = BigInt(Date.now()); // Placeholder - should get actual nonce from chain

    // Create authorization data
    const authorizationData = {
      chainId,
      address: sessionWallet,
      nonce: nonce.toString()
    };

    // Create message to sign according to EIP-7702
    // 0x05 || rlp([chain_id, address, nonce])
    const message = this.createEIP7702Message(chainId, sessionWallet, nonce);

    return {
      authorizationData,
      message,
      permissions,
      expiresAt
    };
  }

  /**
   * Store a signed delegation authorization
   */
  async storeDelegation(
    accountId: string,
    linkedAccountId: string,
    signedAuthorization: SignedAuthorization,
    permissions: DelegationPermissions = { all: true },
    expiresAt?: Date
  ): Promise<AccountDelegation> {
    // Verify linked account ownership
    const linkedAccount = await prisma.linkedAccount.findFirst({
      where: {
        id: linkedAccountId,
        profile: {
          profileAccounts: {
            some: {
              accountId
            }
          }
        }
      },
      include: {
        profile: true
      }
    });

    if (!linkedAccount) {
      throw new NotFoundError('Linked account not found');
    }

    // Verify the signature
    const isValid = await this.verifyDelegationSignature(
      linkedAccount.address,
      signedAuthorization
    );

    if (!isValid) {
      throw new ValidationError('Invalid delegation signature');
    }

    // Create the delegation record
    const delegation = await prisma.accountDelegation.create({
      data: {
        linkedAccountId,
        sessionWallet: signedAuthorization.address,
        chainId: signedAuthorization.chainId,
        authorizationData: signedAuthorization as any,
        permissions: permissions as any,
        nonce: signedAuthorization.nonce,
        expiresAt,
        isActive: true
      }
    });

    // Log the delegation creation
    if (linkedAccount.profile) {
      // TODO: await auditLogService.log({
      //   accountId,
      //   profileId: linkedAccount.profile.id,
      //   action: 'DELEGATION_CREATED',
      //   resource: 'AccountDelegation',
      //   details: {
      //     delegationId: delegation.id,
      //     linkedAccount: linkedAccount.address,
      //     sessionWallet: signedAuthorization.address,
      //     chainId: signedAuthorization.chainId,
      //     permissions
      //   }
      // });
    }

    return delegation;
  }

  /**
   * Check if an account has an active delegation
   */
  async hasActiveDelegation(
    linkedAccountAddress: string,
    sessionWallet: string,
    chainId: number
  ): Promise<boolean> {
    const delegation = await prisma.accountDelegation.findFirst({
      where: {
        sessionWallet,
        chainId,
        isActive: true,
        linkedAccount: {
          address: linkedAccountAddress
        },
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } }
        ]
      }
    });

    return !!delegation;
  }

  /**
   * Get active delegations for a profile
   */
  async getProfileDelegations(
    accountId: string,
    profileId: string
  ): Promise<AccountDelegation[]> {
    // Verify profile ownership
    const profile = await prisma.smartProfile.findFirst({
      where: {
        id: profileId,
        profileAccounts: {
          some: {
            accountId
          }
        }
      }
    });

    if (!profile) {
      throw new NotFoundError('Profile not found');
    }

    return prisma.accountDelegation.findMany({
      where: {
        linkedAccount: {
          profileId
        },
        isActive: true,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } }
        ]
      },
      include: {
        linkedAccount: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
  }

  /**
   * Execute a transaction using delegation
   */
  async executeWithDelegation(
    accountId: string,
    delegationId: string,
    transaction: TransactionRequest
  ): Promise<{ hash: string }> {
    // Get delegation with linked account and profile
    const delegation = await prisma.accountDelegation.findFirst({
      where: {
        id: delegationId,
        linkedAccount: {
          profile: {
            profileAccounts: {
              some: {
                accountId
              }
            }
          }
        },
        isActive: true
      },
      include: {
        linkedAccount: {
          include: {
            profile: true
          }
        }
      }
    });

    if (!delegation) {
      throw new NotFoundError('Delegation not found or not active');
    }

    // Check if delegation has expired
    if (delegation.expiresAt && delegation.expiresAt < new Date()) {
      throw new ValidationError('Delegation has expired');
    }

    // Check permissions
    const permissions = delegation.permissions as DelegationPermissions;
    if (!this.hasPermissionForTransaction(permissions, transaction)) {
      throw new ValidationError('Delegation does not have permission for this transaction');
    }

    if (!delegation.linkedAccount.profile) {
      throw new ValidationError('Linked account must belong to a profile');
    }

    // Execute transaction using the delegated authority
    // In a real implementation, this would submit the transaction with the delegation
    const txHash = await sessionWalletService.executeTransactionWithDelegation(
      delegation.linkedAccount.profile.id,
      delegation.linkedAccount.address,
      transaction.to,
      transaction.value || '0',
      transaction.data || '0x',
      transaction.chainId
    );

    // Log the delegated execution
    // TODO: await auditLogService.log({
    //   accountId,
    //   profileId: delegation.linkedAccount.profile.id,
    //   action: 'DELEGATED_TRANSACTION_EXECUTED',
    //   resource: 'Transaction',
    //   details: {
    //     delegationId,
    //     linkedAccount: delegation.linkedAccount.address,
    //     to: transaction.to,
    //     value: transaction.value,
    //     chainId: transaction.chainId,
    //     txHash
    //   }
    // });

    return { hash: txHash };
  }

  /**
   * Revoke a delegation
   */
  async revokeDelegation(
    accountId: string,
    delegationId: string
  ): Promise<void> {
    const delegation = await prisma.accountDelegation.findFirst({
      where: {
        id: delegationId,
        linkedAccount: {
          profile: {
            profileAccounts: {
              some: {
                accountId
              }
            }
          }
        }
      },
      include: {
        linkedAccount: {
          include: {
            profile: true
          }
        }
      }
    });

    if (!delegation) {
      throw new NotFoundError('Delegation not found');
    }

    // Update delegation to inactive
    await prisma.accountDelegation.update({
      where: { id: delegationId },
      data: {
        isActive: false,
        revokedAt: new Date()
      }
    });

    // Log the revocation
    if (delegation.linkedAccount.profile) {
      // TODO: await auditLogService.log({
      //   accountId,
      //   profileId: delegation.linkedAccount.profile.id,
      //   action: 'DELEGATION_REVOKED',
      //   resource: 'AccountDelegation',
      //   details: {
      //     delegationId,
      //     linkedAccount: delegation.linkedAccount.address,
      //     sessionWallet: delegation.sessionWallet,
      //     chainId: delegation.chainId
      //   }
      // });
    }
  }

  /**
   * Determine the best execution path for a transaction
   */
  async determineBestExecutionPath(
    profileId: string,
    transaction: TransactionRequest
  ): Promise<'direct' | 'delegated'> {
    // Get profile with linked accounts
    const profile = await prisma.smartProfile.findUnique({
      where: { id: profileId },
      include: {
        linkedAccounts: {
          where: { isActive: true }
        }
      }
    });

    if (!profile) {
      throw new NotFoundError('Profile not found');
    }

    // Check if any linked account has an active delegation
    for (const account of profile.linkedAccounts) {
      const hasDelegation = await this.hasActiveDelegation(
        account.address,
        profile.sessionWalletAddress,
        transaction.chainId
      );

      if (hasDelegation) {
        // Check if the account has sufficient balance for gas
        // In a real implementation, this would check on-chain balance
        return 'delegated';
      }
    }

    // Default to direct execution through session wallet
    return 'direct';
  }

  /**
   * Private helper methods
   */

  private createEIP7702Message(
    chainId: number,
    address: string,
    nonce: bigint
  ): string {
    // Create the authorization message according to EIP-7702
    // This is a simplified version - real implementation would use RLP encoding
    const message = ethers.solidityPackedKeccak256(
      ['uint8', 'uint256', 'address', 'uint256'],
      [0x05, chainId, address, nonce]
    );
    return message;
  }

  private async verifyDelegationSignature(
    signerAddress: string,
    signedAuthorization: SignedAuthorization
  ): Promise<boolean> {
    try {
      // Recreate the message
      const message = this.createEIP7702Message(
        signedAuthorization.chainId,
        signedAuthorization.address,
        signedAuthorization.nonce
      );

      // Recover the signer
      const signature = {
        r: signedAuthorization.r,
        s: signedAuthorization.s,
        v: signedAuthorization.yParity === 0 ? 27 : 28
      };

      const recoveredAddress = ethers.recoverAddress(message, signature);
      
      return recoveredAddress.toLowerCase() === signerAddress.toLowerCase();
    } catch (error) {
      console.error('Failed to verify delegation signature:', error);
      return false;
    }
  }

  private hasPermissionForTransaction(
    permissions: DelegationPermissions,
    transaction: TransactionRequest
  ): boolean {
    // If 'all' permission is granted, allow everything
    if (permissions.all) {
      return true;
    }

    // Analyze transaction data to determine type
    // This is simplified - real implementation would decode the data
    if (!transaction.data || transaction.data === '0x') {
      // Simple ETH transfer
      return !!permissions.transfer;
    }

    // Check for ERC20 transfer or approve
    const selector = transaction.data.slice(0, 10);
    if (selector === '0xa9059cbb' || selector === '0x23b872dd') {
      // transfer or transferFrom
      return !!permissions.transfer;
    }
    if (selector === '0x095ea7b3') {
      // approve
      return !!permissions.approve;
    }

    // For swaps, check common swap router selectors
    // This would need a more comprehensive list in production
    return !!permissions.swap;
  }
}

export const delegationService = new DelegationService();