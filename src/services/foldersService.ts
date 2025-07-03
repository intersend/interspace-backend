import { prisma, withTransaction } from '../utils/database';
import { 
  CreateFolderRequest,
  UpdateFolderRequest,
  FolderResponse,
  ShareFolderResponse,
  NotFoundError,
  ConflictError,
  AuthorizationError 
} from '../types';
import { randomBytes } from 'crypto';

export class FoldersService {
  
  /**
   * Create a new folder
   */
  async createFolder(
    profileId: string, 
    accountId: string, 
    data: CreateFolderRequest
  ): Promise<FolderResponse> {
    return withTransaction(async (tx) => {
      // Verify profile access through ProfileAccount
      const profileAccount = await tx.profileAccount.findFirst({
        where: { 
          profileId,
          accountId 
        }
      });

      if (!profileAccount) {
        throw new NotFoundError('SmartProfile');
      }

      // Check for name conflicts
      const existingFolder = await tx.folder.findFirst({
        where: {
          profileId,
          name: data.name
        }
      });

      if (existingFolder) {
        throw new ConflictError('Folder with this name already exists');
      }

      // Determine position (last position + 1 if not specified)
      let position = data.position;
      if (position === undefined) {
        const lastFolder = await tx.folder.findFirst({
          where: { profileId },
          orderBy: { position: 'desc' }
        });
        position = (lastFolder?.position || 0) + 1;
      }

      // Create the folder
      const folder = await tx.folder.create({
        data: {
          profileId,
          name: data.name,
          position,
          color: data.color,
          isPublic: false
        },
        include: {
          apps: true,
          _count: {
            select: {
              apps: true
            }
          }
        }
      });

      // Log the folder creation
      await tx.auditLog.create({
        data: {
          accountId,
          profileId,
          action: 'FOLDER_CREATED',
          resource: 'Folder',
          details: JSON.stringify({
            folderName: data.name,
            color: data.color
          })
        }
      });

      return this.formatFolderResponse(folder);
    });
  }

  /**
   * Get all folders for a profile
   */
  async getProfileFolders(profileId: string, accountId: string): Promise<FolderResponse[]> {
    // Verify profile access
    const profileAccount = await prisma.profileAccount.findFirst({
      where: { 
        profileId,
        accountId 
      }
    });

    if (!profileAccount) {
      // Return empty array for non-existent access
      return [];
    }

    const folders = await prisma.folder.findMany({
      where: { profileId },
      include: {
        apps: {
          orderBy: { position: 'asc' }
        },
        _count: {
          select: {
            apps: true
          }
        }
      },
      orderBy: { position: 'asc' }
    });

    return folders.map(folder => this.formatFolderResponse(folder));
  }

  /**
   * Get a specific folder
   */
  async getFolderById(
    folderId: string, 
    profileId: string, 
    accountId: string
  ): Promise<FolderResponse> {
    // First get the folder
    const folder = await prisma.folder.findFirst({
      where: { 
        id: folderId,
        profileId
      },
      include: {
        apps: {
          orderBy: { position: 'asc' }
        },
        _count: {
          select: {
            apps: true
          }
        }
      }
    });

    if (!folder) {
      throw new NotFoundError('Folder');
    }
    
    // Verify account has access to the profile
    const profileAccount = await prisma.profileAccount.findFirst({
      where: {
        profileId: folder.profileId,
        accountId
      }
    });
    
    if (!profileAccount) {
      throw new AuthorizationError('You do not have access to this folder');
    }

    return this.formatFolderResponse(folder);
  }

