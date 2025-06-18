import { Request, Response } from 'express';
import { smartProfileService } from '@/services/smartProfileService';
import { ApiResponse } from '@/types';

export class SmartProfileController {
  
  /**
   * Create a new SmartProfile
   */
  async createProfile(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        } as ApiResponse);
        return;
      }

      console.log('Raw request body:', JSON.stringify(req.body));
      
      const { name, clientShare, developmentMode } = req.body;
      
      console.log('Profile creation request parsing:', {
        name,
        hasClientShare: !!clientShare,
        developmentMode,
        developmentModeType: typeof developmentMode,
        developmentModeValue: developmentMode,
        developmentModeStringified: JSON.stringify(developmentMode)
      });

      if (!name) {
        res.status(400).json({
          success: false,
          error: 'Profile name is required'
        } as ApiResponse);
        return;
      }

      // Don't require clientShare for development mode
      // Check for both boolean true and string "true"
      const isDevelopmentMode = developmentMode === true || developmentMode === 'true' || developmentMode === 1 || developmentMode === '1';
      
      console.log('Development mode check:', {
        originalValue: developmentMode,
        isDevelopmentMode,
        checkResults: {
          'equals true': developmentMode === true,
          'equals "true"': developmentMode === 'true',
          'equals 1': developmentMode === 1,
          'equals "1"': developmentMode === '1'
        }
      });
      
      if (!isDevelopmentMode && !clientShare) {
        console.log('ClientShare validation failed:', {
          isDevelopmentMode,
          hasClientShare: !!clientShare,
          developmentMode
        });
        res.status(400).json({
          success: false,
          error: 'clientShare is required'
        } as ApiResponse);
        return;
      }

      console.log(`Creating profile for user ${userId} with developmentMode: ${isDevelopmentMode}`);
      
      const profile = await smartProfileService.createProfile(userId, { 
        name, 
        clientShare,
        developmentMode: isDevelopmentMode
      });

      console.log('Profile created successfully, sending response:', {
        profileId: profile.id,
        isDevelopmentWallet: profile.isDevelopmentWallet,
        hasClientShare: !!profile.clientShare
      });

      res.status(201).json({
        success: true,
        data: profile,
        message: 'SmartProfile created successfully'
      } as ApiResponse);
    } catch (error: any) {
      console.error('Create profile error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to create profile'
      } as ApiResponse);
    }
  }

  /**
   * Get all profiles for the authenticated user
   */
  async getUserProfiles(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        } as ApiResponse);
        return;
      }

      const profiles = await smartProfileService.getUserProfiles(userId);

      res.status(200).json({
        success: true,
        data: profiles
      } as ApiResponse);
    } catch (error: any) {
      console.error('Get profiles error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to get profiles'
      } as ApiResponse);
    }
  }

  /**
   * Get a specific profile by ID
   */
  async getProfileById(req: Request, res: Response): Promise<void> {
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

      const profile = await smartProfileService.getProfileById(profileId, userId);

      res.status(200).json({
        success: true,
        data: profile
      } as ApiResponse);
    } catch (error: any) {
      console.error('Get profile error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to get profile'
      } as ApiResponse);
    }
  }

  /**
   * Update a profile
   */
  async updateProfile(req: Request, res: Response): Promise<void> {
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
      const { name, isActive } = req.body;

      if (!profileId) {
        res.status(400).json({
          success: false,
          error: 'Profile ID is required'
        } as ApiResponse);
        return;
      }

      const profile = await smartProfileService.updateProfile(profileId, userId, {
        name,
        isActive
      });

      res.status(200).json({
        success: true,
        data: profile,
        message: 'Profile updated successfully'
      } as ApiResponse);
    } catch (error: any) {
      console.error('Update profile error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to update profile'
      } as ApiResponse);
    }
  }

  /**
   * Delete a profile
   */
  async deleteProfile(req: Request, res: Response): Promise<void> {
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

      await smartProfileService.deleteProfile(profileId, userId);

      res.status(200).json({
        success: true,
        message: 'Profile deleted successfully'
      } as ApiResponse);
    } catch (error: any) {
      console.error('Delete profile error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to delete profile'
      } as ApiResponse);
    }
  }

  /**
   * Get the active profile for the user
   */
  async getActiveProfile(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        } as ApiResponse);
        return;
      }

      const profile = await smartProfileService.getActiveProfile(userId);

      res.status(200).json({
        success: true,
        data: profile
      } as ApiResponse);
    } catch (error: any) {
      console.error('Get active profile error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to get active profile'
      } as ApiResponse);
    }
  }

  /**
   * Switch the active profile
   */
  async switchActiveProfile(req: Request, res: Response): Promise<void> {
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

      const profile = await smartProfileService.switchActiveProfile(profileId, userId);

      res.status(200).json({
        success: true,
        data: profile,
        message: 'Active profile switched successfully'
      } as ApiResponse);
    } catch (error: any) {
      console.error('Switch profile error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to switch active profile'
      } as ApiResponse);
    }
  }

  /**
   * Rotate the session wallet for a profile
   */
  async rotateSessionWallet(req: Request, res: Response): Promise<void> {
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

      const clientShare = await smartProfileService.rotateSessionWallet(profileId, userId);

      res.status(200).json({
        success: true,
        data: { clientShare },
        message: 'Session wallet rotated successfully'
      } as ApiResponse);
    } catch (error: any) {
      console.error('Rotate wallet error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to rotate session wallet'
      } as ApiResponse);
    }
  }

  // Social profile methods have been moved to UserController
  // Use /users/me/social-accounts endpoints instead
}

export const smartProfileController = new SmartProfileController();
