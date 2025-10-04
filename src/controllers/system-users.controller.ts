import { Request, Response } from 'express';
import systemUsersService from '../services/system-users.service';
import { AuthRequest } from '@/middleware/auth.middleware';

/**
 * Controller for system-wide user management (SUPER_ADMIN operations)
 */
export class SystemUsersController {
  /**
   * @openapi
   * /api/v1/admin/users:
   *   get:
   *     summary: Get all users across organizations
   *     description: List all users in the system with filtering options (SUPER_ADMIN only)
   *     tags: [Admin - Users]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: organizationId
   *         schema:
   *           type: string
   *         description: Filter by organization ID
   *       - in: query
   *         name: role
   *         schema:
   *           type: string
   *           enum: [SUPER_ADMIN, ADMIN, MANAGER, ACCOUNTANT, EMPLOYEE, VIEWER, CLIENT]
   *         description: Filter by user role
   *       - in: query
   *         name: isActive
   *         schema:
   *           type: boolean
   *         description: Filter by active status
   *       - in: query
   *         name: search
   *         schema:
   *           type: string
   *         description: Search by name or email
   *       - in: query
   *         name: page
   *         schema:
   *           type: integer
   *           default: 1
   *         description: Page number
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 50
   *         description: Results per page
   *     responses:
   *       200:
   *         description: Users retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 users:
   *                   type: array
   *                   items:
   *                     type: object
   *                 total:
   *                   type: integer
   *                 page:
   *                   type: integer
   *                 pages:
   *                   type: integer
   *       403:
   *         description: Forbidden - requires SUPER_ADMIN role
   *       500:
   *         description: Internal server error
   */
  async getAllUsers(req: Request, res: Response): Promise<void> {
    try {
      const filters = {
        organizationId: req.query.organizationId as string | undefined,
        role: req.query.role as string | undefined,
        isActive: req.query.isActive
          ? req.query.isActive === 'true'
          : undefined,
        search: req.query.search as string | undefined,
        page: req.query.page ? parseInt(req.query.page as string) : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      };

      const result = await systemUsersService.getAllUsers(filters);

      res.status(200).json(result);
    } catch (error: any) {
      res.status(500).json({
        error: 'INTERNAL_SERVER_ERROR',
        message: error.message,
      });
    }
  }

  /**
   * @openapi
   * /api/v1/admin/users/{id}:
   *   get:
   *     summary: Get user by ID
   *     description: Get detailed information about a specific user (SUPER_ADMIN only)
   *     tags: [Admin - Users]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: User ID
   *     responses:
   *       200:
   *         description: User retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 id:
   *                   type: string
   *                 email:
   *                   type: string
   *                 firstName:
   *                   type: string
   *                 lastName:
   *                   type: string
   *                 role:
   *                   type: string
   *                 isActive:
   *                   type: boolean
   *                 organization:
   *                   type: object
   *                   properties:
   *                     id:
   *                       type: string
   *                     name:
   *                       type: string
   *                     domain:
   *                       type: string
   *                     isActive:
   *                       type: boolean
   *       404:
   *         description: User not found
   *       403:
   *         description: Forbidden - requires SUPER_ADMIN role
   *       500:
   *         description: Internal server error
   */
  async getUserById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const user = await systemUsersService.getUserById(id);

      if (!user) {
        res.status(404).json({
          error: 'USER_NOT_FOUND',
          message: 'User not found',
        });
        return;
      }

      res.status(200).json(user);
    } catch (error: any) {
      res.status(500).json({
        error: 'INTERNAL_SERVER_ERROR',
        message: error.message,
      });
    }
  }

  /**
   * @openapi
   * /api/v1/admin/users/{id}/impersonate:
   *   post:
   *     summary: Create impersonation session
   *     description: Create a session token to impersonate a user (SUPER_ADMIN only, full audit trail)
   *     tags: [Admin - Users]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: User ID to impersonate
   *     responses:
   *       200:
   *         description: Impersonation session created
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 token:
   *                   type: string
   *                   description: Impersonation session token
   *                 userId:
   *                   type: string
   *                   description: User being impersonated
   *                 adminId:
   *                   type: string
   *                   description: Admin performing impersonation
   *                 expiresAt:
   *                   type: string
   *                   format: date-time
   *                   description: Token expiration time
   *       403:
   *         description: Forbidden - cannot impersonate SUPER_ADMIN users
   *       404:
   *         description: User not found
   *       500:
   *         description: Internal server error
   */
  async impersonateUser(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const adminId = req.user?.userId;
      const organizationId = req.user?.organizationId;

      if (!adminId || !organizationId) {
        res.status(401).json({
          error: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
        return;
      }

      const session = await systemUsersService.impersonateUser(
        id,
        adminId,
        organizationId
      );

      res.status(200).json(session);
    } catch (error: any) {
      if (error.message === 'User not found') {
        res.status(404).json({
          error: 'USER_NOT_FOUND',
          message: error.message,
        });
        return;
      }

      if (error.message.includes('Cannot impersonate')) {
        res.status(403).json({
          error: 'FORBIDDEN',
          message: error.message,
        });
        return;
      }

      res.status(500).json({
        error: 'INTERNAL_SERVER_ERROR',
        message: error.message,
      });
    }
  }

  /**
   * @openapi
   * /api/v1/admin/users/{id}/deactivate:
   *   post:
   *     summary: Deactivate user account
   *     description: Deactivate a user account (SUPER_ADMIN only, full audit trail)
   *     tags: [Admin - Users]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: User ID to deactivate
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - reason
   *             properties:
   *               reason:
   *                 type: string
   *                 description: Reason for deactivation
   *     responses:
   *       200:
   *         description: User deactivated successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 userId:
   *                   type: string
   *                 reason:
   *                   type: string
   *                 deactivatedAt:
   *                   type: string
   *                   format: date-time
   *       400:
   *         description: Bad request - reason required
   *       403:
   *         description: Forbidden - cannot deactivate SUPER_ADMIN users
   *       404:
   *         description: User not found
   *       500:
   *         description: Internal server error
   */
  async deactivateUser(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const adminId = req.user?.userId;
      const organizationId = req.user?.organizationId;

      if (!adminId || !organizationId) {
        res.status(401).json({
          error: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
        return;
      }

      if (!reason) {
        res.status(400).json({
          error: 'BAD_REQUEST',
          message: 'Deactivation reason is required',
        });
        return;
      }

      const result = await systemUsersService.deactivateUser(
        id,
        reason,
        adminId,
        organizationId
      );

      res.status(200).json(result);
    } catch (error: any) {
      if (error.message === 'User not found') {
        res.status(404).json({
          error: 'USER_NOT_FOUND',
          message: error.message,
        });
        return;
      }

      if (error.message.includes('Cannot deactivate')) {
        res.status(403).json({
          error: 'FORBIDDEN',
          message: error.message,
        });
        return;
      }

      res.status(500).json({
        error: 'INTERNAL_SERVER_ERROR',
        message: error.message,
      });
    }
  }
}

export default new SystemUsersController();
