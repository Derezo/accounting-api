import { Router } from 'express';
import { body, query, param } from 'express-validator';
import { TaxController } from '../controllers/tax.controller';
import { authenticate as authMiddleware } from '../middleware/auth.middleware';
import { validateRequest } from '../middleware/validation.middleware';
import { UserRole } from '../types/enums';

const router = Router();

/**
 * @openapi
 * components:
 *   schemas:
 *     TaxCalculationRequest:
 *       type: object
 *       required:
 *         - items
 *       properties:
 *         items:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               description:
 *                 type: string
 *               amount:
 *                 type: number
 *               category:
 *                 type: string
 *               isExempt:
 *                 type: boolean
 *         customerTaxExempt:
 *           type: boolean
 *           default: false
 *         jurisdiction:
 *           type: object
 *           properties:
 *             countryCode:
 *               type: string
 *               example: "CA"
 *             stateProvinceCode:
 *               type: string
 *               example: "ON"
 *             municipalityCode:
 *               type: string
 *             postalCode:
 *               type: string
 *               example: "M5V 3A8"
 *         calculationDate:
 *           type: string
 *           format: date
 *
 *     CanadianTaxContext:
 *       type: object
 *       properties:
 *         isQuickMethod:
 *           type: boolean
 *           default: false
 *         businessType:
 *           type: string
 *           enum: [SERVICE, RETAIL, MANUFACTURING]
 *           default: SERVICE
 *         gstRegistered:
 *           type: boolean
 *           default: true
 *         annualRevenue:
 *           type: number
 *
 *     TaxRateResponse:
 *       type: object
 *       properties:
 *         jurisdiction:
 *           type: object
 *         federalGST:
 *           type: number
 *         provincialHST:
 *           type: number
 *         provincialPST:
 *           type: number
 *         municipalTax:
 *           type: number
 *         compound:
 *           type: boolean
 *         effectiveDate:
 *           type: string
 *           format: date
 *
 *     TaxCalculationResult:
 *       type: object
 *       properties:
 *         subtotal:
 *           type: number
 *         totalTax:
 *           type: number
 *         total:
 *           type: number
 *         breakdown:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               taxType:
 *                 type: string
 *               rate:
 *                 type: number
 *               amount:
 *                 type: number
 *
 *     GSTHSTReturn:
 *       type: object
 *       properties:
 *         organizationId:
 *           type: string
 *         periodStart:
 *           type: string
 *           format: date
 *         periodEnd:
 *           type: string
 *           format: date
 *         totalSales:
 *           type: number
 *         totalPurchases:
 *           type: number
 *         gstHstCollected:
 *           type: number
 *         inputTaxCredits:
 *           type: number
 *         netTaxOwing:
 *           type: number
 *         adjustments:
 *           type: number
 *         totalOwing:
 *           type: number
 */

