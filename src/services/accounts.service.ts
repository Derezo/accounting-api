import { PrismaClient, Account, Prisma } from '@prisma/client';
import { AccountType, BusinessType } from '../types/enums';
import { AuditService } from './audit.service';

export interface CreateAccountRequest {
  organizationId: string;
  accountNumber: string;
  name: string;
  type: AccountType;
  parentId?: string;
  description?: string;
  isSystemAccount?: boolean;
  userId: string;
}

export interface UpdateAccountRequest {
  accountNumber?: string;
  name?: string;
  description?: string;
  isActive?: boolean;
  parentId?: string;
}

export interface StandardAccountTemplate {
  accountNumber: string;
  name: string;
  type: AccountType;
  parentAccountNumber?: string;
  description?: string;
  isSystemAccount: boolean;
}

export interface ChartOfAccountsResponse {
  accounts: Account[];
  totalAccounts: number;
  accountsByType: Record<AccountType, Account[]>;
}

export class AccountsService {
  private prisma: PrismaClient;
  private auditService: AuditService;

  constructor(prisma: PrismaClient, auditService: AuditService) {
    this.prisma = prisma;
    this.auditService = auditService;
  }

  /**
   * Creates a new account with validation
   */
  async createAccount(request: CreateAccountRequest): Promise<Account> {
    const { organizationId, accountNumber, name, type, parentId, description, isSystemAccount = false, userId } = request;

    // Validate account name is not empty
    if (!name || name.trim() === '') {
      throw new Error('Account name is required');
    }

    // Validate account number is unique within organization
    await this.validateAccountNumberUnique(organizationId, accountNumber);

    // Validate parent account if specified
    if (parentId) {
      await this.validateParentAccount(organizationId, parentId, type);
    }

    // Validate account number format based on type
    this.validateAccountNumberFormat(accountNumber, type);

    try {
      const account = await this.prisma.account.create({
        data: {
          organizationId,
          accountNumber,
          name,
          type,
          parentId,
          description,
          isSystemAccount,
          isActive: true,
          balance: new Prisma.Decimal(0)
        }
      });

      // Log account creation
      await this.auditService.logAction({
        action: 'CREATE',
        entityType: 'ACCOUNT',
        entityId: account.id,
        context: {
          organizationId,
          userId
        },
        details: {
          accountNumber: account.accountNumber,
          accountName: account.name,
          accountType: account.type
        }
      });

      return account;
    } catch (error) {
      throw new Error(`Failed to create account: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Updates an existing account
   */
  async updateAccount(
    organizationId: string,
    accountId: string,
    request: UpdateAccountRequest,
    userId: string
  ): Promise<Account> {
    // Verify account exists and belongs to organization
    const existingAccount = await this.getAccountById(organizationId, accountId);

    // Validate account number uniqueness if being changed
    if (request.accountNumber && request.accountNumber !== existingAccount.accountNumber) {
      await this.validateAccountNumberUnique(organizationId, request.accountNumber, accountId);
      this.validateAccountNumberFormat(request.accountNumber, existingAccount.type as AccountType);
    }

    // Validate parent account if being changed
    if (request.parentId && request.parentId !== existingAccount.parentId) {
      await this.validateParentAccount(organizationId, request.parentId, existingAccount.type as AccountType);

      // Prevent circular hierarchy
      await this.validateNoCircularHierarchy(accountId, request.parentId);
    }

    try {
      const updatedAccount = await this.prisma.account.update({
        where: { id: accountId },
        data: {
          ...request,
          updatedAt: new Date()
        }
      });

      // Log account update
      await this.auditService.logAction({
        action: 'UPDATE',
        entityType: 'ACCOUNT',
        entityId: accountId,
        context: {
          organizationId,
          userId
        },
        details: {
          changes: request,
          previousValues: {
            accountNumber: existingAccount.accountNumber,
            name: existingAccount.name,
            isActive: existingAccount.isActive
          }
        }
      });

      return updatedAccount;
    } catch (error) {
      throw new Error(`Failed to update account: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Gets complete chart of accounts for organization
   */
  async getChartOfAccounts(organizationId: string, includeInactive: boolean = false): Promise<ChartOfAccountsResponse> {
    const accounts = await this.prisma.account.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(includeInactive ? {} : { isActive: true })
      },
      orderBy: [
        { type: 'asc' },
        { accountNumber: 'asc' }
      ],
      include: {
        parent: true,
        children: true
      }
    });

    // Group accounts by type
    const accountsByType: Record<AccountType, Account[]> = {
      [AccountType.ASSET]: [],
      [AccountType.LIABILITY]: [],
      [AccountType.EQUITY]: [],
      [AccountType.REVENUE]: [],
      [AccountType.EXPENSE]: []
    };

    accounts.forEach(account => {
      const accountType = account.type as AccountType;
      accountsByType[accountType].push(account);
    });

    return {
      accounts,
      totalAccounts: accounts.length,
      accountsByType
    };
  }

