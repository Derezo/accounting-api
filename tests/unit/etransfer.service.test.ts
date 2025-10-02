// Mock dependencies first
const mockPrisma = {
  customer: {
    findFirst: jest.fn()
  },
  invoice: {
    findFirst: jest.fn()
  },
  payment: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    count: jest.fn()
  },
  organization: {
    findUnique: jest.fn()
  }
};

// Mock the database config to return our mock prisma
jest.mock('../../src/config/database', () => ({
  prisma: mockPrisma
}));

jest.mock('../../src/services/audit.service');
jest.mock('../../src/services/email.service');
jest.mock('../../src/services/invoice.service', () => ({
  invoiceService: {
    recordPayment: jest.fn()
  }
}));

jest.mock('../../src/config/config', () => ({
  config: {
    DEFAULT_CURRENCY: 'CAD',
    ENCRYPTION_KEY: 'test-encryption-key-32-chars-1234'
  }
}));

// Mock environment variables
process.env.FRONTEND_URL = 'https://app.example.com';

jest.mock('crypto', () => ({
  randomBytes: jest.fn(() => Buffer.from('abcd1234', 'hex')),
  createCipher: jest.fn(() => ({
    update: jest.fn(() => 'encrypted'),
    final: jest.fn(() => 'final')
  })),
  createDecipher: jest.fn(() => ({
    update: jest.fn(() => 'decrypted'),
    final: jest.fn(() => 'answer')
  }))
}));

import { ETransferService } from '../../src/services/etransfer.service';
import { PaymentMethod, PaymentStatus } from '../../src/types/enums';
import { auditService } from '../../src/services/audit.service';
import { emailService } from '../../src/services/email.service';
import { invoiceService } from '../../src/services/invoice.service';

const mockAuditService = auditService as jest.Mocked<typeof auditService>;
const mockEmailService = emailService as jest.Mocked<typeof emailService>;
const mockInvoiceService = invoiceService as jest.Mocked<typeof invoiceService>;

