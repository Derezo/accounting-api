import { Router } from 'express';
import { body, query, param } from 'express-validator';
import { FinancialStatementsController } from '../controllers/financial-statements.controller';
import { authenticate as authMiddleware } from '../middleware/auth.middleware';
import { validateRequest } from '../middleware/validation.middleware';

const router = Router();

/**
 * @openapi
 * components:
 *   schemas:
 *     FinancialStatement:
 *       type: object
 *       properties:
 *         organizationId:
 *           type: string
 *         statementType:
 *           type: string
 *           enum: [BALANCE_SHEET, INCOME_STATEMENT, CASH_FLOW_STATEMENT]
 *         periodStart:
 *           type: string
 *           format: date
 *         periodEnd:
 *           type: string
 *           format: date
 *         currency:
 *           type: string
 *           example: "CAD"
 *         generatedAt:
 *           type: string
 *           format: date-time
 *         data:
 *           type: object
 *
 *     BalanceSheet:
 *       type: object
 *       properties:
 *         header:
 *           type: object
 *           properties:
 *             organizationName:
 *               type: string
 *             asOfDate:
 *               type: string
 *               format: date
 *             currency:
 *               type: string
 *         assets:
 *           type: object
 *           properties:
 *             currentAssets:
 *               type: object
 *               properties:
 *                 cash:
 *                   type: number
 *                 accountsReceivable:
 *                   type: number
 *                 inventory:
 *                   type: number
 *                 prepaidExpenses:
 *                   type: number
 *                 total:
 *                   type: number
 *             nonCurrentAssets:
 *               type: object
 *               properties:
 *                 propertyPlantEquipment:
 *                   type: number
 *                 intangibleAssets:
 *                   type: number
 *                 investments:
 *                   type: number
 *                 total:
 *                   type: number
 *             totalAssets:
 *               type: number
 *         liabilities:
 *           type: object
 *           properties:
 *             currentLiabilities:
 *               type: object
 *               properties:
 *                 accountsPayable:
 *                   type: number
 *                 accruedExpenses:
 *                   type: number
 *                 shortTermDebt:
 *                   type: number
 *                 total:
 *                   type: number
 *             nonCurrentLiabilities:
 *               type: object
 *               properties:
 *                 longTermDebt:
 *                   type: number
 *                 deferredTaxLiabilities:
 *                   type: number
 *                 total:
 *                   type: number
 *             totalLiabilities:
 *               type: number
 *         equity:
 *           type: object
 *           properties:
 *             shareCapital:
 *               type: number
 *             retainedEarnings:
 *               type: number
 *             totalEquity:
 *               type: number
 *         validation:
 *           type: object
 *           properties:
 *             assetsEqualLiabilitiesPlusEquity:
 *               type: boolean
 *             balanceVariance:
 *               type: number
 *
 *     IncomeStatement:
 *       type: object
 *       properties:
 *         header:
 *           type: object
 *           properties:
 *             organizationName:
 *               type: string
 *             periodStart:
 *               type: string
 *               format: date
 *             periodEnd:
 *               type: string
 *               format: date
 *             currency:
 *               type: string
 *         revenue:
 *           type: object
 *           properties:
 *             operatingRevenue:
 *               type: number
 *             nonOperatingRevenue:
 *               type: number
 *             totalRevenue:
 *               type: number
 *         expenses:
 *           type: object
 *           properties:
 *             costOfGoodsSold:
 *               type: number
 *             operatingExpenses:
 *               type: number
 *             depreciation:
 *               type: number
 *             interestExpense:
 *               type: number
 *             totalExpenses:
 *               type: number
 *         profitLoss:
 *           type: object
 *           properties:
 *             grossProfit:
 *               type: number
 *             operatingIncome:
 *               type: number
 *             netIncomeBeforeTaxes:
 *               type: number
 *             incomeTaxExpense:
 *               type: number
 *             netIncome:
 *               type: number
 *
 *     CashFlowStatement:
 *       type: object
 *       properties:
 *         header:
 *           type: object
 *           properties:
 *             organizationName:
 *               type: string
 *             periodStart:
 *               type: string
 *               format: date
 *             periodEnd:
 *               type: string
 *               format: date
 *             currency:
 *               type: string
 *         operatingActivities:
 *           type: object
 *           properties:
 *             netIncome:
 *               type: number
 *             adjustments:
 *               type: object
 *               properties:
 *                 depreciation:
 *                   type: number
 *                 accountsReceivableChange:
 *                   type: number
 *                 inventoryChange:
 *                   type: number
 *                 accountsPayableChange:
 *                   type: number
 *             netCashFromOperating:
 *               type: number
 *         investingActivities:
 *           type: object
 *           properties:
 *             equipmentPurchases:
 *               type: number
 *             equipmentSales:
 *               type: number
 *             investments:
 *               type: number
 *             netCashFromInvesting:
 *               type: number
 *         financingActivities:
 *           type: object
 *           properties:
 *             loanProceeds:
 *               type: number
 *             loanPayments:
 *               type: number
 *             equityContributions:
 *               type: number
 *             dividendPayments:
 *               type: number
 *             netCashFromFinancing:
 *               type: number
 *         summary:
 *           type: object
 *           properties:
 *             netCashChange:
 *               type: number
 *             beginningCashBalance:
 *               type: number
 *             endingCashBalance:
 *               type: number
 *
 *     FinancialRatios:
 *       type: object
 *       properties:
 *         liquidity:
 *           type: object
 *           properties:
 *             currentRatio:
 *               type: number
 *             quickRatio:
 *               type: number
 *             cashRatio:
 *               type: number
 *         profitability:
 *           type: object
 *           properties:
 *             grossProfitMargin:
 *               type: number
 *             netProfitMargin:
 *               type: number
 *             returnOnAssets:
 *               type: number
 *             returnOnEquity:
 *               type: number
 *         leverage:
 *           type: object
 *           properties:
 *             debtToEquity:
 *               type: number
 *             debtToAssets:
 *               type: number
 *             interestCoverage:
 *               type: number
 *         efficiency:
 *           type: object
 *           properties:
 *             assetTurnover:
 *               type: number
 *             receivablesTurnover:
 *               type: number
 *             inventoryTurnover:
 *               type: number
 */

