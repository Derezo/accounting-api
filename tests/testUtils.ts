import { prisma } from '../src/config/database';

/**
 * Seed reference data that should persist across all tests
 * This should be called once in global setup
 */
export async function seedReferenceData(): Promise<void> {
  try {
    // Seed countries
    const countries = [
      { code: 'CA', code3: 'CAN', name: 'Canada', phoneCode: '+1', currency: 'CAD' },
      { code: 'US', code3: 'USA', name: 'United States', phoneCode: '+1', currency: 'USD' },
      { code: 'GB', code3: 'GBR', name: 'United Kingdom', phoneCode: '+44', currency: 'GBP' }
    ];

    for (const country of countries) {
      await prisma.country.upsert({
        where: { code: country.code },
        update: {},
        create: country
      });
    }

    // Seed currencies
    const currencies = [
      { code: 'CAD', name: 'Canadian Dollar', symbol: '$', decimalPlaces: 2 },
      { code: 'USD', name: 'US Dollar', symbol: '$', decimalPlaces: 2 },
      { code: 'GBP', name: 'British Pound', symbol: '£', decimalPlaces: 2 }
    ];

    for (const currency of currencies) {
      await prisma.currency.upsert({
        where: { code: currency.code },
        update: {},
        create: currency
      });
    }

    // Seed tax rates
    const taxRates = [
      {
        code: 'HST_ON',
        name: 'HST Ontario',
        rate: 0.13,
        countryCode: 'CA',
        stateProvince: 'ON',
        isDefault: true,
        effectiveDate: new Date('2010-07-01')
      },
      {
        code: 'GST_PST_BC',
        name: 'GST + PST BC',
        rate: 0.12,
        countryCode: 'CA',
        stateProvince: 'BC',
        isDefault: false,
        effectiveDate: new Date('2010-07-01')
      },
      {
        code: 'GST',
        name: 'GST',
        rate: 0.05,
        countryCode: 'CA',
        stateProvince: 'AB',
        isDefault: false,
        effectiveDate: new Date('1991-01-01')
      }
    ];

    for (const taxRate of taxRates) {
      await prisma.taxRate.upsert({
        where: { code: taxRate.code },
        update: {},
        create: taxRate
      });
    }

    // Seed product categories
    const productCategories = [
      { code: 'HARDWARE', name: 'Hardware', description: 'Physical products and equipment' },
      { code: 'SOFTWARE', name: 'Software', description: 'Software licenses and subscriptions' },
      { code: 'CONSULTING', name: 'Consulting', description: 'Consulting services' }
    ];

    for (const category of productCategories) {
      await prisma.productCategory.upsert({
        where: { code: category.code },
        update: {},
        create: category
      });
    }

    // Seed service categories
    const serviceCategories = [
      { code: 'DEVELOPMENT', name: 'Development', description: 'Software development services' },
      { code: 'CONSULTING', name: 'Consulting', description: 'Business consulting services' },
      { code: 'SUPPORT', name: 'Support', description: 'Technical support services' }
    ];

    for (const category of serviceCategories) {
      await prisma.serviceCategory.upsert({
        where: { code: category.code },
        update: {},
        create: category
      });
    }

    console.log('✅ Reference data seeded successfully');
  } catch (error) {
    console.error('❌ Failed to seed reference data:', error);
    throw error;
  }
}

/**
 * Comprehensive database cleanup function that handles foreign key constraints properly
 * This function uses raw SQL to bypass Prisma's referential integrity checks during cleanup
 * NOTE: This does NOT delete reference data (countries, currencies, tax rates, etc.)
 */
export async function cleanupDatabase(): Promise<void> {
  try {
    // Disable foreign key constraints for cleanup
    await prisma.$executeRaw`PRAGMA foreign_keys = OFF`;

    // Use truncate-like approach for better performance and avoiding locks
    // NOTE: We do NOT clean reference tables (countries, currencies, tax_rates, etc.)
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
      'organizations'
      // Reference tables are NOT cleaned (countries, currencies, tax_rates, product_categories, service_categories, state_provinces)
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

