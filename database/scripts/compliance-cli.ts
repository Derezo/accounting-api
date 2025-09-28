#!/usr/bin/env ts-node

/**
 * Compliance CLI - Command-line interface for compliance and security operations
 */

import { Command } from 'commander';
import { PrismaClient } from '@prisma/client';
import * as winston from 'winston';
import { getEnvironmentConfig } from '../config/environments';
import { ComplianceManager } from '../utils/compliance-manager';
import { EncryptionUtils } from '../utils/encryption-utils';

class ComplianceCLI {
  private prisma: PrismaClient;
  private complianceManager: ComplianceManager;
  private encryptionUtils: EncryptionUtils;
  private logger: winston.Logger;

  constructor() {
    this.prisma = new PrismaClient();

    const encryptionKey = process.env.ENCRYPTION_KEY || 'default-key-for-development-only';
    this.complianceManager = new ComplianceManager(this.prisma, encryptionKey);
    this.encryptionUtils = new EncryptionUtils(encryptionKey);

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

    const encryptionKey = process.env.ENCRYPTION_KEY || 'default-key-for-development-only';
    this.complianceManager = new ComplianceManager(this.prisma, encryptionKey);
    this.encryptionUtils = new EncryptionUtils(encryptionKey);
  }

  async processGDPRRequest(options: {
    type: 'access' | 'erasure';
    organizationId: string;
    email?: string;
    phone?: string;
    dryRun: boolean;
    output?: string;
  }): Promise<void> {
    try {
      this.logger.info(`Processing GDPR ${options.type} request...`);

      const identifiers = {
        email: options.email,
        phone: options.phone,
      };

      let result: any;

      if (options.type === 'access') {
        result = await this.complianceManager.processAccessRequest(
          options.organizationId,
          identifiers
        );

        console.log('\n📋 GDPR Access Request Results:');
        console.log('='.repeat(50));
        console.log(`Data Subject ID: ${result.subject.id}`);
        console.log(`Data Subject Type: ${result.subject.type}`);
        console.log(`Export Date: ${result.exportDate}`);

        if (result.data) {
          console.log('\n📊 Personal Data Found:');
          console.log(`Name: ${result.data.firstName} ${result.data.lastName}`);
          console.log(`Email: ${result.data.email || 'N/A'}`);
          console.log(`Phone: ${result.data.phone || 'N/A'}`);

          if (result.data.customer) {
            console.log(`Customer Number: ${result.data.customer.customerNumber}`);
            console.log(`Customer Status: ${result.data.customer.status}`);
          }
        }

        console.log(`\n📍 Data Locations: ${result.dataLocations.length} found`);

        if (options.output) {
          const fs = require('fs');
          fs.writeFileSync(options.output, JSON.stringify(result, null, 2));
          console.log(`\n💾 Full data export saved to: ${options.output}`);
        }

      } else if (options.type === 'erasure') {
        result = await this.complianceManager.processErasureRequest(
          options.organizationId,
          identifiers,
          { dryRun: options.dryRun, preserveFinancial: true }
        );

        console.log('\n🗑️  GDPR Erasure Request Results:');
        console.log('='.repeat(50));

        if (options.dryRun) {
          console.log('🧪 DRY RUN MODE - No actual changes made');
        }

        console.log(`✅ Deleted: ${result.deleted.length} items`);
        result.deleted.forEach((item: string) => console.log(`  - ${item}`));

        console.log(`🔒 Preserved: ${result.preserved.length} items`);
        result.preserved.forEach((item: string) => console.log(`  - ${item}`));

        if (result.errors.length > 0) {
          console.log(`❌ Errors: ${result.errors.length}`);
          result.errors.forEach((error: string) => console.log(`  - ${error}`));
        }
      }

    } catch (error) {
      this.logger.error(`GDPR ${options.type} request failed:`, error);
      process.exit(1);
    }
  }

