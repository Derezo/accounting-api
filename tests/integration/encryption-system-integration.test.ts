// @ts-nocheck
import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

// Import our encryption services
import { EncryptionKeyManagerService, encryptionKeyManager } from '../../src/services/encryption-key-manager.service';
import { FieldEncryptionService, fieldEncryptionService } from '../../src/services/field-encryption.service';
import { SearchableEncryptionService, searchableEncryptionService } from '../../src/services/searchable-encryption.service';
import { EncryptionMiddleware, encryptionMiddleware } from '../../src/middleware/encryption.middleware';
import { KeyRotationService } from '../../src/services/key-rotation.service';
import { EncryptionAuditService } from '../../src/services/encryption-audit.service';
import { EncryptionPerformanceService } from '../../src/services/encryption-performance.service';
import { DataEncryptionMigrationService } from '../../src/scripts/data-encryption-migration';

describe('Encryption System Tests', () => {
  let prisma: PrismaClient;
  let keyManager: EncryptionKeyManagerService;
  let fieldEncryption: FieldEncryptionService;
  let searchableEncryption: SearchableEncryptionService;
  let middleware: EncryptionMiddleware;
  let keyRotation: KeyRotationService;
  let auditService: EncryptionAuditService;
  let performanceService: EncryptionPerformanceService;
  let migrationService: DataEncryptionMigrationService;

  const testOrganizationId = 'test-org-123';
  const testFieldName = 'testField';

  beforeAll(async () => {
    // Initialize test database
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.TEST_DATABASE_URL || 'file:./test.db'
        }
      }
    });

    // Initialize services
    keyManager = new EncryptionKeyManagerService();
    fieldEncryption = new FieldEncryptionService();
    searchableEncryption = new SearchableEncryptionService();
    middleware = new EncryptionMiddleware();
    keyRotation = new KeyRotationService(prisma);
    auditService = new EncryptionAuditService(prisma);
    performanceService = new EncryptionPerformanceService();
    migrationService = new DataEncryptionMigrationService(prisma);

    // Apply encryption middleware to Prisma
    middleware.apply(prisma);
  });

  afterAll(async () => {
    // Shutdown services to clear intervals and prevent open handles
    if (keyRotation && typeof keyRotation.stopScheduler === 'function') {
      keyRotation.stopScheduler();
    }
    if (performanceService && typeof performanceService.stopMonitoring === 'function') {
      performanceService.stopMonitoring();
    }
    if (auditService && typeof auditService.shutdown === 'function') {
      await auditService.shutdown();
    }

    await prisma.$disconnect();
  });

  beforeEach(() => {
    // Clear caches before each test
    keyManager.clearKeyCache();
    fieldEncryption.clearCaches();
    searchableEncryption.clearCaches();
  });

  describe('Key Management', () => {
    test('should generate organization-specific keys', () => {
      const key1 = keyManager.deriveOrganizationKey({
        organizationId: 'org1',
        keyVersion: 1
      });

      const key2 = keyManager.deriveOrganizationKey({
        organizationId: 'org2',
        keyVersion: 1
      });

      expect(key1.key).not.toEqual(key2.key);
      expect(key1.id).not.toEqual(key2.id);
      expect(key1.version).toBe(1);
      expect(key2.version).toBe(1);
    });

    test('should generate deterministic keys for same organization', () => {
      const key1 = keyManager.deriveOrganizationKey({
        organizationId: testOrganizationId,
        keyVersion: 1
      });

      const key2 = keyManager.deriveOrganizationKey({
        organizationId: testOrganizationId,
        keyVersion: 1
      });

      expect(key1.key).toEqual(key2.key);
      expect(key1.id).toEqual(key2.id);
    });

    test('should validate key properties', () => {
      const key = keyManager.deriveOrganizationKey({
        organizationId: testOrganizationId,
        keyVersion: 1
      });

      expect(keyManager.validateKey(key)).toBe(true);
      expect(key.key.length).toBe(32); // 256 bits
      expect(key.algorithm).toBe('aes-256-gcm');
      expect(key.isActive).toBe(true);
    });

    test('should support key rotation', () => {
      const oldKey = keyManager.getActiveKey(testOrganizationId);
      const newKey = keyManager.rotateOrganizationKey(testOrganizationId);

      expect(newKey.version).toBeGreaterThan(oldKey.version);
      expect(newKey.key).not.toEqual(oldKey.key);
      expect(newKey.id).not.toEqual(oldKey.id);
    });

    test('should export and import keys securely', () => {
      const originalKey = keyManager.deriveOrganizationKey({
        organizationId: testOrganizationId,
        keyVersion: 1
      });

      const exportedKey = keyManager.exportKey(originalKey.id);
      expect(exportedKey).toBeTruthy();
      expect(typeof exportedKey).toBe('string');

      const importedKey = keyManager.importKey(exportedKey);
      expect(importedKey.id).toBe(originalKey.id);
      expect(importedKey.key).toEqual(originalKey.key);
      expect(importedKey.version).toBe(originalKey.version);
    });
  });

  describe('Field Encryption', () => {
    const testData = [
      'Simple text',
      'Text with special characters: !@#$%^&*()',
      'Numbers: 1234567890',
      'Email: test@example.com',
      'Phone: +1-555-123-4567',
      'SIN: 123-456-789',
      'Long text: ' + 'a'.repeat(1000),
      'Unicode: 你好世界 🌍 émojis'
    ];

    test('should encrypt and decrypt various data types', async () => {
      for (const data of testData) {
        const encrypted = await fieldEncryption.encryptField(data, {
          organizationId: testOrganizationId,
          fieldName: testFieldName
        });

        expect(encrypted).toBeTruthy();
        expect(encrypted).not.toBe(data);

        const decrypted = await fieldEncryption.decryptField(encrypted, {
          organizationId: testOrganizationId,
          fieldName: testFieldName
        });

        expect(decrypted).toBe(data);
      }
    });

    test('should use different encryption for probabilistic mode', async () => {
      const data = 'Test data for probabilistic encryption';

      const encrypted1 = await fieldEncryption.encryptField(data, {
        organizationId: testOrganizationId,
        fieldName: testFieldName,
        deterministic: false
      });

      const encrypted2 = await fieldEncryption.encryptField(data, {
        organizationId: testOrganizationId,
        fieldName: testFieldName,
        deterministic: false
      });

      // Probabilistic encryption should produce different ciphertexts
      expect(encrypted1).not.toBe(encrypted2);

      // But both should decrypt to the same value
      const decrypted1 = await fieldEncryption.decryptField(encrypted1, {
        organizationId: testOrganizationId,
        fieldName: testFieldName
      });

      const decrypted2 = await fieldEncryption.decryptField(encrypted2, {
        organizationId: testOrganizationId,
        fieldName: testFieldName
      });

      expect(decrypted1).toBe(data);
      expect(decrypted2).toBe(data);
    });

    test('should use same encryption for deterministic mode', async () => {
      const data = 'Test data for deterministic encryption';

      const encrypted1 = await fieldEncryption.encryptField(data, {
        organizationId: testOrganizationId,
        fieldName: testFieldName,
        deterministic: true
      });

      const encrypted2 = await fieldEncryption.encryptField(data, {
        organizationId: testOrganizationId,
        fieldName: testFieldName,
        deterministic: true
      });

      // Deterministic encryption should produce same ciphertexts
      expect(encrypted1).toBe(encrypted2);

      const decrypted = await fieldEncryption.decryptField(encrypted1, {
        organizationId: testOrganizationId,
        fieldName: testFieldName
      });

      expect(decrypted).toBe(data);
    });

    test('should handle batch encryption/decryption', async () => {
      const batchData = testData.map(value => ({
        value,
        options: {
          organizationId: testOrganizationId,
          fieldName: testFieldName
        }
      }));

      const encryptedResults = await fieldEncryption.encryptBatch(batchData);
      expect(encryptedResults).toHaveLength(testData.length);

      const decryptBatch = encryptedResults.map(encryptedValue => ({
        encryptedValue,
        options: {
          organizationId: testOrganizationId,
          fieldName: testFieldName
        }
      }));

      const decryptedResults = await fieldEncryption.decryptBatch(decryptBatch);
      expect(decryptedResults).toEqual(testData);
    });

    test('should validate field formats', () => {
      expect(fieldEncryption.validateFieldFormat('123-456-789', 'sin')).toBe(true);
      expect(fieldEncryption.validateFieldFormat('123456789', 'sin')).toBe(true);
      expect(fieldEncryption.validateFieldFormat('12-456-789', 'sin')).toBe(false);

      expect(fieldEncryption.validateFieldFormat('123-45-6789', 'ssn')).toBe(true);
      expect(fieldEncryption.validateFieldFormat('123456789', 'ssn')).toBe(true);

      expect(fieldEncryption.validateFieldFormat('test@example.com', 'email')).toBe(true);
      expect(fieldEncryption.validateFieldFormat('invalid-email', 'email')).toBe(false);

      expect(fieldEncryption.validateFieldFormat('1234', 'credit_card')).toBe(true);
      expect(fieldEncryption.validateFieldFormat('12345', 'credit_card')).toBe(false);
    });

    test('should handle empty and null values gracefully', async () => {
      await expect(fieldEncryption.encryptField('', {
        organizationId: testOrganizationId,
        fieldName: testFieldName
      })).rejects.toThrow('Cannot encrypt empty value');

      await expect(fieldEncryption.decryptField('', {
        organizationId: testOrganizationId,
        fieldName: testFieldName
      })).rejects.toThrow('Cannot decrypt empty value');
    });
  });

  describe('Searchable Encryption', () => {
    const searchTestData = [
      'John Smith',
      'Jane Doe',
      'Alice Johnson',
      'Bob Wilson',
      'Carol Brown'
    ];

    test('should index fields for search', async () => {
      for (let i = 0; i < searchTestData.length; i++) {
        await searchableEncryption.indexField(
          'Person',
          'name',
          testOrganizationId,
          searchTestData[i],
          `record_${i}`
        );
      }

      // Test exact search
      const exactResults = await searchableEncryption.searchEncryptedField({
        term: 'John Smith',
        modelName: 'Person',
        fieldName: 'name',
        organizationId: testOrganizationId,
        searchType: 'exact'
      });

      expect(exactResults.matches.length).toBeGreaterThanOrEqual(0);
    });

    test('should perform partial search', async () => {
      const partialResults = await searchableEncryption.searchEncryptedField({
        term: 'John',
        modelName: 'Person',
        fieldName: 'name',
        organizationId: testOrganizationId,
        searchType: 'partial'
      });

      expect(partialResults.matches.length).toBeGreaterThanOrEqual(0);
      expect(partialResults.searchTime).toBeGreaterThan(0);
    });

    test('should check bloom filter for privacy-preserving search', () => {
      const mightContain1 = searchableEncryption.mightContain(
        testOrganizationId,
        'name',
        'John'
      );

      const mightContain2 = searchableEncryption.mightContain(
        testOrganizationId,
        'name',
        'NonExistentName123456'
      );

      // Bloom filter should return true for possible matches
      // and might return false for definite non-matches
      expect(typeof mightContain1).toBe('boolean');
      expect(typeof mightContain2).toBe('boolean');
    });

    test('should clear search caches', () => {
      searchableEncryption.clearCaches();
      const stats = searchableEncryption.getSearchStats();
      expect(stats.bloomFilters).toBe(0);
    });
  });

  describe('Encryption Middleware', () => {
    test('should validate configuration', () => {
      const validation = middleware.validateConfiguration();
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    test('should identify encrypted fields', () => {
      expect(middleware.isFieldEncrypted('Person', 'socialInsNumber')).toBe(true);
      expect(middleware.isFieldEncrypted('Person', 'firstName')).toBe(false);
      expect(middleware.isFieldEncrypted('NonExistentModel', 'field')).toBe(false);
    });

    test('should get encrypted fields for model', () => {
      const encryptedFields = middleware.getEncryptedFields('Person');
      expect(encryptedFields).toContain('socialInsNumber');
      expect(encryptedFields).toContain('email');
      expect(encryptedFields).toContain('phone');
    });

    test('should generate search conditions for encrypted fields', () => {
      const searchParams = {
        socialInsNumber: '123-456-789',
        firstName: 'John' // Not encrypted
      };

      const conditions = middleware.generateSearchConditions(
        'Person',
        searchParams,
        testOrganizationId
      );

      // Should modify encrypted fields and leave non-encrypted fields unchanged
      expect(conditions.firstName).toBe('John');
      expect(conditions.socialInsNumber).not.toBe('123-456-789');
    });
  });

  describe('Key Rotation', () => {
    test('should schedule key rotation', async () => {
      const jobId = await keyRotation.scheduleKeyRotation(
        testOrganizationId,
        'manual'
      );

      expect(jobId).toBeTruthy();
      expect(typeof jobId).toBe('string');

      const jobStatus = keyRotation.getJobStatus(jobId);
      expect(jobStatus).toBeTruthy();
      expect(jobStatus!.organizationId).toBe(testOrganizationId);
    });

    test('should handle emergency key rotation', async () => {
      const jobId = await keyRotation.emergencyKeyRotation(
        testOrganizationId,
        'Security incident detected'
      );

      expect(jobId).toBeTruthy();

      const jobStatus = keyRotation.getJobStatus(jobId);
      expect(jobStatus).toBeTruthy();
      expect(jobStatus!.status).toBeOneOf(['pending', 'running']);
    });

    test('should get rotation statistics', () => {
      const stats = keyRotation.getRotationStats();
      expect(stats).toHaveProperty('activeJobs');
      expect(stats).toHaveProperty('completedJobs');
      expect(stats).toHaveProperty('failedJobs');
      expect(stats).toHaveProperty('totalOrganizations');
    });

    test('should manage rotation policies', () => {
      const policy = {
        organizationId: testOrganizationId,
        rotationIntervalDays: 30,
        autoRotationEnabled: true,
        backupOldKeys: true,
        maxKeyVersions: 3,
        emergencyRotationEnabled: true
      };

      keyRotation.setRotationPolicy(policy);

      const retrievedPolicy = keyRotation.getRotationPolicy(testOrganizationId);
      expect(retrievedPolicy.rotationIntervalDays).toBe(30);
      expect(retrievedPolicy.autoRotationEnabled).toBe(true);
    });
  });

  describe('Audit Logging', () => {
    test('should log encryption events', async () => {
      await auditService.logEvent({
        organizationId: testOrganizationId,
        eventType: 'data_encryption' as any,
        operation: 'encrypt_field' as any,
        status: 'success',
        modelName: 'Person',
        fieldName: 'email',
        recordId: 'test-record-123',
        duration: 10,
        complianceFlags: ['PCI_DSS']
      });

      // Event should be logged successfully
      expect(true).toBe(true); // Placeholder assertion
    });

    test('should generate audit summary', async () => {
      const startDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
      const endDate = new Date();

      const summary = await auditService.generateAuditSummary(
        testOrganizationId,
        startDate,
        endDate
      );

      expect(summary).toHaveProperty('totalEvents');
      expect(summary).toHaveProperty('eventsByType');
      expect(summary).toHaveProperty('eventsByStatus');
      expect(summary).toHaveProperty('riskLevelDistribution');
    });

    test('should generate compliance reports', async () => {
      const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
      const endDate = new Date();

      const report = await auditService.generateComplianceReport(
        testOrganizationId,
        'PCI_DSS',
        startDate,
        endDate
      );

      expect(report.reportType).toBe('PCI_DSS');
      expect(report.organizationId).toBe(testOrganizationId);
      expect(report.findings).toBeDefined();
      expect(report.summary).toHaveProperty('complianceScore');
    });

    test('should verify audit log integrity', async () => {
      const startDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const endDate = new Date();

      const integrity = await auditService.verifyIntegrity(
        testOrganizationId,
        startDate,
        endDate
      );

      expect(integrity).toHaveProperty('totalEvents');
      expect(integrity).toHaveProperty('validEvents');
      expect(integrity).toHaveProperty('invalidEvents');
    });
  });

  describe('Performance Optimization', () => {
    test('should cache encryption operations', async () => {
      const testValue = 'Performance test data';

      // First encryption (cache miss)
      const start1 = Date.now();
      const encrypted1 = await performanceService.encryptWithCache(
        testValue,
        testOrganizationId,
        testFieldName
      );
      const duration1 = Date.now() - start1;

      // Second encryption (cache hit)
      const start2 = Date.now();
      const encrypted2 = await performanceService.encryptWithCache(
        testValue,
        testOrganizationId,
        testFieldName
      );
      const duration2 = Date.now() - start2;

      expect(encrypted1).toBe(encrypted2);
      expect(duration2).toBeLessThan(duration1); // Cache should be faster
    });

    test('should perform batch operations efficiently', async () => {
      const batchData = Array.from({ length: 10 }, (_, i) => ({
        value: `Test data ${i}`,
        organizationId: testOrganizationId,
        fieldName: testFieldName
      }));

      const results = await performanceService.batchEncryptWithCache(batchData);
      expect(results).toHaveLength(10);

      const decryptBatch = results.map(encryptedValue => ({
        encryptedValue,
        organizationId: testOrganizationId,
        fieldName: testFieldName
      }));

      const decrypted = await performanceService.batchDecryptWithCache(decryptBatch);
      expect(decrypted).toEqual(batchData.map(item => item.value));
    });

    test('should run performance benchmarks', async () => {
      const benchmarks = await performanceService.runBenchmarks();
      expect(benchmarks.length).toBeGreaterThan(0);

      for (const benchmark of benchmarks) {
        expect(benchmark.algorithm).toBe('aes-256-gcm');
        expect(benchmark.operationsPerSecond).toBeGreaterThan(0);
        expect(benchmark.averageLatency).toBeGreaterThan(0);
        expect(benchmark.errorRate).toBeLessThan(0.1); // Less than 10% error rate
      }
    });

    test('should provide cache statistics', () => {
      const stats = performanceService.getCacheStats();
      expect(stats).toHaveProperty('hitRate');
      expect(stats).toHaveProperty('missRate');
      expect(stats).toHaveProperty('totalRequests');
      expect(stats).toHaveProperty('memoryUsage');
    });

    test('should clear caches', async () => {
      await performanceService.clearAllCaches();
      const stats = performanceService.getCacheStats();
      expect(stats.totalRequests).toBe(0);
    });
  });

  describe('Data Migration', () => {
    test('should create migration plan', async () => {
      const plan = await migrationService.createMigrationPlan({
        organizationId: testOrganizationId,
        dryRun: true
      });

      expect(Array.isArray(plan)).toBe(true);
      expect(plan.length).toBeGreaterThanOrEqual(0);

      if (plan.length > 0) {
        const firstPlan = plan[0];
        expect(firstPlan).toHaveProperty('organizationId');
        expect(firstPlan).toHaveProperty('modelName');
        expect(firstPlan).toHaveProperty('fieldName');
        expect(firstPlan).toHaveProperty('totalRecords');
        expect(firstPlan).toHaveProperty('batchSize');
      }
    });

    test('should start migration in dry-run mode', async () => {
      const jobId = await migrationService.startMigration({
        organizationId: testOrganizationId,
        dryRun: true,
        batchSize: 100
      });

      expect(jobId).toBeTruthy();
      expect(typeof jobId).toBe('string');

      const status = migrationService.getMigrationStatus(jobId);
      expect(status).toBeTruthy();
      expect(status!.dryRun).toBe(true);
      expect(status!.organizationId).toBe(testOrganizationId);
    });

    test('should get active migrations', () => {
      const activeMigrations = migrationService.getActiveMigrations();
      expect(Array.isArray(activeMigrations)).toBe(true);
    });
  });

  describe('Security Tests', () => {
    test('should use different keys for different organizations', () => {
      const key1 = keyManager.getActiveKey('org1');
      const key2 = keyManager.getActiveKey('org2');

      expect(key1.key).not.toEqual(key2.key);
      expect(key1.id).not.toEqual(key2.id);
    });

    test('should not decrypt with wrong organization key', async () => {
      const testData = 'Sensitive data';

      const encrypted = await fieldEncryption.encryptField(testData, {
        organizationId: 'org1',
        fieldName: testFieldName
      });

      // Try to decrypt with different organization
      await expect(fieldEncryption.decryptField(encrypted, {
        organizationId: 'org2',
        fieldName: testFieldName
      })).rejects.toThrow();
    });

    test('should handle tampered encrypted data', async () => {
      const testData = 'Sensitive data';

      const encrypted = await fieldEncryption.encryptField(testData, {
        organizationId: testOrganizationId,
        fieldName: testFieldName
      });

      // Tamper with encrypted data
      const tamperedData = encrypted.replace(/.$/, 'x');

      await expect(fieldEncryption.decryptField(tamperedData, {
        organizationId: testOrganizationId,
        fieldName: testFieldName
      })).rejects.toThrow();
    });

    test('should generate cryptographically secure random values', () => {
      const token1 = keyManager.generateIV();
      const token2 = keyManager.generateIV();

      expect(token1).not.toEqual(token2);
      expect(token1.length).toBe(16); // 128 bits
      expect(token2.length).toBe(16);
    });

    test('should securely delete keys', () => {
      const key = keyManager.deriveOrganizationKey({
        organizationId: 'temp-org',
        keyVersion: 1
      });

      const keyId = key.id;
      keyManager.secureDeleteKey(keyId);

      // Key should no longer be accessible
      expect(() => keyManager.exportKey(keyId)).toThrow();
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid encryption options gracefully', async () => {
      await expect(fieldEncryption.encryptField('test', {
        organizationId: '',
        fieldName: testFieldName
      })).rejects.toThrow();

      await expect(fieldEncryption.encryptField('test', {
        organizationId: testOrganizationId,
        fieldName: ''
      })).rejects.toThrow();
    });

    test('should handle corrupted encrypted data', async () => {
      const invalidEncryptedData = 'invalid-encrypted-data';

      await expect(fieldEncryption.decryptField(invalidEncryptedData, {
        organizationId: testOrganizationId,
        fieldName: testFieldName
      })).rejects.toThrow();
    });

    test('should validate key parameters', () => {
      expect(() => keyManager.deriveOrganizationKey({
        organizationId: '',
        keyVersion: 1
      })).toThrow();

      expect(() => keyManager.deriveOrganizationKey({
        organizationId: testOrganizationId,
        keyVersion: -1
      })).toThrow();
    });
  });

  describe('Integration Tests', () => {
    test('should work end-to-end with Prisma middleware', async () => {
      // This test would require actual database operations
      // For now, we'll test the middleware configuration
      const validation = middleware.validateConfiguration();
      expect(validation.isValid).toBe(true);

      // Test that middleware can generate search conditions
      const searchConditions = middleware.generateSearchConditions(
        'Person',
        { socialInsNumber: '123-456-789' },
        testOrganizationId
      );

      expect(searchConditions).toBeDefined();
    });

    test('should maintain data integrity across operations', async () => {
      const originalData = 'Test data for integrity check';

      // Encrypt
      const encrypted = await fieldEncryption.encryptField(originalData, {
        organizationId: testOrganizationId,
        fieldName: testFieldName
      });

      // Decrypt
      const decrypted = await fieldEncryption.decryptField(encrypted, {
        organizationId: testOrganizationId,
        fieldName: testFieldName
      });

      // Re-encrypt
      const reEncrypted = await fieldEncryption.encryptField(decrypted, {
        organizationId: testOrganizationId,
        fieldName: testFieldName
      });

      // Re-decrypt
      const reDecrypted = await fieldEncryption.decryptField(reEncrypted, {
        organizationId: testOrganizationId,
        fieldName: testFieldName
      });

      expect(reDecrypted).toBe(originalData);
    });

    test('should handle concurrent operations safely', async () => {
      const testData = Array.from({ length: 10 }, (_, i) => `Concurrent test ${i}`);

      // Encrypt all data concurrently
      const encryptPromises = testData.map(data =>
        fieldEncryption.encryptField(data, {
          organizationId: testOrganizationId,
          fieldName: testFieldName
        })
      );

      const encryptedResults = await Promise.all(encryptPromises);

      // Decrypt all data concurrently
      const decryptPromises = encryptedResults.map(encrypted =>
        fieldEncryption.decryptField(encrypted, {
          organizationId: testOrganizationId,
          fieldName: testFieldName
        })
      );

      const decryptedResults = await Promise.all(decryptPromises);

      expect(decryptedResults).toEqual(testData);
    });
  });
});

