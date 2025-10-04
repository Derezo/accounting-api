# Frontend Integration Guide
**Lifestream Dynamics Accounting API v2.0**

**Last Updated:** October 2, 2025
**API Base URL:** `https://api.lifestreamdynamics.com`
**Development URL:** `http://localhost:3000`

---

## Table of Contents

1. [Breaking Changes & Migration](#breaking-changes--migration)
2. [Authentication & Session Management](#authentication--session-management)
3. [Rate Limiting](#rate-limiting)
4. [Password Requirements](#password-requirements)
5. [Error Handling](#error-handling)
6. [API Endpoints Summary](#api-endpoints-summary)
7. [Code Examples](#code-examples)
8. [Testing](#testing)

---

## Breaking Changes & Migration

### ✅ No Breaking Changes
All security enhancements are **backward compatible**. Existing frontend code will continue to work without modifications.

### ⚠️ Recommended Updates

#### 1. Session Duration Reduced
- **Before:** 7 days
- **After:** 2 hours with 15-minute idle timeout
- **Action:** Implement token refresh logic for long-running sessions

#### 2. Rate Limiting Added
- **Login:** 5 attempts per 15 minutes
- **Registration:** 3 attempts per hour
- **Password Reset:** 3 attempts per hour
- **Action:** Display user-friendly error messages for rate limit errors (HTTP 429)

#### 3. Password Requirements Strengthened
- **Before:** 6+ characters
- **After:** 12+ characters with complexity rules
- **Action:** Update password input validation to match new requirements

#### 4. Device Fingerprinting
- **New:** Sessions are now tied to device and IP address
- **Action:** Users will need to re-login if switching devices/networks (expected behavior)

---

## Authentication & Session Management

### Login Endpoint

```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePassword123!"
}
```

**Response (200 OK):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user-id",
    "email": "user@example.com",
    "role": "ADMIN",
    "organizationId": "org-id"
  },
  "expiresIn": "2h",
  "sessionExpiresAt": "2025-10-02T12:00:00Z"
}
```

**Error Responses:**

**401 Unauthorized - Invalid Credentials:**
```json
{
  "error": "Invalid email or password"
}
```

**401 Unauthorized - Password Expired:**
```json
{
  "error": "Password has expired. Please reset your password.",
  "passwordExpired": true,
  "resetUrl": "/api/v1/auth/reset-password"
}
```

**429 Too Many Requests - Rate Limited:**
```json
{
  "error": "Too many login attempts, please try again after 15 minutes",
  "retryAfter": 900
}
```

### Token Refresh

```http
POST /api/v1/auth/refresh
Content-Type: application/json

{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response (200 OK):**
```json
{
  "token": "new-access-token",
  "expiresIn": "2h"
}
```

### Session Management

**Automatic Session Validation:**
- Every authenticated request validates session integrity
- Checks device fingerprint and IP address
- Tracks last activity for idle timeout (15 minutes)
- Maximum 3 concurrent sessions per user

**Session Invalidation Triggers:**
- Idle for 15+ minutes
- IP address changes
- Device fingerprint mismatch
- Password change
- Manual logout

**Frontend Recommendations:**

1. **Auto-Refresh Tokens:**
```typescript
// Refresh token 5 minutes before expiry
const TOKEN_LIFETIME = 2 * 60 * 60 * 1000; // 2 hours
const REFRESH_BEFORE_EXPIRY = 5 * 60 * 1000; // 5 minutes

setInterval(() => {
  if (shouldRefreshToken()) {
    refreshAccessToken();
  }
}, 60 * 1000); // Check every minute
```

2. **Detect Session Expiry:**
```typescript
// Handle 401 errors globally
axios.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401) {
      // Session expired - redirect to login
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);
```

3. **Activity Tracking:**
```typescript
// Reset idle timer on user activity
const resetIdleTimer = () => {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    // Warn user of impending logout
    showIdleWarning();
  }, 14 * 60 * 1000); // Warn at 14 minutes
};

['mousedown', 'keydown', 'scroll', 'touchstart'].forEach(event => {
  document.addEventListener(event, resetIdleTimer);
});
```

---

## Rate Limiting

### Endpoints with Rate Limits

| Endpoint | Limit | Window | Error Code |
|----------|-------|--------|------------|
| `POST /api/v1/auth/login` | 5 requests | 15 minutes | 429 |
| `POST /api/v1/auth/register` | 3 requests | 1 hour | 429 |
| `POST /api/v1/auth/reset-password` | 3 requests | 1 hour | 429 |
| `POST /api/v1/auth/forgot-password` | 3 requests | 1 hour | 429 |
| `POST /api/v1/public/intake/*` | 10 requests | 1 minute | 429 |

### Rate Limit Response Headers

```http
X-RateLimit-Limit: 5
X-RateLimit-Remaining: 3
X-RateLimit-Reset: 1696262400
Retry-After: 900
```

### Frontend Handling

```typescript
const handleRateLimit = (error: AxiosError) => {
  if (error.response?.status === 429) {
    const retryAfter = error.response.data?.retryAfter || 900;
    const minutes = Math.ceil(retryAfter / 60);

    showNotification({
      type: 'error',
      message: `Too many attempts. Please try again in ${minutes} minutes.`,
      duration: 10000
    });

    // Optionally disable submit button with countdown
    startCountdown(retryAfter);
  }
};
```

---

## Password Requirements

### New Password Policy

**Requirements:**
- ✅ Minimum 12 characters
- ✅ At least one uppercase letter (A-Z)
- ✅ At least one lowercase letter (a-z)
- ✅ At least one number (0-9)
- ✅ At least one special character (!@#$%^&*()_+-=[]{};':"\\|,.<>/?)
- ✅ Cannot reuse last 5 passwords
- ✅ Expires after 90 days

### Client-Side Validation

```typescript
interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
  strength: 'weak' | 'medium' | 'strong' | 'very-strong';
}

function validatePassword(password: string): PasswordValidationResult {
  const errors: string[] = [];

  if (password.length < 12) {
    errors.push('Password must be at least 12 characters long');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  // Calculate strength
  let strength: PasswordValidationResult['strength'] = 'weak';
  if (errors.length === 0) {
    if (password.length >= 16) strength = 'very-strong';
    else if (password.length >= 14) strength = 'strong';
    else strength = 'medium';
  }

  return {
    valid: errors.length === 0,
    errors,
    strength
  };
}
```

### Password Change Endpoint

```http
POST /api/v1/auth/change-password
Authorization: Bearer <token>
Content-Type: application/json

{
  "currentPassword": "OldPassword123!",
  "newPassword": "NewSecurePassword456!"
}
```

**Error Responses:**

**400 Bad Request - Weak Password:**
```json
{
  "error": "Password does not meet requirements",
  "details": [
    "Password must be at least 12 characters long",
    "Password must contain at least one special character"
  ]
}
```

**400 Bad Request - Password Reuse:**
```json
{
  "error": "Cannot reuse one of your last 5 passwords"
}
```

---

## Error Handling

### Standard Error Response Format

```typescript
interface APIError {
  error: string;           // Human-readable error message
  code?: string;           // Error code (e.g., 'VALIDATION_ERROR')
  details?: any;           // Additional error details
  timestamp?: string;      // ISO 8601 timestamp
  path?: string;           // Request path
  requestId?: string;      // Request tracking ID
}
```

### HTTP Status Codes

| Code | Meaning | Common Causes |
|------|---------|---------------|
| 200 | Success | Request completed successfully |
| 201 | Created | Resource created successfully |
| 400 | Bad Request | Invalid input, validation errors |
| 401 | Unauthorized | Missing/invalid token, session expired |
| 403 | Forbidden | Insufficient permissions for resource |
| 404 | Not Found | Resource does not exist |
| 409 | Conflict | Resource already exists, duplicate entry |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server error (rare) |

### Security-Related Error Codes

```typescript
enum SecurityErrorCode {
  PASSWORD_EXPIRED = 'PASSWORD_EXPIRED',
  PASSWORD_WEAK = 'PASSWORD_WEAK',
  PASSWORD_REUSED = 'PASSWORD_REUSED',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  SESSION_INVALID = 'SESSION_INVALID',
  DEVICE_MISMATCH = 'DEVICE_MISMATCH',
  IP_MISMATCH = 'IP_MISMATCH',
  CONCURRENT_SESSION_LIMIT = 'CONCURRENT_SESSION_LIMIT'
}
```

### Global Error Handler Example

```typescript
class APIClient {
  private handleError(error: AxiosError<APIError>) {
    const response = error.response;

    if (!response) {
      // Network error
      showNotification({
        type: 'error',
        message: 'Network error. Please check your connection.'
      });
      return;
    }

    switch (response.status) {
      case 401:
        // Unauthorized - redirect to login
        if (response.data?.code === 'PASSWORD_EXPIRED') {
          router.push('/reset-password');
        } else {
          localStorage.removeItem('authToken');
          router.push('/login');
        }
        break;

      case 403:
        // Forbidden
        showNotification({
          type: 'error',
          message: 'You do not have permission to perform this action.'
        });
        break;

      case 429:
        // Rate limited
        const retryAfter = response.data?.retryAfter || 900;
        showNotification({
          type: 'error',
          message: `Too many attempts. Please try again in ${Math.ceil(retryAfter / 60)} minutes.`
        });
        break;

      case 400:
        // Validation errors
        if (response.data?.details) {
          // Display validation errors
          showValidationErrors(response.data.details);
        } else {
          showNotification({
            type: 'error',
            message: response.data?.error || 'Invalid request'
          });
        }
        break;

      default:
        showNotification({
          type: 'error',
          message: response.data?.error || 'An error occurred'
        });
    }
  }
}
```

---

## API Endpoints Summary

### Authentication Endpoints

| Method | Endpoint | Description | Rate Limited |
|--------|----------|-------------|--------------|
| POST | `/api/v1/auth/register` | Register new user | 3/hour |
| POST | `/api/v1/auth/login` | User login | 5/15min |
| POST | `/api/v1/auth/logout` | User logout | No |
| POST | `/api/v1/auth/refresh` | Refresh access token | No |
| POST | `/api/v1/auth/forgot-password` | Request password reset | 3/hour |
| POST | `/api/v1/auth/reset-password` | Reset password with token | 3/hour |
| POST | `/api/v1/auth/change-password` | Change password (authenticated) | No |
| GET | `/api/v1/auth/me` | Get current user | No |

### Organization Endpoints

All organization endpoints require authentication and follow this pattern:
```
/api/v1/organizations/:orgId/{resource}
```

**Example:**
```http
GET /api/v1/organizations/org-123/customers
Authorization: Bearer <token>
```

### Public Endpoints (No Auth Required)

| Method | Endpoint | Description | Rate Limited |
|--------|----------|-------------|--------------|
| POST | `/api/v1/public/intake/initialize` | Initialize intake form | 10/min |
| GET | `/api/v1/public/intake/templates` | Get intake templates | No |
| POST | `/api/v1/public/intake/step` | Submit intake step | 10/min |
| GET | `/api/v1/public/intake/status` | Get intake status | No |
| POST | `/api/v1/public/intake/submit` | Submit complete intake | 10/min |
| POST | `/api/v1/public/quotes/:token/accept` | Accept quote | No |
| POST | `/api/v1/public/appointments/:token/book` | Book appointment | No |

**Note:** Public intake endpoints use `X-Intake-Token` header, NOT JWT Bearer token.

### Role-Based Access Control (RBAC)

**Role Hierarchy:**
```
SUPER_ADMIN (100) > ADMIN (80) > MANAGER (60) > ACCOUNTANT (50) > EMPLOYEE (40) > VIEWER (20) > CLIENT (10)
```

**Role Capabilities:**

| Role | Can Access | Cannot Access |
|------|-----------|---------------|
| **SUPER_ADMIN** | Everything | - |
| **ADMIN** | All org resources, user management | Cross-organization data |
| **MANAGER** | Customers, quotes, invoices, projects | Payment refunds, user deletion |
| **ACCOUNTANT** | Financial reports, tax data, journal entries | User management, payment processing |
| **EMPLOYEE** | Own customers/invoices, tasks | Other users' data, financial reports |
| **VIEWER** | Read-only access | Any write operations |
| **CLIENT** | Own customer data, invoices, quotes | Other customers, financial data |

**Higher roles inherit lower role permissions.** For example, ADMIN can access all MANAGER, ACCOUNTANT, EMPLOYEE, VIEWER, and CLIENT endpoints.

---

## Code Examples

### Complete Authentication Flow

```typescript
// api-client.ts
import axios, { AxiosInstance } from 'axios';

class APIClient {
  private client: AxiosInstance;
  private refreshToken: string | null = null;
  private tokenRefreshPromise: Promise<string> | null = null;

  constructor(baseURL: string) {
    this.client = axios.create({
      baseURL,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Request interceptor - add auth token
    this.client.interceptors.request.use(config => {
      const token = localStorage.getItem('authToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    // Response interceptor - handle errors
    this.client.interceptors.response.use(
      response => response,
      async error => {
        const originalRequest = error.config;

        // Handle 401 Unauthorized
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;

          try {
            // Try to refresh token
            const newToken = await this.refreshAccessToken();
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return this.client(originalRequest);
          } catch (refreshError) {
            // Refresh failed - redirect to login
            this.logout();
            window.location.href = '/login';
            return Promise.reject(refreshError);
          }
        }

        // Handle other errors
        this.handleError(error);
        return Promise.reject(error);
      }
    );
  }

  async login(email: string, password: string) {
    try {
      const response = await this.client.post('/api/v1/auth/login', {
        email,
        password
      });

      const { token, refreshToken, user } = response.data;

      // Store tokens
      localStorage.setItem('authToken', token);
      localStorage.setItem('refreshToken', refreshToken);
      localStorage.setItem('user', JSON.stringify(user));

      this.refreshToken = refreshToken;

      // Schedule token refresh
      this.scheduleTokenRefresh();

      return response.data;
    } catch (error) {
      throw this.handleLoginError(error);
    }
  }

  async refreshAccessToken(): Promise<string> {
    // Prevent multiple simultaneous refresh requests
    if (this.tokenRefreshPromise) {
      return this.tokenRefreshPromise;
    }

    this.tokenRefreshPromise = (async () => {
      try {
        const refreshToken = localStorage.getItem('refreshToken');
        if (!refreshToken) {
          throw new Error('No refresh token available');
        }

        const response = await axios.post(
          `${this.client.defaults.baseURL}/api/v1/auth/refresh`,
          { refreshToken }
        );

        const { token } = response.data;
        localStorage.setItem('authToken', token);

        return token;
      } finally {
        this.tokenRefreshPromise = null;
      }
    })();

    return this.tokenRefreshPromise;
  }

  private scheduleTokenRefresh() {
    // Refresh token 5 minutes before it expires
    const TOKEN_LIFETIME = 2 * 60 * 60 * 1000; // 2 hours
    const REFRESH_BEFORE = 5 * 60 * 1000; // 5 minutes

    setTimeout(() => {
      this.refreshAccessToken();
    }, TOKEN_LIFETIME - REFRESH_BEFORE);
  }

  logout() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    this.refreshToken = null;
  }

  private handleLoginError(error: any) {
    if (error.response?.status === 429) {
      return new Error('Too many login attempts. Please try again later.');
    }
    if (error.response?.data?.passwordExpired) {
      return new Error('Password expired. Please reset your password.');
    }
    return new Error(error.response?.data?.error || 'Login failed');
  }

  private handleError(error: any) {
    // Implement error handling as shown in Error Handling section
  }
}

export const apiClient = new APIClient(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000');
```

### Password Validation Component (React)

```tsx
// PasswordInput.tsx
import React, { useState } from 'react';

interface PasswordStrength {
  score: number; // 0-4
  label: 'weak' | 'medium' | 'strong' | 'very-strong';
  color: string;
}

export const PasswordInput: React.FC = () => {
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [strength, setStrength] = useState<PasswordStrength>({
    score: 0,
    label: 'weak',
    color: 'red'
  });

  const validatePassword = (pwd: string) => {
    const validationErrors: string[] = [];

    if (pwd.length < 12) {
      validationErrors.push('At least 12 characters');
    }
    if (!/[A-Z]/.test(pwd)) {
      validationErrors.push('One uppercase letter');
    }
    if (!/[a-z]/.test(pwd)) {
      validationErrors.push('One lowercase letter');
    }
    if (!/[0-9]/.test(pwd)) {
      validationErrors.push('One number');
    }
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pwd)) {
      validationErrors.push('One special character');
    }

    setErrors(validationErrors);

    // Calculate strength
    let score = 0;
    if (pwd.length >= 12) score++;
    if (pwd.length >= 16) score++;
    if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pwd)) score++;

    const strengthLevels = [
      { score: 0, label: 'weak', color: 'red' },
      { score: 2, label: 'medium', color: 'orange' },
      { score: 4, label: 'strong', color: 'green' },
      { score: 5, label: 'very-strong', color: 'darkgreen' }
    ];

    const currentStrength = strengthLevels
      .reverse()
      .find(level => score >= level.score) || strengthLevels[0];

    setStrength(currentStrength as PasswordStrength);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newPassword = e.target.value;
    setPassword(newPassword);
    validatePassword(newPassword);
  };

  return (
    <div className="password-input">
      <input
        type="password"
        value={password}
        onChange={handleChange}
        placeholder="Enter password"
        className={errors.length > 0 ? 'invalid' : ''}
      />

      {/* Strength indicator */}
      <div className="strength-meter">
        <div
          className="strength-bar"
          style={{
            width: `${(strength.score / 5) * 100}%`,
            backgroundColor: strength.color
          }}
        />
      </div>
      <p className="strength-label" style={{ color: strength.color }}>
        Password strength: {strength.label}
      </p>

      {/* Validation errors */}
      {errors.length > 0 && (
        <ul className="validation-errors">
          {errors.map((error, index) => (
            <li key={index}>{error}</li>
          ))}
        </ul>
      )}
    </div>
  );
};
```

### Rate Limit Handler (React Hook)

```typescript
// useRateLimitHandler.ts
import { useState, useCallback } from 'react';
import { AxiosError } from 'axios';

interface RateLimitState {
  isLimited: boolean;
  remainingTime: number;
  message: string;
}

export const useRateLimitHandler = () => {
  const [rateLimitState, setRateLimitState] = useState<RateLimitState>({
    isLimited: false,
    remainingTime: 0,
    message: ''
  });

  const handleRateLimitError = useCallback((error: AxiosError) => {
    if (error.response?.status === 429) {
      const retryAfter = error.response.data?.retryAfter || 900;
      const minutes = Math.ceil(retryAfter / 60);

      setRateLimitState({
        isLimited: true,
        remainingTime: retryAfter,
        message: `Too many attempts. Please try again in ${minutes} minute${minutes > 1 ? 's' : ''}.`
      });

      // Start countdown
      const interval = setInterval(() => {
        setRateLimitState(prev => {
          const newRemaining = prev.remainingTime - 1;

          if (newRemaining <= 0) {
            clearInterval(interval);
            return {
              isLimited: false,
              remainingTime: 0,
              message: ''
            };
          }

          return {
            ...prev,
            remainingTime: newRemaining,
            message: `Too many attempts. Please try again in ${Math.ceil(newRemaining / 60)} minute${Math.ceil(newRemaining / 60) > 1 ? 's' : ''}.`
          };
        });
      }, 1000);

      return true; // Handled
    }
    return false; // Not a rate limit error
  }, []);

  return { rateLimitState, handleRateLimitError };
};

// Usage in component:
const LoginForm = () => {
  const { rateLimitState, handleRateLimitError } = useRateLimitHandler();

  const handleSubmit = async (email: string, password: string) => {
    try {
      await apiClient.login(email, password);
    } catch (error) {
      if (handleRateLimitError(error as AxiosError)) {
        return; // Rate limit handled
      }
      // Handle other errors
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Form fields */}
      {rateLimitState.isLimited && (
        <div className="rate-limit-warning">
          {rateLimitState.message}
        </div>
      )}
      <button
        type="submit"
        disabled={rateLimitState.isLimited}
      >
        Login
      </button>
    </form>
  );
};
```

---

## Testing

### Test User Credentials

**Development Environment Only:**

```typescript
const testUsers = {
  superAdmin: {
    email: 'admin@lifestreamdynamics.com',
    password: 'SuperAdmin123!',
    role: 'SUPER_ADMIN'
  },
  admin: {
    email: 'manager@lifestreamdynamics.com',
    password: 'OrgAdmin123!',
    role: 'ADMIN'
  },
  manager: {
    email: 'sales@lifestreamdynamics.com',
    password: 'Manager123!',
    role: 'MANAGER'
  },
  accountant: {
    email: 'accounting@lifestreamdynamics.com',
    password: 'Accountant123!',
    role: 'ACCOUNTANT'
  }
};
```

### Testing Checklist

- [ ] User can log in with valid credentials
- [ ] Login fails with invalid credentials
- [ ] Rate limiting triggers after 5 failed login attempts
- [ ] Password validation shows real-time feedback
- [ ] Weak passwords are rejected during registration
- [ ] Session expires after 2 hours of inactivity
- [ ] Idle warning appears after 14 minutes
- [ ] Token auto-refreshes before expiration
- [ ] User is redirected to login on session expiry
- [ ] Password change requires current password
- [ ] Password change rejects reused passwords
- [ ] Different roles see appropriate UI elements
- [ ] Higher roles can access lower-level endpoints
- [ ] Users cannot access other organizations' data
- [ ] Public intake endpoints work without authentication
- [ ] Error messages are user-friendly and helpful

### Integration Testing

```typescript
// auth.test.ts
describe('Authentication Flow', () => {
  it('should login successfully with valid credentials', async () => {
    const response = await apiClient.login(
      'admin@lifestreamdynamics.com',
      'OrgAdmin123!'
    );

    expect(response.token).toBeDefined();
    expect(response.user.role).toBe('ADMIN');
  });

  it('should reject weak passwords', async () => {
    await expect(
      apiClient.register({
        email: 'test@example.com',
        password: 'weak'
      })
    ).rejects.toThrow('Password does not meet requirements');
  });

  it('should enforce rate limiting', async () => {
    // Attempt 6 failed logins
    for (let i = 0; i < 6; i++) {
      try {
        await apiClient.login('test@example.com', 'wrongpassword');
      } catch (e) {
        if (i === 5) {
          expect(e.response?.status).toBe(429);
        }
      }
    }
  });

  it('should refresh token before expiration', async () => {
    await apiClient.login('admin@lifestreamdynamics.com', 'OrgAdmin123!');

    const oldToken = localStorage.getItem('authToken');

    // Manually trigger refresh
    await apiClient.refreshAccessToken();

    const newToken = localStorage.getItem('authToken');
    expect(newToken).not.toBe(oldToken);
  });
});
```

---

## Support & Resources

### Documentation Links

- **OpenAPI Specification:** `/docs/jsdoc-openapi.yaml`
- **Interactive API Docs:** `http://localhost:3000/api-docs` (when dev server running)
- **API Reference (HTML):** `/docs/api-docs.html`
- **Security Guide:** `/SECURITY_IMPROVEMENTS_COMPLETE.md`
- **Migration Guide:** `/docs/MIGRATION_STEPS.md`

### Environment Configuration

```bash
# Frontend .env.local
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_API_TIMEOUT=30000
NEXT_PUBLIC_SESSION_TIMEOUT=7200000  # 2 hours in ms
NEXT_PUBLIC_IDLE_TIMEOUT=900000      # 15 minutes in ms
```

### Common Issues

**Q: Users are being logged out frequently**
A: This is expected behavior with the new 2-hour session limit and 15-minute idle timeout. Implement token refresh and activity tracking to maintain sessions.

**Q: Rate limiting is blocking legitimate users**
A: Rate limits are per-IP. If multiple users share an IP (e.g., corporate network), consider implementing user-based rate limiting or increasing limits for trusted IPs.

**Q: Password validation is too strict**
A: The 12-character minimum with complexity is required for PCI DSS compliance. Provide a password strength meter and helpful error messages to guide users.

**Q: Sessions expire when switching networks (mobile users)**
A: This is a security feature. Device fingerprint and IP validation prevent session hijacking. Users must re-authenticate when switching networks.

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 2.0.0 | 2025-10-02 | Security enhancements: password policy, rate limiting, session security, RBAC hierarchy, audit immutability |
| 1.0.0 | 2025-09-27 | Initial API release |

---

**For additional support, contact:** api-support@lifestreamdynamics.com
