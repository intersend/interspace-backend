import { Request, Response, NextFunction } from 'express';
import { twoFactorService } from '@/services/twoFactorService';
import { ApiError } from '@/utils/errors';

export class TwoFactorController {
  /**
   * Enable 2FA for the current user
   */
  async enableTwoFactor(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId!;
      
      const setup = await twoFactorService.enableTwoFactor(userId);
      
      res.json({
        success: true,
        data: {
          secret: setup.secret,
          qrCodeUrl: setup.qrCodeUrl,
          backupCodes: setup.backupCodes
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Verify and complete 2FA setup
   */
  async verifyTwoFactorSetup(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId!;
      const { token } = req.body;
      
      if (!token) {
        throw new ApiError('2FA token required', 400);
      }
      
      await twoFactorService.verifyAndCompleteTwoFactorSetup(userId, token);
      
      res.json({
        success: true,
        message: '2FA has been successfully enabled'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Verify 2FA token
   */
  async verifyTwoFactor(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId!;
      const { token } = req.body;
      
      if (!token) {
        throw new ApiError('2FA token required', 400);
      }
      
      const isValid = await twoFactorService.verifyTwoFactorToken(userId, token);
      
      res.json({
        success: true,
        data: {
          isValid
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Disable 2FA
   */
  async disableTwoFactor(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId!;
      const { password } = req.body;
      
      if (!password) {
        throw new ApiError('Password required to disable 2FA', 400);
      }
      
      await twoFactorService.disableTwoFactor(userId, password);
      
      res.json({
        success: true,
        message: '2FA has been disabled'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Regenerate backup codes
   */
  async regenerateBackupCodes(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId!;
      const { password } = req.body;
      
      if (!password) {
        throw new ApiError('Password required to regenerate backup codes', 400);
      }
      
      const backupCodes = await twoFactorService.regenerateBackupCodes(userId, password);
      
      res.json({
        success: true,
        data: {
          backupCodes
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get 2FA status
   */
  async getTwoFactorStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId!;
      
      const isEnabled = await twoFactorService.isTwoFactorEnabled(userId);
      
      res.json({
        success: true,
        data: {
          isEnabled
        }
      });
    } catch (error) {
      next(error);
    }
  }
}

export const twoFactorController = new TwoFactorController();