import { Request, Response } from 'express';

import { FinancialStatementsService } from '../services/financial-statements.service';
import { BalanceSheetService } from '../services/balance-sheet.service';
import { IncomeStatementService } from '../services/income-statement.service';
import { CashFlowService } from '../services/cash-flow.service';
import { JournalService } from '../services/journal.service';
import { ReportingService } from '../services/reporting.service';
import { AuditService } from '../services/audit.service';


import { prisma } from '../config/database';
const auditService = new AuditService();
const journalService = new JournalService(prisma, auditService);
const reportingService = new ReportingService(prisma, journalService);
const financialStatementsService = new FinancialStatementsService(prisma, journalService, reportingService);
const balanceSheetService = new BalanceSheetService(prisma, financialStatementsService);
const incomeStatementService = new IncomeStatementService(prisma, financialStatementsService);
const cashFlowService = new CashFlowService(prisma, financialStatementsService, balanceSheetService, incomeStatementService);

export class FinancialStatementsController {
  /**
   * @desc    Generate complete financial statements
   * @route   POST /api/v1/organizations/:organizationId/financial-statements/complete
   * @access  Private (ACCOUNTANT+)
   */
  static async generateCompleteFinancialStatements(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId } = req.params;
      const { startDate, endDate, label } = req.body;

      const period = {
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        label: label || `Period ending ${new Date(endDate).toLocaleDateString()}`
      };

      const statements = await financialStatementsService.generateFinancialStatements(organizationId, period);

