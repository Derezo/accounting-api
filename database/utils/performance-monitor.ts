/**
 * Performance Monitor - Database performance monitoring and optimization
 */

import { PrismaClient } from '@prisma/client';
import winston from 'winston';
import * as fs from 'fs';
import * as path from 'path';

export interface QueryStats {
  query: string;
  executionTime: number;
  timestamp: Date;
  userId?: string;
  organizationId?: string;
  table: string;
  operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';
}

export interface PerformanceMetrics {
  timestamp: Date;
  connectionCount: number;
  activeQueries: number;
  avgQueryTime: number;
  slowQueries: number;
  errorRate: number;
  memoryUsage: number;
  cpuUsage: number;
}

export interface TableStats {
  tableName: string;
  rowCount: number;
  sizeBytes: number;
  indexCount: number;
  lastAnalyzed: Date;
  avgQueryTime: number;
  queryCount: number;
}

export interface IndexRecommendation {
  table: string;
  columns: string[];
  reason: string;
  estimatedImpact: 'HIGH' | 'MEDIUM' | 'LOW';
  query: string;
}

export class PerformanceMonitor {
  private prisma: PrismaClient;
  private logger: winston.Logger;
  private queryStats: QueryStats[] = [];
  private metricsInterval?: NodeJS.Timeout;
  private slowQueryThreshold: number;

