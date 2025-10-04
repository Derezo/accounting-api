import { Request, Response } from 'express';
import systemBackupService from '../services/system-backup.service';
import { AuthRequest } from '@/middleware/auth.middleware';
import * as fs from 'fs';

/**
 * Controller for system backup management (SUPER_ADMIN operations)
 */
export class SystemBackupController {
  /**
   * @openapi
   * /api/v1/admin/backups:
   *   get:
   *     summary: List all system backups
   *     description: List all system backups with filtering options (SUPER_ADMIN only)
   *     tags: [Admin - Backups]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: type
   *         schema:
   *           type: string
   *           enum: [FULL, INCREMENTAL, DATABASE_ONLY, FILES_ONLY]
   *         description: Filter by backup type
   *       - in: query
   *         name: status
   *         schema:
   *           type: string
   *           enum: [PENDING, IN_PROGRESS, COMPLETED, FAILED]
   *         description: Filter by backup status
   *       - in: query
   *         name: startDate
   *         schema:
   *           type: string
   *           format: date-time
   *         description: Filter by creation date (>=)
   *       - in: query
   *         name: endDate
   *         schema:
   *           type: string
   *           format: date-time
   *         description: Filter by creation date (<=)
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
   *         description: Results per page
   *     responses:
   *       200:
   *         description: Backups retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 backups:
   *                   type: array
   *                   items:
   *                     type: object
   *                     properties:
   *                       id:
   *                         type: string
   *                       type:
   *                         type: string
   *                       status:
   *                         type: string
   *                       filename:
   *                         type: string
   *                       size:
   *                         type: integer
   *                       startedAt:
   *                         type: string
   *                         format: date-time
   *                       completedAt:
   *                         type: string
   *                         format: date-time
   *                       createdAt:
   *                         type: string
   *                         format: date-time
   *                 total:
   *                   type: integer
   *                 page:
   *                   type: integer
   *                 pages:
   *                   type: integer
   *       403:
   *         description: Forbidden - requires SUPER_ADMIN role
   *       500:
   *         description: Internal server error
   */
  async listBackups(req: Request, res: Response): Promise<void> {
    try {
      const filters: any = {
        type: req.query.type as any,
        status: req.query.status as any,
        page: req.query.page ? parseInt(req.query.page as string) : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      };

      if (req.query.startDate) {
        filters.startDate = new Date(req.query.startDate as string);
      }

      if (req.query.endDate) {
        filters.endDate = new Date(req.query.endDate as string);
      }

      const result = await systemBackupService.listBackups(filters);

      res.status(200).json(result);
    } catch (error: any) {
      res.status(500).json({
        error: 'INTERNAL_SERVER_ERROR',
        message: error.message,
      });
    }
  }

