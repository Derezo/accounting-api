import { Router } from 'express';
import { intakeController } from '../controllers/intake.controller';
import { publicRateLimit, tokenRateLimit } from '../middleware/public-rate-limit.middleware';
import { validateIntakeToken } from '../middleware/intake-token.middleware';
import { botDetection, blockDisposableEmail } from '../middleware/bot-detection.middleware';

const router = Router();

/**
 * @swagger
 * tags:
 *   - name: Public Intake
 *     description: Public customer and quote intake workflow (no authentication required)
 *
 * components:
 *   securitySchemes:
 *     IntakeToken:
 *       type: apiKey
 *       in: header
 *       name: X-Intake-Token
 *       description: Token obtained from /initialize endpoint
 */

/**
 * @swagger
 * /public/intake/templates:
 *   get:
 *     tags: [Public Intake]
 *     summary: Get all available business templates
 *     description: |
 *       Returns a list of all available industry-specific field templates.
 *       Use this to show available categories to users during intake.
 *
 *       **No authentication required**
 *
 *       Templates include: HVAC, PLUMBING, ELECTRICAL, GENERAL, LANDSCAPING,
 *       CLEANING, CONSTRUCTION, ROOFING
 *     responses:
 *       200:
 *         description: Templates retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 templates:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       category:
 *                         type: string
 *                         example: "HVAC"
 *                       name:
 *                         type: string
 *                         example: "HVAC Services"
 *                       description:
 *                         type: string
 *                         example: "Heating, Ventilation, and Air Conditioning"
 *                       fieldCount:
 *                         type: number
 *                         example: 7
 *                 total:
 *                   type: number
 *                   example: 8
 */
router.get(
  '/templates',
  publicRateLimit('status'),
  intakeController.getTemplates.bind(intakeController)
);

/**
 * @swagger
 * /public/intake/templates/{category}:
 *   get:
 *     tags: [Public Intake]
 *     summary: Get field template for specific category
 *     description: |
 *       Returns the complete field template for a specific service category.
 *       Use this to dynamically generate form fields based on the selected category.
 *
 *       **No authentication required**
 *
 *       Each field includes:
 *       - Field type (text, select, number, etc.)
 *       - Validation rules (required, min, max, pattern)
 *       - Options for select/radio fields
 *       - Conditional display rules (showIf)
 *       - Help text and placeholders
 *     parameters:
 *       - in: path
 *         name: category
 *         required: true
 *         schema:
 *           type: string
 *           enum: [HVAC, PLUMBING, ELECTRICAL, GENERAL, LANDSCAPING, CLEANING, CONSTRUCTION, ROOFING]
 *         description: Service category
 *     responses:
 *       200:
 *         description: Template retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 category:
 *                   type: string
 *                   example: "HVAC"
 *                 template:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                       example: "HVAC Services"
 *                     description:
 *                       type: string
 *                       example: "Heating, Ventilation, and Air Conditioning"
 *                     fields:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           name:
 *                             type: string
 *                             example: "systemType"
 *                           type:
 *                             type: string
 *                             enum: [text, textarea, number, select, multiselect, date, radio, checkbox, tel, email]
 *                             example: "select"
 *                           label:
 *                             type: string
 *                             example: "System Type"
 *                           required:
 *                             type: boolean
 *                             example: true
 *                           options:
 *                             type: array
 *                             items:
 *                               type: string
 *                           helpText:
 *                             type: string
 *                           placeholder:
 *                             type: string
 *                           min:
 *                             type: number
 *                           max:
 *                             type: number
 *                           showIf:
 *                             type: object
 *                             properties:
 *                               field:
 *                                 type: string
 *                               value:
 *                                 oneOf:
 *                                   - type: string
 *                                   - type: array
 *                                     items:
 *                                       type: string
 *       400:
 *         description: Invalid category
 *       404:
 *         description: Template not found
 */
router.get(
  '/templates/:category',
  publicRateLimit('status'),
  intakeController.getTemplateByCategory.bind(intakeController)
);

/**
 * @swagger
 * /public/intake/templates/{category}/validate:
 *   post:
 *     tags: [Public Intake]
 *     summary: Validate custom fields
 *     description: |
 *       Validates custom field values against the template for a specific category.
 *       Use this for client-side validation before submitting the intake form.
 *
 *       **No authentication required**
 *
 *       Returns:
 *       - Whether validation passed
 *       - List of validation errors (missing required fields, invalid values, etc.)
 *       - Warnings for unknown fields
 *     parameters:
 *       - in: path
 *         name: category
 *         required: true
 *         schema:
 *           type: string
 *           enum: [HVAC, PLUMBING, ELECTRICAL, GENERAL, LANDSCAPING, CLEANING, CONSTRUCTION, ROOFING]
 *         description: Service category
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - customFields
 *             properties:
 *               customFields:
 *                 type: object
 *                 description: Key-value pairs of custom field data
 *                 example:
 *                   systemType: "Central Air"
 *                   systemAge: 10
 *                   brandModel: "Carrier 24ACC636"
 *                   issueType: ["Not heating/cooling", "Strange noises"]
 *     responses:
 *       200:
 *         description: Validation results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: True if validation passed
 *                   example: true
 *                 validation:
 *                   type: object
 *                   properties:
 *                     isValid:
 *                       type: boolean
 *                       example: true
 *                     errors:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: []
 *                     warnings:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["Unknown field \"customNote\" provided (will be stored but not validated)"]
 *       400:
 *         description: Invalid request (missing customFields or invalid category)
 */
