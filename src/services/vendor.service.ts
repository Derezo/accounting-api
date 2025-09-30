import { Vendor } from '@prisma/client';
import { prisma } from '../config/database';
import { NotFoundError, ConflictError, BusinessRuleError } from '../utils/errors';
import { logger } from '../utils/logger';
import { auditService } from './audit.service';

export interface CreateVendorInput {
  organizationId: string;
  vendorNumber: string;
  businessId: string;
  category: string;
  paymentTerms?: number;
  taxNumber?: string;
  preferredPaymentMethod?: string;
  bankAccount?: string;
  notes?: string;
  isActive?: boolean;
}

export interface UpdateVendorInput {
  category?: string;
  paymentTerms?: number;
  taxNumber?: string;
  preferredPaymentMethod?: string;
  bankAccount?: string;
  notes?: string;
  isActive?: boolean;
}

export interface VendorFilters {
  category?: string;
  isActive?: boolean;
  search?: string;
}

export interface PaginationParams {
  limit?: number;
  cursor?: string;
}

class VendorService {
  /**
   * Create a new vendor
   */
  async createVendor(
    data: CreateVendorInput,
    userId: string
  ): Promise<Vendor> {
    try {
      // Check if vendor number already exists
      const existingVendor = await prisma.vendor.findFirst({
        where: {
          organizationId: data.organizationId,
          vendorNumber: data.vendorNumber,
          deletedAt: null,
        },
      });

      if (existingVendor) {
        throw new ConflictError('Vendor number already exists', { field: 'vendorNumber' });
      }

      // Verify business exists
      const business = await prisma.business.findUnique({
        where: { id: data.businessId },
      });

      if (!business) {
        throw new NotFoundError('Business', data.businessId);
      }

      // Create vendor
      const vendor = await prisma.vendor.create({
        data: {
          organizationId: data.organizationId,
          vendorNumber: data.vendorNumber,
          businessId: data.businessId,
          category: data.category,
          paymentTerms: data.paymentTerms || 30,
          taxNumber: data.taxNumber,
          preferredPaymentMethod: data.preferredPaymentMethod || 'BANK_TRANSFER',
          bankAccount: data.bankAccount,
          notes: data.notes,
          isActive: data.isActive !== undefined ? data.isActive : true,
        },
        include: {
          business: true,
        },
      });

      // Audit log
      await auditService.logCreate(
        'Vendor',
        vendor.id,
        {
          vendorNumber: vendor.vendorNumber,
          businessId: vendor.businessId,
          category: vendor.category,
        },
        {
          organizationId: data.organizationId,
          userId,
        }
      );

      logger.info('Vendor created', {
        vendorId: vendor.id,
        organizationId: data.organizationId,
        userId,
      });

      return vendor;
    } catch (error) {
      logger.error('Error creating vendor', error);
      throw error;
    }
  }

  /**
   * Get vendor by ID
   */
  async getVendorById(
    vendorId: string,
    organizationId: string
  ): Promise<Vendor> {
    const vendor = await prisma.vendor.findFirst({
      where: {
        id: vendorId,
        organizationId,
        deletedAt: null,
      },
      include: {
        business: true,
        addresses: {
          include: {
            address: true,
          },
        },
      },
    });

    if (!vendor) {
      throw new NotFoundError('Vendor', vendorId);
    }

    return vendor;
  }

  /**
   * Get all vendors for an organization
   */
  async getVendors(
    organizationId: string,
    filters: VendorFilters = {},
    pagination: PaginationParams = {}
  ): Promise<{ vendors: Vendor[]; hasMore: boolean; nextCursor?: string }> {
    const limit = pagination.limit || 50;
    const where: any = {
      organizationId,
      deletedAt: null,
    };

    // Apply filters
    if (filters.category) {
      where.category = filters.category;
    }

    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }

    if (filters.search) {
      where.OR = [
        { vendorNumber: { contains: filters.search } },
        { business: { legalName: { contains: filters.search } } },
        { business: { tradingName: { contains: filters.search } } },
      ];
    }

