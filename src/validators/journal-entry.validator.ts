import { z } from 'zod';
import { AccountType, TransactionType } from '../types/enums';
import { PrismaClient } from '@prisma/client';

// Validation schemas for journal entries
export const CreateJournalEntrySchema = z.object({
  accountId: z.string().cuid('Invalid account ID format'),
  type: z.nativeEnum(TransactionType, { errorMap: () => ({ message: 'Type must be DEBIT or CREDIT' }) }),
  amount: z.number().positive('Amount must be positive').max(999999999.99, 'Amount too large'),
  description: z.string().min(1, 'Description is required').max(500, 'Description too long'),
  referenceType: z.string().optional(),
  referenceId: z.string().optional()
});

export const CreateTransactionSchema = z.object({
  organizationId: z.string().cuid('Invalid organization ID'),
  date: z.date({ errorMap: () => ({ message: 'Valid date is required' }) }),
  description: z.string().min(1, 'Description is required').max(500, 'Description too long'),
  entries: z.array(CreateJournalEntrySchema)
    .min(2, 'Transaction must have at least 2 entries (double-entry requirement)')
    .max(50, 'Too many entries in single transaction'),
  userId: z.string().cuid('Invalid user ID')
});

// Common business transaction templates
export interface BusinessTransactionTemplate {
  name: string;
  description: string;
  defaultEntries: Array<{
    accountType: AccountType;
    accountName?: string;
    type: TransactionType;
    amountField: string; // Field name in the transaction data
    description: string;
  }>;
}

