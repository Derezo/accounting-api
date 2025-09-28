# Getting Started with Database Management

This guide will walk you through setting up and using the comprehensive database management system for the TypeScript Accounting API.

## Prerequisites

Before getting started, ensure you have:

- **Node.js 18+** installed
- **PostgreSQL 14+** or **SQLite 3.38+** database
- **TypeScript 5.0+** knowledge
- Basic understanding of Prisma ORM
- Familiarity with command-line tools

## Initial Setup

### 1. Environment Configuration

First, set up your environment variables:

```bash
# Copy the example environment file
cp .env.example .env

# Edit the .env file with your configuration
nano .env
```

Key environment variables:

```env
# Database Configuration
NODE_ENV=development
DATABASE_URL="postgresql://user:password@localhost:5432/accounting_db"
SHADOW_DATABASE_URL="postgresql://user:password@localhost:5432/accounting_shadow"

# Security
ENCRYPTION_KEY="your-32-character-encryption-key-here"
JWT_SECRET="your-super-secure-jwt-secret-key-here"

# Optional Settings
LOG_LEVEL=info
```

### 2. Install Dependencies

```bash
# Install all dependencies
npm install

# Generate Prisma client
npm run prisma:generate
```

### 3. Database Initialization

```bash
# Complete database setup with demo data
npm run db:setup

# Or step by step:
npm run db:migrate      # Run migrations
npm run db:seed         # Seed with data
```

## Basic Usage

### Database Operations

```bash
# Health check
npm run db:health

# Create backup
npm run db:backup

# Performance report
npm run db:performance

# Maintenance tasks
npm run db:maintenance
```

### Working with Migrations

```bash
# Create new migration
npx ts-node database/scripts/migrate-manager.ts create "add_new_feature" \
  --description "Add new feature to customer management"

# Preview migration changes
npm run db:migrate deploy --dry-run

# Apply migrations
npm run db:migrate
```

### Data Management

```bash
# Reset database with fresh data
npm run db:reset

# Clean existing data
npm run db:seed:clean

# Seed specific organization
npx ts-node database/scripts/seed-manager.ts org <organization-id>
```

## Environment-Specific Operations

### Development Environment

```bash
# Full setup with demo data
npm run db:setup

# Monitor performance in real-time
npm run db:monitor

# Run load tests
npx ts-node database/scripts/performance-cli.ts load-test \
  --queries 500 \
  --concurrency 5
```

### Testing Environment

```bash
# Setup for testing
NODE_ENV=testing npm run db:setup

# Quick reset for tests
NODE_ENV=testing npm run db:reset
```

### Production Environment

```bash
# Validate before deployment
npx ts-node database/scripts/ci-cd-manager.ts ci-pipeline \
  --environment production

# Deploy with full checks
npx ts-node database/scripts/ci-cd-manager.ts deploy \
  --environment production \
  --backup \
  --health-check
```

## Working with Organizations

The system is multi-tenant. Here's how to work with organizations:

### 1. Create New Organization

```typescript
import { OrganizationSeeder } from './database/seeds/organization-seeder';

const orgSeeder = new OrganizationSeeder(prisma);

await orgSeeder.createSpecificOrganization({
  name: 'Your Company Name',
  legalName: 'Your Company Legal Name Inc.',
  domain: 'yourcompany.com',
  type: 'SINGLE_BUSINESS',
  email: 'admin@yourcompany.com',
  phone: '+1 (555) 123-4567',
  adminUser: {
    firstName: 'Admin',
    lastName: 'User',
    email: 'admin@yourcompany.com',
    password: 'SecurePassword123!',
    role: 'ADMIN',
  },
  address: {
    line1: '123 Business Street',
    city: 'Toronto',
    stateProvince: 'Ontario',
    postalCode: 'M5V 3A8',
    countryCode: 'CA',
  },
});
```

### 2. Seed Organization Data

```bash
# Get organization ID from database or creation response
npx ts-node database/scripts/seed-manager.ts org <organization-id> \
  --environment development \
  --verbose
```

## Security and Compliance

### GDPR Operations

```bash
# Process data access request
npx ts-node database/scripts/compliance-cli.ts gdpr-access \
  --org <organization-id> \
  --email customer@example.com \
  --output customer-data.json

# Process erasure request (with preview)
npx ts-node database/scripts/compliance-cli.ts gdpr-erasure \
  --org <organization-id> \
  --email customer@example.com \
  --dry-run
```

### Encryption Management

```bash
# Validate encryption compliance
npx ts-node database/scripts/compliance-cli.ts validate-encryption \
  --org <organization-id>

# Fix encryption issues automatically
npx ts-node database/scripts/compliance-cli.ts validate-encryption \
  --org <organization-id> \
  --fix
```

### Data Anonymization

```bash
# Anonymize for development/testing
npx ts-node database/scripts/compliance-cli.ts anonymize \
  --org <organization-id> \
  --preserve-structure \
  --seed "consistent-seed-value"
```

## Performance Monitoring

### Real-time Monitoring

```bash
# Start monitoring (runs until stopped)
npx ts-node database/scripts/performance-cli.ts monitor \
  --interval 30 \
  --output monitoring-session.json

# Monitor for specific duration
npx ts-node database/scripts/performance-cli.ts monitor \
  --interval 60 \
  --duration 3600  # 1 hour
```

### Analysis and Optimization

