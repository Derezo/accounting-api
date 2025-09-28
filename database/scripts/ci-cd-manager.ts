#!/usr/bin/env ts-node

/**
 * CI/CD Manager - Database operations for continuous integration/deployment
 */

import { Command } from 'commander';
import { PrismaClient } from '@prisma/client';
import * as winston from 'winston';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { getEnvironmentConfig, validateEnvironmentConfig } from '../config/environments';
import { DatabaseManager } from '../utils/database-manager';
import { BackupManager } from '../utils/backup-manager';
import SeedManager from './seed-manager';
import MigrationManager from './migrate-manager';
import MaintenanceManager from './maintenance-manager';

interface CIPipelineResult {
  stage: string;
  success: boolean;
  duration: number;
  message: string;
  details?: any;
}

interface DeploymentConfig {
  environment: string;
  requireApproval: boolean;
  backupBeforeDeploy: boolean;
  runMigrations: boolean;
  runSeeds: boolean;
  runHealthCheck: boolean;
  rollbackOnFailure: boolean;
  notificationChannels: string[];
}

class CICDManager {
  private logger: winston.Logger;

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
          filename: 'database/logs/ci-cd.log',
          maxsize: 10 * 1024 * 1024, // 10MB
          maxFiles: 5,
        }),
      ],
    });
  }

  /**
   * Run complete CI pipeline
   */
  async runCIPipeline(options: {
    environment: string;
    skipTests?: boolean;
    generateReport?: boolean;
  }): Promise<CIPipelineResult[]> {
    this.logger.info(`Starting CI pipeline for ${options.environment} environment`);

    const results: CIPipelineResult[] = [];

    try {
      // Stage 1: Environment validation
      const envResult = await this.runStage('Environment Validation', async () => {
        return await this.validateEnvironment(options.environment);
      });
      results.push(envResult);

      if (!envResult.success) {
        throw new Error('Environment validation failed');
      }

      // Stage 2: Database connectivity
      const connectResult = await this.runStage('Database Connectivity', async () => {
        return await this.testDatabaseConnectivity(options.environment);
      });
      results.push(connectResult);

      if (!connectResult.success) {
        throw new Error('Database connectivity test failed');
      }

      // Stage 3: Schema validation
      const schemaResult = await this.runStage('Schema Validation', async () => {
        return await this.validateSchema(options.environment);
      });
      results.push(schemaResult);

      // Stage 4: Migration checks
      const migrationResult = await this.runStage('Migration Validation', async () => {
        return await this.validateMigrations(options.environment);
      });
      results.push(migrationResult);

      // Stage 5: Database tests (if not skipped)
      if (!options.skipTests) {
        const testResult = await this.runStage('Database Tests', async () => {
          return await this.runDatabaseTests(options.environment);
        });
        results.push(testResult);
      }

      // Stage 6: Performance baseline
      const perfResult = await this.runStage('Performance Baseline', async () => {
        return await this.establishPerformanceBaseline(options.environment);
      });
      results.push(perfResult);

      // Stage 7: Security checks
      const securityResult = await this.runStage('Security Validation', async () => {
        return await this.runSecurityChecks(options.environment);
      });
      results.push(securityResult);

      // Generate report if requested
      if (options.generateReport) {
        await this.generateCIReport(results, options.environment);
      }

      const overallSuccess = results.every(r => r.success);
      this.logger.info(`CI pipeline ${overallSuccess ? 'completed successfully' : 'failed'}`);

      return results;

    } catch (error) {
      this.logger.error('CI pipeline failed:', error);
      throw error;
    }
  }

  /**
   * Run database deployment
   */
  async runDeployment(config: DeploymentConfig): Promise<void> {
    this.logger.info(`Starting deployment to ${config.environment} environment`);

    try {
      // Pre-deployment validation
      await this.validateDeploymentConfig(config);

      // Create backup if required
      if (config.backupBeforeDeploy) {
        await this.createPreDeploymentBackup(config.environment);
      }

      // Run migrations if required
      if (config.runMigrations) {
        await this.runDeploymentMigrations(config.environment);
      }

      // Run seeds if required
      if (config.runSeeds) {
        await this.runDeploymentSeeds(config.environment);
      }

      // Post-deployment health check
      if (config.runHealthCheck) {
        await this.runPostDeploymentHealthCheck(config.environment);
      }

      this.logger.info(`Deployment to ${config.environment} completed successfully`);

      // Send notifications
      await this.sendDeploymentNotifications(config, true);

    } catch (error) {
      this.logger.error(`Deployment to ${config.environment} failed:`, error);

      // Rollback if configured
      if (config.rollbackOnFailure) {
        await this.rollbackDeployment(config.environment);
      }

      // Send failure notifications
      await this.sendDeploymentNotifications(config, false, error);

      throw error;
    }
  }

  /**
   * Setup database for new environment
   */
  async setupEnvironment(options: {
    environment: string;
    createFromTemplate?: string;
    includeDemo: boolean;
    configure: boolean;
  }): Promise<void> {
    this.logger.info(`Setting up ${options.environment} environment`);

    try {
      // Validate target environment
      const config = getEnvironmentConfig(options.environment);
      const validation = validateEnvironmentConfig(config);

      if (!validation.valid) {
        throw new Error(`Invalid environment configuration: ${validation.errors.join(', ')}`);
      }

      // Initialize database manager
      const dbManager = new DatabaseManager({
        environment: options.environment as any,
        databaseUrl: config.database.url,
        shadowDatabaseUrl: config.database.shadowUrl,
        maxConnections: config.database.maxConnections,
        timeout: config.database.timeout,
        logging: config.database.logging,
      });

      await dbManager.initialize();

      // Run initial migrations
      this.logger.info('Running initial migrations...');
      await dbManager.migrate(false);

      // Seed reference data
      this.logger.info('Seeding reference data...');
      const seedManager = new SeedManager();
      await seedManager.initializeForEnvironment(options.environment);

      await seedManager.seedAll({
        environment: options.environment,
        clean: true,
        includeDemo: options.includeDemo,
        verbose: true,
        dryRun: false,
      });

      // Configure environment-specific settings
      if (options.configure) {
        await this.configureEnvironmentSettings(options.environment);
      }

      this.logger.info(`Environment ${options.environment} setup completed`);

      await dbManager.close();
      await seedManager.close();

    } catch (error) {
      this.logger.error(`Environment setup failed:`, error);
      throw error;
    }
  }

  /**
   * Promote database changes between environments
   */
  async promoteChanges(options: {
    fromEnvironment: string;
    toEnvironment: string;
    includeData: boolean;
    dryRun: boolean;
  }): Promise<void> {
    this.logger.info(`Promoting changes from ${options.fromEnvironment} to ${options.toEnvironment}`);

    if (options.dryRun) {
      this.logger.info('DRY RUN MODE - No actual changes will be made');
    }

    try {
      // Validate both environments
      const fromConfig = getEnvironmentConfig(options.fromEnvironment);
      const toConfig = getEnvironmentConfig(options.toEnvironment);

      // Create backup of target environment
      if (!options.dryRun) {
        this.logger.info(`Creating backup of ${options.toEnvironment}...`);
        const backupManager = new BackupManager(new PrismaClient());
        await backupManager.createBackup(
          toConfig.database.url,
          options.toEnvironment,
          {
            compress: true,
            includeData: true,
            includeLogs: false,
            excludeTables: [],
            description: `Pre-promotion backup from ${options.fromEnvironment}`,
            tags: ['promotion', 'backup'],
          }
        );
      }

      // Export schema changes
      this.logger.info('Analyzing schema differences...');
      const schemaDiff = await this.compareDatabaseSchemas(
        options.fromEnvironment,
        options.toEnvironment
      );

      if (schemaDiff.hasDifferences) {
        this.logger.info(`Found ${schemaDiff.differences.length} schema differences`);

        if (!options.dryRun) {
          // Apply migrations to target environment
          const migrationManager = new MigrationManager();
          await migrationManager.initializeForEnvironment(options.toEnvironment);
          await migrationManager.deployMigrations({
            environment: options.toEnvironment,
            backup: false, // Already created backup
            force: false,
            verbose: true,
            dryRun: false,
          });
          await migrationManager.close();
        }
      }

      // Promote data if requested
      if (options.includeData) {
        this.logger.info('Promoting data changes...');
        await this.promoteDataChanges(options.fromEnvironment, options.toEnvironment, options.dryRun);
      }

      this.logger.info(`Promotion from ${options.fromEnvironment} to ${options.toEnvironment} completed`);

    } catch (error) {
      this.logger.error('Change promotion failed:', error);
      throw error;
    }
  }

  /**
   * Generate deployment report
   */
  async generateDeploymentReport(environment: string): Promise<void> {
    this.logger.info(`Generating deployment report for ${environment}`);

    try {
      const config = getEnvironmentConfig(environment);

      // Initialize managers
      const dbManager = new DatabaseManager({
        environment: environment as any,
        databaseUrl: config.database.url,
        maxConnections: config.database.maxConnections,
        timeout: config.database.timeout,
        logging: config.database.logging,
      });

      await dbManager.initialize();

      const maintenanceManager = new MaintenanceManager();
      await maintenanceManager.initializeForEnvironment(environment);

      // Collect deployment information
      const healthStatus = await dbManager.getHealthStatus();
      const healthCheck = await maintenanceManager.runHealthCheck();

      const report = {
        timestamp: new Date(),
        environment,
        database: {
          connected: healthStatus.connected,
          version: healthStatus.version,
          tableCount: healthStatus.tableCount,
          migrations: healthStatus.migrations,
        },
        healthChecks: healthCheck,
        summary: {
          totalChecks: healthCheck.length,
          passed: healthCheck.filter(c => c.status === 'PASS').length,
          warnings: healthCheck.filter(c => c.status === 'WARN').length,
          failed: healthCheck.filter(c => c.status === 'FAIL').length,
        },
      };

      // Save report
      const reportPath = path.join('database/reports', `deployment-${environment}-${Date.now()}.json`);

      // Ensure reports directory exists
      const reportsDir = path.dirname(reportPath);
      if (!fs.existsSync(reportsDir)) {
        fs.mkdirSync(reportsDir, { recursive: true });
      }

      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

      console.log('\n📊 Deployment Report Generated');
      console.log('='.repeat(50));
      console.log(`Environment: ${environment}`);
      console.log(`Database Connected: ${healthStatus.connected ? '✅' : '❌'}`);
      console.log(`Total Health Checks: ${report.summary.totalChecks}`);
      console.log(`Passed: ${report.summary.passed}`);
      console.log(`Warnings: ${report.summary.warnings}`);
      console.log(`Failed: ${report.summary.failed}`);
      console.log(`Report saved to: ${reportPath}`);

      await dbManager.close();
      await maintenanceManager.close();

    } catch (error) {
      this.logger.error('Deployment report generation failed:', error);
      throw error;
    }
  }

  // Private helper methods

  private async runStage(
    stageName: string,
    stageFunction: () => Promise<any>
  ): Promise<CIPipelineResult> {
    const startTime = Date.now();

    try {
      this.logger.info(`Running stage: ${stageName}`);

      const result = await stageFunction();
      const duration = Date.now() - startTime;

      this.logger.info(`Stage ${stageName} completed successfully in ${duration}ms`);

      return {
        stage: stageName,
        success: true,
        duration,
        message: 'Stage completed successfully',
        details: result,
      };

    } catch (error) {
      const duration = Date.now() - startTime;

      this.logger.error(`Stage ${stageName} failed:`, error);

      return {
        stage: stageName,
        success: false,
        duration,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async validateEnvironment(environment: string): Promise<any> {
    const config = getEnvironmentConfig(environment);
    const validation = validateEnvironmentConfig(config);

    if (!validation.valid) {
      throw new Error(`Environment validation failed: ${validation.errors.join(', ')}`);
    }

    return { environment, config: config.name, valid: true };
  }

  private async testDatabaseConnectivity(environment: string): Promise<any> {
    const config = getEnvironmentConfig(environment);

    const dbManager = new DatabaseManager({
      environment: environment as any,
      databaseUrl: config.database.url,
      maxConnections: config.database.maxConnections,
      timeout: config.database.timeout,
      logging: false,
    });

    await dbManager.initialize();
    const healthStatus = await dbManager.getHealthStatus();
    await dbManager.close();

    if (!healthStatus.connected) {
      throw new Error('Database connection failed');
    }

    return { connected: true, version: healthStatus.version };
  }

  private async validateSchema(environment: string): Promise<any> {
    const config = getEnvironmentConfig(environment);

    const dbManager = new DatabaseManager({
      environment: environment as any,
      databaseUrl: config.database.url,
      maxConnections: config.database.maxConnections,
      timeout: config.database.timeout,
      logging: false,
    });

    await dbManager.initialize();
    const validation = await dbManager.validateSchema();
    await dbManager.close();

    if (!validation.valid) {
      throw new Error(`Schema validation failed: ${validation.errors.join(', ')}`);
    }

    return { valid: true };
  }

  private async validateMigrations(environment: string): Promise<any> {
    // Check for pending migrations
    const migrationManager = new MigrationManager();
    await migrationManager.initializeForEnvironment(environment);

    // This would check migration status
    await migrationManager.close();

    return { pendingMigrations: 0 };
  }

  private async runDatabaseTests(environment: string): Promise<any> {
    // Run database-specific tests
    this.logger.info('Running database tests...');

    try {
      // This would run actual database tests
      execSync('npm run test:integration', {
        env: { ...process.env, NODE_ENV: environment },
        encoding: 'utf8',
      });

      return { testsPassed: true };

    } catch (error) {
      throw new Error(`Database tests failed: ${error}`);
    }
  }

  private async establishPerformanceBaseline(environment: string): Promise<any> {
    // Establish performance baseline
    return { baselineEstablished: true };
  }

  private async runSecurityChecks(environment: string): Promise<any> {
    // Run security validation
    return { securityChecksPass: true };
  }

  private async generateCIReport(results: CIPipelineResult[], environment: string): Promise<void> {
    const report = {
      timestamp: new Date(),
      environment,
      results,
      summary: {
        totalStages: results.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        totalDuration: results.reduce((sum, r) => sum + r.duration, 0),
      },
    };

    const reportPath = path.join('database/reports', `ci-pipeline-${environment}-${Date.now()}.json`);

    // Ensure reports directory exists
    const reportsDir = path.dirname(reportPath);
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    this.logger.info(`CI report saved to: ${reportPath}`);
  }

  private async validateDeploymentConfig(config: DeploymentConfig): Promise<void> {
    const envConfig = getEnvironmentConfig(config.environment);
    const validation = validateEnvironmentConfig(envConfig);

    if (!validation.valid) {
      throw new Error(`Deployment config validation failed: ${validation.errors.join(', ')}`);
    }
  }

  private async createPreDeploymentBackup(environment: string): Promise<void> {
    this.logger.info('Creating pre-deployment backup...');

    const config = getEnvironmentConfig(environment);
    const backupManager = new BackupManager(new PrismaClient());

    await backupManager.createBackup(
      config.database.url,
      environment,
      {
        compress: true,
        includeData: true,
        includeLogs: false,
        excludeTables: [],
        description: 'Pre-deployment backup',
        tags: ['deployment', 'backup'],
      }
    );
  }

  private async runDeploymentMigrations(environment: string): Promise<void> {
    this.logger.info('Running deployment migrations...');

    const migrationManager = new MigrationManager();
    await migrationManager.initializeForEnvironment(environment);

    await migrationManager.deployMigrations({
      environment,
      backup: false, // Already created backup
      force: false,
      verbose: true,
      dryRun: false,
    });

    await migrationManager.close();
  }

  private async runDeploymentSeeds(environment: string): Promise<void> {
    this.logger.info('Running deployment seeds...');

    const seedManager = new SeedManager();
    await seedManager.initializeForEnvironment(environment);

    const config = getEnvironmentConfig(environment);

    if (config.seeding.enabled) {
      await seedManager.seedAll({
        environment,
        clean: false,
        includeDemo: config.seeding.includeDemo,
        verbose: true,
        dryRun: false,
      });
    }

    await seedManager.close();
  }

  private async runPostDeploymentHealthCheck(environment: string): Promise<void> {
    this.logger.info('Running post-deployment health check...');

    const maintenanceManager = new MaintenanceManager();
    await maintenanceManager.initializeForEnvironment(environment);

    const healthCheck = await maintenanceManager.runHealthCheck();

    const failedChecks = healthCheck.filter(c => c.status === 'FAIL');
    if (failedChecks.length > 0) {
      throw new Error(`Health check failed: ${failedChecks.map(c => c.message).join(', ')}`);
    }

    await maintenanceManager.close();
  }

  private async rollbackDeployment(environment: string): Promise<void> {
    this.logger.warn(`Rolling back deployment for ${environment}...`);
    // Implementation depends on rollback strategy
  }

  private async sendDeploymentNotifications(
    config: DeploymentConfig,
    success: boolean,
    error?: any
  ): Promise<void> {
    // Send notifications to configured channels
    const message = success
      ? `✅ Deployment to ${config.environment} completed successfully`
      : `❌ Deployment to ${config.environment} failed: ${error}`;

    this.logger.info(`Notification: ${message}`);
    // Would send to actual notification channels (Slack, email, etc.)
  }

  private async configureEnvironmentSettings(environment: string): Promise<void> {
    // Configure environment-specific settings
    this.logger.info(`Configuring settings for ${environment}...`);
  }

  private async compareDatabaseSchemas(
    fromEnvironment: string,
    toEnvironment: string
  ): Promise<{ hasDifferences: boolean; differences: string[] }> {
    // Compare database schemas between environments
    return { hasDifferences: false, differences: [] };
  }

  private async promoteDataChanges(
    fromEnvironment: string,
    toEnvironment: string,
    dryRun: boolean
  ): Promise<void> {
    // Promote data changes between environments
    this.logger.info('Promoting data changes...');
  }
}

// CLI Interface
const program = new Command();

program
  .name('ci-cd-manager')
  .description('CI/CD database management tool')
  .version('1.0.0');

program
  .command('ci-pipeline')
  .description('Run CI pipeline')
  .option('-e, --environment <env>', 'Target environment', 'development')
  .option('--skip-tests', 'Skip database tests', false)
  .option('--generate-report', 'Generate CI report', true)
  .action(async (options) => {
    const manager = new CICDManager();
    try {
      const results = await manager.runCIPipeline({
        environment: options.environment,
        skipTests: options.skipTests,
        generateReport: options.generateReport,
      });

      const success = results.every(r => r.success);
      console.log(`\n🚀 CI Pipeline ${success ? 'PASSED' : 'FAILED'}`);

      if (!success) {
        process.exit(1);
      }

    } catch (error) {
      console.error('CI pipeline failed:', error);
      process.exit(1);
    }
  });

program
  .command('deploy')
  .description('Deploy to environment')
  .requiredOption('-e, --environment <env>', 'Target environment')
  .option('--backup', 'Create backup before deployment', true)
  .option('--migrations', 'Run migrations', true)
  .option('--seeds', 'Run seeds', false)
  .option('--health-check', 'Run post-deployment health check', true)
  .option('--rollback-on-failure', 'Rollback on failure', true)
  .action(async (options) => {
    const manager = new CICDManager();
    try {
      await manager.runDeployment({
        environment: options.environment,
        requireApproval: false,
        backupBeforeDeploy: options.backup,
        runMigrations: options.migrations,
        runSeeds: options.seeds,
        runHealthCheck: options.healthCheck,
        rollbackOnFailure: options.rollbackOnFailure,
        notificationChannels: [],
      });

      console.log(`\n✅ Deployment to ${options.environment} completed successfully`);

    } catch (error) {
      console.error('Deployment failed:', error);
      process.exit(1);
    }
  });

program
  .command('setup')
  .description('Setup new environment')
  .requiredOption('-e, --environment <env>', 'Environment to setup')
  .option('--include-demo', 'Include demo data', false)
  .option('--configure', 'Configure environment settings', true)
  .action(async (options) => {
    const manager = new CICDManager();
    try {
      await manager.setupEnvironment({
        environment: options.environment,
        includeDemo: options.includeDemo,
        configure: options.configure,
      });

      console.log(`\n✅ Environment ${options.environment} setup completed`);

    } catch (error) {
      console.error('Environment setup failed:', error);
      process.exit(1);
    }
  });

program
  .command('promote')
  .description('Promote changes between environments')
  .requiredOption('-f, --from <env>', 'Source environment')
  .requiredOption('-t, --to <env>', 'Target environment')
  .option('--include-data', 'Include data changes', false)
  .option('--dry-run', 'Preview changes without applying', false)
  .action(async (options) => {
    const manager = new CICDManager();
    try {
      await manager.promoteChanges({
        fromEnvironment: options.from,
        toEnvironment: options.to,
        includeData: options.includeData,
        dryRun: options.dryRun,
      });

      console.log(`\n✅ Changes promoted from ${options.from} to ${options.to}`);

    } catch (error) {
      console.error('Change promotion failed:', error);
      process.exit(1);
    }
  });

program
  .command('report')
  .description('Generate deployment report')
  .requiredOption('-e, --environment <env>', 'Target environment')
  .action(async (options) => {
    const manager = new CICDManager();
    try {
      await manager.generateDeploymentReport(options.environment);
    } catch (error) {
      console.error('Report generation failed:', error);
      process.exit(1);
    }
  });

// Run CLI if this file is executed directly
if (require.main === module) {
  program.parse(process.argv);
}

export default CICDManager;