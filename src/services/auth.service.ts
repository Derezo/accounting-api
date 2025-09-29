import jwt from 'jsonwebtoken';
import {  User, Session } from '@prisma/client';
import { config } from '../config/config';
import { hashPassword, verifyPassword, generateRandomToken, verifyOTP } from '../utils/crypto';
import { UserRole } from '../types/enums';



import { prisma } from '../config/database';
interface TokenPayload {
  userId: string;
  organizationId: string;
  role: string;
  sessionId: string;
  jti?: string;
  iat?: number;
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
  async register(data: RegisterData): Promise<{ user: User; organization: any; tokens: any }> {
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email }
    });

    if (existingUser) {
      throw new Error('User with this email already exists');
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

      // Create user
      const user = await tx.user.create({
        data: {
          email: data.email,
          passwordHash,
          firstName: data.firstName,
          lastName: data.lastName,
          organizationId: organization.id,
          role: UserRole.ADMIN,
          isActive: true,
          emailVerified: false
        }
      });

      // Create initial session within transaction
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const session = await tx.session.create({
        data: {
          userId: user.id,
          token: '',
          refreshToken: '',
          ipAddress: '127.0.0.1',
          userAgent: 'registration',
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
    const user = await prisma.user.findUnique({
      where: { email: credentials.email },
      include: { organization: true }
    });

    if (!user || !user.isActive) {
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

    // Create session
    const session = await this.createSession(
      user.id,
      credentials.ipAddress,
      credentials.userAgent || ''
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

    const newPasswordHash = await hashPassword(newPassword);

    await prisma.$transaction(async (tx) => {
      // Update password
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash: newPasswordHash }
      });

      // Invalidate all sessions
      await tx.session.deleteMany({
        where: { userId }
      });
    });
  }

  async resetPasswordRequest(email: string): Promise<string> {
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      // Don't reveal if user exists
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

    const passwordHash = await hashPassword(newPassword);

    await prisma.$transaction(async (tx) => {
      // Update password and clear reset token
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          passwordResetToken: null,
          passwordResetExpires: null
        }
      });

      // Invalidate all sessions
      await tx.session.deleteMany({
        where: { userId: user.id }
      });
    });
  }

  private async createSession(userId: string, ipAddress: string, userAgent: string): Promise<Session> {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    return prisma.session.create({
      data: {
        userId,
        token: generateRandomToken(32),
        refreshToken: generateRandomToken(32),
        ipAddress,
        userAgent,
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
    }

    await prisma.user.update({
      where: { id: userId },
      data: updates
    });
  }
}

export const authService = new AuthService();