  constructor(prisma: PrismaClient, slowQueryThreshold: number = 1000) {
    this.prisma = prisma;
    this.slowQueryThreshold = slowQueryThreshold;

    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      transports: [
        new winston.transports.File({
          filename: 'database/logs/performance.log',
          maxsize: 10 * 1024 * 1024, // 10MB
          maxFiles: 5,
        }),
        new winston.transports.File({
          filename: 'database/logs/slow-queries.log',
          level: 'warn',
          maxsize: 10 * 1024 * 1024, // 10MB
          maxFiles: 3,
        }),
      ],
    });
  }

  /**
   * Start performance monitoring
   */
  startMonitoring(intervalMs: number = 60000): void {
    this.logger.info('Starting performance monitoring...');

    this.metricsInterval = setInterval(async () => {
      try {
        const metrics = await this.collectMetrics();
        this.logMetrics(metrics);

        // Check for performance issues
        await this.checkPerformanceIssues(metrics);

      } catch (error) {
        this.logger.error('Failed to collect metrics:', error);
      }
    }, intervalMs);
  }

  /**
   * Stop performance monitoring
   */
  stopMonitoring(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = undefined;
      this.logger.info('Performance monitoring stopped');
    }
  }

  /**
   * Log a query for performance analysis
   */
  logQuery(query: string, executionTime: number, context?: {
    userId?: string;
    organizationId?: string;
  }): void {
    const queryStats: QueryStats = {
      query: this.sanitizeQuery(query),
      executionTime,
      timestamp: new Date(),
      userId: context?.userId,
      organizationId: context?.organizationId,
      table: this.extractTableName(query),
      operation: this.extractOperation(query),
    };

    this.queryStats.push(queryStats);

    // Keep only recent queries (last 1000)
    if (this.queryStats.length > 1000) {
      this.queryStats = this.queryStats.slice(-1000);
    }

    // Log slow queries
    if (executionTime > this.slowQueryThreshold) {
      this.logger.warn('Slow query detected', {
        query: queryStats.query,
        executionTime,
        table: queryStats.table,
        organizationId: queryStats.organizationId,
      });
    }
  }

  /**
   * Get performance metrics
   */
  async getPerformanceReport(): Promise<{
    metrics: PerformanceMetrics;
    slowQueries: QueryStats[];
    tableStats: TableStats[];
    recommendations: IndexRecommendation[];
  }> {
    const metrics = await this.collectMetrics();
    const slowQueries = this.getSlowQueries();
    const tableStats = await this.getTableStatistics();
    const recommendations = await this.generateIndexRecommendations();

    return {
      metrics,
      slowQueries,
      tableStats,
      recommendations,
    };
  }

  /**
   * Analyze query patterns
   */
  async analyzeQueryPatterns(): Promise<{
    topQueries: { query: string; count: number; avgTime: number }[];
    tableUsage: { table: string; queries: number; avgTime: number }[];
    organizationUsage: { organizationId: string; queries: number; avgTime: number }[];
  }> {
    const queryMap = new Map<string, { count: number; totalTime: number }>();
    const tableMap = new Map<string, { count: number; totalTime: number }>();
    const orgMap = new Map<string, { count: number; totalTime: number }>();

    for (const stat of this.queryStats) {
      // Query patterns
      const key = this.normalizeQuery(stat.query);
      const existing = queryMap.get(key) || { count: 0, totalTime: 0 };
      queryMap.set(key, {
        count: existing.count + 1,
        totalTime: existing.totalTime + stat.executionTime,
      });

      // Table usage
      if (stat.table) {
        const tableExisting = tableMap.get(stat.table) || { count: 0, totalTime: 0 };
        tableMap.set(stat.table, {
          count: tableExisting.count + 1,
          totalTime: tableExisting.totalTime + stat.executionTime,
        });
      }

      // Organization usage
      if (stat.organizationId) {
        const orgExisting = orgMap.get(stat.organizationId) || { count: 0, totalTime: 0 };
        orgMap.set(stat.organizationId, {
          count: orgExisting.count + 1,
          totalTime: orgExisting.totalTime + stat.executionTime,
        });
      }
    }

    const topQueries = Array.from(queryMap.entries())
      .map(([query, stats]) => ({
        query,
        count: stats.count,
        avgTime: stats.totalTime / stats.count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const tableUsage = Array.from(tableMap.entries())
      .map(([table, stats]) => ({
        table,
        queries: stats.count,
        avgTime: stats.totalTime / stats.count,
      }))
      .sort((a, b) => b.queries - a.queries);

    const organizationUsage = Array.from(orgMap.entries())
      .map(([organizationId, stats]) => ({
        organizationId,
        queries: stats.count,
        avgTime: stats.totalTime / stats.count,
      }))
      .sort((a, b) => b.queries - a.queries)
      .slice(0, 10);

    return { topQueries, tableUsage, organizationUsage };
  }

  /**
   * Generate performance optimization recommendations
   */
  async generateOptimizationRecommendations(): Promise<string[]> {
    const recommendations: string[] = [];
    const report = await this.getPerformanceReport();

    // Check for slow queries
    if (report.slowQueries.length > 10) {
      recommendations.push(
        `High number of slow queries detected (${report.slowQueries.length}). Consider optimizing frequent queries.`
      );
    }

    // Check table sizes
    const largeTables = report.tableStats
      .filter(table => table.rowCount > 100000)
      .sort((a, b) => b.rowCount - a.rowCount);

    if (largeTables.length > 0) {
      recommendations.push(
        `Large tables detected: ${largeTables.map(t => `${t.tableName} (${t.rowCount} rows)`).join(', ')}. Consider archiving old data.`
      );
    }

    // Check for missing indexes
    if (report.recommendations.length > 0) {
      recommendations.push(
        `Missing index opportunities: ${report.recommendations.length} potential indexes could improve performance.`
      );
    }

    // Check connection patterns
    if (report.metrics.connectionCount > 40) {
      recommendations.push(
        'High connection count detected. Consider implementing connection pooling or reducing concurrent connections.'
      );
    }

    // Check query patterns
    const patterns = await this.analyzeQueryPatterns();
    const frequentExpensiveQueries = patterns.topQueries
      .filter(q => q.avgTime > this.slowQueryThreshold)
      .slice(0, 3);

    if (frequentExpensiveQueries.length > 0) {
      recommendations.push(
        'Frequent expensive queries detected. Consider caching or optimizing these queries.'
      );
    }

    return recommendations;
  }

  /**
   * Export performance data
   */
  async exportPerformanceData(outputPath: string): Promise<void> {
    const report = await this.getPerformanceReport();
    const patterns = await this.analyzeQueryPatterns();
    const recommendations = await this.generateOptimizationRecommendations();

    const exportData = {
      timestamp: new Date(),
      report,
      patterns,
      recommendations,
      recentQueries: this.queryStats.slice(-100), // Last 100 queries
    };

    fs.writeFileSync(outputPath, JSON.stringify(exportData, null, 2));
    this.logger.info(`Performance data exported to: ${outputPath}`);
  }

  private async collectMetrics(): Promise<PerformanceMetrics> {
    try {
      // Get basic database stats
      const recentQueries = this.queryStats.filter(
        q => q.timestamp.getTime() > Date.now() - 5 * 60 * 1000 // Last 5 minutes
      );

      const avgQueryTime = recentQueries.length > 0
        ? recentQueries.reduce((sum, q) => sum + q.executionTime, 0) / recentQueries.length
        : 0;

      const slowQueries = recentQueries.filter(q => q.executionTime > this.slowQueryThreshold).length;

      // Simulate connection and system metrics (in a real implementation,
      // these would come from database monitoring tools)
      const metrics: PerformanceMetrics = {
        timestamp: new Date(),
        connectionCount: Math.floor(Math.random() * 20) + 5, // Simulated
        activeQueries: recentQueries.length,
        avgQueryTime,
        slowQueries,
        errorRate: 0, // Would track actual errors
        memoryUsage: Math.floor(Math.random() * 1024) + 512, // MB, simulated
        cpuUsage: Math.floor(Math.random() * 30) + 10, // Percentage, simulated
      };

      return metrics;

    } catch (error) {
      this.logger.error('Failed to collect metrics:', error);
      throw error;
    }
  }

  private logMetrics(metrics: PerformanceMetrics): void {
    this.logger.info('Performance metrics', {
      connectionCount: metrics.connectionCount,
      activeQueries: metrics.activeQueries,
      avgQueryTime: metrics.avgQueryTime,
      slowQueries: metrics.slowQueries,
      memoryUsage: metrics.memoryUsage,
      cpuUsage: metrics.cpuUsage,
    });
  }

  private async checkPerformanceIssues(metrics: PerformanceMetrics): Promise<void> {
    // Check for high CPU usage
    if (metrics.cpuUsage > 80) {
      this.logger.warn('High CPU usage detected', { cpuUsage: metrics.cpuUsage });
    }

    // Check for high memory usage
    if (metrics.memoryUsage > 2048) {
      this.logger.warn('High memory usage detected', { memoryUsage: metrics.memoryUsage });
    }

    // Check for too many slow queries
    if (metrics.slowQueries > 5) {
      this.logger.warn('High number of slow queries', { slowQueries: metrics.slowQueries });
    }

    // Check for high connection count
    if (metrics.connectionCount > 40) {
      this.logger.warn('High connection count', { connectionCount: metrics.connectionCount });
    }
  }

  private getSlowQueries(limit: number = 20): QueryStats[] {
    return this.queryStats
      .filter(q => q.executionTime > this.slowQueryThreshold)
      .sort((a, b) => b.executionTime - a.executionTime)
      .slice(0, limit);
  }

  private async getTableStatistics(): Promise<TableStats[]> {
    try {
      // This would be database-specific. For PostgreSQL:
      const tableStatsQuery = `
        SELECT
          schemaname,
          tablename,
          n_tup_ins + n_tup_upd + n_tup_del as total_queries,
          n_live_tup as row_count,
          pg_total_relation_size(schemaname||'.'||tablename) as size_bytes
        FROM pg_stat_user_tables
        ORDER BY total_queries DESC
      `;

      // For SQLite, we'd use different queries
      const tables = [
        'organizations', 'users', 'customers', 'invoices', 'payments',
        'quotes', 'projects', 'products', 'services'
      ];

      const tableStats: TableStats[] = [];

      for (const table of tables) {
        try {
          const countResult = await this.prisma.$queryRawUnsafe(`SELECT COUNT(*) as count FROM ${table}`);
          const count = Array.isArray(countResult) ? Number((countResult[0] as any).count) : 0;

          const queryStats = this.queryStats
            .filter(q => q.table === table)
            .slice(-100); // Last 100 queries

          const avgTime = queryStats.length > 0
            ? queryStats.reduce((sum, q) => sum + q.executionTime, 0) / queryStats.length
            : 0;

          tableStats.push({
            tableName: table,
            rowCount: count,
            sizeBytes: count * 1000, // Estimated
            indexCount: 0, // Would query actual indexes
            lastAnalyzed: new Date(),
            avgQueryTime: avgTime,
            queryCount: queryStats.length,
          });

        } catch (error) {
          // Skip tables that don't exist or can't be queried
        }
      }

      return tableStats.sort((a, b) => b.queryCount - a.queryCount);

    } catch (error) {
      this.logger.error('Failed to get table statistics:', error);
      return [];
    }
  }

  private async generateIndexRecommendations(): Promise<IndexRecommendation[]> {
    const recommendations: IndexRecommendation[] = [];

    // Analyze query patterns to suggest indexes
    const patterns = await this.analyzeQueryPatterns();

    // Look for frequent WHERE clauses in slow queries
    const slowQueries = this.getSlowQueries(50);

    for (const query of slowQueries) {
      // Simple pattern matching for WHERE clauses
      const whereMatch = query.query.match(/WHERE\s+(\w+)\s*=/i);
      if (whereMatch && query.table) {
        const column = whereMatch[1];

        recommendations.push({
          table: query.table,
          columns: [column],
          reason: `Frequent WHERE clause on ${column} in slow queries`,
          estimatedImpact: query.executionTime > this.slowQueryThreshold * 2 ? 'HIGH' : 'MEDIUM',
          query: this.sanitizeQuery(query.query),
        });
      }
    }

    // Remove duplicates
    const uniqueRecommendations = recommendations.filter((rec, index, arr) =>
      arr.findIndex(r => r.table === rec.table && r.columns.join(',') === rec.columns.join(',')) === index
    );

    return uniqueRecommendations.slice(0, 10); // Top 10 recommendations
  }

  private sanitizeQuery(query: string): string {
    // Remove sensitive data from queries for logging
    return query
      .replace(/VALUES\s*\([^)]+\)/gi, 'VALUES (...)')
      .replace(/'[^']*'/g, "'***'")
      .replace(/\b\d{4,}\b/g, '***') // Hide long numbers
      .substring(0, 200); // Limit length
  }

  private normalizeQuery(query: string): string {
    // Normalize query for pattern analysis
    return query
      .replace(/\s+/g, ' ')
      .replace(/\b\d+\b/g, '?')
      .replace(/'[^']*'/g, '?')
      .toLowerCase()
      .trim();
  }

  private extractTableName(query: string): string {
    // Extract table name from query
    const patterns = [
      /FROM\s+(\w+)/i,
      /UPDATE\s+(\w+)/i,
      /INSERT\s+INTO\s+(\w+)/i,
      /DELETE\s+FROM\s+(\w+)/i,
    ];

    for (const pattern of patterns) {
      const match = query.match(pattern);
      if (match) {
        return match[1].toLowerCase();
      }
    }

    return 'unknown';
  }

  private extractOperation(query: string): 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' {
    const trimmed = query.trim().toUpperCase();

    if (trimmed.startsWith('SELECT')) return 'SELECT';
    if (trimmed.startsWith('INSERT')) return 'INSERT';
    if (trimmed.startsWith('UPDATE')) return 'UPDATE';
    if (trimmed.startsWith('DELETE')) return 'DELETE';

    return 'SELECT'; // Default
  }
}

export default PerformanceMonitor;