/**
 * Migration Utilities - Helper functions for database migrations
 */

import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import winston from 'winston';

export interface MigrationStep {
  name: string;
  sql: string;
  rollback?: string;
  checksum: string;
}

export interface MigrationPlan {
  id: string;
  name: string;
  description: string;
  steps: MigrationStep[];
  dependencies: string[];
  createdAt: Date;
}

export class MigrationUtils {
  private prisma: PrismaClient;
  private logger: winston.Logger;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
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
      ],
    });
  }

  /**
   * Create a new migration file
   */
  createMigration(name: string, description: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const migrationId = `${timestamp}_${name.toLowerCase().replace(/\s+/g, '_')}`;
    const migrationDir = path.join('database/migrations', migrationId);

    // Create migration directory
    fs.mkdirSync(migrationDir, { recursive: true });

    // Create migration.sql file
    const migrationContent = `-- Migration: ${name}
-- Description: ${description}
-- Created: ${new Date().toISOString()}

-- Add your migration SQL here
-- Example:
-- CREATE TABLE IF NOT EXISTS example_table (
--   id VARCHAR PRIMARY KEY,
--   name VARCHAR NOT NULL,
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
-- );

-- Add indexes
-- CREATE INDEX IF NOT EXISTS idx_example_name ON example_table(name);
`;

    fs.writeFileSync(
      path.join(migrationDir, 'migration.sql'),
      migrationContent
    );

    // Create rollback.sql file
    const rollbackContent = `-- Rollback for: ${name}
-- Description: ${description}
-- Created: ${new Date().toISOString()}

-- Add your rollback SQL here
-- Example:
-- DROP INDEX IF EXISTS idx_example_name;
-- DROP TABLE IF EXISTS example_table;
`;

    fs.writeFileSync(
      path.join(migrationDir, 'rollback.sql'),
      rollbackContent
    );

    // Create metadata.json file
    const metadata = {
      id: migrationId,
      name,
      description,
      createdAt: new Date().toISOString(),
      dependencies: [],
      checksum: '',
    };

    fs.writeFileSync(
      path.join(migrationDir, 'metadata.json'),
      JSON.stringify(metadata, null, 2)
    );

    this.logger.info(`Migration created: ${migrationId}`);
    return migrationId;
  }

  /**
   * Calculate checksum for migration file
   */
  calculateChecksum(filePath: string): string {
    const content = fs.readFileSync(filePath, 'utf8');
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Validate migration integrity
   */
  validateMigration(migrationPath: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    try {
      // Check if required files exist
      const requiredFiles = ['migration.sql', 'metadata.json'];
      for (const file of requiredFiles) {
        const filePath = path.join(migrationPath, file);
        if (!fs.existsSync(filePath)) {
          errors.push(`Missing required file: ${file}`);
        }
      }

      // Validate metadata
      const metadataPath = path.join(migrationPath, 'metadata.json');
      if (fs.existsSync(metadataPath)) {
        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));

        if (!metadata.id) errors.push('Missing migration ID in metadata');
        if (!metadata.name) errors.push('Missing migration name in metadata');
        if (!metadata.createdAt) errors.push('Missing creation date in metadata');
      }

      // Validate SQL syntax (basic check)
      const migrationSqlPath = path.join(migrationPath, 'migration.sql');
      if (fs.existsSync(migrationSqlPath)) {
        const sql = fs.readFileSync(migrationSqlPath, 'utf8');
        if (sql.trim().length === 0) {
          errors.push('Migration SQL file is empty');
        }
      }

      return { valid: errors.length === 0, errors };
    } catch (error) {
      errors.push(`Validation error: ${error}`);
      return { valid: false, errors };
    }
  }

  /**
   * Get pending migrations
   */
  async getPendingMigrations(): Promise<string[]> {
    try {
      // Get all migration directories
      const migrationsDir = 'database/migrations';
      if (!fs.existsSync(migrationsDir)) {
        return [];
      }

      const allMigrations = fs.readdirSync(migrationsDir)
        .filter(item => fs.statSync(path.join(migrationsDir, item)).isDirectory())
        .sort();

      // Get applied migrations from database
      // Note: This assumes you have a migrations tracking table
      // In a real implementation, you'd query your migration tracking table
      const appliedMigrations: string[] = [];

      // Return migrations that haven't been applied
      return allMigrations.filter(migration => !appliedMigrations.includes(migration));
    } catch (error) {
      this.logger.error('Failed to get pending migrations:', error);
      return [];
    }
  }

  /**
   * Apply a single migration
   */
  async applyMigration(migrationId: string): Promise<void> {
    const migrationPath = path.join('database/migrations', migrationId);

    // Validate migration
    const validation = this.validateMigration(migrationPath);
    if (!validation.valid) {
      throw new Error(`Migration validation failed: ${validation.errors.join(', ')}`);
    }

    try {
      this.logger.info(`Applying migration: ${migrationId}`);

      // Read migration SQL
      const migrationSql = fs.readFileSync(
        path.join(migrationPath, 'migration.sql'),
        'utf8'
      );

      // Execute migration within a transaction
      await this.prisma.$transaction(async (prisma) => {
        // Split SQL into individual statements and execute
        const statements = migrationSql
          .split(';')
          .map(stmt => stmt.trim())
          .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

        for (const statement of statements) {
          await prisma.$executeRawUnsafe(statement);
        }

        // Record migration in tracking table
        // Note: This assumes you have a migration tracking table
        // await prisma.migration.create({
        //   data: {
        //     id: migrationId,
        //     appliedAt: new Date(),
        //     checksum: this.calculateChecksum(path.join(migrationPath, 'migration.sql')),
        //   },
        // });
      });

      this.logger.info(`Migration applied successfully: ${migrationId}`);
    } catch (error) {
      this.logger.error(`Migration failed: ${migrationId}`, error);
      throw new Error(`Migration failed: ${error}`);
    }
  }

  /**
   * Rollback a migration
   */
  async rollbackMigration(migrationId: string): Promise<void> {
    const migrationPath = path.join('database/migrations', migrationId);
    const rollbackPath = path.join(migrationPath, 'rollback.sql');

    if (!fs.existsSync(rollbackPath)) {
      throw new Error(`Rollback file not found for migration: ${migrationId}`);
    }

    try {
      this.logger.warn(`Rolling back migration: ${migrationId}`);

      // Read rollback SQL
      const rollbackSql = fs.readFileSync(rollbackPath, 'utf8');

      // Execute rollback within a transaction
      await this.prisma.$transaction(async (prisma) => {
        // Split SQL into individual statements and execute
        const statements = rollbackSql
          .split(';')
          .map(stmt => stmt.trim())
          .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

        for (const statement of statements) {
          await prisma.$executeRawUnsafe(statement);
        }

        // Remove migration record from tracking table
        // await prisma.migration.delete({
        //   where: { id: migrationId },
        // });
      });

      this.logger.info(`Migration rolled back successfully: ${migrationId}`);
    } catch (error) {
      this.logger.error(`Rollback failed: ${migrationId}`, error);
      throw new Error(`Rollback failed: ${error}`);
    }
  }

  /**
   * Generate migration from schema changes
   */
  generateMigrationFromDiff(name: string): string {
    try {
      this.logger.info(`Generating migration: ${name}`);

      // Use Prisma migrate dev to generate migration
      const result = execSync(`prisma migrate dev --name "${name}" --create-only`, {
        encoding: 'utf8',
        cwd: process.cwd(),
      });

      this.logger.info('Migration generated successfully');
      this.logger.debug(result);

      // Extract migration ID from output
      const lines = result.split('\n');
      const migrationLine = lines.find(line => line.includes('Created migration'));
      const migrationId = migrationLine?.split(' ').pop() || name;

      return migrationId;
    } catch (error) {
      this.logger.error('Migration generation failed:', error);
      throw new Error(`Migration generation failed: ${error}`);
    }
  }

  /**
   * Create data migration for existing records
   */
  async createDataMigration(
    name: string,
    description: string,
    migrationFunction: () => Promise<void>
  ): Promise<void> {
    const migrationId = this.createMigration(name, description);

    try {
      this.logger.info(`Executing data migration: ${name}`);

      await this.prisma.$transaction(async (prisma) => {
        await migrationFunction();
      });

      this.logger.info(`Data migration completed: ${name}`);
    } catch (error) {
      this.logger.error(`Data migration failed: ${name}`, error);
      throw new Error(`Data migration failed: ${error}`);
    }
  }

  /**
   * Backup database before migration
   */
  async createPreMigrationBackup(migrationId: string): Promise<string> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFilename = `pre-migration-${migrationId}-${timestamp}.sql`;

      this.logger.info(`Creating pre-migration backup: ${backupFilename}`);

      // This would use the DatabaseManager to create a backup
      // For now, we'll just return the filename
      return backupFilename;
    } catch (error) {
      this.logger.error('Pre-migration backup failed:', error);
      throw new Error(`Pre-migration backup failed: ${error}`);
    }
  }
}

export default MigrationUtils;