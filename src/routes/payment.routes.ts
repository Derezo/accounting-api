import { Router } from 'express';
import {
  paymentController,
  validateCreatePayment,
  validateCreateStripePayment,
  validateUpdatePaymentStatus,
  validateListPayments,
  validateRefundPayment,
  validateGetPaymentStats,
  validatePaymentId
} from '../controllers/payment.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { auditMiddleware } from '../middleware/audit.middleware';
import { UserRole } from '../types/enums';

const router = Router();

/**
 * @swagger
 * /payments/webhook/stripe:
 *   post:
 *     tags: [Payments]
 *     summary: Handle Stripe webhook events
 *     description: |
 *       Processes Stripe webhook events for payment status updates. This endpoint does not require authentication
 *       as it uses Stripe's signature validation for security. Handles payment intents status changes,
 *       automatic invoice updates, and payment reconciliation.
 *
 *       **Security Features:**
 *       - Webhook signature validation using Stripe's signing secret
 *       - Request payload verification and timestamp checking
 *       - Idempotency handling for duplicate events
 *       - Secure processing of payment status changes
 *
 *       **Supported Webhook Events:**
 *       - payment_intent.succeeded: Payment completed successfully
 *       - payment_intent.payment_failed: Payment failed
 *       - payment_intent.requires_action: Additional action required
 *       - payment_intent.canceled: Payment was canceled
 *       - charge.dispute.created: Chargeback/dispute initiated
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Stripe webhook event payload
 *             properties:
 *               id:
 *                 type: string
 *                 description: Stripe event ID
 *                 example: "evt_1234567890"
 *               object:
 *                 type: string
 *                 enum: ["event"]
 *                 example: "event"
 *               type:
 *                 type: string
 *                 description: Webhook event type
 *                 example: "payment_intent.succeeded"
 *               data:
 *                 type: object
 *                 properties:
 *                   object:
 *                     type: object
 *                     description: Payment intent or charge object
 *                     properties:
 *                       id:
 *                         type: string
 *                         example: "pi_1234567890"
 *                       amount:
 *                         type: integer
 *                         description: Amount in cents
 *                         example: 250000
 *                       currency:
 *                         type: string
 *                         example: "usd"
 *                       status:
 *                         type: string
 *                         example: "succeeded"
 *                       metadata:
 *                         type: object
 *                         properties:
 *                           invoiceId:
 *                             type: string
 *                             example: "inv_1234567890"
 *     responses:
 *       200:
 *         description: Webhook processed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 received:
 *                   type: boolean
 *                   example: true
 *                 eventId:
 *                   type: string
 *                   example: "evt_1234567890"
 *                 processed:
 *                   type: boolean
 *                   example: true
 *       400:
 *         description: Invalid webhook payload or signature
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Invalid signature"
 *       500:
 *         description: Webhook processing error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Failed to process webhook event"
 */
router.post(
  '/webhook/stripe',
  paymentController.handleStripeWebhook.bind(paymentController)
);

// Apply authentication to all other routes
router.use(authenticate);

// Note: Audit middleware should be applied per-route, not globally
// The auditMiddleware export returns an object with create/update/delete/view methods

/**
 * @swagger
 * /payments:
 *   post:
 *     tags: [Payments]
 *     summary: Create a manual payment record
 *     description: |
 *       Creates a manual payment record for cash, check, bank transfer, or other non-Stripe payment methods.
 *       Automatically updates related invoice status and handles payment allocation. Requires Admin, Manager,
 *       Accountant, or Employee role.
 *
 *       **Payment Processing Workflow:**
 *       - Validates payment method and amount against invoice
 *       - Creates payment record with transaction reference
 *       - Updates invoice status (PAID if full payment, PARTIAL if partial)
 *       - Generates audit trail for payment transaction
 *       - Handles currency conversion if needed
 *       - Calculates and records processing fees
 *
 *       **Supported Payment Methods:**
 *       - CASH: Physical cash payments
 *       - CHECK: Bank checks with check number
 *       - BANK_TRANSFER: Wire transfers and ACH
 *       - CREDIT_CARD: Manual card processing
 *       - PAYPAL: PayPal transactions
 *       - OTHER: Custom payment methods
 *
 *       **Security Measures:**
 *       - Role-based access control
 *       - Payment amount validation
 *       - Transaction reference verification
 *       - Audit logging for compliance
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - invoiceId
 *               - amount
 *               - method
 *             properties:
 *               invoiceId:
 *                 type: string
 *                 description: Invoice ID this payment is for
 *                 example: "inv_1234567890"
 *               amount:
 *                 type: number
 *                 format: float
 *                 description: Payment amount (must be positive)
 *                 minimum: 0.01
 *                 example: 2500.00
 *               method:
 *                 type: string
 *                 enum: ["CASH", "CHECK", "BANK_TRANSFER", "CREDIT_CARD", "PAYPAL", "STRIPE", "OTHER"]
 *                 description: Payment method used
 *                 example: "CHECK"
 *               transactionId:
 *                 type: string
 *                 description: External transaction reference (check number, transfer ID, etc.)
 *                 example: "CHK-001234"
 *               notes:
 *                 type: string
 *                 description: Additional payment notes
 *                 example: "Check #1234 deposited on 2024-01-15"
 *               currency:
 *                 type: string
 *                 description: Payment currency (defaults to USD)
 *                 default: "USD"
 *                 example: "USD"
 *               processingFee:
 *                 type: number
 *                 format: float
 *                 description: Processing fee charged (optional)
 *                 example: 25.00
 *               exchangeRate:
 *                 type: number
 *                 format: float
 *                 description: Exchange rate if different currency
 *                 example: 1.0
 *               paymentDate:
 *                 type: string
 *                 format: date
 *                 description: Date payment was received (defaults to today)
 *                 example: "2024-01-15"
 *     responses:
 *       201:
 *         description: Payment created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   description: Payment ID
 *                   example: "pay_1234567890"
 *                 invoiceId:
 *                   type: string
 *                   example: "inv_1234567890"
 *                 amount:
 *                   type: number
 *                   format: float
 *                   example: 2500.00
 *                 method:
 *                   type: string
 *                   example: "CHECK"
 *                 status:
 *                   type: string
 *                   enum: ["PENDING", "PROCESSING", "COMPLETED", "FAILED", "REFUNDED", "CANCELLED"]
 *                   example: "COMPLETED"
 *                 transactionId:
 *                   type: string
 *                   example: "CHK-001234"
 *                 currency:
 *                   type: string
 *                   example: "USD"
 *                 processingFee:
 *                   type: number
 *                   format: float
 *                   example: 0.00
 *                 paymentDate:
 *                   type: string
 *                   format: date
 *                   example: "2024-01-15"
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                 updatedAt:
 *                   type: string
 *                   format: date-time
 *                 invoice:
 *                   type: object
 *                   description: Updated invoice information
 *                   properties:
 *                     id:
 *                       type: string
 *                     status:
 *                       type: string
 *                       example: "PAID"
 *                     remainingBalance:
 *                       type: number
 *                       format: float
 *                       example: 0.00
 *       400:
 *         description: Invalid payment data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Payment amount exceeds invoice balance"
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       404:
 *         description: Invoice not found
 *       422:
 *         description: Invalid payment method or amount
 *       500:
 *         description: Internal server error
 */
