import { PrismaClient, Account } from '@prisma/client';
import { AccountType } from '../types/enums';
import { JournalService } from './journal.service';
import { ReportingService } from './reporting.service';

import { FinancialMath, calculateRatio } from '../utils/financial';
export interface FinancialStatementPeriod {
  startDate: Date;
  endDate: Date;
  label: string; // e.g., "Year Ended December 31, 2024"
}

export interface BalanceSheet {
  organizationId: string;
  asOfDate: Date;
  generatedAt: Date;
  currency: string;
  assets: {
    currentAssets: BalanceSheetSection;
    nonCurrentAssets: BalanceSheetSection;
    totalAssets: number;
  };
  liabilities: {
    currentLiabilities: BalanceSheetSection;
    nonCurrentLiabilities: BalanceSheetSection;
    totalLiabilities: number;
  };
  equity: {
    equity: BalanceSheetSection;
    totalEquity: number;
  };
  validation: {
    balanceCheck: boolean;
    difference: number;
  };
}

export interface IncomeStatement {
  organizationId: string;
  period: FinancialStatementPeriod;
  generatedAt: Date;
  currency: string;
  revenue: {
    operatingRevenue: IncomeStatementSection;
    otherRevenue: IncomeStatementSection;
    totalRevenue: number;
  };
  expenses: {
    costOfGoodsSold: IncomeStatementSection;
    operatingExpenses: IncomeStatementSection;
    otherExpenses: IncomeStatementSection;
    totalExpenses: number;
  };
  profitability: {
    grossProfit: number;
    operatingIncome: number;
    netIncome: number;
    grossMargin: number;
    operatingMargin: number;
    netMargin: number;
  };
}

export interface CashFlowStatement {
  organizationId: string;
  period: FinancialStatementPeriod;
  generatedAt: Date;
  currency: string;
  operatingActivities: {
    netIncome: number;
    adjustments: CashFlowSection;
    workingCapitalChanges: CashFlowSection;
    netCashFromOperating: number;
  };
  investingActivities: {
    activities: CashFlowSection;
    netCashFromInvesting: number;
  };
  financingActivities: {
    activities: CashFlowSection;
    netCashFromFinancing: number;
  };
  summary: {
    netCashChange: number;
    beginningCash: number;
    endingCash: number;
  };
}

export interface BalanceSheetSection {
  name: string;
  accounts: BalanceSheetAccount[];
  subtotal: number;
}

export interface IncomeStatementSection {
  name: string;
  accounts: IncomeStatementAccount[];
  subtotal: number;
}

export interface CashFlowSection {
  name: string;
  items: CashFlowItem[];
  subtotal: number;
}

// Extended Account interface with balance information
export interface AccountWithBalance {
  id: string;
  organizationId: string;
  accountNumber: string;
  name: string;
  type: string;
  parentId?: string;
  description?: string;
  isActive: boolean;
  isSystemAccount: boolean;
  balance: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

export interface BalanceSheetAccount {
  accountId: string;
  accountNumber: string;
  accountName: string;
  balance: number;
  percentOfTotal?: number;
}

export interface IncomeStatementAccount {
  accountId: string;
  accountNumber: string;
  accountName: string;
  amount: number;
  percentOfRevenue?: number;
}

export interface CashFlowItem {
  description: string;
  amount: number;
  source?: string; // Reference to source transaction or calculation
}

export interface FinancialRatios {
  liquidity: {
    currentRatio: number;
    quickRatio: number;
    cashRatio: number;
  };
  profitability: {
    grossMargin: number;
    operatingMargin: number;
    netMargin: number;
    returnOnAssets: number;
    returnOnEquity: number;
  };
  leverage: {
    debtToAssets: number;
    debtToEquity: number;
    equityRatio: number;
  };
  efficiency: {
    assetTurnover: number;
    receivablesTurnover: number;
    inventoryTurnover: number;
  };
}

export class FinancialStatementsService {
  private prisma: PrismaClient;
  private journalService: JournalService;
  private reportingService: ReportingService;

  constructor(
    prisma: PrismaClient,
    journalService: JournalService,
    reportingService: ReportingService
  ) {
    this.prisma = prisma;
    this.journalService = journalService;
    this.reportingService = reportingService;
  }

