import { prisma, withTransaction } from '@/utils/database';
import { 
  CreateBookmarkedAppRequest,
  UpdateBookmarkedAppRequest,
  BookmarkedAppResponse,
  ReorderAppsRequest,
  NotFoundError,
  ConflictError,
  AuthorizationError 
} from '@/types';

export class AppsService {
  
  /**
   * Create a new bookmarked app
   */
  async createApp(
    profileId: string, 
    userId: string, 
    data: CreateBookmarkedAppRequest
  ): Promise<BookmarkedAppResponse> {
    return withTransaction(async (tx) => {
      // Verify profile ownership
      const profile = await tx.smartProfile.findFirst({
        where: { 
          id: profileId,
          userId 
        }
      });

      if (!profile) {
        throw new NotFoundError('SmartProfile');
      }

      // If folder specified, verify it exists and belongs to the profile
      if (data.folderId) {
        const folder = await tx.folder.findFirst({
          where: {
            id: data.folderId,
            profileId
          }
        });

        if (!folder) {
          throw new NotFoundError('Folder');
        }
      }

      // Determine position (last position + 1 if not specified)
      let position = data.position;
      if (position === undefined) {
        const lastApp = await tx.bookmarkedApp.findFirst({
          where: { 
            profileId,
            folderId: data.folderId || null
          },
          orderBy: { position: 'desc' }
        });
        position = (lastApp?.position || 0) + 1;
      }

      // Create the app
      const app = await tx.bookmarkedApp.create({
        data: {
          profileId,
          folderId: data.folderId || null,
          name: data.name,
          url: data.url,
          iconUrl: data.iconUrl,
          position
        },
        include: {
          folder: {
            select: {
              name: true
            }
          }
        }
      });

      // Log the app creation
      await tx.auditLog.create({
        data: {
          userId,
          profileId,
          action: 'APP_BOOKMARKED',
          resource: 'BookmarkedApp',
          details: JSON.stringify({
            appName: data.name,
            url: data.url,
            folderId: data.folderId
          })
        }
      });

      return this.formatAppResponse(app);
    });
  }

  /**
   * Get all apps for a profile
   */
  async getProfileApps(profileId: string, userId: string): Promise<BookmarkedAppResponse[]> {
    // Verify profile ownership
    const profile = await prisma.smartProfile.findFirst({
      where: { 
        id: profileId,
        userId 
      }
    });

    if (!profile) {
      // Return empty array for non-existent profile (could be a new user)
      return [];
    }

    const apps = await prisma.bookmarkedApp.findMany({
      where: { profileId },
      include: {
        folder: {
          select: {
            name: true
          }
        }
      },
      orderBy: [
        { folderId: 'asc' },
        { position: 'asc' }
      ]
    });

    return apps.map(app => this.formatAppResponse(app));
  }

  /**
   * Get apps in a specific folder
   */
  async getFolderApps(
    folderId: string, 
    profileId: string, 
    userId: string
  ): Promise<BookmarkedAppResponse[]> {
    // Verify profile ownership and folder exists
    const folder = await prisma.folder.findFirst({
      where: { 
        id: folderId,
        profileId,
        profile: { userId }
      },
      include: {
        profile: true
      }
    });

    if (!folder) {
      throw new NotFoundError('Folder');
    }

    const apps = await prisma.bookmarkedApp.findMany({
      where: { 
        profileId,
        folderId 
      },
      include: {
        folder: {
          select: {
            name: true
          }
        }
      },
      orderBy: { position: 'asc' }
    });

    return apps.map(app => this.formatAppResponse(app));
  }

  /**
   * Get apps not in any folder (root level)
   */
  async getRootApps(profileId: string, userId: string): Promise<BookmarkedAppResponse[]> {
    // Verify profile ownership
    const profile = await prisma.smartProfile.findFirst({
      where: { 
        id: profileId,
        userId 
      }
    });

    if (!profile) {
      throw new NotFoundError('SmartProfile');
    }

    const apps = await prisma.bookmarkedApp.findMany({
      where: { 
        profileId,
        folderId: null
      },
      orderBy: { position: 'asc' }
    });

    return apps.map(app => this.formatAppResponse(app));
  }

  /**
   * Update a bookmarked app
   */
  async updateApp(
    appId: string,
    userId: string,
    data: UpdateBookmarkedAppRequest
  ): Promise<BookmarkedAppResponse> {
    return withTransaction(async (tx) => {
      // Verify app ownership
      const app = await tx.bookmarkedApp.findFirst({
        where: { 
          id: appId,
          profile: { userId }
        },
        include: { profile: true }
      });

      if (!app) {
        throw new NotFoundError('BookmarkedApp');
      }

      // If moving to a folder, verify it exists and belongs to the same profile
      if (data.folderId) {
        const folder = await tx.folder.findFirst({
          where: {
            id: data.folderId,
            profileId: app.profileId
          }
        });

        if (!folder) {
          throw new NotFoundError('Folder');
        }
      }

      // Update the app
      const updatedApp = await tx.bookmarkedApp.update({
        where: { id: appId },
        data: {
          ...(data.name && { name: data.name }),
          ...(data.url && { url: data.url }),
          ...(data.iconUrl !== undefined && { iconUrl: data.iconUrl }),
          ...(data.folderId !== undefined && { folderId: data.folderId }),
          ...(data.position !== undefined && { position: data.position }),
          updatedAt: new Date()
        },
        include: {
          folder: {
            select: {
              name: true
            }
          }
        }
      });

      return this.formatAppResponse(updatedApp);
    });
  }

