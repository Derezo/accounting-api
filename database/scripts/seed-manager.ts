#!/usr/bin/env ts-node

/**
 * Seed Manager - Orchestrates database seeding across environments
 */

import { PrismaClient } from '@prisma/client';
import { Command } from 'commander';
import * as winston from 'winston';
import { getEnvironmentConfig, validateEnvironmentConfig } from '../config/environments';
import { ReferenceDataSeeder } from '../seeds/reference-data-seeder';
import { OrganizationSeeder } from '../seeds/organization-seeder';
import { DemoDataSeeder } from '../seeds/demo-data-seeder';
import { DatabaseManager } from '../utils/database-manager';

interface SeedingOptions {
  environment: string;
  clean: boolean;
  includeDemo: boolean;
  organizationId?: string;
  verbose: boolean;
  dryRun: boolean;
}

class SeedManager {
  private prisma: PrismaClient;
  private logger: winston.Logger;
  private dbManager: DatabaseManager;

  constructor() {
    // Logger setup
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
          filename: 'database/logs/seeding.log',
          maxsize: 10 * 1024 * 1024, // 10MB
          maxFiles: 5,
        }),
      ],
    });

    // Initialize Prisma (will be updated with environment config)
    this.prisma = new PrismaClient();
    this.dbManager = new DatabaseManager({
      environment: 'development',
      databaseUrl: '',
    });
  }

  async initializeForEnvironment(environment: string): Promise<void> {
    const config = getEnvironmentConfig(environment);

    // Validate configuration
    const validation = validateEnvironmentConfig(config);
    if (!validation.valid) {
      throw new Error(`Invalid environment configuration: ${validation.errors.join(', ')}`);
    }

    // Disconnect existing Prisma client
    await this.prisma.$disconnect();

    // Create new Prisma client for environment
    this.prisma = new PrismaClient({
      datasources: {
        db: {
          url: config.database.url,
        },
      },
      log: config.database.logging ? ['query', 'info', 'warn', 'error'] : ['error'],
    });

    // Update database manager
    this.dbManager = new DatabaseManager({
      environment: environment as any,
      databaseUrl: config.database.url,
      shadowDatabaseUrl: config.database.shadowUrl,
      maxConnections: config.database.maxConnections,
      timeout: config.database.timeout,
      logging: config.database.logging,
    });

    await this.dbManager.initialize();
  }

  async seedAll(options: SeedingOptions): Promise<void> {
    this.logger.info(`Starting seeding process for ${options.environment} environment`);

    const config = getEnvironmentConfig(options.environment);

    // Check if seeding is allowed
    if (!config.seeding.enabled) {
      throw new Error(`Seeding is not enabled for ${options.environment} environment`);
    }

    // Dry run check
    if (options.dryRun) {
      this.logger.info('DRY RUN MODE - No changes will be made');
      await this.validateSeedingPlan(options);
      return;
    }

    const startTime = Date.now();
    const results: any[] = [];

    try {
      // Step 1: Reference Data
      this.logger.info('Seeding reference data...');
      const referenceSeeder = new ReferenceDataSeeder(this.prisma);
      const referenceResult = await referenceSeeder.executeSeed({
        environment: options.environment as any,
        clean: options.clean,
        verbose: options.verbose,
      });
      results.push(referenceResult);

      // Step 2: Organizations
      this.logger.info('Seeding organizations...');
      const orgSeeder = new OrganizationSeeder(this.prisma);
      const orgResult = await orgSeeder.executeSeed({
        environment: options.environment as any,
        clean: options.clean,
        verbose: options.verbose,
      });
      results.push(orgResult);

      // Step 3: Demo Data (if requested and allowed)
      if (options.includeDemo && config.seeding.includeDemo) {
        this.logger.info('Seeding demo data...');

        // Get created organizations
        const organizations = await this.prisma.organization.findMany({
          take: config.seeding.organizationCount,
        });

        for (const org of organizations) {
          const demoSeeder = new DemoDataSeeder(this.prisma);
          const demoResult = await demoSeeder.executeSeed({
            environment: options.environment as any,
            organizationId: org.id,
            count: config.seeding.customerCount,
            clean: false, // Don't clean for each org
            verbose: options.verbose,
          });
          results.push(demoResult);
        }
      }

      const totalTime = Date.now() - startTime;
      const totalRecords = results.reduce((sum, result) => sum + result.recordsCreated, 0);

      this.logger.info(`Seeding completed successfully!`);
      this.logger.info(`Total time: ${totalTime}ms`);
      this.logger.info(`Total records created: ${totalRecords}`);

      // Print summary
      this.printSeedingSummary(results);

    } catch (error) {
      this.logger.error('Seeding failed:', error);
      throw error;
    }
  }

  async cleanAll(options: SeedingOptions): Promise<void> {
    this.logger.info(`Cleaning database for ${options.environment} environment`);

    const config = getEnvironmentConfig(options.environment);

    if (options.environment === 'production') {
      throw new Error('Database cleaning is not allowed in production');
    }

    if (options.dryRun) {
      this.logger.info('DRY RUN MODE - Would clean all seeded data');
      return;
    }

    try {
      // Clean in reverse order
      const demoSeeder = new DemoDataSeeder(this.prisma);
      await demoSeeder.clean({
        environment: options.environment as any,
        organizationId: '', // Will clean all
      });

      const orgSeeder = new OrganizationSeeder(this.prisma);
      await orgSeeder.clean({
        environment: options.environment as any,
      });

      const referenceSeeder = new ReferenceDataSeeder(this.prisma);
      await referenceSeeder.clean({
        environment: options.environment as any,
      });

      this.logger.info('Database cleaned successfully');

    } catch (error) {
      this.logger.error('Database cleaning failed:', error);
      throw error;
    }
  }

  async seedSpecificOrganization(organizationId: string, options: SeedingOptions): Promise<void> {
    this.logger.info(`Seeding demo data for organization: ${organizationId}`);

    // Verify organization exists
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!organization) {
      throw new Error(`Organization not found: ${organizationId}`);
    }

    if (options.dryRun) {
      this.logger.info(`DRY RUN MODE - Would seed demo data for ${organization.name}`);
      return;
    }

    const demoSeeder = new DemoDataSeeder(this.prisma);
    const result = await demoSeeder.executeSeed({
      environment: options.environment as any,
      organizationId,
      clean: options.clean,
      verbose: options.verbose,
    });

    this.logger.info(`Demo data seeded for ${organization.name}: ${result.recordsCreated} records created`);
  }

  private async validateSeedingPlan(options: SeedingOptions): Promise<void> {
    this.logger.info('Validating seeding plan...');

    const config = getEnvironmentConfig(options.environment);

    // Check database connection
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      this.logger.info('✓ Database connection is valid');
    } catch (error) {
      this.logger.error('✗ Database connection failed:', error);
      throw error;
    }

    // Check if reference data exists
    const countryCount = await this.prisma.country.count();
    if (countryCount > 0 && !options.clean) {
      this.logger.warn(`Warning: ${countryCount} countries already exist. Use --clean to reset.`);
    }

    // Check organization count
    const orgCount = await this.prisma.organization.count();
    if (orgCount > 0 && !options.clean) {
      this.logger.warn(`Warning: ${orgCount} organizations already exist. Use --clean to reset.`);
    }

    this.logger.info('Plan summary:');
    this.logger.info(`- Environment: ${config.name}`);
    this.logger.info(`- Clean before seed: ${options.clean}`);
    this.logger.info(`- Include demo data: ${options.includeDemo && config.seeding.includeDemo}`);
    this.logger.info(`- Organizations to create: ${config.seeding.organizationCount}`);
    this.logger.info(`- Customers per organization: ${config.seeding.customerCount}`);

    this.logger.info('Validation completed successfully');
  }

  private printSeedingSummary(results: any[]): void {
    console.log('\n' + '='.repeat(60));
    console.log('SEEDING SUMMARY');
    console.log('='.repeat(60));

    for (const result of results) {
      const status = result.success ? '✓' : '✗';
      console.log(`${status} ${result.seederName}: ${result.recordsCreated} records (${result.timeTaken}ms)`);

      if (result.errors.length > 0) {
        console.log(`  Errors: ${result.errors.join(', ')}`);
      }
    }

    console.log('='.repeat(60));
  }

  async close(): Promise<void> {
    await this.prisma.$disconnect();
    await this.dbManager.close();
  }
}

