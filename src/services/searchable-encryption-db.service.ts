/**
 * Searchable Encryption Database Service
 * Manages search indexes for encrypted fields with blind index and search token support
 */

import { prisma } from '@/config/database';
import { logger } from '@/utils/logger';
import crypto from 'crypto';

interface CreateSearchIndexOptions {
  organizationId: string;
  entityType: string;
  entityId: string;
  fieldName: string;
  plaintext: string;
  keyVersion: number;
  algorithm: string;
  expiresAt?: Date | null;
}

interface SearchIndexQuery {
  organizationId: string;
  entityType?: string;
  fieldName?: string;
  exactMatch?: string;
  partialMatch?: string;
  includeExpired?: boolean;
}

interface SearchIndexResult {
  entityId: string;
  entityType: string;
  fieldName: string;
  createdAt: Date;
  expiresAt: Date | null;
}

class SearchableEncryptionDbService {
  /**
   * Generate blind index from plaintext using HMAC-SHA256
   * Deterministic hash for exact matching
   */
  private generateBlindIndex(
    plaintext: string,
    organizationId: string,
    fieldName: string
  ): string {
    const key = this.deriveIndexKey(organizationId, fieldName, 'blind');
    const hmac = crypto.createHmac('sha256', key);
    hmac.update(plaintext.toLowerCase().trim());
    return hmac.digest('hex');
  }

  /**
   * Generate search tokens from plaintext for partial matching
   * Tokenizes input and creates searchable index
   */
  private generateSearchTokens(
    plaintext: string,
    organizationId: string,
    fieldName: string
  ): string[] {
    const tokens: string[] = [];
    const normalized = plaintext.toLowerCase().trim();

    // Generate n-grams for substring matching (3-character minimum)
    for (let i = 0; i < normalized.length - 2; i++) {
      const ngram = normalized.substring(i, i + 3);
      if (ngram.length === 3) {
        const key = this.deriveIndexKey(organizationId, fieldName, 'token');
        const hmac = crypto.createHmac('sha256', key);
        hmac.update(ngram);
        tokens.push(hmac.digest('hex'));
      }
    }

    // Generate word tokens for word-based search
    const words = normalized.split(/\s+/).filter(w => w.length >= 3);
    for (const word of words) {
      const key = this.deriveIndexKey(organizationId, fieldName, 'word');
      const hmac = crypto.createHmac('sha256', key);
      hmac.update(word);
      tokens.push(hmac.digest('hex'));
    }

    // Remove duplicates
    return [...new Set(tokens)];
  }

  /**
   * Derive organization-specific key for index generation
   */
  private deriveIndexKey(
    organizationId: string,
    fieldName: string,
    indexType: 'blind' | 'token' | 'word'
  ): Buffer {
    const masterSecret = process.env.ENCRYPTION_MASTER_KEY || 'default-master-key';
    const salt = `${organizationId}:${fieldName}:${indexType}`;

    return crypto.pbkdf2Sync(
      masterSecret,
      salt,
      600000, // 600k iterations for FIPS compliance
      32,
      'sha256'
    );
  }

  /**
   * Create or update search index for an encrypted field
   */
  async storeSearchIndex(options: CreateSearchIndexOptions): Promise<void> {
    try {
      const blindIndex = this.generateBlindIndex(
        options.plaintext,
        options.organizationId,
        options.fieldName
      );

      const searchTokens = this.generateSearchTokens(
        options.plaintext,
        options.organizationId,
        options.fieldName
      );

      // Check if index already exists
      const existing = await prisma.searchIndex.findFirst({
        where: {
          organizationId: options.organizationId,
          entityType: options.entityType,
          entityId: options.entityId,
          fieldName: options.fieldName,
        },
      });

      if (existing) {
        // Update existing index
        await prisma.searchIndex.update({
          where: { id: existing.id },
          data: {
            blindIndex,
            searchTokens: JSON.stringify(searchTokens),
            keyVersion: options.keyVersion,
            algorithm: options.algorithm,
            expiresAt: options.expiresAt,
            updatedAt: new Date(),
          },
        });

        logger.debug('Updated search index', {
          organizationId: options.organizationId,
          entityType: options.entityType,
          entityId: options.entityId,
          fieldName: options.fieldName,
        });
      } else {
        // Create new index
        await prisma.searchIndex.create({
          data: {
            organizationId: options.organizationId,
            entityType: options.entityType,
            entityId: options.entityId,
            fieldName: options.fieldName,
            blindIndex,
            searchTokens: JSON.stringify(searchTokens),
            keyVersion: options.keyVersion,
            algorithm: options.algorithm,
            expiresAt: options.expiresAt,
          },
        });

        logger.debug('Created search index', {
          organizationId: options.organizationId,
          entityType: options.entityType,
          entityId: options.entityId,
          fieldName: options.fieldName,
        });
      }
    } catch (error) {
      logger.error('Failed to store search index', {
        error,
        organizationId: options.organizationId,
        entityType: options.entityType,
        entityId: options.entityId,
        fieldName: options.fieldName,
      });
      throw error;
    }
  }

