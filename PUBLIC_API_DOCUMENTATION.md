# Public API Documentation - Quote Generation & Appointment Booking System

> **Version**: 1.0
> **Last Updated**: 2025-09-30
> **Base URL**: `/api/v1/public`

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Intake API](#intake-api)
4. [Quote API](#quote-api)
5. [Appointment API](#appointment-api)
6. [Email Notifications](#email-notifications)
7. [Security & Rate Limiting](#security--rate-limiting)
8. [Error Handling](#error-handling)
9. [Workflow Examples](#workflow-examples)

---

## Overview

This public API enables customers to:
1. **Submit service requests** through a multi-step intake form
2. **View and respond to quotes** sent by administrators
3. **Book appointments** after accepting quotes
4. **Receive automated email notifications** at each step

### Key Features

- ✅ **No authentication required** - Token-based security
- ✅ **8 industry templates** - HVAC, Plumbing, Electrical, Landscaping, Cleaning, Construction, Roofing, General
- ✅ **Dynamic custom fields** - Industry-specific questions
- ✅ **Google Meet integration** - Automatic meeting link generation
- ✅ **Email notifications** - Professional templated emails
- ✅ **Rate limiting** - Protection against abuse
- ✅ **Bot detection** - Honeypot and timing analysis
- ✅ **Mobile-friendly** - Responsive design support

---

## Authentication

All public endpoints use **token-based authentication** instead of user accounts:

- **Intake tokens**: Generated when customer starts intake process
- **View tokens**: Attached to quotes for viewing
- **Acceptance tokens**: One-time tokens for accepting/rejecting quotes
- **Booking tokens**: Generated after quote acceptance for appointment booking

### Token Properties

- **Format**: 64-character hexadecimal string
- **Storage**: bcrypt hashed in database
- **Expiration**: 30 days (configurable)
- **Single-use**: Acceptance and booking tokens can only be used once
- **Security**: Cryptographically secure using `crypto.randomBytes(32)`

### Token Locations

| Token Type | Provided In | Used For |
|------------|-------------|----------|
| Intake Token | Response to `/initialize` | All intake API calls |
| View Token | Email to customer | Viewing quote details |
| Acceptance Token | Email to customer | Accepting/rejecting quote |
| Booking Token | Email after acceptance | Booking appointment |

---

## Intake API

### Base Path: `/api/v1/public/intake`

The intake API guides customers through a multi-step form to submit service requests.

### Workflow Steps

```
EMAIL_CAPTURE → PROFILE_TYPE → PROFILE_DETAILS → SERVICE_CATEGORY →
SERVICE_DETAILS → ADDITIONAL_INFO → REVIEW → SUBMIT → COMPLETED
```

---

### 1. Get Business Templates

**Endpoint**: `GET /templates`

Get list of all available service categories and their field templates.

**Request**:
```http
GET /api/v1/public/intake/templates
```

**Response**:
```json
{
  "success": true,
  "templates": [
    {
      "category": "HVAC",
      "name": "HVAC Services",
      "description": "Heating, Ventilation, and Air Conditioning",
      "fieldCount": 7
    },
    {
      "category": "PLUMBING",
      "name": "Plumbing Services",
      "description": "Residential and Commercial Plumbing",
      "fieldCount": 7
    }
    // ... 6 more
  ],
  "total": 8
}
```

**Rate Limit**: 30 requests/minute

---

### 2. Get Template Fields

**Endpoint**: `GET /templates/:category`

Get detailed field definitions for a specific service category.

**Request**:
```http
GET /api/v1/public/intake/templates/HVAC
```

**Response**:
```json
{
  "success": true,
  "category": "HVAC",
  "template": {
    "name": "HVAC Services",
    "description": "Heating, Ventilation, and Air Conditioning",
    "fields": [
      {
        "name": "systemType",
        "type": "select",
        "label": "System Type",
        "options": ["Central Air", "Heat Pump", "Furnace", "Boiler", "Ductless Mini-Split"],
        "required": true,
        "helpText": "Select the type of HVAC system"
      },
      {
        "name": "systemAge",
        "type": "number",
        "label": "System Age (years)",
        "min": 0,
        "max": 50,
        "required": false
      }
      // ... more fields
    ]
  }
}
```

**Supported Field Types**:
- `text`, `textarea` - Text input
- `number` - Numeric input with min/max
- `select` - Dropdown selection
- `multiselect` - Multiple choice
- `date` - Date picker
- `radio` - Radio buttons
- `checkbox` - Boolean checkbox
- `tel` - Phone number
- `email` - Email address

---

### 3. Validate Custom Fields

**Endpoint**: `POST /templates/:category/validate`

Validate custom fields before submission (client-side validation).

**Request**:
```http
POST /api/v1/public/intake/templates/HVAC/validate
Content-Type: application/json

{
  "customFields": {
    "systemType": "Central Air",
    "systemAge": 10,
    "issueType": ["Not heating/cooling", "Strange noises"]
  }
}
```

**Response**:
```json
{
  "success": true,
  "validation": {
    "isValid": true,
    "errors": [],
    "warnings": ["Field 'brandModel' is optional but recommended"]
  }
}
```

---

### 4. Initialize Intake Session

**Endpoint**: `POST /initialize`

Start a new intake session and receive a token.

**Request**:
```http
POST /api/v1/public/intake/initialize
Content-Type: application/json

{
  "email": "customer@example.com",
  "source": "website"
}
```

**Response**:
```json
{
  "success": true,
  "session": {
    "id": "clxxxx...",
    "token": "a1b2c3d4e5f6...", // 64-char hex string
    "currentStep": "EMAIL_CAPTURE",
    "expiresAt": "2025-10-30T12:00:00Z"
  }
}
```

**Security Features**:
- IP address tracking
- User agent logging
- Bot detection (honeypot, timing analysis)
- Request count limiting

---

### 5. Update Intake Step

**Endpoint**: `POST /step`

Submit data for current step and progress to next step.

**Request Headers**:
```
X-Intake-Token: <session_token>
```

**Request Body**:
```json
{
  "step": "PROFILE_DETAILS",
  "customerData": {
    "profileType": "RESIDENTIAL",
    "firstName": "John",
    "lastName": "Doe",
    "phone": "+1-555-123-4567",
    "addressLine1": "123 Main St",
    "city": "Toronto",
    "province": "ON",
    "postalCode": "M5H 2N2"
  },
  "quoteData": {
    "category": "HVAC",
    "serviceType": "REPAIR",
    "urgency": "URGENT",
    "description": "Air conditioner not cooling properly",
    "customFields": {
      "systemType": "Central Air",
      "systemAge": 10,
      "brandModel": "Carrier 24ACC636",
      "issueType": ["Not heating/cooling", "Strange noises"],
      "lastServiceDate": "2024-05-15"
    }
  }
}
```

**Response**:
```json
{
  "success": true,
  "session": {
    "currentStep": "SERVICE_DETAILS",
    "nextStep": "ADDITIONAL_INFO",
    "completionPercentage": 65,
    "canSubmit": false
  }
}
```

**Step-Specific Fields**:

| Step | Required Fields |
|------|----------------|
| `EMAIL_CAPTURE` | email |
| `PROFILE_TYPE` | profileType (RESIDENTIAL/COMMERCIAL) |
| `PROFILE_DETAILS` | firstName, lastName (residential) OR businessName (commercial), phone, address |
| `SERVICE_CATEGORY` | category |
| `SERVICE_DETAILS` | serviceType, urgency, description, customFields |
| `ADDITIONAL_INFO` | Optional notes |
| `REVIEW` | Review data |
| `SUBMIT` | termsAccepted: true, privacyPolicyAccepted: true |

---

### 6. Get Session Status

**Endpoint**: `GET /status`

Check current session status and completion.

**Request Headers**:
```
X-Intake-Token: <session_token>
```

**Response**:
```json
{
  "success": true,
  "session": {
    "id": "clxxxx...",
    "status": "ACTIVE",
    "currentStep": "SERVICE_DETAILS",
    "completedSteps": ["EMAIL_CAPTURE", "PROFILE_TYPE", "PROFILE_DETAILS", "SERVICE_CATEGORY"],
    "completionPercentage": 50,
    "canSubmit": false,
    "expiresAt": "2025-10-30T12:00:00Z"
  }
}
```

---

### 7. Submit Intake Request

**Endpoint**: `POST /submit`

Complete the intake process and convert to customer + quote.

**Request Headers**:
```
X-Intake-Token: <session_token>
```

**Request Body**:
```json
{
  "termsAccepted": true,
  "privacyPolicyAccepted": true,
  "marketingConsent": false
}
```

**Response**:
```json
{
  "success": true,
  "message": "Request submitted successfully!",
  "data": {
    "customerId": "clxxxx...",
    "quoteId": "clxxxx...",
    "referenceNumber": "INTAKE-2025-A1B2C3D4",
    "status": "COMPLETED"
  }
}
```

**What Happens**:
1. ✅ Customer account created
2. ✅ Quote created (DRAFT status)
3. ✅ Confirmation email sent to customer
4. ✅ Notification email sent to admins
5. ✅ Session marked as COMPLETED
6. ✅ Token invalidated

---

## Quote API

### Base Path: `/api/v1/public/quotes`

The quote API allows customers to view, accept, or reject quotes sent by administrators.

---

### 1. View Quote

**Endpoint**: `GET /:quoteId/view`

View quote details using view token.

**Query Parameters**:
- `token` (required): Public view token

**Request**:
```http
GET /api/v1/public/quotes/clxxxx.../view?token=a1b2c3d4...
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "clxxxx...",
    "quoteNumber": "Q-2025-001",
    "status": "SENT",
    "description": "HVAC - REPAIR: Air conditioner not cooling properly",
    "subtotal": 450.00,
    "taxAmount": 58.50,
    "total": 508.50,
    "currency": "CAD",
    "validUntil": "2025-11-15T17:00:00Z",
    "sentAt": "2025-10-15T10:30:00Z",
    "items": [
      {
        "description": "Diagnostic inspection",
        "quantity": 1,
        "unitPrice": 150.00,
        "taxRate": 13,
        "total": 169.50
      },
      {
        "description": "Refrigerant recharge",
        "quantity": 1,
        "unitPrice": 300.00,
        "taxRate": 13,
        "total": 339.00
      }
    ],
    "customer": {
      "name": "John Doe",
      "email": "customer@example.com",
      "phone": "+1-555-123-4567"
    },
    "organization": {
      "name": "ACME HVAC Services",
      "email": "info@acmehvac.com",
      "phone": "+1-800-555-0123"
    },
    "acceptanceToken": "b2c3d4e5f6..." // Only if status is SENT
  }
}
```

**Auto-Tracking**:
- First view automatically records `viewedAt` timestamp
- Subsequent views don't update timestamp

---

### 2. Check Quote Status

**Endpoint**: `GET /:quoteId/status`

Quick status check without full quote details.

**Query Parameters**:
- `token` (required): Public view token

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "clxxxx...",
    "quoteNumber": "Q-2025-001",
    "status": "SENT",
    "sentAt": "2025-10-15T10:30:00Z",
    "viewedAt": "2025-10-15T14:20:00Z",
    "expiresAt": "2025-11-15T17:00:00Z",
    "isExpired": false
  }
}
```

---

### 3. Accept Quote

**Endpoint**: `POST /:quoteId/accept`

Accept a quote and receive booking token for appointment.

**Request Body**:
```json
{
  "token": "b2c3d4e5f6...", // Acceptance token
  "customerEmail": "customer@example.com",
  "notes": "Looking forward to the service!"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "clxxxx...",
    "quoteNumber": "Q-2025-001",
    "status": "ACCEPTED",
    "acceptedAt": "2025-10-15T15:45:00Z",
    "message": "Quote accepted successfully! Please book your appointment to proceed.",
    "bookingUrl": "https://account.lifestreamdynamics.com/public/appointments/book?quoteId=clxxxx...&token=c3d4e5f6..."
  }
}
```

**What Happens**:
1. ✅ Quote status → ACCEPTED
2. ✅ Acceptance token marked as USED
3. ✅ Appointment booking token generated (30-day expiry)
4. ✅ Confirmation email sent to customer with booking link
5. ✅ Notification email sent to admins
6. ✅ IP address logged for audit

**Error Cases**:
- `400`: Token or email missing/invalid
- `404`: Quote not found
- `409`: Quote already accepted/rejected
- `410`: Quote expired

---

### 4. Reject Quote

**Endpoint**: `POST /:quoteId/reject`

Decline a quote with optional reason.

**Request Body**:
```json
{
  "token": "b2c3d4e5f6...", // Acceptance token
  "customerEmail": "customer@example.com",
  "reason": "Found a better price elsewhere"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "clxxxx...",
    "quoteNumber": "Q-2025-001",
    "status": "REJECTED",
    "rejectedAt": "2025-10-15T16:00:00Z",
    "message": "Thank you for your consideration. We appreciate the opportunity to quote your project."
  }
}
```

**What Happens**:
1. ✅ Quote status → REJECTED
2. ✅ All acceptance tokens invalidated
3. ✅ Notification email sent to admins with rejection reason
4. ✅ IP address logged

---

## Appointment API

### Base Path: `/api/v1/public/appointments`

The appointment API allows customers to book appointments after accepting quotes.

---

### 1. Get Available Time Slots

**Endpoint**: `GET /availability`

Fetch available appointment slots.

**Query Parameters**:
- `quoteId` (required): Quote ID
- `token` (required): Booking token
- `startDate` (optional): Start of date range (ISO 8601)
- `endDate` (optional): End of date range (ISO 8601)

**Request**:
```http
GET /api/v1/public/appointments/availability?quoteId=clxxxx...&token=c3d4e5f6...&startDate=2025-10-20&endDate=2025-10-27
```

**Response**:
```json
{
  "success": true,
  "data": {
    "availableSlots": [
      {
        "start": "2025-10-21T09:00:00Z",
        "end": "2025-10-21T10:00:00Z"
      },
      {
        "start": "2025-10-21T10:00:00Z",
        "end": "2025-10-21T11:00:00Z"
      },
      {
        "start": "2025-10-21T14:00:00Z",
        "end": "2025-10-21T15:00:00Z"
      }
      // ... more slots
    ],
    "timezone": "America/Toronto",
    "businessHours": {
      "start": "09:00",
      "end": "17:00",
      "excludeWeekends": true
    }
  }
}
```

**Slot Calculation**:
- Business hours: 9 AM - 5 PM (configurable)
- Weekdays only (Monday-Friday)
- 30-minute intervals
- Integrated with Google Calendar for real-time availability
- Fallback to default slots if Calendar API unavailable

---

### 2. Book Appointment

**Endpoint**: `POST /book`

Book an appointment slot.

**Request Body**:
```json
{
  "quoteId": "clxxxx...",
  "token": "c3d4e5f6...",
  "startTime": "2025-10-21T14:00:00Z",
  "endTime": "2025-10-21T15:00:00Z",
  "customerEmail": "customer@example.com",
  "customerName": "John Doe",
  "customerPhone": "+1-555-123-4567",
  "notes": "Please call when you arrive"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "appointmentId": "clxxxx...",
    "quoteId": "clxxxx...",
    "startTime": "2025-10-21T14:00:00Z",
    "endTime": "2025-10-21T15:00:00Z",
    "duration": 60,
    "meetingLink": "https://meet.google.com/abc-defg-hij",
    "meetingId": "abc-defg-hij",
    "status": "confirmed",
    "message": "Appointment booked successfully! Check your email for confirmation and meeting details."
  }
}
```

**What Happens**:
1. ✅ Appointment created in database
2. ✅ Google Meet link generated (or fallback link)
3. ✅ Google Calendar invitation sent
4. ✅ Booking token marked as USED
5. ✅ Confirmation email sent to customer
6. ✅ Notification email sent to admin
7. ✅ IP address logged

**Validation**:
- Start/end time must be in future
- Time slot must be available
- Email format must be valid
- Token must be valid and unused
- Quote must be in ACCEPTED status

---

### 3. Get Appointment Details

**Endpoint**: `GET /:appointmentId/details`

View appointment details.

**Query Parameters**:
- `token` (required): Booking token

**Request**:
```http
GET /api/v1/public/appointments/clxxxx.../details?token=c3d4e5f6...
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "clxxxx...",
    "title": "HVAC Service Appointment",
    "startTime": "2025-10-21T14:00:00Z",
    "endTime": "2025-10-21T15:00:00Z",
    "duration": 60,
    "meetingLink": "https://meet.google.com/abc-defg-hij",
    "confirmed": true,
    "cancelled": false,
    "customer": {
      "name": "John Doe",
      "email": "customer@example.com",
      "phone": "+1-555-123-4567"
    },
    "organization": {
      "name": "ACME HVAC Services",
      "phone": "+1-800-555-0123",
      "email": "info@acmehvac.com"
    },
    "quote": {
      "quoteNumber": "Q-2025-001",
      "total": 508.50
    }
  }
}
```

---

### 4. Cancel Appointment

**Endpoint**: `POST /:appointmentId/cancel`

Cancel a booked appointment.

**Request Body**:
```json
{
  "token": "c3d4e5f6...",
  "reason": "Need to reschedule due to emergency"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "appointmentId": "clxxxx...",
    "cancelled": true,
    "cancelledAt": "2025-10-20T10:30:00Z",
    "message": "Appointment cancelled successfully. You can rebook by visiting the original booking link."
  }
}
```

**What Happens**:
1. ✅ Appointment marked as cancelled
2. ✅ Google Meet event cancelled
3. ✅ Cancellation email sent to customer
4. ✅ Notification email sent to admin
5. ✅ Booking token remains valid for rebooking

---

## Email Notifications

All email notifications use professional Handlebars templates with responsive HTML design.

### Email Types

| Event | Recipient | Template | Contains |
|-------|-----------|----------|----------|
| **Intake Submitted** | Customer | `intake/customer-confirmation.hbs` | Reference number, next steps, contact info |
| **Intake Submitted** | Admin | `intake/admin-notification.hbs` | Customer details, service request, emergency alert (if urgent) |
| **Quote Sent** | Customer | `quote/quote-sent.hbs` | Quote details, items, view/accept links |
| **Quote Accepted** | Customer | `quote/quote-accepted-customer.hbs` | Confirmation, booking link, next steps |
| **Quote Accepted** | Admin | `quote/quote-accepted-admin.hbs` | Customer info, quote details, action items |
| **Quote Rejected** | Admin | `quote/quote-rejected-admin.hbs` | Rejection reason, follow-up suggestions |
| **Appointment Booked** | Customer | `appointment/appointment-confirmed-customer.hbs` | Meeting details, Google Meet link, preparation checklist |
| **Appointment Booked** | Admin | `appointment/appointment-confirmed-admin.hbs` | Customer info, meeting details, dashboard link |
| **Appointment Reminder** | Customer | `appointment/appointment-reminder.hbs` | Reminder 24 hours before (cron job) |
| **Appointment Cancelled** | Both | `appointment/appointment-cancelled.hbs` | Cancellation details, rebooking info |

### Email Features

- ✅ **Responsive design** - Mobile-friendly HTML
- ✅ **Plain text fallback** - Automatic conversion
- ✅ **Branded** - Organization logo, colors, contact info
- ✅ **Actionable** - Clear call-to-action buttons
- ✅ **Professional** - Clean, modern design
- ✅ **Helpful** - Next steps, checklists, contact info

### Email Service

Powered by **Resend API** with fallback support.

**Configuration**:
```bash
RESEND_API_KEY=re_...
EMAIL_FROM=Company Name <noreply@example.com>
ORGANIZATION_EMAIL=info@example.com
ORGANIZATION_PHONE=+1-800-555-0123
```

---

## Security & Rate Limiting

### Rate Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| `POST /intake/initialize` | 5 requests | 1 minute |
| `POST /intake/step` | 20 requests | 1 minute |
| `GET /intake/templates` | 30 requests | 1 minute |
| `GET /quotes/:id/view` | 20 requests | 1 minute |
| `POST /quotes/:id/accept` | 5 requests | 1 minute |
| `POST /quotes/:id/reject` | 5 requests | 1 minute |
| `GET /appointments/availability` | 30 requests | 1 minute |
| `POST /appointments/book` | 5 requests | 1 minute |
| `POST /appointments/:id/cancel` | 5 requests | 1 minute |

### Security Features

1. **Token-Based Authentication**
   - bcrypt hashing (cost factor: 10)
   - Cryptographically secure generation
   - Single-use for sensitive operations
   - Expiration enforcement

2. **Bot Detection**
   - Honeypot fields
   - Timing analysis
   - Request pattern detection
   - IP tracking
   - User agent validation

3. **Input Validation**
   - Email format validation
   - Phone number format
   - Date range validation
   - HTML sanitization
   - XSS prevention

4. **Data Protection**
   - Sensitive fields encrypted at rest
   - PII handling compliance
   - Audit logging
   - IP address tracking
   - No sensitive data in URLs

5. **CORS Protection**
   - Configurable allowed origins
   - Credential handling
   - Method restrictions

---

## Error Handling

### Standard Error Response

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {
      "field": "Specific field error"
    }
  }
}
```

