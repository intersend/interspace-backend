import { ethers, verifyMessage } from 'ethers';
import { SiweMessage } from 'siwe';
import crypto from 'crypto';

/**
 * Test wallet infrastructure for SIWE authentication testing
 * Provides deterministic wallets with known private keys for testing
 */
export class TestWallet {
  private wallet: ethers.Wallet;
  private provider: ethers.JsonRpcProvider;

  /**
   * Predefined test wallets with known private keys
   * WARNING: These are for testing only, never use in production!
   */
  static readonly TEST_WALLETS = {
    primary: {
      address: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fA49',
      privateKey: '0x4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318'
    },
    secondary: {
      address: '0x821aEa9a577a9b44299B9c15c88cf3087F3b5544',
      privateKey: '0x4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362319'
    },
    tertiary: {
      address: '0x0d1d4e623D10F9FBA5Db95830F7d3839406C6AF2',
      privateKey: '0x4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362320'
    }
  };

  constructor(privateKeyOrIndex: string | number = 0) {
    // Create provider (using local node or mainnet for testing)
    this.provider = new ethers.JsonRpcProvider(
      process.env.TEST_RPC_URL || 'http://localhost:8545'
    );

    // Create wallet from private key or index
    if (typeof privateKeyOrIndex === 'number') {
      const wallets = Object.values(TestWallet.TEST_WALLETS);
      const walletData = wallets[privateKeyOrIndex % wallets.length];
      if (!walletData) {
        throw new Error(`Invalid wallet index: ${privateKeyOrIndex}`);
      }
      this.wallet = new ethers.Wallet(walletData.privateKey, this.provider);
    } else {
      this.wallet = new ethers.Wallet(privateKeyOrIndex, this.provider);
    }
  }

  /**
   * Get wallet address
   */
  get address(): string {
    return this.wallet.address;
  }

  /**
   * Create a deterministic test wallet from seed
   */
  static fromSeed(seed: string): TestWallet {
    const hash = crypto.createHash('sha256').update(seed).digest('hex');
    const privateKey = '0x' + hash;
    return new TestWallet(privateKey);
  }

  /**
   * Generate a valid SIWE message
   */
  async generateSiweMessage(params: {
    domain?: string;
    statement?: string;
    uri?: string;
    chainId?: number;
    nonce?: string;
    expirationTime?: Date;
    resources?: string[];
  } = {}): Promise<string> {
    const siweMessage = new SiweMessage({
      domain: params.domain || 'localhost:3000',
      address: this.wallet.address,
      statement: params.statement || 'Sign in with Ethereum to Interspace',
      uri: params.uri || 'http://localhost:3000',
      version: '1',
      chainId: params.chainId || 1,
      nonce: params.nonce || crypto.randomBytes(16).toString('hex'),
      issuedAt: new Date().toISOString(),
      expirationTime: params.expirationTime?.toISOString(),
      resources: params.resources
    });

    return siweMessage.prepareMessage();
  }

  /**
   * Sign a SIWE message
   */
  async signMessage(message: string): Promise<string> {
    return await this.wallet.signMessage(message);
  }

  /**
   * Generate a complete SIWE authentication payload
   */
  async generateAuthPayload(params: {
    domain?: string;
    chainId?: number;
    nonce?: string;
    walletType?: string;
  } = {}): Promise<{
    walletAddress: string;
    message: string;
    signature: string;
    walletType: string;
    chainId: number;
  }> {
    const message = await this.generateSiweMessage({
      domain: params.domain,
      chainId: params.chainId,
      nonce: params.nonce
    });

    const signature = await this.signMessage(message);

    return {
      walletAddress: this.wallet.address,
      message,
      signature,
      walletType: params.walletType || 'metamask',
      chainId: params.chainId || 1
    };
  }

  /**
   * Sign a transaction (for future transaction testing)
   */
  async signTransaction(transaction: ethers.TransactionRequest): Promise<string> {
    return await this.wallet.signTransaction(transaction);
  }

  /**
   * Get wallet balance (for testing)
   */
  async getBalance(): Promise<bigint> {
    return await this.provider.getBalance(this.wallet.address);
  }

  /**
   * Create multiple test wallets
   */
  static createMultipleWallets(count: number): TestWallet[] {
    return Array.from({ length: count }, (_, i) => new TestWallet(i));
  }

  /**
   * Generate an invalid signature (for negative testing)
   */
  static generateInvalidSignature(): string {
    return '0x' + crypto.randomBytes(65).toString('hex');
  }

  /**
   * Generate an expired SIWE message
   */
  async generateExpiredSiweMessage(params: {
    domain?: string;
    nonce?: string;
  } = {}): Promise<string> {
    const expiredTime = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
    
    return await this.generateSiweMessage({
      ...params,
      expirationTime: expiredTime
    });
  }

  /**
   * Generate a SIWE message with wrong domain
   */
  async generateWrongDomainMessage(params: {
    actualDomain: string;
    nonce?: string;
  }): Promise<string> {
    return await this.generateSiweMessage({
      ...params,
      domain: 'evil.com' // Wrong domain
    });
  }

  /**
   * Test wallet utilities
   */
  static utils = {
    /**
     * Verify a SIWE message and signature
     */
    async verifySiweMessage(message: string, signature: string): Promise<{
      valid: boolean;
      address?: string;
      error?: string;
    }> {
      try {
        const siweMessage = new SiweMessage(message);
        const recovered = verifyMessage(message, signature);
        
        if (recovered.toLowerCase() !== siweMessage.address.toLowerCase()) {
          return { valid: false, error: 'Address mismatch' };
        }

        // Check expiration
        if (siweMessage.expirationTime && new Date(siweMessage.expirationTime) < new Date()) {
          return { valid: false, error: 'Message expired' };
        }

        return { valid: true, address: recovered };
      } catch (error: any) {
        return { valid: false, error: error.message || 'Unknown error' };
      }
    },

    /**
     * Generate a malformed SIWE message
     */
    generateMalformedMessage(): string {
      return 'This is not a valid SIWE message format';
    },

    /**
     * Generate test transaction data
     */
    generateTestTransaction(): ethers.TransactionRequest {
      return {
        to: TestWallet.TEST_WALLETS.secondary.address,
        value: ethers.parseEther('0.01'),
        data: '0x',
        chainId: 1
      };
    }
  };
}

/**
 * Helper function to get a test wallet quickly
 */
export function getTestWallet(index: number = 0): TestWallet {
  return new TestWallet(index);
}

/**
 * Helper to create wallet auth payload
 */
export async function createWalletAuthPayload(
  walletIndex: number = 0,
  params: any = {}
): Promise<any> {
  const wallet = getTestWallet(walletIndex);
  return await wallet.generateAuthPayload(params);
}