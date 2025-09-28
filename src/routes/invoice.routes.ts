import { Router } from 'express';
import {
  invoiceController,
  validateCreateInvoice,
  validateCreateInvoiceFromQuote,
  validateUpdateInvoice,
  validateListInvoices,
  validateRecordPayment,
  validateCancelInvoice
} from '../controllers/invoice.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { auditMiddleware } from '../middleware/audit.middleware';
import { UserRole } from '../types/enums';

const router = Router();

// Apply authentication to all routes
router.use(authenticate);

// Apply audit logging to all routes
router.use(auditMiddleware);

/**
 * @swagger
 * /invoices:
 *   post:
 *     tags: [Invoices]
 *     summary: Create a new invoice
 *     description: Creates a new invoice for a customer. Supports manual creation or generation from quote. Requires Admin, Manager, Accountant, or Employee role.
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
 *               - dueDate
 *             properties:
 *               customerId:
 *                 type: string
 *                 description: Customer ID for the invoice
 *                 example: "clp1234567890"
 *               quoteId:
 *                 type: string
 *                 description: Optional quote ID if creating from quote
 *                 example: "quo_1234567890"
 *               items:
 *                 type: array
 *                 description: Array of invoice items
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
 *               dueDate:
 *                 type: string
 *                 format: date
 *                 description: Invoice due date
 *                 example: "2024-02-15"
 *               issueDate:
 *                 type: string
 *                 format: date
 *                 description: Invoice issue date (defaults to today)
 *                 example: "2024-01-15"
 *               paymentTerms:
 *                 type: string
 *                 description: Payment terms for the invoice
 *                 enum: ["NET_15", "NET_30", "NET_45", "NET_60", "DUE_ON_RECEIPT"]
 *                 example: "NET_30"
 *               notes:
 *                 type: string
 *                 description: Additional notes for the invoice
 *                 example: "Thank you for your business. Payment due within 30 days."
 *               lateFeePercent:
 *                 type: number
 *                 format: float
 *                 description: Late fee percentage (optional)
 *                 example: 1.5
 *               discountPercent:
 *                 type: number
 *                 format: float
 *                 description: Discount percentage (optional)
 *                 example: 5.0
 *     responses:
 *       201:
 *         description: Invoice created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   description: Invoice ID
 *                   example: "inv_1234567890"
 *                 customerId:
 *                   type: string
 *                   example: "clp1234567890"
 *                 quoteId:
 *                   type: string
 *                   example: "quo_1234567890"
 *                 invoiceNumber:
 *                   type: string
 *                   example: "INV-2024-001"
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
 *                   enum: [DRAFT, SENT, VIEWED, PAID, OVERDUE, CANCELLED]
 *                   example: "DRAFT"
 *                 dueDate:
 *                   type: string
 *                   format: date
 *                 issueDate:
 *                   type: string
 *                   format: date
 *                 paymentTerms:
 *                   type: string
 *                   example: "NET_30"
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
  validateCreateInvoice,
  invoiceController.createInvoice.bind(invoiceController)
);

/**
 * @swagger
 * /invoices/from-quote:
 *   post:
 *     tags: [Invoices]
 *     summary: Create invoice from quote
 *     description: Creates a new invoice based on an accepted quote. Automatically copies items, pricing, and customer information from the quote. Requires Admin, Manager, Accountant, or Employee role.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - quoteId
 *             properties:
 *               quoteId:
 *                 type: string
 *                 description: ID of the accepted quote to convert
 *                 example: "quo_1234567890"
 *               dueDate:
 *                 type: string
 *                 format: date
 *                 description: Custom due date (optional, defaults based on payment terms)
 *                 example: "2024-02-15"
 *               paymentTerms:
 *                 type: string
 *                 description: Payment terms for the invoice
 *                 enum: ["NET_15", "NET_30", "NET_45", "NET_60", "DUE_ON_RECEIPT"]
 *                 example: "NET_30"
 *               notes:
 *                 type: string
 *                 description: Additional notes for the invoice
 *                 example: "Invoice generated from accepted quote QTE-2024-001"
 *               lateFeePercent:
 *                 type: number
 *                 format: float
 *                 description: Late fee percentage (optional)
 *                 example: 1.5
 *     responses:
 *       201:
 *         description: Invoice created from quote successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Invoice created from quote successfully"
 *                 quoteId:
 *                   type: string
 *                   example: "quo_1234567890"
 *                 invoice:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: "inv_1234567890"
 *                     invoiceNumber:
 *                       type: string
 *                       example: "INV-2024-001"
 *                     customerId:
 *                       type: string
 *                       example: "clp1234567890"
 *                     quoteId:
 *                       type: string
 *                       example: "quo_1234567890"
 *                     total:
 *                       type: number
 *                       format: float
 *                       example: 2700.00
 *                     status:
 *                       type: string
 *                       example: "DRAFT"
 *                     dueDate:
 *                       type: string
 *                       format: date
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Invalid quote ID or quote not in accepted status
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
  '/from-quote',
  authorize(UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT, UserRole.EMPLOYEE),
  validateCreateInvoiceFromQuote,
  invoiceController.createInvoiceFromQuote.bind(invoiceController)
);

/**
 * @swagger
 * /invoices:
 *   get:
 *     tags: [Invoices]
 *     summary: List invoices
 *     description: Retrieves a list of invoices with filtering, sorting, and pagination. Available to all authenticated users.
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
 *         description: Number of invoices per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search term for invoice number, customer name, or description
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [DRAFT, SENT, VIEWED, PAID, OVERDUE, CANCELLED]
 *         description: Filter by invoice status
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
 *         description: Filter invoices created from this date
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter invoices created until this date
 *       - in: query
 *         name: dueDateFrom
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter invoices due from this date
 *       - in: query
 *         name: dueDateTo
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter invoices due until this date
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [invoiceNumber, total, status, createdAt, dueDate, issueDate]
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
 *         description: Invoices retrieved successfully
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
 *                         example: "inv_1234567890"
 *                       invoiceNumber:
 *                         type: string
 *                         example: "INV-2024-001"
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
 *                       dueDate:
 *                         type: string
 *                         format: date
 *                       issueDate:
 *                         type: string
 *                         format: date
 *                       paymentTerms:
 *                         type: string
 *                         example: "NET_30"
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
  validateListInvoices,
  invoiceController.listInvoices.bind(invoiceController)
);

/**
 * @swagger
 * /invoices/stats/summary:
 *   get:
 *     tags: [Invoices]
 *     summary: Get invoice statistics summary
 *     description: Retrieves comprehensive invoice statistics including totals, status breakdown, payment analytics, and revenue metrics. Available to all authenticated users.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Invoice statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalInvoices:
 *                   type: integer
 *                   description: Total number of invoices
 *                   example: 250
 *                 statusBreakdown:
 *                   type: object
 *                   properties:
 *                     draft:
 *                       type: integer
 *                       example: 15
 *                     sent:
 *                       type: integer
 *                       example: 45
 *                     viewed:
 *                       type: integer
 *                       example: 25
 *                     paid:
 *                       type: integer
 *                       example: 150
 *                     overdue:
 *                       type: integer
 *                       example: 12
 *                     cancelled:
 *                       type: integer
 *                       example: 3
 *                 revenueMetrics:
 *                   type: object
 *                   properties:
 *                     totalInvoiceValue:
 *                       type: number
 *                       format: float
 *                       example: 675000.00
 *                     paidInvoiceValue:
 *                       type: number
 *                       format: float
 *                       example: 450000.00
 *                     pendingInvoiceValue:
 *                       type: number
 *                       format: float
 *                       example: 180000.00
 *                     overdueInvoiceValue:
 *                       type: number
 *                       format: float
 *                       example: 35000.00
 *                     averageInvoiceValue:
 *                       type: number
 *                       format: float
 *                       example: 2700.00
 *                     averagePaymentTime:
 *                       type: number
 *                       description: Average days to payment
 *                       example: 23.5
 *                 paymentMetrics:
 *                   type: object
 *                   properties:
 *                     onTimePayments:
 *                       type: integer
 *                       example: 135
 *                     latePayments:
 *                       type: integer
 *                       example: 15
 *                     onTimePaymentRate:
 *                       type: number
 *                       format: float
 *                       example: 0.90
 *                     totalLateFees:
 *                       type: number
 *                       format: float
 *                       example: 2500.00
 *                 trends:
 *                   type: object
 *                   properties:
 *                     thisMonth:
 *                       type: object
 *                       properties:
 *                         count:
 *                           type: integer
 *                           example: 25
 *                         value:
 *                           type: number
 *                           format: float
 *                           example: 67500.00
 *                     lastMonth:
 *                       type: object
 *                       properties:
 *                         count:
 *                           type: integer
 *                           example: 20
 *                         value:
 *                           type: number
 *                           format: float
 *                           example: 54000.00
 *                     monthlyGrowth:
 *                       type: object
 *                       properties:
 *                         count:
 *                           type: number
 *                           format: float
 *                           example: 0.25
 *                         value:
 *                           type: number
 *                           format: float
 *                           example: 0.25
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get(
  '/stats/summary',
  invoiceController.getInvoiceStats.bind(invoiceController)
);

/**
 * @swagger
 * /invoices/{id}:
 *   get:
 *     tags: [Invoices]
 *     summary: Get invoice by ID
 *     description: Retrieves a specific invoice by its ID with full details including items, customer information, and payment history. Available to all authenticated users.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Invoice ID
 *         schema:
 *           type: string
 *           example: "inv_1234567890"
 *     responses:
 *       200:
 *         description: Invoice retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   example: "inv_1234567890"
 *                 invoiceNumber:
 *                   type: string
 *                   example: "INV-2024-001"
 *                 customerId:
 *                   type: string
 *                   example: "clp1234567890"
 *                 quoteId:
 *                   type: string
 *                   example: "quo_1234567890"
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
 *                     billingAddress:
 *                       type: object
 *                       properties:
 *                         street:
 *                           type: string
 *                           example: "123 Main St"
 *                         city:
 *                           type: string
 *                           example: "New York"
 *                         state:
 *                           type: string
 *                           example: "NY"
 *                         zipCode:
 *                           type: string
 *                           example: "10001"
 *                         country:
 *                           type: string
 *                           example: "USA"
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
 *                 discountAmount:
 *                   type: number
 *                   format: float
 *                   example: 0.00
 *                 total:
 *                   type: number
 *                   format: float
 *                   example: 2700.00
 *                 status:
 *                   type: string
 *                   enum: [DRAFT, SENT, VIEWED, PAID, OVERDUE, CANCELLED]
 *                   example: "SENT"
 *                 dueDate:
 *                   type: string
 *                   format: date
 *                 issueDate:
 *                   type: string
 *                   format: date
 *                 paymentTerms:
 *                   type: string
 *                   example: "NET_30"
 *                 notes:
 *                   type: string
 *                 lateFeePercent:
 *                   type: number
 *                   format: float
 *                   example: 1.5
 *                 payments:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       amount:
 *                         type: number
 *                         format: float
 *                       paymentDate:
 *                         type: string
 *                         format: date-time
 *                       method:
 *                         type: string
 *                         example: "BANK_TRANSFER"
 *                       reference:
 *                         type: string
 *                 amountPaid:
 *                   type: number
 *                   format: float
 *                   example: 0.00
 *                 amountDue:
 *                   type: number
 *                   format: float
 *                   example: 2700.00
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
 *                 paidAt:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Invoice not found
 *       500:
 *         description: Internal server error
 */
