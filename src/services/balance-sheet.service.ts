import { PrismaClient } from '@prisma/client';
import { FinancialStatementsService, BalanceSheet, BalanceSheetAccount } from './financial-statements.service';
import { AccountType } from '../types/enums';

import { FinancialMath, calculateRatio } from '../utils/financial';
export interface ComparativeBalanceSheet {
  organizationId: string;
  periods: BalanceSheetPeriod[];
  analysis: {
    horizontalAnalysis: HorizontalAnalysisData;
    verticalAnalysis: VerticalAnalysisData;
    trends: TrendAnalysis[];
  };
  validation: BalanceSheetValidation;
}

export interface BalanceSheetPeriod {
  label: string;
  asOfDate: Date;
  balanceSheet: BalanceSheet;
}

export interface HorizontalAnalysisData {
  baseDate: Date;
  comparisonDate: Date;
  changes: AccountChange[];
  significantChanges: AccountChange[];
}

export interface VerticalAnalysisData {
  asOfDate: Date;
  assetPercentages: AccountPercentage[];
  liabilityPercentages: AccountPercentage[];
  equityPercentages: AccountPercentage[];
}

export interface AccountChange {
  accountId: string;
  accountNumber: string;
  accountName: string;
  accountType: AccountType;
  baseAmount: number;
  comparisonAmount: number;
  dollarChange: number;
  percentChange: number;
  isSignificant: boolean;
}

export interface AccountPercentage {
  accountId: string;
  accountNumber: string;
  accountName: string;
  amount: number;
  percentOfCategory: number;
  percentOfTotal: number;
}

export interface TrendAnalysis {
  accountId: string;
  accountNumber: string;
  accountName: string;
  trend: 'INCREASING' | 'DECREASING' | 'STABLE' | 'VOLATILE';
  trendStrength: number; // 0-100
  periodicChanges: number[];
  averageChange: number;
  volatility: number;
}

export interface BalanceSheetValidation {
  errors: BalanceSheetError[];
  warnings: BalanceSheetWarning[];
  recommendations: string[];
  overallScore: number; // 0-100
}

export interface BalanceSheetError {
  type: 'BALANCE_EQUATION' | 'NEGATIVE_ASSET' | 'MISSING_ACCOUNT' | 'CALCULATION_ERROR';
  message: string;
  affectedAccounts: string[];
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
}

export interface BalanceSheetWarning {
  type: 'UNUSUAL_BALANCE' | 'RATIO_CONCERN' | 'CASH_FLOW' | 'CLASSIFICATION';
  message: string;
  affectedAccounts: string[];
  recommendation: string;
}

export interface BalanceSheetRatios {
  liquidityRatios: {
    currentRatio: number;
    quickRatio: number;
    cashRatio: number;
    workingCapital: number;
  };
  leverageRatios: {
    debtToAssets: number;
    debtToEquity: number;
    equityRatio: number;
    timesInterestEarned?: number;
  };
  assetQualityRatios: {
    assetTurnover?: number;
    receivablesTurnover?: number;
    inventoryTurnover?: number;
    daysInReceivables?: number;
  };
}

export interface IndustryBenchmark {
  industryCode: string;
  industryName: string;
  benchmarks: {
    currentRatio: { min: number; max: number; median: number };
    debtToEquity: { min: number; max: number; median: number };
    assetComposition: {
      currentAssetsPercent: number;
      fixedAssetsPercent: number;
    };
  };
}

export class BalanceSheetService {
  private prisma: PrismaClient;
  private financialStatementsService: FinancialStatementsService;

  constructor(prisma: PrismaClient, financialStatementsService: FinancialStatementsService) {
    this.prisma = prisma;
    this.financialStatementsService = financialStatementsService;
  }

