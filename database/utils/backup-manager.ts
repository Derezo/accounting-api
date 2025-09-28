/**
 * Backup Manager - Handles database backups and restoration
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';
import winston from 'winston';
import * as zlib from 'zlib';

export interface BackupMetadata {
  id: string;
  filename: string;
  environment: string;
  size: number;
  compressed: boolean;
  checksum: string;
  createdAt: Date;
  databaseVersion: string;
  schemaVersion: string;
  tableCount: number;
  recordCount: number;
  description?: string;
  tags: string[];
}

export interface BackupOptions {
  compress: boolean;
  includeData: boolean;
  includeLogs: boolean;
  excludeTables: string[];
  description?: string;
  tags: string[];
  encryptionKey?: string;
}

export interface RestoreOptions {
  force: boolean;
  backup: boolean;
  validateOnly: boolean;
  includeLogs: boolean;
  decryptionKey?: string;
}

export class BackupManager {
  private prisma: PrismaClient;
  private logger: winston.Logger;
  private backupDir: string;

  constructor(prisma: PrismaClient, backupDir: string = 'database/backups') {
    this.prisma = prisma;
    this.backupDir = backupDir;

    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          ),
        }),
        new winston.transports.File({
          filename: path.join(this.backupDir, 'backup.log'),
        }),
      ],
    });

    // Ensure backup directory exists
    this.ensureDirectoryExists(this.backupDir);
  }

  /**
   * Create a full database backup
   */
  async createBackup(
    databaseUrl: string,
    environment: string,
    options: Partial<BackupOptions> = {}
  ): Promise<BackupMetadata> {
    const defaultOptions: BackupOptions = {
      compress: true,
      includeData: true,
      includeLogs: false,
      excludeTables: [],
      tags: [],
      ...options,
    };

    const backupId = this.generateBackupId();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const baseFilename = `backup-${environment}-${timestamp}-${backupId}`;
    const sqlFilename = `${baseFilename}.sql`;
    const finalFilename = defaultOptions.compress ? `${sqlFilename}.gz` : sqlFilename;

    this.logger.info(`Creating backup: ${finalFilename}`);

    try {
      // Get database metadata
      const metadata = await this.getDatabaseMetadata();

      // Create SQL dump
      const sqlPath = path.join(this.backupDir, sqlFilename);
      await this.createSqlDump(databaseUrl, sqlPath, defaultOptions);

      // Get file size before compression
      const stats = fs.statSync(sqlPath);
      let finalSize = stats.size;
      let finalPath = sqlPath;

      // Compress if requested
      if (defaultOptions.compress) {
        const compressedPath = path.join(this.backupDir, finalFilename);
        await this.compressFile(sqlPath, compressedPath);
        fs.unlinkSync(sqlPath); // Remove uncompressed file

        const compressedStats = fs.statSync(compressedPath);
        finalSize = compressedStats.size;
        finalPath = compressedPath;
      }

      // Encrypt if requested
      if (defaultOptions.encryptionKey) {
        const encryptedPath = `${finalPath}.enc`;
        await this.encryptFile(finalPath, encryptedPath, defaultOptions.encryptionKey);
        fs.unlinkSync(finalPath); // Remove unencrypted file

        const encryptedStats = fs.statSync(encryptedPath);
        finalSize = encryptedStats.size;
        finalPath = encryptedPath;
      }

      // Calculate checksum
      const checksum = await this.calculateChecksum(finalPath);

      // Create backup metadata
      const backupMetadata: BackupMetadata = {
        id: backupId,
        filename: path.basename(finalPath),
        environment,
        size: finalSize,
        compressed: defaultOptions.compress,
        checksum,
        createdAt: new Date(),
        databaseVersion: metadata.version,
        schemaVersion: metadata.schemaVersion,
        tableCount: metadata.tableCount,
        recordCount: metadata.recordCount,
        description: defaultOptions.description,
        tags: defaultOptions.tags,
      };

      // Save metadata
      await this.saveBackupMetadata(backupMetadata);

      this.logger.info(`Backup created successfully: ${finalFilename} (${finalSize} bytes)`);
      return backupMetadata;

    } catch (error) {
      this.logger.error('Backup creation failed:', error);
      throw new Error(`Backup creation failed: ${error}`);
    }
  }

  /**
   * Restore database from backup
   */
  async restoreBackup(
    databaseUrl: string,
    backupFilename: string,
    options: Partial<RestoreOptions> = {}
  ): Promise<void> {
    const defaultOptions: RestoreOptions = {
      force: false,
      backup: true,
      validateOnly: false,
      includeLogs: false,
      ...options,
    };

    const backupPath = path.join(this.backupDir, backupFilename);

    if (!fs.existsSync(backupPath)) {
      throw new Error(`Backup file not found: ${backupFilename}`);
    }

    this.logger.info(`Restoring backup: ${backupFilename}`);

    try {
      // Load backup metadata
      const metadata = await this.loadBackupMetadata(backupFilename);
      if (!metadata) {
        this.logger.warn('Backup metadata not found, proceeding without validation');
      }

      // Validate backup integrity
      if (metadata) {
        await this.validateBackupIntegrity(backupPath, metadata);
      }

      if (defaultOptions.validateOnly) {
        this.logger.info('Validation completed successfully');
        return;
      }

      // Create pre-restore backup if requested
      if (defaultOptions.backup) {
        this.logger.info('Creating pre-restore backup...');
        await this.createBackup(databaseUrl, 'pre-restore', {
          compress: true,
          includeData: true,
          includeLogs: false,
          excludeTables: [],
          description: `Pre-restore backup before restoring ${backupFilename}`,
          tags: ['pre-restore'],
        });
      }

      // Prepare backup file for restoration
      let restoreFilePath = backupPath;

      // Decrypt if needed
      if (backupFilename.endsWith('.enc')) {
        if (!defaultOptions.decryptionKey) {
          throw new Error('Decryption key required for encrypted backup');
        }

        const decryptedPath = backupPath.replace('.enc', '');
        await this.decryptFile(backupPath, decryptedPath, defaultOptions.decryptionKey);
        restoreFilePath = decryptedPath;
      }

      // Decompress if needed
      if (restoreFilePath.endsWith('.gz')) {
        const decompressedPath = restoreFilePath.replace('.gz', '');
        await this.decompressFile(restoreFilePath, decompressedPath);
        restoreFilePath = decompressedPath;
      }

      // Restore database
      await this.restoreFromSql(databaseUrl, restoreFilePath);

      // Clean up temporary files
      if (restoreFilePath !== backupPath) {
        fs.unlinkSync(restoreFilePath);
      }

      this.logger.info(`Database restored successfully from: ${backupFilename}`);

    } catch (error) {
      this.logger.error('Backup restoration failed:', error);
      throw new Error(`Backup restoration failed: ${error}`);
    }
  }

  /**
   * List all available backups
   */
  async listBackups(): Promise<BackupMetadata[]> {
    const metadataFiles = fs.readdirSync(this.backupDir)
      .filter(file => file.endsWith('.meta.json'))
      .sort()
      .reverse(); // Most recent first

    const backups: BackupMetadata[] = [];

    for (const metadataFile of metadataFiles) {
      try {
        const metadataPath = path.join(this.backupDir, metadataFile);
        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
        backups.push(metadata);
      } catch (error) {
        this.logger.warn(`Failed to load metadata: ${metadataFile}`, error);
      }
    }

    return backups;
  }

  /**
   * Delete old backups based on retention policy
   */
  async cleanupBackups(retentionDays: number = 30): Promise<number> {
    this.logger.info(`Cleaning up backups older than ${retentionDays} days`);

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const backups = await this.listBackups();
    let deletedCount = 0;

    for (const backup of backups) {
      if (new Date(backup.createdAt) < cutoffDate) {
        try {
          // Delete backup file
          const backupPath = path.join(this.backupDir, backup.filename);
          if (fs.existsSync(backupPath)) {
            fs.unlinkSync(backupPath);
          }

          // Delete metadata file
          const metadataPath = path.join(this.backupDir, `${backup.id}.meta.json`);
          if (fs.existsSync(metadataPath)) {
            fs.unlinkSync(metadataPath);
          }

          deletedCount++;
          this.logger.info(`Deleted old backup: ${backup.filename}`);

        } catch (error) {
          this.logger.error(`Failed to delete backup: ${backup.filename}`, error);
        }
      }
    }

    this.logger.info(`Cleanup completed: ${deletedCount} backups deleted`);
    return deletedCount;
  }

  /**
   * Export data for specific organization
   */
  async exportOrganizationData(
    organizationId: string,
    outputPath: string,
    options: { format: 'json' | 'csv'; anonymize: boolean } = { format: 'json', anonymize: false }
  ): Promise<void> {
    this.logger.info(`Exporting data for organization: ${organizationId}`);

    try {
      // Get organization data
      const organization = await this.prisma.organization.findUnique({
        where: { id: organizationId },
        include: {
          users: true,
          customers: {
            include: {
              person: true,
              business: true,
              addresses: {
                include: {
                  address: {
                    include: {
                      country: true,
                    },
                  },
                },
              },
            },
          },
          quotes: {
            include: {
              items: {
                include: {
                  product: true,
                  service: true,
                },
              },
            },
          },
          invoices: {
            include: {
              items: {
                include: {
                  product: true,
                  service: true,
                },
              },
              payments: true,
            },
          },
          projects: true,
          appointments: true,
          products: true,
          services: true,
          vendors: {
            include: {
              business: true,
              addresses: {
                include: {
                  address: {
                    include: {
                      country: true,
                    },
                  },
                },
              },
            },
          },
          expenses: true,
        },
      });

      if (!organization) {
        throw new Error(`Organization not found: ${organizationId}`);
      }

      // Anonymize data if requested
      if (options.anonymize) {
        this.anonymizeOrganizationData(organization);
      }

      // Export based on format
      if (options.format === 'json') {
        fs.writeFileSync(outputPath, JSON.stringify(organization, null, 2));
      } else if (options.format === 'csv') {
        // Convert to CSV format (simplified - would need proper CSV library)
        const csv = this.convertToCSV(organization);
        fs.writeFileSync(outputPath, csv);
      }

      this.logger.info(`Organization data exported to: ${outputPath}`);

    } catch (error) {
      this.logger.error('Organization data export failed:', error);
      throw new Error(`Organization data export failed: ${error}`);
    }
  }

  private generateBackupId(): string {
    return crypto.randomBytes(8).toString('hex');
  }

  private ensureDirectoryExists(dir: string): void {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private async getDatabaseMetadata(): Promise<{
    version: string;
    schemaVersion: string;
    tableCount: number;
    recordCount: number;
  }> {
    try {
      // Get database version
      const versionResult = await this.prisma.$queryRaw<[{ version: string }]>`
        SELECT version() as version
      `;
      const version = versionResult[0]?.version || 'Unknown';

      // Get table count (PostgreSQL specific - would need adjustment for other DBs)
      const tableCountResult = await this.prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) as count
        FROM information_schema.tables
        WHERE table_schema = 'public'
      `;
      const tableCount = Number(tableCountResult[0]?.count || 0);

      // Get approximate record count
      const organizationCount = await this.prisma.organization.count();

      return {
        version,
        schemaVersion: '1.0', // Would get from migration tracking
        tableCount,
        recordCount: organizationCount,
      };

    } catch (error) {
      return {
        version: 'Unknown',
        schemaVersion: 'Unknown',
        tableCount: 0,
        recordCount: 0,
      };
    }
  }

  private async createSqlDump(
    databaseUrl: string,
    outputPath: string,
    options: BackupOptions
  ): Promise<void> {
    let command: string;

    if (databaseUrl.startsWith('postgresql://')) {
      // PostgreSQL dump
      command = `pg_dump "${databaseUrl}"`;

      if (!options.includeData) {
        command += ' --schema-only';
      }

      if (options.excludeTables.length > 0) {
        for (const table of options.excludeTables) {
          command += ` --exclude-table=${table}`;
        }
      }

      command += ` > "${outputPath}"`;

    } else if (databaseUrl.startsWith('file:')) {
      // SQLite dump
      const dbPath = databaseUrl.replace('file:', '');
      command = `sqlite3 "${dbPath}" .dump > "${outputPath}"`;

    } else {
      throw new Error('Unsupported database type for backup');
    }

    execSync(command, { encoding: 'utf8' });
  }

  private async restoreFromSql(databaseUrl: string, sqlPath: string): Promise<void> {
    let command: string;

    if (databaseUrl.startsWith('postgresql://')) {
      // PostgreSQL restore
      command = `psql "${databaseUrl}" < "${sqlPath}"`;

    } else if (databaseUrl.startsWith('file:')) {
      // SQLite restore
      const dbPath = databaseUrl.replace('file:', '');
      command = `sqlite3 "${dbPath}" < "${sqlPath}"`;

    } else {
      throw new Error('Unsupported database type for restore');
    }

    execSync(command, { encoding: 'utf8' });
  }

  private async compressFile(inputPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const input = fs.createReadStream(inputPath);
      const output = fs.createWriteStream(outputPath);
      const gzip = zlib.createGzip({ level: 9 });

      input.pipe(gzip).pipe(output);

      output.on('finish', resolve);
      output.on('error', reject);
    });
  }

  private async decompressFile(inputPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const input = fs.createReadStream(inputPath);
      const output = fs.createWriteStream(outputPath);
      const gunzip = zlib.createGunzip();

      input.pipe(gunzip).pipe(output);

      output.on('finish', resolve);
      output.on('error', reject);
    });
  }

  private async encryptFile(inputPath: string, outputPath: string, key: string): Promise<void> {
    const algorithm = 'aes-256-cbc';
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher(algorithm, key);

    const input = fs.createReadStream(inputPath);
    const output = fs.createWriteStream(outputPath);

    // Write IV at the beginning of the file
    output.write(iv);

    input.pipe(cipher).pipe(output);

    return new Promise((resolve, reject) => {
      output.on('finish', resolve);
      output.on('error', reject);
    });
  }

  private async decryptFile(inputPath: string, outputPath: string, key: string): Promise<void> {
    const algorithm = 'aes-256-cbc';

    return new Promise((resolve, reject) => {
      const input = fs.createReadStream(inputPath);
      const output = fs.createWriteStream(outputPath);

      // Read IV from the beginning of the file
      const iv = Buffer.alloc(16);
      input.read(16); // Skip IV

      const decipher = crypto.createDecipher(algorithm, key);

      input.pipe(decipher).pipe(output);

      output.on('finish', resolve);
      output.on('error', reject);
    });
  }

  private async calculateChecksum(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);

      stream.on('data', data => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  private async saveBackupMetadata(metadata: BackupMetadata): Promise<void> {
    const metadataPath = path.join(this.backupDir, `${metadata.id}.meta.json`);
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  }

  private async loadBackupMetadata(backupFilename: string): Promise<BackupMetadata | null> {
    // Extract backup ID from filename
    const backupId = backupFilename.split('-').pop()?.split('.')[0];
    if (!backupId) return null;

    const metadataPath = path.join(this.backupDir, `${backupId}.meta.json`);

    if (!fs.existsSync(metadataPath)) {
      return null;
    }

    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    return metadata;
  }

  private async validateBackupIntegrity(backupPath: string, metadata: BackupMetadata): Promise<void> {
    // Verify file size
    const stats = fs.statSync(backupPath);
    if (stats.size !== metadata.size) {
      throw new Error(`Backup file size mismatch: expected ${metadata.size}, got ${stats.size}`);
    }

    // Verify checksum
    const checksum = await this.calculateChecksum(backupPath);
    if (checksum !== metadata.checksum) {
      throw new Error(`Backup checksum mismatch: expected ${metadata.checksum}, got ${checksum}`);
    }

    this.logger.info('Backup integrity validated successfully');
  }

  private anonymizeOrganizationData(data: any): void {
    // Anonymize sensitive data (simplified implementation)
    if (data.users) {
      data.users.forEach((user: any) => {
        user.email = `user${Math.random().toString(36).substr(2, 9)}@example.com`;
        user.firstName = 'Anonymous';
        user.lastName = 'User';
        user.phone = '+1 (555) 000-0000';
      });
    }

    if (data.customers) {
      data.customers.forEach((customer: any) => {
        if (customer.person) {
          customer.person.firstName = 'Customer';
          customer.person.lastName = Math.random().toString(36).substr(2, 9);
          customer.person.email = `customer${Math.random().toString(36).substr(2, 9)}@example.com`;
          customer.person.phone = '+1 (555) 000-0000';
        }
      });
    }

    // Add more anonymization rules as needed
  }

  private convertToCSV(data: any): string {
    // Simplified CSV conversion (would use proper CSV library in production)
    return JSON.stringify(data);
  }
}

export default BackupManager;