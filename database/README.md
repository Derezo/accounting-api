# Database Management System

A comprehensive database management system for the TypeScript Accounting API with bank-level security, multi-tenant architecture, and production-ready tooling.

## Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Architecture](#architecture)
4. [Environment Configuration](#environment-configuration)
5. [Migration Management](#migration-management)
6. [Data Seeding](#data-seeding)
7. [Backup & Restore](#backup--restore)
8. [Performance Monitoring](#performance-monitoring)
9. [Maintenance & Health](#maintenance--health)
10. [Security & Compliance](#security--compliance)
11. [CI/CD Integration](#cicd-integration)
12. [API Reference](#api-reference)
13. [Troubleshooting](#troubleshooting)

## Overview

This database management system provides:

- **Multi-environment support** (development, testing, staging, production)
- **Automated migrations** with rollback capabilities
- **Comprehensive seeding** with realistic demo data
- **Backup and restore** with encryption support
- **Performance monitoring** and optimization
- **Security and compliance** tools (GDPR, encryption, audit trails)
- **CI/CD integration** for automated deployments
- **Health monitoring** and maintenance automation

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 14+ or SQLite 3.38+
- TypeScript 5.0+

### Installation

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your database configuration

# Generate Prisma client
npm run prisma:generate

# Run initial setup
npm run db:setup
```

### Basic Commands

```bash
# Database setup and seeding
npm run db:setup                    # Complete setup with demo data
npm run db:migrate                  # Run migrations
npm run db:seed                     # Seed database
npm run db:reset                    # Reset and reseed

# Backup and restore
npm run db:backup                   # Create backup
npm run db:restore <filename>       # Restore from backup

# Health and maintenance
npm run db:health                   # Health check
npm run db:maintenance              # Run maintenance tasks

# Performance monitoring
npm run db:performance              # Performance report
npm run db:monitor                  # Start monitoring

# Compliance and security
npm run db:compliance               # Compliance report
npm run db:encrypt                  # Validate encryption
```

## Architecture

### Directory Structure

```
database/
├── config/                     # Environment configurations
│   └── environments.ts         # Multi-environment settings
├── migrations/                 # Custom migration files
│   └── [timestamp]_[name]/     # Individual migrations
├── seeds/                      # Data seeding
│   ├── base-seeder.ts         # Abstract seeder class
│   ├── reference-data-seeder.ts # Reference data
│   ├── organization-seeder.ts  # Organizations and users
│   └── demo-data-seeder.ts    # Demo data
├── utils/                      # Core utilities
│   ├── database-manager.ts    # Database operations
│   ├── migration-utils.ts     # Migration helpers
│   ├── encryption-utils.ts    # Field encryption
│   ├── backup-manager.ts      # Backup/restore
│   ├── performance-monitor.ts # Performance tracking
│   └── compliance-manager.ts  # GDPR and compliance
├── scripts/                    # CLI tools
│   ├── seed-manager.ts        # Seeding orchestration
│   ├── migrate-manager.ts     # Migration management
│   ├── backup-manager-cli.ts  # Backup operations
│   ├── maintenance-manager.ts # Health and maintenance
│   ├── performance-cli.ts     # Performance tools
│   ├── compliance-cli.ts      # Compliance tools
│   └── ci-cd-manager.ts       # CI/CD automation
├── logs/                       # Log files
├── backups/                    # Database backups
├── reports/                    # Generated reports
└── docs/                       # Documentation
```

### Core Components

#### DatabaseManager
Central database operations manager handling connections, migrations, backups, and health checks.

#### EnvironmentConfig
Multi-environment configuration system supporting development, testing, staging, and production environments.

#### SeedManager
Orchestrates database seeding with realistic demo data across multiple organizations.

#### PerformanceMonitor
Real-time performance monitoring with query analysis and optimization recommendations.

#### ComplianceManager
GDPR compliance tools including data subject access, erasure requests, and audit trails.

## Environment Configuration

### Environment Types

- **Development**: Full demo data, verbose logging, local SQLite
- **Testing**: Minimal test data, fast reset, in-memory database
- **Staging**: Production-like data, anonymized, SSL required
- **Production**: Real data, encryption enforced, backups required

### Configuration Example

```typescript
// database/config/environments.ts
export const environments = {
  development: {
    database: {
      url: "file:./prisma/dev.db",
      maxConnections: 10,
      logging: true
    },
    seeding: {
      enabled: true,
      includeDemo: true,
      organizationCount: 4,
      customerCount: 20
    },
    security: {
      encryptionEnabled: true,
      auditingEnabled: true
    }
  },
  // ... other environments
}
```

## Migration Management

### Creating Migrations

```bash
# Create new migration
npx ts-node database/scripts/migrate-manager.ts create "add_customer_preferences" \
  --description "Add customer preference settings table"

# Preview migrations
npx ts-node database/scripts/migrate-manager.ts deploy --dry-run

# Deploy migrations
npx ts-node database/scripts/migrate-manager.ts deploy --environment production
```

### Migration Structure

```
database/migrations/2024-01-15_add_customer_preferences/
├── migration.sql              # Forward migration
├── rollback.sql              # Rollback script
└── metadata.json             # Migration metadata
```

### Migration Best Practices

1. **Always create rollback scripts**
2. **Test migrations in staging first**
3. **Create backups before production migrations**
4. **Use descriptive migration names**
5. **Include data migrations when schema changes affect existing data**

## Data Seeding

### Seeding Hierarchy

1. **Reference Data**: Countries, currencies, tax rates, categories
2. **Organizations**: Demo organizations with admin users
3. **Demo Data**: Customers, quotes, invoices, payments, projects

### Seeding Commands

```bash
# Seed all data
npx ts-node database/scripts/seed-manager.ts all \
  --environment development \
  --clean \
  --demo

# Seed specific organization
npx ts-node database/scripts/seed-manager.ts org <org-id> \
  --environment development

# Clean existing data
npx ts-node database/scripts/seed-manager.ts clean \
  --environment development
```

### Custom Seeders

```typescript
import { BaseSeeder, SeedOptions, SeedResult } from './base-seeder';

export class CustomSeeder extends BaseSeeder {
  get name(): string {
    return 'CustomSeeder';
  }

  async seed(options: SeedOptions): Promise<SeedResult> {
    // Implement custom seeding logic
    return {
      seederName: this.name,
      environment: options.environment,
      recordsCreated: 0,
      timeTaken: 0,
      success: true,
      errors: [],
    };
  }

  async clean(options: SeedOptions): Promise<void> {
    // Implement cleanup logic
  }
}
```

## Backup & Restore

### Creating Backups

```bash
# Create compressed backup
npx ts-node database/scripts/backup-manager-cli.ts create \
  --environment production \
  --compress \
  --description "Weekly backup" \
  --tags "weekly,automated"

# Create encrypted backup
npx ts-node database/scripts/backup-manager-cli.ts create \
  --environment production \
  --encrypt "your-encryption-key"
```

### Restoring Backups

```bash
# List available backups
npx ts-node database/scripts/backup-manager-cli.ts list

# Validate backup
npx ts-node database/scripts/backup-manager-cli.ts restore backup.sql.gz \
  --validate-only

# Restore backup
npx ts-node database/scripts/backup-manager-cli.ts restore backup.sql.gz \
  --environment staging \
  --force
```

### Backup Features

- **Compression**: Automatic gzip compression
- **Encryption**: AES-256 encryption for sensitive data
- **Integrity**: Checksum validation
- **Metadata**: Backup metadata tracking
- **Retention**: Automatic cleanup of old backups
- **Cross-environment**: Restore between environments

## Performance Monitoring

### Real-time Monitoring

```bash
# Start monitoring (60-second intervals)
npx ts-node database/scripts/performance-cli.ts monitor \
  --interval 60 \
  --duration 3600 \
  --output performance-data.json

# Generate performance report
npx ts-node database/scripts/performance-cli.ts report \
  --format table \
  --output report.json
```

### Query Analysis

```bash
# Analyze query patterns
npx ts-node database/scripts/performance-cli.ts analyze

# Get optimization recommendations
npx ts-node database/scripts/performance-cli.ts recommendations
```

### Load Testing

```bash
# Simulate database load
npx ts-node database/scripts/performance-cli.ts load-test \
  --queries 1000 \
  --concurrency 10 \
  --type mixed
```

### Performance Metrics

- Connection count and active queries
- Average query execution time
- Slow query identification
- Table statistics and sizes
- Index usage and recommendations
- Memory and CPU utilization

## Maintenance & Health

### Health Checks

```bash
# Run comprehensive health check
npx ts-node database/scripts/maintenance-manager.ts health \
  --environment production

# Generate maintenance plan
npx ts-node database/scripts/maintenance-manager.ts plan

# Run automatic maintenance
npx ts-node database/scripts/maintenance-manager.ts auto
```

### Health Check Categories

- **Connectivity**: Database connection and response
- **Schema**: Schema validation and integrity
- **Integrity**: Data consistency and constraints
- **Performance**: Query performance and indexes
- **Storage**: Database size and disk space
- **Backup**: Recent backups and integrity

### Maintenance Tasks

- Database statistics updates
- Index optimization and rebuilding
- Old data archival
- Log file cleanup
- Connection pool optimization

## Security & Compliance

### GDPR Compliance

```bash
# Process data access request
npx ts-node database/scripts/compliance-cli.ts gdpr-access \
  --org <org-id> \
  --email customer@example.com \
  --output customer-data.json

# Process erasure request
npx ts-node database/scripts/compliance-cli.ts gdpr-erasure \
  --org <org-id> \
  --email customer@example.com \
  --dry-run

# Generate compliance report
npx ts-node database/scripts/compliance-cli.ts compliance-report \
  --org <org-id> \
  --start 2024-01-01 \
  --end 2024-12-31
```

### Encryption Management

```bash
# Validate field encryption
npx ts-node database/scripts/compliance-cli.ts validate-encryption \
  --org <org-id> \
  --fix

# Rotate encryption keys
npx ts-node database/scripts/compliance-cli.ts rotate-key \
  --org <org-id> \
  --new-key "new-32-character-encryption-key" \
  --backup

# Anonymize data for development
npx ts-node database/scripts/compliance-cli.ts anonymize \
  --org <org-id> \
  --preserve-structure \
  --dry-run
```

### Security Features

- **Field-level encryption** for sensitive data
- **Audit trails** for all data changes
- **Data anonymization** for non-production environments
- **GDPR compliance** tools and workflows
- **Access control** and permission validation

## CI/CD Integration

### CI Pipeline

```bash
# Run complete CI pipeline
npx ts-node database/scripts/ci-cd-manager.ts ci-pipeline \
  --environment staging \
  --generate-report

# Deploy to environment
npx ts-node database/scripts/ci-cd-manager.ts deploy \
  --environment production \
  --backup \
  --migrations \
  --health-check
```

### Environment Setup

```bash
# Setup new environment
npx ts-node database/scripts/ci-cd-manager.ts setup \
  --environment staging \
  --include-demo \
  --configure

# Promote changes between environments
npx ts-node database/scripts/ci-cd-manager.ts promote \
  --from staging \
  --to production \
  --dry-run
```

### CI/CD Features

- **Automated testing** of database changes
- **Environment validation** and configuration
- **Deployment automation** with rollback capabilities
- **Health checking** post-deployment
- **Change promotion** between environments

## API Reference

### DatabaseManager

```typescript
const dbManager = new DatabaseManager({
  environment: 'production',
  databaseUrl: process.env.DATABASE_URL,
  maxConnections: 50,
  timeout: 120000,
  logging: false
});

// Initialize connection
await dbManager.initialize();

// Run migrations
await dbManager.migrate();

// Create backup
const backupInfo = await dbManager.createBackup();

// Get health status
const health = await dbManager.getHealthStatus();
```

### PerformanceMonitor

```typescript
const monitor = new PerformanceMonitor(prisma, 1000); // 1000ms slow query threshold

// Start monitoring
monitor.startMonitoring(60000); // 60-second intervals

// Log query performance
monitor.logQuery(sql, executionTime, { userId, organizationId });

// Get performance report
const report = await monitor.getPerformanceReport();
```

### ComplianceManager

```typescript
const compliance = new ComplianceManager(prisma, encryptionKey);

// Process GDPR access request
const data = await compliance.processAccessRequest(orgId, { email });

// Process erasure request
const result = await compliance.processErasureRequest(orgId, { email });

// Generate compliance report
const report = await compliance.generateComplianceReport(orgId, period);
```

## Package.json Scripts

Add these scripts to your `package.json`:

```json
{
  "scripts": {
    "db:setup": "ts-node database/scripts/seed-manager.ts all --clean --demo",
    "db:migrate": "ts-node database/scripts/migrate-manager.ts deploy",
    "db:migrate:create": "ts-node database/scripts/migrate-manager.ts create",
    "db:migrate:rollback": "ts-node database/scripts/migrate-manager.ts rollback",
    "db:seed": "ts-node database/scripts/seed-manager.ts all",
    "db:seed:clean": "ts-node database/scripts/seed-manager.ts clean",
    "db:reset": "ts-node database/scripts/migrate-manager.ts reset --force && npm run db:setup",
    "db:backup": "ts-node database/scripts/backup-manager-cli.ts create --compress",
    "db:restore": "ts-node database/scripts/backup-manager-cli.ts restore",
    "db:health": "ts-node database/scripts/maintenance-manager.ts health",
    "db:maintenance": "ts-node database/scripts/maintenance-manager.ts auto",
    "db:performance": "ts-node database/scripts/performance-cli.ts report",
    "db:monitor": "ts-node database/scripts/performance-cli.ts monitor",
    "db:compliance": "ts-node database/scripts/compliance-cli.ts compliance-report",
    "db:encrypt": "ts-node database/scripts/compliance-cli.ts validate-encryption",
    "db:ci": "ts-node database/scripts/ci-cd-manager.ts ci-pipeline",
    "db:deploy": "ts-node database/scripts/ci-cd-manager.ts deploy"
  }
}
```

## Troubleshooting

### Common Issues

#### Migration Failures

```bash
# Check migration status
npm run db:migrate status

# Validate pending migrations
npm run db:migrate deploy --dry-run

# Force migration (use with caution)
npm run db:migrate deploy --force
```

#### Connection Issues

```bash
# Test database connectivity
npx ts-node -e "
import { DatabaseManager } from './database/utils/database-manager';
const db = new DatabaseManager({
  environment: 'development',
  databaseUrl: process.env.DATABASE_URL
});
db.initialize().then(() => console.log('Connected!')).catch(console.error);
"

# Check environment configuration
npx ts-node database/scripts/seed-manager.ts validate --environment development
```

#### Performance Issues

```bash
# Identify slow queries
npm run db:performance

# Get optimization recommendations
npx ts-node database/scripts/performance-cli.ts recommendations

# Run database maintenance
npm run db:maintenance
```

#### Data Corruption

```bash
# Run health check
npm run db:health

# Restore from backup
npm run db:restore <backup-filename> --force

# Validate data integrity
npx ts-node database/scripts/maintenance-manager.ts health --environment production
```

### Environment Variables

Required environment variables:

```bash
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/accounting_db"
SHADOW_DATABASE_URL="postgresql://user:password@localhost:5432/accounting_shadow"

# Security
ENCRYPTION_KEY="your-32-character-encryption-key"
JWT_SECRET="your-jwt-secret"

# Optional
NODE_ENV="development"
LOG_LEVEL="info"
```

### Logging

Logs are stored in `database/logs/`:

- `database-{environment}.log` - General database operations
- `performance.log` - Performance monitoring
- `compliance.log` - Compliance and audit events
- `maintenance.log` - Maintenance operations
- `ci-cd.log` - CI/CD pipeline logs

### Support

For issues and questions:

1. Check the logs in `database/logs/`
2. Run health checks: `npm run db:health`
3. Validate configuration: `npm run db:validate`
4. Review recent migrations and changes
5. Check database connectivity and permissions

---

## License

UNLICENSED - Proprietary software for Lifestream Dynamics

## Contributing

This is a proprietary database management system. Internal contributions should follow the established patterns and include comprehensive tests.