/**
 * Organization Seeder - Seeds organizations with initial setup
 */

import { BaseSeeder, SeedOptions, SeedResult } from './base-seeder';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

export interface OrganizationSeedData {
  name: string;
  legalName?: string;
  domain?: string;
  type: string;
  email: string;
  phone: string;
  website?: string;
  businessNumber?: string;
  taxNumber?: string;
  adminUser: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    role: string;
  };
  address: {
    line1: string;
    line2?: string;
    city: string;
    stateProvince: string;
    postalCode: string;
    countryCode: string;
  };
}

export class OrganizationSeeder extends BaseSeeder {
  get name(): string {
    return 'OrganizationSeeder';
  }

  async seed(options: SeedOptions): Promise<SeedResult> {
    let recordsCreated = 0;

    if (options.environment === 'development') {
      // Create master/demo organizations for development
      const organizations = await this.createDevelopmentOrganizations();
      recordsCreated += organizations;
    } else if (options.environment === 'testing') {
      // Create test organizations
      const organizations = await this.createTestOrganizations();
      recordsCreated += organizations;
    } else if (options.environment === 'staging') {
      // Create staging organization
      const organizations = await this.createStagingOrganization();
      recordsCreated += organizations;
    }

    return {
      seederName: this.name,
      environment: options.environment,
      recordsCreated,
      timeTaken: 0,
      success: true,
      errors: [],
    };
  }

  async clean(options: SeedOptions): Promise<void> {
    this.logger.info('Cleaning organizations...');

    // Clean in dependency order
    await this.prisma.auditLog.deleteMany();
    await this.prisma.session.deleteMany();
    await this.prisma.user.deleteMany();
    await this.prisma.address.deleteMany();
    await this.prisma.organization.deleteMany();

    this.logger.info('Organizations cleaned');
  }

  private async createDevelopmentOrganizations(): Promise<number> {
    this.logger.info('Creating development organizations...');

    const organizations: OrganizationSeedData[] = [
      {
        name: 'Lifestream Dynamics',
        legalName: 'Lifestream Dynamics Inc.',
        domain: 'lifestreamdynamics.com',
        type: 'SINGLE_BUSINESS',
        email: 'admin@lifestreamdynamics.com',
        phone: this.generateCanadianPhone(),
        website: 'https://lifestreamdynamics.com',
        businessNumber: this.generateCanadianBusinessNumber(),
        taxNumber: 'HST' + Math.floor(Math.random() * 1000000000),
        adminUser: {
          firstName: 'Admin',
          lastName: 'User',
          email: 'admin@lifestreamdynamics.com',
          password: 'SecurePassword123!',
          role: 'SUPER_ADMIN',
        },
        address: {
          line1: '123 Technology Drive',
          line2: 'Suite 400',
          city: 'Toronto',
          stateProvince: 'Ontario',
          postalCode: 'M5V 3A8',
          countryCode: 'CA',
        },
      },
      {
        name: 'TechCorp Solutions',
        legalName: 'TechCorp Solutions Ltd.',
        domain: 'techcorp.ca',
        type: 'SINGLE_BUSINESS',
        email: 'contact@techcorp.ca',
        phone: this.generateCanadianPhone(),
        website: 'https://techcorp.ca',
        businessNumber: this.generateCanadianBusinessNumber(),
        taxNumber: 'HST' + Math.floor(Math.random() * 1000000000),
        adminUser: {
          firstName: 'Sarah',
          lastName: 'Johnson',
          email: 'sarah.johnson@techcorp.ca',
          password: 'TechCorp2024!',
          role: 'ADMIN',
        },
        address: {
          line1: '456 Innovation Boulevard',
          city: 'Vancouver',
          stateProvince: 'British Columbia',
          postalCode: 'V6B 1A1',
          countryCode: 'CA',
        },
      },
      {
        name: 'Creative Digital Agency',
        legalName: 'Creative Digital Agency Corp.',
        domain: 'creativedigital.ca',
        type: 'SINGLE_BUSINESS',
        email: 'hello@creativedigital.ca',
        phone: this.generateCanadianPhone(),
        website: 'https://creativedigital.ca',
        businessNumber: this.generateCanadianBusinessNumber(),
        taxNumber: 'HST' + Math.floor(Math.random() * 1000000000),
        adminUser: {
          firstName: 'Mike',
          lastName: 'Chen',
          email: 'mike.chen@creativedigital.ca',
          password: 'Creative123!',
          role: 'ADMIN',
        },
        address: {
          line1: '789 Design Street',
          line2: 'Floor 2',
          city: 'Montreal',
          stateProvince: 'Quebec',
          postalCode: 'H3B 2Y7',
          countryCode: 'CA',
        },
      },
      {
        name: 'Consultant Pro Services',
        legalName: 'Consultant Pro Services Inc.',
        domain: 'consultantpro.ca',
        type: 'SINGLE_BUSINESS',
        email: 'info@consultantpro.ca',
        phone: this.generateCanadianPhone(),
        website: 'https://consultantpro.ca',
        businessNumber: this.generateCanadianBusinessNumber(),
        taxNumber: 'HST' + Math.floor(Math.random() * 1000000000),
        adminUser: {
          firstName: 'Jennifer',
          lastName: 'Williams',
          email: 'jennifer.williams@consultantpro.ca',
          password: 'Consultant2024!',
          role: 'ADMIN',
        },
        address: {
          line1: '321 Business Plaza',
          line2: 'Unit 150',
          city: 'Calgary',
          stateProvince: 'Alberta',
          postalCode: 'T2P 2M5',
          countryCode: 'CA',
        },
      },
    ];

    let created = 0;
    for (const orgData of organizations) {
      await this.createOrganizationWithSetup(orgData);
      created++;
      this.logProgress('Creating development organizations', created, organizations.length);
    }

    this.logger.info(`Created ${created} development organizations`);
    return created;
  }

