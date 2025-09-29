# Universal Accounting API - REST API Specification

## Overview

The Universal Accounting API provides a comprehensive REST API designed to serve businesses of all sizes with standardized accounting operations. The API follows RESTful principles, OpenAPI 3.0 specification, and implements industry-standard authentication, security, and data validation practices.

## API Design Principles

### Universal Business Support
- **Multi-Tenant Architecture**: Complete data isolation per organization
- **Scalable Endpoints**: Support from micro businesses to enterprise operations
- **Industry Agnostic**: Adaptable to service, product, and hybrid business models
- **Compliance Ready**: Built-in support for various accounting standards (GAAP, IFRS)

### RESTful Standards
- **Resource-Based URLs**: Clear, hierarchical endpoint structure
- **HTTP Methods**: Proper use of GET, POST, PUT, PATCH, DELETE
- **Status Codes**: Meaningful HTTP status codes for all responses
- **Stateless Operations**: Each request contains all necessary information

## Base Configuration

### API Foundation
- **Base URL**: `https://api.universalaccounting.com/v1`
- **Protocol**: HTTPS only with TLS 1.3
- **Content Type**: `application/json`
- **Character Encoding**: UTF-8
- **API Version**: v1 (semantic versioning)

### Authentication Methods
- **Bearer Token (JWT)**: Short-lived access tokens for user sessions
- **API Keys**: Long-lived keys for system integrations
- **OAuth 2.0**: Third-party application integrations
- **Multi-Factor Authentication**: TOTP-based 2FA support

### Rate Limiting
- **Authenticated Users**: 5000 requests/hour
- **API Keys**: 10000 requests/hour
- **Unauthenticated**: 100 requests/hour
- **Burst Allowance**: 50 requests/minute

## Response Format Standards

### Success Response Format
```json
{
  "success": true,
  "data": {
    // Response payload
  },
  "meta": {
    "timestamp": "2024-01-01T00:00:00Z",
    "version": "1.0.0",
    "requestId": "req_12345",
    "pagination": {
      "page": 1,
      "limit": 50,
      "total": 1250,
      "totalPages": 25
    }
  }
}
```

### Error Response Format
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data provided",
    "details": [
      {
        "field": "email",
        "message": "Valid email address is required",
        "code": "INVALID_EMAIL"
      }
    ],
    "timestamp": "2024-01-01T00:00:00Z"
  },
  "meta": {
    "timestamp": "2024-01-01T00:00:00Z",
    "version": "1.0.0",
    "requestId": "req_12345"
  }
}
```

### Standard HTTP Status Codes
- **200 OK**: Successful GET, PUT, PATCH
- **201 Created**: Successful POST operations
- **204 No Content**: Successful DELETE operations
- **400 Bad Request**: Invalid request data
- **401 Unauthorized**: Authentication required
- **403 Forbidden**: Insufficient permissions
- **404 Not Found**: Resource not found
- **409 Conflict**: Resource conflict (duplicate, etc.)
- **422 Unprocessable Entity**: Validation errors
- **429 Too Many Requests**: Rate limit exceeded
- **500 Internal Server Error**: Server errors

## Response Format Examples

### List Response with Data
```json
{
  "success": true,
  "data": {
    "customers": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "customerNumber": "CUST-001",
        "type": "BUSINESS",
        "tier": "STANDARD",
        "status": "ACTIVE",
        "createdAt": "2024-01-01T10:00:00Z",
        "business": {
          "legalName": "Acme Corporation",
          "tradingName": "Acme Corp"
        }
      }
    ]
  },
  "meta": {
    "timestamp": "2024-01-01T10:00:00Z",
    "version": "1.0.0",
    "requestId": "req_12345678",
    "pagination": {
      "page": 1,
      "limit": 50,
      "total": 1,
      "totalPages": 1
    }
  }
}
```

### Empty List Response
All endpoints return valid JSON objects even when no results are found:
```json
{
  "success": true,
  "data": {
    "customers": []
  },
  "meta": {
    "timestamp": "2024-01-01T10:00:00Z",
    "version": "1.0.0",
    "requestId": "req_87654321",
    "pagination": {
      "page": 1,
      "limit": 50,
      "total": 0,
      "totalPages": 0
    }
  }
}
```

### Single Resource Response (Create/Update/Get)
```json
{
  "success": true,
  "data": {
    "message": "Customer created successfully",
    "customer": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "customerNumber": "CUST-002",
      "type": "PERSON",
      "tier": "STANDARD",
      "status": "ACTIVE",
      "createdAt": "2024-01-01T10:05:00Z",
      "person": {
        "firstName": "John",
        "lastName": "Doe",
        "email": "john@example.com"
      }
    }
  },
  "meta": {
    "timestamp": "2024-01-01T10:05:00Z",
    "version": "1.0.0",
    "requestId": "req_abcd1234"
  }
}
```

### Validation Error Response
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data provided",
    "details": [
      {
        "type": "field",
        "value": "",
        "msg": "Valid customer type is required",
        "path": "type",
        "location": "body"
      }
    ],
    "timestamp": "2024-01-01T10:00:00Z"
  },
  "meta": {
    "timestamp": "2024-01-01T10:00:00Z",
    "version": "1.0.0",
    "requestId": "req_error123"
  }
}
```

