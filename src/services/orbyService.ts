//@ts-nocheck
import { OrbyProvider } from '@orb-labs/orby-ethers6';
import { Account, AccountCluster, Activity, ActivityStatus, OnchainOperation, QuoteType, CreateOperationsStatus, StandardizedBalance } from '@orb-labs/orby-core';
import { prisma } from '@/utils/database';
import { config } from '@/utils/config';
import { AppError, NotFoundError } from '@/types';
import type { SmartProfile, LinkedAccount } from '@prisma/client';
import { ethers } from 'ethers';
import { cacheService } from './cacheService';
import { logger } from '@/utils/logger';
import { CachedPortfolioItem, TokenInfo, TokenBalance } from '@/types/portfolio';

// Define the response type based on Orby SDK structure
interface CreateOperationsResponse {
  status: CreateOperationsStatus;
  intents?: any[];
  aggregateEstimatedTimeInMs?: number;
  estimatedTimeInMs?: number;
}

// Extended SmartProfile type with orby fields
interface SmartProfileWithOrby extends SmartProfile {
  orbyAccountClusterId: string | null;
}

interface ProfileWithAccounts extends SmartProfileWithOrby {
  linkedAccounts: LinkedAccount[];
}

// Extended Activity type
interface OrbyActivity extends Activity {
  operations?: any[];
}

interface OrbyConfig {
  privateInstanceUrl: string;
  privateApiKey: string;
  publicApiKey: string;
  appName: string;
}

interface GasToken {
  standardizedTokenId: string;
  tokenSources?: { chainId: bigint; address?: string }[];
}

interface TransferIntentParams {
  from: {
    token: string;
    chainId: number;
    amount: string;
  };
  to: {
    address: string;
  };
}

interface SwapIntentParams {
  from: {
    token: string;
    chainId: number;
    amount: string;
  };
  to: {
    token: string;
    chainId: number;
  };
}

export class OrbyService {
  private orbyProvider?: OrbyProvider;
  private virtualNodes: Map<string, OrbyProvider> = new Map();
  private config: OrbyConfig;
  private iface: ethers.Interface;

  constructor() {
    this.config = {
      privateInstanceUrl: config.ORBY_PRIVATE_INSTANCE_URL,
      privateApiKey: config.ORBY_INSTANCE_PRIVATE_API_KEY,
      publicApiKey: config.ORBY_INSTANCE_PUBLIC_API_KEY,
      appName: config.ORBY_APP_NAME
    };

    // Initialize ERC20 interface for encoding
    const ERC20_ABI = [
      'function transfer(address to, uint256 amount) returns (bool)',
      'function approve(address spender, uint256 amount) returns (bool)',
      'function transferFrom(address from, address to, uint256 amount) returns (bool)'
    ];
    this.iface = new ethers.Interface(ERC20_ABI);

    // OrbyProvider is now lazily initialized when first needed
  }

  /**
   * Get or create the OrbyProvider instance
   */
  private getProvider(): OrbyProvider {
    if (!this.orbyProvider) {
      console.log('Initializing OrbyProvider...');
      // The privateInstanceUrl already includes the API key for the dev environment
      this.orbyProvider = new OrbyProvider(this.config.privateInstanceUrl);
    }
    return this.orbyProvider;
  }

  /**
   * Create or get an account cluster for a profile
   * @param profile - The profile with linked accounts
   * @param tx - Optional transaction context to use instead of global prisma
   */
  async createOrGetAccountCluster(
    profile: SmartProfile & { linkedAccounts: LinkedAccount[] },
    tx?: any
  ): Promise<string> {
    // Cast profile to include orby fields
    const profileWithOrby = profile as SmartProfileWithOrby & { linkedAccounts: LinkedAccount[] };
    
    // If cluster already exists, return it
    if (profileWithOrby.orbyAccountClusterId) {
      return profileWithOrby.orbyAccountClusterId;
    }

    // Convert linked accounts to Orby format
    const accounts: Account[] = [];
    
    // Add session wallet as primary account (EOA type - 7702 is still EOA)
    accounts.push(
      Account.toAccount({
        vmType: 'EVM',
        address: profile.sessionWalletAddress,
        accountType: 'EOA',
        chainId: 'EIP155-1' // Default to Ethereum mainnet (Orby format)
      })
    );

    // Add all linked EOAs (check if linkedAccounts exists)
    if (profile.linkedAccounts && profile.linkedAccounts.length > 0) {
      for (const linkedAccount of profile.linkedAccounts) {
        if (linkedAccount.isActive) {
          accounts.push(
            Account.toAccount({
              vmType: 'EVM',
              address: linkedAccount.address,
              accountType: 'EOA',
              chainId: `EIP155-${linkedAccount.chainId || 1}` // Use linked account's chainId or default to mainnet (Orby format)
            })
          );
        }
      }
    }

    // Create account cluster
    const cluster = await this.getProvider().createAccountCluster(accounts);
    if (!cluster || !cluster.accountClusterId) {
      throw new AppError('Failed to create Orby account cluster', 500);
    }

    // Use transaction context if provided, otherwise use global prisma
    const dbContext = tx || prisma;

    // Update profile with cluster ID using the correct database context
    await dbContext.smartProfile.update({
      where: { id: profile.id },
      data: { orbyAccountClusterId: cluster.accountClusterId } as any
    });

    return cluster.accountClusterId;
  }

