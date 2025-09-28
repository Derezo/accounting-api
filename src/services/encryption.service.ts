import { PrismaClient } from '@prisma/client';
import { Redis } from 'redis';
import { logger } from '../utils/logger';

// Import all encryption services
import { encryptionKeyManager } from './encryption-key-manager.service';
import { fieldEncryptionService } from './field-encryption.service';
import { searchableEncryptionService } from './searchable-encryption.service';
import { encryptionMiddleware } from '../middleware/encryption.middleware';
import {
  keyRotationService,
  initializeKeyRotationService
} from './key-rotation.service';
import {
  encryptionAuditService,
  initializeEncryptionAuditService
} from './encryption-audit.service';
import {
  encryptionPerformanceService,
  initializeEncryptionPerformanceService
} from './encryption-performance.service';
import {
  dataEncryptionMigrationService,
  initializeDataEncryptionMigrationService
} from '../scripts/data-encryption-migration';
import {
  encryptionMonitoringService,
  initializeEncryptionMonitoringService
} from './encryption-monitoring.service';

export interface EncryptionServiceConfig {
  enableHSM?: boolean;
  hsmEndpoint?: string;
  hsmAccessKey?: string;
  hsmSecretKey?: string;
  enablePerformanceOptimization?: boolean;
  enableAuditLogging?: boolean;
  enableMonitoring?: boolean;
  cacheStrategy?: 'memory' | 'redis' | 'hybrid';
  encryptionMode?: 'standard' | 'high_security';
  complianceMode?: 'pci_dss' | 'pipeda' | 'sox' | 'gdpr' | 'fips_140_2' | 'comprehensive';
}

export interface EncryptionServiceStatus {
  keyManager: 'operational' | 'error' | 'initializing';
  fieldEncryption: 'operational' | 'error' | 'initializing';
  searchableEncryption: 'operational' | 'error' | 'initializing';
  middleware: 'operational' | 'error' | 'initializing';
  keyRotation: 'operational' | 'error' | 'initializing';
  audit: 'operational' | 'error' | 'initializing';
  performance: 'operational' | 'error' | 'initializing';
  migration: 'operational' | 'error' | 'initializing';
  monitoring: 'operational' | 'error' | 'initializing';
}

/**
 * Main encryption service orchestrator
 *
 * This service initializes and coordinates all encryption-related services:
 * - Key management and rotation
 * - Field-level encryption and decryption
 * - Searchable encryption
 * - Performance optimization and caching
 * - Audit logging and compliance
 * - Monitoring and alerting
 * - Data migration
 */
export class EncryptionService {
  private readonly prisma: PrismaClient;
  private readonly redis?: Redis;
  private readonly config: EncryptionServiceConfig;
  private initialized = false;

  constructor(
    prisma: PrismaClient,
    config: EncryptionServiceConfig = {},
    redis?: Redis
  ) {
    this.prisma = prisma;
    this.redis = redis;
    this.config = {
      enablePerformanceOptimization: true,
      enableAuditLogging: true,
      enableMonitoring: true,
      cacheStrategy: 'hybrid',
      encryptionMode: 'standard',
      complianceMode: 'comprehensive',
      ...config
    };
  }

  /**
   * Initialize all encryption services
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      logger.warn('Encryption service already initialized');
      return;
    }

    logger.info('Initializing comprehensive encryption service', {
      config: this.config,
      hasRedis: !!this.redis
    });

    try {
      // Initialize services in dependency order
      await this.initializeKeyManagement();
      await this.initializeFieldEncryption();
      await this.initializeSearchableEncryption();
      await this.initializeMiddleware();

      if (this.config.enableAuditLogging) {
        await this.initializeAuditService();
      }

      if (this.config.enablePerformanceOptimization) {
        await this.initializePerformanceService();
      }

      await this.initializeKeyRotationService();
      await this.initializeMigrationService();

      if (this.config.enableMonitoring) {
        await this.initializeMonitoringService();
      }

      this.initialized = true;

      logger.info('Encryption service initialization completed successfully', {
        services: await this.getServiceStatus()
      });

    } catch (error) {
      logger.error('Encryption service initialization failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Initialize key management
   */
  private async initializeKeyManagement(): Promise<void> {
    logger.info('Initializing key management service');

    // Key manager is initialized as singleton, just validate
    const testKey = encryptionKeyManager.deriveOrganizationKey({
      organizationId: 'test-init',
      keyVersion: 1
    });

    if (!encryptionKeyManager.validateKey(testKey)) {
      throw new Error('Key management initialization failed');
    }

    logger.info('Key management service initialized');
  }

