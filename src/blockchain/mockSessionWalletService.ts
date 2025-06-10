import crypto from 'crypto';

export class MockSessionWalletService {
  private wallets: Map<string, string> = new Map();
  private txCounter = 0;

  private generateAddress(profileId: string): string {
    const hash = crypto.createHash('sha256').update(profileId).digest('hex');
    return '0x' + hash.slice(0, 40);
  }

  async createSessionWallet(profileId: string, _clientShare: any): Promise<{ address: string }> {
    const address = this.generateAddress(profileId);
    this.wallets.set(profileId, address);
    return { address };
  }

  async rotateSessionWallet(profileId: string): Promise<{ clientShare: any }> {
    // return deterministic client share based on profile id
    const shareHash = crypto.createHash('sha256').update('share-' + profileId).digest('hex');
    return { clientShare: { id: shareHash } };
  }

  async getSessionWalletAddress(profileId: string): Promise<string> {
    if (!this.wallets.has(profileId)) {
      const address = this.generateAddress(profileId);
      this.wallets.set(profileId, address);
    }
    return this.wallets.get(profileId)!;
  }

  async executeTransaction(
    profileId: string,
    targetAddress: string,
    value: string,
    data: string,
    chainId: number
  ): Promise<string> {
    const hashInput = `${profileId}-${targetAddress}-${value}-${data}-${chainId}-${this.txCounter++}`;
    const txHash = crypto.createHash('sha256').update(hashInput).digest('hex');
    return '0x' + txHash.slice(0, 64);
  }

  isSessionWalletDeployed(profileId: string): boolean {
    return this.wallets.has(profileId);
  }
}

export const mockSessionWalletService = new MockSessionWalletService();
