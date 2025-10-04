import { Response } from 'express';
import { body, query, validationResult } from 'express-validator';
import { invoiceService } from '../services/invoice.service';
import { InvoiceStatus } from '../types/enums';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { Decimal } from '@prisma/client/runtime/library';

// Validation rules
export const validateCreateInvoice = [
  body('customerId').notEmpty().withMessage('Customer ID is required'),
  body('dueDate').isISO8601().withMessage('Valid due date is required'),
  body('depositRequired').isFloat({ min: 0 }).withMessage('Deposit required must be non-negative'),
  body('currency').optional().isLength({ min: 3, max: 3 }).withMessage('Currency must be 3 characters'),
  body('exchangeRate').optional().isFloat({ min: 0.01 }).withMessage('Exchange rate must be positive'),
  body('terms').optional().trim(),
  body('notes').optional().trim(),
  body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
  body('items.*.description').notEmpty().trim().withMessage('Item description is required'),
  body('items.*.quantity').isFloat({ min: 0.01 }).withMessage('Item quantity must be positive'),
  body('items.*.unitPrice').isFloat({ min: 0 }).withMessage('Item unit price must be non-negative'),
  body('items.*.discountPercent').optional().isFloat({ min: 0, max: 100 }).withMessage('Discount percent must be between 0 and 100'),
  body('items.*.taxRate').isFloat({ min: 0, max: 100 }).withMessage('Tax rate must be between 0 and 100'),
  body('items.*.productId').optional().isString(),
  body('items.*.serviceId').optional().isString()
];

export const validateCreateInvoiceFromQuote = [
  body('quoteId').notEmpty().withMessage('Quote ID is required'),
  body('dueDate').optional().isISO8601().withMessage('Valid due date is required'),
  body('depositRequired').optional().isFloat({ min: 0 }).withMessage('Deposit required must be non-negative'),
  body('terms').optional().trim(),
  body('notes').optional().trim()
];

export const validateUpdateInvoice = [
  body('dueDate').optional().isISO8601().withMessage('Valid due date is required'),
  body('depositRequired').optional().isFloat({ min: 0 }).withMessage('Deposit required must be non-negative'),
  body('currency').optional().isLength({ min: 3, max: 3 }).withMessage('Currency must be 3 characters'),
  body('exchangeRate').optional().isFloat({ min: 0.01 }).withMessage('Exchange rate must be positive'),
  body('terms').optional().trim(),
  body('notes').optional().trim(),
  body('items').optional().isArray({ min: 1 }).withMessage('At least one item is required'),
  body('items.*.description').optional().notEmpty().trim().withMessage('Item description is required'),
  body('items.*.quantity').optional().isFloat({ min: 0.01 }).withMessage('Item quantity must be positive'),
  body('items.*.unitPrice').optional().isFloat({ min: 0 }).withMessage('Item unit price must be non-negative'),
  body('items.*.discountPercent').optional().isFloat({ min: 0, max: 100 }).withMessage('Discount percent must be between 0 and 100'),
  body('items.*.taxRate').optional().isFloat({ min: 0, max: 100 }).withMessage('Tax rate must be between 0 and 100'),
  body('items.*.productId').optional().isString(),
  body('items.*.serviceId').optional().isString()
];

export const validateListInvoices = [
  query('customerId').optional().isString(),
  query('status').optional().isIn(Object.values(InvoiceStatus)),
  query('issueDateFrom').optional().isISO8601().withMessage('Valid issue date from is required'),
  query('issueDateTo').optional().isISO8601().withMessage('Valid issue date to is required'),
  query('dueDateFrom').optional().isISO8601().withMessage('Valid due date from is required'),
  query('dueDateTo').optional().isISO8601().withMessage('Valid due date to is required'),
  query('isPastDue').optional().isBoolean(),
  query('hasBalance').optional().isBoolean(),
  query('search').optional().trim(),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be non-negative')
];

export const validateRecordPayment = [
  body('paymentAmount').isFloat({ min: 0.01 }).withMessage('Payment amount must be positive')
];

export const validateCancelInvoice = [
  body('cancellationReason').optional().trim()
];

export class InvoiceController {
  async createInvoice(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const invoiceData = {
        customerId: req.body.customerId,
        quoteId: req.body.quoteId,
        issueDate: req.body.issueDate ? new Date(req.body.issueDate) : undefined,
        dueDate: new Date(req.body.dueDate),
        currency: req.body.currency,
        exchangeRate: req.body.exchangeRate ? parseFloat(req.body.exchangeRate) : undefined,
        depositRequired: new Decimal(req.body.depositRequired),
        terms: req.body.terms,
        notes: req.body.notes,
        items: req.body.items.map((item: any) => ({
          productId: item.productId,
          serviceId: item.serviceId,
          description: item.description,
          quantity: new Decimal(item.quantity),
          unitPrice: new Decimal(item.unitPrice),
          discountPercent: item.discountPercent ? new Decimal(item.discountPercent) : undefined,
          taxRate: new Decimal(item.taxRate)
        }))
      };

      const invoice = await invoiceService.createInvoice(
        invoiceData,
        req.user.organizationId,
        {
          userId: req.user.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      );

      res.status(201).json({
        message: 'Invoice created successfully',
        invoice: {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          status: invoice.status,
          issueDate: invoice.issueDate,
          dueDate: invoice.dueDate,
          currency: invoice.currency,
          subtotal: invoice.subtotal,
          taxAmount: invoice.taxAmount,
          total: invoice.total,
          depositRequired: invoice.depositRequired,
          amountPaid: invoice.amountPaid,
          balance: invoice.balance,
          customer: invoice.customer,
          items: invoice.items,
          createdAt: invoice.createdAt
        }
      });
    } catch (error: any) {
      if (error.message === 'Customer not found' || error.message === 'Quote not found or does not belong to this customer') {
        res.status(404).json({ error: error.message });
      } else if (error.message.includes('Only accepted quotes') || error.message.includes('already been converted') || error.message.includes('cannot exceed') || error.message.includes('cannot be negative')) {
        res.status(409).json({ error: error.message });
      } else {
        res.status(500).json({ error: error.message });
      }
    }
  }