## Organization & Multi-Tenancy

### Organization Context
All API endpoints (except authentication) require organization context:

```
BASE_URL/organizations/{orgId}/resource
```

### Organization Management
```
POST   /organizations                    # Create organization
GET    /organizations                    # List user's organizations
GET    /organizations/{orgId}            # Get organization details
PUT    /organizations/{orgId}            # Update organization
DELETE /organizations/{orgId}            # Delete organization

GET    /organizations/{orgId}/users      # List organization users
POST   /organizations/{orgId}/users      # Invite user
PUT    /organizations/{orgId}/users/{id} # Update user role
DELETE /organizations/{orgId}/users/{id} # Remove user

GET    /organizations/{orgId}/settings   # Get organization settings
PUT    /organizations/{orgId}/settings   # Update organization settings
```

## Authentication & Security Endpoints

### User Authentication
```
POST   /auth/register                    # User registration
POST   /auth/login                       # User login
POST   /auth/logout                      # User logout
POST   /auth/refresh                     # Refresh JWT token
POST   /auth/forgot-password             # Password reset request
POST   /auth/reset-password              # Password reset confirmation
POST   /auth/verify-email                # Email verification
POST   /auth/resend-verification         # Resend verification email

GET    /auth/me                          # Get current user profile
PUT    /auth/me                          # Update user profile
POST   /auth/change-password             # Change password
```

### Multi-Factor Authentication
```
POST   /auth/mfa/setup                   # Setup MFA
POST   /auth/mfa/verify                  # Verify MFA token
POST   /auth/mfa/disable                 # Disable MFA
GET    /auth/mfa/backup-codes            # Get backup codes
POST   /auth/mfa/regenerate-codes        # Generate new backup codes
```

### Session Management
```
GET    /auth/sessions                    # List active sessions
DELETE /auth/sessions/{id}               # Revoke specific session
DELETE /auth/sessions                    # Revoke all sessions
```

### API Key Management
```
GET    /organizations/{orgId}/api-keys   # List API keys
POST   /organizations/{orgId}/api-keys   # Create API key
PUT    /organizations/{orgId}/api-keys/{id}    # Update API key
DELETE /organizations/{orgId}/api-keys/{id}    # Delete API key
```

## Customer Relationship Management

### Customer Management
```
GET    /organizations/{orgId}/customers           # List customers (paginated, filtered)
POST   /organizations/{orgId}/customers           # Create customer
GET    /organizations/{orgId}/customers/{id}      # Get customer details
PUT    /organizations/{orgId}/customers/{id}      # Update customer
PATCH  /organizations/{orgId}/customers/{id}      # Partial update customer
DELETE /organizations/{orgId}/customers/{id}      # Soft delete customer

GET    /organizations/{orgId}/customers/{id}/addresses    # List customer addresses
POST   /organizations/{orgId}/customers/{id}/addresses    # Add customer address
PUT    /organizations/{orgId}/addresses/{id}              # Update address
DELETE /organizations/{orgId}/addresses/{id}              # Delete address

GET    /organizations/{orgId}/customers/{id}/payment-methods # List payment methods
POST   /organizations/{orgId}/customers/{id}/payment-methods # Add payment method
PUT    /organizations/{orgId}/payment-methods/{id}            # Update payment method
DELETE /organizations/{orgId}/payment-methods/{id}            # Delete payment method

GET    /organizations/{orgId}/customers/{id}/history        # Customer interaction history
GET    /organizations/{orgId}/customers/{id}/statements     # Customer statements
```

