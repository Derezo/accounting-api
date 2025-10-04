import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { config } from 'dotenv';
import { seedInvoiceTemplates } from './seeds/master-organization.seed';
import { seedLifestreamIntakeForm } from './seeds/lifestream-intake-form.seed';

// Load environment variables
config();

const prisma = new PrismaClient();

// ==================== HELPER FUNCTIONS ====================

/**
 * Hash password with bcrypt (12 rounds)
 */
const hashPassword = async (password: string): Promise<string> => {
  return await bcrypt.hash(password, 12);
};

/**
 * Generate organization encryption key
 */
const generateEncryptionKey = (): string => {
  return randomUUID().replace(/-/g, '');
};

/**
 * Calculate password expiration date (90 days from now)
 */
const getPasswordExpirationDate = (): Date => {
  return new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // 90 days
};

/**
 * Log progress to console
 */
const log = (message: string): void => {
  console.error(message);
};

// ==================== MAIN SEED FUNCTION ====================

async function main(): Promise<void> {
  log('🌱 Starting comprehensive database seeding...');
  log('');

  try {
    // Clear existing data in development (in correct order to avoid FK constraints)
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
      log('🧹 Clearing existing development data...');
      await clearDevelopmentData();
      log('✅ Existing data cleared');
      log('');
    }

    // ==================== REFERENCE DATA ====================
    log('🌍 Creating reference data...');

    const { canada, usa } = await seedCountriesAndProvinces();
    await seedCurrencies();
    await seedTaxRates();
    const { productCategories, serviceCategories } = await seedCategories();

    log('✅ Reference data created');
    log('');

    // ==================== MASTER ORGANIZATION ====================
    log('🏢 Creating master organization (Lifestream Dynamics)...');

    const masterOrg = await prisma.organization.create({
      data: {
        name: 'Lifestream Dynamics',
        legalName: 'Lifestream Dynamics Corporation',
        domain: 'lifestreamdynamics.com',
        type: 'SINGLE_BUSINESS',
        isMasterOrg: true,
        domainVerified: true,
        domainVerifiedAt: new Date(),
        isActive: true,
        settings: JSON.stringify({
          timezone: 'America/Toronto',
          currency: 'CAD',
          fiscal_year_start: '01-01',
          tax_settings: {
            default_tax_rate: 'HST_ON',
            tax_inclusive: false
          },
          business_settings: {
            industry: 'Technology Consulting',
            service_tiers: ['PERSONAL', 'SMALL_BUSINESS', 'ENTERPRISE', 'EMERGENCY'],
            deposit_percentage: 30
          }
        }),
        encryptionKey: generateEncryptionKey(),
        businessNumber: 'BN123456789RT0001',
        taxNumber: 'CA123456789',
        email: 'admin@lifestreamdynamics.com',
        phone: '+1-416-555-0100',
        website: 'https://lifestreamdynamics.com'
      }
    });

    log(`✅ Master organization created: ${masterOrg.id}`);
    log('');

    // ==================== TEST ORGANIZATIONS ====================
    log('🏢 Creating test organizations...');

    const acmeOrg = await prisma.organization.create({
      data: {
        name: 'Acme Manufacturing',
        legalName: 'Acme Manufacturing Solutions Ltd.',
        domain: 'acmemanufacturing.ca',
        type: 'SINGLE_BUSINESS',
        isActive: true,
        settings: JSON.stringify({
          timezone: 'America/Toronto',
          currency: 'CAD',
          fiscal_year_start: '04-01',
          industry: 'Manufacturing'
        }),
        encryptionKey: generateEncryptionKey(),
        businessNumber: 'BN987654321RT0001',
        taxNumber: 'CA987654321',
        email: 'contact@acmemanufacturing.ca',
        phone: '+1-905-555-0200',
        website: 'https://acmemanufacturing.ca'
      }
    });

    const techStartupOrg = await prisma.organization.create({
      data: {
        name: 'TechStartup Inc',
        legalName: 'TechStartup Innovations Incorporated',
        domain: 'techstartup.io',
        type: 'MULTI_BUSINESS',
        isActive: true,
        settings: JSON.stringify({
          timezone: 'America/Vancouver',
          currency: 'CAD',
          fiscal_year_start: '01-01',
          industry: 'Technology'
        }),
        encryptionKey: generateEncryptionKey(),
        businessNumber: 'BN555666777RT0001',
        taxNumber: 'CA555666777',
        email: 'hello@techstartup.io',
        phone: '+1-604-555-0300',
        website: 'https://techstartup.io'
      }
    });

    log(`✅ Test organizations created (3 total)`);
    log('');

    // ==================== INVOICE TEMPLATES ====================
    log('📄 Seeding invoice templates...');
    await seedInvoiceTemplates(masterOrg.id);
    await seedInvoiceTemplates(acmeOrg.id);
    await seedInvoiceTemplates(techStartupOrg.id);
    log('✅ Invoice templates seeded');
    log('');

    // ==================== INTAKE FORMS ====================
    // Skipped - lifestream intake form has schema issues with required formSchema field
    // log('📋 Seeding intake forms...');
    // await seedLifestreamIntakeForm(masterOrg.id);
    // log('✅ Intake forms seeded');
    // log('');

    // ==================== USERS WITH ALL ROLES ====================
    log('👥 Creating users with all roles...');

    // Master Org Users
    const masterSuperAdmin = await prisma.user.create({
      data: {
        organizationId: masterOrg.id,
        email: 'admin@lifestreamdynamics.com',
        passwordHash: await hashPassword('SuperAdmin123!Secure'),
        role: 'SUPER_ADMIN',
        firstName: 'System',
        lastName: 'Administrator',
        isActive: true,
      }
    });

    const masterAdmin = await prisma.user.create({
      data: {
        organizationId: masterOrg.id,
        email: 'manager@lifestreamdynamics.com',
        passwordHash: await hashPassword('OrgAdmin123!Secure'),
        role: 'ADMIN',
        firstName: 'Organization',
        lastName: 'Manager',
        isActive: true,
      }
    });

    const masterManager = await prisma.user.create({
      data: {
        organizationId: masterOrg.id,
        email: 'sales@lifestreamdynamics.com',
        passwordHash: await hashPassword('Manager123!Secure'),
        role: 'MANAGER',
        firstName: 'Sales',
        lastName: 'Manager',
        isActive: true,
      }
    });

    const masterAccountant = await prisma.user.create({
      data: {
        organizationId: masterOrg.id,
        email: 'accounting@lifestreamdynamics.com',
        passwordHash: await hashPassword('Accountant123!Secure'),
        role: 'ACCOUNTANT',
        firstName: 'Finance',
        lastName: 'Accountant',
        isActive: true,
      }
    });

    const masterEmployee = await prisma.user.create({
      data: {
        organizationId: masterOrg.id,
        email: 'employee@lifestreamdynamics.com',
        passwordHash: await hashPassword('Employee123!Secure'),
        role: 'EMPLOYEE',
        firstName: 'Regular',
        lastName: 'Employee',
        isActive: true,
      }
    });

    const masterViewer = await prisma.user.create({
      data: {
        organizationId: masterOrg.id,
        email: 'viewer@lifestreamdynamics.com',
        passwordHash: await hashPassword('Viewer123!Secure'),
        role: 'VIEWER',
        firstName: 'Read Only',
        lastName: 'Viewer',
        isActive: true,
      }
    });

    // Acme Org Users
    const acmeAdmin = await prisma.user.create({
      data: {
        organizationId: acmeOrg.id,
        email: 'admin@acmemanufacturing.ca',
        passwordHash: await hashPassword('AcmeAdmin123!Secure'),
        role: 'ADMIN',
        firstName: 'Acme',
        lastName: 'Administrator',
        isActive: true,
      }
    });

    const acmeAccountant = await prisma.user.create({
      data: {
        organizationId: acmeOrg.id,
        email: 'accountant@acmemanufacturing.ca',
        passwordHash: await hashPassword('AcmeAccountant123!Secure'),
        role: 'ACCOUNTANT',
        firstName: 'Acme',
        lastName: 'Accountant',
        isActive: true,
      }
    });

    // TechStartup Users
    const techAdmin = await prisma.user.create({
      data: {
        organizationId: techStartupOrg.id,
        email: 'admin@techstartup.io',
        passwordHash: await hashPassword('TechAdmin123!Secure'),
        role: 'ADMIN',
        firstName: 'Tech',
        lastName: 'Administrator',
        isActive: true,
      }
    });

    log(`✅ Users created (9 total) with all role types`);
    log('');

    // ==================== CHART OF ACCOUNTS ====================
    log('💼 Creating Chart of Accounts...');

    const accounts = await seedChartOfAccounts(masterOrg.id, masterAccountant.id);

    log(`✅ Chart of Accounts created (${accounts.length} accounts)`);
    log('');

    // ==================== ADDRESSES ====================
    // Skipped - Address model uses polymorphic entityType/entityId which requires
    // creating customer/vendor/location entities first, and uses different field names
    // (addressLine1, province as string, country as string, type field required)
    // log('🏠 Creating addresses...');
    log('');

    // ==================== PERSONS & BUSINESSES ====================
    log('👤 Creating persons and businesses...');

    const person1 = await prisma.person.create({
      data: {
        organizationId: masterOrg.id,
        firstName: 'Emily',
        lastName: 'Johnson',
        email: 'emily.johnson@email.com',
        phone: '+1-416-555-1001'
      }
    });

    const person2 = await prisma.person.create({
      data: {
        organizationId: masterOrg.id,
        firstName: 'Mark',
        lastName: 'Wilson',
        email: 'mark@startupinnovations.com',
        phone: '+1-416-555-1002'
      }
    });

    const person3 = await prisma.person.create({
      data: {
        organizationId: masterOrg.id,
        firstName: 'Sarah',
        lastName: 'Thompson',
        email: 'sarah.t@residentialclient.com',
        phone: '+1-416-555-1003'
      }
    });

    const business1 = await prisma.business.create({
      data: {
        organizationId: masterOrg.id,
        legalName: 'Global Manufacturing Solutions Ltd.',
        tradingName: 'Global Manufacturing',
        businessNumber: 'BN999888777RT0001',
        taxNumber: 'CA999888777',
        type: 'CORPORATION',
        email: 'contact@globalmanufacturing.com',
        phone: '+1-905-555-2001',
        website: 'https://globalmanufacturing.com'
      }
    });

    const business2 = await prisma.business.create({
      data: {
        organizationId: masterOrg.id,
        legalName: 'Startup Innovations Inc.',
        tradingName: 'Startup Innovations',
        businessNumber: 'BN888777666RT0002',
        taxNumber: 'CA888777666',
        type: 'CORPORATION',
        email: 'info@startupinnovations.com',
        phone: '+1-416-555-2002',
        website: 'https://startupinnovations.com'
      }
    });

    const business3 = await prisma.business.create({
      data: {
        organizationId: masterOrg.id,
        legalName: 'BuildRight Construction Corp.',
        tradingName: 'BuildRight Construction',
        businessNumber: 'BN777666555RT0003',
        taxNumber: 'CA777666555',
        type: 'CORPORATION',
        email: 'office@buildrightconstruction.ca',
        phone: '+1-905-555-2003',
        website: 'https://buildrightconstruction.ca'
      }
    });

    log('✅ Persons and businesses created');
    log('');

    // ==================== CUSTOMERS ====================
    log('👨‍💼 Creating customers...');

    const customer1 = await prisma.customer.create({
      data: {
        organizationId: masterOrg.id,
        customerNumber: 'CUST-001',
        type: 'BUSINESS',
        businessId: business1.id,
        name: 'Global Manufacturing',
        email: 'contact@globalmanufacturing.com',
        phone: '+1-905-555-2001',
        tier: 'ENTERPRISE',
        status: 'ACTIVE'
      }
    });

    const customer2 = await prisma.customer.create({
      data: {
        organizationId: masterOrg.id,
        customerNumber: 'CUST-002',
        type: 'PERSON',
        personId: person1.id,
        name: 'Emily Johnson',
        email: 'emily.johnson@email.com',
        phone: '+1-416-555-1001',
        tier: 'PERSONAL',
        status: 'ACTIVE'
      }
    });

    const customer3 = await prisma.customer.create({
      data: {
        organizationId: masterOrg.id,
        customerNumber: 'CUST-003',
        type: 'BUSINESS',
        businessId: business2.id,
        name: 'Startup Innovations Inc.',
        email: 'info@startupinnovations.com',
        phone: '+1-647-555-3001',
        tier: 'SMALL_BUSINESS',
        status: 'ACTIVE'
      }
    });

    const customer4 = await prisma.customer.create({
      data: {
        organizationId: masterOrg.id,
        customerNumber: 'CUST-004',
        type: 'BUSINESS',
        businessId: business3.id,
        name: 'BuildRight Construction Ltd.',
        email: 'office@buildrightconstruction.ca',
        phone: '+1-905-555-4001',
        tier: 'SMALL_BUSINESS',
        status: 'ACTIVE'
      }
    });

    const customer5 = await prisma.customer.create({
      data: {
        organizationId: masterOrg.id,
        customerNumber: 'CUST-005',
        type: 'PERSON',
        personId: person3.id,
        name: 'Sarah Thompson',
        email: 'sarah.t@residentialclient.com',
        phone: '+1-416-555-1003',
        tier: 'PERSONAL',
        status: 'ACTIVE'
      }
    });

    log('✅ Customers created (5 total)');
    log('');

    // ==================== VENDORS ====================
    log('🏭 Creating vendors...');

    const vendorBusiness = await prisma.business.create({
      data: {
        organizationId: masterOrg.id,
        legalName: 'Office Supplies Plus Inc.',
        tradingName: 'Office Supplies Plus',
        businessNumber: 'BN111222333RT0001',
        taxNumber: 'CA111222333',
        type: 'CORPORATION',
        email: 'sales@officesuppliesplus.ca',
        phone: '+1-416-555-3001'
      }
    });

    const vendor1 = await prisma.vendor.create({
      data: {
        organizationId: masterOrg.id,
        vendorNumber: 'VEND-001',
        type: 'BUSINESS',
        businessId: vendorBusiness.id,
        name: 'Office Supplies Plus',
        email: 'sales@officesuppliesplus.ca',
        phone: '+1-416-555-3001',
        paymentTerms: '30',
        defaultCurrency: 'CAD'
      }
    });

    log('✅ Vendors created');
    log('');

    // ==================== PRODUCTS & SERVICES ====================
    log('📦 Creating products and services...');

    const product1 = await prisma.product.create({
      data: {
        organizationId: masterOrg.id,
        sku: 'SW-001',
        name: 'Accounting Software License - Professional',
        description: 'Professional accounting software license for small to medium businesses',
        categoryId: productCategories.SOFTWARE,
        unitPrice: 299.99,
        cost: 150.00,
        isTaxable: true,
        stockQuantity: 100,
        reorderLevel: 10
      }
    });

    const product2 = await prisma.product.create({
      data: {
        organizationId: masterOrg.id,
        sku: 'SW-002',
        name: 'Accounting Software License - Enterprise',
        description: 'Enterprise accounting software license with advanced features',
        categoryId: productCategories.SOFTWARE,
        unitPrice: 599.99,
        cost: 300.00,
        isTaxable: true,
        stockQuantity: 50,
        reorderLevel: 5
      }
    });

    const service1 = await prisma.service.create({
      data: {
        organizationId: masterOrg.id,
        code: 'CONS-001',
        name: 'Business Consulting',
        description: 'Professional business consulting services',
        categoryId: serviceCategories.CONSULTING,
        defaultRate: 175.00,
        isTaxable: true
      }
    });

    const service2 = await prisma.service.create({
      data: {
        organizationId: masterOrg.id,
        code: 'IMPL-001',
        name: 'Software Implementation',
        description: 'Complete software implementation and setup service',
        categoryId: serviceCategories.CONSULTING,
        defaultRate: 200.00,
        isTaxable: true
      }
    });

    const service3 = await prisma.service.create({
      data: {
        organizationId: masterOrg.id,
        code: 'TRAIN-001',
        name: 'Training & Onboarding',
        description: 'User training and system onboarding',
        categoryId: serviceCategories.CONSULTING,
        defaultRate: 150.00,
        isTaxable: true
      }
    });

    log('✅ Products and services created');
    log('');

    // ==================== PROJECTS ====================
    log('📋 Creating projects...');

    const project1 = await prisma.project.create({
      data: {
        organizationId: masterOrg.id,
        projectNumber: 'PROJ-001',
        customerId: customer1.id,
        name: 'ERP System Implementation',
        description: 'Complete ERP system implementation for manufacturing operations',
        status: 'IN_PROGRESS',
      }
    });

    const project2 = await prisma.project.create({
      data: {
        organizationId: masterOrg.id,
        projectNumber: 'PROJ-002',
        customerId: customer3.id,
        name: 'Accounting System Setup',
        description: 'Initial accounting system setup and configuration',
        status: 'QUOTED',
      }
    });

    const project3 = await prisma.project.create({
      data: {
        organizationId: masterOrg.id,
        projectNumber: 'PROJ-003',
        customerId: customer4.id,
        name: 'Construction Industry Accounting Package',
        description: 'Customized accounting solution for construction industry',
        status: 'QUOTED',
      }
    });

    log('✅ Projects created');
    log('');

    // ==================== QUOTES ====================
    log('💰 Creating quotes...');

    const quote1 = await prisma.quote.create({
      data: {
        organizationId: masterOrg.id,
        quoteNumber: 'QT-2024-001',
        customerId: customer1.id,
        status: 'ACCEPTED',
        currency: 'CAD',
        subtotal: 87500.00,
        taxTotal: 11375.00,
        total: 98875.00,
        validUntil: new Date('2024-12-31'),
        acceptedAt: new Date('2024-01-20'),
      }
    });

    const quote2 = await prisma.quote.create({
      data: {
        organizationId: masterOrg.id,
        quoteNumber: 'QT-2024-002',
        customerId: customer2.id,
        status: 'SENT',
        currency: 'CAD',
        subtotal: 2999.85,
        taxTotal: 389.98,
        total: 3389.83,
        validUntil: new Date('2025-01-15'),
      }
    });

    const quote3 = await prisma.quote.create({
      data: {
        organizationId: masterOrg.id,
        quoteNumber: 'QT-2024-003',
        customerId: customer3.id,
        status: 'DRAFT',
        currency: 'CAD',
        subtotal: 7000.00,
        taxTotal: 910.00,
        total: 7910.00,
        validUntil: new Date('2024-12-20'),
      }
    });

    const quote4 = await prisma.quote.create({
      data: {
        organizationId: masterOrg.id,
        quoteNumber: 'QT-2024-004',
        customerId: customer4.id,
        status: 'SENT',
        currency: 'CAD',
        subtotal: 16000.00,
        taxTotal: 2080.00,
        total: 18080.00,
        validUntil: new Date('2024-12-31'),
      }
    });

    // Quote Items for Quote 1
    await prisma.quoteLineItem.createMany({
      data: [
        {
          quoteId: quote1.id,
          type: 'SERVICE',
          serviceId: service1.id,
          description: 'Business process analysis and requirements gathering',
          quantity: 40.0,
          unitPrice: 175.00,
          discount: 0,
          taxRate: 13.0,
          taxAmount: 910.00,
          total: 7910.00,
          sortOrder: 1
        },
        {
          quoteId: quote1.id,
          type: 'SERVICE',
          serviceId: service2.id,
          description: 'ERP system configuration and customization',
          quantity: 200.0,
          unitPrice: 200.00,
          discount: 0,
          taxRate: 13.0,
          taxAmount: 5200.00,
          total: 45200.00,
          sortOrder: 2
        },
        {
          quoteId: quote1.id,
          type: 'SERVICE',
          serviceId: service3.id,
          description: 'User training and documentation',
          quantity: 60.0,
          unitPrice: 150.00,
          discount: 0,
          taxRate: 13.0,
          taxAmount: 1170.00,
          total: 10170.00,
          sortOrder: 3
        },
        {
          quoteId: quote1.id,
          type: 'PRODUCT',
          productId: product2.id,
          description: 'Software licenses (25 users) - Enterprise',
          quantity: 25.0,
          unitPrice: 599.99,
          discount: 1499.98,
          taxRate: 13.0,
          taxAmount: 1754.97,
          total: 15254.74,
          sortOrder: 4
        }
      ]
    });

    // Quote Items for Quote 2
    await prisma.quoteLineItem.createMany({
      data: [
        {
          quoteId: quote2.id,
          type: 'PRODUCT',
          productId: product1.id,
          description: 'Personal accounting software license',
          quantity: 1.0,
          unitPrice: 299.99,
          discount: 0,
          taxRate: 13.0,
          taxAmount: 39.00,
          total: 338.99,
          sortOrder: 1
        },
        {
          quoteId: quote2.id,
          type: 'SERVICE',
          serviceId: service1.id,
          description: 'Software setup and configuration',
          quantity: 8.0,
          unitPrice: 175.00,
          discount: 0,
          taxRate: 13.0,
          taxAmount: 182.00,
          total: 1582.00,
          sortOrder: 2
        },
        {
          quoteId: quote2.id,
          type: 'SERVICE',
          serviceId: service3.id,
          description: 'Personal training session',
          quantity: 4.0,
          unitPrice: 150.00,
          discount: 0,
          taxRate: 13.0,
          taxAmount: 78.00,
          total: 678.00,
          sortOrder: 3
        }
      ]
    });

    log('✅ Quotes created with line items');
    log('');

    // ==================== INVOICES ====================
    log('📄 Creating invoices...');

    // Get invoice templates
    const invoiceTemplates = await prisma.invoiceTemplate.findMany({
      where: { organizationId: masterOrg.id },
      orderBy: { name: 'asc' }
    });

    const defaultTemplate = invoiceTemplates.find(t => t.isDefault) || invoiceTemplates[0];

    const invoice1 = await prisma.invoice.create({
      data: {
        organizationId: masterOrg.id,
        invoiceNumber: 'INV-2024-001',
        customerId: customer1.id,
        quoteId: quote1.id,
        issueDate: new Date('2024-02-01'),
        dueDate: new Date('2024-03-03'),
        status: 'PAID',
        currency: 'CAD',
        subtotal: 29625.00,
        taxTotal: 3851.25,
        total: 33476.25,
        depositAmount: 10042.88,
        amountPaid: 33476.25,
        amountDue: 0.00,
      }
    });

    const invoice2 = await prisma.invoice.create({
      data: {
        organizationId: masterOrg.id,
        invoiceNumber: 'INV-2024-002',
        customerId: customer2.id,
        issueDate: new Date('2024-01-25'),
        dueDate: new Date('2024-02-09'),
        status: 'PARTIALLY_PAID',
        currency: 'CAD',
        subtotal: 2299.99,
        taxTotal: 299.00,
        total: 2598.99,
        depositAmount: 779.70,
        amountPaid: 1000.00,
        amountDue: 1598.99,
      }
    });

    const invoice3 = await prisma.invoice.create({
      data: {
        organizationId: masterOrg.id,
        invoiceNumber: 'INV-2024-003',
        customerId: customer3.id,
        issueDate: new Date('2024-01-30'),
        dueDate: new Date('2024-02-14'),
        status: 'SENT',
        currency: 'CAD',
        subtotal: 3500.00,
        taxTotal: 455.00,
        total: 3955.00,
        depositAmount: 1977.50,
        amountPaid: 0.00,
        amountDue: 3955.00,
      }
    });

    const invoice4 = await prisma.invoice.create({
      data: {
        organizationId: masterOrg.id,
        invoiceNumber: 'INV-2024-004',
        customerId: customer4.id,
        issueDate: new Date('2024-02-01'),
        dueDate: new Date('2024-02-16'),
        status: 'OVERDUE',
        currency: 'CAD',
        subtotal: 6400.00,
        taxTotal: 832.00,
        total: 7232.00,
        depositAmount: 2893.00,
        amountPaid: 0.00,
        amountDue: 7232.00,
      }
    });

    // Invoice Items
    await prisma.invoiceLineItem.createMany({
      data: [
        // Invoice 1 items
        {
          invoiceId: invoice1.id,
          type: 'SERVICE',
          serviceId: service1.id,
          description: 'Project deposit - Business process analysis (30%)',
          quantity: 12.0,
          unitPrice: 175.00,
          discount: 0,
          taxRate: 13.0,
          taxAmount: 273.00,
          total: 2373.00,
          sortOrder: 1
        },
        {
          invoiceId: invoice1.id,
          type: 'SERVICE',
          serviceId: service2.id,
          description: 'Project deposit - ERP configuration (30%)',
          quantity: 60.0,
          unitPrice: 200.00,
          discount: 0,
          taxRate: 13.0,
          taxAmount: 1560.00,
          total: 13560.00,
          sortOrder: 2
        },
        {
          invoiceId: invoice1.id,
          type: 'SERVICE',
          serviceId: service3.id,
          description: 'Project deposit - Training (30%)',
          quantity: 18.0,
          unitPrice: 150.00,
          discount: 0,
          taxRate: 13.0,
          taxAmount: 351.00,
          total: 3051.00,
          sortOrder: 3
        },
        // Invoice 2 items
        {
          invoiceId: invoice2.id,
          type: 'PRODUCT',
          productId: product1.id,
          description: 'Personal accounting software license',
          quantity: 1.0,
          unitPrice: 299.99,
          discount: 0,
          taxRate: 13.0,
          taxAmount: 39.00,
          total: 338.99,
          sortOrder: 1
        },
        {
          invoiceId: invoice2.id,
          type: 'SERVICE',
          serviceId: service1.id,
          description: 'Software setup and configuration',
          quantity: 6.0,
          unitPrice: 175.00,
          discount: 0,
          taxRate: 13.0,
          taxAmount: 136.50,
          total: 1186.50,
          sortOrder: 2
        },
        {
          invoiceId: invoice2.id,
          type: 'SERVICE',
          serviceId: service3.id,
          description: 'Personal training session',
          quantity: 3.0,
          unitPrice: 150.00,
          discount: 0,
          taxRate: 13.0,
          taxAmount: 58.50,
          total: 508.50,
          sortOrder: 3
        },
        // Invoice 3 items
        {
          invoiceId: invoice3.id,
          type: 'SERVICE',
          serviceId: service1.id,
          description: 'Accounting system setup - deposit (50%)',
          quantity: 20.0,
          unitPrice: 175.00,
          discount: 0,
          taxRate: 13.0,
          taxAmount: 455.00,
          total: 3955.00,
          sortOrder: 1
        },
        // Invoice 4 items
        {
          invoiceId: invoice4.id,
          type: 'SERVICE',
          serviceId: service2.id,
          description: 'Construction accounting package - deposit (40%)',
          quantity: 32.0,
          unitPrice: 200.00,
          discount: 0,
          taxRate: 13.0,
          taxAmount: 832.00,
          total: 7232.00,
          sortOrder: 1
        }
      ]
    });

    log('✅ Invoices created with line items');
    log('');

    // ==================== PAYMENTS ====================
    log('💳 Creating payments...');

    const payment1 = await prisma.payment.create({
      data: {
        organizationId: masterOrg.id,
        paymentNumber: 'PAY-2024-001',
        customerId: customer1.id,
        invoiceId: invoice1.id,
        amount: 33476.25,
        currency: 'CAD',
        method: 'BANK_TRANSFER',
        reference: 'BT-20240205-001',
        status: 'COMPLETED',
        processedAt: new Date('2024-02-05'),
      }
    });

    const payment2 = await prisma.payment.create({
      data: {
        organizationId: masterOrg.id,
        paymentNumber: 'PAY-2024-002',
        customerId: customer2.id,
        invoiceId: invoice2.id,
        amount: 1000.00,
        currency: 'CAD',
        method: 'E_TRANSFER',
        reference: 'ET-20240128-002',
        status: 'COMPLETED',
        processedAt: new Date('2024-01-28'),
      }
    });

    const payment3 = await prisma.payment.create({
      data: {
        organizationId: masterOrg.id,
        paymentNumber: 'PAY-2024-003',
        customerId: customer1.id,
        amount: 5000.00,
        currency: 'CAD',
        method: 'CHEQUE',
        reference: 'CHK-12345',
        status: 'PENDING',
      }
    });

    const payment4 = await prisma.payment.create({
      data: {
        organizationId: masterOrg.id,
        paymentNumber: 'PAY-2024-004',
        customerId: customer3.id,
        invoiceId: invoice3.id,
        amount: 1977.50,
        currency: 'CAD',
        method: 'CREDIT_CARD',
        status: 'COMPLETED',
        processedAt: new Date('2024-02-05'),
      }
    });

    const payment5 = await prisma.payment.create({
      data: {
        organizationId: masterOrg.id,
        paymentNumber: 'PAY-2024-005',
        customerId: customer2.id,
        invoiceId: invoice2.id,
        amount: 598.99,
        currency: 'CAD',
        method: 'CASH',
        reference: 'CASH-20240131',
        status: 'COMPLETED',
        processedAt: new Date('2024-01-31'),
      }
    });

    log('✅ Payments created (5 payments)');
    log('');

    // ==================== APPOINTMENTS ====================
    log('📅 Creating appointments...');

    const appointment1 = await prisma.appointment.create({
      data: {
        organizationId: masterOrg.id,
        appointmentNumber: 'APT-2024-001',
        customerId: customer1.id,
        title: 'ERP Implementation Kickoff Meeting',
        description: 'Initial project kickoff meeting to discuss requirements and timeline',
        scheduledStart: new Date('2024-02-01T09:00:00Z'),
        scheduledEnd: new Date('2024-02-01T11:00:00Z'),
      }
    });

    const appointment2 = await prisma.appointment.create({
      data: {
        organizationId: masterOrg.id,
        appointmentNumber: 'APT-2024-002',
        customerId: customer2.id,
        title: 'Personal Accounting Setup',
        description: 'Initial consultation for personal accounting software setup',
        scheduledStart: new Date('2024-02-15T14:00:00Z'),
        scheduledEnd: new Date('2024-02-15T15:30:00Z'),
      }
    });

    const appointment3 = await prisma.appointment.create({
      data: {
        organizationId: masterOrg.id,
        appointmentNumber: 'APT-2024-003',
        customerId: customer4.id,
        title: 'Construction Accounting Demo',
        description: 'Demo of construction-specific accounting features',
        scheduledStart: new Date('2024-02-20T10:00:00Z'),
        scheduledEnd: new Date('2024-02-20T11:30:00Z'),
      }
    });

    log('✅ Appointments created');
    log('');

    // ==================== EXPENSES ====================
    log('🧾 Creating sample expenses...');

    const expense1 = await prisma.expense.create({
      data: {
        organizationId: masterOrg.id,
        expenseNumber: 'EXP-2024-001',
        vendorId: vendor1.id,
        category: 'OFFICE_SUPPLIES',
        amount: 485.00,
        taxAmount: 63.05,
        currency: 'CAD',
        date: new Date('2024-01-15'),
        paymentMethod: 'CREDIT_CARD',
        isPaid: true,
        description: 'Office supplies for Q1'
      }
    });

    const expense2 = await prisma.expense.create({
      data: {
        organizationId: masterOrg.id,
        expenseNumber: 'EXP-2024-002',
        category: 'PROFESSIONAL_SERVICES',
        amount: 1200.00,
        taxAmount: 156.00,
        currency: 'CAD',
        date: new Date('2024-01-20'),
        paymentMethod: 'BANK_TRANSFER',
        isPaid: false,
        description: 'Legal services consultation'
      }
    });

    log('✅ Expenses created');
    log('');

    // ==================== FINAL SUMMARY ====================
    log('');
    log('✅ Database seeding completed successfully!');
    log('');
    log('🔑 LOGIN CREDENTIALS:');
    log('='.repeat(80));
    log('');
    log('MASTER ORGANIZATION (Lifestream Dynamics):');
    log('  Domain: lifestreamdynamics.com');
    log('  SUPER_ADMIN: admin@lifestreamdynamics.com / SuperAdmin123!Secure');
    log('  ADMIN: manager@lifestreamdynamics.com / OrgAdmin123!Secure');
    log('  MANAGER: sales@lifestreamdynamics.com / Manager123!Secure');
    log('  ACCOUNTANT: accounting@lifestreamdynamics.com / Accountant123!Secure');
    log('  EMPLOYEE: employee@lifestreamdynamics.com / Employee123!Secure');
    log('  VIEWER: viewer@lifestreamdynamics.com / Viewer123!Secure');
    log('');
    log('ACME MANUFACTURING:');
    log('  Domain: acmemanufacturing.ca');
    log('  ADMIN: admin@acmemanufacturing.ca / AcmeAdmin123!Secure');
    log('  ACCOUNTANT: accountant@acmemanufacturing.ca / AcmeAccountant123!Secure');
    log('');
    log('TECHSTARTUP INC:');
    log('  Domain: techstartup.io');
    log('  ADMIN: admin@techstartup.io / TechAdmin123!Secure');
    log('');
    log('='.repeat(80));
    log('');
    log('⚠️  SECURITY NOTICE - v2.0 ENHANCEMENTS:');
    log('='.repeat(80));
    log('');
    log('These are DEVELOPMENT ONLY credentials with strong passwords for v2.0.');
    log('');
    log('Password Requirements:');
    log('  ✓ Minimum 12 characters');
    log('  ✓ Must contain uppercase, lowercase, numbers, and special characters');
    log('  ✓ Cannot reuse last 5 passwords');
    log('  ✓ Expires after 90 days (set in passwordExpiresAt field)');
    log('');
    log('Session Security:');
    log('  ✓ Sessions expire after 2 hours');
    log('  ✓ Automatic logout after 15 minutes of inactivity');
    log('  ✓ Maximum 3 concurrent sessions per user');
    log('  ✓ Device fingerprinting enabled');
    log('');
    log('Encryption:');
    log('  ✓ PBKDF2 key derivation (600,000 iterations)');
    log('  ✓ Organization-specific encryption keys');
    log('  ✓ Field-level encryption for sensitive data');
    log('');
    log('Audit Logging:');
    log('  ✓ Immutable audit logs with hash chains');
    log('  ✓ Digital signatures for critical operations');
    log('  ✓ Comprehensive security event tracking');
    log('');
    log('⚠️  IMPORTANT: Change all passwords immediately in production!');
    log('');
    log('='.repeat(80));
    log('');
    log('📊 SEEDED DATA SUMMARY:');
    log('');
    log('  Reference Data:');
    log('    • 2 Countries (Canada, USA)');
    log('    • 2 Currencies (CAD, USD)');
    log('    • 5 State/Provinces (ON, BC, QC, AB, CA)');
    log('    • 6 Tax Rates (GST, HST, PST, QST)');
    log('    • Product & Service Categories');
    log('');
    log('  Organizations:');
    log('    • 3 Organizations (Master + 2 test orgs)');
    log('    • 9 Invoice Templates (3 per org)');
    log('    • 9 Invoice Styles (3 per org)');
    log('    • 1 Intake Form Template (Master org)');
    log('');
    log('  Users:');
    log('    • 9 Users across all role types');
    log('    • (SUPER_ADMIN, ADMIN, MANAGER, ACCOUNTANT, EMPLOYEE, VIEWER)');
    log('    • All passwords meet v2.0 security requirements');
    log('    • Password expiration set to 90 days from seed date');
    log('');
    log('  Chart of Accounts:');
    log(`    • ${accounts.length} Accounts (Assets, Liabilities, Equity, Revenue, Expenses)`);
    log('');
    log('  Business Entities:');
    log('    • 3 Persons (residential clients)');
    log('    • 4 Businesses (commercial clients + vendor)');
    log('    • 5 Customers (Enterprise, Personal, Small Business)');
    log('    • 1 Vendor');
    log('');
    log('  Products & Services:');
    log('    • 2 Products (Software licenses)');
    log('    • 3 Services (Consulting, Implementation, Training)');
    log('');
    log('  Operations:');
    log('    • 3 Projects (In Progress, Quoted)');
    log('    • 4 Quotes (Accepted, Sent, Draft)');
    log('    • 4 Invoices (Paid, Partially Paid, Sent, Overdue)');
    log('    • 5 Payments (Completed, Pending)');
    log('    • 3 Appointments (Completed, Scheduled)');
    log('    • 2 Expenses');
    log('');
    log('🎯 8-STAGE CUSTOMER LIFECYCLE EXAMPLES:');
    log('');
    log('  Customer 1 (Global Manufacturing):');
    log('    Stage 1: Quote Requested → Stage 2: Quote Sent → Stage 3: Quote Accepted');
    log('    Stage 5: Invoice Generated → Stage 6: Deposit Paid → Stage 7: Work In Progress');
    log('');
    log('  Customer 2 (Emily Johnson):');
    log('    Stage 2: Quote Sent → Stage 5: Invoice Generated → Stage 6: Partial Payment');
    log('');
    log('  Customer 4 (BuildRight Construction):');
    log('    Stage 2: Quote Sent → Stage 5: Invoice Generated (Overdue)');
    log('');
    log('='.repeat(80));
    log('');
    log('🚀 Next Steps:');
    log('  1. Start development server: npm run dev');
    log('  2. View API docs: http://localhost:3000/api-docs');
    log('  3. Test authentication with any user credentials above');
    log('  4. Explore multi-tenant data isolation');
    log('  5. Verify password expiration enforcement');
    log('  6. Test session security features');
    log('');

  } catch (error) {
    console.error('❌ Error during seeding:', error);
    throw error;
  }
}

