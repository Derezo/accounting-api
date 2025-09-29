/* eslint-disable @typescript-eslint/no-non-null-assertion, @typescript-eslint/unbound-method */
import { PrismaClient } from '@prisma/client';
import { BalanceSheetService } from '../../src/services/balance-sheet.service';
import { FinancialStatementsService, BalanceSheet } from '../../src/services/financial-statements.service';
import { cleanupDatabase } from '../testUtils';

// Mock PrismaClient
const mockPrismaClient = {
  organization: {
    findUnique: jest.fn(),
  },
  account: {
    findMany: jest.fn(),
  },
  journalEntry: {
    findMany: jest.fn(),
  },
} as unknown as PrismaClient;

// Mock FinancialStatementsService
const mockFinancialStatementsService = {
  generateBalanceSheet: jest.fn(),
} as unknown as FinancialStatementsService;

describe('BalanceSheetService', () => {
  let balanceSheetService: BalanceSheetService;
  const testOrganizationId = 'test-org-123';

  beforeEach(async () => {
    await cleanupDatabase();
    balanceSheetService = new BalanceSheetService(mockPrismaClient, mockFinancialStatementsService);
    jest.clearAllMocks();
  });

  // Helper function to create mock balance sheet data
  const createMockBalanceSheet = (
    asOfDate: Date,
    assetBalances: Record<string, number> = {},
    liabilityBalances: Record<string, number> = {},
    equityBalances: Record<string, number> = {}
  ): BalanceSheet => {
    const assets = [
      { accountId: 'cash-001', accountNumber: '1000', accountName: 'Cash', balance: assetBalances.cash ?? 50000 },
      { accountId: 'ar-001', accountNumber: '1200', accountName: 'Accounts Receivable', balance: assetBalances.receivables ?? 25000 },
      { accountId: 'inv-001', accountNumber: '1300', accountName: 'Inventory', balance: assetBalances.inventory ?? 30000 },
      { accountId: 'ppe-001', accountNumber: '1500', accountName: 'Property, Plant & Equipment', balance: assetBalances.ppe ?? 100000 }
    ];

    const liabilities = [
      { accountId: 'ap-001', accountNumber: '2000', accountName: 'Accounts Payable', balance: liabilityBalances.payables ?? 15000 },
      { accountId: 'lt-001', accountNumber: '2500', accountName: 'Long-term Debt', balance: liabilityBalances.longTermDebt ?? 80000 }
    ];

    const equity = [
      { accountId: 'eq-001', accountNumber: '3000', accountName: 'Owner\'s Equity', balance: equityBalances.equity ?? 110000 }
    ];

    const currentAssets = assets.slice(0, 3);
    const nonCurrentAssets = assets.slice(3);
    const currentLiabilities = liabilities.slice(0, 1);
    const nonCurrentLiabilities = liabilities.slice(1);

    const currentAssetsTotal = currentAssets.reduce((sum, acc) => sum + acc.balance, 0);
    const nonCurrentAssetsTotal = nonCurrentAssets.reduce((sum, acc) => sum + acc.balance, 0);
    const totalAssets = currentAssetsTotal + nonCurrentAssetsTotal;

    const currentLiabilitiesTotal = currentLiabilities.reduce((sum, acc) => sum + acc.balance, 0);
    const nonCurrentLiabilitiesTotal = nonCurrentLiabilities.reduce((sum, acc) => sum + acc.balance, 0);
    const totalLiabilities = currentLiabilitiesTotal + nonCurrentLiabilitiesTotal;

    const totalEquity = equity.reduce((sum, acc) => sum + acc.balance, 0);

    return {
      organizationId: testOrganizationId,
      asOfDate,
      generatedAt: new Date(),
      currency: 'CAD',
      assets: {
        currentAssets: {
          name: 'Current Assets',
          accounts: currentAssets,
          subtotal: currentAssetsTotal
        },
        nonCurrentAssets: {
          name: 'Non-Current Assets',
          accounts: nonCurrentAssets,
          subtotal: nonCurrentAssetsTotal
        },
        totalAssets
      },
      liabilities: {
        currentLiabilities: {
          name: 'Current Liabilities',
          accounts: currentLiabilities,
          subtotal: currentLiabilitiesTotal
        },
        nonCurrentLiabilities: {
          name: 'Non-Current Liabilities',
          accounts: nonCurrentLiabilities,
          subtotal: nonCurrentLiabilitiesTotal
        },
        totalLiabilities
      },
      equity: {
        equity: {
          name: 'Equity',
          accounts: equity,
          subtotal: totalEquity
        },
        totalEquity
      },
      validation: {
        balanceCheck: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01,
        difference: totalAssets - (totalLiabilities + totalEquity)
      }
    };
  };

  describe('generateComparativeBalanceSheet', () => {
    it('should generate comparative balance sheet with valid data', async () => {
      // Arrange
      const date1 = new Date('2024-01-31');
      const date2 = new Date('2024-02-28');
      const dates = [date1, date2];

      const balanceSheet1 = createMockBalanceSheet(date1);
      const balanceSheet2 = createMockBalanceSheet(date2,
        { cash: 55000, receivables: 27000, inventory: 32000, ppe: 98000 }, // Assets increased
        { payables: 16000, longTermDebt: 78000 }, // Liabilities changed
        { equity: 118000 } // Equity increased
      );

      (mockFinancialStatementsService.generateBalanceSheet as jest.Mock)
        .mockResolvedValueOnce(balanceSheet1)
        .mockResolvedValueOnce(balanceSheet2);

      // Act
      const result = await balanceSheetService.generateComparativeBalanceSheet(testOrganizationId, dates, true);

      // Assert
      expect(result).toBeDefined();
      expect(result.organizationId).toBe(testOrganizationId);
      expect(result.periods).toHaveLength(2);
      expect(result.periods[0].asOfDate).toEqual(date1);
      expect(result.periods[1].asOfDate).toEqual(date2);
      expect(result.analysis).toBeDefined();
      expect(result.analysis.horizontalAnalysis).toBeDefined();
      expect(result.validation).toBeDefined();
    });

    it('should handle multiple periods correctly', async () => {
      // Arrange
      const dates = [
        new Date('2024-01-31'),
        new Date('2024-02-28'),
        new Date('2024-03-31')
      ];

      const mockBalanceSheets = dates.map(date => createMockBalanceSheet(date));

      (mockFinancialStatementsService.generateBalanceSheet as jest.Mock)
        .mockResolvedValueOnce(mockBalanceSheets[0])
        .mockResolvedValueOnce(mockBalanceSheets[1])
        .mockResolvedValueOnce(mockBalanceSheets[2]);

      // Act
      const result = await balanceSheetService.generateComparativeBalanceSheet(testOrganizationId, dates, true);

      // Assert
      expect(result.periods).toHaveLength(3);
      expect(result.analysis.trends).toBeDefined();
      const mockCall = mockFinancialStatementsService.generateBalanceSheet as jest.Mock;
      expect(mockCall).toHaveBeenCalledTimes(3);
    });

    it('should skip analysis when includeAnalysis is false', async () => {
      // Arrange
      const dates = [new Date('2024-01-31')];
      const balanceSheet = createMockBalanceSheet(dates[0]);

      (mockFinancialStatementsService.generateBalanceSheet as jest.Mock)
        .mockResolvedValue(balanceSheet);

      // Act
      const result = await balanceSheetService.generateComparativeBalanceSheet(testOrganizationId, dates, false);

      // Assert
      expect(result.analysis.horizontalAnalysis).toEqual({});
      expect(result.analysis.verticalAnalysis).toEqual({});
      expect(result.analysis.trends).toEqual([]);
    });

    it('should sort dates chronologically', async () => {
      // Arrange
      const date1 = new Date('2024-02-28');
      const date2 = new Date('2024-01-31');
      const dates = [date1, date2]; // Unsorted

      const balanceSheet1 = createMockBalanceSheet(new Date('2024-01-31'));
      const balanceSheet2 = createMockBalanceSheet(new Date('2024-02-28'));

      (mockFinancialStatementsService.generateBalanceSheet as jest.Mock)
        .mockResolvedValueOnce(balanceSheet1)
        .mockResolvedValueOnce(balanceSheet2);

      // Act
      const result = await balanceSheetService.generateComparativeBalanceSheet(testOrganizationId, dates, false);

      // Assert
      expect(result.periods[0].asOfDate.getTime()).toBeLessThan(result.periods[1].asOfDate.getTime());
    });
  });

  describe('performHorizontalAnalysis', () => {
    it('should calculate percentage changes correctly', async () => {
      // Arrange
      const baseBalanceSheet = createMockBalanceSheet(
        new Date('2024-01-31'),
        { cash: 50000, receivables: 25000, inventory: 30000, ppe: 100000 }
      );

      const comparisonBalanceSheet = createMockBalanceSheet(
        new Date('2024-02-28'),
        { cash: 60000, receivables: 20000, inventory: 33000, ppe: 105000 } // 20% increase, 20% decrease, 10% increase, 5% increase
      );

      // Act
      const result = await balanceSheetService.performHorizontalAnalysis(baseBalanceSheet, comparisonBalanceSheet);

      // Assert
      expect(result.baseDate).toEqual(baseBalanceSheet.asOfDate);
      expect(result.comparisonDate).toEqual(comparisonBalanceSheet.asOfDate);

      const cashChange = result.changes.find(c => c.accountId === 'cash-001');
      expect(cashChange).toBeDefined();
      expect(cashChange!.baseAmount).toBe(50000);
      expect(cashChange!.comparisonAmount).toBe(60000);
      expect(cashChange!.dollarChange).toBe(10000);
      expect(cashChange!.percentChange).toBe(20);
      expect(cashChange!.isSignificant).toBe(true);

      const receivablesChange = result.changes.find(c => c.accountId === 'ar-001');
      expect(receivablesChange!.percentChange).toBe(-20);
      expect(receivablesChange!.isSignificant).toBe(true);
    });

    it('should identify significant changes correctly', async () => {
      // Arrange
      const baseBalanceSheet = createMockBalanceSheet(new Date('2024-01-31'));
      const comparisonBalanceSheet = createMockBalanceSheet(
        new Date('2024-02-28'),
        { cash: 51000, receivables: 37500, inventory: 30000, ppe: 100000 } // 2%, 50%, 0%, 0%
      );

      // Act
      const result = await balanceSheetService.performHorizontalAnalysis(baseBalanceSheet, comparisonBalanceSheet);

      // Assert
      const significantChanges = result.significantChanges;
      expect(significantChanges).toHaveLength(1); // Only receivables should be significant (50% > 10%)
      expect(significantChanges[0].accountId).toBe('ar-001');
      expect(significantChanges[0].percentChange).toBe(50);
    });

    it('should handle zero base amounts correctly', async () => {
      // Arrange
      const baseBalanceSheet = createMockBalanceSheet(new Date('2024-01-31'));
      // Manually set cash account to 0
      const cashAccount = baseBalanceSheet.assets.currentAssets.accounts.find(acc => acc.accountId === 'cash-001');
      if (cashAccount) {
        cashAccount.balance = 0;
        baseBalanceSheet.assets.currentAssets.subtotal = 55000; // 25000 + 30000
        baseBalanceSheet.assets.totalAssets = 155000; // 55000 + 100000
      }

      const comparisonBalanceSheet = createMockBalanceSheet(
        new Date('2024-02-28'),
        { cash: 10000, receivables: 25000, inventory: 30000, ppe: 100000 }
      );

      // Act
      const result = await balanceSheetService.performHorizontalAnalysis(baseBalanceSheet, comparisonBalanceSheet);

      // Assert
      const cashChange = result.changes.find(c => c.accountId === 'cash-001');
      expect(cashChange!.baseAmount).toBe(0);
      expect(cashChange!.comparisonAmount).toBe(10000);
      expect(cashChange!.percentChange).toBe(0); // Should be 0 when base amount is 0
      expect(cashChange!.dollarChange).toBe(10000); // Should show the dollar change
      expect(cashChange!.isSignificant).toBe(true); // Dollar change > 1000 makes it significant
    });

    it('should handle missing accounts in comparison period', async () => {
      // Arrange
      const baseBalanceSheet = createMockBalanceSheet(new Date('2024-01-31'));
      const comparisonBalanceSheet = createMockBalanceSheet(new Date('2024-02-28'));

      // Remove an account from comparison
      comparisonBalanceSheet.assets.currentAssets.accounts =
        comparisonBalanceSheet.assets.currentAssets.accounts.filter(acc => acc.accountId !== 'inv-001');

      // Act
      const result = await balanceSheetService.performHorizontalAnalysis(baseBalanceSheet, comparisonBalanceSheet);

      // Assert
      const inventoryChange = result.changes.find(c => c.accountId === 'inv-001');
      expect(inventoryChange!.comparisonAmount).toBe(0);
      expect(inventoryChange!.dollarChange).toBe(-30000);
      expect(inventoryChange!.percentChange).toBe(-100);
    });
  });

  describe('performVerticalAnalysis', () => {
    it('should calculate percentages correctly', () => {
      // Arrange
      const balanceSheet = createMockBalanceSheet(new Date('2024-01-31'));

      // Act
      const result = balanceSheetService.performVerticalAnalysis(balanceSheet);

      // Assert
      expect(result.asOfDate).toEqual(balanceSheet.asOfDate);

      const cashPercentage = result.assetPercentages.find(p => p.accountId === 'cash-001');
      expect(cashPercentage!.percentOfTotal).toBeCloseTo(24.39, 2); // 50000/205000 * 100
      expect(cashPercentage!.percentOfCategory).toBeCloseTo(24.39, 2); // Currently using total assets as category total
    });

    it('should handle zero totals gracefully', () => {
      // Arrange - Create balance sheet with all zero amounts
      const balanceSheet = createMockBalanceSheet(
        new Date('2024-01-31'),
        { cash: 0, receivables: 0, inventory: 0, ppe: 0 },
        { payables: 0, longTermDebt: 0 },
        { equity: 0 }
      );

      // Act
      const result = balanceSheetService.performVerticalAnalysis(balanceSheet);

      // Assert
      result.assetPercentages.forEach(percentage => {
        expect(percentage.percentOfTotal).toBe(0);
        expect(percentage.percentOfCategory).toBe(0);
      });
    });
  });

  describe('calculateDetailedRatios', () => {
    it('should calculate liquidity ratios correctly', () => {
      // Arrange
      const balanceSheet = createMockBalanceSheet(new Date('2024-01-31'));

      // Act
      const ratios = balanceSheetService.calculateDetailedRatios(balanceSheet);

      // Assert
      expect(ratios.liquidityRatios.currentRatio).toBeCloseTo(7.0, 2); // 105000/15000
      expect(ratios.liquidityRatios.workingCapital).toBe(90000); // 105000 - 15000
      expect(ratios.liquidityRatios.quickRatio).toBeCloseTo(5.0, 2); // (50000+25000)/15000
      expect(ratios.liquidityRatios.cashRatio).toBeCloseTo(3.33, 2); // 50000/15000
    });

    it('should calculate leverage ratios correctly', () => {
      // Arrange
      const balanceSheet = createMockBalanceSheet(new Date('2024-01-31'));

      // Act
      const ratios = balanceSheetService.calculateDetailedRatios(balanceSheet);

      // Assert
      expect(ratios.leverageRatios.debtToAssets).toBeCloseTo(46.34, 2); // 95000/205000 * 100
      expect(ratios.leverageRatios.debtToEquity).toBeCloseTo(86.36, 2); // 95000/110000 * 100
      expect(ratios.leverageRatios.equityRatio).toBeCloseTo(53.66, 2); // 110000/205000 * 100
    });

    it('should handle zero denominators in ratios', () => {
      // Arrange - Create balance sheet with zero current liabilities
      const balanceSheet = createMockBalanceSheet(
        new Date('2024-01-31'),
        { cash: 50000, receivables: 25000, inventory: 30000, ppe: 100000 },
        { payables: 0, longTermDebt: 0 }, // Zero liabilities
        { equity: 205000 }
      );


      // Act
      const ratios = balanceSheetService.calculateDetailedRatios(balanceSheet);

      // Assert
      // When current liabilities are 0, the ratio calculations return 0 per the service logic
      expect(ratios.liquidityRatios.currentRatio).toBe(0);
      expect(ratios.liquidityRatios.quickRatio).toBe(0);
      expect(ratios.liquidityRatios.cashRatio).toBe(0);
      expect(ratios.leverageRatios.debtToAssets).toBe(0); // Total liabilities = 0
      expect(ratios.leverageRatios.debtToEquity).toBe(0); // Total liabilities = 0
    });
  });

  describe('validateBalanceSheet', () => {
    it('should pass validation for balanced sheet', async () => {
      // Arrange
      const balanceSheet = createMockBalanceSheet(new Date('2024-01-31'));

      // Act
      const validation = await balanceSheetService.validateBalanceSheet(balanceSheet);

      // Assert
      expect(validation.errors).toHaveLength(0);
      expect(validation.overallScore).toBeGreaterThan(80);
    });

    it('should detect balance equation errors', async () => {
      // Arrange
      const balanceSheet = createMockBalanceSheet(new Date('2024-01-31'));
      balanceSheet.validation.balanceCheck = false;
      balanceSheet.validation.difference = 5000;

      // Act
      const validation = await balanceSheetService.validateBalanceSheet(balanceSheet);

      // Assert
      expect(validation.errors).toHaveLength(1);
      expect(validation.errors[0].type).toBe('BALANCE_EQUATION');
      expect(validation.errors[0].severity).toBe('CRITICAL');
      expect(validation.overallScore).toBeLessThanOrEqual(80);
    });

    it('should detect negative asset balances', async () => {
      // Arrange
      const balanceSheet = createMockBalanceSheet(
        new Date('2024-01-31'),
        { cash: -10000, receivables: 25000, inventory: 30000, ppe: 100000 }
      );

      // Act
      const validation = await balanceSheetService.validateBalanceSheet(balanceSheet);

      // Assert
      const negativeAssetError = validation.errors.find(e => e.type === 'NEGATIVE_ASSET');
      expect(negativeAssetError).toBeDefined();
      expect(negativeAssetError!.severity).toBe('HIGH');
      expect(negativeAssetError!.affectedAccounts).toContain('cash-001');
    });

    it('should generate liquidity warnings', async () => {
      // Arrange
      const balanceSheet = createMockBalanceSheet(
        new Date('2024-01-31'),
        { cash: 5000, receivables: 2000, inventory: 3000, ppe: 100000 },
        { payables: 15000, longTermDebt: 80000 } // Current ratio = 10000/15000 = 0.67 < 1.0
      );

      // Act
      const validation = await balanceSheetService.validateBalanceSheet(balanceSheet);

      // Assert
      const liquidityWarning = validation.warnings.find(w => w.type === 'RATIO_CONCERN' && w.message.includes('Current ratio'));
      expect(liquidityWarning).toBeDefined();
      expect(liquidityWarning!.recommendation).toContain('current liabilities');
    });

    it('should generate high leverage warnings', async () => {
      // Arrange
      const balanceSheet = createMockBalanceSheet(
        new Date('2024-01-31'),
        { cash: 50000, receivables: 25000, inventory: 30000, ppe: 100000 },
        { payables: 15000, longTermDebt: 180000 }, // High debt
        { equity: 10000 } // Low equity - debt to equity = 195000/10000 = 1950% > 200%
      );

      // Act
      const validation = await balanceSheetService.validateBalanceSheet(balanceSheet);

      // Assert
      const leverageWarning = validation.warnings.find(w => w.type === 'RATIO_CONCERN' && w.message.includes('Debt-to-equity'));
      expect(leverageWarning).toBeDefined();
      expect(leverageWarning!.recommendation).toContain('debt');
    });

    it('should generate cash flow warnings for low cash', async () => {
      // Arrange
      const balanceSheet = createMockBalanceSheet(
        new Date('2024-01-31'),
        { cash: 1000, receivables: 25000, inventory: 30000, ppe: 100000 } // Very low cash
      );

      // Act
      const validation = await balanceSheetService.validateBalanceSheet(balanceSheet);

      // Assert
      const cashWarning = validation.warnings.find(w => w.type === 'CASH_FLOW');
      expect(cashWarning).toBeDefined();
      expect(cashWarning!.recommendation).toContain('cash reserves');
    });

    it('should provide positive recommendations for strong positions', async () => {
      // Arrange
      const balanceSheet = createMockBalanceSheet(
        new Date('2024-01-31'),
        { cash: 80000, receivables: 25000, inventory: 30000, ppe: 100000 },
        { payables: 10000, longTermDebt: 20000 }, // Low debt
        { equity: 205000 }
      );

      // Act
      const validation = await balanceSheetService.validateBalanceSheet(balanceSheet);

      // Assert
      expect(validation.recommendations).toContain('Strong liquidity position - consider investing excess cash');
      expect(validation.recommendations).toContain('Conservative debt levels - may consider leveraging for growth');
    });
  });

  describe('exportBalanceSheet', () => {
    it('should export to CSV format correctly', async () => {
      // Arrange
      const balanceSheet = createMockBalanceSheet(new Date('2024-01-31'));

      // Act
      const result = await balanceSheetService.exportBalanceSheet(balanceSheet, 'CSV');

      // Assert
      expect(result.filename).toBe('balance_sheet_2024-01-31.csv');
      expect(result.mimeType).toBe('text/csv');
      expect(result.content).toContain('Balance Sheet as of');
      expect(result.content).toContain('ASSETS');
      expect(result.content).toContain('LIABILITIES');
      expect(result.content).toContain('EQUITY');
      expect(result.content).toContain('1000,Cash,50000');
    });

    it('should export to JSON format correctly', async () => {
      // Arrange
      const balanceSheet = createMockBalanceSheet(new Date('2024-01-31'));

      // Act
      const result = await balanceSheetService.exportBalanceSheet(balanceSheet, 'JSON');

      // Assert
      expect(result.filename).toBe('balance_sheet_2024-01-31.json');
      expect(result.mimeType).toBe('application/json');

      const parsedContent = JSON.parse(result.content) as BalanceSheet;
      expect(parsedContent.organizationId).toBe(testOrganizationId);
      expect(parsedContent.assets.totalAssets).toBe(205000);
    });

    it('should throw error for unsupported formats', async () => {
      // Arrange
      const balanceSheet = createMockBalanceSheet(new Date('2024-01-31'));

      // Act & Assert
      await expect(balanceSheetService.exportBalanceSheet(balanceSheet, 'PDF'))
        .rejects.toThrow('PDF export not yet implemented');

      await expect(balanceSheetService.exportBalanceSheet(balanceSheet, 'EXCEL'))
        .rejects.toThrow('EXCEL export not yet implemented');

      await expect(balanceSheetService.exportBalanceSheet(balanceSheet, 'INVALID' as 'PDF'))
        .rejects.toThrow('Unsupported export format: INVALID');
    });
  });

  describe('Financial Accuracy Tests', () => {
    it('should maintain balance sheet equation: Assets = Liabilities + Equity', () => {
      // Arrange & Act
      const balanceSheet = createMockBalanceSheet(new Date('2024-01-31'));

      // Assert
      const totalAssets = balanceSheet.assets.totalAssets;
      const totalLiabilitiesAndEquity = balanceSheet.liabilities.totalLiabilities + balanceSheet.equity.totalEquity;

      expect(Math.abs(totalAssets - totalLiabilitiesAndEquity)).toBeLessThan(0.01);
      expect(balanceSheet.validation.balanceCheck).toBe(true);
    });

    it('should calculate percentage changes with proper precision', async () => {
      // Arrange
      const baseBalanceSheet = createMockBalanceSheet(
        new Date('2024-01-31'),
        { cash: 33333.33, receivables: 25000, inventory: 30000, ppe: 100000 }
      );

      const comparisonBalanceSheet = createMockBalanceSheet(
        new Date('2024-02-28'),
        { cash: 44444.44, receivables: 25000, inventory: 30000, ppe: 100000 }
      );

      // Act
      const result = await balanceSheetService.performHorizontalAnalysis(baseBalanceSheet, comparisonBalanceSheet);

      // Assert
      const cashChange = result.changes.find(c => c.accountId === 'cash-001');
      expect(cashChange!.dollarChange).toBeCloseTo(11111.11, 2);
      expect(cashChange!.percentChange).toBeCloseTo(33.33, 2);
    });

    it('should handle decimal precision in financial calculations', () => {
      // Arrange
      const balanceSheet = createMockBalanceSheet(
        new Date('2024-01-31'),
        { cash: 33333.33, receivables: 16666.67, inventory: 25000, ppe: 100000 }
      );

      // Act
      const result = balanceSheetService.performVerticalAnalysis(balanceSheet);

      // Assert
      const totalPercentage = result.assetPercentages.reduce((sum, acc) => sum + acc.percentOfTotal, 0);
      expect(totalPercentage).toBeCloseTo(100, 2);
    });

    it('should validate ratio calculations with edge cases', () => {
      // Arrange - Very small amounts that could cause precision issues
      const balanceSheet = createMockBalanceSheet(
        new Date('2024-01-31'),
        { cash: 0.01, receivables: 0.02, inventory: 0.03, ppe: 0.04 },
        { payables: 0.05, longTermDebt: 0.01 },
        { equity: 0.04 }
      );

      // Act
      const ratios = balanceSheetService.calculateDetailedRatios(balanceSheet);

      // Assert
      expect(ratios.liquidityRatios.currentRatio).toBeCloseTo(1.2, 2); // 0.06/0.05
      expect(ratios.leverageRatios.debtToAssets).toBeCloseTo(60, 2); // 0.06/0.10 * 100
    });
  });

  describe('Edge Cases and Error Scenarios', () => {
    it('should handle empty balance sheet gracefully', async () => {
      // Arrange
      const emptyBalanceSheet: BalanceSheet = {
        organizationId: testOrganizationId,
        asOfDate: new Date('2024-01-31'),
        generatedAt: new Date(),
        currency: 'CAD',
        assets: {
          currentAssets: { name: 'Current Assets', accounts: [], subtotal: 0 },
          nonCurrentAssets: { name: 'Non-Current Assets', accounts: [], subtotal: 0 },
          totalAssets: 0
        },
        liabilities: {
          currentLiabilities: { name: 'Current Liabilities', accounts: [], subtotal: 0 },
          nonCurrentLiabilities: { name: 'Non-Current Liabilities', accounts: [], subtotal: 0 },
          totalLiabilities: 0
        },
        equity: {
          equity: { name: 'Equity', accounts: [], subtotal: 0 },
          totalEquity: 0
        },
        validation: {
          balanceCheck: true,
          difference: 0
        }
      };

      // Act
      const validation = await balanceSheetService.validateBalanceSheet(emptyBalanceSheet);
      const verticalAnalysis = balanceSheetService.performVerticalAnalysis(emptyBalanceSheet);
      const ratios = balanceSheetService.calculateDetailedRatios(emptyBalanceSheet);

      // Assert
      expect(validation.errors).toHaveLength(0);
      expect(verticalAnalysis.assetPercentages).toHaveLength(0);
      expect(ratios.liquidityRatios.currentRatio).toBe(0);
    });

    it('should handle single period comparative analysis', async () => {
      // Arrange
      const dates = [new Date('2024-01-31')];
      const balanceSheet = createMockBalanceSheet(dates[0]);

      (mockFinancialStatementsService.generateBalanceSheet as jest.Mock)
        .mockResolvedValue(balanceSheet);

      // Act
      const result = await balanceSheetService.generateComparativeBalanceSheet(testOrganizationId, dates, true);

      // Assert
      expect(result.periods).toHaveLength(1);
      expect(result.analysis.horizontalAnalysis).toEqual({});
      expect(result.analysis.trends).toEqual([]);
    });

    it('should handle large financial amounts without precision loss', () => {
      // Arrange
      const balanceSheet = createMockBalanceSheet(
        new Date('2024-01-31'),
        { cash: 999999999.99, receivables: 888888888.88, inventory: 777777777.77, ppe: 666666666.66 }
      );

      // Act
      const ratios = balanceSheetService.calculateDetailedRatios(balanceSheet);
      const verticalAnalysis = balanceSheetService.performVerticalAnalysis(balanceSheet);

      // Assert
      expect(ratios.liquidityRatios.currentRatio).toBeGreaterThan(0);
      expect(verticalAnalysis.assetPercentages.length).toBeGreaterThan(0);

      // Verify no NaN or Infinity values
      expect(Number.isFinite(ratios.liquidityRatios.currentRatio)).toBe(true);
      verticalAnalysis.assetPercentages.forEach(percentage => {
        expect(Number.isFinite(percentage.percentOfTotal)).toBe(true);
      });
    });

    it('should handle inconsistent account structures between periods', async () => {
      // Arrange
      const baseBalanceSheet = createMockBalanceSheet(new Date('2024-01-31'));

      // Create comparison with different account structure
      const comparisonBalanceSheet = createMockBalanceSheet(new Date('2024-02-28'));
      comparisonBalanceSheet.assets.currentAssets.accounts.push({
        accountId: 'new-account-001',
        accountNumber: '1400',
        accountName: 'Prepaid Expenses',
        balance: 5000
      });

      // Act
      const result = await balanceSheetService.performHorizontalAnalysis(baseBalanceSheet, comparisonBalanceSheet);

      // Assert
      expect(result.changes).toBeDefined();
      // The new account should not appear in changes since it wasn't in base period
      const newAccountChange = result.changes.find(c => c.accountId === 'new-account-001');
      expect(newAccountChange).toBeUndefined();
    });
  });
});