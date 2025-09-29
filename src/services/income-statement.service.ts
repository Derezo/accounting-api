import { PrismaClient } from '@prisma/client';
import { FinancialStatementsService, IncomeStatement, FinancialStatementPeriod } from './financial-statements.service';
import { AccountType } from '../types/enums';

import { FinancialMath, calculateRatio } from '../utils/financial';
export interface ComparativeIncomeStatement {
  organizationId: string;
  periods: IncomeStatementPeriod[];
  analysis: {
    trendAnalysis: RevenueTrendAnalysis;
    marginAnalysis: MarginAnalysis;
    expenseAnalysis: ExpenseAnalysis;
    seasonalityAnalysis?: SeasonalityAnalysis;
  };
  benchmarks?: IndustryBenchmarks;
}

export interface IncomeStatementPeriod {
  label: string;
  startDate: Date;
  endDate: Date;
  incomeStatement: IncomeStatement;
}

export interface RevenueTrendAnalysis {
  periods: PeriodData[];
  overallTrend: 'GROWING' | 'DECLINING' | 'STABLE' | 'VOLATILE';
  growthRate: number; // Annualized percentage
  seasonalPattern?: SeasonalPattern;
  revenueQuality: RevenueQualityMetrics;
}

export interface MarginAnalysis {
  grossMarginTrend: MarginTrend;
  operatingMarginTrend: MarginTrend;
  netMarginTrend: MarginTrend;
  marginStability: number; // 0-100 score
  marginDrivers: MarginDriver[];
}

export interface ExpenseAnalysis {
  fixedVsVariableCosts: {
    fixedCosts: number;
    variableCosts: number;
    fixedCostRatio: number;
    variableCostRatio: number;
  };
  expenseGrowthRates: ExpenseGrowthRate[];
  costControlEfficiency: number; // 0-100 score
  expenseCategories: ExpenseCategoryAnalysis[];
}

export interface PeriodData {
  period: string;
  revenue: number;
  grossProfit: number;
  operatingIncome: number;
  netIncome: number;
  growthRates: {
    revenueGrowth: number;
    grossProfitGrowth: number;
    operatingIncomeGrowth: number;
    netIncomeGrowth: number;
  };
}

export interface SeasonalPattern {
  quarters: QuarterlyPattern[];
  peakQuarter: string;
  lowQuarter: string;
  seasonalityIndex: number; // 0-100
}

export interface QuarterlyPattern {
  quarter: string;
  averageRevenue: number;
  indexVsAverage: number;
}

export interface RevenueQualityMetrics {
  revenueConcentration: number; // Percentage from top customer
  recurringRevenueRatio: number;
  revenueStability: number; // Coefficient of variation
  revenueGrowthConsistency: number;
}

export interface MarginTrend {
  currentMargin: number;
  trendDirection: 'IMPROVING' | 'DETERIORATING' | 'STABLE';
  averageChange: number;
  volatility: number;
  periods: Array<{ period: string; margin: number }>;
}

export interface MarginDriver {
  category: string;
  impact: number; // Basis points change in margin
  description: string;
}

export interface ExpenseGrowthRate {
  category: string;
  growthRate: number;
  efficiency: 'EFFICIENT' | 'CONCERNING' | 'OPTIMAL';
  recommendation?: string;
}

export interface ExpenseCategoryAnalysis {
  category: string;
  amount: number;
  percentOfRevenue: number;
  trend: 'INCREASING' | 'DECREASING' | 'STABLE';
  benchmark?: number;
  variance?: number;
}

export interface SeasonalityAnalysis {
  seasonalPattern: SeasonalPattern;
  seasonalityScore: number; // 0-100
  recommendations: string[];
}

export interface IndustryBenchmarks {
  industryCode: string;
  industryName: string;
  benchmarks: {
    grossMargin: { min: number; median: number; max: number };
    operatingMargin: { min: number; median: number; max: number };
    netMargin: { min: number; median: number; max: number };
    revenueGrowth: { min: number; median: number; max: number };
  };
  companyPosition: {
    grossMarginRank: number; // 1-100 percentile
    operatingMarginRank: number;
    netMarginRank: number;
    revenueGrowthRank: number;
  };
}

