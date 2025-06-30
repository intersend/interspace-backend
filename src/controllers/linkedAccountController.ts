import { Request, Response } from 'express';
import { linkedAccountService } from '@/services/linkedAccountService';
import { ApiResponse } from '@/types';

export class LinkedAccountController {
  
  /**
   * Link an external account to a profile
   */
  async linkAccount(req: Request, res: Response): Promise<void> {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      const userId = req.user?.userId;
      if (!userId) {
        console.log(`❌ [${requestId}] Authentication required - no userId in request`);
        res.status(401).json({
          success: false,
          error: 'Authentication required',
          requestId
        } as ApiResponse);
        return;
      }

      const { profileId } = req.params;
      const { address, walletType, customName, chainId, signature, message, isPrimary } = req.body;

      // Enhanced request logging
      console.log(`🔗 [${requestId}] Link account request received:`, {
        profileId,
        userId,
        requestBody: {
          address: address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'missing',
          walletType,
          customName,
          chainId,
          hasSignature: !!signature,
          hasMessage: !!message,
          isPrimary,
          signatureLength: signature ? signature.length : 0,
          messageLength: message ? message.length : 0
        },
        headers: {
          'content-type': req.headers['content-type'],
          'user-agent': req.headers['user-agent']?.slice(0, 100)
        },
        timestamp: new Date().toISOString()
      });

      // Basic validation
      if (!profileId || !address || !walletType) {
        const missingFields = [];
        if (!profileId) missingFields.push('profileId');
        if (!address) missingFields.push('address');
        if (!walletType) missingFields.push('walletType');

        console.log(`❌ [${requestId}] Missing required fields:`, missingFields);
        
        const response: ApiResponse = {
          success: false,
          error: `Missing required fields: ${missingFields.join(', ')}`,
          requestId
        };

        // Add debug info only in development
        if (process.env.NODE_ENV === 'development') {
          (response as any).debugInfo = {
            operation: 'linkAccount',
            profileId,
            receivedFields: Object.keys(req.body),
            requiredFields: ['profileId', 'address', 'walletType'],
            missingFields,
            timestamp: new Date().toISOString()
          };
        }

        res.status(400).json(response);
        return;
      }

      // Flexible signature validation for development and test wallets
      const isDevelopment = process.env.NODE_ENV === 'development';
      const isTestWallet = walletType === 'test' || walletType === 'metamask' && isDevelopment;
      
      if (!isDevelopment && !isTestWallet && (!signature || !message)) {
        console.log(`❌ [${requestId}] Missing signature/message for production wallet linking`);
        
        const response: ApiResponse = {
          success: false,
          error: 'Signature and message are required for wallet verification',
          requestId
        };

        // Add debug info only in development
        if (isDevelopment) {
          (response as any).debugInfo = {
            isDevelopment,
            isTestWallet,
            walletType,
            hasSignature: !!signature,
            hasMessage: !!message
          };
        }

        res.status(400).json(response);
        return;
      }

      console.log(`📞 [${requestId}] Calling linkedAccountService.linkAccount with:`, {
        profileId,
        userId,
        address: `${address.slice(0, 6)}...${address.slice(-4)}`,
        walletType,
        customName: customName || 'No custom name',
        chainId: chainId || 'No chainId',
        hasSignature: !!signature,
        hasMessage: !!message,
        verificationMode: isDevelopment ? 'development' : 'production'
      });

      const account = await linkedAccountService.linkAccount(profileId, userId, {
        address,
        walletType,
        customName,
        chainId,
        signature: signature || 'dev_bypass', // Provide default for development
        message: message || 'dev_bypass',
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });

      console.log(`✅ [${requestId}] Account linked successfully:`, {
        accountId: account.id,
        address: `${account.address.slice(0, 6)}...${account.address.slice(-4)}`,
        walletType: account.walletType,
        isPrimary: account.isPrimary,
        customName: account.customName
      });

      res.status(201).json({
        success: true,
        data: account,
        message: 'Account linked successfully',
        requestId
      } as ApiResponse);
    } catch (error: any) {
      console.error(`❌ [${requestId}] Link account failed:`, {
        error: error.message,
        errorCode: error.code,
        statusCode: error.statusCode,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        profileId: req.params.profileId,
        address: req.body.address ? `${req.body.address.slice(0, 6)}...${req.body.address.slice(-4)}` : 'missing',
        walletType: req.body.walletType,
        timestamp: new Date().toISOString()
      });

      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to link account',
        operation: 'linkAccount',
        requestId,
        timestamp: new Date().toISOString(),
        ...(process.env.NODE_ENV === 'development' && {
          debugInfo: {
            stack: error.stack,
            errorCode: error.code
          }
        })
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
   * Search for a profile that owns a specific EOA address
   */
  async searchAccountByAddress(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        } as ApiResponse);
        return;
      }

      const { address } = req.query;

      if (!address || typeof address !== 'string') {
        res.status(400).json({
          success: false,
          error: 'Valid Ethereum address required',
          statusCode: 400
        } as ApiResponse);
        return;
      }

      // Validate Ethereum address format
      const ethereumAddressRegex = /^0x[a-fA-F0-9]{40}$/;
      if (!ethereumAddressRegex.test(address)) {
        res.status(400).json({
          success: false,
          error: 'Valid Ethereum address required',
          statusCode: 400
        } as ApiResponse);
        return;
      }

      const result = await linkedAccountService.searchAccountByAddress(address);

      if (!result) {
        res.status(200).json({
          success: true,
          data: null
        } as ApiResponse);
        return;
      }

      res.status(200).json({
        success: true,
        data: result
      } as ApiResponse);
    } catch (error: any) {
      console.error('Search account error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        statusCode: 500
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
      
      // Debug logging
      console.log('UnlinkAccount request:', {
        userId,
        accountId: req.params.accountId,
        isV2Auth: (req as any).isV2Auth,
        v2Account: (req as any).v2Account?.id,
        user: req.user
      });
      
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
