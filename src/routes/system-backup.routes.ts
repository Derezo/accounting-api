import { Router } from 'express';
import systemBackupController from '../controllers/system-backup.controller';

const router = Router();

/**
 * System Backup Routes (SUPER_ADMIN only, master org required)
 * Base path: /api/v1/admin/backups
 *
 * All routes require:
 * - Authentication (authenticate middleware)
 * - SUPER_ADMIN role
 * - Master organization context (requireMasterOrgSuperAdmin middleware)
 */

/**
 * GET /api/v1/admin/backups
 * List all system backups with filtering
 */
router.get('/', systemBackupController.listBackups.bind(systemBackupController));

/**
 * POST /api/v1/admin/backups
 * Create a new system backup (asynchronous processing)
 */
router.post('/', systemBackupController.createBackup.bind(systemBackupController));

/**
 * GET /api/v1/admin/backups/:id/download
 * Download backup file
 */
router.get(
  '/:id/download',
  systemBackupController.downloadBackup.bind(systemBackupController)
);

/**
 * DELETE /api/v1/admin/backups/:id
 * Delete backup file and record (soft delete)
 */
router.delete(
  '/:id',
  systemBackupController.deleteBackup.bind(systemBackupController)
);

export default router;