router.get(
  '/:id',
  invoiceController.getInvoice.bind(invoiceController)
);

/**
 * @swagger
 * /invoices/{id}:
 *   put:
 *     tags: [Invoices]
 *     summary: Update invoice
 *     description: Updates an existing invoice. Only invoices in DRAFT status can be updated. Requires Admin, Manager, Accountant, or Employee role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Invoice ID
 *         schema:
 *           type: string
 *           example: "inv_1234567890"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               items:
 *                 type: array
 *                 description: Array of invoice items
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
 *               dueDate:
 *                 type: string
 *                 format: date
 *                 description: Invoice due date
 *                 example: "2024-03-15"
 *               paymentTerms:
 *                 type: string
 *                 description: Payment terms for the invoice
 *                 enum: ["NET_15", "NET_30", "NET_45", "NET_60", "DUE_ON_RECEIPT"]
 *                 example: "NET_45"
 *               notes:
 *                 type: string
 *                 description: Additional notes for the invoice
 *                 example: "Updated invoice with additional CMS functionality"
 *               lateFeePercent:
 *                 type: number
 *                 format: float
 *                 description: Late fee percentage
 *                 example: 2.0
 *               discountPercent:
 *                 type: number
 *                 format: float
 *                 description: Discount percentage
 *                 example: 5.0
 *     responses:
 *       200:
 *         description: Invoice updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 invoiceNumber:
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
 *                 dueDate:
 *                   type: string
 *                   format: date
 *                 updatedAt:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Invalid input data or invoice cannot be updated (not in DRAFT status)
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Invoice not found
 *       500:
 *         description: Internal server error
 */
