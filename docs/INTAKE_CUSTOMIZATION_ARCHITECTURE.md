# Intake System Customization Architecture

## Executive Summary

This document outlines the architecture for transforming the current rigid intake system into a flexible, multi-tenant customizable platform that supports unlimited use cases while maintaining existing security measures.

## Problem Statement

The current intake system has critical limitations:

### Current Limitations
1. **Fixed Workflow** - 8 hardcoded steps, linear only, no branching
2. **Static Fields** - Zod schemas in code, can't add organization-specific fields
3. **Single Use Case** - Only Customer + Quote creation
4. **No Customization** - All organizations share identical workflow
5. **Code Deployment Required** - Any change requires deployment
6. **No Plugin System** - Cannot extend without modifying core code

### Business Impact
- Cannot support different industries (manufacturing, healthcare, legal)
- Cannot A/B test different intake flows
- Cannot add fields without development
- Organizations cannot customize their intake experience
- Limited to service industry use cases

## Solution Architecture

### Overview

Transform from **rigid, single-configuration system** to **flexible, template-based platform**.

```
┌─────────────────────────────────────────────────────────────┐
│                    Enhanced Intake System                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────┐  ┌──────────────────┐               │
│  │  Form Templates  │  │ Workflow Engine  │               │
│  │  - Reusable      │  │ - Conditional    │               │
│  │  - Versioned     │  │ - Dynamic routes │               │
│  │  - Marketplace   │  │ - Multi-path     │               │
│  └──────────────────┘  └──────────────────┘               │
│                                                             │
│  ┌──────────────────┐  ┌──────────────────┐               │
│  │  Field Registry  │  │ Validation Engine│               │
│  │  - 20+ types     │  │ - Runtime schemas│               │
│  │  - Custom types  │  │ - Custom rules   │               │
│  │  - Conditional   │  │ - Plugin system  │               │
│  └──────────────────┘  └──────────────────┘               │
│                                                             │
│  ┌──────────────────┐  ┌──────────────────┐               │
│  │  Action Pipeline │  │ Conversion Plugins│              │
│  │  - Webhooks      │  │ - Customer       │               │
│  │  - CRM integrate │  │ - Lead           │               │
│  │  - Notifications │  │ - Custom entities│               │
│  └──────────────────┘  └──────────────────┘               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Database Schema

#### New Tables

```prisma
// Form template definitions (reusable configurations)
model IntakeFormTemplate {
  id                String   @id @default(cuid())
  organizationId    String?  // null = global/marketplace template

  // Template metadata
  name              String
  description       String?
  category          String   // CUSTOMER_QUOTE, JOB_APPLICATION, EVENT_REGISTRATION, etc.
  version           Int      @default(1)
  isActive          Boolean  @default(true)
  isPublic          Boolean  @default(false) // Available in marketplace

  // Template configuration
  steps             Json     // Array of step definitions
  fields            Json     // Array of field definitions
  actions           Json     // Array of action definitions
  settings          Json     // Completion thresholds, validation rules, etc.

  // Usage tracking
  usageCount        Int      @default(0)

  // Timestamps
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  // Relations
  sessions          IntakeSession[]

  @@map("intake_form_templates")
  @@index([organizationId])
  @@index([category])
  @@index([isActive, isPublic])
}

// Dynamic form data storage (EAV pattern for flexibility)
model IntakeFormData {
  id                String   @id @default(cuid())
  sessionId         String

  // Field identification
  fieldName         String
  fieldType         String   // text, email, number, select, file, etc.

  // Polymorphic value storage
  valueText         String?  @db.Text
  valueNumber       Decimal? @db.Decimal(19, 4)
  valueBoolean      Boolean?
  valueDate         DateTime?
  valueJson         Json?    // For complex values (arrays, objects)

  // Metadata
  stepId            String   // Which step this data belongs to
  isEncrypted       Boolean  @default(false)

  // Timestamps
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  // Relations
  session           IntakeSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@map("intake_form_data")
  @@unique([sessionId, fieldName]) // One value per field per session
  @@index([sessionId])
  @@index([stepId])
}