      res.json({
        success: true,
        data: statements
      });
    } catch (error) {
      console.error('Error generating financial statements:', error);
      res.status(500).json({
        error: 'Failed to generate financial statements',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * @desc    Generate balance sheet
   * @route   GET /api/v1/organizations/:organizationId/financial-statements/balance-sheet
   * @access  Private (ACCOUNTANT+)
   */
  static async generateBalanceSheet(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId } = req.params;
      const { asOfDate } = req.query;

      const date = asOfDate ? new Date(asOfDate as string) : new Date();

      const balanceSheet = await financialStatementsService.generateBalanceSheet(organizationId, date);

      res.json({
        success: true,
        data: balanceSheet
      });
    } catch (error) {
      console.error('Error generating balance sheet:', error);
      res.status(500).json({
        error: 'Failed to generate balance sheet',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * @desc    Generate comparative balance sheet
   * @route   POST /api/v1/organizations/:organizationId/financial-statements/balance-sheet/comparative
   * @access  Private (ACCOUNTANT+)
   */
  static async generateComparativeBalanceSheet(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId } = req.params;
      const { dates, includeAnalysis = true } = req.body;

      const parsedDates = dates.map((date: string) => new Date(date));

      const comparativeBalanceSheet = await balanceSheetService.generateComparativeBalanceSheet(
        organizationId,
        parsedDates,
        includeAnalysis
      );

      res.json({
        success: true,
        data: comparativeBalanceSheet
      });
    } catch (error) {
      console.error('Error generating comparative balance sheet:', error);
      res.status(500).json({
        error: 'Failed to generate comparative balance sheet',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * @desc    Export balance sheet
   * @route   GET /api/v1/organizations/:organizationId/financial-statements/balance-sheet/export
   * @access  Private (ACCOUNTANT+)
   */
  static async exportBalanceSheet(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId } = req.params;
      const { format = 'CSV', asOfDate } = req.query;

      const date = asOfDate ? new Date(asOfDate as string) : new Date();
      const balanceSheet = await financialStatementsService.generateBalanceSheet(organizationId, date);

      const exportData = await balanceSheetService.exportBalanceSheet(
        balanceSheet,
        format as 'PDF' | 'CSV' | 'EXCEL' | 'JSON'
      );

      res.setHeader('Content-Type', exportData.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${exportData.filename}"`);
      res.send(exportData.content);
    } catch (error) {
      console.error('Error exporting balance sheet:', error);
      res.status(500).json({
        error: 'Failed to export balance sheet',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * @desc    Generate income statement
   * @route   GET /api/v1/organizations/:organizationId/financial-statements/income-statement
   * @access  Private (ACCOUNTANT+)
   */
  static async generateIncomeStatement(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId } = req.params;
      const { startDate, endDate, format } = req.query;

      if (!startDate || !endDate) {
        res.status(400).json({
          error: 'Missing required parameters',
          message: 'startDate and endDate are required'
        });
        return;
      }

      const period = {
        startDate: new Date(startDate as string),
        endDate: new Date(endDate as string),
        label: `Period ending ${new Date(endDate as string).toLocaleDateString()}`
      };

      const incomeStatement = await financialStatementsService.generateIncomeStatement(organizationId, period);

      res.json({
        success: true,
        data: incomeStatement
      });
    } catch (error) {
      console.error('Error generating income statement:', error);
      res.status(500).json({
        error: 'Failed to generate income statement',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * @desc    Generate comparative income statement
   * @route   POST /api/v1/organizations/:organizationId/financial-statements/income-statement/comparative
   * @access  Private (ACCOUNTANT+)
   */
  static async generateComparativeIncomeStatement(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId } = req.params;
      const { periods, includeSeasonality = false } = req.body;

      const parsedPeriods = periods.map((period: any) => ({
        startDate: new Date(period.startDate),
        endDate: new Date(period.endDate),
        label: period.label
      }));

      const comparativeIncomeStatement = await incomeStatementService.generateComparativeIncomeStatement(
        organizationId,
        parsedPeriods,
        includeSeasonality
      );

      res.json({
        success: true,
        data: comparativeIncomeStatement
      });
    } catch (error) {
      console.error('Error generating comparative income statement:', error);
      res.status(500).json({
        error: 'Failed to generate comparative income statement',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * @desc    Perform break-even analysis
   * @route   POST /api/v1/organizations/:organizationId/financial-statements/break-even
   * @access  Private (ACCOUNTANT+)
   */
  static async performBreakEvenAnalysis(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId } = req.params;
      const { startDate, endDate, label } = req.body;

      const period = {
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        label: label || `Break-even analysis for period ending ${new Date(endDate).toLocaleDateString()}`
      };

      const breakEvenAnalysis = await incomeStatementService.performBreakEvenAnalysis(organizationId, period);

      res.json({
        success: true,
        data: breakEvenAnalysis
      });
    } catch (error) {
      console.error('Error performing break-even analysis:', error);
      res.status(500).json({
        error: 'Failed to perform break-even analysis',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * @desc    Generate profitability forecast
   * @route   POST /api/v1/organizations/:organizationId/financial-statements/forecast
   * @access  Private (ACCOUNTANT+)
   */
  static async generateProfitabilityForecast(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId } = req.params;
      const { historicalPeriods, forecastPeriods = 4, assumptions } = req.body;

      const parsedPeriods = historicalPeriods.map((period: any) => ({
        startDate: new Date(period.startDate),
        endDate: new Date(period.endDate),
        label: period.label
      }));

      const forecast = await incomeStatementService.generateProfitabilityForecast(
        organizationId,
        parsedPeriods,
        forecastPeriods,
        assumptions
      );

      res.json({
        success: true,
        data: forecast
      });
    } catch (error) {
      console.error('Error generating profitability forecast:', error);
      res.status(500).json({
        error: 'Failed to generate profitability forecast',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * @desc    Generate cash flow statement
   * @route   GET /api/v1/organizations/:organizationId/financial-statements/cash-flow
   * @access  Private (ACCOUNTANT+)
   */
  static async generateCashFlowStatement(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId } = req.params;
      const { startDate, endDate, method, format } = req.query;

      if (!startDate || !endDate) {
        res.status(400).json({
          error: 'Missing required parameters',
          message: 'startDate and endDate are required'
        });
        return;
      }

      const period = {
        startDate: new Date(startDate as string),
        endDate: new Date(endDate as string),
        label: `Cash flow for period ending ${new Date(endDate as string).toLocaleDateString()}`
      };

      const cashFlowStatement = await financialStatementsService.generateCashFlowStatement(organizationId, period);

      res.json({
        success: true,
        data: cashFlowStatement
      });
    } catch (error) {
      console.error('Error generating cash flow statement:', error);
      res.status(500).json({
        error: 'Failed to generate cash flow statement',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * @desc    Generate comprehensive cash flow analysis
   * @route   POST /api/v1/organizations/:organizationId/financial-statements/cash-flow/analysis
   * @access  Private (ACCOUNTANT+)
   */
  static async generateCashFlowAnalysis(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId } = req.params;
      const { periods, includeForecasting = false, includeStressTesting = false } = req.body;

      const parsedPeriods = periods.map((period: any) => ({
        startDate: new Date(period.startDate),
        endDate: new Date(period.endDate),
        label: period.label
      }));

      const cashFlowAnalysis = await cashFlowService.generateCashFlowAnalysis(
        organizationId,
        parsedPeriods,
        includeForecasting,
        includeStressTesting
      );

      res.json({
        success: true,
        data: cashFlowAnalysis
      });
    } catch (error) {
      console.error('Error generating cash flow analysis:', error);
      res.status(500).json({
        error: 'Failed to generate cash flow analysis',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * @desc    Generate direct method cash flow statement
   * @route   POST /api/v1/organizations/:organizationId/financial-statements/cash-flow/direct
   * @access  Private (ACCOUNTANT+)
   */
  static async generateDirectMethodCashFlow(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId } = req.params;
      const { startDate, endDate, label } = req.body;

      const period = {
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        label: label || `Direct method cash flow for period ending ${new Date(endDate).toLocaleDateString()}`
      };

      const directCashFlow = await cashFlowService.generateDirectMethodCashFlow(organizationId, period);

      res.json({
        success: true,
        data: directCashFlow
      });
    } catch (error) {
      console.error('Error generating direct method cash flow:', error);
      res.status(500).json({
        error: 'Failed to generate direct method cash flow',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * @desc    Calculate cash conversion cycle
   * @route   POST /api/v1/organizations/:organizationId/financial-statements/cash-conversion-cycle
   * @access  Private (ACCOUNTANT+)
   */
  static async calculateCashConversionCycle(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId } = req.params;
      const { startDate, endDate, label } = req.body;

      const period = {
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        label: label || `Cash conversion cycle for period ending ${new Date(endDate).toLocaleDateString()}`
      };

      const cashConversionCycle = await cashFlowService.calculateCashConversionCycle(organizationId, period);

      res.json({
        success: true,
        data: cashConversionCycle
      });
    } catch (error) {
      console.error('Error calculating cash conversion cycle:', error);
      res.status(500).json({
        error: 'Failed to calculate cash conversion cycle',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * @desc    Calculate financial ratios
   * @route   GET /api/v1/organizations/:organizationId/financial-statements/ratios
   * @access  Private (ACCOUNTANT+)
   */
  static async calculateFinancialRatios(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId } = req.params;
      const { asOfDate, periodStart, periodEnd } = req.query;

      const bsDate = asOfDate ? new Date(asOfDate as string) : new Date();
      const isStart = periodStart ? new Date(periodStart as string) : new Date(new Date().getFullYear(), 0, 1);
      const isEnd = periodEnd ? new Date(periodEnd as string) : new Date();

      const [balanceSheet, incomeStatement] = await Promise.all([
        financialStatementsService.generateBalanceSheet(organizationId, bsDate),
        financialStatementsService.generateIncomeStatement(organizationId, {
          startDate: isStart,
          endDate: isEnd,
          label: `Income statement for ratio analysis`
        })
      ]);

      const ratios = financialStatementsService.calculateFinancialRatios(balanceSheet, incomeStatement);

      res.json({
        success: true,
        data: {
          ratios,
          balanceSheetDate: bsDate,
          incomeStatementPeriod: {
            startDate: isStart,
            endDate: isEnd
          }
        }
      });
    } catch (error) {
      console.error('Error calculating financial ratios:', error);
      res.status(500).json({
        error: 'Failed to calculate financial ratios',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * @desc    Export income statement analysis
   * @route   POST /api/v1/organizations/:organizationId/financial-statements/income-statement/export
   * @access  Private (ACCOUNTANT+)
   */
  static async exportIncomeStatementAnalysis(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId } = req.params;
      const { periods, format = 'CSV', includeSeasonality = false } = req.body;

      const parsedPeriods = periods.map((period: any) => ({
        startDate: new Date(period.startDate),
        endDate: new Date(period.endDate),
        label: period.label
      }));

      const analysis = await incomeStatementService.generateComparativeIncomeStatement(
        organizationId,
        parsedPeriods,
        includeSeasonality
      );

      const exportData = await incomeStatementService.exportIncomeStatementAnalysis(
        analysis,
        format as 'CSV' | 'JSON' | 'PDF'
      );

      res.setHeader('Content-Type', exportData.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${exportData.filename}"`);
      res.send(exportData.content);
    } catch (error) {
      console.error('Error exporting income statement analysis:', error);
      res.status(500).json({
        error: 'Failed to export income statement analysis',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * @desc    Validate balance sheet
   * @route   GET /api/v1/organizations/:organizationId/financial-statements/balance-sheet/validate
   * @access  Private (ACCOUNTANT+)
   */
  static async validateBalanceSheet(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId } = req.params;
      const { asOfDate } = req.query;

      const date = asOfDate ? new Date(asOfDate as string) : new Date();
      const balanceSheet = await financialStatementsService.generateBalanceSheet(organizationId, date);

      const validation = await balanceSheetService.validateBalanceSheet(balanceSheet);

      res.json({
        success: true,
        data: validation
      });
    } catch (error) {
      console.error('Error validating balance sheet:', error);
      res.status(500).json({
        error: 'Failed to validate balance sheet',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * @desc    Generate cash flow forecast
   * @route   POST /api/v1/organizations/:organizationId/financial-statements/cash-flow/forecast
   * @access  Private (ACCOUNTANT+)
   */
  static async generateCashFlowForecast(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId } = req.params;
      const { historicalPeriods, forecastPeriods = 6 } = req.body;

      const parsedPeriods = historicalPeriods.map((period: any) => ({
        label: period.label,
        period: {
          startDate: new Date(period.startDate),
          endDate: new Date(period.endDate),
          label: period.label
        },
        cashFlowStatement: period.cashFlowStatement // Would need to generate if not provided
      }));

      const forecast = await cashFlowService.generateCashFlowForecast(
        organizationId,
        parsedPeriods,
        forecastPeriods
      );

      res.json({
        success: true,
        data: forecast
      });
    } catch (error) {
      console.error('Error generating cash flow forecast:', error);
      res.status(500).json({
        error: 'Failed to generate cash flow forecast',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * @desc    Generate comprehensive financial statements
   * @route   GET /api/v1/organizations/:organizationId/financial-statements/comprehensive
   * @access  Private (ACCOUNTANT+)
   */
  static async generateComprehensiveStatements(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId } = req.params;
      const { startDate, endDate, format, includeRatios } = req.query;

      if (!startDate || !endDate) {
        res.status(400).json({
          error: 'Missing required parameters',
          message: 'startDate and endDate are required'
        });
        return;
      }

      const period = {
        startDate: new Date(startDate as string),
        endDate: new Date(endDate as string),
        label: `Comprehensive statements for period ending ${new Date(endDate as string).toLocaleDateString()}`
      };

      const [balanceSheet, incomeStatement, cashFlowStatement] = await Promise.all([
        financialStatementsService.generateBalanceSheet(organizationId, period.endDate),
        financialStatementsService.generateIncomeStatement(organizationId, period),
        financialStatementsService.generateCashFlowStatement(organizationId, period)
      ]);

      let financialRatios = null;
      if (includeRatios !== 'false') {
        financialRatios = financialStatementsService.calculateFinancialRatios(balanceSheet, incomeStatement);
      }

      res.json({
        success: true,
        data: {
          balanceSheet,
          incomeStatement,
          cashFlowStatement,
          ...(financialRatios && { financialRatios }),
          generatedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error generating comprehensive statements:', error);
      res.status(500).json({
        error: 'Failed to generate comprehensive statements',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * @desc    Generate comparative financial statements
   * @route   GET /api/v1/organizations/:organizationId/financial-statements/comparison
   * @access  Private (ACCOUNTANT+)
   */
  static async generateComparativeStatements(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId } = req.params;
      const {
        currentPeriodStart,
        currentPeriodEnd,
        comparativePeriodStart,
        comparativePeriodEnd,
        statementType
      } = req.query;

      if (!currentPeriodStart || !currentPeriodEnd || !comparativePeriodStart || !comparativePeriodEnd) {
        res.status(400).json({
          error: 'Missing required parameters',
          message: 'All period dates are required'
        });
        return;
      }

      const currentPeriod = {
        startDate: new Date(currentPeriodStart as string),
        endDate: new Date(currentPeriodEnd as string),
        label: 'Current Period'
      };

      const comparativePeriod = {
        startDate: new Date(comparativePeriodStart as string),
        endDate: new Date(comparativePeriodEnd as string),
        label: 'Comparative Period'
      };

      const stmtType = (statementType as string) || 'ALL';
      const results: any = {};

      if (stmtType === 'ALL' || stmtType === 'BALANCE_SHEET') {
        const [currentBS, comparativeBS] = await Promise.all([
          financialStatementsService.generateBalanceSheet(organizationId, currentPeriod.endDate),
          financialStatementsService.generateBalanceSheet(organizationId, comparativePeriod.endDate)
        ]);
        results.balanceSheet = { current: currentBS, comparative: comparativeBS };
      }

      if (stmtType === 'ALL' || stmtType === 'INCOME_STATEMENT') {
        const [currentIS, comparativeIS] = await Promise.all([
          financialStatementsService.generateIncomeStatement(organizationId, currentPeriod),
          financialStatementsService.generateIncomeStatement(organizationId, comparativePeriod)
        ]);
        results.incomeStatement = { current: currentIS, comparative: comparativeIS };
      }

      if (stmtType === 'ALL' || stmtType === 'CASH_FLOW_STATEMENT') {
        const [currentCF, comparativeCF] = await Promise.all([
          financialStatementsService.generateCashFlowStatement(organizationId, currentPeriod),
          financialStatementsService.generateCashFlowStatement(organizationId, comparativePeriod)
        ]);
        results.cashFlowStatement = { current: currentCF, comparative: comparativeCF };
      }

      res.json({
        success: true,
        data: {
          ...results,
          periods: {
            current: currentPeriod,
            comparative: comparativePeriod
          },
          generatedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error generating comparative statements:', error);
      res.status(500).json({
        error: 'Failed to generate comparative statements',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * @desc    Export financial statements
   * @route   POST /api/v1/organizations/:organizationId/financial-statements/export
   * @access  Private (ACCOUNTANT+)
   */
  static async exportFinancialStatements(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId } = req.params;
      const { statementTypes, periodStart, periodEnd, format, options = {} } = req.body;

      const period = {
        startDate: new Date(periodStart),
        endDate: new Date(periodEnd),
        label: `Export for period ending ${new Date(periodEnd).toLocaleDateString()}`
      };

      const statements: any = {};

      // Generate requested statements
      if (statementTypes.includes('BALANCE_SHEET')) {
        statements.balanceSheet = await financialStatementsService.generateBalanceSheet(organizationId, period.endDate);
      }
      if (statementTypes.includes('INCOME_STATEMENT')) {
        statements.incomeStatement = await financialStatementsService.generateIncomeStatement(organizationId, period);
      }
      if (statementTypes.includes('CASH_FLOW_STATEMENT')) {
        statements.cashFlowStatement = await financialStatementsService.generateCashFlowStatement(organizationId, period);
      }

      // Add ratios if requested
      if (options.includeRatios && statements.balanceSheet && statements.incomeStatement) {
        statements.financialRatios = financialStatementsService.calculateFinancialRatios(
          statements.balanceSheet,
          statements.incomeStatement
        );
      }

      // Add comparative data if requested
      if (options.includeComparative && options.comparativePeriodStart && options.comparativePeriodEnd) {
        const comparativePeriod = {
          startDate: new Date(options.comparativePeriodStart),
          endDate: new Date(options.comparativePeriodEnd),
          label: 'Comparative Period'
        };

        const comparativeStatements: any = {};
        if (statementTypes.includes('BALANCE_SHEET')) {
          comparativeStatements.balanceSheet = await financialStatementsService.generateBalanceSheet(organizationId, comparativePeriod.endDate);
        }
        if (statementTypes.includes('INCOME_STATEMENT')) {
          comparativeStatements.incomeStatement = await financialStatementsService.generateIncomeStatement(organizationId, comparativePeriod);
        }
        if (statementTypes.includes('CASH_FLOW_STATEMENT')) {
          comparativeStatements.cashFlowStatement = await financialStatementsService.generateCashFlowStatement(organizationId, comparativePeriod);
        }

        statements.comparative = comparativeStatements;
      }

      // For now, return JSON (would implement actual export formats like PDF/Excel later)
      if (format === 'PDF' || format === 'EXCEL' || format === 'CSV') {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="financial-statements-export.json"`);
      }

      res.json({
        success: true,
        data: {
          statements,
          period,
          format,
          options,
          exportedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error exporting financial statements:', error);
      res.status(500).json({
        error: 'Failed to export financial statements',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * @desc    Get financial statement generation history
   * @route   GET /api/v1/organizations/:organizationId/financial-statements/history
   * @access  Private (ACCOUNTANT+)
   */
  static async getFinancialStatementHistory(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId } = req.params;
      const { statementType, page = '1', limit = '20' } = req.query;

      const pageNum = parseInt(page as string, 10);
      const limitNum = parseInt(limit as string, 10);
      const offset = (pageNum - 1) * limitNum;

      // This would typically query a financial_statements table to get history
      // For now, return a mock response
      const mockStatements = [
        {
          id: '1',
          organizationId,
          statementType: 'BALANCE_SHEET',
          periodStart: '2024-01-01',
          periodEnd: '2024-03-31',
          currency: 'CAD',
          generatedAt: '2024-04-01T10:00:00Z',
          generatedBy: 'user-123'
        },
        {
          id: '2',
          organizationId,
          statementType: 'INCOME_STATEMENT',
          periodStart: '2024-01-01',
          periodEnd: '2024-03-31',
          currency: 'CAD',
          generatedAt: '2024-04-01T10:30:00Z',
          generatedBy: 'user-123'
        }
      ];

      const filteredStatements = statementType
        ? mockStatements.filter(stmt => stmt.statementType === statementType)
        : mockStatements;

      const total = filteredStatements.length;
      const totalPages = Math.ceil(total / limitNum);
      const paginatedStatements = filteredStatements.slice(offset, offset + limitNum);

      res.json({
        success: true,
        data: {
          statements: paginatedStatements,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            totalPages
          }
        }
      });
    } catch (error) {
      console.error('Error retrieving financial statement history:', error);
      res.status(500).json({
        error: 'Failed to retrieve financial statement history',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}