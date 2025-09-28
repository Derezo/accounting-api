import { Router } from 'express';
import {
  manualPaymentController,
  validateCreateManualPayment,
  validateBatchPayments,
  validateReconcilePayments,
  validateCreatePaymentPlan,
  validateAllocatePartialPayment,
  validateUpdateChequeStatus
} from '../controllers/manual-payment.controller';
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
 * /manual-payments:
 *   post:
 *     tags: [Manual Payments]
 *     summary: Create a manual payment
 *     description: Records a manual payment received outside of electronic payment systems (e.g., cash, cheque, bank transfer). Essential for offline payment tracking and reconciliation.
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
 *               - paymentMethod
 *               - receivedDate
 *             properties:
 *               customerId:
 *                 type: string
 *                 description: Customer ID making the payment
 *                 example: "clp1234567890"
 *               amount:
 *                 type: number
 *                 format: float
 *                 description: Payment amount
 *                 example: 1250.00
 *                 minimum: 0.01
 *               paymentMethod:
 *                 type: string
 *                 enum: [CASH, CHEQUE, BANK_TRANSFER, MONEY_ORDER, WIRE_TRANSFER, OTHER]
 *                 description: Method of payment
 *                 example: "CHEQUE"
 *               receivedDate:
 *                 type: string
 *                 format: date
 *                 description: Date payment was received (YYYY-MM-DD)
 *                 example: "2024-01-20"
 *               referenceNumber:
 *                 type: string
 *                 description: Reference number (cheque number, transfer ID, etc.)
 *                 example: "CHQ-789456"
 *                 maxLength: 50
 *               bankDetails:
 *                 type: object
 *                 properties:
 *                   bankName:
 *                     type: string
 *                     example: "TD Canada Trust"
 *                   accountNumber:
 *                     type: string
 *                     description: Last 4 digits of account number
 *                     example: "****1234"
 *                   transitNumber:
 *                     type: string
 *                     example: "12345"
 *                   sortCode:
 *                     type: string
 *                     example: "001"
 *                 description: Banking details (for cheques and transfers)
 *               currency:
 *                 type: string
 *                 enum: [CAD, USD, EUR, GBP]
 *                 default: CAD
 *                 description: Payment currency
 *               exchangeRate:
 *                 type: number
 *                 format: float
 *                 description: Exchange rate if different from base currency
 *                 example: 1.35
 *               invoiceAllocations:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     invoiceId:
 *                       type: string
 *                     amount:
 *                       type: number
 *                       format: float
 *                 description: How to allocate payment across invoices
 *               notes:
 *                 type: string
 *                 description: Additional notes about the payment
 *                 example: "Received via mail, cheque dated Jan 18"
 *                 maxLength: 1000
 *               depositedDate:
 *                 type: string
 *                 format: date
 *                 description: Date payment was deposited (if different from received date)
 *               depositAccount:
 *                 type: string
 *                 description: Account where payment was deposited
 *                 example: "Business Checking - ****5678"
 *               verificationRequired:
 *                 type: boolean
 *                 default: false
 *                 description: Whether payment requires additional verification
 *     responses:
 *       201:
 *         description: Manual payment created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   description: Payment ID
 *                 paymentNumber:
 *                   type: string
 *                   description: Unique payment reference number
 *                   example: "MP-2024-001234"
 *                 amount:
 *                   type: number
 *                   format: float
 *                 paymentMethod:
 *                   type: string
 *                 status:
 *                   type: string
 *                   enum: [PENDING, VERIFIED, DEPOSITED, CLEARED, BOUNCED, CANCELLED]
 *                   example: "PENDING"
 *                 customer:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     email:
 *                       type: string
 *                 allocations:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       invoiceId:
 *                         type: string
 *                       invoiceNumber:
 *                         type: string
 *                       amount:
 *                         type: number
 *                         format: float
 *                       remainingBalance:
 *                         type: number
 *                         format: float
 *                   description: Invoice payment allocations
 *                 verification:
 *                   type: object
 *                   properties:
 *                     required:
 *                       type: boolean
 *                     status:
 *                       type: string
 *                       enum: [PENDING, IN_PROGRESS, VERIFIED, REJECTED]
 *                     estimatedClearingTime:
 *                       type: string
 *                       description: Estimated time for payment to clear
 *                 createdAt:
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
 *       400:
 *         description: Invalid input data or allocation errors
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       404:
 *         description: Customer or invoice not found
 *       422:
 *         description: Business rule violation (e.g., payment exceeds outstanding balance)
 *       500:
 *         description: Internal server error
 */
