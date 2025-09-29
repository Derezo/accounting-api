import { InvoiceTemplate, InvoiceStyle, OrganizationBranding } from '@prisma/client';
import { auditService } from './audit.service';
import { prisma } from '../config/database';
import fs from 'fs/promises';
import path from 'path';

export interface CreateTemplateData {
  name: string;
  description?: string;
  templateType: 'STANDARD' | 'MINIMAL' | 'MODERN' | 'CUSTOM';
  htmlTemplate: string;
  isDefault?: boolean;
  tags?: string[];
}

export interface CreateStyleData {
  name: string;
  description?: string;
  templateId?: string;
  cssContent: string;
  colorScheme: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
  };
  fontFamily?: string;
  isDefault?: boolean;
  tags?: string[];
}

export interface TemplateFilters {
  templateType?: string;
  isDefault?: boolean;
  isSystem?: boolean;
  search?: string;
  tags?: string[];
  limit?: number;
  offset?: number;
}

export interface StyleFilters {
  templateId?: string;
  isDefault?: boolean;
  isSystem?: boolean;
  search?: string;
  tags?: string[];
  limit?: number;
  offset?: number;
}

export class InvoiceTemplateService {

  /**
   * Initialize system templates and styles for organization
   */
  async initializeSystemTemplatesAndStyles(
    organizationId: string,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<void> {
    // Check if already initialized
    const existingTemplates = await prisma.invoiceTemplate.count({
      where: { organizationId, isSystem: true }
    });

    if (existingTemplates > 0) {
      return; // Already initialized
    }

    // Create system templates
    const templates = [
      {
        name: 'Default Professional',
        description: 'Standard professional invoice template',
        templateType: 'STANDARD' as const,
        isDefault: true,
        isSystem: true,
        htmlTemplate: await this.loadSystemTemplate('default')
      },
      {
        name: 'Modern Blue',
        description: 'Modern invoice template with blue accent',
        templateType: 'MODERN' as const,
        isDefault: false,
        isSystem: true,
        htmlTemplate: await this.loadSystemTemplate('modern')
      },
      {
        name: 'Minimal Clean',
        description: 'Minimal clean invoice template',
        templateType: 'MINIMAL' as const,
        isDefault: false,
        isSystem: true,
        htmlTemplate: await this.loadSystemTemplate('minimal')
      }
    ];

    const createdTemplates: InvoiceTemplate[] = [];

    for (const template of templates) {
      const created = await prisma.invoiceTemplate.create({
        data: {
          organizationId,
          ...template,
          version: '1.0',
          tags: JSON.stringify(['system', 'professional'])
        }
      });
      createdTemplates.push(created);

      await auditService.logCreate(
        'InvoiceTemplate',
        created.id,
        created,
        {
          organizationId,
          userId: auditContext.userId,
          ipAddress: auditContext.ipAddress,
          userAgent: auditContext.userAgent
        }
      );
    }

    // Create system styles
    const styles = [
      {
        name: 'Classic Black & White',
        description: 'Professional black and white styling',
        cssContent: await this.loadSystemStyle('classic'),
        colorScheme: {
          primary: '#000000',
          secondary: '#666666',
          accent: '#333333',
          background: '#ffffff',
          text: '#000000'
        },
        isDefault: true
      },
      {
        name: 'Modern Blue',
        description: 'Modern blue theme with gradients',
        cssContent: await this.loadSystemStyle('modern-blue'),
        colorScheme: {
          primary: '#2563eb',
          secondary: '#64748b',
          accent: '#3b82f6',
          background: '#ffffff',
          text: '#1e293b'
        },
        isDefault: false
      },
      {
        name: 'Corporate Gray',
        description: 'Professional corporate gray theme',
        cssContent: await this.loadSystemStyle('corporate-gray'),
        colorScheme: {
          primary: '#374151',
          secondary: '#6b7280',
          accent: '#4b5563',
          background: '#ffffff',
          text: '#1f2937'
        },
        isDefault: false
      }
    ];

    for (const style of styles) {
      const created = await prisma.invoiceStyle.create({
        data: {
          organizationId,
          templateId: null, // Global styles
          name: style.name,
          description: style.description,
          cssContent: style.cssContent,
          colorScheme: JSON.stringify(style.colorScheme),
          fontFamily: 'Arial, sans-serif',
          isDefault: style.isDefault,
          isSystem: true,
          version: '1.0',
          tags: JSON.stringify(['system', 'professional'])
        }
      });

      await auditService.logCreate(
        'InvoiceStyle',
        created.id,
        created,
        {
          organizationId,
          userId: auditContext.userId,
          ipAddress: auditContext.ipAddress,
          userAgent: auditContext.userAgent
        }
      );
    }
  }

  /**
   * Create custom invoice template
   */
  async createTemplate(
    data: CreateTemplateData,
    organizationId: string,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<InvoiceTemplate> {
    // Check if setting as default, unset other defaults
    if (data.isDefault) {
      await prisma.invoiceTemplate.updateMany({
        where: { organizationId, isDefault: true },
        data: { isDefault: false }
      });
    }

    const template = await prisma.invoiceTemplate.create({
      data: {
        organizationId,
        name: data.name,
        description: data.description,
        templateType: data.templateType,
        htmlTemplate: data.htmlTemplate,
        isDefault: data.isDefault || false,
        isSystem: false,
        version: '1.0',
        tags: data.tags ? JSON.stringify(data.tags) : null
      }
    });

    await auditService.logCreate(
      'InvoiceTemplate',
      template.id,
      template,
      {
        organizationId,
        userId: auditContext.userId,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent
      }
    );

    return template;
  }

  /**
   * Create custom invoice style
   */
  async createStyle(
    data: CreateStyleData,
    organizationId: string,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<InvoiceStyle> {
    // Check if setting as default, unset other defaults
    if (data.isDefault) {
      await prisma.invoiceStyle.updateMany({
        where: { organizationId, isDefault: true },
        data: { isDefault: false }
      });
    }

    const style = await prisma.invoiceStyle.create({
      data: {
        organizationId,
        templateId: data.templateId || null,
        name: data.name,
        description: data.description,
        cssContent: data.cssContent,
        colorScheme: JSON.stringify(data.colorScheme),
        fontFamily: data.fontFamily || 'Arial, sans-serif',
        isDefault: data.isDefault || false,
        isSystem: false,
        version: '1.0',
        tags: data.tags ? JSON.stringify(data.tags) : null
      }
    });

    await auditService.logCreate(
      'InvoiceStyle',
      style.id,
      style,
      {
        organizationId,
        userId: auditContext.userId,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent
      }
    );

    return style;
  }

  /**
   * Get templates for organization
   */
  async getTemplates(
    organizationId: string,
    filters: TemplateFilters = {}
  ): Promise<{ templates: InvoiceTemplate[]; total: number }> {
    const where: any = { organizationId, deletedAt: null };

    if (filters.templateType) {
      where.templateType = filters.templateType;
    }

    if (filters.isDefault !== undefined) {
      where.isDefault = filters.isDefault;
    }

    if (filters.isSystem !== undefined) {
      where.isSystem = filters.isSystem;
    }

    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search } },
        { description: { contains: filters.search } }
      ];
    }

