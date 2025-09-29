import { logger } from './logger';

/**
 * Base application error class with enhanced error tracking
 */
export abstract class AppError extends Error {
  public readonly isOperational: boolean;
  public readonly statusCode: number;
  public readonly errorCode: string;
  public readonly timestamp: Date;
  public readonly context?: Record<string, any>;

  constructor(
    message: string,
    statusCode: number,
    errorCode: string,
    context?: Record<string, any>,
    isOperational = true
  ) {
    super(message);

    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.isOperational = isOperational;
    this.timestamp = new Date();
    this.context = context;

    // Maintain proper stack trace (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }

    // Log the error creation for debugging
    this.logError();
  }

  private logError(): void {
    logger.error(`${this.name}: ${this.message}`, {
      errorCode: this.errorCode,
      statusCode: this.statusCode,
      context: this.context,
      stack: this.stack,
      timestamp: this.timestamp.toISOString()
    });
  }

  /**
   * Convert error to JSON for API responses
   */
  toJSON(): Record<string, any> {
    return {
      error: this.errorCode,
      message: this.message,
      statusCode: this.statusCode,
      timestamp: this.timestamp.toISOString(),
      ...(this.context && { details: this.context })
    };
  }
}

/**
 * Validation errors (400 Bad Request)
 */
export class ValidationError extends AppError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 400, 'VALIDATION_ERROR', context);
  }
}

export class InvalidInputError extends AppError {
  constructor(field: string, value: any, reason?: string) {
    const message = reason
      ? `Invalid ${field}: ${reason}`
      : `Invalid value for ${field}: ${value}`;

    super(message, 400, 'INVALID_INPUT', { field, value, reason });
  }
}

export class MissingFieldError extends AppError {
  constructor(field: string | string[]) {
    const fields = Array.isArray(field) ? field : [field];
    const message = `Missing required field${fields.length > 1 ? 's' : ''}: ${fields.join(', ')}`;

    super(message, 400, 'MISSING_FIELD', { fields });
  }
}

/**
 * Authentication and authorization errors (401/403)
 */
export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required', context?: Record<string, any>) {
    super(message, 401, 'AUTHENTICATION_REQUIRED', context);
  }
}

export class InvalidCredentialsError extends AppError {
  constructor(context?: Record<string, any>) {
    super('Invalid credentials', 401, 'INVALID_CREDENTIALS', context);
  }
}

export class TokenExpiredError extends AppError {
  constructor(tokenType = 'access token', context?: Record<string, any>) {
    super(`${tokenType} has expired`, 401, 'TOKEN_EXPIRED', { tokenType, ...context });
  }
}

export class AuthorizationError extends AppError {
  constructor(message = 'Access denied', requiredRole?: string, context?: Record<string, any>) {
    super(message, 403, 'ACCESS_DENIED', { requiredRole, ...context });
  }
}

export class InsufficientPermissionsError extends AppError {
  constructor(action: string, resource: string, context?: Record<string, any>) {
    super(`Insufficient permissions to ${action} ${resource}`, 403, 'INSUFFICIENT_PERMISSIONS', {
      action,
      resource,
      ...context
    });
  }
}

/**
 * Resource errors (404/409)
 */
export class NotFoundError extends AppError {
  constructor(resource: string, identifier?: string, context?: Record<string, any>) {
    const message = identifier
      ? `${resource} with identifier '${identifier}' not found`
      : `${resource} not found`;

    super(message, 404, 'RESOURCE_NOT_FOUND', { resource, identifier, ...context });
  }
}

export class ConflictError extends AppError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 409, 'RESOURCE_CONFLICT', context);
  }
}

export class DuplicateResourceError extends AppError {
  constructor(resource: string, field: string, value: any, context?: Record<string, any>) {
    super(`${resource} with ${field} '${value}' already exists`, 409, 'DUPLICATE_RESOURCE', {
      resource,
      field,
      value,
      ...context
    });
  }
}

/**
 * Business logic errors (422 Unprocessable Entity)
 */
export class BusinessRuleError extends AppError {
  constructor(message: string, rule: string, context?: Record<string, any>) {
    super(message, 422, 'BUSINESS_RULE_VIOLATION', { rule, ...context });
  }
}

export class InvalidStatusTransitionError extends AppError {
  constructor(resource: string, fromStatus: string, toStatus: string, context?: Record<string, any>) {
    super(
      `Cannot transition ${resource} from ${fromStatus} to ${toStatus}`,
      422,
      'INVALID_STATUS_TRANSITION',
      { resource, fromStatus, toStatus, ...context }
    );
  }
}

