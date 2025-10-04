import prisma from '@/config/database';
import { SystemBackup } from '@prisma/client';
import { systemLogsService } from './system-logs.service';
import { AuditService } from './audit.service';
import { AuditAction } from '@/types/enums';
import { fieldEncryptionService } from './field-encryption.service';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * @typedef {Object} BackupFilters
 * @property {string} [type] - Filter by backup type (FULL, INCREMENTAL, DATABASE_ONLY, FILES_ONLY)
 * @property {string} [status] - Filter by status (PENDING, IN_PROGRESS, COMPLETED, FAILED)
 * @property {Date} [startDate] - Filter by creation date (>=)
 * @property {Date} [endDate] - Filter by creation date (<=)
 * @property {number} [page] - Page number for pagination
 * @property {number} [limit] - Number of results per page
 */
export interface BackupFilters {
  type?: 'FULL' | 'INCREMENTAL' | 'DATABASE_ONLY' | 'FILES_ONLY';
  status?: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
}

/**
 * @typedef {Object} BackupMetadata
 * @property {string} [description] - Backup description
 * @property {string} [retentionPolicy] - Retention policy (e.g., '30 days', '1 year')
 * @property {string[]} [includedTables] - List of database tables included
 * @property {string[]} [excludedTables] - List of database tables excluded
 * @property {boolean} [compressed] - Whether backup is compressed
 * @property {string} [compressionAlgorithm] - Compression algorithm used
 */
export interface BackupMetadata {
  description?: string;
  retentionPolicy?: string;
  includedTables?: string[];
  excludedTables?: string[];
  compressed?: boolean;
  compressionAlgorithm?: string;
}

/**
 * @typedef {Object} CreateBackupInput
 * @property {'FULL'|'INCREMENTAL'|'DATABASE_ONLY'|'FILES_ONLY'} type - Backup type
 * @property {string} createdBy - User ID creating the backup
 * @property {BackupMetadata} [metadata] - Optional backup metadata
 */
export interface CreateBackupInput {
  type: 'FULL' | 'INCREMENTAL' | 'DATABASE_ONLY' | 'FILES_ONLY';
  createdBy: string;
  metadata?: BackupMetadata;
}

const auditService = new AuditService();
const BACKUP_DIRECTORY = process.env.BACKUP_DIRECTORY || '/var/backups/accounting-api';

/**
 * Service class for managing system backups
 */
