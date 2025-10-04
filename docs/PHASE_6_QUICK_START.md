# Phase 6: Searchable Encryption & Compliance - Quick Start Guide

This guide shows you how to use the new Phase 6 features in your application.

---

## Table of Contents

1. [Searchable Encryption](#searchable-encryption)
2. [Encryption Audit Queries](#encryption-audit-queries)
3. [Compliance Validation](#compliance-validation)
4. [GDPR Compliance (TTL)](#gdpr-compliance-ttl)
5. [Scheduled Maintenance](#scheduled-maintenance)

---

## Searchable Encryption

### Basic Usage: Encrypt with Search Support

```typescript
import { fieldEncryptionService } from '@/services/field-encryption.service';

// Example: Encrypt customer email with search capability
async function createCustomerWithSearchableEmail(customer: {
  id: string;
  email: string;
  organizationId: string;
}) {
  // Encrypt email with automatic search index creation
  const encryptedEmail = await fieldEncryptionService.encryptField(
    customer.email,
    {
      organizationId: customer.organizationId,
      fieldName: 'email',
      searchable: true,           // Enable searchable encryption
      entityType: 'Customer',     // Required for search index
      entityId: customer.id,      // Required for search index
      ttl: 365                    // Auto-delete after 365 days (GDPR)
    }
  );

  // Store encrypted email in database
  await prisma.customer.update({
    where: { id: customer.id },
    data: { email: encryptedEmail }
  });
}
```

### Search Across Encrypted Emails

```typescript
import { fieldEncryptionService } from '@/services/field-encryption.service';

// Example: Find customers by email without decryption
async function findCustomersByEmail(
  organizationId: string,
  searchTerm: string
) {
  // Search using partial match (finds "john" in "john@example.com")
  const results = await fieldEncryptionService.searchEncryptedField(
    organizationId,
    'email',        // Field name
    searchTerm,     // What to search for
    {
      entityType: 'Customer',  // Optional: filter by entity type
      exactMatch: false        // false = partial match, true = exact match
    }
  );

  // Results: [{ entityId: 'cust-123', entityType: 'Customer', fieldName: 'email' }]

  // Fetch actual customer records
  const customerIds = results.map(r => r.entityId);
  const customers = await prisma.customer.findMany({
    where: {
      id: { in: customerIds },
      organizationId
    }
  });

  return customers;
}
```

### Direct Search Index Operations

```typescript
import { searchableEncryptionDbService } from '@/services/searchable-encryption-db.service';

// Example: Manual search index creation (rare - usually automatic)
async function createSearchIndexManually() {
  await searchableEncryptionDbService.storeSearchIndex({
    organizationId: 'org-123',
    entityType: 'Person',
    entityId: 'person-456',
    fieldName: 'sin',
    plaintext: '123-456-789',  // Will be hashed, not stored
    keyVersion: 1,
    algorithm: 'AES-256-GCM',
    expiresAt: new Date('2026-12-31')  // GDPR TTL
  });
}

// Example: Exact match search (e.g., find by SIN)
async function findBySIN(organizationId: string, sin: string) {
  const results = await searchableEncryptionDbService.queryByExactMatch(
    organizationId,
    'sin',
    sin
  );

  return results.map(r => r.entityId);
}

// Example: Partial match search (e.g., find phone numbers containing "555")
async function findByPhonePartial(organizationId: string, partialPhone: string) {
  const results = await searchableEncryptionDbService.queryByPartialMatch(
    organizationId,
    'phone',
    partialPhone
  );

  return results.map(r => r.entityId);
}
```

### Cleanup When Deleting Entities

```typescript
import { fieldEncryptionService } from '@/services/field-encryption.service';

// Example: Delete customer and their search indexes
async function deleteCustomer(customerId: string, organizationId: string) {
  // Delete search indexes first
  await fieldEncryptionService.deleteSearchIndex(
    organizationId,
    'Customer',
    customerId
    // fieldName omitted = delete ALL indexes for this customer
  );

  // Delete customer record
  await prisma.customer.delete({
    where: { id: customerId }
  });
}
```

---

## Encryption Audit Queries

### Query Recent Encryption Operations

```typescript
import { encryptionAuditService } from '@/services/encryption-audit.service';

// Example: Get last 100 encryption operations
async function getRecentEncryptionActivity(organizationId: string) {
  const events = await encryptionAuditService.getAuditEvents({
    organizationId,
    limit: 100,
    offset: 0
  });

  return events;
}

// Example: Find failed encryption operations
async function getEncryptionFailures(organizationId: string) {
  const events = await encryptionAuditService.getAuditEvents({
    organizationId,
    status: 'failure',
    startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
    limit: 50
  });

  return events;
}

// Example: Track specific operation type
async function getKeyRotationHistory(organizationId: string) {
  const events = await encryptionAuditService.getAuditEvents({
    organizationId,
    operation: 'rotate_key' as any,
    limit: 20
  });

  return events;
}
```

### Get Encryption Performance Metrics

```typescript
import { encryptionAuditService } from '@/services/encryption-audit.service';

// Example: Monthly encryption performance report
async function getMonthlyEncryptionMetrics(organizationId: string) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const metrics = await encryptionAuditService.getEncryptionMetrics(
    organizationId,
    startOfMonth,
    endOfMonth
  );

  console.log('Monthly Encryption Metrics:');
  console.log(`Total Operations: ${metrics.totalOperations}`);
  console.log(`Success Rate: ${(metrics.successfulOperations / metrics.totalOperations * 100).toFixed(2)}%`);
  console.log(`Average Duration: ${metrics.averageDuration.toFixed(2)}ms`);
  console.log(`Total Data Processed: ${(metrics.totalDataProcessed / 1024 / 1024).toFixed(2)}MB`);
  console.log('\nOperations by Type:');
  Object.entries(metrics.operationsByType).forEach(([op, count]) => {
    console.log(`  ${op}: ${count}`);
  });
  console.log('\nSlowest Operations:');
  metrics.slowestOperations.slice(0, 5).forEach((op, i) => {
    console.log(`  ${i + 1}. ${op.operation}: ${op.duration}ms`);
  });

  return metrics;
}
```

---

## Compliance Validation

### Validate Single Compliance Standard

```typescript
import { complianceValidationService } from '@/services/compliance-validation.service';

// Example: PCI DSS compliance check
async function checkPCIDSSCompliance(organizationId: string) {
  const results = await complianceValidationService.validateCompliance(
    organizationId,
    'PCI_DSS'
  );

  const pciResult = results[0];

  console.log(`PCI DSS Compliance Score: ${pciResult.complianceScore}%`);
  console.log(`Status: ${pciResult.overallStatus}`);

  // Show failed requirements
  const failures = pciResult.validations.filter(v => v.status === 'fail');
  if (failures.length > 0) {
    console.log('\nFailed Requirements:');
    failures.forEach(f => {
      console.log(`- ${f.id}: ${f.requirement}`);
      console.log(`  Issue: ${f.details}`);
      if (f.remediation) {
        console.log(`  Fix: ${f.remediation}`);
      }
    });
  }

  return pciResult;
}

// Example: GDPR compliance check
async function checkGDPRCompliance(organizationId: string) {
  const results = await complianceValidationService.validateCompliance(
    organizationId,
    'GDPR'
  );

  return results[0];
}
```

### Validate All Standards (Comprehensive Report)

```typescript
import { complianceValidationService } from '@/services/compliance-validation.service';

// Example: Full compliance report for security audit
async function generateSecurityAuditReport(organizationId: string) {
  const report = await complianceValidationService.generateComplianceReport(
    organizationId
  );

  console.log('='.repeat(60));
  console.log('COMPLIANCE AUDIT REPORT');
  console.log('='.repeat(60));
  console.log(`Organization: ${report.organization.name}`);
  console.log(`Report Date: ${report.reportDate.toISOString()}`);
  console.log(`Overall Status: ${report.overallCompliance}`);
  console.log(`Critical Issues: ${report.criticalIssues}`);
  console.log('='.repeat(60));

  // Show each standard
  report.standards.forEach(std => {
    console.log(`\n${std.standard}:`);
    console.log(`  Score: ${std.complianceScore.toFixed(1)}%`);
    console.log(`  Status: ${std.overallStatus}`);

    const failed = std.validations.filter(v => v.status === 'fail');
    if (failed.length > 0) {
      console.log(`  Failed: ${failed.map(f => f.id).join(', ')}`);
    }
  });

  console.log('\n' + '='.repeat(60));
  console.log('RECOMMENDATIONS:');
  console.log('='.repeat(60));
  report.recommendations.forEach((rec, i) => {
    console.log(`${i + 1}. ${rec}`);
  });

  return report;
}
```

### Automated Compliance Monitoring

```typescript
import { complianceValidationService } from '@/services/compliance-validation.service';

// Example: Weekly compliance check (cron job)
async function weeklyComplianceCheck(organizationId: string) {
  const report = await complianceValidationService.generateComplianceReport(
    organizationId
  );

  // Alert if critical issues found
  if (report.criticalIssues > 0) {
    // Send alert to security team
    await sendSecurityAlert({
      subject: `CRITICAL: ${report.criticalIssues} Compliance Issues`,
      body: `Organization ${report.organization.name} has ${report.criticalIssues} critical compliance issues.`,
      recommendations: report.recommendations
    });
  }

  // Store compliance score for trend analysis
  await prisma.complianceHistory.create({
    data: {
      organizationId,
      reportDate: report.reportDate,
      overallStatus: report.overallCompliance,
      criticalIssues: report.criticalIssues,
      standards: JSON.stringify(report.standards)
    }
  });

  return report;
}
```

---

## GDPR Compliance (TTL)

### Set TTL When Encrypting PII

```typescript
import { fieldEncryptionService } from '@/services/field-encryption.service';

// Example: Encrypt with 90-day TTL (e.g., temporary customer data)
async function encryptTemporaryPII(data: {
  organizationId: string;
  entityType: string;
  entityId: string;
  fieldName: string;
  value: string;
}) {
  const encrypted = await fieldEncryptionService.encryptField(
    data.value,
    {
      organizationId: data.organizationId,
      fieldName: data.fieldName,
      searchable: true,
      entityType: data.entityType,
      entityId: data.entityId,
      ttl: 90  // Auto-delete after 90 days
    }
  );

  return encrypted;
}

// Example: Different TTLs for different data types
const TTL_POLICIES = {
  temporaryData: 30,      // 30 days
  customerData: 365,      // 1 year
  financialData: 2555,    // 7 years (SOX requirement)
  sessionData: 1          // 1 day
};

async function encryptWithPolicyBasedTTL(
  value: string,
  dataType: keyof typeof TTL_POLICIES,
  options: {
    organizationId: string;
    entityType: string;
    entityId: string;
    fieldName: string;
  }
) {
  return await fieldEncryptionService.encryptField(value, {
    ...options,
    searchable: true,
    ttl: TTL_POLICIES[dataType]
  });
}
```

### Manual TTL Purge (GDPR Right to Erasure)

```typescript
import { searchableEncryptionDbService } from '@/services/searchable-encryption-db.service';

// Example: Manual purge of expired indexes
async function purgeExpiredPII() {
  const purgedCount = await searchableEncryptionDbService.purgeExpiredIndexes();

  console.log(`GDPR Compliance: Purged ${purgedCount} expired PII indexes`);

  return {
    purgedCount,
    timestamp: new Date(),
    compliance: 'GDPR Article 17: Right to Erasure'
  };
}

// Example: Get statistics on expiring data
async function getExpirationStats(organizationId: string) {
  const stats = await searchableEncryptionDbService.getIndexStats(organizationId);

  console.log('PII Expiration Statistics:');
  console.log(`Total Indexes: ${stats.totalIndexes}`);
  console.log(`Expired Indexes: ${stats.expiredIndexes}`);
  console.log(`Active Indexes: ${stats.totalIndexes - stats.expiredIndexes}`);

  return stats;
}
```

---

## Scheduled Maintenance

### Cron Job Examples

Create a file `src/cron/encryption-maintenance.ts`:

```typescript
import { searchableEncryptionDbService } from '@/services/searchable-encryption-db.service';
import { encryptionAuditService } from '@/services/encryption-audit.service';
import { complianceValidationService } from '@/services/compliance-validation.service';
import { logger } from '@/utils/logger';

/**
 * Daily: Purge expired PII (GDPR compliance)
 * Schedule: 2:00 AM daily
 */
export async function dailyPIIPurge() {
  try {
    logger.info('Starting daily PII purge...');

    const purgedCount = await searchableEncryptionDbService.purgeExpiredIndexes();

    logger.info('Daily PII purge completed', {
      purgedCount,
      timestamp: new Date()
    });

    return { success: true, purgedCount };
  } catch (error) {
    logger.error('Daily PII purge failed', { error });
    throw error;
  }
}

/**
 * Weekly: Compliance validation
 * Schedule: Sunday 3:00 AM
 */
export async function weeklyComplianceCheck() {
  try {
    logger.info('Starting weekly compliance check...');

    const organizations = await prisma.organization.findMany({
      select: { id: true, name: true }
    });

    const results = [];

    for (const org of organizations) {
      const report = await complianceValidationService.generateComplianceReport(org.id);

      results.push({
        organizationId: org.id,
        organizationName: org.name,
        overallStatus: report.overallCompliance,
        criticalIssues: report.criticalIssues
      });

      // Alert if critical issues
      if (report.criticalIssues > 0) {
        logger.warn('Critical compliance issues detected', {
          organizationId: org.id,
          criticalIssues: report.criticalIssues,
          recommendations: report.recommendations
        });
      }
    }

    logger.info('Weekly compliance check completed', {
      organizationCount: organizations.length,
      results
    });

    return { success: true, results };
  } catch (error) {
    logger.error('Weekly compliance check failed', { error });
    throw error;
  }
}

/**
 * Monthly: Audit log cleanup
 * Schedule: 1st of month, 4:00 AM
 */
export async function monthlyAuditCleanup() {
  try {
    logger.info('Starting monthly audit log cleanup...');

    // Keep 365 days of audit logs
    const deletedCount = await encryptionAuditService.cleanupOldLogs(365);

    logger.info('Monthly audit cleanup completed', {
      deletedCount,
      retentionDays: 365,
      timestamp: new Date()
    });

    return { success: true, deletedCount };
  } catch (error) {
    logger.error('Monthly audit cleanup failed', { error });
    throw error;
  }
}

/**
 * Quarterly: Generate compliance reports
 * Schedule: 1st of quarter, 1:00 AM
 */
export async function quarterlyComplianceReport() {
  try {
    logger.info('Starting quarterly compliance report generation...');

    const organizations = await prisma.organization.findMany();
    const reports = [];

    for (const org of organizations) {
      const report = await complianceValidationService.generateComplianceReport(org.id);

      // Store report in database
      await prisma.complianceReport.create({
        data: {
          organizationId: org.id,
          reportDate: report.reportDate,
          overallStatus: report.overallCompliance,
          criticalIssues: report.criticalIssues,
          standards: JSON.stringify(report.standards),
          recommendations: JSON.stringify(report.recommendations)
        }
      });

      reports.push({
        organization: org.name,
        status: report.overallCompliance,
        score: report.standards.reduce((avg, s) => avg + s.complianceScore, 0) / report.standards.length
      });
    }

    logger.info('Quarterly compliance reports generated', {
      reportCount: reports.length,
      timestamp: new Date()
    });

    return { success: true, reports };
  } catch (error) {
    logger.error('Quarterly compliance report generation failed', { error });
    throw error;
  }
}
```

### Register Cron Jobs

In your `src/index.ts` or separate cron scheduler:

```typescript
import cron from 'node-cron';
import {
  dailyPIIPurge,
  weeklyComplianceCheck,
  monthlyAuditCleanup,
  quarterlyComplianceReport
} from './cron/encryption-maintenance';

// Daily at 2:00 AM - Purge expired PII
cron.schedule('0 2 * * *', async () => {
  await dailyPIIPurge();
});

// Sunday at 3:00 AM - Compliance check
cron.schedule('0 3 * * 0', async () => {
  await weeklyComplianceCheck();
});

// 1st of month at 4:00 AM - Audit cleanup
cron.schedule('0 4 1 * *', async () => {
  await monthlyAuditCleanup();
});

// 1st of quarter at 1:00 AM - Compliance reports
cron.schedule('0 1 1 */3 *', async () => {
  await quarterlyComplianceReport();
});

logger.info('Encryption maintenance cron jobs registered');
```

---

## Best Practices

### 1. Always Set TTL for PII
```typescript
// ❌ BAD: No TTL for PII
await fieldEncryptionService.encryptField(email, {
  organizationId,
  fieldName: 'email',
  searchable: true
});

// ✅ GOOD: TTL set for GDPR compliance
await fieldEncryptionService.encryptField(email, {
  organizationId,
  fieldName: 'email',
  searchable: true,
  entityType: 'Person',
  entityId: personId,
  ttl: 365  // Auto-delete after 1 year
});
```

### 2. Clean Up Search Indexes When Deleting
```typescript
// ❌ BAD: Orphaned search indexes
await prisma.customer.delete({ where: { id } });

// ✅ GOOD: Clean up indexes first
await fieldEncryptionService.deleteSearchIndex(orgId, 'Customer', id);
await prisma.customer.delete({ where: { id } });
```

### 3. Monitor Compliance Regularly
```typescript
// ✅ GOOD: Regular compliance monitoring
setInterval(async () => {
  const report = await complianceValidationService.generateComplianceReport(orgId);
  if (report.criticalIssues > 0) {
    await alertSecurityTeam(report);
  }
}, 7 * 24 * 60 * 60 * 1000); // Weekly
```

### 4. Use Exact Match for Unique Identifiers
```typescript
// ✅ GOOD: Exact match for SIN/SSN
const results = await fieldEncryptionService.searchEncryptedField(
  orgId,
  'sin',
  searchValue,
  { exactMatch: true }  // Fast, deterministic
);

// ✅ GOOD: Partial match for names/emails
const results = await fieldEncryptionService.searchEncryptedField(
  orgId,
  'email',
  searchValue,
  { exactMatch: false }  // Slower, fuzzy
);
```

---

## Troubleshooting

### Issue: Search returns no results

**Cause:** Search indexes not created (missing `entityType` or `entityId`)

**Solution:**
```typescript
// Ensure all required fields are provided
await fieldEncryptionService.encryptField(value, {
  organizationId,
  fieldName: 'email',
  searchable: true,
  entityType: 'Customer',  // Required!
  entityId: customerId,     // Required!
  ttl: 365
});
```

### Issue: Compliance validation shows failures

**Cause:** Missing audit logs or encryption not enabled

**Solution:**
```typescript
// Check if audit service is initialized
import { initializeEncryptionAuditService } from '@/services/encryption-audit.service';
initializeEncryptionAuditService(prisma);

// Verify encryption is enabled for sensitive fields
const report = await complianceValidationService.validateCompliance(orgId, 'PCI_DSS');
console.log(report.recommendations);  // Shows what needs to be fixed
```

### Issue: Performance degradation

**Cause:** Too many search tokens or large search queries

**Solution:**
```typescript
// Use exact match for known values
const results = await searchableEncryptionDbService.queryByExactMatch(
  orgId,
  fieldName,
  exactValue  // Fast blind index lookup
);

// Add database indexes for common queries
// Already done in migration: search_indexes_organizationId_idx, etc.
```

---

## Next Steps

1. **Configure Cron Jobs:** Set up automated maintenance tasks
2. **Set Up Monitoring:** Track compliance scores and encryption metrics
3. **Train Team:** Familiarize developers with searchable encryption API
4. **Generate Reports:** Create initial compliance reports for all organizations
5. **Review TTL Policies:** Adjust TTL values based on data retention requirements

For detailed implementation, see:
- `PHASE_6_COMPLETION_REPORT.md` - Complete technical documentation
- `ENCRYPTION_PRODUCTION_READINESS_IMPLEMENTATION.md` - Architecture guide
- `ENCRYPTION_PRODUCTION_QUICK_START.md` - Getting started guide