export class InsufficientFundsError extends AppError {
  constructor(available: number, required: number, currency = 'CAD', context?: Record<string, any>) {
    super(
      `Insufficient funds: ${available} ${currency} available, ${required} ${currency} required`,
      422,
      'INSUFFICIENT_FUNDS',
      { available, required, currency, ...context }
    );
  }
}

export class QuotaExceededError extends AppError {
  constructor(resource: string, limit: number, current: number, context?: Record<string, any>) {
    super(
      `${resource} quota exceeded: ${current}/${limit}`,
      422,
      'QUOTA_EXCEEDED',
      { resource, limit, current, ...context }
    );
  }
}

/**
 * External service errors (502/503)
 */
export class ExternalServiceError extends AppError {
  constructor(service: string, operation: string, context?: Record<string, any>) {
    super(`${service} service error during ${operation}`, 502, 'EXTERNAL_SERVICE_ERROR', {
      service,
      operation,
      ...context
    });
  }
}

export class PaymentProviderError extends AppError {
  constructor(provider: string, message: string, context?: Record<string, any>) {
    super(`Payment provider error (${provider}): ${message}`, 502, 'PAYMENT_PROVIDER_ERROR', {
      provider,
      ...context
    });
  }
}

export class DatabaseConnectionError extends AppError {
  constructor(operation: string, context?: Record<string, any>) {
    super(`Database connection error during ${operation}`, 503, 'DATABASE_CONNECTION_ERROR', {
      operation,
      ...context
    });
  }
}

/**
 * Rate limiting errors (429)
 */
export class RateLimitError extends AppError {
  constructor(limit: number, window: string, context?: Record<string, any>) {
    super(`Rate limit exceeded: ${limit} requests per ${window}`, 429, 'RATE_LIMIT_EXCEEDED', {
      limit,
      window,
      ...context
    });
  }
}

/**
 * Security-related errors
 */
export class SecurityError extends AppError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 403, 'SECURITY_VIOLATION', context);
  }
}

export class EncryptionError extends AppError {
  constructor(operation: string, context?: Record<string, any>) {
    super(`Encryption error during ${operation}`, 500, 'ENCRYPTION_ERROR', {
      operation,
      ...context
    });
  }
}

export class AuditError extends AppError {
  constructor(operation: string, context?: Record<string, any>) {
    super(`Audit logging failed for ${operation}`, 500, 'AUDIT_ERROR', {
      operation,
      ...context
    });
  }
}

/**
 * Multi-tenancy errors
 */
export class OrganizationMismatchError extends AppError {
  constructor(resource: string, context?: Record<string, any>) {
    super(`${resource} does not belong to the specified organization`, 403, 'ORGANIZATION_MISMATCH', {
      resource,
      ...context
    });
  }
}

export class TenantIsolationError extends AppError {
  constructor(operation: string, context?: Record<string, any>) {
    super(`Tenant isolation violation during ${operation}`, 403, 'TENANT_ISOLATION_VIOLATION', {
      operation,
      ...context
    });
  }
}

/**
 * Financial calculation errors
 */
export class CalculationError extends AppError {
  constructor(calculation: string, reason: string, context?: Record<string, any>) {
    super(`Calculation error in ${calculation}: ${reason}`, 422, 'CALCULATION_ERROR', {
      calculation,
      reason,
      ...context
    });
  }
}

export class TaxCalculationError extends AppError {
  constructor(taxType: string, reason: string, context?: Record<string, any>) {
    super(`Tax calculation error for ${taxType}: ${reason}`, 422, 'TAX_CALCULATION_ERROR', {
      taxType,
      reason,
      ...context
    });
  }
}

export class CurrencyConversionError extends AppError {
  constructor(fromCurrency: string, toCurrency: string, context?: Record<string, any>) {
    super(
      `Currency conversion error from ${fromCurrency} to ${toCurrency}`,
      502,
      'CURRENCY_CONVERSION_ERROR',
      { fromCurrency, toCurrency, ...context }
    );
  }
}

/**
 * File and document errors
 */
export class FileUploadError extends AppError {
  constructor(reason: string, context?: Record<string, any>) {
    super(`File upload error: ${reason}`, 400, 'FILE_UPLOAD_ERROR', { reason, ...context });
  }
}

export class DocumentGenerationError extends AppError {
  constructor(documentType: string, reason: string, context?: Record<string, any>) {
    super(`Document generation error for ${documentType}: ${reason}`, 500, 'DOCUMENT_GENERATION_ERROR', {
      documentType,
      reason,
      ...context
    });
  }
}

