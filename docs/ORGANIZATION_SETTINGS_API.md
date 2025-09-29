# Organization Settings API Documentation

## Overview

The Organization Settings API provides comprehensive functionality for managing organization-level invoice customization, branding, tax settings, and asset management.

## Base URL

All endpoints are prefixed with: `/api/v1/organizations/{organizationId}/settings`

## Authentication

All endpoints require Bearer token authentication and organization access validation.

## Endpoints

### 1. Get Invoice Settings

**Endpoint:** `GET /invoice`

**Description:** Retrieve complete invoice customization settings including branding, available templates, and styles.

**Response:**
```json
{
  "success": true,
  "message": "Invoice settings retrieved successfully",
  "data": {
    "branding": {
      "id": "brand_123",
      "logoUrl": "/storage/logos/org_123/logo.png",
      "logoWidth": 200,
      "logoHeight": 80,
      "showLogo": true,
      "showOrgName": true,
      "primaryColor": "#2563eb",
      "secondaryColor": "#64748b",
      "accentColor": "#3b82f6",
      "backgroundColor": "#ffffff",
      "textColor": "#1e293b",
      "displaySettings": {
        "showCompanyDetails": true,
        "showPaymentTerms": true
      },
      "customCss": ".invoice { font-family: Arial; }",
      "taxesEnabled": true,
      "defaultTaxExempt": false,
      "taxDisplaySettings": {
        "showTaxBreakdown": true,
        "showTaxNumbers": true
      },
      "defaultTemplateId": "tpl_123",
      "defaultStyleId": "sty_123",
      "createdAt": "2024-01-15T10:30:00Z",
      "updatedAt": "2024-01-15T11:00:00Z"
    },
    "availableTemplates": [
      {
        "id": "tpl_123",
        "name": "Professional Default",
        "templateType": "STANDARD",
        "isDefault": true
      }
    ],
    "availableStyles": [
      {
        "id": "sty_123",
        "name": "Classic Black & White",
        "isDefault": true
      }
    ]
  }
}
```

### 2. Update Invoice Settings

**Endpoint:** `PUT /invoice`

**Description:** Update organization invoice settings and branding.

**Request Body:**
```json
{
  "showLogo": true,
  "showOrgName": true,
  "primaryColor": "#2563eb",
  "secondaryColor": "#64748b",
  "accentColor": "#3b82f6",
  "backgroundColor": "#ffffff",
  "textColor": "#1e293b",
  "displaySettings": {
    "showCompanyDetails": true,
    "showPaymentTerms": true,
    "showNotes": true
  },
  "customCss": ".invoice { font-family: Arial, sans-serif; }",
  "defaultTemplateId": "tpl_456",
  "defaultStyleId": "sty_456"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Invoice settings updated successfully",
  "data": {
    "branding": {
      "id": "brand_123",
      "logoUrl": "/storage/logos/org_123/logo.png",
      "showLogo": true,
      "showOrgName": true,
      "primaryColor": "#2563eb",
      "updatedAt": "2024-01-15T12:00:00Z"
    }
  }
}
```

### 3. Upload Logo

**Endpoint:** `POST /assets/logo`

**Description:** Upload organization logo for invoice branding.

**Request:** Multipart form data with `logo` file field

**Request Body:**
- `logo` (file, required): Image file (JPEG, PNG max 5MB)
- `logoWidth` (optional): Logo width in pixels
- `logoHeight` (optional): Logo height in pixels

**Response:**
```json
{
  "success": true,
  "message": "Logo uploaded successfully",
  "data": {
    "logoUrl": "/storage/logos/org_123/logo-1642248000000.png",
    "logoWidth": 200,
    "logoHeight": 80,
    "showLogo": true
  }
}
```

**Example (cURL):**
```bash
curl -X POST \
  -H "Authorization: Bearer <token>" \
  -F "logo=@/path/to/logo.png" \
  -F "logoWidth=200" \
  -F "logoHeight=80" \
  "http://localhost:3000/api/v1/organizations/org_123/settings/assets/logo"
```

### 4. Remove Logo

**Endpoint:** `DELETE /assets/logo`

**Description:** Remove organization logo from invoice branding.

**Response:**
```json
{
  "success": true,
  "message": "Logo removed successfully",
  "data": {
    "logoUrl": null,
    "showLogo": false
  }
}
```

### 5. Update Tax Settings

**Endpoint:** `PUT /tax`

