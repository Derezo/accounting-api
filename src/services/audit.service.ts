import { PrismaClient } from '@prisma/client';
import { AuditAction } from '../types/enums';

const prisma = new PrismaClient();

interface AuditContext {
  userId?: string;
  organizationId: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

interface AuditData {
  action: AuditAction;
  entityType: string;
  entityId: string;
  changes?: any;
  context: AuditContext;
}

export class AuditService {
  async logAction(data: AuditData): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          organizationId: data.context.organizationId,
          userId: data.context.userId,
          action: data.action,
          entityType: data.entityType,
          entityId: data.entityId,
          changes: data.changes ? JSON.stringify(data.changes) : null,
          ipAddress: data.context.ipAddress,
          userAgent: data.context.userAgent,
          requestId: data.context.requestId,
          timestamp: new Date()
        }
      });
    } catch (error) {
      // Log audit failures but don't throw - audit logging should not break operations
      console.error('Audit logging failed:', error);
    }
  }

  async logCreate(
    entityType: string,
    entityId: string,
    data: any,
    context: AuditContext
  ): Promise<void> {
    await this.logAction({
      action: AuditAction.CREATE,
      entityType,
      entityId,
      changes: { created: data },
      context
    });
  }

  async logUpdate(
    entityType: string,
    entityId: string,
    oldData: any,
    newData: any,
    context: AuditContext
  ): Promise<void> {
    const changes = this.compareObjects(oldData, newData);

    if (Object.keys(changes).length > 0) {
      await this.logAction({
        action: AuditAction.UPDATE,
        entityType,
        entityId,
        changes,
        context
      });
    }
  }

  async logDelete(
    entityType: string,
    entityId: string,
    data: any,
    context: AuditContext
  ): Promise<void> {
    await this.logAction({
      action: AuditAction.DELETE,
      entityType,
      entityId,
      changes: { deleted: data },
      context
    });
  }

  async logView(
    entityType: string,
    entityId: string,
    context: AuditContext
  ): Promise<void> {
    await this.logAction({
      action: AuditAction.VIEW,
      entityType,
      entityId,
      context
    });
  }

  async logLogin(
    userId: string,
    success: boolean,
    context: Omit<AuditContext, 'userId'>
  ): Promise<void> {
    await this.logAction({
      action: AuditAction.LOGIN,
      entityType: 'User',
      entityId: userId,
      changes: { success, timestamp: new Date().toISOString() },
      context: { ...context, userId }
    });
  }

  async logLogout(
    userId: string,
    context: Omit<AuditContext, 'userId'>
  ): Promise<void> {
    await this.logAction({
      action: AuditAction.LOGOUT,
      entityType: 'User',
      entityId: userId,
      context: { ...context, userId }
    });
  }

  async logExport(
    entityType: string,
    query: any,
    recordCount: number,
    context: AuditContext
  ): Promise<void> {
    await this.logAction({
      action: AuditAction.EXPORT,
      entityType,
      entityId: 'bulk',
      changes: { query, recordCount },
      context
    });
  }

  async logImport(
    entityType: string,
    recordCount: number,
    context: AuditContext
  ): Promise<void> {
    await this.logAction({
      action: AuditAction.IMPORT,
      entityType,
      entityId: 'bulk',
      changes: { recordCount },
      context
    });
  }

  async getAuditLogs(
    organizationId: string,
    filters?: {
      entityType?: string;
      entityId?: string;
      userId?: string;
      action?: AuditAction;
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      offset?: number;
    }
  ): Promise<any[]> {
    const where: any = { organizationId };

    if (filters?.entityType) where.entityType = filters.entityType;
    if (filters?.entityId) where.entityId = filters.entityId;
    if (filters?.userId) where.userId = filters.userId;
    if (filters?.action) where.action = filters.action;

    if (filters?.startDate || filters?.endDate) {
      where.timestamp = {};
      if (filters.startDate) where.timestamp.gte = filters.startDate;
      if (filters.endDate) where.timestamp.lte = filters.endDate;
    }

    return prisma.auditLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: filters?.limit || 100,
      skip: filters?.offset || 0,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true
          }
        }
      }
    });
  }

  async getEntityHistory(
    organizationId: string,
    entityType: string,
    entityId: string
  ): Promise<any[]> {
    return prisma.auditLog.findMany({
      where: {
        organizationId,
        entityType,
        entityId
      },
      orderBy: { timestamp: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true
          }
        }
      }
    });
  }

  private compareObjects(oldData: any, newData: any): any {
    const changes: any = {};

    // Find modified and new fields
    for (const key in newData) {
      if (oldData[key] !== newData[key]) {
        changes[key] = {
          old: oldData[key],
          new: newData[key]
        };
      }
    }

    // Find deleted fields
    for (const key in oldData) {
      if (!(key in newData)) {
        changes[key] = {
          old: oldData[key],
          new: null
        };
      }
    }

    return changes;
  }

  async cleanupOldLogs(organizationId: string, retentionDays: number = 365): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const result = await prisma.auditLog.deleteMany({
      where: {
        organizationId,
        timestamp: {
          lt: cutoffDate
        }
      }
    });

    return result.count;
  }

  async exportAuditLogs(
    organizationId: string,
    startDate: Date,
    endDate: Date,
    format: 'json' | 'csv' = 'json'
  ): Promise<string> {
    const logs = await this.getAuditLogs(organizationId, {
      startDate,
      endDate,
      limit: 10000
    });

    if (format === 'json') {
      return JSON.stringify(logs, null, 2);
    }

    // CSV format
    const headers = [
      'Timestamp',
      'User',
      'Action',
      'Entity Type',
      'Entity ID',
      'IP Address',
      'Changes'
    ];

    const rows = logs.map(log => [
      log.timestamp,
      log.user ? `${log.user.firstName} ${log.user.lastName}` : 'System',
      log.action,
      log.entityType,
      log.entityId,
      log.ipAddress || '',
      log.changes || ''
    ]);

    return [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');
  }
}

export const auditService = new AuditService();