### Customer Search & Filtering
```
GET    /organizations/{orgId}/customers?q={query}           # Search customers
GET    /organizations/{orgId}/customers?status=active       # Filter by status
GET    /organizations/{orgId}/customers?tier=enterprise     # Filter by tier
GET    /organizations/{orgId}/customers?created_after=date  # Date range filtering
```

## Sales & Revenue Management

### Quote Management
```
GET    /organizations/{orgId}/quotes                # List quotes (paginated, filtered)
POST   /organizations/{orgId}/quotes                # Create quote
GET    /organizations/{orgId}/quotes/{id}           # Get quote details
PUT    /organizations/{orgId}/quotes/{id}           # Update quote
DELETE /organizations/{orgId}/quotes/{id}           # Delete quote

POST   /organizations/{orgId}/quotes/{id}/send      # Send quote to customer
POST   /organizations/{orgId}/quotes/{id}/accept    # Accept quote (customer action)
POST   /organizations/{orgId}/quotes/{id}/reject    # Reject quote (customer action)
POST   /organizations/{orgId}/quotes/{id}/convert   # Convert quote to invoice/project

GET    /organizations/{orgId}/quotes/{id}/items     # List quote items
POST   /organizations/{orgId}/quotes/{id}/items     # Add quote item
PUT    /organizations/{orgId}/quote-items/{id}      # Update quote item
DELETE /organizations/{orgId}/quote-items/{id}      # Delete quote item

GET    /organizations/{orgId}/quotes/{id}/pdf       # Generate quote PDF
GET    /organizations/{orgId}/quotes/{id}/preview   # Preview quote
```

### Project Management
```
GET    /organizations/{orgId}/projects              # List projects (paginated, filtered)
POST   /organizations/{orgId}/projects              # Create project
GET    /organizations/{orgId}/projects/{id}         # Get project details
PUT    /organizations/{orgId}/projects/{id}         # Update project
DELETE /organizations/{orgId}/projects/{id}         # Delete project

POST   /organizations/{orgId}/projects/{id}/start   # Start project
POST   /organizations/{orgId}/projects/{id}/pause   # Pause project
POST   /organizations/{orgId}/projects/{id}/complete # Complete project
POST   /organizations/{orgId}/projects/{id}/cancel  # Cancel project

GET    /organizations/{orgId}/projects/{id}/milestones    # List project milestones
POST   /organizations/{orgId}/projects/{id}/milestones    # Create milestone
PUT    /organizations/{orgId}/milestones/{id}             # Update milestone
DELETE /organizations/{orgId}/milestones/{id}             # Delete milestone
POST   /organizations/{orgId}/milestones/{id}/complete    # Complete milestone

GET    /organizations/{orgId}/projects/{id}/time-entries  # List time entries
POST   /organizations/{orgId}/projects/{id}/time-entries  # Create time entry
PUT    /organizations/{orgId}/time-entries/{id}           # Update time entry
DELETE /organizations/{orgId}/time-entries/{id}           # Delete time entry

GET    /organizations/{orgId}/projects/{id}/budget        # Project budget analysis
GET    /organizations/{orgId}/projects/{id}/profitability # Project profitability
```

### Invoice Management
```
GET    /organizations/{orgId}/invoices              # List invoices (paginated, filtered)
POST   /organizations/{orgId}/invoices              # Create invoice
GET    /organizations/{orgId}/invoices/{id}         # Get invoice details
PUT    /organizations/{orgId}/invoices/{id}         # Update invoice
DELETE /organizations/{orgId}/invoices/{id}         # Delete invoice

POST   /organizations/{orgId}/invoices/{id}/send    # Send invoice to customer
POST   /organizations/{orgId}/invoices/{id}/remind  # Send payment reminder
POST   /organizations/{orgId}/invoices/{id}/cancel  # Cancel invoice
POST   /organizations/{orgId}/invoices/{id}/void    # Void invoice

GET    /organizations/{orgId}/invoices/{id}/line-items    # List invoice line items
POST   /organizations/{orgId}/invoices/{id}/line-items    # Add line item
PUT    /organizations/{orgId}/line-items/{id}             # Update line item
DELETE /organizations/{orgId}/line-items/{id}             # Delete line item

GET    /organizations/{orgId}/invoices/{id}/pdf     # Generate invoice PDF
GET    /organizations/{orgId}/invoices/{id}/payments # List invoice payments
GET    /organizations/{orgId}/invoices/{id}/history # Invoice history/status changes
```

