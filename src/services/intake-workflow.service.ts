import { prisma } from '../config/database';
import { IntakeSession, IntakeCustomerData, IntakeQuoteData } from '@prisma/client';
import { logger } from '../utils/logger';
import { intakeTokenService } from './intake-token.service';
import { customerService } from './customer.service';
import { quoteService } from './quote.service';
import { auditService } from './audit.service';
import { emailTemplateService } from './email-template.service';
import { emailService } from './email.service';
import { CustomerType, CustomerTier, CustomerStatus } from '../types/enums';
import { config } from '../config/config';

export type WorkflowStep =
  | 'EMAIL_CAPTURE'
  | 'PROFILE_TYPE'
  | 'PROFILE_DETAILS'
  | 'SERVICE_CATEGORY'
  | 'SERVICE_DETAILS'
  | 'ADDITIONAL_INFO'
  | 'REVIEW'
  | 'SUBMIT'
  | 'COMPLETED';

export type ProfileType = 'RESIDENTIAL' | 'COMMERCIAL';
export type ServiceCategory = 'HVAC' | 'PLUMBING' | 'ELECTRICAL' | 'GENERAL';
export type ServiceType = 'REPAIR' | 'INSTALLATION' | 'MAINTENANCE' | 'CONSULTATION';
export type Urgency = 'EMERGENCY' | 'URGENT' | 'ROUTINE' | 'SCHEDULED';

const VALID_TRANSITIONS: Record<WorkflowStep, WorkflowStep[]> = {
  EMAIL_CAPTURE: ['PROFILE_TYPE'],
  PROFILE_TYPE: ['PROFILE_DETAILS', 'EMAIL_CAPTURE'],
  PROFILE_DETAILS: ['SERVICE_CATEGORY', 'PROFILE_TYPE'],
  SERVICE_CATEGORY: ['SERVICE_DETAILS', 'PROFILE_DETAILS'],
  SERVICE_DETAILS: ['ADDITIONAL_INFO', 'SERVICE_CATEGORY'],
  ADDITIONAL_INFO: ['REVIEW', 'SERVICE_DETAILS'],
  REVIEW: ['SUBMIT', 'ADDITIONAL_INFO'],
  SUBMIT: ['COMPLETED'],
  COMPLETED: []
};

/**
 * IntakeWorkflowService
 * Manages the workflow state machine and data collection
 */
export class IntakeWorkflowService {

  /**
   * Update customer data for current step
   */
  public async updateCustomerData(
    sessionId: string,
    data: Partial<IntakeCustomerData>
  ): Promise<IntakeCustomerData> {
    const session = await prisma.intakeSession.findUnique({
      where: { id: sessionId },
      include: { customerData: true }
    });

    if (!session || !session.customerData) {
      throw new Error('Session or customer data not found');
    }

    // Calculate completion percentage
    const completionPercentage = this.calculateCustomerCompletion(data, session.customerData);

    const updated = await prisma.intakeCustomerData.update({
      where: { id: session.customerData.id },
      data: {
        ...data,
        completionPercentage,
        updatedAt: new Date()
      }
    });

    logger.info('Customer data updated', {
      sessionId,
      completion: completionPercentage
    });

    return updated;
  }

  /**
   * Update quote data for current step
   */
  public async updateQuoteData(
    sessionId: string,
    data: Partial<IntakeQuoteData>
  ): Promise<IntakeQuoteData> {
    const session = await prisma.intakeSession.findUnique({
      where: { id: sessionId },
      include: { quoteData: true }
    });

    if (!session) {
      throw new Error('Session not found');
    }

    // Convert customFields to JSON string if it's an object
    const dataToStore = { ...data };
    if (dataToStore.customFields && typeof dataToStore.customFields === 'object') {
      dataToStore.customFields = JSON.stringify(dataToStore.customFields);
    }

    let quoteData: IntakeQuoteData;

    if (session.quoteData) {
      // Update existing
      const completionPercentage = this.calculateQuoteCompletion(data, session.quoteData);
      quoteData = await prisma.intakeQuoteData.update({
        where: { id: session.quoteData.id },
        data: {
          ...dataToStore,
          completionPercentage,
          updatedAt: new Date()
        }
      });
    } else {
      // Create new
      quoteData = await prisma.intakeQuoteData.create({
        data: {
          sessionId,
          ...dataToStore,
          completionPercentage: this.calculateQuoteCompletion(data, null)
        }
      });

      await prisma.intakeSession.update({
        where: { id: sessionId },
        data: { quoteDataId: quoteData.id }
      });
    }

    logger.info('Quote data updated', {
      sessionId,
      completion: quoteData.completionPercentage
    });

    return quoteData;
  }

