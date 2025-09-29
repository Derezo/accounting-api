import { Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { userService } from '../services/user.service';
import { UserRole } from '../types/enums';

// Validation middleware
export const validateCreateUser = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('firstName')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('First name must be 1-50 characters'),
  body('lastName')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Last name must be 1-50 characters'),
  body('role')
    .isIn(Object.values(UserRole))
    .withMessage('Valid role is required'),
  body('phone')
    .optional()
    .isMobilePhone('any')
    .withMessage('Valid phone number is required'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain at least one lowercase letter, one uppercase letter, one number, and one special character'),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean')
];

export const validateUpdateUser = [
  param('userId')
    .isString()
    .isLength({ min: 1 })
    .withMessage('Valid user ID is required'),
  body('email')
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('firstName')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('First name must be 1-50 characters'),
  body('lastName')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Last name must be 1-50 characters'),
  body('role')
    .optional()
    .isIn(Object.values(UserRole))
    .withMessage('Valid role is required'),
  body('phone')
    .optional()
    .isMobilePhone('any')
    .withMessage('Valid phone number is required'),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean')
];

export const validateListUsers = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('role')
    .optional()
    .isIn(Object.values(UserRole))
    .withMessage('Valid role is required'),
  query('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean'),
  query('search')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Search term must be 1-100 characters')
];

export const validateUserParam = [
  param('userId')
    .isString()
    .isLength({ min: 1 })
    .withMessage('Valid user ID is required')
];

export const validateInviteUser = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('role')
    .isIn(Object.values(UserRole))
    .withMessage('Valid role is required')
];

class UserController {
  constructor() {
    this.createUser = this.createUser.bind(this);
    this.findUsers = this.findUsers.bind(this);
    this.getUser = this.getUser.bind(this);
    this.updateUser = this.updateUser.bind(this);
    this.deleteUser = this.deleteUser.bind(this);
    this.inviteUser = this.inviteUser.bind(this);
    this.resendInvite = this.resendInvite.bind(this);
    this.activateUser = this.activateUser.bind(this);
    this.deactivateUser = this.deactivateUser.bind(this);
    this.getUserStatus = this.getUserStatus.bind(this);
  }

