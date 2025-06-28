import { Request, Response } from 'express';
import { passkeyService } from '@/services/passkeyService';
import { authService } from '@/services/authService';
import { userService } from '@/services/userService';
import { ApiResponse } from '@/types';
const { generateTokens } = require('@/utils/tokenUtils');
const { v4: uuidv4 } = require('uuid');

export class PasskeyController {
  /**
   * Generate registration options for creating a new passkey
   */
  async generateRegistrationOptions(req: Request, res: Response): Promise<void> {
    try {
      // V2 uses account-based authentication
      const accountId = req.account?.id;
      if (!accountId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        } as ApiResponse);
        return;
      }

      const { deviceName } = req.body;
      
      // Extract user info from account metadata
      let username = req.account.metadata?.email || req.account.identifier;
      let displayName = req.account.metadata?.name || req.account.metadata?.email || 'User';
      
      const options = await passkeyService.generateRegistrationOptions({
        accountId,
        username,
        displayName,
        deviceName
      });

      res.status(200).json({
        success: true,
        data: options
      } as ApiResponse);
    } catch (error: any) {
      console.error('Generate registration options error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to generate registration options'
      } as ApiResponse);
    }
  }

  /**
   * Verify registration response and save passkey
   */
  async verifyRegistration(req: Request, res: Response): Promise<void> {
    try {
      // V2 uses account-based authentication
      const accountId = req.account?.id;
      if (!accountId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        } as ApiResponse);
        return;
      }

      const { response, challenge, deviceName } = req.body;

      if (!response || !challenge) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields: response, challenge'
        } as ApiResponse);
        return;
      }

      // Extract user info from account metadata
      const username = req.account.metadata?.email || req.account.identifier;
      const displayName = req.account.metadata?.name || req.account.metadata?.email || 'User';

      const result = await passkeyService.verifyRegistration(
        response,
        challenge,
        {
          accountId,
          username,
          displayName,
          deviceName
        }
      );

      if (!result.verified || !result.credentialId) {
        res.status(400).json({
          success: false,
          error: 'Passkey registration failed'
        } as ApiResponse);
        return;
      }

      // The passkey account is already created in passkeyService.verifyRegistration
      // Now we just need to link it to the current account
      const accountService = await import('@/services/accountService');
      const passkeyAccount = await accountService.default.findAccountByIdentifier({
        type: 'passkey',
        identifier: result.credentialId
      });

      if (passkeyAccount) {
        await accountService.default.linkAccounts(
          accountId,
          passkeyAccount.id,
          'direct',
          'linked'
        );
        console.log(`✅ Passkey account ${passkeyAccount.id} linked to account ${accountId}`);
      } else {
        console.error(`❌ Passkey account not found for credential: ${result.credentialId}`);
      }

      res.status(200).json({
        success: true,
        data: {
          verified: true,
          credentialId: result.credentialId
        },
        message: 'Passkey registered successfully'
      } as ApiResponse);
    } catch (error: any) {
      console.error('Verify registration error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to verify registration'
      } as ApiResponse);
    }
  }

  /**
   * Generate authentication options for signing in with passkey
   */
  async generateAuthenticationOptions(req: Request, res: Response): Promise<void> {
    try {
      const { username } = req.body;

      const options = await passkeyService.generateAuthenticationOptions({
        username
      });

      res.status(200).json({
        success: true,
        data: options
      } as ApiResponse);
    } catch (error: any) {
      console.error('Generate authentication options error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to generate authentication options'
      } as ApiResponse);
    }
  }

  /**
   * Verify authentication response and sign in user
   */
  async verifyAuthentication(req: Request, res: Response): Promise<void> {
    try {
      const { response, challenge, deviceId, deviceName, deviceType } = req.body;


      if (!response || !challenge) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields: response, challenge'
        } as ApiResponse);
        return;
      }

      const result = await passkeyService.verifyAuthentication(
        response,
        challenge
      );

      if (!result.verified || !result.accountId) {
        res.status(400).json({
          success: false,
          error: 'Passkey authentication failed'
        } as ApiResponse);
        return;
      }

      // Create session for V2
      const accountService = await import('@/services/accountService');
      const session = await accountService.default.createSession(result.accountId, {
        deviceId: deviceId || 'unknown',
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip
      });

      // Generate V2 tokens
      const { accessToken, refreshToken, expiresIn } = await generateTokens({
        accountId: result.accountId,
        sessionToken: session.sessionToken,
        deviceId: deviceId || 'unknown'
      });
      
      const tokens = {
        accessToken,
        refreshToken,
        expiresIn,
        tokenType: 'Bearer'
      };

      res.status(200).json({
        success: true,
        data: tokens,
        message: 'Authentication successful'
      } as ApiResponse);
    } catch (error: any) {
      console.error('Verify authentication error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to verify authentication'
      } as ApiResponse);
    }
  }

  /**
   * Get user's passkeys
   */
  async getUserPasskeys(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        } as ApiResponse);
        return;
      }

      // V2: Passkeys are managed through the account system
      throw new Error('This method is not supported in V2. Use account management APIs.');

      res.status(200).json({
        success: true,
        data: []  // V2: Passkeys are managed through the account system
      } as ApiResponse);
    } catch (error: any) {
      console.error('Get user passkeys error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to get passkeys'
      } as ApiResponse);
    }
  }

  /**
   * Delete a passkey
   */
  async deletePasskey(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        } as ApiResponse);
        return;
      }

      const { credentialId } = req.params;

      if (!credentialId) {
        res.status(400).json({
          success: false,
          error: 'Credential ID required'
        } as ApiResponse);
        return;
      }

      // V2: Passkeys are managed through the account system
      throw new Error('This method is not supported in V2. Use account management APIs.');

      res.status(200).json({
        success: true,
        message: 'Passkey deleted successfully'
      } as ApiResponse);
    } catch (error: any) {
      console.error('Delete passkey error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to delete passkey'
      } as ApiResponse);
    }
  }
}

export const passkeyController = new PasskeyController();