/**
 * @openapi
 * /api/v1/organizations/{organizationId}/financial-statements/balance-sheet:
 *   get:
 *     summary: Generate balance sheet
 *     description: Generates a comprehensive balance sheet for the specified date
 *     tags: [Financial Statements]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization ID
 *       - in: query
 *         name: asOfDate
 *         schema:
 *           type: string
 *           format: date
 *         description: As-of date for balance sheet (defaults to current date)
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [JSON, PDF, CSV]
 *           default: JSON
 *         description: Output format
 *     responses:
 *       200:
 *         description: Balance sheet generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/BalanceSheet'
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Insufficient permissions
 *       500:
 *         description: Internal server error
 */
router.get(
  '/:organizationId/financial-statements/balance-sheet',
  authMiddleware,
  [
    param('organizationId').isUUID().withMessage('Organization ID must be a valid UUID'),
    query('asOfDate').optional().isISO8601().withMessage('As-of date must be valid ISO date'),
    query('format').optional().isIn(['JSON', 'PDF', 'CSV']).withMessage('Invalid format'),
  ],
  validateRequest,
  FinancialStatementsController.generateBalanceSheet
);

/**
 * @openapi
 * /api/v1/organizations/{organizationId}/financial-statements/income-statement:
 *   get:
 *     summary: Generate income statement
 *     description: Generates a comprehensive income statement for the specified period
 *     tags: [Financial Statements]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization ID
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: Period start date
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: Period end date
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [JSON, PDF, CSV]
 *           default: JSON
 *         description: Output format
 *     responses:
 *       200:
 *         description: Income statement generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/IncomeStatement'
 */
router.get(
  '/:organizationId/financial-statements/income-statement',
  authMiddleware,
  [
    param('organizationId').isUUID().withMessage('Organization ID must be a valid UUID'),
    query('startDate').isISO8601().withMessage('Start date must be valid ISO date'),
    query('endDate').isISO8601().withMessage('End date must be valid ISO date'),
    query('format').optional().isIn(['JSON', 'PDF', 'CSV']).withMessage('Invalid format'),
  ],
  validateRequest,
  FinancialStatementsController.generateIncomeStatement
);

/**
 * @openapi
 * /api/v1/organizations/{organizationId}/financial-statements/cash-flow:
 *   get:
 *     summary: Generate cash flow statement
 *     description: Generates a comprehensive cash flow statement for the specified period
 *     tags: [Financial Statements]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization ID
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: Period start date
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: Period end date
 *       - in: query
 *         name: method
 *         schema:
 *           type: string
 *           enum: [DIRECT, INDIRECT]
 *           default: INDIRECT
 *         description: Cash flow calculation method
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [JSON, PDF, CSV]
 *           default: JSON
 *         description: Output format
 *     responses:
 *       200:
 *         description: Cash flow statement generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/CashFlowStatement'
 */
