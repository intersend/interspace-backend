import {
  P1KeyGen,
  P2KeyGen,
  P1Signature,
  P2Signature,
  randBytes
} from '@silencelaboratories/ecdsa-tss';
import { ethers, Signature, Transaction } from 'ethers';
import { OrbyProvider } from '@orb-labs/orby-ethers6';
import { prisma } from '@/utils/database';
import { mpcKeyShareService } from '@/services/mpcKeyShareService';
import { orbyService } from '@/services/orbyService';
import { config } from '@/utils/config';

interface KeyShareRecord {
  keyId: string;
  p2: any;
  publicKey: string;
  address: string;
}

export class SessionWalletService {
  private shares: Map<string, KeyShareRecord> = new Map();
  private providers: Map<string, OrbyProvider> = new Map();

  constructor() {
  }


  private async ensureShareLoaded(profileId: string): Promise<KeyShareRecord> {
    let record = this.shares.get(profileId);
    if (!record) {
      const keyShare = await mpcKeyShareService.getKeyShare(profileId);
      if (!keyShare) throw new Error('Key share not found');
      
      const publicKey = keyShare.publicKey;
      const address = keyShare.address;
      
      record = { 
        keyId: keyShare.keyId,
        p2: keyShare.keyShare, // The encrypted P2 share
        publicKey,
        address 
      };
      this.shares.set(profileId, record);
    }
    return record;
  }

  private async getProvider(profileId: string, chainId: number): Promise<OrbyProvider> {
    const key = `${profileId}-${chainId}`;
    if (this.providers.has(key)) {
      return this.providers.get(key)!;
    }

    const profile = await prisma.smartProfile.findUnique({ 
      where: { id: profileId },
      include: { linkedAccounts: { where: { isActive: true } } }
    });
    if (!profile) {
      throw new Error('Profile not found');
    }

    // Create fresh cluster and get RPC URL
    const clusterId = await orbyService.createFreshAccountCluster(profile);
    const rpcUrl = await orbyService.getVirtualNodeRpcUrl(clusterId, chainId, profile.sessionWalletAddress);
    const provider = new OrbyProvider(rpcUrl);
    
    this.providers.set(key, provider);
    return provider;
  }

  private async generateSessionId(): Promise<string> {
    const bytes = await randBytes(32);
    return Buffer.from(bytes).toString('hex');
  }

  /**
   * Create a new MPC session wallet for a profile
   * This should be called after the client has generated P1 and communicated with duo-node
   * The P2 share and public key are already stored in the database
   */
  async createSessionWallet(profileId: string, keyId: string, publicKey: string, p2Share: any): Promise<{ address: string }> {
    // Calculate address from public key
    const address = this.publicKeyToAddress(publicKey);

    // Cache the key share record
    this.shares.set(profileId, { 
      keyId,
      p2: p2Share, 
      publicKey,
      address 
    });

    // P2 share is already stored in the database by duo-node
    // Just return the address
    return { address };
  }

  /**
   * Rotate the MPC key shares for a profile using Silence Labs key refresh.
   * This requires coordination with the client through duo-node
   */
  async rotateSessionWallet(profileId: string): Promise<{ keyId: string }> {
    // In production, key rotation would:
    // 1. Client initiates refresh through duo-node
    // 2. P1 and P2 exchange refresh messages via WebSocket
    // 3. Both sides update their shares
    // 4. Public key remains the same
    
    throw new Error('Key rotation must be initiated by the client through duo-node');
  }

  async getSessionWalletAddress(profileId: string): Promise<string> {
    const record = await this.ensureShareLoaded(profileId);
    return record.address;
  }

  isSessionWalletDeployed(profileId: string): boolean {
    return this.shares.has(profileId);
  }

  getTransactionRouting(sourceEOA: string, sessionWallet: string, targetApp: string) {
    return {
      route: `${sourceEOA} → ${sessionWallet} → ${targetApp}`,
      steps: [
        { from: sourceEOA, to: sessionWallet, description: 'User initiates transaction' },
        { from: sessionWallet, to: targetApp, description: 'Session wallet executes transaction' }
      ]
    };
  }

