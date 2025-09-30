import { PurchaseOrder, PurchaseOrderLineItem, Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { NotFoundError, ValidationError, BusinessRuleError } from '../utils/errors';
import { logger } from '../utils/logger';
import { auditService } from './audit.service';
import Decimal from 'decimal.js';

export interface CreatePurchaseOrderInput {
  organizationId: string;
  vendorId: string;
  orderDate?: Date;
  expectedDate?: Date;
  currency?: string;
  notes?: string;
  internalNotes?: string;
  terms?: string;
  lineItems: CreatePurchaseOrderLineItemInput[];
}

export interface CreatePurchaseOrderLineItemInput {
  productId?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate?: number;
}

export interface UpdatePurchaseOrderInput {
  vendorId?: string;
  status?: string;
  expectedDate?: Date;
  receivedDate?: Date;
  notes?: string;
  internalNotes?: string;
  terms?: string;
  lineItems?: UpdatePurchaseOrderLineItemInput[];
}

export interface UpdatePurchaseOrderLineItemInput {
  id?: string;
  productId?: string;
  description?: string;
  quantity?: number;
  unitPrice?: number;
  taxRate?: number;
  quantityReceived?: number;
}

export interface PurchaseOrderFilters {
  vendorId?: string;
  status?: string;
  dateFrom?: Date;
  dateTo?: Date;
  search?: string;
}

export interface PaginationParams {
  limit?: number;
  cursor?: string;
}

type PurchaseOrderWithRelations = Prisma.PurchaseOrderGetPayload<{
  include: {
    vendor: {
      include: {
        business: true;
      };
    };
    lineItems: {
      include: {
        product: true;
      };
    };
  };
}>;

class PurchaseOrderService {
  /**
   * Generate next PO number for organization
   */
  private async generatePONumber(organizationId: string): Promise<string> {
    const lastPO = await prisma.purchaseOrder.findFirst({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      select: { poNumber: true },
    });

    if (!lastPO) {
      return 'PO-00001';
    }

    const lastNumber = parseInt(lastPO.poNumber.split('-')[1]);
    const nextNumber = lastNumber + 1;
    return `PO-${nextNumber.toString().padStart(5, '0')}`;
  }

  /**
   * Calculate PO totals from line items
   */
  private calculateTotals(
    lineItems: CreatePurchaseOrderLineItemInput[]
  ): {
    subtotal: Decimal;
    taxAmount: Decimal;
    totalAmount: Decimal;
  } {
    let subtotal = new Decimal(0);
    let taxAmount = new Decimal(0);

    lineItems.forEach((item) => {
      const quantity = new Decimal(item.quantity);
      const unitPrice = new Decimal(item.unitPrice);
      const taxRate = new Decimal(item.taxRate || 0);

      const lineSubtotal = quantity.mul(unitPrice);
      const lineTax = lineSubtotal.mul(taxRate).div(100);

      subtotal = subtotal.add(lineSubtotal);
      taxAmount = taxAmount.add(lineTax);
    });

    const totalAmount = subtotal.add(taxAmount);

    return { subtotal, taxAmount, totalAmount };
  }

  /**
   * Create a new purchase order
   */
  async createPurchaseOrder(
    data: CreatePurchaseOrderInput,
    userId: string
  ): Promise<PurchaseOrderWithRelations> {
    try {
      // Verify vendor exists
      const vendor = await prisma.vendor.findFirst({
        where: {
          id: data.vendorId,
          organizationId: data.organizationId,
          deletedAt: null,
        },
      });

      if (!vendor) {
        throw new NotFoundError('Vendor', data.vendorId);
      }

      // Validate line items
      if (!data.lineItems || data.lineItems.length === 0) {
        throw new ValidationError('Purchase order must have at least one line item');
      }

      // Generate PO number
      const poNumber = await this.generatePONumber(data.organizationId);

      // Calculate totals
      const { subtotal, taxAmount, totalAmount } = this.calculateTotals(
        data.lineItems
      );

      // Create purchase order with line items in a transaction
      const purchaseOrder = await prisma.$transaction(async (tx) => {
        const po = await tx.purchaseOrder.create({
          data: {
            organizationId: data.organizationId,
            poNumber,
            vendorId: data.vendorId,
            status: 'DRAFT',
            orderDate: data.orderDate || new Date(),
            expectedDate: data.expectedDate,
            subtotal,
            taxAmount,
            totalAmount,
            receivedAmount: 0,
            currency: data.currency || 'CAD',
            notes: data.notes,
            internalNotes: data.internalNotes,
            terms: data.terms,
            createdBy: userId,
          },
          include: {
            vendor: {
              include: {
                business: true,
              },
            },
            lineItems: true,
          },
        });

        // Create line items
        for (const item of data.lineItems) {
          const quantity = new Decimal(item.quantity);
          const unitPrice = new Decimal(item.unitPrice);
          const taxRate = new Decimal(item.taxRate || 0);

          const lineSubtotal = quantity.mul(unitPrice);
          const lineTax = lineSubtotal.mul(taxRate).div(100);
          const lineTotal = lineSubtotal.add(lineTax);

          await tx.purchaseOrderLineItem.create({
            data: {
              purchaseOrderId: po.id,
              productId: item.productId,
              description: item.description,
              quantity,
              unitPrice,
              taxRate,
              taxAmount: lineTax,
              lineTotal,
              quantityReceived: 0,
              quantityBilled: 0,
            },
          });
        }

        // Fetch complete PO with line items
        return tx.purchaseOrder.findUniqueOrThrow({
          where: { id: po.id },
          include: {
            vendor: {
              include: {
                business: true,
              },
            },
            lineItems: {
              include: {
                product: true,
              },
            },
          },
        });
      });

      // Audit log
      await auditService.logCreate(
        'PurchaseOrder',
        purchaseOrder.id,
        {
          poNumber: purchaseOrder.poNumber,
          vendorId: data.vendorId,
          totalAmount: totalAmount.toString(),
        },
        {
          organizationId: data.organizationId,
          userId,
        }
      );

      logger.info('Purchase order created', {
        poId: purchaseOrder.id,
        organizationId: data.organizationId,
        userId,
      });

      return purchaseOrder;
    } catch (error) {
      logger.error('Error creating purchase order', error);
      throw error;
    }
  }

  /**
   * Get purchase order by ID
   */
  async getPurchaseOrderById(
    poId: string,
    organizationId: string
  ): Promise<PurchaseOrderWithRelations> {
    const po = await prisma.purchaseOrder.findFirst({
      where: {
        id: poId,
        organizationId,
        deletedAt: null,
      },
      include: {
        vendor: {
          include: {
            business: true,
          },
        },
        lineItems: {
          include: {
            product: true,
          },
        },
        bills: true,
      },
    });

    if (!po) {
      throw new NotFoundError('PurchaseOrder', poId);
    }

    return po;
  }

  /**
   * Get all purchase orders for an organization
   */
  async getPurchaseOrders(
    organizationId: string,
    filters: PurchaseOrderFilters = {},
    pagination: PaginationParams = {}
  ): Promise<{
    purchaseOrders: PurchaseOrderWithRelations[];
    hasMore: boolean;
    nextCursor?: string;
  }> {
    const limit = pagination.limit || 50;
    const where: any = {
      organizationId,
      deletedAt: null,
    };

    // Apply filters
    if (filters.vendorId) {
      where.vendorId = filters.vendorId;
    }

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.dateFrom || filters.dateTo) {
      where.orderDate = {};
      if (filters.dateFrom) {
        where.orderDate.gte = filters.dateFrom;
      }
      if (filters.dateTo) {
        where.orderDate.lte = filters.dateTo;
      }
    }

    if (filters.search) {
      where.OR = [
        { poNumber: { contains: filters.search } },
        { vendor: { business: { legalName: { contains: filters.search } } } },
        { notes: { contains: filters.search } },
      ];
    }

    // Build query with pagination
    const query: any = {
      where,
      take: limit + 1,
      include: {
        vendor: {
          include: {
            business: true,
          },
        },
        lineItems: {
          include: {
            product: true,
          },
        },
      },
      orderBy: {
        orderDate: 'desc',
      },
    };

    if (pagination.cursor) {
      query.cursor = {
        id: pagination.cursor,
      };
      query.skip = 1;
    }

    const purchaseOrders = await prisma.purchaseOrder.findMany(query) as PurchaseOrderWithRelations[];

    const hasMore = purchaseOrders.length > limit;
    if (hasMore) {
      purchaseOrders.pop();
    }

    const nextCursor = hasMore
      ? purchaseOrders[purchaseOrders.length - 1].id
      : undefined;

    return {
      purchaseOrders,
      hasMore,
      nextCursor,
    };
  }

  /**
   * Update purchase order
   */
  async updatePurchaseOrder(
    poId: string,
    organizationId: string,
    data: UpdatePurchaseOrderInput,
    userId: string
  ): Promise<PurchaseOrderWithRelations> {
    try {
      // Verify PO exists
      const existingPO = await this.getPurchaseOrderById(poId, organizationId);

      // Cannot update if already received
      if (existingPO.status === 'RECEIVED') {
        throw new BusinessRuleError('Cannot update received purchase order', 'PO_ALREADY_RECEIVED');
      }

      // Cannot update if cancelled
      if (existingPO.status === 'CANCELLED') {
        throw new BusinessRuleError('Cannot update cancelled purchase order', 'PO_CANCELLED');
      }

      const purchaseOrder = await prisma.$transaction(async (tx) => {
        // Update PO
        const updateData: any = {
          updatedAt: new Date(),
        };

        if (data.vendorId) {
          updateData.vendorId = data.vendorId;
        }
        if (data.status) {
          updateData.status = data.status;
        }
        if (data.expectedDate) {
          updateData.expectedDate = data.expectedDate;
        }
        if (data.receivedDate) {
          updateData.receivedDate = data.receivedDate;
        }
        if (data.notes !== undefined) {
          updateData.notes = data.notes;
        }
        if (data.internalNotes !== undefined) {
          updateData.internalNotes = data.internalNotes;
        }
        if (data.terms !== undefined) {
          updateData.terms = data.terms;
        }

        // Update line items if provided
        if (data.lineItems) {
          // Calculate new totals
          const { subtotal, taxAmount, totalAmount } = this.calculateTotals(
            data.lineItems as any
          );

          updateData.subtotal = subtotal;
          updateData.taxAmount = taxAmount;
          updateData.totalAmount = totalAmount;

          // Delete existing line items
          await tx.purchaseOrderLineItem.deleteMany({
            where: { purchaseOrderId: poId },
          });

          // Create new line items
          for (const item of data.lineItems) {
            const quantity = new Decimal(item.quantity || 0);
            const unitPrice = new Decimal(item.unitPrice || 0);
            const taxRate = new Decimal(item.taxRate || 0);

            const lineSubtotal = quantity.mul(unitPrice);
            const lineTax = lineSubtotal.mul(taxRate).div(100);
            const lineTotal = lineSubtotal.add(lineTax);

            await tx.purchaseOrderLineItem.create({
              data: {
                purchaseOrderId: poId,
                productId: item.productId,
                description: item.description || '',
                quantity,
                unitPrice,
                taxRate,
                taxAmount: lineTax,
                lineTotal,
                quantityReceived: item.quantityReceived || 0,
                quantityBilled: 0,
              },
            });
          }
        }

        await tx.purchaseOrder.update({
          where: { id: poId },
          data: updateData,
        });

        // Fetch updated PO
        return tx.purchaseOrder.findUniqueOrThrow({
          where: { id: poId },
          include: {
            vendor: {
              include: {
                business: true,
              },
            },
            lineItems: {
              include: {
                product: true,
              },
            },
          },
        });
      });

      // Audit log
      await auditService.logUpdate(
        'PurchaseOrder',
        poId,
        existingPO as unknown as Record<string, unknown>,
        data as unknown as Record<string, unknown>,
        {
          organizationId,
          userId,
        }
      );

      logger.info('Purchase order updated', {
        poId,
        organizationId,
        userId,
      });

      return purchaseOrder;
    } catch (error) {
      logger.error('Error updating purchase order', error);
      throw error;
    }
  }

  /**
   * Approve purchase order
   */
  async approvePurchaseOrder(
    poId: string,
    organizationId: string,
    userId: string
  ): Promise<PurchaseOrderWithRelations> {
    const purchaseOrder = await this.updatePurchaseOrder(
      poId,
      organizationId,
      { status: 'APPROVED' },
      userId
    );

    await prisma.purchaseOrder.update({
      where: { id: poId },
      data: {
        approvedBy: userId,
        approvedAt: new Date(),
      },
    });

    return purchaseOrder;
  }

  /**
   * Cancel purchase order
   */
  async cancelPurchaseOrder(
    poId: string,
    organizationId: string,
    userId: string
  ): Promise<PurchaseOrderWithRelations> {
    const existingPO = await this.getPurchaseOrderById(poId, organizationId);

    if (existingPO.status === 'RECEIVED') {
      throw new BusinessRuleError('Cannot cancel received purchase order', 'PO_ALREADY_RECEIVED');
    }

    return this.updatePurchaseOrder(
      poId,
      organizationId,
      { status: 'CANCELLED' },
      userId
    );
  }

  /**
   * Delete purchase order (soft delete)
   */
  async deletePurchaseOrder(
    poId: string,
    organizationId: string,
    userId: string
  ): Promise<void> {
    try {
      const existingPO = await this.getPurchaseOrderById(poId, organizationId);

      // Check if PO has related bills
      const billCount = await prisma.bill.count({
        where: {
          purchaseOrderId: poId,
          deletedAt: null,
        },
      });

      if (billCount > 0) {
        throw new BusinessRuleError('Cannot delete purchase order with existing bills', 'PO_HAS_BILLS');
      }

      // Soft delete
      await prisma.purchaseOrder.update({
        where: { id: poId },
        data: {
          deletedAt: new Date(),
        },
      });

      // Audit log
      await auditService.logDelete(
        'PurchaseOrder',
        poId,
        {
          poNumber: existingPO.poNumber,
          vendorId: existingPO.vendorId,
        },
        {
          organizationId,
          userId,
        }
      );

      logger.info('Purchase order deleted', {
        poId,
        organizationId,
        userId,
      });
    } catch (error) {
      logger.error('Error deleting purchase order', error);
      throw error;
    }
  }

  /**
   * Get purchase order statistics
   */
  async getPurchaseOrderStats(
    organizationId: string,
    vendorId?: string
  ): Promise<{
    totalPOs: number;
    byStatus: Record<string, number>;
    totalAmount: number;
    averageAmount: number;
  }> {
    const where: any = {
      organizationId,
      deletedAt: null,
    };

    if (vendorId) {
      where.vendorId = vendorId;
    }

    const pos = await prisma.purchaseOrder.findMany({
      where,
      select: {
        status: true,
        totalAmount: true,
      },
    });

    const totalPOs = pos.length;

    const byStatus: Record<string, number> = {};
    let totalAmount = 0;

    pos.forEach((po) => {
      byStatus[po.status] = (byStatus[po.status] || 0) + 1;
      totalAmount += Number(po.totalAmount);
    });

    const averageAmount = totalPOs > 0 ? totalAmount / totalPOs : 0;

    return {
      totalPOs,
      byStatus,
      totalAmount,
      averageAmount,
    };
  }

  /**
   * Receive items from purchase order
   */
  async receiveItems(
    poId: string,
    organizationId: string,
    data: { lineItems: Array<{ id: string; quantityReceived: number }> },
    userId: string
  ): Promise<PurchaseOrderWithRelations> {
    const existingPO = await this.getPurchaseOrderById(poId, organizationId);

    if (existingPO.status === 'CANCELLED') {
      throw new BusinessRuleError('Cannot receive items from cancelled purchase order', 'PO_CANCELLED');
    }

    // Update line items with received quantities
    const lineItemUpdates = data.lineItems.map((item) =>
      prisma.purchaseOrderLineItem.update({
        where: { id: item.id },
        data: {
          quantityReceived: item.quantityReceived,
        },
      })
    );

    await prisma.$transaction(lineItemUpdates);

    // Check if all items are received
    const updatedLineItems = await prisma.purchaseOrderLineItem.findMany({
      where: { purchaseOrderId: poId },
    });

    const allReceived = updatedLineItems.every((item) => {
      const qty = new Decimal(item.quantity);
      const received = new Decimal(item.quantityReceived || 0);
      return received.greaterThanOrEqualTo(qty);
    });

    const totalReceived = updatedLineItems.reduce((sum, item) => {
      return sum.add(new Decimal(item.quantityReceived || 0));
    }, new Decimal(0));

    // Update PO status and received amount
    await prisma.purchaseOrder.update({
      where: { id: poId },
      data: {
        status: allReceived ? 'RECEIVED' : 'PARTIALLY_RECEIVED',
        receivedDate: allReceived ? new Date() : undefined,
        receivedAmount: totalReceived,
      },
    });

    await auditService.logUpdate(
      'PurchaseOrder',
      poId,
      existingPO,
      { lineItems: data.lineItems },
      {
        organizationId,
        userId,
      }
    );

    logger.info('Purchase order items received', {
      poId,
      organizationId,
      userId,
    });

    return this.getPurchaseOrderById(poId, organizationId);
  }

  /**
   * Close purchase order
   */
  async closePurchaseOrder(
    poId: string,
    organizationId: string,
    userId: string
  ): Promise<PurchaseOrderWithRelations> {
    const existingPO = await this.getPurchaseOrderById(poId, organizationId);

    if (existingPO.status === 'CANCELLED') {
      throw new BusinessRuleError('Cannot close cancelled purchase order', 'PO_CANCELLED');
    }

    await prisma.purchaseOrder.update({
      where: { id: poId },
      data: {
        status: 'CLOSED',
      },
    });

    await auditService.logUpdate(
      'PurchaseOrder',
      poId,
      existingPO,
      { status: 'CLOSED' },
      {
        organizationId,
        userId,
      }
    );

    logger.info('Purchase order closed', {
      poId,
      organizationId,
      userId,
    });

    return this.getPurchaseOrderById(poId, organizationId);
  }
}

export const purchaseOrderService = new PurchaseOrderService();