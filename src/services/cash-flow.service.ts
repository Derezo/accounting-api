import { PrismaClient } from '@prisma/client';
import { FinancialStatementsService, CashFlowStatement, FinancialStatementPeriod } from './financial-statements.service';
import { BalanceSheetService } from './balance-sheet.service';
import { IncomeStatementService } from './income-statement.service';

import { FinancialMath, calculateRatio } from '../utils/financial';
export interface CashFlowAnalysis {
  organizationId: string;
  periods: CashFlowPeriod[];
  analysis: {
    operatingCashFlowTrend: CashFlowTrend;
    freeCashFlowAnalysis: FreeCashFlowAnalysis;
    workingCapitalAnalysis: WorkingCapitalAnalysis;
    cashFlowRatios: CashFlowRatios;
    cashConversionCycle: CashConversionCycle;
    seasonalPatterns?: SeasonalCashFlowPattern;
  };
  forecast?: CashFlowForecast;
  stressTesting?: CashFlowStressTest;
}

export interface CashFlowPeriod {
  label: string;
  period: FinancialStatementPeriod;
  cashFlowStatement: CashFlowStatement;
  directMethodStatement?: DirectMethodCashFlow;
}

export interface DirectMethodCashFlow {
  organizationId: string;
  period: FinancialStatementPeriod;
  operatingActivities: {
    cashReceivedFromCustomers: number;
    cashPaidToSuppliers: number;
    cashPaidToEmployees: number;
    cashPaidForOperatingExpenses: number;
    taxesPaid: number;
    interestPaid: number;
    netCashFromOperating: number;
  };
  investingActivities: {
    purchaseOfEquipment: number;
    saleOfEquipment: number;
    investmentPurchases: number;
    investmentSales: number;
    netCashFromInvesting: number;
  };
  financingActivities: {
    loanProceeds: number;
    loanRepayments: number;
    ownerContributions: number;
    ownerWithdrawals: number;
    dividendsPaid: number;
    netCashFromFinancing: number;
  };
  netCashChange: number;
  beginningCash: number;
  endingCash: number;
}

export interface CashFlowTrend {
  periods: Array<{
    period: string;
    operatingCashFlow: number;
    investingCashFlow: number;
    financingCashFlow: number;
    netCashFlow: number;
    freeCashFlow: number;
  }>;
  trendDirection: 'IMPROVING' | 'DETERIORATING' | 'STABLE' | 'VOLATILE';
  volatility: number;
  averageOperatingCashFlow: number;
  cashFlowQuality: CashFlowQuality;
}

export interface FreeCashFlowAnalysis {
  currentFreeCashFlow: number;
  freeCashFlowTrend: 'POSITIVE' | 'NEGATIVE' | 'IMPROVING' | 'DETERIORATING';
  freeCashFlowMargin: number;
  capitalEfficiency: number;
  reinvestmentRate: number;
  cashFlowToDebtRatio: number;
  periods: Array<{
    period: string;
    freeCashFlow: number;
    capitalExpenditures: number;
    freeCashFlowMargin: number;
  }>;
}

export interface WorkingCapitalAnalysis {
  currentWorkingCapital: number;
  workingCapitalTrend: 'INCREASING' | 'DECREASING' | 'STABLE';
  workingCapitalRatio: number;
  components: {
    accountsReceivable: WorkingCapitalComponent;
    inventory: WorkingCapitalComponent;
    accountsPayable: WorkingCapitalComponent;
    otherCurrentAssets: WorkingCapitalComponent;
    otherCurrentLiabilities: WorkingCapitalComponent;
  };
  efficiency: WorkingCapitalEfficiency;
}

export interface WorkingCapitalComponent {
  currentBalance: number;
  previousBalance: number;
  change: number;
  changePercent: number;
  daysOutstanding?: number;
  turnoverRatio?: number;
}

export interface WorkingCapitalEfficiency {
  cashConversionCycle: number;
  daysInReceivables: number;
  daysInInventory: number;
  daysInPayables: number;
  workingCapitalIntensity: number;
}

export interface CashFlowRatios {
  operatingCashFlowRatio: number;
  cashFlowMargin: number;
  cashReturnOnAssets: number;
  cashFlowToSalesRatio: number;
  cashFlowToDebtRatio: number;
  cashCoverageRatio: number;
  freeCashFlowYield: number;
  cashFlowPerShare?: number;
}

export interface CashConversionCycle {
  daysInReceivables: number;
  daysInInventory: number;
  daysInPayables: number;
  cashConversionCycle: number;
  efficiency: 'EXCELLENT' | 'GOOD' | 'AVERAGE' | 'POOR';
  benchmark?: number;
  recommendations: string[];
}

