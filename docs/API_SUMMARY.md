# Lifestream Dynamics Universal Accounting API

**Version:** 1.0.0  
**Base URL:** `http://localhost:3000` (Development)

## Overview

A comprehensive REST API for accounting, financial management, and business operations designed for small to medium businesses with bank-level security and multi-tenant SaaS architecture.

### Key Features

- **143 API Endpoints** across accounting, tax, financial statements, customer lifecycle, and payment processing
- **Double-Entry Bookkeeping** with automatic balance validation
- **Multi-Tenant Architecture** with organization-level data isolation and encryption
- **Canadian Tax Compliance** (GST/HST/PST/QST)
- **Bank-Level Security** with field-level encryption and audit logging
- **Strict 3rd Normal Form** database compliance

## Authentication

All endpoints (except health checks and auth) require JWT bearer token authentication:

```
Authorization: Bearer <your-jwt-token>
```

### User Roles

- `SUPER_ADMIN` - System administrator (master organization only)
- `ADMIN` - Organization administrator
- `MANAGER` - Department manager
- `ACCOUNTANT` - Financial operations
- `EMPLOYEE` - Standard user
- `VIEWER` - Read-only access
- `CLIENT` - Customer portal access

## API Endpoints Summary

### Authentication & Authorization
- `POST /api/v1/auth/register` - Register new user
- `POST /api/v1/auth/login` - User login
- `POST /api/v1/auth/logout` - User logout
- `POST /api/v1/auth/refresh-token` - Refresh JWT token
- `POST /api/v1/auth/verify-email` - Verify email address
- `POST /api/v1/auth/forgot-password` - Request password reset
- `POST /api/v1/auth/reset-password` - Reset password
- `POST /api/v1/auth/change-password` - Change user password

### Organizations
- `GET /api/v1/organizations` - List all organizations (SUPER_ADMIN only)
- `POST /api/v1/organizations` - Create new organization (SUPER_ADMIN only)
- `GET /api/v1/organizations/:id` - Get organization details
- `PUT /api/v1/organizations/:id` - Update organization
- `DELETE /api/v1/organizations/:id` - Deactivate organization (SUPER_ADMIN only)
- `GET /api/v1/organizations/:id/stats` - Get organization statistics
- `POST /api/v1/organizations/verify-domain` - Request domain verification
- `GET /api/v1/organizations/verify-domain/:domain` - Check verification status
- `POST /api/v1/organizations/verify-domain/:domain/verify` - Verify domain ownership

### Users
- `GET /api/v1/organizations/:orgId/users` - List users
- `POST /api/v1/organizations/:orgId/users` - Create user
- `GET /api/v1/organizations/:orgId/users/:id` - Get user details
- `PUT /api/v1/organizations/:orgId/users/:id` - Update user
- `DELETE /api/v1/organizations/:orgId/users/:id` - Delete user (soft delete)
- `POST /api/v1/organizations/:orgId/users/:id/activate` - Activate user
- `POST /api/v1/organizations/:orgId/users/:id/deactivate` - Deactivate user
- `PUT /api/v1/organizations/:orgId/users/:id/role` - Update user role

### Accounts (Chart of Accounts)
- `GET /api/v1/organizations/:orgId/accounts` - List accounts
- `POST /api/v1/organizations/:orgId/accounts` - Create account
- `GET /api/v1/organizations/:orgId/accounts/:id` - Get account details
- `PUT /api/v1/organizations/:orgId/accounts/:id` - Update account
- `DELETE /api/v1/organizations/:orgId/accounts/:id` - Delete account
- `GET /api/v1/organizations/:orgId/accounts/:id/balance` - Get account balance
- `GET /api/v1/organizations/:orgId/accounts/:id/transactions` - Get account transactions

### Journal Entries & Transactions
- `GET /api/v1/organizations/:orgId/journal` - List journal entries
- `POST /api/v1/organizations/:orgId/journal` - Create journal entry
- `GET /api/v1/organizations/:orgId/journal/:id` - Get journal entry
- `PUT /api/v1/organizations/:orgId/journal/:id` - Update journal entry (if not posted)
- `POST /api/v1/organizations/:orgId/journal/:id/post` - Post journal entry
- `POST /api/v1/organizations/:orgId/journal/:id/reverse` - Reverse journal entry
- `GET /api/v1/organizations/:orgId/journal/validate` - Validate accounting equation