describe('ETransferService', () => {
  let etransferService: ETransferService;

  beforeEach(() => {
    jest.clearAllMocks();
    etransferService = new ETransferService();

    // Set up Date.now mock for consistent timestamps
    jest.spyOn(Date, 'now').mockReturnValue(1640995200000); // 2022-01-01T00:00:00.000Z
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('createETransfer', () => {
    const organizationId = 'org-123';
    const auditContext = {
      userId: 'user-123',
      ipAddress: '127.0.0.1',
      userAgent: 'test-agent'
    };

    const mockCustomer = {
      id: 'customer-123',
      organizationId,
      person: { firstName: 'John', lastName: 'Doe' },
      business: null
    };

    const mockInvoice = {
      id: 'invoice-123',
      customerId: 'customer-123',
      organizationId,
      balance: 500.00
    };

    const mockETransferData = {
      customerId: 'customer-123',
      amount: 250.00,
      recipientEmail: 'recipient@example.com',
      recipientName: 'Jane Smith',
      securityQuestion: 'What is your favorite color?',
      securityAnswer: 'blue',
      message: 'Payment for services',
      autoDeposit: false,
      expiryHours: 72
    };

    const mockCreatedPayment = {
      id: 'payment-123',
      organizationId,
      paymentNumber: 'ET-1640995200000-ABCD1234',
      customerId: 'customer-123',
      amount: 250.00,
      currency: 'CAD',
      paymentMethod: PaymentMethod.INTERAC_ETRANSFER,
      status: PaymentStatus.PENDING,
      processorFee: 1.50,
      netAmount: 248.50,
      metadata: JSON.stringify({
        etransfer: {
          recipientEmail: 'recipient@example.com',
          recipientName: 'Jane Smith',
          securityQuestion: 'What is your favorite color?',
          securityAnswer: 'encryptedfinal',
          autoDeposit: false,
          expiryDate: new Date(1640995200000 + 72 * 60 * 60 * 1000).toISOString(),
          sentAt: new Date(1640995200000).toISOString()
        }
      }),
      customer: mockCustomer,
      invoice: null
    };

    beforeEach(() => {
      mockPrisma.customer.findFirst.mockResolvedValue(mockCustomer);
      mockPrisma.payment.create.mockResolvedValue(mockCreatedPayment);
      mockPrisma.payment.update.mockResolvedValue(mockCreatedPayment);
      mockPrisma.organization.findUnique.mockResolvedValue({
        id: organizationId,
        name: 'Test Organization'
      });
      mockAuditService.logAction.mockResolvedValue(undefined);
      mockEmailService.sendETransferNotification.mockResolvedValue(undefined);
    });

    it('should create e-transfer successfully', async () => {
      const result = await etransferService.createETransfer(
        mockETransferData,
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
          paymentNumber: 'ET-1640995200000-ABCD1234',
          customerId: 'customer-123',
          paymentMethod: PaymentMethod.INTERAC_ETRANSFER,
          amount: 250.00,
          currency: 'CAD',
          status: PaymentStatus.PENDING,
          processorFee: 1.50,
          netAmount: 248.50,
          customerNotes: 'Payment for services',
          adminNotes: 'E-Transfer to: recipient@example.com'
        }),
        include: expect.any(Object)
      });

      expect(result).toEqual(mockCreatedPayment);
    });

    it('should create e-transfer with invoice linkage', async () => {
      const dataWithInvoice = {
        ...mockETransferData,
        invoiceId: 'invoice-123'
      };

      mockPrisma.invoice.findFirst.mockResolvedValue(mockInvoice);

      await etransferService.createETransfer(
        dataWithInvoice,
        organizationId,
        auditContext
      );

      expect(mockPrisma.invoice.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'invoice-123',
          customerId: 'customer-123',
          organizationId,
          deletedAt: null
        }
      });

      expect(mockPrisma.payment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          invoiceId: 'invoice-123'
        }),
        include: expect.any(Object)
      });
    });

    it('should calculate correct fees for different amounts', async () => {
      // Test fee calculation for small amount
      const smallAmountData = { ...mockETransferData, amount: 50.00 };
      await etransferService.createETransfer(smallAmountData, organizationId, auditContext);

      expect(mockPrisma.payment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          processorFee: 1.00,
          netAmount: 49.00
        }),
        include: expect.any(Object)
      });

      jest.clearAllMocks();
      mockPrisma.payment.create.mockResolvedValue(mockCreatedPayment);

      // Test fee calculation for large amount
      const largeAmountData = { ...mockETransferData, amount: 1500.00 };
      await etransferService.createETransfer(largeAmountData, organizationId, auditContext);

      expect(mockPrisma.payment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          processorFee: 2.00,
          netAmount: 1498.00
        }),
        include: expect.any(Object)
      });
    });

    it('should encrypt security answer', async () => {
      await etransferService.createETransfer(mockETransferData, organizationId, auditContext);

      const createCall = mockPrisma.payment.create.mock.calls[0][0];
      const metadata = JSON.parse(createCall.data.metadata);
      expect(metadata.etransfer.securityAnswer).toBe('encryptedfinal');
    });

    it('should send email notification', async () => {
      await etransferService.createETransfer(mockETransferData, organizationId, auditContext);

      expect(mockEmailService.sendETransferNotification).toHaveBeenCalledWith(
        'recipient@example.com',
        {
          etransferNumber: 'ET-1640995200000-ABCD1234',
          amount: 250.00,
          currency: 'CAD',
          senderName: 'Test Organization',
          message: 'Payment for services',
          securityQuestion: 'What is your favorite color?',
          depositUrl: 'https://app.example.com/etransfer/deposit/ET-1640995200000-ABCD1234',
          expiryDate: new Date(1640995200000 + 72 * 60 * 60 * 1000)
        }
      );
    });

    it('should log audit action', async () => {
      await etransferService.createETransfer(mockETransferData, organizationId, auditContext);

      expect(mockAuditService.logAction).toHaveBeenCalledWith({
        action: 'CREATE',
        entityType: 'ETransfer',
        entityId: 'payment-123',
        changes: {
          payment: mockCreatedPayment,
          etransferData: {
            recipientEmail: 'recipient@example.com',
            amount: 250.00,
            currency: 'CAD'
          }
        },
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
        etransferService.createETransfer(mockETransferData, organizationId, auditContext)
      ).rejects.toThrow('Customer not found');
    });

    it('should throw error if invoice not found', async () => {
      const dataWithInvoice = {
        ...mockETransferData,
        invoiceId: 'invalid-invoice'
      };

      mockPrisma.invoice.findFirst.mockResolvedValue(null);

      await expect(
        etransferService.createETransfer(dataWithInvoice, organizationId, auditContext)
      ).rejects.toThrow('Invoice not found or does not belong to customer');
    });

    it('should throw error if amount exceeds invoice balance', async () => {
      const dataWithInvoice = {
        ...mockETransferData,
        invoiceId: 'invoice-123',
        amount: 600.00 // Exceeds balance of 500.00
      };

      mockPrisma.invoice.findFirst.mockResolvedValue(mockInvoice);

      await expect(
        etransferService.createETransfer(dataWithInvoice, organizationId, auditContext)
      ).rejects.toThrow('Payment amount (600) exceeds remaining balance (500)');
    });

    it('should continue if email notification fails', async () => {
      mockEmailService.sendETransferNotification.mockRejectedValue(new Error('Email failed'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await etransferService.createETransfer(
        mockETransferData,
        organizationId,
        auditContext
      );

      expect(result).toEqual(mockCreatedPayment);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to send e-transfer notification:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('confirmETransferDeposit', () => {
    const organizationId = 'org-123';
    const auditContext = {
      userId: 'user-123',
      ipAddress: '127.0.0.1',
      userAgent: 'test-agent'
    };

    const mockPayment = {
      id: 'payment-123',
      paymentNumber: 'ET-123456789',
      organizationId,
      status: PaymentStatus.PENDING,
      amount: 250.00,
      invoiceId: 'invoice-123',
      adminNotes: 'E-Transfer to: recipient@example.com',
      metadata: JSON.stringify({
        etransfer: {
          expiryDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours from now
        }
      }),
      customer: { id: 'customer-123' },
      invoice: { id: 'invoice-123' }
    };

    beforeEach(() => {
      mockPrisma.payment.findFirst.mockResolvedValue(mockPayment);
      mockPrisma.payment.update.mockResolvedValue({
        ...mockPayment,
        status: PaymentStatus.COMPLETED
      });
      mockAuditService.logAction.mockResolvedValue(undefined);
      mockInvoiceService.recordPayment.mockResolvedValue({} as any);
    });

    it('should confirm e-transfer deposit successfully', async () => {
      const depositData = {
        etransferNumber: 'ET-123456789',
        confirmationCode: 'CONF123456',
        actualAmount: 250.00,
        fees: 0
      };

      const result = await etransferService.confirmETransferDeposit(
        depositData,
        organizationId,
        auditContext
      );

      expect(mockPrisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'payment-123' },
        data: expect.objectContaining({
          status: PaymentStatus.COMPLETED,
          processedAt: expect.any(Date),
          netAmount: 250.00,
          adminNotes: expect.stringContaining('Deposited at'),
          metadata: expect.stringContaining('CONF123456')
        })
      });

      expect(result.status).toBe(PaymentStatus.COMPLETED);
    });

    it('should update linked invoice when deposit is confirmed', async () => {
      const depositData = {
        etransferNumber: 'ET-123456789',
        actualAmount: 250.00
      };

      await etransferService.confirmETransferDeposit(
        depositData,
        organizationId,
        auditContext
      );

      expect(mockInvoiceService.recordPayment).toHaveBeenCalledWith(
        'invoice-123',
        250.00,
        organizationId,
        { userId: 'user-123', ipAddress: '127.0.0.1', userAgent: 'test-agent' }
      );
    });

    it('should use default values when optional fields are not provided', async () => {
      const depositData = {
        etransferNumber: 'ET-123456789'
      };

      await etransferService.confirmETransferDeposit(
        depositData,
        organizationId,
        auditContext
      );

      expect(mockPrisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'payment-123' },
        data: expect.objectContaining({
          processedAt: expect.any(Date),
          netAmount: 250.00 // actualAmount defaults to payment.amount, fees defaults to 0
        })
      });
    });

    it('should throw error if e-transfer not found', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue(null);

      const depositData = {
        etransferNumber: 'invalid-number'
      };

      await expect(
        etransferService.confirmETransferDeposit(depositData, organizationId, auditContext)
      ).rejects.toThrow('E-Transfer not found');
    });

    it('should throw error if e-transfer already deposited', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue({
        ...mockPayment,
        status: PaymentStatus.COMPLETED
      });

      const depositData = {
        etransferNumber: 'ET-123456789'
      };

      await expect(
        etransferService.confirmETransferDeposit(depositData, organizationId, auditContext)
      ).rejects.toThrow('E-Transfer has already been deposited');
    });

    it('should throw error if e-transfer is cancelled', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue({
        ...mockPayment,
        status: PaymentStatus.CANCELLED
      });

      const depositData = {
        etransferNumber: 'ET-123456789'
      };

      await expect(
        etransferService.confirmETransferDeposit(depositData, organizationId, auditContext)
      ).rejects.toThrow('E-Transfer has been cancelled or failed');
    });

    it('should throw error and cancel if e-transfer is expired', async () => {
      const expiredPayment = {
        ...mockPayment,
        metadata: JSON.stringify({
          etransfer: {
            expiryDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() // 24 hours ago
          }
        })
      };

      mockPrisma.payment.findFirst.mockResolvedValue(expiredPayment);

      const depositData = {
        etransferNumber: 'ET-123456789'
      };

      await expect(
        etransferService.confirmETransferDeposit(depositData, organizationId, auditContext)
      ).rejects.toThrow('E-Transfer has expired');
    });
  });

  describe('cancelETransfer', () => {
    const organizationId = 'org-123';
    const auditContext = {
      userId: 'user-123',
      ipAddress: '127.0.0.1',
      userAgent: 'test-agent'
    };

    const mockPayment = {
      id: 'payment-123',
      paymentNumber: 'ET-123456789',
      organizationId,
      status: PaymentStatus.PENDING,
      adminNotes: 'E-Transfer to: recipient@example.com'
    };

    beforeEach(() => {
      mockPrisma.payment.findFirst.mockResolvedValue(mockPayment);
      mockPrisma.payment.update.mockResolvedValue({
        ...mockPayment,
        status: PaymentStatus.CANCELLED
      });
      mockAuditService.logAction.mockResolvedValue(undefined);
    });

    it('should cancel e-transfer successfully', async () => {
      const result = await etransferService.cancelETransfer(
        'ET-123456789',
        'Customer requested cancellation',
        organizationId,
        auditContext
      );

      expect(mockPrisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'payment-123' },
        data: {
          status: PaymentStatus.CANCELLED,
          failureReason: 'Customer requested cancellation',
          adminNotes: expect.stringContaining('Cancelled at')
        }
      });

      expect(result.status).toBe(PaymentStatus.CANCELLED);
    });

    it('should log audit action for cancellation', async () => {
      await etransferService.cancelETransfer(
        'ET-123456789',
        'Expired',
        organizationId,
        auditContext
      );

      expect(mockAuditService.logAction).toHaveBeenCalledWith({
        action: 'UPDATE',
        entityType: 'ETransfer',
        entityId: 'payment-123',
        changes: {
          status: { from: PaymentStatus.PENDING, to: PaymentStatus.CANCELLED },
          cancellationReason: 'Expired'
        },
        context: {
          organizationId,
          userId: 'user-123',
          ipAddress: '127.0.0.1',
          userAgent: 'test-agent'
        }
      });
    });

    it('should throw error if e-transfer not found', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue(null);

      await expect(
        etransferService.cancelETransfer(
          'invalid-number',
          'Test reason',
          organizationId,
          auditContext
        )
      ).rejects.toThrow('E-Transfer not found');
    });

    it('should throw error if e-transfer is already completed', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue({
        ...mockPayment,
        status: PaymentStatus.COMPLETED
      });

      await expect(
        etransferService.cancelETransfer(
          'ET-123456789',
          'Test reason',
          organizationId,
          auditContext
        )
      ).rejects.toThrow('Cannot cancel a completed e-transfer');
    });

    it('should throw error if e-transfer is already cancelled', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue({
        ...mockPayment,
        status: PaymentStatus.CANCELLED
      });

      await expect(
        etransferService.cancelETransfer(
          'ET-123456789',
          'Test reason',
          organizationId,
          auditContext
        )
      ).rejects.toThrow('E-Transfer is already cancelled');
    });
  });

  describe('getETransfer', () => {
    const organizationId = 'org-123';

    it('should return e-transfer with masked security answer', async () => {
      const mockPayment = {
        id: 'payment-123',
        paymentNumber: 'ET-123456789',
        organizationId,
        metadata: JSON.stringify({
          etransfer: {
            recipientEmail: 'test@example.com',
            securityAnswer: 'encrypted-answer'
          }
        }),
        customer: { id: 'customer-123' },
        invoice: null
      };

      mockPrisma.payment.findFirst.mockResolvedValue(mockPayment);

      const result = await etransferService.getETransfer('ET-123456789', organizationId);

      expect(result).toBeTruthy();
      const metadata = JSON.parse((result as any).metadata);
      expect(metadata.etransfer.securityAnswer).toBe('[ENCRYPTED]');
    });

    it('should return null if e-transfer not found', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue(null);

      const result = await etransferService.getETransfer('invalid-number', organizationId);

      expect(result).toBeNull();
    });
  });

  describe('getETransferStats', () => {
    const organizationId = 'org-123';

    beforeEach(() => {
      const mockETransfers = [
        {
          status: PaymentStatus.COMPLETED,
          amount: 100.00,
          processorFee: 1.00,
          paymentDate: new Date('2024-01-01T10:00:00'),
          processedAt: new Date('2024-01-01T12:00:00'),
          metadata: '{}'
        },
        {
          status: PaymentStatus.PENDING,
          amount: 200.00,
          processorFee: 1.50,
          paymentDate: new Date('2024-01-02T10:00:00'),
          processedAt: null,
          metadata: '{}'
        },
        {
          status: PaymentStatus.CANCELLED,
          amount: 150.00,
          processorFee: 1.50,
          paymentDate: new Date('2024-01-03T10:00:00'),
          processedAt: null,
          metadata: JSON.stringify({
            etransfer: {
              expiryDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
            }
          })
        }
      ];

      mockPrisma.payment.findMany.mockResolvedValue(mockETransfers);
    });

    it('should calculate e-transfer statistics correctly', async () => {
      const result = await etransferService.getETransferStats(organizationId);

      expect(result).toEqual({
        totalSent: 3,
        totalPending: 1,
        totalDeposited: 1,
        totalExpired: 1,
        totalCancelled: 0,
        averageDepositTime: 2, // 2 hours between payment and processed dates
        totalFees: 4.00 // 1.00 + 1.50 + 1.50
      });
    });

    it('should handle date range filtering', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      await etransferService.getETransferStats(organizationId, startDate, endDate);

      expect(mockPrisma.payment.findMany).toHaveBeenCalledWith({
        where: {
          organizationId,
          paymentMethod: PaymentMethod.INTERAC_ETRANSFER,
          deletedAt: null,
          paymentDate: {
            gte: startDate,
            lte: endDate
          }
        },
        select: expect.any(Object)
      });
    });
  });

  describe('checkExpiredETransfers', () => {
    const organizationId = 'org-123';
    const fixedNow = 1640995200000; // 2022-01-01T00:00:00.000Z

    beforeEach(() => {
      // Mock Date constructor to return consistent "now" for this test
      jest.spyOn(global.Date, 'now').mockReturnValue(fixedNow);
      const RealDate = Date;
      global.Date = class extends RealDate {
        constructor(...args: any[]) {
          if (args.length === 0) {
            super(fixedNow);
          } else {
            super(...(args as [number]));
          }
        }
      } as any;

      const mockPendingETransfers = [
        {
          id: 'payment-1',
          paymentNumber: 'ET-123456789',
          organizationId,
          status: PaymentStatus.PENDING,
          adminNotes: 'E-Transfer to: recipient@example.com',
          metadata: JSON.stringify({
            etransfer: {
              expiryDate: new Date(fixedNow - 24 * 60 * 60 * 1000).toISOString() // Expired
            }
          })
        },
        {
          id: 'payment-2',
          paymentNumber: 'ET-987654321',
          organizationId,
          status: PaymentStatus.PENDING,
          adminNotes: 'E-Transfer to: recipient2@example.com',
          metadata: JSON.stringify({
            etransfer: {
              expiryDate: new Date(fixedNow + 24 * 60 * 60 * 1000).toISOString() // Not expired
            }
          })
        }
      ];

      mockPrisma.payment.findMany.mockResolvedValue(mockPendingETransfers);
      // Mock findFirst for when cancelETransfer is called internally
      mockPrisma.payment.findFirst.mockImplementation((args: any) => {
        const paymentNumber = args?.where?.paymentNumber;
        return Promise.resolve(
          mockPendingETransfers.find(p => p.paymentNumber === paymentNumber) || null
        );
      });
      mockPrisma.payment.update.mockResolvedValue({
        ...mockPendingETransfers[0],
        status: PaymentStatus.CANCELLED
      });
      mockAuditService.logAction.mockResolvedValue(undefined);
    });

    it('should cancel expired e-transfers and return count', async () => {
      const result = await etransferService.checkExpiredETransfers(organizationId);

      expect(result).toBe(1); // Only one expired
      expect(mockPrisma.payment.findMany).toHaveBeenCalledWith({
        where: {
          organizationId,
          paymentMethod: PaymentMethod.INTERAC_ETRANSFER,
          status: {
            in: [PaymentStatus.PENDING, PaymentStatus.PROCESSING]
          },
          deletedAt: null
        },
        select: expect.any(Object)
      });
      // Verify that update was called only once for the expired payment
      expect(mockPrisma.payment.update).toHaveBeenCalledTimes(1);
      expect(mockPrisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'payment-1' },
        data: expect.objectContaining({
          status: PaymentStatus.CANCELLED
        })
      });
    });

    it('should check all organizations when organizationId is not provided', async () => {
      await etransferService.checkExpiredETransfers();

      expect(mockPrisma.payment.findMany).toHaveBeenCalledWith({
        where: {
          paymentMethod: PaymentMethod.INTERAC_ETRANSFER,
          status: {
            in: [PaymentStatus.PENDING, PaymentStatus.PROCESSING]
          },
          deletedAt: null
        },
        select: expect.any(Object)
      });
    });

    it('should handle errors gracefully and continue processing', async () => {
      const mockETransfersWithError = [
        {
          id: 'payment-1',
          paymentNumber: 'ET-123456789',
          organizationId,
          metadata: 'invalid-json' // This will cause JSON.parse to fail
        }
      ];

      mockPrisma.payment.findMany.mockResolvedValue(mockETransfersWithError);
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await etransferService.checkExpiredETransfers(organizationId);

      expect(result).toBe(0);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Error checking expiry for e-transfer ET-123456789:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });
});