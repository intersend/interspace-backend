import { Request, Response } from 'express';
import { passkeyService } from '@/services/passkeyService';
import { authService } from '@/services/authService';
import { ApiResponse } from '@/types';

export class PasskeyController {
  /**
   * Generate registration options for creating a new passkey
   */
  async generateRegistrationOptions(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        } as ApiResponse);
        return;
      }

      const { deviceName } = req.body;
      const user = req.user;

      const options = await passkeyService.generateRegistrationOptions({
        userId,
        username: user.email || user.id,
        displayName: user.email,
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
      const userId = req.user?.userId;
      if (!userId) {
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

      const result = await passkeyService.verifyRegistration(
        userId,
        response,
        challenge,
        deviceName
      );

      if (!result.verified) {
        res.status(400).json({
          success: false,
          error: 'Passkey registration failed'
        } as ApiResponse);
        return;
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

      if (!result.verified || !result.userId) {
        res.status(400).json({
          success: false,
          error: 'Passkey authentication failed'
        } as ApiResponse);
        return;
      }

      // Generate tokens
      const tokens = await authService.generateTokensForUser(
        result.userId,
        deviceId || 'unknown',
        deviceName,
        deviceType || 'web'
      );

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

      const passkeys = await passkeyService.getUserPasskeys(userId);

      res.status(200).json({
        success: true,
        data: passkeys
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

      await passkeyService.deletePasskey(userId, credentialId);

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