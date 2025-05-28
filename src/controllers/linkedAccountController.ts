import { Request, Response } from 'express';
import { linkedAccountService } from '@/services/linkedAccountService';
import { ApiResponse } from '@/types';

export class LinkedAccountController {
  
  /**
   * Link an external account to a profile
   */
  async linkAccount(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        } as ApiResponse);
        return;
      }

      const { profileId } = req.params;
      const { address, walletType, customName, chainId, signature, message } = req.body;

      if (!profileId || !address || !walletType || !signature || !message) {
        res.status(400).json({
          success: false,
          error: 'Profile ID, address, wallet type, signature, and message are required'
        } as ApiResponse);
        return;
      }

      const account = await linkedAccountService.linkAccount(profileId, userId, {
        address,
        walletType,
        customName,
        chainId,
        signature,
        message
      });

      res.status(201).json({
        success: true,
        data: account,
        message: 'Account linked successfully'
      } as ApiResponse);
    } catch (error: any) {
      console.error('Link account error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to link account'
      } as ApiResponse);
    }
  }

  /**
   * Get all linked accounts for a profile
   */
  async getProfileAccounts(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        } as ApiResponse);
        return;
      }

      const { profileId } = req.params;

      if (!profileId) {
        res.status(400).json({
          success: false,
          error: 'Profile ID is required'
        } as ApiResponse);
        return;
      }

      const accounts = await linkedAccountService.getProfileAccounts(profileId, userId);

      res.status(200).json({
        success: true,
        data: accounts
      } as ApiResponse);
    } catch (error: any) {
      console.error('Get accounts error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to get accounts'
      } as ApiResponse);
    }
  }

  /**
   * Update a linked account
   */
  async updateLinkedAccount(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        } as ApiResponse);
        return;
      }

      const { accountId } = req.params;
      const { customName, isPrimary } = req.body;

      if (!accountId) {
        res.status(400).json({
          success: false,
          error: 'Account ID is required'
        } as ApiResponse);
        return;
      }

      const account = await linkedAccountService.updateLinkedAccount(accountId, userId, {
        customName,
        isPrimary
      });

      res.status(200).json({
        success: true,
        data: account,
        message: 'Account updated successfully'
      } as ApiResponse);
    } catch (error: any) {
      console.error('Update account error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to update account'
      } as ApiResponse);
    }
  }

  /**
   * Unlink an account
   */
  async unlinkAccount(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        } as ApiResponse);
        return;
      }

      const { accountId } = req.params;

      if (!accountId) {
        res.status(400).json({
          success: false,
          error: 'Account ID is required'
        } as ApiResponse);
        return;
      }

      await linkedAccountService.unlinkAccount(accountId, userId);

      res.status(200).json({
        success: true,
        message: 'Account unlinked successfully'
      } as ApiResponse);
    } catch (error: any) {
      console.error('Unlink account error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to unlink account'
      } as ApiResponse);
    }
  }

  /**
   * Grant token allowance to session wallet
   */
  async grantTokenAllowance(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        } as ApiResponse);
        return;
      }

      const { accountId } = req.params;
      const { tokenAddress, allowanceAmount, chainId } = req.body;

      if (!accountId || !tokenAddress || !allowanceAmount || !chainId) {
        res.status(400).json({
          success: false,
          error: 'Account ID, token address, allowance amount, and chain ID are required'
        } as ApiResponse);
        return;
      }

      const allowance = await linkedAccountService.grantTokenAllowance(accountId, userId, {
        tokenAddress,
        allowanceAmount,
        chainId
      });

      res.status(201).json({
        success: true,
        data: allowance,
        message: 'Token allowance granted successfully'
      } as ApiResponse);
    } catch (error: any) {
      console.error('Grant allowance error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to grant token allowance'
      } as ApiResponse);
    }
  }

  /**
   * Get token allowances for an account
   */
  async getAccountAllowances(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        } as ApiResponse);
        return;
      }

      const { accountId } = req.params;

      if (!accountId) {
        res.status(400).json({
          success: false,
          error: 'Account ID is required'
        } as ApiResponse);
        return;
      }

      const allowances = await linkedAccountService.getAccountAllowances(accountId, userId);

      res.status(200).json({
        success: true,
        data: allowances
      } as ApiResponse);
    } catch (error: any) {
      console.error('Get allowances error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to get allowances'
      } as ApiResponse);
    }
  }

  /**
   * Revoke token allowance
   */
  async revokeTokenAllowance(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        } as ApiResponse);
        return;
      }

      const { allowanceId } = req.params;

      if (!allowanceId) {
        res.status(400).json({
          success: false,
          error: 'Allowance ID is required'
        } as ApiResponse);
        return;
      }

      await linkedAccountService.revokeTokenAllowance(allowanceId, userId);

      res.status(200).json({
        success: true,
        message: 'Token allowance revoked successfully'
      } as ApiResponse);
    } catch (error: any) {
      console.error('Revoke allowance error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to revoke allowance'
      } as ApiResponse);
    }
  }
}

export const linkedAccountController = new LinkedAccountController();