  /**
   * Update account cluster when accounts are linked/unlinked
   * @param profileId - The profile ID to update
   * @param tx - Optional transaction context to use instead of global prisma
   */
  async updateAccountCluster(profileId: string, tx?: any): Promise<void> {
    const dbContext = tx || prisma;
    
    const profile = await dbContext.smartProfile.findUnique({
      where: { id: profileId },
      include: { linkedAccounts: true }
    });

    const profileWithOrby = profile as (SmartProfileWithOrby & { linkedAccounts: LinkedAccount[] }) | null;
    
    if (!profileWithOrby || !profileWithOrby.orbyAccountClusterId) {
      return;
    }

    // Recreate cluster with updated accounts
    await dbContext.smartProfile.update({
      where: { id: profileId },
      data: { orbyAccountClusterId: null } as any
    });

    await this.createOrGetAccountCluster(profileWithOrby, tx);
  }

  /**
   * Retrieve the RPC URL for a virtual node on a specific chain
   */
  async getVirtualNodeRpcUrl(
    profile: SmartProfile,
    chainId: number
  ): Promise<string> {
    const profileWithOrby = profile as SmartProfileWithOrby;

    if (!profileWithOrby.orbyAccountClusterId) {
      throw new AppError('Profile does not have an Orby account cluster', 400);
    }

    const rpcUrl = await this.getProvider().getVirtualNodeRpcUrl(
      profileWithOrby.orbyAccountClusterId,
      BigInt(chainId),
      profile.sessionWalletAddress
    );

    if (!rpcUrl) {
      throw new AppError(`Failed to get virtual node for chain ${chainId}`, 500);
    }

    return rpcUrl;
  }

  /**
   * Get or create virtual node for a specific chain
   */
  async getVirtualNode(
    profile: SmartProfile,
    chainId: number
  ): Promise<OrbyProvider> {
    const key = `${profile.id}-${chainId}`;
    
    if (this.virtualNodes.has(key)) {
      return this.virtualNodes.get(key)!;
    }

    const rpcUrl = await this.getVirtualNodeRpcUrl(profile, chainId);

    // Create virtual node provider
    const virtualNode = new OrbyProvider(rpcUrl);

    // Cache the virtual node
    this.virtualNodes.set(key, virtualNode);

    // Store in database
    await prisma.orbyVirtualNode.upsert({
      where: {
        profileId_chainId: {
          profileId: profile.id,
          chainId
        }
      },
      update: {
        rpcUrl,
        address: profile.sessionWalletAddress,
        isActive: true
      },
      create: {
        profileId: profile.id,
        chainId,
        rpcUrl,
        address: profile.sessionWalletAddress,
        isActive: true
      }
    });

    return virtualNode;
  }

