import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { JournalEntryValidator } from '../../src/validators/journal-entry.validator';
import { AccountsService } from '../../src/services/accounts.service';
import { AuditService } from '../../src/services/audit.service';
import { AccountType, TransactionType, BusinessType } from '../../src/types/enums';
import { z } from 'zod';
import { prisma, cleanupDatabase } from '../testUtils';

// Mock AuditService to avoid database lock issues
class MockAuditService extends AuditService {
  async logAction(): Promise<void> {
    // No-op in tests to avoid database lock issues
    return Promise.resolve();
  }
}

// Service instances
let journalValidator: JournalEntryValidator;
let accountsService: AccountsService;
let auditService: MockAuditService;

// Test data
let testOrganizationId: string;
let testUserId: string;
let testAccounts: any[] = [];

describe('Journal Entry Validation Test Suite', () => {
  beforeEach(async () => {
    // Clean database first
    await cleanupDatabase();

    // Initialize services with mock audit service
    auditService = new MockAuditService();
    accountsService = new AccountsService(prisma, auditService);
    journalValidator = new JournalEntryValidator(prisma);

    // Create test organization and user
    const organization = await prisma.organization.create({
      data: {
        name: 'Test Journal Validation Company',
        type: 'SINGLE_BUSINESS',
        email: 'test@journal.com',
        phone: '+1-555-0101',
        encryptionKey: 'test-key-32-chars-12345678901234'
      }
    });
    testOrganizationId = organization.id;

    const user = await prisma.user.create({
      data: {
        email: 'test.journal@example.com',
        passwordHash: 'test-hash',
        firstName: 'Journal',
        lastName: 'Validator',
        organizationId: testOrganizationId,
        role: 'ACCOUNTANT'
      }
    });
    testUserId = user.id;

    // Create standard chart of accounts
    testAccounts = await accountsService.createStandardChartOfAccounts(
      testOrganizationId,
      BusinessType.CORPORATION,
      testUserId
    );
  });

  afterEach(async () => {
    // Use shared cleanup utility
    await cleanupDatabase();
  });

  describe('Schema Validation', () => {
    it('should validate correct journal entry data', async () => {
      const cashAccount = testAccounts.find(a => a.name.includes('Cash'));
      const equityAccount = testAccounts.find(a => a.name.includes('Owner\'s Equity'));

      const validRequest = {
        organizationId: testOrganizationId,
        date: new Date(),
        description: 'Valid transaction',
        entries: [
          {
            accountId: cashAccount.id,
            type: TransactionType.DEBIT,
            amount: 1000,
            description: 'Cash received'
          },
          {
            accountId: equityAccount.id,
            type: TransactionType.CREDIT,
            amount: 1000,
            description: 'Owner investment'
          }
        ],
        userId: testUserId
      };

      const validation = await journalValidator.validateTransactionRequest(validRequest);

      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should reject invalid account ID format', async () => {
      const invalidRequest = {
        organizationId: testOrganizationId,
        date: new Date(),
        description: 'Invalid account ID',
        entries: [
          {
            accountId: 'invalid-id', // Invalid CUID format
            type: TransactionType.DEBIT,
            amount: 1000,
            description: 'Invalid entry'
          }
        ],
        userId: testUserId
      };

      const validation = await journalValidator.validateTransactionRequest(invalidRequest);

      expect(validation.isValid).toBe(false);
      expect(validation.errors.some(e => e.includes('Invalid account ID format'))).toBe(true);
    });

    it('should reject invalid transaction type', async () => {
      const cashAccount = testAccounts.find(a => a.name.includes('Cash'));

      const invalidRequest = {
        organizationId: testOrganizationId,
        date: new Date(),
        description: 'Invalid transaction type',
        entries: [
          {
            accountId: cashAccount.id,
            type: 'INVALID_TYPE' as any, // Invalid transaction type
            amount: 1000,
            description: 'Invalid type entry'
          }
        ],
        userId: testUserId
      };

      const validation = await journalValidator.validateTransactionRequest(invalidRequest);

      expect(validation.isValid).toBe(false);
      expect(validation.errors.some(e => e.includes('Type must be DEBIT or CREDIT'))).toBe(true);
    });

    it('should reject negative amounts', async () => {
      const cashAccount = testAccounts.find(a => a.name.includes('Cash'));
      const equityAccount = testAccounts.find(a => a.name.includes('Owner\'s Equity'));

      const invalidRequest = {
        organizationId: testOrganizationId,
        date: new Date(),
        description: 'Negative amount test',
        entries: [
          {
            accountId: cashAccount.id,
            type: TransactionType.DEBIT,
            amount: -1000, // Negative amount
            description: 'Negative amount'
          },
          {
            accountId: equityAccount.id,
            type: TransactionType.CREDIT,
            amount: 1000,
            description: 'Positive amount'
          }
        ],
        userId: testUserId
      };

      const validation = await journalValidator.validateTransactionRequest(invalidRequest);

      expect(validation.isValid).toBe(false);
      expect(validation.errors.some(e => e.includes('Amount must be positive'))).toBe(true);
    });

    it('should reject amounts exceeding maximum limit', async () => {
      const cashAccount = testAccounts.find(a => a.name.includes('Cash'));
      const equityAccount = testAccounts.find(a => a.name.includes('Owner\'s Equity'));

      const invalidRequest = {
        organizationId: testOrganizationId,
        date: new Date(),
        description: 'Amount too large',
        entries: [
          {
            accountId: cashAccount.id,
            type: TransactionType.DEBIT,
            amount: 1000000000, // Amount exceeding limit
            description: 'Too large'
          },
          {
            accountId: equityAccount.id,
            type: TransactionType.CREDIT,
            amount: 1000000000,
            description: 'Also too large'
          }
        ],
        userId: testUserId
      };

      const validation = await journalValidator.validateTransactionRequest(invalidRequest);

      expect(validation.isValid).toBe(false);
      expect(validation.errors.some(e => e.includes('Amount too large'))).toBe(true);
    });

    it('should reject empty or too long descriptions', async () => {
      const cashAccount = testAccounts.find(a => a.name.includes('Cash'));
      const equityAccount = testAccounts.find(a => a.name.includes('Owner\'s Equity'));

      // Test empty description
      const emptyDescRequest = {
        organizationId: testOrganizationId,
        date: new Date(),
        description: '', // Empty description
        entries: [
          {
            accountId: cashAccount.id,
            type: TransactionType.DEBIT,
            amount: 1000,
            description: 'Cash'
          },
          {
            accountId: equityAccount.id,
            type: TransactionType.CREDIT,
            amount: 1000,
            description: 'Equity'
          }
        ],
        userId: testUserId
      };

      let validation = await journalValidator.validateTransactionRequest(emptyDescRequest);
      expect(validation.isValid).toBe(false);
      expect(validation.errors.some(e => e.includes('Description is required'))).toBe(true);

      // Test too long description
      const longDescRequest = {
        organizationId: testOrganizationId,
        date: new Date(),
        description: 'A'.repeat(501), // Description too long
        entries: [
          {
            accountId: cashAccount.id,
            type: TransactionType.DEBIT,
            amount: 1000,
            description: 'Cash'
          },
          {
            accountId: equityAccount.id,
            type: TransactionType.CREDIT,
            amount: 1000,
            description: 'Equity'
          }
        ],
        userId: testUserId
      };

      validation = await journalValidator.validateTransactionRequest(longDescRequest);
      expect(validation.isValid).toBe(false);
      expect(validation.errors.some(e => e.includes('Description too long'))).toBe(true);
    });

    it('should enforce minimum and maximum entry count', async () => {
      const cashAccount = testAccounts.find(a => a.name.includes('Cash'));

      // Test too few entries
      const tooFewRequest = {
        organizationId: testOrganizationId,
        date: new Date(),
        description: 'Too few entries',
        entries: [
          {
            accountId: cashAccount.id,
            type: TransactionType.DEBIT,
            amount: 1000,
            description: 'Single entry'
          }
        ],
        userId: testUserId
      };

      let validation = await journalValidator.validateTransactionRequest(tooFewRequest);
      expect(validation.isValid).toBe(false);
      expect(validation.errors.some(e => e.includes('must have at least 2 entries'))).toBe(true);

      // Test too many entries
      const tooManyEntries = Array.from({ length: 51 }, (_, i) => ({
        accountId: cashAccount.id,
        type: i % 2 === 0 ? TransactionType.DEBIT : TransactionType.CREDIT,
        amount: 100,
        description: `Entry ${i + 1}`
      }));

      const tooManyRequest = {
        organizationId: testOrganizationId,
        date: new Date(),
        description: 'Too many entries',
        entries: tooManyEntries,
        userId: testUserId
      };

      validation = await journalValidator.validateTransactionRequest(tooManyRequest);
      expect(validation.isValid).toBe(false);
      expect(validation.errors.some(e => e.includes('Too many entries'))).toBe(true);
    });
  });

  describe('Business Rule Validation', () => {
    it('should validate account existence and organization ownership', async () => {
      const cashAccount = testAccounts.find(a => a.name.includes('Cash'));
      const fakeAccountId = 'clxxxxxxxxxxxxxxxxxxxxxxx'; // Valid CUID format but non-existent

      const invalidRequest = {
        organizationId: testOrganizationId,
        date: new Date(),
        description: 'Non-existent account',
        entries: [
          {
            accountId: fakeAccountId,
            type: TransactionType.DEBIT,
            amount: 1000,
            description: 'Fake account'
          },
          {
            accountId: cashAccount.id,
            type: TransactionType.CREDIT,
            amount: 1000,
            description: 'Real account'
          }
        ],
        userId: testUserId
      };

      const validation = await journalValidator.validateTransactionRequest(invalidRequest);

      expect(validation.isValid).toBe(false);
      expect(validation.errors.some(e => e.includes('Invalid or inactive account IDs'))).toBe(true);
    });

    it('should enforce transaction balance (debits = credits)', async () => {
      const cashAccount = testAccounts.find(a => a.name.includes('Cash'));
      const equityAccount = testAccounts.find(a => a.name.includes('Owner\'s Equity'));

      const unbalancedRequest = {
        organizationId: testOrganizationId,
        date: new Date(),
        description: 'Unbalanced transaction',
        entries: [
          {
            accountId: cashAccount.id,
            type: TransactionType.DEBIT,
            amount: 1000,
            description: 'Cash debit'
          },
          {
            accountId: equityAccount.id,
            type: TransactionType.CREDIT,
            amount: 999, // Intentionally unbalanced
            description: 'Equity credit'
          }
        ],
        userId: testUserId
      };

      const validation = await journalValidator.validateTransactionRequest(unbalancedRequest);

      expect(validation.isValid).toBe(false);
      expect(validation.errors.some(e => e.includes('Transaction does not balance'))).toBe(true);
      expect(validation.errors.some(e => e.includes('Difference: 1'))).toBe(true);
    });

    it('should warn about duplicate accounts in same transaction', async () => {
      const cashAccount = testAccounts.find(a => a.name.includes('Cash'));

      const duplicateAccountRequest = {
        organizationId: testOrganizationId,
        date: new Date(),
        description: 'Duplicate accounts',
        entries: [
          {
            accountId: cashAccount.id,
            type: TransactionType.DEBIT,
            amount: 500,
            description: 'First cash entry'
          },
          {
            accountId: cashAccount.id,
            type: TransactionType.DEBIT,
            amount: 500,
            description: 'Second cash entry'
          },
          {
            accountId: cashAccount.id,
            type: TransactionType.CREDIT,
            amount: 1000,
            description: 'Cash credit'
          }
        ],
        userId: testUserId
      };

      const validation = await journalValidator.validateTransactionRequest(duplicateAccountRequest);

      expect(validation.isValid).toBe(true); // Should still be valid
      expect(validation.warnings.some(w => w.includes('Duplicate accounts'))).toBe(true);
    });

    it('should warn about large transaction amounts', async () => {
      const cashAccount = testAccounts.find(a => a.name.includes('Cash'));
      const equityAccount = testAccounts.find(a => a.name.includes('Owner\'s Equity'));

      const largeAmountRequest = {
        organizationId: testOrganizationId,
        date: new Date(),
        description: 'Large transaction',
        entries: [
          {
            accountId: cashAccount.id,
            type: TransactionType.DEBIT,
            amount: 250000, // Large amount
            description: 'Large cash debit'
          },
          {
            accountId: equityAccount.id,
            type: TransactionType.CREDIT,
            amount: 250000,
            description: 'Large equity credit'
          }
        ],
        userId: testUserId
      };

      const validation = await journalValidator.validateTransactionRequest(largeAmountRequest);

      expect(validation.isValid).toBe(true);
      expect(validation.warnings.some(w => w.includes('Large transaction amounts detected'))).toBe(true);
    });

    it('should warn about future-dated transactions', async () => {
      const cashAccount = testAccounts.find(a => a.name.includes('Cash'));
      const equityAccount = testAccounts.find(a => a.name.includes('Owner\'s Equity'));

      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 45); // 45 days in future

      const futureDateRequest = {
        organizationId: testOrganizationId,
        date: futureDate,
        description: 'Future-dated transaction',
        entries: [
          {
            accountId: cashAccount.id,
            type: TransactionType.DEBIT,
            amount: 1000,
            description: 'Cash'
          },
          {
            accountId: equityAccount.id,
            type: TransactionType.CREDIT,
            amount: 1000,
            description: 'Equity'
          }
        ],
        userId: testUserId
      };

      const validation = await journalValidator.validateTransactionRequest(futureDateRequest);

      expect(validation.isValid).toBe(true);
      expect(validation.warnings.some(w => w.includes('more than 30 days in the future'))).toBe(true);
    });

    it('should handle small rounding differences in balance validation', async () => {
      const cashAccount = testAccounts.find(a => a.name.includes('Cash'));
      const equityAccount = testAccounts.find(a => a.name.includes('Owner\'s Equity'));

      const smallDifferenceRequest = {
        organizationId: testOrganizationId,
        date: new Date(),
        description: 'Small rounding difference',
        entries: [
          {
            accountId: cashAccount.id,
            type: TransactionType.DEBIT,
            amount: 1000.00,
            description: 'Cash'
          },
          {
            accountId: equityAccount.id,
            type: TransactionType.CREDIT,
            amount: 1000.001, // Very small difference (0.001)
            description: 'Equity'
          }
        ],
        userId: testUserId
      };

      const validation = await journalValidator.validateTransactionRequest(smallDifferenceRequest);

      // Should accept very small rounding differences
      expect(validation.isValid).toBe(true);
    });
  });

  describe('Business Transaction Templates', () => {
    it('should create cash sale transaction correctly', async () => {
      const transactionData = {
        amount: 1500,
        description: 'Cash sale to customer',
        date: new Date(),
        referenceId: 'INV-001'
      };

      const transaction = await journalValidator.createBusinessTransaction(
        testOrganizationId,
        'CASH_SALE',
        transactionData,
        testUserId
      );

      expect(transaction.organizationId).toBe(testOrganizationId);
      expect(transaction.description).toBe('Cash sale to customer');
      expect(transaction.entries).toHaveLength(2);

      // Should have cash debit and revenue credit
      const cashEntry = transaction.entries.find((e: any) => e.type === TransactionType.DEBIT);
      const revenueEntry = transaction.entries.find((e: any) => e.type === TransactionType.CREDIT);

      expect(cashEntry).toBeDefined();
      expect(revenueEntry).toBeDefined();
      expect(cashEntry.amount).toBe(1500);
      expect(revenueEntry.amount).toBe(1500);
    });

    it('should create credit sale transaction correctly', async () => {
      const transactionData = {
        amount: 2000,
        description: 'Credit sale to customer XYZ',
        customerId: 'customer-123',
        date: new Date()
      };

      const transaction = await journalValidator.createBusinessTransaction(
        testOrganizationId,
        'CREDIT_SALE',
        transactionData,
        testUserId
      );

      expect(transaction.entries).toHaveLength(2);

      // Should have A/R debit and revenue credit
      const arEntry = transaction.entries.find((e: any) => e.type === TransactionType.DEBIT);
      const revenueEntry = transaction.entries.find((e: any) => e.type === TransactionType.CREDIT);

      expect(arEntry.description).toContain('Sale on account');
      expect(revenueEntry.description).toContain('Revenue earned');
      expect(arEntry.amount).toBe(2000);
      expect(revenueEntry.amount).toBe(2000);
    });

    it('should create expense transaction correctly', async () => {
      const transactionData = {
        amount: 800,
        description: 'Monthly office rent',
        expenseCategory: 'rent',
        date: new Date()
      };

      const transaction = await journalValidator.createBusinessTransaction(
        testOrganizationId,
        'EXPENSE_CASH',
        transactionData,
        testUserId
      );

      expect(transaction.entries).toHaveLength(2);

      // Should have expense debit and cash credit
      const expenseEntry = transaction.entries.find((e: any) => e.type === TransactionType.DEBIT);
      const cashEntry = transaction.entries.find((e: any) => e.type === TransactionType.CREDIT);

      expect(expenseEntry.description).toContain('Expense');
      expect(cashEntry.description).toContain('Cash paid');
      expect(expenseEntry.amount).toBe(800);
      expect(cashEntry.amount).toBe(800);
    });

    it('should create owner investment transaction correctly', async () => {
      const transactionData = {
        amount: 25000,
        description: 'Initial capital investment',
        date: new Date()
      };

      const transaction = await journalValidator.createBusinessTransaction(
        testOrganizationId,
        'OWNER_INVESTMENT',
        transactionData,
        testUserId
      );

      expect(transaction.entries).toHaveLength(2);

      // Should have cash debit and equity credit
      const cashEntry = transaction.entries.find((e: any) => e.type === TransactionType.DEBIT);
      const equityEntry = transaction.entries.find((e: any) => e.type === TransactionType.CREDIT);

      expect(cashEntry.description).toContain('Cash invested');
      expect(equityEntry.description).toContain('Owner investment');
      expect(cashEntry.amount).toBe(25000);
      expect(equityEntry.amount).toBe(25000);
    });

    it('should create payment received transaction correctly', async () => {
      const transactionData = {
        amount: 1200,
        description: 'Payment from customer ABC',
        customerId: 'customer-abc',
        date: new Date()
      };

      const transaction = await journalValidator.createBusinessTransaction(
        testOrganizationId,
        'CASH_PAYMENT_RECEIVED',
        transactionData,
        testUserId
      );

      expect(transaction.entries).toHaveLength(2);

      // Should have cash debit and A/R credit
      const cashEntry = transaction.entries.find((e: any) => e.type === TransactionType.DEBIT);
      const arEntry = transaction.entries.find((e: any) => e.type === TransactionType.CREDIT);

      expect(cashEntry.description).toContain('Payment received');
      expect(arEntry.description).toContain('A/R payment');
      expect(cashEntry.amount).toBe(1200);
      expect(arEntry.amount).toBe(1200);
    });

    it('should handle missing required fields in transaction data', async () => {
      const invalidTransactionData = {
        // Missing amount field
        description: 'Invalid transaction',
        date: new Date()
      };

      await expect(journalValidator.createBusinessTransaction(
        testOrganizationId,
        'CASH_SALE',
        invalidTransactionData,
        testUserId
      )).rejects.toThrow(/Invalid amount/);
    });

    it('should handle unknown transaction types', async () => {
      const transactionData = {
        amount: 1000,
        description: 'Unknown transaction type',
        date: new Date()
      };

      await expect(journalValidator.createBusinessTransaction(
        testOrganizationId,
        'UNKNOWN_TYPE',
        transactionData,
        testUserId
      )).rejects.toThrow(/Unknown transaction type/);
    });

    it('should handle missing required accounts for transaction type', async () => {
      // Delete all service revenue accounts to trigger missing account error
      await prisma.account.deleteMany({
        where: {
          organizationId: testOrganizationId,
          name: { contains: 'Service Revenue' }
        }
      });

      const transactionData = {
        amount: 1000,
        description: 'Cash sale without revenue account',
        date: new Date()
      };

      await expect(journalValidator.createBusinessTransaction(
        testOrganizationId,
        'CASH_SALE',
        transactionData,
        testUserId
      )).rejects.toThrow(/Required account not found/);
    });
  });

  describe('Available Transaction Types', () => {
    it('should return all available transaction types with correct metadata', () => {
      const availableTypes = journalValidator.getAvailableTransactionTypes();

      expect(availableTypes).toHaveLength(8);

      // Verify specific transaction types exist
      const expectedTypes = [
        'CASH_SALE',
        'CREDIT_SALE',
        'CASH_PAYMENT_RECEIVED',
        'EXPENSE_CASH',
        'EXPENSE_CREDIT',
        'PAY_VENDOR',
        'OWNER_INVESTMENT',
        'OWNER_WITHDRAWAL'
      ];

      expectedTypes.forEach(type => {
        const transactionType = availableTypes.find(t => t.type === type);
        expect(transactionType).toBeDefined();
        expect(transactionType?.name).toBeDefined();
        expect(transactionType?.description).toBeDefined();
        expect(Array.isArray(transactionType?.requiredFields)).toBe(true);
      });

      // Verify required fields for specific types
      const cashSale = availableTypes.find(t => t.type === 'CASH_SALE');
      expect(cashSale?.requiredFields).toContain('amount');
      expect(cashSale?.requiredFields).toContain('description');

      const creditSale = availableTypes.find(t => t.type === 'CREDIT_SALE');
      expect(creditSale?.requiredFields).toContain('customerId');

      const expenseCredit = availableTypes.find(t => t.type === 'EXPENSE_CREDIT');
      expect(expenseCredit?.requiredFields).toContain('vendorId');
      expect(expenseCredit?.requiredFields).toContain('expenseCategory');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle very small amounts correctly', async () => {
      const cashAccount = testAccounts.find(a => a.name.includes('Cash'));
      const revenueAccount = testAccounts.find(a => a.name.includes('Service Revenue'));

      const smallAmountRequest = {
        organizationId: testOrganizationId,
        date: new Date(),
        description: 'Very small transaction',
        entries: [
          {
            accountId: cashAccount.id,
            type: TransactionType.DEBIT,
            amount: 0.01, // 1 cent
            description: 'Small cash amount'
          },
          {
            accountId: revenueAccount.id,
            type: TransactionType.CREDIT,
            amount: 0.01,
            description: 'Small revenue amount'
          }
        ],
        userId: testUserId
      };

      const validation = await journalValidator.validateTransactionRequest(smallAmountRequest);

      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should handle complex multi-entry transactions', async () => {
      const cashAccount = testAccounts.find(a => a.name.includes('Cash'));
      const receivablesAccount = testAccounts.find(a => a.name.includes('Receivable'));
      const revenueAccount = testAccounts.find(a => a.name.includes('Service Revenue'));
      const expenseAccount = testAccounts.find(a => a.name.includes('Rent Expense'));

      const complexRequest = {
        organizationId: testOrganizationId,
        date: new Date(),
        description: 'Complex multi-entry transaction',
        entries: [
          {
            accountId: cashAccount.id,
            type: TransactionType.DEBIT,
            amount: 1000,
            description: 'Cash portion'
          },
          {
            accountId: receivablesAccount.id,
            type: TransactionType.DEBIT,
            amount: 500,
            description: 'Credit portion'
          },
          {
            accountId: revenueAccount.id,
            type: TransactionType.CREDIT,
            amount: 1500,
            description: 'Total revenue'
          }
        ],
        userId: testUserId
      };

      const validation = await journalValidator.validateTransactionRequest(complexRequest);

      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should handle transactions with optional reference data', async () => {
      const cashAccount = testAccounts.find(a => a.name.includes('Cash'));
      const revenueAccount = testAccounts.find(a => a.name.includes('Service Revenue'));

      const requestWithReferences = {
        organizationId: testOrganizationId,
        date: new Date(),
        description: 'Transaction with references',
        entries: [
          {
            accountId: cashAccount.id,
            type: TransactionType.DEBIT,
            amount: 1000,
            description: 'Cash from invoice',
            referenceType: 'INVOICE',
            referenceId: 'INV-12345'
          },
          {
            accountId: revenueAccount.id,
            type: TransactionType.CREDIT,
            amount: 1000,
            description: 'Revenue from invoice',
            referenceType: 'INVOICE',
            referenceId: 'INV-12345'
          }
        ],
        userId: testUserId
      };

      const validation = await journalValidator.validateTransactionRequest(requestWithReferences);

      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should handle invalid organization ID format', async () => {
      const cashAccount = testAccounts.find(a => a.name.includes('Cash'));
      const equityAccount = testAccounts.find(a => a.name.includes('Owner\'s Equity'));

      const invalidOrgRequest = {
        organizationId: 'invalid-org-id', // Invalid format
        date: new Date(),
        description: 'Invalid org ID',
        entries: [
          {
            accountId: cashAccount.id,
            type: TransactionType.DEBIT,
            amount: 1000,
            description: 'Cash'
          },
          {
            accountId: equityAccount.id,
            type: TransactionType.CREDIT,
            amount: 1000,
            description: 'Equity'
          }
        ],
        userId: testUserId
      };

      const validation = await journalValidator.validateTransactionRequest(invalidOrgRequest);

      expect(validation.isValid).toBe(false);
      expect(validation.errors.some(e => e.includes('Invalid organization ID'))).toBe(true);
    });

    it('should handle missing required fields gracefully', async () => {
      const incompleteRequest = {
        organizationId: testOrganizationId,
        // Missing date, description, entries, userId
      };

      const validation = await journalValidator.validateTransactionRequest(incompleteRequest);

      expect(validation.isValid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Performance with Complex Validations', () => {
    it('should efficiently validate transactions with many entries', async () => {
      const cashAccount = testAccounts.find(a => a.name.includes('Cash'));
      const revenueAccounts = testAccounts.filter(a => a.type === AccountType.REVENUE);

      // Create 20 balanced entries (10 debits, 10 credits)
      const manyEntries = [];

      // 10 debits to cash
      for (let i = 0; i < 10; i++) {
        manyEntries.push({
          accountId: cashAccount.id,
          type: TransactionType.DEBIT,
          amount: 100,
          description: `Cash entry ${i + 1}`
        });
      }

      // 10 credits distributed across revenue accounts
      for (let i = 0; i < 10; i++) {
        const revenueAccount = revenueAccounts[i % revenueAccounts.length];
        manyEntries.push({
          accountId: revenueAccount.id,
          type: TransactionType.CREDIT,
          amount: 100,
          description: `Revenue entry ${i + 1}`
        });
      }

      const complexRequest = {
        organizationId: testOrganizationId,
        date: new Date(),
        description: 'Complex transaction with many entries',
        entries: manyEntries,
        userId: testUserId
      };

      const startTime = Date.now();
      const validation = await journalValidator.validateTransactionRequest(complexRequest);
      const endTime = Date.now();

      expect(validation.isValid).toBe(true);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
    });
  });
});

// No need for afterAll - prisma is managed by testUtils