router.post(
  '/',
  authorize(UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT, UserRole.EMPLOYEE),
  validateCreatePayment,
  paymentController.createPayment.bind(paymentController)
);

/**
 * @swagger
 * /payments/stripe:
 *   post:
 *     tags: [Payments]
 *     summary: Create Stripe payment intent
 *     description: |
 *       Creates a Stripe payment intent for credit card processing. This enables secure card payments
 *       through Stripe's payment gateway with PCI compliance. Requires Admin, Manager, Accountant, or Employee role.
 *
 *       **Stripe Integration Features:**
 *       - Creates secure payment intent with client secret
 *       - Supports 3D Secure authentication when required
 *       - Handles payment method attachment and confirmation
 *       - Automatic webhook processing for status updates
 *       - PCI compliant payment processing
 *       - Multi-currency support through Stripe
 *
 *       **Payment Flow:**
 *       1. Create payment intent with invoice metadata
 *       2. Return client secret for frontend processing
 *       3. Customer completes payment on frontend
 *       4. Stripe webhook confirms payment status
 *       5. Invoice status automatically updated
 *
 *       **Security & Compliance:**
 *       - PCI DSS Level 1 compliance through Stripe
 *       - No sensitive card data stored locally
 *       - Secure payment intent validation
 *       - Fraud detection and prevention
 *       - Transaction monitoring and alerts
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - invoiceId
 *               - amount
 *             properties:
 *               invoiceId:
 *                 type: string
 *                 description: Invoice ID for payment intent
 *                 example: "inv_1234567890"
 *               amount:
 *                 type: number
 *                 format: float
 *                 description: Payment amount in dollars
 *                 minimum: 0.50
 *                 example: 2500.00
 *               currency:
 *                 type: string
 *                 description: Payment currency (defaults to USD)
 *                 default: "USD"
 *                 enum: ["USD", "EUR", "GBP", "CAD", "AUD"]
 *                 example: "USD"
 *               paymentMethodTypes:
 *                 type: array
 *                 description: Allowed payment methods
 *                 items:
 *                   type: string
 *                   enum: ["card", "us_bank_account", "link"]
 *                 default: ["card"]
 *                 example: ["card"]
 *               automaticPaymentMethods:
 *                 type: boolean
 *                 description: Enable automatic payment method detection
 *                 default: true
 *                 example: true
 *               captureMethod:
 *                 type: string
 *                 enum: ["automatic", "manual"]
 *                 description: When to capture the payment
 *                 default: "automatic"
 *                 example: "automatic"
 *               confirmationMethod:
 *                 type: string
 *                 enum: ["automatic", "manual"]
 *                 description: How to confirm the payment
 *                 default: "manual"
 *                 example: "manual"
 *               description:
 *                 type: string
 *                 description: Payment description for Stripe dashboard
 *                 example: "Payment for Invoice INV-2024-001"
 *               metadata:
 *                 type: object
 *                 description: Additional metadata for the payment
 *                 properties:
 *                   customerId:
 *                     type: string
 *                     example: "cus_1234567890"
 *                   orderNumber:
 *                     type: string
 *                     example: "ORD-001"
 *     responses:
 *       201:
 *         description: Payment intent created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 paymentIntentId:
 *                   type: string
 *                   description: Stripe payment intent ID
 *                   example: "pi_1234567890abcdef"
 *                 clientSecret:
 *                   type: string
 *                   description: Client secret for frontend confirmation
 *                   example: "pi_1234567890abcdef_secret_xyz"
 *                 amount:
 *                   type: number
 *                   format: float
 *                   example: 2500.00
 *                 currency:
 *                   type: string
 *                   example: "usd"
 *                 status:
 *                   type: string
 *                   enum: ["requires_payment_method", "requires_confirmation", "requires_action", "processing", "requires_capture", "canceled", "succeeded"]
 *                   example: "requires_payment_method"
 *                 invoiceId:
 *                   type: string
 *                   example: "inv_1234567890"
 *                 paymentId:
 *                   type: string
 *                   description: Internal payment record ID
 *                   example: "pay_1234567890"
 *                 nextAction:
 *                   type: object
 *                   description: Next action required (if any)
 *                 ephemeralKey:
 *                   type: string
 *                   description: Ephemeral key for mobile SDK (if requested)
 *                 customer:
 *                   type: string
 *                   description: Stripe customer ID
 *                   example: "cus_1234567890"
 *       400:
 *         description: Invalid payment intent data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Amount must be at least $0.50"
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       404:
 *         description: Invoice not found
 *       422:
 *         description: Payment intent creation failed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Invoice already paid"
 *       500:
 *         description: Stripe API error or internal server error
 */