export interface SeasonalCashFlowPattern {
  quarters: Array<{
    quarter: string;
    averageOperatingCashFlow: number;
    indexVsAverage: number;
    volatility: number;
  }>;
  seasonalityScore: number;
  cashFlowGaps: Array<{
    period: string;
    gapAmount: number;
    severity: 'LOW' | 'MEDIUM' | 'HIGH';
  }>;
  recommendations: string[];
}

export interface CashFlowForecast {
  forecastPeriods: ForecastCashFlowPeriod[];
  assumptions: CashFlowForecastAssumptions;
  scenarios: CashFlowScenario[];
  confidenceLevel: number;
  riskFactors: string[];
}

export interface ForecastCashFlowPeriod {
  period: string;
  forecastOperatingCashFlow: number;
  forecastInvestingCashFlow: number;
  forecastFinancingCashFlow: number;
  forecastNetCashFlow: number;
  forecastCashBalance: number;
  confidenceInterval: {
    low: number;
    high: number;
  };
}

export interface CashFlowForecastAssumptions {
  salesGrowthRate: number;
  collectionDays: number;
  paymentDays: number;
  inventoryTurnover: number;
  capitalExpenditureRate: number;
  seasonalAdjustments: boolean;
  economicFactors: string[];
}

export interface CashFlowScenario {
  name: string;
  description: string;
  assumptions: Partial<CashFlowForecastAssumptions>;
  impact: {
    operatingCashFlowChange: number;
    totalCashFlowChange: number;
    cashBalanceImpact: number;
  };
}

export interface CashFlowStressTest {
  scenarios: StressTestScenario[];
  overallRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  recommendations: string[];
  contingencyPlans: ContingencyPlan[];
}

export interface StressTestScenario {
  name: string;
  description: string;
  shocks: {
    salesDecline?: number;
    costIncrease?: number;
    collectionDelays?: number;
    paymentAcceleration?: number;
  };
  results: {
    monthsOfCashRemaining: number;
    minimumCashBalance: number;
    recoveryTime: number; // months
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  };
}

export interface ContingencyPlan {
  trigger: string;
  actions: string[];
  estimatedCashImpact: number;
  implementationTime: number; // days
}

export interface CashFlowQuality {
  score: number; // 0-100
  factors: {
    operatingCashFlowStability: number;
    earningsQuality: number; // OCF vs Net Income ratio
    capitalIntensity: number;
    workingCapitalManagement: number;
  };
  classification: 'EXCELLENT' | 'GOOD' | 'AVERAGE' | 'POOR';
}

export class CashFlowService {
  private prisma: PrismaClient;
  private financialStatementsService: FinancialStatementsService;
  private balanceSheetService: BalanceSheetService;
  private incomeStatementService: IncomeStatementService;

  constructor(
    prisma: PrismaClient,
    financialStatementsService: FinancialStatementsService,
    balanceSheetService: BalanceSheetService,
    incomeStatementService: IncomeStatementService
  ) {
    this.prisma = prisma;
    this.financialStatementsService = financialStatementsService;
    this.balanceSheetService = balanceSheetService;
    this.incomeStatementService = incomeStatementService;
  }

  /**
   * Generate comprehensive cash flow analysis
   */
  async generateCashFlowAnalysis(
    organizationId: string,
    periods: FinancialStatementPeriod[],
    includeForecasting: boolean = false,
    includeStressTesting: boolean = false
  ): Promise<CashFlowAnalysis> {
    // Generate cash flow statements for each period
    const cashFlowPeriods: CashFlowPeriod[] = [];

    for (const period of periods.sort((a, b) => a.startDate.getTime() - b.startDate.getTime())) {
      const cashFlowStatement = await this.financialStatementsService.generateCashFlowStatement(organizationId, period);
      const directMethodStatement = await this.generateDirectMethodCashFlow(organizationId, period);

      cashFlowPeriods.push({
        label: period.label,
        period,
        cashFlowStatement,
        directMethodStatement
      });
    }

    // Perform comprehensive analysis
    const operatingCashFlowTrend = this.analyzeCashFlowTrends(cashFlowPeriods);
    const freeCashFlowAnalysis = await this.analyzeFreeCashFlow(organizationId, cashFlowPeriods);
    const workingCapitalAnalysis = await this.analyzeWorkingCapital(organizationId, cashFlowPeriods);
    const cashFlowRatios = await this.calculateCashFlowRatios(organizationId, cashFlowPeriods);
    const cashConversionCycle = await this.calculateCashConversionCycle(organizationId, periods[periods.length - 1]);

    let seasonalPatterns: SeasonalCashFlowPattern | undefined;
    if (periods.length >= 8) { // Need at least 2 years for seasonality
      seasonalPatterns = this.analyzeSeasonalCashFlowPatterns(cashFlowPeriods);
    }

    let forecast: CashFlowForecast | undefined;
    if (includeForecasting) {
      forecast = await this.generateCashFlowForecast(organizationId, cashFlowPeriods, 6);
    }

    let stressTesting: CashFlowStressTest | undefined;
    if (includeStressTesting) {
      stressTesting = await this.performCashFlowStressTest(organizationId, cashFlowPeriods);
    }

    return {
      organizationId,
      periods: cashFlowPeriods,
      analysis: {
        operatingCashFlowTrend,
        freeCashFlowAnalysis,
        workingCapitalAnalysis,
        cashFlowRatios,
        cashConversionCycle,
        seasonalPatterns
      },
      forecast,
      stressTesting
    };
  }