  /**
   * Generate complete set of financial statements
   */
  async generateFinancialStatements(
    organizationId: string,
    period: FinancialStatementPeriod
  ): Promise<{
    balanceSheet: BalanceSheet;
    incomeStatement: IncomeStatement;
    cashFlowStatement: CashFlowStatement;
    ratios: FinancialRatios;
  }> {
    const [balanceSheet, incomeStatement, cashFlowStatement] = await Promise.all([
      this.generateBalanceSheet(organizationId, period.endDate),
      this.generateIncomeStatement(organizationId, period),
      this.generateCashFlowStatement(organizationId, period)
    ]);

    const ratios = this.calculateFinancialRatios(balanceSheet, incomeStatement);

    return {
      balanceSheet,
      incomeStatement,
      cashFlowStatement,
      ratios
    };
  }

  /**
   * Generate Balance Sheet
   */
  async generateBalanceSheet(
    organizationId: string,
    asOfDate: Date
  ): Promise<BalanceSheet> {
    // Get all accounts with their balances
    const accounts = await this.getAccountsWithBalances(organizationId, asOfDate);

    // Organize accounts by type and classification
    const assets = this.organizeAssets(accounts.filter(a => a.type === AccountType.ASSET));
    const liabilities = this.organizeLiabilities(accounts.filter(a => a.type === AccountType.LIABILITY));
    const equity = this.organizeEquity(accounts.filter(a => a.type === AccountType.EQUITY));

    const totalAssets = assets.currentAssets.subtotal + assets.nonCurrentAssets.subtotal;
    const totalLiabilities = liabilities.currentLiabilities.subtotal + liabilities.nonCurrentLiabilities.subtotal;
    const totalEquity = equity.equity.subtotal;

    // Validate balance sheet equation
    const difference = Math.abs(totalAssets - (totalLiabilities + totalEquity));
    const balanceCheck = difference < 0.01;

    return {
      organizationId,
      asOfDate,
      generatedAt: new Date(),
      currency: 'CAD', // Would get from organization settings
      assets: {
        currentAssets: assets.currentAssets,
        nonCurrentAssets: assets.nonCurrentAssets,
        totalAssets
      },
      liabilities: {
        currentLiabilities: liabilities.currentLiabilities,
        nonCurrentLiabilities: liabilities.nonCurrentLiabilities,
        totalLiabilities
      },
      equity: {
        equity: equity.equity,
        totalEquity
      },
      validation: {
        balanceCheck,
        difference
      }
    };
  }

  /**
   * Generate Income Statement
   */
  async generateIncomeStatement(
    organizationId: string,
    period: FinancialStatementPeriod
  ): Promise<IncomeStatement> {
    // Get revenue and expense accounts with period activity
    const accounts = await this.getAccountsWithPeriodActivity(
      organizationId,
      period.startDate,
      period.endDate
    );

    const revenueAccounts = accounts.filter(a => a.type === AccountType.REVENUE);
    const expenseAccounts = accounts.filter(a => a.type === AccountType.EXPENSE);

    // Organize revenue
    const revenue = this.organizeRevenue(revenueAccounts);
    const totalRevenue = revenue.operatingRevenue.subtotal + revenue.otherRevenue.subtotal;

    // Organize expenses
    const expenses = this.organizeExpenses(expenseAccounts);
    const totalExpenses = expenses.costOfGoodsSold.subtotal +
                         expenses.operatingExpenses.subtotal +
                         expenses.otherExpenses.subtotal;

    // Calculate profitability metrics
    const grossProfit = totalRevenue - expenses.costOfGoodsSold.subtotal;
    const operatingIncome = grossProfit - expenses.operatingExpenses.subtotal;
    const netIncome = operatingIncome - expenses.otherExpenses.subtotal;

    const grossMargin = totalRevenue > 0 ? FinancialMath.toNumber(calculateRatio(grossProfit, totalRevenue)) : 0;
    const operatingMargin = totalRevenue > 0 ? FinancialMath.toNumber(calculateRatio(operatingIncome, totalRevenue)) : 0;
    const netMargin = totalRevenue > 0 ? FinancialMath.toNumber(calculateRatio(netIncome, totalRevenue)) : 0;

    return {
      organizationId,
      period,
      generatedAt: new Date(),
      currency: 'CAD',
      revenue,
      expenses,
      profitability: {
        grossProfit,
        operatingIncome,
        netIncome,
        grossMargin,
        operatingMargin,
        netMargin
      }
    };
  }

