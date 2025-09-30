import { OrganizationBranding } from '@prisma/client';
import { auditService } from './audit.service';
import { invoiceTemplateService } from './invoice-template.service';
import { prisma } from '../config/database';

export interface InvoiceSettingsData {
  // Logo Configuration
  logoUrl?: string;
  logoWidth?: number;
  logoHeight?: number;
  showLogo?: boolean;
  showOrgName?: boolean;

  // Color Scheme
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  backgroundColor?: string;
  textColor?: string;

  // Display Settings
  displaySettings?: {
    dateFormat?: string;
    currency?: string;
    layout?: string;
    showItemCodes?: boolean;
    showDescription?: boolean;
  };
  customCss?: string;

  // Tax Settings
  taxesEnabled?: boolean;
  defaultTaxExempt?: boolean;
  taxDisplaySettings?: {
    showTaxBreakdown?: boolean;
    hideTaxColumn?: boolean;
    taxLabel?: string;
  };

  // Template Selection
  defaultTemplateId?: string;
  defaultStyleId?: string;
}

export interface OrganizationInvoiceSettings {
  branding: OrganizationBranding;
  availableTemplates: Array<{ id: string; name: string; templateType: string; isDefault: boolean }>;
  availableStyles: Array<{ id: string; name: string; description?: string; isDefault: boolean }>;
}

// ==================== SYSTEM PREFERENCES TYPES ====================

export interface SystemPreferences {
  id: string;
  organizationId: string;

  // General Settings
  general: {
    systemName: string;
    systemVersion: string;
    environment: 'development' | 'staging' | 'production';
    defaultUserRole: string;
    maintenanceMode: boolean;
    maintenanceMessage?: string;
  };

  // Regional Settings
  regional: {
    timezone: string;
    language: string;
    country: string;
    currency: string;
    dateFormat: string;
    timeFormat: string;
    numberFormat: string;
    fiscalYearStart: string; // MM-DD format
  };

  // Data Management
  dataManagement: {
    backupEnabled: boolean;
    backupFrequency: 'daily' | 'weekly' | 'monthly';
    retentionDays: number;
    autoExportEnabled: boolean;
    maxFileUploadSize: number; // MB
    allowedFileTypes: string[];
  };

  // Performance Settings
  performance: {
    cachingEnabled: boolean;
    cacheExpiryMinutes: number;
    optimizationsEnabled: boolean;
    cdnEnabled: boolean;
    maxConcurrentUsers: number;
    rateLimitEnabled: boolean;
    rateLimitPerMinute: number;
  };

  // API Settings
  apiSettings: {
    apiKeysEnabled: boolean;
    webhooksEnabled: boolean;
    rateLimitPerMinute: number;
    maxWebhooksPerOrg: number;
    webhookRetryAttempts: number;
  };

  // Integration Settings
  integrations: {
    quickbooksEnabled: boolean;
    stripeEnabled: boolean;
    twilioEnabled: boolean;
    sendgridEnabled: boolean;
    slackEnabled: boolean;
    oauthProvidersEnabled: string[]; // ['google', 'microsoft']
  };

  // Feature Flags
  featureFlags: {
    betaFeaturesEnabled: boolean;
    experimentalFeaturesEnabled: boolean;
    newDashboardEnabled: boolean;
    advancedReportsEnabled: boolean;
    aiAssistantEnabled: boolean;
    mobileAppEnabled: boolean;
  };

  // Logging & Monitoring
  logging: {
    logLevel: 'debug' | 'info' | 'warn' | 'error';
    auditLoggingEnabled: boolean;
    errorTrackingEnabled: boolean;
    performanceMonitoringEnabled: boolean;
    logRetentionDays: number;
  };

  createdAt: string;
  updatedAt: string;
}

// ==================== NOTIFICATION SETTINGS TYPES ====================

export interface NotificationSettings {
  id: string;
  organizationId: string;

  // Email Notifications
  email: {
    enabled: boolean;
    smtpHost?: string;
    smtpPort?: number;
    smtpUsername?: string;
    smtpPassword?: string;
    smtpSecure: boolean;
    senderEmail: string;
    senderName: string;
    replyToEmail?: string;

    notificationTypes: {
      invoiceCreated: boolean;
      invoicePaid: boolean;
      invoiceOverdue: boolean;
      paymentReceived: boolean;
      quoteCreated: boolean;
      quoteClosed: boolean;
      appointmentScheduled: boolean;
      appointmentReminder: boolean;
      projectUpdated: boolean;
      userInvitation: boolean;
      passwordReset: boolean;
      systemAlerts: boolean;
    };
  };

