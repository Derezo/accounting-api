import { PrismaClient, Account } from '@prisma/client';
import { AccountType, TransactionType } from '../types/enums';
import { JournalService } from './journal.service';

export interface TrialBalanceReport {
  organizationId: string;
  asOfDate: Date;
  generatedAt: Date;
  periodStartDate: Date;
  summary: {
    totalDebits: number;
    totalCredits: number;
    difference: number;
    isBalanced: boolean;
    accountCount: number;
    transactionCount: number;
  };
  accounts: TrialBalanceAccountEntry[];
  validation: {
    errors: string[];
    warnings: string[];
    recommendations: string[];
  };
}

export interface TrialBalanceAccountEntry {
  accountId: string;
  accountNumber: string;
  accountName: string;
  accountType: AccountType;
  parentAccountId?: string;
  parentAccountNumber?: string;
  level: number; // Hierarchy level (0 = root, 1 = child, etc.)
  debitBalance: number;
  creditBalance: number;
  netBalance: number;
  normalBalance: 'DEBIT' | 'CREDIT';
  isBalanceNormal: boolean;
  transactionCount: number;
  lastTransactionDate?: Date;
  yearToDateActivity: {
    debits: number;
    credits: number;
    netChange: number;
  };
}

export interface AccountingPeriodSummary {
  startDate: Date;
  endDate: Date;
  totalRevenue: number;
  totalExpenses: number;
  netIncome: number;
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  cashFlow: {
    operating: number;
    investing: number;
    financing: number;
    net: number;
  };
}

export interface TrialBalanceComparison {
  currentPeriod: TrialBalanceReport;
  previousPeriod?: TrialBalanceReport;
  comparison: {
    accountChanges: Array<{
      accountId: string;
      accountNumber: string;
      accountName: string;
      currentBalance: number;
      previousBalance: number;
      change: number;
      changePercent: number;
    }>;
    significantChanges: Array<{
      accountId: string;
      accountNumber: string;
      accountName: string;
      change: number;
      changePercent: number;
      reason?: string;
    }>;
  };
}

export class ReportingService {
  private prisma: PrismaClient;
  private journalService: JournalService;

  constructor(prisma: PrismaClient, journalService: JournalService) {
    this.prisma = prisma;
    this.journalService = journalService;
  }

  /**
   * Generate comprehensive trial balance report
   */
  async generateTrialBalanceReport(
    organizationId: string,
    asOfDate: Date = new Date(),
    periodStartDate?: Date
  ): Promise<TrialBalanceReport> {
    const startOfYear = periodStartDate || new Date(asOfDate.getFullYear(), 0, 1);

    // Get accounts with their transaction history
    const accounts = await this.prisma.account.findMany({
      where: {
        organizationId,
        deletedAt: null
      },
      include: {
        parent: true,
        transactions: {
          where: {
            entryDate: {
              lte: asOfDate
            }
          },
          orderBy: {
            entryDate: 'desc'
          }
        }
      },
      orderBy: [
        { type: 'asc' },
        { accountNumber: 'asc' }
      ]
    });

    // Calculate account balances and activity
    const accountEntries: TrialBalanceAccountEntry[] = [];
    let totalDebits = 0;
    let totalCredits = 0;
    let totalTransactions = 0;

    for (const account of accounts) {
      const entry = await this.calculateAccountEntry(account, asOfDate, startOfYear);

      if (Math.abs(entry.netBalance) > 0.01) { // Only include accounts with balances
        accountEntries.push(entry);

        // Add to totals based on normal balance
        if (entry.isBalanceNormal && entry.netBalance > 0) {
          if (entry.normalBalance === 'DEBIT') {
            totalDebits += entry.netBalance;
          } else {
            totalCredits += entry.netBalance;
          }
        } else if (!entry.isBalanceNormal && entry.netBalance < 0) {
          // Abnormal balances
          if (entry.normalBalance === 'DEBIT') {
            totalCredits += Math.abs(entry.netBalance);
          } else {
            totalDebits += Math.abs(entry.netBalance);
          }
        }

        totalTransactions += entry.transactionCount;
      }
    }

    // Validate trial balance
    const validation = await this.validateTrialBalance(organizationId, accountEntries, asOfDate);

    const difference = Math.abs(totalDebits - totalCredits);
    const isBalanced = difference < 0.01;

    return {
      organizationId,
      asOfDate,
      generatedAt: new Date(),
      periodStartDate: startOfYear,
      summary: {
        totalDebits,
        totalCredits,
        difference,
        isBalanced,
        accountCount: accountEntries.length,
        transactionCount: totalTransactions
      },
      accounts: accountEntries,
      validation
    };
  }