// CLI Interface
const program = new Command();

program
  .name('seed-manager')
  .description('Database seeding management tool')
  .version('1.0.0');

program
  .command('all')
  .description('Seed all data')
  .option('-e, --environment <env>', 'Target environment', 'development')
  .option('-c, --clean', 'Clean existing data before seeding', false)
  .option('-d, --demo', 'Include demo data', true)
  .option('-v, --verbose', 'Verbose output', false)
  .option('--dry-run', 'Preview changes without applying', false)
  .action(async (options) => {
    const seedManager = new SeedManager();
    try {
      await seedManager.initializeForEnvironment(options.environment);
      await seedManager.seedAll({
        environment: options.environment,
        clean: options.clean,
        includeDemo: options.demo,
        verbose: options.verbose,
        dryRun: options.dryRun,
      });
    } catch (error) {
      console.error('Seeding failed:', error);
      process.exit(1);
    } finally {
      await seedManager.close();
    }
  });

program
  .command('clean')
  .description('Clean all seeded data')
  .option('-e, --environment <env>', 'Target environment', 'development')
  .option('--dry-run', 'Preview changes without applying', false)
  .action(async (options) => {
    const seedManager = new SeedManager();
    try {
      await seedManager.initializeForEnvironment(options.environment);
      await seedManager.cleanAll({
        environment: options.environment,
        clean: true,
        includeDemo: false,
        verbose: true,
        dryRun: options.dryRun,
      });
    } catch (error) {
      console.error('Cleaning failed:', error);
      process.exit(1);
    } finally {
      await seedManager.close();
    }
  });

