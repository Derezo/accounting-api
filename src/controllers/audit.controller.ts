import { Request, Response } from 'express';
import { query, param, validationResult } from 'express-validator';
import { auditService } from '../services/audit.service';
import { AuditAction } from '../types/enums';
import { prisma } from '../config/database';

// Validation middleware
export const validateGetAuditLogs = [
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO 8601 date'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid ISO 8601 date'),
  query('category')
    .optional()
    .isIn(['AUTH', 'DATA', 'SYSTEM', 'SECURITY', 'FINANCIAL'])
    .withMessage('Category must be one of: AUTH, DATA, SYSTEM, SECURITY, FINANCIAL'),
  query('severity')
    .optional()
    .isIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
    .withMessage('Severity must be one of: LOW, MEDIUM, HIGH, CRITICAL'),
  query('success')
    .optional()
    .isBoolean()
    .withMessage('Success must be a boolean'),
  query('search')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Search term must be 1-100 characters'),
  query('userId')
    .optional()
    .isString()
    .withMessage('User ID must be a string'),
  query('action')
    .optional()
    .isIn(Object.values(AuditAction))
    .withMessage('Valid action is required'),
  query('resource')
    .optional()
    .isString()
    .withMessage('Resource must be a string'),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 1000 })
    .withMessage('Limit must be between 1 and 1000')
];

export const validateGetSecuritySummary = [
  query('startDate')
    .isISO8601()
    .withMessage('Start date is required and must be a valid ISO 8601 date'),
  query('endDate')
    .isISO8601()
    .withMessage('End date is required and must be a valid ISO 8601 date')
];

export const validateExportAuditLogs = [
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO 8601 date'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid ISO 8601 date'),
  query('format')
    .optional()
    .isIn(['json', 'csv', 'pdf'])
    .withMessage('Format must be one of: json, csv, pdf'),
  query('userId')
    .optional()
    .isString()
    .withMessage('User ID must be a string'),
  query('action')
    .optional()
    .isIn(Object.values(AuditAction))
    .withMessage('Valid action is required'),
  query('resource')
    .optional()
    .isString()
    .withMessage('Resource must be a string')
];

class AuditController {
  constructor() {
    this.getAuditLogs = this.getAuditLogs.bind(this);
    this.getSecuritySummary = this.getSecuritySummary.bind(this);
    this.exportAuditLogs = this.exportAuditLogs.bind(this);
    this.exportAuditLogsCSV = this.exportAuditLogsCSV.bind(this);
    this.exportAuditLogsJSON = this.exportAuditLogsJSON.bind(this);
    this.getUserActivity = this.getUserActivity.bind(this);
    this.getActiveSessions = this.getActiveSessions.bind(this);
    this.getSuspiciousActivity = this.getSuspiciousActivity.bind(this);
    this.getSecurityMetrics = this.getSecurityMetrics.bind(this);
    this.getCurrentUserActivitySummary = this.getCurrentUserActivitySummary.bind(this);
    this.getEntityHistory = this.getEntityHistory.bind(this);
    this.getComplianceMetrics = this.getComplianceMetrics.bind(this);
    this.getAuditStreamConfig = this.getAuditStreamConfig.bind(this);
    this.updateAuditStreamConfig = this.updateAuditStreamConfig.bind(this);
  }

