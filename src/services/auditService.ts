import { prisma } from '@/utils/database';
import { createHmac } from 'crypto';
import { config } from '@/utils/config';
import { logger } from '@/utils/logger';
import { sanitizeObject } from '@/utils/security';

interface AuditLogEntry {
  userId?: string;
  profileId?: string;
  action: string;
  resource: string;
  details?: string;
  ipAddress?: string;
  userAgent?: string;
}

export class AuditService {
  /**
   * Generate HMAC for audit log integrity
   */
  private generateIntegrityHash(data: any): string {
    const content = JSON.stringify({
      userId: data.userId,
      profileId: data.profileId,
      action: data.action,
      resource: data.resource,
      details: data.details,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
      timestamp: new Date().toISOString()
    });
    
    return createHmac('sha256', config.ENCRYPTION_SECRET)
      .update(content)
      .digest('hex');
  }

  /**
   * Log an audit event with integrity protection
   */
  async log(entry: AuditLogEntry): Promise<void> {
    try {
      // Sanitize details before storing
      const sanitizedDetails = entry.details ? 
        JSON.stringify(sanitizeObject(JSON.parse(entry.details))) : 
        undefined;
      
      // Generate integrity hash
      const integrityHash = this.generateIntegrityHash({
        ...entry,
        details: sanitizedDetails
      });
      
      // Include integrity hash in details
      const detailsWithIntegrity = sanitizedDetails ? 
        JSON.stringify({ ...JSON.parse(sanitizedDetails), integrityHash }) : 
        JSON.stringify({ integrityHash });
      
      await prisma.auditLog.create({
        data: {
          userId: entry.userId,
          profileId: entry.profileId,
          action: entry.action,
          resource: entry.resource,
          details: detailsWithIntegrity,
          ipAddress: entry.ipAddress,
          userAgent: entry.userAgent
        }
      });
    } catch (error) {
      // Log to console but don't throw - audit logging should not break the flow
      logger.error('Failed to create audit log:', error);
    }
  }

  async getAuditLogs(filters: {
    userId?: string;
    profileId?: string;
    action?: string;
    resource?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }) {
    const where: any = {};

    if (filters.userId) where.userId = filters.userId;
    if (filters.profileId) where.profileId = filters.profileId;
    if (filters.action) where.action = filters.action;
    if (filters.resource) where.resource = filters.resource;

    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = filters.startDate;
      if (filters.endDate) where.createdAt.lte = filters.endDate;
    }

    return prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: filters.limit || 100,
      include: {
        profile: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });
  }

  async getCriticalEvents(userId: string, hours: number = 24) {
    const since = new Date();
    since.setHours(since.getHours() - hours);

    return this.getAuditLogs({
      userId,
      startDate: since,
      action: {
        in: ['MPC_KEY_EXPORT', 'MPC_KEY_ROTATE', 'MPC_KEY_BACKUP']
      } as any
    });
  }

  /**
   * Verify integrity of an audit log entry
   */
  async verifyIntegrity(logId: string): Promise<boolean> {
    try {
      const log = await prisma.auditLog.findUnique({
        where: { id: logId }
      });
      
      if (!log || !log.details) return false;
      
      const details = JSON.parse(log.details);
      if (!details.integrityHash) return false;
      
      // Recalculate hash
      const expectedHash = this.generateIntegrityHash({
        userId: log.userId,
        profileId: log.profileId,
        action: log.action,
        resource: log.resource,
        details: log.details,
        ipAddress: log.ipAddress,
        userAgent: log.userAgent
      });
      
      return expectedHash === details.integrityHash;
    } catch (error) {
      logger.error('Failed to verify audit log integrity:', error);
      return false;
    }
  }

  /**
   * Log security-specific events
   */
  async logSecurityEvent(event: {
    type: 'LOGIN_FAILED' | 'INVALID_TOKEN' | 'PERMISSION_DENIED' | 'SUSPICIOUS_ACTIVITY' | 'RATE_LIMIT_EXCEEDED' | 'TOKEN_THEFT_DETECTED';
    userId?: string;
    details: any;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<void> {
    await this.log({
      userId: event.userId,
      action: `SECURITY_${event.type}`,
      resource: 'Security',
      details: JSON.stringify(event.details),
      ipAddress: event.ipAddress,
      userAgent: event.userAgent
    });
  }

  /**
   * Get failed login attempts for a user
   */
  async getFailedLoginAttempts(email: string, hours: number = 1): Promise<number> {
    const since = new Date();
    since.setHours(since.getHours() - hours);
    
    const logs = await prisma.auditLog.findMany({
      where: {
        action: 'SECURITY_LOGIN_FAILED',
        details: {
          contains: email
        },
        createdAt: {
          gte: since
        }
      }
    });
    
    return logs.length;
  }
}

export const auditService = new AuditService();