import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { seedInvoiceTemplates } from './seeds/master-organization.seed';

const prisma = new PrismaClient();

// Helper function to hash passwords
const hashPassword = async (password: string): Promise<string> => {
  return await bcrypt.hash(password, 12);
};

// Generate organization encryption key
const generateEncryptionKey = (): string => {
  return randomUUID().replace(/-/g, '');
};

async function main() {
  console.log('🌱 Starting database seeding...');

  // Clear existing data in development (correct order to avoid foreign key constraints)
  if (process.env.NODE_ENV === 'development') {
    console.log('🧹 Clearing existing development data...');

    // Delete in reverse dependency order (child records first, then parent records)
    console.log('  - Deleting transactional data...');
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
    await prisma.session.deleteMany();

    console.log('  - Deleting financial records...');
    await prisma.transaction?.deleteMany().catch(() => {});
    await prisma.journalEntry?.deleteMany().catch(() => {});
    await prisma.payment.deleteMany();
    await prisma.invoiceItem.deleteMany();
    await prisma.invoice.deleteMany();
    await prisma.quoteItem.deleteMany();
    await prisma.quote.deleteMany();
    await prisma.expense.deleteMany();

    console.log('  - Deleting operational data...');
    await prisma.appointment.deleteMany();
    await prisma.project.deleteMany();

    console.log('  - Deleting relationships and addresses...');
    await prisma.customerAddress.deleteMany();
    await prisma.vendorAddress.deleteMany();

    console.log('  - Deleting entities...');
    await prisma.customer.deleteMany();
    await prisma.vendor.deleteMany();
    await prisma.employee.deleteMany();
    await prisma.contractor.deleteMany();
    await prisma.business.deleteMany();
    await prisma.person.deleteMany();

    console.log('  - Deleting organizational data...');
    await prisma.address.deleteMany();
    await prisma.location.deleteMany();
    await prisma.product.deleteMany();
    await prisma.service.deleteMany();
    await prisma.account.deleteMany();
    await prisma.apiKey.deleteMany();
    await prisma.user.deleteMany();

    console.log('  - Deleting invoice templates and styles...');
    await prisma.invoiceStyle?.deleteMany().catch(() => {});
    await prisma.invoiceTemplate?.deleteMany().catch(() => {});
    await prisma.generatedPDF?.deleteMany().catch(() => {});
    await prisma.organizationBranding?.deleteMany().catch(() => {});

    console.log('  - Deleting organizations...');
    await prisma.organization.deleteMany();

    // Delete reference data that doesn't have organization dependencies
    console.log('  - Deleting reference data...');
    await prisma.stateProvince.deleteMany();
    await prisma.taxRate?.deleteMany().catch(() => {});
    await prisma.productCategory?.deleteMany().catch(() => {});
    await prisma.serviceCategory?.deleteMany().catch(() => {});
  }

  // ==================== CREATE REFERENCE DATA ====================
  console.log('🌍 Creating reference data...');

  // Create countries
  const canada = await prisma.country.upsert({
    where: { code: 'CA' },
    update: {},
    create: {
      code: 'CA',
      code3: 'CAN',
      name: 'Canada',
      phoneCode: '+1',
      currency: 'CAD'
    }
  });

  const usa = await prisma.country.upsert({
    where: { code: 'US' },
    update: {},
    create: {
      code: 'US',
      code3: 'USA',
      name: 'United States',
      phoneCode: '+1',
      currency: 'USD'
    }
  });

  // Create currencies
  await prisma.currency.upsert({
    where: { code: 'CAD' },
    update: {},
    create: {
      code: 'CAD',
      name: 'Canadian Dollar',
      symbol: '$',
      decimalPlaces: 2
    }
  });

  await prisma.currency.upsert({
    where: { code: 'USD' },
    update: {},
    create: {
      code: 'USD',
      name: 'US Dollar',
      symbol: '$',
      decimalPlaces: 2
    }
  });

  // Create tax rates
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

  // Create product and service categories
  const softwareCategory = await prisma.productCategory.upsert({
    where: { code: 'SOFTWARE' },
    update: {},
    create: {
      code: 'SOFTWARE',
      name: 'Software',
      description: 'Software products and licenses'
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

  // ==================== CREATE ORGANIZATIONS ====================
  console.log('🏢 Creating organizations...');

  const organization1 = await prisma.organization.create({
    data: {
      name: 'Lifestream Dynamics',
      legalName: 'Lifestream Dynamics Corporation',
      domain: 'lifestreamdynamics.com',
      type: 'SINGLE_BUSINESS',
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
          default_payment_terms: 15,
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

  const organization2 = await prisma.organization.create({
    data: {
      name: 'Tech Solutions Inc',
      legalName: 'Tech Solutions Incorporated',
      domain: 'techsolutions.dev',
      type: 'SINGLE_BUSINESS',
      isActive: true,
      settings: JSON.stringify({
        timezone: 'America/New_York',
        currency: 'USD',
        fiscal_year_start: '01-01'
      }),
      encryptionKey: generateEncryptionKey(),
      businessNumber: 'BN987654321RT0002',
      taxNumber: 'US987654321',
      email: 'contact@techsolutions.dev',
      phone: '+1-212-555-0200',
      website: 'https://techsolutions.dev'
    }
  });

  // ==================== SEED INVOICE TEMPLATES ====================
  console.log('📄 Seeding invoice templates...');
  await seedInvoiceTemplates(organization1.id);
  await seedInvoiceTemplates(organization2.id);

  // ==================== CREATE USERS ====================
  console.log('👥 Creating users...');

  const superAdmin = await prisma.user.create({
    data: {
      organizationId: organization1.id,
      email: 'admin@lifestreamdynamics.com',
      passwordHash: await hashPassword('SuperAdmin123!'),
      role: 'SUPER_ADMIN',
      firstName: 'System',
      lastName: 'Administrator',
      isActive: true,
      emailVerified: true,
      phone: '+1-416-555-0100'
    }
  });

  const orgAdmin = await prisma.user.create({
    data: {
      organizationId: organization1.id,
      email: 'manager@lifestreamdynamics.com',
      passwordHash: await hashPassword('OrgAdmin123!'),
      role: 'ADMIN',
      firstName: 'Organization',
      lastName: 'Manager',
      phone: '+1-416-555-0101',
      isActive: true,
      emailVerified: true
    }
  });

  const manager = await prisma.user.create({
    data: {
      organizationId: organization1.id,
      email: 'sales@lifestreamdynamics.com',
      passwordHash: await hashPassword('Manager123!'),
      role: 'MANAGER',
      firstName: 'Sales',
      lastName: 'Manager',
      phone: '+1-416-555-0102',
      isActive: true,
      emailVerified: true
    }
  });

  const accountant = await prisma.user.create({
    data: {
      organizationId: organization1.id,
      email: 'accounting@lifestreamdynamics.com',
      passwordHash: await hashPassword('Accountant123!'),
      role: 'ACCOUNTANT',
      firstName: 'Finance',
      lastName: 'Accountant',
      phone: '+1-416-555-0103',
      isActive: true,
      emailVerified: true
    }
  });

  const employee = await prisma.user.create({
    data: {
      organizationId: organization1.id,
      email: 'employee@lifestreamdynamics.com',
      passwordHash: await hashPassword('Employee123!'),
      role: 'EMPLOYEE',
      firstName: 'Regular',
      lastName: 'Employee',
      phone: '+1-416-555-0104',
      isActive: true,
      emailVerified: true
    }
  });

  const viewer = await prisma.user.create({
    data: {
      organizationId: organization1.id,
      email: 'viewer@lifestreamdynamics.com',
      passwordHash: await hashPassword('Viewer123!'),
      role: 'VIEWER',
      firstName: 'Read Only',
      lastName: 'Viewer',
      phone: '+1-416-555-0105',
      isActive: true,
      emailVerified: true
    }
  });

  const techAdmin = await prisma.user.create({
    data: {
      organizationId: organization2.id,
      email: 'admin@techsolutions.dev',
      passwordHash: await hashPassword('TechAdmin123!'),
      role: 'ORG_ADMIN',
      firstName: 'Tech',
      lastName: 'Administrator',
      phone: '+1-212-555-0201',
      isActive: true,
      emailVerified: true
    }
  });

  // ==================== CREATE STATE/PROVINCES ====================
  console.log('🗺️ Creating state/provinces...');

  const ontario = await prisma.stateProvince.upsert({
    where: {
      countryId_code: {
        countryId: canada.id,
        code: 'ON'
      }
    },
    update: {},
    create: {
      countryId: canada.id,
      code: 'ON',
      name: 'Ontario',
      taxRate: 13.0, // HST
      isActive: true
    }
  });

  const britishColumbia = await prisma.stateProvince.upsert({
    where: {
      countryId_code: {
        countryId: canada.id,
        code: 'BC'
      }
    },
    update: {},
    create: {
      countryId: canada.id,
      code: 'BC',
      name: 'British Columbia',
      taxRate: 7.0, // PST (plus 5% GST)
      isActive: true
    }
  });

  // ==================== CREATE ADDRESSES ====================
  console.log('🏠 Creating addresses...');

  const address1 = await prisma.address.create({
    data: {
      organizationId: organization1.id,
      line1: '100 King Street West',
      line2: 'Suite 1500',
      city: 'Toronto',
      stateProvinceId: ontario.id,
      postalCode: 'M5X 1A9',
      countryId: canada.id,
      latitude: 43.6532,
      longitude: -79.3832
    }
  });

  const address2 = await prisma.address.create({
    data: {
      organizationId: organization1.id,
      line1: '456 Manufacturing Way',
      city: 'Mississauga',
      stateProvinceId: ontario.id,
      postalCode: 'L5T 2T5',
      countryId: canada.id
    }
  });

  // ==================== CREATE PERSONS ====================
  console.log('👤 Creating persons...');

  const person1 = await prisma.person.create({
    data: {
      organizationId: organization1.id,
      firstName: 'Emily',
      lastName: 'Johnson',
      email: 'emily.johnson@email.com',
      phone: '+1-416-555-1002'
    }
  });

  const person2 = await prisma.person.create({
    data: {
      organizationId: organization1.id,
      firstName: 'Mark',
      lastName: 'Wilson',
      email: 'mark@startupinnovations.com',
      phone: '+1-416-555-1003'
    }
  });

  // ==================== CREATE BUSINESSES ====================
  console.log('🏢 Creating businesses...');

  const business1 = await prisma.business.create({
    data: {
      organizationId: organization1.id,
      legalName: 'Global Manufacturing Solutions Ltd.',
      tradeName: 'Global Manufacturing',
      businessNumber: 'BN999888777RT0001',
      taxNumber: 'CA999888777',
      businessType: 'CORPORATION',
      email: 'contact@globalmanufacturing.com',
      phone: '+1-905-555-2001',
      website: 'https://globalmanufacturing.com'
    }
  });

  const business2 = await prisma.business.create({
    data: {
      organizationId: organization1.id,
      legalName: 'Startup Innovations Inc.',
      tradeName: 'Startup Innovations',
      businessNumber: 'BN888777666RT0002',
      taxNumber: 'CA888777666',
      businessType: 'CORPORATION',
      email: 'info@startupinnovations.com',
      phone: '+1-416-555-3001',
      website: 'https://startupinnovations.com'
    }
  });

  // ==================== CREATE CUSTOMERS ====================
  console.log('👨‍💼 Creating customers...');

  const customer1 = await prisma.customer.create({
    data: {
      organizationId: organization1.id,
      customerNumber: 'CUST-001',
      businessId: business1.id,
      tier: 'ENTERPRISE',
      status: 'ACTIVE',
      creditLimit: 50000.00,
      paymentTerms: 30,
      preferredCurrency: 'CAD',
      notes: 'Long-term client, excellent payment history. Key contact for manufacturing partnerships.'
    }
  });

  const customer2 = await prisma.customer.create({
    data: {
      organizationId: organization1.id,
      customerNumber: 'CUST-002',
      personId: person1.id,
      tier: 'PERSONAL',
      status: 'ACTIVE',
      creditLimit: 10000.00,
      paymentTerms: 15,
      preferredCurrency: 'CAD',
      notes: 'Individual client, prefers email communication. Small business owner.'
    }
  });

  const customer3 = await prisma.customer.create({
    data: {
      organizationId: organization1.id,
      customerNumber: 'CUST-003',
      businessId: business2.id,
      tier: 'SMALL_BUSINESS',
      status: 'ACTIVE',
      creditLimit: 25000.00,
      paymentTerms: 15,
      preferredCurrency: 'CAD',
      notes: 'Growing startup, fast payments. Technology services client.'
    }
  });

  // ==================== CREATE PRODUCTS & SERVICES ====================
  console.log('📦 Creating products and services...');

  const product1 = await prisma.product.create({
    data: {
      organizationId: organization1.id,
      sku: 'SW-001',
      name: 'Accounting Software License',
      description: 'Professional accounting software license for small business',
      categoryId: softwareCategory.id,
      unitPrice: 299.99,
      cost: 150.00,
      taxable: true,
      trackInventory: true,
      quantity: 100,
      reorderPoint: 10
    }
  });

  const service1 = await prisma.service.create({
    data: {
      organizationId: organization1.id,
      code: 'CONS-001',
      name: 'Business Consulting',
      description: 'Professional business consulting services',
      categoryId: consultingCategory.id,
      hourlyRate: 175.00,
      minimumHours: 1.0,
      taxable: true
    }
  });

  // ==================== CREATE PROJECTS ====================
  console.log('📋 Creating projects...');

  const project1 = await prisma.project.create({
    data: {
      organizationId: organization1.id,
      projectNumber: 'PROJ-001',
      customerId: customer1.id,
      assignedToId: manager.id,
      name: 'ERP System Implementation',
      description: 'Complete ERP system implementation for manufacturing operations',
      status: 'IN_PROGRESS',
      priority: 2,
      startDate: new Date('2024-01-15'),
      endDate: new Date('2024-06-30'),
      estimatedHours: 500.0,
      actualHours: 125.5,
      hourlyRate: 175.00
    }
  });

  const project2 = await prisma.project.create({
    data: {
      organizationId: organization1.id,
      projectNumber: 'PROJ-002',
      customerId: customer3.id,
      assignedToId: employee.id,
      name: 'Website Development',
      description: 'Modern responsive website development with e-commerce capabilities',
      status: 'QUOTED',
      priority: 3,
      estimatedHours: 120.0,
      fixedPrice: 15000.00
    }
  });

  // ==================== CREATE QUOTES ====================
  console.log('💰 Creating quotes...');

  const quote1 = await prisma.quote.create({
    data: {
      organizationId: organization1.id,
      quoteNumber: 'QT-2024-001',
      customerId: customer1.id,
      createdById: manager.id,
      status: 'ACCEPTED',
      currency: 'CAD',
      subtotal: 87500.00,
      taxAmount: 11375.00,
      total: 98875.00,
      validUntil: new Date('2024-12-31'),
      notes: 'Complete ERP implementation package including training and support',
      terms: 'Payment terms: 30% deposit, 70% on completion. Net 30 days.'
    }
  });

  const quote2 = await prisma.quote.create({
    data: {
      organizationId: organization1.id,
      quoteNumber: 'QT-2024-002',
      customerId: customer2.id,
      createdById: manager.id,
      status: 'SENT',
      currency: 'CAD',
      subtotal: 2999.85,
      taxAmount: 389.98,
      total: 3389.83,
      validUntil: new Date('2025-01-15'),
      notes: 'Personal accounting software setup and training',
      terms: 'Payment due within 15 days of acceptance'
    }
  });

  const quote3 = await prisma.quote.create({
    data: {
      organizationId: organization1.id,
      quoteNumber: 'QT-2024-003',
      customerId: customer3.id,
      createdById: employee.id,
      status: 'DRAFT',
      currency: 'CAD',
      subtotal: 15000.00,
      taxAmount: 1950.00,
      total: 16950.00,
      validUntil: new Date('2024-12-20'),
      notes: 'Website development with e-commerce functionality',
      terms: 'Payment terms: 50% deposit, 50% on completion'
    }
  });

  // ==================== CREATE QUOTE ITEMS ====================
  console.log('📋 Creating quote items...');

  await prisma.quoteItem.createMany({
    data: [
      // Quote 1 items (ERP Implementation)
      {
        quoteId: quote1.id,
        serviceId: service1.id,
        description: 'Business process analysis and requirements gathering',
        quantity: 40.0,
        unitPrice: 175.00,
        discountPercent: 0.0,
        taxRate: 13.0,
        subtotal: 7000.00,
        discountAmount: 0.00,
        taxAmount: 910.00,
        total: 7910.00,
        sortOrder: 1
      },
      {
        quoteId: quote1.id,
        serviceId: service1.id,
        description: 'ERP system configuration and customization',
        quantity: 200.0,
        unitPrice: 175.00,
        discountPercent: 0.0,
        taxRate: 13.0,
        subtotal: 35000.00,
        discountAmount: 0.00,
        taxAmount: 4550.00,
        total: 39550.00,
        sortOrder: 2
      },
      {
        quoteId: quote1.id,
        serviceId: service1.id,
        description: 'Data migration and system testing',
        quantity: 80.0,
        unitPrice: 175.00,
        discountPercent: 0.0,
        taxRate: 13.0,
        subtotal: 14000.00,
        discountAmount: 0.00,
        taxAmount: 1820.00,
        total: 15820.00,
        sortOrder: 3
      },
      {
        quoteId: quote1.id,
        serviceId: service1.id,
        description: 'User training and documentation',
        quantity: 60.0,
        unitPrice: 175.00,
        discountPercent: 0.0,
        taxRate: 13.0,
        subtotal: 10500.00,
        discountAmount: 0.00,
        taxAmount: 1365.00,
        total: 11865.00,
        sortOrder: 4
      },
      {
        quoteId: quote1.id,
        productId: product1.id,
        description: 'Software licenses (25 users)',
        quantity: 25.0,
        unitPrice: 299.99,
        discountPercent: 0.0,
        taxRate: 13.0,
        subtotal: 7499.75,
        discountAmount: 0.00,
        taxAmount: 974.97,
        total: 8474.72,
        sortOrder: 5
      },
      {
        quoteId: quote1.id,
        serviceId: service1.id,
        description: 'Project management and support',
        quantity: 80.0,
        unitPrice: 175.00,
        discountPercent: 0.0,
        taxRate: 13.0,
        subtotal: 14000.00,
        discountAmount: 0.00,
        taxAmount: 1820.00,
        total: 15820.00,
        sortOrder: 6
      },
      // Quote 2 items (Personal setup)
      {
        quoteId: quote2.id,
        productId: product1.id,
        description: 'Personal accounting software license',
        quantity: 1.0,
        unitPrice: 299.99,
        discountPercent: 0.0,
        taxRate: 13.0,
        subtotal: 299.99,
        discountAmount: 0.00,
        taxAmount: 39.00,
        total: 338.99,
        sortOrder: 1
      },
      {
        quoteId: quote2.id,
        serviceId: service1.id,
        description: 'Software setup and configuration',
        quantity: 8.0,
        unitPrice: 175.00,
        discountPercent: 0.0,
        taxRate: 13.0,
        subtotal: 1400.00,
        discountAmount: 0.00,
        taxAmount: 182.00,
        total: 1582.00,
        sortOrder: 2
      },
      {
        quoteId: quote2.id,
        serviceId: service1.id,
        description: 'Personal training session',
        quantity: 4.0,
        unitPrice: 175.00,
        discountPercent: 0.0,
        taxRate: 13.0,
        subtotal: 700.00,
        discountAmount: 0.00,
        taxAmount: 91.00,
        total: 791.00,
        sortOrder: 3
      },
      {
        quoteId: quote2.id,
        serviceId: service1.id,
        description: 'Data import and setup',
        quantity: 3.43,
        unitPrice: 175.00,
        discountPercent: 0.0,
        taxRate: 13.0,
        subtotal: 600.25,
        discountAmount: 0.00,
        taxAmount: 78.03,
        total: 678.28,
        sortOrder: 4
      },
      // Quote 3 items (Website development)
      {
        quoteId: quote3.id,
        serviceId: service1.id,
        description: 'Website design and development',
        quantity: 60.0,
        unitPrice: 175.00,
        discountPercent: 0.0,
        taxRate: 13.0,
        subtotal: 10500.00,
        discountAmount: 0.00,
        taxAmount: 1365.00,
        total: 11865.00,
        sortOrder: 1
      },
      {
        quoteId: quote3.id,
        serviceId: service1.id,
        description: 'E-commerce integration',
        quantity: 25.71,
        unitPrice: 175.00,
        discountPercent: 0.0,
        taxRate: 13.0,
        subtotal: 4499.25,
        discountAmount: 0.00,
        taxAmount: 584.90,
        total: 5084.15,
        sortOrder: 2
      }
    ]
  });

  // ==================== CREATE APPOINTMENTS ====================
  console.log('📅 Creating appointments...');

  const appointment1 = await prisma.appointment.create({
    data: {
      organizationId: organization1.id,
      customerId: customer1.id,
      projectId: project1.id,
      title: 'ERP Implementation Kickoff Meeting',
      description: 'Initial project kickoff meeting to discuss requirements and timeline',
      startTime: new Date('2024-02-01T09:00:00Z'),
      endTime: new Date('2024-02-01T11:00:00Z'),
      duration: 120,
      confirmed: true,
      completed: true,
      cancelled: false
    }
  });

  const appointment2 = await prisma.appointment.create({
    data: {
      organizationId: organization1.id,
      customerId: customer2.id,
      title: 'Personal Accounting Setup',
      description: 'Initial consultation for personal accounting software setup',
      startTime: new Date('2024-01-20T14:00:00Z'),
      endTime: new Date('2024-01-20T15:30:00Z'),
      duration: 90,
      confirmed: true,
      completed: false,
      cancelled: false
    }
  });

  // ==================== CREATE INVOICES ====================
  console.log('📄 Creating invoices...');

  // Get invoice templates for linking
  const invoiceTemplates = await prisma.invoiceTemplate.findMany({
    where: {
      organizationId: organization1.id,
      isSystem: true
    },
    orderBy: { name: 'asc' }
  });

  const defaultTemplate = invoiceTemplates.find(t => t.isDefault) || invoiceTemplates[0];
  const modernTemplate = invoiceTemplates.find(t => t.name === 'Modern Blue') || invoiceTemplates[1];
  const minimalTemplate = invoiceTemplates.find(t => t.name === 'Minimal Clean') || invoiceTemplates[2];

  const invoice1 = await prisma.invoice.create({
    data: {
      organizationId: organization1.id,
      invoiceNumber: 'INV-2024-001',
      customerId: customer1.id,
      quoteId: quote1.id,
      templateId: defaultTemplate?.id,
      issueDate: new Date('2024-02-01'),
      dueDate: new Date('2024-03-03'),
      status: 'PAID',
      currency: 'CAD',
      subtotal: 29625.00,
      taxAmount: 3851.25,
      total: 33476.25,
      depositRequired: 10042.88,
      amountPaid: 33476.25,
      balance: 0.00,
      notes: 'Deposit payment for ERP implementation project (30% of total)',
      terms: 'Payment due within 30 days. Late payments subject to 1.5% monthly interest.'
    }
  });

  const invoice2 = await prisma.invoice.create({
    data: {
      organizationId: organization1.id,
      invoiceNumber: 'INV-2024-002',
      customerId: customer2.id,
      templateId: modernTemplate?.id,
      issueDate: new Date('2024-01-25'),
      dueDate: new Date('2024-02-09'),
      status: 'PARTIALLY_PAID',
      currency: 'CAD',
      subtotal: 1999.85,
      taxAmount: 259.98,
      total: 2259.83,
      depositRequired: 677.95,
      amountPaid: 1000.00,
      balance: 1259.83,
      notes: 'Personal accounting software and setup services',
      terms: 'Payment due within 15 days of invoice date.'
    }
  });

  const invoice3 = await prisma.invoice.create({
    data: {
      organizationId: organization1.id,
      invoiceNumber: 'INV-2024-003',
      customerId: customer3.id,
      templateId: minimalTemplate?.id,
      issueDate: new Date('2024-01-30'),
      dueDate: new Date('2024-02-14'),
      status: 'SENT',
      currency: 'CAD',
      subtotal: 7500.00,
      taxAmount: 975.00,
      total: 8475.00,
      depositRequired: 4237.50,
      amountPaid: 0.00,
      balance: 8475.00,
      notes: 'Website development project deposit (50% of total)',
      terms: 'Payment due within 15 days. Second payment due on project completion.'
    }
  });

  // ==================== CREATE INVOICE ITEMS ====================
  console.log('📋 Creating invoice items...');

  await prisma.invoiceItem.createMany({
    data: [
      // Invoice 1 items (ERP Deposit)
      {
        invoiceId: invoice1.id,
        serviceId: service1.id,
        description: 'Project deposit - Business process analysis (30%)',
        quantity: 12.0,
        unitPrice: 175.00,
        discountPercent: 0.0,
        taxRate: 13.0,
        subtotal: 2100.00,
        discountAmount: 0.00,
        taxAmount: 273.00,
        total: 2373.00,
        sortOrder: 1
      },
      {
        invoiceId: invoice1.id,
        serviceId: service1.id,
        description: 'Project deposit - ERP configuration (30%)',
        quantity: 60.0,
        unitPrice: 175.00,
        discountPercent: 0.0,
        taxRate: 13.0,
        subtotal: 10500.00,
        discountAmount: 0.00,
        taxAmount: 1365.00,
        total: 11865.00,
        sortOrder: 2
      },
      {
        invoiceId: invoice1.id,
        serviceId: service1.id,
        description: 'Project deposit - Data migration (30%)',
        quantity: 24.0,
        unitPrice: 175.00,
        discountPercent: 0.0,
        taxRate: 13.0,
        subtotal: 4200.00,
        discountAmount: 0.00,
        taxAmount: 546.00,
        total: 4746.00,
        sortOrder: 3
      },
      {
        invoiceId: invoice1.id,
        serviceId: service1.id,
        description: 'Project deposit - Training (30%)',
        quantity: 18.0,
        unitPrice: 175.00,
        discountPercent: 0.0,
        taxRate: 13.0,
        subtotal: 3150.00,
        discountAmount: 0.00,
        taxAmount: 409.50,
        total: 3559.50,
        sortOrder: 4
      },
      {
        invoiceId: invoice1.id,
        productId: product1.id,
        description: 'Software licenses deposit (30%)',
        quantity: 7.5,
        unitPrice: 299.99,
        discountPercent: 0.0,
        taxRate: 13.0,
        subtotal: 2249.93,
        discountAmount: 0.00,
        taxAmount: 292.49,
        total: 2542.42,
        sortOrder: 5
      },
      {
        invoiceId: invoice1.id,
        serviceId: service1.id,
        description: 'Project management deposit (30%)',
        quantity: 24.0,
        unitPrice: 175.00,
        discountPercent: 0.0,
        taxRate: 13.0,
        subtotal: 4200.00,
        discountAmount: 0.00,
        taxAmount: 546.00,
        total: 4746.00,
        sortOrder: 6
      },
      {
        invoiceId: invoice1.id,
        description: 'Project management overhead',
        quantity: 1.0,
        unitPrice: 3225.07,
        discountPercent: 0.0,
        taxRate: 13.0,
        subtotal: 3225.07,
        discountAmount: 0.00,
        taxAmount: 419.26,
        total: 3644.33,
        sortOrder: 7
      },
      // Invoice 2 items (Personal services)
      {
        invoiceId: invoice2.id,
        productId: product1.id,
        description: 'Personal accounting software license',
        quantity: 1.0,
        unitPrice: 299.99,
        discountPercent: 0.0,
        taxRate: 13.0,
        subtotal: 299.99,
        discountAmount: 0.00,
        taxAmount: 39.00,
        total: 338.99,
        sortOrder: 1
      },
      {
        invoiceId: invoice2.id,
        serviceId: service1.id,
        description: 'Software setup and configuration',
        quantity: 6.0,
        unitPrice: 175.00,
        discountPercent: 0.0,
        taxRate: 13.0,
        subtotal: 1050.00,
        discountAmount: 0.00,
        taxAmount: 136.50,
        total: 1186.50,
        sortOrder: 2
      },
      {
        invoiceId: invoice2.id,
        serviceId: service1.id,
        description: 'Personal training session',
        quantity: 3.71,
        unitPrice: 175.00,
        discountPercent: 0.0,
        taxRate: 13.0,
        subtotal: 649.25,
        discountAmount: 0.00,
        taxAmount: 84.40,
        total: 733.65,
        sortOrder: 3
      },
      // Invoice 3 items (Website deposit)
      {
        invoiceId: invoice3.id,
        serviceId: service1.id,
        description: 'Website development deposit (50%)',
        quantity: 30.0,
        unitPrice: 175.00,
        discountPercent: 0.0,
        taxRate: 13.0,
        subtotal: 5250.00,
        discountAmount: 0.00,
        taxAmount: 682.50,
        total: 5932.50,
        sortOrder: 1
      },
      {
        invoiceId: invoice3.id,
        serviceId: service1.id,
        description: 'E-commerce integration deposit (50%)',
        quantity: 12.86,
        unitPrice: 175.00,
        discountPercent: 0.0,
        taxRate: 13.0,
        subtotal: 2250.50,
        discountAmount: 0.00,
        taxAmount: 292.57,
        total: 2543.07,
        sortOrder: 2
      }
    ]
  });

  // ==================== CREATE PAYMENTS ====================
  console.log('💳 Creating payments...');

  const payment1 = await prisma.payment.create({
    data: {
      organizationId: organization1.id,
      paymentNumber: 'PAY-2024-001',
      customerId: customer1.id,
      invoiceId: invoice1.id,
      amount: 33476.25,
      currency: 'CAD',
      paymentMethod: 'BANK_TRANSFER',
      referenceNumber: 'BT-20240205-001',
      paymentDate: new Date('2024-02-05')
    }
  });

  const payment2 = await prisma.payment.create({
    data: {
      organizationId: organization1.id,
      paymentNumber: 'PAY-2024-002',
      customerId: customer2.id,
      invoiceId: invoice2.id,
      amount: 1000.00,
      currency: 'CAD',
      paymentMethod: 'E_TRANSFER',
      referenceNumber: 'ET-20240128-002',
      paymentDate: new Date('2024-01-28')
    }
  });

  const payment3 = await prisma.payment.create({
    data: {
      organizationId: organization1.id,
      paymentNumber: 'PAY-2024-003',
      customerId: customer1.id,
      amount: 5000.00,
      currency: 'CAD',
      paymentMethod: 'CHEQUE',
      referenceNumber: 'CHK-12345',
      paymentDate: new Date('2024-02-10')
    }
  });

  const payment4 = await prisma.payment.create({
    data: {
      organizationId: organization1.id,
      paymentNumber: 'PAY-2024-004',
      customerId: customer3.id,
      amount: 4237.50,
      currency: 'CAD',
      paymentMethod: 'CREDIT_CARD',
      paymentDate: new Date('2024-02-01')
    }
  });

  const payment5 = await prisma.payment.create({
    data: {
      organizationId: organization1.id,
      paymentNumber: 'PAY-2024-005',
      customerId: customer2.id,
      invoiceId: invoice2.id,
      amount: 259.83,
      currency: 'CAD',
      paymentMethod: 'CASH',
      referenceNumber: 'CASH-20240131',
      paymentDate: new Date('2024-01-31')
    }
  });


  console.log('✅ Database seeding completed successfully!');
  console.log('\n🔑 Lifestream Dynamics Test Login Credentials:');
  console.log('SUPER_ADMIN: admin@lifestreamdynamics.com / SuperAdmin123!');
  console.log('ADMIN: manager@lifestreamdynamics.com / OrgAdmin123!');
  console.log('MANAGER: sales@lifestreamdynamics.com / Manager123!');
  console.log('ACCOUNTANT: accounting@lifestreamdynamics.com / Accountant123!');
  console.log('EMPLOYEE: employee@lifestreamdynamics.com / Employee123!');
  console.log('VIEWER: viewer@lifestreamdynamics.com / Viewer123!');
  console.log('\n🏢 Organization: Lifestream Dynamics Corporation');
  console.log('🌐 Domain: lifestreamdynamics.com');
  console.log('💼 Industry: Technology Consulting');
  console.log('\n🔧 Alternative Test Organization:');
  console.log('Tech Admin: admin@techsolutions.dev / TechAdmin123!');
  console.log('\n📊 Sample Data Created:');
  console.log('• 3 Customers (Enterprise, Personal, Small Business)');
  console.log('• 3 Quotes ($98K, $3.3K, $16.9K)');
  console.log('• 3 Invoices (Paid, Partial, Sent)');
  console.log('• 6 Payments ($33.4K, $1K, $5K, Failed, $260, $1.5K USD)');
  console.log('• 2 Projects (ERP Implementation, Website Development)');
  console.log('• 2 Appointments (Completed, Scheduled)');
  console.log('• 6 Invoice Templates (3 per organization)');
  console.log('• 6 Invoice Styles (3 per organization)');
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });