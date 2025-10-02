import { Request, Response } from 'express';
import { invoicePDFService } from '../services/invoice-pdf.service';
import { invoiceTemplateService } from '../services/invoice-template.service';
import { getOrganizationIdFromRequest } from '../middleware/organization.middleware';
import { successResponse, errorResponse } from '../utils/response';
import { logger } from '../utils/logger';

export class InvoicePDFController {

  /**
   * @route   GET /api/v1/organizations/:organizationId/invoices/:id/pdf
   * @desc    Generate and download invoice PDF
   * @access  Private (Admin, Manager, Accountant, Employee, Viewer)
   */
  async generateInvoicePDF(req: Request, res: Response): Promise<void> {
    try {
      const organizationId = getOrganizationIdFromRequest(req);
      const { id: invoiceId } = req.params;
      const {
        templateId,
        styleId,
        format = 'A4',
        orientation = 'portrait',
        regenerate = false
      } = req.query;

      const auditContext = {
        userId: req.user?.id || '',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      };

      // Check if regeneration is requested
      if (regenerate === 'true') {
        // Delete existing PDFs for this invoice/template/style combination
        await this.deletePreviousPDFs(invoiceId, templateId as string, styleId as string, organizationId);
      }

      const options = {
        templateId: templateId as string,
        styleId: styleId as string,
        format: format as 'A4' | 'Letter',
        orientation: orientation as 'portrait' | 'landscape',
        includeBackground: true
      };

      const generatedPDF = await invoicePDFService.generateInvoicePDF(
        invoiceId,
        organizationId,
        options,
        auditContext
      );

      if (generatedPDF.status === 'FAILED') {
        res.status(500).json(errorResponse('PDF generation failed', {
          error: generatedPDF.errorMessage
        }));
        return;
      }

      // Get PDF buffer for download
      const pdfBuffer = await invoicePDFService.getPDFBuffer(generatedPDF.id, organizationId);

      // Set headers for PDF download
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${generatedPDF.filename}"`);
      res.setHeader('Content-Length', pdfBuffer.length);
      res.setHeader('Cache-Control', 'private, no-cache');

      res.send(pdfBuffer);

    } catch (error) {
      logger.error('PDF generation failed:', error);
      let statusCode = 500;
      if (error instanceof Error) {
        // Check for forbidden/access errors FIRST (most specific for multi-tenant)
        if (error.message.includes('Access denied') || error.message.includes('belongs to a different organization')) {
          statusCode = 403;
        }
        // Then check for 404 errors
        else if (error.message.includes('not found') || error.message.includes('does not exist')) {
          statusCode = 404;
        }
        // Finally check for validation errors
        else if (error.message.includes('Invalid') || error.message.includes('validation')) {
          statusCode = 400;
        }
      }
      res.status(statusCode).json(errorResponse(
        error instanceof Error ? error.message : 'PDF generation failed'
      ));
    }
  }

  /**
   * @route   POST /api/v1/organizations/:organizationId/invoices/:id/pdf/regenerate
   * @desc    Force regenerate invoice PDF with new settings
   * @access  Private (Admin, Manager, Accountant, Employee)
   */
  async regenerateInvoicePDF(req: Request, res: Response): Promise<void> {
    try {
      const organizationId = getOrganizationIdFromRequest(req);
      const { id: invoiceId } = req.params;
      const { templateId, styleId, format = 'A4', orientation = 'portrait' } = req.body;

      const auditContext = {
        userId: req.user?.id || '',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      };

      // Delete existing PDFs
      await this.deletePreviousPDFs(invoiceId, templateId, styleId, organizationId);

      const options = {
        templateId,
        styleId,
        format: format as 'A4' | 'Letter',
        orientation: orientation as 'portrait' | 'landscape',
        includeBackground: true
      };

      const generatedPDF = await invoicePDFService.generateInvoicePDF(
        invoiceId,
        organizationId,
        options,
        auditContext
      );

      res.status(201).json(successResponse('PDF regenerated successfully', {
        pdf: {
          id: generatedPDF.id,
          filename: generatedPDF.filename,
          fileSize: generatedPDF.fileSize,
          status: generatedPDF.status,
          createdAt: generatedPDF.createdAt
        }
      }));

    } catch (error) {
      logger.error('PDF regeneration failed:', error);
      res.status(500).json(errorResponse(
        error instanceof Error ? error.message : 'PDF regeneration failed'
      ));
    }
  }