  /**
   * Gets account by ID with validation
   */
  async getAccountById(organizationId: string, accountId: string): Promise<Account> {
    const account = await this.prisma.account.findFirst({
      where: {
        id: accountId,
        organizationId,
        deletedAt: null
      },
      include: {
        parent: true,
        children: true
      }
    });

    if (!account) {
      throw new Error(`Account not found: ${accountId}`);
    }

    return account;
  }

  /**
   * Gets account by account number
   */
  async getAccountByNumber(organizationId: string, accountNumber: string): Promise<Account | null> {
    return await this.prisma.account.findFirst({
      where: {
        organizationId,
        accountNumber,
        deletedAt: null
      },
      include: {
        parent: true,
        children: true
      }
    });
  }

  /**
   * Soft deletes an account (only if no transactions exist)
   */
  async deleteAccount(organizationId: string, accountId: string, userId: string): Promise<void> {
    const account = await this.getAccountById(organizationId, accountId);

    // Check if account has any transactions
    const transactionCount = await this.prisma.journalEntry.count({
      where: { accountId }
    });

    if (transactionCount > 0) {
      throw new Error(
        `Cannot delete account ${account.accountNumber} (${account.name}): ` +
        `${transactionCount} transactions exist. Deactivate the account instead.`
      );
    }

    // Check if account has children
    const childrenCount = await this.prisma.account.count({
      where: {
        parentId: accountId,
        deletedAt: null
      }
    });

    if (childrenCount > 0) {
      throw new Error(
        `Cannot delete account ${account.accountNumber} (${account.name}): ` +
        `${childrenCount} child accounts exist. Delete or reassign child accounts first.`
      );
    }

    await this.prisma.account.update({
      where: { id: accountId },
      data: { deletedAt: new Date() }
    });

    // Log account deletion
    await this.auditService.logAction({
      action: 'DELETE',
      entityType: 'ACCOUNT',
      entityId: accountId,
      context: {
        organizationId,
        userId
      },
      details: {
        accountNumber: account.accountNumber,
        accountName: account.name,
        accountType: account.type
      }
    });
  }

  /**
   * Creates standard chart of accounts for a business type
   */
  async createStandardChartOfAccounts(
    organizationId: string,
    businessType: BusinessType,
    userId: string
  ): Promise<Account[]> {
    const template = this.getStandardAccountsTemplate(businessType);
    const createdAccounts: Account[] = [];

    // Create accounts in dependency order (parents before children)
    const sortedTemplate = this.sortAccountsByDependency(template);

    for (const accountTemplate of sortedTemplate) {
      let parentId: string | undefined;

      // Find parent account ID if parentAccountNumber is specified
      if (accountTemplate.parentAccountNumber) {
        const parentAccount = createdAccounts.find(
          acc => acc.accountNumber === accountTemplate.parentAccountNumber
        );
        if (parentAccount) {
          parentId = parentAccount.id;
        }
      }

      const account = await this.createAccount({
        organizationId,
        accountNumber: accountTemplate.accountNumber,
        name: accountTemplate.name,
        type: accountTemplate.type,
        parentId,
        description: accountTemplate.description,
        isSystemAccount: accountTemplate.isSystemAccount,
        userId
      });

      createdAccounts.push(account);
    }

    // Log standard chart creation
    await this.auditService.logAction({
      action: 'CREATE',
      entityType: 'CHART_OF_ACCOUNTS',
      entityId: organizationId,
      context: {
        organizationId,
        userId
      },
      details: {
        businessType,
        accountsCreated: createdAccounts.length,
        template: 'STANDARD'
      }
    });

    return createdAccounts;
  }