router.put(
  '/:id',
  authorize(UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT, UserRole.EMPLOYEE),
  validateUpdateInvoice,
  invoiceController.updateInvoice.bind(invoiceController)
);


/**
 * @swagger
 * /invoices/{id}/send:
 *   post:
 *     tags: [Invoices]
 *     summary: Send invoice to customer
 *     description: Sends an invoice to the customer via email and updates status to SENT. Generates PDF invoice and includes payment instructions. Requires Admin, Manager, Accountant, or Employee role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Invoice ID
 *         schema:
 *           type: string
 *           example: "inv_1234567890"
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               emailSubject:
 *                 type: string
 *                 description: Custom email subject (optional)
 *                 example: "Invoice INV-2024-001 from Your Company"
 *               emailMessage:
 *                 type: string
 *                 description: Custom email message (optional)
 *                 example: "Please find attached your invoice. Payment is due within 30 days."
 *               sendCopy:
 *                 type: boolean
 *                 description: Send copy to invoice creator
 *                 example: true
 *     responses:
 *       200:
 *         description: Invoice sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Invoice sent successfully to customer"
 *                 invoice:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     invoiceNumber:
 *                       type: string
 *                       example: "INV-2024-001"
 *                     status:
 *                       type: string
 *                       example: "SENT"
 *                     sentAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *                 emailSent:
 *                   type: boolean
 *                   example: true
 *                 recipientEmail:
 *                   type: string
 *                   example: "john@example.com"
 *       400:
 *         description: Invoice cannot be sent (invalid status, missing customer email, or already sent)
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Invoice not found
 *       500:
 *         description: Internal server error or email sending failure
 */
