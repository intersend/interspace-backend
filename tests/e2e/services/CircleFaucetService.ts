import axios, { AxiosInstance } from 'axios';
import { ethers } from 'ethers';
import { getTestnetByChainId, TestnetConfig } from '../config/testnet.config';

export interface FaucetDripRequest {
  address: string;
  blockchain: 'ETH-SEPOLIA' | 'MATIC-AMOY' | 'BASE-SEPOLIA' | 'ARB-SEPOLIA';
  native?: boolean;
  usdc?: boolean;
  eurc?: boolean;
}

export interface FaucetDripResponse {
  id: string;
  address: string;
  amounts: Array<{
    currency: string;
    amount: string;
  }>;
  status: 'pending' | 'complete' | 'failed';
  createDate: string;
}

export class CircleFaucetService {
  private client: AxiosInstance;
  private apiKey: string;
  
  constructor(apiKey?: string) {
    // Use provided API key or environment variable
    this.apiKey = apiKey || process.env.CIRCLE_TESTNET_API_KEY || 
      'TEST_API_KEY:5c6d501ce251c3ce83a1c875c138d57b:fe95fd62be223374a6a3b38fd9166d5a';
    
    this.client = axios.create({
      baseURL: 'https://api.circle.com/v1',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      timeout: 30000
    });
  }

  /**
   * Map chain ID to Circle blockchain identifier
   */
  private getBlockchainIdentifier(chainId: number): string {
    const mapping: Record<number, string> = {
      11155111: 'ETH-SEPOLIA',    // Ethereum Sepolia
      80002: 'MATIC-AMOY',         // Polygon Amoy
      84532: 'BASE-SEPOLIA',       // Base Sepolia
      421614: 'ARB-SEPOLIA'        // Arbitrum Sepolia
    };
    
    const blockchain = mapping[chainId];
    if (!blockchain) {
      throw new Error(`Unsupported chain ID for Circle faucet: ${chainId}`);
    }
    
    return blockchain;
  }

