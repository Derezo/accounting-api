import { Request, Response } from 'express';
import maintenanceWindowService from '@/services/maintenance-window.service';
import { validationResult } from 'express-validator';

/**
 * @swagger
 * components:
 *   schemas:
 *     MaintenanceTask:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           description: Task ID
 *         description:
 *           type: string
 *           description: Task description
 *         status:
 *           type: string
 *           enum: [PENDING, IN_PROGRESS, COMPLETED, FAILED]
 *           description: Task status
 *         assignedTo:
 *           type: string
 *           description: User ID assigned to task
 *         completedAt:
 *           type: string
 *           format: date-time
 *           description: Completion timestamp
 *
 *     MaintenanceWindow:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           description: Maintenance window ID
 *         title:
 *           type: string
 *           description: Maintenance window title
 *         description:
 *           type: string
 *           description: Detailed description
 *         status:
 *           type: string
 *           enum: [PLANNED, IN_PROGRESS, COMPLETED, CANCELLED]
 *           description: Current status
 *         scheduledStart:
 *           type: string
 *           format: date-time
 *           description: Scheduled start time
 *         scheduledEnd:
 *           type: string
 *           format: date-time
 *           description: Scheduled end time
 *         actualStart:
 *           type: string
 *           format: date-time
 *           description: Actual start time
 *         actualEnd:
 *           type: string
 *           format: date-time
 *           description: Actual end time
 *         duration:
 *           type: integer
 *           description: Estimated duration in minutes
 *         impact:
 *           type: string
 *           enum: [LOW, MEDIUM, HIGH, CRITICAL]
 *           description: Impact level
 *         affectedServices:
 *           type: array
 *           items:
 *             type: string
 *           description: List of affected services
 *         notifyUsers:
 *           type: boolean
 *           description: Whether to notify users
 *         tasks:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/MaintenanceTask'
 *           description: List of maintenance tasks
 *         notes:
 *           type: string
 *           description: Additional notes
 *         completionNotes:
 *           type: string
 *           description: Completion or cancellation notes
 *         createdBy:
 *           type: string
 *           description: User ID who created the window
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: Creation timestamp
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           description: Last update timestamp
 *
 *     CreateMaintenanceWindowRequest:
 *       type: object
 *       required:
 *         - title
 *         - description
 *         - scheduledStart
 *         - scheduledEnd
 *         - impact
 *         - affectedServices
 *         - notifyUsers
 *         - tasks
 *       properties:
 *         title:
 *           type: string
 *           description: Maintenance window title
 *         description:
 *           type: string
 *           description: Detailed description
 *         scheduledStart:
 *           type: string
 *           format: date-time
 *           description: Scheduled start time (ISO 8601)
 *         scheduledEnd:
 *           type: string
 *           format: date-time
 *           description: Scheduled end time (ISO 8601)
 *         impact:
 *           type: string
 *           enum: [LOW, MEDIUM, HIGH, CRITICAL]
 *           description: Impact level
 *         affectedServices:
 *           type: array
 *           items:
 *             type: string
 *           description: List of affected services
 *         notifyUsers:
 *           type: boolean
 *           description: Whether to notify users
 *         tasks:
 *           type: array
 *           items:
 *             type: object
 *             required:
 *               - description
 *             properties:
 *               description:
 *                 type: string
 *               assignedTo:
 *                 type: string
 *           description: List of tasks to perform
 *         notes:
 *           type: string
 *           description: Additional notes
 */

/**
 * Controller for maintenance window operations
 */