  /**
   * Update a folder
   */
  async updateFolder(
    folderId: string,
    accountId: string,
    data: UpdateFolderRequest
  ): Promise<FolderResponse> {
    return withTransaction(async (tx) => {
      // Get the folder
      const folder = await tx.folder.findFirst({
        where: { 
          id: folderId
        },
        include: { profile: true }
      });

      if (!folder) {
        throw new NotFoundError('Folder');
      }
      
      // Verify account has access to the profile
      const profileAccount = await tx.profileAccount.findFirst({
        where: {
          profileId: folder.profileId,
          accountId
        }
      });
      
      if (!profileAccount) {
        throw new AuthorizationError('You do not have access to this folder');
      }

      // Check for name conflicts if updating name
      if (data.name && data.name !== folder.name) {
        const nameConflict = await tx.folder.findFirst({
          where: {
            profileId: folder.profileId,
            name: data.name,
            id: { not: folderId }
          }
        });

        if (nameConflict) {
          throw new ConflictError('Folder with this name already exists');
        }
      }

      // Update the folder
      const updatedFolder = await tx.folder.update({
        where: { id: folderId },
        data: {
          ...(data.name && { name: data.name }),
          ...(data.position !== undefined && { position: data.position }),
          ...(data.color !== undefined && { color: data.color }),
          ...(data.isPublic !== undefined && { isPublic: data.isPublic }),
          updatedAt: new Date()
        },
        include: {
          apps: {
            orderBy: { position: 'asc' }
          },
          _count: {
            select: {
              apps: true
            }
          }
        }
      });

      return this.formatFolderResponse(updatedFolder);
    });
  }

  /**
   * Delete a folder
   */
  async deleteFolder(folderId: string, accountId: string): Promise<void> {
    return withTransaction(async (tx) => {
      // Get the folder
      const folder = await tx.folder.findFirst({
        where: { 
          id: folderId
        },
        include: {
          apps: true
        }
      });

      if (!folder) {
        throw new NotFoundError('Folder');
      }
      
      // Verify account has access to the profile
      const profileAccount = await tx.profileAccount.findFirst({
        where: {
          profileId: folder.profileId,
          accountId
        }
      });
      
      if (!profileAccount) {
        throw new AuthorizationError('You do not have access to this folder');
      }

      // Move all apps in this folder to root level (folderId = null)
      if (folder.apps.length > 0) {
        await tx.bookmarkedApp.updateMany({
          where: { folderId },
          data: { 
            folderId: null,
            updatedAt: new Date()
          }
        });
      }

      // Delete the folder
      await tx.folder.delete({
        where: { id: folderId }
      });
    });
  }

  /**
   * Reorder folders within a profile
   */
  async reorderFolders(
    profileId: string,
    accountId: string,
    folderIds: string[]
  ): Promise<FolderResponse[]> {
    return withTransaction(async (tx) => {
      // Verify profile access
      const profileAccount = await tx.profileAccount.findFirst({
        where: { 
          profileId,
          accountId 
        }
      });

      if (!profileAccount) {
        throw new NotFoundError('SmartProfile');
      }

      // Verify all folders belong to the profile
      const folders = await tx.folder.findMany({
        where: {
          id: { in: folderIds },
          profileId
        }
      });

      if (folders.length !== folderIds.length) {
        throw new NotFoundError('Some folders not found or not accessible');
      }

      // Update positions
      const updates = folderIds.map((folderId, index) => 
        tx.folder.update({
          where: { id: folderId },
          data: { position: index + 1 }
        })
      );

      await Promise.all(updates);

      // Return updated folders
      const updatedFolders = await tx.folder.findMany({
        where: { profileId },
        include: {
          apps: {
            orderBy: { position: 'asc' }
          },
          _count: {
            select: {
              apps: true
            }
          }
        },
        orderBy: { position: 'asc' }
      });

      return updatedFolders.map(folder => this.formatFolderResponse(folder));
    });
  }

  /**
   * Share a folder publicly
   */
  async shareFolder(
    folderId: string,
    accountId: string
  ): Promise<ShareFolderResponse> {
    return withTransaction(async (tx) => {
      // Get the folder
      const folder = await tx.folder.findFirst({
        where: { 
          id: folderId
        }
      });

      if (!folder) {
        throw new NotFoundError('Folder');
      }
      
      // Verify account has access to the profile
      const profileAccount = await tx.profileAccount.findFirst({
        where: {
          profileId: folder.profileId,
          accountId
        }
      });
      
      if (!profileAccount) {
        throw new AuthorizationError('You do not have access to this folder');
      }

      // Generate shareable ID if not exists
      let shareableId = folder.shareableId;
      if (!shareableId) {
        shareableId = this.generateShareableId();
        
        // Ensure uniqueness
        while (await tx.folder.findUnique({ where: { shareableId } })) {
          shareableId = this.generateShareableId();
        }
      }

      // Update folder to be public with shareable ID
      await tx.folder.update({
        where: { id: folderId },
        data: {
          isPublic: true,
          shareableId,
          updatedAt: new Date()
        }
      });

      const shareableUrl = `${process.env.FRONTEND_URL || 'https://app.interspace.com'}/shared/folders/${shareableId}`;

      return {
        shareableId,
        shareableUrl
      };
    });
  }

