import { describe, expect, test, beforeEach, afterEach, jest } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import { etransferService } from '../../src/services/etransfer.service';
import { PaymentMethod, PaymentStatus } from '../../src/types/enums';

// Mock Prisma
jest.mock('@prisma/client');
const mockPrisma = new PrismaClient() as jest.Mocked<PrismaClient>;

// Mock email service
jest.mock('../../src/services/email.service');

// Mock config
jest.mock('../../src/config/config', () => ({
  config: {
    ENCRYPTION_KEY: 'test-encryption-key-32-characters-long',
    DEFAULT_CURRENCY: 'CAD'
  }
}));

// Mock audit service
jest.mock('../../src/services/audit.service', () => ({
  auditService: {
    logAction: jest.fn()
  }
}));

describe('ETransferService', () => {
  const mockOrganizationId = 'org-123';
  const mockCustomerId = 'customer-123';
  const mockInvoiceId = 'invoice-123';
  const mockUserId = 'user-123';

  const mockAuditContext = {
    userId: mockUserId,
    ipAddress: '192.168.1.1',
    userAgent: 'Test Agent'
  };

  const mockCustomer = {
    id: mockCustomerId,
    organizationId: mockOrganizationId,
    person: {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@example.com'
    },
    business: null,
    deletedAt: null
  };

  const mockInvoice = {
    id: mockInvoiceId,
    customerId: mockCustomerId,
    organizationId: mockOrganizationId,
    balance: 1000.00,
    deletedAt: null
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('createETransfer', () => {
    const validETransferData = {
      customerId: mockCustomerId,
      invoiceId: mockInvoiceId,
      amount: 500.00,
      currency: 'CAD',
      recipientEmail: 'recipient@example.com',
      recipientName: 'Jane Smith',
      securityQuestion: 'What is your pet\'s name?',
      securityAnswer: 'Fluffy',
      message: 'Payment for services',
      autoDeposit: false,
      expiryHours: 72,
      metadata: { reference: 'test-ref' }
    };

    test('should create e-transfer successfully', async () => {
      // Mock database responses
      (mockPrisma.customer.findFirst as jest.Mock).mockResolvedValue(mockCustomer);
      (mockPrisma.invoice.findFirst as jest.Mock).mockResolvedValue(mockInvoice);
      (mockPrisma.payment.create as jest.Mock).mockResolvedValue({
        id: 'payment-123',
        paymentNumber: 'ET-1234567890-ABCD',
        ...validETransferData,
        status: PaymentStatus.PENDING,
        paymentMethod: PaymentMethod.INTERAC_ETRANSFER,
        organizationId: mockOrganizationId
      });

      const result = await etransferService.createETransfer(
        validETransferData,
        mockOrganizationId,
        mockAuditContext
      );

      expect(result).toBeDefined();
      expect(result.paymentMethod).toBe(PaymentMethod.INTERAC_ETRANSFER);
      expect(result.status).toBe(PaymentStatus.PENDING);
      expect(mockPrisma.customer.findFirst).toHaveBeenCalledWith({
        where: {
          id: mockCustomerId,
          organizationId: mockOrganizationId,
          deletedAt: null
        },
        include: {
          person: true,
          business: true
        }
      });
    });

    test('should throw error if customer not found', async () => {
      (mockPrisma.customer.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        etransferService.createETransfer(
          validETransferData,
          mockOrganizationId,
          mockAuditContext
        )
      ).rejects.toThrow('Customer not found');
    });

    test('should throw error if invoice not found', async () => {
      (mockPrisma.customer.findFirst as jest.Mock).mockResolvedValue(mockCustomer);
      (mockPrisma.invoice.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        etransferService.createETransfer(
          validETransferData,
          mockOrganizationId,
          mockAuditContext
        )
      ).rejects.toThrow('Invoice not found or does not belong to customer');
    });

    test('should throw error if payment amount exceeds invoice balance', async () => {
      (mockPrisma.customer.findFirst as jest.Mock).mockResolvedValue(mockCustomer);
      (mockPrisma.invoice.findFirst as jest.Mock).mockResolvedValue({
        ...mockInvoice,
        balance: 100.00
      });

      await expect(
        etransferService.createETransfer(
          { ...validETransferData, amount: 200.00 },
          mockOrganizationId,
          mockAuditContext
        )
      ).rejects.toThrow('Payment amount (200) exceeds remaining balance (100)');
    });

    test('should calculate correct fees for different amounts', async () => {
      (mockPrisma.customer.findFirst as jest.Mock).mockResolvedValue(mockCustomer);
      (mockPrisma.invoice.findFirst as jest.Mock).mockResolvedValue(mockInvoice);
      (mockPrisma.payment.create as jest.Mock).mockImplementation((args) => ({
        id: 'payment-123',
        ...args.data
      }));

      // Test small amount (< $100)
      await etransferService.createETransfer(
        { ...validETransferData, amount: 50.00 },
        mockOrganizationId,
        mockAuditContext
      );

      expect(mockPrisma.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            processorFee: 1.00,
            netAmount: 49.00
          })
        })
      );

      // Test medium amount ($100 - $1000)
      await etransferService.createETransfer(
        { ...validETransferData, amount: 500.00 },
        mockOrganizationId,
        mockAuditContext
      );

      expect(mockPrisma.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            processorFee: 1.50,
            netAmount: 498.50
          })
        })
      );
    });
  });

  describe('confirmETransferDeposit', () => {
    const etransferNumber = 'ET-1234567890-ABCD';
    const mockPayment = {
      id: 'payment-123',
      paymentNumber: etransferNumber,
      organizationId: mockOrganizationId,
      paymentMethod: PaymentMethod.INTERAC_ETRANSFER,
      status: PaymentStatus.PROCESSING,
      amount: 500.00,
      invoiceId: mockInvoiceId,
      metadata: JSON.stringify({
        etransfer: {
          expiryDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        }
      }),
      customer: mockCustomer,
      invoice: mockInvoice
    };

    test('should confirm e-transfer deposit successfully', async () => {
      (mockPrisma.payment.findFirst as jest.Mock).mockResolvedValue(mockPayment);
      (mockPrisma.payment.update as jest.Mock).mockResolvedValue({
        ...mockPayment,
        status: PaymentStatus.COMPLETED
      });

      const confirmationData = {
        etransferNumber,
        confirmationCode: 'CONF123',
        depositedAt: new Date(),
        actualAmount: 500.00,
        fees: 1.50
      };

      const result = await etransferService.confirmETransferDeposit(
        confirmationData,
        mockOrganizationId,
        mockAuditContext
      );

      expect(result.status).toBe(PaymentStatus.COMPLETED);
      expect(mockPrisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockPayment.id },
          data: expect.objectContaining({
            status: PaymentStatus.COMPLETED,
            processedAt: confirmationData.depositedAt,
            netAmount: 498.50
          })
        })
      );
    });

    test('should throw error if e-transfer not found', async () => {
      (mockPrisma.payment.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        etransferService.confirmETransferDeposit(
          { etransferNumber },
          mockOrganizationId,
          mockAuditContext
        )
      ).rejects.toThrow('E-Transfer not found');
    });

    test('should throw error if e-transfer already completed', async () => {
      (mockPrisma.payment.findFirst as jest.Mock).mockResolvedValue({
        ...mockPayment,
        status: PaymentStatus.COMPLETED
      });

      await expect(
        etransferService.confirmETransferDeposit(
          { etransferNumber },
          mockOrganizationId,
          mockAuditContext
        )
      ).rejects.toThrow('E-Transfer has already been deposited');
    });

    test('should throw error if e-transfer expired', async () => {
      (mockPrisma.payment.findFirst as jest.Mock).mockResolvedValue({
        ...mockPayment,
        metadata: JSON.stringify({
          etransfer: {
            expiryDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
          }
        })
      });

      // Mock the cancelETransfer method
      const cancelSpy = jest.spyOn(etransferService, 'cancelETransfer').mockResolvedValue({} as any);

      await expect(
        etransferService.confirmETransferDeposit(
          { etransferNumber },
          mockOrganizationId,
          mockAuditContext
        )
      ).rejects.toThrow('E-Transfer has expired');

      expect(cancelSpy).toHaveBeenCalledWith(
        etransferNumber,
        'Expired',
        mockOrganizationId,
        mockAuditContext
      );

      cancelSpy.mockRestore();
    });
  });

  describe('cancelETransfer', () => {
    const etransferNumber = 'ET-1234567890-ABCD';
    const reason = 'Customer request';

    test('should cancel e-transfer successfully', async () => {
      const mockPayment = {
        id: 'payment-123',
        paymentNumber: etransferNumber,
        organizationId: mockOrganizationId,
        paymentMethod: PaymentMethod.INTERAC_ETRANSFER,
        status: PaymentStatus.PENDING,
        adminNotes: 'Initial note'
      };

      (mockPrisma.payment.findFirst as jest.Mock).mockResolvedValue(mockPayment);
      (mockPrisma.payment.update as jest.Mock).mockResolvedValue({
        ...mockPayment,
        status: PaymentStatus.CANCELLED,
        failureReason: reason
      });

      const result = await etransferService.cancelETransfer(
        etransferNumber,
        reason,
        mockOrganizationId,
        mockAuditContext
      );

      expect(result.status).toBe(PaymentStatus.CANCELLED);
      expect(result.failureReason).toBe(reason);
      expect(mockPrisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockPayment.id },
          data: expect.objectContaining({
            status: PaymentStatus.CANCELLED,
            failureReason: reason
          })
        })
      );
    });

    test('should throw error if trying to cancel completed e-transfer', async () => {
      (mockPrisma.payment.findFirst as jest.Mock).mockResolvedValue({
        id: 'payment-123',
        status: PaymentStatus.COMPLETED
      });

      await expect(
        etransferService.cancelETransfer(
          etransferNumber,
          reason,
          mockOrganizationId,
          mockAuditContext
        )
      ).rejects.toThrow('Cannot cancel a completed e-transfer');
    });
  });

  describe('getETransferStats', () => {
    test('should calculate e-transfer statistics correctly', async () => {
      const mockPayments = [
        {
          status: PaymentStatus.COMPLETED,
          amount: 100,
          processorFee: 1.00,
          paymentDate: new Date(),
          processedAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour later
          metadata: '{}'
        },
        {
          status: PaymentStatus.PENDING,
          amount: 200,
          processorFee: 1.50,
          paymentDate: new Date(),
          processedAt: null,
          metadata: '{}'
        },
        {
          status: PaymentStatus.CANCELLED,
          amount: 150,
          processorFee: 1.50,
          paymentDate: new Date(),
          processedAt: null,
          metadata: JSON.stringify({
            etransfer: {
              expiryDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
            }
          })
        }
      ];

      (mockPrisma.payment.findMany as jest.Mock).mockResolvedValue(mockPayments);

      const stats = await etransferService.getETransferStats(mockOrganizationId);

      expect(stats.totalSent).toBe(3);
      expect(stats.totalPending).toBe(1);
      expect(stats.totalDeposited).toBe(1);
      expect(stats.totalExpired).toBe(1);
      expect(stats.totalCancelled).toBe(0);
      expect(stats.totalFees).toBe(4.00);
      expect(stats.averageDepositTime).toBe(1); // 1 hour
    });
  });

  describe('checkExpiredETransfers', () => {
    test('should cancel expired e-transfers', async () => {
      const expiredPayment = {
        id: 'payment-123',
        paymentNumber: 'ET-1234567890-ABCD',
        organizationId: mockOrganizationId,
        metadata: JSON.stringify({
          etransfer: {
            expiryDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
          }
        })
      };

      (mockPrisma.payment.findMany as jest.Mock).mockResolvedValue([expiredPayment]);

      // Mock the cancelETransfer method
      const cancelSpy = jest.spyOn(etransferService, 'cancelETransfer').mockResolvedValue({} as any);

      const result = await etransferService.checkExpiredETransfers(mockOrganizationId);

      expect(result).toBe(1);
      expect(cancelSpy).toHaveBeenCalledWith(
        expiredPayment.paymentNumber,
        'Automatically expired',
        mockOrganizationId,
        { userId: 'system' }
      );

      cancelSpy.mockRestore();
    });
  });
});