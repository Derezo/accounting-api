import { Router } from 'express';
import {
  etransferController,
  validateCreateETransfer,
  validateConfirmETransferDeposit,
  validateCancelETransfer,
  validateListETransfers,
  validateGetETransferStats,
  validateETransferNumber
} from '../controllers/etransfer.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { auditMiddleware } from '../middleware/audit.middleware';
import { UserRole } from '../types/enums';

const router = Router();

// Apply authentication to all routes
router.use(authenticate);

// Apply audit logging to all authenticated routes
router.use(auditMiddleware);

/**
 * @swagger
 * /etransfers:
 *   post:
 *     tags: [E-Transfers]
 *     summary: Create a new e-transfer
 *     description: Creates a new electronic transfer for customer payments. Generates unique transfer number and security question for Canadian Interac e-transfer system.
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
 *               - amount
 *               - securityQuestion
 *               - securityAnswer
 *               - recipientEmail
 *             properties:
 *               customerId:
 *                 type: string
 *                 description: Customer ID for this e-transfer
 *                 example: "clp1234567890"
 *               amount:
 *                 type: number
 *                 format: float
 *                 description: Transfer amount in CAD
 *                 example: 1500.00
 *                 minimum: 0.01
 *                 maximum: 3000.00
 *               recipientEmail:
 *                 type: string
 *                 format: email
 *                 description: Recipient's email address
 *                 example: "customer@example.com"
 *               recipientName:
 *                 type: string
 *                 description: Recipient's full name
 *                 example: "John Doe"
 *                 minLength: 2
 *                 maxLength: 100
 *               securityQuestion:
 *                 type: string
 *                 description: Security question for e-transfer
 *                 example: "What is your mother's maiden name?"
 *                 minLength: 10
 *                 maxLength: 200
 *               securityAnswer:
 *                 type: string
 *                 description: Answer to security question (will be hashed)
 *                 example: "Smith"
 *                 minLength: 1
 *                 maxLength: 100
 *               expiryDays:
 *                 type: integer
 *                 description: Days until e-transfer expires (1-30)
 *                 example: 7
 *                 minimum: 1
 *                 maximum: 30
 *                 default: 7
 *               message:
 *                 type: string
 *                 description: Message to recipient
 *                 example: "Payment for services rendered"
 *                 maxLength: 500
 *               invoiceId:
 *                 type: string
 *                 description: Related invoice ID (if applicable)
 *                 example: "clp1234567890"
 *               notifyRecipient:
 *                 type: boolean
 *                 default: true
 *                 description: Whether to send email notification to recipient
 *               autoDeposit:
 *                 type: boolean
 *                 default: false
 *                 description: Whether to enable auto-deposit (if recipient bank supports it)
 *     responses:
 *       201:
 *         description: E-transfer created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   description: E-transfer ID
 *                 etransferNumber:
 *                   type: string
 *                   description: Unique e-transfer reference number
 *                   example: "ET-2024-001234"
 *                 amount:
 *                   type: number
 *                   format: float
 *                 recipientEmail:
 *                   type: string
 *                 status:
 *                   type: string
 *                   enum: [PENDING, SENT, DEPOSITED, EXPIRED, CANCELLED]
 *                   example: "PENDING"
 *                 expiresAt:
 *                   type: string
 *                   format: date-time
 *                   description: When the e-transfer expires
 *                 customer:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     email:
 *                       type: string
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                 estimatedProcessingTime:
 *                   type: string
 *                   description: Estimated time for processing
 *                   example: "5-10 minutes"
 *       400:
 *         description: Invalid input data or amount exceeds limits
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       404:
 *         description: Customer not found
 *       422:
 *         description: Business rule violation (e.g., duplicate active transfer to same email)
 *       500:
 *         description: Internal server error
 */
router.post(
  '/',
  authorize(UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT, UserRole.EMPLOYEE),
  validateCreateETransfer,
  etransferController.createETransfer.bind(etransferController)
);

