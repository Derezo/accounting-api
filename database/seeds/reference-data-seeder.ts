/**
 * Reference Data Seeder - Seeds reference tables with master data
 */

import { BaseSeeder, SeedOptions, SeedResult } from './base-seeder';

export class ReferenceDataSeeder extends BaseSeeder {
  get name(): string {
    return 'ReferenceDataSeeder';
  }

  async seed(options: SeedOptions): Promise<SeedResult> {
    let recordsCreated = 0;

    // Seed Countries
    const countries = await this.seedCountries();
    recordsCreated += countries;

    // Seed Currencies
    const currencies = await this.seedCurrencies();
    recordsCreated += currencies;

    // Seed Tax Rates
    const taxRates = await this.seedTaxRates();
    recordsCreated += taxRates;

    // Seed Product Categories
    const productCategories = await this.seedProductCategories();
    recordsCreated += productCategories;

    // Seed Service Categories
    const serviceCategories = await this.seedServiceCategories();
    recordsCreated += serviceCategories;

    return {
      seederName: this.name,
      environment: options.environment,
      recordsCreated,
      timeTaken: 0,
      success: true,
      errors: [],
    };
  }

  async clean(options: SeedOptions): Promise<void> {
    this.logger.info('Cleaning reference data...');

    await this.prisma.serviceCategory.deleteMany();
    await this.prisma.productCategory.deleteMany();
    await this.prisma.taxRate.deleteMany();
    await this.prisma.currency.deleteMany();
    await this.prisma.country.deleteMany();

    this.logger.info('Reference data cleaned');
  }

  private async seedCountries(): Promise<number> {
    this.logger.info('Seeding countries...');

    const countries = [
      {
        code: 'CA',
        code3: 'CAN',
        name: 'Canada',
        phoneCode: '+1',
        currency: 'CAD',
      },
      {
        code: 'US',
        code3: 'USA',
        name: 'United States',
        phoneCode: '+1',
        currency: 'USD',
      },
      {
        code: 'GB',
        code3: 'GBR',
        name: 'United Kingdom',
        phoneCode: '+44',
        currency: 'GBP',
      },
      {
        code: 'AU',
        code3: 'AUS',
        name: 'Australia',
        phoneCode: '+61',
        currency: 'AUD',
      },
      {
        code: 'DE',
        code3: 'DEU',
        name: 'Germany',
        phoneCode: '+49',
        currency: 'EUR',
      },
      {
        code: 'FR',
        code3: 'FRA',
        name: 'France',
        phoneCode: '+33',
        currency: 'EUR',
      },
      {
        code: 'JP',
        code3: 'JPN',
        name: 'Japan',
        phoneCode: '+81',
        currency: 'JPY',
      },
      {
        code: 'CN',
        code3: 'CHN',
        name: 'China',
        phoneCode: '+86',
        currency: 'CNY',
      },
      {
        code: 'IN',
        code3: 'IND',
        name: 'India',
        phoneCode: '+91',
        currency: 'INR',
      },
      {
        code: 'BR',
        code3: 'BRA',
        name: 'Brazil',
        phoneCode: '+55',
        currency: 'BRL',
      },
    ];

    await this.prisma.country.createMany({
      data: countries,
      skipDuplicates: true,
    });

    this.logger.info(`Created ${countries.length} countries`);
    return countries.length;
  }

  private async seedCurrencies(): Promise<number> {
    this.logger.info('Seeding currencies...');

    const currencies = [
      {
        code: 'CAD',
        name: 'Canadian Dollar',
        symbol: '$',
        decimalPlaces: 2,
      },
      {
        code: 'USD',
        name: 'US Dollar',
        symbol: '$',
        decimalPlaces: 2,
      },
      {
        code: 'EUR',
        name: 'Euro',
        symbol: '€',
        decimalPlaces: 2,
      },
      {
        code: 'GBP',
        name: 'British Pound',
        symbol: '£',
        decimalPlaces: 2,
      },
      {
        code: 'JPY',
        name: 'Japanese Yen',
        symbol: '¥',
        decimalPlaces: 0,
      },
      {
        code: 'AUD',
        name: 'Australian Dollar',
        symbol: 'A$',
        decimalPlaces: 2,
      },
      {
        code: 'CNY',
        name: 'Chinese Yuan',
        symbol: '¥',
        decimalPlaces: 2,
      },
      {
        code: 'INR',
        name: 'Indian Rupee',
        symbol: '₹',
        decimalPlaces: 2,
      },
      {
        code: 'BRL',
        name: 'Brazilian Real',
        symbol: 'R$',
        decimalPlaces: 2,
      },
    ];

    await this.prisma.currency.createMany({
      data: currencies,
      skipDuplicates: true,
    });

    this.logger.info(`Created ${currencies.length} currencies`);
    return currencies.length;
  }

