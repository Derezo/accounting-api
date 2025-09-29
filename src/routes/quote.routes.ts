import { Router } from 'express';
import {
  quoteController,
  validateCreateQuote,
  validateUpdateQuote,
  validateListQuotes
} from '../controllers/quote.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { auditMiddleware } from '../middleware/audit.middleware';
import { UserRole } from '../types/enums';

const router = Router();

// Apply authentication to all routes
router.use(authenticate);

// Apply audit logging to all routes
// router.use(auditMiddleware); // Removed: auditMiddleware returns an object, not a middleware function

/**
 * @swagger
 * /quotes:
 *   post:
 *     tags: [Quotes]
 *     summary: Create a new quote
 *     description: Creates a new quote for a customer. Requires Admin, Manager, Accountant, or Employee role.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - customerId
 *               - items
 *             properties:
 *               customerId:
 *                 type: string
 *                 description: Customer ID for the quote
 *                 example: "clp1234567890"
 *               items:
 *                 type: array
 *                 description: Array of quote items
 *                 items:
 *                   type: object
 *                   required:
 *                     - description
 *                     - quantity
 *                     - unitPrice
 *                   properties:
 *                     description:
 *                       type: string
 *                       example: "Professional Website Development"
 *                     quantity:
 *                       type: number
 *                       example: 1
 *                     unitPrice:
 *                       type: number
 *                       format: float
 *                       example: 2500.00
 *                     notes:
 *                       type: string
 *                       example: "Includes responsive design and SEO optimization"
 *               notes:
 *                 type: string
 *                 description: Additional notes for the quote
 *                 example: "Quote valid for 30 days. Payment terms: 50% upfront, 50% on completion."
 *               validUntil:
 *                 type: string
 *                 format: date
 *                 description: Quote expiration date
 *                 example: "2024-02-15"
 *               termsAndConditions:
 *                 type: string
 *                 description: Terms and conditions for the quote
 *                 example: "All work to be completed within agreed timeframe. Additional requests may incur extra charges."
 *     responses:
 *       201:
 *         description: Quote created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   description: Quote ID
 *                   example: "quo_1234567890"
 *                 customerId:
 *                   type: string
 *                   example: "clp1234567890"
 *                 quoteNumber:
 *                   type: string
 *                   example: "QTE-2024-001"
 *                 items:
 *                   type: array
 *                   items:
 *                     type: object
 *                 subtotal:
 *                   type: number
 *                   format: float
 *                   example: 2500.00
 *                 tax:
 *                   type: number
 *                   format: float
 *                   example: 200.00
 *                 total:
 *                   type: number
 *                   format: float
 *                   example: 2700.00
 *                 status:
 *                   type: string
 *                   enum: [DRAFT, SENT, VIEWED, ACCEPTED, REJECTED, EXPIRED]
 *                   example: "DRAFT"
 *                 validUntil:
 *                   type: string
 *                   format: date
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                 updatedAt:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Invalid input data
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       500:
 *         description: Internal server error
 */
router.post(
  '/',
  authorize(UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT, UserRole.EMPLOYEE),
  validateCreateQuote,
  quoteController.createQuote.bind(quoteController)
);

