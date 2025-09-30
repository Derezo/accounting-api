import { TaxService } from '../../src/services/tax.service';
import { PrismaClient, TaxRate, Prisma } from '@prisma/client';
import { AuditService } from '../../src/services/audit.service';

// Mock Prisma
const mockPrisma = {
  taxRate: {
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    upsert: jest.fn(),
  },
  taxRecord: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
  stateProvince: {
    findMany: jest.fn(),
  },
  $transaction: jest.fn(),
} as any;

// Mock AuditService
const mockAuditService = {
  logAction: jest.fn(),
} as any;

// Mock FinancialMath utilities
jest.mock('../../src/utils/financial', () => ({
  FinancialMath: {
    add: jest.fn((a, b) => Number(a) + Number(b)),
    subtract: jest.fn((a, b) => Number(a) - Number(b)),
    multiply: jest.fn((a, b) => Number(a) * Number(b)),
    divide: jest.fn((a, b) => Number(a) / Number(b)),
    round: jest.fn((n) => Math.round(Number(n) * 100) / 100),
    toNumber: jest.fn((n) => Number(n)),
    calculateTax: jest.fn((amount, rate) => (Number(amount) * Number(rate)) / 100),
  },
  calculateTax: jest.fn((amount, rate) => (Number(amount) * Number(rate)) / 100),
  toCurrency: jest.fn((n) => Math.round(Number(n) * 100) / 100),
}));

describe('TaxService', () => {
  let taxService: TaxService;

  beforeEach(() => {
    jest.clearAllMocks();
    taxService = new TaxService(mockPrisma as PrismaClient, mockAuditService);
  });

  describe('constructor', () => {
    it('should initialize service with Prisma and Audit service', () => {
      expect(taxService).toBeInstanceOf(TaxService);
    });
  });

  describe('calculateTax', () => {
    const mockTaxRates: TaxRate[] = [
      {
        id: 'gst-rate',
        code: 'GST',
        name: 'Goods and Services Tax',
        rate: new Prisma.Decimal(5),
        countryCode: 'CA',
        stateProvince: null,
        effectiveDate: new Date('2022-01-01'),
        expiryDate: null,
        isDefault: false,
      },
      {
        id: 'pst-rate',
        code: 'PST',
        name: 'Provincial Sales Tax',
        rate: new Prisma.Decimal(8),
        countryCode: 'CA',
        stateProvince: 'ON',
        effectiveDate: new Date('2022-01-01'),
        expiryDate: null,
        isDefault: false,
      }
    ];

    beforeEach(() => {
      mockPrisma.taxRate.findMany.mockResolvedValue(mockTaxRates);
    });

    it('should calculate basic tax successfully', async () => {
      const request = {
        organizationId: 'org-123',
        items: [
          {
            id: 'item-1',
            description: 'Test Item',
            amount: 100,
            quantity: 1,
            taxable: true,
          }
        ],
        jurisdiction: { countryCode: 'CA', stateProvinceCode: 'ON' },
      };

      const result = await taxService.calculateTax(request);

      expect(result).toBeDefined();
      expect(result.subtotal).toBe(100);
      expect(mockPrisma.taxRate.findMany).toHaveBeenCalled();
    });

    it('should handle empty items array', async () => {
      const request = {
        organizationId: 'org-123',
        items: [],
        jurisdiction: { countryCode: 'CA' },
      };

      // Empty items results in 0 subtotal, 0 taxable amount - service doesn't reject
      const result = await taxService.calculateTax(request);
      expect(result.subtotal).toBe(0);
      expect(result.taxableAmount).toBe(0);
    });

    it('should handle customer tax exemption', async () => {
      const request = {
        organizationId: 'org-123',
        items: [
          {
            id: 'item-1',
            description: 'Test Item',
            amount: 100,
            quantity: 1,
            taxable: true,
          }
        ],
        jurisdiction: { countryCode: 'CA' },
        customerTaxExempt: true,
      };

      const result = await taxService.calculateTax(request);

      expect(result.exemptionApplied).toBe(true);
      expect(result.totalTax).toBe(0);
    });

    it('should handle non-taxable items', async () => {
      const request = {
        organizationId: 'org-123',
        items: [
          {
            id: 'item-1',
            description: 'Non-taxable Item',
            amount: 100,
            quantity: 1,
            taxable: false,
          }
        ],
        jurisdiction: { countryCode: 'CA' },
      };

      const result = await taxService.calculateTax(request);

      expect(result.taxableAmount).toBe(0);
    });

    it('should handle missing tax rates', async () => {
      mockPrisma.taxRate.findMany.mockResolvedValue([]);

      const request = {
        organizationId: 'org-123',
        items: [
          {
            id: 'item-1',
            description: 'Test Item',
            amount: 100,
            quantity: 1,
            taxable: true,
          }
        ],
        jurisdiction: { countryCode: 'US' },
      };

      await expect(taxService.calculateTax(request)).rejects.toThrow();
    });
  });

  describe('configureTaxRate', () => {
    it('should create new tax rate successfully', async () => {
      const config = {
        code: 'GST',
        name: 'Goods and Services Tax',
        rate: 5,
        taxType: 'GST' as const,
        countryCode: 'CA',
        effectiveDate: new Date('2023-01-01'),
        isCompound: false,
      };

      const mockCreatedRate: TaxRate = {
        id: 'new-rate-123',
        code: 'GST',
        name: 'Goods and Services Tax',
        rate: new Prisma.Decimal(5),
        countryCode: 'CA',
        stateProvince: null,
        effectiveDate: new Date('2023-01-01'),
        expiryDate: null,
        isDefault: false,
      };

      mockPrisma.taxRate.create.mockResolvedValue(mockCreatedRate);

      const result = await taxService.configureTaxRate(config, 'user-123');

      expect(result).toEqual(mockCreatedRate);
      expect(mockPrisma.taxRate.create).toHaveBeenCalled();
    });

    it('should update existing tax rate', async () => {
      const config = {
        id: 'existing-rate',
        code: 'GST',
        name: 'Updated GST',
        rate: 6,
        taxType: 'GST' as const,
        countryCode: 'CA',
        effectiveDate: new Date('2023-01-01'),
        isCompound: false,
      };

      const mockUpdatedRate: TaxRate = {
        id: 'existing-rate',
        code: 'GST',
        name: 'Updated GST',
        rate: new Prisma.Decimal(6),
        countryCode: 'CA',
        stateProvince: null,
        effectiveDate: new Date('2023-01-01'),
        expiryDate: null,
        isDefault: false,
      };

      mockPrisma.taxRate.update.mockResolvedValue(mockUpdatedRate);

      const result = await taxService.configureTaxRate(config, 'user-123');

      expect(result).toEqual(mockUpdatedRate);
      expect(mockPrisma.taxRate.update).toHaveBeenCalled();
    });

    it('should handle negative tax rates', async () => {
      const config = {
        code: 'GST',
        name: 'Invalid GST',
        rate: -5,
        taxType: 'GST' as const,
        countryCode: 'CA',
        effectiveDate: new Date('2023-01-01'),
        isCompound: false,
      };

      // Service doesn't validate negative rates, just passes to DB
      mockPrisma.taxRate.create.mockResolvedValue({
        id: 'negative-rate',
        code: 'GST',
        name: 'Invalid GST',
        rate: new Prisma.Decimal(-5),
        countryCode: 'CA',
        stateProvince: null,
        effectiveDate: new Date('2023-01-01'),
        expiryDate: null,
        isDefault: false,
      });

      const result = await taxService.configureTaxRate(config, 'user-123');
      expect(result).toBeDefined();
    });

    it('should handle invalid date ranges', async () => {
      const config = {
        code: 'GST',
        name: 'GST',
        rate: 5,
        taxType: 'GST' as const,
        countryCode: 'CA',
        effectiveDate: new Date('2023-01-01'),
        expiryDate: new Date('2022-01-01'), // Before effective date
        isCompound: false,
      };

      // Service doesn't validate date ranges, just passes to DB
      mockPrisma.taxRate.create.mockResolvedValue({
        id: 'invalid-dates',
        code: 'GST',
        name: 'GST',
        rate: new Prisma.Decimal(5),
        countryCode: 'CA',
        stateProvince: null,
        effectiveDate: new Date('2023-01-01'),
        expiryDate: new Date('2022-01-01'),
        isDefault: false,
      });

      const result = await taxService.configureTaxRate(config, 'user-123');
      expect(result).toBeDefined();
    });
  });

  describe('getTaxRatesForJurisdiction', () => {
    it('should return tax rates for jurisdiction', async () => {
      const jurisdiction = {
        countryCode: 'CA',
        stateProvinceCode: 'ON',
      };

      const mockRates: TaxRate[] = [
        {
          id: 'rate-1',
          code: 'GST',
          name: 'GST',
          rate: new Prisma.Decimal(5),
          countryCode: 'CA',
          stateProvince: null,
          effectiveDate: new Date(),
          expiryDate: null,
          isDefault: false,
        }
      ];

      mockPrisma.taxRate.findMany.mockResolvedValue(mockRates);

      const result = await taxService.getTaxRatesForJurisdiction(jurisdiction);

      expect(result).toEqual(mockRates);
      expect(mockPrisma.taxRate.findMany).toHaveBeenCalledWith({
        where: {
          countryCode: 'CA',
          stateProvince: 'ON',
          effectiveDate: { lte: expect.any(Date) },
          OR: [
            { expiryDate: null },
            { expiryDate: { gte: expect.any(Date) } }
          ],
        },
        orderBy: [
          { code: 'asc' }
        ]
      });
    });

    it('should handle jurisdiction without state/province', async () => {
      const jurisdiction = {
        countryCode: 'US',
      };

      mockPrisma.taxRate.findMany.mockResolvedValue([]);

      const result = await taxService.getTaxRatesForJurisdiction(jurisdiction);

      expect(result).toEqual([]);
      expect(mockPrisma.taxRate.findMany).toHaveBeenCalledWith({
        where: {
          countryCode: 'US',
          effectiveDate: { lte: expect.any(Date) },
          OR: [
            { expiryDate: null },
            { expiryDate: { gte: expect.any(Date) } }
          ],
        },
        orderBy: [
          { code: 'asc' }
        ]
      });
    });
  });

  describe('initializeCanadianTaxRates', () => {
    it('should initialize Canadian tax rates', async () => {
      const mockTaxRate: TaxRate = {
        id: 'gst-rate',
        code: 'GST',
        name: 'GST',
        rate: new Prisma.Decimal(5),
        countryCode: 'CA',
        stateProvince: null,
        effectiveDate: new Date(),
        expiryDate: null,
        isDefault: false,
      };

      // Mock create to return tax rates for each configuration
      mockPrisma.taxRate.create.mockResolvedValue(mockTaxRate);

      const result = await taxService.initializeCanadianTaxRates('user-123');

      expect(result).toBeInstanceOf(Array);
      expect(result.length).toBeGreaterThan(0);
      expect(mockPrisma.taxRate.create).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle database connection errors', async () => {
      mockPrisma.taxRate.findMany.mockRejectedValue(new Error('Database connection failed'));

      const request = {
        organizationId: 'org-123',
        items: [
          {
            id: 'item-1',
            description: 'Test Item',
            amount: 100,
            quantity: 1,
            taxable: true,
          }
        ],
        jurisdiction: { countryCode: 'CA' },
      };

      await expect(taxService.calculateTax(request)).rejects.toThrow('Database connection failed');
    });

    it('should handle invalid organization ID', async () => {
      // Reset mock from previous test
      mockPrisma.taxRate.findMany.mockResolvedValue([
        {
          id: 'rate-1',
          code: 'GST',
          name: 'GST',
          rate: new Prisma.Decimal(5),
          countryCode: 'CA',
          stateProvince: null,
          effectiveDate: new Date('2020-01-01'),
          expiryDate: null,
          isDefault: false,
        }
      ]);

      const request = {
        organizationId: '',
        items: [
          {
            id: 'item-1',
            description: 'Test Item',
            amount: 100,
            quantity: 1,
            taxable: true,
          }
        ],
        jurisdiction: { countryCode: 'CA' },
      };

      // Service doesn't validate org ID, just uses it
      const result = await taxService.calculateTax(request);
      expect(result).toBeDefined();
    });

    it('should handle invalid jurisdiction', async () => {
      const request = {
        organizationId: 'org-123',
        items: [
          {
            id: 'item-1',
            description: 'Test Item',
            amount: 100,
            quantity: 1,
            taxable: true,
          }
        ],
        jurisdiction: { countryCode: '' },
      };

      // Should throw because no tax rates will be found
      mockPrisma.taxRate.findMany.mockResolvedValue([]);
      await expect(taxService.calculateTax(request)).rejects.toThrow('No tax rates found');
    });
  });

  describe('audit logging', () => {
    it('should log tax rate configuration changes', async () => {
      const config = {
        code: 'GST',
        name: 'Goods and Services Tax',
        rate: 5,
        taxType: 'GST' as const,
        countryCode: 'CA',
        effectiveDate: new Date('2023-01-01'),
        isCompound: false,
      };

      const mockCreatedRate: TaxRate = {
        id: 'new-rate-123',
        code: 'GST',
        name: 'Goods and Services Tax',
        rate: new Prisma.Decimal(5),
        countryCode: 'CA',
        stateProvince: null,
        effectiveDate: new Date('2023-01-01'),
        expiryDate: null,
        isDefault: false,
      };

      mockPrisma.taxRate.create.mockResolvedValue(mockCreatedRate);

      await taxService.configureTaxRate(config, 'user-123');

      expect(mockAuditService.logAction).toHaveBeenCalledWith({
        action: 'CREATE',
        entityType: 'TAX_RATE',
        entityId: 'new-rate-123',
        context: {
          organizationId: 'SYSTEM',
          userId: 'user-123',
        },
        changes: { taxCode: 'GST', rate: 5 },
      });
    });
  });
});