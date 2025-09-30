import { prisma } from '../config/database';
import { Quote, QuoteAcceptanceToken } from '@prisma/client';
import { QuoteStatus } from '../types/enums';
import { logger } from '../utils/logger';
import { auditService } from './audit.service';
import { emailTemplateService } from './email-template.service';
import { emailService } from './email.service';
import { appointmentAvailabilityService } from './appointment-availability.service';
import { config } from '../config/config';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';

/**
 * QuoteLifecycleService
 * Manages quote status transitions and customer communication
 */
export class QuoteLifecycleService {

  /**
   * Send quote to customer
   * Transitions quote from DRAFT to SENT
   * Generates acceptance token and sends email
   */
  public async sendQuote(
    quoteId: string,
    organizationId: string,
    userId: string,
    options?: {
      customMessage?: string;
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<Quote & { acceptanceToken?: QuoteAcceptanceToken }> {
    const quote = await prisma.quote.findFirst({
      where: {
        id: quoteId,
        organizationId,
        deletedAt: null
      },
      include: {
        items: {
          include: {
            product: true,
            service: true
          }
        },
        customer: {
          include: {
            person: true,
            business: true
          }
        },
        organization: true
      }
    });

    if (!quote) {
      throw new Error('Quote not found');
    }

    if (quote.status !== QuoteStatus.DRAFT) {
      throw new Error('Quote must be in DRAFT status to send');
    }

    // Validate quote has items
    if (!quote.items || quote.items.length === 0) {
      throw new Error('Cannot send quote without items');
    }

    // Generate acceptance token
    const { token, tokenHash } = this.generateToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    // Generate public view token
    const { token: viewToken, tokenHash: viewTokenHash } = this.generateToken();

    const result = await prisma.$transaction(async (tx) => {
      // Update quote status
      const updatedQuote = await tx.quote.update({
        where: { id: quoteId },
        data: {
          status: QuoteStatus.SENT,
          sentAt: new Date(),
          publicViewEnabled: true,
          publicViewToken: viewToken,
          acceptanceToken: token,
          expiresAt
        },
        include: {
          items: {
            include: {
              product: true,
              service: true
            }
          },
          customer: {
            include: {
              person: true,
              business: true
            }
          }
        }
      });

      // Create acceptance token record
      const acceptanceToken = await tx.quoteAcceptanceToken.create({
        data: {
          quoteId,
          organizationId,
          tokenHash,
          generatedBy: userId,
          expiresAt
        }
      });

      return { updatedQuote, acceptanceToken };
    });

    // Audit log
    await auditService.logUpdate(
      'Quote',
      quoteId,
      quote,
      result.updatedQuote,
      {
        organizationId,
        userId,
        ipAddress: options?.ipAddress,
        userAgent: options?.userAgent
      }
    );

    // Send email asynchronously
    this.sendQuoteEmail(quote, result.updatedQuote, options?.customMessage, organizationId)
      .catch(error => {
        logger.error('Failed to send quote email', {
          error,
          quoteId,
          organizationId
        });
      });

    logger.info('Quote sent to customer', {
      quoteId,
      organizationId,
      customerId: quote.customerId
    });

    return Object.assign(result.updatedQuote, { acceptanceToken: result.acceptanceToken });
  }

  /**
   * Track quote view
   */
  public async trackQuoteView(
    quoteId: string,
    viewToken: string
  ): Promise<void> {
    const quote = await prisma.quote.findFirst({
      where: {
        id: quoteId,
        publicViewToken: viewToken,
        publicViewEnabled: true,
        deletedAt: null
      }
    });

    if (!quote) {
      throw new Error('Quote not found or view token invalid');
    }

    // Only update viewedAt if not already viewed
    if (!quote.viewedAt) {
      await prisma.quote.update({
        where: { id: quoteId },
        data: { viewedAt: new Date() }
      });

      logger.info('Quote viewed by customer', {
        quoteId,
        organizationId: quote.organizationId
      });
    }
  }

  /**
   * Accept quote
   * Validates token, transitions to ACCEPTED, sends confirmation
   */
  public async acceptQuote(
    quoteId: string,
    acceptanceToken: string,
    customerEmail: string,
    notes?: string,
    ipAddress?: string
  ): Promise<Quote> {
    const quote = await prisma.quote.findFirst({
      where: {
        id: quoteId,
        deletedAt: null
      },
      include: {
        acceptanceTokens: {
          where: {
            status: 'ACTIVE',
            invalidated: false
          }
        },
        customer: {
          include: {
            person: true,
            business: true
          }
        },
        organization: true,
        items: {
          include: {
            product: true,
            service: true
          }
        }
      }
    });

    if (!quote) {
      throw new Error('Quote not found');
    }

    if (quote.status !== QuoteStatus.SENT) {
      throw new Error('Quote must be in SENT status to accept');
    }

    // Verify token
    const validToken = await this.verifyAcceptanceToken(
      quoteId,
      acceptanceToken,
      quote.acceptanceTokens
    );

    if (!validToken) {
      throw new Error('Invalid or expired acceptance token');
    }

    // Check expiration
    if (quote.expiresAt && quote.expiresAt < new Date()) {
      throw new Error('Quote has expired');
    }

    const acceptedQuote = await prisma.$transaction(async (tx) => {
      // Update quote
      const updated = await tx.quote.update({
        where: { id: quoteId },
        data: {
          status: QuoteStatus.ACCEPTED,
          acceptedAt: new Date()
        },
        include: {
          customer: {
            include: {
              person: true,
              business: true
            }
          },
          items: {
            include: {
              product: true,
              service: true
            }
          }
        }
      });

      // Mark token as used
      await tx.quoteAcceptanceToken.update({
        where: { id: validToken.id },
        data: {
          status: 'USED',
          usedAt: new Date(),
          acceptedBy: customerEmail,
          acceptanceNotes: notes,
          ipAddressUsed: ipAddress
        }
      });

      return updated;
    });

    // Generate appointment booking token (synchronously so we can include it in the email)
    let bookingTokenData: { token: string } | null = null;
    try {
      bookingTokenData = await appointmentAvailabilityService.generateBookingToken(
        quoteId,
        quote.organizationId,
        'quote-acceptance-system'
      );
    } catch (error) {
      logger.error('Failed to generate appointment booking token', {
        error,
        quoteId
      });
      // Continue without token - email will still be sent
    }

    // Send acceptance confirmation emails
    this.sendQuoteAcceptanceEmails(quote, acceptedQuote, customerEmail, bookingTokenData?.token)
      .catch(error => {
        logger.error('Failed to send quote acceptance emails', {
          error,
          quoteId
        });
      });

    logger.info('Quote accepted by customer', {
      quoteId,
      organizationId: quote.organizationId,
      customerEmail
    });

    return acceptedQuote;
  }

  /**
   * Reject quote
   */
  public async rejectQuote(
    quoteId: string,
    acceptanceToken: string,
    customerEmail: string,
    reason?: string,
    ipAddress?: string
  ): Promise<Quote> {
    const quote = await prisma.quote.findFirst({
      where: {
        id: quoteId,
        deletedAt: null
      },
      include: {
        acceptanceTokens: {
          where: {
            status: 'ACTIVE',
            invalidated: false
          }
        },
        customer: {
          include: {
            person: true,
            business: true
          }
        },
        organization: true
      }
    });

    if (!quote) {
      throw new Error('Quote not found');
    }

    if (quote.status !== QuoteStatus.SENT) {
      throw new Error('Quote must be in SENT status to reject');
    }

    // Verify token
    const validToken = await this.verifyAcceptanceToken(
      quoteId,
      acceptanceToken,
      quote.acceptanceTokens
    );

    if (!validToken) {
      throw new Error('Invalid or expired acceptance token');
    }

    const rejectedQuote = await prisma.$transaction(async (tx) => {
      // Update quote
      const updated = await tx.quote.update({
        where: { id: quoteId },
        data: {
          status: QuoteStatus.REJECTED,
          rejectedAt: new Date(),
          rejectionReason: reason
        },
        include: {
          customer: {
            include: {
              person: true,
              business: true
            }
          }
        }
      });

      // Invalidate all tokens
      await tx.quoteAcceptanceToken.updateMany({
        where: {
          quoteId,
          status: 'ACTIVE'
        },
        data: {
          status: 'INVALIDATED',
          invalidated: true,
          usedAt: new Date(),
          acceptedBy: customerEmail,
          ipAddressUsed: ipAddress
        }
      });

      return updated;
    });

    // Notify admin
    this.sendQuoteRejectionEmail(quote, reason || 'No reason provided')
      .catch(error => {
        logger.error('Failed to send quote rejection email', {
          error,
          quoteId
        });
      });

    logger.info('Quote rejected by customer', {
      quoteId,
      organizationId: quote.organizationId,
      customerEmail,
      reason
    });

    return rejectedQuote;
  }

  /**
   * Send quote email to customer
   */
  private async sendQuoteEmail(
    originalQuote: any,
    updatedQuote: any,
    customMessage: string | undefined,
    organizationId: string
  ): Promise<void> {
    try {
      const customer = updatedQuote.customer;
      const organization = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: {
          name: true,
          settings: true
        }
      });

      const orgSettings = organization?.settings ? JSON.parse(organization.settings) : {};

      // Get customer email
      const customerEmail = customer.person?.email || customer.business?.email;
      if (!customerEmail) {
        logger.warn('No customer email found for quote', { quoteId: updatedQuote.id });
        return;
      }

      const customerName = customer.person
        ? `${customer.person.firstName} ${customer.person.lastName}`
        : customer.business?.legalName || 'Customer';

      const viewUrl = `${config.FRONTEND_URL}/public/quotes/${updatedQuote.id}/view?token=${updatedQuote.publicViewToken}`;
      const acceptUrl = `${config.FRONTEND_URL}/public/quotes/${updatedQuote.id}/accept?token=${updatedQuote.acceptanceToken}`;

      const emailData = {
        organizationName: organization?.name || 'Lifestream Dynamics',
        organizationPhone: orgSettings.phone || config.ORGANIZATION_PHONE,
        organizationEmail: orgSettings.email || config.ORGANIZATION_EMAIL,
        subject: `Your Quote #${updatedQuote.quoteNumber} is Ready`,
        customerName,
        quoteNumber: updatedQuote.quoteNumber,
        quoteTotal: updatedQuote.total,
        quoteDescription: updatedQuote.description,
        customMessage,
        viewUrl,
        acceptUrl,
        expiresAt: updatedQuote.expiresAt,
        items: updatedQuote.items
      };

      const email = await emailTemplateService.render('quote/quote-sent', emailData);

      await emailService.sendEmail(
        customerEmail,
        email.subject,
        email.html,
        email.text
      );

      logger.info('Quote email sent to customer', {
        email: customerEmail,
        quoteNumber: updatedQuote.quoteNumber
      });
    } catch (error) {
      logger.error('Error sending quote email', error);
      throw error;
    }
  }