/**
 * @swagger
 * /quotes:
 *   get:
 *     tags: [Quotes]
 *     summary: List quotes
 *     description: Retrieves a list of quotes with filtering and pagination. Available to all authenticated users.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *         description: Number of quotes per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search term for quote number, customer name, or description
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [DRAFT, SENT, VIEWED, ACCEPTED, REJECTED, EXPIRED]
 *         description: Filter by quote status
 *       - in: query
 *         name: customerId
 *         schema:
 *           type: string
 *         description: Filter by customer ID
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter quotes created from this date
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter quotes created until this date
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [quoteNumber, total, status, createdAt, validUntil]
 *           default: createdAt
 *         description: Field to sort by
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort order
 *     responses:
 *       200:
 *         description: Quotes retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         example: "quo_1234567890"
 *                       quoteNumber:
 *                         type: string
 *                         example: "QTE-2024-001"
 *                       customerId:
 *                         type: string
 *                         example: "clp1234567890"
 *                       customerName:
 *                         type: string
 *                         example: "John Doe"
 *                       total:
 *                         type: number
 *                         format: float
 *                         example: 2700.00
 *                       status:
 *                         type: string
 *                         example: "SENT"
 *                       validUntil:
 *                         type: string
 *                         format: date
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     pages:
 *                       type: integer
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get(
  '/',
  authorize(UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT, UserRole.EMPLOYEE, UserRole.VIEWER, UserRole.CLIENT),
  validateListQuotes,
  quoteController.listQuotes.bind(quoteController)
);

/**
 * @swagger
 * /quotes/stats/summary:
 *   get:
 *     tags: [Quotes]
 *     summary: Get quote statistics summary
 *     description: Retrieves comprehensive quote statistics including totals, status breakdown, conversion rates, and revenue metrics. Available to all authenticated users.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Quote statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalQuotes:
 *                   type: integer
 *                   description: Total number of quotes
 *                   example: 150
 *                 statusBreakdown:
 *                   type: object
 *                   properties:
 *                     draft:
 *                       type: integer
 *                       example: 25
 *                     sent:
 *                       type: integer
 *                       example: 45
 *                     viewed:
 *                       type: integer
 *                       example: 35
 *                     accepted:
 *                       type: integer
 *                       example: 30
 *                     rejected:
 *                       type: integer
 *                       example: 10
 *                     expired:
 *                       type: integer
 *                       example: 5
 *                 conversionRates:
 *                   type: object
 *                   properties:
 *                     viewToAccept:
 *                       type: number
 *                       format: float
 *                       example: 0.75
 *                       description: Percentage of viewed quotes that were accepted
 *                     sentToAccept:
 *                       type: number
 *                       format: float
 *                       example: 0.67
 *                       description: Percentage of sent quotes that were accepted
 *                     overallConversion:
 *                       type: number
 *                       format: float
 *                       example: 0.20
 *                       description: Overall quote to acceptance conversion rate
 *                 revenueMetrics:
 *                   type: object
 *                   properties:
 *                     totalQuoteValue:
 *                       type: number
 *                       format: float
 *                       example: 125000.00
 *                     acceptedQuoteValue:
 *                       type: number
 *                       format: float
 *                       example: 75000.00
 *                     averageQuoteValue:
 *                       type: number
 *                       format: float
 *                       example: 2500.00
 *                     averageAcceptedValue:
 *                       type: number
 *                       format: float
 *                       example: 2500.00
 *                 trends:
 *                   type: object
 *                   properties:
 *                     thisMonth:
 *                       type: integer
 *                       example: 25
 *                     lastMonth:
 *                       type: integer
 *                       example: 20
 *                     monthlyGrowth:
 *                       type: number
 *                       format: float
 *                       example: 0.25
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get(
  '/stats/summary',
  authorize(UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT),
  quoteController.getQuoteStats.bind(quoteController)
);

/**
 * @swagger
 * /quotes/{id}:
 *   get:
 *     tags: [Quotes]
 *     summary: Get quote by ID
 *     description: Retrieves a specific quote by its ID. Available to all authenticated users.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Quote ID
 *         schema:
 *           type: string
 *           example: "quo_1234567890"
 *     responses:
 *       200:
 *         description: Quote retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   example: "quo_1234567890"
 *                 quoteNumber:
 *                   type: string
 *                   example: "QTE-2024-001"
 *                 customerId:
 *                   type: string
 *                   example: "clp1234567890"
 *                 customer:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                       example: "John Doe"
 *                     email:
 *                       type: string
 *                       example: "john@example.com"
 *                 items:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       description:
 *                         type: string
 *                         example: "Professional Website Development"
 *                       quantity:
 *                         type: number
 *                         example: 1
 *                       unitPrice:
 *                         type: number
 *                         format: float
 *                         example: 2500.00
 *                       lineTotal:
 *                         type: number
 *                         format: float
 *                         example: 2500.00
 *                       notes:
 *                         type: string
 *                 subtotal:
 *                   type: number
 *                   format: float
 *                   example: 2500.00
 *                 tax:
 *                   type: number
 *                   format: float
 *                   example: 200.00
 *                 total:
 *                   type: number
 *                   format: float
 *                   example: 2700.00
 *                 status:
 *                   type: string
 *                   enum: [DRAFT, SENT, VIEWED, ACCEPTED, REJECTED, EXPIRED]
 *                   example: "SENT"
 *                 notes:
 *                   type: string
 *                 validUntil:
 *                   type: string
 *                   format: date
 *                 termsAndConditions:
 *                   type: string
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                 updatedAt:
 *                   type: string
 *                   format: date-time
 *                 sentAt:
 *                   type: string
 *                   format: date-time
 *                 viewedAt:
 *                   type: string
 *                   format: date-time
 *                 acceptedAt:
 *                   type: string
 *                   format: date-time
 *                 rejectedAt:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Quote not found
 *       500:
 *         description: Internal server error
 */
router.get(
  '/:id',
  authorize(UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT, UserRole.EMPLOYEE, UserRole.VIEWER, UserRole.CLIENT),
  quoteController.getQuote.bind(quoteController)
);

