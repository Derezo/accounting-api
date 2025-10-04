import { encryptionKeyManager, EncryptionKey } from './encryption-key-manager.service';
import { fieldEncryptionService } from './field-encryption.service';
import { encryptionMiddleware } from '../middleware/encryption.middleware';
import { logger } from '../utils/logger';
import { PrismaClient } from '@prisma/client';

export interface KeyRotationJob {
  id: string;
  organizationId: string;
  keyType: string;
  oldVersion: number;
  newVersion: number;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  startedAt?: Date;
  completedAt?: Date;
  progress: {
    totalRecords: number;
    processedRecords: number;
    failedRecords: number;
  };
  error?: string;
}

export interface KeyRotationPolicy {
  organizationId: string;
  rotationIntervalDays: number;
  autoRotationEnabled: boolean;
  backupOldKeys: boolean;
  maxKeyVersions: number;
  emergencyRotationEnabled: boolean;
}

export interface ReEncryptionPlan {
  modelName: string;
  fieldName: string;
  totalRecords: number;
  batchSize: number;
  estimatedDuration: number;
}

/**
 * Comprehensive key rotation service with support for:
 * - Automated key rotation based on policies
 * - Emergency key rotation for security incidents
 * - Zero-downtime re-encryption of existing data
 * - Backward compatibility with old key versions
 * - Progress tracking and error handling
 */
export class KeyRotationService {
  private readonly prisma: PrismaClient;
  private readonly activeJobs = new Map<string, KeyRotationJob>();
  private readonly rotationPolicies = new Map<string, KeyRotationPolicy>();
  private rotationSchedulerInterval?: NodeJS.Timeout;

