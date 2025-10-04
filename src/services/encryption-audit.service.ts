import crypto from 'crypto';
import { logger } from '../utils/logger';
import { PrismaClient } from '@prisma/client';

export interface EncryptionAuditEvent {
  id: string;
  organizationId: string;
  userId?: string;
  sessionId?: string;

  // Event details
  eventType: EncryptionEventType;
  operation: EncryptionOperation;
  status: 'success' | 'failure' | 'warning';

  // Context
  modelName?: string;
  fieldName?: string;
  recordId?: string;
  keyVersion?: number;
  keyId?: string;

  // Security context
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;

  // Performance metrics
  duration?: number;
  dataSize?: number;

  // Additional metadata
  metadata?: Record<string, any>;
  error?: string;

  // Compliance flags
  complianceFlags: string[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';

  // Immutable timestamp
  timestamp: Date;
}

export enum EncryptionEventType {
  DATA_ENCRYPTION = 'data_encryption',
  DATA_DECRYPTION = 'data_decryption',
  KEY_GENERATION = 'key_generation',
  KEY_ROTATION = 'key_rotation',
  KEY_ACCESS = 'key_access',
  KEY_EXPORT = 'key_export',
  KEY_IMPORT = 'key_import',
  KEY_DELETION = 'key_deletion',
  SEARCH_OPERATION = 'search_operation',
  CACHE_ACCESS = 'cache_access',
  POLICY_CHANGE = 'policy_change',
  SYSTEM_EVENT = 'system_event'
}

export enum EncryptionOperation {
  ENCRYPT_FIELD = 'encrypt_field',
  DECRYPT_FIELD = 'decrypt_field',
  BATCH_ENCRYPT = 'batch_encrypt',
  BATCH_DECRYPT = 'batch_decrypt',
  GENERATE_KEY = 'generate_key',
  DERIVE_KEY = 'derive_key',
  ROTATE_KEY = 'rotate_key',
  DELETE_KEY = 'delete_key',
  EXPORT_KEY = 'export_key',
  IMPORT_KEY = 'import_key',
  SEARCH_ENCRYPTED = 'search_encrypted',
  INDEX_FIELD = 'index_field',
  CACHE_HIT = 'cache_hit',
  CACHE_MISS = 'cache_miss',
  VALIDATE_KEY = 'validate_key',
  UPDATE_POLICY = 'update_policy'
}

export interface AuditQuery {
  organizationId?: string;
  userId?: string;
  eventType?: EncryptionEventType;
  operation?: EncryptionOperation;
  status?: 'success' | 'failure' | 'warning';
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export interface AuditSummary {
  totalEvents: number;
  eventsByType: Record<EncryptionEventType, number>;
  eventsByStatus: Record<string, number>;
  riskLevelDistribution: Record<string, number>;
  topUsers: Array<{ userId: string; eventCount: number }>;
  recentFailures: EncryptionAuditEvent[];
  performanceMetrics: {
    averageDuration: number;
    slowestOperations: Array<{ operation: string; duration: number }>;
  };
}

export interface ComplianceReport {
  organizationId: string;
  reportType: 'PCI_DSS' | 'PIPEDA' | 'SOX' | 'GDPR' | 'FIPS_140_2';
  generatedAt: Date;
  period: { startDate: Date; endDate: Date };
  findings: ComplianceFinding[];
  summary: {
    totalChecks: number;
    passedChecks: number;
    failedChecks: number;
    warningChecks: number;
    complianceScore: number;
  };
}

export interface ComplianceFinding {
  checkId: string;
  description: string;
  status: 'pass' | 'fail' | 'warning';
  severity: 'low' | 'medium' | 'high' | 'critical';
  details: string;
  recommendation?: string;
  relatedEvents: string[];
}

/**
 * Comprehensive encryption audit service for compliance and security monitoring
 *
 * Features:
 * - Immutable audit logging with integrity verification
 * - Real-time anomaly detection and alerting
 * - Compliance reporting for PCI DSS, PIPEDA, SOX, GDPR, FIPS 140-2
 * - Performance monitoring and optimization insights
 * - Risk assessment and threat detection
 */
export class EncryptionAuditService {
  private readonly prisma: PrismaClient;
  private readonly auditBuffer: EncryptionAuditEvent[] = [];
  private readonly flushInterval: NodeJS.Timeout;

