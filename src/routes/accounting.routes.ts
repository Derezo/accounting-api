import { Router } from 'express';
import { AccountingController } from '../controllers/accounting.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { UserRole } from '../types/enums';
import { body, param, query } from 'express-validator';
import { validateRequest } from '../middleware/validation.middleware';

const router = Router();

// Middleware to require authentication for all accounting routes
router.use(authenticate);

/**
 * @swagger
 * components:
 *   schemas:
 *     JournalEntry:
 *       type: object
 *       required:
 *         - accountId
 *         - type
 *         - amount
 *         - description
 *       properties:
 *         accountId:
 *           type: string
 *           format: uuid
 *           description: Account UUID
 *         type:
 *           type: string
 *           enum: [DEBIT, CREDIT]
 *           description: Transaction type
 *         amount:
 *           type: number
 *           minimum: 0.01
 *           maximum: 999999999.99
 *           description: Entry amount
 *         description:
 *           type: string
 *           minLength: 1
 *           maxLength: 500
 *           description: Entry description
 *         referenceType:
 *           type: string
 *           description: Reference type (INVOICE, PAYMENT, etc.)
 *         referenceId:
 *           type: string
 *           description: Reference ID
 *
 *     Transaction:
 *       type: object
 *       required:
 *         - date
 *         - description
 *         - entries
 *       properties:
 *         date:
 *           type: string
 *           format: date
 *           description: Transaction date
 *         description:
 *           type: string
 *           minLength: 1
 *           maxLength: 500
 *           description: Transaction description
 *         entries:
 *           type: array
 *           minItems: 2
 *           maxItems: 50
 *           items:
 *             $ref: '#/components/schemas/JournalEntry'
 *
 *     Account:
 *       type: object
 *       required:
 *         - accountNumber
 *         - name
 *         - type
 *       properties:
 *         accountNumber:
 *           type: string
 *           pattern: '^[0-9]{4}$'
 *           description: 4-digit account number
 *         name:
 *           type: string
 *           minLength: 1
 *           maxLength: 100
 *           description: Account name
 *         type:
 *           type: string
 *           enum: [ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE]
 *           description: Account type
 *         parentId:
 *           type: string
 *           format: uuid
 *           description: Parent account UUID
 *         description:
 *           type: string
 *           maxLength: 500
 *           description: Account description
 *         isSystemAccount:
 *           type: boolean
 *           description: Whether this is a system-generated account
 */

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/accounting/transactions:
 *   post:
 *     summary: Create a new journal transaction
 *     tags: [Accounting]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/OrganizationId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Transaction'
 *     responses:
 *       201:
 *         description: Transaction created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   description: Created transaction
 *                 warnings:
 *                   type: array
 *                   items:
 *                     type: string
 *       400:
 *         description: Validation error or unbalanced transaction
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post(
  '/organizations/:organizationId/accounting/transactions',
  authorize([UserRole.ACCOUNTANT, UserRole.MANAGER, UserRole.ADMIN, UserRole.SUPER_ADMIN]),
  [
    param('organizationId').isUUID().withMessage('Invalid organization ID'),
    body('date').isISO8601().withMessage('Invalid date format'),
    body('description').trim().isLength({ min: 1, max: 500 }).withMessage('Description must be 1-500 characters'),
    body('entries').isArray({ min: 2, max: 50 }).withMessage('Must have 2-50 journal entries'),
    body('entries.*.accountId').isUUID().withMessage('Invalid account ID'),
    body('entries.*.type').isIn(['DEBIT', 'CREDIT']).withMessage('Type must be DEBIT or CREDIT'),
    body('entries.*.amount').isFloat({ min: 0.01, max: 999999999.99 }).withMessage('Amount must be positive and reasonable'),
    body('entries.*.description').trim().isLength({ min: 1, max: 500 }).withMessage('Entry description required'),
    validateRequest
  ],
  AccountingController.createTransaction
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/accounting/business-transactions:
 *   post:
 *     summary: Create a business transaction from template
 *     tags: [Accounting]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/OrganizationId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - transactionType
 *               - transactionData
 *             properties:
 *               transactionType:
 *                 type: string
 *                 enum: [CASH_SALE, CREDIT_SALE, CASH_PAYMENT_RECEIVED, EXPENSE_CASH, EXPENSE_CREDIT, PAY_VENDOR, OWNER_INVESTMENT, OWNER_WITHDRAWAL]
 *               transactionData:
 *                 type: object
 *                 description: Transaction-specific data
 *     responses:
 *       201:
 *         description: Business transaction created successfully
 *       400:
 *         description: Invalid transaction type or data
 *       401:
 *         description: Unauthorized
 */
router.post(
  '/organizations/:organizationId/accounting/business-transactions',
  authorize([UserRole.ACCOUNTANT, UserRole.MANAGER, UserRole.ADMIN, UserRole.SUPER_ADMIN]),
  [
    param('organizationId').isUUID().withMessage('Invalid organization ID'),
    body('transactionType').isIn([
      'CASH_SALE', 'CREDIT_SALE', 'CASH_PAYMENT_RECEIVED',
      'EXPENSE_CASH', 'EXPENSE_CREDIT', 'PAY_VENDOR',
      'OWNER_INVESTMENT', 'OWNER_WITHDRAWAL'
    ]).withMessage('Invalid transaction type'),
    body('transactionData').isObject().withMessage('Transaction data required'),
    validateRequest
  ],
  AccountingController.createBusinessTransaction
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/accounting/transaction-types:
 *   get:
 *     summary: Get available business transaction types
 *     tags: [Accounting]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/OrganizationId'
 *     responses:
 *       200:
 *         description: Available transaction types
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       type:
 *                         type: string
 *                       name:
 *                         type: string
 *                       description:
 *                         type: string
 *                       requiredFields:
 *                         type: array
 *                         items:
 *                           type: string
 */
router.get(
  '/organizations/:organizationId/accounting/transaction-types',
  [
    param('organizationId').isUUID().withMessage('Invalid organization ID'),
    validateRequest
  ],
  AccountingController.getTransactionTypes
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/accounting/transactions/{transactionId}/reverse:
 *   post:
 *     summary: Reverse a transaction
 *     tags: [Accounting]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/OrganizationId'
 *       - name: transactionId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reversalReason
 *             properties:
 *               reversalReason:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 500
 *     responses:
 *       200:
 *         description: Transaction reversed successfully
 *       400:
 *         description: Transaction already reversed or invalid
 *       401:
 *         description: Unauthorized
 */
router.post(
  '/organizations/:organizationId/accounting/transactions/:transactionId/reverse',
  authorize([UserRole.ACCOUNTANT, UserRole.MANAGER, UserRole.ADMIN, UserRole.SUPER_ADMIN]),
  [
    param('organizationId').isUUID().withMessage('Invalid organization ID'),
    param('transactionId').isUUID().withMessage('Invalid transaction ID'),
    body('reversalReason').trim().isLength({ min: 1, max: 500 }).withMessage('Reversal reason required'),
    validateRequest
  ],
  AccountingController.reverseTransaction
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/accounting/trial-balance:
 *   get:
 *     summary: Generate trial balance
 *     tags: [Accounting]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/OrganizationId'
 *       - name: asOfDate
 *         in: query
 *         schema:
 *           type: string
 *           format: date
 *         description: As-of date for trial balance (defaults to current date)
 *     responses:
 *       200:
 *         description: Trial balance generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   description: Trial balance report
 */
router.get(
  '/organizations/:organizationId/accounting/trial-balance',
  authorize([UserRole.ACCOUNTANT, UserRole.MANAGER, UserRole.ADMIN, UserRole.SUPER_ADMIN]),
  [
    param('organizationId').isUUID().withMessage('Invalid organization ID'),
    query('asOfDate').optional().isISO8601().withMessage('Invalid date format'),
    validateRequest
  ],
  AccountingController.generateTrialBalance
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/accounting/trial-balance/report:
 *   get:
 *     summary: Generate comprehensive trial balance report
 *     tags: [Accounting]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/OrganizationId'
 *       - name: asOfDate
 *         in: query
 *         schema:
 *           type: string
 *           format: date
 *       - name: periodStartDate
 *         in: query
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Comprehensive trial balance report
 */
router.get(
  '/organizations/:organizationId/accounting/trial-balance/report',
  authorize([UserRole.ACCOUNTANT, UserRole.MANAGER, UserRole.ADMIN, UserRole.SUPER_ADMIN]),
  [
    param('organizationId').isUUID().withMessage('Invalid organization ID'),
    query('asOfDate').optional().isISO8601().withMessage('Invalid date format'),
    query('periodStartDate').optional().isISO8601().withMessage('Invalid date format'),
    validateRequest
  ],
  AccountingController.generateTrialBalanceReport
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/accounting/trial-balance/export:
 *   get:
 *     summary: Export trial balance
 *     tags: [Accounting]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/OrganizationId'
 *       - name: format
 *         in: query
 *         schema:
 *           type: string
 *           enum: [CSV, JSON, PDF]
 *           default: CSV
 *       - name: asOfDate
 *         in: query
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Trial balance export file
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *           application/json:
 *             schema:
 *               type: object
 */
router.get(
  '/organizations/:organizationId/accounting/trial-balance/export',
  authorize([UserRole.ACCOUNTANT, UserRole.MANAGER, UserRole.ADMIN, UserRole.SUPER_ADMIN]),
  [
    param('organizationId').isUUID().withMessage('Invalid organization ID'),
    query('format').optional().isIn(['CSV', 'JSON', 'PDF']).withMessage('Invalid export format'),
    query('asOfDate').optional().isISO8601().withMessage('Invalid date format'),
    validateRequest
  ],
  AccountingController.exportTrialBalance
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/accounting/validate:
 *   get:
 *     summary: Validate accounting equation (Assets = Liabilities + Equity)
 *     tags: [Accounting]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/OrganizationId'
 *     responses:
 *       200:
 *         description: Accounting equation validation result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     isValid:
 *                       type: boolean
 *                     assets:
 *                       type: number
 *                     liabilities:
 *                       type: number
 *                     equity:
 *                       type: number
 *                     difference:
 *                       type: number
 */
router.get(
  '/organizations/:organizationId/accounting/validate',
  authorize([UserRole.ACCOUNTANT, UserRole.MANAGER, UserRole.ADMIN, UserRole.SUPER_ADMIN]),
  [
    param('organizationId').isUUID().withMessage('Invalid organization ID'),
    validateRequest
  ],
  AccountingController.validateAccountingEquation
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/accounting/accounts:
 *   get:
 *     summary: Get chart of accounts
 *     tags: [Accounts]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/OrganizationId'
 *     responses:
 *       200:
 *         description: Chart of accounts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   description: Chart of accounts with accounts grouped by type
 *   post:
 *     summary: Create a new account
 *     tags: [Accounts]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/OrganizationId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Account'
 *     responses:
 *       201:
 *         description: Account created successfully
 *       400:
 *         description: Validation error or duplicate account number
 */
router.get(
  '/organizations/:organizationId/accounting/accounts',
  [
    param('organizationId').isUUID().withMessage('Invalid organization ID'),
    validateRequest
  ],
  AccountingController.getChartOfAccounts
);

router.post(
  '/organizations/:organizationId/accounting/accounts',
  authorize([UserRole.ADMIN, UserRole.SUPER_ADMIN]),
  [
    param('organizationId').isUUID().withMessage('Invalid organization ID'),
    body('accountNumber').matches(/^[0-9]{4}$/).withMessage('Account number must be 4 digits'),
    body('name').trim().isLength({ min: 1, max: 100 }).withMessage('Account name must be 1-100 characters'),
    body('type').isIn(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']).withMessage('Invalid account type'),
    body('parentId').optional().isUUID().withMessage('Invalid parent ID'),
    body('description').optional().isLength({ max: 500 }).withMessage('Description too long'),
    body('isSystemAccount').optional().isBoolean().withMessage('isSystemAccount must be boolean'),
    validateRequest
  ],
  AccountingController.createAccount
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/accounting/accounts/hierarchy:
 *   get:
 *     summary: Get account hierarchy
 *     tags: [Accounts]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/OrganizationId'
 *     responses:
 *       200:
 *         description: Account hierarchy with parent-child relationships
 */
router.get(
  '/organizations/:organizationId/accounting/accounts/hierarchy',
  [
    param('organizationId').isUUID().withMessage('Invalid organization ID'),
    validateRequest
  ],
  AccountingController.getAccountHierarchy
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/accounting/accounts/standard:
 *   post:
 *     summary: Create standard chart of accounts for business type
 *     tags: [Accounts]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/OrganizationId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - businessType
 *             properties:
 *               businessType:
 *                 type: string
 *                 enum: [SOLE_PROPRIETORSHIP, PARTNERSHIP, CORPORATION, LLC]
 *     responses:
 *       201:
 *         description: Standard chart of accounts created
 *       400:
 *         description: Invalid business type or accounts already exist
 */
router.post(
  '/organizations/:organizationId/accounting/accounts/standard',
  authorize([UserRole.ADMIN, UserRole.SUPER_ADMIN]),
  [
    param('organizationId').isUUID().withMessage('Invalid organization ID'),
    body('businessType').isIn(['SOLE_PROPRIETORSHIP', 'PARTNERSHIP', 'CORPORATION', 'LLC']).withMessage('Invalid business type'),
    validateRequest
  ],
  AccountingController.createStandardChartOfAccounts
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/accounting/accounts/{accountId}:
 *   get:
 *     summary: Get account by ID
 *     tags: [Accounts]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/OrganizationId'
 *       - name: accountId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Account details
 *       404:
 *         description: Account not found
 *   put:
 *     summary: Update account
 *     tags: [Accounts]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/OrganizationId'
 *       - name: accountId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               accountNumber:
 *                 type: string
 *                 pattern: '^[0-9]{4}$'
 *               name:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 100
 *               description:
 *                 type: string
 *                 maxLength: 500
 *               isActive:
 *                 type: boolean
 *               parentId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: Account updated successfully
 *       400:
 *         description: Validation error
 *       404:
 *         description: Account not found
 *   delete:
 *     summary: Delete account (soft delete if no transactions)
 *     tags: [Accounts]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/OrganizationId'
 *       - name: accountId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Account deleted successfully
 *       400:
 *         description: Cannot delete account with transactions
 *       404:
 *         description: Account not found
 */
router.get(
  '/organizations/:organizationId/accounting/accounts/:accountId',
  [
    param('organizationId').isUUID().withMessage('Invalid organization ID'),
    param('accountId').isUUID().withMessage('Invalid account ID'),
    validateRequest
  ],
  AccountingController.getAccountById
);

router.put(
  '/organizations/:organizationId/accounting/accounts/:accountId',
  authorize([UserRole.ADMIN, UserRole.SUPER_ADMIN]),
  [
    param('organizationId').isUUID().withMessage('Invalid organization ID'),
    param('accountId').isUUID().withMessage('Invalid account ID'),
    body('accountNumber').optional().matches(/^[0-9]{4}$/).withMessage('Account number must be 4 digits'),
    body('name').optional().trim().isLength({ min: 1, max: 100 }).withMessage('Account name must be 1-100 characters'),
    body('description').optional().isLength({ max: 500 }).withMessage('Description too long'),
    body('isActive').optional().isBoolean().withMessage('isActive must be boolean'),
    body('parentId').optional().isUUID().withMessage('Invalid parent ID'),
    validateRequest
  ],
  AccountingController.updateAccount
);

router.delete(
  '/organizations/:organizationId/accounting/accounts/:accountId',
  authorize([UserRole.ADMIN, UserRole.SUPER_ADMIN]),
  [
    param('organizationId').isUUID().withMessage('Invalid organization ID'),
    param('accountId').isUUID().withMessage('Invalid account ID'),
    validateRequest
  ],
  AccountingController.deleteAccount
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/accounting/accounts/{accountId}/balance:
 *   get:
 *     summary: Get account balance
 *     tags: [Accounts]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/OrganizationId'
 *       - name: accountId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Account balance information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     accountId:
 *                       type: string
 *                     accountNumber:
 *                       type: string
 *                     accountName:
 *                       type: string
 *                     accountType:
 *                       type: string
 *                     balance:
 *                       type: number
 *                     lastTransactionDate:
 *                       type: string
 *                       format: date-time
 */
router.get(
  '/organizations/:organizationId/accounting/accounts/:accountId/balance',
  [
    param('organizationId').isUUID().withMessage('Invalid organization ID'),
    param('accountId').isUUID().withMessage('Invalid account ID'),
    validateRequest
  ],
  AccountingController.getAccountBalance
);

export default router;