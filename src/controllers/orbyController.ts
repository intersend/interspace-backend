import { Request, Response, NextFunction } from 'express';
import { prisma } from '@/utils/database';
import { orbyService } from '@/services/orbyService';
import { gasTokenService } from '@/services/gasTokenService';
import { smartProfileService } from '@/services/smartProfileService';
import { ApiResponse, AppError, NotFoundError } from '@/types';
import { CreateOperationsStatus } from '@orb-labs/orby-core';
import { getChainName } from '@/utils/chainRegistry';
import { UnifiedBalance, PortfolioResponse, CachedPortfolioItem } from '@/types/portfolio';

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
      // Handle both V1 routes (id) and V2 routes (profileId)
      const profileId = req.params.id || req.params.profileId;
      
      // Debug logging for authentication context
      console.log('\n========== BALANCE ENDPOINT DEBUG ==========');
      console.log('Request params:', req.params);
      console.log('Profile ID from params:', profileId);
      console.log('req.account:', (req as any).account);
      console.log('req.user:', (req as any).user);
      console.log('req.isV2Auth:', (req as any).isV2Auth);
      
      // For V2 auth, the adapter sets req.user.userId
      // For V1 auth, req.user.userId is set directly
      let userId: string | undefined;
      
      if ((req as any).isV2Auth) {
        // V2 authentication - adapter sets req.user
        userId = req.user?.userId;
        console.log('V2 Auth detected, using req.user.userId:', userId);
      } else {
        // V1 authentication
        userId = req.user?.userId;
        console.log('V1 Auth detected, using req.user.userId:', userId);
      }
      
      console.log('Extracted userId:', userId);
      console.log('Authentication type:', (req as any).isV2Auth ? 'V2 (via adapter)' : 'V1 (direct)');
      
      if (!userId) {
        console.error('No userId found in request context');
        console.error('req.user object:', req.user);
        console.error('This likely means the V2 auth adapter failed to set req.user');
        throw new AppError('User not authenticated', 401);
      }

      // Debug database query
      console.log('\nExecuting database query with:');
      console.log('  profileId:', profileId);
      console.log('  userId:', userId);
      
      // Get profile with linked accounts
      const profile = await prisma.smartProfile.findFirst({
        where: { id: profileId, userId },
        include: { linkedAccounts: true }
      });

      console.log('\nDatabase query result:');
      console.log('  Profile found:', !!profile);
      if (profile) {
        console.log('  Profile ID:', profile.id);
        console.log('  Profile name:', profile.name);
        console.log('  Profile userId:', profile.userId);
        console.log('  Linked accounts count:', profile.linkedAccounts?.length || 0);
      } else {
        // Additional debugging when profile not found
        console.log('\nProfile not found. Running additional checks...');
        
        // Check if profile exists without userId filter
        const profileWithoutUser = await prisma.smartProfile.findFirst({
          where: { id: profileId }
        });
        
        if (profileWithoutUser) {
          console.log('  Profile exists but belongs to different user');
          console.log('  Profile userId:', profileWithoutUser.userId);
          console.log('  Request userId:', userId);
        } else {
          console.log('  Profile does not exist in database');
        }
        
        // Check all profiles for this user
        const userProfiles = await prisma.smartProfile.findMany({
          where: { userId },
          select: { id: true, name: true }
        });
        
        console.log(`\n  User ${userId} has ${userProfiles.length} profiles:`);
        userProfiles.forEach(p => {
          console.log(`    - ${p.id}: ${p.name}`);
        });
      }
      console.log('============================================\n');

      if (!profile) {
        throw new NotFoundError('Profile not found');
      }

      // Cast to include orby fields
      const profileWithOrby = profile as any;

      // Ensure account cluster exists
      if (!profileWithOrby.orbyAccountClusterId) {
        const clusterId = await orbyService.createOrGetAccountCluster(profile);
        profileWithOrby.orbyAccountClusterId = clusterId;
      }

      // Get unified portfolio from Orby (fresh data every time)
      const portfolio: CachedPortfolioItem[] = await orbyService.getFungibleTokenPortfolio(profileWithOrby);
      
      // Log the portfolio received from Orby
      console.log('\n========== CONTROLLER PORTFOLIO DEBUG ==========');
      console.log(`Total tokens received: ${portfolio.length}`);
      portfolio.forEach((item, index) => {
        console.log(`Token ${index + 1}: ${item.tokenBalances[0]?.token.symbol || 'Unknown'} - Raw Amount: ${item.totalRawAmount} - USD: ${item.totalValueInFiat}`);
      });
      
      // Calculate total USD value across all tokens
      let totalPortfolioUsdValue = 0;
      
      // Transform to unified balance format (NO FILTERING - show all tokens)
      const unifiedBalance: UnifiedBalance = {
        totalUsdValue: '0', // Will be updated after processing all tokens
        tokens: portfolio.map(item => {
          const decimals = item.tokenBalances[0]?.token.decimals || 18;
          
          // Convert totalValueInFiat with proper decimal handling
          let totalUsdValue = '0';
          if (item.totalValueInFiat && item.totalValueInFiat !== '0') {
            // Orby returns fiat values in smallest unit (e.g., cents for USD)
            // Default to 2 decimals for USD if not specified
            const fiatDecimals = 2;
            const rawFiatValue = parseFloat(item.totalValueInFiat);
            const divisor = Math.pow(10, fiatDecimals);
            const usdValue = rawFiatValue / divisor;
            
            totalUsdValue = usdValue.toFixed(2);
            totalPortfolioUsdValue += usdValue;
            
            console.log(`Token ${item.tokenBalances[0]?.token.symbol}: Raw fiat=${item.totalValueInFiat}, Formatted=$${totalUsdValue}`);
          }
          
          return {
            standardizedTokenId: item.standardizedTokenId,
            symbol: item.tokenBalances[0]?.token.symbol || 'Unknown',
            name: item.tokenBalances[0]?.token.name || 'Unknown',
            totalAmount: item.totalRawAmount, // Keep raw amount, frontend will format
            totalUsdValue,
            decimals,
            balancesPerChain: item.tokenBalances.map(tb => ({
              chainId: Number(tb.chainId),
              chainName: getChainName(Number(tb.chainId)),
              amount: tb.rawAmount, // Keep raw amount, frontend will format
              tokenAddress: tb.token.address,
              isNative: tb.token.address === '0x0000000000000000000000000000000000000000' ||
                        tb.token.address === '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' ||
                        !tb.token.address || tb.token.address === ''
            }))
          };
        })
      };
      
      // Update total portfolio USD value
      unifiedBalance.totalUsdValue = totalPortfolioUsdValue.toFixed(2);

      // Get gas analysis
      const gasAnalysis = await gasTokenService.analyzeGasTokens(profileWithOrby);

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
            } : null,
            nativeGasAvailable: gasAnalysis.nativeGasAvailable,
            availableGasTokens: gasAnalysis.availableGasTokens.slice(0, 5).map(token => token.symbol) // Return array of symbols (strings)
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
      // Handle both V1 routes (id) and V2 routes (profileId)
      const profileId = req.params.id || req.params.profileId;
      
      // Get userId based on auth version
      let userId: string | undefined;
      if ((req as any).isV2Auth) {
        userId = req.user?.userId;
      } else {
        userId = req.user?.userId;
      }
      
      if (!userId) {
        throw new AppError('User not authenticated', 401);
      }
      const { type, from, to, gasToken } = req.body;

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

      // Get profile
      const profile = await prisma.smartProfile.findFirst({
        where: { id: profileId, userId },
        include: { linkedAccounts: true }
      });

      if (!profile) {
        throw new NotFoundError('Profile not found');
      }

      // Cast to include orby fields
      const profileWithOrby = profile as any;

      // Ensure account cluster exists
      if (!profileWithOrby.orbyAccountClusterId) {
        const clusterId = await orbyService.createOrGetAccountCluster(profile);
        profileWithOrby.orbyAccountClusterId = clusterId;
      }

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
            createdBy: userId
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
      // Handle both V1 routes (id) and V2 routes (profileId)
      const profileId = req.params.id || req.params.profileId;
      
      // Get userId based on auth version
      let userId: string | undefined;
      if ((req as any).isV2Auth) {
        userId = req.user?.userId;
      } else {
        userId = req.user?.userId;
      }
      
      if (!userId) {
        throw new AppError('User not authenticated', 401);
      }
      const { page = '1', limit = '20', status } = req.query;

      // Verify profile ownership
      const profile = await prisma.smartProfile.findFirst({
        where: { id: profileId, userId }
      });

      if (!profile) {
        throw new NotFoundError('Profile not found');
      }

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
      // Handle both V1 routes (id) and V2 routes (profileId)
      const profileId = req.params.id || req.params.profileId;
      
      // Get userId based on auth version
      let userId: string | undefined;
      if ((req as any).isV2Auth) {
        userId = req.user?.userId;
      } else {
        userId = req.user?.userId;
      }
      
      if (!userId) {
        throw new AppError('User not authenticated', 401);
      }

      const profile = await prisma.smartProfile.findFirst({
        where: { id: profileId, userId }
      });

      if (!profile) {
        throw new NotFoundError('Profile not found');
      }

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
      // Handle both V1 routes (id) and V2 routes (profileId)
      const profileId = req.params.id || req.params.profileId;
      
      // Get userId based on auth version
      let userId: string | undefined;
      if ((req as any).isV2Auth) {
        userId = req.user?.userId;
      } else {
        userId = req.user?.userId;
      }
      
      if (!userId) {
        throw new AppError('User not authenticated', 401);
      }
      const { standardizedTokenId, tokenSymbol, chainPreferences } = req.body;

      // Validate profile ID
      if (!profileId) {
        throw new AppError('Profile ID is required', 400);
      }

      const profile = await prisma.smartProfile.findFirst({
        where: { id: profileId, userId }
      });

      if (!profile) {
        throw new NotFoundError('Profile not found');
      }

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
      // Handle both V1 routes (id) and V2 routes (profileId)
      const profileId = req.params.id || req.params.profileId;
      const chainId = parseInt(req.query.chainId as string);

      if (!profileId || isNaN(chainId)) {
        throw new AppError('Profile ID and Chain ID are required', 400);
      }

      const profile = await prisma.smartProfile.findUnique({
        where: { id: profileId }
      });

      if (!profile) {
        throw new NotFoundError('Profile not found');
      }

      const rpcUrl = await orbyService.getVirtualNodeRpcUrl(profile, chainId);

      res.json({ success: true, data: { rpcUrl } });
    } catch (error) {
      next(error);
    }
  }
}

export const orbyController = new OrbyController();