/**
 * @swagger
 * /etransfers/{etransferNumber}/confirm:
 *   put:
 *     tags: [E-Transfers]
 *     summary: Confirm e-transfer deposit
 *     description: Manually confirms that an e-transfer has been deposited by the recipient. Updates status and triggers accounting workflows for payment reconciliation.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: etransferNumber
 *         required: true
 *         description: E-transfer reference number
 *         schema:
 *           type: string
 *           example: "ET-2024-001234"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - depositedAt
 *             properties:
 *               depositedAt:
 *                 type: string
 *                 format: date-time
 *                 description: Date and time when deposit was confirmed
 *                 example: "2024-01-20T15:30:00Z"
 *               confirmationMethod:
 *                 type: string
 *                 enum: [MANUAL_VERIFICATION, BANK_NOTIFICATION, RECIPIENT_CONFIRMATION, AUTO_DEPOSIT]
 *                 description: How the deposit was confirmed
 *                 example: "MANUAL_VERIFICATION"
 *               bankTransactionId:
 *                 type: string
 *                 description: Bank transaction ID (if available)
 *                 example: "TXN-789456123"
 *               notes:
 *                 type: string
 *                 description: Additional notes about the confirmation
 *                 example: "Confirmed via bank statement"
 *                 maxLength: 500
 *               actualAmount:
 *                 type: number
 *                 format: float
 *                 description: Actual deposited amount (if different from transfer amount)
 *                 example: 1485.00
 *               exchangeRate:
 *                 type: number
 *                 format: float
 *                 description: Exchange rate applied (if applicable)
 *                 example: 1.0
 *               fees:
 *                 type: object
 *                 properties:
 *                   transferFee:
 *                     type: number
 *                     format: float
 *                   bankFee:
 *                     type: number
 *                     format: float
 *                   otherFees:
 *                     type: number
 *                     format: float
 *                 description: Fees deducted from the transfer
 *     responses:
 *       200:
 *         description: E-transfer deposit confirmed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 etransferNumber:
 *                   type: string
 *                 status:
 *                   type: string
 *                   example: "DEPOSITED"
 *                 depositedAt:
 *                   type: string
 *                   format: date-time
 *                 confirmedBy:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     role:
 *                       type: string
 *                 processingTime:
 *                   type: number
 *                   format: float
 *                   description: Total processing time in hours
 *                 finalAmount:
 *                   type: number
 *                   format: float
 *                   description: Final deposited amount after fees
 *                 reconciliation:
 *                   type: object
 *                   properties:
 *                     invoiceUpdated:
 *                       type: boolean
 *                       description: Whether related invoice was updated
 *                     paymentRecorded:
 *                       type: boolean
 *                       description: Whether payment was recorded in accounting
 *                     balanceUpdated:
 *                       type: boolean
 *                       description: Whether customer balance was updated
 *                 notifications:
 *                   type: object
 *                   properties:
 *                     customerNotified:
 *                       type: boolean
 *                       description: Whether customer was notified of confirmation
 *                     accountingNotified:
 *                       type: boolean
 *                       description: Whether accounting team was notified
 *       400:
 *         description: Invalid input data or e-transfer cannot be confirmed
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       404:
 *         description: E-transfer not found
 *       409:
 *         description: Conflict - E-transfer already confirmed or in invalid state
 *       500:
 *         description: Internal server error
 */
router.put(
  '/:etransferNumber/confirm',
  authorize(UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT),
  validateConfirmETransferDeposit,
  etransferController.confirmETransferDeposit.bind(etransferController)
);

