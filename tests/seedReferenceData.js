// Seed reference data for tests
// This file is plain JS so it can be used in jest.global-setup.js
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || 'file:./test.db'
    }
  }
});

async function seedReferenceData() {
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

    await prisma.$disconnect();
  } catch (error) {
    console.error('❌ Failed to seed reference data:', error);
    await prisma.$disconnect();
    throw error;
  }
}

module.exports = { seedReferenceData };