  /**
   * Get fungible token portfolio for a profile
   */
  async getFungibleTokenPortfolio(profile: SmartProfile & { linkedAccounts?: LinkedAccount[] }, chainId: number = config.DEFAULT_CHAIN_ID): Promise<CachedPortfolioItem[]> {
    const profileWithOrby = profile as SmartProfileWithOrby;
    
    if (!profileWithOrby.orbyAccountClusterId) {
      throw new AppError('Profile does not have an Orby account cluster', 400);
    }

    // Log the profile and linked accounts
    console.log('\n========== PROFILE DEBUG ==========');
    console.log(`Profile ID: ${profile.id}`);
    console.log(`Orby Cluster ID: ${profileWithOrby.orbyAccountClusterId}`);
    console.log(`Session Wallet: ${profile.sessionWalletAddress}`);
    if (profile.linkedAccounts) {
      console.log(`Linked Accounts: ${profile.linkedAccounts.length}`);
      profile.linkedAccounts.forEach(la => {
        console.log(`  - ${la.address} (Chain: ${la.chainId}, Active: ${la.isActive})`);
      });
    }
    console.log('===================================\n');

    // Always fetch fresh data from Orby (no caching for balance data)
    // Get virtual node for the chain
    const virtualNode = await this.getVirtualNode(profile, chainId);

    // Use the raw RPC method to get portfolio with proper parameters
    const response = await virtualNode.send('orby_getFungibleTokenPortfolio', [{
      accountClusterId: profileWithOrby.orbyAccountClusterId!,
      offset: 0,
      limit: 100 // Get more tokens to ensure we get all balances
    }]);

    const portfolio = response?.fungibleTokenBalances || [];

    if (!portfolio || portfolio.length === 0) {
      console.log('No portfolio data returned from Orby');
      return [];
    }

    // // Comprehensive logging of the raw response
    // console.log(`\n========== ORBY PORTFOLIO RESPONSE DEBUG ==========`);
    // console.log(`Total items in portfolio: ${portfolio.length}`);
    // console.log('Full response structure:', JSON.stringify(response, null, 2));
    
    // portfolio.forEach((item: any, index: number) => {
    //   console.log(`\n--- Token ${index + 1} ---`);
    //   console.log(`StandardizedTokenId: ${item.standardizedTokenId}`);
    //   console.log(`TotalTokenAmount:`, JSON.stringify(item.totalTokenAmount, null, 2));
    //   console.log(`TotalValueInFiat:`, JSON.stringify(item.totalValueInFiat, null, 2));
    //   console.log(`TokenBalancesOnChains: ${item.tokenBalancesOnChains?.length || 0} chains`);
      
    //   if (item.tokenBalancesOnChains && item.tokenBalancesOnChains.length > 0) {
    //     item.tokenBalancesOnChains.forEach((chainBalance: any, idx: number) => {
    //       console.log(`  Chain ${idx + 1}:`, JSON.stringify(chainBalance, null, 2));
    //     });
    //   }
    // });
    // console.log(`\n================================================\n`);

    // Transform Orby response to our format based on actual API structure
    const transformedPortfolio: CachedPortfolioItem[] = portfolio.map((item: any) => {
      // Extract total amount from totalTokenAmount object
      let totalRawAmount = '0';
      let tokenInfo: any = {};
      let decimals = 18;
      
      try {
        if (item.totalTokenAmount) {
          // Extract amount value
          if (item.totalTokenAmount.amount !== undefined) {
            totalRawAmount = item.totalTokenAmount.amount.toString();
          }
          
          // Extract token metadata
          if (item.totalTokenAmount.currency || item.totalTokenAmount.token?.metadata?.currency) {
            const currency = item.totalTokenAmount.currency || item.totalTokenAmount.token?.metadata?.currency;
            tokenInfo = {
              symbol: currency.asset?.symbol || currency.symbol || 'Unknown',
              name: currency.asset?.name || currency.name || 'Unknown',
              decimals: currency.decimals || 18
            };
            decimals = currency.decimals || 18;
          }
        }
      } catch (err) {
        console.error('Error extracting total amount:', err);
      }
      
      // Transform token balances from tokenBalancesOnChains
      const tokenBalances: TokenBalance[] = [];
      const tokenBalancesOnChains: { chainId: string; rawAmount: string }[] = [];
      
      if (item.tokenBalancesOnChains && Array.isArray(item.tokenBalancesOnChains)) {
        item.tokenBalancesOnChains.forEach((chainBalance: any) => {
          try {
            // Extract chain ID from CAIP-2 format
            const chainIdStr = chainBalance.token?.chainId || 'EIP155-1';
            const chainId = chainIdStr.toString().replace('EIP155-', '');
            
            // Extract amount
            const rawAmount = chainBalance.amount?.toString() || '0';
            
            // Get token info from this chain balance if not already set
            if (!tokenInfo.symbol && chainBalance.token?.metadata?.currency) {
              const currency = chainBalance.token.metadata.currency;
              tokenInfo = {
                symbol: currency.asset?.symbol || currency.symbol || 'Unknown',
                name: currency.asset?.name || currency.name || 'Unknown',
                decimals: currency.decimals || 18
              };
            }
            
            tokenBalances.push({
              token: {
                symbol: tokenInfo.symbol || 'Unknown',
                name: tokenInfo.name || 'Unknown',
                decimals: tokenInfo.decimals || decimals,
                chainId: chainId,
                address: chainBalance.token?.address || ''
              },
              rawAmount,
              chainId: chainId
            });
            
            tokenBalancesOnChains.push({
              chainId,
              rawAmount
            });
          } catch (err) {
            console.error('Error processing chain balance:', err);
          }
        });
      }

      // Extract fiat value
      let totalValueInFiat = '0';
      try {
        if (item.totalValueInFiat?.amount !== undefined) {
          // The amount is in the smallest unit (like cents for USD)
          // Currency object should tell us the decimals
          const fiatAmount = item.totalValueInFiat.amount;
          const fiatDecimals = item.totalValueInFiat.currency?.decimals || 2;
          
          // Store the raw amount with proper decimal conversion info
          totalValueInFiat = fiatAmount.toString();
          
          console.log(`Fiat value for ${tokenInfo.symbol}: raw=${fiatAmount}, decimals=${fiatDecimals}`);
        }
      } catch (err) {
        console.error('Error extracting fiat value:', err);
      }

      return {
        standardizedTokenId: item.standardizedTokenId,
        tokenBalances,
        tokenBalancesOnChains,
        totalRawAmount,
        totalValueInFiat
      };
    });

    // Log the transformed portfolio
    console.log('\n========== TRANSFORMED PORTFOLIO ==========');
    transformedPortfolio.forEach((item, index) => {
      const symbol = item.tokenBalances[0]?.token.symbol || 'Unknown';
      console.log(`${index + 1}. ${symbol}:`);
      console.log(`   Total Raw Amount: ${item.totalRawAmount}`);
      console.log(`   Total Value in Fiat: ${item.totalValueInFiat}`);
      console.log(`   Token Balances Count: ${item.tokenBalances.length}`);
      item.tokenBalances.forEach(tb => {
        console.log(`     - Chain ${tb.chainId}: ${tb.rawAmount} (${tb.token.address})`);
      });
    });
    console.log('==========================================\n');
    
    return transformedPortfolio;
  }