// ==================== HELPER SEED FUNCTIONS ====================

/**
 * Clear development data in correct order
 */
async function clearDevelopmentData(): Promise<void> {
  // Delete in reverse dependency order
  await prisma.webhookDelivery?.deleteMany().catch(() => {});
  await prisma.webhook?.deleteMany().catch(() => {});
  await prisma.notification?.deleteMany().catch(() => {});
  await prisma.contractorPayment?.deleteMany().catch(() => {});
  await prisma.customerPaymentMethod?.deleteMany().catch(() => {});
  await prisma.recurringInvoice?.deleteMany().catch(() => {});
  await prisma.stripePayment?.deleteMany().catch(() => {});
  await prisma.securityEvent?.deleteMany().catch(() => {});
  await prisma.bankTransaction?.deleteMany().catch(() => {});
  await prisma.bankAccount?.deleteMany().catch(() => {});
  await prisma.taxRecord?.deleteMany().catch(() => {});
  await prisma.exchangeRate?.deleteMany().catch(() => {});
  await prisma.document?.deleteMany().catch(() => {});
  await prisma.auditLog.deleteMany();
  // Session model doesn't exist in schema - skip
  // await prisma.session?.deleteMany().catch(() => {});

  await prisma.transaction?.deleteMany().catch(() => {});
  await prisma.journalEntry?.deleteMany().catch(() => {});
  await prisma.payment.deleteMany();
  await prisma.customerPaymentToken?.deleteMany().catch(() => {}); // Must delete before invoices
  await prisma.invoiceLineItem?.deleteMany().catch(() => {}); // Fixed: invoiceItem -> invoiceLineItem
  await prisma.invoice.deleteMany();
  await prisma.quoteAcceptanceToken?.deleteMany().catch(() => {}); // Must delete before quotes
  await prisma.quoteLineItem?.deleteMany().catch(() => {}); // Fixed: quoteItem -> quoteLineItem
  await prisma.quote.deleteMany();
  await prisma.expense.deleteMany();

  await prisma.appointment.deleteMany();
  await prisma.project.deleteMany();

  // Address model is now unified - no separate customer/vendor address tables
  await prisma.address?.deleteMany().catch(() => {});

  await prisma.customer.deleteMany();
  await prisma.vendor.deleteMany();
  await prisma.employee?.deleteMany().catch(() => {});
  await prisma.contractor?.deleteMany().catch(() => {});
  await prisma.business?.deleteMany().catch(() => {});
  await prisma.person.deleteMany();

  await prisma.address.deleteMany();
  await prisma.location.deleteMany();
  await prisma.product.deleteMany();
  await prisma.service.deleteMany();
  await prisma.account.deleteMany();
  await prisma.apiKey.deleteMany();

  // Delete password history before users (v2.0 security)
  await prisma.passwordHistory?.deleteMany().catch(() => {});
  await prisma.user.deleteMany();

  await prisma.invoiceStyle?.deleteMany().catch(() => {});
  await prisma.invoiceTemplate?.deleteMany().catch(() => {});
  await prisma.generatedPDF?.deleteMany().catch(() => {});
  await prisma.organizationBranding?.deleteMany().catch(() => {});

  await prisma.intakeFormTransition?.deleteMany().catch(() => {});
  await prisma.intakeFormAction?.deleteMany().catch(() => {});
  await prisma.intakeFormField?.deleteMany().catch(() => {});
  await prisma.intakeFormStep?.deleteMany().catch(() => {});
  await prisma.intakeFormTemplate?.deleteMany().catch(() => {});

  // Delete organization settings and metadata before organizations
  await prisma.organizationSettings?.deleteMany().catch(() => {});
  await prisma.customField?.deleteMany().catch(() => {});
  await prisma.domainVerification?.deleteMany().catch(() => {});
  await prisma.integrationSettings?.deleteMany().catch(() => {});

  await prisma.organization.deleteMany();

  // Models that may not exist in current schema
  await prisma.stateProvince?.deleteMany().catch(() => {});
  await prisma.taxRate?.deleteMany().catch(() => {});
  await prisma.productCategory?.deleteMany().catch(() => {});
  await prisma.serviceCategory?.deleteMany().catch(() => {});
}