    // Build query with pagination
    const query: any = {
      where,
      take: limit + 1,
      include: {
        business: {
          include: {
            primaryContact: true,
          },
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

    const vendors = await prisma.vendor.findMany(query);

    const hasMore = vendors.length > limit;
    if (hasMore) {
      vendors.pop();
    }

    const nextCursor = hasMore ? vendors[vendors.length - 1].id : undefined;

    return {
      vendors,
      hasMore,
      nextCursor,
    };
  }

  /**
   * Update vendor
   */
  async updateVendor(
    vendorId: string,
    organizationId: string,
    data: UpdateVendorInput,
    userId: string
  ): Promise<Vendor> {
    try {
      // Verify vendor exists
      const existingVendor = await this.getVendorById(vendorId, organizationId);

      // Update vendor
      const vendor = await prisma.vendor.update({
        where: { id: vendorId },
        data: {
          category: data.category,
          paymentTerms: data.paymentTerms,
          taxNumber: data.taxNumber,
          preferredPaymentMethod: data.preferredPaymentMethod,
          bankAccount: data.bankAccount,
          notes: data.notes,
          isActive: data.isActive,
          updatedAt: new Date(),
        },
        include: {
          business: true,
        },
      });

      // Audit log
      await auditService.logUpdate(
        'Vendor',
        vendor.id,
        existingVendor as unknown as Record<string, unknown>,
        vendor as unknown as Record<string, unknown>,
        {
          organizationId,
          userId,
        }
      );

      logger.info('Vendor updated', {
        vendorId: vendor.id,
        organizationId,
        userId,
      });

      return vendor;
    } catch (error) {
      logger.error('Error updating vendor', error);
      throw error;
    }
  }

  /**
   * Delete vendor (soft delete)
   */
  async deleteVendor(
    vendorId: string,
    organizationId: string,
    userId: string
  ): Promise<void> {
    try {
      // Verify vendor exists
      await this.getVendorById(vendorId, organizationId);

      // Check if vendor has related records
      const purchaseOrderCount = await prisma.purchaseOrder.count({
        where: {
          vendorId,
          deletedAt: null,
        },
      });

      const billCount = await prisma.bill.count({
        where: {
          vendorId,
          deletedAt: null,
        },
      });

      if (purchaseOrderCount > 0 || billCount > 0) {
        throw new BusinessRuleError('Cannot delete vendor with existing purchase orders or bills', 'VENDOR_HAS_RECORDS');
      }

      // Soft delete
      await prisma.vendor.update({
        where: { id: vendorId },
        data: {
          deletedAt: new Date(),
        },
      });

      // Audit log
      const vendorData = await this.getVendorById(vendorId, organizationId);
      await auditService.logDelete(
        'Vendor',
        vendorId,
        vendorData as unknown as Record<string, unknown>,
        {
          organizationId,
          userId,
        }
      );

      logger.info('Vendor deleted', {
        vendorId,
        organizationId,
        userId,
      });
    } catch (error) {
      logger.error('Error deleting vendor', error);
      throw error;
    }
  }

  /**
   * Get vendor statistics
   */
  async getVendorStats(
    vendorId: string,
    organizationId: string
  ): Promise<{
    totalPurchaseOrders: number;
    totalBills: number;
    totalSpent: number;
    averagePaymentDays: number;
    outstandingBalance: number;
  }> {
    // Verify vendor exists
    await this.getVendorById(vendorId, organizationId);

    // Get counts
    const totalPurchaseOrders = await prisma.purchaseOrder.count({
      where: {
        vendorId,
        organizationId,
        deletedAt: null,
      },
    });

    const totalBills = await prisma.bill.count({
      where: {
        vendorId,
        organizationId,
        deletedAt: null,
      },
    });

    // Get total spent (sum of paid bills)
    const paidBills = await prisma.bill.findMany({
      where: {
        vendorId,
        organizationId,
        deletedAt: null,
      },
      select: {
        paidAmount: true,
        balanceAmount: true,
      },
    });

    const totalSpent = paidBills.reduce(
      (sum, bill) => sum + Number(bill.paidAmount),
      0
    );

    const outstandingBalance = paidBills.reduce(
      (sum, bill) => sum + Number(bill.balanceAmount),
      0
    );

    // Calculate average payment days
    const paidBillsWithDates = await prisma.bill.findMany({
      where: {
        vendorId,
        organizationId,
        deletedAt: null,
        paidAmount: { gt: 0 },
      },
      select: {
        billDate: true,
        payments: {
          select: {
            paymentDate: true,
          },
          orderBy: {
            paymentDate: 'asc',
          },
          take: 1,
        },
      },
    });

    let totalDays = 0;
    let paymentCount = 0;

    paidBillsWithDates.forEach((bill) => {
      if (bill.payments.length > 0) {
        const billDate = new Date(bill.billDate);
        const paymentDate = new Date(bill.payments[0].paymentDate);
        const days = Math.floor(
          (paymentDate.getTime() - billDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        totalDays += days;
        paymentCount++;
      }
    });

    const averagePaymentDays =
      paymentCount > 0 ? Math.round(totalDays / paymentCount) : 0;

    return {
      totalPurchaseOrders,
      totalBills,
      totalSpent,
      averagePaymentDays,
      outstandingBalance,
    };
  }

  /**
   * Get vendor payment history
   */
  async getVendorPaymentHistory(
    vendorId: string,
    organizationId: string,
    dateFilters: { startDate?: Date; endDate?: Date } = {},
    pagination: { limit?: number } = {}
  ): Promise<any[]> {
    // Verify vendor exists
    await this.getVendorById(vendorId, organizationId);

    const limit = pagination.limit || 50;
    const where: any = {
      bill: {
        vendorId,
        organizationId,
        deletedAt: null,
      },
    };

    // Apply date filters
    if (dateFilters.startDate || dateFilters.endDate) {
      where.paymentDate = {};
      if (dateFilters.startDate) {
        where.paymentDate.gte = dateFilters.startDate;
      }
      if (dateFilters.endDate) {
        where.paymentDate.lte = dateFilters.endDate;
      }
    }

    // Get payments
    const payments = await prisma.vendorPayment.findMany({
      where,
      take: limit,
      orderBy: {
        paymentDate: 'desc',
      },
      include: {
        bill: {
          select: {
            id: true,
            billNumber: true,
            billDate: true,
            totalAmount: true,
          },
        },
      },
    });

    return payments;
  }
}

export const vendorService = new VendorService();