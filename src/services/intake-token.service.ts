import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { prisma } from '../config/database';
import { IntakeSession } from '@prisma/client';
import { logger } from '../utils/logger';

/**
 * IntakeTokenService
 *
 * Handles token generation, validation, and lifecycle management
 * for the public intake workflow.
 *
 * Security Features:
 * - Cryptographically secure random token generation (384 bits entropy)
 * - bcrypt hashing with cost factor 12
 * - IP binding for token validation
 * - Token expiration (48 hours default, 7 days max)
 * - Request counting and rate limiting per token
 */
export class IntakeTokenService {
  private readonly TOKEN_LENGTH = 48; // 48 bytes = 384 bits entropy
  private readonly BCRYPT_ROUNDS = 12; // High security, acceptable performance
  private readonly DEFAULT_EXPIRATION_HOURS = 48;
  private readonly MAX_LIFETIME_DAYS = 7;

  /**
   * Generate a new cryptographically secure token
   * Returns base64url-encoded string for URL safety
   */
  public generateToken(): string {
    const buffer = crypto.randomBytes(this.TOKEN_LENGTH);
    return buffer.toString('base64url'); // URL-safe base64
  }

  /**
   * Hash a token using bcrypt for secure storage
   */
  public async hashToken(token: string): Promise<string> {
    return bcrypt.hash(token, this.BCRYPT_ROUNDS);
  }

  /**
   * Verify a token against its hashed version
   */
  public async verifyToken(token: string, hashedToken: string): Promise<boolean> {
    return bcrypt.compare(token, hashedToken);
  }

  /**
   * Create a new intake session with token
   */
  public async createSession(data: {
    email: string;
    ipAddress: string;
    userAgent?: string;
    origin?: string;
    fingerprint?: string;
  }): Promise<{ session: IntakeSession; token: string }> {
    const token = this.generateToken();
    const tokenHash = await this.hashToken(token);

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + this.DEFAULT_EXPIRATION_HOURS);

    // Create session
    const session = await prisma.intakeSession.create({
      data: {
        tokenHash,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        origin: data.origin,
        fingerprint: data.fingerprint,
        expiresAt,
        currentStep: 'PROFILE_TYPE', // Email already captured
        completedSteps: JSON.stringify(['EMAIL_CAPTURE']),
        customerData: {
          create: {
            email: data.email, // Will be encrypted by field encryption service
            completionPercentage: 10
          }
        }
      },
      include: {
        customerData: true,
        quoteData: true
      }
    });

    logger.info('Intake session created', {
      sessionId: session.id,
      ipAddress: data.ipAddress,
      email: data.email.substring(0, 3) + '***' // Partial logging for privacy
    });

