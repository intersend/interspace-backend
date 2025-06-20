import { Request, Response } from 'express';
import { dragOperationService } from '../services/dragOperationService';
import { ApiResponse } from '../types';

export class DragOperationController {
  /**
   * Get operation history
   */
  async getOperationHistory(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        } as ApiResponse);
        return;
      }

      const { profileId } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;

      if (!profileId) {
        res.status(400).json({
          success: false,
          error: 'Profile ID is required'
        } as ApiResponse);
        return;
      }

      const result = await dragOperationService.getOperationHistory(
        profileId,
        userId,
        limit,
        offset
      );

      res.status(200).json({
        success: true,
        data: result
      } as ApiResponse);
    } catch (error: any) {
      console.error('Get operation history error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to get operation history'
      } as ApiResponse);
    }
  }

  /**
   * Undo last operation
   */
  async undoLastOperation(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
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

      const result = await dragOperationService.undoLastOperation(
        profileId,
        userId
      );

      if (!result.success) {
        res.status(404).json({
          success: false,
          error: 'No undoable operation found'
        } as ApiResponse);
        return;
      }

      res.status(200).json({
        success: true,
        data: result.operation
      } as ApiResponse);
    } catch (error: any) {
      console.error('Undo operation error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to undo operation'
      } as ApiResponse);
    }
  }

  /**
   * Clear operation history
   */
  async clearHistory(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        } as ApiResponse);
        return;
      }

      const { profileId } = req.params;
      const olderThanDays = parseInt(req.query.olderThanDays as string) || 30;

      if (!profileId) {
        res.status(400).json({
          success: false,
          error: 'Profile ID is required'
        } as ApiResponse);
        return;
      }

      const deletedCount = await dragOperationService.clearHistory(
        profileId,
        userId,
        olderThanDays
      );

      res.status(200).json({
        success: true,
        data: { deletedCount }
      } as ApiResponse);
    } catch (error: any) {
      console.error('Clear history error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to clear history'
      } as ApiResponse);
    }
  }
}

export const dragOperationController = new DragOperationController();