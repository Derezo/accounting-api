/**
 * IntakeFormSessionService
 * Manages intake form sessions, data storage, and workflow progression
 */

import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import {
  CreateSessionDto,
  UpdateSessionDataDto,
  SessionDto,
  SessionProgress,
  SessionStatus,
  StepTimings,
} from '@/types/intake-form-template.types';
import { NotFoundError, ValidationError, AuthenticationError } from '@/utils/errors';
import { IntakeFormTemplateService } from './intake-form-template.service';

export class IntakeFormSessionService {
  private templateService: IntakeFormTemplateService;

  constructor(private prisma: PrismaClient) {
    this.templateService = new IntakeFormTemplateService(prisma);
  }

  // ==================== SESSION LIFECYCLE ====================

  /**
   * Create a new intake form session
   */
  async createSession(data: CreateSessionDto): Promise<SessionDto> {
    // Verify template exists and is active
    const template = await this.prisma.intakeFormTemplate.findFirst({
      where: {
        id: data.templateId,
        isActive: true,
        deletedAt: null,
      },
      include: {
        steps: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!template) {
      throw new NotFoundError('Template not found or inactive');
    }

    if (!template.steps || template.steps.length === 0) {
      throw new ValidationError('Template has no steps configured');
    }

    // Generate secure token
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = await bcrypt.hash(token, 10);

    // Calculate expiration (24 hours from now)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    // Get first step
    const firstStep = template.steps[0];

    // Create session
    const session = await this.prisma.intakeFormSession.create({
      data: {
        templateId: data.templateId,
        tokenHash,
        currentStepKey: firstStep.stepKey,
        visitedSteps: JSON.stringify([firstStep.stepKey]),
        completedSteps: JSON.stringify([]),
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        fingerprint: data.fingerprint,
        origin: data.origin,
        expiresAt,
      },
    });

    // Create empty form data
    await this.prisma.intakeFormData.create({
      data: {
        sessionId: session.id,
        data: JSON.stringify({}),
        completionPercentage: 0,
        isValid: false,
      },
    });

    return this.mapSessionToDto(session, token);
  }

  /**
   * Get session by token
   */
  async getSessionByToken(token: string): Promise<SessionDto> {
    // Find all active sessions
    const sessions = await this.prisma.intakeFormSession.findMany({
      where: {
        status: 'ACTIVE',
        expiresAt: { gt: new Date() },
      },
      include: {
        formData: true,
      },
    });

    // Find matching session by comparing token hash
    for (const session of sessions) {
      const matches = await bcrypt.compare(token, session.tokenHash);
      if (matches) {
        // Update last activity
        await this.prisma.intakeFormSession.update({
          where: { id: session.id },
          data: {
            lastActivityAt: new Date(),
            requestCount: { increment: 1 },
          },
        });

        return this.mapSessionToDto(session, token);
      }
    }

    throw new AuthenticationError('Invalid or expired session token');
  }

  /**
   * Update session data
   */
  async updateSessionData(
    token: string,
    fieldData: UpdateSessionDataDto
  ): Promise<SessionDto> {
    const session = await this.getSessionByToken(token);

    // Get current form data
    const formData = await this.prisma.intakeFormData.findUnique({
      where: { sessionId: session.id },
    });

    if (!formData) {
      throw new NotFoundError('Form data not found');
    }

    // Parse existing data
    const existingData = JSON.parse(formData.data);

    // Merge new data
    const updatedData = {
      ...existingData,
      ...fieldData,
    };

    // Calculate completion percentage
    const progress = await this.calculateProgress(session.templateId, updatedData);

    // Update form data
    await this.prisma.intakeFormData.update({
      where: { sessionId: session.id },
      data: {
        data: JSON.stringify(updatedData),
        completionPercentage: progress.completionPercentage,
        isValid: progress.isValid,
        validationErrors: progress.validationErrors
          ? JSON.stringify(progress.validationErrors)
          : null,
      },
    });

    // Get updated session
    return this.getSessionByToken(token);
  }

  /**
   * Move to next step in workflow
   */
  async advanceToStep(token: string, stepKey: string): Promise<SessionDto> {
    const session = await this.getSessionByToken(token);

    // Verify step exists in template
    const template = await this.prisma.intakeFormTemplate.findUnique({
      where: { id: session.templateId },
      include: {
        steps: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!template) {
      throw new NotFoundError('Template not found');
    }

    const step = template.steps.find((s) => s.stepKey === stepKey);
    if (!step) {
      throw new ValidationError(`Invalid step key: ${stepKey}`);
    }

    // Get visited and completed steps (already parsed in DTO)
    const visitedSteps = session.visitedSteps;
    const completedSteps = session.completedSteps;

    // Add current step to completed if not already there
    if (!completedSteps.includes(session.currentStepKey)) {
      completedSteps.push(session.currentStepKey);
    }

    // Add new step to visited if not already there
    if (!visitedSteps.includes(stepKey)) {
      visitedSteps.push(stepKey);
    }

    // Update step timings (already parsed in DTO)
    const stepTimings: StepTimings = session.stepTimings || {};

    if (!stepTimings[stepKey]) {
      stepTimings[stepKey] = {
        startedAt: new Date(),
      };
    }

    // Mark previous step as completed with duration
    if (stepTimings[session.currentStepKey]) {
      const startTime = new Date(stepTimings[session.currentStepKey].startedAt);
      const now = new Date();
      stepTimings[session.currentStepKey].completedAt = now;
      stepTimings[session.currentStepKey].duration =
        now.getTime() - startTime.getTime();
    }

    // Update session
    const updatedSession = await this.prisma.intakeFormSession.update({
      where: { id: session.id },
      data: {
        currentStepKey: stepKey,
        visitedSteps: JSON.stringify(visitedSteps),
        completedSteps: JSON.stringify(completedSteps),
        stepTimings: JSON.stringify(stepTimings),
        lastActivityAt: new Date(),
      },
      include: {
        formData: true,
      },
    });

    return this.mapSessionToDto(updatedSession, token);
  }

  /**
   * Complete the session
   */
  async completeSession(token: string): Promise<SessionDto> {
    const session = await this.getSessionByToken(token);

    // Verify session can be completed
    const formData = await this.prisma.intakeFormData.findUnique({
      where: { sessionId: session.id },
    });

    if (!formData) {
      throw new ValidationError('Form data not found');
    }

    const data = JSON.parse(formData.data);
    const progress = await this.calculateProgress(session.templateId, data);

    if (!progress.isValid) {
      throw new ValidationError(
        'Cannot complete session with validation errors',
        progress.validationErrors
      );
    }

    // Update session status
    const updatedSession = await this.prisma.intakeFormSession.update({
      where: { id: session.id },
      data: {
        status: 'COMPLETED',
        lastActivityAt: new Date(),
      },
      include: {
        formData: true,
      },
    });

    return this.mapSessionToDto(updatedSession, token);
  }

  /**
   * Abandon a session
   */
  async abandonSession(token: string): Promise<void> {
    const session = await this.getSessionByToken(token);

    await this.prisma.intakeFormSession.update({
      where: { id: session.id },
      data: {
        status: 'ABANDONED',
        lastActivityAt: new Date(),
      },
    });
  }

  // ==================== SESSION PROGRESS ====================

  /**
   * Get session progress
   */
  async getSessionProgress(token: string): Promise<SessionProgress> {
    const session = await this.getSessionByToken(token);

    const formData = await this.prisma.intakeFormData.findUnique({
      where: { sessionId: session.id },
    });

    if (!formData) {
      throw new NotFoundError('Form data not found');
    }

    const data = JSON.parse(formData.data);
    return this.calculateProgress(session.templateId, data);
  }

  /**
   * Calculate progress based on template completion rules
   */
  private async calculateProgress(
    templateId: string,
    formData: Record<string, unknown>
  ): Promise<SessionProgress> {
    const template = await this.prisma.intakeFormTemplate.findUnique({
      where: { id: templateId },
      include: {
        fields: true,
        steps: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!template) {
      throw new NotFoundError('Template not found');
    }

    const fields = template.fields || [];
    const requiredFields = fields.filter((f) => f.isRequired);

    // Calculate completion percentage
    let completedFields = 0;
    const validationErrors: Array<{ field: string; message: string }> = [];

    for (const field of requiredFields) {
      const value = formData[field.fieldKey];

      if (value === undefined || value === null || value === '') {
        validationErrors.push({
          field: field.fieldKey,
          message: field.validationError || `${field.label} is required`,
        });
      } else {
        completedFields++;
      }
    }

    const completionPercentage =
      requiredFields.length > 0
        ? Math.round((completedFields / requiredFields.length) * 100)
        : 100;

    return {
      completionPercentage,
      currentStepKey: '', // Will be filled by caller
      visitedSteps: [], // Will be filled by caller
      completedSteps: [], // Will be filled by caller
      isValid: validationErrors.length === 0,
      validationErrors: validationErrors.length > 0 ? validationErrors : undefined,
    };
  }

  // ==================== SECURITY & BOT DETECTION ====================

  /**
   * Update suspicion score
   */
  async updateSuspicionScore(
    token: string,
    scoreIncrement: number,
    botFlag?: string
  ): Promise<void> {
    const session = await this.getSessionByToken(token);

    const existingFlags = session.botFlags || [];
    const botFlags = botFlag ? [...existingFlags, botFlag] : existingFlags;

    const newScore = session.suspicionScore + scoreIncrement;

    // Block session if score exceeds threshold
    const status = newScore >= 80 ? 'BLOCKED' : session.status;

    await this.prisma.intakeFormSession.update({
      where: { id: session.id },
      data: {
        suspicionScore: newScore,
        botFlags: JSON.stringify(botFlags),
        status,
      },
    });

    // Log security event
    await this.prisma.intakeSecurityEvent.create({
      data: {
        formSessionId: session.id,
        eventType: 'BOT_DETECTED',
        severity: newScore >= 80 ? 'HIGH' : 'MEDIUM',
        description: `Suspicion score increased to ${newScore}. Flag: ${botFlag}`,
        ruleTriggered: botFlag,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
        actionTaken: status === 'BLOCKED' ? 'BLOCKED' : 'LOGGED',
        blocked: status === 'BLOCKED',
      },
    });
  }

  /**
   * Trigger honeypot
   */
  async triggerHoneypot(token: string): Promise<void> {
    const session = await this.getSessionByToken(token);

    await this.prisma.intakeFormSession.update({
      where: { id: session.id },
      data: {
        honeypotTriggered: true,
        suspicionScore: 100,
        status: 'BLOCKED',
      },
    });

    // Log security event
    await this.prisma.intakeSecurityEvent.create({
      data: {
        formSessionId: session.id,
        eventType: 'HONEYPOT_TRIGGERED',
        severity: 'CRITICAL',
        description: 'Honeypot field was filled',
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
        actionTaken: 'BLOCKED',
        blocked: true,
      },
    });
  }

  // ==================== HELPER METHODS ====================

  private mapSessionToDto(session: any, token: string): SessionDto {
    const formData = session.formData
      ? JSON.parse(session.formData.data)
      : {};

    return {
      id: session.id,
      templateId: session.templateId,
      token,
      status: session.status,
      currentStepKey: session.currentStepKey,
      visitedSteps: JSON.parse(session.visitedSteps),
      completedSteps: JSON.parse(session.completedSteps),
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      fingerprint: session.fingerprint,
      origin: session.origin,
      suspicionScore: session.suspicionScore,
      botFlags: session.botFlags ? JSON.parse(session.botFlags) : undefined,
      sessionStartedAt: session.sessionStartedAt,
      lastActivityAt: session.lastActivityAt,
      stepTimings: session.stepTimings
        ? JSON.parse(session.stepTimings)
        : undefined,
      requestCount: session.requestCount,
      submissionAttempts: session.submissionAttempts,
      formData,
      completionPercentage: session.formData?.completionPercentage || 0,
      convertedAt: session.convertedAt,
      convertedToCustomerId: session.convertedToCustomerId,
      convertedToQuoteId: session.convertedToQuoteId,
      privacyPolicyAccepted: session.privacyPolicyAccepted,
      termsAccepted: session.termsAccepted,
      marketingConsent: session.marketingConsent,
      expiresAt: session.expiresAt,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }
}
