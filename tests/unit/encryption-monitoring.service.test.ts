// Mock Prisma first
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => ({
    organization: {
      findMany: jest.fn()
    }
  }))
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

// Mock dependent services
jest.mock('../../src/services/encryption-audit.service', () => ({
  encryptionAuditService: {
    getAuditEvents: jest.fn(),
    generateAuditSummary: jest.fn(),
    generateComplianceReport: jest.fn()
  }
}));

jest.mock('../../src/services/encryption-performance.service', () => ({
  encryptionPerformanceService: {
    getCacheStats: jest.fn(() => ({
      avgResponseTime: 50,
      hitRate: 0.85
    }))
  }
}));

jest.mock('../../src/services/key-rotation.service', () => ({
  keyRotationService: {
    getRotationStats: jest.fn(() => ({
      totalOrganizations: 10,
      activeJobs: 2,
      completedJobs: 8,
      failedJobs: 0
    }))
  }
}));

jest.mock('../../src/services/field-encryption.service', () => ({
  fieldEncryptionService: {
    getStats: jest.fn(() => ({
      totalOperations: 1000
    }))
  }
}));

// Mock process methods
const mockMemoryUsage = jest.fn(() => ({
  heapUsed: 100 * 1024 * 1024, // 100MB
  heapTotal: 200 * 1024 * 1024,
  external: 50 * 1024 * 1024,
  arrayBuffers: 10 * 1024 * 1024,
  rss: 300 * 1024 * 1024
}));

const mockCpuUsage = jest.fn(() => ({
  user: 1000000, // 1 second in microseconds
  system: 500000 // 0.5 seconds in microseconds
}));

Object.defineProperty(process, 'memoryUsage', {
  value: mockMemoryUsage,
  writable: true
});

Object.defineProperty(process, 'cpuUsage', {
  value: mockCpuUsage,
  writable: true
});

import {
  EncryptionMonitoringService,
  AlertType,
  MonitoringAlert,
  SystemHealthMetrics,
  ComplianceReport,
  MonitoringDashboard
} from '../../src/services/encryption-monitoring.service';
import { PrismaClient } from '@prisma/client';
import { logger } from '../../src/utils/logger';
import { encryptionAuditService } from '../../src/services/encryption-audit.service';
import { encryptionPerformanceService } from '../../src/services/encryption-performance.service';
import { keyRotationService } from '../../src/services/key-rotation.service';
import { fieldEncryptionService } from '../../src/services/field-encryption.service';

// Get mock instances
const mockPrisma = new PrismaClient() as any;
const mockLogger = logger as jest.Mocked<typeof logger>;
const mockEncryptionAuditService = encryptionAuditService as jest.Mocked<typeof encryptionAuditService>;
const mockEncryptionPerformanceService = encryptionPerformanceService as jest.Mocked<typeof encryptionPerformanceService>;
const mockKeyRotationService = keyRotationService as jest.Mocked<typeof keyRotationService>;
const mockFieldEncryptionService = fieldEncryptionService as jest.Mocked<typeof fieldEncryptionService>;

