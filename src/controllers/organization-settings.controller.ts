import { Request, Response } from 'express';
import { organizationSettingsService } from '../services/organization-settings.service';
import { getOrganizationIdFromRequest } from '../middleware/organization.middleware';
import { successResponse, errorResponse } from '../utils/response';
import { logger } from '../utils/logger';

export class OrganizationSettingsController {

  /**
   * @route   GET /api/v1/organizations/:organizationId/settings/invoice
   * @desc    Get organization invoice settings
   * @access  Private (Admin, Manager, Accountant, Employee, Viewer)
   */
  async getInvoiceSettings(req: Request, res: Response): Promise<void> {
    try {
      const organizationId = getOrganizationIdFromRequest(req);

      const settings = await organizationSettingsService.getInvoiceSettings(organizationId);

      res.json(successResponse('Invoice settings retrieved successfully', {
        branding: {
          id: settings.branding.id,
          logoUrl: settings.branding.logoUrl,
          logoWidth: settings.branding.logoWidth,
          logoHeight: settings.branding.logoHeight,
          showLogo: settings.branding.showLogo,
          showOrgName: settings.branding.showOrgName,
          primaryColor: settings.branding.primaryColor,
          secondaryColor: settings.branding.secondaryColor,
          accentColor: settings.branding.accentColor,
          backgroundColor: settings.branding.backgroundColor,
          textColor: settings.branding.textColor,
          displaySettings: settings.branding.displaySettings ?
            JSON.parse(settings.branding.displaySettings) : null,
          customCss: settings.branding.customCss,
          taxesEnabled: settings.branding.taxesEnabled,
          defaultTaxExempt: settings.branding.defaultTaxExempt,
          taxDisplaySettings: settings.branding.taxDisplaySettings ?
            JSON.parse(settings.branding.taxDisplaySettings) : null,
          defaultTemplateId: settings.branding.defaultTemplateId,
          defaultStyleId: settings.branding.defaultStyleId,
          createdAt: settings.branding.createdAt,
          updatedAt: settings.branding.updatedAt
        },
        availableTemplates: settings.availableTemplates,
        availableStyles: settings.availableStyles
      }));

    } catch (error) {
      logger.error('Failed to get invoice settings:', error);
      res.status(500).json(errorResponse(
        error instanceof Error ? error.message : 'Failed to retrieve invoice settings'
      ));
    }
  }

  /**
   * @route   PUT /api/v1/organizations/:organizationId/settings/invoice
   * @desc    Update organization invoice settings
   * @access  Private (Admin, Manager)
   */
  async updateInvoiceSettings(req: Request, res: Response): Promise<void> {
    try {
      const organizationId = getOrganizationIdFromRequest(req);
      const settingsData = req.body;

      const auditContext = {
        userId: req.user?.id || '',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      };

      const updatedBranding = await organizationSettingsService.updateInvoiceSettings(
        organizationId,
        settingsData,
        auditContext
      );

      res.json(successResponse('Invoice settings updated successfully', {
        branding: {
          id: updatedBranding.id,
          logoUrl: updatedBranding.logoUrl,
          logoWidth: updatedBranding.logoWidth,
          logoHeight: updatedBranding.logoHeight,
          showLogo: updatedBranding.showLogo,
          showOrgName: updatedBranding.showOrgName,
          primaryColor: updatedBranding.primaryColor,
          secondaryColor: updatedBranding.secondaryColor,
          accentColor: updatedBranding.accentColor,
          backgroundColor: updatedBranding.backgroundColor,
          textColor: updatedBranding.textColor,
          displaySettings: updatedBranding.displaySettings ?
            JSON.parse(updatedBranding.displaySettings) : null,
          customCss: updatedBranding.customCss,
          taxesEnabled: updatedBranding.taxesEnabled,
          defaultTaxExempt: updatedBranding.defaultTaxExempt,
          taxDisplaySettings: updatedBranding.taxDisplaySettings ?
            JSON.parse(updatedBranding.taxDisplaySettings) : null,
          defaultTemplateId: updatedBranding.defaultTemplateId,
          defaultStyleId: updatedBranding.defaultStyleId,
          updatedAt: updatedBranding.updatedAt
        }
      }));

    } catch (error) {
      logger.error('Failed to update invoice settings:', error);
      res.status(500).json(errorResponse(
        error instanceof Error ? error.message : 'Failed to update invoice settings'
      ));
    }
  }

