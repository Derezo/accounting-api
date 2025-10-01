/**
 * Validation schemas for intake form V2 API
 */

import { z } from 'zod';

// ==================== ENUMS ====================

const templateTypeEnum = z.enum(['SYSTEM', 'CUSTOM', 'INDUSTRY']);
const industryEnum = z.enum([
  'HVAC',
  'PLUMBING',
  'ELECTRICAL',
  'CONSTRUCTION',
  'LANDSCAPING',
  'CLEANING',
  'IT_SERVICES',
  'CONSULTING',
  'LEGAL',
  'MEDICAL',
  'ACCOUNTING',
  'REAL_ESTATE',
  'AUTOMOTIVE',
  'GENERAL',
]);
const stepLayoutEnum = z.enum(['SINGLE_COLUMN', 'TWO_COLUMN', 'GRID']);
const fieldTypeEnum = z.enum([
  'text',
  'email',
  'phone',
  'number',
  'select',
  'multiselect',
  'radio',
  'checkbox',
  'textarea',
  'date',
  'datetime',
  'time',
  'file',
  'signature',
  'rating',
  'scale',
  'matrix',
  'address',
  'custom',
]);
const dataTypeEnum = z.enum(['string', 'number', 'boolean', 'date', 'array', 'object']);
const fieldWidthEnum = z.enum(['FULL', 'HALF', 'THIRD', 'QUARTER']);

// ==================== SHARED SCHEMAS ====================

const conditionalLogicSchema = z.object({
  operator: z.enum(['AND', 'OR']),
  conditions: z.array(
    z.object({
      field: z.string(),
      operator: z.enum([
        'equals',
        'notEquals',
        'contains',
        'notContains',
        'greaterThan',
        'lessThan',
        'in',
        'notIn',
        'isEmpty',
        'isNotEmpty',
      ]),
      value: z.unknown().optional(),
    })
  ),
});

const validationRulesSchema = z.object({
  min: z.number().optional(),
  max: z.number().optional(),
  minLength: z.number().optional(),
  maxLength: z.number().optional(),
  pattern: z.string().optional(),
  email: z.boolean().optional(),
  phone: z.boolean().optional(),
  url: z.boolean().optional(),
  custom: z.string().optional(),
});

const templateConfigSchema = z.object({
  theme: z
    .object({
      primaryColor: z.string().optional(),
      secondaryColor: z.string().optional(),
      fontFamily: z.string().optional(),
    })
    .optional(),
  layout: z
    .object({
      maxWidth: z.string().optional(),
      spacing: z.string().optional(),
    })
    .optional(),
  branding: z
    .object({
      logoUrl: z.string().optional(),
      companyName: z.string().optional(),
      showPoweredBy: z.boolean().optional(),
    })
    .optional(),
  notifications: z
    .object({
      enableEmail: z.boolean().optional(),
      enableSlack: z.boolean().optional(),
      recipients: z.array(z.string()).optional(),
    })
    .optional(),
});

const completionRulesSchema = z.object({
  requiredFields: z.array(z.string()).optional(),
  minimumPercentage: z.number().min(0).max(100).optional(),
  customLogic: z.string().optional(),
});

const conversionSettingsSchema = z.object({
  customerMapping: z.record(z.string()).optional(),
  quoteMapping: z.record(z.string()).optional(),
  defaultValues: z.record(z.unknown()).optional(),
  transformations: z
    .array(
      z.object({
        field: z.string(),
        transform: z.string(),
      })
    )
    .optional(),
});

// ==================== TEMPLATE SCHEMAS ====================

export const createTemplateSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(255),
    description: z.string().optional(),
    templateType: templateTypeEnum.optional(),
    industry: industryEnum.optional(),
    isActive: z.boolean().optional(),
    isDefault: z.boolean().optional(),
    isPublic: z.boolean().optional(),
    config: templateConfigSchema.optional(),
    completionRules: completionRulesSchema.optional(),
    autoConvert: z.boolean().optional(),
    conversionSettings: conversionSettingsSchema.optional(),
  }),
});

