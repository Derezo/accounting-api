import { Request } from 'express';
import { prisma } from '../config/database';
import { IntakeSession } from '@prisma/client';
import { logger } from '../utils/logger';

export type SuspicionLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface BotDetectionResult {
  isBot: boolean;
  suspicionScore: number;
  level: SuspicionLevel;
  triggeredRules: string[];
  action: 'ALLOW' | 'CHALLENGE' | 'BLOCK';
}

/**
 * IntakeBotDetectionService
 *
 * Sophisticated bot detection using multiple techniques:
 * - Honeypot field validation
 * - Timing analysis (too fast or too slow)
 * - User agent validation
 * - Behavioral pattern analysis
 * - Request pattern analysis
 */
export class IntakeBotDetectionService {
  // Bot detection configuration
  private readonly MIN_FORM_COMPLETION_TIME_SECONDS = 3;
  private readonly MAX_FORM_COMPLETION_TIME_SECONDS = 600; // 10 minutes
  private readonly MIN_STEP_INTERVAL_SECONDS = 1;
  private readonly MAX_STEP_INTERVAL_SECONDS = 300; // 5 minutes

  private readonly BOT_USER_AGENTS = [
    /bot/i,
    /crawler/i,
    /spider/i,
    /scraper/i,
    /curl/i,
    /wget/i,
    /python-requests/i,
    /java/i,
    /go-http-client/i
  ];

  private readonly DISPOSABLE_EMAIL_DOMAINS = [
    'tempmail.com',
    '10minutemail.com',
    'guerrillamail.com',
    'mailinator.com',
    'throwaway.email',
    'temp-mail.org'
  ];

  /**
   * Comprehensive bot detection check
   */
  public async detectBot(req: Request, session?: IntakeSession): Promise<BotDetectionResult> {
    const triggeredRules: string[] = [];
    let suspicionScore = 0;

    // 1. Check honeypot field
    const honeypotResult = this.checkHoneypot(req.body);
    if (!honeypotResult.passed) {
      triggeredRules.push('HONEYPOT_TRIGGERED');
      suspicionScore += 50;
    }

    // 2. Check user agent
    const userAgentResult = this.checkUserAgent(req.headers['user-agent']);
    if (!userAgentResult.passed) {
      triggeredRules.push('BOT_USER_AGENT');
      suspicionScore += 40;
    }

    // 3. Check timing if session exists
    if (session) {
      const timingResult = this.checkTiming(session);
      if (!timingResult.passed) {
        triggeredRules.push(timingResult.rule || 'TIMING_ANOMALY');
        suspicionScore += timingResult.score || 20;
      }

      // 4. Check behavioral patterns
      const behaviorResult = this.checkBehavior(session);
      if (!behaviorResult.passed) {
        triggeredRules.push('SUSPICIOUS_BEHAVIOR');
        suspicionScore += 15;
      }

      // 5. Check request patterns
      const requestResult = this.checkRequestPattern(session);
      if (!requestResult.passed) {
        triggeredRules.push('SUSPICIOUS_REQUEST_PATTERN');
        suspicionScore += 10;
      }
    }

    // 6. Check email domain (if provided)
    if (req.body.email) {
      const emailResult = this.checkEmailDomain(req.body.email);
      if (!emailResult.passed) {
        triggeredRules.push('DISPOSABLE_EMAIL');
        suspicionScore += 25;
      }
    }

    // Determine level and action
    const level = this.getSuspicionLevel(suspicionScore);
    const action = this.determineAction(level);
    const isBot = suspicionScore >= 50;

    // Log detection result
    if (suspicionScore > 25) {
      await this.logSecurityEvent({
        sessionId: session?.id,
        eventType: isBot ? 'BOT_DETECTED' : 'SUSPICIOUS_ACTIVITY',
        severity: level,
        description: `Suspicion score: ${suspicionScore}, Rules: ${triggeredRules.join(', ')}`,
        ruleTriggered: triggeredRules.join(','),
        ipAddress: req.ip || 'unknown',
        userAgent: req.headers['user-agent'],
        requestPath: req.path,
        requestMethod: req.method,
        actionTaken: action,
        blocked: action === 'BLOCK'
      });
    }

    return {
      isBot,
      suspicionScore,
      level,
      triggeredRules,
      action
    };
  }

  /**
   * Check honeypot field
   */
  private checkHoneypot(body: any): { passed: boolean } {
    // Check if honeypot field exists and is empty
    const honeypotField = body.honeypot_field_name || body.website || body.url;

    if (honeypotField && honeypotField !== '') {
      return { passed: false };
    }

    return { passed: true };
  }

  /**
   * Check user agent for bot signatures
   */
  private checkUserAgent(userAgent: string | undefined): { passed: boolean } {
    if (!userAgent) {
      return { passed: false };
    }

    for (const pattern of this.BOT_USER_AGENTS) {
      if (pattern.test(userAgent)) {
        return { passed: false };
      }
    }

    return { passed: true };
  }

  /**
   * Check timing patterns
   */
  private checkTiming(session: IntakeSession): { passed: boolean; rule?: string; score?: number } {
    const now = Date.now();
    const sessionStartTime = session.sessionStartedAt.getTime();
    const lastActivityTime = session.lastActivityAt.getTime();

    // Parse step timings
    let stepTimings: Record<string, { startTime: number; endTime?: number }> = {};
    if (session.stepTimings) {
      try {
        stepTimings = JSON.parse(session.stepTimings);
      } catch {
        // Invalid JSON, ignore
      }
    }

    // Check if form completed too fast
    const totalTime = (now - sessionStartTime) / 1000; // seconds
    if (totalTime < this.MIN_FORM_COMPLETION_TIME_SECONDS) {
      return { passed: false, rule: 'TIMING_TOO_FAST', score: 30 };
    }

    // Check if individual steps are too fast
    for (const [step, timing] of Object.entries(stepTimings)) {
      if (timing.endTime) {
        const duration = (timing.endTime - timing.startTime) / 1000;
        if (duration < this.MIN_STEP_INTERVAL_SECONDS) {
          return { passed: false, rule: 'STEP_TOO_FAST', score: 25 };
        }
      }
    }

    // Check if session is suspiciously consistent in timing
    const intervals: number[] = [];
    const stepTimes = Object.values(stepTimings)
      .filter(t => t.endTime)
      .map(t => t.endTime! - t.startTime);

    if (stepTimes.length >= 3) {
      const avgTime = stepTimes.reduce((a, b) => a + b, 0) / stepTimes.length;
      const variance = stepTimes.reduce((sum, time) => {
        return sum + Math.pow(time - avgTime, 2);
      }, 0) / stepTimes.length;
      const stdDev = Math.sqrt(variance);

      // Bots have very low variance in timing
      if (stdDev < 100) { // Less than 100ms standard deviation
        return { passed: false, rule: 'TIMING_TOO_CONSISTENT', score: 20 };
      }
    }

    return { passed: true };
  }

  /**
   * Check behavioral patterns
   */
  private checkBehavior(session: IntakeSession): { passed: boolean } {
    // Humans typically have varied request patterns
    const requestCount = session.requestCount;
    const completedSteps = this.parseCompletedSteps(session.completedSteps);

    // Check for unrealistic completion rate
    const sessionDuration = Date.now() - session.sessionStartedAt.getTime();
    const stepsPerMinute = (completedSteps.length / sessionDuration) * 60000;

    if (stepsPerMinute > 10) { // More than 10 steps per minute
      return { passed: false };
    }

    // Check if no corrections/back navigation
    // Humans typically go back or make corrections
    // This would require tracking navigation history (future enhancement)

    return { passed: true };
  }

