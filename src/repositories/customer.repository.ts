import { Customer, Person, Business } from '@prisma/client';
import { BaseRepository, PaginationOptions, PaginationResult } from './base.repository';

export interface CustomerWithRelations extends Customer {
  person?: Person | null;
  business?: Business | null;
  stats?: {
    quotes: number;
    invoices: number;
    payments: number;
  };
}

export interface CustomerCreateData {
  customerNumber?: string;
  tier: 'PERSONAL' | 'SMALL_BUSINESS' | 'ENTERPRISE';
  status: 'PROSPECT' | 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  notes?: string;
  creditLimit?: string;
  paymentTerms?: number;
  taxExempt?: boolean;
  preferredCurrency?: string;
  person?: {
    firstName: string;
    lastName: string;
    middleName?: string;
    dateOfBirth?: Date;
    socialInsNumber?: string;
    email?: string;
    phone?: string;
    mobile?: string;
  };
  business?: {
    legalName: string;
    tradeName?: string;
    businessNumber?: string;
    taxNumber?: string;
    incorporationDate?: Date;
    businessType: 'SOLE_PROPRIETORSHIP' | 'PARTNERSHIP' | 'CORPORATION' | 'COOPERATIVE';
    email?: string;
    phone?: string;
    website?: string;
  };
}

export interface CustomerFilterOptions {
  tier?: 'PERSONAL' | 'SMALL_BUSINESS' | 'ENTERPRISE';
  status?: 'PROSPECT' | 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  search?: string;
}

export class CustomerRepository extends BaseRepository<CustomerWithRelations> {
  constructor() {
    super('customer', {
      person: true,
      business: true
    });
  }

