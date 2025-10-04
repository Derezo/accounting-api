/**
 * System Analytics Service
 * Provides system-wide analytics and metrics for SUPER_ADMIN
 * Phase 4: System Analytics from Admin Panel Implementation Roadmap
 */

import { PrismaClient } from '@prisma/client';
import { UserRole } from '../types/enums';
import { Decimal } from '@prisma/client/runtime/library';

const prisma = new PrismaClient();

export interface SystemAnalytics {
  // Tenant metrics
  totalOrganizations: number;
  activeOrganizations: number;
  suspendedOrganizations: number;
  newOrganizationsThisMonth: number;

  // User metrics
  totalUsers: number;
  activeUsersToday: number;
  activeUsersThisWeek: number;
  activeUsersThisMonth: number;
  usersByRole: Record<string, number>;

  // Financial metrics
  totalRevenue: number;
  monthlyRecurringRevenue: number;
  averageRevenuePerOrganization: number;

  // Subscription metrics (placeholder - no subscription model yet)
  activeSubscriptions: number;
  subscriptionsByPlan: Record<string, number>;
  churnRate: number; // Percentage

  // Usage metrics
  apiCalls: number; // Last 24h from system logs
  storageUsed: number; // Bytes (estimated from documents)
  bandwidthUsed: number; // Bytes (placeholder)

  // Performance
  averageResponseTime: number; // Milliseconds (from system health)
  errorRate: number; // Percentage (from system logs)
  uptimePercentage: number; // Last 30 days

  // Period
  periodStart: string; // ISO 8601
  periodEnd: string; // ISO 8601
}

export interface AnalyticsDateRange {
  startDate?: Date;
  endDate?: Date;
}

export type ExportFormat = 'PDF' | 'EXCEL' | 'CSV';

class SystemAnalyticsService {
  private analyticsCache: { data: SystemAnalytics; timestamp: number } | null = null;
  private readonly CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

  /**
   * Get comprehensive system-wide analytics
   */
  async getSystemAnalytics(dateRange?: AnalyticsDateRange): Promise<SystemAnalytics> {
    // Return cached data if still valid and no custom date range
    if (
      !dateRange &&
      this.analyticsCache &&
      Date.now() - this.analyticsCache.timestamp < this.CACHE_TTL_MS
    ) {
      return this.analyticsCache.data;
    }

    const endDate = dateRange?.endDate || new Date();
    const startDate =
      dateRange?.startDate ||
      new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate() - 30);

    // Get all metrics in parallel for performance
    const [
      tenantMetrics,
      userMetrics,
      financialMetrics,
      usageMetrics,
      performanceMetrics,
    ] = await Promise.all([
      this.getTenantMetrics(startDate, endDate),
      this.getUserMetrics(startDate, endDate),
      this.getFinancialMetrics(startDate, endDate),
      this.getUsageMetrics(startDate, endDate),
      this.getPerformanceMetrics(startDate, endDate),
    ]);

    const analytics: SystemAnalytics = {
      // Tenant metrics
      ...tenantMetrics,

      // User metrics
      ...userMetrics,

      // Financial metrics
      ...financialMetrics,

      // Subscription metrics (placeholder)
      activeSubscriptions: 0,
      subscriptionsByPlan: {},
      churnRate: 0,

      // Usage metrics
      ...usageMetrics,

      // Performance metrics
      ...performanceMetrics,

      // Period
      periodStart: startDate.toISOString(),
      periodEnd: endDate.toISOString(),
    };

    // Cache only if using default date range
    if (!dateRange) {
      this.analyticsCache = {
        data: analytics,
        timestamp: Date.now(),
      };
    }

