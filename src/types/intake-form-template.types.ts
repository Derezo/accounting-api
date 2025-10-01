/**
 * Type definitions for the template-based intake form system
 */

// ==================== ENUMS ====================

export enum TemplateType {
  SYSTEM = 'SYSTEM',
  CUSTOM = 'CUSTOM',
  INDUSTRY = 'INDUSTRY',
}

export enum Industry {
  HVAC = 'HVAC',
  PLUMBING = 'PLUMBING',
  ELECTRICAL = 'ELECTRICAL',
  CONSTRUCTION = 'CONSTRUCTION',
  LANDSCAPING = 'LANDSCAPING',
  CLEANING = 'CLEANING',
  IT_SERVICES = 'IT_SERVICES',
  CONSULTING = 'CONSULTING',
  LEGAL = 'LEGAL',
  MEDICAL = 'MEDICAL',
  ACCOUNTING = 'ACCOUNTING',
  REAL_ESTATE = 'REAL_ESTATE',
  AUTOMOTIVE = 'AUTOMOTIVE',
  GENERAL = 'GENERAL',
}

export enum StepLayout {
  SINGLE_COLUMN = 'SINGLE_COLUMN',
  TWO_COLUMN = 'TWO_COLUMN',
  GRID = 'GRID',
}

export enum FieldType {
  TEXT = 'text',
  EMAIL = 'email',
  PHONE = 'phone',
  NUMBER = 'number',
  SELECT = 'select',
  MULTISELECT = 'multiselect',
  RADIO = 'radio',
  CHECKBOX = 'checkbox',
  TEXTAREA = 'textarea',
  DATE = 'date',
  DATETIME = 'datetime',
  TIME = 'time',
  FILE = 'file',
  SIGNATURE = 'signature',
  RATING = 'rating',
  SCALE = 'scale',
  MATRIX = 'matrix',
  ADDRESS = 'address',
  CUSTOM = 'custom',
}

export enum DataType {
  STRING = 'string',
  NUMBER = 'number',
  BOOLEAN = 'boolean',
  DATE = 'date',
  ARRAY = 'array',
  OBJECT = 'object',
}

export enum FieldWidth {
  FULL = 'FULL',
  HALF = 'HALF',
  THIRD = 'THIRD',
  QUARTER = 'QUARTER',
}

export enum SessionStatus {
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  EXPIRED = 'EXPIRED',
  ABANDONED = 'ABANDONED',
  BLOCKED = 'BLOCKED',
}

export enum ActionType {
  WEBHOOK = 'webhook',
  EMAIL = 'email',
  SLACK = 'slack',
  CUSTOM = 'custom',
}

export enum ActionTrigger {
  ON_SUBMIT = 'on_submit',
  ON_STEP_COMPLETE = 'on_step_complete',
  ON_FIELD_CHANGE = 'on_field_change',
  ON_CONVERSION = 'on_conversion',
}

// ==================== CONFIGURATION TYPES ====================

export interface TemplateConfig {
  theme?: {
    primaryColor?: string;
    secondaryColor?: string;
    fontFamily?: string;
  };
  layout?: {
    maxWidth?: string;
    spacing?: string;
  };
  branding?: {
    logoUrl?: string;
    companyName?: string;
    showPoweredBy?: boolean;
  };
  notifications?: {
    enableEmail?: boolean;
    enableSlack?: boolean;
    recipients?: string[];
  };
}

export interface CompletionRules {
  requiredFields?: string[]; // Field keys that must be completed
  minimumPercentage?: number; // Minimum completion percentage (0-100)
  customLogic?: string; // JSON logic expression
}

export interface ConversionSettings {
  customerMapping?: Record<string, string>; // field key -> customer field path
  quoteMapping?: Record<string, string>; // field key -> quote field path
  defaultValues?: Record<string, unknown>;
  transformations?: Array<{
    field: string;
    transform: string; // Function name or expression
  }>;
}

export interface ValidationRule {
  type: 'required' | 'min' | 'max' | 'pattern' | 'email' | 'phone' | 'url' | 'custom';
  value?: unknown;
  message?: string;
}

export interface ValidationRules {
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  email?: boolean;
  phone?: boolean;
  url?: boolean;
  custom?: string; // Custom validation function name
}

