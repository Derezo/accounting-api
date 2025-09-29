import { Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import { manualPaymentService } from '../services/manual-payment.service';
import { PaymentMethod } from '../types/enums';
import { AuthenticatedRequest } from '../middleware/auth.middleware';

export class ManualPaymentController {
  async createManualPayment(req: AuthenticatedRequest, res: Response): Promise<void> {
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

      const payment = await manualPaymentService.createManualPayment(
        req.body,
        organizationId,
        auditContext
      );

      res.status(201).json({
        message: 'Manual payment created successfully',
        payment
      });
    } catch (error) {
      res.status(400).json({
        error: 'Failed to create manual payment',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async processBatchPayments(req: AuthenticatedRequest, res: Response): Promise<void> {
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

      const result = await manualPaymentService.processBatchPayments(
        req.body,
        organizationId,
        auditContext
      );

      res.status(201).json({
        message: 'Batch payments processed',
        ...result
      });
    } catch (error) {
      res.status(400).json({
        error: 'Failed to process batch payments',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async reconcilePayments(req: AuthenticatedRequest, res: Response): Promise<void> {
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

      const result = await manualPaymentService.reconcilePayments(
        req.body,
        organizationId,
        auditContext
      );

      res.json({
        message: 'Payments reconciled successfully',
        ...result
      });
    } catch (error) {
      res.status(400).json({
        error: 'Failed to reconcile payments',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async createPaymentPlan(req: AuthenticatedRequest, res: Response): Promise<void> {
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

      const result = await manualPaymentService.createPaymentPlan(
        req.body,
        organizationId,
        auditContext
      );

      res.status(201).json({
        message: 'Payment plan created successfully',
        ...result
      });
    } catch (error) {
      res.status(400).json({
        error: 'Failed to create payment plan',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async allocatePartialPayment(req: AuthenticatedRequest, res: Response): Promise<void> {
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

      const payment = await manualPaymentService.allocatePartialPayment(
        req.body,
        organizationId,
        auditContext
      );

      res.json({
        message: 'Partial payment allocated successfully',
        payment
      });
    } catch (error) {
      res.status(400).json({
        error: 'Failed to allocate partial payment',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async updateChequeStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          error: 'Validation Error',
          details: errors.array()
        });
        return;
      }

      const { paymentId } = req.params;
      const { status, clearingDate, notes } = req.body;
      const organizationId = req.user?.organizationId;

      if (!organizationId) {
        res.status(401).json({
          error: 'Organization ID is required'
        });
        return;
      }

      const auditContext = {
        userId: req.user!.id,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      };

      const payment = await manualPaymentService.updateChequeStatus(
        paymentId,
        status,
        clearingDate ? new Date(clearingDate) : undefined,
        notes,
        organizationId,
        auditContext
      );

      res.json({
        message: 'Cheque status updated successfully',
        payment
      });
    } catch (error) {
      res.status(400).json({
        error: 'Failed to update cheque status',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}

// Validation middleware
export const validateCreateManualPayment = [
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
    .isIn([PaymentMethod.CASH, PaymentMethod.CHEQUE, PaymentMethod.BANK_TRANSFER, PaymentMethod.OTHER])
    .withMessage('Invalid payment method for manual payments'),

  body('paymentDate')
    .optional()
    .isISO8601()
    .withMessage('Payment date must be a valid ISO date'),

  body('referenceNumber')
    .optional()
    .isLength({ max: 100 })
    .withMessage('Reference number must be 100 characters or less'),

  body('chequeNumber')
    .optional()
    .isLength({ max: 50 })
    .withMessage('Cheque number must be 50 characters or less'),

  body('bankReference')
    .optional()
    .isLength({ max: 100 })
    .withMessage('Bank reference must be 100 characters or less'),

  body('exchangeRate')
    .optional()
    .isFloat({ min: 0.001 })
    .withMessage('Exchange rate must be a positive number'),

  body('originalAmount')
    .optional()
    .isFloat({ min: 0.01 })
    .withMessage('Original amount must be a positive number'),

  body('originalCurrency')
    .optional()
    .isLength({ min: 3, max: 3 })
    .withMessage('Original currency must be a 3-letter ISO code'),

  body('customerNotes')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Customer notes must be 1000 characters or less'),

  body('adminNotes')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Admin notes must be 1000 characters or less'),

  body('receiptDocuments')
    .optional()
    .isArray()
    .withMessage('Receipt documents must be an array'),

  body('receiptDocuments.*')
    .optional()
    .isURL()
    .withMessage('Each receipt document must be a valid URL'),

  body('metadata')
    .optional()
    .isObject()
    .withMessage('Metadata must be an object')
];

export const validateBatchPayments = [
  body('payments')
    .isArray({ min: 1 })
    .withMessage('Payments array is required and must contain at least one payment'),

  body('payments.*.customerId')
    .notEmpty()
    .withMessage('Customer ID is required for each payment')
    .isUUID()
    .withMessage('Customer ID must be a valid UUID'),

  body('payments.*.amount')
    .isFloat({ min: 0.01 })
    .withMessage('Amount must be a positive number for each payment'),

  body('payments.*.paymentMethod')
    .isIn([PaymentMethod.CASH, PaymentMethod.CHEQUE, PaymentMethod.BANK_TRANSFER, PaymentMethod.OTHER])
    .withMessage('Invalid payment method for manual payments'),

  body('batchReference')
    .optional()
    .isLength({ max: 100 })
    .withMessage('Batch reference must be 100 characters or less'),

  body('batchNotes')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Batch notes must be 1000 characters or less')
];

export const validateReconcilePayments = [
  body('bankStatementReference')
    .notEmpty()
    .withMessage('Bank statement reference is required')
    .isLength({ max: 100 })
    .withMessage('Bank statement reference must be 100 characters or less'),

  body('bankStatementDate')
    .notEmpty()
    .withMessage('Bank statement date is required')
    .isISO8601()
    .withMessage('Bank statement date must be a valid ISO date'),

  body('bankAmount')
    .isFloat({ min: 0.01 })
    .withMessage('Bank amount must be a positive number'),

  body('paymentIds')
    .isArray({ min: 1 })
    .withMessage('Payment IDs array is required and must contain at least one payment ID'),

  body('paymentIds.*')
    .isUUID()
    .withMessage('Each payment ID must be a valid UUID'),

  body('reconciliationNotes')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Reconciliation notes must be 1000 characters or less')
];

export const validateCreatePaymentPlan = [
  body('customerId')
    .notEmpty()
    .withMessage('Customer ID is required')
    .isUUID()
    .withMessage('Customer ID must be a valid UUID'),

  body('invoiceId')
    .optional()
    .isUUID()
    .withMessage('Invoice ID must be a valid UUID'),

  body('totalAmount')
    .isFloat({ min: 0.01 })
    .withMessage('Total amount must be a positive number'),

  body('currency')
    .optional()
    .isLength({ min: 3, max: 3 })
    .withMessage('Currency must be a 3-letter ISO code'),

  body('installments')
    .isArray({ min: 1 })
    .withMessage('Installments array is required and must contain at least one installment'),

  body('installments.*.amount')
    .isFloat({ min: 0.01 })
    .withMessage('Each installment amount must be a positive number'),

  body('installments.*.dueDate')
    .isISO8601()
    .withMessage('Each installment due date must be a valid ISO date'),

  body('installments.*.description')
    .optional()
    .isLength({ max: 200 })
    .withMessage('Installment description must be 200 characters or less'),

  body('paymentMethod')
    .optional()
    .isIn(Object.values(PaymentMethod))
    .withMessage('Invalid payment method'),

  body('setupFee')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Setup fee must be non-negative'),

  body('interestRate')
    .optional()
    .isFloat({ min: 0, max: 1 })
    .withMessage('Interest rate must be between 0 and 1'),

  body('notes')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Notes must be 1000 characters or less')
];

export const validateAllocatePartialPayment = [
  body('paymentId')
    .notEmpty()
    .withMessage('Payment ID is required')
    .isUUID()
    .withMessage('Payment ID must be a valid UUID'),

  body('allocations')
    .isArray({ min: 1 })
    .withMessage('Allocations array is required and must contain at least one allocation'),

  body('allocations.*.invoiceId')
    .notEmpty()
    .withMessage('Invoice ID is required for each allocation')
    .isUUID()
    .withMessage('Invoice ID must be a valid UUID'),

  body('allocations.*.amount')
    .isFloat({ min: 0.01 })
    .withMessage('Amount must be a positive number for each allocation'),

  body('allocations.*.description')
    .optional()
    .isLength({ max: 200 })
    .withMessage('Allocation description must be 200 characters or less')
];

export const validateUpdateChequeStatus = [
  param('paymentId')
    .isUUID()
    .withMessage('Payment ID must be a valid UUID'),

  body('status')
    .isIn(['CLEARED', 'BOUNCED', 'CANCELLED'])
    .withMessage('Status must be CLEARED, BOUNCED, or CANCELLED'),

  body('clearingDate')
    .optional()
    .isISO8601()
    .withMessage('Clearing date must be a valid ISO date'),

  body('notes')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Notes must be 500 characters or less')
];

export const manualPaymentController = new ManualPaymentController();