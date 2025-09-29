import { Request, Response } from 'express';

import { JournalService } from '../services/journal.service';
import { AccountsService } from '../services/accounts.service';
import { ReportingService } from '../services/reporting.service';
import { AuditService } from '../services/audit.service';
import { JournalEntryValidator } from '../validators/journal-entry.validator';
import { BusinessType } from '../types/enums';


import { prisma } from '../config/database';
const auditService = new AuditService();
const journalService = new JournalService(prisma, auditService);
const accountsService = new AccountsService(prisma, auditService);
const reportingService = new ReportingService(prisma, journalService);
const journalValidator = new JournalEntryValidator(prisma);

export class AccountingController {
  /**
   * @desc    Create a new double-entry bookkeeping transaction with multiple journal entries
   * @route   POST /api/v1/organizations/:organizationId/accounting/transactions
   * @access  Private (ACCOUNTANT+)
   * @summary Create journal transaction
   * @description Creates a balanced journal transaction following double-entry bookkeeping principles. The transaction must have at least 2 entries and total debits must equal total credits. All amounts must be positive and accounts must exist and be active.
   * @param   {string} organizationId - Organization identifier
   * @body    {object} transaction - Transaction details
   * @body    {string} transaction.date - Transaction date (ISO 8601)
   * @body    {string} transaction.description - Transaction description
   * @body    {array} transaction.entries - Array of journal entries (minimum 2)
   * @body    {string} transaction.entries[].accountId - Account identifier
   * @body    {string} transaction.entries[].type - Entry type (DEBIT or CREDIT)
   * @body    {number} transaction.entries[].amount - Entry amount (positive number)
   * @body    {string} transaction.entries[].description - Entry description
   * @returns {object} 201 - Created transaction with generated transaction number
   * @returns {object} 400 - Validation error (unbalanced transaction, invalid accounts, etc.)
   * @returns {object} 401 - Authentication required
   * @returns {object} 403 - Insufficient permissions
   * @returns {object} 500 - Server error
   * @example
   * // Request body
   * {
   *   "date": "2024-01-15T00:00:00.000Z",
   *   "description": "Office supplies purchase",
   *   "entries": [
   *     {
   *       "accountId": "acc_123",
   *       "type": "DEBIT",
   *       "amount": 500.00,
   *       "description": "Office supplies expense"
   *     },
   *     {
   *       "accountId": "acc_456",
   *       "type": "CREDIT",
   *       "amount": 500.00,
   *       "description": "Cash payment"
   *     }
   *   ]
   * }
   *
   * // Response
   * {
   *   "id": "txn_789",
   *   "transactionNumber": "TXN-20240115-0001",
   *   "date": "2024-01-15T00:00:00.000Z",
   *   "description": "Office supplies purchase",
   *   "totalDebits": 500.00,
   *   "totalCredits": 500.00,
   *   "entries": [...],
   *   "createdAt": "2024-01-15T10:30:00.000Z"
   * }
   */
  static async createTransaction(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId } = req.params;
      const { date, description, entries } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      // Validate the transaction request
      const validation = await journalValidator.validateTransactionRequest({
        organizationId,
        date: new Date(date),
        description,
        entries,
        userId
      });

      if (!validation.isValid) {
        res.status(400).json({
          error: 'Transaction validation failed',
          details: validation.errors,
          warnings: validation.warnings
        });
        return;
      }

      const transaction = await journalService.createTransaction({
        organizationId,
        date: new Date(date),
        description,
        entries,
        userId
      });

