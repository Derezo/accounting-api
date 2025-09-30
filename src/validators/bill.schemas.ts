import { z } from 'zod';
import {
  uuidSchema,
  currencyAmountSchema,
  dateSchema,
  shortTextSchema,
  longTextSchema,
  currencyCodeSchema,
  metadataSchema,
} from './common.schemas';

// Bill status enum
export const billStatusSchema = z.enum([
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'PARTIALLY_PAID',
  'PAID',
  'OVERDUE',
  'CANCELLED',
  'DISPUTED',
]);

// Bill line item schema
export const billLineItemSchema = z.object({
  description: shortTextSchema,
  quantity: z.number().positive(),
  unitPrice: currencyAmountSchema,
  amount: currencyAmountSchema,
  accountId: uuidSchema,
  taxRateId: uuidSchema.optional(),
  inventoryItemId: uuidSchema.optional(),
  purchaseOrderLineItemId: uuidSchema.optional(),
});

// Create bill schema
export const createBillSchema = z.object({
  vendorId: uuidSchema,
  billNumber: z.string().max(50).optional(),
  purchaseOrderId: uuidSchema.optional(),
  billDate: dateSchema,
  dueDate: dateSchema,
  currency: currencyCodeSchema.default('CAD'),
  subtotal: currencyAmountSchema,
  taxAmount: currencyAmountSchema.default(0),
  totalAmount: currencyAmountSchema,
  amountPaid: currencyAmountSchema.default(0),
  status: billStatusSchema.default('DRAFT'),
  notes: longTextSchema,
  terms: longTextSchema,
  metadata: metadataSchema,
  lineItems: z.array(billLineItemSchema).min(1, 'At least one line item required'),
}).refine((data) => data.dueDate >= data.billDate, {
  message: 'Due date must be on or after bill date',
  path: ['dueDate'],
}).refine((data) => data.totalAmount >= data.subtotal, {
  message: 'Total amount must be greater than or equal to subtotal',
  path: ['totalAmount'],
});

// Update bill schema
export const updateBillSchema = z.object({
  vendorId: uuidSchema.optional(),
  billNumber: z.string().max(50).optional(),
  billDate: dateSchema.optional(),
  dueDate: dateSchema.optional(),
  currency: currencyCodeSchema.optional(),
  subtotal: currencyAmountSchema.optional(),
  taxAmount: currencyAmountSchema.optional(),
  totalAmount: currencyAmountSchema.optional(),
  status: billStatusSchema.optional(),
  notes: longTextSchema.optional(),
  terms: longTextSchema.optional(),
  metadata: metadataSchema,
  lineItems: z.array(billLineItemSchema).optional(),
});

// Record payment schema
export const recordBillPaymentSchema = z.object({
  amount: currencyAmountSchema.positive('Payment amount must be positive'),
  paymentDate: dateSchema.optional().default(() => new Date()),
  paymentMethod: z.string().max(50).optional(),
  referenceNumber: z.string().max(100).optional(),
  notes: longTextSchema,
});

// Get bills filters schema
export const getBillsFiltersSchema = z.object({
  vendorId: uuidSchema.optional(),
  purchaseOrderId: uuidSchema.optional(),
  status: billStatusSchema.optional(),
  dueDateFrom: dateSchema.optional(),
  dueDateTo: dateSchema.optional(),
  overdue: z.boolean().optional(),
  search: z.string().max(100).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(),
});

// Bill ID param schema
export const billIdParamSchema = z.object({
  billId: uuidSchema,
  organizationId: uuidSchema,
});

// Type exports
export type BillStatus = z.infer<typeof billStatusSchema>;
export type BillLineItem = z.infer<typeof billLineItemSchema>;
export type CreateBillInput = z.infer<typeof createBillSchema>;
export type UpdateBillInput = z.infer<typeof updateBillSchema>;
export type RecordBillPaymentInput = z.infer<typeof recordBillPaymentSchema>;
export type GetBillsFilters = z.infer<typeof getBillsFiltersSchema>;
export type BillIdParam = z.infer<typeof billIdParamSchema>;