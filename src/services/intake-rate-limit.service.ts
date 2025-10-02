import { Request } from 'express';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfter?: number;
}

export interface RateLimitConfig {
  limit: number;
  windowMs: number;
  keyPrefix?: string;
}

/**
 * IntakeRateLimitService
 *
 * Multi-tier rate limiting for public intake API:
 * - IP-based limits (most aggressive)
 * - Token-based limits
 * - Action-specific limits
 * - Global limits
 *
 * Uses in-memory storage for performance (can be extended to Redis)
 */
export class IntakeRateLimitService {
  // In-memory rate limit store
  // Format: Map<key, { count: number, resetAt: Date }>
  private store: Map<string, { count: number; resetAt: Date }> = new Map();

  // Rate limit configurations
  private readonly LIMITS = {
    // IP-based limits
    ip: {
      initialize: { limit: 5, windowMs: 60 * 60 * 1000 }, // 5 per hour
      step: { limit: 10, windowMs: 60 * 1000 }, // 10 per minute
      status: { limit: 30, windowMs: 60 * 1000 }, // 30 per minute
      submit: { limit: 2, windowMs: 60 * 60 * 1000 }, // 2 per hour
      total: { limit: 100, windowMs: 60 * 60 * 1000 } // 100 per hour
    },
    // Token-based limits
    token: {
      step: { limit: 50, windowMs: Infinity }, // 50 per lifetime
      status: { limit: 200, windowMs: Infinity }, // 200 per lifetime
      submit: { limit: 1, windowMs: Infinity } // 1 per lifetime
    }
  };

  /**
   * Check IP-based rate limit
   */
  public async checkIpLimit(
    ipAddress: string,
    action: 'initialize' | 'step' | 'status' | 'submit' | 'total'
  ): Promise<RateLimitResult> {
    const config = this.LIMITS.ip[action];
    const key = `ip:${action}:${ipAddress}`;

    return this.checkLimit(key, config);
  }

  /**
   * Check token-based rate limit
   */
  public async checkTokenLimit(
    sessionId: string,
    action: 'step' | 'status' | 'submit'
  ): Promise<RateLimitResult> {
    const config = this.LIMITS.token[action];
    const key = `token:${action}:${sessionId}`;

    // For lifetime limits, get actual count from database
    if (config.windowMs === Infinity) {
      return this.checkLifetimeLimit(sessionId, action, config.limit);
    }

    return this.checkLimit(key, config);
  }

