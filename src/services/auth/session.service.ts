import { Session } from '@prisma/client';
import { prisma } from '../../config/database';
import { generateRandomToken } from '../../utils/crypto';
import { logger } from '../../utils/logger';
import { NotFoundError, AuthenticationError } from '../../utils/errors';

export interface CreateSessionData {
  userId: string;
  ipAddress: string;
  userAgent: string;
  expiresAt?: Date;
}

export interface SessionWithUser extends Session {
  user: {
    id: string;
    organizationId: string;
    role: string;
    email: string;
    isActive: boolean;
  };
}

/**
 * Service responsible for user session management
 */
export class SessionService {
  /**
   * Create a new user session
   */
  async createSession(data: CreateSessionData): Promise<Session> {
    const expiresAt = data.expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days default

    try {
      const session = await prisma.session.create({
        data: {
          userId: data.userId,
          token: generateRandomToken(32),
          refreshToken: generateRandomToken(32),
          ipAddress: data.ipAddress,
          userAgent: data.userAgent,
          expiresAt
        }
      });

      logger.info('Session created', {
        sessionId: session.id,
        userId: data.userId,
        ipAddress: data.ipAddress,
        expiresAt: expiresAt.toISOString()
      });

      return session;
    } catch (error) {
      logger.error('Failed to create session', {
        userId: data.userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Get session by ID with user information
   */
  async getSessionWithUser(sessionId: string): Promise<SessionWithUser | null> {
    try {
      const session = await prisma.session.findUnique({
        where: { id: sessionId },
        include: {
          user: {
            select: {
              id: true,
              organizationId: true,
              role: true,
              email: true,
              isActive: true
            }
          }
        }
      });

      return session as SessionWithUser | null;
    } catch (error) {
      logger.error('Failed to get session', {
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Update session tokens
   */
  async updateSessionTokens(
    sessionId: string,
    accessToken: string,
    refreshToken: string
  ): Promise<Session> {
    try {
      const session = await prisma.session.update({
        where: { id: sessionId },
        data: {
          token: accessToken,
          refreshToken: refreshToken
        }
      });

      logger.debug('Session tokens updated', { sessionId });
      return session;
    } catch (error) {
      logger.error('Failed to update session tokens', {
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Validate session and check expiration
   */
  async validateSession(sessionId: string, token: string): Promise<SessionWithUser> {
    const session = await this.getSessionWithUser(sessionId);

    if (!session) {
      throw new NotFoundError('Session', sessionId);
    }

    if (session.token !== token) {
      logger.warn('Session token mismatch', {
        sessionId,
        expectedTokenPrefix: session.token.substring(0, 10) + '...',
        providedTokenPrefix: token.substring(0, 10) + '...'
      });
      throw new AuthenticationError('Invalid session token');
    }

    if (session.expiresAt < new Date()) {
      logger.info('Session expired', {
        sessionId,
        expiresAt: session.expiresAt.toISOString()
      });
      throw new AuthenticationError('Session expired');
    }

    if (!session.user.isActive) {
      logger.warn('Session for inactive user', {
        sessionId,
        userId: session.user.id
      });
      throw new AuthenticationError('User account is inactive');
    }

    return session;
  }

  /**
   * Validate refresh token and return session
   */
  async validateRefreshToken(sessionId: string, refreshToken: string): Promise<SessionWithUser> {
    const session = await this.getSessionWithUser(sessionId);

    if (!session) {
      throw new NotFoundError('Session', sessionId);
    }

    if (session.refreshToken !== refreshToken) {
      logger.warn('Refresh token mismatch', {
        sessionId,
        userId: session.user.id
      });
      throw new AuthenticationError('Invalid refresh token');
    }

    if (session.expiresAt < new Date()) {
      logger.info('Session expired during refresh', {
        sessionId,
        expiresAt: session.expiresAt.toISOString()
      });
      throw new AuthenticationError('Session expired');
    }

    return session;
  }

  /**
   * Delete a specific session
   */
  async deleteSession(sessionId: string): Promise<void> {
    try {
      await prisma.session.delete({
        where: { id: sessionId }
      });

      logger.info('Session deleted', { sessionId });
    } catch (error) {
      logger.error('Failed to delete session', {
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Delete all sessions for a user
   */
  async deleteAllUserSessions(userId: string): Promise<number> {
    try {
      const result = await prisma.session.deleteMany({
        where: { userId }
      });

      logger.info('All user sessions deleted', {
        userId,
        deletedCount: result.count
      });

      return result.count;
    } catch (error) {
      logger.error('Failed to delete user sessions', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions(): Promise<number> {
    try {
      const result = await prisma.session.deleteMany({
        where: {
          expiresAt: {
            lt: new Date()
          }
        }
      });

      logger.info('Expired sessions cleaned up', {
        deletedCount: result.count
      });

      return result.count;
    } catch (error) {
      logger.error('Failed to cleanup expired sessions', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Get active sessions for a user
   */
  async getUserActiveSessions(userId: string): Promise<Session[]> {
    try {
      const sessions = await prisma.session.findMany({
        where: {
          userId,
          expiresAt: {
            gt: new Date()
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      return sessions;
    } catch (error) {
      logger.error('Failed to get user sessions', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Update session activity (last accessed time and IP)
   */
  async updateSessionActivity(sessionId: string, ipAddress?: string): Promise<void> {
    try {
      await prisma.session.update({
        where: { id: sessionId },
        data: {
          ...(ipAddress && { ipAddress })
        }
      });

      logger.debug('Session activity updated', { sessionId, ipAddress });
    } catch (error) {
      logger.error('Failed to update session activity', {
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      // Don't throw here - this is not critical for functionality
    }
  }

  /**
   * Get session statistics
   */
  async getSessionStats(): Promise<{
    total: number;
    active: number;
    expired: number;
  }> {
    try {
      const now = new Date();

      const [total, active] = await Promise.all([
        prisma.session.count(),
        prisma.session.count({
          where: {
            expiresAt: {
              gt: now
            }
          }
        })
      ]);

      return {
        total,
        active,
        expired: total - active
      };
    } catch (error) {
      logger.error('Failed to get session stats', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }
}

export const sessionService = new SessionService();