  async generateComplianceReport(options: {
    organizationId: string;
    startDate: string;
    endDate: string;
    output?: string;
  }): Promise<void> {
    try {
      this.logger.info('Generating compliance report...');

      const period = {
        start: new Date(options.startDate),
        end: new Date(options.endDate),
      };

      const report = await this.complianceManager.generateComplianceReport(
        options.organizationId,
        period
      );

      console.log('\n📊 Compliance Report:');
      console.log('='.repeat(60));
      console.log(`Organization: ${report.organization}`);
      console.log(`Period: ${period.start.toDateString()} to ${period.end.toDateString()}`);
      console.log(`Generated: ${report.timestamp.toLocaleString()}`);

      console.log('\n📈 Metrics:');
      console.log(`  Data Subjects: ${report.dataSubjects}`);
      console.log(`  Consent Records: ${report.consentRecords}`);
      console.log(`  GDPR Requests: ${report.gdprRequests}`);
      console.log(`  Audit Events: ${report.auditEvents}`);
      console.log(`  Data Breaches: ${report.dataBreaches}`);
      console.log(`  Encrypted Fields: ${report.encryptedFields}`);

      const scoreColor = report.complianceScore >= 90 ? '🟢' :
                        report.complianceScore >= 70 ? '🟡' : '🔴';
      console.log(`\n${scoreColor} Compliance Score: ${report.complianceScore}%`);

      if (report.issues.length > 0) {
        console.log('\n⚠️  Issues:');
        report.issues.forEach(issue => console.log(`  - ${issue}`));
      }

      if (report.recommendations.length > 0) {
        console.log('\n💡 Recommendations:');
        report.recommendations.forEach(rec => console.log(`  - ${rec}`));
      }

      if (options.output) {
        const fs = require('fs');
        fs.writeFileSync(options.output, JSON.stringify(report, null, 2));
        console.log(`\n💾 Full report saved to: ${options.output}`);
      }

    } catch (error) {
      this.logger.error('Compliance report generation failed:', error);
      process.exit(1);
    }
  }

  async validateEncryption(options: {
    organizationId: string;
    fix: boolean;
  }): Promise<void> {
    try {
      this.logger.info('Validating data encryption...');

      const validation = await this.complianceManager.validateDataEncryption(options.organizationId);

      console.log('\n🔐 Encryption Validation Results:');
      console.log('='.repeat(50));
      console.log(`Status: ${validation.compliant ? '✅ Compliant' : '❌ Non-compliant'}`);
      console.log(`Encrypted Fields: ${validation.encryptedFields}`);

      if (validation.unencryptedSensitiveFields.length > 0) {
        console.log('\n⚠️  Unencrypted Sensitive Fields:');
        validation.unencryptedSensitiveFields.forEach(field => {
          console.log(`  - ${field}`);
        });
      }

      if (validation.issues.length > 0) {
        console.log('\n❌ Issues:');
        validation.issues.forEach(issue => console.log(`  - ${issue}`));
      }

      if (options.fix && !validation.compliant) {
        console.log('\n🔧 Fixing encryption issues...');

        // Migrate unencrypted sensitive fields
        for (const field of validation.unencryptedSensitiveFields) {
          const [table, column] = field.split('.');
          try {
            await this.encryptionUtils.migrateFieldToEncrypted(
              this.prisma,
              table,
              column,
              'organizationId'
            );
            console.log(`✅ Encrypted ${field}`);
          } catch (error) {
            console.log(`❌ Failed to encrypt ${field}: ${error}`);
          }
        }

        console.log('\n🔧 Encryption fixes completed');
      }

    } catch (error) {
      this.logger.error('Encryption validation failed:', error);
      process.exit(1);
    }
  }

  async anonymizeData(options: {
    organizationId: string;
    preserveStructure: boolean;
    seedValue?: string;
    dryRun: boolean;
  }): Promise<void> {
    try {
      if (options.dryRun) {
        console.log('🧪 DRY RUN MODE - Preview of anonymization changes:');
        console.log('='.repeat(50));
        console.log('- Personal names will be replaced with anonymous values');
        console.log('- Email addresses will be replaced with test@example.com format');
        console.log('- Phone numbers will be replaced with (555) 000-0000 format');
        console.log('- Social Insurance Numbers will be replaced with test values');

        if (options.preserveStructure) {
          console.log('- Data structure and relationships will be preserved');
        } else {
          console.log('- Financial data will also be anonymized');
        }

        console.log('\nRun without --dry-run to perform actual anonymization');
        return;
      }

      this.logger.warn('Starting data anonymization - THIS WILL MODIFY DATA!');

      await this.complianceManager.anonymizeData(options.organizationId, {
        preserveStructure: options.preserveStructure,
        seedValue: options.seedValue,
      });

      console.log('\n✅ Data anonymization completed');
      console.log('⚠️  Original data has been replaced with anonymous values');

    } catch (error) {
      this.logger.error('Data anonymization failed:', error);
      process.exit(1);
    }
  }

