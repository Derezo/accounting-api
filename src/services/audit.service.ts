import crypto from 'crypto';
import { AuditAction } from '../types/enums';
import { prisma } from '../config/database';
import { config } from '../config/config';

interface AuditContext {
  userId?: string;
  organizationId: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

interface AuditChanges {
  [key: string]: {
    before?: unknown;
    after?: unknown;
  };
}

export interface AuditData {
  action: AuditAction;
  entityType: string;
  entityId: string;
  changes?: AuditChanges | Record<string, unknown>;
  details?: Record<string, unknown>;
  context: AuditContext;
}

export class AuditService {
  // CRITICAL: Audit signing key for HMAC signatures
  // In production, this should be loaded from a secure secret manager (AWS Secrets Manager, HashiCorp Vault, etc.)
  private readonly AUDIT_SIGNING_KEY = process.env.AUDIT_SIGNING_KEY || config.ENCRYPTION_KEY || 'default-audit-key-CHANGE-IN-PRODUCTION';

  /**
   * Generate cryptographic hash for audit entry
   * Creates a deterministic hash from critical audit fields
   */
  private async generateEntryHash(
    entry: AuditData,
    previousHash: string | null,
    sequenceNum: number
  ): Promise<string> {
    const data = JSON.stringify({
      organizationId: entry.context.organizationId,
      userId: entry.context.userId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      timestamp: new Date().toISOString(),
      previousHash,
      sequenceNum
    });

    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Generate HMAC signature for tamper detection
   * Uses HMAC-SHA256 with server-side secret key
   */
  private generateSignature(entryHash: string): string {
    return crypto
      .createHmac('sha256', this.AUDIT_SIGNING_KEY)
      .update(entryHash)
      .digest('hex');
  }

  /**
   * Create audit log with hash chain and cryptographic signature
   * CRITICAL: This method MUST NOT fail silently - audit failures block operations
   */
  async logAction(data: AuditData): Promise<void> {
    try {
      // Get the last audit log entry for this organization to build hash chain
      const lastEntry = await prisma.auditLog.findFirst({
        where: { organizationId: data.context.organizationId },
        orderBy: { sequenceNum: 'desc' }
      });

      const previousHash = lastEntry?.entryHash || null;
      const sequenceNum = (lastEntry?.sequenceNum || 0) + 1;

      // Generate hash and signature for this entry
      const entryHash = await this.generateEntryHash(data, previousHash, sequenceNum);
      const signature = this.generateSignature(entryHash);

      // Create audit log with hash chain
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
          timestamp: new Date(),
          previousHash,
          entryHash,
          signature,
          sequenceNum
        }
      });
    } catch (error) {
      // CRITICAL: Audit failures must block the operation
      console.error('CRITICAL: Audit log creation failed:', error);
      throw new Error('Operation blocked: Audit logging failed. This is a security requirement.');
    }
  }

  /**
   * Verify the integrity of the audit log hash chain
   * Detects any tampering or missing entries
   */
  async verifyAuditChainIntegrity(organizationId: string): Promise<{
    valid: boolean;
    errors: string[];
    totalEntries: number;
    verifiedEntries: number;
  }> {
    const entries = await prisma.auditLog.findMany({
      where: { organizationId },
      orderBy: { sequenceNum: 'asc' }
    });

    const errors: string[] = [];
    let previousHash: string | null = null;
    let verifiedCount = 0;

    for (const entry of entries) {
      // Skip migrated entries (they have placeholder hashes)
      if (entry.entryHash.endsWith('-migrated')) {
        continue;
      }

      // Verify hash chain linkage
      if (previousHash !== entry.previousHash) {
        errors.push(`Chain broken at sequence ${entry.sequenceNum}: expected previousHash=${previousHash}, got=${entry.previousHash}`);
      }

      // Verify signature
      const expectedSignature = this.generateSignature(entry.entryHash);
      if (entry.signature !== expectedSignature) {
        errors.push(`Invalid signature at sequence ${entry.sequenceNum}`);
      }

      // Regenerate hash and verify it matches
      const expectedHash = await this.generateEntryHash(
        {
          action: entry.action as AuditAction,
          entityType: entry.entityType,
          entityId: entry.entityId,
          context: {
            organizationId: entry.organizationId,
            userId: entry.userId || undefined,
            ipAddress: entry.ipAddress || undefined,
            userAgent: entry.userAgent || undefined,
            requestId: entry.requestId || undefined
          }
        },
        entry.previousHash,
        entry.sequenceNum
      );

      if (entry.entryHash !== expectedHash) {
        errors.push(`Hash mismatch at sequence ${entry.sequenceNum}`);
      } else {
        verifiedCount++;
      }

      previousHash = entry.entryHash;
    }

    return {
      valid: errors.length === 0,
      errors,
      totalEntries: entries.length,
      verifiedEntries: verifiedCount
    };
  }

  /**
   * Verify a single audit log entry
   */
  async verifyAuditEntry(entryId: string): Promise<{
    valid: boolean;
    errors: string[];
  }> {
    const entry = await prisma.auditLog.findUnique({
      where: { id: entryId }
    });

    if (!entry) {
      return { valid: false, errors: ['Audit entry not found'] };
    }

    const errors: string[] = [];

    // Skip migrated entries
    if (entry.entryHash.endsWith('-migrated')) {
      return { valid: true, errors: ['Migrated entry - hash verification skipped'] };
    }

    // Verify signature
    const expectedSignature = this.generateSignature(entry.entryHash);
    if (entry.signature !== expectedSignature) {
      errors.push('Invalid signature');
    }

    // Verify hash
    const expectedHash = await this.generateEntryHash(
      {
        action: entry.action as AuditAction,
        entityType: entry.entityType,
        entityId: entry.entityId,
        context: {
          organizationId: entry.organizationId,
          userId: entry.userId || undefined,
          ipAddress: entry.ipAddress || undefined,
          userAgent: entry.userAgent || undefined,
          requestId: entry.requestId || undefined
        }
      },
      entry.previousHash,
      entry.sequenceNum
    );

    if (entry.entryHash !== expectedHash) {
      errors.push('Hash mismatch - entry may have been tampered with');
    }

    // Verify chain linkage if not first entry
    if (entry.sequenceNum > 1) {
      const previousEntry = await prisma.auditLog.findFirst({
        where: {
          organizationId: entry.organizationId,
          sequenceNum: entry.sequenceNum - 1
        }
      });

      if (!previousEntry) {
        errors.push('Previous entry in chain not found');
      } else if (entry.previousHash !== previousEntry.entryHash) {
        errors.push('Chain linkage broken');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  async logCreate(
    entityType: string,
    entityId: string,
    data: Record<string, unknown>,
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
    oldData: Record<string, unknown>,
    newData: Record<string, unknown>,
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
    data: Record<string, unknown>,
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
    query: Record<string, unknown>,
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
    const where: Record<string, unknown> = { organizationId };

    if (filters?.entityType) where.entityType = filters.entityType;
    if (filters?.entityId) where.entityId = filters.entityId;
    if (filters?.userId) where.userId = filters.userId;
    if (filters?.action) where.action = filters.action;

    if (filters?.startDate || filters?.endDate) {
      where.timestamp = {};
      if (filters.startDate) (where.timestamp as any).gte = filters.startDate;
      if (filters.endDate) (where.timestamp as any).lte = filters.endDate;
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

  private compareObjects(oldData: any, newData: any): Record<string, unknown> {
    const changes: Record<string, unknown> = {};

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
      'timestamp',
      'userId',
      'action',
      'resourceType',
      'resourceId',
      'ipAddress',
      'changes'
    ];

    const rows = logs.map(log => [
      log.timestamp,
      log.userId || '',
      log.action,
      log.entityType,
      log.entityId,
      log.ipAddress || '',
      JSON.stringify(log.changes || {})
    ]);

    return [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');
  }

  async getUserActivity(userId: string, organizationId: string, options?: {
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    actions?: string[];
  }): Promise<Array<{
    id: string;
    timestamp: Date;
    action: string;
    entityType: string;
    entityId: string;
    ipAddress: string | null;
    userAgent: string | null;
    changes: Record<string, unknown>;
    riskLevel: 'low' | 'medium' | 'high';
  }>> {
    const startDate = options?.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    const endDate = options?.endDate || new Date();
    const limit = options?.limit || 100;

    const logs = await prisma.auditLog.findMany({
      where: {
        userId,
        organizationId,
        timestamp: {
          gte: startDate,
          lte: endDate
        },
        ...(options?.actions && options.actions.length > 0 && {
          action: {
            in: options.actions
          }
        })
      },
      orderBy: { timestamp: 'desc' },
      take: limit
    });

    return logs.map(log => ({
      id: log.id,
      timestamp: log.timestamp,
      createdAt: log.timestamp, // Add createdAt for compatibility with tests
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      changes: log.changes ? JSON.parse(log.changes) : null,
      riskLevel: this.calculateActivityRiskLevel(log)
    }));
  }

  async getActiveSessions(organizationId: string): Promise<Array<{
    userId: string;
    userName: string;
    ipAddress: string;
    userAgent: string;
    lastActivity: Date;
    sessionDuration: number;
    riskScore: number;
    location?: string;
  }>> {
    // Get recent login events
    const recentLogins = await prisma.auditLog.findMany({
      where: {
        organizationId,
        action: 'LOGIN',
        timestamp: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
        }
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        }
      },
      orderBy: { timestamp: 'desc' }
    });

    // Group by user and get most recent activity
    const sessionMap = new Map();

    for (const login of recentLogins) {
      if (!sessionMap.has(login.userId)) {
        const lastActivity = await this.getLastUserActivity(login.userId!, organizationId);
        sessionMap.set(login.userId, {
          userId: login.userId,
          userName: login.user ? `${login.user.firstName} ${login.user.lastName}` : 'Unknown',
          ipAddress: login.ipAddress || 'Unknown',
          userAgent: login.userAgent || 'Unknown',
          lastActivity: lastActivity || login.timestamp,
          sessionDuration: Date.now() - login.timestamp.getTime(),
          riskScore: await this.calculateUserRiskScore(login.userId!, organizationId)
        });
      }
    }

    return Array.from(sessionMap.values());
  }

  async getSuspiciousActivity(organizationId: string, options?: {
    severity?: 'low' | 'medium' | 'high' | 'critical';
    limit?: number;
  }): Promise<Array<{
    id: string;
    type: string;
    description: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    timestamp: Date;
    userId?: string;
    userName?: string;
    ipAddress?: string;
    details: Record<string, unknown>;
  }>> {
    const limit = options?.limit || 50;

    // Detect various suspicious patterns
    const suspiciousActivities: Array<{
      id: string;
      type: string;
      description: string;
      severity: 'low' | 'medium' | 'high' | 'critical';
      timestamp: Date;
      userId?: string;
      userName?: string;
      ipAddress?: string;
      details: Record<string, unknown>;
    }> = [];

    // 1. Multiple failed login attempts
    const failedLogins = await prisma.auditLog.findMany({
      where: {
        organizationId,
        action: 'LOGIN',
        changes: {
          contains: 'failed'
        },
        timestamp: {
          gte: new Date(Date.now() - 60 * 60 * 1000) // Last hour
        }
      },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true
          }
        }
      }
    });

    // Group failed logins by IP
    const failedByIP = new Map();
    failedLogins.forEach(log => {
      const ip = log.ipAddress || 'unknown';
      if (!failedByIP.has(ip)) {
        failedByIP.set(ip, []);
      }
      failedByIP.get(ip).push(log);
    });

    // Flag IPs with multiple failed attempts
    failedByIP.forEach((attempts, ip) => {
      if (attempts.length >= 5) {
        suspiciousActivities.push({
          id: `brute-force-${ip}-${Date.now()}`,
          type: 'BRUTE_FORCE_ATTEMPT',
          description: `Multiple failed login attempts from IP ${ip}`,
          severity: attempts.length >= 10 ? 'critical' : 'high' as const,
          timestamp: attempts[attempts.length - 1].timestamp,
          ipAddress: ip,
          details: {
            attemptCount: attempts.length,
            timeWindow: '1 hour',
            targetUsers: attempts.map((a: any) => a.user ? `${a.user.firstName} ${a.user.lastName}` : 'Unknown')
          }
        });
      }
    });

    // 2. Unusual access patterns (different from normal times/locations)
    // This would require historical data analysis - simplified version here
    const recentHighRiskActions = await prisma.auditLog.findMany({
      where: {
        organizationId,
        action: {
          in: ['DELETE', 'UPDATE']
        },
        entityType: {
          in: ['USER', 'PAYMENT', 'INVOICE']
        },
        timestamp: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
        }
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        }
      },
      take: limit
    });

    recentHighRiskActions.forEach(log => {
      suspiciousActivities.push({
        id: `high-risk-${log.id}`,
        type: 'HIGH_RISK_ACTION',
        description: `High-risk ${log.action.toLowerCase()} operation on ${log.entityType.toLowerCase()}`,
        severity: 'medium' as const,
        timestamp: log.timestamp,
        userId: log.userId || undefined,
        userName: log.user ? `${log.user.firstName} ${log.user.lastName}` : undefined,
        ipAddress: log.ipAddress || undefined,
        details: {
          action: log.action,
          entityType: log.entityType,
          entityId: log.entityId,
          changes: log.changes ? JSON.parse(log.changes) : null
        }
      });
    });

    // Filter by severity if specified
    let filteredActivities = suspiciousActivities;
    if (options?.severity) {
      filteredActivities = suspiciousActivities.filter(a => a.severity === options.severity);
    }

    return filteredActivities
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  async getSecurityMetrics(organizationId: string): Promise<{
    totalEvents: number;
    criticalAlerts: number;
    failedLogins: number;
    activeUsers: number;
    riskScore: number;
    complianceStatus: 'compliant' | 'warning' | 'violation';
  }> {
    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [totalEvents, failedLogins, activeUsers] = await Promise.all([
      prisma.auditLog.count({
        where: {
          organizationId,
          timestamp: { gte: last24Hours }
        }
      }),
      prisma.auditLog.count({
        where: {
          organizationId,
          action: 'LOGIN',
          changes: { contains: 'failed' },
          timestamp: { gte: last24Hours }
        }
      }),
      prisma.auditLog.count({
        where: {
          organizationId,
          action: 'LOGIN',
          changes: { not: { contains: 'failed' } },
          timestamp: { gte: last24Hours }
        }
      })
    ]);

    const suspiciousActivities = await this.getSuspiciousActivity(organizationId);
    const criticalAlerts = suspiciousActivities.filter(a => a.severity === 'critical').length;

    // Calculate overall risk score (0-100)
    const riskScore = Math.min(100, Math.floor(
      (failedLogins * 2) +
      (criticalAlerts * 10) +
      (suspiciousActivities.length * 1)
    ));

    // Determine compliance status
    let complianceStatus: 'compliant' | 'warning' | 'violation' = 'compliant';
    if (criticalAlerts > 0 || riskScore > 75) {
      complianceStatus = 'violation';
    } else if (riskScore > 50 || failedLogins > 10) {
      complianceStatus = 'warning';
    }

    return {
      totalEvents,
      criticalAlerts,
      failedLogins,
      activeUsers,
      riskScore,
      complianceStatus
    };
  }

  private calculateActivityRiskLevel(log: any): 'low' | 'medium' | 'high' {
    const highRiskActions = ['DELETE', 'UPDATE', 'EXPORT'];
    const highRiskEntities = ['USER', 'PAYMENT', 'INVOICE'];

    if (highRiskActions.includes(log.action) && highRiskEntities.includes(log.entityType)) {
      return 'high';
    } else if (highRiskActions.includes(log.action) || highRiskEntities.includes(log.entityType)) {
      return 'medium';
    }
    return 'low';
  }

  private async getLastUserActivity(userId: string, organizationId: string): Promise<Date | null> {
    const lastActivity = await prisma.auditLog.findFirst({
      where: {
        userId,
        organizationId
      },
      orderBy: { timestamp: 'desc' },
      select: { timestamp: true }
    });

    return lastActivity?.timestamp || null;
  }

  private async calculateUserRiskScore(userId: string, organizationId: string): Promise<number> {
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [highRiskActions, failedLogins] = await Promise.all([
      prisma.auditLog.count({
        where: {
          userId,
          organizationId,
          action: { in: ['DELETE', 'UPDATE'] },
          timestamp: { gte: last24Hours }
        }
      }),
      prisma.auditLog.count({
        where: {
          userId,
          organizationId,
          action: 'LOGIN',
          changes: { contains: 'failed' },
          timestamp: { gte: last24Hours }
        }
      })
    ]);

    return Math.min(100, (highRiskActions * 10) + (failedLogins * 5));
  }
}

export const auditService = new AuditService();
