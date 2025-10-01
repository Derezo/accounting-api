# Public Intake System - Customization & Extensibility Design

**Document Version:** 1.0
**Date:** 2025-09-30
**Status:** Technical Design Proposal

---

## Executive Summary

This document provides a comprehensive technical design for transforming the current fixed public intake workflow into a **fully customizable, multi-purpose form builder system**. The proposed architecture enables organizations to:

1. Create custom intake workflows beyond customer/quote collection
2. Define dynamic form fields with validation rules
3. Configure multi-step workflows with conditional logic
4. Support multiple intake types (job applications, surveys, service requests, etc.)
5. Extend the system via plugins without code changes

**Current State:** Fixed 8-step workflow hardcoded for HVAC/Plumbing/Electrical services
**Future State:** Configurable workflow engine supporting unlimited use cases

---

## Table of Contents

1. [Current Limitations Analysis](#1-current-limitations-analysis)
2. [Proposed Architecture](#2-proposed-architecture)
3. [Database Schema Design](#3-database-schema-design)
4. [Form Builder System](#4-form-builder-system)
5. [Workflow Configuration Engine](#5-workflow-configuration-engine)
6. [Conditional Logic System](#6-conditional-logic-system)
7. [Template & Plugin Architecture](#7-template--plugin-architecture)
8. [API Design Changes](#8-api-design-changes)
9. [Migration Strategy](#9-migration-strategy)
10. [Code Examples](#10-code-examples)
11. [Implementation Roadmap](#11-implementation-roadmap)

---

## 1. Current Limitations Analysis

### 1.1 What Customization Features Are Missing?

#### **Workflow Rigidity**
- ✗ **Fixed 8 steps** - Cannot add/remove/reorder steps
- ✗ **Hardcoded step names** - `EMAIL_CAPTURE`, `PROFILE_TYPE`, etc. are immutable
- ✗ **No branching logic** - Linear flow only, cannot skip steps based on user input
- ✗ **No organization-specific workflows** - All orgs share the same flow

#### **Form Field Inflexibility**
- ✗ **Hardcoded field definitions** - Fields defined in Zod schemas, not database
- ✗ **Limited field types** - Cannot add custom field types (file upload, signature, etc.)
- ✗ **No dynamic field addition** - Cannot add fields without code deployment
- ✗ **No field dependencies** - Limited `showIf` logic only in business templates

#### **Use Case Limitations**
- ✗ **Customer/Quote only** - Cannot create job applications, surveys, registrations, etc.
- ✗ **Service industry focused** - Hardcoded categories (HVAC, Plumbing, Electrical)
- ✗ **No multi-entity conversion** - Can only create Customer + Quote, not other entities
- ✗ **No webhook integrations** - Cannot trigger external systems on completion

#### **Validation Constraints**
- ✗ **Fixed validation rules** - Cannot customize validation per organization
- ✗ **No custom validators** - Cannot add business-specific validation logic
- ✗ **No cross-field validation** - Cannot validate field A based on field B value
- ✗ **No async validation** - Cannot validate against external APIs

#### **Data Storage Issues**
- ✗ **Fixed data model** - `IntakeCustomerData` and `IntakeQuoteData` schemas are rigid
- ✗ **Limited custom fields** - Only `customFields` JSON blob for business templates
- ✗ **No versioning** - Cannot track form definition changes over time
- ✗ **No data migration** - Changing form schema breaks existing sessions

### 1.2 What Use Cases Can't Be Supported?

| Use Case | Why It Fails | Example |
|----------|-------------|---------|
| **Job Applications** | No applicant entity, requires resume upload | Cannot collect job applications for hiring |
| **Event Registrations** | No event entity, no attendee management | Cannot register users for workshops/webinars |
| **Customer Surveys** | No survey entity, no analytics | Cannot collect feedback or NPS scores |
| **Service Subscriptions** | No subscription entity, no recurring billing | Cannot sign up users for monthly services |
| **Lead Qualification** | No lead scoring, no CRM integration | Cannot qualify leads before conversion |
| **Multi-Location Intake** | Fixed address fields, no location selection | Franchise with multiple service areas |
| **Multi-Language Forms** | No i18n support, hardcoded English labels | Cannot serve non-English customers |
| **Conditional Workflows** | No branching logic, linear flow only | Cannot route users based on answers |
| **File Uploads** | No file upload field type | Cannot collect documents during intake |
| **Digital Signatures** | No signature field type | Cannot get consent signatures |

### 1.3 Where Is the Workflow Too Rigid?

```typescript
// CURRENT: Hardcoded in code
const VALID_TRANSITIONS: Record<WorkflowStep, WorkflowStep[]> = {
  EMAIL_CAPTURE: ['PROFILE_TYPE'],
  PROFILE_TYPE: ['PROFILE_DETAILS', 'EMAIL_CAPTURE'],
  // ... fixed transitions
}

// PROBLEM: Cannot customize without code changes
```

**Specific Rigidity Issues:**

1. **Step Order** - Cannot reorder steps (e.g., collect service category before profile type)
2. **Step Count** - Cannot have 3-step or 12-step workflows
3. **Step Content** - Each step has fixed field expectations
4. **Step Skipping** - Cannot skip optional steps based on user input
5. **Multi-Path Flows** - Cannot have different paths for different user types
6. **Progress Tracking** - Percentage calculation assumes 8 steps

---

## 2. Proposed Architecture

### 2.1 High-Level System Design

```
┌─────────────────────────────────────────────────────────────────┐
│                    ADMIN CONFIGURATION LAYER                     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Form Builder UI (Future: Web-based editor)              │  │
│  │  - Drag-and-drop field designer                          │  │
│  │  - Workflow step configuration                           │  │
│  │  - Validation rule builder                               │  │
│  │  - Template marketplace                                  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                            ▼                                     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Form Definition API (Phase 1: JSON-based)               │  │
│  │  - CRUD for form templates                               │  │
│  │  - Workflow configuration                                │  │
│  │  - Field library management                              │  │
│  │  - Validation rule management                            │  │
│  └──────────────────────────────────────────────────────────┘  │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                   CONFIGURATION STORAGE                          │
│  ┌──────────────┬──────────────┬──────────────┬─────────────┐  │
│  │  IntakeForm  │  FormField   │  FormStep    │ FormAction  │  │
│  │  Templates   │  Definitions │  Workflows   │ Handlers    │  │
│  └──────────────┴──────────────┴──────────────┴─────────────┘  │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                   RUNTIME EXECUTION LAYER                        │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Workflow Engine                                         │  │
│  │  - Dynamic step resolution                               │  │
│  │  - Conditional logic evaluation                          │  │
│  │  - Progress tracking                                     │  │
│  │  - State machine execution                               │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Dynamic Validation Engine                               │  │
│  │  - Runtime schema generation                             │  │
│  │  - Custom validator execution                            │  │
│  │  - Cross-field validation                                │  │
│  │  - Async validation support                              │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Data Collection & Storage                               │  │
│  │  - Dynamic field storage (EAV pattern)                   │  │
│  │  - Session management                                    │  │
│  │  - Versioning & audit trail                              │  │
│  └──────────────────────────────────────────────────────────┘  │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                   CONVERSION & INTEGRATION LAYER                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Entity Mapper                                           │  │
│  │  - Map form data to domain entities                      │  │
│  │  - Support multiple entity types                         │  │
│  │  - Custom transformation rules                           │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Action Pipeline                                         │  │
│  │  - Webhook triggers                                      │  │
│  │  - Email notifications                                   │  │
│  │  - CRM integrations                                      │  │
│  │  - Custom action handlers                                │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Core Design Principles

1. **Configuration over Code** - All workflow definitions stored in database, not code
2. **Backwards Compatibility** - Existing intake sessions continue to work
3. **Multi-Tenancy** - Each organization can have custom forms
4. **Security First** - All existing security measures (bot detection, rate limiting) preserved
5. **Performance** - Minimal runtime overhead for dynamic resolution
6. **Extensibility** - Plugin architecture for custom field types and validators
7. **Version Control** - Form definitions are versioned, sessions reference specific versions

---

## 3. Database Schema Design

### 3.1 Core Configuration Tables

#### **IntakeFormTemplate**
Defines reusable form templates that organizations can use or customize.

```prisma
model IntakeFormTemplate {
  id              String   @id @default(cuid())
  organizationId  String?  // Null for system templates, set for org-specific

  // Template Metadata
  name            String   // e.g., "Customer Quote Request", "Job Application"
  slug            String   // URL-friendly identifier
  description     String?
  category        String?  // e.g., "CUSTOMER_INTAKE", "HR", "SURVEY"
  version         Int      @default(1)
  isActive        Boolean  @default(true)
  isSystemTemplate Boolean @default(false) // Cannot be modified

  // Template Configuration (JSON)
  config          String   // Serialized FormTemplateConfig

  // Conversion Configuration
  entityType      String?  // "CUSTOMER", "APPLICANT", "LEAD", etc.
  conversionMap   String?  // JSON: How to map form fields to entity fields

  // Workflow Steps
  steps           IntakeFormStep[]

  // Usage Tracking
  usageCount      Int      @default(0)
  lastUsedAt      DateTime?

  // Timestamps
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  deletedAt       DateTime?

  // Relationships
  organization    Organization? @relation(fields: [organizationId], references: [id])
  sessions        IntakeSession[]
  fields          IntakeFormField[]
  actions         IntakeFormAction[]

  @@unique([organizationId, slug, version])
  @@index([organizationId])
  @@index([slug])
  @@index([category])
  @@index([isActive])
  @@map("intake_form_templates")
}
```

#### **IntakeFormStep**
Defines individual steps in a workflow.

```prisma
model IntakeFormStep {
  id              String   @id @default(cuid())
  templateId      String

  // Step Identity
  stepKey         String   // e.g., "email_capture", "profile_details"
  stepNumber      Int      // Order in workflow
  stepName        String   // Display name
  description     String?

  // Navigation
  nextStepKey     String?  // Default next step
  prevStepKey     String?  // Default previous step

  // Conditional Navigation (JSON)
  conditionalRouting String? // Rules for dynamic next step

  // Validation
  validationRules String?  // JSON: Step-level validation rules
  isSkippable     Boolean  @default(false)
  isRequired      Boolean  @default(true)

  // UI Configuration
  layout          String?  // "single_column", "two_column", "grid"
  progressWeight  Int      @default(1) // Weight for progress calculation

  // Timestamps
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  // Relationships
  template        IntakeFormTemplate @relation(fields: [templateId], references: [id], onDelete: Cascade)
  fields          IntakeFormField[]

  @@unique([templateId, stepKey])
  @@index([templateId, stepNumber])
  @@map("intake_form_steps")
}
```

#### **IntakeFormField**
Defines individual form fields with validation and conditional logic.

```prisma
model IntakeFormField {
  id              String   @id @default(cuid())
  templateId      String
  stepId          String

  // Field Identity
  fieldKey        String   // e.g., "email", "firstName", "serviceCategory"
  fieldName       String   // Display label
  fieldType       String   // "text", "email", "select", "file", "signature", etc.

  // Configuration (JSON)
  config          String   // FieldConfiguration (placeholder, helpText, options, etc.)

  // Validation
  validationRules String   // JSON array of validation rules
  isRequired      Boolean  @default(false)

  // Conditional Display
  conditionalLogic String? // JSON: showIf, hideIf rules

  // Data Mapping
  dataPath        String?  // Path in session data (e.g., "customerData.email")
  entityMapping   String?  // How to map to final entity (e.g., "Customer.email")

  // UI/UX
  displayOrder    Int      @default(0)
  width           String?  // "full", "half", "third", "quarter"
  isVisible       Boolean  @default(true)

  // Timestamps
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  // Relationships
  template        IntakeFormTemplate @relation(fields: [templateId], references: [id], onDelete: Cascade)
  step            IntakeFormStep @relation(fields: [stepId], references: [id], onDelete: Cascade)

  @@unique([templateId, fieldKey])
  @@index([stepId, displayOrder])
  @@map("intake_form_fields")
}
```

#### **IntakeFormAction**
Defines actions to execute on form completion or specific events.

```prisma
model IntakeFormAction {
  id              String   @id @default(cuid())
  templateId      String

  // Action Configuration
  actionType      String   // "CREATE_ENTITY", "SEND_EMAIL", "WEBHOOK", "CUSTOM"
  actionConfig    String   // JSON configuration

  // Trigger
  triggerEvent    String   // "ON_SUBMIT", "ON_STEP_COMPLETE", "ON_FIELD_CHANGE"
  triggerCondition String? // Optional condition for execution

  // Execution
  executionOrder  Int      @default(0)
  isAsync         Boolean  @default(false)
  retryOnFailure  Boolean  @default(true)
  maxRetries      Int      @default(3)

  // Status
  isEnabled       Boolean  @default(true)

  // Timestamps
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  // Relationships
  template        IntakeFormTemplate @relation(fields: [templateId], references: [id], onDelete: Cascade)
  executions      IntakeActionExecution[]

  @@index([templateId, executionOrder])
  @@map("intake_form_actions")
}
```

#### **IntakeActionExecution**
Tracks action execution history for debugging and audit.

```prisma
model IntakeActionExecution {
  id              String   @id @default(cuid())
  actionId        String
  sessionId       String

  // Execution Details
  status          String   // "PENDING", "SUCCESS", "FAILED", "RETRYING"
  attempts        Int      @default(0)
  result          String?  // JSON: Execution result or error

  // Timing
  startedAt       DateTime @default(now())
  completedAt     DateTime?

  // Relationships
  action          IntakeFormAction @relation(fields: [actionId], references: [id], onDelete: Cascade)
  session         IntakeSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@index([sessionId])
  @@index([actionId, status])
  @@map("intake_action_executions")
}
```

### 3.2 Enhanced Session Tables

#### **Enhanced IntakeSession**
Updated to reference form template and support dynamic workflows.

```prisma
model IntakeSession {
  id                String           @id @default(cuid())
  templateId        String           // Reference to form template
  templateVersion   Int              // Version of template being used

  // Token Management (unchanged)
  tokenHash         String           @unique
  tokenVersion      Int              @default(1)

  // Session State
  status            String           @default("ACTIVE")
  currentStepKey    String           @default("initial") // Dynamic step identifier
  completedSteps    String           // JSON array of completed step keys

  // Session Data (Dynamic Storage)
  formData          IntakeFormData[] // EAV pattern for dynamic fields

  // Security Context (unchanged)
  ipAddress         String
  userAgent         String?
  fingerprint       String?
  origin            String?

  // Bot Detection (unchanged)
  suspicionScore    Int              @default(0)
  botFlags          String?
  honeypotTriggered Boolean          @default(false)

  // Timing (unchanged)
  sessionStartedAt  DateTime         @default(now())
  lastActivityAt    DateTime         @default(now())
  stepTimings       String?

  // Request Tracking (unchanged)
  requestCount      Int              @default(0)
  submissionAttempts Int             @default(0)

  // Conversion Tracking
  convertedAt       DateTime?
  convertedEntities String?          // JSON: Array of created entities

  // Compliance (unchanged)
  privacyPolicyAccepted Boolean      @default(false)
  termsAccepted     Boolean          @default(false)
  marketingConsent  Boolean          @default(false)

  // Expiration (unchanged)
  expiresAt         DateTime
  deletedAt         DateTime?

  // Timestamps
  createdAt         DateTime         @default(now())
  updatedAt         DateTime         @updatedAt

  // Relationships
  template          IntakeFormTemplate @relation(fields: [templateId], references: [id])
  securityEvents    IntakeSecurityEvent[]
  actionExecutions  IntakeActionExecution[]

  @@index([tokenHash])
  @@index([templateId])
  @@index([status])
  @@index([currentStepKey])
  @@map("intake_sessions")
}
```

#### **IntakeFormData** (EAV Pattern)
Dynamic storage for form field values.

```prisma
model IntakeFormData {
  id              String   @id @default(cuid())
  sessionId       String

  // Field Identity
  fieldKey        String   // References IntakeFormField.fieldKey
  fieldType       String   // For type-safe deserialization

  // Data Storage
  valueString     String?
  valueNumber     Float?
  valueBoolean    Boolean?
  valueDate       DateTime?
  valueJson       String?  // For complex types (arrays, objects, files)

  // Metadata
  stepKey         String   // Which step this data came from
  updatedCount    Int      @default(1)

  // Timestamps
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  // Relationships
  session         IntakeSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@unique([sessionId, fieldKey])
  @@index([sessionId, stepKey])
  @@map("intake_form_data")
}
```

### 3.3 Deprecation Strategy for Old Tables

```typescript
// Keep old tables for backwards compatibility
// Mark as deprecated in schema

// IntakeCustomerData - DEPRECATED
// IntakeQuoteData - DEPRECATED

// These will be gradually migrated to IntakeFormData
// Sessions created before migration continue to use old tables
```

---

## 4. Form Builder System

### 4.1 Field Type Registry

```typescript
// src/intake/field-types/field-type-registry.ts

export interface FieldType {
  type: string;
  label: string;
  category: 'text' | 'choice' | 'media' | 'advanced';
  defaultConfig: Record<string, any>;
  validationSchema: z.ZodSchema;
  renderer?: string; // Client-side renderer component
}

export const FIELD_TYPE_REGISTRY: Record<string, FieldType> = {
  // Text Input Types
  TEXT: {
    type: 'text',
    label: 'Text Input',
    category: 'text',
    defaultConfig: {
      placeholder: '',
      maxLength: 255,
      pattern: null,
    },
    validationSchema: z.string(),
  },

  TEXTAREA: {
    type: 'textarea',
    label: 'Text Area',
    category: 'text',
    defaultConfig: {
      placeholder: '',
      rows: 4,
      maxLength: 2000,
    },
    validationSchema: z.string(),
  },

  EMAIL: {
    type: 'email',
    label: 'Email Address',
    category: 'text',
    defaultConfig: {
      placeholder: 'user@example.com',
      validateDisposable: true,
    },
    validationSchema: z.string().email(),
  },

  PHONE: {
    type: 'phone',
    label: 'Phone Number',
    category: 'text',
    defaultConfig: {
      format: 'NANP', // North American Numbering Plan
      placeholder: '+1 (555) 555-5555',
    },
    validationSchema: z.string().regex(/^\+?1?[-.\s]?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})$/),
  },

  NUMBER: {
    type: 'number',
    label: 'Number',
    category: 'text',
    defaultConfig: {
      min: null,
      max: null,
      step: 1,
      allowDecimal: false,
    },
    validationSchema: z.number(),
  },

  // Choice Types
  SELECT: {
    type: 'select',
    label: 'Dropdown',
    category: 'choice',
    defaultConfig: {
      options: [],
      allowOther: false,
      placeholder: 'Select an option...',
    },
    validationSchema: z.string(),
  },

  RADIO: {
    type: 'radio',
    label: 'Radio Buttons',
    category: 'choice',
    defaultConfig: {
      options: [],
      allowOther: false,
      layout: 'vertical', // 'vertical' | 'horizontal' | 'grid'
    },
    validationSchema: z.string(),
  },

  CHECKBOX: {
    type: 'checkbox',
    label: 'Checkbox',
    category: 'choice',
    defaultConfig: {
      label: 'I agree',
    },
    validationSchema: z.boolean(),
  },

  MULTISELECT: {
    type: 'multiselect',
    label: 'Multi-Select',
    category: 'choice',
    defaultConfig: {
      options: [],
      minSelections: null,
      maxSelections: null,
    },
    validationSchema: z.array(z.string()),
  },

  // Date/Time Types
  DATE: {
    type: 'date',
    label: 'Date Picker',
    category: 'text',
    defaultConfig: {
      minDate: null,
      maxDate: null,
      disablePastDates: false,
      disableFutureDates: false,
    },
    validationSchema: z.string().datetime(),
  },

  TIME: {
    type: 'time',
    label: 'Time Picker',
    category: 'text',
    defaultConfig: {
      format: '24h', // '12h' | '24h'
      step: 15, // minutes
    },
    validationSchema: z.string(),
  },

  DATETIME: {
    type: 'datetime',
    label: 'Date & Time',
    category: 'text',
    defaultConfig: {
      minDate: null,
      maxDate: null,
    },
    validationSchema: z.string().datetime(),
  },

  // Media Types
  FILE_UPLOAD: {
    type: 'file',
    label: 'File Upload',
    category: 'media',
    defaultConfig: {
      maxFileSize: 10 * 1024 * 1024, // 10MB
      allowedExtensions: ['.pdf', '.jpg', '.png', '.doc', '.docx'],
      maxFiles: 5,
    },
    validationSchema: z.object({
      fileName: z.string(),
      fileSize: z.number(),
      fileType: z.string(),
      url: z.string().url(),
    }),
  },

  SIGNATURE: {
    type: 'signature',
    label: 'Digital Signature',
    category: 'media',
    defaultConfig: {
      width: 400,
      height: 200,
      penColor: '#000000',
    },
    validationSchema: z.object({
      dataUrl: z.string(),
      timestamp: z.string().datetime(),
    }),
  },

  // Advanced Types
  ADDRESS: {
    type: 'address',
    label: 'Address',
    category: 'advanced',
    defaultConfig: {
      autocomplete: true,
      requirePostalCode: true,
      defaultCountry: 'CA',
    },
    validationSchema: z.object({
      line1: z.string(),
      line2: z.string().optional(),
      city: z.string(),
      province: z.string(),
      postalCode: z.string(),
      country: z.string(),
    }),
  },

  RATING: {
    type: 'rating',
    label: 'Rating',
    category: 'choice',
    defaultConfig: {
      maxRating: 5,
      allowHalf: false,
      icon: 'star', // 'star' | 'heart' | 'thumb'
    },
    validationSchema: z.number().min(0).max(5),
  },

  SLIDER: {
    type: 'slider',
    label: 'Slider',
    category: 'text',
    defaultConfig: {
      min: 0,
      max: 100,
      step: 1,
      showValue: true,
    },
    validationSchema: z.number(),
  },

  MATRIX: {
    type: 'matrix',
    label: 'Matrix / Grid',
    category: 'advanced',
    defaultConfig: {
      rows: [],
      columns: [],
      inputType: 'radio', // 'radio' | 'checkbox' | 'text'
    },
    validationSchema: z.record(z.string()),
  },
};

export class FieldTypeRegistry {
  public getFieldType(type: string): FieldType | null {
    return FIELD_TYPE_REGISTRY[type.toUpperCase()] || null;
  }

  public getAllFieldTypes(): FieldType[] {
    return Object.values(FIELD_TYPE_REGISTRY);
  }

  public getFieldTypesByCategory(category: string): FieldType[] {
    return Object.values(FIELD_TYPE_REGISTRY).filter(ft => ft.category === category);
  }

  public registerCustomFieldType(fieldType: FieldType): void {
    FIELD_TYPE_REGISTRY[fieldType.type.toUpperCase()] = fieldType;
  }
}

export const fieldTypeRegistry = new FieldTypeRegistry();
```

### 4.2 Form Template Configuration Format

```typescript
// src/intake/types/form-config.types.ts

export interface FormTemplateConfig {
  metadata: {
    name: string;
    description: string;
    category: string;
    version: number;
  };

  settings: {
    // Workflow Settings
    allowBack: boolean;
    allowSave: boolean;
    autoSave: boolean;
    autoSaveInterval: number; // seconds

    // Progress Settings
    showProgress: boolean;
    progressStyle: 'steps' | 'bar' | 'percentage';

    // Security Settings
    requireCaptcha: boolean;
    captchaThreshold: number; // Suspicion score threshold
    honeypotFields: string[];

    // Timing Settings
    sessionTimeout: number; // hours
    stepTimeout: number; // minutes

    // UI Settings
    theme: string;
    customCss: string | null;
    showLogo: boolean;
    headerText: string | null;
    footerText: string | null;
  };

  completion: {
    // What happens on form completion
    successMessage: string;
    redirectUrl: string | null;
    showConfirmation: boolean;

    // Entity Creation
    createEntities: EntityCreationConfig[];

    // Notifications
    sendEmailToUser: boolean;
    sendEmailToAdmin: boolean;
    emailTemplates: {
      userConfirmation: string | null;
      adminNotification: string | null;
    };
  };
}

export interface EntityCreationConfig {
  entityType: 'CUSTOMER' | 'QUOTE' | 'LEAD' | 'APPLICANT' | 'CUSTOM';
  entityName: string; // For custom entities
  fieldMapping: Record<string, string>; // formField -> entityField
  conditionalCreation: ConditionalRule | null;
}

export interface ConditionalRule {
  operator: 'AND' | 'OR';
  conditions: Condition[];
}

export interface Condition {
  field: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than' | 'is_empty' | 'is_not_empty';
  value: any;
}
```

---

## 5. Workflow Configuration Engine

### 5.1 Dynamic Step Resolution

```typescript
// src/intake/workflow/workflow-engine.ts

export interface StepDefinition {
  stepKey: string;
  stepName: string;
  fields: FieldDefinition[];
  validationRules: ValidationRule[];
  conditionalRouting: ConditionalRouting | null;
  isSkippable: boolean;
  progressWeight: number;
}

export interface ConditionalRouting {
  rules: RoutingRule[];
  defaultNextStep: string;
}

export interface RoutingRule {
  condition: ConditionalRule;
  nextStepKey: string;
  action?: 'skip' | 'jump' | 'complete';
}

export class WorkflowEngine {
  /**
   * Resolve next step based on current step and session data
   */
  public async resolveNextStep(
    session: IntakeSession,
    currentStepKey: string,
    formData: Record<string, any>
  ): Promise<string | null> {
    const template = await this.getTemplate(session.templateId);
    const currentStep = await this.getStep(template.id, currentStepKey);

    if (!currentStep) {
      throw new Error(`Step ${currentStepKey} not found in template`);
    }

    // Check for conditional routing
    if (currentStep.conditionalRouting) {
      const nextStep = this.evaluateConditionalRouting(
        currentStep.conditionalRouting,
        formData
      );
      if (nextStep) {
        return nextStep;
      }
    }

    // Default next step
    return currentStep.nextStepKey || null;
  }

  /**
   * Evaluate conditional routing rules
   */
  private evaluateConditionalRouting(
    routing: ConditionalRouting,
    formData: Record<string, any>
  ): string | null {
    for (const rule of routing.rules) {
      if (this.evaluateCondition(rule.condition, formData)) {
        return rule.nextStepKey;
      }
    }
    return routing.defaultNextStep;
  }

  /**
   * Evaluate a single conditional rule
   */
  private evaluateCondition(
    rule: ConditionalRule,
    formData: Record<string, any>
  ): boolean {
    if (rule.operator === 'AND') {
      return rule.conditions.every(c => this.evaluateSingleCondition(c, formData));
    } else if (rule.operator === 'OR') {
      return rule.conditions.some(c => this.evaluateSingleCondition(c, formData));
    }
    return false;
  }

  /**
   * Evaluate a single condition
   */
  private evaluateSingleCondition(
    condition: Condition,
    formData: Record<string, any>
  ): boolean {
    const fieldValue = formData[condition.field];

    switch (condition.operator) {
      case 'equals':
        return fieldValue === condition.value;
      case 'not_equals':
        return fieldValue !== condition.value;
      case 'contains':
        return String(fieldValue).includes(String(condition.value));
      case 'greater_than':
        return Number(fieldValue) > Number(condition.value);
      case 'less_than':
        return Number(fieldValue) < Number(condition.value);
      case 'is_empty':
        return !fieldValue || fieldValue === '';
      case 'is_not_empty':
        return !!fieldValue && fieldValue !== '';
      default:
        return false;
    }
  }

  /**
   * Calculate completion percentage with weighted steps
   */
  public calculateProgress(
    template: IntakeFormTemplate,
    completedStepKeys: string[]
  ): number {
    const allSteps = template.steps;
    const totalWeight = allSteps.reduce((sum, step) => sum + step.progressWeight, 0);

    const completedWeight = allSteps
      .filter(step => completedStepKeys.includes(step.stepKey))
      .reduce((sum, step) => sum + step.progressWeight, 0);

    return Math.round((completedWeight / totalWeight) * 100);
  }

  /**
   * Validate step completion
   */
  public async validateStep(
    stepKey: string,
    formData: Record<string, any>,
    template: IntakeFormTemplate
  ): Promise<ValidationResult> {
    const step = await this.getStep(template.id, stepKey);
    const errors: Record<string, string[]> = {};

    // Validate each field in the step
    for (const field of step.fields) {
      const fieldValue = formData[field.fieldKey];
      const fieldErrors = await this.validateField(field, fieldValue, formData);

      if (fieldErrors.length > 0) {
        errors[field.fieldKey] = fieldErrors;
      }
    }

    // Step-level validation
    if (step.validationRules) {
      const stepErrors = await this.validateStepRules(step, formData);
      if (stepErrors.length > 0) {
        errors['_step'] = stepErrors;
      }
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors,
    };
  }
}

export const workflowEngine = new WorkflowEngine();
```

### 5.2 Example Workflow Configurations

#### **Example 1: Customer Quote Intake (Backward Compatible)**

```json
{
  "metadata": {
    "name": "Customer Quote Request",
    "description": "Default customer and quote intake workflow",
    "category": "CUSTOMER_INTAKE",
    "version": 1
  },
  "settings": {
    "allowBack": true,
    "allowSave": true,
    "showProgress": true,
    "progressStyle": "steps"
  },
  "steps": [
    {
      "stepKey": "email_capture",
      "stepName": "Get Started",
      "stepNumber": 1,
      "nextStepKey": "profile_type",
      "fields": [
        {
          "fieldKey": "email",
          "fieldName": "Email Address",
          "fieldType": "EMAIL",
          "isRequired": true,
          "dataPath": "customerData.email"
        }
      ]
    },
    {
      "stepKey": "profile_type",
      "stepName": "Profile Type",
      "stepNumber": 2,
      "nextStepKey": "profile_details",
      "prevStepKey": "email_capture",
      "fields": [
        {
          "fieldKey": "profileType",
          "fieldName": "Are you a residential or commercial customer?",
          "fieldType": "RADIO",
          "isRequired": true,
          "config": {
            "options": ["RESIDENTIAL", "COMMERCIAL"]
          },
          "dataPath": "customerData.profileType"
        }
      ],
      "conditionalRouting": {
        "rules": [
          {
            "condition": {
              "operator": "AND",
              "conditions": [
                { "field": "profileType", "operator": "equals", "value": "RESIDENTIAL" }
              ]
            },
            "nextStepKey": "residential_details"
          },
          {
            "condition": {
              "operator": "AND",
              "conditions": [
                { "field": "profileType", "operator": "equals", "value": "COMMERCIAL" }
              ]
            },
            "nextStepKey": "commercial_details"
          }
        ],
        "defaultNextStep": "profile_details"
      }
    }
  ]
}
```

#### **Example 2: Job Application Workflow**

```json
{
  "metadata": {
    "name": "Job Application Form",
    "description": "Collect job applications with resume upload",
    "category": "HR",
    "version": 1
  },
  "settings": {
    "allowBack": true,
    "allowSave": true,
    "showProgress": true,
    "progressStyle": "bar"
  },
  "steps": [
    {
      "stepKey": "basic_info",
      "stepName": "Basic Information",
      "stepNumber": 1,
      "nextStepKey": "experience",
      "fields": [
        { "fieldKey": "firstName", "fieldName": "First Name", "fieldType": "TEXT", "isRequired": true },
        { "fieldKey": "lastName", "fieldName": "Last Name", "fieldType": "TEXT", "isRequired": true },
        { "fieldKey": "email", "fieldName": "Email", "fieldType": "EMAIL", "isRequired": true },
        { "fieldKey": "phone", "fieldName": "Phone", "fieldType": "PHONE", "isRequired": true },
        { "fieldKey": "linkedinUrl", "fieldName": "LinkedIn Profile", "fieldType": "TEXT", "isRequired": false }
      ]
    },
    {
      "stepKey": "experience",
      "stepName": "Experience",
      "stepNumber": 2,
      "nextStepKey": "resume_upload",
      "fields": [
        {
          "fieldKey": "yearsExperience",
          "fieldName": "Years of Experience",
          "fieldType": "NUMBER",
          "isRequired": true,
          "config": { "min": 0, "max": 50 }
        },
        {
          "fieldKey": "currentEmployer",
          "fieldName": "Current/Most Recent Employer",
          "fieldType": "TEXT",
          "isRequired": false
        },
        {
          "fieldKey": "skills",
          "fieldName": "Key Skills",
          "fieldType": "MULTISELECT",
          "isRequired": true,
          "config": {
            "options": ["JavaScript", "TypeScript", "React", "Node.js", "Python", "Other"]
          }
        }
      ]
    },
    {
      "stepKey": "resume_upload",
      "stepName": "Resume",
      "stepNumber": 3,
      "nextStepKey": "review",
      "fields": [
        {
          "fieldKey": "resume",
          "fieldName": "Upload Resume",
          "fieldType": "FILE",
          "isRequired": true,
          "config": {
            "maxFileSize": 5242880,
            "allowedExtensions": [".pdf", ".doc", ".docx"],
            "maxFiles": 1
          }
        },
        {
          "fieldKey": "coverLetter",
          "fieldName": "Cover Letter (Optional)",
          "fieldType": "TEXTAREA",
          "isRequired": false,
          "config": { "maxLength": 2000 }
        }
      ]
    }
  ],
  "completion": {
    "successMessage": "Thank you for applying! We'll review your application and get back to you soon.",
    "redirectUrl": null,
    "createEntities": [
      {
        "entityType": "CUSTOM",
        "entityName": "Applicant",
        "fieldMapping": {
          "firstName": "firstName",
          "lastName": "lastName",
          "email": "email",
          "phone": "phone",
          "yearsExperience": "experience",
          "resume": "resumeUrl"
        }
      }
    ],
    "sendEmailToUser": true,
    "sendEmailToAdmin": true
  }
}
```

---

## 6. Conditional Logic System

### 6.1 Conditional Display (showIf / hideIf)

```typescript
// src/intake/validation/conditional-logic.ts

export interface ConditionalLogic {
  showIf?: ConditionalRule;
  hideIf?: ConditionalRule;
  requireIf?: ConditionalRule; // Dynamic required field
  disableIf?: ConditionalRule; // Dynamic disabled field
}

export class ConditionalLogicEngine {
  /**
   * Evaluate if a field should be visible
   */
  public shouldShowField(
    field: IntakeFormField,
    formData: Record<string, any>
  ): boolean {
    if (!field.conditionalLogic) {
      return field.isVisible;
    }

    const logic = JSON.parse(field.conditionalLogic) as ConditionalLogic;

    // hideIf takes precedence
    if (logic.hideIf && this.evaluateRule(logic.hideIf, formData)) {
      return false;
    }

    // showIf
    if (logic.showIf && !this.evaluateRule(logic.showIf, formData)) {
      return false;
    }

    return field.isVisible;
  }

  /**
   * Evaluate if a field should be required
   */
  public isFieldRequired(
    field: IntakeFormField,
    formData: Record<string, any>
  ): boolean {
    if (!field.conditionalLogic) {
      return field.isRequired;
    }

    const logic = JSON.parse(field.conditionalLogic) as ConditionalLogic;

    if (logic.requireIf && this.evaluateRule(logic.requireIf, formData)) {
      return true;
    }

    return field.isRequired;
  }

  /**
   * Evaluate a conditional rule
   */
  private evaluateRule(
    rule: ConditionalRule,
    formData: Record<string, any>
  ): boolean {
    if (rule.operator === 'AND') {
      return rule.conditions.every(c => this.evaluateCondition(c, formData));
    } else if (rule.operator === 'OR') {
      return rule.conditions.some(c => this.evaluateCondition(c, formData));
    }
    return false;
  }

  /**
   * Evaluate a single condition
   */
  private evaluateCondition(
    condition: Condition,
    formData: Record<string, any>
  ): boolean {
    const fieldValue = formData[condition.field];

    switch (condition.operator) {
      case 'equals':
        return fieldValue === condition.value;
      case 'not_equals':
        return fieldValue !== condition.value;
      case 'contains':
        if (Array.isArray(fieldValue)) {
          return fieldValue.includes(condition.value);
        }
        return String(fieldValue).includes(String(condition.value));
      case 'greater_than':
        return Number(fieldValue) > Number(condition.value);
      case 'less_than':
        return Number(fieldValue) < Number(condition.value);
      case 'is_empty':
        return !fieldValue || fieldValue === '' || (Array.isArray(fieldValue) && fieldValue.length === 0);
      case 'is_not_empty':
        return !!fieldValue && fieldValue !== '' && !(Array.isArray(fieldValue) && fieldValue.length === 0);
      default:
        return false;
    }
  }
}

export const conditionalLogicEngine = new ConditionalLogicEngine();
```

### 6.2 Example Conditional Logic Configurations

```typescript
// Example 1: Show "Water Heater Type" field only if "Water heater problem" is selected

const waterHeaterTypeField: IntakeFormField = {
  fieldKey: 'waterHeaterType',
  fieldName: 'Water Heater Type',
  fieldType: 'SELECT',
  conditionalLogic: JSON.stringify({
    showIf: {
      operator: 'OR',
      conditions: [
        {
          field: 'plumbingIssue',
          operator: 'contains',
          value: 'Water heater problem'
        },
        {
          field: 'plumbingIssue',
          operator: 'contains',
          value: 'Installation/Upgrade'
        }
      ]
    }
  }),
  // ... other field properties
};

// Example 2: Make "Proof of Insurance" required if "Insurance Claim" is "Yes"

const proofOfInsuranceField: IntakeFormField = {
  fieldKey: 'proofOfInsurance',
  fieldName: 'Upload Proof of Insurance',
  fieldType: 'FILE',
  isRequired: false, // Base requirement
  conditionalLogic: JSON.stringify({
    requireIf: {
      operator: 'AND',
      conditions: [
        {
          field: 'insuranceClaim',
          operator: 'equals',
          value: 'Yes'
        }
      ]
    }
  }),
  // ... other field properties
};

// Example 3: Hide "Budget Range" if "Get Free Quote" is selected

const budgetRangeField: IntakeFormField = {
  fieldKey: 'budgetRange',
  fieldName: 'Estimated Budget',
  fieldType: 'SELECT',
  conditionalLogic: JSON.stringify({
    hideIf: {
      operator: 'AND',
      conditions: [
        {
          field: 'quotePreference',
          operator: 'equals',
          value: 'Get Free Quote'
        }
      ]
    }
  }),
  // ... other field properties
};
```

---

## 7. Template & Plugin Architecture

### 7.1 System Templates vs Organization Templates

```typescript
// src/intake/templates/template-manager.ts

export class TemplateManager {
  /**
   * Get or create template for organization
   */
  public async getOrganizationTemplate(
    organizationId: string,
    templateSlug: string
  ): Promise<IntakeFormTemplate> {
    // 1. Check if organization has custom template
    const orgTemplate = await prisma.intakeFormTemplate.findFirst({
      where: {
        organizationId,
        slug: templateSlug,
        isActive: true,
      },
      orderBy: { version: 'desc' },
    });

    if (orgTemplate) {
      return orgTemplate;
    }

    // 2. Fall back to system template
    const systemTemplate = await prisma.intakeFormTemplate.findFirst({
      where: {
        organizationId: null,
        slug: templateSlug,
        isSystemTemplate: true,
        isActive: true,
      },
      orderBy: { version: 'desc' },
    });

    if (!systemTemplate) {
      throw new NotFoundError(`Template ${templateSlug} not found`);
    }

    return systemTemplate;
  }

  /**
   * Clone system template for organization customization
   */
  public async cloneTemplateForOrganization(
    systemTemplateId: string,
    organizationId: string,
    customizations?: Partial<FormTemplateConfig>
  ): Promise<IntakeFormTemplate> {
    const systemTemplate = await prisma.intakeFormTemplate.findUnique({
      where: { id: systemTemplateId },
      include: { steps: true, fields: true, actions: true },
    });

    if (!systemTemplate || !systemTemplate.isSystemTemplate) {
      throw new ValidationError('Invalid system template');
    }

    // Create organization-specific copy
    const orgTemplate = await prisma.intakeFormTemplate.create({
      data: {
        organizationId,
        name: `${systemTemplate.name} (Custom)`,
        slug: systemTemplate.slug,
        description: systemTemplate.description,
        category: systemTemplate.category,
        version: 1,
        isSystemTemplate: false,
        config: customizations
          ? JSON.stringify({ ...JSON.parse(systemTemplate.config), ...customizations })
          : systemTemplate.config,
        entityType: systemTemplate.entityType,
        conversionMap: systemTemplate.conversionMap,
      },
    });

    // Clone steps
    for (const step of systemTemplate.steps) {
      await prisma.intakeFormStep.create({
        data: {
          templateId: orgTemplate.id,
          stepKey: step.stepKey,
          stepNumber: step.stepNumber,
          stepName: step.stepName,
          description: step.description,
          nextStepKey: step.nextStepKey,
          prevStepKey: step.prevStepKey,
          conditionalRouting: step.conditionalRouting,
          validationRules: step.validationRules,
          isSkippable: step.isSkippable,
          isRequired: step.isRequired,
          layout: step.layout,
          progressWeight: step.progressWeight,
        },
      });
    }

    // Clone fields
    for (const field of systemTemplate.fields) {
      await prisma.intakeFormField.create({
        data: {
          templateId: orgTemplate.id,
          stepId: (await prisma.intakeFormStep.findFirst({
            where: { templateId: orgTemplate.id, stepKey: field.stepId },
          }))!.id,
          fieldKey: field.fieldKey,
          fieldName: field.fieldName,
          fieldType: field.fieldType,
          config: field.config,
          validationRules: field.validationRules,
          isRequired: field.isRequired,
          conditionalLogic: field.conditionalLogic,
          dataPath: field.dataPath,
          entityMapping: field.entityMapping,
          displayOrder: field.displayOrder,
          width: field.width,
          isVisible: field.isVisible,
        },
      });
    }

    // Clone actions
    for (const action of systemTemplate.actions) {
      await prisma.intakeFormAction.create({
        data: {
          templateId: orgTemplate.id,
          actionType: action.actionType,
          actionConfig: action.actionConfig,
          triggerEvent: action.triggerEvent,
          triggerCondition: action.triggerCondition,
          executionOrder: action.executionOrder,
          isAsync: action.isAsync,
          retryOnFailure: action.retryOnFailure,
          maxRetries: action.maxRetries,
          isEnabled: action.isEnabled,
        },
      });
    }

    return orgTemplate;
  }

  /**
   * Create new template version
   */
  public async createTemplateVersion(
    existingTemplateId: string,
    changes: Partial<IntakeFormTemplate>
  ): Promise<IntakeFormTemplate> {
    const existing = await prisma.intakeFormTemplate.findUnique({
      where: { id: existingTemplateId },
    });

    if (!existing) {
      throw new NotFoundError('Template not found');
    }

    // Create new version
    const newVersion = await prisma.intakeFormTemplate.create({
      data: {
        ...existing,
        ...changes,
        id: undefined, // Generate new ID
        version: existing.version + 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    // Deactivate old version (optional)
    await prisma.intakeFormTemplate.update({
      where: { id: existingTemplateId },
      data: { isActive: false },
    });

    return newVersion;
  }
}

export const templateManager = new TemplateManager();
```

### 7.2 Plugin System for Custom Validators

```typescript
// src/intake/plugins/validator-plugin.ts

export interface ValidatorPlugin {
  name: string;
  description: string;
  validator: (value: any, config: any, formData: Record<string, any>) => Promise<ValidationResult> | ValidationResult;
}

export class ValidatorPluginRegistry {
  private plugins: Map<string, ValidatorPlugin> = new Map();

  /**
   * Register a custom validator plugin
   */
  public register(plugin: ValidatorPlugin): void {
    this.plugins.set(plugin.name, plugin);
    logger.info(`Registered validator plugin: ${plugin.name}`);
  }

  /**
   * Get validator plugin by name
   */
  public get(name: string): ValidatorPlugin | null {
    return this.plugins.get(name) || null;
  }

  /**
   * Execute validator plugin
   */
  public async execute(
    name: string,
    value: any,
    config: any,
    formData: Record<string, any>
  ): Promise<ValidationResult> {
    const plugin = this.get(name);

    if (!plugin) {
      throw new Error(`Validator plugin ${name} not found`);
    }

    return await plugin.validator(value, config, formData);
  }
}

export const validatorPluginRegistry = new ValidatorPluginRegistry();

// Example: Register custom validators

// Canadian Business Number Validator
validatorPluginRegistry.register({
  name: 'canadianBusinessNumber',
  description: 'Validates Canadian Business Number (9 digits)',
  validator: (value: string) => {
    const cleaned = value.replace(/\D/g, '');
    if (cleaned.length !== 9) {
      return {
        isValid: false,
        errors: ['Canadian Business Number must be 9 digits'],
      };
    }
    return { isValid: true, errors: [] };
  },
});

// Age Verification Validator
validatorPluginRegistry.register({
  name: 'minimumAge',
  description: 'Validates minimum age requirement',
  validator: (value: string, config: { minimumAge: number }) => {
    const birthDate = new Date(value);
    const age = Math.floor((Date.now() - birthDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));

    if (age < config.minimumAge) {
      return {
        isValid: false,
        errors: [`You must be at least ${config.minimumAge} years old`],
      };
    }

    return { isValid: true, errors: [] };
  },
});

// Async Email Domain Validator
validatorPluginRegistry.register({
  name: 'emailDomainWhitelist',
  description: 'Validates email against allowed domains',
  validator: async (value: string, config: { allowedDomains: string[] }) => {
    const domain = value.split('@')[1]?.toLowerCase();

    if (!domain || !config.allowedDomains.includes(domain)) {
      return {
        isValid: false,
        errors: [`Email must be from one of: ${config.allowedDomains.join(', ')}`],
      };
    }

    return { isValid: true, errors: [] };
  },
});

// Custom Field Cross-Validation
validatorPluginRegistry.register({
  name: 'fieldComparison',
  description: 'Compare two field values',
  validator: (value: any, config: { compareField: string; operator: string }, formData: Record<string, any>) => {
    const compareValue = formData[config.compareField];

    switch (config.operator) {
      case 'equals':
        if (value !== compareValue) {
          return { isValid: false, errors: ['Fields must match'] };
        }
        break;
      case 'greater_than':
        if (Number(value) <= Number(compareValue)) {
          return { isValid: false, errors: [`Value must be greater than ${config.compareField}`] };
        }
        break;
      // ... other operators
    }

    return { isValid: true, errors: [] };
  },
});
```

### 7.3 Action Plugin System

```typescript
// src/intake/plugins/action-plugin.ts

export interface ActionPlugin {
  name: string;
  description: string;
  execute: (context: ActionContext) => Promise<ActionResult>;
}

export interface ActionContext {
  session: IntakeSession;
  formData: Record<string, any>;
  config: any;
  organizationId: string;
}

export interface ActionResult {
  success: boolean;
  message?: string;
  data?: any;
  error?: string;
}

export class ActionPluginRegistry {
  private plugins: Map<string, ActionPlugin> = new Map();

  public register(plugin: ActionPlugin): void {
    this.plugins.set(plugin.name, plugin);
    logger.info(`Registered action plugin: ${plugin.name}`);
  }

  public get(name: string): ActionPlugin | null {
    return this.plugins.get(name) || null;
  }

  public async execute(
    name: string,
    context: ActionContext
  ): Promise<ActionResult> {
    const plugin = this.get(name);

    if (!plugin) {
      throw new Error(`Action plugin ${name} not found`);
    }

    return await plugin.execute(context);
  }
}

export const actionPluginRegistry = new ActionPluginRegistry();

// Example: Register custom actions

// Webhook Action
actionPluginRegistry.register({
  name: 'webhook',
  description: 'Send webhook to external URL',
  execute: async (context: ActionContext): Promise<ActionResult> => {
    const { url, method, headers, includeSessionId } = context.config;

    const payload = {
      ...(includeSessionId && { sessionId: context.session.id }),
      formData: context.formData,
      timestamp: new Date().toISOString(),
    };

    try {
      const response = await fetch(url, {
        method: method || 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify(payload),
      });

      return {
        success: response.ok,
        message: `Webhook sent to ${url}`,
        data: { status: response.status },
      };
    } catch (error) {
      return {
        success: false,
        error: `Webhook failed: ${error.message}`,
      };
    }
  },
});

// Slack Notification Action
actionPluginRegistry.register({
  name: 'slackNotification',
  description: 'Send notification to Slack channel',
  execute: async (context: ActionContext): Promise<ActionResult> => {
    const { webhookUrl, channel, message } = context.config;

    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel,
          text: message,
          attachments: [
            {
              title: 'Form Submission',
              fields: Object.entries(context.formData).map(([key, value]) => ({
                title: key,
                value: String(value),
                short: true,
              })),
            },
          ],
        }),
      });

      return {
        success: true,
        message: 'Slack notification sent',
      };
    } catch (error) {
      return {
        success: false,
        error: `Slack notification failed: ${error.message}`,
      };
    }
  },
});

// CRM Integration Action
actionPluginRegistry.register({
  name: 'crmLead',
  description: 'Create lead in CRM (HubSpot, Salesforce, etc.)',
  execute: async (context: ActionContext): Promise<ActionResult> => {
    const { crmType, apiKey, endpoint, fieldMapping } = context.config;

    // Map form fields to CRM fields
    const crmData: Record<string, any> = {};
    for (const [formField, crmField] of Object.entries(fieldMapping)) {
      crmData[crmField] = context.formData[formField];
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(crmData),
      });

      const result = await response.json();

      return {
        success: response.ok,
        message: `Lead created in ${crmType}`,
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        error: `CRM integration failed: ${error.message}`,
      };
    }
  },
});
```

---

## 8. API Design Changes

### 8.1 Admin API for Template Management

```typescript
// New Admin API Endpoints

/**
 * POST /api/v1/organizations/:orgId/intake/templates
 * Create new intake form template
 */
router.post('/templates', async (req, res) => {
  const { orgId } = req.params;
  const { name, slug, description, category, config, steps, fields, actions } = req.body;

  const template = await templateService.createTemplate({
    organizationId: orgId,
    name,
    slug,
    description,
    category,
    config: JSON.stringify(config),
    steps,
    fields,
    actions,
  });

  res.status(201).json({ success: true, template });
});

/**
 * GET /api/v1/organizations/:orgId/intake/templates
 * List all templates for organization
 */
router.get('/templates', async (req, res) => {
  const { orgId } = req.params;

  const templates = await templateService.listTemplates(orgId, {
    includeSystem: true,
    includeInactive: false,
  });

  res.json({ success: true, templates });
});

/**
 * GET /api/v1/organizations/:orgId/intake/templates/:templateId
 * Get template details with fields and steps
 */
router.get('/templates/:templateId', async (req, res) => {
  const { templateId } = req.params;

  const template = await templateService.getTemplate(templateId, {
    includeSteps: true,
    includeFields: true,
    includeActions: true,
  });

  res.json({ success: true, template });
});

/**
 * PUT /api/v1/organizations/:orgId/intake/templates/:templateId
 * Update template (creates new version)
 */
router.put('/templates/:templateId', async (req, res) => {
  const { templateId } = req.params;
  const updates = req.body;

  const newVersion = await templateService.updateTemplate(templateId, updates);

  res.json({ success: true, template: newVersion });
});

/**
 * POST /api/v1/organizations/:orgId/intake/templates/:templateId/clone
 * Clone system template for customization
 */
router.post('/templates/:templateId/clone', async (req, res) => {
  const { orgId } = req.params;
  const { templateId } = req.params;
  const { customizations } = req.body;

  const clonedTemplate = await templateManager.cloneTemplateForOrganization(
    templateId,
    orgId,
    customizations
  );

  res.status(201).json({ success: true, template: clonedTemplate });
});

/**
 * GET /api/v1/intake/templates/marketplace
 * Get system template marketplace
 */
router.get('/templates/marketplace', async (req, res) => {
  const systemTemplates = await templateService.listSystemTemplates({
    category: req.query.category,
  });

  res.json({ success: true, templates: systemTemplates });
});
```

### 8.2 Updated Public API

```typescript
// Enhanced Public API Endpoints

/**
 * POST /api/v1/public/intake/initialize
 * Initialize session with template selection
 */
router.post('/initialize', async (req, res) => {
  const { email, fingerprint, templateSlug, organizationId } = req.body;

  // Get template for organization
  const template = await templateManager.getOrganizationTemplate(
    organizationId,
    templateSlug || 'default-customer-quote'
  );

  // Create session
  const { token, session } = await intakeTokenService.createSession({
    email,
    fingerprint,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
    origin: req.headers['origin'],
    templateId: template.id,
    templateVersion: template.version,
  });

  // Get first step
  const firstStep = await workflowEngine.getFirstStep(template.id);

  res.status(201).json({
    success: true,
    token,
    sessionId: session.id,
    expiresAt: session.expiresAt,
    currentStep: firstStep,
    templateInfo: {
      name: template.name,
      description: template.description,
      totalSteps: template.steps.length,
    },
  });
});

/**
 * POST /api/v1/public/intake/step
 * Update step with dynamic field handling
 */
router.post('/step', intakeTokenMiddleware, async (req, res) => {
  const session = req.intakeSession!;
  const { stepKey, fieldData, action } = req.body; // action: 'next' | 'back' | 'save'

  // Get template and current step
  const template = await templateService.getTemplate(session.templateId);
  const step = await workflowEngine.getStep(template.id, stepKey);

  // Validate step data
  const validation = await workflowEngine.validateStep(stepKey, fieldData, template);

  if (!validation.isValid && action === 'next') {
    return res.status(400).json({
      success: false,
      errors: validation.errors,
    });
  }

  // Save field data
  await sessionDataService.saveFieldData(session.id, stepKey, fieldData);

  // Determine next step
  let nextStepKey: string | null = null;
  if (action === 'next') {
    const allFormData = await sessionDataService.getFormData(session.id);
    nextStepKey = await workflowEngine.resolveNextStep(session, stepKey, allFormData);
  } else if (action === 'back') {
    nextStepKey = step.prevStepKey;
  }

  // Update session
  await sessionService.updateStep(session.id, stepKey, nextStepKey);

  // Calculate progress
  const completedSteps = await sessionService.getCompletedSteps(session.id);
  const progress = workflowEngine.calculateProgress(template, completedSteps);

  res.json({
    success: true,
    currentStep: stepKey,
    nextStep: nextStepKey ? await workflowEngine.getStep(template.id, nextStepKey) : null,
    progress,
    validation,
  });
});

/**
 * GET /api/v1/public/intake/template-info
 * Get current template configuration
 */
router.get('/template-info', intakeTokenMiddleware, async (req, res) => {
  const session = req.intakeSession!;

  const template = await templateService.getTemplate(session.templateId, {
    includeSteps: true,
    includeFields: false, // Don't expose all fields at once
  });

  res.json({
    success: true,
    template: {
      name: template.name,
      description: template.description,
      totalSteps: template.steps.length,
      steps: template.steps.map(s => ({
        stepKey: s.stepKey,
        stepName: s.stepName,
        stepNumber: s.stepNumber,
      })),
    },
  });
});
```

### 8.3 API Versioning Strategy

```typescript
// Version routing

/**
 * V1 API (Current - Legacy Support)
 * /api/v1/public/intake/*
 * - Supports old hardcoded workflows
 * - Backwards compatible
 * - Will be deprecated in future
 */

/**
 * V2 API (New - Dynamic Templates)
 * /api/v2/public/intake/*
 * - Full template support
 * - Conditional logic
 * - Plugin system
 * - Recommended for new implementations
 */

// Example V1 to V2 migration
app.use('/api/v1/public/intake', legacyIntakeRoutes);
app.use('/api/v2/public/intake', dynamicIntakeRoutes);

// V1 routes internally map to V2 with default template
legacyIntakeRoutes.use((req, res, next) => {
  // Inject default template slug
  req.body.templateSlug = 'legacy-customer-quote-v1';
  next();
});
```

---

## 9. Migration Strategy

### 9.1 Phased Migration Plan

#### **Phase 1: Database Schema Migration (Week 1-2)**
1. Create new tables without dropping old ones
2. Seed system templates matching current workflows
3. Run database migrations
4. Verify data integrity

```bash
# Migration script
npm run prisma:migrate -- --name add_dynamic_intake_tables
```

#### **Phase 2: Service Layer Implementation (Week 3-4)**
1. Implement `WorkflowEngine` service
2. Implement `DynamicValidationEngine` service
3. Implement `TemplateManager` service
4. Implement `SessionDataService` for EAV pattern
5. Write unit tests for all services

#### **Phase 3: API Layer Updates (Week 5-6)**
1. Create V2 API endpoints
2. Keep V1 endpoints for backwards compatibility
3. Implement template admin API
4. Update API documentation

#### **Phase 4: Data Migration (Week 7)**
1. Migrate existing IntakeCustomerData/QuoteData to IntakeFormData
2. Create default templates for existing workflows
3. Update active sessions to reference templates
4. Verify no data loss

```typescript
// Migration script example
async function migrateExistingSessions() {
  const sessions = await prisma.intakeSession.findMany({
    where: { templateId: null },
    include: { customerData: true, quoteData: true },
  });

  const defaultTemplate = await prisma.intakeFormTemplate.findFirst({
    where: { slug: 'legacy-customer-quote-v1' },
  });

  for (const session of sessions) {
    // Map old data to new EAV format
    if (session.customerData) {
      await migrateCustomerData(session.id, session.customerData, defaultTemplate!.id);
    }
    if (session.quoteData) {
      await migrateQuoteData(session.id, session.quoteData, defaultTemplate!.id);
    }

    // Update session to reference template
    await prisma.intakeSession.update({
      where: { id: session.id },
      data: {
        templateId: defaultTemplate!.id,
        templateVersion: defaultTemplate!.version,
      },
    });
  }
}
```

#### **Phase 5: Testing & Validation (Week 8)**
1. Integration tests for all workflows
2. Load testing for performance
3. Security testing for new endpoints
4. User acceptance testing

#### **Phase 6: Gradual Rollout (Week 9-10)**
1. Deploy to staging environment
2. Enable V2 API for pilot organizations
3. Monitor performance and errors
4. Collect feedback
5. Iterate on improvements

#### **Phase 7: Full Production Deployment (Week 11-12)**
1. Deploy to production
2. Announce V2 API availability
3. Provide migration guide for existing integrations
4. Deprecation timeline for V1 API (12 months)

### 9.2 Backwards Compatibility Guarantee

```typescript
// Legacy compatibility layer

export class LegacyIntakeAdapter {
  /**
   * Convert V1 intake request to V2 format
   */
  public adaptV1Request(v1Request: any): V2IntakeRequest {
    return {
      templateSlug: 'legacy-customer-quote-v1',
      stepKey: this.mapV1StepToV2(v1Request.step),
      fieldData: this.mapV1DataToV2(v1Request.customerData, v1Request.quoteData),
      action: 'next',
    };
  }

  /**
   * Convert V2 response to V1 format
   */
  public adaptV2Response(v2Response: any): V1IntakeResponse {
    return {
      success: v2Response.success,
      currentStep: this.mapV2StepToV1(v2Response.currentStep),
      nextStep: this.mapV2StepToV1(v2Response.nextStep),
      completionPercentage: v2Response.progress,
      // ... other V1 fields
    };
  }

  private mapV1StepToV2(v1Step: string): string {
    const stepMap: Record<string, string> = {
      'EMAIL_CAPTURE': 'email_capture',
      'PROFILE_TYPE': 'profile_type',
      'PROFILE_DETAILS': 'profile_details',
      'SERVICE_CATEGORY': 'service_category',
      'SERVICE_DETAILS': 'service_details',
      'ADDITIONAL_INFO': 'additional_info',
      'REVIEW': 'review',
      'SUBMIT': 'submit',
    };
    return stepMap[v1Step] || v1Step.toLowerCase();
  }
}
```

---

## 10. Code Examples

### 10.1 Creating a Custom Form Template

```typescript
// Admin creating a new job application template

import { templateService } from '@/intake/services/template.service';

async function createJobApplicationTemplate(organizationId: string) {
  const template = await templateService.createTemplate({
    organizationId,
    name: 'Job Application',
    slug: 'job-application',
    description: 'Collect job applications with resume upload',
    category: 'HR',
    config: {
      metadata: {
        name: 'Job Application',
        description: 'Collect job applications',
        category: 'HR',
        version: 1,
      },
      settings: {
        allowBack: true,
        allowSave: true,
        autoSave: true,
        autoSaveInterval: 60,
        showProgress: true,
        progressStyle: 'bar',
        requireCaptcha: false,
        sessionTimeout: 48,
        stepTimeout: 30,
        theme: 'default',
        customCss: null,
        showLogo: true,
      },
      completion: {
        successMessage: 'Thank you for applying! We will review your application.',
        redirectUrl: '/careers/thank-you',
        showConfirmation: true,
        createEntities: [
          {
            entityType: 'CUSTOM',
            entityName: 'Applicant',
            fieldMapping: {
              'firstName': 'firstName',
              'lastName': 'lastName',
              'email': 'email',
              'phone': 'phone',
              'resume': 'resumeUrl',
              'yearsExperience': 'experience',
            },
          },
        ],
        sendEmailToUser: true,
        sendEmailToAdmin: true,
        emailTemplates: {
          userConfirmation: 'job-application-confirmation',
          adminNotification: 'new-job-application',
        },
      },
    },
    steps: [
      {
        stepKey: 'basic_info',
        stepName: 'Basic Information',
        stepNumber: 1,
        nextStepKey: 'experience',
        prevStepKey: null,
        isRequired: true,
        isSkippable: false,
        progressWeight: 1,
      },
      {
        stepKey: 'experience',
        stepName: 'Experience',
        stepNumber: 2,
        nextStepKey: 'resume',
        prevStepKey: 'basic_info',
        isRequired: true,
        isSkippable: false,
        progressWeight: 1,
      },
      {
        stepKey: 'resume',
        stepName: 'Resume & Cover Letter',
        stepNumber: 3,
        nextStepKey: 'review',
        prevStepKey: 'experience',
        isRequired: true,
        isSkippable: false,
        progressWeight: 2, // Weighted more heavily
      },
      {
        stepKey: 'review',
        stepName: 'Review & Submit',
        stepNumber: 4,
        nextStepKey: null,
        prevStepKey: 'resume',
        isRequired: true,
        isSkippable: false,
        progressWeight: 1,
      },
    ],
    fields: [
      // Basic Info Step Fields
      {
        stepKey: 'basic_info',
        fieldKey: 'firstName',
        fieldName: 'First Name',
        fieldType: 'TEXT',
        isRequired: true,
        displayOrder: 1,
        width: 'half',
        config: JSON.stringify({ placeholder: 'John', maxLength: 50 }),
        validationRules: JSON.stringify([
          { type: 'required', message: 'First name is required' },
          { type: 'minLength', value: 2, message: 'Minimum 2 characters' },
        ]),
        dataPath: 'applicant.firstName',
        entityMapping: 'Applicant.firstName',
      },
      {
        stepKey: 'basic_info',
        fieldKey: 'lastName',
        fieldName: 'Last Name',
        fieldType: 'TEXT',
        isRequired: true,
        displayOrder: 2,
        width: 'half',
        config: JSON.stringify({ placeholder: 'Doe', maxLength: 50 }),
        validationRules: JSON.stringify([
          { type: 'required', message: 'Last name is required' },
        ]),
        dataPath: 'applicant.lastName',
        entityMapping: 'Applicant.lastName',
      },
      {
        stepKey: 'basic_info',
        fieldKey: 'email',
        fieldName: 'Email Address',
        fieldType: 'EMAIL',
        isRequired: true,
        displayOrder: 3,
        width: 'full',
        config: JSON.stringify({ placeholder: 'john.doe@example.com' }),
        validationRules: JSON.stringify([
          { type: 'required', message: 'Email is required' },
          { type: 'email', message: 'Invalid email format' },
          { type: 'custom', plugin: 'emailDomainWhitelist', config: { allowedDomains: ['company.com'] } },
        ]),
        dataPath: 'applicant.email',
        entityMapping: 'Applicant.email',
      },
      {
        stepKey: 'basic_info',
        fieldKey: 'phone',
        fieldName: 'Phone Number',
        fieldType: 'PHONE',
        isRequired: true,
        displayOrder: 4,
        width: 'full',
        config: JSON.stringify({ format: 'NANP' }),
        validationRules: JSON.stringify([
          { type: 'required', message: 'Phone is required' },
        ]),
        dataPath: 'applicant.phone',
        entityMapping: 'Applicant.phone',
      },

      // Experience Step Fields
      {
        stepKey: 'experience',
        fieldKey: 'yearsExperience',
        fieldName: 'Years of Relevant Experience',
        fieldType: 'NUMBER',
        isRequired: true,
        displayOrder: 1,
        width: 'full',
        config: JSON.stringify({ min: 0, max: 50, step: 1 }),
        validationRules: JSON.stringify([
          { type: 'required', message: 'Experience is required' },
          { type: 'min', value: 0, message: 'Cannot be negative' },
        ]),
        dataPath: 'applicant.experience',
        entityMapping: 'Applicant.experience',
      },
      {
        stepKey: 'experience',
        fieldKey: 'skills',
        fieldName: 'Technical Skills',
        fieldType: 'MULTISELECT',
        isRequired: true,
        displayOrder: 2,
        width: 'full',
        config: JSON.stringify({
          options: ['JavaScript', 'TypeScript', 'React', 'Node.js', 'Python', 'Go', 'Docker', 'Kubernetes'],
          minSelections: 1,
          maxSelections: 10,
        }),
        validationRules: JSON.stringify([
          { type: 'required', message: 'Select at least one skill' },
        ]),
        dataPath: 'applicant.skills',
        entityMapping: 'Applicant.skills',
      },

      // Resume Step Fields
      {
        stepKey: 'resume',
        fieldKey: 'resume',
        fieldName: 'Upload Resume',
        fieldType: 'FILE',
        isRequired: true,
        displayOrder: 1,
        width: 'full',
        config: JSON.stringify({
          maxFileSize: 5242880, // 5MB
          allowedExtensions: ['.pdf', '.doc', '.docx'],
          maxFiles: 1,
        }),
        validationRules: JSON.stringify([
          { type: 'required', message: 'Resume is required' },
          { type: 'fileSize', value: 5242880, message: 'File must be under 5MB' },
        ]),
        dataPath: 'applicant.resume',
        entityMapping: 'Applicant.resumeUrl',
      },
      {
        stepKey: 'resume',
        fieldKey: 'coverLetter',
        fieldName: 'Cover Letter (Optional)',
        fieldType: 'TEXTAREA',
        isRequired: false,
        displayOrder: 2,
        width: 'full',
        config: JSON.stringify({
          rows: 6,
          maxLength: 2000,
          placeholder: 'Tell us why you\'re a great fit for this position...',
        }),
        validationRules: JSON.stringify([
          { type: 'maxLength', value: 2000, message: 'Maximum 2000 characters' },
        ]),
        dataPath: 'applicant.coverLetter',
        entityMapping: 'Applicant.coverLetter',
      },
    ],
    actions: [
      {
        actionType: 'SEND_EMAIL',
        actionConfig: JSON.stringify({
          templateSlug: 'job-application-confirmation',
          recipientField: 'email',
        }),
        triggerEvent: 'ON_SUBMIT',
        executionOrder: 1,
        isAsync: false,
        retryOnFailure: true,
        maxRetries: 3,
      },
      {
        actionType: 'WEBHOOK',
        actionConfig: JSON.stringify({
          url: 'https://applicant-tracking.com/api/candidates',
          method: 'POST',
          headers: { 'X-API-Key': 'secret-key' },
        }),
        triggerEvent: 'ON_SUBMIT',
        executionOrder: 2,
        isAsync: true,
        retryOnFailure: true,
        maxRetries: 5,
      },
    ],
  });

  return template;
}
```

### 10.2 Using Conditional Logic

```typescript
// Example: HVAC form with conditional routing

const hvacServiceForm = {
  steps: [
    {
      stepKey: 'service_type',
      stepName: 'Service Type',
      stepNumber: 1,
      nextStepKey: null, // Determined dynamically
      conditionalRouting: {
        rules: [
          {
            condition: {
              operator: 'AND',
              conditions: [
                { field: 'serviceType', operator: 'equals', value: 'EMERGENCY' }
              ]
            },
            nextStepKey: 'emergency_details',
            action: 'jump'
          },
          {
            condition: {
              operator: 'AND',
              conditions: [
                { field: 'serviceType', operator: 'equals', value: 'INSTALLATION' }
              ]
            },
            nextStepKey: 'installation_details',
            action: 'jump'
          },
          {
            condition: {
              operator: 'AND',
              conditions: [
                { field: 'serviceType', operator: 'equals', value: 'MAINTENANCE' }
              ]
            },
            nextStepKey: 'maintenance_schedule',
            action: 'jump'
          }
        ],
        defaultNextStep: 'standard_details'
      },
      fields: [
        {
          fieldKey: 'serviceType',
          fieldName: 'What type of service do you need?',
          fieldType: 'RADIO',
          isRequired: true,
          config: JSON.stringify({
            options: ['EMERGENCY', 'INSTALLATION', 'REPAIR', 'MAINTENANCE'],
            layout: 'vertical'
          })
        }
      ]
    },

    // Emergency path
    {
      stepKey: 'emergency_details',
      stepName: 'Emergency Details',
      stepNumber: 2,
      nextStepKey: 'contact_info',
      fields: [
        {
          fieldKey: 'emergencyDescription',
          fieldName: 'Describe the emergency',
          fieldType: 'TEXTAREA',
          isRequired: true,
          config: JSON.stringify({
            placeholder: 'No heating, water leaking, etc.',
            maxLength: 500
          })
        },
        {
          fieldKey: 'callImmediately',
          fieldName: 'Should we call you immediately?',
          fieldType: 'CHECKBOX',
          isRequired: false,
          config: JSON.stringify({
            label: 'Yes, call me ASAP'
          })
        }
      ]
    },

    // Installation path
    {
      stepKey: 'installation_details',
      stepName: 'Installation Details',
      stepNumber: 2,
      nextStepKey: 'property_info',
      fields: [
        {
          fieldKey: 'systemType',
          fieldName: 'What system are you installing?',
          fieldType: 'SELECT',
          isRequired: true,
          config: JSON.stringify({
            options: ['Central Air', 'Heat Pump', 'Furnace', 'Ductless Mini-Split']
          })
        },
        {
          fieldKey: 'propertySize',
          fieldName: 'Property Size (sq ft)',
          fieldType: 'NUMBER',
          isRequired: true,
          config: JSON.stringify({
            min: 100,
            max: 50000,
            placeholder: '2000'
          })
        }
      ]
    }
  ]
};
```

### 10.3 Implementing Custom Validation

```typescript
// Custom validator for Canadian postal codes with geocoding

import { validatorPluginRegistry } from '@/intake/plugins/validator-plugin';

validatorPluginRegistry.register({
  name: 'canadianPostalCodeWithGeocoding',
  description: 'Validates Canadian postal code and geocodes it',
  validator: async (value: string, config: { allowedProvinces?: string[] }) => {
    // Basic format validation
    const postalCodeRegex = /^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/i;
    if (!postalCodeRegex.test(value)) {
      return {
        isValid: false,
        errors: ['Invalid Canadian postal code format (e.g., A1A 1A1)'],
      };
    }

    // Geocode the postal code
    try {
      const geocodeResponse = await fetch(
        `https://geocoder.ca/?postal=${encodeURIComponent(value)}&geoit=XML&json=1`
      );
      const geocodeData = await geocodeResponse.json();

      if (!geocodeData || geocodeData.error) {
        return {
          isValid: false,
          errors: ['Postal code not found'],
        };
      }

      // Check if in allowed provinces
      if (config.allowedProvinces && !config.allowedProvinces.includes(geocodeData.province)) {
        return {
          isValid: false,
          errors: [`Service not available in ${geocodeData.province}. We only serve: ${config.allowedProvinces.join(', ')}`],
        };
      }

      return {
        isValid: true,
        errors: [],
        data: {
          province: geocodeData.province,
          city: geocodeData.city,
          latitude: geocodeData.latt,
          longitude: geocodeData.longt,
        },
      };
    } catch (error) {
      // Fallback to basic validation if geocoding fails
      return {
        isValid: true,
        errors: [],
        warnings: ['Could not verify postal code location'],
      };
    }
  },
});

// Usage in form field
const postalCodeField = {
  fieldKey: 'postalCode',
  fieldName: 'Postal Code',
  fieldType: 'TEXT',
  isRequired: true,
  validationRules: JSON.stringify([
    { type: 'required', message: 'Postal code is required' },
    {
      type: 'custom',
      plugin: 'canadianPostalCodeWithGeocoding',
      config: {
        allowedProvinces: ['ON', 'QC', 'BC'] // Only serve these provinces
      }
    }
  ])
};
```

---

## 11. Implementation Roadmap

### Phase 1: Foundation (Weeks 1-2)
- [ ] Design and create new database tables
- [ ] Implement base services (TemplateService, WorkflowEngine)
- [ ] Create field type registry
- [ ] Write comprehensive unit tests
- [ ] Document API contracts

**Deliverable:** Working database schema + core services

### Phase 2: Dynamic Validation (Weeks 3-4)
- [ ] Implement DynamicValidationEngine
- [ ] Create validator plugin system
- [ ] Implement conditional logic engine
- [ ] Add cross-field validation support
- [ ] Write validation tests

**Deliverable:** Full validation system with plugin support

### Phase 3: Template System (Weeks 5-6)
- [ ] Implement TemplateManager
- [ ] Create system template library (10+ templates)
- [ ] Build template versioning system
- [ ] Implement template cloning
- [ ] Add template marketplace API

**Deliverable:** Template management system + marketplace

### Phase 4: Data Storage (Weeks 7-8)
- [ ] Implement EAV pattern for IntakeFormData
- [ ] Create SessionDataService
- [ ] Migrate old data to new format
- [ ] Add data export functionality
- [ ] Implement GDPR compliance features

**Deliverable:** Flexible data storage system

### Phase 5: Workflow Engine (Weeks 9-10)
- [ ] Implement conditional routing
- [ ] Add step skipping logic
- [ ] Create progress calculation system
- [ ] Build step validation pipeline
- [ ] Add workflow testing tools

**Deliverable:** Full workflow engine

### Phase 6: API Development (Weeks 11-12)
- [ ] Create V2 public API endpoints
- [ ] Build admin template management API
- [ ] Implement backwards compatibility layer
- [ ] Add API documentation (OpenAPI spec)
- [ ] Create Postman collection

**Deliverable:** Complete API with v1 compatibility

### Phase 7: Action System (Weeks 13-14)
- [ ] Implement action plugin registry
- [ ] Create built-in actions (email, webhook, CRM)
- [ ] Add action execution tracking
- [ ] Implement retry logic
- [ ] Build action debugging tools

**Deliverable:** Extensible action system

### Phase 8: Testing (Weeks 15-16)
- [ ] Integration tests for all workflows
- [ ] Load testing (1000+ concurrent sessions)
- [ ] Security audit
- [ ] Penetration testing
- [ ] User acceptance testing

**Deliverable:** Production-ready system

### Phase 9: Documentation (Week 17)
- [ ] Admin user guide
- [ ] Template creation tutorial
- [ ] API integration guide
- [ ] Migration guide for V1 users
- [ ] Video tutorials

**Deliverable:** Complete documentation

### Phase 10: Deployment (Week 18)
- [ ] Staging deployment
- [ ] Production deployment
- [ ] Monitoring setup
- [ ] Rollback procedures
- [ ] Launch announcement

**Deliverable:** Live production system

---

## Conclusion

This design transforms the current fixed intake workflow into a **flexible, extensible platform** that can support:

✅ **Unlimited use cases** - Not just customer quotes, but job applications, surveys, registrations, etc.
✅ **Organization-specific customization** - Each org can have custom forms
✅ **Dynamic workflows** - Conditional routing, step skipping, multi-path flows
✅ **Extensibility** - Plugin system for custom validators and actions
✅ **Backwards compatibility** - Existing workflows continue to work
✅ **Future-proof** - Easy to add new field types and features

### Key Success Metrics

1. **Adoption:** 80% of new intake forms use custom templates within 6 months
2. **Performance:** <200ms p95 latency for step updates
3. **Reliability:** 99.9% uptime for intake API
4. **Flexibility:** Support 20+ different intake use cases
5. **Developer Experience:** Template creation time <1 hour

### Next Steps

1. **Review & Approve** - Stakeholder review of this design
2. **Resource Allocation** - Assign team members to implementation phases
3. **Timeline Agreement** - Confirm 18-week timeline or adjust
4. **Kick-off** - Begin Phase 1 implementation

---

**Document End**