  /**
   * Generate direct method cash flow statement
   */
  async generateDirectMethodCashFlow(
    organizationId: string,
    period: FinancialStatementPeriod
  ): Promise<DirectMethodCashFlow> {
    // Get relevant data for direct method calculation
    const [invoices, expenses, payments] = await Promise.all([
      this.getInvoicesForPeriod(organizationId, period),
      this.getExpensesForPeriod(organizationId, period),
      this.getPaymentsForPeriod(organizationId, period)
    ]);

    // Calculate cash received from customers
    const cashReceivedFromCustomers = invoices
      .filter(inv => inv.status === 'PAID')
      .reduce((sum, inv) => sum + Number(inv.total), 0);

    // Calculate cash paid to suppliers and for expenses
    const supplierPayments = expenses
      .filter(exp => exp.paymentMethod && exp.paymentMethod !== 'CREDIT')
      .reduce((sum, exp) => sum + Number(exp.amount), 0);

    const employeePayments = expenses
      .filter(exp => exp.description.toLowerCase().includes('salary') ||
                    exp.description.toLowerCase().includes('wage'))
      .reduce((sum, exp) => sum + Number(exp.amount), 0);

    const operatingExpenses = expenses
      .filter(exp => !exp.description.toLowerCase().includes('salary') &&
                    !exp.description.toLowerCase().includes('wage') &&
                    !exp.description.toLowerCase().includes('equipment'))
      .reduce((sum, exp) => sum + Number(exp.amount), 0);

    const taxesPaid = expenses
      .filter(exp => exp.description.toLowerCase().includes('tax'))
      .reduce((sum, exp) => sum + Number(exp.amount), 0);

    const interestPaid = expenses
      .filter(exp => exp.description.toLowerCase().includes('interest'))
      .reduce((sum, exp) => sum + Number(exp.amount), 0);

    const netCashFromOperating = cashReceivedFromCustomers - supplierPayments -
                                employeePayments - operatingExpenses - taxesPaid - interestPaid;

    // Calculate investing activities (simplified)
    const equipmentPurchases = expenses
      .filter(exp => exp.description.toLowerCase().includes('equipment'))
      .reduce((sum, exp) => sum + Number(exp.amount), 0);

    const netCashFromInvesting = -equipmentPurchases; // Simplified

    // Calculate financing activities (would need additional data)
    const netCashFromFinancing = 0; // Simplified - would need loan and equity data

    const netCashChange = netCashFromOperating + netCashFromInvesting + netCashFromFinancing;

    // Get cash balances
    const beginningCash = await this.getCashBalanceAtDate(organizationId, period.startDate);
    const endingCash = beginningCash + netCashChange;

    return {
      organizationId,
      period,
      operatingActivities: {
        cashReceivedFromCustomers,
        cashPaidToSuppliers: supplierPayments,
        cashPaidToEmployees: employeePayments,
        cashPaidForOperatingExpenses: operatingExpenses,
        taxesPaid,
        interestPaid,
        netCashFromOperating
      },
      investingActivities: {
        purchaseOfEquipment: equipmentPurchases,
        saleOfEquipment: 0,
        investmentPurchases: 0,
        investmentSales: 0,
        netCashFromInvesting
      },
      financingActivities: {
        loanProceeds: 0,
        loanRepayments: 0,
        ownerContributions: 0,
        ownerWithdrawals: 0,
        dividendsPaid: 0,
        netCashFromFinancing
      },
      netCashChange,
      beginningCash,
      endingCash
    };
  }

