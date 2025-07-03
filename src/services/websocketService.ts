import { Server as SocketIOServer } from 'socket.io';
import { Application } from 'express';

export class WebSocketService {
  private io: SocketIOServer | null = null;

  /**
   * Initialize with Socket.IO instance
   */
  initialize(app: Application) {
    this.io = app.get('io') as SocketIOServer;
  }

  /**
   * Emit app created event
   */
  emitAppCreated(profileId: string, app: any) {
    if (!this.io) return;
    
    this.io.to(`profile:${profileId}`).emit('app_created', {
      type: 'app_created',
      profileId,
      data: app,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Emit app updated event
   */
  emitAppUpdated(profileId: string, app: any) {
    if (!this.io) return;
    
    this.io.to(`profile:${profileId}`).emit('app_updated', {
      type: 'app_updated',
      profileId,
      data: app,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Emit app deleted event
   */
  emitAppDeleted(profileId: string, appId: string) {
    if (!this.io) return;
    
    this.io.to(`profile:${profileId}`).emit('app_deleted', {
      type: 'app_deleted',
      profileId,
      data: { appId },
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Emit apps reordered event
   */
  emitAppsReordered(profileId: string, apps: any[]) {
    if (!this.io) return;
    
    this.io.to(`profile:${profileId}`).emit('apps_reordered', {
      type: 'apps_reordered',
      profileId,
      data: apps,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Emit batch position update event
   */
  emitBatchPositionUpdate(profileId: string, updates: any[]) {
    if (!this.io) return;
    
    this.io.to(`profile:${profileId}`).emit('batch_position_update', {
      type: 'batch_position_update',
      profileId,
      data: updates,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Emit apps moved to folder event
   */
  emitAppsMovedToFolder(profileId: string, folderId: string, apps: any[]) {
    if (!this.io) return;
    
    this.io.to(`profile:${profileId}`).emit('apps_moved_to_folder', {
      type: 'apps_moved_to_folder',
      profileId,
      data: {
        folderId,
        apps
      },
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Emit folder created event
   */
  emitFolderCreated(profileId: string, folder: any) {
    if (!this.io) return;
    
    this.io.to(`profile:${profileId}`).emit('folder_created', {
      type: 'folder_created',
      profileId,
      data: folder,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Emit folder updated event
   */
  emitFolderUpdated(profileId: string, folder: any) {
    if (!this.io) return;
    
    this.io.to(`profile:${profileId}`).emit('folder_updated', {
      type: 'folder_updated',
      profileId,
      data: folder,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Emit folder deleted event
   */
  emitFolderDeleted(profileId: string, folderId: string) {
    if (!this.io) return;
    
    this.io.to(`profile:${profileId}`).emit('folder_deleted', {
      type: 'folder_deleted',
      profileId,
      data: { folderId },
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Emit folders reordered event
   */
  emitFoldersReordered(profileId: string, folders: any[]) {
    if (!this.io) return;
    
    this.io.to(`profile:${profileId}`).emit('folders_reordered', {
      type: 'folders_reordered',
      profileId,
      data: folders,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Emit drag operation event
   */
  emitDragOperation(profileId: string, operation: any) {
    if (!this.io) return;
    
    this.io.to(`profile:${profileId}`).emit('drag_operation', {
      type: 'drag_operation',
      profileId,
      data: operation,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Emit sync required event (for conflict resolution)
   */
  emitSyncRequired(profileId: string, reason: string) {
    if (!this.io) return;
    
    this.io.to(`profile:${profileId}`).emit('sync_required', {
      type: 'sync_required',
      profileId,
      data: { reason },
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Emit profile created event
   */
  emitProfileCreated(accountId: string, profile: any, needsMpcGeneration: boolean) {
    if (!this.io) return;
    
    // Emit to the account's room (iOS client should join account room on login)
    this.io.to(`account:${accountId}`).emit('profile_created', {
      type: 'profile_created',
      accountId,
      data: {
        profile,
        needsMpcGeneration
      },
      timestamp: new Date().toISOString()
    });
  }
}

export const websocketService = new WebSocketService();