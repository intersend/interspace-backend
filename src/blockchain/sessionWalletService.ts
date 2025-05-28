import { createThirdwebClient } from 'thirdweb';
import { inAppWallet } from 'thirdweb/wallets';
import { 
  ethereum, 
  polygon, 
  arbitrum, 
  optimism, 
  base,
  sepolia,
  polygonMumbai,
  arbitrumSepolia,
  optimismSepolia,
  baseSepolia
} from 'thirdweb/chains';
import { config } from '@/utils/config';
import { ChainConfig } from '@/types';

export class SessionWalletService {
  private client: any;
  private chainConfigs: Map<number, any>;

  constructor() {
    this.client = createThirdwebClient({
      clientId: config.THIRDWEB_CLIENT_ID,
      secretKey: config.THIRDWEB_SECRET_KEY,
    });

    // Initialize supported chains (both mainnet and testnet)
    this.chainConfigs = new Map([
      // Mainnets
      [1, ethereum],
      [137, polygon], 
      [42161, arbitrum],
      [10, optimism],
      [8453, base],
      // Testnets
      [11155111, sepolia],
      [80001, polygonMumbai],
      [421614, arbitrumSepolia],
      [11155420, optimismSepolia],
      [84532, baseSepolia]
    ]);
  }

  /**
   * Create a new inApp wallet with EIP-7702 for a profile
   */
  async createSessionWallet(
    profileId: string,
    chainId: number = config.DEFAULT_CHAIN_ID
  ): Promise<{ address: string; wallet: any }> {
    const chain = this.chainConfigs.get(chainId);
    if (!chain) {
      throw new Error(`Unsupported chain ID: ${chainId}`);
    }

    try {
      // Create inApp wallet with EIP-7702 for session wallet functionality
      const wallet = inAppWallet({
        executionMode: {
          mode: "EIP7702",
          sponsorGas: true, // Enable gas sponsoring for seamless UX
        },
      });

      // Connect with backend strategy using profileId as stable secret
      const account = await wallet.connect({
        client: this.client,
        chain: chain, // Required for EIP-7702 execution
        strategy: "backend",
        walletSecret: `interspace_profile_${profileId}`, // Stable secret per profile
      });

      return {
        address: account.address,
        wallet: wallet
      };

    } catch (error) {
      console.error('Session wallet creation failed:', error);
      throw new Error(`Failed to create session wallet: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get or create session wallet for a profile
   */
  async getSessionWallet(profileId: string, chainId: number = config.DEFAULT_CHAIN_ID) {
    return this.createSessionWallet(profileId, chainId);
  }

  /**
   * Execute a transaction through a session wallet
   */
  async executeTransaction(
    profileId: string,
    targetAddress: string,
    value: string,
    data: string,
    chainId: number
  ): Promise<string> {
    const chain = this.chainConfigs.get(chainId);
    if (!chain) {
      throw new Error(`Unsupported chain ID: ${chainId}`);
    }

    try {
      const { wallet } = await this.getSessionWallet(profileId, chainId);
      
      // Execute transaction using Thirdweb wallet
      // @ts-ignore - Thirdweb transaction execution
      const txResult = await wallet.sendTransaction({
        to: targetAddress,
        value: BigInt(value),
        data: data,
        chain: chain
      });

      console.log('Transaction executed:', {
        profileId,
        target: targetAddress,
        value,
        chainId,
        txHash: txResult.transactionHash
      });

      return txResult.transactionHash;

    } catch (error) {
      console.error('Transaction execution failed:', error);
      throw new Error(`Failed to execute transaction: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Execute ERC-20 token transfer through session wallet
   */
  async executeTokenTransfer(
    profileId: string,
    tokenAddress: string,
    toAddress: string,
    amount: string,
    chainId: number
  ): Promise<string> {
    const chain = this.chainConfigs.get(chainId);
    if (!chain) {
      throw new Error(`Unsupported chain ID: ${chainId}`);
    }

    try {
      const { wallet } = await this.getSessionWallet(profileId, chainId);
      
      // Create ERC-20 transfer data
      const transferData = this.encodeERC20Transfer(toAddress, amount);
      
      // @ts-ignore - Thirdweb transaction execution
      const txResult = await wallet.sendTransaction({
        to: tokenAddress,
        value: 0n,
        data: transferData,
        chain: chain
      });

      console.log('Token transfer executed:', {
        profileId,
        token: tokenAddress,
        to: toAddress,
        amount,
        chainId,
        txHash: txResult.transactionHash
      });

      return txResult.transactionHash;

    } catch (error) {
      console.error('Token transfer failed:', error);
      throw new Error(`Failed to execute token transfer: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Execute batch transactions through session wallet
   */
  async executeBatchTransactions(
    profileId: string,
    calls: Array<{
      target: string;
      value: string;
      data: string;
    }>,
    chainId: number
  ): Promise<string[]> {
    const chain = this.chainConfigs.get(chainId);
    if (!chain) {
      throw new Error(`Unsupported chain ID: ${chainId}`);
    }

    try {
      const { wallet } = await this.getSessionWallet(profileId, chainId);
      
      const txHashes: string[] = [];
      
      // Execute transactions sequentially
      for (const call of calls) {
        // @ts-ignore - Thirdweb transaction execution
        const txResult = await wallet.sendTransaction({
          to: call.target,
          value: BigInt(call.value),
          data: call.data,
          chain: chain
        });
        
        txHashes.push(txResult.transactionHash);
      }

      console.log('Batch transactions executed:', {
        profileId,
        callsCount: calls.length,
        chainId,
        txHashes
      });

      return txHashes;

    } catch (error) {
      console.error('Batch transaction failed:', error);
      throw new Error(`Failed to execute batch transactions: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get supported chains
   */
  getSupportedChains(): ChainConfig[] {
    return Array.from(this.chainConfigs.entries()).map(([chainId, chain]) => ({
      chainId,
      name: chain.name,
      rpcUrls: chain.rpc || [],
      nativeCurrency: {
        name: chain.nativeCurrency?.name || 'ETH',
        symbol: chain.nativeCurrency?.symbol || 'ETH',
        decimals: chain.nativeCurrency?.decimals || 18,
      },
      blockExplorerUrls: chain.blockExplorers?.map((explorer: any) => explorer.url) || [],
      isTestnet: chain.testnet || false,
    }));
  }

  /**
   * Validate session wallet address format
   */
  isValidSessionWalletAddress(address: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }

  /**
   * Get transaction routing info for display
   */
  getTransactionRouting(
    sourceEOA: string,
    sessionWallet: string,
    targetApp: string
  ): {
    route: string;
    steps: Array<{
      from: string;
      to: string;
      description: string;
    }>;
  } {
    return {
      route: `${sourceEOA} → ${sessionWallet} → ${targetApp}`,
      steps: [
        {
          from: sourceEOA,
          to: sessionWallet,
          description: 'User initiates transaction via Session Wallet'
        },
        {
          from: sessionWallet,
          to: targetApp,
          description: 'Session Wallet (EIP-7702) executes transaction to dApp'
        }
      ]
    };
  }

  /**
   * Check if session wallet exists for profile
   */
  async isSessionWalletDeployed(profileId: string, chainId: number): Promise<boolean> {
    try {
      const { address } = await this.getSessionWallet(profileId, chainId);
      return this.isValidSessionWalletAddress(address);
    } catch (error) {
      return false;
    }
  }

  /**
   * Get session wallet address for a profile
   */
  async getSessionWalletAddress(profileId: string, chainId: number = config.DEFAULT_CHAIN_ID): Promise<string> {
    const { address } = await this.getSessionWallet(profileId, chainId);
    return address;
  }

  /**
   * Encode ERC-20 transfer function call
   */
  private encodeERC20Transfer(to: string, amount: string): string {
    // ERC-20 transfer function signature: transfer(address,uint256)
    const functionSignature = '0xa9059cbb';
    
    // Pad address to 32 bytes
    const paddedTo = to.replace('0x', '').padStart(64, '0');
    
    // Pad amount to 32 bytes (assuming amount is already in wei/smallest unit)
    const paddedAmount = BigInt(amount).toString(16).padStart(64, '0');
    
    return `${functionSignature}${paddedTo}${paddedAmount}`;
  }

  /**
   * Get wallet instance for a profile (for advanced usage)
   */
  async getWalletInstance(profileId: string, chainId: number = config.DEFAULT_CHAIN_ID) {
    const { wallet } = await this.getSessionWallet(profileId, chainId);
    return wallet;
  }
}

export const sessionWalletService = new SessionWalletService();
