/**
 * SMS Service using Twilio
 * Handles SMS sending, delivery tracking, and rate limiting
 */

import twilio from 'twilio';
import { prisma } from '@/config/database';
import { logger } from '@/utils/logger';
import { auditService } from './audit.service';

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

interface SendSmsOptions {
  organizationId: string;
  customerId: string;
  appointmentId?: string;
  phoneNumber: string;
  message: string;
  messageType?: 'REMINDER' | 'CONFIRMATION' | 'CANCELLATION' | 'CUSTOM';
}

interface SmsTemplate {
  type: 'REMINDER_24H' | 'REMINDER_1H' | 'CONFIRMATION' | 'CANCELLATION';
  variables: Record<string, string>;
}

class SmsService {
  private readonly enabled: boolean;
  private readonly fromNumber: string;
  private readonly dailyLimit: number;

  constructor() {
    this.enabled = process.env.TWILIO_SMS_ENABLED === 'true';
    this.fromNumber = process.env.TWILIO_PHONE_NUMBER || '';
    this.dailyLimit = parseInt(process.env.SMS_DAILY_LIMIT_PER_CUSTOMER || '3', 10);
  }

  /**
   * Send SMS message
   */
  async sendSms(options: SendSmsOptions): Promise<string | null> {
    try {
      // Check if SMS is enabled
      if (!this.enabled) {
        logger.warn('SMS sending is disabled', { customerId: options.customerId });
        return null;
      }

      // Validate phone number
      const cleanedPhone = this.cleanPhoneNumber(options.phoneNumber);
      if (!cleanedPhone) {
        throw new Error('Invalid phone number');
      }

      // Check rate limit
      const canSend = await this.checkRateLimit(options.customerId, options.organizationId);
      if (!canSend) {
        logger.warn('SMS rate limit exceeded', {
          customerId: options.customerId,
          dailyLimit: this.dailyLimit,
        });
        throw new Error('Daily SMS limit exceeded for customer');
      }

      // Create SMS record
      const smsRecord = await prisma.smsMessage.create({
        data: {
          organizationId: options.organizationId,
          customerId: options.customerId,
          appointmentId: options.appointmentId,
          phoneNumber: cleanedPhone,
          message: options.message,
          messageType: options.messageType || 'CUSTOM',
          status: 'PENDING',
        },
      });

      // Send SMS via Twilio
      const twilioResponse = await twilioClient.messages.create({
        body: options.message,
        from: this.fromNumber,
        to: cleanedPhone,
        statusCallback: `${process.env.API_URL}/api/v1/webhooks/twilio/sms-status`,
      });

      // Update record with Twilio SID
      await prisma.smsMessage.update({
        where: { id: smsRecord.id },
        data: {
          twilioSid: twilioResponse.sid,
          status: 'SENT',
          sentAt: new Date(),
        },
      });

      // Audit log
      await auditService.logAction({
        action: 'SMS_SENT',
        entityType: 'SmsMessage',
        entityId: smsRecord.id,
        changes: {
          status: { after: 'SENT' },
          phoneNumber: { after: this.maskPhoneNumber(cleanedPhone) },
        },
        context: {
          organizationId: options.organizationId,
          userId: 'system',
          ipAddress: 'sms-service',
          userAgent: 'twilio',
        },
      });

      logger.info('SMS sent successfully', {
        smsId: smsRecord.id,
        twilioSid: twilioResponse.sid,
        customerId: options.customerId,
      });

      return smsRecord.id;
    } catch (error) {
      logger.error('Failed to send SMS', {
        error,
        customerId: options.customerId,
        phoneNumber: this.maskPhoneNumber(options.phoneNumber),
      });

      // Update SMS record if it was created
      if (error instanceof Error) {
        await prisma.smsMessage.updateMany({
          where: {
            customerId: options.customerId,
            status: 'PENDING',
            phoneNumber: this.cleanPhoneNumber(options.phoneNumber) || '',
          },
          data: {
            status: 'FAILED',
            failureReason: error.message,
          },
        });
      }

      return null;
    }
  }

  /**
   * Send appointment reminder (24 hours before)
   */
  async sendAppointmentReminder24h(appointmentId: string): Promise<string | null> {
    try {
      const appointment = await prisma.appointment.findUnique({
        where: { id: appointmentId },
        include: {
          customer: {
            include: {
              person: true,
              business: true,
            },
          },
          organization: true,
        },
      });

      if (!appointment) {
        throw new Error('Appointment not found');
      }

      const phoneNumber = appointment.customer.person?.phone || appointment.customer.business?.phone;
      if (!phoneNumber) {
        logger.warn('No phone number for customer', { appointmentId });
        return null;
      }

      const customerName = appointment.customer.person
        ? appointment.customer.person.firstName
        : appointment.customer.business?.legalName || 'Customer';

      const appointmentDate = new Date(appointment.startTime).toLocaleDateString('en-CA', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      const appointmentTime = new Date(appointment.startTime).toLocaleTimeString('en-CA', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });

      const message = `Hi ${customerName}, this is a reminder that you have an appointment ("${appointment.title}") with ${appointment.organization.name} on ${appointmentDate} at ${appointmentTime}. ${appointment.description ? `Details: ${appointment.description}.` : ''} See you soon!`;

      return await this.sendSms({
        organizationId: appointment.organizationId,
        customerId: appointment.customerId,
        appointmentId: appointment.id,
        phoneNumber,
        message,
        messageType: 'REMINDER',
      });
    } catch (error) {
      logger.error('Failed to send 24h reminder', { error, appointmentId });
      return null;
    }
  }

