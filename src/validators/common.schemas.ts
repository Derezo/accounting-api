import { z } from 'zod';

// Common field validations
export const uuidSchema = z
  .string()
  .uuid('Invalid UUID format');

export const positiveIntegerSchema = z
  .number()
  .int('Must be an integer')
  .positive('Must be a positive number');

export const nonNegativeIntegerSchema = z
  .number()
  .int('Must be an integer')
  .min(0, 'Must be non-negative');

export const positiveDecimalSchema = z
  .number()
  .positive('Must be a positive number')
  .multipleOf(0.01, 'Must have at most 2 decimal places');

export const nonNegativeDecimalSchema = z
  .number()
  .min(0, 'Must be non-negative')
  .multipleOf(0.01, 'Must have at most 2 decimal places');

export const currencyAmountSchema = z
  .number()
  .min(0, 'Amount must be non-negative')
  .max(999999999.99, 'Amount exceeds maximum allowed value')
  .multipleOf(0.01, 'Amount must have at most 2 decimal places');

export const percentageSchema = z
  .number()
  .min(0, 'Percentage must be non-negative')
  .max(100, 'Percentage cannot exceed 100%')
  .multipleOf(0.01, 'Percentage must have at most 2 decimal places');

export const phoneSchema = z
  .string()
  .regex(
    /^[\+]?[1-9][\d]{0,15}$/,
    'Invalid phone number format'
  )
  .optional()
  .or(z.literal(''));

export const emailSchema = z
  .string()
  .email('Invalid email format')
  .min(5, 'Email must be at least 5 characters')
  .max(255, 'Email must not exceed 255 characters')
  .transform(val => val.toLowerCase().trim());

export const websiteSchema = z
  .string()
  .url('Invalid website URL')
  .max(255, 'Website URL must not exceed 255 characters')
  .optional()
  .or(z.literal(''));

export const postalCodeSchema = z
  .string()
  .regex(
    /^[A-Za-z0-9\s\-]{3,12}$/,
    'Invalid postal code format'
  )
  .transform(val => val.toUpperCase().trim());

// Date and time schemas
export const dateSchema = z
  .string()
  .datetime('Invalid date format')
  .or(z.date())
  .transform((val) => val instanceof Date ? val : new Date(val));

export const futureDateSchema = z
  .string()
  .datetime('Invalid date format')
  .or(z.date())
  .transform((val) => val instanceof Date ? val : new Date(val))
  .refine((date) => date > new Date(), {
    message: 'Date must be in the future'
  });

export const pastDateSchema = z
  .string()
  .datetime('Invalid date format')
  .or(z.date())
  .transform((val) => val instanceof Date ? val : new Date(val))
  .refine((date) => date <= new Date(), {
    message: 'Date cannot be in the future'
  });

// Text field schemas
export const shortTextSchema = z
  .string()
  .min(1, 'Field is required')
  .max(100, 'Text must not exceed 100 characters')
  .transform(val => val.trim());

export const mediumTextSchema = z
  .string()
  .min(1, 'Field is required')
  .max(500, 'Text must not exceed 500 characters')
  .transform(val => val.trim());

export const longTextSchema = z
  .string()
  .max(2000, 'Text must not exceed 2000 characters')
  .transform(val => val.trim())
  .optional();