router.get(
  '/:organizationId/financial-statements/cash-flow',
  authMiddleware,
  [
    param('organizationId').isUUID().withMessage('Organization ID must be a valid UUID'),
    query('startDate').isISO8601().withMessage('Start date must be valid ISO date'),
    query('endDate').isISO8601().withMessage('End date must be valid ISO date'),
    query('method').optional().isIn(['DIRECT', 'INDIRECT']).withMessage('Invalid cash flow method'),
    query('format').optional().isIn(['JSON', 'PDF', 'CSV']).withMessage('Invalid format'),
  ],
  validateRequest,
  FinancialStatementsController.generateCashFlowStatement
);

/**
 * @openapi
 * /api/v1/organizations/{organizationId}/financial-statements/ratios:
 *   get:
 *     summary: Calculate financial ratios
 *     description: Calculates comprehensive financial ratios for analysis
 *     tags: [Financial Statements]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization ID
 *       - in: query
 *         name: asOfDate
 *         schema:
 *           type: string
 *           format: date
 *         description: As-of date for ratio calculations (defaults to current date)
 *       - in: query
 *         name: periodStart
 *         schema:
 *           type: string
 *           format: date
 *         description: Period start date for income-based ratios
 *       - in: query
 *         name: periodEnd
 *         schema:
 *           type: string
 *           format: date
 *         description: Period end date for income-based ratios
 *     responses:
 *       200:
 *         description: Financial ratios calculated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/FinancialRatios'
 */
router.get(
  '/:organizationId/financial-statements/ratios',
  authMiddleware,
  [
    param('organizationId').isUUID().withMessage('Organization ID must be a valid UUID'),
    query('asOfDate').optional().isISO8601().withMessage('As-of date must be valid ISO date'),
    query('periodStart').optional().isISO8601().withMessage('Period start date must be valid ISO date'),
    query('periodEnd').optional().isISO8601().withMessage('Period end date must be valid ISO date'),
  ],
  validateRequest,
  FinancialStatementsController.calculateFinancialRatios
);

/**
 * @openapi
 * /api/v1/organizations/{organizationId}/financial-statements/comprehensive:
 *   get:
 *     summary: Generate comprehensive financial statements package
 *     description: Generates all three primary financial statements in a single response (ACCOUNTANT+ required)
 *     tags: [Financial Statements]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization ID
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: Period start date
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: Period end date
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [JSON, PDF]
 *           default: JSON
 *         description: Output format
 *       - in: query
 *         name: includeRatios
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Include financial ratio analysis
 *     responses:
 *       200:
 *         description: Comprehensive financial statements generated successfully
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
 *                     balanceSheet:
 *                       $ref: '#/components/schemas/BalanceSheet'
 *                     incomeStatement:
 *                       $ref: '#/components/schemas/IncomeStatement'
 *                     cashFlowStatement:
 *                       $ref: '#/components/schemas/CashFlowStatement'
 *                     financialRatios:
 *                       $ref: '#/components/schemas/FinancialRatios'
 *                     generatedAt:
 *                       type: string
 *                       format: date-time
 *       403:
 *         description: Insufficient permissions (ACCOUNTANT+ required)
 */
router.get(
  '/:organizationId/financial-statements/comprehensive',
  authMiddleware,
  [
    param('organizationId').isUUID().withMessage('Organization ID must be a valid UUID'),
    query('startDate').isISO8601().withMessage('Start date must be valid ISO date'),
    query('endDate').isISO8601().withMessage('End date must be valid ISO date'),
    query('format').optional().isIn(['JSON', 'PDF']).withMessage('Invalid format'),
    query('includeRatios').optional().isBoolean().withMessage('Include ratios must be boolean'),
  ],
  validateRequest,
  FinancialStatementsController.generateComprehensiveStatements
);

/**
 * @openapi
 * /api/v1/organizations/{organizationId}/financial-statements/comparison:
 *   get:
 *     summary: Generate comparative financial statements
 *     description: Generates financial statements with period-over-period comparison (ACCOUNTANT+ required)
 *     tags: [Financial Statements]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization ID
 *       - in: query
 *         name: currentPeriodStart
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: Current period start date
 *       - in: query
 *         name: currentPeriodEnd
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: Current period end date
 *       - in: query
 *         name: comparativePeriodStart
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: Comparative period start date
 *       - in: query
 *         name: comparativePeriodEnd
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: Comparative period end date
 *       - in: query
 *         name: statementType
 *         schema:
 *           type: string
 *           enum: [BALANCE_SHEET, INCOME_STATEMENT, CASH_FLOW_STATEMENT, ALL]
 *           default: ALL
 *         description: Type of statement to compare
 *     responses:
 *       200:
 *         description: Comparative financial statements generated successfully
 *       403:
 *         description: Insufficient permissions (ACCOUNTANT+ required)
 */