### HTTP Status Codes

| Code | Meaning | When |
|------|---------|------|
| 200 | OK | Successful request |
| 400 | Bad Request | Validation failure, missing required fields |
| 401 | Unauthorized | Invalid or missing token |
| 404 | Not Found | Resource not found |
| 409 | Conflict | Already accepted/rejected, double booking |
| 410 | Gone | Resource expired (quote past valid date) |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server error |

### Common Error Codes

| Code | Description |
|------|-------------|
| `INVALID_TOKEN` | Token is invalid or malformed |
| `TOKEN_EXPIRED` | Token has expired |
| `TOKEN_USED` | Token already used (single-use tokens) |
| `VALIDATION_ERROR` | Input validation failed |
| `QUOTE_NOT_FOUND` | Quote doesn't exist or deleted |
| `QUOTE_EXPIRED` | Quote past expiration date |
| `ALREADY_ACCEPTED` | Quote already accepted |
| `INVALID_TRANSITION` | Invalid workflow step transition |
| `SLOT_UNAVAILABLE` | Time slot no longer available |
| `RATE_LIMIT_EXCEEDED` | Too many requests |

---

## Workflow Examples

### Complete Customer Journey

#### 1. Customer Fills Out Intake Form

```bash
# Initialize session
curl -X POST https://api.example.com/api/v1/public/intake/initialize \
  -H "Content-Type: application/json" \
  -d '{"email": "customer@example.com"}'

# Response: token = "abc123..."

# Submit profile info
curl -X POST https://api.example.com/api/v1/public/intake/step \
  -H "Content-Type: application/json" \
  -H "X-Intake-Token: abc123..." \
  -d '{
    "step": "PROFILE_DETAILS",
    "customerData": {
      "profileType": "RESIDENTIAL",
      "firstName": "John",
      "lastName": "Doe",
      "phone": "+1-555-123-4567"
    }
  }'

# Submit service details with custom fields
curl -X POST https://api.example.com/api/v1/public/intake/step \
  -H "Content-Type: application/json" \
  -H "X-Intake-Token: abc123..." \
  -d '{
    "step": "SERVICE_DETAILS",
    "quoteData": {
      "category": "HVAC",
      "serviceType": "REPAIR",
      "urgency": "URGENT",
      "description": "AC not cooling",
      "customFields": {
        "systemType": "Central Air",
        "systemAge": 10
      }
    }
  }'

# Complete submission
curl -X POST https://api.example.com/api/v1/public/intake/submit \
  -H "Content-Type: application/json" \
  -H "X-Intake-Token: abc123..." \
  -d '{
    "termsAccepted": true,
    "privacyPolicyAccepted": true
  }'
```

