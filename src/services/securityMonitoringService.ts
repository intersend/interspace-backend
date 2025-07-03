import { prisma } from '@/utils/database';
import { auditService } from './auditService';
import { logger } from '@/utils/logger';
import { config } from '@/utils/config';

export interface SecurityMetrics {
  failedLogins: number;
  tokenThefts: number;
  rateLimitViolations: number;
  suspiciousActivities: number;
  mpcOperations: number;
  period: string;
}

export interface SecurityAlert {
  type: 'BRUTE_FORCE' | 'TOKEN_THEFT' | 'ANOMALY' | 'MPC_ABUSE' | 'RATE_LIMIT_ABUSE';
  severity: 'low' | 'medium' | 'high' | 'critical';
  accountId?: string;
  ipAddress?: string;
  details: any;
}

export class SecurityMonitoringService {
  private alertThresholds = {
    failedLogins: { count: 5, window: 300000 }, // 5 failures in 5 minutes
    rateLimitViolations: { count: 10, window: 600000 }, // 10 violations in 10 minutes
    mpcOperations: { count: 10, window: 3600000 }, // 10 MPC ops in 1 hour
  };

  /**
   * Get security metrics for a time period
   */
  async getSecurityMetrics(hours: number = 24): Promise<SecurityMetrics> {
    const since = new Date();
    since.setHours(since.getHours() - hours);

    try {
      const [
        failedLogins,
        tokenThefts,
        rateLimitViolations,
        suspiciousActivities,
        mpcOperations
      ] = await Promise.all([
        this.countSecurityEvents('SECURITY_LOGIN_FAILED', since),
        this.countSecurityEvents('SECURITY_TOKEN_THEFT_DETECTED', since),
        this.countSecurityEvents('SECURITY_RATE_LIMIT_EXCEEDED', since),
        this.countSecurityEvents('SECURITY_SUSPICIOUS_ACTIVITY', since),
        this.countMpcOperations(since)
      ]);

      return {
        failedLogins,
        tokenThefts,
        rateLimitViolations,
        suspiciousActivities,
        mpcOperations,
        period: `${hours}h`
      };
    } catch (error) {
      logger.error('Failed to get security metrics', { error });
      return {
        failedLogins: 0,
        tokenThefts: 0,
        rateLimitViolations: 0,
        suspiciousActivities: 0,
        mpcOperations: 0,
        period: `${hours}h`
      };
    }
  }

  /**
   * Count specific security events
   */
  private async countSecurityEvents(action: string, since: Date): Promise<number> {
    const result = await prisma.auditLog.count({
      where: {
        action,
        createdAt: { gte: since }
      }
    });
    return result;
  }

  /**
   * Count MPC operations
   */
  private async countMpcOperations(since: Date): Promise<number> {
    const result = await prisma.auditLog.count({
      where: {
        action: {
          in: ['MPC_KEY_GENERATED', 'MPC_KEY_EXPORT', 'MPC_KEY_ROTATE', 'MPC_KEY_BACKUP']
        },
        createdAt: { gte: since }
      }
    });
    return result;
  }

  /**
   * Check for brute force attempts
   */
  async checkBruteForce(accountId?: string, ipAddress?: string): Promise<boolean> {
    const since = new Date(Date.now() - this.alertThresholds.failedLogins.window);
    
    const query: any = {
      action: 'SECURITY_LOGIN_FAILED',
      createdAt: { gte: since }
    };

    if (accountId) query.accountId = accountId;
    if (ipAddress) query.ipAddress = ipAddress;

    const count = await prisma.auditLog.count({ where: query });
    
    if (count >= this.alertThresholds.failedLogins.count) {
      await this.createAlert({
        type: 'BRUTE_FORCE',
        severity: 'high',
        accountId,
        ipAddress,
        details: { 
          failedAttempts: count, 
          timeWindow: '5 minutes' 
        }
      });
      return true;
    }

    return false;
  }

  /**
   * Check for rate limit abuse
   */
  async checkRateLimitAbuse(accountId?: string, ipAddress?: string): Promise<boolean> {
    const since = new Date(Date.now() - this.alertThresholds.rateLimitViolations.window);
    
    const query: any = {
      action: 'SECURITY_RATE_LIMIT_EXCEEDED',
      createdAt: { gte: since }
    };

    if (accountId) query.accountId = accountId;
    if (ipAddress) query.ipAddress = ipAddress;

    const count = await prisma.auditLog.count({ where: query });
    
    if (count >= this.alertThresholds.rateLimitViolations.count) {
      await this.createAlert({
        type: 'RATE_LIMIT_ABUSE',
        severity: 'medium',
        accountId,
        ipAddress,
        details: { 
          violations: count, 
          timeWindow: '10 minutes' 
        }
      });
      return true;
    }

    return false;
  }

