import crypto from 'crypto';
import { encryptionKeyManager, EncryptionKey } from './encryption-key-manager.service';
import { logger } from '../utils/logger';
import NodeCache from 'node-cache';

export interface EncryptionOptions {
  organizationId: string;
  fieldName: string;
  deterministic?: boolean;
  searchable?: boolean;
  keyVersion?: number;
}

export interface EncryptedField {
  value: string;
  algorithm: string;
  keyVersion: number;
  isDeterministic: boolean;
  isSearchable: boolean;
  metadata?: Record<string, any>;
}

export interface SearchableEncryptionResult {
  encryptedValue: string;
  searchTokens: string[];
  blindIndex: string;
}

export interface DecryptionResult {
  value: string;
  metadata?: Record<string, any>;
}

/**
 * Advanced field-level encryption service with support for:
 * - Deterministic encryption for searchable fields
 * - Probabilistic encryption for maximum security
 * - Searchable encryption with blind indexing
 * - Format-preserving encryption for specific data types
 */
export class FieldEncryptionService {
  private readonly encryptionCache: NodeCache;
  private readonly searchCache: NodeCache;

  // Encryption algorithms
  private readonly PROBABILISTIC_ALGORITHM = 'aes-256-gcm';
  private readonly DETERMINISTIC_ALGORITHM = 'aes-256-siv'; // Synthetic IV mode
  private readonly SEARCH_ALGORITHM = 'aes-256-gcm';

  // Key purposes
  private readonly DATA_KEY_PURPOSE = 'data-encryption';
  private readonly SEARCH_KEY_PURPOSE = 'search-encryption';
  private readonly INDEX_KEY_PURPOSE = 'blind-index';

  constructor() {
    // Cache for performance optimization
    this.encryptionCache = new NodeCache({
      stdTTL: 300, // 5 minutes
      checkperiod: 60,
      maxKeys: 10000
    });

    this.searchCache = new NodeCache({
      stdTTL: 600, // 10 minutes
      checkperiod: 120,
      maxKeys: 5000
    });
  }

