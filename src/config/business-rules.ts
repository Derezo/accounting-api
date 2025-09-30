/**
 * Business Rules Configuration
 *
 * Centralized configuration for business logic constants and rules.
 * These values should be configurable per organization in production.
 */

/**
 * ============================================================================
 * INDUSTRY-SPECIFIC FIELD TEMPLATES FOR INTAKE WORKFLOW
 * ============================================================================
 *
 * This section defines dynamic form field templates for different service industries.
 * These templates are used during the public intake workflow to collect industry-specific
 * information beyond the standard quote fields.
 *
 * HOW TO ADD A NEW BUSINESS TYPE:
 * -------------------------------
 * 1. Add a new key to BUSINESS_TEMPLATES object (e.g., 'ROOFING')
 * 2. Define an array of field objects with the structure below
 * 3. Each field supports validation rules and conditional logic
 *
 * FIELD TYPE OPTIONS:
 * ------------------
 * - text: Single-line text input
 * - textarea: Multi-line text input
 * - number: Numeric input
 * - select: Dropdown selection
 * - multiselect: Multiple choice selection
 * - date: Date picker
 * - radio: Radio button group
 * - checkbox: Checkbox input
 * - tel: Phone number input
 * - email: Email input
 *
 * VALIDATION RULES:
 * ----------------
 * - required: boolean - Field is mandatory
 * - min: number - Minimum value (for number/date) or length (for text)
 * - max: number - Maximum value (for number/date) or length (for text)
 * - pattern: string - Regex pattern for validation
 * - options: string[] - Available options for select/multiselect/radio
 * - showIf: object - Conditional display rules based on other field values
 *
 * EXAMPLES:
 * --------
 * Basic required text field:
 *   { name: 'brandModel', type: 'text', label: 'Brand/Model', required: true }
 *
 * Number field with range:
 *   { name: 'systemAge', type: 'number', label: 'System Age (years)', min: 0, max: 50 }
 *
 * Select field with options:
 *   { name: 'systemType', type: 'select', label: 'System Type',
 *     options: ['Central Air', 'Heat Pump', 'Furnace'], required: true }
 *
 * Conditional field:
 *   { name: 'refrigerantType', type: 'text', label: 'Refrigerant Type',
 *     showIf: { field: 'systemType', value: ['Central Air', 'Heat Pump'] } }
 */

export interface FieldTemplate {
  name: string;
  type: 'text' | 'textarea' | 'number' | 'select' | 'multiselect' | 'date' | 'radio' | 'checkbox' | 'tel' | 'email';
  label: string;
  placeholder?: string;
  helpText?: string;
  required?: boolean;
  min?: number;
  max?: number;
  pattern?: string;
  options?: string[];
  defaultValue?: string | number | boolean;
  showIf?: {
    field: string;
    value: string | string[];
  };
}

export interface BusinessTemplate {
  name: string;
  description: string;
  fields: FieldTemplate[];
}

