import { Request, Response } from 'express';
import { socialAuthService } from '@/services/socialAuthService';
import { authService } from '@/services/authService';
import { ApiResponse } from '@/types';

export class AuthController {
  
  /**
   * Authenticate using a custom auth token
   */
  async authenticate(req: Request, res: Response): Promise<void> {
    try {
      const { 
        authToken, 
        authStrategy, 
        deviceId, 
        deviceName, 
        deviceType,
        walletAddress,
        email,
        socialData,
        socialProfile,
        socialProvider
      } = req.body;

      if (!authToken || !authStrategy) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields: authToken, authStrategy'
        } as ApiResponse);
        return;
      }

      // Handle both socialData and socialProfile formats
      let processedSocialData = socialData;
      
      // If socialProfile is provided (Telegram format), convert it to socialData format
      if (!socialData && socialProfile && socialProvider) {
        processedSocialData = {
          provider: socialProvider,
          providerId: socialProfile.id || walletAddress || `${socialProvider}_${Date.now()}`,
          username: socialProfile.name,
          displayName: socialProfile.name,
          // For Telegram, we may not have all details initially
        };
      }

      const tokens = await socialAuthService.authenticate({
        authToken,
        authStrategy,
        deviceId: deviceId || null,
        deviceName: deviceName || 'Unknown Device',
        deviceType: deviceType || 'web',
        walletAddress,
        email,
        socialData: processedSocialData
      });

      res.status(200).json({
        success: true,
        data: tokens,
        message: 'Authentication successful'
      } as ApiResponse);
    } catch (error: any) {
      console.error('Auth error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Authentication failed'
      } as ApiResponse);
    }
  }

  /**
   * Link additional auth method to existing user
   */
  async linkAuthMethod(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        } as ApiResponse);
        return;
      }

      const { authToken, authStrategy, walletAddress, email, socialData } = req.body;

      if (!authToken || !authStrategy) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields: authToken, authStrategy'
        } as ApiResponse);
        return;
      }

      await socialAuthService.linkAuthMethod(userId, {
        authToken,
        authStrategy,
        walletAddress,
        email,
        socialData
      });

      res.status(200).json({
        success: true,
        message: 'Auth method linked successfully'
      } as ApiResponse);
    } catch (error: any) {
      console.error('Link auth method error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to link auth method'
      } as ApiResponse);
    }
  }

  /**
   * Get current user information
   */
  async getCurrentUser(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        } as ApiResponse);
        return;
      }

      const user = await socialAuthService.getUserById(userId);

      res.status(200).json({
        success: true,
        data: user
      } as ApiResponse);
    } catch (error: any) {
      console.error('Get user error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to get user'
      } as ApiResponse);
    }
  }

  /**
   * Refresh access token
   */
  async refreshToken(req: Request, res: Response): Promise<void> {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        res.status(400).json({
          success: false,
          error: 'Refresh token required'
        } as ApiResponse);
        return;
      }

      const tokens = await authService.refreshAccessToken(refreshToken);

      res.status(200).json({
        success: true,
        data: tokens
      } as ApiResponse);
    } catch (error: any) {
      console.error('Refresh token error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to refresh token'
      } as ApiResponse);
    }
  }

  /**
   * Logout
   */
  async logout(req: Request, res: Response): Promise<void> {
    try {
      const { refreshToken } = req.body;

      if (refreshToken) {
        await authService.logout(refreshToken);
      }

      res.status(200).json({
        success: true,
        message: 'Logged out successfully'
      } as ApiResponse);
    } catch (error: any) {
      console.error('Logout error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to logout'
      } as ApiResponse);
    }
  }

  /**
   * Get user devices
   */
  async getUserDevices(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        } as ApiResponse);
        return;
      }

      const devices = await authService.getUserDevices(userId);

      res.status(200).json({
        success: true,
        data: devices
      } as ApiResponse);
    } catch (error: any) {
      console.error('Get devices error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to get devices'
      } as ApiResponse);
    }
  }

  /**
   * Deactivate a device
   */
  async deactivateDevice(req: Request, res: Response): Promise<void> {
    try {
      const { deviceId } = req.params;

      if (!deviceId) {
        res.status(400).json({
          success: false,
          error: 'Device ID required'
        } as ApiResponse);
        return;
      }

      await authService.deactivateDevice(deviceId);

      res.status(200).json({
        success: true,
        message: 'Device deactivated successfully'
      } as ApiResponse);
    } catch (error: any) {
      console.error('Deactivate device error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to deactivate device'
      } as ApiResponse);
    }
  }
}

export const authController = new AuthController();