/**
 * Integration and webhook errors
 */
export class WebhookValidationError extends AppError {
  constructor(provider: string, reason: string, context?: Record<string, any>) {
    super(`Webhook validation failed for ${provider}: ${reason}`, 400, 'WEBHOOK_VALIDATION_ERROR', {
      provider,
      reason,
      ...context
    });
  }
}

export class IntegrationError extends AppError {
  constructor(integration: string, operation: string, context?: Record<string, any>) {
    super(`Integration error with ${integration} during ${operation}`, 502, 'INTEGRATION_ERROR', {
      integration,
      operation,
      ...context
    });
  }
}

/**
 * Error factory functions for common patterns
 */
export const ErrorFactory = {
  /**
   * Create a not found error for a specific resource
   */
  notFound: (resource: string, id?: string) => new NotFoundError(resource, id),

  /**
   * Create a validation error with field details
   */
  validation: (message: string, fields?: Record<string, any>) => new ValidationError(message, fields),

  /**
   * Create an authorization error for insufficient permissions
   */
  forbidden: (action: string, resource: string) => new InsufficientPermissionsError(action, resource),

  /**
   * Create a business rule violation error
   */
  businessRule: (rule: string, message: string) => new BusinessRuleError(message, rule),

  /**
   * Create a duplicate resource error
   */
  duplicate: (resource: string, field: string, value: any) =>
    new DuplicateResourceError(resource, field, value),

  /**
   * Create an external service error
   */
  externalService: (service: string, operation: string, details?: any) =>
    new ExternalServiceError(service, operation, details)
};

/**
 * Error handler utility functions
 */
export const ErrorUtils = {
  /**
   * Check if an error is operational (safe to expose to clients)
   */
  isOperational: (error: Error): boolean => {
    return error instanceof AppError && error.isOperational;
  },

  /**
   * Get appropriate status code from error
   */
  getStatusCode: (error: Error): number => {
    if (error instanceof AppError) {
      return error.statusCode;
    }
    return 500; // Internal Server Error for unknown errors
  },

  /**
   * Create a safe error response for clients
   */
  createErrorResponse: (error: Error, includeStack = false): Record<string, any> => {
    if (error instanceof AppError) {
      const response = error.toJSON();
      if (includeStack && process.env.NODE_ENV === 'development') {
        response.stack = error.stack;
      }
      return response;
    }

    // For non-AppError instances, create a generic response
    return {
      error: 'INTERNAL_SERVER_ERROR',
      message: process.env.NODE_ENV === 'development'
        ? error.message
        : 'An unexpected error occurred',
      statusCode: 500,
      timestamp: new Date().toISOString(),
      ...(includeStack && process.env.NODE_ENV === 'development' && { stack: error.stack })
    };
  },

  /**
   * Log error with appropriate level
   */
  logError: (error: Error, context?: Record<string, any>): void => {
    const logContext = {
      ...context,
      errorName: error.name,
      message: error.message,
      stack: error.stack
    };

    if (error instanceof AppError) {
      logContext.errorCode = error.errorCode;
      logContext.statusCode = error.statusCode;
      logContext.isOperational = error.isOperational;

      // Log operational errors as warnings, programming errors as errors
      if (error.isOperational) {
        logger.warn('Operational error occurred', logContext);
      } else {
        logger.error('Programming error occurred', logContext);
      }
    } else {
      logger.error('Unexpected error occurred', logContext);
    }
  }
};

/**
 * Type guards for error handling
 */
export const ErrorTypeGuards = {
  isValidationError: (error: Error): error is ValidationError => error instanceof ValidationError,
  isAuthenticationError: (error: Error): error is AuthenticationError => error instanceof AuthenticationError,
  isAuthorizationError: (error: Error): error is AuthorizationError => error instanceof AuthorizationError,
  isNotFoundError: (error: Error): error is NotFoundError => error instanceof NotFoundError,
  isConflictError: (error: Error): error is ConflictError => error instanceof ConflictError,
  isBusinessRuleError: (error: Error): error is BusinessRuleError => error instanceof BusinessRuleError,
  isExternalServiceError: (error: Error): error is ExternalServiceError => error instanceof ExternalServiceError,
  isRateLimitError: (error: Error): error is RateLimitError => error instanceof RateLimitError,
  isSecurityError: (error: Error): error is SecurityError => error instanceof SecurityError,
  isCalculationError: (error: Error): error is CalculationError => error instanceof CalculationError
};