// Workflow step definitions
model IntakeFormStep {
  id                String   @id @default(cuid())
  templateId        String

  // Step identity
  stepId            String   // Unique identifier within template
  name              String
  displayName       String
  description       String?

  // Step configuration
  required          Boolean  @default(true)
  order             Int

  // Conditional display
  showIf            Json?    // Conditions for showing this step

  // Step completion
  completionWeight  Int      @default(10) // Weight in overall completion %

  // Timestamps
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  // Relations
  template          IntakeFormTemplate @relation(fields: [templateId], references: [id], onDelete: Cascade)
  fields            IntakeFormField[]
  transitionsFrom   IntakeFormTransition[] @relation("FromStep")
  transitionsTo     IntakeFormTransition[] @relation("ToStep")

  @@map("intake_form_steps")
  @@unique([templateId, stepId])
  @@index([templateId])
  @@index([order])
}

// Field definitions
model IntakeFormField {
  id                String   @id @default(cuid())
  stepId            String

  // Field identity
  fieldName         String   // Unique within step
  displayLabel      String
  description       String?

  // Field type and configuration
  fieldType         String   // text, email, phone, select, multiselect, file, signature, etc.
  options           Json?    // For select/radio/checkbox fields
  validationRules   Json     // min, max, pattern, required, custom validators

  // Field behavior
  required          Boolean  @default(false)
  requireIf         Json?    // Conditional requirement
  showIf            Json?    // Conditional visibility
  defaultValue      String?
  placeholder       String?
  helpText          String?

  // Display
  order             Int
  width             String   @default("full") // full, half, third

  // Advanced features
  autocomplete      Boolean  @default(false)
  encrypt           Boolean  @default(false)

  // Timestamps
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  // Relations
  step              IntakeFormStep @relation(fields: [stepId], references: [id], onDelete: Cascade)

  @@map("intake_form_fields")
  @@unique([stepId, fieldName])
  @@index([stepId])
  @@index([order])
}

// Workflow transitions (enables branching/conditional flows)
model IntakeFormTransition {
  id                String   @id @default(cuid())
  templateId        String

  // Transition definition
  fromStepId        String
  toStepId          String

  // Conditional logic
  condition         Json?    // When this transition is valid
  priority          Int      @default(0) // Higher priority checked first

  // Display
  label             String?  // Button text (e.g., "Continue", "Skip", "Back")

  // Timestamps
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  // Relations
  fromStep          IntakeFormStep @relation("FromStep", fields: [fromStepId], references: [id], onDelete: Cascade)
  toStep            IntakeFormStep @relation("ToStep", fields: [toStepId], references: [id], onDelete: Cascade)

  @@map("intake_form_transitions")
  @@index([fromStepId])
  @@index([toStepId])
}

// Action definitions (webhooks, integrations, conversions)
model IntakeFormAction {
  id                String   @id @default(cuid())
  templateId        String

  // Action identity
  actionType        String   // webhook, email, conversion, crm_integration, etc.
  name              String
  description       String?

  // Trigger
  trigger           String   // on_step_complete, on_submit, on_field_change
  triggerCondition  Json?    // Optional condition

  // Action configuration
  config            Json     // Action-specific configuration

  // Execution
  order             Int      // Execution order
  async             Boolean  @default(true) // Run asynchronously

  // Status
  isActive          Boolean  @default(true)

  // Timestamps
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@map("intake_form_actions")
  @@index([templateId])
  @@index([trigger])
}
```

#### Modified Existing Tables

```prisma
// Add template reference to IntakeSession
model IntakeSession {
  // ... existing fields ...

  // NEW: Template reference
  templateId        String?
  template          IntakeFormTemplate? @relation(fields: [templateId], references: [id])

  // NEW: Dynamic data storage
  formData          IntakeFormData[]

  // DEPRECATED (but kept for backwards compatibility)
  customerDataId    String?
  quoteDataId       String?

  // ... rest of existing fields ...
}
```

### 2. Field Type Registry

Support for 20+ field types out of the box:

```typescript
export enum FieldType {
  // Text inputs
  TEXT = 'text',
  EMAIL = 'email',
  PHONE = 'phone',
  URL = 'url',
  TEXTAREA = 'textarea',