  /**
   * Generate Cash Flow Statement
   */
  async generateCashFlowStatement(
    organizationId: string,
    period: FinancialStatementPeriod
  ): Promise<CashFlowStatement> {
    // Get net income from income statement
    const incomeStatement = await this.generateIncomeStatement(organizationId, period);
    const netIncome = incomeStatement.profitability.netIncome;

    // Get cash account balances
    const beginningCash = await this.getCashBalance(organizationId, period.startDate);
    const endingCash = await this.getCashBalance(organizationId, period.endDate);

    // Calculate operating activities
    const operatingActivities = await this.calculateOperatingCashFlow(
      organizationId,
      period,
      netIncome
    );

    // Calculate investing activities
    const investingActivities = await this.calculateInvestingCashFlow(
      organizationId,
      period
    );

    // Calculate financing activities
    const financingActivities = await this.calculateFinancingCashFlow(
      organizationId,
      period
    );

    const netCashChange = operatingActivities.netCashFromOperating +
                         investingActivities.netCashFromInvesting +
                         financingActivities.netCashFromFinancing;

    return {
      organizationId,
      period,
      generatedAt: new Date(),
      currency: 'CAD',
      operatingActivities,
      investingActivities,
      financingActivities,
      summary: {
        netCashChange,
        beginningCash,
        endingCash
      }
    };
  }

  /**
   * Calculate financial ratios
   */
  calculateFinancialRatios(
    balanceSheet: BalanceSheet,
    incomeStatement: IncomeStatement
  ): FinancialRatios {
    const { assets, liabilities, equity } = balanceSheet;
    const { revenue, profitability } = incomeStatement;

    // Get specific account balances for ratio calculations
    const currentAssets = assets.currentAssets.subtotal;
    const totalAssets = assets.totalAssets;
    const currentLiabilities = liabilities.currentLiabilities.subtotal;
    const totalLiabilities = liabilities.totalLiabilities;
    const totalEquity = equity.totalEquity;
    const totalRevenue = revenue.totalRevenue;

    // Find specific accounts for detailed ratios
    const cashAccounts = assets.currentAssets.accounts.filter(a =>
      a.accountName.toLowerCase().includes('cash') ||
      a.accountName.toLowerCase().includes('checking') ||
      a.accountName.toLowerCase().includes('savings')
    );
    const cash = cashAccounts.reduce((sum, acc) => sum + acc.balance, 0);

    const receivablesAccounts = assets.currentAssets.accounts.filter(a =>
      a.accountName.toLowerCase().includes('receivable')
    );
    const receivables = receivablesAccounts.reduce((sum, acc) => sum + acc.balance, 0);

    const inventoryAccounts = assets.currentAssets.accounts.filter(a =>
      a.accountName.toLowerCase().includes('inventory')
    );
    const inventory = inventoryAccounts.reduce((sum, acc) => sum + acc.balance, 0);

    // Calculate ratios
    const currentRatio = currentLiabilities > 0 ? currentAssets / currentLiabilities : 0;
    const quickRatio = currentLiabilities > 0 ? (currentAssets - inventory) / currentLiabilities : 0;
    const cashRatio = currentLiabilities > 0 ? cash / currentLiabilities : 0;

    const grossMargin = profitability.grossMargin;
    const operatingMargin = profitability.operatingMargin;
    const netMargin = profitability.netMargin;
    const returnOnAssets = totalAssets > 0 ? FinancialMath.toNumber(calculateRatio(profitability.netIncome, totalAssets)) : 0;
    const returnOnEquity = totalEquity > 0 ? FinancialMath.toNumber(calculateRatio(profitability.netIncome, totalEquity)) : 0;

    const debtToAssets = totalAssets > 0 ? FinancialMath.toNumber(calculateRatio(totalLiabilities, totalAssets)) : 0;
    const debtToEquity = totalEquity > 0 ? FinancialMath.toNumber(calculateRatio(totalLiabilities, totalEquity)) : 0;
    const equityRatio = totalAssets > 0 ? FinancialMath.toNumber(calculateRatio(totalEquity, totalAssets)) : 0;

    const assetTurnover = totalAssets > 0 ? totalRevenue / totalAssets : 0;
    const receivablesTurnover = receivables > 0 ? totalRevenue / receivables : 0;
    const inventoryTurnover = inventory > 0 ? profitability.grossProfit / inventory : 0;

    return {
      liquidity: {
        currentRatio,
        quickRatio,
        cashRatio
      },
      profitability: {
        grossMargin,
        operatingMargin,
        netMargin,
        returnOnAssets,
        returnOnEquity
      },
      leverage: {
        debtToAssets,
        debtToEquity,
        equityRatio
      },
      efficiency: {
        assetTurnover,
        receivablesTurnover,
        inventoryTurnover
      }
    };
  }

  // Private helper methods

