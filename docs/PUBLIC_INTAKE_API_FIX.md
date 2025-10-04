# Public Intake API - Frontend URL Fix Required

**Date:** October 2, 2025
**Status:** ✅ Backend is Correct - Frontend Needs URL Update
**Impact:** High - Blocking public intake form functionality
**Fix Time:** 5 minutes (find & replace)

---

## Problem Summary

The **frontend is calling the wrong URL** for public intake endpoints, resulting in 401 Unauthorized errors.

### Current Behavior (❌ INCORRECT)

```typescript
// Frontend is currently calling:
POST http://localhost:3000/api/v1/intake/initialize
// Response: 401 Unauthorized - "Bearer token required"
```

### Expected Behavior (✅ CORRECT)

```typescript
// Frontend should call:
POST http://localhost:3000/api/v1/public/intake/initialize
// Response: 201 Created - Session token returned
```

---

## Root Cause

The frontend is missing the `/public/` prefix in the intake endpoint URLs.

**HAR Analysis from Browser:**
- **Request URL**: `http://localhost:3000/api/v1/intake/initialize`
- **Missing**: `/public/` between `/v1/` and `/intake/`
- **Result**: Request falls through to catch-all auth route → 401 error

---

## Backend Status: ✅ WORKING CORRECTLY

The backend is properly configured and tested:

```bash
# ✅ WORKING - Public endpoint (no auth required)
$ curl -X POST http://localhost:3000/api/v1/public/intake/initialize \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'

# Response: 201 Created
{
  "success": true,
  "token": "QK5CLzlt7svxhzRQT83P38GTwNiHxJLZ...",
  "sessionId": "cmg8qkhki0004j64q24buej0q",
  "expiresAt": "2025-10-04T01:28:02.799Z",
  "currentStep": "PROFILE_TYPE"
}
```

---

## Frontend Fix Required

### Step 1: Update API Base URL

**File**: `src/services/api.ts` (or wherever API URLs are defined)

**Find:**
```typescript
const INTAKE_BASE_URL = '/api/v1/intake';
```

**Replace:**
```typescript
const INTAKE_BASE_URL = '/api/v1/public/intake';
```

### Step 2: Verify All Intake Endpoints

Ensure ALL intake endpoints include `/public/`:

| Endpoint | ❌ Wrong URL | ✅ Correct URL |
|----------|-------------|---------------|
| Initialize | `/api/v1/intake/initialize` | `/api/v1/public/intake/initialize` |
| Get Templates | `/api/v1/intake/templates` | `/api/v1/public/intake/templates` |
| Get Template | `/api/v1/intake/templates/:category` | `/api/v1/public/intake/templates/:category` |
| Validate Fields | `/api/v1/intake/templates/:category/validate` | `/api/v1/public/intake/templates/:category/validate` |
| Update Step | `/api/v1/intake/step` | `/api/v1/public/intake/step` |
| Get Status | `/api/v1/intake/status` | `/api/v1/public/intake/status` |
| Submit | `/api/v1/intake/submit` | `/api/v1/public/intake/submit` |

### Step 3: Remove JWT Headers (Optional)

Public intake endpoints do NOT need authentication headers:

**Remove (if present):**
```typescript
headers: {
  'Authorization': `Bearer ${token}`,  // ❌ NOT NEEDED
  'Content-Type': 'application/json'
}
```

**Keep:**
```typescript
headers: {
  'Content-Type': 'application/json',
  'X-Intake-Token': sessionToken  // ✅ Only for /step, /status, /submit
}
```

---

## Complete API Endpoint Reference

### 1. Initialize Session (Public - No Auth)

```http
POST /api/v1/public/intake/initialize
Content-Type: application/json

{
  "fingerprint": "browser-fingerprint-optional"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Intake session initialized successfully",
  "token": "abcd1234efgh5678...",
  "sessionId": "cls1a2b3c4d5e6f7g8h9",
  "expiresAt": "2025-10-04T01:28:02.799Z",
  "currentStep": "EMAIL_CAPTURE"
}
```

### 2. Get Available Templates (Public - No Auth)

```http
GET /api/v1/public/intake/templates
```

**Response:**
```json
{
  "success": true,
  "templates": [
    {
      "category": "HVAC",
      "name": "HVAC Services",
      "description": "Heating, Ventilation, and Air Conditioning",
      "fieldCount": 7
    }
  ],
  "total": 8
}
```

### 3. Get Specific Template (Public - No Auth)

```http
GET /api/v1/public/intake/templates/:category
```

**Response:**
```json
{
  "success": true,
  "category": "HVAC",
  "template": {
    "name": "HVAC Services",
    "fields": [
      {
        "name": "systemType",
        "type": "select",
        "label": "System Type",
        "required": true,
        "options": ["Central Air", "Heat Pump", "Furnace"]
      }
    ]
  }
}
```

### 4. Validate Custom Fields (Public - No Auth)

```http
POST /api/v1/public/intake/templates/:category/validate
Content-Type: application/json

{
  "customFields": {
    "systemType": "Central Air",
    "systemAge": 10
  }
}
```

