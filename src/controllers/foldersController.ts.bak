import { Request, Response } from 'express';
import { foldersService } from '@/services/foldersService';
import { ApiResponse } from '@/types';

export class FoldersController {
  
  /**
   * Create a new folder
   */
  async createFolder(req: Request, res: Response): Promise<void> {
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
      const { name, position, color } = req.body;

      if (!profileId || !name) {
        res.status(400).json({
          success: false,
          error: 'Profile ID and folder name are required'
        } as ApiResponse);
        return;
      }

      const folder = await foldersService.createFolder(profileId, userId, {
        name,
        position,
        color
      });

      res.status(201).json({
        success: true,
        data: folder,
        message: 'Folder created successfully'
      } as ApiResponse);
    } catch (error: any) {
      console.error('Create folder error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to create folder'
      } as ApiResponse);
    }
  }

  /**
   * Get all folders for a profile
   */
  async getProfileFolders(req: Request, res: Response): Promise<void> {
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

      const folders = await foldersService.getProfileFolders(profileId, userId);

      res.status(200).json({
        success: true,
        data: folders
      } as ApiResponse);
    } catch (error: any) {
      console.error('Get folders error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to get folders'
      } as ApiResponse);
    }
  }

  /**
   * Get a specific folder by ID
   */
  async getFolderById(req: Request, res: Response): Promise<void> {
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

      const folder = await foldersService.getFolderById(folderId, profileId, userId);

      res.status(200).json({
        success: true,
        data: folder
      } as ApiResponse);
    } catch (error: any) {
      console.error('Get folder error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to get folder'
      } as ApiResponse);
    }
  }

  /**
   * Update a folder
   */
  async updateFolder(req: Request, res: Response): Promise<void> {
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

      const { folderId } = req.params;
      const { name, position, color, isPublic } = req.body;

      if (!folderId) {
        res.status(400).json({
          success: false,
          error: 'Folder ID is required'
        } as ApiResponse);
        return;
      }

      const folder = await foldersService.updateFolder(folderId, userId, {
        name,
        position,
        color,
        isPublic
      });

      res.status(200).json({
        success: true,
        data: folder,
        message: 'Folder updated successfully'
      } as ApiResponse);
    } catch (error: any) {
      console.error('Update folder error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to update folder'
      } as ApiResponse);
    }
  }

  /**
   * Delete a folder
   */
  async deleteFolder(req: Request, res: Response): Promise<void> {
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

      const { folderId } = req.params;

      if (!folderId) {
        res.status(400).json({
          success: false,
          error: 'Folder ID is required'
        } as ApiResponse);
        return;
      }

      await foldersService.deleteFolder(folderId, userId);

      res.status(200).json({
        success: true,
        message: 'Folder deleted successfully'
      } as ApiResponse);
    } catch (error: any) {
      console.error('Delete folder error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to delete folder'
      } as ApiResponse);
    }
  }

  /**
   * Reorder folders within a profile
   */
  async reorderFolders(req: Request, res: Response): Promise<void> {
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
      const { folderIds } = req.body;

      if (!profileId || !folderIds || !Array.isArray(folderIds)) {
        res.status(400).json({
          success: false,
          error: 'Profile ID and folderIds array are required'
        } as ApiResponse);
        return;
      }

      const folders = await foldersService.reorderFolders(profileId, userId, folderIds);

      res.status(200).json({
        success: true,
        data: folders,
        message: 'Folders reordered successfully'
      } as ApiResponse);
    } catch (error: any) {
      console.error('Reorder folders error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to reorder folders'
      } as ApiResponse);
    }
  }

  /**
   * Share a folder publicly
   */
  async shareFolder(req: Request, res: Response): Promise<void> {
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

      const { folderId } = req.params;

      if (!folderId) {
        res.status(400).json({
          success: false,
          error: 'Folder ID is required'
        } as ApiResponse);
        return;
      }

      const shareInfo = await foldersService.shareFolder(folderId, userId);

      res.status(200).json({
        success: true,
        data: shareInfo,
        message: 'Folder shared successfully'
      } as ApiResponse);
    } catch (error: any) {
      console.error('Share folder error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to share folder'
      } as ApiResponse);
    }
  }

  /**
   * Unshare a folder (make private)
   */
  async unshareFolder(req: Request, res: Response): Promise<void> {
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

      const { folderId } = req.params;

      if (!folderId) {
        res.status(400).json({
          success: false,
          error: 'Folder ID is required'
        } as ApiResponse);
        return;
      }

      await foldersService.unshareFolder(folderId, userId);

      res.status(200).json({
        success: true,
        message: 'Folder unshared successfully'
      } as ApiResponse);
    } catch (error: any) {
      console.error('Unshare folder error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to unshare folder'
      } as ApiResponse);
    }
  }

  /**
   * Get a shared folder by shareable ID (public access)
   */
  async getSharedFolder(req: Request, res: Response): Promise<void> {
    try {
      const { shareableId } = req.params;

      if (!shareableId) {
        res.status(400).json({
          success: false,
          error: 'Shareable ID is required'
        } as ApiResponse);
        return;
      }

      const folder = await foldersService.getSharedFolder(shareableId);

      res.status(200).json({
        success: true,
        data: folder
      } as ApiResponse);
    } catch (error: any) {
      console.error('Get shared folder error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to get shared folder'
      } as ApiResponse);
    }
  }

  /**
   * Get folder contents with pagination
   */
  async getFolderContents(req: Request, res: Response): Promise<void> {
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

      const { folderId } = req.params;
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

      if (!folderId) {
        res.status(400).json({
          success: false,
          error: 'Folder ID is required'
        } as ApiResponse);
        return;
      }

      const result = await foldersService.getFolderContents(folderId, userId, page, limit);

      res.status(200).json({
        success: true,
        data: result
      } as ApiResponse);
    } catch (error: any) {
      console.error('Get folder contents error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to get folder contents'
      } as ApiResponse);
    }
  }
}

export const foldersController = new FoldersController();
