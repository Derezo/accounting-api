import { emailQueueService } from '../services/email-queue.service';
import { Invoice, Quote, User, Appointment, Payment, Customer, Organization, Person, Business } from '@prisma/client';
import { logger } from './logger';

/**
 * Type for Customer with related Person or Business contact info
 */
type CustomerWithContact = Customer & {
  person?: Person | null;
  business?: Business | null;
};

/**
 * Helper to get customer email
 */
function getCustomerEmail(customer: CustomerWithContact): string {
  if (customer.person?.email) {
    return customer.person.email;
  }
  if (customer.business?.email) {
    return customer.business.email;
  }
  return '';
}

/**
 * Helper to get customer name
 */
function getCustomerName(customer: CustomerWithContact): string {
  if (customer.person) {
    return `${customer.person.firstName} ${customer.person.lastName}`;
  }
  if (customer.business) {
    return customer.business.legalName || customer.business.tradeName || 'Customer';
  }
  return 'Customer';
}

/**
 * Send invoice email to customer
 */
export async function sendInvoiceEmail(
  invoice: Invoice & {
    customer: CustomerWithContact;
    organization: Organization;
    items?: any[];
  },
  userId: string
): Promise<void> {
  try {
    const customerEmail = getCustomerEmail(invoice.customer);
    if (!customerEmail) {
      logger.warn('Cannot send invoice email - customer has no email', {
        invoiceId: invoice.id,
        customerId: invoice.customer.id
      });
      return;
    }

    const appUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
    const paymentUrl = `${appUrl}/pay/${invoice.id}`;
    const viewUrl = `${appUrl}/invoices/${invoice.id}`;

    await emailQueueService.queueEmail({
      to: customerEmail,
      template: 'invoice/invoice-sent',
      templateData: {
        subject: `Invoice ${invoice.invoiceNumber} from ${invoice.organization.name}`,
        organizationName: invoice.organization.name,
        organizationEmail: invoice.organization.email || undefined,
        organizationPhone: invoice.organization.phone || undefined,

        // Invoice data
        invoiceNumber: invoice.invoiceNumber,
        customerName: getCustomerName(invoice.customer),
        issueDate: invoice.issueDate,
        dueDate: invoice.dueDate,
        totalAmount: invoice.total.toNumber(),
        depositRequired: invoice.depositRequired ? invoice.depositRequired.toNumber() : undefined,
        currency: invoice.currency,
        terms: invoice.terms || undefined,
        notes: invoice.notes || undefined,
        items: invoice.items || [],

        // URLs
        paymentUrl,
        viewUrl
      },
      organizationId: invoice.organizationId,
      userId,
      priority: 'normal'
    });

    logger.info('Invoice email queued', {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      customerEmail
    });
  } catch (error) {
    logger.error('Failed to queue invoice email', {
      invoiceId: invoice.id,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}

/**
 * Send quote email to customer
 */
export async function sendQuoteEmail(
  quote: Quote & {
    customer: CustomerWithContact;
    organization: Organization;
    items?: any[];
  },
  userId: string
): Promise<void> {
  try {
    const customerEmail = getCustomerEmail(quote.customer);
    if (!customerEmail) {
      logger.warn('Cannot send quote email - customer has no email', {
        quoteId: quote.id,
        customerId: quote.customer.id
      });
      return;
    }

    const appUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
    const viewUrl = `${appUrl}/quotes/${quote.id}`;
    const acceptUrl = `${appUrl}/public/quotes/${quote.acceptanceToken}/accept`;

    await emailQueueService.queueEmail({
      to: customerEmail,
      template: 'quote/quote-sent',
      templateData: {
        subject: `Quote ${quote.quoteNumber} from ${quote.organization.name}`,
        organizationName: quote.organization.name,
        organizationEmail: quote.organization.email || undefined,
        organizationPhone: quote.organization.phone || undefined,

        // Quote data
        quoteNumber: quote.quoteNumber,
        customerName: getCustomerName(quote.customer),
        issueDate: quote.createdAt,
        validUntil: quote.validUntil,
        totalAmount: quote.total.toNumber(),
        currency: quote.currency,
        terms: quote.terms || undefined,
        notes: quote.notes || undefined,
        items: quote.items || [],

        // URLs
        viewUrl,
        acceptUrl
      },
      organizationId: quote.organizationId,
      userId,
      priority: 'normal'
    });

    logger.info('Quote email queued', {
      quoteId: quote.id,
      quoteNumber: quote.quoteNumber,
      customerEmail
    });
  } catch (error) {
    logger.error('Failed to queue quote email', {
      quoteId: quote.id,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}

/**
 * Send user invite email
 */
export async function sendUserInviteEmail(
  user: User,
  organization: Pick<Organization, 'name'>,
  invitedByName: string,
  inviteToken: string,
  organizationId: string,
  userId: string
): Promise<void> {
  try {
    const appUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
    const acceptUrl = `${appUrl}/accept-invite?token=${inviteToken}`;

    await emailQueueService.queueEmail({
      to: user.email,
      template: 'user/user-invite',
      templateData: {
        subject: `You've been invited to join ${organization.name}`,
        organizationName: organization.name,

        // User data
        email: user.email,
        firstName: user.firstName || undefined,
        lastName: user.lastName || undefined,
        role: user.role,

        // Invite data
        invitedByName,
        acceptUrl
      },
      organizationId,
      userId,
      priority: 'high'
    });

    logger.info('User invite email queued', {
      userId: user.id,
      userEmail: user.email,
      organizationId
    });
  } catch (error) {
    logger.error('Failed to queue user invite email', {
      userId: user.id,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}

/**
 * Send payment confirmation email
 */
export async function sendPaymentConfirmation(
  payment: Payment & {
    customer: CustomerWithContact;
    organization: Organization;
    invoice?: (Invoice | null);
  },
  userId?: string
): Promise<void> {
  try {
    const customerEmail = getCustomerEmail(payment.customer);
    if (!customerEmail) {
      logger.warn('Cannot send payment confirmation - customer has no email', {
        paymentId: payment.id,
        customerId: payment.customer.id
      });
      return;
    }

    const appUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
    const receiptUrl = `${appUrl}/receipts/${payment.id}`;
    const accountUrl = `${appUrl}/account`;

    const remainingBalance = payment.invoice
      ? payment.invoice.balance.toNumber()
      : undefined;

    await emailQueueService.queueEmail({
      to: customerEmail,
      template: 'payment/payment-confirmation',
      templateData: {
        subject: `Payment Confirmation - ${payment.paymentNumber}`,
        organizationName: payment.organization.name,
        organizationEmail: payment.organization.email || undefined,
        organizationPhone: payment.organization.phone || undefined,

        // Payment data
        paymentNumber: payment.paymentNumber,
        amount: payment.amount.toNumber(),
        currency: payment.currency,
        paymentMethod: payment.paymentMethod,
        paymentDate: payment.paymentDate,
        customerName: getCustomerName(payment.customer),
        confirmationCode: payment.referenceNumber || undefined,
        referenceNumber: payment.referenceNumber || undefined,

        // Invoice data
        invoiceNumber: payment.invoice?.invoiceNumber || undefined,
        remainingBalance: remainingBalance && remainingBalance > 0 ? remainingBalance : undefined,

        // URLs
        receiptUrl,
        accountUrl,

        // Notes
        notes: payment.customerNotes || payment.adminNotes || undefined
      },
      organizationId: payment.organizationId,
      userId: userId || 'system',
      priority: 'high'
    });

    logger.info('Payment confirmation email queued', {
      paymentId: payment.id,
      paymentNumber: payment.paymentNumber,
      customerEmail
    });
  } catch (error) {
    logger.error('Failed to queue payment confirmation email', {
      paymentId: payment.id,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}

/**
 * Send appointment reminder email
 */
export async function sendAppointmentReminder(
  appointment: Appointment & {
    customer: CustomerWithContact;
    organization: Organization;
  }
): Promise<void> {
  try {
    const customerEmail = getCustomerEmail(appointment.customer);
    if (!customerEmail) {
      logger.warn('Cannot send appointment reminder - customer has no email', {
        appointmentId: appointment.id,
        customerId: appointment.customer.id
      });
      return;
    }

    await emailQueueService.queueEmail({
      to: customerEmail,
      template: 'appointment/appointment-reminder',
      templateData: {
        subject: `Reminder: Appointment Tomorrow - ${appointment.title}`,
        organizationName: appointment.organization.name,
        organizationEmail: appointment.organization.email || undefined,
        organizationPhone: appointment.organization.phone || undefined,

        // Appointment data
        customerName: getCustomerName(appointment.customer),
        title: appointment.title,
        description: appointment.description || undefined,
        startTime: appointment.startTime,
        endTime: appointment.endTime,
        duration: appointment.duration,
        location: appointment.locationId || undefined
      },
      organizationId: appointment.organizationId,
      priority: 'high'
    });

    logger.info('Appointment reminder email queued', {
      appointmentId: appointment.id,
      customerEmail
    });
  } catch (error) {
    logger.error('Failed to queue appointment reminder email', {
      appointmentId: appointment.id,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    // Don't throw - reminder emails are best-effort
  }
}

/**
 * Send appointment confirmation email
 */
export async function sendAppointmentConfirmation(
  appointment: Appointment & {
    customer: CustomerWithContact;
    organization: Organization;
  },
  userId: string
): Promise<void> {
  try {
    const customerEmail = getCustomerEmail(appointment.customer);
    if (!customerEmail) {
      logger.warn('Cannot send appointment confirmation - customer has no email', {
        appointmentId: appointment.id,
        customerId: appointment.customer.id
      });
      return;
    }

    const appUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
    const appointmentUrl = `${appUrl}/appointments/${appointment.id}`;

    await emailQueueService.queueEmail({
      to: customerEmail,
      template: 'appointment/appointment-confirmed-customer',
      templateData: {
        subject: `Appointment Confirmed - ${appointment.title}`,
        organizationName: appointment.organization.name,
        organizationEmail: appointment.organization.email || undefined,
        organizationPhone: appointment.organization.phone || undefined,

        // Appointment data
        customerName: getCustomerName(appointment.customer),
        title: appointment.title,
        description: appointment.description || undefined,
        startTime: appointment.startTime,
        endTime: appointment.endTime,
        duration: appointment.duration,
        location: appointment.locationId || undefined,

        // URLs
        appointmentUrl
      },
      organizationId: appointment.organizationId,
      userId,
      priority: 'high'
    });

    logger.info('Appointment confirmation email queued', {
      appointmentId: appointment.id,
      customerEmail
    });
  } catch (error) {
    logger.error('Failed to queue appointment confirmation email', {
      appointmentId: appointment.id,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}
