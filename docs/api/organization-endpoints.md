# Organization Management API

## Overview
The Organization Management API provides endpoints for creating, reading, updating and managing organizations within the multi-tenant accounting system. All endpoints require authentication and appropriate authorization.

## Base URL
```
/api/v1/organizations
```

## Authentication
All endpoints require a valid JWT token in the Authorization header:
```
Authorization: Bearer <jwt_token>
```

## Endpoints

### 1. Create Organization
Creates a new organization. Only super admins can create organizations.

**Endpoint:** `POST /api/v1/organizations`

**Request Headers:**
```
Content-Type: application/json
Authorization: Bearer <jwt_token>
```

**Request Body:**
```json
{
  "name": "string (required)",
  "email": "string (required, valid email)",
  "phone": "string (required)",
  "legalName": "string (optional)",
  "domain": "string (optional)",
  "type": "SINGLE_BUSINESS | MULTI_BUSINESS | AGENCY | FRANCHISE | CORPORATE | NON_PROFIT (optional)",
  "website": "string (optional, valid URL)",
  "businessNumber": "string (optional)",
  "taxNumber": "string (optional)"
}
```

**Success Response (201):**
```json
{
  "message": "Organization created successfully",
  "organization": {
    "id": "string",
    "name": "string",
    "domain": "string",
    "type": "string",
    "email": "string",
    "isActive": true,
    "createdAt": "ISO8601 timestamp"
  }
}
```

**Error Responses:**
- `400` - Validation errors or domain already in use
- `403` - Only super admins can create organizations
- `500` - Internal server error

### 2. Get Organization
Retrieves organization details by ID.

**Endpoint:** `GET /api/v1/organizations/:id`

**Path Parameters:**
- `id` (string, required): Organization ID

**Success Response (200):**
```json
{
  "organization": {
    "id": "string",
    "name": "string",
    "legalName": "string",
    "domain": "string",
    "type": "string",
    "email": "string",
    "phone": "string",
    "website": "string",
    "businessNumber": "string",
    "taxNumber": "string",
    "isActive": boolean,
    "createdAt": "ISO8601 timestamp",
    "updatedAt": "ISO8601 timestamp",
    "stats": {
      "users": number,
      "customers": number,
      "quotes": number,
      "invoices": number,
      "payments": number
    }
  }
}
```

**Error Responses:**
- `401` - Authentication required
- `404` - Organization not found
- `500` - Internal server error

### 3. Update Organization
Updates organization details. Users can only update their own organization.

**Endpoint:** `PUT /api/v1/organizations/:id`

**Path Parameters:**
- `id` (string, required): Organization ID

**Request Body:**
```json
{
  "name": "string (optional)",
  "email": "string (optional, valid email)",
  "phone": "string (optional)",
  "legalName": "string (optional)",
  "domain": "string (optional)",
  "type": "string (optional)",
  "website": "string (optional, valid URL)",
  "businessNumber": "string (optional)",
  "taxNumber": "string (optional)",
  "isActive": boolean (optional)
}
```

**Success Response (200):**
```json
{
  "message": "Organization updated successfully",
  "organization": {
    "id": "string",
    "name": "string",
    "legalName": "string",
    "domain": "string",
    "type": "string",
    "email": "string",
    "phone": "string",
    "website": "string",
    "businessNumber": "string",
    "taxNumber": "string",
    "isActive": boolean,
    "updatedAt": "ISO8601 timestamp"
  }
}
```

**Error Responses:**
- `400` - Validation errors or domain already in use
- `401` - Authentication required
- `403` - Access denied (can only update own organization)
- `500` - Internal server error

### 4. List Organizations
Lists all organizations with optional filtering. Only super admins can access this endpoint.

**Endpoint:** `GET /api/v1/organizations`

**Query Parameters:**
- `type` (string, optional): Filter by organization type
- `isActive` (boolean, optional): Filter by active status
- `search` (string, optional): Search by name, domain, or email
- `limit` (number, optional): Number of results per page (1-100, default: 50)
- `offset` (number, optional): Number of results to skip (default: 0)

