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

// ==================== SYSTEM PREFERENCES ROUTES ====================

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/settings/system:
 *   get:
 *     tags: [System Preferences]
 *     summary: Get all system preferences
 *     description: Retrieves complete system preferences including general, regional, data management, performance, API, integrations, feature flags, and logging settings. Auto-creates defaults if not exist.
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
 *         description: System preferences retrieved successfully
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
 *                   example: "System preferences retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     organizationId:
 *                       type: string
 *                     general:
 *                       type: object
 *                       properties:
 *                         systemName:
 *                           type: string
 *                           example: "Acme Corporation"
 *                         systemVersion:
 *                           type: string
 *                           example: "1.0.0"
 *                         environment:
 *                           type: string
 *                           enum: [development, staging, production]
 *                           example: "production"
 *                         defaultUserRole:
 *                           type: string
 *                           example: "EMPLOYEE"
 *                         maintenanceMode:
 *                           type: boolean
 *                           example: false
 *                         maintenanceMessage:
 *                           type: string
 *                     regional:
 *                       type: object
 *                       properties:
 *                         timezone:
 *                           type: string
 *                           example: "America/Toronto"
 *                         language:
 *                           type: string
 *                           example: "en"
 *                         country:
 *                           type: string
 *                           example: "CA"
 *                         currency:
 *                           type: string
 *                           example: "CAD"
 *                         dateFormat:
 *                           type: string
 *                           example: "YYYY-MM-DD"
 *                         timeFormat:
 *                           type: string
 *                           example: "24h"
 *                         numberFormat:
 *                           type: string
 *                           example: "en-CA"
 *                         fiscalYearStart:
 *                           type: string
 *                           example: "01-01"
 *                     dataManagement:
 *                       type: object
 *                     performance:
 *                       type: object
 *                     apiSettings:
 *                       type: object
 *                     integrations:
 *                       type: object
 *                     featureFlags:
 *                       type: object
 *                     logging:
 *                       type: object
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Organization not found
 *       500:
 *         description: Failed to retrieve system preferences
 */