**Result**: Customer created, quote created (DRAFT), emails sent

---

#### 2. Admin Sends Quote

Admin modifies quote through authenticated API:
```bash
# Admin adds items and pricing
PUT /api/v1/organizations/:orgId/quotes/:quoteId
# (authenticated endpoint, not public)

# Admin sends quote to customer
POST /api/v1/organizations/:orgId/quotes/:quoteId/send
```

**Result**: Quote status → SENT, customer receives email with view/acceptance links

---

#### 3. Customer Views & Accepts Quote

```bash
# View quote
curl "https://api.example.com/api/v1/public/quotes/clxxx/view?token=view123..."

# Accept quote
curl -X POST https://api.example.com/api/v1/public/quotes/clxxx/accept \
  -H "Content-Type: application/json" \
  -d '{
    "token": "accept123...",
    "customerEmail": "customer@example.com"
  }'
```

**Result**:
- Quote status → ACCEPTED
- Booking token generated
- Customer receives email with booking link
- Admin receives acceptance notification

---

#### 4. Customer Books Appointment

```bash
# Get available slots
curl "https://api.example.com/api/v1/public/appointments/availability?quoteId=clxxx&token=book123...&startDate=2025-10-20&endDate=2025-10-27"

# Book appointment
curl -X POST https://api.example.com/api/v1/public/appointments/book \
  -H "Content-Type: application/json" \
  -d '{
    "quoteId": "clxxx",
    "token": "book123...",
    "startTime": "2025-10-21T14:00:00Z",
    "endTime": "2025-10-21T15:00:00Z",
    "customerEmail": "customer@example.com",
    "customerName": "John Doe",
    "customerPhone": "+1-555-123-4567"
  }'
```

