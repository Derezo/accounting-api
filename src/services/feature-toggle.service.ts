import { prisma } from '../config/database';
import { auditService } from './audit.service';
import { logger } from '../utils/logger';

export enum FeatureToggleScope {
  GLOBAL = 'GLOBAL',
  ORGANIZATION = 'ORGANIZATION',
  USER = 'USER'
}

export interface CreateFeatureToggleInput {
  key: string;
  name: string;
  description: string;
  enabled: boolean;
  scope: FeatureToggleScope;
  targetOrganizations?: string[];
  targetUsers?: string[];
  rolloutPercentage?: number;
}

export interface UpdateFeatureToggleInput {
  name?: string;
  description?: string;
  enabled?: boolean;
  scope?: FeatureToggleScope;
  targetOrganizations?: string[];
  targetUsers?: string[];
  rolloutPercentage?: number;
}

export interface FeatureCheckResult {
  enabled: boolean;
  toggle?: any;
  reason?: string;
}

export interface AuditContext {
  userId: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Feature Toggle Service
 *
 * Manages feature flags for gradual rollout and A/B testing.
 * Supports GLOBAL, ORGANIZATION, and USER scopes with percentage-based rollout.
 *
 * Features:
 * - In-memory caching for fast feature checks (fallback if Redis unavailable)
 * - Redis caching support for distributed environments
 * - Percentage-based gradual rollout
 * - Organization and user targeting
 * - Audit logging for all toggle changes
 * - Cache invalidation on updates
 *
 * @example
 * // Check if feature is enabled for a user/org
 * const result = await featureToggleService.isEnabled('beta_dashboard', {
 *   userId: 'user_123',
 *   organizationId: 'org_456'
 * });
 */
export class FeatureToggleService {
  // In-memory cache (fallback if Redis is unavailable)
  private cache: Map<string, { toggle: any; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 60000; // 60 seconds

  // Redis client (optional, will use in-memory if not available)
  private redisClient: any = null;

  constructor() {
    this.initializeRedis();
  }

  /**
   * Initialize Redis connection (optional)
   */
  private async initializeRedis(): Promise<void> {
    try {
      // Attempt to import Redis if available
      const Redis = await import('ioredis').catch(() => null);
      if (!Redis || !process.env.REDIS_URL) {
        logger.info('Redis not available, using in-memory cache for feature toggles');
        return;
      }

      this.redisClient = new Redis.default(process.env.REDIS_URL, {
        password: process.env.REDIS_PASSWORD,
        retryStrategy: (times: number) => {
          if (times > 3) {
            logger.warn('Redis connection failed, falling back to in-memory cache');
            return null;
          }
          return Math.min(times * 100, 3000);
        }
      });

      this.redisClient.on('error', (err: Error) => {
        logger.error('Redis error:', err);
        this.redisClient = null;
      });

      logger.info('Redis connected for feature toggle caching');
    } catch (error) {
      logger.warn('Failed to initialize Redis, using in-memory cache:', error);
    }
  }

  /**
   * Get a toggle from cache (Redis or in-memory)
   */
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  private async getFromCache(key: string): Promise<any | null> {
    // Try Redis first
    if (this.redisClient) {
      try {
        const cached = await this.redisClient.get(`feature:${key}`);
        if (cached) {
          return JSON.parse(cached);
        }
      } catch (error) {
        logger.error('Redis get error:', error);
      }
    }

    // Fallback to in-memory cache
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.toggle;
    }

    return null;
  }

  /**
   * Set a toggle in cache (Redis or in-memory)
   */
  private async setInCache(key: string, toggle: any): Promise<void> {
    // Try Redis first
    if (this.redisClient) {
      try {
        await this.redisClient.setex(
          `feature:${key}`,
          Math.floor(this.CACHE_TTL / 1000),
          JSON.stringify(toggle)
        );
      } catch (error) {
        logger.error('Redis set error:', error);
      }
    }

    // Always set in in-memory cache as fallback
    this.cache.set(key, { toggle, timestamp: Date.now() });
  }

  /**
   * Invalidate cache for a specific toggle
   */
  private async invalidateCache(key: string): Promise<void> {
    // Clear Redis cache
    if (this.redisClient) {
      try {
        await this.redisClient.del(`feature:${key}`);
      } catch (error) {
        logger.error('Redis delete error:', error);
      }
    }

    // Clear in-memory cache
    this.cache.delete(key);
  }