router.post(
  '/',
  authorize(UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT, UserRole.EMPLOYEE),
  validateCreateManualPayment,
  manualPaymentController.createManualPayment.bind(manualPaymentController)
);

/**
 * @swagger
 * /manual-payments/batch:
 *   post:
 *     tags: [Manual Payments]
 *     summary: Process batch payments
 *     description: Processes multiple manual payments in a single operation. Useful for importing bank statement data or processing multiple cheques received together.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - payments
 *               - batchReference
 *             properties:
 *               batchReference:
 *                 type: string
 *                 description: Reference identifier for this batch
 *                 example: "BATCH-2024-001"
 *                 maxLength: 50
 *               batchDate:
 *                 type: string
 *                 format: date
 *                 description: Date of batch processing
 *                 example: "2024-01-20"
 *               batchType:
 *                 type: string
 *                 enum: [BANK_STATEMENT_IMPORT, CHEQUE_DEPOSIT, CASH_DEPOSIT, WIRE_TRANSFERS, MIXED]
 *                 description: Type of batch processing
 *                 example: "CHEQUE_DEPOSIT"
 *               payments:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - customerId
 *                     - amount
 *                     - paymentMethod
 *                     - receivedDate
 *                   properties:
 *                     customerId:
 *                       type: string
 *                       description: Customer ID or customer identifier
 *                     customerEmail:
 *                       type: string
 *                       format: email
 *                       description: Customer email (alternative to ID)
 *                     amount:
 *                       type: number
 *                       format: float
 *                       minimum: 0.01
 *                     paymentMethod:
 *                       type: string
 *                       enum: [CASH, CHEQUE, BANK_TRANSFER, MONEY_ORDER, WIRE_TRANSFER, OTHER]
 *                     receivedDate:
 *                       type: string
 *                       format: date
 *                     referenceNumber:
 *                       type: string
 *                       maxLength: 50
 *                     bankDetails:
 *                       type: object
 *                     notes:
 *                       type: string
 *                       maxLength: 500
 *                     invoiceAllocations:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           invoiceId:
 *                             type: string
 *                           amount:
 *                             type: number
 *                             format: float
 *                 minItems: 1
 *                 maxItems: 100
 *                 description: Array of payments to process
 *               validateCustomers:
 *                 type: boolean
 *                 default: true
 *                 description: Whether to validate customer existence before processing
 *               autoAllocate:
 *                 type: boolean
 *                 default: true
 *                 description: Whether to automatically allocate payments to oldest invoices
 *               continueOnError:
 *                 type: boolean
 *                 default: false
 *                 description: Whether to continue processing if individual payments fail
 *               notifyCustomers:
 *                 type: boolean
 *                 default: false
 *                 description: Whether to send payment confirmation emails to customers
 *     responses:
 *       200:
 *         description: Batch processing completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 batchId:
 *                   type: string
 *                   description: Unique batch processing ID
 *                 batchReference:
 *                   type: string
 *                 processedAt:
 *                   type: string
 *                   format: date-time
 *                 summary:
 *                   type: object
 *                   properties:
 *                     totalPayments:
 *                       type: integer
 *                       description: Total number of payments in batch
 *                     successfulPayments:
 *                       type: integer
 *                       description: Number of successfully processed payments
 *                     failedPayments:
 *                       type: integer
 *                       description: Number of failed payments
 *                     totalAmount:
 *                       type: number
 *                       format: float
 *                       description: Total amount processed
 *                     processingTime:
 *                       type: number
 *                       format: float
 *                       description: Processing time in seconds
 *                 successfulPayments:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       paymentId:
 *                         type: string
 *                       paymentNumber:
 *                         type: string
 *                       customerId:
 *                         type: string
 *                       amount:
 *                         type: number
 *                         format: float
 *                       status:
 *                         type: string
 *                 failedPayments:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       rowIndex:
 *                         type: integer
 *                         description: Index in the original batch array
 *                       customerId:
 *                         type: string
 *                       amount:
 *                         type: number
 *                         format: float
 *                       errorCode:
 *                         type: string
 *                       errorMessage:
 *                         type: string
 *                       suggestions:
 *                         type: array
 *                         items:
 *                           type: string
 *                 recommendations:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: System recommendations for failed payments
 *       400:
 *         description: Invalid batch data or validation errors
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       413:
 *         description: Batch too large - exceeds maximum allowed size
 *       422:
 *         description: Business rule violations in batch data
 *       500:
 *         description: Internal server error
 */