**Result**:
- Appointment created
- Google Meet link generated
- Calendar invitations sent
- Confirmation emails sent
- Customer and admin both have meeting link

---

#### 5. Meeting Takes Place

- Customer joins via Google Meet link
- Admin conducts service consultation
- After meeting, admin creates invoice (authenticated API)

---

### Industry-Specific Examples

#### HVAC Service Request
```json
{
  "category": "HVAC",
  "customFields": {
    "systemType": "Central Air",
    "systemAge": 10,
    "brandModel": "Carrier 24ACC636",
    "issueType": ["Not heating/cooling", "Strange noises"],
    "lastServiceDate": "2024-05-15",
    "warrantyStatus": "Warranty expired",
    "preferredContactTime": "Evenings"
  }
}
```

#### Plumbing Emergency
```json
{
  "category": "PLUMBING",
  "urgency": "EMERGENCY",
  "customFields": {
    "issueLocation": "Bathroom",
    "fixtureType": "Toilet",
    "waterShutOff": true,
    "leakSeverity": "Major leak - flooding",
    "affectedAreas": "Bathroom floor and downstairs ceiling"
  }
}
```

#### Landscaping Project
```json
{
  "category": "LANDSCAPING",
  "customFields": {
    "propertySize": "5000-10000 sq ft",
    "servicesNeeded": ["Lawn maintenance", "Tree trimming", "Garden design"],
    "frequency": "Weekly",
    "startDate": "2025-05-01",
    "specialRequirements": "Pet-friendly products only"
  }
}
```