export const BUSINESS_TEMPLATES: Record<string, BusinessTemplate> = {
  HVAC: {
    name: 'HVAC Services',
    description: 'Heating, Ventilation, and Air Conditioning',
    fields: [
      {
        name: 'systemType',
        type: 'select',
        label: 'System Type',
        options: ['Central Air', 'Heat Pump', 'Furnace', 'Boiler', 'Ductless Mini-Split', 'Window Unit', 'Other'],
        required: true,
        helpText: 'Select the type of HVAC system'
      },
      {
        name: 'systemAge',
        type: 'number',
        label: 'System Age (years)',
        placeholder: 'e.g., 5',
        min: 0,
        max: 50,
        helpText: 'Approximate age of the system'
      },
      {
        name: 'brandModel',
        type: 'text',
        label: 'Brand/Model',
        placeholder: 'e.g., Carrier 24ACC636',
        helpText: 'If known, provide the brand and model number'
      },
      {
        name: 'lastServiceDate',
        type: 'date',
        label: 'Last Service Date',
        helpText: 'When was the system last serviced?'
      },
      {
        name: 'propertySize',
        type: 'number',
        label: 'Property Size (sq ft)',
        placeholder: 'e.g., 2000',
        min: 100,
        max: 50000,
        helpText: 'Total square footage to be heated/cooled'
      },
      {
        name: 'issueType',
        type: 'multiselect',
        label: 'Issue Type',
        options: [
          'Not heating/cooling',
          'Strange noises',
          'Leaking water',
          'High energy bills',
          'Poor air quality',
          'Uneven temperatures',
          'Thermostat issues',
          'Other'
        ],
        helpText: 'Select all that apply'
      },
      {
        name: 'warrantyStatus',
        type: 'radio',
        label: 'Warranty Status',
        options: ['Under warranty', 'Warranty expired', 'Unknown'],
        defaultValue: 'Unknown'
      }
    ]
  },

  PLUMBING: {
    name: 'Plumbing Services',
    description: 'Residential and Commercial Plumbing',
    fields: [
      {
        name: 'issueLocation',
        type: 'select',
        label: 'Issue Location',
        options: ['Kitchen', 'Bathroom', 'Basement', 'Laundry Room', 'Outdoor', 'Multiple Locations', 'Other'],
        required: true
      },
      {
        name: 'plumbingIssue',
        type: 'multiselect',
        label: 'Plumbing Issue',
        options: [
          'Leaking pipe/faucet',
          'Clogged drain',
          'Toilet issue',
          'Water heater problem',
          'Low water pressure',
          'Sewer backup',
          'Installation/Upgrade',
          'Other'
        ],
        required: true,
        helpText: 'Select all that apply'
      },
      {
        name: 'waterHeaterType',
        type: 'select',
        label: 'Water Heater Type',
        options: ['Tank', 'Tankless', 'Heat Pump', 'Solar', 'Unknown'],
        showIf: { field: 'plumbingIssue', value: ['Water heater problem', 'Installation/Upgrade'] },
        helpText: 'Only if issue is related to water heater'
      },
      {
        name: 'waterHeaterAge',
        type: 'number',
        label: 'Water Heater Age (years)',
        min: 0,
        max: 30,
        showIf: { field: 'plumbingIssue', value: ['Water heater problem'] }
      },
      {
        name: 'waterShutoff',
        type: 'radio',
        label: 'Is water shut off?',
        options: ['Yes', 'No', 'Partial'],
        required: true,
        helpText: 'Critical for emergency response'
      },
      {
        name: 'numberOfFixtures',
        type: 'number',
        label: 'Number of Fixtures Affected',
        placeholder: 'e.g., 2',
        min: 1,
        max: 50
      },
      {
        name: 'buildingAge',
        type: 'select',
        label: 'Building Age',
        options: ['Less than 10 years', '10-25 years', '25-50 years', 'Over 50 years', 'Unknown'],
        helpText: 'Age of plumbing system matters for diagnosis'
      }
    ]
  },

  ELECTRICAL: {
    name: 'Electrical Services',
    description: 'Electrical Repairs and Installation',
    fields: [
      {
        name: 'electricalIssue',
        type: 'multiselect',
        label: 'Electrical Issue',
        options: [
          'Power outage',
          'Circuit breaker tripping',
          'Flickering lights',
          'Outlet not working',
          'Wiring issue',
          'Panel upgrade needed',
          'Installation/Upgrade',
          'Smoke detector issue',
          'Other'
        ],
        required: true,
        helpText: 'Select all that apply'
      },
      {
        name: 'panelType',
        type: 'select',
        label: 'Electrical Panel Type',
        options: ['Fuse box', 'Circuit breaker (100A)', 'Circuit breaker (200A)', 'Circuit breaker (400A+)', 'Unknown'],
        helpText: 'Type and amperage of main electrical panel'
      },
      {
        name: 'panelAge',
        type: 'number',
        label: 'Panel Age (years)',
        min: 0,
        max: 100,
        helpText: 'Approximate age of electrical panel'
      },
      {
        name: 'issueLocation',
        type: 'text',
        label: 'Issue Location',
        placeholder: 'e.g., Living room, Kitchen outlet',
        required: true
      },
      {
        name: 'safetyHazard',
        type: 'radio',
        label: 'Is this a safety hazard?',
        options: ['Yes - Immediate danger', 'Yes - Potential hazard', 'No', 'Unsure'],
        required: true,
        helpText: 'Any burning smell, sparks, or exposed wires?'
      },
      {
        name: 'installationType',
        type: 'select',
        label: 'Installation Type',
        options: [
          'Light fixture',
          'Ceiling fan',
          'Outlet/Switch',
          'EV charger',
          'Generator',
          'Smart home device',
          'Security system',
          'Other'
        ],
        showIf: { field: 'electricalIssue', value: ['Installation/Upgrade'] }
      },
      {
        name: 'permitRequired',
        type: 'radio',
        label: 'Building Permit Required?',
        options: ['Yes', 'No', 'Unknown'],
        helpText: 'Major electrical work typically requires permits'
      }
    ]
  },

  GENERAL: {
    name: 'General Contracting',
    description: 'General Construction and Renovation',
    fields: [
      {
        name: 'projectType',
        type: 'select',
        label: 'Project Type',
        options: [
          'Kitchen renovation',
          'Bathroom renovation',
          'Basement finishing',
          'Room addition',
          'Deck/Patio',
          'Flooring',
          'Painting',
          'Drywall repair',
          'Custom project',
          'Other'
        ],
        required: true
      },
      {
        name: 'projectScope',
        type: 'textarea',
        label: 'Project Scope',
        placeholder: 'Describe your project in detail...',
        required: true,
        min: 50,
        max: 2000,
        helpText: 'Provide as much detail as possible about your project'
      },
      {
        name: 'projectSize',
        type: 'number',
        label: 'Project Area (sq ft)',
        placeholder: 'e.g., 500',
        min: 10,
        max: 50000
      },
      {
        name: 'timeline',
        type: 'select',
        label: 'Desired Timeline',
        options: ['ASAP', 'Within 1 month', '1-3 months', '3-6 months', '6+ months', 'Flexible'],
        required: true
      },
      {
        name: 'materialsProvided',
        type: 'radio',
        label: 'Materials',
        options: ['Contractor provides', 'I will provide', 'Combination', 'Need guidance'],
        defaultValue: 'Contractor provides'
      },
      {
        name: 'permitsRequired',
        type: 'radio',
        label: 'Building Permits Required?',
        options: ['Yes', 'No', 'Unknown'],
        helpText: 'Major renovations typically require permits'
      },
      {
        name: 'designServices',
        type: 'radio',
        label: 'Need Design Services?',
        options: ['Yes - Full design', 'Yes - Consultation only', 'No - Have plans', 'Unsure'],
        helpText: 'Do you need help with design/planning?'
      }
    ]
  },

  LANDSCAPING: {
    name: 'Landscaping Services',
    description: 'Landscape Design and Maintenance',
    fields: [
      {
        name: 'serviceType',
        type: 'multiselect',
        label: 'Service Type',
        options: [
          'Lawn maintenance',
          'Garden design',
          'Tree/Shrub planting',
          'Hardscaping (patio/walkway)',
          'Irrigation system',
          'Snow removal',
          'Landscape lighting',
          'Fence installation',
          'Other'
        ],
        required: true,
        helpText: 'Select all services needed'
      },
      {
        name: 'propertySize',
        type: 'number',
        label: 'Property Size (sq ft)',
        placeholder: 'e.g., 5000',
        min: 100,
        max: 500000
      },
      {
        name: 'propertyType',
        type: 'select',
        label: 'Property Type',
        options: ['Residential - Front yard', 'Residential - Back yard', 'Residential - Both', 'Commercial', 'Industrial'],
        required: true
      },
      {
        name: 'soilCondition',
        type: 'select',
        label: 'Soil Condition',
        options: ['Sandy', 'Clay', 'Loam', 'Rocky', 'Unknown'],
        helpText: 'Affects plant selection and drainage'
      },
      {
        name: 'sunExposure',
        type: 'select',
        label: 'Sun Exposure',
        options: ['Full sun (6+ hours)', 'Partial sun (3-6 hours)', 'Shade (less than 3 hours)', 'Mixed'],
        helpText: 'Average daily sun exposure in the area'
      },
      {
        name: 'maintenanceFrequency',
        type: 'select',
        label: 'Maintenance Frequency',
        options: ['One-time project', 'Weekly', 'Bi-weekly', 'Monthly', 'Seasonal'],
        showIf: { field: 'serviceType', value: ['Lawn maintenance'] }
      },
      {
        name: 'irrigationExists',
        type: 'radio',
        label: 'Existing Irrigation System?',
        options: ['Yes - Working', 'Yes - Needs repair', 'No', 'Unknown']
      }
    ]
  },

  CLEANING: {
    name: 'Cleaning Services',
    description: 'Residential and Commercial Cleaning',
    fields: [
      {
        name: 'cleaningType',
        type: 'select',
        label: 'Cleaning Type',
        options: [
          'Standard cleaning',
          'Deep cleaning',
          'Move-in/Move-out',
          'Post-construction',
          'Carpet cleaning',
          'Window cleaning',
          'Pressure washing',
          'Other'
        ],
        required: true
      },
      {
        name: 'propertySize',
        type: 'number',
        label: 'Property Size (sq ft)',
        placeholder: 'e.g., 2000',
        min: 100,
        max: 100000,
        required: true
      },
      {
        name: 'numberOfRooms',
        type: 'number',
        label: 'Number of Rooms',
        placeholder: 'e.g., 4',
        min: 1,
        max: 50
      },
      {
        name: 'numberOfBathrooms',
        type: 'number',
        label: 'Number of Bathrooms',
        placeholder: 'e.g., 2',
        min: 1,
        max: 20
      },
      {
        name: 'frequency',
        type: 'select',
        label: 'Cleaning Frequency',
        options: ['One-time', 'Weekly', 'Bi-weekly', 'Monthly', 'Quarterly'],
        required: true
      },
      {
        name: 'specialRequirements',
        type: 'multiselect',
        label: 'Special Requirements',
        options: [
          'Pet-friendly products',
          'Eco-friendly products',
          'Hypoallergenic products',
          'No fragrances',
          'Bring own supplies',
          'None'
        ],
        helpText: 'Select all that apply'
      },
      {
        name: 'accessDetails',
        type: 'textarea',
        label: 'Access Details',
        placeholder: 'How will cleaners access the property?',
        max: 500,
        helpText: 'Lockbox code, doorman instructions, etc.'
      }
    ]
  },

  CONSTRUCTION: {
    name: 'Construction Services',
    description: 'New Construction and Major Renovations',
    fields: [
      {
        name: 'projectType',
        type: 'select',
        label: 'Project Type',
        options: [
          'New home construction',
          'Home addition',
          'Commercial build-out',
          'Structural renovation',
          'Foundation work',
          'Framing',
          'Roofing',
          'Siding',
          'Other'
        ],
        required: true
      },
      {
        name: 'projectSize',
        type: 'number',
        label: 'Project Size (sq ft)',
        placeholder: 'e.g., 2500',
        min: 100,
        max: 100000,
        required: true
      },
      {
        name: 'projectBudget',
        type: 'select',
        label: 'Approximate Budget',
        options: [
          'Under $50,000',
          '$50,000 - $100,000',
          '$100,000 - $250,000',
          '$250,000 - $500,000',
          '$500,000 - $1,000,000',
          'Over $1,000,000',
          'Unsure'
        ],
        required: true
      },
      {
        name: 'constructionPhase',
        type: 'select',
        label: 'Current Phase',
        options: [
          'Planning/Design',
          'Permits pending',
          'Permits approved',
          'Ready to start',
          'In progress - Need contractor',
          'Other'
        ],
        required: true
      },
      {
        name: 'lotOwnership',
        type: 'radio',
        label: 'Land/Building Ownership',
        options: ['Own the lot', 'Need to purchase lot', 'Existing building', 'Other']
      },
      {
        name: 'architectPlans',
        type: 'radio',
        label: 'Architectural Plans',
        options: ['Complete plans ready', 'Partial plans', 'Need architect', 'Unsure'],
        helpText: 'Do you have architectural drawings?'
      },
      {
        name: 'engineeringRequired',
        type: 'radio',
        label: 'Engineering Required?',
        options: ['Yes', 'No', 'Unknown'],
        helpText: 'Structural engineering for complex projects'
      },
      {
        name: 'timeline',
        type: 'select',
        label: 'Project Timeline',
        options: ['3-6 months', '6-12 months', '12-18 months', '18+ months', 'Flexible'],
        required: true
      }
    ]
  },

  ROOFING: {
    name: 'Roofing Services',
    description: 'Roof Repair and Replacement',
    fields: [
      {
        name: 'serviceNeeded',
        type: 'select',
        label: 'Service Needed',
        options: ['Repair', 'Replacement', 'Inspection', 'Maintenance', 'Emergency tarping', 'Unsure'],
        required: true
      },
      {
        name: 'roofType',
        type: 'select',
        label: 'Roof Type',
        options: ['Asphalt shingle', 'Metal', 'Tile', 'Flat/TPO', 'Cedar shake', 'Slate', 'Unknown'],
        helpText: 'Current or desired roof material'
      },
      {
        name: 'roofAge',
        type: 'number',
        label: 'Roof Age (years)',
        placeholder: 'e.g., 15',
        min: 0,
        max: 100,
        helpText: 'Approximate age of current roof'
      },
      {
        name: 'roofSize',
        type: 'number',
        label: 'Roof Size (sq ft)',
        placeholder: 'e.g., 2000',
        min: 100,
        max: 100000,
        helpText: 'Approximate square footage'
      },
      {
        name: 'issueType',
        type: 'multiselect',
        label: 'Issue Type',
        options: [
          'Active leak',
          'Missing/damaged shingles',
          'Sagging',
          'Storm damage',
          'Ice dam',
          'Ventilation issues',
          'End of life',
          'Other'
        ],
        required: true,
        helpText: 'Select all that apply'
      },
      {
        name: 'stories',
        type: 'select',
        label: 'Number of Stories',
        options: ['1', '2', '3', '4+'],
        required: true,
        helpText: 'Height affects access and pricing'
      },
      {
        name: 'insuranceClaim',
        type: 'radio',
        label: 'Insurance Claim?',
        options: ['Yes', 'No', 'Planning to file', 'Unsure'],
        helpText: 'Are you filing an insurance claim?'
      }
    ]
  }
};

