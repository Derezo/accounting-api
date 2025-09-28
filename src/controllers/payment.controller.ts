import { Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { paymentService } from '../services/payment.service';
import { PaymentMethod, PaymentStatus } from '../types/enums';
import { AuthenticatedRequest } from '../middleware/auth.middleware';

export class PaymentController {
  async createPayment(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          error: 'Validation Error',
          details: errors.array()
        });
        return;
      }

      const organizationId = req.user!.organizationId;
      const auditContext = {
        userId: req.user!.id,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      };

      const payment = await paymentService.createPayment(
        req.body,
        organizationId,
        auditContext
      );

      res.status(201).json({
        message: 'Payment created successfully',
        payment
      });
    } catch (error) {
      res.status(400).json({
        error: 'Failed to create payment',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async createStripePayment(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          error: 'Validation Error',
          details: errors.array()
        });
        return;
      }

      const organizationId = req.user!.organizationId;
      const auditContext = {
        userId: req.user!.id,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      };

      const result = await paymentService.createStripePayment(
        req.body,
        organizationId,
        auditContext
      );

      res.status(201).json({
        message: 'Stripe payment intent created successfully',
        paymentIntent: {
          id: result.paymentIntent.id,
          clientSecret: result.paymentIntent.client_secret,
          amount: result.paymentIntent.amount,
          currency: result.paymentIntent.currency,
          status: result.paymentIntent.status
        },
        payment: result.payment
      });
    } catch (error) {
      res.status(400).json({
        error: 'Failed to create Stripe payment',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async handleStripeWebhook(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const signature = req.get('stripe-signature');
      if (!signature) {
        res.status(400).json({
          error: 'Missing Stripe signature'
        });
        return;
      }

      await paymentService.processStripeWebhook({
        signature,
        payload: req.body
      });

      res.status(200).json({ received: true });
    } catch (error) {
      console.error('Stripe webhook error:', error);
      res.status(400).json({
        error: 'Webhook processing failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async getPayment(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          error: 'Validation Error',
          details: errors.array()
        });
        return;
      }

      const { id } = req.params;
      if (!id) {
        res.status(400).json({ error: 'Payment ID is required' });
        return;
      }
      const organizationId = req.user!.organizationId;

      const payment = await paymentService.getPayment(id, organizationId);

      if (!payment) {
        res.status(404).json({
          error: 'Payment not found'
        });
        return;
      }

      res.json({ payment });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to retrieve payment',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async updatePaymentStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          error: 'Validation Error',
          details: errors.array()
        });
        return;
      }

      const { id } = req.params;
      if (!id) {
        res.status(400).json({ error: 'Payment ID is required' });
        return;
      }
      const { status, failureReason } = req.body;
      const organizationId = req.user!.organizationId;
      const auditContext = {
        userId: req.user!.id,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      };

      const payment = await paymentService.updatePaymentStatus(
        id,
        status,
        organizationId,
        auditContext,
        failureReason
      );

      res.json({
        message: 'Payment status updated successfully',
        payment
      });
    } catch (error) {
      res.status(400).json({
        error: 'Failed to update payment status',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async listPayments(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          error: 'Validation Error',
          details: errors.array()
        });
        return;
      }

      const organizationId = req.user!.organizationId;
      const {
        customerId,
        invoiceId,
        status,
        paymentMethod,
        startDate,
        endDate,
        minAmount,
        maxAmount,
        page = 1,
        limit = 50
      } = req.query;

      const filter: any = {};
      if (customerId) filter.customerId = customerId as string;
      if (invoiceId) filter.invoiceId = invoiceId as string;
      if (status) filter.status = status as PaymentStatus;
      if (paymentMethod) filter.paymentMethod = paymentMethod as PaymentMethod;
      if (startDate) filter.startDate = new Date(startDate as string);
      if (endDate) filter.endDate = new Date(endDate as string);
      if (minAmount) filter.minAmount = parseFloat(minAmount as string);
      if (maxAmount) filter.maxAmount = parseFloat(maxAmount as string);

      const result = await paymentService.listPayments(
        organizationId,
        filter,
        parseInt(page as string, 10),
        parseInt(limit as string, 10)
      );

      res.json(result);
    } catch (error) {
      res.status(500).json({
        error: 'Failed to list payments',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async refundPayment(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          error: 'Validation Error',
          details: errors.array()
        });
        return;
      }

      const { id } = req.params;
      if (!id) {
        res.status(400).json({ error: 'Payment ID is required' });
        return;
      }
      const { amount, reason } = req.body;
      const organizationId = req.user!.organizationId;
      const auditContext = {
        userId: req.user!.id,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      };

      const payment = await paymentService.refundPayment(
        id,
        amount,
        reason,
        organizationId,
        auditContext
      );

      res.json({
        message: 'Payment refunded successfully',
        payment
      });
    } catch (error) {
      res.status(400).json({
        error: 'Failed to refund payment',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async getPaymentStats(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          error: 'Validation Error',
          details: errors.array()
        });
        return;
      }

      const organizationId = req.user!.organizationId;
      const { startDate, endDate } = req.query;

      const stats = await paymentService.getPaymentStats(
        organizationId,
        startDate ? new Date(startDate as string) : undefined,
        endDate ? new Date(endDate as string) : undefined
      );

      res.json({ stats });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to retrieve payment statistics',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}

// Validation middleware
export const validateCreatePayment = [
  body('customerId')
    .notEmpty()
    .withMessage('Customer ID is required')
    .isUUID()
    .withMessage('Customer ID must be a valid UUID'),

  body('invoiceId')
    .optional()
    .isUUID()
    .withMessage('Invoice ID must be a valid UUID'),

  body('amount')
    .isFloat({ min: 0.01 })
    .withMessage('Amount must be a positive number'),

  body('currency')
    .optional()
    .isLength({ min: 3, max: 3 })
    .withMessage('Currency must be a 3-letter ISO code'),

  body('paymentMethod')
    .isIn(Object.values(PaymentMethod))
    .withMessage('Invalid payment method'),

  body('paymentDate')
    .optional()
    .isISO8601()
    .withMessage('Payment date must be a valid ISO date'),

  body('referenceNumber')
    .optional()
    .isLength({ max: 100 })
    .withMessage('Reference number must be 100 characters or less'),

  body('customerNotes')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Customer notes must be 1000 characters or less'),

  body('adminNotes')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Admin notes must be 1000 characters or less'),

  body('metadata')
    .optional()
    .isObject()
    .withMessage('Metadata must be an object')
];

export const validateCreateStripePayment = [
  body('invoiceId')
    .notEmpty()
    .withMessage('Invoice ID is required')
    .isUUID()
    .withMessage('Invoice ID must be a valid UUID'),

  body('amount')
    .isFloat({ min: 0.50 }) // Stripe minimum
    .withMessage('Amount must be at least $0.50'),

  body('currency')
    .optional()
    .isLength({ min: 3, max: 3 })
    .withMessage('Currency must be a 3-letter ISO code'),

  body('customerEmail')
    .optional()
    .isEmail()
    .withMessage('Customer email must be valid'),

  body('successUrl')
    .optional()
    .isURL()
    .withMessage('Success URL must be valid'),

  body('cancelUrl')
    .optional()
    .isURL()
    .withMessage('Cancel URL must be valid'),

  body('metadata')
    .optional()
    .isObject()
    .withMessage('Metadata must be an object')
];

export const validateUpdatePaymentStatus = [
  param('id')
    .isUUID()
    .withMessage('Payment ID must be a valid UUID'),

  body('status')
    .isIn(Object.values(PaymentStatus))
    .withMessage('Invalid payment status'),

  body('failureReason')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Failure reason must be 500 characters or less')
];

export const validateListPayments = [
  query('customerId')
    .optional()
    .isUUID()
    .withMessage('Customer ID must be a valid UUID'),

  query('invoiceId')
    .optional()
    .isUUID()
    .withMessage('Invoice ID must be a valid UUID'),

  query('status')
    .optional()
    .isIn(Object.values(PaymentStatus))
    .withMessage('Invalid payment status'),

  query('paymentMethod')
    .optional()
    .isIn(Object.values(PaymentMethod))
    .withMessage('Invalid payment method'),

  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO date'),

  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid ISO date'),

  query('minAmount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Minimum amount must be non-negative'),

  query('maxAmount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Maximum amount must be non-negative'),

  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
];

export const validateRefundPayment = [
  param('id')
    .isUUID()
    .withMessage('Payment ID must be a valid UUID'),

  body('amount')
    .isFloat({ min: 0.01 })
    .withMessage('Refund amount must be positive'),

  body('reason')
    .notEmpty()
    .withMessage('Refund reason is required')
    .isLength({ max: 500 })
    .withMessage('Refund reason must be 500 characters or less')
];

export const validateGetPaymentStats = [
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO date'),

  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid ISO date')
];

export const validatePaymentId = [
  param('id')
    .isUUID()
    .withMessage('Payment ID must be a valid UUID')
];

export const paymentController = new PaymentController();