  /**
   * Gets account hierarchy for display purposes
   */
  async getAccountHierarchy(organizationId: string): Promise<Account[]> {
    const accounts = await this.prisma.account.findMany({
      where: {
        organizationId,
        deletedAt: null
      },
      include: {
        children: {
          include: {
            children: {
              include: {
                children: true // Support up to 4 levels deep
              }
            }
          }
        }
      },
      orderBy: [
        { type: 'asc' },
        { accountNumber: 'asc' }
      ]
    });

    // Return only root accounts (accounts with no parent)
    return accounts.filter(account => !account.parentId);
  }

  // Private helper methods

  private async validateAccountNumberUnique(
    organizationId: string,
    accountNumber: string,
    excludeAccountId?: string
  ): Promise<void> {
    const existingAccount = await this.prisma.account.findFirst({
      where: {
        organizationId,
        accountNumber,
        deletedAt: null,
        ...(excludeAccountId && { id: { not: excludeAccountId } })
      }
    });

    if (existingAccount) {
      throw new Error(`Account number ${accountNumber} already exists`);
    }
  }

  private validateAccountNumberFormat(accountNumber: string, type: AccountType): void {
    // Standard account number format: 4 digits
    if (!/^\d{4}$/.test(accountNumber)) {
      throw new Error('Account number must be 4 digits');
    }

    // Validate account number ranges by type
    const firstDigit = parseInt(accountNumber[0]);

    switch (type) {
      case AccountType.ASSET:
        if (firstDigit !== 1) {
          throw new Error('Asset accounts must start with 1 (1000-1999)');
        }
        break;
      case AccountType.LIABILITY:
        if (firstDigit !== 2) {
          throw new Error('Liability accounts must start with 2 (2000-2999)');
        }
        break;
      case AccountType.EQUITY:
        if (firstDigit !== 3) {
          throw new Error('Equity accounts must start with 3 (3000-3999)');
        }
        break;
      case AccountType.REVENUE:
        if (firstDigit !== 4) {
          throw new Error('Revenue accounts must start with 4 (4000-4999)');
        }
        break;
      case AccountType.EXPENSE:
        if (firstDigit !== 5 && firstDigit !== 6) {
          throw new Error('Expense accounts must start with 5 or 6 (5000-6999)');
        }
        break;
    }
  }

  private async validateParentAccount(
    organizationId: string,
    parentId: string,
    childType: AccountType
  ): Promise<void> {
    const parentAccount = await this.prisma.account.findFirst({
      where: {
        id: parentId,
        organizationId,
        deletedAt: null
      }
    });

    if (!parentAccount) {
      throw new Error(`Parent account not found: ${parentId}`);
    }

    // Parent and child must be same account type
    if (parentAccount.type !== childType) {
      throw new Error(
        `Parent account type (${parentAccount.type}) must match child account type (${childType})`
      );
    }
  }

  private async validateNoCircularHierarchy(accountId: string, parentId: string): Promise<void> {
    // Check if setting this parent would create a circular reference
    let currentParentId: string | null = parentId;
    const visited = new Set<string>([accountId]);

    while (currentParentId) {
      if (visited.has(currentParentId)) {
        throw new Error('Cannot create circular account hierarchy');
      }

      visited.add(currentParentId);

      const parent: { parentId: string | null } | null = await this.prisma.account.findUnique({
        where: { id: currentParentId },
        select: { parentId: true }
      });

      currentParentId = parent?.parentId || null;
    }
  }

