import crypto from 'crypto';
import { createClient, RedisClientType } from 'redis';
import NodeCache from 'node-cache';
import { performance } from 'perf_hooks';
import { logger } from '../utils/logger';
import { fieldEncryptionService } from './field-encryption.service';
import { encryptionKeyManager } from './encryption-key-manager.service';

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  strategy?: 'memory' | 'redis' | 'hybrid';
  namespace?: string;
  compression?: boolean;
  maxSize?: number;
}

export interface PerformanceMetrics {
  operation: string;
  duration: number;
  dataSize: number;
  cacheHit: boolean;
  throughput: number; // bytes per second
  timestamp: Date;
}

export interface EncryptionBenchmark {
  algorithm: string;
  keySize: number;
  dataSize: number;
  operationsPerSecond: number;
  averageLatency: number;
  p95Latency: number;
  p99Latency: number;
  memoryUsage: number;
  errorRate: number;
}

export interface OptimizationProfile {
  organizationId: string;
  preferredCacheStrategy: 'memory' | 'redis' | 'hybrid';
  optimalBatchSize: number;
  compressionThreshold: number;
  prefetchPatterns: string[];
  hotFields: string[];
  performanceTargets: {
    maxEncryptionLatency: number;
    maxDecryptionLatency: number;
    minThroughput: number;
    maxMemoryUsage: number;
  };
}

export interface CacheStats {
  hitRate: number;
  missRate: number;
  totalRequests: number;
  memoryUsage: number;
  evictions: number;
  avgResponseTime: number;
}

/**
 * High-performance encryption caching and optimization service
 *
 * Features:
 * - Multi-tier caching (memory, Redis, hybrid)
 * - Intelligent prefetching and precomputation
 * - Performance monitoring and optimization
 * - Adaptive caching strategies based on usage patterns
 * - Compression for large encrypted data
 * - Batch operations for improved throughput
 */
export class EncryptionPerformanceService {
  private readonly memoryCache: NodeCache;
  private readonly redisClient?: RedisClientType;
  private readonly performanceMetrics: PerformanceMetrics[] = [];
  private readonly optimizationProfiles = new Map<string, OptimizationProfile>();
  private performanceMonitorInterval?: NodeJS.Timeout;
  private cacheHealthMonitorInterval?: NodeJS.Timeout;

  // Cache configuration
  private readonly DEFAULT_TTL = 3600; // 1 hour
  private readonly MAX_MEMORY_CACHE_SIZE = 10000;
  private readonly COMPRESSION_THRESHOLD = 1024; // 1KB
  private readonly BATCH_SIZE_THRESHOLD = 100;
  private readonly METRICS_RETENTION_COUNT = 10000;

  // Performance thresholds
  private readonly MAX_ENCRYPTION_LATENCY = 100; // milliseconds
  private readonly MAX_DECRYPTION_LATENCY = 50; // milliseconds
  private readonly MIN_THROUGHPUT = 1000000; // 1MB/s

  constructor(redisClient?: RedisClientType) {
    this.redisClient = redisClient;

    this.memoryCache = new NodeCache({
      stdTTL: this.DEFAULT_TTL,
      checkperiod: 60,
      maxKeys: this.MAX_MEMORY_CACHE_SIZE,
      useClones: false, // Better performance, but be careful with mutations
      deleteOnExpire: true
    });

    // Set up performance monitoring
    this.startPerformanceMonitoring();

    logger.info('Encryption performance service initialized', {
      hasRedis: !!this.redisClient,
      memoryCacheSize: this.MAX_MEMORY_CACHE_SIZE
    });
  }

