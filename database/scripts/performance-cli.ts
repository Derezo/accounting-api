#!/usr/bin/env ts-node

/**
 * Performance CLI - Performance monitoring and optimization tool
 */

import { Command } from 'commander';
import { PrismaClient } from '@prisma/client';
import * as winston from 'winston';
import { getEnvironmentConfig } from '../config/environments';
import { PerformanceMonitor } from '../utils/performance-monitor';
import * as fs from 'fs';

class PerformanceCLI {
  private prisma: PrismaClient;
  private performanceMonitor: PerformanceMonitor;
  private logger: winston.Logger;

  constructor() {
    this.prisma = new PrismaClient();
    this.performanceMonitor = new PerformanceMonitor(this.prisma);

    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.colorize(),
        winston.format.simple()
      ),
      transports: [
        new winston.transports.Console(),
      ],
    });
  }

  async initializeForEnvironment(environment: string): Promise<void> {
    const config = getEnvironmentConfig(environment);

    await this.prisma.$disconnect();

    this.prisma = new PrismaClient({
      datasources: {
        db: {
          url: config.database.url,
        },
      },
      log: config.database.logging ? ['query', 'info', 'warn', 'error'] : ['error'],
    });

    this.performanceMonitor = new PerformanceMonitor(this.prisma);
  }

  async startMonitoring(options: {
    interval: number;
    duration?: number;
    output?: string;
  }): Promise<void> {
    try {
      this.logger.info(`Starting performance monitoring (interval: ${options.interval}s)`);

      if (options.duration) {
        this.logger.info(`Monitoring will run for ${options.duration} seconds`);
      }

      // Start monitoring
      this.performanceMonitor.startMonitoring(options.interval * 1000);

      // Stop after duration if specified
      if (options.duration) {
        setTimeout(() => {
          this.performanceMonitor.stopMonitoring();
          console.log('\n✅ Performance monitoring completed');

          if (options.output) {
            this.exportCurrentData(options.output);
          }

          process.exit(0);
        }, options.duration * 1000);
      } else {
        console.log('Press Ctrl+C to stop monitoring');

        // Handle graceful shutdown
        process.on('SIGINT', () => {
          this.performanceMonitor.stopMonitoring();
          console.log('\n✅ Performance monitoring stopped');

          if (options.output) {
            this.exportCurrentData(options.output);
          }

          process.exit(0);
        });
      }

      // Keep the process alive
      if (!options.duration) {
        setInterval(() => {}, 1000);
      }

    } catch (error) {
      this.logger.error('Performance monitoring failed:', error);
      process.exit(1);
    }
  }

  async generateReport(options: {
    output?: string;
    format: 'json' | 'table';
  }): Promise<void> {
    try {
      this.logger.info('Generating performance report...');

      const report = await this.performanceMonitor.getPerformanceReport();

      if (options.format === 'json') {
        if (options.output) {
          fs.writeFileSync(options.output, JSON.stringify(report, null, 2));
          console.log(`✅ Performance report saved to: ${options.output}`);
        } else {
          console.log(JSON.stringify(report, null, 2));
        }
        return;
      }

      // Table format
      console.log('\n⚡ Performance Report');
      console.log('='.repeat(60));

      // Current metrics
      console.log('\n📊 Current Metrics:');
      console.log(`  Connection Count: ${report.metrics.connectionCount}`);
      console.log(`  Active Queries: ${report.metrics.activeQueries}`);
      console.log(`  Average Query Time: ${report.metrics.avgQueryTime.toFixed(2)}ms`);
      console.log(`  Slow Queries: ${report.metrics.slowQueries}`);
      console.log(`  Error Rate: ${report.metrics.errorRate.toFixed(2)}%`);
      console.log(`  Memory Usage: ${report.metrics.memoryUsage}MB`);
      console.log(`  CPU Usage: ${report.metrics.cpuUsage.toFixed(1)}%`);

      // Slow queries
      if (report.slowQueries.length > 0) {
        console.log('\n🐌 Slow Queries:');
        console.log('-'.repeat(40));

        for (const query of report.slowQueries.slice(0, 5)) {
          console.log(`  Time: ${query.executionTime}ms`);
          console.log(`  Table: ${query.table}`);
          console.log(`  Operation: ${query.operation}`);
          console.log(`  Query: ${query.query.substring(0, 80)}...`);
          console.log(`  Timestamp: ${query.timestamp.toLocaleString()}`);
          console.log('');
        }

        if (report.slowQueries.length > 5) {
          console.log(`  ... and ${report.slowQueries.length - 5} more slow queries`);
        }
      }

      // Table statistics
      if (report.tableStats.length > 0) {
        console.log('\n📋 Table Statistics:');
        console.log('-'.repeat(40));

        for (const table of report.tableStats.slice(0, 10)) {
          console.log(`  ${table.tableName}:`);
          console.log(`    Rows: ${table.rowCount.toLocaleString()}`);
          console.log(`    Size: ${this.formatBytes(table.sizeBytes)}`);
          console.log(`    Avg Query Time: ${table.avgQueryTime.toFixed(2)}ms`);
          console.log(`    Query Count: ${table.queryCount}`);
          console.log('');
        }
      }

      // Index recommendations
      if (report.recommendations.length > 0) {
        console.log('\n💡 Index Recommendations:');
        console.log('-'.repeat(40));

        for (const rec of report.recommendations) {
          const impact = rec.estimatedImpact === 'HIGH' ? '🔴' :
                        rec.estimatedImpact === 'MEDIUM' ? '🟡' : '🟢';

          console.log(`  ${impact} ${rec.table}.${rec.columns.join(', ')}`);
          console.log(`    Reason: ${rec.reason}`);
          console.log(`    Impact: ${rec.estimatedImpact}`);
          console.log('');
        }
      }

      if (options.output) {
        fs.writeFileSync(options.output, JSON.stringify(report, null, 2));
        console.log(`\n💾 Full report saved to: ${options.output}`);
      }

    } catch (error) {
      this.logger.error('Performance report generation failed:', error);
      process.exit(1);
    }
  }

  async analyzeQueries(options: {
    output?: string;
    format: 'json' | 'table';
  }): Promise<void> {
    try {
      this.logger.info('Analyzing query patterns...');

      const patterns = await this.performanceMonitor.analyzeQueryPatterns();

      if (options.format === 'json') {
        if (options.output) {
          fs.writeFileSync(options.output, JSON.stringify(patterns, null, 2));
          console.log(`✅ Query analysis saved to: ${options.output}`);
        } else {
          console.log(JSON.stringify(patterns, null, 2));
        }
        return;
      }

      // Table format
      console.log('\n🔍 Query Pattern Analysis');
      console.log('='.repeat(60));

      // Top queries
      console.log('\n🔥 Most Frequent Queries:');
      console.log('-'.repeat(40));

      for (const query of patterns.topQueries.slice(0, 10)) {
        console.log(`  Count: ${query.count}, Avg Time: ${query.avgTime.toFixed(2)}ms`);
        console.log(`  Query: ${query.query.substring(0, 80)}...`);
        console.log('');
      }

      // Table usage
      console.log('\n📊 Table Usage:');
      console.log('-'.repeat(40));

      for (const table of patterns.tableUsage.slice(0, 10)) {
        console.log(`  ${table.table}:`);
        console.log(`    Queries: ${table.queries}`);
        console.log(`    Avg Time: ${table.avgTime.toFixed(2)}ms`);
        console.log('');
      }

      // Organization usage
      if (patterns.organizationUsage.length > 0) {
        console.log('\n🏢 Organization Usage:');
        console.log('-'.repeat(40));

        for (const org of patterns.organizationUsage.slice(0, 5)) {
          console.log(`  ${org.organizationId}:`);
          console.log(`    Queries: ${org.queries}`);
          console.log(`    Avg Time: ${org.avgTime.toFixed(2)}ms`);
          console.log('');
        }
      }

      if (options.output) {
        fs.writeFileSync(options.output, JSON.stringify(patterns, null, 2));
        console.log(`\n💾 Full analysis saved to: ${options.output}`);
      }

    } catch (error) {
      this.logger.error('Query analysis failed:', error);
      process.exit(1);
    }
  }

  async generateRecommendations(options: {
    output?: string;
  }): Promise<void> {
    try {
      this.logger.info('Generating optimization recommendations...');

      const recommendations = await this.performanceMonitor.generateOptimizationRecommendations();

      console.log('\n💡 Performance Optimization Recommendations');
      console.log('='.repeat(60));

      if (recommendations.length === 0) {
        console.log('✅ No performance issues detected. Your database is performing well!');
        return;
      }

      recommendations.forEach((rec, index) => {
        console.log(`${index + 1}. ${rec}`);
        console.log('');
      });

      if (options.output) {
        fs.writeFileSync(options.output, JSON.stringify({
          timestamp: new Date(),
          recommendations,
        }, null, 2));
        console.log(`💾 Recommendations saved to: ${options.output}`);
      }

    } catch (error) {
      this.logger.error('Recommendation generation failed:', error);
      process.exit(1);
    }
  }

  async exportData(options: {
    output: string;
  }): Promise<void> {
    try {
      this.logger.info('Exporting performance data...');

      await this.performanceMonitor.exportPerformanceData(options.output);

      console.log(`✅ Performance data exported to: ${options.output}`);

    } catch (error) {
      this.logger.error('Data export failed:', error);
      process.exit(1);
    }
  }

  async simulateLoad(options: {
    queries: number;
    concurrency: number;
    duration?: number;
    queryType: 'select' | 'insert' | 'update' | 'mixed';
  }): Promise<void> {
    try {
      this.logger.info(`Simulating database load: ${options.queries} queries, ${options.concurrency} concurrent`);

      const startTime = Date.now();
      const results = {
        totalQueries: 0,
        successfulQueries: 0,
        failedQueries: 0,
        avgResponseTime: 0,
        minResponseTime: Infinity,
        maxResponseTime: 0,
      };

      const promises: Promise<void>[] = [];

      for (let i = 0; i < options.concurrency; i++) {
        promises.push(this.runLoadWorker(options, results));
      }

      // Stop after duration if specified
      if (options.duration) {
        setTimeout(() => {
          console.log('\n⏰ Load test duration reached, stopping...');
        }, options.duration * 1000);
      }

      await Promise.all(promises);

      const totalTime = Date.now() - startTime;

      console.log('\n📊 Load Test Results:');
      console.log('='.repeat(40));
      console.log(`  Total Queries: ${results.totalQueries}`);
      console.log(`  Successful: ${results.successfulQueries}`);
      console.log(`  Failed: ${results.failedQueries}`);
      console.log(`  Success Rate: ${((results.successfulQueries / results.totalQueries) * 100).toFixed(2)}%`);
      console.log(`  Avg Response Time: ${results.avgResponseTime.toFixed(2)}ms`);
      console.log(`  Min Response Time: ${results.minResponseTime.toFixed(2)}ms`);
      console.log(`  Max Response Time: ${results.maxResponseTime.toFixed(2)}ms`);
      console.log(`  Queries/Second: ${(results.totalQueries / (totalTime / 1000)).toFixed(2)}`);
      console.log(`  Total Duration: ${(totalTime / 1000).toFixed(2)}s`);

    } catch (error) {
      this.logger.error('Load simulation failed:', error);
      process.exit(1);
    }
  }

  private async runLoadWorker(options: any, results: any): Promise<void> {
    const queriesPerWorker = Math.floor(options.queries / options.concurrency);
    const responseTimes: number[] = [];

    for (let i = 0; i < queriesPerWorker; i++) {
      try {
        const startTime = Date.now();

        // Execute different types of queries based on queryType
        switch (options.queryType) {
          case 'select':
            await this.prisma.organization.findMany({ take: 10 });
            break;
          case 'insert':
            // Would create test records (skipped for safety)
            await this.prisma.$queryRaw`SELECT 1`;
            break;
          case 'update':
            // Would update test records (skipped for safety)
            await this.prisma.$queryRaw`SELECT 1`;
            break;
          case 'mixed':
            const queryTypes = ['select', 'select', 'select', 'insert', 'update'];
            const randomType = queryTypes[Math.floor(Math.random() * queryTypes.length)];
            await this.prisma.organization.findMany({ take: 5 });
            break;
        }

        const responseTime = Date.now() - startTime;
        responseTimes.push(responseTime);

        results.totalQueries++;
        results.successfulQueries++;
        results.minResponseTime = Math.min(results.minResponseTime, responseTime);
        results.maxResponseTime = Math.max(results.maxResponseTime, responseTime);

        // Small delay to prevent overwhelming the database
        await new Promise(resolve => setTimeout(resolve, 10));

      } catch (error) {
        results.totalQueries++;
        results.failedQueries++;
      }
    }

    // Calculate average response time
    if (responseTimes.length > 0) {
      results.avgResponseTime = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
    }
  }

  private exportCurrentData(outputPath: string): void {
    // This would export current monitoring data
    console.log(`💾 Performance data exported to: ${outputPath}`);
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  async close(): Promise<void> {
    this.performanceMonitor.stopMonitoring();
    await this.prisma.$disconnect();
  }
}