  private async getAccountsWithBalances(
    organizationId: string,
    asOfDate: Date
  ): Promise<Array<Account & { periodActivity: number }>> {
    const accounts = await this.prisma.account.findMany({
      where: {
        organizationId,
        deletedAt: null
      },
      include: {
        transactions: {
          where: {
            entryDate: { lte: asOfDate }
          }
        }
      }
    });

    return accounts.map(account => ({
      ...account,
      periodActivity: 0 // Would calculate period activity if needed
    }));
  }

  private async getAccountsWithPeriodActivity(
    organizationId: string,
    startDate: Date,
    endDate: Date
  ): Promise<Array<Account & { periodActivity: number }>> {
    const accounts = await this.prisma.account.findMany({
      where: {
        organizationId,
        deletedAt: null
      },
      include: {
        transactions: {
          where: {
            entryDate: {
              gte: startDate,
              lte: endDate
            }
          }
        }
      }
    });

    return accounts.map(account => ({
      ...account,
      periodActivity: account.transactions.reduce((sum, txn) => {
        const amount = Number(txn.amount);
        return txn.type === 'DEBIT' ? sum + amount : sum - amount;
      }, 0)
    }));
  }

  private organizeAssets(assetAccounts: AccountWithBalance[]): {
    currentAssets: BalanceSheetSection;
    nonCurrentAssets: BalanceSheetSection;
  } {
    const currentAssetNames = ['cash', 'checking', 'savings', 'receivable', 'inventory', 'prepaid'];

    const currentAssets = assetAccounts.filter(account =>
      currentAssetNames.some(name =>
        account.name.toLowerCase().includes(name) ||
        account.accountNumber.startsWith('11') ||
        account.accountNumber.startsWith('12')
      )
    );

    const nonCurrentAssets = assetAccounts.filter(account =>
      !currentAssets.includes(account)
    );

    return {
      currentAssets: this.createBalanceSheetSection('Current Assets', currentAssets),
      nonCurrentAssets: this.createBalanceSheetSection('Non-Current Assets', nonCurrentAssets)
    };
  }

  private organizeLiabilities(liabilityAccounts: AccountWithBalance[]): {
    currentLiabilities: BalanceSheetSection;
    nonCurrentLiabilities: BalanceSheetSection;
  } {
    const currentLiabilityNames = ['payable', 'accrued', 'tax payable', 'short-term'];

    const currentLiabilities = liabilityAccounts.filter(account =>
      currentLiabilityNames.some(name =>
        account.name.toLowerCase().includes(name) ||
        account.accountNumber.startsWith('20') ||
        account.accountNumber.startsWith('21')
      )
    );

    const nonCurrentLiabilities = liabilityAccounts.filter(account =>
      !currentLiabilities.includes(account)
    );

    return {
      currentLiabilities: this.createBalanceSheetSection('Current Liabilities', currentLiabilities),
      nonCurrentLiabilities: this.createBalanceSheetSection('Non-Current Liabilities', nonCurrentLiabilities)
    };
  }

  private organizeEquity(equityAccounts: AccountWithBalance[]): {
    equity: BalanceSheetSection;
  } {
    return {
      equity: this.createBalanceSheetSection('Owner\'s Equity', equityAccounts)
    };
  }

  private organizeRevenue(revenueAccounts: AccountWithBalance[]): {
    operatingRevenue: IncomeStatementSection;
    otherRevenue: IncomeStatementSection;
    totalRevenue: number;
  } {
    const operatingRevenue = revenueAccounts.filter(account =>
      !account.name.toLowerCase().includes('other') &&
      !account.name.toLowerCase().includes('miscellaneous')
    );

    const otherRevenue = revenueAccounts.filter(account =>
      account.name.toLowerCase().includes('other') ||
      account.name.toLowerCase().includes('miscellaneous')
    );

    const opRevSection = this.createIncomeStatementSection('Operating Revenue', operatingRevenue);
    const otherRevSection = this.createIncomeStatementSection('Other Revenue', otherRevenue);

    return {
      operatingRevenue: opRevSection,
      otherRevenue: otherRevSection,
      totalRevenue: opRevSection.subtotal + otherRevSection.subtotal
    };
  }

