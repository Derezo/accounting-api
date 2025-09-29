import { Request, Response } from 'express';
import { InvoiceController } from '../../src/controllers/invoice.controller';
import { invoiceService } from '../../src/services/invoice.service';
import { InvoiceStatus } from '../../src/types/enums';
import { UserRole } from '../../src/types/enums';
import { AuthenticatedRequest } from '../../src/middleware/auth.middleware';
import { validationResult } from 'express-validator';
import Decimal from 'decimal.js';

// Mock the services
jest.mock('../../src/services/invoice.service');
jest.mock('express-validator', () => {
  const mockChain: any = () => ({
    notEmpty: jest.fn(() => mockChain()),
    isISO8601: jest.fn(() => mockChain()),
    isFloat: jest.fn(() => mockChain()),
    isLength: jest.fn(() => mockChain()),
    isArray: jest.fn(() => mockChain()),
    isString: jest.fn(() => mockChain()),
    isIn: jest.fn(() => mockChain()),
    isBoolean: jest.fn(() => mockChain()),
    isInt: jest.fn(() => mockChain()),
    optional: jest.fn(() => mockChain()),
    trim: jest.fn(() => mockChain()),
    withMessage: jest.fn(() => mockChain())
  });

  return {
    body: jest.fn(() => mockChain()),
    query: jest.fn(() => mockChain()),
    validationResult: jest.fn()
  };
});

// Type the mocked services
const mockInvoiceService = jest.mocked(invoiceService);
const mockValidationResult = jest.mocked(validationResult);