router.post(
  '/batch',
  authorize(UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT),
  validateBatchPayments,
  manualPaymentController.processBatchPayments.bind(manualPaymentController)
);

/**
 * @swagger
 * /manual-payments/reconcile:
 *   post:
 *     tags: [Manual Payments]
 *     summary: Reconcile payments with bank statement
 *     description: Matches recorded manual payments with actual bank statement transactions to ensure accurate financial records and identify discrepancies.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - statementDate
 *               - accountNumber
 *               - transactions
 *             properties:
 *               statementDate:
 *                 type: string
 *                 format: date
 *                 description: Bank statement date
 *                 example: "2024-01-31"
 *               accountNumber:
 *                 type: string
 *                 description: Bank account number (last 4 digits)
 *                 example: "****1234"
 *               statementPeriod:
 *                 type: object
 *                 properties:
 *                   startDate:
 *                     type: string
 *                     format: date
 *                   endDate:
 *                     type: string
 *                     format: date
 *                 description: Statement period for reconciliation
 *               openingBalance:
 *                 type: number
 *                 format: float
 *                 description: Opening balance from bank statement
 *                 example: 15750.00
 *               closingBalance:
 *                 type: number
 *                 format: float
 *                 description: Closing balance from bank statement
 *                 example: 18925.00
 *               transactions:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - date
 *                     - amount
 *                     - description
 *                   properties:
 *                     date:
 *                       type: string
 *                       format: date
 *                       description: Transaction date
 *                     amount:
 *                       type: number
 *                       format: float
 *                       description: Transaction amount (positive for deposits)
 *                     description:
 *                       type: string
 *                       description: Bank transaction description
 *                       example: "DEP CHQ #123456"
 *                     referenceNumber:
 *                       type: string
 *                       description: Bank reference number
 *                     transactionType:
 *                       type: string
 *                       enum: [DEPOSIT, WITHDRAWAL, TRANSFER, FEE, INTEREST, OTHER]
 *                     balanceAfter:
 *                       type: number
 *                       format: float
 *                       description: Account balance after transaction
 *                 minItems: 1
 *                 description: Bank statement transactions
 *               reconciliationRules:
 *                 type: object
 *                 properties:
 *                   matchTolerance:
 *                     type: number
 *                     format: float
 *                     default: 0.01
 *                     description: Amount tolerance for matching (in currency units)
 *                   dateTolerance:
 *                     type: integer
 *                     default: 3
 *                     description: Date tolerance for matching (in days)
 *                   autoMatch:
 *                     type: boolean
 *                     default: true
 *                     description: Whether to automatically match obvious matches
 *                   requireExactAmount:
 *                     type: boolean
 *                     default: false
 *                     description: Whether to require exact amount matches
 *     responses:
 *       200:
 *         description: Reconciliation completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 reconciliationId:
 *                   type: string
 *                   description: Unique reconciliation session ID
 *                 reconciledAt:
 *                   type: string
 *                   format: date-time
 *                 statementSummary:
 *                   type: object
 *                   properties:
 *                     accountNumber:
 *                       type: string
 *                     statementDate:
 *                       type: string
 *                       format: date
 *                     openingBalance:
 *                       type: number
 *                       format: float
 *                     closingBalance:
 *                       type: number
 *                       format: float
 *                     totalTransactions:
 *                       type: integer
 *                     totalDeposits:
 *                       type: number
 *                       format: float
 *                 matchingSummary:
 *                   type: object
 *                   properties:
 *                     totalRecordedPayments:
 *                       type: integer
 *                       description: Total manual payments in system for period
 *                     totalBankTransactions:
 *                       type: integer
 *                       description: Total bank transactions analyzed
 *                     automaticMatches:
 *                       type: integer
 *                       description: Number of automatic matches found
 *                     manualReviewRequired:
 *                       type: integer
 *                       description: Number of transactions requiring manual review
 *                     unmatchedPayments:
 *                       type: integer
 *                       description: Recorded payments without bank matches
 *                     unmatchedTransactions:
 *                       type: integer
 *                       description: Bank transactions without payment matches
 *                 matches:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       paymentId:
 *                         type: string
 *                       paymentNumber:
 *                         type: string
 *                       bankTransaction:
 *                         type: object
 *                         properties:
 *                           date:
 *                             type: string
 *                             format: date
 *                           amount:
 *                             type: number
 *                             format: float
 *                           description:
 *                             type: string
 *                           referenceNumber:
 *                             type: string
 *                       matchConfidence:
 *                         type: number
 *                         format: float
 *                         description: Confidence score (0-1) for the match
 *                       matchType:
 *                         type: string
 *                         enum: [EXACT, AMOUNT_DATE, REFERENCE, MANUAL]
 *                       discrepancies:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             field:
 *                               type: string
 *                             recorded:
 *                               type: string
 *                             actual:
 *                               type: string
 *                   description: Successfully matched payments and transactions
 *                 unmatchedPayments:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       paymentId:
 *                         type: string
 *                       paymentNumber:
 *                         type: string
 *                       amount:
 *                         type: number
 *                         format: float
 *                       receivedDate:
 *                         type: string
 *                         format: date
 *                       customer:
 *                         type: string
 *                       possibleMatches:
 *                         type: array
 *                         items:
 *                           type: object
 *                   description: Recorded payments without bank matches
 *                 unmatchedTransactions:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       date:
 *                         type: string
 *                         format: date
 *                       amount:
 *                         type: number
 *                         format: float
 *                       description:
 *                         type: string
 *                       referenceNumber:
 *                         type: string
 *                       suggestions:
 *                         type: array
 *                         items:
 *                           type: string
 *                   description: Bank transactions without payment matches
 *                 recommendations:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       type:
 *                         type: string
 *                         enum: [CREATE_PAYMENT, INVESTIGATE_DUPLICATE, CHECK_DEPOSIT_DATE, VERIFY_AMOUNT]
 *                       description:
 *                         type: string
 *                       priority:
 *                         type: string
 *                         enum: [LOW, MEDIUM, HIGH, URGENT]
 *                   description: System recommendations for unmatched items
 *       400:
 *         description: Invalid reconciliation data or parameters
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       422:
 *         description: Business rule violations in reconciliation data
 *       500:
 *         description: Internal server error
 */