    return { session, token };
  }

  /**
   * Validate and retrieve session by token
   */
  public async validateToken(
    token: string,
    ipAddress: string
  ): Promise<IntakeSession | null> {
    try {
      // Get all active sessions for this IP (optimization)
      const sessions = await prisma.intakeSession.findMany({
        where: {
          ipAddress,
          status: 'ACTIVE',
          expiresAt: { gte: new Date() },
          deletedAt: null
        },
        include: {
          customerData: true,
          quoteData: true
        }
      });

      // Try to match token against sessions
      for (const session of sessions) {
        const isValid = await this.verifyToken(token, session.tokenHash);
        if (isValid) {
          // Update session activity
          const updatedSession = await this.updateSessionActivity(session.id);
          return updatedSession;
        }
      }

      logger.warn('Token validation failed', { ipAddress });
      return null;

    } catch (error) {
      logger.error('Token validation error', { error, ipAddress });
      return null;
    }
  }

  /**
   * Update session activity (last activity time and request count)
   */
  private async updateSessionActivity(sessionId: string): Promise<IntakeSession> {
    return prisma.intakeSession.update({
      where: { id: sessionId },
      data: {
        lastActivityAt: new Date(),
        requestCount: { increment: 1 }
      },
      include: {
        customerData: true,
        quoteData: true
      }
    });
  }

  /**
   * Extend session expiration (called on activity)
   * Maximum lifetime is 7 days from creation
   */
  public async extendSession(sessionId: string): Promise<void> {
    const session = await prisma.intakeSession.findUnique({
      where: { id: sessionId }
    });

    if (!session) return;

    // Calculate new expiration (48 hours from now)
    const newExpiration = new Date();
    newExpiration.setHours(newExpiration.getHours() + this.DEFAULT_EXPIRATION_HOURS);

    // Calculate maximum allowed expiration (7 days from creation)
    const maxExpiration = new Date(session.createdAt);
    maxExpiration.setDate(maxExpiration.getDate() + this.MAX_LIFETIME_DAYS);

    // Use the earlier of the two dates
    const expiresAt = newExpiration < maxExpiration ? newExpiration : maxExpiration;

    await prisma.intakeSession.update({
      where: { id: sessionId },
      data: { expiresAt }
    });
  }

  /**
   * Invalidate session (mark as expired or completed)
   */
  public async invalidateSession(
    sessionId: string,
    reason: 'COMPLETED' | 'EXPIRED' | 'BLOCKED'
  ): Promise<void> {
    await prisma.intakeSession.update({
      where: { id: sessionId },
      data: {
        status: reason,
        expiresAt: new Date() // Expire immediately
      }
    });

    logger.info('Session invalidated', { sessionId, reason });
  }

  /**
   * Cleanup expired sessions (cron job)
   * Soft delete sessions that have expired
   */
  public async cleanupExpiredSessions(): Promise<number> {
    const now = new Date();

    const result = await prisma.intakeSession.updateMany({
      where: {
        expiresAt: { lt: now },
        status: 'ACTIVE',
        deletedAt: null
      },
      data: {
        status: 'EXPIRED',
        deletedAt: now
      }
    });

    logger.info('Expired sessions cleaned up', { count: result.count });
    return result.count;
  }

  /**
   * Cleanup abandoned sessions (24+ hours of inactivity)
   */
  public async cleanupAbandonedSessions(): Promise<number> {
    const abandonmentThreshold = new Date();
    abandonmentThreshold.setHours(abandonmentThreshold.getHours() - 24);

    const result = await prisma.intakeSession.updateMany({
      where: {
        lastActivityAt: { lt: abandonmentThreshold },
        status: 'ACTIVE',
        deletedAt: null
      },
      data: {
        status: 'ABANDONED'
      }
    });

    logger.info('Abandoned sessions marked', { count: result.count });
    return result.count;
  }

  /**
   * Hard delete old sessions (GDPR compliance)
   * Delete completed sessions older than 7 days
   * Delete expired/abandoned sessions older than 90 days
   */
  public async deleteOldSessions(): Promise<{ completed: number; expired: number }> {
    const now = new Date();

    // Delete completed sessions older than 7 days
    const completedThreshold = new Date(now);
    completedThreshold.setDate(completedThreshold.getDate() - 7);

    const completedResult = await prisma.intakeSession.deleteMany({
      where: {
        status: 'COMPLETED',
        convertedAt: { lt: completedThreshold }
      }
    });

    // Delete expired/abandoned sessions older than 90 days
    const expiredThreshold = new Date(now);
    expiredThreshold.setDate(expiredThreshold.getDate() - 90);

    const expiredResult = await prisma.intakeSession.deleteMany({
      where: {
        status: { in: ['EXPIRED', 'ABANDONED'] },
        updatedAt: { lt: expiredThreshold }
      }
    });

    logger.info('Old sessions deleted', {
      completed: completedResult.count,
      expired: expiredResult.count
    });

    return {
      completed: completedResult.count,
      expired: expiredResult.count
    };
  }

  /**
   * Get session statistics for monitoring
   */
  public async getSessionStatistics(): Promise<{
    active: number;
    completed: number;
    expired: number;
    abandoned: number;
    blocked: number;
    averageCompletionTime: number;
    conversionRate: number;
  }> {
    const [
      active,
      completed,
      expired,
      abandoned,
      blocked,
      completedSessions
    ] = await Promise.all([
      prisma.intakeSession.count({ where: { status: 'ACTIVE' } }),
      prisma.intakeSession.count({ where: { status: 'COMPLETED' } }),
      prisma.intakeSession.count({ where: { status: 'EXPIRED' } }),
      prisma.intakeSession.count({ where: { status: 'ABANDONED' } }),
      prisma.intakeSession.count({ where: { status: 'BLOCKED' } }),
      prisma.intakeSession.findMany({
        where: { status: 'COMPLETED', convertedAt: { not: null } },
        select: {
          sessionStartedAt: true,
          convertedAt: true
        }
      })
    ]);

    // Calculate average completion time
    let totalCompletionTime = 0;
    for (const session of completedSessions) {
      if (session.convertedAt) {
        const duration = session.convertedAt.getTime() - session.sessionStartedAt.getTime();
        totalCompletionTime += duration;
      }
    }

    const averageCompletionTime = completedSessions.length > 0
      ? Math.round(totalCompletionTime / completedSessions.length / 1000 / 60) // minutes
      : 0;

    // Calculate conversion rate
    const total = active + completed + expired + abandoned + blocked;
    const conversionRate = total > 0 ? Math.round((completed / total) * 100 * 100) / 100 : 0;

    return {
      active,
      completed,
      expired,
      abandoned,
      blocked,
      averageCompletionTime,
      conversionRate
    };
  }
}

export const intakeTokenService = new IntakeTokenService();