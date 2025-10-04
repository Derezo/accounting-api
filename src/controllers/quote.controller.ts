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
  /**
   * @swagger
   * /organizations/{organizationId}/quotes:
   *   post:
   *     tags: [Quotes]
   *     summary: Create a new quote
   *     description: |
   *       Create a new quote for a customer with line items, calculations, and business terms.
   *       This is the first step in the 8-stage customer lifecycle pipeline for project quotes.
   *     parameters:
   *       - $ref: '#/components/parameters/OrganizationId'
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [customerId, description, items]
   *             properties:
   *               customerId:
   *                 type: string
   *                 format: uuid
   *                 description: Customer ID for the quote
   *                 example: "550e8400-e29b-41d4-a716-446655440000"
   *               description:
   *                 type: string
   *                 description: Quote description/title
   *                 example: "Website redesign and development"
   *               validUntil:
   *                 type: string
   *                 format: date
   *                 description: Quote expiration date (default 30 days)
   *                 example: "2024-02-15"
   *               notes:
   *                 type: string
   *                 description: Internal notes
   *                 example: "Customer requested modern design"
   *               terms:
   *                 type: string
   *                 description: Quote terms and conditions
   *                 example: "25% deposit required, 15-day payment terms"
   *               items:
   *                 type: array
   *                 minItems: 1
   *                 description: Quote line items
   *                 items:
   *                   type: object
   *                   required: [description, quantity, unitPrice, taxRate]
   *                   properties:
   *                     description:
   *                       type: string
   *                       description: Item description
   *                       example: "Frontend development"
   *                     quantity:
   *                       type: number
   *                       format: decimal
   *                       minimum: 0.01
   *                       description: Item quantity
   *                       example: 40.0
   *                     unitPrice:
   *                       type: number
   *                       format: decimal
   *                       minimum: 0
   *                       description: Price per unit
   *                       example: 125.00
   *                     taxRate:
   *                       type: number
   *                       format: decimal
   *                       minimum: 0
   *                       maximum: 100
   *                       description: Tax rate percentage
   *                       example: 13.0
   *                     discountPercent:
   *                       type: number
   *                       format: decimal
   *                       minimum: 0
   *                       maximum: 100
   *                       description: Discount percentage
   *                       example: 5.0
   *           examples:
   *             WebsiteDevelopmentQuote:
   *               summary: Website development quote
   *               value:
   *                 customerId: "550e8400-e29b-41d4-a716-446655440000"
   *                 description: "E-commerce website development"
   *                 validUntil: "2024-02-15"
   *                 terms: "25% deposit required, 15-day payment terms"
   *                 items:
   *                   - description: "Frontend development"
   *                     quantity: 40
   *                     unitPrice: 125.00
   *                     taxRate: 13.0
   *                   - description: "Backend API development"
   *                     quantity: 30
   *                     unitPrice: 150.00
   *                     taxRate: 13.0
   *                     discountPercent: 10.0
   *     responses:
   *       '201':
   *         description: Quote created successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 message:
   *                   type: string
   *                   example: "Quote created successfully"
   *                 quote:
   *                   $ref: '#/components/schemas/Quote'
   *             example:
   *               message: "Quote created successfully"
   *               quote:
   *                 id: "123e4567-e89b-12d3-a456-426614174000"
   *                 quoteNumber: "QUO-2024-001"
   *                 status: "DRAFT"
   *                 description: "E-commerce website development"
   *                 subtotal: 9500.00
   *                 taxAmount: 1235.00
   *                 total: 10735.00
   *                 validUntil: "2024-02-15"
   *       '400':
   *         $ref: '#/components/responses/ValidationError'
   *       '401':
   *         $ref: '#/components/responses/AuthenticationError'
   *       '403':
   *         $ref: '#/components/responses/AuthorizationError'
   *       '404':
   *         description: Customer not found
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/NotFoundError'
   *       '429':
   *         $ref: '#/components/responses/RateLimitError'
   *       '500':
   *         $ref: '#/components/responses/InternalServerError'
   */
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
        req.params.id,
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
        req.params.id,
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
        req.params.id,
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
        req.params.id,
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
        req.params.id,
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

      const { acceptanceNotes, autoGenerateInvoice } = req.body;

      const result = await quoteService.acceptQuote(
        req.params.id,
        req.user.organizationId,
        {
          userId: req.user.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        },
        acceptanceNotes,
        autoGenerateInvoice !== false // Default to true unless explicitly set to false
      );

      const response: any = {
        message: 'Quote accepted successfully',
        quote: {
          id: result.quote.id,
          status: result.quote.status,
          acceptedAt: result.quote.acceptedAt,
          notes: result.quote.notes
        }
      };

      // Include invoice information if automatically generated
      if (result.invoice) {
        response.invoice = {
          id: result.invoice.id,
          invoiceNumber: result.invoice.invoiceNumber,
          status: result.invoice.status,
          total: result.invoice.total,
          depositRequired: result.invoice.depositRequired,
          balance: result.invoice.balance,
          dueDate: result.invoice.dueDate,
          createdAt: result.invoice.createdAt
        };
        response.message = 'Quote accepted successfully. Invoice automatically generated.';
      }

      // Include suggested appointment times for consultation
      if ((result as any).suggestedAppointments && (result as any).suggestedAppointments.length > 0) {
        (response).suggestedAppointments = (result as any).suggestedAppointments.map((slot: any) => ({
          date: slot.date,
          startTime: slot.startTime,
          endTime: slot.endTime,
          displayTime: `${slot.startTime.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
          })} - ${slot.endTime.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
          })}`
        }));

        if (result.invoice) {
          response.message = 'Quote accepted successfully. Invoice automatically generated. Available consultation times suggested.';
        } else {
          response.message = 'Quote accepted successfully. Available consultation times suggested.';
        }
      }

      res.json(response);
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
        req.params.id,
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
        req.params.id,
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

  async convertToInvoice(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const quoteId = req.params.id;
      const { dueDate, depositRequired, terms, notes } = req.body;
      const { organizationId, id: userId } = req.user!;

      // Validate optional parameters
      const convertOptions: any = {};
      if (dueDate) {
        convertOptions.dueDate = new Date(dueDate);
      }
      if (depositRequired !== undefined) {
        convertOptions.depositRequired = depositRequired;
      }
      if (terms) {
        convertOptions.terms = terms;
      }
      if (notes) {
        convertOptions.notes = notes;
      }

      const invoice = await (quoteService as any).convertToInvoice(
        quoteId,
        organizationId,
        userId,
        convertOptions
      );

      res.json({
        message: 'Quote converted to invoice successfully',
        invoice: {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          status: invoice.status,
          quoteId: invoice.quoteId,
          total: invoice.total,
          dueDate: invoice.dueDate
        }
      });
    } catch (error: any) {
      if (error.message === 'Quote not found') {
        res.status(404).json({ error: error.message });
      } else if (error.message === 'Quote cannot be converted' ||
                 error.message === 'Quote must be in ACCEPTED status to convert to invoice' ||
                 error.message === 'Quote has already been converted to an invoice') {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: error.message });
      }
    }
  }
}

export const quoteController = new QuoteController();