router.post(
  '/stripe',
  authorize(UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT, UserRole.EMPLOYEE),
  validateCreateStripePayment,
  paymentController.createStripePayment.bind(paymentController)
);

/**
 * @swagger
 * /payments/{id}:
 *   get:
 *     tags: [Payments]
 *     summary: Get payment by ID
 *     description: |
 *       Retrieves detailed information about a specific payment including transaction details,
 *       related invoice information, and payment status. Available to all authenticated users.
 *
 *       **Payment Information Includes:**
 *       - Payment amount, method, and status
 *       - Transaction references and processing fees
 *       - Related invoice and customer details
 *       - Stripe payment intent details (if applicable)
 *       - Payment processing timeline and audit trail
 *       - Refund information (if applicable)
 *
 *       **Security Features:**
 *       - Role-based data filtering
 *       - Sensitive data masking for non-authorized users
 *       - Audit logging for payment access
 *       - PCI compliant data handling
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Payment ID
 *         schema:
 *           type: string
 *           example: "pay_1234567890"
 *     responses:
 *       200:
 *         description: Payment retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   description: Payment ID
 *                   example: "pay_1234567890"
 *                 invoiceId:
 *                   type: string
 *                   description: Related invoice ID
 *                   example: "inv_1234567890"
 *                 amount:
 *                   type: number
 *                   format: float
 *                   description: Payment amount
 *                   example: 2500.00
 *                 method:
 *                   type: string
 *                   enum: ["CASH", "CHECK", "BANK_TRANSFER", "CREDIT_CARD", "PAYPAL", "STRIPE", "OTHER"]
 *                   description: Payment method used
 *                   example: "STRIPE"
 *                 status:
 *                   type: string
 *                   enum: ["PENDING", "PROCESSING", "COMPLETED", "FAILED", "REFUNDED", "CANCELLED"]
 *                   description: Current payment status
 *                   example: "COMPLETED"
 *                 transactionId:
 *                   type: string
 *                   description: External transaction reference
 *                   example: "txn_1234567890"
 *                 stripePaymentIntentId:
 *                   type: string
 *                   description: Stripe payment intent ID (if Stripe payment)
 *                   example: "pi_1234567890abcdef"
 *                 currency:
 *                   type: string
 *                   description: Payment currency
 *                   example: "USD"
 *                 processingFee:
 *                   type: number
 *                   format: float
 *                   description: Processing fee charged
 *                   example: 72.55
 *                 exchangeRate:
 *                   type: number
 *                   format: float
 *                   description: Exchange rate used (if applicable)
 *                   example: 1.0
 *                 paymentDate:
 *                   type: string
 *                   format: date
 *                   description: Date payment was received
 *                   example: "2024-01-15"
 *                 notes:
 *                   type: string
 *                   description: Payment notes
 *                   example: "Payment processed via Stripe"
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                   description: Payment creation timestamp
 *                 updatedAt:
 *                   type: string
 *                   format: date-time
 *                   description: Last update timestamp
 *                 invoice:
 *                   type: object
 *                   description: Related invoice information
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: "inv_1234567890"
 *                     invoiceNumber:
 *                       type: string
 *                       example: "INV-2024-001"
 *                     total:
 *                       type: number
 *                       format: float
 *                       example: 2700.00
 *                     status:
 *                       type: string
 *                       example: "PAID"
 *                     customerId:
 *                       type: string
 *                       example: "cus_1234567890"
 *                 refunds:
 *                   type: array
 *                   description: Refund history (if any)
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         example: "ref_1234567890"
 *                       amount:
 *                         type: number
 *                         format: float
 *                         example: 500.00
 *                       reason:
 *                         type: string
 *                         example: "Customer request"
 *                       refundDate:
 *                         type: string
 *                         format: date
 *                 metadata:
 *                   type: object
 *                   description: Additional payment metadata
 *                   properties:
 *                     ipAddress:
 *                       type: string
 *                       example: "192.168.1.1"
 *                     userAgent:
 *                       type: string
 *                       example: "Mozilla/5.0..."
 *                     riskScore:
 *                       type: number
 *                       example: 25
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       404:
 *         description: Payment not found
 *       500:
 *         description: Internal server error
 */
