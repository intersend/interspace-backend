import { Request, Response } from 'express';
import { appsService } from '@/services/appsService';
import { ApiResponse } from '@/types';

export class AppsController {
  
  /**
   * Create a new bookmarked app
   */
  async createApp(req: Request, res: Response): Promise<void> {
    try {
      // Support both V1 (userId) and V2 (id) auth formats
      const userId = req.user?.userId || (req.user as any)?.id;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        } as ApiResponse);
        return;
      }

      const { profileId } = req.params;
      const { name, url, iconUrl, folderId, position } = req.body;

      if (!profileId || !name || !url) {
        res.status(400).json({
          success: false,
          error: 'Profile ID, app name, and URL are required'
        } as ApiResponse);
        return;
      }

      const app = await appsService.createApp(profileId, userId, {
        name,
        url,
        iconUrl,
        folderId,
        position
      });

      res.status(201).json({
        success: true,
        data: app,
        message: 'App bookmarked successfully'
      } as ApiResponse);
    } catch (error: any) {
      console.error('Create app error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to bookmark app'
      } as ApiResponse);
    }
  }

  /**
   * Get all apps for a profile
   */
  async getProfileApps(req: Request, res: Response): Promise<void> {
    try {
      // Support both V1 (userId) and V2 (id) auth formats
      const userId = req.user?.userId || (req.user as any)?.id;
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

      const apps = await appsService.getProfileApps(profileId, userId);

      res.status(200).json({
        success: true,
        data: apps
      } as ApiResponse);
    } catch (error: any) {
      console.error('Get apps error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to get apps'
      } as ApiResponse);
    }
  }

  /**
   * Get apps in a specific folder
   */
  async getFolderApps(req: Request, res: Response): Promise<void> {
    try {
      // Support both V1 (userId) and V2 (id) auth formats
      const userId = req.user?.userId || (req.user as any)?.id;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        } as ApiResponse);
        return;
      }

      const { profileId, folderId } = req.params;

      if (!profileId || !folderId) {
        res.status(400).json({
          success: false,
          error: 'Profile ID and Folder ID are required'
        } as ApiResponse);
        return;
      }

      const apps = await appsService.getFolderApps(folderId, profileId, userId);

      res.status(200).json({
        success: true,
        data: apps
      } as ApiResponse);
    } catch (error: any) {
      console.error('Get folder apps error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to get folder apps'
      } as ApiResponse);
    }
  }

  /**
   * Get root level apps (not in any folder)
   */
  async getRootApps(req: Request, res: Response): Promise<void> {
    try {
      // Support both V1 (userId) and V2 (id) auth formats
      const userId = req.user?.userId || (req.user as any)?.id;
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

      const apps = await appsService.getRootApps(profileId, userId);

      res.status(200).json({
        success: true,
        data: apps
      } as ApiResponse);
    } catch (error: any) {
      console.error('Get root apps error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to get root apps'
      } as ApiResponse);
    }
  }

  /**
   * Update a bookmarked app
   */
  async updateApp(req: Request, res: Response): Promise<void> {
    try {
      // Support both V1 (userId) and V2 (id) auth formats
      const userId = req.user?.userId || (req.user as any)?.id;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        } as ApiResponse);
        return;
      }

      const { appId } = req.params;
      const { name, url, iconUrl, folderId, position } = req.body;

      if (!appId) {
        res.status(400).json({
          success: false,
          error: 'App ID is required'
        } as ApiResponse);
        return;
      }

      const app = await appsService.updateApp(appId, userId, {
        name,
        url,
        iconUrl,
        folderId,
        position
      });

      res.status(200).json({
        success: true,
        data: app,
        message: 'App updated successfully'
      } as ApiResponse);
    } catch (error: any) {
      console.error('Update app error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to update app'
      } as ApiResponse);
    }
  }

  /**
   * Delete a bookmarked app
   */
  async deleteApp(req: Request, res: Response): Promise<void> {
    try {
      // Support both V1 (userId) and V2 (id) auth formats
      const userId = req.user?.userId || (req.user as any)?.id;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        } as ApiResponse);
        return;
      }

      const { appId } = req.params;

      if (!appId) {
        res.status(400).json({
          success: false,
          error: 'App ID is required'
        } as ApiResponse);
        return;
      }

      await appsService.deleteApp(appId, userId);

      res.status(200).json({
        success: true,
        message: 'App deleted successfully'
      } as ApiResponse);
    } catch (error: any) {
      console.error('Delete app error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to delete app'
      } as ApiResponse);
    }
  }

  /**
   * Reorder apps within a folder or at root level
   */
  async reorderApps(req: Request, res: Response): Promise<void> {
    try {
      // Support both V1 (userId) and V2 (id) auth formats
      const userId = req.user?.userId || (req.user as any)?.id;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        } as ApiResponse);
        return;
      }

      const { profileId } = req.params;
      const { appIds, folderId } = req.body;

      if (!profileId || !appIds || !Array.isArray(appIds)) {
        res.status(400).json({
          success: false,
          error: 'Profile ID and appIds array are required'
        } as ApiResponse);
        return;
      }

      const apps = await appsService.reorderApps(profileId, userId, { appIds }, folderId);

      res.status(200).json({
        success: true,
        data: apps,
        message: 'Apps reordered successfully'
      } as ApiResponse);
    } catch (error: any) {
      console.error('Reorder apps error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to reorder apps'
      } as ApiResponse);
    }
  }

  /**
   * Move app to different folder
   */
  async moveAppToFolder(req: Request, res: Response): Promise<void> {
    try {
      // Support both V1 (userId) and V2 (id) auth formats
      const userId = req.user?.userId || (req.user as any)?.id;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        } as ApiResponse);
        return;
      }

      const { appId } = req.params;
      const { targetFolderId, position } = req.body;

      if (!appId) {
        res.status(400).json({
          success: false,
          error: 'App ID is required'
        } as ApiResponse);
        return;
      }

      const app = await appsService.moveAppToFolder(appId, userId, targetFolderId, position);

      res.status(200).json({
        success: true,
        data: app,
        message: 'App moved successfully'
      } as ApiResponse);
    } catch (error: any) {
      console.error('Move app error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to move app'
      } as ApiResponse);
    }
  }

  /**
   * Search apps by name or URL
   */
  async searchApps(req: Request, res: Response): Promise<void> {
    try {
      // Support both V1 (userId) and V2 (id) auth formats
      const userId = req.user?.userId || (req.user as any)?.id;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        } as ApiResponse);
        return;
      }

      const { profileId } = req.params;
      const { q: query } = req.query;

      if (!profileId || !query || typeof query !== 'string') {
        res.status(400).json({
          success: false,
          error: 'Profile ID and search query are required'
        } as ApiResponse);
        return;
      }

      const apps = await appsService.searchApps(profileId, userId, query);

      res.status(200).json({
        success: true,
        data: apps
      } as ApiResponse);
    } catch (error: any) {
      console.error('Search apps error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to search apps'
      } as ApiResponse);
    }
  }
}

export const appsController = new AppsController();