  /**
   * Send quote acceptance confirmation emails
   */
  private async sendQuoteAcceptanceEmails(
    originalQuote: any,
    acceptedQuote: any,
    customerEmail: string,
    bookingToken?: string
  ): Promise<void> {
    try {
      const organization = await prisma.organization.findUnique({
        where: { id: originalQuote.organizationId },
        select: {
          name: true,
          settings: true
        }
      });

      const orgSettings = organization?.settings ? JSON.parse(organization.settings) : {};

      const customer = acceptedQuote.customer;
      const customerName = customer.person
        ? `${customer.person.firstName} ${customer.person.lastName}`
        : customer.business?.legalName || 'Customer';

      // Build booking URL with token if available
      const bookingUrl = bookingToken
        ? `${config.FRONTEND_URL}/public/appointments/book?quoteId=${acceptedQuote.id}&token=${bookingToken}`
        : `${config.FRONTEND_URL}/public/appointments/book?quoteId=${acceptedQuote.id}`;

      // 1. Send customer confirmation
      const customerEmailData = {
        organizationName: organization?.name || 'Lifestream Dynamics',
        organizationPhone: orgSettings.phone || config.ORGANIZATION_PHONE,
        organizationEmail: orgSettings.email || config.ORGANIZATION_EMAIL,
        subject: `Quote #${acceptedQuote.quoteNumber} Accepted - Book Your Appointment`,
        customerName,
        quoteNumber: acceptedQuote.quoteNumber,
        quoteTotal: acceptedQuote.total,
        bookingUrl,
        hasBookingToken: !!bookingToken
      };

      const customerEmailTemplate = await emailTemplateService.render(
        'quote/quote-accepted-customer',
        customerEmailData
      );

      await emailService.sendEmail(
        customerEmail,
        customerEmailTemplate.subject,
        customerEmailTemplate.html,
        customerEmailTemplate.text
      );

      // 2. Send admin notification
      const admins = await prisma.user.findMany({
        where: {
          organizationId: originalQuote.organizationId,
          role: { in: ['SUPER_ADMIN', 'ADMIN', 'MANAGER'] },
          isActive: true
        },
        select: { email: true }
      });

      if (admins.length > 0) {
        const adminEmailData = {
          organizationName: organization?.name || 'Lifestream Dynamics',
          subject: `🎉 Quote #${acceptedQuote.quoteNumber} Accepted!`,
          customerName,
          customerEmail,
          quoteNumber: acceptedQuote.quoteNumber,
          quoteTotal: acceptedQuote.total,
          dashboardUrl: `${config.FRONTEND_URL}/dashboard/quotes/${acceptedQuote.id}`
        };

        const adminEmailTemplate = await emailTemplateService.render(
          'quote/quote-accepted-admin',
          adminEmailData
        );

        await emailService.sendEmail(
          admins.map(a => a.email),
          adminEmailTemplate.subject,
          adminEmailTemplate.html,
          adminEmailTemplate.text
        );
      }

      logger.info('Quote acceptance emails sent', {
        quoteNumber: acceptedQuote.quoteNumber
      });
    } catch (error) {
      logger.error('Error sending quote acceptance emails', error);
      throw error;
    }
  }

