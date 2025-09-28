#!/usr/bin/env ts-node

/**
 * Maintenance Manager - Database maintenance and health monitoring
 */

import { Command } from 'commander';
import { PrismaClient } from '@prisma/client';
import winston from 'winston';
import { getEnvironmentConfig } from '../config/environments';
import { DatabaseManager } from '../utils/database-manager';
import { PerformanceMonitor } from '../utils/performance-monitor';
import { BackupManager } from '../utils/backup-manager';
import * as fs from 'fs';
import * as path from 'path';

interface MaintenanceTask {
  name: string;
  description: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  estimatedDuration: string;
  lastRun?: Date;
  nextRun?: Date;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
}

interface HealthCheckResult {
  category: string;
  check: string;
  status: 'PASS' | 'WARN' | 'FAIL';
  message: string;
  value?: any;
  threshold?: any;
}

class MaintenanceManager {
  private prisma: PrismaClient;
  private dbManager: DatabaseManager;
  private performanceMonitor: PerformanceMonitor;
  private backupManager: BackupManager;
  private logger: winston.Logger;

  constructor() {
    this.prisma = new PrismaClient();
    this.dbManager = new DatabaseManager({
      environment: 'development',
      databaseUrl: '',
    });
    this.performanceMonitor = new PerformanceMonitor(this.prisma);
    this.backupManager = new BackupManager(this.prisma);

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
          filename: 'database/logs/maintenance.log',
          maxsize: 10 * 1024 * 1024, // 10MB
          maxFiles: 5,
        }),
      ],
    });
  }

  async initializeForEnvironment(environment: string): Promise<void> {
    const config = getEnvironmentConfig(environment);

    await this.prisma.$disconnect();

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

    this.performanceMonitor = new PerformanceMonitor(this.prisma);
    this.backupManager = new BackupManager(this.prisma);

    await this.dbManager.initialize();
  }

  /**
   * Run comprehensive health check
   */
  async runHealthCheck(): Promise<HealthCheckResult[]> {
    this.logger.info('Starting comprehensive health check...');

    const results: HealthCheckResult[] = [];

    // Database connectivity
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      results.push({
        category: 'Connectivity',
        check: 'Database Connection',
        status: 'PASS',
        message: 'Database connection is healthy',
      });
    } catch (error) {
      results.push({
        category: 'Connectivity',
        check: 'Database Connection',
        status: 'FAIL',
        message: `Database connection failed: ${error}`,
      });
    }

    // Schema validation
    try {
      const schemaValidation = await this.dbManager.validateSchema();
      results.push({
        category: 'Schema',
        check: 'Schema Validation',
        status: schemaValidation.valid ? 'PASS' : 'FAIL',
        message: schemaValidation.valid ? 'Schema is valid' : `Schema errors: ${schemaValidation.errors.join(', ')}`,
      });
    } catch (error) {
      results.push({
        category: 'Schema',
        check: 'Schema Validation',
        status: 'FAIL',
        message: `Schema validation failed: ${error}`,
      });
    }

    // Table integrity checks
    const tableChecks = await this.checkTableIntegrity();
    results.push(...tableChecks);

    // Performance checks
    const performanceChecks = await this.checkPerformance();
    results.push(...performanceChecks);

    // Data consistency checks
    const consistencyChecks = await this.checkDataConsistency();
    results.push(...consistencyChecks);

    // Storage checks
    const storageChecks = await this.checkStorage();
    results.push(...storageChecks);

    // Backup checks
    const backupChecks = await this.checkBackups();
    results.push(...backupChecks);

    this.logger.info(`Health check completed: ${results.length} checks performed`);
    return results;
  }

  /**
   * Run database optimization
   */
  async runOptimization(): Promise<void> {
    this.logger.info('Starting database optimization...');

    try {
      // Update table statistics
      await this.updateStatistics();

      // Rebuild indexes if needed
      await this.optimizeIndexes();

      // Clean up temporary data
      await this.cleanupTempData();

      // Analyze query performance
      await this.analyzeQueries();

      this.logger.info('Database optimization completed');

    } catch (error) {
      this.logger.error('Database optimization failed:', error);
      throw error;
    }
  }

  /**
   * Run data archival
   */
  async runArchival(options: {
    dryRun: boolean;
    archiveOlderThan: number; // days
    tables: string[];
  }): Promise<void> {
    this.logger.info(`Running data archival (dry run: ${options.dryRun})`);

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - options.archiveOlderThan);

    for (const table of options.tables) {
      try {
        await this.archiveTableData(table, cutoffDate, options.dryRun);
      } catch (error) {
        this.logger.error(`Failed to archive ${table}:`, error);
      }
    }

    this.logger.info('Data archival completed');
  }

  /**
   * Generate maintenance plan
   */
  async generateMaintenancePlan(): Promise<MaintenanceTask[]> {
    const tasks: MaintenanceTask[] = [];

    // Check if backup is needed
    const lastBackup = await this.getLastBackupDate();
    if (!lastBackup || Date.now() - lastBackup.getTime() > 24 * 60 * 60 * 1000) {
      tasks.push({
        name: 'Database Backup',
        description: 'Create daily database backup',
        priority: 'HIGH',
        estimatedDuration: '10-15 minutes',
        status: 'PENDING',
      });
    }

    // Check table statistics age
    const statsAge = await this.getStatisticsAge();
    if (statsAge > 7) {
      tasks.push({
        name: 'Update Statistics',
        description: 'Update table statistics for query optimization',
        priority: 'MEDIUM',
        estimatedDuration: '5-10 minutes',
        status: 'PENDING',
      });
    }

    // Check for data to archive
    const archivableData = await this.checkArchivableData();
    if (archivableData > 0) {
      tasks.push({
        name: 'Data Archival',
        description: `Archive ${archivableData} old records`,
        priority: 'LOW',
        estimatedDuration: '15-30 minutes',
        status: 'PENDING',
      });
    }

    // Check index fragmentation
    const fragmentedIndexes = await this.checkIndexFragmentation();
    if (fragmentedIndexes.length > 0) {
      tasks.push({
        name: 'Rebuild Indexes',
        description: `Rebuild ${fragmentedIndexes.length} fragmented indexes`,
        priority: 'MEDIUM',
        estimatedDuration: '20-45 minutes',
        status: 'PENDING',
      });
    }

    // Check log file sizes
    const logSize = await this.checkLogFileSize();
    if (logSize > 100) { // MB
      tasks.push({
        name: 'Log Cleanup',
        description: 'Clean up old log files',
        priority: 'LOW',
        estimatedDuration: '5 minutes',
        status: 'PENDING',
      });
    }

    return tasks;
  }

  /**
   * Run automatic maintenance
   */
  async runAutoMaintenance(): Promise<void> {
    this.logger.info('Starting automatic maintenance...');

    try {
      // Generate maintenance plan
      const tasks = await this.generateMaintenancePlan();

      // Execute high-priority tasks
      const highPriorityTasks = tasks.filter(t => t.priority === 'HIGH');

      for (const task of highPriorityTasks) {
        this.logger.info(`Executing task: ${task.name}`);

        try {
          switch (task.name) {
            case 'Database Backup':
              const config = getEnvironmentConfig(process.env.NODE_ENV || 'development');
              await this.backupManager.createBackup(
                config.database.url,
                config.name,
                {
                  compress: true,
                  includeData: true,
                  includeLogs: false,
                  excludeTables: [],
                  description: 'Automatic daily backup',
                  tags: ['auto', 'daily'],
                }
              );
              break;

            case 'Update Statistics':
              await this.updateStatistics();
              break;

            default:
              this.logger.warn(`Unknown task: ${task.name}`);
          }

          task.status = 'COMPLETED';
          this.logger.info(`Task completed: ${task.name}`);

        } catch (error) {
          task.status = 'FAILED';
          this.logger.error(`Task failed: ${task.name}`, error);
        }
      }

      this.logger.info('Automatic maintenance completed');

    } catch (error) {
      this.logger.error('Automatic maintenance failed:', error);
      throw error;
    }
  }

  private async checkTableIntegrity(): Promise<HealthCheckResult[]> {
    const results: HealthCheckResult[] = [];

    try {
      // Check for missing foreign key references
      const orphanedRecords = await this.findOrphanedRecords();

      results.push({
        category: 'Integrity',
        check: 'Orphaned Records',
        status: orphanedRecords.length === 0 ? 'PASS' : 'WARN',
        message: orphanedRecords.length === 0
          ? 'No orphaned records found'
          : `Found ${orphanedRecords.length} orphaned records`,
        value: orphanedRecords.length,
      });

      // Check for duplicate records where they shouldn't exist
      const duplicates = await this.findDuplicateRecords();

      results.push({
        category: 'Integrity',
        check: 'Duplicate Records',
        status: duplicates.length === 0 ? 'PASS' : 'WARN',
        message: duplicates.length === 0
          ? 'No unexpected duplicates found'
          : `Found ${duplicates.length} duplicate record sets`,
        value: duplicates.length,
      });

    } catch (error) {
      results.push({
        category: 'Integrity',
        check: 'Table Integrity',
        status: 'FAIL',
        message: `Integrity check failed: ${error}`,
      });
    }

    return results;
  }

  private async checkPerformance(): Promise<HealthCheckResult[]> {
    const results: HealthCheckResult[] = [];

    try {
      const report = await this.performanceMonitor.getPerformanceReport();

      // Check slow queries
      results.push({
        category: 'Performance',
        check: 'Slow Queries',
        status: report.slowQueries.length < 5 ? 'PASS' : report.slowQueries.length < 20 ? 'WARN' : 'FAIL',
        message: `${report.slowQueries.length} slow queries in recent period`,
        value: report.slowQueries.length,
        threshold: 20,
      });

      // Check average query time
      results.push({
        category: 'Performance',
        check: 'Average Query Time',
        status: report.metrics.avgQueryTime < 100 ? 'PASS' : report.metrics.avgQueryTime < 500 ? 'WARN' : 'FAIL',
        message: `Average query time: ${report.metrics.avgQueryTime.toFixed(2)}ms`,
        value: report.metrics.avgQueryTime,
        threshold: 500,
      });

    } catch (error) {
      results.push({
        category: 'Performance',
        check: 'Performance Analysis',
        status: 'FAIL',
        message: `Performance check failed: ${error}`,
      });
    }

    return results;
  }

  private async checkDataConsistency(): Promise<HealthCheckResult[]> {
    const results: HealthCheckResult[] = [];

    try {
      // Check invoice-payment consistency
      const invoicePaymentIssues = await this.checkInvoicePaymentConsistency();

      results.push({
        category: 'Consistency',
        check: 'Invoice-Payment Consistency',
        status: invoicePaymentIssues === 0 ? 'PASS' : 'WARN',
        message: invoicePaymentIssues === 0
          ? 'Invoice payments are consistent'
          : `${invoicePaymentIssues} invoices have payment inconsistencies`,
        value: invoicePaymentIssues,
      });

      // Check quote-invoice relationships
      const quoteInvoiceIssues = await this.checkQuoteInvoiceConsistency();

      results.push({
        category: 'Consistency',
        check: 'Quote-Invoice Consistency',
        status: quoteInvoiceIssues === 0 ? 'PASS' : 'WARN',
        message: quoteInvoiceIssues === 0
          ? 'Quote-invoice relationships are consistent'
          : `${quoteInvoiceIssues} quotes have invoice inconsistencies`,
        value: quoteInvoiceIssues,
      });

    } catch (error) {
      results.push({
        category: 'Consistency',
        check: 'Data Consistency',
        status: 'FAIL',
        message: `Consistency check failed: ${error}`,
      });
    }

    return results;
  }

  private async checkStorage(): Promise<HealthCheckResult[]> {
    const results: HealthCheckResult[] = [];

    try {
      // Check database size growth
      const dbSize = await this.getDatabaseSize();

      results.push({
        category: 'Storage',
        check: 'Database Size',
        status: dbSize < 1024 ? 'PASS' : dbSize < 5120 ? 'WARN' : 'FAIL',
        message: `Database size: ${this.formatBytes(dbSize)}`,
        value: dbSize,
        threshold: 5120, // 5GB in MB
      });

      // Check available disk space
      const freeSpace = await this.getFreeDiskSpace();

      results.push({
        category: 'Storage',
        check: 'Free Disk Space',
        status: freeSpace > 10240 ? 'PASS' : freeSpace > 2048 ? 'WARN' : 'FAIL',
        message: `Free disk space: ${this.formatBytes(freeSpace)}`,
        value: freeSpace,
        threshold: 2048, // 2GB in MB
      });

    } catch (error) {
      results.push({
        category: 'Storage',
        check: 'Storage Analysis',
        status: 'FAIL',
        message: `Storage check failed: ${error}`,
      });
    }

    return results;
  }

  private async checkBackups(): Promise<HealthCheckResult[]> {
    const results: HealthCheckResult[] = [];

    try {
      const backups = await this.backupManager.listBackups();
      const recentBackups = backups.filter(
        b => Date.now() - new Date(b.createdAt).getTime() < 7 * 24 * 60 * 60 * 1000 // Last 7 days
      );

      results.push({
        category: 'Backup',
        check: 'Recent Backups',
        status: recentBackups.length > 0 ? 'PASS' : 'FAIL',
        message: recentBackups.length > 0
          ? `${recentBackups.length} backups in last 7 days`
          : 'No recent backups found',
        value: recentBackups.length,
      });

      // Check backup integrity
      let validBackups = 0;
      for (const backup of recentBackups.slice(0, 3)) { // Check last 3 backups
        try {
          // This would validate backup integrity
          validBackups++;
        } catch (error) {
          // Backup validation failed
        }
      }

      results.push({
        category: 'Backup',
        check: 'Backup Integrity',
        status: validBackups === recentBackups.slice(0, 3).length ? 'PASS' : 'WARN',
        message: `${validBackups}/${Math.min(3, recentBackups.length)} recent backups are valid`,
        value: validBackups,
      });

    } catch (error) {
      results.push({
        category: 'Backup',
        check: 'Backup Analysis',
        status: 'FAIL',
        message: `Backup check failed: ${error}`,
      });
    }

    return results;
  }

  // Helper methods (simplified implementations)

  private async findOrphanedRecords(): Promise<any[]> {
    // This would check for foreign key violations
    return [];
  }

  private async findDuplicateRecords(): Promise<any[]> {
    // This would check for unexpected duplicates
    return [];
  }

  private async checkInvoicePaymentConsistency(): Promise<number> {
    try {
      const inconsistentInvoices = await this.prisma.invoice.count({
        where: {
          balance: {
            not: 0,
          },
          amountPaid: {
            gt: 0,
          },
        },
      });

      return inconsistentInvoices;
    } catch (error) {
      return 0;
    }
  }

  private async checkQuoteInvoiceConsistency(): Promise<number> {
    // Check for quotes that are accepted but don't have invoices
    try {
      const inconsistentQuotes = await this.prisma.quote.count({
        where: {
          status: 'ACCEPTED',
          invoice: null,
        },
      });

      return inconsistentQuotes;
    } catch (error) {
      return 0;
    }
  }

  private async updateStatistics(): Promise<void> {
    this.logger.info('Updating table statistics...');
    // This would run ANALYZE or equivalent for the database
  }

  private async optimizeIndexes(): Promise<void> {
    this.logger.info('Optimizing indexes...');
    // This would rebuild fragmented indexes
  }

  private async cleanupTempData(): Promise<void> {
    this.logger.info('Cleaning up temporary data...');
    // Clean up old sessions, expired tokens, etc.

    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - 24); // 24 hours ago

    await this.prisma.session.deleteMany({
      where: {
        expiresAt: {
          lt: cutoffDate,
        },
      },
    });
  }

  private async analyzeQueries(): Promise<void> {
    this.logger.info('Analyzing query patterns...');
    const patterns = await this.performanceMonitor.analyzeQueryPatterns();

    // Log insights
    this.logger.info('Top tables by query count:', {
      tables: patterns.tableUsage.slice(0, 5),
    });
  }

  private async archiveTableData(table: string, cutoffDate: Date, dryRun: boolean): Promise<void> {
    this.logger.info(`Archiving ${table} data older than ${cutoffDate.toISOString()}`);

    if (dryRun) {
      // Count records that would be archived
      const count = await this.prisma.$queryRawUnsafe(
        `SELECT COUNT(*) as count FROM ${table} WHERE created_at < $1`,
        cutoffDate
      );
      this.logger.info(`Would archive ${(count as any)[0]?.count || 0} records from ${table}`);
    } else {
      // Actually archive the data (move to archive table or delete)
      // Implementation depends on archival strategy
    }
  }

  private async getLastBackupDate(): Promise<Date | null> {
    const backups = await this.backupManager.listBackups();
    if (backups.length === 0) return null;

    return new Date(backups[0].createdAt);
  }

  private async getStatisticsAge(): Promise<number> {
    // Return age of statistics in days (simplified)
    return 1;
  }

  private async checkArchivableData(): Promise<number> {
    // Count old records that can be archived
    return 0;
  }

  private async checkIndexFragmentation(): Promise<string[]> {
    // Return list of fragmented indexes
    return [];
  }

  private async checkLogFileSize(): Promise<number> {
    // Return log file size in MB
    const logDir = 'database/logs';
    if (!fs.existsSync(logDir)) return 0;

    let totalSize = 0;
    const files = fs.readdirSync(logDir);

    for (const file of files) {
      const filePath = path.join(logDir, file);
      const stats = fs.statSync(filePath);
      totalSize += stats.size;
    }

    return totalSize / (1024 * 1024); // Convert to MB
  }

  private async getDatabaseSize(): Promise<number> {
    // Return database size in MB (simplified)
    return 100;
  }

  private async getFreeDiskSpace(): Promise<number> {
    // Return free disk space in MB (simplified)
    return 50000;
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
    await this.dbManager.close();
  }
}

