
import { PaymentMethod, PaymentStatus } from '../types/enums';
import { Decimal } from '@prisma/client/runtime/library';
import { Prisma } from '@prisma/client';


import { prisma } from '../config/database';
import { FinancialMath, calculateRatio } from '../utils/financial';
export interface PaymentAnalyticsFilter {
  startDate?: Date;
  endDate?: Date;
  customerId?: string;
  paymentMethod?: PaymentMethod;
  status?: PaymentStatus;
  minAmount?: number;
  maxAmount?: number;
  currency?: string;
}

export interface PaymentTrends {
  period: string;
  totalAmount: number;
  totalCount: number;
  averageAmount: number;
  paymentsByMethod: Record<PaymentMethod, number>;
  paymentsByStatus: Record<PaymentStatus, number>;
}

export interface PaymentMethodAnalytics {
  method: PaymentMethod;
  totalAmount: number;
  totalCount: number;
  averageAmount: number;
  averageProcessingTime: number; // in hours
  successRate: number; // percentage
  totalFees: number;
  averageFee: number;
}

export interface CustomerPaymentBehavior {
  customerId: string;
  customerName: string;
  totalPayments: number;
  totalAmount: number;
  averagePaymentAmount: number;
  preferredPaymentMethod: PaymentMethod;
  averagePaymentDelay: number; // days from invoice due date
  onTimePaymentRate: number; // percentage
  lastPaymentDate?: Date;
  paymentFrequency: 'FREQUENT' | 'REGULAR' | 'OCCASIONAL' | 'RARE';
}

export interface PaymentForecast {
  period: string;
  predictedAmount: number;
  confidenceLevel: number;
  basedOnTrend: boolean;
}

export interface CashFlowProjection {
  date: Date;
  expectedInflow: number;
  confirmedInflow: number;
  pendingInflow: number;
  projectedBalance: number;
}

export interface PaymentAging {
  current: number; // 0-30 days
  thirtyDays: number; // 31-60 days
  sixtyDays: number; // 61-90 days
  ninetyDays: number; // 91+ days
  totalOutstanding: number;
}

export interface FraudDetectionAlert {
  paymentId: string;
  alertType: 'DUPLICATE_PAYMENT' | 'UNUSUAL_AMOUNT' | 'RAPID_SUCCESSION' | 'SUSPICIOUS_PATTERN';
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  description: string;
  detectedAt: Date;
  riskScore: number;
}

export class PaymentAnalyticsService {
  async getPaymentTrends(
    organizationId: string,
    filter: PaymentAnalyticsFilter,
    groupBy: 'DAY' | 'WEEK' | 'MONTH' | 'QUARTER' = 'MONTH'
  ): Promise<PaymentTrends[]> {
    const where = this.buildWhereClause(organizationId, filter);

    const payments = await prisma.payment.findMany({
      where,
      select: {
        amount: true,
        paymentMethod: true,
        status: true,
        paymentDate: true,
        currency: true
      }
    });

    // Group payments by period
    const groupedPayments = this.groupPaymentsByPeriod(payments, groupBy);

    return Object.entries(groupedPayments).map(([period, periodPayments]) => {
      const totalAmount = periodPayments.reduce((sum, p) => sum + p.amount, 0);
      const totalCount = periodPayments.length;

      const paymentsByMethod = periodPayments.reduce((acc, p) => {
        acc[p.paymentMethod as PaymentMethod] = (acc[p.paymentMethod as PaymentMethod] || 0) + 1;
        return acc;
      }, {} as Record<PaymentMethod, number>);

      const paymentsByStatus = periodPayments.reduce((acc, p) => {
        acc[p.status as PaymentStatus] = (acc[p.status as PaymentStatus] || 0) + 1;
        return acc;
      }, {} as Record<PaymentStatus, number>);

      return {
        period,
        totalAmount,
        totalCount,
        averageAmount: totalCount > 0 ? totalAmount / totalCount : 0,
        paymentsByMethod,
        paymentsByStatus
      };
    }).sort((a, b) => a.period.localeCompare(b.period));
  }