### Financial Reports
- `GET /api/v1/organizations/:orgId/reports/trial-balance` - Generate trial balance
- `GET /api/v1/organizations/:orgId/reports/balance-sheet` - Generate balance sheet
- `GET /api/v1/organizations/:orgId/reports/income-statement` - Generate income statement
- `GET /api/v1/organizations/:orgId/reports/cash-flow` - Generate cash flow statement
- `GET /api/v1/organizations/:orgId/reports/general-ledger` - Generate general ledger
- `GET /api/v1/organizations/:orgId/reports/aging-report` - Accounts receivable aging
- `GET /api/v1/organizations/:orgId/reports/tax-summary` - Tax summary report

### Customers
- `GET /api/v1/organizations/:orgId/customers` - List customers
- `POST /api/v1/organizations/:orgId/customers` - Create customer
- `GET /api/v1/organizations/:orgId/customers/:id` - Get customer details
- `PUT /api/v1/organizations/:orgId/customers/:id` - Update customer
- `DELETE /api/v1/organizations/:orgId/customers/:id` - Delete customer
- `GET /api/v1/organizations/:orgId/customers/:id/invoices` - Get customer invoices
- `GET /api/v1/organizations/:orgId/customers/:id/payments` - Get customer payments
- `GET /api/v1/organizations/:orgId/customers/:id/balance` - Get customer balance
- `POST /api/v1/organizations/:orgId/customers/:id/lifecycle/advance` - Advance lifecycle stage

### Quotes
- `GET /api/v1/organizations/:orgId/quotes` - List quotes
- `POST /api/v1/organizations/:orgId/quotes` - Create quote
- `GET /api/v1/organizations/:orgId/quotes/:id` - Get quote details
- `PUT /api/v1/organizations/:orgId/quotes/:id` - Update quote
- `DELETE /api/v1/organizations/:orgId/quotes/:id` - Delete quote
- `POST /api/v1/organizations/:orgId/quotes/:id/send` - Send quote to customer
- `POST /api/v1/organizations/:orgId/quotes/:id/accept` - Accept quote
- `POST /api/v1/organizations/:orgId/quotes/:id/reject` - Reject quote
- `POST /api/v1/organizations/:orgId/quotes/:id/convert-to-invoice` - Convert to invoice

### Invoices
- `GET /api/v1/organizations/:orgId/invoices` - List invoices
- `POST /api/v1/organizations/:orgId/invoices` - Create invoice
- `GET /api/v1/organizations/:orgId/invoices/:id` - Get invoice details
- `PUT /api/v1/organizations/:orgId/invoices/:id` - Update invoice
- `DELETE /api/v1/organizations/:orgId/invoices/:id` - Delete invoice
- `POST /api/v1/organizations/:orgId/invoices/:id/send` - Send invoice to customer
- `POST /api/v1/organizations/:orgId/invoices/:id/mark-paid` - Mark invoice as paid
- `POST /api/v1/organizations/:orgId/invoices/:id/void` - Void invoice
- `GET /api/v1/organizations/:orgId/invoices/:id/pdf` - Download invoice PDF

### Payments
- `GET /api/v1/organizations/:orgId/payments` - List payments
- `POST /api/v1/organizations/:orgId/payments` - Create payment
- `GET /api/v1/organizations/:orgId/payments/:id` - Get payment details
- `PUT /api/v1/organizations/:orgId/payments/:id` - Update payment
- `POST /api/v1/organizations/:orgId/payments/:id/process` - Process payment
- `POST /api/v1/organizations/:orgId/payments/:id/refund` - Refund payment
- `POST /api/v1/organizations/:orgId/payments/:id/allocate` - Allocate payment to invoices

### Projects
- `GET /api/v1/organizations/:orgId/projects` - List projects
- `POST /api/v1/organizations/:orgId/projects` - Create project
- `GET /api/v1/organizations/:orgId/projects/:id` - Get project details
- `PUT /api/v1/organizations/:orgId/projects/:id` - Update project
- `DELETE /api/v1/organizations/:orgId/projects/:id` - Delete project
- `POST /api/v1/organizations/:orgId/projects/:id/start` - Start project
- `POST /api/v1/organizations/:orgId/projects/:id/complete` - Complete project
- `GET /api/v1/organizations/:orgId/projects/:id/timeline` - Get project timeline

### Appointments
- `GET /api/v1/organizations/:orgId/appointments` - List appointments
- `POST /api/v1/organizations/:orgId/appointments` - Create appointment
- `GET /api/v1/organizations/:orgId/appointments/:id` - Get appointment details
- `PUT /api/v1/organizations/:orgId/appointments/:id` - Update appointment
- `DELETE /api/v1/organizations/:orgId/appointments/:id` - Cancel appointment
- `POST /api/v1/organizations/:orgId/appointments/:id/confirm` - Confirm appointment
- `POST /api/v1/organizations/:orgId/appointments/:id/reschedule` - Reschedule appointment