  /**
   * Generic rate limit check
   */
  private checkLimit(key: string, config: RateLimitConfig): RateLimitResult {
    const now = new Date();
    const entry = this.store.get(key);

    // No entry or expired window
    if (!entry || entry.resetAt < now) {
      const resetAt = new Date(now.getTime() + config.windowMs);
      this.store.set(key, { count: 1, resetAt });

      return {
        allowed: true,
        remaining: config.limit - 1,
        resetAt
      };
    }

    // Within window
    if (entry.count < config.limit) {
      entry.count++;
      this.store.set(key, entry);

      return {
        allowed: true,
        remaining: config.limit - entry.count,
        resetAt: entry.resetAt
      };
    }

    // Limit exceeded
    const retryAfter = Math.ceil((entry.resetAt.getTime() - now.getTime()) / 1000);

    logger.warn('Rate limit exceeded', {
      key,
      limit: config.limit,
      retryAfter
    });

    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
      retryAfter
    };
  }

  /**
   * Check lifetime limit (stored in database)
   */
  private async checkLifetimeLimit(
    sessionId: string,
    action: 'step' | 'status' | 'submit',
    limit: number
  ): Promise<RateLimitResult> {
    const session = await prisma.intakeSession.findUnique({
      where: { id: sessionId }
    });

    if (!session) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: new Date()
      };
    }

    let currentCount = 0;

    switch (action) {
      case 'step':
      case 'status':
        currentCount = session.requestCount;
        break;
      case 'submit':
        currentCount = session.submissionAttempts;
        break;
    }

    if (currentCount >= limit) {
      logger.warn('Lifetime rate limit exceeded', {
        sessionId,
        action,
        currentCount,
        limit
      });

      return {
        allowed: false,
        remaining: 0,
        resetAt: session.expiresAt
      };
    }

    return {
      allowed: true,
      remaining: limit - currentCount - 1,
      resetAt: session.expiresAt
    };
  }

  /**
   * Increment submission attempt counter
   */
  public async incrementSubmissionAttempt(sessionId: string): Promise<void> {
    await prisma.intakeSession.update({
      where: { id: sessionId },
      data: {
        submissionAttempts: { increment: 1 }
      }
    });
  }

  /**
   * Reduce rate limits for suspicious IPs
   */
  public reduceLimitsForIp(ipAddress: string, factor: number): void {
    // Apply reduction factor to all IP limits
    // This is called when suspicious activity is detected
    const actions: Array<'initialize' | 'step' | 'status' | 'submit' | 'total'> = [
      'initialize',
      'step',
      'status',
      'submit',
      'total'
    ];

    for (const action of actions) {
      const key = `ip:${action}:${ipAddress}`;
      const entry = this.store.get(key);

      if (entry) {
        // Reduce remaining capacity
        const reducedLimit = Math.floor(this.LIMITS.ip[action].limit * factor);
        if (entry.count > reducedLimit) {
          entry.count = reducedLimit;
          this.store.set(key, entry);
        }
      }
    }

    logger.info('Rate limits reduced for suspicious IP', { ipAddress, factor });
  }

  /**
   * Block IP temporarily
   */
  public async blockIp(ipAddress: string, durationMs: number): Promise<void> {
    const key = `ip:blocked:${ipAddress}`;
    const resetAt = new Date(Date.now() + durationMs);

    this.store.set(key, {
      count: Number.MAX_SAFE_INTEGER, // Effectively infinite
      resetAt
    });

    // Log security event
    await prisma.intakeSecurityEvent.create({
      data: {
        eventType: 'IP_BLOCKED',
        severity: 'HIGH',
        description: `IP temporarily blocked for ${Math.round(durationMs / 1000 / 60)} minutes`,
        ipAddress,
        actionTaken: 'BLOCKED',
        blocked: true
      }
    });

    logger.warn('IP temporarily blocked', {
      ipAddress,
      durationMinutes: Math.round(durationMs / 1000 / 60)
    });
  }

  /**
   * Check if IP is blocked
   */
  public isIpBlocked(ipAddress: string): boolean {
    const key = `ip:blocked:${ipAddress}`;
    const entry = this.store.get(key);

    if (!entry) return false;

    const now = new Date();
    if (entry.resetAt < now) {
      // Block expired
      this.store.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Get rate limit headers for response
   */
  public getRateLimitHeaders(result: RateLimitResult, limitType: string): Record<string, string> {
    return {
      'X-RateLimit-Limit': result.remaining.toString(),
      'X-RateLimit-Remaining': result.remaining.toString(),
      'X-RateLimit-Reset': Math.floor(result.resetAt.getTime() / 1000).toString(),
      'X-RateLimit-Type': limitType,
      ...(result.retryAfter && { 'Retry-After': result.retryAfter.toString() })
    };
  }

  /**
   * Cleanup expired entries (periodic maintenance)
   */
  public cleanup(): number {
    const now = new Date();
    let cleaned = 0;

    for (const [key, entry] of this.store.entries()) {
      if (entry.resetAt < now) {
        this.store.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info('Rate limit store cleaned', { entriesRemoved: cleaned });
    }

    return cleaned;
  }

  /**
   * Get rate limit statistics
   */
  public getStatistics(): {
    totalKeys: number;
    blockedIps: number;
    activeRateLimits: number;
  } {
    const now = new Date();
    let blockedIps = 0;
    let activeRateLimits = 0;

    for (const [key, entry] of this.store.entries()) {
      if (entry.resetAt >= now) {
        activeRateLimits++;
        if (key.startsWith('ip:blocked:')) {
          blockedIps++;
        }
      }
    }

    return {
      totalKeys: this.store.size,
      blockedIps,
      activeRateLimits
    };
  }
}

export const intakeRateLimitService = new IntakeRateLimitService();