router.get(
  '/system',
  organizationSettingsController.getSystemPreferences.bind(organizationSettingsController)
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/settings/system/general:
 *   put:
 *     tags: [System Preferences]
 *     summary: Update general settings
 *     description: Updates system-wide general settings including system name, version, environment, and maintenance mode. Requires Admin role.
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
 *               systemName:
 *                 type: string
 *                 example: "Acme Corporation"
 *               systemVersion:
 *                 type: string
 *                 example: "1.0.0"
 *               environment:
 *                 type: string
 *                 enum: [development, staging, production]
 *                 example: "production"
 *               defaultUserRole:
 *                 type: string
 *                 example: "EMPLOYEE"
 *               maintenanceMode:
 *                 type: boolean
 *                 example: false
 *               maintenanceMessage:
 *                 type: string
 *                 example: "System maintenance in progress"
 *     responses:
 *       200:
 *         description: General settings updated successfully
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
 *                   description: Complete updated SystemPreferences object
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin role required
 *       500:
 *         description: Failed to update general settings
 */
router.put(
  '/system/general',
  authorize(UserRole.ADMIN),
  organizationSettingsController.updateGeneralSettings.bind(organizationSettingsController)
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/settings/system/regional:
 *   put:
 *     tags: [System Preferences]
 *     summary: Update regional settings
 *     description: Updates regional localization settings including timezone, language, currency, date/time formats, and fiscal year start. Requires Admin role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               timezone:
 *                 type: string
 *                 example: "America/Toronto"
 *               language:
 *                 type: string
 *                 example: "en"
 *               country:
 *                 type: string
 *                 example: "CA"
 *               currency:
 *                 type: string
 *                 example: "CAD"
 *               dateFormat:
 *                 type: string
 *                 example: "YYYY-MM-DD"
 *               timeFormat:
 *                 type: string
 *                 example: "24h"
 *               numberFormat:
 *                 type: string
 *                 example: "en-CA"
 *               fiscalYearStart:
 *                 type: string
 *                 description: MM-DD format
 *                 example: "04-01"
 *     responses:
 *       200:
 *         description: Regional settings updated successfully
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin role required
 *       500:
 *         description: Failed to update regional settings
 */
router.put(
  '/system/regional',
  authorize(UserRole.ADMIN),
  organizationSettingsController.updateRegionalSettings.bind(organizationSettingsController)
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/settings/system/data-management:
 *   put:
 *     tags: [System Preferences]
 *     summary: Update data management settings
 *     description: Updates backup, retention, and file upload settings. Requires Admin role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               backupEnabled:
 *                 type: boolean
 *                 example: true
 *               backupFrequency:
 *                 type: string
 *                 enum: [daily, weekly, monthly]
 *                 example: "daily"
 *               retentionDays:
 *                 type: integer
 *                 example: 90
 *               autoExportEnabled:
 *                 type: boolean
 *                 example: false
 *               maxFileUploadSize:
 *                 type: integer
 *                 description: Maximum file size in MB
 *                 example: 10
 *               allowedFileTypes:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["pdf", "jpg", "png", "xlsx"]
 *     responses:
 *       200:
 *         description: Data management settings updated successfully
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Failed to update data management settings
 */
router.put(
  '/system/data-management',
  authorize(UserRole.ADMIN),
  organizationSettingsController.updateDataManagementSettings.bind(organizationSettingsController)
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/settings/system/performance:
 *   put:
 *     tags: [System Preferences]
 *     summary: Update performance settings
 *     description: Updates caching, optimization, CDN, rate limiting, and concurrency settings. Requires Admin role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               cachingEnabled:
 *                 type: boolean
 *                 example: true
 *               cacheExpiryMinutes:
 *                 type: integer
 *                 example: 60
 *               optimizationsEnabled:
 *                 type: boolean
 *                 example: true
 *               cdnEnabled:
 *                 type: boolean
 *                 example: false
 *               maxConcurrentUsers:
 *                 type: integer
 *                 example: 100
 *               rateLimitEnabled:
 *                 type: boolean
 *                 example: true
 *               rateLimitPerMinute:
 *                 type: integer
 *                 example: 60
 *     responses:
 *       200:
 *         description: Performance settings updated successfully
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Failed to update performance settings
 */
router.put(
  '/system/performance',
  authorize(UserRole.ADMIN),
  organizationSettingsController.updatePerformanceSettings.bind(organizationSettingsController)
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/settings/system/api:
 *   put:
 *     tags: [System Preferences]
 *     summary: Update API settings
 *     description: Updates API keys, webhooks, and rate limiting settings. Requires Admin role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               apiKeysEnabled:
 *                 type: boolean
 *                 example: true
 *               webhooksEnabled:
 *                 type: boolean
 *                 example: true
 *               rateLimitPerMinute:
 *                 type: integer
 *                 example: 60
 *               maxWebhooksPerOrg:
 *                 type: integer
 *                 example: 10
 *               webhookRetryAttempts:
 *                 type: integer
 *                 example: 3
 *     responses:
 *       200:
 *         description: API settings updated successfully
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Failed to update API settings
 */
router.put(
  '/system/api',
  authorize(UserRole.ADMIN),
  organizationSettingsController.updateApiSettings.bind(organizationSettingsController)
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/settings/system/integrations:
 *   put:
 *     tags: [System Preferences]
 *     summary: Update integration settings
 *     description: Enables/disables third-party integrations (QuickBooks, Stripe, Twilio, SendGrid, Slack, OAuth providers). Requires Admin role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               quickbooksEnabled:
 *                 type: boolean
 *                 example: false
 *               stripeEnabled:
 *                 type: boolean
 *                 example: true
 *               twilioEnabled:
 *                 type: boolean
 *                 example: false
 *               sendgridEnabled:
 *                 type: boolean
 *                 example: true
 *               slackEnabled:
 *                 type: boolean
 *                 example: false
 *               oauthProvidersEnabled:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["google", "microsoft"]
 *     responses:
 *       200:
 *         description: Integration settings updated successfully
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Failed to update integration settings
 */
router.put(
  '/system/integrations',
  authorize(UserRole.ADMIN),
  organizationSettingsController.updateIntegrationSettings.bind(organizationSettingsController)
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/settings/system/feature-flags:
 *   put:
 *     tags: [System Preferences]
 *     summary: Update feature flags
 *     description: Enables/disables beta, experimental, and optional features. Requires Admin role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               betaFeaturesEnabled:
 *                 type: boolean
 *                 example: false
 *               experimentalFeaturesEnabled:
 *                 type: boolean
 *                 example: false
 *               newDashboardEnabled:
 *                 type: boolean
 *                 example: true
 *               advancedReportsEnabled:
 *                 type: boolean
 *                 example: true
 *               aiAssistantEnabled:
 *                 type: boolean
 *                 example: false
 *               mobileAppEnabled:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       200:
 *         description: Feature flags updated successfully
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Failed to update feature flags
 */
router.put(
  '/system/feature-flags',
  authorize(UserRole.ADMIN),
  organizationSettingsController.updateFeatureFlags.bind(organizationSettingsController)
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/settings/system/logging:
 *   put:
 *     tags: [System Preferences]
 *     summary: Update logging settings
 *     description: Updates log level, audit logging, error tracking, and log retention settings. Requires Admin role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               logLevel:
 *                 type: string
 *                 enum: [debug, info, warn, error]
 *                 example: "info"
 *               auditLoggingEnabled:
 *                 type: boolean
 *                 example: true
 *               errorTrackingEnabled:
 *                 type: boolean
 *                 example: true
 *               performanceMonitoringEnabled:
 *                 type: boolean
 *                 example: false
 *               logRetentionDays:
 *                 type: integer
 *                 example: 90
 *     responses:
 *       200:
 *         description: Logging settings updated successfully
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Failed to update logging settings
 */
router.put(
  '/system/logging',
  authorize(UserRole.ADMIN),
  organizationSettingsController.updateLoggingSettings.bind(organizationSettingsController)
);

// ==================== NOTIFICATION SETTINGS ROUTES ====================

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/settings/notifications:
 *   get:
 *     tags: [Notification Settings]
 *     summary: Get all notification settings
 *     description: Retrieves complete notification settings including email, SMS, push, in-app, webhooks, and preferences. Auto-creates defaults if not exist.
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
 *         description: Notification settings retrieved successfully
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
 *                   example: "Notification settings retrieved successfully"
 *                 data:
 *                   type: object
 *                   description: Complete NotificationSettings object
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Organization not found
 *       500:
 *         description: Failed to retrieve notification settings
 */
router.get(
  '/notifications',
  organizationSettingsController.getNotificationSettings.bind(organizationSettingsController)
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/settings/notifications/email:
 *   put:
 *     tags: [Notification Settings]
 *     summary: Update email notification settings
 *     description: Updates SMTP configuration, sender details, and email notification type toggles. Requires Admin or Manager role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               enabled:
 *                 type: boolean
 *                 example: true
 *               smtpHost:
 *                 type: string
 *                 example: "smtp.gmail.com"
 *               smtpPort:
 *                 type: integer
 *                 example: 587
 *               smtpUsername:
 *                 type: string
 *                 example: "notifications@example.com"
 *               smtpPassword:
 *                 type: string
 *                 description: SMTP password (should be encrypted in production)
 *                 example: "your-password"
 *               smtpSecure:
 *                 type: boolean
 *                 example: true
 *               senderEmail:
 *                 type: string
 *                 example: "noreply@example.com"
 *               senderName:
 *                 type: string
 *                 example: "Acme Corporation"
 *               replyToEmail:
 *                 type: string
 *                 example: "support@example.com"
 *               notificationTypes:
 *                 type: object
 *                 properties:
 *                   invoiceCreated:
 *                     type: boolean
 *                   invoicePaid:
 *                     type: boolean
 *                   invoiceOverdue:
 *                     type: boolean
 *                   paymentReceived:
 *                     type: boolean
 *                   quoteCreated:
 *                     type: boolean
 *                   quoteClosed:
 *                     type: boolean
 *                   appointmentScheduled:
 *                     type: boolean
 *                   appointmentReminder:
 *                     type: boolean
 *                   projectUpdated:
 *                     type: boolean
 *                   userInvitation:
 *                     type: boolean
 *                   passwordReset:
 *                     type: boolean
 *                   systemAlerts:
 *                     type: boolean
 *     responses:
 *       200:
 *         description: Email settings updated successfully
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin or Manager role required
 *       500:
 *         description: Failed to update email settings
 */
router.put(
  '/notifications/email',
  authorize(UserRole.ADMIN, UserRole.MANAGER),
  organizationSettingsController.updateEmailNotificationSettings.bind(organizationSettingsController)
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/settings/notifications/sms:
 *   put:
 *     tags: [Notification Settings]
 *     summary: Update SMS notification settings
 *     description: Updates SMS provider configuration, credentials, and SMS notification type toggles. Requires Admin or Manager role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               enabled:
 *                 type: boolean
 *                 example: true
 *               provider:
 *                 type: string
 *                 enum: [twilio, nexmo, aws-sns, null]
 *                 example: "twilio"
 *               accountSid:
 *                 type: string
 *                 description: Twilio Account SID or equivalent
 *                 example: "AC1234567890abcdef"
 *               authToken:
 *                 type: string
 *                 description: Provider auth token (should be encrypted)
 *                 example: "your-auth-token"
 *               fromPhoneNumber:
 *                 type: string
 *                 example: "+15551234567"
 *               monthlyCostLimit:
 *                 type: number
 *                 description: Monthly cost limit in USD
 *                 example: 100
 *               notificationTypes:
 *                 type: object
 *                 properties:
 *                   invoiceOverdue:
 *                     type: boolean
 *                   paymentReceived:
 *                     type: boolean
 *                   appointmentReminder:
 *                     type: boolean
 *                   criticalAlerts:
 *                     type: boolean
 *     responses:
 *       200:
 *         description: SMS settings updated successfully
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Failed to update SMS settings
 */
router.put(
  '/notifications/sms',
  authorize(UserRole.ADMIN, UserRole.MANAGER),
  organizationSettingsController.updateSmsNotificationSettings.bind(organizationSettingsController)
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/settings/notifications/push:
 *   put:
 *     tags: [Notification Settings]
 *     summary: Update push notification settings
 *     description: Updates web and mobile push notification configuration including VAPID keys and FCM settings. Requires Admin or Manager role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               enabled:
 *                 type: boolean
 *                 example: true
 *               webPushEnabled:
 *                 type: boolean
 *                 example: true
 *               mobilePushEnabled:
 *                 type: boolean
 *                 example: true
 *               vapidPublicKey:
 *                 type: string
 *                 description: VAPID public key for web push
 *               vapidPrivateKey:
 *                 type: string
 *                 description: VAPID private key (should be encrypted)
 *               fcmServerKey:
 *                 type: string
 *                 description: Firebase Cloud Messaging server key
 *               notificationTypes:
 *                 type: object
 *                 properties:
 *                   invoiceCreated:
 *                     type: boolean
 *                   paymentReceived:
 *                     type: boolean
 *                   appointmentReminder:
 *                     type: boolean
 *                   projectUpdated:
 *                     type: boolean
 *                   systemAlerts:
 *                     type: boolean
 *     responses:
 *       200:
 *         description: Push settings updated successfully
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Failed to update push settings
 */
router.put(
  '/notifications/push',
  authorize(UserRole.ADMIN, UserRole.MANAGER),
  organizationSettingsController.updatePushNotificationSettings.bind(organizationSettingsController)
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/settings/notifications/in-app:
 *   put:
 *     tags: [Notification Settings]
 *     summary: Update in-app notification settings
 *     description: Updates in-app notification preferences including badges, sounds, retention, and notification type toggles. Requires Admin or Manager role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               enabled:
 *                 type: boolean
 *                 example: true
 *               showBadges:
 *                 type: boolean
 *                 example: true
 *               soundEnabled:
 *                 type: boolean
 *                 example: false
 *               retentionDays:
 *                 type: integer
 *                 description: How many days to keep notifications
 *                 example: 30
 *               notificationTypes:
 *                 type: object
 *                 properties:
 *                   invoiceCreated:
 *                     type: boolean
 *                   invoicePaid:
 *                     type: boolean
 *                   paymentReceived:
 *                     type: boolean
 *                   quoteCreated:
 *                     type: boolean
 *                   appointmentScheduled:
 *                     type: boolean
 *                   projectUpdated:
 *                     type: boolean
 *                   userMentioned:
 *                     type: boolean
 *                   systemAlerts:
 *                     type: boolean
 *     responses:
 *       200:
 *         description: In-app settings updated successfully
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Failed to update in-app settings
 */
router.put(
  '/notifications/in-app',
  authorize(UserRole.ADMIN, UserRole.MANAGER),
  organizationSettingsController.updateInAppNotificationSettings.bind(organizationSettingsController)
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/settings/notifications/webhooks:
 *   put:
 *     tags: [Notification Settings]
 *     summary: Update webhook notification settings
 *     description: Updates webhook endpoints, retry configuration, and webhook settings. Requires Admin or Manager role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               enabled:
 *                 type: boolean
 *                 example: true
 *               endpoints:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     url:
 *                       type: string
 *                       example: "https://example.com/webhooks/invoices"
 *                     enabled:
 *                       type: boolean
 *                     secret:
 *                       type: string
 *                       description: HMAC signature secret
 *                     events:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["invoice.created", "payment.received"]
 *               retryAttempts:
 *                 type: integer
 *                 example: 3
 *               retryDelaySeconds:
 *                 type: integer
 *                 example: 60
 *               timeoutSeconds:
 *                 type: integer
 *                 example: 30
 *     responses:
 *       200:
 *         description: Webhook settings updated successfully
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Failed to update webhook settings
 */
router.put(
  '/notifications/webhooks',
  authorize(UserRole.ADMIN, UserRole.MANAGER),
  organizationSettingsController.updateWebhookNotificationSettings.bind(organizationSettingsController)
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/settings/notifications/preferences:
 *   put:
 *     tags: [Notification Settings]
 *     summary: Update notification preferences
 *     description: Updates global notification preferences including quiet hours, digest settings, and batching. Requires Admin or Manager role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               quietHoursEnabled:
 *                 type: boolean
 *                 example: true
 *               quietHoursStart:
 *                 type: string
 *                 description: HH:mm format (24-hour)
 *                 example: "22:00"
 *               quietHoursEnd:
 *                 type: string
 *                 description: HH:mm format (24-hour)
 *                 example: "08:00"
 *               digestEnabled:
 *                 type: boolean
 *                 example: true
 *               digestFrequency:
 *                 type: string
 *                 enum: [daily, weekly, never]
 *                 example: "daily"
 *               digestTime:
 *                 type: string
 *                 description: HH:mm format (24-hour)
 *                 example: "09:00"
 *               batchingEnabled:
 *                 type: boolean
 *                 example: false
 *               batchingWindowMinutes:
 *                 type: integer
 *                 example: 15
 *     responses:
 *       200:
 *         description: Notification preferences updated successfully
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Failed to update preferences
 */
router.put(
  '/notifications/preferences',
  authorize(UserRole.ADMIN, UserRole.MANAGER),
  organizationSettingsController.updateNotificationPreferences.bind(organizationSettingsController)
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/settings/notifications/test:
 *   post:
 *     tags: [Notification Settings]
 *     summary: Test notification configuration
 *     description: Tests notification configuration by validating settings and simulating a test notification. Requires Admin or Manager role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - type
 *               - recipientAddress
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [email, sms, push]
 *                 example: "email"
 *               recipientAddress:
 *                 type: string
 *                 description: Email address, phone number, or device token
 *                 example: "test@example.com"
 *     responses:
 *       200:
 *         description: Test completed successfully
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
 *                     success:
 *                       type: boolean
 *                     message:
 *                       type: string
 *       400:
 *         description: Invalid request data or configuration incomplete
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Failed to test notification
 */
router.post(
  '/notifications/test',
  authorize(UserRole.ADMIN, UserRole.MANAGER),
  organizationSettingsController.testNotificationConfiguration.bind(organizationSettingsController)
);

export default router;