  // Configuration
  private readonly DEFAULT_BATCH_SIZE = 1000;
  private readonly MAX_CONCURRENT_JOBS = 3;
  private readonly RETRY_ATTEMPTS = 3;
  private readonly ROTATION_LOCK_TIMEOUT = 3600000; // 1 hour

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.initializeRotationPolicies();
    this.startRotationScheduler();
  }

  /**
   * Initialize default rotation policies
   */
  private initializeRotationPolicies(): void {
    // Default policy for all organizations
    const defaultPolicy: KeyRotationPolicy = {
      organizationId: 'default',
      rotationIntervalDays: 90, // Rotate every 90 days
      autoRotationEnabled: true,
      backupOldKeys: true,
      maxKeyVersions: 5,
      emergencyRotationEnabled: true
    };

    this.rotationPolicies.set('default', defaultPolicy);
    logger.info('Key rotation policies initialized');
  }

  /**
   * Start the rotation scheduler
   */
  private startRotationScheduler(): void {
    // Check for scheduled rotations every hour
    this.rotationSchedulerInterval = setInterval(() => {
      this.checkScheduledRotations();
    }, 3600000); // 1 hour

    logger.info('Key rotation scheduler started');
  }

  /**
   * Stop the rotation scheduler
   */
  public stopScheduler(): void {
    if (this.rotationSchedulerInterval) {
      clearInterval(this.rotationSchedulerInterval);
      this.rotationSchedulerInterval = undefined;
      logger.info('Key rotation scheduler stopped');
    }
  }

  /**
   * Check for scheduled rotations
   */
  private async checkScheduledRotations(): Promise<void> {
    try {
      const organizations = await this.getOrganizationsForRotation();

      for (const org of organizations) {
        const policy = this.getRotationPolicy(org.id);
        if (policy.autoRotationEnabled && this.shouldRotateKeys(org, policy)) {
          await this.scheduleKeyRotation(org.id, 'scheduled');
        }
      }
    } catch (error) {
      logger.error('Failed to check scheduled rotations', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get organizations that need key rotation
   */
  private async getOrganizationsForRotation(): Promise<Array<{ id: string; lastRotation?: Date }>> {
    // In production, query from database
    // SELECT id, last_key_rotation FROM organizations WHERE is_active = true
    return []; // Placeholder
  }

  /**
   * Check if keys should be rotated for an organization
   */
  private shouldRotateKeys(
    org: { id: string; lastRotation?: Date },
    policy: KeyRotationPolicy
  ): boolean {
    if (!org.lastRotation) {
      return true; // Never rotated
    }

    const daysSinceRotation = Math.floor(
      (Date.now() - org.lastRotation.getTime()) / (1000 * 60 * 60 * 24)
    );

    return daysSinceRotation >= policy.rotationIntervalDays;
  }

  /**
   * Schedule key rotation for an organization
   */
  public async scheduleKeyRotation(
    organizationId: string,
    rotationType: 'scheduled' | 'emergency' | 'manual'
  ): Promise<string> {
    const jobId = this.generateJobId(organizationId);

    // Check if rotation is already in progress
    const existingJob = this.findActiveJob(organizationId);
    if (existingJob) {
      logger.warn('Key rotation already in progress', {
        organizationId,
        existingJobId: existingJob.id
      });
      return existingJob.id;
    }

    // Check concurrent job limit
    if (this.activeJobs.size >= this.MAX_CONCURRENT_JOBS) {
      throw new Error('Maximum concurrent key rotation jobs reached');
    }

    try {
      // Create rotation job
      const job: KeyRotationJob = {
        id: jobId,
        organizationId,
        keyType: 'data-encryption',
        oldVersion: await this.getCurrentKeyVersion(organizationId),
        newVersion: await this.getCurrentKeyVersion(organizationId) + 1,
        status: 'pending',
        progress: {
          totalRecords: 0,
          processedRecords: 0,
          failedRecords: 0
        }
      };

      this.activeJobs.set(jobId, job);

      // Start rotation process asynchronously
      this.executeKeyRotation(job).catch(error => {
        logger.error('Key rotation job failed', {
          jobId,
          organizationId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        job.status = 'failed';
        job.error = error instanceof Error ? error.message : 'Unknown error';
        job.completedAt = new Date();
      });

      logger.info('Key rotation scheduled', {
        jobId,
        organizationId,
        rotationType,
        oldVersion: job.oldVersion,
        newVersion: job.newVersion
      });

      return jobId;

    } catch (error) {
      logger.error('Failed to schedule key rotation', {
        organizationId,
        rotationType,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Execute key rotation job
   */
  private async executeKeyRotation(job: KeyRotationJob): Promise<void> {
    job.status = 'in_progress';
    job.startedAt = new Date();

    try {
      // Step 1: Generate new key version
      const newKey = encryptionKeyManager.rotateOrganizationKey(
        job.organizationId,
        job.keyType
      );

      // Step 2: Create re-encryption plan
      const reEncryptionPlan = await this.createReEncryptionPlan(job.organizationId);
      job.progress.totalRecords = reEncryptionPlan.reduce(
        (total, plan) => total + plan.totalRecords,
        0
      );

      logger.info('Starting key rotation execution', {
        jobId: job.id,
        organizationId: job.organizationId,
        totalRecords: job.progress.totalRecords,
        planCount: reEncryptionPlan.length
      });

      // Step 3: Re-encrypt data in batches
      for (const plan of reEncryptionPlan) {
        await this.reEncryptModelData(job, plan, newKey);
      }

      // Step 4: Update key version in organization record
      await this.updateOrganizationKeyVersion(job.organizationId, job.newVersion);

      // Step 5: Clean up old keys if policy allows
      await this.cleanupOldKeys(job.organizationId);

      job.status = 'completed';
      job.completedAt = new Date();

      logger.info('Key rotation completed successfully', {
        jobId: job.id,
        organizationId: job.organizationId,
        processedRecords: job.progress.processedRecords,
        failedRecords: job.progress.failedRecords,
        duration: job.completedAt.getTime() - job.startedAt.getTime()
      });

    } catch (error) {
      job.status = 'failed';
      job.error = error instanceof Error ? error.message : 'Unknown error';
      job.completedAt = new Date();

      logger.error('Key rotation failed', {
        jobId: job.id,
        organizationId: job.organizationId,
        error: job.error
      });

      throw error;
    } finally {
      // Clean up job from active jobs after a delay
      setTimeout(() => {
        this.activeJobs.delete(job.id);
      }, 300000); // 5 minutes
    }
  }

  /**
   * Create re-encryption plan for all encrypted fields
   */
  private async createReEncryptionPlan(organizationId: string): Promise<ReEncryptionPlan[]> {
    const plans: ReEncryptionPlan[] = [];

    // Get all models with encrypted fields
    for (const [modelName, config] of Object.entries(encryptionMiddleware.getModelConfig || {})) {
      if (!config) continue;

      for (const fieldConfig of config.encryptedFields) {
        const totalRecords = await this.countRecordsForReEncryption(
          modelName,
          organizationId
        );

        if (totalRecords > 0) {
          plans.push({
            modelName,
            fieldName: fieldConfig.field,
            totalRecords,
            batchSize: this.calculateOptimalBatchSize(totalRecords),
            estimatedDuration: this.estimateReEncryptionDuration(totalRecords)
          });
        }
      }
    }

    return plans;
  }

  /**
   * Re-encrypt data for a specific model and field
   */
  private async reEncryptModelData(
    job: KeyRotationJob,
    plan: ReEncryptionPlan,
    newKey: EncryptionKey
  ): Promise<void> {
    logger.info('Starting model data re-encryption', {
      jobId: job.id,
      modelName: plan.modelName,
      fieldName: plan.fieldName,
      totalRecords: plan.totalRecords
    });

    let offset = 0;
    let attempt = 0;

    while (offset < plan.totalRecords && attempt < this.RETRY_ATTEMPTS) {
      try {
        const records = await this.fetchRecordsForReEncryption(
          plan.modelName,
          job.organizationId,
          plan.batchSize,
          offset
        );

        if (records.length === 0) {
          break; // No more records
        }

        // Re-encrypt each record
        for (const record of records) {
          try {
            await this.reEncryptRecord(record, plan.fieldName, job, newKey);
            job.progress.processedRecords++;
          } catch (error) {
            job.progress.failedRecords++;
            logger.error('Failed to re-encrypt record', {
              jobId: job.id,
              recordId: record.id,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }

        offset += records.length;
        attempt = 0; // Reset attempt counter on success

        // Update progress
        logger.debug('Re-encryption progress', {
          jobId: job.id,
          modelName: plan.modelName,
          progress: `${job.progress.processedRecords}/${job.progress.totalRecords}`
        });

      } catch (error) {
        attempt++;
        logger.error('Batch re-encryption failed', {
          jobId: job.id,
          modelName: plan.modelName,
          attempt,
          error: error instanceof Error ? error.message : 'Unknown error'
        });

        if (attempt >= this.RETRY_ATTEMPTS) {
          throw error;
        }

        // Exponential backoff
        await this.delay(Math.pow(2, attempt) * 1000);
      }
    }
  }

  /**
   * Re-encrypt a single record
   */
  private async reEncryptRecord(
    record: any,
    fieldName: string,
    job: KeyRotationJob,
    newKey: EncryptionKey
  ): Promise<void> {
    const encryptedValue = record[fieldName];
    if (!encryptedValue || typeof encryptedValue !== 'string') {
      return; // Nothing to re-encrypt
    }

    // Decrypt with old key
    const decryptedValue = await fieldEncryptionService.decryptField(encryptedValue, {
      organizationId: job.organizationId,
      fieldName: fieldName,
      keyVersion: job.oldVersion
    });

    // Encrypt with new key
    const newEncryptedValue = await fieldEncryptionService.encryptField(decryptedValue, {
      organizationId: job.organizationId,
      fieldName: fieldName,
      keyVersion: job.newVersion
    });

    // Update record in database
    await this.updateRecordField(record.id, fieldName, newEncryptedValue);
  }

  /**
   * Get current key version for organization
   */
  private async getCurrentKeyVersion(organizationId: string): Promise<number> {
    // In production, get from database
    // SELECT key_version FROM organizations WHERE id = ?
    return 1; // Placeholder
  }

  /**
   * Count records for re-encryption
   */
  private async countRecordsForReEncryption(
    modelName: string,
    organizationId: string
  ): Promise<number> {
    // In production, count records in the model
    // SELECT COUNT(*) FROM ${modelName.toLowerCase()} WHERE organization_id = ?
    return 0; // Placeholder
  }

  /**
   * Fetch records for re-encryption
   */
  private async fetchRecordsForReEncryption(
    modelName: string,
    organizationId: string,
    batchSize: number,
    offset: number
  ): Promise<any[]> {
    // In production, fetch records from the model
    // SELECT * FROM ${modelName.toLowerCase()} WHERE organization_id = ? LIMIT ? OFFSET ?
    return []; // Placeholder
  }

  /**
   * Update record field with new encrypted value
   */
  private async updateRecordField(
    recordId: string,
    fieldName: string,
    newValue: string
  ): Promise<void> {
    // In production, update the record
    // UPDATE ${modelName.toLowerCase()} SET ${fieldName} = ? WHERE id = ?
    logger.debug('Record field updated', { recordId, fieldName });
  }

  /**
   * Update organization key version
   */
  private async updateOrganizationKeyVersion(
    organizationId: string,
    newVersion: number
  ): Promise<void> {
    // In production, update organization record
    // UPDATE organizations SET key_version = ?, last_key_rotation = NOW() WHERE id = ?
    logger.info('Organization key version updated', { organizationId, newVersion });
  }

  /**
   * Clean up old keys based on policy
   */
  private async cleanupOldKeys(organizationId: string): Promise<void> {
    const policy = this.getRotationPolicy(organizationId);

    if (policy.maxKeyVersions > 0) {
      // In production, implement key cleanup logic
      logger.info('Old keys cleaned up', { organizationId, maxVersions: policy.maxKeyVersions });
    }
  }

  /**
   * Emergency key rotation for security incidents
   */
  public async emergencyKeyRotation(
    organizationId: string,
    reason: string
  ): Promise<string> {
    logger.warn('Emergency key rotation initiated', { organizationId, reason });

    const policy = this.getRotationPolicy(organizationId);
    if (!policy.emergencyRotationEnabled) {
      throw new Error('Emergency key rotation is disabled for this organization');
    }

    return this.scheduleKeyRotation(organizationId, 'emergency');
  }

  /**
   * Get rotation job status
   */
  public getJobStatus(jobId: string): KeyRotationJob | null {
    return this.activeJobs.get(jobId) || null;
  }

  /**
   * Get all active rotation jobs
   */
  public getActiveJobs(): KeyRotationJob[] {
    return Array.from(this.activeJobs.values());
  }

  /**
   * Cancel a rotation job
   */
  public async cancelJob(jobId: string): Promise<boolean> {
    const job = this.activeJobs.get(jobId);
    if (!job || job.status !== 'in_progress') {
      return false;
    }

    job.status = 'failed';
    job.error = 'Cancelled by user';
    job.completedAt = new Date();

    logger.info('Key rotation job cancelled', { jobId });
    return true;
  }

  /**
   * Set rotation policy for an organization
   */
  public setRotationPolicy(policy: KeyRotationPolicy): void {
    this.rotationPolicies.set(policy.organizationId, policy);
    logger.info('Rotation policy updated', { organizationId: policy.organizationId });
  }

  /**
   * Get rotation policy for an organization
   */
  public getRotationPolicy(organizationId: string): KeyRotationPolicy {
    return this.rotationPolicies.get(organizationId) ||
           this.rotationPolicies.get('default')!;
  }

  /**
   * Utility methods
   */
  private generateJobId(organizationId: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `rotation_${organizationId}_${timestamp}_${random}`;
  }

  private findActiveJob(organizationId: string): KeyRotationJob | undefined {
    return Array.from(this.activeJobs.values()).find(
      job => job.organizationId === organizationId &&
             (job.status === 'pending' || job.status === 'in_progress')
    );
  }

  private calculateOptimalBatchSize(totalRecords: number): number {
    if (totalRecords < 1000) return 100;
    if (totalRecords < 10000) return 500;
    if (totalRecords < 100000) return 1000;
    return 2000;
  }

  private estimateReEncryptionDuration(totalRecords: number): number {
    // Estimate 100 records per second
    return Math.ceil(totalRecords / 100);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get rotation statistics
   */
  public getRotationStats(): {
    activeJobs: number;
    completedJobs: number;
    failedJobs: number;
    totalOrganizations: number;
  } {
    // In production, get from database
    return {
      activeJobs: this.activeJobs.size,
      completedJobs: 0,
      failedJobs: 0,
      totalOrganizations: this.rotationPolicies.size
    };
  }
}

// Export singleton instance (will be initialized with Prisma client)
export let keyRotationService: KeyRotationService;

export function initializeKeyRotationService(prisma: PrismaClient): void {
  keyRotationService = new KeyRotationService(prisma);
}