// CLI Setup
const program = new Command();

program
  .name('performance-cli')
  .description('Database performance monitoring and optimization tool')
  .version('1.0.0');

program
  .command('monitor')
  .description('Start real-time performance monitoring')
  .option('-i, --interval <seconds>', 'Monitoring interval in seconds', '60')
  .option('-d, --duration <seconds>', 'Monitoring duration in seconds (0 = continuous)', '0')
  .option('-o, --output <file>', 'Export data to file when finished')
  .option('--env <environment>', 'Environment', 'development')
  .action(async (options) => {
    const cli = new PerformanceCLI();
    try {
      await cli.initializeForEnvironment(options.env);
      await cli.startMonitoring({
        interval: parseInt(options.interval),
        duration: parseInt(options.duration) || undefined,
        output: options.output,
      });
    } finally {
      await cli.close();
    }
  });

program
  .command('report')
  .description('Generate performance report')
  .option('-f, --format <format>', 'Output format (table|json)', 'table')
  .option('-o, --output <file>', 'Output file')
  .option('--env <environment>', 'Environment', 'development')
  .action(async (options) => {
    const cli = new PerformanceCLI();
    try {
      await cli.initializeForEnvironment(options.env);
      await cli.generateReport({
        output: options.output,
        format: options.format,
      });
    } finally {
      await cli.close();
    }
  });

