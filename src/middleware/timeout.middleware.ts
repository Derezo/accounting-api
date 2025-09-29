import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export interface TimeoutOptions {
  timeout: number; // timeout in milliseconds
  message?: string;
}

export function timeoutMiddleware(options: TimeoutOptions = { timeout: 30000 }) {
  const { timeout, message = 'Request timeout' } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    const timer = setTimeout(() => {
      if (!res.headersSent) {
        logger.error('Request timeout', {
          method: req.method,
          url: req.url,
          path: req.path,
          query: req.query,
          timeout: `${timeout}ms`
        });

        res.status(504).json({
          error: 'Request Timeout',
          message: message,
          code: 'REQUEST_TIMEOUT',
          timeout: `${timeout}ms`
        });
      }
    }, timeout);

    // Clear timeout when response finishes
    res.on('finish', () => {
      clearTimeout(timer);
    });

    // Clear timeout on response close
    res.on('close', () => {
      clearTimeout(timer);
    });

    next();
  };
}

// Specific timeout for database operations
export function databaseTimeoutMiddleware() {
  return timeoutMiddleware({
    timeout: 10000, // 10 seconds for database operations
    message: 'Database operation timeout'
  });
}

// Specific timeout for payment operations
export function paymentTimeoutMiddleware() {
  return timeoutMiddleware({
    timeout: 20000, // 20 seconds for payment operations
    message: 'Payment operation timeout'
  });
}