  async getPaymentMethodAnalytics(
    organizationId: string,
    filter: PaymentAnalyticsFilter
  ): Promise<PaymentMethodAnalytics[]> {
    const where = this.buildWhereClause(organizationId, filter);

    const payments = await prisma.payment.findMany({
      where,
      select: {
        paymentMethod: true,
        amount: true,
        status: true,
        processorFee: true,
        paymentDate: true,
        processedAt: true
      }
    });

    // Group by payment method
    const methodGroups = payments.reduce((acc, payment) => {
      const method = payment.paymentMethod as PaymentMethod;
      if (!acc[method]) {
        acc[method] = [];
      }
      acc[method].push(payment);
      return acc;
    }, {} as Record<PaymentMethod, any[]>);

    return Object.entries(methodGroups).map(([method, methodPayments]) => {
      const totalAmount = methodPayments.reduce((sum, p) => sum + p.amount, 0);
      const totalCount = methodPayments.length;
      const successfulPayments = methodPayments.filter(p => p.status === PaymentStatus.COMPLETED);
      const totalFees = methodPayments.reduce((sum, p) => sum + (p.processorFee || 0), 0);

      // Calculate average processing time
      const processingTimes = methodPayments
        .filter(p => p.processedAt && p.paymentDate)
        .map(p => (p.processedAt!.getTime() - p.paymentDate.getTime()) / (1000 * 60 * 60));

      const averageProcessingTime = processingTimes.length > 0
        ? processingTimes.reduce((sum, time) => sum + time, 0) / processingTimes.length
        : 0;

      return {
        method: method as PaymentMethod,
        totalAmount,
        totalCount,
        averageAmount: totalCount > 0 ? totalAmount / totalCount : 0,
        averageProcessingTime,
        successRate: totalCount > 0 ? FinancialMath.toNumber(calculateRatio(successfulPayments.length, totalCount)) : 0,
        totalFees,
        averageFee: totalCount > 0 ? totalFees / totalCount : 0
      };
    });
  }