describe('InvoiceController', () => {
  let invoiceController: InvoiceController;
  let mockRequest: Partial<AuthenticatedRequest>;
  let mockResponse: Partial<Response>;
  let mockJson: jest.Mock;
  let mockStatus: jest.Mock;

  const mockUser = {
    id: 'user-123',
    organizationId: 'org-123',
    role: UserRole.ACCOUNTANT,
    email: 'test@test.com',
    sessionId: 'session-123'
  };

  const mockInvoice = {
    id: 'invoice-123',
    invoiceNumber: 'INV-001',
    status: InvoiceStatus.DRAFT,
    customerId: 'customer-123',
    quoteId: 'quote-123',
    issueDate: new Date('2024-01-01'),
    dueDate: new Date('2024-01-31'),
    currency: 'CAD',
    exchangeRate: new Decimal(1),
    subtotal: new Decimal(1000),
    taxAmount: new Decimal(130),
    total: new Decimal(1130),
    depositRequired: new Decimal(565),
    amountPaid: new Decimal(0),
    balance: new Decimal(1130),
    terms: 'Net 30',
    notes: 'Test invoice',
    sentAt: null,
    viewedAt: null,
    paidAt: null,
    customer: {
      id: 'customer-123',
      name: 'Test Customer',
      email: 'customer@test.com'
    },
    quote: {
      id: 'quote-123',
      quoteNumber: 'QUO-001'
    },
    items: [{
      id: 'item-123',
      description: 'Test service',
      quantity: new Decimal(1),
      unitPrice: new Decimal(1000),
      discountPercent: new Decimal(0),
      taxRate: new Decimal(13),
      subtotal: new Decimal(1000),
      taxAmount: new Decimal(130),
      total: new Decimal(1130)
    }],
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01')
  };

  beforeEach(() => {
    invoiceController = new InvoiceController();
    mockJson = jest.fn();
    mockStatus = jest.fn().mockReturnValue({ json: mockJson });

    mockResponse = {
      status: mockStatus,
      json: mockJson
    };

    mockRequest = {
      user: mockUser,
      params: { id: 'invoice-123' },
      query: {},
      body: {},
      ip: '127.0.0.1',
      headers: { 'user-agent': 'test-agent' }
    };

    // Reset all mocks
    jest.clearAllMocks();
    mockValidationResult.mockReturnValue({ isEmpty: () => true, array: () => [] } as any);
  });

  describe('createInvoice', () => {
    const validInvoiceData = {
      customerId: 'customer-123',
      dueDate: '2024-01-31',
      depositRequired: '565',
      currency: 'CAD',
      exchangeRate: '1',
      terms: 'Net 30',
      notes: 'Test invoice',
      items: [{
        description: 'Test service',
        quantity: '1',
        unitPrice: '1000',
        taxRate: '13'
      }]
    };

    it('should create invoice successfully', async () => {
      mockRequest.body = validInvoiceData;
      mockInvoiceService.createInvoice.mockResolvedValue(mockInvoice as any);

      await invoiceController.createInvoice(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockInvoiceService.createInvoice).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: 'customer-123',
          dueDate: new Date('2024-01-31'),
          depositRequired: new Decimal(565),
          currency: 'CAD',
          exchangeRate: 1,
          terms: 'Net 30',
          notes: 'Test invoice',
          items: expect.arrayContaining([
            expect.objectContaining({
              description: 'Test service',
              quantity: new Decimal(1),
              unitPrice: new Decimal(1000),
              taxRate: new Decimal(13)
            })
          ])
        }),
        'org-123',
        expect.objectContaining({
          userId: 'user-123',
          ipAddress: '127.0.0.1',
          userAgent: 'test-agent'
        })
      );

      expect(mockStatus).toHaveBeenCalledWith(201);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Invoice created successfully',
          invoice: expect.objectContaining({
            id: 'invoice-123',
            invoiceNumber: 'INV-001',
            status: InvoiceStatus.DRAFT
          })
        })
      );
    });

    it('should return 400 for validation errors', async () => {
      mockValidationResult.mockReturnValue({
        isEmpty: () => false,
        array: () => [{ field: 'customerId', msg: 'Required' }]
      } as any);

      await invoiceController.createInvoice(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        errors: [{ field: 'customerId', msg: 'Required' }]
      });
    });

    it('should return 401 when user is not authenticated', async () => {
      mockRequest.user = undefined;

      await invoiceController.createInvoice(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(401);
      expect(mockJson).toHaveBeenCalledWith({ error: 'Authentication required' });
    });

    it('should return 404 when customer not found', async () => {
      mockRequest.body = validInvoiceData;
      mockInvoiceService.createInvoice.mockRejectedValue(new Error('Customer not found'));

      await invoiceController.createInvoice(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(404);
      expect(mockJson).toHaveBeenCalledWith({ error: 'Customer not found' });
    });

    it('should return 409 for business rule violations', async () => {
      mockRequest.body = validInvoiceData;
      mockInvoiceService.createInvoice.mockRejectedValue(new Error('Only accepted quotes can be converted to invoices'));

      await invoiceController.createInvoice(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(409);
      expect(mockJson).toHaveBeenCalledWith({ error: 'Only accepted quotes can be converted to invoices' });
    });

    it('should return 500 for unexpected errors', async () => {
      mockRequest.body = validInvoiceData;
      mockInvoiceService.createInvoice.mockRejectedValue(new Error('Database connection failed'));

      await invoiceController.createInvoice(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockJson).toHaveBeenCalledWith({ error: 'Database connection failed' });
    });
  });

  describe('createInvoiceFromQuote', () => {
    const validQuoteData = {
      quoteId: 'quote-123',
      dueDate: '2024-01-31',
      depositRequired: '565',
      terms: 'Net 30',
      notes: 'Invoice from quote'
    };

    it('should create invoice from quote successfully', async () => {
      mockRequest.body = validQuoteData;
      mockInvoiceService.createInvoiceFromQuote.mockResolvedValue(mockInvoice as any);

      await invoiceController.createInvoiceFromQuote(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockInvoiceService.createInvoiceFromQuote).toHaveBeenCalledWith(
        'quote-123',
        'org-123',
        expect.objectContaining({
          userId: 'user-123',
          ipAddress: '127.0.0.1',
          userAgent: 'test-agent'
        }),
        expect.objectContaining({
          dueDate: new Date('2024-01-31'),
          depositRequired: 565,
          terms: 'Net 30',
          notes: 'Invoice from quote'
        })
      );

      expect(mockStatus).toHaveBeenCalledWith(201);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Invoice created from quote successfully',
          invoice: expect.objectContaining({
            id: 'invoice-123',
            invoiceNumber: 'INV-001'
          })
        })
      );
    });

    it('should return 404 when quote not found', async () => {
      mockRequest.body = validQuoteData;
      mockInvoiceService.createInvoiceFromQuote.mockRejectedValue(new Error('Quote not found'));

      await invoiceController.createInvoiceFromQuote(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(404);
      expect(mockJson).toHaveBeenCalledWith({ error: 'Quote not found' });
    });

    it('should return 409 when quote is not accepted', async () => {
      mockRequest.body = validQuoteData;
      mockInvoiceService.createInvoiceFromQuote.mockRejectedValue(new Error('Only accepted quotes can be converted to invoices'));

      await invoiceController.createInvoiceFromQuote(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(409);
      expect(mockJson).toHaveBeenCalledWith({ error: 'Only accepted quotes can be converted to invoices' });
    });
  });

  describe('getInvoice', () => {
    it('should get invoice successfully', async () => {
      mockInvoiceService.getInvoice.mockResolvedValue(mockInvoice as any);

      await invoiceController.getInvoice(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockInvoiceService.getInvoice).toHaveBeenCalledWith(
        'invoice-123',
        'org-123',
        expect.objectContaining({
          userId: 'user-123',
          ipAddress: '127.0.0.1',
          userAgent: 'test-agent'
        })
      );

      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          invoice: expect.objectContaining({
            id: 'invoice-123',
            invoiceNumber: 'INV-001',
            status: InvoiceStatus.DRAFT
          })
        })
      );
    });

    it('should return 404 when invoice not found', async () => {
      mockInvoiceService.getInvoice.mockResolvedValue(null);

      await invoiceController.getInvoice(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(404);
      expect(mockJson).toHaveBeenCalledWith({ error: 'Invoice not found' });
    });

    it('should return 401 when user is not authenticated', async () => {
      mockRequest.user = undefined;

      await invoiceController.getInvoice(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(401);
      expect(mockJson).toHaveBeenCalledWith({ error: 'Authentication required' });
    });

    it('should return 500 for service errors', async () => {
      mockInvoiceService.getInvoice.mockRejectedValue(new Error('Database error'));

      await invoiceController.getInvoice(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockJson).toHaveBeenCalledWith({ error: 'Database error' });
    });
  });

  describe('updateInvoice', () => {
    const updateData = {
      dueDate: '2024-02-15',
      depositRequired: '600',
      terms: 'Net 15',
      notes: 'Updated notes'
    };

    it('should update invoice successfully', async () => {
      mockRequest.body = updateData;
      const updatedInvoice = { ...mockInvoice, terms: 'Net 15', notes: 'Updated notes' };
      mockInvoiceService.updateInvoice.mockResolvedValue(updatedInvoice as any);

      await invoiceController.updateInvoice(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockInvoiceService.updateInvoice).toHaveBeenCalledWith(
        'invoice-123',
        expect.objectContaining({
          dueDate: new Date('2024-02-15'),
          depositRequired: new Decimal(600),
          terms: 'Net 15',
          notes: 'Updated notes'
        }),
        'org-123',
        expect.objectContaining({
          userId: 'user-123',
          ipAddress: '127.0.0.1',
          userAgent: 'test-agent'
        })
      );

      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Invoice updated successfully',
          invoice: expect.objectContaining({
            id: 'invoice-123',
            terms: 'Net 15',
            notes: 'Updated notes'
          })
        })
      );
    });

    it('should return 404 when invoice not found', async () => {
      mockRequest.body = updateData;
      mockInvoiceService.updateInvoice.mockRejectedValue(new Error('Invoice not found'));

      await invoiceController.updateInvoice(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(404);
      expect(mockJson).toHaveBeenCalledWith({ error: 'Invoice not found' });
    });

    it('should return 409 for draft-only restriction', async () => {
      mockRequest.body = updateData;
      mockInvoiceService.updateInvoice.mockRejectedValue(new Error('Only draft invoices can be modified'));

      await invoiceController.updateInvoice(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(409);
      expect(mockJson).toHaveBeenCalledWith({ error: 'Only draft invoices can be modified' });
    });
  });

  describe('listInvoices', () => {
    const mockInvoices = [mockInvoice];
    const mockResult = {
      invoices: mockInvoices,
      total: 1
    };

    it('should list invoices successfully', async () => {
      mockRequest.query = {
        customerId: 'customer-123',
        status: InvoiceStatus.DRAFT,
        limit: '10',
        offset: '0'
      };
      mockInvoiceService.listInvoices.mockResolvedValue(mockResult as any);

      await invoiceController.listInvoices(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockInvoiceService.listInvoices).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: 'customer-123',
          status: InvoiceStatus.DRAFT,
          limit: 10,
          offset: 0
        }),
        'org-123'
      );

      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          invoices: expect.arrayContaining([
            expect.objectContaining({
              id: 'invoice-123',
              invoiceNumber: 'INV-001'
            })
          ]),
          pagination: expect.objectContaining({
            total: 1,
            limit: 10,
            offset: 0
          })
        })
      );
    });

    it('should handle boolean query parameters', async () => {
      mockRequest.query = {
        isPastDue: 'true',
        hasBalance: 'false'
      };
      mockInvoiceService.listInvoices.mockResolvedValue(mockResult as any);

      await invoiceController.listInvoices(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockInvoiceService.listInvoices).toHaveBeenCalledWith(
        expect.objectContaining({
          isPastDue: true,
          hasBalance: false
        }),
        'org-123'
      );
    });

    it('should use default pagination when not specified', async () => {
      mockInvoiceService.listInvoices.mockResolvedValue(mockResult as any);

      await invoiceController.listInvoices(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          pagination: expect.objectContaining({
            total: 1,
            limit: 50,
            offset: 0
          })
        })
      );
    });
  });

  describe('sendInvoice', () => {
    it('should send invoice successfully', async () => {
      const sentInvoice = { ...mockInvoice, status: InvoiceStatus.SENT, sentAt: new Date() };
      mockInvoiceService.sendInvoice.mockResolvedValue(sentInvoice as any);

      await invoiceController.sendInvoice(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockInvoiceService.sendInvoice).toHaveBeenCalledWith(
        'invoice-123',
        'org-123',
        expect.objectContaining({
          userId: 'user-123',
          ipAddress: '127.0.0.1',
          userAgent: 'test-agent'
        })
      );

      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Invoice sent successfully',
          invoice: expect.objectContaining({
            id: 'invoice-123',
            status: InvoiceStatus.SENT
          })
        })
      );
    });

    it('should return 404 when invoice not found', async () => {
      mockInvoiceService.sendInvoice.mockRejectedValue(new Error('Invoice not found'));

      await invoiceController.sendInvoice(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(404);
      expect(mockJson).toHaveBeenCalledWith({ error: 'Invoice not found' });
    });

    it('should return 409 for draft-only restriction', async () => {
      mockInvoiceService.sendInvoice.mockRejectedValue(new Error('Only draft invoices can be sent'));

      await invoiceController.sendInvoice(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(409);
      expect(mockJson).toHaveBeenCalledWith({ error: 'Only draft invoices can be sent' });
    });
  });

  describe('markInvoiceAsViewed', () => {
    it('should mark invoice as viewed successfully', async () => {
      const viewedInvoice = { ...mockInvoice, viewedAt: new Date() };
      mockInvoiceService.markInvoiceAsViewed.mockResolvedValue(viewedInvoice as any);

      await invoiceController.markInvoiceAsViewed(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockInvoiceService.markInvoiceAsViewed).toHaveBeenCalledWith(
        'invoice-123',
        'org-123',
        expect.objectContaining({
          userId: 'user-123',
          ipAddress: '127.0.0.1',
          userAgent: 'test-agent'
        })
      );

      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Invoice marked as viewed',
          invoice: expect.objectContaining({
            id: 'invoice-123',
            viewedAt: expect.any(Date)
          })
        })
      );
    });

    it('should return 404 when invoice not found', async () => {
      mockInvoiceService.markInvoiceAsViewed.mockRejectedValue(new Error('Invoice not found'));

      await invoiceController.markInvoiceAsViewed(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(404);
      expect(mockJson).toHaveBeenCalledWith({ error: 'Invoice not found' });
    });
  });

  describe('cancelInvoice', () => {
    it('should cancel invoice successfully', async () => {
      mockRequest.body = { cancellationReason: 'Customer request' };
      const cancelledInvoice = {
        ...mockInvoice,
        status: InvoiceStatus.CANCELLED,
        notes: 'Cancelled: Customer request'
      };
      mockInvoiceService.cancelInvoice.mockResolvedValue(cancelledInvoice as any);

      await invoiceController.cancelInvoice(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockInvoiceService.cancelInvoice).toHaveBeenCalledWith(
        'invoice-123',
        'org-123',
        expect.objectContaining({
          userId: 'user-123',
          ipAddress: '127.0.0.1',
          userAgent: 'test-agent'
        }),
        'Customer request'
      );

      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Invoice cancelled successfully',
          invoice: expect.objectContaining({
            id: 'invoice-123',
            status: InvoiceStatus.CANCELLED
          })
        })
      );
    });

    it('should return 409 when invoice cannot be cancelled', async () => {
      mockRequest.body = { cancellationReason: 'Test reason' };
      mockInvoiceService.cancelInvoice.mockRejectedValue(new Error('Cannot cancel paid invoices'));

      await invoiceController.cancelInvoice(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(409);
      expect(mockJson).toHaveBeenCalledWith({ error: 'Cannot cancel paid invoices' });
    });
  });

  describe('recordPayment', () => {
    it('should record payment successfully', async () => {
      mockRequest.body = { paymentAmount: '565' };
      const paidInvoice = {
        ...mockInvoice,
        status: InvoiceStatus.PARTIALLY_PAID,
        amountPaid: new Decimal(565),
        balance: new Decimal(565),
        paidAt: new Date()
      };
      mockInvoiceService.recordPayment.mockResolvedValue(paidInvoice as any);

      await invoiceController.recordPayment(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockInvoiceService.recordPayment).toHaveBeenCalledWith(
        'invoice-123',
        565,
        'org-123',
        expect.objectContaining({
          userId: 'user-123',
          ipAddress: '127.0.0.1',
          userAgent: 'test-agent'
        })
      );

      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Payment recorded successfully',
          invoice: expect.objectContaining({
            id: 'invoice-123',
            status: InvoiceStatus.PARTIALLY_PAID
          })
        })
      );
    });

    it('should return 409 when payment amount exceeds balance', async () => {
      mockRequest.body = { paymentAmount: '2000' };
      mockInvoiceService.recordPayment.mockRejectedValue(new Error('Payment amount exceeds remaining balance'));

      await invoiceController.recordPayment(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(409);
      expect(mockJson).toHaveBeenCalledWith({ error: 'Payment amount exceeds remaining balance' });
    });

    it('should return 409 when cannot record payment on cancelled invoice', async () => {
      mockRequest.body = { paymentAmount: '100' };
      mockInvoiceService.recordPayment.mockRejectedValue(new Error('Cannot record payment on cancelled invoice'));

      await invoiceController.recordPayment(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(409);
      expect(mockJson).toHaveBeenCalledWith({ error: 'Cannot record payment on cancelled invoice' });
    });
  });

  describe('getInvoiceStats', () => {
    const mockStats = {
      totalInvoices: 10,
      totalAmount: new Decimal(15000),
      paidAmount: new Decimal(12000),
      outstandingAmount: new Decimal(3000),
      averageInvoiceAmount: new Decimal(1500),
      overdueInvoices: 2,
      overdueAmount: new Decimal(2000)
    };

    it('should get invoice stats successfully', async () => {
      mockInvoiceService.getInvoiceStats.mockResolvedValue(mockStats as any);

      await invoiceController.getInvoiceStats(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockInvoiceService.getInvoiceStats).toHaveBeenCalledWith(
        'org-123',
        undefined
      );

      expect(mockJson).toHaveBeenCalledWith({ stats: mockStats });
    });

    it('should get invoice stats for specific customer', async () => {
      mockRequest.query = { customerId: 'customer-123' };
      mockInvoiceService.getInvoiceStats.mockResolvedValue(mockStats as any);

      await invoiceController.getInvoiceStats(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockInvoiceService.getInvoiceStats).toHaveBeenCalledWith(
        'org-123',
        'customer-123'
      );

      expect(mockJson).toHaveBeenCalledWith({ stats: mockStats });
    });

    it('should return 401 when user is not authenticated', async () => {
      mockRequest.user = undefined;

      await invoiceController.getInvoiceStats(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(401);
      expect(mockJson).toHaveBeenCalledWith({ error: 'Authentication required' });
    });

    it('should return 500 for service errors', async () => {
      mockInvoiceService.getInvoiceStats.mockRejectedValue(new Error('Database error'));

      await invoiceController.getInvoiceStats(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockJson).toHaveBeenCalledWith({ error: 'Database error' });
    });
  });
});