/**
 * @swagger
 * /etransfers/{etransferNumber}/cancel:
 *   put:
 *     tags: [E-Transfers]
 *     summary: Cancel e-transfer
 *     description: Cancels a pending or sent e-transfer before it has been deposited. Handles refund processing and notifies relevant parties.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: etransferNumber
 *         required: true
 *         description: E-transfer reference number
 *         schema:
 *           type: string
 *           example: "ET-2024-001234"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reason
 *             properties:
 *               reason:
 *                 type: string
 *                 enum: [CLIENT_REQUEST, DUPLICATE_TRANSFER, INCORRECT_AMOUNT, INCORRECT_RECIPIENT, FRAUD_PREVENTION, OTHER]
 *                 description: Reason for cancellation
 *                 example: "CLIENT_REQUEST"
 *               notes:
 *                 type: string
 *                 description: Additional notes about the cancellation
 *                 example: "Client requested cancellation due to change in payment method"
 *                 maxLength: 500
 *               refundMethod:
 *                 type: string
 *                 enum: [ORIGINAL_PAYMENT, BANK_TRANSFER, CHECK, CREDIT_NOTE]
 *                 description: How to process the refund
 *                 example: "ORIGINAL_PAYMENT"
 *               notifyRecipient:
 *                 type: boolean
 *                 default: true
 *                 description: Whether to notify the recipient of cancellation
 *               notifyCustomer:
 *                 type: boolean
 *                 default: true
 *                 description: Whether to notify the customer of cancellation
 *               processRefundImmediately:
 *                 type: boolean
 *                 default: false
 *                 description: Whether to process refund immediately
 *     responses:
 *       200:
 *         description: E-transfer cancelled successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 etransferNumber:
 *                   type: string
 *                 status:
 *                   type: string
 *                   example: "CANCELLED"
 *                 cancelledAt:
 *                   type: string
 *                   format: date-time
 *                 cancelledBy:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     role:
 *                       type: string
 *                 cancellationReason:
 *                   type: string
 *                 refund:
 *                   type: object
 *                   properties:
 *                     amount:
 *                       type: number
 *                       format: float
 *                       description: Refund amount
 *                     method:
 *                       type: string
 *                       description: Refund method
 *                     status:
 *                       type: string
 *                       enum: [PENDING, PROCESSED, FAILED]
 *                     estimatedProcessingTime:
 *                       type: string
 *                       description: Estimated refund processing time
 *                     refundId:
 *                       type: string
 *                       description: Refund transaction ID
 *                 fees:
 *                   type: object
 *                   properties:
 *                     cancellationFee:
 *                       type: number
 *                       format: float
 *                       description: Cancellation fee charged
 *                     refundAmount:
 *                       type: number
 *                       format: float
 *                       description: Net refund amount after fees
 *                 notifications:
 *                   type: object
 *                   properties:
 *                     recipientNotified:
 *                       type: boolean
 *                     customerNotified:
 *                       type: boolean
 *                     accountingNotified:
 *                       type: boolean
 *                 timeline:
 *                   type: object
 *                   properties:
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     sentAt:
 *                       type: string
 *                       format: date-time
 *                     cancelledAt:
 *                       type: string
 *                       format: date-time
 *                     activeDuration:
 *                       type: number
 *                       format: float
 *                       description: How long the transfer was active (in hours)
 *       400:
 *         description: Invalid input data or e-transfer cannot be cancelled
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       404:
 *         description: E-transfer not found
 *       409:
 *         description: Conflict - E-transfer already deposited or cannot be cancelled
 *       422:
 *         description: Business rule violation (e.g., too late to cancel)
 *       500:
 *         description: Internal server error
 */
router.put(
  '/:etransferNumber/cancel',
  authorize(UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT),
  validateCancelETransfer,
  etransferController.cancelETransfer.bind(etransferController)
);

