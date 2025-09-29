import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';

/**
 * Validation middleware that processes express-validator results
 * Returns 400 with validation errors if validation fails
 */
export const validateRequest = (req: Request, res: Response, next: NextFunction): void => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    res.status(400).json({
      error: 'Validation failed',
      message: 'Request validation errors occurred',
      details: errors.array().map(error => ({
        field: error.type === 'field' ? error.path : 'unknown',
        message: error.msg,
        value: error.type === 'field' ? error.value : undefined,
        location: error.type === 'field' ? error.location : undefined
      }))
    });
    return;
  }

  next();
};

/**
 * Optional validation middleware that logs warnings but doesn't block requests
 * Useful for non-critical validations that should not break API functionality
 */
export const validateRequestWithWarnings = (req: Request, res: Response, next: NextFunction): void => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    // Log warnings for monitoring
    console.warn('Request validation warnings:', {
      path: req.path,
      method: req.method,
      errors: errors.array()
    });

    // Add warnings to request for potential inclusion in response
    req.validationWarnings = errors.array();
  }

  next();
};

// Extend Express Request interface to include validation warnings
declare global {
  namespace Express {
    interface Request {
      validationWarnings?: any[];
    }
  }
}

// Alias for compatibility
export const validate = validateRequest;