  private async createTestOrganizations(): Promise<number> {
    this.logger.info('Creating test organizations...');

    const organizations: OrganizationSeedData[] = [
      {
        name: 'Test Organization',
        legalName: 'Test Organization Inc.',
        domain: 'test.example.com',
        type: 'SINGLE_BUSINESS',
        email: 'test@example.com',
        phone: '+1 (555) 123-4567',
        website: 'https://test.example.com',
        businessNumber: '123456789RT0001',
        taxNumber: 'HST123456789',
        adminUser: {
          firstName: 'Test',
          lastName: 'Admin',
          email: 'test@example.com',
          password: 'TestPassword123!',
          role: 'ADMIN',
        },
        address: {
          line1: '123 Test Street',
          city: 'Test City',
          stateProvince: 'Ontario',
          postalCode: 'T1T 1T1',
          countryCode: 'CA',
        },
      },
    ];

    let created = 0;
    for (const orgData of organizations) {
      await this.createOrganizationWithSetup(orgData);
      created++;
    }

    this.logger.info(`Created ${created} test organizations`);
    return created;
  }

  private async createStagingOrganization(): Promise<number> {
    this.logger.info('Creating staging organization...');

    const organization: OrganizationSeedData = {
      name: 'Staging Environment',
      legalName: 'Staging Environment Inc.',
      domain: 'staging.lifestreamdynamics.com',
      type: 'SINGLE_BUSINESS',
      email: 'staging@lifestreamdynamics.com',
      phone: this.generateCanadianPhone(),
      website: 'https://staging.lifestreamdynamics.com',
      businessNumber: this.generateCanadianBusinessNumber(),
      taxNumber: 'HST' + Math.floor(Math.random() * 1000000000),
      adminUser: {
        firstName: 'Staging',
        lastName: 'Admin',
        email: 'staging@lifestreamdynamics.com',
        password: 'StagingPassword123!',
        role: 'ADMIN',
      },
      address: {
        line1: '123 Staging Drive',
        city: 'Toronto',
        stateProvince: 'Ontario',
        postalCode: 'M5V 3A8',
        countryCode: 'CA',
      },
    };

    await this.createOrganizationWithSetup(organization);

    this.logger.info('Created staging organization');
    return 1;
  }