  /**
   * Calculate cash conversion cycle
   */
  async calculateCashConversionCycle(
    organizationId: string,
    period: FinancialStatementPeriod
  ): Promise<CashConversionCycle> {
    // Get balance sheet data for calculation
    const balanceSheet = await this.financialStatementsService.generateBalanceSheet(organizationId, period.endDate);
    const incomeStatement = await this.financialStatementsService.generateIncomeStatement(organizationId, period);

    // Extract relevant balances
    const receivables = this.findAccountBalance(balanceSheet, ['receivable']);
    const inventory = this.findAccountBalance(balanceSheet, ['inventory']);
    const payables = this.findAccountBalance(balanceSheet, ['payable']);

    const revenue = incomeStatement.revenue.totalRevenue;
    const cogs = incomeStatement.expenses.costOfGoodsSold.subtotal;

    // Calculate days outstanding
    const daysInYear = 365;
    const daysInReceivables = revenue > 0 ? (receivables / revenue) * daysInYear : 0;
    const daysInInventory = cogs > 0 ? (inventory / cogs) * daysInYear : 0;
    const daysInPayables = cogs > 0 ? (payables / cogs) * daysInYear : 0;

    const cashConversionCycle = daysInReceivables + daysInInventory - daysInPayables;

    // Determine efficiency classification
    let efficiency: 'EXCELLENT' | 'GOOD' | 'AVERAGE' | 'POOR';
    if (cashConversionCycle <= 30) {
      efficiency = 'EXCELLENT';
    } else if (cashConversionCycle <= 60) {
      efficiency = 'GOOD';
    } else if (cashConversionCycle <= 90) {
      efficiency = 'AVERAGE';
    } else {
      efficiency = 'POOR';
    }

    // Generate recommendations
    const recommendations: string[] = [];
    if (daysInReceivables > 45) {
      recommendations.push('Consider improving collection processes to reduce days in receivables');
    }
    if (daysInInventory > 60) {
      recommendations.push('Optimize inventory management to reduce carrying costs');
    }
    if (daysInPayables < 30) {
      recommendations.push('Consider negotiating longer payment terms with suppliers');
    }

    return {
      daysInReceivables,
      daysInInventory,
      daysInPayables,
      cashConversionCycle,
      efficiency,
      recommendations
    };
  }

  /**
   * Generate cash flow forecast
   */
  async generateCashFlowForecast(
    organizationId: string,
    historicalPeriods: CashFlowPeriod[],
    forecastPeriods: number = 6
  ): Promise<CashFlowForecast> {
    // Analyze historical patterns
    const historicalOperatingCashFlow = historicalPeriods.map(p =>
      p.cashFlowStatement.operatingActivities.netCashFromOperating
    );

    const averageOperatingCashFlow = historicalOperatingCashFlow.reduce((sum, cf) => sum + cf, 0) /
                                   historicalOperatingCashFlow.length;

    // Default assumptions based on historical performance
    const assumptions: CashFlowForecastAssumptions = {
      salesGrowthRate: 5.0, // 5% growth assumption
      collectionDays: 30,
      paymentDays: 30,
      inventoryTurnover: 12,
      capitalExpenditureRate: 0.03, // 3% of revenue
      seasonalAdjustments: false,
      economicFactors: ['Inflation', 'Interest rates', 'Industry trends']
    };

    // Generate forecast periods
    const lastPeriod = historicalPeriods[historicalPeriods.length - 1];
    const lastCashBalance = lastPeriod.cashFlowStatement.summary.endingCash;

    const forecastData: ForecastCashFlowPeriod[] = [];
    let runningCashBalance = lastCashBalance;

    for (let i = 1; i <= forecastPeriods; i++) {
      const growthFactor = Math.pow(1 + assumptions.salesGrowthRate / 100, i / 12); // Monthly growth
      const forecastOperatingCashFlow = averageOperatingCashFlow * growthFactor;

      // Simplified investing and financing forecasts
      const forecastInvestingCashFlow = -forecastOperatingCashFlow * assumptions.capitalExpenditureRate;
      const forecastFinancingCashFlow = 0; // Assume no financing activities

      const forecastNetCashFlow = forecastOperatingCashFlow + forecastInvestingCashFlow + forecastFinancingCashFlow;
      runningCashBalance += forecastNetCashFlow;

      // Calculate confidence interval (simplified)
      const volatility = this.calculateVolatility(historicalOperatingCashFlow);
      const confidenceRange = forecastOperatingCashFlow * (volatility / 100);

      forecastData.push({
        period: `Forecast Month ${i}`,
        forecastOperatingCashFlow,
        forecastInvestingCashFlow,
        forecastFinancingCashFlow,
        forecastNetCashFlow,
        forecastCashBalance: runningCashBalance,
        confidenceInterval: {
          low: forecastOperatingCashFlow - confidenceRange,
          high: forecastOperatingCashFlow + confidenceRange
        }
      });
    }

    // Generate scenarios
    const scenarios: CashFlowScenario[] = [
      {
        name: 'Optimistic',
        description: 'Strong growth with improved efficiency',
        assumptions: { salesGrowthRate: 10.0, collectionDays: 25 },
        impact: { operatingCashFlowChange: 20, totalCashFlowChange: 15, cashBalanceImpact: 25000 }
      },
      {
        name: 'Pessimistic',
        description: 'Slow growth with operational challenges',
        assumptions: { salesGrowthRate: 0.0, collectionDays: 45 },
        impact: { operatingCashFlowChange: -15, totalCashFlowChange: -20, cashBalanceImpact: -15000 }
      }
    ];

    const confidenceLevel = Math.max(60, 90 - (forecastPeriods * 3)); // Decreasing confidence over time

    const riskFactors = [
      'Customer payment delays',
      'Increased competition',
      'Economic downturn',
      'Supply chain disruptions'
    ];

    return {
      forecastPeriods: forecastData,
      assumptions,
      scenarios,
      confidenceLevel,
      riskFactors
    };
  }

