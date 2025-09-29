// Mock dependencies before imports
jest.mock('../../src/services/quote.service', () => ({
  quoteService: {
    createQuote: jest.fn(),
    getQuote: jest.fn(),
    updateQuote: jest.fn(),
    listQuotes: jest.fn(),
    sendQuote: jest.fn(),
    deleteQuote: jest.fn(),
    duplicateQuote: jest.fn(),
    getQuoteStats: jest.fn(),
    acceptQuote: jest.fn(),
    rejectQuote: jest.fn(),
    markQuoteAsViewed: jest.fn(),
    convertToInvoice: jest.fn()
  }
}));

jest.mock('../../src/services/audit.service', () => ({
  auditService: {
    logAction: jest.fn(),
    logView: jest.fn()
  }
}));

jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

import { Request, Response } from 'express';
import { quoteController } from '../../src/controllers/quote.controller';
import { quoteService } from '../../src/services/quote.service';
import { QuoteStatus } from '../../src/types/enums';
import { AuthenticatedRequest } from '../../src/middleware/auth.middleware';
import { Decimal } from 'decimal.js';

// Mock Express Request and Response
const mockRequest = (overrides = {}) => ({
  body: {},
  params: {},
  query: {},
  headers: {
    'user-agent': 'test-user-agent'
  },
  user: {
    id: 'user-123',
    organizationId: 'org-123',
    role: 'BOOKKEEPER'
  },
  ip: '192.168.1.100',
  ...overrides
}) as unknown as AuthenticatedRequest;

