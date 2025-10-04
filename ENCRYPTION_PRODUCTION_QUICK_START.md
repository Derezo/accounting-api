# Encryption Production Readiness - Quick Start Guide

## Overview

Phase 6 implementation adds searchable encryption database persistence, AWS CloudHSM integration, and compliance validation. This guide provides exact implementation steps.

## Step 1: Run Database Migration

```bash
# Generate Prisma client with new models
npx prisma generate

# Create migration
npx prisma migrate dev --name add_encryption_production_tables

# Verify migration
npx prisma studio
# Check that SearchIndex and EncryptionAuditLog tables exist
```

## Step 2: Install Dependencies (Optional - CloudHSM only)

```bash
# Only if USE_CLOUDHSM=true in production
npm install @aws-sdk/client-cloudhsm-v2 --save
```

## Step 3: Update Environment Variables

Add to `.env`:

```bash
# CloudHSM (Production only)
USE_CLOUDHSM=false
CLOUDHSM_CLUSTER_ID=
CLOUDHSM_CERT_PATH=
CLOUDHSM_KEY_LABEL=master-encryption-key

# Compliance
PCI_DSS_ENABLED=true
GDPR_ENABLED=true
FIPS_MODE=false

# Search Index
SEARCH_INDEX_TTL_DAYS=365
SEARCH_INDEX_CLEANUP_INTERVAL=86400000

# Encryption Audit
ENCRYPTION_AUDIT_RETENTION_DAYS=2555
ENCRYPTION_AUDIT_BUFFER_SIZE=100
```

## Step 4: Implementation Priority Order

### Priority 1: Searchable Encryption Database Service (CRITICAL)

Create `src/services/searchable-encryption-db.service.ts`:

**Estimated Time**: 2-3 hours
**Lines of Code**: ~450
**Dependencies**: Prisma, logger

**Key Methods Required**:
1. `storeSearchIndex(options)` - Store blind index and tokens
2. `queryByBlindIndex(orgId, fieldName, blindIndex)` - Exact match
3. `queryBySearchToken(orgId, fieldName, token)` - Partial match
4. `updateSearchIndex(...)` - Update existing index
5. `deleteSearchIndex(orgId, entityType, entityId, fieldName)`
6. `purgeExpiredIndexes()` - TTL cleanup
7. `rotateSearchIndexes(orgId, oldVersion, newVersion)`

**Template Structure**:
```typescript
import { prisma } from '@/config/database';
import { logger } from '@/utils/logger';

interface StoreSearchIndexOptions {
  organizationId: string;
  entityType: string;
  entityId: string;
  fieldName: string;
  blindIndex: string;
  searchTokens: string[];
  keyVersion: number;
  algorithm: string;
  ttlDays?: number;
}

class SearchableEncryptionDatabaseService {
  async storeSearchIndex(options: StoreSearchIndexOptions): Promise<void> {
    const expiresAt = options.ttlDays
      ? new Date(Date.now() + options.ttlDays * 24 * 60 * 60 * 1000)
      : null;

    await prisma.searchIndex.upsert({
      where: { blindIndex: options.blindIndex },
      update: {
        searchTokens: JSON.stringify(options.searchTokens),
        keyVersion: options.keyVersion,
        algorithm: options.algorithm,
        expiresAt,
        updatedAt: new Date()
      },
      create: {
        organizationId: options.organizationId,
        entityType: options.entityType,
        entityId: options.entityId,
        fieldName: options.fieldName,
        blindIndex: options.blindIndex,
        searchTokens: JSON.stringify(options.searchTokens),
        keyVersion: options.keyVersion,
        algorithm: options.algorithm,
        expiresAt
      }
    });

    logger.debug('Search index stored', {
      organizationId: options.organizationId,
      entityType: options.entityType,
      fieldName: options.fieldName
    });
  }

  async queryByBlindIndex(
    organizationId: string,
    fieldName: string,
    blindIndex: string
  ): Promise<Array<{ entityType: string; entityId: string }>> {
    const results = await prisma.searchIndex.findMany({
      where: {
        organizationId,
        fieldName,
        blindIndex,
        expiresAt: { gt: new Date() } // Not expired
      },
      select: {
        entityType: true,
        entityId: true
      }
    });

    logger.debug('Blind index query', {
      organizationId,
      fieldName,
      resultCount: results.length
    });

    return results;
  }

  async queryBySearchToken(
    organizationId: string,
    fieldName: string,
    searchToken: string
  ): Promise<Array<{ entityType: string; entityId: string }>> {
    // Query for records where searchTokens JSON array contains the token
    const results = await prisma.$queryRaw`
      SELECT DISTINCT entityType, entityId
      FROM search_indexes
      WHERE organizationId = ${organizationId}
        AND fieldName = ${fieldName}
        AND json_each.value = ${searchToken}
        AND (expiresAt IS NULL OR expiresAt > datetime('now'))
      FROM json_each(searchTokens)
    `;

    logger.debug('Search token query', {
      organizationId,
      fieldName,
      token: searchToken.substring(0, 10) + '...',
      resultCount: results.length
    });

    return results;
  }

  async purgeExpiredIndexes(): Promise<number> {
    const result = await prisma.searchIndex.deleteMany({
      where: {
        expiresAt: { lt: new Date() }
      }
    });

    logger.info('Expired search indexes purged', {
      deletedCount: result.count
    });

    return result.count;
  }

  // Additional methods...
}

export const searchableEncryptionDb = new SearchableEncryptionDatabaseService();
```