  /**
   * Delete a bookmarked app
   */
  async deleteApp(appId: string, userId: string): Promise<void> {
    // Verify app ownership
    const app = await prisma.bookmarkedApp.findFirst({
      where: { 
        id: appId,
        profile: { userId }
      }
    });

    if (!app) {
      throw new NotFoundError('BookmarkedApp');
    }

    await prisma.bookmarkedApp.delete({
      where: { id: appId }
    });
  }

  /**
   * Reorder apps within a folder or at root level
   */
  async reorderApps(
    profileId: string,
    userId: string,
    data: ReorderAppsRequest,
    folderId?: string
  ): Promise<BookmarkedAppResponse[]> {
    return withTransaction(async (tx) => {
      // Verify profile ownership
      const profile = await tx.smartProfile.findFirst({
        where: { 
          id: profileId,
          userId 
        }
      });

      if (!profile) {
        throw new NotFoundError('SmartProfile');
      }

      // If folder specified, verify it exists
      if (folderId) {
        const folder = await tx.folder.findFirst({
          where: {
            id: folderId,
            profileId
          }
        });

        if (!folder) {
          throw new NotFoundError('Folder');
        }
      }

      // Verify all apps belong to the profile and folder
      const apps = await tx.bookmarkedApp.findMany({
        where: {
          id: { in: data.appIds },
          profileId,
          folderId: folderId || null
        }
      });

      if (apps.length !== data.appIds.length) {
        throw new NotFoundError('Some apps not found or not accessible');
      }

      // Update positions
      const updates = data.appIds.map((appId, index) => 
        tx.bookmarkedApp.update({
          where: { id: appId },
          data: { position: index + 1 }
        })
      );

      await Promise.all(updates);

      // Return updated apps
      const updatedApps = await tx.bookmarkedApp.findMany({
        where: {
          profileId,
          folderId: folderId || null
        },
        include: {
          folder: {
            select: {
              name: true
            }
          }
        },
        orderBy: { position: 'asc' }
      });

      return updatedApps.map(app => this.formatAppResponse(app));
    });
  }

  /**
   * Move app to different folder
   */
  async moveAppToFolder(
    appId: string,
    userId: string,
    targetFolderId: string | null,
    position?: number
  ): Promise<BookmarkedAppResponse> {
    return withTransaction(async (tx) => {
      // Verify app ownership
      const app = await tx.bookmarkedApp.findFirst({
        where: { 
          id: appId,
          profile: { userId }
        },
        include: { profile: true }
      });

      if (!app) {
        throw new NotFoundError('BookmarkedApp');
      }

      // If moving to a folder, verify it exists
      if (targetFolderId) {
        const folder = await tx.folder.findFirst({
          where: {
            id: targetFolderId,
            profileId: app.profileId
          }
        });

        if (!folder) {
          throw new NotFoundError('Folder');
        }
      }

      // Determine position in target location
      let targetPosition = position;
      if (targetPosition === undefined) {
        const lastApp = await tx.bookmarkedApp.findFirst({
          where: { 
            profileId: app.profileId,
            folderId: targetFolderId
          },
          orderBy: { position: 'desc' }
        });
        targetPosition = (lastApp?.position || 0) + 1;
      }

      // Update the app
      const updatedApp = await tx.bookmarkedApp.update({
        where: { id: appId },
        data: {
          folderId: targetFolderId,
          position: targetPosition,
          updatedAt: new Date()
        },
        include: {
          folder: {
            select: {
              name: true
            }
          }
        }
      });

      return this.formatAppResponse(updatedApp);
    });
  }

  /**
   * Search apps by name or URL
   */
  async searchApps(
    profileId: string,
    userId: string,
    query: string
  ): Promise<BookmarkedAppResponse[]> {
    // Verify profile ownership
    const profile = await prisma.smartProfile.findFirst({
      where: { 
        id: profileId,
        userId 
      }
    });

    if (!profile) {
      throw new NotFoundError('SmartProfile');
    }

    const apps = await prisma.bookmarkedApp.findMany({
      where: {
        profileId,
        OR: [
          { name: { contains: query } },
          { url: { contains: query } }
        ]
      },
      include: {
        folder: {
          select: {
            name: true
          }
        }
      },
      orderBy: { name: 'asc' }
    });

    return apps.map(app => this.formatAppResponse(app));
  }

  /**
   * Format app response
   */
  private formatAppResponse(app: any): BookmarkedAppResponse {
    return {
      id: app.id,
      name: app.name,
      url: app.url,
      iconUrl: app.iconUrl,
      position: app.position,
      folderId: app.folderId,
      folderName: app.folder?.name,
      createdAt: app.createdAt.toISOString(),
      updatedAt: app.updatedAt.toISOString()
    };
  }
}

export const appsService = new AppsService();
