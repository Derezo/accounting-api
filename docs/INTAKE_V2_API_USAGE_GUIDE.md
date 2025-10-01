# Intake Form V2 - API Usage Guide

Complete guide for using the Intake Form V2 API with real-world examples.

---

## Table of Contents

1. [Authentication](#authentication)
2. [Template Management](#template-management)
3. [Building Forms](#building-forms)
4. [Public Form Usage](#public-form-usage)
5. [Conversion to CRM](#conversion-to-crm)
6. [Error Handling](#error-handling)

---

## Authentication

All admin endpoints require JWT authentication. Include the token in the Authorization header:

```bash
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     https://api.yourcompany.com/api/v2/...
```

Public endpoints (session management) use token-based authentication with session tokens.

---

## Template Management

### 1. Create a New Template

**Endpoint:** `POST /api/v2/organizations/:orgId/intake-forms/templates`

**Example:**

```bash
curl -X POST \
  https://api.yourcompany.com/api/v2/organizations/org-123/intake-forms/templates \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "HVAC Service Request",
    "description": "Template for HVAC service requests",
    "templateType": "INDUSTRY",
    "industry": "HVAC",
    "isActive": true,
    "isDefault": true,
    "autoConvert": true,
    "config": {
      "theme": {
        "primaryColor": "#007bff"
      },
      "branding": {
        "companyName": "Acme HVAC"
      }
    },
    "completionRules": {
      "minimumPercentage": 80
    },
    "conversionSettings": {
      "customerMapping": {
        "customer_email": "email",
        "customer_firstName": "firstName",
        "customer_lastName": "lastName"
      }
    }
  }'
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "template-abc123",
    "organizationId": "org-123",
    "name": "HVAC Service Request",
    "version": "1.0.0",
    "templateType": "INDUSTRY",
    "industry": "HVAC",
    "isActive": true,
    "isDefault": true,
    "autoConvert": true,
    "createdAt": "2025-10-01T00:00:00.000Z",
    "steps": [],
    "fields": []
  },
  "message": "Template created successfully"
}
```

### 2. List All Templates

**Endpoint:** `GET /api/v2/organizations/:orgId/intake-forms/templates`

```bash
curl https://api.yourcompany.com/api/v2/organizations/org-123/intake-forms/templates \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 3. Get Template Details

**Endpoint:** `GET /api/v2/organizations/:orgId/intake-forms/templates/:templateId`

```bash
curl https://api.yourcompany.com/api/v2/organizations/org-123/intake-forms/templates/template-abc123 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 4. Update Template

**Endpoint:** `PUT /api/v2/organizations/:orgId/intake-forms/templates/:templateId`

```bash
curl -X PUT \
  https://api.yourcompany.com/api/v2/organizations/org-123/intake-forms/templates/template-abc123 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "HVAC Service Request (Updated)",
    "isActive": false
  }'
```

### 5. Delete Template

**Endpoint:** `DELETE /api/v2/organizations/:orgId/intake-forms/templates/:templateId`

```bash
curl -X DELETE \
  https://api.yourcompany.com/api/v2/organizations/org-123/intake-forms/templates/template-abc123 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## Building Forms

### 1. Add a Step

**Endpoint:** `POST /api/v2/organizations/:orgId/intake-forms/templates/:templateId/steps`

```bash
curl -X POST \
  https://api.yourcompany.com/api/v2/organizations/org-123/intake-forms/templates/template-abc123/steps \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "stepKey": "email_capture",
    "name": "Contact Information",
    "description": "Lets start with your contact details",
    "sortOrder": 0,
    "isRequired": true,
    "canSkip": false,
    "layout": "SINGLE_COLUMN",
    "helpText": "Well use this to send you a quote"
  }'
```

### 2. Add a Field

**Endpoint:** `POST /api/v2/organizations/:orgId/intake-forms/templates/:templateId/fields`

**Basic Text Field:**

```bash
curl -X POST \
  https://api.yourcompany.com/api/v2/organizations/org-123/intake-forms/templates/template-abc123/fields \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "fieldKey": "customer_email",
    "label": "Email Address",
    "placeholder": "john@example.com",
    "helpText": "Well send your quote to this email",
    "fieldType": "email",
    "dataType": "string",
    "isRequired": true,
    "sortOrder": 1,
    "width": "FULL",
    "autocomplete": "email",
    "mappingPath": "customer.email",
    "validationRules": {
      "email": true
    }
  }'
```

**Select Field with Options:**

```bash
curl -X POST \
  https://api.yourcompany.com/api/v2/organizations/org-123/intake-forms/templates/template-abc123/fields \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "fieldKey": "service_type",
    "label": "Type of Service",
    "fieldType": "select",
    "dataType": "string",
    "isRequired": true,
    "sortOrder": 2,
    "width": "FULL",
    "options": [
      {"label": "Repair", "value": "REPAIR"},
      {"label": "Maintenance", "value": "MAINTENANCE"},
      {"label": "Installation", "value": "INSTALLATION"}
    ]
  }'
```

**Conditional Field (Show/Hide):**

```bash
curl -X POST \
  https://api.yourcompany.com/api/v2/organizations/org-123/intake-forms/templates/template-abc123/fields \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "fieldKey": "business_name",
    "label": "Business Name",
    "fieldType": "text",
    "dataType": "string",
    "isRequired": false,
    "sortOrder": 3,
    "width": "FULL",
    "showIf": {
      "operator": "AND",
      "conditions": [
        {
          "field": "customer_type",
          "operator": "equals",
          "value": "COMMERCIAL"
        }
      ]
    },
    "requireIf": {
      "operator": "AND",
      "conditions": [
        {
          "field": "customer_type",
          "operator": "equals",
          "value": "COMMERCIAL"
        }
      ]
    }
  }'
```

### 3. Update a Field

**Endpoint:** `PUT /api/v2/organizations/:orgId/intake-forms/templates/:templateId/fields/:fieldId`

```bash
curl -X PUT \
  https://api.yourcompany.com/api/v2/organizations/org-123/intake-forms/templates/template-abc123/fields/field-xyz789 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "label": "Updated Label",
    "isRequired": false
  }'
```

---

## Public Form Usage

### 1. Create a Session

**Endpoint:** `POST /api/v2/intake-forms/:templateId/sessions`

**No authentication required** - public endpoint with rate limiting.

```bash
curl -X POST \
  https://api.yourcompany.com/api/v2/intake-forms/template-abc123/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "fingerprint": "browser-fingerprint-xyz"
  }'
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "session-def456",
    "templateId": "template-abc123",
    "token": "a1b2c3d4e5f6...64-character-token",
    "status": "ACTIVE",
    "currentStepKey": "email_capture",
    "visitedSteps": ["email_capture"],
    "completedSteps": [],
    "completionPercentage": 0,
    "expiresAt": "2025-10-02T00:00:00.000Z",
    "formData": {}
  },
  "message": "Session created successfully"
}
```

**Save the token** - you'll need it for all subsequent requests.

### 2. Submit Form Data

**Endpoint:** `PATCH /api/v2/intake-forms/sessions/:token/data`

```bash
curl -X PATCH \
  https://api.yourcompany.com/api/v2/intake-forms/sessions/a1b2c3d4e5f6.../data \
  -H "Content-Type: application/json" \
  -d '{
    "customer_email": "john.doe@example.com",
    "customer_firstName": "John",
    "customer_lastName": "Doe",
    "customer_phone": "555-123-4567"
  }'
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "session-def456",
    "currentStepKey": "email_capture",
    "completionPercentage": 35,
    "formData": {
      "customer_email": "john.doe@example.com",
      "customer_firstName": "John",
      "customer_lastName": "Doe",
      "customer_phone": "555-123-4567"
    }
  },
  "message": "Data updated successfully"
}
```

### 3. Get Session Progress

**Endpoint:** `GET /api/v2/intake-forms/sessions/:token/progress`

```bash
curl https://api.yourcompany.com/api/v2/intake-forms/sessions/a1b2c3d4e5f6.../progress
```

**Response:**

```json
{
  "success": true,
  "data": {
    "completionPercentage": 35,
    "currentStepKey": "email_capture",
    "visitedSteps": ["email_capture"],
    "completedSteps": [],
    "isValid": false,
    "validationErrors": [
      {
        "field": "service_type",
        "message": "Service type is required"
      }
    ]
  }
}
```

### 4. Advance to Next Step

**Endpoint:** `POST /api/v2/intake-forms/sessions/:token/advance`

```bash
curl -X POST \
  https://api.yourcompany.com/api/v2/intake-forms/sessions/a1b2c3d4e5f6.../advance \
  -H "Content-Type: application/json" \
  -d '{
    "stepKey": "service_details"
  }'