router.get(
  '/:id',
  authorize(UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT, UserRole.EMPLOYEE, UserRole.VIEWER),
  validatePaymentId,
  paymentController.getPayment.bind(paymentController)
);

/**
 * @swagger
 * /payments/{id}/status:
 *   put:
 *     tags: [Payments]
 *     summary: Update payment status
 *     description: |
 *       Updates the status of a payment record. This endpoint allows authorized users to manually
 *       change payment status for reconciliation, corrections, or administrative purposes.
 *       Requires Admin, Manager, or Accountant role.
 *
 *       **Status Update Scenarios:**
 *       - Mark PENDING payments as COMPLETED when manually verified
 *       - Set payments to FAILED when transactions are declined
 *       - Update to PROCESSING during manual verification
 *       - Cancel payments with CANCELLED status
 *       - Handle refund processing status updates
 *
 *       **Business Impact:**
 *       - Automatic invoice status updates based on payment status
 *       - Accounting reconciliation triggers
 *       - Customer notification workflows
 *       - Financial reporting updates
 *       - Audit trail creation for compliance
 *
 *       **Security Controls:**
 *       - Role-based authorization (Admin/Manager/Accountant only)
 *       - Status transition validation rules
 *       - Comprehensive audit logging
 *       - Prevention of unauthorized status changes
 *       - Workflow integrity protection
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Payment ID
 *         schema:
 *           type: string
 *           example: "pay_1234567890"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: ["PENDING", "PROCESSING", "COMPLETED", "FAILED", "REFUNDED", "CANCELLED"]
 *                 description: New payment status
 *                 example: "COMPLETED"
 *               reason:
 *                 type: string
 *                 description: Reason for status change (required for FAILED, CANCELLED, REFUNDED)
 *                 example: "Manual verification completed"
 *               notes:
 *                 type: string
 *                 description: Additional notes about the status change
 *                 example: "Verified payment receipt via bank statement"
 *               failureReason:
 *                 type: string
 *                 description: Specific failure reason (required if status is FAILED)
 *                 enum: ["INSUFFICIENT_FUNDS", "CARD_DECLINED", "EXPIRED_CARD", "FRAUD_SUSPECTED", "TECHNICAL_ERROR", "OTHER"]
 *                 example: "CARD_DECLINED"
 *               refundAmount:
 *                 type: number
 *                 format: float
 *                 description: Refund amount (required if status is REFUNDED)
 *                 example: 2500.00
 *               externalTransactionId:
 *                 type: string
 *                 description: External transaction ID for reference
 *                 example: "ext_txn_1234567890"
 *     responses:
 *       200:
 *         description: Payment status updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   description: Payment ID
 *                   example: "pay_1234567890"
 *                 status:
 *                   type: string
 *                   description: Updated payment status
 *                   example: "COMPLETED"
 *                 previousStatus:
 *                   type: string
 *                   description: Previous payment status
 *                   example: "PENDING"
 *                 updatedAt:
 *                   type: string
 *                   format: date-time
 *                   description: Status update timestamp
 *                 updatedBy:
 *                   type: string
 *                   description: User who updated the status
 *                   example: "user_1234567890"
 *                 invoice:
 *                   type: object
 *                   description: Updated invoice information
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: "inv_1234567890"
 *                     status:
 *                       type: string
 *                       description: Updated invoice status
 *                       example: "PAID"
 *                     remainingBalance:
 *                       type: number
 *                       format: float
 *                       description: Remaining invoice balance
 *                       example: 0.00
 *                 notifications:
 *                   type: object
 *                   description: Triggered notifications
 *                   properties:
 *                     customerNotified:
 *                       type: boolean
 *                       example: true
 *                     emailSent:
 *                       type: boolean
 *                       example: true
 *       400:
 *         description: Invalid status update request
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Invalid status transition from COMPLETED to PENDING"
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       403:
 *         description: Forbidden - Insufficient permissions (requires Admin/Manager/Accountant role)
 *       404:
 *         description: Payment not found
 *       422:
 *         description: Invalid status transition or missing required fields
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Failure reason required when setting status to FAILED"
 *       500:
 *         description: Internal server error
 */
router.put(
  '/:id/status',
  authorize(UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT),
  validateUpdatePaymentStatus,
  paymentController.updatePaymentStatus.bind(paymentController)
);