### Priority 2: Update Field Encryption Service

Modify `src/services/field-encryption.service.ts`:

**Add these methods** (insert after existing methods):

```typescript
/**
 * Encrypt field and store searchable index in database
 */
public async encryptFieldWithIndex(
  value: string,
  options: EncryptionOptions & {
    entityType: string;
    entityId: string;
    ttlDays?: number;
  }
): Promise<string> {
  const startTime = Date.now();

  // Encrypt the value
  const encryptedValue = await this.encryptField(value, options);

  // If searchable, store index in database
  if (options.searchable) {
    const searchResult = this.createSearchableIndex(value);
    const key = this.keyManager.getActiveKey(options.organizationId);

    await searchableEncryptionDb.storeSearchIndex({
      organizationId: options.organizationId,
      entityType: options.entityType,
      entityId: options.entityId,
      fieldName: options.fieldName || 'unknown',
      blindIndex: searchResult.blindIndex,
      searchTokens: searchResult.searchTokens,
      keyVersion: key.version,
      algorithm: key.algorithm,
      ttlDays: options.ttlDays
    });

    // Log encryption audit event
    await encryptionAuditService.logEvent({
      organizationId: options.organizationId,
      eventType: EncryptionEventType.DATA_ENCRYPTION,
      operation: EncryptionOperation.ENCRYPT_FIELD,
      status: 'success',
      entityType: options.entityType,
      fieldName: options.fieldName,
      recordId: options.entityId,
      keyVersion: key.version,
      duration: Date.now() - startTime,
      dataSize: value.length
    });
  }

  return encryptedValue;
}

/**
 * Search encrypted field using blind index or search tokens
 */
public async searchEncryptedField(
  organizationId: string,
  fieldName: string,
  searchValue: string,
  exactMatch: boolean = true
): Promise<Array<{ entityType: string; entityId: string }>> {
  const startTime = Date.now();

  try {
    let results: Array<{ entityType: string; entityId: string }>;

    if (exactMatch) {
      // Use blind index for exact match
      const searchResult = this.createSearchableIndex(searchValue);
      results = await searchableEncryptionDb.queryByBlindIndex(
        organizationId,
        fieldName,
        searchResult.blindIndex
      );
    } else {
      // Use search tokens for partial match
      const searchResult = this.createSearchableIndex(searchValue);
      // Query using first token (most specific)
      const token = searchResult.searchTokens[0];
      results = await searchableEncryptionDb.queryBySearchToken(
        organizationId,
        fieldName,
        token
      );
    }

    // Log search audit event
    await encryptionAuditService.logEvent({
      organizationId,
      eventType: EncryptionEventType.SEARCH_OPERATION,
      operation: EncryptionOperation.SEARCH_ENCRYPTED,
      status: 'success',
      fieldName,
      duration: Date.now() - startTime,
      metadata: { resultCount: results.length, exactMatch }
    });

    return results;
  } catch (error) {
    logger.error('Search encrypted field failed', {
      organizationId,
      fieldName,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}
```

### Priority 3: Update Encryption Audit Service

Modify `src/services/encryption-audit.service.ts`:

**Replace the `storeAuditEvent` method** (around line 290):