  /**
   * Create a new customer with person or business details
   */
  async createCustomer(
    organizationId: string,
    data: CustomerCreateData,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<CustomerWithRelations> {
    return this.batchOperation(organizationId, async (tx) => {
      // Generate customer number if not provided
      const customerNumber = data.customerNumber || await this.generateCustomerNumber(organizationId);

      // Create person or business first if needed
      let personId = null;
      let businessId = null;
      let person = null;
      let business = null;

      if (data.person) {
        person = await tx.person.create({
          data: {
            organizationId,
            ...data.person,
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null
          }
        });
        personId = person.id;
      } else if (data.business) {
        business = await tx.business.create({
          data: {
            organizationId,
            ...data.business,
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null
          }
        });
        businessId = business.id;
      }

      // Create the main customer record
      const customer = await tx.customer.create({
        data: {
          organizationId,
          customerNumber,
          personId,
          businessId,
          tier: data.tier,
          status: data.status,
          notes: data.notes,
          creditLimit: data.creditLimit,
          paymentTerms: data.paymentTerms,
          taxExempt: data.taxExempt || false,
          preferredCurrency: data.preferredCurrency || 'CAD',
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null
        }
      });

      return {
        ...customer,
        person,
        business,
        stats: {
          quotes: 0,
          invoices: 0,
          payments: 0
        }
      };
    }, auditContext);
  }

  /**
   * Find customers with filtering and search
   */
  async findCustomers(
    organizationId: string,
    filters: CustomerFilterOptions = {},
    pagination: PaginationOptions = {}
  ): Promise<PaginationResult<CustomerWithRelations>> {
    const where: any = {};

    // Apply filters
    if (filters.tier) {
      where.tier = filters.tier;
    }
    if (filters.status) {
      where.status = filters.status;
    }

    // Apply search
    if (filters.search) {
      where.OR = [
        { customerNumber: { contains: filters.search, mode: 'insensitive' } },
        { notes: { contains: filters.search, mode: 'insensitive' } },
        {
          person: {
            OR: [
              { firstName: { contains: filters.search, mode: 'insensitive' } },
              { lastName: { contains: filters.search, mode: 'insensitive' } }
            ]
          }
        },
        {
          business: {
            OR: [
              { legalName: { contains: filters.search, mode: 'insensitive' } },
              { tradeName: { contains: filters.search, mode: 'insensitive' } }
            ]
          }
        }
      ];
    }

    const result = await this.findMany(organizationId, {
      where,
      orderBy: { createdAt: 'desc' },
      pagination
    });

    // Add stats for each customer
    const customersWithStats = await Promise.all(
      result.data.map(async (customer) => ({
        ...customer,
        stats: await this.getCustomerStats(organizationId, customer.id)
      }))
    );

    return {
      ...result,
      data: customersWithStats
    };
  }

  /**
   * Get customer statistics
   */
  async getCustomerStats(
    organizationId: string,
    customerId: string
  ): Promise<{ quotes: number; invoices: number; payments: number }> {
    const [quotes, invoices, payments] = await Promise.all([
      this.prisma.quote.count({
        where: {
          organizationId,
          customerId,
          deletedAt: null
        }
      }),
      this.prisma.invoice.count({
        where: {
          organizationId,
          customerId,
          deletedAt: null
        }
      }),
      this.prisma.payment.count({
        where: {
          organizationId,
          customerId,
          deletedAt: null
        }
      })
    ]);

    return { quotes, invoices, payments };
  }

  /**
   * Generate a unique customer number
   */
  private async generateCustomerNumber(organizationId: string): Promise<string> {
    const count = await this.count(organizationId);
    const customerNumber = `CUST-${String(count + 1).padStart(3, '0')}`;

    // Check if this number already exists
    const existing = await this.model.findFirst({
      where: {
        organizationId,
        customerNumber,
        deletedAt: null
      }
    });

    if (existing) {
      // If it exists, try with timestamp suffix
      return `${customerNumber}-${Date.now().toString().slice(-4)}`;
    }

    return customerNumber;
  }

  /**
   * Update customer with related data
   */
  async updateCustomer(
    organizationId: string,
    customerId: string,
    data: Partial<CustomerCreateData>,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<CustomerWithRelations> {
    return this.batchOperation(organizationId, async (tx) => {
      // Update main customer record
      const customer = await tx.customer.update({
        where: { id: customerId },
        data: {
          ...(data.tier && { tier: data.tier }),
          ...(data.status && { status: data.status }),
          ...(data.notes !== undefined && { notes: data.notes }),
          ...(data.creditLimit !== undefined && { creditLimit: data.creditLimit }),
          ...(data.paymentTerms !== undefined && { paymentTerms: data.paymentTerms }),
          ...(data.taxExempt !== undefined && { taxExempt: data.taxExempt }),
          ...(data.preferredCurrency && { preferredCurrency: data.preferredCurrency }),
          updatedAt: new Date()
        }
      });

      // Update person details if provided
      let person = null;
      if (data.person) {
        const currentCustomer = await tx.customer.findUnique({
          where: { id: customerId },
          include: { person: true }
        });

        if (currentCustomer?.person) {
          person = await tx.person.update({
            where: { id: currentCustomer.person.id },
            data: {
              ...data.person,
              updatedAt: new Date()
            }
          });
        } else {
          person = await tx.person.create({
            data: {
              organizationId,
              ...data.person,
              createdAt: new Date(),
              updatedAt: new Date(),
              deletedAt: null
            }
          });
          // Link the new person to the customer
          await tx.customer.update({
            where: { id: customerId },
            data: { personId: person.id }
          });
        }
      }

      // Update business details if provided
      let business = null;
      if (data.business) {
        const currentCustomer = await tx.customer.findUnique({
          where: { id: customerId },
          include: { business: true }
        });

        if (currentCustomer?.business) {
          business = await tx.business.update({
            where: { id: currentCustomer.business.id },
            data: {
              ...data.business,
              updatedAt: new Date()
            }
          });
        } else {
          business = await tx.business.create({
            data: {
              organizationId,
              ...data.business,
              createdAt: new Date(),
              updatedAt: new Date(),
              deletedAt: null
            }
          });
          // Link the new business to the customer
          await tx.customer.update({
            where: { id: customerId },
            data: { businessId: business.id }
          });
        }
      }

      // Get the complete customer with relations
      const updatedCustomer = await tx.customer.findFirst({
        where: { id: customerId },
        include: {
          person: true,
          business: true
        }
      });

      return {
        ...updatedCustomer,
        stats: await this.getCustomerStats(organizationId, customerId)
      };
    }, auditContext);
  }

  /**
   * Delete customer and all related data
   */
  async deleteCustomer(
    organizationId: string,
    customerId: string,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<CustomerWithRelations> {
    return this.batchOperation(organizationId, async (tx) => {
      const now = new Date();

      // Get customer with relations to soft delete
      const customerWithRelations = await tx.customer.findUnique({
        where: { id: customerId },
        include: { person: true, business: true }
      });

      // Soft delete related records
      const deletePromises = [];
      if (customerWithRelations?.person) {
        deletePromises.push(
          tx.person.update({
            where: { id: customerWithRelations.person.id },
            data: { deletedAt: now, updatedAt: now }
          })
        );
      }
      if (customerWithRelations?.business) {
        deletePromises.push(
          tx.business.update({
            where: { id: customerWithRelations.business.id },
            data: { deletedAt: now, updatedAt: now }
          })
        );
      }

      if (deletePromises.length > 0) {
        await Promise.all(deletePromises);
      }

      // Soft delete the customer
      return tx.customer.update({
        where: { id: customerId },
        data: { deletedAt: now, updatedAt: now },
        include: {
          person: true,
          business: true
        }
      });
    }, auditContext);
  }
}