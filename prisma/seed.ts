import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

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

    // Delete in reverse dependency order
    await prisma.auditLog.deleteMany();
    await prisma.session.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.invoiceItem.deleteMany();
    await prisma.invoice.deleteMany();
    await prisma.quoteItem.deleteMany();
    await prisma.quote.deleteMany();
    await prisma.appointment.deleteMany();
    await prisma.project.deleteMany();
    await prisma.expense.deleteMany();
    await prisma.customerAddress.deleteMany();
    await prisma.vendorAddress.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.vendor.deleteMany();
    await prisma.employee.deleteMany();
    await prisma.contractor.deleteMany();
    await prisma.address.deleteMany();
    await prisma.location.deleteMany();
    await prisma.product.deleteMany();
    await prisma.service.deleteMany();
    await prisma.business.deleteMany();
    await prisma.person.deleteMany();
    await prisma.user.deleteMany();
    await prisma.organization.deleteMany();

    // Delete reference data
    await prisma.account.deleteMany();
    await prisma.apiKey.deleteMany();
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
      name: 'Acme Corporation',
      legalName: 'Acme Corporation Ltd.',
      domain: 'acme.dev',
      type: 'SINGLE_BUSINESS',
      isActive: true,
      settings: JSON.stringify({
        timezone: 'America/Toronto',
        currency: 'CAD',
        fiscal_year_start: '01-01',
        tax_settings: {
          default_tax_rate: 'HST_ON',
          tax_inclusive: false
        }
      }),
      encryptionKey: generateEncryptionKey(),
      businessNumber: 'BN123456789RT0001',
      taxNumber: 'CA123456789',
      email: 'admin@acme.dev',
      phone: '+1-416-555-0100',
      website: 'https://acme.dev'
    }
  });

  const organization2 = await prisma.organization.create({
    data: {
      name: 'Tech Innovators Inc',
      legalName: 'Tech Innovators Incorporated',
      domain: 'techinnovators.com',
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
      email: 'contact@techinnovators.com',
      phone: '+1-212-555-0200',
      website: 'https://techinnovators.com'
    }
  });

  // ==================== CREATE USERS ====================
  console.log('👥 Creating users...');

  const superAdmin = await prisma.user.create({
    data: {
      organizationId: organization1.id,
      email: 'superadmin@acme.dev',
      passwordHash: await hashPassword('SuperAdmin2024!'),
      role: 'SUPER_ADMIN',
      firstName: 'Super',
      lastName: 'Admin',
      isActive: true,
      emailVerified: true
    }
  });

  const orgAdmin = await prisma.user.create({
    data: {
      organizationId: organization1.id,
      email: 'admin@acme.dev',
      passwordHash: await hashPassword('Admin2024!'),
      role: 'ORG_ADMIN',
      firstName: 'Organization',
      lastName: 'Admin',
      phone: '+1-416-555-0101',
      isActive: true,
      emailVerified: true
    }
  });

  const manager = await prisma.user.create({
    data: {
      organizationId: organization1.id,
      email: 'manager@acme.dev',
      passwordHash: await hashPassword('Manager2024!'),
      role: 'MANAGER',
      firstName: 'Project',
      lastName: 'Manager',
      phone: '+1-416-555-0102',
      isActive: true,
      emailVerified: true
    }
  });

  const employee = await prisma.user.create({
    data: {
      organizationId: organization1.id,
      email: 'employee@acme.dev',
      passwordHash: await hashPassword('Employee2024!'),
      role: 'EMPLOYEE',
      firstName: 'Regular',
      lastName: 'Employee',
      phone: '+1-416-555-0103',
      isActive: true,
      emailVerified: true
    }
  });

  const viewer = await prisma.user.create({
    data: {
      organizationId: organization1.id,
      email: 'viewer@acme.dev',
      passwordHash: await hashPassword('Viewer2024!'),
      role: 'VIEWER',
      firstName: 'Read Only',
      lastName: 'Viewer',
      phone: '+1-416-555-0104',
      isActive: true,
      emailVerified: true
    }
  });

  const techAdmin = await prisma.user.create({
    data: {
      organizationId: organization2.id,
      email: 'admin@techinnovators.com',
      passwordHash: await hashPassword('TechAdmin2024!'),
      role: 'ORG_ADMIN',
      firstName: 'Tech',
      lastName: 'Administrator',
      phone: '+1-212-555-0201',
      isActive: true,
      emailVerified: true
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
      stateProvince: 'ON',
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
      stateProvince: 'ON',
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

  console.log('✅ Database seeding completed successfully!');
  console.log('\n🔑 Test Login Credentials:');
  console.log('Super Admin: superadmin@acme.dev / SuperAdmin2024!');
  console.log('Org Admin: admin@acme.dev / Admin2024!');
  console.log('Manager: manager@acme.dev / Manager2024!');
  console.log('Employee: employee@acme.dev / Employee2024!');
  console.log('Viewer: viewer@acme.dev / Viewer2024!');
  console.log('Tech Admin: admin@techinnovators.com / TechAdmin2024!');
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });