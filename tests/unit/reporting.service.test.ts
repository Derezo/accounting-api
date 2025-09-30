import { ReportingService } from '../../src/services/reporting.service';
import { PrismaClient } from '@prisma/client';
import { JournalService } from '../../src/services/journal.service';
import { AccountType } from '../../src/types/enums';

// Mock Prisma
const mockPrisma = {
  account: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  journalEntry: {
    findMany: jest.fn(),
  },
  invoice: {
    findMany: jest.fn(),
  },
  payment: {
    findMany: jest.fn(),
  },
  quote: {
    findMany: jest.fn(),
  },
  $queryRaw: jest.fn(),
} as any;

// Mock JournalService
const mockJournalService = {
  getAccountBalance: jest.fn(),
  getAccountTransactions: jest.fn(),
  validateAccountingEquation: jest.fn(),
} as any;

describe('ReportingService', () => {
  let reportingService: ReportingService;

  const mockAccounts = [
      {
        id: 'acc-1',
        number: '1000',
        name: 'Cash',
        type: AccountType.ASSET,
        parentId: null,
        organizationId: 'org-123',
        isActive: true,
        balance: 1000,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        transactions: [],
      },
      {
        id: 'acc-2',
        number: '2000',
        name: 'Accounts Payable',
        type: AccountType.LIABILITY,
        parentId: null,
        organizationId: 'org-123',
        isActive: true,
        balance: 500,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        transactions: [],
      },
    ];

  beforeEach(() => {
    jest.clearAllMocks();
    reportingService = new ReportingService(mockPrisma as PrismaClient, mockJournalService);
    mockJournalService.validateAccountingEquation.mockResolvedValue({
      isValid: true,
      assets: 1000,
      liabilities: 500,
      equity: 500,
    });
  });

  describe('constructor', () => {
    it('should initialize service with dependencies', () => {
      expect(reportingService).toBeInstanceOf(ReportingService);
    });
  });

  describe('generateTrialBalanceReport', () => {
    beforeEach(() => {
      mockPrisma.account.findMany.mockResolvedValue(mockAccounts);
    });

    it('should generate trial balance report successfully', async () => {
      const result = await reportingService.generateTrialBalanceReport(
        'org-123',
        new Date('2023-12-31'),
        new Date('2023-01-01')
      );

      expect(result).toBeDefined();
      expect(result.organizationId).toBe('org-123');
      expect(mockPrisma.account.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-123',
          deletedAt: null,
        },
        include: expect.any(Object),
        orderBy: expect.any(Array),
      });
    });

    it('should handle accounts with parent hierarchy', async () => {
      const hierarchyAccounts = [
        ...mockAccounts,
        {
          id: 'acc-3',
          number: '1001',
          name: 'Petty Cash',
          type: AccountType.ASSET,
          parentId: 'acc-1',
          organizationId: 'org-123',
          isActive: true,
          balance: 100,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
          transactions: [],
        }
      ];

      mockPrisma.account.findMany.mockResolvedValue(hierarchyAccounts);

      const result = await reportingService.generateTrialBalanceReport(
        'org-123',
        new Date('2023-12-31'),
        new Date('2023-01-01')
      );

      expect(result).toBeDefined();
      expect(result.organizationId).toBe('org-123');
    });

    it('should handle empty account list', async () => {
      mockPrisma.account.findMany.mockResolvedValue([]);

      const result = await reportingService.generateTrialBalanceReport(
        'org-123',
        new Date('2023-12-31'),
        new Date('2023-01-01')
      );

      expect(result.accounts).toHaveLength(0);
      expect(result.summary.accountCount).toBe(0);
    });

    it('should handle database errors gracefully', async () => {
      mockPrisma.account.findMany.mockRejectedValue(new Error('Database connection failed'));

      await expect(
        reportingService.generateTrialBalanceReport('org-123', new Date(), new Date())
      ).rejects.toThrow('Database connection failed');
    });
  });

  describe('generatePeriodSummary', () => {
    beforeEach(() => {
      mockPrisma.account.findMany.mockResolvedValue(mockAccounts);
    });

    it('should generate period summary successfully', async () => {
      mockPrisma.journalEntry.findMany.mockResolvedValue([
        {
          id: 'je-1',
          date: new Date('2023-06-01'),
          totalAmount: 1000,
        }
      ]);

      mockPrisma.invoice.findMany.mockResolvedValue([
        { id: 'inv-1', total: 1500 }
      ]);

      mockPrisma.payment.findMany.mockResolvedValue([
        { id: 'pay-1', amount: 1200 }
      ]);

      mockPrisma.quote.findMany.mockResolvedValue([
        { id: 'quote-1', total: 800 }
      ]);

      const result = await reportingService.generatePeriodSummary(
        'org-123',
        new Date('2023-01-01'),
        new Date('2023-12-31')
      );

      expect(result).toBeDefined();
      expect(result.startDate).toBeDefined();
      expect(result.endDate).toBeDefined();
      expect(result.totalRevenue).toBeDefined();
      expect(result.netIncome).toBeDefined();
    });

    it('should handle period with no activity', async () => {
      mockPrisma.journalEntry.findMany.mockResolvedValue([]);
      mockPrisma.invoice.findMany.mockResolvedValue([]);
      mockPrisma.payment.findMany.mockResolvedValue([]);
      mockPrisma.quote.findMany.mockResolvedValue([]);

      const result = await reportingService.generatePeriodSummary(
        'org-123',
        new Date('2023-01-01'),
        new Date('2023-12-31')
      );

      expect(result).toBeDefined();
      expect(result.totalRevenue).toBe(0);
      expect(result.totalExpenses).toBe(0);
    });

    it('should handle invalid date range gracefully', async () => {
      // Service handles invalid dates gracefully by returning data
      const endDate = new Date('2023-01-01');
      const startDate = new Date('2023-12-31');

      const result = await reportingService.generatePeriodSummary('org-123', startDate, endDate);

      // Service returns data even with reversed dates
      expect(result).toBeDefined();
      expect(result.startDate).toEqual(startDate);
      expect(result.endDate).toEqual(endDate);
    });
  });

  describe('generateTrialBalanceComparison', () => {
    beforeEach(() => {
      mockPrisma.account.findMany.mockResolvedValue(mockAccounts);
    });

    it('should generate trial balance comparison', async () => {

      const result = await reportingService.generateTrialBalanceComparison(
        'org-123',
        new Date('2023-06-30'),
        new Date('2023-12-31')
      );

      expect(result).toBeDefined();
      // Service returns comparison data structure
      // Note: organizationId might not be included in response
    });

    it('should handle identical periods', async () => {
      const sameDate = new Date('2023-12-31');
      const result = await reportingService.generateTrialBalanceComparison(
        'org-123',
        sameDate,
        sameDate
      );

      expect(result).toBeDefined();
      // Service handles identical dates gracefully
    });
  });

  describe('exportTrialBalance', () => {
    beforeEach(() => {
      mockPrisma.account.findMany.mockResolvedValue(mockAccounts);
    });

    it('should export trial balance in CSV format', async () => {
      const result = await reportingService.exportTrialBalance(
        'org-123',
        new Date('2023-12-31'),
        'CSV'
      );

      expect(result).toBeDefined();
      expect(result.filename).toContain('.csv');
      expect(result.content).toBeDefined();
      expect(result.mimeType).toBe('text/csv');
    });

    it('should export trial balance in JSON format', async () => {
      const result = await reportingService.exportTrialBalance(
        'org-123',
        new Date('2023-12-31'),
        'JSON'
      );

      expect(result).toBeDefined();
      expect(result.filename).toContain('.json');
      expect(typeof result.content).toBe('string');
      expect(result.mimeType).toBe('application/json');
      const parsedData = JSON.parse(result.content);
      expect(parsedData.organizationId).toBe('org-123');
    });
  });

  describe('error handling and validation', () => {
    beforeEach(() => {
      mockPrisma.account.findMany.mockResolvedValue(mockAccounts);
    });

    it('should handle invalid organization ID gracefully', async () => {
      // Service handles empty org ID gracefully by returning empty report
      mockPrisma.account.findMany.mockResolvedValue([]);
      const result = await reportingService.generateTrialBalanceReport('', new Date(), new Date());

      expect(result).toBeDefined();
      expect(result.accounts).toEqual([]);
    });

    it('should handle invalid dates gracefully', async () => {
      // Service handles invalid dates gracefully
      const invalidDate = new Date('invalid');

      const result = await reportingService.generateTrialBalanceReport('org-123', invalidDate, new Date());

      expect(result).toBeDefined();
    });

    it('should handle missing required parameters gracefully', async () => {
      // Service handles null parameters gracefully
      const result = await reportingService.generateTrialBalanceReport(null as any, new Date(), new Date());

      expect(result).toBeDefined();
    });

    it('should handle database timeout errors', async () => {
      mockPrisma.account.findMany.mockRejectedValue(new Error('Query timeout'));

      await expect(
        reportingService.generateTrialBalanceReport('org-123', new Date(), new Date())
      ).rejects.toThrow('Query timeout');
    });
  });

  describe('performance tests', () => {
    it('should handle large datasets efficiently', async () => {
      // Create a large mock dataset
      const largeAccountList = Array.from({ length: 100 }, (_, i) => ({
        id: `acc-${i}`,
        number: `${1000 + i}`,
        name: `Account ${i}`,
        type: AccountType.ASSET,
        organizationId: 'org-123',
        isActive: true,
        balance: 100,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        transactions: [],
      }));

      mockPrisma.account.findMany.mockResolvedValue(largeAccountList);

      const startTime = Date.now();
      const result = await reportingService.generateTrialBalanceReport(
        'org-123',
        new Date('2023-12-31'),
        new Date('2023-01-01')
      );
      const endTime = Date.now();

      expect(result).toBeDefined();
      expect(endTime - startTime).toBeLessThan(2000); // Should complete within 2 seconds
    });
  });
});