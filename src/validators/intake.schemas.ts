import { z } from 'zod';

// Honeypot validation (must be empty)
const honeypotSchema = z.string().length(0, 'Invalid field');

// Common timestamp validation
const timestampSchema = z.number().positive().refine(
  (ts) => {
    const now = Date.now();
    const diff = Math.abs(now - ts);
    return diff < 300000; // Within 5 minutes
  },
  'Invalid timestamp'
);

// Disposable email domains (partial list)
const DISPOSABLE_DOMAINS = [
  'tempmail.com', '10minutemail.com', 'guerrillamail.com',
  'mailinator.com', 'throwaway.email', 'temp-mail.org'
];

// Email validation with disposable check
const emailWithDisposableCheck = z.string()
  .email('Invalid email format')
  .min(5, 'Email too short')
  .max(255, 'Email too long')
  .refine(
    (email) => {
      const domain = email.split('@')[1]?.toLowerCase();
      return domain && !DISPOSABLE_DOMAINS.includes(domain);
    },
    'Disposable email addresses are not allowed'
  );

// Phone validation (North American format)
const phoneSchema = z.string()
  .regex(
    /^\+?1?[-.\s]?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})$/,
    'Invalid phone format. Expected: +1-416-555-0123 or (416) 555-0123'
  );

// Canadian postal code validation
const postalCodeSchema = z.string()
  .regex(
    /^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/,
    'Invalid postal code format. Expected: A1A 1A1'
  )
  .transform(val => val.toUpperCase());

/**
 * Step 1: Initialize Session (Email Capture)
 */
export const initializeSchema = z.object({
  email: emailWithDisposableCheck,
  honeypot_field_name: honeypotSchema,
  timestamp: timestampSchema
});

/**
 * Step 2: Profile Type Selection
 */
export const profileTypeSchema = z.object({
  step: z.literal('PROFILE_TYPE'),
  data: z.object({
    profileType: z.enum(['RESIDENTIAL', 'COMMERCIAL'])
  }),
  honeypot_field_name: honeypotSchema,
  clientTimestamp: timestampSchema
});

/**
 * Step 3: Profile Details (Residential)
 */