  /**
   * Unshare a folder (make private)
   */
  async unshareFolder(folderId: string, accountId: string): Promise<void> {
    // Get the folder
    const folder = await prisma.folder.findFirst({
      where: { 
        id: folderId
      }
    });

    if (!folder) {
      throw new NotFoundError('Folder');
    }
    
    // Verify account has access to the profile
    const profileAccount = await prisma.profileAccount.findFirst({
      where: {
        profileId: folder.profileId,
        accountId
      }
    });
    
    if (!profileAccount) {
      throw new AuthorizationError('You do not have access to this folder');
    }

    await prisma.folder.update({
      where: { id: folderId },
      data: {
        isPublic: false,
        updatedAt: new Date()
      }
    });
  }

  /**
   * Get a shared folder by shareable ID (public access)
   */
  async getSharedFolder(shareableId: string): Promise<FolderResponse> {
    const folder = await prisma.folder.findUnique({
      where: { 
        shareableId,
        isPublic: true
      },
      include: {
        apps: {
          orderBy: { position: 'asc' }
        },
        _count: {
          select: {
            apps: true
          }
        }
      }
    });

    if (!folder) {
      throw new NotFoundError('Shared folder not found or is private');
    }

    return this.formatFolderResponse(folder);
  }

  /**
   * Get folder contents with pagination
   */
  async getFolderContents(
    folderId: string,
    accountId: string,
    page: number = 1,
    limit: number = 20
  ) {
    // Get the folder
    const folder = await prisma.folder.findFirst({
      where: { 
        id: folderId
      }
    });

    if (!folder) {
      throw new NotFoundError('Folder');
    }
    
    // Verify account has access to the profile
    const profileAccount = await prisma.profileAccount.findFirst({
      where: {
        profileId: folder.profileId,
        accountId
      }
    });
    
    if (!profileAccount) {
      throw new AuthorizationError('You do not have access to this folder');
    }

    const offset = (page - 1) * limit;
    
    const [apps, total] = await Promise.all([
      prisma.bookmarkedApp.findMany({
        where: { folderId },
        include: {
          folder: {
            select: { name: true }
          }
        },
        orderBy: { position: 'asc' },
        skip: offset,
        take: limit
      }),
      prisma.bookmarkedApp.count({
        where: { folderId }
      })
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      apps: apps.map(app => ({
        id: app.id,
        name: app.name,
        url: app.url,
        iconUrl: app.iconUrl,
        position: app.position,
        folderId: app.folderId,
        folderName: app.folder?.name,
        createdAt: app.createdAt.toISOString(),
        updatedAt: app.updatedAt.toISOString()
      })),
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
   * Generate a unique shareable ID
   */
  private generateShareableId(): string {
    return randomBytes(12).toString('base64url');
  }

  /**
   * Format folder response
   */
  private formatFolderResponse(folder: any): FolderResponse {
    return {
      id: folder.id,
      name: folder.name,
      position: folder.position,
      isPublic: folder.isPublic,
      shareableId: folder.shareableId,
      color: folder.color,
      appsCount: folder._count?.apps || 0,
      apps: folder.apps?.map((app: any) => ({
        id: app.id,
        name: app.name,
        url: app.url,
        iconUrl: app.iconUrl,
        position: app.position,
        folderId: app.folderId,
        createdAt: app.createdAt.toISOString(),
        updatedAt: app.updatedAt.toISOString()
      })),
      createdAt: folder.createdAt.toISOString(),
      updatedAt: folder.updatedAt.toISOString()
    };
  }
}

export const foldersService = new FoldersService();