  /**
   * Send quote rejection notification to admin
   */
  private async sendQuoteRejectionEmail(
    quote: any,
    reason: string
  ): Promise<void> {
    try {
      const organization = await prisma.organization.findUnique({
        where: { id: quote.organizationId },
        select: {
          name: true,
          settings: true
        }
      });

      const customer = quote.customer;
      const customerName = customer.person
        ? `${customer.person.firstName} ${customer.person.lastName}`
        : customer.business?.legalName || 'Customer';

      const customerEmail = customer.person?.email || customer.business?.email;

      const admins = await prisma.user.findMany({
        where: {
          organizationId: quote.organizationId,
          role: { in: ['SUPER_ADMIN', 'ADMIN', 'MANAGER'] },
          isActive: true
        },
        select: { email: true }
      });

      if (admins.length > 0) {
        const emailData = {
          organizationName: organization?.name || 'Lifestream Dynamics',
          subject: `Quote #${quote.quoteNumber} Rejected`,
          customerName,
          customerEmail,
          quoteNumber: quote.quoteNumber,
          quoteTotal: quote.total,
          rejectionReason: reason,
          dashboardUrl: `${config.FRONTEND_URL}/dashboard/quotes/${quote.id}`
        };

        const emailTemplate = await emailTemplateService.render(
          'quote/quote-rejected-admin',
          emailData
        );

        await emailService.sendEmail(
          admins.map(a => a.email),
          emailTemplate.subject,
          emailTemplate.html,
          emailTemplate.text
        );

        logger.info('Quote rejection email sent to admins', {
          quoteNumber: quote.quoteNumber
        });
      }
    } catch (error) {
      logger.error('Error sending quote rejection email', error);
      throw error;
    }
  }