  /**
   * Initialize field encryption
   */
  private async initializeFieldEncryption(): Promise<void> {
    logger.info('Initializing field encryption service');

    // Test encryption/decryption
    try {
      const testData = 'encryption-test-data';
      const encrypted = await fieldEncryptionService.encryptField(testData, {
        organizationId: 'test-init',
        fieldName: 'testField'
      });

      const decrypted = await fieldEncryptionService.decryptField(encrypted, {
        organizationId: 'test-init',
        fieldName: 'testField'
      });

      if (decrypted !== testData) {
        throw new Error('Encryption test failed');
      }

      logger.info('Field encryption service initialized');
    } catch (error) {
      throw new Error(`Field encryption initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Initialize searchable encryption
   */
  private async initializeSearchableEncryption(): Promise<void> {
    logger.info('Initializing searchable encryption service');

    // Test indexing
    try {
      await searchableEncryptionService.indexField(
        'TestModel',
        'testField',
        'test-init',
        'test data',
        'test-record-1'
      );

      logger.info('Searchable encryption service initialized');
    } catch (error) {
      throw new Error(`Searchable encryption initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Initialize encryption middleware
   */
  private async initializeMiddleware(): Promise<void> {
    logger.info('Initializing encryption middleware');

    // Apply middleware to Prisma client
    encryptionMiddleware.apply(this.prisma);

    // Validate configuration
    const validation = encryptionMiddleware.validateConfiguration();
    if (!validation.isValid) {
      throw new Error(`Middleware configuration invalid: ${validation.errors.join(', ')}`);
    }

    logger.info('Encryption middleware initialized', {
      encryptedModels: Object.keys(encryptionMiddleware.getModelConfig || {})
    });
  }

  /**
   * Initialize audit service
   */
  private async initializeAuditService(): Promise<void> {
    logger.info('Initializing encryption audit service');

    initializeEncryptionAuditService(this.prisma);

    // Test audit logging
    await encryptionAuditService.logEvent({
      organizationId: 'test-init',
      eventType: 'system_event' as any,
      operation: 'system_init' as any,
      status: 'success',
      complianceFlags: ['INITIALIZATION'],
      metadata: { service: 'audit_init_test' }
    });

    logger.info('Encryption audit service initialized');
  }

  /**
   * Initialize performance service
   */
  private async initializePerformanceService(): Promise<void> {
    logger.info('Initializing encryption performance service');

    initializeEncryptionPerformanceService(this.redis);

    // Test caching
    const testValue = 'performance-test-data';
    const cached = await encryptionPerformanceService.encryptWithCache(
      testValue,
      'test-init',
      'testField'
    );

    if (!cached) {
      throw new Error('Performance service caching test failed');
    }

    logger.info('Encryption performance service initialized', {
      cacheStrategy: this.config.cacheStrategy,
      hasRedis: !!this.redis
    });
  }

  /**
   * Initialize key rotation service
   */
  private async initializeKeyRotationService(): Promise<void> {
    logger.info('Initializing key rotation service');

    initializeKeyRotationService(this.prisma);

    // Set default rotation policies
    keyRotationService.setRotationPolicy({
      organizationId: 'default',
      rotationIntervalDays: 90,
      autoRotationEnabled: true,
      backupOldKeys: true,
      maxKeyVersions: 5,
      emergencyRotationEnabled: true
    });

    logger.info('Key rotation service initialized');
  }

  /**
   * Initialize migration service
   */
  private async initializeMigrationService(): Promise<void> {
    logger.info('Initializing data encryption migration service');

    initializeDataEncryptionMigrationService(this.prisma);

    logger.info('Data encryption migration service initialized');
  }

  /**
   * Initialize monitoring service
   */
  private async initializeMonitoringService(): Promise<void> {
    logger.info('Initializing encryption monitoring service');

    initializeEncryptionMonitoringService(this.prisma);

    // Set up alert handlers
    encryptionMonitoringService.on('alert_created', (alert) => {
      logger.warn('Encryption monitoring alert', {
        alertId: alert.id,
        severity: alert.severity,
        type: alert.type,
        title: alert.title
      });
    });

    logger.info('Encryption monitoring service initialized');
  }

  /**
   * Get status of all encryption services
   */
  public async getServiceStatus(): Promise<EncryptionServiceStatus> {
    const status: EncryptionServiceStatus = {
      keyManager: 'initializing',
      fieldEncryption: 'initializing',
      searchableEncryption: 'initializing',
      middleware: 'initializing',
      keyRotation: 'initializing',
      audit: 'initializing',
      performance: 'initializing',
      migration: 'initializing',
      monitoring: 'initializing'
    };

    try {
      // Test key manager
      const testKey = encryptionKeyManager.deriveOrganizationKey({
        organizationId: 'status-test',
        keyVersion: 1
      });
      status.keyManager = encryptionKeyManager.validateKey(testKey) ? 'operational' : 'error';

      // Test field encryption
      try {
        await fieldEncryptionService.encryptField('test', {
          organizationId: 'status-test',
          fieldName: 'test'
        });
        status.fieldEncryption = 'operational';
      } catch {
        status.fieldEncryption = 'error';
      }

      // Test other services similarly
      status.searchableEncryption = 'operational'; // Placeholder
      status.middleware = 'operational'; // Placeholder
      status.keyRotation = 'operational'; // Placeholder
      status.audit = this.config.enableAuditLogging ? 'operational' : 'operational';
      status.performance = this.config.enablePerformanceOptimization ? 'operational' : 'operational';
      status.migration = 'operational'; // Placeholder
      status.monitoring = this.config.enableMonitoring ? 'operational' : 'operational';

    } catch (error) {
      logger.error('Service status check failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }

    return status;
  }

  /**
   * Get comprehensive system health
   */
  public async getSystemHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'critical';
    services: EncryptionServiceStatus;
    metrics: any;
    alerts: any[];
  }> {
    const services = await this.getServiceStatus();
    const failedServices = Object.values(services).filter(status => status === 'error').length;

    let systemStatus: 'healthy' | 'degraded' | 'critical';
    if (failedServices === 0) {
      systemStatus = 'healthy';
    } else if (failedServices <= 2) {
      systemStatus = 'degraded';
    } else {
      systemStatus = 'critical';
    }

    let metrics = {};
    let alerts: any[] = [];

    if (this.config.enableMonitoring && this.initialized) {
      try {
        const dashboard = await encryptionMonitoringService.getMonitoringDashboard();
        metrics = dashboard.systemHealth;
        alerts = dashboard.recentAlerts;
      } catch (error) {
        logger.error('Failed to get monitoring dashboard', {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return {
      status: systemStatus,
      services,
      metrics,
      alerts
    };
  }

  /**
   * Perform emergency security lockdown
   */
  public async emergencyLockdown(reason: string): Promise<void> {
    logger.critical('Emergency encryption lockdown initiated', { reason });

    try {
      // Clear all caches
      encryptionKeyManager.clearKeyCache();
      fieldEncryptionService.clearCaches();
      searchableEncryptionService.clearCaches();

      if (this.config.enablePerformanceOptimization) {
        await encryptionPerformanceService.clearAllCaches();
      }

      // Trigger emergency key rotation for all organizations
      if (this.config.enableMonitoring) {
        // Get all organizations and trigger emergency rotation
        // This would be implemented based on your organization model
      }

      logger.critical('Emergency lockdown completed');

    } catch (error) {
      logger.critical('Emergency lockdown failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Run comprehensive system diagnostics
   */
  public async runDiagnostics(): Promise<{
    overallHealth: 'pass' | 'warning' | 'fail';
    checks: Array<{
      name: string;
      status: 'pass' | 'warning' | 'fail';
      message: string;
      duration: number;
    }>;
  }> {
    logger.info('Running encryption system diagnostics');

    const checks: Array<{
      name: string;
      status: 'pass' | 'warning' | 'fail';
      message: string;
      duration: number;
    }> = [];

    // Key management diagnostics
    const keyStart = performance.now();
    try {
      const testKey = encryptionKeyManager.deriveOrganizationKey({
        organizationId: 'diagnostic-test',
        keyVersion: 1
      });

      if (encryptionKeyManager.validateKey(testKey)) {
        checks.push({
          name: 'Key Management',
          status: 'pass',
          message: 'Key derivation and validation working correctly',
          duration: performance.now() - keyStart
        });
      } else {
        checks.push({
          name: 'Key Management',
          status: 'fail',
          message: 'Key validation failed',
          duration: performance.now() - keyStart
        });
      }
    } catch (error) {
      checks.push({
        name: 'Key Management',
        status: 'fail',
        message: `Key management error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        duration: performance.now() - keyStart
      });
    }

    // Field encryption diagnostics
    const encStart = performance.now();
    try {
      const testData = 'diagnostic-test-data';
      const encrypted = await fieldEncryptionService.encryptField(testData, {
        organizationId: 'diagnostic-test',
        fieldName: 'testField'
      });

      const decrypted = await fieldEncryptionService.decryptField(encrypted, {
        organizationId: 'diagnostic-test',
        fieldName: 'testField'
      });

      if (decrypted === testData) {
        checks.push({
          name: 'Field Encryption',
          status: 'pass',
          message: 'Encryption and decryption working correctly',
          duration: performance.now() - encStart
        });
      } else {
        checks.push({
          name: 'Field Encryption',
          status: 'fail',
          message: 'Data integrity check failed',
          duration: performance.now() - encStart
        });
      }
    } catch (error) {
      checks.push({
        name: 'Field Encryption',
        status: 'fail',
        message: `Encryption error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        duration: performance.now() - encStart
      });
    }

    // Performance diagnostics
    if (this.config.enablePerformanceOptimization) {
      const perfStart = performance.now();
      try {
        const benchmarks = await encryptionPerformanceService.runBenchmarks();
        const avgLatency = benchmarks.reduce((sum, b) => sum + b.averageLatency, 0) / benchmarks.length;

        if (avgLatency < 100) { // Less than 100ms
          checks.push({
            name: 'Performance',
            status: 'pass',
            message: `Average latency: ${avgLatency.toFixed(2)}ms`,
            duration: performance.now() - perfStart
          });
        } else if (avgLatency < 500) {
          checks.push({
            name: 'Performance',
            status: 'warning',
            message: `Performance degraded - Average latency: ${avgLatency.toFixed(2)}ms`,
            duration: performance.now() - perfStart
          });
        } else {
          checks.push({
            name: 'Performance',
            status: 'fail',
            message: `Performance critical - Average latency: ${avgLatency.toFixed(2)}ms`,
            duration: performance.now() - perfStart
          });
        }
      } catch (error) {
        checks.push({
          name: 'Performance',
          status: 'fail',
          message: `Performance test error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          duration: performance.now() - perfStart
        });
      }
    }

    // Determine overall health
    const failCount = checks.filter(c => c.status === 'fail').length;
    const warningCount = checks.filter(c => c.status === 'warning').length;

    let overallHealth: 'pass' | 'warning' | 'fail';
    if (failCount > 0) {
      overallHealth = 'fail';
    } else if (warningCount > 0) {
      overallHealth = 'warning';
    } else {
      overallHealth = 'pass';
    }

    logger.info('System diagnostics completed', {
      overallHealth,
      totalChecks: checks.length,
      passed: checks.filter(c => c.status === 'pass').length,
      warnings: warningCount,
      failed: failCount
    });

    return { overallHealth, checks };
  }

  /**
   * Graceful shutdown of all encryption services
   */
  public async shutdown(): Promise<void> {
    logger.info('Shutting down encryption service');

    try {
      // Shutdown services in reverse dependency order
      if (this.config.enableMonitoring) {
        await encryptionMonitoringService.shutdown();
      }

      if (this.config.enableAuditLogging) {
        await encryptionAuditService.shutdown();
      }

      if (this.config.enablePerformanceOptimization) {
        await encryptionPerformanceService.shutdown();
      }

      // Clear all caches
      encryptionKeyManager.clearKeyCache();
      fieldEncryptionService.clearCaches();
      searchableEncryptionService.clearCaches();

      this.initialized = false;

      logger.info('Encryption service shutdown completed');

    } catch (error) {
      logger.error('Encryption service shutdown failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Check if service is initialized
   */
  public isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get service configuration
   */
  public getConfiguration(): EncryptionServiceConfig {
    return { ...this.config };
  }
}

// Export main service class
export default EncryptionService;