class SystemBackupService {
  /**
   * List all backups with optional filtering
   *
   * @param {BackupFilters} filters - Filter options
   * @returns {Promise<{backups: SystemBackup[], total: number, page: number, pages: number}>}
   */
  async listBackups(
    filters: BackupFilters = {}
  ): Promise<{ backups: SystemBackup[]; total: number; page: number; pages: number }> {
    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const skip = (page - 1) * limit;

    const where: any = {};

    // Apply filters
    if (filters.type) {
      where.type = filters.type;
    }

    if (filters.status) {
      where.status = filters.status;
    }

    // Exclude soft-deleted backups
    where.deletedAt = null;

    // Date range filter
    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) {
        where.createdAt.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.createdAt.lte = filters.endDate;
      }
    }

    // Execute queries in parallel
    const [backups, total] = await Promise.all([
      prisma.systemBackup.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.systemBackup.count({ where }),
    ]);

    await systemLogsService.info(
      `Backup list query: ${total} backups found with filters: ${JSON.stringify(filters)}`,
      'system-backup-service'
    );

    return {
      backups,
      total,
      page,
      pages: Math.ceil(total / limit),
    };
  }

  /**
   * Get backup by ID
   *
   * @param {string} id - Backup ID
   * @returns {Promise<SystemBackup | null>}
   */
  async getBackupById(id: string): Promise<SystemBackup | null> {
    const backup = await prisma.systemBackup.findUnique({
      where: { id },
    });

    if (!backup) {
      await systemLogsService.warn(
        `Backup not found: ${id}`,
        'system-backup-service'
      );
    }

    return backup;
  }

  /**
   * Create a new backup
   * NOTE: This method returns immediately and processes the backup asynchronously
   *
   * @param {CreateBackupInput} input - Backup creation data
   * @param {string} organizationId - Master organization ID for audit
   * @returns {Promise<SystemBackup>}
   */
  async createBackup(
    input: CreateBackupInput,
    organizationId: string
  ): Promise<SystemBackup> {
    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup-${input.type.toLowerCase()}-${timestamp}.tar.gz`;
    const filepath = path.join(BACKUP_DIRECTORY, filename);

    // Encrypt metadata if provided
    let encryptedMetadata: string | null = null;
    if (input.metadata) {
      encryptedMetadata = await fieldEncryptionService.encrypt(
        JSON.stringify(input.metadata),
        organizationId
      );
    }

    // Create backup record in database
    const backup = await prisma.systemBackup.create({
      data: {
        type: input.type,
        status: 'PENDING',
        filename,
        size: BigInt(0),
        metadata: encryptedMetadata,
        createdBy: input.createdBy,
      },
    });

    // Create audit trail
    await auditService.logAction({
      action: AuditAction.BACKUP_CREATED,
      entityType: 'SystemBackup',
      entityId: backup.id,
      details: {
        type: input.type,
        filename,
        createdBy: input.createdBy,
      },
      context: {
        userId: input.createdBy,
        organizationId,
      },
    });

    // Log system event
    await systemLogsService.info(
      `Backup created: ${backup.id} (${input.type}) - ${filename}`,
      'system-backup-service',
      {
        backupId: backup.id,
        type: input.type,
        filename,
        createdBy: input.createdBy,
      }
    );

    // Process backup asynchronously (don't await)
    this.processBackupAsync(backup.id, filepath, input.type, organizationId).catch(
      async (error) => {
        await systemLogsService.error(
          `Async backup processing failed for ${backup.id}`,
          'system-backup-service',
          error as Error
        );
      }
    );

    return backup;
  }

  /**
   * Process backup asynchronously
   * PRIVATE METHOD - Not exposed via API
   *
   * @param {string} backupId - Backup ID
   * @param {string} filepath - Backup file path
   * @param {string} type - Backup type
   * @param {string} organizationId - Organization ID for audit
   * @private
   */
  private async processBackupAsync(
    backupId: string,
    filepath: string,
    type: string,
    organizationId: string
  ): Promise<void> {
    const startTime = Date.now();

    try {
      // Update status to IN_PROGRESS
      await prisma.systemBackup.update({
        where: { id: backupId },
        data: {
          status: 'IN_PROGRESS',
          startedAt: new Date(),
        },
      });

      await systemLogsService.info(
        `Starting backup processing: ${backupId}`,
        'system-backup-service',
        { backupId, type }
      );

      // Ensure backup directory exists
      if (!fs.existsSync(BACKUP_DIRECTORY)) {
        fs.mkdirSync(BACKUP_DIRECTORY, { recursive: true });
      }

      // Execute backup based on type
      let backupCommand: string;
      const dbPath = process.env.DATABASE_URL?.replace('file:', '') || './prisma/dev.db';

      switch (type) {
        case 'DATABASE_ONLY':
          // SQLite backup
          backupCommand = `sqlite3 "${dbPath}" ".backup '${filepath}.db'" && tar -czf "${filepath}" -C "${path.dirname(filepath)}" "${path.basename(filepath)}.db" && rm "${filepath}.db"`;
          break;

        case 'FILES_ONLY':
          // Backup storage directory
          const storageDir = process.env.STORAGE_DIR || './storage';
          backupCommand = `tar -czf "${filepath}" -C "${path.dirname(storageDir)}" "${path.basename(storageDir)}"`;
          break;

        case 'FULL':
          // Full backup: database + storage
          const dbDir = path.dirname(dbPath);
          const storageDirFull = process.env.STORAGE_DIR || './storage';
          backupCommand = `tar -czf "${filepath}" -C "${process.cwd()}" "${path.relative(process.cwd(), dbPath)}" "${path.relative(process.cwd(), storageDirFull)}"`;
          break;

        case 'INCREMENTAL':
          // Incremental backup - find files modified in last 24 hours
          backupCommand = `find "${process.cwd()}" -type f -mtime -1 -print0 | tar -czf "${filepath}" --null -T -`;
          break;

        default:
          throw new Error(`Unknown backup type: ${type}`);
      }

      // Execute backup command
      await execAsync(backupCommand);

      // Get file size
      const stats = fs.statSync(filepath);
      const fileSize = BigInt(stats.size);

      // Update backup record
      await prisma.systemBackup.update({
        where: { id: backupId },
        data: {
          status: 'COMPLETED',
          size: fileSize,
          completedAt: new Date(),
        },
      });

      const duration = Date.now() - startTime;

      await systemLogsService.info(
        `Backup completed: ${backupId} - ${this.formatBytes(Number(fileSize))} in ${duration}ms`,
        'system-backup-service',
        {
          backupId,
          type,
          size: Number(fileSize),
          duration,
        }
      );

      // Create audit trail
      await auditService.logAction({
        action: AuditAction.BACKUP_COMPLETED,
        entityType: 'SystemBackup',
        entityId: backupId,
        details: {
          type,
          size: Number(fileSize),
          duration,
          filepath,
        },
        context: {
          organizationId,
        },
      });
    } catch (error: any) {
      // Update backup status to FAILED
      await prisma.systemBackup.update({
        where: { id: backupId },
        data: {
          status: 'FAILED',
          error: error.message,
          completedAt: new Date(),
        },
      });

      await systemLogsService.error(
        `Backup failed: ${backupId} - ${error.message}`,
        'system-backup-service',
        error
      );

      // Create audit trail
      await auditService.logAction({
        action: AuditAction.BACKUP_FAILED,
        entityType: 'SystemBackup',
        entityId: backupId,
        details: {
          type,
          error: error.message,
          duration: Date.now() - startTime,
        },
        context: {
          organizationId,
        },
      });
    }
  }

  /**
   * Get backup download URL/stream
   *
   * @param {string} id - Backup ID
   * @returns {Promise<{filepath: string, filename: string, size: number}>}
   * @throws {Error} If backup not found or not completed
   */
  async downloadBackup(id: string): Promise<{
    filepath: string;
    filename: string;
    size: number;
  }> {
    const backup = await this.getBackupById(id);

    if (!backup) {
      throw new Error('Backup not found');
    }

    if (backup.status !== 'COMPLETED') {
      throw new Error(`Backup is not completed. Status: ${backup.status}`);
    }

    const filepath = path.join(BACKUP_DIRECTORY, backup.filename);

    // Verify file exists
    if (!fs.existsSync(filepath)) {
      await systemLogsService.error(
        `Backup file not found: ${filepath}`,
        'system-backup-service',
        new Error('Backup file missing')
      );
      throw new Error('Backup file not found on disk');
    }

    await systemLogsService.info(
      `Backup download requested: ${id} - ${backup.filename}`,
      'system-backup-service',
      { backupId: id, filename: backup.filename }
    );

    return {
      filepath,
      filename: backup.filename,
      size: Number(backup.size),
    };
  }

  /**
   * Delete backup file and record (soft delete)
   *
   * @param {string} id - Backup ID
   * @param {string} deletedBy - User ID deleting the backup
   * @param {string} organizationId - Master organization ID for audit
   * @returns {Promise<SystemBackup>}
   * @throws {Error} If backup not found
   */
  async deleteBackup(
    id: string,
    deletedBy: string,
    organizationId: string
  ): Promise<SystemBackup> {
    const backup = await this.getBackupById(id);

    if (!backup) {
      throw new Error('Backup not found');
    }

    // Soft delete the backup record
    const deletedBackup = await prisma.systemBackup.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedBy,
      },
    });

    // Delete physical file
    const filepath = path.join(BACKUP_DIRECTORY, backup.filename);
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
      await systemLogsService.info(
        `Backup file deleted: ${filepath}`,
        'system-backup-service',
        { backupId: id, filename: backup.filename }
      );
    }

    // Create audit trail
    await auditService.logAction({
      action: AuditAction.BACKUP_DELETED,
      entityType: 'SystemBackup',
      entityId: id,
      details: {
        type: backup.type,
        filename: backup.filename,
        size: Number(backup.size),
        deletedBy,
      },
      context: {
        userId: deletedBy,
        organizationId,
      },
    });

    await systemLogsService.warn(
      `Backup deleted: ${id} by user ${deletedBy}`,
      'system-backup-service',
      { backupId: id, deletedBy, filename: backup.filename }
    );

    return deletedBackup;
  }

  /**
   * Get backup statistics
   *
   * @returns {Promise<Object>} Backup statistics
   */
  async getBackupStatistics(): Promise<{
    total: number;
    byType: Record<string, number>;
    byStatus: Record<string, number>;
    totalSize: number;
    lastBackup: Date | null;
  }> {
    const [total, backups, lastBackup] = await Promise.all([
      prisma.systemBackup.count({ where: { deletedAt: null } }),
      prisma.systemBackup.findMany({
        where: { deletedAt: null },
        select: {
          type: true,
          status: true,
          size: true,
        },
      }),
      prisma.systemBackup.findFirst({
        where: { deletedAt: null, status: 'COMPLETED' },
        orderBy: { completedAt: 'desc' },
        select: { completedAt: true },
      }),
    ]);

    // Aggregate by type
    const byType: Record<string, number> = {};
    backups.forEach((backup) => {
      byType[backup.type] = (byType[backup.type] || 0) + 1;
    });

    // Aggregate by status
    const byStatus: Record<string, number> = {};
    backups.forEach((backup) => {
      byStatus[backup.status] = (byStatus[backup.status] || 0) + 1;
    });

    // Calculate total size
    const totalSize = backups.reduce((sum, backup) => sum + Number(backup.size), 0);

    return {
      total,
      byType,
      byStatus,
      totalSize,
      lastBackup: lastBackup?.completedAt || null,
    };
  }

  /**
   * Format bytes to human-readable string
   *
   * @param {number} bytes - Number of bytes
   * @returns {string} Formatted string
   * @private
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }
}

export default new SystemBackupService();