### 5. Update Session Data (Requires X-Intake-Token)

```http
POST /api/v1/public/intake/step
Content-Type: application/json
X-Intake-Token: <token-from-initialize>

{
  "step": "EMAIL_CAPTURE",
  "customerData": {
    "email": "customer@example.com"
  }
}
```

### 6. Get Session Status (Requires X-Intake-Token)

```http
GET /api/v1/public/intake/status
X-Intake-Token: <token-from-initialize>
```

### 7. Submit Final Intake (Requires X-Intake-Token)

```http
POST /api/v1/public/intake/submit
Content-Type: application/json
X-Intake-Token: <token-from-initialize>

{
  "organizationId": "org_1234567890abcdef"
}
```

---

## Rate Limits

| Endpoint | Rate Limit | Window |
|----------|-----------|--------|
| `/initialize` | 5 requests | 1 hour per IP |
| `/step` | 10 requests | 1 minute per IP |
| `/status` | 100 requests | 1 hour per IP |
| `/submit` | 2 requests | 1 hour per IP |

---

## Security Features

1. **No JWT Authentication Required** - Public endpoints accessible without login
2. **Session Token Validation** - Token from `/initialize` required for subsequent requests
3. **Bot Detection** - Aggressive bot detection on all requests
4. **IP Rate Limiting** - Per-IP rate limits prevent abuse
5. **Disposable Email Blocking** - Blocks temporary email addresses
6. **Browser Fingerprinting** - Optional fingerprint for enhanced security
7. **Session Expiry** - Sessions expire after 48 hours

---

## Testing Checklist

After fixing the URLs, verify:

- [ ] Initialize session returns 201 (not 401)
- [ ] Token is received and stored
- [ ] Step updates work with X-Intake-Token header
- [ ] Status endpoint returns session data
- [ ] Submit creates customer and quote
- [ ] No JWT/Bearer tokens are sent to public endpoints
- [ ] Rate limits are respected
- [ ] CORS works from localhost:8080

---

## Example Frontend Code

```typescript
// services/intakeApi.ts

const API_BASE = 'http://localhost:3000/api/v1';

export class IntakeApiService {
  private sessionToken: string | null = null;

  /**
   * Step 1: Initialize session (NO AUTH)
   */
  async initialize(fingerprint?: string) {
    const response = await fetch(`${API_BASE}/public/intake/initialize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fingerprint })
    });

    const data = await response.json();
    this.sessionToken = data.token;
    return data;
  }

  /**
   * Step 2: Update session data (WITH TOKEN)
   */
  async updateStep(step: string, customerData: any, quoteData: any) {
    const response = await fetch(`${API_BASE}/public/intake/step`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Intake-Token': this.sessionToken!
      },
      body: JSON.stringify({ step, customerData, quoteData })
    });

    return response.json();
  }

  /**
   * Step 3: Get session status (WITH TOKEN)
   */
  async getStatus() {
    const response = await fetch(`${API_BASE}/public/intake/status`, {
      headers: {
        'X-Intake-Token': this.sessionToken!
      }
    });

    return response.json();
  }

  /**
   * Step 4: Submit final intake (WITH TOKEN)
   */
  async submit(organizationId: string) {
    const response = await fetch(`${API_BASE}/public/intake/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Intake-Token': this.sessionToken!
      },
      body: JSON.stringify({ organizationId })
    });

    return response.json();
  }

  /**
   * Get available templates (NO AUTH)
   */
  async getTemplates() {
    const response = await fetch(`${API_BASE}/public/intake/templates`);
    return response.json();
  }
}
```

---

## Swagger Documentation

The complete API documentation is available at:

**Development**: http://localhost:3000/api-docs

Look for the **"Public Intake"** tag in the Swagger UI.

---

## Common Mistakes to Avoid

1. ❌ **Using `/api/v1/intake`** instead of `/api/v1/public/intake`
2. ❌ **Sending JWT Bearer tokens** to public endpoints
3. ❌ **Forgetting X-Intake-Token header** for step/status/submit
4. ❌ **Not storing the session token** from initialize response
5. ❌ **Calling submit before completing required fields**

---

## Support

If you encounter any issues after fixing the URLs:

1. Check browser DevTools Network tab for actual URLs being called
2. Verify X-Intake-Token is included in headers for step/status/submit
3. Check that no Authorization header is being sent to /initialize
4. Review Swagger docs: http://localhost:3000/api-docs
5. Check backend logs for detailed error messages

---

## Deployment Notes

**Production URLs** will be:
```
https://api.lifestreamdynamics.com/api/v1/public/intake/*
```

Ensure your frontend uses environment variables for the base URL:
```typescript
const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3000/api/v1';
```

---

**Status**: Ready for frontend implementation
**Estimated Fix Time**: 5-10 minutes
**Backend Changes Required**: None - already working correctly
**Frontend Changes Required**: Update URL prefix from `/intake` to `/public/intake`
