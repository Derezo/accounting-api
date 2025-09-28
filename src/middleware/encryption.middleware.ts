import { Prisma } from '@prisma/client';
import { fieldEncryptionService, EncryptionOptions } from '../services/field-encryption.service';
import { logger } from '../utils/logger';

/**
 * Configuration for field encryption
 */
export interface FieldEncryptionConfig {
  field: string;
  deterministic?: boolean;
  searchable?: boolean;
  keyVersion?: number;
  required?: boolean;
  format?: string; // ssn, sin, phone, email, credit_card, etc.
}

/**
 * Model encryption configuration
 */
export interface ModelEncryptionConfig {
  [modelName: string]: {
    organizationIdField: string; // Field containing organization ID
    encryptedFields: FieldEncryptionConfig[];
    excludeFromEncryption?: string[]; // Fields to never encrypt
  };
}

/**
 * Comprehensive encryption configuration for all models
 */
export const ENCRYPTION_CONFIG: ModelEncryptionConfig = {
  // Person model - personal information encryption
  Person: {
    organizationIdField: 'organizationId',
    encryptedFields: [
      { field: 'socialInsNumber', deterministic: true, format: 'sin' },
      { field: 'email', searchable: true, format: 'email' },
      { field: 'phone', searchable: true, format: 'phone' },
      { field: 'mobile', searchable: true, format: 'phone' }
    ]
  },

  // Business model - business information encryption
  Business: {
    organizationIdField: 'organizationId',
    encryptedFields: [
      { field: 'businessNumber', deterministic: true },
      { field: 'taxNumber', deterministic: true },
      { field: 'email', searchable: true, format: 'email' },
      { field: 'phone', searchable: true, format: 'phone' }
    ]
  },

  // User model - authentication data encryption
  User: {
    organizationIdField: 'organizationId',
    encryptedFields: [
      { field: 'phone', searchable: true, format: 'phone' },
      { field: 'twoFactorSecret', deterministic: false },
      { field: 'passwordResetToken', deterministic: false }
    ]
  },

  // Session model - session data encryption
  Session: {
    organizationIdField: 'user.organizationId', // Nested field
    encryptedFields: [
      { field: 'refreshToken', deterministic: false },
      { field: 'ipAddress', deterministic: true },
      { field: 'userAgent', deterministic: false }
    ]
  },

  // Customer model - customer data encryption
  Customer: {
    organizationIdField: 'organizationId',
    encryptedFields: [
      { field: 'notes', deterministic: false }
    ]
  },

  // Vendor model - vendor sensitive data
  Vendor: {
    organizationIdField: 'organizationId',
    encryptedFields: [
      { field: 'bankAccount', deterministic: false },
      { field: 'taxNumber', deterministic: true },
      { field: 'notes', deterministic: false }
    ]
  },

  // Employee model - employment data
  Employee: {
    organizationIdField: 'organizationId',
    encryptedFields: [
      { field: 'salary', deterministic: false }
    ]
  },

  // Payment model - payment information
  Payment: {
    organizationIdField: 'organizationId',
    encryptedFields: [
      { field: 'referenceNumber', deterministic: true },
      { field: 'stripePaymentIntentId', deterministic: true },
      { field: 'stripeChargeId', deterministic: true },
      { field: 'bankReference', deterministic: true },
      { field: 'customerNotes', deterministic: false },
      { field: 'adminNotes', deterministic: false },
      { field: 'metadata', deterministic: false }
    ]
  },

  // Invoice model - financial data encryption
  Invoice: {
    organizationIdField: 'organizationId',
    encryptedFields: [
      { field: 'notes', deterministic: false }
    ]
  },

  // Quote model - quote information
  Quote: {
    organizationIdField: 'organizationId',
    encryptedFields: [
      { field: 'notes', deterministic: false },
      { field: 'rejectionReason', deterministic: false }
    ]
  },

  // Address model - address information
  Address: {
    organizationIdField: 'organizationId',
    encryptedFields: [
      { field: 'line1', searchable: true },
      { field: 'line2', searchable: true },
      { field: 'city', searchable: true },
      { field: 'postalCode', deterministic: true }
    ]
  },

  // ApiKey model - API key encryption
  ApiKey: {
    organizationIdField: 'organizationId',
    encryptedFields: [
      { field: 'permissions', deterministic: false },
      { field: 'lastUsedIp', deterministic: true }
    ]
  },

  // AuditLog model - audit data encryption
  AuditLog: {
    organizationIdField: 'organizationId',
    encryptedFields: [
      { field: 'changes', deterministic: false },
      { field: 'ipAddress', deterministic: true },
      { field: 'userAgent', deterministic: false }
    ]
  },

  // Project model - project sensitive data
  Project: {
    organizationIdField: 'organizationId',
    encryptedFields: [
      { field: 'description', deterministic: false }
    ]
  },

  // Expense model - expense information
  Expense: {
    organizationIdField: 'organizationId',
    encryptedFields: [
      { field: 'receipt', deterministic: false },
      { field: 'notes', deterministic: false }
    ]
  }
};

