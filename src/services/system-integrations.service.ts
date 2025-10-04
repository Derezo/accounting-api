import { prisma } from '../config/database';
import { fieldEncryptionService } from './field-encryption.service';
import { auditService } from './audit.service';
import { logger } from '../utils/logger';
import { IntegrationType, IntegrationStatus, SyncFrequency } from '../types/enums';
import axios from 'axios';

export interface SystemIntegrationConfig {
  apiKey?: string;
  apiSecret?: string;
  webhookUrl?: string;
  callbackUrl?: string;
  scope?: string[];
  customFields?: Record<string, any>;
}

export interface CreateIntegrationInput {
  name: string;
  type: IntegrationType;
  enabled: boolean;
  config: SystemIntegrationConfig;
  organizationId?: string; // Null for system-wide
  syncFrequency?: SyncFrequency;
}

export interface UpdateIntegrationInput {
  name?: string;
  enabled?: boolean;
  config?: SystemIntegrationConfig;
  syncFrequency?: SyncFrequency;
  status?: IntegrationStatus;
}

export interface TestConnectionResult {
  success: boolean;
  message: string;
  responseTime?: number;
  details?: Record<string, any>;
}

export interface AuditContext {
  userId: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * System Integrations Service
 *
 * Manages third-party integrations with encrypted credential storage.
 * Supports STRIPE, QUICKBOOKS, SENDGRID, TWILIO, SLACK, and CUSTOM types.
 *
 * Features:
 * - Encrypted configuration storage using field-encryption.service
 * - Test connection functionality for each integration type
 * - Support for both system-wide and organization-specific integrations
 * - Audit logging for all operations
 */
export class SystemIntegrationsService {
  private readonly ALLOWED_TYPES = Object.values(IntegrationType);

  /**
   * Get all integrations with optional filtering
   */
  async getAll(filters?: {
    type?: IntegrationType;
    status?: IntegrationStatus;
    enabled?: boolean;
    organizationId?: string | null;
  }): Promise<any[]> {
    const where: any = { deletedAt: null };

    if (filters?.type) {
      where.type = filters.type;
    }
    if (filters?.status) {
      where.status = filters.status;
    }
    if (filters?.enabled !== undefined) {
      where.enabled = filters.enabled;
    }
    if (filters?.organizationId !== undefined) {
      where.organizationId = filters.organizationId;
    }

    const integrations = await prisma.systemIntegration.findMany({
      where,
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            domain: true
          }
        },
        creator: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Decrypt configurations for return
    return Promise.all(
      integrations.map(async (integration) => {
        const decryptedConfig = await this.decryptConfig(
          integration.configEncrypted,
          integration.organizationId || 'system'
        );

        return {
          id: integration.id,
          name: integration.name,
          type: integration.type,
          status: integration.status,
          enabled: integration.enabled,
          config: this.sanitizeConfig(decryptedConfig), // Remove sensitive data
          lastSync: integration.lastSync,
          lastError: integration.lastError,
          syncFrequency: integration.syncFrequency,
          organizationId: integration.organizationId,
          organization: integration.organization,
          createdAt: integration.createdAt,
          updatedAt: integration.updatedAt,
          createdBy: integration.createdBy,
          creator: integration.creator
        };
      })
    );
  }

  /**
   * Get a single integration by ID
   */
  async getById(id: string): Promise<any> {
    const integration = await prisma.systemIntegration.findFirst({
      where: { id, deletedAt: null },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            domain: true
          }
        },
        creator: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    });

    if (!integration) {
      throw new Error('Integration not found');
    }

    const decryptedConfig = await this.decryptConfig(
      integration.configEncrypted,
      integration.organizationId || 'system'
    );

