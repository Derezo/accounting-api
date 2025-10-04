import { Router } from 'express';
import {
  auditController,
  validateGetAuditLogs,
  validateGetSecuritySummary,
  validateExportAuditLogs
} from '../controllers/audit.controller';
import { validateUserParam } from '../controllers/user.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { auditView, auditExport } from '../middleware/audit.middleware';
import { UserRole } from '../types/enums';

const router = Router();

// Apply authentication to all routes
router.use(authenticate);

/**
 * @swagger
 * /audit/logs:
 *   get:
 *     tags: [Audit]
 *     summary: Get audit logs
 *     description: Retrieve paginated audit logs with filtering options. Requires Admin+ role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Start date for filtering logs (ISO 8601)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: End date for filtering logs (ISO 8601)
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [AUTH, DATA, SYSTEM, SECURITY, FINANCIAL]
 *         description: Filter by event category
 *       - in: query
 *         name: severity
 *         schema:
 *           type: string
 *           enum: [LOW, MEDIUM, HIGH, CRITICAL]
 *         description: Filter by severity level
 *       - in: query
 *         name: success
 *         schema:
 *           type: boolean
 *         description: Filter by success status
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *           maxLength: 100
 *         description: Search in descriptions and resources
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         description: Filter by user ID
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *           enum: [CREATE, UPDATE, DELETE, VIEW, LOGIN, LOGOUT, EXPORT, IMPORT, REFUND, AUTHORIZE]
 *         description: Filter by action type
 *       - in: query
 *         name: resource
 *         schema:
 *           type: string
 *         description: Filter by resource/entity type
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 1000
 *           default: 100
 *         description: Number of items per page
 *     responses:
 *       200:
 *         description: Audit logs retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                   timestamp:
 *                     type: string
 *                     format: date-time
 *                   userId:
 *                     type: string
 *                   userName:
 *                     type: string
 *                   userRole:
 *                     type: string
 *                   action:
 *                     type: string
 *                   category:
 *                     type: string
 *                     enum: [AUTH, DATA, SYSTEM, SECURITY, FINANCIAL]
 *                   severity:
 *                     type: string
 *                     enum: [LOW, MEDIUM, HIGH, CRITICAL]
 *                   resource:
 *                     type: string
 *                   description:
 *                     type: string
 *                   ipAddress:
 *                     type: string
 *                   userAgent:
 *                     type: string
 *                   success:
 *                     type: boolean
 *                   details:
 *                     type: object
 *                   riskScore:
 *                     type: number
 *                     minimum: 0
 *                     maximum: 100
 *       400:
 *         description: Validation error
 *       403:
 *         description: Insufficient permissions
 */
router.get(
  '/logs',
  authorize([UserRole.SUPER_ADMIN, UserRole.ADMIN]),
  validateGetAuditLogs,
  auditView('AUDIT'),
  auditController.getAuditLogs
);

/**
 * @swagger
 * /audit/security-summary:
 *   get:
 *     tags: [Audit]
 *     summary: Get security summary
 *     description: Get security metrics and analytics for a given time period. Requires Admin+ role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Start date for the summary period (ISO 8601)
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date-time
 *         description: End date for the summary period (ISO 8601)
 *     responses:
 *       200:
 *         description: Security summary retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalEvents:
 *                   type: number
 *                   description: Total number of audit events
 *                 criticalEvents:
 *                   type: number
 *                   description: Number of critical severity events
 *                 failedLogins:
 *                   type: number
 *                   description: Number of failed login attempts
 *                 dataAccess:
 *                   type: number
 *                   description: Number of data access events
 *                 recentActivity:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       time:
 *                         type: string
 *                         format: date-time
 *                       events:
 *                         type: number
 *                       severity:
 *                         type: string
 *                         enum: [LOW, MEDIUM, HIGH, CRITICAL]
 *       400:
 *         description: Validation error
 *       403:
 *         description: Insufficient permissions
 */
router.get(
  '/security-summary',
  authorize([UserRole.SUPER_ADMIN, UserRole.ADMIN]),
  validateGetSecuritySummary,
  auditView('AUDIT'),
  auditController.getSecuritySummary
);

/**
 * @swagger
 * /audit/export:
 *   get:
 *     tags: [Audit]
 *     summary: Export audit logs
 *     description: Export audit logs in various formats (JSON, CSV, PDF). Requires Admin+ role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Start date for export (ISO 8601)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: End date for export (ISO 8601)
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [json, csv, pdf]
 *           default: json
 *         description: Export format
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         description: Filter by user ID
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *           enum: [CREATE, UPDATE, DELETE, VIEW, LOGIN, LOGOUT, EXPORT, IMPORT, REFUND, AUTHORIZE]
 *         description: Filter by action type
 *       - in: query
 *         name: resource
 *         schema:
 *           type: string
 *         description: Filter by resource/entity type
 *     responses:
 *       200:
 *         description: Audit logs exported successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: string
 *           text/csv:
 *             schema:
 *               type: string
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: Validation error
 *       403:
 *         description: Insufficient permissions
 */
