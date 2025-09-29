// Mock dependencies before imports
jest.mock('../../src/services/payment.service', () => ({
  paymentService: {
    createPayment: jest.fn(),
    createStripePayment: jest.fn(),
    processStripeWebhook: jest.fn(),
    getPayment: jest.fn(),
    updatePaymentStatus: jest.fn(),
    listPayments: jest.fn(),
    refundPayment: jest.fn(),
    getPaymentStats: jest.fn()
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
import { paymentController } from '../../src/controllers/payment.controller';
import { paymentService } from '../../src/services/payment.service';
import { PaymentMethod, PaymentStatus } from '../../src/types/enums';
import { AuthenticatedRequest } from '../../src/middleware/auth.middleware';
import { Decimal } from 'decimal.js';

// Mock Express Request and Response
const mockRequest = (overrides = {}) => ({
  body: {},
  params: {},
  query: {},
  headers: {},
  user: {
    id: 'user-123',
    organizationId: 'org-123',
    role: 'BOOKKEEPER'
  },
  ip: '192.168.1.100',
  get: jest.fn().mockReturnValue('test-user-agent'),
  ...overrides
}) as unknown as AuthenticatedRequest;

const mockResponse = () => {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
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
        isUUID: jest.fn(() => ({
          withMessage: jest.fn(() => ({}))
        })),
        isFloat: jest.fn(() => ({
          withMessage: jest.fn(() => ({}))
        })),
        isLength: jest.fn(() => ({
          withMessage: jest.fn(() => ({}))
        })),
        isIn: jest.fn(() => ({
          withMessage: jest.fn(() => ({}))
        })),
        isISO8601: jest.fn(() => ({
          withMessage: jest.fn(() => ({}))
        })),
        isEmail: jest.fn(() => ({
          withMessage: jest.fn(() => ({}))
        })),
        isURL: jest.fn(() => ({
          withMessage: jest.fn(() => ({}))
        })),
        isObject: jest.fn(() => ({
          withMessage: jest.fn(() => ({}))
        }))
      }))
    })),
    optional: jest.fn(() => ({
      isLength: jest.fn(() => ({
        withMessage: jest.fn(() => ({}))
      })),
      isISO8601: jest.fn(() => ({
        withMessage: jest.fn(() => ({}))
      })),
      isEmail: jest.fn(() => ({
        withMessage: jest.fn(() => ({}))
      })),
      isURL: jest.fn(() => ({
        withMessage: jest.fn(() => ({}))
      })),
      isObject: jest.fn(() => ({
        withMessage: jest.fn(() => ({}))
      }))
    })),
    isFloat: jest.fn(() => ({
      withMessage: jest.fn(() => ({}))
    })),
    isLength: jest.fn(() => ({
      withMessage: jest.fn(() => ({}))
    })),
    isIn: jest.fn(() => ({
      withMessage: jest.fn(() => ({}))
    })),
    isObject: jest.fn(() => ({
      withMessage: jest.fn(() => ({}))
    }))
  })),
  param: jest.fn(() => ({
    isUUID: jest.fn(() => ({
      withMessage: jest.fn(() => ({}))
    }))
  })),
  query: jest.fn(() => ({
    optional: jest.fn(() => ({
      isUUID: jest.fn(() => ({
        withMessage: jest.fn(() => ({}))
      })),
      isIn: jest.fn(() => ({
        withMessage: jest.fn(() => ({}))
      })),
      isISO8601: jest.fn(() => ({
        withMessage: jest.fn(() => ({}))
      })),
      isFloat: jest.fn(() => ({
        withMessage: jest.fn(() => ({}))
      })),
      isInt: jest.fn(() => ({
        withMessage: jest.fn(() => ({}))
      }))
    }))
  }))
}));