  // SMS Notifications
  sms: {
    enabled: boolean;
    provider: 'twilio' | 'nexmo' | 'aws-sns' | null;
    accountSid?: string;
    authToken?: string;
    fromPhoneNumber?: string;
    monthlyCostLimit?: number;

    notificationTypes: {
      invoiceOverdue: boolean;
      paymentReceived: boolean;
      appointmentReminder: boolean;
      criticalAlerts: boolean;
    };
  };

  // Push Notifications
  push: {
    enabled: boolean;
    webPushEnabled: boolean;
    mobilePushEnabled: boolean;
    vapidPublicKey?: string;
    vapidPrivateKey?: string;
    fcmServerKey?: string;

    notificationTypes: {
      invoiceCreated: boolean;
      paymentReceived: boolean;
      appointmentReminder: boolean;
      projectUpdated: boolean;
      systemAlerts: boolean;
    };
  };

  // In-App Notifications
  inApp: {
    enabled: boolean;
    showBadges: boolean;
    soundEnabled: boolean;
    retentionDays: number;

    notificationTypes: {
      invoiceCreated: boolean;
      invoicePaid: boolean;
      paymentReceived: boolean;
      quoteCreated: boolean;
      appointmentScheduled: boolean;
      projectUpdated: boolean;
      userMentioned: boolean;
      systemAlerts: boolean;
    };
  };

  // Webhook Notifications
  webhooks: {
    enabled: boolean;
    endpoints: Array<{
      id: string;
      url: string;
      enabled: boolean;
      secret: string;
      events: string[];
    }>;
    retryAttempts: number;
    retryDelaySeconds: number;
    timeoutSeconds: number;
  };

  // Notification Preferences
  preferences: {
    quietHoursEnabled: boolean;
    quietHoursStart?: string;
    quietHoursEnd?: string;
    digestEnabled: boolean;
    digestFrequency: 'daily' | 'weekly' | 'never';
    digestTime?: string;
    batchingEnabled: boolean;
    batchingWindowMinutes?: number;
  };

  createdAt: string;
  updatedAt: string;
}

export class OrganizationSettingsService {

  /**
   * Get complete invoice settings for organization
   */
  async getInvoiceSettings(organizationId: string): Promise<OrganizationInvoiceSettings> {
    // Get or create branding settings
    let branding = await prisma.organizationBranding.findUnique({
      where: { organizationId }
    });

    if (!branding) {
      branding = await this.createDefaultBranding(organizationId);
    }

    // Get available templates and styles
    const { templates } = await invoiceTemplateService.getTemplates(organizationId, {
      limit: 50
    });

    const { styles } = await invoiceTemplateService.getStyles(organizationId, {
      limit: 50
    });

    return {
      branding,
      availableTemplates: templates.map(t => ({
        id: t.id,
        name: t.name,
        templateType: t.templateType,
        isDefault: t.isDefault
      })),
      availableStyles: styles.map(s => ({
        id: s.id,
        name: s.name,
        description: s.description || undefined,
        isDefault: s.isDefault
      }))
    };
  }