  // Numbers
  NUMBER = 'number',
  CURRENCY = 'currency',
  PERCENTAGE = 'percentage',

  // Selections
  SELECT = 'select',
  MULTISELECT = 'multiselect',
  RADIO = 'radio',
  CHECKBOX = 'checkbox',

  // Date/Time
  DATE = 'date',
  TIME = 'time',
  DATETIME = 'datetime',
  DATERANGE = 'daterange',

  // Files
  FILE = 'file',
  IMAGE = 'image',

  // Advanced
  SIGNATURE = 'signature',
  RATING = 'rating',
  SLIDER = 'slider',
  LOCATION = 'location',
  MATRIX = 'matrix', // Grid of questions

  // Custom (extensible)
  CUSTOM = 'custom'
}
```

### 3. Conditional Logic Engine

Support dynamic forms with show/hide/require logic:

```typescript
interface ConditionalRule {
  field: string;
  operator: 'equals' | 'notEquals' | 'contains' | 'greaterThan' | 'lessThan' | 'isEmpty' | 'isNotEmpty';
  value: any;
  logic?: 'AND' | 'OR'; // For chaining multiple conditions
}

// Example: Show emergency service options only if urgency is EMERGENCY
{
  "showIf": [
    {
      "field": "urgency",
      "operator": "equals",
      "value": "EMERGENCY"
    }
  ]
}

// Example: Require business license if profile type is COMMERCIAL
{
  "requireIf": [
    {
      "field": "profileType",
      "operator": "equals",
      "value": "COMMERCIAL"
    }
  ]
}
```

### 4. Workflow Engine

Dynamic workflow resolution with conditional routing:

```typescript
interface WorkflowContext {
  formData: Record<string, any>;
  currentStep: string;
  completedSteps: string[];
  metadata: Record<string, any>;
}

class WorkflowEngine {
  /**
   * Get available next steps based on current state and conditions
   */
  public getAvailableTransitions(
    template: IntakeFormTemplate,
    context: WorkflowContext
  ): WorkflowTransition[] {
    const currentStepTransitions = template.transitions.filter(
      t => t.fromStepId === context.currentStep
    );

    // Filter by conditions and sort by priority
    return currentStepTransitions
      .filter(t => this.evaluateCondition(t.condition, context))
      .sort((a, b) => b.priority - a.priority);
  }

  /**
   * Check if all required steps are completed for submission
   */
  public canSubmit(
    template: IntakeFormTemplate,
    context: WorkflowContext
  ): { canSubmit: boolean; missingSteps: string[] } {
    const requiredSteps = template.steps.filter(s => s.required);

    const missingSteps = requiredSteps
      .filter(step => {
        // Skip if conditionally hidden
        if (step.showIf && !this.evaluateCondition(step.showIf, context)) {
          return false;
        }

        // Check if completed
        return !context.completedSteps.includes(step.stepId);
      })
      .map(s => s.name);

    return {
      canSubmit: missingSteps.length === 0,
      missingSteps
    };
  }

  private evaluateCondition(
    condition: ConditionalRule[] | null,
    context: WorkflowContext
  ): boolean {
    if (!condition) return true;

    // Evaluate each rule
    const results = condition.map(rule => {
      const fieldValue = context.formData[rule.field];

      switch (rule.operator) {
        case 'equals':
          return fieldValue === rule.value;
        case 'notEquals':
          return fieldValue !== rule.value;
        case 'contains':
          return String(fieldValue).includes(String(rule.value));
        case 'greaterThan':
          return Number(fieldValue) > Number(rule.value);
        case 'lessThan':
          return Number(fieldValue) < Number(rule.value);
        case 'isEmpty':
          return !fieldValue || fieldValue === '';
        case 'isNotEmpty':
          return !!fieldValue && fieldValue !== '';
        default:
          return false;
      }
    });

    // Combine with AND/OR logic
    return results.every(r => r === true); // Default AND
  }
}
```

### 5. Plugin Architecture

Extensible conversion system:

```typescript
interface ConversionPlugin {
  name: string;
  execute(context: ConversionContext): Promise<ConversionResult>;
}

