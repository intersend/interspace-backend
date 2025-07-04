import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/database';
import { orbyService } from '../services/orbyService';
import { gasTokenService } from '../services/gasTokenService';
import { smartProfileService } from '../services/smartProfileService';
import { ApiResponse, AppError, NotFoundError, AuthenticationError } from '../types';
import { CreateOperationsStatus } from '@orb-labs/orby-core';

/**
 * Helper: Check if an account has access to a profile through various paths
 */
async function checkProfileAccess(profileId: string, accountId: string) {
  // First check if the profile exists
  const profile = await prisma.smartProfile.findUnique({
    where: { id: profileId },
    include: { linkedAccounts: true }
  });

  if (!profile) {
    throw new NotFoundError('Profile not found');
  }

  // Check access through multiple paths:
  // 1. Direct ProfileAccount access
  const hasProfileAccount = await prisma.profileAccount.findFirst({
    where: { profileId, accountId }
  });

  // 2. LinkedAccount access (account is linked to this profile)
  const account = await prisma.account.findUnique({
    where: { id: accountId }
  });
  
  const hasLinkedAccount = profile.linkedAccounts.some(
    la => la.address.toLowerCase() === account?.identifier.toLowerCase() && la.isActive
  );

  // 3. Identity link access (account is linked to another account that has access)
  const accountService = require('../services/accountService');
  const linkedAccountIds = await accountService.getLinkedAccounts(accountId);
  
  const hasIndirectAccess = await prisma.profileAccount.findFirst({
    where: { 
      profileId,
      accountId: { in: linkedAccountIds }
    }
  });

  if (!hasProfileAccount && !hasLinkedAccount && !hasIndirectAccess) {
    throw new NotFoundError('Profile not found or access denied');
  }

  return profile;
}

/**
 * Helper: Get chain name from ID
 */
function getChainName(chainId: number): string {
  const chains: Record<number, string> = {
    // Mainnet chains
    1: 'Ethereum',
    10: 'Optimism',
    56: 'BSC',
    137: 'Polygon',
    42161: 'Arbitrum',
    8453: 'Base',
    
    // Testnet chains
    5: 'Goerli',
    11155111: 'Sepolia',
    17000: 'Holesky',
    84532: 'Base Sepolia',
    421614: 'Arbitrum Sepolia',
    11155420: 'Optimism Sepolia',
    80001: 'Mumbai',
    80002: 'Amoy',
    97: 'BSC Testnet'
  };
  return chains[chainId] || `Chain ${chainId}`;
}

export class OrbyController {
  /**
   * GET /api/v1/orby/health
   * Check Orby service health and connectivity
   */
  async checkHealth(req: Request, res: Response): Promise<void> {
    try {
      const healthStatus = await orbyService.checkHealth();
      
      const response: ApiResponse = {
        success: healthStatus.isHealthy,
        data: {
          status: healthStatus.isHealthy ? 'healthy' : 'unhealthy',
          timestamp: new Date().toISOString(),
          details: healthStatus
        }
      };

      // Set appropriate HTTP status code
      res.status(healthStatus.isHealthy ? 200 : 503).json(response);
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: 'Failed to check Orby service health',
        data: {
          status: 'unhealthy',
          timestamp: new Date().toISOString(),
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      };
      res.status(503).json(response);
    }
  }

