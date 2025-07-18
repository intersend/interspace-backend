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
import { appStorePrisma as prisma } from '../utils/appStoreDatabase';

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

    console.log('🔍 AppStoreService: Querying database for categories');
    const categories = await prisma.appStoreCategory.findMany({
      where: { isActive: true },
      orderBy: { position: 'asc' },
      include: {
        _count: {
          select: { apps: { where: { isActive: true } } }
        }
      }
    });
    console.log(`🔍 AppStoreService: Found ${categories.length} categories in database`);

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
        { tags: { has: params.q } }
      ];
    }

    // Build orderBy clause
    let orderBy: any = { popularity: 'desc' }; // Default sort
    if (params.sortBy === 'newest') {
      orderBy = { createdAt: 'desc' };
    } else if (params.sortBy === 'name') {
      orderBy = { name: 'asc' };
    }

    // Execute queries
    console.log('🔍 AppStoreService: Querying with where:', JSON.stringify(where));
    console.log('🔍 AppStoreService: OrderBy:', orderBy);
    console.log('🔍 AppStoreService: Skip:', skip, 'Limit:', limit);
    
    const [apps, total] = await Promise.all([
      prisma.appStoreApp.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          category: true
        }
      }),
      prisma.appStoreApp.count({ where })
    ]);
    
    console.log(`🔍 AppStoreService: Found ${apps.length} apps, total count: ${total}`);

    const totalPages = Math.ceil(total / limit);

    return {
      data: apps.map(app => this.formatAppResponse(app)),
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

    console.log('🔍 AppStoreService: Querying for featured apps');
    const apps = await prisma.appStoreApp.findMany({
      where: {
        isActive: true,
        isFeatured: true
      },
      orderBy: { popularity: 'desc' },
      take: 12, // Limit featured apps
      include: {
        category: true
      }
    });

    const response = apps.map(app => this.formatAppResponse(app));

    // Cache the response
    await cacheService.set(cacheKey, response, this.CACHE_TTL);

    return response;
  }

  /**
   * Get a specific app by ID
   */
  async getAppById(id: string): Promise<AppStoreAppResponse> {
    const app = await prisma.appStoreApp.findFirst({
      where: {
        id,
        isActive: true
      },
      include: {
        category: true
      }
    });

    if (!app) {
      throw new NotFoundError('App');
    }

    // Increment popularity (view count)
    await prisma.appStoreApp.update({
      where: { id },
      data: { popularity: { increment: 1 } }
    });

    return this.formatAppResponse(app);
  }

  /**
   * Get app by shareable ID
   */
  async getAppByShareableId(shareableId: string): Promise<AppStoreAppResponse> {
    const app = await prisma.appStoreApp.findFirst({
      where: {
        shareableId,
        isActive: true
      },
      include: {
        category: true
      }
    });

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

    const apps = await prisma.appStoreApp.findMany({
      where: {
        isActive: true,
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
          { tags: { has: query } },
          { developer: { contains: query, mode: 'insensitive' } }
        ]
      },
      orderBy: { popularity: 'desc' },
      take: 20,
      include: {
        category: true
      }
    });

    return apps.map(app => this.formatAppResponse(app));
  }

  /**
   * Create a new app (admin only)
   */
  async createApp(data: CreateAppStoreAppRequest): Promise<AppStoreAppResponse> {
    // Verify category exists
    const category = await prisma.appStoreCategory.findUnique({
      where: { id: data.categoryId }
    });

    if (!category) {
      throw new NotFoundError('Category');
    }

    // Check for duplicate URL
    const existing = await prisma.appStoreApp.findFirst({
      where: { url: data.url }
    });

    if (existing) {
      throw new ConflictError('An app with this URL already exists');
    }

    const app = await prisma.appStoreApp.create({
      data: {
        name: data.name,
        url: data.url,
        iconUrl: data.iconUrl,
        categoryId: data.categoryId,
        description: data.description,
        detailedDescription: data.detailedDescription,
        tags: data.tags || [],
        chainSupport: data.chainSupport || [],
        screenshots: data.screenshots || [],
        developer: data.developer,
        version: data.version,
        isFeatured: data.isFeatured || false,
        isNew: data.isNew || true,
        shareableId: generateShareableId()
      },
      include: {
        category: true
      }
    });

    // Clear relevant caches
    await this.clearCaches();

    return this.formatAppResponse(app);
  }

  /**
   * Update an app (admin only)
   */
  async updateApp(id: string, data: UpdateAppStoreAppRequest): Promise<AppStoreAppResponse> {
    // Verify app exists
    const existing = await prisma.appStoreApp.findUnique({
      where: { id }
    });

    if (!existing) {
      throw new NotFoundError('App');
    }

    // If categoryId is being updated, verify it exists
    if (data.categoryId) {
      const category = await prisma.appStoreCategory.findUnique({
        where: { id: data.categoryId }
      });

      if (!category) {
        throw new NotFoundError('Category');
      }
    }

    const app = await prisma.appStoreApp.update({
      where: { id },
      data: {
        ...data,
        lastUpdated: new Date()
      },
      include: {
        category: true
      }
    });

    // Clear relevant caches
    await this.clearCaches();

    return this.formatAppResponse(app);
  }

  /**
   * Delete an app (admin only)
   */
  async deleteApp(id: string): Promise<void> {
    const app = await prisma.appStoreApp.findUnique({
      where: { id }
    });

    if (!app) {
      throw new NotFoundError('App');
    }

    // Soft delete by setting isActive to false
    await prisma.appStoreApp.update({
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
    const existing = await prisma.appStoreCategory.findUnique({
      where: { slug: data.slug }
    });

    if (existing) {
      throw new ConflictError('A category with this slug already exists');
    }

    const category = await prisma.appStoreCategory.create({
      data: {
        name: data.name,
        slug: data.slug,
        description: data.description,
        icon: data.icon,
        position: data.position || 0
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
      createdAt: category.createdAt.toISOString(),
      updatedAt: category.updatedAt.toISOString()
    };
  }

  /**
   * Update a category (admin only)
   */
  async updateCategory(id: string, data: UpdateAppStoreCategoryRequest): Promise<AppStoreCategoryResponse> {
    const existing = await prisma.appStoreCategory.findUnique({
      where: { id }
    });

    if (!existing) {
      throw new NotFoundError('Category');
    }

    // Check for duplicate slug if updating
    if (data.slug && data.slug !== existing.slug) {
      const duplicate = await prisma.appStoreCategory.findUnique({
        where: { slug: data.slug }
      });

      if (duplicate) {
        throw new ConflictError('A category with this slug already exists');
      }
    }

    const category = await prisma.appStoreCategory.update({
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
    const category = await prisma.appStoreCategory.findUnique({
      where: { id },
      include: {
        _count: {
          select: { apps: true }
        }
      }
    });

    if (!category) {
      throw new NotFoundError('Category');
    }

    if (category._count.apps > 0) {
      throw new ConflictError('Cannot delete category with existing apps');
    }

    // Soft delete by setting isActive to false
    await prisma.appStoreCategory.update({
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
      shareableId: app.shareableId || undefined,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      createdAt: app.createdAt.toISOString(),
      updatedAt: app.updatedAt.toISOString()
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