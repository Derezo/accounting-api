import { describe, expect, test, beforeEach, afterEach, jest } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import { manualPaymentService } from '../../src/services/manual-payment.service';
import { PaymentMethod, PaymentStatus } from '../../src/types/enums';

// Mock Prisma
jest.mock('@prisma/client');
const mockPrisma = new PrismaClient() as jest.Mocked<PrismaClient>;

// Mock email service
jest.mock('../../src/services/email.service');

// Mock config
jest.mock('../../src/config/config', () => ({
  config: {
    DEFAULT_CURRENCY: 'CAD'
  }
}));

// Mock audit service
jest.mock('../../src/services/audit.service', () => ({
  auditService: {
    logAction: jest.fn()
  }
}));

describe('ManualPaymentService', () => {
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
    invoiceNumber: 'INV-001',
    deletedAt: null
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('createManualPayment', () => {
    const validPaymentData = {
      customerId: mockCustomerId,
      invoiceId: mockInvoiceId,
      amount: 500.00,
      currency: 'CAD',
      paymentMethod: PaymentMethod.CASH,
      paymentDate: new Date(),
      referenceNumber: 'REF-123',
      customerNotes: 'Cash payment for services',
      adminNotes: 'Received at office',
      receiptDocuments: ['https://example.com/receipt.pdf'],
      metadata: { location: 'Main Office' }
    };

    test('should create manual payment successfully', async () => {
      (mockPrisma.customer.findFirst as jest.Mock).mockResolvedValue(mockCustomer);
      (mockPrisma.invoice.findFirst as jest.Mock).mockResolvedValue(mockInvoice);
      (mockPrisma.payment.create as jest.Mock).mockResolvedValue({
        id: 'payment-123',
        paymentNumber: 'CASH-1234567890-ABC',
        ...validPaymentData,
        status: PaymentStatus.COMPLETED,
        organizationId: mockOrganizationId,
        customer: mockCustomer,
        invoice: mockInvoice
      });

      const result = await manualPaymentService.createManualPayment(
        validPaymentData,
        mockOrganizationId,
        mockAuditContext
      );

      expect(result).toBeDefined();
      expect(result.paymentMethod).toBe(PaymentMethod.CASH);
      expect(result.status).toBe(PaymentStatus.COMPLETED);
      expect(mockPrisma.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            paymentMethod: PaymentMethod.CASH,
            amount: 500.00,
            status: PaymentStatus.COMPLETED,
            processorFee: 0,
            netAmount: 500.00
          })
        })
      );
    });

    test('should throw error for cheque payment without cheque number', async () => {
      (mockPrisma.customer.findFirst as jest.Mock).mockResolvedValue(mockCustomer);

      await expect(
        manualPaymentService.createManualPayment(
          { ...validPaymentData, paymentMethod: PaymentMethod.CHEQUE },
          mockOrganizationId,
          mockAuditContext
        )
      ).rejects.toThrow('Cheque number is required for cheque payments');
    });

    test('should throw error for bank transfer without bank reference', async () => {
      (mockPrisma.customer.findFirst as jest.Mock).mockResolvedValue(mockCustomer);

      await expect(
        manualPaymentService.createManualPayment(
          { ...validPaymentData, paymentMethod: PaymentMethod.BANK_TRANSFER },
          mockOrganizationId,
          mockAuditContext
        )
      ).rejects.toThrow('Bank reference is required for bank transfer payments');
    });

    test('should handle multi-currency payments', async () => {
      (mockPrisma.customer.findFirst as jest.Mock).mockResolvedValue(mockCustomer);
      (mockPrisma.invoice.findFirst as jest.Mock).mockResolvedValue(mockInvoice);
      (mockPrisma.payment.create as jest.Mock).mockResolvedValue({
        id: 'payment-123',
        ...validPaymentData
      });

      const multiCurrencyData = {
        ...validPaymentData,
        originalCurrency: 'USD',
        originalAmount: 400.00,
        exchangeRate: 1.25,
        amount: 500.00 // CAD equivalent
      };

      await manualPaymentService.createManualPayment(
        multiCurrencyData,
        mockOrganizationId,
        mockAuditContext
      );

      expect(mockPrisma.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            amount: 500.00,
            metadata: expect.stringContaining('exchangeData')
          })
        })
      );
    });
  });

  describe('processBatchPayments', () => {
    const batchData = {
      payments: [
        {
          customerId: mockCustomerId,
          amount: 100.00,
          paymentMethod: PaymentMethod.CASH
        },
        {
          customerId: mockCustomerId,
          amount: 200.00,
          paymentMethod: PaymentMethod.CASH
        }
      ],
      batchReference: 'BATCH-001',
      batchNotes: 'Daily cash deposits'
    };

    test('should process batch payments successfully', async () => {
      (mockPrisma.customer.findFirst as jest.Mock).mockResolvedValue(mockCustomer);
      (mockPrisma.payment.create as jest.Mock)
        .mockResolvedValueOnce({ id: 'payment-1', amount: 100.00 })
        .mockResolvedValueOnce({ id: 'payment-2', amount: 200.00 });

      const result = await manualPaymentService.processBatchPayments(
        batchData,
        mockOrganizationId,
        mockAuditContext
      );

      expect(result.successful).toHaveLength(2);
      expect(result.failed).toHaveLength(0);
      expect(result.batchId).toBeDefined();
    });

    test('should handle partial batch failures', async () => {
      (mockPrisma.customer.findFirst as jest.Mock)
        .mockResolvedValueOnce(mockCustomer)
        .mockResolvedValueOnce(null); // Second customer not found
      (mockPrisma.payment.create as jest.Mock)
        .mockResolvedValueOnce({ id: 'payment-1', amount: 100.00 });

      const result = await manualPaymentService.processBatchPayments(
        batchData,
        mockOrganizationId,
        mockAuditContext
      );

      expect(result.successful).toHaveLength(1);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].error).toBe('Customer not found');
    });
  });

  describe('reconcilePayments', () => {
    const reconciliationData = {
      bankStatementReference: 'STMT-001',
      bankStatementDate: new Date(),
      bankAmount: 300.00,
      paymentIds: ['payment-1', 'payment-2'],
      reconciliationNotes: 'Bank statement reconciliation'
    };

    test('should reconcile payments successfully', async () => {
      const mockPayments = [
        { id: 'payment-1', amount: 150.00, adminNotes: 'Note 1', metadata: '{}' },
        { id: 'payment-2', amount: 150.00, adminNotes: 'Note 2', metadata: '{}' }
      ];

      (mockPrisma.payment.findMany as jest.Mock).mockResolvedValue(mockPayments);
      (mockPrisma.payment.update as jest.Mock)
        .mockResolvedValueOnce(mockPayments[0])
        .mockResolvedValueOnce(mockPayments[1]);

      const result = await manualPaymentService.reconcilePayments(
        reconciliationData,
        mockOrganizationId,
        mockAuditContext
      );

      expect(result.reconciledPayments).toHaveLength(2);
      expect(result.discrepancies).toHaveLength(0);
      expect(mockPrisma.payment.update).toHaveBeenCalledTimes(2);
    });

    test('should detect amount discrepancies', async () => {
      const mockPayments = [
        { id: 'payment-1', amount: 100.00, adminNotes: 'Note 1', metadata: '{}' },
        { id: 'payment-2', amount: 100.00, adminNotes: 'Note 2', metadata: '{}' }
      ];

      (mockPrisma.payment.findMany as jest.Mock).mockResolvedValue(mockPayments);
      (mockPrisma.payment.update as jest.Mock)
        .mockResolvedValueOnce(mockPayments[0])
        .mockResolvedValueOnce(mockPayments[1]);

      const result = await manualPaymentService.reconcilePayments(
        { ...reconciliationData, bankAmount: 250.00 }, // $50 discrepancy
        mockOrganizationId,
        mockAuditContext
      );

      expect(result.discrepancies).toHaveLength(1);
      expect(result.discrepancies[0].type).toBe('amount_mismatch');
      expect(result.discrepancies[0].difference).toBe(50.00);
    });
  });

  describe('createPaymentPlan', () => {
    const paymentPlanData = {
      customerId: mockCustomerId,
      invoiceId: mockInvoiceId,
      totalAmount: 1000.00,
      currency: 'CAD',
      installments: [
        { amount: 250.00, dueDate: new Date('2024-01-15'), description: 'First installment' },
        { amount: 250.00, dueDate: new Date('2024-02-15'), description: 'Second installment' },
        { amount: 250.00, dueDate: new Date('2024-03-15'), description: 'Third installment' },
        { amount: 250.00, dueDate: new Date('2024-04-15'), description: 'Final installment' }
      ],
      setupFee: 0,
      paymentMethod: PaymentMethod.BANK_TRANSFER
    };

    test('should create payment plan successfully', async () => {
      (mockPrisma.customer.findFirst as jest.Mock).mockResolvedValue(mockCustomer);
      (mockPrisma.invoice.findFirst as jest.Mock).mockResolvedValue(mockInvoice);
      (mockPrisma.payment.create as jest.Mock)
        .mockResolvedValueOnce({ id: 'payment-1' })
        .mockResolvedValueOnce({ id: 'payment-2' })
        .mockResolvedValueOnce({ id: 'payment-3' })
        .mockResolvedValueOnce({ id: 'payment-4' });

      const result = await manualPaymentService.createPaymentPlan(
        paymentPlanData,
        mockOrganizationId,
        mockAuditContext
      );

      expect(result.paymentPlan).toBeDefined();
      expect(result.scheduledPayments).toHaveLength(4);
      expect(result.paymentPlan.installmentCount).toBe(4);
      expect(mockPrisma.payment.create).toHaveBeenCalledTimes(4);
    });

    test('should throw error if installment amounts dont match total', async () => {
      (mockPrisma.customer.findFirst as jest.Mock).mockResolvedValue(mockCustomer);

      const invalidPlanData = {
        ...paymentPlanData,
        installments: [
          { amount: 200.00, dueDate: new Date('2024-01-15') }, // Total only 800, not 1000
          { amount: 200.00, dueDate: new Date('2024-02-15') },
          { amount: 200.00, dueDate: new Date('2024-03-15') },
          { amount: 200.00, dueDate: new Date('2024-04-15') }
        ]
      };

      await expect(
        manualPaymentService.createPaymentPlan(
          invalidPlanData,
          mockOrganizationId,
          mockAuditContext
        )
      ).rejects.toThrow('Sum of installments does not match total amount plus setup fee');
    });
  });

  describe('allocatePartialPayment', () => {
    const allocationData = {
      paymentId: 'payment-123',
      allocations: [
        { invoiceId: 'invoice-1', amount: 300.00, description: 'Partial payment invoice 1' },
        { invoiceId: 'invoice-2', amount: 200.00, description: 'Partial payment invoice 2' }
      ]
    };

    test('should allocate partial payment successfully', async () => {
      const mockPayment = {
        id: 'payment-123',
        amount: 500.00,
        adminNotes: 'Initial note',
        metadata: '{}'
      };

      const mockInvoices = [
        { id: 'invoice-1', organizationId: mockOrganizationId },
        { id: 'invoice-2', organizationId: mockOrganizationId }
      ];

      (mockPrisma.payment.findFirst as jest.Mock).mockResolvedValue(mockPayment);
      (mockPrisma.invoice.findMany as jest.Mock).mockResolvedValue(mockInvoices);
      (mockPrisma.payment.update as jest.Mock).mockResolvedValue({
        ...mockPayment,
        metadata: JSON.stringify({ partialAllocation: allocationData.allocations })
      });

      const result = await manualPaymentService.allocatePartialPayment(
        allocationData,
        mockOrganizationId,
        mockAuditContext
      );

      expect(result).toBeDefined();
      expect(mockPrisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'payment-123' },
          data: expect.objectContaining({
            metadata: expect.stringContaining('partialAllocation')
          })
        })
      );
    });

    test('should throw error if allocation amounts dont match payment amount', async () => {
      const mockPayment = {
        id: 'payment-123',
        amount: 400.00, // Different from allocation total (500)
        adminNotes: 'Initial note',
        metadata: '{}'
      };

      (mockPrisma.payment.findFirst as jest.Mock).mockResolvedValue(mockPayment);

      await expect(
        manualPaymentService.allocatePartialPayment(
          allocationData,
          mockOrganizationId,
          mockAuditContext
        )
      ).rejects.toThrow('Total allocated amount does not match payment amount');
    });
  });

  describe('updateChequeStatus', () => {
    const paymentId = 'payment-123';
    const mockChequePayment = {
      id: paymentId,
      paymentMethod: PaymentMethod.CHEQUE,
      status: PaymentStatus.COMPLETED,
      organizationId: mockOrganizationId,
      invoiceId: mockInvoiceId,
      adminNotes: 'Cheque received',
      metadata: '{}'
    };

    test('should update cheque status to cleared', async () => {
      (mockPrisma.payment.findFirst as jest.Mock).mockResolvedValue(mockChequePayment);
      (mockPrisma.payment.update as jest.Mock).mockResolvedValue({
        ...mockChequePayment,
        processedAt: new Date()
      });

      const result = await manualPaymentService.updateChequeStatus(
        paymentId,
        'CLEARED',
        new Date(),
        'Cheque cleared successfully',
        mockOrganizationId,
        mockAuditContext
      );

      expect(result).toBeDefined();
      expect(mockPrisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: paymentId },
          data: expect.objectContaining({
            status: PaymentStatus.COMPLETED, // Should remain completed for cleared cheques
            processedAt: expect.any(Date)
          })
        })
      );
    });

    test('should update cheque status to bounced', async () => {
      (mockPrisma.payment.findFirst as jest.Mock).mockResolvedValue(mockChequePayment);
      (mockPrisma.payment.update as jest.Mock).mockResolvedValue({
        ...mockChequePayment,
        status: PaymentStatus.FAILED
      });

      const result = await manualPaymentService.updateChequeStatus(
        paymentId,
        'BOUNCED',
        new Date(),
        'Cheque bounced - insufficient funds',
        mockOrganizationId,
        mockAuditContext
      );

      expect(result.status).toBe(PaymentStatus.FAILED);
      expect(mockPrisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: paymentId },
          data: expect.objectContaining({
            status: PaymentStatus.FAILED
          })
        })
      );
    });

    test('should throw error if payment is not a cheque', async () => {
      (mockPrisma.payment.findFirst as jest.Mock).mockResolvedValue({
        ...mockChequePayment,
        paymentMethod: PaymentMethod.CASH
      });

      await expect(
        manualPaymentService.updateChequeStatus(
          paymentId,
          'CLEARED',
          undefined,
          undefined,
          mockOrganizationId,
          mockAuditContext
        )
      ).rejects.toThrow('Cheque payment not found');
    });
  });
});