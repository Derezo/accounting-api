import crypto from 'crypto';

import { config } from '../config/config';
import { auditService } from './audit.service';
import { PaymentMethod, PaymentStatus } from '../types/enums';



import { prisma } from '../config/database';
export interface SecurityAlert {
  id: string;
  type: 'FRAUD_DETECTION' | 'POLICY_VIOLATION' | 'SYSTEM_ANOMALY' | 'DATA_BREACH' | 'COMPLIANCE_VIOLATION';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  title: string;
  description: string;
  entityType: string;
  entityId: string;
  riskScore: number;
  autoResolved: boolean;
  resolvedAt?: Date;
  resolvedBy?: string;
  resolution?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
}

export interface ComplianceCheck {
  checkType: 'PCI_DSS' | 'PIPEDA' | 'FINTRAC' | 'CRA_COMPLIANCE' | 'INTERNAL_POLICY';
  status: 'PASS' | 'FAIL' | 'WARNING';
  description: string;
  recommendation?: string;
  criticalFindings: string[];
  warningFindings: string[];
  lastChecked: Date;
}

export interface EncryptionResult {
  encryptedData: string;
  keyId: string;
  algorithm: string;
  iv: string;
  tag?: string;
}

export interface TransactionLimit {
  id: string;
  organizationId: string;
  limitType: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'TRANSACTION';
  paymentMethod?: PaymentMethod;
  maxAmount: number;
  maxCount?: number;
  currency: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApprovalWorkflow {
  id: string;
  organizationId: string;
  triggerConditions: {
    minAmount?: number;
    paymentMethods?: PaymentMethod[];
    customerTypes?: string[];
    riskScoreThreshold?: number;
  };
  approverRoles: string[];
  requiredApprovals: number;
  autoApproveBelow?: number;
  isActive: boolean;
}

export class PaymentSecurityService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly keyDerivationIterations = 100000;

  // ==================== ENCRYPTION & DECRYPTION ====================