  /**
   * Transition to next step
   */
  public async transitionStep(
    sessionId: string,
    fromStep: WorkflowStep,
    toStep: WorkflowStep
  ): Promise<void> {
    // Validate transition
    if (!this.isValidTransition(fromStep, toStep)) {
      throw new Error(`Invalid transition from ${fromStep} to ${toStep}`);
    }

    const session = await prisma.intakeSession.findUnique({
      where: { id: sessionId }
    });

    if (!session) {
      throw new Error('Session not found');
    }

    // Parse completed steps
    const completedSteps = JSON.parse(session.completedSteps);
    if (!completedSteps.includes(fromStep) && fromStep !== 'EMAIL_CAPTURE') {
      completedSteps.push(fromStep);
    }

    // Update step timings
    const stepTimings = session.stepTimings ? JSON.parse(session.stepTimings) : {};
    if (stepTimings[fromStep]) {
      stepTimings[fromStep].endTime = Date.now();
    }
    stepTimings[toStep] = { startTime: Date.now() };

    await prisma.intakeSession.update({
      where: { id: sessionId },
      data: {
        currentStep: toStep,
        completedSteps: JSON.stringify(completedSteps),
        stepTimings: JSON.stringify(stepTimings),
        lastActivityAt: new Date()
      }
    });

    logger.info('Workflow step transitioned', {
      sessionId,
      from: fromStep,
      to: toStep
    });
  }

  /**
   * Complete workflow and convert to customer/quote
   */
  public async completeWorkflow(sessionId: string, organizationId: string): Promise<{
    customerId: string;
    quoteId: string;
    referenceNumber: string;
  }> {
    const session = await prisma.intakeSession.findUnique({
      where: { id: sessionId },
      include: {
        customerData: true,
        quoteData: true
      }
    });

    if (!session || !session.customerData) {
      throw new Error('Session or data not found');
    }

    // Validate all required data is present
    this.validateSessionComplete(session);

    // Start conversion transaction
    return await prisma.$transaction(async (tx) => {
      const customerData = session.customerData!;

      // Create customer
      const customer = await customerService.createCustomer(
        {
          type: customerData.profileType === 'RESIDENTIAL' ? CustomerType.PERSON : CustomerType.BUSINESS,
          tier: CustomerTier.PERSONAL,
          status: CustomerStatus.PROSPECT,
          notes: `Created from public intake. Session: ${sessionId}. Referral: ${customerData.referralSource || 'None'}`,
          personData: customerData.profileType === 'RESIDENTIAL' ? {
            firstName: customerData.firstName!,
            lastName: customerData.lastName!,
            email: customerData.email,
            phone: customerData.phone!
          } : undefined,
          businessData: customerData.profileType === 'COMMERCIAL' ? {
            legalName: customerData.businessName!,
            email: customerData.email,
            phone: customerData.businessPhone!,
            businessType: 'CORPORATION'
          } : undefined,
          address: customerData.addressLine1 ? {
            street: customerData.addressLine1,
            city: customerData.city!,
            state: customerData.province!,
            postalCode: customerData.postalCode!,
            country: customerData.country || 'CA'
          } : undefined
        },
        organizationId,
        {
          userId: 'system-intake',
          ipAddress: session.ipAddress
        }
      );

      // Create quote
      const quote = await quoteService.createQuote(
        {
          customerId: customer.id,
          description: this.buildQuoteDescription(session),
          items: [], // Empty initially, to be filled by staff
          notes: this.buildQuoteNotes(session),
          intakeSessionId: sessionId,
          customFields: session.quoteData?.customFields ? JSON.parse(session.quoteData.customFields) : undefined
        },
        organizationId,
        {
          userId: 'system-intake',
          ipAddress: session.ipAddress
        }
      );

      // Update session
      await tx.intakeSession.update({
        where: { id: sessionId },
        data: {
          status: 'COMPLETED',
          convertedAt: new Date(),
          convertedToCustomerId: customer.id,
          convertedToQuoteId: quote.id
        }
      });

      // Invalidate token
      await intakeTokenService.invalidateSession(sessionId, 'COMPLETED');

      const referenceNumber = `INTAKE-${session.createdAt.getFullYear()}-${sessionId.substring(0, 8).toUpperCase()}`;

      logger.info('Intake workflow completed', {
        sessionId,
        customerId: customer.id,
        quoteId: quote.id,
        referenceNumber
      });

      // Send emails (non-blocking - don't fail the transaction if emails fail)
      this.sendIntakeEmails(session, customer, quote, referenceNumber, organizationId)
        .catch(error => {
          logger.error('Failed to send intake emails', {
            error,
            sessionId,
            customerId: customer.id
          });
        });

      return {
        customerId: customer.id,
        quoteId: quote.id,
        referenceNumber
      };
    });
  }