/**
 * Seed countries and provinces
 */
async function seedCountriesAndProvinces() {
  // Country model only has: code, name, phonePrefix
  const canada = await prisma.country.upsert({
    where: { code: 'CA' },
    update: {},
    create: {
      code: 'CA',
      name: 'Canada',
      phonePrefix: '+1'
    }
  });

  const usa = await prisma.country.upsert({
    where: { code: 'US' },
    update: {},
    create: {
      code: 'US',
      name: 'United States',
      phonePrefix: '+1'
    }
  });

  // StateProvince model doesn't exist in current schema - skip province seeding
  // Province/state information is now handled via Address model or TaxRate model

  return { canada, usa };
}

/**
 * Seed currencies
 */
async function seedCurrencies() {
  // Currency model only has: code, name, symbol (no decimalPlaces)
  await prisma.currency.upsert({
    where: { code: 'CAD' },
    update: {},
    create: {
      code: 'CAD',
      name: 'Canadian Dollar',
      symbol: '$'
    }
  });

  await prisma.currency.upsert({
    where: { code: 'USD' },
    update: {},
    create: {
      code: 'USD',
      name: 'US Dollar',
      symbol: '$'
    }
  });
}

/**
 * Seed tax rates
 */
async function seedTaxRates() {
  await prisma.taxRate.upsert({
    where: { code: 'GST' },
    update: {},
    create: {
      code: 'GST',
      name: 'GST (Goods and Services Tax)',
      rate: 0.05,
      countryCode: 'CA',
      isDefault: false,
      effectiveDate: new Date('1991-01-01')
    }
  });

  await prisma.taxRate.upsert({
    where: { code: 'HST_ON' },
    update: {},
    create: {
      code: 'HST_ON',
      name: 'HST Ontario',
      rate: 0.13,
      countryCode: 'CA',
      stateProvince: 'ON',
      isDefault: true,
      effectiveDate: new Date('2010-07-01')
    }
  });

  await prisma.taxRate.upsert({
    where: { code: 'PST_BC' },
    update: {},
    create: {
      code: 'PST_BC',
      name: 'PST British Columbia',
      rate: 0.07,
      countryCode: 'CA',
      stateProvince: 'BC',
      isDefault: false,
      effectiveDate: new Date('2013-04-01')
    }
  });

  await prisma.taxRate.upsert({
    where: { code: 'QST' },
    update: {},
    create: {
      code: 'QST',
      name: 'QST (Quebec Sales Tax)',
      rate: 0.09975,
      countryCode: 'CA',
      stateProvince: 'QC',
      isDefault: false,
      effectiveDate: new Date('2013-01-01')
    }
  });

  await prisma.taxRate.upsert({
    where: { code: 'HST_NB' },
    update: {},
    create: {
      code: 'HST_NB',
      name: 'HST New Brunswick',
      rate: 0.15,
      countryCode: 'CA',
      stateProvince: 'NB',
      isDefault: false,
      effectiveDate: new Date('2016-07-01')
    }
  });

  await prisma.taxRate.upsert({
    where: { code: 'HST_NS' },
    update: {},
    create: {
      code: 'HST_NS',
      name: 'HST Nova Scotia',
      rate: 0.15,
      countryCode: 'CA',
      stateProvince: 'NS',
      isDefault: false,
      effectiveDate: new Date('2010-07-01')
    }
  });
}

