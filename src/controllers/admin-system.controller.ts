/**
 * Admin System Controller
 * Handles system logs and health monitoring endpoints for admin panel
 */

import { Request, Response } from 'express';
import { systemLogsService, SystemLogFilters } from '../services/system-logs.service';
import { systemHealthService } from '../services/system-health.service';

/**
 * @openapi
 * /admin/system/logs:
 *   get:
 *     summary: Get system logs with filters
 *     description: Retrieve paginated system logs for monitoring. Requires SUPER_ADMIN permission.
 *     tags:
 *       - Admin System
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: level
 *         schema:
 *           type: string
 *           enum: [DEBUG, INFO, WARN, ERROR]
 *         description: Filter by log level
 *       - in: query
 *         name: source
 *         schema:
 *           type: string
 *         description: Filter by source/service name
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter logs from this date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter logs until this date
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search in log messages
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Logs per page
 *     responses:
 *       200:
 *         description: Paginated system logs
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - SUPER_ADMIN required
 */
export async function getSystemLogs(req: Request, res: Response): Promise<void> {
  try {
    const filters: SystemLogFilters = {
      level: req.query.level as SystemLogFilters['level'],
      source: req.query.source as string,
      startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
      endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
      search: req.query.search as string,
      page: req.query.page ? parseInt(req.query.page as string, 10) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
    };

    const result = await systemLogsService.getLogs(filters);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch system logs',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * @openapi
 * /admin/system/logs/sources:
 *   get:
 *     summary: Get unique log sources
 *     description: Retrieve list of unique log sources for filtering. Requires SUPER_ADMIN permission.
 *     tags:
 *       - Admin System
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of log sources
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - SUPER_ADMIN required
 */
export async function getLogSources(req: Request, res: Response): Promise<void> {
  try {
    const sources = await systemLogsService.getLogSources();
    res.json({ sources });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch log sources',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * @openapi
 * /admin/system/logs/stats:
 *   get:
 *     summary: Get log statistics
 *     description: Retrieve log statistics and aggregations. Requires SUPER_ADMIN permission.
 *     tags:
 *       - Admin System
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Log statistics
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - SUPER_ADMIN required
 */
export async function getLogStats(req: Request, res: Response): Promise<void> {
  try {
    const stats = await systemLogsService.getLogStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch log statistics',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * @openapi
 * /admin/system/logs:
 *   delete:
 *     summary: Delete old system logs
 *     description: Delete logs older than specified days. Requires SUPER_ADMIN permission.
 *     tags:
 *       - Admin System
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: daysToKeep
 *         schema:
 *           type: integer
 *           default: 90
 *         description: Number of days of logs to retain
 *     responses:
 *       200:
 *         description: Logs deleted successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - SUPER_ADMIN required
 */
export async function deleteOldLogs(req: Request, res: Response): Promise<void> {
  try {
    const daysToKeep = req.query.daysToKeep ? parseInt(req.query.daysToKeep as string, 10) : 90;
    const deletedCount = await systemLogsService.cleanupOldLogs(daysToKeep);

    res.json({
      message: `Successfully deleted ${deletedCount} old log entries`,
      deletedCount,
      daysToKeep,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to delete logs',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * @openapi
 * /admin/system/health:
 *   get:
 *     summary: Get comprehensive system health
 *     description: Retrieve detailed system health status including CPU, memory, disk, and service health. Requires SUPER_ADMIN permission.
 *     tags:
 *       - Admin System
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: System health status
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - SUPER_ADMIN required
 */
export async function getSystemHealth(req: Request, res: Response): Promise<void> {
  try {
    const health = await systemHealthService.getSystemHealth();
    res.json(health);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch system health',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
