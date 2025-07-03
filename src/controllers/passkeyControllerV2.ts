import { Request, Response } from 'express';
import { passkeyService } from '../services/passkeyService';
import { logger } from '../utils/logger';
import { AuthenticationError } from '../types';

class PasskeyControllerV2 {
  /**
   * Generate passkey registration options
   */
  async generateRegistrationOptions(req: Request, res: Response) {
    try {
      const { username, displayName, deviceName } = req.body;
      const accountId = req.account?.id;

      if (!accountId) {
        throw new AuthenticationError('Authentication required');
      }

      const options = await passkeyService.generateRegistrationOptions({
        accountId,
        username,
        displayName,
        deviceName
      });

      return res.json({
        success: true,
        data: options
      });
    } catch (error: any) {
      logger.error('Generate passkey registration options error:', error);
      return res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to generate registration options'
      });
    }
  }

  /**
   * Verify passkey registration
   */
  async verifyRegistration(req: Request, res: Response) {
    try {
      const { response, challenge, username, displayName, deviceName } = req.body;
      const accountId = req.account?.id;

      if (!accountId) {
        throw new AuthenticationError('Authentication required');
      }

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

      return res.json({
        success: true,
        data: result
      });
    } catch (error: any) {
      logger.error('Verify passkey registration error:', error);
      return res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to verify registration'
      });
    }
  }

  /**
   * Generate passkey authentication options
   */
  async generateAuthenticationOptions(req: Request, res: Response) {
    try {
      const { username } = req.body;
      const accountId = req.account?.id;

      const options = await passkeyService.generateAuthenticationOptions({
        accountId,
        username
      });

      return res.json({
        success: true,
        data: options
      });
    } catch (error: any) {
      logger.error('Generate passkey authentication options error:', error);
      return res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to generate authentication options'
      });
    }
  }

  /**
   * Verify passkey authentication
   */
  async verifyAuthentication(req: Request, res: Response) {
    try {
      const { response, challenge } = req.body;

      const result = await passkeyService.verifyAuthentication(
        response,
        challenge
      );

      // Generate tokens for the authenticated account
      if (result.verified && result.accountId) {
        // Import authService to generate tokens
        const { authService } = require('../services/authService');
        const tokens = await authService.generateTokens({
          accountId: result.accountId
        });

        return res.json({
          success: true,
          data: {
            verified: true,
            accountId: result.accountId,
            credentialId: result.credentialId,
            tokens
          }
        });
      }

      return res.json({
        success: true,
        data: result
      });
    } catch (error: any) {
      logger.error('Verify passkey authentication error:', error);
      return res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to verify authentication'
      });
    }
  }

  /**
   * Generate passkey registration options for new users (no auth required)
   */
  async generateNewUserRegistrationOptions(req: Request, res: Response) {
    try {
      const { username, displayName, deviceName } = req.body;

      // For new users, we don't have an accountId yet
      // Generate options without requiring authentication
      const options = await passkeyService.generateRegistrationOptionsForNewUser({
        username,
        displayName,
        deviceName
      });

      return res.json({
        success: true,
        data: options
      });
    } catch (error: any) {
      logger.error('Generate new user passkey registration options error:', error);
      return res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to generate registration options'
      });
    }
  }

  /**
   * Register a new passkey and create a new account
   */
  async registerNewUserWithPasskey(req: Request, res: Response) {
    try {
      const { response, challenge, username, displayName, deviceName } = req.body;

      // Create new account with passkey
      const result = await passkeyService.registerNewUserWithPasskey(
        response,
        challenge,
        {
          username,
          displayName,
          deviceName
        }
      );

      // The result should include the new account and tokens
      return res.json({
        success: true,
        data: result
      });
    } catch (error: any) {
      logger.error('Register new user with passkey error:', error);
      return res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to register new user with passkey'
      });
    }
  }
}

export const passkeyControllerV2 = new PasskeyControllerV2();