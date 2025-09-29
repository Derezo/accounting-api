import { Router } from 'express';
import { organizationSettingsController } from '../controllers/organization-settings.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { uploadSingle } from '../middleware/upload.middleware';
import { UserRole } from '../types/enums';

const router = Router();

// Apply authentication to all routes
router.use(authenticate);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/settings/invoice:
 *   get:
 *     tags: [Organization Settings]
 *     summary: Get organization invoice settings
 *     description: Retrieves complete invoice customization settings including branding, available templates, and styles for the organization.
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
 *     responses:
 *       200:
 *         description: Invoice settings retrieved successfully
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
 *                   example: "Invoice settings retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     branding:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         logoUrl:
 *                           type: string
 *                           example: "/storage/logos/org123/logo.png"
 *                         logoWidth:
 *                           type: integer
 *                           example: 200
 *                         logoHeight:
 *                           type: integer
 *                           example: 80
 *                         showLogo:
 *                           type: boolean
 *                           example: true
 *                         showOrgName:
 *                           type: boolean
 *                           example: true
 *                         primaryColor:
 *                           type: string
 *                           example: "#2563eb"
 *                         secondaryColor:
 *                           type: string
 *                           example: "#64748b"
 *                         accentColor:
 *                           type: string
 *                           example: "#3b82f6"
 *                         backgroundColor:
 *                           type: string
 *                           example: "#ffffff"
 *                         textColor:
 *                           type: string
 *                           example: "#1e293b"
 *                         displaySettings:
 *                           type: object
 *                           properties:
 *                             dateFormat:
 *                               type: string
 *                               example: "YYYY-MM-DD"
 *                             currency:
 *                               type: string
 *                               example: "CAD"
 *                             layout:
 *                               type: string
 *                               example: "standard"
 *                         customCss:
 *                           type: string
 *                         taxesEnabled:
 *                           type: boolean
 *                           example: true
 *                         defaultTaxExempt:
 *                           type: boolean
 *                           example: false
 *                         taxDisplaySettings:
 *                           type: object
 *                         defaultTemplateId:
 *                           type: string
 *                         defaultStyleId:
 *                           type: string
 *                         createdAt:
 *                           type: string
 *                           format: date-time
 *                         updatedAt:
 *                           type: string
 *                           format: date-time
 *                     availableTemplates:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           name:
 *                             type: string
 *                           templateType:
 *                             type: string
 *                           isDefault:
 *                             type: boolean
 *                     availableStyles:
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
 *                           isDefault:
 *                             type: boolean
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Organization not found
 *       500:
 *         description: Failed to retrieve settings
 */
