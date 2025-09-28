import { Router, Request, Response } from 'express';
import {
  organizationController,
  validateCreateOrganization,
  validateUpdateOrganization,
  validateListOrganizations,
  validateSettings
} from '../controllers/organization.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { auditMiddleware } from '../middleware/audit.middleware';
import { UserRole } from '../types/enums';

const router = Router();

// All routes require authentication
router.use(authenticate);

const audit = auditMiddleware('Organization');

/**
 * @swagger
 * /organizations:
 *   get:
 *     tags: [Organizations]
 *     summary: List all organizations
 *     description: Retrieves a paginated list of all organizations in the system. Only accessible to Super Administrators for system-wide oversight.
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
 *         description: Number of organizations per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search term for organization name or domain
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [ACTIVE, INACTIVE, SUSPENDED]
 *         description: Filter by organization status
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [name, createdAt, updatedAt, status]
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
 *         description: Organizations retrieved successfully
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
 *                         description: Organization ID
 *                       name:
 *                         type: string
 *                         example: "Acme Corporation"
 *                       domain:
 *                         type: string
 *                         example: "acme.com"
 *                       status:
 *                         type: string
 *                         enum: [ACTIVE, INACTIVE, SUSPENDED]
 *                         example: "ACTIVE"
 *                       settings:
 *                         type: object
 *                         description: Organization configuration settings
 *                       userCount:
 *                         type: integer
 *                         description: Number of users in the organization
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       updatedAt:
 *                         type: string
 *                         format: date-time
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
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       403:
 *         description: Forbidden - Requires Super Admin role
 *       500:
 *         description: Internal server error
 */
router.get(
  '/',
  authorize(UserRole.SUPER_ADMIN),
  validateListOrganizations,
  audit.view,
  (req: Request, res: Response) => organizationController.listOrganizations(req as any, res)
);

/**
 * @swagger
 * /organizations:
 *   post:
 *     tags: [Organizations]
 *     summary: Create a new organization
 *     description: Creates a new organization with multi-tenant isolation. Only Super Administrators can create organizations to maintain system integrity and control tenant provisioning.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - domain
 *               - adminEmail
 *             properties:
 *               name:
 *                 type: string
 *                 description: Organization name
 *                 example: "Acme Corporation"
 *                 minLength: 2
 *                 maxLength: 100
 *               domain:
 *                 type: string
 *                 description: Organization domain (must be unique)
 *                 example: "acme.com"
 *                 pattern: "^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\\.[a-zA-Z]{2,}$"
 *               adminEmail:
 *                 type: string
 *                 format: email
 *                 description: Email address for the organization administrator
 *                 example: "admin@acme.com"
 *               description:
 *                 type: string
 *                 description: Optional organization description
 *                 example: "Leading provider of innovative solutions"
 *                 maxLength: 500
 *               address:
 *                 type: object
 *                 properties:
 *                   street:
 *                     type: string
 *                     example: "123 Business Ave"
 *                   city:
 *                     type: string
 *                     example: "New York"
 *                   state:
 *                     type: string
 *                     example: "NY"
 *                   zipCode:
 *                     type: string
 *                     example: "10001"
 *                   country:
 *                     type: string
 *                     example: "USA"
 *               settings:
 *                 type: object
 *                 description: Initial organization settings
 *                 properties:
 *                   timezone:
 *                     type: string
 *                     example: "America/New_York"
 *                   currency:
 *                     type: string
 *                     example: "USD"
 *                   dateFormat:
 *                     type: string
 *                     example: "MM/DD/YYYY"
 *     responses:
 *       201:
 *         description: Organization created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   description: Organization ID
 *                 name:
 *                   type: string
 *                 domain:
 *                   type: string
 *                 status:
 *                   type: string
 *                   enum: [ACTIVE, INACTIVE, SUSPENDED]
 *                 adminUser:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     email:
 *                       type: string
 *                     role:
 *                       type: string
 *                       example: "ADMIN"
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                 updatedAt:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Invalid input data or domain already exists
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       403:
 *         description: Forbidden - Requires Super Admin role
 *       409:
 *         description: Conflict - Organization domain already exists
 *       500:
 *         description: Internal server error
 */