  /**
   * Get standardized token IDs for tokens
   */
  async getStandardizedTokenIds(
    tokens: { chainId: number; tokenAddress: string }[]
  ): Promise<string[]> {
    // Check cache for existing token IDs
    const cachedTokenIds = await cacheService.getCachedTokenIds(
      tokens.map(t => ({ chainId: BigInt(t.chainId), tokenAddress: t.tokenAddress }))
    );

    // Separate cached and uncached tokens
    const uncachedTokens: { chainId: number; tokenAddress: string }[] = [];
    const result: string[] = new Array(tokens.length);

    tokens.forEach((token, index) => {
      const cacheKey = `${token.chainId}:${token.tokenAddress}`;
      const cachedId = cachedTokenIds.get(cacheKey);
      
      if (cachedId) {
        result[index] = cachedId;
      } else {
        uncachedTokens.push(token);
      }
    });

    // Fetch uncached tokens if any
    if (uncachedTokens.length > 0) {
      const tokenIds = await this.getProvider().getStandardizedTokenIds(
        uncachedTokens.map(t => ({
          chainId: BigInt(t.chainId),
          tokenAddress: t.tokenAddress
        }))
      );

      if (!tokenIds || tokenIds.length !== uncachedTokens.length) {
        throw new AppError('Failed to get standardized token IDs', 500);
      }

      // Cache the new token IDs
      const newTokenMap = new Map<string, string>();
      uncachedTokens.forEach((token, idx) => {
        const cacheKey = `${token.chainId}:${token.tokenAddress}`;
        newTokenMap.set(cacheKey, tokenIds[idx]!);
      });
      
      await cacheService.setCachedTokenIds(newTokenMap);

      // Merge results
      let uncachedIndex = 0;
      tokens.forEach((token, index) => {
        if (result[index] === undefined) {
          result[index] = tokenIds[uncachedIndex++]!;
        }
      });
    }

    return result;
  }

