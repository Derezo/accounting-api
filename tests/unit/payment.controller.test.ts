import { Response } from 'express';
import { PaymentController } from '../../src/controllers/payment.controller';
import { paymentService } from '../../src/services/payment.service';
import { PaymentMethod, PaymentStatus } from '../../src/types/enums';
import { AuthenticatedRequest } from '../../src/middleware/auth.middleware';

// Mock the payment service
jest.mock('../../src/services/payment.service');

// Mock express-validator
jest.mock('express-validator', () => ({
  validationResult: jest.fn(() => ({
    isEmpty: () => true,
    array: () => []
  })),
  body: jest.fn(() => ({
    notEmpty: () => ({ withMessage: () => ({ isUUID: () => ({ withMessage: () => ({}) }) }) }),
    isFloat: () => ({ withMessage: () => ({}) }),
    isIn: () => ({ withMessage: () => ({}) }),
    optional: () => ({ isISO8601: () => ({ withMessage: () => ({}) }) }),
    isLength: () => ({ withMessage: () => ({}) }),
    isObject: () => ({ withMessage: () => ({}) })
  })),
  param: jest.fn(() => ({
    isUUID: () => ({ withMessage: () => ({}) })
  })),
  query: jest.fn(() => ({
    optional: () => ({
      isUUID: () => ({ withMessage: () => ({}) }),
      isIn: () => ({ withMessage: () => ({}) }),
      isISO8601: () => ({ withMessage: () => ({}) }),
      isFloat: () => ({ withMessage: () => ({}) }),
      isInt: () => ({ withMessage: () => ({}) })
    })
  }))
}));

const mockPaymentService = paymentService as jest.Mocked<typeof paymentService>;