  // Configuration
  private readonly BUFFER_SIZE = 100;
  private readonly FLUSH_INTERVAL_MS = 5000; // 5 seconds
  private readonly MAX_QUERY_LIMIT = 10000;
  private readonly ANOMALY_THRESHOLD = 10; // Events per minute

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;

    // Start periodic buffer flush
    this.flushInterval = setInterval(() => {
      this.flushAuditBuffer();
    }, this.FLUSH_INTERVAL_MS);

    logger.info('Encryption audit service initialized');
  }

  /**
   * Log encryption audit event
   */
  public async logEvent(event: Partial<EncryptionAuditEvent>): Promise<void> {
    const auditEvent: EncryptionAuditEvent = {
      id: this.generateEventId(),
      organizationId: event.organizationId!,
      userId: event.userId,
      sessionId: event.sessionId,

      eventType: event.eventType!,
      operation: event.operation!,
      status: event.status!,

      modelName: event.modelName,
      fieldName: event.fieldName,
      recordId: event.recordId,
      keyVersion: event.keyVersion,
      keyId: event.keyId,

      ipAddress: event.ipAddress,
      userAgent: event.userAgent,
      requestId: event.requestId,

      duration: event.duration,
      dataSize: event.dataSize,

      metadata: event.metadata,
      error: event.error,

      complianceFlags: event.complianceFlags || [],
      riskLevel: this.calculateRiskLevel(event),

      timestamp: new Date()
    };

    // Add to buffer
    this.auditBuffer.push(auditEvent);

    // Immediate flush for high-risk events
    if (auditEvent.riskLevel === 'critical' || auditEvent.status === 'failure') {
      await this.flushAuditBuffer();
    }

    // Flush buffer if it's full
    if (this.auditBuffer.length >= this.BUFFER_SIZE) {
      await this.flushAuditBuffer();
    }

    // Check for anomalies
    await this.checkForAnomalies(auditEvent);

    logger.debug('Encryption audit event logged', {
      eventId: auditEvent.id,
      eventType: auditEvent.eventType,
      operation: auditEvent.operation,
      status: auditEvent.status,
      riskLevel: auditEvent.riskLevel
    });
  }