  // Private helper methods

  private analyzeCashFlowTrends(periods: CashFlowPeriod[]): CashFlowTrend {
    const trendData = periods.map(period => {
      const stmt = period.cashFlowStatement;
      return {
        period: period.label,
        operatingCashFlow: stmt.operatingActivities.netCashFromOperating,
        investingCashFlow: stmt.investingActivities.netCashFromInvesting,
        financingCashFlow: stmt.financingActivities.netCashFromFinancing,
        netCashFlow: stmt.summary.netCashChange,
        freeCashFlow: stmt.operatingActivities.netCashFromOperating + stmt.investingActivities.netCashFromInvesting
      };
    });

    const operatingCashFlows = trendData.map(d => d.operatingCashFlow);
    const averageOperatingCashFlow = operatingCashFlows.reduce((sum, cf) => sum + cf, 0) / operatingCashFlows.length;
    const volatility = this.calculateVolatility(operatingCashFlows);

    // Determine trend direction
    const recentCashFlows = operatingCashFlows.slice(-3);
    const trend = this.determineCashFlowTrend(recentCashFlows);

    // Calculate cash flow quality
    const cashFlowQuality = this.calculateCashFlowQuality(periods);

    return {
      periods: trendData,
      trendDirection: trend,
      volatility,
      averageOperatingCashFlow,
      cashFlowQuality
    };
  }

  private async analyzeFreeCashFlow(
    organizationId: string,
    periods: CashFlowPeriod[]
  ): Promise<FreeCashFlowAnalysis> {
    const currentPeriod = periods[periods.length - 1];
    const currentOperatingCashFlow = currentPeriod.cashFlowStatement.operatingActivities.netCashFromOperating;
    const currentInvestingCashFlow = currentPeriod.cashFlowStatement.investingActivities.netCashFromInvesting;
    const currentFreeCashFlow = currentOperatingCashFlow + currentInvestingCashFlow;

    // Get revenue for margin calculation
    const incomeStatement = await this.financialStatementsService.generateIncomeStatement(organizationId, currentPeriod.period);
    const revenue = incomeStatement.revenue.totalRevenue;
    const freeCashFlowMargin = revenue > 0 ? FinancialMath.toNumber(calculateRatio(currentFreeCashFlow, revenue)) : 0;

    // Analyze trend
    const freeCashFlows = periods.map(p =>
      p.cashFlowStatement.operatingActivities.netCashFromOperating +
      p.cashFlowStatement.investingActivities.netCashFromInvesting
    );

    let freeCashFlowTrend: 'POSITIVE' | 'NEGATIVE' | 'IMPROVING' | 'DETERIORATING';
    if (currentFreeCashFlow > 0) {
      const recentTrend = freeCashFlows.slice(-3);
      const isImproving = recentTrend.every((val, i) => i === 0 || val >= recentTrend[i - 1]);
      freeCashFlowTrend = isImproving ? 'IMPROVING' : 'POSITIVE';
    } else {
      freeCashFlowTrend = 'NEGATIVE';
    }

    // Calculate additional metrics (simplified)
    const capitalExpenditures = Math.abs(currentInvestingCashFlow);
    const capitalEfficiency = revenue > 0 ? FinancialMath.toNumber(calculateRatio(currentFreeCashFlow, revenue)) : 0;
    const reinvestmentRate = currentOperatingCashFlow > 0 ? FinancialMath.toNumber(calculateRatio(capitalExpenditures, currentOperatingCashFlow)) : 0;

    const periodData = periods.map(period => ({
      period: period.label,
      freeCashFlow: period.cashFlowStatement.operatingActivities.netCashFromOperating +
                   period.cashFlowStatement.investingActivities.netCashFromInvesting,
      capitalExpenditures: Math.abs(period.cashFlowStatement.investingActivities.netCashFromInvesting),
      freeCashFlowMargin: 0 // Would calculate with revenue data
    }));

    return {
      currentFreeCashFlow,
      freeCashFlowTrend,
      freeCashFlowMargin,
      capitalEfficiency,
      reinvestmentRate,
      cashFlowToDebtRatio: 0, // Would calculate with debt data
      periods: periodData
    };
  }

