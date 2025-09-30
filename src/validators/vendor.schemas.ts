import { z } from 'zod';
import {
  uuidSchema,
  emailSchema,
  phoneSchema,
  websiteSchema,
  shortTextSchema,
  longTextSchema,
  currencyCodeSchema,
  addressSchema,
  taxIdSchema,
  businessNumberSchema,
  metadataSchema,
} from './common.schemas';

// Vendor status enum
export const vendorStatusSchema = z.enum([
  'ACTIVE',
  'INACTIVE',
  'SUSPENDED',
  'BLOCKED',
]);

// Vendor type enum
export const vendorTypeSchema = z.enum([
  'SUPPLIER',
  'SERVICE_PROVIDER',
  'CONTRACTOR',
  'MANUFACTURER',
  'WHOLESALER',
  'RETAILER',
  'FREELANCER',
  'OTHER',
]);

// Payment terms schema
export const paymentTermsSchema = z.object({
  netDays: z.number().int().min(0).max(365).default(30),
  discountPercent: z.number().min(0).max(100).multipleOf(0.01).optional(),
  discountDays: z.number().int().min(0).max(365).optional(),
  lateFeeDays: z.number().int().min(0).max(365).optional(),
  lateFeePercent: z.number().min(0).max(100).multipleOf(0.01).optional(),
});

// Create vendor schema
export const createVendorSchema = z.object({
  name: shortTextSchema,
  vendorType: vendorTypeSchema,
  email: emailSchema.optional(),
  phone: phoneSchema,
  website: websiteSchema,
  businessNumber: businessNumberSchema.optional(),
  taxId: taxIdSchema.optional(),
  status: vendorStatusSchema.default('ACTIVE'),
  currency: currencyCodeSchema.default('CAD'),
  paymentTerms: paymentTermsSchema.optional(),
  accountNumber: z.string().max(50).optional(),
  bankDetails: z.string().max(500).optional(),
  notes: longTextSchema,
  metadata: metadataSchema,
  addresses: z.array(addressSchema).optional(),
});

// Update vendor schema
export const updateVendorSchema = z.object({
  name: shortTextSchema.optional(),
  vendorType: vendorTypeSchema.optional(),
  email: emailSchema.optional(),
  phone: phoneSchema.optional(),
  website: websiteSchema.optional(),
  businessNumber: businessNumberSchema.optional(),
  taxId: taxIdSchema.optional(),
  status: vendorStatusSchema.optional(),
  currency: currencyCodeSchema.optional(),
  paymentTerms: paymentTermsSchema.optional(),
  accountNumber: z.string().max(50).optional(),
  bankDetails: z.string().max(500).optional(),
  notes: longTextSchema.optional(),
  metadata: metadataSchema,
});

// Get vendors filters schema
export const getVendorsFiltersSchema = z.object({
  status: vendorStatusSchema.optional(),
  vendorType: vendorTypeSchema.optional(),
  search: z.string().max(100).optional(),
  currency: currencyCodeSchema.optional(),
  limit: z.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(),
});

// Vendor ID param schema
export const vendorIdParamSchema = z.object({
  vendorId: uuidSchema,
  organizationId: uuidSchema,
});

// Type exports
export type VendorStatus = z.infer<typeof vendorStatusSchema>;
export type VendorType = z.infer<typeof vendorTypeSchema>;
export type PaymentTerms = z.infer<typeof paymentTermsSchema>;
export type CreateVendorInput = z.infer<typeof createVendorSchema>;
export type UpdateVendorInput = z.infer<typeof updateVendorSchema>;
export type GetVendorsFilters = z.infer<typeof getVendorsFiltersSchema>;
export type VendorIdParam = z.infer<typeof vendorIdParamSchema>;