/**
 * @swagger
 * /etransfers/stats/summary:
 *   get:
 *     tags: [E-Transfers]
 *     summary: Get e-transfer statistics
 *     description: Retrieves comprehensive statistics about e-transfers including status distribution, volume trends, and processing metrics for the organization.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [day, week, month, quarter, year]
 *           default: month
 *         description: Time period for statistics calculation
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for custom period (YYYY-MM-DD)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for custom period (YYYY-MM-DD)
 *       - in: query
 *         name: customerId
 *         schema:
 *           type: string
 *         description: Filter statistics by specific customer
 *     responses:
 *       200:
 *         description: E-transfer statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 summary:
 *                   type: object
 *                   properties:
 *                     totalTransfers:
 *                       type: integer
 *                       description: Total number of e-transfers
 *                     totalAmount:
 *                       type: number
 *                       format: float
 *                       description: Total amount of all e-transfers
 *                     averageAmount:
 *                       type: number
 *                       format: float
 *                       description: Average e-transfer amount
 *                     successRate:
 *                       type: number
 *                       format: float
 *                       description: Percentage of successfully deposited transfers
 *                     averageProcessingTime:
 *                       type: number
 *                       format: float
 *                       description: Average processing time in hours
 *                 statusDistribution:
 *                   type: object
 *                   properties:
 *                     PENDING:
 *                       type: integer
 *                     SENT:
 *                       type: integer
 *                     DEPOSITED:
 *                       type: integer
 *                     EXPIRED:
 *                       type: integer
 *                     CANCELLED:
 *                       type: integer
 *                 volumeTrends:
 *                   type: object
 *                   properties:
 *                     daily:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           date:
 *                             type: string
 *                             format: date
 *                           count:
 *                             type: integer
 *                           amount:
 *                             type: number
 *                             format: float
 *                     monthlyGrowth:
 *                       type: number
 *                       format: float
 *                       description: Month-over-month growth percentage
 *                 performance:
 *                   type: object
 *                   properties:
 *                     fastestDeposit:
 *                       type: number
 *                       format: float
 *                       description: Fastest deposit time in minutes
 *                     slowestDeposit:
 *                       type: number
 *                       format: float
 *                       description: Slowest deposit time in hours
 *                     expirationRate:
 *                       type: number
 *                       format: float
 *                       description: Percentage of transfers that expired
 *                     cancellationRate:
 *                       type: number
 *                       format: float
 *                       description: Percentage of transfers that were cancelled
 *                 topRecipients:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       email:
 *                         type: string
 *                       count:
 *                         type: integer
 *                       totalAmount:
 *                         type: number
 *                         format: float
 *                   description: Top recipients by transfer count
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       500:
 *         description: Internal server error
 */
router.get(
  '/stats/summary',
  validateGetETransferStats,
  etransferController.getETransferStats.bind(etransferController)
);

/**
 * @swagger
 * /etransfers:
 *   get:
 *     tags: [E-Transfers]
 *     summary: List e-transfers
 *     description: Retrieves a paginated list of e-transfers with filtering and search capabilities. Users can view all e-transfers within their organization.
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
 *         description: Number of e-transfers per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search term for recipient email or e-transfer number
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, SENT, DEPOSITED, EXPIRED, CANCELLED]
 *         description: Filter by e-transfer status
 *       - in: query
 *         name: customerId
 *         schema:
 *           type: string
 *         description: Filter by specific customer
 *       - in: query
 *         name: recipientEmail
 *         schema:
 *           type: string
 *           format: email
 *         description: Filter by recipient email address
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter e-transfers from this date (YYYY-MM-DD)
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter e-transfers to this date (YYYY-MM-DD)
 *       - in: query
 *         name: amountMin
 *         schema:
 *           type: number
 *           format: float
 *         description: Minimum transfer amount
 *       - in: query
 *         name: amountMax
 *         schema:
 *           type: number
 *           format: float
 *         description: Maximum transfer amount
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [createdAt, updatedAt, amount, expiresAt, etransferNumber]
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
 *         description: E-transfers retrieved successfully
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
 *                         description: E-transfer ID
 *                       etransferNumber:
 *                         type: string
 *                         description: Unique e-transfer reference number
 *                         example: "ET-2024-001234"
 *                       amount:
 *                         type: number
 *                         format: float
 *                         example: 1500.00
 *                       recipientEmail:
 *                         type: string
 *                         format: email
 *                         example: "customer@example.com"
 *                       recipientName:
 *                         type: string
 *                         example: "John Doe"
 *                       status:
 *                         type: string
 *                         enum: [PENDING, SENT, DEPOSITED, EXPIRED, CANCELLED]
 *                         example: "SENT"
 *                       customer:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           name:
 *                             type: string
 *                           email:
 *                             type: string
 *                       expiresAt:
 *                         type: string
 *                         format: date-time
 *                       depositedAt:
 *                         type: string
 *                         format: date-time
 *                         description: When the transfer was deposited (if applicable)
 *                       processingTime:
 *                         type: number
 *                         format: float
 *                         description: Processing time in hours (if completed)
 *                       message:
 *                         type: string
 *                         description: Message to recipient
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       updatedAt:
 *                         type: string
 *                         format: date-time
 *                       createdBy:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           name:
 *                             type: string
 *                           role:
 *                             type: string
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
 *                 summary:
 *                   type: object
 *                   properties:
 *                     totalAmount:
 *                       type: number
 *                       format: float
 *                       description: Total amount of all transfers in the result set
 *                     averageAmount:
 *                       type: number
 *                       format: float
 *                       description: Average amount of transfers in the result set
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       500:
 *         description: Internal server error
 */