interface ConversionContext {
  session: IntakeSession;
  formData: Record<string, any>;
  template: IntakeFormTemplate;
  organizationId: string;
  transaction: PrismaTransaction;
}

interface ConversionResult {
  entities: Record<string, any>;
  metadata: Record<string, any>;
}

// Example plugins:
class CustomerConversionPlugin implements ConversionPlugin {
  name = 'customer-creation';
  async execute(context: ConversionContext): Promise<ConversionResult> {
    // Create customer from form data
  }
}

class LeadConversionPlugin implements ConversionPlugin {
  name = 'lead-creation';
  async execute(context: ConversionContext): Promise<ConversionResult> {
    // Create lead instead of customer
  }
}

class SalesforceSyncPlugin implements ConversionPlugin {
  name = 'salesforce-sync';
  async execute(context: ConversionContext): Promise<ConversionResult> {
    // Sync to Salesforce CRM
  }
}
```

## Use Cases Enabled

### 1. Job Application Form
```typescript
{
  "name": "Job Application",
  "category": "JOB_APPLICATION",
  "steps": [
    { "stepId": "personal_info", "name": "Personal Information" },
    { "stepId": "experience", "name": "Work Experience" },
    { "stepId": "resume_upload", "name": "Resume & Documents" },
    { "stepId": "questions", "name": "Additional Questions" }
  ],
  "actions": [
    {
      "actionType": "email",
      "trigger": "on_submit",
      "config": {
        "to": "hr@company.com",
        "template": "new-application"
      }
    }
  ]
}
```

### 2. Event Registration
```typescript
{
  "name": "Conference Registration",
  "category": "EVENT_REGISTRATION",
  "steps": [
    { "stepId": "attendee_info", "name": "Attendee Information" },
    { "stepId": "ticket_selection", "name": "Select Tickets" },
    { "stepId": "dietary", "name": "Dietary Requirements" },
    { "stepId": "payment", "name": "Payment" }
  ]
}
```

### 3. Multi-Industry Service Intake
```typescript
{
  "name": "Legal Consultation",
  "category": "LEGAL_INTAKE",
  "steps": [
    { "stepId": "case_type", "name": "Type of Legal Matter" },
    {
      "stepId": "criminal_details",
      "name": "Criminal Case Details",
      "showIf": [{ "field": "case_type", "operator": "equals", "value": "CRIMINAL" }]
    },
    {
      "stepId": "civil_details",
      "name": "Civil Case Details",
      "showIf": [{ "field": "case_type", "operator": "equals", "value": "CIVIL" }]
    }
  ]
}
```

## API Design

### V2 API (New Template-Based)

```typescript
// Create session from template
POST /api/v2/public/intake/session
{
  "templateId": "template_hvac_quote",
  "organizationId": "org_123" // Optional, uses default template
}

// Update form data
POST /api/v2/public/intake/session/:sessionId/data
{
  "stepId": "personal_info",
  "data": {
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com"
  }
}

// Get available transitions
GET /api/v2/public/intake/session/:sessionId/transitions

// Navigate workflow
POST /api/v2/public/intake/session/:sessionId/navigate
{
  "toStepId": "service_details"
}

// Submit form
POST /api/v2/public/intake/session/:sessionId/submit
```

### Admin API (Template Management)

```typescript
// Create template
POST /api/v2/admin/intake/templates
{
  "name": "Custom Quote Form",
  "category": "CUSTOMER_QUOTE",
  "steps": [...],
  "fields": [...],
  "actions": [...]
}

// Get template
GET /api/v2/admin/intake/templates/:templateId

// Update template (creates new version)
PUT /api/v2/admin/intake/templates/:templateId
{
  "steps": [...] // Updated steps
}

// List templates
GET /api/v2/admin/intake/templates?category=CUSTOMER_QUOTE&organizationId=org_123

// Clone template
POST /api/v2/admin/intake/templates/:templateId/clone
{
  "name": "Customized HVAC Quote"
}
```

## Backwards Compatibility

### V1 API Maintained

Old API continues to work, internally mapped to default template:

```typescript
// V1 request
POST /api/v1/public/intake/initialize