router.get(
  '/:organizationId/financial-statements/comparison',
  authMiddleware,
  [
    param('organizationId').isUUID().withMessage('Organization ID must be a valid UUID'),
    query('currentPeriodStart').isISO8601().withMessage('Current period start must be valid ISO date'),
    query('currentPeriodEnd').isISO8601().withMessage('Current period end must be valid ISO date'),
    query('comparativePeriodStart').isISO8601().withMessage('Comparative period start must be valid ISO date'),
    query('comparativePeriodEnd').isISO8601().withMessage('Comparative period end must be valid ISO date'),
    query('statementType').optional().isIn(['BALANCE_SHEET', 'INCOME_STATEMENT', 'CASH_FLOW_STATEMENT', 'ALL']).withMessage('Invalid statement type'),
  ],
  validateRequest,
  FinancialStatementsController.generateComparativeStatements
);

/**
 * @openapi
 * /api/v1/organizations/{organizationId}/financial-statements/export:
 *   post:
 *     summary: Export financial statements
 *     description: Export financial statements in various formats with customization options (ACCOUNTANT+ required)
 *     tags: [Financial Statements]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - statementTypes
 *               - periodStart
 *               - periodEnd
 *               - format
 *             properties:
 *               statementTypes:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [BALANCE_SHEET, INCOME_STATEMENT, CASH_FLOW_STATEMENT]
 *                 minItems: 1
 *               periodStart:
 *                 type: string
 *                 format: date
 *               periodEnd:
 *                 type: string
 *                 format: date
 *               format:
 *                 type: string
 *                 enum: [PDF, EXCEL, CSV]
 *               options:
 *                 type: object
 *                 properties:
 *                   includeRatios:
 *                     type: boolean
 *                     default: true
 *                   includeComparative:
 *                     type: boolean
 *                     default: false
 *                   comparativePeriodStart:
 *                     type: string
 *                     format: date
 *                   comparativePeriodEnd:
 *                     type: string
 *                     format: date
 *                   logoUrl:
 *                     type: string
 *                   headerText:
 *                     type: string
 *                   footerText:
 *                     type: string
 *     responses:
 *       200:
 *         description: Financial statements exported successfully
 *         content:
 *           application/octet-stream:
 *             schema:
 *               type: string
 *               format: binary
 *       403:
 *         description: Insufficient permissions (ACCOUNTANT+ required)
 */
router.post(
  '/:organizationId/financial-statements/export',
  authMiddleware,
  [
    param('organizationId').isUUID().withMessage('Organization ID must be a valid UUID'),
    body('statementTypes').isArray({ min: 1 }).withMessage('Statement types array is required'),
    body('statementTypes.*').isIn(['BALANCE_SHEET', 'INCOME_STATEMENT', 'CASH_FLOW_STATEMENT']).withMessage('Invalid statement type'),
    body('periodStart').isISO8601().withMessage('Period start must be valid ISO date'),
    body('periodEnd').isISO8601().withMessage('Period end must be valid ISO date'),
    body('format').isIn(['PDF', 'EXCEL', 'CSV']).withMessage('Invalid export format'),
    body('options.includeRatios').optional().isBoolean().withMessage('Include ratios must be boolean'),
    body('options.includeComparative').optional().isBoolean().withMessage('Include comparative must be boolean'),
    body('options.comparativePeriodStart').optional().isISO8601().withMessage('Comparative period start must be valid ISO date'),
    body('options.comparativePeriodEnd').optional().isISO8601().withMessage('Comparative period end must be valid ISO date'),
  ],
  validateRequest,
  FinancialStatementsController.exportFinancialStatements
);

/**
 * @openapi
 * /api/v1/organizations/{organizationId}/financial-statements/history:
 *   get:
 *     summary: Get financial statement generation history
 *     description: Retrieves the history of generated financial statements for the organization
 *     tags: [Financial Statements]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization ID
 *       - in: query
 *         name: statementType
 *         schema:
 *           type: string
 *           enum: [BALANCE_SHEET, INCOME_STATEMENT, CASH_FLOW_STATEMENT]
 *         description: Filter by statement type
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
 *           default: 20
 *         description: Number of records per page
 *     responses:
 *       200:
 *         description: Financial statement history retrieved successfully
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
 *                     statements:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/FinancialStatement'
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         page:
 *                           type: integer
 *                         limit:
 *                           type: integer
 *                         total:
 *                           type: integer
 *                         totalPages:
 *                           type: integer
 */
router.get(
  '/:organizationId/financial-statements/history',
  authMiddleware,
  [
    param('organizationId').isUUID().withMessage('Organization ID must be a valid UUID'),
    query('statementType').optional().isIn(['BALANCE_SHEET', 'INCOME_STATEMENT', 'CASH_FLOW_STATEMENT']).withMessage('Invalid statement type'),
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  ],
  validateRequest,
  FinancialStatementsController.getFinancialStatementHistory
);

export default router;