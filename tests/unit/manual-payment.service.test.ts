// Mock Prisma with a shared instance
const mockPrismaInstance = {
  customer: {
    findFirst: jest.fn()
  },
  invoice: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn()
  },
  payment: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn()
  }
};

// Mock the database config module which exports the prisma instance
jest.mock('../../src/config/database', () => ({
  prisma: mockPrismaInstance
}));

// Mock config
jest.mock('../../src/config/config', () => ({
  config: {
    DEFAULT_CURRENCY: 'CAD'
  }
}));

// Mock services
jest.mock('../../src/services/audit.service', () => ({
  auditService: {
    logAction: jest.fn().mockResolvedValue(undefined)
  }
}));

jest.mock('../../src/services/email.service', () => ({
  emailService: {
    sendPaymentReceipt: jest.fn().mockResolvedValue(undefined)
  }
}));

// Mock crypto
jest.mock('crypto', () => ({
  randomBytes: jest.fn(() => Buffer.from('abcd1234', 'hex')),
  randomUUID: jest.fn(() => 'mock-uuid-12345')
}));

// Mock dynamic import for invoice service
const mockInvoiceService = {
  recordPayment: jest.fn().mockResolvedValue(undefined)
};

jest.mock('../../src/services/invoice.service', () => ({
  invoiceService: mockInvoiceService
}));

import {
  ManualPaymentService,
  CreateManualPaymentData,
  BatchPaymentData,
  ReconciliationData,
  PaymentPlanData,
  PartialPaymentAllocation
} from '../../src/services/manual-payment.service';
import { PaymentMethod, PaymentStatus } from '../../src/types/enums';
import { PrismaClient } from '@prisma/client';
import { auditService } from '../../src/services/audit.service';
import { emailService } from '../../src/services/email.service';
import crypto from 'crypto';
import Decimal from 'decimal.js';

// Get mock instances
const mockPrisma = mockPrismaInstance;
const mockAuditService = auditService as jest.Mocked<typeof auditService>;
const mockEmailService = emailService as jest.Mocked<typeof emailService>;
const mockCrypto = crypto as jest.Mocked<typeof crypto>;