router.post(
  '/templates/:category/validate',
  publicRateLimit('step'),
  intakeController.validateCustomFields.bind(intakeController)
);

/**
 * @swagger
 * /public/intake/initialize:
 *   post:
 *     tags: [Public Intake]
 *     summary: Initialize new intake session
 *     description: |
 *       Creates a new intake session and returns a token.
 *       The token must be included in the X-Intake-Token header for all subsequent requests.
 *
 *       **No authentication required**
 *
 *       **Rate Limits:**
 *       - 5 initializations per hour per IP address
 *       - Aggressive bot detection enabled
 *
 *       **Session Duration:** 48 hours
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fingerprint:
 *                 type: string
 *                 description: Optional browser fingerprint for enhanced security
 *                 example: "a1b2c3d4e5f6g7h8"
 *     responses:
 *       201:
 *         description: Session created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Intake session initialized successfully"
 *                 token:
 *                   type: string
 *                   description: Session token to use for subsequent requests
 *                   example: "abcd1234efgh5678ijkl9012mnop3456"
 *                 sessionId:
 *                   type: string
 *                   example: "cls1a2b3c4d5e6f7g8h9"
 *                 expiresAt:
 *                   type: string
 *                   format: date-time
 *                   example: "2025-10-02T12:00:00Z"
 *                 currentStep:
 *                   type: string
 *                   example: "EMAIL_CAPTURE"
 *                 instructions:
 *                   type: object
 *       403:
 *         description: Bot detected or IP banned
 *       429:
 *         description: Rate limit exceeded
 */
router.post(
  '/initialize',
  publicRateLimit('initialize'),
  botDetection,
  intakeController.initialize.bind(intakeController)
);

/**
 * @swagger
 * /public/intake/step:
 *   post:
 *     tags: [Public Intake]
 *     summary: Update intake session data
 *     description: |
 *       Submit customer or quote data for the current step.
 *       Data can be submitted piecemeal - you don't need to complete everything at once.
 *
 *       **Requires X-Intake-Token header**
 *
 *       **Rate Limits:**
 *       - 10 updates per minute per IP address
 *       - 50 total updates per session lifetime
 *       - Bot detection on every request
 *
 *       **Workflow Steps:**
 *       1. EMAIL_CAPTURE - Submit email address
 *       2. PROFILE_TYPE - Select RESIDENTIAL or COMMERCIAL
 *       3. PROFILE_DETAILS - Provide contact info and address
 *       4. SERVICE_CATEGORY - Select service category
 *       5. SERVICE_DETAILS - Provide service details
 *       6. ADDITIONAL_INFO - Optional additional information
 *       7. REVIEW - Review all data
 *       8. SUBMIT - Final submission (use /submit endpoint)
 *     security:
 *       - IntakeToken: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - step
 *             properties:
 *               step:
 *                 type: string
 *                 enum: [EMAIL_CAPTURE, PROFILE_TYPE, PROFILE_DETAILS, SERVICE_CATEGORY, SERVICE_DETAILS, ADDITIONAL_INFO, REVIEW]
 *                 example: "EMAIL_CAPTURE"
 *               customerData:
 *                 type: object
 *                 description: Customer information (residential or commercial)
 *                 properties:
 *                   email:
 *                     type: string
 *                     format: email
 *                   profileType:
 *                     type: string
 *                     enum: [RESIDENTIAL, COMMERCIAL]
 *                   firstName:
 *                     type: string
 *                   lastName:
 *                     type: string
 *                   businessName:
 *                     type: string
 *                   phone:
 *                     type: string
 *                   addressLine1:
 *                     type: string
 *                   city:
 *                     type: string
 *                   province:
 *                     type: string
 *                   postalCode:
 *                     type: string
 *               quoteData:
 *                 type: object
 *                 description: Quote/service request information
 *                 properties:
 *                   category:
 *                     type: string
 *                     enum: [HVAC, PLUMBING, ELECTRICAL, GENERAL, LANDSCAPING, CLEANING, CONSTRUCTION, ROOFING, OTHER]
 *                   serviceType:
 *                     type: string
 *                     enum: [REPAIR, INSTALLATION, MAINTENANCE, CONSULTATION]
 *                   urgency:
 *                     type: string
 *                     enum: [EMERGENCY, URGENT, ROUTINE, SCHEDULED]
 *                   description:
 *                     type: string
 *                   estimatedBudget:
 *                     type: string
 *                     enum: [UNDER_1000, 1000_5000, 5000_10000, 10000_PLUS, UNSURE]
 *                   customFields:
 *                     type: object
 *                     description: Industry-specific custom fields based on category (use GET /templates/:category to get field definitions)
 *                     additionalProperties: true
 *                     example:
 *                       systemType: "Central Air"
 *                       systemAge: 10
 *                       issueType: ["Not heating/cooling", "Strange noises"]
 *               privacyConsent:
 *                 type: boolean
 *               termsConsent:
 *                 type: boolean
 *               marketingConsent:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Step updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Invalid or missing token
 *       403:
 *         description: Bot detected or session inactive
 *       429:
 *         description: Rate limit exceeded
 */