router.post(
  '/',
  authorize(UserRole.SUPER_ADMIN),
  validateCreateOrganization,
  audit.create,
  (req: Request, res: Response) => organizationController.createOrganization(req as any, res)
);

/**
 * @swagger
 * /organizations/{id}:
 *   get:
 *     tags: [Organizations]
 *     summary: Get organization details
 *     description: Retrieves detailed information about a specific organization. Users can only access their own organization's details unless they are Super Administrators.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Organization ID
 *         schema:
 *           type: string
 *           example: "clp1234567890"
 *     responses:
 *       200:
 *         description: Organization details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   description: Organization ID
 *                 name:
 *                   type: string
 *                   example: "Acme Corporation"
 *                 domain:
 *                   type: string
 *                   example: "acme.com"
 *                 description:
 *                   type: string
 *                   example: "Leading provider of innovative solutions"
 *                 status:
 *                   type: string
 *                   enum: [ACTIVE, INACTIVE, SUSPENDED]
 *                   example: "ACTIVE"
 *                 address:
 *                   type: object
 *                   properties:
 *                     street:
 *                       type: string
 *                     city:
 *                       type: string
 *                     state:
 *                       type: string
 *                     zipCode:
 *                       type: string
 *                     country:
 *                       type: string
 *                 settings:
 *                   type: object
 *                   description: Organization configuration settings
 *                   properties:
 *                     timezone:
 *                       type: string
 *                       example: "America/New_York"
 *                     currency:
 *                       type: string
 *                       example: "USD"
 *                     dateFormat:
 *                       type: string
 *                       example: "MM/DD/YYYY"
 *                     features:
 *                       type: object
 *                       description: Enabled features for the organization
 *                 subscription:
 *                   type: object
 *                   description: Subscription details
 *                   properties:
 *                     plan:
 *                       type: string
 *                       example: "PROFESSIONAL"
 *                     status:
 *                       type: string
 *                       example: "ACTIVE"
 *                     expiresAt:
 *                       type: string
 *                       format: date-time
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                 updatedAt:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       403:
 *         description: Forbidden - Cannot access organization outside your tenant
 *       404:
 *         description: Organization not found
 *       500:
 *         description: Internal server error
 */
router.get(
  '/:id',
  audit.view,
  (req: Request, res: Response) => organizationController.getOrganization(req as any, res)
);

/**
 * @swagger
 * /organizations/{id}:
 *   put:
 *     tags: [Organizations]
 *     summary: Update organization
 *     description: Updates organization information. Admins can update their own organization, while Super Admins can update any organization.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Organization ID
 *         schema:
 *           type: string
 *           example: "clp1234567890"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: Organization name
 *                 example: "Acme Corporation Updated"
 *                 minLength: 2
 *                 maxLength: 100
 *               description:
 *                 type: string
 *                 description: Organization description
 *                 example: "Updated description of our services"
 *                 maxLength: 500
 *               address:
 *                 type: object
 *                 properties:
 *                   street:
 *                     type: string
 *                     example: "456 Updated Business Ave"
 *                   city:
 *                     type: string
 *                     example: "New York"
 *                   state:
 *                     type: string
 *                     example: "NY"
 *                   zipCode:
 *                     type: string
 *                     example: "10002"
 *                   country:
 *                     type: string
 *                     example: "USA"
 *               status:
 *                 type: string
 *                 enum: [ACTIVE, INACTIVE, SUSPENDED]
 *                 description: Organization status (Super Admin only)
 *                 example: "ACTIVE"
 *     responses:
 *       200:
 *         description: Organization updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 name:
 *                   type: string
 *                 description:
 *                   type: string
 *                 status:
 *                   type: string
 *                   enum: [ACTIVE, INACTIVE, SUSPENDED]
 *                 address:
 *                   type: object
 *                 updatedAt:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Invalid input data
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       403:
 *         description: Forbidden - Insufficient permissions or cannot update organization outside your tenant
 *       404:
 *         description: Organization not found
 *       500:
 *         description: Internal server error
 */
