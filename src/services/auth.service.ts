import jwt from 'jsonwebtoken';
import {  User, Session } from '@prisma/client';
import { config } from '../config/config';
import { hashPassword, verifyPassword, generateRandomToken, verifyOTP, validatePasswordStrength } from '../utils/crypto';
import { UserRole } from '../types/enums';
import crypto from 'crypto';
import { Request } from 'express';
import { auditService } from './audit.service';


import { prisma } from '../config/database';
interface TokenPayload {
  userId: string;
  organizationId: string;
  role: string;
  sessionId: string;
  jti?: string;
  iat?: number;
  isTestToken?: boolean;
}

interface RefreshTokenPayload {
  userId: string;
  sessionId: string;
  tokenFamily: string;
  jti?: string;
}

interface LoginCredentials {
  email: string;
  password: string;
  twoFactorCode?: string;
  ipAddress: string;
  userAgent?: string;
}

interface RegisterData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  organizationName: string;
  organizationDomain?: string;
}

export class AuthService {
  // Session security constants
  private readonly SESSION_DURATION_MS = 2 * 60 * 60 * 1000; // 2 hours (reduced from 7 days)
  private readonly IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
  private readonly MAX_CONCURRENT_SESSIONS = 3;

  /**
   * Generate device fingerprint from request metadata
   * Creates a unique identifier based on user-agent, IP, and language preferences
   */
  private generateDeviceFingerprint(req: Request): string {
    const ua = req.headers['user-agent'] || 'unknown';
    const ip = req.ip || 'unknown';
    const acceptLanguage = req.headers['accept-language'] || 'unknown';

    return crypto.createHash('sha256')
      .update(`${ua}${ip}${acceptLanguage}`)
      .digest('hex');
  }

  /**
   * Extract and structure device information from request
   */
  private extractDeviceInfo(req: Request): string {
    const ua = req.headers['user-agent'] || 'unknown';

    // Parse user agent for browser and OS info
    const deviceInfo = {
      userAgent: ua,
      browser: this.parseBrowser(ua),
      os: this.parseOS(ua),
      timestamp: new Date().toISOString()
    };

    return JSON.stringify(deviceInfo);
  }

  /**
   * Parse browser information from user agent
   */
  private parseBrowser(ua: string): string {
    if (ua.includes('Chrome')) return 'Chrome';
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Safari')) return 'Safari';
    if (ua.includes('Edge')) return 'Edge';
    return 'Unknown';
  }

  /**
   * Parse OS information from user agent
   */
  private parseOS(ua: string): string {
    if (ua.includes('Windows')) return 'Windows';
    if (ua.includes('Mac OS')) return 'macOS';
    if (ua.includes('Linux')) return 'Linux';
    if (ua.includes('Android')) return 'Android';
    if (ua.includes('iOS')) return 'iOS';
    return 'Unknown';
  }

  /**
   * Limit concurrent sessions per user to prevent session proliferation
   * Deletes oldest sessions when limit is exceeded
   */
  private async limitConcurrentSessions(userId: string): Promise<void> {
    const sessions = await prisma.session.findMany({
      where: {
        userId,
        expiresAt: { gt: new Date() }
      },
      orderBy: { lastActivityAt: 'desc' }
    });

    if (sessions.length >= this.MAX_CONCURRENT_SESSIONS) {
      // Delete oldest sessions (keep the most recent MAX_CONCURRENT_SESSIONS - 1)
      const sessionsToDelete = sessions.slice(this.MAX_CONCURRENT_SESSIONS - 1);

      await prisma.session.deleteMany({
        where: {
          id: { in: sessionsToDelete.map(s => s.id) }
        }
      });
    }
  }