  private getStandardAccountsTemplate(businessType: BusinessType): StandardAccountTemplate[] {
    // Base chart of accounts suitable for most business types
    const baseTemplate: StandardAccountTemplate[] = [
      // ASSETS (1000-1999)
      { accountNumber: '1000', name: 'Cash and Cash Equivalents', type: AccountType.ASSET, isSystemAccount: true },
      { accountNumber: '1010', name: 'Checking Account', type: AccountType.ASSET, parentAccountNumber: '1000', isSystemAccount: true },
      { accountNumber: '1020', name: 'Savings Account', type: AccountType.ASSET, parentAccountNumber: '1000', isSystemAccount: false },
      { accountNumber: '1100', name: 'Accounts Receivable', type: AccountType.ASSET, isSystemAccount: true },
      { accountNumber: '1200', name: 'Inventory', type: AccountType.ASSET, isSystemAccount: false },
      { accountNumber: '1500', name: 'Equipment', type: AccountType.ASSET, isSystemAccount: false },
      { accountNumber: '1600', name: 'Accumulated Depreciation - Equipment', type: AccountType.ASSET, isSystemAccount: false },

      // LIABILITIES (2000-2999)
      { accountNumber: '2000', name: 'Accounts Payable', type: AccountType.LIABILITY, isSystemAccount: true },
      { accountNumber: '2100', name: 'Credit Cards Payable', type: AccountType.LIABILITY, isSystemAccount: false },
      { accountNumber: '2200', name: 'Sales Tax Payable', type: AccountType.LIABILITY, isSystemAccount: true },
      { accountNumber: '2300', name: 'Payroll Liabilities', type: AccountType.LIABILITY, isSystemAccount: false },
      { accountNumber: '2400', name: 'Long-term Debt', type: AccountType.LIABILITY, isSystemAccount: false },

      // EQUITY (3000-3999)
      { accountNumber: '3000', name: 'Owner\'s Equity', type: AccountType.EQUITY, isSystemAccount: true },
      { accountNumber: '3100', name: 'Retained Earnings', type: AccountType.EQUITY, isSystemAccount: true },
      { accountNumber: '3900', name: 'Owner\'s Draw', type: AccountType.EQUITY, isSystemAccount: false },

      // REVENUE (4000-4999)
      { accountNumber: '4000', name: 'Service Revenue', type: AccountType.REVENUE, isSystemAccount: true },
      { accountNumber: '4100', name: 'Product Sales', type: AccountType.REVENUE, isSystemAccount: false },
      { accountNumber: '4200', name: 'Other Income', type: AccountType.REVENUE, isSystemAccount: false },

      // EXPENSES (5000-6999)
      { accountNumber: '5000', name: 'Cost of Goods Sold', type: AccountType.EXPENSE, isSystemAccount: false },
      { accountNumber: '6000', name: 'Operating Expenses', type: AccountType.EXPENSE, isSystemAccount: false },
      { accountNumber: '6010', name: 'Rent Expense', type: AccountType.EXPENSE, parentAccountNumber: '6000', isSystemAccount: false },
      { accountNumber: '6020', name: 'Utilities Expense', type: AccountType.EXPENSE, parentAccountNumber: '6000', isSystemAccount: false },
      { accountNumber: '6030', name: 'Insurance Expense', type: AccountType.EXPENSE, parentAccountNumber: '6000', isSystemAccount: false },
      { accountNumber: '6040', name: 'Office Supplies Expense', type: AccountType.EXPENSE, parentAccountNumber: '6000', isSystemAccount: false },
      { accountNumber: '6050', name: 'Professional Services', type: AccountType.EXPENSE, parentAccountNumber: '6000', isSystemAccount: false },
      { accountNumber: '6060', name: 'Marketing Expense', type: AccountType.EXPENSE, parentAccountNumber: '6000', isSystemAccount: false },
      { accountNumber: '6100', name: 'Payroll Expenses', type: AccountType.EXPENSE, isSystemAccount: false },
      { accountNumber: '6200', name: 'Depreciation Expense', type: AccountType.EXPENSE, isSystemAccount: false },
    ];

    // Add business-type specific accounts
    switch (businessType) {
      case BusinessType.CORPORATION:
        baseTemplate.push(
          { accountNumber: '3200', name: 'Common Stock', type: AccountType.EQUITY, isSystemAccount: true },
          { accountNumber: '3300', name: 'Additional Paid-in Capital', type: AccountType.EQUITY, isSystemAccount: true }
        );
        break;

      case BusinessType.PARTNERSHIP:
        baseTemplate.push(
          { accountNumber: '3001', name: 'Partner A Capital', type: AccountType.EQUITY, isSystemAccount: true },
          { accountNumber: '3002', name: 'Partner B Capital', type: AccountType.EQUITY, isSystemAccount: true }
        );
        break;
    }

    return baseTemplate;
  }

  private sortAccountsByDependency(template: StandardAccountTemplate[]): StandardAccountTemplate[] {
    const sorted: StandardAccountTemplate[] = [];
    const remaining = [...template];

    while (remaining.length > 0) {
      const readyToAdd = remaining.filter(account => {
        if (!account.parentAccountNumber) return true;
        return sorted.some(existing => existing.accountNumber === account.parentAccountNumber);
      });

      if (readyToAdd.length === 0) {
        throw new Error('Circular dependency detected in account template');
      }

      sorted.push(...readyToAdd);
      readyToAdd.forEach(account => {
        const index = remaining.indexOf(account);
        remaining.splice(index, 1);
      });
    }

    return sorted;
  }
}