  /**
   * Check request pattern
   */
  private checkRequestPattern(session: IntakeSession): { passed: boolean } {
    const requestCount = session.requestCount;
    const completedSteps = this.parseCompletedSteps(session.completedSteps);

    // Bots often have perfect 1:1 request to step ratio
    // Humans make multiple requests per step (validation, corrections, etc.)
    if (requestCount === completedSteps.length && requestCount > 3) {
      return { passed: false };
    }

    return { passed: true };
  }

  /**
   * Check email domain for disposable emails
   */
  private checkEmailDomain(email: string): { passed: boolean } {
    const domain = email.split('@')[1]?.toLowerCase();

    if (!domain) {
      return { passed: false };
    }

    if (this.DISPOSABLE_EMAIL_DOMAINS.includes(domain)) {
      return { passed: false };
    }

    return { passed: true };
  }

  /**
   * Get suspicion level from score
   */
  private getSuspicionLevel(score: number): SuspicionLevel {
    if (score >= 75) return 'CRITICAL';
    if (score >= 50) return 'HIGH';
    if (score >= 25) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Determine action based on suspicion level
   */
  private determineAction(level: SuspicionLevel): 'ALLOW' | 'CHALLENGE' | 'BLOCK' {
    switch (level) {
      case 'CRITICAL':
        return 'BLOCK';
      case 'HIGH':
        return 'CHALLENGE'; // Require CAPTCHA
      case 'MEDIUM':
        return 'ALLOW'; // Allow but with increased monitoring
      case 'LOW':
        return 'ALLOW';
    }
  }

  /**
   * Update session suspicion score
   */
  public async updateSuspicionScore(sessionId: string, additionalScore: number, rule: string): Promise<void> {
    const session = await prisma.intakeSession.findUnique({
      where: { id: sessionId }
    });

    if (!session) return;

    const newScore = Math.min(100, session.suspicionScore + additionalScore);
    const botFlags = this.parseBotFlags(session.botFlags);
    botFlags.push(rule);

    await prisma.intakeSession.update({
      where: { id: sessionId },
      data: {
        suspicionScore: newScore,
        botFlags: JSON.stringify(botFlags)
      }
    });

    // Block if score exceeds threshold
    if (newScore >= 75) {
      await prisma.intakeSession.update({
        where: { id: sessionId },
        data: { status: 'BLOCKED' }
      });

      logger.warn('Session blocked due to high suspicion score', {
        sessionId,
        score: newScore,
        flags: botFlags
      });
    }
  }

  /**
   * Log security event
   */
  private async logSecurityEvent(data: {
    sessionId?: string;
    eventType: string;
    severity: string;
    description: string;
    ruleTriggered?: string;
    ipAddress: string;
    userAgent?: string;
    requestPath?: string;
    requestMethod?: string;
    actionTaken: string;
    blocked: boolean;
  }): Promise<void> {
    try {
      await prisma.intakeSecurityEvent.create({
        data: {
          sessionId: data.sessionId || null,
          eventType: data.eventType,
          severity: data.severity,
          description: data.description,
          ruleTriggered: data.ruleTriggered,
          ipAddress: data.ipAddress,
          userAgent: data.userAgent,
          requestPath: data.requestPath,
          requestMethod: data.requestMethod,
          actionTaken: data.actionTaken,
          blocked: data.blocked
        }
      });
    } catch (error) {
      logger.error('Failed to log security event', { error, data });
    }
  }

  /**
   * Parse completed steps JSON
   */
  private parseCompletedSteps(completedSteps: string): string[] {
    try {
      return JSON.parse(completedSteps);
    } catch {
      return [];
    }
  }

  /**
   * Parse bot flags JSON
   */
  private parseBotFlags(botFlags: string | null): string[] {
    if (!botFlags) return [];
    try {
      return JSON.parse(botFlags);
    } catch {
      return [];
    }
  }
}

export const intakeBotDetectionService = new IntakeBotDetectionService();