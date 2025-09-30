import { z } from 'zod';
import {
  uuidSchema,
  currencyAmountSchema,
  dateSchema,
  shortTextSchema,
  longTextSchema,
  currencyCodeSchema,
  metadataSchema,
  addressSchema,
} from './common.schemas';

// Purchase order status enum
export const purchaseOrderStatusSchema = z.enum([
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'SENT',
  'ACKNOWLEDGED',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'CLOSED',
  'CANCELLED',
]);

// Purchase order priority enum
export const purchaseOrderPrioritySchema = z.enum([
  'LOW',
  'NORMAL',
  'HIGH',
  'URGENT',
]);

// PO line item schema
export const poLineItemSchema = z.object({
  inventoryItemId: uuidSchema,
  description: shortTextSchema,
  quantity: z.number().positive(),
  unitPrice: currencyAmountSchema,
  amount: currencyAmountSchema,
  taxRateId: uuidSchema.optional(),
  accountId: uuidSchema.optional(),
  quantityReceived: z.number().min(0).default(0),
  notes: longTextSchema,
});

// Create purchase order schema
export const createPurchaseOrderSchema = z.object({
  vendorId: uuidSchema,
  poNumber: z.string().max(50).optional(),
  orderDate: dateSchema,
  expectedDeliveryDate: dateSchema.optional(),
  currency: currencyCodeSchema.default('CAD'),
  subtotal: currencyAmountSchema,
  taxAmount: currencyAmountSchema.default(0),
  shippingCost: currencyAmountSchema.default(0),
  totalAmount: currencyAmountSchema,
  status: purchaseOrderStatusSchema.default('DRAFT'),
  priority: purchaseOrderPrioritySchema.default('NORMAL'),
  shippingAddress: addressSchema.optional(),
  billingAddress: addressSchema.optional(),
  terms: longTextSchema,
  notes: longTextSchema,
  internalNotes: longTextSchema,
  metadata: metadataSchema,
  lineItems: z.array(poLineItemSchema).min(1, 'At least one line item required'),
}).refine((data) => {
  if (data.expectedDeliveryDate) {
    return data.expectedDeliveryDate >= data.orderDate;
  }
  return true;
}, {
  message: 'Expected delivery date must be on or after order date',
  path: ['expectedDeliveryDate'],
}).refine((data) => data.totalAmount >= data.subtotal, {
  message: 'Total amount must be greater than or equal to subtotal',
  path: ['totalAmount'],
});

// Update purchase order schema
export const updatePurchaseOrderSchema = z.object({
  vendorId: uuidSchema.optional(),
  poNumber: z.string().max(50).optional(),
  orderDate: dateSchema.optional(),
  expectedDeliveryDate: dateSchema.optional(),
  currency: currencyCodeSchema.optional(),
  subtotal: currencyAmountSchema.optional(),
  taxAmount: currencyAmountSchema.optional(),
  shippingCost: currencyAmountSchema.optional(),
  totalAmount: currencyAmountSchema.optional(),
  status: purchaseOrderStatusSchema.optional(),
  priority: purchaseOrderPrioritySchema.optional(),
  shippingAddress: addressSchema.optional(),
  billingAddress: addressSchema.optional(),
  terms: longTextSchema.optional(),
  notes: longTextSchema.optional(),
  internalNotes: longTextSchema.optional(),
  metadata: metadataSchema,
  lineItems: z.array(poLineItemSchema).optional(),
});

// Receive items schema
export const receiveItemsSchema = z.object({
  receivedDate: dateSchema.optional().default(() => new Date()),
  items: z.array(z.object({
    lineItemId: uuidSchema,
    quantityReceived: z.number().positive(),
    notes: z.string().max(500).optional(),
  })).min(1, 'At least one item must be received'),
  notes: longTextSchema,
});

// Get purchase orders filters schema
export const getPurchaseOrdersFiltersSchema = z.object({
  vendorId: uuidSchema.optional(),
  status: purchaseOrderStatusSchema.optional(),
  priority: purchaseOrderPrioritySchema.optional(),
  orderDateFrom: dateSchema.optional(),
  orderDateTo: dateSchema.optional(),
  search: z.string().max(100).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(),
});

// Purchase order ID param schema
export const purchaseOrderIdParamSchema = z.object({
  purchaseOrderId: uuidSchema,
  organizationId: uuidSchema,
});

// Type exports
export type PurchaseOrderStatus = z.infer<typeof purchaseOrderStatusSchema>;
export type PurchaseOrderPriority = z.infer<typeof purchaseOrderPrioritySchema>;
export type POLineItem = z.infer<typeof poLineItemSchema>;
export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>;
export type UpdatePurchaseOrderInput = z.infer<typeof updatePurchaseOrderSchema>;
export type ReceiveItemsInput = z.infer<typeof receiveItemsSchema>;
export type GetPurchaseOrdersFilters = z.infer<typeof getPurchaseOrdersFiltersSchema>;
export type PurchaseOrderIdParam = z.infer<typeof purchaseOrderIdParamSchema>;