router.put(
  '/:id',
  authorize(UserRole.ADMIN, UserRole.SUPER_ADMIN),
  validateUpdateOrganization,
  audit.update,
  (req: Request, res: Response) => organizationController.updateOrganization(req as any, res)
);

/**
 * @swagger
 * /organizations/{id}:
 *   delete:
 *     tags: [Organizations]
 *     summary: Deactivate organization
 *     description: Deactivates an organization and all associated users. This is a soft delete that preserves data for compliance. Only Super Administrators can perform this critical operation.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Organization ID
 *         schema:
 *           type: string
 *           example: "clp1234567890"
 *     responses:
 *       200:
 *         description: Organization deactivated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Organization deactivated successfully"
 *                 organizationId:
 *                   type: string
 *                   description: ID of the deactivated organization
 *                 deactivatedAt:
 *                   type: string
 *                   format: date-time
 *                   description: Timestamp when organization was deactivated
 *                 affectedUsers:
 *                   type: integer
 *                   description: Number of users that were deactivated
 *                 dataRetention:
 *                   type: object
 *                   properties:
 *                     retainUntil:
 *                       type: string
 *                       format: date-time
 *                       description: Date when data will be permanently deleted
 *                     backupLocation:
 *                       type: string
 *                       description: Location of data backup for compliance
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       403:
 *         description: Forbidden - Requires Super Admin role
 *       404:
 *         description: Organization not found
 *       409:
 *         description: Conflict - Organization already deactivated or has active dependencies
 *       500:
 *         description: Internal server error
 */
router.delete(
  '/:id',
  authorize(UserRole.SUPER_ADMIN),
  audit.delete,
  (req: Request, res: Response) => organizationController.deactivateOrganization(req as any, res)
);

/**
 * @swagger
 * /organizations/{id}/stats:
 *   get:
 *     tags: [Organizations]
 *     summary: Get organization statistics
 *     description: Retrieves comprehensive statistics and metrics for an organization including user counts, financial summaries, and activity metrics. Available to management roles for business intelligence.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Organization ID
 *         schema:
 *           type: string
 *           example: "clp1234567890"
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
 *     responses:
 *       200:
 *         description: Organization statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 organizationId:
 *                   type: string
 *                 period:
 *                   type: object
 *                   properties:
 *                     type:
 *                       type: string
 *                       example: "month"
 *                     startDate:
 *                       type: string
 *                       format: date
 *                     endDate:
 *                       type: string
 *                       format: date
 *                 users:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                       description: Total number of users
 *                     active:
 *                       type: integer
 *                       description: Active users in the period
 *                     byRole:
 *                       type: object
 *                       description: User count breakdown by role
 *                       properties:
 *                         ADMIN:
 *                           type: integer
 *                         MANAGER:
 *                           type: integer
 *                         ACCOUNTANT:
 *                           type: integer
 *                         EMPLOYEE:
 *                           type: integer
 *                         VIEWER:
 *                           type: integer
 *                 financial:
 *                   type: object
 *                   properties:
 *                     revenue:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: number
 *                           format: float
 *                         invoiced:
 *                           type: number
 *                           format: float
 *                         received:
 *                           type: number
 *                           format: float
 *                         outstanding:
 *                           type: number
 *                           format: float
 *                     customers:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                         new:
 *                           type: integer
 *                         active:
 *                           type: integer
 *                     transactions:
 *                       type: object
 *                       properties:
 *                         quotes:
 *                           type: integer
 *                         invoices:
 *                           type: integer
 *                         payments:
 *                           type: integer
 *                 activity:
 *                   type: object
 *                   properties:
 *                     loginCount:
 *                       type: integer
 *                     apiCalls:
 *                       type: integer
 *                     documentsCreated:
 *                       type: integer
 *                     lastActivity:
 *                       type: string
 *                       format: date-time
 *                 storage:
 *                   type: object
 *                   properties:
 *                     used:
 *                       type: number
 *                       description: Storage used in bytes
 *                     limit:
 *                       type: number
 *                       description: Storage limit in bytes
 *                     percentage:
 *                       type: number
 *                       description: Percentage of storage used
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       403:
 *         description: Forbidden - Insufficient permissions or cannot access organization outside your tenant
 *       404:
 *         description: Organization not found
 *       500:
 *         description: Internal server error
 */