  private async createOrganizationWithSetup(orgData: OrganizationSeedData): Promise<string> {
    this.logger.info(`Creating organization: ${orgData.name}`);

    return await this.prisma.$transaction(async (tx) => {
      // Get country
      const country = await tx.country.findUnique({
        where: { code: orgData.address.countryCode },
      });

      if (!country) {
        throw new Error(`Country not found: ${orgData.address.countryCode}`);
      }

      // Create address
      const address = await tx.address.create({
        data: {
          line1: orgData.address.line1,
          line2: orgData.address.line2,
          city: orgData.address.city,
          stateProvince: orgData.address.stateProvince,
          postalCode: orgData.address.postalCode,
          countryId: country.id,
          organizationId: 'temp', // Will be updated after organization creation
        },
      });

      // Generate encryption key for organization
      const encryptionKey = crypto.randomBytes(32).toString('hex');

      // Create organization
      const organization = await tx.organization.create({
        data: {
          name: orgData.name,
          legalName: orgData.legalName,
          domain: orgData.domain,
          type: orgData.type,
          email: orgData.email,
          phone: orgData.phone,
          website: orgData.website,
          businessNumber: orgData.businessNumber,
          taxNumber: orgData.taxNumber,
          encryptionKey,
          isActive: true,
          settings: JSON.stringify({
            defaultCurrency: 'CAD',
            defaultTaxRate: 0.13,
            depositPercentage: 0.25,
            paymentTermsDays: 15,
            quoteValidityDays: 30,
            timeZone: 'America/Toronto',
            dateFormat: 'YYYY-MM-DD',
            numberFormat: 'en-CA',
          }),
        },
      });

      // Update address with correct organization ID
      await tx.address.update({
        where: { id: address.id },
        data: { organizationId: organization.id },
      });

      // Create admin user
      const passwordHash = await bcrypt.hash(orgData.adminUser.password, 12);

      const adminUser = await tx.user.create({
        data: {
          organizationId: organization.id,
          email: orgData.adminUser.email,
          passwordHash,
          role: orgData.adminUser.role,
          firstName: orgData.adminUser.firstName,
          lastName: orgData.adminUser.lastName,
          isActive: true,
          emailVerified: true,
        },
      });

      // Create default chart of accounts
      await this.createDefaultChartOfAccounts(tx, organization.id);

      // Create default location
      await tx.location.create({
        data: {
          organizationId: organization.id,
          name: 'Head Office',
          code: 'HO',
          addressId: address.id,
          phone: orgData.phone,
          email: orgData.email,
          isHeadquarters: true,
          isActive: true,
        },
      });

      this.logger.info(`Created organization: ${organization.name} (${organization.id})`);
      return organization.id;
    });
  }

  private async createDefaultChartOfAccounts(tx: any, organizationId: string): Promise<void> {
    const accounts = [
      // Assets
      { accountNumber: '1000', name: 'Cash', type: 'ASSET', parentId: null },
      { accountNumber: '1100', name: 'Accounts Receivable', type: 'ASSET', parentId: null },
      { accountNumber: '1200', name: 'Inventory', type: 'ASSET', parentId: null },
      { accountNumber: '1300', name: 'Prepaid Expenses', type: 'ASSET', parentId: null },
      { accountNumber: '1500', name: 'Equipment', type: 'ASSET', parentId: null },
      { accountNumber: '1600', name: 'Accumulated Depreciation - Equipment', type: 'ASSET', parentId: null },

      // Liabilities
      { accountNumber: '2000', name: 'Accounts Payable', type: 'LIABILITY', parentId: null },
      { accountNumber: '2100', name: 'Accrued Liabilities', type: 'LIABILITY', parentId: null },
      { accountNumber: '2200', name: 'Sales Tax Payable', type: 'LIABILITY', parentId: null },
      { accountNumber: '2300', name: 'Payroll Liabilities', type: 'LIABILITY', parentId: null },

      // Equity
      { accountNumber: '3000', name: 'Owner\'s Equity', type: 'EQUITY', parentId: null },
      { accountNumber: '3100', name: 'Retained Earnings', type: 'EQUITY', parentId: null },

      // Revenue
      { accountNumber: '4000', name: 'Service Revenue', type: 'REVENUE', parentId: null },
      { accountNumber: '4100', name: 'Product Sales', type: 'REVENUE', parentId: null },
      { accountNumber: '4200', name: 'Other Revenue', type: 'REVENUE', parentId: null },

      // Expenses
      { accountNumber: '5000', name: 'Cost of Goods Sold', type: 'EXPENSE', parentId: null },
      { accountNumber: '6000', name: 'Office Expenses', type: 'EXPENSE', parentId: null },
      { accountNumber: '6100', name: 'Marketing Expenses', type: 'EXPENSE', parentId: null },
      { accountNumber: '6200', name: 'Travel Expenses', type: 'EXPENSE', parentId: null },
      { accountNumber: '6300', name: 'Professional Fees', type: 'EXPENSE', parentId: null },
      { accountNumber: '6400', name: 'Utilities', type: 'EXPENSE', parentId: null },
      { accountNumber: '6500', name: 'Insurance', type: 'EXPENSE', parentId: null },
      { accountNumber: '6600', name: 'Depreciation Expense', type: 'EXPENSE', parentId: null },
    ];

    await tx.account.createMany({
      data: accounts.map(account => ({
        ...account,
        organizationId,
        isActive: true,
        isSystemAccount: true,
      })),
    });
  }

  /**
   * Create a specific organization (useful for production setup)
   */
  async createSpecificOrganization(orgData: OrganizationSeedData): Promise<string> {
    this.logger.info(`Creating specific organization: ${orgData.name}`);
    return await this.createOrganizationWithSetup(orgData);
  }
}

export default OrganizationSeeder;