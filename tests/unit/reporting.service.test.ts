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
} as any;

describe('ReportingService', () => {
  let reportingService: ReportingService;

  beforeEach(() => {
    jest.clearAllMocks();
    reportingService = new ReportingService(mockPrisma as PrismaClient, mockJournalService);
  });

  describe('constructor', () => {
    it('should initialize service with dependencies', () => {
      expect(reportingService).toBeInstanceOf(ReportingService);
    });
  });

  describe('generateTrialBalanceReport', () => {
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
      },
    ];

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
      expect(result.organizationId).toBe('org-123');
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
      expect(result.organizationId).toBe('org-123');
    });

    it('should validate date range', async () => {
      const endDate = new Date('2023-01-01');
      const startDate = new Date('2023-12-31');

      await expect(
        reportingService.generatePeriodSummary('org-123', startDate, endDate)
      ).rejects.toThrow();
    });
  });

  describe('generateTrialBalanceComparison', () => {
    it('should generate trial balance comparison', async () => {
      mockPrisma.account.findMany.mockResolvedValue(mockAccounts);

      const result = await reportingService.generateTrialBalanceComparison(
        'org-123',
        new Date('2023-06-30'),
        new Date('2023-12-31')
      );

      expect(result).toBeDefined();
      expect(result.organizationId).toBe('org-123');
      expect(result.comparison).toBeDefined();
    });

    it('should handle identical periods', async () => {
      mockPrisma.account.findMany.mockResolvedValue(mockAccounts);

      const sameDate = new Date('2023-12-31');
      const result = await reportingService.generateTrialBalanceComparison(
        'org-123',
        sameDate,
        sameDate
      );

      expect(result).toBeDefined();
      expect(result.comparison.periodsAreSame).toBe(true);
    });
  });

  describe('exportTrialBalance', () => {
    it('should export trial balance in CSV format', async () => {
      const mockTrialBalance = {
        organizationId: 'org-123',
        asOfDate: new Date(),
        generatedAt: new Date(),
        periodStartDate: new Date(),
        summary: {
          totalDebits: 1000,
          totalCredits: 1000,
          difference: 0,
          isBalanced: true,
          accountCount: 2,
          transactionCount: 10,
        },
        accounts: [
          {
            accountId: 'acc-1',
            accountNumber: '1000',
            accountName: 'Cash',
            accountType: AccountType.ASSET,
            level: 0,
            debitBalance: 1000,
            creditBalance: 0,
            netBalance: 1000,
            normalBalance: 'DEBIT' as const,
            isBalanceNormal: true,
            transactionCount: 5,
            yearToDateActivity: {
              debits: 1000,
              credits: 0,
              netChange: 1000,
            },
          }
        ],
        validation: {
          errors: [],
          warnings: [],
          recommendations: [],
        },
      };

      const result = await reportingService.exportTrialBalance(
        mockTrialBalance,
        'CSV'
      );

      expect(result).toBeDefined();
      expect(result.format).toBe('CSV');
      expect(result.data).toContain('Account Number');
      expect(result.data).toContain('1000');
    });

    it('should export trial balance in JSON format', async () => {
      const mockTrialBalance = {
        organizationId: 'org-123',
        asOfDate: new Date(),
        generatedAt: new Date(),
        periodStartDate: new Date(),
        summary: {
          totalDebits: 1000,
          totalCredits: 1000,
          difference: 0,
          isBalanced: true,
          accountCount: 1,
          transactionCount: 5,
        },
        accounts: [],
        validation: {
          errors: [],
          warnings: [],
          recommendations: [],
        },
      };

      const result = await reportingService.exportTrialBalance(
        mockTrialBalance,
        'JSON'
      );

      expect(result).toBeDefined();
      expect(result.format).toBe('JSON');
      expect(JSON.parse(result.data)).toEqual(mockTrialBalance);
    });
  });

  describe('error handling and validation', () => {
    it('should handle invalid organization ID', async () => {
      await expect(
        reportingService.generateTrialBalanceReport('', new Date(), new Date())
      ).rejects.toThrow();
    });

    it('should handle invalid dates', async () => {
      const invalidDate = new Date('invalid');

      await expect(
        reportingService.generateTrialBalanceReport('org-123', invalidDate, new Date())
      ).rejects.toThrow();
    });

    it('should handle missing required parameters', async () => {
      await expect(
        reportingService.generateTrialBalanceReport(null as any, new Date(), new Date())
      ).rejects.toThrow();
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