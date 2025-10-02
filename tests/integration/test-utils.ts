// @ts-nocheck
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { faker } from '@faker-js/faker';
import { UserRole, CustomerStatus, CustomerTier, QuoteStatus, InvoiceStatus, PaymentStatus, PaymentMethod, ProjectStatus } from '../../src/types/enums';

// Types for test data generation
export interface TestOrganization {
  id: string;
  name: string;
  email: string;
  phone: string;
  encryptionKey: string;
}

export interface TestUser {
  id: string;
  organizationId: string;
  email: string;
  passwordHash: string;
  role: string;
  firstName: string;
  lastName: string;
}

export interface TestCustomer {
  id: string;
  organizationId: string;
  customerNumber: string;
  personId?: string;
  businessId?: string;
  tier: string;
  status: string;
}

export interface TestContext {
  organization: TestOrganization;
  users: {
    admin: TestUser;
    manager: TestUser;
    accountant: TestUser;
    employee: TestUser;
    viewer: TestUser;
  };
  customers: TestCustomer[];
  authTokens: {
    admin: string;
    manager: string;
    accountant: string;
    employee: string;
    viewer: string;
  };
}

/**
 * Enhanced database cleanup function for integration tests
 */
export async function cleanupDatabase(prisma: PrismaClient): Promise<void> {
  try {
    // Disable foreign key constraints for cleanup
    await prisma.$executeRaw`PRAGMA foreign_keys = OFF`;

    // Delete all data in dependency order (child tables first)
    const tableNames = [
      'audit_logs',      // Must be first as it can reference any entity
      'journal_entries',
      'transactions',
      'appointments',
      'quote_items',
      'invoice_items',
      'payments',
      'quotes',
      'invoices',
      'expenses',
      'projects',
      'customer_addresses',
      'vendor_addresses',
      'customers',
      'vendors',
      'employees',
      'contractors',
      'persons',
      'businesses',
      'locations',
      'addresses',
      'products',
      'services',
      'accounts',
      'sessions',
      'api_keys',
      'users',
      'organizations'
    ];

    for (const tableName of tableNames) {
      await prisma.$executeRawUnsafe(`DELETE FROM ${tableName}`);
    }

    // Re-enable foreign key constraints
    await prisma.$executeRaw`PRAGMA foreign_keys = ON`;

  } catch (error) {
    console.error('Database cleanup failed:', error);
    // Re-enable foreign key constraints even if cleanup failed
    await prisma.$executeRaw`PRAGMA foreign_keys = ON`;
    throw error;
  }
}

/**
 * Create a complete test organization with users and basic data
 */
export async function createTestContext(prisma: PrismaClient, organizationName = 'Test Organization'): Promise<TestContext> {
  // Create organization
  const organization = await createTestOrganization(prisma, organizationName);

  // Create users with different roles
  const users = {
    admin: await createTestUser(prisma, organization.id, UserRole.ADMIN, 'admin@test.com'),
    manager: await createTestUser(prisma, organization.id, UserRole.MANAGER, 'manager@test.com'),
    accountant: await createTestUser(prisma, organization.id, UserRole.ACCOUNTANT, 'accountant@test.com'),
    employee: await createTestUser(prisma, organization.id, UserRole.EMPLOYEE, 'employee@test.com'),
    viewer: await createTestUser(prisma, organization.id, UserRole.VIEWER, 'viewer@test.com')
  };

  // Create auth tokens for each user
  const authTokens = {
    admin: generateAuthToken(users.admin),
    manager: generateAuthToken(users.manager),
    accountant: generateAuthToken(users.accountant),
    employee: generateAuthToken(users.employee),
    viewer: generateAuthToken(users.viewer)
  };

  // Create sample customers
  const customers = [
    await createTestCustomer(prisma, organization.id, 'PERSON'),
    await createTestCustomer(prisma, organization.id, 'BUSINESS')
  ];

  return {
    organization,
    users,
    customers,
    authTokens
  };
}