export class JournalEntryValidator {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Validates a complete transaction request
   */
  async validateTransactionRequest(request: any): Promise<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Schema validation
      CreateTransactionSchema.parse(request);
    } catch (error) {
      if (error instanceof z.ZodError) {
        errors.push(...error.errors.map(e => `${e.path.join('.')}: ${e.message}`));
      }
    }

    if (errors.length > 0) {
      return { isValid: false, errors, warnings };
    }

    // Business rule validations
    const { organizationId, entries } = request;

    // Validate all accounts exist and belong to organization
    const accountIds = entries.map((e: any) => e.accountId) as string[];
    const uniqueAccountIds = [...new Set(accountIds)]; // Get unique account IDs
    const accounts = await this.prisma.account.findMany({
      where: {
        id: { in: uniqueAccountIds },
        organizationId,
        isActive: true,
        deletedAt: null
      }
    });

    if (accounts.length !== uniqueAccountIds.length) {
      const foundIds = accounts.map(a => a.id);
      const missingIds = uniqueAccountIds.filter((id) => !foundIds.includes(id));
      errors.push(`Invalid or inactive account IDs: ${missingIds.join(', ')}`);
    }

    // Validate transaction balance
    const totalDebits = entries
      .filter((e: any) => e.type === TransactionType.DEBIT)
      .reduce((sum: number, e: any) => sum + e.amount, 0);

    const totalCredits = entries
      .filter((e: any) => e.type === TransactionType.CREDIT)
      .reduce((sum: number, e: any) => sum + e.amount, 0);

    if (Math.abs(totalDebits - totalCredits) > 0.01) {
      errors.push(
        `Transaction does not balance: Debits ${totalDebits} ≠ Credits ${totalCredits}. ` +
        `Difference: ${Math.abs(totalDebits - totalCredits)}`
      );
    }

    // Check for duplicate accounts in same transaction
    const accountIdCounts = accountIds.reduce((counts: Record<string, number>, id: string) => {
      counts[id] = (counts[id] || 0) + 1;
      return counts;
    }, {});

    const duplicateAccounts = Object.entries(accountIdCounts)
      .filter(([_, count]) => (count) > 1)
      .map(([accountId, count]) => {
        const account = accounts.find(a => a.id === accountId);
        return `${account?.accountCode || accountId} appears ${count} times`;
      });

    if (duplicateAccounts.length > 0) {
      warnings.push(`Duplicate accounts in transaction: ${duplicateAccounts.join(', ')}`);
    }

    // Validate reasonable amounts (warning for very large amounts)
    const largeEntries = entries.filter((e: any) => e.amount > 100000);
    if (largeEntries.length > 0) {
      warnings.push(`Large transaction amounts detected (>${100000}). Please verify.`);
    }

    // Validate date is not too far in future
    const futureLimit = new Date();
    futureLimit.setDate(futureLimit.getDate() + 30);
    if (request.date > futureLimit) {
      warnings.push('Transaction date is more than 30 days in the future');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Creates journal entries for common business transactions
   */
  async createBusinessTransaction(
    organizationId: string,
    transactionType: string,
    transactionData: Record<string, any>,
    userId: string
  ): Promise<any> {
    const template = this.getTransactionTemplate(transactionType);
    if (!template) {
      throw new Error(`Unknown transaction type: ${transactionType}`);
    }

    // Get required accounts for this transaction type
    const accountsMap = await this.getAccountsForTemplate(organizationId, template);

    // Build journal entries from template
    const entries = template.defaultEntries.map(entryTemplate => {
      const account = accountsMap.get(entryTemplate.accountType + (entryTemplate.accountName || ''));
      if (!account) {
        throw new Error(
          `Required account not found: ${entryTemplate.accountType}${entryTemplate.accountName ? ` (${entryTemplate.accountName})` : ''}`
        );
      }

      const amount = transactionData[entryTemplate.amountField];
      if (!amount || amount <= 0) {
        throw new Error(`Invalid amount for ${entryTemplate.amountField}: ${amount}`);
      }

      return {
        accountId: account.id,
        type: entryTemplate.type,
        amount: amount,
        description: entryTemplate.description.replace('{{description}}', transactionData.description || ''),
        referenceType: transactionType.toUpperCase(),
        referenceId: transactionData.referenceId
      };
    });

    return {
      organizationId,
      date: transactionData.date || new Date(),
      description: transactionData.description || template.description,
      entries,
      userId
    };
  }

  /**
   * Get standard transaction templates
   */
  private getTransactionTemplate(transactionType: string): BusinessTransactionTemplate | null {
    const templates: Record<string, BusinessTransactionTemplate> = {
      'CASH_SALE': {
        name: 'Cash Sale',
        description: 'Cash sale to customer',
        defaultEntries: [
          {
            accountType: AccountType.ASSET,
            accountName: 'Cash',
            type: TransactionType.DEBIT,
            amountField: 'amount',
            description: 'Cash received - {{description}}'
          },
          {
            accountType: AccountType.REVENUE,
            accountName: 'Service Revenue',
            type: TransactionType.CREDIT,
            amountField: 'amount',
            description: 'Revenue earned - {{description}}'
          }
        ]
      },

      'CREDIT_SALE': {
        name: 'Credit Sale',
        description: 'Sale on account to customer',
        defaultEntries: [
          {
            accountType: AccountType.ASSET,
            accountName: 'Accounts Receivable',
            type: TransactionType.DEBIT,
            amountField: 'amount',
            description: 'Sale on account - {{description}}'
          },
          {
            accountType: AccountType.REVENUE,
            accountName: 'Service Revenue',
            type: TransactionType.CREDIT,
            amountField: 'amount',
            description: 'Revenue earned - {{description}}'
          }
        ]
      },

      'CASH_PAYMENT_RECEIVED': {
        name: 'Cash Payment Received',
        description: 'Payment received from customer',
        defaultEntries: [
          {
            accountType: AccountType.ASSET,
            accountName: 'Cash',
            type: TransactionType.DEBIT,
            amountField: 'amount',
            description: 'Payment received - {{description}}'
          },
          {
            accountType: AccountType.ASSET,
            accountName: 'Accounts Receivable',
            type: TransactionType.CREDIT,
            amountField: 'amount',
            description: 'A/R payment - {{description}}'
          }
        ]
      },

      'EXPENSE_CASH': {
        name: 'Cash Expense',
        description: 'Cash payment for expense',
        defaultEntries: [
          {
            accountType: AccountType.EXPENSE,
            type: TransactionType.DEBIT,
            amountField: 'amount',
            description: 'Expense - {{description}}'
          },
          {
            accountType: AccountType.ASSET,
            accountName: 'Cash',
            type: TransactionType.CREDIT,
            amountField: 'amount',
            description: 'Cash paid - {{description}}'
          }
        ]
      },

      'EXPENSE_CREDIT': {
        name: 'Expense on Account',
        description: 'Expense incurred on credit',
        defaultEntries: [
          {
            accountType: AccountType.EXPENSE,
            type: TransactionType.DEBIT,
            amountField: 'amount',
            description: 'Expense - {{description}}'
          },
          {
            accountType: AccountType.LIABILITY,
            accountName: 'Accounts Payable',
            type: TransactionType.CREDIT,
            amountField: 'amount',
            description: 'Expense on account - {{description}}'
          }
        ]
      },

      'PAY_VENDOR': {
        name: 'Pay Vendor',
        description: 'Payment to vendor/supplier',
        defaultEntries: [
          {
            accountType: AccountType.LIABILITY,
            accountName: 'Accounts Payable',
            type: TransactionType.DEBIT,
            amountField: 'amount',
            description: 'Vendor payment - {{description}}'
          },
          {
            accountType: AccountType.ASSET,
            accountName: 'Cash',
            type: TransactionType.CREDIT,
            amountField: 'amount',
            description: 'Cash paid to vendor - {{description}}'
          }
        ]
      },

      'OWNER_INVESTMENT': {
        name: 'Owner Investment',
        description: 'Cash invested by owner',
        defaultEntries: [
          {
            accountType: AccountType.ASSET,
            accountName: 'Cash',
            type: TransactionType.DEBIT,
            amountField: 'amount',
            description: 'Cash invested - {{description}}'
          },
          {
            accountType: AccountType.EQUITY,
            accountName: 'Owner\'s Equity',
            type: TransactionType.CREDIT,
            amountField: 'amount',
            description: 'Owner investment - {{description}}'
          }
        ]
      },

      'OWNER_WITHDRAWAL': {
        name: 'Owner Withdrawal',
        description: 'Cash withdrawn by owner',
        defaultEntries: [
          {
            accountType: AccountType.EQUITY,
            accountName: 'Owner\'s Draw',
            type: TransactionType.DEBIT,
            amountField: 'amount',
            description: 'Owner withdrawal - {{description}}'
          },
          {
            accountType: AccountType.ASSET,
            accountName: 'Cash',
            type: TransactionType.CREDIT,
            amountField: 'amount',
            description: 'Cash withdrawn - {{description}}'
          }
        ]
      }
    };

    return templates[transactionType] || null;
  }

  /**
   * Gets accounts needed for a transaction template
   */
  private async getAccountsForTemplate(
    organizationId: string,
    template: BusinessTransactionTemplate
  ): Promise<Map<string, any>> {
    const accountsMap = new Map();

    for (const entry of template.defaultEntries) {
      const key = entry.accountType + (entry.accountName || '');

      if (!accountsMap.has(key)) {
        let account;

        if (entry.accountName) {
          // Find specific account by name and type
          account = await this.prisma.account.findFirst({
            where: {
              organizationId,
              type: entry.accountType,
              name: { contains: entry.accountName },
              isActive: true,
              deletedAt: null
            }
          });
        } else {
          // Find any account of this type
          account = await this.prisma.account.findFirst({
            where: {
              organizationId,
              type: entry.accountType,
              isActive: true,
              deletedAt: null
            }
          });
        }

        if (account) {
          accountsMap.set(key, account);
        }
      }
    }

    return accountsMap;
  }

  /**
   * Get available transaction types for an organization
   */
  getAvailableTransactionTypes(): Array<{
    type: string;
    name: string;
    description: string;
    requiredFields: string[];
  }> {
    return [
      {
        type: 'CASH_SALE',
        name: 'Cash Sale',
        description: 'Record a cash sale to a customer',
        requiredFields: ['amount', 'description']
      },
      {
        type: 'CREDIT_SALE',
        name: 'Credit Sale',
        description: 'Record a sale on account to a customer',
        requiredFields: ['amount', 'description', 'customerId']
      },
      {
        type: 'CASH_PAYMENT_RECEIVED',
        name: 'Payment Received',
        description: 'Record a payment received from a customer',
        requiredFields: ['amount', 'description', 'customerId']
      },
      {
        type: 'EXPENSE_CASH',
        name: 'Cash Expense',
        description: 'Record a cash payment for an expense',
        requiredFields: ['amount', 'description', 'expenseCategory']
      },
      {
        type: 'EXPENSE_CREDIT',
        name: 'Expense on Credit',
        description: 'Record an expense incurred on credit',
        requiredFields: ['amount', 'description', 'vendorId', 'expenseCategory']
      },
      {
        type: 'PAY_VENDOR',
        name: 'Pay Vendor',
        description: 'Record a payment to a vendor or supplier',
        requiredFields: ['amount', 'description', 'vendorId']
      },
      {
        type: 'OWNER_INVESTMENT',
        name: 'Owner Investment',
        description: 'Record cash invested by the owner',
        requiredFields: ['amount', 'description']
      },
      {
        type: 'OWNER_WITHDRAWAL',
        name: 'Owner Withdrawal',
        description: 'Record cash withdrawn by the owner',
        requiredFields: ['amount', 'description']
      }
    ];
  }
}