const mockResponse = () => {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

// Mock validation result
const mockValidationResult = (hasErrors = false, errors: any[] = []) => {
  const validationResult = require('express-validator').validationResult;
  validationResult.mockReturnValue({
    isEmpty: () => !hasErrors,
    array: () => errors
  });
};

jest.mock('express-validator', () => ({
  validationResult: jest.fn(),
  body: jest.fn(() => ({
    notEmpty: jest.fn(() => ({
      withMessage: jest.fn(() => ({
        trim: jest.fn(() => ({}))
      }))
    })),
    optional: jest.fn(() => ({
      isISO8601: jest.fn(() => ({})),
      trim: jest.fn(() => ({})),
      isFloat: jest.fn(() => ({
        withMessage: jest.fn(() => ({}))
      }))
    })),
    isArray: jest.fn(() => ({
      withMessage: jest.fn(() => ({}))
    })),
    isIn: jest.fn(() => ({}))
  })),
  query: jest.fn(() => ({
    optional: jest.fn(() => ({
      isString: jest.fn(() => ({})),
      isIn: jest.fn(() => ({})),
      trim: jest.fn(() => ({})),
      isISO8601: jest.fn(() => ({})),
      isInt: jest.fn(() => ({}))
    }))
  }))
}));

describe('Quote Controller', () => {
  let mockQuoteService: jest.Mocked<typeof quoteService>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockQuoteService = quoteService as jest.Mocked<typeof quoteService>;
    mockValidationResult(false); // Default to no validation errors
  });

  describe('createQuote', () => {
    const validQuoteData = {
      customerId: 'customer-123',
      description: 'Website development project',
      validUntil: '2024-02-15',
      terms: '25% deposit required, 15-day payment terms',
      items: [
        {
          description: 'Frontend development',
          quantity: 40,
          unitPrice: 125.00,
          taxRate: 13.0
        },
        {
          description: 'Backend API development',
          quantity: 30,
          unitPrice: 150.00,
          taxRate: 13.0,
          discountPercent: 10.0
        }
      ]
    };

    const mockQuote = {
      id: 'quote-123',
      quoteNumber: 'QUO-2024-001',
      description: 'Website development project',
      status: QuoteStatus.DRAFT,
      subtotal: new Decimal(9500.00),
      taxAmount: new Decimal(1235.00),
      total: new Decimal(10735.00),
      validUntil: new Date('2024-02-15'),
      createdAt: new Date(),
      customer: {
        id: 'customer-123',
        name: 'Tech Corp Inc.',
        email: 'contact@techcorp.com'
      },
      items: [
        {
          id: 'item-1',
          description: 'Frontend development',
          quantity: new Decimal(40),
          unitPrice: new Decimal(125.00),
          taxRate: new Decimal(13.0),
          subtotal: new Decimal(5000.00),
          taxAmount: new Decimal(650.00),
          total: new Decimal(5650.00)
        },
        {
          id: 'item-2',
          description: 'Backend API development',
          quantity: new Decimal(30),
          unitPrice: new Decimal(150.00),
          taxRate: new Decimal(13.0),
          discountPercent: new Decimal(10.0),
          subtotal: new Decimal(4500.00),
          discountAmount: new Decimal(450.00),
          taxAmount: new Decimal(526.50),
          total: new Decimal(4576.50)
        }
      ]
    };

    it('should successfully create a quote', async () => {
      const req = mockRequest({
        body: validQuoteData
      });
      const res = mockResponse();

      mockQuoteService.createQuote.mockResolvedValue(mockQuote as any);

      await quoteController.createQuote(req, res);

      expect(mockQuoteService.createQuote).toHaveBeenCalledWith(
        validQuoteData,
        'org-123',
        {
          userId: 'user-123',
          ipAddress: '192.168.1.100',
          userAgent: 'test-user-agent'
        }
      );

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Quote created successfully',
        quote: {
          id: 'quote-123',
          quoteNumber: 'QUO-2024-001',
          description: 'Website development project',
          status: QuoteStatus.DRAFT,
          subtotal: mockQuote.subtotal,
          taxAmount: mockQuote.taxAmount,
          total: mockQuote.total,
          validUntil: mockQuote.validUntil,
          createdAt: mockQuote.createdAt,
          customer: mockQuote.customer,
          items: mockQuote.items
        }
      });
    });

    it('should handle validation errors', async () => {
      const req = mockRequest({
        body: {
          // Missing required fields
          description: 'Test quote'
        }
      });
      const res = mockResponse();

      mockValidationResult(true, [
        { msg: 'Customer ID is required', param: 'customerId' },
        { msg: 'At least one item is required', param: 'items' }
      ]);

      await quoteController.createQuote(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        errors: [
          { msg: 'Customer ID is required', param: 'customerId' },
          { msg: 'At least one item is required', param: 'items' }
        ]
      });

      expect(mockQuoteService.createQuote).not.toHaveBeenCalled();
    });

    it('should handle customer not found error', async () => {
      const req = mockRequest({
        body: validQuoteData
      });
      const res = mockResponse();

      mockQuoteService.createQuote.mockRejectedValue(
        new Error('Customer not found')
      );

      await quoteController.createQuote(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Customer not found'
      });
    });

    it('should handle authentication required', async () => {
      const req = mockRequest({
        body: validQuoteData,
        user: null // No authentication
      });
      const res = mockResponse();

      await quoteController.createQuote(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Authentication required'
      });

      expect(mockQuoteService.createQuote).not.toHaveBeenCalled();
    });

    it('should handle multi-tenant isolation', async () => {
      const req = mockRequest({
        body: validQuoteData,
        user: {
          id: 'user-456',
          organizationId: 'org-456',
          role: 'BOOKKEEPER'
        }
      });
      const res = mockResponse();

      const orgQuote = {
        ...mockQuote,
        organizationId: 'org-456'
      };

      mockQuoteService.createQuote.mockResolvedValue(orgQuote as any);

      await quoteController.createQuote(req, res);

      expect(mockQuoteService.createQuote).toHaveBeenCalledWith(
        validQuoteData,
        'org-456',
        expect.objectContaining({
          userId: 'user-456'
        })
      );

      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('should create quote with complex line items and calculations', async () => {
      const complexQuoteData = {
        ...validQuoteData,
        items: [
          {
            description: 'Premium web design',
            quantity: 1,
            unitPrice: 2500.00,
            taxRate: 13.0,
            discountPercent: 5.0
          },
          {
            description: 'E-commerce integration',
            quantity: 1,
            unitPrice: 1800.00,
            taxRate: 13.0
          },
          {
            description: 'SEO optimization',
            quantity: 6,
            unitPrice: 200.00,
            taxRate: 13.0,
            discountPercent: 15.0
          }
        ]
      };

      const req = mockRequest({
        body: complexQuoteData
      });
      const res = mockResponse();

      const complexQuote = {
        ...mockQuote,
        subtotal: new Decimal(5395.00),
        taxAmount: new Decimal(701.35),
        total: new Decimal(6096.35)
      };

      mockQuoteService.createQuote.mockResolvedValue(complexQuote as any);

      await quoteController.createQuote(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Quote created successfully',
          quote: expect.objectContaining({
            subtotal: new Decimal(5395.00),
            taxAmount: new Decimal(701.35),
            total: new Decimal(6096.35)
          })
        })
      );
    });
  });

  describe('getQuote', () => {
    const mockQuote = {
      id: 'quote-123',
      quoteNumber: 'QUO-2024-001',
      description: 'Website development project',
      status: QuoteStatus.SENT,
      subtotal: new Decimal(9500.00),
      taxAmount: new Decimal(1235.00),
      total: new Decimal(10735.00),
      validUntil: new Date('2024-02-15'),
      notes: 'Customer requested modern design',
      terms: '25% deposit required',
      sentAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      customer: {
        id: 'customer-123',
        name: 'Tech Corp Inc.',
        email: 'contact@techcorp.com'
      },
      items: []
    };

    it('should successfully retrieve a quote', async () => {
      const req = mockRequest({
        params: { id: 'quote-123' }
      });
      const res = mockResponse();

      mockQuoteService.getQuote.mockResolvedValue(mockQuote as any);

      await quoteController.getQuote(req, res);

      expect(mockQuoteService.getQuote).toHaveBeenCalledWith(
        'quote-123',
        'org-123',
        {
          userId: 'user-123',
          ipAddress: '192.168.1.100',
          userAgent: 'test-user-agent'
        }
      );

      expect(res.json).toHaveBeenCalledWith({
        quote: {
          id: 'quote-123',
          quoteNumber: 'QUO-2024-001',
          description: 'Website development project',
          status: QuoteStatus.SENT,
          subtotal: mockQuote.subtotal,
          taxAmount: mockQuote.taxAmount,
          total: mockQuote.total,
          validUntil: mockQuote.validUntil,
          notes: mockQuote.notes,
          terms: mockQuote.terms,
          sentAt: mockQuote.sentAt,
          createdAt: mockQuote.createdAt,
          updatedAt: mockQuote.updatedAt,
          customer: mockQuote.customer,
          items: mockQuote.items
        }
      });
    });

    it('should handle quote not found', async () => {
      const req = mockRequest({
        params: { id: 'nonexistent-quote' }
      });
      const res = mockResponse();

      mockQuoteService.getQuote.mockResolvedValue(null);

      await quoteController.getQuote(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Quote not found'
      });
    });

    it('should handle authentication required', async () => {
      const req = mockRequest({
        params: { id: 'quote-123' },
        user: null
      });
      const res = mockResponse();

      await quoteController.getQuote(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Authentication required'
      });
    });

    it('should handle service errors', async () => {
      const req = mockRequest({
        params: { id: 'quote-123' }
      });
      const res = mockResponse();

      mockQuoteService.getQuote.mockRejectedValue(
        new Error('Database connection failed')
      );

      await quoteController.getQuote(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Database connection failed'
      });
    });
  });

  describe('updateQuote', () => {
    const updateData = {
      description: 'Updated website development project',
      notes: 'Additional requirements discussed',
      items: [
        {
          description: 'Updated frontend development',
          quantity: 45,
          unitPrice: 130.00,
          taxRate: 13.0
        }
      ]
    };

    const mockUpdatedQuote = {
      id: 'quote-123',
      quoteNumber: 'QUO-2024-001',
      description: 'Updated website development project',
      status: QuoteStatus.DRAFT,
      subtotal: new Decimal(5850.00),
      taxAmount: new Decimal(760.50),
      total: new Decimal(6610.50),
      validUntil: new Date('2024-02-15'),
      notes: 'Additional requirements discussed',
      terms: '25% deposit required',
      updatedAt: new Date(),
      items: []
    };

    it('should successfully update a quote', async () => {
      const req = mockRequest({
        params: { id: 'quote-123' },
        body: updateData
      });
      const res = mockResponse();

      mockQuoteService.updateQuote.mockResolvedValue(mockUpdatedQuote as any);

      await quoteController.updateQuote(req, res);

      expect(mockQuoteService.updateQuote).toHaveBeenCalledWith(
        'quote-123',
        updateData,
        'org-123',
        {
          userId: 'user-123',
          ipAddress: '192.168.1.100',
          userAgent: 'test-user-agent'
        }
      );

      expect(res.json).toHaveBeenCalledWith({
        message: 'Quote updated successfully',
        quote: {
          id: 'quote-123',
          quoteNumber: 'QUO-2024-001',
          description: 'Updated website development project',
          status: QuoteStatus.DRAFT,
          subtotal: mockUpdatedQuote.subtotal,
          taxAmount: mockUpdatedQuote.taxAmount,
          total: mockUpdatedQuote.total,
          validUntil: mockUpdatedQuote.validUntil,
          notes: mockUpdatedQuote.notes,
          terms: mockUpdatedQuote.terms,
          updatedAt: mockUpdatedQuote.updatedAt,
          items: mockUpdatedQuote.items
        }
      });
    });

    it('should handle quote not found for update', async () => {
      const req = mockRequest({
        params: { id: 'nonexistent-quote' },
        body: updateData
      });
      const res = mockResponse();

      mockQuoteService.updateQuote.mockRejectedValue(
        new Error('Quote not found')
      );

      await quoteController.updateQuote(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Quote not found'
      });
    });

    it('should handle cannot update quote business rule', async () => {
      const req = mockRequest({
        params: { id: 'quote-123' },
        body: updateData
      });
      const res = mockResponse();

      mockQuoteService.updateQuote.mockRejectedValue(
        new Error('Cannot update quote in ACCEPTED status')
      );

      await quoteController.updateQuote(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Cannot update quote in ACCEPTED status'
      });
    });

    it('should handle validation errors for update', async () => {
      const req = mockRequest({
        params: { id: 'quote-123' },
        body: {
          description: '', // Empty description
          validUntil: 'invalid-date'
        }
      });
      const res = mockResponse();

      mockValidationResult(true, [
        { msg: 'Description cannot be empty', param: 'description' },
        { msg: 'Valid until must be a valid date', param: 'validUntil' }
      ]);

      await quoteController.updateQuote(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        errors: [
          { msg: 'Description cannot be empty', param: 'description' },
          { msg: 'Valid until must be a valid date', param: 'validUntil' }
        ]
      });

      expect(mockQuoteService.updateQuote).not.toHaveBeenCalled();
    });
  });

  describe('listQuotes', () => {
    const mockQuotesList = {
      quotes: [
        {
          id: 'quote-1',
          quoteNumber: 'QUO-2024-001',
          description: 'Website development',
          status: QuoteStatus.SENT,
          subtotal: new Decimal(5000.00),
          taxAmount: new Decimal(650.00),
          total: new Decimal(5650.00),
          validUntil: new Date('2024-02-15'),
          createdAt: new Date(),
          customer: {
            id: 'customer-123',
            name: 'Tech Corp Inc.'
          },
          items: [{ id: 'item-1' }, { id: 'item-2' }]
        },
        {
          id: 'quote-2',
          quoteNumber: 'QUO-2024-002',
          description: 'Mobile app development',
          status: QuoteStatus.DRAFT,
          subtotal: new Decimal(8000.00),
          taxAmount: new Decimal(1040.00),
          total: new Decimal(9040.00),
          validUntil: new Date('2024-02-20'),
          createdAt: new Date(),
          customer: {
            id: 'customer-456',
            name: 'StartupCo'
          },
          items: [{ id: 'item-3' }]
        }
      ],
      total: 2
    };

    it('should successfully list quotes with default parameters', async () => {
      const req = mockRequest({
        query: {}
      });
      const res = mockResponse();

      mockQuoteService.listQuotes.mockResolvedValue(mockQuotesList as any);

      await quoteController.listQuotes(req, res);

      expect(mockQuoteService.listQuotes).toHaveBeenCalledWith(
        {
          customerId: undefined,
          status: undefined,
          search: undefined,
          validFrom: undefined,
          validTo: undefined,
          limit: undefined,
          offset: undefined
        },
        'org-123'
      );

      expect(res.json).toHaveBeenCalledWith({
        quotes: [
          {
            id: 'quote-1',
            quoteNumber: 'QUO-2024-001',
            description: 'Website development',
            status: QuoteStatus.SENT,
            subtotal: new Decimal(5000.00),
            taxAmount: new Decimal(650.00),
            total: new Decimal(5650.00),
            validUntil: mockQuotesList.quotes[0].validUntil,
            createdAt: mockQuotesList.quotes[0].createdAt,
            customer: mockQuotesList.quotes[0].customer,
            itemCount: 2
          },
          {
            id: 'quote-2',
            quoteNumber: 'QUO-2024-002',
            description: 'Mobile app development',
            status: QuoteStatus.DRAFT,
            subtotal: new Decimal(8000.00),
            taxAmount: new Decimal(1040.00),
            total: new Decimal(9040.00),
            validUntil: mockQuotesList.quotes[1].validUntil,
            createdAt: mockQuotesList.quotes[1].createdAt,
            customer: mockQuotesList.quotes[1].customer,
            itemCount: 1
          }
        ],
        pagination: {
          total: 2,
          limit: 50,
          offset: 0
        }
      });
    });

    it('should list quotes with filters and pagination', async () => {
      const req = mockRequest({
        query: {
          customerId: 'customer-123',
          status: QuoteStatus.SENT,
          search: 'website',
          validFrom: '2024-01-01',
          validTo: '2024-03-01',
          limit: '10',
          offset: '20'
        }
      });
      const res = mockResponse();

      mockQuoteService.listQuotes.mockResolvedValue(mockQuotesList as any);

      await quoteController.listQuotes(req, res);

      expect(mockQuoteService.listQuotes).toHaveBeenCalledWith(
        {
          customerId: 'customer-123',
          status: QuoteStatus.SENT,
          search: 'website',
          validFrom: '2024-01-01',
          validTo: '2024-03-01',
          limit: 10,
          offset: 20
        },
        'org-123'
      );

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          pagination: {
            total: 2,
            limit: 10,
            offset: 20
          }
        })
      );
    });

    it('should handle validation errors for list quotes', async () => {
      const req = mockRequest({
        query: {
          validFrom: 'invalid-date',
          limit: '150' // Above maximum
        }
      });
      const res = mockResponse();

      mockValidationResult(true, [
        { msg: 'Valid from must be a valid date', param: 'validFrom' },
        { msg: 'Limit must be between 1 and 100', param: 'limit' }
      ]);

      await quoteController.listQuotes(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        errors: [
          { msg: 'Valid from must be a valid date', param: 'validFrom' },
          { msg: 'Limit must be between 1 and 100', param: 'limit' }
        ]
      });

      expect(mockQuoteService.listQuotes).not.toHaveBeenCalled();
    });
  });

  describe('sendQuote', () => {
    const mockSentQuote = {
      id: 'quote-123',
      status: QuoteStatus.SENT,
      sentAt: new Date()
    };

    it('should successfully send a quote', async () => {
      const req = mockRequest({
        params: { id: 'quote-123' }
      });
      const res = mockResponse();

      mockQuoteService.sendQuote.mockResolvedValue(mockSentQuote as any);

      await quoteController.sendQuote(req, res);

      expect(mockQuoteService.sendQuote).toHaveBeenCalledWith(
        'quote-123',
        'org-123',
        {
          userId: 'user-123',
          ipAddress: '192.168.1.100',
          userAgent: 'test-user-agent'
        }
      );

      expect(res.json).toHaveBeenCalledWith({
        message: 'Quote sent successfully',
        quote: {
          id: 'quote-123',
          status: QuoteStatus.SENT,
          sentAt: mockSentQuote.sentAt
        }
      });
    });

    it('should handle quote not found for sending', async () => {
      const req = mockRequest({
        params: { id: 'nonexistent-quote' }
      });
      const res = mockResponse();

      mockQuoteService.sendQuote.mockRejectedValue(
        new Error('Quote not found')
      );

      await quoteController.sendQuote(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Quote not found'
      });
    });

    it('should handle only draft quotes can be sent business rule', async () => {
      const req = mockRequest({
        params: { id: 'quote-123' }
      });
      const res = mockResponse();

      mockQuoteService.sendQuote.mockRejectedValue(
        new Error('Only draft quotes can be sent')
      );

      await quoteController.sendQuote(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Only draft quotes can be sent'
      });
    });
  });

  describe('acceptQuote', () => {
    const mockAcceptResult = {
      quote: {
        id: 'quote-123',
        status: QuoteStatus.ACCEPTED,
        acceptedAt: new Date(),
        notes: 'Quote accepted by customer'
      },
      invoice: {
        id: 'invoice-123',
        invoiceNumber: 'INV-2024-001',
        status: 'PENDING',
        total: new Decimal(10735.00),
        depositRequired: new Decimal(2683.75), // 25%
        balance: new Decimal(8051.25),
        dueDate: new Date('2024-02-01'),
        createdAt: new Date()
      }
    };

    it('should successfully accept quote with auto-generated invoice', async () => {
      const req = mockRequest({
        params: { id: 'quote-123' },
        body: {
          acceptanceNotes: 'Ready to proceed with project',
          autoGenerateInvoice: true
        }
      });
      const res = mockResponse();

      mockQuoteService.acceptQuote.mockResolvedValue(mockAcceptResult as any);

      await quoteController.acceptQuote(req, res);

      expect(mockQuoteService.acceptQuote).toHaveBeenCalledWith(
        'quote-123',
        'org-123',
        {
          userId: 'user-123',
          ipAddress: '192.168.1.100',
          userAgent: 'test-user-agent'
        },
        'Ready to proceed with project',
        true
      );

      expect(res.json).toHaveBeenCalledWith({
        message: 'Quote accepted successfully. Invoice automatically generated.',
        quote: {
          id: 'quote-123',
          status: QuoteStatus.ACCEPTED,
          acceptedAt: mockAcceptResult.quote.acceptedAt,
          notes: 'Quote accepted by customer'
        },
        invoice: {
          id: 'invoice-123',
          invoiceNumber: 'INV-2024-001',
          status: 'PENDING',
          total: new Decimal(10735.00),
          depositRequired: new Decimal(2683.75),
          balance: new Decimal(8051.25),
          dueDate: mockAcceptResult.invoice.dueDate,
          createdAt: mockAcceptResult.invoice.createdAt
        }
      });
    });

    it('should successfully accept quote without auto-generating invoice', async () => {
      const req = mockRequest({
        params: { id: 'quote-123' },
        body: {
          acceptanceNotes: 'Will generate invoice manually',
          autoGenerateInvoice: false
        }
      });
      const res = mockResponse();

      const acceptResultNoInvoice = {
        quote: mockAcceptResult.quote
        // No invoice property
      };

      mockQuoteService.acceptQuote.mockResolvedValue(acceptResultNoInvoice as any);

      await quoteController.acceptQuote(req, res);

      expect(mockQuoteService.acceptQuote).toHaveBeenCalledWith(
        'quote-123',
        'org-123',
        expect.any(Object),
        'Will generate invoice manually',
        false
      );

      expect(res.json).toHaveBeenCalledWith({
        message: 'Quote accepted successfully',
        quote: {
          id: 'quote-123',
          status: QuoteStatus.ACCEPTED,
          acceptedAt: mockAcceptResult.quote.acceptedAt,
          notes: 'Quote accepted by customer'
        }
      });
    });

    it('should handle quote not found for acceptance', async () => {
      const req = mockRequest({
        params: { id: 'nonexistent-quote' },
        body: { acceptanceNotes: 'Test acceptance' }
      });
      const res = mockResponse();

      mockQuoteService.acceptQuote.mockRejectedValue(
        new Error('Quote not found')
      );

      await quoteController.acceptQuote(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Quote not found'
      });
    });

    it('should handle only sent or viewed quotes can be accepted', async () => {
      const req = mockRequest({
        params: { id: 'quote-123' },
        body: { acceptanceNotes: 'Test acceptance' }
      });
      const res = mockResponse();

      mockQuoteService.acceptQuote.mockRejectedValue(
        new Error('Only sent or viewed quotes can be accepted')
      );

      await quoteController.acceptQuote(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Only sent or viewed quotes can be accepted'
      });
    });

    it('should handle expired quote', async () => {
      const req = mockRequest({
        params: { id: 'quote-123' },
        body: { acceptanceNotes: 'Test acceptance' }
      });
      const res = mockResponse();

      mockQuoteService.acceptQuote.mockRejectedValue(
        new Error('Quote has expired and cannot be accepted')
      );

      await quoteController.acceptQuote(req, res);

      expect(res.status).toHaveBeenCalledWith(410);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Quote has expired and cannot be accepted'
      });
    });
  });

  describe('rejectQuote', () => {
    const mockRejectedQuote = {
      id: 'quote-123',
      status: QuoteStatus.REJECTED,
      rejectedAt: new Date(),
      notes: 'Budget constraints - customer rejected'
    };

    it('should successfully reject a quote', async () => {
      const req = mockRequest({
        params: { id: 'quote-123' },
        body: {
          rejectionReason: 'Budget constraints'
        }
      });
      const res = mockResponse();

      mockQuoteService.rejectQuote.mockResolvedValue(mockRejectedQuote as any);

      await quoteController.rejectQuote(req, res);

      expect(mockQuoteService.rejectQuote).toHaveBeenCalledWith(
        'quote-123',
        'org-123',
        {
          userId: 'user-123',
          ipAddress: '192.168.1.100',
          userAgent: 'test-user-agent'
        },
        'Budget constraints'
      );

      expect(res.json).toHaveBeenCalledWith({
        message: 'Quote rejected successfully',
        quote: {
          id: 'quote-123',
          status: QuoteStatus.REJECTED,
          rejectedAt: mockRejectedQuote.rejectedAt,
          notes: 'Budget constraints - customer rejected'
        }
      });
    });

    it('should handle quote not found for rejection', async () => {
      const req = mockRequest({
        params: { id: 'nonexistent-quote' },
        body: { rejectionReason: 'Test rejection' }
      });
      const res = mockResponse();

      mockQuoteService.rejectQuote.mockRejectedValue(
        new Error('Quote not found')
      );

      await quoteController.rejectQuote(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Quote not found'
      });
    });

    it('should handle only sent or viewed quotes can be rejected', async () => {
      const req = mockRequest({
        params: { id: 'quote-123' },
        body: { rejectionReason: 'Test rejection' }
      });
      const res = mockResponse();

      mockQuoteService.rejectQuote.mockRejectedValue(
        new Error('Only sent or viewed quotes can be rejected')
      );

      await quoteController.rejectQuote(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Only sent or viewed quotes can be rejected'
      });
    });
  });

  describe('duplicateQuote', () => {
    const mockDuplicatedQuote = {
      id: 'quote-456',
      quoteNumber: 'QUO-2024-003',
      description: 'Website development project (Copy)',
      status: QuoteStatus.DRAFT,
      total: new Decimal(10735.00),
      createdAt: new Date(),
      items: []
    };

    it('should successfully duplicate a quote', async () => {
      const req = mockRequest({
        params: { id: 'quote-123' }
      });
      const res = mockResponse();

      mockQuoteService.duplicateQuote.mockResolvedValue(mockDuplicatedQuote as any);

      await quoteController.duplicateQuote(req, res);

      expect(mockQuoteService.duplicateQuote).toHaveBeenCalledWith(
        'quote-123',
        'org-123',
        {
          userId: 'user-123',
          ipAddress: '192.168.1.100',
          userAgent: 'test-user-agent'
        }
      );

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Quote duplicated successfully',
        quote: {
          id: 'quote-456',
          quoteNumber: 'QUO-2024-003',
          description: 'Website development project (Copy)',
          status: QuoteStatus.DRAFT,
          total: new Decimal(10735.00),
          createdAt: mockDuplicatedQuote.createdAt,
          items: []
        }
      });
    });

    it('should handle quote not found for duplication', async () => {
      const req = mockRequest({
        params: { id: 'nonexistent-quote' }
      });
      const res = mockResponse();

      mockQuoteService.duplicateQuote.mockRejectedValue(
        new Error('Quote not found')
      );

      await quoteController.duplicateQuote(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Quote not found'
      });
    });
  });

  describe('getQuoteStats', () => {
    const mockStats = {
      totalQuotes: 25,
      draftQuotes: 8,
      sentQuotes: 12,
      acceptedQuotes: 4,
      rejectedQuotes: 1,
      totalValue: new Decimal(125000.00),
      averageValue: new Decimal(5000.00),
      acceptanceRate: 33.33,
      conversionRevenue: new Decimal(45000.00)
    };

    it('should successfully get quote statistics', async () => {
      const req = mockRequest({
        query: {}
      });
      const res = mockResponse();

      mockQuoteService.getQuoteStats.mockResolvedValue(mockStats as any);

      await quoteController.getQuoteStats(req, res);

      expect(mockQuoteService.getQuoteStats).toHaveBeenCalledWith(
        'org-123',
        undefined
      );

      expect(res.json).toHaveBeenCalledWith({ stats: mockStats });
    });

    it('should get quote statistics for specific customer', async () => {
      const req = mockRequest({
        query: { customerId: 'customer-123' }
      });
      const res = mockResponse();

      const customerStats = {
        ...mockStats,
        totalQuotes: 5,
        totalValue: new Decimal(25000.00)
      };

      mockQuoteService.getQuoteStats.mockResolvedValue(customerStats as any);

      await quoteController.getQuoteStats(req, res);

      expect(mockQuoteService.getQuoteStats).toHaveBeenCalledWith(
        'org-123',
        'customer-123'
      );

      expect(res.json).toHaveBeenCalledWith({ stats: customerStats });
    });

    it('should handle quote statistics service errors', async () => {
      const req = mockRequest({
        query: {}
      });
      const res = mockResponse();

      mockQuoteService.getQuoteStats.mockRejectedValue(
        new Error('Statistics calculation failed')
      );

      await quoteController.getQuoteStats(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Statistics calculation failed'
      });
    });
  });

  describe('deleteQuote', () => {
    const mockDeletedQuote = {
      id: 'quote-123',
      deletedAt: new Date()
    };

    it('should successfully delete a quote', async () => {
      const req = mockRequest({
        params: { id: 'quote-123' }
      });
      const res = mockResponse();

      mockQuoteService.deleteQuote.mockResolvedValue(mockDeletedQuote as any);

      await quoteController.deleteQuote(req, res);

      expect(mockQuoteService.deleteQuote).toHaveBeenCalledWith(
        'quote-123',
        'org-123',
        {
          userId: 'user-123',
          ipAddress: '192.168.1.100',
          userAgent: 'test-user-agent'
        }
      );

      expect(res.json).toHaveBeenCalledWith({
        message: 'Quote deleted successfully',
        quote: {
          id: 'quote-123',
          deletedAt: mockDeletedQuote.deletedAt
        }
      });
    });

    it('should handle only draft quotes can be deleted', async () => {
      const req = mockRequest({
        params: { id: 'quote-123' }
      });
      const res = mockResponse();

      mockQuoteService.deleteQuote.mockRejectedValue(
        new Error('Only draft quotes can be deleted')
      );

      await quoteController.deleteQuote(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Only draft quotes can be deleted'
      });
    });
  });

  describe('markQuoteAsViewed', () => {
    const mockViewedQuote = {
      id: 'quote-123',
      status: QuoteStatus.VIEWED,
      viewedAt: new Date()
    };

    it('should successfully mark quote as viewed', async () => {
      const req = mockRequest({
        params: { id: 'quote-123' }
      });
      const res = mockResponse();

      mockQuoteService.markQuoteAsViewed.mockResolvedValue(mockViewedQuote as any);

      await quoteController.markQuoteAsViewed(req, res);

      expect(mockQuoteService.markQuoteAsViewed).toHaveBeenCalledWith(
        'quote-123',
        'org-123',
        {
          userId: 'user-123',
          ipAddress: '192.168.1.100',
          userAgent: 'test-user-agent'
        }
      );

      expect(res.json).toHaveBeenCalledWith({
        message: 'Quote marked as viewed',
        quote: {
          id: 'quote-123',
          status: QuoteStatus.VIEWED,
          viewedAt: mockViewedQuote.viewedAt
        }
      });
    });

    it('should handle quote not found for marking as viewed', async () => {
      const req = mockRequest({
        params: { id: 'nonexistent-quote' }
      });
      const res = mockResponse();

      mockQuoteService.markQuoteAsViewed.mockRejectedValue(
        new Error('Quote not found')
      );

      await quoteController.markQuoteAsViewed(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Quote not found'
      });
    });
  });

  describe('convertToInvoice', () => {
    const mockInvoice = {
      id: 'invoice-123',
      invoiceNumber: 'INV-2024-001',
      status: 'PENDING',
      quoteId: 'quote-123',
      total: new Decimal(10735.00),
      dueDate: new Date('2024-02-01')
    };

    it('should successfully convert quote to invoice', async () => {
      const req = mockRequest({
        params: { id: 'quote-123' },
        body: {
          dueDate: '2024-02-01',
          depositRequired: true,
          terms: 'Net 15 payment terms',
          notes: 'Converted from quote QUO-2024-001'
        }
      });
      const res = mockResponse();

      mockQuoteService.convertToInvoice = jest.fn().mockResolvedValue(mockInvoice);

      await quoteController.convertToInvoice(req, res);

      expect(mockQuoteService.convertToInvoice).toHaveBeenCalledWith(
        'quote-123',
        'org-123',
        'user-123',
        {
          dueDate: new Date('2024-02-01'),
          depositRequired: true,
          terms: 'Net 15 payment terms',
          notes: 'Converted from quote QUO-2024-001'
        }
      );

      expect(res.json).toHaveBeenCalledWith({
        message: 'Quote converted to invoice successfully',
        invoice: {
          id: 'invoice-123',
          invoiceNumber: 'INV-2024-001',
          status: 'PENDING',
          quoteId: 'quote-123',
          total: new Decimal(10735.00),
          dueDate: new Date('2024-02-01')
        }
      });
    });

    it('should handle quote not found for conversion', async () => {
      const req = mockRequest({
        params: { id: 'nonexistent-quote' },
        body: {}
      });
      const res = mockResponse();

      mockQuoteService.convertToInvoice = jest.fn().mockRejectedValue(
        new Error('Quote not found')
      );

      await quoteController.convertToInvoice(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Quote not found'
      });
    });

    it('should handle quote must be accepted to convert', async () => {
      const req = mockRequest({
        params: { id: 'quote-123' },
        body: {}
      });
      const res = mockResponse();

      mockQuoteService.convertToInvoice = jest.fn().mockRejectedValue(
        new Error('Quote must be in ACCEPTED status to convert to invoice')
      );

      await quoteController.convertToInvoice(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Quote must be in ACCEPTED status to convert to invoice'
      });
    });

    it('should handle quote already converted error', async () => {
      const req = mockRequest({
        params: { id: 'quote-123' },
        body: {}
      });
      const res = mockResponse();

      mockQuoteService.convertToInvoice = jest.fn().mockRejectedValue(
        new Error('Quote has already been converted to an invoice')
      );

      await quoteController.convertToInvoice(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Quote has already been converted to an invoice'
      });
    });
  });

  describe('Security and Error Handling', () => {
    it('should handle service errors gracefully', async () => {
      const req = mockRequest({
        params: { id: 'quote-123' }
      });
      const res = mockResponse();

      mockQuoteService.getQuote.mockRejectedValue(
        new Error('Database connection failed')
      );

      await quoteController.getQuote(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Database connection failed'
      });
    });

    it('should ensure multi-tenant isolation in all operations', async () => {
      const req = mockRequest({
        user: {
          id: 'user-org2',
          organizationId: 'org-different',
          role: 'BOOKKEEPER'
        },
        params: { id: 'quote-123' }
      });
      const res = mockResponse();

      mockQuoteService.getQuote.mockResolvedValue(null);

      await quoteController.getQuote(req, res);

      expect(mockQuoteService.getQuote).toHaveBeenCalledWith(
        'quote-123',
        'org-different',
        expect.any(Object)
      );

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Quote not found'
      });
    });

    it('should properly include audit context in all operations', async () => {
      const req = mockRequest({
        body: {
          customerId: 'customer-123',
          description: 'Test quote',
          items: []
        },
        ip: '203.0.113.100',
        headers: {
          'user-agent': 'Mozilla/5.0 Test Agent'
        },
        user: {
          id: 'audit-user-123',
          organizationId: 'audit-org-123',
          role: 'BOOKKEEPER'
        }
      });
      const res = mockResponse();

      const mockQuote = {
        id: 'quote-audit-123',
        organizationId: 'audit-org-123'
      };

      mockQuoteService.createQuote.mockResolvedValue(mockQuote as any);

      await quoteController.createQuote(req, res);

      expect(mockQuoteService.createQuote).toHaveBeenCalledWith(
        expect.any(Object),
        'audit-org-123',
        {
          userId: 'audit-user-123',
          ipAddress: '203.0.113.100',
          userAgent: 'Mozilla/5.0 Test Agent'
        }
      );
    });

    it('should handle authentication required for all protected endpoints', async () => {
      const endpoints = [
        { method: 'createQuote', params: { body: {} } },
        { method: 'getQuote', params: { params: { id: 'quote-123' } } },
        { method: 'updateQuote', params: { params: { id: 'quote-123' }, body: {} } },
        { method: 'listQuotes', params: { query: {} } },
        { method: 'sendQuote', params: { params: { id: 'quote-123' } } },
        { method: 'deleteQuote', params: { params: { id: 'quote-123' } } },
        { method: 'duplicateQuote', params: { params: { id: 'quote-123' } } },
        { method: 'getQuoteStats', params: { query: {} } },
        { method: 'acceptQuote', params: { params: { id: 'quote-123' }, body: {} } },
        { method: 'rejectQuote', params: { params: { id: 'quote-123' }, body: {} } },
        { method: 'markQuoteAsViewed', params: { params: { id: 'quote-123' } } }
      ];

      for (const endpoint of endpoints) {
        const req = mockRequest({
          ...endpoint.params,
          user: null // No authentication
        });
        const res = mockResponse();

        await (quoteController as any)[endpoint.method](req, res);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({
          error: 'Authentication required'
        });

        jest.clearAllMocks();
      }
    });
  });
});