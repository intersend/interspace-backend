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
import { appStorePrisma } from '../utils/appStoreDatabase';

export class AppStoreServicePublic {
  private readonly CACHE_TTL = 3600; // 1 hour cache for app store data
  private readonly DEFAULT_PAGE_SIZE = 20;
  private readonly MAX_PAGE_SIZE = 100;

  /**
   * Get all app categories
   */
  async getCategories(): Promise<AppStoreCategoryResponse[]> {
    console.log('🔍 AppStoreServicePublic.getCategories called');
    const cacheKey = 'app-store:categories';
    
    // Try cache first with error handling
    try {
      const cached = await cacheService.get<AppStoreCategoryResponse[]>(cacheKey);
      if (cached) {
        console.log('🔍 AppStoreServicePublic: Returning cached categories');
        return cached;
      }
    } catch (error) {
      console.log('🔍 AppStoreServicePublic: Cache read failed, continuing without cache:', error);
    }

    console.log('🔍 AppStoreServicePublic: Querying public database for categories');
    const categories = await appStorePrisma.appStoreCategory.findMany({
      where: { isActive: true },
      orderBy: { position: 'asc' },
      include: {
        _count: {
          select: { apps: { where: { isActive: true } } }
        }
      }
    });
    console.log(`🔍 AppStoreServicePublic: Found ${categories.length} categories in public database`);

    const response = categories.map(category => ({
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description || undefined,
      icon: category.icon || undefined,
      position: category.position,
      appsCount: category._count.apps,
      createdAt: category.createdAt.toISOString(),
      updatedAt: category.updatedAt.toISOString()
    }));

    // Cache the response with error handling
    try {
      await cacheService.set(cacheKey, response, this.CACHE_TTL);
    } catch (error) {
      console.log('🔍 AppStoreServicePublic: Cache write failed, continuing:', error);
    }

    return response;
  }

