import { User } from '@prisma/client';
import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { verifyOTP } from '../../utils/crypto';
import {
  InvalidCredentialsError,
  NotFoundError,
  AuthenticationError,
  BusinessRuleError
} from '../../utils/errors';

// Import the focused services
import { tokenService, TokenPayload, TokenPair } from './token.service';
import { sessionService, SessionWithUser } from './session.service';
import { passwordService } from './password.service';

export interface LoginCredentials {
  email: string;
  password: string;
  twoFactorCode?: string;
  ipAddress: string;
  userAgent?: string;
}

export interface RegisterData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  organizationName: string;
  organizationDomain?: string;
}

export interface LoginResult {
  user: User;
  tokens: TokenPair;
  sessionId: string;
}

export interface RegisterResult {
  user: User;
  organization: any;
  tokens: TokenPair;
  sessionId: string;
}

/**
 * Refactored AuthService following Single Responsibility Principle
 * Orchestrates authentication workflows using focused services
 */
export class AuthService {
  /**
   * Register a new user and organization
   */
  async register(data: RegisterData): Promise<RegisterResult> {
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email.toLowerCase() }
    });

    if (existingUser) {
      throw new BusinessRuleError('User with this email already exists', 'DUPLICATE_EMAIL');
    }

    // Hash password using password service
    const passwordHash = await passwordService.hashPasswordSecure(data.password);

    const result = await prisma.$transaction(async (tx) => {
      // Create organization
      const organization = await tx.organization.create({
        data: {
          name: data.organizationName,
          domain: data.organizationDomain,
          email: data.email,
          phone: '',
          type: 'SINGLE_BUSINESS',
          encryptionKey: 'temp_key_' + Date.now()
        }
      });

      // Create user
      const user = await tx.user.create({
        data: {
          email: data.email.toLowerCase(),
          passwordHash,
          firstName: data.firstName,
          lastName: data.lastName,
          organizationId: organization.id,
          role: 'ADMIN',
          isActive: true,
          emailVerified: false
        }
      });

      return { user, organization };
    });

    // Create session and generate tokens
    const session = await sessionService.createSession({
      userId: result.user.id,
      ipAddress: '127.0.0.1', // Default for registration
      userAgent: 'registration'
    });

    const tokens = tokenService.generateTokens({
      userId: result.user.id,
      organizationId: result.organization.id,
      role: result.user.role,
      sessionId: session.id
    }, session.id);

    // Update session with tokens
    await sessionService.updateSessionTokens(session.id, tokens.accessToken, tokens.refreshToken);

    logger.info('User registered successfully', {
      userId: result.user.id,
      organizationId: result.organization.id,
      email: result.user.email
    });

    return {
      user: result.user,
      organization: result.organization,
      tokens,
      sessionId: session.id
    };
  }

  /**
   * Authenticate user login
   */
  async login(credentials: LoginCredentials): Promise<LoginResult> {
    const user = await prisma.user.findUnique({
      where: { email: credentials.email.toLowerCase() },
      include: { organization: true }
    });

    if (!user || !user.isActive) {
      logger.warn('Login attempt for non-existent or inactive user', {
        email: credentials.email,
        ipAddress: credentials.ipAddress
      });
      throw new InvalidCredentialsError();
    }

    // Verify password with lockout protection
    const isValidPassword = await passwordService.verifyPasswordWithLockout(
      user.id,
      credentials.password,
      user.passwordHash
    );

    if (!isValidPassword) {
      logger.warn('Invalid password for user login', {
        userId: user.id,
        email: user.email,
        ipAddress: credentials.ipAddress
      });
      throw new InvalidCredentialsError();
    }

    // Verify 2FA if enabled
    if (user.twoFactorEnabled) {
      if (!credentials.twoFactorCode) {
        throw new AuthenticationError('Two-factor authentication code required', {
          requiresTwoFactor: true
        });
      }

      if (!user.twoFactorSecret) {
        throw new BusinessRuleError(
          'Two-factor authentication not properly configured',
          'INVALID_2FA_CONFIG'
        );
      }

      const isValidOTP = verifyOTP(credentials.twoFactorCode, user.twoFactorSecret);
      if (!isValidOTP) {
        logger.warn('Invalid 2FA code provided', {
          userId: user.id,
          email: user.email,
          ipAddress: credentials.ipAddress
        });
        throw new AuthenticationError('Invalid two-factor authentication code');
      }
    }

    // Create session
    const session = await sessionService.createSession({
      userId: user.id,
      ipAddress: credentials.ipAddress,
      userAgent: credentials.userAgent || ''
    });

    // Generate tokens
    const tokens = tokenService.generateTokens({
      userId: user.id,
      organizationId: user.organizationId,
      role: user.role,
      sessionId: session.id
    }, session.id);

    // Update session with tokens
    await sessionService.updateSessionTokens(session.id, tokens.accessToken, tokens.refreshToken);

    // Update user login info
    await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        lastLoginIp: credentials.ipAddress,
        updatedAt: new Date()
      }
    });

    logger.info('User logged in successfully', {
      userId: user.id,
      email: user.email,
      ipAddress: credentials.ipAddress,
      sessionId: session.id
    });

    return {
      user,
      tokens,
      sessionId: session.id
    };
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(refreshToken: string): Promise<TokenPair> {
    // Verify refresh token
    const decoded = tokenService.verifyRefreshToken(refreshToken);

    // Validate session and refresh token
    const session = await sessionService.validateRefreshToken(decoded.sessionId, refreshToken);

    // Generate new tokens
    const tokens = tokenService.generateTokens({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      role: session.user.role,
      sessionId: session.id
    }, session.id);

    // Update session with new tokens
    await sessionService.updateSessionTokens(session.id, tokens.accessToken, tokens.refreshToken);

    logger.info('Tokens refreshed successfully', {
      userId: session.user.id,
      sessionId: session.id
    });

    return tokens;
  }

  /**
   * Verify access token and return payload
   */
  async verifyToken(token: string): Promise<TokenPayload & { sessionValid: boolean }> {
    // Verify token signature and decode
    const decoded = tokenService.verifyAccessToken(token);

    // Validate session
    const session = await sessionService.validateSession(decoded.sessionId, token);

    // Update session activity
    await sessionService.updateSessionActivity(decoded.sessionId);

    return {
      ...decoded,
      sessionValid: true
    };
  }

  /**
   * Logout user (delete session)
   */
  async logout(sessionId: string): Promise<void> {
    await sessionService.deleteSession(sessionId);

    logger.info('User logged out', { sessionId });
  }

  /**
   * Logout all sessions for a user
   */
  async logoutAllSessions(userId: string): Promise<number> {
    const deletedCount = await sessionService.deleteAllUserSessions(userId);

    logger.info('All user sessions logged out', {
      userId,
      deletedCount
    });

    return deletedCount;
  }

  /**
   * Change user password
   */
  async changePassword(
    userId: string,
    oldPassword: string,
    newPassword: string,
    ipAddress?: string
  ): Promise<void> {
    await passwordService.changePassword({
      userId,
      currentPassword: oldPassword,
      newPassword,
      ipAddress
    });

    logger.info('Password changed via AuthService', { userId });
  }

  /**
   * Request password reset
   */
  async resetPasswordRequest(email: string, ipAddress?: string): Promise<string> {
    return passwordService.requestPasswordReset({
      email,
      ipAddress
    });
  }

  /**
   * Reset password using token
   */
  async resetPassword(token: string, newPassword: string, ipAddress?: string): Promise<void> {
    await passwordService.resetPassword({
      token,
      newPassword,
      ipAddress
    });

    logger.info('Password reset via AuthService');
  }

  /**
   * Get user sessions
   */
  async getUserSessions(userId: string): Promise<any[]> {
    const sessions = await sessionService.getUserActiveSessions(userId);

    return sessions.map(session => ({
      id: session.id,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt
    }));
  }

  /**
   * Get authentication statistics
   */
  async getAuthStats(): Promise<{
    sessions: { total: number; active: number; expired: number };
  }> {
    const sessionStats = await sessionService.getSessionStats();

    return {
      sessions: sessionStats
    };
  }

  /**
   * Cleanup expired data
   */
  async cleanupExpiredData(): Promise<{
    sessionsDeleted: number;
    resetTokensCleared: number;
  }> {
    const [sessionsDeleted, resetTokensCleared] = await Promise.all([
      sessionService.cleanupExpiredSessions(),
      passwordService.cleanupExpiredResetTokens()
    ]);

    logger.info('Authentication cleanup completed', {
      sessionsDeleted,
      resetTokensCleared
    });

    return {
      sessionsDeleted,
      resetTokensCleared
    };
  }
}

export const authService = new AuthService();