import { Response } from 'express';
import { query, validationResult } from 'express-validator';
import { paymentAnalyticsService } from '../services/payment-analytics.service';
import { PaymentMethod, PaymentStatus } from '../types/enums';
import { AuthenticatedRequest } from '../middleware/auth.middleware';

export class PaymentAnalyticsController {
  async getPaymentTrends(req: AuthenticatedRequest, res: Response): Promise<void> {
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
        startDate,
        endDate,
        customerId,
        paymentMethod,
        status,
        minAmount,
        maxAmount,
        currency,
        groupBy = 'MONTH'
      } = req.query;

      const filter: any = {};
      if (startDate) filter.startDate = new Date(startDate as string);
      if (endDate) filter.endDate = new Date(endDate as string);
      if (customerId) filter.customerId = customerId as string;
      if (paymentMethod) filter.paymentMethod = paymentMethod as PaymentMethod;
      if (status) filter.status = status as PaymentStatus;
      if (minAmount) filter.minAmount = parseFloat(minAmount as string);
      if (maxAmount) filter.maxAmount = parseFloat(maxAmount as string);
      if (currency) filter.currency = currency as string;

      const trends = await paymentAnalyticsService.getPaymentTrends(
        organizationId,
        filter,
        groupBy as 'DAY' | 'WEEK' | 'MONTH' | 'QUARTER'
      );

      res.json({ trends });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to retrieve payment trends',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async getPaymentMethodAnalytics(req: AuthenticatedRequest, res: Response): Promise<void> {
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
        startDate,
        endDate,
        customerId,
        paymentMethod,
        status,
        minAmount,
        maxAmount,
        currency
      } = req.query;

      const filter: any = {};
      if (startDate) filter.startDate = new Date(startDate as string);
      if (endDate) filter.endDate = new Date(endDate as string);
      if (customerId) filter.customerId = customerId as string;
      if (paymentMethod) filter.paymentMethod = paymentMethod as PaymentMethod;
      if (status) filter.status = status as PaymentStatus;
      if (minAmount) filter.minAmount = parseFloat(minAmount as string);
      if (maxAmount) filter.maxAmount = parseFloat(maxAmount as string);
      if (currency) filter.currency = currency as string;

      const analytics = await paymentAnalyticsService.getPaymentMethodAnalytics(
        organizationId,
        filter
      );

      res.json({ analytics });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to retrieve payment method analytics',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async getCustomerPaymentBehavior(req: AuthenticatedRequest, res: Response): Promise<void> {
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
        startDate,
        endDate,
        customerId,
        paymentMethod,
        status,
        minAmount,
        maxAmount,
        currency,
        limit = 100
      } = req.query;

      const filter: any = {};
      if (startDate) filter.startDate = new Date(startDate as string);
      if (endDate) filter.endDate = new Date(endDate as string);
      if (customerId) filter.customerId = customerId as string;
      if (paymentMethod) filter.paymentMethod = paymentMethod as PaymentMethod;
      if (status) filter.status = status as PaymentStatus;
      if (minAmount) filter.minAmount = parseFloat(minAmount as string);
      if (maxAmount) filter.maxAmount = parseFloat(maxAmount as string);
      if (currency) filter.currency = currency as string;

      const behavior = await paymentAnalyticsService.getCustomerPaymentBehavior(
        organizationId,
        filter,
        parseInt(limit as string, 10)
      );

      res.json({ behavior });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to retrieve customer payment behavior',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async getPaymentForecast(req: AuthenticatedRequest, res: Response): Promise<void> {
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
        periods = 6,
        periodType = 'MONTH'
      } = req.query;

      const forecast = await paymentAnalyticsService.getPaymentForecast(
        organizationId,
        parseInt(periods as string, 10),
        periodType as 'MONTH' | 'QUARTER'
      );

      res.json({ forecast });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to retrieve payment forecast',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async getCashFlowProjection(req: AuthenticatedRequest, res: Response): Promise<void> {
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
      const { days = 90 } = req.query;

      const projection = await paymentAnalyticsService.getCashFlowProjection(
        organizationId,
        parseInt(days as string, 10)
      );

      res.json({ projection });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to retrieve cash flow projection',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async getPaymentAging(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const organizationId = req.user!.organizationId;

      const aging = await paymentAnalyticsService.getPaymentAging(organizationId);

      res.json({ aging });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to retrieve payment aging',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async detectFraudAlerts(req: AuthenticatedRequest, res: Response): Promise<void> {
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
      const { lookbackDays = 30 } = req.query;

      const alerts = await paymentAnalyticsService.detectFraudAlerts(
        organizationId,
        parseInt(lookbackDays as string, 10)
      );

      res.json({ alerts });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to detect fraud alerts',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}