export interface ConditionalLogic {
  operator: 'AND' | 'OR';
  conditions: Array<{
    field: string; // Field key
    operator: 'equals' | 'notEquals' | 'contains' | 'notContains' | 'greaterThan' | 'lessThan' | 'in' | 'notIn' | 'isEmpty' | 'isNotEmpty';
    value?: unknown;
  }>;
}

export interface TransitionCondition extends ConditionalLogic {
  // Inherits from ConditionalLogic
}

export interface TransitionAction {
  type: 'setField' | 'clearField' | 'calculateField' | 'sendNotification' | 'custom';
  params?: Record<string, unknown>;
}

export interface TransitionRequirements {
  fieldsCompleted?: string[];
  validationPassed?: boolean;
  customCheck?: string; // Function name
}

export interface ActionConfig {
  // Webhook config
  url?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH';
  headers?: Record<string, string>;
  body?: Record<string, unknown>;

  // Email config
  to?: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  template?: string;

  // Slack config
  channel?: string;
  message?: string;

  // Custom config
  handler?: string; // Function name
  params?: Record<string, unknown>;
}

export interface StepTimings {
  [stepKey: string]: {
    startedAt: Date;
    completedAt?: Date;
    duration?: number; // milliseconds
  };
}

// ==================== CREATE/UPDATE DTOs ====================

export interface CreateTemplateDto {
  name: string;
  description?: string;
  templateType?: TemplateType;
  industry?: Industry;
  isActive?: boolean;
  isDefault?: boolean;
  isPublic?: boolean;
  config?: TemplateConfig;
  completionRules?: CompletionRules;
  autoConvert?: boolean;
  conversionSettings?: ConversionSettings;
}

export interface UpdateTemplateDto {
  name?: string;
  description?: string;
  isActive?: boolean;
  isDefault?: boolean;
  config?: TemplateConfig;
  completionRules?: CompletionRules;
  autoConvert?: boolean;
  conversionSettings?: ConversionSettings;
}

export interface CreateStepDto {
  stepKey: string;
  name: string;
  description?: string;
  sortOrder: number;
  isRequired?: boolean;
  canSkip?: boolean;
  skipCondition?: ConditionalLogic;
  completionRules?: CompletionRules;
  layout?: StepLayout;
  displayStyle?: Record<string, unknown>;
  helpText?: string;
}

export interface UpdateStepDto {
  name?: string;
  description?: string;
  sortOrder?: number;
  isRequired?: boolean;
  canSkip?: boolean;
  skipCondition?: ConditionalLogic;
  completionRules?: CompletionRules;
  layout?: StepLayout;
  displayStyle?: Record<string, unknown>;
  helpText?: string;
}

export interface CreateFieldDto {
  fieldKey: string;
  stepId?: string;
  label: string;
  placeholder?: string;
  helpText?: string;
  fieldType: FieldType;
  dataType?: DataType;
  isRequired?: boolean;
  validationRules?: ValidationRules;
  validationError?: string;
  options?: Array<{ label: string; value: unknown }>;
  defaultValue?: unknown;
  showIf?: ConditionalLogic;
  requireIf?: ConditionalLogic;
  sortOrder: number;
  width?: FieldWidth;
  displayStyle?: Record<string, unknown>;
  autocomplete?: string;
  mappingPath?: string;
  encrypted?: boolean;
}

export interface UpdateFieldDto {
  label?: string;
  placeholder?: string;
  helpText?: string;
  fieldType?: FieldType;
  dataType?: DataType;
  isRequired?: boolean;
  validationRules?: ValidationRules;
  validationError?: string;
  options?: Array<{ label: string; value: unknown }>;
  defaultValue?: unknown;
  showIf?: ConditionalLogic;
  requireIf?: ConditionalLogic;
  sortOrder?: number;
  width?: FieldWidth;
  displayStyle?: Record<string, unknown>;
  autocomplete?: string;
  mappingPath?: string;
  encrypted?: boolean;
}

export interface CreateTransitionDto {
  fromStepId: string;
  toStepKey: string;
  condition?: ConditionalLogic;
  priority?: number;
  action?: TransitionAction;
  requirements?: TransitionRequirements;
}

