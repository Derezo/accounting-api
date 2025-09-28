/**
 * Compliance Manager - GDPR, audit trails, and data governance
 */

import { PrismaClient } from '@prisma/client';
import winston from 'winston';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { EncryptionUtils } from './encryption-utils';

export interface DataSubject {
  id: string;
  type: 'person' | 'business';
  identifiers: {
    email?: string;
    phone?: string;
    socialInsNumber?: string;
    businessNumber?: string;
  };
  consentRecords: ConsentRecord[];
  dataLocations: DataLocation[];
}

export interface ConsentRecord {
  id: string;
  subjectId: string;
  purpose: string;
  consentGiven: boolean;
  consentDate: Date;
  withdrawnDate?: Date;
  legalBasis: 'consent' | 'contract' | 'legitimate_interest' | 'legal_obligation';
  source: string;
  ipAddress?: string;
}

export interface DataLocation {
  table: string;
  column: string;
  recordId: string;
  dataType: 'PII' | 'sensitive' | 'financial' | 'metadata';
  encrypted: boolean;
}

export interface GDPRRequest {
  id: string;
  type: 'access' | 'rectification' | 'erasure' | 'portability' | 'restriction';
  subjectId: string;
  requestDate: Date;
  status: 'pending' | 'processing' | 'completed' | 'rejected';
  completedDate?: Date;
  rejectionReason?: string;
  requestDetails: any;
  responseData?: any;
}

export interface AuditTrailEntry {
  id: string;
  organizationId: string;
  userId?: string;
  action: string;
  entityType: string;
  entityId: string;
  changes: any;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
  classification: 'low' | 'medium' | 'high' | 'critical';
}

export interface ComplianceReport {
  timestamp: Date;
  organization: string;
  period: { start: Date; end: Date };
  dataSubjects: number;
  consentRecords: number;
  gdprRequests: number;
  auditEvents: number;
  dataBreaches: number;
  encryptedFields: number;
  complianceScore: number;
  issues: string[];
  recommendations: string[];
}

export class ComplianceManager {
  private prisma: PrismaClient;
  private logger: winston.Logger;
  private encryptionUtils: EncryptionUtils;