router.get(
  '/export',
  authorize([UserRole.SUPER_ADMIN, UserRole.ADMIN]),
  validateExportAuditLogs,
  auditExport('AUDIT'),
  auditController.exportAuditLogs
);

/**
 * @swagger
 * /audit/export/csv:
 *   get:
 *     tags: [Audit]
 *     summary: Export audit logs as CSV
 *     description: Export audit logs in CSV format. Requires Admin+ role.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: CSV export successful
 *       403:
 *         description: Insufficient permissions
 */
router.get(
  '/export/csv',
  authorize([UserRole.SUPER_ADMIN, UserRole.ADMIN]),
  auditExport('AUDIT'),
  auditController.exportAuditLogsCSV
);

/**
 * @swagger
 * /audit/export/json:
 *   get:
 *     tags: [Audit]
 *     summary: Export audit logs as JSON
 *     description: Export audit logs in JSON format. Requires Admin+ role.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: JSON export successful
 *       403:
 *         description: Insufficient permissions
 */
router.get(
  '/export/json',
  authorize([UserRole.SUPER_ADMIN, UserRole.ADMIN]),
  auditExport('AUDIT'),
  auditController.exportAuditLogsJSON
);

/**
 * @swagger
 * /audit/entity/{entityType}/{entityId}/history:
 *   get:
 *     tags: [Audit]
 *     summary: Get entity history
 *     description: Get the complete audit history for a specific entity. Requires Manager+ role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: entityType
 *         required: true
 *         schema:
 *           type: string
 *         description: Type of entity (e.g., Customer, Invoice, Payment)
 *       - in: path
 *         name: entityId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the entity
 *     responses:
 *       200:
 *         description: Entity history retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       timestamp:
 *                         type: string
 *                         format: date-time
 *                       userName:
 *                         type: string
 *                       action:
 *                         type: string
 *                       changes:
 *                         type: object
 *                       ipAddress:
 *                         type: string
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Entity not found
 */
router.get(
  '/entity/:entityType/:entityId/history',
  authorize([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER]),
  auditView('AUDIT'),
  auditController.getEntityHistory
);

/**
 * @swagger
 * /audit/users/current/activity/summary:
 *   get:
 *     tags: [Audit]
 *     summary: Get current user's activity summary
 *     description: Get comprehensive activity summary for the current authenticated user. Requires Admin+ role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [1h, 24h, 7d, 30d]
 *           default: 24h
 *         description: Time period for activity summary
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Start date for activity summary
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: End date for activity summary
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 1000
 *           default: 100
 *         description: Maximum number of activities to return
 *     responses:
 *       200:
 *         description: User activity summary retrieved successfully
 *       403:
 *         description: Insufficient permissions
 */
router.get(
  '/users/current/activity/summary',
  authorize([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER]),
  auditView('AUDIT'),
  auditController.getCurrentUserActivitySummary
);

/**
 * @swagger
 * /audit/users/{userId}/activity:
 *   get:
 *     tags: [Audit]
 *     summary: Get user activity timeline
 *     description: Get comprehensive activity timeline for a specific user. Requires Admin+ role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Start date for activity timeline
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: End date for activity timeline
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 1000
 *           default: 100
 *         description: Maximum number of activities to return
 *     responses:
 *       200:
 *         description: User activity retrieved successfully
 *       403:
 *         description: Insufficient permissions
 */
router.get(
  '/users/:userId/activity',
  authorize([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER]),
  validateUserParam,
  auditView('AUDIT'),
  auditController.getUserActivity
);

/**
 * @swagger
 * /audit/users/{userId}/activity/summary:
 *   get:
 *     tags: [Audit]
 *     summary: Get user activity summary
 *     description: Get summary statistics for user activity. Requires Admin+ role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *     responses:
 *       200:
 *         description: User activity summary retrieved successfully
 *       403:
 *         description: Insufficient permissions
 */
router.get(
  '/users/:userId/activity/summary',
  authorize([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER]),
  validateUserParam,
  auditView('AUDIT'),
  auditController.getUserActivitySummary
);

/**
 * @swagger
 * /audit/sessions/{sessionId}/revoke:
 *   post:
 *     tags: [Audit]
 *     summary: Revoke a specific session
 *     description: Revoke a user session by ID. Requires Admin+ role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Session revoked successfully
 *       403:
 *         description: Insufficient permissions
 */
router.post(
  '/sessions/:sessionId/revoke',
  authorize([UserRole.SUPER_ADMIN, UserRole.ADMIN]),
  auditView('AUDIT'),
  auditController.revokeSession
);

/**
 * @swagger
 * /audit/users/{userId}/sessions/revoke-all:
 *   post:
 *     tags: [Audit]
 *     summary: Revoke all sessions for a user
 *     description: Revoke all active sessions for a specific user. Requires Admin+ role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: All user sessions revoked successfully
 *       403:
 *         description: Insufficient permissions
 */