/**
 * @swagger
 * /quotes/{id}:
 *   put:
 *     tags: [Quotes]
 *     summary: Update quote
 *     description: Updates an existing quote. Only quotes in DRAFT status can be updated. Requires Admin, Manager, Accountant, or Employee role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Quote ID
 *         schema:
 *           type: string
 *           example: "quo_1234567890"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               items:
 *                 type: array
 *                 description: Array of quote items
 *                 items:
 *                   type: object
 *                   required:
 *                     - description
 *                     - quantity
 *                     - unitPrice
 *                   properties:
 *                     description:
 *                       type: string
 *                       example: "Updated Website Development with CMS"
 *                     quantity:
 *                       type: number
 *                       example: 1
 *                     unitPrice:
 *                       type: number
 *                       format: float
 *                       example: 3000.00
 *                     notes:
 *                       type: string
 *                       example: "Includes CMS integration and training"
 *               notes:
 *                 type: string
 *                 description: Additional notes for the quote
 *                 example: "Updated quote with additional CMS functionality"
 *               validUntil:
 *                 type: string
 *                 format: date
 *                 description: Quote expiration date
 *                 example: "2024-03-15"
 *               termsAndConditions:
 *                 type: string
 *                 description: Terms and conditions for the quote
 *     responses:
 *       200:
 *         description: Quote updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 quoteNumber:
 *                   type: string
 *                 customerId:
 *                   type: string
 *                 items:
 *                   type: array
 *                   items:
 *                     type: object
 *                 subtotal:
 *                   type: number
 *                   format: float
 *                 tax:
 *                   type: number
 *                   format: float
 *                 total:
 *                   type: number
 *                   format: float
 *                 status:
 *                   type: string
 *                 updatedAt:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Invalid input data or quote cannot be updated (not in DRAFT status)
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Quote not found
 *       500:
 *         description: Internal server error
 */
router.put(
  '/:id',
  authorize(UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT, UserRole.EMPLOYEE),
  validateUpdateQuote,
  quoteController.updateQuote.bind(quoteController)
);

/**
 * @swagger
 * /quotes/{id}/send:
 *   post:
 *     tags: [Quotes]
 *     summary: Send quote to customer
 *     description: Sends a quote to the customer via email and updates status to SENT. Requires Admin, Manager, Accountant, or Employee role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Quote ID
 *         schema:
 *           type: string
 *           example: "quo_1234567890"
 *     responses:
 *       200:
 *         description: Quote sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Quote sent successfully to customer"
 *                 quote:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     status:
 *                       type: string
 *                       example: "SENT"
 *                     sentAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Quote cannot be sent (invalid status or missing customer email)
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Quote not found
 *       500:
 *         description: Internal server error
 */
router.post(
  '/:id/send',
  authorize(UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT, UserRole.EMPLOYEE),
  quoteController.sendQuote.bind(quoteController)
);

/**
 * @swagger
 * /quotes/{id}/duplicate:
 *   post:
 *     tags: [Quotes]
 *     summary: Duplicate quote
 *     description: Creates a new quote by duplicating an existing one. The new quote will have DRAFT status. Requires Admin, Manager, Accountant, or Employee role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Quote ID to duplicate
 *         schema:
 *           type: string
 *           example: "quo_1234567890"
 *     responses:
 *       201:
 *         description: Quote duplicated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Quote duplicated successfully"
 *                 originalQuoteId:
 *                   type: string
 *                   example: "quo_1234567890"
 *                 newQuote:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: "quo_0987654321"
 *                     quoteNumber:
 *                       type: string
 *                       example: "QTE-2024-002"
 *                     customerId:
 *                       type: string
 *                     status:
 *                       type: string
 *                       example: "DRAFT"
 *                     total:
 *                       type: number
 *                       format: float
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Quote not found
 *       500:
 *         description: Internal server error
 */
router.post(
  '/:id/duplicate',
  authorize(UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT, UserRole.EMPLOYEE),
  quoteController.duplicateQuote.bind(quoteController)
);

/**
 * @swagger
 * /quotes/{id}/accept:
 *   post:
 *     tags: [Quotes]
 *     summary: Accept quote
 *     description: Marks a quote as accepted by the customer. This action typically triggers invoice generation. Requires Admin, Manager, Accountant, or Employee role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Quote ID
 *         schema:
 *           type: string
 *           example: "quo_1234567890"
 *     responses:
 *       200:
 *         description: Quote accepted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Quote accepted successfully"
 *                 quote:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     status:
 *                       type: string
 *                       example: "ACCEPTED"
 *                     acceptedAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *                 invoiceGenerated:
 *                   type: boolean
 *                   description: Whether an invoice was automatically generated
 *                   example: true
 *                 invoiceId:
 *                   type: string
 *                   description: ID of the generated invoice (if applicable)
 *                   example: "inv_1234567890"
 *       400:
 *         description: Quote cannot be accepted (invalid status)
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Quote not found
 *       500:
 *         description: Internal server error
 */