router.post(
  '/reconcile',
  authorize(UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT),
  validateReconcilePayments,
  manualPaymentController.reconcilePayments.bind(manualPaymentController)
);

/**
 * @swagger
 * /manual-payments/payment-plan:
 *   post:
 *     tags: [Manual Payments]
 *     summary: Create payment plan
 *     description: Creates a structured payment plan for customers with outstanding balances, allowing them to pay in installments over time with defined terms and conditions.
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
 *               - totalAmount
 *               - installments
 *               - startDate
 *             properties:
 *               customerId:
 *                 type: string
 *                 description: Customer ID for the payment plan
 *                 example: "clp1234567890"
 *               totalAmount:
 *                 type: number
 *                 format: float
 *                 description: Total amount to be paid under the plan
 *                 example: 5000.00
 *                 minimum: 1.00
 *               invoiceIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Invoice IDs included in the payment plan
 *                 example: ["inv1", "inv2", "inv3"]
 *               planType:
 *                 type: string
 *                 enum: [EQUAL_INSTALLMENTS, DECLINING_BALANCE, CUSTOM_SCHEDULE]
 *                 description: Type of payment plan structure
 *                 example: "EQUAL_INSTALLMENTS"
 *               installments:
 *                 type: integer
 *                 description: Number of installment payments
 *                 example: 6
 *                 minimum: 2
 *                 maximum: 24
 *               installmentAmount:
 *                 type: number
 *                 format: float
 *                 description: Amount per installment (for equal installments)
 *                 example: 833.33
 *               startDate:
 *                 type: string
 *                 format: date
 *                 description: Date of first payment
 *                 example: "2024-02-01"
 *               frequency:
 *                 type: string
 *                 enum: [WEEKLY, BIWEEKLY, MONTHLY, QUARTERLY]
 *                 default: MONTHLY
 *                 description: Payment frequency
 *               paymentMethod:
 *                 type: string
 *                 enum: [AUTO_DEBIT, MANUAL_PAYMENT, CHEQUE, BANK_TRANSFER]
 *                 description: Preferred payment method
 *                 example: "AUTO_DEBIT"
 *               interestRate:
 *                 type: number
 *                 format: float
 *                 description: Annual interest rate (if applicable)
 *                 example: 6.5
 *                 minimum: 0
 *                 maximum: 30
 *               lateFeeAmount:
 *                 type: number
 *                 format: float
 *                 description: Late fee for missed payments
 *                 example: 25.00
 *                 minimum: 0
 *               gracePeriodDays:
 *                 type: integer
 *                 description: Grace period in days before late fees apply
 *                 example: 5
 *                 minimum: 0
 *                 maximum: 30
 *               terms:
 *                 type: object
 *                 properties:
 *                   requiresApproval:
 *                     type: boolean
 *                     default: true
 *                     description: Whether plan requires management approval
 *                   autoTerminateOnDefault:
 *                     type: boolean
 *                     default: true
 *                     description: Whether to auto-terminate on missed payments
 *                   maxMissedPayments:
 *                     type: integer
 *                     default: 2
 *                     description: Maximum missed payments before termination
 *                   earlyPaymentDiscount:
 *                     type: number
 *                     format: float
 *                     description: Discount percentage for early full payment
 *               customSchedule:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     dueDate:
 *                       type: string
 *                       format: date
 *                     amount:
 *                       type: number
 *                       format: float
 *                     description:
 *                       type: string
 *                 description: Custom payment schedule (if planType is CUSTOM_SCHEDULE)
 *               notes:
 *                 type: string
 *                 description: Additional notes about the payment plan
 *                 maxLength: 1000
 *               customerAgreement:
 *                 type: object
 *                 properties:
 *                   agreed:
 *                     type: boolean
 *                     description: Whether customer has agreed to terms
 *                   agreedDate:
 *                     type: string
 *                     format: date-time
 *                   signatureRequired:
 *                     type: boolean
 *                     default: false
 *                   documentUrl:
 *                     type: string
 *                     format: uri
 *                     description: URL to signed agreement document
 *     responses:
 *       201:
 *         description: Payment plan created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   description: Payment plan ID
 *                 planNumber:
 *                   type: string
 *                   description: Unique payment plan reference number
 *                   example: "PP-2024-001234"
 *                 customer:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     email:
 *                       type: string
 *                 planDetails:
 *                   type: object
 *                   properties:
 *                     totalAmount:
 *                       type: number
 *                       format: float
 *                     installments:
 *                       type: integer
 *                     installmentAmount:
 *                       type: number
 *                       format: float
 *                     frequency:
 *                       type: string
 *                     startDate:
 *                       type: string
 *                       format: date
 *                     endDate:
 *                       type: string
 *                       format: date
 *                 status:
 *                   type: string
 *                   enum: [DRAFT, PENDING_APPROVAL, ACTIVE, COMPLETED, TERMINATED, DEFAULTED]
 *                   example: "PENDING_APPROVAL"
 *                 paymentSchedule:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       installmentNumber:
 *                         type: integer
 *                       dueDate:
 *                         type: string
 *                         format: date
 *                       amount:
 *                         type: number
 *                         format: float
 *                       principal:
 *                         type: number
 *                         format: float
 *                       interest:
 *                         type: number
 *                         format: float
 *                       remainingBalance:
 *                         type: number
 *                         format: float
 *                       status:
 *                         type: string
 *                         enum: [PENDING, PAID, LATE, MISSED]
 *                   description: Complete payment schedule
 *                 approvalRequired:
 *                   type: boolean
 *                   description: Whether management approval is required
 *                 nextAction:
 *                   type: string
 *                   description: Next required action
 *                   example: "Awaiting management approval"
 *                 createdAt:
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
 *       400:
 *         description: Invalid payment plan data or parameters
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       404:
 *         description: Customer or invoice not found
 *       422:
 *         description: Business rule violations (e.g., customer already has active plan)
 *       500:
 *         description: Internal server error
 */
