import { Router } from 'express';
import { invoicePDFController } from '../controllers/invoice-pdf.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { UserRole } from '../types/enums';

const router = Router();

// Authentication is already applied at app level before this router

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/invoices/{id}/pdf:
 *   get:
 *     tags: [Invoice PDF]
 *     summary: Generate and download invoice PDF
 *     description: Generates a PDF for the specified invoice with customizable template and styling options. Supports organization branding and tax settings.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         description: Organization ID
 *         schema:
 *           type: string
 *           example: "org_1234567890"
 *       - in: path
 *         name: id
 *         required: true
 *         description: Invoice ID
 *         schema:
 *           type: string
 *           example: "inv_1234567890"
 *       - in: query
 *         name: templateId
 *         description: Template ID to use (optional, uses default if not specified)
 *         schema:
 *           type: string
 *           example: "tpl_1234567890"
 *       - in: query
 *         name: styleId
 *         description: Style ID to use (optional, uses default if not specified)
 *         schema:
 *           type: string
 *           example: "sty_1234567890"
 *       - in: query
 *         name: format
 *         description: PDF page format
 *         schema:
 *           type: string
 *           enum: [A4, Letter]
 *           default: A4
 *       - in: query
 *         name: orientation
 *         description: PDF page orientation
 *         schema:
 *           type: string
 *           enum: [portrait, landscape]
 *           default: portrait
 *       - in: query
 *         name: regenerate
 *         description: Force regenerate PDF even if one exists
 *         schema:
 *           type: boolean
 *           default: false
 *     responses:
 *       200:
 *         description: PDF generated and returned successfully
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *         headers:
 *           Content-Disposition:
 *             description: Attachment filename
 *             schema:
 *               type: string
 *               example: 'attachment; filename="invoice-INV-001.pdf"'
 *           Content-Length:
 *             description: File size in bytes
 *             schema:
 *               type: integer
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Invoice not found
 *       500:
 *         description: PDF generation failed
 */