  private async analyzeWorkingCapital(
    organizationId: string,
    periods: CashFlowPeriod[]
  ): Promise<WorkingCapitalAnalysis> {
    // Get balance sheet data for working capital analysis
    const currentPeriod = periods[periods.length - 1];
    const previousPeriod = periods.length > 1 ? periods[periods.length - 2] : null;

    const currentBalanceSheet = await this.financialStatementsService.generateBalanceSheet(
      organizationId,
      currentPeriod.period.endDate
    );

    let previousBalanceSheet = null;
    if (previousPeriod) {
      previousBalanceSheet = await this.financialStatementsService.generateBalanceSheet(
        organizationId,
        previousPeriod.period.endDate
      );
    }

    const currentWorkingCapital = currentBalanceSheet.assets.currentAssets.subtotal -
                                 currentBalanceSheet.liabilities.currentLiabilities.subtotal;

    const previousWorkingCapital = previousBalanceSheet
      ? previousBalanceSheet.assets.currentAssets.subtotal - previousBalanceSheet.liabilities.currentLiabilities.subtotal
      : currentWorkingCapital;

    const workingCapitalChange = currentWorkingCapital - previousWorkingCapital;
    let workingCapitalTrend: 'INCREASING' | 'DECREASING' | 'STABLE';

    if (Math.abs(workingCapitalChange) < 1000) {
      workingCapitalTrend = 'STABLE';
    } else {
      workingCapitalTrend = workingCapitalChange > 0 ? 'INCREASING' : 'DECREASING';
    }

    const workingCapitalRatio = currentBalanceSheet.liabilities.currentLiabilities.subtotal > 0
      ? currentBalanceSheet.assets.currentAssets.subtotal / currentBalanceSheet.liabilities.currentLiabilities.subtotal
      : 0;

    // Analyze components (simplified)
    const components = {
      accountsReceivable: this.analyzeWorkingCapitalComponent('receivable', currentBalanceSheet, previousBalanceSheet),
      inventory: this.analyzeWorkingCapitalComponent('inventory', currentBalanceSheet, previousBalanceSheet),
      accountsPayable: this.analyzeWorkingCapitalComponent('payable', currentBalanceSheet, previousBalanceSheet),
      otherCurrentAssets: this.analyzeWorkingCapitalComponent('other', currentBalanceSheet, previousBalanceSheet),
      otherCurrentLiabilities: this.analyzeWorkingCapitalComponent('other', currentBalanceSheet, previousBalanceSheet)
    };

    // Calculate efficiency metrics
    const efficiency: WorkingCapitalEfficiency = {
      cashConversionCycle: 0, // Would calculate properly
      daysInReceivables: 0,   // Would calculate properly
      daysInInventory: 0,     // Would calculate properly
      daysInPayables: 0,      // Would calculate properly
      workingCapitalIntensity: 0 // Would calculate properly
    };

    return {
      currentWorkingCapital,
      workingCapitalTrend,
      workingCapitalRatio,
      components,
      efficiency
    };
  }

  private async calculateCashFlowRatios(
    organizationId: string,
    periods: CashFlowPeriod[]
  ): Promise<CashFlowRatios> {
    const currentPeriod = periods[periods.length - 1];
    const operatingCashFlow = currentPeriod.cashFlowStatement.operatingActivities.netCashFromOperating;

    // Get additional data for ratio calculations
    const balanceSheet = await this.financialStatementsService.generateBalanceSheet(organizationId, currentPeriod.period.endDate);
    const incomeStatement = await this.financialStatementsService.generateIncomeStatement(organizationId, currentPeriod.period);

    const totalAssets = balanceSheet.assets.totalAssets;
    const totalDebt = balanceSheet.liabilities.totalLiabilities;
    const sales = incomeStatement.revenue.totalRevenue;
    const currentLiabilities = balanceSheet.liabilities.currentLiabilities.subtotal;

    return {
      operatingCashFlowRatio: currentLiabilities > 0 ? operatingCashFlow / currentLiabilities : 0,
      cashFlowMargin: sales > 0 ? FinancialMath.toNumber(calculateRatio(operatingCashFlow, sales)) : 0,
      cashReturnOnAssets: totalAssets > 0 ? FinancialMath.toNumber(calculateRatio(operatingCashFlow, totalAssets)) : 0,
      cashFlowToSalesRatio: sales > 0 ? operatingCashFlow / sales : 0,
      cashFlowToDebtRatio: totalDebt > 0 ? operatingCashFlow / totalDebt : 0,
      cashCoverageRatio: 0, // Would calculate with interest expense data
      freeCashFlowYield: 0  // Would calculate with market value data
    };
  }