      res.status(201).json({
        success: true,
        data: transaction,
        warnings: validation.warnings
      });
    } catch (error) {
      console.error('Error creating transaction:', error);
      res.status(500).json({
        error: 'Failed to create transaction',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * @desc    Create a business transaction from template
   * @route   POST /api/v1/organizations/:organizationId/accounting/business-transactions
   * @access  Private (ACCOUNTANT+)
   */
  static async createBusinessTransaction(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId } = req.params;
      const { transactionType, transactionData } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const transaction = await journalValidator.createBusinessTransaction(
        organizationId,
        transactionType,
        transactionData,
        userId
      );

      const createdTransaction = await journalService.createTransaction(transaction);

      res.status(201).json({
        success: true,
        data: createdTransaction
      });
    } catch (error) {
      console.error('Error creating business transaction:', error);
      res.status(500).json({
        error: 'Failed to create business transaction',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * @desc    Get available business transaction types
   * @route   GET /api/v1/organizations/:organizationId/accounting/transaction-types
   * @access  Private
   */
  static async getTransactionTypes(req: Request, res: Response): Promise<void> {
    try {
      const transactionTypes = journalValidator.getAvailableTransactionTypes();

      res.json({
        success: true,
        data: transactionTypes
      });
    } catch (error) {
      console.error('Error getting transaction types:', error);
      res.status(500).json({
        error: 'Failed to get transaction types',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * @desc    Reverse a transaction
   * @route   POST /api/v1/organizations/:organizationId/accounting/transactions/:transactionId/reverse
   * @access  Private (ACCOUNTANT+)
   */
  static async reverseTransaction(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId, transactionId } = req.params;
      const { reversalReason } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const reversalTransaction = await journalService.reverseTransaction(
        organizationId,
        transactionId,
        reversalReason,
        userId
      );

      res.json({
        success: true,
        data: reversalTransaction
      });
    } catch (error) {
      console.error('Error reversing transaction:', error);
      res.status(500).json({
        error: 'Failed to reverse transaction',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * @desc    Generate trial balance report showing all account balances
   * @route   GET /api/v1/organizations/:organizationId/accounting/trial-balance
   * @access  Private (ACCOUNTANT+)
   * @summary Generate trial balance
   * @description Generates a trial balance report that lists all accounts with their debit and credit balances as of a specific date. The trial balance verifies that total debits equal total credits, ensuring the books are in balance. Only accounts with non-zero balances are included.
   * @param   {string} organizationId - Organization identifier
   * @param   {string} [asOfDate] - Date for trial balance calculation (ISO 8601). Defaults to current date.
   * @returns {object} 200 - Trial balance with account entries and totals
   * @returns {object} 400 - Invalid date format or organization ID
   * @returns {object} 401 - Authentication required
   * @returns {object} 403 - Insufficient permissions
   * @returns {object} 500 - Server error
   * @example
   * // Response
   * {
   *   "success": true,
   *   "data": {
   *     "entries": [
   *       {
   *         "accountId": "acc_123",
   *         "accountNumber": "1000",
   *         "accountName": "Cash",
   *         "accountType": "ASSET",
   *         "debitBalance": 15000.00,
   *         "creditBalance": 0.00,
   *         "balance": 15000.00
   *       },
   *       {
   *         "accountId": "acc_456",
   *         "accountNumber": "4000",
   *         "accountName": "Sales Revenue",
   *         "accountType": "REVENUE",
   *         "debitBalance": 0.00,
   *         "creditBalance": 12000.00,
   *         "balance": 12000.00
   *       }
   *     ],
   *     "totalDebits": 15000.00,
   *     "totalCredits": 12000.00,
   *     "isBalanced": true,
   *     "asOfDate": "2024-01-31T00:00:00.000Z"
   *   }
   * }
   */
  static async generateTrialBalance(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId } = req.params;
      const { asOfDate } = req.query;

      const cutoffDate = asOfDate ? new Date(asOfDate as string) : new Date();

      const trialBalance = await journalService.generateTrialBalance(organizationId, cutoffDate);

      res.json({
        success: true,
        data: trialBalance
      });
    } catch (error) {
      console.error('Error generating trial balance:', error);
      res.status(500).json({
        error: 'Failed to generate trial balance',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * @desc    Generate comprehensive trial balance report
   * @route   GET /api/v1/organizations/:organizationId/accounting/trial-balance/report
   * @access  Private (ACCOUNTANT+)
   */
  static async generateTrialBalanceReport(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId } = req.params;
      const { asOfDate, periodStartDate } = req.query;

      const asOf = asOfDate ? new Date(asOfDate as string) : new Date();
      const periodStart = periodStartDate ? new Date(periodStartDate as string) : undefined;

      const report = await reportingService.generateTrialBalanceReport(
        organizationId,
        asOf,
        periodStart
      );

      res.json({
        success: true,
        data: report
      });
    } catch (error) {
      console.error('Error generating trial balance report:', error);
      res.status(500).json({
        error: 'Failed to generate trial balance report',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * @desc    Export trial balance
   * @route   GET /api/v1/organizations/:organizationId/accounting/trial-balance/export
   * @access  Private (ACCOUNTANT+)
   */
  static async exportTrialBalance(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId } = req.params;
      const { format = 'CSV', asOfDate } = req.query;

      const cutoffDate = asOfDate ? new Date(asOfDate as string) : new Date();

      const exportData = await reportingService.exportTrialBalance(
        organizationId,
        cutoffDate,
        format as 'CSV' | 'JSON' | 'PDF'
      );

      res.setHeader('Content-Type', exportData.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${exportData.filename}"`);
      res.send(exportData.content);
    } catch (error) {
      console.error('Error exporting trial balance:', error);
      res.status(500).json({
        error: 'Failed to export trial balance',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**


   * @desc    Validate fundamental accounting equation (Assets = Liabilities + Equity)


   * @route   GET /api/v1/organizations/:organizationId/accounting/validate


   * @access  Private (ACCOUNTANT+)


   * @summary Validate accounting equation


   * @description Validates that the fundamental accounting equation holds true for the organization's books. Returns detailed breakdown of assets, liabilities, and equity totals.


   * @param   {string} organizationId - Organization identifier


   * @returns {object} 200 - Validation results with equation breakdown


   * @returns {object} 401 - Authentication required


   * @returns {object} 403 - Insufficient permissions


   * @returns {object} 500 - Server error


   * @example


   * // Response


   * {


   *   "success": true,


   *   "data": {


   *     "isValid": true,


   *     "assets": 58500.00,


   *     "liabilities": 4000.00,


   *     "equity": 54500.00,


   *     "difference": 0.00


   *   }


   * }


   */
  static async validateAccountingEquation(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId } = req.params;

      const validation = await journalService.validateAccountingEquation(organizationId);

      res.json({
        success: true,
        data: validation
      });
    } catch (error) {
      console.error('Error validating accounting equation:', error);
      res.status(500).json({
        error: 'Failed to validate accounting equation',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * @desc    Get all accounts (chart of accounts)
   * @route   GET /api/v1/organizations/:organizationId/accounting/accounts
   * @access  Private
   */
  static async getChartOfAccounts(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId } = req.params;

      const chartOfAccounts = await accountsService.getChartOfAccounts(organizationId);

      res.json({
        success: true,
        data: chartOfAccounts
      });
    } catch (error) {
      console.error('Error getting chart of accounts:', error);
      res.status(500).json({
        error: 'Failed to get chart of accounts',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * @desc    Get account hierarchy
   * @route   GET /api/v1/organizations/:organizationId/accounting/accounts/hierarchy
   * @access  Private
   */
  static async getAccountHierarchy(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId } = req.params;

      const hierarchy = await accountsService.getAccountHierarchy(organizationId);

      res.json({
        success: true,
        data: hierarchy
      });
    } catch (error) {
      console.error('Error getting account hierarchy:', error);
      res.status(500).json({
        error: 'Failed to get account hierarchy',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * @desc    Create a new account in the chart of accounts
   * @route   POST /api/v1/organizations/:organizationId/accounting/accounts
   * @access  Private (ADMIN+)
   * @summary Create new account
   * @description Creates a new account in the organization's chart of accounts. Account numbers must be unique within the organization. Supports hierarchical account structure with parent-child relationships.
   * @param   {string} organizationId - Organization identifier
   * @body    {object} account - Account details
   * @body    {string} account.accountNumber - Unique account number (e.g., "1000", "4000")
   * @body    {string} account.name - Account name (e.g., "Cash", "Sales Revenue")
   * @body    {string} account.type - Account type (ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE)
   * @body    {string} [account.parentId] - Parent account ID for hierarchical structure
   * @body    {string} [account.description] - Account description
   * @body    {boolean} [account.isSystemAccount] - Whether this is a system-managed account
   * @returns {object} 201 - Created account with generated ID
   * @returns {object} 400 - Validation error (duplicate account number, invalid type, etc.)
   * @returns {object} 401 - Authentication required
   * @returns {object} 403 - Insufficient permissions (ADMIN+ required)
   * @returns {object} 500 - Server error
   * @example
   * // Request body
   * {
   *   "accountNumber": "1000",
   *   "name": "Cash",
   *   "type": "ASSET",
   *   "description": "Primary cash account for operations",
   *   "isSystemAccount": false
   * }
   *
   * // Response
   * {
   *   "success": true,
   *   "data": {
   *     "id": "acc_123",
   *     "accountNumber": "1000",
   *     "name": "Cash",
   *     "type": "ASSET",
   *     "description": "Primary cash account for operations",
   *     "isActive": true,
   *     "balance": 0.00,
   *     "organizationId": "org_456",
   *     "createdAt": "2024-01-15T10:30:00.000Z"
   *   }
   * }
   */
  static async createAccount(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId } = req.params;
      const { accountNumber, name, type, parentId, description, isSystemAccount } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const account = await accountsService.createAccount({
        organizationId,
        accountNumber,
        name,
        type,
        parentId,
        description,
        isSystemAccount,
        userId
      });

      res.status(201).json({
        success: true,
        data: account
      });
    } catch (error) {
      console.error('Error creating account:', error);
      res.status(500).json({
        error: 'Failed to create account',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * @desc    Update an account
   * @route   PUT /api/v1/organizations/:organizationId/accounting/accounts/:accountId
   * @access  Private (ADMIN+)
   */
  static async updateAccount(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId, accountId } = req.params;
      const updateData = req.body;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const account = await accountsService.updateAccount(
        organizationId,
        accountId,
        updateData,
        userId
      );

      res.json({
        success: true,
        data: account
      });
    } catch (error) {
      console.error('Error updating account:', error);
      res.status(500).json({
        error: 'Failed to update account',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * @desc    Get account by ID
   * @route   GET /api/v1/organizations/:organizationId/accounting/accounts/:accountId
   * @access  Private
   */
  static async getAccountById(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId, accountId } = req.params;

      const account = await accountsService.getAccountById(organizationId, accountId);

      res.json({
        success: true,
        data: account
      });
    } catch (error) {
      console.error('Error getting account:', error);
      res.status(500).json({
        error: 'Failed to get account',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**


   * @desc    Get current balance for a specific account


   * @route   GET /api/v1/organizations/:organizationId/accounting/accounts/:accountId/balance


   * @access  Private (ACCOUNTANT+)


   * @summary Get account balance


   * @description Retrieves the current balance for a specific account, including the last transaction date and balance calculation details.


   * @param   {string} organizationId - Organization identifier


   * @param   {string} accountId - Account identifier


   * @returns {object} 200 - Account balance with metadata


   * @returns {object} 404 - Account not found


   * @returns {object} 401 - Authentication required


   * @returns {object} 403 - Insufficient permissions


   * @returns {object} 500 - Server error


   * @example


   * // Response


   * {


   *   "success": true,


   *   "data": {


   *     "accountId": "acc_123",


   *     "accountNumber": "1000",


   *     "accountName": "Cash",


   *     "accountType": "ASSET",


   *     "balance": 15000.00,


   *     "lastTransactionDate": "2024-01-15T14:30:00.000Z"


   *   }


   * }


   */
  static async getAccountBalance(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId, accountId } = req.params;

      const balance = await journalService.getAccountBalance(organizationId, accountId);

      res.json({
        success: true,
        data: balance
      });
    } catch (error) {
      console.error('Error getting account balance:', error);
      res.status(500).json({
        error: 'Failed to get account balance',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * @desc    Delete an account
   * @route   DELETE /api/v1/organizations/:organizationId/accounting/accounts/:accountId
   * @access  Private (ADMIN+)
   */
  static async deleteAccount(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId, accountId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      await accountsService.deleteAccount(organizationId, accountId, userId);

      res.json({
        success: true,
        message: 'Account deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting account:', error);
      res.status(500).json({
        error: 'Failed to delete account',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * @desc    Create standard chart of accounts
   * @route   POST /api/v1/organizations/:organizationId/accounting/accounts/standard
   * @access  Private (ADMIN+)
   */
  static async createStandardChartOfAccounts(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId } = req.params;
      const { businessType } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const accounts = await accountsService.createStandardChartOfAccounts(
        organizationId,
        businessType as BusinessType,
        userId
      );

      res.status(201).json({
        success: true,
        data: accounts,
        message: `Created ${accounts.length} standard accounts for ${businessType} business`
      });
    } catch (error) {
      console.error('Error creating standard chart of accounts:', error);
      res.status(500).json({
        error: 'Failed to create standard chart of accounts',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}