router.get(
  '/invoice',
  organizationSettingsController.getInvoiceSettings.bind(organizationSettingsController)
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/settings/invoice:
 *   put:
 *     tags: [Organization Settings]
 *     summary: Update organization invoice settings
 *     description: Updates invoice customization settings for the organization. Requires Admin or Manager role.
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
 *             properties:
 *               logoUrl:
 *                 type: string
 *                 description: Logo URL
 *                 example: "/storage/logos/org123/logo.png"
 *               logoWidth:
 *                 type: integer
 *                 description: Logo display width in pixels
 *                 example: 200
 *               logoHeight:
 *                 type: integer
 *                 description: Logo display height in pixels
 *                 example: 80
 *               showLogo:
 *                 type: boolean
 *                 description: Whether to display logo on invoices
 *                 example: true
 *               showOrgName:
 *                 type: boolean
 *                 description: Whether to display organization name
 *                 example: true
 *               primaryColor:
 *                 type: string
 *                 description: Primary brand color (hex)
 *                 example: "#2563eb"
 *               secondaryColor:
 *                 type: string
 *                 description: Secondary color (hex)
 *                 example: "#64748b"
 *               accentColor:
 *                 type: string
 *                 description: Accent color (hex)
 *                 example: "#3b82f6"
 *               backgroundColor:
 *                 type: string
 *                 description: Background color (hex)
 *                 example: "#ffffff"
 *               textColor:
 *                 type: string
 *                 description: Text color (hex)
 *                 example: "#1e293b"
 *               displaySettings:
 *                 type: object
 *                 description: Display format settings
 *                 properties:
 *                   dateFormat:
 *                     type: string
 *                     example: "YYYY-MM-DD"
 *                   currency:
 *                     type: string
 *                     example: "CAD"
 *                   layout:
 *                     type: string
 *                     example: "standard"
 *                   showItemCodes:
 *                     type: boolean
 *                     example: true
 *                   showDescription:
 *                     type: boolean
 *                     example: true
 *               customCss:
 *                 type: string
 *                 description: Custom CSS for additional styling
 *               taxesEnabled:
 *                 type: boolean
 *                 description: Enable/disable tax calculations organization-wide
 *                 example: true
 *               defaultTaxExempt:
 *                 type: boolean
 *                 description: Default tax exempt status for new invoices
 *                 example: false
 *               taxDisplaySettings:
 *                 type: object
 *                 description: Tax display configuration
 *                 properties:
 *                   showTaxBreakdown:
 *                     type: boolean
 *                     example: true
 *                   hideTaxColumn:
 *                     type: boolean
 *                     example: false
 *                   taxLabel:
 *                     type: string
 *                     example: "Tax"
 *               defaultTemplateId:
 *                 type: string
 *                 description: Default template ID for new invoices
 *               defaultStyleId:
 *                 type: string
 *                 description: Default style ID for new invoices
 *     responses:
 *       200:
 *         description: Settings updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     branding:
 *                       type: object
 *                       description: Updated branding settings
 *       400:
 *         description: Invalid settings data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       404:
 *         description: Organization not found
 *       500:
 *         description: Failed to update settings
 */
router.put(
  '/invoice',
  authorize(UserRole.ADMIN, UserRole.MANAGER),
  organizationSettingsController.updateInvoiceSettings.bind(organizationSettingsController)
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/assets/logo:
 *   post:
 *     tags: [Organization Assets]
 *     summary: Upload organization logo
 *     description: Uploads a logo file for the organization. Supports PNG and JPEG formats up to 5MB. Requires Admin or Manager role.
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
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - logo
 *             properties:
 *               logo:
 *                 type: string
 *                 format: binary
 *                 description: Logo image file (PNG or JPEG, max 5MB)
 *               logoWidth:
 *                 type: integer
 *                 description: Desired display width in pixels
 *                 example: 200
 *               logoHeight:
 *                 type: integer
 *                 description: Desired display height in pixels
 *                 example: 80
 *     responses:
 *       201:
 *         description: Logo uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                   example: "Logo uploaded successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     logoUrl:
 *                       type: string
 *                       example: "/storage/logos/org123/logo-1640995200000.png"
 *                     logoWidth:
 *                       type: integer
 *                       example: 200
 *                     logoHeight:
 *                       type: integer
 *                       example: 80
 *                     showLogo:
 *                       type: boolean
 *                       example: true
 *       400:
 *         description: Invalid file or file too large
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Failed to upload logo
 */
router.post(
  '/assets/logo',
  authorize(UserRole.ADMIN, UserRole.MANAGER),
  uploadSingle('logo'),
  organizationSettingsController.uploadLogo.bind(organizationSettingsController)
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/assets/logo:
 *   delete:
 *     tags: [Organization Assets]
 *     summary: Remove organization logo
 *     description: Removes the current logo from the organization and disables logo display. Requires Admin or Manager role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         description: Organization ID
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Logo removed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                   example: "Logo removed successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     logoUrl:
 *                       type: string
 *                       nullable: true
 *                       example: null
 *                     showLogo:
 *                       type: boolean
 *                       example: false
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Logo not found or organization not found
 *       500:
 *         description: Failed to remove logo
 */
router.delete(
  '/assets/logo',
  authorize(UserRole.ADMIN, UserRole.MANAGER),
  organizationSettingsController.removeLogo.bind(organizationSettingsController)
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/settings/tax:
 *   get:
 *     tags: [Organization Settings]
 *     summary: Get tax settings
 *     description: Retrieves tax calculation settings for the organization.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         description: Organization ID
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Tax settings retrieved successfully
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
 *                     taxesEnabled:
 *                       type: boolean
 *                       description: Whether tax calculations are enabled
 *                       example: true
 *                     defaultTaxExempt:
 *                       type: boolean
 *                       description: Default tax exempt status
 *                       example: false
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Failed to retrieve tax settings
 */
router.get(
  '/tax',
  organizationSettingsController.getTaxSettings.bind(organizationSettingsController)
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/settings/tax:
 *   put:
 *     tags: [Organization Settings]
 *     summary: Update tax settings
 *     description: Updates tax calculation settings for the organization. When disabled, all invoices will skip tax calculations and hide tax fields. Requires Admin or Manager role.
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
 *               - taxesEnabled
 *             properties:
 *               taxesEnabled:
 *                 type: boolean
 *                 description: Enable or disable tax calculations organization-wide
 *                 example: false
 *               defaultTaxExempt:
 *                 type: boolean
 *                 description: Default tax exempt status for new invoices
 *                 example: false
 *     responses:
 *       200:
 *         description: Tax settings updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                   example: "Tax settings updated successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     taxesEnabled:
 *                       type: boolean
 *                     defaultTaxExempt:
 *                       type: boolean
 *       400:
 *         description: Invalid tax settings data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Failed to update tax settings
 */
router.put(
  '/tax',
  authorize(UserRole.ADMIN, UserRole.MANAGER),
  organizationSettingsController.updateTaxSettings.bind(organizationSettingsController)
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/settings/defaults:
 *   put:
 *     tags: [Organization Settings]
 *     summary: Set default template and style
 *     description: Sets the default invoice template and style for the organization. These will be used when generating PDFs without specific template/style parameters.
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
 *             properties:
 *               defaultTemplateId:
 *                 type: string
 *                 description: Template ID to set as default
 *                 example: "tpl_1234567890"
 *               defaultStyleId:
 *                 type: string
 *                 description: Style ID to set as default
 *                 example: "sty_1234567890"
 *     responses:
 *       200:
 *         description: Defaults updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     defaultTemplateId:
 *                       type: string
 *                     defaultStyleId:
 *                       type: string
 *       400:
 *         description: Invalid template or style ID
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Template or style not found
 *       500:
 *         description: Failed to update defaults
 */
router.put(
  '/defaults',
  authorize(UserRole.ADMIN, UserRole.MANAGER),
  organizationSettingsController.setDefaults.bind(organizationSettingsController)
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/settings/initialize:
 *   post:
 *     tags: [Organization Settings]
 *     summary: Initialize invoice settings
 *     description: Initializes complete invoice settings for a new organization, including system templates, styles, and default branding. Requires Admin role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         description: Organization ID
 *         schema:
 *           type: string
 *     responses:
 *       201:
 *         description: Settings initialized successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                   example: "Invoice settings initialized successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                       example: "System templates, styles, and default branding created"
 *                     templatesCount:
 *                       type: integer
 *                       example: 3
 *                     stylesCount:
 *                       type: integer
 *                       example: 3
 *                     branding:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         taxesEnabled:
 *                           type: boolean
 *                         showLogo:
 *                           type: boolean
 *                         showOrgName:
 *                           type: boolean
 *       400:
 *         description: Settings already initialized
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin role required
 *       500:
 *         description: Failed to initialize settings
 */
router.post(
  '/initialize',
  authorize(UserRole.ADMIN),
  organizationSettingsController.initializeSettings.bind(organizationSettingsController)
);

export default router;