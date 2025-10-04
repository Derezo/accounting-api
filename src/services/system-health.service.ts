/**
 * System Health Service
 * Enhanced health monitoring for admin panel
 */

import os from 'os';
import { PrismaClient } from '@prisma/client';
import { createClient } from 'redis';

const prisma = new PrismaClient();

// App start time for uptime calculation
const APP_START_TIME = Date.now();

export type HealthStatus = 'HEALTHY' | 'WARNING' | 'ERROR' | 'MAINTENANCE';

export interface ServiceHealth {
  name: string;
  status: HealthStatus;
  responseTime: number; // milliseconds
  lastChecked: string; // ISO 8601
  message?: string;
}

export interface SystemHealth {
  status: HealthStatus;
  timestamp: string;
  uptime: number; // hours
  version: string;

  // Resource utilization
  cpu: {
    usage: number; // percentage 0-100
    cores: number;
  };
  memory: {
    usage: number; // percentage 0-100
    total: number; // bytes
    used: number; // bytes
  };
  disk: {
    usage: number; // percentage 0-100 (estimated)
    total: number; // bytes (estimated)
    used: number; // bytes (estimated)
  };

  // Service health
  services: ServiceHealth[];

  // Performance metrics
  metrics: {
    requestsPerSecond: number;
    averageResponseTime: number; // milliseconds
    errorRate: number; // percentage
  };
}

class SystemHealthService {
  private healthCache: { data: SystemHealth; timestamp: number } | null = null;
  private readonly CACHE_TTL_MS = 10000; // 10 seconds

  /**
   * Get comprehensive system health status
   */
  async getSystemHealth(): Promise<SystemHealth> {
    // Return cached data if still valid
    if (this.healthCache && Date.now() - this.healthCache.timestamp < this.CACHE_TTL_MS) {
      return this.healthCache.data;
    }

    const startTime = Date.now();

    // Check all services in parallel
    const [databaseHealth, redisHealth] = await Promise.all([
      this.checkDatabaseHealth(),
      this.checkRedisHealth(),
    ]);

    const services = [databaseHealth, redisHealth];

    // Calculate overall status
    const hasError = services.some((s) => s.status === 'ERROR');
    const hasWarning = services.some((s) => s.status === 'WARNING');
    const overallStatus: HealthStatus = hasError
      ? 'ERROR'
      : hasWarning
        ? 'WARNING'
        : 'HEALTHY';

    // Get resource usage
    const cpuUsage = await this.getCPUUsage();
    const memoryUsage = this.getMemoryUsage();
    const diskUsage = this.getDiskUsage();

    // Get performance metrics (simplified for now)
    const metrics = await this.getPerformanceMetrics();

    const health: SystemHealth = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: (Date.now() - APP_START_TIME) / (1000 * 60 * 60), // hours
      version: process.env.npm_package_version || '1.0.0',
      cpu: cpuUsage,
      memory: memoryUsage,
      disk: diskUsage,
      services,
      metrics,
    };

    // Cache the result
    this.healthCache = {
      data: health,
      timestamp: Date.now(),
    };

    return health;
  }

  /**
   * Check database health
   */
  private async checkDatabaseHealth(): Promise<ServiceHealth> {
    const start = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      const responseTime = Date.now() - start;

      return {
        name: 'database',
        status: responseTime > 1000 ? 'WARNING' : 'HEALTHY',
        responseTime,
        lastChecked: new Date().toISOString(),
        message:
          responseTime > 1000
            ? `Slow response: ${responseTime}ms`
            : `Connected (${responseTime}ms)`,
      };
    } catch (error) {
      return {
        name: 'database',
        status: 'ERROR',
        responseTime: Date.now() - start,
        lastChecked: new Date().toISOString(),
        message: `Database connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Check Redis health
   */
  private async checkRedisHealth(): Promise<ServiceHealth> {
    const start = Date.now();
    let redisClient: ReturnType<typeof createClient> | null = null;

    try {
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      redisClient = createClient({ url: redisUrl });

      await redisClient.connect();
      await redisClient.ping();
      const responseTime = Date.now() - start;

      await redisClient.quit();

      return {
        name: 'redis',
        status: responseTime > 500 ? 'WARNING' : 'HEALTHY',
        responseTime,
        lastChecked: new Date().toISOString(),
        message:
          responseTime > 500 ? `Slow response: ${responseTime}ms` : `Connected (${responseTime}ms)`,
      };
    } catch (error) {
      if (redisClient) {
        try {
          await redisClient.quit();
        } catch {
          // Ignore cleanup errors
        }
      }

      return {
        name: 'redis',
        status: 'WARNING', // Redis is optional, so WARNING not ERROR
        responseTime: Date.now() - start,
        lastChecked: new Date().toISOString(),
        message: `Redis unavailable: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Get CPU usage percentage
   */
  private async getCPUUsage(): Promise<{ usage: number; cores: number }> {
    const cpus = os.cpus();
    const cores = cpus.length;

    // Calculate CPU usage based on idle vs total time
    const totalIdle = cpus.reduce((acc, cpu) => acc + cpu.times.idle, 0);
    const totalTick = cpus.reduce(
      (acc, cpu) => acc + cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle,
      0
    );

    const idle = totalIdle / cores;
    const total = totalTick / cores;
    const usage = 100 - (100 * idle) / total;

    return {
      usage: Math.round(usage * 100) / 100,
      cores,
    };
  }

  /**
   * Get memory usage
   */
  private getMemoryUsage(): { usage: number; total: number; used: number } {
    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;
    const usage = (used / total) * 100;

    return {
      usage: Math.round(usage * 100) / 100,
      total,
      used,
    };
  }

  /**
   * Get disk usage (estimated based on process memory)
   */
  private getDiskUsage(): { usage: number; total: number; used: number } {
    // Note: Node.js doesn't have built-in disk space APIs
    // This is a placeholder that returns process memory usage
    const memUsage = process.memoryUsage();
    const total = os.totalmem();
    const used = memUsage.heapUsed + memUsage.external;
    const usage = (used / total) * 100;

    return {
      usage: Math.round(usage * 100) / 100,
      total,
      used,
    };
  }

  /**
   * Get performance metrics
   */
  private async getPerformanceMetrics(): Promise<{
    requestsPerSecond: number;
    averageResponseTime: number;
    errorRate: number;
  }> {
    try {
      // Query system logs for error rate
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const [totalLogs, errorLogs] = await Promise.all([
        prisma.systemLog.count({
          where: { timestamp: { gte: oneHourAgo } },
        }),
        prisma.systemLog.count({
          where: {
            timestamp: { gte: oneHourAgo },
            level: 'ERROR',
          },
        }),
      ]);

      const errorRate = totalLogs > 0 ? (errorLogs / totalLogs) * 100 : 0;
      const requestsPerSecond = totalLogs / 3600; // Last hour

      return {
        requestsPerSecond: Math.round(requestsPerSecond * 100) / 100,
        averageResponseTime: 50, // Placeholder - would need request timing middleware
        errorRate: Math.round(errorRate * 100) / 100,
      };
    } catch (error) {
      return {
        requestsPerSecond: 0,
        averageResponseTime: 0,
        errorRate: 0,
      };
    }
  }

  /**
   * Clear health cache (for testing or forced refresh)
   */
  clearCache(): void {
    this.healthCache = null;
  }
}

export const systemHealthService = new SystemHealthService();
