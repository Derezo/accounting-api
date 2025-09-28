#!/usr/bin/env ts-node

/**
 * Migration Manager - Handles database migrations across environments
 */

import { Command } from 'commander';
import * as winston from 'winston';
import { getEnvironmentConfig, allowsDangerousOperations } from '../config/environments';
import { DatabaseManager } from '../utils/database-manager';
import { MigrationUtils } from '../utils/migration-utils';
import { PrismaClient } from '@prisma/client';

interface MigrationOptions {
  environment: string;
  backup: boolean;
  force: boolean;
  verbose: boolean;
  dryRun: boolean;
  rollback?: number;
}

class MigrationManager {
  private dbManager: DatabaseManager;
  private migrationUtils: MigrationUtils;
  private logger: winston.Logger;
  private prisma: PrismaClient;

  constructor() {
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          return `${timestamp} [${level.toUpperCase()}]: ${message} ${
            Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''
          }`;
        })
      ),
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          ),
        }),
        new winston.transports.File({
          filename: 'database/logs/migrations.log',
          maxsize: 10 * 1024 * 1024, // 10MB
          maxFiles: 5,
        }),
      ],
    });

    // Will be initialized with environment config
    this.prisma = new PrismaClient();
    this.dbManager = new DatabaseManager({
      environment: 'development',
      databaseUrl: '',
    });
    this.migrationUtils = new MigrationUtils(this.prisma);
  }

  async initializeForEnvironment(environment: string): Promise<void> {
    const config = getEnvironmentConfig(environment);

    // Disconnect existing clients
    await this.prisma.$disconnect();

    // Create new clients for environment
    this.prisma = new PrismaClient({
      datasources: {
        db: {
          url: config.database.url,
        },
      },
      log: config.database.logging ? ['query', 'info', 'warn', 'error'] : ['error'],
    });

    this.dbManager = new DatabaseManager({
      environment: environment as any,
      databaseUrl: config.database.url,
      shadowDatabaseUrl: config.database.shadowUrl,
      maxConnections: config.database.maxConnections,
      timeout: config.database.timeout,
      logging: config.database.logging,
    });

    this.migrationUtils = new MigrationUtils(this.prisma);

    await this.dbManager.initialize();
  }

  async deployMigrations(options: MigrationOptions): Promise<void> {
    this.logger.info(`Deploying migrations for ${options.environment} environment`);

    const config = getEnvironmentConfig(options.environment);

    if (options.dryRun) {
      this.logger.info('DRY RUN MODE - Previewing migration plan');
      await this.previewMigrations(options);
      return;
    }

    try {
      // Create backup if requested
      if (options.backup || config.migrations.backupBeforeMigration) {
        this.logger.info('Creating pre-migration backup...');
        const backupInfo = await this.dbManager.createBackup();
        this.logger.info(`Backup created: ${backupInfo.filename}`);
      }

      // Validate schema before migration
      this.logger.info('Validating schema...');
      const schemaValidation = await this.dbManager.validateSchema();
      if (!schemaValidation.valid) {
        throw new Error(`Schema validation failed: ${schemaValidation.errors.join(', ')}`);
      }

      // Deploy migrations
      this.logger.info('Deploying migrations...');
      await this.dbManager.migrate(false);

      // Verify database health after migration
      this.logger.info('Verifying database health...');
      const healthStatus = await this.dbManager.getHealthStatus();
      if (!healthStatus.connected) {
        throw new Error('Database health check failed after migration');
      }

      this.logger.info('Migrations deployed successfully');
      this.logger.info(`Database tables: ${healthStatus.tableCount}`);

    } catch (error) {
      this.logger.error('Migration deployment failed:', error);

      if (config.migrations.rollbackOnFailure && allowsDangerousOperations(options.environment)) {
        this.logger.warn('Attempting automatic rollback...');
        try {
          await this.rollbackLastMigration(options);
          this.logger.info('Automatic rollback completed');
        } catch (rollbackError) {
          this.logger.error('Automatic rollback failed:', rollbackError);
        }
      }

      throw error;
    }
  }

  async previewMigrations(options: MigrationOptions): Promise<void> {
    this.logger.info('Previewing migration changes...');

    try {
      // Show pending migrations
      const pendingMigrations = await this.migrationUtils.getPendingMigrations();

      if (pendingMigrations.length === 0) {
        this.logger.info('No pending migrations found');
        return;
      }

      console.log('\nPending Migrations:');
      console.log('='.repeat(50));

      for (const migration of pendingMigrations) {
        console.log(`📄 ${migration}`);

        // Validate migration
        const validation = this.migrationUtils.validateMigration(`database/migrations/${migration}`);
        const status = validation.valid ? '✓' : '✗';
        console.log(`   Status: ${status} ${validation.valid ? 'Valid' : `Invalid: ${validation.errors.join(', ')}`}`);
      }

      console.log('='.repeat(50));
      console.log(`Total pending migrations: ${pendingMigrations.length}`);

      // Preview with Prisma
      this.logger.info('Generating migration preview...');
      await this.dbManager.migrate(true); // Preview mode

    } catch (error) {
      this.logger.error('Migration preview failed:', error);
      throw error;
    }
  }

  async createMigration(name: string, description: string): Promise<void> {
    this.logger.info(`Creating new migration: ${name}`);

    try {
      const migrationId = this.migrationUtils.createMigration(name, description);
      this.logger.info(`Migration created: ${migrationId}`);

      console.log(`
Migration files created:
- database/migrations/${migrationId}/migration.sql
- database/migrations/${migrationId}/rollback.sql
- database/migrations/${migrationId}/metadata.json

Please edit the migration.sql file with your changes, then run:
npm run migrate:deploy
      `);

    } catch (error) {
      this.logger.error('Migration creation failed:', error);
      throw error;
    }
  }

  async rollbackLastMigration(options: MigrationOptions): Promise<void> {
    if (options.environment === 'production' && !options.force) {
      throw new Error('Migration rollback in production requires --force flag');
    }

    this.logger.warn('Rolling back last migration...');

    try {
      // Get the last applied migration
      // This is a simplified implementation - in a real system,
      // you'd track applied migrations in a table
      const pendingMigrations = await this.migrationUtils.getPendingMigrations();

      if (pendingMigrations.length === 0) {
        this.logger.info('No migrations to rollback');
        return;
      }

      // For demo purposes, we'll use the first pending migration
      // In reality, you'd get the last applied migration
      const lastMigration = pendingMigrations[0];

      if (options.dryRun) {
        this.logger.info(`DRY RUN MODE - Would rollback migration: ${lastMigration}`);
        return;
      }

      // Create backup before rollback
      if (options.backup) {
        this.logger.info('Creating pre-rollback backup...');
        const backupInfo = await this.dbManager.createBackup();
        this.logger.info(`Backup created: ${backupInfo.filename}`);
      }

      // Perform rollback
      await this.migrationUtils.rollbackMigration(lastMigration);

      this.logger.info(`Migration rolled back successfully: ${lastMigration}`);

    } catch (error) {
      this.logger.error('Migration rollback failed:', error);
      throw error;
    }
  }

  async resetDatabase(options: MigrationOptions): Promise<void> {
    if (!allowsDangerousOperations(options.environment)) {
      throw new Error(`Database reset is not allowed in ${options.environment} environment`);
    }

    if (!options.force) {
      throw new Error('Database reset requires --force flag');
    }

    this.logger.warn(`Resetting database for ${options.environment} environment`);

    if (options.dryRun) {
      this.logger.info('DRY RUN MODE - Would reset entire database');
      return;
    }

    try {
      // Create backup before reset
      if (options.backup) {
        this.logger.info('Creating pre-reset backup...');
        const backupInfo = await this.dbManager.createBackup();
        this.logger.info(`Backup created: ${backupInfo.filename}`);
      }

      // Reset database
      await this.dbManager.reset();

      this.logger.info('Database reset completed');

    } catch (error) {
      this.logger.error('Database reset failed:', error);
      throw error;
    }
  }

  async checkMigrationStatus(options: MigrationOptions): Promise<void> {
    this.logger.info(`Checking migration status for ${options.environment} environment`);

    try {
      const healthStatus = await this.dbManager.getHealthStatus();
      const pendingMigrations = await this.migrationUtils.getPendingMigrations();

      console.log('\nMigration Status Report');
      console.log('='.repeat(50));
      console.log(`Environment: ${options.environment}`);
      console.log(`Database Connected: ${healthStatus.connected ? '✓' : '✗'}`);
      console.log(`Database Version: ${healthStatus.version}`);
      console.log(`Total Tables: ${healthStatus.tableCount}`);
      console.log(`Applied Migrations: ${healthStatus.migrations.length}`);
      console.log(`Pending Migrations: ${pendingMigrations.length}`);

      if (pendingMigrations.length > 0) {
        console.log('\nPending Migrations:');
        pendingMigrations.forEach(migration => {
          console.log(`- ${migration}`);
        });
      }

      if (healthStatus.migrations.length > 0) {
        console.log('\nApplied Migrations:');
        healthStatus.migrations.forEach(migration => {
          console.log(`- ${migration.id} (${migration.appliedAt})`);
        });
      }

      console.log('='.repeat(50));

    } catch (error) {
      this.logger.error('Migration status check failed:', error);
      throw error;
    }
  }

  async close(): Promise<void> {
    await this.prisma.$disconnect();
    await this.dbManager.close();
  }
}

