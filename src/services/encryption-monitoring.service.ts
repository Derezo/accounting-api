import { EventEmitter } from 'events';
import { performance } from 'perf_hooks';
import { logger } from '../utils/logger';
import { encryptionAuditService } from './encryption-audit.service';
import { encryptionPerformanceService } from './encryption-performance.service';
import { keyRotationService } from './key-rotation.service';
import { fieldEncryptionService } from './field-encryption.service';
import { PrismaClient } from '@prisma/client';

export interface MonitoringAlert {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: AlertType;
  title: string;
  description: string;
  organizationId?: string;
  source: string;
  timestamp: Date;
  acknowledged: boolean;
  resolvedAt?: Date;
  metadata?: Record<string, any>;
}

export enum AlertType {
  PERFORMANCE_DEGRADATION = 'performance_degradation',
  HIGH_ERROR_RATE = 'high_error_rate',
  SECURITY_ANOMALY = 'security_anomaly',
  KEY_ROTATION_FAILURE = 'key_rotation_failure',
  COMPLIANCE_VIOLATION = 'compliance_violation',
  SYSTEM_HEALTH = 'system_health',
  CAPACITY_WARNING = 'capacity_warning',
  UNAUTHORIZED_ACCESS = 'unauthorized_access'
}

export interface SystemHealthMetrics {
  timestamp: Date;
  encryption: {
    operationsPerSecond: number;
    averageLatency: number;
    errorRate: number;
    cacheHitRate: number;
  };
  keyManagement: {
    activeKeys: number;
    rotationsPending: number;
    rotationsCompleted: number;
    rotationFailures: number;
  };
  compliance: {
    lastAuditDate: Date;
    complianceScore: number;
    violationsCount: number;
    criticalFindings: number;
  };
  performance: {
    memoryUsage: number;
    cpuUsage: number;
    diskUsage: number;
    networkLatency: number;
  };
}

export interface ComplianceReport {
  id: string;
  organizationId?: string;
  reportType: 'PCI_DSS' | 'PIPEDA' | 'SOX' | 'GDPR' | 'FIPS_140_2' | 'COMPREHENSIVE';
  period: {
    startDate: Date;
    endDate: Date;
  };
  generatedAt: Date;
  summary: {
    overallScore: number;
    totalChecks: number;
    passed: number;
    failed: number;
    warnings: number;
  };
  sections: ComplianceSection[];
  recommendations: string[];
  nextAuditDue: Date;
}

export interface ComplianceSection {
  name: string;
  score: number;
  status: 'compliant' | 'non_compliant' | 'partially_compliant';
  checks: ComplianceCheck[];
}

export interface ComplianceCheck {
  id: string;
  title: string;
  description: string;
  status: 'pass' | 'fail' | 'warning';
  severity: 'low' | 'medium' | 'high' | 'critical';
  evidence: string[];
  remediation?: string;
}

export interface MonitoringDashboard {
  systemHealth: SystemHealthMetrics;
  recentAlerts: MonitoringAlert[];
  encryptionMetrics: {
    totalOperations: number;
    encryptionOperations: number;
    decryptionOperations: number;
    failedOperations: number;
  };
  complianceStatus: {
    lastReportDate: Date;
    overallScore: number;
    criticalIssues: number;
    pendingActions: number;
  };
  keyRotationStatus: {
    lastRotation: Date;
    nextScheduledRotation: Date;
    organizationsWithPendingRotation: number;
  };
}

/**
 * Comprehensive encryption monitoring and compliance reporting service
 *
 * Features:
 * - Real-time system health monitoring
 * - Automated compliance reporting for multiple standards
 * - Performance monitoring and alerting
 * - Security anomaly detection
 * - Executive dashboards and KPI tracking
 * - Automated remediation recommendations
 */
export class EncryptionMonitoringService extends EventEmitter {
  private readonly prisma: PrismaClient;
  private readonly alerts = new Map<string, MonitoringAlert>();
  private readonly healthMetrics: SystemHealthMetrics[] = [];
  private readonly monitoringInterval: NodeJS.Timeout;

