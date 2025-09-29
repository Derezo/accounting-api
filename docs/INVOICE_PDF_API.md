# Invoice PDF Generation API Documentation

## Overview

The Invoice PDF Generation API provides comprehensive functionality for generating, customizing, and managing invoice PDFs with organization-level branding and template options.

## Base URL

All endpoints are prefixed with: `/api/v1/organizations/{organizationId}`

## Authentication

All endpoints require Bearer token authentication and organization access validation.

## Endpoints

### 1. Generate Invoice PDF

**Endpoint:** `GET /invoices/{id}/pdf`

**Description:** Generate and download an invoice PDF with customizable template and styling options.

**Parameters:**
- `organizationId` (path, required): Organization ID
- `id` (path, required): Invoice ID
- `templateId` (query, optional): Template ID to use
- `styleId` (query, optional): Style ID to use
- `format` (query, optional): PDF format (`A4` or `Letter`, default: `A4`)
- `orientation` (query, optional): Page orientation (`portrait` or `landscape`, default: `portrait`)
- `regenerate` (query, optional): Force regenerate PDF (default: `false`)

**Response:** Binary PDF file with appropriate headers

**Example:**
```bash
curl -H "Authorization: Bearer <token>" \
  "http://localhost:3000/api/v1/organizations/org_123/invoices/inv_456/pdf?format=A4&orientation=portrait"
```

### 2. Regenerate Invoice PDF

**Endpoint:** `POST /invoices/{id}/pdf/regenerate`

**Description:** Force regenerate invoice PDF with new template/style settings.

**Request Body:**
```json
{
  "templateId": "tpl_123",
  "styleId": "sty_456",
  "format": "A4",
  "orientation": "portrait"
}
```

**Response:**
```json
{
  "success": true,
  "message": "PDF regenerated successfully",
  "data": {
    "pdf": {
      "id": "pdf_789",
      "filename": "invoice-INV-001.pdf",
      "fileSize": 245760,
      "status": "GENERATED",
      "createdAt": "2024-01-15T10:30:00Z"
    }
  }
}
```

### 3. Get PDF Status

**Endpoint:** `GET /invoices/{id}/pdf/status`

**Description:** Get PDF generation status and metadata for an invoice.

**Response:**
```json
{
  "success": true,
  "message": "PDF status retrieved",
  "data": {
    "pdfs": [
      {
        "id": "pdf_789",
        "filename": "invoice-INV-001.pdf",
        "fileSize": 245760,
        "status": "GENERATED",
        "templateId": "tpl_123",
        "styleId": "sty_456",
        "createdAt": "2024-01-15T10:30:00Z",
        "errorMessage": null
      }
    ]
  }
}
```

### 4. Get Invoice Templates

**Endpoint:** `GET /invoice-templates`

**Description:** Get available invoice templates for the organization.

**Query Parameters:**
- `templateType` (optional): Filter by template type (`STANDARD`, `MINIMAL`, `MODERN`, `CUSTOM`)
- `isSystem` (optional): Filter by system templates (`true`/`false`)
- `search` (optional): Search template names and descriptions
- `limit` (optional): Results per page (default: 50)
- `offset` (optional): Pagination offset (default: 0)

**Response:**
```json
{
  "success": true,
  "message": "Templates retrieved successfully",
  "data": {
    "templates": [
      {
        "id": "tpl_123",
        "name": "Professional Default",
        "description": "Clean professional invoice template",
        "templateType": "STANDARD",
        "isDefault": true,
        "isSystem": true,
        "version": "1.0.0",
        "createdAt": "2024-01-15T10:30:00Z",
        "stylesCount": 3
      }
    ],
    "pagination": {
      "total": 5,
      "limit": 50,
      "offset": 0,
      "pages": 1
    }
  }
}
```

### 5. Create Invoice Template

**Endpoint:** `POST /invoice-templates`

**Description:** Create a custom invoice template for the organization.

**Request Body:**
```json
{
  "name": "Custom Professional Template",
  "description": "Custom template with company-specific layout",
  "templateType": "CUSTOM",
  "htmlTemplate": "<html>{{#invoice}}<h1>Invoice {{number}}</h1>{{/invoice}}</html>",
  "isDefault": false,
  "tags": ["professional", "custom"]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Template created successfully",
  "data": {
    "template": {
      "id": "tpl_456",
      "name": "Custom Professional Template",
      "description": "Custom template with company-specific layout",
      "templateType": "CUSTOM",
      "isDefault": false,
      "version": "1.0.0",
      "createdAt": "2024-01-15T10:30:00Z"
    }
  }
}
```

### 6. Get Invoice Styles

**Endpoint:** `GET /invoice-styles`

**Description:** Get available invoice styles for the organization.

**Response:**
```json
{
  "success": true,
  "message": "Styles retrieved successfully",
  "data": {
    "styles": [
      {
        "id": "sty_123",
        "name": "Classic Black & White",
        "description": "Professional black and white styling",
        "templateId": null,
        "colorScheme": {
          "primary": "#000000",
          "secondary": "#666666",
          "accent": "#333333",
          "background": "#ffffff",
          "text": "#000000"
        },
        "fontFamily": "Times New Roman, serif",
        "isDefault": true,
        "isSystem": true,
        "version": "1.0.0"
      }
    ]
  }
}
```

### 7. Create Invoice Style

**Endpoint:** `POST /invoice-styles`

**Description:** Create a custom invoice style for the organization.

**Request Body:**
```json
{
  "name": "Custom Blue Theme",
  "description": "Custom blue color scheme for invoices",
  "templateId": "tpl_123",
  "cssContent": ":root { --primary-color: #2563eb; }",
  "colorScheme": {
    "primary": "#2563eb",
    "secondary": "#64748b",
    "accent": "#3b82f6",
    "background": "#ffffff",
    "text": "#1e293b"
  },
  "fontFamily": "Arial, sans-serif",
  "isDefault": false,
  "tags": ["blue", "modern"]
}
```

## Error Responses

All endpoints follow consistent error response format:

```json
{
  "success": false,
  "message": "Error description",
  "errors": ["Detailed error information"],
  "timestamp": "2024-01-15T10:30:00Z"
}
```

## Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `422` - Validation Error
- `500` - Internal Server Error

## Template Variables

Templates use Handlebars syntax with these available variables:

### Invoice Object
```javascript
{
  number: "INV-001",
  date: "2024-01-15",
  dueDate: "2024-02-15",
  status: "PENDING",
  subtotal: 1000.00,
  taxAmount: 130.00,
  totalAmount: 1130.00,
  notes: "Payment terms...",
  lineItems: [
    {
      description: "Service description",
      quantity: 2,
      unitPrice: 500.00,
      totalPrice: 1000.00
    }
  ]
}
```

### Organization & Customer Objects
```javascript
{
  organization: {
    name: "Company Inc",
    address: "123 Main St",
    email: "billing@company.com",
    phone: "+1-555-0123"
  },
  customer: {
    name: "John Doe",
    email: "john@example.com",
    address: "456 Oak Ave"
  }
}
```

### Branding Object
```javascript
{
  branding: {
    logoUrl: "/storage/logos/org_123/logo.png",
    showLogo: true,
    showOrgName: true,
    taxesEnabled: true,
    primaryColor: "#2563eb",
    textColor: "#1e293b"
  }
}
```

## Helper Functions

Templates include these Handlebars helpers:

- `{{formatCurrency amount}}` - Format as currency
- `{{formatDate date}}` - Format date
- `{{formatDecimal number}}` - Format decimal numbers
- `{{multiply a b}}` - Multiplication
- `{{#unless condition}}` - Conditional rendering