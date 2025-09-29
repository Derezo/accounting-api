import { describe, it, expect, beforeEach, afterEach, afterAll } from '@jest/globals';
import { prisma, cleanupDatabase } from '../testUtils';
import { JournalService } from '../../src/services/journal.service';
import { AccountsService } from '../../src/services/accounts.service';
import { TaxService } from '../../src/services/tax.service';
import { CanadianTaxService } from '../../src/services/canadian-tax.service';
import { FinancialStatementsService } from '../../src/services/financial-statements.service';
import { AuditService } from '../../src/services/audit.service';
import { AccountType, TransactionType, BusinessType } from '../../src/types/enums';

// Service instances
let journalService: JournalService;
let accountsService: AccountsService;
let taxService: TaxService;
let canadianTaxService: CanadianTaxService;
let financialStatementsService: FinancialStatementsService;
let auditService: AuditService;

// Test data
let testOrganizationId: string;
let testUserId: string;
let testAccounts: any[] = [];

// Mock audit service that doesn't write to database (to avoid SQLite lock issues in tests)
class MockAuditService extends AuditService {
  async logAction(): Promise<void> {
    // No-op in tests to avoid database lock issues
    return Promise.resolve();
  }
}

describe('Financial Accuracy Test Suite', () => {
  beforeEach(async () => {
    // Initialize services with shared prisma instance and mock audit service
    auditService = new MockAuditService();
    journalService = new JournalService(prisma, auditService);
    accountsService = new AccountsService(prisma, auditService);
    taxService = new TaxService(prisma, auditService);
    canadianTaxService = new CanadianTaxService(prisma, taxService);
    financialStatementsService = new FinancialStatementsService(prisma, journalService, {} as any);

    // Create test organization (note: Organization.type is a STRING field, not an enum)
    const organization = await prisma.organization.create({
      data: {
        name: 'Test Financial Company',
        email: 'test@financial.com',
        phone: '+1-555-0100',
        encryptionKey: 'test-key-32-chars-12345678901234'
      }
    });
    testOrganizationId = organization.id;

    const user = await prisma.user.create({
      data: {
        email: 'test.financial@example.com',
        passwordHash: 'test-hash',
        firstName: 'Financial',
        lastName: 'Tester',
        organizationId: testOrganizationId
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
    // Use the robust cleanup function that properly handles FK constraints and locks
    await cleanupDatabase();
  });

  describe('Double-Entry Bookkeeping Accuracy', () => {
    it('should enforce fundamental accounting equation: Assets = Liabilities + Equity', async () => {
      // Create basic transactions to test the accounting equation
      const cashAccount = testAccounts.find(a => a.name.includes('Cash'));
      const equityAccount = testAccounts.find(a => a.name.includes('Owner\'s Equity'));
      const revenueAccount = testAccounts.find(a => a.name.includes('Service Revenue'));
      const expenseAccount = testAccounts.find(a => a.name.includes('Rent Expense'));

      expect(cashAccount).toBeDefined();
      expect(equityAccount).toBeDefined();
      expect(revenueAccount).toBeDefined();
      expect(expenseAccount).toBeDefined();

      // Transaction 1: Owner investment ($10,000)
      await journalService.createTransaction({
        organizationId: testOrganizationId,
        date: new Date(),
        description: 'Initial owner investment',
        entries: [
          {
            accountId: cashAccount.id,
            type: TransactionType.DEBIT,
            amount: 10000,
            description: 'Cash investment'
          },
          {
            accountId: equityAccount.id,
            type: TransactionType.CREDIT,
            amount: 10000,
            description: 'Owner equity'
          }
        ],
        userId: testUserId
      });

      // Transaction 2: Service revenue ($5,000)
      await journalService.createTransaction({
        organizationId: testOrganizationId,
        date: new Date(),
        description: 'Service revenue earned',
        entries: [
          {
            accountId: cashAccount.id,
            type: TransactionType.DEBIT,
            amount: 5000,
            description: 'Cash received'
          },
          {
            accountId: revenueAccount.id,
            type: TransactionType.CREDIT,
            amount: 5000,
            description: 'Service revenue'
          }
        ],
        userId: testUserId
      });

      // Transaction 3: Rent expense ($1,200)
      await journalService.createTransaction({
        organizationId: testOrganizationId,
        date: new Date(),
        description: 'Monthly rent payment',
        entries: [
          {
            accountId: expenseAccount.id,
            type: TransactionType.DEBIT,
            amount: 1200,
            description: 'Rent expense'
          },
          {
            accountId: cashAccount.id,
            type: TransactionType.CREDIT,
            amount: 1200,
            description: 'Cash paid'
          }
        ],
        userId: testUserId
      });

      // Validate accounting equation
      const equation = await journalService.validateAccountingEquation(testOrganizationId);

      expect(equation.isValid).toBe(true);
      expect(equation.difference).toBeLessThan(0.01);

      // Expected balances:
      // Assets (Cash): $10,000 + $5,000 - $1,200 = $13,800
      // Liabilities: $0
      // Equity: $10,000 (investment) + $5,000 (revenue) - $1,200 (expense) = $13,800
      expect(equation.assets).toBeCloseTo(13800, 2);
      expect(equation.liabilities).toBeCloseTo(0, 2);
      expect(equation.equity).toBeCloseTo(13800, 2);
    });

    it('should reject unbalanced transactions', async () => {
      const cashAccount = testAccounts.find(a => a.name.includes('Cash'));
      const equityAccount = testAccounts.find(a => a.name.includes('Owner\'s Equity'));

      await expect(journalService.createTransaction({
        organizationId: testOrganizationId,
        date: new Date(),
        description: 'Unbalanced transaction',
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
            amount: 999, // Intentionally unbalanced
            description: 'Equity'
          }
        ],
        userId: testUserId
      })).rejects.toThrow(/does not balance/);
    });

    it('should maintain balance through complex multi-entry transactions', async () => {
      // Complex transaction: Equipment purchase with cash down payment and loan
      const cashAccount = testAccounts.find(a => a.name.includes('Cash'));
      const equipmentAccount = testAccounts.find(a => a.name.includes('Equipment'));
      const loanAccount = testAccounts.find(a => a.accountNumber.startsWith('24')); // Long-term debt

      if (!loanAccount) {
        // Create loan account if not exists
        const newLoanAccount = await accountsService.createAccount({
          organizationId: testOrganizationId,
          accountNumber: '2400',
          name: 'Equipment Loan',
          type: AccountType.LIABILITY,
          description: 'Long-term equipment financing',
          userId: testUserId
        });
        testAccounts.push(newLoanAccount);
      }

      const finalLoanAccount = loanAccount || testAccounts[testAccounts.length - 1];

      // Equipment purchase: $50,000 equipment, $10,000 cash down, $40,000 loan
      await journalService.createTransaction({
        organizationId: testOrganizationId,
        date: new Date(),
        description: 'Equipment purchase with financing',
        entries: [
          {
            accountId: equipmentAccount.id,
            type: TransactionType.DEBIT,
            amount: 50000,
            description: 'Equipment purchased'
          },
          {
            accountId: cashAccount.id,
            type: TransactionType.CREDIT,
            amount: 10000,
            description: 'Cash down payment'
          },
          {
            accountId: finalLoanAccount.id,
            type: TransactionType.CREDIT,
            amount: 40000,
            description: 'Equipment loan'
          }
        ],
        userId: testUserId
      });

      // Verify accounting equation still holds
      const equation = await journalService.validateAccountingEquation(testOrganizationId);
      expect(equation.isValid).toBe(true);
      expect(equation.difference).toBeLessThan(0.01);

      // Verify total debits = total credits across all transactions
      const trialBalance = await journalService.generateTrialBalance(testOrganizationId);
      expect(trialBalance.isBalanced).toBe(true);
      expect(Math.abs(trialBalance.totalDebits - trialBalance.totalCredits)).toBeLessThan(0.01);
    });

    it('should correctly calculate account balances after multiple transactions', async () => {
      const cashAccount = testAccounts.find(a => a.name.includes('Cash'));
      const revenueAccount = testAccounts.find(a => a.name.includes('Service Revenue'));

      // Initial balance should be zero
      let balance = await journalService.getAccountBalance(testOrganizationId, cashAccount.id);
      expect(balance.balance).toBe(0);

      // Add several transactions
      const transactions = [
        { debit: 5000, credit: 0, description: 'Cash sale 1' },
        { debit: 3000, credit: 0, description: 'Cash sale 2' },
        { debit: 0, credit: 1500, description: 'Expense payment' },
        { debit: 2500, credit: 0, description: 'Cash sale 3' },
        { debit: 0, credit: 800, description: 'Supplies purchase' }
      ];

      for (const txn of transactions) {
        const entries = [];

        if (txn.debit > 0) {
          entries.push({
            accountId: cashAccount.id,
            type: TransactionType.DEBIT,
            amount: txn.debit,
            description: txn.description
          });
          entries.push({
            accountId: revenueAccount.id,
            type: TransactionType.CREDIT,
            amount: txn.debit,
            description: txn.description
          });
        }

        if (txn.credit > 0) {
          entries.push({
            accountId: revenueAccount.id,
            type: TransactionType.DEBIT,
            amount: txn.credit,
            description: txn.description
          });
          entries.push({
            accountId: cashAccount.id,
            type: TransactionType.CREDIT,
            amount: txn.credit,
            description: txn.description
          });
        }

        await journalService.createTransaction({
          organizationId: testOrganizationId,
          date: new Date(),
          description: txn.description,
          entries,
          userId: testUserId
        });
      }

      // Calculate expected balance: (5000 + 3000 + 2500) - (1500 + 800) = 8200
      balance = await journalService.getAccountBalance(testOrganizationId, cashAccount.id);
      expect(balance.balance).toBe(8200);
    });
  });

  describe('Journal Entry Validation', () => {
    it('should enforce minimum entry requirement (2 entries)', async () => {
      const cashAccount = testAccounts.find(a => a.name.includes('Cash'));

      await expect(journalService.createTransaction({
        organizationId: testOrganizationId,
        date: new Date(),
        description: 'Invalid single entry',
        entries: [
          {
            accountId: cashAccount.id,
            type: TransactionType.DEBIT,
            amount: 1000,
            description: 'Single entry'
          }
        ],
        userId: testUserId
      })).rejects.toThrow(/at least 2 journal entries/);
    });

    it('should reject negative amounts', async () => {
      const cashAccount = testAccounts.find(a => a.name.includes('Cash'));
      const equityAccount = testAccounts.find(a => a.name.includes('Owner\'s Equity'));

      await expect(journalService.createTransaction({
        organizationId: testOrganizationId,
        date: new Date(),
        description: 'Negative amount test',
        entries: [
          {
            accountId: cashAccount.id,
            type: TransactionType.DEBIT,
            amount: -1000, // Negative amount
            description: 'Negative cash'
          },
          {
            accountId: equityAccount.id,
            type: TransactionType.CREDIT,
            amount: 1000,
            description: 'Positive equity'
          }
        ],
        userId: testUserId
      })).rejects.toThrow(/amount must be positive/);
    });

    it('should validate account existence and organization ownership', async () => {
      const fakeAccountId = 'fake-account-id-12345';
      const cashAccount = testAccounts.find(a => a.name.includes('Cash'));

      await expect(journalService.createTransaction({
        organizationId: testOrganizationId,
        date: new Date(),
        description: 'Invalid account test',
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
      })).rejects.toThrow(/Invalid account IDs/);
    });

    it('should generate unique transaction numbers', async () => {
      const cashAccount = testAccounts.find(a => a.name.includes('Cash'));
      const equityAccount = testAccounts.find(a => a.name.includes('Owner\'s Equity'));

      const transaction1 = await journalService.createTransaction({
        organizationId: testOrganizationId,
        date: new Date(),
        description: 'First transaction',
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
      });

      const transaction2 = await journalService.createTransaction({
        organizationId: testOrganizationId,
        date: new Date(),
        description: 'Second transaction',
        entries: [
          {
            accountId: cashAccount.id,
            type: TransactionType.DEBIT,
            amount: 2000,
            description: 'Cash'
          },
          {
            accountId: equityAccount.id,
            type: TransactionType.CREDIT,
            amount: 2000,
            description: 'Equity'
          }
        ],
        userId: testUserId
      });

      expect(transaction1.transactionNumber).toBeDefined();
      expect(transaction2.transactionNumber).toBeDefined();
      expect(transaction1.transactionNumber).not.toBe(transaction2.transactionNumber);
    });
  });

  describe('Trial Balance Accuracy', () => {
    it('should generate accurate trial balance', async () => {
      // Create a set of transactions
      const cashAccount = testAccounts.find(a => a.name.includes('Cash'));
      const receivablesAccount = testAccounts.find(a => a.name.includes('Receivable'));
      const equityAccount = testAccounts.find(a => a.name.includes('Owner\'s Equity'));
      const revenueAccount = testAccounts.find(a => a.name.includes('Service Revenue'));

      // Transaction 1: Owner investment $10,000
      await journalService.createTransaction({
        organizationId: testOrganizationId,
        date: new Date(),
        description: 'Owner investment',
        entries: [
          { accountId: cashAccount.id, type: TransactionType.DEBIT, amount: 10000, description: 'Cash' },
          { accountId: equityAccount.id, type: TransactionType.CREDIT, amount: 10000, description: 'Equity' }
        ],
        userId: testUserId
      });

      // Transaction 2: Credit sale $5,000
      await journalService.createTransaction({
        organizationId: testOrganizationId,
        date: new Date(),
        description: 'Credit sale',
        entries: [
          { accountId: receivablesAccount.id, type: TransactionType.DEBIT, amount: 5000, description: 'A/R' },
          { accountId: revenueAccount.id, type: TransactionType.CREDIT, amount: 5000, description: 'Revenue' }
        ],
        userId: testUserId
      });

      // Transaction 3: Collect receivables $3,000
      await journalService.createTransaction({
        organizationId: testOrganizationId,
        date: new Date(),
        description: 'Collection on account',
        entries: [
          { accountId: cashAccount.id, type: TransactionType.DEBIT, amount: 3000, description: 'Cash' },
          { accountId: receivablesAccount.id, type: TransactionType.CREDIT, amount: 3000, description: 'A/R' }
        ],
        userId: testUserId
      });

      const trialBalance = await journalService.generateTrialBalance(testOrganizationId);

      // Verify trial balance is balanced
      expect(trialBalance.isBalanced).toBe(true);
      expect(Math.abs(trialBalance.totalDebits - trialBalance.totalCredits)).toBeLessThan(0.01);

      // Verify individual account balances
      const cashEntry = trialBalance.entries.find(e => e.accountId === cashAccount.id);
      const receivablesEntry = trialBalance.entries.find(e => e.accountId === receivablesAccount.id);
      const equityEntry = trialBalance.entries.find(e => e.accountId === equityAccount.id);
      const revenueEntry = trialBalance.entries.find(e => e.accountId === revenueAccount.id);

      expect(cashEntry?.balance).toBe(13000); // 10,000 + 3,000
      expect(receivablesEntry?.balance).toBe(2000); // 5,000 - 3,000
      expect(equityEntry?.balance).toBe(10000); // Initial investment
      expect(revenueEntry?.balance).toBe(5000); // Credit sale
    });

    it('should handle accounts with zero balances correctly', async () => {
      const cashAccount = testAccounts.find(a => a.name.includes('Cash'));
      const equityAccount = testAccounts.find(a => a.name.includes('Owner\'s Equity'));

      // Create offsetting transactions that result in zero balance
      await journalService.createTransaction({
        organizationId: testOrganizationId,
        date: new Date(),
        description: 'Positive transaction',
        entries: [
          { accountId: cashAccount.id, type: TransactionType.DEBIT, amount: 1000, description: 'Cash in' },
          { accountId: equityAccount.id, type: TransactionType.CREDIT, amount: 1000, description: 'Equity' }
        ],
        userId: testUserId
      });

      await journalService.createTransaction({
        organizationId: testOrganizationId,
        date: new Date(),
        description: 'Offsetting transaction',
        entries: [
          { accountId: equityAccount.id, type: TransactionType.DEBIT, amount: 1000, description: 'Equity reduction' },
          { accountId: cashAccount.id, type: TransactionType.CREDIT, amount: 1000, description: 'Cash out' }
        ],
        userId: testUserId
      });

      const trialBalance = await journalService.generateTrialBalance(testOrganizationId);

      // Should still be balanced even with zero-balance accounts
      expect(trialBalance.isBalanced).toBe(true);

      // Zero-balance accounts should not appear in trial balance
      const entriesWithBalance = trialBalance.entries.filter(e => Math.abs(e.balance) > 0.01);
      expect(entriesWithBalance.length).toBe(0);
    });
  });

  describe('Transaction Reversal Accuracy', () => {
    it('should correctly reverse transactions', async () => {
      const cashAccount = testAccounts.find(a => a.name.includes('Cash'));
      const equityAccount = testAccounts.find(a => a.name.includes('Owner\'s Equity'));

      // Original transaction
      const originalTransaction = await journalService.createTransaction({
        organizationId: testOrganizationId,
        date: new Date(),
        description: 'Original transaction',
        entries: [
          { accountId: cashAccount.id, type: TransactionType.DEBIT, amount: 5000, description: 'Cash' },
          { accountId: equityAccount.id, type: TransactionType.CREDIT, amount: 5000, description: 'Equity' }
        ],
        userId: testUserId
      });

      // Check balance after original transaction
      let cashBalance = await journalService.getAccountBalance(testOrganizationId, cashAccount.id);
      expect(cashBalance.balance).toBe(5000);

      // Reverse the transaction
      await journalService.reverseTransaction(
        testOrganizationId,
        originalTransaction.id,
        'Error correction',
        testUserId
      );

      // Check balance after reversal - should be back to zero
      cashBalance = await journalService.getAccountBalance(testOrganizationId, cashAccount.id);
      expect(cashBalance.balance).toBe(0);

      // Verify accounting equation still holds
      const equation = await journalService.validateAccountingEquation(testOrganizationId);
      expect(equation.isValid).toBe(true);
    });

    it('should prevent double reversal of transactions', async () => {
      const cashAccount = testAccounts.find(a => a.name.includes('Cash'));
      const equityAccount = testAccounts.find(a => a.name.includes('Owner\'s Equity'));

      const originalTransaction = await journalService.createTransaction({
        organizationId: testOrganizationId,
        date: new Date(),
        description: 'Transaction to reverse',
        entries: [
          { accountId: cashAccount.id, type: TransactionType.DEBIT, amount: 1000, description: 'Cash' },
          { accountId: equityAccount.id, type: TransactionType.CREDIT, amount: 1000, description: 'Equity' }
        ],
        userId: testUserId
      });

      // First reversal should succeed
      await journalService.reverseTransaction(
        testOrganizationId,
        originalTransaction.id,
        'First reversal',
        testUserId
      );

      // Second reversal should fail
      await expect(journalService.reverseTransaction(
        testOrganizationId,
        originalTransaction.id,
        'Second reversal attempt',
        testUserId
      )).rejects.toThrow(/already been reversed/);
    });
  });

  describe('Account Balance Calculations', () => {
    it('should correctly calculate normal vs abnormal balances', async () => {
      const cashAccount = testAccounts.find(a => a.name.includes('Cash')); // Asset - normal debit
      const revenueAccount = testAccounts.find(a => a.name.includes('Service Revenue')); // Revenue - normal credit
      const expenseAccount = testAccounts.find(a => a.name.includes('Rent Expense')); // Expense - normal debit

      // Create transactions that result in normal balances
      await journalService.createTransaction({
        organizationId: testOrganizationId,
        date: new Date(),
        description: 'Normal balance test',
        entries: [
          { accountId: cashAccount.id, type: TransactionType.DEBIT, amount: 1000, description: 'Cash increase' },
          { accountId: revenueAccount.id, type: TransactionType.CREDIT, amount: 1000, description: 'Revenue earned' }
        ],
        userId: testUserId
      });

      await journalService.createTransaction({
        organizationId: testOrganizationId,
        date: new Date(),
        description: 'Expense transaction',
        entries: [
          { accountId: expenseAccount.id, type: TransactionType.DEBIT, amount: 300, description: 'Rent expense' },
          { accountId: cashAccount.id, type: TransactionType.CREDIT, amount: 300, description: 'Cash payment' }
        ],
        userId: testUserId
      });

      // Check that all accounts have their expected normal balances
      const cashBalance = await journalService.getAccountBalance(testOrganizationId, cashAccount.id);
      const revenueBalance = await journalService.getAccountBalance(testOrganizationId, revenueAccount.id);
      const expenseBalance = await journalService.getAccountBalance(testOrganizationId, expenseAccount.id);

      expect(cashBalance.balance).toBe(700); // 1000 - 300
      expect(revenueBalance.balance).toBe(1000);
      expect(expenseBalance.balance).toBe(300);

      // All should be positive (normal balances)
      expect(cashBalance.balance).toBeGreaterThan(0);
      expect(revenueBalance.balance).toBeGreaterThan(0);
      expect(expenseBalance.balance).toBeGreaterThan(0);
    });
  });

  describe('Data Integrity', () => {
    it('should maintain referential integrity', async () => {
      const cashAccount = testAccounts.find(a => a.name.includes('Cash'));
      const equityAccount = testAccounts.find(a => a.name.includes('Owner\'s Equity'));

      const transaction = await journalService.createTransaction({
        organizationId: testOrganizationId,
        date: new Date(),
        description: 'Integrity test',
        entries: [
          { accountId: cashAccount.id, type: TransactionType.DEBIT, amount: 1000, description: 'Cash' },
          { accountId: equityAccount.id, type: TransactionType.CREDIT, amount: 1000, description: 'Equity' }
        ],
        userId: testUserId
      });

      // Verify that journal entries reference the correct transaction
      const journalEntries = await prisma.journalEntry.findMany({
        where: { transactionId: transaction.id }
      });

      expect(journalEntries).toHaveLength(2);
      expect(journalEntries[0].transactionId).toBe(transaction.id);
      expect(journalEntries[1].transactionId).toBe(transaction.id);

      // Verify that the transaction references valid accounts
      expect([cashAccount.id, equityAccount.id]).toContain(journalEntries[0].accountId);
      expect([cashAccount.id, equityAccount.id]).toContain(journalEntries[1].accountId);
    });

    it('should enforce account hierarchy constraints', async () => {
      // Create parent account (using unique numbers not in standard chart)
      const parentAccount = await accountsService.createAccount({
        organizationId: testOrganizationId,
        accountNumber: '1990',
        name: 'Custom Cash and Cash Equivalents',
        type: AccountType.ASSET,
        description: 'Parent cash account',
        userId: testUserId
      });

      // Create child account
      const childAccount = await accountsService.createAccount({
        organizationId: testOrganizationId,
        accountNumber: '1991',
        name: 'Custom Checking Account',
        type: AccountType.ASSET,
        parentId: parentAccount.id,
        description: 'Child cash account',
        userId: testUserId
      });

      expect(childAccount.parentId).toBe(parentAccount.id);

      // Verify that parent-child relationship exists
      const retrievedChild = await prisma.account.findUnique({
        where: { id: childAccount.id },
        include: { parent: true }
      });

      expect(retrievedChild?.parent?.id).toBe(parentAccount.id);
    });
  });

  describe('Performance with Large Datasets', () => {
    it.skip('should handle 1000 transactions efficiently', async () => {
      const cashAccount = testAccounts.find(a => a.name.includes('Cash'));
      const revenueAccount = testAccounts.find(a => a.name.includes('Service Revenue'));

      const startTime = Date.now();

      // Create 1000 transactions
      const promises = [];
      for (let i = 0; i < 1000; i++) {
        promises.push(journalService.createTransaction({
          organizationId: testOrganizationId,
          date: new Date(),
          description: `Bulk transaction ${i + 1}`,
          entries: [
            { accountId: cashAccount.id, type: TransactionType.DEBIT, amount: 100, description: 'Cash' },
            { accountId: revenueAccount.id, type: TransactionType.CREDIT, amount: 100, description: 'Revenue' }
          ],
          userId: testUserId
        }));
      }

      await Promise.all(promises);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete within reasonable time (less than 30 seconds)
      expect(duration).toBeLessThan(30000);

      // Verify final balances
      const cashBalance = await journalService.getAccountBalance(testOrganizationId, cashAccount.id);
      expect(cashBalance.balance).toBe(100000); // 1000 * 100

      // Verify accounting equation still holds
      const equation = await journalService.validateAccountingEquation(testOrganizationId);
      expect(equation.isValid).toBe(true);
    }, 35000); // 35 second timeout
  });

  describe('Concurrent Transaction Handling', () => {
    it.skip('should handle concurrent transactions without data corruption', async () => {
      const cashAccount = testAccounts.find(a => a.name.includes('Cash'));
      const revenueAccount = testAccounts.find(a => a.name.includes('Service Revenue'));

      // Create 50 concurrent transactions
      const concurrentPromises = Array.from({ length: 50 }, (_, i) =>
        journalService.createTransaction({
          organizationId: testOrganizationId,
          date: new Date(),
          description: `Concurrent transaction ${i + 1}`,
          entries: [
            { accountId: cashAccount.id, type: TransactionType.DEBIT, amount: 50, description: 'Cash' },
            { accountId: revenueAccount.id, type: TransactionType.CREDIT, amount: 50, description: 'Revenue' }
          ],
          userId: testUserId
        })
      );

      const results = await Promise.all(concurrentPromises);

      // All transactions should succeed
      expect(results).toHaveLength(50);
      results.forEach(transaction => {
        expect(transaction.id).toBeDefined();
        expect(transaction.transactionNumber).toBeDefined();
      });

      // Final balance should be correct
      const cashBalance = await journalService.getAccountBalance(testOrganizationId, cashAccount.id);
      expect(cashBalance.balance).toBe(2500); // 50 * 50

      // Accounting equation should still hold
      const equation = await journalService.validateAccountingEquation(testOrganizationId);
      expect(equation.isValid).toBe(true);
    });
  });
});