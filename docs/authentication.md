# Authentication Guide

## Overview

The Accounting API uses JWT (JSON Web Tokens) for authentication with a refresh token mechanism for enhanced security.

## Authentication Flow

### 1. Initial Login

```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePassword123!",
  "organizationId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": { ... },
  "organization": { ... }
}
```

### 2. Using Access Token

Include the access token in the Authorization header for all API requests:

```http
GET /api/v1/customers
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 3. Token Refresh

When the access token expires (15 minutes), use the refresh token to get a new one:

```http
POST /api/v1/auth/refresh
Content-Type: application/json

{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### 4. Logout

Invalidate the refresh token when logging out:

```http
POST /api/v1/auth/logout
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

## Token Expiration

- **Access Token**: 15 minutes
- **Refresh Token**: 7 days

## Security Best Practices

1. **Store tokens securely**: Never store tokens in localStorage or sessionStorage in web applications. Use secure, httpOnly cookies instead.

2. **Implement automatic refresh**: Set up your client to automatically refresh tokens before they expire.

3. **Handle token expiration**: Always handle 401 responses gracefully by attempting to refresh the token.

4. **Logout properly**: Always call the logout endpoint to invalidate refresh tokens.

5. **Use HTTPS**: Never send tokens over unencrypted connections in production.

## Role-Based Access Control

The API implements role-based access control with the following roles:

| Role | Description | Permissions |
|------|-------------|-------------|
| `SUPER_ADMIN` | System administrator | Full access to all organizations |
| `ADMIN` | Organization administrator | Full access within organization |
| `MANAGER` | Department manager | Manage customers, quotes, invoices, projects |
| `ACCOUNTANT` | Financial operator | Focus on financial operations and reporting |
| `EMPLOYEE` | Regular employee | Limited access to assigned tasks |
| `VIEWER` | Read-only user | View-only access to organization data |

## Error Responses

### 401 Unauthorized
```json
{
  "error": "AuthenticationError",
  "message": "Invalid credentials"
}
```

### 403 Forbidden
```json
{
  "error": "AuthorizationError",
  "message": "Insufficient permissions"
}
```

### 429 Too Many Requests
```json
{
  "error": "RateLimitError",
  "message": "Too many requests from this IP, please try again later"
}
```

## Rate Limiting

Authentication endpoints have additional rate limiting:

- **Login**: 5 attempts per 15 minutes per IP
- **Registration**: 3 attempts per hour per IP
- **Other endpoints**: 100 requests per minute per IP

### E2E Testing Configuration

For automated end-to-end testing, the API supports a special testing mode that relaxes rate limits:

**Environment Variable**:
```bash
E2E_TESTING=true
```

**Behavior When Enabled**:
- Login rate limit: 5 → 1000 attempts per 15 minutes
- Rate limiting skipped for localhost (127.0.0.1, ::1, ::ffff:127.0.0.1)
- All other security features remain active
- Audit logging continues to function normally

**Usage**:
```bash
# Development
E2E_TESTING=true npm run dev

# Or add to .env
echo "E2E_TESTING=true" >> .env
```

**⚠️ Production Safety**: The API automatically prevents E2E_TESTING from being enabled in production. If `NODE_ENV=production` and `E2E_TESTING=true`, the server will refuse to start with a security error.

## Multi-Tenant Architecture

Each request is scoped to an organization. Users can only access data within their organization unless they have `SUPER_ADMIN` role.
