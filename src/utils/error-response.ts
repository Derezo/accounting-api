import { Response } from 'express';
import { ValidationError } from 'express-validator';

export interface StandardErrorResponse {
  error: string;
  message: string;
  code: string;
  timestamp: string;
  details?: ValidationError[] | Record<string, any>;
  requestId?: string;
}

export class ErrorResponseUtil {
  /**
   * Send a standardized error response
   */
  static sendError(
    res: Response,
    statusCode: number,
    error: string,
    message: string,
    code: string,
    details?: ValidationError[] | Record<string, any>,
    requestId?: string
  ): void {
    const errorResponse: StandardErrorResponse = {
      error,
      message,
      code,
      timestamp: new Date().toISOString(),
      ...(details && { details }),
      ...(requestId && { requestId })
    };

    res.status(statusCode).json(errorResponse);
  }

  /**
   * Send validation error response (400)
   */
  static sendValidationError(
    res: Response,
    details: ValidationError[],
    requestId?: string
  ): void {
    this.sendError(
      res,
      400,
      'Validation Error',
      'The request contains invalid parameters',
      'VALIDATION_ERROR',
      details,
      requestId
    );
  }

  /**
   * Send authentication error response (401)
   */
  static sendAuthenticationError(
    res: Response,
    message: string = 'Authentication required',
    requestId?: string
  ): void {
    this.sendError(
      res,
      401,
      'Authentication Error',
      message,
      'AUTHENTICATION_ERROR',
      undefined,
      requestId
    );
  }

  /**
   * Send authorization error response (403)
   */
  static sendAuthorizationError(
    res: Response,
    message: string = 'Access denied',
    requestId?: string
  ): void {
    this.sendError(
      res,
      403,
      'Authorization Error',
      message,
      'AUTHORIZATION_ERROR',
      undefined,
      requestId
    );
  }

  /**
   * Send not found error response (404)
   */
  static sendNotFoundError(
    res: Response,
    resource: string,
    requestId?: string
  ): void {
    this.sendError(
      res,
      404,
      'Not Found',
      `${resource} not found`,
      'NOT_FOUND',
      undefined,
      requestId
    );
  }

  /**
   * Send conflict error response (409)
   */
  static sendConflictError(
    res: Response,
    message: string,
    requestId?: string
  ): void {
    this.sendError(
      res,
      409,
      'Conflict',
      message,
      'CONFLICT_ERROR',
      undefined,
      requestId
    );
  }

  /**
   * Send business logic error response (422)
   */
  static sendBusinessLogicError(
    res: Response,
    message: string,
    details?: Record<string, any>,
    requestId?: string
  ): void {
    this.sendError(
      res,
      422,
      'Business Logic Error',
      message,
      'BUSINESS_LOGIC_ERROR',
      details,
      requestId
    );
  }

  /**
   * Send rate limit error response (429)
   */
  static sendRateLimitError(
    res: Response,
    message: string = 'Too many requests',
    requestId?: string
  ): void {
    this.sendError(
      res,
      429,
      'Rate Limit Exceeded',
      message,
      'RATE_LIMIT_ERROR',
      undefined,
      requestId
    );
  }

  /**
   * Send internal server error response (500)
   */
  static sendInternalServerError(
    res: Response,
    message: string = 'Internal server error',
    requestId?: string
  ): void {
    this.sendError(
      res,
      500,
      'Internal Server Error',
      message,
      'INTERNAL_SERVER_ERROR',
      undefined,
      requestId
    );
  }

  /**
   * Send service unavailable error response (503)
   */
  static sendServiceUnavailableError(
    res: Response,
    message: string = 'Service temporarily unavailable',
    requestId?: string
  ): void {
    this.sendError(
      res,
      503,
      'Service Unavailable',
      message,
      'SERVICE_UNAVAILABLE',
      undefined,
      requestId
    );
  }
}

/**
 * Error codes for frontend reference
 */
export const ErrorCodes = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR: 'AUTHORIZATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT_ERROR: 'CONFLICT_ERROR',
  BUSINESS_LOGIC_ERROR: 'BUSINESS_LOGIC_ERROR',
  RATE_LIMIT_ERROR: 'RATE_LIMIT_ERROR',
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',

  // Domain-specific error codes
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  QUOTE_EXPIRED: 'QUOTE_EXPIRED',
  INVOICE_ALREADY_PAID: 'INVOICE_ALREADY_PAID',
  TAX_CALCULATION_ERROR: 'TAX_CALCULATION_ERROR',
  ENCRYPTION_ERROR: 'ENCRYPTION_ERROR',
  ORGANIZATION_LIMIT_EXCEEDED: 'ORGANIZATION_LIMIT_EXCEEDED',
  CUSTOMER_LIFECYCLE_VIOLATION: 'CUSTOMER_LIFECYCLE_VIOLATION'
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];