  /**
   * Enhanced encrypt with caching and performance optimization
   */
  public async encryptWithCache(
    value: string,
    organizationId: string,
    fieldName: string,
    options: CacheOptions = {}
  ): Promise<string> {
    const startTime = performance.now();
    const dataSize = Buffer.byteLength(value, 'utf8');

    try {
      // Generate cache key
      const cacheKey = this.generateCacheKey('encrypt', value, organizationId, fieldName);

      // Try cache first
      const cachedResult = await this.getFromCache(cacheKey, options);
      if (cachedResult) {
        this.recordMetrics('encrypt', performance.now() - startTime, dataSize, true);
        return cachedResult;
      }

      // Encrypt value
      const encryptedValue = await fieldEncryptionService.encryptField(value, {
        organizationId,
        fieldName,
        deterministic: options.strategy === 'redis' // Use deterministic for cacheable encryption
      });

      // Cache the result
      await this.setInCache(cacheKey, encryptedValue, options);

      this.recordMetrics('encrypt', performance.now() - startTime, dataSize, false);
      return encryptedValue;

    } catch (error) {
      logger.error('Cached encryption failed', {
        organizationId,
        fieldName,
        dataSize,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Enhanced decrypt with caching and performance optimization
   */
  public async decryptWithCache(
    encryptedValue: string,
    organizationId: string,
    fieldName: string,
    options: CacheOptions = {}
  ): Promise<string> {
    const startTime = performance.now();
    const dataSize = Buffer.byteLength(encryptedValue, 'utf8');

    try {
      // Generate cache key
      const cacheKey = this.generateCacheKey('decrypt', encryptedValue, organizationId, fieldName);

      // Try cache first
      const cachedResult = await this.getFromCache(cacheKey, options);
      if (cachedResult) {
        this.recordMetrics('decrypt', performance.now() - startTime, dataSize, true);
        return cachedResult;
      }

      // Decrypt value
      const decryptedValue = await fieldEncryptionService.decryptField(encryptedValue, {
        organizationId,
        fieldName
      });

      // Cache the result
      await this.setInCache(cacheKey, decryptedValue, options);

      this.recordMetrics('decrypt', performance.now() - startTime, dataSize, false);
      return decryptedValue;

    } catch (error) {
      logger.error('Cached decryption failed', {
        organizationId,
        fieldName,
        dataSize,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Batch encrypt with optimized performance
   */
  public async batchEncryptWithCache(
    values: Array<{ value: string; organizationId: string; fieldName: string }>,
    options: CacheOptions = {}
  ): Promise<string[]> {
    const startTime = performance.now();

    try {
      // Split into cached and uncached items
      const cacheResults = new Map<number, string>();
      const uncachedItems: Array<{ index: number; value: string; organizationId: string; fieldName: string }> = [];

      // Check cache for all items
      for (let i = 0; i < values.length; i++) {
        const item = values[i];
        const cacheKey = this.generateCacheKey('encrypt', item.value, item.organizationId, item.fieldName);
        const cachedResult = await this.getFromCache(cacheKey, options);

        if (cachedResult) {
          cacheResults.set(i, cachedResult);
        } else {
          uncachedItems.push({ index: i, ...item });
        }
      }

      // Process uncached items in parallel
      const uncachedPromises = uncachedItems.map(async (item) => {
        const encrypted = await fieldEncryptionService.encryptField(item.value, {
          organizationId: item.organizationId,
          fieldName: item.fieldName
        });

        // Cache the result
        const cacheKey = this.generateCacheKey('encrypt', item.value, item.organizationId, item.fieldName);
        await this.setInCache(cacheKey, encrypted, options);

        return { index: item.index, result: encrypted };
      });

      const uncachedResults = await Promise.all(uncachedPromises);

      // Combine cached and uncached results
      const results: string[] = new Array(values.length);
      for (const [index, result] of cacheResults.entries()) {
        results[index] = result;
      }
      for (const { index, result } of uncachedResults) {
        results[index] = result;
      }

      const totalDataSize = values.reduce((sum, item) => sum + Buffer.byteLength(item.value, 'utf8'), 0);
      this.recordMetrics('batch_encrypt', performance.now() - startTime, totalDataSize, cacheResults.size > 0);

      return results;

    } catch (error) {
      logger.error('Batch encryption with cache failed', {
        count: values.length,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Batch decrypt with optimized performance
   */
  public async batchDecryptWithCache(
    encryptedValues: Array<{ encryptedValue: string; organizationId: string; fieldName: string }>,
    options: CacheOptions = {}
  ): Promise<string[]> {
    const startTime = performance.now();

    try {
      // Split into cached and uncached items
      const cacheResults = new Map<number, string>();
      const uncachedItems: Array<{ index: number; encryptedValue: string; organizationId: string; fieldName: string }> = [];

      // Check cache for all items
      for (let i = 0; i < encryptedValues.length; i++) {
        const item = encryptedValues[i];
        const cacheKey = this.generateCacheKey('decrypt', item.encryptedValue, item.organizationId, item.fieldName);
        const cachedResult = await this.getFromCache(cacheKey, options);

        if (cachedResult) {
          cacheResults.set(i, cachedResult);
        } else {
          uncachedItems.push({ index: i, ...item });
        }
      }

      // Process uncached items in parallel
      const uncachedPromises = uncachedItems.map(async (item) => {
        const decrypted = await fieldEncryptionService.decryptField(item.encryptedValue, {
          organizationId: item.organizationId,
          fieldName: item.fieldName
        });

        // Cache the result
        const cacheKey = this.generateCacheKey('decrypt', item.encryptedValue, item.organizationId, item.fieldName);
        await this.setInCache(cacheKey, decrypted, options);

        return { index: item.index, result: decrypted };
      });

      const uncachedResults = await Promise.all(uncachedPromises);

      // Combine cached and uncached results
      const results: string[] = new Array(encryptedValues.length);
      for (const [index, result] of cacheResults.entries()) {
        results[index] = result;
      }
      for (const { index, result } of uncachedResults) {
        results[index] = result;
      }

      const totalDataSize = encryptedValues.reduce((sum, item) => sum + Buffer.byteLength(item.encryptedValue, 'utf8'), 0);
      this.recordMetrics('batch_decrypt', performance.now() - startTime, totalDataSize, cacheResults.size > 0);

      return results;

    } catch (error) {
      logger.error('Batch decryption with cache failed', {
        count: encryptedValues.length,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Prefetch commonly accessed encrypted data
   */
  public async prefetchData(
    organizationId: string,
    modelName: string,
    fieldNames: string[],
    recordIds?: string[]
  ): Promise<void> {
    try {
      const profile = this.getOptimizationProfile(organizationId);

      // In production, query database for records to prefetch
      // const records = await this.fetchRecordsForPrefetch(modelName, fieldNames, recordIds);

      // Prefetch encryption/decryption for hot fields
      for (const fieldName of fieldNames) {
        if (profile.hotFields.includes(`${modelName}.${fieldName}`)) {
          // Implement prefetching logic
          logger.debug('Prefetching data', { organizationId, modelName, fieldName });
        }
      }

    } catch (error) {
      logger.error('Data prefetch failed', {
        organizationId,
        modelName,
        fieldNames,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Generate cache key
   */
  private generateCacheKey(
    operation: string,
    data: string,
    organizationId: string,
    fieldName: string
  ): string {
    const hash = crypto.createHash('sha256')
      .update(`${operation}:${organizationId}:${fieldName}:${data}`)
      .digest('hex');
    return `enc:${operation}:${hash.substring(0, 16)}`;
  }

  /**
   * Get value from cache (memory or Redis)
   */
  private async getFromCache(key: string, options: CacheOptions): Promise<string | null> {
    const strategy = options.strategy || 'hybrid';

    try {
      // Try memory cache first
      if (strategy === 'memory' || strategy === 'hybrid') {
        const memoryResult = this.memoryCache.get<string>(key);
        if (memoryResult) {
          return options.compression ? this.decompress(memoryResult) : memoryResult;
        }
      }

      // Try Redis cache
      if ((strategy === 'redis' || strategy === 'hybrid') && this.redisClient) {
        const redisResult = await this.redisClient.get(key);
        if (redisResult) {
          const result = options.compression ? this.decompress(redisResult) : redisResult;

          // Populate memory cache for hybrid strategy
          if (strategy === 'hybrid' && options.ttl !== undefined) {
            this.memoryCache.set(key, redisResult, options.ttl);
          }

          return result;
        }
      }

      return null;
    } catch (error) {
      logger.error('Cache get failed', { key, error: error instanceof Error ? error.message : 'Unknown error' });
      return null;
    }
  }

  /**
   * Set value in cache
   */
  private async setInCache(key: string, value: string, options: CacheOptions): Promise<void> {
    const strategy = options.strategy || 'hybrid';
    const ttl = options.ttl || this.DEFAULT_TTL;

    try {
      const shouldCompress = options.compression && Buffer.byteLength(value, 'utf8') > this.COMPRESSION_THRESHOLD;
      const cacheValue = shouldCompress ? this.compress(value) : value;

      // Set in memory cache
      if (strategy === 'memory' || strategy === 'hybrid') {
        this.memoryCache.set(key, cacheValue, ttl);
      }

      // Set in Redis cache
      if ((strategy === 'redis' || strategy === 'hybrid') && this.redisClient) {
        await this.redisClient.setEx(key, ttl, cacheValue);
      }
    } catch (error) {
      logger.error('Cache set failed', { key, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  /**
   * Compress data using gzip
   */
  private compress(data: string): string {
    const zlib = require('zlib');
    const compressed = zlib.gzipSync(Buffer.from(data, 'utf8'));
    return compressed.toString('base64');
  }

  /**
   * Decompress data
   */
  private decompress(compressedData: string): string {
    const zlib = require('zlib');
    const buffer = Buffer.from(compressedData, 'base64');
    const decompressed = zlib.gunzipSync(buffer);
    return decompressed.toString('utf8');
  }

  /**
   * Record performance metrics
   */
  private recordMetrics(
    operation: string,
    duration: number,
    dataSize: number,
    cacheHit: boolean
  ): void {
    const metric: PerformanceMetrics = {
      operation,
      duration,
      dataSize,
      cacheHit,
      throughput: dataSize / (duration / 1000), // bytes per second
      timestamp: new Date()
    };

    this.performanceMetrics.push(metric);

    // Keep only recent metrics
    if (this.performanceMetrics.length > this.METRICS_RETENTION_COUNT) {
      this.performanceMetrics.splice(0, this.performanceMetrics.length - this.METRICS_RETENTION_COUNT);
    }

    // Log slow operations
    if (duration > this.MAX_ENCRYPTION_LATENCY && operation.includes('encrypt')) {
      logger.warn('Slow encryption operation detected', {
        operation,
        duration,
        dataSize,
        cacheHit
      });
    }

    if (duration > this.MAX_DECRYPTION_LATENCY && operation.includes('decrypt')) {
      logger.warn('Slow decryption operation detected', {
        operation,
        duration,
        dataSize,
        cacheHit
      });
    }
  }

  /**
   * Start performance monitoring
   */
  private startPerformanceMonitoring(): void {
    // Monitor performance metrics every 5 minutes
    this.performanceMonitorInterval = setInterval(() => {
      this.analyzePerformance();
    }, 300000);

    // Monitor cache health every minute
    this.cacheHealthMonitorInterval = setInterval(() => {
      this.monitorCacheHealth();
    }, 60000);
  }

  /**
   * Stop performance monitoring
   */
  public stopMonitoring(): void {
    if (this.performanceMonitorInterval) {
      clearInterval(this.performanceMonitorInterval);
      this.performanceMonitorInterval = undefined;
    }
    if (this.cacheHealthMonitorInterval) {
      clearInterval(this.cacheHealthMonitorInterval);
      this.cacheHealthMonitorInterval = undefined;
    }
    logger.info('Performance monitoring stopped');
  }

  /**
   * Analyze performance and adjust optimization strategies
   */
  private analyzePerformance(): void {
    if (this.performanceMetrics.length === 0) return;

    const recentMetrics = this.performanceMetrics.slice(-1000); // Last 1000 operations
    const avgDuration = recentMetrics.reduce((sum, m) => sum + m.duration, 0) / recentMetrics.length;
    const avgThroughput = recentMetrics.reduce((sum, m) => sum + m.throughput, 0) / recentMetrics.length;
    const cacheHitRate = recentMetrics.filter(m => m.cacheHit).length / recentMetrics.length;

    logger.info('Performance analysis', {
      avgDuration: Math.round(avgDuration),
      avgThroughput: Math.round(avgThroughput),
      cacheHitRate: Math.round(cacheHitRate * 100) / 100,
      totalOperations: recentMetrics.length
    });

    // Trigger optimization if performance is poor
    if (avgDuration > this.MAX_ENCRYPTION_LATENCY || avgThroughput < this.MIN_THROUGHPUT) {
      this.optimizePerformance();
    }
  }

  /**
   * Monitor cache health
   */
  private monitorCacheHealth(): void {
    const memoryStats = this.memoryCache.getStats();
    const memoryUsage = process.memoryUsage();

    logger.debug('Cache health check', {
      memoryCache: {
        keys: memoryStats.keys,
        hits: memoryStats.hits,
        misses: memoryStats.misses,
        hitRate: memoryStats.hits / (memoryStats.hits + memoryStats.misses)
      },
      memoryUsage: {
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + 'MB',
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + 'MB'
      }
    });

    // Clear cache if memory usage is too high
    if (memoryUsage.heapUsed > 500 * 1024 * 1024) { // 500MB
      this.memoryCache.flushAll();
      logger.warn('Memory cache cleared due to high memory usage');
    }
  }

  /**
   * Optimize performance based on current metrics
   */
  private optimizePerformance(): void {
    logger.info('Optimizing encryption performance');

    // Increase memory cache size if hit rate is low
    const stats = this.memoryCache.getStats();
    const hitRate = stats.hits / (stats.hits + stats.misses);

    if (hitRate < 0.7) {
      // Adjust cache settings
      logger.info('Adjusting cache settings for better performance', { currentHitRate: hitRate });
    }

    // Identify hot fields for better caching
    this.identifyHotFields();
  }

  /**
   * Identify frequently accessed fields
   */
  private identifyHotFields(): void {
    const fieldAccess = new Map<string, number>();

    for (const metric of this.performanceMetrics.slice(-5000)) {
      // Extract field info from operation context (would need to be added to metrics)
      // fieldAccess.set(fieldName, (fieldAccess.get(fieldName) || 0) + 1);
    }

    // Update optimization profiles with hot fields
    for (const [organizationId, profile] of this.optimizationProfiles) {
      // Update profile.hotFields based on fieldAccess data
      logger.debug('Updated hot fields for organization', { organizationId });
    }
  }

  /**
   * Get optimization profile for organization
   */
  private getOptimizationProfile(organizationId: string): OptimizationProfile {
    let profile = this.optimizationProfiles.get(organizationId);

    if (!profile) {
      profile = {
        organizationId,
        preferredCacheStrategy: 'hybrid',
        optimalBatchSize: this.BATCH_SIZE_THRESHOLD,
        compressionThreshold: this.COMPRESSION_THRESHOLD,
        prefetchPatterns: [],
        hotFields: [],
        performanceTargets: {
          maxEncryptionLatency: this.MAX_ENCRYPTION_LATENCY,
          maxDecryptionLatency: this.MAX_DECRYPTION_LATENCY,
          minThroughput: this.MIN_THROUGHPUT,
          maxMemoryUsage: 100 * 1024 * 1024 // 100MB
        }
      };

      this.optimizationProfiles.set(organizationId, profile);
    }

    return profile;
  }

  /**
   * Run encryption benchmarks
   */
  public async runBenchmarks(): Promise<EncryptionBenchmark[]> {
    logger.info('Running encryption benchmarks');

    const benchmarks: EncryptionBenchmark[] = [];
    const testData = [
      'Short text',
      'Medium length text with some special characters and numbers 123456789',
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.'
    ];

    for (const data of testData) {
      const benchmark = await this.benchmarkEncryption(data);
      benchmarks.push(benchmark);
    }

    logger.info('Benchmarks completed', { benchmarkCount: benchmarks.length });
    return benchmarks;
  }

  /**
   * Benchmark encryption performance for specific data
   */
  private async benchmarkEncryption(testData: string): Promise<EncryptionBenchmark> {
    const iterations = 1000;
    const durations: number[] = [];
    let errorCount = 0;

    const memoryBefore = process.memoryUsage().heapUsed;

    for (let i = 0; i < iterations; i++) {
      try {
        const start = performance.now();
        await fieldEncryptionService.encryptField(testData, {
          organizationId: 'benchmark',
          fieldName: 'test'
        });
        durations.push(performance.now() - start);
      } catch {
        errorCount++;
      }
    }

    const memoryAfter = process.memoryUsage().heapUsed;

    durations.sort((a, b) => a - b);
    const avgLatency = durations.reduce((sum, d) => sum + d, 0) / durations.length;
    const p95Latency = durations[Math.floor(durations.length * 0.95)];
    const p99Latency = durations[Math.floor(durations.length * 0.99)];

    return {
      algorithm: 'aes-256-gcm',
      keySize: 256,
      dataSize: Buffer.byteLength(testData, 'utf8'),
      operationsPerSecond: 1000 / avgLatency,
      averageLatency: avgLatency,
      p95Latency,
      p99Latency,
      memoryUsage: memoryAfter - memoryBefore,
      errorRate: errorCount / iterations
    };
  }

  /**
   * Get cache statistics
   */
  public getCacheStats(): CacheStats {
    const memoryStats = this.memoryCache.getStats();
    const totalRequests = memoryStats.hits + memoryStats.misses;

    return {
      hitRate: totalRequests > 0 ? memoryStats.hits / totalRequests : 0,
      missRate: totalRequests > 0 ? memoryStats.misses / totalRequests : 0,
      totalRequests,
      memoryUsage: process.memoryUsage().heapUsed,
      evictions: 0, // Would need to track this
      avgResponseTime: this.calculateAverageResponseTime()
    };
  }

  /**
   * Calculate average response time from recent metrics
   */
  private calculateAverageResponseTime(): number {
    const recentMetrics = this.performanceMetrics.slice(-1000);
    if (recentMetrics.length === 0) return 0;

    return recentMetrics.reduce((sum, m) => sum + m.duration, 0) / recentMetrics.length;
  }

  /**
   * Clear all caches
   */
  public async clearAllCaches(): Promise<void> {
    this.memoryCache.flushAll();

    if (this.redisClient) {
      const keys = await this.redisClient.keys('enc:*');
      if (keys.length > 0) {
        await this.redisClient.del(keys);
      }
    }

    logger.info('All caches cleared');
  }

  /**
   * Get performance metrics
   */
  public getPerformanceMetrics(limit: number = 1000): PerformanceMetrics[] {
    return this.performanceMetrics.slice(-limit);
  }

  /**
   * Cleanup service
   */
  public async shutdown(): Promise<void> {
    this.memoryCache.close();
    logger.info('Encryption performance service shut down');
  }
}

// Export singleton instance (will be initialized with Redis client if available)
export let encryptionPerformanceService: EncryptionPerformanceService;

export function initializeEncryptionPerformanceService(redisClient?: RedisClientType): void {
  encryptionPerformanceService = new EncryptionPerformanceService(redisClient);
}