import { Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { etransferService } from '../services/etransfer.service';
import { PaymentStatus } from '../types/enums';
import { AuthenticatedRequest } from '../middleware/auth.middleware';

export class ETransferController {
  async createETransfer(req: AuthenticatedRequest, res: Response): Promise<void> {
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

      if (!organizationId) {
        res.status(401).json({
          error: 'Organization ID is required'
        });
        return;
      }

      const auditContext = {
        userId: req.user!.id,
        ipAddress: req.ip || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown'
      };

      const etransfer = await etransferService.createETransfer(
        req.body,
        organizationId,
        auditContext
      );

      res.status(201).json({
        message: 'E-Transfer created successfully',
        etransfer
      });
    } catch (error) {
      res.status(400).json({
        error: 'Failed to create e-transfer',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async confirmETransferDeposit(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          error: 'Validation Error',
          details: errors.array()
        });
        return;
      }

      const { etransferNumber } = req.params;
      const organizationId = req.user!.organizationId;

      if (!organizationId) {
        res.status(401).json({
          error: 'Organization ID is required'
        });
        return;
      }

      const auditContext = {
        userId: req.user!.id,
        ipAddress: req.ip || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown'
      };

      const etransfer = await etransferService.confirmETransferDeposit(
        {
          etransferNumber,
          ...req.body
        },
        organizationId,
        auditContext
      );

      res.json({
        message: 'E-Transfer deposit confirmed successfully',
        etransfer
      });
    } catch (error) {
      res.status(400).json({
        error: 'Failed to confirm e-transfer deposit',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async cancelETransfer(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          error: 'Validation Error',
          details: errors.array()
        });
        return;
      }

      const { etransferNumber } = req.params;
      const { reason } = req.body;

      if (!etransferNumber) {
        res.status(400).json({
          error: 'E-Transfer number is required'
        });
        return;
      }

      const organizationId = req.user!.organizationId;

      if (!organizationId) {
        res.status(401).json({
          error: 'Organization ID is required'
        });
        return;
      }

      const auditContext = {
        userId: req.user!.id,
        ipAddress: req.ip || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown'
      };

      const etransfer = await etransferService.cancelETransfer(
        etransferNumber,
        reason,
        organizationId,
        auditContext
      );

      res.json({
        message: 'E-Transfer cancelled successfully',
        etransfer
      });
    } catch (error) {
      res.status(400).json({
        error: 'Failed to cancel e-transfer',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async getETransfer(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          error: 'Validation Error',
          details: errors.array()
        });
        return;
      }

      const { etransferNumber } = req.params;
      const organizationId = req.user?.organizationId;

      if (!organizationId) {
        res.status(401).json({
          error: 'Organization ID is required'
        });
        return;
      }

      const etransfer = await etransferService.getETransfer(etransferNumber, organizationId);

      if (!etransfer) {
        res.status(404).json({
          error: 'E-Transfer not found'
        });
        return;
      }

      res.json({ etransfer });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to retrieve e-transfer',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async listETransfers(req: AuthenticatedRequest, res: Response): Promise<void> {
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

      if (!organizationId) {
        res.status(401).json({
          error: 'Organization ID is required'
        });
        return;
      }

      const {
        customerId,
        status,
        startDate,
        endDate,
        recipientEmail,
        page = 1,
        limit = 50
      } = req.query;

      const filter: any = {};
      if (customerId) filter.customerId = customerId as string;
      if (status) filter.status = status as PaymentStatus;
      if (startDate) filter.startDate = new Date(startDate as string);
      if (endDate) filter.endDate = new Date(endDate as string);
      if (recipientEmail) filter.recipientEmail = recipientEmail as string;

      const result = await etransferService.listETransfers(
        organizationId,
        filter,
        parseInt(page as string, 10),
        parseInt(limit as string, 10)
      );

      res.json(result);
    } catch (error) {
      res.status(500).json({
        error: 'Failed to list e-transfers',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async getETransferStats(req: AuthenticatedRequest, res: Response): Promise<void> {
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

      if (!organizationId) {
        res.status(401).json({
          error: 'Organization ID is required'
        });
        return;
      }

      const { startDate, endDate } = req.query;

      const stats = await etransferService.getETransferStats(
        organizationId,
        startDate ? new Date(startDate as string) : undefined,
        endDate ? new Date(endDate as string) : undefined
      );

      res.json({ stats });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to retrieve e-transfer statistics',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async checkExpiredETransfers(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const organizationId = req.user!.organizationId;

      if (!organizationId) {
        res.status(401).json({
          error: 'Organization ID is required'
        });
        return;
      }

      const expiredCount = await etransferService.checkExpiredETransfers(organizationId);

      res.json({
        message: `Processed ${expiredCount} expired e-transfers`,
        expiredCount
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to check expired e-transfers',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}

// Validation middleware
export const validateCreateETransfer = [
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

  body('recipientEmail')
    .notEmpty()
    .withMessage('Recipient email is required')
    .isEmail()
    .withMessage('Recipient email must be valid'),

  body('recipientName')
    .notEmpty()
    .withMessage('Recipient name is required')
    .isLength({ min: 1, max: 100 })
    .withMessage('Recipient name must be between 1 and 100 characters'),

  body('securityQuestion')
    .optional()
    .isLength({ max: 200 })
    .withMessage('Security question must be 200 characters or less'),

  body('securityAnswer')
    .optional()
    .isLength({ max: 100 })
    .withMessage('Security answer must be 100 characters or less'),

  body('message')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Message must be 500 characters or less'),

  body('autoDeposit')
    .optional()
    .isBoolean()
    .withMessage('Auto deposit must be a boolean'),

  body('expiryHours')
    .optional()
    .isInt({ min: 1, max: 168 })
    .withMessage('Expiry hours must be between 1 and 168 (1 week)'),

  body('metadata')
    .optional()
    .isObject()
    .withMessage('Metadata must be an object')
];

export const validateConfirmETransferDeposit = [
  param('etransferNumber')
    .notEmpty()
    .withMessage('E-Transfer number is required')
    .matches(/^ET-\d+-[A-F0-9]+$/)
    .withMessage('Invalid e-transfer number format'),

  body('confirmationCode')
    .optional()
    .isLength({ min: 1, max: 50 })
    .withMessage('Confirmation code must be between 1 and 50 characters'),

  body('depositedAt')
    .optional()
    .isISO8601()
    .withMessage('Deposited date must be a valid ISO date'),

  body('actualAmount')
    .optional()
    .isFloat({ min: 0.01 })
    .withMessage('Actual amount must be a positive number'),

  body('fees')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Fees must be non-negative')
];

export const validateCancelETransfer = [
  param('etransferNumber')
    .notEmpty()
    .withMessage('E-Transfer number is required')
    .matches(/^ET-\d+-[A-F0-9]+$/)
    .withMessage('Invalid e-transfer number format'),

  body('reason')
    .notEmpty()
    .withMessage('Cancellation reason is required')
    .isLength({ min: 1, max: 500 })
    .withMessage('Reason must be between 1 and 500 characters')
];

export const validateListETransfers = [
  query('customerId')
    .optional()
    .isUUID()
    .withMessage('Customer ID must be a valid UUID'),

  query('status')
    .optional()
    .isIn(Object.values(PaymentStatus))
    .withMessage('Invalid payment status'),

  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO date'),

  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid ISO date'),

  query('recipientEmail')
    .optional()
    .isEmail()
    .withMessage('Recipient email must be valid'),

  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
];

export const validateGetETransferStats = [
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO date'),

  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid ISO date')
];

export const validateETransferNumber = [
  param('etransferNumber')
    .notEmpty()
    .withMessage('E-Transfer number is required')
    .matches(/^ET-\d+-[A-F0-9]+$/)
    .withMessage('Invalid e-transfer number format')
];

export const etransferController = new ETransferController();