  private async seedTaxRates(): Promise<number> {
    this.logger.info('Seeding tax rates...');

    const taxRates = [
      // Canadian GST/HST
      {
        code: 'GST',
        name: 'Goods and Services Tax',
        rate: 0.05,
        countryCode: 'CA',
        stateProvince: null,
        isDefault: false,
        effectiveDate: new Date('2023-01-01'),
      },
      {
        code: 'HST_ON',
        name: 'Harmonized Sales Tax - Ontario',
        rate: 0.13,
        countryCode: 'CA',
        stateProvince: 'Ontario',
        isDefault: true,
        effectiveDate: new Date('2023-01-01'),
      },
      {
        code: 'HST_BC',
        name: 'Harmonized Sales Tax - British Columbia',
        rate: 0.12,
        countryCode: 'CA',
        stateProvince: 'British Columbia',
        isDefault: false,
        effectiveDate: new Date('2023-01-01'),
      },
      {
        code: 'HST_AB',
        name: 'Harmonized Sales Tax - Alberta',
        rate: 0.05,
        countryCode: 'CA',
        stateProvince: 'Alberta',
        isDefault: false,
        effectiveDate: new Date('2023-01-01'),
      },
      {
        code: 'HST_QC',
        name: 'Harmonized Sales Tax - Quebec',
        rate: 0.14975,
        countryCode: 'CA',
        stateProvince: 'Quebec',
        isDefault: false,
        effectiveDate: new Date('2023-01-01'),
      },
      // US Sales Tax (simplified)
      {
        code: 'SALES_TAX_US',
        name: 'US Sales Tax',
        rate: 0.0825,
        countryCode: 'US',
        stateProvince: null,
        isDefault: true,
        effectiveDate: new Date('2023-01-01'),
      },
      // VAT for other countries
      {
        code: 'VAT_UK',
        name: 'Value Added Tax - UK',
        rate: 0.20,
        countryCode: 'GB',
        stateProvince: null,
        isDefault: true,
        effectiveDate: new Date('2023-01-01'),
      },
      {
        code: 'VAT_DE',
        name: 'Value Added Tax - Germany',
        rate: 0.19,
        countryCode: 'DE',
        stateProvince: null,
        isDefault: true,
        effectiveDate: new Date('2023-01-01'),
      },
      {
        code: 'GST_AU',
        name: 'Goods and Services Tax - Australia',
        rate: 0.10,
        countryCode: 'AU',
        stateProvince: null,
        isDefault: true,
        effectiveDate: new Date('2023-01-01'),
      },
    ];

    await this.prisma.taxRate.createMany({
      data: taxRates,
      skipDuplicates: true,
    });

    this.logger.info(`Created ${taxRates.length} tax rates`);
    return taxRates.length;
  }

  private async seedProductCategories(): Promise<number> {
    this.logger.info('Seeding product categories...');

    // Create parent categories first
    const parentCategories = [
      {
        code: 'HARDWARE',
        name: 'Hardware',
        description: 'Computer hardware and accessories',
        parentId: null,
      },
      {
        code: 'SOFTWARE',
        name: 'Software',
        description: 'Software licenses and applications',
        parentId: null,
      },
      {
        code: 'SERVICES',
        name: 'Services',
        description: 'Professional services and support',
        parentId: null,
      },
      {
        code: 'OFFICE',
        name: 'Office Supplies',
        description: 'Office supplies and equipment',
        parentId: null,
      },
    ];

    const createdParents = await Promise.all(
      parentCategories.map(category =>
        this.prisma.productCategory.create({ data: category })
      )
    );

    // Create child categories
    const childCategories = [
      // Hardware subcategories
      {
        code: 'LAPTOPS',
        name: 'Laptops',
        description: 'Laptop computers',
        parentId: createdParents.find(c => c.code === 'HARDWARE')?.id,
      },
      {
        code: 'DESKTOPS',
        name: 'Desktop Computers',
        description: 'Desktop computers',
        parentId: createdParents.find(c => c.code === 'HARDWARE')?.id,
      },
      {
        code: 'MONITORS',
        name: 'Monitors',
        description: 'Computer monitors and displays',
        parentId: createdParents.find(c => c.code === 'HARDWARE')?.id,
      },
      {
        code: 'ACCESSORIES',
        name: 'Accessories',
        description: 'Computer accessories',
        parentId: createdParents.find(c => c.code === 'HARDWARE')?.id,
      },
      // Software subcategories
      {
        code: 'OS',
        name: 'Operating Systems',
        description: 'Operating system licenses',
        parentId: createdParents.find(c => c.code === 'SOFTWARE')?.id,
      },
      {
        code: 'PRODUCTIVITY',
        name: 'Productivity Software',
        description: 'Office and productivity applications',
        parentId: createdParents.find(c => c.code === 'SOFTWARE')?.id,
      },
      {
        code: 'DEVELOPMENT',
        name: 'Development Tools',
        description: 'Software development tools',
        parentId: createdParents.find(c => c.code === 'SOFTWARE')?.id,
      },
      // Services subcategories
      {
        code: 'CONSULTING',
        name: 'Consulting',
        description: 'Professional consulting services',
        parentId: createdParents.find(c => c.code === 'SERVICES')?.id,
      },
      {
        code: 'SUPPORT',
        name: 'Technical Support',
        description: 'Technical support services',
        parentId: createdParents.find(c => c.code === 'SERVICES')?.id,
      },
      // Office subcategories
      {
        code: 'STATIONERY',
        name: 'Stationery',
        description: 'Pens, paper, and stationery items',
        parentId: createdParents.find(c => c.code === 'OFFICE')?.id,
      },
      {
        code: 'FURNITURE',
        name: 'Office Furniture',
        description: 'Desks, chairs, and office furniture',
        parentId: createdParents.find(c => c.code === 'OFFICE')?.id,
      },
    ];

    await this.prisma.productCategory.createMany({
      data: childCategories,
      skipDuplicates: true,
    });

    const totalCategories = parentCategories.length + childCategories.length;
    this.logger.info(`Created ${totalCategories} product categories`);
    return totalCategories;
  }