  /**
   * Build transfer operations
   */
  async buildTransferOperation(
    profile: SmartProfile,
    params: TransferIntentParams,
    gasToken?: GasToken
  ): Promise<CreateOperationsResponse> {
    const virtualNode = await this.getVirtualNode(profile, params.from.chainId);
    const profileWithOrby = profile as SmartProfileWithOrby;

    // Encode transfer data
    const transferData = this.iface.encodeFunctionData('transfer', [
      params.to.address,
      ethers.parseUnits(params.from.amount, 18) // Assuming 18 decimals, adjust as needed
    ]);

    // Get operations
    const response = await virtualNode.getOperationsToExecuteTransaction(
      profileWithOrby.orbyAccountClusterId!,
      transferData,
      params.from.token,
      undefined,
      gasToken
    );

    if (!response || response.status !== CreateOperationsStatus.SUCCESS) {
      throw new AppError('Failed to create transfer operations', 500);
    }

    return response;
  }

  /**
   * Build swap operations
   */
  async buildSwapOperation(
    profile: SmartProfile,
    params: SwapIntentParams,
    gasToken?: GasToken
  ): Promise<CreateOperationsResponse> {
    const virtualNode = await this.getVirtualNode(profile, params.from.chainId);
    const profileWithOrby = profile as SmartProfileWithOrby;

    // Get standardized token IDs
    const [inputTokenId, outputTokenId] = await this.getStandardizedTokenIds([
      { chainId: params.from.chainId, tokenAddress: params.from.token },
      { chainId: params.to.chainId, tokenAddress: params.to.token }
    ]);

    // Format swap parameters
    const input = {
      standardizedTokenId: inputTokenId,
      amount: BigInt(params.from.amount),
      tokenSources: [{ chainId: BigInt(params.from.chainId) }]
    };

    const output = {
      standardizedTokenId: outputTokenId,
      amount: undefined, // For EXACT_INPUT swaps
      tokenDestination: { chainId: BigInt(params.to.chainId) }
    };

    // Get swap operations
    const response = await virtualNode.getOperationsToSwap(
      profileWithOrby.orbyAccountClusterId!,
      QuoteType.EXACT_INPUT,
      {
        standardizedTokenId: inputTokenId || '',
        amount: input.amount,
        tokenSources: input.tokenSources
      },
      {
        standardizedTokenId: outputTokenId || '',
        amount: output.amount,
        tokenDestination: output.tokenDestination
      },
      gasToken
    );

    if (!response || response.status !== CreateOperationsStatus.SUCCESS) {
      throw new AppError('Failed to create swap operations', 500);
    }

    return response;
  }

  /**
   * Submit signed operations
   */
  async submitSignedOperations(
    operationSetId: string,
    signedOperations: { index: number; signature: string; signedData?: string }[]
  ): Promise<{ success: boolean; operationSetId: string }> {
    // Get the stored operation
    const operation = await prisma.orbyOperation.findUnique({
      where: { operationSetId },
      include: { 
        profile: {
          include: {
            linkedAccounts: true
          }
        }
      }
    });

    if (!operation) {
      throw new NotFoundError('Operation set not found');
    }

    if (operation.status !== 'created') {
      throw new AppError('Operation has already been processed', 400);
    }

    // Parse the unsigned payload
    const unsignedPayload = JSON.parse(operation.unsignedPayload) as CreateOperationsResponse;

    // Create sign functions based on the signed operations
    const signTransaction = async (op: OnchainOperation): Promise<string | undefined> => {
      const signedOp = signedOperations.find(s => s.index === (op as any).index);
      return signedOp?.signature;
    };

    const signTypedData = async (op: OnchainOperation): Promise<string | undefined> => {
      const signedOp = signedOperations.find(s => s.index === (op as any).index);
      return signedOp?.signedData || signedOp?.signature;
    };

    // Submit to Orby
    const virtualNode = await this.getVirtualNode(
      operation.profile,
      Number(operation.profile.linkedAccounts[0]?.chainId || config.DEFAULT_CHAIN_ID)
    );

    const accountCluster = {
      accountClusterId: operation.profile.orbyAccountClusterId!,
      accounts: [] // This will be populated by Orby
    } as AccountCluster;

    const sendResponse = await virtualNode.sendOperationSet(
      accountCluster,
      unsignedPayload,
      signTransaction,
      undefined, // signUserOperation not needed for EOAs
      signTypedData
    );

    if (!sendResponse || !sendResponse.success) {
      throw new AppError('Failed to submit operations to Orby', 500);
    }

    // Update operation status
    await prisma.orbyOperation.update({
      where: { id: operation.id },
      data: {
        status: 'pending',
        signedPayload: JSON.stringify(signedOperations)
      }
    });

    // Start monitoring the operation
    if (sendResponse.operationSetId) {
      this.monitorOperationStatus(sendResponse.operationSetId);
    }

    return {
      success: sendResponse.success,
      operationSetId: sendResponse.operationSetId || ''
    };
  }

