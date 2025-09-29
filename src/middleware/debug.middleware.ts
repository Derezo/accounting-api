import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

let requestCounter = 0;

export const debugMiddleware = (name: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const requestId = ++requestCounter;
    const startTime = Date.now();

    logger.info(`[DEBUG ${requestId}] ${name} START`, {
      method: req.method,
      url: req.url,
      path: req.path,
      params: req.params,
      query: req.query
    });

    // Track when response finishes
    const originalSend = res.send;
    res.send = function(data: any): Response {
      const duration = Date.now() - startTime;
      logger.info(`[DEBUG ${requestId}] ${name} RESPONSE`, {
        duration: `${duration}ms`,
        statusCode: res.statusCode
      });
      return originalSend.call(this, data);
    };

    // Track when json response finishes
    const originalJson = res.json;
    res.json = function(data: any): Response {
      const duration = Date.now() - startTime;
      logger.info(`[DEBUG ${requestId}] ${name} JSON RESPONSE`, {
        duration: `${duration}ms`,
        statusCode: res.statusCode
      });
      return originalJson.call(this, data);
    };

    // Call next middleware
    next();

    const afterNext = Date.now() - startTime;
    logger.info(`[DEBUG ${requestId}] ${name} NEXT CALLED`, {
      duration: `${afterNext}ms`
    });
  };
};

// Specific middleware to trace organization validation
export const debugOrganizationMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const startTime = Date.now();
  logger.info('[DEBUG] Organization middleware START', {
    method: req.method,
    url: req.url,
    params: req.params,
    organizationId: req.params.organizationId,
    headers: {
      authorization: req.headers.authorization ? 'Bearer ***' : 'none'
    }
  });

  const originalNext = next;
  next = ((err?: any) => {
    const duration = Date.now() - startTime;
    if (err) {
      logger.error('[DEBUG] Organization middleware ERROR', {
        duration: `${duration}ms`,
        error: err.message || err
      });
    } else {
      logger.info('[DEBUG] Organization middleware COMPLETE', {
        duration: `${duration}ms`
      });
    }
    originalNext(err);
  }) as NextFunction;

  next();
};