  /**
   * Send appointment reminder (1 hour before)
   */
  async sendAppointmentReminder1h(appointmentId: string): Promise<string | null> {
    try {
      const appointment = await prisma.appointment.findUnique({
        where: { id: appointmentId },
        include: {
          customer: {
            include: {
              person: true,
              business: true,
            },
          },
          organization: true,
        },
      });

      if (!appointment) {
        throw new Error('Appointment not found');
      }

      const phoneNumber = appointment.customer.person?.phone || appointment.customer.business?.phone;
      if (!phoneNumber) {
        return null;
      }

      const customerName = appointment.customer.person
        ? appointment.customer.person.firstName
        : appointment.customer.business?.legalName || 'Customer';

      const appointmentTime = new Date(appointment.startTime).toLocaleTimeString('en-CA', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });

      const message = `Hi ${customerName}, your appointment ("${appointment.title}") with ${appointment.organization.name} is in 1 hour at ${appointmentTime}. ${appointment.description ? `Details: ${appointment.description}.` : ''} We look forward to seeing you!`;

      return await this.sendSms({
        organizationId: appointment.organizationId,
        customerId: appointment.customerId,
        appointmentId: appointment.id,
        phoneNumber,
        message,
        messageType: 'REMINDER',
      });
    } catch (error) {
      logger.error('Failed to send 1h reminder', { error, appointmentId });
      return null;
    }
  }

  /**
   * Send appointment confirmation
   */
  async sendAppointmentConfirmation(appointmentId: string): Promise<string | null> {
    try {
      const appointment = await prisma.appointment.findUnique({
        where: { id: appointmentId },
        include: {
          customer: {
            include: {
              person: true,
              business: true,
            },
          },
          organization: true,
        },
      });

      if (!appointment) {
        throw new Error('Appointment not found');
      }

      const phoneNumber = appointment.customer.person?.phone || appointment.customer.business?.phone;
      if (!phoneNumber) {
        return null;
      }

      const customerName = appointment.customer.person
        ? appointment.customer.person.firstName
        : appointment.customer.business?.legalName || 'Customer';

      const appointmentDate = new Date(appointment.startTime).toLocaleDateString('en-CA', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      const appointmentTime = new Date(appointment.startTime).toLocaleTimeString('en-CA', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });

      const message = `Hi ${customerName}, your appointment ("${appointment.title}") with ${appointment.organization.name} is confirmed for ${appointmentDate} at ${appointmentTime}. ${appointment.description ? `Details: ${appointment.description}.` : ''} Thank you!`;

      return await this.sendSms({
        organizationId: appointment.organizationId,
        customerId: appointment.customerId,
        appointmentId: appointment.id,
        phoneNumber,
        message,
        messageType: 'CONFIRMATION',
      });
    } catch (error) {
      logger.error('Failed to send appointment confirmation', { error, appointmentId });
      return null;
    }
  }

  /**
   * Handle Twilio status webhook
   */
  async handleStatusWebhook(twilioSid: string, status: string, errorMessage?: string): Promise<void> {
    try {
      const smsRecord = await prisma.smsMessage.findFirst({
        where: { twilioSid },
      });

      if (!smsRecord) {
        logger.warn('SMS record not found for Twilio SID', { twilioSid });
        return;
      }

      const updateData: any = {
        status: status.toUpperCase(),
      };

      if (status === 'delivered') {
        updateData.deliveredAt = new Date();
      }

      if (status === 'failed' || status === 'undelivered') {
        updateData.failureReason = errorMessage || 'Delivery failed';
      }

      await prisma.smsMessage.update({
        where: { id: smsRecord.id },
        data: updateData,
      });

      logger.info('SMS status updated', {
        smsId: smsRecord.id,
        twilioSid,
        status,
      });
    } catch (error) {
      logger.error('Failed to handle SMS status webhook', {
        error,
        twilioSid,
        status,
      });
    }
  }

  /**
   * Check if customer has reached daily SMS limit
   */
  private async checkRateLimit(customerId: string, organizationId: string): Promise<boolean> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const count = await prisma.smsMessage.count({
      where: {
        customerId,
        organizationId,
        createdAt: {
          gte: today,
        },
        status: {
          in: ['SENT', 'DELIVERED'],
        },
      },
    });

    return count < this.dailyLimit;
  }

  /**
   * Clean and format phone number
   */
  private cleanPhoneNumber(phone: string): string | null {
    // Remove all non-numeric characters
    const cleaned = phone.replace(/\D/g, '');

    // Check if it's a valid length (10 or 11 digits)
    if (cleaned.length === 10) {
      return `+1${cleaned}`; // Add North America country code
    } else if (cleaned.length === 11 && cleaned.startsWith('1')) {
      return `+${cleaned}`;
    }

    return null;
  }

  /**
   * Mask phone number for logging
   */
  private maskPhoneNumber(phone: string): string {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length >= 4) {
      return `***-***-${cleaned.slice(-4)}`;
    }
    return '***-***-****';
  }
}

export const smsService = new SmsService();
