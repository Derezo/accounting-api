import { Request, Response, NextFunction } from 'express';
import { AppError, ErrorUtils } from '../utils/errors';
import { logger } from '../utils/logger';
import { config } from '../config/config';

/**
 * Global error handling middleware for Express
 * Should be the last middleware in the stack
 */
export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Log the error with request context
  const requestContext = {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: (req as any).user?.id,
    organizationId: (req as any).user?.organizationId,
    requestId: (req as any).requestId || req.get('X-Request-ID'),
    timestamp: new Date().toISOString()
  };

  ErrorUtils.logError(error, requestContext);

  // Check if response was already sent
  if (res.headersSent) {
    return next(error);
  }

  // Get status code and create error response
  const statusCode = ErrorUtils.getStatusCode(error);
  const errorResponse = ErrorUtils.createErrorResponse(
    error,
    config.NODE_ENV === 'development'
  );

  // Add request ID to response for debugging
  if (requestContext.requestId) {
    errorResponse.requestId = requestContext.requestId;
  }

  // Set security headers for error responses
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block'
  });

  // Send error response
  res.status(statusCode).json(errorResponse);
};

/**
 * Async error wrapper to catch errors in async route handlers
 */
export const asyncErrorHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * 404 Not Found handler
 */
export const notFoundHandler = (req: Request, res: Response): void => {
  const errorResponse = {
    error: 'ROUTE_NOT_FOUND',
    message: `Route ${req.method} ${req.url} not found`,
    statusCode: 404,
    timestamp: new Date().toISOString(),
    requestId: (req as any).requestId || req.get('X-Request-ID')
  };

  logger.warn('Route not found', {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString()
  });

  res.status(404).json(errorResponse);
};

/**
 * Validation error handler for express-validator
 */
export const validationErrorHandler = (
  errors: any[],
  req: Request,
  res: Response
): void => {
  const validationErrors = errors.map(error => ({
    field: error.path || error.param,
    message: error.msg,
    value: error.value,
    location: error.location
  }));

  const errorResponse = {
    error: 'VALIDATION_ERROR',
    message: 'Request validation failed',
    statusCode: 400,
    timestamp: new Date().toISOString(),
    details: {
      errors: validationErrors,
      count: validationErrors.length
    },
    requestId: (req as any).requestId || req.get('X-Request-ID')
  };

  logger.warn('Validation error', {
    method: req.method,
    url: req.url,
    errors: validationErrors,
    ip: req.ip,
    timestamp: new Date().toISOString()
  });

  res.status(400).json(errorResponse);
};

/**
 * Database error handler to convert Prisma errors to AppErrors
 */
export const handleDatabaseError = (error: any): AppError => {
  if (error.code) {
    switch (error.code) {
      case 'P2002': // Unique constraint violation
        const target = error.meta?.target || ['unknown'];
        const field = Array.isArray(target) ? target[0] : target;
        return new (require('../utils/errors').DuplicateResourceError)(
          'Resource',
          field,
          'duplicate value',
          { prismaError: error.code, meta: error.meta }
        );

      case 'P2025': // Record not found
        return new (require('../utils/errors').NotFoundError)(
          'Resource',
          undefined,
          { prismaError: error.code, meta: error.meta }
        );

      case 'P2003': // Foreign key constraint violation
        return new (require('../utils/errors').BusinessRuleError)(
          'Cannot perform operation due to related data constraints',
          'FOREIGN_KEY_CONSTRAINT',
          { prismaError: error.code, meta: error.meta }
        );

      case 'P2021': // Table does not exist
      case 'P2022': // Column does not exist
        return new (require('../utils/errors').DatabaseConnectionError)(
          'schema validation',
          { prismaError: error.code, meta: error.meta }
        );

      case 'P1001': // Can't reach database server
      case 'P1002': // Database server timeout
        return new (require('../utils/errors').DatabaseConnectionError)(
          'connection',
          { prismaError: error.code, meta: error.meta }
        );

      default:
        return new (require('../utils/errors').DatabaseConnectionError)(
          'unknown database operation',
          { prismaError: error.code, meta: error.meta }
        );
    }
  }

  // Generic database error
  return new (require('../utils/errors').DatabaseConnectionError)(
    'database operation',
    { originalError: error.message }
  );
};

/**
 * JWT error handler
 */