/**
 * Prisma middleware for automatic field encryption/decryption
 */
export class EncryptionMiddleware {
  private static instance: EncryptionMiddleware;

  public static getInstance(): EncryptionMiddleware {
    if (!EncryptionMiddleware.instance) {
      EncryptionMiddleware.instance = new EncryptionMiddleware();
    }
    return EncryptionMiddleware.instance;
  }

  /**
   * Apply encryption middleware to Prisma client
   */
  public apply(prisma: any): void {
    // Middleware for CREATE operations
    prisma.$use(async (params: any, next: any) => {
      if (params.action === 'create' || params.action === 'createMany') {
        params.args.data = await this.encryptData(params.model, params.args.data);
      }

      if (params.action === 'update' || params.action === 'updateMany') {
        params.args.data = await this.encryptData(params.model, params.args.data);
      }

      const result = await next(params);

      // Decrypt data on read operations
      if (params.action === 'findUnique' ||
          params.action === 'findFirst' ||
          params.action === 'findMany') {
        return this.decryptResult(params.model, result);
      }

      return result;
    });

    logger.info('Encryption middleware applied to Prisma client');
  }

  /**
   * Encrypt data before database write
   */
  private async encryptData(modelName: string, data: any): Promise<any> {
    if (!data || typeof data !== 'object') {
      return data;
    }

    const config = ENCRYPTION_CONFIG[modelName];
    if (!config) {
      return data; // No encryption config for this model
    }

    // Handle array of data (createMany)
    if (Array.isArray(data)) {
      return Promise.all(data.map(item => this.encryptSingleRecord(modelName, item, config)));
    }

    // Handle single record
    return this.encryptSingleRecord(modelName, data, config);
  }

