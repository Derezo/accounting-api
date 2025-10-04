// @ts-nocheck
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { faker } from '@faker-js/faker';
import { UserRole, CustomerStatus, CustomerTier, QuoteStatus, InvoiceStatus, PaymentStatus, PaymentMethod, ProjectStatus } from '../../src/types/enums';

// API versioning constant - matches config.API_VERSION
export const API_VERSION = 'v1';

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
  // Add unique suffix to organization name to ensure uniqueness
  const uniqueSuffix = Date.now() + '-' + Math.random().toString(36).substring(7);
  const uniqueOrgName = `${organizationName}-${uniqueSuffix}`;

  // Create organization
  const organization = await createTestOrganization(prisma, uniqueOrgName);

  // Create users with different roles using unique emails
  const users = {
    admin: await createTestUser(prisma, organization.id, UserRole.ADMIN, `admin-${uniqueSuffix}@test.com`),
    manager: await createTestUser(prisma, organization.id, UserRole.MANAGER, `manager-${uniqueSuffix}@test.com`),
    accountant: await createTestUser(prisma, organization.id, UserRole.ACCOUNTANT, `accountant-${uniqueSuffix}@test.com`),
    employee: await createTestUser(prisma, organization.id, UserRole.EMPLOYEE, `employee-${uniqueSuffix}@test.com`),
    viewer: await createTestUser(prisma, organization.id, UserRole.VIEWER, `viewer-${uniqueSuffix}@test.com`)
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
  const uniqueSuffix = Date.now() + '-' + Math.random().toString(36).substring(7);
  const orgData = {
    name,
    email: `${name.toLowerCase().replace(/\s+/g, '')}-${uniqueSuffix}@test.com`,
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
  // Generate unique email if not provided
  const uniqueSuffix = Date.now() + '-' + Math.random().toString(36).substring(7);
  const userEmail = email || `user-${uniqueSuffix}@test.com`;

  const userData = {
    organizationId,
    email: userEmail,
    passwordHash: await bcrypt.hash('password123', 10),
    role,
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    isActive: true,
  };

  const user = await prisma.user.create({
    data: userData
  });

  return user as TestUser;
}

/**
 * Create a test customer
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
        businessName: faker.company.name(),
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
      tier: CustomerTier.REGULAR,
      status: CustomerStatus.ACTIVE,
      lifecycleStage: 'LEAD',
      source: 'WEBSITE',
      preferredContactMethod: 'EMAIL'
    }
  });

  return customer as TestCustomer;
}

/**
 * Create a test quote
 */
export async function createTestQuote(
  prisma: PrismaClient,
  organizationId: string,
  customerId: string,
  createdById: string
) {
  const quote = await prisma.quote.create({
    data: {
      organizationId,
      quoteNumber: generateQuoteNumber(),
      customerId,
      createdById,
      status: QuoteStatus.DRAFT,
      subtotal: 1500.00,
      taxAmount: 195.00,
      total: 1695.00,
      validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      internalNotes: 'Test quote generated by integration tests',
      customerNotes: 'Thank you for your interest',
      paymentTerms: 'Net 30',
      estimatedDuration: 5
    }
  });

  return quote;
}

/**
 * Create a test invoice
 */
export async function createTestInvoice(
  prisma: PrismaClient,
  organizationId: string,
  customerId: string,
  createdById: string,
  quoteId?: string
) {
  const invoice = await prisma.invoice.create({
    data: {
      organizationId,
      invoiceNumber: generateInvoiceNumber(),
      customerId,
      createdById,
      quoteId,
      status: InvoiceStatus.DRAFT,
      subtotal: 1500.00,
      taxAmount: 195.00,
      total: 1695.00,
      amountPaid: 0.00,
      amountDue: 1695.00,
      issueDate: new Date(),
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      paymentTerms: 'Net 30',
      customerNotes: 'Thank you for your business',
      adminNotes: 'Generated by integration test suite'
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
    email: user.email,
    isTestToken: true,  // Enable test mode bypass in auth middleware
    sessionId: 'test-session-' + Date.now()
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

/**
 * Route helper functions to generate correct API paths
 * Updated to match actual audit API endpoint structure
 */
export const routes = {
  // Auth routes (no org ID required)
  auth: {
    login: () => `/api/${API_VERSION}/auth/login`,
    register: () => `/api/${API_VERSION}/auth/register`,
    refresh: () => `/api/${API_VERSION}/auth/refresh`,
    logout: () => `/api/${API_VERSION}/auth/logout`,
    forgotPassword: () => `/api/${API_VERSION}/auth/forgot-password`,
    resetPassword: () => `/api/${API_VERSION}/auth/reset-password`,
    profile: () => `/api/${API_VERSION}/auth/profile`,
  },

  // Org-scoped routes (require organizationId)
  org: (orgId: string) => ({
    customers: () => `/api/${API_VERSION}/organizations/${orgId}/customers`,
    customer: (id: string) => `/api/${API_VERSION}/organizations/${orgId}/customers/${id}`,
    quotes: () => `/api/${API_VERSION}/organizations/${orgId}/quotes`,
    quote: (id: string) => `/api/${API_VERSION}/organizations/${orgId}/quotes/${id}`,
    invoices: () => `/api/${API_VERSION}/organizations/${orgId}/invoices`,
    invoice: (id: string) => `/api/${API_VERSION}/organizations/${orgId}/invoices/${id}`,
    payments: () => `/api/${API_VERSION}/organizations/${orgId}/payments`,
    payment: (id: string) => `/api/${API_VERSION}/organizations/${orgId}/payments/${id}`,
    appointments: () => `/api/${API_VERSION}/organizations/${orgId}/appointments`,
    appointment: (id: string) => `/api/${API_VERSION}/organizations/${orgId}/appointments/${id}`,
    projects: () => `/api/${API_VERSION}/organizations/${orgId}/projects`,
    project: (id: string) => `/api/${API_VERSION}/organizations/${orgId}/projects/${id}`,
    audit: {
      logs: () => `/api/${API_VERSION}/organizations/${orgId}/audit/logs`,
      // Updated to match actual endpoint: /audit/users/:userId/activity/summary
      activities: () => `/api/${API_VERSION}/organizations/${orgId}/audit/users/current/activity/summary`,
      sessions: () => `/api/${API_VERSION}/organizations/${orgId}/audit/sessions`,
      // Updated to match actual endpoint: /audit/suspicious-activity
      suspicious: () => `/api/${API_VERSION}/organizations/${orgId}/audit/suspicious-activity`,
      metrics: {
        // Updated to match actual endpoint: /audit/security-metrics
        overview: () => `/api/${API_VERSION}/organizations/${orgId}/audit/security-metrics`,
        // Updated to match actual endpoint: /audit/security-metrics/logins
        login: () => `/api/${API_VERSION}/organizations/${orgId}/audit/security-metrics/logins`,
        // Updated to match actual endpoint: /audit/security-metrics/access-control
        access: () => `/api/${API_VERSION}/organizations/${orgId}/audit/security-metrics/access-control`,
        // Updated to match actual endpoint: /audit/security-metrics/compliance
        compliance: () => `/api/${API_VERSION}/organizations/${orgId}/audit/security-metrics/compliance`,
      },
      // Updated to match actual export endpoints
      export: (format: string) => {
        if (format === 'csv') {
          return `/api/${API_VERSION}/organizations/${orgId}/audit/export/csv`;
        } else if (format === 'json') {
          return `/api/${API_VERSION}/organizations/${orgId}/audit/export/json`;
        }
        return `/api/${API_VERSION}/organizations/${orgId}/audit/export?format=${format}`;
      },
      // Updated to match actual endpoint: /audit/stream/config
      stream: () => `/api/${API_VERSION}/organizations/${orgId}/audit/stream/config`,
    },
  }),

  // Public routes (no auth required)
  public: {
    intake: {
      initialize: () => `/api/${API_VERSION}/public/intake/initialize`,
      templates: () => `/api/${API_VERSION}/public/intake/templates`,
      template: (category: string) => `/api/${API_VERSION}/public/intake/templates/${category}`,
      validate: (category: string) => `/api/${API_VERSION}/public/intake/templates/${category}/validate`,
      step: () => `/api/${API_VERSION}/public/intake/step`,
      status: () => `/api/${API_VERSION}/public/intake/status`,
      submit: () => `/api/${API_VERSION}/public/intake/submit`,
    },
  },

  // Organizations management (no org context needed)
  organizations: () => `/api/${API_VERSION}/organizations`,
  organization: (id: string) => `/api/${API_VERSION}/organizations/${id}`,

  // Users management
  users: () => `/api/${API_VERSION}/users`,
  user: (id: string) => `/api/${API_VERSION}/users/${id}`,
};
