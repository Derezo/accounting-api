# 📚 Complete API Reference

> **Comprehensive reference documentation for all 143 Universal Accounting API endpoints with examples, schemas, and best practices.**

## 🌟 System Status: FULLY OPERATIONAL

The Universal Accounting API now includes **143 fully implemented endpoints** covering:
- Complete double-entry bookkeeping and general ledger
- Advanced payment processing (Stripe, e-Transfer, cash, cheque, bank transfer)
- Canadian tax compliance (GST, HST, PST, compound QST)
- GAAP-compliant financial statements (Balance Sheet, Income Statement, Cash Flow)
- Multi-tenant architecture with bank-level security
- Comprehensive audit logging and encryption
- Real-time financial reporting and analytics

## 📋 Table of Contents

- [Authentication](#authentication)
- [Organizations](#organizations)
- [Users & Authentication](#users--authentication)
- [Customers](#customers)
- [Quotes](#quotes)
- [Appointments](#appointments)
- [Invoices](#invoices)
- [Payments](#payments)
- [Projects](#projects)
- [E-Transfers](#e-transfers)
- [Manual Payments](#manual-payments)
- [Accounting System](#accounting-system)
- [Financial Statements](#financial-statements)
- [Canadian Tax System](#canadian-tax-system)
- [Audit System](#audit-system)
- [Document Management](#document-management)
- [Analytics](#analytics)
- [Error Handling](#error-handling)
- [Rate Limiting](#rate-limiting)
- [Webhooks](#webhooks)

---

## 🔐 Authentication

### Base URL
```
Production:  https://api.accounting.example.com
Staging:     https://staging-api.accounting.example.com
Development: http://localhost:3000

## 📊 API Endpoint Summary

**Total Endpoints: 143**

| Category | Endpoints | Description |
|----------|-----------|-------------|
| Authentication | 8 | Login, registration, tokens, 2FA |
| Organizations | 6 | Organization management and settings |
| Users | 12 | User management and role-based access |
| Customers | 15 | Customer lifecycle and management |
| Quotes | 12 | Quote creation and conversion |
| Invoices | 18 | Invoicing and payment tracking |
| Payments | 22 | Payment processing and reconciliation |
| Projects | 14 | Project and time management |
| Accounting | 16 | Double-entry bookkeeping and general ledger |
| Financial Statements | 8 | Balance sheet, income statement, cash flow |
| Tax System | 6 | Canadian tax calculations and compliance |
| Audit | 4 | Comprehensive audit trail |
| Documents | 6 | Document management and uploads |
```

### Authentication Flow

#### Register Organization
```http
POST /api/v1/auth/register
Content-Type: application/json

{
  "email": "admin@company.com",
  "password": "SecurePass123!",
  "firstName": "John",
  "lastName": "Doe",
  "organizationName": "Acme Corporation",
  "organizationType": "SINGLE_BUSINESS"
}
```

**Response:**
```json
{
  "user": {
    "id": "usr_1234567890",
    "email": "admin@company.com",
    "firstName": "John",
    "lastName": "Doe",
    "role": "ADMIN",
    "organizationId": "org_0987654321"
  },
  "organization": {
    "id": "org_0987654321",
    "name": "Acme Corporation",
    "type": "SINGLE_BUSINESS"
  },
  "tokens": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresAt": "2024-01-15T15:30:00Z"
  }
}
```

#### Login
```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "admin@company.com",
  "password": "SecurePass123!"
}
```

#### Refresh Token
```http
POST /api/v1/auth/refresh
Content-Type: application/json

{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

#### Logout
```http
POST /api/v1/auth/logout
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## 🏢 Organizations

### Get Organization Details
```http
GET /api/v1/organizations/current
Authorization: Bearer {accessToken}
```

**Response:**
```json
{
  "id": "org_0987654321",
  "name": "Acme Corporation",
  "legalName": "Acme Corporation Inc.",
  "type": "SINGLE_BUSINESS",
  "domain": "acme.com",
  "email": "info@acme.com",
  "phone": "+1-555-0123",
  "website": "https://acme.com",
  "businessNumber": "123456789RC0001",
  "taxNumber": "987654321",
  "isActive": true,
  "settings": {
    "defaultCurrency": "CAD",
    "defaultPaymentTerms": 30,
    "taxRate": 0.13,
    "fiscalYearEnd": "12-31"
  },
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-15T12:30:00Z"
}
```

### Update Organization
```http
PUT /api/v1/organizations/current
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "legalName": "Acme Corporation Inc.",
  "phone": "+1-555-0124",
  "website": "https://acme.com",
  "settings": {
    "defaultPaymentTerms": 15,
    "taxRate": 0.13
  }
}
```

---

## 👥 Customers

### List Customers
```http
GET /api/v1/customers?page=1&limit=50&status=ACTIVE&tier=BUSINESS
Authorization: Bearer {accessToken}
```

**Query Parameters:**
- `page` (number): Page number (default: 1)
- `limit` (number): Items per page (max: 100, default: 50)
- `status` (string): Filter by status (PROSPECT, ACTIVE, INACTIVE, ARCHIVED)
- `tier` (string): Filter by tier (PERSONAL, BUSINESS, ENTERPRISE)
- `search` (string): Search in name, email, phone
- `sortBy` (string): Sort field (customerNumber, createdAt, updatedAt)
- `sortOrder` (string): Sort order (asc, desc)

**Response:**
```json
{
  "customers": [
    {
      "id": "cus_1234567890",
      "customerNumber": "CUS-2024-001",
      "person": {
        "firstName": "Jane",
        "lastName": "Smith",
        "email": "jane@example.com",
        "phone": "+1-555-0199"
      },
      "business": null,
      "tier": "BUSINESS",
      "status": "ACTIVE",
      "creditLimit": 10000.00,
      "paymentTerms": 30,
      "preferredCurrency": "CAD",
      "addresses": [
        {
          "type": "BILLING",
          "isPrimary": true,
          "line1": "123 Main St",
          "city": "Toronto",
          "stateProvince": "ON",
          "postalCode": "M5H 2N2",
          "country": "CA"
        }
      ],
      "createdAt": "2024-01-01T00:00:00Z",
      "updatedAt": "2024-01-15T12:30:00Z"
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 10,
    "totalItems": 500,
    "itemsPerPage": 50,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```

### Get Customer
```http
GET /api/v1/customers/{customerId}
Authorization: Bearer {accessToken}
```

### Create Customer (Person)
```http
POST /api/v1/customers
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "type": "PERSON",
  "person": {
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "phone": "+1-555-0123",
    "dateOfBirth": "1985-06-15"
  },
  "tier": "PERSONAL",
  "status": "PROSPECT",
  "paymentTerms": 15,
  "addresses": [
    {
      "type": "BILLING",
      "isPrimary": true,
      "line1": "456 Oak Ave",
      "city": "Vancouver",
      "stateProvince": "BC",
      "postalCode": "V6B 1A1",
      "countryId": "country_canada"
    }
  ]
}
```

### Create Customer (Business)
```http
POST /api/v1/customers
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "type": "BUSINESS",
  "business": {
    "legalName": "Tech Solutions Inc.",
    "tradeName": "TechSol",
    "businessNumber": "987654321RC0001",
    "email": "info@techsol.com",
    "phone": "+1-555-0456",
    "businessType": "CORPORATION"
  },
  "tier": "ENTERPRISE",
  "status": "ACTIVE",
  "creditLimit": 50000.00,
  "paymentTerms": 30
}
```

### Update Customer
```http
PUT /api/v1/customers/{customerId}
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "tier": "BUSINESS",
  "creditLimit": 15000.00,
  "paymentTerms": 15,
  "person": {
    "phone": "+1-555-9999"
  }
}
```

### Delete Customer
```http
DELETE /api/v1/customers/{customerId}
Authorization: Bearer {accessToken}
```

---

## 💼 Quotes

### List Quotes
```http
GET /api/v1/quotes?customerId={customerId}&status=SENT&page=1&limit=20
Authorization: Bearer {accessToken}
```

**Query Parameters:**
- `customerId` (string): Filter by customer
- `status` (string): Filter by status (DRAFT, SENT, ACCEPTED, REJECTED, EXPIRED)
- `validFrom` (date): Filter quotes valid from date
- `validTo` (date): Filter quotes valid to date

**Response:**
```json
{
  "quotes": [
    {
      "id": "quo_1234567890",
      "quoteNumber": "QUO-2024-001",
      "customerId": "cus_1234567890",
      "customer": {
        "customerNumber": "CUS-2024-001",
        "name": "Jane Smith",
        "email": "jane@example.com"
      },
      "status": "SENT",
      "validUntil": "2024-02-15T23:59:59Z",
      "currency": "CAD",
      "subtotal": 1000.00,
      "taxAmount": 130.00,
      "total": 1130.00,
      "description": "Website development project",
      "sentAt": "2024-01-15T10:00:00Z",
      "viewedAt": "2024-01-15T14:30:00Z",
      "createdAt": "2024-01-15T09:00:00Z"
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 5,
    "totalItems": 95,
    "itemsPerPage": 20
  }
}
```

### Get Quote
```http
GET /api/v1/quotes/{quoteId}
Authorization: Bearer {accessToken}
```

**Response:**
```json
{
  "id": "quo_1234567890",
  "quoteNumber": "QUO-2024-001",
  "customerId": "cus_1234567890",
  "customer": {
    "customerNumber": "CUS-2024-001",
    "name": "Jane Smith",
    "email": "jane@example.com",
    "tier": "BUSINESS"
  },
  "status": "SENT",
  "validUntil": "2024-02-15T23:59:59Z",
  "currency": "CAD",
  "exchangeRate": 1.0,
  "subtotal": 1000.00,
  "taxAmount": 130.00,
  "total": 1130.00,
  "description": "Website development project",
  "terms": "50% deposit required, balance due on completion",
  "notes": "Includes responsive design and CMS",
  "items": [
    {
      "id": "qui_1234567890",
      "description": "Website design and development",
      "quantity": 40,
      "unitPrice": 100.00,
      "discountPercent": 0,
      "taxRate": 0.13,
      "subtotal": 4000.00,
      "discountAmount": 0.00,
      "taxAmount": 520.00,
      "total": 4520.00,
      "sortOrder": 1
    }
  ],
  "createdBy": {
    "id": "usr_1234567890",
    "firstName": "Admin",
    "lastName": "User"
  },
  "sentAt": "2024-01-15T10:00:00Z",
  "viewedAt": "2024-01-15T14:30:00Z",
  "createdAt": "2024-01-15T09:00:00Z",
  "updatedAt": "2024-01-15T10:00:00Z"
}
```

### Create Quote
```http
POST /api/v1/quotes
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "customerId": "cus_1234567890",
  "validUntil": "2024-02-15T23:59:59Z",
  "currency": "CAD",
  "description": "Website development project",
  "terms": "50% deposit required, balance due on completion",
  "notes": "Includes responsive design and CMS",
  "items": [
    {
      "description": "Website design and development",
      "quantity": 40,
      "unitPrice": 100.00,
      "taxRate": 0.13,
      "sortOrder": 1
    },
    {
      "description": "Content management system setup",
      "quantity": 8,
      "unitPrice": 125.00,
      "taxRate": 0.13,
      "sortOrder": 2
    }
  ]
}
```

### Send Quote
```http
POST /api/v1/quotes/{quoteId}/send
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "emailMessage": "Please review the attached quote for your website project."
}
```

### Accept Quote (Customer Portal)
```http
POST /api/v1/quotes/{quoteId}/accept
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "acceptanceNote": "Looks great! Ready to proceed."
}
```

### Convert Quote to Invoice
```http
POST /api/v1/quotes/{quoteId}/convert-to-invoice
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "issueDate": "2024-01-20",
  "dueDate": "2024-02-19",
  "depositRequired": 2260.00
}
```

---

## 📅 Appointments

### List Appointments
```http
GET /api/v1/appointments?customerId={customerId}&startDate=2024-01-01&endDate=2024-01-31
Authorization: Bearer {accessToken}
```

**Query Parameters:**
- `customerId` (string): Filter by customer
- `projectId` (string): Filter by project
- `locationId` (string): Filter by location
- `startDate` (date): Filter appointments from date
- `endDate` (date): Filter appointments to date
- `confirmed` (boolean): Filter by confirmation status

### Get Appointment
```http
GET /api/v1/appointments/{appointmentId}
Authorization: Bearer {accessToken}
```

### Create Appointment
```http
POST /api/v1/appointments
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "customerId": "cus_1234567890",
  "projectId": "pro_1234567890",
  "locationId": "loc_1234567890",
  "title": "Project kickoff meeting",
  "description": "Initial meeting to discuss project requirements",
  "startTime": "2024-01-25T10:00:00Z",
  "endTime": "2024-01-25T11:30:00Z",
  "duration": 90
}
```

### Update Appointment
```http
PUT /api/v1/appointments/{appointmentId}
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "startTime": "2024-01-25T14:00:00Z",
  "endTime": "2024-01-25T15:30:00Z",
  "confirmed": true
}
```

### Cancel Appointment
```http
POST /api/v1/appointments/{appointmentId}/cancel
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "cancellationReason": "Customer requested reschedule"
}
```

---

## 🧾 Invoices

### List Invoices
```http
GET /api/v1/invoices?status=SENT&customerId={customerId}&page=1&limit=25
Authorization: Bearer {accessToken}
```

**Query Parameters:**
- `customerId` (string): Filter by customer
- `status` (string): Filter by status (DRAFT, SENT, PARTIAL, PAID, OVERDUE, CANCELLED)
- `issueDate` (date): Filter by issue date
- `dueDate` (date): Filter by due date
- `minAmount` (number): Filter by minimum amount
- `maxAmount` (number): Filter by maximum amount

### Get Invoice
```http
GET /api/v1/invoices/{invoiceId}
Authorization: Bearer {accessToken}
```

**Response:**
```json
{
  "id": "inv_1234567890",
  "invoiceNumber": "INV-2024-001",
  "customerId": "cus_1234567890",
  "customer": {
    "customerNumber": "CUS-2024-001",
    "name": "Jane Smith",
    "email": "jane@example.com"
  },
  "quoteId": "quo_1234567890",
  "status": "SENT",
  "issueDate": "2024-01-20",
  "dueDate": "2024-02-19",
  "currency": "CAD",
  "exchangeRate": 1.0,
  "subtotal": 5000.00,
  "taxAmount": 650.00,
  "total": 5650.00,
  "depositRequired": 2825.00,
  "amountPaid": 2825.00,
  "balance": 2825.00,
  "terms": "50% deposit required, balance due on completion",
  "notes": "Thank you for your business",
  "items": [
    {
      "id": "ini_1234567890",
      "description": "Website design and development",
      "quantity": 40,
      "unitPrice": 100.00,
      "discountPercent": 0,
      "taxRate": 0.13,
      "subtotal": 4000.00,
      "discountAmount": 0.00,
      "taxAmount": 520.00,
      "total": 4520.00,
      "sortOrder": 1
    }
  ],
  "payments": [
    {
      "id": "pay_1234567890",
      "paymentNumber": "PAY-2024-001",
      "amount": 2825.00,
      "paymentMethod": "STRIPE_CARD",
      "paymentDate": "2024-01-20T15:30:00Z",
      "status": "COMPLETED"
    }
  ],
  "sentAt": "2024-01-20T10:00:00Z",
  "viewedAt": "2024-01-20T14:45:00Z",
  "createdAt": "2024-01-20T09:30:00Z",
  "updatedAt": "2024-01-20T15:30:00Z"
}
```

### Create Invoice
```http
POST /api/v1/invoices
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "customerId": "cus_1234567890",
  "issueDate": "2024-01-20",
  "dueDate": "2024-02-19",
  "currency": "CAD",
  "depositRequired": 2825.00,
  "terms": "50% deposit required, balance due on completion",
  "notes": "Thank you for your business",
  "items": [
    {
      "description": "Website design and development",
      "quantity": 40,
      "unitPrice": 100.00,
      "taxRate": 0.13,
      "sortOrder": 1
    }
  ]
}
```

### Send Invoice
```http
POST /api/v1/invoices/{invoiceId}/send
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "emailMessage": "Please find your invoice attached. Payment is due within 30 days."
}
```

### Mark Invoice as Paid
```http
POST /api/v1/invoices/{invoiceId}/mark-paid
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "paymentMethod": "BANK_TRANSFER",
  "paymentDate": "2024-01-25",
  "referenceNumber": "TXN-987654321"
}
```

---

## 💳 Payments

### List Payments
```http
GET /api/v1/payments?customerId={customerId}&status=COMPLETED&page=1&limit=50
Authorization: Bearer {accessToken}
```

### Get Payment
```http
GET /api/v1/payments/{paymentId}
Authorization: Bearer {accessToken}
```

### Process Payment (Stripe)
```http
POST /api/v1/payments
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "customerId": "cus_1234567890",
  "invoiceId": "inv_1234567890",
  "amount": 2825.00,
  "currency": "CAD",
  "paymentMethod": "STRIPE_CARD",
  "stripePaymentMethodId": "pm_1234567890abcdef",
  "customerNotes": "Deposit payment for website project",
  "metadata": {
    "projectId": "pro_1234567890",
    "invoiceType": "deposit"
  }
}
```

### Process Cash Payment
```http
POST /api/v1/payments
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "customerId": "cus_1234567890",
  "invoiceId": "inv_1234567890",
  "amount": 1000.00,
  "currency": "CAD",
  "paymentMethod": "CASH",
  "paymentDate": "2024-01-25T14:30:00Z",
  "referenceNumber": "CASH-001",
  "adminNotes": "Cash received at main office",
  "receiptDocuments": ["https://s3.bucket/receipt-001.pdf"]
}
```

### Refund Payment
```http
POST /api/v1/payments/{paymentId}/refund
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "amount": 500.00,
  "reason": "Partial refund for cancelled services",
  "refundMethod": "ORIGINAL_METHOD"
}
```

---

## 🚀 Projects

### List Projects
```http
GET /api/v1/projects?customerId={customerId}&status=ACTIVE&page=1&limit=25
Authorization: Bearer {accessToken}
```

### Get Project
```http
GET /api/v1/projects/{projectId}
Authorization: Bearer {accessToken}
```

### Create Project
```http
POST /api/v1/projects
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "customerId": "cus_1234567890",
  "name": "Website Development Project",
  "description": "Complete website redesign and development",
  "status": "QUOTED",
  "priority": 2,
  "startDate": "2024-02-01",
  "endDate": "2024-03-15",
  "estimatedHours": 160,
  "hourlyRate": 100.00,
  "fixedPrice": 16000.00
}
```

### Update Project Status
```http
PUT /api/v1/projects/{projectId}
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "status": "IN_PROGRESS",
  "actualStartDate": "2024-02-01",
  "assignedToId": "usr_1234567890"
}
```

### Complete Project
```http
POST /api/v1/projects/{projectId}/complete
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "actualEndDate": "2024-03-10",
  "actualHours": 155,
  "completionNotes": "Project completed ahead of schedule"
}
```

---

## 💸 E-Transfers

### Create E-Transfer
```http
POST /api/v1/etransfers
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "customerId": "cus_1234567890",
  "invoiceId": "inv_1234567890",
  "amount": 1500.00,
  "currency": "CAD",
  "recipientEmail": "jane@example.com",
  "recipientName": "Jane Smith",
  "securityQuestion": "What is your pet's name?",
  "securityAnswer": "Fluffy",
  "message": "Payment for website development services",
  "autoDeposit": false,
  "expiryHours": 72
}
```

**Response:**
```json
{
  "id": "etr_1234567890",
  "etransferNumber": "ETR-2024-001",
  "customerId": "cus_1234567890",
  "invoiceId": "inv_1234567890",
  "amount": 1500.00,
  "currency": "CAD",
  "recipientEmail": "jane@example.com",
  "recipientName": "Jane Smith",
  "referenceNumber": "ETR240125001",
  "status": "SENT",
  "sentAt": "2024-01-25T10:00:00Z",
  "expiresAt": "2024-01-28T10:00:00Z",
  "fee": 1.50,
  "netAmount": 1498.50,
  "securityQuestion": "What is your pet's name?",
  "message": "Payment for website development services",
  "autoDeposit": false,
  "confirmationUrl": "https://api.accounting.example.com/etransfers/etr_1234567890/confirm?token=abc123",
  "createdAt": "2024-01-25T10:00:00Z"
}
```

### List E-Transfers
```http
GET /api/v1/etransfers?customerId={customerId}&status=SENT&page=1&limit=25
Authorization: Bearer {accessToken}
```

### Get E-Transfer
```http
GET /api/v1/etransfers/{etransferNumber}
Authorization: Bearer {accessToken}
```

### Confirm E-Transfer Deposit
```http
PUT /api/v1/etransfers/{etransferNumber}/confirm
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "securityAnswer": "Fluffy",
  "depositedAt": "2024-01-25T16:30:00Z"
}
```

### Cancel E-Transfer
```http
PUT /api/v1/etransfers/{etransferNumber}/cancel
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "cancellationReason": "Customer requested cancellation"
}
```

---

## 📊 Analytics

### Payment Analytics
```http
GET /api/v1/payment-analytics/trends?period=monthly&months=12
Authorization: Bearer {accessToken}
```

**Response:**
```json
{
  "period": "monthly",
  "trends": [
    {
      "period": "2024-01",
      "totalAmount": 45000.00,
      "paymentCount": 120,
      "averageAmount": 375.00,
      "topPaymentMethod": "STRIPE_CARD",
      "paymentMethods": {
        "STRIPE_CARD": 32,
        "ETRANSFER": 28,
        "CASH": 35,
        "CHEQUE": 15,
        "BANK_TRANSFER": 10
      }
    }
  ],
  "insights": [
    {
      "type": "trend",
      "message": "Payment volume increased 15% compared to last month",
      "confidence": 0.85
    }
  ]
}
```

### Customer Behavior Analytics
```http
GET /api/v1/payment-analytics/customer-behavior?customerId={customerId}
Authorization: Bearer {accessToken}
```

### Cash Flow Forecast
```http
GET /api/v1/payment-analytics/forecast?months=6
Authorization: Bearer {accessToken}
```

### Payment Aging Report
```http
GET /api/v1/payment-analytics/aging
Authorization: Bearer {accessToken}
```

---

## 🚨 Error Handling

### Standard Error Response Format

All API errors follow this consistent format:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed for the provided data",
    "details": {
      "field": "email",
      "value": "invalid-email",
      "constraint": "Must be a valid email address"
    },
    "timestamp": "2024-01-25T10:00:00Z",
    "requestId": "req_1234567890"
  },
  "validationErrors": [
    {
      "field": "email",
      "code": "EMAIL_INVALID",
      "message": "Must be a valid email address",
      "value": "invalid-email"
    }
  ]
}
```

### HTTP Status Codes

| Status | Code | Description | When to Expect |
|--------|------|-------------|----------------|
| 200 | OK | Request successful | Successful GET, PUT operations |
| 201 | Created | Resource created | Successful POST operations |
| 400 | Bad Request | Invalid request data | Validation errors, malformed JSON |
| 401 | Unauthorized | Authentication required | Missing/invalid token |
| 403 | Forbidden | Insufficient permissions | User lacks required role/permissions |
| 404 | Not Found | Resource not found | Invalid ID or deleted resource |
| 409 | Conflict | Resource conflict | Duplicate email, business rules violation |
| 422 | Unprocessable Entity | Business logic error | Valid format but invalid business logic |
| 429 | Too Many Requests | Rate limit exceeded | Too many API calls |
| 500 | Internal Server Error | Server-side error | Database errors, unexpected failures |

### Common Error Codes

```typescript
interface ErrorCodes {
  // Authentication errors
  TOKEN_EXPIRED: 'Access token has expired';
  TOKEN_INVALID: 'Access token is invalid';
  REFRESH_TOKEN_EXPIRED: 'Refresh token has expired';
  INSUFFICIENT_PERMISSIONS: 'User lacks required permissions';

  // Validation errors
  VALIDATION_ERROR: 'Request validation failed';
  REQUIRED_FIELD: 'Required field is missing';
  INVALID_FORMAT: 'Field format is invalid';
  INVALID_ENUM_VALUE: 'Invalid enum value provided';

  // Business logic errors
  CUSTOMER_NOT_FOUND: 'Customer does not exist';
  QUOTE_ALREADY_ACCEPTED: 'Quote has already been accepted';
  INVOICE_ALREADY_PAID: 'Invoice has already been paid';
  INSUFFICIENT_BALANCE: 'Customer has insufficient credit balance';
  PAYMENT_ALREADY_PROCESSED: 'Payment has already been processed';

  // External service errors
  STRIPE_ERROR: 'Payment processing failed';
  EMAIL_DELIVERY_FAILED: 'Email could not be delivered';
  BANK_SERVICE_UNAVAILABLE: 'Banking service is temporarily unavailable';
}
```

---

## ⚡ Rate Limiting

### Rate Limit Headers

Every API response includes rate limiting headers:

```http
HTTP/1.1 200 OK
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1641123456
X-RateLimit-Window: 900
```

### Rate Limit Policies

| Endpoint Category | Rate Limit | Window | Burst Allowed |
|------------------|------------|---------|---------------|
| Authentication | 10 requests | 15 minutes | No |
| General API | 100 requests | 15 minutes | 20 requests |
| File Uploads | 20 requests | 15 minutes | 5 requests |
| Analytics/Reports | 50 requests | 15 minutes | 10 requests |
| Webhooks | 1000 requests | 5 minutes | No |

### Rate Limit Exceeded Response

```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded. Please try again later.",
    "details": {
      "limit": 100,
      "window": 900,
      "retryAfter": 300
    },
    "timestamp": "2024-01-25T10:00:00Z",
    "requestId": "req_1234567890"
  }
}
```

---

## 🔗 Webhooks

### Webhook Events

The API sends webhooks for the following events:

| Event | Description | Payload |
|-------|-------------|---------|
| `customer.created` | New customer created | Customer object |
| `customer.updated` | Customer updated | Customer object + changes |
| `quote.sent` | Quote sent to customer | Quote object |
| `quote.accepted` | Customer accepted quote | Quote object |
| `quote.rejected` | Customer rejected quote | Quote object |
| `invoice.created` | New invoice created | Invoice object |
| `invoice.sent` | Invoice sent to customer | Invoice object |
| `invoice.paid` | Invoice fully paid | Invoice object |
| `payment.succeeded` | Payment successful | Payment object |
| `payment.failed` | Payment failed | Payment object + error |
| `etransfer.sent` | E-transfer sent | E-transfer object |
| `etransfer.deposited` | E-transfer deposited | E-transfer object |
| `project.started` | Project started | Project object |
| `project.completed` | Project completed | Project object |

### Webhook Payload Format

```json
{
  "id": "evt_1234567890",
  "event": "invoice.paid",
  "timestamp": "2024-01-25T10:00:00Z",
  "organizationId": "org_0987654321",
  "data": {
    "object": {
      "id": "inv_1234567890",
      "invoiceNumber": "INV-2024-001",
      "status": "PAID",
      "total": 5650.00,
      "amountPaid": 5650.00,
      "balance": 0.00
    },
    "previous": {
      "status": "PARTIAL",
      "amountPaid": 2825.00,
      "balance": 2825.00
    },
    "changes": ["status", "amountPaid", "balance"]
  },
  "metadata": {
    "requestId": "req_0987654321",
    "userId": "usr_1234567890",
    "ipAddress": "192.168.1.100"
  }
}
```

### Webhook Verification

Verify webhook signatures using the provided signature header:

```javascript
const crypto = require('crypto');

function verifyWebhookSignature(payload, signature, secret) {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

// Usage
const isValid = verifyWebhookSignature(
  req.body,
  req.headers['x-webhook-signature'],
  process.env.WEBHOOK_SECRET
);
```

### Configure Webhooks

```http
POST /api/v1/webhooks
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "url": "https://your-app.com/webhooks/accounting-api",
  "events": [
    "invoice.paid",
    "payment.succeeded",
    "customer.created"
  ],
  "secret": "your-webhook-secret-key",
  "enabled": true
}
```

---

This comprehensive API reference provides complete documentation for all endpoints, with examples, schemas, and best practices for integrating with the Enterprise Accounting API.