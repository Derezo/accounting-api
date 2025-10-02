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
  await prisma.session.deleteMany().catch(() => {});
  await prisma.payment.deleteMany().catch(() => {});
  await prisma.invoiceItem.deleteMany().catch(() => {});
  await prisma.invoice.deleteMany().catch(() => {});
  await prisma.quoteItem.deleteMany().catch(() => {});
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

  const superAdmin = await prisma.user.create({
    data: {
      email: 'superadmin@test.com',
      firstName: 'Super',
      lastName: 'Admin',
      passwordHash: await hashPassword('SuperAdmin123!'),
      role: 'SUPER_ADMIN',
      organizationId: org1.id,
      emailVerified: true,
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
      emailVerified: true,
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
      emailVerified: true,
      isActive: true
    }
  });

  const accountant = await prisma.user.create({
    data: {
      email: 'accountant@test.com',
      firstName: 'Accountant',
      lastName: 'User',
      passwordHash: await hashPassword('Accountant123!'),
      role: 'ACCOUNTANT',
      organizationId: org1.id,
      emailVerified: true,
      isActive: true
    }
  });

  const employee = await prisma.user.create({
    data: {
      email: 'employee@test.com',
      firstName: 'Employee',
      lastName: 'User',
      passwordHash: await hashPassword('Employee123!'),
      role: 'EMPLOYEE',
      organizationId: org1.id,
      emailVerified: true,
      isActive: true
    }
  });

  const viewer = await prisma.user.create({
    data: {
      email: 'viewer@test.com',
      firstName: 'Viewer',
      lastName: 'User',
      passwordHash: await hashPassword('Viewer123!'),
      role: 'VIEWER',
      organizationId: org1.id,
      emailVerified: true,
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
      emailVerified: true,
      isActive: true
    }
  });

  // Create accounts (chart of accounts)
  console.log('💰 Creating accounts...');

  const cashAccount = await prisma.account.create({
    data: {
      accountNumber: '1000',
      name: 'Cash',
      description: 'Cash on hand',
      type: 'ASSET',
      organizationId: org1.id,
      balance: 50000,
      isActive: true
    }
  });

  const arAccount = await prisma.account.create({
    data: {
      accountNumber: '1200',
      name: 'Accounts Receivable',
      description: 'Money owed by customers',
      type: 'ASSET',
      organizationId: org1.id,
      balance: 25000,
      isActive: true
    }
  });

  const revenueAccount = await prisma.account.create({
    data: {
      accountNumber: '4000',
      name: 'Service Revenue',
      description: 'Revenue from services',
      type: 'REVENUE',
      organizationId: org1.id,
      balance: 0,
      isActive: true
    }
  });

  const expenseAccount = await prisma.account.create({
    data: {
      accountNumber: '5000',
      name: 'Operating Expenses',
      description: 'General operating expenses',
      type: 'EXPENSE',
      organizationId: org1.id,
      balance: 0,
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
      tradeName: 'Customer Corp',
      businessType: 'CORPORATION',
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

  const person3 = await prisma.person.create({
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
      tradeName: 'Build It Inc',
      businessType: 'CORPORATION',
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
      businessId: business1.id,
      tier: 'BUSINESS',
      status: 'ACTIVE',
      creditLimit: 50000,
      createdBy: admin.id
    }
  });

  const customer2 = await prisma.customer.create({
    data: {
      organizationId: org1.id,
      customerNumber: 'CUST-0002',
      personId: person2.id,
      tier: 'PERSONAL',
      status: 'ACTIVE',
      creditLimit: 10000,
      createdBy: admin.id
    }
  });

  const customer3 = await prisma.customer.create({
    data: {
      organizationId: org1.id,
      customerNumber: 'CUST-0003',
      businessId: business3.id,
      tier: 'BUSINESS',
      status: 'PROSPECT',
      creditLimit: 25000,
      createdBy: manager.id
    }
  });

  // Create customers for org2 (for multi-tenant testing)
  const org2Customer = await prisma.customer.create({
    data: {
      organizationId: org2.id,
      customerNumber: 'CUST-0001',
      personId: person4.id,
      tier: 'PERSONAL',
      status: 'ACTIVE',
      creditLimit: 5000,
      createdBy: org2Admin.id
    }
  });

  // Create quotes
  console.log('📋 Creating quotes...');

  const quote1 = await prisma.quote.create({
    data: {
      quoteNumber: 'Q-2025-0001',
      customerId: customer1.id,
      organizationId: org1.id,
      createdById: admin.id,
      status: 'SENT',
      validUntil: new Date('2025-02-15'),
      subtotal: 10000,
      taxAmount: 1300,
      total: 11300,
      currency: 'CAD',
      notes: 'Website development project'
    }
  });

  const quote2 = await prisma.quote.create({
    data: {
      quoteNumber: 'Q-2025-0002',
      customerId: customer2.id,
      organizationId: org1.id,
      createdById: manager.id,
      status: 'ACCEPTED',
      validUntil: new Date('2025-02-20'),
      subtotal: 5000,
      taxAmount: 650,
      total: 5650,
      currency: 'CAD',
      notes: 'Consulting services'
    }
  });

  const quote3 = await prisma.quote.create({
    data: {
      quoteNumber: 'Q-2025-0003',
      customerId: customer3.id,
      organizationId: org1.id,
      createdById: manager.id,
      status: 'DRAFT',
      validUntil: new Date('2025-02-25'),
      subtotal: 15000,
      taxAmount: 1950,
      total: 16950,
      currency: 'CAD',
      notes: 'Construction management software'
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
      hourlyRate: 100,
      depositPaid: true,
      depositPaidAt: new Date('2025-01-20'),
      createdBy: admin.id
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
      hourlyRate: 100,
      depositPaid: false,
      createdBy: manager.id
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
      taxAmount: 1300,
      total: 11300,
      depositRequired: 3000,
      amountPaid: 3000,
      balance: 8300,
      currency: 'CAD',
      notes: 'Website development - Deposit invoice',
      createdBy: admin.id
    }
  });

  // Link project1 to invoice1
  await prisma.project.update({
    where: { id: project1.id },
    data: { invoiceId: invoice1.id }
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
      taxAmount: 650,
      total: 5650,
      depositRequired: 1500,
      amountPaid: 0,
      balance: 5650,
      currency: 'CAD',
      notes: 'Consulting services',
      createdBy: manager.id
    }
  });

  // Link project2 to invoice2
  await prisma.project.update({
    where: { id: project2.id },
    data: { invoiceId: invoice2.id }
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
      taxAmount: 260,
      total: 2260,
      depositRequired: 500,
      amountPaid: 2260,
      balance: 0,
      currency: 'CAD',
      notes: 'Previous project - PAID',
      createdBy: admin.id
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
      paymentMethod: 'CREDIT_CARD',
      status: 'COMPLETED',
      paymentDate: new Date('2025-01-20'),
      referenceNumber: 'Stripe-ch_123abc',
      adminNotes: 'Deposit payment',
      createdBy: admin.id
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
      paymentMethod: 'BANK_TRANSFER',
      status: 'COMPLETED',
      paymentDate: new Date('2025-01-15'),
      referenceNumber: 'TRF-98765',
      adminNotes: 'Full payment',
      createdBy: admin.id
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
      paymentMethod: 'CASH',
      status: 'PENDING',
      paymentDate: new Date('2025-02-01'),
      adminNotes: 'Partial payment - pending confirmation',
      createdBy: manager.id
    }
  });

  // Create appointments
  console.log('📅 Creating appointments...');

  const appointment1 = await prisma.appointment.create({
    data: {
      title: 'Project Kickoff Meeting',
      description: 'Initial project planning session',
      customerId: customer1.id,
      organizationId: org1.id,
      projectId: project1.id,
      startTime: new Date('2025-02-01T10:00:00Z'),
      endTime: new Date('2025-02-01T11:00:00Z'),
      duration: 60,
      confirmed: true,
      createdBy: admin.id
    }
  });

  const appointment2 = await prisma.appointment.create({
    data: {
      title: 'Requirements Review',
      description: 'Review business requirements',
      customerId: customer2.id,
      organizationId: org1.id,
      projectId: project2.id,
      startTime: new Date('2025-02-15T14:00:00Z'),
      endTime: new Date('2025-02-15T15:30:00Z'),
      duration: 90,
      confirmed: true,
      createdBy: manager.id
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