/**
 * @swagger
 * /payments:
 *   get:
 *     tags: [Payments]
 *     summary: List payments with filtering and pagination
 *     description: |
 *       Retrieves a paginated list of payments with comprehensive filtering options.
 *       Supports filtering by status, method, date range, customer, and invoice.
 *       Available to all authenticated users with role-based data access.
 *
 *       **Filtering Capabilities:**
 *       - Filter by payment status (PENDING, COMPLETED, FAILED, etc.)
 *       - Filter by payment method (CASH, CHECK, STRIPE, etc.)
 *       - Date range filtering for payment dates
 *       - Customer-specific payment history
 *       - Invoice-related payments
 *       - Amount range filtering
 *       - Currency-based filtering
 *
 *       **Business Use Cases:**
 *       - Daily payment reconciliation reports
 *       - Customer payment history analysis
 *       - Payment method performance tracking
 *       - Failed payment investigation
 *       - Financial reporting and analytics
 *       - Compliance audit trail generation
 *
 *       **Security Features:**
 *       - Role-based data filtering
 *       - Pagination to prevent data overload
 *       - Sensitive data protection
 *       - Audit logging for access tracking
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
 *         example: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *         description: Number of payments per page
 *         example: 25
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: ["PENDING", "PROCESSING", "COMPLETED", "FAILED", "REFUNDED", "CANCELLED"]
 *         description: Filter by payment status
 *         example: "COMPLETED"
 *       - in: query
 *         name: method
 *         schema:
 *           type: string
 *           enum: ["CASH", "CHECK", "BANK_TRANSFER", "CREDIT_CARD", "PAYPAL", "STRIPE", "OTHER"]
 *         description: Filter by payment method
 *         example: "STRIPE"
 *       - in: query
 *         name: customerId
 *         schema:
 *           type: string
 *         description: Filter by customer ID
 *         example: "cus_1234567890"
 *       - in: query
 *         name: invoiceId
 *         schema:
 *           type: string
 *         description: Filter by invoice ID
 *         example: "inv_1234567890"
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for payment date range filter
 *         example: "2024-01-01"
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for payment date range filter
 *         example: "2024-01-31"
 *       - in: query
 *         name: minAmount
 *         schema:
 *           type: number
 *           format: float
 *           minimum: 0
 *         description: Minimum payment amount filter
 *         example: 100.00
 *       - in: query
 *         name: maxAmount
 *         schema:
 *           type: number
 *           format: float
 *         description: Maximum payment amount filter
 *         example: 5000.00
 *       - in: query
 *         name: currency
 *         schema:
 *           type: string
 *         description: Filter by payment currency
 *         example: "USD"
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search in transaction IDs, notes, and references
 *         example: "CHK-001"
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [paymentDate, amount, createdAt, updatedAt, status]
 *           default: createdAt
 *         description: Field to sort by
 *         example: "paymentDate"
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort order (ascending or descending)
 *         example: "desc"
 *       - in: query
 *         name: includeRefunds
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Include refund information in response
 *         example: true
 *     responses:
 *       200:
 *         description: Payments retrieved successfully
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
 *                         example: "pay_1234567890"
 *                       invoiceId:
 *                         type: string
 *                         example: "inv_1234567890"
 *                       amount:
 *                         type: number
 *                         format: float
 *                         example: 2500.00
 *                       method:
 *                         type: string
 *                         example: "STRIPE"
 *                       status:
 *                         type: string
 *                         example: "COMPLETED"
 *                       transactionId:
 *                         type: string
 *                         example: "txn_1234567890"
 *                       currency:
 *                         type: string
 *                         example: "USD"
 *                       paymentDate:
 *                         type: string
 *                         format: date
 *                         example: "2024-01-15"
 *                       processingFee:
 *                         type: number
 *                         format: float
 *                         example: 72.55
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       customer:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             example: "cus_1234567890"
 *                           name:
 *                             type: string
 *                             example: "John Doe"
 *                           email:
 *                             type: string
 *                             example: "john@example.com"
 *                       invoice:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             example: "inv_1234567890"
 *                           invoiceNumber:
 *                             type: string
 *                             example: "INV-2024-001"
 *                           total:
 *                             type: number
 *                             format: float
 *                             example: 2700.00
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                       example: 1
 *                     limit:
 *                       type: integer
 *                       example: 25
 *                     total:
 *                       type: integer
 *                       example: 156
 *                     pages:
 *                       type: integer
 *                       example: 7
 *                     hasNext:
 *                       type: boolean
 *                       example: true
 *                     hasPrev:
 *                       type: boolean
 *                       example: false
 *                 summary:
 *                   type: object
 *                   description: Summary statistics for filtered payments
 *                   properties:
 *                     totalAmount:
 *                       type: number
 *                       format: float
 *                       example: 125000.00
 *                     averageAmount:
 *                       type: number
 *                       format: float
 *                       example: 2500.00
 *                     count:
 *                       type: integer
 *                       example: 50
 *                     byStatus:
 *                       type: object
 *                       properties:
 *                         COMPLETED:
 *                           type: integer
 *                           example: 45
 *                         PENDING:
 *                           type: integer
 *                           example: 3
 *                         FAILED:
 *                           type: integer
 *                           example: 2
 *                     byMethod:
 *                       type: object
 *                       properties:
 *                         STRIPE:
 *                           type: integer
 *                           example: 30
 *                         CHECK:
 *                           type: integer
 *                           example: 15
 *                         CASH:
 *                           type: integer
 *                           example: 5
 *       400:
 *         description: Invalid query parameters
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Invalid date range: startDate must be before endDate"
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       500:
 *         description: Internal server error
 */