  /**
   * Check for MPC operation abuse
   */
  async checkMpcAbuse(accountId: string): Promise<boolean> {
    const since = new Date(Date.now() - this.alertThresholds.mpcOperations.window);
    
    const count = await prisma.auditLog.count({
      where: {
        accountId,
        action: {
          in: ['MPC_KEY_EXPORT', 'MPC_KEY_ROTATE', 'MPC_KEY_BACKUP']
        },
        createdAt: { gte: since }
      }
    });
    
    if (count >= this.alertThresholds.mpcOperations.count) {
      await this.createAlert({
        type: 'MPC_ABUSE',
        severity: 'critical',
        accountId,
        details: { 
          operations: count, 
          timeWindow: '1 hour',
          operationTypes: ['export', 'rotate', 'backup']
        }
      });
      return true;
    }

    return false;
  }

  /**
   * Create security alert
   */
  private async createAlert(alert: SecurityAlert): Promise<void> {
    try {
      // Log the alert
      logger.warn(`Security Alert: ${alert.type}`, {
        severity: alert.severity,
        accountId: alert.accountId,
        ipAddress: alert.ipAddress,
        details: alert.details
      });

      // Create audit log entry
      await auditService.logSecurityEvent({
        type: 'SUSPICIOUS_ACTIVITY',
        accountId: alert.accountId,
        details: {
          alertType: alert.type,
          severity: alert.severity,
          ...alert.details
        },
        ipAddress: alert.ipAddress
      });

      // In production, this would send alerts to:
      // - Email/SMS to security team
      // - Slack/Discord webhook
      // - PagerDuty for critical alerts
      // - Security dashboard

      // For now, just log to console in development
      if (config.NODE_ENV === 'development') {
        console.log('🚨 SECURITY ALERT:', {
          type: alert.type,
          severity: alert.severity,
          timestamp: new Date().toISOString(),
          ...alert.details
        });
      }
    } catch (error) {
      logger.error('Failed to create security alert', { error, alert });
    }
  }

  /**
   * Get recent security alerts
   */
  async getRecentAlerts(hours: number = 24): Promise<any[]> {
    const since = new Date();
    since.setHours(since.getHours() - hours);

    const alerts = await prisma.auditLog.findMany({
      where: {
        action: 'SECURITY_SUSPICIOUS_ACTIVITY',
        createdAt: { gte: since }
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    });

    return alerts.map(alert => {
      const details = alert.details ? JSON.parse(alert.details) : {};
      return {
        id: alert.id,
        type: details.alertType,
        severity: details.severity,
        accountId: alert.accountId,
        ipAddress: alert.ipAddress,
        details: details,
        createdAt: alert.createdAt
      };
    });
  }

  /**
   * Anomaly detection for unusual patterns
   */
  async detectAnomalies(accountId: string): Promise<void> {
    try {
      // Check for unusual login patterns
      const recentLogins = await prisma.auditLog.findMany({
        where: {
          accountId,
          action: 'LOGIN_SUCCESS',
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        },
        select: {
          ipAddress: true,
          createdAt: true,
          userAgent: true
        }
      });

      // Detect multiple IPs in short time
      const uniqueIps = new Set(recentLogins.map(l => l.ipAddress));
      if (uniqueIps.size > 3) {
        await this.createAlert({
          type: 'ANOMALY',
          severity: 'medium',
          accountId,
          details: {
            anomalyType: 'multiple_ips',
            ipCount: uniqueIps.size,
            ips: Array.from(uniqueIps)
          }
        });
      }

      // Detect unusual time patterns (e.g., login at 3 AM)
      const unusualTimeLogins = recentLogins.filter(login => {
        const hour = login.createdAt.getHours();
        return hour >= 2 && hour <= 5; // 2 AM - 5 AM
      });

      if (unusualTimeLogins.length > 0) {
        await this.createAlert({
          type: 'ANOMALY',
          severity: 'low',
          accountId,
          details: {
            anomalyType: 'unusual_time',
            count: unusualTimeLogins.length,
            times: unusualTimeLogins.map(l => l.createdAt)
          }
        });
      }
    } catch (error) {
      logger.error('Failed to detect anomalies', { error, accountId });
    }
  }

  /**
   * Get security dashboard data
   */
  async getDashboardData(): Promise<{
    metrics: SecurityMetrics;
    recentAlerts: any[];
    riskScore: number;
  }> {
    const [metrics, recentAlerts] = await Promise.all([
      this.getSecurityMetrics(24),
      this.getRecentAlerts(24)
    ]);

    // Calculate risk score (0-100)
    let riskScore = 0;
    riskScore += Math.min(metrics.failedLogins * 2, 20);
    riskScore += metrics.tokenThefts * 20;
    riskScore += Math.min(metrics.rateLimitViolations, 10);
    riskScore += Math.min(metrics.suspiciousActivities * 5, 30);
    riskScore += Math.min(metrics.mpcOperations, 20);

    return {
      metrics,
      recentAlerts,
      riskScore: Math.min(riskScore, 100)
    };
  }
}

export const securityMonitoringService = new SecurityMonitoringService();