/**
 * Create a test organization with realistic data
 */
export async function createTestOrganization(
  prisma: PrismaClient,
  name = 'Test Organization'
): Promise<TestOrganization> {
  const orgData = {
    name,
    email: `${name.toLowerCase().replace(/\s+/g, '')}@test.com`,
    phone: `+1-${faker.string.numeric(3)}-${faker.string.numeric(3)}-${faker.string.numeric(4)}`,
    encryptionKey: generateEncryptionKey()
  };

  const organization = await prisma.organization.create({
    data: orgData
  });

  return organization as TestOrganization;
}

/**
 * Create a test user with hashed password
 */
export async function createTestUser(
  prisma: PrismaClient,
  organizationId: string,
  role: string = UserRole.EMPLOYEE,
  email?: string
): Promise<TestUser> {
  const userData = {
    organizationId,
    email: email || faker.internet.email(),
    passwordHash: await bcrypt.hash('password123', 10),
    role,
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    isActive: true,
    emailVerified: true
  };

  const user = await prisma.user.create({
    data: userData
  });

  return user as TestUser;
}

/**
 * Create a test customer (person or business)
 */
export async function createTestCustomer(
  prisma: PrismaClient,
  organizationId: string,
  type: 'PERSON' | 'BUSINESS' = 'PERSON'
): Promise<TestCustomer> {
  let personId: string | undefined;
  let businessId: string | undefined;

  if (type === 'PERSON') {
    const person = await prisma.person.create({
      data: {
        organizationId,
        firstName: faker.person.firstName(),
        lastName: faker.person.lastName(),
        email: faker.internet.email(),
        phone: faker.phone.number()
      }
    });
    personId = person.id;
  } else {
    const business = await prisma.business.create({
      data: {
        organizationId,
        legalName: faker.company.name(),
        businessNumber: faker.string.numeric(9),
        businessType: 'CORPORATION',
        email: faker.internet.email(),
        phone: faker.phone.number()
      }
    });
    businessId = business.id;
  }

  const customer = await prisma.customer.create({
    data: {
      organizationId,
      customerNumber: generateCustomerNumber(),
      personId,
      businessId,
      tier: CustomerTier.PERSONAL,
      status: CustomerStatus.ACTIVE,
      paymentTerms: 30
    }
  });

  return customer as TestCustomer;
}

/**
 * Create a test quote with items
 */
export async function createTestQuote(
  prisma: PrismaClient,
  organizationId: string,
  customerId: string,
  createdById: string
) {
  // First create required products/services
  const productCategory = await prisma.productCategory.findFirst({
    where: { code: 'HARDWARE' }
  });

  const serviceCategory = await prisma.serviceCategory.findFirst({
    where: { code: 'DEVELOPMENT' }
  });

  const product = await prisma.product.create({
    data: {
      organizationId,
      sku: `PROD-${faker.string.alphanumeric(6).toUpperCase()}`,
      name: faker.commerce.productName(),
      description: faker.commerce.productDescription(),
      categoryId: productCategory!.id,
      unitPrice: parseFloat(faker.commerce.price({ min: 100, max: 1000 })),
      cost: parseFloat(faker.commerce.price({ min: 50, max: 500 })),
      taxable: true,
      isActive: true
    }
  });

  const service = await prisma.service.create({
    data: {
      organizationId,
      code: `SVC-${faker.string.alphanumeric(6).toUpperCase()}`,
      name: faker.commerce.productName(),
      description: faker.commerce.productDescription(),
      categoryId: serviceCategory!.id,
      hourlyRate: parseFloat(faker.commerce.price({ min: 100, max: 200 })),
      minimumHours: 0.25,
      taxable: true,
      isActive: true
    }
  });

  const quote = await prisma.quote.create({
    data: {
      organizationId,
      quoteNumber: generateQuoteNumber(),
      customerId,
      createdById,
      status: QuoteStatus.DRAFT,
      validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      currency: 'CAD',
      exchangeRate: 1.0,
      subtotal: 1500.00,
      taxAmount: 195.00,
      total: 1695.00,
      description: 'Test quote for integration testing',
      terms: 'Net 30 days',
      notes: 'Generated by integration test suite'
    }
  });

  // Create quote items
  await prisma.quoteItem.createMany({
    data: [
      {
        quoteId: quote.id,
        productId: product.id,
        description: product.name,
        quantity: 2,
        unitPrice: product.unitPrice,
        discountPercent: 0,
        taxRate: 0.13,
        subtotal: product.unitPrice * 2,
        discountAmount: 0,
        taxAmount: product.unitPrice * 2 * 0.13,
        total: product.unitPrice * 2 * 1.13,
        sortOrder: 1
      },
      {
        quoteId: quote.id,
        serviceId: service.id,
        description: `${service.name} - 5 hours`,
        quantity: 5,
        unitPrice: service.hourlyRate,
        discountPercent: 0,
        taxRate: 0.13,
        subtotal: service.hourlyRate * 5,
        discountAmount: 0,
        taxAmount: service.hourlyRate * 5 * 0.13,
        total: service.hourlyRate * 5 * 1.13,
        sortOrder: 2
      }
    ]
  });

  return quote;
}

