import { Response } from 'express';
import { body, query, validationResult } from 'express-validator';
import { quoteService } from '../services/quote.service';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { QuoteStatus } from '../types/enums';

export const validateCreateQuote = [
  body('customerId').notEmpty().withMessage('Customer ID is required'),
  body('description').notEmpty().trim().withMessage('Quote description is required'),
  body('validUntil').optional().isISO8601(),
  body('notes').optional().trim(),
  body('terms').optional().trim(),
  body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
  body('items.*.description').notEmpty().trim().withMessage('Item description is required'),
  body('items.*.quantity').isFloat({ min: 0.01 }).withMessage('Quantity must be greater than 0'),
  body('items.*.unitPrice').isFloat({ min: 0 }).withMessage('Unit price must be 0 or greater'),
  body('items.*.taxRate').isFloat({ min: 0, max: 100 }).withMessage('Tax rate is required and must be between 0 and 100'),
  body('items.*.discountPercent').optional().isFloat({ min: 0, max: 100 })
];

export const validateUpdateQuote = [
  body('description').optional().notEmpty().trim(),
  body('validUntil').optional().isISO8601(),
  body('notes').optional().trim(),
  body('terms').optional().trim(),
  body('status').optional().isIn(Object.values(QuoteStatus)),
  body('items').optional().isArray(),
  body('items.*.description').optional().notEmpty().trim(),
  body('items.*.quantity').optional().isFloat({ min: 0.01 }),
  body('items.*.unitPrice').optional().isFloat({ min: 0 }),
  body('items.*.taxRate').optional().isFloat({ min: 0, max: 100 }),
  body('items.*.discountPercent').optional().isFloat({ min: 0, max: 100 })
];

export const validateListQuotes = [
  query('customerId').optional().isString(),
  query('status').optional().isIn(Object.values(QuoteStatus)),
  query('search').optional().trim(),
  query('validFrom').optional().isISO8601(),
  query('validTo').optional().isISO8601(),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('offset').optional().isInt({ min: 0 })
];

export class QuoteController {
  async createQuote(req: AuthenticatedRequest, res: Response): Promise<void> {
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

      const quote = await quoteService.createQuote(
        req.body,
        req.user.organizationId,
        {
          userId: req.user.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      );

      res.status(201).json({
        message: 'Quote created successfully',
        quote: {
          id: quote.id,
          quoteNumber: quote.quoteNumber,
          description: quote.description,
          status: quote.status,
          subtotal: quote.subtotal,
          taxAmount: quote.taxAmount,
          total: quote.total,
          validUntil: quote.validUntil,
          createdAt: quote.createdAt,
          customer: quote.customer,
          items: quote.items
        }
      });
    } catch (error: any) {
      if (error.message === 'Customer not found') {
        res.status(404).json({ error: error.message });
      } else {
        res.status(500).json({ error: error.message });
      }
    }
  }