  /**
   * Send intake confirmation and admin notification emails
   */
  private async sendIntakeEmails(
    session: IntakeSession & { customerData: IntakeCustomerData | null; quoteData: IntakeQuoteData | null },
    customer: any,
    quote: any,
    referenceNumber: string,
    organizationId: string
  ): Promise<void> {
    try {
      const customerData = session.customerData!;
      const quoteData = session.quoteData;

      // Get organization details for branding
      const organization = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: {
          name: true,
          settings: true
        }
      });

      const orgSettings = organization?.settings ? JSON.parse(organization.settings) : {};

      const customerName = customerData.profileType === 'RESIDENTIAL'
        ? `${customerData.firstName} ${customerData.lastName}`
        : (customerData.businessName || customerData.contactName || 'Customer');

      const customerFirstName = customerData.firstName || customerData.contactName?.split(' ')[0] || 'there';

      // Prepare email data
      const emailData = {
        organizationName: organization?.name || 'Lifestream Dynamics',
        organizationPhone: orgSettings.phone || config.ORGANIZATION_PHONE,
        organizationEmail: orgSettings.email || config.ORGANIZATION_EMAIL,
        organizationAddress: orgSettings.address,
        organizationLogo: orgSettings.logoUrl,
        referenceNumber,
        customerName,
        customerFirstName,
        customerEmail: customerData.email,
        customerPhone: customerData.phone || customerData.businessPhone,
        businessName: customerData.businessName,
        profileType: customerData.profileType || 'RESIDENTIAL',
        serviceCategory: quoteData?.category || 'Service',
        serviceType: quoteData?.serviceType || 'Request',
        urgency: quoteData?.urgency || 'ROUTINE',
        description: quoteData?.description,
        additionalNotes: quoteData?.additionalNotes,
        estimatedBudget: quoteData?.estimatedBudget,
        submittedAt: session.createdAt,
        customerAddress: customerData.addressLine1 ? {
          street: customerData.addressLine1,
          city: customerData.city,
          state: customerData.province,
          postalCode: customerData.postalCode
        } : undefined,
        customFields: quoteData?.customFields ? JSON.parse(quoteData.customFields) : undefined,
        dashboardUrl: `${config.FRONTEND_URL || 'https://account.lifestreamdynamics.com'}/dashboard/quotes/${quote.id}`
      };

      // 1. Send customer confirmation email
      const customerEmail = await emailTemplateService.render(
        'intake/customer-confirmation',
        {
          ...emailData,
          subject: `${referenceNumber} - We've Received Your Request!`
        }
      );

      await emailService.sendEmail(
        customerData.email,
        customerEmail.subject,
        customerEmail.html,
        customerEmail.text
      );

      logger.info('Sent intake confirmation email to customer', {
        email: customerData.email,
        referenceNumber
      });

      // 2. Send admin notification email
      // Get organization admins
      const admins = await prisma.user.findMany({
        where: {
          organizationId,
          role: { in: ['SUPER_ADMIN', 'ADMIN', 'MANAGER'] },
          isActive: true
        },
        select: { email: true }
      });