  /**
   * GET /api/v1/profiles/:id/balance
   * Get unified balance across all accounts in the profile
   */
  async getUnifiedBalance(req: Request, res: Response): Promise<void> {
    try {
      const { id: profileId } = req.params;
      const account = (req as any).account;
      const accountId = account?.id;

      if (!accountId) {
        throw new AuthenticationError('Authentication required');
      }

      // Check access and get profile
      // @ts-ignore - accountId is guaranteed to be defined after the check above
      const profile = await checkProfileAccess(profileId, accountId);

      // Get unified portfolio from Orby (will create fresh cluster internally)
      const portfolio = await orbyService.getFungibleTokenPortfolio(profile);
      
      // Calculate total USD value from all tokens
      let totalUsdValueRaw = BigInt(0);
      const fiatDecimals = 6; // USD typically has 6 decimals in the Orby response
      
      // Transform Orby response to simplified format for wallet page
      const tokens = portfolio.map(item => {
        // Get token info from first balance
        const firstBalance = item.tokenBalances[0];
        const symbol = firstBalance?.token.symbol || 'Unknown';
        const name = firstBalance?.token.name || 'Unknown';
        const decimals = firstBalance?.token.decimals || 18;
        
        // Calculate USD value for this token
        const tokenUsdValueRaw = item.totalValueInFiat || '0';
        let tokenUsdValue = '0';
        
        if (tokenUsdValueRaw !== '0') {
          totalUsdValueRaw = totalUsdValueRaw + BigInt(tokenUsdValueRaw);
          tokenUsdValue = (Number(tokenUsdValueRaw) / Math.pow(10, fiatDecimals)).toFixed(2);
        }
        
        // Get standardized token ID - it's on the item itself, not on the token
        const standardizedTokenId = item.standardizedTokenId || `${symbol.toLowerCase()}_token`;
        
        // Get total amount (raw amount with decimals)
        const totalAmount = item.totalRawAmount || '0';
        
        // Get balances per chain
        const balancesPerChain = item.tokenBalancesOnChains?.map((chainBalance: any) => ({
          chainId: parseInt(chainBalance.chainId),
          chainName: getChainName(parseInt(chainBalance.chainId)),
          amount: chainBalance.rawAmount,
          tokenAddress: '', // Not available in current data structure
          isNative: symbol === 'ETH' // Simple check for native token
        })) || [];
        
        return {
          standardizedTokenId,
          name,
          symbol,
          totalAmount,
          totalUsdValue: tokenUsdValue,
          decimals,
          balancesPerChain
        };
      }).filter(token => 
        // Only show tokens with non-zero USD value
        token.totalUsdValue !== '0' && token.totalUsdValue !== '0.00'
      );
      
      // Calculate total USD value
      const totalUsdValue = totalUsdValueRaw !== BigInt(0)
        ? (Number(totalUsdValueRaw) / Math.pow(10, fiatDecimals)).toFixed(2)
        : '0';
      
      const unifiedBalance = {
        totalUsdValue,
        tokens
      };

      // Get gas analysis
      const gasAnalysis = await gasTokenService.analyzeGasTokens(profile);

      const response: ApiResponse = {
        success: true,
        data: {
          profileId: profile.id,
          profileName: profile.name,
          unifiedBalance,
          gasAnalysis: {
            suggestedGasToken: gasAnalysis.suggestedGasToken ? {
              tokenId: gasAnalysis.suggestedGasToken.tokenId,
              symbol: gasAnalysis.suggestedGasToken.symbol,
              score: gasAnalysis.suggestedGasToken.score
            } : undefined,
            nativeGasAvailable: gasAnalysis.nativeGasAvailable,
            availableGasTokens: gasAnalysis.availableGasTokens?.map(token => token.symbol) || [] // Array of token symbols
          },
          linkedAccountsCount: profile.linkedAccounts.length
        }
      };

      res.json(response);
    } catch (error) {
      throw error;
    }
  }