  private organizeExpenses(expenseAccounts: AccountWithBalance[]): {
    costOfGoodsSold: IncomeStatementSection;
    operatingExpenses: IncomeStatementSection;
    otherExpenses: IncomeStatementSection;
    totalExpenses: number;
  } {
    const cogs = expenseAccounts.filter(account =>
      account.name.toLowerCase().includes('cost of') ||
      account.accountNumber.startsWith('50')
    );

    const otherExpenses = expenseAccounts.filter(account =>
      account.name.toLowerCase().includes('interest') ||
      account.name.toLowerCase().includes('other') ||
      account.name.toLowerCase().includes('miscellaneous')
    );

    const operatingExpenses = expenseAccounts.filter(account =>
      !cogs.includes(account) && !otherExpenses.includes(account)
    );

    const cogsSection = this.createIncomeStatementSection('Cost of Goods Sold', cogs);
    const opExpSection = this.createIncomeStatementSection('Operating Expenses', operatingExpenses);
    const otherExpSection = this.createIncomeStatementSection('Other Expenses', otherExpenses);

    return {
      costOfGoodsSold: cogsSection,
      operatingExpenses: opExpSection,
      otherExpenses: otherExpSection,
      totalExpenses: cogsSection.subtotal + opExpSection.subtotal + otherExpSection.subtotal
    };
  }

  private createBalanceSheetSection(name: string, accounts: AccountWithBalance[]): BalanceSheetSection {
    const sectionAccounts: BalanceSheetAccount[] = accounts
      .filter(account => Math.abs(Number(account.balance)) > 0.01)
      .map(account => ({
        accountId: account.id,
        accountNumber: account.accountNumber,
        accountName: account.name,
        balance: Number(account.balance)
      }));

    const subtotal = sectionAccounts.reduce((sum, acc) => sum + acc.balance, 0);

    return {
      name,
      accounts: sectionAccounts,
      subtotal
    };
  }

  private createIncomeStatementSection(name: string, accounts: AccountWithBalance[]): IncomeStatementSection {
    const sectionAccounts: IncomeStatementAccount[] = accounts
      .filter(account => Math.abs(account.periodActivity || Number(account.balance)) > 0.01)
      .map(account => ({
        accountId: account.id,
        accountNumber: account.accountNumber,
        accountName: account.name,
        amount: account.periodActivity || Number(account.balance)
      }));

    const subtotal = sectionAccounts.reduce((sum, acc) => sum + acc.amount, 0);

    return {
      name,
      accounts: sectionAccounts,
      subtotal
    };
  }

  private async getCashBalance(organizationId: string, date: Date): Promise<number> {
    const cashAccounts = await this.prisma.account.findMany({
      where: {
        organizationId,
        OR: [
          { name: { contains: 'cash', mode: 'insensitive' } },
          { name: { contains: 'checking', mode: 'insensitive' } },
          { name: { contains: 'savings', mode: 'insensitive' } },
          { accountNumber: { startsWith: '101' } }
        ],
        deletedAt: null
      }
    });

    return cashAccounts.reduce((sum, account) => sum + Number(account.balance), 0);
  }

  private async calculateOperatingCashFlow(
    organizationId: string,
    period: FinancialStatementPeriod,
    netIncome: number
  ): Promise<any> {
    // Simplified operating cash flow calculation
    // In practice, this would be much more detailed

    const adjustments: CashFlowItem[] = [
      { description: 'Depreciation and amortization', amount: 0 }
    ];

    const workingCapitalChanges: CashFlowItem[] = [
      { description: 'Change in accounts receivable', amount: 0 },
      { description: 'Change in inventory', amount: 0 },
      { description: 'Change in accounts payable', amount: 0 }
    ];

    return {
      netIncome,
      adjustments: { name: 'Non-cash adjustments', items: adjustments, subtotal: 0 },
      workingCapitalChanges: { name: 'Working capital changes', items: workingCapitalChanges, subtotal: 0 },
      netCashFromOperating: netIncome
    };
  }

  private async calculateInvestingCashFlow(
    organizationId: string,
    period: FinancialStatementPeriod
  ): Promise<any> {
    const activities: CashFlowItem[] = [
      { description: 'Purchase of equipment', amount: 0 },
      { description: 'Sale of equipment', amount: 0 }
    ];

    return {
      activities: { name: 'Investing activities', items: activities, subtotal: 0 },
      netCashFromInvesting: 0
    };
  }

  private async calculateFinancingCashFlow(
    organizationId: string,
    period: FinancialStatementPeriod
  ): Promise<any> {
    const activities: CashFlowItem[] = [
      { description: 'Owner contributions', amount: 0 },
      { description: 'Owner withdrawals', amount: 0 },
      { description: 'Loan proceeds', amount: 0 },
      { description: 'Loan payments', amount: 0 }
    ];

    return {
      activities: { name: 'Financing activities', items: activities, subtotal: 0 },
      netCashFromFinancing: 0
    };
  }
}