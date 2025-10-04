/**
 * System Analytics Controller
 * Handles system-wide analytics endpoints for SUPER_ADMIN
 * Phase 4: System Analytics from Admin Panel Implementation Roadmap
 */

import { Request, Response } from 'express';
import {
  systemAnalyticsService,
  AnalyticsDateRange,
  ExportFormat,
} from '../services/system-analytics.service';

/**
 * @openapi
 * /admin/analytics:
 *   get:
 *     summary: Get system-wide analytics
 *     description: Retrieve comprehensive system-wide analytics and metrics. Requires SUPER_ADMIN permission. Results are cached for 1 hour for performance.
 *     tags:
 *       - Admin Analytics
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Analytics period start date (defaults to 30 days ago)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Analytics period end date (defaults to now)
 *     responses:
 *       200:
 *         description: System-wide analytics data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalOrganizations:
 *                   type: number
 *                   description: Total number of organizations
 *                 activeOrganizations:
 *                   type: number
 *                   description: Number of active organizations
 *                 suspendedOrganizations:
 *                   type: number
 *                   description: Number of suspended organizations
 *                 newOrganizationsThisMonth:
 *                   type: number
 *                   description: Organizations created this month
 *                 totalUsers:
 *                   type: number
 *                   description: Total number of users
 *                 activeUsersToday:
 *                   type: number
 *                   description: Users active in last 24 hours
 *                 activeUsersThisWeek:
 *                   type: number
 *                   description: Users active in last 7 days
 *                 activeUsersThisMonth:
 *                   type: number
 *                   description: Users active in last 30 days
 *                 usersByRole:
 *                   type: object
 *                   additionalProperties:
 *                     type: number
 *                   description: Count of users by role
 *                 totalRevenue:
 *                   type: number
 *                   description: Total revenue from all completed payments
 *                 monthlyRecurringRevenue:
 *                   type: number
 *                   description: Revenue from last 30 days
 *                 averageRevenuePerOrganization:
 *                   type: number
 *                   description: MRR divided by active organizations
 *                 activeSubscriptions:
 *                   type: number
 *                   description: Number of active subscriptions
 *                 subscriptionsByPlan:
 *                   type: object
 *                   additionalProperties:
 *                     type: number
 *                   description: Count of subscriptions by plan
 *                 churnRate:
 *                   type: number
 *                   description: Subscription churn rate percentage
 *                 apiCalls:
 *                   type: number
 *                   description: API calls in last 24 hours
 *                 storageUsed:
 *                   type: number
 *                   description: Total storage used in bytes
 *                 bandwidthUsed:
 *                   type: number
 *                   description: Bandwidth used in bytes
 *                 averageResponseTime:
 *                   type: number
 *                   description: Average response time in milliseconds
 *                 errorRate:
 *                   type: number
 *                   description: Error rate percentage
 *                 uptimePercentage:
 *                   type: number
 *                   description: Uptime percentage for last 30 days
 *                 periodStart:
 *                   type: string
 *                   format: date-time
 *                   description: Analytics period start
 *                 periodEnd:
 *                   type: string
 *                   format: date-time
 *                   description: Analytics period end
 *       401:
 *         description: Unauthorized - Authentication required
 *       403:
 *         description: Forbidden - SUPER_ADMIN permission required
 *       500:
 *         description: Internal server error
 */
export async function getSystemAnalytics(req: Request, res: Response): Promise<void> {
  try {
    const dateRange: AnalyticsDateRange = {
      startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
      endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
    };

    const analytics = await systemAnalyticsService.getSystemAnalytics(dateRange);
    res.json(analytics);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch system analytics',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * @openapi
 * /admin/analytics/export:
 *   post:
 *     summary: Export analytics report
 *     description: Export system-wide analytics in PDF, Excel, or CSV format. Requires SUPER_ADMIN permission.
 *     tags:
 *       - Admin Analytics
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - format
 *             properties:
 *               format:
 *                 type: string
 *                 enum: [PDF, EXCEL, CSV]
 *                 description: Export format
 *               startDate:
 *                 type: string
 *                 format: date-time
 *                 description: Analytics period start date
 *               endDate:
 *                 type: string
 *                 format: date-time
 *                 description: Analytics period end date
 *     responses:
 *       200:
 *         description: Analytics export data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 format:
 *                   type: string
 *                   enum: [PDF, EXCEL, CSV]
 *                   description: Export format
 *                 data:
 *                   type: object
 *                   description: Analytics data (same structure as GET /admin/analytics)
 *                 generatedAt:
 *                   type: string
 *                   format: date-time
 *                   description: Export generation timestamp
 *       400:
 *         description: Bad request - Invalid format
 *       401:
 *         description: Unauthorized - Authentication required
 *       403:
 *         description: Forbidden - SUPER_ADMIN permission required
 *       500:
 *         description: Internal server error
 */
export async function exportAnalytics(req: Request, res: Response): Promise<void> {
  try {
    const { format, startDate, endDate } = req.body;

    // Validate format
    const validFormats: ExportFormat[] = ['PDF', 'EXCEL', 'CSV'];
    if (!format || !validFormats.includes(format)) {
      res.status(400).json({
        error: 'Invalid export format',
        message: 'Format must be one of: PDF, EXCEL, CSV',
      });
      return;
    }

    const dateRange: AnalyticsDateRange = {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    };

    const exportData = await systemAnalyticsService.exportAnalytics(format, dateRange);

    // TODO: When implementing actual file export, set appropriate headers:
    // res.setHeader('Content-Type', 'application/pdf' | 'application/vnd.ms-excel' | 'text/csv');
    // res.setHeader('Content-Disposition', `attachment; filename="analytics-${Date.now()}.${format.toLowerCase()}"`);

    res.json(exportData);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to export analytics',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