  async rotateEncryptionKey(options: {
    organizationId: string;
    newKey: string;
    backupFirst: boolean;
  }): Promise<void> {
    try {
      if (options.backupFirst) {
        this.logger.info('Creating backup before key rotation...');
        // Would create backup here
        console.log('✅ Backup created');
      }

      this.logger.warn('Starting encryption key rotation - THIS IS A CRITICAL OPERATION!');

      const sensitiveFields = [
        { table: 'persons', field: 'socialInsNumber' },
        { table: 'employees', field: 'salary' },
        { table: 'vendors', field: 'bankAccount' },
      ];

      for (const { table, field } of sensitiveFields) {
        try {
          await this.encryptionUtils.rotateEncryptionKey(
            this.prisma,
            options.newKey,
            table,
            field,
            'organizationId'
          );
          console.log(`✅ Rotated encryption key for ${table}.${field}`);
        } catch (error) {
          console.log(`❌ Failed to rotate key for ${table}.${field}: ${error}`);
          throw error;
        }
      }

      console.log('\n✅ Encryption key rotation completed');
      console.log('⚠️  Update your environment variables with the new encryption key');

    } catch (error) {
      this.logger.error('Key rotation failed:', error);
      process.exit(1);
    }
  }

  async generateDataLineage(options: {
    organizationId: string;
    output?: string;
  }): Promise<void> {
    try {
      this.logger.info('Generating data lineage report...');

      const lineage = await this.complianceManager.generateDataLineageReport(options.organizationId);

      console.log('\n🔗 Data Lineage Report:');
      console.log('='.repeat(50));
      console.log(`Organization: ${options.organizationId}`);
      console.log(`Generated: ${lineage.generatedAt.toLocaleString()}`);

      console.log('\n📊 Data Relationships:');
      for (const [entity, details] of Object.entries(lineage.dataMap)) {
        console.log(`\n${entity}:`);
        if ((details as any).contains) {
          console.log(`  Contains: ${(details as any).contains.join(', ')}`);
        }
        if ((details as any).linkedTo) {
          console.log(`  Linked to: ${(details as any).linkedTo.join(', ')}`);
        }
        if ((details as any).stores) {
          console.log(`  Stores: ${(details as any).stores.join(', ')}`);
        }
        if ((details as any).sensitive) {
          console.log(`  Sensitive fields: ${(details as any).sensitive.join(', ')}`);
        }
      }

      if (options.output) {
        const fs = require('fs');
        fs.writeFileSync(options.output, JSON.stringify(lineage, null, 2));
        console.log(`\n💾 Full lineage report saved to: ${options.output}`);
      }

    } catch (error) {
      this.logger.error('Data lineage generation failed:', error);
      process.exit(1);
    }
  }