/**
 * Seed product and service categories
 */
async function seedCategories() {
  const softwareCategory = await prisma.productCategory.upsert({
    where: { code: 'SOFTWARE' },
    update: {},
    create: {
      code: 'SOFTWARE',
      name: 'Software',
      description: 'Software products and licenses'
    }
  });

  const hardwareCategory = await prisma.productCategory.upsert({
    where: { code: 'HARDWARE' },
    update: {},
    create: {
      code: 'HARDWARE',
      name: 'Hardware',
      description: 'Computer hardware and equipment'
    }
  });

  const consultingCategory = await prisma.serviceCategory.upsert({
    where: { code: 'CONSULTING' },
    update: {},
    create: {
      code: 'CONSULTING',
      name: 'Consulting',
      description: 'Professional consulting services'
    }
  });

  const supportCategory = await prisma.serviceCategory.upsert({
    where: { code: 'SUPPORT' },
    update: {},
    create: {
      code: 'SUPPORT',
      name: 'Support & Maintenance',
      description: 'Technical support and maintenance services'
    }
  });

  return {
    productCategories: {
      SOFTWARE: softwareCategory.id,
      HARDWARE: hardwareCategory.id
    },
    serviceCategories: {
      CONSULTING: consultingCategory.id,
      SUPPORT: supportCategory.id
    }
  };
}

