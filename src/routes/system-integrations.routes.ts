import { Router } from 'express';
import {
  systemIntegrationsController,
  validateCreateIntegration,
  validateUpdateIntegration,
  validateListIntegrations
} from '../controllers/system-integrations.controller';

const router = Router();

/**
 * System Integrations Routes
 *
 * All routes are mounted under /api/v1/admin/integrations
 * Authentication and authorization are handled by middleware in app.ts
 *
 * Required permissions:
 * - SUPER_ADMIN: Full access to all integrations (system-wide and org-specific)
 * - ADMIN: Access to their organization's integrations only
 */

/**
 * GET /admin/integrations
 * List all system integrations with optional filtering
 */
router.get(
  '/',
  validateListIntegrations,
  systemIntegrationsController.listIntegrations.bind(systemIntegrationsController)
);

/**
 * GET /admin/integrations/:id
 * Get integration details by ID
 */
router.get(
  '/:id',
  systemIntegrationsController.getIntegration.bind(systemIntegrationsController)
);

/**
 * POST /admin/integrations
 * Create a new integration
 */
router.post(
  '/',
  validateCreateIntegration,
  systemIntegrationsController.createIntegration.bind(systemIntegrationsController)
);

/**
 * PUT /admin/integrations/:id
 * Update an integration
 */
router.put(
  '/:id',
  validateUpdateIntegration,
  systemIntegrationsController.updateIntegration.bind(systemIntegrationsController)
);

/**
 * DELETE /admin/integrations/:id
 * Delete an integration (soft delete)
 */
router.delete(
  '/:id',
  systemIntegrationsController.deleteIntegration.bind(systemIntegrationsController)
);

/**
 * POST /admin/integrations/:id/test
 * Test integration connection
 */
router.post(
  '/:id/test',
  systemIntegrationsController.testConnection.bind(systemIntegrationsController)
);

export default router;