  async createInvoiceFromQuote(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const options = {
        dueDate: req.body.dueDate ? new Date(req.body.dueDate) : undefined,
        depositRequired: req.body.depositRequired ? parseFloat(req.body.depositRequired) : undefined,
        terms: req.body.terms,
        notes: req.body.notes
      };

      const invoice = await invoiceService.createInvoiceFromQuote(
        req.body.quoteId,
        req.user.organizationId,
        {
          userId: req.user.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        },
        options
      );

      res.status(201).json({
        message: 'Invoice created from quote successfully',
        invoice: {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          status: invoice.status,
          issueDate: invoice.issueDate,
          dueDate: invoice.dueDate,
          currency: invoice.currency,
          subtotal: invoice.subtotal,
          taxAmount: invoice.taxAmount,
          total: invoice.total,
          depositRequired: invoice.depositRequired,
          amountPaid: invoice.amountPaid,
          balance: invoice.balance,
          customer: invoice.customer,
          quote: invoice.quote,
          items: invoice.items,
          createdAt: invoice.createdAt
        }
      });
    } catch (error: any) {
      if (error.message === 'Quote not found') {
        res.status(404).json({ error: error.message });
      } else if (error.message.includes('Only accepted quotes') || error.message.includes('already been converted')) {
        res.status(409).json({ error: error.message });
      } else {
        res.status(500).json({ error: error.message });
      }
    }
  }

  async getInvoice(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const invoice = await invoiceService.getInvoice(
        req.params.id,
        req.user.organizationId,
        {
          userId: req.user.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      );

      if (!invoice) {
        res.status(404).json({ error: 'Invoice not found' });
        return;
      }

      res.json({
        invoice: {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          status: invoice.status,
          issueDate: invoice.issueDate,
          dueDate: invoice.dueDate,
          currency: invoice.currency,
          exchangeRate: invoice.exchangeRate,
          subtotal: invoice.subtotal,
          taxAmount: invoice.taxAmount,
          total: invoice.total,
          depositRequired: invoice.depositRequired,
          amountPaid: invoice.amountPaid,
          balance: invoice.balance,
          terms: invoice.terms,
          notes: invoice.notes,
          sentAt: invoice.sentAt,
          viewedAt: invoice.viewedAt,
          paidAt: invoice.paidAt,
          customer: invoice.customer,
          quote: invoice.quote,
          items: invoice.items,
          createdAt: invoice.createdAt,
          updatedAt: invoice.updatedAt
        }
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  async updateInvoice(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const updateData: any = {};
      if (req.body.dueDate !== undefined) updateData.dueDate = new Date(req.body.dueDate);
      if (req.body.currency !== undefined) updateData.currency = req.body.currency;
      if (req.body.exchangeRate !== undefined) updateData.exchangeRate = parseFloat(req.body.exchangeRate);
      if (req.body.depositRequired !== undefined) updateData.depositRequired = new Decimal(req.body.depositRequired);
      if (req.body.terms !== undefined) updateData.terms = req.body.terms;
      if (req.body.notes !== undefined) updateData.notes = req.body.notes;
      if (req.body.items !== undefined) {
        updateData.items = req.body.items.map((item: any) => ({
          productId: item.productId,
          serviceId: item.serviceId,
          description: item.description,
          quantity: new Decimal(item.quantity),
          unitPrice: new Decimal(item.unitPrice),
          discountPercent: item.discountPercent ? new Decimal(item.discountPercent) : undefined,
          taxRate: new Decimal(item.taxRate)
        }));
      }

      const invoice = await invoiceService.updateInvoice(
        req.params.id,
        updateData,
        req.user.organizationId,
        {
          userId: req.user.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      );

      res.json({
        message: 'Invoice updated successfully',
        invoice: {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          status: invoice.status,
          dueDate: invoice.dueDate,
          currency: invoice.currency,
          exchangeRate: invoice.exchangeRate,
          subtotal: invoice.subtotal,
          taxAmount: invoice.taxAmount,
          total: invoice.total,
          depositRequired: invoice.depositRequired,
          balance: invoice.balance,
          items: invoice.items,
          updatedAt: invoice.updatedAt
        }
      });
    } catch (error: any) {
      if (error.message === 'Invoice not found') {
        res.status(404).json({ error: error.message });
      } else if (error.message.includes('Only draft invoices') || error.message.includes('cannot exceed') || error.message.includes('cannot be negative')) {
        res.status(409).json({ error: error.message });
      } else {
        res.status(500).json({ error: error.message });
      }
    }
  }

  async listInvoices(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const filters = {
        customerId: req.query.customerId as string,
        status: req.query.status as InvoiceStatus,
        issueDateFrom: req.query.issueDateFrom as string,
        issueDateTo: req.query.issueDateTo as string,
        dueDateFrom: req.query.dueDateFrom as string,
        dueDateTo: req.query.dueDateTo as string,
        isPastDue: req.query.isPastDue === 'true' ? true : req.query.isPastDue === 'false' ? false : undefined,
        hasBalance: req.query.hasBalance === 'true' ? true : req.query.hasBalance === 'false' ? false : undefined,
        search: req.query.search as string,
        limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
        offset: req.query.offset ? parseInt(req.query.offset as string) : undefined
      };

      const result = await invoiceService.listInvoices(filters, req.user.organizationId);

      res.json({
        invoices: result.invoices.map(invoice => ({
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          status: invoice.status,
          issueDate: invoice.issueDate,
          dueDate: invoice.dueDate,
          currency: invoice.currency,
          subtotal: invoice.subtotal,
          taxAmount: invoice.taxAmount,
          total: invoice.total,
          depositRequired: invoice.depositRequired,
          amountPaid: invoice.amountPaid,
          balance: invoice.balance,
          customer: invoice.customer,
          itemCount: invoice.items?.length || 0,
          createdAt: invoice.createdAt
        })),
        pagination: {
          total: result.total,
          limit: filters.limit || 50,
          offset: filters.offset || 0
        }
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  async sendInvoice(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const invoice = await invoiceService.sendInvoice(
        req.params.id,
        req.user.organizationId,
        {
          userId: req.user.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      );

      res.json({
        message: 'Invoice sent successfully',
        invoice: {
          id: invoice.id,
          status: invoice.status,
          sentAt: invoice.sentAt
        }
      });
    } catch (error: any) {
      if (error.message === 'Invoice not found') {
        res.status(404).json({ error: error.message });
      } else if (error.message.includes('Only draft invoices')) {
        res.status(409).json({ error: error.message });
      } else {
        res.status(500).json({ error: error.message });
      }
    }
  }

  async markInvoiceAsViewed(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const invoice = await invoiceService.markInvoiceAsViewed(
        req.params.id,
        req.user.organizationId,
        {
          userId: req.user.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      );

      res.json({
        message: 'Invoice marked as viewed',
        invoice: {
          id: invoice.id,
          status: invoice.status,
          viewedAt: invoice.viewedAt
        }
      });
    } catch (error: any) {
      if (error.message === 'Invoice not found') {
        res.status(404).json({ error: error.message });
      } else {
        res.status(500).json({ error: error.message });
      }
    }
  }

  async cancelInvoice(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const { cancellationReason } = req.body;

      const invoice = await invoiceService.cancelInvoice(
        req.params.id,
        req.user.organizationId,
        {
          userId: req.user.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        },
        cancellationReason
      );

      res.json({
        message: 'Invoice cancelled successfully',
        invoice: {
          id: invoice.id,
          status: invoice.status,
          notes: invoice.notes,
          updatedAt: invoice.updatedAt
        }
      });
    } catch (error: any) {
      if (error.message === 'Invoice not found') {
        res.status(404).json({ error: error.message });
      } else if (error.message.includes('Cannot cancel')) {
        res.status(409).json({ error: error.message });
      } else {
        res.status(500).json({ error: error.message });
      }
    }
  }

  async recordPayment(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const { paymentAmount } = req.body;

      const invoice = await invoiceService.recordPayment(
        req.params.id,
        parseFloat(paymentAmount),
        req.user.organizationId,
        {
          userId: req.user.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      );

      res.json({
        message: 'Payment recorded successfully',
        invoice: {
          id: invoice.id,
          status: invoice.status,
          amountPaid: invoice.amountPaid,
          balance: invoice.balance,
          paidAt: invoice.paidAt,
          updatedAt: invoice.updatedAt
        }
      });
    } catch (error: any) {
      if (error.message === 'Invoice not found') {
        res.status(404).json({ error: error.message });
      } else if (error.message.includes('Cannot record payment') || error.message.includes('Payment amount') || error.message.includes('exceeds remaining')) {
        res.status(409).json({ error: error.message });
      } else {
        res.status(500).json({ error: error.message });
      }
    }
  }

  async getInvoiceStats(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const customerId = req.query.customerId as string;
      const stats = await invoiceService.getInvoiceStats(
        req.user.organizationId,
        customerId
      );

      res.json({ stats });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
}

export const invoiceController = new InvoiceController();