  /**
   * Update invoice settings for organization
   */
  async updateInvoiceSettings(
    organizationId: string,
    data: InvoiceSettingsData,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<OrganizationBranding> {
    const existingBranding = await prisma.organizationBranding.findUnique({
      where: { organizationId }
    });

    const brandingData = {
      logoUrl: data.logoUrl,
      logoWidth: data.logoWidth,
      logoHeight: data.logoHeight,
      showLogo: data.showLogo,
      showOrgName: data.showOrgName,
      primaryColor: data.primaryColor,
      secondaryColor: data.secondaryColor,
      accentColor: data.accentColor,
      backgroundColor: data.backgroundColor,
      textColor: data.textColor,
      displaySettings: data.displaySettings ? JSON.stringify(data.displaySettings) : undefined,
      customCss: data.customCss,
      taxesEnabled: data.taxesEnabled,
      defaultTaxExempt: data.defaultTaxExempt,
      taxDisplaySettings: data.taxDisplaySettings ? JSON.stringify(data.taxDisplaySettings) : undefined,
      defaultTemplateId: data.defaultTemplateId,
      defaultStyleId: data.defaultStyleId,
      updatedAt: new Date()
    };

    // Remove undefined values to avoid Prisma errors
    const cleanedBrandingData = Object.fromEntries(
      Object.entries(brandingData).filter(([_, value]) => value !== undefined)
    );

    let updatedBranding: OrganizationBranding;

    if (existingBranding) {
      updatedBranding = await prisma.organizationBranding.update({
        where: { organizationId },
        data: cleanedBrandingData
      });

      await auditService.logUpdate(
        'OrganizationBranding',
        existingBranding.id,
        existingBranding,
        updatedBranding,
        {
          organizationId,
          userId: auditContext.userId,
          ipAddress: auditContext.ipAddress,
          userAgent: auditContext.userAgent
        }
      );
    } else {
      // Ensure required fields are provided for create
      const createData = {
        organizationId,
        showOrgName: true,
        taxesEnabled: true,
        primaryColor: '#000000',
        secondaryColor: '#666666',
        displaySettings: JSON.stringify({
          dateFormat: 'YYYY-MM-DD',
          currency: 'CAD',
          layout: 'standard'
        }),
        ...cleanedBrandingData
      };

      updatedBranding = await prisma.organizationBranding.create({
        data: createData
      });

      await auditService.logCreate(
        'OrganizationBranding',
        updatedBranding.id,
        updatedBranding,
        {
          organizationId,
          userId: auditContext.userId,
          ipAddress: auditContext.ipAddress,
          userAgent: auditContext.userAgent
        }
      );
    }

    return updatedBranding;
  }

  /**
   * Update logo for organization
   */
  async updateLogo(
    organizationId: string,
    logoUrl: string,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string },
    logoWidth?: number,
    logoHeight?: number
  ): Promise<OrganizationBranding> {
    let branding = await prisma.organizationBranding.findUnique({
      where: { organizationId }
    });

    if (!branding) {
      branding = await this.createDefaultBranding(organizationId);
    }

    const updatedBranding = await prisma.organizationBranding.update({
      where: { organizationId },
      data: {
        logoUrl,
        logoWidth,
        logoHeight,
        showLogo: true, // Automatically enable logo display when uploaded
        updatedAt: new Date()
      }
    });

    await auditService.logUpdate(
      'OrganizationBranding',
      branding.id,
      branding,
      updatedBranding,
      {
        organizationId,
        userId: auditContext.userId,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent
      }
    );

    return updatedBranding;
  }

  /**
   * Remove logo from organization
   */
  async removeLogo(
    organizationId: string,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<OrganizationBranding> {
    const branding = await prisma.organizationBranding.findUnique({
      where: { organizationId }
    });

    if (!branding) {
      throw new Error('Branding settings not found');
    }

    const updatedBranding = await prisma.organizationBranding.update({
      where: { organizationId },
      data: {
        logoUrl: null,
        logoWidth: null,
        logoHeight: null,
        showLogo: false,
        updatedAt: new Date()
      }
    });

    await auditService.logUpdate(
      'OrganizationBranding',
      branding.id,
      branding,
      updatedBranding,
      {
        organizationId,
        userId: auditContext.userId,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent
      }
    );

    return updatedBranding;
  }

  /**
   * Toggle tax calculations for organization
   */
  async updateTaxSettings(
    organizationId: string,
    taxesEnabled: boolean,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string },
    defaultTaxExempt?: boolean
  ): Promise<OrganizationBranding> {
    let branding = await prisma.organizationBranding.findUnique({
      where: { organizationId }
    });

    if (!branding) {
      branding = await this.createDefaultBranding(organizationId);
    }

    const updatedBranding = await prisma.organizationBranding.update({
      where: { organizationId },
      data: {
        taxesEnabled,
        defaultTaxExempt: defaultTaxExempt !== undefined ? defaultTaxExempt : branding.defaultTaxExempt,
        updatedAt: new Date()
      }
    });

    await auditService.logUpdate(
      'OrganizationBranding',
      branding.id,
      branding,
      updatedBranding,
      {
        organizationId,
        userId: auditContext.userId,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent
      }
    );

    return updatedBranding;
  }