program
  .command('org <organizationId>')
  .description('Seed demo data for specific organization')
  .option('-e, --environment <env>', 'Target environment', 'development')
  .option('-c, --clean', 'Clean existing org data before seeding', false)
  .option('-v, --verbose', 'Verbose output', false)
  .option('--dry-run', 'Preview changes without applying', false)
  .action(async (organizationId, options) => {
    const seedManager = new SeedManager();
    try {
      await seedManager.initializeForEnvironment(options.environment);
      await seedManager.seedSpecificOrganization(organizationId, {
        environment: options.environment,
        organizationId,
        clean: options.clean,
        includeDemo: true,
        verbose: options.verbose,
        dryRun: options.dryRun,
      });
    } catch (error) {
      console.error('Organization seeding failed:', error);
      process.exit(1);
    } finally {
      await seedManager.close();
    }
  });

program
  .command('validate')
  .description('Validate environment configuration')
  .option('-e, --environment <env>', 'Target environment', 'development')
  .action(async (options) => {
    try {
      const config = getEnvironmentConfig(options.environment);
      const validation = validateEnvironmentConfig(config);

      console.log(`Environment: ${config.name}`);
      console.log(`Valid: ${validation.valid ? '✓' : '✗'}`);

      if (!validation.valid) {
        console.log('\nValidation Errors:');
        validation.errors.forEach(error => console.log(`- ${error}`));
        process.exit(1);
      } else {
        console.log('Configuration is valid');
      }
    } catch (error) {
      console.error('Validation failed:', error);
      process.exit(1);
    }
  });

// Run CLI if this file is executed directly
if (require.main === module) {
  program.parse(process.argv);
}

export default SeedManager;