/**
 * @openapi
 * /api/v1/organizations/{organizationId}/tax/calculate:
 *   post:
 *     summary: Calculate tax for a transaction
 *     description: Calculates taxes for transaction items based on jurisdiction and customer status
 *     tags: [Tax]
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
 *             $ref: '#/components/schemas/TaxCalculationRequest'
 *     responses:
 *       200:
 *         description: Tax calculation successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/TaxCalculationResult'
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post(
  '/:organizationId/tax/calculate',
  authMiddleware,
  [
    param('organizationId').isUUID().withMessage('Organization ID must be a valid UUID'),
    body('items').isArray({ min: 1 }).withMessage('Items array is required and must not be empty'),
    body('items.*.description').notEmpty().withMessage('Item description is required'),
    body('items.*.amount').isFloat({ min: 0 }).withMessage('Item amount must be a positive number'),
    body('customerTaxExempt').optional().isBoolean().withMessage('Customer tax exempt must be boolean'),
    body('jurisdiction.countryCode').optional().isLength({ min: 2, max: 2 }).withMessage('Country code must be 2 characters'),
    body('calculationDate').optional().isISO8601().withMessage('Calculation date must be valid ISO date'),
  ],
  validateRequest,
  TaxController.calculateTax
);

/**
 * @openapi
 * /api/v1/organizations/{organizationId}/tax/calculate/canadian:
 *   post:
 *     summary: Calculate Canadian tax with provincial rules
 *     description: Calculates Canadian GST/HST/PST with province-specific rules and context
 *     tags: [Tax]
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
 *             allOf:
 *               - $ref: '#/components/schemas/TaxCalculationRequest'
 *               - type: object
 *                 properties:
 *                   context:
 *                     $ref: '#/components/schemas/CanadianTaxContext'
 *     responses:
 *       200:
 *         description: Canadian tax calculation successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   allOf:
 *                     - $ref: '#/components/schemas/TaxCalculationResult'
 *                     - type: object
 *                       properties:
 *                         canadianBreakdown:
 *                           type: object
 *                           properties:
 *                             gstAmount:
 *                               type: number
 *                             hstAmount:
 *                               type: number
 *                             pstAmount:
 *                               type: number
 *                             provinceName:
 *                               type: string
 *                             isCompound:
 *                               type: boolean
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post(
  '/:organizationId/tax/calculate/canadian',
  authMiddleware,
  [
    param('organizationId').isUUID().withMessage('Organization ID must be a valid UUID'),
    body('items').isArray({ min: 1 }).withMessage('Items array is required'),
    body('context.businessType').optional().isIn(['SERVICE', 'RETAIL', 'MANUFACTURING']).withMessage('Invalid business type'),
    body('context.gstRegistered').optional().isBoolean().withMessage('GST registered must be boolean'),
    body('context.isQuickMethod').optional().isBoolean().withMessage('Quick method must be boolean'),
    body('context.annualRevenue').optional().isFloat({ min: 0 }).withMessage('Annual revenue must be positive'),
  ],
  validateRequest,
  TaxController.calculateCanadianTax
);

/**
 * @openapi
 * /api/v1/organizations/{organizationId}/tax/itc/calculate:
 *   post:
 *     summary: Calculate Input Tax Credits (ITCs)
 *     description: Calculates Input Tax Credits for business expenses in Canada
 *     tags: [Tax]
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
 *               - expenseAmount
 *               - taxPaid
 *               - expenseType
 *             properties:
 *               expenseAmount:
 *                 type: number
 *                 minimum: 0
 *               taxPaid:
 *                 type: number
 *                 minimum: 0
 *               expenseType:
 *                 type: string
 *                 enum: [BUSINESS_SUPPLIES, EQUIPMENT, PROFESSIONAL_SERVICES, OFFICE_RENT, UTILITIES]
 *               context:
 *                 $ref: '#/components/schemas/CanadianTaxContext'
 *     responses:
 *       200:
 *         description: ITC calculation successful
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
 *                     expenseAmount:
 *                       type: number
 *                     taxPaid:
 *                       type: number
 *                     eligibleITC:
 *                       type: number
 *                     recoveryRate:
 *                       type: number
 *                     expenseType:
 *                       type: string
 */
router.post(
  '/:organizationId/tax/itc/calculate',
  authMiddleware,
  [
    param('organizationId').isUUID().withMessage('Organization ID must be a valid UUID'),
    body('expenseAmount').isFloat({ min: 0 }).withMessage('Expense amount must be positive'),
    body('taxPaid').isFloat({ min: 0 }).withMessage('Tax paid must be positive'),
    body('expenseType').isIn(['BUSINESS_SUPPLIES', 'EQUIPMENT', 'PROFESSIONAL_SERVICES', 'OFFICE_RENT', 'UTILITIES']).withMessage('Invalid expense type'),
  ],
  validateRequest,
  TaxController.calculateInputTaxCredits
);

