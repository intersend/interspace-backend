import { prisma } from '@/utils/database';
import { ethers } from 'ethers';
import { AccountDelegation, AccountDelegationStatus } from '@prisma/client';

interface DelegationPermissions {
  canTransfer: boolean;
  canSwap: boolean;
  canInteractWithContracts: boolean;
  maxTransactionValue: string;
  allowedChains: number[];
  allowedContracts?: string[];
  requiresMultisig?: boolean;
  expiresAt: Date;
}

interface CreateDelegationParams {
  profileId: string;
  delegatedAddress: string;
  permissions: DelegationPermissions;
  description?: string;
}

class AccountDelegationService {
  /**
   * Create a new delegation authorization
   */
  async createDelegationAuthorization(params: CreateDelegationParams): Promise<AccountDelegation> {
    const { profileId, delegatedAddress, permissions, description } = params;
    
    // Create delegation record
    const delegation = await prisma.accountDelegation.create({
      data: {
        profileId,
        delegatorAddress: '', // Will be set when profile's MPC wallet signs
        delegatedAddress,
        permissions: JSON.stringify(permissions),
        expiresAt: permissions.expiresAt,
        status: AccountDelegationStatus.PENDING,
        nonce: Math.floor(Math.random() * 1000000).toString(),
        chainId: permissions.allowedChains[0] || 1,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });
    
    return delegation;
  }

  /**
   * Build delegation message for signing
   */
  buildDelegationMessage(delegation: AccountDelegation): string {
    const permissions = JSON.parse(delegation.permissions as string);
    
    const message = [
      'Interspace Wallet Delegation',
      `Delegated Address: ${delegation.delegatedAddress}`,
      `Nonce: ${delegation.nonce}`,
      `Expires: ${delegation.expiresAt.toISOString()}`,
      `Permissions: ${JSON.stringify(permissions)}`
    ].join('\n');
    
    return message;
  }

  /**
   * Update delegation with signature
   */
  async updateDelegationSignature(delegationId: string, signature: string): Promise<AccountDelegation> {
    const delegation = await prisma.accountDelegation.update({
      where: { id: delegationId },
      data: {
        signature,
        status: AccountDelegationStatus.ACTIVE,
        updatedAt: new Date()
      }
    });
    
    return delegation;
  }

  /**
   * Verify delegation is valid
   */
  async verifyDelegation(delegationId: string): Promise<boolean> {
    const delegation = await prisma.accountDelegation.findUnique({
      where: { id: delegationId }
    });
    
    if (!delegation) return false;
    
    // Check if expired
    if (new Date() > delegation.expiresAt) {
      await prisma.accountDelegation.update({
        where: { id: delegationId },
        data: { status: AccountDelegationStatus.EXPIRED }
      });
      return false;
    }
    
    // Check if revoked
    if (delegation.status === AccountDelegationStatus.REVOKED) {
      return false;
    }
    
    return delegation.status === AccountDelegationStatus.ACTIVE;
  }

  /**
   * Get active delegations for a profile
   */
  async getActiveDelegations(profileId: string): Promise<AccountDelegation[]> {
    const delegations = await prisma.accountDelegation.findMany({
      where: {
        profileId,
        status: AccountDelegationStatus.ACTIVE,
        expiresAt: {
          gt: new Date()
        }
      }
    });
    
    return delegations;
  }

  /**
   * Revoke a delegation
   */
  async revokeDelegation(delegationId: string): Promise<AccountDelegation> {
    const delegation = await prisma.accountDelegation.update({
      where: { id: delegationId },
      data: {
        status: AccountDelegationStatus.REVOKED,
        revokedAt: new Date(),
        updatedAt: new Date()
      }
    });
    
    return delegation;
  }
}

export const accountDelegationService = new AccountDelegationService();