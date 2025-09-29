import { Router } from 'express';
import {
  userController,
  validateCreateUser,
  validateUpdateUser,
  validateListUsers,
  validateUserParam,
  validateInviteUser
} from '../controllers/user.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { auditCreate, auditUpdate, auditDelete, auditView } from '../middleware/audit.middleware';
import { UserRole } from '../types/enums';

const router = Router();

// Apply authentication to all routes
router.use(authenticate);

/**
 * @swagger
 * /users:
 *   post:
 *     tags: [Users]
 *     summary: Create a new user
 *     description: Creates a new user account. Requires Admin or Super Admin role.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - firstName
 *               - lastName
 *               - role
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: User's email address
 *                 example: "john.doe@example.com"
 *               firstName:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 50
 *                 description: User's first name
 *                 example: "John"
 *               lastName:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 50
 *                 description: User's last name
 *                 example: "Doe"
 *               role:
 *                 type: string
 *                 enum: [SUPER_ADMIN, ADMIN, MANAGER, ACCOUNTANT, EMPLOYEE, VIEWER]
 *                 description: User's role
 *                 example: "EMPLOYEE"
 *               phone:
 *                 type: string
 *                 description: User's phone number
 *                 example: "+1234567890"
 *               password:
 *                 type: string
 *                 minLength: 8
 *                 description: User's password (must contain uppercase, lowercase, number, and special character)
 *                 example: "SecurePass123!"
 *               isActive:
 *                 type: boolean
 *                 description: Whether the user account is active
 *                 default: true
 *     responses:
 *       201:
 *         description: User created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         description: Validation error
 *       403:
 *         description: Insufficient permissions
 *       409:
 *         description: User with email already exists
 */
router.post(
  '/',
  authorize([UserRole.SUPER_ADMIN, UserRole.ADMIN]),
  validateCreateUser,
  auditCreate('USER'),
  userController.createUser
);

/**
 * @swagger
 * /users:
 *   get:
 *     tags: [Users]
 *     summary: List users
 *     description: Get a paginated list of users in the organization. Requires Admin+ role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 50
 *         description: Number of items per page
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [SUPER_ADMIN, ADMIN, MANAGER, ACCOUNTANT, EMPLOYEE, VIEWER]
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
 *           maxLength: 100
 *         description: Search by name or email
 *     responses:
 *       200:
 *         description: Users retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/User'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 *       400:
 *         description: Validation error
 *       403:
 *         description: Insufficient permissions
 */
router.get(
  '/',
  authorize([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER]),
  validateListUsers,
  auditView('USER'),
  userController.findUsers
);

/**
 * @swagger
 * /users/{userId}:
 *   get:
 *     tags: [Users]
 *     summary: Get user by ID
 *     description: Get a specific user by ID. Requires Admin+ role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
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
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/User'
 *       404:
 *         description: User not found
 *       403:
 *         description: Insufficient permissions
 */
router.get(
  '/:userId',
  authorize([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER]),
  validateUserParam,
  auditView('USER'),
  userController.getUser
);

/**
 * @swagger
 * /users/{userId}:
 *   put:
 *     tags: [Users]
 *     summary: Update user
 *     description: Update user information. Requires Admin+ role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: User's email address
 *               firstName:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 50
 *                 description: User's first name
 *               lastName:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 50
 *                 description: User's last name
 *               role:
 *                 type: string
 *                 enum: [SUPER_ADMIN, ADMIN, MANAGER, ACCOUNTANT, EMPLOYEE, VIEWER]
 *                 description: User's role
 *               phone:
 *                 type: string
 *                 description: User's phone number
 *               isActive:
 *                 type: boolean
 *                 description: Whether the user account is active
 *     responses:
 *       200:
 *         description: User updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         description: Validation error
 *       404:
 *         description: User not found
 *       403:
 *         description: Insufficient permissions
 */
router.put(
  '/:userId',
  authorize([UserRole.SUPER_ADMIN, UserRole.ADMIN]),
  validateUpdateUser,
  auditUpdate('USER'),
  userController.updateUser
);