// CLI Interface
const program = new Command();

program
  .name('migrate-manager')
  .description('Database migration management tool')
  .version('1.0.0');

program
  .command('deploy')
  .description('Deploy pending migrations')
  .option('-e, --environment <env>', 'Target environment', 'development')
  .option('-b, --backup', 'Create backup before migration', false)
  .option('-f, --force', 'Force operation in production', false)
  .option('-v, --verbose', 'Verbose output', false)
  .option('--dry-run', 'Preview changes without applying', false)
  .action(async (options) => {
    const migrationManager = new MigrationManager();
    try {
      await migrationManager.initializeForEnvironment(options.environment);
      await migrationManager.deployMigrations({
        environment: options.environment,
        backup: options.backup,
        force: options.force,
        verbose: options.verbose,
        dryRun: options.dryRun,
      });
    } catch (error) {
      console.error('Migration deployment failed:', error);
      process.exit(1);
    } finally {
      await migrationManager.close();
    }
  });

program
  .command('create <name>')
  .description('Create a new migration')
  .option('-d, --description <desc>', 'Migration description', '')
  .action(async (name, options) => {
    const migrationManager = new MigrationManager();
    try {
      await migrationManager.createMigration(name, options.description);
    } catch (error) {
      console.error('Migration creation failed:', error);
      process.exit(1);
    } finally {
      await migrationManager.close();
    }
  });