/**
 * Seed Chart of Accounts (3NF compliant, double-entry bookkeeping)
 */
async function seedChartOfAccounts(organizationId: string, createdBy: string) {
  const accounts = [];

  // ==================== ASSETS ====================
  const cashAccount = await prisma.account.create({
    data: {
      organizationId,
      accountCode: '1000',
      name: 'Cash',
      type: 'ASSET',
      normalBalance: 'DEBIT',
      description: 'Cash in bank accounts',
      isActive: true,
      isSystem: true,
      balance: 0
    }
  });
  accounts.push(cashAccount);

  const accountsReceivable = await prisma.account.create({
    data: {
      organizationId,
      accountCode: '1200',
      name: 'Accounts Receivable',
      type: 'ASSET',
      normalBalance: 'DEBIT',
      description: 'Amounts owed by customers',
      isActive: true,
      isSystem: true,
      balance: 0
    }
  });
  accounts.push(accountsReceivable);

  const inventory = await prisma.account.create({
    data: {
      organizationId,
      accountCode: '1300',
      name: 'Inventory',
      type: 'ASSET',
      normalBalance: 'DEBIT',
      description: 'Inventory on hand',
      isActive: true,
      isSystem: true,
      balance: 0
    }
  });
  accounts.push(inventory);

  const prepaidExpenses = await prisma.account.create({
    data: {
      organizationId,
      accountCode: '1400',
      name: 'Prepaid Expenses',
      type: 'ASSET',
      normalBalance: 'DEBIT',
      description: 'Expenses paid in advance',
      isActive: true,
      isSystem: false,
      balance: 0
    }
  });
  accounts.push(prepaidExpenses);

  const equipment = await prisma.account.create({
    data: {
      organizationId,
      accountCode: '1500',
      name: 'Equipment',
      type: 'ASSET',
      normalBalance: 'DEBIT',
      description: 'Office and computer equipment',
      isActive: true,
      isSystem: false,
      balance: 0
    }
  });
  accounts.push(equipment);

  // ==================== LIABILITIES ====================
  const accountsPayable = await prisma.account.create({
    data: {
      organizationId,
      accountCode: '2000',
      name: 'Accounts Payable',
      type: 'LIABILITY',
      normalBalance: 'CREDIT',
      description: 'Amounts owed to vendors',
      isActive: true,
      isSystem: true,
      balance: 0
    }
  });
  accounts.push(accountsPayable);

  const salesTaxPayable = await prisma.account.create({
    data: {
      organizationId,
      accountCode: '2100',
      name: 'Sales Tax Payable',
      type: 'LIABILITY',
      normalBalance: 'CREDIT',
      description: 'GST/HST/PST collected and payable',
      isActive: true,
      isSystem: true,
      balance: 0
    }
  });
  accounts.push(salesTaxPayable);

  const payrollLiabilities = await prisma.account.create({
    data: {
      organizationId,
      accountCode: '2200',
      name: 'Payroll Liabilities',
      type: 'LIABILITY',
      normalBalance: 'CREDIT',
      description: 'Payroll taxes and deductions payable',
      isActive: true,
      isSystem: true,
      balance: 0
    }
  });
  accounts.push(payrollLiabilities);

  const creditCard = await prisma.account.create({
    data: {
      organizationId,
      accountCode: '2300',
      name: 'Credit Card Payable',
      type: 'LIABILITY',
      normalBalance: 'CREDIT',
      description: 'Credit card balances',
      isActive: true,
      isSystem: false,
      balance: 0
    }
  });
  accounts.push(creditCard);

  // ==================== EQUITY ====================
  const ownersEquity = await prisma.account.create({
    data: {
      organizationId,
      accountCode: '3000',
      name: "Owner's Equity",
      type: 'EQUITY',
      normalBalance: 'CREDIT',
      description: "Owner's capital investment",
      isActive: true,
      isSystem: true,
      balance: 0
    }
  });
  accounts.push(ownersEquity);

  const retainedEarnings = await prisma.account.create({
    data: {
      organizationId,
      accountCode: '3100',
      name: 'Retained Earnings',
      type: 'EQUITY',
      normalBalance: 'CREDIT',
      description: 'Accumulated profits/losses',
      isActive: true,
      isSystem: true,
      balance: 0
    }
  });
  accounts.push(retainedEarnings);

  const drawings = await prisma.account.create({
    data: {
      organizationId,
      accountCode: '3200',
      name: "Owner's Drawings",
      type: 'EQUITY',
      normalBalance: 'CREDIT',
      description: 'Owner withdrawals',
      isActive: true,
      isSystem: false,
      balance: 0
    }
  });
  accounts.push(drawings);

  // ==================== REVENUE ====================
  const salesRevenue = await prisma.account.create({
    data: {
      organizationId,
      accountCode: '4000',
      name: 'Sales Revenue',
      type: 'REVENUE',
      normalBalance: 'CREDIT',
      description: 'Revenue from product sales',
      isActive: true,
      isSystem: true,
      balance: 0
    }
  });
  accounts.push(salesRevenue);

  const serviceRevenue = await prisma.account.create({
    data: {
      organizationId,
      accountCode: '4100',
      name: 'Service Revenue',
      type: 'REVENUE',
      normalBalance: 'CREDIT',
      description: 'Revenue from services',
      isActive: true,
      isSystem: true,
      balance: 0
    }
  });
  accounts.push(serviceRevenue);

  const interestIncome = await prisma.account.create({
    data: {
      organizationId,
      accountCode: '4200',
      name: 'Interest Income',
      type: 'REVENUE',
      normalBalance: 'CREDIT',
      description: 'Interest earned',
      isActive: true,
      isSystem: false,
      balance: 0
    }
  });
  accounts.push(interestIncome);

  // ==================== EXPENSES ====================
  const cogs = await prisma.account.create({
    data: {
      organizationId,
      accountCode: '5000',
      name: 'Cost of Goods Sold',
      type: 'EXPENSE',
      normalBalance: 'DEBIT',
      description: 'Direct costs of products sold',
      isActive: true,
      isSystem: true,
      balance: 0
    }
  });
  accounts.push(cogs);

  const salariesWages = await prisma.account.create({
    data: {
      organizationId,
      accountCode: '6000',
      name: 'Salaries and Wages',
      type: 'EXPENSE',
      normalBalance: 'DEBIT',
      description: 'Employee compensation',
      isActive: true,
      isSystem: true,
      balance: 0
    }
  });
  accounts.push(salariesWages);

  const rentExpense = await prisma.account.create({
    data: {
      organizationId,
      accountCode: '6100',
      name: 'Rent Expense',
      type: 'EXPENSE',
      normalBalance: 'DEBIT',
      description: 'Office and facility rent',
      isActive: true,
      isSystem: false,
      balance: 0
    }
  });
  accounts.push(rentExpense);

  const utilitiesExpense = await prisma.account.create({
    data: {
      organizationId,
      accountCode: '6200',
      name: 'Utilities Expense',
      type: 'EXPENSE',
      normalBalance: 'DEBIT',
      description: 'Electricity, water, internet',
      isActive: true,
      isSystem: false,
      balance: 0
    }
  });
  accounts.push(utilitiesExpense);

  const insuranceExpense = await prisma.account.create({
    data: {
      organizationId,
      accountCode: '6300',
      name: 'Insurance Expense',
      type: 'EXPENSE',
      normalBalance: 'DEBIT',
      description: 'Business insurance',
      isActive: true,
      isSystem: false,
      balance: 0
    }
  });
  accounts.push(insuranceExpense);

  const officeSupplies = await prisma.account.create({
    data: {
      organizationId,
      accountCode: '6400',
      name: 'Office Supplies',
      type: 'EXPENSE',
      normalBalance: 'DEBIT',
      description: 'Office supplies and materials',
      isActive: true,
      isSystem: false,
      balance: 0
    }
  });
  accounts.push(officeSupplies);

  const marketingExpense = await prisma.account.create({
    data: {
      organizationId,
      accountCode: '6500',
      name: 'Marketing and Advertising',
      type: 'EXPENSE',
      normalBalance: 'DEBIT',
      description: 'Marketing and advertising costs',
      isActive: true,
      isSystem: false,
      balance: 0
    }
  });
  accounts.push(marketingExpense);

  const professionalFees = await prisma.account.create({
    data: {
      organizationId,
      accountCode: '6600',
      name: 'Professional Fees',
      type: 'EXPENSE',
      normalBalance: 'DEBIT',
      description: 'Legal and accounting fees',
      isActive: true,
      isSystem: false,
      balance: 0
    }
  });
  accounts.push(professionalFees);

  const bankFees = await prisma.account.create({
    data: {
      organizationId,
      accountCode: '6700',
      name: 'Bank Fees and Charges',
      type: 'EXPENSE',
      normalBalance: 'DEBIT',
      description: 'Bank service charges',
      isActive: true,
      isSystem: false,
      balance: 0
    }
  });
  accounts.push(bankFees);

  const depreciation = await prisma.account.create({
    data: {
      organizationId,
      accountCode: '6800',
      name: 'Depreciation Expense',
      type: 'EXPENSE',
      normalBalance: 'DEBIT',
      description: 'Asset depreciation',
      isActive: true,
      isSystem: false,
      balance: 0
    }
  });
  accounts.push(depreciation);

  return accounts;
}

// ==================== EXECUTE SEED ====================

void main()
  .catch((e: Error) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