  /**
   * Request funds from Circle testnet faucet
   */
  async requestFunds(
    address: string,
    chainId: number,
    options: {
      native?: boolean;
      usdc?: boolean;
      eurc?: boolean;
    } = { native: true, usdc: true }
  ): Promise<FaucetDripResponse> {
    try {
      const blockchain = this.getBlockchainIdentifier(chainId);
      
      console.log(`🚰 Requesting funds from Circle faucet for ${address} on ${blockchain}`);
      
      const request: FaucetDripRequest = {
        address,
        blockchain: blockchain as any,
        native: options.native,
        usdc: options.usdc,
        eurc: options.eurc
      };
      
      const response = await this.client.post<FaucetDripResponse>('/faucet/drips', request);
      
      console.log(`✅ Faucet request submitted: ${response.data.id}`);
      console.log(`   Amounts:`, response.data.amounts);
      
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error('❌ Circle faucet error:', error.response?.data || error.message);
        
        // Handle rate limiting
        if (error.response?.status === 429) {
          throw new Error('Circle faucet rate limit exceeded. Please wait before requesting again.');
        }
        
        // Handle invalid address
        if (error.response?.status === 400) {
          throw new Error(`Invalid request: ${JSON.stringify(error.response.data)}`);
        }
      }
      throw error;
    }
  }

  /**
   * Check faucet drip status
   */
  async checkDripStatus(dripId: string): Promise<FaucetDripResponse> {
    try {
      const response = await this.client.get<FaucetDripResponse>(`/faucet/drips/${dripId}`);
      return response.data;
    } catch (error) {
      console.error('Failed to check drip status:', error);
      throw error;
    }
  }

  /**
   * Wait for funding to complete
   */
  async waitForFunding(
    dripId: string,
    maxWaitTime: number = 120000 // 2 minutes
  ): Promise<FaucetDripResponse> {
    const startTime = Date.now();
    const checkInterval = 5000; // Check every 5 seconds
    
    while (Date.now() - startTime < maxWaitTime) {
      const status = await this.checkDripStatus(dripId);
      
      if (status.status === 'complete') {
        console.log(`✅ Funding complete for drip ${dripId}`);
        return status;
      }
      
      if (status.status === 'failed') {
        throw new Error(`Funding failed for drip ${dripId}`);
      }
      
      console.log(`⏳ Waiting for funding... (${Math.floor((Date.now() - startTime) / 1000)}s)`);
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }
    
    throw new Error(`Funding timeout after ${maxWaitTime}ms`);
  }

  /**
   * Fund wallet and wait for completion
   */
  async fundWallet(
    address: string,
    chainId: number,
    options?: {
      native?: boolean;
      usdc?: boolean;
      eurc?: boolean;
      waitForCompletion?: boolean;
    }
  ): Promise<FaucetDripResponse> {
    const drip = await this.requestFunds(address, chainId, options);
    
    if (options?.waitForCompletion !== false) {
      return await this.waitForFunding(drip.id);
    }
    
    return drip;
  }

  /**
   * Fund multiple wallets in parallel
   */
  async fundMultipleWallets(
    wallets: Array<{ address: string; chainId: number }>,
    options?: {
      native?: boolean;
      usdc?: boolean;
      eurc?: boolean;
    }
  ): Promise<Map<string, FaucetDripResponse>> {
    console.log(`🚰 Funding ${wallets.length} wallets...`);
    
    const results = new Map<string, FaucetDripResponse>();
    
    // Submit all requests in parallel
    const dripPromises = wallets.map(async ({ address, chainId }) => {
      try {
        const drip = await this.requestFunds(address, chainId, options);
        return { address, drip };
      } catch (error) {
        console.error(`Failed to request funds for ${address}:`, error);
        return { address, drip: null };
      }
    });
    
    const dripResults = await Promise.all(dripPromises);
    
    // Wait for all successful drips to complete
    const completionPromises = dripResults
      .filter(result => result.drip !== null)
      .map(async ({ address, drip }) => {
        try {
          const completed = await this.waitForFunding(drip!.id);
          results.set(address, completed);
        } catch (error) {
          console.error(`Failed to complete funding for ${address}:`, error);
        }
      });
    
    await Promise.all(completionPromises);
    
    console.log(`✅ Funded ${results.size}/${wallets.length} wallets successfully`);
    
    return results;
  }

  /**
   * Ensure wallet has minimum balance, fund if needed
   */
  async ensureMinimumBalance(
    address: string,
    chainId: number,
    minNativeBalance: string,
    minUsdcBalance?: string,
    provider?: ethers.Provider
  ): Promise<boolean> {
    try {
      // Use provided provider or create new one
      const ethersProvider = provider || (() => {
        const testnet = getTestnetByChainId(chainId);
        if (!testnet) throw new Error(`Unknown chain ID: ${chainId}`);
        return new ethers.JsonRpcProvider(testnet.rpcUrl);
      })();
      
      // Check native balance
      const nativeBalance = await ethersProvider.getBalance(address);
      const minNative = ethers.parseEther(minNativeBalance);
      
      console.log(`💰 Current balance: ${ethers.formatEther(nativeBalance)} ETH`);
      console.log(`   Required: ${minNativeBalance} ETH`);
      
      let needsFunding = nativeBalance < minNative;
      
      // Check USDC balance if specified
      if (minUsdcBalance) {
        const testnet = getTestnetByChainId(chainId);
        if (testnet?.tokens.USDC) {
          const usdcContract = new ethers.Contract(
            testnet.tokens.USDC,
            ['function balanceOf(address) view returns (uint256)'],
            ethersProvider
          );
          
          const usdcBalance = await (usdcContract as any).balanceOf(address);
          const minUsdc = ethers.parseUnits(minUsdcBalance, 6);
          
          console.log(`💵 Current USDC: ${ethers.formatUnits(usdcBalance, 6)} USDC`);
          console.log(`   Required: ${minUsdcBalance} USDC`);
          
          needsFunding = needsFunding || usdcBalance < minUsdc;
        }
      }
      
      if (needsFunding) {
        console.log(`🚰 Wallet needs funding, requesting from faucet...`);
        await this.fundWallet(address, chainId, {
          native: nativeBalance < minNative,
          usdc: !!minUsdcBalance,
          waitForCompletion: true
        });
        
        // Wait a bit for blockchain confirmation
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        return true;
      }
      
      console.log(`✅ Wallet has sufficient balance`);
      return false;
    } catch (error) {
      console.error('Failed to check/ensure minimum balance:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const circleFaucet = new CircleFaucetService();