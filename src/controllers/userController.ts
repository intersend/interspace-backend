import { Request, Response } from 'express';
import { userService } from '@/services/userService';
import { ApiResponse, UserResponse, SocialAccountResponse, LinkSocialAccountRequest } from '@/types';

export class UserController {
  
  /**
   * Get current user profile
   * GET /users/me
   */
  async getCurrentUser(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId!;
      const user = await userService.getUserProfile(userId);
      
      const response: ApiResponse<UserResponse> = {
        success: true,
        data: user
      };
      
      res.json(response);
    } catch (error: any) {
      console.error('Get current user error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to get user profile'
      });
    }
  }

  /**
   * Get user's social accounts
   * GET /users/me/social-accounts
   */
  async getSocialAccounts(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId!;
      const socialAccounts = await userService.getUserSocialAccounts(userId);
      
      const response: ApiResponse<SocialAccountResponse[]> = {
        success: true,
        data: socialAccounts
      };
      
      res.json(response);
    } catch (error: any) {
      console.error('Get social accounts error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to get social accounts'
      });
    }
  }

  /**
   * Link a social account
   * POST /users/me/social-accounts
   */
  async linkSocialAccount(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId!;
      const data: LinkSocialAccountRequest = req.body;
      
      const socialAccount = await userService.linkSocialAccount(userId, data);
      
      const response: ApiResponse<SocialAccountResponse> = {
        success: true,
        data: socialAccount,
        message: `${data.provider} account linked successfully`
      };
      
      res.status(201).json(response);
    } catch (error: any) {
      console.error('Link social account error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to link social account'
      });
    }
  }

  /**
   * Unlink a social account
   * DELETE /users/me/social-accounts/:id
   */
  async unlinkSocialAccount(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId!;
      const { id } = req.params;
      
      if (!id) {
        res.status(400).json({
          success: false,
          error: 'Social account ID is required'
        });
        return;
      }
      
      await userService.unlinkSocialAccount(userId, id);
      
      const response: ApiResponse = {
        success: true,
        message: 'Social account unlinked successfully'
      };
      
      res.json(response);
    } catch (error: any) {
      console.error('Unlink social account error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to unlink social account'
      });
    }
  }
}

export const userController = new UserController();