  /**
   * Get all feature toggles with optional filtering
   *
   * @param filters - Optional filters for scope, enabled status
   * @returns Array of feature toggles
   */
  async getAll(filters?: {
    scope?: FeatureToggleScope;
    enabled?: boolean;
  }): Promise<any[]> {
    const where: any = {};

    if (filters?.scope) {
      where.scope = filters.scope;
    }
    if (filters?.enabled !== undefined) {
      where.enabled = filters.enabled;
    }

    const toggles = await prisma.featureToggle.findMany({
      where,
      orderBy: { createdAt: 'desc' }
    });

    return toggles;
  }

  /**
   * Get a single feature toggle by ID
   *
   * @param id - Toggle ID
   * @returns Feature toggle or null
   */
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  async getById(id: string): Promise<any | null> {
    const toggle = await prisma.featureToggle.findUnique({
      where: { id }
    });

    return toggle;
  }

  /**
   * Get a feature toggle by key
   *
   * @param key - Toggle key
   * @returns Feature toggle or null
   */
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  async getByKey(key: string): Promise<any | null> {
    // Check cache first
    const cached = await this.getFromCache(key);
    if (cached) {
      return cached;
    }

    // Fetch from database
    const toggle = await prisma.featureToggle.findUnique({
      where: { key }
    });

    if (toggle) {
      await this.setInCache(key, toggle);
    }

    return toggle;
  }