  /**
   * Generate cryptographically secure token
   */
  private generateToken(): { token: string; tokenHash: string } {
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = bcrypt.hashSync(token, 10);
    return { token, tokenHash };
  }

  /**
   * Verify acceptance token
   */
  private async verifyAcceptanceToken(
    quoteId: string,
    token: string,
    tokens: QuoteAcceptanceToken[]
  ): Promise<QuoteAcceptanceToken | null> {
    for (const tokenRecord of tokens) {
      // Check expiration
      if (tokenRecord.expiresAt < new Date()) {
        continue;
      }

      // Verify hash
      const isValid = await bcrypt.compare(token, tokenRecord.tokenHash);
      if (isValid) {
        return tokenRecord;
      }
    }

    return null;
  }

  /**
   * Expire old quotes (to be called by cron job)
   */
  public async expireOldQuotes(): Promise<number> {
    const expiredQuotes = await prisma.quote.updateMany({
      where: {
        status: QuoteStatus.SENT,
        expiresAt: {
          lt: new Date()
        },
        deletedAt: null
      },
      data: {
        status: QuoteStatus.EXPIRED
      }
    });

    logger.info('Expired old quotes', { count: expiredQuotes.count });
    return expiredQuotes.count;
  }
}

export const quoteLifecycleService = new QuoteLifecycleService();