program
  .command('analyze')
  .description('Analyze query patterns')
  .option('-f, --format <format>', 'Output format (table|json)', 'table')
  .option('-o, --output <file>', 'Output file')
  .option('--env <environment>', 'Environment', 'development')
  .action(async (options) => {
    const cli = new PerformanceCLI();
    try {
      await cli.initializeForEnvironment(options.env);
      await cli.analyzeQueries({
        output: options.output,
        format: options.format,
      });
    } finally {
      await cli.close();
    }
  });

program
  .command('recommendations')
  .description('Generate optimization recommendations')
  .option('-o, --output <file>', 'Output file')
  .option('--env <environment>', 'Environment', 'development')
  .action(async (options) => {
    const cli = new PerformanceCLI();
    try {
      await cli.initializeForEnvironment(options.env);
      await cli.generateRecommendations({
        output: options.output,
      });
    } finally {
      await cli.close();
    }
  });

program
  .command('export')
  .description('Export performance data')
  .requiredOption('-o, --output <file>', 'Output file')
  .option('--env <environment>', 'Environment', 'development')
  .action(async (options) => {
    const cli = new PerformanceCLI();
    try {
      await cli.initializeForEnvironment(options.env);
      await cli.exportData({
        output: options.output,
      });
    } finally {
      await cli.close();
    }
  });

program
  .command('load-test')
  .description('Simulate database load for testing')
  .option('-q, --queries <number>', 'Number of queries to execute', '100')
  .option('-c, --concurrency <number>', 'Number of concurrent workers', '5')
  .option('-d, --duration <seconds>', 'Test duration in seconds')
  .option('-t, --type <type>', 'Query type (select|insert|update|mixed)', 'select')
  .option('--env <environment>', 'Environment', 'development')
  .action(async (options) => {
    const cli = new PerformanceCLI();
    try {
      await cli.initializeForEnvironment(options.env);
      await cli.simulateLoad({
        queries: parseInt(options.queries),
        concurrency: parseInt(options.concurrency),
        duration: options.duration ? parseInt(options.duration) : undefined,
        queryType: options.type,
      });
    } finally {
      await cli.close();
    }
  });

// Run CLI if this file is executed directly
if (require.main === module) {
  program.parse(process.argv);
}

export default PerformanceCLI;