export interface UpdateTransitionDto {
  toStepKey?: string;
  condition?: ConditionalLogic;
  priority?: number;
  action?: TransitionAction;
  requirements?: TransitionRequirements;
}

export interface CreateActionDto {
  actionType: ActionType;
  trigger: ActionTrigger;
  config: ActionConfig;
  priority?: number;
  isActive?: boolean;
  condition?: ConditionalLogic;
  retryCount?: number;
  timeout?: number;
}

export interface UpdateActionDto {
  actionType?: ActionType;
  trigger?: ActionTrigger;
  config?: ActionConfig;
  priority?: number;
  isActive?: boolean;
  condition?: ConditionalLogic;
  retryCount?: number;
  timeout?: number;
}

// ==================== SESSION DTOs ====================

export interface CreateSessionDto {
  templateId: string;
  ipAddress: string;
  userAgent?: string;
  fingerprint?: string;
  origin?: string;
}

export interface UpdateSessionDataDto {
  [fieldKey: string]: unknown;
}

export interface SessionProgress {
  completionPercentage: number;
  currentStepKey: string;
  visitedSteps: string[];
  completedSteps: string[];
  isValid: boolean;
  validationErrors?: Array<{
    field: string;
    message: string;
  }>;
}

// ==================== RESPONSE TYPES ====================

export interface TemplateWithRelations {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  version: string;
  templateType: string;
  industry?: string;
  isActive: boolean;
  isDefault: boolean;
  isPublic: boolean;
  config: TemplateConfig;
  completionRules: CompletionRules;
  autoConvert: boolean;
  conversionSettings?: ConversionSettings;
  submissionCount: number;
  conversionCount: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
  steps: StepWithFields[];
  fields: FieldDto[];
}

export interface StepWithFields {
  id: string;
  templateId: string;
  stepKey: string;
  name: string;
  description?: string;
  sortOrder: number;
  isRequired: boolean;
  canSkip: boolean;
  skipCondition?: ConditionalLogic;
  completionRules?: CompletionRules;
  layout: string;
  displayStyle?: Record<string, unknown>;
  helpText?: string;
  createdAt: Date;
  updatedAt: Date;
  fields: FieldDto[];
  transitions: TransitionDto[];
}

export interface FieldDto {
  id: string;
  templateId: string;
  stepId?: string;
  fieldKey: string;
  label: string;
  placeholder?: string;
  helpText?: string;
  fieldType: string;
  dataType: string;
  isRequired: boolean;
  validationRules?: ValidationRules;
  validationError?: string;
  options?: Array<{ label: string; value: unknown }>;
  defaultValue?: unknown;
  showIf?: ConditionalLogic;
  requireIf?: ConditionalLogic;
  sortOrder: number;
  width: string;
  displayStyle?: Record<string, unknown>;
  autocomplete?: string;
  mappingPath?: string;
  encrypted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface TransitionDto {
  id: string;
  templateId: string;
  fromStepId: string;
  toStepKey: string;
  condition?: ConditionalLogic;
  priority: number;
  action?: TransitionAction;
  requirements?: TransitionRequirements;
  createdAt: Date;
  updatedAt: Date;
}

export interface ActionDto {
  id: string;
  templateId: string;
  actionType: string;
  trigger: string;
  config: ActionConfig;
  priority: number;
  isActive: boolean;
  condition?: ConditionalLogic;
  retryCount: number;
  timeout: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionDto {
  id: string;
  templateId: string;
  token: string; // Raw token (not hash)
  status: string;
  currentStepKey: string;
  visitedSteps: string[];
  completedSteps: string[];
  ipAddress: string;
  userAgent?: string;
  fingerprint?: string;
  origin?: string;
  suspicionScore: number;
  botFlags?: string[];
  sessionStartedAt: Date;
  lastActivityAt: Date;
  stepTimings?: StepTimings;
  requestCount: number;
  submissionAttempts: number;
  formData?: Record<string, unknown>;
  completionPercentage: number;
  convertedAt?: Date;
  convertedToCustomerId?: string;
  convertedToQuoteId?: string;
  privacyPolicyAccepted: boolean;
  termsAccepted: boolean;
  marketingConsent: boolean;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
