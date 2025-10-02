import { Request, Response, NextFunction } from 'express';
import { intakeRateLimitService } from '../services/intake-rate-limit.service';

/**
 * Middleware: Rate limit public intake endpoints
 *
 * Implements aggressive rate limiting for public-facing intake API:
 * - 5 session initializations per hour per IP
 * - 10 step updates per minute per IP
 * - 100 total requests per hour per IP
 * - 2 final submissions per hour per IP
 *
 * Returns 429 Too Many Requests when limits exceeded
 */
export const publicRateLimit = (limitType: 'initialize' | 'step' | 'status' | 'submit' | 'total') => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Skip rate limiting in test environment
      if (process.env.NODE_ENV === 'test') {
        return next();
      }

      const clientIp = req.ip || req.socket.remoteAddress || 'unknown';

      // Check rate limit for this IP
      const result = await intakeRateLimitService.checkIpLimit(clientIp, limitType);

      // Add rate limit headers
      res.setHeader('X-RateLimit-Remaining', result.remaining.toString());
      res.setHeader('X-RateLimit-Reset', result.resetAt.toISOString());

      if (!result.allowed) {
        const retryAfter = result.retryAfter || Math.ceil((result.resetAt.getTime() - Date.now()) / 1000);
        res.setHeader('Retry-After', retryAfter.toString());

        res.status(429).json({
          error: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests. Please try again later.',
          retryAfter: result.resetAt.toISOString(),
          resetAt: result.resetAt.toISOString()
        });
        return;
      }

      // Check if IP is temporarily banned
      const isBanned = intakeRateLimitService.isIpBlocked(clientIp);
      if (isBanned) {
        res.status(403).json({
          error: 'IP_BANNED',
          message: 'Your IP address has been temporarily banned due to suspicious activity.',
          details: 'If you believe this is an error, please contact support.'
        });
        return;
      }

      next();
    } catch (error) {
      // Log error but don't block request on rate limit service failure
      console.error('Rate limit middleware error:', error);
      next();
    }
  };
};

/**
 * Middleware: Rate limit by token
 *
 * Implements token-based rate limiting:
 * - 50 total updates per session lifetime
 * - 1 final submission per session
 */
export const tokenRateLimit = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Skip rate limiting in test environment
    if (process.env.NODE_ENV === 'test') {
      return next();
    }

    // Get session ID from request (attached by validateIntakeToken middleware)
    const sessionId = (req as any).intakeSession?.id;

    if (!sessionId) {
      return next(); // No session, skip token-based rate limiting
    }

    const limitType = req.path.includes('/submit') ? 'submit' : 'step';

    const result = await intakeRateLimitService.checkTokenLimit(sessionId, limitType);

    if (!result.allowed) {
      res.status(429).json({
        error: 'TOKEN_RATE_LIMIT_EXCEEDED',
        message: 'Too many requests with this token.',
        retryAfter: result.resetAt.toISOString()
      });
      return;
    }

    next();
  } catch (error) {
    console.error('Token rate limit middleware error:', error);
    next();
  }
};