**Description:** Update tax settings for the organization.

**Request Body:**
```json
{
  "taxesEnabled": false,
  "defaultTaxExempt": true
}
```

**Response:**
```json
{
  "success": true,
  "message": "Tax settings updated successfully",
  "data": {
    "taxesEnabled": false,
    "defaultTaxExempt": true
  }
}
```

### 6. Get Tax Settings

**Endpoint:** `GET /tax`

**Description:** Get current tax settings for the organization.

**Response:**
```json
{
  "success": true,
  "message": "Tax settings retrieved successfully",
  "data": {
    "taxesEnabled": true,
    "defaultTaxExempt": false,
    "taxDisplaySettings": {
      "showTaxBreakdown": true,
      "showTaxNumbers": true,
      "taxCalculationMethod": "COMPOUND"
    }
  }
}
```

### 7. Set Default Template and Style

**Endpoint:** `PUT /defaults`

**Description:** Set default template and style for the organization.

**Request Body:**
```json
{
  "defaultTemplateId": "tpl_456",
  "defaultStyleId": "sty_789"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Default template and style updated successfully",
  "data": {
    "defaultTemplateId": "tpl_456",
    "defaultStyleId": "sty_789"
  }
}
```

### 8. Initialize Settings

**Endpoint:** `POST /initialize`

**Description:** Initialize invoice settings for a new organization with system defaults.

**Response:**
```json
{
  "success": true,
  "message": "Invoice settings initialized successfully",
  "data": {
    "message": "System templates, styles, and default branding created",
    "templatesCount": 3,
    "stylesCount": 3,
    "branding": {
      "id": "brand_456",
      "taxesEnabled": true,
      "showLogo": false,
      "showOrgName": true
    }
  }
}
```

## Display Settings Configuration

The `displaySettings` object supports these options:

```json
{
  "displaySettings": {
    "showCompanyDetails": true,
    "showCustomerDetails": true,
    "showInvoiceNumber": true,
    "showInvoiceDate": true,
    "showDueDate": true,
    "showPaymentTerms": true,
    "showNotes": true,
    "showLineItemDescriptions": true,
    "showQuantity": true,
    "showUnitPrice": true,
    "showLineTotal": true,
    "showSubtotal": true,
    "showTaxes": true,
    "showTotal": true,
    "showPaymentInstructions": true
  }
}
```

## Tax Display Settings

The `taxDisplaySettings` object supports:

```json
{
  "taxDisplaySettings": {
    "showTaxBreakdown": true,
    "showTaxNumbers": true,
    "showTaxRates": true,
    "taxCalculationMethod": "COMPOUND",
    "taxLabelFormat": "FULL"
  }
}
```

## Color Scheme Validation

Colors must be valid hex codes:
- `primaryColor`: Main brand color
- `secondaryColor`: Secondary accent color
- `accentColor`: Highlight color
- `backgroundColor`: Document background
- `textColor`: Primary text color

Example valid colors:
```json
{
  "primaryColor": "#2563eb",
  "secondaryColor": "#64748b",
  "accentColor": "#3b82f6",
  "backgroundColor": "#ffffff",
  "textColor": "#1e293b"
}
```

## File Upload Requirements

### Logo Files
- **Formats:** JPEG, JPG, PNG
- **Max Size:** 5MB
- **Recommended:** 400x200px or similar aspect ratio
- **Storage:** Organization-scoped secure storage

### Validation Rules
- File extension must match MIME type
- Content validation with file signatures
- Automatic filename sanitization
- Organization-isolated storage paths

## Error Responses

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    "primaryColor must be a valid hex color",
    "logoWidth must be a positive number"
  ],
  "timestamp": "2024-01-15T10:30:00Z"
}
```

## Permission Requirements

- **GET endpoints:** All authenticated organization members
- **PUT/POST/DELETE endpoints:** Admin or Manager roles only
- **File upload:** Admin or Manager roles only

## Integration Notes

### Tax Disable Functionality
When `taxesEnabled: false`:
- All invoice tax calculations return 0
- Tax fields are hidden in invoice templates
- Existing tax data is preserved but not displayed
- Can be re-enabled without data loss

### Template Integration
Settings automatically apply to:
- PDF generation
- Invoice previews
- Email templates
- Print formats

### Audit Logging
All settings changes are automatically logged with:
- User ID and IP address
- Timestamp and action
- Previous and new values
- Organization context