import { PrismaClient, Account, JournalEntry, Transaction, Prisma } from '@prisma/client';
import { AccountType, TransactionType } from '../types/enums';
import { AuditService } from './audit.service';
import Decimal from 'decimal.js';

export interface CreateJournalEntryRequest {
  accountId: string;
  type: TransactionType;
  amount: number;
  description: string;
  referenceType?: string;
  referenceId?: string;
}

export interface CreateTransactionRequest {
  organizationId: string;
  date: Date;
  description: string;
  entries: CreateJournalEntryRequest[];
  userId: string;
}

export interface TrialBalanceEntry {
  accountId: string;
  accountNumber: string;
  accountName: string;
  accountType: AccountType;
  debitBalance: number;
  creditBalance: number;
  balance: number;
}

export interface AccountBalanceResponse {
  accountId: string;
  accountNumber: string;
  accountName: string;
  accountType: AccountType;
  balance: number;
  lastTransactionDate?: Date;
}

export class JournalService {
  private prisma: PrismaClient;
  private auditService: AuditService;

  constructor(prisma: PrismaClient, auditService: AuditService) {
    this.prisma = prisma;
    this.auditService = auditService;
  }

  /**
   * Creates a balanced transaction with multiple journal entries
   * Enforces double-entry bookkeeping: debits must equal credits
   */
  async createTransaction(request: CreateTransactionRequest): Promise<Transaction> {
    const { organizationId, date, description, entries, userId } = request;

    // Validate minimum entries requirement first
    if (entries.length < 2) {
      throw new Error('Transaction must have at least 2 journal entries (double-entry requirement)');
    }

    // Validate amounts are positive before calculating totals
    for (const entry of entries) {
      if (entry.amount <= 0) {
        throw new Error(`Journal entry amount must be positive. Got: ${entry.amount}`);
      }
    }

    // Validate that all accounts exist and belong to the organization
    await this.validateAccountsExist(organizationId, entries.map(e => e.accountId));

    // CRITICAL FIX: Calculate total debits and credits using Decimal arithmetic
    // This prevents floating-point precision errors in financial calculations
    const totalDebits = entries
      .filter(e => e.type === TransactionType.DEBIT)
      .reduce((sum, e) => sum.plus(new Decimal(e.amount)), new Decimal(0));

    const totalCredits = entries
      .filter(e => e.type === TransactionType.CREDIT)
      .reduce((sum, e) => sum.plus(new Decimal(e.amount)), new Decimal(0));

    // Enforce fundamental double-entry rule: debits must equal credits
    // Use Decimal comparison for exact precision
    const difference = totalDebits.minus(totalCredits).abs();
    if (difference.greaterThan(0.01)) {
      throw new Error(
        `Transaction does not balance: Debits ${totalDebits.toString()} ≠ Credits ${totalCredits.toString()}. ` +
        `Difference: ${difference.toString()}`
      );
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Generate unique transaction number
        const transactionNumber = await this.generateTransactionNumber(tx);

        // Create the transaction record
        const transaction = await tx.transaction.create({
          data: {
            transactionNumber,
            date,
            description,
            totalDebits: new Prisma.Decimal(totalDebits.toString()),
            totalCredits: new Prisma.Decimal(totalCredits.toString()),
          },
          include: {
            entries: {
              include: {
                account: true
              }
            }
          }
        });

        // Create journal entries
        for (const entry of entries) {
          await tx.journalEntry.create({
            data: {
              accountId: entry.accountId,
              transactionId: transaction.id,
              type: entry.type,
              amount: new Prisma.Decimal(entry.amount),
              description: entry.description,
              referenceType: entry.referenceType,
              referenceId: entry.referenceId,
              entryDate: date,
            }
          });

          // Update account balance (cached for performance)
          await this.updateAccountBalance(tx, entry.accountId, entry.type, entry.amount);
        }

        // Log transaction creation
        await this.auditService.logAction({
          action: 'CREATE',
          entityType: 'TRANSACTION',
          entityId: transaction.id,
          changes: {
            transactionNumber: transaction.transactionNumber,
            description: transaction.description,
            totalDebits: totalDebits,
            totalCredits: totalCredits,
            entriesCount: entries.length
          },
          context: {
            userId,
            organizationId
          }
        });

        // Fetch complete transaction with all entries created
        const completeTransaction = await tx.transaction.findUnique({
          where: { id: transaction.id },
          include: {
            entries: {
              include: {
                account: true
              }
            }
          }
        });

        return completeTransaction!;
      }, {
        timeout: 15000 // 15 seconds timeout for complex journal operations
      });
    } catch (error) {
      throw new Error(`Failed to create transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generates trial balance for organization at a specific date
   * Trial balance verifies that total debits equal total credits
   */
  async generateTrialBalance(organizationId: string, asOfDate?: Date): Promise<{
    entries: TrialBalanceEntry[];
    totalDebits: number;
    totalCredits: number;
    isBalanced: boolean;
    asOfDate: Date;
  }> {
    const cutoffDate = asOfDate || new Date();

    // Get all accounts with their journal entries up to the cutoff date
    const accounts = await this.prisma.account.findMany({
      where: {
        organizationId,
        isActive: true,
        deletedAt: null
      },
      include: {
        transactions: {
          where: {
            entryDate: {
              lte: cutoffDate
            }
          }
        }
      },
      orderBy: [
        { type: 'asc' },
        { accountNumber: 'asc' }
      ]
    });

    const entries: TrialBalanceEntry[] = [];
    let totalDebits = 0;
    let totalCredits = 0;

    for (const account of accounts) {
      let debitBalance = 0;
      let creditBalance = 0;

      // Calculate account balance from journal entries
      for (const entry of account.transactions) {
        if (entry.type === TransactionType.DEBIT) {
          debitBalance += Number(entry.amount);
        } else {
          creditBalance += Number(entry.amount);
        }
      }

      // Determine natural balance based on account type
      let balance = 0;
      const accountType = account.type as AccountType;

      if (accountType === AccountType.ASSET || accountType === AccountType.EXPENSE) {
        // Assets and Expenses have natural debit balances
        balance = debitBalance - creditBalance;
      } else {
        // Liabilities, Equity, and Revenue have natural credit balances
        balance = creditBalance - debitBalance;
      }

      // Only include accounts with non-zero balances in trial balance
      if (Math.abs(balance) > 0.01) {
        const trialBalanceEntry: TrialBalanceEntry = {
          accountId: account.id,
          accountNumber: account.accountNumber,
          accountName: account.name,
          accountType,
          debitBalance,
          creditBalance,
          balance
        };

        entries.push(trialBalanceEntry);

        // Add to totals based on natural balance
        if (balance > 0) {
          if (accountType === AccountType.ASSET || accountType === AccountType.EXPENSE) {
            totalDebits += balance;
          } else {
            totalCredits += balance;
          }
        } else {
          if (accountType === AccountType.ASSET || accountType === AccountType.EXPENSE) {
            totalCredits += Math.abs(balance);
          } else {
            totalDebits += Math.abs(balance);
          }
        }
      }
    }

    const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01;

    return {
      entries,
      totalDebits,
      totalCredits,
      isBalanced,
      asOfDate: cutoffDate
    };
  }

  /**
   * Gets account balance for a specific account
   */
  async getAccountBalance(organizationId: string, accountId: string): Promise<AccountBalanceResponse> {
    // Verify account exists and belongs to organization
    const account = await this.prisma.account.findFirst({
      where: {
        id: accountId,
        organizationId,
        deletedAt: null
      }
    });

    if (!account) {
      throw new Error(`Account not found: ${accountId}`);
    }

    // Get most recent journal entry for last transaction date
    const lastEntry = await this.prisma.journalEntry.findFirst({
      where: {
        accountId: accountId
      },
      orderBy: {
        entryDate: 'desc'
      }
    });

    return {
      accountId: account.id,
      accountNumber: account.accountNumber,
      accountName: account.name,
      accountType: account.type as AccountType,
      balance: Number(account.balance),
      lastTransactionDate: lastEntry?.entryDate
    };
  }

  /**
   * Reverses a transaction (creates offsetting entries)
   */
  async reverseTransaction(
    organizationId: string,
    transactionId: string,
    reversalReason: string,
    userId: string
  ): Promise<Transaction> {
    // Get original transaction with entries
    const originalTransaction = await this.prisma.transaction.findFirst({
      where: {
        id: transactionId
      },
      include: {
        entries: {
          include: {
            account: true
          }
        }
      }
    });

    if (!originalTransaction) {
      throw new Error(`Transaction not found: ${transactionId}`);
    }

    if (originalTransaction.reversedAt) {
      throw new Error(`Transaction ${transactionId} has already been reversed`);
    }

    // Create reversal entries (flip debit/credit types)
    const reversalEntries: CreateJournalEntryRequest[] = originalTransaction.entries.map(entry => ({
      accountId: entry.accountId,
      type: entry.type === TransactionType.DEBIT ? TransactionType.CREDIT : TransactionType.DEBIT,
      amount: Number(entry.amount),
      description: `REVERSAL: ${entry.description}`,
      referenceType: 'REVERSAL',
      referenceId: transactionId
    }));

    // Create reversal transaction
    const reversalTransaction = await this.createTransaction({
      organizationId,
      date: new Date(),
      description: `REVERSAL: ${originalTransaction.description} - ${reversalReason}`,
      entries: reversalEntries,
      userId
    });

    // Mark original transaction as reversed
    await this.prisma.transaction.update({
      where: { id: transactionId },
      data: {
        reversedAt: new Date(),
        reversalId: reversalTransaction.id
      }
    });

    // Log reversal
    await this.auditService.logAction({
      action: 'UPDATE',
      entityType: 'TRANSACTION',
      entityId: transactionId,
      changes: {
        action: 'REVERSED',
        reversalReason,
        reversalTransactionId: reversalTransaction.id
      },
      context: {
        userId,
        organizationId
      }
    });

    return reversalTransaction;
  }

  /**
   * Validates the fundamental accounting equation: Assets = Liabilities + Equity
   */
  async validateAccountingEquation(organizationId: string): Promise<{
    isValid: boolean;
    assets: number;
    liabilities: number;
    equity: number;
    difference: number;
  }> {
    const accounts = await this.prisma.account.findMany({
      where: {
        organizationId,
        isActive: true,
        deletedAt: null
      }
    });

    let assets = 0;
    let liabilities = 0;
    let equity = 0;

    for (const account of accounts) {
      const balance = Number(account.balance);
      const accountType = account.type as AccountType;

      switch (accountType) {
        case AccountType.ASSET:
          assets += balance;
          break;
        case AccountType.LIABILITY:
          liabilities += balance;
          break;
        case AccountType.EQUITY:
          equity += balance;
          break;
        case AccountType.REVENUE:
          // Revenue increases equity
          equity += balance;
          break;
        case AccountType.EXPENSE:
          // Expenses decrease equity
          equity -= balance;
          break;
      }
    }

    const difference = Math.abs(assets - (liabilities + equity));
    const isValid = difference < 0.01;

    return {
      isValid,
      assets,
      liabilities,
      equity,
      difference
    };
  }

  // Private helper methods

  private async validateAccountsExist(organizationId: string, accountIds: string[]): Promise<void> {
    const accounts = await this.prisma.account.findMany({
      where: {
        id: { in: accountIds },
        organizationId,
        isActive: true,
        deletedAt: null
      }
    });

    if (accounts.length !== accountIds.length) {
      const foundIds = accounts.map(a => a.id);
      const missingIds = accountIds.filter(id => !foundIds.includes(id));
      throw new Error(`Invalid account IDs: ${missingIds.join(', ')}`);
    }
  }

  private async generateTransactionNumber(tx: any): Promise<string> {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');

    // Get count of transactions created today
    const todayCount = await tx.transaction.count({
      where: {
        createdAt: {
          gte: new Date(new Date().setHours(0, 0, 0, 0))
        }
      }
    });

    return `TXN-${today}-${String(todayCount + 1).padStart(4, '0')}`;
  }

  private async updateAccountBalance(
    tx: any,
    accountId: string,
    entryType: TransactionType,
    amount: number
  ): Promise<void> {
    const account = await tx.account.findUnique({
      where: { id: accountId }
    });

    if (!account) {
      throw new Error(`Account not found: ${accountId}`);
    }

    const currentBalance = Number(account.balance);
    const accountType = account.type as AccountType;
    let newBalance = currentBalance;

    // Calculate new balance based on account type and entry type
    if (accountType === AccountType.ASSET || accountType === AccountType.EXPENSE) {
      // Assets and Expenses: Debit increases, Credit decreases
      newBalance = entryType === TransactionType.DEBIT
        ? currentBalance + amount
        : currentBalance - amount;
    } else {
      // Liabilities, Equity, Revenue: Credit increases, Debit decreases
      newBalance = entryType === TransactionType.CREDIT
        ? currentBalance + amount
        : currentBalance - amount;
    }

    await tx.account.update({
      where: { id: accountId },
      data: { balance: new Prisma.Decimal(newBalance) }
    });
  }
}