router.get(
  '/',
  authorize(UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT, UserRole.EMPLOYEE, UserRole.VIEWER),
  validateListPayments,
  paymentController.listPayments.bind(paymentController)
);

/**
 * @swagger
 * /payments/{id}/refund:
 *   post:
 *     tags: [Payments]
 *     summary: Process payment refund
 *     description: |
 *       Initiates a refund for a completed payment. Supports both full and partial refunds
 *       with automatic accounting adjustments and customer notifications. Requires Admin or Manager role.
 *
 *       **Refund Processing:**
 *       - Validates refund eligibility and amount
 *       - Processes refund through payment gateway (Stripe) or marks for manual processing
 *       - Updates payment status to REFUNDED (full) or creates separate refund record (partial)
 *       - Adjusts invoice status and remaining balance
 *       - Creates accounting entries for refund transaction
 *       - Triggers customer notification workflows
 *
 *       **Refund Types:**
 *       - **Full Refund**: Complete refund of original payment amount
 *       - **Partial Refund**: Refund of specific amount less than original payment
 *       - **Stripe Refund**: Automatic processing through Stripe gateway
 *       - **Manual Refund**: Marked for manual processing (cash, check, etc.)
 *
 *       **Business Impact:**
 *       - Invoice status updates (PAID → REFUNDED/PARTIAL)
 *       - Accounting reconciliation entries
 *       - Customer relationship management
 *       - Financial reporting adjustments
 *       - Compliance and audit trail creation
 *
 *       **Security & Authorization:**
 *       - Restricted to Admin and Manager roles only
 *       - Refund reason requirement for audit compliance
 *       - Multi-step approval workflow for large refunds
 *       - Comprehensive audit logging
 *       - Fraud prevention checks
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Payment ID to refund
 *         schema:
 *           type: string
 *           example: "pay_1234567890"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reason
 *             properties:
 *               amount:
 *                 type: number
 *                 format: float
 *                 description: Refund amount (defaults to full payment amount)
 *                 minimum: 0.01
 *                 example: 1250.00
 *               reason:
 *                 type: string
 *                 description: Reason for refund (required for audit trail)
 *                 enum: ["CUSTOMER_REQUEST", "DUPLICATE_PAYMENT", "SERVICE_NOT_DELIVERED", "BILLING_ERROR", "FRAUD_PREVENTION", "DISPUTE_RESOLUTION", "OTHER"]
 *                 example: "CUSTOMER_REQUEST"
 *               description:
 *                 type: string
 *                 description: Detailed description of refund reason
 *                 example: "Customer cancelled order within refund policy period"
 *               notifyCustomer:
 *                 type: boolean
 *                 description: Whether to send refund notification to customer
 *                 default: true
 *                 example: true
 *               refundToOriginalMethod:
 *                 type: boolean
 *                 description: Refund to original payment method (if possible)
 *                 default: true
 *                 example: true
 *               metadata:
 *                 type: object
 *                 description: Additional refund metadata
 *                 properties:
 *                   approvedBy:
 *                     type: string
 *                     description: User ID who approved the refund
 *                     example: "user_1234567890"
 *                   supportTicketId:
 *                     type: string
 *                     description: Related support ticket ID
 *                     example: "TICKET-001234"
 *                   externalRefundId:
 *                     type: string
 *                     description: External refund reference
 *                     example: "EXT-REF-001"
 *     responses:
 *       200:
 *         description: Refund processed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 refundId:
 *                   type: string
 *                   description: Refund transaction ID
 *                   example: "ref_1234567890"
 *                 paymentId:
 *                   type: string
 *                   description: Original payment ID
 *                   example: "pay_1234567890"
 *                 amount:
 *                   type: number
 *                   format: float
 *                   description: Refunded amount
 *                   example: 1250.00
 *                 currency:
 *                   type: string
 *                   description: Refund currency
 *                   example: "USD"
 *                 status:
 *                   type: string
 *                   enum: ["PENDING", "PROCESSING", "COMPLETED", "FAILED"]
 *                   description: Refund processing status
 *                   example: "COMPLETED"
 *                 method:
 *                   type: string
 *                   description: Refund method
 *                   example: "STRIPE"
 *                 reason:
 *                   type: string
 *                   example: "CUSTOMER_REQUEST"
 *                 gatewayRefundId:
 *                   type: string
 *                   description: Gateway refund ID (Stripe refund ID)
 *                   example: "re_1234567890abcdef"
 *                 estimatedArrival:
 *                   type: string
 *                   format: date
 *                   description: Estimated refund arrival date
 *                   example: "2024-01-20"
 *                 refundDate:
 *                   type: string
 *                   format: date-time
 *                   description: Refund processing timestamp
 *                 originalPayment:
 *                   type: object
 *                   description: Original payment information
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: "pay_1234567890"
 *                     amount:
 *                       type: number
 *                       format: float
 *                       example: 2500.00
 *                     remainingRefundable:
 *                       type: number
 *                       format: float
 *                       description: Remaining amount that can be refunded
 *                       example: 1250.00
 *                     status:
 *                       type: string
 *                       description: Updated payment status
 *                       example: "PARTIALLY_REFUNDED"
 *                 invoice:
 *                   type: object
 *                   description: Updated invoice information
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: "inv_1234567890"
 *                     status:
 *                       type: string
 *                       description: Updated invoice status
 *                       example: "PARTIALLY_PAID"
 *                     remainingBalance:
 *                       type: number
 *                       format: float
 *                       description: Updated remaining balance
 *                       example: 1250.00
 *                 notifications:
 *                   type: object
 *                   description: Notification status
 *                   properties:
 *                     customerNotified:
 *                       type: boolean
 *                       example: true
 *                     emailSent:
 *                       type: boolean
 *                       example: true
 *                     smsNotification:
 *                       type: boolean
 *                       example: false
 *       400:
 *         description: Invalid refund request
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Refund amount exceeds available refundable amount"
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       403:
 *         description: Forbidden - Insufficient permissions (requires Admin/Manager role)
 *       404:
 *         description: Payment not found
 *       422:
 *         description: Refund processing failed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Payment cannot be refunded in current status"
 *                 details:
 *                   type: object
 *                   properties:
 *                     paymentStatus:
 *                       type: string
 *                       example: "FAILED"
 *                     refundableAmount:
 *                       type: number
 *                       format: float
 *                       example: 0.00
 *       500:
 *         description: Gateway error or internal server error
 */
