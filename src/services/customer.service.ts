import { PrismaClient, Customer, Person, Business } from '@prisma/client';
import { CustomerTier, CustomerType, CustomerStatus } from '../types/enums';
import { auditService } from './audit.service';

const prisma = new PrismaClient();

interface CreateCustomerData {
  type: CustomerType;
  tier?: CustomerTier;
  status?: CustomerStatus;
  notes?: string;
  creditLimit?: number;
  paymentTerms?: number;
  taxExempt?: boolean;
  preferredCurrency?: string;
  personData?: {
    firstName: string;
    lastName: string;
    middleName?: string;
    email?: string;
    phone?: string;
    mobile?: string;
    dateOfBirth?: string;
    socialInsNumber?: string;
  };
  businessData?: {
    legalName: string;
    tradeName?: string;
    businessNumber?: string;
    taxNumber?: string;
    incorporationDate?: string;
    businessType?: string;
    email?: string;
    phone?: string;
    website?: string;
  };
  address?: {
    type?: string;
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
}

interface UpdateCustomerData {
  tier?: CustomerTier;
  status?: CustomerStatus;
  notes?: string;
  creditLimit?: number;
  paymentTerms?: number;
  taxExempt?: boolean;
  preferredCurrency?: string;
  personData?: {
    firstName?: string;
    lastName?: string;
    middleName?: string;
    email?: string;
    phone?: string;
    mobile?: string;
    dateOfBirth?: string;
  };
  businessData?: {
    legalName?: string;
    tradeName?: string;
    businessNumber?: string;
    taxNumber?: string;
    incorporationDate?: string;
    businessType?: string;
    email?: string;
    phone?: string;
    website?: string;
  };
}

interface CustomerFilters {
  type?: CustomerType;
  tier?: CustomerTier;
  status?: CustomerStatus;
  search?: string;
  limit?: number;
  offset?: number;
}

export class CustomerService {
  async createCustomer(
    data: CreateCustomerData,
    organizationId: string,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<Customer & { person?: Person | null; business?: Business | null }> {
    const customerNumber = await this.generateCustomerNumber(organizationId);

    const customer = await prisma.$transaction(async (tx) => {
      let personId: string | null = null;
      let businessId: string | null = null;

      // Create person or business record based on type
      if (data.type === CustomerType.PERSON && data.personData) {
        const person = await tx.person.create({
          data: {
            organizationId,
            firstName: data.personData.firstName,
            lastName: data.personData.lastName,
            middleName: data.personData.middleName,
            email: data.personData.email,
            phone: data.personData.phone,
            mobile: data.personData.mobile,
            dateOfBirth: data.personData.dateOfBirth ? new Date(data.personData.dateOfBirth) : null,
            socialInsNumber: data.personData.socialInsNumber // TODO: encrypt this
          }
        });
        personId = person.id;
      } else if (data.type === CustomerType.BUSINESS && data.businessData) {
        const business = await tx.business.create({
          data: {
            organizationId,
            legalName: data.businessData.legalName,
            tradeName: data.businessData.tradeName,
            businessNumber: data.businessData.businessNumber,
            taxNumber: data.businessData.taxNumber,
            incorporationDate: data.businessData.incorporationDate ? new Date(data.businessData.incorporationDate) : null,
            businessType: data.businessData.businessType || 'CORPORATION',
            email: data.businessData.email,
            phone: data.businessData.phone,
            website: data.businessData.website
          }
        });
        businessId = business.id;
      }

      // Create base customer record
      const newCustomer = await tx.customer.create({
        data: {
          organizationId,
          customerNumber,
          personId,
          businessId,
          tier: data.tier || CustomerTier.PERSONAL,
          status: data.status || CustomerStatus.PROSPECT,
          notes: data.notes,
          creditLimit: data.creditLimit,
          paymentTerms: data.paymentTerms || 15,
          taxExempt: data.taxExempt || false,
          preferredCurrency: data.preferredCurrency || 'CAD'
        },
        include: {
          person: true,
          business: true
        }
      });

      // TODO: Implement address creation
      // This requires Country records to exist first

      return newCustomer;
    });

    await auditService.logCreate(
      'Customer',
      customer.id,
      customer,
      {
        organizationId,
        userId: auditContext.userId,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent
      }
    );

    return customer;
  }

  async getCustomer(
    id: string,
    organizationId: string,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<(Customer & { person?: Person | null; business?: Business | null; addresses?: any[] }) | null> {
    const customer = await prisma.customer.findFirst({
      where: {
        id,
        organizationId,
        deletedAt: null
      },
      include: {
        person: true,
        business: true,
        addresses: true,
        _count: {
          select: {
            quotes: true,
            invoices: true,
            payments: true,
            projects: true
          }
        }
      }
    });

    if (customer) {
      await auditService.logView(
        'Customer',
        customer.id,
        {
          organizationId,
          userId: auditContext.userId,
          ipAddress: auditContext.ipAddress,
          userAgent: auditContext.userAgent
        }
      );
    }

    return customer;
  }

  async updateCustomer(
    id: string,
    data: UpdateCustomerData,
    organizationId: string,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<Customer & { person?: Person | null; business?: Business | null }> {
    const existingCustomer = await prisma.customer.findFirst({
      where: {
        id,
        organizationId,
        deletedAt: null
      },
      include: {
        person: true,
        business: true
      }
    });

    if (!existingCustomer) {
      throw new Error('Customer not found');
    }

    const updatedCustomer = await prisma.$transaction(async (tx) => {
      // Update base customer record
      const customer = await tx.customer.update({
        where: { id },
        data: {
          tier: data.tier,
          status: data.status,
          notes: data.notes,
          creditLimit: data.creditLimit,
          paymentTerms: data.paymentTerms,
          taxExempt: data.taxExempt,
          preferredCurrency: data.preferredCurrency,
          updatedAt: new Date()
        },
        include: {
          person: true,
          business: true
        }
      });

      // Update person or business data if provided
      if (data.personData && customer.personId) {
        const updatedPerson = await tx.person.update({
          where: { id: customer.personId },
          data: {
            firstName: data.personData.firstName,
            lastName: data.personData.lastName,
            middleName: data.personData.middleName,
            email: data.personData.email,
            phone: data.personData.phone,
            mobile: data.personData.mobile,
            dateOfBirth: data.personData.dateOfBirth ? new Date(data.personData.dateOfBirth) : undefined,
            updatedAt: new Date()
          }
        });
        customer.person = updatedPerson;
      } else if (data.businessData && customer.businessId) {
        const updatedBusiness = await tx.business.update({
          where: { id: customer.businessId },
          data: {
            legalName: data.businessData.legalName,
            tradeName: data.businessData.tradeName,
            businessNumber: data.businessData.businessNumber,
            taxNumber: data.businessData.taxNumber,
            incorporationDate: data.businessData.incorporationDate ? new Date(data.businessData.incorporationDate) : undefined,
            businessType: data.businessData.businessType,
            email: data.businessData.email,
            phone: data.businessData.phone,
            website: data.businessData.website,
            updatedAt: new Date()
          }
        });
        customer.business = updatedBusiness;
      }

      return customer;
    });

    await auditService.logUpdate(
      'Customer',
      id,
      existingCustomer,
      updatedCustomer,
      {
        organizationId,
        userId: auditContext.userId,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent
      }
    );

    return updatedCustomer;
  }

  async listCustomers(
    filters: CustomerFilters,
    organizationId: string
  ): Promise<{ customers: (Customer & { person?: Person | null; business?: Business | null })[], total: number }> {
    const where: any = {
      organizationId,
      deletedAt: null
    };

    if (filters.type) {
      if (filters.type === CustomerType.PERSON) {
        where.personId = { not: null };
      } else if (filters.type === CustomerType.BUSINESS) {
        where.businessId = { not: null };
      }
    }

    if (filters.tier) {
      where.tier = filters.tier;
    }

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.search) {
      where.OR = [
        {
          person: {
            OR: [
              { firstName: { contains: filters.search } },
              { lastName: { contains: filters.search } },
              { email: { contains: filters.search } }
            ]
          }
        },
        {
          business: {
            OR: [
              { legalName: { contains: filters.search } },
              { tradeName: { contains: filters.search } },
              { email: { contains: filters.search } }
            ]
          }
        },
        { customerNumber: { contains: filters.search } }
      ];
    }

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: filters.limit || 50,
        skip: filters.offset || 0,
        include: {
          person: true,
          business: true,
          _count: {
            select: {
              quotes: true,
              invoices: true,
              payments: true
            }
          }
        }
      }),
      prisma.customer.count({ where })
    ]);