router.get(
  '/:id/stats',
  authorize(UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN),
  (req: Request, res: Response) => organizationController.getOrganizationStats(req as any, res)
);

/**
 * @swagger
 * /organizations/{id}/settings:
 *   get:
 *     tags: [Organizations]
 *     summary: Get organization settings
 *     description: Retrieves organization configuration settings including preferences, integrations, and feature flags. Only accessible to Admins and Super Admins for configuration management.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Organization ID
 *         schema:
 *           type: string
 *           example: "clp1234567890"
 *     responses:
 *       200:
 *         description: Organization settings retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 organizationId:
 *                   type: string
 *                 general:
 *                   type: object
 *                   properties:
 *                     timezone:
 *                       type: string
 *                       example: "America/New_York"
 *                     currency:
 *                       type: string
 *                       example: "USD"
 *                     dateFormat:
 *                       type: string
 *                       example: "MM/DD/YYYY"
 *                     timeFormat:
 *                       type: string
 *                       example: "12h"
 *                     language:
 *                       type: string
 *                       example: "en"
 *                 financial:
 *                   type: object
 *                   properties:
 *                     defaultPaymentTerms:
 *                       type: string
 *                       enum: [NET_15, NET_30, NET_45, NET_60, DUE_ON_RECEIPT]
 *                       example: "NET_30"
 *                     taxRate:
 *                       type: number
 *                       format: float
 *                       example: 8.25
 *                     lateFeePercentage:
 *                       type: number
 *                       format: float
 *                       example: 1.5
 *                     autoReminders:
 *                       type: boolean
 *                       example: true
 *                 integrations:
 *                   type: object
 *                   properties:
 *                     stripe:
 *                       type: object
 *                       properties:
 *                         enabled:
 *                           type: boolean
 *                         webhookEndpoint:
 *                           type: string
 *                     email:
 *                       type: object
 *                       properties:
 *                         provider:
 *                           type: string
 *                           example: "sendgrid"
 *                         fromAddress:
 *                           type: string
 *                           example: "noreply@acme.com"
 *                 features:
 *                   type: object
 *                   properties:
 *                     advancedReporting:
 *                       type: boolean
 *                     customBranding:
 *                       type: boolean
 *                     apiAccess:
 *                       type: boolean
 *                     multiCurrency:
 *                       type: boolean
 *                 security:
 *                   type: object
 *                   properties:
 *                     enforceStrongPasswords:
 *                       type: boolean
 *                     sessionTimeout:
 *                       type: integer
 *                       description: Session timeout in minutes
 *                     ipWhitelist:
 *                       type: array
 *                       items:
 *                         type: string
 *                       description: Allowed IP addresses/ranges
 *                 notifications:
 *                   type: object
 *                   properties:
 *                     email:
 *                       type: boolean
 *                     sms:
 *                       type: boolean
 *                     inApp:
 *                       type: boolean
 *                 updatedAt:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       403:
 *         description: Forbidden - Requires Admin or Super Admin role
 *       404:
 *         description: Organization not found
 *       500:
 *         description: Internal server error
 */
router.get(
  '/:id/settings',
  authorize(UserRole.ADMIN, UserRole.SUPER_ADMIN),
  (req: Request, res: Response) => organizationController.getSettings(req as any, res)
);

