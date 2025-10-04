# API Documentation Summary

**API Name:** Accounting API
**Version:** 1.0.0
**Total Endpoints:** 283


Bank-level secure REST API for universal accounting and financial operations.

## Features
- JWT authentication with refresh tokens
- Role-based access control (6 roles)
- Multi-tenant architecture with organization isolation
- Comprehensive validation with express-validator
- Audit logging for all operations
- Stripe payment integration
- File upload capabilities
- Complex filtering and pagination

## Security
This API implements bank-level security measures including:
- End-to-end encryption
- Rate limiting
- CORS protection
- Helmet security headers
- Input validation and sanitization
- Audit trail for all operations

## Authentication
The API uses JWT tokens for authentication. Include the Bearer token in the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

## Rate Limiting
API requests are rate-limited. See response headers for current limits:
- `X-RateLimit-Limit`: Request limit per window
- `X-RateLimit-Remaining`: Remaining requests in window
- `X-RateLimit-Reset`: Time when window resets
      

## Table of Contents

- [Accounting](#accounting) (8 endpoints)
- [Accounts](#accounts) (8 endpoints)
- [Appointments](#appointments) (9 endpoints)
- [Audit](#audit) (20 endpoints)
- [Authentication](#authentication) (13 endpoints)
- [Calendar Sync](#calendar-sync) (3 endpoints)
- [Customers](#customers) (11 endpoints)
- [Documents](#documents) (11 endpoints)
- [Domain Verification](#domain-verification) (3 endpoints)
- [E-Transfers](#e-transfers) (7 endpoints)
- [Financial Statements](#financial-statements) (8 endpoints)
- [Google OAuth](#google-oauth) (4 endpoints)
- [Inventory](#inventory) (13 endpoints)
- [Invoice PDF](#invoice-pdf) (3 endpoints)
- [Invoice Styles](#invoice-styles) (5 endpoints)
- [Invoice Templates](#invoice-templates) (8 endpoints)
- [Invoices](#invoices) (10 endpoints)
- [Manual Payments](#manual-payments) (6 endpoints)
- [Notification Settings](#notification-settings) (8 endpoints)
- [Organization Assets](#organization-assets) (2 endpoints)
- [Organization Settings](#organization-settings) (6 endpoints)
- [Organizations](#organizations) (11 endpoints)
- [Payment Analytics](#payment-analytics) (7 endpoints)
- [Payments](#payments) (9 endpoints)
- [Projects](#projects) (11 endpoints)
- [Public Intake](#public-intake) (7 endpoints)
- [Public Payment Portal](#public-payment-portal) (8 endpoints)
- [Public Quotes](#public-quotes) (4 endpoints)
- [Purchase Orders](#purchase-orders) (10 endpoints)
- [Quotes](#quotes) (13 endpoints)
- [System Preferences](#system-preferences) (9 endpoints)
- [Tax](#tax) (14 endpoints)
- [Users](#users) (10 endpoints)
- [Vendors](#vendors) (7 endpoints)

---

## Accounting

### 🟢 POST `/api/v1/organizations/{organizationId}/accounting/business-transactions`

**Summary:** Create a business transaction from template

### 🔵 GET `/api/v1/organizations/{organizationId}/accounting/transaction-types`

**Summary:** Get available business transaction types

### 🟢 POST `/api/v1/organizations/{organizationId}/accounting/transactions`

**Summary:** Create a new journal transaction

### 🟢 POST `/api/v1/organizations/{organizationId}/accounting/transactions/{transactionId}/reverse`

**Summary:** Reverse a transaction

### 🔵 GET `/api/v1/organizations/{organizationId}/accounting/trial-balance`

**Summary:** Generate trial balance

### 🔵 GET `/api/v1/organizations/{organizationId}/accounting/trial-balance/export`

**Summary:** Export trial balance

### 🔵 GET `/api/v1/organizations/{organizationId}/accounting/trial-balance/report`

**Summary:** Generate comprehensive trial balance report

### 🔵 GET `/api/v1/organizations/{organizationId}/accounting/validate`

**Summary:** Validate accounting equation (Assets = Liabilities + Equity)

---

## Accounts

### 🔵 GET `/api/v1/organizations/{organizationId}/accounting/accounts`

**Summary:** Get chart of accounts

### 🟢 POST `/api/v1/organizations/{organizationId}/accounting/accounts`

**Summary:** Create a new account

### 🔵 GET `/api/v1/organizations/{organizationId}/accounting/accounts/{accountId}`

**Summary:** Get account by ID

### 🟡 PUT `/api/v1/organizations/{organizationId}/accounting/accounts/{accountId}`

**Summary:** Update account

### 🔴 DELETE `/api/v1/organizations/{organizationId}/accounting/accounts/{accountId}`

**Summary:** Delete account (soft delete if no transactions)

### 🔵 GET `/api/v1/organizations/{organizationId}/accounting/accounts/{accountId}/balance`

**Summary:** Get account balance

### 🔵 GET `/api/v1/organizations/{organizationId}/accounting/accounts/hierarchy`

**Summary:** Get account hierarchy

### 🟢 POST `/api/v1/organizations/{organizationId}/accounting/accounts/standard`

**Summary:** Create standard chart of accounts for business type

---

## Appointments

### 🔵 GET `/appointments`

**Summary:** List appointments

### 🟢 POST `/appointments`

**Summary:** Create a new appointment

### 🔵 GET `/appointments/{id}`

**Summary:** Get appointment details

### 🟡 PUT `/appointments/{id}`

**Summary:** Update appointment

### 🟢 POST `/appointments/{id}/cancel`

**Summary:** Cancel appointment

### 🟢 POST `/appointments/{id}/complete`

**Summary:** Complete appointment

### 🟢 POST `/appointments/{id}/confirm`

**Summary:** Confirm appointment

### 🟢 POST `/appointments/{id}/reschedule`

**Summary:** Reschedule appointment

### 🔵 GET `/appointments/stats/summary`

**Summary:** Get appointment statistics

---

## Audit

### 🔵 GET `/audit/audit-stream`

**Summary:** Get audit stream configuration

### 🔵 GET `/audit/entity/{entityType}/{entityId}/history`

**Summary:** Get entity history

### 🔵 GET `/audit/export`

**Summary:** Export audit logs

### 🔵 GET `/audit/export/csv`

**Summary:** Export audit logs as CSV

### 🔵 GET `/audit/export/json`

**Summary:** Export audit logs as JSON

### 🔵 GET `/audit/logs`

**Summary:** Get audit logs

### 🔵 GET `/audit/security-metrics`

**Summary:** Get security metrics dashboard

### 🔵 GET `/audit/security-metrics/access-control`

**Summary:** Get access control metrics

### 🔵 GET `/audit/security-metrics/compliance`

**Summary:** Get compliance metrics

### 🔵 GET `/audit/security-metrics/login`

**Summary:** Get login security metrics

### 🔵 GET `/audit/security-summary`

**Summary:** Get security summary

### 🔵 GET `/audit/sessions`

**Summary:** Get active user sessions

### 🟢 POST `/audit/sessions/{sessionId}/revoke`

**Summary:** Revoke a specific session

### 🟡 PUT `/audit/stream/config`

**Summary:** Update audit stream configuration

### 🔵 GET `/audit/suspicious-activity`

**Summary:** Get suspicious activity alerts

### 🔵 GET `/audit/suspicious-activity/patterns`

**Summary:** Get suspicious activity patterns

### 🔵 GET `/audit/users/{userId}/activity`

**Summary:** Get user activity timeline

### 🔵 GET `/audit/users/{userId}/activity/summary`

**Summary:** Get user activity summary

### 🟢 POST `/audit/users/{userId}/sessions/revoke-all`

**Summary:** Revoke all sessions for a user

### 🔵 GET `/audit/users/current/activity/summary`

**Summary:** Get current user's activity summary

---

## Authentication

### 🟢 POST `/auth/2fa/disable`

**Summary:** Disable two-factor authentication

### 🟢 POST `/auth/2fa/enable`

**Summary:** Enable two-factor authentication

### 🟢 POST `/auth/2fa/verify`

**Summary:** Verify two-factor authentication

### 🟢 POST `/auth/change-password`

**Summary:** Change user password

### 🟢 POST `/auth/login`

**Summary:** Authenticate user

### 🟢 POST `/auth/logout`

**Summary:** Logout current session

### 🟢 POST `/auth/logout-all`

**Summary:** Logout all sessions

### 🔵 GET `/auth/profile`

**Summary:** Get user profile

### 🟡 PUT `/auth/profile`

**Summary:** Update user profile

### 🟢 POST `/auth/refresh`

**Summary:** Refresh access token

### 🟢 POST `/auth/register`

**Summary:** Register a new user

### 🟢 POST `/auth/reset-password`

**Summary:** Reset password

### 🟢 POST `/auth/reset-password-request`

**Summary:** Request password reset

---

## Calendar Sync

### 🟢 POST `/api/v1/organizations/{orgId}/sync/calendar/manual`

**Summary:** Trigger manual calendar sync

### 🔵 GET `/api/v1/organizations/{orgId}/sync/calendar/status`

**Summary:** Get calendar sync status

### 🟢 POST `/api/v1/organizations/{orgId}/sync/calendar/webhook`

**Summary:** Google Calendar webhook

---

## Customers

### 🔵 GET `/customers`

**Summary:** List customers

### 🟢 POST `/customers`

**Summary:** Create a new customer

### 🔵 GET `/customers/{id}`

**Summary:** Get customer by ID

### 🟡 PUT `/customers/{id}`

**Summary:** Update customer

### 🔴 DELETE `/customers/{id}`

**Summary:** Delete customer

### 🔵 GET `/customers/{id}/stats`

**Summary:** Get customer statistics

### 🔵 GET `/organizations/{organizationId}/customers`

**Summary:** List customers with filtering and pagination

### 🟢 POST `/organizations/{organizationId}/customers`

**Summary:** Create a new customer

### 🔵 GET `/organizations/{organizationId}/customers/{id}`

**Summary:** Get customer details

### 🟡 PUT `/organizations/{organizationId}/customers/{id}`

**Summary:** Update customer details

### 🔴 DELETE `/organizations/{organizationId}/customers/{id}`

**Summary:** Delete customer (soft delete)

---

## Documents

### 🔵 GET `/documents`

**Summary:** Get list of documents

### 🟢 POST `/documents`

**Summary:** Upload a new document

### 🔵 GET `/documents/{id}`

**Summary:** Get a specific document

### 🟡 PUT `/documents/{id}`

**Summary:** Update a document

### 🔴 DELETE `/documents/{id}`

**Summary:** Delete a document

### 🟢 POST `/documents/{id}/attach`

**Summary:** Attach a document to an entity

### 🔵 GET `/documents/{id}/download`

**Summary:** Download a document file

### 🔵 GET `/documents/{id}/versions`

**Summary:** Get all versions of a document

### 🟢 POST `/documents/{id}/versions`

**Summary:** Create a new version of a document

### 🟢 POST `/documents/bulk`

**Summary:** Upload multiple documents

### 🔵 GET `/documents/stats`

**Summary:** Get document statistics

---

## Domain Verification

### 🟢 POST `/organizations/verify-domain`

**Summary:** Request domain ownership verification

### 🔵 GET `/organizations/verify-domain/{domain}`

**Summary:** Check domain verification status

### 🟢 POST `/organizations/verify-domain/{domain}/verify`

**Summary:** Verify domain ownership via DNS

---

## E-Transfers

### 🔵 GET `/etransfers`

**Summary:** List e-transfers

### 🟢 POST `/etransfers`

**Summary:** Create a new e-transfer

### 🔵 GET `/etransfers/{etransferNumber}`

**Summary:** Get e-transfer details

### 🟡 PUT `/etransfers/{etransferNumber}/cancel`

**Summary:** Cancel e-transfer

### 🟡 PUT `/etransfers/{etransferNumber}/confirm`

**Summary:** Confirm e-transfer deposit

### 🟢 POST `/etransfers/maintenance/check-expired`

**Summary:** Check and process expired e-transfers

### 🔵 GET `/etransfers/stats/summary`

**Summary:** Get e-transfer statistics

---

## Financial Statements

### 🔵 GET `/api/v1/organizations/{organizationId}/financial-statements/balance-sheet`

**Summary:** Generate balance sheet

### 🔵 GET `/api/v1/organizations/{organizationId}/financial-statements/cash-flow`

**Summary:** Generate cash flow statement

### 🔵 GET `/api/v1/organizations/{organizationId}/financial-statements/comparison`

**Summary:** Generate comparative financial statements

### 🔵 GET `/api/v1/organizations/{organizationId}/financial-statements/comprehensive`

**Summary:** Generate comprehensive financial statements package

### 🟢 POST `/api/v1/organizations/{organizationId}/financial-statements/export`

**Summary:** Export financial statements

### 🔵 GET `/api/v1/organizations/{organizationId}/financial-statements/history`

**Summary:** Get financial statement generation history

### 🔵 GET `/api/v1/organizations/{organizationId}/financial-statements/income-statement`

**Summary:** Generate income statement

### 🔵 GET `/api/v1/organizations/{organizationId}/financial-statements/ratios`

**Summary:** Calculate financial ratios

---

## Google OAuth

### 🔵 GET `/api/v1/auth/google`

**Summary:** Initiate Google OAuth flow

### 🔵 GET `/api/v1/auth/google/callback`

**Summary:** Google OAuth callback

### 🟢 POST `/api/v1/auth/google/disconnect`

**Summary:** Disconnect Google Calendar

### 🔵 GET `/api/v1/auth/google/status`

**Summary:** Get Google Calendar connection status

---

## Inventory

### 🔵 GET `/api/v1/organizations/{organizationId}/inventory`

**Summary:** List inventory items

### 🟢 POST `/api/v1/organizations/{organizationId}/inventory`

**Summary:** Create inventory item

### 🔵 GET `/api/v1/organizations/{organizationId}/inventory/{itemId}`

**Summary:** Get inventory item details

### 🟡 PUT `/api/v1/organizations/{organizationId}/inventory/{itemId}`

**Summary:** Update inventory item

### 🔴 DELETE `/api/v1/organizations/{organizationId}/inventory/{itemId}`

**Summary:** Delete inventory item

### 🟢 POST `/api/v1/organizations/{organizationId}/inventory/{itemId}/adjust`

**Summary:** Adjust inventory quantity

### 🟢 POST `/api/v1/organizations/{organizationId}/inventory/{itemId}/stock-count`

**Summary:** Perform physical stock count

### 🟢 POST `/api/v1/organizations/{organizationId}/inventory/{itemId}/transfer`

**Summary:** Transfer inventory between locations

### 🔵 GET `/api/v1/organizations/{organizationId}/inventory/low-stock`

**Summary:** Get low stock alerts

### 🔵 GET `/api/v1/organizations/{organizationId}/inventory/stats`

**Summary:** Get inventory statistics

### 🔵 GET `/api/v1/organizations/{organizationId}/inventory/transactions`

**Summary:** Get inventory transactions

### 🟢 POST `/api/v1/organizations/{organizationId}/inventory/transactions`

**Summary:** Create inventory transaction

### 🔵 GET `/api/v1/organizations/{organizationId}/inventory/valuation`

**Summary:** Get inventory valuation report

---

## Invoice PDF

### 🔵 GET `/api/v1/organizations/{organizationId}/invoices/{id}/pdf`

**Summary:** Generate and download invoice PDF

### 🟢 POST `/api/v1/organizations/{organizationId}/invoices/{id}/pdf/regenerate`

**Summary:** Force regenerate invoice PDF

### 🔵 GET `/api/v1/organizations/{organizationId}/invoices/{id}/pdf/status`

**Summary:** Get PDF generation status

---

## Invoice Styles

### 🔵 GET `/api/v1/organizations/{organizationId}/invoice-styles`

**Summary:** Get available invoice styles

### 🟢 POST `/api/v1/organizations/{organizationId}/invoice-styles`

**Summary:** Create custom invoice style

### 🔵 GET `/api/v1/organizations/{organizationId}/invoice-styles/{id}`

**Summary:** Get single invoice style by ID

### 🟡 PUT `/api/v1/organizations/{organizationId}/invoice-styles/{id}`

**Summary:** Update invoice style

### 🔴 DELETE `/api/v1/organizations/{organizationId}/invoice-styles/{id}`

**Summary:** Delete invoice style

---

## Invoice Templates

### 🔵 GET `/api/v1/organizations/{organizationId}/invoice-templates`

**Summary:** Get available invoice templates

### 🟢 POST `/api/v1/organizations/{organizationId}/invoice-templates`

**Summary:** Create custom invoice template

### 🔵 GET `/api/v1/organizations/{organizationId}/invoice-templates/{id}`

**Summary:** Get single invoice template by ID

### 🟡 PUT `/api/v1/organizations/{organizationId}/invoice-templates/{templateId}`

**Summary:** Update invoice template

### 🔴 DELETE `/api/v1/organizations/{organizationId}/invoice-templates/{templateId}`

**Summary:** Delete invoice template

### 🟢 POST `/api/v1/organizations/{organizationId}/invoice-templates/{templateId}/duplicate`

**Summary:** Duplicate invoice template

### 🟡 PUT `/api/v1/organizations/{organizationId}/invoice-templates/{templateId}/set-default`

**Summary:** Set template as default

### 🟢 POST `/api/v1/organizations/{organizationId}/invoice-templates/preview`

**Summary:** Preview invoice template with sample data

---

## Invoices

### 🔵 GET `/invoices`

**Summary:** List invoices

### 🟢 POST `/invoices`

**Summary:** Create a new invoice

### 🔵 GET `/invoices/{id}`

**Summary:** Get invoice by ID

### 🟡 PUT `/invoices/{id}`

**Summary:** Update invoice

### 🟢 POST `/invoices/{id}/cancel`

**Summary:** Cancel invoice

### 🟢 POST `/invoices/{id}/payment`

**Summary:** Record payment for invoice

### 🟢 POST `/invoices/{id}/send`

**Summary:** Send invoice to customer

### 🟢 POST `/invoices/{id}/viewed`

**Summary:** Mark invoice as viewed

### 🟢 POST `/invoices/from-quote`

**Summary:** Create invoice from quote

### 🔵 GET `/invoices/stats/summary`

**Summary:** Get invoice statistics summary

---

## Manual Payments

### 🟢 POST `/manual-payments`

**Summary:** Create a manual payment

### 🟢 POST `/manual-payments/allocate`

**Summary:** Allocate partial payment across invoices

### 🟢 POST `/manual-payments/batch`

**Summary:** Process batch payments

### 🟡 PUT `/manual-payments/cheque/{paymentId}/status`

**Summary:** Update cheque payment status

### 🟢 POST `/manual-payments/payment-plan`

**Summary:** Create payment plan

### 🟢 POST `/manual-payments/reconcile`

**Summary:** Reconcile payments with bank statement

---

## Notification Settings

### 🔵 GET `/api/v1/organizations/{organizationId}/settings/notifications`

**Summary:** Get all notification settings

### 🟡 PUT `/api/v1/organizations/{organizationId}/settings/notifications/email`

**Summary:** Update email notification settings

### 🟡 PUT `/api/v1/organizations/{organizationId}/settings/notifications/in-app`

**Summary:** Update in-app notification settings

### 🟡 PUT `/api/v1/organizations/{organizationId}/settings/notifications/preferences`

**Summary:** Update notification preferences

### 🟡 PUT `/api/v1/organizations/{organizationId}/settings/notifications/push`

**Summary:** Update push notification settings

### 🟡 PUT `/api/v1/organizations/{organizationId}/settings/notifications/sms`

**Summary:** Update SMS notification settings

### 🟢 POST `/api/v1/organizations/{organizationId}/settings/notifications/test`

**Summary:** Test notification configuration

### 🟡 PUT `/api/v1/organizations/{organizationId}/settings/notifications/webhooks`

**Summary:** Update webhook notification settings

---

## Organization Assets

### 🟢 POST `/api/v1/organizations/{organizationId}/assets/logo`

**Summary:** Upload organization logo

### 🔴 DELETE `/api/v1/organizations/{organizationId}/assets/logo`

**Summary:** Remove organization logo

---

## Organization Settings

### 🟡 PUT `/api/v1/organizations/{organizationId}/settings/defaults`

**Summary:** Set default template and style

### 🟢 POST `/api/v1/organizations/{organizationId}/settings/initialize`

**Summary:** Initialize invoice settings

### 🔵 GET `/api/v1/organizations/{organizationId}/settings/invoice`

**Summary:** Get organization invoice settings

### 🟡 PUT `/api/v1/organizations/{organizationId}/settings/invoice`

**Summary:** Update organization invoice settings

### 🔵 GET `/api/v1/organizations/{organizationId}/settings/tax`

**Summary:** Get tax settings

### 🟡 PUT `/api/v1/organizations/{organizationId}/settings/tax`

**Summary:** Update tax settings

---

## Organizations

### 🔵 GET `/organizations`

**Summary:** List all organizations

### 🟢 POST `/organizations`

**Summary:** Create a new organization

### 🔵 GET `/organizations/{id}`

**Summary:** Get organization details

### 🟡 PUT `/organizations/{id}`

**Summary:** Update organization

### 🔴 DELETE `/organizations/{id}`

**Summary:** Deactivate organization

### 🔵 GET `/organizations/{id}/settings`

**Summary:** Get organization settings

### 🟡 PUT `/organizations/{id}/settings`

**Summary:** Update organization settings

### 🔵 GET `/organizations/{id}/stats`

**Summary:** Get organization statistics

### 🟢 POST `/organizations/verify-domain`

**Summary:** Request domain ownership verification

### 🔵 GET `/organizations/verify-domain/{domain}`

**Summary:** Check domain verification status

### 🟢 POST `/organizations/verify-domain/{domain}/verify`

**Summary:** Verify domain ownership via DNS

---

## Payment Analytics

### 🔵 GET `/payment-analytics/aging`

**Summary:** Get payment aging report

### 🔵 GET `/payment-analytics/cash-flow`

**Summary:** Get cash flow projection

### 🔵 GET `/payment-analytics/customer-behavior`

**Summary:** Get customer payment behavior analysis

### 🔵 GET `/payment-analytics/forecast`

**Summary:** Get payment forecast

### 🔵 GET `/payment-analytics/fraud-alerts`

**Summary:** Detect fraud alerts

### 🔵 GET `/payment-analytics/methods`

**Summary:** Get payment method analytics

### 🔵 GET `/payment-analytics/trends`

**Summary:** Get payment trends analysis

---

## Payments

### 🟢 POST `/organizations/{organizationId}/payments`

**Summary:** Create a new payment

### 🔵 GET `/payments`

**Summary:** List payments with filtering and pagination

### 🟢 POST `/payments`

**Summary:** Create a manual payment record

### 🔵 GET `/payments/{id}`

**Summary:** Get payment by ID

### 🟢 POST `/payments/{id}/refund`

**Summary:** Process payment refund

### 🟡 PUT `/payments/{id}/status`

**Summary:** Update payment status

### 🔵 GET `/payments/stats/summary`

**Summary:** Get payment statistics and analytics

### 🟢 POST `/payments/stripe`

**Summary:** Create Stripe payment intent

### 🟢 POST `/payments/webhook/stripe`

**Summary:** Handle Stripe webhook events

---

## Projects

### 🔵 GET `/projects`

**Summary:** List projects

### 🟢 POST `/projects`

**Summary:** Create a new project

### 🔵 GET `/projects/{id}`

**Summary:** Get project details

### 🟡 PUT `/projects/{id}`

**Summary:** Update project

### 🔴 DELETE `/projects/{id}`

**Summary:** Delete project

### 🟠 PATCH `/projects/{id}/assign`

**Summary:** Assign project to users

### 🟠 PATCH `/projects/{id}/complete`

**Summary:** Complete project

### 🟠 PATCH `/projects/{id}/start`

**Summary:** Start project

### 🟠 PATCH `/projects/{id}/time`

**Summary:** Update time tracking

### 🟢 POST `/projects/authorize`

**Summary:** Authorize work on projects

### 🔵 GET `/projects/stats/summary`

**Summary:** Get project statistics summary

---

## Public Intake

### 🟢 POST `/public/intake/initialize`

**Summary:** Initialize new intake session

### 🔵 GET `/public/intake/status`

**Summary:** Get session status

### 🟢 POST `/public/intake/step`

**Summary:** Update intake session data

### 🟢 POST `/public/intake/submit`

**Summary:** Submit intake and create customer/quote

### 🔵 GET `/public/intake/templates`

**Summary:** Get all available business templates

### 🔵 GET `/public/intake/templates/{category}`

**Summary:** Get field template for specific category

### 🟢 POST `/public/intake/templates/{category}/validate`

**Summary:** Validate custom fields

---

## Public Payment Portal

### 🟢 POST `/api/v1/public/payment/{token}/confirm`

**Summary:** Confirm payment

### 🟢 POST `/api/v1/public/payment/{token}/create-intent`

**Summary:** Create Stripe PaymentIntent

### 🔵 GET `/api/v1/public/payment/{token}/history`

**Summary:** Get payment history

### 🔵 GET `/api/v1/public/payment/{token}/invoice`

**Summary:** Get invoice details for payment

### 🔵 GET `/api/v1/public/payment/{token}/methods`

**Summary:** List saved payment methods

### 🟢 POST `/api/v1/public/payment/{token}/methods`

**Summary:** Add payment method

### 🔴 DELETE `/api/v1/public/payment/{token}/methods/{methodId}`

**Summary:** Remove payment method

### 🟡 PUT `/api/v1/public/payment/{token}/methods/{methodId}/default`

**Summary:** Set default payment method

---

## Public Quotes

### 🟢 POST `/api/v1/public/quotes/{quoteId}/accept`

**Summary:** Accept quote (public, no authentication)

### 🟢 POST `/api/v1/public/quotes/{quoteId}/reject`

**Summary:** Reject quote (public, no authentication)

### 🔵 GET `/api/v1/public/quotes/{quoteId}/status`

**Summary:** Check quote status (public, no authentication)

### 🔵 GET `/api/v1/public/quotes/{quoteId}/view`

**Summary:** View quote details (public, no authentication)

---

## Purchase Orders

### 🔵 GET `/api/v1/organizations/{organizationId}/purchase-orders`

**Summary:** List purchase orders

### 🟢 POST `/api/v1/organizations/{organizationId}/purchase-orders`

**Summary:** Create a new purchase order

### 🔵 GET `/api/v1/organizations/{organizationId}/purchase-orders/{purchaseOrderId}`

**Summary:** Get purchase order details

### 🟡 PUT `/api/v1/organizations/{organizationId}/purchase-orders/{purchaseOrderId}`

**Summary:** Update purchase order

### 🔴 DELETE `/api/v1/organizations/{organizationId}/purchase-orders/{purchaseOrderId}`

**Summary:** Delete purchase order

### 🟢 POST `/api/v1/organizations/{organizationId}/purchase-orders/{purchaseOrderId}/approve`

**Summary:** Approve purchase order

### 🟢 POST `/api/v1/organizations/{organizationId}/purchase-orders/{purchaseOrderId}/cancel`

**Summary:** Cancel purchase order

### 🟢 POST `/api/v1/organizations/{organizationId}/purchase-orders/{purchaseOrderId}/close`

**Summary:** Close purchase order

### 🟢 POST `/api/v1/organizations/{organizationId}/purchase-orders/{purchaseOrderId}/receive`

**Summary:** Receive items from purchase order

### 🔵 GET `/api/v1/organizations/{organizationId}/purchase-orders/stats`

**Summary:** Get purchase order statistics

---

## Quotes

### 🟢 POST `/organizations/{organizationId}/quotes`

**Summary:** Create a new quote

### 🔵 GET `/quotes`

**Summary:** List quotes

### 🟢 POST `/quotes`

**Summary:** Create a new quote

### 🔵 GET `/quotes/{id}`

**Summary:** Get quote by ID

### 🟡 PUT `/quotes/{id}`

**Summary:** Update quote

### 🔴 DELETE `/quotes/{id}`

**Summary:** Delete quote

### 🟢 POST `/quotes/{id}/accept`

**Summary:** Accept quote

### 🟢 POST `/quotes/{id}/convert-to-invoice`

**Summary:** Convert quote to invoice

### 🟢 POST `/quotes/{id}/duplicate`

**Summary:** Duplicate quote

### 🟢 POST `/quotes/{id}/reject`

**Summary:** Reject quote

### 🟢 POST `/quotes/{id}/send`

**Summary:** Send quote to customer

### 🟢 POST `/quotes/{id}/viewed`

**Summary:** Mark quote as viewed

### 🔵 GET `/quotes/stats/summary`

**Summary:** Get quote statistics summary

---

## System Preferences

### 🔵 GET `/api/v1/organizations/{organizationId}/settings/system`

**Summary:** Get all system preferences

### 🟡 PUT `/api/v1/organizations/{organizationId}/settings/system/api`

**Summary:** Update API settings

### 🟡 PUT `/api/v1/organizations/{organizationId}/settings/system/data-management`

**Summary:** Update data management settings

### 🟡 PUT `/api/v1/organizations/{organizationId}/settings/system/feature-flags`

**Summary:** Update feature flags

### 🟡 PUT `/api/v1/organizations/{organizationId}/settings/system/general`

**Summary:** Update general settings

### 🟡 PUT `/api/v1/organizations/{organizationId}/settings/system/integrations`

**Summary:** Update integration settings

### 🟡 PUT `/api/v1/organizations/{organizationId}/settings/system/logging`

**Summary:** Update logging settings

### 🟡 PUT `/api/v1/organizations/{organizationId}/settings/system/performance`

**Summary:** Update performance settings

### 🟡 PUT `/api/v1/organizations/{organizationId}/settings/system/regional`

**Summary:** Update regional settings

---

## Tax

### 🟢 POST `/api/v1/organizations/{organizationId}/tax/calculate`

**Summary:** Calculate tax for a transaction

### 🟢 POST `/api/v1/organizations/{organizationId}/tax/calculate/canadian`

**Summary:** Calculate Canadian tax with provincial rules

### 🟢 POST `/api/v1/organizations/{organizationId}/tax/gst-hst-return`

**Summary:** Generate GST/HST return

### 🟢 POST `/api/v1/organizations/{organizationId}/tax/itc/calculate`

**Summary:** Calculate Input Tax Credits (ITCs)

### 🟢 POST `/api/v1/organizations/{organizationId}/tax/payments`

**Summary:** Record tax payment

### 🔵 GET `/api/v1/organizations/{organizationId}/tax/rates`

**Summary:** Get tax rates for jurisdiction

### 🟢 POST `/api/v1/organizations/{organizationId}/tax/remittance`

**Summary:** Calculate tax remittance for a period

### 🟢 POST `/api/v1/tax/exempt/check`

**Summary:** Check if item is GST exempt

### 🟢 POST `/api/v1/tax/gst-number/validate`

**Summary:** Validate GST number

### 🔵 GET `/api/v1/tax/quick-method/rate`

**Summary:** Get Quick Method rate

### 🟢 POST `/api/v1/tax/rates`

**Summary:** Configure tax rate

### 🟢 POST `/api/v1/tax/rates/canadian/initialize`

**Summary:** Initialize Canadian tax rates

### 🔵 GET `/api/v1/tax/small-supplier/threshold`

**Summary:** Get small supplier threshold

### 🟢 POST `/api/v1/tax/zero-rated/check`

**Summary:** Check if item is zero-rated

---

## Users

### 🔵 GET `/users`

**Summary:** List users

### 🟢 POST `/users`

**Summary:** Create a new user

### 🔵 GET `/users/{userId}`

**Summary:** Get user by ID

### 🟡 PUT `/users/{userId}`

**Summary:** Update user

### 🔴 DELETE `/users/{userId}`

**Summary:** Delete user

### 🟢 POST `/users/{userId}/activate`

**Summary:** Activate user account

### 🟢 POST `/users/{userId}/deactivate`

**Summary:** Deactivate user account

### 🟢 POST `/users/{userId}/resend-invite`

**Summary:** Resend user invitation

### 🔵 GET `/users/{userId}/status`

**Summary:** Get user account status

### 🟢 POST `/users/invite`

**Summary:** Invite user

---

## Vendors

### 🔵 GET `/api/v1/organizations/{organizationId}/vendors`

**Summary:** List all vendors

### 🟢 POST `/api/v1/organizations/{organizationId}/vendors`

**Summary:** Create a new vendor

### 🔵 GET `/api/v1/organizations/{organizationId}/vendors/{vendorId}`

**Summary:** Get vendor details

### 🟡 PUT `/api/v1/organizations/{organizationId}/vendors/{vendorId}`

**Summary:** Update vendor

### 🔴 DELETE `/api/v1/organizations/{organizationId}/vendors/{vendorId}`

**Summary:** Delete vendor (soft delete)

### 🔵 GET `/api/v1/organizations/{organizationId}/vendors/{vendorId}/payments`

**Summary:** Get vendor payment history

### 🔵 GET `/api/v1/organizations/{organizationId}/vendors/{vendorId}/stats`

**Summary:** Get vendor performance statistics

---

## Data Models

**Total Schemas:** 28

- `Account`
- `BalanceSheet`
- `CanadianTaxContext`
- `CashFlowStatement`
- `ConflictError`
- `Currency`
- `Customer`
- `CustomerStatus`
- `CustomerTier`
- `Document`
- `Error`
- `FinancialRatios`
- `FinancialStatement`
- `GSTHSTReturn`
- `IncomeStatement`
- `JournalEntry`
- `NotFoundError`
- `Pagination`
- `PaginationMeta`
- `Payment`
- `PaymentMethod`
- `Quote`
- `TaxCalculationRequest`
- `TaxCalculationResult`
- `TaxRateResponse`
- `Timestamp`
- `Transaction`
- `User`

---

## Statistics

| Metric | Value |
|--------|-------|
| Total Endpoints | 283 |
| Total Tags/Categories | 34 |
| DELETE Endpoints | 15 |
| GET Endpoints | 115 |
| PATCH Endpoints | 4 |
| POST Endpoints | 108 |
| PUT Endpoints | 41 |
| Total Schemas | 28 |

---

## Endpoints by Method

### GET (115)

- `/api/v1/auth/google` - Initiate Google OAuth flow
- `/api/v1/auth/google/callback` - Google OAuth callback
- `/api/v1/auth/google/status` - Get Google Calendar connection status
- `/api/v1/organizations/{organizationId}/accounting/accounts` - Get chart of accounts
- `/api/v1/organizations/{organizationId}/accounting/accounts/{accountId}` - Get account by ID
- `/api/v1/organizations/{organizationId}/accounting/accounts/{accountId}/balance` - Get account balance
- `/api/v1/organizations/{organizationId}/accounting/accounts/hierarchy` - Get account hierarchy
- `/api/v1/organizations/{organizationId}/accounting/transaction-types` - Get available business transaction types
- `/api/v1/organizations/{organizationId}/accounting/trial-balance` - Generate trial balance
- `/api/v1/organizations/{organizationId}/accounting/trial-balance/export` - Export trial balance
- `/api/v1/organizations/{organizationId}/accounting/trial-balance/report` - Generate comprehensive trial balance report
- `/api/v1/organizations/{organizationId}/accounting/validate` - Validate accounting equation (Assets = Liabilities + Equity)
- `/api/v1/organizations/{organizationId}/financial-statements/balance-sheet` - Generate balance sheet
- `/api/v1/organizations/{organizationId}/financial-statements/cash-flow` - Generate cash flow statement
- `/api/v1/organizations/{organizationId}/financial-statements/comparison` - Generate comparative financial statements
- `/api/v1/organizations/{organizationId}/financial-statements/comprehensive` - Generate comprehensive financial statements package
- `/api/v1/organizations/{organizationId}/financial-statements/history` - Get financial statement generation history
- `/api/v1/organizations/{organizationId}/financial-statements/income-statement` - Generate income statement
- `/api/v1/organizations/{organizationId}/financial-statements/ratios` - Calculate financial ratios
- `/api/v1/organizations/{organizationId}/inventory` - List inventory items
- `/api/v1/organizations/{organizationId}/inventory/{itemId}` - Get inventory item details
- `/api/v1/organizations/{organizationId}/inventory/low-stock` - Get low stock alerts
- `/api/v1/organizations/{organizationId}/inventory/stats` - Get inventory statistics
- `/api/v1/organizations/{organizationId}/inventory/transactions` - Get inventory transactions
- `/api/v1/organizations/{organizationId}/inventory/valuation` - Get inventory valuation report
- `/api/v1/organizations/{organizationId}/invoice-styles` - Get available invoice styles
- `/api/v1/organizations/{organizationId}/invoice-styles/{id}` - Get single invoice style by ID
- `/api/v1/organizations/{organizationId}/invoice-templates` - Get available invoice templates
- `/api/v1/organizations/{organizationId}/invoice-templates/{id}` - Get single invoice template by ID
- `/api/v1/organizations/{organizationId}/invoices/{id}/pdf` - Generate and download invoice PDF
- `/api/v1/organizations/{organizationId}/invoices/{id}/pdf/status` - Get PDF generation status
- `/api/v1/organizations/{organizationId}/purchase-orders` - List purchase orders
- `/api/v1/organizations/{organizationId}/purchase-orders/{purchaseOrderId}` - Get purchase order details
- `/api/v1/organizations/{organizationId}/purchase-orders/stats` - Get purchase order statistics
- `/api/v1/organizations/{organizationId}/settings/invoice` - Get organization invoice settings
- `/api/v1/organizations/{organizationId}/settings/notifications` - Get all notification settings
- `/api/v1/organizations/{organizationId}/settings/system` - Get all system preferences
- `/api/v1/organizations/{organizationId}/settings/tax` - Get tax settings
- `/api/v1/organizations/{organizationId}/tax/rates` - Get tax rates for jurisdiction
- `/api/v1/organizations/{organizationId}/vendors` - List all vendors
- `/api/v1/organizations/{organizationId}/vendors/{vendorId}` - Get vendor details
- `/api/v1/organizations/{organizationId}/vendors/{vendorId}/payments` - Get vendor payment history
- `/api/v1/organizations/{organizationId}/vendors/{vendorId}/stats` - Get vendor performance statistics
- `/api/v1/organizations/{orgId}/sync/calendar/status` - Get calendar sync status
- `/api/v1/public/payment/{token}/history` - Get payment history
- `/api/v1/public/payment/{token}/invoice` - Get invoice details for payment
- `/api/v1/public/payment/{token}/methods` - List saved payment methods
- `/api/v1/public/quotes/{quoteId}/status` - Check quote status (public, no authentication)
- `/api/v1/public/quotes/{quoteId}/view` - View quote details (public, no authentication)
- `/api/v1/tax/quick-method/rate` - Get Quick Method rate
- `/api/v1/tax/small-supplier/threshold` - Get small supplier threshold
- `/appointments` - List appointments
- `/appointments/{id}` - Get appointment details
- `/appointments/stats/summary` - Get appointment statistics
- `/audit/audit-stream` - Get audit stream configuration
- `/audit/entity/{entityType}/{entityId}/history` - Get entity history
- `/audit/export` - Export audit logs
- `/audit/export/csv` - Export audit logs as CSV
- `/audit/export/json` - Export audit logs as JSON
- `/audit/logs` - Get audit logs
- `/audit/security-metrics` - Get security metrics dashboard
- `/audit/security-metrics/access-control` - Get access control metrics
- `/audit/security-metrics/compliance` - Get compliance metrics
- `/audit/security-metrics/login` - Get login security metrics
- `/audit/security-summary` - Get security summary
- `/audit/sessions` - Get active user sessions
- `/audit/suspicious-activity` - Get suspicious activity alerts
- `/audit/suspicious-activity/patterns` - Get suspicious activity patterns
- `/audit/users/{userId}/activity` - Get user activity timeline
- `/audit/users/{userId}/activity/summary` - Get user activity summary
- `/audit/users/current/activity/summary` - Get current user's activity summary
- `/auth/profile` - Get user profile
- `/customers` - List customers
- `/customers/{id}` - Get customer by ID
- `/customers/{id}/stats` - Get customer statistics
- `/documents` - Get list of documents
- `/documents/{id}` - Get a specific document
- `/documents/{id}/download` - Download a document file
- `/documents/{id}/versions` - Get all versions of a document
- `/documents/stats` - Get document statistics
- `/etransfers` - List e-transfers
- `/etransfers/{etransferNumber}` - Get e-transfer details
- `/etransfers/stats/summary` - Get e-transfer statistics
- `/invoices` - List invoices
- `/invoices/{id}` - Get invoice by ID
- `/invoices/stats/summary` - Get invoice statistics summary
- `/organizations` - List all organizations
- `/organizations/{id}` - Get organization details
- `/organizations/{id}/settings` - Get organization settings
- `/organizations/{id}/stats` - Get organization statistics
- `/organizations/{organizationId}/customers` - List customers with filtering and pagination
- `/organizations/{organizationId}/customers/{id}` - Get customer details
- `/organizations/verify-domain/{domain}` - Check domain verification status
- `/payment-analytics/aging` - Get payment aging report
- `/payment-analytics/cash-flow` - Get cash flow projection
- `/payment-analytics/customer-behavior` - Get customer payment behavior analysis
- `/payment-analytics/forecast` - Get payment forecast
- `/payment-analytics/fraud-alerts` - Detect fraud alerts
- `/payment-analytics/methods` - Get payment method analytics
- `/payment-analytics/trends` - Get payment trends analysis
- `/payments` - List payments with filtering and pagination
- `/payments/{id}` - Get payment by ID
- `/payments/stats/summary` - Get payment statistics and analytics
- `/projects` - List projects
- `/projects/{id}` - Get project details
- `/projects/stats/summary` - Get project statistics summary
- `/public/intake/status` - Get session status
- `/public/intake/templates` - Get all available business templates
- `/public/intake/templates/{category}` - Get field template for specific category
- `/quotes` - List quotes
- `/quotes/{id}` - Get quote by ID
- `/quotes/stats/summary` - Get quote statistics summary
- `/users` - List users
- `/users/{userId}` - Get user by ID
- `/users/{userId}/status` - Get user account status

### POST (108)

- `/api/v1/auth/google/disconnect` - Disconnect Google Calendar
- `/api/v1/organizations/{organizationId}/accounting/accounts` - Create a new account
- `/api/v1/organizations/{organizationId}/accounting/accounts/standard` - Create standard chart of accounts for business type
- `/api/v1/organizations/{organizationId}/accounting/business-transactions` - Create a business transaction from template
- `/api/v1/organizations/{organizationId}/accounting/transactions` - Create a new journal transaction
- `/api/v1/organizations/{organizationId}/accounting/transactions/{transactionId}/reverse` - Reverse a transaction
- `/api/v1/organizations/{organizationId}/assets/logo` - Upload organization logo
- `/api/v1/organizations/{organizationId}/financial-statements/export` - Export financial statements
- `/api/v1/organizations/{organizationId}/inventory` - Create inventory item
- `/api/v1/organizations/{organizationId}/inventory/{itemId}/adjust` - Adjust inventory quantity
- `/api/v1/organizations/{organizationId}/inventory/{itemId}/stock-count` - Perform physical stock count
- `/api/v1/organizations/{organizationId}/inventory/{itemId}/transfer` - Transfer inventory between locations
- `/api/v1/organizations/{organizationId}/inventory/transactions` - Create inventory transaction
- `/api/v1/organizations/{organizationId}/invoice-styles` - Create custom invoice style
- `/api/v1/organizations/{organizationId}/invoice-templates` - Create custom invoice template
- `/api/v1/organizations/{organizationId}/invoice-templates/{templateId}/duplicate` - Duplicate invoice template
- `/api/v1/organizations/{organizationId}/invoice-templates/preview` - Preview invoice template with sample data
- `/api/v1/organizations/{organizationId}/invoices/{id}/pdf/regenerate` - Force regenerate invoice PDF
- `/api/v1/organizations/{organizationId}/purchase-orders` - Create a new purchase order
- `/api/v1/organizations/{organizationId}/purchase-orders/{purchaseOrderId}/approve` - Approve purchase order
- `/api/v1/organizations/{organizationId}/purchase-orders/{purchaseOrderId}/cancel` - Cancel purchase order
- `/api/v1/organizations/{organizationId}/purchase-orders/{purchaseOrderId}/close` - Close purchase order
- `/api/v1/organizations/{organizationId}/purchase-orders/{purchaseOrderId}/receive` - Receive items from purchase order
- `/api/v1/organizations/{organizationId}/settings/initialize` - Initialize invoice settings
- `/api/v1/organizations/{organizationId}/settings/notifications/test` - Test notification configuration
- `/api/v1/organizations/{organizationId}/tax/calculate` - Calculate tax for a transaction
- `/api/v1/organizations/{organizationId}/tax/calculate/canadian` - Calculate Canadian tax with provincial rules
- `/api/v1/organizations/{organizationId}/tax/gst-hst-return` - Generate GST/HST return
- `/api/v1/organizations/{organizationId}/tax/itc/calculate` - Calculate Input Tax Credits (ITCs)
- `/api/v1/organizations/{organizationId}/tax/payments` - Record tax payment
- `/api/v1/organizations/{organizationId}/tax/remittance` - Calculate tax remittance for a period
- `/api/v1/organizations/{organizationId}/vendors` - Create a new vendor
- `/api/v1/organizations/{orgId}/sync/calendar/manual` - Trigger manual calendar sync
- `/api/v1/organizations/{orgId}/sync/calendar/webhook` - Google Calendar webhook
- `/api/v1/public/payment/{token}/confirm` - Confirm payment
- `/api/v1/public/payment/{token}/create-intent` - Create Stripe PaymentIntent
- `/api/v1/public/payment/{token}/methods` - Add payment method
- `/api/v1/public/quotes/{quoteId}/accept` - Accept quote (public, no authentication)
- `/api/v1/public/quotes/{quoteId}/reject` - Reject quote (public, no authentication)
- `/api/v1/tax/exempt/check` - Check if item is GST exempt
- `/api/v1/tax/gst-number/validate` - Validate GST number
- `/api/v1/tax/rates` - Configure tax rate
- `/api/v1/tax/rates/canadian/initialize` - Initialize Canadian tax rates
- `/api/v1/tax/zero-rated/check` - Check if item is zero-rated
- `/appointments` - Create a new appointment
- `/appointments/{id}/cancel` - Cancel appointment
- `/appointments/{id}/complete` - Complete appointment
- `/appointments/{id}/confirm` - Confirm appointment
- `/appointments/{id}/reschedule` - Reschedule appointment
- `/audit/sessions/{sessionId}/revoke` - Revoke a specific session
- `/audit/users/{userId}/sessions/revoke-all` - Revoke all sessions for a user
- `/auth/2fa/disable` - Disable two-factor authentication
- `/auth/2fa/enable` - Enable two-factor authentication
- `/auth/2fa/verify` - Verify two-factor authentication
- `/auth/change-password` - Change user password
- `/auth/login` - Authenticate user
- `/auth/logout` - Logout current session
- `/auth/logout-all` - Logout all sessions
- `/auth/refresh` - Refresh access token
- `/auth/register` - Register a new user
- `/auth/reset-password` - Reset password
- `/auth/reset-password-request` - Request password reset
- `/customers` - Create a new customer
- `/documents` - Upload a new document
- `/documents/{id}/attach` - Attach a document to an entity
- `/documents/{id}/versions` - Create a new version of a document
- `/documents/bulk` - Upload multiple documents
- `/etransfers` - Create a new e-transfer
- `/etransfers/maintenance/check-expired` - Check and process expired e-transfers
- `/invoices` - Create a new invoice
- `/invoices/{id}/cancel` - Cancel invoice
- `/invoices/{id}/payment` - Record payment for invoice
- `/invoices/{id}/send` - Send invoice to customer
- `/invoices/{id}/viewed` - Mark invoice as viewed
- `/invoices/from-quote` - Create invoice from quote
- `/manual-payments` - Create a manual payment
- `/manual-payments/allocate` - Allocate partial payment across invoices
- `/manual-payments/batch` - Process batch payments
- `/manual-payments/payment-plan` - Create payment plan
- `/manual-payments/reconcile` - Reconcile payments with bank statement
- `/organizations` - Create a new organization
- `/organizations/{organizationId}/customers` - Create a new customer
- `/organizations/{organizationId}/payments` - Create a new payment
- `/organizations/{organizationId}/quotes` - Create a new quote
- `/organizations/verify-domain` - Request domain ownership verification
- `/organizations/verify-domain/{domain}/verify` - Verify domain ownership via DNS
- `/payments` - Create a manual payment record
- `/payments/{id}/refund` - Process payment refund
- `/payments/stripe` - Create Stripe payment intent
- `/payments/webhook/stripe` - Handle Stripe webhook events
- `/projects` - Create a new project
- `/projects/authorize` - Authorize work on projects
- `/public/intake/initialize` - Initialize new intake session
- `/public/intake/step` - Update intake session data
- `/public/intake/submit` - Submit intake and create customer/quote
- `/public/intake/templates/{category}/validate` - Validate custom fields
- `/quotes` - Create a new quote
- `/quotes/{id}/accept` - Accept quote
- `/quotes/{id}/convert-to-invoice` - Convert quote to invoice
- `/quotes/{id}/duplicate` - Duplicate quote
- `/quotes/{id}/reject` - Reject quote
- `/quotes/{id}/send` - Send quote to customer
- `/quotes/{id}/viewed` - Mark quote as viewed
- `/users` - Create a new user
- `/users/{userId}/activate` - Activate user account
- `/users/{userId}/deactivate` - Deactivate user account
- `/users/{userId}/resend-invite` - Resend user invitation
- `/users/invite` - Invite user

### PUT (41)

- `/api/v1/organizations/{organizationId}/accounting/accounts/{accountId}` - Update account
- `/api/v1/organizations/{organizationId}/inventory/{itemId}` - Update inventory item
- `/api/v1/organizations/{organizationId}/invoice-styles/{id}` - Update invoice style
- `/api/v1/organizations/{organizationId}/invoice-templates/{templateId}` - Update invoice template
- `/api/v1/organizations/{organizationId}/invoice-templates/{templateId}/set-default` - Set template as default
- `/api/v1/organizations/{organizationId}/purchase-orders/{purchaseOrderId}` - Update purchase order
- `/api/v1/organizations/{organizationId}/settings/defaults` - Set default template and style
- `/api/v1/organizations/{organizationId}/settings/invoice` - Update organization invoice settings
- `/api/v1/organizations/{organizationId}/settings/notifications/email` - Update email notification settings
- `/api/v1/organizations/{organizationId}/settings/notifications/in-app` - Update in-app notification settings
- `/api/v1/organizations/{organizationId}/settings/notifications/preferences` - Update notification preferences
- `/api/v1/organizations/{organizationId}/settings/notifications/push` - Update push notification settings
- `/api/v1/organizations/{organizationId}/settings/notifications/sms` - Update SMS notification settings
- `/api/v1/organizations/{organizationId}/settings/notifications/webhooks` - Update webhook notification settings
- `/api/v1/organizations/{organizationId}/settings/system/api` - Update API settings
- `/api/v1/organizations/{organizationId}/settings/system/data-management` - Update data management settings
- `/api/v1/organizations/{organizationId}/settings/system/feature-flags` - Update feature flags
- `/api/v1/organizations/{organizationId}/settings/system/general` - Update general settings
- `/api/v1/organizations/{organizationId}/settings/system/integrations` - Update integration settings
- `/api/v1/organizations/{organizationId}/settings/system/logging` - Update logging settings
- `/api/v1/organizations/{organizationId}/settings/system/performance` - Update performance settings
- `/api/v1/organizations/{organizationId}/settings/system/regional` - Update regional settings
- `/api/v1/organizations/{organizationId}/settings/tax` - Update tax settings
- `/api/v1/organizations/{organizationId}/vendors/{vendorId}` - Update vendor
- `/api/v1/public/payment/{token}/methods/{methodId}/default` - Set default payment method
- `/appointments/{id}` - Update appointment
- `/audit/stream/config` - Update audit stream configuration
- `/auth/profile` - Update user profile
- `/customers/{id}` - Update customer
- `/documents/{id}` - Update a document
- `/etransfers/{etransferNumber}/cancel` - Cancel e-transfer
- `/etransfers/{etransferNumber}/confirm` - Confirm e-transfer deposit
- `/invoices/{id}` - Update invoice
- `/manual-payments/cheque/{paymentId}/status` - Update cheque payment status
- `/organizations/{id}` - Update organization
- `/organizations/{id}/settings` - Update organization settings
- `/organizations/{organizationId}/customers/{id}` - Update customer details
- `/payments/{id}/status` - Update payment status
- `/projects/{id}` - Update project
- `/quotes/{id}` - Update quote
- `/users/{userId}` - Update user

### PATCH (4)

- `/projects/{id}/assign` - Assign project to users
- `/projects/{id}/complete` - Complete project
- `/projects/{id}/start` - Start project
- `/projects/{id}/time` - Update time tracking

### DELETE (15)

- `/api/v1/organizations/{organizationId}/accounting/accounts/{accountId}` - Delete account (soft delete if no transactions)
- `/api/v1/organizations/{organizationId}/assets/logo` - Remove organization logo
- `/api/v1/organizations/{organizationId}/inventory/{itemId}` - Delete inventory item
- `/api/v1/organizations/{organizationId}/invoice-styles/{id}` - Delete invoice style
- `/api/v1/organizations/{organizationId}/invoice-templates/{templateId}` - Delete invoice template
- `/api/v1/organizations/{organizationId}/purchase-orders/{purchaseOrderId}` - Delete purchase order
- `/api/v1/organizations/{organizationId}/vendors/{vendorId}` - Delete vendor (soft delete)
- `/api/v1/public/payment/{token}/methods/{methodId}` - Remove payment method
- `/customers/{id}` - Delete customer
- `/documents/{id}` - Delete a document
- `/organizations/{id}` - Deactivate organization
- `/organizations/{organizationId}/customers/{id}` - Delete customer (soft delete)
- `/projects/{id}` - Delete project
- `/quotes/{id}` - Delete quote
- `/users/{userId}` - Delete user

---

*Generated on 2025-10-03T22:00:57.715Z*
*Based on OpenAPI specification version 3.0.3*