  /**
   * @route   POST /api/v1/organizations/:organizationId/assets/logo
   * @desc    Upload organization logo
   * @access  Private (Admin, Manager)
   */
  async uploadLogo(req: Request, res: Response): Promise<void> {
    try {
      const organizationId = getOrganizationIdFromRequest(req);
      const file = req.file;

      if (!file) {
        res.status(400).json(errorResponse('No logo file provided'));
        return;
      }

      // Validate file type
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
      if (!allowedTypes.includes(file.mimetype)) {
        res.status(400).json(errorResponse('Invalid file type. Only JPEG and PNG are allowed.'));
        return;
      }

      // Validate file size (max 5MB)
      const maxSize = 5 * 1024 * 1024;
      if (file.size > maxSize) {
        res.status(400).json(errorResponse('File size too large. Maximum 5MB allowed.'));
        return;
      }

      const auditContext = {
        userId: req.user?.id || '',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      };

      // Save file and get URL (integrate with existing document service)
      const logoUrl = await this.saveLogoFile(file, organizationId);

      // Extract dimensions if provided
      const { logoWidth, logoHeight } = req.body;

      const updatedBranding = await organizationSettingsService.updateLogo(
        organizationId,
        logoUrl,
        logoWidth ? parseInt(logoWidth) : undefined,
        logoHeight ? parseInt(logoHeight) : undefined,
        auditContext
      );

      res.status(201).json(successResponse('Logo uploaded successfully', {
        logoUrl: updatedBranding.logoUrl,
        logoWidth: updatedBranding.logoWidth,
        logoHeight: updatedBranding.logoHeight,
        showLogo: updatedBranding.showLogo
      }));

    } catch (error) {
      logger.error('Failed to upload logo:', error);
      res.status(500).json(errorResponse(
        error instanceof Error ? error.message : 'Failed to upload logo'
      ));
    }
  }

  /**
   * @route   DELETE /api/v1/organizations/:organizationId/assets/logo
   * @desc    Remove organization logo
   * @access  Private (Admin, Manager)
   */
  async removeLogo(req: Request, res: Response): Promise<void> {
    try {
      const organizationId = getOrganizationIdFromRequest(req);

      const auditContext = {
        userId: req.user?.id || '',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      };

      const updatedBranding = await organizationSettingsService.removeLogo(
        organizationId,
        auditContext
      );

      res.json(successResponse('Logo removed successfully', {
        logoUrl: updatedBranding.logoUrl,
        showLogo: updatedBranding.showLogo
      }));

    } catch (error) {
      logger.error('Failed to remove logo:', error);
      res.status(500).json(errorResponse(
        error instanceof Error ? error.message : 'Failed to remove logo'
      ));
    }
  }

  /**
   * @route   PUT /api/v1/organizations/:organizationId/settings/tax
   * @desc    Update tax settings for organization
   * @access  Private (Admin, Manager)
   */
  async updateTaxSettings(req: Request, res: Response): Promise<void> {
    try {
      const organizationId = getOrganizationIdFromRequest(req);
      const { taxesEnabled, defaultTaxExempt } = req.body;

      if (typeof taxesEnabled !== 'boolean') {
        res.status(400).json(errorResponse('taxesEnabled must be a boolean value'));
        return;
      }

      const auditContext = {
        userId: req.user?.id || '',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      };

      const updatedBranding = await organizationSettingsService.updateTaxSettings(
        organizationId,
        taxesEnabled,
        defaultTaxExempt,
        auditContext
      );

      res.json(successResponse('Tax settings updated successfully', {
        taxesEnabled: updatedBranding.taxesEnabled,
        defaultTaxExempt: updatedBranding.defaultTaxExempt
      }));

    } catch (error) {
      logger.error('Failed to update tax settings:', error);
      res.status(500).json(errorResponse(
        error instanceof Error ? error.message : 'Failed to update tax settings'
      ));
    }
  }