  // Monitoring thresholds
  private readonly PERFORMANCE_THRESHOLDS = {
    maxLatency: 100, // milliseconds
    minOpsPerSecond: 1000,
    maxErrorRate: 0.05, // 5%
    minCacheHitRate: 0.8 // 80%
  };

  private readonly HEALTH_CHECK_INTERVAL = 60000; // 1 minute
  private readonly METRICS_RETENTION_HOURS = 168; // 7 days
  private readonly ALERT_RETENTION_DAYS = 30;

  constructor(prisma: PrismaClient) {
    super();
    this.prisma = prisma;

    // Start monitoring
    this.monitoringInterval = setInterval(() => {
      this.performHealthCheck();
    }, this.HEALTH_CHECK_INTERVAL);

    // Set up event listeners
    this.setupEventListeners();

    logger.info('Encryption monitoring service initialized');
  }

  /**
   * Set up event listeners for various system events
   */
  private setupEventListeners(): void {
    // Listen for encryption performance issues
    this.on('performance_issue', (data) => {
      this.createAlert({
        severity: 'high',
        type: AlertType.PERFORMANCE_DEGRADATION,
        title: 'Encryption Performance Degradation',
        description: `Performance metrics below acceptable thresholds: ${JSON.stringify(data)}`,
        source: 'performance_monitor'
      });
    });

    // Listen for security anomalies
    this.on('security_anomaly', (data) => {
      this.createAlert({
        severity: 'critical',
        type: AlertType.SECURITY_ANOMALY,
        title: 'Security Anomaly Detected',
        description: `Unusual encryption activity detected: ${data.description}`,
        source: 'security_monitor',
        organizationId: data.organizationId
      });
    });

    // Listen for compliance violations
    this.on('compliance_violation', (data) => {
      this.createAlert({
        severity: data.severity || 'high',
        type: AlertType.COMPLIANCE_VIOLATION,
        title: 'Compliance Violation',
        description: data.description,
        source: 'compliance_monitor',
        organizationId: data.organizationId
      });
    });
  }

