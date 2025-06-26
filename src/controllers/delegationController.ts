import { Request, Response } from 'express';
import { delegationService } from '@/services/delegationService';
import { ApiResponse, AppError } from '@/types';
import { z } from 'zod';

// Validation schemas
const createDelegationSchema = z.object({
  chainId: z.number().int().positive(),
  permissions: z.object({
    transfer: z.boolean().optional(),
    swap: z.boolean().optional(),
    approve: z.boolean().optional(),
    all: z.boolean().optional()
  }).optional(),
  expiresAt: z.string().datetime().optional()
});

const signedAuthorizationSchema = z.object({
  chainId: z.number().int().positive(),
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  nonce: z.string(),
  yParity: z.number().int().min(0).max(1),
  r: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  s: z.string().regex(/^0x[a-fA-F0-9]{64}$/)
});

const executeDelegatedSchema = z.object({
  to: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  value: z.string().optional().default('0'),
  data: z.string().optional().default('0x'),
  chainId: z.number().int().positive()
});

export class DelegationController {
  /**
   * POST /api/v1/profiles/:profileId/accounts/:accountId/delegate
   * Create a delegation authorization for frontend signing
   */
  async createDelegationAuthorization(req: Request, res: Response): Promise<void> {
    try {
      const { profileId, accountId } = req.params;
      const userId = req.user!.userId!;
      
      // Validate request body
      const validatedData = createDelegationSchema.parse(req.body);
      
      // Get the profile to find the session wallet
      const profile = await req.app.locals.prisma.smartProfile.findFirst({
        where: {
          id: profileId,
          userId
        }
      });
      
      if (!profile) {
        throw new AppError('Profile not found', 404);
      }
      
      // Create the authorization
      const authorization = await delegationService.createDelegationAuthorization(
        userId,
        accountId!,
        profile.sessionWalletAddress,
        validatedData.chainId,
        validatedData.permissions,
        validatedData.expiresAt ? new Date(validatedData.expiresAt) : undefined
      );
      
      const response: ApiResponse = {
        success: true,
        data: authorization
      };
      
      res.json(response);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new AppError('Invalid request data', 400, 'VALIDATION_ERROR', error.errors);
      }
      throw error;
    }
  }
  
  /**
   * POST /api/v1/profiles/:profileId/accounts/:accountId/delegate/confirm
   * Store a signed delegation authorization
   */
  async confirmDelegation(req: Request, res: Response): Promise<void> {
    try {
      const { profileId, accountId } = req.params;
      const userId = req.user!.userId!;
      
      // Validate the signed authorization
      const signedAuthorization = signedAuthorizationSchema.parse(req.body.signedAuthorization);
      const permissions = req.body.permissions || { all: true };
      const expiresAt = req.body.expiresAt ? new Date(req.body.expiresAt) : undefined;
      
      // Store the delegation
      const delegation = await delegationService.storeDelegation(
        userId,
        accountId!,
        {
          ...signedAuthorization,
          nonce: BigInt(signedAuthorization.nonce)
        },
        permissions,
        expiresAt
      );
      
      const response: ApiResponse = {
        success: true,
        data: {
          id: delegation.id,
          linkedAccountId: delegation.linkedAccountId,
          sessionWallet: delegation.sessionWallet,
          chainId: delegation.chainId,
          permissions: delegation.permissions,
          expiresAt: delegation.expiresAt,
          isActive: delegation.isActive,
          createdAt: delegation.createdAt
        }
      };
      
      res.json(response);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new AppError('Invalid signed authorization', 400, 'VALIDATION_ERROR', error.errors);
      }
      throw error;
    }
  }
  
  /**
   * GET /api/v1/profiles/:profileId/delegations
   * Get all active delegations for a profile
   */
  async getProfileDelegations(req: Request, res: Response): Promise<void> {
    const { profileId } = req.params;
    const userId = req.user!.userId!;
    
    const delegations = await delegationService.getProfileDelegations(userId, profileId!);
    
    const response: ApiResponse = {
      success: true,
      data: delegations.map(d => ({
        id: d.id,
        linkedAccount: {
          id: d.linkedAccountId,
          address: (d as any).linkedAccount.address,
          customName: (d as any).linkedAccount.customName
        },
        sessionWallet: d.sessionWallet,
        chainId: d.chainId,
        permissions: d.permissions,
        expiresAt: d.expiresAt,
        isActive: d.isActive,
        createdAt: d.createdAt
      }))
    };
    
    res.json(response);
  }
  
  /**
   * DELETE /api/v1/profiles/:profileId/delegations/:delegationId
   * Revoke a delegation
   */
  async revokeDelegation(req: Request, res: Response): Promise<void> {
    const { profileId, delegationId } = req.params;
    const userId = req.user!.userId!;
    
    await delegationService.revokeDelegation(userId, delegationId!);
    
    const response: ApiResponse = {
      success: true,
      message: 'Delegation revoked successfully'
    };
    
    res.json(response);
  }
  
  /**
   * POST /api/v1/profiles/:profileId/execute-delegated
   * Execute a transaction using delegation
   */
  async executeDelegated(req: Request, res: Response): Promise<void> {
    try {
      const { profileId } = req.params;
      const userId = req.user!.userId!;
      
      // Validate request
      const validatedData = executeDelegatedSchema.parse(req.body);
      const { delegationId } = req.body;
      
      if (!delegationId) {
        throw new AppError('delegationId is required', 400);
      }
      
      // Execute the delegated transaction
      const result = await delegationService.executeWithDelegation(
        userId,
        delegationId,
        validatedData
      );
      
      const response: ApiResponse = {
        success: true,
        data: {
          hash: result.hash,
          chainId: validatedData.chainId,
          from: 'delegated',
          to: validatedData.to,
          value: validatedData.value
        }
      };
      
      res.json(response);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new AppError('Invalid transaction data', 400, 'VALIDATION_ERROR', error.errors);
      }
      throw error;
    }
  }
  
  /**
   * GET /api/v1/profiles/:profileId/execution-path
   * Determine the best execution path for a transaction
   */
  async getExecutionPath(req: Request, res: Response): Promise<void> {
    const { profileId } = req.params;
    const { to, value = '0', data = '0x', chainId } = req.query;
    
    if (!to || !chainId) {
      throw new AppError('to and chainId are required', 400);
    }
    
    const path = await delegationService.determineBestExecutionPath(
      profileId!,
      {
        to: to as string,
        value: value as string,
        data: data as string,
        chainId: Number(chainId)
      }
    );
    
    const response: ApiResponse = {
      success: true,
      data: {
        recommendedPath: path,
        reason: path === 'delegated' 
          ? 'Linked account has active delegation - gas-free execution available'
          : 'No active delegation - will execute through session wallet'
      }
    };
    
    res.json(response);
  }
}

export const delegationController = new DelegationController();