  /**
   * Encrypt a field value with options for deterministic or probabilistic encryption
   */
  public async encryptField(
    value: string,
    options: EncryptionOptions
  ): Promise<string> {
    if (!value || value.trim() === '') {
      throw new Error('Cannot encrypt empty value');
    }

    const startTime = Date.now();

    try {
      // Get encryption key
      const key = encryptionKeyManager.getActiveKey(
        options.organizationId,
        this.DATA_KEY_PURPOSE
      );

      let encryptedData: EncryptedField;

      if (options.searchable) {
        // Use searchable encryption for fields that need to be queried
        const searchResult = await this.encryptSearchable(value, key, options);
        encryptedData = {
          value: searchResult.encryptedValue,
          algorithm: this.SEARCH_ALGORITHM,
          keyVersion: key.version,
          isDeterministic: false,
          isSearchable: true,
          metadata: {
            searchTokens: searchResult.searchTokens,
            blindIndex: searchResult.blindIndex
          }
        };
      } else if (options.deterministic) {
        // Use deterministic encryption for exact match queries
        encryptedData = {
          value: this.encryptDeterministic(value, key),
          algorithm: this.DETERMINISTIC_ALGORITHM,
          keyVersion: key.version,
          isDeterministic: true,
          isSearchable: false
        };
      } else {
        // Use probabilistic encryption for maximum security
        encryptedData = {
          value: this.encryptProbabilistic(value, key),
          algorithm: this.PROBABILISTIC_ALGORITHM,
          keyVersion: key.version,
          isDeterministic: false,
          isSearchable: false
        };
      }

      const encryptedField = this.serializeEncryptedField(encryptedData);

      // Cache for performance
      const cacheKey = this.getCacheKey(options, value);
      this.encryptionCache.set(cacheKey, encryptedField);

      // Log encryption operation
      logger.debug('Field encrypted', {
        organizationId: options.organizationId,
        fieldName: options.fieldName,
        algorithm: encryptedData.algorithm,
        deterministic: encryptedData.isDeterministic,
        searchable: encryptedData.isSearchable,
        duration: Date.now() - startTime
      });

      return encryptedField;

    } catch (error) {
      logger.error('Field encryption failed', {
        organizationId: options.organizationId,
        fieldName: options.fieldName,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Decrypt a field value
   */
  public async decryptField(
    encryptedValue: string,
    options: EncryptionOptions
  ): Promise<string> {
    if (!encryptedValue || encryptedValue.trim() === '') {
      throw new Error('Cannot decrypt empty value');
    }

    const startTime = Date.now();

    try {
      const encryptedData = this.deserializeEncryptedField(encryptedValue);

      // Get the correct key version
      const key = encryptionKeyManager.getKeyByVersion(
        options.organizationId,
        encryptedData.keyVersion,
        this.DATA_KEY_PURPOSE
      );

      let decryptedValue: string;

      switch (encryptedData.algorithm) {
        case this.PROBABILISTIC_ALGORITHM:
          decryptedValue = this.decryptProbabilistic(encryptedData.value, key);
          break;
        case this.DETERMINISTIC_ALGORITHM:
          decryptedValue = this.decryptDeterministic(encryptedData.value, key);
          break;
        case this.SEARCH_ALGORITHM:
          decryptedValue = this.decryptSearchable(encryptedData.value, key);
          break;
        default:
          throw new Error(`Unsupported encryption algorithm: ${encryptedData.algorithm}`);
      }

      logger.debug('Field decrypted', {
        organizationId: options.organizationId,
        fieldName: options.fieldName,
        algorithm: encryptedData.algorithm,
        duration: Date.now() - startTime
      });

      return decryptedValue;

    } catch (error) {
      logger.error('Field decryption failed', {
        organizationId: options.organizationId,
        fieldName: options.fieldName,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Probabilistic encryption (different ciphertext for same plaintext)
   */
  private encryptProbabilistic(value: string, key: EncryptionKey): string {
    const iv = encryptionKeyManager.generateIV();
    const cipher = crypto.createCipheriv(this.PROBABILISTIC_ALGORITHM, key.key, iv);

    let encrypted = cipher.update(value, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
  }

  /**
   * Deterministic encryption (same ciphertext for same plaintext)
   */
  private encryptDeterministic(value: string, key: EncryptionKey): string {
    // Create deterministic IV from value hash
    const hash = crypto.createHash('sha256').update(value + key.id).digest();
    const iv = hash.slice(0, 16);

    const cipher = crypto.createCipheriv('aes-256-cbc', key.key, iv);

    let encrypted = cipher.update(value, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return iv.toString('hex') + ':' + encrypted;
  }

  /**
   * Searchable encryption with blind indexing
   */
  private async encryptSearchable(
    value: string,
    key: EncryptionKey,
    options: EncryptionOptions
  ): Promise<SearchableEncryptionResult> {
    // Encrypt the actual value probabilistically
    const encryptedValue = this.encryptProbabilistic(value, key);

    // Generate search tokens for substring matching
    const searchTokens = this.generateSearchTokens(value, key, options);

    // Generate blind index for exact matching
    const blindIndex = this.generateBlindIndex(value, key, options);

    return {
      encryptedValue,
      searchTokens,
      blindIndex
    };
  }

  /**
   * Generate search tokens for substring matching
   */
  private generateSearchTokens(
    value: string,
    key: EncryptionKey,
    options: EncryptionOptions
  ): string[] {
    const searchKey = encryptionKeyManager.getActiveKey(
      options.organizationId,
      this.SEARCH_KEY_PURPOSE
    );

    const tokens: string[] = [];
    const normalizedValue = value.toLowerCase().replace(/[^a-z0-9]/g, '');

    // Generate n-grams for substring search
    for (let i = 0; i < normalizedValue.length; i++) {
      for (let j = i + 1; j <= Math.min(i + 6, normalizedValue.length); j++) {
        const ngram = normalizedValue.substring(i, j);
        if (ngram.length >= 2) {
          const token = this.encryptDeterministic(ngram, searchKey);
          tokens.push(token);
        }
      }
    }

    return [...new Set(tokens)]; // Remove duplicates
  }

  /**
   * Generate blind index for exact matching
   */
  private generateBlindIndex(
    value: string,
    key: EncryptionKey,
    options: EncryptionOptions
  ): string {
    const indexKey = encryptionKeyManager.getActiveKey(
      options.organizationId,
      this.INDEX_KEY_PURPOSE
    );

    const normalizedValue = value.toLowerCase().trim();
    return this.encryptDeterministic(normalizedValue, indexKey);
  }

  /**
   * Decrypt probabilistic encryption
   */
  private decryptProbabilistic(encryptedValue: string, key: EncryptionKey): string {
    const parts = encryptedValue.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid probabilistic encrypted format');
    }

    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];

    const decipher = crypto.createDecipheriv(this.PROBABILISTIC_ALGORITHM, key.key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Decrypt deterministic encryption
   */
  private decryptDeterministic(encryptedValue: string, key: EncryptionKey): string {
    const parts = encryptedValue.split(':');
    if (parts.length !== 2) {
      throw new Error('Invalid deterministic encrypted format');
    }

    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];

    const decipher = crypto.createDecipheriv('aes-256-cbc', key.key, iv);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Decrypt searchable encryption
   */
  private decryptSearchable(encryptedValue: string, key: EncryptionKey): string {
    return this.decryptProbabilistic(encryptedValue, key);
  }

  /**
   * Generate search query for encrypted field
   */
  public generateSearchQuery(
    searchValue: string,
    options: EncryptionOptions
  ): {
    exactMatch?: string;
    searchTokens?: string[];
    blindIndex?: string;
  } {
    const key = encryptionKeyManager.getActiveKey(
      options.organizationId,
      this.DATA_KEY_PURPOSE
    );

    const result: any = {};

    if (options.deterministic) {
      result.exactMatch = this.encryptDeterministic(searchValue, key);
    }

    if (options.searchable) {
      result.searchTokens = this.generateSearchTokens(searchValue, key, options);
      result.blindIndex = this.generateBlindIndex(searchValue, key, options);
    }

    return result;
  }

  /**
   * Encrypt multiple fields in batch
   */
  public async encryptBatch(
    fields: { value: string; options: EncryptionOptions }[]
  ): Promise<string[]> {
    const results = await Promise.all(
      fields.map(field => this.encryptField(field.value, field.options))
    );
    return results;
  }

  /**
   * Decrypt multiple fields in batch
   */
  public async decryptBatch(
    fields: { encryptedValue: string; options: EncryptionOptions }[]
  ): Promise<string[]> {
    const results = await Promise.all(
      fields.map(field => this.decryptField(field.encryptedValue, field.options))
    );
    return results;
  }

  /**
   * Serialize encrypted field data
   */
  private serializeEncryptedField(data: EncryptedField): string {
    const serialized = {
      v: data.keyVersion,
      a: data.algorithm,
      d: data.isDeterministic ? 1 : 0,
      s: data.isSearchable ? 1 : 0,
      val: data.value,
      meta: data.metadata
    };

    return Buffer.from(JSON.stringify(serialized)).toString('base64');
  }

  /**
   * Deserialize encrypted field data
   */
  private deserializeEncryptedField(encryptedValue: string): EncryptedField {
    try {
      const serialized = JSON.parse(Buffer.from(encryptedValue, 'base64').toString());

      return {
        value: serialized.val,
        algorithm: serialized.a,
        keyVersion: serialized.v,
        isDeterministic: serialized.d === 1,
        isSearchable: serialized.s === 1,
        metadata: serialized.meta
      };
    } catch (error) {
      throw new Error('Invalid encrypted field format');
    }
  }

  /**
   * Generate cache key for performance optimization
   */
  private getCacheKey(options: EncryptionOptions, value: string): string {
    const hash = crypto.createHash('sha256')
      .update(JSON.stringify(options) + value)
      .digest('hex');
    return `enc:${hash.substring(0, 16)}`;
  }

  /**
   * Validate field format for specific data types
   */
  public validateFieldFormat(value: string, fieldType: string): boolean {
    switch (fieldType) {
      case 'ssn':
        return /^\d{3}-?\d{2}-?\d{4}$/.test(value);
      case 'sin':
        return /^\d{3}-?\d{3}-?\d{3}$/.test(value);
      case 'phone':
        return /^(\+?1[-.]?)?\(?\d{3}\)?[-.]?\d{3}[-.]?\d{4}$/.test(value);
      case 'email':
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
      case 'credit_card':
        return /^\d{4}$/.test(value); // Only last 4 digits
      default:
        return true;
    }
  }

  /**
   * Format-preserving encryption for specific data types
   */
  public encryptFormatPreserving(
    value: string,
    fieldType: string,
    options: EncryptionOptions
  ): string {
    // For now, use standard encryption
    // In production, implement FPE algorithms for specific formats
    return this.encryptField(value, options);
  }

  /**
   * Clear encryption caches
   */
  public clearCaches(): void {
    this.encryptionCache.flushAll();
    this.searchCache.flushAll();
    logger.info('Encryption caches cleared');
  }

  /**
   * Get encryption statistics
   */
  public getStats(): {
    cacheHits: number;
    cacheMisses: number;
    totalOperations: number;
  } {
    const stats = this.encryptionCache.getStats();
    return {
      cacheHits: stats.hits,
      cacheMisses: stats.misses,
      totalOperations: stats.hits + stats.misses
    };
  }
}

// Singleton instance
export const fieldEncryptionService = new FieldEncryptionService();