router.post(
  '/:id/send',
  authorize(UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT, UserRole.EMPLOYEE),
  invoiceController.sendInvoice.bind(invoiceController)
);

/**
 * @swagger
 * /invoices/{id}/viewed:
 *   post:
 *     tags: [Invoices]
 *     summary: Mark invoice as viewed
 *     description: Marks an invoice as viewed by the customer. This is typically called when the customer views the invoice through a public link or email. Available to all authenticated users.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Invoice ID
 *         schema:
 *           type: string
 *           example: "inv_1234567890"
 *     responses:
 *       200:
 *         description: Invoice marked as viewed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Invoice marked as viewed"
 *                 invoice:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     invoiceNumber:
 *                       type: string
 *                       example: "INV-2024-001"
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
 *         description: Invoice cannot be marked as viewed (invalid status)
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Invoice not found
 *       500:
 *         description: Internal server error
 */
router.post(
  '/:id/viewed',
  invoiceController.markInvoiceAsViewed.bind(invoiceController)
);

/**
 * @swagger
 * /invoices/{id}/cancel:
 *   post:
 *     tags: [Invoices]
 *     summary: Cancel invoice
 *     description: Cancels an invoice and updates status to CANCELLED. Only invoices that are not yet paid can be cancelled. Requires Admin or Manager role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Invoice ID
 *         schema:
 *           type: string
 *           example: "inv_1234567890"
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 description: Reason for cancellation (optional)
 *                 example: "Customer requested cancellation due to changed requirements"
 *               notifyCustomer:
 *                 type: boolean
 *                 description: Whether to send cancellation notification to customer
 *                 example: true
 *     responses:
 *       200:
 *         description: Invoice cancelled successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Invoice cancelled successfully"
 *                 invoice:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     invoiceNumber:
 *                       type: string
 *                       example: "INV-2024-001"
 *                     status:
 *                       type: string
 *                       example: "CANCELLED"
 *                     cancelledAt:
 *                       type: string
 *                       format: date-time
 *                     cancellationReason:
 *                       type: string
 *                       example: "Customer requested cancellation"
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *                 notificationSent:
 *                   type: boolean
 *                   description: Whether cancellation notification was sent to customer
 *                   example: true
 *       400:
 *         description: Invoice cannot be cancelled (already paid or invalid status)
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       404:
 *         description: Invoice not found
 *       500:
 *         description: Internal server error
 */