  /**
   * Generate comparative balance sheet with multiple periods
   */
  async generateComparativeBalanceSheet(
    organizationId: string,
    dates: Date[],
    includeAnalysis: boolean = true
  ): Promise<ComparativeBalanceSheet> {
    // Generate balance sheets for each date
    const periods: BalanceSheetPeriod[] = [];

    for (const date of dates.sort((a, b) => a.getTime() - b.getTime())) {
      const balanceSheet = await this.financialStatementsService.generateBalanceSheet(organizationId, date);
      periods.push({
        label: this.formatPeriodLabel(date),
        asOfDate: date,
        balanceSheet
      });
    }

    let analysis = {
      horizontalAnalysis: {} as HorizontalAnalysisData,
      verticalAnalysis: {} as VerticalAnalysisData,
      trends: [] as TrendAnalysis[]
    };

    if (includeAnalysis && periods.length >= 2) {
      analysis = await this.performBalanceSheetAnalysis(periods);
    }

    const validation = await this.validateBalanceSheet(periods[periods.length - 1].balanceSheet);

    return {
      organizationId,
      periods,
      analysis,
      validation
    };
  }

  /**
   * Perform horizontal analysis (period-to-period comparison)
   */
  async performHorizontalAnalysis(
    baseBalanceSheet: BalanceSheet,
    comparisonBalanceSheet: BalanceSheet
  ): Promise<HorizontalAnalysisData> {
    const changes: AccountChange[] = [];

    // Analyze all account categories
    const allBaseAccounts = [
      ...baseBalanceSheet.assets.currentAssets.accounts,
      ...baseBalanceSheet.assets.nonCurrentAssets.accounts,
      ...baseBalanceSheet.liabilities.currentLiabilities.accounts,
      ...baseBalanceSheet.liabilities.nonCurrentLiabilities.accounts,
      ...baseBalanceSheet.equity.equity.accounts
    ];

    const allComparisonAccounts = [
      ...comparisonBalanceSheet.assets.currentAssets.accounts,
      ...comparisonBalanceSheet.assets.nonCurrentAssets.accounts,
      ...comparisonBalanceSheet.liabilities.currentLiabilities.accounts,
      ...comparisonBalanceSheet.liabilities.nonCurrentLiabilities.accounts,
      ...comparisonBalanceSheet.equity.equity.accounts
    ];

    for (const baseAccount of allBaseAccounts) {
      const comparisonAccount = allComparisonAccounts.find(a => a.accountId === baseAccount.accountId);
      const comparisonAmount = comparisonAccount?.balance || 0;

      const dollarChange = comparisonAmount - baseAccount.balance;
      const percentChange = baseAccount.balance !== 0
        ? (dollarChange / Math.abs(baseAccount.balance)) * 100
        : 0;

      const isSignificant = Math.abs(percentChange) > 10 || Math.abs(dollarChange) > 1000;

      changes.push({
        accountId: baseAccount.accountId,
        accountNumber: baseAccount.accountNumber,
        accountName: baseAccount.accountName,
        accountType: this.getAccountType(baseAccount.accountNumber),
        baseAmount: baseAccount.balance,
        comparisonAmount,
        dollarChange,
        percentChange,
        isSignificant
      });
    }

    const significantChanges = changes.filter(c => c.isSignificant);

    return {
      baseDate: baseBalanceSheet.asOfDate,
      comparisonDate: comparisonBalanceSheet.asOfDate,
      changes,
      significantChanges
    };
  }

  /**
   * Perform vertical analysis (percentage of total)
   */
  performVerticalAnalysis(balanceSheet: BalanceSheet): VerticalAnalysisData {
    const totalAssets = balanceSheet.assets.totalAssets;

    const assetPercentages = this.calculateAccountPercentages(
      [...balanceSheet.assets.currentAssets.accounts, ...balanceSheet.assets.nonCurrentAssets.accounts],
      totalAssets,
      balanceSheet.assets.currentAssets.subtotal + balanceSheet.assets.nonCurrentAssets.subtotal
    );

    const liabilityPercentages = this.calculateAccountPercentages(
      [...balanceSheet.liabilities.currentLiabilities.accounts, ...balanceSheet.liabilities.nonCurrentLiabilities.accounts],
      totalAssets,
      balanceSheet.liabilities.totalLiabilities
    );

    const equityPercentages = this.calculateAccountPercentages(
      balanceSheet.equity.equity.accounts,
      totalAssets,
      balanceSheet.equity.totalEquity
    );

    return {
      asOfDate: balanceSheet.asOfDate,
      assetPercentages,
      liabilityPercentages,
      equityPercentages
    };
  }