router.get(
  '/:id/pdf',
  invoicePDFController.generateInvoicePDF.bind(invoicePDFController)
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/invoices/{id}/pdf/regenerate:
 *   post:
 *     tags: [Invoice PDF]
 *     summary: Force regenerate invoice PDF
 *     description: Forces regeneration of invoice PDF with new template/style settings. Deletes existing PDFs for the invoice.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         description: Organization ID
 *         schema:
 *           type: string
 *       - in: path
 *         name: id
 *         required: true
 *         description: Invoice ID
 *         schema:
 *           type: string
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               templateId:
 *                 type: string
 *                 description: Template ID to use
 *                 example: "tpl_1234567890"
 *               styleId:
 *                 type: string
 *                 description: Style ID to use
 *                 example: "sty_1234567890"
 *               format:
 *                 type: string
 *                 enum: [A4, Letter]
 *                 default: A4
 *               orientation:
 *                 type: string
 *                 enum: [portrait, landscape]
 *                 default: portrait
 *     responses:
 *       201:
 *         description: PDF regenerated successfully
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
 *                   example: "PDF regenerated successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     pdf:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         filename:
 *                           type: string
 *                         fileSize:
 *                           type: integer
 *                         status:
 *                           type: string
 *                         createdAt:
 *                           type: string
 *                           format: date-time
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       404:
 *         description: Invoice not found
 *       500:
 *         description: PDF regeneration failed
 */
router.post(
  '/:id/pdf/regenerate',
  authorize(UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT, UserRole.EMPLOYEE),
  invoicePDFController.regenerateInvoicePDF.bind(invoicePDFController)
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/invoices/{id}/pdf/status:
 *   get:
 *     tags: [Invoice PDF]
 *     summary: Get PDF generation status
 *     description: Get the status and metadata for PDF generations of the specified invoice.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         description: Organization ID
 *         schema:
 *           type: string
 *       - in: path
 *         name: id
 *         required: true
 *         description: Invoice ID
 *         schema:
 *           type: string
 *       - in: query
 *         name: templateId
 *         description: Filter by template ID
 *         schema:
 *           type: string
 *       - in: query
 *         name: styleId
 *         description: Filter by style ID
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: PDF status retrieved successfully
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
 *                     pdfs:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           filename:
 *                             type: string
 *                           fileSize:
 *                             type: integer
 *                           status:
 *                             type: string
 *                             enum: [GENERATED, FAILED, PROCESSING]
 *                           templateId:
 *                             type: string
 *                           styleId:
 *                             type: string
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                           errorMessage:
 *                             type: string
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Invoice not found
 *       500:
 *         description: Failed to retrieve status
 */
router.get(
  '/:id/pdf/status',
  invoicePDFController.getInvoicePDFStatus.bind(invoicePDFController)
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/invoice-templates:
 *   get:
 *     tags: [Invoice Templates]
 *     summary: Get available invoice templates
 *     description: Retrieves all available invoice templates for the organization, including system and custom templates.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         description: Organization ID
 *         schema:
 *           type: string
 *       - in: query
 *         name: templateType
 *         description: Filter by template type
 *         schema:
 *           type: string
 *           enum: [STANDARD, MINIMAL, MODERN, CUSTOM]
 *       - in: query
 *         name: isSystem
 *         description: Filter by system templates
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: search
 *         description: Search template names and descriptions
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         description: Number of templates per page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 50
 *       - in: query
 *         name: offset
 *         description: Pagination offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *           default: 0
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
 *                 data:
 *                   type: object
 *                   properties:
 *                     templates:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           name:
 *                             type: string
 *                           description:
 *                             type: string
 *                           templateType:
 *                             type: string
 *                           isDefault:
 *                             type: boolean
 *                           isSystem:
 *                             type: boolean
 *                           version:
 *                             type: string
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                           stylesCount:
 *                             type: integer
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                         limit:
 *                           type: integer
 *                         offset:
 *                           type: integer
 *                         pages:
 *                           type: integer
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Failed to retrieve templates
 */
router.get(
  '/templates',
  invoicePDFController.getInvoiceTemplates.bind(invoicePDFController)
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/invoice-templates/preview:
 *   post:
 *     tags: [Invoice Templates]
 *     summary: Preview invoice template with sample data
 *     description: Generates an HTML preview of the specified template with sample invoice data. Returns rendered HTML for display in browser.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         description: Organization ID
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - templateId
 *             properties:
 *               templateId:
 *                 type: string
 *                 description: Template ID to preview
 *                 example: "tpl_1234567890"
 *               styleId:
 *                 type: string
 *                 description: Style ID to apply (optional)
 *                 example: "sty_1234567890"
 *     responses:
 *       200:
 *         description: Preview HTML generated successfully
 *         content:
 *           text/html:
 *             schema:
 *               type: string
 *               description: Rendered HTML preview
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Template not found
 *       500:
 *         description: Failed to generate preview
 */
router.post(
  '/templates/preview',
  invoicePDFController.previewInvoiceTemplate.bind(invoicePDFController)
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/invoice-templates/{id}:
 *   get:
 *     tags: [Invoice Templates]
 *     summary: Get single invoice template by ID
 *     description: Retrieves a specific invoice template with full details including associated styles.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         description: Organization ID
 *         schema:
 *           type: string
 *       - in: path
 *         name: id
 *         required: true
 *         description: Template ID
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Template retrieved successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Template not found
 *       500:
 *         description: Failed to retrieve template
 */
router.get(
  '/templates/:id',
  invoicePDFController.getInvoiceTemplate.bind(invoicePDFController)
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/invoice-templates:
 *   post:
 *     tags: [Invoice Templates]
 *     summary: Create custom invoice template
 *     description: Creates a new custom invoice template for the organization. Requires Admin or Manager role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         description: Organization ID
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - templateType
 *               - htmlTemplate
 *             properties:
 *               name:
 *                 type: string
 *                 description: Template name
 *                 example: "Custom Professional Template"
 *               description:
 *                 type: string
 *                 description: Template description
 *                 example: "Custom template with company-specific layout"
 *               templateType:
 *                 type: string
 *                 enum: [STANDARD, MINIMAL, MODERN, CUSTOM]
 *                 description: Template type category
 *               htmlTemplate:
 *                 type: string
 *                 description: Handlebars HTML template content
 *               isDefault:
 *                 type: boolean
 *                 description: Set as organization default template
 *                 default: false
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Template tags for categorization
 *     responses:
 *       201:
 *         description: Template created successfully
 *       400:
 *         description: Invalid template data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       500:
 *         description: Failed to create template
 */
router.post(
  '/templates',
  authorize(UserRole.ADMIN, UserRole.MANAGER),
  invoicePDFController.createInvoiceTemplate.bind(invoicePDFController)
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/invoice-templates/{templateId}:
 *   put:
 *     tags: [Invoice Templates]
 *     summary: Update invoice template
 *     description: Updates an existing custom invoice template. System templates cannot be modified. Requires Admin or Manager role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         description: Organization ID
 *         schema:
 *           type: string
 *       - in: path
 *         name: templateId
 *         required: true
 *         description: Template ID
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: Template name
 *               description:
 *                 type: string
 *                 description: Template description
 *               templateType:
 *                 type: string
 *                 enum: [STANDARD, MINIMAL, MODERN, CUSTOM]
 *               htmlTemplate:
 *                 type: string
 *                 description: Handlebars HTML template content
 *               isDefault:
 *                 type: boolean
 *                 description: Set as organization default template
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Template updated successfully
 *       400:
 *         description: Invalid template data or system template modification attempted
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       404:
 *         description: Template not found
 *       500:
 *         description: Failed to update template
 */
router.put(
  '/templates/:templateId',
  authorize(UserRole.ADMIN, UserRole.MANAGER),
  invoicePDFController.updateInvoiceTemplate.bind(invoicePDFController)
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/invoice-templates/{templateId}:
 *   delete:
 *     tags: [Invoice Templates]
 *     summary: Delete invoice template
 *     description: Soft deletes an invoice template. System templates and default templates cannot be deleted. Requires Admin role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         description: Organization ID
 *         schema:
 *           type: string
 *       - in: path
 *         name: templateId
 *         required: true
 *         description: Template ID
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Template deleted successfully
 *       400:
 *         description: Cannot delete system or default template
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       404:
 *         description: Template not found
 *       500:
 *         description: Failed to delete template
 */
router.delete(
  '/templates/:templateId',
  authorize(UserRole.ADMIN),
  invoicePDFController.deleteInvoiceTemplate.bind(invoicePDFController)
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/invoice-templates/{templateId}/duplicate:
 *   post:
 *     tags: [Invoice Templates]
 *     summary: Duplicate invoice template
 *     description: Creates a copy of an existing template with a new name. Requires Admin or Manager role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         description: Organization ID
 *         schema:
 *           type: string
 *       - in: path
 *         name: templateId
 *         required: true
 *         description: Template ID to duplicate
 *         schema:
 *           type: string
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: Name for the duplicated template (optional, will auto-generate if not provided)
 *                 example: "My Custom Copy"
 *     responses:
 *       201:
 *         description: Template duplicated successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       404:
 *         description: Template not found
 *       500:
 *         description: Failed to duplicate template
 */
router.post(
  '/templates/:templateId/duplicate',
  authorize(UserRole.ADMIN, UserRole.MANAGER),
  invoicePDFController.duplicateInvoiceTemplate.bind(invoicePDFController)
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/invoice-templates/{templateId}/set-default:
 *   put:
 *     tags: [Invoice Templates]
 *     summary: Set template as default
 *     description: Sets the specified template as the organization's default invoice template. Requires Admin or Manager role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         description: Organization ID
 *         schema:
 *           type: string
 *       - in: path
 *         name: templateId
 *         required: true
 *         description: Template ID to set as default
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Template set as default successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       404:
 *         description: Template not found
 *       500:
 *         description: Failed to set default template
 */
router.put(
  '/templates/:templateId/set-default',
  authorize(UserRole.ADMIN, UserRole.MANAGER),
  invoicePDFController.setDefaultInvoiceTemplate.bind(invoicePDFController)
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/invoice-styles:
 *   get:
 *     tags: [Invoice Styles]
 *     summary: Get available invoice styles
 *     description: Retrieves all available invoice styles for the organization.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         description: Organization ID
 *         schema:
 *           type: string
 *       - in: query
 *         name: templateId
 *         description: Filter by template ID
 *         schema:
 *           type: string
 *       - in: query
 *         name: isSystem
 *         description: Filter by system styles
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: search
 *         description: Search style names and descriptions
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         description: Number of styles per page
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: offset
 *         description: Pagination offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: Styles retrieved successfully
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Failed to retrieve styles
 */
router.get(
  '/styles',
  invoicePDFController.getInvoiceStyles.bind(invoicePDFController)
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/invoice-styles/{id}:
 *   get:
 *     tags: [Invoice Styles]
 *     summary: Get single invoice style by ID
 *     description: Retrieves a specific invoice style with full details including associated template information.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         description: Organization ID
 *         schema:
 *           type: string
 *       - in: path
 *         name: id
 *         required: true
 *         description: Style ID
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Style retrieved successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Style not found
 *       500:
 *         description: Failed to retrieve style
 */
router.get(
  '/styles/:id',
  invoicePDFController.getInvoiceStyle.bind(invoicePDFController)
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/invoice-styles:
 *   post:
 *     tags: [Invoice Styles]
 *     summary: Create custom invoice style
 *     description: Creates a new custom invoice style for the organization.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         description: Organization ID
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - cssContent
 *               - colorScheme
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Custom Blue Theme"
 *               description:
 *                 type: string
 *                 example: "Custom blue color scheme for invoices"
 *               templateId:
 *                 type: string
 *                 description: Associated template ID (optional)
 *               cssContent:
 *                 type: string
 *                 description: CSS stylesheet content
 *               colorScheme:
 *                 type: object
 *                 properties:
 *                   primary:
 *                     type: string
 *                     example: "#2563eb"
 *                   secondary:
 *                     type: string
 *                     example: "#64748b"
 *                   accent:
 *                     type: string
 *                     example: "#3b82f6"
 *                   background:
 *                     type: string
 *                     example: "#ffffff"
 *                   text:
 *                     type: string
 *                     example: "#1e293b"
 *               fontFamily:
 *                 type: string
 *                 example: "Arial, sans-serif"
 *               isDefault:
 *                 type: boolean
 *                 default: false
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Style created successfully
 *       400:
 *         description: Invalid style data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Failed to create style
 */
router.post(
  '/styles',
  authorize(UserRole.ADMIN, UserRole.MANAGER),
  invoicePDFController.createInvoiceStyle.bind(invoicePDFController)
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/invoice-styles/{id}:
 *   put:
 *     tags: [Invoice Styles]
 *     summary: Update invoice style
 *     description: Updates an existing custom invoice style. System styles cannot be modified. Requires Admin or Manager role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         description: Organization ID
 *         schema:
 *           type: string
 *       - in: path
 *         name: id
 *         required: true
 *         description: Style ID
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Updated Blue Theme"
 *               description:
 *                 type: string
 *                 example: "Updated blue color scheme"
 *               templateId:
 *                 type: string
 *                 description: Associated template ID (optional)
 *               cssContent:
 *                 type: string
 *                 description: CSS stylesheet content
 *               colorScheme:
 *                 type: object
 *                 properties:
 *                   primary:
 *                     type: string
 *                     example: "#2563eb"
 *                   secondary:
 *                     type: string
 *                     example: "#64748b"
 *                   accent:
 *                     type: string
 *                     example: "#3b82f6"
 *                   background:
 *                     type: string
 *                     example: "#ffffff"
 *                   text:
 *                     type: string
 *                     example: "#1e293b"
 *               fontFamily:
 *                 type: string
 *                 example: "Arial, sans-serif"
 *               isDefault:
 *                 type: boolean
 *                 description: Set as organization default style
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Style updated successfully
 *       400:
 *         description: Invalid style data or system style modification attempted
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       404:
 *         description: Style not found
 *       500:
 *         description: Failed to update style
 */
router.put(
  '/styles/:id',
  authorize(UserRole.ADMIN, UserRole.MANAGER),
  invoicePDFController.updateInvoiceStyle.bind(invoicePDFController)
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/invoice-styles/{id}:
 *   delete:
 *     tags: [Invoice Styles]
 *     summary: Delete invoice style
 *     description: Soft deletes an invoice style. System styles and default styles cannot be deleted. Requires Admin role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         description: Organization ID
 *         schema:
 *           type: string
 *       - in: path
 *         name: id
 *         required: true
 *         description: Style ID
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Style deleted successfully
 *       400:
 *         description: Cannot delete system or default style
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       404:
 *         description: Style not found
 *       500:
 *         description: Failed to delete style
 */
router.delete(
  '/styles/:id',
  authorize(UserRole.ADMIN),
  invoicePDFController.deleteInvoiceStyle.bind(invoicePDFController)
);

export default router;