/**
 * @openapi
 * /api/v1/organizations/{organizationId}/tax/gst-hst-return:
 *   post:
 *     summary: Generate GST/HST return
 *     description: Generates comprehensive GST/HST return for the specified period (ACCOUNTANT+ required)
 *     tags: [Tax]
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
 *               - startDate
 *               - endDate
 *             properties:
 *               startDate:
 *                 type: string
 *                 format: date
 *               endDate:
 *                 type: string
 *                 format: date
 *               context:
 *                 $ref: '#/components/schemas/CanadianTaxContext'
 *     responses:
 *       200:
 *         description: GST/HST return generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/GSTHSTReturn'
 */
router.post(
  '/:organizationId/tax/gst-hst-return',
  authMiddleware,
  [
    param('organizationId').isUUID().withMessage('Organization ID must be a valid UUID'),
    body('startDate').isISO8601().withMessage('Start date must be valid ISO date'),
    body('endDate').isISO8601().withMessage('End date must be valid ISO date'),
  ],
  validateRequest,
  TaxController.generateGSTHSTReturn
);

/**
 * @openapi
 * /api/v1/organizations/{organizationId}/tax/remittance:
 *   post:
 *     summary: Calculate tax remittance for a period
 *     description: Calculates tax remittance amounts for specified period and frequency (ACCOUNTANT+ required)
 *     tags: [Tax]
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
 *               - taxType
 *               - startDate
 *               - endDate
 *               - frequency
 *             properties:
 *               taxType:
 *                 type: string
 *                 enum: [GST, HST, PST, CORPORATE_INCOME_TAX]
 *               startDate:
 *                 type: string
 *                 format: date
 *               endDate:
 *                 type: string
 *                 format: date
 *               frequency:
 *                 type: string
 *                 enum: [MONTHLY, QUARTERLY, ANNUALLY]
 *     responses:
 *       200:
 *         description: Tax remittance calculated successfully
 *       403:
 *         description: Insufficient permissions (ACCOUNTANT+ required)
 */
router.post(
  '/:organizationId/tax/remittance',
  authMiddleware,
  [
    param('organizationId').isUUID().withMessage('Organization ID must be a valid UUID'),
    body('taxType').isIn(['GST', 'HST', 'PST', 'CORPORATE_INCOME_TAX']).withMessage('Invalid tax type'),
    body('startDate').isISO8601().withMessage('Start date must be valid ISO date'),
    body('endDate').isISO8601().withMessage('End date must be valid ISO date'),
    body('frequency').isIn(['MONTHLY', 'QUARTERLY', 'ANNUALLY']).withMessage('Invalid frequency'),
  ],
  validateRequest,
  TaxController.calculateTaxRemittance
);

/**
 * @openapi
 * /api/v1/organizations/{organizationId}/tax/payments:
 *   post:
 *     summary: Record tax payment
 *     description: Records a tax payment made to tax authorities (ACCOUNTANT+ required)
 *     tags: [Tax]
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
 *               - taxType
 *               - taxPeriod
 *               - taxYear
 *               - amountPaid
 *               - paymentDate
 *             properties:
 *               taxType:
 *                 type: string
 *                 enum: [GST, HST, PST, CORPORATE_INCOME_TAX]
 *               taxPeriod:
 *                 type: string
 *                 enum: [Q1, Q2, Q3, Q4, ANNUAL]
 *               taxYear:
 *                 type: integer
 *                 minimum: 2000
 *                 maximum: 2100
 *               amountPaid:
 *                 type: number
 *                 minimum: 0
 *               paymentDate:
 *                 type: string
 *                 format: date
 *               paymentReference:
 *                 type: string
 *     responses:
 *       201:
 *         description: Tax payment recorded successfully
 *       403:
 *         description: Insufficient permissions (ACCOUNTANT+ required)
 */
