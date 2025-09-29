import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

export interface TestOrganization {
  id: string;
  name: string;
  encryptionKey: string;
}

export interface TestUser {
  id: string;
  email: string;
  password: string;
  role: string;
  organizationId: string;
  token?: string;
}

export interface TestData {
  organizations: TestOrganization[];
  users: TestUser[];
  customers: any[];
  invoices: any[];
  quotes: any[];
  payments: any[];
  projects: any[];
  accounts: any[];
}

/**
 * Comprehensive RBAC Test Data Generator
 * Creates realistic test data for all user roles and cross-organization scenarios
 */
export class RBACTestDataGenerator {
  private testData: TestData = {
    organizations: [],
    users: [],
    customers: [],
    invoices: [],
    quotes: [],
    payments: [],
    projects: [],
    accounts: []
  };

  /**
   * Generate encryption key for organization
   */
  private generateEncryptionKey(): string {
    return randomUUID().replace(/-/g, '');
  }

  /**
   * Hash password for user
   */
  private async hashPassword(password: string): Promise<string> {
    return await bcrypt.hash(password, 12);
  }

  /**
   * Create test organizations
   */
  async createTestOrganizations(): Promise<void> {
    console.log('🏢 Creating test organizations...');

    const organizations = [
      {
        name: 'Primary Test Organization',
        legalName: 'Primary Test Corp',
        domain: 'primarytest.com',
        type: 'ENTERPRISE',
        email: 'admin@primarytest.com',
        phone: '+1-555-0001'
      },
      {
        name: 'Secondary Test Organization',
        legalName: 'Secondary Test Ltd',
        domain: 'secondarytest.com',
        type: 'SINGLE_BUSINESS',
        email: 'admin@secondarytest.com',
        phone: '+1-555-0002'
      },
      {
        name: 'Cross-Test Organization',
        legalName: 'Cross-Test Inc',
        domain: 'crosstest.com',
        type: 'MULTI_LOCATION',
        email: 'admin@crosstest.com',
        phone: '+1-555-0003'
      }
    ];

    for (const orgData of organizations) {
      const org = await prisma.organization.create({
        data: {
          ...orgData,
          encryptionKey: this.generateEncryptionKey(),
          isActive: true
        }
      });

      this.testData.organizations.push({
        id: org.id,
        name: org.name,
        encryptionKey: org.encryptionKey
      });
    }
  }

  /**
   * Create test users for all roles across organizations
   */
  async createTestUsers(): Promise<void> {
    console.log('👥 Creating test users for all roles...');

    const userRoles = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'EMPLOYEE', 'VIEWER', 'CLIENT'];
    const basePassword = 'TestPass123!';