router.post(
  '/:id/accept',
  authorize(UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT, UserRole.EMPLOYEE),
  quoteController.acceptQuote.bind(quoteController)
);

/**
 * @swagger
 * /quotes/{id}/reject:
 *   post:
 *     tags: [Quotes]
 *     summary: Reject quote
 *     description: Marks a quote as rejected by the customer. Requires Admin, Manager, Accountant, or Employee role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Quote ID
 *         schema:
 *           type: string
 *           example: "quo_1234567890"
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 description: Reason for rejection (optional)
 *                 example: "Budget constraints - looking for lower cost option"
 *     responses:
 *       200:
 *         description: Quote rejected successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Quote rejected successfully"
 *                 quote:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     status:
 *                       type: string
 *                       example: "REJECTED"
 *                     rejectedAt:
 *                       type: string
 *                       format: date-time
 *                     rejectionReason:
 *                       type: string
 *                       example: "Budget constraints"
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Quote cannot be rejected (invalid status)
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Quote not found
 *       500:
 *         description: Internal server error
 */
router.post(
  '/:id/reject',
  authorize(UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT, UserRole.EMPLOYEE),
  quoteController.rejectQuote.bind(quoteController)
);

/**
 * @swagger
 * /quotes/{id}/viewed:
 *   post:
 *     tags: [Quotes]
 *     summary: Mark quote as viewed
 *     description: Marks a quote as viewed by the customer. This is typically called when the customer views the quote through a public link. Available to all authenticated users.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Quote ID
 *         schema:
 *           type: string
 *           example: "quo_1234567890"
 *     responses:
 *       200:
 *         description: Quote marked as viewed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Quote marked as viewed"
 *                 quote:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     status:
 *                       type: string
 *                       example: "VIEWED"
 *                     viewedAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Quote cannot be marked as viewed (invalid status)
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Quote not found
 *       500:
 *         description: Internal server error
 */
router.post(
  '/:id/viewed',
  quoteController.markQuoteAsViewed.bind(quoteController)
);

/**
 * @swagger
 * /quotes/{id}/convert-to-invoice:
 *   post:
 *     tags: [Quotes]
 *     summary: Convert quote to invoice
 *     description: Converts an accepted quote to an invoice. The quote must be in ACCEPTED status. Requires Admin, Manager, or Accountant role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Quote ID
 *         schema:
 *           type: string
 *           example: "quo_1234567890"
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               dueDate:
 *                 type: string
 *                 format: date
 *                 description: Due date for the invoice (optional, defaults to 30 days from today)
 *                 example: "2024-02-28"
 *               depositRequired:
 *                 type: number
 *                 minimum: 0
 *                 description: Required deposit amount (optional)
 *                 example: 500.00
 *               terms:
 *                 type: string
 *                 description: Payment terms (optional, uses quote terms if not provided)
 *                 example: "Net 30 days"
 *               notes:
 *                 type: string
 *                 description: Additional notes for the invoice
 *                 example: "Thank you for your business!"
 *     responses:
 *       200:
 *         description: Quote converted to invoice successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Quote converted to invoice successfully"
 *                 invoice:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: "inv_1234567890"
 *                     invoiceNumber:
 *                       type: string
 *                       example: "INV-000123"
 *                     status:
 *                       type: string
 *                       example: "DRAFT"
 *                     quoteId:
 *                       type: string
 *                       example: "quo_1234567890"
 *                     total:
 *                       type: number
 *                       example: 1695.00
 *                     dueDate:
 *                       type: string
 *                       format: date
 *                       example: "2024-02-28"
 *       400:
 *         description: Quote cannot be converted (not in ACCEPTED status or already converted)
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       404:
 *         description: Quote not found
 *       500:
 *         description: Internal server error
 */
router.post(
  '/:id/convert-to-invoice',
  authorize(UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT),
  quoteController.convertToInvoice.bind(quoteController)
);

/**
 * @swagger
 * /quotes/{id}:
 *   delete:
 *     tags: [Quotes]
 *     summary: Delete quote
 *     description: Deletes a quote. Only quotes in DRAFT status can be deleted. Requires Admin or Manager role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Quote ID
 *         schema:
 *           type: string
 *           example: "quo_1234567890"
 *     responses:
 *       200:
 *         description: Quote deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Quote deleted successfully"
 *                 deletedQuoteId:
 *                   type: string
 *                   example: "quo_1234567890"
 *       400:
 *         description: Quote cannot be deleted (not in DRAFT status)
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       404:
 *         description: Quote not found
 *       500:
 *         description: Internal server error
 */
router.delete(
  '/:id',
  authorize(UserRole.ADMIN, UserRole.MANAGER),
  quoteController.deleteQuote.bind(quoteController)
);

export default router;