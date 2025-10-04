import { Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { systemIntegrationsService } from '../services/system-integrations.service';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { IntegrationType, IntegrationStatus, SyncFrequency, UserRole } from '../types/enums';

/**
 * Validation rules for creating an integration
 */
export const validateCreateIntegration = [
  body('name').notEmpty().trim().withMessage('Integration name is required'),
  body('type').isIn(Object.values(IntegrationType)).withMessage('Invalid integration type'),
  body('enabled').isBoolean().withMessage('Enabled must be a boolean'),
  body('config').isObject().withMessage('Config must be an object'),
  body('config.apiKey').optional().isString(),
  body('config.apiSecret').optional().isString(),
  body('config.webhookUrl').optional().isURL(),
  body('config.callbackUrl').optional().isURL(),
  body('config.scope').optional().isArray(),
  body('config.customFields').optional().isObject(),
  body('organizationId').optional().isString(),
  body('syncFrequency').optional().isIn(Object.values(SyncFrequency))
];

/**
 * Validation rules for updating an integration
 */
export const validateUpdateIntegration = [
  param('id').isString().withMessage('Integration ID is required'),
  body('name').optional().notEmpty().trim(),
  body('enabled').optional().isBoolean(),
  body('status').optional().isIn(Object.values(IntegrationStatus)),
  body('config').optional().isObject(),
  body('config.apiKey').optional().isString(),
  body('config.apiSecret').optional().isString(),
  body('config.webhookUrl').optional().isURL(),
  body('config.callbackUrl').optional().isURL(),
  body('config.scope').optional().isArray(),
  body('config.customFields').optional().isObject(),
  body('syncFrequency').optional().isIn(Object.values(SyncFrequency))
];

/**
 * Validation rules for listing integrations
 */
export const validateListIntegrations = [
  query('type').optional().isIn(Object.values(IntegrationType)),
  query('status').optional().isIn(Object.values(IntegrationStatus)),
  query('enabled').optional().isBoolean(),
  query('organizationId').optional().isString()
];

/**
 * System Integrations Controller
 *
 * Handles HTTP requests for system integrations management.
 * All endpoints require authentication and appropriate permissions.
 *
 * @openapi
 * tags:
 *   - name: System Integrations
 *     description: Manage third-party integrations (SUPER_ADMIN or ADMIN)
 */
export class SystemIntegrationsController {
  /**
   * @openapi
   * /admin/integrations:
   *   get:
   *     summary: List all system integrations
   *     description: Retrieve all system integrations with optional filtering. System-wide integrations require SUPER_ADMIN role.
   *     tags: [System Integrations]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: type
   *         schema:
   *           type: string
   *           enum: [STRIPE, QUICKBOOKS, SENDGRID, TWILIO, SLACK, CUSTOM]
   *         description: Filter by integration type
   *       - in: query
   *         name: status
   *         schema:
   *           type: string
   *           enum: [ACTIVE, INACTIVE, ERROR, TESTING]
   *         description: Filter by integration status
   *       - in: query
   *         name: enabled
   *         schema:
   *           type: boolean
   *         description: Filter by enabled status
   *       - in: query
   *         name: organizationId
   *         schema:
   *           type: string
   *         description: Filter by organization (null for system-wide)
   *     responses:
   *       200:
   *         description: List of integrations
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 integrations:
   *                   type: array
   *                   items:
   *                     $ref: '#/components/schemas/SystemIntegration'
   *       403:
   *         description: Insufficient permissions
   *       500:
   *         description: Internal server error
   */
  async listIntegrations(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      // Permission check: SUPER_ADMIN can see all, ADMIN can only see org-specific
      const filters: any = {};

      if (req.query.type) {
        filters.type = req.query.type as IntegrationType;
      }
      if (req.query.status) {
        filters.status = req.query.status as IntegrationStatus;
      }
      if (req.query.enabled !== undefined) {
        filters.enabled = req.query.enabled === 'true';
      }

      // If not SUPER_ADMIN, restrict to user's organization
      if (req.user?.role !== UserRole.SUPER_ADMIN) {
        filters.organizationId = req.user?.organizationId;
      } else if (req.query.organizationId) {
        // SUPER_ADMIN can filter by specific organization
        filters.organizationId = req.query.organizationId === 'null' ? null : req.query.organizationId;
      }

      const integrations = await systemIntegrationsService.getAll(filters);

      res.json({ integrations });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * @openapi
   * /admin/integrations/{id}:
   *   get:
   *     summary: Get integration details
   *     description: Retrieve detailed information about a specific integration including full configuration
   *     tags: [System Integrations]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Integration ID
   *     responses:
   *       200:
   *         description: Integration details
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/SystemIntegration'
   *       403:
   *         description: Insufficient permissions
   *       404:
   *         description: Integration not found
   *       500:
   *         description: Internal server error
   */
  async getIntegration(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const integration = await systemIntegrationsService.getById(id);

      // Permission check: SUPER_ADMIN can access all, ADMIN only their org
      if (
        req.user?.role !== UserRole.SUPER_ADMIN &&
        integration.organizationId !== req.user?.organizationId
      ) {
        res.status(403).json({ error: 'Insufficient permissions to access this integration' });
        return;
      }

      res.json(integration);
    } catch (error: any) {
      if (error.message === 'Integration not found') {
        res.status(404).json({ error: error.message });
      } else {
        res.status(500).json({ error: error.message });
      }
    }
  }

  /**
   * @openapi
   * /admin/integrations:
   *   post:
   *     summary: Create a new integration
   *     description: Create a new third-party integration. System-wide integrations (no organizationId) require SUPER_ADMIN role.
   *     tags: [System Integrations]
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
   *               - type
   *               - enabled
   *               - config
   *             properties:
   *               name:
   *                 type: string
   *                 example: "Production Stripe Account"
   *               type:
   *                 type: string
   *                 enum: [STRIPE, QUICKBOOKS, SENDGRID, TWILIO, SLACK, CUSTOM]
   *                 example: "STRIPE"
   *               enabled:
   *                 type: boolean
   *                 example: true
   *               config:
   *                 type: object
   *                 properties:
   *                   apiKey:
   *                     type: string
   *                     description: API key or access token
   *                   apiSecret:
   *                     type: string
   *                     description: API secret or token secret
   *                   webhookUrl:
   *                     type: string
   *                     format: uri
   *                   callbackUrl:
   *                     type: string
   *                     format: uri
   *                   scope:
   *                     type: array
   *                     items:
   *                       type: string
   *                   customFields:
   *                     type: object
   *               organizationId:
   *                 type: string
   *                 nullable: true
   *                 description: Organization ID (null for system-wide integration)
   *               syncFrequency:
   *                 type: string
   *                 enum: [HOURLY, DAILY, WEEKLY, MANUAL]
   *     responses:
   *       201:
   *         description: Integration created successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 message:
   *                   type: string
   *                 integration:
   *                   $ref: '#/components/schemas/SystemIntegration'
   *       400:
   *         description: Invalid input
   *       403:
   *         description: Insufficient permissions
   *       500:
   *         description: Internal server error
   */
  async createIntegration(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      // Permission check: System-wide requires SUPER_ADMIN, org-specific requires ADMIN
      if (!req.body.organizationId && req.user?.role !== UserRole.SUPER_ADMIN) {
        res.status(403).json({ error: 'Only SUPER_ADMIN can create system-wide integrations' });
        return;
      }

      // If ADMIN, enforce their organization
      if (req.user?.role === UserRole.ADMIN && req.body.organizationId !== req.user?.organizationId) {
        res.status(403).json({ error: 'ADMIN users can only create integrations for their own organization' });
        return;
      }

      const integration = await systemIntegrationsService.create(
        {
          name: req.body.name,
          type: req.body.type,
          enabled: req.body.enabled,
          config: req.body.config,
          organizationId: req.body.organizationId,
          syncFrequency: req.body.syncFrequency
        },
        {
          userId: req.user!.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      );

      res.status(201).json({
        message: 'Integration created successfully',
        integration
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * @openapi
   * /admin/integrations/{id}:
   *   put:
   *     summary: Update an integration
   *     description: Update integration settings and configuration
   *     tags: [System Integrations]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Integration ID
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               name:
   *                 type: string
   *               enabled:
   *                 type: boolean
   *               status:
   *                 type: string
   *                 enum: [ACTIVE, INACTIVE, ERROR, TESTING]
   *               config:
   *                 type: object
   *               syncFrequency:
   *                 type: string
   *                 enum: [HOURLY, DAILY, WEEKLY, MANUAL]
   *     responses:
   *       200:
   *         description: Integration updated successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 message:
   *                   type: string
   *                 integration:
   *                   $ref: '#/components/schemas/SystemIntegration'
   *       400:
   *         description: Invalid input
   *       403:
   *         description: Insufficient permissions
   *       404:
   *         description: Integration not found
   *       500:
   *         description: Internal server error
   */
  async updateIntegration(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      const { id } = req.params;

      // Get existing integration to check permissions
      const existing = await systemIntegrationsService.getById(id);

      // Permission check
      if (
        req.user?.role !== UserRole.SUPER_ADMIN &&
        existing.organizationId !== req.user?.organizationId
      ) {
        res.status(403).json({ error: 'Insufficient permissions to update this integration' });
        return;
      }

      const integration = await systemIntegrationsService.update(
        id,
        {
          name: req.body.name,
          enabled: req.body.enabled,
          status: req.body.status,
          config: req.body.config,
          syncFrequency: req.body.syncFrequency
        },
        {
          userId: req.user!.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      );

      res.json({
        message: 'Integration updated successfully',
        integration
      });
    } catch (error: any) {
      if (error.message === 'Integration not found') {
        res.status(404).json({ error: error.message });
      } else {
        res.status(500).json({ error: error.message });
      }
    }
  }

  /**
   * @openapi
   * /admin/integrations/{id}:
   *   delete:
   *     summary: Delete an integration
   *     description: Soft delete an integration (sets deletedAt timestamp)
   *     tags: [System Integrations]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Integration ID
   *     responses:
   *       200:
   *         description: Integration deleted successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 message:
   *                   type: string
   *       403:
   *         description: Insufficient permissions
   *       404:
   *         description: Integration not found
   *       500:
   *         description: Internal server error
   */
  async deleteIntegration(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      // Get existing integration to check permissions
      const existing = await systemIntegrationsService.getById(id);

      // Permission check
      if (
        req.user?.role !== UserRole.SUPER_ADMIN &&
        existing.organizationId !== req.user?.organizationId
      ) {
        res.status(403).json({ error: 'Insufficient permissions to delete this integration' });
        return;
      }

      await systemIntegrationsService.delete(id, {
        userId: req.user!.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      res.json({ message: 'Integration deleted successfully' });
    } catch (error: any) {
      if (error.message === 'Integration not found') {
        res.status(404).json({ error: error.message });
      } else {
        res.status(500).json({ error: error.message });
      }
    }
  }

  /**
   * @openapi
   * /admin/integrations/{id}/test:
   *   post:
   *     summary: Test integration connection
   *     description: Test the connection to the third-party service using stored credentials
   *     tags: [System Integrations]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Integration ID
   *     responses:
   *       200:
   *         description: Test result
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                 message:
   *                   type: string
   *                 responseTime:
   *                   type: number
   *                   description: Response time in milliseconds
   *                 details:
   *                   type: object
   *       403:
   *         description: Insufficient permissions
   *       404:
   *         description: Integration not found
   *       500:
   *         description: Internal server error
   */
  async testConnection(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      // Get existing integration to check permissions
      const existing = await systemIntegrationsService.getById(id);

      // Permission check
      if (
        req.user?.role !== UserRole.SUPER_ADMIN &&
        existing.organizationId !== req.user?.organizationId
      ) {
        res.status(403).json({ error: 'Insufficient permissions to test this integration' });
        return;
      }

      const result = await systemIntegrationsService.testConnection(id);

      res.json(result);
    } catch (error: any) {
      if (error.message === 'Integration not found') {
        res.status(404).json({ error: error.message });
      } else {
        res.status(500).json({ error: error.message });
      }
    }
  }
}

export const systemIntegrationsController = new SystemIntegrationsController();

/**
 * @openapi
 * components:
 *   schemas:
 *     SystemIntegration:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         name:
 *           type: string
 *         type:
 *           type: string
 *           enum: [STRIPE, QUICKBOOKS, SENDGRID, TWILIO, SLACK, CUSTOM]
 *         status:
 *           type: string
 *           enum: [ACTIVE, INACTIVE, ERROR, TESTING]
 *         enabled:
 *           type: boolean
 *         config:
 *           type: object
 *           description: Integration configuration (sensitive fields excluded in list view)
 *         lastSync:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         lastError:
 *           type: string
 *           nullable: true
 *         syncFrequency:
 *           type: string
 *           enum: [HOURLY, DAILY, WEEKLY, MANUAL]
 *           nullable: true
 *         organizationId:
 *           type: string
 *           nullable: true
 *           description: Organization ID (null for system-wide)
 *         organization:
 *           type: object
 *           nullable: true
 *           properties:
 *             id:
 *               type: string
 *             name:
 *               type: string
 *             domain:
 *               type: string
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *         createdBy:
 *           type: string
 *         creator:
 *           type: object
 *           properties:
 *             id:
 *               type: string
 *             firstName:
 *               type: string
 *             lastName:
 *               type: string
 *             email:
 *               type: string
 */