export const BUSINESS_RULES = {
  /**
   * Quote-related business rules
   */
  QUOTE: {
    /** Default validity period for quotes in days */
    DEFAULT_VALIDITY_DAYS: 30,
    /** Maximum validity period for quotes in days */
    MAX_VALIDITY_DAYS: 90,
    /** Minimum validity period for quotes in days */
    MIN_VALIDITY_DAYS: 1,
  },

  /**
   * Invoice-related business rules
   */
  INVOICE: {
    /** Default payment terms in days */
    DEFAULT_PAYMENT_TERMS_DAYS: 30,
    /** Grace period before marking invoice as overdue */
    GRACE_PERIOD_DAYS: 3,
    /** Deposit percentage range */
    MIN_DEPOSIT_PERCENTAGE: 0,
    MAX_DEPOSIT_PERCENTAGE: 100,
  },

  /**
   * Payment-related business rules
   */
  PAYMENT: {
    /** Minimum payment amount in cents */
    MIN_AMOUNT_CENTS: 100, // $1.00
    /** Maximum payment amount in cents (configurable per organization) */
    MAX_AMOUNT_CENTS: 1000000000, // $10,000,000
    /** Payment processing timeout in milliseconds */
    PROCESSING_TIMEOUT_MS: 30000,
  },

  /**
   * Authentication and security rules
   */
  AUTHENTICATION: {
    /** Maximum failed login attempts before account lockout */
    MAX_FAILED_ATTEMPTS: 5,
    /** Account lockout duration in minutes */
    ACCOUNT_LOCK_DURATION_MINUTES: 30,
    /** Session timeout in hours */
    SESSION_TIMEOUT_HOURS: 24,
    /** Session idle timeout in minutes */
    SESSION_IDLE_TIMEOUT_MINUTES: 120,
    /** Password minimum length */
    PASSWORD_MIN_LENGTH: 8,
    /** Password maximum length */
    PASSWORD_MAX_LENGTH: 128,
    /** Two-factor authentication code validity in minutes */
    TFA_CODE_VALIDITY_MINUTES: 5,
  },

  /**
   * Security monitoring rules
   */
  SECURITY: {
    /** Threshold for brute force detection */
    BRUTE_FORCE_THRESHOLD: 5,
    /** Critical brute force threshold */
    CRITICAL_BRUTE_FORCE_THRESHOLD: 10,
    /** Retry attempts for transient failures */
    RETRY_ATTEMPTS: 3,
    /** Base backoff time for exponential backoff in milliseconds */
    BACKOFF_BASE_MS: 1000,
    /** Maximum backoff time in milliseconds */
    BACKOFF_MAX_MS: 30000,
  },

  /**
   * Audit logging rules
   */
  AUDIT: {
    /** Retention period for audit logs in days */
    RETENTION_DAYS: 2555, // 7 years for financial records
    /** Maximum detail field size in characters */
    MAX_DETAIL_SIZE: 10000,
    /** Batch size for bulk audit operations */
    BATCH_SIZE: 1000,
  },

  /**
   * Encryption and key management rules
   */
  ENCRYPTION: {
    /** Key rotation interval in days */
    KEY_ROTATION_INTERVAL_DAYS: 90,
    /** Key rotation warning threshold in days */
    KEY_ROTATION_WARNING_DAYS: 7,
    /** Maximum encryption operations per second */
    MAX_OPS_PER_SECOND: 1000,
  },

  /**
   * Rate limiting rules
   */
  RATE_LIMIT: {
    /** Standard API rate limit - requests per hour */
    STANDARD_REQUESTS_PER_HOUR: 1000,
    /** Burst rate limit - requests per minute */
    BURST_REQUESTS_PER_MINUTE: 100,
    /** Authentication rate limit - requests per 15 minutes */
    AUTH_REQUESTS_PER_15_MIN: 5,
  },

  /**
   * Pagination defaults
   */
  PAGINATION: {
    /** Default page size */
    DEFAULT_LIMIT: 50,
    /** Maximum page size */
    MAX_LIMIT: 500,
    /** Minimum page size */
    MIN_LIMIT: 1,
  },

  /**
   * File upload rules
   */
  UPLOAD: {
    /** Maximum file size in bytes (10MB) */
    MAX_FILE_SIZE: 10 * 1024 * 1024,
    /** Maximum files per upload */
    MAX_FILES_PER_UPLOAD: 10,
    /** Allowed file extensions */
    ALLOWED_EXTENSIONS: ['.pdf', '.jpg', '.jpeg', '.png', '.xlsx', '.csv'],
  },

  /**
   * Vendor and purchasing rules
   */
  VENDOR: {
    /** Default payment terms in days */
    DEFAULT_PAYMENT_TERMS_DAYS: 30,
    /** Maximum payment terms in days */
    MAX_PAYMENT_TERMS_DAYS: 180,
  },

  /**
   * Inventory rules
   */
  INVENTORY: {
    /** Low stock warning threshold percentage */
    LOW_STOCK_THRESHOLD_PERCENTAGE: 20,
    /** Maximum quantity for single transaction */
    MAX_TRANSACTION_QUANTITY: 1000000,
    /** Stock count variance threshold for alerts */
    VARIANCE_ALERT_THRESHOLD_PERCENTAGE: 5,
  },

  /**
   * Financial reporting rules
   */
  REPORTING: {
    /** Maximum date range for reports in days */
    MAX_DATE_RANGE_DAYS: 365,
    /** Financial year start month (1-12) */
    FISCAL_YEAR_START_MONTH: 1,
  },
} as const;

/**
 * Helper type to extract configuration values
 */
export type BusinessRules = typeof BUSINESS_RULES;

/**
 * Helper function to get a business rule with type safety
 */
export function getBusinessRule<K extends keyof BusinessRules>(
  category: K
): BusinessRules[K] {
  return BUSINESS_RULES[category];
}

/**
 * Helper function to check if a value is within business rule limits
 */
export function isWithinLimit(
  value: number,
  min: number,
  max: number
): boolean {
  return value >= min && value <= max;
}

/**
 * Calculate days between two dates
 */
export function daysBetween(start: Date, end: Date): number {
  const MS_PER_DAY = 1000 * 60 * 60 * 24;
  return Math.floor((end.getTime() - start.getTime()) / MS_PER_DAY);
}

/**
 * Add days to a date
 */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Add minutes to a date
 */
export function addMinutes(date: Date, minutes: number): Date {
  const result = new Date(date);
  result.setMinutes(result.getMinutes() + minutes);
  return result;
}