  /**
   * Validate session security on each request
   * Checks IP address, device fingerprint, and idle timeout
   */
  async validateSession(token: string, req: Request): Promise<Session | null> {
    const session = await prisma.session.findUnique({
      where: { token },
      include: { user: true }
    });

    if (!session || session.expiresAt < new Date()) {
      return null;
    }

    // Validate IP address (strict IP checking)
    if (session.ipAddress !== req.ip) {
      await auditService.logAction({
        action: 'SESSION_IP_MISMATCH' as any,
        entityType: 'Session',
        entityId: session.id,
        changes: {
          expectedIp: session.ipAddress,
          actualIp: req.ip
        },
        context: {
          userId: session.userId,
          organizationId: session.user.organizationId,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'] as string
        }
      });

      // Delete suspicious session
      await prisma.session.delete({ where: { id: session.id } });
      return null;
    }

    // Validate device fingerprint
    const currentFingerprint = this.generateDeviceFingerprint(req);
    if (session.deviceFingerprint !== currentFingerprint) {
      await auditService.logAction({
        action: 'SESSION_DEVICE_MISMATCH' as any,
        entityType: 'Session',
        entityId: session.id,
        changes: {
          expectedFingerprint: session.deviceFingerprint,
          actualFingerprint: currentFingerprint
        },
        context: {
          userId: session.userId,
          organizationId: session.user.organizationId,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'] as string
        }
      });

      // Delete suspicious session
      await prisma.session.delete({ where: { id: session.id } });
      return null;
    }

    // Check idle timeout (15 minutes)
    const idleMinutes = (Date.now() - session.lastActivityAt.getTime()) / (1000 * 60);
    if (idleMinutes > (this.IDLE_TIMEOUT_MS / (1000 * 60))) {
      await prisma.session.delete({ where: { id: session.id } });
      return null;
    }

    // Update last activity timestamp
    await prisma.session.update({
      where: { id: session.id },
      data: { lastActivityAt: new Date() }
    });

    return session;
  }

  /**
   * Revoke all sessions for a user (used on password change or security events)
   */
  async revokeAllUserSessions(userId: string, reason: string): Promise<number> {
    const result = await prisma.session.deleteMany({
      where: { userId }
    });

    await auditService.logAction({
      action: 'SESSION_REVOKE_ALL' as any,
      entityType: 'User',
      entityId: userId,
      changes: {
        reason,
        sessionsRevoked: result.count
      },
      context: {
        userId,
        organizationId: 'system'
      }
    });

    return result.count;
  }

