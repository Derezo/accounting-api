import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { seedInvoiceTemplates } from './seeds/master-organization.seed';

// Force test database
const DATABASE_URL = 'file:./test.db';
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: DATABASE_URL
    }
  }
});

const hashPassword = async (password: string): Promise<string> => {
  return await bcrypt.hash(password, 12);
};

const generateEncryptionKey = (): string => {
  return randomUUID().replace(/-/g, '');
};

async function main(): Promise<void> {
  console.log('🌱 Seeding test database at', DATABASE_URL);

  // Clear all data
  console.log('🧹 Clearing existing test data...');
  await prisma.auditLog.deleteMany().catch(() => {});
  await prisma.payment.deleteMany().catch(() => {});
  await prisma.invoiceLineItem.deleteMany().catch(() => {});
  await prisma.invoice.deleteMany().catch(() => {});
  await prisma.quoteLineItem.deleteMany().catch(() => {});
  await prisma.quote.deleteMany().catch(() => {});
  await prisma.appointment.deleteMany().catch(() => {});
  await prisma.project.deleteMany().catch(() => {});
  await prisma.customer.deleteMany().catch(() => {});
  await prisma.person.deleteMany().catch(() => {});
  await prisma.business.deleteMany().catch(() => {});
  await prisma.account.deleteMany().catch(() => {});
  await prisma.apiKey.deleteMany().catch(() => {});
  await prisma.user.deleteMany().catch(() => {});
  await prisma.organization.deleteMany().catch(() => {});

  // Create test organizations
  console.log('🏢 Creating organizations...');

  const org1 = await prisma.organization.create({
    data: {
      name: 'Test Accounting Co',
      email: 'test@accounting.com',
      phone: '555-0001',
      taxNumber: 'TAX001',
      website: 'https://test-accounting.com',
      encryptionKey: generateEncryptionKey(),
      isActive: true
    }
  });

  const org2 = await prisma.organization.create({
    data: {
      name: 'Second Test Org',
      email: 'test2@org.com',
      phone: '555-0002',
      taxNumber: 'TAX002',
      website: 'https://test-org2.com',
      encryptionKey: generateEncryptionKey(),
      isActive: true
    }
  });

  // Create users for org1
  console.log('👥 Creating users...');

  const _superAdmin = await prisma.user.create({
    data: {
      email: 'superadmin@test.com',
      firstName: 'Super',
      lastName: 'Admin',
      passwordHash: await hashPassword('SuperAdmin123!'),
      role: 'SUPER_ADMIN',
      organizationId: org1.id,
      isActive: true
    }
  });

  const admin = await prisma.user.create({
    data: {
      email: 'admin@test.com',
      firstName: 'Admin',
      lastName: 'User',
      passwordHash: await hashPassword('Admin123!'),
      role: 'ADMIN',
      organizationId: org1.id,
      isActive: true
    }
  });

  const manager = await prisma.user.create({
    data: {
      email: 'manager@test.com',
      firstName: 'Manager',
      lastName: 'User',
      passwordHash: await hashPassword('Manager123!'),
      role: 'MANAGER',
      organizationId: org1.id,
      isActive: true
    }
  });

  const _accountant = await prisma.user.create({
    data: {
      email: 'accountant@test.com',
      firstName: 'Accountant',
      lastName: 'User',
      passwordHash: await hashPassword('Accountant123!'),
      role: 'ACCOUNTANT',
      organizationId: org1.id,
      isActive: true
    }
  });

  const _employee = await prisma.user.create({
    data: {
      email: 'employee@test.com',
      firstName: 'Employee',
      lastName: 'User',
      passwordHash: await hashPassword('Employee123!'),
      role: 'EMPLOYEE',
      organizationId: org1.id,
      isActive: true
    }
  });

  const _viewer = await prisma.user.create({
    data: {
      email: 'viewer@test.com',
      firstName: 'Viewer',
      lastName: 'User',
      passwordHash: await hashPassword('Viewer123!'),
      role: 'VIEWER',
      organizationId: org1.id,
      isActive: true
    }
  });

  // Create user for org2
  const org2Admin = await prisma.user.create({
    data: {
      email: 'admin@org2.com',
      firstName: 'Org2',
      lastName: 'Admin',
      passwordHash: await hashPassword('Org2Admin123!'),
      role: 'ADMIN',
      organizationId: org2.id,
      isActive: true
    }
  });

  // Create accounts (chart of accounts)
  console.log('💰 Creating accounts...');

  const _cashAccount = await prisma.account.create({
    data: {
      accountCode: '1000',
      name: 'Cash',
      description: 'Cash on hand',
      type: 'ASSET',
      normalBalance: 'DEBIT',
      organizationId: org1.id,
      amountDue: 50000,
      isActive: true
    }
  });

  const _arAccount = await prisma.account.create({
    data: {
      accountCode: '1200',
      name: 'Accounts Receivable',
      description: 'Money owed by customers',
      type: 'ASSET',
      normalBalance: 'DEBIT',
      organizationId: org1.id,
      amountDue: 25000,
      isActive: true
    }
  });

  const _revenueAccount = await prisma.account.create({
    data: {
      accountCode: '4000',
      name: 'Service Revenue',
      description: 'Revenue from services',
      type: 'REVENUE',
      normalBalance: 'CREDIT',
      organizationId: org1.id,
      isActive: true
    }
  });

  const _expenseAccount = await prisma.account.create({
    data: {
      accountCode: '5000',
      name: 'Operating Expenses',
      description: 'General operating expenses',
      type: 'EXPENSE',
      normalBalance: 'DEBIT',
      organizationId: org1.id,
      isActive: true
    }
  });

  // Create persons and businesses
  console.log('👨‍💼 Creating persons and businesses...');

  const person1 = await prisma.person.create({
    data: {
      organizationId: org1.id,
      firstName: 'John',
      lastName: 'Customer',
      email: 'customer1@test.com',
      phone: '555-1001'
    }
  });

  const business1 = await prisma.business.create({
    data: {
      organizationId: org1.id,
      legalName: 'Customer Corp',
      tradingName: 'Customer Corp',
      type: 'CORPORATION',
      email: 'info@customercorp.com',
      phone: '555-1001'
    }
  });

  const person2 = await prisma.person.create({
    data: {
      organizationId: org1.id,
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'customer2@test.com',
      phone: '555-1002'
    }
  });

  const _person3 = await prisma.person.create({
    data: {
      organizationId: org1.id,
      firstName: 'Bob',
      lastName: 'Builder',
      email: 'customer3@test.com',
      phone: '555-1003'
    }
  });

  const business3 = await prisma.business.create({
    data: {
      organizationId: org1.id,
      legalName: 'Build It Inc',
      tradingName: 'Build It Inc',
      type: 'CORPORATION',
      email: 'info@buildit.com',
      phone: '555-1003'
    }
  });

  const person4 = await prisma.person.create({
    data: {
      organizationId: org2.id,
      firstName: 'Org2',
      lastName: 'Customer',
      email: 'customer@org2.com',
      phone: '555-2001'
    }
  });

  // Create customers
  console.log('👨‍💼 Creating customers...');

  const customer1 = await prisma.customer.create({
    data: {
      organizationId: org1.id,
      customerNumber: 'CUST-0001',
      type: 'BUSINESS',
      businessId: business1.id,
      name: 'Customer Corp',
      email: 'info@customercorp.com',
      phone: '555-1001',
      tier: 'BUSINESS',
      status: 'ACTIVE'
    }
  });

  const customer2 = await prisma.customer.create({
    data: {
      organizationId: org1.id,
      customerNumber: 'CUST-0002',
      type: 'PERSON',
      personId: person2.id,
      name: 'Jane Smith',
      email: 'customer2@test.com',
      phone: '555-1002',
      tier: 'PERSONAL',
      status: 'ACTIVE'
    }
  });

  const customer3 = await prisma.customer.create({
    data: {
      organizationId: org1.id,
      customerNumber: 'CUST-0003',
      type: 'BUSINESS',
      businessId: business3.id,
      name: 'Build It Inc',
      email: 'info@buildit.com',
      phone: '555-1003',
      tier: 'BUSINESS',
      status: 'PROSPECT'
    }
  });

  // Create customers for org2 (for multi-tenant testing)
  const _org2Customer = await prisma.customer.create({
    data: {
      organizationId: org2.id,
      customerNumber: 'CUST-0001',
      type: 'PERSON',
      personId: person4.id,
      name: 'Org2 Customer',
      email: 'customer@org2.com',
      phone: '555-2001',
      tier: 'PERSONAL',
      status: 'ACTIVE'
    }
  });

  // Create quotes
  console.log('📋 Creating quotes...');

  const _quote1 = await prisma.quote.create({
    data: {
      quoteNumber: 'Q-2025-0001',
      customerId: customer1.id,
      organizationId: org1.id,
      status: 'SENT',
      validUntil: new Date('2025-02-15'),
      subtotal: 10000,
      taxTotal: 1300,
      total: 11300,
      currency: 'CAD'
    }
  });

  const _quote2 = await prisma.quote.create({
    data: {
      quoteNumber: 'Q-2025-0002',
      customerId: customer2.id,
      organizationId: org1.id,
      status: 'ACCEPTED',
      validUntil: new Date('2025-02-20'),
      subtotal: 5000,
      taxTotal: 650,
      total: 5650,
      currency: 'CAD'
    }
  });

  const _quote3 = await prisma.quote.create({
    data: {
      quoteNumber: 'Q-2025-0003',
      customerId: customer3.id,
      organizationId: org1.id,
      status: 'DRAFT',
      validUntil: new Date('2025-02-25'),
      subtotal: 15000,
      taxTotal: 1950,
      total: 16950,
      currency: 'CAD'
    }
  });

  // Create projects
  console.log('🚀 Creating projects...');

  const project1 = await prisma.project.create({
    data: {
      projectNumber: 'PRJ-2025-0001',
      name: 'Website Development',
      description: 'Build corporate website',
      customerId: customer1.id,
      organizationId: org1.id,
      status: 'IN_PROGRESS',
      startDate: new Date('2025-02-01'),
      endDate: new Date('2025-04-30'),
      estimatedHours: 100,
      budget: 10000
    }
  });

  const project2 = await prisma.project.create({
    data: {
      projectNumber: 'PRJ-2025-0002',
      name: 'Consulting Services',
      description: 'Business consulting',
      customerId: customer2.id,
      organizationId: org1.id,
      status: 'PLANNING',
      startDate: new Date('2025-02-15'),
      endDate: new Date('2025-03-15'),
      estimatedHours: 50,
      budget: 5000
    }
  });

  // Create invoices
  console.log('🧾 Creating invoices...');

  const invoice1 = await prisma.invoice.create({
    data: {
      invoiceNumber: 'INV-2025-0001',
      customerId: customer1.id,
      organizationId: org1.id,
      status: 'PARTIALLY_PAID',
      issueDate: new Date('2025-01-20'),
      dueDate: new Date('2025-02-20'),
      subtotal: 10000,
      taxTotal: 1300,
      total: 11300,
      amountPaid: 3000,
      amountDue: 8300,
      currency: 'CAD',
      depositAmount: 3000,
      depositPaid: true,
      depositPaidAt: new Date('2025-01-20'),
      notes: 'Website development - Deposit invoice'
    }
  });

  const invoice2 = await prisma.invoice.create({
    data: {
      invoiceNumber: 'INV-2025-0002',
      customerId: customer2.id,
      organizationId: org1.id,
      status: 'SENT',
      issueDate: new Date('2025-02-01'),
      dueDate: new Date('2025-03-01'),
      subtotal: 5000,
      taxTotal: 650,
      total: 5650,
      depositAmount: 1500,
      amountPaid: 0,
      amountDue: 5650,
      currency: 'CAD',
      notes: 'Consulting services'
    }
  });

  const invoice3 = await prisma.invoice.create({
    data: {
      invoiceNumber: 'INV-2025-0003',
      customerId: customer1.id,
      organizationId: org1.id,
      status: 'PAID',
      issueDate: new Date('2025-01-10'),
      dueDate: new Date('2025-02-10'),
      subtotal: 2000,
      taxTotal: 260,
      total: 2260,
      depositAmount: 500,
      depositPaid: true,
      amountPaid: 2260,
      amountDue: 0,
      currency: 'CAD',
      notes: 'Previous project - PAID'
    }
  });

  // Create payments
  console.log('💳 Creating payments...');

  const payment1 = await prisma.payment.create({
    data: {
      paymentNumber: 'PAY-2025-0001',
      invoiceId: invoice1.id,
      customerId: customer1.id,
      organizationId: org1.id,
      amount: 3000,
      currency: 'CAD',
      method: 'CREDIT_CARD',
      status: 'COMPLETED',
      processedAt: new Date('2025-01-20'),
      reference: 'Stripe-ch_123abc',
      // notes: 'Deposit payment',
      // createdBy: admin.id
    }
  });

  const payment2 = await prisma.payment.create({
    data: {
      paymentNumber: 'PAY-2025-0002',
      invoiceId: invoice3.id,
      customerId: customer1.id,
      organizationId: org1.id,
      amount: 2260,
      currency: 'CAD',
      method: 'BANK_TRANSFER',
      status: 'COMPLETED',
      processedAt: new Date('2025-01-15'),
      reference: 'TRF-98765',
      // notes: 'Full payment',
      // createdBy: admin.id
    }
  });

  const payment3 = await prisma.payment.create({
    data: {
      paymentNumber: 'PAY-2025-0003',
      invoiceId: invoice2.id,
      customerId: customer2.id,
      organizationId: org1.id,
      amount: 1000,
      currency: 'CAD',
      method: 'CASH',
      status: 'PENDING',
      processedAt: new Date('2025-02-01'),
      // notes: 'Partial payment - pending confirmation',
      // createdBy: manager.id
    }
  });

  // Create appointments
  console.log('📅 Creating appointments...');

  const _appointment1 = await prisma.appointment.create({
    data: {
      appointmentNumber: 'APT-2025-0001',
      title: 'Project Kickoff Meeting',
      description: 'Initial project planning session',
      customerId: customer1.id,
      organizationId: org1.id,
      scheduledStart: new Date('2025-02-01T10:00:00Z'),
      scheduledEnd: new Date('2025-02-01T11:00:00Z'),
      status: 'CONFIRMED'
    }
  });

  const _appointment2 = await prisma.appointment.create({
    data: {
      appointmentNumber: 'APT-2025-0002',
      title: 'Requirements Review',
      description: 'Review business requirements',
      customerId: customer2.id,
      organizationId: org1.id,
      scheduledStart: new Date('2025-02-15T14:00:00Z'),
      scheduledEnd: new Date('2025-02-15T15:30:00Z'),
      status: 'SCHEDULED'
    }
  });

  // Seed invoice templates for both organizations
  console.log('📄 Seeding invoice templates...');
  await seedInvoiceTemplates(org1.id);
  await seedInvoiceTemplates(org2.id);

  console.log('✅ Test database seeding complete!');
  console.log('📊 Summary:');
  console.log(`  - Organizations: 2`);
  console.log(`  - Users: 7`);
  console.log(`  - Persons: 4`);
  console.log(`  - Businesses: 2`);
  console.log(`  - Customers: 4`);
  console.log(`  - Accounts: 4`);
  console.log(`  - Quotes: 3`);
  console.log(`  - Projects: 2`);
  console.log(`  - Invoices: 3`);
  console.log(`  - Payments: 3`);
  console.log(`  - Appointments: 2`);
  console.log(`  - Invoice Templates: 6 (3 per org)`);
  console.log(`  - Invoice Styles: 6 (3 per org)`);
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
