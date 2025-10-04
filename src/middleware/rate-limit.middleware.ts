import { rateLimit, RateLimitRequestHandler } from 'express-rate-limit';
import { auditService } from '../services/audit.service';
import { AuditAction } from '../types/enums';
import { Request } from 'express';

/**
 * Production safety check: E2E_TESTING must not be enabled in production
 * CRITICAL: This check prevents rate limiting bypass in production
 */
const isProduction = process.env.NODE_ENV === 'production';
const e2eTestingEnabled = ['true', '1', 'yes', 'on', 'TRUE', 'YES', 'ON'].includes(
  String(process.env.E2E_TESTING || '').toLowerCase()
);

if (isProduction && e2eTestingEnabled) {
  const errorMessage =
    'CRITICAL SECURITY ERROR: E2E_TESTING cannot be enabled in production environment. ' +
    'This would disable rate limiting and create a critical security vulnerability. ' +
    `Current values: NODE_ENV=${process.env.NODE_ENV}, E2E_TESTING=${process.env.E2E_TESTING}`;

  console.error(errorMessage);
  process.exit(1);
}

// Warn when E2E_TESTING is enabled
if (e2eTestingEnabled) {
  console.warn(
    '⚠️  WARNING: E2E_TESTING mode is ACTIVE - Rate limiting is relaxed\n' +
    `   Environment: ${process.env.NODE_ENV}\n` +
    '   Login rate limit: 1000 attempts per 15 minutes\n' +
    '   Localhost rate limiting: DISABLED\n' +
    '   This mode should ONLY be used for automated testing'
  );
}

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
    // Skip rate limiting in test environment
    skip: (req) => process.env.NODE_ENV === 'test',
    // Use IP address for identification
    keyGenerator: (req) => {
      return req.ip || req.socket.remoteAddress || 'unknown';
    }
  });
}

/**
 * Aggressive rate limiting for login endpoint
 * 5 attempts per 15 minutes per IP (production)
 * 1000 attempts per 15 minutes (E2E testing mode)
 *
 * Enable E2E testing mode: E2E_TESTING=true
 */
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: e2eTestingEnabled ? 1000 : 5, // Permissive for E2E tests
  message: 'Too many login attempts from this IP, please try again after 15 minutes',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip for unit tests
    if (process.env.NODE_ENV === 'test') return true;

    // Skip for localhost during E2E testing
    if (e2eTestingEnabled) {
      const ip = req.ip || req.socket.remoteAddress || '';

      // Comprehensive localhost check
      const localhostIPs = [
        '127.0.0.1',           // IPv4 localhost
        '::1',                 // IPv6 localhost
        '::ffff:127.0.0.1',    // IPv4-mapped IPv6 localhost
        '0.0.0.0',             // All interfaces (Docker)
        '::ffff:0.0.0.0',      // IPv4-mapped IPv6 all interfaces
        'localhost'            // String representation
      ];

      const isLocalhost = localhostIPs.some(localIP =>
        ip === localIP || ip.startsWith(localIP)
      );

      return isLocalhost;
    }

    return false;
  },
  keyGenerator: (req) => {
    return req.ip || req.socket.remoteAddress || 'unknown';
  },
  handler: (req, res) => {
    // Log security event for rate limit exceeded
    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    // Attempt to log to audit service (non-blocking)
    auditService.logAction({
      action: AuditAction.LOGIN,
      entityType: 'Auth',
      entityId: 'login',
      details: {
        reason: 'RATE_LIMIT_EXCEEDED',
        endpoint: '/auth/login',
        email: (req.body)?.email || 'unknown'
      },
      context: {
        organizationId: 'system', // System-level audit
        ipAddress,
        userAgent,
        requestId: req.headers['x-request-id'] as string
      }
    }).catch(err => {
      console.error('Failed to log rate limit security event:', err);
    });

    res.status(429).json({
      error: 'Too many login attempts from this IP, please try again after 15 minutes',
      retryAfter: 900 // 15 minutes in seconds
    });
  }
});

/**
 * Aggressive rate limiting for registration endpoint
 * 3 attempts per hour per IP
 */