  /**
   * Create a new feature toggle
   *
   * @param data - Toggle creation data
   * @param context - Audit context
   * @returns Created toggle
   */
  async create(data: CreateFeatureToggleInput, context: AuditContext): Promise<any> {
    // Validate rollout percentage
    if (data.rolloutPercentage !== undefined && data.rolloutPercentage !== null) {
      if (data.rolloutPercentage < 0 || data.rolloutPercentage > 100) {
        throw new Error('Rollout percentage must be between 0 and 100');
      }
    }

    // Validate scope-specific fields
    if (data.scope === FeatureToggleScope.ORGANIZATION && !data.targetOrganizations?.length) {
      throw new Error('Target organizations required for ORGANIZATION scope');
    }
    if (data.scope === FeatureToggleScope.USER && !data.targetUsers?.length) {
      throw new Error('Target users required for USER scope');
    }

    const toggle = await prisma.featureToggle.create({
      data: {
        key: data.key,
        name: data.name,
        description: data.description,
        enabled: data.enabled,
        scope: data.scope,
        targetOrganizations: data.targetOrganizations ? JSON.stringify(data.targetOrganizations) : null,
        targetUsers: data.targetUsers ? JSON.stringify(data.targetUsers) : null,
        rolloutPercentage: data.rolloutPercentage ?? 0,
        createdBy: context.userId
      }
    });

    // Audit log
    await auditService.log({
      organizationId: 'SYSTEM',
      userId: context.userId,
      action: 'CREATE',
      entityType: 'FeatureToggle',
      entityId: toggle.id,
      changes: { created: toggle },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    logger.info(`Feature toggle created: ${toggle.key} by user ${context.userId}`);

    return toggle;
  }

  /**
   * Update a feature toggle
   *
   * @param id - Toggle ID
   * @param data - Update data
   * @param context - Audit context
   * @returns Updated toggle
   */
  async update(id: string, data: UpdateFeatureToggleInput, context: AuditContext): Promise<any> {
    const existing = await prisma.featureToggle.findUnique({ where: { id } });
    if (!existing) {
      throw new Error('Feature toggle not found');
    }

    // Validate rollout percentage
    if (data.rolloutPercentage !== undefined && data.rolloutPercentage !== null) {
      if (data.rolloutPercentage < 0 || data.rolloutPercentage > 100) {
        throw new Error('Rollout percentage must be between 0 and 100');
      }
    }

    const updateData: any = {
      updatedBy: context.userId,
      updatedAt: new Date()
    };

    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.enabled !== undefined) updateData.enabled = data.enabled;
    if (data.scope !== undefined) updateData.scope = data.scope;
    if (data.rolloutPercentage !== undefined) updateData.rolloutPercentage = data.rolloutPercentage;

    if (data.targetOrganizations !== undefined) {
      updateData.targetOrganizations = data.targetOrganizations ? JSON.stringify(data.targetOrganizations) : null;
    }
    if (data.targetUsers !== undefined) {
      updateData.targetUsers = data.targetUsers ? JSON.stringify(data.targetUsers) : null;
    }

    const toggle = await prisma.featureToggle.update({
      where: { id },
      data: updateData
    });

    // Invalidate cache
    await this.invalidateCache(toggle.key);

    // Audit log
    await auditService.log({
      organizationId: 'SYSTEM',
      userId: context.userId,
      action: 'UPDATE',
      entityType: 'FeatureToggle',
      entityId: toggle.id,
      changes: { before: existing, after: toggle },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    logger.info(`Feature toggle updated: ${toggle.key} by user ${context.userId}`);

    return toggle;
  }

  /**
   * Delete a feature toggle
   *
   * @param id - Toggle ID
   * @param context - Audit context
   * @returns Deleted toggle
   */
  async delete(id: string, context: AuditContext): Promise<any> {
    const toggle = await prisma.featureToggle.findUnique({ where: { id } });
    if (!toggle) {
      throw new Error('Feature toggle not found');
    }

    await prisma.featureToggle.delete({ where: { id } });

    // Invalidate cache
    await this.invalidateCache(toggle.key);

    // Audit log
    await auditService.log({
      organizationId: 'SYSTEM',
      userId: context.userId,
      action: 'DELETE',
      entityType: 'FeatureToggle',
      entityId: toggle.id,
      changes: { deleted: toggle },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    logger.info(`Feature toggle deleted: ${toggle.key} by user ${context.userId}`);

    return toggle;
  }

  /**
   * Check if a feature is enabled for a user/organization
   *
   * @param key - Feature toggle key
   * @param options - User ID and/or organization ID
   * @returns Feature check result
   */
  async isEnabled(
    key: string,
    options?: {
      userId?: string;
      organizationId?: string;
    }
  ): Promise<FeatureCheckResult> {
    const toggle = await this.getByKey(key);

    // Toggle doesn't exist - disabled by default
    if (!toggle) {
      return {
        enabled: false,
        reason: 'Toggle not found'
      };
    }

    // Toggle is globally disabled
    if (!toggle.enabled) {
      return {
        enabled: false,
        toggle,
        reason: 'Toggle disabled'
      };
    }

    // Check scope-based logic
    if (toggle.scope === FeatureToggleScope.GLOBAL) {
      // Global scope - check rollout percentage
      const enabled = this.checkRolloutPercentage(toggle, options?.userId);
      return {
        enabled,
        toggle,
        reason: enabled ? 'Global rollout' : 'Not in rollout percentage'
      };
    }

    if (toggle.scope === FeatureToggleScope.ORGANIZATION) {
      if (!options?.organizationId) {
        return {
          enabled: false,
          toggle,
          reason: 'Organization ID required for organization-scoped toggle'
        };
      }

      const targetOrgs = toggle.targetOrganizations ? JSON.parse(toggle.targetOrganizations) : [];
      const isTargeted = targetOrgs.includes(options.organizationId);

      if (!isTargeted) {
        return {
          enabled: false,
          toggle,
          reason: 'Organization not targeted'
        };
      }

      // Check rollout percentage
      const enabled = this.checkRolloutPercentage(toggle, options?.userId);
      return {
        enabled,
        toggle,
        reason: enabled ? 'Organization targeted' : 'Not in rollout percentage'
      };
    }

    if (toggle.scope === FeatureToggleScope.USER) {
      if (!options?.userId) {
        return {
          enabled: false,
          toggle,
          reason: 'User ID required for user-scoped toggle'
        };
      }

      const targetUsers = toggle.targetUsers ? JSON.parse(toggle.targetUsers) : [];
      const isTargeted = targetUsers.includes(options.userId);

      return {
        enabled: isTargeted,
        toggle,
        reason: isTargeted ? 'User targeted' : 'User not targeted'
      };
    }

    return {
      enabled: false,
      toggle,
      reason: 'Unknown scope'
    };
  }

  /**
   * Check if entity passes rollout percentage
   *
   * Uses deterministic hashing for consistent results
   * @param toggle - Feature toggle
   * @param entityId - User ID or other identifier
   * @returns True if entity is in rollout percentage
   */
  private checkRolloutPercentage(toggle: any, entityId?: string): boolean {
    if (!toggle.rolloutPercentage || toggle.rolloutPercentage === 100) {
      return true;
    }

    if (toggle.rolloutPercentage === 0) {
      return false;
    }

    // Use deterministic hashing for consistent rollout
    const seed = entityId || 'anonymous';
    const hash = this.hashString(`${toggle.key}:${seed}`);
    const percentage = hash % 100;

    return percentage < toggle.rolloutPercentage;
  }

  /**
   * Simple string hash function for deterministic rollout
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }
}

export const featureToggleService = new FeatureToggleService();