export const updateTemplateSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(255).optional(),
    description: z.string().optional(),
    isActive: z.boolean().optional(),
    isDefault: z.boolean().optional(),
    config: templateConfigSchema.optional(),
    completionRules: completionRulesSchema.optional(),
    autoConvert: z.boolean().optional(),
    conversionSettings: conversionSettingsSchema.optional(),
  }),
});

// ==================== STEP SCHEMAS ====================

export const createStepSchema = z.object({
  body: z.object({
    stepKey: z.string().min(1).max(100),
    name: z.string().min(1).max(255),
    description: z.string().optional(),
    sortOrder: z.number().int().min(0),
    isRequired: z.boolean().optional(),
    canSkip: z.boolean().optional(),
    skipCondition: conditionalLogicSchema.optional(),
    completionRules: completionRulesSchema.optional(),
    layout: stepLayoutEnum.optional(),
    displayStyle: z.record(z.unknown()).optional(),
    helpText: z.string().optional(),
  }),
});

export const updateStepSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(255).optional(),
    description: z.string().optional(),
    sortOrder: z.number().int().min(0).optional(),
    isRequired: z.boolean().optional(),
    canSkip: z.boolean().optional(),
    skipCondition: conditionalLogicSchema.optional(),
    completionRules: completionRulesSchema.optional(),
    layout: stepLayoutEnum.optional(),
    displayStyle: z.record(z.unknown()).optional(),
    helpText: z.string().optional(),
  }),
});

// ==================== FIELD SCHEMAS ====================

export const createFieldSchema = z.object({
  body: z.object({
    fieldKey: z.string().min(1).max(100),
    stepId: z.string().optional(),
    label: z.string().min(1).max(255),
    placeholder: z.string().optional(),
    helpText: z.string().optional(),
    fieldType: fieldTypeEnum,
    dataType: dataTypeEnum.optional(),
    isRequired: z.boolean().optional(),
    validationRules: validationRulesSchema.optional(),
    validationError: z.string().optional(),
    options: z
      .array(
        z.object({
          label: z.string(),
          value: z.unknown(),
        })
      )
      .optional(),
    defaultValue: z.unknown().optional(),
    showIf: conditionalLogicSchema.optional(),
    requireIf: conditionalLogicSchema.optional(),
    sortOrder: z.number().int().min(0),
    width: fieldWidthEnum.optional(),
    displayStyle: z.record(z.unknown()).optional(),
    autocomplete: z.string().optional(),
    mappingPath: z.string().optional(),
    encrypted: z.boolean().optional(),
  }),
});

export const updateFieldSchema = z.object({
  body: z.object({
    label: z.string().min(1).max(255).optional(),
    placeholder: z.string().optional(),
    helpText: z.string().optional(),
    fieldType: fieldTypeEnum.optional(),
    dataType: dataTypeEnum.optional(),
    isRequired: z.boolean().optional(),
    validationRules: validationRulesSchema.optional(),
    validationError: z.string().optional(),
    options: z
      .array(
        z.object({
          label: z.string(),
          value: z.unknown(),
        })
      )
      .optional(),
    defaultValue: z.unknown().optional(),
    showIf: conditionalLogicSchema.optional(),
    requireIf: conditionalLogicSchema.optional(),
    sortOrder: z.number().int().min(0).optional(),
    width: fieldWidthEnum.optional(),
    displayStyle: z.record(z.unknown()).optional(),
    autocomplete: z.string().optional(),
    mappingPath: z.string().optional(),
    encrypted: z.boolean().optional(),
  }),
});

// ==================== SESSION SCHEMAS ====================

export const createSessionSchema = z.object({
  body: z.object({
    fingerprint: z.string().optional(),
  }),
});

export const updateSessionDataSchema = z.object({
  body: z.record(z.unknown()),
});

export const advanceStepSchema = z.object({
  body: z.object({
    stepKey: z.string().min(1),
  }),
});