describe('ManualPaymentService', () => {
  let manualPaymentService: ManualPaymentService;

  const organizationId = 'org-123';
  const auditContext = {
    userId: 'user-123',
    ipAddress: '127.0.0.1',
    userAgent: 'test-agent'
  };

  const mockCustomer = {
    id: 'customer-123',
    organizationId,
    person: {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@example.com'
    },
    business: null
  };

  const mockInvoice = {
    id: 'invoice-123',
    customerId: 'customer-123',
    organizationId,
    balance: 500.00,
    invoiceNumber: 'INV-001'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    manualPaymentService = new ManualPaymentService();

    // Set up default mocks
    mockPrisma.customer.findFirst.mockResolvedValue(mockCustomer);
    mockPrisma.invoice.findFirst.mockResolvedValue(mockInvoice);

    // Mock Date.now for consistent timestamps
    jest.spyOn(Date, 'now').mockReturnValue(1640995200000);
  });

  describe('createManualPayment', () => {
    const basePaymentData: CreateManualPaymentData = {
      customerId: 'customer-123',
      amount: 100.00,
      paymentMethod: PaymentMethod.CASH,
      customerNotes: 'Cash payment for services'
    };

    beforeEach(() => {
      mockPrisma.payment.create.mockResolvedValue({
        id: 'payment-123',
        organizationId,
        paymentNumber: 'CASH-1640995200000-ABCD1234',
        customerId: 'customer-123',
        amount: 100.00,
        currency: 'CAD',
        paymentMethod: PaymentMethod.CASH,
        status: PaymentStatus.COMPLETED,
        customer: mockCustomer,
        invoice: null,
        paymentDate: new Date('2022-01-01T00:00:00.000Z'),
        referenceNumber: 'CASH12345678AB',
        customerNotes: 'Cash payment for services',
        adminNotes: null,
        processorFee: 0,
        netAmount: 100.00,
        processedAt: new Date('2022-01-01T00:00:00.000Z'),
        metadata: JSON.stringify({
          manualPayment: true,
          receiptDocuments: []
        })
      });
    });

    it('should create cash payment successfully', async () => {
      const result = await manualPaymentService.createManualPayment(
        basePaymentData,
        organizationId,
        auditContext
      );

      expect(mockPrisma.customer.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'customer-123',
          organizationId,
          deletedAt: null
        },
        include: {
          person: true,
          business: true
        }
      });

      expect(mockPrisma.payment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId,
          customerId: 'customer-123',
          amount: 100.00,
          currency: 'CAD',
          paymentMethod: PaymentMethod.CASH,
          status: PaymentStatus.COMPLETED,
          customerNotes: 'Cash payment for services',
          processorFee: 0,
          netAmount: 100.00,
          paymentNumber: expect.stringMatching(/^CASH-\d+-[A-Z0-9]+$/),
          referenceNumber: expect.stringMatching(/^CASH\d+[A-Z0-9]+$/),
          processedAt: expect.any(Date)
        }),
        include: expect.any(Object)
      });

      expect(result.id).toBe('payment-123');
      expect(result.status).toBe(PaymentStatus.COMPLETED);
    });

    it('should create cheque payment with cheque number', async () => {
      const chequeData = {
        ...basePaymentData,
        paymentMethod: PaymentMethod.CHEQUE,
        chequeNumber: 'CHQ-001'
      };

      await manualPaymentService.createManualPayment(chequeData, organizationId, auditContext);

      expect(mockPrisma.payment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          paymentMethod: PaymentMethod.CHEQUE,
          metadata: expect.stringContaining('CHQ-001')
        }),
        include: expect.any(Object)
      });
    });

    it('should create bank transfer payment with bank reference', async () => {
      const bankTransferData = {
        ...basePaymentData,
        paymentMethod: PaymentMethod.BANK_TRANSFER,
        bankReference: 'WIRE-123456'
      };

      await manualPaymentService.createManualPayment(bankTransferData, organizationId, auditContext);

      expect(mockPrisma.payment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          paymentMethod: PaymentMethod.BANK_TRANSFER,
          bankReference: 'WIRE-123456'
        }),
        include: expect.any(Object)
      });
    });

    it('should handle multi-currency payments', async () => {
      const multiCurrencyData = {
        ...basePaymentData,
        amount: 100.00,
        currency: 'CAD',
        originalAmount: 75.00,
        originalCurrency: 'USD',
        exchangeRate: 1.33
      };

      await manualPaymentService.createManualPayment(multiCurrencyData, organizationId, auditContext);

      expect(mockPrisma.payment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          amount: 100.00,
          currency: 'CAD',
          metadata: expect.stringContaining('exchangeData')
        }),
        include: expect.any(Object)
      });
    });

    it('should link payment to invoice and update invoice balance', async () => {
      const paymentWithInvoice = {
        ...basePaymentData,
        invoiceId: 'invoice-123'
      };

      const paymentResult = {
        id: 'payment-123',
        organizationId,
        paymentNumber: 'CASH-1640995200000-ABCD1234',
        customerId: 'customer-123',
        amount: 100.00,
        currency: 'CAD',
        paymentMethod: PaymentMethod.CASH,
        status: PaymentStatus.COMPLETED,
        customer: mockCustomer,
        invoice: mockInvoice,
        invoiceId: 'invoice-123',
        paymentDate: new Date('2022-01-01T00:00:00.000Z'),
        referenceNumber: 'CASH12345678AB',
        customerNotes: 'Cash payment for services',
        adminNotes: null,
        processorFee: 0,
        netAmount: 100.00,
        processedAt: new Date('2022-01-01T00:00:00.000Z'),
        metadata: JSON.stringify({
          manualPayment: true,
          receiptDocuments: []
        })
      };
      mockPrisma.payment.create.mockResolvedValue(paymentResult);

      await manualPaymentService.createManualPayment(paymentWithInvoice, organizationId, auditContext);

      expect(mockInvoiceService.recordPayment).toHaveBeenCalledWith(
        'invoice-123',
        100.00,
        organizationId,
        { userId: 'user-123', ipAddress: '127.0.0.1', userAgent: 'test-agent' }
      );
    });

    it('should send payment receipt email to customer', async () => {
      await manualPaymentService.createManualPayment(basePaymentData, organizationId, auditContext);

      expect(mockEmailService.sendPaymentReceipt).toHaveBeenCalledWith(
        'john.doe@example.com',
        expect.objectContaining({
          paymentNumber: expect.stringMatching(/^CASH-\d+-[A-Z0-9]+$/),
          amount: 100.00,
          currency: 'CAD',
          paymentMethod: 'Cash',
          customerName: 'John Doe'
        })
      );
    });

    it('should log audit action for payment creation', async () => {
      await manualPaymentService.createManualPayment(basePaymentData, organizationId, auditContext);

      expect(mockAuditService.logAction).toHaveBeenCalledWith({
        action: 'CREATE',
        entityType: 'ManualPayment',
        entityId: 'payment-123',
        changes: expect.objectContaining({
          payment: expect.any(Object),
          paymentMethod: PaymentMethod.CASH,
          amount: 100.00
        }),
        context: {
          organizationId,
          userId: 'user-123',
          ipAddress: '127.0.0.1',
          userAgent: 'test-agent'
        }
      });
    });

    it('should throw error if customer not found', async () => {
      mockPrisma.customer.findFirst.mockResolvedValue(null);

      await expect(
        manualPaymentService.createManualPayment(basePaymentData, organizationId, auditContext)
      ).rejects.toThrow('Customer not found');
    });

    it('should throw error if invoice not found', async () => {
      const paymentWithInvalidInvoice = {
        ...basePaymentData,
        invoiceId: 'invalid-invoice'
      };
      mockPrisma.invoice.findFirst.mockResolvedValue(null);

      await expect(
        manualPaymentService.createManualPayment(paymentWithInvalidInvoice, organizationId, auditContext)
      ).rejects.toThrow('Invoice not found or does not belong to customer');
    });

    it('should throw error if payment exceeds invoice balance', async () => {
      const paymentExceedingBalance = {
        ...basePaymentData,
        invoiceId: 'invoice-123',
        amount: 600.00 // Exceeds balance of 500.00
      };

      await expect(
        manualPaymentService.createManualPayment(paymentExceedingBalance, organizationId, auditContext)
      ).rejects.toThrow('Payment amount (600) exceeds remaining balance (500)');
    });

    it('should validate cheque number requirement', async () => {
      const chequeWithoutNumber = {
        ...basePaymentData,
        paymentMethod: PaymentMethod.CHEQUE
        // Missing chequeNumber
      };

      await expect(
        manualPaymentService.createManualPayment(chequeWithoutNumber, organizationId, auditContext)
      ).rejects.toThrow('Cheque number is required for cheque payments');
    });

    it('should validate bank reference requirement', async () => {
      const bankTransferWithoutReference = {
        ...basePaymentData,
        paymentMethod: PaymentMethod.BANK_TRANSFER
        // Missing bankReference
      };

      await expect(
        manualPaymentService.createManualPayment(bankTransferWithoutReference, organizationId, auditContext)
      ).rejects.toThrow('Bank reference is required for bank transfer payments');
    });

    it('should require exchange rate for multi-currency payments', async () => {
      const invalidMultiCurrency = {
        ...basePaymentData,
        originalCurrency: 'USD'
        // Missing exchangeRate and originalAmount
      };

      await expect(
        manualPaymentService.createManualPayment(invalidMultiCurrency, organizationId, auditContext)
      ).rejects.toThrow('Exchange rate and original amount required for multi-currency payments');
    });

    it('should handle email sending failures gracefully', async () => {
      mockEmailService.sendPaymentReceipt.mockRejectedValue(new Error('Email service unavailable'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      // Should not throw error even if email fails
      await expect(
        manualPaymentService.createManualPayment(basePaymentData, organizationId, auditContext)
      ).resolves.not.toThrow();

      expect(consoleSpy).toHaveBeenCalledWith('Failed to send payment receipt:', expect.any(Error));
      consoleSpy.mockRestore();
    });
  });

  describe('processBatchPayments', () => {
    const batchData: BatchPaymentData = {
      payments: [
        {
          customerId: 'customer-1',
          amount: 100.00,
          paymentMethod: PaymentMethod.CASH
        },
        {
          customerId: 'customer-2',
          amount: 200.00,
          paymentMethod: PaymentMethod.CHEQUE,
          chequeNumber: 'CHQ-001'
        },
        {
          customerId: 'invalid-customer',
          amount: 300.00,
          paymentMethod: PaymentMethod.CASH
        }
      ],
      batchReference: 'BATCH-001',
      batchNotes: 'Monthly payment batch'
    };

    beforeEach(() => {
      jest.spyOn(manualPaymentService, 'createManualPayment')
        .mockResolvedValueOnce({
          id: 'payment-1',
          amount: new Decimal(100.00),
          organizationId,
          customerId: 'customer-1',
          paymentMethod: PaymentMethod.CASH,
          status: PaymentStatus.COMPLETED
        } as any) // Success
        .mockResolvedValueOnce({
          id: 'payment-2',
          amount: new Decimal(200.00),
          organizationId,
          customerId: 'customer-2',
          paymentMethod: PaymentMethod.CHEQUE,
          status: PaymentStatus.COMPLETED
        } as any) // Success
        .mockRejectedValueOnce(new Error('Customer not found')); // Failure
    });

    it('should process batch payments with mixed success/failure', async () => {
      const result = await manualPaymentService.processBatchPayments(batchData, organizationId, auditContext);

      expect(result.batchId).toBe('mock-uuid-12345');
      expect(result.successful).toHaveLength(2);
      expect(result.failed).toHaveLength(1);

      expect(result.successful[0]).toEqual(expect.objectContaining({
        id: 'payment-1',
        amount: new Decimal(100.00)
      }));
      expect(result.failed[0]).toEqual({
        payment: batchData.payments[2],
        error: 'Customer not found'
      });
    });

    it('should add batch information to admin notes', async () => {
      await manualPaymentService.processBatchPayments(batchData, organizationId, auditContext);

      expect(manualPaymentService.createManualPayment).toHaveBeenCalledWith(
        expect.objectContaining({
          adminNotes: expect.stringContaining('Batch ID: mock-uuid-12345')
        }),
        organizationId,
        auditContext
      );
    });

    it('should log batch processing audit action', async () => {
      await manualPaymentService.processBatchPayments(batchData, organizationId, auditContext);

      expect(mockAuditService.logAction).toHaveBeenCalledWith({
        action: 'CREATE',
        entityType: 'BatchPayment',
        entityId: 'mock-uuid-12345',
        changes: {
          batchId: 'mock-uuid-12345',
          totalPayments: 3,
          successful: 2,
          failed: 1,
          batchReference: 'BATCH-001',
          batchNotes: 'Monthly payment batch'
        },
        context: {
          organizationId,
          userId: 'user-123',
          ipAddress: '127.0.0.1',
          userAgent: 'test-agent'
        }
      });
    });
  });

  describe('reconcilePayments', () => {
    const reconciliationData: ReconciliationData = {
      bankStatementReference: 'STMT-123',
      bankStatementDate: new Date('2024-01-15'),
      bankAmount: 300.00,
      paymentIds: ['payment-1', 'payment-2'],
      reconciliationNotes: 'Bank statement reconciliation'
    };

    const mockPayments = [
      {
        id: 'payment-1',
        organizationId,
        amount: new Decimal(150.00),
        adminNotes: 'Initial notes',
        metadata: '{}'
      },
      {
        id: 'payment-2',
        organizationId,
        amount: new Decimal(150.00),
        adminNotes: null,
        metadata: '{}'
      }
    ];

    beforeEach(() => {
      mockPrisma.payment.findMany.mockResolvedValue(mockPayments);
      mockPrisma.payment.update.mockImplementation((args) =>
        Promise.resolve({ ...mockPayments[0], ...args.data })
      );
    });

    it('should reconcile payments successfully', async () => {
      const result = await manualPaymentService.reconcilePayments(reconciliationData, organizationId, auditContext);

      expect(result.reconciledPayments).toHaveLength(2);
      expect(result.discrepancies).toHaveLength(0); // 150 + 150 = 300, matches bank amount

      expect(mockPrisma.payment.findMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['payment-1', 'payment-2'] },
          organizationId,
          deletedAt: null
        }
      });

      expect(mockPrisma.payment.update).toHaveBeenCalledTimes(2);
    });

    it('should detect amount discrepancies', async () => {
      const discrepancyData = {
        ...reconciliationData,
        bankAmount: 250.00 // Doesn't match payment total of 300.00
      };

      const result = await manualPaymentService.reconcilePayments(discrepancyData, organizationId, auditContext);

      expect(result.discrepancies).toEqual([
        {
          type: 'amount_mismatch',
          expected: 300.00,
          actual: 250.00,
          difference: -50.00
        }
      ]);
    });

    it('should update payment metadata with reconciliation info', async () => {
      await manualPaymentService.reconcilePayments(reconciliationData, organizationId, auditContext);

      expect(mockPrisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'payment-1' },
        data: {
          bankReference: 'STMT-123',
          adminNotes: expect.stringContaining('Reconciled: 2024-01-15'),
          metadata: expect.stringContaining('reconciliation')
        }
      });
    });

    it('should throw error if some payments not found', async () => {
      mockPrisma.payment.findMany.mockResolvedValue([mockPayments[0]]); // Only 1 payment found instead of 2

      await expect(
        manualPaymentService.reconcilePayments(reconciliationData, organizationId, auditContext)
      ).rejects.toThrow('Some payments not found or do not belong to organization');
    });

    it('should log reconciliation audit action', async () => {
      await manualPaymentService.reconcilePayments(reconciliationData, organizationId, auditContext);

      expect(mockAuditService.logAction).toHaveBeenCalledWith({
        action: 'UPDATE',
        entityType: 'PaymentReconciliation',
        entityId: 'STMT-123',
        changes: expect.objectContaining({
          bankStatementReference: 'STMT-123',
          paymentIds: ['payment-1', 'payment-2'],
          totalPaymentAmount: 300.00
        }),
        context: {
          organizationId,
          userId: 'user-123',
          ipAddress: '127.0.0.1',
          userAgent: 'test-agent'
        }
      });
    });
  });

  describe('createPaymentPlan', () => {
    const planData: PaymentPlanData = {
      customerId: 'customer-123',
      invoiceId: 'invoice-123',
      totalAmount: 1000.00,
      currency: 'CAD',
      installments: [
        { amount: 300.00, dueDate: new Date('2024-02-01'), description: 'First installment' },
        { amount: 350.00, dueDate: new Date('2024-03-01'), description: 'Second installment' },
        { amount: 350.00, dueDate: new Date('2024-04-01'), description: 'Final installment' }
      ],
      paymentMethod: PaymentMethod.BANK_TRANSFER,
      setupFee: 0,
      notes: 'Payment plan for large invoice'
    };

    beforeEach(() => {
      mockPrisma.payment.create.mockImplementation((args) =>
        Promise.resolve({
          id: `payment-${Math.random()}`,
          ...args.data,
          customer: mockCustomer
        })
      );
    });

    it('should create payment plan with scheduled payments', async () => {
      const result = await manualPaymentService.createPaymentPlan(planData, organizationId, auditContext);

      expect(result.paymentPlan).toEqual({
        id: 'mock-uuid-12345',
        customerId: 'customer-123',
        invoiceId: 'invoice-123',
        totalAmount: 1000.00,
        currency: 'CAD',
        installmentCount: 3,
        setupFee: 0,
        interestRate: 0,
        paymentMethod: PaymentMethod.BANK_TRANSFER,
        notes: 'Payment plan for large invoice',
        createdAt: expect.any(Date),
        status: 'ACTIVE'
      });

      expect(result.scheduledPayments).toHaveLength(3);
      expect(mockPrisma.payment.create).toHaveBeenCalledTimes(3);
    });

    it('should validate installment amounts match total', async () => {
      const invalidPlan = {
        ...planData,
        installments: [
          { amount: 300.00, dueDate: new Date('2024-02-01') },
          { amount: 300.00, dueDate: new Date('2024-03-01') } // Total 600, not 1000
        ]
      };

      await expect(
        manualPaymentService.createPaymentPlan(invalidPlan, organizationId, auditContext)
      ).rejects.toThrow('Sum of installments does not match total amount plus setup fee');
    });

    it('should handle setup fees in validation', async () => {
      const planWithSetupFee = {
        ...planData,
        setupFee: 50.00,
        installments: [
          { amount: 1050.00, dueDate: new Date('2024-02-01') } // Includes setup fee
        ]
      };

      await expect(
        manualPaymentService.createPaymentPlan(planWithSetupFee, organizationId, auditContext)
      ).resolves.not.toThrow();
    });

    it('should create payments with pending status', async () => {
      await manualPaymentService.createPaymentPlan(planData, organizationId, auditContext);

      expect(mockPrisma.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: PaymentStatus.PENDING,
            adminNotes: expect.stringContaining('Payment Plan Installment')
          })
        })
      );
    });

    it('should throw error if customer not found', async () => {
      mockPrisma.customer.findFirst.mockResolvedValue(null);

      await expect(
        manualPaymentService.createPaymentPlan(planData, organizationId, auditContext)
      ).rejects.toThrow('Customer not found');
    });

    it('should throw error if invoice not found', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(null);

      await expect(
        manualPaymentService.createPaymentPlan(planData, organizationId, auditContext)
      ).rejects.toThrow('Invoice not found or does not belong to customer');
    });
  });

  describe('allocatePartialPayment', () => {
    const allocationData: PartialPaymentAllocation = {
      paymentId: 'payment-123',
      allocations: [
        { invoiceId: 'invoice-1', amount: 60.00, description: 'Partial payment for INV-1' },
        { invoiceId: 'invoice-2', amount: 40.00, description: 'Partial payment for INV-2' }
      ]
    };

    const mockPayment = {
      id: 'payment-123',
      organizationId,
      amount: new Decimal(100.00),
      adminNotes: 'Original notes',
      metadata: '{}'
    };

    const mockInvoices = [
      { id: 'invoice-1', organizationId },
      { id: 'invoice-2', organizationId }
    ];

    beforeEach(() => {
      mockPrisma.payment.findFirst.mockResolvedValue(mockPayment);
      mockPrisma.invoice.findMany.mockResolvedValue(mockInvoices);
      mockPrisma.payment.update.mockResolvedValue({
        ...mockPayment,
        adminNotes: 'Updated notes',
        metadata: '{"partialAllocation": {}}'
      });
    });

    it('should allocate partial payment across multiple invoices', async () => {
      const result = await manualPaymentService.allocatePartialPayment(allocationData, organizationId, auditContext);

      expect(mockInvoiceService.recordPayment).toHaveBeenCalledTimes(2);
      expect(mockInvoiceService.recordPayment).toHaveBeenCalledWith(
        'invoice-1',
        60.00,
        organizationId,
        { userId: 'user-123', ipAddress: '127.0.0.1', userAgent: 'test-agent' }
      );
      expect(mockInvoiceService.recordPayment).toHaveBeenCalledWith(
        'invoice-2',
        40.00,
        organizationId,
        { userId: 'user-123', ipAddress: '127.0.0.1', userAgent: 'test-agent' }
      );

      expect(result).toBeDefined();
    });

    it('should validate allocation amounts equal payment amount', async () => {
      const invalidAllocation = {
        ...allocationData,
        allocations: [
          { invoiceId: 'invoice-1', amount: 50.00 } // Only 50, not 100
        ]
      };

      await expect(
        manualPaymentService.allocatePartialPayment(invalidAllocation, organizationId, auditContext)
      ).rejects.toThrow('Total allocated amount does not match payment amount');
    });

    it('should throw error if payment not found', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue(null);

      await expect(
        manualPaymentService.allocatePartialPayment(allocationData, organizationId, auditContext)
      ).rejects.toThrow('Payment not found');
    });

    it('should throw error if some invoices not found', async () => {
      mockPrisma.invoice.findMany.mockResolvedValue([mockInvoices[0]]); // Only 1 invoice found

      await expect(
        manualPaymentService.allocatePartialPayment(allocationData, organizationId, auditContext)
      ).rejects.toThrow('Some invoices not found or do not belong to organization');
    });

    it('should update payment metadata with allocation info', async () => {
      await manualPaymentService.allocatePartialPayment(allocationData, organizationId, auditContext);

      expect(mockPrisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'payment-123' },
        data: {
          adminNotes: expect.stringContaining('Partial Payment Allocated'),
          metadata: expect.stringContaining('partialAllocation')
        }
      });
    });
  });

  describe('updateChequeStatus', () => {
    const mockChequePayment = {
      id: 'payment-123',
      organizationId,
      paymentMethod: PaymentMethod.CHEQUE,
      status: PaymentStatus.COMPLETED,
      adminNotes: 'Original notes',
      metadata: '{}',
      invoiceId: 'invoice-123'
    };

    beforeEach(() => {
      mockPrisma.payment.findFirst.mockResolvedValue(mockChequePayment);
      mockPrisma.payment.update.mockResolvedValue({
        ...mockChequePayment,
        status: PaymentStatus.FAILED
      });
    });

    it('should update cheque status to cleared', async () => {
      const clearingDate = new Date('2024-01-15');

      await manualPaymentService.updateChequeStatus(
        'payment-123',
        'CLEARED',
        clearingDate,
        'Cheque cleared successfully',
        organizationId,
        auditContext
      );

      expect(mockPrisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'payment-123' },
        data: {
          status: PaymentStatus.COMPLETED, // Status unchanged for cleared
          processedAt: clearingDate,
          adminNotes: expect.stringContaining('Cheque CLEARED'),
          metadata: expect.stringContaining('chequeStatus')
        }
      });
    });

    it('should update cheque status to bounced and change payment status', async () => {
      await manualPaymentService.updateChequeStatus(
        'payment-123',
        'BOUNCED',
        undefined,
        'Insufficient funds',
        organizationId,
        auditContext
      );

      expect(mockPrisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'payment-123' },
        data: {
          status: PaymentStatus.FAILED,
          processedAt: expect.any(Date),
          adminNotes: expect.stringContaining('Cheque BOUNCED'),
          metadata: expect.stringContaining('chequeStatus')
        }
      });
    });

    it('should log audit action for status update', async () => {
      await manualPaymentService.updateChequeStatus(
        'payment-123',
        'CANCELLED',
        undefined,
        'Cancelled by customer',
        organizationId,
        auditContext
      );

      expect(mockAuditService.logAction).toHaveBeenCalledWith({
        action: 'UPDATE',
        entityType: 'ChequeStatus',
        entityId: 'payment-123',
        changes: {
          status: { from: PaymentStatus.COMPLETED, to: PaymentStatus.FAILED },
          chequeStatus: 'CANCELLED',
          clearingDate: undefined
        },
        context: {
          organizationId,
          userId: 'user-123',
          ipAddress: '127.0.0.1',
          userAgent: 'test-agent'
        }
      });
    });

    it('should throw error if cheque payment not found', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue(null);

      await expect(
        manualPaymentService.updateChequeStatus('invalid-payment', 'CLEARED')
      ).rejects.toThrow('Cheque payment not found');
    });

    it('should warn about bounced cheque requiring manual invoice adjustment', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      await manualPaymentService.updateChequeStatus(
        'payment-123',
        'BOUNCED',
        undefined,
        'Insufficient funds',
        organizationId,
        auditContext
      );

      expect(consoleSpy).toHaveBeenCalledWith('Cheque bounced - manual invoice adjustment required');
      consoleSpy.mockRestore();
    });
  });

  describe('utility methods', () => {
    describe('generatePaymentNumber', () => {
      it('should generate payment numbers with correct prefixes', () => {
        const cashNumber = (manualPaymentService as any).generatePaymentNumber(PaymentMethod.CASH);
        const chequeNumber = (manualPaymentService as any).generatePaymentNumber(PaymentMethod.CHEQUE);
        const wireNumber = (manualPaymentService as any).generatePaymentNumber(PaymentMethod.BANK_TRANSFER);
        const etransferNumber = (manualPaymentService as any).generatePaymentNumber(PaymentMethod.INTERAC_ETRANSFER);

        expect(cashNumber).toMatch(/^CASH-\d+-[A-Z0-9]+$/);
        expect(chequeNumber).toMatch(/^CHQ-\d+-[A-Z0-9]+$/);
        expect(wireNumber).toMatch(/^WIRE-\d+-[A-Z0-9]+$/);
        expect(etransferNumber).toMatch(/^ET-\d+-[A-Z0-9]+$/);
      });
    });

    describe('getMethodPrefix', () => {
      it('should return correct prefixes for payment methods', () => {
        expect((manualPaymentService as any).getMethodPrefix(PaymentMethod.CASH)).toBe('CASH');
        expect((manualPaymentService as any).getMethodPrefix(PaymentMethod.CHEQUE)).toBe('CHQ');
        expect((manualPaymentService as any).getMethodPrefix(PaymentMethod.BANK_TRANSFER)).toBe('WIRE');
        expect((manualPaymentService as any).getMethodPrefix(PaymentMethod.INTERAC_ETRANSFER)).toBe('ET');
        expect((manualPaymentService as any).getMethodPrefix(PaymentMethod.OTHER)).toBe('OTH');
        expect((manualPaymentService as any).getMethodPrefix('UNKNOWN' as any)).toBe('PAY');
      });
    });

    describe('generateReferenceNumber', () => {
      it('should generate reference numbers with correct format', () => {
        const ref = (manualPaymentService as any).generateReferenceNumber(PaymentMethod.CASH);
        expect(ref).toMatch(/^CASH\d{8}[A-Z0-9]{4}$/);
      });
    });

    describe('formatPaymentMethod', () => {
      it('should format payment methods for display', () => {
        expect((manualPaymentService as any).formatPaymentMethod(PaymentMethod.CASH)).toBe('Cash');
        expect((manualPaymentService as any).formatPaymentMethod(PaymentMethod.CHEQUE)).toBe('Cheque');
        expect((manualPaymentService as any).formatPaymentMethod(PaymentMethod.BANK_TRANSFER)).toBe('Bank Transfer');
        expect((manualPaymentService as any).formatPaymentMethod(PaymentMethod.INTERAC_ETRANSFER)).toBe('Interac e-Transfer');
        expect((manualPaymentService as any).formatPaymentMethod(PaymentMethod.STRIPE_CARD)).toBe('Credit Card');
        expect((manualPaymentService as any).formatPaymentMethod(PaymentMethod.OTHER)).toBe('Other');
      });
    });

    describe('validatePaymentMethodFields', () => {
      it('should validate cheque number requirement', () => {
        const chequeData = { paymentMethod: PaymentMethod.CHEQUE };

        expect(() => {
          (manualPaymentService as any).validatePaymentMethodFields(chequeData);
        }).toThrow('Cheque number is required for cheque payments');
      });

      it('should validate bank reference requirement', () => {
        const bankData = { paymentMethod: PaymentMethod.BANK_TRANSFER };

        expect(() => {
          (manualPaymentService as any).validatePaymentMethodFields(bankData);
        }).toThrow('Bank reference is required for bank transfer payments');
      });

      it('should warn about missing receipt documents for cash', () => {
        const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
        const cashData = { paymentMethod: PaymentMethod.CASH };

        (manualPaymentService as any).validatePaymentMethodFields(cashData);

        expect(consoleSpy).toHaveBeenCalledWith('No receipt documents provided for cash payment');
        consoleSpy.mockRestore();
      });
    });
  });

  describe('error handling', () => {
    it('should handle database errors gracefully', async () => {
      mockPrisma.customer.findFirst.mockRejectedValue(new Error('Database connection failed'));

      await expect(
        manualPaymentService.createManualPayment(
          { customerId: 'customer-123', amount: 100, paymentMethod: PaymentMethod.CASH },
          organizationId,
          auditContext
        )
      ).rejects.toThrow('Database connection failed');
    });

    it('should handle audit service failures gracefully', async () => {
      mockAuditService.logAction.mockRejectedValue(new Error('Audit service unavailable'));

      // Payment creation should still succeed even if audit fails
      await expect(
        manualPaymentService.createManualPayment(
          { customerId: 'customer-123', amount: 100, paymentMethod: PaymentMethod.CASH },
          organizationId,
          auditContext
        )
      ).resolves.toBeDefined();
    });
  });

  describe('edge cases', () => {
    it('should handle zero amount validation', async () => {
      const zeroAmountData = {
        customerId: 'customer-123',
        amount: 0,
        paymentMethod: PaymentMethod.CASH
      };

      // Should create payment with zero amount (might be a credit or reversal)
      await expect(
        manualPaymentService.createManualPayment(zeroAmountData, organizationId, auditContext)
      ).resolves.toBeDefined();
    });

    it('should handle missing customer email gracefully', async () => {
      const customerWithoutEmail = {
        ...mockCustomer,
        person: { ...mockCustomer.person, email: null }
      };
      mockPrisma.customer.findFirst.mockResolvedValue(customerWithoutEmail);

      await expect(
        manualPaymentService.createManualPayment(
          { customerId: 'customer-123', amount: 100, paymentMethod: PaymentMethod.CASH },
          organizationId,
          auditContext
        )
      ).resolves.toBeDefined();

      // Email service should not be called
      expect(mockEmailService.sendPaymentReceipt).not.toHaveBeenCalled();
    });

    it('should handle business customer email', async () => {
      const businessCustomer = {
        ...mockCustomer,
        person: null,
        business: { legalName: 'Test Business Inc', email: 'business@example.com' }
      };
      mockPrisma.customer.findFirst.mockResolvedValue(businessCustomer);

      await manualPaymentService.createManualPayment(
        { customerId: 'customer-123', amount: 100, paymentMethod: PaymentMethod.CASH },
        organizationId,
        auditContext
      );

      expect(mockEmailService.sendPaymentReceipt).toHaveBeenCalledWith(
        'business@example.com',
        expect.objectContaining({
          customerName: 'Test Business Inc'
        })
      );
    });
  });
});