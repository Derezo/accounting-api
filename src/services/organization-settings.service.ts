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
}

export const organizationSettingsService = new OrganizationSettingsService();