**Success Response (200):**
```json
{
  "organizations": [
    {
      "id": "string",
      "name": "string",
      "domain": "string",
      "type": "string",
      "email": "string",
      "isActive": boolean,
      "createdAt": "ISO8601 timestamp",
      "stats": {
        "users": number,
        "customers": number
      }
    }
  ],
  "pagination": {
    "total": number,
    "limit": number,
    "offset": number
  }
}
```

**Error Responses:**
- `400` - Validation errors
- `403` - Only super admins can list all organizations
- `500` - Internal server error

### 5. Deactivate Organization
Deactivates an organization and all its users. Only super admins can deactivate organizations.

**Endpoint:** `DELETE /api/v1/organizations/:id`

**Path Parameters:**
- `id` (string, required): Organization ID

**Success Response (200):**
```json
{
  "message": "Organization deactivated successfully",
  "organization": {
    "id": "string",
    "name": "string",
    "isActive": false,
    "updatedAt": "ISO8601 timestamp"
  }
}
```

**Error Responses:**
- `403` - Only super admins can deactivate organizations
- `404` - Organization not found
- `500` - Internal server error

### 6. Get Organization Statistics
Retrieves statistical information about the organization.

**Endpoint:** `GET /api/v1/organizations/:id/stats`

**Path Parameters:**
- `id` (string, required): Organization ID

**Success Response (200):**
```json
{
  "stats": {
    "users": number,
    "customers": number,
    "quotes": number,
    "invoices": number,
    "payments": number,
    "totalRevenue": number,
    "activeProjects": number
  }
}
```

**Error Responses:**
- `401` - Authentication required
- `403` - Access denied (can only view own organization stats)
- `500` - Internal server error

### 7. Get Organization Settings
Retrieves organization-specific settings.

**Endpoint:** `GET /api/v1/organizations/:id/settings`

**Path Parameters:**
- `id` (string, required): Organization ID

**Success Response (200):**
```json
{
  "settings": {
    "defaultCurrency": "string",
    "defaultTaxRate": number,
    "depositPercentage": number,
    "paymentTermsDays": number,
    "quoteValidityDays": number,
    "timezone": "string",
    "dateFormat": "string",
    "numberFormat": "string"
  }
}
```

**Error Responses:**
- `401` - Authentication required
- `403` - Access denied (can only view own organization settings)
- `500` - Internal server error

### 8. Update Organization Settings
Updates organization-specific settings.

**Endpoint:** `PUT /api/v1/organizations/:id/settings`

**Path Parameters:**
- `id` (string, required): Organization ID

**Request Body:**
```json
{
  "defaultCurrency": "string (optional, 3 characters)",
  "defaultTaxRate": number (optional, 0-1),
  "depositPercentage": number (optional, 0-1)",
  "paymentTermsDays": number (optional, 1-365)",
  "quoteValidityDays": number (optional, 1-365)",
  "timezone": "string (optional)",
  "dateFormat": "string (optional)",
  "numberFormat": "string (optional)"
}
```

**Success Response (200):**
```json
{
  "message": "Settings updated successfully",
  "settings": {
    "defaultCurrency": "string",
    "defaultTaxRate": number,
    "depositPercentage": number,
    "paymentTermsDays": number,
    "quoteValidityDays": number,
    "timezone": "string",
    "dateFormat": "string",
    "numberFormat": "string"
  }
}
```

**Error Responses:**
- `400` - Validation errors
- `401` - Authentication required
- `403` - Access denied (can only update own organization settings)
- `500` - Internal server error

## Audit Logging
All organization operations are automatically logged to the audit trail with the following information:
- Action performed (CREATE, VIEW, UPDATE, DELETE)
- User who performed the action
- IP address and user agent
- Timestamp
- Changes made (for updates)

## Security Notes
- Domain validation ensures no duplicate domains across organizations
- Multi-tenant data isolation ensures users can only access their organization's data
- Rate limiting applies to all endpoints
- All sensitive data is encrypted at rest
- CORS and security headers are enforced