export interface BreakEvenAnalysis {
  fixedCosts: number;
  variableCostRatio: number;
  contributionMargin: number;
  breakEvenRevenue: number;
  breakEvenUnits?: number;
  marginOfSafety: number;
  operatingLeverage: number;
  scenarios: BreakEvenScenario[];
}

export interface BreakEvenScenario {
  name: string;
  revenueChange: number;
  expectedRevenue: number;
  expectedProfit: number;
  marginOfSafety: number;
}

export interface ProfitabilityForecast {
  forecastPeriods: ForecastPeriod[];
  assumptions: ForecastAssumptions;
  confidenceLevel: number; // 0-100
  riskFactors: string[];
}

export interface ForecastPeriod {
  period: string;
  forecastRevenue: number;
  forecastGrossProfit: number;
  forecastOperatingIncome: number;
  forecastNetIncome: number;
  confidenceInterval: {
    low: number;
    high: number;
  };
}

export interface ForecastAssumptions {
  revenueGrowthRate: number;
  grossMarginAssumption: number;
  fixedCostGrowthRate: number;
  variableCostRatio: number;
  seasonalAdjustments: boolean;
}

export class IncomeStatementService {
  private prisma: PrismaClient;
  private financialStatementsService: FinancialStatementsService;

  constructor(prisma: PrismaClient, financialStatementsService: FinancialStatementsService) {
    this.prisma = prisma;
    this.financialStatementsService = financialStatementsService;
  }

  /**
   * Generate comprehensive comparative income statement analysis
   */
  async generateComparativeIncomeStatement(
    organizationId: string,
    periods: FinancialStatementPeriod[],
    includeSeasonality: boolean = false
  ): Promise<ComparativeIncomeStatement> {
    // Generate income statements for each period
    const incomeStatementPeriods: IncomeStatementPeriod[] = [];

    for (const period of periods.sort((a, b) => a.startDate.getTime() - b.startDate.getTime())) {
      const incomeStatement = await this.financialStatementsService.generateIncomeStatement(organizationId, period);
      incomeStatementPeriods.push({
        label: period.label,
        startDate: period.startDate,
        endDate: period.endDate,
        incomeStatement
      });
    }

    // Perform comprehensive analysis
    const trendAnalysis = this.analyzeTrends(incomeStatementPeriods);
    const marginAnalysis = this.analyzeMargins(incomeStatementPeriods);
    const expenseAnalysis = await this.analyzeExpenses(organizationId, incomeStatementPeriods);

    let seasonalityAnalysis: SeasonalityAnalysis | undefined;
    if (includeSeasonality && periods.length >= 8) { // Need at least 2 years for seasonality
      seasonalityAnalysis = this.analyzeSeasonality(incomeStatementPeriods);
    }

    return {
      organizationId,
      periods: incomeStatementPeriods,
      analysis: {
        trendAnalysis,
        marginAnalysis,
        expenseAnalysis,
        seasonalityAnalysis
      }
    };
  }

