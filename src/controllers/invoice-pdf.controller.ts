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
      res.status(500).json(errorResponse(
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