/**
 * Encryption Utilities - Field-level encryption for sensitive data
 */

import * as crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import winston from 'winston';

export interface EncryptionConfig {
  algorithm: string;
  keyLength: number;
  ivLength: number;
  tagLength?: number;
  encoding: BufferEncoding;
}

export interface EncryptedField {
  data: string;
  iv: string;
  tag?: string;
  algorithm: string;
}

export class EncryptionUtils {
  private config: EncryptionConfig;
  private masterKey: string;
  private logger: winston.Logger;

  constructor(masterKey: string, config?: Partial<EncryptionConfig>) {
    this.masterKey = masterKey;
    this.config = {
      algorithm: 'aes-256-gcm',
      keyLength: 32,
      ivLength: 16,
      tagLength: 16,
      encoding: 'hex',
      ...config,
    };

    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          ),
        }),
      ],
    });

    // Validate master key length
    if (Buffer.from(this.masterKey, 'utf8').length < this.config.keyLength) {
      throw new Error(`Master key must be at least ${this.config.keyLength} bytes`);
    }
  }

  /**
   * Derive encryption key from master key and organization ID
   */
  private deriveKey(organizationId: string): Buffer {
    const salt = Buffer.from(organizationId, 'utf8');
    return crypto.pbkdf2Sync(this.masterKey, salt, 10000, this.config.keyLength, 'sha256');
  }

  /**
   * Encrypt sensitive field data
   */
  encrypt(data: string, organizationId: string): string {
    try {
      if (!data || data.length === 0) {
        return data;
      }

      const key = this.deriveKey(organizationId);
      const iv = crypto.randomBytes(this.config.ivLength);
      const cipher = crypto.createCipher(this.config.algorithm, key);

      if (this.config.algorithm.includes('gcm')) {
        // For GCM mode
        const gcmCipher = cipher as crypto.CipherGCM;
        gcmCipher.setAAD(Buffer.from(organizationId));
      }

      let encrypted = cipher.update(data, 'utf8', this.config.encoding);
      encrypted += cipher.final(this.config.encoding);

      const result: EncryptedField = {
        data: encrypted,
        iv: iv.toString(this.config.encoding),
        algorithm: this.config.algorithm,
      };

      if (this.config.algorithm.includes('gcm')) {
        const gcmCipher = cipher as crypto.CipherGCM;
        result.tag = gcmCipher.getAuthTag().toString(this.config.encoding);
      }

      return JSON.stringify(result);
    } catch (error) {
      this.logger.error('Encryption failed:', error);
      throw new Error(`Encryption failed: ${error}`);
    }
  }

  /**
   * Decrypt sensitive field data
   */
  decrypt(encryptedData: string, organizationId: string): string {
    try {
      if (!encryptedData || encryptedData.length === 0) {
        return encryptedData;
      }

      // Check if data is already encrypted (JSON format)
      let encryptedField: EncryptedField;
      try {
        encryptedField = JSON.parse(encryptedData);
      } catch {
        // Data might not be encrypted yet, return as-is
        return encryptedData;
      }

      const key = this.deriveKey(organizationId);
      const iv = Buffer.from(encryptedField.iv, this.config.encoding);
      const decipher = crypto.createDecipher(encryptedField.algorithm, key);

      if (encryptedField.algorithm.includes('gcm')) {
        // For GCM mode
        const gcmDecipher = decipher as crypto.DecipherGCM;
        gcmDecipher.setAAD(Buffer.from(organizationId));

        if (encryptedField.tag) {
          gcmDecipher.setAuthTag(Buffer.from(encryptedField.tag, this.config.encoding));
        }
      }

      let decrypted = decipher.update(encryptedField.data, this.config.encoding, 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      this.logger.error('Decryption failed:', error);
      throw new Error(`Decryption failed: ${error}`);
    }
  }

  /**
   * Migrate existing unencrypted data to encrypted format
   */
  async migrateFieldToEncrypted(
    prisma: PrismaClient,
    tableName: string,
    fieldName: string,
    organizationIdField: string = 'organizationId'
  ): Promise<void> {
    try {
      this.logger.info(`Starting encryption migration for ${tableName}.${fieldName}`);

      // Get all records with unencrypted data
      const records = await prisma.$queryRawUnsafe(`
        SELECT id, ${fieldName}, ${organizationIdField}
        FROM ${tableName}
        WHERE ${fieldName} IS NOT NULL
        AND ${fieldName} NOT LIKE '{"data"%'
      `);

      let migrated = 0;
      const batchSize = 100;

      for (let i = 0; i < (records as any[]).length; i += batchSize) {
        const batch = (records as any[]).slice(i, i + batchSize);

        await prisma.$transaction(async (tx) => {
          for (const record of batch) {
            const encryptedValue = this.encrypt(
              record[fieldName],
              record[organizationIdField]
            );

            await tx.$executeRawUnsafe(`
              UPDATE ${tableName}
              SET ${fieldName} = $1
              WHERE id = $2
            `, encryptedValue, record.id);

            migrated++;
          }
        });

        this.logger.info(`Encrypted ${migrated}/${(records as any[]).length} records`);
      }

      this.logger.info(`Encryption migration completed for ${tableName}.${fieldName}`);
    } catch (error) {
      this.logger.error(`Encryption migration failed for ${tableName}.${fieldName}:`, error);
      throw new Error(`Encryption migration failed: ${error}`);
    }
  }

  /**
   * Rotate encryption keys (re-encrypt with new key)
   */
  async rotateEncryptionKey(
    prisma: PrismaClient,
    newMasterKey: string,
    tableName: string,
    fieldName: string,
    organizationIdField: string = 'organizationId'
  ): Promise<void> {
    try {
      this.logger.info(`Starting key rotation for ${tableName}.${fieldName}`);

      // Create new encryption utils with new key
      const newEncryption = new EncryptionUtils(newMasterKey, this.config);

      // Get all encrypted records
      const records = await prisma.$queryRawUnsafe(`
        SELECT id, ${fieldName}, ${organizationIdField}
        FROM ${tableName}
        WHERE ${fieldName} IS NOT NULL
        AND ${fieldName} LIKE '{"data"%'
      `);

      let rotated = 0;
      const batchSize = 50; // Smaller batch size for key rotation

      for (let i = 0; i < (records as any[]).length; i += batchSize) {
        const batch = (records as any[]).slice(i, i + batchSize);

        await prisma.$transaction(async (tx) => {
          for (const record of batch) {
            // Decrypt with old key
            const decryptedValue = this.decrypt(
              record[fieldName],
              record[organizationIdField]
            );

            // Encrypt with new key
            const reencryptedValue = newEncryption.encrypt(
              decryptedValue,
              record[organizationIdField]
            );

            await tx.$executeRawUnsafe(`
              UPDATE ${tableName}
              SET ${fieldName} = $1
              WHERE id = $2
            `, reencryptedValue, record.id);

            rotated++;
          }
        });

        this.logger.info(`Re-encrypted ${rotated}/${(records as any[]).length} records`);
      }

      this.logger.info(`Key rotation completed for ${tableName}.${fieldName}`);
    } catch (error) {
      this.logger.error(`Key rotation failed for ${tableName}.${fieldName}:`, error);
      throw new Error(`Key rotation failed: ${error}`);
    }
  }

  /**
   * Validate encrypted data integrity
   */
  async validateEncryptedData(
    prisma: PrismaClient,
    tableName: string,
    fieldName: string,
    organizationIdField: string = 'organizationId'
  ): Promise<{ valid: number; invalid: number; errors: string[] }> {
    try {
      this.logger.info(`Validating encrypted data for ${tableName}.${fieldName}`);

      const records = await prisma.$queryRawUnsafe(`
        SELECT id, ${fieldName}, ${organizationIdField}
        FROM ${tableName}
        WHERE ${fieldName} IS NOT NULL
        AND ${fieldName} LIKE '{"data"%'
      `);

      let valid = 0;
      let invalid = 0;
      const errors: string[] = [];

      for (const record of records as any[]) {
        try {
          // Try to decrypt the data
          this.decrypt(record[fieldName], record[organizationIdField]);
          valid++;
        } catch (error) {
          invalid++;
          errors.push(`Record ${record.id}: ${error}`);
        }
      }

      this.logger.info(`Validation completed: ${valid} valid, ${invalid} invalid`);
      return { valid, invalid, errors };
    } catch (error) {
      this.logger.error(`Validation failed for ${tableName}.${fieldName}:`, error);
      throw new Error(`Validation failed: ${error}`);
    }
  }

  /**
   * Create anonymized copy of encrypted data for development/testing
   */
  async anonymizeEncryptedData(
    prisma: PrismaClient,
    tableName: string,
    fieldMappings: Record<string, (original: string) => string>,
    organizationIdField: string = 'organizationId'
  ): Promise<void> {
    try {
      this.logger.info(`Anonymizing data for ${tableName}`);

      const records = await prisma.$queryRawUnsafe(`
        SELECT id, ${Object.keys(fieldMappings).join(', ')}, ${organizationIdField}
        FROM ${tableName}
        WHERE ${organizationIdField} IS NOT NULL
      `);

      let anonymized = 0;
      const batchSize = 100;

      for (let i = 0; i < (records as any[]).length; i += batchSize) {
        const batch = (records as any[]).slice(i, i + batchSize);

        await prisma.$transaction(async (tx) => {
          for (const record of batch) {
            const updates: string[] = [];
            const values: any[] = [];
            let paramIndex = 1;

            for (const [fieldName, anonymizer] of Object.entries(fieldMappings)) {
              if (record[fieldName]) {
                try {
                  // Decrypt original value
                  const originalValue = this.decrypt(
                    record[fieldName],
                    record[organizationIdField]
                  );

                  // Apply anonymization
                  const anonymizedValue = anonymizer(originalValue);

                  // Re-encrypt
                  const encryptedValue = this.encrypt(
                    anonymizedValue,
                    record[organizationIdField]
                  );

                  updates.push(`${fieldName} = $${paramIndex++}`);
                  values.push(encryptedValue);
                } catch (error) {
                  // Skip if decryption fails (might not be encrypted)
                  this.logger.warn(`Skipping field ${fieldName} for record ${record.id}: ${error}`);
                }
              }
            }

            if (updates.length > 0) {
              values.push(record.id);
              await tx.$executeRawUnsafe(`
                UPDATE ${tableName}
                SET ${updates.join(', ')}
                WHERE id = $${paramIndex}
              `, ...values);
            }

            anonymized++;
          }
        });

        this.logger.info(`Anonymized ${anonymized}/${(records as any[]).length} records`);
      }

      this.logger.info(`Anonymization completed for ${tableName}`);
    } catch (error) {
      this.logger.error(`Anonymization failed for ${tableName}:`, error);
      throw new Error(`Anonymization failed: ${error}`);
    }
  }
}

export default EncryptionUtils;