router.post(
  '/payment-plan',
  authorize(UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT),
  validateCreatePaymentPlan,
  manualPaymentController.createPaymentPlan.bind(manualPaymentController)
);

/**
 * @swagger
 * /manual-payments/allocate:
 *   post:
 *     tags: [Manual Payments]
 *     summary: Allocate partial payment across invoices
 *     description: Distributes a partial payment amount across multiple outstanding invoices according to specified allocation rules or business priorities.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - paymentId
 *               - allocations
 *             properties:
 *               paymentId:
 *                 type: string
 *                 description: ID of the payment to allocate
 *                 example: "clp1234567890"
 *               customerId:
 *                 type: string
 *                 description: Customer ID (for validation)
 *                 example: "clp1234567890"
 *               totalAmount:
 *                 type: number
 *                 format: float
 *                 description: Total payment amount to allocate
 *                 example: 2500.00
 *               allocationMethod:
 *                 type: string
 *                 enum: [MANUAL, OLDEST_FIRST, LARGEST_FIRST, PROPORTIONAL, HIGHEST_INTEREST]
 *                 description: Method for allocating payment
 *                 example: "OLDEST_FIRST"
 *               allocations:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - invoiceId
 *                     - amount
 *                   properties:
 *                     invoiceId:
 *                       type: string
 *                       description: Invoice ID to allocate payment to
 *                     invoiceNumber:
 *                       type: string
 *                       description: Invoice number (for reference)
 *                     amount:
 *                       type: number
 *                       format: float
 *                       description: Amount to allocate to this invoice
 *                       minimum: 0.01
 *                     priority:
 *                       type: integer
 *                       description: Allocation priority (1 = highest)
 *                       minimum: 1
 *                     notes:
 *                       type: string
 *                       description: Notes about this allocation
 *                       maxLength: 200
 *                 minItems: 1
 *                 description: Array of invoice allocations
 *               applyCredits:
 *                 type: boolean
 *                 default: false
 *                 description: Whether to apply existing customer credits first
 *               minimumPaymentAmount:
 *                 type: number
 *                 format: float
 *                 description: Minimum amount to allocate per invoice
 *                 example: 1.00
 *               roundingMethod:
 *                 type: string
 *                 enum: [ROUND_UP, ROUND_DOWN, ROUND_NEAREST, NO_ROUNDING]
 *                 default: ROUND_NEAREST
 *                 description: How to handle rounding for allocation amounts
 *               notes:
 *                 type: string
 *                 description: Additional notes about the allocation
 *                 maxLength: 500
 *               notifyCustomer:
 *                 type: boolean
 *                 default: true
 *                 description: Whether to notify customer of payment allocation
 *     responses:
 *       200:
 *         description: Payment allocated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 allocationId:
 *                   type: string
 *                   description: Unique allocation transaction ID
 *                 paymentId:
 *                   type: string
 *                 customer:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     email:
 *                       type: string
 *                 allocationSummary:
 *                   type: object
 *                   properties:
 *                     totalAmount:
 *                       type: number
 *                       format: float
 *                       description: Total payment amount
 *                     allocatedAmount:
 *                       type: number
 *                       format: float
 *                       description: Amount successfully allocated
 *                     remainingAmount:
 *                       type: number
 *                       format: float
 *                       description: Unallocated amount (customer credit)
 *                     invoicesAffected:
 *                       type: integer
 *                       description: Number of invoices affected
 *                     invoicesPaid:
 *                       type: integer
 *                       description: Number of invoices fully paid
 *                 allocations:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       invoiceId:
 *                         type: string
 *                       invoiceNumber:
 *                         type: string
 *                       previousBalance:
 *                         type: number
 *                         format: float
 *                       allocatedAmount:
 *                         type: number
 *                         format: float
 *                       newBalance:
 *                         type: number
 *                         format: float
 *                       status:
 *                         type: string
 *                         enum: [PAID, PARTIALLY_PAID, OVERPAID]
 *                       paidInFull:
 *                         type: boolean
 *                   description: Detailed allocation results per invoice
 *                 customerAccount:
 *                   type: object
 *                   properties:
 *                     previousBalance:
 *                       type: number
 *                       format: float
 *                     newBalance:
 *                       type: number
 *                       format: float
 *                     creditBalance:
 *                       type: number
 *                       format: float
 *                       description: Available customer credit after allocation
 *                     outstandingInvoices:
 *                       type: integer
 *                       description: Number of remaining unpaid invoices
 *                 notifications:
 *                   type: object
 *                   properties:
 *                     customerNotified:
 *                       type: boolean
 *                     accountingNotified:
 *                       type: boolean
 *                     managementNotified:
 *                       type: boolean
 *                 auditTrail:
 *                   type: object
 *                   properties:
 *                     allocatedBy:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         name:
 *                           type: string
 *                         role:
 *                           type: string
 *                     allocatedAt:
 *                       type: string
 *                       format: date-time
 *                     allocationMethod:
 *                       type: string
 *                     processingTime:
 *                       type: number
 *                       format: float
 *                       description: Processing time in seconds
 *       400:
 *         description: Invalid allocation data or amounts don't match
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       404:
 *         description: Payment, customer, or invoice not found
 *       409:
 *         description: Conflict - Payment already allocated or invoice statuses changed
 *       422:
 *         description: Business rule violations (e.g., allocation exceeds invoice balance)
 *       500:
 *         description: Internal server error
 */
