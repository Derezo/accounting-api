# Google Calendar & Twilio SMS Integration Guide

Complete guide for setting up and using Google Calendar synchronization and Twilio SMS reminders in the Accounting API.

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Google OAuth Setup](#google-oauth-setup)
4. [Twilio Setup](#twilio-setup)
5. [Configuration](#configuration)
6. [API Endpoints](#api-endpoints)
7. [Usage Examples](#usage-examples)
8. [Troubleshooting](#troubleshooting)
9. [Security Considerations](#security-considerations)

---

## Overview

This integration provides:

- **Google Calendar Sync**: Bidirectional synchronization between appointments and Google Calendar
- **OAuth 2.0 Authentication**: Secure token-based authentication with automatic refresh
- **SMS Reminders**: Automated appointment reminders via Twilio (24h and 1h before)
- **Field-Level Encryption**: All OAuth tokens stored encrypted with organization-specific keys
- **Audit Logging**: Complete audit trail for all OAuth and SMS operations

### Architecture

```
┌─────────────────┐         ┌──────────────────┐         ┌────────────────┐
│   Appointment   │────────▶│  Calendar Sync   │────────▶│ Google Calendar│
│     Created     │         │     Service      │         │                │
└─────────────────┘         └──────────────────┘         └────────────────┘
        │                            │
        │                            │
        ▼                            ▼
┌─────────────────┐         ┌──────────────────┐         ┌────────────────┐
│  SMS Reminder   │────────▶│   SMS Service    │────────▶│     Twilio     │
│   Scheduler     │         │   (Bull Queue)   │         │                │
└─────────────────┘         └──────────────────┘         └────────────────┘
```

---

## Prerequisites

### System Requirements

- Node.js >= 18.0.0
- Redis server (for Bull queue)
- PostgreSQL or SQLite database
- Active Google Cloud Project
- Active Twilio account

### NPM Packages

All required packages are already installed:

```json
{
  "googleapis": "^160.0.0",
  "twilio": "^5.10.2",
  "bull": "^4.12.0",
  "redis": "^4.6.11"
}
```

---

## Google OAuth Setup

### Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project: **"Lifestream Accounting API"**
3. Enable required APIs:
   - Google Calendar API
   - Google People API (optional)

### Step 2: Create OAuth 2.0 Credentials

1. Navigate to **APIs & Services > Credentials**
2. Click **Create Credentials > OAuth 2.0 Client ID**
3. Select **Web application**
4. Configure:
   - **Name**: "Accounting API OAuth Client"
   - **Authorized JavaScript origins**:
     - `http://localhost:3000` (dev)
     - `https://api.yourdomain.com` (prod)
   - **Authorized redirect URIs**:
     - `http://localhost:3000/api/v1/auth/google/callback` (dev)
     - `https://api.yourdomain.com/api/v1/auth/google/callback` (prod)
5. Click **Create**
6. Copy **Client ID** and **Client Secret**

### Step 3: Configure OAuth Consent Screen

1. Navigate to **APIs & Services > OAuth consent screen**
2. Select **External** (or Internal for workspace)
3. Fill in:
   - **App name**: "Lifestream Accounting"
   - **User support email**: your@email.com
   - **Developer contact information**: your@email.com
4. Add scopes:
   - `https://www.googleapis.com/auth/calendar`
   - `https://www.googleapis.com/auth/calendar.events`
   - `https://www.googleapis.com/auth/userinfo.email`
   - `https://www.googleapis.com/auth/userinfo.profile`
5. Save and continue

### Step 4: Add Test Users (during development)

1. On OAuth consent screen, add test users
2. Add your Google account email
3. Save

---

## Twilio Setup

### Step 1: Create Twilio Account

1. Sign up at [https://www.twilio.com/try-twilio](https://www.twilio.com/try-twilio)
2. Verify your email and phone number

### Step 2: Get Account Credentials

1. Navigate to [Console Dashboard](https://console.twilio.com/)
2. Copy:
   - **Account SID**
   - **Auth Token**

### Step 3: Get a Phone Number

1. Navigate to **Phone Numbers > Manage > Buy a number**
2. Select a number with **SMS** capabilities
3. Purchase the number
4. Copy the phone number (format: `+15551234567`)

### Step 4: (Optional) Set Up Status Webhooks

1. Navigate to your phone number settings
2. Under **Messaging > Configure**, set:
   - **Status Callback URL**: `https://api.yourdomain.com/api/v1/webhooks/twilio/sms-status`
   - **HTTP Method**: POST
3. Save

---

## Configuration

### Environment Variables

Add to `.env` file:

```bash
# Google OAuth 2.0 & Calendar Integration
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/v1/auth/google/callback

# Twilio SMS Integration
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=+15551234567
TWILIO_SMS_ENABLED=true

# SMS Reminder Configuration
SMS_REMINDER_24H_ENABLED=true
SMS_REMINDER_1H_ENABLED=true
SMS_DAILY_LIMIT_PER_CUSTOMER=3

# Redis (for Bull queue)
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=

# Frontend URL (for OAuth redirects)
FRONTEND_URL=http://localhost:3000
```

### Database Migration

The database schema has already been migrated. If starting fresh:

```bash
npx prisma migrate dev --name add_google_calendar_and_sms_integration
npx prisma generate
```

---

## API Endpoints

### Google OAuth Endpoints

#### 1. Initiate OAuth Flow

```http
GET /api/v1/auth/google
Authorization: Bearer {jwt_token}
```

**Query Parameters:**
- `returnUrl` (optional): URL to redirect after OAuth completion

**Response:**
```json
{
  "authUrl": "https://accounts.google.com/o/oauth2/v2/auth?...",
  "message": "Redirect user to authUrl to complete OAuth flow"
}
```

#### 2. OAuth Callback (handled automatically)

```http
GET /api/v1/auth/google/callback?code={code}&state={state}
```

Automatically redirects to frontend with success/error status.

#### 3. Disconnect Google Calendar

```http
POST /api/v1/auth/google/disconnect
Authorization: Bearer {jwt_token}
```

**Response:**
```json
{
  "success": true,
  "message": "Google Calendar disconnected successfully"
}
```

#### 4. Get Connection Status

```http
GET /api/v1/auth/google/status
Authorization: Bearer {jwt_token}
```

**Response:**
```json
{
  "connected": true,
  "syncEnabled": true,
  "lastSyncAt": "2025-10-03T07:30:00.000Z",
  "lastSyncError": null
}
```

### Calendar Sync Endpoints

#### 1. Manual Sync

```http
POST /api/v1/organizations/{orgId}/sync/calendar/manual
Authorization: Bearer {jwt_token}
```

**Response:**
```json
{
  "success": true,
  "message": "Calendar sync completed",
  "eventsCreated": 5,
  "eventsUpdated": 3,
  "eventsDeleted": 0,
  "errors": []
}
```

#### 2. Get Sync Status

```http
GET /api/v1/organizations/{orgId}/sync/calendar/status
Authorization: Bearer {jwt_token}
```

**Response:**
```json
{
  "connected": true,
  "syncEnabled": true,
  "lastSyncAt": "2025-10-03T07:30:00.000Z",
  "lastSyncError": null
}
```

---

## Usage Examples

### Frontend Integration

#### 1. Connect Google Calendar

```typescript
// Step 1: Get OAuth URL
const response = await fetch('/api/v1/auth/google', {
  headers: {
    'Authorization': `Bearer ${jwtToken}`
  }
});

const { authUrl } = await response.json();

// Step 2: Redirect user to Google OAuth
window.location.href = authUrl;

// Step 3: User completes OAuth and is redirected back
// OAuth callback handles token exchange automatically
// User is redirected to: /settings/calendar?success=true
```

#### 2. Check Connection Status

```typescript
const response = await fetch('/api/v1/auth/google/status', {
  headers: {
    'Authorization': `Bearer ${jwtToken}`
  }
});

const status = await response.json();

if (status.connected) {
  console.log('Google Calendar connected!');
  console.log('Last sync:', status.lastSyncAt);
} else {
  console.log('Not connected');
}
```

#### 3. Trigger Manual Sync

```typescript
const orgId = 'org_123';
const response = await fetch(`/api/v1/organizations/${orgId}/sync/calendar/manual`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${jwtToken}`
  }
});

const result = await response.json();
console.log(`Created ${result.eventsCreated} events`);
console.log(`Updated ${result.eventsUpdated} events`);
```

### Appointment Workflow

#### When Appointment is Created

```typescript
// Appointment creation triggers automatic:
// 1. Google Calendar event creation (if connected)
// 2. SMS reminder scheduling (24h and 1h before)
// 3. SMS confirmation (immediate)

const appointment = await createAppointment({
  customerId: 'cust_123',
  appointmentType: 'Consultation',
  scheduledAt: new Date('2025-10-05T14:00:00Z'),
  location: '123 Main St',
  notes: 'Initial consultation'
});

// Automatic actions:
// - Google Calendar event created with event ID
// - SMS confirmation sent: "Hi John, your Consultation appointment..."
// - 24h reminder scheduled for Oct 4 @ 2:00 PM
// - 1h reminder scheduled for Oct 5 @ 1:00 PM
```

#### When Appointment is Updated

```typescript
// Update triggers:
// 1. Google Calendar event update
// 2. SMS reminder rescheduling

const updated = await updateAppointment(appointmentId, {
  scheduledAt: new Date('2025-10-05T15:00:00Z') // Changed time
});

// Automatic actions:
// - Google Calendar event updated
// - Old SMS reminders cancelled
// - New SMS reminders scheduled for new time
```

#### When Appointment is Cancelled

```typescript
// Cancellation triggers:
// 1. Google Calendar event deletion
// 2. SMS reminder cancellation

await cancelAppointment(appointmentId);

// Automatic actions:
// - Google Calendar event deleted
// - All scheduled SMS reminders cancelled
```

---

## Troubleshooting

### Google OAuth Issues

#### "redirect_uri_mismatch" Error

**Problem**: OAuth callback URL doesn't match Google Cloud configuration.

**Solution**:
1. Check `.env` file: `GOOGLE_REDIRECT_URI` must exactly match Google Cloud settings
2. Ensure protocol matches (http vs https)
3. Check for trailing slashes

#### "access_denied" Error

**Problem**: User denied consent or app not verified.

**Solution**:
1. Ensure OAuth consent screen is configured
2. Add test users during development
3. Check required scopes are requested

#### Token Refresh Fails

**Problem**: "Failed to refresh Google access token" error.

**Solution**:
1. Check if user's Google account revoked access
2. Verify `GOOGLE_CLIENT_SECRET` is correct
3. Ask user to reconnect Google Calendar

### Twilio SMS Issues

#### SMS Not Sending

**Problem**: SMS appears queued but not delivered.

**Solution**:
1. Check `TWILIO_SMS_ENABLED=true` in `.env`
2. Verify Twilio credentials (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`)
3. Check phone number format: must be E.164 format (`+15551234567`)
4. Verify Twilio account has sufficient balance
5. For trial accounts, verify recipient phone is verified

#### Rate Limit Exceeded

**Problem**: "Daily SMS limit exceeded for customer" error.

**Solution**:
1. Check `SMS_DAILY_LIMIT_PER_CUSTOMER` setting (default: 3)
2. Increase limit if appropriate
3. Check SMS history for customer

#### SMS Delivery Failed

**Problem**: Status shows "FAILED" in database.

**Solution**:
1. Check `failureReason` field in `SmsMessage` table
2. Verify phone number is valid and can receive SMS
3. Check Twilio account status
4. Review Twilio error logs in console

### Calendar Sync Issues

#### Events Not Syncing

**Problem**: Manual sync shows 0 events created/updated.

**Solution**:
1. Verify Google Calendar is connected (`/auth/google/status`)
2. Check appointments have `status: SCHEDULED or CONFIRMED`
3. Ensure appointments are in the future
4. Check `lastSyncError` for error messages

#### Duplicate Events

**Problem**: Same appointment appears multiple times in Google Calendar.

**Solution**:
1. Check `googleCalendarEventId` field in appointments
2. Should only sync once - creates event ID on first sync
3. If duplicates exist, manually delete in Google Calendar

---

## Security Considerations

### OAuth Token Security

1. **Encryption**: All access/refresh tokens encrypted with AES-256-GCM
2. **Organization-Specific Keys**: Each organization has unique encryption key
3. **No Token Logging**: Tokens never logged or exposed in responses
4. **CSRF Protection**: State parameter validates OAuth callback authenticity
5. **Token Rotation**: Access tokens auto-refresh before expiration

### SMS Security

1. **Phone Number Encryption**: Customer phone numbers encrypted at rest
2. **Rate Limiting**: Max 3 SMS per customer per day (configurable)
3. **Masked Logging**: Phone numbers masked in logs (`***-***-1234`)
4. **Webhook Verification**: Twilio signature validation (recommended to add)

### API Security

1. **JWT Authentication**: All endpoints require valid JWT token
2. **Organization Isolation**: Multi-tenant data isolation enforced
3. **Audit Logging**: All OAuth and SMS operations logged
4. **IP Tracking**: OAuth and SMS events track IP addresses

### Best Practices

1. **Rotate Secrets Regularly**:
   - Google OAuth client secret
   - Twilio auth token
   - Encryption keys

2. **Monitor Audit Logs**:
   - Review OAuth connection/disconnection events
   - Monitor SMS delivery failures
   - Track rate limit violations

3. **Use HTTPS in Production**:
   - All OAuth callbacks must use HTTPS
   - Twilio webhooks must use HTTPS

4. **Implement Opt-Out**:
   - Allow customers to opt out of SMS (future enhancement)
   - Respect customer communication preferences

---

## Production Deployment

### Checklist

- [ ] Update `GOOGLE_REDIRECT_URI` to production URL
- [ ] Update `FRONTEND_URL` to production URL
- [ ] Use production Twilio account (not trial)
- [ ] Enable HTTPS for all endpoints
- [ ] Set up Redis persistence
- [ ] Configure Bull queue retry settings
- [ ] Set up monitoring for:
  - OAuth token refresh failures
  - SMS delivery failures
  - Calendar sync errors
- [ ] Configure alerting for rate limit violations
- [ ] Test OAuth flow end-to-end
- [ ] Test SMS delivery in production
- [ ] Verify calendar sync with multiple users

### Performance Considerations

1. **Calendar Sync**:
   - Sync batches every 5 minutes (not per-appointment)
   - Consider Google Calendar push notifications for real-time updates
   - Cache sync status in Redis (future enhancement)

2. **SMS Queue**:
   - Bull queue processes SMS asynchronously
   - Retries failed SMS 3 times with exponential backoff
   - Monitor queue depth and processing time

3. **Token Refresh**:
   - Auto-refresh tokens 5 minutes before expiration
   - Cache valid tokens in Redis to reduce database queries

---

## Support

For issues or questions:

1. Check [Troubleshooting](#troubleshooting) section
2. Review audit logs for error details
3. Check service-specific logs (Google OAuth, Twilio, SMS Scheduler)
4. Contact support with relevant error messages and request IDs

---

## Appendix

### Database Schema

#### UserGoogleToken
```prisma
model UserGoogleToken {
  id             String   @id @default(cuid())
  userId         String   @unique
  organizationId String

  accessToken    String   // Encrypted
  refreshToken   String   // Encrypted
  tokenType      String   @default("Bearer")
  expiresAt      DateTime
  scope          String

  syncEnabled    Boolean  @default(true)
  lastSyncAt     DateTime?
  lastSyncError  String?

  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}
```

#### SmsMessage
```prisma
model SmsMessage {
  id             String   @id @default(cuid())
  organizationId String
  customerId     String
  appointmentId  String?

  phoneNumber    String   // Encrypted
  message        String
  messageType    String   @default("CUSTOM")
  status         String   @default("PENDING")
  twilioSid      String?

  sentAt         DateTime?
  deliveredAt    DateTime?
  failureReason  String?

  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}
```

### API Error Codes

| Code | Description | Solution |
|------|-------------|----------|
| `GOOGLE_OAUTH_NOT_CONNECTED` | User hasn't connected Google Calendar | Call `/auth/google` to initiate OAuth |
| `GOOGLE_TOKEN_EXPIRED` | Access token expired and refresh failed | Ask user to reconnect |
| `GOOGLE_CALENDAR_SYNC_FAILED` | Sync operation failed | Check `lastSyncError` for details |
| `SMS_RATE_LIMIT_EXCEEDED` | Daily SMS limit reached | Wait 24 hours or increase limit |
| `SMS_DELIVERY_FAILED` | Twilio delivery failed | Check phone number validity |
| `INVALID_PHONE_NUMBER` | Phone number format invalid | Use E.164 format |

---

**Last Updated**: October 3, 2025
**Version**: 1.0.0
