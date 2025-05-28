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

      const { name } = req.body;

      if (!name) {
        res.status(400).json({
          success: false,
          error: 'Profile name is required'
        } as ApiResponse);
        return;
      }

      const profile = await smartProfileService.createProfile(userId, { name });

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
}

export const smartProfileController = new SmartProfileController();