  /**
   * POST /api/v1/profiles/:id/intent
   * Create a transaction intent
   */
  async createIntent(req: Request, res: Response): Promise<void> {
    try {
      const { id: profileId } = req.params;
      const account = (req as any).account;
      const accountId = account?.id;
      const { type, from, to, gasToken } = req.body;

      if (!accountId) {
        throw new AuthenticationError('Authentication required');
      }

      // Validate profile ID
      if (!profileId) {
        throw new AppError('Profile ID is required', 400);
      }

      // Validate input
      if (!type || !from || !to) {
        throw new AppError('Missing required fields: type, from, to', 400);
      }

      if (!['transfer', 'swap'].includes(type)) {
        throw new AppError('Invalid intent type. Must be "transfer" or "swap"', 400);
      }

      // Check access and get profile
      // @ts-ignore - accountId is guaranteed to be defined after the check above
      const profile = await checkProfileAccess(profileId, accountId);

      // Build operations based on type
      let operations;
      if (type === 'transfer') {
        operations = await orbyService.buildTransferOperation(
          profile,
          {
            from: {
              token: from.token,
              chainId: from.chainId,
              amount: from.amount
            },
            to: {
              address: to.address || to.token // Support both transfer and swap
            }
          },
          gasToken
        );
      } else if (type === 'swap') {
        operations = await orbyService.buildSwapOperation(
          profile,
          {
            from: {
              token: from.token,
              chainId: from.chainId,
              amount: from.amount
            },
            to: {
              token: to.token,
              chainId: to.chainId || from.chainId
            }
          },
          gasToken
        );
      }

      if (!operations || operations.status !== CreateOperationsStatus.SUCCESS) {
        throw new AppError('Failed to create operations', 500);
      }

      // Store operation in database
      const operation = await prisma.orbyOperation.create({
        data: {
          profileId,
          operationSetId: `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type,
          status: 'created',
          unsignedPayload: JSON.stringify(operations),
          metadata: JSON.stringify({
            from,
            to,
            gasToken,
            createdBy: accountId
          })
        }
      });

      const response: ApiResponse = {
        success: true,
        data: {
          intentId: operation.id,
          operationSetId: operation.operationSetId,
          type: operation.type,
          status: operation.status,
          estimatedTimeMs: operations.aggregateEstimatedTimeInMs || operations.estimatedTimeInMs,
          unsignedOperations: {
            status: operations.status,
            intents: operations.intents || [],
            estimatedTimeInMs: operations.aggregateEstimatedTimeInMs || operations.estimatedTimeInMs
          },
          summary: {
            from: {
              token: from.token,
              chainId: from.chainId,
              amount: from.amount
            },
            to,
            gasToken: gasToken || 'auto'
          }
        }
      };

      res.json(response);
    } catch (error) {
      throw error;
    }
  }

  /**
   * POST /api/v1/operations/:operationSetId/submit
   * Submit signed operations
   */
  async submitSignedOperations(req: Request, res: Response): Promise<void> {
    try {
      const { operationSetId } = req.params;
      const { signedOperations } = req.body;

      // Validate operation set ID
      if (!operationSetId) {
        throw new AppError('Operation set ID is required', 400);
      }

      if (!signedOperations || !Array.isArray(signedOperations)) {
        throw new AppError('Invalid signed operations', 400);
      }

      // Submit to Orby
      const result = await orbyService.submitSignedOperations(
        operationSetId,
        signedOperations
      );

      const response: ApiResponse = {
        success: true,
        data: {
          success: result.success,
          operationSetId: result.operationSetId,
          status: 'submitted',
          message: 'Operations submitted successfully. Use status endpoint to track progress.'
        }
      };

      res.json(response);
    } catch (error) {
      throw error;
    }
  }

  /**
   * GET /api/v1/operations/:operationSetId/status
   * Get operation status
   */
  async getOperationStatus(req: Request, res: Response): Promise<void> {
    try {
      const { operationSetId } = req.params;

      // Validate operation set ID
      if (!operationSetId) {
        throw new AppError('Operation set ID is required', 400);
      }

      const status = await orbyService.getOperationStatus(operationSetId);

      const response: ApiResponse = {
        success: true,
        data: status
      };

      res.json(response);
    } catch (error) {
      throw error;
    }
  }

  /**
   * GET /api/v1/profiles/:id/transactions
   * Get transaction history
   */
  async getTransactionHistory(req: Request, res: Response): Promise<void> {
    try {
      const { id: profileId } = req.params;
      const account = (req as any).account;
      const accountId = account?.id;
      const { page = '1', limit = '20', status } = req.query;

      if (!accountId) {
        throw new AuthenticationError('Authentication required');
      }

      // Check access and get profile
      // @ts-ignore - accountId is guaranteed to be defined after the check above
      const profile = await checkProfileAccess(profileId, accountId);

      // Build query
      const where: any = { profileId };
      if (status) {
        where.status = status;
      }

      // Get operations with pagination
      const [operations, total] = await Promise.all([
        prisma.orbyOperation.findMany({
          where,
          include: {
            transactions: true
          },
          orderBy: { createdAt: 'desc' },
          skip: (parseInt(page as string) - 1) * parseInt(limit as string),
          take: parseInt(limit as string)
        }),
        prisma.orbyOperation.count({ where })
      ]);

      // Transform to response format
      const transactions = operations.map((op: any) => {
        const metadata = JSON.parse(op.metadata);
        return {
          operationSetId: op.operationSetId,
          type: op.type,
          status: op.status,
          from: metadata.from,
          to: metadata.to,
          gasToken: metadata.gasToken,
          createdAt: op.createdAt,
          completedAt: op.completedAt,
          transactions: op.transactions.map((tx: any) => ({
            chainId: tx.chainId,
            hash: tx.hash,
            status: tx.status,
            gasUsed: tx.gasUsed
          }))
        };
      });

      const response: ApiResponse = {
        success: true,
        data: {
          transactions,
          pagination: {
            page: parseInt(page as string),
            limit: parseInt(limit as string),
            total,
            totalPages: Math.ceil(total / parseInt(limit as string)),
            hasNext: parseInt(page as string) * parseInt(limit as string) < total,
            hasPrev: parseInt(page as string) > 1
          }
        }
      };

      res.json(response);
    } catch (error) {
      throw error;
    }
  }

  /**
   * GET /api/v1/profiles/:id/gas-tokens
   * Get available gas tokens for a profile
   */
  async getGasTokens(req: Request, res: Response): Promise<void> {
    try {
      const { id: profileId } = req.params;
      const account = (req as any).account;
      const accountId = account?.id;

      if (!accountId) {
        throw new AuthenticationError('Authentication required');
      }

      // Check access and get profile
      // @ts-ignore - accountId is guaranteed to be defined after the check above
      const profile = await checkProfileAccess(profileId, accountId);

      const gasAnalysis = await gasTokenService.analyzeGasTokens(profile);

      const response: ApiResponse = {
        success: true,
        data: gasAnalysis
      };

      res.json(response);
    } catch (error) {
      throw error;
    }
  }

  /**
   * POST /api/v1/profiles/:id/gas-tokens/preference
   * Set preferred gas token
   */
  async setPreferredGasToken(req: Request, res: Response): Promise<void> {
    try {
      const { id: profileId } = req.params;
      const account = (req as any).account;
      const accountId = account?.id;
      const { standardizedTokenId, tokenSymbol, chainPreferences } = req.body;

      if (!accountId) {
        throw new AuthenticationError('Authentication required');
      }

      // Validate profile ID
      if (!profileId) {
        throw new AppError('Profile ID is required', 400);
      }

      // Check access and get profile
      // @ts-ignore - accountId is guaranteed to be defined after the check above
      const profile = await checkProfileAccess(profileId, accountId);

      await gasTokenService.setPreferredGasToken(
        profileId,
        standardizedTokenId,
        tokenSymbol,
        chainPreferences
      );

      const response: ApiResponse = {
        success: true,
        message: 'Gas token preference updated successfully'
      };

      res.json(response);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get virtual node RPC URL for a profile on a specific chain
   */
  async getVirtualNodeRpcUrl(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: profileId } = req.params;
      const account = (req as any).account;
      const accountId = account?.id;
      const chainId = parseInt(req.query.chainId as string);

      if (!accountId) {
        throw new AuthenticationError('Authentication required');
      }

      if (!profileId || isNaN(chainId)) {
        throw new AppError('Profile ID and Chain ID are required', 400);
      }

      // Check access and get profile
      // @ts-ignore - accountId is guaranteed to be defined after the check above
      const profile = await checkProfileAccess(profileId, accountId);

      // Create fresh cluster and get RPC URL
      const clusterId = await orbyService.createFreshAccountCluster(profile);
      const rpcUrl = await orbyService.getVirtualNodeRpcUrl(clusterId, chainId, profile.sessionWalletAddress);

      res.json({ success: true, data: { rpcUrl } });
    } catch (error) {
      next(error);
    }
  }
}

export const orbyController = new OrbyController();