/**
 * Create a test invoice from a quote
 */
export async function createTestInvoice(
  prisma: PrismaClient,
  organizationId: string,
  customerId: string,
  quoteId?: string
) {
  const invoice = await prisma.invoice.create({
    data: {
      organizationId,
      invoiceNumber: generateInvoiceNumber(),
      customerId,
      quoteId,
      status: InvoiceStatus.DRAFT,
      issueDate: new Date(),
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      currency: 'CAD',
      exchangeRate: 1.0,
      subtotal: 1500.00,
      taxAmount: 195.00,
      total: 1695.00,
      depositRequired: 0,
      amountPaid: 0,
      balance: 1695.00,
      terms: 'Net 30 days',
      notes: 'Generated by integration test suite'
    }
  });

  return invoice;
}

/**
 * Create a test payment
 */
export async function createTestPayment(
  prisma: PrismaClient,
  organizationId: string,
  customerId: string,
  invoiceId?: string,
  amount: number = 1695.00
) {
  const payment = await prisma.payment.create({
    data: {
      organizationId,
      paymentNumber: generatePaymentNumber(),
      customerId,
      invoiceId,
      paymentMethod: PaymentMethod.STRIPE_CARD,
      amount,
      currency: 'CAD',
      paymentDate: new Date(),
      referenceNumber: faker.string.alphanumeric(10).toUpperCase(),
      status: PaymentStatus.COMPLETED,
      processorFee: amount * 0.029, // 2.9% typical Stripe fee
      netAmount: amount * 0.971,
      customerNotes: 'Test payment',
      adminNotes: 'Generated by integration test suite',
      processedAt: new Date()
    }
  });

  return payment;
}

/**
 * Create a test project
 */
export async function createTestProject(
  prisma: PrismaClient,
  organizationId: string,
  customerId: string,
  assignedToId?: string
) {
  const project = await prisma.project.create({
    data: {
      organizationId,
      projectNumber: generateProjectNumber(),
      customerId,
      assignedToId,
      name: faker.company.catchPhrase(),
      description: faker.lorem.paragraph(),
      status: ProjectStatus.QUOTED,
      priority: 3,
      startDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 1 week from now
      endDate: new Date(Date.now() + 37 * 24 * 60 * 60 * 1000), // 1 month from start
      estimatedHours: 40,
      hourlyRate: 150.00,
      fixedPrice: 6000.00
    }
  });

  return project;
}

/**
 * Create a test appointment
 */