  /**
   * Calculate detailed balance sheet ratios
   */
  calculateDetailedRatios(balanceSheet: BalanceSheet): BalanceSheetRatios {
    const currentAssets = balanceSheet.assets.currentAssets.subtotal;
    const totalAssets = balanceSheet.assets.totalAssets;
    const currentLiabilities = balanceSheet.liabilities.currentLiabilities.subtotal;
    const totalLiabilities = balanceSheet.liabilities.totalLiabilities;
    const totalEquity = balanceSheet.equity.totalEquity;

    // Find specific accounts
    const cash = this.findAccountBalance(balanceSheet, ['cash', 'checking', 'savings']);
    const receivables = this.findAccountBalance(balanceSheet, ['receivable']);
    const inventory = this.findAccountBalance(balanceSheet, ['inventory']);
    const quickAssets = cash + receivables;

    return {
      liquidityRatios: {
        currentRatio: currentLiabilities > 0 ? currentAssets / currentLiabilities : 0,
        quickRatio: currentLiabilities > 0 ? quickAssets / currentLiabilities : 0,
        cashRatio: currentLiabilities > 0 ? cash / currentLiabilities : 0,
        workingCapital: currentAssets - currentLiabilities
      },
      leverageRatios: {
        debtToAssets: totalAssets > 0 ? FinancialMath.toNumber(calculateRatio(totalLiabilities, totalAssets)) : 0,
        debtToEquity: totalEquity > 0 ? FinancialMath.toNumber(calculateRatio(totalLiabilities, totalEquity)) : 0,
        equityRatio: totalAssets > 0 ? FinancialMath.toNumber(calculateRatio(totalEquity, totalAssets)) : 0
      },
      assetQualityRatios: {
        // These would require additional period data for proper calculation
        daysInReceivables: undefined
      }
    };
  }

  /**
   * Validate balance sheet for errors and warnings
   */
  async validateBalanceSheet(balanceSheet: BalanceSheet): Promise<BalanceSheetValidation> {
    const errors: BalanceSheetError[] = [];
    const warnings: BalanceSheetWarning[] = [];
    const recommendations: string[] = [];

    // Check fundamental balance equation
    if (!balanceSheet.validation.balanceCheck) {
      errors.push({
        type: 'BALANCE_EQUATION',
        message: `Balance sheet does not balance. Difference: ${FinancialMath.toString(FinancialMath.toCurrency(balanceSheet.validation.difference))}`,
        affectedAccounts: [],
        severity: 'CRITICAL'
      });
    }

    // Check for negative asset balances
    const allAssets = [
      ...balanceSheet.assets.currentAssets.accounts,
      ...balanceSheet.assets.nonCurrentAssets.accounts
    ];

    const negativeAssets = allAssets.filter(account => account.balance < 0);
    if (negativeAssets.length > 0) {
      errors.push({
        type: 'NEGATIVE_ASSET',
        message: `${negativeAssets.length} asset accounts have negative balances`,
        affectedAccounts: negativeAssets.map(a => a.accountId),
        severity: 'HIGH'
      });
    }

    // Calculate ratios for warnings
    const ratios = this.calculateDetailedRatios(balanceSheet);

    // Liquidity warnings
    if (ratios.liquidityRatios.currentRatio < 1.0) {
      warnings.push({
        type: 'RATIO_CONCERN',
        message: `Current ratio (${FinancialMath.toString(FinancialMath.toCurrency(ratios.liquidityRatios.currentRatio))}) is below 1.0, indicating potential liquidity issues`,
        affectedAccounts: [],
        recommendation: 'Consider improving cash flow or reducing current liabilities'
      });
    }

    // High leverage warning
    if (ratios.leverageRatios.debtToEquity > 200) {
      warnings.push({
        type: 'RATIO_CONCERN',
        message: `Debt-to-equity ratio (${ratios.leverageRatios.debtToEquity.toFixed(1)}%) is very high`,
        affectedAccounts: [],
        recommendation: 'Consider reducing debt or increasing equity to improve financial stability'
      });
    }

    // Low cash warning
    const cash = this.findAccountBalance(balanceSheet, ['cash', 'checking', 'savings']);
    const monthlyExpenses = balanceSheet.assets.totalAssets * 0.05; // Rough estimate
    if (cash < monthlyExpenses) {
      warnings.push({
        type: 'CASH_FLOW',
        message: 'Cash balance appears low relative to business size',
        affectedAccounts: [],
        recommendation: 'Maintain adequate cash reserves for operational needs'
      });
    }

    // Generate recommendations
    if (ratios.liquidityRatios.currentRatio > 1.5) {
      recommendations.push('Strong liquidity position - consider investing excess cash');
    }

    if (ratios.leverageRatios.debtToAssets < 30) {
      recommendations.push('Conservative debt levels - may consider leveraging for growth');
    }

    // Calculate overall score
    let score = 100;
    score -= errors.length * 20; // Critical errors heavily penalized
    score -= warnings.length * 5; // Warnings moderately penalized
    score = Math.max(0, Math.min(100, score));

    return {
      errors,
      warnings,
      recommendations,
      overallScore: score
    };
  }