### Recurring Invoice Management
```
GET    /organizations/{orgId}/recurring-invoices         # List recurring invoices
POST   /organizations/{orgId}/recurring-invoices         # Create recurring invoice
GET    /organizations/{orgId}/recurring-invoices/{id}    # Get recurring invoice details
PUT    /organizations/{orgId}/recurring-invoices/{id}    # Update recurring invoice
DELETE /organizations/{orgId}/recurring-invoices/{id}    # Delete recurring invoice

POST   /organizations/{orgId}/recurring-invoices/{id}/pause  # Pause recurring invoice
POST   /organizations/{orgId}/recurring-invoices/{id}/resume # Resume recurring invoice
POST   /organizations/{orgId}/recurring-invoices/{id}/generate # Generate next invoice
```

## Payment Processing & Financial Management

### Payment Processing
```
GET    /organizations/{orgId}/payments             # List payments (paginated, filtered)
POST   /organizations/{orgId}/payments             # Create/record payment
GET    /organizations/{orgId}/payments/{id}        # Get payment details
PUT    /organizations/{orgId}/payments/{id}        # Update payment
POST   /organizations/{orgId}/payments/{id}/refund # Process refund
POST   /organizations/{orgId}/payments/{id}/void   # Void payment

# Stripe Integration
POST   /organizations/{orgId}/payments/stripe/intent      # Create Stripe payment intent
POST   /organizations/{orgId}/payments/stripe/webhook     # Stripe webhook endpoint
GET    /organizations/{orgId}/payments/stripe/methods     # List Stripe payment methods

# Alternative Payment Methods
POST   /organizations/{orgId}/payments/e-transfer         # Record e-transfer payment
POST   /organizations/{orgId}/payments/cash               # Record cash payment
POST   /organizations/{orgId}/payments/bank-transfer      # Record bank transfer
POST   /organizations/{orgId}/payments/check              # Record check payment

# Payment Reconciliation
GET    /organizations/{orgId}/payments/unreconciled       # List unreconciled payments
POST   /organizations/{orgId}/payments/{id}/reconcile     # Reconcile payment
GET    /organizations/{orgId}/payments/reconciliation     # Reconciliation report
```

### Bank Account Management
```
GET    /organizations/{orgId}/bank-accounts               # List bank accounts
POST   /organizations/{orgId}/bank-accounts               # Add bank account
GET    /organizations/{orgId}/bank-accounts/{id}          # Get bank account details
PUT    /organizations/{orgId}/bank-accounts/{id}          # Update bank account
DELETE /organizations/{orgId}/bank-accounts/{id}          # Remove bank account

GET    /organizations/{orgId}/bank-accounts/{id}/transactions    # List bank transactions
POST   /organizations/{orgId}/bank-accounts/{id}/transactions    # Import bank transactions
PUT    /organizations/{orgId}/bank-transactions/{id}             # Update bank transaction
POST   /organizations/{orgId}/bank-transactions/{id}/reconcile   # Reconcile transaction

GET    /organizations/{orgId}/bank-reconciliation                # Bank reconciliation report
POST   /organizations/{orgId}/bank-reconciliation               # Run reconciliation process
```

## Vendor & Purchase Management

### Vendor Management
```
GET    /organizations/{orgId}/vendors               # List vendors
POST   /organizations/{orgId}/vendors               # Create vendor
GET    /organizations/{orgId}/vendors/{id}          # Get vendor details
PUT    /organizations/{orgId}/vendors/{id}          # Update vendor
DELETE /organizations/{orgId}/vendors/{id}          # Delete vendor

GET    /organizations/{orgId}/vendors/{id}/addresses     # List vendor addresses
POST   /organizations/{orgId}/vendors/{id}/addresses     # Add vendor address

GET    /organizations/{orgId}/vendors/{id}/purchase-orders # List vendor purchase orders
GET    /organizations/{orgId}/vendors/{id}/bills          # List vendor bills
GET    /organizations/{orgId}/vendors/{id}/payments       # List vendor payments
```