  /**
   * @openapi
   * /api/v1/admin/backups:
   *   post:
   *     summary: Create a new backup
   *     description: Create a new system backup (SUPER_ADMIN only, asynchronous processing)
   *     tags: [Admin - Backups]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - type
   *             properties:
   *               type:
   *                 type: string
   *                 enum: [FULL, INCREMENTAL, DATABASE_ONLY, FILES_ONLY]
   *                 description: Backup type
   *               metadata:
   *                 type: object
   *                 description: Optional backup metadata
   *                 properties:
   *                   description:
   *                     type: string
   *                   retentionPolicy:
   *                     type: string
   *                   compressed:
   *                     type: boolean
   *     responses:
   *       201:
   *         description: Backup created successfully (processing asynchronously)
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 id:
   *                   type: string
   *                 type:
   *                   type: string
   *                 status:
   *                   type: string
   *                 filename:
   *                   type: string
   *                 createdAt:
   *                   type: string
   *                   format: date-time
   *       400:
   *         description: Bad request - invalid backup type
   *       403:
   *         description: Forbidden - requires SUPER_ADMIN role
   *       500:
   *         description: Internal server error
   */
  async createBackup(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { type, metadata } = req.body;
      const createdBy = req.user?.userId;
      const organizationId = req.user?.organizationId;

      if (!createdBy || !organizationId) {
        res.status(401).json({
          error: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
        return;
      }

      if (!type) {
        res.status(400).json({
          error: 'BAD_REQUEST',
          message: 'Backup type is required',
        });
        return;
      }

      const validTypes = ['FULL', 'INCREMENTAL', 'DATABASE_ONLY', 'FILES_ONLY'];
      if (!validTypes.includes(type)) {
        res.status(400).json({
          error: 'BAD_REQUEST',
          message: `Invalid backup type. Must be one of: ${validTypes.join(', ')}`,
        });
        return;
      }

      const backup = await systemBackupService.createBackup(
        {
          type,
          createdBy,
          metadata,
        },
        organizationId
      );

      res.status(201).json(backup);
    } catch (error: any) {
      res.status(500).json({
        error: 'INTERNAL_SERVER_ERROR',
        message: error.message,
      });
    }
  }

  /**
   * @openapi
   * /api/v1/admin/backups/{id}/download:
   *   get:
   *     summary: Download a backup file
   *     description: Download a completed backup file (SUPER_ADMIN only)
   *     tags: [Admin - Backups]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Backup ID
   *     responses:
   *       200:
   *         description: Backup file download
   *         content:
   *           application/gzip:
   *             schema:
   *               type: string
   *               format: binary
   *       400:
   *         description: Bad request - backup not completed
   *       404:
   *         description: Backup not found
   *       403:
   *         description: Forbidden - requires SUPER_ADMIN role
   *       500:
   *         description: Internal server error
   */
  async downloadBackup(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const backupInfo = await systemBackupService.downloadBackup(id);

      // Set headers for file download
      res.setHeader('Content-Type', 'application/gzip');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${backupInfo.filename}"`
      );
      res.setHeader('Content-Length', backupInfo.size);

      // Stream the file
      const fileStream = fs.createReadStream(backupInfo.filepath);
      fileStream.pipe(res);

      fileStream.on('error', (error) => {
        res.status(500).json({
          error: 'FILE_STREAM_ERROR',
          message: error.message,
        });
      });
    } catch (error: any) {
      if (error.message === 'Backup not found') {
        res.status(404).json({
          error: 'BACKUP_NOT_FOUND',
          message: error.message,
        });
        return;
      }

      if (error.message.includes('not completed')) {
        res.status(400).json({
          error: 'BACKUP_NOT_READY',
          message: error.message,
        });
        return;
      }

      if (error.message.includes('not found on disk')) {
        res.status(404).json({
          error: 'FILE_NOT_FOUND',
          message: error.message,
        });
        return;
      }

      res.status(500).json({
        error: 'INTERNAL_SERVER_ERROR',
        message: error.message,
      });
    }
  }

  /**
   * @openapi
   * /api/v1/admin/backups/{id}:
   *   delete:
   *     summary: Delete a backup
   *     description: Delete a backup file and record (SUPER_ADMIN only, soft delete with audit trail)
   *     tags: [Admin - Backups]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Backup ID
   *     responses:
   *       200:
   *         description: Backup deleted successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 id:
   *                   type: string
   *                 deletedAt:
   *                   type: string
   *                   format: date-time
   *                 deletedBy:
   *                   type: string
   *       404:
   *         description: Backup not found
   *       403:
   *         description: Forbidden - requires SUPER_ADMIN role
   *       500:
   *         description: Internal server error
   */
  async deleteBackup(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const deletedBy = req.user?.userId;
      const organizationId = req.user?.organizationId;

      if (!deletedBy || !organizationId) {
        res.status(401).json({
          error: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
        return;
      }

      const backup = await systemBackupService.deleteBackup(
        id,
        deletedBy,
        organizationId
      );

      res.status(200).json({
        id: backup.id,
        deletedAt: backup.deletedAt,
        deletedBy: backup.deletedBy,
      });
    } catch (error: any) {
      if (error.message === 'Backup not found') {
        res.status(404).json({
          error: 'BACKUP_NOT_FOUND',
          message: error.message,
        });
        return;
      }

      res.status(500).json({
        error: 'INTERNAL_SERVER_ERROR',
        message: error.message,
      });
    }
  }
}

export default new SystemBackupController();