router.post(
  '/:id/refund',
  authorize(UserRole.ADMIN, UserRole.MANAGER),
  validateRefundPayment,
  paymentController.refundPayment.bind(paymentController)
);

/**
 * @swagger
 * /payments/stats/summary:
 *   get:
 *     tags: [Payments]
 *     summary: Get payment statistics and analytics
 *     description: |
 *       Retrieves comprehensive payment statistics and analytics including totals, averages,
 *       trends, and breakdowns by various dimensions. Available to all authenticated users
 *       with data filtered based on role permissions.
 *
 *       **Statistical Analysis Includes:**
 *       - Total payment volume and count over specified periods
 *       - Payment method distribution and performance metrics
 *       - Payment status breakdowns and success rates
 *       - Geographic and currency analysis
 *       - Processing fee analysis and optimization insights
 *       - Monthly/quarterly trend analysis
 *       - Customer payment behavior patterns
 *
 *       **Business Intelligence Features:**
 *       - Revenue trend analysis for financial planning
 *       - Payment method optimization recommendations
 *       - Failed payment analysis for process improvement
 *       - Seasonal payment pattern identification
 *       - Customer segment payment preferences
 *       - Processing cost optimization insights
 *
 *       **Reporting Capabilities:**
 *       - Export-ready summary data
 *       - Dashboard-compatible metrics
 *       - Compliance reporting data
 *       - Performance benchmarking
 *       - Forecasting data points
 *
 *       **Security & Privacy:**
 *       - Role-based data aggregation
 *       - Anonymized customer data in statistics
 *       - Secure statistical computation
 *       - Audit trail for data access
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for statistics period
 *         example: "2024-01-01"
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for statistics period
 *         example: "2024-01-31"
 *       - in: query
 *         name: groupBy
 *         schema:
 *           type: string
 *           enum: ["day", "week", "month", "quarter", "year"]
 *           default: "month"
 *         description: Time period grouping for trend analysis
 *         example: "month"
 *       - in: query
 *         name: currency
 *         schema:
 *           type: string
 *         description: Filter statistics by currency
 *         example: "USD"
 *       - in: query
 *         name: includeRefunds
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Include refund data in statistics
 *         example: true
 *       - in: query
 *         name: includeProcessingFees
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Include processing fee analysis
 *         example: true
 *       - in: query
 *         name: customerId
 *         schema:
 *           type: string
 *         description: Filter statistics for specific customer
 *         example: "cus_1234567890"
 *     responses:
 *       200:
 *         description: Payment statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 period:
 *                   type: object
 *                   description: Statistics period information
 *                   properties:
 *                     startDate:
 *                       type: string
 *                       format: date
 *                       example: "2024-01-01"
 *                     endDate:
 *                       type: string
 *                       format: date
 *                       example: "2024-01-31"
 *                     groupBy:
 *                       type: string
 *                       example: "month"
 *                 totals:
 *                   type: object
 *                   description: Overall payment totals
 *                   properties:
 *                     totalAmount:
 *                       type: number
 *                       format: float
 *                       description: Total payment amount in base currency
 *                       example: 2500000.00
 *                     totalCount:
 *                       type: integer
 *                       description: Total number of payments
 *                       example: 1250
 *                     averageAmount:
 *                       type: number
 *                       format: float
 *                       description: Average payment amount
 *                       example: 2000.00
 *                     medianAmount:
 *                       type: number
 *                       format: float
 *                       description: Median payment amount
 *                       example: 1500.00
 *                     totalProcessingFees:
 *                       type: number
 *                       format: float
 *                       description: Total processing fees
 *                       example: 67500.00
 *                     netAmount:
 *                       type: number
 *                       format: float
 *                       description: Net amount after fees
 *                       example: 2432500.00
 *                 byStatus:
 *                   type: object
 *                   description: Payment breakdown by status
 *                   properties:
 *                     COMPLETED:
 *                       type: object
 *                       properties:
 *                         count:
 *                           type: integer
 *                           example: 1150
 *                         amount:
 *                           type: number
 *                           format: float
 *                           example: 2300000.00
 *                         percentage:
 *                           type: number
 *                           format: float
 *                           example: 92.0
 *                     PENDING:
 *                       type: object
 *                       properties:
 *                         count:
 *                           type: integer
 *                           example: 50
 *                         amount:
 *                           type: number
 *                           format: float
 *                           example: 100000.00
 *                         percentage:
 *                           type: number
 *                           format: float
 *                           example: 4.0
 *                     FAILED:
 *                       type: object
 *                       properties:
 *                         count:
 *                           type: integer
 *                           example: 30
 *                         amount:
 *                           type: number
 *                           format: float
 *                           example: 60000.00
 *                         percentage:
 *                           type: number
 *                           format: float
 *                           example: 2.4
 *                     REFUNDED:
 *                       type: object
 *                       properties:
 *                         count:
 *                           type: integer
 *                           example: 20
 *                         amount:
 *                           type: number
 *                           format: float
 *                           example: 40000.00
 *                         percentage:
 *                           type: number
 *                           format: float
 *                           example: 1.6
 *                 byMethod:
 *                   type: object
 *                   description: Payment breakdown by method
 *                   properties:
 *                     STRIPE:
 *                       type: object
 *                       properties:
 *                         count:
 *                           type: integer
 *                           example: 800
 *                         amount:
 *                           type: number
 *                           format: float
 *                           example: 1800000.00
 *                         averageAmount:
 *                           type: number
 *                           format: float
 *                           example: 2250.00
 *                         successRate:
 *                           type: number
 *                           format: float
 *                           example: 95.5
 *                     CHECK:
 *                       type: object
 *                       properties:
 *                         count:
 *                           type: integer
 *                           example: 250
 *                         amount:
 *                           type: number
 *                           format: float
 *                           example: 500000.00
 *                         averageAmount:
 *                           type: number
 *                           format: float
 *                           example: 2000.00
 *                         successRate:
 *                           type: number
 *                           format: float
 *                           example: 98.0
 *                     CASH:
 *                       type: object
 *                       properties:
 *                         count:
 *                           type: integer
 *                           example: 150
 *                         amount:
 *                           type: number
 *                           format: float
 *                           example: 150000.00
 *                         averageAmount:
 *                           type: number
 *                           format: float
 *                           example: 1000.00
 *                         successRate:
 *                           type: number
 *                           format: float
 *                           example: 100.0
 *                     BANK_TRANSFER:
 *                       type: object
 *                       properties:
 *                         count:
 *                           type: integer
 *                           example: 50
 *                         amount:
 *                           type: number
 *                           format: float
 *                           example: 50000.00
 *                         averageAmount:
 *                           type: number
 *                           format: float
 *                           example: 1000.00
 *                         successRate:
 *                           type: number
 *                           format: float
 *                           example: 96.0
 *                 trends:
 *                   type: array
 *                   description: Time-based payment trends
 *                   items:
 *                     type: object
 *                     properties:
 *                       period:
 *                         type: string
 *                         description: Time period (format depends on groupBy)
 *                         example: "2024-01"
 *                       count:
 *                         type: integer
 *                         example: 125
 *                       amount:
 *                         type: number
 *                         format: float
 *                         example: 250000.00
 *                       averageAmount:
 *                         type: number
 *                         format: float
 *                         example: 2000.00
 *                       successRate:
 *                         type: number
 *                         format: float
 *                         example: 94.5
 *                 topCustomers:
 *                   type: array
 *                   description: Top customers by payment volume
 *                   items:
 *                     type: object
 *                     properties:
 *                       customerId:
 *                         type: string
 *                         example: "cus_1234567890"
 *                       customerName:
 *                         type: string
 *                         example: "John Doe"
 *                       totalAmount:
 *                         type: number
 *                         format: float
 *                         example: 50000.00
 *                       paymentCount:
 *                         type: integer
 *                         example: 25
 *                       averageAmount:
 *                         type: number
 *                         format: float
 *                         example: 2000.00
 *                 processingFees:
 *                   type: object
 *                   description: Processing fee analysis
 *                   properties:
 *                     totalFees:
 *                       type: number
 *                       format: float
 *                       example: 67500.00
 *                     averageFeeRate:
 *                       type: number
 *                       format: float
 *                       description: Average fee rate as percentage
 *                       example: 2.7
 *                     feesByMethod:
 *                       type: object
 *                       properties:
 *                         STRIPE:
 *                           type: number
 *                           format: float
 *                           example: 54000.00
 *                         PAYPAL:
 *                           type: number
 *                           format: float
 *                           example: 13500.00
 *                 insights:
 *                   type: object
 *                   description: AI-generated insights and recommendations
 *                   properties:
 *                     recommendations:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["Consider promoting bank transfers to reduce processing fees", "Investigate high failure rate for credit card payments"]
 *                     trends:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["Payment volume increased 15% compared to previous period", "Stripe adoption growing 25% month-over-month"]
 *                 generatedAt:
 *                   type: string
 *                   format: date-time
 *                   description: Statistics generation timestamp
 *       400:
 *         description: Invalid query parameters
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Invalid date range: endDate must be after startDate"
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       500:
 *         description: Internal server error
 */
router.get(
  '/stats/summary',
  authorize(UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT),
  validateGetPaymentStats,
  paymentController.getPaymentStats.bind(paymentController)
);

export default router;