  constructor(prisma: PrismaClient, encryptionKey: string) {
    this.prisma = prisma;
    this.encryptionUtils = new EncryptionUtils(encryptionKey);

    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      transports: [
        new winston.transports.File({
          filename: 'database/logs/compliance.log',
          maxsize: 10 * 1024 * 1024, // 10MB
          maxFiles: 10,
        }),
        new winston.transports.File({
          filename: 'database/logs/audit-trail.log',
          level: 'info',
          maxsize: 50 * 1024 * 1024, // 50MB
          maxFiles: 20,
        }),
      ],
    });
  }

  /**
   * Process GDPR data subject access request
   */
  async processAccessRequest(
    organizationId: string,
    identifiers: { email?: string; phone?: string; socialInsNumber?: string }
  ): Promise<any> {
    this.logger.info('Processing GDPR access request', { organizationId, identifiers });

    try {
      const dataSubject = await this.findDataSubject(organizationId, identifiers);

      if (!dataSubject) {
        throw new Error('Data subject not found');
      }

      // Collect all personal data
      const personalData = await this.collectPersonalData(organizationId, dataSubject.id);

      // Decrypt sensitive fields
      const decryptedData = await this.decryptPersonalData(personalData, organizationId);

      // Create audit log entry
      await this.createAuditEntry({
        organizationId,
        action: 'GDPR_ACCESS_REQUEST',
        entityType: 'DataSubject',
        entityId: dataSubject.id,
        changes: { requestType: 'access', identifiers },
        classification: 'high',
      });

      return {
        subject: dataSubject,
        data: decryptedData,
        consentRecords: dataSubject.consentRecords,
        dataLocations: dataSubject.dataLocations,
        exportDate: new Date(),
      };

    } catch (error) {
      this.logger.error('GDPR access request failed:', error);
      throw error;
    }
  }

  /**
   * Process GDPR data erasure request (right to be forgotten)
   */
  async processErasureRequest(
    organizationId: string,
    identifiers: { email?: string; phone?: string; socialInsNumber?: string },
    options: { dryRun?: boolean; preserveFinancial?: boolean } = {}
  ): Promise<{ deleted: any[]; preserved: any[]; errors: string[] }> {
    this.logger.info('Processing GDPR erasure request', { organizationId, identifiers, options });

    const result = { deleted: [], preserved: [], errors: [] };

    try {
      const dataSubject = await this.findDataSubject(organizationId, identifiers);

      if (!dataSubject) {
        throw new Error('Data subject not found');
      }

      // Check if erasure is permissible
      const erasureCheck = await this.checkErasurePermissibility(organizationId, dataSubject.id);

      if (!erasureCheck.allowed) {
        throw new Error(`Erasure not permitted: ${erasureCheck.reason}`);
      }

      if (options.dryRun) {
        // Simulate erasure and return what would be deleted
        const simulatedDeletion = await this.simulateErasure(organizationId, dataSubject.id, options);
        return simulatedDeletion;
      }

      // Perform actual erasure
      await this.performErasure(organizationId, dataSubject.id, options, result);

      // Create audit log entry
      await this.createAuditEntry({
        organizationId,
        action: 'GDPR_ERASURE_REQUEST',
        entityType: 'DataSubject',
        entityId: dataSubject.id,
        changes: { requestType: 'erasure', identifiers, result },
        classification: 'critical',
      });

      this.logger.info('GDPR erasure request completed', { dataSubjectId: dataSubject.id, result });

      return result;

    } catch (error) {
      this.logger.error('GDPR erasure request failed:', error);
      result.errors.push(error instanceof Error ? error.message : String(error));
      return result;
    }
  }

  /**
   * Anonymize data for development/testing environments
   */
  async anonymizeData(
    organizationId: string,
    options: {
      preserveStructure: boolean;
      seedValue?: string;
    } = { preserveStructure: true }
  ): Promise<void> {
    this.logger.info('Starting data anonymization', { organizationId, options });

    try {
      // Set up consistent randomization if seed provided
      if (options.seedValue) {
        // Would set random seed for consistent anonymization
      }

      // Anonymize personal data
      await this.anonymizePersonalData(organizationId, options);

      // Anonymize business data
      await this.anonymizeBusinessData(organizationId, options);

      // Anonymize financial data (be careful to maintain relationships)
      if (!options.preserveStructure) {
        await this.anonymizeFinancialData(organizationId, options);
      }

      this.logger.info('Data anonymization completed', { organizationId });

    } catch (error) {
      this.logger.error('Data anonymization failed:', error);
      throw error;
    }
  }

  /**
   * Generate compliance report
   */
  async generateComplianceReport(
    organizationId: string,
    period: { start: Date; end: Date }
  ): Promise<ComplianceReport> {
    this.logger.info('Generating compliance report', { organizationId, period });

    try {
      const organization = await this.prisma.organization.findUnique({
        where: { id: organizationId },
      });

      if (!organization) {
        throw new Error('Organization not found');
      }

      // Count data subjects
      const dataSubjectsCount = await this.countDataSubjects(organizationId);

      // Count consent records
      const consentRecordsCount = await this.countConsentRecords(organizationId, period);

      // Count GDPR requests
      const gdprRequestsCount = await this.countGDPRRequests(organizationId, period);

      // Count audit events
      const auditEventsCount = await this.countAuditEvents(organizationId, period);

      // Check for data breaches
      const dataBreachesCount = await this.countDataBreaches(organizationId, period);

      // Count encrypted fields
      const encryptedFieldsCount = await this.countEncryptedFields(organizationId);

      // Calculate compliance score
      const complianceScore = await this.calculateComplianceScore(organizationId);

      // Identify issues
      const issues = await this.identifyComplianceIssues(organizationId);

      // Generate recommendations
      const recommendations = await this.generateComplianceRecommendations(organizationId);

      const report: ComplianceReport = {
        timestamp: new Date(),
        organization: organization.name,
        period,
        dataSubjects: dataSubjectsCount,
        consentRecords: consentRecordsCount,
        gdprRequests: gdprRequestsCount,
        auditEvents: auditEventsCount,
        dataBreaches: dataBreachesCount,
        encryptedFields: encryptedFieldsCount,
        complianceScore,
        issues,
        recommendations,
      };

      // Save report
      await this.saveComplianceReport(organizationId, report);

      return report;

    } catch (error) {
      this.logger.error('Compliance report generation failed:', error);
      throw error;
    }
  }

  /**
   * Audit trail logging
   */
  async createAuditEntry(entry: Partial<AuditTrailEntry>): Promise<void> {
    try {
      const auditEntry = await this.prisma.auditLog.create({
        data: {
          organizationId: entry.organizationId!,
          userId: entry.userId,
          action: entry.action!,
          entityType: entry.entityType!,
          entityId: entry.entityId!,
          changes: JSON.stringify(entry.changes),
          ipAddress: entry.ipAddress,
          userAgent: entry.userAgent,
        },
      });

      // Also log to Winston for immutable audit trail
      this.logger.info('Audit event', {
        id: auditEntry.id,
        organizationId: entry.organizationId,
        userId: entry.userId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        classification: entry.classification || 'medium',
        timestamp: new Date(),
      });

    } catch (error) {
      this.logger.error('Failed to create audit entry:', error);
      // Don't throw - audit logging should not break business operations
    }
  }

  /**
   * Validate data encryption compliance
   */
  async validateDataEncryption(organizationId: string): Promise<{
    compliant: boolean;
    issues: string[];
    encryptedFields: number;
    unencryptedSensitiveFields: string[];
  }> {
    const issues: string[] = [];
    const unencryptedSensitiveFields: string[] = [];

    try {
      // Check if sensitive fields are encrypted
      const sensitiveFieldsToCheck = [
        { table: 'persons', field: 'socialInsNumber' },
        { table: 'employees', field: 'salary' },
        { table: 'vendors', field: 'bankAccount' },
      ];

      let encryptedCount = 0;

      for (const { table, field } of sensitiveFieldsToCheck) {
        const validation = await this.encryptionUtils.validateEncryptedData(
          this.prisma,
          table,
          field,
          'organizationId'
        );

        if (validation.invalid > 0) {
          unencryptedSensitiveFields.push(`${table}.${field}`);
          issues.push(`${validation.invalid} unencrypted records in ${table}.${field}`);
        } else {
          encryptedCount++;
        }
      }

      const compliant = issues.length === 0;

      return {
        compliant,
        issues,
        encryptedFields: encryptedCount,
        unencryptedSensitiveFields,
      };

    } catch (error) {
      this.logger.error('Data encryption validation failed:', error);
      return {
        compliant: false,
        issues: [`Validation failed: ${error}`],
        encryptedFields: 0,
        unencryptedSensitiveFields: [],
      };
    }
  }

  /**
   * Generate data lineage report
   */
  async generateDataLineageReport(organizationId: string): Promise<any> {
    this.logger.info('Generating data lineage report', { organizationId });

    try {
      // Map data relationships and flows
      const dataMap = {
        organizations: {
          contains: ['users', 'customers', 'vendors', 'invoices', 'payments'],
          stores: ['business data', 'contact information'],
        },
        persons: {
          linkedTo: ['customers', 'employees', 'contractors'],
          stores: ['PII', 'contact information'],
          sensitive: ['socialInsNumber', 'dateOfBirth'],
        },
        customers: {
          linkedTo: ['quotes', 'invoices', 'payments', 'projects'],
          stores: ['business relationship data'],
        },
        invoices: {
          linkedTo: ['customers', 'payments', 'quotes'],
          stores: ['financial data'],
        },
        payments: {
          linkedTo: ['customers', 'invoices'],
          stores: ['financial data', 'payment methods'],
          sensitive: ['stripePaymentIntentId', 'bankReference'],
        },
      };

      return {
        organizationId,
        generatedAt: new Date(),
        dataMap,
        relationships: await this.mapDataRelationships(organizationId),
        dataFlow: await this.analyzeDataFlow(organizationId),
      };

    } catch (error) {
      this.logger.error('Data lineage report generation failed:', error);
      throw error;
    }
  }

  // Private helper methods

  private async findDataSubject(
    organizationId: string,
    identifiers: { email?: string; phone?: string; socialInsNumber?: string }
  ): Promise<DataSubject | null> {
    // Find person by identifiers
    let person = null;

    if (identifiers.email) {
      person = await this.prisma.person.findFirst({
        where: {
          organizationId,
          email: identifiers.email,
        },
      });
    }

    if (!person && identifiers.phone) {
      person = await this.prisma.person.findFirst({
        where: {
          organizationId,
          phone: identifiers.phone,
        },
      });
    }

    // Add more identifier checks as needed

    if (!person) return null;

    return {
      id: person.id,
      type: 'person',
      identifiers,
      consentRecords: [], // Would be populated from consent tracking system
      dataLocations: await this.findDataLocations(organizationId, person.id),
    };
  }

  private async findDataLocations(organizationId: string, subjectId: string): Promise<DataLocation[]> {
    const locations: DataLocation[] = [];

    // Map where personal data is stored
    const dataMappings = [
      { table: 'persons', column: 'email', dataType: 'PII' as const },
      { table: 'persons', column: 'phone', dataType: 'PII' as const },
      { table: 'persons', column: 'socialInsNumber', dataType: 'sensitive' as const },
      { table: 'customers', column: 'notes', dataType: 'metadata' as const },
      // Add more mappings as needed
    ];

    for (const mapping of dataMappings) {
      locations.push({
        table: mapping.table,
        column: mapping.column,
        recordId: subjectId,
        dataType: mapping.dataType,
        encrypted: mapping.dataType === 'sensitive',
      });
    }

    return locations;
  }

  private async collectPersonalData(organizationId: string, subjectId: string): Promise<any> {
    // Collect all personal data related to the subject
    const person = await this.prisma.person.findUnique({
      where: { id: subjectId },
      include: {
        customer: {
          include: {
            quotes: true,
            invoices: true,
            payments: true,
            projects: true,
            appointments: true,
          },
        },
        employee: true,
        contractor: true,
      },
    });

    return person;
  }

  private async decryptPersonalData(data: any, organizationId: string): Promise<any> {
    // Decrypt sensitive fields in the collected data
    if (data && data.socialInsNumber) {
      data.socialInsNumber = this.encryptionUtils.decrypt(data.socialInsNumber, organizationId);
    }

    // Decrypt other sensitive fields as needed

    return data;
  }

  private async checkErasurePermissibility(organizationId: string, subjectId: string): Promise<{
    allowed: boolean;
    reason?: string;
  }> {
    // Check if erasure is legally permissible
    // For example, financial records might need to be preserved for tax purposes

    const activeInvoices = await this.prisma.invoice.count({
      where: {
        organizationId,
        customer: {
          personId: subjectId,
        },
        status: {
          in: ['SENT', 'PARTIAL'],
        },
      },
    });

    if (activeInvoices > 0) {
      return {
        allowed: false,
        reason: 'Active invoices exist - financial records must be preserved',
      };
    }

    return { allowed: true };
  }

  private async simulateErasure(
    organizationId: string,
    subjectId: string,
    options: any
  ): Promise<{ deleted: any[]; preserved: any[]; errors: string[] }> {
    // Simulate what would be deleted/anonymized
    return {
      deleted: ['person record', 'contact information'],
      preserved: ['financial transaction records'],
      errors: [],
    };
  }

  private async performErasure(
    organizationId: string,
    subjectId: string,
    options: any,
    result: any
  ): Promise<void> {
    // Perform actual data erasure/anonymization
    // This is a complex operation that requires careful consideration
    // of data relationships and legal requirements

    await this.prisma.$transaction(async (tx) => {
      // Anonymize personal data
      await tx.person.update({
        where: { id: subjectId },
        data: {
          firstName: 'DELETED',
          lastName: 'USER',
          email: null,
          phone: null,
          socialInsNumber: null,
        },
      });

      result.deleted.push('personal information');

      // Handle related records based on legal requirements
      if (options.preserveFinancial) {
        // Keep financial records but anonymize personal identifiers
        result.preserved.push('financial records (anonymized)');
      }
    });
  }

  private async anonymizePersonalData(organizationId: string, options: any): Promise<void> {
    // Anonymize all personal data in the organization
    await this.encryptionUtils.anonymizeEncryptedData(
      this.prisma,
      'persons',
      {
        email: (original: string) => `user${Math.random().toString(36).substr(2, 9)}@example.com`,
        phone: () => '+1 (555) 000-0000',
        socialInsNumber: () => '900000000', // Test SIN
      },
      'organizationId'
    );
  }

  private async anonymizeBusinessData(organizationId: string, options: any): Promise<void> {
    // Anonymize business-related data
    // Implementation depends on specific requirements
  }

  private async anonymizeFinancialData(organizationId: string, options: any): Promise<void> {
    // Carefully anonymize financial data while preserving structure
    // This requires special handling to maintain referential integrity
  }

  // Compliance reporting helper methods

  private async countDataSubjects(organizationId: string): Promise<number> {
    return await this.prisma.person.count({
      where: { organizationId },
    });
  }

  private async countConsentRecords(organizationId: string, period: { start: Date; end: Date }): Promise<number> {
    // Would query consent tracking system
    return 0;
  }

  private async countGDPRRequests(organizationId: string, period: { start: Date; end: Date }): Promise<number> {
    // Would query GDPR request tracking system
    return 0;
  }

  private async countAuditEvents(organizationId: string, period: { start: Date; end: Date }): Promise<number> {
    return await this.prisma.auditLog.count({
      where: {
        organizationId,
        timestamp: {
          gte: period.start,
          lte: period.end,
        },
      },
    });
  }

  private async countDataBreaches(organizationId: string, period: { start: Date; end: Date }): Promise<number> {
    // Would query security incident tracking system
    return 0;
  }

  private async countEncryptedFields(organizationId: string): Promise<number> {
    // Count encrypted sensitive fields
    return 3; // Simplified
  }

  private async calculateComplianceScore(organizationId: string): Promise<number> {
    // Calculate compliance score based on various factors
    let score = 100;

    const encryptionCheck = await this.validateDataEncryption(organizationId);
    if (!encryptionCheck.compliant) {
      score -= 20;
    }

    // Add more compliance checks

    return Math.max(0, score);
  }

  private async identifyComplianceIssues(organizationId: string): Promise<string[]> {
    const issues: string[] = [];

    const encryptionCheck = await this.validateDataEncryption(organizationId);
    if (!encryptionCheck.compliant) {
      issues.push(...encryptionCheck.issues);
    }

    // Add more compliance checks

    return issues;
  }

  private async generateComplianceRecommendations(organizationId: string): Promise<string[]> {
    const recommendations: string[] = [];

    const encryptionCheck = await this.validateDataEncryption(organizationId);
    if (!encryptionCheck.compliant) {
      recommendations.push('Encrypt all sensitive personal data fields');
    }

    // Add more recommendations based on compliance gaps

    return recommendations;
  }

  private async saveComplianceReport(organizationId: string, report: ComplianceReport): Promise<void> {
    const reportPath = path.join('database/reports', `compliance-${organizationId}-${Date.now()}.json`);

    // Ensure reports directory exists
    const reportsDir = path.dirname(reportPath);
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    this.logger.info(`Compliance report saved: ${reportPath}`);
  }

  private async mapDataRelationships(organizationId: string): Promise<any> {
    // Map how data relates to each other
    return {};
  }

  private async analyzeDataFlow(organizationId: string): Promise<any> {
    // Analyze how data flows through the system
    return {};
  }
}

export default ComplianceManager;