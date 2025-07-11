import { Request, Response } from 'express';
import { appStoreService } from '../services/appStoreService';
import { 
  ApiResponse,
  AppStoreSearchParams,
  CreateAppStoreAppRequest,
  UpdateAppStoreAppRequest,
  CreateAppStoreCategoryRequest,
  UpdateAppStoreCategoryRequest
} from '../types';

export class AppStoreController {
  /**
   * Get all app categories
   * GET /app-store/categories
   */
  async getCategories(req: Request, res: Response): Promise<void> {
    console.log('🎯 AppStoreController.getCategories called');
    try {
      const categories = await appStoreService.getCategories();
      console.log(`🎯 AppStoreController: Got ${categories.length} categories from service`);

      res.status(200).json({
        success: true,
        data: categories
      } as ApiResponse);
    } catch (error: any) {
      console.error('Get categories error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to get categories'
      } as ApiResponse);
    }
  }

  /**
   * Get all apps with filtering and pagination
   * GET /app-store/apps
   */
  async getApps(req: Request, res: Response): Promise<void> {
    try {
      const params: AppStoreSearchParams = {
        q: req.query.q as string,
        category: req.query.category as string,
        tags: req.query.tags ? (Array.isArray(req.query.tags) ? req.query.tags : [req.query.tags]) as string[] : undefined,
        chains: req.query.chains ? (Array.isArray(req.query.chains) ? req.query.chains : [req.query.chains]) as string[] : undefined,
        sortBy: req.query.sortBy as 'popularity' | 'newest' | 'name',
        page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 20
      };

      const result = await appStoreService.getApps(params);

      res.status(200).json({
        success: true,
        ...result
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
   * Get featured apps
   * GET /app-store/featured
   */
  async getFeaturedApps(req: Request, res: Response): Promise<void> {
    try {
      const apps = await appStoreService.getFeaturedApps();

      res.status(200).json({
        success: true,
        data: apps
      } as ApiResponse);
    } catch (error: any) {
      console.error('Get featured apps error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to get featured apps'
      } as ApiResponse);
    }
  }

  /**
   * Get a specific app by ID
   * GET /app-store/apps/:id
   */
  async getAppById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({
          success: false,
          error: 'App ID is required'
        } as ApiResponse);
        return;
      }

      const app = await appStoreService.getAppById(id);

      res.status(200).json({
        success: true,
        data: app
      } as ApiResponse);
    } catch (error: any) {
      console.error('Get app by ID error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to get app'
      } as ApiResponse);
    }
  }

  /**
   * Get app by shareable ID
   * GET /app-store/apps/share/:shareableId
   */
  async getAppByShareableId(req: Request, res: Response): Promise<void> {
    try {
      const { shareableId } = req.params;

      if (!shareableId) {
        res.status(400).json({
          success: false,
          error: 'Shareable ID is required'
        } as ApiResponse);
        return;
      }

      const app = await appStoreService.getAppByShareableId(shareableId);

      res.status(200).json({
        success: true,
        data: app
      } as ApiResponse);
    } catch (error: any) {
      console.error('Get app by shareable ID error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to get app'
      } as ApiResponse);
    }
  }

  /**
   * Search apps
   * GET /app-store/search
   */
  async searchApps(req: Request, res: Response): Promise<void> {
    try {
      const { q } = req.query;

      if (!q || typeof q !== 'string') {
        res.status(400).json({
          success: false,
          error: 'Search query is required'
        } as ApiResponse);
        return;
      }

      const apps = await appStoreService.searchApps(q);

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

  /**
   * Create a new app (admin only)
   * POST /app-store/apps
   */
  async createApp(req: Request, res: Response): Promise<void> {
    try {
      // TODO: Add admin authentication check
      // if (!req.user?.isAdmin) {
      //   res.status(403).json({
      //     success: false,
      //     error: 'Admin access required'
      //   } as ApiResponse);
      //   return;
      // }

      const data: CreateAppStoreAppRequest = req.body;

      // Validate required fields
      if (!data.name || !data.url || !data.categoryId || !data.description) {
        res.status(400).json({
          success: false,
          error: 'Name, URL, category ID, and description are required'
        } as ApiResponse);
        return;
      }

      const app = await appStoreService.createApp(data);

      res.status(201).json({
        success: true,
        data: app,
        message: 'App created successfully'
      } as ApiResponse);
    } catch (error: any) {
      console.error('Create app error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to create app'
      } as ApiResponse);
    }
  }

  /**
   * Update an app (admin only)
   * PUT /app-store/apps/:id
   */
  async updateApp(req: Request, res: Response): Promise<void> {
    try {
      // TODO: Add admin authentication check
      // if (!req.user?.isAdmin) {
      //   res.status(403).json({
      //     success: false,
      //     error: 'Admin access required'
      //   } as ApiResponse);
      //   return;
      // }

      const { id } = req.params;
      const data: UpdateAppStoreAppRequest = req.body;

      if (!id) {
        res.status(400).json({
          success: false,
          error: 'App ID is required'
        } as ApiResponse);
        return;
      }

      const app = await appStoreService.updateApp(id, data);

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
   * Delete an app (admin only)
   * DELETE /app-store/apps/:id
   */
  async deleteApp(req: Request, res: Response): Promise<void> {
    try {
      // TODO: Add admin authentication check
      // if (!req.user?.isAdmin) {
      //   res.status(403).json({
      //     success: false,
      //     error: 'Admin access required'
      //   } as ApiResponse);
      //   return;
      // }

      const { id } = req.params;

      if (!id) {
        res.status(400).json({
          success: false,
          error: 'App ID is required'
        } as ApiResponse);
        return;
      }

      await appStoreService.deleteApp(id);

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
   * Create a new category (admin only)
   * POST /app-store/categories
   */
  async createCategory(req: Request, res: Response): Promise<void> {
    try {
      // TODO: Add admin authentication check
      // if (!req.user?.isAdmin) {
      //   res.status(403).json({
      //     success: false,
      //     error: 'Admin access required'
      //   } as ApiResponse);
      //   return;
      // }

      const data: CreateAppStoreCategoryRequest = req.body;

      // Validate required fields
      if (!data.name || !data.slug) {
        res.status(400).json({
          success: false,
          error: 'Name and slug are required'
        } as ApiResponse);
        return;
      }

      const category = await appStoreService.createCategory(data);

      res.status(201).json({
        success: true,
        data: category,
        message: 'Category created successfully'
      } as ApiResponse);
    } catch (error: any) {
      console.error('Create category error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to create category'
      } as ApiResponse);
    }
  }

  /**
   * Update a category (admin only)
   * PUT /app-store/categories/:id
   */
  async updateCategory(req: Request, res: Response): Promise<void> {
    try {
      // TODO: Add admin authentication check
      // if (!req.user?.isAdmin) {
      //   res.status(403).json({
      //     success: false,
      //     error: 'Admin access required'
      //   } as ApiResponse);
      //   return;
      // }

      const { id } = req.params;
      const data: UpdateAppStoreCategoryRequest = req.body;

      if (!id) {
        res.status(400).json({
          success: false,
          error: 'Category ID is required'
        } as ApiResponse);
        return;
      }

      const category = await appStoreService.updateCategory(id, data);

      res.status(200).json({
        success: true,
        data: category,
        message: 'Category updated successfully'
      } as ApiResponse);
    } catch (error: any) {
      console.error('Update category error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to update category'
      } as ApiResponse);
    }
  }

  /**
   * Delete a category (admin only)
   * DELETE /app-store/categories/:id
   */
  async deleteCategory(req: Request, res: Response): Promise<void> {
    try {
      // TODO: Add admin authentication check
      // if (!req.user?.isAdmin) {
      //   res.status(403).json({
      //     success: false,
      //     error: 'Admin access required'
      //   } as ApiResponse);
      //   return;
      // }

      const { id } = req.params;

      if (!id) {
        res.status(400).json({
          success: false,
          error: 'Category ID is required'
        } as ApiResponse);
        return;
      }

      await appStoreService.deleteCategory(id);

      res.status(200).json({
        success: true,
        message: 'Category deleted successfully'
      } as ApiResponse);
    } catch (error: any) {
      console.error('Delete category error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to delete category'
      } as ApiResponse);
    }
  }
}

export const appStoreController = new AppStoreController();