      if (admins.length > 0) {
        const adminEmail = await emailTemplateService.render(
          'intake/admin-notification',
          {
            ...emailData,
            subject: `🔔 New ${quoteData?.urgency === 'EMERGENCY' ? 'EMERGENCY ' : ''}Service Request - ${referenceNumber}`
          }
        );

        const adminEmails = admins.map(a => a.email);

        await emailService.sendEmail(
          adminEmails,
          adminEmail.subject,
          adminEmail.html,
          adminEmail.text
        );

        logger.info('Sent intake notification to admins', {
          adminCount: admins.length,
          referenceNumber
        });
      } else {
        logger.warn('No admins found to notify about intake', { organizationId });
      }
    } catch (error) {
      logger.error('Error sending intake emails', error);
      throw error;
    }
  }

  private isValidTransition(from: WorkflowStep, to: WorkflowStep): boolean {
    return VALID_TRANSITIONS[from]?.includes(to) || false;
  }

  private calculateCustomerCompletion(data: Partial<IntakeCustomerData>, existing: IntakeCustomerData): number {
    const merged = { ...existing, ...data };
    let completed = 0;
    const total = 8;

    if (merged.email) completed++;
    if (merged.profileType) completed++;
    if (merged.firstName || merged.businessName) completed++;
    if (merged.lastName || merged.contactName) completed++;
    if (merged.phone || merged.businessPhone) completed++;
    if (merged.addressLine1) completed++;
    if (merged.city) completed++;
    if (merged.postalCode) completed++;

    return Math.round((completed / total) * 100);
  }

  private calculateQuoteCompletion(data: Partial<IntakeQuoteData>, existing: IntakeQuoteData | null): number {
    const merged = existing ? { ...existing, ...data } : data;
    let completed = 0;
    const total = 5;

    if (merged.category) completed++;
    if (merged.serviceType) completed++;
    if (merged.urgency) completed++;
    if (merged.description) completed++;
    if (merged.estimatedBudget) completed++;

    return Math.round((completed / total) * 100);
  }

  private validateSessionComplete(session: IntakeSession & {
    customerData: IntakeCustomerData | null;
    quoteData: IntakeQuoteData | null;
  }): void {
    if (!session.privacyPolicyAccepted) {
      throw new Error('Privacy policy not accepted');
    }
    if (!session.termsAccepted) {
      throw new Error('Terms not accepted');
    }
    if (!session.customerData) {
      throw new Error('Customer data missing');
    }
    // Add more validations as needed
  }

  private buildQuoteDescription(session: IntakeSession & {
    customerData: IntakeCustomerData | null;
    quoteData: IntakeQuoteData | null;
  }): string {
    const quote = session.quoteData;
    if (!quote) return 'Customer intake request';

    return `${quote.category || 'Service'} - ${quote.serviceType || 'Request'}: ${quote.description || 'Customer intake request'}`;
  }

  private buildQuoteNotes(session: IntakeSession & {
    customerData: IntakeCustomerData | null;
    quoteData: IntakeQuoteData | null;
  }): string {
    const quote = session.quoteData;
    const customer = session.customerData;

    return `
PUBLIC INTAKE SUBMISSION
========================

Category: ${quote?.category || 'Not specified'}
Service Type: ${quote?.serviceType || 'Not specified'}
Urgency: ${quote?.urgency || 'Not specified'}
Preferred Date: ${quote?.preferredDate ? new Date(quote.preferredDate).toLocaleDateString() : 'Not specified'}

Customer Description:
${quote?.description || 'No description provided'}

Property Type: ${quote?.propertyType || 'Not specified'}
Estimated Budget: ${quote?.estimatedBudget || 'Not specified'}
Access Instructions: ${quote?.accessInstructions || 'None provided'}

Referral Source: ${customer?.referralSource || 'Not specified'}
Marketing Consent: ${session.marketingConsent ? 'Yes' : 'No'}

Intake Session: ${session.id}
Submitted: ${new Date().toISOString()}
    `.trim();
  }
}

export const intakeWorkflowService = new IntakeWorkflowService();