router.post(
  '/:organizationId/tax/payments',
  authMiddleware,
  [
    param('organizationId').isUUID().withMessage('Organization ID must be a valid UUID'),
    body('taxType').isIn(['GST', 'HST', 'PST', 'CORPORATE_INCOME_TAX']).withMessage('Invalid tax type'),
    body('taxPeriod').isIn(['Q1', 'Q2', 'Q3', 'Q4', 'ANNUAL']).withMessage('Invalid tax period'),
    body('taxYear').isInt({ min: 2000, max: 2100 }).withMessage('Tax year must be between 2000 and 2100'),
    body('amountPaid').isFloat({ min: 0 }).withMessage('Amount paid must be positive'),
    body('paymentDate').isISO8601().withMessage('Payment date must be valid ISO date'),
    body('paymentReference').optional().isString().withMessage('Payment reference must be string'),
  ],
  validateRequest,
  TaxController.recordTaxPayment
);

/**
 * @openapi
 * /api/v1/organizations/{organizationId}/tax/rates:
 *   get:
 *     summary: Get tax rates for jurisdiction
 *     description: Retrieves current tax rates for specified jurisdiction
 *     tags: [Tax]
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
 *         name: countryCode
 *         required: true
 *         schema:
 *           type: string
 *           minLength: 2
 *           maxLength: 2
 *         description: Two-letter country code
 *       - in: query
 *         name: stateProvinceCode
 *         schema:
 *           type: string
 *         description: State or province code
 *       - in: query
 *         name: municipalityCode
 *         schema:
 *           type: string
 *         description: Municipality code
 *       - in: query
 *         name: postalCode
 *         schema:
 *           type: string
 *         description: Postal or ZIP code
 *     responses:
 *       200:
 *         description: Tax rates retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/TaxRateResponse'
 */
router.get(
  '/:organizationId/tax/rates',
  authMiddleware,
  [
    param('organizationId').isUUID().withMessage('Organization ID must be a valid UUID'),
    query('countryCode').isLength({ min: 2, max: 2 }).withMessage('Country code must be 2 characters'),
    query('stateProvinceCode').optional().isString().withMessage('State/province code must be string'),
    query('municipalityCode').optional().isString().withMessage('Municipality code must be string'),
    query('postalCode').optional().isString().withMessage('Postal code must be string'),
  ],
  validateRequest,
  TaxController.getTaxRatesForJurisdiction
);

/**
 * @openapi
 * /api/v1/tax/rates:
 *   post:
 *     summary: Configure tax rate
 *     description: Configure new or update existing tax rate (SUPER_ADMIN required)
 *     tags: [Tax]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - jurisdiction
 *               - taxType
 *               - rate
 *               - effectiveDate
 *             properties:
 *               jurisdiction:
 *                 type: object
 *                 properties:
 *                   countryCode:
 *                     type: string
 *                   stateProvinceCode:
 *                     type: string
 *                   municipalityCode:
 *                     type: string
 *               taxType:
 *                 type: string
 *                 enum: [GST, HST, PST, MUNICIPAL]
 *               rate:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 100
 *               effectiveDate:
 *                 type: string
 *                 format: date
 *               endDate:
 *                 type: string
 *                 format: date
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Tax rate configured successfully
 *       403:
 *         description: Insufficient permissions (SUPER_ADMIN required)
 */
router.post(
  '/rates',
  authMiddleware,
  [
    body('jurisdiction.countryCode').isLength({ min: 2, max: 2 }).withMessage('Country code must be 2 characters'),
    body('taxType').isIn(['GST', 'HST', 'PST', 'MUNICIPAL']).withMessage('Invalid tax type'),
    body('rate').isFloat({ min: 0, max: 100 }).withMessage('Rate must be between 0 and 100'),
    body('effectiveDate').isISO8601().withMessage('Effective date must be valid ISO date'),
    body('endDate').optional().isISO8601().withMessage('End date must be valid ISO date'),
  ],
  validateRequest,
  TaxController.configureTaxRate
);

/**
 * @openapi
 * /api/v1/tax/rates/canadian/initialize:
 *   post:
 *     summary: Initialize Canadian tax rates
 *     description: Initialize standard Canadian provincial and federal tax rates (SUPER_ADMIN required)
 *     tags: [Tax]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Canadian tax rates initialized successfully
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
 *                     $ref: '#/components/schemas/TaxRateResponse'
 *                 message:
 *                   type: string
 *       403:
 *         description: Insufficient permissions (SUPER_ADMIN required)
 */