---

## Developer Integration Guide

### Frontend Integration Steps

1. **Intake Form**
   ```javascript
   // Fetch available templates
   const templates = await fetch('/api/v1/public/intake/templates').then(r => r.json());

   // Display category selection
   // User selects "HVAC"

   // Fetch HVAC template fields
   const hvacTemplate = await fetch('/api/v1/public/intake/templates/HVAC').then(r => r.json());

   // Dynamically render form fields based on template
   // Initialize intake session when form starts
   const session = await fetch('/api/v1/public/intake/initialize', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ email: userEmail })
   }).then(r => r.json());

   // Store token for subsequent requests
   const token = session.session.token;

   // Submit each step with token in header
   await fetch('/api/v1/public/intake/step', {
     method: 'POST',
     headers: {
       'Content-Type': 'application/json',
       'X-Intake-Token': token
     },
     body: JSON.stringify({ step, data })
   });
   ```

2. **Quote Viewing**
   ```javascript
   // Extract quoteId and token from email link
   const urlParams = new URLSearchParams(window.location.search);
   const quoteId = window.location.pathname.split('/').pop();
   const token = urlParams.get('token');

   // Fetch quote details
   const quote = await fetch(`/api/v1/public/quotes/${quoteId}/view?token=${token}`)
     .then(r => r.json());

   // Display quote with accept/reject buttons
   ```