export const residentialProfileSchema = z.object({
  step: z.literal('PROFILE_DETAILS'),
  data: z.object({
    profileType: z.literal('RESIDENTIAL'),
    firstName: z.string()
      .min(1, 'First name required')
      .max(50, 'First name too long')
      .regex(/^[a-zA-Z\s'-]+$/, 'Invalid characters in first name'),
    lastName: z.string()
      .min(1, 'Last name required')
      .max(50, 'Last name too long')
      .regex(/^[a-zA-Z\s'-]+$/, 'Invalid characters in last name'),
    phone: phoneSchema,
    addressLine1: z.string().min(5, 'Address too short').max(100, 'Address too long'),
    addressLine2: z.string().max(100, 'Address line 2 too long').optional(),
    city: z.string().min(2, 'City required').max(50, 'City name too long'),
    province: z.string().length(2, 'Invalid province code'),
    postalCode: postalCodeSchema,
    country: z.string().length(2).default('CA')
  }),
  honeypot_field_name: honeypotSchema,
  clientTimestamp: timestampSchema
});

/**
 * Step 3: Profile Details (Commercial)
 */
export const commercialProfileSchema = z.object({
  step: z.literal('PROFILE_DETAILS'),
  data: z.object({
    profileType: z.literal('COMMERCIAL'),
    businessName: z.string().min(2, 'Business name required').max(100, 'Business name too long'),
    contactName: z.string().min(2, 'Contact name required').max(100, 'Contact name too long'),
    businessPhone: phoneSchema,
    addressLine1: z.string().min(5, 'Address too short').max(100, 'Address too long'),
    addressLine2: z.string().max(100, 'Address line 2 too long').optional(),
    city: z.string().min(2, 'City required').max(50, 'City name too long'),
    province: z.string().length(2, 'Invalid province code'),
    postalCode: postalCodeSchema,
    country: z.string().length(2).default('CA')
  }),
  honeypot_field_name: honeypotSchema,
  clientTimestamp: timestampSchema
});

/**
 * Step 4: Service Category
 */
export const serviceCategorySchema = z.object({
  step: z.literal('SERVICE_CATEGORY'),
  data: z.object({
    category: z.enum(['HVAC', 'PLUMBING', 'ELECTRICAL', 'GENERAL']),
    subcategory: z.string().max(50).optional()
  }),
  honeypot_field_name: honeypotSchema,
  clientTimestamp: timestampSchema
});

/**
 * Step 5: Service Details
 */
export const serviceDetailsSchema = z.object({
  step: z.literal('SERVICE_DETAILS'),
  data: z.object({
    serviceType: z.enum(['REPAIR', 'INSTALLATION', 'MAINTENANCE', 'CONSULTATION']),
    urgency: z.enum(['EMERGENCY', 'URGENT', 'ROUTINE', 'SCHEDULED']),
    description: z.string()
      .min(10, 'Please provide more detail (minimum 10 characters)')
      .max(2000, 'Description too long (maximum 2000 characters)'),
    preferredDate: z.string().datetime().optional()
  }),
  honeypot_field_name: honeypotSchema,
  clientTimestamp: timestampSchema
});

/**
 * Step 6: Additional Information
 */
export const additionalInfoSchema = z.object({
  step: z.literal('ADDITIONAL_INFO'),
  data: z.object({
    estimatedBudget: z.enum(['UNDER_1000', '1000_5000', '5000_10000', '10000_PLUS', 'UNSURE']).optional(),
    propertyType: z.enum(['RESIDENTIAL', 'COMMERCIAL', 'INDUSTRIAL']).optional(),
    accessInstructions: z.string().max(500, 'Instructions too long').optional(),
    notes: z.string().max(1000, 'Notes too long').optional(),
    referralSource: z.string().max(100).optional(),
    // Service location (if different from customer address)
    serviceAddressLine1: z.string().max(100).optional(),
    serviceAddressLine2: z.string().max(100).optional(),
    serviceCity: z.string().max(50).optional(),
    serviceProvince: z.string().length(2).optional(),
    servicePostalCode: postalCodeSchema.optional(),
    serviceCountry: z.string().length(2).optional()
  }),
  honeypot_field_name: honeypotSchema,
  clientTimestamp: timestampSchema
});

/**
 * Step 7: Review (no additional data, just transition)
 */
export const reviewSchema = z.object({
  step: z.literal('REVIEW'),
  data: z.object({}),
  honeypot_field_name: honeypotSchema,
  clientTimestamp: timestampSchema
});

/**
 * Step 8: Final Submission
 */
export const submitSchema = z.object({
  privacyPolicyAccepted: z.literal(true, {
    errorMap: () => ({ message: 'You must accept the privacy policy' })
  }),
  termsAccepted: z.literal(true, {
    errorMap: () => ({ message: 'You must accept the terms of service' })
  }),
  marketingConsent: z.boolean().default(false)
});

/**
 * Generic step update schema (discriminated union)
 */
export const stepUpdateSchema = z.discriminatedUnion('step', [
  profileTypeSchema,
  residentialProfileSchema,
  commercialProfileSchema,
  serviceCategorySchema,
  serviceDetailsSchema,
  additionalInfoSchema,
  reviewSchema
]);

// Export types
export type InitializeInput = z.infer<typeof initializeSchema>;
export type ProfileTypeInput = z.infer<typeof profileTypeSchema>;
export type ResidentialProfileInput = z.infer<typeof residentialProfileSchema>;
export type CommercialProfileInput = z.infer<typeof commercialProfileSchema>;
export type ServiceCategoryInput = z.infer<typeof serviceCategorySchema>;
export type ServiceDetailsInput = z.infer<typeof serviceDetailsSchema>;
export type AdditionalInfoInput = z.infer<typeof additionalInfoSchema>;
export type ReviewInput = z.infer<typeof reviewSchema>;
export type SubmitInput = z.infer<typeof submitSchema>;
export type StepUpdateInput = z.infer<typeof stepUpdateSchema>;