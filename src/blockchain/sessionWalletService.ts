import { P1Keygen, P2Keygen, P1Signer, P2Signer, generateSessionId } from '@com.silencelaboratories/two-party-ecdsa-js';
import { SigpairAdmin } from 'sigpair-admin-v2';
import { config } from '@/utils/config';
import { prisma } from '@/utils/database';

interface KeyShareRecord {
  p1: any;
  p2: any;
  address: string;
}

export class SessionWalletService {
  private admin: SigpairAdmin;
  private shares: Map<string, KeyShareRecord> = new Map();

  constructor() {
    this.admin = new SigpairAdmin(config.SILENCE_ADMIN_TOKEN, config.SILENCE_NODE_URL);
  }

  /**
   * Create a new MPC session wallet for a profile using Silence Labs SDK
   */
  async createSessionWallet(profileId: string): Promise<{ address: string; token: string }> {
    const sessionId = await generateSessionId();
    const p1 = await P1Keygen.init(sessionId);
    const p2 = await P2Keygen.init(sessionId);

    const msg2 = await p2.processMsg1(await p1.genMsg1());
    const [p1share, msg3] = await p1.processMsg2(msg2);
    const p2share = await p2.processMsg3(msg3);

    const address = this.publicKeyToAddress(p1share.publicKey);

    // Persist shares to database
    await prisma.mpcKeyShare.upsert({
      where: { profileId },
      update: {
        p1Share: JSON.stringify(p1share),
        p2Share: JSON.stringify(p2share)
      },
      create: {
        profileId,
        p1Share: JSON.stringify(p1share),
        p2Share: JSON.stringify(p2share)
      }
    });

    // Cache in memory for fast access
    this.shares.set(profileId, { p1: p1share, p2: p2share, address });

    // Generate user token for Silence Labs node authentication
    const token = await this.admin.genUserToken(profileId);

    return { address, token };
  }

  async getSessionWalletAddress(profileId: string): Promise<string> {
    const record = await this.loadShares(profileId);
    return record.address;
  }

  async isSessionWalletDeployed(profileId: string): Promise<boolean> {
    if (this.shares.has(profileId)) return true;
    const count = await prisma.mpcKeyShare.count({ where: { profileId } });
    return count > 0;
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
    _chainId: number
  ): Promise<string> {
    const hash = await this.signMessage(profileId, new Uint8Array());
    // In real implementation, signed tx would be broadcast here
    return hash;
  }

  async signMessage(profileId: string, messageHash: Uint8Array): Promise<string> {
    const { p1Sign, p2Sign } = await this.getSigners(profileId, messageHash);
    const signmsg2 = await p2Sign.processMsg1(await p1Sign.genMsg1());
    const signmsg3 = await p1Sign.processMsg2(signmsg2);
    const sign1 = signmsg3.sign;
    const sign2 = await p2Sign.processMsg3(signmsg3);
    if (sign1 !== sign2) throw new Error('Signatures do not match');
    return sign1;
  }

  private async loadShares(profileId: string): Promise<KeyShareRecord> {
    if (this.shares.has(profileId)) {
      return this.shares.get(profileId)!;
    }

    const record = await prisma.mpcKeyShare.findUnique({ where: { profileId } });
    if (!record) {
      throw new Error('Session wallet not created');
    }

    const p1 = JSON.parse(record.p1Share);
    const p2 = JSON.parse(record.p2Share);
    const address = this.publicKeyToAddress(p1.publicKey);

    const loaded = { p1, p2, address };
    this.shares.set(profileId, loaded);
    return loaded;
  }

  private async getSigners(profileId: string, messageHash: Uint8Array): Promise<{ p1Sign: any; p2Sign: any }> {
    const shares = await this.loadShares(profileId);
    const sessionId = await generateSessionId();
    const p1Sign = await P1Signer.init(sessionId, shares.p1, messageHash, 'm');
    const p2Sign = await P2Signer.init(sessionId, shares.p2, messageHash, 'm');
    return { p1Sign, p2Sign };
  }

  async getUserToken(profileId: string): Promise<string> {
    return this.admin.genUserToken(profileId);
  }

  private publicKeyToAddress(pubKey: string): string {
    return '0x' + pubKey.slice(-40);
  }
}

export const sessionWalletService = new SessionWalletService();
