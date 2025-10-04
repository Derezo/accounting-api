import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { ZodSchema, ZodError } from 'zod';

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

/**
 * Zod validation middleware that validates request body, query, or params
 * @param schema - Zod schema to validate against
 * @param source - Which part of request to validate ('body', 'query', 'params')
 */
export const validateZod = (schema: ZodSchema, source: 'body' | 'query' | 'params' = 'body') => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const data = source === 'body' ? req.body : source === 'query' ? req.query : req.params;
      const validated = schema.parse(data);

      // Replace request data with validated data
      if (source === 'body') {
        req.body = validated;
      } else if (source === 'query') {
        req.query = validated;
      } else {
        req.params = validated;
      }

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          error: 'Validation failed',
          message: 'Request validation errors occurred',
          details: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
            code: err.code
          }))
        });
        return;
      }
      next(error);
    }
  };
};