router.get(
  '/',
  validateListETransfers,
  etransferController.listETransfers.bind(etransferController)
);

/**
 * @swagger
 * /etransfers/{etransferNumber}:
 *   get:
 *     tags: [E-Transfers]
 *     summary: Get e-transfer details
 *     description: Retrieves detailed information about a specific e-transfer including status, processing history, and recipient information.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: etransferNumber
 *         required: true
 *         description: E-transfer reference number
 *         schema:
 *           type: string
 *           example: "ET-2024-001234"
 *     responses:
 *       200:
 *         description: E-transfer details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   description: E-transfer ID
 *                 etransferNumber:
 *                   type: string
 *                   description: Unique e-transfer reference number
 *                   example: "ET-2024-001234"
 *                 amount:
 *                   type: number
 *                   format: float
 *                   example: 1500.00
 *                 recipientEmail:
 *                   type: string
 *                   format: email
 *                   example: "customer@example.com"
 *                 recipientName:
 *                   type: string
 *                   example: "John Doe"
 *                 status:
 *                   type: string
 *                   enum: [PENDING, SENT, DEPOSITED, EXPIRED, CANCELLED]
 *                   example: "SENT"
 *                 customer:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                       example: "Acme Corporation"
 *                     email:
 *                       type: string
 *                       example: "billing@acme.com"
 *                 securityQuestion:
 *                   type: string
 *                   description: Security question for the transfer
 *                   example: "What is your mother's maiden name?"
 *                 message:
 *                   type: string
 *                   description: Message to recipient
 *                   example: "Payment for services rendered"
 *                 expiresAt:
 *                   type: string
 *                   format: date-time
 *                   description: When the e-transfer expires
 *                 sentAt:
 *                   type: string
 *                   format: date-time
 *                   description: When the e-transfer was sent
 *                 depositedAt:
 *                   type: string
 *                   format: date-time
 *                   description: When the transfer was deposited (if applicable)
 *                 autoDeposit:
 *                   type: boolean
 *                   description: Whether auto-deposit is enabled
 *                 processingHistory:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       status:
 *                         type: string
 *                       timestamp:
 *                         type: string
 *                         format: date-time
 *                       notes:
 *                         type: string
 *                       performedBy:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           name:
 *                             type: string
 *                   description: Status change history
 *                 relatedInvoice:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     invoiceNumber:
 *                       type: string
 *                     amount:
 *                       type: number
 *                       format: float
 *                   description: Related invoice information (if applicable)
 *                 fees:
 *                   type: object
 *                   properties:
 *                     transferFee:
 *                       type: number
 *                       format: float
 *                       description: E-transfer processing fee
 *                     bankFee:
 *                       type: number
 *                       format: float
 *                       description: Bank processing fee
 *                     totalFees:
 *                       type: number
 *                       format: float
 *                       description: Total fees charged
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                 updatedAt:
 *                   type: string
 *                   format: date-time
 *                 createdBy:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     role:
 *                       type: string
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       404:
 *         description: E-transfer not found
 *       500:
 *         description: Internal server error
 */