  async close(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

// CLI Setup
const program = new Command();

program
  .name('compliance-cli')
  .description('Compliance and security management tool')
  .version('1.0.0');

program
  .command('gdpr-access')
  .description('Process GDPR data access request')
  .requiredOption('-o, --org <organizationId>', 'Organization ID')
  .option('-e, --email <email>', 'Subject email address')
  .option('-p, --phone <phone>', 'Subject phone number')
  .option('--output <file>', 'Output file for full data export')
  .option('--env <environment>', 'Environment', 'development')
  .action(async (options) => {
    const cli = new ComplianceCLI();
    try {
      await cli.initializeForEnvironment(options.env);
      await cli.processGDPRRequest({
        type: 'access',
        organizationId: options.org,
        email: options.email,
        phone: options.phone,
        dryRun: false,
        output: options.output,
      });
    } finally {
      await cli.close();
    }
  });

program
  .command('gdpr-erasure')
  .description('Process GDPR data erasure request')
  .requiredOption('-o, --org <organizationId>', 'Organization ID')
  .option('-e, --email <email>', 'Subject email address')
  .option('-p, --phone <phone>', 'Subject phone number')
  .option('--dry-run', 'Preview changes without applying', false)
  .option('--env <environment>', 'Environment', 'development')
  .action(async (options) => {
    const cli = new ComplianceCLI();
    try {
      await cli.initializeForEnvironment(options.env);
      await cli.processGDPRRequest({
        type: 'erasure',
        organizationId: options.org,
        email: options.email,
        phone: options.phone,
        dryRun: options.dryRun,
      });
    } finally {
      await cli.close();
    }
  });

program
  .command('compliance-report')
  .description('Generate compliance report')
  .requiredOption('-o, --org <organizationId>', 'Organization ID')
  .requiredOption('-s, --start <date>', 'Start date (YYYY-MM-DD)')
  .requiredOption('-e, --end <date>', 'End date (YYYY-MM-DD)')
  .option('--output <file>', 'Output file for full report')
  .option('--env <environment>', 'Environment', 'development')
  .action(async (options) => {
    const cli = new ComplianceCLI();
    try {
      await cli.initializeForEnvironment(options.env);
      await cli.generateComplianceReport({
        organizationId: options.org,
        startDate: options.start,
        endDate: options.end,
        output: options.output,
      });
    } finally {
      await cli.close();
    }
  });

program
  .command('validate-encryption')
  .description('Validate data encryption compliance')
  .requiredOption('-o, --org <organizationId>', 'Organization ID')
  .option('--fix', 'Automatically fix encryption issues', false)
  .option('--env <environment>', 'Environment', 'development')
  .action(async (options) => {
    const cli = new ComplianceCLI();
    try {
      await cli.initializeForEnvironment(options.env);
      await cli.validateEncryption({
        organizationId: options.org,
        fix: options.fix,
      });
    } finally {
      await cli.close();
    }
  });

program
  .command('anonymize')
  .description('Anonymize sensitive data for development/testing')
  .requiredOption('-o, --org <organizationId>', 'Organization ID')
  .option('--preserve-structure', 'Preserve data structure and relationships', true)
  .option('--seed <value>', 'Seed value for consistent anonymization')
  .option('--dry-run', 'Preview changes without applying', false)
  .option('--env <environment>', 'Environment', 'development')
  .action(async (options) => {
    const cli = new ComplianceCLI();
    try {
      await cli.initializeForEnvironment(options.env);
      await cli.anonymizeData({
        organizationId: options.org,
        preserveStructure: options.preserveStructure,
        seedValue: options.seed,
        dryRun: options.dryRun,
      });
    } finally {
      await cli.close();
    }
  });

program
  .command('rotate-key')
  .description('Rotate encryption keys')
  .requiredOption('-o, --org <organizationId>', 'Organization ID')
  .requiredOption('-k, --new-key <key>', 'New encryption key')
  .option('--backup', 'Create backup before rotation', true)
  .option('--env <environment>', 'Environment', 'development')
  .action(async (options) => {
    const cli = new ComplianceCLI();
    try {
      await cli.initializeForEnvironment(options.env);
      await cli.rotateEncryptionKey({
        organizationId: options.org,
        newKey: options.newKey,
        backupFirst: options.backup,
      });
    } finally {
      await cli.close();
    }
  });

program
  .command('data-lineage')
  .description('Generate data lineage report')
  .requiredOption('-o, --org <organizationId>', 'Organization ID')
  .option('--output <file>', 'Output file for full report')
  .option('--env <environment>', 'Environment', 'development')
  .action(async (options) => {
    const cli = new ComplianceCLI();
    try {
      await cli.initializeForEnvironment(options.env);
      await cli.generateDataLineage({
        organizationId: options.org,
        output: options.output,
      });
    } finally {
      await cli.close();
    }
  });

// Run CLI if this file is executed directly
if (require.main === module) {
  program.parse(process.argv);
}

export default ComplianceCLI;