```

### 5. Complete Session

**Endpoint:** `POST /api/v2/intake-forms/sessions/:token/complete`

```bash
curl -X POST \
  https://api.yourcompany.com/api/v2/intake-forms/sessions/a1b2c3d4e5f6.../complete
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "session-def456",
    "status": "COMPLETED",
    "completionPercentage": 100,
    "formData": { ... }
  },
  "message": "Session completed successfully"
}
```

### 6. Abandon Session

**Endpoint:** `POST /api/v2/intake-forms/sessions/:token/abandon`

```bash
curl -X POST \
  https://api.yourcompany.com/api/v2/intake-forms/sessions/a1b2c3d4e5f6.../abandon
```

---

## Conversion to CRM

### Convert Session to Customer and Quote

**Endpoint:** `POST /api/v2/organizations/:orgId/intake-forms/sessions/:sessionId/convert`

**Requires authentication** - admin endpoint.

```bash
curl -X POST \
  https://api.yourcompany.com/api/v2/organizations/org-123/intake-forms/sessions/session-def456/convert \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response:**

```json
{
  "success": true,
  "data": {
    "customerId": "cust-789xyz",
    "quoteId": "quote-456abc",
    "success": true
  },
  "message": "Session converted successfully"
}
```

---

## Error Handling

### Common Error Responses

