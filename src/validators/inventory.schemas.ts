import { z } from 'zod';
import {
  uuidSchema,
  currencyAmountSchema,
  shortTextSchema,
  longTextSchema,
  codeSchema,
  metadataSchema,
} from './common.schemas';

// Inventory item type enum
export const inventoryItemTypeSchema = z.enum([
  'PRODUCT',
  'SERVICE',
  'RAW_MATERIAL',
  'FINISHED_GOODS',
  'WORK_IN_PROGRESS',
  'SUPPLIES',
  'TOOL',
  'EQUIPMENT',
  'OTHER',
]);

// Inventory tracking method enum
export const trackingMethodSchema = z.enum([
  'FIFO',
  'LIFO',
  'WEIGHTED_AVERAGE',
  'SPECIFIC_IDENTIFICATION',
]);

// Inventory status enum
export const inventoryStatusSchema = z.enum([
  'ACTIVE',
  'INACTIVE',
  'DISCONTINUED',
  'OUT_OF_STOCK',
  'LOW_STOCK',
]);

// Unit of measure enum
export const unitOfMeasureSchema = z.enum([
  'UNIT',
  'EACH',
  'PIECE',
  'BOX',
  'CASE',
  'DOZEN',
  'POUND',
  'KILOGRAM',
  'OUNCE',
  'GRAM',
  'LITER',
  'MILLILITER',
  'GALLON',
  'QUART',
  'PINT',
  'CUP',
  'METER',
  'CENTIMETER',
  'FOOT',
  'INCH',
  'SQUARE_FOOT',
  'SQUARE_METER',
  'HOUR',
  'DAY',
  'MONTH',
  'YEAR',
]);

// Create inventory item schema
export const createInventoryItemSchema = z.object({
  itemCode: codeSchema,
  name: shortTextSchema,
  description: longTextSchema,
  itemType: inventoryItemTypeSchema,
  trackingMethod: trackingMethodSchema.default('FIFO'),
  unitOfMeasure: unitOfMeasureSchema.default('UNIT'),
  status: inventoryStatusSchema.default('ACTIVE'),
  sku: z.string().max(50).optional(),
  barcode: z.string().max(100).optional(),
  categoryId: uuidSchema.optional(),
  vendorId: uuidSchema.optional(),
  assetAccountId: uuidSchema.optional(),
  cogsAccountId: uuidSchema.optional(),
  revenueAccountId: uuidSchema.optional(),
  quantityOnHand: z.number().min(0).default(0),
  reorderPoint: z.number().min(0).optional(),
  reorderQuantity: z.number().min(0).optional(),
  unitCost: currencyAmountSchema.default(0),
  unitPrice: currencyAmountSchema.default(0),
  weight: z.number().min(0).optional(),
  weightUnit: z.enum(['KG', 'LB', 'G', 'OZ']).optional(),
  dimensions: z.object({
    length: z.number().min(0),
    width: z.number().min(0),
    height: z.number().min(0),
    unit: z.enum(['CM', 'IN', 'M', 'FT']),
  }).optional(),
  isTracked: z.boolean().default(true),
  isSerialized: z.boolean().default(false),
  isBatchTracked: z.boolean().default(false),
  isTaxable: z.boolean().default(true),
  taxRateId: uuidSchema.optional(),
  notes: longTextSchema,
  metadata: metadataSchema,
});

// Update inventory item schema
export const updateInventoryItemSchema = z.object({
  itemCode: codeSchema.optional(),
  name: shortTextSchema.optional(),
  description: longTextSchema.optional(),
  itemType: inventoryItemTypeSchema.optional(),
  trackingMethod: trackingMethodSchema.optional(),
  unitOfMeasure: unitOfMeasureSchema.optional(),
  status: inventoryStatusSchema.optional(),
  sku: z.string().max(50).optional(),
  barcode: z.string().max(100).optional(),
  categoryId: uuidSchema.optional(),
  vendorId: uuidSchema.optional(),
  assetAccountId: uuidSchema.optional(),
  cogsAccountId: uuidSchema.optional(),
  revenueAccountId: uuidSchema.optional(),
  reorderPoint: z.number().min(0).optional(),
  reorderQuantity: z.number().min(0).optional(),
  unitCost: currencyAmountSchema.optional(),
  unitPrice: currencyAmountSchema.optional(),
  weight: z.number().min(0).optional(),
  weightUnit: z.enum(['KG', 'LB', 'G', 'OZ']).optional(),
  dimensions: z.object({
    length: z.number().min(0),
    width: z.number().min(0),
    height: z.number().min(0),
    unit: z.enum(['CM', 'IN', 'M', 'FT']),
  }).optional(),
  isTracked: z.boolean().optional(),
  isSerialized: z.boolean().optional(),
  isBatchTracked: z.boolean().optional(),
  isTaxable: z.boolean().optional(),
  taxRateId: uuidSchema.optional(),
  notes: longTextSchema.optional(),
  metadata: metadataSchema,
});

// Adjust quantity schema
export const adjustQuantitySchema = z.object({
  quantity: z.number().int(),
  reason: z.enum([
    'PURCHASE',
    'SALE',
    'RETURN',
    'DAMAGE',
    'LOSS',
    'THEFT',
    'EXPIRED',
    'DONATION',
    'TRANSFER',
    'COUNT_ADJUSTMENT',
    'MANUFACTURING',
    'OTHER',
  ]),
  referenceNumber: z.string().max(100).optional(),
  notes: longTextSchema,
  unitCost: currencyAmountSchema.optional(),
});

// Transfer inventory schema
export const transferInventorySchema = z.object({
  fromLocationId: uuidSchema,
  toLocationId: uuidSchema,
  quantity: z.number().positive(),
  referenceNumber: z.string().max(100).optional(),
  notes: longTextSchema,
});

// Get inventory items filters schema
export const getInventoryItemsFiltersSchema = z.object({
  itemType: inventoryItemTypeSchema.optional(),
  status: inventoryStatusSchema.optional(),
  categoryId: uuidSchema.optional(),
  vendorId: uuidSchema.optional(),
  lowStock: z.boolean().optional(),
  outOfStock: z.boolean().optional(),
  search: z.string().max(100).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(),
});

// Inventory item ID param schema
export const inventoryItemIdParamSchema = z.object({
  itemId: uuidSchema,
  organizationId: uuidSchema,
});

// Type exports
export type InventoryItemType = z.infer<typeof inventoryItemTypeSchema>;
export type TrackingMethod = z.infer<typeof trackingMethodSchema>;
export type InventoryStatus = z.infer<typeof inventoryStatusSchema>;
export type UnitOfMeasure = z.infer<typeof unitOfMeasureSchema>;
export type CreateInventoryItemInput = z.infer<typeof createInventoryItemSchema>;
export type UpdateInventoryItemInput = z.infer<typeof updateInventoryItemSchema>;
export type AdjustQuantityInput = z.infer<typeof adjustQuantitySchema>;
export type TransferInventoryInput = z.infer<typeof transferInventorySchema>;
export type GetInventoryItemsFilters = z.infer<typeof getInventoryItemsFiltersSchema>;
export type InventoryItemIdParam = z.infer<typeof inventoryItemIdParamSchema>;