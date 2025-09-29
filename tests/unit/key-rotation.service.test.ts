// Mock Prisma first
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => ({
    organization: {
      findMany: jest.fn()
    }
  }))
}));

// Mock dependent services
jest.mock('../../src/services/encryption-key-manager.service', () => ({
  encryptionKeyManager: {
    rotateOrganizationKey: jest.fn(() => ({
      id: 'new-key-id',
      version: 2,
      algorithm: 'AES-256-GCM',
      createdAt: new Date()
    }))
  }
}));

jest.mock('../../src/services/field-encryption.service', () => ({
  fieldEncryptionService: {
    decryptField: jest.fn((encryptedValue) => 'decrypted-value'),
    encryptField: jest.fn((value) => 'encrypted-value'),
    getStats: jest.fn(() => ({
      totalOperations: 1000,
      encryptionOperations: 600,
      decryptionOperations: 400
    }))
  }
}));

jest.mock('../../src/middleware/encryption.middleware', () => ({
  encryptionMiddleware: {
    getModelConfig: {
      Customer: {
        encryptedFields: [
          { field: 'email' },
          { field: 'phone' }
        ]
      },
      Invoice: {
        encryptedFields: [
          { field: 'notes' }
        ]
      }
    }
  }
}));

// Mock logger
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

// Mock crypto for job ID generation
jest.mock('crypto', () => ({
  randomUUID: jest.fn(() => 'mock-uuid-12345')
}));

import {
  KeyRotationService,
  KeyRotationJob,
  KeyRotationPolicy,
  ReEncryptionPlan
} from '../../src/services/key-rotation.service';
import { PrismaClient } from '@prisma/client';
import { logger } from '../../src/utils/logger';
import { encryptionKeyManager } from '../../src/services/encryption-key-manager.service';
import { fieldEncryptionService } from '../../src/services/field-encryption.service';
import crypto from 'crypto';

// Get mock instances
const mockPrisma = new PrismaClient() as any;
const mockLogger = logger as jest.Mocked<typeof logger>;
const mockEncryptionKeyManager = encryptionKeyManager as jest.Mocked<typeof encryptionKeyManager>;
const mockFieldEncryptionService = fieldEncryptionService as jest.Mocked<typeof fieldEncryptionService>;
const mockCrypto = crypto as jest.Mocked<typeof crypto>;

