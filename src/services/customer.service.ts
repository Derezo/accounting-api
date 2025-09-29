import { Customer, Person, Business } from '@prisma/client';
import { CustomerTier, CustomerType, CustomerStatus } from '../types/enums';
import { auditService } from './audit.service';
import { prisma } from '../config/database';
import { FieldEncryptionService } from './field-encryption.service';

export interface CustomerStats {
  quotes: number;
  invoices: number;
  payments: number;
  totalRevenue: number;
  activeProjects: number;
}

interface EncryptedPersonData {
  firstName: string;
  lastName: string;
  middleName?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  dateOfBirth?: Date;
  socialInsNumber?: string;
}

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

class CustomerService {
  private fieldEncryption: FieldEncryptionService;

  constructor() {
    this.fieldEncryption = new FieldEncryptionService();
  }

  /**
   * Encrypt PII fields for person data
   */
  private async encryptPersonPII(
    personData: CreateCustomerData['personData'] | UpdateCustomerData['personData'],
    organizationId: string
  ): Promise<EncryptedPersonData | null> {
    if (!personData) return null;

    const encrypted: EncryptedPersonData = {
      firstName: personData.firstName || '',
      lastName: personData.lastName || '',
      middleName: personData.middleName,
    };

    // Encrypt sensitive fields
    if ('socialInsNumber' in personData && personData.socialInsNumber) {
      encrypted.socialInsNumber = await this.fieldEncryption.encryptField(
        personData.socialInsNumber,
        { organizationId, fieldName: 'socialInsNumber', deterministic: false }
      );
    }

    if (personData.email) {
      encrypted.email = await this.fieldEncryption.encryptField(
        personData.email,
        { organizationId, fieldName: 'email', deterministic: true, searchable: true }
      );
    }

    if (personData.phone) {
      encrypted.phone = await this.fieldEncryption.encryptField(
        personData.phone,
        { organizationId, fieldName: 'phone', deterministic: true }
      );
    }

    if (personData.mobile) {
      encrypted.mobile = await this.fieldEncryption.encryptField(
        personData.mobile,
        { organizationId, fieldName: 'mobile', deterministic: true }
      );
    }

    if (personData.dateOfBirth) {
      encrypted.dateOfBirth = new Date(personData.dateOfBirth);
    }

    return encrypted;
  }

  /**
   * Decrypt PII fields for person data
   */
  private async decryptPersonPII(person: Person, organizationId: string): Promise<Person | null> {
    if (!person) return null;

    const decrypted: Person = {
      ...person,
    };

    // Decrypt sensitive fields
    if (person.socialInsNumber) {
      try {
        const result = await this.fieldEncryption.decryptField(
          person.socialInsNumber,
          { organizationId, fieldName: 'socialInsNumber' }
        );
        decrypted.socialInsNumber = result;
      } catch (error) {
        console.error('Failed to decrypt socialInsNumber:', error);
        decrypted.socialInsNumber = '[ENCRYPTED]';
      }
    }

    if (person.email) {
      try {
        const result = await this.fieldEncryption.decryptField(
          person.email,
          { organizationId, fieldName: 'email' }
        );
        decrypted.email = result;
      } catch (error) {
        console.error('Failed to decrypt email:', error);
        decrypted.email = '[ENCRYPTED]';
      }
    }

    if (person.phone) {
      try {
        const result = await this.fieldEncryption.decryptField(
          person.phone,
          { organizationId, fieldName: 'phone' }
        );
        decrypted.phone = result;
      } catch (error) {
        console.error('Failed to decrypt phone:', error);
        decrypted.phone = '[ENCRYPTED]';
      }
    }

    if (person.mobile) {
      try {
        const result = await this.fieldEncryption.decryptField(
          person.mobile,
          { organizationId, fieldName: 'mobile' }
        );
        decrypted.mobile = result;
      } catch (error) {
        console.error('Failed to decrypt mobile:', error);
        decrypted.mobile = '[ENCRYPTED]';
      }
    }

    return decrypted;
  }
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
        // Encrypt PII data before storing
        const encryptedPersonData = await this.encryptPersonPII(data.personData, organizationId);

        if (encryptedPersonData) {
          const person = await tx.person.create({
            data: {
              organizationId,
              firstName: encryptedPersonData.firstName,
              lastName: encryptedPersonData.lastName,
              middleName: encryptedPersonData.middleName,
              email: encryptedPersonData.email,
              phone: encryptedPersonData.phone,
              mobile: encryptedPersonData.mobile,
              dateOfBirth: encryptedPersonData.dateOfBirth,
              socialInsNumber: encryptedPersonData.socialInsNumber
            }
          });
          personId = person.id;
        }
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

    // Log customer creation for audit trail
    try {
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
    } catch (auditError) {
      // Audit failures should not break customer creation
      console.error('Audit logging failed for customer creation:', auditError);
    }

    return customer;
  }

  async getCustomer(
    id: string,
    organizationId: string,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<(Customer & { person?: Person | null; business?: Business | null; addresses?: unknown[] }) | null> {
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

      // Decrypt PII data before returning
      if (customer.person) {
        const decryptedPerson = await this.decryptPersonPII(customer.person, organizationId);
        if (decryptedPerson) {
          customer.person = decryptedPerson;
        }
      }
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
        // Encrypt PII data before updating
        const encryptedPersonData = await this.encryptPersonPII(data.personData, organizationId);

        if (encryptedPersonData) {
          const updatedPerson = await tx.person.update({
            where: { id: customer.personId },
            data: {
              firstName: encryptedPersonData.firstName,
              lastName: encryptedPersonData.lastName,
              middleName: encryptedPersonData.middleName,
              email: encryptedPersonData.email,
              phone: encryptedPersonData.phone,
              mobile: encryptedPersonData.mobile,
              dateOfBirth: encryptedPersonData.dateOfBirth,
              socialInsNumber: encryptedPersonData.socialInsNumber,
              updatedAt: new Date()
            }
          });
          customer.person = updatedPerson;
        }
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

    // Decrypt PII data before returning
    if (updatedCustomer.person) {
      const decryptedPerson = await this.decryptPersonPII(updatedCustomer.person, organizationId);
      if (decryptedPerson) {
        updatedCustomer.person = decryptedPerson;
      }
    }

    return updatedCustomer;
  }

  async listCustomers(
    filters: CustomerFilters,
    organizationId: string
  ): Promise<{ customers: (Customer & { person?: Person | null; business?: Business | null })[], total: number }> {
    const where: Record<string, unknown> = {
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

    // Decrypt PII data for all customers with person data
    const decryptedCustomers = await Promise.all(
      customers.map(async (customer) => {
        if (customer.person) {
          const decryptedPerson = await this.decryptPersonPII(customer.person, organizationId);
          if (decryptedPerson) {
            customer.person = decryptedPerson;
          }
        }
        return customer;
      })
    );

    return { customers: decryptedCustomers, total };
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
  ): Promise<CustomerStats> {
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
      activeProjects
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
      })
    ]);

    return {
      quotes: quoteCount,
      invoices: invoiceCount,
      payments: paymentCount,
      totalRevenue: Number(totalRevenue._sum.amount) || 0,
      activeProjects
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