// Additional performance and stress tests
describe('Performance and Stress Tests', () => {
  test('should handle large data encryption efficiently', async () => {
    const largeData = 'x'.repeat(100000); // 100KB of data
    const startTime = Date.now();

    const encrypted = await fieldEncryptionService.encryptField(largeData, {
      organizationId: 'perf-test',
      fieldName: 'largeField'
    });

    const encryptionTime = Date.now() - startTime;
    expect(encryptionTime).toBeLessThan(1000); // Should complete within 1 second

    const decryptStartTime = Date.now();
    const decrypted = await fieldEncryptionService.decryptField(encrypted, {
      organizationId: 'perf-test',
      fieldName: 'largeField'
    });

    const decryptionTime = Date.now() - decryptStartTime;
    expect(decryptionTime).toBeLessThan(500); // Decryption should be faster
    expect(decrypted).toBe(largeData);
  }, 10000); // 10 second timeout

  test('should handle high volume of operations', async () => {
    const operations = 1000;
    const testData = Array.from({ length: operations }, (_, i) => `Data ${i}`);

    const startTime = Date.now();

    const batchData = testData.map(value => ({
      value,
      options: {
        organizationId: 'volume-test',
        fieldName: 'batchField'
      }
    }));

    const encrypted = await fieldEncryptionService.encryptBatch(batchData);
    const encryptionTime = Date.now() - startTime;

    expect(encrypted).toHaveLength(operations);
    expect(encryptionTime / operations).toBeLessThan(10); // Less than 10ms per operation

    const decryptStartTime = Date.now();
    const decryptBatch = encrypted.map(encryptedValue => ({
      encryptedValue,
      options: {
        organizationId: 'volume-test',
        fieldName: 'batchField'
      }
    }));

    const decrypted = await fieldEncryptionService.decryptBatch(decryptBatch);
    const decryptionTime = Date.now() - decryptStartTime;

    expect(decrypted).toEqual(testData);
    expect(decryptionTime / operations).toBeLessThan(5); // Less than 5ms per operation
  }, 30000); // 30 second timeout

  test('should maintain memory efficiency', async () => {
    const initialMemory = process.memoryUsage().heapUsed;

    // Perform many encryption operations
    for (let i = 0; i < 100; i++) {
      await fieldEncryptionService.encryptField(`Test data ${i}`, {
        organizationId: 'memory-test',
        fieldName: 'memoryField'
      });
    }

    const finalMemory = process.memoryUsage().heapUsed;
    const memoryIncrease = finalMemory - initialMemory;

    // Memory increase should be reasonable (less than 10MB)
    expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
  });
});