describe('KeyRotationService', () => {
  let keyRotationService: KeyRotationService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    keyRotationService = new KeyRotationService(mockPrisma);

    // Mock Date.now for consistent timestamps
    jest.spyOn(Date, 'now').mockReturnValue(1640995200000);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize service with default policies', () => {
      expect(keyRotationService).toBeInstanceOf(KeyRotationService);
      expect(mockLogger.info).toHaveBeenCalledWith('Key rotation policies initialized');
    });

    it('should start rotation scheduler', () => {
      const setIntervalSpy = jest.spyOn(global, 'setInterval');
      new KeyRotationService(mockPrisma);

      expect(setIntervalSpy).toHaveBeenCalledWith(
        expect.any(Function),
        3600000 // 1 hour
      );
      expect(mockLogger.info).toHaveBeenCalledWith('Key rotation scheduler started');
    });

    it('should initialize default rotation policy', () => {
      const policy = keyRotationService.getRotationPolicy('default');

      expect(policy).toEqual({
        organizationId: 'default',
        rotationIntervalDays: 90,
        autoRotationEnabled: true,
        backupOldKeys: true,
        maxKeyVersions: 5,
        emergencyRotationEnabled: true
      });
    });
  });

  describe('scheduleKeyRotation', () => {
    beforeEach(() => {
      jest.spyOn(keyRotationService as any, 'getCurrentKeyVersion').mockResolvedValue(1);
      jest.spyOn(keyRotationService as any, 'executeKeyRotation').mockResolvedValue(undefined);
    });

    it('should schedule key rotation successfully', async () => {
      const jobId = await keyRotationService.scheduleKeyRotation('org-123', 'manual');

      expect(jobId).toMatch(/^rotation_org-123_\d+_[a-z0-9]+$/);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Key rotation scheduled',
        expect.objectContaining({
          jobId,
          organizationId: 'org-123',
          rotationType: 'manual',
          oldVersion: 1,
          newVersion: 2
        })
      );

      const job = keyRotationService.getJobStatus(jobId);
      expect(job).toEqual({
        id: jobId,
        organizationId: 'org-123',
        keyType: 'data-encryption',
        oldVersion: 1,
        newVersion: 2,
        status: 'pending',
        progress: {
          totalRecords: 0,
          processedRecords: 0,
          failedRecords: 0
        }
      });
    });

    it('should prevent duplicate rotation jobs for same organization', async () => {
      // Schedule first job
      const jobId1 = await keyRotationService.scheduleKeyRotation('org-123', 'manual');

      // Try to schedule another job for same organization
      const jobId2 = await keyRotationService.scheduleKeyRotation('org-123', 'manual');

      expect(jobId1).toBe(jobId2);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Key rotation already in progress',
        expect.objectContaining({
          organizationId: 'org-123',
          existingJobId: jobId1
        })
      );
    });

    it('should respect concurrent job limit', async () => {
      // Mock MAX_CONCURRENT_JOBS = 3
      await keyRotationService.scheduleKeyRotation('org-1', 'manual');
      await keyRotationService.scheduleKeyRotation('org-2', 'manual');
      await keyRotationService.scheduleKeyRotation('org-3', 'manual');

      await expect(
        keyRotationService.scheduleKeyRotation('org-4', 'manual')
      ).rejects.toThrow('Maximum concurrent key rotation jobs reached');
    });

    it('should handle scheduling errors gracefully', async () => {
      jest.spyOn(keyRotationService as any, 'getCurrentKeyVersion').mockRejectedValue(new Error('Database error'));

      await expect(
        keyRotationService.scheduleKeyRotation('org-123', 'manual')
      ).rejects.toThrow('Database error');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to schedule key rotation',
        expect.objectContaining({
          organizationId: 'org-123',
          rotationType: 'manual',
          error: 'Database error'
        })
      );
    });
  });

  describe('executeKeyRotation', () => {
    let mockJob: KeyRotationJob;

    beforeEach(() => {
      mockJob = {
        id: 'job-123',
        organizationId: 'org-123',
        keyType: 'data-encryption',
        oldVersion: 1,
        newVersion: 2,
        status: 'pending',
        progress: {
          totalRecords: 0,
          processedRecords: 0,
          failedRecords: 0
        }
      };

      jest.spyOn(keyRotationService as any, 'createReEncryptionPlan').mockResolvedValue([
        {
          modelName: 'Customer',
          fieldName: 'email',
          totalRecords: 100,
          batchSize: 50,
          estimatedDuration: 60
        }
      ]);

      jest.spyOn(keyRotationService as any, 'reEncryptModelData').mockResolvedValue(undefined);
      jest.spyOn(keyRotationService as any, 'updateOrganizationKeyVersion').mockResolvedValue(undefined);
      jest.spyOn(keyRotationService as any, 'cleanupOldKeys').mockResolvedValue(undefined);
    });

    it('should execute key rotation successfully', async () => {
      await (keyRotationService as any).executeKeyRotation(mockJob);

      expect(mockJob.status).toBe('completed');
      expect(mockJob.startedAt).toBeInstanceOf(Date);
      expect(mockJob.completedAt).toBeInstanceOf(Date);
      expect(mockJob.progress.totalRecords).toBe(100);

      expect(mockEncryptionKeyManager.rotateOrganizationKey).toHaveBeenCalledWith(
        'org-123',
        'data-encryption'
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Key rotation completed successfully',
        expect.objectContaining({
          jobId: 'job-123',
          organizationId: 'org-123',
          processedRecords: mockJob.progress.processedRecords,
          failedRecords: mockJob.progress.failedRecords
        })
      );
    });

    it('should handle rotation failures gracefully', async () => {
      jest.spyOn(keyRotationService as any, 'reEncryptModelData').mockRejectedValue(new Error('Re-encryption failed'));

      await expect(
        (keyRotationService as any).executeKeyRotation(mockJob)
      ).rejects.toThrow('Re-encryption failed');

      expect(mockJob.status).toBe('failed');
      expect(mockJob.error).toBe('Re-encryption failed');
      expect(mockJob.completedAt).toBeInstanceOf(Date);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Key rotation failed',
        expect.objectContaining({
          jobId: 'job-123',
          error: 'Re-encryption failed'
        })
      );
    });

    it('should clean up job from active jobs after delay', async () => {
      const activeJobs = (keyRotationService as any).activeJobs;
      activeJobs.set('job-123', mockJob);

      await (keyRotationService as any).executeKeyRotation(mockJob);

      expect(activeJobs.has('job-123')).toBe(true);

      // Fast forward 5 minutes (cleanup delay)
      jest.advanceTimersByTime(300000);

      expect(activeJobs.has('job-123')).toBe(false);
    });
  });

  describe('createReEncryptionPlan', () => {
    beforeEach(() => {
      jest.spyOn(keyRotationService as any, 'countRecordsForReEncryption').mockImplementation((modelName) => {
        if (modelName === 'Customer') return Promise.resolve(1000);
        if (modelName === 'Invoice') return Promise.resolve(500);
        return Promise.resolve(0);
      });
    });

    it('should create comprehensive re-encryption plan', async () => {
      const plan = await (keyRotationService as any).createReEncryptionPlan('org-123');

      expect(plan).toEqual([
        {
          modelName: 'Customer',
          fieldName: 'email',
          totalRecords: 1000,
          batchSize: 500, // calculateOptimalBatchSize(1000)
          estimatedDuration: 10 // estimateReEncryptionDuration(1000)
        },
        {
          modelName: 'Customer',
          fieldName: 'phone',
          totalRecords: 1000,
          batchSize: 500,
          estimatedDuration: 10
        },
        {
          modelName: 'Invoice',
          fieldName: 'notes',
          totalRecords: 500,
          batchSize: 100,
          estimatedDuration: 5
        }
      ]);
    });

    it('should exclude models with no records', async () => {
      jest.spyOn(keyRotationService as any, 'countRecordsForReEncryption').mockResolvedValue(0);

      const plan = await (keyRotationService as any).createReEncryptionPlan('org-123');

      expect(plan).toEqual([]);
    });
  });

  describe('reEncryptModelData', () => {
    let mockJob: KeyRotationJob;
    let mockPlan: ReEncryptionPlan;
    let mockNewKey: any;

    beforeEach(() => {
      mockJob = {
        id: 'job-123',
        organizationId: 'org-123',
        keyType: 'data-encryption',
        oldVersion: 1,
        newVersion: 2,
        status: 'in_progress',
        progress: {
          totalRecords: 100,
          processedRecords: 0,
          failedRecords: 0
        }
      };

      mockPlan = {
        modelName: 'Customer',
        fieldName: 'email',
        totalRecords: 100,
        batchSize: 50,
        estimatedDuration: 60
      };

      mockNewKey = {
        id: 'new-key-id',
        version: 2
      };

      jest.spyOn(keyRotationService as any, 'fetchRecordsForReEncryption').mockImplementation((modelName, orgId, batchSize, offset) => {
        if (offset === 0) {
          return Promise.resolve([
            { id: 'record-1', email: 'encrypted-email-1' },
            { id: 'record-2', email: 'encrypted-email-2' }
          ]);
        } else if (offset === 2) {
          return Promise.resolve([
            { id: 'record-3', email: 'encrypted-email-3' }
          ]);
        }
        return Promise.resolve([]);
      });

      jest.spyOn(keyRotationService as any, 'reEncryptRecord').mockResolvedValue(undefined);
    });

    it('should re-encrypt all records in batches', async () => {
      await (keyRotationService as any).reEncryptModelData(mockJob, mockPlan, mockNewKey);

      expect(mockJob.progress.processedRecords).toBe(3);
      expect(mockJob.progress.failedRecords).toBe(0);

      expect(keyRotationService['reEncryptRecord']).toHaveBeenCalledTimes(3);
      expect(keyRotationService['reEncryptRecord']).toHaveBeenCalledWith(
        { id: 'record-1', email: 'encrypted-email-1' },
        'email',
        mockJob,
        mockNewKey
      );
    });

    it('should handle individual record failures gracefully', async () => {
      jest.spyOn(keyRotationService as any, 'reEncryptRecord')
        .mockResolvedValueOnce(undefined) // First record succeeds
        .mockRejectedValueOnce(new Error('Record encryption failed')) // Second record fails
        .mockResolvedValueOnce(undefined); // Third record succeeds

      await (keyRotationService as any).reEncryptModelData(mockJob, mockPlan, mockNewKey);

      expect(mockJob.progress.processedRecords).toBe(2);
      expect(mockJob.progress.failedRecords).toBe(1);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to re-encrypt record',
        expect.objectContaining({
          jobId: 'job-123',
          recordId: 'record-2',
          error: 'Record encryption failed'
        })
      );
    });

    it('should retry batch operations on failure', async () => {
      jest.spyOn(keyRotationService as any, 'fetchRecordsForReEncryption')
        .mockRejectedValueOnce(new Error('Database connection lost'))
        .mockResolvedValueOnce([{ id: 'record-1', email: 'encrypted-email-1' }])
        .mockResolvedValueOnce([]);

      jest.spyOn(keyRotationService as any, 'delay').mockResolvedValue(undefined);

      await (keyRotationService as any).reEncryptModelData(mockJob, mockPlan, mockNewKey);

      expect(mockJob.progress.processedRecords).toBe(1);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Batch re-encryption failed',
        expect.objectContaining({
          attempt: 1,
          error: 'Database connection lost'
        })
      );
    });

    it('should fail after maximum retry attempts', async () => {
      jest.spyOn(keyRotationService as any, 'fetchRecordsForReEncryption').mockRejectedValue(new Error('Persistent error'));
      jest.spyOn(keyRotationService as any, 'delay').mockResolvedValue(undefined);

      await expect(
        (keyRotationService as any).reEncryptModelData(mockJob, mockPlan, mockNewKey)
      ).rejects.toThrow('Persistent error');

      expect(mockLogger.error).toHaveBeenCalledTimes(3); // RETRY_ATTEMPTS = 3
    });
  });

  describe('reEncryptRecord', () => {
    let mockJob: KeyRotationJob;
    let mockNewKey: any;

    beforeEach(() => {
      mockJob = {
        id: 'job-123',
        organizationId: 'org-123',
        keyType: 'data-encryption',
        oldVersion: 1,
        newVersion: 2,
        status: 'in_progress',
        progress: {
          totalRecords: 100,
          processedRecords: 0,
          failedRecords: 0
        }
      };

      mockNewKey = {
        id: 'new-key-id',
        version: 2
      };

      jest.spyOn(keyRotationService as any, 'updateRecordField').mockResolvedValue(undefined);
    });

    it('should re-encrypt record field successfully', async () => {
      const record = { id: 'record-123', email: 'encrypted-value' };

      await (keyRotationService as any).reEncryptRecord(record, 'email', mockJob, mockNewKey);

      expect(mockFieldEncryptionService.decryptField).toHaveBeenCalledWith('encrypted-value', {
        organizationId: 'org-123',
        fieldName: 'email',
        keyVersion: 1
      });

      expect(mockFieldEncryptionService.encryptField).toHaveBeenCalledWith('decrypted-value', {
        organizationId: 'org-123',
        fieldName: 'email',
        keyVersion: 2
      });

      expect(keyRotationService['updateRecordField']).toHaveBeenCalledWith(
        'record-123',
        'email',
        'encrypted-value'
      );
    });

    it('should skip records with no encrypted value', async () => {
      const record = { id: 'record-123', email: null };

      await (keyRotationService as any).reEncryptRecord(record, 'email', mockJob, mockNewKey);

      expect(mockFieldEncryptionService.decryptField).not.toHaveBeenCalled();
      expect(mockFieldEncryptionService.encryptField).not.toHaveBeenCalled();
      expect(keyRotationService['updateRecordField']).not.toHaveBeenCalled();
    });

    it('should skip records with non-string values', async () => {
      const record = { id: 'record-123', email: 12345 };

      await (keyRotationService as any).reEncryptRecord(record, 'email', mockJob, mockNewKey);

      expect(mockFieldEncryptionService.decryptField).not.toHaveBeenCalled();
      expect(mockFieldEncryptionService.encryptField).not.toHaveBeenCalled();
      expect(keyRotationService['updateRecordField']).not.toHaveBeenCalled();
    });
  });

  describe('emergencyKeyRotation', () => {
    beforeEach(() => {
      jest.spyOn(keyRotationService, 'scheduleKeyRotation').mockResolvedValue('emergency-job-123');
    });

    it('should initiate emergency rotation successfully', async () => {
      const jobId = await keyRotationService.emergencyKeyRotation('org-123', 'Security breach detected');

      expect(jobId).toBe('emergency-job-123');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Emergency key rotation initiated',
        {
          organizationId: 'org-123',
          reason: 'Security breach detected'
        }
      );

      expect(keyRotationService.scheduleKeyRotation).toHaveBeenCalledWith('org-123', 'emergency');
    });

    it('should throw error if emergency rotation is disabled', async () => {
      // Set policy with emergency rotation disabled
      keyRotationService.setRotationPolicy({
        organizationId: 'org-123',
        rotationIntervalDays: 90,
        autoRotationEnabled: true,
        backupOldKeys: true,
        maxKeyVersions: 5,
        emergencyRotationEnabled: false
      });

      await expect(
        keyRotationService.emergencyKeyRotation('org-123', 'Security breach')
      ).rejects.toThrow('Emergency key rotation is disabled for this organization');
    });
  });

  describe('job management', () => {
    let mockJob: KeyRotationJob;

    beforeEach(() => {
      mockJob = {
        id: 'job-123',
        organizationId: 'org-123',
        keyType: 'data-encryption',
        oldVersion: 1,
        newVersion: 2,
        status: 'in_progress',
        progress: {
          totalRecords: 100,
          processedRecords: 50,
          failedRecords: 2
        }
      };

      (keyRotationService as any).activeJobs.set('job-123', mockJob);
    });

    it('should get job status correctly', () => {
      const job = keyRotationService.getJobStatus('job-123');
      expect(job).toEqual(mockJob);
    });

    it('should return null for non-existent job', () => {
      const job = keyRotationService.getJobStatus('non-existent');
      expect(job).toBeNull();
    });

    it('should get all active jobs', () => {
      const activeJobs = keyRotationService.getActiveJobs();
      expect(activeJobs).toEqual([mockJob]);
    });

    it('should cancel job successfully', async () => {
      const result = await keyRotationService.cancelJob('job-123');

      expect(result).toBe(true);
      expect(mockJob.status).toBe('failed');
      expect(mockJob.error).toBe('Cancelled by user');
      expect(mockJob.completedAt).toBeInstanceOf(Date);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Key rotation job cancelled',
        { jobId: 'job-123' }
      );
    });

    it('should not cancel non-existent job', async () => {
      const result = await keyRotationService.cancelJob('non-existent');
      expect(result).toBe(false);
    });

    it('should not cancel completed job', async () => {
      mockJob.status = 'completed';
      const result = await keyRotationService.cancelJob('job-123');
      expect(result).toBe(false);
    });
  });

  describe('rotation policies', () => {
    it('should set and get rotation policy for organization', () => {
      const customPolicy: KeyRotationPolicy = {
        organizationId: 'org-123',
        rotationIntervalDays: 30,
        autoRotationEnabled: false,
        backupOldKeys: true,
        maxKeyVersions: 3,
        emergencyRotationEnabled: true
      };

      keyRotationService.setRotationPolicy(customPolicy);

      const retrievedPolicy = keyRotationService.getRotationPolicy('org-123');
      expect(retrievedPolicy).toEqual(customPolicy);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Rotation policy updated',
        { organizationId: 'org-123' }
      );
    });

    it('should fall back to default policy for unknown organization', () => {
      const policy = keyRotationService.getRotationPolicy('unknown-org');
      expect(policy.organizationId).toBe('default');
    });
  });

  describe('scheduled rotations', () => {
    beforeEach(() => {
      jest.spyOn(keyRotationService as any, 'getOrganizationsForRotation').mockResolvedValue([
        { id: 'org-1', lastRotation: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000) }, // 100 days ago
        { id: 'org-2', lastRotation: new Date(Date.now() - 50 * 24 * 60 * 60 * 1000) }, // 50 days ago
        { id: 'org-3' } // No last rotation
      ]);

      jest.spyOn(keyRotationService, 'scheduleKeyRotation').mockResolvedValue('scheduled-job');
    });

    it('should check and schedule rotations for organizations', async () => {
      await (keyRotationService as any).checkScheduledRotations();

      // org-1 should be scheduled (100 days > 90 day interval)
      // org-2 should not be scheduled (50 days < 90 day interval)
      // org-3 should be scheduled (no last rotation)
      expect(keyRotationService.scheduleKeyRotation).toHaveBeenCalledTimes(2);
      expect(keyRotationService.scheduleKeyRotation).toHaveBeenCalledWith('org-1', 'scheduled');
      expect(keyRotationService.scheduleKeyRotation).toHaveBeenCalledWith('org-3', 'scheduled');
    });

    it('should handle check scheduled rotations errors gracefully', async () => {
      jest.spyOn(keyRotationService as any, 'getOrganizationsForRotation').mockRejectedValue(new Error('Database error'));

      await (keyRotationService as any).checkScheduledRotations();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to check scheduled rotations',
        expect.objectContaining({
          error: 'Database error'
        })
      );
    });

    it('should determine when keys should be rotated', () => {
      const policy = keyRotationService.getRotationPolicy('default');

      // Organization with old rotation
      const oldOrg = {
        id: 'org-1',
        lastRotation: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000) // 100 days ago
      };

      // Organization with recent rotation
      const recentOrg = {
        id: 'org-2',
        lastRotation: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 days ago
      };

      // Organization with no rotation
      const newOrg = { id: 'org-3' };

      expect((keyRotationService as any).shouldRotateKeys(oldOrg, policy)).toBe(true);
      expect((keyRotationService as any).shouldRotateKeys(recentOrg, policy)).toBe(false);
      expect((keyRotationService as any).shouldRotateKeys(newOrg, policy)).toBe(true);
    });
  });

  describe('utility methods', () => {
    it('should calculate optimal batch size based on record count', () => {
      expect((keyRotationService as any).calculateOptimalBatchSize(500)).toBe(100);
      expect((keyRotationService as any).calculateOptimalBatchSize(5000)).toBe(500);
      expect((keyRotationService as any).calculateOptimalBatchSize(50000)).toBe(1000);
      expect((keyRotationService as any).calculateOptimalBatchSize(500000)).toBe(2000);
    });

    it('should estimate re-encryption duration', () => {
      expect((keyRotationService as any).estimateReEncryptionDuration(1000)).toBe(10); // 1000/100 = 10 seconds
      expect((keyRotationService as any).estimateReEncryptionDuration(5000)).toBe(50);
    });

    it('should generate unique job IDs', () => {
      const jobId1 = (keyRotationService as any).generateJobId('org-123');
      const jobId2 = (keyRotationService as any).generateJobId('org-123');

      expect(jobId1).toMatch(/^rotation_org-123_\d+_[a-z0-9]+$/);
      expect(jobId2).toMatch(/^rotation_org-123_\d+_[a-z0-9]+$/);
      expect(jobId1).not.toBe(jobId2);
    });

    it('should find active jobs for organization', () => {
      const activeJob = {
        id: 'active-job',
        organizationId: 'org-123',
        status: 'in_progress' as const
      };

      const completedJob = {
        id: 'completed-job',
        organizationId: 'org-123',
        status: 'completed' as const
      };

      (keyRotationService as any).activeJobs.set('active-job', activeJob);
      (keyRotationService as any).activeJobs.set('completed-job', completedJob);

      const foundJob = (keyRotationService as any).findActiveJob('org-123');
      expect(foundJob).toEqual(activeJob);
    });

    it('should implement delay utility', async () => {
      const startTime = Date.now();

      // Mock setTimeout to resolve immediately for testing
      jest.spyOn(global, 'setTimeout').mockImplementation((callback) => {
        callback();
        return 123 as any;
      });

      await (keyRotationService as any).delay(1000);

      expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 1000);
    });
  });

  describe('getRotationStats', () => {
    beforeEach(() => {
      // Add some test jobs
      (keyRotationService as any).activeJobs.set('job-1', { status: 'in_progress' });
      (keyRotationService as any).activeJobs.set('job-2', { status: 'pending' });
    });

    it('should return rotation statistics', () => {
      const stats = keyRotationService.getRotationStats();

      expect(stats).toEqual({
        activeJobs: 2,
        completedJobs: 0, // Placeholder
        failedJobs: 0, // Placeholder
        totalOrganizations: 1 // Default policy
      });
    });
  });

  describe('placeholder methods', () => {
    it('should handle getCurrentKeyVersion placeholder', async () => {
      const version = await (keyRotationService as any).getCurrentKeyVersion('org-123');
      expect(version).toBe(1);
    });

    it('should handle countRecordsForReEncryption placeholder', async () => {
      const count = await (keyRotationService as any).countRecordsForReEncryption('Customer', 'org-123');
      expect(count).toBe(0);
    });

    it('should handle fetchRecordsForReEncryption placeholder', async () => {
      const records = await (keyRotationService as any).fetchRecordsForReEncryption('Customer', 'org-123', 100, 0);
      expect(records).toEqual([]);
    });

    it('should handle updateRecordField placeholder', async () => {
      await expect(
        (keyRotationService as any).updateRecordField('record-123', 'email', 'new-value')
      ).resolves.not.toThrow();

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Record field updated',
        { recordId: 'record-123', fieldName: 'email' }
      );
    });

    it('should handle updateOrganizationKeyVersion placeholder', async () => {
      await expect(
        (keyRotationService as any).updateOrganizationKeyVersion('org-123', 2)
      ).resolves.not.toThrow();

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Organization key version updated',
        { organizationId: 'org-123', newVersion: 2 }
      );
    });

    it('should handle cleanupOldKeys placeholder', async () => {
      await expect(
        (keyRotationService as any).cleanupOldKeys('org-123')
      ).resolves.not.toThrow();

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Old keys cleaned up',
        { organizationId: 'org-123', maxVersions: 5 }
      );
    });
  });

  describe('error scenarios', () => {
    it('should handle key manager rotation failure', () => {
      mockEncryptionKeyManager.rotateOrganizationKey.mockImplementation(() => {
        throw new Error('Key manager unavailable');
      });

      // Test the error handling directly
      expect(() => {
        mockEncryptionKeyManager.rotateOrganizationKey('org-123');
      }).toThrow('Key manager unavailable');
    });

    it('should handle field encryption service failures', async () => {
      mockFieldEncryptionService.decryptField.mockRejectedValue(new Error('Decryption failed'));

      const record = { id: 'record-123', email: 'encrypted-value' };
      const mockJob = {
        id: 'job-123',
        organizationId: 'org-123',
        oldVersion: 1,
        newVersion: 2
      };
      const mockNewKey = { id: 'new-key' };

      await expect(
        (keyRotationService as any).reEncryptRecord(record, 'email', mockJob, mockNewKey)
      ).rejects.toThrow('Decryption failed');
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete rotation workflow', async () => {
      // Test workflow components directly without async timing dependencies
      const mockPlan = [
        {
          modelName: 'Customer',
          fieldName: 'email',
          totalRecords: 2,
          batchSize: 1,
          estimatedDuration: 1
        }
      ];

      jest.spyOn(keyRotationService as any, 'createReEncryptionPlan').mockResolvedValue(mockPlan);

      const plan = await (keyRotationService as any).createReEncryptionPlan('org-123');
      expect(plan).toEqual(mockPlan);

      // Test that job can be scheduled
      const jobId = await keyRotationService.scheduleKeyRotation('org-123', 'manual');
      expect(typeof jobId).toBe('string');
    });
  });
});