  /**
   * Set default template and style
   */
  async setDefaultTemplateAndStyle(
    organizationId: string,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string },
    templateId?: string,
    styleId?: string
  ): Promise<OrganizationBranding> {
    // Validate template exists and belongs to organization
    if (templateId) {
      const template = await prisma.invoiceTemplate.findFirst({
        where: { id: templateId, organizationId, deletedAt: null }
      });
      if (!template) {
        throw new Error('Template not found');
      }
    }

    // Validate style exists and belongs to organization
    if (styleId) {
      const style = await prisma.invoiceStyle.findFirst({
        where: { id: styleId, organizationId, deletedAt: null }
      });
      if (!style) {
        throw new Error('Style not found');
      }
    }

    let branding = await prisma.organizationBranding.findUnique({
      where: { organizationId }
    });

    if (!branding) {
      branding = await this.createDefaultBranding(organizationId);
    }

    const updatedBranding = await prisma.organizationBranding.update({
      where: { organizationId },
      data: {
        defaultTemplateId: templateId,
        defaultStyleId: styleId,
        updatedAt: new Date()
      }
    });

    await auditService.logUpdate(
      'OrganizationBranding',
      branding.id,
      branding,
      updatedBranding,
      {
        organizationId,
        userId: auditContext.userId,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent
      }
    );

    return updatedBranding;
  }

  /**
   * Initialize complete invoice settings for new organization
   */
  async initializeInvoiceSettings(
    organizationId: string,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<OrganizationInvoiceSettings> {
    // Initialize system templates and styles
    await invoiceTemplateService.initializeSystemTemplatesAndStyles(organizationId, auditContext);

    // Create default branding
    await this.createDefaultBranding(organizationId);

    // Return complete settings
    return this.getInvoiceSettings(organizationId);
  }

  /**
   * Create default branding settings
   */
  private async createDefaultBranding(organizationId: string): Promise<OrganizationBranding> {
    return await prisma.organizationBranding.create({
      data: {
        organizationId,
        logoUrl: null,
        showLogo: true,
        showOrgName: true,
        primaryColor: '#000000',
        secondaryColor: '#666666',
        accentColor: '#0066cc',
        backgroundColor: '#ffffff',
        textColor: '#000000',
        displaySettings: JSON.stringify({
          dateFormat: 'YYYY-MM-DD',
          currency: 'CAD',
          layout: 'standard',
          showItemCodes: true,
          showDescription: true
        }),
        taxesEnabled: true,
        defaultTaxExempt: false,
        taxDisplaySettings: JSON.stringify({
          showTaxBreakdown: true,
          hideTaxColumn: false,
          taxLabel: 'Tax'
        })
      }
    });
  }

  /**
   * Get tax settings for organization (used by invoice service)
   */
  async getTaxSettings(organizationId: string): Promise<{ taxesEnabled: boolean; defaultTaxExempt: boolean }> {
    const branding = await prisma.organizationBranding.findUnique({
      where: { organizationId },
      select: { taxesEnabled: true, defaultTaxExempt: true }
    });

    return {
      taxesEnabled: branding?.taxesEnabled ?? true,
      defaultTaxExempt: branding?.defaultTaxExempt ?? false
    };
  }

  // ==================== SYSTEM PREFERENCES METHODS ====================

  /**
   * Get all system preferences (with defaults if not exist)
   */
  async getSystemPreferences(organizationId: string): Promise<SystemPreferences> {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { settings: true, name: true, createdAt: true, updatedAt: true }
    });

    if (!org) {
      throw new Error('Organization not found');
    }

    // Parse existing settings or use defaults
    let systemPrefs: any = {};
    if (org.settings) {
      try {
        const parsed = JSON.parse(org.settings);
        systemPrefs = parsed.systemPreferences || {};
      } catch (e) {
        // Invalid JSON, use defaults
      }
    }

    // Return with defaults for missing fields
    return {
      id: organizationId,
      organizationId,
      general: systemPrefs.general || {
        systemName: org.name,
        systemVersion: '1.0.0',
        environment: 'production',
        defaultUserRole: 'EMPLOYEE',
        maintenanceMode: false,
        maintenanceMessage: undefined
      },
      regional: systemPrefs.regional || {
        timezone: 'America/Toronto',
        language: 'en',
        country: 'CA',
        currency: 'CAD',
        dateFormat: 'YYYY-MM-DD',
        timeFormat: '24h',
        numberFormat: 'en-CA',
        fiscalYearStart: '01-01'
      },
      dataManagement: systemPrefs.dataManagement || {
        backupEnabled: true,
        backupFrequency: 'daily',
        retentionDays: 90,
        autoExportEnabled: false,
        maxFileUploadSize: 10,
        allowedFileTypes: ['pdf', 'jpg', 'jpeg', 'png', 'xlsx', 'csv', 'docx']
      },
      performance: systemPrefs.performance || {
        cachingEnabled: true,
        cacheExpiryMinutes: 60,
        optimizationsEnabled: true,
        cdnEnabled: false,
        maxConcurrentUsers: 100,
        rateLimitEnabled: true,
        rateLimitPerMinute: 60
      },
      apiSettings: systemPrefs.apiSettings || {
        apiKeysEnabled: true,
        webhooksEnabled: true,
        rateLimitPerMinute: 60,
        maxWebhooksPerOrg: 10,
        webhookRetryAttempts: 3
      },
      integrations: systemPrefs.integrations || {
        quickbooksEnabled: false,
        stripeEnabled: false,
        twilioEnabled: false,
        sendgridEnabled: false,
        slackEnabled: false,
        oauthProvidersEnabled: []
      },
      featureFlags: systemPrefs.featureFlags || {
        betaFeaturesEnabled: false,
        experimentalFeaturesEnabled: false,
        newDashboardEnabled: false,
        advancedReportsEnabled: false,
        aiAssistantEnabled: false,
        mobileAppEnabled: false
      },
      logging: systemPrefs.logging || {
        logLevel: 'info',
        auditLoggingEnabled: true,
        errorTrackingEnabled: true,
        performanceMonitoringEnabled: false,
        logRetentionDays: 90
      },
      createdAt: org.createdAt.toISOString(),
      updatedAt: org.updatedAt.toISOString()
    };
  }

  /**
   * Update general settings
   */
  async updateGeneralSettings(
    organizationId: string,
    data: Partial<SystemPreferences['general']>,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<SystemPreferences> {
    return this.updateSystemPreferencesCategory(organizationId, 'general', data, auditContext);
  }

  /**
   * Update regional settings
   */
  async updateRegionalSettings(
    organizationId: string,
    data: Partial<SystemPreferences['regional']>,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<SystemPreferences> {
    return this.updateSystemPreferencesCategory(organizationId, 'regional', data, auditContext);
  }

  /**
   * Update data management settings
   */
  async updateDataManagementSettings(
    organizationId: string,
    data: Partial<SystemPreferences['dataManagement']>,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<SystemPreferences> {
    return this.updateSystemPreferencesCategory(organizationId, 'dataManagement', data, auditContext);
  }

  /**
   * Update performance settings
   */
  async updatePerformanceSettings(
    organizationId: string,
    data: Partial<SystemPreferences['performance']>,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<SystemPreferences> {
    return this.updateSystemPreferencesCategory(organizationId, 'performance', data, auditContext);
  }

  /**
   * Update API settings
   */
  async updateApiSettings(
    organizationId: string,
    data: Partial<SystemPreferences['apiSettings']>,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<SystemPreferences> {
    return this.updateSystemPreferencesCategory(organizationId, 'apiSettings', data, auditContext);
  }

  /**
   * Update integration settings
   */
  async updateIntegrationSettings(
    organizationId: string,
    data: Partial<SystemPreferences['integrations']>,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<SystemPreferences> {
    return this.updateSystemPreferencesCategory(organizationId, 'integrations', data, auditContext);
  }

  /**
   * Update feature flags
   */
  async updateFeatureFlags(
    organizationId: string,
    data: Partial<SystemPreferences['featureFlags']>,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<SystemPreferences> {
    return this.updateSystemPreferencesCategory(organizationId, 'featureFlags', data, auditContext);
  }

  /**
   * Update logging settings
   */
  async updateLoggingSettings(
    organizationId: string,
    data: Partial<SystemPreferences['logging']>,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<SystemPreferences> {
    return this.updateSystemPreferencesCategory(organizationId, 'logging', data, auditContext);
  }

  /**
   * Helper: Update specific category of system preferences
   */
  private async updateSystemPreferencesCategory(
    organizationId: string,
    category: keyof Omit<SystemPreferences, 'id' | 'organizationId' | 'createdAt' | 'updatedAt'>,
    data: any,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<SystemPreferences> {
    // Get current preferences
    const currentPrefs = await this.getSystemPreferences(organizationId);

    // Get existing organization settings
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { settings: true }
    });

    if (!org) {
      throw new Error('Organization not found');
    }

    // Parse existing settings
    let existingSettings: any = {};
    if (org.settings) {
      try {
        existingSettings = JSON.parse(org.settings);
      } catch (e) {
        // Invalid JSON, start fresh
      }
    }

    // Ensure systemPreferences object exists
    if (!existingSettings.systemPreferences) {
      existingSettings.systemPreferences = {};
    }

    // Update the specific category
    existingSettings.systemPreferences[category] = {
      ...currentPrefs[category],
      ...data
    };

    // Update organization settings
    const updatedOrg = await prisma.organization.update({
      where: { id: organizationId },
      data: {
        settings: JSON.stringify(existingSettings),
        updatedAt: new Date()
      }
    });

    // Audit log
    await auditService.logUpdate(
      'Organization',
      organizationId,
      { systemPreferences: { [category]: currentPrefs[category] } },
      { systemPreferences: { [category]: existingSettings.systemPreferences[category] } },
      {
        organizationId,
        userId: auditContext.userId,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent
      }
    );

    // Return updated preferences
    return this.getSystemPreferences(organizationId);
  }

  /**
   * Helper: Create default preferences for new organization
   */
  private async createDefaultPreferences(organizationId: string): Promise<SystemPreferences> {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { settings: true, name: true }
    });

    if (!org) {
      throw new Error('Organization not found');
    }

    // Parse existing settings or start fresh
    let existingSettings: any = {};
    if (org.settings) {
      try {
        existingSettings = JSON.parse(org.settings);
      } catch (e) {
        // Invalid JSON, start fresh
      }
    }

    // Create default system preferences
    existingSettings.systemPreferences = {
      general: {
        systemName: org.name,
        systemVersion: '1.0.0',
        environment: 'production',
        defaultUserRole: 'EMPLOYEE',
        maintenanceMode: false
      },
      regional: {
        timezone: 'America/Toronto',
        language: 'en',
        country: 'CA',
        currency: 'CAD',
        dateFormat: 'YYYY-MM-DD',
        timeFormat: '24h',
        numberFormat: 'en-CA',
        fiscalYearStart: '01-01'
      },
      dataManagement: {
        backupEnabled: true,
        backupFrequency: 'daily',
        retentionDays: 90,
        autoExportEnabled: false,
        maxFileUploadSize: 10,
        allowedFileTypes: ['pdf', 'jpg', 'jpeg', 'png', 'xlsx', 'csv', 'docx']
      },
      performance: {
        cachingEnabled: true,
        cacheExpiryMinutes: 60,
        optimizationsEnabled: true,
        cdnEnabled: false,
        maxConcurrentUsers: 100,
        rateLimitEnabled: true,
        rateLimitPerMinute: 60
      },
      apiSettings: {
        apiKeysEnabled: true,
        webhooksEnabled: true,
        rateLimitPerMinute: 60,
        maxWebhooksPerOrg: 10,
        webhookRetryAttempts: 3
      },
      integrations: {
        quickbooksEnabled: false,
        stripeEnabled: false,
        twilioEnabled: false,
        sendgridEnabled: false,
        slackEnabled: false,
        oauthProvidersEnabled: []
      },
      featureFlags: {
        betaFeaturesEnabled: false,
        experimentalFeaturesEnabled: false,
        newDashboardEnabled: false,
        advancedReportsEnabled: false,
        aiAssistantEnabled: false,
        mobileAppEnabled: false
      },
      logging: {
        logLevel: 'info',
        auditLoggingEnabled: true,
        errorTrackingEnabled: true,
        performanceMonitoringEnabled: false,
        logRetentionDays: 90
      }
    };

    // Update organization with defaults
    await prisma.organization.update({
      where: { id: organizationId },
      data: {
        settings: JSON.stringify(existingSettings),
        updatedAt: new Date()
      }
    });

    return this.getSystemPreferences(organizationId);
  }

  // ==================== NOTIFICATION SETTINGS METHODS ====================

  /**
   * Get all notification settings (with defaults if not exist)
   */
  async getNotificationSettings(organizationId: string): Promise<NotificationSettings> {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { settings: true, name: true, createdAt: true, updatedAt: true }
    });

    if (!org) {
      throw new Error('Organization not found');
    }

    // Parse existing settings or use defaults
    let notificationSettings: any = {};
    if (org.settings) {
      try {
        const parsed = JSON.parse(org.settings);
        notificationSettings = parsed.notificationSettings || {};
      } catch (e) {
        // Invalid JSON, use defaults
      }
    }

    // Return with defaults for missing fields
    return {
      id: organizationId,
      organizationId,
      email: notificationSettings.email || {
        enabled: true,
        smtpSecure: true,
        senderEmail: `noreply@${org.name.toLowerCase().replace(/\s+/g, '')}.com`,
        senderName: org.name,
        notificationTypes: {
          invoiceCreated: true,
          invoicePaid: true,
          invoiceOverdue: true,
          paymentReceived: true,
          quoteCreated: true,
          quoteClosed: true,
          appointmentScheduled: true,
          appointmentReminder: true,
          projectUpdated: true,
          userInvitation: true,
          passwordReset: true,
          systemAlerts: false
        }
      },
      sms: notificationSettings.sms || {
        enabled: false,
        provider: null,
        monthlyCostLimit: 100,
        notificationTypes: {
          invoiceOverdue: false,
          paymentReceived: false,
          appointmentReminder: false,
          criticalAlerts: true
        }
      },
      push: notificationSettings.push || {
        enabled: false,
        webPushEnabled: false,
        mobilePushEnabled: false,
        notificationTypes: {
          invoiceCreated: false,
          paymentReceived: false,
          appointmentReminder: false,
          projectUpdated: false,
          systemAlerts: false
        }
      },
      inApp: notificationSettings.inApp || {
        enabled: true,
        showBadges: true,
        soundEnabled: false,
        retentionDays: 30,
        notificationTypes: {
          invoiceCreated: true,
          invoicePaid: true,
          paymentReceived: true,
          quoteCreated: true,
          appointmentScheduled: true,
          projectUpdated: true,
          userMentioned: true,
          systemAlerts: true
        }
      },
      webhooks: notificationSettings.webhooks || {
        enabled: false,
        endpoints: [],
        retryAttempts: 3,
        retryDelaySeconds: 60,
        timeoutSeconds: 30
      },
      preferences: notificationSettings.preferences || {
        quietHoursEnabled: false,
        digestEnabled: false,
        digestFrequency: 'daily',
        batchingEnabled: false
      },
      createdAt: org.createdAt.toISOString(),
      updatedAt: org.updatedAt.toISOString()
    };
  }

  /**
   * Update email notification settings
   */
  async updateEmailNotificationSettings(
    organizationId: string,
    data: Partial<NotificationSettings['email']>,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<NotificationSettings> {
    return this.updateNotificationSettingsCategory(organizationId, 'email', data, auditContext);
  }

  /**
   * Update SMS notification settings
   */
  async updateSmsNotificationSettings(
    organizationId: string,
    data: Partial<NotificationSettings['sms']>,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<NotificationSettings> {
    return this.updateNotificationSettingsCategory(organizationId, 'sms', data, auditContext);
  }

  /**
   * Update push notification settings
   */
  async updatePushNotificationSettings(
    organizationId: string,
    data: Partial<NotificationSettings['push']>,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<NotificationSettings> {
    return this.updateNotificationSettingsCategory(organizationId, 'push', data, auditContext);
  }

  /**
   * Update in-app notification settings
   */
  async updateInAppNotificationSettings(
    organizationId: string,
    data: Partial<NotificationSettings['inApp']>,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<NotificationSettings> {
    return this.updateNotificationSettingsCategory(organizationId, 'inApp', data, auditContext);
  }

  /**
   * Update webhook notification settings
   */
  async updateWebhookNotificationSettings(
    organizationId: string,
    data: Partial<NotificationSettings['webhooks']>,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<NotificationSettings> {
    return this.updateNotificationSettingsCategory(organizationId, 'webhooks', data, auditContext);
  }

  /**
   * Update notification preferences
   */
  async updateNotificationPreferences(
    organizationId: string,
    data: Partial<NotificationSettings['preferences']>,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<NotificationSettings> {
    return this.updateNotificationSettingsCategory(organizationId, 'preferences', data, auditContext);
  }

  /**
   * Test notification configuration
   */
  async testNotificationConfiguration(
    organizationId: string,
    type: 'email' | 'sms' | 'push',
    recipientAddress: string,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<{ success: boolean; message: string }> {
    // Get current notification settings
    const settings = await this.getNotificationSettings(organizationId);

    // Validate configuration based on type
    if (type === 'email') {
      if (!settings.email.enabled) {
        return { success: false, message: 'Email notifications are disabled' };
      }
      if (!settings.email.senderEmail) {
        return { success: false, message: 'Sender email is not configured' };
      }
      // In a real implementation, would send test email here
      // For now, validate configuration is complete
      if (settings.email.smtpHost && settings.email.smtpPort) {
        return { success: true, message: `Test email would be sent to ${recipientAddress} via SMTP ${settings.email.smtpHost}:${settings.email.smtpPort}` };
      }
      return { success: true, message: `Email configuration validated. Test email would be sent to ${recipientAddress}` };
    }

    if (type === 'sms') {
      if (!settings.sms.enabled) {
        return { success: false, message: 'SMS notifications are disabled' };
      }
      if (!settings.sms.provider) {
        return { success: false, message: 'SMS provider is not configured' };
      }
      if (!settings.sms.accountSid || !settings.sms.authToken) {
        return { success: false, message: 'SMS credentials are not configured' };
      }
      if (!settings.sms.fromPhoneNumber) {
        return { success: false, message: 'SMS sender phone number is not configured' };
      }
      return { success: true, message: `Test SMS would be sent to ${recipientAddress} via ${settings.sms.provider}` };
    }

    if (type === 'push') {
      if (!settings.push.enabled) {
        return { success: false, message: 'Push notifications are disabled' };
      }
      if (!settings.push.webPushEnabled && !settings.push.mobilePushEnabled) {
        return { success: false, message: 'Both web and mobile push are disabled' };
      }
      return { success: true, message: `Push notification configuration validated for ${recipientAddress}` };
    }

    return { success: false, message: 'Invalid notification type' };
  }

  /**
   * Helper: Update specific category of notification settings
   */
  private async updateNotificationSettingsCategory(
    organizationId: string,
    category: keyof Omit<NotificationSettings, 'id' | 'organizationId' | 'createdAt' | 'updatedAt'>,
    data: any,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<NotificationSettings> {
    // Get current settings
    const currentSettings = await this.getNotificationSettings(organizationId);

    // Get existing organization settings
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { settings: true }
    });

    if (!org) {
      throw new Error('Organization not found');
    }

    // Parse existing settings
    let existingSettings: any = {};
    if (org.settings) {
      try {
        existingSettings = JSON.parse(org.settings);
      } catch (e) {
        // Invalid JSON, start fresh
      }
    }

    // Ensure notificationSettings object exists
    if (!existingSettings.notificationSettings) {
      existingSettings.notificationSettings = {};
    }

    // Update the specific category (merge with existing)
    existingSettings.notificationSettings[category] = {
      ...currentSettings[category],
      ...data
    };

    // Update organization settings
    await prisma.organization.update({
      where: { id: organizationId },
      data: {
        settings: JSON.stringify(existingSettings),
        updatedAt: new Date()
      }
    });

    // Audit log
    await auditService.logUpdate(
      'Organization',
      organizationId,
      { notificationSettings: { [category]: currentSettings[category] } },
      { notificationSettings: { [category]: existingSettings.notificationSettings[category] } },
      {
        organizationId,
        userId: auditContext.userId,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent
      }
    );

    // Return updated settings
    return this.getNotificationSettings(organizationId);
  }
}

export const organizationSettingsService = new OrganizationSettingsService();