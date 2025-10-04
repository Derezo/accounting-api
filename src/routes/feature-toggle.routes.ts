import { Router } from 'express';
import {
  featureToggleController,
  validateCreateFeatureToggle,
  validateUpdateFeatureToggle,
  validateListFeatureToggles
} from '../controllers/feature-toggle.controller';

const router = Router();

/**
 * Feature Toggle Routes
 *
 * All routes are mounted under /api/v1/admin/feature-toggles
 * Authentication and authorization are handled by middleware in app.ts
 *
 * Required permissions:
 * - SUPER_ADMIN: Full access to all feature toggles
 */

/**
 * GET /admin/feature-toggles
 * List all feature toggles with optional filtering
 */
router.get(
  '/',
  validateListFeatureToggles,
  featureToggleController.getAll.bind(featureToggleController)
);

/**
 * GET /admin/feature-toggles/:id
 * Get feature toggle details by ID
 */
router.get(
  '/:id',
  featureToggleController.getById.bind(featureToggleController)
);

/**
 * POST /admin/feature-toggles
 * Create a new feature toggle
 */
router.post(
  '/',
  validateCreateFeatureToggle,
  featureToggleController.create.bind(featureToggleController)
);

/**
 * PUT /admin/feature-toggles/:id
 * Update a feature toggle
 */
router.put(
  '/:id',
  validateUpdateFeatureToggle,
  featureToggleController.update.bind(featureToggleController)
);

/**
 * DELETE /admin/feature-toggles/:id
 * Delete a feature toggle (permanent deletion)
 */
router.delete(
  '/:id',
  featureToggleController.delete.bind(featureToggleController)
);

export default router;