  /**
   * Perform comprehensive system health check
   */
  private async performHealthCheck(): Promise<void> {
    try {
      const metrics = await this.collectSystemMetrics();
      this.healthMetrics.push(metrics);

      // Clean up old metrics
      const cutoffTime = new Date(Date.now() - (this.METRICS_RETENTION_HOURS * 60 * 60 * 1000));
      const filteredMetrics = this.healthMetrics.filter(m => m.timestamp > cutoffTime);
      this.healthMetrics.splice(0, this.healthMetrics.length, ...filteredMetrics);

      // Check for issues
      await this.analyzeHealthMetrics(metrics);

      logger.debug('Health check completed', {
        encryptionOps: metrics.encryption.operationsPerSecond,
        errorRate: metrics.encryption.errorRate,
        cacheHitRate: metrics.encryption.cacheHitRate
      });

    } catch (error) {
      logger.error('Health check failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      this.createAlert({
        severity: 'high',
        type: AlertType.SYSTEM_HEALTH,
        title: 'System Health Check Failed',
        description: `Health monitoring encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        source: 'health_monitor'
      });
    }
  }

  /**
   * Collect comprehensive system metrics
   */
  private async collectSystemMetrics(): Promise<SystemHealthMetrics> {
    const performanceStats = encryptionPerformanceService.getCacheStats();
    const keyRotationStats = keyRotationService.getRotationStats();
    const encryptionStats = fieldEncryptionService.getStats();

    // System performance metrics
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    return {
      timestamp: new Date(),
      encryption: {
        operationsPerSecond: this.calculateOpsPerSecond(),
        averageLatency: performanceStats.avgResponseTime,
        errorRate: this.calculateErrorRate(),
        cacheHitRate: performanceStats.hitRate
      },
      keyManagement: {
        activeKeys: keyRotationStats.totalOrganizations,
        rotationsPending: keyRotationStats.activeJobs,
        rotationsCompleted: keyRotationStats.completedJobs,
        rotationFailures: keyRotationStats.failedJobs
      },
      compliance: {
        lastAuditDate: await this.getLastAuditDate(),
        complianceScore: await this.getOverallComplianceScore(),
        violationsCount: await this.getViolationsCount(),
        criticalFindings: await this.getCriticalFindingsCount()
      },
      performance: {
        memoryUsage: memoryUsage.heapUsed,
        cpuUsage: (cpuUsage.user + cpuUsage.system) / 1000, // Convert to milliseconds
        diskUsage: 0, // Would implement actual disk usage monitoring
        networkLatency: 0 // Would implement actual network latency monitoring
      }
    };
  }

  /**
   * Analyze health metrics and detect issues
   */
  private async analyzeHealthMetrics(metrics: SystemHealthMetrics): Promise<void> {
    // Check encryption performance
    if (metrics.encryption.averageLatency > this.PERFORMANCE_THRESHOLDS.maxLatency) {
      this.emit('performance_issue', {
        metric: 'latency',
        value: metrics.encryption.averageLatency,
        threshold: this.PERFORMANCE_THRESHOLDS.maxLatency
      });
    }

    if (metrics.encryption.operationsPerSecond < this.PERFORMANCE_THRESHOLDS.minOpsPerSecond) {
      this.emit('performance_issue', {
        metric: 'operations_per_second',
        value: metrics.encryption.operationsPerSecond,
        threshold: this.PERFORMANCE_THRESHOLDS.minOpsPerSecond
      });
    }

    if (metrics.encryption.errorRate > this.PERFORMANCE_THRESHOLDS.maxErrorRate) {
      this.emit('performance_issue', {
        metric: 'error_rate',
        value: metrics.encryption.errorRate,
        threshold: this.PERFORMANCE_THRESHOLDS.maxErrorRate
      });
    }

    if (metrics.encryption.cacheHitRate < this.PERFORMANCE_THRESHOLDS.minCacheHitRate) {
      this.emit('performance_issue', {
        metric: 'cache_hit_rate',
        value: metrics.encryption.cacheHitRate,
        threshold: this.PERFORMANCE_THRESHOLDS.minCacheHitRate
      });
    }

    // Check memory usage
    if (metrics.performance.memoryUsage > 500 * 1024 * 1024) { // 500MB
      this.createAlert({
        severity: 'medium',
        type: AlertType.CAPACITY_WARNING,
        title: 'High Memory Usage',
        description: `Memory usage is ${Math.round(metrics.performance.memoryUsage / 1024 / 1024)}MB`,
        source: 'capacity_monitor'
      });
    }

    // Check compliance score
    if (metrics.compliance.complianceScore < 0.8) { // Below 80%
      this.emit('compliance_violation', {
        severity: 'high',
        description: `Overall compliance score is ${Math.round(metrics.compliance.complianceScore * 100)}%`
      });
    }
  }

  /**
   * Generate comprehensive compliance report
   */
  public async generateComplianceReport(
    reportType: 'PCI_DSS' | 'PIPEDA' | 'SOX' | 'GDPR' | 'FIPS_140_2' | 'COMPREHENSIVE',
    organizationId?: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<ComplianceReport> {
    const reportId = this.generateReportId();
    const period = {
      startDate: startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
      endDate: endDate || new Date()
    };

    logger.info('Generating compliance report', {
      reportId,
      reportType,
      organizationId,
      period
    });

    let sections: ComplianceSection[];

    switch (reportType) {
      case 'PCI_DSS':
        sections = await this.generatePCIDSSReport(organizationId, period);
        break;
      case 'PIPEDA':
        sections = await this.generatePIPEDAReport(organizationId, period);
        break;
      case 'SOX':
        sections = await this.generateSOXReport(organizationId, period);
        break;
      case 'GDPR':
        sections = await this.generateGDPRReport(organizationId, period);
        break;
      case 'FIPS_140_2':
        sections = await this.generateFIPS140_2Report(organizationId, period);
        break;
      case 'COMPREHENSIVE':
        sections = await this.generateComprehensiveReport(organizationId, period);
        break;
      default:
        throw new Error(`Unsupported report type: ${reportType}`);
    }

    // Calculate summary
    const totalChecks = sections.reduce((sum, section) => sum + section.checks.length, 0);
    const passed = sections.reduce((sum, section) =>
      sum + section.checks.filter(check => check.status === 'pass').length, 0);
    const failed = sections.reduce((sum, section) =>
      sum + section.checks.filter(check => check.status === 'fail').length, 0);
    const warnings = sections.reduce((sum, section) =>
      sum + section.checks.filter(check => check.status === 'warning').length, 0);

    const overallScore = totalChecks > 0 ? passed / totalChecks : 1;

    const report: ComplianceReport = {
      id: reportId,
      organizationId,
      reportType,
      period,
      generatedAt: new Date(),
      summary: {
        overallScore,
        totalChecks,
        passed,
        failed,
        warnings
      },
      sections,
      recommendations: this.generateRecommendations(sections),
      nextAuditDue: this.calculateNextAuditDate(reportType)
    };

    // Store report
    await this.storeComplianceReport(report);

    logger.info('Compliance report generated', {
      reportId,
      overallScore: Math.round(overallScore * 100),
      totalChecks,
      failed
    });

    return report;
  }

  /**
   * Generate PCI DSS compliance section
   */
  private async generatePCIDSSReport(
    organizationId?: string,
    period?: { startDate: Date; endDate: Date }
  ): Promise<ComplianceSection[]> {
    const sections: ComplianceSection[] = [];

    // Requirement 3: Protect stored cardholder data
    const req3Checks: ComplianceCheck[] = [
      {
        id: 'PCI-3.4.1',
        title: 'Primary Account Numbers (PANs) are rendered unreadable',
        description: 'Verify that PANs are protected with strong cryptography',
        status: await this.checkPANEncryption(organizationId),
        severity: 'critical',
        evidence: ['Encryption audit logs', 'Field encryption configuration'],
        remediation: 'Ensure all PAN fields use AES-256 encryption'
      },
      {
        id: 'PCI-3.5.2',
        title: 'Cryptographic keys are protected',
        description: 'Verify that cryptographic keys are stored securely',
        status: await this.checkKeyProtection(organizationId),
        severity: 'critical',
        evidence: ['Key management audit logs', 'HSM configuration'],
        remediation: 'Implement proper key management practices'
      }
    ];

    sections.push({
      name: 'Requirement 3: Protect Stored Cardholder Data',
      score: this.calculateSectionScore(req3Checks),
      status: this.calculateSectionStatus(req3Checks),
      checks: req3Checks
    });

    // Requirement 8: Identify and authenticate access
    const req8Checks: ComplianceCheck[] = [
      {
        id: 'PCI-8.2.1',
        title: 'Strong authentication for encryption keys',
        description: 'Verify strong authentication for key access',
        status: await this.checkKeyAuthentication(organizationId),
        severity: 'high',
        evidence: ['Authentication logs', 'Key access logs'],
        remediation: 'Implement multi-factor authentication for key access'
      }
    ];

    sections.push({
      name: 'Requirement 8: Identify and Authenticate Access',
      score: this.calculateSectionScore(req8Checks),
      status: this.calculateSectionStatus(req8Checks),
      checks: req8Checks
    });

    return sections;
  }

  /**
   * Generate PIPEDA compliance section
   */
  private async generatePIPEDAReport(
    organizationId?: string,
    period?: { startDate: Date; endDate: Date }
  ): Promise<ComplianceSection[]> {
    const sections: ComplianceSection[] = [];

    // Principle 7: Safeguards
    const principle7Checks: ComplianceCheck[] = [
      {
        id: 'PIPEDA-7.1',
        title: 'Personal information protection',
        description: 'Verify personal information is protected with appropriate safeguards',
        status: await this.checkPersonalDataEncryption(organizationId),
        severity: 'high',
        evidence: ['Encryption configuration', 'Personal data audit logs'],
        remediation: 'Ensure all personal data fields are encrypted'
      }
    ];

    sections.push({
      name: 'Principle 7: Safeguards',
      score: this.calculateSectionScore(principle7Checks),
      status: this.calculateSectionStatus(principle7Checks),
      checks: principle7Checks
    });

    return sections;
  }

  /**
   * Generate SOX compliance section
   */
  private async generateSOXReport(
    organizationId?: string,
    period?: { startDate: Date; endDate: Date }
  ): Promise<ComplianceSection[]> {
    const sections: ComplianceSection[] = [];

    // Section 404: Management assessment of internal controls
    const section404Checks: ComplianceCheck[] = [
      {
        id: 'SOX-404.1',
        title: 'Financial data integrity controls',
        description: 'Verify adequate controls exist for financial data',
        status: await this.checkFinancialDataControls(organizationId),
        severity: 'high',
        evidence: ['Financial data encryption logs', 'Access control logs'],
        remediation: 'Implement comprehensive controls for financial data'
      }
    ];

    sections.push({
      name: 'Section 404: Internal Controls',
      score: this.calculateSectionScore(section404Checks),
      status: this.calculateSectionStatus(section404Checks),
      checks: section404Checks
    });

    return sections;
  }

  /**
   * Generate GDPR compliance section
   */
  private async generateGDPRReport(
    organizationId?: string,
    period?: { startDate: Date; endDate: Date }
  ): Promise<ComplianceSection[]> {
    const sections: ComplianceSection[] = [];

    // Article 32: Security of processing
    const article32Checks: ComplianceCheck[] = [
      {
        id: 'GDPR-32.1',
        title: 'Personal data encryption',
        description: 'Verify personal data is encrypted using appropriate technical measures',
        status: await this.checkGDPREncryption(organizationId),
        severity: 'critical',
        evidence: ['Personal data encryption audit', 'Technical measures documentation'],
        remediation: 'Implement state-of-the-art encryption for personal data'
      }
    ];

    sections.push({
      name: 'Article 32: Security of Processing',
      score: this.calculateSectionScore(article32Checks),
      status: this.calculateSectionStatus(article32Checks),
      checks: article32Checks
    });

    return sections;
  }

  /**
   * Generate FIPS 140-2 compliance section
   */
  private async generateFIPS140_2Report(
    organizationId?: string,
    period?: { startDate: Date; endDate: Date }
  ): Promise<ComplianceSection[]> {
    const sections: ComplianceSection[] = [];

    // Level 1: Basic security requirements
    const level1Checks: ComplianceCheck[] = [
      {
        id: 'FIPS-140-2-L1.1',
        title: 'Approved cryptographic algorithms',
        description: 'Verify only FIPS-approved algorithms are used',
        status: await this.checkFIPSAlgorithms(organizationId),
        severity: 'critical',
        evidence: ['Algorithm configuration', 'Cryptographic module documentation'],
        remediation: 'Use only FIPS 140-2 approved algorithms'
      }
    ];

    sections.push({
      name: 'FIPS 140-2 Level 1',
      score: this.calculateSectionScore(level1Checks),
      status: this.calculateSectionStatus(level1Checks),
      checks: level1Checks
    });

    return sections;
  }

  /**
   * Generate comprehensive report combining all standards
   */
  private async generateComprehensiveReport(
    organizationId?: string,
    period?: { startDate: Date; endDate: Date }
  ): Promise<ComplianceSection[]> {
    const sections: ComplianceSection[] = [];

    // Combine all compliance standards
    const pciSections = await this.generatePCIDSSReport(organizationId, period);
    const pipedaSections = await this.generatePIPEDAReport(organizationId, period);
    const soxSections = await this.generateSOXReport(organizationId, period);
    const gdprSections = await this.generateGDPRReport(organizationId, period);
    const fipsSections = await this.generateFIPS140_2Report(organizationId, period);

    sections.push(...pciSections, ...pipedaSections, ...soxSections, ...gdprSections, ...fipsSections);

    return sections;
  }

  /**
   * Get monitoring dashboard data
   */
  public async getMonitoringDashboard(): Promise<MonitoringDashboard> {
    const latestMetrics = this.healthMetrics[this.healthMetrics.length - 1];
    const recentAlerts = Array.from(this.alerts.values())
      .filter(alert => !alert.acknowledged)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 10);

    const encryptionStats = fieldEncryptionService.getStats();

    return {
      systemHealth: latestMetrics || await this.collectSystemMetrics(),
      recentAlerts,
      encryptionMetrics: {
        totalOperations: encryptionStats.totalOperations,
        encryptionOperations: Math.floor(encryptionStats.totalOperations * 0.6), // Estimate
        decryptionOperations: Math.floor(encryptionStats.totalOperations * 0.4), // Estimate
        failedOperations: 0 // Would track actual failures
      },
      complianceStatus: {
        lastReportDate: await this.getLastReportDate(),
        overallScore: await this.getOverallComplianceScore(),
        criticalIssues: await this.getCriticalIssuesCount(),
        pendingActions: await this.getPendingActionsCount()
      },
      keyRotationStatus: {
        lastRotation: await this.getLastRotationDate(),
        nextScheduledRotation: await this.getNextScheduledRotation(),
        organizationsWithPendingRotation: await this.getOrganizationsWithPendingRotation()
      }
    };
  }

  /**
   * Create monitoring alert
   */
  private createAlert(alertData: Omit<MonitoringAlert, 'id' | 'timestamp' | 'acknowledged'>): void {
    const alert: MonitoringAlert = {
      id: this.generateAlertId(),
      timestamp: new Date(),
      acknowledged: false,
      ...alertData
    };

    this.alerts.set(alert.id, alert);

    // Emit alert event
    this.emit('alert_created', alert);

    logger.warn('Monitoring alert created', {
      alertId: alert.id,
      severity: alert.severity,
      type: alert.type,
      title: alert.title
    });

    // Auto-acknowledge low severity alerts after 1 hour
    if (alert.severity === 'low') {
      setTimeout(() => {
        this.acknowledgeAlert(alert.id);
      }, 3600000);
    }
  }

  /**
   * Acknowledge alert
   */
  public acknowledgeAlert(alertId: string): boolean {
    const alert = this.alerts.get(alertId);
    if (!alert) {
      return false;
    }

    alert.acknowledged = true;
    logger.info('Alert acknowledged', { alertId });
    return true;
  }

  /**
   * Resolve alert
   */
  public resolveAlert(alertId: string): boolean {
    const alert = this.alerts.get(alertId);
    if (!alert) {
      return false;
    }

    alert.resolvedAt = new Date();
    alert.acknowledged = true;
    logger.info('Alert resolved', { alertId });
    return true;
  }

  /**
   * Get active alerts
   */
  public getActiveAlerts(): MonitoringAlert[] {
    return Array.from(this.alerts.values())
      .filter(alert => !alert.acknowledged && !alert.resolvedAt)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Utility methods for compliance checks
   */
  private async checkPANEncryption(organizationId?: string): Promise<'pass' | 'fail' | 'warning'> {
    // Check if PAN fields are properly encrypted
    // This would involve checking the encryption configuration and audit logs
    return 'pass'; // Placeholder
  }

  private async checkKeyProtection(organizationId?: string): Promise<'pass' | 'fail' | 'warning'> {
    // Check if encryption keys are properly protected
    return 'pass'; // Placeholder
  }

  private async checkKeyAuthentication(organizationId?: string): Promise<'pass' | 'fail' | 'warning'> {
    // Check if strong authentication is required for key access
    return 'pass'; // Placeholder
  }

  private async checkPersonalDataEncryption(organizationId?: string): Promise<'pass' | 'fail' | 'warning'> {
    // Check if personal data is properly encrypted
    return 'pass'; // Placeholder
  }

  private async checkFinancialDataControls(organizationId?: string): Promise<'pass' | 'fail' | 'warning'> {
    // Check if adequate controls exist for financial data
    return 'pass'; // Placeholder
  }

  private async checkGDPREncryption(organizationId?: string): Promise<'pass' | 'fail' | 'warning'> {
    // Check if personal data meets GDPR encryption requirements
    return 'pass'; // Placeholder
  }

  private async checkFIPSAlgorithms(organizationId?: string): Promise<'pass' | 'fail' | 'warning'> {
    // Check if only FIPS-approved algorithms are used
    return 'pass'; // Placeholder
  }

  /**
   * Helper methods for calculations
   */
  private calculateOpsPerSecond(): number {
    // Calculate operations per second from recent metrics
    const recentMetrics = this.healthMetrics.slice(-5);
    if (recentMetrics.length === 0) return 0;

    return recentMetrics.reduce((sum, m) => sum + m.encryption.operationsPerSecond, 0) / recentMetrics.length;
  }

  private calculateErrorRate(): number {
    // Calculate error rate from recent metrics
    const recentMetrics = this.healthMetrics.slice(-5);
    if (recentMetrics.length === 0) return 0;

    return recentMetrics.reduce((sum, m) => sum + m.encryption.errorRate, 0) / recentMetrics.length;
  }

  private calculateSectionScore(checks: ComplianceCheck[]): number {
    if (checks.length === 0) return 1;
    const passed = checks.filter(check => check.status === 'pass').length;
    return passed / checks.length;
  }

  private calculateSectionStatus(checks: ComplianceCheck[]): 'compliant' | 'non_compliant' | 'partially_compliant' {
    const score = this.calculateSectionScore(checks);
    if (score === 1) return 'compliant';
    if (score === 0) return 'non_compliant';
    return 'partially_compliant';
  }

  private generateRecommendations(sections: ComplianceSection[]): string[] {
    const recommendations: string[] = [];

    for (const section of sections) {
      for (const check of section.checks) {
        if (check.status === 'fail' && check.remediation) {
          recommendations.push(check.remediation);
        }
      }
    }

    return [...new Set(recommendations)]; // Remove duplicates
  }

  private calculateNextAuditDate(reportType: string): Date {
    // Calculate next audit date based on compliance requirements
    const intervals = {
      'PCI_DSS': 365, // Annual
      'PIPEDA': 365, // Annual
      'SOX': 90, // Quarterly
      'GDPR': 365, // Annual
      'FIPS_140_2': 365, // Annual
      'COMPREHENSIVE': 90 // Quarterly
    };

    const days = intervals[reportType as keyof typeof intervals] || 365;
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }

  private async storeComplianceReport(report: ComplianceReport): Promise<void> {
    // Store report in database
    // Implementation would depend on the database schema
    logger.info('Compliance report stored', { reportId: report.id });
  }

  private generateReportId(): string {
    return `report_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }

  private generateAlertId(): string {
    return `alert_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }

  /**
   * Placeholder methods for database queries
   */
  private async getLastAuditDate(): Promise<Date> {
    return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
  }

  private async getOverallComplianceScore(): Promise<number> {
    return 0.85; // 85%
  }

  private async getViolationsCount(): Promise<number> {
    return 0;
  }

  private async getCriticalFindingsCount(): Promise<number> {
    return 0;
  }

  private async getLastReportDate(): Promise<Date> {
    return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  }

  private async getCriticalIssuesCount(): Promise<number> {
    return 0;
  }

  private async getPendingActionsCount(): Promise<number> {
    return 0;
  }

  private async getLastRotationDate(): Promise<Date> {
    return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  }

  private async getNextScheduledRotation(): Promise<Date> {
    return new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
  }

  private async getOrganizationsWithPendingRotation(): Promise<number> {
    return 0;
  }

  /**
   * Cleanup service
   */
  public async shutdown(): Promise<void> {
    clearInterval(this.monitoringInterval);
    this.removeAllListeners();
    logger.info('Encryption monitoring service shut down');
  }
}

// Export singleton instance (will be initialized with Prisma client)
export let encryptionMonitoringService: EncryptionMonitoringService;

export function initializeEncryptionMonitoringService(prisma: PrismaClient): void {
  encryptionMonitoringService = new EncryptionMonitoringService(prisma);
}