import { prisma } from '../config/database';
import { Appointment, AppointmentBookingToken, Quote } from '@prisma/client';
import { logger } from '../utils/logger';
import { googleMeetService } from './google-meet.service';
import { emailTemplateService } from './email-template.service';
import { emailService } from './email.service';
import { config } from '../config/config';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';

/**
 * AppointmentAvailabilityService
 * Manages appointment booking tokens, availability, and booking flow
 */
export class AppointmentAvailabilityService {

  /**
   * Generate booking token for accepted quote
   * Called automatically when quote is accepted
   */
  public async generateBookingToken(
    quoteId: string,
    organizationId: string,
    generatedBy?: string
  ): Promise<{ token: string; bookingToken: AppointmentBookingToken }> {
    // Verify quote is accepted
    const quote = await prisma.quote.findFirst({
      where: {
        id: quoteId,
        organizationId,
        status: 'ACCEPTED',
        deletedAt: null
      }
    });

    if (!quote) {
      throw new Error('Quote not found or not in ACCEPTED status');
    }

    // Check if token already exists and is active
    const existingToken = await prisma.appointmentBookingToken.findFirst({
      where: {
        quoteId,
        status: 'ACTIVE',
        invalidated: false
      }
    });

    if (existingToken) {
      logger.info('Booking token already exists for quote', { quoteId });
      // Return existing token (we can't return the plain text token, so generate a new one)
      // In production, you might want to handle this differently
    }

    // Generate token
    const { token, tokenHash } = this.generateToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    const bookingToken = await prisma.appointmentBookingToken.create({
      data: {
        quoteId,
        organizationId,
        tokenHash,
        expiresAt
      }
    });

    logger.info('Appointment booking token generated', {
      quoteId,
      organizationId,
      tokenId: bookingToken.id
    });

    return { token, bookingToken };
  }

  /**
   * Validate booking token
   */
  public async validateBookingToken(
    quoteId: string,
    token: string
  ): Promise<{ valid: boolean; bookingToken?: AppointmentBookingToken; quote?: Quote }> {
    const bookingTokens = await prisma.appointmentBookingToken.findMany({
      where: {
        quoteId,
        status: 'ACTIVE',
        invalidated: false
      }
    });

    for (const tokenRecord of bookingTokens) {
      // Check expiration
      if (tokenRecord.expiresAt < new Date()) {
        continue;
      }

      // Verify hash
      const isValid = await bcrypt.compare(token, tokenRecord.tokenHash);
      if (isValid) {
        // Fetch quote
        const quote = await prisma.quote.findUnique({
          where: { id: quoteId },
          include: {
            customer: {
              include: {
                person: true,
                business: true
              }
            }
          }
        });

        if (!quote) {
          return { valid: false };
        }

        return { valid: true, bookingToken: tokenRecord, quote };
      }
    }

    return { valid: false };
  }

