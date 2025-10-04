import { Response, NextFunction } from 'express';
import { IntakeRequest } from '../middleware/intake-token.middleware';
import { intakeTokenService } from '../services/intake-token.service';
import { intakeWorkflowService } from '../services/intake-workflow.service';
import { businessTemplateService } from '../services/business-template.service';
import { ValidationError, NotFoundError } from '../utils/errors';
import { prisma } from '../config/database';

export class IntakeController {
  /**
   * POST /api/v1/public/intake/initialize
   *
   * Initialize a new intake session.
   * Returns a token that must be used for all subsequent requests.
   *
   * No authentication required.
   */
  async initialize(req: IntakeRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, fingerprint } = req.body;

      if (!email) {
        throw new ValidationError('Email is required to initialize session');
      }

      const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
      const userAgent = req.headers['user-agent'] || 'unknown';
      const origin = req.headers['origin'] || req.headers['referer'];

      // Create new session
      const { token, session } = await intakeTokenService.createSession({
        email,
        ipAddress: clientIp,
        userAgent,
        origin,
        fingerprint
      });

      res.status(201).json({
        success: true,
        message: 'Intake session initialized successfully',
        token,
        sessionId: session.id,
        expiresAt: session.expiresAt.toISOString(),
        currentStep: session.currentStep,
        instructions: {
          tokenUsage: 'Include this token in the X-Intake-Token header for all subsequent requests',
          sessionDuration: '48 hours',
          nextStep: 'Select your profile type (Residential or Commercial)',
          endpoint: 'POST /api/v1/public/intake/step'
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/public/intake/step
   *
   * Update intake session with customer or quote data.
   * Supports progressive submission - data can be submitted piecemeal.
   *
   * Requires X-Intake-Token header.
   */
  async updateStep(req: IntakeRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.intakeSession) {
        throw new ValidationError('No active session found');
      }

      const { step, customerData, quoteData } = req.body;

      if (!step) {
        throw new ValidationError('Step identifier is required');
      }

      const sessionId = req.intakeSession.id;
      let updatedCustomer = null;
      let updatedQuote = null;

      // Update customer data if provided
      if (customerData && Object.keys(customerData).length > 0) {
        updatedCustomer = await intakeWorkflowService.updateCustomerData(
          sessionId,
          customerData
        );
      }

      // Update quote data if provided
      if (quoteData && Object.keys(quoteData).length > 0) {
        // Validate custom fields if category is provided and custom fields exist
        if (quoteData.category && quoteData.customFields) {
          const validation = businessTemplateService.validateCustomFields(
            quoteData.category,
            quoteData.customFields
          );

          if (!validation.isValid) {
            throw new ValidationError(
              'Custom field validation failed',
              {
                errors: validation.errors,
                warnings: validation.warnings
              }
            );
          }

          // Sanitize custom fields before storage
          quoteData.customFields = businessTemplateService.sanitizeCustomFields(
            quoteData.customFields
          );
        }

        updatedQuote = await intakeWorkflowService.updateQuoteData(
          sessionId,
          quoteData
        );
      }

      // Transition to the specified step (requires current step as fromStep)
      const currentStep = req.intakeSession.currentStep;
      await intakeWorkflowService.transitionStep(sessionId, currentStep as any, step);

      // Fetch updated session
      const updatedSession = await prisma.intakeSession.findUnique({
        where: { id: sessionId },
        include: {
          customerData: true,
          quoteData: true
        }
      });

      if (!updatedSession) {
        throw new NotFoundError('Session not found after update');
      }

      // Calculate overall completion
      const customerCompletion = updatedCustomer?.completionPercentage || 0;
      const quoteCompletion = updatedQuote?.completionPercentage || 0;
      const overallCompletion = Math.round((customerCompletion + quoteCompletion) / 2);

      res.status(200).json({
        success: true,
        message: 'Step updated successfully',
        session: {
          id: updatedSession.id,
          currentStep: updatedSession.currentStep,
          completedSteps: JSON.parse(updatedSession.completedSteps || '[]'),
          status: updatedSession.status
        },
        completion: {
          overall: overallCompletion,
          customer: customerCompletion,
          quote: quoteCompletion
        },
        nextStep: this.getNextStep(updatedSession.currentStep),
        data: {
          customer: updatedCustomer,
          quote: updatedQuote
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/public/intake/status
   *
   * Get current session status and completion progress.
   *
   * Requires X-Intake-Token header.
   */
  async getStatus(req: IntakeRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.intakeSession) {
        throw new NotFoundError('No active session found');
      }

      const sessionId = req.intakeSession.id;

      // Get session with related data
      const session = await prisma.intakeSession.findUnique({
        where: { id: sessionId },
        include: {
          customerData: true,
          quoteData: true
        }
      });

      if (!session) {
        throw new NotFoundError('Session not found');
      }

      const customerCompletion = session.customerData?.completionPercentage || 0;
      const quoteCompletion = session.quoteData?.completionPercentage || 0;
      const overallCompletion = Math.round((customerCompletion + quoteCompletion) / 2);

      // Check if session can be submitted
      const canSubmit = customerCompletion >= 80 && quoteCompletion >= 60;

      res.status(200).json({
        success: true,
        session: {
          id: session.id,
          status: session.status,
          currentStep: session.currentStep,
          completedSteps: JSON.parse(session.completedSteps || '[]'),
          sessionStartedAt: session.sessionStartedAt.toISOString(),
          lastActivityAt: session.lastActivityAt.toISOString(),
          expiresAt: session.expiresAt.toISOString(),
          requestCount: session.requestCount
        },
        completion: {
          overall: overallCompletion,
          customer: customerCompletion,
          quote: quoteCompletion
        },
        consent: {
          privacyPolicyAccepted: session.privacyPolicyAccepted,
          termsAccepted: session.termsAccepted,
          marketingConsent: session.marketingConsent
        },
        data: {
          customer: session.customerData,
          quote: session.quoteData
        },
        nextStep: this.getNextStep(session.currentStep),
        canSubmit
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/public/intake/submit
   *
   * Finalize intake and convert to customer and quote.
   * This is the final step that creates the actual records.
   *
   * Requires X-Intake-Token header.
   * Requires all mandatory data to be completed.
   */
  async submit(req: IntakeRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.intakeSession) {
        throw new ValidationError('No active session found');
      }

      const { organizationId } = req.body;

      if (!organizationId) {
        throw new ValidationError('Organization ID is required for submission');
      }

      const sessionId = req.intakeSession.id;

      // Get session to check completion
      const session = await prisma.intakeSession.findUnique({
        where: { id: sessionId },
        include: {
          customerData: true,
          quoteData: true
        }
      });

      if (!session) {
        throw new NotFoundError('Session not found');
      }

      const customerCompletion = session.customerData?.completionPercentage || 0;
      const quoteCompletion = session.quoteData?.completionPercentage || 0;

      if (customerCompletion < 80 || quoteCompletion < 60) {
        throw new ValidationError(
          'Session is not ready for submission. Please complete all required fields.',
          {
            customerCompletion,
            quoteCompletion,
            requiredCustomerCompletion: 80,
            requiredQuoteCompletion: 60
          }
        );
      }

      // Convert to customer and quote
      const result = await intakeWorkflowService.completeWorkflow(sessionId, organizationId);

      res.status(201).json({
        success: true,
        message: 'Intake submitted successfully! We will contact you shortly.',
        customer: {
          id: result.customerId,
          referenceNumber: result.referenceNumber
        },
        quote: {
          id: result.quoteId,
          referenceNumber: result.referenceNumber
        },
        nextSteps: [
          'Check your email for confirmation',
          'We will review your request within 24 hours',
          'You will receive a detailed quote estimate',
          'Our team will contact you to schedule an appointment'
        ]
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/public/intake/templates
   *
   * Get all available business templates.
   *
   * No authentication required.
   */
  async getTemplates(req: IntakeRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const summaries = businessTemplateService.getTemplateSummaries();

      res.status(200).json({
        success: true,
        templates: summaries,
        total: summaries.length
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/public/intake/templates/:category
   *
   * Get field template for a specific category.
   *
   * No authentication required.
   */
  async getTemplateByCategory(req: IntakeRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { category } = req.params;

      if (!category) {
        throw new ValidationError('Category parameter is required');
      }

      const template = businessTemplateService.getTemplateForCategory(category);

      res.status(200).json({
        success: true,
        category: category.toUpperCase(),
        template
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/public/intake/templates/:category/validate
   *
   * Validate custom fields against a template.
   *
   * No authentication required (for client-side validation).
   */
  async validateCustomFields(req: IntakeRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { category } = req.params;
      const { customFields } = req.body;

      if (!category) {
        throw new ValidationError('Category parameter is required');
      }

      if (!customFields || typeof customFields !== 'object') {
        throw new ValidationError('customFields must be an object');
      }

      const validation = businessTemplateService.validateCustomFields(
        category,
        customFields
      );

      res.status(200).json({
        success: validation.isValid,
        validation: {
          isValid: validation.isValid,
          errors: validation.errors,
          warnings: validation.warnings
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Helper: Get next step suggestion based on current step
   */
  private getNextStep(currentStep: string): { step: string; description: string } | null {
    const stepFlow: Record<string, { step: string; description: string }> = {
      EMAIL_CAPTURE: {
        step: 'PROFILE_TYPE',
        description: 'Select your profile type (Residential or Commercial)'
      },
      PROFILE_TYPE: {
        step: 'PROFILE_DETAILS',
        description: 'Provide your contact information and address'
      },
      PROFILE_DETAILS: {
        step: 'SERVICE_CATEGORY',
        description: 'Select the service category you need'
      },
      SERVICE_CATEGORY: {
        step: 'SERVICE_DETAILS',
        description: 'Provide details about the service you need'
      },
      SERVICE_DETAILS: {
        step: 'ADDITIONAL_INFO',
        description: 'Add any additional information (optional)'
      },
      ADDITIONAL_INFO: {
        step: 'REVIEW',
        description: 'Review your information before submitting'
      },
      REVIEW: {
        step: 'SUBMIT',
        description: 'Submit your intake request'
      }
    };

    return stepFlow[currentStep] || null;
  }
}

export const intakeController = new IntakeController();