```typescript
/**
 * Store audit event in database
 */
private async storeAuditEvent(event: EncryptionAuditEvent & { integrityHash: string }): Promise<void> {
  try {
    await this.prisma.encryptionAuditLog.create({
      data: {
        organizationId: event.organizationId,
        operation: event.operation,
        entityType: event.modelName,
        entityId: event.recordId,
        fieldName: event.fieldName,
        duration: event.duration || 0,
        dataSize: event.dataSize,
        keyVersion: event.keyVersion || 1,
        algorithm: 'aes-256-gcm',
        userId: event.userId,
        ipAddress: event.ipAddress,
        userAgent: event.userAgent,
        success: event.status === 'success',
        errorMessage: event.error,
        timestamp: event.timestamp
      }
    });

    logger.debug('Audit event persisted to database', { eventId: event.id });
  } catch (error) {
    logger.error('Failed to persist audit event', {
      eventId: event.id,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}

/**
 * Get audit events from database
 */
public async getAuditEvents(query: AuditQuery): Promise<EncryptionAuditEvent[]> {
  const where: any = {};

  if (query.organizationId) where.organizationId = query.organizationId;
  if (query.operation) where.operation = query.operation;
  if (query.status === 'success') where.success = true;
  if (query.status === 'failure') where.success = false;

  if (query.startDate || query.endDate) {
    where.timestamp = {};
    if (query.startDate) where.timestamp.gte = query.startDate;
    if (query.endDate) where.timestamp.lte = query.endDate;
  }

  const records = await this.prisma.encryptionAuditLog.findMany({
    where,
    orderBy: { timestamp: 'desc' },
    take: query.limit || 1000,
    skip: query.offset || 0
  });

  // Transform database records to EncryptionAuditEvent format
  return records.map(record => ({
    id: record.id,
    organizationId: record.organizationId,
    userId: record.userId || undefined,
    eventType: this.mapOperationToEventType(record.operation),
    operation: record.operation as EncryptionOperation,
    status: record.success ? 'success' : 'failure',
    modelName: record.entityType || undefined,
    fieldName: record.fieldName || undefined,
    recordId: record.entityId || undefined,
    keyVersion: record.keyVersion,
    ipAddress: record.ipAddress || undefined,
    userAgent: record.userAgent || undefined,
    duration: record.duration,
    dataSize: record.dataSize || undefined,
    error: record.errorMessage || undefined,
    complianceFlags: [],
    riskLevel: 'low',
    timestamp: record.timestamp
  }));
}

private mapOperationToEventType(operation: string): EncryptionEventType {
  const mapping: Record<string, EncryptionEventType> = {
    'ENCRYPT': EncryptionEventType.DATA_ENCRYPTION,
    'DECRYPT': EncryptionEventType.DATA_DECRYPTION,
    'KEY_ROTATION': EncryptionEventType.KEY_ROTATION,
    'KEY_DERIVATION': EncryptionEventType.KEY_GENERATION
  };
  return mapping[operation] || EncryptionEventType.SYSTEM_EVENT;
}
```

### Priority 4: Compliance Validation Service (NEW)

Create `src/services/compliance-validation.service.ts`:

**Full implementation** (estimated 600 lines). This is a NEW service.

See the implementation report for detailed structure. Key exports:

```typescript
export const complianceValidation = new ComplianceValidationService();

// Usage:
const pciReport = await complianceValidation.validatePciDss('org_123');
const gdprReport = await complianceValidation.validateGdpr('org_123');
const fipsReport = await complianceValidation.validateFips('org_123');
const fullReport = await complianceValidation.generateComplianceReport('org_123');
```

### Priority 5: AWS CloudHSM Service (Production Only)

Create `src/services/aws-cloudhsm.service.ts`:

**NOTE**: Only implement if deploying to production with CloudHSM. For development, leave as stub.

```typescript
// Stub implementation for development
class AwsCloudHsmService {
  private enabled: boolean = process.env.USE_CLOUDHSM === 'true';

  async initializeHsm(): Promise<void> {
    if (!this.enabled) {
      logger.info('CloudHSM disabled, using software-based encryption');
      return;
    }
    // Production implementation...
  }

  // Additional methods...
}

export const awsCloudHsm = new AwsCloudHsmService();
```

## Step 5: Integration Tests

Create `tests/integration/searchable-encryption.test.ts`:

