import { hashPassword, verifyPassword, generateRandomToken } from '../../utils/crypto';
import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import {
  InvalidCredentialsError,
  NotFoundError,
  BusinessRuleError,
  ValidationError
} from '../../utils/errors';
import { EmailService } from '../email.service';

const emailService = new EmailService();

export interface PasswordResetRequest {
  email: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface PasswordResetData {
  token: string;
  newPassword: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface PasswordChangeData {
  userId: string;
  currentPassword: string;
  newPassword: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Service responsible for password management and security
 */
export class PasswordService {
  private readonly PASSWORD_MIN_LENGTH = 8;
  private readonly PASSWORD_COMPLEXITY_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/;
  private readonly RESET_TOKEN_EXPIRY_HOURS = 1;
  private readonly MAX_FAILED_ATTEMPTS = 5;
  private readonly LOCKOUT_DURATION_MINUTES = 30;

  /**
   * Validate password meets security requirements
   */
  validatePassword(password: string): void {
    if (!password || password.length < this.PASSWORD_MIN_LENGTH) {
      throw new ValidationError(
        `Password must be at least ${this.PASSWORD_MIN_LENGTH} characters long`
      );
    }

    if (!this.PASSWORD_COMPLEXITY_REGEX.test(password)) {
      throw new ValidationError(
        'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
      );
    }

    // Check for common weak passwords
    const commonPasswords = [
      'password', 'password123', '123456', 'qwerty', 'admin', 'letmein'
    ];

    if (commonPasswords.includes(password.toLowerCase())) {
      throw new ValidationError('Password is too common. Please choose a stronger password');
    }
  }

  /**
   * Hash a password using bcrypt
   */
  async hashPasswordSecure(password: string): Promise<string> {
    this.validatePassword(password);

    try {
      return await hashPassword(password);
    } catch (error) {
      logger.error('Password hashing failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw new Error('Failed to process password');
    }
  }

  /**
   * Verify password against hash with account lockout protection
   */
  async verifyPasswordWithLockout(
    userId: string,
    password: string,
    passwordHash: string
  ): Promise<boolean> {
    // Check if account is locked
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        failedAttempts: true,
        lockedUntil: true,
        lastLoginAt: true
      }
    });

    if (!user) {
      throw new NotFoundError('User', userId);
    }

    // Check if account is currently locked
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const unlockTime = user.lockedUntil.toISOString();
      logger.warn('Login attempt on locked account', {
        userId,
        unlockTime
      });
      throw new BusinessRuleError(
        'Account is temporarily locked due to multiple failed login attempts',
        'ACCOUNT_LOCKED',
        { unlockTime }
      );
    }

    // Verify password
    const isValid = await verifyPassword(password, passwordHash);

    if (isValid) {
      // Reset failed attempts on successful login
      if (user.failedAttempts > 0 || user.lockedUntil) {
        await this.resetFailedAttempts(userId);
      }
      return true;
    } else {
      // Increment failed attempts
      await this.incrementFailedAttempts(userId);
      return false;
    }
  }

