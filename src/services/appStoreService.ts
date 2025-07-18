import { 
  AppStoreAppResponse, 
  AppStoreCategoryResponse,
  CreateAppStoreAppRequest,
  UpdateAppStoreAppRequest,
  CreateAppStoreCategoryRequest,
  UpdateAppStoreCategoryRequest,
  AppStoreSearchParams,
  PaginatedResponse,
  NotFoundError,
  ConflictError
} from '../types';
import { generateShareableId } from '../utils/crypto';
import { cacheService } from './cacheService';
import * as fs from 'fs';
import * as path from 'path';

// Load app store data from JSON file
const dataPath = path.join(__dirname, '../data/appStoreData.json');
let appStoreData: any = null;

function loadAppStoreData() {
  if (!appStoreData) {
    const jsonData = fs.readFileSync(dataPath, 'utf-8');
    appStoreData = JSON.parse(jsonData);
    
    // Add IDs and timestamps to apps if not present
    appStoreData.apps = appStoreData.apps.map((app: any, index: number) => ({
      id: app.id || `app-${index + 1}`,
      shareableId: app.shareableId || generateShareableId(),
      createdAt: app.createdAt || new Date().toISOString(),
      updatedAt: app.updatedAt || new Date().toISOString(),
      lastUpdated: app.lastUpdated || new Date().toISOString(),
      chainSupport: app.chainSupport || ['1'], // Default to Ethereum mainnet
      screenshots: app.screenshots || [],
      ...app
    }));
    
    // Add timestamps to categories
    appStoreData.categories = appStoreData.categories.map((cat: any) => ({
      createdAt: cat.createdAt || new Date().toISOString(),
      updatedAt: cat.updatedAt || new Date().toISOString(),
      ...cat
    }));
  }
  return appStoreData;
}

export class AppStoreService {
  private readonly CACHE_TTL = 3600; // 1 hour cache for app store data
  private readonly DEFAULT_PAGE_SIZE = 20;
  private readonly MAX_PAGE_SIZE = 100;

  /**
   * Get all app categories
   */
  async getCategories(): Promise<AppStoreCategoryResponse[]> {
    console.log('🔍 AppStoreService.getCategories called');
    const cacheKey = 'app-store:categories';
    
    // Try cache first with error handling
    try {
      const cached = await cacheService.get<AppStoreCategoryResponse[]>(cacheKey);
      if (cached) {
        console.log('🔍 AppStoreService: Returning cached categories');
        return cached;
      }
    } catch (error) {
      console.log('🔍 AppStoreService: Cache read failed, continuing without cache:', error);
    }

    console.log('🔍 AppStoreService: Loading categories from JSON');
    const data = loadAppStoreData();
    const categories = data.categories.filter((cat: any) => cat.isActive);
    
    console.log(`🔍 AppStoreService: Found ${categories.length} categories in JSON`);

    // Calculate apps count for each category
    const response = categories.map((category: any) => {
      const appsCount = data.apps.filter((app: any) => 
        app.categoryId === category.id && app.isActive
      ).length;
      
      return {
        id: category.id,
        name: category.name,
        slug: category.slug,
        description: category.description || undefined,
        icon: category.icon || undefined,
        position: category.position,
        appsCount,
        createdAt: category.createdAt,
        updatedAt: category.updatedAt
      };
    });

    // Sort by position
    response.sort((a: AppStoreCategoryResponse, b: AppStoreCategoryResponse) => a.position - b.position);

    // Cache the response with error handling
    try {
      await cacheService.set(cacheKey, response, this.CACHE_TTL);
    } catch (error) {
      console.log('🔍 AppStoreService: Cache write failed, continuing:', error);
    }

    return response;
  }