  /**
   * Perform break-even analysis
   */
  async performBreakEvenAnalysis(
    organizationId: string,
    period: FinancialStatementPeriod
  ): Promise<BreakEvenAnalysis> {
    const incomeStatement = await this.financialStatementsService.generateIncomeStatement(organizationId, period);

    // Estimate fixed vs variable costs (simplified approach)
    const totalRevenue = incomeStatement.revenue.totalRevenue;
    const totalExpenses = incomeStatement.expenses.totalExpenses;
    const cogs = incomeStatement.expenses.costOfGoodsSold.subtotal;
    const operatingExpenses = incomeStatement.expenses.operatingExpenses.subtotal;

    // Assume COGS is variable, operating expenses are mostly fixed
    const variableCosts = cogs;
    const fixedCosts = operatingExpenses;

    const variableCostRatio = totalRevenue > 0 ? variableCosts / totalRevenue : 0;
    const contributionMargin = 1 - variableCostRatio;

    const breakEvenRevenue = contributionMargin > 0 ? fixedCosts / contributionMargin : 0;
    const currentRevenue = totalRevenue;
    const marginOfSafety = currentRevenue > 0 ? ((currentRevenue - breakEvenRevenue) / currentRevenue) * 100 : 0;

    // Operating leverage calculation
    const operatingLeverage = incomeStatement.profitability.operatingIncome > 0
      ? (incomeStatement.profitability.grossProfit / incomeStatement.profitability.operatingIncome)
      : 0;

    // Generate scenarios
    const scenarios: BreakEvenScenario[] = [
      { name: '10% Revenue Increase', revenueChange: 0.10, expectedRevenue: 0, expectedProfit: 0, marginOfSafety: 0 },
      { name: '10% Revenue Decrease', revenueChange: -0.10, expectedRevenue: 0, expectedProfit: 0, marginOfSafety: 0 },
      { name: '20% Revenue Increase', revenueChange: 0.20, expectedRevenue: 0, expectedProfit: 0, marginOfSafety: 0 },
      { name: '20% Revenue Decrease', revenueChange: -0.20, expectedRevenue: 0, expectedProfit: 0, marginOfSafety: 0 }
    ];

    scenarios.forEach(scenario => {
      scenario.expectedRevenue = currentRevenue * (1 + scenario.revenueChange);
      const expectedVariableCosts = scenario.expectedRevenue * variableCostRatio;
      scenario.expectedProfit = scenario.expectedRevenue - expectedVariableCosts - fixedCosts;
      scenario.marginOfSafety = scenario.expectedRevenue > 0
        ? ((scenario.expectedRevenue - breakEvenRevenue) / scenario.expectedRevenue) * 100
        : 0;
    });

    return {
      fixedCosts,
      variableCostRatio,
      contributionMargin,
      breakEvenRevenue,
      marginOfSafety,
      operatingLeverage,
      scenarios
    };
  }

  /**
   * Generate profitability forecast
   */
  async generateProfitabilityForecast(
    organizationId: string,
    historicalPeriods: FinancialStatementPeriod[],
    forecastPeriods: number = 4,
    assumptions?: Partial<ForecastAssumptions>
  ): Promise<ProfitabilityForecast> {
    // Analyze historical data to derive default assumptions
    const comparative = await this.generateComparativeIncomeStatement(organizationId, historicalPeriods);
    const trendAnalysis = comparative.analysis.trendAnalysis;

    // Default assumptions based on historical performance
    const defaultAssumptions: ForecastAssumptions = {
      revenueGrowthRate: trendAnalysis.growthRate,
      grossMarginAssumption: trendAnalysis.periods[trendAnalysis.periods.length - 1]?.grossProfit || 0,
      fixedCostGrowthRate: 3.0, // Assume 3% inflation
      variableCostRatio: 0.6, // Default 60% variable cost ratio
      seasonalAdjustments: false
    };

    const finalAssumptions = { ...defaultAssumptions, ...assumptions };

    // Generate forecast periods
    const lastPeriod = historicalPeriods[historicalPeriods.length - 1];
    const lastRevenue = comparative.periods[comparative.periods.length - 1].incomeStatement.revenue.totalRevenue;

    const forecastData: ForecastPeriod[] = [];

    for (let i = 1; i <= forecastPeriods; i++) {
      const periodName = `Forecast Period ${i}`;
      const growthFactor = Math.pow(1 + finalAssumptions.revenueGrowthRate / 100, i);
      const forecastRevenue = lastRevenue * growthFactor;

      const forecastGrossProfit = forecastRevenue * (finalAssumptions.grossMarginAssumption / 100);
      const forecastVariableCosts = forecastRevenue * finalAssumptions.variableCostRatio;
      const forecastFixedCosts = 50000 * Math.pow(1 + finalAssumptions.fixedCostGrowthRate / 100, i); // Estimate

      const forecastOperatingIncome = forecastGrossProfit - forecastFixedCosts;
      const forecastNetIncome = forecastOperatingIncome * 0.8; // Assume 20% other expenses/taxes

      // Calculate confidence interval (simplified)
      const volatility = this.calculateRevenueVolatility(comparative.periods);
      const confidenceRange = forecastRevenue * (volatility / 100);

      forecastData.push({
        period: periodName,
        forecastRevenue,
        forecastGrossProfit,
        forecastOperatingIncome,
        forecastNetIncome,
        confidenceInterval: {
          low: forecastRevenue - confidenceRange,
          high: forecastRevenue + confidenceRange
        }
      });
    }

    // Calculate overall confidence level
    const confidenceLevel = Math.max(50, 90 - (forecastPeriods * 5)); // Decreasing confidence over time

    const riskFactors = this.identifyRiskFactors(comparative);

    return {
      forecastPeriods: forecastData,
      assumptions: finalAssumptions,
      confidenceLevel,
      riskFactors
    };
  }