/**
 * @swagger
 * /organizations/{id}/settings:
 *   put:
 *     tags: [Organizations]
 *     summary: Update organization settings
 *     description: Updates organization configuration settings. Changes to critical settings like security and integrations are audit logged for compliance tracking.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Organization ID
 *         schema:
 *           type: string
 *           example: "clp1234567890"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               general:
 *                 type: object
 *                 properties:
 *                   timezone:
 *                     type: string
 *                     example: "America/Los_Angeles"
 *                   currency:
 *                     type: string
 *                     example: "USD"
 *                   dateFormat:
 *                     type: string
 *                     enum: ["MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD"]
 *                     example: "MM/DD/YYYY"
 *                   timeFormat:
 *                     type: string
 *                     enum: ["12h", "24h"]
 *                     example: "12h"
 *                   language:
 *                     type: string
 *                     example: "en"
 *               financial:
 *                 type: object
 *                 properties:
 *                   defaultPaymentTerms:
 *                     type: string
 *                     enum: [NET_15, NET_30, NET_45, NET_60, DUE_ON_RECEIPT]
 *                     example: "NET_30"
 *                   taxRate:
 *                     type: number
 *                     format: float
 *                     minimum: 0
 *                     maximum: 100
 *                     example: 8.25
 *                   lateFeePercentage:
 *                     type: number
 *                     format: float
 *                     minimum: 0
 *                     maximum: 50
 *                     example: 1.5
 *                   autoReminders:
 *                     type: boolean
 *                     example: true
 *               integrations:
 *                 type: object
 *                 properties:
 *                   stripe:
 *                     type: object
 *                     properties:
 *                       enabled:
 *                         type: boolean
 *                       publicKey:
 *                         type: string
 *                         description: Stripe publishable key
 *                       webhookSecret:
 *                         type: string
 *                         description: Stripe webhook secret (encrypted)
 *                   email:
 *                     type: object
 *                     properties:
 *                       provider:
 *                         type: string
 *                         enum: ["sendgrid", "mailgun", "ses"]
 *                       fromAddress:
 *                         type: string
 *                         format: email
 *                       apiKey:
 *                         type: string
 *                         description: Email provider API key (encrypted)
 *               features:
 *                 type: object
 *                 properties:
 *                   advancedReporting:
 *                     type: boolean
 *                   customBranding:
 *                     type: boolean
 *                   apiAccess:
 *                     type: boolean
 *                   multiCurrency:
 *                     type: boolean
 *               security:
 *                 type: object
 *                 properties:
 *                   enforceStrongPasswords:
 *                     type: boolean
 *                   sessionTimeout:
 *                     type: integer
 *                     minimum: 15
 *                     maximum: 1440
 *                     description: Session timeout in minutes
 *                   ipWhitelist:
 *                     type: array
 *                     items:
 *                       type: string
 *                     description: Allowed IP addresses/ranges
 *               notifications:
 *                 type: object
 *                 properties:
 *                   email:
 *                     type: boolean
 *                   sms:
 *                     type: boolean
 *                   inApp:
 *                     type: boolean
 *     responses:
 *       200:
 *         description: Organization settings updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Organization settings updated successfully"
 *                 organizationId:
 *                   type: string
 *                 changes:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       setting:
 *                         type: string
 *                       previousValue:
 *                         type: string
 *                       newValue:
 *                         type: string
 *                 updatedAt:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Invalid input data or settings validation failed
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       403:
 *         description: Forbidden - Requires Admin or Super Admin role
 *       404:
 *         description: Organization not found
 *       500:
 *         description: Internal server error
 */
router.put(
  '/:id/settings',
  authorize(UserRole.ADMIN, UserRole.SUPER_ADMIN),
  validateSettings,
  auditMiddleware('OrganizationSettings').update,
  (req: Request, res: Response) => organizationController.updateSettings(req as any, res)
);

export default router;