  async getAuditLogs(req: Request, res: Response): Promise<void> {
    try {
      // Check validation results
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
        return;
      }

      const { organizationId } = (req as any).user!

      // Parse query parameters
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
      const page = req.query.page ? parseInt(req.query.page as string) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
      const offset = (page - 1) * limit;

      // Get audit logs using existing service
      const auditLogs = await auditService.getAuditLogs(organizationId, {
        userId: req.query.userId as string,
        action: req.query.action as AuditAction,
        entityType: req.query.resource as string,
        startDate,
        endDate,
        limit,
        offset
      });

      // Transform to match frontend expectations
      const transformedLogs = auditLogs.map(log => ({
        id: log.id,
        timestamp: log.timestamp,
        userId: log.userId,
        userName: log.user ? `${log.user.firstName} ${log.user.lastName}` : 'System',
        userRole: 'EMPLOYEE', // TODO: Get actual role from user record
        action: log.action,
        category: this.mapEntityTypeToCategory(log.entityType),
        severity: this.determineSeverity(log.action, log.entityType),
        resource: log.entityType,
        description: this.generateDescription(log),
        ipAddress: log.ipAddress || 'Unknown',
        userAgent: log.userAgent || 'Unknown',
        success: !log.changes?.error,
        details: log.changes || {},
        riskScore: this.calculateRiskScore(log)
      }));

      res.json(transformedLogs);
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      res.status(500).json({
        error: 'Failed to fetch audit logs',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async getSecuritySummary(req: Request, res: Response): Promise<void> {
    try {
      // Check validation results
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
        return;
      }

      const { organizationId } = (req as any).user!
      const startDate = new Date(req.query.startDate as string);
      const endDate = new Date(req.query.endDate as string);

      // Get all audit logs for the period
      const auditLogs = await auditService.getAuditLogs(organizationId, {
        startDate,
        endDate,
        limit: 10000
      });

      // Calculate security summary metrics
      const totalEvents = auditLogs.length;
      const criticalEvents = auditLogs.filter(log =>
        this.determineSeverity(log.action, log.entityType) === 'CRITICAL'
      ).length;

      const failedLogins = auditLogs.filter(log =>
        log.action === AuditAction.LOGIN && log.changes?.success === false
      ).length;

      const dataAccess = auditLogs.filter(log =>
        log.action === AuditAction.VIEW && ['Customer', 'Invoice', 'Payment'].includes(log.entityType)
      ).length;

      // Generate recent activity timeline (last 24 hours by hour)
      const recentActivity = this.generateActivityTimeline(auditLogs, startDate, endDate);

      const summary = {
        totalEvents,
        criticalEvents,
        failedLogins,
        dataAccess,
        recentActivity
      };

      res.json(summary);
    } catch (error) {
      console.error('Error fetching security summary:', error);
      res.status(500).json({
        error: 'Failed to fetch security summary',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async exportAuditLogs(req: Request, res: Response): Promise<void> {
    try {
      // Check validation results
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
        return;
      }

      const { organizationId } = (req as any).user!
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : new Date();
      const format = (req.query.format as string) || 'json';

      const exportData = await auditService.exportAuditLogs(organizationId, startDate, endDate, format as any);

      // Set appropriate headers
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `audit-logs-${timestamp}.${format}`;

      if (format === 'json') {
        res.setHeader('Content-Type', 'application/json');
      } else if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
      }

      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(exportData);
    } catch (error) {
      console.error('Error exporting audit logs:', error);
      res.status(500).json({
        error: 'Failed to export audit logs',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async exportAuditLogsCSV(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId } = (req as any).user!;
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : new Date();

      const exportData = await auditService.exportAuditLogs(organizationId, startDate, endDate, 'csv');

      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `audit-logs-${timestamp}.csv`;

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(exportData);
    } catch (error) {
      console.error('Error exporting audit logs as CSV:', error);
      res.status(500).json({
        error: 'Failed to export audit logs',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async exportAuditLogsJSON(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId } = (req as any).user!;
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : new Date();

      const logs = await auditService.getAuditLogs(organizationId, {
        startDate,
        endDate,
        limit: 10000
      });

      res.json({
        exportInfo: {
          format: 'json',
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          recordCount: logs.length,
          exportedAt: new Date().toISOString()
        },
        auditLogs: logs.map(log => ({
          timestamp: log.timestamp,
          userId: log.userId,
          action: log.action,
          resourceType: log.entityType,
          resourceId: log.entityId,
          ipAddress: log.ipAddress,
          userAgent: log.userAgent,
          changes: log.changes ? JSON.parse(log.changes) : null
        }))
      });
    } catch (error) {
      console.error('Error exporting audit logs as JSON:', error);
      res.status(500).json({
        error: 'Failed to export audit logs',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async getEntityHistory(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId } = (req as any).user!
      const { entityType, entityId } = req.params;

      const history = await auditService.getEntityHistory(organizationId, entityType, entityId);

      // Transform to match frontend expectations
      const transformedHistory = history.map(log => ({
        id: log.id,
        timestamp: log.timestamp,
        userName: log.user ? `${log.user.firstName} ${log.user.lastName}` : 'System',
        action: log.action,
        changes: log.changes || {},
        ipAddress: log.ipAddress || 'Unknown'
      }));

      res.json({
        success: true,
        data: transformedHistory
      });
    } catch (error) {
      console.error('Error fetching entity history:', error);
      res.status(500).json({
        error: 'Failed to fetch entity history',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Helper methods
  private mapEntityTypeToCategory(entityType: string): string {
    const mapping: Record<string, string> = {
      'User': 'AUTH',
      'Customer': 'DATA',
      'Invoice': 'FINANCIAL',
      'Payment': 'FINANCIAL',
      'Quote': 'FINANCIAL',
      'Project': 'DATA',
      'Organization': 'SYSTEM'
    };
    return mapping[entityType] || 'SYSTEM';
  }

  private determineSeverity(action: string, entityType: string): string {
    // Critical actions
    if (action === 'DELETE' && ['User', 'Customer', 'Invoice'].includes(entityType)) {
      return 'CRITICAL';
    }
    if (action === 'LOGIN' && entityType === 'User') {
      return 'MEDIUM';
    }
    if (action === 'CREATE' && ['Payment', 'Invoice'].includes(entityType)) {
      return 'HIGH';
    }
    if (action === 'UPDATE' && ['User', 'Organization'].includes(entityType)) {
      return 'HIGH';
    }
    if (action === 'VIEW' && ['Customer', 'Payment'].includes(entityType)) {
      return 'LOW';
    }

    return 'MEDIUM';
  }

  private generateDescription(log: any): string {
    const user = log.user ? `${log.user.firstName} ${log.user.lastName}` : 'System';
    const action = log.action.toLowerCase();
    const entity = log.entityType.toLowerCase();

    switch (log.action) {
      case 'CREATE':
        return `${user} created ${entity} ${log.entityId}`;
      case 'UPDATE':
        return `${user} updated ${entity} ${log.entityId}`;
      case 'DELETE':
        return `${user} deleted ${entity} ${log.entityId}`;
      case 'VIEW':
        return `${user} viewed ${entity} ${log.entityId}`;
      case 'LOGIN':
        return `${user} logged in`;
      case 'LOGOUT':
        return `${user} logged out`;
      default:
        return `${user} performed ${action} on ${entity} ${log.entityId}`;
    }
  }

  private calculateRiskScore(log: any): number {
    let score = 0;

    // Base score by action
    const actionScores: Record<string, number> = {
      'DELETE': 80,
      'UPDATE': 40,
      'CREATE': 30,
      'VIEW': 10,
      'LOGIN': 20,
      'LOGOUT': 5
    };

    score += actionScores[log.action] || 20;

    // Entity type modifiers
    if (['User', 'Organization'].includes(log.entityType)) {
      score += 20;
    }
    if (['Payment', 'Invoice'].includes(log.entityType)) {
      score += 15;
    }

    // Failed actions increase risk
    if (log.changes?.error || log.changes?.success === false) {
      score += 30;
    }

    // Time-based factors (unusual hours)
    const hour = new Date(log.timestamp).getHours();
    if (hour < 6 || hour > 22) {
      score += 10;
    }

    return Math.min(score, 100);
  }

  private generateActivityTimeline(logs: any[], startDate: Date, endDate: Date): Array<{
    time: string;
    events: number;
    severity: string;
  }> {
    const timeline: Array<{ time: string; events: number; severity: string }> = [];
    const msPerHour = 60 * 60 * 1000;
    const hours = Math.ceil((endDate.getTime() - startDate.getTime()) / msPerHour);

    for (let i = 0; i < Math.min(hours, 24); i++) {
      const hourStart = new Date(startDate.getTime() + i * msPerHour);
      const hourEnd = new Date(hourStart.getTime() + msPerHour);

      const hourLogs = logs.filter(log => {
        const logTime = new Date(log.timestamp);
        return logTime >= hourStart && logTime < hourEnd;
      });

      const criticalCount = hourLogs.filter(log =>
        this.determineSeverity(log.action, log.entityType) === 'CRITICAL'
      ).length;

      timeline.push({
        time: hourStart.toISOString(),
        events: hourLogs.length,
        severity: criticalCount > 0 ? 'CRITICAL' : hourLogs.length > 10 ? 'HIGH' : 'LOW'
      });
    }

    return timeline;
  }

  async getUserActivity(req: Request, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
        return;
      }

      const { organizationId } = (req as any).user!;
      const { userId } = req.params;

      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;

      // Handle actions parameter (can be array or comma-separated string)
      let actions: string[] | undefined;
      if (req.query.actions) {
        actions = Array.isArray(req.query.actions)
          ? req.query.actions as string[]
          : (req.query.actions as string).split(',').map(a => a.trim());
      }

      const activity = await auditService.getUserActivity(userId, organizationId, {
        startDate,
        endDate,
        limit,
        actions
      });

      // Transform to match test expectations: { activities, total }
      res.json({
        activities: activity.map(a => ({
          ...a,
          resourceType: a.entityType,
          timestamp: a.timestamp // Keep as Date object for proper date comparison
        })),
        total: activity.length
      });
    } catch (error) {
      console.error('Error fetching user activity:', error);
      res.status(500).json({
        error: 'Failed to fetch user activity',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async getActiveSessions(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId } = (req as any).user!;

      const sessions = await auditService.getActiveSessions(organizationId);

      // Transform to match test expectations: { sessions, total }
      res.json({
        sessions: sessions.map(s => ({
          ...s,
          sessionToken: `session-${s.userId}-${Date.now()}`  // Generate mock session token
        })),
        total: sessions.length
      });
    } catch (error) {
      console.error('Error fetching active sessions:', error);
      res.status(500).json({
        error: 'Failed to fetch active sessions',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async getSuspiciousActivity(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId } = (req as any).user!;

      const severity = req.query.severity as 'low' | 'medium' | 'high' | 'critical' | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;

      const activities = await auditService.getSuspiciousActivity(organizationId, {
        severity,
        limit
      });

      // Calculate summary
      const summary = {
        totalSuspicious: activities.length,
        criticalCount: activities.filter(a => a.severity === 'critical').length,
        highCount: activities.filter(a => a.severity === 'high').length,
        mediumCount: activities.filter(a => a.severity === 'medium').length,
        lowCount: activities.filter(a => a.severity === 'low').length,
        severityBreakdown: {
          critical: activities.filter(a => a.severity === 'critical').length,
          high: activities.filter(a => a.severity === 'high').length,
          medium: activities.filter(a => a.severity === 'medium').length,
          low: activities.filter(a => a.severity === 'low').length
        }
      };

      // Transform to match test expectations: { activities, summary }
      res.json({
        activities,
        summary
      });
    } catch (error) {
      console.error('Error fetching suspicious activity:', error);
      res.status(500).json({
        error: 'Failed to fetch suspicious activity',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async getSecurityMetrics(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId } = (req as any).user!;

      const metrics = await auditService.getSecurityMetrics(organizationId);

      // Transform to match test expectations: { overview, trends, alerts }
      res.json({
        overview: {
          totalLogins: metrics.totalEvents,
          failedLogins: metrics.failedLogins,
          activeUsers: metrics.activeUsers,
          suspiciousActivities: metrics.criticalAlerts
        },
        trends: [], // TODO: Implement trends
        alerts: metrics.criticalAlerts > 0 ? [{
          severity: 'critical',
          message: `${metrics.criticalAlerts} critical security alert(s) detected`,
          timestamp: new Date().toISOString()
        }] : []
      });
    } catch (error) {
      console.error('Error fetching security metrics:', error);
      res.status(500).json({
        error: 'Failed to fetch security metrics',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // New method for user activity summary
  async getUserActivitySummary(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId } = (req as any).user!;
      const { userId } = req.params;

      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : new Date();

      const activity = await auditService.getUserActivity(userId, organizationId, {
        startDate,
        endDate
      });

      // Calculate breakdowns
      const actionBreakdown: Record<string, number> = {};
      const resourceBreakdown: Record<string, number> = {};

      activity.forEach(a => {
        actionBreakdown[a.action] = (actionBreakdown[a.action] || 0) + 1;
        resourceBreakdown[a.entityType] = (resourceBreakdown[a.entityType] || 0) + 1;
      });

      res.json({
        totalActivities: activity.length,
        actionBreakdown,
        resourceBreakdown,
        timeRange: {
          start: startDate.toISOString(),
          end: endDate.toISOString()
        }
      });
    } catch (error) {
      console.error('Error fetching user activity summary:', error);
      res.status(500).json({
        error: 'Failed to fetch user activity summary',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
  /**
   * Get activity summary for the current authenticated user
   */
  async getCurrentUserActivitySummary(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId } = (req as any).user!;
      const userId = (req as any).user!.id;

      // Parse period parameter to determine date range
      const period = req.query.period as string || '24h';
      let startDate: Date;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : new Date();

      // Calculate start date based on period
      switch (period) {
        case '1h':
          startDate = new Date(Date.now() - 60 * 60 * 1000);
          break;
        case '24h':
          startDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
          break;
        case '7d':
          startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
          break;
        default:
          startDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
      }

      // Override with query parameters if provided
      if (req.query.startDate) {
        startDate = new Date(req.query.startDate as string);
      }

      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;

      const activity = await auditService.getUserActivity(userId, organizationId, {
        startDate,
        endDate,
        limit
      });

      // Calculate breakdowns
      const actionBreakdown: Record<string, number> = {};
      const resourceBreakdown: Record<string, number> = {};

      activity.forEach(a => {
        actionBreakdown[a.action] = (actionBreakdown[a.action] || 0) + 1;
        resourceBreakdown[a.entityType] = (resourceBreakdown[a.entityType] || 0) + 1;
      });

      res.json({
        totalActivities: activity.length,
        actionBreakdown,
        resourceBreakdown,
        timeRange: {
          start: startDate.toISOString(),
          end: endDate.toISOString()
        },
        activities: activity.map(a => ({
          ...a,
          resourceType: a.entityType
        })),
        total: activity.length
      });
    } catch (error) {
      console.error('Error fetching current user activity summary:', error);
      res.status(500).json({
        error: 'Failed to fetch current user activity summary',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }


  // New method for session revocation
  async revokeSession(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId } = (req as any).user!;
      const { sessionId } = req.params;

      // Revoke the session
      await prisma.session.update({
        where: { id: sessionId },
        data: {
          expiresAt: new Date(Date.now() - 1000) // Set to past to invalidate
        }
      });

      res.json({
        message: `Session ${sessionId} has been successfully revoked`
      });
    } catch (error) {
      console.error('Error revoking session:', error);
      res.status(500).json({
        error: 'Failed to revoke session',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // New method for revoking all user sessions
  async revokeAllUserSessions(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId } = (req as any).user!;
      const { userId } = req.params;

      // Revoke all sessions for the user
      const result = await prisma.session.updateMany({
        where: { userId },
        data: {
          expiresAt: new Date(Date.now() - 1000) // Set to past to invalidate
        }
      });

      res.json({
        message: `All sessions for user ${userId} have been successfully revoked`,
        revokedCount: result.count
      });
    } catch (error) {
      console.error('Error revoking user sessions:', error);
      res.status(500).json({
        error: 'Failed to revoke user sessions',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // New method for suspicious activity patterns
  async getSuspiciousActivityPatterns(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId } = (req as any).user!;

      const activities = await auditService.getSuspiciousActivity(organizationId);

      // Analyze patterns
      const failedLogins = activities.filter(a => a.type === 'failed_logins').length;
      const unusualAccess = activities.filter(a => a.type === 'unusual_access' || a.type === 'unusual_location').length;
      const dataExfiltration = activities.filter(a => a.type === 'bulk_export' || a.type === 'mass_deletion').length;

      // Analyze IP anomalies
      const ipAddresses = new Map<string, number>();
      activities.forEach(a => {
        if (a.ipAddress) {
          ipAddresses.set(a.ipAddress, (ipAddresses.get(a.ipAddress) || 0) + 1);
        }
      });
      const ipAnomalies = Array.from(ipAddresses.entries())
        .filter(([_, count]) => count > 3)
        .map(([ip, count]) => ({ ipAddress: ip, frequency: count }));

      const riskScore = Math.min(
        (failedLogins * 10) + (unusualAccess * 20) + (dataExfiltration * 30) + (ipAnomalies.length * 5),
        100
      );

      res.json({
        patterns: {
          failedLogins,
          unusualAccess,
          dataExfiltration,
          privilegeEscalation: 0,
          ipAnomalies
        },
        riskScore,
        recommendations: [
          failedLogins > 5 ? 'Enable account lockout after multiple failed login attempts' : null,
          unusualAccess > 3 ? 'Review and restrict IP whitelist' : null,
          dataExfiltration > 0 ? 'Implement data loss prevention controls' : null,
          ipAnomalies.length > 0 ? 'Investigate unusual IP address patterns' : null
        ].filter(Boolean)
      });
    } catch (error) {
      console.error('Error fetching suspicious activity patterns:', error);
      res.status(500).json({
        error: 'Failed to fetch suspicious activity patterns',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // New method for login security metrics
  async getLoginSecurityMetrics(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId } = (req as any).user!;
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : new Date();

      const loginLogs = await prisma.auditLog.findMany({
        where: {
          organizationId,
          action: 'LOGIN',
          timestamp: { gte: startDate, lte: endDate }
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true
            }
          }
        }
      });

      const metrics = loginLogs.map(log => ({
        timestamp: log.timestamp,
        userId: log.userId,
        userName: log.user ? `${log.user.firstName} ${log.user.lastName}` : 'Unknown',
        ipAddress: log.ipAddress,
        success: !log.changes?.includes('failed'),
        location: 'Unknown' // TODO: Add GeoIP lookup
      }));

      const successfulLogins = metrics.filter(m => m.success).length;
      const totalLogins = loginLogs.length;

      const summary = {
        totalLogins,
        successfulLogins,
        failedLogins: metrics.filter(m => !m.success).length,
        uniqueUsers: new Set(metrics.map(m => m.userId)).size,
        successRate: totalLogins > 0 ? (successfulLogins / totalLogins * 100).toFixed(2) : '0'
      };

      res.json({
        metrics,
        summary
      });
    } catch (error) {
      console.error('Error fetching login security metrics:', error);
      res.status(500).json({
        error: 'Failed to fetch login security metrics',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // New method for access control metrics
  async getAccessControlMetrics(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId } = (req as any).user!;
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : new Date();

      const accessLogs = await prisma.auditLog.findMany({
        where: {
          organizationId,
          timestamp: { gte: startDate, lte: endDate }
        }
      });

      const resourceAccess: Record<string, number> = {};
      const permissionDenials: number = 0; // TODO: Track denials separately
      const roleUsage: Record<string, number> = {};
      const sensitiveOperations = accessLogs.filter(log =>
        ['DELETE', 'EXPORT'].includes(log.action)
      );

      accessLogs.forEach(log => {
        resourceAccess[log.entityType] = (resourceAccess[log.entityType] || 0) + 1;
      });

      res.json({
        resourceAccess,
        permissionDenials,
        roleUsage,
        sensitiveOperations: sensitiveOperations.map(log => ({
          action: log.action,
          resource: log.entityType,
          timestamp: log.timestamp,
          userId: log.userId
        }))
      });
    } catch (error) {
      console.error('Error fetching access control metrics:', error);
      res.status(500).json({
        error: 'Failed to fetch access control metrics',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // New method for compliance metrics
  async getComplianceMetrics(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId } = (req as any).user!;

      const metrics = await auditService.getComplianceMetrics(organizationId);

      res.json(metrics);
    } catch (error) {
      console.error('Error fetching compliance metrics:', error);
      res.status(500).json({
        error: 'Failed to fetch compliance metrics',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // New method for audit stream configuration
  async getAuditStreamConfig(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId } = (req as any).user!;

      const config = await auditService.getAuditStreamConfig(organizationId);

      res.json(config);
    } catch (error) {
      console.error('Error fetching audit stream config:', error);
      res.status(500).json({
        error: 'Failed to fetch audit stream config',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // New method for updating audit stream configuration
  async updateAuditStreamConfig(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId } = (req as any).user!;
      const config = req.body;

      const result = await auditService.updateAuditStreamConfig(organizationId, config);

      res.json(result);
    } catch (error) {
      console.error('Error updating audit stream config:', error);
      res.status(500).json({
        error: 'Failed to update audit stream config',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}

export const auditController = new AuditController();