  /**
   * Get available time slots for appointment
   * Integrates with Google Calendar if configured
   */
  public async getAvailableSlots(
    quoteId: string,
    token: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<Array<{ start: Date; end: Date }>> {
    // Validate token
    const validation = await this.validateBookingToken(quoteId, token);
    if (!validation.valid) {
      throw new Error('Invalid or expired booking token');
    }

    // Default date range: next 14 days
    const searchStart = startDate || new Date();
    const searchEnd = endDate || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    // Default appointment duration: 60 minutes
    const duration = 60;

    // Get available slots from Google Calendar or generate default slots
    const availableSlots = await googleMeetService.getAvailableSlots(
      searchStart,
      searchEnd,
      duration
    );

    logger.info('Retrieved available appointment slots', {
      quoteId,
      count: availableSlots.length,
      startDate: searchStart,
      endDate: searchEnd
    });

    return availableSlots;
  }

  /**
   * Book appointment
   */
  public async bookAppointment(
    quoteId: string,
    token: string,
    appointmentDetails: {
      startTime: Date;
      endTime: Date;
      customerEmail: string;
      customerName: string;
      customerPhone?: string;
      notes?: string;
    },
    ipAddress?: string
  ): Promise<Appointment> {
    // Validate token
    const validation = await this.validateBookingToken(quoteId, token);
    if (!validation.valid || !validation.bookingToken || !validation.quote) {
      throw new Error('Invalid or expired booking token');
    }

    const { bookingToken, quote } = validation;

    // Check if token is already used
    if (bookingToken.status === 'USED') {
      throw new Error('Booking token has already been used');
    }

    // Validate appointment time is in the future
    if (appointmentDetails.startTime < new Date()) {
      throw new Error('Appointment time must be in the future');
    }

    // Note: We don't validate email against customer here because the quote from validateBookingToken
    // includes the customer relation. We trust the token validation.

    // Calculate duration
    const duration = Math.round(
      (appointmentDetails.endTime.getTime() - appointmentDetails.startTime.getTime()) / (60 * 1000)
    );

    let meetingLink: string | undefined;
    let meetingId: string | undefined;

    // Try to create Google Meet link
    try {
      if (googleMeetService.isConfigured()) {
        const organization = await prisma.organization.findUnique({
          where: { id: quote.organizationId }
        });

        const orgSettings = organization?.settings ? JSON.parse(organization.settings) : {};

        const meeting = await googleMeetService.createMeeting({
          title: `Appointment - Quote #${quote.quoteNumber}`,
          description: `Appointment for quote ${quote.quoteNumber}: ${quote.description}`,
          startTime: appointmentDetails.startTime,
          endTime: appointmentDetails.endTime,
          customerEmail: appointmentDetails.customerEmail,
          customerName: appointmentDetails.customerName,
          organizationEmail: orgSettings.email || organization?.email || config.ORGANIZATION_EMAIL
        });

        meetingLink = meeting.meetingLink;
        meetingId = meeting.meetingId;
      } else {
        // Use fallback link generation
        const fallback = googleMeetService.generateFallbackLink(`temp-${quoteId}`);
        meetingLink = fallback.meetingLink;
        meetingId = fallback.meetingId;
      }
    } catch (error: any) {
      logger.error('Failed to create meeting link', {
        error: error.message,
        quoteId
      });
      // Continue without meeting link - we'll include fallback in emails
    }

    // Create appointment
    const appointment = await prisma.$transaction(async (tx) => {
      // Create appointment
      const newAppointment = await tx.appointment.create({
        data: {
          organizationId: quote.organizationId,
          customerId: quote.customerId,
          quoteId,
          title: `Appointment - Quote #${quote.quoteNumber}`,
          description: appointmentDetails.notes || `Appointment for quote ${quote.quoteNumber}`,
          startTime: appointmentDetails.startTime,
          endTime: appointmentDetails.endTime,
          duration,
          meetingLink,
          meetingId,
          confirmed: true,
          createdBy: 'public-booking'
        }
      });

      // Mark token as used
      await tx.appointmentBookingToken.update({
        where: { id: bookingToken.id },
        data: {
          status: 'USED',
          usedAt: new Date(),
          appointmentId: newAppointment.id,
          bookedBy: appointmentDetails.customerEmail,
          bookedIp: ipAddress,
          bookingNotes: appointmentDetails.notes
        }
      });

      // Update Google Meet link with actual appointment ID if using fallback
      if (meetingLink && meetingId?.startsWith('fallback-')) {
        const actualFallback = googleMeetService.generateFallbackLink(newAppointment.id);
        await tx.appointment.update({
          where: { id: newAppointment.id },
          data: {
            meetingLink: actualFallback.meetingLink,
            meetingId: actualFallback.meetingId
          }
        });
      }

      return newAppointment;
    });

    logger.info('Appointment booked successfully', {
      appointmentId: appointment.id,
      quoteId,
      customerEmail: appointmentDetails.customerEmail
    });

    // Send confirmation emails (non-blocking)
    this.sendAppointmentConfirmationEmails(
      appointment,
      quote,
      appointmentDetails.customerEmail,
      appointmentDetails.customerName,
      appointmentDetails.customerPhone
    ).catch(error => {
      logger.error('Failed to send appointment confirmation emails', {
        error,
        appointmentId: appointment.id
      });
    });

    return appointment;
  }

  /**
   * Get appointment details (for customer confirmation page)
   */
  public async getAppointmentDetails(
    appointmentId: string,
    token: string
  ): Promise<any> {
    // Find appointment
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        quote: {
          include: {
            customer: {
              include: {
                person: true,
                business: true
              }
            }
          }
        }
      }
    });

    if (!appointment || !appointment.quote) {
      throw new Error('Appointment not found');
    }

    // Validate token
    const validation = await this.validateBookingToken(appointment.quoteId!, token);
    if (!validation.valid) {
      throw new Error('Invalid or expired token');
    }

    return appointment;
  }

  /**
   * Send appointment confirmation emails
   */
  private async sendAppointmentConfirmationEmails(
    appointment: Appointment,
    quote: any,
    customerEmail: string,
    customerName: string,
    customerPhone?: string
  ): Promise<void> {
    try {
      const organization = await prisma.organization.findUnique({
        where: { id: appointment.organizationId },
        select: {
          name: true,
          settings: true
        }
      });

      const orgSettings = organization?.settings ? JSON.parse(organization.settings) : {};

      const emailData = {
        organizationName: organization?.name || 'Lifestream Dynamics',
        organizationPhone: orgSettings.phone || config.ORGANIZATION_PHONE,
        organizationEmail: orgSettings.email || config.ORGANIZATION_EMAIL,
        customerName,
        customerEmail,
        customerPhone,
        quoteNumber: quote.quoteNumber,
        appointmentId: appointment.id,
        appointmentTitle: appointment.title,
        appointmentDescription: appointment.description,
        startTime: appointment.startTime,
        endTime: appointment.endTime,
        duration: appointment.duration,
        meetingLink: appointment.meetingLink,
        meetingId: appointment.meetingId,
        hasGoogleMeet: googleMeetService.isConfigured(),
        dashboardUrl: `${config.FRONTEND_URL}/dashboard/appointments/${appointment.id}`
      };

      // 1. Send customer confirmation
      const customerEmailTemplate = await emailTemplateService.render(
        'appointment/appointment-confirmed-customer',
        {
          ...emailData,
          subject: `Appointment Confirmed - ${appointment.title}`
        }
      );

      await emailService.sendEmail(
        customerEmail,
        customerEmailTemplate.subject,
        customerEmailTemplate.html,
        customerEmailTemplate.text
      );

      logger.info('Sent appointment confirmation to customer', {
        email: customerEmail,
        appointmentId: appointment.id
      });

      // 2. Send admin notification
      const admins = await prisma.user.findMany({
        where: {
          organizationId: appointment.organizationId,
          role: { in: ['SUPER_ADMIN', 'ADMIN', 'MANAGER'] },
          isActive: true
        },
        select: { email: true }
      });

      if (admins.length > 0) {
        const adminEmailTemplate = await emailTemplateService.render(
          'appointment/appointment-confirmed-admin',
          {
            ...emailData,
            subject: `New Appointment Booked - ${appointment.title}`
          }
        );

        await emailService.sendEmail(
          admins.map(a => a.email),
          adminEmailTemplate.subject,
          adminEmailTemplate.html,
          adminEmailTemplate.text
        );

        logger.info('Sent appointment notification to admins', {
          adminCount: admins.length,
          appointmentId: appointment.id
        });
      }
    } catch (error) {
      logger.error('Error sending appointment confirmation emails', error);
      throw error;
    }
  }

  /**
   * Cancel appointment
   */
  public async cancelAppointment(
    appointmentId: string,
    reason?: string
  ): Promise<Appointment> {
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        quote: {
          include: {
            customer: {
              include: {
                person: true,
                business: true
              }
            }
          }
        }
      }
    });

    if (!appointment) {
      throw new Error('Appointment not found');
    }

    if (appointment.cancelled) {
      throw new Error('Appointment is already cancelled');
    }

    // Cancel in database
    const cancelled = await prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        cancelled: true,
        cancellationReason: reason
      }
    });

    // Cancel Google Meet event if exists
    if (appointment.meetingId && googleMeetService.isConfigured()) {
      try {
        // Extract event ID from meeting ID (Google Calendar event ID)
        // This is a simplification - in production, you'd store the eventId separately
        await googleMeetService.cancelMeeting(appointment.meetingId, reason);
      } catch (error: any) {
        logger.error('Failed to cancel Google Meet event', {
          error: error.message,
          appointmentId
        });
        // Continue even if Google Calendar cancellation fails
      }
    }

    // Send cancellation emails
    this.sendAppointmentCancellationEmails(appointment, reason).catch(error => {
      logger.error('Failed to send cancellation emails', {
        error,
        appointmentId
      });
    });

    logger.info('Appointment cancelled', {
      appointmentId,
      reason
    });

    return cancelled;
  }

  /**
   * Send appointment cancellation emails
   */
  private async sendAppointmentCancellationEmails(
    appointment: any,
    reason?: string
  ): Promise<void> {
    try {
      const organization = await prisma.organization.findUnique({
        where: { id: appointment.organizationId },
        select: {
          name: true,
          settings: true
        }
      });

      const orgSettings = organization?.settings ? JSON.parse(organization.settings) : {};

      const customer = appointment.quote.customer;
      const customerEmail = customer.person?.email || customer.business?.email;
      const customerName = customer.person
        ? `${customer.person.firstName} ${customer.person.lastName}`
        : customer.business?.legalName || 'Customer';

      if (!customerEmail) {
        logger.warn('No customer email for cancellation notification', {
          appointmentId: appointment.id
        });
        return;
      }

      const emailData = {
        organizationName: organization?.name || 'Lifestream Dynamics',
        organizationPhone: orgSettings.phone || config.ORGANIZATION_PHONE,
        organizationEmail: orgSettings.email || config.ORGANIZATION_EMAIL,
        subject: `Appointment Cancelled - ${appointment.title}`,
        customerName,
        appointmentTitle: appointment.title,
        startTime: appointment.startTime,
        cancellationReason: reason || 'No reason provided'
      };

      const emailTemplate = await emailTemplateService.render(
        'appointment/appointment-cancelled',
        emailData
      );

      await emailService.sendEmail(
        customerEmail,
        emailTemplate.subject,
        emailTemplate.html,
        emailTemplate.text
      );

      logger.info('Sent cancellation email to customer', {
        email: customerEmail,
        appointmentId: appointment.id
      });
    } catch (error) {
      logger.error('Error sending cancellation emails', error);
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
   * Send appointment reminder (for future cron job)
   */
  public async sendAppointmentReminder(appointmentId: string): Promise<void> {
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        quote: {
          include: {
            customer: {
              include: {
                person: true,
                business: true
              }
            }
          }
        }
      }
    });

    if (!appointment || !appointment.quote) {
      throw new Error('Appointment not found');
    }

    if (appointment.cancelled) {
      logger.info('Skipping reminder for cancelled appointment', { appointmentId });
      return;
    }

    if (appointment.reminderSent) {
      logger.info('Reminder already sent for appointment', { appointmentId });
      return;
    }

    const customer = appointment.quote.customer;
    const customerEmail = customer.person?.email || customer.business?.email;
    const customerName = customer.person
      ? `${customer.person.firstName} ${customer.person.lastName}`
      : customer.business?.legalName || 'Customer';

    if (!customerEmail) {
      logger.warn('No customer email for reminder', { appointmentId });
      return;
    }

    const organization = await prisma.organization.findUnique({
      where: { id: appointment.organizationId },
      select: {
        name: true,
        settings: true
      }
    });

    const orgSettings = organization?.settings ? JSON.parse(organization.settings) : {};

    const emailData = {
      organizationName: organization?.name || 'Lifestream Dynamics',
      organizationPhone: orgSettings.phone || config.ORGANIZATION_PHONE,
      organizationEmail: orgSettings.email || config.ORGANIZATION_EMAIL,
      subject: `Reminder: Your Appointment Tomorrow`,
      customerName,
      appointmentTitle: appointment.title,
      startTime: appointment.startTime,
      endTime: appointment.endTime,
      duration: appointment.duration,
      meetingLink: appointment.meetingLink
    };

    const emailTemplate = await emailTemplateService.render(
      'appointment/appointment-reminder',
      emailData
    );

    await emailService.sendEmail(
      customerEmail,
      emailTemplate.subject,
      emailTemplate.html,
      emailTemplate.text
    );

    // Mark reminder as sent
    await prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        reminderSent: true,
        reminderSentAt: new Date()
      }
    });

    logger.info('Sent appointment reminder', {
      email: customerEmail,
      appointmentId
    });
  }
}

export const appointmentAvailabilityService = new AppointmentAvailabilityService();