program
  .command('rollback')
  .description('Rollback the last migration')
  .option('-e, --environment <env>', 'Target environment', 'development')
  .option('-b, --backup', 'Create backup before rollback', true)
  .option('-f, --force', 'Force rollback in production', false)
  .option('--dry-run', 'Preview changes without applying', false)
  .action(async (options) => {
    const migrationManager = new MigrationManager();
    try {
      await migrationManager.initializeForEnvironment(options.environment);
      await migrationManager.rollbackLastMigration({
        environment: options.environment,
        backup: options.backup,
        force: options.force,
        verbose: true,
        dryRun: options.dryRun,
      });
    } catch (error) {
      console.error('Migration rollback failed:', error);
      process.exit(1);
    } finally {
      await migrationManager.close();
    }
  });

program
  .command('reset')
  .description('Reset the entire database')
  .option('-e, --environment <env>', 'Target environment', 'development')
  .option('-b, --backup', 'Create backup before reset', true)
  .option('-f, --force', 'Force reset (required)', false)
  .option('--dry-run', 'Preview changes without applying', false)
  .action(async (options) => {
    const migrationManager = new MigrationManager();
    try {
      await migrationManager.initializeForEnvironment(options.environment);
      await migrationManager.resetDatabase({
        environment: options.environment,
        backup: options.backup,
        force: options.force,
        verbose: true,
        dryRun: options.dryRun,
      });
    } catch (error) {
      console.error('Database reset failed:', error);
      process.exit(1);
    } finally {
      await migrationManager.close();
    }
  });

program
  .command('status')
  .description('Check migration status')
  .option('-e, --environment <env>', 'Target environment', 'development')
  .action(async (options) => {
    const migrationManager = new MigrationManager();
    try {
      await migrationManager.initializeForEnvironment(options.environment);
      await migrationManager.checkMigrationStatus({
        environment: options.environment,
        backup: false,
        force: false,
        verbose: true,
        dryRun: false,
      });
    } catch (error) {
      console.error('Migration status check failed:', error);
      process.exit(1);
    } finally {
      await migrationManager.close();
    }
  });

// Run CLI if this file is executed directly
if (require.main === module) {
  program.parse(process.argv);
}

export default MigrationManager;