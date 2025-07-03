import { prisma } from '../utils/database';
import { DragOperation } from '@prisma/client';

export interface DragOperationDetails {
  type: 'reorder' | 'move' | 'batch_move' | 'batch_update';
  before: any;
  after: any;
  details?: any;
}

export class DragOperationService {
  /**
   * Record a drag operation
   */
  async recordOperation(
    profileId: string,
    operation: DragOperationDetails
  ): Promise<DragOperation> {
    return await prisma.dragOperation.create({
      data: {
        profileId,
        type: operation.type,
        before: operation.before,
        after: operation.after,
        details: operation.details
      }
    });
  }

  /**
   * Get operation history for a profile
   */
  async getOperationHistory(
    profileId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<{ operations: DragOperation[]; total: number }> {
    // Verify profile exists
    const profile = await prisma.smartProfile.findUnique({
      where: {
        id: profileId
      }
    });

    if (!profile) {
      throw new Error('Profile not found');
    }

    const [operations, total] = await Promise.all([
      prisma.dragOperation.findMany({
        where: {
          profileId,
          undone: false
        },
        orderBy: {
          createdAt: 'desc'
        },
        take: limit,
        skip: offset
      }),
      prisma.dragOperation.count({
        where: {
          profileId,
          undone: false
        }
      })
    ]);

    return { operations, total };
  }

  /**
   * Get the last undoable operation
   */
  async getLastUndoableOperation(
    profileId: string
  ): Promise<DragOperation | null> {
    // Verify profile exists
    const profile = await prisma.smartProfile.findUnique({
      where: {
        id: profileId
      }
    });

    if (!profile) {
      throw new Error('Profile not found');
    }

    return await prisma.dragOperation.findFirst({
      where: {
        profileId,
        undone: false
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
  }

  /**
   * Undo the last operation
   */
  async undoLastOperation(
    profileId: string
  ): Promise<{ success: boolean; operation?: DragOperation }> {
    const lastOperation = await this.getLastUndoableOperation(profileId);
    
    if (!lastOperation) {
      return { success: false };
    }

    // Mark operation as undone
    await prisma.dragOperation.update({
      where: { id: lastOperation.id },
      data: { undone: true }
    });

    // The actual undo logic would be implemented in the respective services
    // based on the operation type and before state
    return { 
      success: true, 
      operation: lastOperation 
    };
  }

  /**
   * Clear operation history
   */
  async clearHistory(
    profileId: string,
    olderThanDays: number = 30
  ): Promise<number> {
    // Verify profile exists
    const profile = await prisma.smartProfile.findUnique({
      where: {
        id: profileId
      }
    });

    if (!profile) {
      throw new Error('Profile not found');
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const result = await prisma.dragOperation.deleteMany({
      where: {
        profileId,
        createdAt: {
          lt: cutoffDate
        }
      }
    });

    return result.count;
  }
}

export const dragOperationService = new DragOperationService();