  private async seedServiceCategories(): Promise<number> {
    this.logger.info('Seeding service categories...');

    // Create parent categories first
    const parentCategories = [
      {
        code: 'DEVELOPMENT',
        name: 'Software Development',
        description: 'Software development services',
        parentId: null,
      },
      {
        code: 'CONSULTING',
        name: 'Consulting',
        description: 'Business and technical consulting',
        parentId: null,
      },
      {
        code: 'SUPPORT',
        name: 'Support Services',
        description: 'Technical and customer support',
        parentId: null,
      },
      {
        code: 'DESIGN',
        name: 'Design Services',
        description: 'UI/UX and graphic design',
        parentId: null,
      },
    ];

    const createdParents = await Promise.all(
      parentCategories.map(category =>
        this.prisma.serviceCategory.create({ data: category })
      )
    );

    // Create child categories
    const childCategories = [
      // Development subcategories
      {
        code: 'WEB_DEV',
        name: 'Web Development',
        description: 'Website and web application development',
        parentId: createdParents.find(c => c.code === 'DEVELOPMENT')?.id,
      },
      {
        code: 'MOBILE_DEV',
        name: 'Mobile Development',
        description: 'Mobile application development',
        parentId: createdParents.find(c => c.code === 'DEVELOPMENT')?.id,
      },
      {
        code: 'BACKEND_DEV',
        name: 'Backend Development',
        description: 'Server-side development',
        parentId: createdParents.find(c => c.code === 'DEVELOPMENT')?.id,
      },
      {
        code: 'DATABASE_DEV',
        name: 'Database Development',
        description: 'Database design and development',
        parentId: createdParents.find(c => c.code === 'DEVELOPMENT')?.id,
      },
      // Consulting subcategories
      {
        code: 'TECH_CONSULTING',
        name: 'Technical Consulting',
        description: 'Technical architecture and consulting',
        parentId: createdParents.find(c => c.code === 'CONSULTING')?.id,
      },
      {
        code: 'BUS_CONSULTING',
        name: 'Business Consulting',
        description: 'Business process and strategy consulting',
        parentId: createdParents.find(c => c.code === 'CONSULTING')?.id,
      },
      {
        code: 'SECURITY_CONSULTING',
        name: 'Security Consulting',
        description: 'Cybersecurity consulting',
        parentId: createdParents.find(c => c.code === 'CONSULTING')?.id,
      },
      // Support subcategories
      {
        code: 'TECH_SUPPORT',
        name: 'Technical Support',
        description: 'Technical support and troubleshooting',
        parentId: createdParents.find(c => c.code === 'SUPPORT')?.id,
      },
      {
        code: 'MAINTENANCE',
        name: 'System Maintenance',
        description: 'System maintenance and updates',
        parentId: createdParents.find(c => c.code === 'SUPPORT')?.id,
      },
      // Design subcategories
      {
        code: 'UI_DESIGN',
        name: 'UI Design',
        description: 'User interface design',
        parentId: createdParents.find(c => c.code === 'DESIGN')?.id,
      },
      {
        code: 'UX_DESIGN',
        name: 'UX Design',
        description: 'User experience design',
        parentId: createdParents.find(c => c.code === 'DESIGN')?.id,
      },
      {
        code: 'GRAPHIC_DESIGN',
        name: 'Graphic Design',
        description: 'Graphic design and branding',
        parentId: createdParents.find(c => c.code === 'DESIGN')?.id,
      },
    ];

    await this.prisma.serviceCategory.createMany({
      data: childCategories,
      skipDuplicates: true,
    });

    const totalCategories = parentCategories.length + childCategories.length;
    this.logger.info(`Created ${totalCategories} service categories`);
    return totalCategories;
  }
}

export default ReferenceDataSeeder;