  /**
   * Query encrypted fields using exact match (blind index)
   */
  async queryByExactMatch(
    organizationId: string,
    fieldName: string,
    searchValue: string,
    entityType?: string
  ): Promise<SearchIndexResult[]> {
    try {
      const blindIndex = this.generateBlindIndex(
        searchValue,
        organizationId,
        fieldName
      );

      const now = new Date();
      const results = await prisma.searchIndex.findMany({
        where: {
          organizationId,
          blindIndex,
          ...(entityType ? { entityType } : {}),
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: now } },
          ],
        },
        select: {
          entityId: true,
          entityType: true,
          fieldName: true,
          createdAt: true,
          expiresAt: true,
        },
      });

      logger.debug('Exact match search completed', {
        organizationId,
        fieldName,
        entityType,
        resultCount: results.length,
      });

      return results;
    } catch (error) {
      logger.error('Failed to query by exact match', {
        error,
        organizationId,
        fieldName,
        entityType,
      });
      throw error;
    }
  }

  /**
   * Query encrypted fields using partial match (search tokens)
   */
  async queryByPartialMatch(
    organizationId: string,
    fieldName: string,
    searchValue: string,
    entityType?: string
  ): Promise<SearchIndexResult[]> {
    try {
      const searchTokens = this.generateSearchTokens(
        searchValue,
        organizationId,
        fieldName
      );

      if (searchTokens.length === 0) {
        return [];
      }

      const now = new Date();

      // Query all search indexes for this field
      const indexes = await prisma.searchIndex.findMany({
        where: {
          organizationId,
          fieldName,
          ...(entityType ? { entityType } : {}),
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: now } },
          ],
        },
        select: {
          entityId: true,
          entityType: true,
          fieldName: true,
          createdAt: true,
          expiresAt: true,
          searchTokens: true,
        },
      });

      // Filter indexes that contain any of our search tokens
      const matches = indexes.filter(index => {
        const indexTokens: string[] = JSON.parse(index.searchTokens);
        return searchTokens.some(token => indexTokens.includes(token));
      });

      const results = matches.map(({ searchTokens: _, ...rest }) => rest);

      logger.debug('Partial match search completed', {
        organizationId,
        fieldName,
        entityType,
        searchValue,
        resultCount: results.length,
      });

      return results;
    } catch (error) {
      logger.error('Failed to query by partial match', {
        error,
        organizationId,
        fieldName,
        entityType,
      });
      throw error;
    }
  }

  /**
   * Combined search using exact or partial match
   */
  async search(query: SearchIndexQuery): Promise<SearchIndexResult[]> {
    try {
      if (query.exactMatch) {
        return await this.queryByExactMatch(
          query.organizationId,
          query.fieldName || '',
          query.exactMatch,
          query.entityType
        );
      }

      if (query.partialMatch) {
        return await this.queryByPartialMatch(
          query.organizationId,
          query.fieldName || '',
          query.partialMatch,
          query.entityType
        );
      }

      // Return all indexes for organization if no search criteria
      const now = new Date();
      const results = await prisma.searchIndex.findMany({
        where: {
          organizationId: query.organizationId,
          ...(query.entityType ? { entityType: query.entityType } : {}),
          ...(query.fieldName ? { fieldName: query.fieldName } : {}),
          ...(query.includeExpired ? {} : {
            OR: [
              { expiresAt: null },
              { expiresAt: { gt: now } },
            ],
          }),
        },
        select: {
          entityId: true,
          entityType: true,
          fieldName: true,
          createdAt: true,
          expiresAt: true,
        },
      });

      return results;
    } catch (error) {
      logger.error('Failed to execute search', {
        error,
        query,
      });
      throw error;
    }
  }

  /**
   * Delete search index for a specific entity field
   */
  async deleteSearchIndex(
    organizationId: string,
    entityType: string,
    entityId: string,
    fieldName: string
  ): Promise<boolean> {
    try {
      const result = await prisma.searchIndex.deleteMany({
        where: {
          organizationId,
          entityType,
          entityId,
          fieldName,
        },
      });

      logger.info('Deleted search index', {
        organizationId,
        entityType,
        entityId,
        fieldName,
        count: result.count,
      });

      return result.count > 0;
    } catch (error) {
      logger.error('Failed to delete search index', {
        error,
        organizationId,
        entityType,
        entityId,
        fieldName,
      });
      throw error;
    }
  }

  /**
   * Delete all search indexes for an entity
   */
  async deleteEntityIndexes(
    organizationId: string,
    entityType: string,
    entityId: string
  ): Promise<number> {
    try {
      const result = await prisma.searchIndex.deleteMany({
        where: {
          organizationId,
          entityType,
          entityId,
        },
      });

      logger.info('Deleted all search indexes for entity', {
        organizationId,
        entityType,
        entityId,
        count: result.count,
      });

      return result.count;
    } catch (error) {
      logger.error('Failed to delete entity indexes', {
        error,
        organizationId,
        entityType,
        entityId,
      });
      throw error;
    }
  }

  /**
   * Purge expired search indexes (GDPR compliance)
   * Should be run via cron job daily
   */
  async purgeExpiredIndexes(): Promise<number> {
    try {
      const now = new Date();
      const result = await prisma.searchIndex.deleteMany({
        where: {
          expiresAt: {
            lte: now,
          },
        },
      });

      logger.info('Purged expired search indexes', {
        count: result.count,
        timestamp: now.toISOString(),
      });

      return result.count;
    } catch (error) {
      logger.error('Failed to purge expired indexes', { error });
      throw error;
    }
  }

  /**
   * Rotate search indexes after key rotation
   * Re-encrypts all search indexes for an organization with new key version
   */
  async rotateSearchIndexes(
    organizationId: string,
    newKeyVersion: number
  ): Promise<number> {
    try {
      // Get all entities with search indexes
      const indexes = await prisma.searchIndex.findMany({
        where: { organizationId },
        select: {
          entityType: true,
          entityId: true,
          fieldName: true,
          keyVersion: true,
        },
      });

      logger.info('Starting search index rotation', {
        organizationId,
        indexCount: indexes.length,
        newKeyVersion,
      });

      let rotatedCount = 0;

      // Group by entity to minimize database queries
      const entities = new Map<string, Set<string>>();
      for (const index of indexes) {
        const key = `${index.entityType}:${index.entityId}`;
        if (!entities.has(key)) {
          entities.set(key, new Set());
        }
        entities.get(key)?.add(index.fieldName);
      }

      // Note: This is a placeholder - actual implementation would need to:
      // 1. Fetch encrypted data from source entities
      // 2. Decrypt with old key
      // 3. Re-encrypt with new key
      // 4. Update search indexes
      // This requires integration with field-encryption.service

      logger.warn('Search index rotation requires manual implementation', {
        organizationId,
        newKeyVersion,
        entityCount: entities.size,
      });

      return rotatedCount;
    } catch (error) {
      logger.error('Failed to rotate search indexes', {
        error,
        organizationId,
        newKeyVersion,
      });
      throw error;
    }
  }

  /**
   * Get search index statistics for an organization
   */
  async getIndexStats(organizationId: string): Promise<{
    totalIndexes: number;
    expiredIndexes: number;
    indexesByType: Record<string, number>;
    indexesByField: Record<string, number>;
  }> {
    try {
      const now = new Date();

      const [total, expired, byType, byField] = await Promise.all([
        prisma.searchIndex.count({
          where: { organizationId },
        }),
        prisma.searchIndex.count({
          where: {
            organizationId,
            expiresAt: { lte: now },
          },
        }),
        prisma.searchIndex.groupBy({
          by: ['entityType'],
          where: { organizationId },
          _count: true,
        }),
        prisma.searchIndex.groupBy({
          by: ['fieldName'],
          where: { organizationId },
          _count: true,
        }),
      ]);

      const indexesByType = byType.reduce((acc, item) => {
        acc[item.entityType] = item._count;
        return acc;
      }, {} as Record<string, number>);

      const indexesByField = byField.reduce((acc, item) => {
        acc[item.fieldName] = item._count;
        return acc;
      }, {} as Record<string, number>);

      return {
        totalIndexes: total,
        expiredIndexes: expired,
        indexesByType,
        indexesByField,
      };
    } catch (error) {
      logger.error('Failed to get index stats', {
        error,
        organizationId,
      });
      throw error;
    }
  }
}

export const searchableEncryptionDbService = new SearchableEncryptionDbService();
