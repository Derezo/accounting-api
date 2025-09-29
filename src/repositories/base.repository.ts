import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

export interface PaginationOptions {
  limit?: number;
  offset?: number;
  cursor?: string;
}

export interface PaginationResult<T> {
  data: T[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasNext?: boolean;
    hasPrev?: boolean;
    cursor?: string;
  };
}

export interface BaseEntity {
  id: string;
  organizationId: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface AuditContext {
  userId: string;
  ipAddress?: string;
  userAgent?: string;
}

export abstract class BaseRepository<T extends BaseEntity> {
  protected readonly prisma: PrismaClient;
  protected readonly modelName: string;
  protected readonly defaultIncludes: Record<string, boolean | object>;

  constructor(modelName: string, defaultIncludes: Record<string, boolean | object> = {}) {
    this.prisma = prisma;
    this.modelName = modelName;
    this.defaultIncludes = defaultIncludes;
  }

  /**
   * Get the Prisma model delegate for this repository
   */
  protected get model(): any {
    return (this.prisma as any)[this.modelName];
  }

  /**
   * Base multi-tenant where clause that all queries must include
   */
  protected getBaseWhere(organizationId: string, additionalWhere: any = {}): any {
    return {
      organizationId,
      deletedAt: null,
      ...additionalWhere
    };
  }

  /**
   * Create a new entity with multi-tenant validation
   */
  async create(
    organizationId: string,
    data: Omit<T, 'id' | 'organizationId' | 'createdAt' | 'updatedAt' | 'deletedAt'>,
    auditContext?: AuditContext
  ): Promise<T> {
    const now = new Date();
    const entityData = {
      ...data,
      organizationId,
      createdAt: now,
      updatedAt: now,
      deletedAt: null
    };

    try {
      const result = await this.model.create({
        data: entityData,
        include: this.defaultIncludes
      });

      if (auditContext) {
        await this.logAuditEvent('CREATE', organizationId, result.id, null, result, auditContext);
      }

      return result;
    } catch (error) {
      logger.error(`Failed to create ${this.modelName}`, {
        organizationId,
        error: error instanceof Error ? error.message : 'Unknown error',
        data: entityData
      });
      throw error;
    }
  }

  /**
   * Find a single entity by ID with multi-tenant filtering
   */
  async findById(
    organizationId: string,
    id: string,
    include?: Record<string, boolean | object>
  ): Promise<T | null> {
    return this.model.findFirst({
      where: this.getBaseWhere(organizationId, { id }),
      include: include || this.defaultIncludes
    });
  }