### Purchase Order Management
```
GET    /organizations/{orgId}/purchase-orders          # List purchase orders
POST   /organizations/{orgId}/purchase-orders          # Create purchase order
GET    /organizations/{orgId}/purchase-orders/{id}     # Get purchase order details
PUT    /organizations/{orgId}/purchase-orders/{id}     # Update purchase order
DELETE /organizations/{orgId}/purchase-orders/{id}     # Delete purchase order

POST   /organizations/{orgId}/purchase-orders/{id}/send      # Send PO to vendor
POST   /organizations/{orgId}/purchase-orders/{id}/receive   # Mark items as received
POST   /organizations/{orgId}/purchase-orders/{id}/cancel    # Cancel purchase order

GET    /organizations/{orgId}/purchase-orders/{id}/line-items # List PO line items
POST   /organizations/{orgId}/purchase-orders/{id}/line-items # Add line item
PUT    /organizations/{orgId}/po-line-items/{id}              # Update line item
DELETE /organizations/{orgId}/po-line-items/{id}              # Delete line item
```

### Bill Management
```
GET    /organizations/{orgId}/bills                 # List bills
POST   /organizations/{orgId}/bills                 # Create bill
GET    /organizations/{orgId}/bills/{id}            # Get bill details
PUT    /organizations/{orgId}/bills/{id}            # Update bill
DELETE /organizations/{orgId}/bills/{id}            # Delete bill

POST   /organizations/{orgId}/bills/{id}/approve    # Approve bill for payment
POST   /organizations/{orgId}/bills/{id}/pay        # Mark bill as paid
POST   /organizations/{orgId}/bills/{id}/dispute    # Dispute bill

GET    /organizations/{orgId}/bills/{id}/line-items # List bill line items
POST   /organizations/{orgId}/bills/{id}/line-items # Add line item
PUT    /organizations/{orgId}/bill-line-items/{id}  # Update line item
DELETE /organizations/{orgId}/bill-line-items/{id}  # Delete line item
```

## Product & Inventory Management

### Product Catalog
```
GET    /organizations/{orgId}/products              # List products
POST   /organizations/{orgId}/products              # Create product
GET    /organizations/{orgId}/products/{id}         # Get product details
PUT    /organizations/{orgId}/products/{id}         # Update product
DELETE /organizations/{orgId}/products/{id}         # Delete product

GET    /organizations/{orgId}/product-categories    # List product categories
POST   /organizations/{orgId}/product-categories    # Create category
PUT    /organizations/{orgId}/product-categories/{id} # Update category
DELETE /organizations/{orgId}/product-categories/{id} # Delete category

# Inventory Management
GET    /organizations/{orgId}/inventory              # List inventory items
POST   /organizations/{orgId}/inventory/{productId}/adjust # Adjust inventory
GET    /organizations/{orgId}/inventory/{productId}  # Get product inventory
PUT    /organizations/{orgId}/inventory/{productId}  # Update inventory settings

GET    /organizations/{orgId}/inventory/low-stock    # Low stock report
GET    /organizations/{orgId}/inventory/valuation    # Inventory valuation report
POST   /organizations/{orgId}/inventory/stock-count  # Physical stock count
```

## Human Resources & Payroll

### Employee Management
```
GET    /organizations/{orgId}/employees             # List employees
POST   /organizations/{orgId}/employees             # Add employee
GET    /organizations/{orgId}/employees/{id}        # Get employee details
PUT    /organizations/{orgId}/employees/{id}        # Update employee
DELETE /organizations/{orgId}/employees/{id}        # Remove employee

GET    /organizations/{orgId}/employees/{id}/time-entries   # List time entries
POST   /organizations/{orgId}/employees/{id}/time-entries   # Create time entry
PUT    /organizations/{orgId}/time-entries/{id}             # Update time entry
DELETE /organizations/{orgId}/time-entries/{id}             # Delete time entry

POST   /organizations/{orgId}/employees/{id}/time-entries/{entryId}/approve # Approve time entry
```

### Contractor Management
```
GET    /organizations/{orgId}/contractors           # List contractors
POST   /organizations/{orgId}/contractors           # Add contractor
GET    /organizations/{orgId}/contractors/{id}      # Get contractor details
PUT    /organizations/{orgId}/contractors/{id}      # Update contractor
DELETE /organizations/{orgId}/contractors/{id}      # Remove contractor

GET    /organizations/{orgId}/contractors/{id}/payments    # List contractor payments
POST   /organizations/{orgId}/contractors/{id}/payments    # Create contractor payment
PUT    /organizations/{orgId}/contractor-payments/{id}     # Update payment
POST   /organizations/{orgId}/contractor-payments/{id}/pay # Mark payment as paid

GET    /organizations/{orgId}/contractors/{id}/tax-forms   # Generate tax forms (1099, T4A)
```

