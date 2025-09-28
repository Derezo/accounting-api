import { describe, expect, test, beforeEach, afterEach, jest } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import { paymentSecurityService } from '../../src/services/payment-security.service';
import { PaymentMethod, PaymentStatus } from '../../src/types/enums';

// Mock Prisma
jest.mock('@prisma/client');
const mockPrisma = new PrismaClient() as jest.Mocked<PrismaClient>;

// Mock config
jest.mock('../../src/config/config', () => ({
  config: {
    ENCRYPTION_KEY: 'test-encryption-key-32-characters-long'
  }
}));

// Mock audit service
jest.mock('../../src/services/audit.service', () => ({
  auditService: {
    logAction: jest.fn()
  }
}));

describe('PaymentSecurityService', () => {
  const mockOrganizationId = 'org-123';
  const mockUserId = 'user-123';

  const mockAuditContext = {
    userId: mockUserId,
    ipAddress: '192.168.1.1',
    userAgent: 'Test Agent'
  };

  const mockOrganization = {
    id: mockOrganizationId,
    encryptionKey: 'organization-specific-encryption-key-32-chars'
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('encryptSensitiveData', () => {
    test('should encrypt sensitive data successfully', async () => {
      const sensitiveData = 'Credit Card: 4111-1111-1111-1111';

      (mockPrisma.organization.findUnique as jest.Mock).mockResolvedValue(mockOrganization);

      const result = await paymentSecurityService.encryptSensitiveData(
        sensitiveData,
        mockOrganizationId,
        'PAYMENT_DATA'
      );

      expect(result).toBeDefined();
      expect(result.encryptedData).toBeDefined();
      expect(result.keyId).toBeDefined();
      expect(result.algorithm).toBe('aes-256-gcm');
      expect(result.iv).toBeDefined();
      expect(result.tag).toBeDefined();
      expect(result.encryptedData).not.toContain(sensitiveData);
    });

    test('should throw error if organization not found', async () => {
      (mockPrisma.organization.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        paymentSecurityService.encryptSensitiveData(
          'sensitive data',
          'invalid-org',
          'PAYMENT_DATA'
        )
      ).rejects.toThrow('Organization not found');
    });
  });

  describe('decryptSensitiveData', () => {
    test('should decrypt data successfully', async () => {
      const originalData = 'Sensitive payment information';

      (mockPrisma.organization.findUnique as jest.Mock).mockResolvedValue(mockOrganization);

      // First encrypt the data
      const encrypted = await paymentSecurityService.encryptSensitiveData(
        originalData,
        mockOrganizationId,
        'PAYMENT_DATA'
      );

      // Then decrypt it
      const decrypted = await paymentSecurityService.decryptSensitiveData(
        encrypted,
        mockOrganizationId
      );

      expect(decrypted).toBe(originalData);
    });

    test('should throw error for invalid key ID', async () => {
      (mockPrisma.organization.findUnique as jest.Mock).mockResolvedValue(mockOrganization);

      const invalidEncryptedData = {
        encryptedData: 'encrypted-data',
        keyId: 'invalid-key-id',
        algorithm: 'aes-256-gcm',
        iv: 'iv',
        tag: 'tag'
      };

      await expect(
        paymentSecurityService.decryptSensitiveData(
          invalidEncryptedData,
          mockOrganizationId
        )
      ).rejects.toThrow('Invalid encryption key');
    });
  });

  describe('detectSuspiciousActivity', () => {
    const paymentData = {
      id: 'payment-123',
      customerId: 'customer-123',
      amount: 1000.00,
      paymentMethod: PaymentMethod.CASH
    };

    test('should detect duplicate transactions', async () => {
      const duplicatePayment = {
        id: 'existing-payment',
        customerId: paymentData.customerId,
        amount: paymentData.amount,
        paymentMethod: paymentData.paymentMethod,
        paymentDate: new Date()
      };

      (mockPrisma.payment.findMany as jest.Mock).mockResolvedValueOnce([duplicatePayment]); // For duplicate check
      (mockPrisma.payment.findMany as jest.Mock).mockResolvedValueOnce([]); // For historical amounts
      (mockPrisma.payment.findMany as jest.Mock).mockResolvedValueOnce([]); // For velocity check

      const alerts = await paymentSecurityService.detectSuspiciousActivity(
        mockOrganizationId,
        paymentData,
        mockAuditContext
      );

      expect(alerts).toHaveLength(1);
      expect(alerts[0].type).toBe('FRAUD_DETECTION');
      expect(alerts[0].title).toBe('Duplicate Transaction Detected');
      expect(alerts[0].severity).toBe('MEDIUM');
    });

    test('should detect unusual amounts', async () => {
      const historicalPayments = Array.from({ length: 10 }, (_, i) => ({
        amount: 100 + i * 10 // Amounts from 100 to 190
      }));

      (mockPrisma.payment.findMany as jest.Mock)
        .mockResolvedValueOnce([]) // No duplicates
        .mockResolvedValueOnce(historicalPayments) // Historical data
        .mockResolvedValueOnce([]); // No recent payments for velocity

      const alerts = await paymentSecurityService.detectSuspiciousActivity(
        mockOrganizationId,
        { ...paymentData, amount: 5000.00 }, // Much higher than historical average
        mockAuditContext
      );

      expect(alerts.some(alert => alert.title === 'Unusual Payment Amount')).toBe(true);
    });

    test('should detect velocity limit violations', async () => {
      const recentPayments = Array.from({ length: 8 }, (_, i) => ({
        id: `payment-${i}`,
        customerId: paymentData.customerId,
        amount: 1500.00,
        paymentDate: new Date()
      }));

      (mockPrisma.payment.findMany as jest.Mock)
        .mockResolvedValueOnce([]) // No duplicates
        .mockResolvedValueOnce([]) // No historical data
        .mockResolvedValueOnce(recentPayments); // Many recent payments

      const alerts = await paymentSecurityService.detectSuspiciousActivity(
        mockOrganizationId,
        { ...paymentData, amount: 5000.00 }, // Would exceed daily limit
        mockAuditContext
      );

      expect(alerts.some(alert => alert.title === 'Daily Amount Limit Exceeded')).toBe(true);
    });

    test('should detect suspicious IP addresses', async () => {
      (mockPrisma.payment.findMany as jest.Mock)
        .mockResolvedValue([]); // No issues with other checks

      const alerts = await paymentSecurityService.detectSuspiciousActivity(
        mockOrganizationId,
        paymentData,
        { ...mockAuditContext, ipAddress: '192.168.1.1' } // Private IP
      );

      expect(alerts.some(alert => alert.title === 'Suspicious IP Address')).toBe(true);
    });

    test('should detect round number patterns', async () => {
      (mockPrisma.payment.findMany as jest.Mock)
        .mockResolvedValue([]); // No issues with other checks

      const alerts = await paymentSecurityService.detectSuspiciousActivity(
        mockOrganizationId,
        { ...paymentData, amount: 1000.00 }, // Round number
        mockAuditContext
      );

      expect(alerts.some(alert => alert.title === 'Round Number Payment Pattern')).toBe(true);
    });
  });

  describe('runComplianceChecks', () => {
    test('should run all compliance checks', async () => {
      // Mock data for various compliance checks
      (mockPrisma.payment.findMany as jest.Mock)
        .mockResolvedValueOnce([]) // PCI check - no card payments
        .mockResolvedValueOnce([]) // PIPEDA check - no old payments
        .mockResolvedValueOnce([]) // FINTRAC check - no large cash transactions
        .mockResolvedValueOnce([]); // CRA check - no large payments

      const checks = await paymentSecurityService.runComplianceChecks(mockOrganizationId);

      expect(checks).toHaveLength(4);
      expect(checks.map(c => c.checkType)).toEqual([
        'PCI_DSS',
        'PIPEDA',
        'FINTRAC',
        'CRA_COMPLIANCE'
      ]);
      expect(checks.every(c => c.status === 'PASS')).toBe(true);
    });

    test('should detect PCI compliance violations', async () => {
      const cardPaymentWithSensitiveData = {
        paymentNumber: 'CARD-123',
        metadata: JSON.stringify({
          cardNumber: '4111-1111-1111-1111',
          cvv: '123'
        })
      };

      (mockPrisma.payment.findMany as jest.Mock)
        .mockResolvedValueOnce([cardPaymentWithSensitiveData]) // PCI violation
        .mockResolvedValueOnce([]) // PIPEDA check
        .mockResolvedValueOnce([]) // FINTRAC check
        .mockResolvedValueOnce([]); // CRA check

      const checks = await paymentSecurityService.runComplianceChecks(mockOrganizationId);

      const pciCheck = checks.find(c => c.checkType === 'PCI_DSS');
      expect(pciCheck?.status).toBe('FAIL');
      expect(pciCheck?.criticalFindings).toHaveLength(1);
    });

    test('should detect FINTRAC reporting requirements', async () => {
      const largeCashTransaction = {
        paymentMethod: PaymentMethod.CASH,
        amount: 15000.00,
        currency: 'CAD',
        paymentDate: new Date()
      };

      (mockPrisma.payment.findMany as jest.Mock)
        .mockResolvedValueOnce([]) // PCI check
        .mockResolvedValueOnce([]) // PIPEDA check
        .mockResolvedValueOnce([largeCashTransaction]) // FINTRAC violation
        .mockResolvedValueOnce([]); // CRA check

      const checks = await paymentSecurityService.runComplianceChecks(mockOrganizationId);

      const fintracCheck = checks.find(c => c.checkType === 'FINTRAC');
      expect(fintracCheck?.status).toBe('WARNING');
      expect(fintracCheck?.warningFindings).toHaveLength(1);
    });
  });

  describe('checkTransactionLimits', () => {
    test('should allow payment within limits', async () => {
      const paymentData = {
        amount: 1000.00,
        paymentMethod: PaymentMethod.CASH
      };

      // Mock no existing payments for daily limit check
      (mockPrisma.payment.findMany as jest.Mock).mockResolvedValue([]);

      const result = await paymentSecurityService.checkTransactionLimits(
        mockOrganizationId,
        paymentData
      );

      expect(result.allowed).toBe(true);
      expect(result.violatedLimits).toHaveLength(0);
    });

    test('should detect transaction limit violation', async () => {
      const paymentData = {
        amount: 60000.00, // Exceeds 50,000 limit
        paymentMethod: PaymentMethod.CASH
      };

      const result = await paymentSecurityService.checkTransactionLimits(
        mockOrganizationId,
        paymentData
      );

      expect(result.allowed).toBe(false);
      expect(result.violatedLimits).toHaveLength(1);
      expect(result.violatedLimits[0].limitType).toBe('TRANSACTION');
    });

    test('should detect daily limit violation', async () => {
      const paymentData = {
        amount: 5000.00,
        paymentMethod: PaymentMethod.CASH
      };

      // Mock existing payments that would cause daily limit violation
      const existingPayments = [
        { amount: 3000.00 },
        { amount: 3000.00 } // Total 6000 + 5000 = 11000 > 10000 limit
      ];

      (mockPrisma.payment.findMany as jest.Mock).mockResolvedValue(existingPayments);

      const result = await paymentSecurityService.checkTransactionLimits(
        mockOrganizationId,
        paymentData
      );

      expect(result.allowed).toBe(false);
      expect(result.violatedLimits).toHaveLength(1);
      expect(result.violatedLimits[0].limitType).toBe('DAILY');
    });
  });

  describe('maskSensitiveData', () => {
    test('should mask default sensitive fields', async () => {
      const sensitiveData = {
        customerName: 'John Doe',
        socialInsNumber: '123-456-789',
        cardNumber: '4111-1111-1111-1111',
        amount: 1000.00,
        nested: {
          cvv: '123',
          bankAccount: '1234567890'
        }
      };

      const masked = paymentSecurityService.maskSensitiveData(sensitiveData);

      expect(masked.customerName).toBe('John Doe'); // Not sensitive
      expect(masked.amount).toBe(1000.00); // Not sensitive
      expect(masked.socialInsNumber).toBe('1*******9'); // Masked
      expect(masked.cardNumber).toBe('41**********1111'); // Masked
      expect(masked.nested.cvv).toBe('***'); // Masked
      expect(masked.nested.bankAccount).toBe('12******90'); // Masked
    });

    test('should mask custom fields', async () => {
      const data = {
        name: 'John Doe',
        customField: 'sensitive-data'
      };

      const masked = paymentSecurityService.maskSensitiveData(data, ['customField']);

      expect(masked.name).toBe('John Doe'); // Not in custom fields
      expect(masked.customField).toBe('se*********ta'); // Masked
    });

    test('should handle arrays and nested objects', async () => {
      const data = {
        users: [
          { name: 'John', socialInsNumber: '123456789' },
          { name: 'Jane', socialInsNumber: '987654321' }
        ],
        metadata: {
          cardNumber: '4111111111111111'
        }
      };

      const masked = paymentSecurityService.maskSensitiveData(data);

      expect(masked.users[0].name).toBe('John');
      expect(masked.users[0].socialInsNumber).toBe('1*******9');
      expect(masked.users[1].socialInsNumber).toBe('9*******1');
      expect(masked.metadata.cardNumber).toBe('41************11');
    });
  });

  describe('verifyAuditTrailIntegrity', () => {
    test('should verify clean audit trail', async () => {
      const mockAuditLogs = [
        {
          id: 'audit-1',
          timestamp: new Date('2024-01-01T09:00:00Z')
        },
        {
          id: 'audit-2',
          timestamp: new Date('2024-01-01T10:00:00Z')
        },
        {
          id: 'audit-3',
          timestamp: new Date('2024-01-01T11:00:00Z')
        }
      ];

      (mockPrisma.auditLog.findMany as jest.Mock).mockResolvedValue(mockAuditLogs);

      const result = await paymentSecurityService.verifyAuditTrailIntegrity(mockOrganizationId);

      expect(result.isValid).toBe(true);
      expect(result.tamperedRecords).toHaveLength(0);
      expect(result.missingRecords).toHaveLength(0);
      expect(result.checksumErrors).toHaveLength(0);
    });

    test('should detect suspicious gaps in audit trail', async () => {
      const mockAuditLogs = [
        {
          id: 'audit-1',
          timestamp: new Date('2024-01-01T09:00:00Z')
        },
        {
          id: 'audit-2',
          timestamp: new Date('2024-01-01T15:00:00Z') // 6 hour gap > 4 hour threshold
        }
      ];

      (mockPrisma.auditLog.findMany as jest.Mock).mockResolvedValue(mockAuditLogs);

      const result = await paymentSecurityService.verifyAuditTrailIntegrity(mockOrganizationId);

      expect(result.isValid).toBe(false);
      expect(result.missingRecords).toHaveLength(1);
      expect(result.missingRecords[0]).toContain('Suspicious gap');
    });
  });
});