  async executeTransaction(
    profileId: string,
    targetAddress: string,
    value: string,
    data: string,
    chainId: number
  ): Promise<string> {
    const record = await this.ensureShareLoaded(profileId);

    const provider = await this.getProvider(profileId, chainId);

    // @ts-ignore - OrbyProvider extends JsonRpcProvider but TS doesn't recognize it
    const nonce = await provider.getTransactionCount(record.address);
    // @ts-ignore - OrbyProvider extends JsonRpcProvider but TS doesn't recognize it
    const feeData = await provider.getFeeData();

    const txParams = {
      type: 2,
      chainId,
      to: targetAddress,
      value: BigInt(value),
      data,
      nonce,
      // @ts-ignore - OrbyProvider extends JsonRpcProvider but TS doesn't recognize it
      gasLimit: await provider.estimateGas({
        to: targetAddress,
        from: record.address,
        data,
        value: BigInt(value)
      }),
      maxFeePerGas: feeData.maxFeePerGas ?? undefined,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? undefined
    };

    // @ts-ignore - Transaction type/value conflict
    const tx = Transaction.from(txParams);
    const messageHash = tx.unsignedHash;
    // @ts-ignore - ethers v6 module resolution issue
    const signature = await this.signMessage(profileId, ethers.getBytes(messageHash));
    // @ts-ignore - Signature type/value conflict
    tx.signature = Signature.from(signature);

    const serialized = tx.serialized;
    // @ts-ignore - OrbyProvider type definition issue
    const response = await provider.broadcastTransaction(serialized);

    await prisma.transaction.create({
      data: {
        profileId,
        hash: response.hash,
        chainId,
        fromAddress: record.address,
        toAddress: targetAddress,
        value: BigInt(value),
        status: 'pending'
      }
    });

    return response.hash;
  }

  async signMessage(profileId: string, messageHash: Uint8Array): Promise<string> {
    // In production, signing should happen through duo-node:
    // 1. Backend requests signature from duo-node
    // 2. Duo-node coordinates with client for P1 signature
    // 3. Duo-node uses P2 share to complete signature
    // 4. Returns final signature to backend
    
    // For now, throw an error indicating the proper flow
    throw new Error('Signing must be done through duo-node WebSocket connection with client participation');
  }

  private publicKeyToAddress(pubKey: string): string {
    // @ts-ignore - ethers v6 module resolution issue
    const bytes = ethers.getBytes(pubKey.startsWith('0x') ? pubKey : `0x${pubKey}`);
    // @ts-ignore - ethers v6 module resolution issue
    const hash = ethers.keccak256(bytes.slice(1));
    return '0x' + hash.slice(-40);
  }

  /**
   * Execute a transaction using EIP-7702 delegation
   * This allows the session wallet to execute transactions on behalf of a delegated EOA
   */
  async executeTransactionWithDelegation(
    profileId: string,
    delegatedEOA: string,
    targetAddress: string,
    value: string,
    data: string,
    chainId: number
  ): Promise<string> {
    // In a real EIP-7702 implementation, this would:
    // 1. Build a transaction that uses the delegated EOA's authority
    // 2. The delegated EOA would have its code pointer set to the session wallet implementation
    // 3. The transaction would execute with the EOA's context but session wallet's logic
    
    // For now, we execute through the session wallet with special delegation context
    // This is a placeholder until EIP-7702 is fully available on networks
    
    console.log(`Executing delegated transaction from ${delegatedEOA} via session wallet`);
    
    // Get the session wallet's signing capability
    const record = await this.ensureShareLoaded(profileId);
    const provider = await this.getProvider(profileId, chainId);
    
    // In production with EIP-7702:
    // - The transaction would be sent FROM the delegated EOA
    // - But signed by the session wallet's MPC keys
    // - The EOA's code would point to our delegation contract
    
    // For now, we execute a regular transaction and track it as delegated
    // @ts-ignore - OrbyProvider extends JsonRpcProvider but TS doesn't recognize it
    const nonce = await provider.getTransactionCount(record.address);
    // @ts-ignore - OrbyProvider extends JsonRpcProvider but TS doesn't recognize it
    const feeData = await provider.getFeeData();
    
    const txParams = {
      type: 2,
      chainId,
      from: record.address, // In EIP-7702, this would be the delegated EOA
      to: targetAddress,
      value: BigInt(value),
      data,
      nonce,
      // @ts-ignore - OrbyProvider extends JsonRpcProvider but TS doesn't recognize it
      gasLimit: await provider.estimateGas({
        to: targetAddress,
        from: record.address,
        data,
        value: BigInt(value)
      }),
      maxFeePerGas: feeData.maxFeePerGas ?? undefined,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? undefined
    };
    
    // @ts-ignore - Transaction type/value conflict
    const tx = Transaction.from(txParams);
    const messageHash = tx.unsignedHash;
    // @ts-ignore - ethers v6 module resolution issue
    const signature = await this.signMessage(profileId, ethers.getBytes(messageHash));
    // @ts-ignore - Signature type/value conflict
    tx.signature = Signature.from(signature);
    
    const serialized = tx.serialized;
    // @ts-ignore - OrbyProvider type definition issue
    const response = await provider.broadcastTransaction(serialized);
    
    // Track this as a delegated transaction
    await prisma.transaction.create({
      data: {
        profileId,
        hash: response.hash,
        chainId,
        fromAddress: record.address,
        toAddress: targetAddress,
        value: BigInt(value),
        input: data || null,
        gasPrice: feeData.gasPrice ? BigInt(feeData.gasPrice.toString()) : null,
        status: 'pending',
        routingType: 'delegated', // Mark as delegated
        sourceAccount: delegatedEOA // Track the delegated EOA
      }
    });
    
    return response.hash;
  }
}

export const sessionWalletService = new SessionWalletService();