export const registerRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  message: 'Too many registration attempts from this IP, please try again after 1 hour',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV === 'test',
  keyGenerator: (req) => {
    return req.ip || req.socket.remoteAddress || 'unknown';
  },
  handler: (req, res) => {
    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    // Log security event for rate limit exceeded
    auditService.logAction({
      action: AuditAction.CREATE,
      entityType: 'Auth',
      entityId: 'register',
      details: {
        reason: 'RATE_LIMIT_EXCEEDED',
        endpoint: '/auth/register',
        email: (req.body)?.email || 'unknown'
      },
      context: {
        organizationId: 'system',
        ipAddress,
        userAgent,
        requestId: req.headers['x-request-id'] as string
      }
    }).catch(err => {
      console.error('Failed to log rate limit security event:', err);
    });

    res.status(429).json({
      error: 'Too many registration attempts from this IP, please try again after 1 hour',
      retryAfter: 3600 // 1 hour in seconds
    });
  }
});

/**
 * Aggressive rate limiting for password reset endpoint
 * 3 attempts per hour per IP
 */
export const passwordResetRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  message: 'Too many password reset attempts from this IP, please try again after 1 hour',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV === 'test',
  keyGenerator: (req) => {
    return req.ip || req.socket.remoteAddress || 'unknown';
  },
  handler: (req, res) => {
    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    // Log security event for rate limit exceeded
    auditService.logAction({
      action: AuditAction.UPDATE,
      entityType: 'Auth',
      entityId: 'password-reset',
      details: {
        reason: 'RATE_LIMIT_EXCEEDED',
        endpoint: '/auth/reset-password-request',
        email: (req.body)?.email || 'unknown'
      },
      context: {
        organizationId: 'system',
        ipAddress,
        userAgent,
        requestId: req.headers['x-request-id'] as string
      }
    }).catch(err => {
      console.error('Failed to log rate limit security event:', err);
    });

    res.status(429).json({
      error: 'Too many password reset attempts from this IP, please try again after 1 hour',
      retryAfter: 3600 // 1 hour in seconds
    });
  }
});
/**
 * Payment portal rate limiting - general viewing/listing
 * 20 requests per minute per IP
 */
export const paymentPortalRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20,
  message: 'Too many payment portal requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV === 'test',
  keyGenerator: (req) => {
    return req.ip || req.socket.remoteAddress || 'unknown';
  },
  handler: (req, res) => {
    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    auditService.logAction({
      action: AuditAction.VIEW,
      entityType: 'PaymentPortal',
      entityId: 'rate-limit',
      details: {
        reason: 'RATE_LIMIT_EXCEEDED',
        endpoint: req.path
      },
      context: {
        organizationId: 'public',
        ipAddress,
        userAgent,
        requestId: req.headers['x-request-id'] as string
      }
    }).catch(err => {
      console.error('Failed to log rate limit event:', err);
    });

    res.status(429).json({
      error: 'Too many payment portal requests, please try again later',
      retryAfter: 60
    });
  }
});

/**
 * Payment action rate limiting - payment intent creation, confirmations
 * 5 payment actions per minute per IP
 */
export const paymentActionRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  message: 'Too many payment attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV === 'test',
  keyGenerator: (req) => {
    return req.ip || req.socket.remoteAddress || 'unknown';
  },
  handler: (req, res) => {
    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    auditService.logAction({
      action: AuditAction.CREATE,
      entityType: 'PaymentIntent',
      entityId: 'rate-limit',
      details: {
        reason: 'RATE_LIMIT_EXCEEDED',
        endpoint: req.path,
        severity: 'HIGH'
      },
      context: {
        organizationId: 'public',
        ipAddress,
        userAgent,
        requestId: req.headers['x-request-id'] as string
      }
    }).catch(err => {
      console.error('Failed to log rate limit event:', err);
    });

    res.status(429).json({
      error: 'Too many payment attempts, please try again later',
      retryAfter: 60
    });
  }
});

/**
 * Payment method management rate limiting
 * 5 method changes per minute per IP
 */
export const paymentMethodRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  message: 'Too many payment method changes, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV === 'test',
  keyGenerator: (req) => {
    return req.ip || req.socket.remoteAddress || 'unknown';
  },
  handler: (req, res) => {
    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    auditService.logAction({
      action: AuditAction.UPDATE,
      entityType: 'PaymentMethod',
      entityId: 'rate-limit',
      details: {
        reason: 'RATE_LIMIT_EXCEEDED',
        endpoint: req.path
      },
      context: {
        organizationId: 'public',
        ipAddress,
        userAgent,
        requestId: req.headers['x-request-id'] as string
      }
    }).catch(err => {
      console.error('Failed to log rate limit event:', err);
    });

    res.status(429).json({
      error: 'Too many payment method changes, please try again later',
      retryAfter: 60
    });
  }
});
