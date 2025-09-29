import { prisma } from '../src/config/database';

/**
 * Comprehensive database cleanup function that handles foreign key constraints properly
 * This function uses raw SQL to bypass Prisma's referential integrity checks during cleanup
 */
export async function cleanupDatabase(): Promise<void> {
  try {
    // Disable foreign key constraints for cleanup
    await prisma.$executeRaw`PRAGMA foreign_keys = OFF`;

    // Use truncate-like approach for better performance and avoiding locks
    const tableNames = [
      // Child tables first (tables with foreign keys to other tables)
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
      'audit_logs',
      'users',
      'organizations',
      // Reference tables last
      'state_provinces',
      'product_categories',
      'service_categories',
      'tax_rates',
      'currencies',
      'countries'
    ];

    // Use a single transaction for all deletes to prevent locks
    await prisma.$transaction(async (tx) => {
      for (const tableName of tableNames) {
        try {
          await tx.$executeRawUnsafe(`DELETE FROM ${tableName}`);
        } catch (error) {
          // Continue with other tables if one fails
          console.warn(`Failed to clean table ${tableName}:`, error);
        }
      }
    });

    // Re-enable foreign key constraints
    await prisma.$executeRaw`PRAGMA foreign_keys = ON`;

  } catch (error) {
    console.error('Database cleanup failed:', error);
    // Re-enable foreign key constraints even if cleanup failed
    try {
      await prisma.$executeRaw`PRAGMA foreign_keys = ON`;
    } catch (fkError) {
      console.error('Failed to re-enable foreign keys:', fkError);
    }
    // Don't throw error to avoid breaking tests
  }
}

/**
 * Setup test database with a clean state
 */
export async function setupTestDatabase(): Promise<void> {
  await cleanupDatabase();
}

/**
 * Create test organization for tests that need it
 * Automatically cleans database first to ensure isolation
 */
export async function createTestOrganization(name = 'Test Organization'): Promise<any> {
  // Ensure clean state before creating test data
  await cleanupDatabase();

  return await prisma.organization.create({
    data: {
      name,
      email: `${name.toLowerCase().replace(/\s+/g, '')}@test.com`,
      phone: '+1-555-0000',
      encryptionKey: 'test-key-32-chars-12345678901234'
    }
  });
}

/**
 * Create test user for tests that need it
 */
export async function createTestUser(organizationId: string, email = 'test@user.com'): Promise<any> {
  // First verify the organization exists
  const org = await prisma.organization.findUnique({
    where: { id: organizationId }
  });

  if (!org) {
    throw new Error(`Organization with id ${organizationId} does not exist`);
  }

  return await prisma.user.create({
    data: {
      organizationId,
      email,
      passwordHash: 'hashed-password',
      firstName: 'Test',
      lastName: 'User',
      role: 'ADMIN'
    }
  });
}

export { prisma };