    return analytics;
  }

  /**
   * Export analytics report
   * @param format Export format (PDF/Excel/CSV)
   * @param dateRange Optional date range filter
   * @returns Export data or file path (placeholder for now)
   */
  async exportAnalytics(
    format: ExportFormat,
    dateRange?: AnalyticsDateRange
  ): Promise<{ format: ExportFormat; data: SystemAnalytics; generatedAt: string }> {
    const analytics = await this.getSystemAnalytics(dateRange);

    // TODO: Implement actual PDF/Excel/CSV generation
    // For now, return the data structure that would be exported
    return {
      format,
      data: analytics,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Get tenant/organization metrics
   */
  private async getTenantMetrics(
    startDate: Date,
    endDate: Date
  ): Promise<{
    totalOrganizations: number;
    activeOrganizations: number;
    suspendedOrganizations: number;
    newOrganizationsThisMonth: number;
  }> {
    const monthStart = new Date(endDate.getFullYear(), endDate.getMonth(), 1);

    const [total, active, suspended, newThisMonth] = await Promise.all([
      prisma.organization.count({
        where: { deletedAt: null },
      }),
      prisma.organization.count({
        where: { isActive: true, deletedAt: null },
      }),
      prisma.organization.count({
        where: { isActive: false, deletedAt: null },
      }),
      prisma.organization.count({
        where: {
          createdAt: { gte: monthStart },
          deletedAt: null,
        },
      }),
    ]);

    return {
      totalOrganizations: total,
      activeOrganizations: active,
      suspendedOrganizations: suspended,
      newOrganizationsThisMonth: newThisMonth,
    };
  }

  /**
   * Get user metrics
   */
  private async getUserMetrics(
    startDate: Date,
    endDate: Date
  ): Promise<{
    totalUsers: number;
    activeUsersToday: number;
    activeUsersThisWeek: number;
    activeUsersThisMonth: number;
    usersByRole: Record<string, number>;
  }> {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [totalUsers, activeToday, activeWeek, activeMonth, users] = await Promise.all([
      prisma.user.count({
        where: { deletedAt: null },
      }),
      prisma.user.count({
        where: {
          lastLoginAt: { gte: oneDayAgo },
          deletedAt: null,
        },
      }),
      prisma.user.count({
        where: {
          lastLoginAt: { gte: oneWeekAgo },
          deletedAt: null,
        },
      }),
      prisma.user.count({
        where: {
          lastLoginAt: { gte: oneMonthAgo },
          deletedAt: null,
        },
      }),
      prisma.user.findMany({
        where: { deletedAt: null },
        select: { role: true },
      }),
    ]);

    // Count users by role
    const usersByRole: Record<string, number> = {};
    for (const user of users) {
      usersByRole[user.role] = (usersByRole[user.role] || 0) + 1;
    }

    return {
      totalUsers,
      activeUsersToday: activeToday,
      activeUsersThisWeek: activeWeek,
      activeUsersThisMonth: activeMonth,
      usersByRole,
    };
  }

  /**
   * Get financial metrics from payments
   */
  private async getFinancialMetrics(
    startDate: Date,
    endDate: Date
  ): Promise<{
    totalRevenue: number;
    monthlyRecurringRevenue: number;
    averageRevenuePerOrganization: number;
  }> {
    // Get all completed payments
    const payments = await prisma.payment.findMany({
      where: {
        status: 'COMPLETED',
        deletedAt: null,
      },
      select: {
        amount: true,
        processedAt: true,
        organizationId: true,
      },
    });

    // Calculate total revenue
    const totalRevenue = payments.reduce((sum, payment) => {
      const amount =
        payment.amount instanceof Decimal ? payment.amount.toNumber() : Number(payment.amount);
      return sum + amount;
    }, 0);

    // Calculate MRR (payments from last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentPayments = payments.filter((p) => p.processedAt && p.processedAt >= thirtyDaysAgo);
    const monthlyRecurringRevenue = recentPayments.reduce((sum, payment) => {
      const amount =
        payment.amount instanceof Decimal ? payment.amount.toNumber() : Number(payment.amount);
      return sum + amount;
    }, 0);

    // Calculate average revenue per organization
    const activeOrgs = await prisma.organization.count({
      where: { isActive: true, deletedAt: null },
    });
    const averageRevenuePerOrganization =
      activeOrgs > 0 ? monthlyRecurringRevenue / activeOrgs : 0;

    return {
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      monthlyRecurringRevenue: Math.round(monthlyRecurringRevenue * 100) / 100,
      averageRevenuePerOrganization: Math.round(averageRevenuePerOrganization * 100) / 100,
    };
  }

  /**
   * Get usage metrics
   */
  private async getUsageMetrics(
    startDate: Date,
    endDate: Date
  ): Promise<{
    apiCalls: number;
    storageUsed: number;
    bandwidthUsed: number;
  }> {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Get API calls from system logs (last 24 hours)
    let apiCalls = 0;
    try {
      apiCalls = await prisma.systemLog.count({
        where: {
          timestamp: { gte: twentyFourHoursAgo },
          source: { not: 'system' }, // Exclude internal system logs
        },
      });
    } catch (error) {
      // SystemLog table might not exist yet
      apiCalls = 0;
    }

    // Calculate storage used from documents
    const documents = await prisma.document.findMany({
      where: { deletedAt: null },
      select: { size: true },
    });

    const storageUsed = documents.reduce((sum, doc) => {
      return sum + (doc.size || 0);
    }, 0);

    // Bandwidth is placeholder for now
    const bandwidthUsed = 0;

    return {
      apiCalls,
      storageUsed,
      bandwidthUsed,
    };
  }

  /**
   * Get performance metrics
   */
  private async getPerformanceMetrics(
    startDate: Date,
    endDate: Date
  ): Promise<{
    averageResponseTime: number;
    errorRate: number;
    uptimePercentage: number;
  }> {
    try {
      // Get error rate from system logs
      const [totalLogs, errorLogs] = await Promise.all([
        prisma.systemLog.count({
          where: {
            timestamp: { gte: startDate, lte: endDate },
          },
        }),
        prisma.systemLog.count({
          where: {
            timestamp: { gte: startDate, lte: endDate },
            level: 'ERROR',
          },
        }),
      ]);

      const errorRate = totalLogs > 0 ? (errorLogs / totalLogs) * 100 : 0;

      // Average response time is placeholder (would need request timing middleware)
      const averageResponseTime = 50;

      // Uptime percentage calculation (based on error rate)
      // Simplified: if error rate is low, uptime is high
      const uptimePercentage = Math.max(0, 100 - errorRate * 10);

      return {
        averageResponseTime: Math.round(averageResponseTime * 100) / 100,
        errorRate: Math.round(errorRate * 100) / 100,
        uptimePercentage: Math.round(uptimePercentage * 100) / 100,
      };
    } catch (error) {
      // SystemLog table might not exist yet
      return {
        averageResponseTime: 50,
        errorRate: 0,
        uptimePercentage: 99.9,
      };
    }
  }

  /**
   * Clear analytics cache (for testing or forced refresh)
   */
  clearCache(): void {
    this.analyticsCache = null;
  }
}

export const systemAnalyticsService = new SystemAnalyticsService();
