import { JournalEntryValidator, CreateJournalEntrySchema, CreateTransactionSchema } from '../../src/validators/journal-entry.validator';
import { PrismaClient } from '@prisma/client';
import { AccountType, TransactionType } from '../../src/types/enums';
import { ZodError } from 'zod';

// Mock Prisma
const mockPrisma = {
  account: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
} as any;

describe('Journal Entry Validator', () => {
  let validator: JournalEntryValidator;

  beforeEach(() => {
    jest.clearAllMocks();
    validator = new JournalEntryValidator(mockPrisma as PrismaClient);
  });

  describe('CreateJournalEntrySchema', () => {
    it('should validate a valid journal entry', () => {
      const validEntry = {
        accountId: 'clm123abc456def789ghi012',
        type: TransactionType.DEBIT,
        amount: 100.50,
        description: 'Test journal entry',
        referenceType: 'INVOICE',
        referenceId: 'inv-123'
      };

      expect(() => CreateJournalEntrySchema.parse(validEntry)).not.toThrow();
    });

    it('should reject invalid account ID format', () => {
      const invalidEntry = {
        accountId: 'invalid-id',
        type: TransactionType.DEBIT,
        amount: 100.50,
        description: 'Test entry'
      };

      expect(() => CreateJournalEntrySchema.parse(invalidEntry))
        .toThrow('Invalid account ID format');
    });

    it('should reject invalid transaction type', () => {
      const invalidEntry = {
        accountId: 'clm123abc456def789ghi012',
        type: 'INVALID_TYPE',
        amount: 100.50,
        description: 'Test entry'
      };

      expect(() => CreateJournalEntrySchema.parse(invalidEntry))
        .toThrow('Type must be DEBIT or CREDIT');
    });

    it('should reject zero and negative amounts', () => {
      const zeroAmountEntry = {
        accountId: 'clm123abc456def789ghi012',
        type: TransactionType.DEBIT,
        amount: 0,
        description: 'Test entry'
      };

      const negativeAmountEntry = {
        accountId: 'clm123abc456def789ghi012',
        type: TransactionType.DEBIT,
        amount: -100,
        description: 'Test entry'
      };

      expect(() => CreateJournalEntrySchema.parse(zeroAmountEntry))
        .toThrow('Amount must be positive');
      expect(() => CreateJournalEntrySchema.parse(negativeAmountEntry))
        .toThrow('Amount must be positive');
    });

    it('should reject amounts that are too large', () => {
      const largeAmountEntry = {
        accountId: 'clm123abc456def789ghi012',
        type: TransactionType.DEBIT,
        amount: 1000000000,
        description: 'Test entry'
      };

      expect(() => CreateJournalEntrySchema.parse(largeAmountEntry))
        .toThrow('Amount too large');
    });

    it('should reject empty description', () => {
      const emptyDescriptionEntry = {
        accountId: 'clm123abc456def789ghi012',
        type: TransactionType.DEBIT,
        amount: 100.50,
        description: ''
      };

      expect(() => CreateJournalEntrySchema.parse(emptyDescriptionEntry))
        .toThrow('Description is required');
    });

    it('should reject description that is too long', () => {
      const longDescriptionEntry = {
        accountId: 'clm123abc456def789ghi012',
        type: TransactionType.DEBIT,
        amount: 100.50,
        description: 'a'.repeat(501)
      };

      expect(() => CreateJournalEntrySchema.parse(longDescriptionEntry))
        .toThrow('Description too long');
    });

    it('should allow optional referenceType and referenceId', () => {
      const entryWithoutReference = {
        accountId: 'clm123abc456def789ghi012',
        type: TransactionType.CREDIT,
        amount: 250.75,
        description: 'Entry without reference'
      };

      expect(() => CreateJournalEntrySchema.parse(entryWithoutReference)).not.toThrow();
    });
  });

  describe('CreateTransactionSchema', () => {
    it('should validate a valid transaction', () => {
      const validTransaction = {
        organizationId: 'clm123abc456def789ghi012',
        date: new Date('2023-12-31'),
        description: 'Test transaction',
        userId: 'clm123abc456def789ghi012',
        entries: [
          {
            accountId: 'clm123abc456def789ghi013',
            type: TransactionType.DEBIT,
            amount: 100.00,
            description: 'Cash received'
          },
          {
            accountId: 'clm123abc456def789ghi014',
            type: TransactionType.CREDIT,
            amount: 100.00,
            description: 'Revenue earned'
          }
        ]
      };

      expect(() => CreateTransactionSchema.parse(validTransaction)).not.toThrow();
    });

    it('should reject transaction with invalid organization ID', () => {
      const invalidTransaction = {
        organizationId: 'invalid-org-id',
        date: new Date(),
        description: 'Test transaction',
        userId: 'clm123abc456def789ghi012',
        entries: [
          {
            accountId: 'clm123abc456def789ghi013',
            type: TransactionType.DEBIT,
            amount: 100.00,
            description: 'Test entry'
          }
        ]
      };

      expect(() => CreateTransactionSchema.parse(invalidTransaction))
        .toThrow('Invalid organization ID');
    });

    it('should reject transaction with invalid date', () => {
      const invalidTransaction = {
        organizationId: 'clm123abc456def789ghi012',
        date: 'invalid-date',
        description: 'Test transaction',
        userId: 'clm123abc456def789ghi012',
        entries: []
      };

      expect(() => CreateTransactionSchema.parse(invalidTransaction))
        .toThrow('Valid date is required');
    });

    it('should reject transaction with less than 2 entries', () => {
      const invalidTransaction = {
        organizationId: 'clm123abc456def789ghi012',
        date: new Date(),
        description: 'Test transaction',
        userId: 'clm123abc456def789ghi012',
        entries: [
          {
            accountId: 'clm123abc456def789ghi013',
            type: TransactionType.DEBIT,
            amount: 100.00,
            description: 'Only one entry'
          }
        ]
      };

      expect(() => CreateTransactionSchema.parse(invalidTransaction))
        .toThrow('Transaction must have at least 2 entries (double-entry requirement)');
    });

    it('should reject transaction with too many entries', () => {
      const entries = Array(51).fill(0).map((_, i) => ({
        accountId: 'clm123abc456def789ghi012',
        type: i % 2 === 0 ? TransactionType.DEBIT : TransactionType.CREDIT,
        amount: 100.00,
        description: `Entry ${i}`
      }));

      const invalidTransaction = {
        organizationId: 'clm123abc456def789ghi012',
        date: new Date(),
        description: 'Test transaction',
        userId: 'clm123abc456def789ghi012',
        entries
      };

      expect(() => CreateTransactionSchema.parse(invalidTransaction))
        .toThrow('Too many entries in single transaction');
    });

    it('should reject transaction with invalid user ID', () => {
      const invalidTransaction = {
        organizationId: 'clm123abc456def789ghi012',
        date: new Date(),
        description: 'Test transaction',
        userId: 'invalid-user-id',
        entries: [
          {
            accountId: 'clm123abc456def789ghi013',
            type: TransactionType.DEBIT,
            amount: 100.00,
            description: 'Test entry'
          },
          {
            accountId: 'clm123abc456def789ghi014',
            type: TransactionType.CREDIT,
            amount: 100.00,
            description: 'Test entry'
          }
        ]
      };

      expect(() => CreateTransactionSchema.parse(invalidTransaction))
        .toThrow('Invalid user ID');
    });
  });

  describe('validateTransactionRequest', () => {
    const validTransaction = {
      organizationId: 'clm123abc456def789ghi012',
      date: new Date('2023-12-31'),
      description: 'Test transaction',
      userId: 'clm123abc456def789ghi013',
      entries: [
        {
          accountId: 'clm123abc456def789ghi014',
          type: TransactionType.DEBIT,
          amount: 100.00,
          description: 'Cash received'
        },
        {
          accountId: 'clm123abc456def789ghi015',
          type: TransactionType.CREDIT,
          amount: 100.00,
          description: 'Revenue earned'
        }
      ]
    };

    const mockAccounts = [
      { id: 'clm123abc456def789ghi014', accountNumber: '1000', name: 'Cash' },
      { id: 'clm123abc456def789ghi015', accountNumber: '4000', name: 'Revenue' }
    ];

    beforeEach(() => {
      mockPrisma.account.findMany.mockResolvedValue(mockAccounts);
    });

    it('should validate a balanced transaction successfully', async () => {
      const result = await validator.validateTransactionRequest(validTransaction);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(mockPrisma.account.findMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['clm123abc456def789ghi014', 'clm123abc456def789ghi015'] },
          organizationId: 'clm123abc456def789ghi012',
          isActive: true,
          deletedAt: null
        }
      });
    });

    it('should reject invalid schema', async () => {
      const invalidTransaction = {
        ...validTransaction,
        organizationId: 'invalid-id'
      };

      const result = await validator.validateTransactionRequest(invalidTransaction);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('organizationId: Invalid organization ID');
    });

    it('should reject transaction with missing accounts', async () => {
      mockPrisma.account.findMany.mockResolvedValue([mockAccounts[0]]); // Only return first account

      const result = await validator.validateTransactionRequest(validTransaction);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid or inactive account IDs: clm123abc456def789ghi015');
    });

    it('should reject unbalanced transaction', async () => {
      const unbalancedTransaction = {
        ...validTransaction,
        entries: [
          {
            accountId: 'clm123abc456def789ghi014',
            type: TransactionType.DEBIT,
            amount: 100.00,
            description: 'Cash received'
          },
          {
            accountId: 'clm123abc456def789ghi015',
            type: TransactionType.CREDIT,
            amount: 90.00,
            description: 'Revenue earned'
          }
        ]
      };

      const result = await validator.validateTransactionRequest(unbalancedTransaction);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        'Transaction does not balance: Debits 100 ≠ Credits 90. Difference: 10'
      );
    });

    it('should warn about duplicate accounts', async () => {
      const duplicateAccountTransaction = {
        ...validTransaction,
        entries: [
          {
            accountId: 'clm123abc456def789ghi014',
            type: TransactionType.DEBIT,
            amount: 50.00,
            description: 'First entry'
          },
          {
            accountId: 'clm123abc456def789ghi014',
            type: TransactionType.DEBIT,
            amount: 50.00,
            description: 'Second entry'
          },
          {
            accountId: 'clm123abc456def789ghi015',
            type: TransactionType.CREDIT,
            amount: 100.00,
            description: 'Revenue earned'
          }
        ]
      };

      const result = await validator.validateTransactionRequest(duplicateAccountTransaction);

      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('Duplicate accounts in transaction: 1000 appears 2 times');
    });

    it('should warn about large transaction amounts', async () => {
      const largeAmountTransaction = {
        ...validTransaction,
        entries: [
          {
            accountId: 'clm123abc456def789ghi014',
            type: TransactionType.DEBIT,
            amount: 150000.00,
            description: 'Large cash received'
          },
          {
            accountId: 'clm123abc456def789ghi015',
            type: TransactionType.CREDIT,
            amount: 150000.00,
            description: 'Large revenue earned'
          }
        ]
      };

      const result = await validator.validateTransactionRequest(largeAmountTransaction);

      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('Large transaction amounts detected (>100000). Please verify.');
    });

    it('should warn about future dates', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 35); // 35 days in the future

      const futureTransaction = {
        ...validTransaction,
        date: futureDate
      };

      const result = await validator.validateTransactionRequest(futureTransaction);

      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('Transaction date is more than 30 days in the future');
    });

    it('should handle database errors gracefully', async () => {
      mockPrisma.account.findMany.mockRejectedValue(new Error('Database error'));

      await expect(validator.validateTransactionRequest(validTransaction))
        .rejects.toThrow('Database error');
    });
  });

  describe('createBusinessTransaction', () => {
    const mockCashAccount = {
      id: 'cash-account-id',
      accountNumber: '1000',
      name: 'Cash',
      type: AccountType.ASSET
    };

    const mockRevenueAccount = {
      id: 'revenue-account-id',
      accountNumber: '4000',
      name: 'Service Revenue',
      type: AccountType.REVENUE
    };

    beforeEach(() => {
      mockPrisma.account.findFirst
        .mockResolvedValueOnce(mockCashAccount)
        .mockResolvedValueOnce(mockRevenueAccount);
    });

    it('should create cash sale transaction', async () => {
      const transactionData = {
        amount: 500.00,
        description: 'Web design service',
        date: new Date('2023-12-31')
      };

      const result = await validator.createBusinessTransaction(
        'org-123',
        'CASH_SALE',
        transactionData,
        'user-123'
      );

      expect(result).toEqual({
        organizationId: 'org-123',
        date: new Date('2023-12-31'),
        description: 'Web design service',
        userId: 'user-123',
        entries: [
          {
            accountId: 'cash-account-id',
            type: TransactionType.DEBIT,
            amount: 500.00,
            description: 'Cash received - Web design service',
            referenceType: 'CASH_SALE',
            referenceId: undefined
          },
          {
            accountId: 'revenue-account-id',
            type: TransactionType.CREDIT,
            amount: 500.00,
            description: 'Revenue earned - Web design service',
            referenceType: 'CASH_SALE',
            referenceId: undefined
          }
        ]
      });
    });

    it('should use default date if not provided', async () => {
      const transactionData = {
        amount: 500.00,
        description: 'Service'
      };

      const result = await validator.createBusinessTransaction(
        'org-123',
        'CASH_SALE',
        transactionData,
        'user-123'
      );

      expect(result.date).toBeInstanceOf(Date);
      expect(result.date.getTime()).toBeCloseTo(Date.now(), -2); // Within 100ms
    });

    it('should throw error for unknown transaction type', async () => {
      const transactionData = {
        amount: 500.00,
        description: 'Service'
      };

      await expect(validator.createBusinessTransaction(
        'org-123',
        'UNKNOWN_TYPE',
        transactionData,
        'user-123'
      )).rejects.toThrow('Unknown transaction type: UNKNOWN_TYPE');
    });

    it('should throw error for missing required account', async () => {
      // Reset the mock and set up for this specific test
      mockPrisma.account.findFirst.mockReset();
      mockPrisma.account.findFirst
        .mockResolvedValueOnce(null) // Cash account not found
        .mockResolvedValueOnce(mockRevenueAccount);

      const transactionData = {
        amount: 500.00,
        description: 'Service'
      };

      await expect(validator.createBusinessTransaction(
        'org-123',
        'CASH_SALE',
        transactionData,
        'user-123'
      )).rejects.toThrow('Required account not found: ASSET (Cash)');
    });

    it('should throw error for invalid amount', async () => {
      const transactionData = {
        amount: 0,
        description: 'Service'
      };

      await expect(validator.createBusinessTransaction(
        'org-123',
        'CASH_SALE',
        transactionData,
        'user-123'
      )).rejects.toThrow('Invalid amount for amount: 0');
    });

    it('should handle template with reference ID', async () => {
      const transactionData = {
        amount: 500.00,
        description: 'Service',
        referenceId: 'invoice-123'
      };

      const result = await validator.createBusinessTransaction(
        'org-123',
        'CASH_SALE',
        transactionData,
        'user-123'
      );

      expect(result.entries[0].referenceId).toBe('invoice-123');
      expect(result.entries[1].referenceId).toBe('invoice-123');
    });

    it('should create credit sale transaction', async () => {
      const mockArAccount = {
        id: 'ar-account-id',
        accountNumber: '1200',
        name: 'Accounts Receivable',
        type: AccountType.ASSET
      };

      // Reset the mock and set up for this specific test
      mockPrisma.account.findFirst.mockReset();
      mockPrisma.account.findFirst
        .mockResolvedValueOnce(mockArAccount)
        .mockResolvedValueOnce(mockRevenueAccount);

      const transactionData = {
        amount: 1000.00,
        description: 'Consulting service on credit',
        customerId: 'customer-123'
      };

      const result = await validator.createBusinessTransaction(
        'org-123',
        'CREDIT_SALE',
        transactionData,
        'user-123'
      );

      expect(result.entries[0].accountId).toBe('ar-account-id');
      expect(result.entries[0].type).toBe(TransactionType.DEBIT);
      expect(result.entries[1].accountId).toBe('revenue-account-id');
      expect(result.entries[1].type).toBe(TransactionType.CREDIT);
    });
  });

  describe('getAvailableTransactionTypes', () => {
    it('should return all available transaction types', () => {
      const types = validator.getAvailableTransactionTypes();

      expect(types).toHaveLength(8);
      expect(types).toContainEqual({
        type: 'CASH_SALE',
        name: 'Cash Sale',
        description: 'Record a cash sale to a customer',
        requiredFields: ['amount', 'description']
      });
      expect(types).toContainEqual({
        type: 'CREDIT_SALE',
        name: 'Credit Sale',
        description: 'Record a sale on account to a customer',
        requiredFields: ['amount', 'description', 'customerId']
      });
      expect(types).toContainEqual({
        type: 'EXPENSE_CASH',
        name: 'Cash Expense',
        description: 'Record a cash payment for an expense',
        requiredFields: ['amount', 'description', 'expenseCategory']
      });
    });
  });

  describe('getTransactionTemplate (private method coverage)', () => {
    it('should handle all transaction template types through business transactions', async () => {
      const templates = [
        'CASH_SALE',
        'CREDIT_SALE',
        'CASH_PAYMENT_RECEIVED',
        'EXPENSE_CASH',
        'EXPENSE_CREDIT',
        'PAY_VENDOR',
        'OWNER_INVESTMENT',
        'OWNER_WITHDRAWAL'
      ];

      // Mock different account types for each template
      const mockAccounts = [
        { id: 'cash-id', type: AccountType.ASSET, name: 'Cash' },
        { id: 'ar-id', type: AccountType.ASSET, name: 'Accounts Receivable' },
        { id: 'revenue-id', type: AccountType.REVENUE, name: 'Service Revenue' },
        { id: 'expense-id', type: AccountType.EXPENSE, name: 'Office Expense' },
        { id: 'ap-id', type: AccountType.LIABILITY, name: 'Accounts Payable' },
        { id: 'equity-id', type: AccountType.EQUITY, name: "Owner's Equity" },
        { id: 'draw-id', type: AccountType.EQUITY, name: "Owner's Draw" }
      ];

      for (const templateType of templates) {
        mockPrisma.account.findFirst.mockImplementation((query: any) => {
          // Return appropriate account based on the query
          return Promise.resolve(mockAccounts.find(acc =>
            acc.type === query.where.type &&
            (!query.where.name || acc.name.toLowerCase().includes(query.where.name.contains.toLowerCase()))
          ) || mockAccounts[0]);
        });

        const transactionData = {
          amount: 100.00,
          description: `Test ${templateType}`
        };

        await expect(validator.createBusinessTransaction(
          'org-123',
          templateType,
          transactionData,
          'user-123'
        )).resolves.toBeDefined();
      }
    });
  });

  describe('getAccountsForTemplate (private method coverage)', () => {
    it('should find accounts by name when specified', async () => {
      // Reset the mock and set up for this specific test
      mockPrisma.account.findFirst.mockReset();
      mockPrisma.account.findFirst.mockResolvedValue({
        id: 'specific-cash-account',
        name: 'Petty Cash',
        type: AccountType.ASSET
      });

      const transactionData = {
        amount: 50.00,
        description: 'Test transaction'
      };

      const result = await validator.createBusinessTransaction(
        'org-123',
        'CASH_SALE',
        transactionData,
        'user-123'
      );

      // Check that the first call was for the Cash account
      expect(mockPrisma.account.findFirst).toHaveBeenCalled();
      const firstCall = mockPrisma.account.findFirst.mock.calls[0][0];
      expect(firstCall.where.organizationId).toBe('org-123');
      expect(firstCall.where.type).toBe(AccountType.ASSET);
      expect(firstCall.where.name).toEqual({ contains: 'Cash' });
      expect(firstCall.where.isActive).toBe(true);
      expect(firstCall.where.deletedAt).toBeNull();
    });

    it('should find accounts by type only when name not specified', async () => {
      const mockExpenseAccount = {
        id: 'expense-account-id',
        type: AccountType.EXPENSE,
        name: 'General Expense'
      };

      const mockCashAccount = {
        id: 'cash-account-id',
        accountNumber: '1000',
        name: 'Cash',
        type: AccountType.ASSET
      };

      // Reset the mock and set up for this specific test
      mockPrisma.account.findFirst.mockReset();
      mockPrisma.account.findFirst
        .mockResolvedValueOnce(mockExpenseAccount) // For expense account (no specific name)
        .mockResolvedValueOnce(mockCashAccount);   // For cash account

      const transactionData = {
        amount: 200.00,
        description: 'Office supplies'
      };

      const result = await validator.createBusinessTransaction(
        'org-123',
        'EXPENSE_CASH',
        transactionData,
        'user-123'
      );

      expect(mockPrisma.account.findFirst).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-123',
          type: AccountType.EXPENSE,
          isActive: true,
          deletedAt: null
        }
      });
    });
  });
});