describe('PaymentController', () => {
  let controller: PaymentController;
  let mockRequest: Partial<AuthenticatedRequest>;
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    controller = new PaymentController();
    mockRequest = {
      user: {
        id: 'user-123',
        organizationId: 'org-123',
        role: 'ADMIN',
        sessionId: 'session-123'
      },
      ip: '127.0.0.1',
      get: jest.fn().mockReturnValue('test-user-agent'),
      body: {},
      params: {},
      query: {}
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    jest.clearAllMocks();
  });

  describe('createPayment', () => {
    it('should create a payment successfully', async () => {
      const paymentData = {
        customerId: 'customer-123',
        amount: 100.00,
        paymentMethod: PaymentMethod.CASH,
        customerNotes: 'Cash payment'
      };

      const createdPayment = {
        id: 'payment-123',
        ...paymentData,
        status: PaymentStatus.COMPLETED
      };

      mockRequest.body = paymentData;
      mockPaymentService.createPayment.mockResolvedValue(createdPayment);

      await controller.createPayment(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(mockPaymentService.createPayment).toHaveBeenCalledWith(
        paymentData,
        'org-123',
        {
          userId: 'user-123',
          ipAddress: '127.0.0.1',
          userAgent: 'test-user-agent'
        }
      );

      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'Payment created successfully',
        payment: createdPayment
      });
    });

    it('should handle payment creation errors', async () => {
      mockRequest.body = {
        customerId: 'customer-123',
        amount: 100.00,
        paymentMethod: PaymentMethod.CASH
      };

      mockPaymentService.createPayment.mockRejectedValue(new Error('Customer not found'));

      await controller.createPayment(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Failed to create payment',
        message: 'Customer not found'
      });
    });
  });

  describe('createStripePayment', () => {
    it('should create a Stripe payment intent successfully', async () => {
      const stripeData = {
        invoiceId: 'invoice-123',
        amount: 100.00,
        currency: 'CAD'
      };

      const mockResult = {
        paymentIntent: {
          id: 'pi_123456789',
          client_secret: 'pi_123456789_secret_123',
          amount: 10000,
          currency: 'cad',
          status: 'requires_payment_method'
        },
        payment: {
          id: 'payment-123',
          stripePaymentIntentId: 'pi_123456789',
          status: PaymentStatus.PENDING
        }
      };

      mockRequest.body = stripeData;
      mockPaymentService.createStripePayment.mockResolvedValue(mockResult as any);

      await controller.createStripePayment(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(mockPaymentService.createStripePayment).toHaveBeenCalledWith(
        stripeData,
        'org-123',
        {
          userId: 'user-123',
          ipAddress: '127.0.0.1',
          userAgent: 'test-user-agent'
        }
      );

      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'Stripe payment intent created successfully',
        paymentIntent: {
          id: 'pi_123456789',
          clientSecret: 'pi_123456789_secret_123',
          amount: 10000,
          currency: 'cad',
          status: 'requires_payment_method'
        },
        payment: mockResult.payment
      });
    });
  });

  describe('getPayment', () => {
    it('should return a payment when found', async () => {
      const mockPayment = {
        id: 'payment-123',
        amount: 100.00,
        status: PaymentStatus.COMPLETED
      };

      mockRequest.params = { id: 'payment-123' };
      mockPaymentService.getPayment.mockResolvedValue(mockPayment);

      await controller.getPayment(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(mockPaymentService.getPayment).toHaveBeenCalledWith('payment-123', 'org-123');
      expect(mockResponse.json).toHaveBeenCalledWith({ payment: mockPayment });
    });

    it('should return 404 when payment not found', async () => {
      mockRequest.params = { id: 'invalid-id' };
      mockPaymentService.getPayment.mockResolvedValue(null);

      await controller.getPayment(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Payment not found'
      });
    });

    it('should return 400 when payment ID is missing', async () => {
      mockRequest.params = {};

      await controller.getPayment(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Payment ID is required'
      });
    });
  });

  describe('updatePaymentStatus', () => {
    it('should update payment status successfully', async () => {
      const updatedPayment = {
        id: 'payment-123',
        status: PaymentStatus.COMPLETED
      };

      mockRequest.params = { id: 'payment-123' };
      mockRequest.body = { status: PaymentStatus.COMPLETED };
      mockPaymentService.updatePaymentStatus.mockResolvedValue(updatedPayment as any);

      await controller.updatePaymentStatus(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(mockPaymentService.updatePaymentStatus).toHaveBeenCalledWith(
        'payment-123',
        PaymentStatus.COMPLETED,
        'org-123',
        {
          userId: 'user-123',
          ipAddress: '127.0.0.1',
          userAgent: 'test-user-agent'
        },
        undefined
      );

      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'Payment status updated successfully',
        payment: updatedPayment
      });
    });
  });

  describe('listPayments', () => {
    it('should list payments with default pagination', async () => {
      const mockResult = {
        payments: [
          { id: 'payment-1', amount: 100.00 },
          { id: 'payment-2', amount: 200.00 }
        ],
        total: 2,
        page: 1,
        totalPages: 1
      };

      mockPaymentService.listPayments.mockResolvedValue(mockResult as any);

      await controller.listPayments(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(mockPaymentService.listPayments).toHaveBeenCalledWith(
        'org-123',
        {},
        1,
        50
      );

      expect(mockResponse.json).toHaveBeenCalledWith(mockResult);
    });

    it('should apply query filters correctly', async () => {
      mockRequest.query = {
        customerId: 'customer-123',
        status: PaymentStatus.COMPLETED,
        minAmount: '50',
        maxAmount: '500',
        page: '2',
        limit: '25'
      };

      const mockResult = {
        payments: [],
        total: 0,
        page: 2,
        totalPages: 0
      };

      mockPaymentService.listPayments.mockResolvedValue(mockResult as any);

      await controller.listPayments(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(mockPaymentService.listPayments).toHaveBeenCalledWith(
        'org-123',
        {
          customerId: 'customer-123',
          status: PaymentStatus.COMPLETED,
          minAmount: 50,
          maxAmount: 500
        },
        2,
        25
      );
    });
  });

  describe('refundPayment', () => {
    it('should process refund successfully', async () => {
      const refundedPayment = {
        id: 'payment-123',
        amount: 100.00,
        status: PaymentStatus.COMPLETED
      };

      mockRequest.params = { id: 'payment-123' };
      mockRequest.body = {
        amount: 50.00,
        reason: 'Customer requested refund'
      };

      mockPaymentService.refundPayment.mockResolvedValue(refundedPayment as any);

      await controller.refundPayment(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(mockPaymentService.refundPayment).toHaveBeenCalledWith(
        'payment-123',
        50.00,
        'Customer requested refund',
        'org-123',
        {
          userId: 'user-123',
          ipAddress: '127.0.0.1',
          userAgent: 'test-user-agent'
        }
      );

      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'Payment refunded successfully',
        payment: refundedPayment
      });
    });
  });

  describe('getPaymentStats', () => {
    it('should return payment statistics', async () => {
      const mockStats = {
        totalPayments: 10,
        totalAmount: 1000.00,
        averageAmount: 100.00,
        paymentsByMethod: {
          [PaymentMethod.CASH]: 5,
          [PaymentMethod.STRIPE_CARD]: 5
        },
        paymentsByStatus: {
          [PaymentStatus.COMPLETED]: 8,
          [PaymentStatus.PENDING]: 2
        },
        recentPayments: 3,
        pendingAmount: 200.00
      };

      mockPaymentService.getPaymentStats.mockResolvedValue(mockStats as any);

      await controller.getPaymentStats(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(mockPaymentService.getPaymentStats).toHaveBeenCalledWith(
        'org-123',
        undefined,
        undefined
      );

      expect(mockResponse.json).toHaveBeenCalledWith({ stats: mockStats });
    });

    it('should handle date range filtering for stats', async () => {
      mockRequest.query = {
        startDate: '2024-01-01',
        endDate: '2024-12-31'
      };

      const mockStats = {
        totalPayments: 5,
        totalAmount: 500.00,
        averageAmount: 100.00,
        paymentsByMethod: {},
        paymentsByStatus: {},
        recentPayments: 1,
        pendingAmount: 0
      };

      mockPaymentService.getPaymentStats.mockResolvedValue(mockStats as any);

      await controller.getPaymentStats(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(mockPaymentService.getPaymentStats).toHaveBeenCalledWith(
        'org-123',
        new Date('2024-01-01'),
        new Date('2024-12-31')
      );
    });
  });

  describe('handleStripeWebhook', () => {
    it('should process webhook successfully', async () => {
      mockRequest.get = jest.fn().mockReturnValue('stripe-signature-123');
      mockRequest.body = 'webhook-payload';

      mockPaymentService.processStripeWebhook.mockResolvedValue();

      await controller.handleStripeWebhook(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(mockPaymentService.processStripeWebhook).toHaveBeenCalledWith({
        signature: 'stripe-signature-123',
        payload: 'webhook-payload'
      });

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({ received: true });
    });

    it('should handle missing Stripe signature', async () => {
      mockRequest.get = jest.fn().mockReturnValue(undefined);

      await controller.handleStripeWebhook(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Missing Stripe signature'
      });
    });

    it('should handle webhook processing errors', async () => {
      mockRequest.get = jest.fn().mockReturnValue('stripe-signature-123');
      mockRequest.body = 'invalid-payload';

      mockPaymentService.processStripeWebhook.mockRejectedValue(
        new Error('Webhook signature verification failed')
      );

      await controller.handleStripeWebhook(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Webhook processing failed',
        message: 'Webhook signature verification failed'
      });
    });
  });
});