import crypto from 'crypto';
import { encryptionKeyManager } from './encryption-key-manager.service';
import { fieldEncryptionService } from './field-encryption.service';
import { logger } from '../utils/logger';
import NodeCache from 'node-cache';

export interface SearchableField {
  modelName: string;
  fieldName: string;
  organizationId: string;
  encryptedValue: string;
  searchTokens: string[];
  blindIndex: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SearchQuery {
  term: string;
  modelName: string;
  fieldName: string;
  organizationId: string;
  searchType: 'exact' | 'partial' | 'fuzzy';
  limit?: number;
  offset?: number;
}

export interface SearchResult {
  matches: {
    id: string;
    score: number;
    highlights: string[];
  }[];
  totalCount: number;
  searchTime: number;
}

export interface BloomFilterConfig {
  expectedElements: number;
  falsePositiveRate: number;
}

/**
 * Advanced searchable encryption service with support for:
 * - Blind indexing for exact matches
 * - N-gram tokenization for partial matches
 * - Bloom filters for privacy-preserving search
 * - Fuzzy matching with configurable similarity
 */
export class SearchableEncryptionService {
  private readonly searchCache: NodeCache;
  private readonly bloomFilters = new Map<string, BloomFilter>();

  // Search configuration
  private readonly MIN_NGRAM_LENGTH = 2;
  private readonly MAX_NGRAM_LENGTH = 6;
  private readonly DEFAULT_SEARCH_LIMIT = 100;
  private readonly CACHE_TTL = 300; // 5 minutes

  constructor() {
    this.searchCache = new NodeCache({
      stdTTL: this.CACHE_TTL,
      checkperiod: 60,
      maxKeys: 5000
    });
  }