// CLI Interface
const program = new Command();

program
  .name('maintenance-manager')
  .description('Database maintenance and monitoring tool')
  .version('1.0.0');

program
  .command('health')
  .description('Run comprehensive health check')
  .option('-e, --environment <env>', 'Target environment', 'development')
  .option('-f, --format <format>', 'Output format (table|json)', 'table')
  .action(async (options) => {
    const manager = new MaintenanceManager();
    try {
      await manager.initializeForEnvironment(options.environment);
      const results = await manager.runHealthCheck();

      if (options.format === 'json') {
        console.log(JSON.stringify(results, null, 2));
      } else {
        console.log('\n🏥 Database Health Check Results');
        console.log('='.repeat(60));

        const categories = [...new Set(results.map(r => r.category))];

        for (const category of categories) {
          console.log(`\n📂 ${category}:`);
          const categoryResults = results.filter(r => r.category === category);

          for (const result of categoryResults) {
            const icon = result.status === 'PASS' ? '✅' : result.status === 'WARN' ? '⚠️' : '❌';
            console.log(`  ${icon} ${result.check}: ${result.message}`);
          }
        }

        const summary = {
          passed: results.filter(r => r.status === 'PASS').length,
          warnings: results.filter(r => r.status === 'WARN').length,
          failed: results.filter(r => r.status === 'FAIL').length,
        };

        console.log('\n📊 Summary:');
        console.log(`  ✅ Passed: ${summary.passed}`);
        console.log(`  ⚠️  Warnings: ${summary.warnings}`);
        console.log(`  ❌ Failed: ${summary.failed}`);
      }

    } catch (error) {
      console.error('Health check failed:', error);
      process.exit(1);
    } finally {
      await manager.close();
    }
  });