  /**
   * Get all apps with optional filtering and pagination
   */
  async getApps(params: AppStoreSearchParams = {}): Promise<PaginatedResponse<AppStoreAppResponse>> {
    console.log('🔍 AppStoreService.getApps called with params:', params);
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(this.MAX_PAGE_SIZE, Math.max(1, params.limit || this.DEFAULT_PAGE_SIZE));
    const skip = (page - 1) * limit;

    const data = loadAppStoreData();
    let apps = data.apps.filter((app: any) => app.isActive);

    // Apply filters
    if (params.category) {
      const category = data.categories.find((cat: any) => cat.slug === params.category);
      if (category) {
        apps = apps.filter((app: any) => app.categoryId === category.id);
      }
    }

    if (params.tags && params.tags.length > 0) {
      apps = apps.filter((app: any) => 
        params.tags!.some(tag => app.tags.includes(tag))
      );
    }

    if (params.chains && params.chains.length > 0) {
      apps = apps.filter((app: any) => 
        params.chains!.some(chain => app.chainSupport.includes(chain))
      );
    }

    if (params.q) {
      const query = params.q.toLowerCase();
      apps = apps.filter((app: any) => 
        app.name.toLowerCase().includes(query) ||
        app.description.toLowerCase().includes(query) ||
        app.tags.some((tag: string) => tag.toLowerCase().includes(query))
      );
    }

    // Apply sorting
    if (params.sortBy === 'newest') {
      apps.sort((a: any, b: any) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    } else if (params.sortBy === 'name') {
      apps.sort((a: any, b: any) => a.name.localeCompare(b.name));
    } else {
      // Default sort by popularity
      apps.sort((a: any, b: any) => b.popularity - a.popularity);
    }

    const total = apps.length;
    console.log(`🔍 AppStoreService: Found ${total} apps after filtering`);

    // Apply pagination
    const paginatedApps = apps.slice(skip, skip + limit);
    const totalPages = Math.ceil(total / limit);

    return {
      data: paginatedApps.map((app: any) => this.formatAppResponse(app)),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    };
  }

  /**
   * Get featured apps
   */
  async getFeaturedApps(): Promise<AppStoreAppResponse[]> {
    console.log('🔍 AppStoreService.getFeaturedApps called');
    const cacheKey = 'app-store:featured';
    
    // Try cache first
    const cached = await cacheService.get<AppStoreAppResponse[]>(cacheKey);
    if (cached) {
      console.log('🔍 AppStoreService: Returning cached featured apps');
      return cached;
    }

    console.log('🔍 AppStoreService: Loading featured apps from JSON');
    const data = loadAppStoreData();
    const featuredApps = data.apps
      .filter((app: any) => app.isActive && app.isFeatured)
      .sort((a: any, b: any) => b.popularity - a.popularity)
      .slice(0, 12); // Limit to 12 featured apps

    const response = featuredApps.map((app: any) => this.formatAppResponse(app));

    // Cache the response
    await cacheService.set(cacheKey, response, this.CACHE_TTL);

    return response;
  }

  /**
   * Get a specific app by ID
   */
  async getAppById(id: string): Promise<AppStoreAppResponse> {
    const data = loadAppStoreData();
    const app = data.apps.find((app: any) => app.id === id && app.isActive);

    if (!app) {
      throw new NotFoundError('App');
    }

    // Increment popularity (view count) - in a real implementation, you'd persist this
    app.popularity++;

    return this.formatAppResponse(app);
  }

  /**
   * Get app by shareable ID
   */
  async getAppByShareableId(shareableId: string): Promise<AppStoreAppResponse> {
    const data = loadAppStoreData();
    const app = data.apps.find((app: any) => app.shareableId === shareableId && app.isActive);

    if (!app) {
      throw new NotFoundError('App');
    }

    return this.formatAppResponse(app);
  }

  /**
   * Search apps
   */
  async searchApps(query: string): Promise<AppStoreAppResponse[]> {
    if (!query || query.trim().length < 2) {
      return [];
    }

    const data = loadAppStoreData();
    const searchQuery = query.toLowerCase();
    
    const matchingApps = data.apps
      .filter((app: any) => 
        app.isActive && (
          app.name.toLowerCase().includes(searchQuery) ||
          app.description.toLowerCase().includes(searchQuery) ||
          app.tags.some((tag: string) => tag.toLowerCase().includes(searchQuery)) ||
          (app.developer && app.developer.toLowerCase().includes(searchQuery))
        )
      )
      .sort((a: any, b: any) => b.popularity - a.popularity)
      .slice(0, 20);

    return matchingApps.map((app: any) => this.formatAppResponse(app));
  }

  /**
   * Create a new app (admin only) - Not implemented for JSON
   */
  async createApp(data: CreateAppStoreAppRequest): Promise<AppStoreAppResponse> {
    throw new Error('Creating apps is not supported in JSON mode');
  }

  /**
   * Update an app (admin only) - Not implemented for JSON
   */
  async updateApp(id: string, data: UpdateAppStoreAppRequest): Promise<AppStoreAppResponse> {
    throw new Error('Updating apps is not supported in JSON mode');
  }

  /**
   * Delete an app (admin only) - Not implemented for JSON
   */
  async deleteApp(id: string): Promise<void> {
    throw new Error('Deleting apps is not supported in JSON mode');
  }

  /**
   * Create a new category (admin only) - Not implemented for JSON
   */
  async createCategory(data: CreateAppStoreCategoryRequest): Promise<AppStoreCategoryResponse> {
    throw new Error('Creating categories is not supported in JSON mode');
  }

  /**
   * Update a category (admin only) - Not implemented for JSON
   */
  async updateCategory(id: string, data: UpdateAppStoreCategoryRequest): Promise<AppStoreCategoryResponse> {
    throw new Error('Updating categories is not supported in JSON mode');
  }

  /**
   * Delete a category (admin only) - Not implemented for JSON
   */
  async deleteCategory(id: string): Promise<void> {
    throw new Error('Deleting categories is not supported in JSON mode');
  }

  /**
   * Format app response
   */
  private formatAppResponse(app: any): AppStoreAppResponse {
    const data = loadAppStoreData();
    const category = data.categories.find((cat: any) => cat.id === app.categoryId);
    
    if (!category) {
      throw new Error(`Category not found for app: ${app.name}`);
    }

    const metadata: any = {};
    
    if (app.metadata) {
      const parsedMetadata = typeof app.metadata === 'string' 
        ? JSON.parse(app.metadata) 
        : app.metadata;
      
      if (parsedMetadata.rating) metadata.rating = parsedMetadata.rating;
      if (parsedMetadata.reviewsCount) metadata.reviewsCount = parsedMetadata.reviewsCount;
      if (parsedMetadata.installsCount) metadata.installsCount = parsedMetadata.installsCount;
    }

    return {
      id: app.id,
      name: app.name,
      url: app.url,
      iconUrl: app.iconUrl || undefined,
      category: {
        id: category.id,
        name: category.name,
        slug: category.slug,
        description: category.description || undefined,
        icon: category.icon || undefined,
        position: category.position,
        createdAt: category.createdAt,
        updatedAt: category.updatedAt
      },
      description: app.description,
      detailedDescription: app.detailedDescription || undefined,
      tags: app.tags,
      popularity: app.popularity,
      isNew: app.isNew,
      isFeatured: app.isFeatured,
      chainSupport: app.chainSupport,
      screenshots: app.screenshots,
      developer: app.developer || undefined,
      version: app.version || undefined,
      lastUpdated: app.lastUpdated,
      shareableId: app.shareableId || undefined,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      createdAt: app.createdAt,
      updatedAt: app.updatedAt
    };
  }

  /**
   * Clear relevant caches
   */
  private async clearCaches(): Promise<void> {
    await Promise.all([
      cacheService.delete('app-store:featured'),
      cacheService.deletePattern('app-store:apps:*')
    ]);
  }
}

export const appStoreService = new AppStoreService();