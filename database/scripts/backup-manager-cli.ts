#!/usr/bin/env ts-node

/**
 * Backup Manager CLI - Command-line interface for backup operations
 */

import { Command } from 'commander';
import { PrismaClient } from '@prisma/client';
import { BackupManager } from '../utils/backup-manager';
import { getEnvironmentConfig } from '../config/environments';
import * as winston from 'winston';

class BackupManagerCLI {
  private backupManager: BackupManager;
  private prisma: PrismaClient;
  private logger: winston.Logger;

  constructor() {
    this.prisma = new PrismaClient();
    this.backupManager = new BackupManager(this.prisma);

    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.colorize(),
        winston.format.simple()
      ),
      transports: [
        new winston.transports.Console(),
      ],
    });
  }

  async createBackup(options: {
    environment: string;
    compress: boolean;
    description?: string;
    tags: string[];
    encrypt?: string;
  }): Promise<void> {
    try {
      const config = getEnvironmentConfig(options.environment);

      this.logger.info(`Creating backup for ${options.environment} environment...`);

      const metadata = await this.backupManager.createBackup(
        config.database.url,
        options.environment,
        {
          compress: options.compress,
          includeData: true,
          includeLogs: false,
          excludeTables: [],
          description: options.description,
          tags: options.tags,
          encryptionKey: options.encrypt,
        }
      );

      console.log('\n✅ Backup created successfully!');
      console.log(`📁 File: ${metadata.filename}`);
      console.log(`💾 Size: ${this.formatBytes(metadata.size)}`);
      console.log(`🏷️  ID: ${metadata.id}`);
      console.log(`📅 Created: ${metadata.createdAt}`);

      if (metadata.description) {
        console.log(`📝 Description: ${metadata.description}`);
      }

      if (metadata.tags.length > 0) {
        console.log(`🏷️  Tags: ${metadata.tags.join(', ')}`);
      }

    } catch (error) {
      this.logger.error('Backup creation failed:', error);
      process.exit(1);
    }
  }

  async restoreBackup(filename: string, options: {
    environment: string;
    force: boolean;
    backup: boolean;
    validateOnly: boolean;
    decrypt?: string;
  }): Promise<void> {
    try {
      const config = getEnvironmentConfig(options.environment);

      if (options.validateOnly) {
        this.logger.info(`Validating backup: ${filename}`);
      } else {
        this.logger.info(`Restoring backup: ${filename} to ${options.environment} environment`);

        if (options.environment === 'production' && !options.force) {
          throw new Error('Production restore requires --force flag');
        }
      }

      await this.backupManager.restoreBackup(
        config.database.url,
        filename,
        {
          force: options.force,
          backup: options.backup,
          validateOnly: options.validateOnly,
          includeLogs: false,
          decryptionKey: options.decrypt,
        }
      );

      if (options.validateOnly) {
        console.log('\n✅ Backup validation successful!');
      } else {
        console.log('\n✅ Database restored successfully!');
      }

    } catch (error) {
      this.logger.error('Backup restore failed:', error);
      process.exit(1);
    }
  }

  async listBackups(options: { format: 'table' | 'json' }): Promise<void> {
    try {
      const backups = await this.backupManager.listBackups();

      if (backups.length === 0) {
        console.log('No backups found.');
        return;
      }

      if (options.format === 'json') {
        console.log(JSON.stringify(backups, null, 2));
        return;
      }

      // Table format
      console.log('\n📦 Available Backups:');
      console.log('='.repeat(100));

      for (const backup of backups) {
        console.log(`🆔 ID: ${backup.id}`);
        console.log(`📁 File: ${backup.filename}`);
        console.log(`🌍 Environment: ${backup.environment}`);
        console.log(`💾 Size: ${this.formatBytes(backup.size)} ${backup.compressed ? '(compressed)' : ''}`);
        console.log(`📅 Created: ${backup.createdAt}`);
        console.log(`🗃️  Tables: ${backup.tableCount}, Records: ${backup.recordCount}`);

        if (backup.description) {
          console.log(`📝 Description: ${backup.description}`);
        }

        if (backup.tags.length > 0) {
          console.log(`🏷️  Tags: ${backup.tags.join(', ')}`);
        }

        console.log('-'.repeat(50));
      }

    } catch (error) {
      this.logger.error('Failed to list backups:', error);
      process.exit(1);
    }
  }

  async cleanupBackups(retentionDays: number): Promise<void> {
    try {
      this.logger.info(`Cleaning up backups older than ${retentionDays} days...`);

      const deletedCount = await this.backupManager.cleanupBackups(retentionDays);

      console.log(`\n✅ Cleanup completed: ${deletedCount} backups deleted`);

    } catch (error) {
      this.logger.error('Backup cleanup failed:', error);
      process.exit(1);
    }
  }

  async exportOrganization(organizationId: string, options: {
    output: string;
    format: 'json' | 'csv';
    anonymize: boolean;
  }): Promise<void> {
    try {
      this.logger.info(`Exporting organization data: ${organizationId}`);

      await this.backupManager.exportOrganizationData(
        organizationId,
        options.output,
        {
          format: options.format,
          anonymize: options.anonymize,
        }
      );

      console.log(`\n✅ Organization data exported to: ${options.output}`);

    } catch (error) {
      this.logger.error('Organization export failed:', error);
      process.exit(1);
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  async close(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

// CLI Setup
const program = new Command();

program
  .name('backup-manager')
  .description('Database backup and restore management tool')
  .version('1.0.0');

program
  .command('create')
  .description('Create a new backup')
  .option('-e, --environment <env>', 'Target environment', 'development')
  .option('-c, --compress', 'Compress backup file', true)
  .option('-d, --description <desc>', 'Backup description')
  .option('-t, --tags <tags>', 'Comma-separated tags', '')
  .option('--encrypt <key>', 'Encryption key for backup')
  .action(async (options) => {
    const cli = new BackupManagerCLI();
    try {
      await cli.createBackup({
        environment: options.environment,
        compress: options.compress,
        description: options.description,
        tags: options.tags ? options.tags.split(',').map((t: string) => t.trim()) : [],
        encrypt: options.encrypt,
      });
    } finally {
      await cli.close();
    }
  });

program
  .command('restore <filename>')
  .description('Restore database from backup')
  .option('-e, --environment <env>', 'Target environment', 'development')
  .option('-f, --force', 'Force restore (required for production)', false)
  .option('--no-backup', 'Skip pre-restore backup')
  .option('--validate-only', 'Only validate backup without restoring', false)
  .option('--decrypt <key>', 'Decryption key for encrypted backup')
  .action(async (filename, options) => {
    const cli = new BackupManagerCLI();
    try {
      await cli.restoreBackup(filename, {
        environment: options.environment,
        force: options.force,
        backup: options.backup,
        validateOnly: options.validateOnly,
        decrypt: options.decrypt,
      });
    } finally {
      await cli.close();
    }
  });

program
  .command('list')
  .description('List all available backups')
  .option('-f, --format <format>', 'Output format (table|json)', 'table')
  .action(async (options) => {
    const cli = new BackupManagerCLI();
    try {
      await cli.listBackups({
        format: options.format,
      });
    } finally {
      await cli.close();
    }
  });

program
  .command('cleanup')
  .description('Clean up old backups')
  .option('-r, --retention <days>', 'Retention period in days', '30')
  .action(async (options) => {
    const cli = new BackupManagerCLI();
    try {
      const retentionDays = parseInt(options.retention, 10);
      await cli.cleanupBackups(retentionDays);
    } finally {
      await cli.close();
    }
  });

program
  .command('export <organizationId>')
  .description('Export organization data')
  .option('-o, --output <file>', 'Output file path', 'organization-export.json')
  .option('-f, --format <format>', 'Export format (json|csv)', 'json')
  .option('-a, --anonymize', 'Anonymize sensitive data', false)
  .action(async (organizationId, options) => {
    const cli = new BackupManagerCLI();
    try {
      await cli.exportOrganization(organizationId, {
        output: options.output,
        format: options.format,
        anonymize: options.anonymize,
      });
    } finally {
      await cli.close();
    }
  });

// Run CLI if this file is executed directly
if (require.main === module) {
  program.parse(process.argv);
}

export default BackupManagerCLI;