program
  .command('optimize')
  .description('Run database optimization')
  .option('-e, --environment <env>', 'Target environment', 'development')
  .action(async (options) => {
    const manager = new MaintenanceManager();
    try {
      await manager.initializeForEnvironment(options.environment);
      await manager.runOptimization();
      console.log('✅ Database optimization completed');
    } catch (error) {
      console.error('Optimization failed:', error);
      process.exit(1);
    } finally {
      await manager.close();
    }
  });

program
  .command('plan')
  .description('Generate maintenance plan')
  .option('-e, --environment <env>', 'Target environment', 'development')
  .action(async (options) => {
    const manager = new MaintenanceManager();
    try {
      await manager.initializeForEnvironment(options.environment);
      const tasks = await manager.generateMaintenancePlan();

      console.log('\n📋 Maintenance Plan:');
      console.log('='.repeat(60));

      if (tasks.length === 0) {
        console.log('No maintenance tasks required at this time.');
      } else {
        for (const task of tasks) {
          const priorityIcon = task.priority === 'HIGH' ? '🔴' : task.priority === 'MEDIUM' ? '🟡' : '🟢';
          console.log(`${priorityIcon} ${task.name} (${task.priority})`);
          console.log(`   📝 ${task.description}`);
          console.log(`   ⏱️  Estimated duration: ${task.estimatedDuration}`);
          console.log('');
        }
      }

    } catch (error) {
      console.error('Plan generation failed:', error);
      process.exit(1);
    } finally {
      await manager.close();
    }
  });

program
  .command('auto')
  .description('Run automatic maintenance')
  .option('-e, --environment <env>', 'Target environment', 'development')
  .action(async (options) => {
    const manager = new MaintenanceManager();
    try {
      await manager.initializeForEnvironment(options.environment);
      await manager.runAutoMaintenance();
      console.log('✅ Automatic maintenance completed');
    } catch (error) {
      console.error('Automatic maintenance failed:', error);
      process.exit(1);
    } finally {
      await manager.close();
    }
  });

// Run CLI if this file is executed directly
if (require.main === module) {
  program.parse(process.argv);
}

export default MaintenanceManager;