// Internally converted to V2
POST /api/v2/public/intake/session
{
  "templateId": "system_default_customer_quote"
}
```

### Data Migration

```typescript
class MigrationService {
  async migrateExistingSessions(): Promise<void> {
    // Create default template from current hardcoded workflow
    const defaultTemplate = await this.createDefaultTemplate();

    // Migrate existing sessions
    const sessions = await prisma.intakeSession.findMany({
      where: { templateId: null }
    });

    for (const session of sessions) {
      // Link to default template
      await prisma.intakeSession.update({
        where: { id: session.id },
        data: { templateId: defaultTemplate.id }
      });

      // Migrate customer data to form data
      if (session.customerData) {
        await this.migrateCustomerDataToFormData(
          session.id,
          session.customerData
        );
      }

      // Migrate quote data to form data
      if (session.quoteData) {
        await this.migrateQuoteDataToFormData(
          session.id,
          session.quoteData
        );
      }
    }
  }
}
```

## Implementation Roadmap

### Phase 1: Foundation (Weeks 1-2)
- [ ] Database schema implementation
- [ ] Core template models and repositories
- [ ] Basic CRUD operations for templates

### Phase 2: Workflow Engine (Weeks 3-4)
- [ ] Conditional logic evaluator
- [ ] Workflow transition resolver
- [ ] Step completion calculator

### Phase 3: Form Data System (Weeks 5-6)
- [ ] EAV data storage implementation
- [ ] Field type registry
- [ ] Dynamic validation engine

### Phase 4: V2 API (Weeks 7-8)
- [ ] New API endpoints
- [ ] Template-based session creation
- [ ] Dynamic data submission

### Phase 5: Conversion Plugins (Weeks 9-10)
- [ ] Plugin architecture
- [ ] Default plugins (Customer, Quote, Email)
- [ ] Plugin registration system

### Phase 6: Template Management (Weeks 11-12)
- [ ] Admin API
- [ ] Template builder UI
- [ ] Template marketplace

### Phase 7: Migration & Testing (Weeks 13-14)
- [ ] V1 to V2 migration scripts
- [ ] Backwards compatibility testing
- [ ] Load testing with new architecture

### Phase 8: Documentation & Training (Weeks 15-16)
- [ ] API documentation
- [ ] Template creation guide
- [ ] Plugin development guide
- [ ] Migration guide

### Phase 9: Soft Launch (Week 17)
- [ ] Beta testing with select organizations
- [ ] Bug fixes and optimizations
- [ ] Performance tuning

### Phase 10: Production Rollout (Week 18)
- [ ] Gradual rollout with feature flags
- [ ] Monitoring and alerting
- [ ] Support documentation

## Security Considerations

All existing security measures maintained:
- ✅ Token-based authentication
- ✅ Rate limiting
- ✅ Bot detection
- ✅ Honeypot fields
- ✅ Field-level encryption
- ✅ CSRF protection

New security additions:
- Template permissions (who can create/modify)
- Sandbox execution for custom validators
- Action rate limiting (prevent webhook abuse)
- Template version control (prevent malicious changes)

## Benefits

### For Organizations
1. **Complete Customization** - Configure intake for any industry
2. **No Code Changes** - Modify workflows without deployment
3. **A/B Testing** - Test different flows and optimize conversion
4. **Brand Consistency** - Custom fields and messaging
5. **Integration Flexibility** - Connect to any CRM/system

### For Developers
1. **Maintainability** - Configuration vs code
2. **Testability** - Plugin isolation
3. **Extensibility** - Easy to add new field types/actions
4. **Reusability** - Template marketplace
5. **Performance** - Cached templates, optimized queries

### For End Users
1. **Better UX** - Relevant questions only (conditional logic)
2. **Faster Completion** - Optimized flows per use case
3. **Clear Progress** - Dynamic completion calculation
4. **Mobile Friendly** - Responsive field types

## Conclusion

This architecture transforms the intake system from a rigid, single-purpose tool into a flexible platform that can support unlimited use cases while maintaining security and performance. The phased approach ensures backwards compatibility and minimizes risk during transition.