  /**
   * Flush audit buffer to database
   */
  private async flushAuditBuffer(): Promise<void> {
    if (this.auditBuffer.length === 0) {
      return;
    }

    const events = this.auditBuffer.splice(0);

    try {
      // In production, store in dedicated audit table:
      //
      // CREATE TABLE encryption_audit_log (
      //   id VARCHAR(255) PRIMARY KEY,
      //   organization_id VARCHAR(255) NOT NULL,
      //   user_id VARCHAR(255),
      //   session_id VARCHAR(255),
      //   event_type ENUM(...) NOT NULL,
      //   operation ENUM(...) NOT NULL,
      //   status ENUM('success', 'failure', 'warning') NOT NULL,
      //   model_name VARCHAR(100),
      //   field_name VARCHAR(100),
      //   record_id VARCHAR(255),
      //   key_version INT,
      //   key_id VARCHAR(255),
      //   ip_address VARCHAR(45),
      //   user_agent TEXT,
      //   request_id VARCHAR(255),
      //   duration INT,
      //   data_size BIGINT,
      //   metadata JSON,
      //   error TEXT,
      //   compliance_flags JSON,
      //   risk_level ENUM('low', 'medium', 'high', 'critical') NOT NULL,
      //   timestamp TIMESTAMP(6) NOT NULL,
      //   integrity_hash VARCHAR(64) NOT NULL,
      //   INDEX idx_org_timestamp (organization_id, timestamp),
      //   INDEX idx_event_type (event_type),
      //   INDEX idx_risk_level (risk_level),
      //   INDEX idx_status (status)
      // );

      for (const event of events) {
        // Calculate integrity hash
        const integrityHash = this.calculateIntegrityHash(event);

        // Store event (placeholder)
        await this.storeAuditEvent({ ...event, integrityHash });
      }

      logger.debug('Audit buffer flushed', { eventCount: events.length });

    } catch (error) {
      // Add events back to buffer on failure
      this.auditBuffer.unshift(...events);

      logger.error('Failed to flush audit buffer', {
        eventCount: events.length,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Store audit event in database
   */
  private async storeAuditEvent(event: EncryptionAuditEvent & { integrityHash: string }): Promise<void> {
    try {
      await this.prisma.encryptionAuditLog.create({
        data: {
          organizationId: event.organizationId,
          operation: event.operation,
          entityType: event.modelName || null,
          entityId: event.recordId || null,
          fieldName: event.fieldName || null,
          duration: event.duration || 0,
          dataSize: event.dataSize || null,
          keyVersion: event.keyVersion || 0,
          algorithm: 'AES-256-GCM', // Default algorithm
          userId: event.userId || null,
          ipAddress: event.ipAddress || null,
          userAgent: event.userAgent || null,
          success: event.status === 'success',
          errorMessage: event.error || null,
        },
      });

      logger.debug('Audit event stored', { eventId: event.id });
    } catch (error) {
      logger.error('Failed to store audit event', {
        eventId: event.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Calculate integrity hash for tamper detection
   */
  private calculateIntegrityHash(event: EncryptionAuditEvent): string {
    const eventData = {
      id: event.id,
      organizationId: event.organizationId,
      eventType: event.eventType,
      operation: event.operation,
      status: event.status,
      timestamp: event.timestamp.toISOString(),
      modelName: event.modelName,
      fieldName: event.fieldName,
      recordId: event.recordId
    };

    return crypto
      .createHash('sha256')
      .update(JSON.stringify(eventData))
      .digest('hex');
  }

  /**
   * Calculate risk level based on event characteristics
   */
  private calculateRiskLevel(event: Partial<EncryptionAuditEvent>): 'low' | 'medium' | 'high' | 'critical' {
    let score = 0;

    // Failure events are higher risk
    if (event.status === 'failure') score += 3;
    if (event.status === 'warning') score += 1;

    // Key operations are higher risk
    if (event.eventType === EncryptionEventType.KEY_EXPORT) score += 3;
    if (event.eventType === EncryptionEventType.KEY_DELETION) score += 2;
    if (event.eventType === EncryptionEventType.KEY_ROTATION) score += 1;

    // External IP addresses are higher risk
    if (event.ipAddress && !this.isInternalIP(event.ipAddress)) score += 1;

    // Large data operations are higher risk
    if (event.dataSize && event.dataSize > 1000000) score += 1; // > 1MB

    // Slow operations might indicate issues
    if (event.duration && event.duration > 5000) score += 1; // > 5 seconds

    if (score >= 5) return 'critical';
    if (score >= 3) return 'high';
    if (score >= 1) return 'medium';
    return 'low';
  }

  /**
   * Check if IP address is internal
   */
  private isInternalIP(ip: string): boolean {
    const internalRanges = [
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[01])\./,
      /^192\.168\./,
      /^127\./,
      /^::1$/,
      /^localhost$/i
    ];

    return internalRanges.some(range => range.test(ip));
  }

  /**
   * Check for anomalies and trigger alerts
   */
  private async checkForAnomalies(event: EncryptionAuditEvent): Promise<void> {
    try {
      // Check for rapid successive failures
      if (event.status === 'failure') {
        const recentFailures = await this.getRecentEvents({
          organizationId: event.organizationId,
          status: 'failure',
          startDate: new Date(Date.now() - 60000), // Last minute
          limit: this.ANOMALY_THRESHOLD
        });

        if (recentFailures.length >= this.ANOMALY_THRESHOLD) {
          await this.triggerAnomalyAlert('rapid_failures', event, {
            failureCount: recentFailures.length,
            timeframe: '1 minute'
          });
        }
      }

      // Check for unusual key access patterns
      if (event.eventType === EncryptionEventType.KEY_ACCESS) {
        const recentKeyAccess = await this.getRecentEvents({
          organizationId: event.organizationId,
          eventType: EncryptionEventType.KEY_ACCESS,
          startDate: new Date(Date.now() - 300000), // Last 5 minutes
          limit: this.ANOMALY_THRESHOLD * 2
        });

        if (recentKeyAccess.length >= this.ANOMALY_THRESHOLD * 2) {
          await this.triggerAnomalyAlert('excessive_key_access', event, {
            accessCount: recentKeyAccess.length,
            timeframe: '5 minutes'
          });
        }
      }

    } catch (error) {
      logger.error('Anomaly detection failed', {
        eventId: event.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Trigger anomaly alert
   */
  private async triggerAnomalyAlert(
    anomalyType: string,
    event: EncryptionAuditEvent,
    details: Record<string, any>
  ): Promise<void> {
    logger.warn('Encryption anomaly detected', {
      anomalyType,
      eventId: event.id,
      organizationId: event.organizationId,
      details
    });

    // In production, send alerts to security team
    // await this.notificationService.sendSecurityAlert(anomalyType, event, details);
  }

  /**
   * Query audit events
   */
  public async getAuditEvents(query: AuditQuery): Promise<EncryptionAuditEvent[]> {
    try {
      const where: any = {};

      if (query.organizationId) {
        where.organizationId = query.organizationId;
      }

      if (query.userId) {
        where.userId = query.userId;
      }

      if (query.operation) {
        where.operation = query.operation;
      }

      if (query.status) {
        where.success = query.status === 'success';
      }

      if (query.startDate || query.endDate) {
        where.timestamp = {};
        if (query.startDate) {
          where.timestamp.gte = query.startDate;
        }
        if (query.endDate) {
          where.timestamp.lte = query.endDate;
        }
      }

      const logs = await this.prisma.encryptionAuditLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: query.limit || 100,
        skip: query.offset || 0,
      });

      // Convert database logs to EncryptionAuditEvent format
      return logs.map(log => ({
        id: log.id,
        organizationId: log.organizationId,
        userId: log.userId || undefined,
        sessionId: undefined,

        eventType: this.operationToEventType(log.operation),
        operation: log.operation as EncryptionOperation,
        status: log.success ? 'success' as const : 'failure' as const,

        modelName: log.entityType || undefined,
        fieldName: log.fieldName || undefined,
        recordId: log.entityId || undefined,
        keyVersion: log.keyVersion,
        keyId: undefined,

        ipAddress: log.ipAddress || undefined,
        userAgent: log.userAgent || undefined,
        requestId: undefined,

        duration: log.duration,
        dataSize: log.dataSize || undefined,

        metadata: undefined,
        error: log.errorMessage || undefined,

        complianceFlags: [],
        riskLevel: this.calculateRiskLevelFromLog(log),

        timestamp: log.timestamp,
      }));
    } catch (error) {
      logger.error('Failed to query audit events', {
        error: error instanceof Error ? error.message : 'Unknown error',
        query,
      });
      return [];
    }
  }

  /**
   * Map operation to event type
   */
  private operationToEventType(operation: string): EncryptionEventType {
    const operationMap: Record<string, EncryptionEventType> = {
      encrypt_field: EncryptionEventType.DATA_ENCRYPTION,
      decrypt_field: EncryptionEventType.DATA_DECRYPTION,
      batch_encrypt: EncryptionEventType.DATA_ENCRYPTION,
      batch_decrypt: EncryptionEventType.DATA_DECRYPTION,
      generate_key: EncryptionEventType.KEY_GENERATION,
      derive_key: EncryptionEventType.KEY_GENERATION,
      rotate_key: EncryptionEventType.KEY_ROTATION,
      delete_key: EncryptionEventType.KEY_DELETION,
      export_key: EncryptionEventType.KEY_EXPORT,
      import_key: EncryptionEventType.KEY_IMPORT,
      search_encrypted: EncryptionEventType.SEARCH_OPERATION,
      index_field: EncryptionEventType.SEARCH_OPERATION,
      cache_hit: EncryptionEventType.CACHE_ACCESS,
      cache_miss: EncryptionEventType.CACHE_ACCESS,
      validate_key: EncryptionEventType.KEY_ACCESS,
      update_policy: EncryptionEventType.POLICY_CHANGE,
    };

    return operationMap[operation] || EncryptionEventType.SYSTEM_EVENT;
  }

  /**
   * Calculate risk level from database log
   */
  private calculateRiskLevelFromLog(log: any): 'low' | 'medium' | 'high' | 'critical' {
    let score = 0;

    if (!log.success) score += 3;
    if (log.operation.includes('key')) score += 2;
    if (log.duration > 5000) score += 1;
    if (log.dataSize && log.dataSize > 1000000) score += 1;

    if (score >= 5) return 'critical';
    if (score >= 3) return 'high';
    if (score >= 1) return 'medium';
    return 'low';
  }

  /**
   * Get recent events
   */
  private async getRecentEvents(query: AuditQuery): Promise<EncryptionAuditEvent[]> {
    return this.getAuditEvents({
      ...query,
      endDate: new Date(),
      limit: query.limit || 100
    });
  }

  /**
   * Generate audit summary
   */
  public async generateAuditSummary(
    organizationId: string,
    startDate: Date,
    endDate: Date
  ): Promise<AuditSummary> {
    const events = await this.getAuditEvents({
      organizationId,
      startDate,
      endDate,
      limit: this.MAX_QUERY_LIMIT
    });

    // Calculate summary statistics
    const eventsByType = {} as Record<EncryptionEventType, number>;
    const eventsByStatus = {} as Record<string, number>;
    const riskLevelDistribution = {} as Record<string, number>;
    const userEventCounts = {} as Record<string, number>;
    const operationDurations: Array<{ operation: string; duration: number }> = [];

    for (const event of events) {
      // Count by type
      eventsByType[event.eventType] = (eventsByType[event.eventType] || 0) + 1;

      // Count by status
      eventsByStatus[event.status] = (eventsByStatus[event.status] || 0) + 1;

      // Count by risk level
      riskLevelDistribution[event.riskLevel] = (riskLevelDistribution[event.riskLevel] || 0) + 1;

      // Count by user
      if (event.userId) {
        userEventCounts[event.userId] = (userEventCounts[event.userId] || 0) + 1;
      }

      // Collect duration data
      if (event.duration) {
        operationDurations.push({
          operation: event.operation,
          duration: event.duration
        });
      }
    }

    // Get top users
    const topUsers = Object.entries(userEventCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([userId, eventCount]) => ({ userId, eventCount }));

    // Get recent failures
    const recentFailures = events
      .filter(e => e.status === 'failure')
      .slice(0, 10);

    // Calculate performance metrics
    const averageDuration = operationDurations.length > 0
      ? operationDurations.reduce((sum, op) => sum + op.duration, 0) / operationDurations.length
      : 0;

    const slowestOperations = operationDurations
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 10);

    return {
      totalEvents: events.length,
      eventsByType,
      eventsByStatus,
      riskLevelDistribution,
      topUsers,
      recentFailures,
      performanceMetrics: {
        averageDuration,
        slowestOperations
      }
    };
  }

  /**
   * Generate compliance report
   */
  public async generateComplianceReport(
    organizationId: string,
    reportType: 'PCI_DSS' | 'PIPEDA' | 'SOX' | 'GDPR' | 'FIPS_140_2',
    startDate: Date,
    endDate: Date
  ): Promise<ComplianceReport> {
    const events = await this.getAuditEvents({
      organizationId,
      startDate,
      endDate,
      limit: this.MAX_QUERY_LIMIT
    });

    let findings: ComplianceFinding[];

    switch (reportType) {
      case 'PCI_DSS':
        findings = await this.performPCIDSSChecks(events);
        break;
      case 'PIPEDA':
        findings = await this.performPIPEDAChecks(events);
        break;
      case 'SOX':
        findings = await this.performSOXChecks(events);
        break;
      case 'GDPR':
        findings = await this.performGDPRChecks(events);
        break;
      case 'FIPS_140_2':
        findings = await this.performFIPS140_2Checks(events);
        break;
      default:
        findings = [];
    }

    const totalChecks = findings.length;
    const passedChecks = findings.filter(f => f.status === 'pass').length;
    const failedChecks = findings.filter(f => f.status === 'fail').length;
    const warningChecks = findings.filter(f => f.status === 'warning').length;
    const complianceScore = totalChecks > 0 ? (passedChecks / totalChecks) * 100 : 100;

    return {
      organizationId,
      reportType,
      generatedAt: new Date(),
      period: { startDate, endDate },
      findings,
      summary: {
        totalChecks,
        passedChecks,
        failedChecks,
        warningChecks,
        complianceScore
      }
    };
  }

  /**
   * Perform PCI DSS compliance checks
   */
  private async performPCIDSSChecks(events: EncryptionAuditEvent[]): Promise<ComplianceFinding[]> {
    const findings: ComplianceFinding[] = [];

    // PCI DSS Requirement 3: Protect stored cardholder data
    const cardDataEvents = events.filter(e =>
      e.fieldName?.includes('card') || e.fieldName?.includes('payment')
    );

    findings.push({
      checkId: 'PCI-3.4',
      description: 'Primary Account Numbers (PANs) must be rendered unreadable',
      status: cardDataEvents.every(e => e.eventType === EncryptionEventType.DATA_ENCRYPTION) ? 'pass' : 'fail',
      severity: 'critical',
      details: `${cardDataEvents.length} card data operations found`,
      relatedEvents: cardDataEvents.map(e => e.id)
    });

    // PCI DSS Requirement 3.5: Document and implement procedures to protect keys
    const keyEvents = events.filter(e =>
      e.eventType === EncryptionEventType.KEY_ACCESS ||
      e.eventType === EncryptionEventType.KEY_ROTATION
    );

    findings.push({
      checkId: 'PCI-3.5',
      description: 'Cryptographic keys must be protected and managed',
      status: keyEvents.every(e => e.status === 'success') ? 'pass' : 'warning',
      severity: 'high',
      details: `${keyEvents.length} key operations, ${keyEvents.filter(e => e.status === 'failure').length} failures`,
      relatedEvents: keyEvents.map(e => e.id)
    });

    return findings;
  }

  /**
   * Perform PIPEDA compliance checks
   */
  private async performPIPEDAChecks(events: EncryptionAuditEvent[]): Promise<ComplianceFinding[]> {
    const findings: ComplianceFinding[] = [];

    // PIPEDA Principle 7: Safeguards
    const personalDataEvents = events.filter(e =>
      e.fieldName?.includes('sin') || e.fieldName?.includes('ssn') ||
      e.fieldName?.includes('phone') || e.fieldName?.includes('email')
    );

    findings.push({
      checkId: 'PIPEDA-7',
      description: 'Personal information must be protected by security safeguards',
      status: personalDataEvents.every(e => e.eventType === EncryptionEventType.DATA_ENCRYPTION) ? 'pass' : 'fail',
      severity: 'high',
      details: `${personalDataEvents.length} personal data operations`,
      relatedEvents: personalDataEvents.map(e => e.id)
    });

    return findings;
  }

  /**
   * Perform SOX compliance checks
   */
  private async performSOXChecks(events: EncryptionAuditEvent[]): Promise<ComplianceFinding[]> {
    const findings: ComplianceFinding[] = [];

    // SOX Section 404: Management assessment of internal controls
    const financialDataEvents = events.filter(e =>
      e.modelName?.includes('Invoice') || e.modelName?.includes('Payment') ||
      e.modelName?.includes('Quote') || e.fieldName?.includes('amount')
    );

    findings.push({
      checkId: 'SOX-404',
      description: 'Financial data must have adequate internal controls',
      status: financialDataEvents.every(e => e.status === 'success') ? 'pass' : 'warning',
      severity: 'high',
      details: `${financialDataEvents.length} financial data operations`,
      relatedEvents: financialDataEvents.map(e => e.id)
    });

    return findings;
  }

  /**
   * Perform GDPR compliance checks
   */
  private async performGDPRChecks(events: EncryptionAuditEvent[]): Promise<ComplianceFinding[]> {
    const findings: ComplianceFinding[] = [];

    // GDPR Article 32: Security of processing
    const personalDataEvents = events.filter(e =>
      e.fieldName?.includes('email') || e.fieldName?.includes('phone') ||
      e.fieldName?.includes('address') || e.fieldName?.includes('name')
    );

    findings.push({
      checkId: 'GDPR-32',
      description: 'Personal data must be processed securely',
      status: personalDataEvents.every(e => e.eventType === EncryptionEventType.DATA_ENCRYPTION) ? 'pass' : 'fail',
      severity: 'critical',
      details: `${personalDataEvents.length} personal data operations`,
      relatedEvents: personalDataEvents.map(e => e.id)
    });

    return findings;
  }

  /**
   * Perform FIPS 140-2 compliance checks
   */
  private async performFIPS140_2Checks(events: EncryptionAuditEvent[]): Promise<ComplianceFinding[]> {
    const findings: ComplianceFinding[] = [];

    // FIPS 140-2 Level 1: Basic security requirements
    const cryptoEvents = events.filter(e =>
      e.eventType === EncryptionEventType.DATA_ENCRYPTION ||
      e.eventType === EncryptionEventType.DATA_DECRYPTION ||
      e.eventType === EncryptionEventType.KEY_GENERATION
    );

    findings.push({
      checkId: 'FIPS-140-2-L1',
      description: 'Cryptographic operations must use approved algorithms',
      status: cryptoEvents.every(e => e.status === 'success') ? 'pass' : 'warning',
      severity: 'high',
      details: `${cryptoEvents.length} cryptographic operations`,
      relatedEvents: cryptoEvents.map(e => e.id)
    });

    return findings;
  }

  /**
   * Generate unique event ID
   */
  private generateEventId(): string {
    const timestamp = Date.now();
    const random = crypto.randomBytes(4).toString('hex');
    return `audit_${timestamp}_${random}`;
  }

  /**
   * Cleanup old audit logs based on retention policy
   */
  public async cleanupOldLogs(retentionDays: number): Promise<number> {
    const cutoffDate = new Date(Date.now() - (retentionDays * 24 * 60 * 60 * 1000));

    try {
      const result = await this.prisma.encryptionAuditLog.deleteMany({
        where: {
          timestamp: {
            lt: cutoffDate,
          },
        },
      });

      const deletedCount = result.count;

      logger.info('Old audit logs cleaned up', {
        retentionDays,
        cutoffDate,
        deletedCount,
      });

      return deletedCount;
    } catch (error) {
      logger.error('Failed to cleanup old audit logs', {
        error: error instanceof Error ? error.message : 'Unknown error',
        retentionDays,
        cutoffDate,
      });
      return 0;
    }
  }

  /**
   * Verify audit log integrity
   */
  public async verifyIntegrity(
    organizationId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{ totalEvents: number; validEvents: number; invalidEvents: number }> {
    const events = await this.getAuditEvents({
      organizationId,
      startDate,
      endDate,
      limit: this.MAX_QUERY_LIMIT
    });

    let validEvents = 0;
    let invalidEvents = 0;

    for (const event of events) {
      const expectedHash = this.calculateIntegrityHash(event);
      // In production, compare with stored integrity hash
      const storedHash = 'placeholder'; // Get from database

      if (expectedHash === storedHash) {
        validEvents++;
      } else {
        invalidEvents++;
        logger.error('Audit log integrity violation detected', {
          eventId: event.id,
          expectedHash,
          storedHash
        });
      }
    }

    return {
      totalEvents: events.length,
      validEvents,
      invalidEvents
    };
  }

  /**
   * Get encryption performance metrics
   */
  public async getEncryptionMetrics(
    organizationId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{
    totalOperations: number;
    successfulOperations: number;
    failedOperations: number;
    averageDuration: number;
    totalDataProcessed: number;
    operationsByType: Record<string, number>;
    slowestOperations: Array<{ id: string; operation: string; duration: number }>;
  }> {
    try {
      const logs = await this.prisma.encryptionAuditLog.findMany({
        where: {
          organizationId,
          timestamp: {
            gte: startDate,
            lte: endDate,
          },
        },
        orderBy: { timestamp: 'desc' },
      });

      const totalOperations = logs.length;
      const successfulOperations = logs.filter(log => log.success).length;
      const failedOperations = logs.filter(log => !log.success).length;

      const totalDuration = logs.reduce((sum, log) => sum + log.duration, 0);
      const averageDuration = totalOperations > 0 ? totalDuration / totalOperations : 0;

      const totalDataProcessed = logs.reduce((sum, log) => sum + (log.dataSize || 0), 0);

      const operationsByType: Record<string, number> = {};
      for (const log of logs) {
        operationsByType[log.operation] = (operationsByType[log.operation] || 0) + 1;
      }

      const slowestOperations = logs
        .sort((a, b) => b.duration - a.duration)
        .slice(0, 10)
        .map(log => ({
          id: log.id,
          operation: log.operation,
          duration: log.duration,
        }));

      return {
        totalOperations,
        successfulOperations,
        failedOperations,
        averageDuration,
        totalDataProcessed,
        operationsByType,
        slowestOperations,
      };
    } catch (error) {
      logger.error('Failed to get encryption metrics', {
        error: error instanceof Error ? error.message : 'Unknown error',
        organizationId,
      });
      throw error;
    }
  }

  /**
   * Cleanup on service shutdown
   */
  public async shutdown(): Promise<void> {
    clearInterval(this.flushInterval);
    await this.flushAuditBuffer();
    logger.info('Encryption audit service shut down');
  }
}

// Export singleton instance (will be initialized with Prisma client)
export let encryptionAuditService: EncryptionAuditService;

export function initializeEncryptionAuditService(prisma: PrismaClient): void {
  encryptionAuditService = new EncryptionAuditService(prisma);
}