  /**
   * Generate period-over-period trial balance comparison
   */
  async generateTrialBalanceComparison(
    organizationId: string,
    currentPeriodEnd: Date,
    previousPeriodEnd?: Date
  ): Promise<TrialBalanceComparison> {
    const previousEnd = previousPeriodEnd || new Date(
      currentPeriodEnd.getFullYear() - 1,
      currentPeriodEnd.getMonth(),
      currentPeriodEnd.getDate()
    );

    const [currentReport, previousReport] = await Promise.all([
      this.generateTrialBalanceReport(organizationId, currentPeriodEnd),
      this.generateTrialBalanceReport(organizationId, previousEnd)
    ]);

    // Calculate account changes
    const accountChanges = currentReport.accounts.map(currentAccount => {
      const previousAccount = previousReport.accounts.find(
        acc => acc.accountId === currentAccount.accountId
      );

      const previousBalance = previousAccount?.netBalance || 0;
      const change = currentAccount.netBalance - previousBalance;
      const changePercent = previousBalance !== 0 ? (change / Math.abs(previousBalance)) * 100 : 0;

      return {
        accountId: currentAccount.accountId,
        accountNumber: currentAccount.accountNumber,
        accountName: currentAccount.accountName,
        currentBalance: currentAccount.netBalance,
        previousBalance,
        change,
        changePercent
      };
    });

    // Identify significant changes (>10% or >$1000)
    const significantChanges = accountChanges
      .filter(change =>
        Math.abs(change.changePercent) > 10 || Math.abs(change.change) > 1000
      )
      .map(change => ({
        accountId: change.accountId,
        accountNumber: change.accountNumber,
        accountName: change.accountName,
        change: change.change,
        changePercent: change.changePercent,
        reason: this.analyzeChangeReason(change)
      }))
      .sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

    return {
      currentPeriod: currentReport,
      previousPeriod: previousReport,
      comparison: {
        accountChanges,
        significantChanges
      }
    };
  }

  /**
   * Generate accounting period summary
   */
  async generatePeriodSummary(
    organizationId: string,
    startDate: Date,
    endDate: Date
  ): Promise<AccountingPeriodSummary> {
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

    let totalRevenue = 0;
    let totalExpenses = 0;
    let totalAssets = 0;
    let totalLiabilities = 0;
    let totalEquity = 0;

    for (const account of accounts) {
      const balance = Number(account.balance);
      const accountType = account.type as AccountType;

      switch (accountType) {
        case AccountType.REVENUE:
          totalRevenue += balance;
          break;
        case AccountType.EXPENSE:
          totalExpenses += balance;
          break;
        case AccountType.ASSET:
          totalAssets += balance;
          break;
        case AccountType.LIABILITY:
          totalLiabilities += balance;
          break;
        case AccountType.EQUITY:
          totalEquity += balance;
          break;
      }
    }

    const netIncome = totalRevenue - totalExpenses;

    // Calculate cash flow (simplified - would need more detailed implementation)
    const cashFlow = await this.calculateCashFlow(organizationId, startDate, endDate);

    return {
      startDate,
      endDate,
      totalRevenue,
      totalExpenses,
      netIncome,
      totalAssets,
      totalLiabilities,
      totalEquity,
      cashFlow
    };
  }