  /**
   * Index a field for searchable encryption
   */
  public async indexField(
    modelName: string,
    fieldName: string,
    organizationId: string,
    value: string,
    recordId: string
  ): Promise<void> {
    if (!value || value.trim() === '') {
      return;
    }

    const startTime = Date.now();

    try {
      // Generate search tokens
      const searchTokens = await this.generateSearchTokens(value, organizationId, fieldName);

      // Generate blind index
      const blindIndex = await this.generateBlindIndex(value, organizationId, fieldName);

      // In production, store in dedicated search index table
      await this.storeSearchIndex({
        modelName,
        fieldName,
        organizationId,
        recordId,
        value,
        searchTokens,
        blindIndex
      });

      // Update bloom filter for privacy-preserving search
      this.updateBloomFilter(organizationId, fieldName, searchTokens);

      logger.debug('Field indexed for search', {
        modelName,
        fieldName,
        organizationId,
        recordId,
        tokenCount: searchTokens.length,
        duration: Date.now() - startTime
      });

    } catch (error) {
      logger.error('Failed to index field for search', {
        modelName,
        fieldName,
        organizationId,
        recordId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Search encrypted fields
   */
  public async searchEncryptedField(query: SearchQuery): Promise<SearchResult> {
    const startTime = Date.now();

    try {
      // Check cache first
      const cacheKey = this.generateCacheKey(query);
      const cachedResult = this.searchCache.get<SearchResult>(cacheKey);
      if (cachedResult) {
        logger.debug('Search result retrieved from cache', { query: query.term });
        return cachedResult;
      }

      let results: SearchResult;

      switch (query.searchType) {
        case 'exact':
          results = await this.exactSearch(query);
          break;
        case 'partial':
          results = await this.partialSearch(query);
          break;
        case 'fuzzy':
          results = await this.fuzzySearch(query);
          break;
        default:
          results = await this.partialSearch(query);
      }

      results.searchTime = Date.now() - startTime;

      // Cache results
      this.searchCache.set(cacheKey, results);

      logger.debug('Search completed', {
        query: query.term,
        searchType: query.searchType,
        matches: results.matches.length,
        duration: results.searchTime
      });

      return results;

    } catch (error) {
      logger.error('Search failed', {
        query: query.term,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Exact search using blind index
   */
  private async exactSearch(query: SearchQuery): Promise<SearchResult> {
    const blindIndex = await this.generateBlindIndex(
      query.term,
      query.organizationId,
      query.fieldName
    );

    // In production, query the search index table
    const matches = await this.queryBlindIndex(
      query.modelName,
      query.fieldName,
      query.organizationId,
      blindIndex,
      query.limit,
      query.offset
    );

    return {
      matches: matches.map(match => ({
        id: match.recordId,
        score: 1.0, // Exact match
        highlights: [query.term]
      })),
      totalCount: matches.length,
      searchTime: 0 // Will be set by caller
    };
  }

  /**
   * Partial search using n-gram tokens
   */
  private async partialSearch(query: SearchQuery): Promise<SearchResult> {
    const searchTokens = await this.generateSearchTokens(
      query.term,
      query.organizationId,
      query.fieldName
    );

    if (searchTokens.length === 0) {
      return { matches: [], totalCount: 0, searchTime: 0 };
    }

    // In production, query the search index table with token matching
    const matches = await this.queryTokenIndex(
      query.modelName,
      query.fieldName,
      query.organizationId,
      searchTokens,
      query.limit,
      query.offset
    );

    return {
      matches: matches.map(match => ({
        id: match.recordId,
        score: this.calculateMatchScore(searchTokens, match.matchedTokens),
        highlights: this.generateHighlights(query.term, match.originalTokens)
      })),
      totalCount: matches.length,
      searchTime: 0 // Will be set by caller
    };
  }

  /**
   * Fuzzy search with similarity scoring
   */
  private async fuzzySearch(query: SearchQuery): Promise<SearchResult> {
    // For fuzzy search, we need to decrypt and compare
    // This is less secure but provides better search experience
    const partialResults = await this.partialSearch({
      ...query,
      searchType: 'partial'
    });

    // Apply fuzzy matching on decrypted values
    const fuzzyMatches = await this.applyFuzzyMatching(
      query.term,
      partialResults.matches,
      query.organizationId
    );

    return {
      matches: fuzzyMatches,
      totalCount: fuzzyMatches.length,
      searchTime: 0 // Will be set by caller
    };
  }

  /**
   * Generate search tokens using n-grams
   */
  private async generateSearchTokens(
    value: string,
    organizationId: string,
    fieldName: string
  ): Promise<string[]> {
    const searchKey = encryptionKeyManager.getActiveKey(
      organizationId,
      'search-encryption'
    );

    const tokens: string[] = [];
    const normalizedValue = this.normalizeValue(value);

    // Generate n-grams
    for (let i = 0; i < normalizedValue.length; i++) {
      for (let j = i + this.MIN_NGRAM_LENGTH; j <= Math.min(i + this.MAX_NGRAM_LENGTH, normalizedValue.length); j++) {
        const ngram = normalizedValue.substring(i, j);
        if (ngram.length >= this.MIN_NGRAM_LENGTH) {
          const encryptedToken = this.encryptToken(ngram, searchKey.key);
          tokens.push(encryptedToken);
        }
      }
    }

    return [...new Set(tokens)]; // Remove duplicates
  }

  /**
   * Generate blind index for exact matching
   */
  private async generateBlindIndex(
    value: string,
    organizationId: string,
    fieldName: string
  ): Promise<string> {
    const indexKey = encryptionKeyManager.getActiveKey(
      organizationId,
      'blind-index'
    );

    const normalizedValue = this.normalizeValue(value);
    return this.encryptToken(normalizedValue, indexKey.key);
  }

  /**
   * Normalize value for consistent indexing
   */
  private normalizeValue(value: string): string {
    return value
      .toLowerCase()
      .trim()
      .replace(/[^\w\s]/g, '') // Remove special characters
      .replace(/\s+/g, ' '); // Normalize whitespace
  }

  /**
   * Encrypt a search token
   */
  private encryptToken(token: string, key: Buffer): string {
    // Use deterministic encryption for search tokens
    const hash = crypto.createHash('sha256').update(token + key.toString('hex')).digest();
    const iv = hash.slice(0, 16);

    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(token, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return iv.toString('hex') + ':' + encrypted;
  }

  /**
   * Store search index (placeholder for database operations)
   */
  private async storeSearchIndex(indexData: {
    modelName: string;
    fieldName: string;
    organizationId: string;
    recordId: string;
    value: string;
    searchTokens: string[];
    blindIndex: string;
  }): Promise<void> {
    // In production, store in dedicated search index table:
    //
    // CREATE TABLE search_index (
    //   id VARCHAR(255) PRIMARY KEY,
    //   organization_id VARCHAR(255) NOT NULL,
    //   model_name VARCHAR(100) NOT NULL,
    //   field_name VARCHAR(100) NOT NULL,
    //   record_id VARCHAR(255) NOT NULL,
    //   blind_index VARCHAR(500) NOT NULL,
    //   search_tokens JSON NOT NULL,
    //   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    //   updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    //   INDEX idx_blind_index (organization_id, model_name, field_name, blind_index),
    //   INDEX idx_search_tokens (organization_id, model_name, field_name)
    // );

    logger.debug('Search index stored (placeholder)', {
      modelName: indexData.modelName,
      fieldName: indexData.fieldName,
      organizationId: indexData.organizationId,
      recordId: indexData.recordId,
      tokenCount: indexData.searchTokens.length
    });
  }

  /**
   * Query blind index for exact matches (placeholder)
   */
  private async queryBlindIndex(
    modelName: string,
    fieldName: string,
    organizationId: string,
    blindIndex: string,
    limit?: number,
    offset?: number
  ): Promise<Array<{ recordId: string }>> {
    // In production, query the search index table:
    // SELECT record_id FROM search_index
    // WHERE organization_id = ? AND model_name = ? AND field_name = ? AND blind_index = ?
    // LIMIT ? OFFSET ?

    return []; // Placeholder
  }

  /**
   * Query token index for partial matches (placeholder)
   */
  private async queryTokenIndex(
    modelName: string,
    fieldName: string,
    organizationId: string,
    searchTokens: string[],
    limit?: number,
    offset?: number
  ): Promise<Array<{
    recordId: string;
    matchedTokens: string[];
    originalTokens: string[];
  }>> {
    // In production, query the search index table with JSON search:
    // SELECT record_id, search_tokens FROM search_index
    // WHERE organization_id = ? AND model_name = ? AND field_name = ?
    // AND JSON_OVERLAPS(search_tokens, ?)
    // LIMIT ? OFFSET ?

    return []; // Placeholder
  }

  /**
   * Calculate match score based on token overlap
   */
  private calculateMatchScore(searchTokens: string[], matchedTokens: string[]): number {
    if (searchTokens.length === 0) return 0;
    return matchedTokens.length / searchTokens.length;
  }

  /**
   * Generate highlights for matched terms
   */
  private generateHighlights(searchTerm: string, originalTokens: string[]): string[] {
    // Simplified highlighting - in production, implement proper highlighting
    return [searchTerm];
  }

  /**
   * Apply fuzzy matching with Levenshtein distance
   */
  private async applyFuzzyMatching(
    searchTerm: string,
    matches: Array<{ id: string; score: number; highlights: string[] }>,
    organizationId: string
  ): Promise<Array<{ id: string; score: number; highlights: string[] }>> {
    const fuzzyMatches: Array<{ id: string; score: number; highlights: string[] }> = [];
    const threshold = 0.6; // Minimum similarity threshold

    for (const match of matches) {
      // In production, decrypt the original value and compare
      // const originalValue = await this.decryptForFuzzyMatch(match.id, organizationId);
      // const similarity = this.calculateLevenshteinSimilarity(searchTerm, originalValue);

      // For now, use existing score
      const similarity = match.score;

      if (similarity >= threshold) {
        fuzzyMatches.push({
          ...match,
          score: similarity
        });
      }
    }

    return fuzzyMatches.sort((a, b) => b.score - a.score);
  }

  /**
   * Calculate Levenshtein similarity
   */
  private calculateLevenshteinSimilarity(str1: string, str2: string): number {
    const distance = this.levenshteinDistance(str1.toLowerCase(), str2.toLowerCase());
    const maxLength = Math.max(str1.length, str2.length);
    return maxLength === 0 ? 1 : 1 - (distance / maxLength);
  }

  /**
   * Calculate Levenshtein distance
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) {
      matrix[0][i] = i;
    }

    for (let j = 0; j <= str2.length; j++) {
      matrix[j][0] = j;
    }

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,     // Deletion
          matrix[j - 1][i] + 1,     // Insertion
          matrix[j - 1][i - 1] + indicator  // Substitution
        );
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Update bloom filter for privacy-preserving search
   */
  private updateBloomFilter(
    organizationId: string,
    fieldName: string,
    tokens: string[]
  ): void {
    const filterKey = `${organizationId}:${fieldName}`;
    let filter = this.bloomFilters.get(filterKey);

    if (!filter) {
      filter = new BloomFilter(10000, 0.01); // 10k elements, 1% false positive rate
      this.bloomFilters.set(filterKey, filter);
    }

    for (const token of tokens) {
      filter.add(token);
    }
  }

  /**
   * Check if term might exist using bloom filter
   */
  public mightContain(
    organizationId: string,
    fieldName: string,
    searchTerm: string
  ): boolean {
    const filterKey = `${organizationId}:${fieldName}`;
    const filter = this.bloomFilters.get(filterKey);

    if (!filter) {
      return true; // Conservative approach - allow search if no filter
    }

    // Generate tokens for search term and check filter
    const normalizedTerm = this.normalizeValue(searchTerm);
    for (let i = 0; i < normalizedTerm.length - this.MIN_NGRAM_LENGTH + 1; i++) {
      const ngram = normalizedTerm.substring(i, i + this.MIN_NGRAM_LENGTH);
      if (filter.mightContain(ngram)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Generate cache key for search results
   */
  private generateCacheKey(query: SearchQuery): string {
    const hash = crypto.createHash('sha256')
      .update(JSON.stringify(query))
      .digest('hex');
    return `search:${hash.substring(0, 16)}`;
  }

  /**
   * Clear search caches
   */
  public clearCaches(): void {
    this.searchCache.flushAll();
    this.bloomFilters.clear();
    logger.info('Search caches cleared');
  }

  /**
   * Get search statistics
   */
  public getSearchStats(): {
    cacheHits: number;
    cacheMisses: number;
    bloomFilters: number;
  } {
    const stats = this.searchCache.getStats();
    return {
      cacheHits: stats.hits,
      cacheMisses: stats.misses,
      bloomFilters: this.bloomFilters.size
    };
  }
}

/**
 * Simple Bloom Filter implementation
 */
class BloomFilter {
  private readonly bitArray: boolean[];
  private readonly size: number;
  private readonly hashFunctions: number;

  constructor(expectedElements: number, falsePositiveRate: number) {
    this.size = Math.ceil(-(expectedElements * Math.log(falsePositiveRate)) / (Math.log(2) ** 2));
    this.hashFunctions = Math.ceil((this.size / expectedElements) * Math.log(2));
    this.bitArray = new Array(this.size).fill(false);
  }

  add(item: string): void {
    const hashes = this.getHashes(item);
    for (const hash of hashes) {
      this.bitArray[hash % this.size] = true;
    }
  }

  mightContain(item: string): boolean {
    const hashes = this.getHashes(item);
    return hashes.every(hash => this.bitArray[hash % this.size]);
  }

  private getHashes(item: string): number[] {
    const hashes: number[] = [];
    const hash1 = this.simpleHash(item);
    const hash2 = this.simpleHash(item + 'salt');

    for (let i = 0; i < this.hashFunctions; i++) {
      hashes.push(Math.abs(hash1 + i * hash2));
    }

    return hashes;
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }
}

// Singleton instance
export const searchableEncryptionService = new SearchableEncryptionService();