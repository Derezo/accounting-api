/**
 * Database Manager - Core utility for database operations
 * Handles connections, migrations, seeding, and maintenance
 */

import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import winston from 'winston';

export interface DatabaseConfig {
  environment: 'development' | 'testing' | 'staging' | 'production';
  databaseUrl: string;
  shadowDatabaseUrl?: string;
  maxConnections?: number;
  timeout?: number;
  logging?: boolean;
}

export interface MigrationInfo {
  id: string;
  name: string;
  appliedAt: Date;
  checksum: string;
}

export interface BackupInfo {
  filename: string;
  size: number;
  createdAt: Date;
  environment: string;
  compressed: boolean;
}

export class DatabaseManager {
  private prisma: PrismaClient;
  private config: DatabaseConfig;
  private logger: winston.Logger;

  constructor(config: DatabaseConfig) {
    this.config = config;
    this.prisma = new PrismaClient({
      datasources: {
        db: {
          url: config.databaseUrl,
        },
      },
      log: config.logging ? ['query', 'info', 'warn', 'error'] : [],
    });

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
          filename: `database/logs/database-${this.config.environment}.log`,
        }),
      ],
    });
  }

  /**
   * Initialize database connection and verify connectivity
   */
  async initialize(): Promise<void> {
    try {
      await this.prisma.$connect();
      await this.prisma.$queryRaw`SELECT 1`;
      this.logger.info('Database connection established successfully');
    } catch (error) {
      this.logger.error('Failed to connect to database:', error);
      throw new Error(`Database connection failed: ${error}`);
    }
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    await this.prisma.$disconnect();
    this.logger.info('Database connection closed');
  }

  /**
   * Run Prisma migrations
   */
  async migrate(preview: boolean = false): Promise<void> {
    try {
      const command = preview ? 'prisma migrate diff --preview-feature' : 'prisma migrate deploy';
      this.logger.info(`Running migrations: ${command}`);

      const result = execSync(command, {
        encoding: 'utf8',
        cwd: process.cwd(),
        env: { ...process.env, DATABASE_URL: this.config.databaseUrl }
      });

      this.logger.info('Migrations completed successfully');
      this.logger.debug(result);
    } catch (error) {
      this.logger.error('Migration failed:', error);
      throw new Error(`Migration failed: ${error}`);
    }
  }

  /**
   * Reset database (dangerous - only for development/testing)
   */
  async reset(): Promise<void> {
    if (this.config.environment === 'production') {
      throw new Error('Database reset is not allowed in production environment');
    }

    try {
      this.logger.warn(`Resetting ${this.config.environment} database`);

      execSync('prisma migrate reset --force', {
        encoding: 'utf8',
        cwd: process.cwd(),
        env: { ...process.env, DATABASE_URL: this.config.databaseUrl }
      });

      this.logger.info('Database reset completed');
    } catch (error) {
      this.logger.error('Database reset failed:', error);
      throw new Error(`Database reset failed: ${error}`);
    }
  }

  /**
   * Create database backup
   */
  async createBackup(filename?: string): Promise<BackupInfo> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFilename = filename || `backup-${this.config.environment}-${timestamp}.sql`;
    const backupPath = path.join('database/backups', backupFilename);

    try {
      this.logger.info(`Creating backup: ${backupFilename}`);

      // Ensure backup directory exists
      fs.mkdirSync(path.dirname(backupPath), { recursive: true });

      // Create backup using pg_dump for PostgreSQL or sqlite3 for SQLite
      let command: string;
      if (this.config.databaseUrl.startsWith('postgresql://')) {
        command = `pg_dump "${this.config.databaseUrl}" > "${backupPath}"`;
      } else if (this.config.databaseUrl.startsWith('file:')) {
        const dbPath = this.config.databaseUrl.replace('file:', '');
        command = `sqlite3 "${dbPath}" .dump > "${backupPath}"`;
      } else {
        throw new Error('Unsupported database type for backup');
      }

      execSync(command, { encoding: 'utf8' });

      // Get file stats
      const stats = fs.statSync(backupPath);

      const backupInfo: BackupInfo = {
        filename: backupFilename,
        size: stats.size,
        createdAt: new Date(),
        environment: this.config.environment,
        compressed: false,
      };

      this.logger.info(`Backup created successfully: ${backupFilename} (${stats.size} bytes)`);
      return backupInfo;
    } catch (error) {
      this.logger.error('Backup creation failed:', error);
      throw new Error(`Backup creation failed: ${error}`);
    }
  }

  /**
   * Restore database from backup
   */
  async restoreBackup(backupFilename: string): Promise<void> {
    if (this.config.environment === 'production') {
      throw new Error('Direct restore is not allowed in production environment');
    }

    const backupPath = path.join('database/backups', backupFilename);

    if (!fs.existsSync(backupPath)) {
      throw new Error(`Backup file not found: ${backupFilename}`);
    }

    try {
      this.logger.warn(`Restoring database from backup: ${backupFilename}`);

      // Restore using psql for PostgreSQL or sqlite3 for SQLite
      let command: string;
      if (this.config.databaseUrl.startsWith('postgresql://')) {
        command = `psql "${this.config.databaseUrl}" < "${backupPath}"`;
      } else if (this.config.databaseUrl.startsWith('file:')) {
        const dbPath = this.config.databaseUrl.replace('file:', '');
        command = `sqlite3 "${dbPath}" < "${backupPath}"`;
      } else {
        throw new Error('Unsupported database type for restore');
      }

      execSync(command, { encoding: 'utf8' });

      this.logger.info(`Database restored successfully from: ${backupFilename}`);
    } catch (error) {
      this.logger.error('Database restore failed:', error);
      throw new Error(`Database restore failed: ${error}`);
    }
  }

  /**
   * Get database health status
   */
  async getHealthStatus(): Promise<{
    connected: boolean;
    version: string;
    migrations: MigrationInfo[];
    tableCount: number;
    size: string;
  }> {
    try {
      // Check connection
      await this.prisma.$queryRaw`SELECT 1`;

      // Get database version
      const versionResult = await this.prisma.$queryRaw<[{ version: string }]>`
        SELECT version() as version
      `;
      const version = versionResult[0]?.version || 'Unknown';

      // Get migrations (this is a simplified version - in real implementation,
      // you'd query the _prisma_migrations table)
      const migrations: MigrationInfo[] = [];

      // Get table count
      const tableCountResult = await this.prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) as count
        FROM information_schema.tables
        WHERE table_schema = 'public'
      `;
      const tableCount = Number(tableCountResult[0]?.count || 0);

      // Database size (simplified)
      const size = 'Unknown';

      return {
        connected: true,
        version,
        migrations,
        tableCount,
        size,
      };
    } catch (error) {
      this.logger.error('Health check failed:', error);
      return {
        connected: false,
        version: 'Unknown',
        migrations: [],
        tableCount: 0,
        size: 'Unknown',
      };
    }
  }

  /**
   * Execute raw SQL query
   */
  async executeQuery(sql: string): Promise<any> {
    try {
      this.logger.debug(`Executing query: ${sql}`);
      const result = await this.prisma.$queryRawUnsafe(sql);
      return result;
    } catch (error) {
      this.logger.error('Query execution failed:', error);
      throw new Error(`Query execution failed: ${error}`);
    }
  }

  /**
   * Get Prisma client instance
   */
  getPrismaClient(): PrismaClient {
    return this.prisma;
  }

  /**
   * Validate database schema
   */
  async validateSchema(): Promise<{ valid: boolean; errors: string[] }> {
    try {
      // Run prisma validate
      execSync('prisma validate', {
        encoding: 'utf8',
        cwd: process.cwd(),
      });

      return { valid: true, errors: [] };
    } catch (error) {
      return {
        valid: false,
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  /**
   * Generate database documentation
   */
  async generateDocumentation(): Promise<void> {
    try {
      this.logger.info('Generating database documentation');

      // This would use a tool like prisma-docs or custom documentation generator
      execSync('prisma generate', {
        encoding: 'utf8',
        cwd: process.cwd(),
      });

      this.logger.info('Database documentation generated');
    } catch (error) {
      this.logger.error('Documentation generation failed:', error);
      throw new Error(`Documentation generation failed: ${error}`);
    }
  }
}

export default DatabaseManager;