class MaintenanceWindowController {
  /**
   * @swagger
   * /admin/maintenance-windows:
   *   get:
   *     summary: List all maintenance windows
   *     description: Retrieve a list of all maintenance windows with optional filtering
   *     tags: [Admin - Maintenance Windows]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: status
   *         schema:
   *           type: string
   *           enum: [PLANNED, IN_PROGRESS, COMPLETED, CANCELLED]
   *         description: Filter by status
   *       - in: query
   *         name: startDate
   *         schema:
   *           type: string
   *           format: date-time
   *         description: Filter by scheduled start date (>=)
   *       - in: query
   *         name: endDate
   *         schema:
   *           type: string
   *           format: date-time
   *         description: Filter by scheduled start date (<=)
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 50
   *         description: Maximum number of results
   *       - in: query
   *         name: offset
   *         schema:
   *           type: integer
   *           default: 0
   *         description: Offset for pagination
   *     responses:
   *       200:
   *         description: List of maintenance windows retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 windows:
   *                   type: array
   *                   items:
   *                     $ref: '#/components/schemas/MaintenanceWindow'
   *                 total:
   *                   type: integer
   *                   description: Total number of matching windows
   *                 limit:
   *                   type: integer
   *                 offset:
   *                   type: integer
   *       401:
   *         description: Unauthorized - Invalid or missing authentication
   *       403:
   *         description: Forbidden - Requires SUPER_ADMIN role
   */
  async listMaintenanceWindows(req: Request, res: Response): Promise<void> {
    try {
      const { status, startDate, endDate, limit = 50, offset = 0 } = req.query;

      const filters: any = {};

      if (status) {
        filters.status = status as string;
      }

      if (startDate) {
        filters.startDate = new Date(startDate as string);
      }

      if (endDate) {
        filters.endDate = new Date(endDate as string);
      }

      filters.limit = parseInt(limit as string, 10);
      filters.offset = parseInt(offset as string, 10);

      const result = await maintenanceWindowService.listMaintenanceWindows(filters);

      // Parse JSON fields for response
      const windows = result.windows.map((window) => ({
        ...window,
        affectedServices: JSON.parse(window.affectedServices),
        tasks: JSON.parse(window.tasks),
      }));

      res.status(200).json({
        windows,
        total: result.total,
        limit: filters.limit,
        offset: filters.offset,
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to retrieve maintenance windows',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * @swagger
   * /admin/maintenance-windows/{id}:
   *   get:
   *     summary: Get maintenance window details
   *     description: Retrieve detailed information about a specific maintenance window
   *     tags: [Admin - Maintenance Windows]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Maintenance window ID
   *     responses:
   *       200:
   *         description: Maintenance window details retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/MaintenanceWindow'
   *       404:
   *         description: Maintenance window not found
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden - Requires SUPER_ADMIN role
   */
  async getMaintenanceWindow(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const window = await maintenanceWindowService.getMaintenanceWindowById(id);

      if (!window) {
        res.status(404).json({ error: 'Maintenance window not found' });
        return;
      }

      // Parse JSON fields for response
      const response = {
        ...window,
        affectedServices: JSON.parse(window.affectedServices),
        tasks: JSON.parse(window.tasks),
      };

      res.status(200).json(response);
    } catch (error) {
      res.status(500).json({
        error: 'Failed to retrieve maintenance window',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * @swagger
   * /admin/maintenance-windows:
   *   post:
   *     summary: Schedule new maintenance window
   *     description: Create a new scheduled maintenance window
   *     tags: [Admin - Maintenance Windows]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/CreateMaintenanceWindowRequest'
   *     responses:
   *       201:
   *         description: Maintenance window created successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/MaintenanceWindow'
   *       400:
   *         description: Invalid input data
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden - Requires SUPER_ADMIN role
   */
  async createMaintenanceWindow(req: Request, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      const { user } = req as any; // Assuming auth middleware attaches user
      const userId = user?.id || 'system';

      const {
        title,
        description,
        scheduledStart,
        scheduledEnd,
        impact,
        affectedServices,
        notifyUsers,
        tasks,
        notes,
      } = req.body;

      const window = await maintenanceWindowService.createMaintenanceWindow({
        title,
        description,
        scheduledStart: new Date(scheduledStart),
        scheduledEnd: new Date(scheduledEnd),
        impact,
        affectedServices,
        notifyUsers,
        tasks,
        notes,
        createdBy: userId,
      });

      // Parse JSON fields for response
      const response = {
        ...window,
        affectedServices: JSON.parse(window.affectedServices),
        tasks: JSON.parse(window.tasks),
      };

      res.status(201).json(response);
    } catch (error) {
      res.status(500).json({
        error: 'Failed to create maintenance window',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * @swagger
   * /admin/maintenance-windows/{id}:
   *   put:
   *     summary: Update maintenance window
   *     description: Update an existing maintenance window
   *     tags: [Admin - Maintenance Windows]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Maintenance window ID
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               title:
   *                 type: string
   *               description:
   *                 type: string
   *               scheduledStart:
   *                 type: string
   *                 format: date-time
   *               scheduledEnd:
   *                 type: string
   *                 format: date-time
   *               impact:
   *                 type: string
   *                 enum: [LOW, MEDIUM, HIGH, CRITICAL]
   *               affectedServices:
   *                 type: array
   *                 items:
   *                   type: string
   *               notifyUsers:
   *                 type: boolean
   *               tasks:
   *                 type: array
   *                 items:
   *                   type: object
   *                   properties:
   *                     description:
   *                       type: string
   *                     assignedTo:
   *                       type: string
   *               notes:
   *                 type: string
   *     responses:
   *       200:
   *         description: Maintenance window updated successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/MaintenanceWindow'
   *       400:
   *         description: Invalid input or cannot update window in current state
   *       404:
   *         description: Maintenance window not found
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden - Requires SUPER_ADMIN role
   */
  async updateMaintenanceWindow(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const updateData: any = {};

      const {
        title,
        description,
        scheduledStart,
        scheduledEnd,
        impact,
        affectedServices,
        notifyUsers,
        tasks,
        notes,
      } = req.body;

      if (title !== undefined) updateData.title = title;
      if (description !== undefined) updateData.description = description;
      if (scheduledStart !== undefined) updateData.scheduledStart = new Date(scheduledStart);
      if (scheduledEnd !== undefined) updateData.scheduledEnd = new Date(scheduledEnd);
      if (impact !== undefined) updateData.impact = impact;
      if (affectedServices !== undefined) updateData.affectedServices = affectedServices;
      if (notifyUsers !== undefined) updateData.notifyUsers = notifyUsers;
      if (tasks !== undefined) updateData.tasks = tasks;
      if (notes !== undefined) updateData.notes = notes;

      const window = await maintenanceWindowService.updateMaintenanceWindow(id, updateData);

      // Parse JSON fields for response
      const response = {
        ...window,
        affectedServices: JSON.parse(window.affectedServices),
        tasks: JSON.parse(window.tasks),
      };

      res.status(200).json(response);
    } catch (error) {
      const statusCode = error instanceof Error && error.message.includes('not found') ? 404 : 500;
      res.status(statusCode).json({
        error: 'Failed to update maintenance window',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * @swagger
   * /admin/maintenance-windows/{id}/start:
   *   post:
   *     summary: Start maintenance
   *     description: Mark maintenance window as in progress
   *     tags: [Admin - Maintenance Windows]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Maintenance window ID
   *     responses:
   *       200:
   *         description: Maintenance window started successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/MaintenanceWindow'
   *       400:
   *         description: Cannot start window in current state
   *       404:
   *         description: Maintenance window not found
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden - Requires SUPER_ADMIN role
   */
  async startMaintenanceWindow(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const window = await maintenanceWindowService.startMaintenanceWindow(id);

      // Parse JSON fields for response
      const response = {
        ...window,
        affectedServices: JSON.parse(window.affectedServices),
        tasks: JSON.parse(window.tasks),
      };

      res.status(200).json(response);
    } catch (error) {
      const statusCode = error instanceof Error && error.message.includes('not found') ? 404 : 500;
      res.status(statusCode).json({
        error: 'Failed to start maintenance window',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * @swagger
   * /admin/maintenance-windows/{id}/complete:
   *   post:
   *     summary: Complete maintenance
   *     description: Mark maintenance window as completed
   *     tags: [Admin - Maintenance Windows]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Maintenance window ID
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               completionNotes:
   *                 type: string
   *                 description: Optional completion notes
   *     responses:
   *       200:
   *         description: Maintenance window completed successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/MaintenanceWindow'
   *       400:
   *         description: Cannot complete window in current state
   *       404:
   *         description: Maintenance window not found
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden - Requires SUPER_ADMIN role
   */
  async completeMaintenanceWindow(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { completionNotes } = req.body;

      const window = await maintenanceWindowService.completeMaintenanceWindow(id, completionNotes);

      // Parse JSON fields for response
      const response = {
        ...window,
        affectedServices: JSON.parse(window.affectedServices),
        tasks: JSON.parse(window.tasks),
      };

      res.status(200).json(response);
    } catch (error) {
      const statusCode = error instanceof Error && error.message.includes('not found') ? 404 : 500;
      res.status(statusCode).json({
        error: 'Failed to complete maintenance window',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * @swagger
   * /admin/maintenance-windows/{id}/cancel:
   *   post:
   *     summary: Cancel maintenance
   *     description: Cancel a planned or in-progress maintenance window
   *     tags: [Admin - Maintenance Windows]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Maintenance window ID
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               reason:
   *                 type: string
   *                 description: Optional cancellation reason
   *     responses:
   *       200:
   *         description: Maintenance window cancelled successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/MaintenanceWindow'
   *       400:
   *         description: Cannot cancel window in current state
   *       404:
   *         description: Maintenance window not found
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden - Requires SUPER_ADMIN role
   */
  async cancelMaintenanceWindow(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      const window = await maintenanceWindowService.cancelMaintenanceWindow(id, reason);

      // Parse JSON fields for response
      const response = {
        ...window,
        affectedServices: JSON.parse(window.affectedServices),
        tasks: JSON.parse(window.tasks),
      };

      res.status(200).json(response);
    } catch (error) {
      const statusCode = error instanceof Error && error.message.includes('not found') ? 404 : 500;
      res.status(statusCode).json({
        error: 'Failed to cancel maintenance window',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

export default new MaintenanceWindowController();