    return {
      id: integration.id,
      name: integration.name,
      type: integration.type,
      status: integration.status,
      enabled: integration.enabled,
      config: decryptedConfig, // Full config for detail view
      lastSync: integration.lastSync,
      lastError: integration.lastError,
      syncFrequency: integration.syncFrequency,
      organizationId: integration.organizationId,
      organization: integration.organization,
      createdAt: integration.createdAt,
      updatedAt: integration.updatedAt,
      createdBy: integration.createdBy,
      creator: integration.creator
    };
  }

  /**
   * Create a new integration
   */
  async create(
    input: CreateIntegrationInput,
    context: AuditContext
  ): Promise<any> {
    // Validate integration type
    if (!this.ALLOWED_TYPES.includes(input.type)) {
      throw new Error(`Invalid integration type. Allowed types: ${this.ALLOWED_TYPES.join(', ')}`);
    }

    // Validate organization exists if organizationId provided
    if (input.organizationId) {
      const org = await prisma.organization.findUnique({
        where: { id: input.organizationId }
      });
      if (!org) {
        throw new Error('Organization not found');
      }
    }

    // Encrypt the configuration
    const encryptedConfig = await this.encryptConfig(
      input.config,
      input.organizationId || 'system'
    );

    // Create integration
    const integration = await prisma.systemIntegration.create({
      data: {
        name: input.name,
        type: input.type,
        status: input.enabled ? IntegrationStatus.INACTIVE : IntegrationStatus.INACTIVE,
        enabled: input.enabled,
        configEncrypted: encryptedConfig,
        syncFrequency: input.syncFrequency,
        organizationId: input.organizationId,
        createdBy: context.userId
      },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            domain: true
          }
        },
        creator: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    });

    // Audit log
    await auditService.logAction({
      action: 'CREATE',
      entityType: 'SystemIntegration',
      entityId: integration.id,
      context: {
        organizationId: input.organizationId || 'system',
        userId: context.userId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent
      }
    });

    logger.info(`Created system integration: ${integration.id}`, {
      integrationType: integration.type,
      userId: context.userId
    });

    return {
      id: integration.id,
      name: integration.name,
      type: integration.type,
      status: integration.status,
      enabled: integration.enabled,
      config: this.sanitizeConfig(input.config),
      lastSync: integration.lastSync,
      lastError: integration.lastError,
      syncFrequency: integration.syncFrequency,
      organizationId: integration.organizationId,
      organization: integration.organization,
      createdAt: integration.createdAt,
      updatedAt: integration.updatedAt,
      createdBy: integration.createdBy,
      creator: integration.creator
    };
  }

  /**
   * Update an integration
   */
  async update(
    id: string,
    input: UpdateIntegrationInput,
    context: AuditContext
  ): Promise<any> {
    const existing = await prisma.systemIntegration.findFirst({
      where: { id, deletedAt: null }
    });

    if (!existing) {
      throw new Error('Integration not found');
    }

    const updateData: any = {};

    if (input.name !== undefined) {
      updateData.name = input.name;
    }
    if (input.enabled !== undefined) {
      updateData.enabled = input.enabled;
    }
    if (input.status !== undefined) {
      updateData.status = input.status;
    }
    if (input.syncFrequency !== undefined) {
      updateData.syncFrequency = input.syncFrequency;
    }

    // If config is being updated, encrypt it
    if (input.config) {
      updateData.configEncrypted = await this.encryptConfig(
        input.config,
        existing.organizationId || 'system'
      );
    }

    updateData.updatedAt = new Date();

    const integration = await prisma.systemIntegration.update({
      where: { id },
      data: updateData,
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            domain: true
          }
        },
        creator: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    });

    // Audit log
    await auditService.logAction({
      action: 'UPDATE',
      entityType: 'SystemIntegration',
      entityId: integration.id,
      context: {
        organizationId: existing.organizationId || 'system',
        userId: context.userId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent
      }
    });

    logger.info(`Updated system integration: ${integration.id}`, {
      integrationType: integration.type,
      userId: context.userId
    });

    const decryptedConfig = await this.decryptConfig(
      integration.configEncrypted,
      integration.organizationId || 'system'
    );

    return {
      id: integration.id,
      name: integration.name,
      type: integration.type,
      status: integration.status,
      enabled: integration.enabled,
      config: this.sanitizeConfig(decryptedConfig),
      lastSync: integration.lastSync,
      lastError: integration.lastError,
      syncFrequency: integration.syncFrequency,
      organizationId: integration.organizationId,
      organization: integration.organization,
      createdAt: integration.createdAt,
      updatedAt: integration.updatedAt,
      createdBy: integration.createdBy,
      creator: integration.creator
    };
  }

  /**
   * Delete an integration (soft delete)
   */
  async delete(id: string, context: AuditContext): Promise<void> {
    const existing = await prisma.systemIntegration.findFirst({
      where: { id, deletedAt: null }
    });

    if (!existing) {
      throw new Error('Integration not found');
    }

    await prisma.systemIntegration.update({
      where: { id },
      data: { deletedAt: new Date() }
    });

    // Audit log
    await auditService.logAction({
      action: 'DELETE',
      entityType: 'SystemIntegration',
      entityId: id,
      context: {
        organizationId: existing.organizationId || 'system',
        userId: context.userId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent
      }
    });

    logger.info(`Deleted system integration: ${id}`, {
      integrationType: existing.type,
      userId: context.userId
    });
  }

  /**
   * Test an integration connection
   */
  async testConnection(id: string): Promise<TestConnectionResult> {
    const integration = await prisma.systemIntegration.findFirst({
      where: { id, deletedAt: null }
    });

    if (!integration) {
      throw new Error('Integration not found');
    }

    const config = await this.decryptConfig(
      integration.configEncrypted,
      integration.organizationId || 'system'
    );

    const startTime = Date.now();

    try {
      let result: TestConnectionResult;

      switch (integration.type) {
        case IntegrationType.STRIPE:
          result = await this.testStripe(config);
          break;
        case IntegrationType.SENDGRID:
          result = await this.testSendgrid(config);
          break;
        case IntegrationType.TWILIO:
          result = await this.testTwilio(config);
          break;
        case IntegrationType.SLACK:
          result = await this.testSlack(config);
          break;
        case IntegrationType.QUICKBOOKS:
          result = await this.testQuickbooks(config);
          break;
        case IntegrationType.CUSTOM:
          result = await this.testCustom(config);
          break;
        default:
          throw new Error(`Test not implemented for type: ${integration.type}`);
      }

      result.responseTime = Date.now() - startTime;

      // Update integration status on successful test
      if (result.success) {
        await prisma.systemIntegration.update({
          where: { id },
          data: {
            status: IntegrationStatus.TESTING,
            lastError: null
          }
        });
      } else {
        await prisma.systemIntegration.update({
          where: { id },
          data: {
            status: IntegrationStatus.ERROR,
            lastError: result.message
          }
        });
      }

      return result;
    } catch (error: any) {
      const responseTime = Date.now() - startTime;

      // Update integration status on error
      await prisma.systemIntegration.update({
        where: { id },
        data: {
          status: IntegrationStatus.ERROR,
          lastError: error.message
        }
      });

      return {
        success: false,
        message: error.message,
        responseTime
      };
    }
  }

  /**
   * Encrypt configuration using field encryption service
   */
  private async encryptConfig(
    config: SystemIntegrationConfig,
    organizationId: string
  ): Promise<string> {
    const configJson = JSON.stringify(config);

    // Use a master organization for system-wide integrations
    const orgId = organizationId === 'system'
      ? await this.getMasterOrgId()
      : organizationId;

    const encrypted = await fieldEncryptionService.encryptField(configJson, {
      organizationId: orgId,
      fieldName: 'integration_config',
      deterministic: false,
      searchable: false,
      entityType: 'SystemIntegration',
      entityId: 'config'
    });

    return encrypted;
  }

  /**
   * Decrypt configuration using field encryption service
   */
  private async decryptConfig(
    encryptedConfig: string,
    organizationId: string
  ): Promise<SystemIntegrationConfig> {
    const orgId = organizationId === 'system'
      ? await this.getMasterOrgId()
      : organizationId;

    const decrypted = await fieldEncryptionService.decryptField(
      encryptedConfig,
      { organizationId: orgId, fieldName: 'integration_config' }
    );

    return JSON.parse(decrypted);
  }

  /**
   * Get master organization ID for system-wide integrations
   */
  private async getMasterOrgId(): Promise<string> {
    const masterOrg = await prisma.organization.findFirst({
      where: { isMasterOrg: true }
    });

    if (!masterOrg) {
      throw new Error('Master organization not found');
    }

    return masterOrg.id;
  }

  /**
   * Sanitize config by removing sensitive fields for list/summary views
   */
  private sanitizeConfig(config: SystemIntegrationConfig): Partial<SystemIntegrationConfig> {
    return {
      webhookUrl: config.webhookUrl,
      callbackUrl: config.callbackUrl,
      scope: config.scope,
      customFields: config.customFields,
      // apiKey and apiSecret are intentionally omitted
    };
  }

  /**
   * Test Stripe connection
   */
  private async testStripe(config: SystemIntegrationConfig): Promise<TestConnectionResult> {
    if (!config.apiKey) {
      return { success: false, message: 'Stripe API key is required' };
    }

    try {
      // Test Stripe API connection
      const response = await axios.get('https://api.stripe.com/v1/balance', {
        headers: {
          Authorization: `Bearer ${config.apiKey}`
        }
      });

      return {
        success: true,
        message: 'Stripe connection successful',
        details: {
          available: response.data.available,
          pending: response.data.pending
        }
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.response?.data?.error?.message || 'Stripe connection failed'
      };
    }
  }

  /**
   * Test SendGrid connection
   */
  private async testSendgrid(config: SystemIntegrationConfig): Promise<TestConnectionResult> {
    if (!config.apiKey) {
      return { success: false, message: 'SendGrid API key is required' };
    }

    try {
      const response = await axios.get('https://api.sendgrid.com/v3/user/account', {
        headers: {
          Authorization: `Bearer ${config.apiKey}`
        }
      });

      return {
        success: true,
        message: 'SendGrid connection successful',
        details: {
          type: response.data.type,
          reputation: response.data.reputation
        }
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.response?.data?.errors?.[0]?.message || 'SendGrid connection failed'
      };
    }
  }

  /**
   * Test Twilio connection
   */
  private async testTwilio(config: SystemIntegrationConfig): Promise<TestConnectionResult> {
    if (!config.apiKey || !config.apiSecret) {
      return { success: false, message: 'Twilio Account SID and Auth Token are required' };
    }

    try {
      const response = await axios.get(
        `https://api.twilio.com/2010-04-01/Accounts/${config.apiKey}.json`,
        {
          auth: {
            username: config.apiKey,
            password: config.apiSecret
          }
        }
      );

      return {
        success: true,
        message: 'Twilio connection successful',
        details: {
          friendlyName: response.data.friendly_name,
          status: response.data.status
        }
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.response?.data?.message || 'Twilio connection failed'
      };
    }
  }

  /**
   * Test Slack connection
   */
  private async testSlack(config: SystemIntegrationConfig): Promise<TestConnectionResult> {
    if (!config.apiKey) {
      return { success: false, message: 'Slack API token is required' };
    }

    try {
      const response = await axios.get('https://slack.com/api/auth.test', {
        headers: {
          Authorization: `Bearer ${config.apiKey}`
        }
      });

      if (response.data.ok) {
        return {
          success: true,
          message: 'Slack connection successful',
          details: {
            team: response.data.team,
            user: response.data.user
          }
        };
      } else {
        return {
          success: false,
          message: response.data.error || 'Slack connection failed'
        };
      }
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Slack connection failed'
      };
    }
  }

  /**
   * Test QuickBooks connection
   */
  private async testQuickbooks(config: SystemIntegrationConfig): Promise<TestConnectionResult> {
    // QuickBooks uses OAuth2, so we can't easily test without a full OAuth flow
    // For now, just validate config structure
    if (!config.apiKey || !config.apiSecret) {
      return {
        success: false,
        message: 'QuickBooks Client ID and Client Secret are required'
      };
    }

    return {
      success: true,
      message: 'QuickBooks configuration validated (full OAuth test requires user authorization)'
    };
  }

  /**
   * Test custom integration
   */
  private async testCustom(config: SystemIntegrationConfig): Promise<TestConnectionResult> {
    if (!config.webhookUrl && !config.callbackUrl) {
      return {
        success: false,
        message: 'Custom integration requires at least a webhook or callback URL'
      };
    }

    const testUrl = config.webhookUrl || config.callbackUrl;

    try {
      // Simple ping test
      const response = await axios.get(testUrl!, {
        timeout: 5000,
        validateStatus: () => true // Accept any status code
      });

      return {
        success: response.status < 500,
        message: `Custom endpoint responded with status ${response.status}`,
        details: {
          statusCode: response.status,
          statusText: response.statusText
        }
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Custom endpoint connection failed'
      };
    }
  }
}

export const systemIntegrationsService = new SystemIntegrationsService();