## Financial Reporting & Accounting

### Chart of Accounts
```
GET    /organizations/{orgId}/accounts              # Chart of accounts
POST   /organizations/{orgId}/accounts              # Create account
GET    /organizations/{orgId}/accounts/{id}         # Get account details
PUT    /organizations/{orgId}/accounts/{id}         # Update account
DELETE /organizations/{orgId}/accounts/{id}         # Delete account

GET    /organizations/{orgId}/accounts/{id}/transactions  # Account transactions
GET    /organizations/{orgId}/accounts/{id}/balance       # Account balance history
```

### Journal Entries & Transactions
```
GET    /organizations/{orgId}/journal-entries       # List journal entries
POST   /organizations/{orgId}/journal-entries       # Create journal entry
GET    /organizations/{orgId}/journal-entries/{id}  # Get journal entry details
PUT    /organizations/{orgId}/journal-entries/{id}  # Update journal entry
DELETE /organizations/{orgId}/journal-entries/{id}  # Delete journal entry

GET    /organizations/{orgId}/transactions          # List all transactions
GET    /organizations/{orgId}/transactions/{id}     # Get transaction details
```

### Financial Reports
```
# Standard Financial Statements
GET    /organizations/{orgId}/reports/income-statement     # Income Statement (P&L)
GET    /organizations/{orgId}/reports/balance-sheet        # Balance Sheet
GET    /organizations/{orgId}/reports/cash-flow           # Cash Flow Statement
GET    /organizations/{orgId}/reports/trial-balance       # Trial Balance
GET    /organizations/{orgId}/reports/general-ledger      # General Ledger

# Accounts Receivable & Payable
GET    /organizations/{orgId}/reports/ar-aging            # Accounts Receivable Aging
GET    /organizations/{orgId}/reports/ap-aging            # Accounts Payable Aging
GET    /organizations/{orgId}/reports/customer-statements # Customer Statements

# Sales & Revenue Reports
GET    /organizations/{orgId}/reports/sales-summary       # Sales Summary
GET    /organizations/{orgId}/reports/sales-by-customer   # Sales by Customer
GET    /organizations/{orgId}/reports/sales-by-product    # Sales by Product
GET    /organizations/{orgId}/reports/revenue-recognition # Revenue Recognition Report

# Tax Reports
GET    /organizations/{orgId}/reports/tax-summary         # Tax Summary (HST/GST/Sales Tax)
GET    /organizations/{orgId}/reports/tax-collected       # Tax Collected Report
GET    /organizations/{orgId}/reports/tax-paid           # Tax Paid Report

# Business Intelligence
GET    /organizations/{orgId}/reports/profitability      # Profitability Analysis
GET    /organizations/{orgId}/reports/budget-variance    # Budget vs Actual
GET    /organizations/{orgId}/reports/cash-position      # Cash Position Report
GET    /organizations/{orgId}/reports/kpi-dashboard      # Key Performance Indicators
```

### Tax Management
```
GET    /organizations/{orgId}/tax-codes                  # List tax codes/rates
POST   /organizations/{orgId}/tax-codes                  # Create tax code
PUT    /organizations/{orgId}/tax-codes/{id}             # Update tax code

GET    /organizations/{orgId}/tax-records               # List tax filing records
POST   /organizations/{orgId}/tax-records               # Create tax record
GET    /organizations/{orgId}/tax-records/{id}          # Get tax record details
PUT    /organizations/{orgId}/tax-records/{id}          # Update tax record

GET    /organizations/{orgId}/tax-calculations          # Tax calculation history
POST   /organizations/{orgId}/tax-calculations/calculate # Calculate taxes for period
```

## Document & File Management

### Document Management
```
GET    /organizations/{orgId}/documents                 # List documents
POST   /organizations/{orgId}/documents                 # Upload document
GET    /organizations/{orgId}/documents/{id}            # Download document
PUT    /organizations/{orgId}/documents/{id}            # Update document metadata
DELETE /organizations/{orgId}/documents/{id}            # Delete document

GET    /organizations/{orgId}/documents?entity_type=invoice&entity_id={id} # Filter by entity
```