  async getQuote(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const quote = await quoteService.getQuote(
        req.params.id!,
        req.user.organizationId,
        {
          userId: req.user.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      );

      if (!quote) {
        res.status(404).json({ error: 'Quote not found' });
        return;
      }

      res.json({
        quote: {
          id: quote.id,
          quoteNumber: quote.quoteNumber,
          description: quote.description,
          status: quote.status,
          subtotal: quote.subtotal,
          taxAmount: quote.taxAmount,
          total: quote.total,
          validUntil: quote.validUntil,
          notes: quote.notes,
          terms: quote.terms,
          sentAt: quote.sentAt,
          createdAt: quote.createdAt,
          updatedAt: quote.updatedAt,
          customer: quote.customer,
          items: quote.items
        }
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  async updateQuote(req: AuthenticatedRequest, res: Response): Promise<void> {
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

      const quote = await quoteService.updateQuote(
        req.params.id!,
        req.body,
        req.user.organizationId,
        {
          userId: req.user.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      );

      res.json({
        message: 'Quote updated successfully',
        quote: {
          id: quote.id,
          quoteNumber: quote.quoteNumber,
          description: quote.description,
          status: quote.status,
          subtotal: quote.subtotal,
          taxAmount: quote.taxAmount,
          total: quote.total,
          validUntil: quote.validUntil,
          notes: quote.notes,
          terms: quote.terms,
          updatedAt: quote.updatedAt,
          items: quote.items
        }
      });
    } catch (error: any) {
      if (error.message === 'Quote not found') {
        res.status(404).json({ error: error.message });
      } else if (error.message.includes('Cannot update quote')) {
        res.status(409).json({ error: error.message });
      } else {
        res.status(500).json({ error: error.message });
      }
    }
  }

  async listQuotes(req: AuthenticatedRequest, res: Response): Promise<void> {
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
        status: req.query.status as QuoteStatus,
        search: req.query.search as string,
        validFrom: req.query.validFrom as string,
        validTo: req.query.validTo as string,
        limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
        offset: req.query.offset ? parseInt(req.query.offset as string) : undefined
      };

      const result = await quoteService.listQuotes(filters, req.user.organizationId);

      res.json({
        quotes: result.quotes.map(quote => ({
          id: quote.id,
          quoteNumber: quote.quoteNumber,
          description: quote.description,
          status: quote.status,
          subtotal: quote.subtotal,
          taxAmount: quote.taxAmount,
          total: quote.total,
          validUntil: quote.validUntil,
          createdAt: quote.createdAt,
          customer: quote.customer,
          itemCount: quote.items?.length || 0
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

  async sendQuote(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const quote = await quoteService.sendQuote(
        req.params.id!,
        req.user.organizationId,
        {
          userId: req.user.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      );

      res.json({
        message: 'Quote sent successfully',
        quote: {
          id: quote.id,
          status: quote.status,
          sentAt: quote.sentAt
        }
      });
    } catch (error: any) {
      if (error.message === 'Quote not found') {
        res.status(404).json({ error: error.message });
      } else if (error.message.includes('Only draft quotes')) {
        res.status(409).json({ error: error.message });
      } else {
        res.status(500).json({ error: error.message });
      }
    }
  }

  async deleteQuote(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const quote = await quoteService.deleteQuote(
        req.params.id!,
        req.user.organizationId,
        {
          userId: req.user.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      );

      res.json({
        message: 'Quote deleted successfully',
        quote: {
          id: quote.id,
          deletedAt: quote.deletedAt
        }
      });
    } catch (error: any) {
      if (error.message === 'Quote not found') {
        res.status(404).json({ error: error.message });
      } else if (error.message.includes('Only draft quotes')) {
        res.status(409).json({ error: error.message });
      } else {
        res.status(500).json({ error: error.message });
      }
    }
  }

  async duplicateQuote(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const quote = await quoteService.duplicateQuote(
        req.params.id!,
        req.user.organizationId,
        {
          userId: req.user.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      );

      res.status(201).json({
        message: 'Quote duplicated successfully',
        quote: {
          id: quote.id,
          quoteNumber: quote.quoteNumber,
          description: quote.description,
          status: quote.status,
          total: quote.total,
          createdAt: quote.createdAt,
          items: quote.items
        }
      });
    } catch (error: any) {
      if (error.message === 'Quote not found') {
        res.status(404).json({ error: error.message });
      } else {
        res.status(500).json({ error: error.message });
      }
    }
  }

  async getQuoteStats(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const customerId = req.query.customerId as string;
      const stats = await quoteService.getQuoteStats(
        req.user.organizationId,
        customerId
      );

      res.json({ stats });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  async acceptQuote(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const { acceptanceNotes } = req.body;

      const quote = await quoteService.acceptQuote(
        req.params.id!,
        req.user.organizationId,
        {
          userId: req.user.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        },
        acceptanceNotes
      );

      res.json({
        message: 'Quote accepted successfully',
        quote: {
          id: quote.id,
          status: quote.status,
          acceptedAt: quote.acceptedAt,
          notes: quote.notes
        }
      });
    } catch (error: any) {
      if (error.message === 'Quote not found') {
        res.status(404).json({ error: error.message });
      } else if (error.message.includes('Only sent or viewed quotes')) {
        res.status(409).json({ error: error.message });
      } else if (error.message.includes('expired')) {
        res.status(410).json({ error: error.message });
      } else {
        res.status(500).json({ error: error.message });
      }
    }
  }

  async rejectQuote(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const { rejectionReason } = req.body;

      const quote = await quoteService.rejectQuote(
        req.params.id!,
        req.user.organizationId,
        {
          userId: req.user.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        },
        rejectionReason
      );

      res.json({
        message: 'Quote rejected successfully',
        quote: {
          id: quote.id,
          status: quote.status,
          rejectedAt: quote.rejectedAt,
          notes: quote.notes
        }
      });
    } catch (error: any) {
      if (error.message === 'Quote not found') {
        res.status(404).json({ error: error.message });
      } else if (error.message.includes('Only sent or viewed quotes')) {
        res.status(409).json({ error: error.message });
      } else {
        res.status(500).json({ error: error.message });
      }
    }
  }

  async markQuoteAsViewed(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const quote = await quoteService.markQuoteAsViewed(
        req.params.id!,
        req.user.organizationId,
        {
          userId: req.user.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      );

      res.json({
        message: 'Quote marked as viewed',
        quote: {
          id: quote.id,
          status: quote.status,
          viewedAt: quote.viewedAt
        }
      });
    } catch (error: any) {
      if (error.message === 'Quote not found') {
        res.status(404).json({ error: error.message });
      } else {
        res.status(500).json({ error: error.message });
      }
    }
  }
}

export const quoteController = new QuoteController();