describe('Payment Controller', () => {
  let mockPaymentService: jest.Mocked<typeof paymentService>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPaymentService = paymentService as jest.Mocked<typeof paymentService>;
    mockValidationResult(false); // Default to no validation errors
  });

  describe('createPayment', () => {
    const validPaymentData = {
      invoiceId: 'invoice-123',
      amount: 1500.00,
      method: PaymentMethod.CASH,
      reference: 'CASH-001',
      notes: 'Payment received in person',
      receivedDate: '2024-01-15'
    };

    const mockPayment = {
      id: 'payment-123',
      invoiceId: 'invoice-123',
      amount: new Decimal(1500.00),
      method: PaymentMethod.CASH,
      status: PaymentStatus.COMPLETED,
      reference: 'CASH-001',
      notes: 'Payment received in person',
      receivedDate: new Date('2024-01-15'),
      organizationId: 'org-123',
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null
    };

    it('should successfully create a cash payment', async () => {
      const req = mockRequest({
        body: validPaymentData
      });
      const res = mockResponse();

      mockPaymentService.createPayment.mockResolvedValue(mockPayment);

      await paymentController.createPayment(req, res);

      expect(mockPaymentService.createPayment).toHaveBeenCalledWith(
        validPaymentData,
        'org-123',
        {
          userId: 'user-123',
          ipAddress: '192.168.1.100',
          userAgent: 'test-user-agent'
        }
      );

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Payment created successfully',
        payment: mockPayment
      });
    });

    it('should create an Interac e-Transfer payment', async () => {
      const eTransferData = {
        ...validPaymentData,
        method: PaymentMethod.INTERAC_ETRANSFER,
        reference: 'ET-987654321',
        amount: 2500.00
      };

      const req = mockRequest({
        body: eTransferData
      });
      const res = mockResponse();

      const eTransferPayment = {
        ...mockPayment,
        method: PaymentMethod.INTERAC_ETRANSFER,
        reference: 'ET-987654321',
        amount: new Decimal(2500.00)
      };

      mockPaymentService.createPayment.mockResolvedValue(eTransferPayment);

      await paymentController.createPayment(req, res);

      expect(mockPaymentService.createPayment).toHaveBeenCalledWith(
        eTransferData,
        'org-123',
        expect.any(Object)
      );

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Payment created successfully',
        payment: eTransferPayment
      });
    });

    it('should handle validation errors', async () => {
      const req = mockRequest({
        body: {
          // Missing required fields
          amount: 1500.00
        }
      });
      const res = mockResponse();

      mockValidationResult(true, [
        { msg: 'Invoice ID is required', param: 'invoiceId' }
      ]);

      await paymentController.createPayment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Validation Error',
        details: [{ msg: 'Invoice ID is required', param: 'invoiceId' }]
      });

      expect(mockPaymentService.createPayment).not.toHaveBeenCalled();
    });

    it('should handle payment exceeding invoice balance', async () => {
      const req = mockRequest({
        body: {
          ...validPaymentData,
          amount: 5000.00 // Exceeds invoice balance
        }
      });
      const res = mockResponse();

      mockPaymentService.createPayment.mockRejectedValue(
        new Error('Payment amount exceeds outstanding balance')
      );

      await paymentController.createPayment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Failed to create payment',
        message: 'Payment amount exceeds outstanding balance'
      });
    });

    it('should handle multi-tenant isolation', async () => {
      const req = mockRequest({
        body: validPaymentData,
        user: {
          id: 'user-456',
          organizationId: 'org-456',
          role: 'BOOKKEEPER'
        }
      });
      const res = mockResponse();

      const orgPayment = {
        ...mockPayment,
        organizationId: 'org-456'
      };

      mockPaymentService.createPayment.mockResolvedValue(orgPayment);

      await paymentController.createPayment(req, res);

      expect(mockPaymentService.createPayment).toHaveBeenCalledWith(
        validPaymentData,
        'org-456',
        expect.objectContaining({
          userId: 'user-456'
        })
      );

      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('should create check payment with proper reference', async () => {
      const checkData = {
        ...validPaymentData,
        method: PaymentMethod.CHEQUE,
        reference: 'CHK-789456',
        notes: 'Check #789456 from customer'
      };

      const req = mockRequest({
        body: checkData
      });
      const res = mockResponse();

      const checkPayment = {
        ...mockPayment,
        method: PaymentMethod.CHEQUE,
        reference: 'CHK-789456',
        notes: 'Check #789456 from customer'
      };

      mockPaymentService.createPayment.mockResolvedValue(checkPayment);

      await paymentController.createPayment(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Payment created successfully',
        payment: checkPayment
      });
    });

    it('should handle bank transfer payment', async () => {
      const bankTransferData = {
        ...validPaymentData,
        method: PaymentMethod.BANK_TRANSFER,
        reference: 'BT-2024-0115-001',
        notes: 'Wire transfer from customer bank account'
      };

      const req = mockRequest({
        body: bankTransferData
      });
      const res = mockResponse();

      const bankTransferPayment = {
        ...mockPayment,
        method: PaymentMethod.BANK_TRANSFER,
        reference: 'BT-2024-0115-001',
        notes: 'Wire transfer from customer bank account'
      };

      mockPaymentService.createPayment.mockResolvedValue(bankTransferPayment);

      await paymentController.createPayment(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Payment created successfully',
        payment: bankTransferPayment
      });
    });
  });

  describe('createStripePayment', () => {
    const stripePaymentData = {
      invoiceId: 'invoice-123',
      amount: 2000.00,
      currency: 'CAD',
      customerEmail: 'customer@example.com',
      successUrl: 'https://example.com/success',
      cancelUrl: 'https://example.com/cancel'
    };

    const mockStripeResult = {
      paymentIntent: {
        id: 'pi_test_123',
        client_secret: 'pi_test_123_secret',
        amount: 2000.00,
        currency: 'cad',
        status: 'requires_payment_method'
      },
      payment: {
        id: 'payment-123',
        invoiceId: 'invoice-123',
        amount: new Decimal(2000.00),
        method: PaymentMethod.STRIPE_CARD,
        status: PaymentStatus.PENDING,
        stripePaymentIntentId: 'pi_test_123',
        organizationId: 'org-123'
      }
    };

    it('should successfully create a Stripe payment intent', async () => {
      const req = mockRequest({
        body: stripePaymentData
      });
      const res = mockResponse();

      mockPaymentService.createStripePayment.mockResolvedValue(mockStripeResult as any);

      await paymentController.createStripePayment(req, res);

      expect(mockPaymentService.createStripePayment).toHaveBeenCalledWith(
        stripePaymentData,
        'org-123',
        expect.any(Object)
      );

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Stripe payment intent created successfully',
        paymentIntent: {
          id: 'pi_test_123',
          clientSecret: 'pi_test_123_secret',
          amount: 2000.00,
          currency: 'cad',
          status: 'requires_payment_method'
        },
        payment: mockStripeResult.payment
      });
    });

    it('should handle Stripe payment creation errors', async () => {
      const req = mockRequest({
        body: stripePaymentData
      });
      const res = mockResponse();

      mockPaymentService.createStripePayment.mockRejectedValue(
        new Error('Stripe API error: Invalid currency')
      );

      await paymentController.createStripePayment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Failed to create Stripe payment',
        message: 'Stripe API error: Invalid currency'
      });
    });

    it('should validate minimum Stripe amount', async () => {
      const req = mockRequest({
        body: {
          ...stripePaymentData,
          amount: 0.25 // Below Stripe minimum
        }
      });
      const res = mockResponse();

      mockValidationResult(true, [
        { msg: 'Amount must be at least $0.50', param: 'amount' }
      ]);

      await paymentController.createStripePayment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Validation Error',
        details: [{ msg: 'Amount must be at least $0.50', param: 'amount' }]
      });
    });
  });

  describe('handleStripeWebhook', () => {
    it('should successfully process Stripe webhook', async () => {
      const req = mockRequest({
        body: 'webhook_payload',
        headers: {
          'stripe-signature': 'test_signature'
        }
      });
      req.get = jest.fn().mockReturnValue('test_signature');
      const res = mockResponse();

      mockPaymentService.processStripeWebhook.mockResolvedValue(undefined);

      await paymentController.handleStripeWebhook(req, res);

      expect(mockPaymentService.processStripeWebhook).toHaveBeenCalledWith({
        signature: 'test_signature',
        payload: 'webhook_payload'
      });

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ received: true });
    });

    it('should handle missing Stripe signature', async () => {
      const req = mockRequest({
        body: 'webhook_payload'
      });
      req.get = jest.fn().mockReturnValue(undefined);
      const res = mockResponse();

      await paymentController.handleStripeWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Missing Stripe signature'
      });

      expect(mockPaymentService.processStripeWebhook).not.toHaveBeenCalled();
    });

    it('should handle webhook processing errors', async () => {
      const req = mockRequest({
        body: 'invalid_payload'
      });
      req.get = jest.fn().mockReturnValue('invalid_signature');
      const res = mockResponse();

      mockPaymentService.processStripeWebhook.mockRejectedValue(
        new Error('Invalid webhook signature')
      );

      await paymentController.handleStripeWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Webhook processing failed',
        message: 'Invalid webhook signature'
      });
    });
  });

  describe('getPayment', () => {
    const mockPayment = {
      id: 'payment-123',
      invoiceId: 'invoice-123',
      amount: new Decimal(1500.00),
      method: PaymentMethod.CASH,
      status: PaymentStatus.COMPLETED,
      organizationId: 'org-123'
    };

    it('should successfully retrieve a payment', async () => {
      const req = mockRequest({
        params: { id: 'payment-123' }
      });
      const res = mockResponse();

      mockPaymentService.getPayment.mockResolvedValue(mockPayment);

      await paymentController.getPayment(req, res);

      expect(mockPaymentService.getPayment).toHaveBeenCalledWith(
        'payment-123',
        'org-123'
      );

      expect(res.json).toHaveBeenCalledWith({ payment: mockPayment });
    });

    it('should handle payment not found', async () => {
      const req = mockRequest({
        params: { id: 'nonexistent-payment' }
      });
      const res = mockResponse();

      mockPaymentService.getPayment.mockResolvedValue(null);

      await paymentController.getPayment(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Payment not found'
      });
    });

    it('should handle missing payment ID', async () => {
      const req = mockRequest({
        params: {} // Missing ID
      });
      const res = mockResponse();

      await paymentController.getPayment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Payment ID is required'
      });

      expect(mockPaymentService.getPayment).not.toHaveBeenCalled();
    });

    it('should handle multi-tenant isolation for payment retrieval', async () => {
      const req = mockRequest({
        params: { id: 'payment-123' },
        user: {
          id: 'user-456',
          organizationId: 'org-456',
          role: 'BOOKKEEPER'
        }
      });
      const res = mockResponse();

      mockPaymentService.getPayment.mockResolvedValue(null); // Not found for different org

      await paymentController.getPayment(req, res);

      expect(mockPaymentService.getPayment).toHaveBeenCalledWith(
        'payment-123',
        'org-456'
      );

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should handle service errors gracefully', async () => {
      const req = mockRequest({
        params: { id: 'payment-123' }
      });
      const res = mockResponse();

      mockPaymentService.getPayment.mockRejectedValue(
        new Error('Database connection failed')
      );

      await paymentController.getPayment(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Failed to retrieve payment',
        message: 'Database connection failed'
      });
    });
  });

  describe('updatePaymentStatus', () => {
    it('should successfully update payment status', async () => {
      const req = mockRequest({
        params: { id: 'payment-123' },
        body: {
          status: PaymentStatus.COMPLETED,
          failureReason: null
        }
      });
      const res = mockResponse();

      const updatedPayment = {
        id: 'payment-123',
        status: PaymentStatus.COMPLETED,
        organizationId: 'org-123'
      };

      mockPaymentService.updatePaymentStatus.mockResolvedValue(updatedPayment as any);

      await paymentController.updatePaymentStatus(req, res);

      expect(mockPaymentService.updatePaymentStatus).toHaveBeenCalledWith(
        'payment-123',
        PaymentStatus.COMPLETED,
        'org-123',
        expect.any(Object),
        null
      );

      expect(res.json).toHaveBeenCalledWith({
        message: 'Payment status updated successfully',
        payment: updatedPayment
      });
    });

    it('should handle payment status update with failure reason', async () => {
      const req = mockRequest({
        params: { id: 'payment-123' },
        body: {
          status: PaymentStatus.FAILED,
          failureReason: 'Insufficient funds'
        }
      });
      const res = mockResponse();

      const failedPayment = {
        id: 'payment-123',
        status: PaymentStatus.FAILED,
        failureReason: 'Insufficient funds',
        organizationId: 'org-123'
      };

      mockPaymentService.updatePaymentStatus.mockResolvedValue(failedPayment as any);

      await paymentController.updatePaymentStatus(req, res);

      expect(mockPaymentService.updatePaymentStatus).toHaveBeenCalledWith(
        'payment-123',
        PaymentStatus.FAILED,
        'org-123',
        expect.any(Object),
        'Insufficient funds'
      );

      expect(res.json).toHaveBeenCalledWith({
        message: 'Payment status updated successfully',
        payment: failedPayment
      });
    });

    it('should handle invalid payment status update', async () => {
      const req = mockRequest({
        params: { id: 'payment-123' },
        body: {
          status: PaymentStatus.COMPLETED
        }
      });
      const res = mockResponse();

      mockPaymentService.updatePaymentStatus.mockRejectedValue(
        new Error('Cannot update completed payment')
      );

      await paymentController.updatePaymentStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Failed to update payment status',
        message: 'Cannot update completed payment'
      });
    });

    it('should handle missing payment ID in status update', async () => {
      const req = mockRequest({
        params: {}, // Missing ID
        body: {
          status: PaymentStatus.COMPLETED
        }
      });
      const res = mockResponse();

      await paymentController.updatePaymentStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Payment ID is required'
      });

      expect(mockPaymentService.updatePaymentStatus).not.toHaveBeenCalled();
    });
  });

  describe('listPayments', () => {
    const mockPaymentsList = {
      payments: [
        {
          id: 'payment-1',
          amount: new Decimal(1000.00),
          method: PaymentMethod.CASH,
          status: PaymentStatus.COMPLETED,
          organizationId: 'org-123'
        },
        {
          id: 'payment-2',
          amount: new Decimal(1500.00),
          method: PaymentMethod.INTERAC_ETRANSFER,
          status: PaymentStatus.COMPLETED,
          organizationId: 'org-123'
        }
      ],
      total: 2,
      page: 1,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false
    };

    it('should successfully list payments with default pagination', async () => {
      const req = mockRequest({
        query: {}
      });
      const res = mockResponse();

      mockPaymentService.listPayments.mockResolvedValue(mockPaymentsList as any);

      await paymentController.listPayments(req, res);

      expect(mockPaymentService.listPayments).toHaveBeenCalledWith(
        'org-123',
        {},
        1,
        50
      );

      expect(res.json).toHaveBeenCalledWith(mockPaymentsList);
    });

    it('should list payments with filters and custom pagination', async () => {
      const req = mockRequest({
        query: {
          status: PaymentStatus.COMPLETED,
          paymentMethod: PaymentMethod.CASH,
          startDate: '2024-01-01',
          endDate: '2024-01-31',
          minAmount: '100.00',
          maxAmount: '2000.00',
          page: '2',
          limit: '25'
        }
      });
      const res = mockResponse();

      mockPaymentService.listPayments.mockResolvedValue(mockPaymentsList as any);

      await paymentController.listPayments(req, res);

      expect(mockPaymentService.listPayments).toHaveBeenCalledWith(
        'org-123',
        {
          status: PaymentStatus.COMPLETED,
          paymentMethod: PaymentMethod.CASH,
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-01-31'),
          minAmount: 100.00,
          maxAmount: 2000.00
        },
        2,
        25
      );
    });

    it('should handle list payments service errors', async () => {
      const req = mockRequest({
        query: {}
      });
      const res = mockResponse();

      mockPaymentService.listPayments.mockRejectedValue(
        new Error('Database connection failed')
      );

      await paymentController.listPayments(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Failed to list payments',
        message: 'Database connection failed'
      });
    });
  });

  describe('refundPayment', () => {
    it('should successfully refund a payment', async () => {
      const req = mockRequest({
        params: { id: 'payment-123' },
        body: {
          amount: 500.00,
          reason: 'Customer requested partial refund'
        }
      });
      const res = mockResponse();

      const refundedPayment = {
        id: 'payment-123',
        amount: new Decimal(1500.00),
        refundedAmount: new Decimal(500.00),
        status: PaymentStatus.REFUNDED,
        organizationId: 'org-123'
      };

      mockPaymentService.refundPayment.mockResolvedValue(refundedPayment as any);

      await paymentController.refundPayment(req, res);

      expect(mockPaymentService.refundPayment).toHaveBeenCalledWith(
        'payment-123',
        500.00,
        'Customer requested partial refund',
        'org-123',
        expect.any(Object)
      );

      expect(res.json).toHaveBeenCalledWith({
        message: 'Payment refunded successfully',
        payment: refundedPayment
      });
    });

    it('should handle refund amount exceeding payment', async () => {
      const req = mockRequest({
        params: { id: 'payment-123' },
        body: {
          amount: 2000.00, // More than original payment
          reason: 'Refund error'
        }
      });
      const res = mockResponse();

      mockPaymentService.refundPayment.mockRejectedValue(
        new Error('Refund amount exceeds payment amount')
      );

      await paymentController.refundPayment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Failed to refund payment',
        message: 'Refund amount exceeds payment amount'
      });
    });

    it('should handle missing payment ID for refund', async () => {
      const req = mockRequest({
        params: {}, // Missing ID
        body: {
          amount: 500.00,
          reason: 'Test refund'
        }
      });
      const res = mockResponse();

      await paymentController.refundPayment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Payment ID is required'
      });

      expect(mockPaymentService.refundPayment).not.toHaveBeenCalled();
    });
  });

  describe('getPaymentStats', () => {
    const mockStats = {
      totalPayments: 25,
      totalAmount: new Decimal(37500.00),
      averageAmount: new Decimal(1500.00),
      recentPayments: 3,
      pendingAmount: new Decimal(1500.00),
      paymentsByMethod: {
        [PaymentMethod.CASH]: { count: 10, amount: new Decimal(15000.00) },
        [PaymentMethod.INTERAC_ETRANSFER]: { count: 8, amount: new Decimal(12000.00) },
        [PaymentMethod.STRIPE_CARD]: { count: 5, amount: new Decimal(7500.00) },
        [PaymentMethod.BANK_TRANSFER]: { count: 2, amount: new Decimal(3000.00) }
      },
      paymentsByStatus: {
        [PaymentStatus.COMPLETED]: { count: 22, amount: new Decimal(33000.00) },
        [PaymentStatus.PENDING]: { count: 2, amount: new Decimal(3000.00) },
        [PaymentStatus.FAILED]: { count: 1, amount: new Decimal(1500.00) }
      },
      monthlyTrends: [
        { month: '2024-01', count: 25, amount: new Decimal(37500.00) }
      ]
    };

    it('should successfully get payment statistics', async () => {
      const req = mockRequest({
        query: {
          startDate: '2024-01-01',
          endDate: '2024-01-31'
        }
      });
      const res = mockResponse();

      mockPaymentService.getPaymentStats.mockResolvedValue(mockStats as any);

      await paymentController.getPaymentStats(req, res);

      expect(mockPaymentService.getPaymentStats).toHaveBeenCalledWith(
        'org-123',
        new Date('2024-01-01'),
        new Date('2024-01-31')
      );

      expect(res.json).toHaveBeenCalledWith({ stats: mockStats });
    });

    it('should get payment statistics without date filters', async () => {
      const req = mockRequest({
        query: {}
      });
      const res = mockResponse();

      mockPaymentService.getPaymentStats.mockResolvedValue(mockStats as any);

      await paymentController.getPaymentStats(req, res);

      expect(mockPaymentService.getPaymentStats).toHaveBeenCalledWith(
        'org-123',
        undefined,
        undefined
      );

      expect(res.json).toHaveBeenCalledWith({ stats: mockStats });
    });

    it('should handle payment statistics service errors', async () => {
      const req = mockRequest({
        query: {}
      });
      const res = mockResponse();

      mockPaymentService.getPaymentStats.mockRejectedValue(
        new Error('Statistics calculation failed')
      );

      await paymentController.getPaymentStats(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Failed to retrieve payment statistics',
        message: 'Statistics calculation failed'
      });
    });
  });

  describe('Security and Error Handling', () => {
    it('should handle service errors gracefully', async () => {
      const req = mockRequest({
        body: {
          invoiceId: 'invoice-123',
          amount: 1500.00,
          method: PaymentMethod.CASH
        }
      });
      const res = mockResponse();

      mockPaymentService.createPayment.mockRejectedValue(
        new Error('Database connection failed')
      );

      await paymentController.createPayment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Failed to create payment',
        message: 'Database connection failed'
      });
    });

    it('should ensure multi-tenant isolation in all operations', async () => {
      const req = mockRequest({
        user: {
          id: 'user-org2',
          organizationId: 'org-different',
          role: 'BOOKKEEPER'
        },
        params: { id: 'payment-123' }
      });
      const res = mockResponse();

      mockPaymentService.getPayment.mockResolvedValue(null);

      await paymentController.getPayment(req, res);

      expect(mockPaymentService.getPayment).toHaveBeenCalledWith(
        'payment-123',
        'org-different'
      );

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Payment not found'
      });
    });

    it('should handle unknown errors gracefully', async () => {
      const req = mockRequest({
        body: {
          invoiceId: 'invoice-123',
          amount: 1500.00,
          method: PaymentMethod.CASH
        }
      });
      const res = mockResponse();

      // Simulate non-Error object being thrown
      mockPaymentService.createPayment.mockRejectedValue('Unexpected error');

      await paymentController.createPayment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Failed to create payment',
        message: 'Unknown error'
      });
    });

    it('should properly include audit context in all operations', async () => {
      const req = mockRequest({
        body: {
          invoiceId: 'invoice-123',
          amount: 1500.00,
          method: PaymentMethod.CASH
        },
        ip: '203.0.113.100',
        user: {
          id: 'audit-user-123',
          organizationId: 'audit-org-123',
          role: 'BOOKKEEPER'
        }
      });
      req.get = jest.fn().mockReturnValue('Mozilla/5.0 Test Agent');
      const res = mockResponse();

      const mockPayment = {
        id: 'payment-audit-123',
        organizationId: 'audit-org-123'
      };

      mockPaymentService.createPayment.mockResolvedValue(mockPayment);

      await paymentController.createPayment(req, res);

      expect(mockPaymentService.createPayment).toHaveBeenCalledWith(
        expect.any(Object),
        'audit-org-123',
        {
          userId: 'audit-user-123',
          ipAddress: '203.0.113.100',
          userAgent: 'Mozilla/5.0 Test Agent'
        }
      );
    });

    it('should handle different payment method validations', async () => {
      const testCases = [
        { method: PaymentMethod.CASH, valid: true },
        { method: PaymentMethod.INTERAC_ETRANSFER, valid: true },
        { method: PaymentMethod.STRIPE_CARD, valid: true },
        { method: PaymentMethod.BANK_TRANSFER, valid: true },
        { method: PaymentMethod.CHEQUE, valid: true },
        { method: 'INVALID_METHOD' as PaymentMethod, valid: false }
      ];

      for (const testCase of testCases) {
        const req = mockRequest({
          body: {
            invoiceId: 'invoice-123',
            amount: 1500.00,
            method: testCase.method
          }
        });
        const res = mockResponse();

        if (!testCase.valid) {
          mockValidationResult(true, [
            { msg: 'Invalid payment method', param: 'method' }
          ]);

          await paymentController.createPayment(req, res);

          expect(res.status).toHaveBeenCalledWith(400);
          expect(res.json).toHaveBeenCalledWith({
            error: 'Validation Error',
            details: [{ msg: 'Invalid payment method', param: 'method' }]
          });
        } else {
          mockValidationResult(false);
          mockPaymentService.createPayment.mockResolvedValue({
            id: 'payment-test',
            method: testCase.method,
            organizationId: 'org-123'
          } as any);

          await paymentController.createPayment(req, res);

          expect(res.status).toHaveBeenCalledWith(201);
        }

        jest.clearAllMocks();
      }
    });
  });
});