  /**
   * Export trial balance to various formats
   */
  async exportTrialBalance(
    organizationId: string,
    asOfDate: Date,
    format: 'CSV' | 'JSON' | 'PDF'
  ): Promise<{
    filename: string;
    content: string;
    mimeType: string;
  }> {
    const report = await this.generateTrialBalanceReport(organizationId, asOfDate);
    const timestamp = asOfDate.toISOString().split('T')[0];

    switch (format) {
      case 'CSV':
        return {
          filename: `trial_balance_${timestamp}.csv`,
          content: this.formatTrialBalanceAsCSV(report),
          mimeType: 'text/csv'
        };

      case 'JSON':
        return {
          filename: `trial_balance_${timestamp}.json`,
          content: JSON.stringify(report, null, 2),
          mimeType: 'application/json'
        };

      case 'PDF':
        // Would implement PDF generation here
        throw new Error('PDF export not yet implemented');

      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  // Private helper methods

  private async calculateAccountEntry(
    account: Account & { parent?: Account | null; transactions: any[] },
    asOfDate: Date,
    periodStartDate: Date
  ): Promise<TrialBalanceAccountEntry> {
    const accountType = account.type as AccountType;

    // Calculate balances
    let debitBalance = 0;
    let creditBalance = 0;
    let ytdDebits = 0;
    let ytdCredits = 0;

    const allTimeTransactions = account.transactions;
    const ytdTransactions = account.transactions.filter(
      t => t.entryDate >= periodStartDate && t.entryDate <= asOfDate
    );

    // Calculate all-time balances
    for (const transaction of allTimeTransactions) {
      const amount = Number(transaction.amount);
      if (transaction.type === TransactionType.DEBIT) {
        debitBalance += amount;
      } else {
        creditBalance += amount;
      }
    }

    // Calculate year-to-date activity
    for (const transaction of ytdTransactions) {
      const amount = Number(transaction.amount);
      if (transaction.type === TransactionType.DEBIT) {
        ytdDebits += amount;
      } else {
        ytdCredits += amount;
      }
    }

    // Determine normal balance and calculate net balance
    const normalBalance = this.getNormalBalance(accountType);
    let netBalance = 0;

    if (normalBalance === 'DEBIT') {
      netBalance = debitBalance - creditBalance;
    } else {
      netBalance = creditBalance - debitBalance;
    }

    const isBalanceNormal = (normalBalance === 'DEBIT' && netBalance >= 0) ||
                           (normalBalance === 'CREDIT' && netBalance >= 0);

    // Get hierarchy level
    const level = this.calculateAccountLevel(account);

    // Get last transaction date
    const lastTransactionDate = allTimeTransactions.length > 0
      ? new Date(Math.max(...allTimeTransactions.map(t => new Date(t.entryDate).getTime())))
      : undefined;

    return {
      accountId: account.id,
      accountNumber: account.accountNumber,
      accountName: account.name,
      accountType,
      parentAccountId: account.parentId || undefined,
      parentAccountNumber: account.parent?.accountNumber,
      level,
      debitBalance,
      creditBalance,
      netBalance,
      normalBalance,
      isBalanceNormal,
      transactionCount: allTimeTransactions.length,
      lastTransactionDate,
      yearToDateActivity: {
        debits: ytdDebits,
        credits: ytdCredits,
        netChange: ytdDebits - ytdCredits
      }
    };
  }

  private getNormalBalance(accountType: AccountType): 'DEBIT' | 'CREDIT' {
    switch (accountType) {
      case AccountType.ASSET:
      case AccountType.EXPENSE:
        return 'DEBIT';
      case AccountType.LIABILITY:
      case AccountType.EQUITY:
      case AccountType.REVENUE:
        return 'CREDIT';
      default:
        return 'DEBIT';
    }
  }

  private calculateAccountLevel(account: Account & { parent?: Account | null }): number {
    let level = 0;
    let current = account;

    while (current.parent) {
      level++;
      current = current.parent;
    }

    return level;
  }

  private async validateTrialBalance(
    organizationId: string,
    accounts: TrialBalanceAccountEntry[],
    asOfDate: Date
  ): Promise<{ errors: string[]; warnings: string[]; recommendations: string[] }> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const recommendations: string[] = [];

    // Check for accounts with abnormal balances
    const abnormalBalances = accounts.filter(acc => !acc.isBalanceNormal);
    if (abnormalBalances.length > 0) {
      warnings.push(`${abnormalBalances.length} accounts have abnormal balances`);
    }

    // Check for inactive accounts with balances
    const inactiveAccountsWithBalances = accounts.filter(acc => Math.abs(acc.netBalance) > 0.01);
    // Would need to check if account is inactive - simplified for now

    // Check for accounts without recent activity
    const staleAccounts = accounts.filter(acc => {
      if (!acc.lastTransactionDate) return false;
      const daysSinceLastTransaction = (asOfDate.getTime() - acc.lastTransactionDate.getTime()) / (1000 * 60 * 60 * 24);
      return daysSinceLastTransaction > 365 && Math.abs(acc.netBalance) > 0.01;
    });

    if (staleAccounts.length > 0) {
      warnings.push(`${staleAccounts.length} accounts have balances but no activity in over 1 year`);
    }

    // Validate accounting equation
    const equationValidation = await this.journalService.validateAccountingEquation(organizationId);
    if (!equationValidation.isValid) {
      errors.push(`Accounting equation does not balance: Assets ${equationValidation.assets} ≠ Liabilities ${equationValidation.liabilities} + Equity ${equationValidation.equity}`);
    }

    // Recommendations
    if (abnormalBalances.length > 0) {
      recommendations.push('Review accounts with abnormal balances for potential errors');
    }

    if (staleAccounts.length > 0) {
      recommendations.push('Consider reviewing old account balances for potential cleanup');
    }

    return { errors, warnings, recommendations };
  }

  private analyzeChangeReason(change: any): string {
    if (change.changePercent > 50) {
      return 'Significant increase - review for accuracy';
    } else if (change.changePercent < -50) {
      return 'Significant decrease - review for accuracy';
    } else if (Math.abs(change.change) > 10000) {
      return 'Large dollar amount change';
    }
    return 'Normal variation';
  }

  private async calculateCashFlow(
    organizationId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{ operating: number; investing: number; financing: number; net: number }> {
    // Simplified cash flow calculation
    // In a real implementation, this would be much more detailed

    return {
      operating: 0,
      investing: 0,
      financing: 0,
      net: 0
    };
  }

  private formatTrialBalanceAsCSV(report: TrialBalanceReport): string {
    const headers = [
      'Account Number',
      'Account Name',
      'Account Type',
      'Debit Balance',
      'Credit Balance',
      'Net Balance',
      'Normal Balance',
      'Transaction Count',
      'Last Transaction Date'
    ];

    const rows = report.accounts.map(account => [
      account.accountNumber,
      account.accountName,
      account.accountType,
      account.debitBalance.toFixed(2),
      account.creditBalance.toFixed(2),
      account.netBalance.toFixed(2),
      account.normalBalance,
      account.transactionCount.toString(),
      account.lastTransactionDate?.toISOString().split('T')[0] || ''
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(field => `"${field}"`).join(',')),
      '',
      `Total Debits,${report.summary.totalDebits.toFixed(2)}`,
      `Total Credits,${report.summary.totalCredits.toFixed(2)}`,
      `Difference,${report.summary.difference.toFixed(2)}`,
      `Balanced,${report.summary.isBalanced ? 'Yes' : 'No'}`
    ].join('\n');

    return csvContent;
  }
}