### Report Generation
```
POST   /organizations/{orgId}/reports/generate          # Generate custom report
GET    /organizations/{orgId}/reports/scheduled         # List scheduled reports
POST   /organizations/{orgId}/reports/schedule          # Schedule report
DELETE /organizations/{orgId}/reports/scheduled/{id}    # Delete scheduled report
```

## Notifications & Communication

### Notification Management
```
GET    /organizations/{orgId}/notifications             # List notifications
PUT    /organizations/{orgId}/notifications/{id}/read   # Mark notification as read
DELETE /organizations/{orgId}/notifications/{id}        # Delete notification
POST   /organizations/{orgId}/notifications/mark-all-read # Mark all as read
```

### Email & Communication
```
POST   /organizations/{orgId}/communications/send-email     # Send custom email
GET    /organizations/{orgId}/communications/templates      # List email templates
POST   /organizations/{orgId}/communications/templates      # Create email template
PUT    /organizations/{orgId}/communications/templates/{id} # Update email template

GET    /organizations/{orgId}/communications/history        # Communication history
```

## Webhook & Integration Management

### Webhook Management
```
GET    /organizations/{orgId}/webhooks                  # List webhooks
POST   /organizations/{orgId}/webhooks                  # Create webhook
GET    /organizations/{orgId}/webhooks/{id}             # Get webhook details
PUT    /organizations/{orgId}/webhooks/{id}             # Update webhook
DELETE /organizations/{orgId}/webhooks/{id}             # Delete webhook

GET    /organizations/{orgId}/webhooks/{id}/deliveries  # List webhook deliveries
POST   /organizations/{orgId}/webhooks/{id}/test        # Test webhook
POST   /organizations/{orgId}/webhooks/{id}/replay/{deliveryId} # Replay delivery
```

### Integration Endpoints
```
GET    /organizations/{orgId}/integrations              # List available integrations
POST   /organizations/{orgId}/integrations/{provider}/connect # Connect integration
DELETE /organizations/{orgId}/integrations/{provider}   # Disconnect integration
GET    /organizations/{orgId}/integrations/{provider}/status # Get integration status

# Third-party Data Sync
POST   /organizations/{orgId}/sync/quickbooks           # Sync with QuickBooks
POST   /organizations/{orgId}/sync/xero                 # Sync with Xero
POST   /organizations/{orgId}/sync/stripe               # Sync Stripe data
POST   /organizations/{orgId}/sync/banks                # Sync bank transactions
```

## Administration & Analytics

### User & Permission Management
```
GET    /organizations/{orgId}/users                     # List organization users
POST   /organizations/{orgId}/users                     # Invite user to organization
PUT    /organizations/{orgId}/users/{id}                # Update user role/permissions
DELETE /organizations/{orgId}/users/{id}                # Remove user from organization

GET    /organizations/{orgId}/roles                     # List available roles
POST   /organizations/{orgId}/roles                     # Create custom role
PUT    /organizations/{orgId}/roles/{id}                # Update role permissions
DELETE /organizations/{orgId}/roles/{id}                # Delete custom role
```

### Analytics & Business Intelligence
```
GET    /organizations/{orgId}/analytics/dashboard       # Dashboard analytics
GET    /organizations/{orgId}/analytics/revenue         # Revenue analytics
GET    /organizations/{orgId}/analytics/customers       # Customer analytics
GET    /organizations/{orgId}/analytics/projects        # Project analytics
GET    /organizations/{orgId}/analytics/expenses        # Expense analytics
GET    /organizations/{orgId}/analytics/cash-flow       # Cash flow analytics
GET    /organizations/{orgId}/analytics/profitability   # Profitability analytics

# Advanced Analytics
GET    /organizations/{orgId}/analytics/forecasting     # Financial forecasting
GET    /organizations/{orgId}/analytics/trends          # Business trend analysis
GET    /organizations/{orgId}/analytics/benchmarks      # Industry benchmarks
```

### Audit & Compliance
```
GET    /organizations/{orgId}/audit-logs                # Audit log entries
GET    /organizations/{orgId}/audit-logs?entity_type=invoice # Filter audit logs
GET    /organizations/{orgId}/compliance/status         # Compliance status report
GET    /organizations/{orgId}/compliance/pci            # PCI compliance status

# Security & Monitoring
GET    /organizations/{orgId}/security/events           # Security events
POST   /organizations/{orgId}/security/events/{id}/resolve # Resolve security event
GET    /organizations/{orgId}/security/anomalies        # Detect security anomalies
```

