import { Request, Response } from 'express';
import { query, param, validationResult } from 'express-validator';
import { auditService } from '../services/audit.service';
import { AuditAction } from '../types/enums';

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
    this.getUserActivity = this.getUserActivity.bind(this);
    this.getActiveSessions = this.getActiveSessions.bind(this);
    this.getSuspiciousActivity = this.getSuspiciousActivity.bind(this);
    this.getSecurityMetrics = this.getSecurityMetrics.bind(this);
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

      const activity = await auditService.getUserActivity(userId, organizationId, {
        startDate,
        endDate,
        limit
      });

      res.json({
        success: true,
        data: activity
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

      res.json({
        success: true,
        data: sessions
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

      res.json({
        success: true,
        data: activities
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

      res.json({
        success: true,
        data: metrics
      });
    } catch (error) {
      console.error('Error fetching security metrics:', error);
      res.status(500).json({
        error: 'Failed to fetch security metrics',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}

export const auditController = new AuditController();