    return { customers, total };
  }

  async deleteCustomer(
    id: string,
    organizationId: string,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<Customer> {
    const existingCustomer = await prisma.customer.findFirst({
      where: {
        id,
        organizationId,
        deletedAt: null
      }
    });

    if (!existingCustomer) {
      throw new Error('Customer not found');
    }

    // Check if customer has active quotes/invoices/projects
    const activeRelations = await prisma.customer.findFirst({
      where: { id },
      include: {
        _count: {
          select: {
            quotes: { where: { status: { notIn: ['CANCELLED', 'EXPIRED'] }, deletedAt: null } },
            invoices: { where: { status: { not: 'CANCELLED' }, deletedAt: null } },
            projects: { where: { status: 'IN_PROGRESS', deletedAt: null } }
          }
        }
      }
    });

    const hasActiveRelations =
      (activeRelations?._count.quotes || 0) > 0 ||
      (activeRelations?._count.invoices || 0) > 0 ||
      (activeRelations?._count.projects || 0) > 0;

    if (hasActiveRelations) {
      throw new Error('Cannot delete customer with active quotes, invoices, or projects');
    }

    const deletedCustomer = await prisma.customer.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        status: CustomerStatus.ARCHIVED,
        updatedAt: new Date()
      }
    });

    await auditService.logDelete(
      'Customer',
      id,
      existingCustomer,
      {
        organizationId,
        userId: auditContext.userId,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent
      }
    );

    return deletedCustomer;
  }

  async getCustomerStats(
    id: string,
    organizationId: string
  ): Promise<any> {
    const customer = await prisma.customer.findFirst({
      where: {
        id,
        organizationId,
        deletedAt: null
      }
    });

    if (!customer) {
      throw new Error('Customer not found');
    }

    const [
      quoteCount,
      invoiceCount,
      paymentCount,
      totalRevenue,
      activeProjects,
      lastQuoteDate,
      lastInvoiceDate
    ] = await Promise.all([
      prisma.quote.count({
        where: { customerId: id, deletedAt: null }
      }),
      prisma.invoice.count({
        where: { customerId: id, deletedAt: null }
      }),
      prisma.payment.count({
        where: { customerId: id, deletedAt: null }
      }),
      prisma.payment.aggregate({
        where: {
          customerId: id,
          status: 'COMPLETED',
          deletedAt: null
        },
        _sum: { amount: true }
      }),
      prisma.project.count({
        where: {
          customerId: id,
          status: 'IN_PROGRESS',
          deletedAt: null
        }
      }),
      prisma.quote.findFirst({
        where: { customerId: id, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true }
      }),
      prisma.invoice.findFirst({
        where: { customerId: id, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true }
      })
    ]);

    return {
      quotes: quoteCount,
      invoices: invoiceCount,
      payments: paymentCount,
      totalRevenue: totalRevenue._sum.amount || 0,
      activeProjects,
      lastQuoteDate: lastQuoteDate?.createdAt,
      lastInvoiceDate: lastInvoiceDate?.createdAt
    };
  }

  private async generateCustomerNumber(organizationId: string): Promise<string> {
    const count = await prisma.customer.count({
      where: { organizationId }
    });
    return `CUST-${String(count + 1).padStart(6, '0')}`;
  }

  // Helper method to determine customer type
  getCustomerType(customer: Customer & { person?: Person | null; business?: Business | null }): CustomerType {
    return customer.personId ? CustomerType.PERSON : CustomerType.BUSINESS;
  }
}

export const customerService = new CustomerService();