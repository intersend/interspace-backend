import { prisma } from '../utils/database';
import { ethers } from 'ethers';
import { AccountDelegation } from '@prisma/client';

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
  linkedAccountId: string;
  sessionWallet: string;
  chainId: number;
  permissions: DelegationPermissions;
  authorizationData: any;
  description?: string;
}

class AccountDelegationService {
  /**
   * Create a new delegation authorization
   */
  async createDelegationAuthorization(params: CreateDelegationParams): Promise<AccountDelegation> {
    const { linkedAccountId, sessionWallet, chainId, permissions, authorizationData } = params;
    
    // Create delegation record
    const delegation = await prisma.accountDelegation.create({
      data: {
        linkedAccountId,
        sessionWallet,
        chainId,
        delegationType: 'eip7702',
        authorizationData,
        permissions: permissions as any,
        nonce: BigInt(Math.floor(Math.random() * 1000000)),
        expiresAt: permissions.expiresAt,
        isActive: false
      }
    });
    
    return delegation;
  }

  /**
   * Build delegation message for signing
   */
  buildDelegationMessage(delegation: AccountDelegation): string {
    const permissions = delegation.permissions as any;
    
    const message = [
      'Interspace Wallet Delegation',
      `Session Wallet: ${delegation.sessionWallet}`,
      `Chain ID: ${delegation.chainId}`,
      `Nonce: ${delegation.nonce}`,
      `Expires: ${delegation.expiresAt?.toISOString() || 'Never'}`,
      `Permissions: ${JSON.stringify(permissions)}`
    ].join('\n');
    
    return message;
  }

  /**
   * Update delegation with signature
   */
  async activateDelegation(delegationId: string): Promise<AccountDelegation> {
    const delegation = await prisma.accountDelegation.update({
      where: { id: delegationId },
      data: {
        isActive: true,
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
    if (delegation.expiresAt && new Date() > delegation.expiresAt) {
      await prisma.accountDelegation.update({
        where: { id: delegationId },
        data: { isActive: false }
      });
      return false;
    }
    
    // Check if revoked
    if (delegation.revokedAt) {
      return false;
    }
    
    return delegation.isActive;
  }

  /**
   * Get active delegations for a linked account
   */
  async getActiveDelegations(linkedAccountId: string): Promise<AccountDelegation[]> {
    const delegations = await prisma.accountDelegation.findMany({
      where: {
        linkedAccountId,
        isActive: true,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } }
        ]
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
        isActive: false,
        revokedAt: new Date(),
        updatedAt: new Date()
      }
    });
    
    return delegation;
  }
}

export const accountDelegationService = new AccountDelegationService();