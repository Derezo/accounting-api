import { rateLimit, RateLimitRequestHandler } from 'express-rate-limit';

/**
 * Rate limit middleware factory
 * Creates rate limiters for different endpoints
 */
export function rateLimitMiddleware(options: {
  windowMs?: number;
  max?: number;
  message?: string;
}): RateLimitRequestHandler {
  return rateLimit({
    windowMs: options.windowMs || 15 * 60 * 1000, // 15 minutes by default
    max: options.max || 100, // 100 requests by default
    message: options.message || 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    // Use IP address for identification
    keyGenerator: (req) => {
      return req.ip || req.socket.remoteAddress || 'unknown';
    }
  });
}