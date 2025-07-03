import { Request, Response } from 'express';
import { appsService } from '../services/appsService';
import { ApiResponse } from '../types';
const { getAuthorizationId, verifyProfileAccess } = require('../utils/profileAccessV2');

export class AppsController {
  
  /**
   * Create a new bookmarked app
   */
  async createApp(req: Request, res: Response): Promise<void> {
    try {
      // Get authorization info supporting both V1 and V2
      const authInfo = getAuthorizationId(req);
      if (!authInfo) {
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

      // Verify access to profile
      const { hasAccess } = await verifyProfileAccess(profileId, authInfo.id);
      if (!hasAccess) {
        res.status(403).json({
          success: false,
          error: 'Access denied to this profile'
        } as ApiResponse);
        return;
      }

      // Pass account ID to service
      const app = await appsService.createApp(profileId, authInfo.id, {
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
      // Get authorization info supporting both V1 and V2
      const authInfo = getAuthorizationId(req);
      if (!authInfo) {
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

      // Verify access to profile
      const { hasAccess } = await verifyProfileAccess(profileId, authInfo.id, authInfo.isV2);
      if (!hasAccess) {
        res.status(403).json({
          success: false,
          error: 'Access denied to this profile'
        } as ApiResponse);
        return;
      }

      const apps = await appsService.getProfileApps(profileId, authInfo.id);

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
      // Get authorization info supporting both V1 and V2
      const authInfo = getAuthorizationId(req);
      if (!authInfo) {
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

      // Verify access to profile
      const { hasAccess } = await verifyProfileAccess(profileId, authInfo.id, authInfo.isV2);
      if (!hasAccess) {
        res.status(403).json({
          success: false,
          error: 'Access denied to this profile'
        } as ApiResponse);
        return;
      }

      const apps = await appsService.getFolderApps(folderId, profileId, authInfo.id);

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
      // Get authorization info supporting both V1 and V2
      const authInfo = getAuthorizationId(req);
      if (!authInfo) {
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

      // Verify access to profile
      const { hasAccess } = await verifyProfileAccess(profileId, authInfo.id, authInfo.isV2);
      if (!hasAccess) {
        res.status(403).json({
          success: false,
          error: 'Access denied to this profile'
        } as ApiResponse);
        return;
      }

      const apps = await appsService.getRootApps(profileId, authInfo.id);

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
      // Get authorization info supporting both V1 and V2
      const authInfo = getAuthorizationId(req);
      if (!authInfo) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        } as ApiResponse);
        return;
      }

      const { appId } = req.params;
      const { name, url, iconUrl } = req.body;

      if (!appId) {
        res.status(400).json({
          success: false,
          error: 'App ID is required'
        } as ApiResponse);
        return;
      }

      const app = await appsService.updateApp(appId, authInfo.id, {
        name,
        url,
        iconUrl
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
      // Get authorization info supporting both V1 and V2
      const authInfo = getAuthorizationId(req);
      if (!authInfo) {
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

      await appsService.deleteApp(appId, authInfo.id);

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
   * Reorder apps within a profile
   */
  async reorderApps(req: Request, res: Response): Promise<void> {
    try {
      // Get authorization info supporting both V1 and V2
      const authInfo = getAuthorizationId(req);
      if (!authInfo) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        } as ApiResponse);
        return;
      }

      const { profileId } = req.params;
      const { appOrders } = req.body;

      if (!profileId || !appOrders) {
        res.status(400).json({
          success: false,
          error: 'Profile ID and app orders are required'
        } as ApiResponse);
        return;
      }

      // Verify access to profile
      const { hasAccess } = await verifyProfileAccess(profileId, authInfo.id, authInfo.isV2);
      if (!hasAccess) {
        res.status(403).json({
          success: false,
          error: 'Access denied to this profile'
        } as ApiResponse);
        return;
      }

      await appsService.reorderApps(profileId, authInfo.id, appOrders);

      res.status(200).json({
        success: true,
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
   * Move app to a different folder
   */
  async moveAppToFolder(req: Request, res: Response): Promise<void> {
    try {
      // Get authorization info supporting both V1 and V2
      const authInfo = getAuthorizationId(req);
      if (!authInfo) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        } as ApiResponse);
        return;
      }

      const { appId } = req.params;
      const { folderId } = req.body;

      if (!appId) {
        res.status(400).json({
          success: false,
          error: 'App ID is required'
        } as ApiResponse);
        return;
      }

      const app = await appsService.moveAppToFolder(appId, authInfo.id, folderId);

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
   * Search apps
   */
  async searchApps(req: Request, res: Response): Promise<void> {
    try {
      // Get authorization info supporting both V1 and V2
      const authInfo = getAuthorizationId(req);
      if (!authInfo) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        } as ApiResponse);
        return;
      }

      const { profileId } = req.params;
      const { query } = req.query;

      if (!profileId) {
        res.status(400).json({
          success: false,
          error: 'Profile ID is required'
        } as ApiResponse);
        return;
      }

      // Verify access to profile
      const { hasAccess } = await verifyProfileAccess(profileId, authInfo.id, authInfo.isV2);
      if (!hasAccess) {
        res.status(403).json({
          success: false,
          error: 'Access denied to this profile'
        } as ApiResponse);
        return;
      }

      const apps = await appsService.searchApps(profileId, authInfo.id, query as string);

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