describe('EncryptionMonitoringService', () => {
  let monitoringService: EncryptionMonitoringService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    monitoringService = new EncryptionMonitoringService(mockPrisma);

    // Mock Date.now for consistent timestamps
    jest.spyOn(Date, 'now').mockReturnValue(1640995200000);
  });

  afterEach(() => {
    monitoringService.shutdown();
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize service with proper configuration', () => {
      expect(monitoringService).toBeInstanceOf(EncryptionMonitoringService);
      expect(mockLogger.info).toHaveBeenCalledWith('Encryption monitoring service initialized');
    });

    it('should start health check interval', () => {
      const setIntervalSpy = jest.spyOn(global, 'setInterval');
      new EncryptionMonitoringService(mockPrisma);

      expect(setIntervalSpy).toHaveBeenCalledWith(
        expect.any(Function),
        60000 // HEALTH_CHECK_INTERVAL
      );
    });

    it('should set up event listeners', () => {
      const onSpy = jest.spyOn(monitoringService, 'on');
      new EncryptionMonitoringService(mockPrisma);

      // Event listeners are set up in setupEventListeners
      expect(monitoringService.listenerCount('performance_issue')).toBeGreaterThan(0);
      expect(monitoringService.listenerCount('security_anomaly')).toBeGreaterThan(0);
      expect(monitoringService.listenerCount('compliance_violation')).toBeGreaterThan(0);
    });
  });

  describe('collectSystemMetrics', () => {
    beforeEach(() => {
      jest.spyOn(monitoringService as any, 'getLastAuditDate').mockResolvedValue(new Date('2024-01-01'));
      jest.spyOn(monitoringService as any, 'getOverallComplianceScore').mockResolvedValue(0.85);
      jest.spyOn(monitoringService as any, 'getViolationsCount').mockResolvedValue(2);
      jest.spyOn(monitoringService as any, 'getCriticalFindingsCount').mockResolvedValue(0);
      jest.spyOn(monitoringService as any, 'calculateOpsPerSecond').mockReturnValue(1500);
      jest.spyOn(monitoringService as any, 'calculateErrorRate').mockReturnValue(0.02);
    });

    it('should collect comprehensive system metrics', async () => {
      const metrics = await (monitoringService as any).collectSystemMetrics();

      expect(metrics).toEqual({
        timestamp: expect.any(Date),
        encryption: {
          operationsPerSecond: 1500,
          averageLatency: 50,
          errorRate: 0.02,
          cacheHitRate: 0.85
        },
        keyManagement: {
          activeKeys: 10,
          rotationsPending: 2,
          rotationsCompleted: 8,
          rotationFailures: 0
        },
        compliance: {
          lastAuditDate: new Date('2024-01-01'),
          complianceScore: 0.85,
          violationsCount: 2,
          criticalFindings: 0
        },
        performance: {
          memoryUsage: 100 * 1024 * 1024,
          cpuUsage: 1.5, // (1000000 + 500000) / 1000 = 1500ms
          diskUsage: 0,
          networkLatency: 0
        }
      });

      expect(mockEncryptionPerformanceService.getCacheStats).toHaveBeenCalled();
      expect(mockKeyRotationService.getRotationStats).toHaveBeenCalled();
    });

    it('should handle service call failures gracefully', async () => {
      mockEncryptionPerformanceService.getCacheStats.mockImplementation(() => {
        throw new Error('Performance service unavailable');
      });

      await expect((monitoringService as any).collectSystemMetrics()).rejects.toThrow('Performance service unavailable');
    });
  });

  describe('analyzeHealthMetrics', () => {
    const baseMetrics: SystemHealthMetrics = {
      timestamp: new Date(),
      encryption: {
        operationsPerSecond: 1200,
        averageLatency: 80,
        errorRate: 0.03,
        cacheHitRate: 0.85
      },
      keyManagement: {
        activeKeys: 10,
        rotationsPending: 2,
        rotationsCompleted: 8,
        rotationFailures: 0
      },
      compliance: {
        lastAuditDate: new Date(),
        complianceScore: 0.85,
        violationsCount: 0,
        criticalFindings: 0
      },
      performance: {
        memoryUsage: 100 * 1024 * 1024,
        cpuUsage: 50,
        diskUsage: 0,
        networkLatency: 0
      }
    };

    it('should detect performance degradation issues', async () => {
      const emitSpy = jest.spyOn(monitoringService, 'emit');

      // High latency
      const highLatencyMetrics = {
        ...baseMetrics,
        encryption: {
          ...baseMetrics.encryption,
          averageLatency: 150 // Above threshold of 100ms
        }
      };

      await (monitoringService as any).analyzeHealthMetrics(highLatencyMetrics);

      expect(emitSpy).toHaveBeenCalledWith('performance_issue', {
        metric: 'latency',
        value: 150,
        threshold: 100
      });
    });

    it('should detect low operations per second', async () => {
      const emitSpy = jest.spyOn(monitoringService, 'emit');

      const lowOpsMetrics = {
        ...baseMetrics,
        encryption: {
          ...baseMetrics.encryption,
          operationsPerSecond: 500 // Below threshold of 1000
        }
      };

      await (monitoringService as any).analyzeHealthMetrics(lowOpsMetrics);

      expect(emitSpy).toHaveBeenCalledWith('performance_issue', {
        metric: 'operations_per_second',
        value: 500,
        threshold: 1000
      });
    });

    it('should detect high error rate', async () => {
      const emitSpy = jest.spyOn(monitoringService, 'emit');

      const highErrorMetrics = {
        ...baseMetrics,
        encryption: {
          ...baseMetrics.encryption,
          errorRate: 0.1 // Above threshold of 0.05 (5%)
        }
      };

      await (monitoringService as any).analyzeHealthMetrics(highErrorMetrics);

      expect(emitSpy).toHaveBeenCalledWith('performance_issue', {
        metric: 'error_rate',
        value: 0.1,
        threshold: 0.05
      });
    });

    it('should detect low cache hit rate', async () => {
      const emitSpy = jest.spyOn(monitoringService, 'emit');

      const lowCacheMetrics = {
        ...baseMetrics,
        encryption: {
          ...baseMetrics.encryption,
          cacheHitRate: 0.6 // Below threshold of 0.8 (80%)
        }
      };

      await (monitoringService as any).analyzeHealthMetrics(lowCacheMetrics);

      expect(emitSpy).toHaveBeenCalledWith('performance_issue', {
        metric: 'cache_hit_rate',
        value: 0.6,
        threshold: 0.8
      });
    });

    it('should detect high memory usage', async () => {
      const createAlertSpy = jest.spyOn(monitoringService as any, 'createAlert');

      const highMemoryMetrics = {
        ...baseMetrics,
        performance: {
          ...baseMetrics.performance,
          memoryUsage: 600 * 1024 * 1024 // 600MB > 500MB threshold
        }
      };

      await (monitoringService as any).analyzeHealthMetrics(highMemoryMetrics);

      expect(createAlertSpy).toHaveBeenCalledWith({
        severity: 'medium',
        type: AlertType.CAPACITY_WARNING,
        title: 'High Memory Usage',
        description: 'Memory usage is 600MB',
        source: 'capacity_monitor'
      });
    });

    it('should detect low compliance score', async () => {
      const emitSpy = jest.spyOn(monitoringService, 'emit');

      const lowComplianceMetrics = {
        ...baseMetrics,
        compliance: {
          ...baseMetrics.compliance,
          complianceScore: 0.75 // Below threshold of 0.8 (80%)
        }
      };

      await (monitoringService as any).analyzeHealthMetrics(lowComplianceMetrics);

      expect(emitSpy).toHaveBeenCalledWith('compliance_violation', {
        severity: 'high',
        description: 'Overall compliance score is 75%'
      });
    });
  });

  describe('event handling', () => {
    it('should create alert for performance issues', () => {
      const createAlertSpy = jest.spyOn(monitoringService as any, 'createAlert');

      monitoringService.emit('performance_issue', {
        metric: 'latency',
        value: 150,
        threshold: 100
      });

      expect(createAlertSpy).toHaveBeenCalledWith({
        severity: 'high',
        type: AlertType.PERFORMANCE_DEGRADATION,
        title: 'Encryption Performance Degradation',
        description: expect.stringContaining('Performance metrics below acceptable thresholds'),
        source: 'performance_monitor'
      });
    });

    it('should create alert for security anomalies', () => {
      const createAlertSpy = jest.spyOn(monitoringService as any, 'createAlert');

      monitoringService.emit('security_anomaly', {
        organizationId: 'org-123',
        description: 'Unusual encryption activity detected'
      });

      expect(createAlertSpy).toHaveBeenCalledWith({
        severity: 'critical',
        type: AlertType.SECURITY_ANOMALY,
        title: 'Security Anomaly Detected',
        description: 'Unusual encryption activity detected: Unusual encryption activity detected',
        source: 'security_monitor',
        organizationId: 'org-123'
      });
    });

    it('should create alert for compliance violations', () => {
      const createAlertSpy = jest.spyOn(monitoringService as any, 'createAlert');

      monitoringService.emit('compliance_violation', {
        organizationId: 'org-123',
        severity: 'high',
        description: 'GDPR violation detected'
      });

      expect(createAlertSpy).toHaveBeenCalledWith({
        severity: 'high',
        type: AlertType.COMPLIANCE_VIOLATION,
        title: 'Compliance Violation',
        description: 'GDPR violation detected',
        source: 'compliance_monitor',
        organizationId: 'org-123'
      });
    });
  });

  describe('generateComplianceReport', () => {
    beforeEach(() => {
      jest.spyOn(monitoringService as any, 'generatePCIDSSReport').mockResolvedValue([
        {
          name: 'Requirement 3: Protect Stored Cardholder Data',
          score: 1.0,
          status: 'compliant',
          checks: [
            {
              id: 'PCI-3.4.1',
              title: 'Primary Account Numbers (PANs) are rendered unreadable',
              description: 'Verify that PANs are protected with strong cryptography',
              status: 'pass',
              severity: 'critical',
              evidence: ['Encryption audit logs'],
              remediation: 'Ensure all PAN fields use AES-256 encryption'
            }
          ]
        }
      ]);

      jest.spyOn(monitoringService as any, 'storeComplianceReport').mockResolvedValue(undefined);
    });

    it('should generate PCI DSS compliance report', async () => {
      const report = await monitoringService.generateComplianceReport('PCI_DSS', 'org-123');

      expect(report).toEqual({
        id: expect.stringMatching(/^report_/),
        organizationId: 'org-123',
        reportType: 'PCI_DSS',
        period: expect.objectContaining({
          startDate: expect.any(Date),
          endDate: expect.any(Date)
        }),
        generatedAt: expect.any(Date),
        summary: {
          overallScore: 1.0,
          totalChecks: 1,
          passed: 1,
          failed: 0,
          warnings: 0
        },
        sections: expect.arrayContaining([
          expect.objectContaining({
            name: 'Requirement 3: Protect Stored Cardholder Data',
            score: 1.0,
            status: 'compliant'
          })
        ]),
        recommendations: expect.any(Array),
        nextAuditDue: expect.any(Date)
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Compliance report generated',
        expect.objectContaining({
          reportId: expect.stringMatching(/^report_/),
          overallScore: 100,
          totalChecks: 1,
          failed: 0
        })
      );
    });

    it('should generate PIPEDA compliance report', async () => {
      jest.spyOn(monitoringService as any, 'generatePIPEDAReport').mockResolvedValue([
        {
          name: 'Principle 7: Safeguards',
          score: 1.0,
          status: 'compliant',
          checks: []
        }
      ]);

      const report = await monitoringService.generateComplianceReport('PIPEDA');

      expect(report.reportType).toBe('PIPEDA');
      expect(monitoringService['generatePIPEDAReport']).toHaveBeenCalled();
    });

    it('should generate comprehensive report with all standards', async () => {
      jest.spyOn(monitoringService as any, 'generatePIPEDAReport').mockResolvedValue([]);
      jest.spyOn(monitoringService as any, 'generateSOXReport').mockResolvedValue([]);
      jest.spyOn(monitoringService as any, 'generateGDPRReport').mockResolvedValue([]);
      jest.spyOn(monitoringService as any, 'generateFIPS140_2Report').mockResolvedValue([]);

      const report = await monitoringService.generateComplianceReport('COMPREHENSIVE');

      expect(report.reportType).toBe('COMPREHENSIVE');
      expect(monitoringService['generatePCIDSSReport']).toHaveBeenCalled();
      expect(monitoringService['generatePIPEDAReport']).toHaveBeenCalled();
      expect(monitoringService['generateSOXReport']).toHaveBeenCalled();
      expect(monitoringService['generateGDPRReport']).toHaveBeenCalled();
      expect(monitoringService['generateFIPS140_2Report']).toHaveBeenCalled();
    });

    it('should throw error for unsupported report type', async () => {
      await expect(
        monitoringService.generateComplianceReport('INVALID_TYPE' as any)
      ).rejects.toThrow('Unsupported report type: INVALID_TYPE');
    });

    it('should calculate correct compliance scores with mixed results', async () => {
      jest.spyOn(monitoringService as any, 'generatePCIDSSReport').mockResolvedValue([
        {
          name: 'Test Section',
          score: 0.5,
          status: 'partially_compliant',
          checks: [
            { id: '1', status: 'pass' },
            { id: '2', status: 'fail' },
            { id: '3', status: 'warning' },
            { id: '4', status: 'pass' }
          ]
        }
      ]);

      const report = await monitoringService.generateComplianceReport('PCI_DSS');

      expect(report.summary).toEqual({
        overallScore: 0.5, // 2 passed out of 4 total
        totalChecks: 4,
        passed: 2,
        failed: 1,
        warnings: 1
      });
    });
  });

  describe('getMonitoringDashboard', () => {
    beforeEach(() => {
      // Mock all the dashboard helper methods
      jest.spyOn(monitoringService as any, 'collectSystemMetrics').mockResolvedValue({
        timestamp: new Date(),
        encryption: { operationsPerSecond: 1000, averageLatency: 50, errorRate: 0.01, cacheHitRate: 0.9 },
        keyManagement: { activeKeys: 5, rotationsPending: 1, rotationsCompleted: 10, rotationFailures: 0 },
        compliance: { lastAuditDate: new Date(), complianceScore: 0.95, violationsCount: 0, criticalFindings: 0 },
        performance: { memoryUsage: 200000000, cpuUsage: 25, diskUsage: 0, networkLatency: 0 }
      });

      jest.spyOn(monitoringService as any, 'getLastReportDate').mockResolvedValue(new Date('2024-01-01'));
      jest.spyOn(monitoringService as any, 'getOverallComplianceScore').mockResolvedValue(0.95);
      jest.spyOn(monitoringService as any, 'getCriticalIssuesCount').mockResolvedValue(0);
      jest.spyOn(monitoringService as any, 'getPendingActionsCount').mockResolvedValue(2);
      jest.spyOn(monitoringService as any, 'getLastRotationDate').mockResolvedValue(new Date('2023-12-01'));
      jest.spyOn(monitoringService as any, 'getNextScheduledRotation').mockResolvedValue(new Date('2024-03-01'));
      jest.spyOn(monitoringService as any, 'getOrganizationsWithPendingRotation').mockResolvedValue(3);
    });

    it('should return comprehensive monitoring dashboard', async () => {
      // Create some mock alerts
      (monitoringService as any).alerts.set('alert-1', {
        id: 'alert-1',
        severity: 'high',
        type: AlertType.PERFORMANCE_DEGRADATION,
        title: 'High Latency',
        description: 'Encryption operations are slow',
        source: 'performance_monitor',
        timestamp: new Date(),
        acknowledged: false
      });

      const dashboard = await monitoringService.getMonitoringDashboard();

      expect(dashboard).toEqual({
        systemHealth: expect.objectContaining({
          encryption: expect.objectContaining({
            operationsPerSecond: 1000,
            averageLatency: 50
          }),
          keyManagement: expect.objectContaining({
            activeKeys: 5
          })
        }),
        recentAlerts: expect.arrayContaining([
          expect.objectContaining({
            id: 'alert-1',
            severity: 'high',
            acknowledged: false
          })
        ]),
        encryptionMetrics: {
          totalOperations: 1000,
          encryptionOperations: 600, // 60% estimate
          decryptionOperations: 400, // 40% estimate
          failedOperations: 0
        },
        complianceStatus: {
          lastReportDate: new Date('2024-01-01'),
          overallScore: 0.95,
          criticalIssues: 0,
          pendingActions: 2
        },
        keyRotationStatus: {
          lastRotation: new Date('2023-12-01'),
          nextScheduledRotation: new Date('2024-03-01'),
          organizationsWithPendingRotation: 3
        }
      });
    });

    it('should handle missing health metrics gracefully', async () => {
      // Clear health metrics
      (monitoringService as any).healthMetrics = [];

      const dashboard = await monitoringService.getMonitoringDashboard();

      expect(dashboard.systemHealth).toBeDefined();
      expect(monitoringService['collectSystemMetrics']).toHaveBeenCalled();
    });
  });

  describe('alert management', () => {
    let testAlert: MonitoringAlert;

    beforeEach(() => {
      testAlert = {
        id: 'alert-123',
        severity: 'high',
        type: AlertType.PERFORMANCE_DEGRADATION,
        title: 'Test Alert',
        description: 'Test alert description',
        source: 'test',
        timestamp: new Date(),
        acknowledged: false
      };
    });

    it('should create alert with proper ID and timestamp', () => {
      const createAlertMethod = (monitoringService as any).createAlert.bind(monitoringService);
      const alertData = {
        severity: 'medium' as const,
        type: AlertType.CAPACITY_WARNING,
        title: 'Test Alert',
        description: 'Test description',
        source: 'test'
      };

      createAlertMethod(alertData);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Monitoring alert created',
        expect.objectContaining({
          alertId: expect.stringMatching(/^alert_/),
          severity: 'medium',
          type: AlertType.CAPACITY_WARNING,
          title: 'Test Alert'
        })
      );
    });

    it('should acknowledge alert successfully', () => {
      (monitoringService as any).alerts.set(testAlert.id, testAlert);

      const result = monitoringService.acknowledgeAlert(testAlert.id);

      expect(result).toBe(true);
      expect((monitoringService as any).alerts.get(testAlert.id).acknowledged).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith('Alert acknowledged', { alertId: testAlert.id });
    });

    it('should return false when acknowledging non-existent alert', () => {
      const result = monitoringService.acknowledgeAlert('non-existent');

      expect(result).toBe(false);
    });

    it('should resolve alert successfully', () => {
      (monitoringService as any).alerts.set(testAlert.id, testAlert);

      const result = monitoringService.resolveAlert(testAlert.id);

      expect(result).toBe(true);
      const alert = (monitoringService as any).alerts.get(testAlert.id);
      expect(alert.acknowledged).toBe(true);
      expect(alert.resolvedAt).toBeInstanceOf(Date);
      expect(mockLogger.info).toHaveBeenCalledWith('Alert resolved', { alertId: testAlert.id });
    });

    it('should return false when resolving non-existent alert', () => {
      const result = monitoringService.resolveAlert('non-existent');

      expect(result).toBe(false);
    });

    it('should get active alerts correctly', () => {
      const activeAlert = { ...testAlert, id: 'active-1', acknowledged: false };
      const acknowledgedAlert = { ...testAlert, id: 'acknowledged-1', acknowledged: true };
      const resolvedAlert = { ...testAlert, id: 'resolved-1', resolvedAt: new Date() };

      (monitoringService as any).alerts.set('active-1', activeAlert);
      (monitoringService as any).alerts.set('acknowledged-1', acknowledgedAlert);
      (monitoringService as any).alerts.set('resolved-1', resolvedAlert);

      const activeAlerts = monitoringService.getActiveAlerts();

      expect(activeAlerts).toEqual([
        expect.objectContaining({ id: 'active-1', acknowledged: false })
      ]);
      expect(activeAlerts).toHaveLength(1);
    });

    it('should auto-acknowledge low severity alerts after timeout', () => {
      jest.useFakeTimers();
      const acknowledgeAlertSpy = jest.spyOn(monitoringService, 'acknowledgeAlert');

      const createAlertMethod = (monitoringService as any).createAlert.bind(monitoringService);
      createAlertMethod({
        severity: 'low',
        type: AlertType.SYSTEM_HEALTH,
        title: 'Low Severity Alert',
        description: 'Test',
        source: 'test'
      });

      // Fast-forward 1 hour
      jest.advanceTimersByTime(3600000);

      expect(acknowledgeAlertSpy).toHaveBeenCalled();
      jest.useRealTimers();
    });
  });

  describe('compliance checks', () => {
    it('should perform PAN encryption check', async () => {
      const result = await (monitoringService as any).checkPANEncryption('org-123');
      expect(result).toBe('pass'); // Placeholder implementation
    });

    it('should perform key protection check', async () => {
      const result = await (monitoringService as any).checkKeyProtection('org-123');
      expect(result).toBe('pass'); // Placeholder implementation
    });

    it('should perform key authentication check', async () => {
      const result = await (monitoringService as any).checkKeyAuthentication('org-123');
      expect(result).toBe('pass'); // Placeholder implementation
    });

    it('should perform personal data encryption check', async () => {
      const result = await (monitoringService as any).checkPersonalDataEncryption('org-123');
      expect(result).toBe('pass'); // Placeholder implementation
    });

    it('should perform financial data controls check', async () => {
      const result = await (monitoringService as any).checkFinancialDataControls('org-123');
      expect(result).toBe('pass'); // Placeholder implementation
    });

    it('should perform GDPR encryption check', async () => {
      const result = await (monitoringService as any).checkGDPREncryption('org-123');
      expect(result).toBe('pass'); // Placeholder implementation
    });

    it('should perform FIPS algorithms check', async () => {
      const result = await (monitoringService as any).checkFIPSAlgorithms('org-123');
      expect(result).toBe('pass'); // Placeholder implementation
    });
  });

  describe('utility methods', () => {
    beforeEach(() => {
      // Add some test metrics to the service
      const testMetrics = [
        { timestamp: new Date(), encryption: { operationsPerSecond: 1000, errorRate: 0.01 } },
        { timestamp: new Date(), encryption: { operationsPerSecond: 1200, errorRate: 0.02 } },
        { timestamp: new Date(), encryption: { operationsPerSecond: 800, errorRate: 0.015 } }
      ];
      (monitoringService as any).healthMetrics = testMetrics;
    });

    it('should calculate operations per second average', () => {
      const result = (monitoringService as any).calculateOpsPerSecond();
      expect(result).toBe(1000); // (1000 + 1200 + 800) / 3
    });

    it('should calculate error rate average', () => {
      const result = (monitoringService as any).calculateErrorRate();
      expect(result).toBeCloseTo(0.015); // (0.01 + 0.02 + 0.015) / 3
    });

    it('should calculate section score correctly', () => {
      const checks = [
        { status: 'pass' },
        { status: 'pass' },
        { status: 'fail' },
        { status: 'warning' }
      ];
      const score = (monitoringService as any).calculateSectionScore(checks);
      expect(score).toBe(0.5); // 2 passed out of 4 total
    });

    it('should calculate section status based on score', () => {
      const allPassChecks = [{ status: 'pass' }, { status: 'pass' }];
      const allFailChecks = [{ status: 'fail' }, { status: 'fail' }];
      const mixedChecks = [{ status: 'pass' }, { status: 'fail' }];

      expect((monitoringService as any).calculateSectionStatus(allPassChecks)).toBe('compliant');
      expect((monitoringService as any).calculateSectionStatus(allFailChecks)).toBe('non_compliant');
      expect((monitoringService as any).calculateSectionStatus(mixedChecks)).toBe('partially_compliant');
    });

    it('should generate recommendations from failed checks', () => {
      const sections = [
        {
          checks: [
            { status: 'pass', remediation: 'Keep doing this' },
            { status: 'fail', remediation: 'Fix this issue' },
            { status: 'fail', remediation: 'Fix this other issue' },
            { status: 'fail', remediation: 'Fix this issue' } // Duplicate
          ]
        }
      ];

      const recommendations = (monitoringService as any).generateRecommendations(sections);
      expect(recommendations).toEqual(['Fix this issue', 'Fix this other issue']);
    });

    it('should calculate next audit date based on report type', () => {
      const socNextAudit = (monitoringService as any).calculateNextAuditDate('SOX');
      const pciNextAudit = (monitoringService as any).calculateNextAuditDate('PCI_DSS');

      // SOX should be quarterly (90 days), PCI should be annual (365 days)
      expect(socNextAudit.getTime() - Date.now()).toBeCloseTo(90 * 24 * 60 * 60 * 1000, -5);
      expect(pciNextAudit.getTime() - Date.now()).toBeCloseTo(365 * 24 * 60 * 60 * 1000, -5);
    });

    it('should generate unique report and alert IDs', () => {
      const reportId1 = (monitoringService as any).generateReportId();
      const reportId2 = (monitoringService as any).generateReportId();
      const alertId1 = (monitoringService as any).generateAlertId();
      const alertId2 = (monitoringService as any).generateAlertId();

      expect(reportId1).toMatch(/^report_\d+_[a-z0-9]+$/);
      expect(alertId1).toMatch(/^alert_\d+_[a-z0-9]+$/);
      expect(reportId1).not.toBe(reportId2);
      expect(alertId1).not.toBe(alertId2);
    });
  });

  describe('shutdown', () => {
    it('should cleanup properly on shutdown', async () => {
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
      const removeAllListenersSpy = jest.spyOn(monitoringService, 'removeAllListeners');

      await monitoringService.shutdown();

      expect(clearIntervalSpy).toHaveBeenCalled();
      expect(removeAllListenersSpy).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Encryption monitoring service shut down');
    });
  });

  describe('error handling', () => {
    it('should handle health check failures gracefully', async () => {
      jest.spyOn(monitoringService as any, 'collectSystemMetrics').mockRejectedValue(new Error('Metrics collection failed'));

      const performHealthCheckMethod = (monitoringService as any).performHealthCheck.bind(monitoringService);
      await performHealthCheckMethod();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Health check failed',
        expect.objectContaining({
          error: 'Metrics collection failed'
        })
      );
    });

    it('should create alert when health check fails', async () => {
      const createAlertSpy = jest.spyOn(monitoringService as any, 'createAlert');
      jest.spyOn(monitoringService as any, 'collectSystemMetrics').mockRejectedValue(new Error('System error'));

      const performHealthCheckMethod = (monitoringService as any).performHealthCheck.bind(monitoringService);
      await performHealthCheckMethod();

      expect(createAlertSpy).toHaveBeenCalledWith({
        severity: 'high',
        type: AlertType.SYSTEM_HEALTH,
        title: 'System Health Check Failed',
        description: expect.stringContaining('Health monitoring encountered an error'),
        source: 'health_monitor'
      });
    });
  });
});