  private analyzeSeasonalCashFlowPatterns(periods: CashFlowPeriod[]): SeasonalCashFlowPattern {
    // Group periods by quarter
    const quarterlyData = new Map<string, number[]>();

    periods.forEach(period => {
      const quarter = this.getQuarter(period.period.startDate);
      if (!quarterlyData.has(quarter)) {
        quarterlyData.set(quarter, []);
      }
      quarterlyData.get(quarter)!.push(period.cashFlowStatement.operatingActivities.netCashFromOperating);
    });

    const quarters = Array.from(quarterlyData.entries()).map(([quarter, cashFlows]) => {
      const averageOperatingCashFlow = cashFlows.reduce((sum, cf) => sum + cf, 0) / cashFlows.length;
      const volatility = this.calculateVolatility(cashFlows);
      return {
        quarter,
        averageOperatingCashFlow,
        indexVsAverage: 100, // Will calculate after overall average
        volatility
      };
    });

    // Calculate overall average and indices
    const overallAverage = quarters.reduce((sum, q) => sum + q.averageOperatingCashFlow, 0) / quarters.length;
    quarters.forEach(quarter => {
      quarter.indexVsAverage = overallAverage > 0 ? FinancialMath.toNumber(calculateRatio(quarter.averageOperatingCashFlow, overallAverage)) : 100;
    });

    // Calculate seasonality score
    const seasonalVariation = quarters.map(q => Math.abs(q.indexVsAverage - 100));
    const seasonalityScore = seasonalVariation.reduce((sum, variation) => sum + variation, 0) / seasonalVariation.length;

    // Identify cash flow gaps
    const cashFlowGaps = periods
      .filter(p => p.cashFlowStatement.operatingActivities.netCashFromOperating < 0)
      .map(period => ({
        period: period.label,
        gapAmount: Math.abs(period.cashFlowStatement.operatingActivities.netCashFromOperating),
        severity: this.determineSeverity(Math.abs(period.cashFlowStatement.operatingActivities.netCashFromOperating))
      }));

    const recommendations: string[] = [];
    if (seasonalityScore > 20) {
      recommendations.push('Implement seasonal cash flow management strategies');
      recommendations.push('Consider establishing a credit line for seasonal fluctuations');
    }

    return {
      quarters,
      seasonalityScore,
      cashFlowGaps,
      recommendations
    };
  }

  private async performCashFlowStressTest(
    organizationId: string,
    periods: CashFlowPeriod[]
  ): Promise<CashFlowStressTest> {
    const currentCashBalance = periods[periods.length - 1].cashFlowStatement.summary.endingCash;
    const averageMonthlyOperatingCashFlow = periods.reduce((sum, p) =>
      sum + p.cashFlowStatement.operatingActivities.netCashFromOperating, 0) / periods.length;

    const scenarios: StressTestScenario[] = [
      {
        name: 'Mild Economic Downturn',
        description: '15% sales decline with 10% cost increase',
        shocks: { salesDecline: 15, costIncrease: 10 },
        results: {
          monthsOfCashRemaining: 0,
          minimumCashBalance: 0,
          recoveryTime: 0,
          riskLevel: 'MEDIUM'
        }
      },
      {
        name: 'Severe Recession',
        description: '30% sales decline with 20% cost increase',
        shocks: { salesDecline: 30, costIncrease: 20 },
        results: {
          monthsOfCashRemaining: 0,
          minimumCashBalance: 0,
          recoveryTime: 0,
          riskLevel: 'HIGH'
        }
      },
      {
        name: 'Customer Payment Crisis',
        description: 'Major customer delays payments by 90 days',
        shocks: { collectionDelays: 90 },
        results: {
          monthsOfCashRemaining: 0,
          minimumCashBalance: 0,
          recoveryTime: 0,
          riskLevel: 'HIGH'
        }
      }
    ];

    // Calculate stress test results
    scenarios.forEach(scenario => {
      let stressedCashFlow = averageMonthlyOperatingCashFlow;

      if (scenario.shocks.salesDecline) {
        stressedCashFlow *= (1 - scenario.shocks.salesDecline / 100);
      }

      if (scenario.shocks.costIncrease) {
        const costImpact = Math.abs(stressedCashFlow) * (scenario.shocks.costIncrease / 100);
        stressedCashFlow -= costImpact;
      }

      scenario.results.monthsOfCashRemaining = stressedCashFlow < 0
        ? currentCashBalance / Math.abs(stressedCashFlow)
        : 999; // Unlimited if positive cash flow

      scenario.results.minimumCashBalance = Math.min(0, currentCashBalance + (stressedCashFlow * 6));
      scenario.results.recoveryTime = stressedCashFlow < 0 ? 12 : 3; // Simplified recovery time
    });

    // Determine overall risk
    const highRiskScenarios = scenarios.filter(s => s.results.riskLevel === 'HIGH').length;
    const overallRisk = highRiskScenarios > 1 ? 'HIGH' :
                       highRiskScenarios > 0 ? 'MEDIUM' : 'LOW';

    const recommendations = [
      'Maintain adequate cash reserves',
      'Diversify customer base to reduce concentration risk',
      'Establish credit facilities for emergency funding'
    ];

    const contingencyPlans: ContingencyPlan[] = [
      {
        trigger: 'Cash balance falls below 2 months of expenses',
        actions: ['Accelerate collections', 'Delay non-essential payments', 'Consider short-term financing'],
        estimatedCashImpact: 50000,
        implementationTime: 30
      }
    ];

    return {
      scenarios,
      overallRisk,
      recommendations,
      contingencyPlans
    };
  }