router.post(
  '/:id/cancel',
  authorize(UserRole.ADMIN, UserRole.MANAGER),
  validateCancelInvoice,
  invoiceController.cancelInvoice.bind(invoiceController)
);

/**
 * @swagger
 * /invoices/{id}/payment:
 *   post:
 *     tags: [Invoices]
 *     summary: Record payment for invoice
 *     description: Records a payment against an invoice. Supports partial and full payments. Automatically updates invoice status to PAID when fully paid. Requires Admin, Manager, Accountant, or Employee role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Invoice ID
 *         schema:
 *           type: string
 *           example: "inv_1234567890"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *               - paymentDate
 *               - method
 *             properties:
 *               amount:
 *                 type: number
 *                 format: float
 *                 description: Payment amount (must be positive and not exceed amount due)
 *                 example: 2700.00
 *               paymentDate:
 *                 type: string
 *                 format: date
 *                 description: Date when payment was received
 *                 example: "2024-02-10"
 *               method:
 *                 type: string
 *                 description: Payment method
 *                 enum: ["CASH", "CHECK", "BANK_TRANSFER", "CREDIT_CARD", "PAYPAL", "OTHER"]
 *                 example: "BANK_TRANSFER"
 *               reference:
 *                 type: string
 *                 description: Payment reference or transaction ID
 *                 example: "TXN-20240210-001"
 *               notes:
 *                 type: string
 *                 description: Additional notes about the payment
 *                 example: "Payment received via bank transfer"
 *               applyLateFee:
 *                 type: boolean
 *                 description: Whether to apply late fees if payment is overdue
 *                 default: true
 *     responses:
 *       201:
 *         description: Payment recorded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Payment recorded successfully"
 *                 payment:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: "pay_1234567890"
 *                     invoiceId:
 *                       type: string
 *                       example: "inv_1234567890"
 *                     amount:
 *                       type: number
 *                       format: float
 *                       example: 2700.00
 *                     paymentDate:
 *                       type: string
 *                       format: date
 *                     method:
 *                       type: string
 *                       example: "BANK_TRANSFER"
 *                     reference:
 *                       type: string
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                 invoice:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     invoiceNumber:
 *                       type: string
 *                       example: "INV-2024-001"
 *                     status:
 *                       type: string
 *                       example: "PAID"
 *                     amountPaid:
 *                       type: number
 *                       format: float
 *                       example: 2700.00
 *                     amountDue:
 *                       type: number
 *                       format: float
 *                       example: 0.00
 *                     paidAt:
 *                       type: string
 *                       format: date-time
 *                 lateFeesApplied:
 *                   type: number
 *                   format: float
 *                   description: Amount of late fees applied (if any)
 *                   example: 0.00
 *       400:
 *         description: Invalid payment data (amount exceeds due amount, invalid date, etc.)
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Invoice not found
 *       409:
 *         description: Invoice is already fully paid or cancelled
 *       500:
 *         description: Internal server error
 */
router.post(
  '/:id/payment',
  authorize(UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT, UserRole.EMPLOYEE),
  validateRecordPayment,
  invoiceController.recordPayment.bind(invoiceController)
);


export default router;