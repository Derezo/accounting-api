import { Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { featureToggleService, FeatureToggleScope } from '../services/feature-toggle.service';
import { AuthenticatedRequest } from '../middleware/auth.middleware';

/**
 * Validation rules for creating a feature toggle
 */
export const validateCreateFeatureToggle = [
  body('key')
    .notEmpty().trim()
    .matches(/^[a-z0-9_]+$/)
    .withMessage('Key must be lowercase alphanumeric with underscores only'),
  body('name').notEmpty().trim().withMessage('Toggle name is required'),
  body('description').notEmpty().trim().withMessage('Description is required'),
  body('enabled').isBoolean().withMessage('Enabled must be a boolean'),
  body('scope')
    .isIn(Object.values(FeatureToggleScope))
    .withMessage('Invalid scope. Must be GLOBAL, ORGANIZATION, or USER'),
  body('targetOrganizations').optional().isArray().withMessage('Target organizations must be an array'),
  body('targetUsers').optional().isArray().withMessage('Target users must be an array'),
  body('rolloutPercentage')
    .optional()
    .isInt({ min: 0, max: 100 })
    .withMessage('Rollout percentage must be between 0 and 100')
];

/**
 * Validation rules for updating a feature toggle
 */
export const validateUpdateFeatureToggle = [
  param('id').isString().withMessage('Feature toggle ID is required'),
  body('name').optional().notEmpty().trim(),
  body('description').optional().notEmpty().trim(),
  body('enabled').optional().isBoolean(),
  body('scope')
    .optional()
    .isIn(Object.values(FeatureToggleScope))
    .withMessage('Invalid scope. Must be GLOBAL, ORGANIZATION, or USER'),
  body('targetOrganizations').optional().isArray().withMessage('Target organizations must be an array'),
  body('targetUsers').optional().isArray().withMessage('Target users must be an array'),
  body('rolloutPercentage')
    .optional()
    .isInt({ min: 0, max: 100 })
    .withMessage('Rollout percentage must be between 0 and 100')
];

/**
 * Validation rules for listing feature toggles
 */
export const validateListFeatureToggles = [
  query('scope').optional().isIn(Object.values(FeatureToggleScope)),
  query('enabled').optional().isBoolean()
];

/**
 * Feature Toggle Controller
 *
 * Handles HTTP requests for feature toggle management.
 * All endpoints require SUPER_ADMIN permission.
 *
 * @openapi
 * tags:
 *   - name: Feature Toggles
 *     description: Manage feature flags for gradual rollout and A/B testing (SUPER_ADMIN only)
 */
export class FeatureToggleController {
  /**
   * @openapi
   * /admin/feature-toggles:
   *   get:
   *     summary: List all feature toggles
   *     description: Retrieve all feature toggles with optional filtering. Requires SUPER_ADMIN role.
   *     tags: [Feature Toggles]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: scope
   *         schema:
   *           type: string
   *           enum: [GLOBAL, ORGANIZATION, USER]
   *         description: Filter by toggle scope
   *       - in: query
   *         name: enabled
   *         schema:
   *           type: boolean
   *         description: Filter by enabled status
   *     responses:
   *       200:
   *         description: List of feature toggles retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 data:
   *                   type: array
   *                   items:
   *                     $ref: '#/components/schemas/FeatureToggle'
   *                 count:
   *                   type: integer
   *       401:
   *         description: Unauthorized - Missing or invalid authentication
   *       403:
   *         description: Forbidden - SUPER_ADMIN role required
   *       500:
   *         description: Internal server error
   */
  async getAll(req: AuthenticatedRequest, res: Response): Promise<Response> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const scope = req.query.scope as FeatureToggleScope | undefined;
      const enabled = req.query.enabled === 'true' ? true : req.query.enabled === 'false' ? false : undefined;

      const toggles = await featureToggleService.getAll({ scope, enabled });

      return res.status(200).json({
        success: true,
        data: toggles,
        count: toggles.length
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve feature toggles',
        error: error.message
      });
    }
  }

  /**
   * @openapi
   * /admin/feature-toggles/{id}:
   *   get:
   *     summary: Get feature toggle by ID
   *     description: Retrieve a specific feature toggle by ID. Requires SUPER_ADMIN role.
   *     tags: [Feature Toggles]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Feature toggle ID
   *     responses:
   *       200:
   *         description: Feature toggle retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 data:
   *                   $ref: '#/components/schemas/FeatureToggle'
   *       404:
   *         description: Feature toggle not found
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden - SUPER_ADMIN role required
   *       500:
   *         description: Internal server error
   */
  async getById(req: AuthenticatedRequest, res: Response): Promise<Response> {
    try {
      const { id } = req.params;

      const toggle = await featureToggleService.getById(id);

      if (!toggle) {
        return res.status(404).json({
          success: false,
          message: 'Feature toggle not found'
        });
      }

      return res.status(200).json({
        success: true,
        data: toggle
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve feature toggle',
        error: error.message
      });
    }
  }

  /**
   * @openapi
   * /admin/feature-toggles:
   *   post:
   *     summary: Create a new feature toggle
   *     description: Create a new feature toggle with specified configuration. Requires SUPER_ADMIN role.
   *     tags: [Feature Toggles]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - key
   *               - name
   *               - description
   *               - enabled
   *               - scope
   *             properties:
   *               key:
   *                 type: string
   *                 pattern: '^[a-z0-9_]+$'
   *                 example: 'beta_dashboard'
   *               name:
   *                 type: string
   *                 example: 'Beta Dashboard'
   *               description:
   *                 type: string
   *                 example: 'Enable the new dashboard UI for beta testing'
   *               enabled:
   *                 type: boolean
   *                 example: true
   *               scope:
   *                 type: string
   *                 enum: [GLOBAL, ORGANIZATION, USER]
   *                 example: 'GLOBAL'
   *               targetOrganizations:
   *                 type: array
   *                 items:
   *                   type: string
   *                 example: ['org_123', 'org_456']
   *               targetUsers:
   *                 type: array
   *                 items:
   *                   type: string
   *                 example: ['user_123', 'user_456']
   *               rolloutPercentage:
   *                 type: integer
   *                 minimum: 0
   *                 maximum: 100
   *                 example: 25
   *     responses:
   *       201:
   *         description: Feature toggle created successfully
   *       400:
   *         description: Validation error
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden - SUPER_ADMIN role required
   *       500:
   *         description: Internal server error
   */
  async create(req: AuthenticatedRequest, res: Response): Promise<Response> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const toggle = await featureToggleService.create(req.body, {
        userId: req.user.id,
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });

      return res.status(201).json({
        success: true,
        message: 'Feature toggle created successfully',
        data: toggle
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: 'Failed to create feature toggle',
        error: error.message
      });
    }
  }

  /**
   * @openapi
   * /admin/feature-toggles/{id}:
   *   put:
   *     summary: Update a feature toggle
   *     description: Update an existing feature toggle. Requires SUPER_ADMIN role.
   *     tags: [Feature Toggles]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Feature toggle ID
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               name:
   *                 type: string
   *               description:
   *                 type: string
   *               enabled:
   *                 type: boolean
   *               scope:
   *                 type: string
   *                 enum: [GLOBAL, ORGANIZATION, USER]
   *               targetOrganizations:
   *                 type: array
   *                 items:
   *                   type: string
   *               targetUsers:
   *                 type: array
   *                 items:
   *                   type: string
   *               rolloutPercentage:
   *                 type: integer
   *                 minimum: 0
   *                 maximum: 100
   *     responses:
   *       200:
   *         description: Feature toggle updated successfully
   *       400:
   *         description: Validation error
   *       404:
   *         description: Feature toggle not found
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden - SUPER_ADMIN role required
   *       500:
   *         description: Internal server error
   */
  async update(req: AuthenticatedRequest, res: Response): Promise<Response> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { id } = req.params;

      const toggle = await featureToggleService.update(id, req.body, {
        userId: req.user.id,
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });

      return res.status(200).json({
        success: true,
        message: 'Feature toggle updated successfully',
        data: toggle
      });
    } catch (error: any) {
      if (error.message === 'Feature toggle not found') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }

      return res.status(500).json({
        success: false,
        message: 'Failed to update feature toggle',
        error: error.message
      });
    }
  }

  /**
   * @openapi
   * /admin/feature-toggles/{id}:
   *   delete:
   *     summary: Delete a feature toggle
   *     description: Permanently delete a feature toggle. Requires SUPER_ADMIN role.
   *     tags: [Feature Toggles]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Feature toggle ID
   *     responses:
   *       200:
   *         description: Feature toggle deleted successfully
   *       404:
   *         description: Feature toggle not found
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden - SUPER_ADMIN role required
   *       500:
   *         description: Internal server error
   */
  async delete(req: AuthenticatedRequest, res: Response): Promise<Response> {
    try {
      const { id } = req.params;

      const toggle = await featureToggleService.delete(id, {
        userId: req.user.id,
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });

      return res.status(200).json({
        success: true,
        message: 'Feature toggle deleted successfully',
        data: toggle
      });
    } catch (error: any) {
      if (error.message === 'Feature toggle not found') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }

      return res.status(500).json({
        success: false,
        message: 'Failed to delete feature toggle',
        error: error.message
      });
    }
  }
}

export const featureToggleController = new FeatureToggleController();

/**
 * @openapi
 * components:
 *   schemas:
 *     FeatureToggle:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           example: 'cuid_123'
 *         key:
 *           type: string
 *           example: 'beta_dashboard'
 *         name:
 *           type: string
 *           example: 'Beta Dashboard'
 *         description:
 *           type: string
 *           example: 'Enable the new dashboard UI for beta testing'
 *         enabled:
 *           type: boolean
 *           example: true
 *         scope:
 *           type: string
 *           enum: [GLOBAL, ORGANIZATION, USER]
 *           example: 'GLOBAL'
 *         targetOrganizations:
 *           type: string
 *           nullable: true
 *           description: JSON array of organization IDs
 *         targetUsers:
 *           type: string
 *           nullable: true
 *           description: JSON array of user IDs
 *         rolloutPercentage:
 *           type: integer
 *           minimum: 0
 *           maximum: 100
 *           example: 25
 *         createdBy:
 *           type: string
 *         updatedBy:
 *           type: string
 *           nullable: true
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */
