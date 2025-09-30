import { InventoryItem, InventoryTransaction, Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { NotFoundError, ValidationError, BusinessRuleError } from '../utils/errors';
import { logger } from '../utils/logger';
import { auditService } from './audit.service';
import Decimal from 'decimal.js';

export interface CreateInventoryItemInput {
  organizationId: string;
  productId: string;
  locationId?: string;
  quantityOnHand?: number;
  reorderPoint?: number;
  reorderQuantity?: number;
  maxQuantity?: number;
  averageCost?: number;
}

export interface UpdateInventoryItemInput {
  quantityOnHand?: number;
  reorderPoint?: number;
  reorderQuantity?: number;
  maxQuantity?: number;
  averageCost?: number;
  lastCost?: number;
}

export interface CreateInventoryTransactionInput {
  organizationId: string;
  inventoryItemId: string;
  type: 'RECEIPT' | 'SALE' | 'ADJUSTMENT' | 'TRANSFER' | 'RETURN';
  quantity: number;
  unitCost?: number;
  referenceType?: string;
  referenceId?: string;
  referenceNumber?: string;
  fromLocationId?: string;
  toLocationId?: string;
  reason?: string;
  notes?: string;
}

export interface InventoryFilters {
  productId?: string;
  locationId?: string;
  lowStock?: boolean;
  search?: string;
}

export interface TransactionFilters {
  inventoryItemId?: string;
  type?: string;
  dateFrom?: Date;
  dateTo?: Date;
  referenceType?: string;
}

export interface PaginationParams {
  limit?: number;
  cursor?: string;
}

type InventoryItemWithRelations = Prisma.InventoryItemGetPayload<{
  include: {
    product: true;
    location: true;
    transactions: true;
  };
}>;

type InventoryTransactionWithRelations = Prisma.InventoryTransactionGetPayload<{
  include: {
    inventoryItem: {
      include: {
        product: true;
        location: true;
      };
    };
    fromLocation: true;
  };
}>;

class InventoryService {
  /**
   * Create inventory item
   */
  async createInventoryItem(
    data: CreateInventoryItemInput,
    userId: string
  ): Promise<InventoryItem> {
    try {
      const item = await prisma.inventoryItem.create({
        data: {
          organizationId: data.organizationId,
          productId: data.productId,
          locationId: data.locationId || null,
          quantityOnHand: data.quantityOnHand || 0,
          quantityReserved: 0,
          quantityAvailable: data.quantityOnHand || 0,
          reorderPoint: data.reorderPoint,
          reorderQuantity: data.reorderQuantity,
          maxQuantity: data.maxQuantity,
          averageCost: data.averageCost,
        },
      });

      await auditService.logCreate(
        'InventoryItem',
        item.id,
        data as unknown as Record<string, unknown>,
        {
          organizationId: data.organizationId,
          userId,
        }
      );

      logger.info('Inventory item created', {
        itemId: item.id,
        organizationId: data.organizationId,
        userId,
      });

      return item;
    } catch (error) {
      logger.error('Error creating inventory item', error);
      throw error;
    }
  }

  /**
   * Create or get inventory item
   */
  async getOrCreateInventoryItem(
    organizationId: string,
    productId: string,
    locationId?: string
  ): Promise<InventoryItem> {
    // Try to find existing item
    const existingItem = await prisma.inventoryItem.findFirst({
      where: {
        organizationId,
        productId,
        locationId: locationId || null,
      },
    });

    if (existingItem) {
      return existingItem;
    }

    // Create new item
    return prisma.inventoryItem.create({
      data: {
        organizationId,
        productId,
        locationId: locationId || null,
        quantityOnHand: 0,
        quantityReserved: 0,
        quantityAvailable: 0,
      },
    });
  }

  /**
   * Get inventory item by ID
   */
  async getInventoryItemById(
    itemId: string,
    organizationId: string
  ): Promise<InventoryItemWithRelations> {
    const item = await prisma.inventoryItem.findFirst({
      where: {
        id: itemId,
        organizationId,
      },
      include: {
        product: true,
        location: true,
        transactions: {
          orderBy: {
            transactionDate: 'desc',
          },
          take: 10,
        },
      },
    });

    if (!item) {
      throw new NotFoundError('InventoryItem', itemId);
    }

    return item;
  }

  /**
   * Get all inventory items
   */
  async getInventoryItems(
    organizationId: string,
    filters: InventoryFilters = {},
    pagination: PaginationParams = {}
  ): Promise<{
    items: InventoryItemWithRelations[];
    hasMore: boolean;
    nextCursor?: string;
  }> {
    const limit = pagination.limit || 50;
    const where: any = {
      organizationId,
    };

    // Apply filters
    if (filters.productId) {
      where.productId = filters.productId;
    }

    if (filters.locationId) {
      where.locationId = filters.locationId;
    }

    if (filters.lowStock) {
      where.AND = [
        { quantityOnHand: { lte: prisma.inventoryItem.fields.reorderPoint } },
        { reorderPoint: { not: null } },
      ];
    }

    if (filters.search) {
      where.product = {
        OR: [
          { name: { contains: filters.search } },
          { sku: { contains: filters.search } },
        ],
      };
    }

    // Build query with pagination
    const query: any = {
      where,
      take: limit + 1,
      include: {
        product: true,
        location: true,
        transactions: {
          orderBy: {
            transactionDate: 'desc',
          },
          take: 5,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    };

    if (pagination.cursor) {
      query.cursor = {
        id: pagination.cursor,
      };
      query.skip = 1;
    }

    const items = await prisma.inventoryItem.findMany(query) as InventoryItemWithRelations[];

    const hasMore = items.length > limit;
    if (hasMore) {
      items.pop();
    }

    const nextCursor = hasMore ? items[items.length - 1].id : undefined;

    return {
      items,
      hasMore,
      nextCursor,
    };
  }

  /**
   * Update inventory item
   */
  async updateInventoryItem(
    itemId: string,
    organizationId: string,
    data: UpdateInventoryItemInput,
    userId: string
  ): Promise<InventoryItem> {
    try {
      // Verify item exists
      const existingItem = await this.getInventoryItemById(itemId, organizationId);

      const updateData: any = {
        updatedAt: new Date(),
      };

      if (data.quantityOnHand !== undefined) {
        const quantityOnHand = new Decimal(data.quantityOnHand);
        const quantityReserved = new Decimal(0); // Would need to calculate from orders
        updateData.quantityOnHand = quantityOnHand;
        updateData.quantityAvailable = quantityOnHand.sub(quantityReserved);
      }

      if (data.reorderPoint !== undefined) {
        updateData.reorderPoint = data.reorderPoint;
      }
      if (data.reorderQuantity !== undefined) {
        updateData.reorderQuantity = data.reorderQuantity;
      }
      if (data.maxQuantity !== undefined) {
        updateData.maxQuantity = data.maxQuantity;
      }
      if (data.averageCost !== undefined) {
        updateData.averageCost = data.averageCost;
      }
      if (data.lastCost !== undefined) {
        updateData.lastCost = data.lastCost;
      }

      const item = await prisma.inventoryItem.update({
        where: { id: itemId },
        data: updateData,
      });

      // Audit log
      await auditService.logUpdate(
        'InventoryItem',
        itemId,
        existingItem as unknown as Record<string, unknown>,
        data as unknown as Record<string, unknown>,
        {
          organizationId,
          userId,
        }
      );

      logger.info('Inventory item updated', {
        itemId,
        organizationId,
        userId,
      });

      return item;
    } catch (error) {
      logger.error('Error updating inventory item', error);
      throw error;
    }
  }

  /**
   * Create inventory transaction
   */
  async createTransaction(
    data: CreateInventoryTransactionInput,
    userId: string
  ): Promise<InventoryTransactionWithRelations> {
    try {
      // Verify inventory item exists
      const item = await prisma.inventoryItem.findFirst({
        where: {
          id: data.inventoryItemId,
          organizationId: data.organizationId,
        },
      });

      if (!item) {
        throw new NotFoundError('InventoryItem', data.inventoryItemId);
      }

      // Validate transaction type
      const validTypes = ['RECEIPT', 'SALE', 'ADJUSTMENT', 'TRANSFER', 'RETURN'];
      if (!validTypes.includes(data.type)) {
        throw new ValidationError('Invalid transaction type');
      }

      // Validate quantity
      const quantity = new Decimal(data.quantity);
      if (quantity.isZero()) {
        throw new ValidationError('Transaction quantity cannot be zero');
      }

      // For SALE and some ADJUSTMENT types, quantity should be negative
      let adjustedQuantity = quantity;
      if (data.type === 'SALE') {
        adjustedQuantity = quantity.abs().neg();
      }

      // Check if we have enough inventory for negative transactions
      if (adjustedQuantity.isNegative()) {
        const currentQty = new Decimal(item.quantityOnHand);
        if (currentQty.add(adjustedQuantity).isNegative()) {
          throw new BusinessRuleError('Insufficient inventory quantity', 'INSUFFICIENT_INVENTORY');
        }
      }

      // Calculate cost if provided
      const unitCost = data.unitCost ? new Decimal(data.unitCost) : null;
      const totalCost = unitCost
        ? unitCost.mul(adjustedQuantity.abs())
        : null;

      // Create transaction and update inventory in a transaction
      const result = await prisma.$transaction(async (tx) => {
        // Create transaction record
        const transaction = await tx.inventoryTransaction.create({
          data: {
            organizationId: data.organizationId,
            inventoryItemId: data.inventoryItemId,
            type: data.type,
            quantity: adjustedQuantity,
            unitCost: unitCost || undefined,
            totalCost: totalCost || undefined,
            referenceType: data.referenceType,
            referenceId: data.referenceId,
            referenceNumber: data.referenceNumber,
            fromLocationId: data.fromLocationId,
            toLocationId: data.toLocationId,
            reason: data.reason,
            notes: data.notes,
            createdBy: userId,
            transactionDate: new Date(),
          },
          include: {
            inventoryItem: {
              include: {
                product: true,
                location: true,
              },
            },
            fromLocation: true,
          },
        });

        // Update inventory item quantity
        const newQuantity = new Decimal(item.quantityOnHand).add(
          adjustedQuantity
        );
        const quantityReserved = new Decimal(item.quantityReserved);
        const quantityAvailable = newQuantity.sub(quantityReserved);

        // Update average cost if unit cost provided and it's a receipt
        const updateData: any = {
          quantityOnHand: newQuantity,
          quantityAvailable,
          updatedAt: new Date(),
        };

        if (data.type === 'RECEIPT' && unitCost) {
          // Calculate new average cost
          const currentQty = new Decimal(item.quantityOnHand);
          const currentAvgCost = item.averageCost
            ? new Decimal(item.averageCost)
            : new Decimal(0);

          const currentValue = currentQty.mul(currentAvgCost);
          const newValue = adjustedQuantity.abs().mul(unitCost);
          const totalValue = currentValue.add(newValue);
          const totalQty = currentQty.add(adjustedQuantity);

          const newAvgCost = totalQty.isZero()
            ? new Decimal(0)
            : totalValue.div(totalQty);

          updateData.averageCost = newAvgCost;
          updateData.lastCost = unitCost;
          updateData.lastStockCount = new Date();
        }

        await tx.inventoryItem.update({
          where: { id: data.inventoryItemId },
          data: updateData,
        });

        return transaction;
      });

      // Audit log
      await auditService.logCreate(
        'InventoryTransaction',
        result.id,
        {
          type: data.type,
          quantity: adjustedQuantity.toString(),
          inventoryItemId: data.inventoryItemId,
        },
        {
          organizationId: data.organizationId,
          userId,
        }
      );

      logger.info('Inventory transaction created', {
        transactionId: result.id,
        organizationId: data.organizationId,
        userId,
      });

      return result;
    } catch (error) {
      logger.error('Error creating inventory transaction', error);
      throw error;
    }
  }

  /**
   * Get inventory transactions
   */
  async getTransactions(
    organizationId: string,
    filters: TransactionFilters = {},
    pagination: PaginationParams = {}
  ): Promise<{
    transactions: InventoryTransactionWithRelations[];
    hasMore: boolean;
    nextCursor?: string;
  }> {
    const limit = pagination.limit || 50;
    const where: any = {
      organizationId,
    };

    // Apply filters
    if (filters.inventoryItemId) {
      where.inventoryItemId = filters.inventoryItemId;
    }

    if (filters.type) {
      where.type = filters.type;
    }

    if (filters.dateFrom || filters.dateTo) {
      where.transactionDate = {};
      if (filters.dateFrom) {
        where.transactionDate.gte = filters.dateFrom;
      }
      if (filters.dateTo) {
        where.transactionDate.lte = filters.dateTo;
      }
    }

    if (filters.referenceType) {
      where.referenceType = filters.referenceType;
    }

    // Build query with pagination
    const query: any = {
      where,
      take: limit + 1,
      include: {
        inventoryItem: {
          include: {
            product: true,
            location: true,
          },
        },
        fromLocation: true,
      },
      orderBy: {
        transactionDate: 'desc',
      },
    };

    if (pagination.cursor) {
      query.cursor = {
        id: pagination.cursor,
      };
      query.skip = 1;
    }

    const transactions = await prisma.inventoryTransaction.findMany(query) as InventoryTransactionWithRelations[];

    const hasMore = transactions.length > limit;
    if (hasMore) {
      transactions.pop();
    }

    const nextCursor = hasMore
      ? transactions[transactions.length - 1].id
      : undefined;

    return {
      transactions,
      hasMore,
      nextCursor,
    };
  }

  /**
   * Get inventory valuation
   */
  async getInventoryValuation(
    organizationId: string,
    locationId?: string
  ): Promise<{
    totalItems: number;
    totalQuantity: number;
    totalValue: number;
    byProduct: Array<{
      productId: string;
      productName: string;
      quantity: number;
      averageCost: number;
      totalValue: number;
    }>;
  }> {
    const where: any = {
      organizationId,
    };

    if (locationId) {
      where.locationId = locationId;
    }

    const items = await prisma.inventoryItem.findMany({
      where,
      include: {
        product: true,
      },
    });

    const totalItems = items.length;
    let totalQuantity = 0;
    let totalValue = 0;

    const byProduct = items.map((item) => {
      const quantity = Number(item.quantityOnHand);
      const averageCost = Number(item.averageCost || 0);
      const itemValue = quantity * averageCost;

      totalQuantity += quantity;
      totalValue += itemValue;

      return {
        productId: item.productId,
        productName: item.product.name,
        quantity,
        averageCost,
        totalValue: itemValue,
      };
    });

    return {
      totalItems,
      totalQuantity,
      totalValue,
      byProduct: byProduct.sort((a, b) => b.totalValue - a.totalValue),
    };
  }

  /**
   * Get low stock items
   */
  async getLowStockItems(
    organizationId: string,
    locationId?: string
  ): Promise<InventoryItemWithRelations[]> {
    const where: any = {
      organizationId,
      reorderPoint: { not: null },
    };

    if (locationId) {
      where.locationId = locationId;
    }

    const items = await prisma.inventoryItem.findMany({
      where,
      include: {
        product: true,
        location: true,
        transactions: {
          orderBy: {
            transactionDate: 'desc' as const,
          },
          take: 5,
        },
      },
    }) as InventoryItemWithRelations[];

    // Filter items where quantity <= reorder point
    return items.filter((item) => {
      const qty = new Decimal(item.quantityOnHand);
      const reorderPt = item.reorderPoint ? new Decimal(item.reorderPoint) : null;
      return reorderPt && qty.lessThanOrEqualTo(reorderPt);
    });
  }

  /**
   * Perform stock count adjustment
   */
  async performStockCount(
    inventoryItemId: string,
    organizationId: string,
    countedQuantity: number,
    userId: string,
    notes?: string
  ): Promise<InventoryTransactionWithRelations> {
    const item = await this.getInventoryItemById(inventoryItemId, organizationId);

    const currentQty = new Decimal(item.quantityOnHand);
    const counted = new Decimal(countedQuantity);
    const difference = counted.sub(currentQty);

    if (difference.isZero()) {
      throw new BusinessRuleError('No adjustment needed - counted quantity matches system', 'NO_ADJUSTMENT_NEEDED');
    }

    // Create adjustment transaction
    return this.createTransaction(
      {
        organizationId,
        inventoryItemId,
        type: 'ADJUSTMENT',
        quantity: difference.toNumber(),
        reason: 'Stock count adjustment',
        notes: notes || `Stock count: System=${currentQty}, Counted=${counted}, Difference=${difference}`,
      },
      userId
    );
  }

  /**
   * Adjust inventory quantity
   */
  async adjustQuantity(
    itemId: string,
    organizationId: string,
    data: { quantity: number; reason?: string; notes?: string },
    userId: string
  ): Promise<InventoryTransactionWithRelations> {
    return this.createTransaction(
      {
        organizationId,
        inventoryItemId: itemId,
        type: 'ADJUSTMENT',
        quantity: data.quantity,
        reason: data.reason,
        notes: data.notes,
      },
      userId
    );
  }

  /**
   * Transfer inventory between locations
   */
  async transferInventory(
    itemId: string,
    organizationId: string,
    data: { toLocationId: string; quantity: number; notes?: string },
    userId: string
  ): Promise<InventoryTransactionWithRelations> {
    const item = await this.getInventoryItemById(itemId, organizationId);

    return this.createTransaction(
      {
        organizationId,
        inventoryItemId: itemId,
        type: 'TRANSFER',
        quantity: data.quantity,
        fromLocationId: item.locationId || undefined,
        toLocationId: data.toLocationId,
        notes: data.notes,
      },
      userId
    );
  }

  /**
   * Delete inventory item (hard delete - no soft delete in schema)
   */
  async deleteInventoryItem(
    itemId: string,
    organizationId: string,
    userId: string
  ): Promise<void> {
    const item = await this.getInventoryItemById(itemId, organizationId);

    // Delete all related transactions first
    await prisma.inventoryTransaction.deleteMany({
      where: { inventoryItemId: itemId },
    });

    // Delete the item
    await prisma.inventoryItem.delete({
      where: { id: itemId },
    });

    await auditService.logDelete(
      'InventoryItem',
      itemId,
      item as unknown as Record<string, unknown>,
      {
        organizationId,
        userId,
      }
    );

    logger.info('Inventory item deleted', {
      itemId,
      organizationId,
      userId,
    });
  }

  /**
   * Get inventory statistics
   */
  async getInventoryStats(organizationId: string): Promise<{
    totalItems: number;
    totalValue: number;
    lowStockCount: number;
    outOfStockCount: number;
  }> {
    const items = await prisma.inventoryItem.findMany({
      where: {
        organizationId,
      },
    });

    let totalValue = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;

    items.forEach((item) => {
      const qty = new Decimal(item.quantityOnHand);
      const avgCost = item.averageCost ? new Decimal(item.averageCost) : new Decimal(0);
      totalValue += qty.mul(avgCost).toNumber();

      if (qty.isZero()) {
        outOfStockCount++;
      } else if (item.reorderPoint) {
        const reorderPt = new Decimal(item.reorderPoint);
        if (qty.lessThanOrEqualTo(reorderPt)) {
          lowStockCount++;
        }
      }
    });

    return {
      totalItems: items.length,
      totalValue,
      lowStockCount,
      outOfStockCount,
    };
  }
}

export const inventoryService = new InventoryService();