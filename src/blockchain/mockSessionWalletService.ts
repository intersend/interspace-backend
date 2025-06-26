import crypto from 'crypto';

export class MockSessionWalletService {
  private wallets: Map<string, string> = new Map();
  private txCounter = 0;

  private generateAddress(profileId: string): string {
    const hash = crypto.createHash('sha256').update(profileId).digest('hex');
    return '0x' + hash.slice(0, 40);
  }

  async createSessionWallet(profileId: string, _clientShare: any): Promise<{ address: string; clientShare?: any }> {
    const address = this.generateAddress(profileId);
    this.wallets.set(profileId, address);
    
    // Generate a mock clientShare for development
    const mockClientShare = {
      p1_key_share: {
        secret_share: crypto.createHash('sha256').update(`secret-${profileId}`).digest('hex'),
        public_key: crypto.createHash('sha256').update(`pubkey-${profileId}`).digest('hex').slice(0, 64)
      },
      public_key: crypto.createHash('sha256').update(`pubkey-${profileId}`).digest('hex').slice(0, 64),
      address: address
    };
    
    return { address, clientShare: mockClientShare };
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

  getTransactionRouting(sourceEOA: string, sessionWallet: string, targetApp: string) {
    return {
      route: `${sourceEOA} → ${sessionWallet} → ${targetApp}`,
      steps: [
        { from: sourceEOA, to: sessionWallet, description: 'User initiates transaction' },
        { from: sessionWallet, to: targetApp, description: 'Session wallet executes transaction' }
      ]
    };
  }

  async executeTransactionWithDelegation(
    profileId: string,
    delegatedEOA: string,
    targetAddress: string,
    value: string,
    data: string,
    chainId: number
  ): Promise<string> {
    // Mock implementation for development
    console.log(`[MOCK] Executing delegated transaction from ${delegatedEOA} via session wallet`);
    
    const hashInput = `delegated-${profileId}-${delegatedEOA}-${targetAddress}-${value}-${data}-${chainId}-${this.txCounter++}`;
    const txHash = crypto.createHash('sha256').update(hashInput).digest('hex');
    
    console.log(`[MOCK] Delegated transaction hash: 0x${txHash.slice(0, 64)}`);
    
    return '0x' + txHash.slice(0, 64);
  }
}

export const mockSessionWalletService = new MockSessionWalletService();