// Validation middleware
export const validatePaymentTrends = [
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO date'),

  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid ISO date'),

  query('customerId')
    .optional()
    .isUUID()
    .withMessage('Customer ID must be a valid UUID'),

  query('paymentMethod')
    .optional()
    .isIn(Object.values(PaymentMethod))
    .withMessage('Invalid payment method'),

  query('status')
    .optional()
    .isIn(Object.values(PaymentStatus))
    .withMessage('Invalid payment status'),

  query('minAmount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Minimum amount must be non-negative'),

  query('maxAmount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Maximum amount must be non-negative'),

  query('currency')
    .optional()
    .isLength({ min: 3, max: 3 })
    .withMessage('Currency must be a 3-letter ISO code'),

  query('groupBy')
    .optional()
    .isIn(['DAY', 'WEEK', 'MONTH', 'QUARTER'])
    .withMessage('Group by must be DAY, WEEK, MONTH, or QUARTER')
];

export const validatePaymentMethodAnalytics = [
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO date'),

  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid ISO date'),

  query('customerId')
    .optional()
    .isUUID()
    .withMessage('Customer ID must be a valid UUID'),

  query('paymentMethod')
    .optional()
    .isIn(Object.values(PaymentMethod))
    .withMessage('Invalid payment method'),

  query('status')
    .optional()
    .isIn(Object.values(PaymentStatus))
    .withMessage('Invalid payment status'),

  query('minAmount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Minimum amount must be non-negative'),

  query('maxAmount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Maximum amount must be non-negative'),

  query('currency')
    .optional()
    .isLength({ min: 3, max: 3 })
    .withMessage('Currency must be a 3-letter ISO code')
];

export const validateCustomerPaymentBehavior = [
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO date'),

  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid ISO date'),

  query('customerId')
    .optional()
    .isUUID()
    .withMessage('Customer ID must be a valid UUID'),

  query('paymentMethod')
    .optional()
    .isIn(Object.values(PaymentMethod))
    .withMessage('Invalid payment method'),

  query('status')
    .optional()
    .isIn(Object.values(PaymentStatus))
    .withMessage('Invalid payment status'),

  query('minAmount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Minimum amount must be non-negative'),

  query('maxAmount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Maximum amount must be non-negative'),

  query('currency')
    .optional()
    .isLength({ min: 3, max: 3 })
    .withMessage('Currency must be a 3-letter ISO code'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 1000 })
    .withMessage('Limit must be between 1 and 1000')
];

export const validatePaymentForecast = [
  query('periods')
    .optional()
    .isInt({ min: 1, max: 24 })
    .withMessage('Periods must be between 1 and 24'),

  query('periodType')
    .optional()
    .isIn(['MONTH', 'QUARTER'])
    .withMessage('Period type must be MONTH or QUARTER')
];

export const validateCashFlowProjection = [
  query('days')
    .optional()
    .isInt({ min: 1, max: 365 })
    .withMessage('Days must be between 1 and 365')
];

export const validateFraudAlerts = [
  query('lookbackDays')
    .optional()
    .isInt({ min: 1, max: 365 })
    .withMessage('Lookback days must be between 1 and 365')
];

export const paymentAnalyticsController = new PaymentAnalyticsController();