export const handleJWTError = (error: any): AppError => {
  const { TokenExpiredError, AuthenticationError } = require('../utils/errors');

  if (error.name === 'TokenExpiredError') {
    return new TokenExpiredError('JWT token', { jwtError: error.name });
  }

  if (error.name === 'JsonWebTokenError') {
    return new AuthenticationError('Invalid JWT token', { jwtError: error.name });
  }

  if (error.name === 'NotBeforeError') {
    return new AuthenticationError('JWT token not active yet', { jwtError: error.name });
  }

  return new AuthenticationError('JWT authentication failed', { jwtError: error.name });
};

/**
 * Rate limiting error handler
 */
export const handleRateLimitError = (req: Request, res: Response): void => {
  const { RateLimitError } = require('../utils/errors');

  const rateLimitInfo = {
    limit: res.get('X-RateLimit-Limit'),
    remaining: res.get('X-RateLimit-Remaining'),
    reset: res.get('X-RateLimit-Reset')
  };

  const error = new RateLimitError(
    parseInt(rateLimitInfo.limit || '100'),
    '15 minutes',
    {
      ip: req.ip,
      rateLimitInfo,
      endpoint: `${req.method} ${req.url}`
    }
  );

  const errorResponse = ErrorUtils.createErrorResponse(error);
  errorResponse.requestId = (req as any).requestId || req.get('X-Request-ID');

  // Add rate limit headers to error response
  res.set({
    'X-RateLimit-Limit': rateLimitInfo.limit || '100',
    'X-RateLimit-Remaining': '0',
    'X-RateLimit-Reset': rateLimitInfo.reset || Math.ceil(Date.now() / 1000 + 900).toString(),
    'Retry-After': '900' // 15 minutes
  });

  res.status(429).json(errorResponse);
};

/**
 * Multer file upload error handler
 */
export const handleMulterError = (error: any): AppError => {
  const { FileUploadError } = require('../utils/errors');

  if (error.code === 'LIMIT_FILE_SIZE') {
    return new FileUploadError('File size exceeds maximum allowed limit');
  }

  if (error.code === 'LIMIT_FILE_COUNT') {
    return new FileUploadError('Too many files uploaded');
  }

  if (error.code === 'LIMIT_UNEXPECTED_FILE') {
    return new FileUploadError('Unexpected field in file upload');
  }

  return new FileUploadError(error.message || 'File upload failed');
};

/**
 * Stripe/Payment provider error handler
 */
export const handlePaymentError = (error: any): AppError => {
  const { PaymentProviderError } = require('../utils/errors');

  if (error.type) {
    // Stripe error
    switch (error.type) {
      case 'StripeCardError':
        return new PaymentProviderError('Stripe', `Card error: ${error.message}`, {
          code: error.code,
          decline_code: error.decline_code,
          param: error.param
        });

      case 'StripeRateLimitError':
        return new PaymentProviderError('Stripe', 'Rate limit exceeded', {
          type: error.type
        });

      case 'StripeInvalidRequestError':
        return new PaymentProviderError('Stripe', `Invalid request: ${error.message}`, {
          param: error.param,
          type: error.type
        });

      case 'StripeAPIError':
      case 'StripeConnectionError':
      case 'StripeAuthenticationError':
        return new PaymentProviderError('Stripe', error.message, {
          type: error.type
        });

      default:
        return new PaymentProviderError('Stripe', error.message || 'Unknown payment error', {
          type: error.type
        });
    }
  }

  return new PaymentProviderError('Unknown', error.message || 'Payment processing failed');
};

/**
 * Error conversion middleware - converts common errors to AppErrors
 */
export const errorConverter = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  let convertedError = error;

  // Convert Prisma errors
  if (error.constructor.name.startsWith('Prisma')) {
    convertedError = handleDatabaseError(error);
  }
  // Convert JWT errors
  else if (['TokenExpiredError', 'JsonWebTokenError', 'NotBeforeError'].includes(error.name)) {
    convertedError = handleJWTError(error);
  }
  // Convert Multer errors
  else if (error.constructor.name === 'MulterError') {
    convertedError = handleMulterError(error);
  }
  // Convert Stripe errors
  else if (error.constructor.name.startsWith('Stripe')) {
    convertedError = handlePaymentError(error);
  }

  next(convertedError);
};

/**
 * Request ID middleware to track requests
 */
export const requestIdMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const requestId = req.get('X-Request-ID') ||
    `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  (req as any).requestId = requestId;
  res.set('X-Request-ID', requestId);

  next();
};