3. **Appointment Booking**
   ```javascript
   // Fetch available slots
   const availability = await fetch(
     `/api/v1/public/appointments/availability?quoteId=${quoteId}&token=${bookingToken}&startDate=${start}&endDate=${end}`
   ).then(r => r.json());

   // Display time slot picker
   // User selects slot

   // Book appointment
   const appointment = await fetch('/api/v1/public/appointments/book', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({
       quoteId,
       token: bookingToken,
       startTime: selectedSlot.start,
       endTime: selectedSlot.end,
       customerEmail,
       customerName,
       customerPhone
     })
   }).then(r => r.json());

   // Display confirmation with Google Meet link
   ```

### Error Handling Example

```javascript
async function submitIntakeStep(token, step, data) {
  try {
    const response = await fetch('/api/v1/public/intake/step', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Intake-Token': token
      },
      body: JSON.stringify({ step, ...data })
    });

    if (!response.ok) {
      const error = await response.json();

      switch (response.status) {
        case 400:
          // Validation error - show field errors
          displayFieldErrors(error.error.details);
          break;
        case 401:
          // Invalid token - restart intake
          redirectToStart();
          break;
        case 429:
          // Rate limited - show retry message
          showRateLimitMessage();
          break;
        default:
          showGenericError(error.error.message);
      }

      return null;
    }

    return await response.json();
  } catch (err) {
    console.error('Network error:', err);
    showNetworkError();
    return null;
  }
}
```

---

## Changelog

### Version 1.0.0 (2025-09-30)

**Initial Release**

✅ **Intake API**
- Multi-step intake workflow
- 8 industry templates with custom fields
- Bot detection and security
- Email notifications

✅ **Quote API**
- Public quote viewing
- Accept/reject workflow
- Token-based security
- Automatic booking token generation

✅ **Appointment API**
- Google Calendar integration
- Google Meet link generation
- Availability checking
- Appointment booking and cancellation

✅ **Email System**
- Professional Handlebars templates
- Responsive HTML design
- 10 email types
- Resend API integration

✅ **Security**
- Rate limiting on all endpoints
- bcrypt token hashing
- Input sanitization
- Bot detection
- Audit logging

---

## Support

For API support, please contact:
- **Email**: api-support@lifestreamdynamics.com
- **Documentation**: https://docs.lifestreamdynamics.com
- **Status Page**: https://status.lifestreamdynamics.com

---

## License

© 2025 Lifestream Dynamics. All rights reserved.

This API documentation is confidential and proprietary.