  async encryptSensitiveData(
    data: string,
    organizationId: string,
    dataType: 'PAYMENT_DATA' | 'CUSTOMER_DATA' | 'FINANCIAL_DATA' = 'PAYMENT_DATA'
  ): Promise<EncryptionResult> {
    // Get organization's encryption key
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { encryptionKey: true }
    });

    if (!organization) {
      throw new Error('Organization not found');
    }

    // Derive encryption key
    const salt = crypto.randomBytes(32);
    const key = crypto.pbkdf2Sync(organization.encryptionKey, salt, this.keyDerivationIterations, 32, 'sha256');

    // Generate IV
    const iv = crypto.randomBytes(16);

    // Encrypt data
    const cipher = crypto.createCipherGCM(this.algorithm, key, iv);
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const tag = cipher.getAuthTag();

    // Combine all components
    const encryptedData = Buffer.concat([
      salt,
      iv,
      tag,
      Buffer.from(encrypted, 'hex')
    ]).toString('base64');

    const keyId = crypto.createHash('sha256').update(organization.encryptionKey).digest('hex').substring(0, 16);

    // Log encryption activity
    await auditService.logAction({
      action: 'ENCRYPT',
      entityType: dataType,
      entityId: crypto.createHash('sha256').update(data).digest('hex').substring(0, 16),
      changes: {
        dataType,
        keyId,
        algorithm: this.algorithm
      },
      context: {
        organizationId,
        userId: 'system'
      }
    });

    return {
      encryptedData,
      keyId,
      algorithm: this.algorithm,
      iv: iv.toString('hex'),
      tag: tag.toString('hex')
    };
  }

  async decryptSensitiveData(
    encryptedResult: EncryptionResult,
    organizationId: string
  ): Promise<string> {
    // Get organization's encryption key
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { encryptionKey: true }
    });

    if (!organization) {
      throw new Error('Organization not found');
    }

    // Verify key ID
    const expectedKeyId = crypto.createHash('sha256').update(organization.encryptionKey).digest('hex').substring(0, 16);
    if (encryptedResult.keyId !== expectedKeyId) {
      throw new Error('Invalid encryption key');
    }

    // Parse encrypted data
    const combined = Buffer.from(encryptedResult.encryptedData, 'base64');
    const salt = combined.subarray(0, 32);
    const iv = combined.subarray(32, 48);
    const tag = combined.subarray(48, 64);
    const encrypted = combined.subarray(64);

    // Derive decryption key
    const key = crypto.pbkdf2Sync(organization.encryptionKey, salt, this.keyDerivationIterations, 32, 'sha256');

    // Decrypt data
    const decipher = crypto.createDecipherGCM(this.algorithm, key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encrypted, undefined, 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  // ==================== FRAUD DETECTION ====================

  async detectSuspiciousActivity(
    organizationId: string,
    paymentData: any,
    auditContext: { userId?: string; ipAddress?: string; userAgent?: string }
  ): Promise<SecurityAlert[]> {
    const alerts: SecurityAlert[] = [];

    // Check for duplicate transactions
    const duplicateAlert = await this.checkDuplicateTransactions(organizationId, paymentData);
    if (duplicateAlert) alerts.push(duplicateAlert);

    // Check for unusual amounts
    const amountAlert = await this.checkUnusualAmounts(organizationId, paymentData);
    if (amountAlert) alerts.push(amountAlert);

    // Check for velocity violations
    const velocityAlert = await this.checkVelocityLimits(organizationId, paymentData);
    if (velocityAlert) alerts.push(velocityAlert);

    // Check for suspicious patterns
    const patternAlert = await this.checkSuspiciousPatterns(organizationId, paymentData, auditContext);
    if (patternAlert) alerts.push(patternAlert);

    // Check geographic anomalies
    const geoAlert = await this.checkGeographicAnomalies(organizationId, paymentData, auditContext);
    if (geoAlert) alerts.push(geoAlert);

    // Log all alerts
    for (const alert of alerts) {
      await this.createSecurityAlert(organizationId, alert, auditContext);
    }

    return alerts;
  }

  private async checkDuplicateTransactions(organizationId: string, paymentData: any): Promise<SecurityAlert | null> {
    const duplicateWindow = 5 * 60 * 1000; // 5 minutes
    const checkTime = new Date(Date.now() - duplicateWindow);

    const duplicates = await prisma.payment.findMany({
      where: {
        organizationId,
        customerId: paymentData.customerId,
        amount: paymentData.amount,
        paymentMethod: paymentData.paymentMethod,
        paymentDate: { gte: checkTime },
        deletedAt: null
      }
    });

    if (duplicates.length > 0) {
      return {
        id: crypto.randomUUID(),
        type: 'FRAUD_DETECTION',
        severity: 'MEDIUM',
        title: 'Duplicate Transaction Detected',
        description: `Potential duplicate payment of ${paymentData.amount} detected within 5 minutes`,
        entityType: 'Payment',
        entityId: paymentData.id || 'pending',
        riskScore: 60,
        autoResolved: false,
        metadata: {
          duplicateCount: duplicates.length,
          originalPaymentIds: duplicates.map(d => d.id)
        },
        createdAt: new Date()
      };
    }

    return null;
  }

  private async checkUnusualAmounts(organizationId: string, paymentData: any): Promise<SecurityAlert | null> {
    // Get historical payment amounts for the customer
    const historicalPayments = await prisma.payment.findMany({
      where: {
        organizationId,
        customerId: paymentData.customerId,
        status: PaymentStatus.COMPLETED,
        deletedAt: null
      },
      select: { amount: true },
      take: 50,
      orderBy: { paymentDate: 'desc' }
    });

    if (historicalPayments.length < 5) return null; // Need sufficient history

    const amounts = historicalPayments.map(p => p.amount);
    const mean = amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length;
    const variance = amounts.reduce((sum, amount) => sum + Math.pow(amount - mean, 2), 0) / amounts.length;
    const stdDev = Math.sqrt(variance);

    const threshold = mean + (3 * stdDev); // 3 standard deviations

    if (paymentData.amount > threshold) {
      return {
        id: crypto.randomUUID(),
        type: 'FRAUD_DETECTION',
        severity: 'LOW',
        title: 'Unusual Payment Amount',
        description: `Payment amount ${paymentData.amount} is significantly higher than historical average ${mean.toFixed(2)}`,
        entityType: 'Payment',
        entityId: paymentData.id || 'pending',
        riskScore: 30,
        autoResolved: false,
        metadata: {
          amount: paymentData.amount,
          historicalMean: mean,
          standardDeviations: (paymentData.amount - mean) / stdDev
        },
        createdAt: new Date()
      };
    }

    return null;
  }

  private async checkVelocityLimits(organizationId: string, paymentData: any): Promise<SecurityAlert | null> {
    const timeWindow = 24 * 60 * 60 * 1000; // 24 hours
    const checkTime = new Date(Date.now() - timeWindow);

    const recentPayments = await prisma.payment.findMany({
      where: {
        organizationId,
        customerId: paymentData.customerId,
        paymentDate: { gte: checkTime },
        status: { in: [PaymentStatus.COMPLETED, PaymentStatus.PROCESSING] },
        deletedAt: null
      }
    });

    const totalAmount = recentPayments.reduce((sum, p) => sum + p.amount, 0);
    const paymentCount = recentPayments.length;

    // Check against limits (these should be configurable)
    const dailyAmountLimit = 10000; // $10,000 CAD
    const dailyCountLimit = 10;

    if (totalAmount + paymentData.amount > dailyAmountLimit) {
      return {
        id: crypto.randomUUID(),
        type: 'FRAUD_DETECTION',
        severity: 'HIGH',
        title: 'Daily Amount Limit Exceeded',
        description: `Customer would exceed daily payment limit of ${dailyAmountLimit}`,
        entityType: 'Payment',
        entityId: paymentData.id || 'pending',
        riskScore: 80,
        autoResolved: false,
        metadata: {
          currentDailyTotal: totalAmount,
          proposedAmount: paymentData.amount,
          limit: dailyAmountLimit
        },
        createdAt: new Date()
      };
    }

    if (paymentCount >= dailyCountLimit) {
      return {
        id: crypto.randomUUID(),
        type: 'FRAUD_DETECTION',
        severity: 'MEDIUM',
        title: 'Daily Transaction Count Limit Exceeded',
        description: `Customer would exceed daily transaction limit of ${dailyCountLimit}`,
        entityType: 'Payment',
        entityId: paymentData.id || 'pending',
        riskScore: 60,
        autoResolved: false,
        metadata: {
          currentDailyCount: paymentCount,
          limit: dailyCountLimit
        },
        createdAt: new Date()
      };
    }

    return null;
  }

  private async checkSuspiciousPatterns(
    organizationId: string,
    paymentData: any,
    auditContext: { userId?: string; ipAddress?: string; userAgent?: string }
  ): Promise<SecurityAlert | null> {
    // Check for round number amounts (possible testing)
    if (paymentData.amount % 100 === 0 && paymentData.amount >= 1000) {
      return {
        id: crypto.randomUUID(),
        type: 'FRAUD_DETECTION',
        severity: 'LOW',
        title: 'Round Number Payment Pattern',
        description: `Payment of exactly ${paymentData.amount} may indicate testing behavior`,
        entityType: 'Payment',
        entityId: paymentData.id || 'pending',
        riskScore: 20,
        autoResolved: false,
        metadata: {
          amount: paymentData.amount,
          pattern: 'round_number'
        },
        createdAt: new Date()
      };
    }

    return null;
  }

  private async checkGeographicAnomalies(
    organizationId: string,
    paymentData: any,
    auditContext: { userId?: string; ipAddress?: string; userAgent?: string }
  ): Promise<SecurityAlert | null> {
    // This would integrate with IP geolocation services
    // For now, we'll do a simple check for known suspicious IP ranges
    if (auditContext.ipAddress) {
      const suspiciousRanges = [
        '10.0.0.0/8',    // Private ranges shouldn't be making payments
        '172.16.0.0/12',
        '192.168.0.0/16'
      ];

      // Simple check (in production, use proper IP range checking)
      if (auditContext.ipAddress.startsWith('10.') ||
          auditContext.ipAddress.startsWith('172.') ||
          auditContext.ipAddress.startsWith('192.168.')) {
        return {
          id: crypto.randomUUID(),
          type: 'FRAUD_DETECTION',
          severity: 'MEDIUM',
          title: 'Suspicious IP Address',
          description: `Payment initiated from private IP address: ${auditContext.ipAddress}`,
          entityType: 'Payment',
          entityId: paymentData.id || 'pending',
          riskScore: 50,
          autoResolved: false,
          metadata: {
            ipAddress: auditContext.ipAddress,
            reason: 'private_ip_range'
          },
          createdAt: new Date()
        };
      }
    }

    return null;
  }

  private async createSecurityAlert(
    organizationId: string,
    alert: SecurityAlert,
    auditContext: { userId?: string; ipAddress?: string; userAgent?: string }
  ): Promise<void> {
    // In a real implementation, this would store alerts in a dedicated table
    // For now, we'll use the audit log
    await auditService.logAction({
      action: 'CREATE',
      entityType: 'SecurityAlert',
      entityId: alert.id,
      changes: {
        alert: alert
      },
      context: {
        organizationId,
        userId: auditContext.userId || 'system',
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent
      }
    });
  }

  // ==================== COMPLIANCE CHECKS ====================

  async runComplianceChecks(organizationId: string): Promise<ComplianceCheck[]> {
    const checks: ComplianceCheck[] = [];

    // PCI DSS Compliance
    checks.push(await this.checkPCICompliance(organizationId));

    // PIPEDA (Privacy) Compliance
    checks.push(await this.checkPIPEDACompliance(organizationId));

    // FINTRAC (Anti-Money Laundering) Compliance
    checks.push(await this.checkFINTRACCompliance(organizationId));

    // CRA Tax Compliance
    checks.push(await this.checkCRACompliance(organizationId));

    return checks;
  }

  private async checkPCICompliance(organizationId: string): Promise<ComplianceCheck> {
    const criticalFindings: string[] = [];
    const warningFindings: string[] = [];

    // Check for credit card data storage
    const cardPayments = await prisma.payment.findMany({
      where: {
        organizationId,
        paymentMethod: PaymentMethod.STRIPE_CARD,
        deletedAt: null
      },
      take: 100
    });

    // Check if any payment metadata contains sensitive card data
    for (const payment of cardPayments) {
      if (payment.metadata) {
        const metadata = JSON.parse(payment.metadata);
        if (this.containsSensitiveCardData(metadata)) {
          criticalFindings.push(`Payment ${payment.paymentNumber} contains potential card data in metadata`);
        }
      }
    }

    // Check encryption status
    if (!config.ENCRYPTION_KEY || config.ENCRYPTION_KEY.length < 32) {
      criticalFindings.push('Encryption key is not properly configured');
    }

    const status = criticalFindings.length > 0 ? 'FAIL' :
                  warningFindings.length > 0 ? 'WARNING' : 'PASS';

    return {
      checkType: 'PCI_DSS',
      status,
      description: 'Payment Card Industry Data Security Standard compliance check',
      recommendation: criticalFindings.length > 0 ?
        'Remove sensitive card data from storage and ensure proper encryption' : undefined,
      criticalFindings,
      warningFindings,
      lastChecked: new Date()
    };
  }

  private containsSensitiveCardData(metadata: Record<string, unknown>): boolean {
    const cardNumberPattern = /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/;
    const cvvPattern = /\b\d{3,4}\b/;

    const jsonString = JSON.stringify(metadata);
    return cardNumberPattern.test(jsonString) || cvvPattern.test(jsonString);
  }

  private async checkPIPEDACompliance(organizationId: string): Promise<ComplianceCheck> {
    const criticalFindings: string[] = [];
    const warningFindings: string[] = [];

    // Check for retention policies
    const oldPayments = await prisma.payment.findMany({
      where: {
        organizationId,
        paymentDate: {
          lt: new Date(Date.now() - 7 * 365 * 24 * 60 * 60 * 1000) // 7 years
        },
        deletedAt: null
      },
      take: 10
    });

    if (oldPayments.length > 0) {
      warningFindings.push(`${oldPayments.length} payments older than 7 years found - consider archival`);
    }

    const status = criticalFindings.length > 0 ? 'FAIL' :
                  warningFindings.length > 0 ? 'WARNING' : 'PASS';

    return {
      checkType: 'PIPEDA',
      status,
      description: 'Personal Information Protection and Electronic Documents Act compliance check',
      recommendation: warningFindings.length > 0 ?
        'Review data retention policies and implement automated archival' : undefined,
      criticalFindings,
      warningFindings,
      lastChecked: new Date()
    };
  }

  private async checkFINTRACCompliance(organizationId: string): Promise<ComplianceCheck> {
    const criticalFindings: string[] = [];
    const warningFindings: string[] = [];

    // Check for large cash transactions (>$10,000 CAD)
    const largeCashTransactions = await prisma.payment.findMany({
      where: {
        organizationId,
        paymentMethod: PaymentMethod.CASH,
        amount: { gte: 10000 },
        currency: 'CAD',
        paymentDate: {
          gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) // Last year
        },
        deletedAt: null
      }
    });

    if (largeCashTransactions.length > 0) {
      warningFindings.push(`${largeCashTransactions.length} cash transactions over $10,000 CAD require FINTRAC reporting`);
    }

    const status = criticalFindings.length > 0 ? 'FAIL' :
                  warningFindings.length > 0 ? 'WARNING' : 'PASS';

    return {
      checkType: 'FINTRAC',
      status,
      description: 'Financial Transactions and Reports Analysis Centre compliance check',
      recommendation: warningFindings.length > 0 ?
        'Ensure large cash transaction reports are filed with FINTRAC' : undefined,
      criticalFindings,
      warningFindings,
      lastChecked: new Date()
    };
  }

  private async checkCRACompliance(organizationId: string): Promise<ComplianceCheck> {
    const criticalFindings: string[] = [];
    const warningFindings: string[] = [];

    // Check for missing tax information on large payments
    const largePayments = await prisma.payment.findMany({
      where: {
        organizationId,
        amount: { gte: 500 },
        paymentDate: {
          gte: new Date(new Date().getFullYear(), 0, 1) // This year
        },
        deletedAt: null
      },
      include: {
        invoice: true
      }
    });

    let missingTaxInfo = 0;
    for (const payment of largePayments) {
      if (!payment.invoice?.taxAmount || payment.invoice.taxAmount === 0) {
        missingTaxInfo++;
      }
    }

    if (missingTaxInfo > 0) {
      warningFindings.push(`${missingTaxInfo} payments missing tax information`);
    }

    const status = criticalFindings.length > 0 ? 'FAIL' :
                  warningFindings.length > 0 ? 'WARNING' : 'PASS';

    return {
      checkType: 'CRA_COMPLIANCE',
      status,
      description: 'Canada Revenue Agency compliance check',
      recommendation: warningFindings.length > 0 ?
        'Ensure all invoices include proper tax calculations' : undefined,
      criticalFindings,
      warningFindings,
      lastChecked: new Date()
    };
  }

  // ==================== TRANSACTION LIMITS ====================

  async checkTransactionLimits(
    organizationId: string,
    paymentData: any
  ): Promise<{ allowed: boolean; violatedLimits: TransactionLimit[] }> {
    // In a real implementation, these would be stored in a database table
    // For now, we'll use hardcoded limits
    const limits: TransactionLimit[] = [
      {
        id: '1',
        organizationId,
        limitType: 'TRANSACTION',
        maxAmount: 50000,
        currency: 'CAD',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: '2',
        organizationId,
        limitType: 'DAILY',
        paymentMethod: PaymentMethod.CASH,
        maxAmount: 10000,
        maxCount: 5,
        currency: 'CAD',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    const violatedLimits: TransactionLimit[] = [];

    for (const limit of limits) {
      if (!limit.isActive) continue;

      // Check transaction limit
      if (limit.limitType === 'TRANSACTION') {
        if (paymentData.amount > limit.maxAmount) {
          violatedLimits.push(limit);
        }
      }

      // Check daily limits
      if (limit.limitType === 'DAILY') {
        const dayStart = new Date();
        dayStart.setHours(0, 0, 0, 0);

        const dayPayments = await prisma.payment.findMany({
          where: {
            organizationId,
            paymentMethod: limit.paymentMethod,
            paymentDate: { gte: dayStart },
            status: { in: [PaymentStatus.COMPLETED, PaymentStatus.PROCESSING] },
            deletedAt: null
          }
        });

        const dayTotal = dayPayments.reduce((sum, p) => sum + p.amount, 0);

        if (dayTotal + paymentData.amount > limit.maxAmount) {
          violatedLimits.push(limit);
        }

        if (limit.maxCount && dayPayments.length >= limit.maxCount) {
          violatedLimits.push(limit);
        }
      }
    }

    return {
      allowed: violatedLimits.length === 0,
      violatedLimits
    };
  }

  // ==================== DATA MASKING ====================

  maskSensitiveData(data: Record<string, unknown>, fields: string[] = []): unknown {
    const defaultSensitiveFields = [
      'socialInsNumber',
      'taxNumber',
      'bankAccount',
      'routingNumber',
      'cardNumber',
      'cvv',
      'securityAnswer'
    ];

    const fieldsToMask = fields.length > 0 ? fields : defaultSensitiveFields;

    return this.recursiveMask(data, fieldsToMask);
  }

  private recursiveMask(obj: any, fieldsToMask: string[]): unknown {
    if (obj === null || obj === undefined) return obj;

    if (Array.isArray(obj)) {
      return obj.map(item => this.recursiveMask(item, fieldsToMask));
    }

    if (typeof obj === 'object') {
      const masked: unknown = {};
      for (const [key, value] of Object.entries(obj)) {
        if (fieldsToMask.includes(key)) {
          masked[key] = this.maskValue(value);
        } else {
          masked[key] = this.recursiveMask(value, fieldsToMask);
        }
      }
      return masked;
    }

    return obj;
  }

  private maskValue(value: any): string {
    if (typeof value !== 'string') return '***';

    if (value.length <= 4) return '***';

    // Show first and last character for shorter strings
    if (value.length <= 8) {
      return value[0] + '*'.repeat(value.length - 2) + value[value.length - 1];
    }

    // Show first 2 and last 2 characters for longer strings
    return value.substring(0, 2) + '*'.repeat(value.length - 4) + value.substring(value.length - 2);
  }

  // ==================== AUDIT TRAIL INTEGRITY ====================

  async verifyAuditTrailIntegrity(organizationId: string, startDate?: Date, endDate?: Date): Promise<{
    isValid: boolean;
    tamperedRecords: string[];
    missingRecords: string[];
    checksumErrors: string[];
  }> {
    // This would implement cryptographic verification of audit logs
    // For now, we'll do basic consistency checks

    const auditLogs = await prisma.auditLog.findMany({
      where: {
        organizationId,
        ...(startDate && { timestamp: { gte: startDate } }),
        ...(endDate && { timestamp: { lte: endDate } })
      },
      orderBy: { timestamp: 'asc' }
    });

    const tamperedRecords: string[] = [];
    const missingRecords: string[] = [];
    const checksumErrors: string[] = [];

    // Check for gaps in the audit trail
    for (let i = 1; i < auditLogs.length; i++) {
      const current = auditLogs[i];
      const previous = auditLogs[i - 1];

      const timeDiff = current.timestamp.getTime() - previous.timestamp.getTime();

      // Check for suspicious time gaps (more than 1 hour without activity during business hours)
      if (timeDiff > 4 * 60 * 60 * 1000) { // 4 hours
        missingRecords.push(`Suspicious gap between ${previous.id} and ${current.id}`);
      }
    }

    return {
      isValid: tamperedRecords.length === 0 && missingRecords.length === 0 && checksumErrors.length === 0,
      tamperedRecords,
      missingRecords,
      checksumErrors
    };
  }
}

export const paymentSecurityService = new PaymentSecurityService();