import { PrismaClient, Organization } from '@prisma/client';
import { generateRandomToken } from '../utils/crypto';
import { OrganizationType } from '../types/enums';
import { auditService } from './audit.service';

const prisma = new PrismaClient();

interface CreateOrganizationData {
  name: string;
  legalName?: string;
  domain?: string;
  type?: OrganizationType;
  email: string;
  phone: string;
  website?: string;
  businessNumber?: string;
  taxNumber?: string;
}

interface UpdateOrganizationData {
  name?: string;
  legalName?: string;
  domain?: string;
  type?: OrganizationType;
  email?: string;
  phone?: string;
  website?: string;
  businessNumber?: string;
  taxNumber?: string;
  isActive?: boolean;
}

interface OrganizationFilters {
  type?: OrganizationType;
  isActive?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}

export class OrganizationService {
  async createOrganization(
    data: CreateOrganizationData,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<Organization> {
    const encryptionKey = generateRandomToken(32);

    const organization = await prisma.organization.create({
      data: {
        ...data,
        type: data.type || OrganizationType.SINGLE_BUSINESS,
        encryptionKey,
        isActive: true
      }
    });

    await auditService.logCreate(
      'Organization',
      organization.id,
      organization,
      {
        organizationId: organization.id,
        userId: auditContext.userId,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent
      }
    );

    return organization;
  }

  async getOrganization(
    id: string,
    requestingOrgId: string,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<Organization | null> {
    // Super admins can view any organization, others only their own
    const where = { id };

    const organization = await prisma.organization.findUnique({
      where,
      include: {
        _count: {
          select: {
            users: true,
            customers: true,
            quotes: true,
            invoices: true,
            payments: true
          }
        }
      }
    });

    if (organization) {
      await auditService.logView(
        'Organization',
        organization.id,
        {
          organizationId: requestingOrgId,
          userId: auditContext.userId,
          ipAddress: auditContext.ipAddress,
          userAgent: auditContext.userAgent
        }
      );
    }

    return organization;
  }

  async updateOrganization(
    id: string,
    data: UpdateOrganizationData,
    requestingOrgId: string,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<Organization> {
    // Only allow updating own organization unless super admin
    if (requestingOrgId !== id) {
      throw new Error('Access denied');
    }

    const existingOrg = await prisma.organization.findUnique({
      where: { id }
    });

    if (!existingOrg) {
      throw new Error('Organization not found');
    }

    const updatedOrganization = await prisma.organization.update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date()
      }
    });

    await auditService.logUpdate(
      'Organization',
      id,
      existingOrg,
      updatedOrganization,
      {
        organizationId: requestingOrgId,
        userId: auditContext.userId,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent
      }
    );

    return updatedOrganization;
  }

  async listOrganizations(
    filters: OrganizationFilters,
    isSuperAdmin: boolean = false
  ): Promise<{ organizations: Organization[]; total: number }> {
    if (!isSuperAdmin) {
      throw new Error('Access denied - only super admins can list all organizations');
    }

    const where: any = {};

    if (filters.type) {
      where.type = filters.type;
    }

    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }

    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { domain: { contains: filters.search, mode: 'insensitive' } },
        { email: { contains: filters.search, mode: 'insensitive' } }
      ];
    }

    const [organizations, total] = await Promise.all([
      prisma.organization.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: filters.limit || 50,
        skip: filters.offset || 0,
        include: {
          _count: {
            select: {
              users: true,
              customers: true
            }
          }
        }
      }),
      prisma.organization.count({ where })
    ]);

    return { organizations, total };
  }

  async deactivateOrganization(
    id: string,
    requestingOrgId: string,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<Organization> {
    // Only super admins can deactivate organizations
    if (requestingOrgId !== 'super-admin') {
      throw new Error('Access denied - only super admins can deactivate organizations');
    }

    const existingOrg = await prisma.organization.findUnique({
      where: { id }
    });

    if (!existingOrg) {
      throw new Error('Organization not found');
    }

    if (!existingOrg.isActive) {
      throw new Error('Organization is already deactivated');
    }

    const deactivatedOrganization = await prisma.$transaction(async (tx) => {
      // Deactivate organization
      const org = await tx.organization.update({
        where: { id },
        data: {
          isActive: false,
          updatedAt: new Date()
        }
      });

      // Deactivate all users
      await tx.user.updateMany({
        where: { organizationId: id },
        data: { isActive: false }
      });

      return org;
    });

    await auditService.logUpdate(
      'Organization',
      id,
      existingOrg,
      deactivatedOrganization,
      {
        organizationId: requestingOrgId,
        userId: auditContext.userId,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent
      }
    );

    return deactivatedOrganization;
  }

  async getOrganizationStats(
    id: string,
    requestingOrgId: string
  ): Promise<any> {
    if (requestingOrgId !== id) {
      throw new Error('Access denied');
    }

    const [
      userCount,
      customerCount,
      quoteCount,
      invoiceCount,
      paymentCount,
      totalRevenue,
      activeProjects
    ] = await Promise.all([
      prisma.user.count({
        where: { organizationId: id, isActive: true }
      }),
      prisma.customer.count({
        where: { organizationId: id, deletedAt: null }
      }),
      prisma.quote.count({
        where: { organizationId: id, deletedAt: null }
      }),
      prisma.invoice.count({
        where: { organizationId: id, deletedAt: null }
      }),
      prisma.payment.count({
        where: { organizationId: id, deletedAt: null }
      }),
      prisma.payment.aggregate({
        where: {
          organizationId: id,
          status: 'COMPLETED',
          deletedAt: null
        },
        _sum: { amount: true }
      }),
      prisma.project.count({
        where: {
          organizationId: id,
          status: 'IN_PROGRESS',
          deletedAt: null
        }
      })
    ]);

    return {
      users: userCount,
      customers: customerCount,
      quotes: quoteCount,
      invoices: invoiceCount,
      payments: paymentCount,
      totalRevenue: totalRevenue._sum.amount || 0,
      activeProjects
    };
  }

  async validateDomain(domain: string, excludeOrgId?: string): Promise<boolean> {
    const existing = await prisma.organization.findUnique({
      where: { domain }
    });

    return !existing || existing.id === excludeOrgId;
  }

  async getOrganizationSettings(
    id: string,
    requestingOrgId: string
  ): Promise<any> {
    if (requestingOrgId !== id) {
      throw new Error('Access denied');
    }

    const org = await prisma.organization.findUnique({
      where: { id },
      select: { settings: true }
    });

    return org?.settings ? JSON.parse(org.settings) : {};
  }

  async updateOrganizationSettings(
    id: string,
    settings: any,
    requestingOrgId: string,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<any> {
    if (requestingOrgId !== id) {
      throw new Error('Access denied');
    }

    const existingOrg = await prisma.organization.findUnique({
      where: { id }
    });

    if (!existingOrg) {
      throw new Error('Organization not found');
    }

    const updatedOrg = await prisma.organization.update({
      where: { id },
      data: {
        settings: JSON.stringify(settings),
        updatedAt: new Date()
      }
    });

    await auditService.logUpdate(
      'OrganizationSettings',
      id,
      { settings: existingOrg.settings },
      { settings: updatedOrg.settings },
      {
        organizationId: requestingOrgId,
        userId: auditContext.userId,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent
      }
    );

    return JSON.parse(updatedOrg.settings || '{}');
  }
}

export const organizationService = new OrganizationService();