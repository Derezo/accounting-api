import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { authService } from '../services/auth.service';
import { AuthenticatedRequest } from '../middleware/auth.middleware';

export const validateRegister = [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('firstName').notEmpty().trim(),
  body('lastName').notEmpty().trim(),
  body('organizationName').notEmpty().trim(),
  body('organizationDomain').optional().trim()
];

export const validateLogin = [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
  body('twoFactorCode').optional().isLength({ min: 6, max: 6 })
];

export const validateChangePassword = [
  body('oldPassword').notEmpty(),
  body('newPassword').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
];

export const validateResetPassword = [
  body('token').notEmpty(),
  body('newPassword').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
];

export class AuthController {
  async register(req: Request, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      const result = await authService.register(req.body);

      res.status(201).json({
        message: 'Registration successful',
        user: {
          id: result.user.id,
          email: result.user.email,
          firstName: result.user.firstName,
          lastName: result.user.lastName,
          role: result.user.role
        },
        organization: {
          id: result.organization.id,
          name: result.organization.name
        },
        tokens: result.tokens
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  async login(req: Request, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      const result = await authService.login({
        ...req.body,
        ipAddress: req.ip || '',
        userAgent: req.headers['user-agent']
      });

      res.json({
        message: 'Login successful',
        user: {
          id: result.user.id,
          email: result.user.email,
          firstName: result.user.firstName,
          lastName: result.user.lastName,
          role: result.user.role
        },
        tokens: result.tokens
      });
    } catch (error: any) {
      res.status(401).json({ error: error.message });
    }
  }

  async refreshToken(req: Request, res: Response): Promise<void> {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        res.status(400).json({ error: 'Refresh token required' });
        return;
      }

      const tokens = await authService.refreshToken(refreshToken);

      res.json({
        message: 'Token refreshed successfully',
        tokens
      });
    } catch (error: any) {
      res.status(401).json({ error: error.message });
    }
  }

  async logout(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      await authService.logout(req.user.sessionId);

      res.json({ message: 'Logout successful' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  async logoutAll(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      await authService.logoutAllSessions(req.user.id);

      res.json({ message: 'All sessions terminated' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  async changePassword(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      await authService.changePassword(
        req.user.id,
        req.body.oldPassword,
        req.body.newPassword
      );

      res.json({ message: 'Password changed successfully' });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  async resetPasswordRequest(req: Request, res: Response): Promise<void> {
    try {
      const { email } = req.body;

      if (!email) {
        res.status(400).json({ error: 'Email required' });
        return;
      }

      const message = await authService.resetPasswordRequest(email);

      // In production, send email with reset token
      // For now, just return success message
      res.json({ message });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  async resetPassword(req: Request, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      await authService.resetPassword(req.body.token, req.body.newPassword);

      res.json({ message: 'Password reset successful' });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  async getProfile(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();

      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          phone: true,
          avatar: true,
          emailVerified: true,
          twoFactorEnabled: true,
          createdAt: true,
          organization: {
            select: {
              id: true,
              name: true,
              domain: true,
              type: true
            }
          }
        }
      });

      res.json({ user });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  async updateProfile(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const { firstName, lastName, phone, avatar } = req.body;

      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();

      const user = await prisma.user.update({
        where: { id: req.user.id },
        data: {
          firstName,
          lastName,
          phone,
          avatar
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          phone: true,
          avatar: true
        }
      });

      res.json({ message: 'Profile updated', user });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  async enableTwoFactor(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();
      const { generateTwoFactorSecret } = require('../utils/crypto');

      const secret = generateTwoFactorSecret();

      await prisma.user.update({
        where: { id: req.user.id },
        data: {
          twoFactorSecret: secret,
          twoFactorEnabled: false // Will be enabled after verification
        }
      });

      // In production, generate QR code for authenticator app
      res.json({
        message: 'Two-factor authentication secret generated',
        secret // In production, don't expose this directly
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  async verifyTwoFactor(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const { code } = req.body;

      if (!code) {
        res.status(400).json({ error: 'Verification code required' });
        return;
      }

      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();
      const { verifyOTP } = require('../utils/crypto');

      const user = await prisma.user.findUnique({
        where: { id: req.user.id }
      });

      if (!user || !user.twoFactorSecret) {
        res.status(400).json({ error: 'Two-factor authentication not set up' });
        return;
      }

      const isValid = verifyOTP(code, user.twoFactorSecret);

      if (!isValid) {
        res.status(400).json({ error: 'Invalid verification code' });
        return;
      }

      await prisma.user.update({
        where: { id: req.user.id },
        data: { twoFactorEnabled: true }
      });

      res.json({ message: 'Two-factor authentication enabled' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  async disableTwoFactor(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();

      await prisma.user.update({
        where: { id: req.user.id },
        data: {
          twoFactorEnabled: false,
          twoFactorSecret: null
        }
      });

      res.json({ message: 'Two-factor authentication disabled' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
}

export const authController = new AuthController();