router.post(
  '/rates/canadian/initialize',
  authMiddleware,
  TaxController.initializeCanadianTaxRates
);

/**
 * @openapi
 * /api/v1/tax/zero-rated/check:
 *   post:
 *     summary: Check if item is zero-rated
 *     description: Determines if an item qualifies for zero-rated GST/HST treatment
 *     tags: [Tax]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - itemDescription
 *             properties:
 *               itemDescription:
 *                 type: string
 *               itemCategory:
 *                 type: string
 *     responses:
 *       200:
 *         description: Zero-rated status checked successfully
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
 *                     itemDescription:
 *                       type: string
 *                     itemCategory:
 *                       type: string
 *                     isZeroRated:
 *                       type: boolean
 */
router.post(
  '/zero-rated/check',
  authMiddleware,
  [
    body('itemDescription').notEmpty().withMessage('Item description is required'),
    body('itemCategory').optional().isString().withMessage('Item category must be string'),
  ],
  validateRequest,
  TaxController.checkZeroRated
);

/**
 * @openapi
 * /api/v1/tax/exempt/check:
 *   post:
 *     summary: Check if item is GST exempt
 *     description: Determines if an item is exempt from GST/HST
 *     tags: [Tax]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - itemDescription
 *             properties:
 *               itemDescription:
 *                 type: string
 *               itemCategory:
 *                 type: string
 *     responses:
 *       200:
 *         description: GST exempt status checked successfully
 */
router.post(
  '/exempt/check',
  authMiddleware,
  [
    body('itemDescription').notEmpty().withMessage('Item description is required'),
    body('itemCategory').optional().isString().withMessage('Item category must be string'),
  ],
  validateRequest,
  TaxController.checkGSTExempt
);

/**
 * @openapi
 * /api/v1/tax/gst-number/validate:
 *   post:
 *     summary: Validate GST number
 *     description: Validates Canadian GST/HST registration number format
 *     tags: [Tax]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - gstNumber
 *             properties:
 *               gstNumber:
 *                 type: string
 *                 example: "123456789RT0001"
 *     responses:
 *       200:
 *         description: GST number validation completed
 */
router.post(
  '/gst-number/validate',
  authMiddleware,
  [
    body('gstNumber').notEmpty().withMessage('GST number is required'),
  ],
  validateRequest,
  TaxController.validateGSTNumber
);

/**
 * @openapi
 * /api/v1/tax/small-supplier/threshold:
 *   get:
 *     summary: Get small supplier threshold
 *     description: Returns the current small supplier threshold for GST/HST registration
 *     tags: [Tax]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Small supplier threshold retrieved successfully
 */
router.get(
  '/small-supplier/threshold',
  authMiddleware,
  TaxController.getSmallSupplierThreshold
);

/**
 * @openapi
 * /api/v1/tax/quick-method/rate:
 *   get:
 *     summary: Get Quick Method rate
 *     description: Returns the Quick Method remittance rate for specified province and business type
 *     tags: [Tax]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: province
 *         required: true
 *         schema:
 *           type: string
 *           enum: [AB, BC, MB, NB, NL, NS, NT, NU, ON, PE, QC, SK, YT]
 *         description: Canadian province or territory code
 *       - in: query
 *         name: businessType
 *         required: true
 *         schema:
 *           type: string
 *           enum: [SERVICE, RETAIL, MANUFACTURING]
 *         description: Business type for Quick Method calculation
 *     responses:
 *       200:
 *         description: Quick Method rate retrieved successfully
 */
router.get(
  '/quick-method/rate',
  authMiddleware,
  [
    query('province').isIn(['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT']).withMessage('Invalid province code'),
    query('businessType').isIn(['SERVICE', 'RETAIL', 'MANUFACTURING']).withMessage('Invalid business type'),
  ],
  validateRequest,
  TaxController.getQuickMethodRate
);

export default router;