export async function createTestAppointment(
  prisma: PrismaClient,
  organizationId: string,
  customerId: string,
  projectId?: string
) {
  const startTime = new Date(Date.now() + 24 * 60 * 60 * 1000); // Tomorrow
  const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000); // 2 hours later

  const appointment = await prisma.appointment.create({
    data: {
      organizationId,
      customerId,
      projectId,
      title: 'Project consultation',
      description: 'Initial project discussion and requirements gathering',
      startTime,
      endTime,
      duration: 120, // 2 hours in minutes
      confirmed: false,
      completed: false,
      cancelled: false
    }
  });

  return appointment;
}

/**
 * Generate JWT token for testing
 */
export function generateAuthToken(user: TestUser): string {
  const payload = {
    userId: user.id,
    organizationId: user.organizationId,
    role: user.role,
    email: user.email
  };

  return jwt.sign(payload, process.env.JWT_SECRET || 'test-secret', {
    expiresIn: '24h'
  });
}

/**
 * Generate unique test identifiers
 */
export function generateCustomerNumber(): string {
  return `CUST-${faker.string.numeric(6)}`;
}

export function generateQuoteNumber(): string {
  return `Q-${faker.string.numeric(6)}`;
}

export function generateInvoiceNumber(): string {
  return `INV-${faker.string.numeric(6)}`;
}

export function generatePaymentNumber(): string {
  return `PAY-${faker.string.numeric(6)}`;
}

export function generateProjectNumber(): string {
  return `PROJ-${faker.string.numeric(6)}`;
}

export function generateEncryptionKey(): string {
  return faker.string.alphanumeric(32);
}

/**
 * Wait for a specified amount of time (useful for timing-sensitive tests)
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Verify audit log entries
 */
export async function verifyAuditLog(
  prisma: PrismaClient,
  organizationId: string,
  action: string,
  entityType: string,
  entityId: string,
  userId?: string
) {
  const auditLog = await prisma.auditLog.findFirst({
    where: {
      organizationId,
      action,
      entityType,
      entityId,
      ...(userId && { userId })
    },
    orderBy: { timestamp: 'desc' }
  });

  expect(auditLog).toBeTruthy();
  return auditLog;
}

/**
 * Create isolated test environment for multi-tenant testing
 */
export async function createIsolatedTenants(prisma: PrismaClient): Promise<{
  tenant1: TestContext;
  tenant2: TestContext;
}> {
  const tenant1 = await createTestContext(prisma, 'Tenant One Corp');
  const tenant2 = await createTestContext(prisma, 'Tenant Two LLC');

  return { tenant1, tenant2 };
}

/**
 * Performance testing utilities
 */
export class PerformanceTimer {
  private startTime: number = 0;
  private measurements: number[] = [];

  start(): void {
    this.startTime = performance.now();
  }

  stop(): number {
    const duration = performance.now() - this.startTime;
    this.measurements.push(duration);
    return duration;
  }

  getAverage(): number {
    return this.measurements.reduce((a, b) => a + b, 0) / this.measurements.length;
  }

  getMax(): number {
    return Math.max(...this.measurements);
  }

  getMin(): number {
    return Math.min(...this.measurements);
  }

  reset(): void {
    this.measurements = [];
  }
}

/**
 * Mock Stripe webhook events for payment testing
 */
export function createStripeWebhookEvent(type: string, data: any) {
  return {
    id: `evt_${faker.string.alphanumeric(24)}`,
    object: 'event',
    api_version: '2020-08-27',
    created: Math.floor(Date.now() / 1000),
    data: {
      object: data
    },
    livemode: false,
    pending_webhooks: 1,
    request: {
      id: `req_${faker.string.alphanumeric(24)}`,
      idempotency_key: null
    },
    type
  };
}

/**
 * Database connection health check
 */
export async function checkDatabaseHealth(prisma: PrismaClient): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    console.error('Database health check failed:', error);
    return false;
  }
}