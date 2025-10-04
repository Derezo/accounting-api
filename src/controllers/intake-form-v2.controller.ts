/**
 * IntakeFormV2Controller
 * REST API controller for template-based intake form system
 */

import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { IntakeFormTemplateService } from '@/services/intake-form-template.service';
import { IntakeFormSessionService } from '@/services/intake-form-session.service';
import { IntakeFormValidatorService } from '@/services/intake-form-validator.service';
import { IntakeFormConversionService } from '@/services/intake-form-conversion.service';
import { EncryptionService } from '@/services/encryption.service';
import { NotFoundError, ValidationError, AuthenticationError } from '@/utils/errors';

export class IntakeFormV2Controller {
  private templateService: IntakeFormTemplateService;
  private sessionService: IntakeFormSessionService;
  private validatorService: IntakeFormValidatorService;
  private conversionService: IntakeFormConversionService;

  constructor(
    private prisma: PrismaClient,
    private encryptionService: EncryptionService
  ) {
    this.templateService = new IntakeFormTemplateService(prisma);
    this.sessionService = new IntakeFormSessionService(prisma);
    this.validatorService = new IntakeFormValidatorService();
    this.conversionService = new IntakeFormConversionService(
      prisma,
      encryptionService
    );
  }

  /**
   * Standardized error handler
   */
  private handleError(res: Response, error: unknown): void {
    if (error instanceof ValidationError) {
      res.status(400).json({ success: false, error: error.message });
    } else if (error instanceof NotFoundError) {
      res.status(404).json({ success: false, error: error.message });
    } else if (error instanceof AuthenticationError) {
      res.status(401).json({ success: false, error: error.message });
    } else {
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  // ==================== TEMPLATE MANAGEMENT (Admin) ====================

  /**
   * POST /api/v2/organizations/:orgId/intake-forms/templates
   * Create a new template
   */
  createTemplate = async (req: Request, res: Response): Promise<void> => {
    try {
      const { orgId } = req.params;
      const template = await this.templateService.createTemplate(orgId, req.body);
      res.status(201).json({
        success: true,
        data: template,
        message: 'Template created successfully',
      });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  /**
   * GET /api/v2/organizations/:orgId/intake-forms/templates
   * List all templates
   */
  listTemplates = async (req: Request, res: Response): Promise<void> => {
    try {
      const { orgId } = req.params;
      const templates = await this.templateService.listTemplates(orgId);
      res.status(200).json({ success: true, data: templates });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  /**
   * GET /api/v2/organizations/:orgId/intake-forms/templates/:id
   * Get template by ID
   */
  getTemplate = async (req: Request, res: Response): Promise<void> => {
    try {
      const { orgId, id } = req.params;
      const template = await this.templateService.getTemplateById(orgId, id);
      res.status(200).json({ success: true, data: template });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  /**
   * GET /api/v2/intake-forms/templates/default (PUBLIC)
   * Get default template for organization based on domain header
   * Uses X-Organization-Domain header to identify the organization
   */
  getDefaultTemplateByDomain = async (req: Request, res: Response): Promise<void> => {
    try {
      const domain = req.headers['x-organization-domain'] as string || req.hostname;

      if (!domain) {
        res.status(400).json({
          success: false,
          error: 'Organization domain not provided'
        });
        return;
      }

      const template = await this.templateService.getDefaultTemplateByDomain(domain);

      if (!template) {
        res.status(404).json({
          success: false,
          error: 'No default template found for this organization'
        });
        return;
      }

      res.status(200).json({ success: true, data: template });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  /**
   * GET /api/v2/intake-forms/templates/:id (PUBLIC)
   * Get active template by ID (no authentication required)
   * Only returns templates that are active and published
   */
  getPublicTemplate = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      // Get template without org restriction (searches across all orgs)
      const template = await this.templateService.getPublicTemplateById(id);

      if (!template || !template.isActive) {
        res.status(404).json({
          success: false,
          error: 'Template not found or inactive'
        });
        return;
      }

      res.status(200).json({ success: true, data: template });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  /**
   * PUT /api/v2/organizations/:orgId/intake-forms/templates/:id
   * Update template
   */
  updateTemplate = async (req: Request, res: Response): Promise<void> => {
    try {
      const { orgId, id } = req.params;
      const template = await this.templateService.updateTemplate(
        orgId,
        id,
        req.body
      );
      res.status(200).json({ success: true, data: template, message: 'Template updated successfully' });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  /**
   * DELETE /api/v2/organizations/:orgId/intake-forms/templates/:id
   * Delete template
   */
  deleteTemplate = async (req: Request, res: Response): Promise<void> => {
    try {
      const { orgId, id } = req.params;
      await this.templateService.deleteTemplate(orgId, id);
      res.status(200).json({ success: true, data: null, message: 'Template deleted successfully' });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  // ==================== STEP MANAGEMENT ====================

  /**
   * POST /api/v2/organizations/:orgId/intake-forms/templates/:templateId/steps
   * Add step to template
   */
  createStep = async (req: Request, res: Response): Promise<void> => {
    try {
      const { orgId, templateId } = req.params;
      const step = await this.templateService.createStep(
        orgId,
        templateId,
        req.body
      );
      res.status(201).json({ success: true, data: step, message: 'Step created successfully' });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  /**
   * PUT /api/v2/organizations/:orgId/intake-forms/templates/:templateId/steps/:stepId
   * Update step
   */
  updateStep = async (req: Request, res: Response): Promise<void> => {
    try {
      const { orgId, templateId, stepId } = req.params;
      const step = await this.templateService.updateStep(
        orgId,
        templateId,
        stepId,
        req.body
      );
      res.status(200).json({ success: true, data: step, message: 'Step updated successfully' });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  /**
   * DELETE /api/v2/organizations/:orgId/intake-forms/templates/:templateId/steps/:stepId
   * Delete step
   */
  deleteStep = async (req: Request, res: Response): Promise<void> => {
    try {
      const { orgId, templateId, stepId } = req.params;
      await this.templateService.deleteStep(orgId, templateId, stepId);
      res.status(200).json({ success: true, data: null, message: 'Step deleted successfully' });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  // ==================== FIELD MANAGEMENT ====================

  /**
   * POST /api/v2/organizations/:orgId/intake-forms/templates/:templateId/fields
   * Add field to template
   */
  createField = async (req: Request, res: Response): Promise<void> => {
    try {
      const { orgId, templateId } = req.params;
      const field = await this.templateService.createField(
        orgId,
        templateId,
        req.body
      );
      res.status(201).json({ success: true, data: field, message: 'Field created successfully' });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  /**
   * PUT /api/v2/organizations/:orgId/intake-forms/templates/:templateId/fields/:fieldId
   * Update field
   */
  updateField = async (req: Request, res: Response): Promise<void> => {
    try {
      const { orgId, templateId, fieldId } = req.params;
      const field = await this.templateService.updateField(
        orgId,
        templateId,
        fieldId,
        req.body
      );
      res.status(200).json({ success: true, data: field, message: 'Field updated successfully' });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  /**
   * DELETE /api/v2/organizations/:orgId/intake-forms/templates/:templateId/fields/:fieldId
   * Delete field
   */
  deleteField = async (req: Request, res: Response): Promise<void> => {
    try {
      const { orgId, templateId, fieldId } = req.params;
      await this.templateService.deleteField(orgId, templateId, fieldId);
      res.status(200).json({ success: true, data: null, message: 'Field deleted successfully' });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  // ==================== PUBLIC FORM API ====================

  /**
   * POST /api/v2/intake-forms/:templateId/sessions
   * Create new public session
   */
  createPublicSession = async (req: Request, res: Response): Promise<void> => {
    try {
      const { templateId } = req.params;
      const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
      const userAgent = req.get('user-agent');

      const session = await this.sessionService.createSession({
        templateId,
        ipAddress,
        userAgent,
        fingerprint: req.body.fingerprint,
        origin: req.get('origin'),
      });

      res.status(201).json({ success: true, data: session, message: 'Session created successfully' });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  /**
   * GET /api/v2/intake-forms/sessions/:token
   * Get session by token
   */
  getSession = async (req: Request, res: Response): Promise<void> => {
    try {
      const { token } = req.params;
      const session = await this.sessionService.getSessionByToken(token);
      res.status(200).json({ success: true, data: session });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  /**
   * GET /api/v2/intake-forms/sessions/:token/progress
   * Get session progress
   */
  getSessionProgress = async (req: Request, res: Response): Promise<void> => {
    try {
      const { token } = req.params;
      const progress = await this.sessionService.getSessionProgress(token);
      res.status(200).json({ success: true, data: progress });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  /**
   * PATCH /api/v2/intake-forms/sessions/:token/data
   * Update session data
   */
  updateSessionData = async (req: Request, res: Response): Promise<void> => {
    try {
      const { token } = req.params;
      const session = await this.sessionService.updateSessionData(
        token,
        req.body
      );
      res.status(200).json({ success: true, data: session, message: 'Data updated successfully' });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  /**
   * POST /api/v2/intake-forms/sessions/:token/advance
   * Advance to next step
   */
  advanceStep = async (req: Request, res: Response): Promise<void> => {
    try {
      const { token } = req.params;
      const { stepKey } = req.body;

      if (!stepKey) {
        throw new ValidationError('stepKey is required');
      }

      const session = await this.sessionService.advanceToStep(token, stepKey);
      res.status(200).json({ success: true, data: session, message: 'Advanced to next step' });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  /**
   * POST /api/v2/intake-forms/sessions/:token/complete
   * Complete the session
   */
  completeSession = async (req: Request, res: Response): Promise<void> => {
    try {
      const { token } = req.params;
      const session = await this.sessionService.completeSession(token);
      res.status(200).json({ success: true, data: session, message: 'Session completed successfully' });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  /**
   * POST /api/v2/intake-forms/sessions/:token/abandon
   * Abandon the session
   */
  abandonSession = async (req: Request, res: Response): Promise<void> => {
    try {
      const { token } = req.params;
      await this.sessionService.abandonSession(token);
      res.status(200).json({ success: true, data: null, message: 'Session abandoned' });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  // ==================== CONVERSION ====================

  /**
   * POST /api/v2/organizations/:orgId/intake-forms/sessions/:sessionId/convert
   * Convert session to customer/quote
   */
  convertSession = async (req: Request, res: Response): Promise<void> => {
    try {
      const { orgId, sessionId } = req.params;
      const result = await this.conversionService.convertSession(
        orgId,
        sessionId
      );
      res.status(200).json({ success: true, data: result, message: 'Session converted successfully' });
    } catch (error) {
      this.handleError(res, error);
    }
  };
}
