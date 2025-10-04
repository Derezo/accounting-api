import { Router } from 'express';
import systemUsersController from '../controllers/system-users.controller';

const router = Router();

/**
 * System Users Routes (SUPER_ADMIN only, master org required)
 * Base path: /api/v1/admin/users
 *
 * All routes require:
 * - Authentication (authenticate middleware)
 * - SUPER_ADMIN role
 * - Master organization context (requireMasterOrgSuperAdmin middleware)
 */

/**
 * GET /api/v1/admin/users
 * List all users across organizations with filtering
 */
router.get('/', systemUsersController.getAllUsers.bind(systemUsersController));

/**
 * GET /api/v1/admin/users/:id
 * Get user by ID with organization details
 */
router.get('/:id', systemUsersController.getUserById.bind(systemUsersController));

/**
 * POST /api/v1/admin/users/:id/impersonate
 * Create impersonation session token
 */
router.post(
  '/:id/impersonate',
  systemUsersController.impersonateUser.bind(systemUsersController)
);

/**
 * POST /api/v1/admin/users/:id/deactivate
 * Deactivate user account
 */
router.post(
  '/:id/deactivate',
  systemUsersController.deactivateUser.bind(systemUsersController)
);

export default router;