  /**
   * Get all apps with optional filtering and pagination
   */
  async getApps(params: AppStoreSearchParams = {}): Promise<PaginatedResponse<AppStoreAppResponse>> {
    console.log('🔍 AppStoreServicePublic.getApps called with params:', params);
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(this.MAX_PAGE_SIZE, Math.max(1, params.limit || this.DEFAULT_PAGE_SIZE));
    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = { isActive: true };

    if (params.category) {
      where.category = { slug: params.category };
    }

    if (params.tags && params.tags.length > 0) {
      where.tags = { hasSome: params.tags };
    }

    if (params.chains && params.chains.length > 0) {
      where.chainSupport = { hasSome: params.chains };
    }

    if (params.q) {
      where.OR = [
        { name: { contains: params.q, mode: 'insensitive' } },
        { description: { contains: params.q, mode: 'insensitive' } },
        { developer: { contains: params.q, mode: 'insensitive' } },
        { tags: { hasSome: [params.q] } }
      ];
    }

    // Build orderBy
    const orderBy: any = {};
    switch (params.sortBy) {
      case 'newest':
        orderBy.createdAt = 'desc';
        break;
      case 'name':
        orderBy.name = 'asc';
        break;
      case 'popularity':
      default:
        orderBy.popularity = 'desc';
        break;
    }

    console.log('🔍 AppStoreServicePublic: Querying with where:', JSON.stringify(where));
    console.log('🔍 AppStoreServicePublic: OrderBy:', JSON.stringify(orderBy));
    console.log('🔍 AppStoreServicePublic: Skip:', skip, 'Limit:', limit);

    // Execute queries
    const [apps, totalCount] = await Promise.all([
      appStorePrisma.appStoreApp.findMany({
        where,
        include: { category: true },
        orderBy,
        skip,
        take: limit
      }),
      appStorePrisma.appStoreApp.count({ where })
    ]);

    console.log(`🔍 AppStoreServicePublic: Found ${apps.length} apps, total count: ${totalCount}`);

    const response = apps.map(app => this.formatAppResponse(app));

    const totalPages = Math.ceil(totalCount / limit);

    return {
      data: response,
      pagination: {
        page,
        limit,
        total: totalCount,
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
    console.log('🔍 AppStoreServicePublic.getFeaturedApps called');
    const cacheKey = 'app-store:featured';
    
    // Try cache first
    const cached = await cacheService.get<AppStoreAppResponse[]>(cacheKey);
    if (cached) {
      console.log('🔍 AppStoreServicePublic: Returning cached featured apps');
      return cached;
    }

    const apps = await appStorePrisma.appStoreApp.findMany({
      where: { 
        isFeatured: true,
        isActive: true 
      },
      include: { category: true },
      orderBy: { popularity: 'desc' },
      take: 10
    });

    console.log(`🔍 AppStoreServicePublic: Found ${apps.length} featured apps`);

    const response = apps.map(app => this.formatAppResponse(app));
    // Cache the response
    await cacheService.set(cacheKey, response, this.CACHE_TTL);
    return response;
  }

  /**
   * Get app by ID
   */
  async getAppById(id: string): Promise<AppStoreAppResponse> {
    const app = await appStorePrisma.appStoreApp.findUnique({
      where: { id },
      include: { category: true }
    });

    if (!app || !app.isActive) {
      throw new NotFoundError('App not found');
    }

    return this.formatAppResponse(app);
  }

  /**
   * Get app by shareable ID
   */
  async getAppByShareableId(shareableId: string): Promise<AppStoreAppResponse> {
    const app = await appStorePrisma.appStoreApp.findUnique({
      where: { shareableId },
      include: { category: true }
    });

    if (!app || !app.isActive) {
      throw new NotFoundError('App not found');
    }

    return this.formatAppResponse(app);
  }

  /**
   * Create a new app (admin only)
   */
  async createApp(data: CreateAppStoreAppRequest): Promise<AppStoreAppResponse> {
    // Check if category exists
    const category = await appStorePrisma.appStoreCategory.findUnique({
      where: { id: data.categoryId }
    });

    if (!category) {
      throw new NotFoundError('Category not found');
    }

    // Check for duplicate URL
    const existingApp = await appStorePrisma.appStoreApp.findFirst({
      where: { url: data.url }
    });

    if (existingApp) {
      throw new ConflictError('An app with this URL already exists');
    }

    const app = await appStorePrisma.appStoreApp.create({
      data: {
        ...data,
        shareableId: generateShareableId(),
        lastUpdated: new Date()
      },
      include: { category: true }
    });

    // Clear relevant caches
    await this.clearCaches();

    return this.formatAppResponse(app);
  }

  /**
   * Update an app (admin only)
   */
  async updateApp(id: string, data: UpdateAppStoreAppRequest): Promise<AppStoreAppResponse> {
    // Check if app exists
    const existingApp = await appStorePrisma.appStoreApp.findUnique({
      where: { id }
    });

    if (!existingApp) {
      throw new NotFoundError('App not found');
    }

    // If updating category, check it exists
    if (data.categoryId) {
      const category = await appStorePrisma.appStoreCategory.findUnique({
        where: { id: data.categoryId }
      });

      if (!category) {
        throw new NotFoundError('Category not found');
      }
    }

    // If updating URL, check for duplicates
    if (data.url && data.url !== existingApp.url) {
      const duplicateApp = await appStorePrisma.appStoreApp.findFirst({
        where: { 
          url: data.url,
          id: { not: id }
        }
      });

      if (duplicateApp) {
        throw new ConflictError('An app with this URL already exists');
      }
    }

    const app = await appStorePrisma.appStoreApp.update({
      where: { id },
      data: {
        ...data,
        lastUpdated: new Date()
      },
      include: { category: true }
    });

    // Clear relevant caches
    await this.clearCaches();

    return this.formatAppResponse(app);
  }

  /**
   * Delete an app (admin only)
   */
  async deleteApp(id: string): Promise<void> {
    const app = await appStorePrisma.appStoreApp.findUnique({
      where: { id }
    });

    if (!app) {
      throw new NotFoundError('App not found');
    }

    // Soft delete by setting isActive to false
    await appStorePrisma.appStoreApp.update({
      where: { id },
      data: { isActive: false }
    });

    // Clear relevant caches
    await this.clearCaches();
  }

  /**
   * Create a new category (admin only)
   */
  async createCategory(data: CreateAppStoreCategoryRequest): Promise<AppStoreCategoryResponse> {
    // Check for duplicate slug
    const existing = await appStorePrisma.appStoreCategory.findUnique({
      where: { slug: data.slug }
    });

    if (existing) {
      throw new ConflictError('A category with this slug already exists');
    }

    const category = await appStorePrisma.appStoreCategory.create({
      data,
      include: {
        _count: {
          select: { apps: { where: { isActive: true } } }
        }
      }
    });

    // Clear category cache
    await cacheService.delete('app-store:categories');

    return {
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description || undefined,
      icon: category.icon || undefined,
      position: category.position,
      appsCount: category._count.apps,
      createdAt: category.createdAt.toISOString(),
      updatedAt: category.updatedAt.toISOString()
    };
  }

  /**
   * Update a category (admin only)
   */
  async updateCategory(id: string, data: UpdateAppStoreCategoryRequest): Promise<AppStoreCategoryResponse> {
    const existing = await appStorePrisma.appStoreCategory.findUnique({
      where: { id }
    });

    if (!existing) {
      throw new NotFoundError('Category not found');
    }

    // If updating slug, check for duplicates
    if (data.slug && data.slug !== existing.slug) {
      const duplicate = await appStorePrisma.appStoreCategory.findUnique({
        where: { slug: data.slug }
      });

      if (duplicate) {
        throw new ConflictError('A category with this slug already exists');
      }
    }

    const category = await appStorePrisma.appStoreCategory.update({
      where: { id },
      data,
      include: {
        _count: {
          select: { apps: { where: { isActive: true } } }
        }
      }
    });

    // Clear category cache
    await cacheService.delete('app-store:categories');

    return {
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description || undefined,
      icon: category.icon || undefined,
      position: category.position,
      appsCount: category._count.apps,
      createdAt: category.createdAt.toISOString(),
      updatedAt: category.updatedAt.toISOString()
    };
  }

  /**
   * Delete a category (admin only)
   */
  async deleteCategory(id: string): Promise<void> {
    const category = await appStorePrisma.appStoreCategory.findUnique({
      where: { id },
      include: {
        _count: {
          select: { apps: true }
        }
      }
    });

    if (!category) {
      throw new NotFoundError('Category not found');
    }

    if (category._count.apps > 0) {
      throw new ConflictError('Cannot delete category with existing apps');
    }

    // Soft delete by setting isActive to false
    await appStorePrisma.appStoreCategory.update({
      where: { id },
      data: { isActive: false }
    });

    // Clear category cache
    await cacheService.delete('app-store:categories');
  }

  /**
   * Format app response
   */
  private formatAppResponse(app: any): AppStoreAppResponse {
    return {
      id: app.id,
      name: app.name,
      url: app.url,
      iconUrl: app.iconUrl || undefined,
      category: {
        id: app.category.id,
        name: app.category.name,
        slug: app.category.slug,
        description: app.category.description || undefined,
        icon: app.category.icon || undefined,
        position: app.category.position,
        createdAt: app.category.createdAt.toISOString(),
        updatedAt: app.category.updatedAt.toISOString()
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
      lastUpdated: app.lastUpdated.toISOString(),
      shareableId: app.shareableId,
      createdAt: app.createdAt.toISOString(),
      updatedAt: app.updatedAt.toISOString()
    };
  }

  /**
   * Clear all app store caches
   */
  private async clearCaches(): Promise<void> {
    await cacheService.deletePattern('app-store:*');
  }
}

// Export singleton instance
export const appStoreServicePublic = new AppStoreServicePublic();