  /**
   * @route   GET /api/v1/organizations/:organizationId/invoices/:id/pdf/status
   * @desc    Get PDF generation status and metadata
   * @access  Private (Admin, Manager, Accountant, Employee, Viewer)
   */
  async getInvoicePDFStatus(req: Request, res: Response): Promise<void> {
    try {
      const organizationId = getOrganizationIdFromRequest(req);
      const { id: invoiceId } = req.params;
      const { templateId, styleId } = req.query;

      const whereClause: any = {
        invoiceId,
        organizationId
      };

      if (templateId) whereClause.templateId = templateId;
      if (styleId) whereClause.styleId = styleId;

      const pdfs = await this.getPDFHistory(whereClause);

      res.json(successResponse('PDF status retrieved', {
        pdfs: pdfs.map(pdf => ({
          id: pdf.id,
          filename: pdf.filename,
          fileSize: pdf.fileSize,
          status: pdf.status,
          templateId: pdf.templateId,
          styleId: pdf.styleId,
          createdAt: pdf.createdAt,
          errorMessage: pdf.errorMessage
        }))
      }));

    } catch (error) {
      logger.error('Failed to get PDF status:', error);
      res.status(500).json(errorResponse(
        error instanceof Error ? error.message : 'Failed to retrieve PDF status'
      ));
    }
  }