  /**
   * Export balance sheet to various formats
   */
  async exportBalanceSheet(
    balanceSheet: BalanceSheet,
    format: 'PDF' | 'CSV' | 'EXCEL' | 'JSON'
  ): Promise<{
    filename: string;
    content: string;
    mimeType: string;
  }> {
    const timestamp = balanceSheet.asOfDate.toISOString().split('T')[0];

    switch (format) {
      case 'CSV':
        return {
          filename: `balance_sheet_${timestamp}.csv`,
          content: this.formatBalanceSheetAsCSV(balanceSheet),
          mimeType: 'text/csv'
        };

      case 'JSON':
        return {
          filename: `balance_sheet_${timestamp}.json`,
          content: JSON.stringify(balanceSheet, null, 2),
          mimeType: 'application/json'
        };

      case 'PDF':
      case 'EXCEL':
        throw new Error(`${format} export not yet implemented`);

      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  // Private helper methods

  private async performBalanceSheetAnalysis(periods: BalanceSheetPeriod[]): Promise<{
    horizontalAnalysis: HorizontalAnalysisData;
    verticalAnalysis: VerticalAnalysisData;
    trends: TrendAnalysis[];
  }> {
    const latestPeriod = periods[periods.length - 1];
    const previousPeriod = periods[periods.length - 2];

    const horizontalAnalysis = await this.performHorizontalAnalysis(
      previousPeriod.balanceSheet,
      latestPeriod.balanceSheet
    );

    const verticalAnalysis = this.performVerticalAnalysis(latestPeriod.balanceSheet);

    const trends = this.calculateTrends(periods);

    return {
      horizontalAnalysis,
      verticalAnalysis,
      trends
    };
  }

  private calculateTrends(periods: BalanceSheetPeriod[]): TrendAnalysis[] {
    if (periods.length < 3) return [];

    const trends: TrendAnalysis[] = [];
    const allAccounts = new Set<string>();

    // Collect all unique account IDs
    periods.forEach(period => {
      const accounts = [
        ...period.balanceSheet.assets.currentAssets.accounts,
        ...period.balanceSheet.assets.nonCurrentAssets.accounts,
        ...period.balanceSheet.liabilities.currentLiabilities.accounts,
        ...period.balanceSheet.liabilities.nonCurrentLiabilities.accounts,
        ...period.balanceSheet.equity.equity.accounts
      ];
      accounts.forEach(account => allAccounts.add(account.accountId));
    });

    // Calculate trends for each account
    allAccounts.forEach(accountId => {
      const accountData = periods.map(period => {
        const allPeriodAccounts = [
          ...period.balanceSheet.assets.currentAssets.accounts,
          ...period.balanceSheet.assets.nonCurrentAssets.accounts,
          ...period.balanceSheet.liabilities.currentLiabilities.accounts,
          ...period.balanceSheet.liabilities.nonCurrentLiabilities.accounts,
          ...period.balanceSheet.equity.equity.accounts
        ];
        return allPeriodAccounts.find(a => a.accountId === accountId);
      });

      const firstAccount = accountData.find(a => a);
      if (!firstAccount) return;

      const balances = accountData.map(account => account?.balance || 0);
      const changes = this.calculatePeriodicChanges(balances);

      if (changes.length > 0) {
        const trend = this.determineTrend(changes);
        const volatility = this.calculateVolatility(changes);
        const averageChange = changes.reduce((sum, change) => sum + change, 0) / changes.length;

        trends.push({
          accountId,
          accountNumber: firstAccount.accountNumber,
          accountName: firstAccount.accountName,
          trend,
          trendStrength: this.calculateTrendStrength(changes),
          periodicChanges: changes,
          averageChange,
          volatility
        });
      }
    });

    return trends;
  }

  private calculatePeriodicChanges(balances: number[]): number[] {
    const changes: number[] = [];
    for (let i = 1; i < balances.length; i++) {
      const change = balances[i-1] !== 0
        ? ((balances[i] - balances[i-1]) / Math.abs(balances[i-1])) * 100
        : 0;
      changes.push(change);
    }
    return changes;
  }

  private determineTrend(changes: number[]): 'INCREASING' | 'DECREASING' | 'STABLE' | 'VOLATILE' {
    const avgChange = changes.reduce((sum, change) => sum + change, 0) / changes.length;
    const volatility = this.calculateVolatility(changes);

    if (volatility > 20) return 'VOLATILE';
    if (avgChange > 5) return 'INCREASING';
    if (avgChange < -5) return 'DECREASING';
    return 'STABLE';
  }

  private calculateVolatility(changes: number[]): number {
    const mean = changes.reduce((sum, change) => sum + change, 0) / changes.length;
    const variance = changes.reduce((sum, change) => sum + Math.pow(change - mean, 2), 0) / changes.length;
    return Math.sqrt(variance);
  }

  private calculateTrendStrength(changes: number[]): number {
    const consistentDirection = changes.filter((change, i) =>
      i === 0 || (change >= 0 && changes[i-1] >= 0) || (change < 0 && changes[i-1] < 0)
    ).length;
    return FinancialMath.toNumber(calculateRatio(consistentDirection, changes.length));
  }

  private calculateAccountPercentages(
    accounts: BalanceSheetAccount[],
    totalAssets: number,
    categoryTotal: number
  ): AccountPercentage[] {
    return accounts.map(account => ({
      accountId: account.accountId,
      accountNumber: account.accountNumber,
      accountName: account.accountName,
      amount: account.balance,
      percentOfCategory: categoryTotal > 0 ? FinancialMath.toNumber(calculateRatio(account.balance, categoryTotal)) : 0,
      percentOfTotal: totalAssets > 0 ? FinancialMath.toNumber(calculateRatio(account.balance, totalAssets)) : 0
    }));
  }

  private findAccountBalance(balanceSheet: BalanceSheet, searchTerms: string[]): number {
    const allAccounts = [
      ...balanceSheet.assets.currentAssets.accounts,
      ...balanceSheet.assets.nonCurrentAssets.accounts,
      ...balanceSheet.liabilities.currentLiabilities.accounts,
      ...balanceSheet.liabilities.nonCurrentLiabilities.accounts,
      ...balanceSheet.equity.equity.accounts
    ];

    const matchingAccounts = allAccounts.filter(account =>
      searchTerms.some(term =>
        account.accountName.toLowerCase().includes(term.toLowerCase())
      )
    );

    return matchingAccounts.reduce((sum, account) => sum + account.balance, 0);
  }

  private getAccountType(accountNumber: string): AccountType {
    const firstDigit = accountNumber.charAt(0);
    switch (firstDigit) {
      case '1': return AccountType.ASSET;
      case '2': return AccountType.LIABILITY;
      case '3': return AccountType.EQUITY;
      case '4': return AccountType.REVENUE;
      case '5':
      case '6': return AccountType.EXPENSE;
      default: return AccountType.ASSET;
    }
  }

  private formatPeriodLabel(date: Date): string {
    return `As of ${date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })}`;
  }

  private formatBalanceSheetAsCSV(balanceSheet: BalanceSheet): string {
    const lines: string[] = [];

    // Header
    lines.push(`Balance Sheet as of ${balanceSheet.asOfDate.toLocaleDateString()}`);
    lines.push('');

    // Assets
    lines.push('ASSETS');
    lines.push('Current Assets');
    balanceSheet.assets.currentAssets.accounts.forEach(account => {
      lines.push(`${account.accountNumber},${account.accountName},${FinancialMath.toString(FinancialMath.toCurrency(account.balance))}`);
    });
    lines.push(`Total Current Assets,,${FinancialMath.toString(FinancialMath.toCurrency(balanceSheet.assets.currentAssets.subtotal))}`);
    lines.push('');

    lines.push('Non-Current Assets');
    balanceSheet.assets.nonCurrentAssets.accounts.forEach(account => {
      lines.push(`${account.accountNumber},${account.accountName},${FinancialMath.toString(FinancialMath.toCurrency(account.balance))}`);
    });
    lines.push(`Total Non-Current Assets,,${FinancialMath.toString(FinancialMath.toCurrency(balanceSheet.assets.nonCurrentAssets.subtotal))}`);
    lines.push(`TOTAL ASSETS,,${FinancialMath.toString(FinancialMath.toCurrency(balanceSheet.assets.totalAssets))}`);
    lines.push('');

    // Liabilities
    lines.push('LIABILITIES');
    lines.push('Current Liabilities');
    balanceSheet.liabilities.currentLiabilities.accounts.forEach(account => {
      lines.push(`${account.accountNumber},${account.accountName},${FinancialMath.toString(FinancialMath.toCurrency(account.balance))}`);
    });
    lines.push(`Total Current Liabilities,,${FinancialMath.toString(FinancialMath.toCurrency(balanceSheet.liabilities.currentLiabilities.subtotal))}`);
    lines.push('');

    lines.push('Non-Current Liabilities');
    balanceSheet.liabilities.nonCurrentLiabilities.accounts.forEach(account => {
      lines.push(`${account.accountNumber},${account.accountName},${FinancialMath.toString(FinancialMath.toCurrency(account.balance))}`);
    });
    lines.push(`Total Non-Current Liabilities,,${FinancialMath.toString(FinancialMath.toCurrency(balanceSheet.liabilities.nonCurrentLiabilities.subtotal))}`);
    lines.push(`TOTAL LIABILITIES,,${FinancialMath.toString(FinancialMath.toCurrency(balanceSheet.liabilities.totalLiabilities))}`);
    lines.push('');

    // Equity
    lines.push('EQUITY');
    balanceSheet.equity.equity.accounts.forEach(account => {
      lines.push(`${account.accountNumber},${account.accountName},${FinancialMath.toString(FinancialMath.toCurrency(account.balance))}`);
    });
    lines.push(`TOTAL EQUITY,,${FinancialMath.toString(FinancialMath.toCurrency(balanceSheet.equity.totalEquity))}`);
    lines.push('');

    lines.push(`TOTAL LIABILITIES AND EQUITY,,${FinancialMath.toString(FinancialMath.toCurrency(balanceSheet.liabilities.totalLiabilities + balanceSheet.equity.totalEquity))}`);

    return lines.join('\n');
  }
}