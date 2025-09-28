import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

const prisma = new PrismaClient();

export default async function globalSetup() {
  console.log('🔧 Setting up integration test environment...');

  try {
    // Create a separate test database
    const testDatabaseUrl = process.env.TEST_DATABASE_URL || 'file:./test.db';
    process.env.DATABASE_URL = testDatabaseUrl;

    // Remove existing test database if it exists
    const dbPath = testDatabaseUrl.replace('file:', '');
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
      console.log('📁 Removed existing test database');
    }

    // Run migrations on test database
    console.log('📊 Running database migrations...');
    execSync('npx prisma db push --force-reset --skip-generate', {
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: testDatabaseUrl }
    });

    // Seed reference data (countries, currencies, tax rates, etc.)
    console.log('🌱 Seeding reference data...');
    await seedReferenceData();

    console.log('✅ Integration test environment setup complete');
  } catch (error) {
    console.error('❌ Failed to setup integration test environment:', error);
    throw error;
  }
}

async function seedReferenceData() {
  // Seed countries
  await prisma.country.createMany({
    data: [
      { code: 'CA', code3: 'CAN', name: 'Canada', phoneCode: '+1', currency: 'CAD' },
      { code: 'US', code3: 'USA', name: 'United States', phoneCode: '+1', currency: 'USD' },
      { code: 'GB', code3: 'GBR', name: 'United Kingdom', phoneCode: '+44', currency: 'GBP' }
    ],
    skipDuplicates: true
  });

  // Seed currencies
  await prisma.currency.createMany({
    data: [
      { code: 'CAD', name: 'Canadian Dollar', symbol: '$', decimalPlaces: 2 },
      { code: 'USD', name: 'US Dollar', symbol: '$', decimalPlaces: 2 },
      { code: 'GBP', name: 'British Pound', symbol: '£', decimalPlaces: 2 }
    ],
    skipDuplicates: true
  });

  // Seed tax rates
  await prisma.taxRate.createMany({
    data: [
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
      }
    ],
    skipDuplicates: true
  });

  // Seed product categories
  await prisma.productCategory.createMany({
    data: [
      { code: 'HARDWARE', name: 'Hardware', description: 'Physical products and equipment' },
      { code: 'SOFTWARE', name: 'Software', description: 'Software licenses and subscriptions' },
      { code: 'CONSULTING', name: 'Consulting', description: 'Consulting services' }
    ],
    skipDuplicates: true
  });

  // Seed service categories
  await prisma.serviceCategory.createMany({
    data: [
      { code: 'DEVELOPMENT', name: 'Development', description: 'Software development services' },
      { code: 'CONSULTING', name: 'Consulting', description: 'Business consulting services' },
      { code: 'SUPPORT', name: 'Support', description: 'Technical support services' }
    ],
    skipDuplicates: true
  });
}