```bash
# Generate performance report
npm run db:performance

# Analyze query patterns
npx ts-node database/scripts/performance-cli.ts analyze

# Get optimization recommendations
npx ts-node database/scripts/performance-cli.ts recommendations
```

## Backup and Recovery

### Creating Backups

```bash
# Standard backup
npm run db:backup

# Backup with custom settings
npx ts-node database/scripts/backup-manager-cli.ts create \
  --environment production \
  --compress \
  --description "Pre-deployment backup" \
  --tags "deployment,critical"

# Encrypted backup
npx ts-node database/scripts/backup-manager-cli.ts create \
  --encrypt "your-encryption-key"
```

### Restoring Data

```bash
# List available backups
npx ts-node database/scripts/backup-manager-cli.ts list

# Validate backup before restore
npx ts-node database/scripts/backup-manager-cli.ts restore backup.sql.gz \
  --validate-only

# Restore to staging
npx ts-node database/scripts/backup-manager-cli.ts restore backup.sql.gz \
  --environment staging
```

## Integrating with Your Application

### Using the DatabaseManager

```typescript
import { DatabaseManager } from './database/utils/database-manager';
import { getEnvironmentConfig } from './database/config/environments';

const config = getEnvironmentConfig(process.env.NODE_ENV);

const dbManager = new DatabaseManager({
  environment: config.name as any,
  databaseUrl: config.database.url,
  maxConnections: config.database.maxConnections,
  timeout: config.database.timeout,
  logging: config.database.logging,
});

// Initialize
await dbManager.initialize();

// Check health
const health = await dbManager.getHealthStatus();
console.log('Database health:', health);

// Clean up
await dbManager.close();
```

### Using the PerformanceMonitor

```typescript
import { PerformanceMonitor } from './database/utils/performance-monitor';

const monitor = new PerformanceMonitor(prisma, 1000); // 1000ms slow query threshold

// In your Prisma middleware or query wrapper
const startTime = Date.now();
const result = await prisma.customer.findMany();
const executionTime = Date.now() - startTime;

monitor.logQuery(
  'SELECT * FROM customers',
  executionTime,
  { userId: req.user.id, organizationId: req.user.organizationId }
);
```

### Using the ComplianceManager

```typescript
import { ComplianceManager } from './database/utils/compliance-manager';

const compliance = new ComplianceManager(prisma, process.env.ENCRYPTION_KEY);

// Handle GDPR access request
app.post('/api/gdpr/access', async (req, res) => {
  try {
    const data = await compliance.processAccessRequest(
      req.body.organizationId,
      { email: req.body.email }
    );
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

## CI/CD Integration

### GitHub Actions Example

```yaml
# .github/workflows/database.yml
name: Database CI/CD

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Run database CI pipeline
        run: npx ts-node database/scripts/ci-cd-manager.ts ci-pipeline \
          --environment testing \
          --generate-report
        env:
          DATABASE_URL: ${{ secrets.TEST_DATABASE_URL }}
          ENCRYPTION_KEY: ${{ secrets.ENCRYPTION_KEY }}

  deploy:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Deploy to staging
        run: npx ts-node database/scripts/ci-cd-manager.ts deploy \
          --environment staging \
          --backup \
          --migrations \
          --health-check
        env:
          DATABASE_URL: ${{ secrets.STAGING_DATABASE_URL }}
```

## Common Workflows

### New Feature Development

1. Create feature branch
2. Add migrations if needed
3. Update seeders if necessary
4. Test with development environment
5. Run CI pipeline
6. Deploy to staging
7. Validate in staging
8. Deploy to production

```bash
# During development
git checkout -b feature/customer-preferences

# Create migration
npx ts-node database/scripts/migrate-manager.ts create "add_customer_preferences"

# Test locally
npm run db:reset
npm run db:health

# Before pushing
npm run db:ci
```

### Production Deployment

```bash
# 1. Validate environment
npx ts-node database/scripts/ci-cd-manager.ts ci-pipeline \
  --environment production

# 2. Create backup
npm run db:backup

# 3. Deploy changes
npx ts-node database/scripts/ci-cd-manager.ts deploy \
  --environment production \
  --backup \
  --migrations \
  --health-check

# 4. Verify deployment
npm run db:health
npm run db:performance
```

### Troubleshooting Development Issues

```bash
# Check overall health
npm run db:health

# Reset if needed
npm run db:reset

# Check recent logs
tail -f database/logs/database-development.log

# Validate configuration
npx ts-node database/scripts/seed-manager.ts validate \
  --environment development
```

## Next Steps

Once you're comfortable with the basics:

1. **Explore Advanced Features**
   - Custom seeders for your specific data
   - Performance optimization techniques
   - Advanced compliance workflows

2. **Set Up Monitoring**
   - Configure real-time performance monitoring
   - Set up automated maintenance schedules
   - Implement alerting for health issues

3. **Production Readiness**
   - Set up backup retention policies
   - Configure multi-environment promotion
   - Implement disaster recovery procedures

4. **Team Integration**
   - Train team members on database workflows
   - Set up development environment standards
   - Create deployment procedures

## Support and Resources

- **Documentation**: See `database/README.md` for comprehensive reference
- **Examples**: Check `database/docs/examples/` for code samples
- **Logs**: Monitor `database/logs/` for operational insights
- **Health Checks**: Regular `npm run db:health` for system status

For specific issues, run the health check and check the relevant log files in `database/logs/`.