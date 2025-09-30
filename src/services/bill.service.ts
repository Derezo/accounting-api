import { Bill, BillLineItem, Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { NotFoundError, ValidationError, BusinessRuleError } from '../utils/errors';
import { logger } from '../utils/logger';
import { auditService } from './audit.service';
import Decimal from 'decimal.js';

export interface CreateBillInput {
  organizationId: string;
  vendorId: string;
  purchaseOrderId?: string;
  vendorInvoiceNumber?: string;
  billDate: Date;
  dueDate: Date;
  currency?: string;
  notes?: string;
  internalNotes?: string;
  lineItems: CreateBillLineItemInput[];
}

export interface CreateBillLineItemInput {
  productId?: string;
  accountId?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate?: number;
}

export interface UpdateBillInput {
  vendorId?: string;
  status?: string;
  billDate?: Date;
  dueDate?: Date;
  vendorInvoiceNumber?: string;
  notes?: string;
  internalNotes?: string;
  lineItems?: UpdateBillLineItemInput[];
}

export interface UpdateBillLineItemInput {
  id?: string;
  productId?: string;
  accountId?: string;
  description?: string;
  quantity?: number;
  unitPrice?: number;
  taxRate?: number;
}

export interface BillFilters {
  vendorId?: string;
  status?: string;
  dueDateFrom?: Date;
  dueDateTo?: Date;
  search?: string;
  overdue?: boolean;
}

export interface PaginationParams {
  limit?: number;
  cursor?: string;
}

type BillWithRelations = Prisma.BillGetPayload<{
  include: {
    vendor: {
      include: {
        business: true;
      };
    };
    lineItems: {
      include: {
        product: true;
        account: true;
      };
    };
    payments: true;
  };
}>;

class BillService {
  /**
   * Generate next bill number for organization
   */
  private async generateBillNumber(organizationId: string): Promise<string> {
    const lastBill = await prisma.bill.findFirst({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      select: { billNumber: true },
    });

    if (!lastBill) {
      return 'BILL-00001';
    }

    const lastNumber = parseInt(lastBill.billNumber.split('-')[1]);
    const nextNumber = lastNumber + 1;
    return `BILL-${nextNumber.toString().padStart(5, '0')}`;
  }

  /**
   * Calculate bill totals from line items
   */
  private calculateTotals(
    lineItems: CreateBillLineItemInput[]
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
   * Create a new bill
   */
  async createBill(
    data: CreateBillInput,
    userId: string
  ): Promise<BillWithRelations> {
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

      // Verify PO if provided
      if (data.purchaseOrderId) {
        const po = await prisma.purchaseOrder.findFirst({
          where: {
            id: data.purchaseOrderId,
            organizationId: data.organizationId,
            vendorId: data.vendorId,
            deletedAt: null,
          },
        });

        if (!po) {
          throw new NotFoundError('PurchaseOrder', data.purchaseOrderId);
        }
      }

      // Validate line items
      if (!data.lineItems || data.lineItems.length === 0) {
        throw new ValidationError('Bill must have at least one line item');
      }

      // Generate bill number
      const billNumber = await this.generateBillNumber(data.organizationId);

      // Calculate totals
      const { subtotal, taxAmount, totalAmount } = this.calculateTotals(
        data.lineItems
      );

      // Create bill with line items in a transaction
      const bill = await prisma.$transaction(async (tx) => {
        const newBill = await tx.bill.create({
          data: {
            organizationId: data.organizationId,
            billNumber,
            vendorId: data.vendorId,
            purchaseOrderId: data.purchaseOrderId,
            vendorInvoiceNumber: data.vendorInvoiceNumber,
            status: 'RECEIVED',
            billDate: data.billDate,
            dueDate: data.dueDate,
            subtotal,
            taxAmount,
            totalAmount,
            paidAmount: 0,
            balanceAmount: totalAmount,
            currency: data.currency || 'CAD',
            notes: data.notes,
            internalNotes: data.internalNotes,
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

          await tx.billLineItem.create({
            data: {
              billId: newBill.id,
              productId: item.productId,
              accountId: item.accountId,
              description: item.description,
              quantity,
              unitPrice,
              taxRate,
              taxAmount: lineTax,
              lineTotal,
            },
          });
        }

        // Fetch complete bill with line items
        return tx.bill.findUniqueOrThrow({
          where: { id: newBill.id },
          include: {
            vendor: {
              include: {
                business: true,
              },
            },
            lineItems: {
              include: {
                product: true,
                account: true,
              },
            },
            payments: true,
          },
        });
      });

      // Audit log
      await auditService.logCreate(
        'Bill',
        bill.id,
        {
          billNumber: bill.billNumber,
          vendorId: data.vendorId,
          totalAmount: totalAmount.toString(),
        },
        {
          organizationId: data.organizationId,
          userId,
        }
      );

      logger.info('Bill created', {
        billId: bill.id,
        organizationId: data.organizationId,
        userId,
      });

      return bill;
    } catch (error) {
      logger.error('Error creating bill', error);
      throw error;
    }
  }

  /**
   * Get bill by ID
   */
  async getBillById(
    billId: string,
    organizationId: string
  ): Promise<BillWithRelations> {
    const bill = await prisma.bill.findFirst({
      where: {
        id: billId,
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
            account: true,
          },
        },
        payments: true,
        purchaseOrder: true,
      },
    });

    if (!bill) {
      throw new NotFoundError('Bill', billId);
    }

    return bill;
  }

  /**
   * Get all bills for an organization
   */
  async getBills(
    organizationId: string,
    filters: BillFilters = {},
    pagination: PaginationParams = {}
  ): Promise<{
    bills: BillWithRelations[];
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

    if (filters.dueDateFrom || filters.dueDateTo) {
      where.dueDate = {};
      if (filters.dueDateFrom) {
        where.dueDate.gte = filters.dueDateFrom;
      }
      if (filters.dueDateTo) {
        where.dueDate.lte = filters.dueDateTo;
      }
    }

    if (filters.overdue) {
      where.dueDate = {
        lt: new Date(),
      };
      where.balanceAmount = {
        gt: 0,
      };
    }

    if (filters.search) {
      where.OR = [
        { billNumber: { contains: filters.search } },
        { vendorInvoiceNumber: { contains: filters.search } },
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
            account: true,
          },
        },
        payments: true,
      } as const,
      orderBy: {
        billDate: 'desc' as const,
      },
    };

    if (pagination.cursor) {
      query.cursor = {
        id: pagination.cursor,
      };
      query.skip = 1;
    }

    const bills = await prisma.bill.findMany(query) as BillWithRelations[];

    const hasMore = bills.length > limit;
    if (hasMore) {
      bills.pop();
    }

    const nextCursor = hasMore ? bills[bills.length - 1].id : undefined;

    return {
      bills,
      hasMore,
      nextCursor,
    };
  }

  /**
   * Update bill
   */
  async updateBill(
    billId: string,
    organizationId: string,
    data: UpdateBillInput,
    userId: string
  ): Promise<BillWithRelations> {
    try {
      // Verify bill exists
      const existingBill = await this.getBillById(billId, organizationId);

      // Cannot update if paid
      if (
        existingBill.status === 'PAID' &&
        Number(existingBill.balanceAmount) === 0
      ) {
        throw new BusinessRuleError('Cannot update fully paid bill', 'BILL_FULLY_PAID');
      }

      const bill = await prisma.$transaction(async (tx) => {
        const updateData: any = {
          updatedAt: new Date(),
        };

        if (data.vendorId) {
          updateData.vendorId = data.vendorId;
        }
        if (data.status) {
          updateData.status = data.status;
        }
        if (data.billDate) {
          updateData.billDate = data.billDate;
        }
        if (data.dueDate) {
          updateData.dueDate = data.dueDate;
        }
        if (data.vendorInvoiceNumber !== undefined) {
          updateData.vendorInvoiceNumber = data.vendorInvoiceNumber;
        }
        if (data.notes !== undefined) {
          updateData.notes = data.notes;
        }
        if (data.internalNotes !== undefined) {
          updateData.internalNotes = data.internalNotes;
        }

        // Update line items if provided
        if (data.lineItems) {
          // Calculate new totals
          const { subtotal, taxAmount, totalAmount } = this.calculateTotals(
            data.lineItems as any
          );

          // Recalculate balance
          const paidAmount = existingBill.paidAmount;
          const balanceAmount = totalAmount.sub(new Decimal(paidAmount));

          updateData.subtotal = subtotal;
          updateData.taxAmount = taxAmount;
          updateData.totalAmount = totalAmount;
          updateData.balanceAmount = balanceAmount;

          // Delete existing line items
          await tx.billLineItem.deleteMany({
            where: { billId },
          });

          // Create new line items
          for (const item of data.lineItems) {
            const quantity = new Decimal(item.quantity || 0);
            const unitPrice = new Decimal(item.unitPrice || 0);
            const taxRate = new Decimal(item.taxRate || 0);

            const lineSubtotal = quantity.mul(unitPrice);
            const lineTax = lineSubtotal.mul(taxRate).div(100);
            const lineTotal = lineSubtotal.add(lineTax);

            await tx.billLineItem.create({
              data: {
                billId,
                productId: item.productId,
                accountId: item.accountId,
                description: item.description || '',
                quantity,
                unitPrice,
                taxRate,
                taxAmount: lineTax,
                lineTotal,
              },
            });
          }
        }

        await tx.bill.update({
          where: { id: billId },
          data: updateData,
        });

        // Fetch updated bill
        return tx.bill.findUniqueOrThrow({
          where: { id: billId },
          include: {
            vendor: {
              include: {
                business: true,
              },
            },
            lineItems: {
              include: {
                product: true,
                account: true,
              },
            },
            payments: true,
          },
        });
      });

      // Audit log
      await auditService.logUpdate(
        'Bill',
        billId,
        existingBill as unknown as Record<string, unknown>,
        data as unknown as Record<string, unknown>,
        {
          organizationId,
          userId,
        }
      );

      logger.info('Bill updated', {
        billId,
        organizationId,
        userId,
      });

      return bill;
    } catch (error) {
      logger.error('Error updating bill', error);
      throw error;
    }
  }

  /**
   * Approve bill
   */
  async approveBill(
    billId: string,
    organizationId: string,
    userId: string
  ): Promise<BillWithRelations> {
    const bill = await this.updateBill(
      billId,
      organizationId,
      { status: 'APPROVED' },
      userId
    );

    await prisma.bill.update({
      where: { id: billId },
      data: {
        approvedBy: userId,
        approvedAt: new Date(),
      },
    });

    return bill;
  }

  /**
   * Record payment against bill
   */
  async recordPayment(
    billId: string,
    organizationId: string,
    paymentAmount: number,
    userId: string
  ): Promise<BillWithRelations> {
    const bill = await this.getBillById(billId, organizationId);

    const currentBalance = new Decimal(bill.balanceAmount);
    const payment = new Decimal(paymentAmount);

    if (payment.greaterThan(currentBalance)) {
      throw new ValidationError('Payment amount exceeds bill balance');
    }

    const newPaidAmount = new Decimal(bill.paidAmount).add(payment);
    const newBalance = currentBalance.sub(payment);

    const updatedBill = await prisma.bill.update({
      where: { id: billId },
      data: {
        paidAmount: newPaidAmount,
        balanceAmount: newBalance,
        status: newBalance.isZero() ? 'PAID' : 'PARTIAL',
        updatedAt: new Date(),
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
            account: true,
          },
        },
        payments: true,
      },
    });

    // Audit log
    await auditService.logUpdate(
      'Bill',
      billId,
      { balanceAmount: currentBalance.toString() },
      { paidAmount: newPaidAmount.toString(), balanceAmount: newBalance.toString() },
      {
        organizationId,
        userId,
      }
    );

    return updatedBill;
  }

  /**
   * Delete bill (soft delete)
   */
  async deleteBill(
    billId: string,
    organizationId: string,
    userId: string
  ): Promise<void> {
    try {
      const existingBill = await this.getBillById(billId, organizationId);

      // Check if bill has payments
      if (Number(existingBill.paidAmount) > 0) {
        throw new BusinessRuleError('Cannot delete bill with payments', 'BILL_HAS_PAYMENTS');
      }

      // Soft delete
      await prisma.bill.update({
        where: { id: billId },
        data: {
          deletedAt: new Date(),
        },
      });

      // Audit log
      await auditService.logDelete(
        'Bill',
        billId,
        {
          billNumber: existingBill.billNumber,
          vendorId: existingBill.vendorId,
        },
        {
          organizationId,
          userId,
        }
      );

      logger.info('Bill deleted', {
        billId,
        organizationId,
        userId,
      });
    } catch (error) {
      logger.error('Error deleting bill', error);
      throw error;
    }
  }

  /**
   * Get bill statistics
   */
  async getBillStats(
    organizationId: string,
    vendorId?: string
  ): Promise<{
    totalBills: number;
    byStatus: Record<string, number>;
    totalAmount: number;
    totalPaid: number;
    totalOutstanding: number;
    overdueCount: number;
    overdueAmount: number;
  }> {
    const where: any = {
      organizationId,
      deletedAt: null,
    };

    if (vendorId) {
      where.vendorId = vendorId;
    }

    const bills = await prisma.bill.findMany({
      where,
      select: {
        status: true,
        totalAmount: true,
        paidAmount: true,
        balanceAmount: true,
        dueDate: true,
      },
    });

    const totalBills = bills.length;

    const byStatus: Record<string, number> = {};
    let totalAmount = 0;
    let totalPaid = 0;
    let totalOutstanding = 0;
    let overdueCount = 0;
    let overdueAmount = 0;

    const now = new Date();

    bills.forEach((bill) => {
      byStatus[bill.status] = (byStatus[bill.status] || 0) + 1;
      totalAmount += Number(bill.totalAmount);
      totalPaid += Number(bill.paidAmount);
      totalOutstanding += Number(bill.balanceAmount);

      if (new Date(bill.dueDate) < now && Number(bill.balanceAmount) > 0) {
        overdueCount++;
        overdueAmount += Number(bill.balanceAmount);
      }
    });

    return {
      totalBills,
      byStatus,
      totalAmount,
      totalPaid,
      totalOutstanding,
      overdueCount,
      overdueAmount,
    };
  }
}

export const billService = new BillService();