  // Additional helper methods

  private calculateCashFlowQuality(periods: CashFlowPeriod[]): CashFlowQuality {
    const operatingCashFlows = periods.map(p => p.cashFlowStatement.operatingActivities.netCashFromOperating);
    const stability = 100 - this.calculateVolatility(operatingCashFlows);

    // Simplified quality score
    const score = Math.min(100, Math.max(0, (stability + 50) / 2)); // Simplified calculation

    return {
      score,
      factors: {
        operatingCashFlowStability: stability,
        earningsQuality: 80, // Would calculate OCF vs Net Income
        capitalIntensity: 70, // Would calculate based on capex
        workingCapitalManagement: 75 // Would calculate based on working capital efficiency
      },
      classification: score >= 80 ? 'EXCELLENT' : score >= 60 ? 'GOOD' : score >= 40 ? 'AVERAGE' : 'POOR'
    };
  }

  private analyzeWorkingCapitalComponent(
    componentType: string,
    currentBalanceSheet: any,
    previousBalanceSheet: any
  ): WorkingCapitalComponent {
    const currentBalance = this.findAccountBalance(currentBalanceSheet, [componentType]);
    const previousBalance = previousBalanceSheet ? this.findAccountBalance(previousBalanceSheet, [componentType]) : currentBalance;

    const change = currentBalance - previousBalance;
    const changePercent = previousBalance !== 0 ? (change / Math.abs(previousBalance)) * 100 : 0;

    return {
      currentBalance,
      previousBalance,
      change,
      changePercent
    };
  }

  private determineCashFlowTrend(cashFlows: number[]): 'IMPROVING' | 'DETERIORATING' | 'STABLE' | 'VOLATILE' {
    if (cashFlows.length < 2) return 'STABLE';

    const volatility = this.calculateVolatility(cashFlows);
    if (volatility > 50) return 'VOLATILE';

    const trend = cashFlows[cashFlows.length - 1] - cashFlows[0];
    const averageChange = trend / (cashFlows.length - 1);

    if (averageChange > 1000) return 'IMPROVING';
    if (averageChange < -1000) return 'DETERIORATING';
    return 'STABLE';
  }

  private determineSeverity(amount: number): 'LOW' | 'MEDIUM' | 'HIGH' {
    if (amount < 5000) return 'LOW';
    if (amount < 20000) return 'MEDIUM';
    return 'HIGH';
  }

  private calculateVolatility(values: number[]): number {
    if (values.length < 2) return 0;

    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }

  private findAccountBalance(balanceSheet: any, searchTerms: string[]): number {
    const allAccounts = [
      ...balanceSheet.assets.currentAssets.accounts,
      ...balanceSheet.assets.nonCurrentAssets.accounts,
      ...balanceSheet.liabilities.currentLiabilities.accounts,
      ...balanceSheet.liabilities.nonCurrentLiabilities.accounts,
      ...balanceSheet.equity.equity.accounts
    ];

    const matchingAccounts = allAccounts.filter((account: any) =>
      searchTerms.some(term =>
        account.accountName.toLowerCase().includes(term.toLowerCase())
      )
    );

    return matchingAccounts.reduce((sum: number, account: any) => sum + account.balance, 0);
  }

  private getQuarter(date: Date): string {
    const month = date.getMonth();
    if (month < 3) return 'Q1';
    if (month < 6) return 'Q2';
    if (month < 9) return 'Q3';
    return 'Q4';
  }

  // Data retrieval methods (simplified - would use actual database queries)

  private async getInvoicesForPeriod(organizationId: string, period: FinancialStatementPeriod) {
    return await this.prisma.invoice.findMany({
      where: {
        organizationId,
        issueDate: {
          gte: period.startDate,
          lte: period.endDate
        }
      }
    });
  }

  private async getExpensesForPeriod(organizationId: string, period: FinancialStatementPeriod) {
    return await this.prisma.expense.findMany({
      where: {
        organizationId,
        expenseDate: {
          gte: period.startDate,
          lte: period.endDate
        }
      }
    });
  }

  private async getPaymentsForPeriod(organizationId: string, period: FinancialStatementPeriod) {
    return await this.prisma.payment.findMany({
      where: {
        organizationId,
        paymentDate: {
          gte: period.startDate,
          lte: period.endDate
        }
      }
    });
  }

  private async getCashBalanceAtDate(organizationId: string, date: Date): Promise<number> {
    // Simplified - would calculate actual cash balance from transactions
    return 10000; // Placeholder
  }
}