export const nameSchema = z
  .string()
  .min(1, 'Name is required')
  .max(100, 'Name must not exceed 100 characters')
  .regex(/^[a-zA-Z\s\-'\.]+$/, 'Name can only contain letters, spaces, hyphens, apostrophes, and periods')
  .transform(val => val.trim());

export const codeSchema = z
  .string()
  .min(1, 'Code is required')
  .max(50, 'Code must not exceed 50 characters')
  .transform(val => val.toUpperCase().trim())
  .pipe(z.string().regex(/^[A-Z0-9_\-]+$/, 'Code can only contain uppercase letters, numbers, underscores, and hyphens'));

export const slugSchema = z
  .string()
  .min(1, 'Slug is required')
  .max(100, 'Slug must not exceed 100 characters')
  .transform(val => val.toLowerCase().trim())
  .pipe(z.string().regex(/^[a-z0-9\-]+$/, 'Slug can only contain lowercase letters, numbers, and hyphens'));

// Currency and country schemas
export const currencyCodeSchema = z
  .enum(['CAD', 'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CHF', 'CNY', 'SEK', 'NOK', 'MXN', 'NZD', 'SGD', 'HKD', 'KRW', 'PLN', 'CZK', 'HUF', 'RON', 'BGN', 'TRY', 'BRL', 'INR', 'RUB', 'ZAR', 'THB', 'IDR', 'MYR', 'PHP', 'VND'])
  .default('CAD');

export const countryCodeSchema = z
  .string()
  .length(2, 'Country code must be exactly 2 characters')
  .regex(/^[A-Z]{2}$/, 'Country code must be uppercase letters')
  .transform(val => val.toUpperCase());

export const provinceStateSchema = z
  .string()
  .min(2, 'Province/State must be at least 2 characters')
  .max(50, 'Province/State must not exceed 50 characters')
  .transform(val => val.trim());

// Business and tax schemas
export const businessNumberSchema = z
  .string()
  .regex(/^[0-9]{9}$|^[0-9]{15}$/, 'Business number must be 9 or 15 digits')
  .transform(val => val.replace(/\s+/g, ''));

export const taxIdSchema = z
  .string()
  .min(5, 'Tax ID must be at least 5 characters')
  .max(20, 'Tax ID must not exceed 20 characters')
  .regex(/^[A-Z0-9\-]+$/, 'Tax ID can only contain uppercase letters, numbers, and hyphens')
  .transform(val => val.toUpperCase().replace(/\s+/g, ''));

export const ssnSchema = z
  .string()
  .regex(/^\d{3}-?\d{2}-?\d{4}$/, 'Invalid SSN format')
  .transform(val => val.replace(/-/g, ''));

// Address schemas
export const addressSchema = z.object({
  type: z.enum(['BILLING', 'SHIPPING', 'BUSINESS', 'HOME', 'OTHER']).default('BILLING'),
  street: z.string().min(1, 'Street address is required').max(255, 'Street address must not exceed 255 characters'),
  street2: z.string().max(255, 'Address line 2 must not exceed 255 characters').optional().or(z.literal('')),
  city: z.string().min(1, 'City is required').max(100, 'City must not exceed 100 characters'),
  provinceState: provinceStateSchema,
  postalCode: postalCodeSchema,
  country: countryCodeSchema.default('CA'),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true)
});

// Contact information schema
export const contactInfoSchema = z.object({
  email: emailSchema.optional(),
  phone: phoneSchema,
  website: websiteSchema,
  fax: phoneSchema,
  mobile: phoneSchema
});

// Pagination schemas
export const paginationSchema = z.object({
  page: positiveIntegerSchema.min(1, 'Page must be at least 1').default(1),
  limit: positiveIntegerSchema.min(1, 'Limit must be at least 1').max(100, 'Limit cannot exceed 100').default(20),
  sortBy: z.string().max(50, 'Sort field must not exceed 50 characters').optional(),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
  search: z.string().max(100, 'Search term must not exceed 100 characters').optional()
});

export const dateRangeSchema = z.object({
  startDate: dateSchema.optional(),
  endDate: dateSchema.optional()
}).refine(
  (data) => !data.startDate || !data.endDate || data.startDate <= data.endDate,
  {
    message: 'End date must be after start date',
    path: ['endDate']
  }
);

// File upload schemas
export const fileUploadSchema = z.object({
  filename: z.string().min(1, 'Filename is required').max(255, 'Filename must not exceed 255 characters'),
  mimetype: z.string().min(1, 'MIME type is required'),
  size: positiveIntegerSchema.max(10 * 1024 * 1024, 'File size cannot exceed 10MB'),
  buffer: z.instanceof(Buffer).optional(),
  path: z.string().optional()
});

export const imageUploadSchema = fileUploadSchema.extend({
  mimetype: z.enum(['image/jpeg', 'image/png', 'image/gif', 'image/webp'], {
    errorMap: () => ({ message: 'Only JPEG, PNG, GIF, and WebP images are allowed' })
  }),
  size: positiveIntegerSchema.max(5 * 1024 * 1024, 'Image size cannot exceed 5MB')
});

export const documentUploadSchema = fileUploadSchema.extend({
  mimetype: z.enum([
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/csv'
  ], {
    errorMap: () => ({ message: 'Only PDF, Word, Excel, and text documents are allowed' })
  }),
  size: positiveIntegerSchema.max(10 * 1024 * 1024, 'Document size cannot exceed 10MB')
});

// Common enum schemas
export const userRoleSchema = z.enum([
  'SUPER_ADMIN',
  'ADMIN',
  'MANAGER',
  'ACCOUNTANT',
  'EMPLOYEE',
  'VIEWER'
]);

export const customerStatusSchema = z.enum([
  'ACTIVE',
  'INACTIVE',
  'SUSPENDED',
  'ARCHIVED'
]);

export const customerTierSchema = z.enum([
  'PERSONAL',
  'SMALL_BUSINESS',
  'ENTERPRISE',
  'VIP'
]);

export const paymentStatusSchema = z.enum([
  'PENDING',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'REFUNDED',
  'PARTIALLY_REFUNDED'
]);

export const paymentMethodSchema = z.enum([
  'STRIPE_CARD',
  'STRIPE_BANK',
  'INTERAC_ETRANSFER',
  'CASH',
  'CHEQUE',
  'WIRE_TRANSFER',
  'PAYPAL',
  'OTHER'
]);

export const invoiceStatusSchema = z.enum([
  'DRAFT',
  'SENT',
  'VIEWED',
  'PARTIALLY_PAID',
  'PAID',
  'OVERDUE',
  'CANCELLED',
  'REFUNDED'
]);

export const quoteStatusSchema = z.enum([
  'DRAFT',
  'SENT',
  'VIEWED',
  'ACCEPTED',
  'DECLINED',
  'EXPIRED',
  'CANCELLED'
]);

export const projectStatusSchema = z.enum([
  'QUOTED',
  'APPROVED',
  'IN_PROGRESS',
  'ON_HOLD',
  'COMPLETED',
  'CANCELLED'
]);

// Metadata and custom fields schema
export const metadataSchema = z.record(
  z.string().max(100, 'Metadata key must not exceed 100 characters'),
  z.union([
    z.string().max(500, 'Metadata value must not exceed 500 characters'),
    z.number(),
    z.boolean(),
    z.null()
  ])
).optional();

export const customFieldSchema = z.object({
  name: z.string().min(1, 'Field name is required').max(100, 'Field name must not exceed 100 characters'),
  type: z.enum(['TEXT', 'NUMBER', 'BOOLEAN', 'DATE', 'EMAIL', 'URL', 'PHONE']),
  value: z.union([z.string(), z.number(), z.boolean(), z.date()]),
  required: z.boolean().default(false),
  validation: z.string().optional()
});

// API response schemas
export const successResponseSchema = z.object({
  success: z.literal(true),
  data: z.any(),
  message: z.string().optional(),
  metadata: z.object({
    timestamp: z.date().default(() => new Date()),
    requestId: z.string().optional(),
    pagination: z.object({
      page: z.number(),
      limit: z.number(),
      total: z.number(),
      totalPages: z.number()
    }).optional()
  }).optional()
});

export const errorResponseSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  message: z.string().optional(),
  details: z.any().optional(),
  code: z.string().optional(),
  metadata: z.object({
    timestamp: z.date().default(() => new Date()),
    requestId: z.string().optional()
  }).optional()
});

// Type exports
export type Address = z.infer<typeof addressSchema>;
export type ContactInfo = z.infer<typeof contactInfoSchema>;
export type Pagination = z.infer<typeof paginationSchema>;
export type DateRange = z.infer<typeof dateRangeSchema>;
export type FileUpload = z.infer<typeof fileUploadSchema>;
export type ImageUpload = z.infer<typeof imageUploadSchema>;
export type DocumentUpload = z.infer<typeof documentUploadSchema>;
export type CustomField = z.infer<typeof customFieldSchema>;
export type SuccessResponse = z.infer<typeof successResponseSchema>;
export type ErrorResponse = z.infer<typeof errorResponseSchema>;