/**
 * @swagger
 * /users/{userId}:
 *   delete:
 *     tags: [Users]
 *     summary: Delete user
 *     description: Soft delete a user account. Requires Admin+ role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: User deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       404:
 *         description: User not found
 *       403:
 *         description: Insufficient permissions
 *       400:
 *         description: Cannot delete self
 */
router.delete(
  '/:userId',
  authorize([UserRole.SUPER_ADMIN, UserRole.ADMIN]),
  validateUserParam,
  auditDelete('USER'),
  userController.deleteUser
);

/**
 * @swagger
 * /users/invite:
 *   post:
 *     tags: [Users]
 *     summary: Invite user
 *     description: Send an invitation to join the organization. Requires Admin+ role.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - role
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Email address to invite
 *                 example: "newuser@example.com"
 *               role:
 *                 type: string
 *                 enum: [SUPER_ADMIN, ADMIN, MANAGER, ACCOUNTANT, EMPLOYEE, VIEWER]
 *                 description: Role for the new user
 *                 example: "EMPLOYEE"
 *     responses:
 *       200:
 *         description: Invitation sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       400:
 *         description: User already exists or validation error
 *       403:
 *         description: Insufficient permissions
 */
router.post(
  '/invite',
  authorize([UserRole.SUPER_ADMIN, UserRole.ADMIN]),
  validateInviteUser,
  auditCreate('USER'),
  userController.inviteUser
);

/**
 * @swagger
 * /users/{userId}/resend-invite:
 *   post:
 *     tags: [Users]
 *     summary: Resend user invitation
 *     description: Resend invitation to a pending user. Requires Admin+ role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: Invitation resent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       400:
 *         description: User not found or already activated
 *       403:
 *         description: Insufficient permissions
 */
router.post(
  '/:userId/resend-invite',
  authorize([UserRole.SUPER_ADMIN, UserRole.ADMIN]),
  validateUserParam,
  auditUpdate('USER'),
  userController.resendInvite
);

/**
 * @swagger
 * /users/{userId}/activate:
 *   post:
 *     tags: [Users]
 *     summary: Activate user account
 *     description: Activate a user account. Requires Admin+ role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: User activated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/User'
 *                 message:
 *                   type: string
 *       404:
 *         description: User not found
 *       403:
 *         description: Insufficient permissions
 */
router.post(
  '/:userId/activate',
  authorize([UserRole.SUPER_ADMIN, UserRole.ADMIN]),
  validateUserParam,
  auditUpdate('USER'),
  userController.activateUser
);

/**
 * @swagger
 * /users/{userId}/deactivate:
 *   post:
 *     tags: [Users]
 *     summary: Deactivate user account
 *     description: Deactivate a user account. Users cannot deactivate themselves. Requires Admin+ role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: User deactivated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/User'
 *                 message:
 *                   type: string
 *       400:
 *         description: Cannot deactivate self
 *       404:
 *         description: User not found
 *       403:
 *         description: Insufficient permissions
 */
router.post(
  '/:userId/deactivate',
  authorize([UserRole.SUPER_ADMIN, UserRole.ADMIN]),
  validateUserParam,
  auditUpdate('USER'),
  userController.deactivateUser
);

/**
 * @swagger
 * /users/{userId}/status:
 *   get:
 *     tags: [Users]
 *     summary: Get user account status
 *     description: Get detailed account status information for a user. Requires Admin+ role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: User status retrieved successfully
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
 *                     userId:
 *                       type: string
 *                     isActive:
 *                       type: boolean
 *                     emailVerified:
 *                       type: boolean
 *                     lastLogin:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *                     accountStatus:
 *                       type: string
 *                       enum: [active, inactive, pending, suspended]
 *                     loginAttempts:
 *                       type: integer
 *                     lockedUntil:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *       404:
 *         description: User not found
 *       403:
 *         description: Insufficient permissions
 */
router.get(
  '/:userId/status',
  authorize([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER]),
  validateUserParam,
  auditView('USER'),
  userController.getUserStatus
);

export default router;