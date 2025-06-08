import {
  P1KeyGen,
  P2KeyGen,
  P1Signature,
  P2Signature,
  randBytes
} from '@silencelaboratories/ecdsa-tss';
import { ethers, type JsonRpcProvider, Signature, Transaction } from 'ethers';
import { prisma } from '@/utils/database';
import { config } from '@/utils/config';
import { ethers } from 'ethers';

interface KeyShareRecord {
  p1: any;
  p2: any;
  address: string;
}

export class SessionWalletService {
  private shares: Map<string, KeyShareRecord> = new Map();
  private providers: Map<number, JsonRpcProvider> = new Map();

  constructor() {
  }

  private getProvider(chainId: number): JsonRpcProvider {
    if (this.providers.has(chainId)) {
      return this.providers.get(chainId)!;
    }

    const envVar =
      chainId === 1
        ? process.env.ETHEREUM_RPC_URL
        : chainId === 137
        ? process.env.POLYGON_RPC_URL
        : undefined;

    if (!envVar) {
      throw new Error(`RPC URL for chain ${chainId} not configured`);
    }

    const provider = new ethers.JsonRpcProvider(envVar, chainId);
    this.providers.set(chainId, provider);
    return provider;
  }

  private async generateSessionId(): Promise<string> {
    const bytes = await randBytes(32);
    return Buffer.from(bytes).toString('hex');
  }

  /**
   * Create a new MPC session wallet for a profile using Silence Labs SDK
   */
  async createSessionWallet(profileId: string): Promise<{ address: string }> {
    const sessionId = await this.generateSessionId();
    const x1 = await randBytes(32);
    const x2 = await randBytes(32);

    const p1 = new P1KeyGen(sessionId, x1);
    await p1.init();
    const p2 = new P2KeyGen(sessionId, x2);

    const msg1 = await p1.processMessage(null);
    const msg2 = await p2.processMessage(msg1.msg_to_send);
    const msg3 = await p1.processMessage(msg2.msg_to_send);
    const p1share = msg3.p1_key_share;
    const msg4 = await p2.processMessage(msg3.msg_to_send);
    const p2share = msg4.p2_key_share;

    if (!p1share || !p2share) {
      throw new Error('Failed to generate key shares');
    }

    const address = this.publicKeyToAddress(p1share.public_key);

    this.shares.set(profileId, { p1: p1share, p2: p2share, address });

    return { address };
  }

  async getSessionWalletAddress(profileId: string): Promise<string> {
    const record = this.shares.get(profileId);
    if (!record) throw new Error('Session wallet not created');
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
    const record = this.shares.get(profileId);
    if (!record) throw new Error('Session wallet not created');

    const provider = this.getProvider(chainId);

    const nonce = await provider.getTransactionCount(record.address);
    const feeData = await provider.getFeeData();

    const txParams = {
      type: 2,
      chainId,
      to: targetAddress,
      value: BigInt(value),
      data,
      nonce,
      gasLimit: await provider.estimateGas({
        to: targetAddress,
        from: record.address,
        data,
        value: BigInt(value)
      }),
      maxFeePerGas: feeData.maxFeePerGas ?? undefined,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? undefined
    };

    const tx = Transaction.from(txParams);
    const messageHash = tx.unsignedHash;
    const signature = await this.signMessage(profileId, ethers.getBytes(messageHash));
    tx.signature = Signature.from(signature);

    const serialized = tx.serialized;
    const response = await provider.broadcastTransaction(serialized);

    await prisma.transaction.create({
      data: {
        profileId,
        hash: response.hash,
        chainId,
        fromAddress: record.address,
        toAddress: targetAddress,
        value,
        status: 'pending'
      }
    });

    return response.hash;
  }

  async signMessage(profileId: string, messageHash: Uint8Array): Promise<string> {
    const record = this.shares.get(profileId);
    if (!record) throw new Error('Session wallet not created');

    const sessionId = await this.generateSessionId();
    const p1Sign = new P1Signature(sessionId, messageHash, record.p1);
    const p2Sign = new P2Signature(sessionId, messageHash, record.p2);

    const msg1 = await p1Sign.processMessage(null);
    const msg2 = await p2Sign.processMessage(msg1.msg_to_send);
    const msg3 = await p1Sign.processMessage(msg2.msg_to_send);
    const msg4 = await p2Sign.processMessage(msg3.msg_to_send);
    const msg5 = await p1Sign.processMessage(msg4.msg_to_send);
    const sig1 = msg5.signature;
    const msg6 = await p2Sign.processMessage(msg5.msg_to_send);
    const sig2 = msg6.signature;

    if (!sig1 || !sig2 || sig1 !== sig2) {
      throw new Error('Signatures do not match');
    }

    return sig1;
  }

  private publicKeyToAddress(pubKey: string): string {
    const bytes = ethers.getBytes(pubKey.startsWith('0x') ? pubKey : `0x${pubKey}`);
    const hash = ethers.keccak256(bytes.slice(1));
    return '0x' + hash.slice(-40);
  }
}

export const sessionWalletService = new SessionWalletService();
