import { Response, NextFunction } from 'express';
import { IntakeRequest } from './intake-token.middleware';
import { intakeBotDetectionService } from '../services/intake-bot-detection.service';

/**
 * Middleware: Bot detection and prevention
 *
 * Analyzes incoming requests for bot-like behavior and blocks suspicious traffic.
 *
 * Scoring system:
 * - 0-49: Low risk - Allow
 * - 50-74: Medium risk - Challenge with CAPTCHA
 * - 75-100: High risk - Block
 *
 * Detection methods:
 * - Honeypot fields
 * - Timing analysis
 * - User agent validation
 * - Behavioral patterns
 */
export const botDetection = async (
  req: IntakeRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const session = req.intakeSession;

    // Analyze request for bot behavior
    const analysis = await intakeBotDetectionService.detectBot(req, session);

    // Log analysis results for monitoring
    if (analysis.suspicionScore >= 50) {
      console.warn('Bot detection alert:', {
        sessionId: session?.id,
        suspicionScore: analysis.suspicionScore,
        action: analysis.action,
        triggeredRules: analysis.triggeredRules
      });
    }

    // BLOCK: High suspicion score
    if (analysis.action === 'BLOCK') {
      res.status(403).json({
        error: 'SUSPICIOUS_ACTIVITY_DETECTED',
        message: 'Your request has been blocked due to suspicious activity.',
        suspicionScore: analysis.suspicionScore,
        triggeredRules: analysis.triggeredRules,
        contact: 'If you believe this is an error, please contact support@lifestreamdynamics.com'
      });
      return;
    }

    // CHALLENGE: Medium suspicion score
    if (analysis.action === 'CHALLENGE') {
      // For now, log and allow through
      // TODO: Implement CAPTCHA challenge in future iteration
      console.warn('Bot challenge recommended but not implemented yet:', {
        sessionId: session?.id,
        suspicionScore: analysis.suspicionScore
      });
    }

    // ALLOW: Low suspicion score or challenge passed - continue to next middleware
    next();
  } catch (error) {
    console.error('Bot detection middleware error:', error);

    // On error, fail open (allow request) to prevent false positives
    next();
  }
};

/**
 * Middleware: Block disposable emails (simple check)
 *
 * Blocks requests using known disposable email domains.
 * Use this on email capture endpoints.
 */
export const blockDisposableEmail = async (
  req: IntakeRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const email = req.body?.email || req.body?.customerData?.email;

    if (!email) {
      // No email in body, skip check
      next();
      return;
    }

    // Simple disposable email domain check
    const disposableDomains = [
      'tempmail.com', 'temp-mail.org', 'guerrillamail.com', 'mailinator.com',
      '10minutemail.com', 'throwaway.email', 'maildrop.cc'
    ];

    const emailDomain = email.toLowerCase().split('@')[1];
    const isDisposable = disposableDomains.includes(emailDomain);

    if (isDisposable) {
      res.status(400).json({
        error: 'DISPOSABLE_EMAIL_NOT_ALLOWED',
        message: 'Disposable or temporary email addresses are not allowed.',
        hint: 'Please use a permanent email address (e.g., Gmail, Outlook, company email)'
      });
      return;
    }

    next();
  } catch (error) {
    console.error('Disposable email check error:', error);

    // On error, fail open (allow request) to prevent false positives
    next();
  }
};