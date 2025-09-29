/**
 * Complete integration example for the bank-level encryption system
 *
 * This example demonstrates how to properly initialize and use all
 * encryption services in a production environment.
 */


import { createClient, RedisClientType } from 'redis';
import EncryptionService, { EncryptionServiceConfig } from '../services/encryption.service';
import { logger } from '../utils/logger';

import { prisma } from '../config/database';
// Example initialization in your main application
export async function initializeEncryptionInApp() {
  // Initialize database connection
  

  // Initialize Redis for caching (optional but recommended)
  const redis = createClient({
    socket: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
    },
    password: process.env.REDIS_PASSWORD
  });

  // Configure encryption service
  const encryptionConfig: EncryptionServiceConfig = {
    // Enable HSM for production (requires proper HSM configuration)
    enableHSM: process.env.NODE_ENV === 'production',
    hsmEndpoint: process.env.HSM_ENDPOINT,
    hsmAccessKey: process.env.HSM_ACCESS_KEY,
    hsmSecretKey: process.env.HSM_SECRET_KEY,

    // Performance optimization
    enablePerformanceOptimization: true,
    cacheStrategy: 'hybrid', // Use both memory and Redis

    // Security and compliance
    enableAuditLogging: true,
    enableMonitoring: true,
    encryptionMode: process.env.NODE_ENV === 'production' ? 'high_security' : 'standard',
    complianceMode: 'comprehensive' // Support all compliance standards
  };

  // Initialize encryption service
  const encryptionService = new EncryptionService(
    prisma,
    encryptionConfig,
    redis as RedisClientType
  );

  try {
    await encryptionService.initialize();
    logger.info('Encryption service initialized successfully');

    // Run system health check
    const health = await encryptionService.getSystemHealth();
    logger.info('Encryption system health check', health);

    // Run diagnostics if needed
    if (process.env.RUN_ENCRYPTION_DIAGNOSTICS === 'true') {
      const diagnostics = await encryptionService.runDiagnostics();
      logger.info('Encryption diagnostics completed', diagnostics);
    }

    return encryptionService;

  } catch (error) {
    logger.error('Failed to initialize encryption service', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}

// Example usage in API routes
export async function exampleApiUsage() {
  

  // The encryption middleware is automatically applied to Prisma,
  // so sensitive data will be encrypted/decrypted transparently

  try {
    // Create a customer with sensitive data
    const customer = await prisma.person.create({
      data: {
        organizationId: 'org-123',
        firstName: 'John',
        lastName: 'Doe',
        socialInsNumber: '123-456-789', // Will be encrypted automatically
        email: 'john.doe@example.com',   // Will be encrypted if configured
        phone: '+1-555-123-4567'         // Will be encrypted if configured
      }
    });

    logger.info('Customer created with encrypted sensitive data', {
      customerId: customer.id
    });

    // Search for customers (uses searchable encryption where configured)
    const customers = await prisma.person.findMany({
      where: {
        organizationId: 'org-123',
        // The middleware will handle encryption for search queries
        email: {
          contains: 'john'
        }
      }
    });

    // Data is automatically decrypted when retrieved
    logger.info('Customers found', {
      count: customers.length,
      // Note: Sensitive data is decrypted automatically
      firstCustomerEmail: customers[0]?.email
    });

  } catch (error) {
    logger.error('API operation failed', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}

// Example compliance reporting
export async function generateComplianceReport() {
  const { encryptionMonitoringService } = await import('../services/encryption-monitoring.service');

  try {
    // Generate PCI DSS compliance report
    const pciReport = await encryptionMonitoringService.generateComplianceReport(
      'PCI_DSS',
      'org-123', // Optional: specific organization
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
      new Date()
    );

    logger.info('PCI DSS compliance report generated', {
      reportId: pciReport.id,
      overallScore: Math.round(pciReport.summary.overallScore * 100),
      failedChecks: pciReport.summary.failed
    });

    // Generate comprehensive report covering all standards
    const comprehensiveReport = await encryptionMonitoringService.generateComplianceReport(
      'COMPREHENSIVE',
      undefined, // All organizations
      new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // 90 days ago
      new Date()
    );

    logger.info('Comprehensive compliance report generated', {
      reportId: comprehensiveReport.id,
      overallScore: Math.round(comprehensiveReport.summary.overallScore * 100),
      totalChecks: comprehensiveReport.summary.totalChecks
    });

    return { pciReport, comprehensiveReport };

  } catch (error) {
    logger.error('Compliance reporting failed', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}

// Example key rotation
export async function performKeyRotation() {
  const { keyRotationService } = await import('../services/key-rotation.service');

  try {
    // Schedule manual key rotation
    const jobId = await keyRotationService.scheduleKeyRotation(
      'org-123',
      'manual'
    );

    logger.info('Key rotation scheduled', { jobId });

    // Monitor rotation progress
    const checkProgress = setInterval(async () => {
      const status = keyRotationService.getJobStatus(jobId);
      if (status) {
        logger.info('Key rotation progress', {
          jobId,
          status: status.status,
          progress: `${status.progress.processedRecords}/${status.progress.totalRecords}`
        });

        if (status.status === 'completed' || status.status === 'failed') {
          clearInterval(checkProgress);
          logger.info('Key rotation finished', {
            jobId,
            finalStatus: status.status,
            duration: status.completedAt && status.startedAt
              ? status.completedAt.getTime() - status.startedAt.getTime()
              : undefined
          });
        }
      }
    }, 5000); // Check every 5 seconds

  } catch (error) {
    logger.error('Key rotation failed', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}

// Example data migration
export async function migrateExistingData() {
  const { dataEncryptionMigrationService } = await import('../scripts/data-encryption-migration');

  try {
    // Create migration plan
    const plan = await dataEncryptionMigrationService.createMigrationPlan({
      organizationId: 'org-123',
      batchSize: 1000,
      dryRun: false,
      validateAfterMigration: true,
      createBackup: true
    });

    logger.info('Migration plan created', {
      totalPlans: plan.length,
      totalRecords: plan.reduce((sum, p) => sum + p.totalRecords, 0)
    });

    // Start migration
    const jobId = await dataEncryptionMigrationService.startMigration({
      organizationId: 'org-123',
      batchSize: 1000,
      dryRun: false,
      continueOnError: false,
      validateAfterMigration: true,
      createBackup: true
    });

    logger.info('Data migration started', { jobId });

    // Monitor migration progress
    const checkMigration = setInterval(() => {
      const status = dataEncryptionMigrationService.getMigrationStatus(jobId);
      if (status) {
        logger.info('Migration progress', {
          jobId,
          status: status.status,
          progress: `${status.progress.processedRecords}/${status.progress.totalRecords}`,
          encrypted: status.progress.encryptedRecords,
          failed: status.progress.failedRecords
        });

        if (status.status === 'completed' || status.status === 'failed') {
          clearInterval(checkMigration);
          logger.info('Migration finished', {
            jobId,
            finalStatus: status.status
          });
        }
      }
    }, 10000); // Check every 10 seconds

  } catch (error) {
    logger.error('Data migration failed', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}

// Example performance monitoring
export async function monitorPerformance() {
  const { encryptionPerformanceService } = await import('../services/encryption-performance.service');

  try {
    // Run performance benchmarks
    const benchmarks = await encryptionPerformanceService.runBenchmarks();

    logger.info('Performance benchmarks completed', {
      benchmarkCount: benchmarks.length,
      averageLatency: benchmarks.reduce((sum, b) => sum + b.averageLatency, 0) / benchmarks.length,
      averageOpsPerSecond: benchmarks.reduce((sum, b) => sum + b.operationsPerSecond, 0) / benchmarks.length
    });

    // Get cache statistics
    const cacheStats = encryptionPerformanceService.getCacheStats();
    logger.info('Cache performance', cacheStats);

    // Get performance metrics
    const metrics = encryptionPerformanceService.getPerformanceMetrics(100);
    logger.info('Recent performance metrics', {
      totalOperations: metrics.length,
      averageDuration: metrics.reduce((sum, m) => sum + m.duration, 0) / metrics.length,
      cacheHitRate: metrics.filter(m => m.cacheHit).length / metrics.length
    });

  } catch (error) {
    logger.error('Performance monitoring failed', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}

// Example emergency procedures
export async function handleSecurityIncident() {
  const encryptionService = await initializeEncryptionInApp();

  try {
    logger.error('Security incident detected - initiating emergency procedures');

    // Perform emergency lockdown
    await encryptionService.emergencyLockdown('Security incident detected: unauthorized access attempt');

    // Force key rotation for all organizations
    const { keyRotationService } = await import('../services/key-rotation.service');

    // In a real scenario, you would get all organization IDs from your database
    const organizationIds = ['org-123', 'org-456']; // Example

    for (const orgId of organizationIds) {
      try {
        await keyRotationService.emergencyKeyRotation(
          orgId,
          'Security incident - emergency rotation'
        );
        logger.info('Emergency key rotation initiated', { organizationId: orgId });
      } catch (error) {
        logger.error('Emergency key rotation failed', {
          organizationId: orgId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    // Generate incident report
    const { encryptionMonitoringService } = await import('../services/encryption-monitoring.service');
    const dashboard = await encryptionMonitoringService.getMonitoringDashboard();

    logger.error('Security incident response completed', {
      systemHealth: dashboard.systemHealth,
      alertCount: dashboard.recentAlerts.length,
      criticalAlerts: dashboard.recentAlerts.filter(a => a.severity === 'critical').length
    });

  } catch (error) {
    logger.error('Emergency security procedures failed', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}

// Application shutdown example
export async function shutdownGracefully() {
  try {
    logger.info('Initiating graceful shutdown of encryption services');

    // Get the encryption service instance
    const encryptionService = await initializeEncryptionInApp();

    // Perform graceful shutdown
    await encryptionService.shutdown();

    logger.info('Encryption services shutdown completed');

  } catch (error) {
    logger.error('Graceful shutdown failed', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// Health check endpoint example
export async function healthCheck() {
  try {
    const encryptionService = await initializeEncryptionInApp();

    if (!encryptionService.isInitialized()) {
      return {
        status: 'unhealthy',
        message: 'Encryption service not initialized'
      };
    }

    const health = await encryptionService.getSystemHealth();

    return {
      status: health.status === 'healthy' ? 'healthy' : 'unhealthy',
      services: health.services,
      metrics: health.metrics,
      alertCount: health.alerts.length
    };

  } catch (error) {
    return {
      status: 'unhealthy',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// Export all examples
export default {
  initializeEncryptionInApp,
  exampleApiUsage,
  generateComplianceReport,
  performKeyRotation,
  migrateExistingData,
  monitorPerformance,
  handleSecurityIncident,
  shutdownGracefully,
  healthCheck
};