router.post(
  '/allocate',
  authorize(UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT),
  validateAllocatePartialPayment,
  manualPaymentController.allocatePartialPayment.bind(manualPaymentController)
);

/**
 * @swagger
 * /manual-payments/cheque/{paymentId}/status:
 *   put:
 *     tags: [Manual Payments]
 *     summary: Update cheque payment status
 *     description: Updates the status of a cheque payment as it progresses through the clearing process, from received to cleared or bounced.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: paymentId
 *         required: true
 *         description: Payment ID of the cheque
 *         schema:
 *           type: string
 *           example: "clp1234567890"
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
 *                 enum: [RECEIVED, DEPOSITED, CLEARING, CLEARED, BOUNCED, STOPPED, CANCELLED]
 *                 description: New status of the cheque
 *                 example: "CLEARED"
 *               statusDate:
 *                 type: string
 *                 format: date-time
 *                 description: Date and time of status change
 *                 example: "2024-01-25T10:30:00Z"
 *               bankConfirmation:
 *                 type: object
 *                 properties:
 *                   confirmationNumber:
 *                     type: string
 *                     description: Bank confirmation number
 *                     example: "BNK-789456123"
 *                   clearingDate:
 *                     type: string
 *                     format: date
 *                     description: Date cheque cleared
 *                   depositSlipNumber:
 *                     type: string
 *                     description: Deposit slip reference number
 *                   bankCharges:
 *                     type: number
 *                     format: float
 *                     description: Bank processing charges
 *                     example: 2.50
 *                 description: Bank confirmation details (for cleared status)
 *               bounceReason:
 *                 type: string
 *                 enum: [INSUFFICIENT_FUNDS, ACCOUNT_CLOSED, STOP_PAYMENT, SIGNATURE_MISMATCH, STALE_DATED, OTHER]
 *                 description: Reason for bounce (if status is BOUNCED)
 *               nsfFee:
 *                 type: number
 *                 format: float
 *                 description: NSF fee charged (if applicable)
 *                 example: 45.00
 *               notes:
 *                 type: string
 *                 description: Additional notes about the status change
 *                 example: "Confirmed cleared via online banking"
 *                 maxLength: 500
 *               notifyCustomer:
 *                 type: boolean
 *                 default: true
 *                 description: Whether to notify customer of status change
 *               requiresFollowUp:
 *                 type: boolean
 *                 default: false
 *                 description: Whether this status requires follow-up action
 *               followUpDate:
 *                 type: string
 *                 format: date
 *                 description: Date for follow-up action (if required)
 *               replacementPayment:
 *                 type: object
 *                 properties:
 *                   requested:
 *                     type: boolean
 *                     description: Whether replacement payment was requested
 *                   method:
 *                     type: string
 *                     enum: [CASH, NEW_CHEQUE, BANK_TRANSFER, CREDIT_CARD]
 *                   dueDate:
 *                     type: string
 *                     format: date
 *                   amount:
 *                     type: number
 *                     format: float
 *                 description: Replacement payment details (for bounced cheques)
 *     responses:
 *       200:
 *         description: Cheque status updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 paymentId:
 *                   type: string
 *                 paymentNumber:
 *                   type: string
 *                 previousStatus:
 *                   type: string
 *                 newStatus:
 *                   type: string
 *                 statusChangedAt:
 *                   type: string
 *                   format: date-time
 *                 statusChangedBy:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     role:
 *                       type: string
 *                 paymentDetails:
 *                   type: object
 *                   properties:
 *                     amount:
 *                       type: number
 *                       format: float
 *                     chequeNumber:
 *                       type: string
 *                     receivedDate:
 *                       type: string
 *                       format: date
 *                     customer:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         name:
 *                           type: string
 *                         email:
 *                           type: string
 *                 statusHistory:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       status:
 *                         type: string
 *                       date:
 *                         type: string
 *                         format: date-time
 *                       changedBy:
 *                         type: string
 *                       notes:
 *                         type: string
 *                   description: Complete status change history
 *                 accountingImpact:
 *                   type: object
 *                   properties:
 *                     invoicesAffected:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           invoiceId:
 *                             type: string
 *                           action:
 *                             type: string
 *                             enum: [PAYMENT_CONFIRMED, PAYMENT_REVERSED, BALANCE_UPDATED]
 *                     customerBalanceChange:
 *                       type: number
 *                       format: float
 *                     feesApplied:
 *                       type: number
 *                       format: float
 *                 notifications:
 *                   type: object
 *                   properties:
 *                     customerNotified:
 *                       type: boolean
 *                     accountingNotified:
 *                       type: boolean
 *                     managementNotified:
 *                       type: boolean
 *                 nextActions:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       action:
 *                         type: string
 *                       dueDate:
 *                         type: string
 *                         format: date
 *                       assignedTo:
 *                         type: string
 *                       priority:
 *                         type: string
 *                         enum: [LOW, MEDIUM, HIGH, URGENT]
 *                   description: Required follow-up actions
 *       400:
 *         description: Invalid status transition or missing required data
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       404:
 *         description: Payment not found or not a cheque payment
 *       409:
 *         description: Conflict - Invalid status transition or concurrent update
 *       422:
 *         description: Business rule violations (e.g., cannot clear already bounced cheque)
 *       500:
 *         description: Internal server error
 */
router.put(
  '/cheque/:paymentId/status',
  authorize(UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT),
  validateUpdateChequeStatus,
  manualPaymentController.updateChequeStatus.bind(manualPaymentController)
);

export default router;