router.get(
  '/:etransferNumber',
  validateETransferNumber,
  etransferController.getETransfer.bind(etransferController)
);

/**
 * @swagger
 * /etransfers/maintenance/check-expired:
 *   post:
 *     tags: [E-Transfers]
 *     summary: Check and process expired e-transfers
 *     description: Administrative function to check for expired e-transfers and process them according to business rules. This includes automatic refunds and notifications.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               dryRun:
 *                 type: boolean
 *                 default: false
 *                 description: Whether to perform a dry run without making changes
 *               batchSize:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 100
 *                 default: 50
 *                 description: Number of transfers to process in this batch
 *               notifyCustomers:
 *                 type: boolean
 *                 default: true
 *                 description: Whether to send expiration notifications to customers
 *               processRefunds:
 *                 type: boolean
 *                 default: true
 *                 description: Whether to automatically process refunds for expired transfers
 *               gracePeriodHours:
 *                 type: integer
 *                 minimum: 0
 *                 maximum: 168
 *                 default: 24
 *                 description: Grace period in hours after expiry before processing
 *     responses:
 *       200:
 *         description: Expired transfers processing completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 processedAt:
 *                   type: string
 *                   format: date-time
 *                 dryRun:
 *                   type: boolean
 *                   description: Whether this was a dry run
 *                 summary:
 *                   type: object
 *                   properties:
 *                     totalChecked:
 *                       type: integer
 *                       description: Total number of transfers checked
 *                     expiredFound:
 *                       type: integer
 *                       description: Number of expired transfers found
 *                     processed:
 *                       type: integer
 *                       description: Number of transfers processed
 *                     errors:
 *                       type: integer
 *                       description: Number of processing errors
 *                 expiredTransfers:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       etransferNumber:
 *                         type: string
 *                       amount:
 *                         type: number
 *                         format: float
 *                       recipientEmail:
 *                         type: string
 *                       expiredAt:
 *                         type: string
 *                         format: date-time
 *                       processedAction:
 *                         type: string
 *                         enum: [MARKED_EXPIRED, REFUND_INITIATED, NOTIFICATION_SENT, ERROR]
 *                       refundAmount:
 *                         type: number
 *                         format: float
 *                       errorMessage:
 *                         type: string
 *                   description: Details of processed expired transfers
 *                 refunds:
 *                   type: object
 *                   properties:
 *                     totalRefundAmount:
 *                       type: number
 *                       format: float
 *                       description: Total amount refunded
 *                     refundsInitiated:
 *                       type: integer
 *                       description: Number of refunds initiated
 *                     estimatedProcessingTime:
 *                       type: string
 *                       description: Estimated time for refund completion
 *                 notifications:
 *                   type: object
 *                   properties:
 *                     customerNotifications:
 *                       type: integer
 *                       description: Number of customer notifications sent
 *                     internalNotifications:
 *                       type: integer
 *                       description: Number of internal notifications sent
 *                 nextScheduledCheck:
 *                   type: string
 *                   format: date-time
 *                   description: When the next automatic check is scheduled
 *                 recommendations:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: System recommendations based on findings
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       403:
 *         description: Forbidden - Requires Admin or Manager role
 *       500:
 *         description: Internal server error
 */
router.post(
  '/maintenance/check-expired',
  authorize(UserRole.ADMIN, UserRole.MANAGER),
  etransferController.checkExpiredETransfers.bind(etransferController)
);

export default router;