### System Administration
```
GET    /system/health                                   # System health check
GET    /system/metrics                                  # System performance metrics
GET    /system/status                                   # Service status
GET    /system/version                                  # API version information

# Admin-only endpoints
GET    /admin/organizations                             # List all organizations (super admin)
GET    /admin/users                                     # List all users (super admin)
GET    /admin/system/logs                               # System logs (super admin)
GET    /admin/system/performance                        # Performance metrics (super admin)
```

## Data Export & Import

### Export Capabilities
```
GET    /organizations/{orgId}/export/customers?format=csv        # Export customers
GET    /organizations/{orgId}/export/invoices?format=excel       # Export invoices
GET    /organizations/{orgId}/export/transactions?format=qbo     # Export to QuickBooks
GET    /organizations/{orgId}/export/financial-data?format=json  # Export financial data

POST   /organizations/{orgId}/export/custom                      # Custom data export
GET    /organizations/{orgId}/export/jobs                        # List export jobs
GET    /organizations/{orgId}/export/jobs/{id}/download          # Download export file
```

### Import Capabilities
```
POST   /organizations/{orgId}/import/customers                   # Import customers
POST   /organizations/{orgId}/import/products                    # Import products
POST   /organizations/{orgId}/import/transactions                # Import transactions
POST   /organizations/{orgId}/import/bank-statements             # Import bank statements

GET    /organizations/{orgId}/import/jobs                        # List import jobs
GET    /organizations/{orgId}/import/jobs/{id}/status            # Import job status
POST   /organizations/{orgId}/import/jobs/{id}/validate          # Validate import data
```

## Query Parameters & Filtering

### Common Query Parameters
- `page`: Page number for pagination (default: 1)
- `limit`: Number of items per page (default: 50, max: 200)
- `sort`: Sort field (e.g., `created_at`, `-name` for descending)
- `q`: Search query string
- `status`: Filter by status
- `created_after`: Date filter (ISO 8601 format)
- `created_before`: Date filter (ISO 8601 format)
- `include`: Include related resources

### Advanced Filtering Examples
```
# Search customers by name or email
GET /organizations/{orgId}/customers?q=john+doe

# Filter invoices by status and date range
GET /organizations/{orgId}/invoices?status=unpaid&created_after=2024-01-01&created_before=2024-12-31

# Sort payments by amount (descending) and include customer data
GET /organizations/{orgId}/payments?sort=-amount&include=customer

# Complex filtering with multiple parameters
GET /organizations/{orgId}/transactions?account_type=revenue&amount_gte=1000&date_range=last_quarter
```

## Error Handling & Validation

### Validation Error Example
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request contains invalid data",
    "details": [
      {
        "field": "email",
        "message": "Valid email address is required",
        "code": "INVALID_EMAIL",
        "value": "invalid-email"
      },
      {
        "field": "amount",
        "message": "Amount must be greater than 0",
        "code": "INVALID_AMOUNT",
        "value": -100
      }
    ]
  },
  "meta": {
    "timestamp": "2024-01-01T00:00:00Z",
    "version": "1.0.0",
    "requestId": "req_12345"
  }
}
```

### Business Logic Error Example
```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_BALANCE",
    "message": "Customer has insufficient credit balance for this operation",
    "details": {
      "requested_amount": 1000.00,
      "available_balance": 250.00,
      "customer_id": "cust_12345"
    }
  },
  "meta": {
    "timestamp": "2024-01-01T00:00:00Z",
    "version": "1.0.0",
    "requestId": "req_12345"
  }
}
```

## API Versioning & Deprecation

### Version Management
- **Current Version**: v1
- **Version Header**: `API-Version: 1.0`
- **Backward Compatibility**: Maintained for 2 years
- **Deprecation Notice**: 6 months advance notice
- **Migration Path**: Detailed migration guides provided

### Feature Flags
- **Beta Features**: Available with `X-Enable-Beta-Features: true` header
- **Experimental**: Clearly marked and subject to change
- **Stable**: Production-ready features with SLA guarantees

---

*This API specification provides comprehensive coverage for universal accounting operations while maintaining flexibility for businesses of all sizes and industries. The design prioritizes security, performance, and ease of integration while supporting complex business workflows and compliance requirements.*