  async getCustomerPaymentBehavior(
    organizationId: string,
    filter: PaymentAnalyticsFilter,
    limit: number = 100
  ): Promise<CustomerPaymentBehavior[]> {
    const where = this.buildWhereClause(organizationId, filter);

    const payments = await prisma.payment.findMany({
      where,
      include: {
        customer: {
          include: {
            person: true,
            business: true
          }
        },
        invoice: true
      }
    });

    // Group by customer
    const customerGroups = payments.reduce((acc, payment) => {
      const customerId = payment.customerId;
      if (!acc[customerId]) {
        acc[customerId] = [];
      }
      acc[customerId].push(payment);
      return acc;
    }, {} as Record<string, any[]>);

    const customerBehaviors = Object.entries(customerGroups).map(([customerId, customerPayments]) => {
      const customer = customerPayments[0].customer;
      const customerName = customer.person
        ? `${customer.person.firstName} ${customer.person.lastName}`
        : customer.business?.legalName || 'Unknown Customer';

      const totalAmount = customerPayments.reduce((sum, p) => sum + p.amount, 0);
      const totalPayments = customerPayments.length;

      // Find preferred payment method
      const methodCounts = customerPayments.reduce((acc, p) => {
        acc[p.paymentMethod] = (acc[p.paymentMethod] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      const preferredPaymentMethod = Object.entries(methodCounts)
        .sort(([,a], [,b]) => (b as number) - (a as number))[0][0] as PaymentMethod;

      // Calculate payment delays
      const paymentDelays = customerPayments
        .filter(p => p.invoice?.dueDate)
        .map(p => {
          const dueDate = p.invoice!.dueDate;
          const paymentDate = p.paymentDate;
          return Math.ceil((paymentDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
        });

      const averagePaymentDelay = paymentDelays.length > 0
        ? paymentDelays.reduce((sum, delay) => sum + delay, 0) / paymentDelays.length
        : 0;

      const onTimePayments = paymentDelays.filter(delay => delay <= 0).length;
      const onTimePaymentRate = paymentDelays.length > 0
        ? FinancialMath.toNumber(calculateRatio(onTimePayments, paymentDelays.length))
        : 100;

      // Determine payment frequency
      const daysSinceFirst = customerPayments.length > 1
        ? (Math.max(...customerPayments.map(p => p.paymentDate.getTime())) -
           Math.min(...customerPayments.map(p => p.paymentDate.getTime()))) / (1000 * 60 * 60 * 24)
        : 0;

      const paymentFrequency = this.determinePaymentFrequency(totalPayments, daysSinceFirst);

      const lastPaymentDate = new Date(Math.max(...customerPayments.map(p => p.paymentDate.getTime())));

      return {
        customerId,
        customerName,
        totalPayments,
        totalAmount,
        averagePaymentAmount: totalPayments > 0 ? totalAmount / totalPayments : 0,
        preferredPaymentMethod,
        averagePaymentDelay,
        onTimePaymentRate,
        lastPaymentDate,
        paymentFrequency
      };
    });

    // Sort by total amount and limit results
    return customerBehaviors
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .slice(0, limit);
  }

  private determinePaymentFrequency(totalPayments: number, daysSinceFirst: number): 'FREQUENT' | 'REGULAR' | 'OCCASIONAL' | 'RARE' {
    if (daysSinceFirst === 0) return 'RARE';

    const averageDaysBetweenPayments = daysSinceFirst / (totalPayments - 1);

    if (averageDaysBetweenPayments <= 30) return 'FREQUENT';
    if (averageDaysBetweenPayments <= 90) return 'REGULAR';
    if (averageDaysBetweenPayments <= 180) return 'OCCASIONAL';
    return 'RARE';
  }

  async getPaymentForecast(
    organizationId: string,
    periods: number = 6,
    periodType: 'MONTH' | 'QUARTER' = 'MONTH'
  ): Promise<PaymentForecast[]> {
    // Get historical payment data
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - (periods * 2)); // Look back twice as far for trend analysis

    const payments = await prisma.payment.findMany({
      where: {
        organizationId,
        status: PaymentStatus.COMPLETED,
        paymentDate: {
          gte: startDate,
          lte: endDate
        },
        deletedAt: null
      },
      select: {
        amount: true,
        paymentDate: true
      }
    });

    // Group by period
    const groupedPayments = this.groupPaymentsByPeriod(payments, periodType);
    const historicalAmounts = Object.values(groupedPayments)
      .map(periodPayments => periodPayments.reduce((sum, p) => sum + p.amount, 0));

    // Simple trend analysis
    const trend = this.calculateTrend(historicalAmounts);
    const lastAmount = historicalAmounts[historicalAmounts.length - 1] || 0;

    // Generate forecasts
    const forecasts: PaymentForecast[] = [];
    for (let i = 1; i <= periods; i++) {
      const forecastDate = new Date();
      if (periodType === 'MONTH') {
        forecastDate.setMonth(forecastDate.getMonth() + i);
      } else {
        forecastDate.setMonth(forecastDate.getMonth() + (i * 3));
      }

      const predictedAmount = Math.max(0, lastAmount + (trend * i));
      const confidenceLevel = Math.max(0.3, 0.9 - (i * 0.1)); // Decreasing confidence over time

      forecasts.push({
        period: this.formatPeriod(forecastDate, periodType),
        predictedAmount,
        confidenceLevel,
        basedOnTrend: true
      });
    }

    return forecasts;
  }

  private calculateTrend(amounts: number[]): number {
    if (amounts.length < 2) return 0;

    // Simple linear regression for trend
    const n = amounts.length;
    const sumX = (n * (n + 1)) / 2;
    const sumY = amounts.reduce((sum, amount) => sum + amount, 0);
    const sumXY = amounts.reduce((sum, amount, index) => sum + (amount * (index + 1)), 0);
    const sumX2 = (n * (n + 1) * (2 * n + 1)) / 6;

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    return slope;
  }

  async getCashFlowProjection(
    organizationId: string,
    days: number = 90
  ): Promise<CashFlowProjection[]> {
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + days);

    // Get pending payments (scheduled/planned)
    const pendingPayments = await prisma.payment.findMany({
      where: {
        organizationId,
        status: { in: [PaymentStatus.PENDING, PaymentStatus.PROCESSING] },
        paymentDate: {
          gte: startDate,
          lte: endDate
        },
        deletedAt: null
      },
      select: {
        amount: true,
        paymentDate: true,
        status: true
      }
    });

    // Get invoices with outstanding balances
    const outstandingInvoices = await prisma.invoice.findMany({
      where: {
        organizationId,
        balance: { gt: 0 },
        dueDate: {
          gte: startDate,
          lte: endDate
        },
        deletedAt: null
      },
      select: {
        balance: true,
        dueDate: true
      }
    });

    // Group by date
    const projections: CashFlowProjection[] = [];
    let runningBalance = 0;

    for (let i = 0; i <= days; i++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(currentDate.getDate() + i);

      const dayPendingPayments = pendingPayments.filter(p =>
        p.paymentDate.toDateString() === currentDate.toDateString()
      );

      const dayOutstandingInvoices = outstandingInvoices.filter(inv =>
        inv.dueDate.toDateString() === currentDate.toDateString()
      );

      const confirmedInflow = dayPendingPayments
        .filter(p => p.status === PaymentStatus.PROCESSING)
        .reduce((sum, p) => {
          const amount = p.amount instanceof Decimal ? p.amount.toNumber() : Number(p.amount);
          return sum + amount;
        }, 0);

      const pendingInflow = dayPendingPayments
        .filter(p => p.status === PaymentStatus.PENDING)
        .reduce((sum, p) => {
          const amount = p.amount instanceof Decimal ? p.amount.toNumber() : Number(p.amount);
          return sum + amount;
        }, 0);

      const expectedInflow = dayOutstandingInvoices
        .reduce((sum, inv) => {
          const balance = inv.balance instanceof Decimal ? inv.balance.toNumber() : Number(inv.balance);
          return sum + balance;
        }, 0);

      const totalInflow = confirmedInflow + (pendingInflow * 0.8) + (expectedInflow * 0.6); // Apply probability weights
      runningBalance += totalInflow;

      projections.push({
        date: new Date(currentDate),
        expectedInflow,
        confirmedInflow,
        pendingInflow,
        projectedBalance: runningBalance
      });
    }

    return projections;
  }

  async getPaymentAging(organizationId: string): Promise<PaymentAging> {
    const now = new Date();
    const thirty = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixty = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    const ninety = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    const outstandingInvoices = await prisma.invoice.findMany({
      where: {
        organizationId,
        balance: { gt: 0 },
        deletedAt: null
      },
      select: {
        balance: true,
        dueDate: true
      }
    });

    const aging = {
      current: 0,
      thirtyDays: 0,
      sixtyDays: 0,
      ninetyDays: 0,
      totalOutstanding: 0
    };

    outstandingInvoices.forEach(invoice => {
      const balance = invoice.balance instanceof Decimal ? invoice.balance.toNumber() : Number(invoice.balance);
      aging.totalOutstanding += balance;

      if (invoice.dueDate >= thirty) {
        aging.current += balance;
      } else if (invoice.dueDate >= sixty) {
        aging.thirtyDays += balance;
      } else if (invoice.dueDate >= ninety) {
        aging.sixtyDays += balance;
      } else {
        aging.ninetyDays += balance;
      }
    });

    return aging;
  }

  async detectFraudAlerts(
    organizationId: string,
    lookbackDays: number = 30
  ): Promise<FraudDetectionAlert[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - lookbackDays);

    const recentPayments = await prisma.payment.findMany({
      where: {
        organizationId,
        paymentDate: { gte: startDate },
        deletedAt: null
      },
      orderBy: { paymentDate: 'desc' }
    });

    const alerts: FraudDetectionAlert[] = [];

    // Check for duplicate payments
    const duplicates = this.findDuplicatePayments(recentPayments);
    duplicates.forEach(payment => {
      alerts.push({
        paymentId: payment.id,
        alertType: 'DUPLICATE_PAYMENT',
        severity: 'MEDIUM',
        description: `Potential duplicate payment detected for amount ${payment.amount.toNumber()}`,
        detectedAt: new Date(),
        riskScore: 60
      });
    });

    // Check for unusual amounts
    const unusualAmounts = this.findUnusualAmounts(recentPayments);
    unusualAmounts.forEach(payment => {
      alerts.push({
        paymentId: payment.id,
        alertType: 'UNUSUAL_AMOUNT',
        severity: 'LOW',
        description: `Payment amount ${payment.amount.toNumber()} is significantly higher than usual`,
        detectedAt: new Date(),
        riskScore: 30
      });
    });

    // Check for rapid succession payments
    const rapidPayments = this.findRapidSuccessionPayments(recentPayments);
    rapidPayments.forEach(payment => {
      alerts.push({
        paymentId: payment.id,
        alertType: 'RAPID_SUCCESSION',
        severity: 'HIGH',
        description: 'Multiple payments in rapid succession detected',
        detectedAt: new Date(),
        riskScore: 80
      });
    });

    return alerts.sort((a, b) => b.riskScore - a.riskScore);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private findDuplicatePayments(payments: any[]): any[] {
    const seen = new Map();
    const duplicates = [];

    for (const payment of payments) {
      const amount = payment.amount instanceof Decimal ? payment.amount.toNumber() : Number(payment.amount);
      const key = `${payment.customerId}-${amount}-${payment.paymentMethod}`;
      if (seen.has(key)) {
        const existing = seen.get(key);
        const timeDiff = Math.abs(payment.paymentDate.getTime() - existing.paymentDate.getTime());
        if (timeDiff < 24 * 60 * 60 * 1000) { // Within 24 hours
          duplicates.push(payment);
        }
      } else {
        seen.set(key, payment);
      }
    }

    return duplicates;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private findUnusualAmounts(payments: any[]): any[] {
    if (payments.length < 10) return []; // Need sufficient data

    const amounts = payments.map((p: any) => {
      const amt = p.amount;
      return amt instanceof Decimal ? amt.toNumber() : Number(amt);
    });
    const mean = amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length;
    const variance = amounts.reduce((sum, amount) => sum + Math.pow(amount - mean, 2), 0) / amounts.length;
    const stdDev = Math.sqrt(variance);

    const threshold = mean + (2 * stdDev); // 2 standard deviations above mean

    return payments.filter((payment: any) => {
      const amt = payment.amount instanceof Decimal ? payment.amount.toNumber() : Number(payment.amount);
      return amt > threshold;
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private findRapidSuccessionPayments(payments: any[]): any[] {
    const customerPayments = payments.reduce((acc: any, payment: any) => {
      if (!acc[payment.customerId]) {
        acc[payment.customerId] = [];
      }
      acc[payment.customerId].push(payment);
      return acc;
    }, {} as Record<string, any[]>);

    const rapidPayments: any[] = [];

    for (const [customerId, customerPaymentList] of Object.entries(customerPayments) as [string, any[]][]) {
      if (customerPaymentList.length < 3) continue;

      customerPaymentList.sort((a: any, b: any) => a.paymentDate.getTime() - b.paymentDate.getTime());

      for (let i = 0; i < customerPaymentList.length - 2; i++) {
        const payment1 = customerPaymentList[i];
        const payment2 = customerPaymentList[i + 1];
        const payment3 = customerPaymentList[i + 2];

        const timeDiff1 = payment2.paymentDate.getTime() - payment1.paymentDate.getTime();
        const timeDiff2 = payment3.paymentDate.getTime() - payment2.paymentDate.getTime();

        // If 3 payments within 1 hour
        if (timeDiff1 < 60 * 60 * 1000 && timeDiff2 < 60 * 60 * 1000) {
          rapidPayments.push(payment1, payment2, payment3);
        }
      }
    }

    return Array.from(new Set(rapidPayments)); // Remove duplicates
  }

  private buildWhereClause(organizationId: string, filter: PaymentAnalyticsFilter): Prisma.PaymentWhereInput {
    const where: Prisma.PaymentWhereInput = {
      organizationId,
      deletedAt: null
    };

    if (filter.startDate || filter.endDate) {
      where.paymentDate = {};
      if (filter.startDate) where.paymentDate.gte = filter.startDate;
      if (filter.endDate) where.paymentDate.lte = filter.endDate;
    }

    if (filter.customerId) where.customerId = filter.customerId;
    if (filter.paymentMethod) where.paymentMethod = filter.paymentMethod;
    if (filter.status) where.status = filter.status;
    if (filter.currency) where.currency = filter.currency;

    if (filter.minAmount || filter.maxAmount) {
      where.amount = {};
      if (filter.minAmount) where.amount.gte = filter.minAmount;
      if (filter.maxAmount) where.amount.lte = filter.maxAmount;
    }

    return where;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private groupPaymentsByPeriod(payments: any[], groupBy: 'DAY' | 'WEEK' | 'MONTH' | 'QUARTER'): Record<string, any[]> {
    return payments.reduce((acc: any, payment: any) => {
      const period = this.formatPeriod(payment.paymentDate, groupBy);
      if (!acc[period]) {
        acc[period] = [];
      }
      acc[period].push(payment);
      return acc;
    }, {} as Record<string, any[]>);
  }

  private formatPeriod(date: Date, groupBy: 'DAY' | 'WEEK' | 'MONTH' | 'QUARTER'): string {
    switch (groupBy) {
      case 'DAY':
        return date.toISOString().split('T')[0];
      case 'WEEK':
        const startOfWeek = new Date(date);
        startOfWeek.setDate(date.getDate() - date.getDay());
        return startOfWeek.toISOString().split('T')[0];
      case 'MONTH':
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      case 'QUARTER':
        const quarter = Math.floor(date.getMonth() / 3) + 1;
        return `${date.getFullYear()}-Q${quarter}`;
      default:
        return date.toISOString().split('T')[0];
    }
  }
}

export const paymentAnalyticsService = new PaymentAnalyticsService();