  /**
   * Check if password was used recently (password history)
   * Prevents reuse of last 5 passwords
   */
  private async checkPasswordHistory(userId: string, newPasswordHash: string): Promise<boolean> {
    const recentPasswords = await prisma.passwordHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 5
    });

    for (const record of recentPasswords) {
      const isSamePassword = await verifyPassword(newPasswordHash, record.passwordHash);
      if (isSamePassword) {
        return false; // Password was used recently
      }
    }

    return true; // Password is not in history
  }

  /**
   * Save password to history
   */
  private async savePasswordHistory(userId: string, passwordHash: string): Promise<void> {
    await prisma.passwordHistory.create({
      data: {
        userId,
        passwordHash
      }
    });

    // Keep only the last 5 passwords
    const allPasswords = await prisma.passwordHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: 5
    });

    if (allPasswords.length > 0) {
      await prisma.passwordHistory.deleteMany({
        where: {
          id: {
            in: allPasswords.map(p => p.id)
          }
        }
      });
    }
  }

  async register(data: RegisterData): Promise<{ user: User; organization: any; tokens: any }> {
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email }
    });

    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    // Validate password strength
    const passwordValidation = validatePasswordStrength(data.password);
    if (!passwordValidation.valid) {
      throw new Error(`Password does not meet security requirements: ${passwordValidation.errors.join(', ')}`);
    }

    const passwordHash = await hashPassword(data.password);
    const encryptionKey = generateRandomToken(32);

    const result = await prisma.$transaction(async (tx) => {
      // Create organization
      const organization = await tx.organization.create({
        data: {
          name: data.organizationName,
          domain: data.organizationDomain,
          email: data.email,
          phone: '',
          encryptionKey,
          type: 'SINGLE_BUSINESS'
        }
      });

      // Create user with password expiration (90 days from now)
      const passwordExpiresAt = new Date();
      passwordExpiresAt.setDate(passwordExpiresAt.getDate() + 90);

      const user = await tx.user.create({
        data: {
          email: data.email,
          passwordHash,
          firstName: data.firstName,
          lastName: data.lastName,
          organizationId: organization.id,
          role: UserRole.ADMIN,
          isActive: true,
          emailVerified: false,
          passwordExpiresAt
        }
      });

      // Save initial password to history
      await tx.passwordHistory.create({
        data: {
          userId: user.id,
          passwordHash
        }
      });

      // Create initial session with enhanced security
      const expiresAt = new Date(Date.now() + this.SESSION_DURATION_MS);
      const session = await tx.session.create({
        data: {
          userId: user.id,
          token: '',
          refreshToken: '',
          ipAddress: '127.0.0.1',
          userAgent: 'registration',
          deviceFingerprint: 'registration',
          deviceInfo: JSON.stringify({ source: 'registration' }),
          lastActivityAt: new Date(),
          expiresAt
        }
      });

      const tokens = this.generateTokens({
        userId: user.id,
        organizationId: organization.id,
        role: user.role,
        sessionId: session.id
      }, session.id);

      // Update session with tokens
      await tx.session.update({
        where: { id: session.id },
        data: {
          token: tokens.accessToken,
          refreshToken: tokens.refreshToken
        }
      });

      return { user, organization, tokens };
    });

    return result;
  }

  async login(credentials: LoginCredentials): Promise<{ user: User; tokens: any }> {
    // Email is now globally unique - use findUnique for optimal performance
    const user = await prisma.user.findUnique({
      where: { email: credentials.email.toLowerCase() },
      include: { organization: true }
    });

    if (!user || !user.isActive || user.deletedAt) {
      throw new Error('Invalid credentials');
    }

    // Check password
    const isValidPassword = await verifyPassword(credentials.password, user.passwordHash);
    if (!isValidPassword) {
      await this.incrementFailedAttempts(user.id);
      throw new Error('Invalid credentials');
    }

    // Check if account is locked
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new Error('Account is locked. Please try again later.');
    }

    // Check if password has expired
    if (user.passwordExpiresAt && user.passwordExpiresAt < new Date()) {
      throw new Error('Your password has expired. Please reset your password.');
    }

    // Verify 2FA if enabled
    if (user.twoFactorEnabled) {
      if (!credentials.twoFactorCode) {
        throw new Error('Two-factor authentication code required');
      }

      if (!user.twoFactorSecret) {
        throw new Error('Two-factor authentication not properly configured');
      }

      const isValidOTP = verifyOTP(credentials.twoFactorCode, user.twoFactorSecret);
      if (!isValidOTP) {
        throw new Error('Invalid two-factor authentication code');
      }
    }

    // Limit concurrent sessions before creating new one
    await this.limitConcurrentSessions(user.id);

    // Create session with enhanced security
    const session = await this.createSessionWithRequest(
      user.id,
      credentials.ipAddress,
      credentials.userAgent || '',
      { ip: credentials.ipAddress, headers: { 'user-agent': credentials.userAgent } } as Request
    );

    const tokens = this.generateTokens({
      userId: user.id,
      organizationId: user.organizationId,
      role: user.role,
      sessionId: session.id
    }, session.id);

    // Update session with tokens
    await prisma.session.update({
      where: { id: session.id },
      data: {
        token: tokens.accessToken,
        refreshToken: tokens.refreshToken
      }
    });

    // Update user login info
    await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        lastLoginIp: credentials.ipAddress,
        failedAttempts: 0,
        lockedUntil: null
      }
    });

    return { user, tokens };
  }

  async refreshToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    try {
      const decoded = jwt.verify(refreshToken, config.JWT_REFRESH_SECRET) as RefreshTokenPayload;

      const session = await prisma.session.findUnique({
        where: { id: decoded.sessionId },
        include: { user: true }
      });

      if (!session || session.refreshToken !== refreshToken) {
        throw new Error('Invalid refresh token');
      }

      if (session.expiresAt < new Date()) {
        throw new Error('Session expired');
      }

      const tokens = this.generateTokens({
        userId: session.user.id,
        organizationId: session.user.organizationId,
        role: session.user.role,
        sessionId: session.id
      }, session.id);

      // Update session with new tokens
      await prisma.session.update({
        where: { id: session.id },
        data: {
          token: tokens.accessToken,
          refreshToken: tokens.refreshToken
        }
      });

      return tokens;
    } catch (error: any) {
      // Preserve specific error messages
      if (error.message === 'Session expired') {
        throw error;
      }
      throw new Error('Invalid refresh token');
    }
  }

  async logout(sessionId: string): Promise<void> {
    await prisma.session.delete({
      where: { id: sessionId }
    });
  }

  async logoutAllSessions(userId: string): Promise<void> {
    await prisma.session.deleteMany({
      where: { userId }
    });
  }

  async verifyToken(token: string): Promise<TokenPayload> {
    try {
      const decoded = jwt.verify(token, config.JWT_SECRET) as TokenPayload;

      // Skip session validation for test tokens
      if (process.env.NODE_ENV === 'test' && (decoded as any).isTestToken === true) {
        return decoded;
      }

      // Verify session exists and is valid
      const session = await prisma.session.findUnique({
        where: { id: decoded.sessionId }
      });

      if (!session || session.token !== token) {
        throw new Error('Invalid token');
      }

      if (session.expiresAt < new Date()) {
        throw new Error('Session expired');
      }

      return decoded;
    } catch (error: any) {
      // Preserve specific error messages
      if (error.message === 'Session expired') {
        throw error;
      }
      throw new Error('Invalid token');
    }
  }

  async changePassword(userId: string, oldPassword: string, newPassword: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new Error('User not found');
    }

    const isValidPassword = await verifyPassword(oldPassword, user.passwordHash);
    if (!isValidPassword) {
      throw new Error('Invalid current password');
    }

    // Validate new password strength
    const passwordValidation = validatePasswordStrength(newPassword);
    if (!passwordValidation.valid) {
      throw new Error(`New password does not meet security requirements: ${passwordValidation.errors.join(', ')}`);
    }

    const newPasswordHash = await hashPassword(newPassword);

    // Check password history
    const isPasswordUnique = await this.checkPasswordHistory(userId, newPassword);
    if (!isPasswordUnique) {
      throw new Error('Cannot reuse any of your last 5 passwords. Please choose a different password.');
    }

    await prisma.$transaction(async (tx) => {
      // Set password expiration to 90 days from now
      const passwordExpiresAt = new Date();
      passwordExpiresAt.setDate(passwordExpiresAt.getDate() + 90);

      // Update password
      await tx.user.update({
        where: { id: userId },
        data: {
          passwordHash: newPasswordHash,
          passwordExpiresAt
        }
      });

      // Save to password history
      await tx.passwordHistory.create({
        data: {
          userId,
          passwordHash: newPasswordHash
        }
      });

      // Keep only last 5 passwords
      const allPasswords = await tx.passwordHistory.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: 5
      });

      if (allPasswords.length > 0) {
        await tx.passwordHistory.deleteMany({
          where: {
            id: {
              in: allPasswords.map(p => p.id)
            }
          }
        });
      }

      // Invalidate all sessions (security event)
      await tx.session.deleteMany({
        where: { userId }
      });
    });

    // Log security event
    await auditService.logAction({
      action: 'PASSWORD_CHANGED' as any,
      entityType: 'User',
      entityId: userId,
      changes: {
        sessionsRevoked: 'all',
        passwordChanged: true
      },
      context: {
        userId,
        organizationId: user.organizationId
      }
    });
  }

  async resetPasswordRequest(email: string): Promise<string> {
    // Email is globally unique - use findUnique for optimal performance
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (!user || !user.isActive || user.deletedAt) {
      // Don't reveal if user exists or account status
      return 'If an account exists, a reset link has been sent';
    }

    const resetToken = generateRandomToken();
    const resetExpires = new Date(Date.now() + 3600000); // 1 hour

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: resetToken,
        passwordResetExpires: resetExpires
      }
    });

    return resetToken;
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const user = await prisma.user.findFirst({
      where: {
        passwordResetToken: token,
        passwordResetExpires: { gt: new Date() }
      }
    });

    if (!user) {
      throw new Error('Invalid or expired reset token');
    }

    // Validate new password strength
    const passwordValidation = validatePasswordStrength(newPassword);
    if (!passwordValidation.valid) {
      throw new Error(`Password does not meet security requirements: ${passwordValidation.errors.join(', ')}`);
    }

    // Check password history
    const isPasswordUnique = await this.checkPasswordHistory(user.id, newPassword);
    if (!isPasswordUnique) {
      throw new Error('Cannot reuse any of your last 5 passwords. Please choose a different password.');
    }

    const passwordHash = await hashPassword(newPassword);

    await prisma.$transaction(async (tx) => {
      // Set password expiration to 90 days from now
      const passwordExpiresAt = new Date();
      passwordExpiresAt.setDate(passwordExpiresAt.getDate() + 90);

      // Update password and clear reset token
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          passwordResetToken: null,
          passwordResetExpires: null,
          passwordExpiresAt
        }
      });

      // Save to password history
      await tx.passwordHistory.create({
        data: {
          userId: user.id,
          passwordHash
        }
      });

      // Keep only last 5 passwords
      const allPasswords = await tx.passwordHistory.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        skip: 5
      });

      if (allPasswords.length > 0) {
        await tx.passwordHistory.deleteMany({
          where: {
            id: {
              in: allPasswords.map(p => p.id)
            }
          }
        });
      }

      // Invalidate all sessions (security event)
      await tx.session.deleteMany({
        where: { userId: user.id }
      });
    });

    // Log security event
    await auditService.logAction({
      action: 'PASSWORD_RESET' as any,
      entityType: 'User',
      entityId: user.id,
      changes: {
        sessionsRevoked: 'all',
        passwordReset: true
      },
      context: {
        userId: user.id,
        organizationId: user.organizationId
      }
    });
  }

  /**
   * Create session with enhanced security tracking
   */
  private async createSession(userId: string, ipAddress: string, userAgent: string): Promise<Session> {
    const expiresAt = new Date(Date.now() + this.SESSION_DURATION_MS);

    return prisma.session.create({
      data: {
        userId,
        token: generateRandomToken(32),
        refreshToken: generateRandomToken(32),
        ipAddress,
        userAgent,
        deviceFingerprint: 'legacy', // For backwards compatibility
        deviceInfo: JSON.stringify({ userAgent }),
        lastActivityAt: new Date(),
        expiresAt
      }
    });
  }

  /**
   * Create session with full Request object for fingerprinting
   */
  private async createSessionWithRequest(
    userId: string,
    ipAddress: string,
    userAgent: string,
    req: Request
  ): Promise<Session> {
    const expiresAt = new Date(Date.now() + this.SESSION_DURATION_MS);
    const deviceFingerprint = this.generateDeviceFingerprint(req);
    const deviceInfo = this.extractDeviceInfo(req);

    return prisma.session.create({
      data: {
        userId,
        token: generateRandomToken(32),
        refreshToken: generateRandomToken(32),
        ipAddress,
        userAgent,
        deviceFingerprint,
        deviceInfo,
        lastActivityAt: new Date(),
        expiresAt
      }
    });
  }

  private generateTokens(payload: TokenPayload, sessionId: string): { accessToken: string; refreshToken: string } {
    // Add unique identifier to ensure tokens are always different
    const tokenPayload = {
      ...payload,
      jti: generateRandomToken(8), // Add unique JWT ID
      iat: Math.floor(Date.now() / 1000) // Explicit issued at time
    };

    const accessToken = jwt.sign(tokenPayload, config.JWT_SECRET, {
      expiresIn: config.JWT_EXPIRES_IN
    } as jwt.SignOptions);

    const refreshPayload: RefreshTokenPayload = {
      userId: payload.userId,
      sessionId,
      tokenFamily: generateRandomToken(16),
      jti: generateRandomToken(8) // Add unique JWT ID for refresh token too
    };

    const refreshToken = jwt.sign(refreshPayload, config.JWT_REFRESH_SECRET, {
      expiresIn: config.JWT_REFRESH_EXPIRES_IN
    } as jwt.SignOptions);

    return { accessToken, refreshToken };
  }

  private async incrementFailedAttempts(userId: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) return;

    const failedAttempts = user.failedAttempts + 1;
    const updates: any = { failedAttempts };

    // Lock account after 5 failed attempts
    if (failedAttempts >= 5) {
      updates.lockedUntil = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

      // Log security event
      await auditService.logAction({
        action: 'ACCOUNT_LOCKED' as any,
        entityType: 'User',
        entityId: userId,
        changes: {
          failedAttempts,
          lockedUntil: updates.lockedUntil
        },
        context: {
          userId,
          organizationId: user.organizationId
        }
      });
    }

    await prisma.user.update({
      where: { id: userId },
      data: updates
    });
  }
}

export const authService = new AuthService();