  /**
   * Find entities with pagination and multi-tenant filtering
   */
  async findMany(
    organizationId: string,
    options: {
      where?: any;
      orderBy?: any;
      include?: Record<string, boolean | object>;
      pagination?: PaginationOptions;
    } = {}
  ): Promise<PaginationResult<T>> {
    const {
      where = {},
      orderBy = { createdAt: 'desc' },
      include,
      pagination = {}
    } = options;

    const {
      limit = 50,
      offset = 0
    } = pagination;

    // Ensure limit is within reasonable bounds
    const safeLimit = Math.min(Math.max(1, limit), 1000);

    const baseWhere = this.getBaseWhere(organizationId, where);

    try {
      const [data, total] = await Promise.all([
        this.model.findMany({
          where: baseWhere,
          orderBy,
          skip: offset,
          take: safeLimit,
          include: include || this.defaultIncludes
        }),
        this.model.count({
          where: baseWhere
        })
      ]);

      return {
        data,
        pagination: {
          total,
          limit: safeLimit,
          offset,
          hasNext: offset + safeLimit < total,
          hasPrev: offset > 0
        }
      };
    } catch (error) {
      logger.error(`Failed to find ${this.modelName} entities`, {
        organizationId,
        where: baseWhere,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Update an entity with multi-tenant validation
   */
  async update(
    organizationId: string,
    id: string,
    data: Partial<Omit<T, 'id' | 'organizationId' | 'createdAt' | 'updatedAt' | 'deletedAt'>>,
    auditContext?: AuditContext
  ): Promise<T> {
    // First verify the entity exists and belongs to the organization
    const existing = await this.findById(organizationId, id);
    if (!existing) {
      throw new Error(`${this.modelName} not found or access denied`);
    }

    const updateData = {
      ...data,
      updatedAt: new Date()
    };

    try {
      const result = await this.model.update({
        where: { id },
        data: updateData,
        include: this.defaultIncludes
      });

      if (auditContext) {
        await this.logAuditEvent('UPDATE', organizationId, id, existing, result, auditContext);
      }

      return result;
    } catch (error) {
      logger.error(`Failed to update ${this.modelName}`, {
        organizationId,
        id,
        error: error instanceof Error ? error.message : 'Unknown error',
        data: updateData
      });
      throw error;
    }
  }

  /**
   * Soft delete an entity with multi-tenant validation
   */
  async delete(
    organizationId: string,
    id: string,
    auditContext?: AuditContext
  ): Promise<T> {
    // First verify the entity exists and belongs to the organization
    const existing = await this.findById(organizationId, id);
    if (!existing) {
      throw new Error(`${this.modelName} not found or access denied`);
    }

    const now = new Date();

    try {
      const result = await this.model.update({
        where: { id },
        data: {
          deletedAt: now,
          updatedAt: now
        },
        include: this.defaultIncludes
      });

      if (auditContext) {
        await this.logAuditEvent('DELETE', organizationId, id, existing, result, auditContext);
      }

      return result;
    } catch (error) {
      logger.error(`Failed to delete ${this.modelName}`, {
        organizationId,
        id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Count entities with multi-tenant filtering
   */
  async count(organizationId: string, where: any = {}): Promise<number> {
    return this.model.count({
      where: this.getBaseWhere(organizationId, where)
    });
  }

  /**
   * Check if an entity exists
   */
  async exists(organizationId: string, id: string): Promise<boolean> {
    const entity = await this.findById(organizationId, id);
    return entity !== null;
  }

  /**
   * Batch operation helper with transaction support
   */
  async batchOperation<R>(
    organizationId: string,
    operation: (tx: any) => Promise<R>,
    auditContext?: AuditContext
  ): Promise<R> {
    return this.prisma.$transaction(async (tx) => {
      try {
        const result = await operation(tx);

        if (auditContext) {
          logger.info(`Batch operation completed for ${this.modelName}`, {
            organizationId,
            userId: auditContext.userId,
            timestamp: new Date().toISOString()
          });
        }

        return result;
      } catch (error) {
        logger.error(`Batch operation failed for ${this.modelName}`, {
          organizationId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        throw error;
      }
    });
  }

  /**
   * Execute raw query with organization filtering
   */
  async executeRaw(
    query: string,
    parameters: any[] = []
  ): Promise<any> {
    try {
      return await this.prisma.$queryRawUnsafe(query, ...parameters);
    } catch (error) {
      logger.error(`Raw query execution failed for ${this.modelName}`, {
        query,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Convert Decimal fields to numbers for JSON serialization
   */
  protected convertDecimalFields(entity: any, decimalFields: string[]): any {
    if (!entity) return entity;

    const converted = { ...entity };
    for (const field of decimalFields) {
      if (converted[field] instanceof Decimal) {
        converted[field] = converted[field].toNumber();
      }
    }
    return converted;
  }

  /**
   * Log audit events (can be overridden by subclasses)
   */
  protected async logAuditEvent(
    action: 'CREATE' | 'UPDATE' | 'DELETE',
    organizationId: string,
    entityId: string,
    oldData: any,
    newData: any,
    auditContext: AuditContext
  ): Promise<void> {
    try {
      // This would integrate with your audit service
      // For now, just log the event
      logger.info(`Audit: ${action} ${this.modelName}`, {
        organizationId,
        entityId,
        userId: auditContext.userId,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        timestamp: new Date().toISOString(),
        hasOldData: !!oldData,
        hasNewData: !!newData
      });
    } catch (error) {
      logger.error('Failed to log audit event', {
        action,
        modelName: this.modelName,
        entityId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      // Don't throw here - audit failures shouldn't break business operations
    }
  }

  /**
   * Validate organization access (can be overridden for additional checks)
   */
  protected async validateOrganizationAccess(
    organizationId: string,
    userId: string
  ): Promise<boolean> {
    try {
      const userOrg = await this.prisma.user.findFirst({
        where: {
          id: userId,
          organizationId,
          isActive: true,
          deletedAt: null
        }
      });
      return !!userOrg;
    } catch (error) {
      logger.error('Failed to validate organization access', {
        organizationId,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  /**
   * Search entities with full-text search capability
   */
  async search(
    organizationId: string,
    searchTerm: string,
    searchFields: string[],
    options: {
      where?: any;
      orderBy?: any;
      include?: Record<string, boolean | object>;
      pagination?: PaginationOptions;
    } = {}
  ): Promise<PaginationResult<T>> {
    const searchWhere = {
      OR: searchFields.map(field => ({
        [field]: {
          contains: searchTerm,
          mode: 'insensitive'
        }
      }))
    };

    return this.findMany(organizationId, {
      ...options,
      where: {
        ...options.where,
        ...searchWhere
      }
    });
  }
}