  /**
   * Encrypt a single record
   */
  private async encryptSingleRecord(
    modelName: string,
    data: any,
    config: { organizationIdField: string; encryptedFields: FieldEncryptionConfig[] }
  ): Promise<any> {
    const encryptedData = { ...data };
    const organizationId = this.getOrganizationId(data, config.organizationIdField);

    if (!organizationId) {
      logger.warn(`No organization ID found for ${modelName} encryption`, { modelName, data });
      return data;
    }

    // Encrypt each configured field
    for (const fieldConfig of config.encryptedFields) {
      const fieldValue = data[fieldConfig.field];

      if (fieldValue && typeof fieldValue === 'string' && fieldValue.trim() !== '') {
        try {
          // Validate field format if specified
          if (fieldConfig.format &&
              !fieldEncryptionService.validateFieldFormat(fieldValue, fieldConfig.format)) {
            logger.warn(`Invalid format for field ${fieldConfig.field}`, {
              modelName,
              field: fieldConfig.field,
              format: fieldConfig.format
            });
            continue;
          }

          const encryptionOptions: EncryptionOptions = {
            organizationId,
            fieldName: `${modelName}.${fieldConfig.field}`,
            deterministic: fieldConfig.deterministic || false,
            searchable: fieldConfig.searchable || false,
            keyVersion: fieldConfig.keyVersion
          };

          encryptedData[fieldConfig.field] = await fieldEncryptionService.encryptField(
            fieldValue,
            encryptionOptions
          );

          logger.debug(`Encrypted field ${fieldConfig.field} for ${modelName}`, {
            modelName,
            field: fieldConfig.field,
            organizationId
          });

        } catch (error) {
          logger.error(`Failed to encrypt field ${fieldConfig.field}`, {
            modelName,
            field: fieldConfig.field,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          // Continue with original value on encryption failure
        }
      }
    }

    return encryptedData;
  }

  /**
   * Decrypt result after database read
   */
  private async decryptResult(modelName: string, result: any): Promise<any> {
    if (!result) {
      return result;
    }

    const config = ENCRYPTION_CONFIG[modelName];
    if (!config) {
      return result; // No decryption config for this model
    }

    // Handle array of results
    if (Array.isArray(result)) {
      return Promise.all(result.map(item => this.decryptSingleRecord(modelName, item, config)));
    }

    // Handle single result
    return this.decryptSingleRecord(modelName, result, config);
  }

  /**
   * Decrypt a single record
   */
  private async decryptSingleRecord(
    modelName: string,
    record: any,
    config: { organizationIdField: string; encryptedFields: FieldEncryptionConfig[] }
  ): Promise<any> {
    if (!record || typeof record !== 'object') {
      return record;
    }

    const decryptedRecord = { ...record };
    const organizationId = this.getOrganizationId(record, config.organizationIdField);

    if (!organizationId) {
      return record; // Cannot decrypt without organization ID
    }

    // Decrypt each configured field
    for (const fieldConfig of config.encryptedFields) {
      const encryptedValue = record[fieldConfig.field];

      if (encryptedValue && typeof encryptedValue === 'string' && encryptedValue.trim() !== '') {
        try {
          const encryptionOptions: EncryptionOptions = {
            organizationId,
            fieldName: `${modelName}.${fieldConfig.field}`,
            deterministic: fieldConfig.deterministic || false,
            searchable: fieldConfig.searchable || false,
            keyVersion: fieldConfig.keyVersion
          };

          decryptedRecord[fieldConfig.field] = await fieldEncryptionService.decryptField(
            encryptedValue,
            encryptionOptions
          );

        } catch (error) {
          logger.error(`Failed to decrypt field ${fieldConfig.field}`, {
            modelName,
            field: fieldConfig.field,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          // Keep encrypted value on decryption failure
        }
      }
    }

    return decryptedRecord;
  }

  /**
   * Extract organization ID from data or record
   */
  private getOrganizationId(data: any, organizationIdField: string): string | null {
    if (!data || typeof data !== 'object') {
      return null;
    }

    // Handle nested field paths (e.g., 'user.organizationId')
    const fieldParts = organizationIdField.split('.');
    let value = data;

    for (const part of fieldParts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part];
      } else {
        return null;
      }
    }

    return typeof value === 'string' ? value : null;
  }

  /**
   * Generate search conditions for encrypted fields
   */
  public generateSearchConditions(
    modelName: string,
    searchParams: any,
    organizationId: string
  ): any {
    const config = ENCRYPTION_CONFIG[modelName];
    if (!config) {
      return searchParams;
    }

    const modifiedParams = { ...searchParams };

    for (const fieldConfig of config.encryptedFields) {
      const searchValue = searchParams[fieldConfig.field];

      if (searchValue && typeof searchValue === 'string') {
        try {
          const encryptionOptions: EncryptionOptions = {
            organizationId,
            fieldName: `${modelName}.${fieldConfig.field}`,
            deterministic: fieldConfig.deterministic || false,
            searchable: fieldConfig.searchable || false
          };

          if (fieldConfig.deterministic) {
            // For deterministic fields, we can do exact match
            modifiedParams[fieldConfig.field] = fieldEncryptionService.encryptField(
              searchValue,
              encryptionOptions
            );
          } else if (fieldConfig.searchable) {
            // For searchable fields, generate search query
            const searchQuery = fieldEncryptionService.generateSearchQuery(
              searchValue,
              encryptionOptions
            );

            // Modify the query to use search tokens or blind index
            if (searchQuery.blindIndex) {
              modifiedParams[`${fieldConfig.field}_index`] = searchQuery.blindIndex;
            }
          } else {
            // Cannot search encrypted probabilistic fields
            delete modifiedParams[fieldConfig.field];
            logger.warn(`Cannot search non-deterministic encrypted field: ${fieldConfig.field}`);
          }

        } catch (error) {
          logger.error(`Failed to generate search condition for ${fieldConfig.field}`, {
            modelName,
            field: fieldConfig.field,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          delete modifiedParams[fieldConfig.field];
        }
      }
    }

    return modifiedParams;
  }

  /**
   * Get encryption configuration for a model
   */
  public getModelConfig(modelName: string): any {
    return ENCRYPTION_CONFIG[modelName];
  }

  /**
   * Check if a field is encrypted
   */
  public isFieldEncrypted(modelName: string, fieldName: string): boolean {
    const config = ENCRYPTION_CONFIG[modelName];
    if (!config) {
      return false;
    }

    return config.encryptedFields.some(field => field.field === fieldName);
  }

  /**
   * Get list of encrypted fields for a model
   */
  public getEncryptedFields(modelName: string): string[] {
    const config = ENCRYPTION_CONFIG[modelName];
    if (!config) {
      return [];
    }

    return config.encryptedFields.map(field => field.field);
  }

  /**
   * Validate encryption configuration
   */
  public validateConfiguration(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    for (const [modelName, config] of Object.entries(ENCRYPTION_CONFIG)) {
      // Validate organization ID field
      if (!config.organizationIdField) {
        errors.push(`Missing organizationIdField for model: ${modelName}`);
      }

      // Validate encrypted fields
      for (const fieldConfig of config.encryptedFields) {
        if (!fieldConfig.field) {
          errors.push(`Missing field name in encryption config for model: ${modelName}`);
        }

        if (fieldConfig.deterministic && fieldConfig.searchable) {
          errors.push(
            `Field ${fieldConfig.field} in ${modelName} cannot be both deterministic and searchable`
          );
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

// Export singleton instance
export const encryptionMiddleware = EncryptionMiddleware.getInstance();