  /**
   * Monitor operation status
   */
  private async monitorOperationStatus(operationSetId: string): Promise<void> {
    const callback = async (activity?: Activity) => {
      if (!activity) return;

      const operation = await prisma.orbyOperation.findUnique({
        where: { operationSetId }
      });

      if (!operation) return;

      let status = operation.status;
      if (activity.overallStatus === ActivityStatus.SUCCESSFUL) {
        status = 'successful';
      } else if (activity.overallStatus === ActivityStatus.FAILED) {
        status = 'failed';
      }

      await prisma.orbyOperation.update({
        where: { operationSetId },
        data: {
          status,
          completedAt: status === 'successful' || status === 'failed' ? new Date() : undefined,
          metadata: JSON.stringify({
            ...JSON.parse(operation.metadata),
            activityDetails: activity
          })
        }
      });

      // Create transaction records for each operation
      const orbyActivity = activity as OrbyActivity;
      if (orbyActivity.operations) {
        for (const op of orbyActivity.operations) {
          await prisma.orbyTransaction.create({
            data: {
              operationId: operation.id,
              chainId: Number(op.chainId || '1'),
              hash: op.hash || null,
              status: op.status || 'unknown',
              gasUsed: op.gasUsed?.toString() || null
            }
          });
        }
      }
    };

    this.getProvider().subscribeToOperationSetStatus(operationSetId, callback);
  }

  /**
   * Get operation status
   */
  async getOperationStatus(operationSetId: string): Promise<any> {
    const operation = await prisma.orbyOperation.findUnique({
      where: { operationSetId },
      include: { transactions: true }
    });

    if (!operation) {
      throw new NotFoundError('Operation not found');
    }

    return {
      operationSetId: operation.operationSetId,
      status: operation.status,
      type: operation.type,
      createdAt: operation.createdAt,
      completedAt: operation.completedAt,
      transactions: operation.transactions.map((tx: any) => ({
        chainId: tx.chainId,
        hash: tx.hash,
        status: tx.status,
        gasUsed: tx.gasUsed
      }))
    };
  }

  /**
   * Check Orby service health and connectivity
   */
  async checkHealth(): Promise<{
    isHealthy: boolean;
    privateInstanceUrl: string;
    connectionStatus: 'connected' | 'disconnected' | 'error';
    errorMessage?: string;
    timestamp: string;
  }> {
    const healthStatus = {
      isHealthy: false,
      privateInstanceUrl: config.ORBY_PRIVATE_INSTANCE_URL,
      connectionStatus: 'disconnected' as 'connected' | 'disconnected' | 'error',
      errorMessage: undefined as string | undefined,
      timestamp: new Date().toISOString()
    };

    try {
      // Try to get the provider - this will test basic connectivity
      const provider = this.getProvider();
      
      // Test a simple operation - try to get standardized token IDs for common tokens
      const testTokens = [
        { chainId: BigInt(1), tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' }, // USDC on Ethereum
        { chainId: BigInt(137), tokenAddress: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174' } // USDC on Polygon
      ];
      
      const standardizedIds = await provider.getStandardizedTokenIds(testTokens);
      
      if (standardizedIds && standardizedIds.length > 0) {
        healthStatus.isHealthy = true;
        healthStatus.connectionStatus = 'connected';
      } else {
        healthStatus.connectionStatus = 'error';
        healthStatus.errorMessage = 'Failed to get standardized token IDs';
      }
    } catch (error) {
      healthStatus.isHealthy = false;
      healthStatus.connectionStatus = 'error';
      healthStatus.errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      // Log the error for debugging
      console.error('Orby health check failed:', {
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined
      });
    }

    return healthStatus;
  }
}

// Export singleton instance
export const orbyService = new OrbyService();
