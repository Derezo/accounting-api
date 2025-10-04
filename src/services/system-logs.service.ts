/**
 * System Logs Service
 * Centralized logging service for admin panel system monitoring
 */

import { PrismaClient, SystemLog } from '@prisma/client';

const prisma = new PrismaClient();

export interface SystemLogFilters {
  level?: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  source?: string;
  startDate?: Date;
  endDate?: Date;
  search?: string;
  page?: number;
  limit?: number;
  userId?: string;
  organizationId?: string;
}

export interface SystemLogData {
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  message: string;
  source: string;
  userId?: string;
  organizationId?: string;
  metadata?: Record<string, any>;
  stackTrace?: string;
}

export interface PaginatedSystemLogs {
  data: SystemLog[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

class SystemLogsService {
  /**
   * Store a new system log entry
   */
  async storeLog(logData: SystemLogData): Promise<SystemLog> {
    return await prisma.systemLog.create({
      data: {
        level: logData.level,
        message: logData.message,
        source: logData.source,
        userId: logData.userId,
        organizationId: logData.organizationId,
        metadata: logData.metadata ? JSON.stringify(logData.metadata) : null,
        stackTrace: logData.stackTrace,
        timestamp: new Date(),
      },
    });
  }

  /**
   * Query system logs with filters and pagination
   */
  async getLogs(filters: SystemLogFilters): Promise<PaginatedSystemLogs> {
    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {};

    if (filters.level) {
      where.level = filters.level;
    }

    if (filters.source) {
      where.source = filters.source;
    }

    if (filters.userId) {
      where.userId = filters.userId;
    }

    if (filters.organizationId) {
      where.organizationId = filters.organizationId;
    }

    if (filters.startDate || filters.endDate) {
      where.timestamp = {};
      if (filters.startDate) {
        where.timestamp.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.timestamp.lte = filters.endDate;
      }
    }

    if (filters.search) {
      where.OR = [
        { message: { contains: filters.search } },
        { source: { contains: filters.search } },
      ];
    }

    // Execute queries in parallel
    const [logs, total] = await Promise.all([
      prisma.systemLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        skip,
        take: limit,
      }),
      prisma.systemLog.count({ where }),
    ]);

    return {
      data: logs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get unique log sources for filtering
   */
  async getLogSources(): Promise<string[]> {
    const sources = await prisma.systemLog.findMany({
      distinct: ['source'],
      select: { source: true },
      orderBy: { source: 'asc' },
    });

    return sources.map((s) => s.source);
  }

  /**
   * Delete logs older than specified days (log rotation)
   */
  async cleanupOldLogs(daysToKeep: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await prisma.systemLog.deleteMany({
      where: {
        timestamp: {
          lt: cutoffDate,
        },
      },
    });

    return result.count;
  }

  /**
   * Delete all logs (admin action)
   */
  async deleteAllLogs(): Promise<number> {
    const result = await prisma.systemLog.deleteMany({});
    return result.count;
  }

  /**
   * Get log statistics
   */
  async getLogStats(organizationId?: string): Promise<{
    total: number;
    byLevel: Record<string, number>;
    bySource: Record<string, number>;
    last24Hours: number;
  }> {
    const where: any = organizationId ? { organizationId } : {};

    const [total, logs, recent] = await Promise.all([
      prisma.systemLog.count({ where }),
      prisma.systemLog.findMany({
        where,
        select: { level: true, source: true },
      }),
      prisma.systemLog.count({
        where: {
          ...where,
          timestamp: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
          },
        },
      }),
    ]);

    // Aggregate by level
    const byLevel: Record<string, number> = {
      DEBUG: 0,
      INFO: 0,
      WARN: 0,
      ERROR: 0,
    };
    logs.forEach((log) => {
      byLevel[log.level] = (byLevel[log.level] || 0) + 1;
    });

    // Aggregate by source
    const bySource: Record<string, number> = {};
    logs.forEach((log) => {
      bySource[log.source] = (bySource[log.source] || 0) + 1;
    });

    return {
      total,
      byLevel,
      bySource,
      last24Hours: recent,
    };
  }

  /**
   * Convenience logging methods
   */
  async debug(message: string, source: string, metadata?: Record<string, any>): Promise<SystemLog> {
    return this.storeLog({ level: 'DEBUG', message, source, metadata });
  }

  async info(message: string, source: string, metadata?: Record<string, any>): Promise<SystemLog> {
    return this.storeLog({ level: 'INFO', message, source, metadata });
  }

  async warn(message: string, source: string, metadata?: Record<string, any>): Promise<SystemLog> {
    return this.storeLog({ level: 'WARN', message, source, metadata });
  }

  async error(
    message: string,
    source: string,
    error?: Error,
    metadata?: Record<string, any>
  ): Promise<SystemLog> {
    return this.storeLog({
      level: 'ERROR',
      message,
      source,
      metadata,
      stackTrace: error?.stack,
    });
  }
}

export const systemLogsService = new SystemLogsService();