  /**
   * @route   GET /api/v1/organizations/:organizationId/invoice-templates
   * @desc    Get available invoice templates
   * @access  Private (Admin, Manager, Accountant, Employee, Viewer)
   */
  async getInvoiceTemplates(req: Request, res: Response): Promise<void> {
    try {
      const organizationId = getOrganizationIdFromRequest(req);
      const {
        templateType,
        isSystem,
        search,
        limit = 50,
        offset = 0
      } = req.query;

      const filters = {
        templateType: templateType as string,
        isSystem: isSystem === 'true' ? true : isSystem === 'false' ? false : undefined,
        search: search as string,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string)
      };

      const { templates, total } = await invoiceTemplateService.getTemplates(organizationId, filters);

      res.json(successResponse('Templates retrieved successfully', {
        templates: templates.map(template => ({
          id: template.id,
          name: template.name,
          description: template.description,
          templateType: template.templateType,
          isDefault: template.isDefault,
          isSystem: template.isSystem,
          version: template.version,
          createdAt: template.createdAt,
          updatedAt: template.updatedAt,
          stylesCount: 0 // Will be populated by service if needed
        })),
        pagination: {
          total,
          limit: filters.limit,
          offset: filters.offset,
          pages: Math.ceil(total / filters.limit)
        }
      }));

    } catch (error) {
      logger.error('Failed to get templates:', error);
      res.status(500).json(errorResponse(
        error instanceof Error ? error.message : 'Failed to retrieve templates'
      ));
    }
  }

  /**
   * @route   GET /api/v1/organizations/:organizationId/invoice-styles
   * @desc    Get available invoice styles
   * @access  Private (Admin, Manager, Accountant, Employee, Viewer)
   */
  async getInvoiceStyles(req: Request, res: Response): Promise<void> {
    try {
      const organizationId = getOrganizationIdFromRequest(req);
      const {
        templateId,
        isSystem,
        search,
        limit = 50,
        offset = 0
      } = req.query;

      const filters = {
        templateId: templateId as string,
        isSystem: isSystem === 'true' ? true : isSystem === 'false' ? false : undefined,
        search: search as string,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string)
      };

      const { styles, total } = await invoiceTemplateService.getStyles(organizationId, filters);

      res.json(successResponse('Styles retrieved successfully', {
        styles: styles.map(style => ({
          id: style.id,
          name: style.name,
          description: style.description,
          templateId: style.templateId,
          colorScheme: style.colorScheme ? JSON.parse(style.colorScheme) : null,
          fontFamily: style.fontFamily,
          isDefault: style.isDefault,
          isSystem: style.isSystem,
          version: style.version,
          createdAt: style.createdAt,
          updatedAt: style.updatedAt
        })),
        pagination: {
          total,
          limit: filters.limit,
          offset: filters.offset,
          pages: Math.ceil(total / filters.limit)
        }
      }));

    } catch (error) {
      logger.error('Failed to get styles:', error);
      res.status(500).json(errorResponse(
        error instanceof Error ? error.message : 'Failed to retrieve styles'
      ));
    }
  }

  /**
   * @route   POST /api/v1/organizations/:organizationId/invoice-templates
   * @desc    Create custom invoice template
   * @access  Private (Admin, Manager)
   */
  async createInvoiceTemplate(req: Request, res: Response): Promise<void> {
    try {
      const organizationId = getOrganizationIdFromRequest(req);
      const { name, description, templateType, htmlTemplate, isDefault, tags } = req.body;

      const auditContext = {
        userId: req.user?.id || '',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      };

      const template = await invoiceTemplateService.createTemplate({
        name,
        description,
        templateType,
        htmlTemplate,
        isDefault,
        tags
      }, organizationId, auditContext);

      res.status(201).json(successResponse('Template created successfully', {
        template: {
          id: template.id,
          name: template.name,
          description: template.description,
          templateType: template.templateType,
          isDefault: template.isDefault,
          isSystem: template.isSystem,
          version: template.version,
          createdAt: template.createdAt
        }
      }));

    } catch (error) {
      logger.error('Failed to create template:', error);
      res.status(500).json(errorResponse(
        error instanceof Error ? error.message : 'Failed to create template'
      ));
    }
  }

  /**
   * @route   POST /api/v1/organizations/:organizationId/invoice-styles
   * @desc    Create custom invoice style
   * @access  Private (Admin, Manager)
   */
  async createInvoiceStyle(req: Request, res: Response): Promise<void> {
    try {
      const organizationId = getOrganizationIdFromRequest(req);
      const {
        name,
        description,
        templateId,
        cssContent,
        colorScheme,
        fontFamily,
        isDefault,
        tags
      } = req.body;

      const auditContext = {
        userId: req.user?.id || '',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      };

      const style = await invoiceTemplateService.createStyle({
        name,
        description,
        templateId,
        cssContent,
        colorScheme,
        fontFamily,
        isDefault,
        tags
      }, organizationId, auditContext);

      res.status(201).json(successResponse('Style created successfully', {
        style: {
          id: style.id,
          name: style.name,
          description: style.description,
          templateId: style.templateId,
          colorScheme: JSON.parse(style.colorScheme),
          fontFamily: style.fontFamily,
          isDefault: style.isDefault,
          isSystem: style.isSystem,
          version: style.version,
          createdAt: style.createdAt
        }
      }));

    } catch (error) {
      logger.error('Failed to create style:', error);
      res.status(500).json(errorResponse(
        error instanceof Error ? error.message : 'Failed to create style'
      ));
    }
  }

  /**
   * @route   PUT /api/v1/organizations/:organizationId/invoice-templates/:templateId
   * @desc    Update invoice template
   * @access  Private (Admin, Manager)
   */
  async updateInvoiceTemplate(req: Request, res: Response): Promise<void> {
    try {
      const organizationId = getOrganizationIdFromRequest(req);
      const { templateId } = req.params;
      const { name, description, templateType, htmlTemplate, isDefault, tags } = req.body;

      const auditContext = {
        userId: req.user?.id || '',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      };

      const template = await invoiceTemplateService.updateTemplate(
        templateId,
        { name, description, templateType, htmlTemplate, isDefault, tags },
        organizationId,
        auditContext
      );

      res.json(successResponse('Template updated successfully', {
        template: {
          id: template.id,
          name: template.name,
          description: template.description,
          templateType: template.templateType,
          isDefault: template.isDefault,
          version: template.version,
          updatedAt: template.updatedAt
        }
      }));

    } catch (error) {
      logger.error('Failed to update template:', error);
      let statusCode = 500;
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          statusCode = 404;
        } else if (error.message.includes('Cannot') || error.message.includes('system template')) {
          statusCode = 400;
        }
      }
      res.status(statusCode).json(errorResponse(
        error instanceof Error ? error.message : 'Failed to update template'
      ));
    }
  }

  /**
   * @route   DELETE /api/v1/organizations/:organizationId/invoice-templates/:templateId
   * @desc    Delete invoice template
   * @access  Private (Admin)
   */
  async deleteInvoiceTemplate(req: Request, res: Response): Promise<void> {
    try {
      const organizationId = getOrganizationIdFromRequest(req);
      const { templateId } = req.params;

      const auditContext = {
        userId: req.user?.id || '',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      };

      await invoiceTemplateService.deleteTemplate(templateId, organizationId, auditContext);

      res.json(successResponse('Template deleted successfully'));

    } catch (error) {
      logger.error('Failed to delete template:', error);
      let statusCode = 500;
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          statusCode = 404;
        } else if (error.message.includes('Cannot') || error.message.includes('system template')) {
          statusCode = 400;
        }
      }
      res.status(statusCode).json(errorResponse(
        error instanceof Error ? error.message : 'Failed to delete template'
      ));
    }
  }

  /**
   * @route   POST /api/v1/organizations/:organizationId/invoice-templates/:templateId/duplicate
   * @desc    Duplicate invoice template
   * @access  Private (Admin, Manager)
   */
  async duplicateInvoiceTemplate(req: Request, res: Response): Promise<void> {
    try {
      const organizationId = getOrganizationIdFromRequest(req);
      const { templateId } = req.params;
      const { name } = req.body;

      const auditContext = {
        userId: req.user?.id || '',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      };

      const duplicatedTemplate = await invoiceTemplateService.duplicateTemplate(
        templateId,
        organizationId,
        name,
        auditContext
      );

      res.status(201).json(successResponse('Template duplicated successfully', {
        template: {
          id: duplicatedTemplate.id,
          name: duplicatedTemplate.name,
          description: duplicatedTemplate.description,
          templateType: duplicatedTemplate.templateType,
          isDefault: duplicatedTemplate.isDefault,
          version: duplicatedTemplate.version,
          createdAt: duplicatedTemplate.createdAt
        }
      }));

    } catch (error) {
      logger.error('Failed to duplicate template:', error);
      const statusCode = error instanceof Error && error.message.includes('not found') ? 404 : 500;
      res.status(statusCode).json(errorResponse(
        error instanceof Error ? error.message : 'Failed to duplicate template'
      ));
    }
  }

  /**
   * @route   PUT /api/v1/organizations/:organizationId/invoice-templates/:templateId/set-default
   * @desc    Set invoice template as default
   * @access  Private (Admin, Manager)
   */
  async setDefaultInvoiceTemplate(req: Request, res: Response): Promise<void> {
    try {
      const organizationId = getOrganizationIdFromRequest(req);
      const { templateId } = req.params;

      const auditContext = {
        userId: req.user?.id || '',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      };

      const template = await invoiceTemplateService.setDefaultTemplate(
        templateId,
        organizationId,
        auditContext
      );

      res.json(successResponse('Template set as default successfully', {
        template: {
          id: template.id,
          name: template.name,
          isDefault: template.isDefault,
          updatedAt: template.updatedAt
        }
      }));

    } catch (error) {
      logger.error('Failed to set default template:', error);
      const statusCode = error instanceof Error && error.message.includes('not found') ? 404 : 500;
      res.status(statusCode).json(errorResponse(
        error instanceof Error ? error.message : 'Failed to set default template'
      ));
    }
  }

  /**
   * @route   GET /api/v1/organizations/:organizationId/invoice-templates/:id
   * @desc    Get single invoice template by ID
   * @access  Private (Admin, Manager, Accountant, Employee, Viewer)
   */
  async getInvoiceTemplate(req: Request, res: Response): Promise<void> {
    try {
      const organizationId = getOrganizationIdFromRequest(req);
      const { id } = req.params;

      const template = await invoiceTemplateService.getTemplate(id, organizationId);

      if (!template) {
        res.status(404).json(errorResponse('Template not found'));
        return;
      }

      res.json(successResponse('Template retrieved successfully', {
        template: {
          id: template.id,
          name: template.name,
          description: template.description,
          templateType: template.templateType,
          htmlTemplate: template.htmlTemplate,
          isDefault: template.isDefault,
          isSystem: template.isSystem,
          version: template.version,
          tags: template.tags ? JSON.parse(template.tags) : [],
          previewUrl: template.previewUrl,
          createdAt: template.createdAt,
          updatedAt: template.updatedAt,
          styles: (template as any).invoiceStyles?.map((style: any) => ({
            id: style.id,
            name: style.name,
            description: style.description,
            isDefault: style.isDefault,
            isSystem: style.isSystem
          })) || []
        }
      }));

    } catch (error) {
      logger.error('Failed to get template:', error);
      res.status(500).json(errorResponse(
        error instanceof Error ? error.message : 'Failed to retrieve template'
      ));
    }
  }

  /**
   * @route   POST /api/v1/organizations/:organizationId/invoice-templates/preview
   * @desc    Preview invoice template with sample data
   * @access  Private (Admin, Manager, Accountant, Employee, Viewer)
   */
  async previewInvoiceTemplate(req: Request, res: Response): Promise<void> {
    try {
      const organizationId = getOrganizationIdFromRequest(req);
      const { templateId, styleId } = req.body;

      // Generate preview with sample invoice data
      const previewHTML = await invoiceTemplateService.generatePreview(
        templateId,
        styleId || undefined,
        organizationId
      );

      res.setHeader('Content-Type', 'text/html');
      res.send(previewHTML);

    } catch (error) {
      logger.error('Failed to generate template preview:', error);
      const statusCode = error instanceof Error && error.message.includes('not found') ? 404 : 500;
      res.status(statusCode).json(errorResponse(
        error instanceof Error ? error.message : 'Failed to generate template preview'
      ));
    }
  }

  /**
   * @route   GET /api/v1/organizations/:organizationId/invoice-styles/:id
   * @desc    Get single invoice style by ID
   * @access  Private (Admin, Manager, Accountant, Employee, Viewer)
   */
  async getInvoiceStyle(req: Request, res: Response): Promise<void> {
    try {
      const organizationId = getOrganizationIdFromRequest(req);
      const { id } = req.params;

      const style = await invoiceTemplateService.getStyle(id, organizationId);

      if (!style) {
        res.status(404).json(errorResponse('Style not found'));
        return;
      }

      res.json(successResponse('Style retrieved successfully', {
        style: {
          id: style.id,
          name: style.name,
          description: style.description,
          templateId: style.templateId,
          cssContent: style.cssContent,
          colorScheme: style.colorScheme ? JSON.parse(style.colorScheme) : null,
          fontFamily: style.fontFamily,
          isDefault: style.isDefault,
          isSystem: style.isSystem,
          version: style.version,
          tags: style.tags ? JSON.parse(style.tags) : [],
          createdAt: style.createdAt,
          updatedAt: style.updatedAt,
          template: (style as any).template ? {
            id: (style as any).template.id,
            name: (style as any).template.name,
            templateType: (style as any).template.templateType
          } : null
        }
      }));

    } catch (error) {
      logger.error('Failed to get style:', error);
      res.status(500).json(errorResponse(
        error instanceof Error ? error.message : 'Failed to retrieve style'
      ));
    }
  }

  /**
   * @route   PUT /api/v1/organizations/:organizationId/invoice-styles/:id
   * @desc    Update invoice style
   * @access  Private (Admin, Manager)
   */
  async updateInvoiceStyle(req: Request, res: Response): Promise<void> {
    try {
      const organizationId = getOrganizationIdFromRequest(req);
      const { id } = req.params;
      const { name, description, templateId, cssContent, colorScheme, fontFamily, isDefault, tags } = req.body;

      const auditContext = {
        userId: req.user?.id || '',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      };

      const updatedStyle = await invoiceTemplateService.updateStyle(
        id,
        { name, description, templateId, cssContent, colorScheme, fontFamily, isDefault, tags },
        organizationId,
        auditContext
      );

      res.json(successResponse('Style updated successfully', {
        style: {
          id: updatedStyle.id,
          name: updatedStyle.name,
          description: updatedStyle.description,
          templateId: updatedStyle.templateId,
          colorScheme: updatedStyle.colorScheme ? JSON.parse(updatedStyle.colorScheme) : null,
          fontFamily: updatedStyle.fontFamily,
          isDefault: updatedStyle.isDefault,
          isSystem: updatedStyle.isSystem,
          version: updatedStyle.version,
          updatedAt: updatedStyle.updatedAt
        }
      }));

    } catch (error) {
      logger.error('Failed to update style:', error);
      const statusCode = error instanceof Error && error.message.includes('not found') ? 404
        : error instanceof Error && error.message.includes('system') ? 400
        : 500;
      res.status(statusCode).json(errorResponse(
        error instanceof Error ? error.message : 'Failed to update style'
      ));
    }
  }

  /**
   * @route   DELETE /api/v1/organizations/:organizationId/invoice-styles/:id
   * @desc    Delete invoice style (soft delete)
   * @access  Private (Admin)
   */
  async deleteInvoiceStyle(req: Request, res: Response): Promise<void> {
    try {
      const organizationId = getOrganizationIdFromRequest(req);
      const { id } = req.params;

      const auditContext = {
        userId: req.user?.id || '',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      };

      await invoiceTemplateService.deleteStyle(id, organizationId, auditContext);

      res.json(successResponse('Style deleted successfully'));

    } catch (error) {
      logger.error('Failed to delete style:', error);
      const statusCode = error instanceof Error && error.message.includes('not found') ? 404
        : error instanceof Error && (error.message.includes('system') || error.message.includes('default')) ? 400
        : 500;
      res.status(statusCode).json(errorResponse(
        error instanceof Error ? error.message : 'Failed to delete style'
      ));
    }
  }

  /**
   * Helper: Delete previous PDFs for regeneration
   */
  private async deletePreviousPDFs(
    invoiceId: string,
    templateId?: string,
    styleId?: string,
    organizationId?: string
  ): Promise<void> {
    try {
      const whereClause: any = { invoiceId };
      if (templateId) whereClause.templateId = templateId;
      if (styleId) whereClause.styleId = styleId;
      if (organizationId) whereClause.organizationId = organizationId;

      // Use prisma directly for cleanup
      const { prisma } = await import('../config/database');
      await prisma.generatedPDF.deleteMany({ where: whereClause });
    } catch (error) {
      logger.warn('Failed to delete previous PDFs:', error);
    }
  }

  /**
   * Helper: Get PDF history
   */
  private async getPDFHistory(whereClause: any): Promise<any[]> {
    const { prisma } = await import('../config/database');
    return await prisma.generatedPDF.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      take: 10
    });
  }
}

export const invoicePDFController = new InvoicePDFController();