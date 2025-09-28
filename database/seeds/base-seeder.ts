/**
 * Base Seeder - Abstract class for all seeders
 */

import { PrismaClient } from '@prisma/client';
import { faker } from '@faker-js/faker';
import winston from 'winston';

export interface SeedOptions {
  environment: 'development' | 'testing' | 'staging' | 'production';
  organizationId?: string;
  count?: number;
  clean?: boolean;
  verbose?: boolean;
}

export interface SeedResult {
  seederName: string;
  environment: string;
  recordsCreated: number;
  timeTaken: number;
  success: boolean;
  errors: string[];
}

export abstract class BaseSeeder {
  protected prisma: PrismaClient;
  protected logger: winston.Logger;
  protected faker: typeof faker;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.faker = faker;

    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          ),
        }),
      ],
    });
  }

  /**
   * Abstract method to be implemented by concrete seeders
   */
  abstract seed(options: SeedOptions): Promise<SeedResult>;

  /**
   * Clean existing data (to be implemented by concrete seeders)
   */
  abstract clean(options: SeedOptions): Promise<void>;

  /**
   * Get the seeder name
   */
  abstract get name(): string;

  /**
   * Validate environment permissions
   */
  protected validateEnvironment(environment: string): void {
    if (environment === 'production') {
      throw new Error('Seeding is not allowed in production environment');
    }
  }

  /**
   * Generate Canadian address
   */
  protected generateCanadianAddress() {
    const provinces = [
      'Alberta', 'British Columbia', 'Manitoba', 'New Brunswick',
      'Newfoundland and Labrador', 'Northwest Territories', 'Nova Scotia',
      'Nunavut', 'Ontario', 'Prince Edward Island', 'Quebec', 'Saskatchewan', 'Yukon'
    ];

    const provinceCodes = [
      'AB', 'BC', 'MB', 'NB', 'NL', 'NT', 'NS', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT'
    ];

    const provinceIndex = Math.floor(Math.random() * provinces.length);

    return {
      line1: this.faker.location.streetAddress(),
      line2: Math.random() > 0.7 ? this.faker.location.secondaryAddress() : null,
      city: this.faker.location.city(),
      stateProvince: provinces[provinceIndex],
      stateProvinceCode: provinceCodes[provinceIndex],
      postalCode: this.generateCanadianPostalCode(),
      country: 'Canada',
      countryCode: 'CA',
    };
  }

  /**
   * Generate Canadian postal code
   */
  protected generateCanadianPostalCode(): string {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const numbers = '0123456789';

    return (
      letters[Math.floor(Math.random() * letters.length)] +
      numbers[Math.floor(Math.random() * numbers.length)] +
      letters[Math.floor(Math.random() * letters.length)] +
      ' ' +
      numbers[Math.floor(Math.random() * numbers.length)] +
      letters[Math.floor(Math.random() * letters.length)] +
      numbers[Math.floor(Math.random() * numbers.length)]
    );
  }

  /**
   * Generate Canadian phone number
   */
  protected generateCanadianPhone(): string {
    const areaCodes = ['416', '647', '437', '905', '289', '365', '514', '438', '450', '579', '418', '581', '819', '873', '604', '778', '236', '250', '403', '587', '825', '780', '306', '639', '204', '431', '506', '709', '902', '782', '867'];
    const areaCode = areaCodes[Math.floor(Math.random() * areaCodes.length)];
    const exchange = Math.floor(Math.random() * 900) + 100;
    const number = Math.floor(Math.random() * 9000) + 1000;

    return `+1 (${areaCode}) ${exchange}-${number}`;
  }

  /**
   * Generate Canadian business number
   */
  protected generateCanadianBusinessNumber(): string {
    const digits = Math.floor(Math.random() * 900000000) + 100000000;
    return `${digits.toString()}RT0001`;
  }

  /**
   * Generate realistic Canadian company name
   */
  protected generateCanadianCompanyName(): string {
    const suffixes = ['Inc.', 'Ltd.', 'Corp.', 'Co.', 'Enterprises', 'Solutions', 'Services', 'Group', 'Holdings'];
    const types = ['Consulting', 'Construction', 'Technology', 'Manufacturing', 'Retail', 'Professional', 'Creative', 'Financial'];

    const companyName = this.faker.company.name();
    const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];

    if (Math.random() > 0.5) {
      const type = types[Math.floor(Math.random() * types.length)];
      return `${companyName} ${type} ${suffix}`;
    }

    return `${companyName} ${suffix}`;
  }

  /**
   * Generate Social Insurance Number (for testing only)
   */
  protected generateSIN(): string {
    // Generate a valid SIN format but with clear test indicators
    const area = Math.floor(Math.random() * 9) + 1;
    const group = Math.floor(Math.random() * 100).toString().padStart(2, '0');
    const serial = Math.floor(Math.random() * 100).toString().padStart(2, '0');

    return `9${area}${group}${serial}`; // Starting with 9 indicates test SIN
  }

  /**
   * Generate realistic email based on name
   */
  protected generateRealisticEmail(firstName: string, lastName: string, domain?: string): string {
    const domains = domain ? [domain] : ['gmail.com', 'outlook.com', 'yahoo.ca', 'hotmail.com', 'shaw.ca', 'rogers.com'];
    const selectedDomain = domains[Math.floor(Math.random() * domains.length)];

    const patterns = [
      `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${selectedDomain}`,
      `${firstName.toLowerCase()}${lastName.toLowerCase()}@${selectedDomain}`,
      `${firstName.toLowerCase()}${Math.floor(Math.random() * 999)}@${selectedDomain}`,
      `${firstName.charAt(0).toLowerCase()}.${lastName.toLowerCase()}@${selectedDomain}`,
      `${firstName.toLowerCase()}_${lastName.toLowerCase()}@${selectedDomain}`,
    ];

    return patterns[Math.floor(Math.random() * patterns.length)];
  }

  /**
   * Generate currency amount in cents
   */
  protected generateAmount(min: number = 10, max: number = 10000): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * Generate realistic project description
   */
  protected generateProjectDescription(): string {
    const projectTypes = [
      'Website development and design',
      'Mobile application development',
      'Database system implementation',
      'E-commerce platform setup',
      'Digital marketing campaign',
      'SEO optimization project',
      'Business process automation',
      'Cloud migration services',
      'Security audit and implementation',
      'Integration development',
      'Custom software development',
      'System maintenance and support'
    ];

    return projectTypes[Math.floor(Math.random() * projectTypes.length)];
  }

  /**
   * Generate realistic service description
   */
  protected generateServiceDescription(): string {
    const services = [
      'Software Development',
      'Web Design',
      'Consulting',
      'Project Management',
      'Quality Assurance',
      'Technical Support',
      'Database Administration',
      'System Integration',
      'Security Assessment',
      'Performance Optimization',
      'Code Review',
      'Documentation'
    ];

    return services[Math.floor(Math.random() * services.length)];
  }

  /**
   * Generate date within range
   */
  protected generateDateInRange(startDate: Date, endDate: Date): Date {
    const start = startDate.getTime();
    const end = endDate.getTime();
    const randomTime = start + Math.random() * (end - start);
    return new Date(randomTime);
  }

  /**
   * Log seeding progress
   */
  protected logProgress(message: string, current: number, total: number): void {
    const percentage = Math.round((current / total) * 100);
    this.logger.info(`${message} - ${current}/${total} (${percentage}%)`);
  }

  /**
   * Execute seed with error handling and timing
   */
  async executeSeed(options: SeedOptions): Promise<SeedResult> {
    const startTime = Date.now();
    const result: SeedResult = {
      seederName: this.name,
      environment: options.environment,
      recordsCreated: 0,
      timeTaken: 0,
      success: false,
      errors: [],
    };

    try {
      this.validateEnvironment(options.environment);

      this.logger.info(`Starting ${this.name} seeder for ${options.environment} environment`);

      if (options.clean) {
        await this.clean(options);
      }

      const seedResult = await this.seed(options);
      result.recordsCreated = seedResult.recordsCreated;
      result.success = true;

      this.logger.info(`${this.name} seeder completed successfully - ${result.recordsCreated} records created`);
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : String(error));
      result.success = false;
      this.logger.error(`${this.name} seeder failed:`, error);
    } finally {
      result.timeTaken = Date.now() - startTime;
    }

    return result;
  }
}

export default BaseSeeder;