  /**
   * Export income statement analysis
   */
  async exportIncomeStatementAnalysis(
    analysis: ComparativeIncomeStatement,
    format: 'CSV' | 'JSON' | 'PDF'
  ): Promise<{ filename: string; content: string; mimeType: string }> {
    const timestamp = new Date().toISOString().split('T')[0];

    switch (format) {
      case 'CSV':
        return {
          filename: `income_statement_analysis_${timestamp}.csv`,
          content: this.formatAnalysisAsCSV(analysis),
          mimeType: 'text/csv'
        };

      case 'JSON':
        return {
          filename: `income_statement_analysis_${timestamp}.json`,
          content: JSON.stringify(analysis, null, 2),
          mimeType: 'application/json'
        };

      case 'PDF':
        throw new Error('PDF export not yet implemented');

      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  // Private helper methods

  private analyzeTrends(periods: IncomeStatementPeriod[]): RevenueTrendAnalysis {
    const periodData: PeriodData[] = periods.map((period, index) => {
      const prevPeriod = index > 0 ? periods[index - 1] : null;

      const revenueGrowth = prevPeriod
        ? ((period.incomeStatement.revenue.totalRevenue - prevPeriod.incomeStatement.revenue.totalRevenue) /
           prevPeriod.incomeStatement.revenue.totalRevenue) * 100
        : 0;

      const grossProfitGrowth = prevPeriod
        ? ((period.incomeStatement.profitability.grossProfit - prevPeriod.incomeStatement.profitability.grossProfit) /
           Math.abs(prevPeriod.incomeStatement.profitability.grossProfit)) * 100
        : 0;

      const operatingIncomeGrowth = prevPeriod
        ? ((period.incomeStatement.profitability.operatingIncome - prevPeriod.incomeStatement.profitability.operatingIncome) /
           Math.abs(prevPeriod.incomeStatement.profitability.operatingIncome)) * 100
        : 0;

      const netIncomeGrowth = prevPeriod
        ? ((period.incomeStatement.profitability.netIncome - prevPeriod.incomeStatement.profitability.netIncome) /
           Math.abs(prevPeriod.incomeStatement.profitability.netIncome)) * 100
        : 0;

      return {
        period: period.label,
        revenue: period.incomeStatement.revenue.totalRevenue,
        grossProfit: period.incomeStatement.profitability.grossProfit,
        operatingIncome: period.incomeStatement.profitability.operatingIncome,
        netIncome: period.incomeStatement.profitability.netIncome,
        growthRates: {
          revenueGrowth,
          grossProfitGrowth,
          operatingIncomeGrowth,
          netIncomeGrowth
        }
      };
    });

    // Calculate overall growth rate
    const revenues = periodData.map(p => p.revenue);
    const growthRate = this.calculateCAGR(revenues);

    // Determine overall trend
    const recentGrowthRates = periodData.slice(-3).map(p => p.growthRates.revenueGrowth);
    const averageRecentGrowth = recentGrowthRates.reduce((sum, rate) => sum + rate, 0) / recentGrowthRates.length;

    let overallTrend: 'GROWING' | 'DECLINING' | 'STABLE' | 'VOLATILE';
    const volatility = this.calculateVolatility(recentGrowthRates);

    if (volatility > 25) {
      overallTrend = 'VOLATILE';
    } else if (averageRecentGrowth > 5) {
      overallTrend = 'GROWING';
    } else if (averageRecentGrowth < -5) {
      overallTrend = 'DECLINING';
    } else {
      overallTrend = 'STABLE';
    }

    // Revenue quality metrics (simplified)
    const revenueQuality: RevenueQualityMetrics = {
      revenueConcentration: 25, // Would calculate from customer data
      recurringRevenueRatio: 60, // Would calculate from revenue type
      revenueStability: 100 - volatility,
      revenueGrowthConsistency: this.calculateGrowthConsistency(recentGrowthRates)
    };

    return {
      periods: periodData,
      overallTrend,
      growthRate,
      revenueQuality
    };
  }

  private analyzeMargins(periods: IncomeStatementPeriod[]): MarginAnalysis {
    const grossMargins = periods.map(p => p.incomeStatement.profitability.grossMargin);
    const operatingMargins = periods.map(p => p.incomeStatement.profitability.operatingMargin);
    const netMargins = periods.map(p => p.incomeStatement.profitability.netMargin);

    const grossMarginTrend = this.calculateMarginTrend('Gross Margin', grossMargins, periods);
    const operatingMarginTrend = this.calculateMarginTrend('Operating Margin', operatingMargins, periods);
    const netMarginTrend = this.calculateMarginTrend('Net Margin', netMargins, periods);

    // Calculate margin stability (inverse of volatility)
    const grossVolatility = this.calculateVolatility(grossMargins);
    const operatingVolatility = this.calculateVolatility(operatingMargins);
    const netVolatility = this.calculateVolatility(netMargins);
    const averageVolatility = (grossVolatility + operatingVolatility + netVolatility) / 3;
    const marginStability = Math.max(0, 100 - averageVolatility);

    // Identify margin drivers (simplified)
    const marginDrivers: MarginDriver[] = [
      {
        category: 'Cost Management',
        impact: operatingMarginTrend.averageChange * 100, // Convert to basis points
        description: 'Impact of operating expense management on margins'
      }
    ];

    return {
      grossMarginTrend,
      operatingMarginTrend,
      netMarginTrend,
      marginStability,
      marginDrivers
    };
  }

  private async analyzeExpenses(
    organizationId: string,
    periods: IncomeStatementPeriod[]
  ): Promise<ExpenseAnalysis> {
    // Simplified expense analysis
    const latestPeriod = periods[periods.length - 1];
    const totalExpenses = latestPeriod.incomeStatement.expenses.totalExpenses;
    const totalRevenue = latestPeriod.incomeStatement.revenue.totalRevenue;

    // Estimate fixed vs variable costs (simplified)
    const cogs = latestPeriod.incomeStatement.expenses.costOfGoodsSold.subtotal;
    const operatingExpenses = latestPeriod.incomeStatement.expenses.operatingExpenses.subtotal;

    const variableCosts = cogs; // Assume COGS is variable
    const fixedCosts = operatingExpenses; // Assume operating expenses are fixed

    const fixedCostRatio = totalRevenue > 0 ? FinancialMath.toNumber(calculateRatio(fixedCosts, totalRevenue)) : 0;
    const variableCostRatio = totalRevenue > 0 ? FinancialMath.toNumber(calculateRatio(variableCosts, totalRevenue)) : 0;

    // Calculate expense growth rates
    const expenseGrowthRates: ExpenseGrowthRate[] = [
      {
        category: 'Cost of Goods Sold',
        growthRate: this.calculateGrowthRate(periods.map(p => p.incomeStatement.expenses.costOfGoodsSold.subtotal)),
        efficiency: 'OPTIMAL'
      },
      {
        category: 'Operating Expenses',
        growthRate: this.calculateGrowthRate(periods.map(p => p.incomeStatement.expenses.operatingExpenses.subtotal)),
        efficiency: 'EFFICIENT'
      }
    ];

    // Cost control efficiency score (simplified)
    const revenueGrowth = this.calculateGrowthRate(periods.map(p => p.incomeStatement.revenue.totalRevenue));
    const expenseGrowth = this.calculateGrowthRate(periods.map(p => p.incomeStatement.expenses.totalExpenses));
    const costControlEfficiency = Math.max(0, 100 - Math.max(0, expenseGrowth - revenueGrowth) * 10);

    // Expense categories analysis
    const expenseCategories: ExpenseCategoryAnalysis[] = [
      {
        category: 'Cost of Goods Sold',
        amount: cogs,
        percentOfRevenue: totalRevenue > 0 ? FinancialMath.toNumber(calculateRatio(cogs, totalRevenue)) : 0,
        trend: 'STABLE'
      },
      {
        category: 'Operating Expenses',
        amount: operatingExpenses,
        percentOfRevenue: totalRevenue > 0 ? FinancialMath.toNumber(calculateRatio(operatingExpenses, totalRevenue)) : 0,
        trend: 'STABLE'
      }
    ];

    return {
      fixedVsVariableCosts: {
        fixedCosts,
        variableCosts,
        fixedCostRatio,
        variableCostRatio
      },
      expenseGrowthRates,
      costControlEfficiency,
      expenseCategories
    };
  }

  private analyzeSeasonality(periods: IncomeStatementPeriod[]): SeasonalityAnalysis {
    // Group periods by quarter for seasonality analysis
    const quarterlyData = new Map<string, number[]>();

    periods.forEach(period => {
      const quarter = this.getQuarter(period.startDate);
      if (!quarterlyData.has(quarter)) {
        quarterlyData.set(quarter, []);
      }
      quarterlyData.get(quarter)!.push(period.incomeStatement.revenue.totalRevenue);
    });

    const quarters: QuarterlyPattern[] = [];
    let totalAverage = 0;
    let count = 0;

    // Calculate average revenue for each quarter
    quarterlyData.forEach((revenues, quarter) => {
      const averageRevenue = revenues.reduce((sum, rev) => sum + rev, 0) / revenues.length;
      quarters.push({
        quarter,
        averageRevenue,
        indexVsAverage: 0 // Will calculate after we have overall average
      });
      totalAverage += averageRevenue;
      count++;
    });

    totalAverage = totalAverage / count;

    // Calculate indices
    quarters.forEach(quarter => {
      quarter.indexVsAverage = totalAverage > 0 ? FinancialMath.toNumber(calculateRatio(quarter.averageRevenue, totalAverage)) : 100;
    });

    // Find peak and low quarters
    const sortedQuarters = [...quarters].sort((a, b) => b.averageRevenue - a.averageRevenue);
    const peakQuarter = sortedQuarters[0]?.quarter || 'Q1';
    const lowQuarter = sortedQuarters[sortedQuarters.length - 1]?.quarter || 'Q4';

    // Calculate seasonality index
    const seasonalVariation = quarters.map(q => Math.abs(q.indexVsAverage - 100));
    const seasonalityIndex = seasonalVariation.reduce((sum, variation) => sum + variation, 0) / seasonalVariation.length;

    const seasonalPattern: SeasonalPattern = {
      quarters,
      peakQuarter,
      lowQuarter,
      seasonalityIndex
    };

    const seasonalityScore = Math.min(100, seasonalityIndex);

    const recommendations: string[] = [];
    if (seasonalityScore > 20) {
      recommendations.push('Consider seasonal cash flow planning');
      recommendations.push('Evaluate seasonal marketing strategies');
    }

    return {
      seasonalPattern,
      seasonalityScore,
      recommendations
    };
  }

  private calculateMarginTrend(
    name: string,
    margins: number[],
    periods: IncomeStatementPeriod[]
  ): MarginTrend {
    const currentMargin = margins[margins.length - 1] || 0;

    // Calculate period-over-period changes
    const changes = margins.slice(1).map((margin, index) => margin - margins[index]);
    const averageChange = changes.length > 0 ? changes.reduce((sum, change) => sum + change, 0) / changes.length : 0;
    const volatility = this.calculateVolatility(changes);

    let trendDirection: 'IMPROVING' | 'DETERIORATING' | 'STABLE';
    if (averageChange > 1) {
      trendDirection = 'IMPROVING';
    } else if (averageChange < -1) {
      trendDirection = 'DETERIORATING';
    } else {
      trendDirection = 'STABLE';
    }

    const periodData = margins.map((margin, index) => ({
      period: periods[index]?.label || `Period ${index + 1}`,
      margin
    }));

    return {
      currentMargin,
      trendDirection,
      averageChange,
      volatility,
      periods: periodData
    };
  }

  private calculateCAGR(values: number[]): number {
    if (values.length < 2) return 0;
    const startValue = values[0];
    const endValue = values[values.length - 1];
    const periods = values.length - 1;

    if (startValue <= 0) return 0;

    return (Math.pow(endValue / startValue, 1 / periods) - 1) * 100;
  }

  private calculateVolatility(values: number[]): number {
    if (values.length < 2) return 0;

    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }

  private calculateGrowthConsistency(growthRates: number[]): number {
    if (growthRates.length < 2) return 100;

    const volatility = this.calculateVolatility(growthRates);
    return Math.max(0, 100 - volatility);
  }

  private calculateGrowthRate(values: number[]): number {
    if (values.length < 2) return 0;

    const changes = values.slice(1).map((value, index) => {
      const previousValue = values[index];
      return previousValue !== 0 ? ((value - previousValue) / Math.abs(previousValue)) * 100 : 0;
    });

    return changes.reduce((sum, change) => sum + change, 0) / changes.length;
  }

  private calculateRevenueVolatility(periods: IncomeStatementPeriod[]): number {
    const revenues = periods.map(p => p.incomeStatement.revenue.totalRevenue);
    return this.calculateVolatility(revenues);
  }

  private identifyRiskFactors(analysis: ComparativeIncomeStatement): string[] {
    const risks: string[] = [];

    if (analysis.analysis.trendAnalysis.overallTrend === 'DECLINING') {
      risks.push('Declining revenue trend');
    }

    if (analysis.analysis.trendAnalysis.overallTrend === 'VOLATILE') {
      risks.push('High revenue volatility');
    }

    if (analysis.analysis.marginAnalysis.grossMarginTrend.trendDirection === 'DETERIORATING') {
      risks.push('Deteriorating gross margins');
    }

    if (analysis.analysis.expenseAnalysis.costControlEfficiency < 70) {
      risks.push('Poor cost control efficiency');
    }

    return risks;
  }

  private getQuarter(date: Date): string {
    const month = date.getMonth();
    if (month < 3) return 'Q1';
    if (month < 6) return 'Q2';
    if (month < 9) return 'Q3';
    return 'Q4';
  }

  private formatAnalysisAsCSV(analysis: ComparativeIncomeStatement): string {
    const lines: string[] = [];

    // Header
    lines.push('Income Statement Analysis');
    lines.push('');

    // Trend Analysis
    lines.push('TREND ANALYSIS');
    lines.push('Period,Revenue,Gross Profit,Operating Income,Net Income,Revenue Growth %');

    analysis.analysis.trendAnalysis.periods.forEach(period => {
      lines.push([
        period.period,
        FinancialMath.toString(FinancialMath.toCurrency(period.revenue)),
        FinancialMath.toString(FinancialMath.toCurrency(period.grossProfit)),
        FinancialMath.toString(FinancialMath.toCurrency(period.operatingIncome)),
        FinancialMath.toString(FinancialMath.toCurrency(period.netIncome)),
        `${period.growthRates.revenueGrowth}%`
      ].join(','));
    });

    lines.push('');
    lines.push(`Overall Trend,${analysis.analysis.trendAnalysis.overallTrend}`);
    lines.push(`Growth Rate,${analysis.analysis.trendAnalysis.growthRate}%`);

    return lines.join('\n');
  }
}