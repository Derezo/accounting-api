import { describe, it, expect, beforeEach, afterEach, afterAll } from '@jest/globals';
import { Prisma } from '@prisma/client';
import { prisma, cleanupDatabase } from '../testUtils';
import { TaxService } from '../../src/services/tax.service';
import { CanadianTaxService, CanadianProvince } from '../../src/services/canadian-tax.service';
import { AuditService } from '../../src/services/audit.service';

// Mock audit service that doesn't write to database (to avoid SQLite lock issues in tests)
class MockAuditService extends AuditService {
  async logAction(): Promise<void> {
    // No-op in tests to avoid database lock issues
    return Promise.resolve();
  }
}

// Service instances
let taxService: TaxService;
let canadianTaxService: CanadianTaxService;
let auditService: AuditService;

// Test data
let testOrganizationId: string;
let testUserId: string;

describe('Tax Calculation Accuracy Test Suite', () => {
  beforeEach(async () => {
    // Clean up database before each test
    await cleanupDatabase();

    // Initialize services with shared prisma instance and mock audit service
    auditService = new MockAuditService();
    taxService = new TaxService(prisma, auditService);
    canadianTaxService = new CanadianTaxService(prisma, taxService);

    // Create test organization (note: Organization.type field doesn't exist in schema)
    const organization = await prisma.organization.create({
      data: {
        name: 'Test Tax Company',
        email: 'test@tax.com',
        phone: '+1-555-0102',
        encryptionKey: 'test-key-32-chars-12345678901234'
      }
    });
    testOrganizationId = organization.id;

    const user = await prisma.user.create({
      data: {
        email: 'test.tax@example.com',
        passwordHash: 'test-hash',
        firstName: 'Tax',
        lastName: 'Tester',
        organizationId: testOrganizationId,
        role: 'ACCOUNTANT'
      }
    });
    testUserId = user.id;

    // Initialize Canadian tax rates manually (since TaxRate schema doesn't have taxType/isCompound fields)
    // We'll create tax rates for all provinces using the correct schema fields
    const provincialRates = [
      { code: 'GST', name: 'Federal GST - Alberta', rate: 5.0, stateProvinceCode: 'AB' },
      { code: 'GST', name: 'Federal GST - Yukon', rate: 5.0, stateProvinceCode: 'YT' },
      { code: 'HST', name: 'Combined HST - Ontario', rate: 13.0, stateProvinceCode: 'ON' },
      { code: 'HST', name: 'Combined HST - Nova Scotia', rate: 15.0, stateProvinceCode: 'NS' },
      { code: 'GST', name: 'Federal GST - British Columbia', rate: 5.0, stateProvinceCode: 'BC' },
      { code: 'PST', name: 'Provincial PST - British Columbia', rate: 7.0, stateProvinceCode: 'BC' },
      { code: 'GST', name: 'Federal GST - Saskatchewan', rate: 5.0, stateProvinceCode: 'SK' },
      { code: 'PST', name: 'Provincial PST - Saskatchewan', rate: 6.0, stateProvinceCode: 'SK' },
      { code: 'GST', name: 'Federal GST - Quebec', rate: 5.0, stateProvinceCode: 'QC' },
      { code: 'QST', name: 'Quebec Sales Tax', rate: 9.975, stateProvinceCode: 'QC' }
    ];

    for (const rateConfig of provincialRates) {
      await prisma.taxRate.upsert({
        where: {
          code: `${rateConfig.code}_${rateConfig.stateProvinceCode}`
        },
        update: {},
        create: {
          code: `${rateConfig.code}_${rateConfig.stateProvinceCode}`,
          name: rateConfig.name,
          rate: new Prisma.Decimal(rateConfig.rate),
          countryCode: 'CA',
          stateProvince: rateConfig.stateProvinceCode,
          effectiveDate: new Date(),
          isDefault: false
        }
      });
    }
  });

  afterEach(async () => {
    // Clean up test data using shared cleanup utility
    await cleanupDatabase();
  });

  describe('GST Calculations (5% Federal)', () => {
    it('should calculate correct GST for Alberta (GST only province)', async () => {
      const context = {
        province: 'AB' as CanadianProvince,
        businessRegistration: { gstNumber: '123456789RT0001' },
        isSmallSupplier: false,
        isQuickMethod: false,
        fiscalYearEnd: new Date('2024-12-31')
      };

      const request = {
        organizationId: testOrganizationId,
        items: [
          {
            id: '1',
            description: 'Consulting services',
            amount: 1000,
            quantity: 1,
            taxable: true
          }
        ],
        jurisdiction: {
          countryCode: 'CA',
          stateProvinceCode: 'AB'
        }
      };

      const result = await canadianTaxService.calculateCanadianTax(request, context);

      // Alberta has 5% GST only
      expect(result.canadianBreakdown.gstRate).toBe(5.0);
      expect(result.canadianBreakdown.pstRate).toBe(0.0);
      expect(result.canadianBreakdown.hstRate).toBe(0);
      expect(result.canadianBreakdown.isHSTProvince).toBe(false);

      // Tax calculations
      expect(result.canadianBreakdown.gstAmount).toBeCloseTo(50.00, 2); // 5% of $1000
      expect(result.canadianBreakdown.pstAmount).toBe(0);
      expect(result.canadianBreakdown.hstAmount).toBe(0);
      expect(result.canadianBreakdown.totalTax).toBeCloseTo(50.00, 2);

      // Breakdown
      expect(result.canadianBreakdown.breakdown.federalPortion).toBeCloseTo(50.00, 2);
      expect(result.canadianBreakdown.breakdown.provincialPortion).toBe(0);

      // Total amounts
      expect(result.taxableAmount).toBe(1000);
      expect(result.totalTax).toBeCloseTo(50.00, 2);
      expect(result.grandTotal).toBeCloseTo(1050.00, 2);
    });

    it('should calculate correct GST for Yukon (GST only territory)', async () => {
      const context = {
        province: 'YT' as CanadianProvince,
        businessRegistration: { gstNumber: '123456789RT0001' },
        isSmallSupplier: false,
        isQuickMethod: false,
        fiscalYearEnd: new Date('2024-12-31')
      };

      const request = {
        organizationId: testOrganizationId,
        items: [
          {
            id: '1',
            description: 'Product sale',
            amount: 500,
            quantity: 2,
            taxable: true
          }
        ],
        jurisdiction: {
          countryCode: 'CA',
          stateProvinceCode: 'YT'
        }
      };

      const result = await canadianTaxService.calculateCanadianTax(request, context);

      expect(result.canadianBreakdown.gstRate).toBe(5.0);
      expect(result.canadianBreakdown.gstAmount).toBeCloseTo(50.00, 2); // 5% of $1000
      expect(result.canadianBreakdown.totalTax).toBeCloseTo(50.00, 2);
      expect(result.grandTotal).toBeCloseTo(1050.00, 2);
    });
  });

  describe('HST Calculations (Combined Federal + Provincial)', () => {
    it('should calculate correct HST for Ontario (13%)', async () => {
      const context = {
        province: 'ON' as CanadianProvince,
        businessRegistration: { hstNumber: '123456789RT0001' },
        isSmallSupplier: false,
        isQuickMethod: false,
        fiscalYearEnd: new Date('2024-12-31')
      };

      const request = {
        organizationId: testOrganizationId,
        items: [
          {
            id: '1',
            description: 'Professional services',
            amount: 2000,
            quantity: 1,
            taxable: true
          }
        ],
        jurisdiction: {
          countryCode: 'CA',
          stateProvinceCode: 'ON'
        }
      };

      const result = await canadianTaxService.calculateCanadianTax(request, context);

      // Ontario has 13% HST
      expect(result.canadianBreakdown.isHSTProvince).toBe(true);
      expect(result.canadianBreakdown.hstRate).toBe(13.0);
      expect(result.canadianBreakdown.gstRate).toBe(0.0); // No separate GST in HST provinces
      expect(result.canadianBreakdown.pstRate).toBe(0.0); // No separate PST in HST provinces

      // Tax calculations
      expect(result.canadianBreakdown.hstAmount).toBeCloseTo(260.00, 2); // 13% of $2000
      expect(result.canadianBreakdown.gstAmount).toBe(0);
      expect(result.canadianBreakdown.pstAmount).toBe(0);
      expect(result.canadianBreakdown.totalTax).toBeCloseTo(260.00, 2);

      // HST breakdown (5% federal + 8% provincial)
      expect(result.canadianBreakdown.breakdown.federalPortion).toBeCloseTo(100.00, 2); // 5% of $2000
      expect(result.canadianBreakdown.breakdown.provincialPortion).toBeCloseTo(160.00, 2); // 8% of $2000

      expect(result.grandTotal).toBeCloseTo(2260.00, 2);
    });

    it('should calculate correct HST for Nova Scotia (15%)', async () => {
      const context = {
        province: 'NS' as CanadianProvince,
        businessRegistration: { hstNumber: '123456789RT0001' },
        isSmallSupplier: false,
        isQuickMethod: false,
        fiscalYearEnd: new Date('2024-12-31')
      };

      const request = {
        organizationId: testOrganizationId,
        items: [
          {
            id: '1',
            description: 'Equipment sale',
            amount: 1500,
            quantity: 1,
            taxable: true
          }
        ],
        jurisdiction: {
          countryCode: 'CA',
          stateProvinceCode: 'NS'
        }
      };

      const result = await canadianTaxService.calculateCanadianTax(request, context);

      // Nova Scotia has 15% HST
      expect(result.canadianBreakdown.isHSTProvince).toBe(true);
      expect(result.canadianBreakdown.hstRate).toBe(15.0);
      expect(result.canadianBreakdown.hstAmount).toBeCloseTo(225.00, 2); // 15% of $1500

      // HST breakdown (5% federal + 10% provincial)
      expect(result.canadianBreakdown.breakdown.federalPortion).toBeCloseTo(75.00, 2); // 5% of $1500
      expect(result.canadianBreakdown.breakdown.provincialPortion).toBeCloseTo(150.00, 2); // 10% of $1500

      expect(result.grandTotal).toBeCloseTo(1725.00, 2);
    });
  });

  describe('GST + PST Calculations (Separate Taxes)', () => {
    it('should calculate correct GST + PST for British Columbia (5% + 7%)', async () => {
      const context = {
        province: 'BC' as CanadianProvince,
        businessRegistration: {
          gstNumber: '123456789RT0001',
          pstNumber: 'PST-1234-5678'
        },
        isSmallSupplier: false,
        isQuickMethod: false,
        fiscalYearEnd: new Date('2024-12-31')
      };

      const request = {
        organizationId: testOrganizationId,
        items: [
          {
            id: '1',
            description: 'Software license',
            amount: 1200,
            quantity: 1,
            taxable: true
          }
        ],
        jurisdiction: {
          countryCode: 'CA',
          stateProvinceCode: 'BC'
        }
      };

      const result = await canadianTaxService.calculateCanadianTax(request, context);

      // BC has separate 5% GST + 7% PST
      expect(result.canadianBreakdown.isHSTProvince).toBe(false);
      expect(result.canadianBreakdown.gstRate).toBe(5.0);
      expect(result.canadianBreakdown.pstRate).toBe(7.0);
      expect(result.canadianBreakdown.hstRate).toBe(0);

      // Tax calculations (no compounding in BC)
      expect(result.canadianBreakdown.gstAmount).toBeCloseTo(60.00, 2); // 5% of $1200
      expect(result.canadianBreakdown.pstAmount).toBeCloseTo(84.00, 2); // 7% of $1200
      expect(result.canadianBreakdown.hstAmount).toBe(0);
      expect(result.canadianBreakdown.totalTax).toBeCloseTo(144.00, 2); // $60 + $84

      expect(result.grandTotal).toBeCloseTo(1344.00, 2);
    });

    it('should calculate correct GST + PST for Saskatchewan (5% + 6%)', async () => {
      const context = {
        province: 'SK' as CanadianProvince,
        businessRegistration: {
          gstNumber: '123456789RT0001',
          pstNumber: 'PST-SK-1234'
        },
        isSmallSupplier: false,
        isQuickMethod: false,
        fiscalYearEnd: new Date('2024-12-31')
      };

      const request = {
        organizationId: testOrganizationId,
        items: [
          {
            id: '1',
            description: 'Consulting services',
            amount: 800,
            quantity: 1,
            taxable: true
          }
        ],
        jurisdiction: {
          countryCode: 'CA',
          stateProvinceCode: 'SK'
        }
      };

      const result = await canadianTaxService.calculateCanadianTax(request, context);

      expect(result.canadianBreakdown.gstRate).toBe(5.0);
      expect(result.canadianBreakdown.pstRate).toBe(6.0);
      expect(result.canadianBreakdown.gstAmount).toBeCloseTo(40.00, 2); // 5% of $800
      expect(result.canadianBreakdown.pstAmount).toBeCloseTo(48.00, 2); // 6% of $800
      expect(result.canadianBreakdown.totalTax).toBeCloseTo(88.00, 2);
      expect(result.grandTotal).toBeCloseTo(888.00, 2);
    });
  });

  describe('Compound Tax Calculations (Quebec QST)', () => {
    it('should calculate correct compound GST + QST for Quebec (5% + 9.975% compound)', async () => {
      const context = {
        province: 'QC' as CanadianProvince,
        businessRegistration: {
          gstNumber: '123456789RT0001',
          qstNumber: 'QST-1234567890'
        },
        isSmallSupplier: false,
        isQuickMethod: false,
        fiscalYearEnd: new Date('2024-12-31')
      };

      const request = {
        organizationId: testOrganizationId,
        items: [
          {
            id: '1',
            description: 'Merchandise sale',
            amount: 1000,
            quantity: 1,
            taxable: true
          }
        ],
        jurisdiction: {
          countryCode: 'CA',
          stateProvinceCode: 'QC'
        }
      };

      const result = await canadianTaxService.calculateCanadianTax(request, context);

      // Quebec has 5% GST + 9.975% QST (compound)
      expect(result.canadianBreakdown.isHSTProvince).toBe(false);
      expect(result.canadianBreakdown.gstRate).toBe(5.0);
      expect(result.canadianBreakdown.pstRate).toBe(9.975);

      // Tax calculations with compounding
      const gstAmount = 1000 * 0.05; // 5% of $1000 = $50
      const qstBase = 1000 + gstAmount; // QST applies to base + GST = $1050
      const qstAmount = qstBase * 0.09975; // 9.975% of $1050 = $104.74

      expect(result.canadianBreakdown.gstAmount).toBeCloseTo(50.00, 2);
      expect(result.canadianBreakdown.pstAmount).toBeCloseTo(104.74, 1); // Allow 0.1 precision due to rounding
      expect(result.canadianBreakdown.totalTax).toBeCloseTo(154.74, 1); // Allow 0.1 precision due to rounding
      expect(result.grandTotal).toBeCloseTo(1154.74, 1); // Allow 0.1 precision due to rounding
    });

    it('should handle compound tax calculations with multiple items', async () => {
      const context = {
        province: 'QC' as CanadianProvince,
        businessRegistration: {
          gstNumber: '123456789RT0001',
          qstNumber: 'QST-1234567890'
        },
        isSmallSupplier: false,
        isQuickMethod: false,
        fiscalYearEnd: new Date('2024-12-31')
      };

      const request = {
        organizationId: testOrganizationId,
        items: [
          {
            id: '1',
            description: 'Item 1',
            amount: 500,
            quantity: 1,
            taxable: true
          },
          {
            id: '2',
            description: 'Item 2',
            amount: 300,
            quantity: 2,
            taxable: true
          }
        ],
        jurisdiction: {
          countryCode: 'CA',
          stateProvinceCode: 'QC'
        }
      };

      const result = await canadianTaxService.calculateCanadianTax(request, context);

      const subtotal = 500 + (300 * 2); // $1100
      const gstAmount = subtotal * 0.05; // $55
      const qstBase = subtotal + gstAmount; // $1155
      const qstAmount = qstBase * 0.09975; // $115.22

      expect(result.subtotal).toBe(1100);
      expect(result.canadianBreakdown.gstAmount).toBeCloseTo(55.00, 2);
      expect(result.canadianBreakdown.pstAmount).toBeCloseTo(115.22, 1); // Allow 0.1 precision due to rounding
      expect(result.canadianBreakdown.totalTax).toBeCloseTo(170.22, 1); // Allow 0.1 precision due to rounding
      expect(result.grandTotal).toBeCloseTo(1270.22, 1); // Allow 0.1 precision due to rounding
    });
  });

  describe('Tax Exemptions and Zero-Rating', () => {
    it('should handle tax-exempt customers', async () => {
      const context = {
        province: 'ON' as CanadianProvince,
        businessRegistration: { hstNumber: '123456789RT0001' },
        isSmallSupplier: false,
        isQuickMethod: false,
        fiscalYearEnd: new Date('2024-12-31')
      };

      const request = {
        organizationId: testOrganizationId,
        items: [
          {
            id: '1',
            description: 'Services for exempt organization',
            amount: 1000,
            quantity: 1,
            taxable: true
          }
        ],
        customerTaxExempt: true, // Tax-exempt customer
        jurisdiction: {
          countryCode: 'CA',
          stateProvinceCode: 'ON'
        }
      };

      const result = await canadianTaxService.calculateCanadianTax(request, context);

      expect(result.exemptionApplied).toBe(true);
      expect(result.totalTax).toBe(0);
      expect(result.canadianBreakdown.totalTax).toBe(0);
      expect(result.grandTotal).toBe(1000); // Only subtotal, no tax
    });

    it('should handle non-taxable items', async () => {
      const context = {
        province: 'BC' as CanadianProvince,
        businessRegistration: {
          gstNumber: '123456789RT0001',
          pstNumber: 'PST-1234-5678'
        },
        isSmallSupplier: false,
        isQuickMethod: false,
        fiscalYearEnd: new Date('2024-12-31')
      };

      const request = {
        organizationId: testOrganizationId,
        items: [
          {
            id: '1',
            description: 'Taxable service',
            amount: 500,
            quantity: 1,
            taxable: true
          },
          {
            id: '2',
            description: 'Non-taxable service',
            amount: 300,
            quantity: 1,
            taxable: false // Non-taxable item
          }
        ],
        jurisdiction: {
          countryCode: 'CA',
          stateProvinceCode: 'BC'
        }
      };

      const result = await canadianTaxService.calculateCanadianTax(request, context);

      // Tax should only apply to taxable items ($500)
      expect(result.subtotal).toBe(800); // $500 + $300
      expect(result.taxableAmount).toBe(500); // Only $500 is taxable
      expect(result.canadianBreakdown.gstAmount).toBeCloseTo(25.00, 2); // 5% of $500
      expect(result.canadianBreakdown.pstAmount).toBeCloseTo(35.00, 2); // 7% of $500
      expect(result.canadianBreakdown.totalTax).toBeCloseTo(60.00, 2);
      expect(result.grandTotal).toBeCloseTo(860.00, 2);
    });

    it('should identify zero-rated items correctly', async () => {
      // Test zero-rated item identification
      expect(canadianTaxService.isZeroRated('Basic groceries - bread')).toBe(true);
      expect(canadianTaxService.isZeroRated('Prescription medication')).toBe(true);
      expect(canadianTaxService.isZeroRated('Export shipment')).toBe(true);
      expect(canadianTaxService.isZeroRated('Regular consulting service')).toBe(false);
      expect(canadianTaxService.isZeroRated('Software license')).toBe(false);
    });

    it('should identify GST-exempt items correctly', async () => {
      // Test GST-exempt item identification
      expect(canadianTaxService.isGSTExempt('Long-term residential rent')).toBe(true);
      expect(canadianTaxService.isGSTExempt('Healthcare services')).toBe(true);
      expect(canadianTaxService.isGSTExempt('Educational services')).toBe(true);
      expect(canadianTaxService.isGSTExempt('Financial services')).toBe(true);
      expect(canadianTaxService.isGSTExempt('Commercial property rent')).toBe(false);
      expect(canadianTaxService.isGSTExempt('Consulting services')).toBe(false);
    });
  });

  describe('Small Supplier Threshold', () => {
    it('should exempt small suppliers from collecting tax', async () => {
      const context = {
        province: 'ON' as CanadianProvince,
        businessRegistration: {},
        isSmallSupplier: true, // Under $30,000 threshold
        isQuickMethod: false,
        fiscalYearEnd: new Date('2024-12-31')
      };

      const request = {
        organizationId: testOrganizationId,
        items: [
          {
            id: '1',
            description: 'Small business service',
            amount: 500,
            quantity: 1,
            taxable: true
          }
        ],
        jurisdiction: {
          countryCode: 'CA',
          stateProvinceCode: 'ON'
        }
      };

      const result = await canadianTaxService.calculateCanadianTax(request, context);

      // Small suppliers don't collect tax
      expect(result.exemptionApplied).toBe(true);
      expect(result.totalTax).toBe(0);
      expect(result.canadianBreakdown.totalTax).toBe(0);
      expect(result.grandTotal).toBe(500);
    });

    it('should return correct small supplier threshold', () => {
      const threshold = canadianTaxService.getSmallSupplierThreshold();
      expect(threshold).toBe(30000); // Current CRA threshold
    });
  });

  describe('Input Tax Credits (ITCs)', () => {
    it('should calculate ITCs for regular business expenses', async () => {
      const context = {
        province: 'ON' as CanadianProvince,
        businessRegistration: { hstNumber: '123456789RT0001' },
        isSmallSupplier: false,
        isQuickMethod: false,
        fiscalYearEnd: new Date('2024-12-31')
      };

      const itc = await canadianTaxService.calculateInputTaxCredits(
        testOrganizationId,
        1000, // Expense amount
        130,  // HST paid (13% of $1000)
        'office_supplies',
        context
      );

      expect(itc.eligibleAmount).toBe(1000); // 100% eligible
      expect(itc.itcRate).toBe(1.0); // 100% ITC rate
      expect(itc.itcAmount).toBe(130); // Full ITC recovery
      expect(itc.restrictions).toHaveLength(0);
    });

    it('should apply 50% restriction for meals and entertainment', async () => {
      const context = {
        province: 'BC' as CanadianProvince,
        businessRegistration: {
          gstNumber: '123456789RT0001',
          pstNumber: 'PST-1234-5678'
        },
        isSmallSupplier: false,
        isQuickMethod: false,
        fiscalYearEnd: new Date('2024-12-31')
      };

      const itc = await canadianTaxService.calculateInputTaxCredits(
        testOrganizationId,
        500, // Meal expense
        60,  // Tax paid (12% of $500 - 5% GST + 7% PST)
        'meals_entertainment',
        context
      );

      expect(itc.eligibleAmount).toBe(250); // 50% of $500
      expect(itc.itcRate).toBe(0.5); // 50% restriction
      expect(itc.itcAmount).toBe(30); // 50% of tax paid
      expect(itc.restrictions).toContain('Meals and entertainment expenses limited to 50% ITC');
    });

    it('should apply vehicle cost restrictions for luxury vehicles', async () => {
      const context = {
        province: 'AB' as CanadianProvince,
        businessRegistration: { gstNumber: '123456789RT0001' },
        isSmallSupplier: false,
        isQuickMethod: false,
        fiscalYearEnd: new Date('2024-12-31')
      };

      const itc = await canadianTaxService.calculateInputTaxCredits(
        testOrganizationId,
        50000, // Vehicle cost above threshold
        2500,  // GST paid (5% of $50,000)
        'passenger_vehicle',
        context
      );

      // Should be limited to $30,000 threshold
      expect(itc.eligibleAmount).toBeCloseTo(30000, 2);
      expect(itc.itcRate).toBeCloseTo(0.6, 2); // 30000/50000
      expect(itc.itcAmount).toBeCloseTo(1500, 2); // Pro-rated ITC
      expect(itc.restrictions).toContain('Passenger vehicle cost exceeds luxury threshold');
    });

    it('should deny ITCs for club memberships', async () => {
      const context = {
        province: 'ON' as CanadianProvince,
        businessRegistration: { hstNumber: '123456789RT0001' },
        isSmallSupplier: false,
        isQuickMethod: false,
        fiscalYearEnd: new Date('2024-12-31')
      };

      const itc = await canadianTaxService.calculateInputTaxCredits(
        testOrganizationId,
        2000, // Club membership
        260,  // HST paid
        'club_membership',
        context
      );

      expect(itc.eligibleAmount).toBe(0);
      expect(itc.itcRate).toBe(0);
      expect(itc.itcAmount).toBe(0);
      expect(itc.restrictions).toContain('No ITC available for club memberships');
    });
  });

  describe('Rounding and Precision', () => {
    it('should round tax calculations to 2 decimal places', async () => {
      const context = {
        province: 'ON' as CanadianProvince,
        businessRegistration: { hstNumber: '123456789RT0001' },
        isSmallSupplier: false,
        isQuickMethod: false,
        fiscalYearEnd: new Date('2024-12-31')
      };

      const request = {
        organizationId: testOrganizationId,
        items: [
          {
            id: '1',
            description: 'Service with odd amount',
            amount: 33.33, // Amount that creates rounding scenarios
            quantity: 1,
            taxable: true
          }
        ],
        jurisdiction: {
          countryCode: 'CA',
          stateProvinceCode: 'ON'
        }
      };

      const result = await canadianTaxService.calculateCanadianTax(request, context);

      // 13% of $33.33 = $4.3329, should round to $4.33
      expect(result.canadianBreakdown.hstAmount).toBeCloseTo(4.33, 2);
      expect(result.grandTotal).toBeCloseTo(37.66, 2);

      // Verify no more than 2 decimal places (allow tiny floating point errors)
      const hstCents = Math.round(result.canadianBreakdown.hstAmount * 100);
      const totalCents = Math.round(result.grandTotal * 100);
      expect(Math.abs(result.canadianBreakdown.hstAmount * 100 - hstCents)).toBeLessThan(0.01);
      expect(Math.abs(result.grandTotal * 100 - totalCents)).toBeLessThan(0.01);
    });

    it('should handle very small amounts correctly', async () => {
      const context = {
        province: 'BC' as CanadianProvince,
        businessRegistration: {
          gstNumber: '123456789RT0001',
          pstNumber: 'PST-1234-5678'
        },
        isSmallSupplier: false,
        isQuickMethod: false,
        fiscalYearEnd: new Date('2024-12-31')
      };

      const request = {
        organizationId: testOrganizationId,
        items: [
          {
            id: '1',
            description: 'Micro-transaction',
            amount: 0.10, // 10 cents
            quantity: 1,
            taxable: true
          }
        ],
        jurisdiction: {
          countryCode: 'CA',
          stateProvinceCode: 'BC'
        }
      };

      const result = await canadianTaxService.calculateCanadianTax(request, context);

      // GST: 5% of $0.10 = $0.005, rounds to $0.01
      // PST: 7% of $0.10 = $0.007, rounds to $0.01
      expect(result.canadianBreakdown.gstAmount).toBeCloseTo(0.01, 2);
      expect(result.canadianBreakdown.pstAmount).toBeCloseTo(0.01, 2);
      expect(result.canadianBreakdown.totalTax).toBeCloseTo(0.02, 2);
      expect(result.grandTotal).toBeCloseTo(0.12, 2);
    });

    it('should handle large amounts correctly', async () => {
      const context = {
        province: 'ON' as CanadianProvince,
        businessRegistration: { hstNumber: '123456789RT0001' },
        isSmallSupplier: false,
        isQuickMethod: false,
        fiscalYearEnd: new Date('2024-12-31')
      };

      const request = {
        organizationId: testOrganizationId,
        items: [
          {
            id: '1',
            description: 'Large equipment purchase',
            amount: 1000000, // $1 million
            quantity: 1,
            taxable: true
          }
        ],
        jurisdiction: {
          countryCode: 'CA',
          stateProvinceCode: 'ON'
        }
      };

      const result = await canadianTaxService.calculateCanadianTax(request, context);

      // 13% of $1,000,000 = $130,000
      expect(result.canadianBreakdown.hstAmount).toBeCloseTo(130000.00, 2);
      expect(result.grandTotal).toBeCloseTo(1130000.00, 2);
    });
  });

  describe('GST Number Validation', () => {
    it('should validate correct GST number format', () => {
      const validNumbers = [
        '123456789RT0001',
        '987654321RT0002',
        '111111111RT9999'
      ];

      validNumbers.forEach(number => {
        expect(canadianTaxService.validateGSTNumber(number)).toBe(true);
      });
    });

    it('should reject invalid GST number formats', () => {
      const invalidNumbers = [
        '12345678RT0001',   // 8 digits instead of 9
        '1234567890RT0001', // 10 digits instead of 9
        '123456789XY0001',  // XY instead of RT
        '123456789RT',      // Missing 4-digit suffix
        '123456789RT001',   // 3-digit suffix instead of 4
        'ABC456789RT0001',  // Letters in number portion
        '123456789RT000A'   // Letter in suffix
      ];

      invalidNumbers.forEach(number => {
        expect(canadianTaxService.validateGSTNumber(number)).toBe(false);
      });
    });
  });

  describe('Quick Method Calculations', () => {
    it('should return correct quick method rates for different business types', () => {
      // Service businesses
      expect(canadianTaxService.getQuickMethodRate('ON', 'SERVICE')).toBeCloseTo(4.1, 1); // 3.6 + 0.5 HST adjustment
      expect(canadianTaxService.getQuickMethodRate('AB', 'SERVICE')).toBeCloseTo(3.6, 1); // No HST adjustment

      // Retail businesses
      expect(canadianTaxService.getQuickMethodRate('ON', 'RETAIL')).toBeCloseTo(2.3, 1); // 1.8 + 0.5
      expect(canadianTaxService.getQuickMethodRate('BC', 'RETAIL')).toBeCloseTo(1.8, 1);

      // Manufacturing businesses
      expect(canadianTaxService.getQuickMethodRate('NS', 'MANUFACTURING')).toBeCloseTo(3.0, 1); // 2.5 + 0.5
      expect(canadianTaxService.getQuickMethodRate('SK', 'MANUFACTURING')).toBeCloseTo(2.5, 1);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle zero-amount transactions', async () => {
      const context = {
        province: 'ON' as CanadianProvince,
        businessRegistration: { hstNumber: '123456789RT0001' },
        isSmallSupplier: false,
        isQuickMethod: false,
        fiscalYearEnd: new Date('2024-12-31')
      };

      const request = {
        organizationId: testOrganizationId,
        items: [
          {
            id: '1',
            description: 'Free service',
            amount: 0,
            quantity: 1,
            taxable: true
          }
        ],
        jurisdiction: {
          countryCode: 'CA',
          stateProvinceCode: 'ON'
        }
      };

      const result = await canadianTaxService.calculateCanadianTax(request, context);

      expect(result.subtotal).toBe(0);
      expect(result.totalTax).toBe(0);
      expect(result.grandTotal).toBe(0);
    });

    it('should handle transactions with no taxable items', async () => {
      const context = {
        province: 'BC' as CanadianProvince,
        businessRegistration: {
          gstNumber: '123456789RT0001',
          pstNumber: 'PST-1234-5678'
        },
        isSmallSupplier: false,
        isQuickMethod: false,
        fiscalYearEnd: new Date('2024-12-31')
      };

      const request = {
        organizationId: testOrganizationId,
        items: [
          {
            id: '1',
            description: 'Non-taxable item 1',
            amount: 100,
            quantity: 1,
            taxable: false
          },
          {
            id: '2',
            description: 'Non-taxable item 2',
            amount: 200,
            quantity: 1,
            taxable: false
          }
        ],
        jurisdiction: {
          countryCode: 'CA',
          stateProvinceCode: 'BC'
        }
      };

      const result = await canadianTaxService.calculateCanadianTax(request, context);

      expect(result.subtotal).toBe(300);
      expect(result.taxableAmount).toBe(0);
      expect(result.totalTax).toBe(0);
      expect(result.grandTotal).toBe(300);
    });

    it('should reject invalid jurisdiction codes', async () => {
      const context = {
        province: 'XX' as CanadianProvince, // Invalid province
        businessRegistration: { gstNumber: '123456789RT0001' },
        isSmallSupplier: false,
        isQuickMethod: false,
        fiscalYearEnd: new Date('2024-12-31')
      };

      const request = {
        organizationId: testOrganizationId,
        items: [
          {
            id: '1',
            description: 'Test service',
            amount: 100,
            quantity: 1,
            taxable: true
          }
        ],
        jurisdiction: {
          countryCode: 'CA',
          stateProvinceCode: 'XX' // Invalid province code
        }
      };

      await expect(canadianTaxService.calculateCanadianTax(request, context))
        .rejects.toThrow(/No tax rates found for jurisdiction/);
    });
  });
});

// Cleanup after all tests
afterAll(async () => {
  await cleanupDatabase();
  await prisma.$disconnect();
});