  async createUser(req: Request, res: Response): Promise<void> {
    try {
      // Check validation results
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
        return;
      }

      const { organizationId, userId } = (req as any).user!;
      const userData = {
        ...req.body,
        organizationId
      };

      const user = await userService.createUser(userData, userId);

      // Remove sensitive data
      const { passwordHash, passwordResetToken, twoFactorSecret, ...safeUser } = user as any;

      res.status(201).json({
        success: true,
        data: safeUser
      });
    } catch (error) {
      console.error('Error creating user:', error);
      res.status(500).json({
        error: 'Failed to create user',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async findUsers(req: Request, res: Response): Promise<void> {
    try {
      // Check validation results
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
        return;
      }

      const { organizationId } = (req as any).user!;
      const filters = {
        page: req.query.page ? parseInt(req.query.page as string) : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
        role: req.query.role as UserRole,
        isActive: req.query.isActive ? req.query.isActive === 'true' : undefined,
        search: req.query.search as string
      };

      const result = await userService.findUsers(filters, organizationId);

      // Remove sensitive data from all users
      const safeUsers = result.users.map(user => {
        const { passwordHash, passwordResetToken, twoFactorSecret, ...safeUser } = user as any;
        return safeUser;
      });

      res.json({
        success: true,
        data: safeUsers,
        pagination: result.pagination
      });
    } catch (error) {
      console.error('Error fetching users:', error);
      res.status(500).json({
        error: 'Failed to fetch users',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async getUser(req: Request, res: Response): Promise<void> {
    try {
      // Check validation results
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
        return;
      }

      const { organizationId } = (req as any).user!;
      const { userId } = req.params;

      const user = await userService.getUserById(userId, organizationId);

      if (!user) {
        res.status(404).json({
          error: 'User not found'
        });
        return;
      }

      // Remove sensitive data
      const { passwordHash, passwordResetToken, twoFactorSecret, ...safeUser } = user as any;

      res.json({
        success: true,
        data: safeUser
      });
    } catch (error) {
      console.error('Error fetching user:', error);
      res.status(500).json({
        error: 'Failed to fetch user',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async updateUser(req: Request, res: Response): Promise<void> {
    try {
      // Check validation results
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
        return;
      }

      const { organizationId, userId: currentUserId } = (req as any).user!;
      const { userId } = req.params;

      const user = await userService.updateUser(userId, req.body, organizationId, currentUserId);

      // Remove sensitive data
      const { passwordHash, passwordResetToken, twoFactorSecret, ...safeUser } = user as any;

      res.json({
        success: true,
        data: safeUser
      });
    } catch (error) {
      console.error('Error updating user:', error);
      res.status(500).json({
        error: 'Failed to update user',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async deleteUser(req: Request, res: Response): Promise<void> {
    try {
      // Check validation results
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
        return;
      }

      const { organizationId, userId: currentUserId } = (req as any).user!;
      const { userId } = req.params;

      await userService.deleteUser(userId, organizationId, currentUserId);

      res.json({
        success: true,
        message: 'User deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting user:', error);
      res.status(500).json({
        error: 'Failed to delete user',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async inviteUser(req: Request, res: Response): Promise<void> {
    try {
      // Check validation results
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
        return;
      }

      const { organizationId, userId } = (req as any).user!;
      const { email, role } = req.body;

      const result = await userService.inviteUser(email, role, organizationId, userId);

      if (!result.success) {
        res.status(400).json({
          error: result.message
        });
        return;
      }

      res.json({
        success: true,
        message: result.message
      });
    } catch (error) {
      console.error('Error inviting user:', error);
      res.status(500).json({
        error: 'Failed to invite user',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async resendInvite(req: Request, res: Response): Promise<void> {
    try {
      // Check validation results
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
        return;
      }

      const { organizationId, userId: currentUserId } = (req as any).user!;
      const { userId } = req.params;

      const result = await userService.resendInvite(userId, organizationId, currentUserId);

      if (!result.success) {
        res.status(400).json({
          error: result.message
        });
        return;
      }

      res.json({
        success: true,
        message: result.message
      });
    } catch (error) {
      console.error('Error resending invite:', error);
      res.status(500).json({
        error: 'Failed to resend invite',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async activateUser(req: Request, res: Response): Promise<void> {
    try {
      // Check validation results
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
        return;
      }

      const { organizationId, userId: currentUserId } = (req as any).user!;
      const { userId } = req.params;

      const user = await userService.activateUser(userId, organizationId, currentUserId);

      // Remove sensitive data
      const { passwordHash, passwordResetToken, twoFactorSecret, ...safeUser } = user as any;

      res.json({
        success: true,
        data: safeUser,
        message: 'User activated successfully'
      });
    } catch (error) {
      console.error('Error activating user:', error);
      res.status(500).json({
        error: 'Failed to activate user',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async deactivateUser(req: Request, res: Response): Promise<void> {
    try {
      // Check validation results
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
        return;
      }

      const { organizationId, userId: currentUserId } = (req as any).user!;
      const { userId } = req.params;

      const user = await userService.deactivateUser(userId, organizationId, currentUserId);

      // Remove sensitive data
      const { passwordHash, passwordResetToken, twoFactorSecret, ...safeUser } = user as any;

      res.json({
        success: true,
        data: safeUser,
        message: 'User deactivated successfully'
      });
    } catch (error) {
      console.error('Error deactivating user:', error);
      if (error instanceof Error && error.message === 'Users cannot deactivate themselves') {
        res.status(400).json({
          error: 'Invalid operation',
          message: error.message
        });
        return;
      }
      res.status(500).json({
        error: 'Failed to deactivate user',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async getUserStatus(req: Request, res: Response): Promise<void> {
    try {
      // Check validation results
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
        return;
      }

      const { organizationId } = (req as any).user!;
      const { userId } = req.params;

      const status = await userService.getUserStatus(userId, organizationId);

      res.json({
        success: true,
        data: status
      });
    } catch (error) {
      console.error('Error fetching user status:', error);
      res.status(500).json({
        error: 'Failed to fetch user status',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}

export const userController = new UserController();