  /**
   * @route   PUT /api/v1/organizations/:organizationId/settings/defaults
   * @desc    Set default template and style
   * @access  Private (Admin, Manager)
   */
  async setDefaults(req: Request, res: Response): Promise<void> {
    try {
      const organizationId = getOrganizationIdFromRequest(req);
      const { defaultTemplateId, defaultStyleId } = req.body;

      const auditContext = {
        userId: req.user?.id || '',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      };

      const updatedBranding = await organizationSettingsService.setDefaultTemplateAndStyle(
        organizationId,
        defaultTemplateId,
        defaultStyleId,
        auditContext
      );

      res.json(successResponse('Default template and style updated successfully', {
        defaultTemplateId: updatedBranding.defaultTemplateId,
        defaultStyleId: updatedBranding.defaultStyleId
      }));

    } catch (error) {
      logger.error('Failed to update defaults:', error);
      res.status(500).json(errorResponse(
        error instanceof Error ? error.message : 'Failed to update defaults'
      ));
    }
  }

  /**
   * @route   POST /api/v1/organizations/:organizationId/settings/initialize
   * @desc    Initialize invoice settings for new organization
   * @access  Private (Admin)
   */
  async initializeSettings(req: Request, res: Response): Promise<void> {
    try {
      const organizationId = getOrganizationIdFromRequest(req);

      const auditContext = {
        userId: req.user?.id || '',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      };

      const settings = await organizationSettingsService.initializeInvoiceSettings(
        organizationId,
        auditContext
      );

      res.status(201).json(successResponse('Invoice settings initialized successfully', {
        message: 'System templates, styles, and default branding created',
        templatesCount: settings.availableTemplates.length,
        stylesCount: settings.availableStyles.length,
        branding: {
          id: settings.branding.id,
          taxesEnabled: settings.branding.taxesEnabled,
          showLogo: settings.branding.showLogo,
          showOrgName: settings.branding.showOrgName
        }
      }));

    } catch (error) {
      logger.error('Failed to initialize settings:', error);
      res.status(500).json(errorResponse(
        error instanceof Error ? error.message : 'Failed to initialize settings'
      ));
    }
  }

  /**
   * @route   GET /api/v1/organizations/:organizationId/settings/tax
   * @desc    Get tax settings for organization
   * @access  Private (Admin, Manager, Accountant, Employee, Viewer)
   */
  async getTaxSettings(req: Request, res: Response): Promise<void> {
    try {
      const organizationId = getOrganizationIdFromRequest(req);

      const taxSettings = await organizationSettingsService.getTaxSettings(organizationId);

      res.json(successResponse('Tax settings retrieved successfully', taxSettings));

    } catch (error) {
      logger.error('Failed to get tax settings:', error);
      res.status(500).json(errorResponse(
        error instanceof Error ? error.message : 'Failed to retrieve tax settings'
      ));
    }
  }

  /**
   * Helper: Save logo file (integrate with existing document service)
   */
  private async saveLogoFile(file: Express.Multer.File, organizationId: string): Promise<string> {
    try {
      // Create logos directory if it doesn't exist
      const fs = await import('fs/promises');
      const path = await import('path');

      const logoDir = path.join(process.cwd(), 'storage', 'logos', organizationId);
      await fs.mkdir(logoDir, { recursive: true });

      // Generate unique filename
      const timestamp = Date.now();
      const extension = path.extname(file.originalname);
      const filename = `logo-${timestamp}${extension}`;
      const filePath = path.join(logoDir, filename);

      // Save file
      await fs.writeFile(filePath, file.buffer);

      // Return relative URL for storage
      return `/storage/logos/${organizationId}/${filename}`;

    } catch (error) {
      logger.error('Failed to save logo file:', error);
      throw new Error('Failed to save logo file');
    }
  }
}

export const organizationSettingsController = new OrganizationSettingsController();