router.post(
  '/sessions/revoke-all/:userId',
  authorize([UserRole.SUPER_ADMIN, UserRole.ADMIN]),
  validateUserParam,
  auditView('AUDIT'),
  auditController.revokeAllUserSessions
);

/**
 * @swagger
 * /audit/sessions:
 *   get:
 *     tags: [Audit]
 *     summary: Get active user sessions
 *     description: Get list of currently active user sessions with risk analysis. Requires Admin+ role.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Active sessions retrieved successfully
 *       403:
 *         description: Insufficient permissions
 */
router.get(
  '/sessions',
  authorize([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER]),
  auditView('AUDIT'),
  auditController.getActiveSessions
);

/**
 * @swagger
 * /audit/suspicious-activity:
 *   get:
 *     tags: [Audit]
 *     summary: Get suspicious activity alerts
 *     description: Get detected suspicious activities and security alerts. Requires Admin+ role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: severity
 *         schema:
 *           type: string
 *           enum: [low, medium, high, critical]
 *         description: Filter by severity level
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 50
 *         description: Maximum number of activities to return
 *     responses:
 *       200:
 *         description: Suspicious activities retrieved successfully
 *       403:
 *         description: Insufficient permissions
 */
router.get(
  '/suspicious-activity',
  authorize([UserRole.SUPER_ADMIN, UserRole.ADMIN]),
  auditView('AUDIT'),
  auditController.getSuspiciousActivity
);

/**
 * @swagger
 * /audit/suspicious-activity/patterns:
 *   get:
 *     tags: [Audit]
 *     summary: Get suspicious activity patterns
 *     description: Analyze patterns in suspicious activities. Requires Admin+ role.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Suspicious activity patterns retrieved successfully
 *       403:
 *         description: Insufficient permissions
 */
router.get(
  '/suspicious-activity/patterns',
  authorize([UserRole.SUPER_ADMIN, UserRole.ADMIN]),
  auditView('AUDIT'),
  auditController.getSuspiciousActivityPatterns
);

/**
 * @swagger
 * /audit/security-metrics:
 *   get:
 *     tags: [Audit]
 *     summary: Get security metrics dashboard
 *     description: Get real-time security metrics and compliance status. Requires Admin+ role.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Security metrics retrieved successfully
 *       403:
 *         description: Insufficient permissions
 */
router.get(
  '/security-metrics',
  authorize([UserRole.SUPER_ADMIN, UserRole.ADMIN]),
  auditView('AUDIT'),
  auditController.getSecurityMetrics
);

/**
 * @swagger
 * /audit/security-metrics/login:
 *   get:
 *     tags: [Audit]
 *     summary: Get login security metrics
 *     description: Get detailed login metrics and statistics. Requires Admin+ role.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Login metrics retrieved successfully
 *       403:
 *         description: Insufficient permissions
 */
router.get(
  '/security-metrics/logins',
  authorize([UserRole.SUPER_ADMIN, UserRole.ADMIN]),
  auditView('AUDIT'),
  auditController.getLoginSecurityMetrics
);

/**
 * @swagger
 * /audit/security-metrics/access-control:
 *   get:
 *     tags: [Audit]
 *     summary: Get access control metrics
 *     description: Get access control and permission metrics. Requires Admin+ role.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Access control metrics retrieved successfully
 *       403:
 *         description: Insufficient permissions
 */
router.get(
  '/security-metrics/access-control',
  authorize([UserRole.SUPER_ADMIN, UserRole.ADMIN]),
  auditView('AUDIT'),
  auditController.getAccessControlMetrics
);

/**
 * @swagger
 * /audit/security-metrics/compliance:
 *   get:
 *     tags: [Audit]
 *     summary: Get compliance metrics
 *     description: Get compliance and data protection metrics. Requires Admin+ role.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Compliance metrics retrieved successfully
 *       403:
 *         description: Insufficient permissions
 */
router.get(
  '/security-metrics/compliance',
  authorize([UserRole.SUPER_ADMIN, UserRole.ADMIN]),
  auditView('AUDIT'),
  auditController.getComplianceMetrics
);

/**
 * @swagger
 * /audit/audit-stream:
 *   get:
 *     tags: [Audit]
 *     summary: Get audit stream configuration
 *     description: Get real-time audit stream configuration. Requires Admin+ role.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Audit stream configuration retrieved successfully
 *       403:
 *         description: Insufficient permissions
 */
router.get(
  '/stream/config',
  authorize([UserRole.SUPER_ADMIN, UserRole.ADMIN]),
  auditView('AUDIT'),
  auditController.getAuditStreamConfig
);

/**
 * @swagger
 * /audit/stream/config:
 *   put:
 *     tags: [Audit]
 *     summary: Update audit stream configuration
 *     description: Update real-time audit stream configuration. Requires Admin+ role.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Audit stream configuration updated successfully
 *       403:
 *         description: Insufficient permissions
 */
router.put(
  '/stream/config',
  authorize([UserRole.SUPER_ADMIN, UserRole.ADMIN]),
  auditView('AUDIT'),
  auditController.updateAuditStreamConfig
);

export default router;