router.post(
  '/step',
  publicRateLimit('step'),
  validateIntakeToken(true),
  tokenRateLimit,
  botDetection,
  blockDisposableEmail,
  intakeController.updateStep.bind(intakeController)
);

/**
 * @swagger
 * /public/intake/status:
 *   get:
 *     tags: [Public Intake]
 *     summary: Get session status
 *     description: |
 *       Retrieve current session status and completion progress.
 *
 *       **Requires X-Intake-Token header**
 *
 *       **Rate Limits:**
 *       - 100 requests per hour per IP address
 *
 *       Returns detailed information about:
 *       - Current step and completed steps
 *       - Completion percentage for customer and quote data
 *       - All submitted data
 *       - Whether session is ready for final submission
 *     security:
 *       - IntakeToken: []
 *     responses:
 *       200:
 *         description: Session status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 session:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     status:
 *                       type: string
 *                       enum: [ACTIVE, COMPLETED, EXPIRED, ABANDONED]
 *                     currentStep:
 *                       type: string
 *                     completedSteps:
 *                       type: array
 *                       items:
 *                         type: string
 *                     expiresAt:
 *                       type: string
 *                       format: date-time
 *                 completion:
 *                   type: object
 *                   properties:
 *                     overall:
 *                       type: number
 *                       example: 75
 *                     customer:
 *                       type: number
 *                       example: 80
 *                     quote:
 *                       type: number
 *                       example: 70
 *                 data:
 *                   type: object
 *                   properties:
 *                     customer:
 *                       type: object
 *                     quote:
 *                       type: object
 *                 canSubmit:
 *                   type: boolean
 *                   description: Whether session has all required data for submission
 *       401:
 *         description: Invalid or missing token
 *       404:
 *         description: Session not found
 */
router.get(
  '/status',
  publicRateLimit('status'),
  validateIntakeToken(true),
  intakeController.getStatus.bind(intakeController)
);

/**
 * @swagger
 * /public/intake/submit:
 *   post:
 *     tags: [Public Intake]
 *     summary: Submit intake and create customer/quote
 *     description: |
 *       Finalize the intake process and create actual Customer and Quote records.
 *       This is the final step that converts temporary intake data to permanent records.
 *
 *       **Requires X-Intake-Token header**
 *
 *       **Rate Limits:**
 *       - 2 submissions per hour per IP address
 *       - 1 submission per session (single-use)
 *       - Maximum bot detection security
 *
 *       **Requirements:**
 *       - All mandatory customer fields completed
 *       - All mandatory quote fields completed
 *       - Privacy policy and terms accepted
 *       - Session must be in ACTIVE status
 *
 *       **After Submission:**
 *       - Session marked as COMPLETED
 *       - Customer and Quote records created
 *       - Confirmation email sent
 *       - Internal team notified
 *     security:
 *       - IntakeToken: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - organizationId
 *             properties:
 *               organizationId:
 *                 type: string
 *                 description: Organization ID to associate the customer and quote with
 *                 example: "org_1234567890abcdef"
 *     responses:
 *       201:
 *         description: Intake submitted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Intake submitted successfully! We will contact you shortly."
 *                 customer:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     email:
 *                       type: string
 *                     type:
 *                       type: string
 *                 quote:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     quoteNumber:
 *                       type: string
 *                     status:
 *                       type: string
 *                 nextSteps:
 *                   type: array
 *                   items:
 *                     type: string
 *       400:
 *         description: Validation error or incomplete data
 *       401:
 *         description: Invalid or missing token
 *       403:
 *         description: Bot detected or session inactive
 *       429:
 *         description: Rate limit exceeded (only 1 submission allowed per session)
 */
router.post(
  '/submit',
  publicRateLimit('submit'),
  validateIntakeToken(true),
  tokenRateLimit,
  botDetection,
  intakeController.submit.bind(intakeController)
);

export default router;