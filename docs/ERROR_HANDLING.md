# Error Handling Guide

## Overview

The Accounting API uses standardized error responses across all endpoints to provide consistent error handling for frontend applications.

## Error Response Format

All error responses follow this standard structure:

```json
{
  "error": "Validation Error",
  "message": "The request contains invalid parameters",
  "code": "VALIDATION_ERROR",
  "timestamp": "2025-09-28T14:24:49.463Z",
  "details": [
    {
      "field": "email",
      "message": "Invalid email format",
      "code": "INVALID_EMAIL"
    }
  ],
  "requestId": "req_123456789"
}
```

### Fields

- **error** (string): Human-readable error type
- **message** (string): Detailed error description
- **code** (string): Machine-readable error code for frontend handling
- **timestamp** (string): ISO timestamp when the error occurred
- **details** (optional): Additional error context (validation errors, etc.)
- **requestId** (optional): Request tracking ID for debugging

## HTTP Status Codes

| Status | Error Type | Description |
|--------|------------|-------------|
| 400 | Bad Request | Invalid request parameters or malformed data |
| 401 | Unauthorized | Authentication required or invalid credentials |
| 403 | Forbidden | Access denied - insufficient permissions |
| 404 | Not Found | Requested resource does not exist |
| 409 | Conflict | Resource already exists or state conflict |
| 422 | Unprocessable Entity | Business logic validation failed |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Unexpected server error |
| 503 | Service Unavailable | Service temporarily unavailable |

## Error Codes

### General Error Codes

| Code | Description | HTTP Status | Example Message |
|------|-------------|-------------|-----------------|
| `VALIDATION_ERROR` | Request validation failed | 400 | "The request contains invalid parameters" |
| `AUTHENTICATION_ERROR` | Authentication required | 401 | "Authentication required" |
| `AUTHORIZATION_ERROR` | Access denied | 403 | "Access denied" |
| `NOT_FOUND` | Resource not found | 404 | "Customer not found" |
| `CONFLICT_ERROR` | Resource conflict | 409 | "Email address already exists" |
| `BUSINESS_LOGIC_ERROR` | Business rule violation | 422 | "Operation violates business rules" |
| `RATE_LIMIT_ERROR` | Too many requests | 429 | "Too many requests" |
| `INTERNAL_SERVER_ERROR` | Server error | 500 | "Internal server error" |
| `SERVICE_UNAVAILABLE` | Service unavailable | 503 | "Service temporarily unavailable" |

### Domain-Specific Error Codes

#### Financial & Accounting
| Code | Description | Example Message |
|------|-------------|-----------------|
| `INSUFFICIENT_BALANCE` | Insufficient account balance | "Account balance insufficient for transaction" |
| `TAX_CALCULATION_ERROR` | Tax calculation failed | "Unable to calculate taxes for this transaction" |
| `ENCRYPTION_ERROR` | Data encryption/decryption failed | "Unable to process sensitive data" |

#### Payments
| Code | Description | Example Message |
|------|-------------|-----------------|
| `PAYMENT_FAILED` | Payment processing failed | "Payment could not be processed" |
| `INVOICE_ALREADY_PAID` | Invoice already paid | "This invoice has already been paid" |

#### Business Logic
| Code | Description | Example Message |
|------|-------------|-----------------|
| `QUOTE_EXPIRED` | Quote has expired | "This quote has expired and cannot be accepted" |
| `CUSTOMER_LIFECYCLE_VIOLATION` | Invalid customer lifecycle transition | "Cannot schedule appointment before quote acceptance" |
| `ORGANIZATION_LIMIT_EXCEEDED` | Organization limits exceeded | "Maximum number of users exceeded for organization" |

## Frontend Error Handling Strategies

### 1. Error Code Mapping

```typescript
const ERROR_MESSAGES = {
  VALIDATION_ERROR: 'Please check your input and try again',
  AUTHENTICATION_ERROR: 'Please log in to continue',
  AUTHORIZATION_ERROR: 'You don\'t have permission to perform this action',
  NOT_FOUND: 'The requested item could not be found',
  INSUFFICIENT_BALANCE: 'Insufficient funds for this transaction',
  QUOTE_EXPIRED: 'This quote has expired. Please request a new quote',
  // ... more mappings
};

function getErrorMessage(errorCode: string): string {
  return ERROR_MESSAGES[errorCode] || 'An unexpected error occurred';
}
```

### 2. Retry Strategies

```typescript
const RETRYABLE_ERRORS = [
  'INTERNAL_SERVER_ERROR',
  'SERVICE_UNAVAILABLE',
  'RATE_LIMIT_ERROR'
];

function shouldRetry(errorCode: string): boolean {
  return RETRYABLE_ERRORS.includes(errorCode);
}
```

### 3. Authentication Error Handling

```typescript
function handleAuthError(error: ApiError): void {
  if (error.code === 'AUTHENTICATION_ERROR') {
    // Redirect to login
    window.location.href = '/login';
  } else if (error.code === 'AUTHORIZATION_ERROR') {
    // Show insufficient permissions message
    showError('You don\'t have permission to perform this action');
  }
}
```

### 4. Validation Error Handling

```typescript
function handleValidationErrors(details: ValidationError[]): void {
  details.forEach(error => {
    const field = document.querySelector(`[name="${error.field}"]`);
    if (field) {
      field.classList.add('error');
      showFieldError(field, error.message);
    }
  });
}
```

## Example API Client Implementation

```typescript
class ApiClient {
  async request<T>(endpoint: string, options: RequestOptions): Promise<T> {
    try {
      const response = await fetch(endpoint, options);

      if (!response.ok) {
        const errorData = await response.json();
        throw new ApiError(errorData);
      }

      return await response.json();
    } catch (error) {
      if (error instanceof ApiError) {
        this.handleError(error);
      }
      throw error;
    }
  }

  private handleError(error: ApiError): void {
    switch (error.code) {
      case 'AUTHENTICATION_ERROR':
        this.redirectToLogin();
        break;
      case 'RATE_LIMIT_ERROR':
        this.scheduleRetry(error.requestId);
        break;
      case 'VALIDATION_ERROR':
        this.displayValidationErrors(error.details);
        break;
      default:
        this.displayGenericError(error.message);
    }
  }
}

class ApiError extends Error {
  constructor(
    public readonly error: string,
    public readonly code: string,
    public readonly timestamp: string,
    public readonly details?: any,
    public readonly requestId?: string
  ) {
    super(error.message);
    this.name = 'ApiError';
  }
}
```

## Best Practices

### For Backend Developers
1. Always use the `ErrorResponseUtil` for consistent error responses
2. Include meaningful error messages for debugging
3. Use appropriate HTTP status codes
4. Log errors with request IDs for traceability
5. Never expose sensitive information in error messages

### For Frontend Developers
1. Handle errors based on error codes, not HTTP status codes
2. Implement retry logic for transient errors
3. Provide user-friendly error messages
4. Log error details for debugging (with request IDs)
5. Gracefully degrade functionality when possible

## Error Monitoring

All errors include a `requestId` field for tracing requests across systems. Use this ID when:
- Reporting bugs to the development team
- Correlating frontend errors with backend logs
- Debugging user-reported issues

## Support

For questions about error handling or if you encounter undocumented error codes, please contact the API team with:
- The error code and message
- The request ID (if available)
- Steps to reproduce the error