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

interface KeyShareRecord {
  p1: any;
  p2: any;
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
      const p2 = await mpcKeyShareService.getKeyShare(profileId);
      if (!p2) throw new Error('Key share not found');
      const address = this.publicKeyToAddress(p2.public_key);
      record = { p1: null, p2, address };
      this.shares.set(profileId, record);
    }
    return record;
  }

  private async getProvider(profileId: string, chainId: number): Promise<OrbyProvider> {
    const key = `${profileId}-${chainId}`;
    if (this.providers.has(key)) {
      return this.providers.get(key)!;
    }

    const profile = await prisma.smartProfile.findUnique({ where: { id: profileId } });
    if (!profile) {
      throw new Error('Profile not found');
    }

    const rpcUrl = await orbyService.getVirtualNodeRpcUrl(profile, chainId);
    const provider = new OrbyProvider(rpcUrl);
    
    this.providers.set(key, provider);
    return provider;
  }

  private async generateSessionId(): Promise<string> {
    const bytes = await randBytes(32);
    return Buffer.from(bytes).toString('hex');
  }

  /**
   * Create a new MPC session wallet for a profile using Silence Labs SDK
   */
  async createSessionWallet(profileId: string, clientShare: any): Promise<{ address: string }> {
    const sessionId = await this.generateSessionId();
    const x1 = await randBytes(32);
    const x2 = await randBytes(32);

    const p1 = new P1KeyGen(sessionId, x1);
    await p1.init();
    const p2 = new P2KeyGen(sessionId, x2);

    const msg1 = await p1.processMessage(null);
    const msg2 = await p2.processMessage(msg1.msg_to_send);
    const msg3 = await p1.processMessage(msg2.msg_to_send);
    const msg4 = await p2.processMessage(msg3.msg_to_send);
    const p2share = msg4.p2_key_share;

    if (!clientShare || !clientShare.public_key || !p2share) {
      throw new Error('Failed to generate key shares');
    }

    const address = this.publicKeyToAddress(clientShare.public_key);

    this.shares.set(profileId, { p1: clientShare, p2: p2share, address });
    await mpcKeyShareService.updateKeyShare(profileId, p2share);

    return { address };
  }

  /**
   * Rotate the MPC key shares for a profile using Silence Labs key refresh.
   * The public key remains the same but both client and server shares are updated.
   */
  async rotateSessionWallet(profileId: string): Promise<{ clientShare: any }> {
    const record = await this.ensureShareLoaded(profileId);

    if (!record.p1) {
      throw new Error('Client share not loaded for this profile');
    }

    const sessionId = await this.generateSessionId();
    const p1 = P1KeyGen.getInstanceForKeyRefresh(sessionId, record.p1);
    await p1.init();
    const p2 = P2KeyGen.getInstanceForKeyRefresh(sessionId, record.p2);

    const msg1 = await p1.processMessage(null);
    const msg2 = await p2.processMessage(msg1.msg_to_send);
    const msg3 = await p1.processMessage(msg2.msg_to_send);
    const newP1 = msg3.p1_key_share;
    const msg4 = await p2.processMessage(msg3.msg_to_send);
    const newP2 = msg4.p2_key_share;

    if (!newP1 || !newP2) {
      throw new Error('Failed to refresh key shares');
    }

    record.p1 = newP1;
    record.p2 = newP2;
    this.shares.set(profileId, record);

    await mpcKeyShareService.updateKeyShare(profileId, newP2);

    return { clientShare: newP1 };
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
        value: BigInt(value),
        status: 'pending'
      }
    });

    return response.hash;
  }

  async signMessage(profileId: string, messageHash: Uint8Array): Promise<string> {
    const record = await this.ensureShareLoaded(profileId);

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