  /**
   * Increment failed login attempts and lock account if necessary
   */
  private async incrementFailedAttempts(userId: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { failedAttempts: true }
    });

    if (!user) return;

    const failedAttempts = user.failedAttempts + 1;
    const updates: any = { failedAttempts };

    // Lock account after max failed attempts
    if (failedAttempts >= this.MAX_FAILED_ATTEMPTS) {
      updates.lockedUntil = new Date(
        Date.now() + this.LOCKOUT_DURATION_MINUTES * 60 * 1000
      );

      logger.warn('Account locked due to failed attempts', {
        userId,
        failedAttempts,
        lockoutDuration: this.LOCKOUT_DURATION_MINUTES
      });
    }

    await prisma.user.update({
      where: { id: userId },
      data: updates
    });

    logger.info('Failed login attempt recorded', {
      userId,
      failedAttempts,
      isLocked: !!updates.lockedUntil
    });
  }

  /**
   * Reset failed login attempts
   */
  private async resetFailedAttempts(userId: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: {
        failedAttempts: 0,
        lockedUntil: null
      }
    });

    logger.info('Failed attempts reset for user', { userId });
  }

  /**
   * Change user password
   */
  async changePassword(data: PasswordChangeData): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: data.userId },
      select: {
        id: true,
        passwordHash: true,
        email: true
      }
    });

    if (!user) {
      throw new NotFoundError('User', data.userId);
    }

    // Verify current password
    const isValidCurrentPassword = await verifyPassword(
      data.currentPassword,
      user.passwordHash
    );

    if (!isValidCurrentPassword) {
      logger.warn('Password change failed - invalid current password', {
        userId: data.userId,
        email: user.email,
        ipAddress: data.ipAddress
      });
      throw new InvalidCredentialsError({ message: 'Current password is incorrect' });
    }

    // Validate new password
    this.validatePassword(data.newPassword);

    // Hash new password
    const newPasswordHash = await this.hashPasswordSecure(data.newPassword);

    // Update password and invalidate all sessions
    await prisma.$transaction(async (tx) => {
      // Update password
      await tx.user.update({
        where: { id: data.userId },
        data: {
          passwordHash: newPasswordHash,
          updatedAt: new Date()
        }
      });

      // Invalidate all sessions for security
      await tx.session.deleteMany({
        where: { userId: data.userId }
      });
    });

    logger.info('Password changed successfully', {
      userId: data.userId,
      email: user.email,
      ipAddress: data.ipAddress,
      sessionsInvalidated: true
    });
  }

  /**
   * Request password reset
   */
  async requestPasswordReset(data: PasswordResetRequest): Promise<string> {
    const user = await prisma.user.findUnique({
      where: { email: data.email.toLowerCase() },
      select: {
        id: true,
        email: true,
        isActive: true,
        firstName: true,
        lastName: true
      }
    });

    // Always return success message for security (don't reveal if email exists)
    const successMessage = 'If an account with that email exists, a password reset link has been sent';

    if (!user || !user.isActive) {
      logger.info('Password reset requested for non-existent or inactive user', {
        email: data.email,
        ipAddress: data.ipAddress
      });
      return successMessage;
    }

    // Generate reset token
    const resetToken = generateRandomToken(32);
    const resetExpires = new Date(
      Date.now() + this.RESET_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000
    );

    // Store reset token
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: resetToken,
        passwordResetExpires: resetExpires,
        updatedAt: new Date()
      }
    });

    logger.info('Password reset token generated', {
      userId: user.id,
      email: user.email,
      expiresAt: resetExpires.toISOString(),
      ipAddress: data.ipAddress
    });

    // SECURITY FIX: Send reset token via email only (never return to API response)
    try {
      await this.sendPasswordResetEmail(user.email, resetToken, user.firstName);
      logger.info('Password reset email sent', {
        userId: user.id,
        email: user.email
      });
    } catch (error) {
      logger.error('Failed to send password reset email', {
        userId: user.id,
        email: user.email,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      // Still return success message to avoid revealing whether email exists
    }

    return successMessage;
  }

  /**
   * Send password reset email with token
   */
  private async sendPasswordResetEmail(
    email: string,
    token: string,
    firstName?: string | null
  ): Promise<void> {
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3001'}/reset-password?token=${token}`;
    const expiryHours = this.RESET_TOKEN_EXPIRY_HOURS;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #007bff; color: white; padding: 20px; text-align: center; }
            .content { background-color: #f9f9f9; padding: 30px; border-radius: 5px; margin: 20px 0; }
            .button { display: inline-block; padding: 12px 30px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; font-size: 12px; color: #666; margin-top: 30px; }
            .warning { background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Password Reset Request</h1>
            </div>
            <div class="content">
              <p>Hi ${firstName || 'there'},</p>
              <p>We received a request to reset your password for your Lifestream Dynamics account.</p>
              <p>Click the button below to reset your password:</p>
              <p style="text-align: center;">
                <a href="${resetUrl}" class="button">Reset Password</a>
              </p>
              <p>Or copy and paste this link into your browser:</p>
              <p style="word-break: break-all; background-color: #fff; padding: 10px; border: 1px solid #ddd;">
                ${resetUrl}
              </p>
              <div class="warning">
                <strong>⚠️ Security Notice:</strong>
                <ul>
                  <li>This link will expire in ${expiryHours} hour${expiryHours > 1 ? 's' : ''}</li>
                  <li>If you didn't request this reset, please ignore this email</li>
                  <li>Never share this link with anyone</li>
                </ul>
              </div>
            </div>
            <div class="footer">
              <p>© ${new Date().getFullYear()} Lifestream Dynamics. All rights reserved.</p>
              <p>This is an automated email. Please do not reply to this message.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const text = `
Password Reset Request

Hi ${firstName || 'there'},

We received a request to reset your password for your Lifestream Dynamics account.

Reset your password by visiting this link:
${resetUrl}

Security Notice:
- This link will expire in ${expiryHours} hour${expiryHours > 1 ? 's' : ''}
- If you didn't request this reset, please ignore this email
- Never share this link with anyone

© ${new Date().getFullYear()} Lifestream Dynamics. All rights reserved.
    `.trim();

    await emailService.sendEmail(
      email,
      'Reset Your Password - Lifestream Dynamics',
      html,
      text
    );
  }

  /**
   * Reset password using token
   */
  async resetPassword(data: PasswordResetData): Promise<void> {
    // Find user with valid reset token
    const user = await prisma.user.findFirst({
      where: {
        passwordResetToken: data.token,
        passwordResetExpires: {
          gt: new Date()
        },
        isActive: true
      },
      select: {
        id: true,
        email: true,
        passwordResetToken: true,
        passwordResetExpires: true
      }
    });

    if (!user) {
      logger.warn('Invalid or expired password reset token used', {
        token: data.token.substring(0, 8) + '...',
        ipAddress: data.ipAddress
      });
      throw new InvalidCredentialsError({ message: 'Invalid or expired reset token' });
    }

    // Validate new password
    this.validatePassword(data.newPassword);

    // Hash new password
    const passwordHash = await this.hashPasswordSecure(data.newPassword);

    // Update password and clear reset token, invalidate all sessions
    await prisma.$transaction(async (tx) => {
      // Update password and clear reset token
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          passwordResetToken: null,
          passwordResetExpires: null,
          failedAttempts: 0, // Reset failed attempts
          lockedUntil: null, // Unlock account
          updatedAt: new Date()
        }
      });

      // Invalidate all sessions for security
      await tx.session.deleteMany({
        where: { userId: user.id }
      });
    });

    logger.info('Password reset completed', {
      userId: user.id,
      email: user.email,
      ipAddress: data.ipAddress,
      sessionsInvalidated: true
    });
  }

  /**
   * Check if password reset token is valid
   */
  async validateResetToken(token: string): Promise<boolean> {
    const user = await prisma.user.findFirst({
      where: {
        passwordResetToken: token,
        passwordResetExpires: {
          gt: new Date()
        },
        isActive: true
      },
      select: { id: true }
    });

    return !!user;
  }

  /**
   * Clean up expired password reset tokens
   */
  async cleanupExpiredResetTokens(): Promise<number> {
    try {
      const result = await prisma.user.updateMany({
        where: {
          passwordResetExpires: {
            lt: new Date()
          },
          passwordResetToken: {
            not: null
          }
        },
        data: {
          passwordResetToken: null,
          passwordResetExpires: null
        }
      });

      logger.info('Expired password reset tokens cleaned up', {
        cleanedCount: result.count
      });

      return result.count;
    } catch (error) {
      logger.error('Failed to cleanup expired reset tokens', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }
}

export const passwordService = new PasswordService();