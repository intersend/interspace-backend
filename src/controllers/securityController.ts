import { Request, Response } from 'express';
import { securityMonitoringService } from '@/services/securityMonitoringService';
import { ApiResponse } from '@/types';

export class SecurityController {
  /**
   * Get security metrics
   */
  async getMetrics(req: Request, res: Response): Promise<void> {
    try {
      const hours = parseInt(req.query.hours as string) || 24;
      const metrics = await securityMonitoringService.getSecurityMetrics(hours);

      res.status(200).json({
        success: true,
        data: metrics
      } as ApiResponse);
    } catch (error: any) {
      console.error('Get security metrics error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to get security metrics'
      } as ApiResponse);
    }
  }

  /**
   * Get recent security alerts
   */
  async getAlerts(req: Request, res: Response): Promise<void> {
    try {
      const hours = parseInt(req.query.hours as string) || 24;
      const alerts = await securityMonitoringService.getRecentAlerts(hours);

      res.status(200).json({
        success: true,
        data: alerts
      } as ApiResponse);
    } catch (error: any) {
      console.error('Get security alerts error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to get security alerts'
      } as ApiResponse);
    }
  }

  /**
   * Get security dashboard data
   */
  async getDashboard(req: Request, res: Response): Promise<void> {
    try {
      const dashboard = await securityMonitoringService.getDashboardData();

      res.status(200).json({
        success: true,
        data: dashboard
      } as ApiResponse);
    } catch (error: any) {
      console.error('Get security dashboard error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to get security dashboard'
      } as ApiResponse);
    }
  }

  /**
   * Check for anomalies for current user
   */
  async checkAnomalies(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        } as ApiResponse);
        return;
      }

      await securityMonitoringService.detectAnomalies(userId);

      res.status(200).json({
        success: true,
        message: 'Anomaly detection completed'
      } as ApiResponse);
    } catch (error: any) {
      console.error('Check anomalies error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to check anomalies'
      } as ApiResponse);
    }
  }
}

export const securityController = new SecurityController();