    for (const org of this.testData.organizations) {
      for (const role of userRoles) {
        // Create primary user for each role in each organization
        const primaryUser = {
          email: `${role.toLowerCase()}@${org.name.toLowerCase().replace(/\\s+/g, '')}.com`,
          passwordHash: await this.hashPassword(basePassword),
          role: role,
          organizationId: org.id,
          firstName: `${role} User`,
          lastName: 'Test',
          isActive: true,
          emailVerified: true
        };

        const user = await prisma.user.create({
          data: primaryUser
        });

        this.testData.users.push({
          id: user.id,
          email: user.email,
          password: basePassword,
          role: user.role,
          organizationId: user.organizationId
        });

        // Create secondary user for cross-testing scenarios
        if (role !== 'SUPER_ADMIN') {
          const secondaryUser = {
            email: `${role.toLowerCase()}.secondary@${org.name.toLowerCase().replace(/\\s+/g, '')}.com`,
            passwordHash: await this.hashPassword(basePassword),
            role: role,
            organizationId: org.id,
            firstName: `${role} User`,
            lastName: 'Secondary',
            isActive: true,
            emailVerified: true
          };

          const secondUser = await prisma.user.create({
            data: secondaryUser
          });

          this.testData.users.push({
            id: secondUser.id,
            email: secondUser.email,
            password: basePassword,
            role: secondUser.role,
            organizationId: secondUser.organizationId
          });
        }
      }
    }
  }

  /**
   * Create test business entities for each organization
   */
  async createTestBusinessEntities(): Promise<void> {
    console.log('🏢 Creating test business entities...');

    for (const org of this.testData.organizations) {
      // Create test businesses
      const business = await prisma.business.create({
        data: {
          organizationId: org.id,
          legalName: `${org.name} Client Business Ltd`,
          tradeName: `${org.name} Client`,
          businessNumber: `BN${Math.floor(Math.random() * 1000000000)}RT0001`,
          taxNumber: `CA${Math.floor(Math.random() * 1000000000)}`,
          businessType: 'CORPORATION',
          email: `client@${org.name.toLowerCase().replace(/\\s+/g, '')}-client.com`,
          phone: '+1-555-9999'
        }
      });

      // Create test customers
      const customer = await prisma.customer.create({
        data: {
          organizationId: org.id,
          customerNumber: `CUST-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`,
          businessId: business.id,
          tier: 'ENTERPRISE',
          status: 'ACTIVE',
          creditLimit: 50000,
          paymentTerms: 30,
          taxExempt: false,
          preferredCurrency: 'CAD',
          notes: `Test customer for ${org.name}`
        }
      });

      this.testData.customers.push({
        id: customer.id,
        organizationId: org.id,
        customerNumber: customer.customerNumber,
        businessId: business.id
      });
    }
  }

  /**
   * Create test financial data
   */
  async createTestFinancialData(): Promise<void> {
    console.log('💰 Creating test financial data...');

    for (const org of this.testData.organizations) {
      const customer = this.testData.customers.find(c => c.organizationId === org.id);
      if (!customer) continue;

      // Create chart of accounts
      const accounts = [
        { name: 'Cash', type: 'ASSET', code: '1000' },
        { name: 'Accounts Receivable', type: 'ASSET', code: '1200' },
        { name: 'Revenue', type: 'REVENUE', code: '4000' },
        { name: 'Operating Expenses', type: 'EXPENSE', code: '5000' }
      ];

      for (const accountData of accounts) {
        const account = await prisma.account.create({
          data: {
            organizationId: org.id,
            accountNumber: accountData.code,
            name: accountData.name,
            type: accountData.type,
            isActive: true,
            balance: 0
          }
        });

        this.testData.accounts.push({
          id: account.id,
          organizationId: org.id,
          name: account.name,
          type: account.type,
          code: account.accountNumber
        });
      }

      // Get a user to use as creator
      const adminUser = this.testData.users.find(u =>
        u.organizationId === org.id && u.role === 'ADMIN'
      );

      // Create test quote
      const quote = await prisma.quote.create({
        data: {
          organizationId: org.id,
          quoteNumber: `QTE-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`,
          customerId: customer.id,
          createdById: adminUser?.id || 'default-user-id',
          status: 'SENT',
          validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
          currency: 'CAD',
          exchangeRate: 1.0,
          subtotal: 1000,
          taxAmount: 130,
          total: 1130,
          terms: 'Standard terms and conditions'
        }
      });

      // Create quote items
      await prisma.quoteItem.create({
        data: {
          quoteId: quote.id,
          description: 'Professional Services',
          quantity: 10,
          unitPrice: 100,
          discountPercent: 0,
          taxRate: 0.13,
          subtotal: 1000,
          discountAmount: 0,
          taxAmount: 130,
          total: 1130,
          sortOrder: 1
        }
      });

      this.testData.quotes.push({
        id: quote.id,
        organizationId: org.id,
        customerId: customer.id,
        quoteNumber: quote.quoteNumber
      });

      // Create test invoice
      const invoice = await prisma.invoice.create({
        data: {
          organizationId: org.id,
          invoiceNumber: `INV-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`,
          customerId: customer.id,
          quoteId: quote.id,
          status: 'SENT',
          issueDate: new Date(),
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          currency: 'CAD',
          exchangeRate: 1.0,
          subtotal: 1000,
          taxAmount: 130,
          total: 1130,
          depositRequired: 0,
          amountPaid: 0,
          balance: 1130,
          terms: 'Payment due within 30 days'
        }
      });

      // Create invoice items
      await prisma.invoiceItem.create({
        data: {
          invoiceId: invoice.id,
          description: 'Professional Services',
          quantity: 10,
          unitPrice: 100,
          discountPercent: 0,
          taxRate: 0.13,
          subtotal: 1000,
          discountAmount: 0,
          taxAmount: 130,
          total: 1130,
          sortOrder: 1
        }
      });

      this.testData.invoices.push({
        id: invoice.id,
        organizationId: org.id,
        customerId: customer.id,
        invoiceNumber: invoice.invoiceNumber
      });

      // Create test payment
      const payment = await prisma.payment.create({
        data: {
          organizationId: org.id,
          paymentNumber: `PAY-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`,
          customerId: customer.id,
          invoiceId: invoice.id,
          paymentMethod: 'STRIPE_CARD',
          amount: 1130,
          currency: 'CAD',
          paymentDate: new Date(),
          status: 'COMPLETED',
          netAmount: 1100,
          processorFee: 30
        }
      });

      this.testData.payments.push({
        id: payment.id,
        organizationId: org.id,
        customerId: customer.id,
        paymentNumber: payment.paymentNumber
      });

      // Create test project
      const project = await prisma.project.create({
        data: {
          organizationId: org.id,
          projectNumber: `PRJ-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`,
          customerId: customer.id,
          name: `Test Project for ${org.name}`,
          description: 'Comprehensive test project for RBAC validation',
          status: 'IN_PROGRESS',
          startDate: new Date()
        }
      });

      this.testData.projects.push({
        id: project.id,
        organizationId: org.id,
        customerId: customer.id,
        projectNumber: project.projectNumber
      });
    }
  }

  /**
   * Generate comprehensive test data
   */
  async generateTestData(): Promise<TestData> {
    console.log('🚀 Generating comprehensive RBAC test data...');

    try {
      await this.createTestOrganizations();
      await this.createTestUsers();
      await this.createTestBusinessEntities();
      await this.createTestFinancialData();

      console.log('✅ Test data generation completed successfully!');
      console.log(`📊 Generated:
  - ${this.testData.organizations.length} Organizations
  - ${this.testData.users.length} Users
  - ${this.testData.customers.length} Customers
  - ${this.testData.accounts.length} Accounts
  - ${this.testData.quotes.length} Quotes
  - ${this.testData.invoices.length} Invoices
  - ${this.testData.payments.length} Payments
  - ${this.testData.projects.length} Projects`);

      return this.testData;
    } catch (error) {
      console.error('❌ Error generating test data:', error);
      throw error;
    }
  }

  /**
   * Clean up test data
   */
  async cleanup(): Promise<void> {
    console.log('🧹 Cleaning up test data...');

    // Delete in reverse dependency order
    await prisma.invoiceItem.deleteMany();
    await prisma.quoteItem.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.invoice.deleteMany();
    await prisma.quote.deleteMany();
    await prisma.project.deleteMany();
    await prisma.account.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.business.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
    await prisma.organization.deleteMany();

    console.log('✅ Test data cleanup completed');
  }

  /**
   * Export test data to JSON file
   */
  async exportTestData(filename: string = 'rbac-test-data.json'): Promise<void> {
    const fs = await import('fs/promises');
    const path = `/home/eric/Projects/accounting-api/tests/rbac/${filename}`;

    await fs.writeFile(path, JSON.stringify(this.testData, null, 2));
    console.log(`📄 Test data exported to: ${path}`);
  }
}

// CLI usage
if (require.main === module) {
  const generator = new RBACTestDataGenerator();

  async function main() {
    try {
      const testData = await generator.generateTestData();
      await generator.exportTestData();
      console.log('🎉 RBAC test data generation completed successfully!');
    } catch (error) {
      console.error('❌ Failed to generate test data:', error);
      process.exit(1);
    } finally {
      await prisma.$disconnect();
    }
  }

  main();
}

export default RBACTestDataGenerator;