**400 Bad Request - Validation Error:**

```json
{
  "success": false,
  "error": "Email is required for customer creation"
}
```

**401 Unauthorized - Invalid Token:**

```json
{
  "success": false,
  "error": "Invalid or expired session token"
}
```

**404 Not Found - Template Not Found:**

```json
{
  "success": false,
  "error": "Template not found"
}
```

**429 Too Many Requests - Rate Limit:**

```json
{
  "success": false,
  "error": "Too many requests, please try again later"
}
```

---

## Complete Workflow Example

### Scenario: Customer submits HVAC service request

**Step 1: Admin creates template (one-time setup)**

```bash
# Create template
TEMPLATE_ID=$(curl -s -X POST \
  https://api.yourcompany.com/api/v2/organizations/org-123/intake-forms/templates \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "HVAC Request", "industry": "HVAC"}' \
  | jq -r '.data.id')

# Add steps and fields (see examples above)
```

**Step 2: Customer visits form**

```bash
# Create session
SESSION_TOKEN=$(curl -s -X POST \
  https://api.yourcompany.com/api/v2/intake-forms/$TEMPLATE_ID/sessions \
  -H "Content-Type: application/json" \
  -d '{"fingerprint": "abc123"}' \
  | jq -r '.data.token')
```

**Step 3: Customer fills out form**

```bash
# Step 1: Contact info
curl -X PATCH \
  https://api.yourcompany.com/api/v2/intake-forms/sessions/$SESSION_TOKEN/data \
  -H "Content-Type: application/json" \
  -d '{
    "customer_email": "john@example.com",
    "customer_firstName": "John",
    "customer_lastName": "Doe",
    "customer_phone": "555-1234"
  }'

# Advance to next step
curl -X POST \
  https://api.yourcompany.com/api/v2/intake-forms/sessions/$SESSION_TOKEN/advance \
  -H "Content-Type: application/json" \
  -d '{"stepKey": "service_details"}'

# Step 2: Service details
curl -X PATCH \
  https://api.yourcompany.com/api/v2/intake-forms/sessions/$SESSION_TOKEN/data \
  -H "Content-Type: application/json" \
  -d '{
    "service_type": "REPAIR",
    "urgency": "URGENT",
    "description": "AC not cooling properly"
  }'

# Complete session
curl -X POST \
  https://api.yourcompany.com/api/v2/intake-forms/sessions/$SESSION_TOKEN/complete
```

**Step 4: Admin converts to CRM**

```bash
# Get session ID from dashboard, then convert
curl -X POST \
  https://api.yourcompany.com/api/v2/organizations/org-123/intake-forms/sessions/session-def456/convert \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

---

## Rate Limiting

| Endpoint | Rate Limit |
|----------|------------|
| Create Session | 10 per 15 minutes |
| Get Session/Progress | 100 per 15 minutes |
| Update Data/Advance | 100 per 15 minutes |
| Complete/Abandon | 10 per 15 minutes |

---

## Best Practices

1. **Save the session token** - Store it in localStorage or sessionStorage
2. **Check progress regularly** - Show completion percentage to users
3. **Validate before advancing** - Check `isValid` before moving to next step
4. **Handle errors gracefully** - Display validation errors clearly
5. **Test honeypot** - Include honeypot fields for bot detection
6. **Use autocomplete** - Improves user experience and data quality
7. **Conditional logic** - Show only relevant fields
8. **Mobile-friendly** - Use appropriate field widths and layouts

---

## Next Steps

- See `INTAKE_V2_EXAMPLE_HVAC_TEMPLATE.json` for a complete template example
- See `INTAKE_V2_IMPLEMENTATION_SUMMARY.md` for architecture details
- Test endpoints with Postman collection (coming soon)

---

## Support

For issues or questions:
- GitHub: https://github.com/anthropics/claude-code/issues
- Email: support@yourcompany.com
- Docs: https://docs.yourcompany.com/intake-v2