### Documents
- `GET /api/v1/organizations/:orgId/documents` - List documents
- `POST /api/v1/organizations/:orgId/documents` - Upload document
- `GET /api/v1/organizations/:orgId/documents/:id` - Get document metadata
- `GET /api/v1/organizations/:orgId/documents/:id/download` - Download document
- `DELETE /api/v1/organizations/:orgId/documents/:id` - Delete document
- `POST /api/v1/organizations/:orgId/documents/:id/share` - Share document

### Tax
- `POST /api/v1/organizations/:orgId/tax/calculate` - Calculate tax for transaction
- `GET /api/v1/organizations/:orgId/tax/rates` - Get applicable tax rates
- `GET /api/v1/organizations/:orgId/tax/summary` - Get tax summary
- `POST /api/v1/organizations/:orgId/tax/file` - File tax return

### Audit Logs
- `GET /api/v1/organizations/:orgId/audit` - Get audit logs
- `GET /api/v1/organizations/:orgId/audit/user/:userId` - Get user activity
- `GET /api/v1/organizations/:orgId/audit/entity/:entityId` - Get entity changes
- `GET /api/v1/organizations/:orgId/audit/export` - Export audit logs

### Intake Forms (Customer Onboarding)
- `GET /api/v1/organizations/:orgId/intake/templates` - List form templates
- `POST /api/v1/organizations/:orgId/intake/templates` - Create form template
- `POST /api/v1/organizations/:orgId/intake/sessions` - Start intake session
- `PUT /api/v1/organizations/:orgId/intake/sessions/:id` - Update session data
- `POST /api/v1/organizations/:orgId/intake/sessions/:id/complete` - Complete intake
- `POST /api/v1/organizations/:orgId/intake/sessions/:id/convert` - Convert to customer

### Health & Monitoring
- `GET /health` - API health check
- `GET /health/detailed` - Detailed health status
- `GET /api-docs` - Swagger UI documentation
- `GET /api-docs/openapi.json` - OpenAPI specification

## 8-Stage Customer Lifecycle

1. **Request Quote** - Customer requests service quote
2. **Quote Estimated** - Quote prepared and sent
3. **Quote Accepted** - Customer accepts quote
4. **Appointment Scheduled** - Service appointment booked
5. **Invoice Generated** - Invoice created from quote
6. **Deposit Paid** - 25-50% deposit received
7. **Work Begins** - Project starts after deposit
8. **Project Completion** - Final invoice and completion

## Response Formats

### Success Response
```json
{
  "success": true,
  "data": {
    // Response data
  }
}
```

### Error Response
```json
{
  "error": "Brief error description",
  "message": "Detailed error message",
  "code": "ERROR_CODE",
  "details": {
    "field": "Validation error details"
  }
}
```

## Common HTTP Status Codes

- `200 OK` - Request successful
- `201 Created` - Resource created successfully
- `400 Bad Request` - Invalid request parameters
- `401 Unauthorized` - Authentication required
- `403 Forbidden` - Insufficient permissions
- `404 Not Found` - Resource not found
- `422 Unprocessable Entity` - Validation error
- `500 Internal Server Error` - Server error

## Rate Limiting

- Standard: 1000 requests/hour per organization
- Burst: 100 requests/minute
- Headers included in responses:
  - `X-RateLimit-Limit`
  - `X-RateLimit-Remaining`
  - `X-RateLimit-Reset`

## Data Formats

- **Dates**: ISO 8601 format (YYYY-MM-DDTHH:mm:ss.sssZ)
- **Currency**: Two decimal places (e.g., 1000.00)
- **IDs**: CUID format (e.g., "cmg123abc...")
- **Pagination**: Cursor-based with `limit` and `cursor` parameters

## Security Features

- **JWT Authentication** with refresh tokens
- **Field-Level Encryption** for sensitive data
- **Organization-Specific Encryption Keys**
- **Automatic Key Rotation**
- **Comprehensive Audit Logging**
- **Multi-Factor Authentication** support
- **IP Whitelisting** capabilities
- **Session Management** with activity tracking

## Documentation Access

- **Swagger UI**: http://localhost:3000/api-docs
- **OpenAPI JSON**: http://localhost:3000/api-docs/openapi.json
- **Documentation Health**: http://localhost:3000/api-docs/health

---

**Generated**: $(date -u +"%Y-%m-%dT%H:%M:%SZ")  
**API Version**: 1.0.0