    if (filters.tags && filters.tags.length > 0) {
      where.tags = {
        contains: filters.tags[0] // Simple tag search
      };
    }

    const [templates, total] = await Promise.all([
      prisma.invoiceTemplate.findMany({
        where,
        orderBy: [
          { isDefault: 'desc' },
          { isSystem: 'desc' },
          { createdAt: 'desc' }
        ],
        take: filters.limit || 50,
        skip: filters.offset || 0,
        include: {
          invoiceStyles: {
            where: { deletedAt: null },
            take: 5
          }
        }
      }),
      prisma.invoiceTemplate.count({ where })
    ]);

    return { templates, total };
  }

  /**
   * Get styles for organization
   */
  async getStyles(
    organizationId: string,
    filters: StyleFilters = {}
  ): Promise<{ styles: InvoiceStyle[]; total: number }> {
    const where: any = { organizationId, deletedAt: null };

    if (filters.templateId) {
      where.templateId = filters.templateId;
    }

    if (filters.isDefault !== undefined) {
      where.isDefault = filters.isDefault;
    }

    if (filters.isSystem !== undefined) {
      where.isSystem = filters.isSystem;
    }

    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search } },
        { description: { contains: filters.search } }
      ];
    }

    if (filters.tags && filters.tags.length > 0) {
      where.tags = {
        contains: filters.tags[0]
      };
    }

    const [styles, total] = await Promise.all([
      prisma.invoiceStyle.findMany({
        where,
        orderBy: [
          { isDefault: 'desc' },
          { isSystem: 'desc' },
          { createdAt: 'desc' }
        ],
        take: filters.limit || 50,
        skip: filters.offset || 0,
        include: {
          template: {
            select: { id: true, name: true, templateType: true }
          }
        }
      }),
      prisma.invoiceStyle.count({ where })
    ]);

    return { styles, total };
  }

  /**
   * Get template by ID
   */
  async getTemplate(
    id: string,
    organizationId: string
  ): Promise<InvoiceTemplate | null> {
    return await prisma.invoiceTemplate.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: {
        invoiceStyles: {
          where: { deletedAt: null }
        }
      }
    });
  }

  /**
   * Get style by ID
   */
  async getStyle(
    id: string,
    organizationId: string
  ): Promise<InvoiceStyle | null> {
    return await prisma.invoiceStyle.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: {
        template: {
          select: { id: true, name: true, templateType: true }
        }
      }
    });
  }

  /**
   * Update template
   */
  async updateTemplate(
    id: string,
    data: Partial<CreateTemplateData>,
    organizationId: string,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<InvoiceTemplate> {
    const existingTemplate = await prisma.invoiceTemplate.findFirst({
      where: { id, organizationId, deletedAt: null }
    });

    if (!existingTemplate) {
      throw new Error('Template not found');
    }

    if (existingTemplate.isSystem) {
      throw new Error('Cannot modify system templates');
    }

    // Handle default setting
    if (data.isDefault) {
      await prisma.invoiceTemplate.updateMany({
        where: { organizationId, isDefault: true, id: { not: id } },
        data: { isDefault: false }
      });
    }

    const updatedTemplate = await prisma.invoiceTemplate.update({
      where: { id },
      data: {
        ...data,
        tags: data.tags ? JSON.stringify(data.tags) : undefined,
        updatedAt: new Date()
      }
    });

    await auditService.logUpdate(
      'InvoiceTemplate',
      id,
      existingTemplate,
      updatedTemplate,
      {
        organizationId,
        userId: auditContext.userId,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent
      }
    );

    return updatedTemplate;
  }

  /**
   * Update style
   */
  async updateStyle(
    id: string,
    data: Partial<CreateStyleData>,
    organizationId: string,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<InvoiceStyle> {
    const existingStyle = await prisma.invoiceStyle.findFirst({
      where: { id, organizationId, deletedAt: null }
    });

    if (!existingStyle) {
      throw new Error('Style not found');
    }

    if (existingStyle.isSystem) {
      throw new Error('Cannot modify system styles');
    }

    // Handle default setting
    if (data.isDefault) {
      await prisma.invoiceStyle.updateMany({
        where: { organizationId, isDefault: true, id: { not: id } },
        data: { isDefault: false }
      });
    }

    const updatedStyle = await prisma.invoiceStyle.update({
      where: { id },
      data: {
        ...data,
        colorScheme: data.colorScheme ? JSON.stringify(data.colorScheme) : undefined,
        tags: data.tags ? JSON.stringify(data.tags) : undefined,
        updatedAt: new Date()
      }
    });

    await auditService.logUpdate(
      'InvoiceStyle',
      id,
      existingStyle,
      updatedStyle,
      {
        organizationId,
        userId: auditContext.userId,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent
      }
    );

    return updatedStyle;
  }

  /**
   * Delete template (soft delete)
   */
  async deleteTemplate(
    id: string,
    organizationId: string,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<void> {
    const template = await prisma.invoiceTemplate.findFirst({
      where: { id, organizationId, deletedAt: null }
    });

    if (!template) {
      throw new Error('Template not found');
    }

    if (template.isSystem) {
      throw new Error('Cannot delete system templates');
    }

    if (template.isDefault) {
      throw new Error('Cannot delete default template. Set another template as default first.');
    }

    await prisma.invoiceTemplate.update({
      where: { id },
      data: { deletedAt: new Date() }
    });

    await auditService.logDelete(
      'InvoiceTemplate',
      id,
      template,
      {
        organizationId,
        userId: auditContext.userId,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent
      }
    );
  }

  /**
   * Delete style (soft delete)
   */
  async deleteStyle(
    id: string,
    organizationId: string,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<void> {
    const style = await prisma.invoiceStyle.findFirst({
      where: { id, organizationId, deletedAt: null }
    });

    if (!style) {
      throw new Error('Style not found');
    }

    if (style.isSystem) {
      throw new Error('Cannot delete system styles');
    }

    if (style.isDefault) {
      throw new Error('Cannot delete default style. Set another style as default first.');
    }

    await prisma.invoiceStyle.update({
      where: { id },
      data: { deletedAt: new Date() }
    });

    await auditService.logDelete(
      'InvoiceStyle',
      id,
      style,
      {
        organizationId,
        userId: auditContext.userId,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent
      }
    );
  }

  /**
   * Load system template from file
   */
  private async loadSystemTemplate(templateName: string): Promise<string> {
    try {
      const templatePath = path.join(process.cwd(), 'src', 'templates', 'invoice', `${templateName}.hbs`);
      return await fs.readFile(templatePath, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to load system template: ${templateName}`);
    }
  }

  /**
   * Load system style from file
   */
  private async loadSystemStyle(styleName: string): Promise<string> {
    try {
      const stylePath = path.join(process.cwd(), 'src', 'templates', 'styles', `${styleName}.css`);
      return await fs.readFile(stylePath, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to load system style: ${styleName}`);
    }
  }
}

export const invoiceTemplateService = new InvoiceTemplateService();