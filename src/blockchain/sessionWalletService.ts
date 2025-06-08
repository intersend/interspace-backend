import { P1Keygen, P2Keygen, P1Signer, P2Signer, generateSessionId } from '@com.silencelaboratories/two-party-ecdsa-js';
import { SigpairAdmin } from 'sigpair-admin-v2';
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
  private admin: SigpairAdmin;
  private shares: Map<string, KeyShareRecord> = new Map();
  private providers: Map<number, JsonRpcProvider> = new Map();

  constructor() {
    this.admin = new SigpairAdmin(config.SILENCE_ADMIN_TOKEN, config.SILENCE_NODE_URL);
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

  /**
   * Create a new MPC session wallet for a profile using Silence Labs SDK
   */
  async createSessionWallet(profileId: string): Promise<{ address: string }> {
    const sessionId = await generateSessionId();
    const p1 = await P1Keygen.init(sessionId);
    const p2 = await P2Keygen.init(sessionId);

    const msg2 = await p2.processMsg1(await p1.genMsg1());
    const [p1share, msg3] = await p1.processMsg2(msg2);
    const p2share = await p2.processMsg3(msg3);

    const address = this.publicKeyToAddress(p1share.publicKey);

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
    const sessionId = await generateSessionId();
    const p1Sign = await P1Signer.init(sessionId, record.p1, messageHash, 'm');
    const p2Sign = await P2Signer.init(sessionId, record.p2, messageHash, 'm');
    const signmsg2 = await p2Sign.processMsg1(await p1Sign.genMsg1());
    const signmsg3 = await p1Sign.processMsg2(signmsg2);
    const sign1 = signmsg3.sign;
    const sign2 = await p2Sign.processMsg3(signmsg3);
    if (sign1 !== sign2) throw new Error('Signatures do not match');
    return sign1;
  }

  private publicKeyToAddress(pubKey: string): string {
    const bytes = ethers.getBytes(pubKey.startsWith('0x') ? pubKey : `0x${pubKey}`);
    const hash = ethers.keccak256(bytes.slice(1));
    return '0x' + hash.slice(-40);
  }
}

export const sessionWalletService = new SessionWalletService();