```typescript
import { fieldEncryptionService } from '@/services/field-encryption.service';
import { searchableEncryptionDb } from '@/services/searchable-encryption-db.service';
import { prisma } from '@/config/database';

describe('Searchable Encryption Integration', () => {
  let testOrg: any;

  beforeAll(async () => {
    testOrg = await prisma.organization.findFirst();
  });

  afterAll(async () => {
    await prisma.searchIndex.deleteMany({
      where: { organizationId: testOrg.id }
    });
  });

  it('should encrypt and store searchable index', async () => {
    const email = 'test@example.com';

    const encrypted = await fieldEncryptionService.encryptFieldWithIndex(
      email,
      {
        organizationId: testOrg.id,
        fieldName: 'email',
        searchable: true,
        entityType: 'Customer',
        entityId: 'test-customer-1',
        ttlDays: 365
      }
    );

    expect(encrypted).toBeTruthy();
    expect(encrypted).not.toBe(email);

    // Verify index was stored
    const index = await prisma.searchIndex.findFirst({
      where: {
        organizationId: testOrg.id,
        entityType: 'Customer',
        entityId: 'test-customer-1'
      }
    });

    expect(index).toBeTruthy();
    expect(index?.fieldName).toBe('email');
  });

  it('should search by blind index', async () => {
    const email = 'search-test@example.com';

    // Encrypt and index
    await fieldEncryptionService.encryptFieldWithIndex(
      email,
      {
        organizationId: testOrg.id,
        fieldName: 'email',
        searchable: true,
        entityType: 'Customer',
        entityId: 'search-customer-1'
      }
    );

    // Search
    const results = await fieldEncryptionService.searchEncryptedField(
      testOrg.id,
      'email',
      email,
      true
    );

    expect(results).toHaveLength(1);
    expect(results[0].entityId).toBe('search-customer-1');
  });

  it('should purge expired indexes', async () => {
    // Create index with 0 day TTL (immediate expiration)
    await fieldEncryptionService.encryptFieldWithIndex(
      'expire-test@example.com',
      {
        organizationId: testOrg.id,
        fieldName: 'email',
        searchable: true,
        entityType: 'Customer',
        entityId: 'expire-customer-1',
        ttlDays: -1  // Already expired
      }
    );

    // Purge
    const deletedCount = await searchableEncryptionDb.purgeExpiredIndexes();

    expect(deletedCount).toBeGreaterThan(0);
  });
});
```

## Step 6: Run Tests

```bash
# Run integration tests
npm run test:integration

# Run specific test file
npm run test:integration -- tests/integration/searchable-encryption.test.ts

# Check coverage
npm run test:coverage
```

## Step 7: API Usage Examples

### In Customer Controller

```typescript
// Before (old way)
const encryptedEmail = await fieldEncryptionService.encryptField(
  customer.email,
  { organizationId, fieldName: 'email', searchable: true }
);

// After (new way with database index)
const encryptedEmail = await fieldEncryptionService.encryptFieldWithIndex(
  customer.email,
  {
    organizationId,
    fieldName: 'email',
    searchable: true,
    entityType: 'Customer',
    entityId: customer.id,
    ttlDays: 365  // GDPR compliance
  }
);
```

### Search for Encrypted Email

```typescript
// New endpoint: GET /api/v1/organizations/:orgId/customers/search
export const searchCustomersByEmail = async (req, res) => {
  const { email } = req.query;

  // Search encrypted emails
  const results = await fieldEncryptionService.searchEncryptedField(
    req.params.orgId,
    'email',
    email as string,
    true  // exact match
  );

  // Load full customer records
  const customers = await prisma.customer.findMany({
    where: {
      id: { in: results.map(r => r.entityId) }
    }
  });

  res.json(customers);
};
```

## Step 8: Scheduled Tasks (Cron Jobs)

Add to your cron configuration:

```typescript
// Clean up expired search indexes (daily)
cron.schedule('0 2 * * *', async () => {
  logger.info('Running search index cleanup');
  const deleted = await searchableEncryptionDb.purgeExpiredIndexes();
  logger.info(`Deleted ${deleted} expired search indexes`);
});

// Archive old encryption audit logs (weekly)
cron.schedule('0 3 * * 0', async () => {
  logger.info('Running encryption audit log archive');
  const retentionDate = new Date(Date.now() - ENCRYPTION_AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  // Archive logic here
});
```

## Troubleshooting

### Issue: Migration fails

```bash
# Reset database (development only!)
npx prisma migrate reset --force

# Re-run migration
npx prisma migrate dev
```

### Issue: Search returns no results

Check:
1. Search index was stored (`SELECT * FROM search_indexes`)
2. Index not expired (`expiresAt > NOW()`)
3. Correct organizationId filter
4. Blind index matches exactly

### Issue: Performance slow

Solutions:
1. Verify database indexes: `EXPLAIN QUERY PLAN SELECT...`
2. Add composite index on frequently queried fields
3. Implement search result caching
4. Use blind index instead of search tokens

## Production Checklist

- [ ] Database migration applied
- [ ] Environment variables configured
- [ ] Integration tests passing (100%)
- [ ] CloudHSM configured (if enabled)
- [ ] Cron jobs scheduled
- [ ] Monitoring alerts configured
- [ ] Compliance reports generated
- [ ] Security review completed
- [ ] Documentation updated
- [ ] Team training completed

## Support

For questions or issues:
1. Check implementation report: `/docs/ENCRYPTION_PRODUCTION_READINESS_IMPLEMENTATION.md`
2. Review test files for usage examples
3. Consult with security team for compliance questions

---

**Quick Start Version**: 1.0
**Last Updated**: 2025-01-02
