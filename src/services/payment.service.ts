import { Payment, Invoice, Customer } from '@prisma/client';
import Decimal from 'decimal.js';
import Stripe from 'stripe';
import { config } from '../config/config';
import { auditService } from './audit.service';
import { invoiceService } from './invoice.service';
import { PaymentMethod, PaymentStatus } from '../types/enums';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

let stripe: Stripe | null = null;
if (config.STRIPE_SECRET_KEY) {
  stripe = new Stripe(config.STRIPE_SECRET_KEY, {
    apiVersion: '2023-10-16'
  });
}

export interface CreatePaymentData {
  customerId: string;
  invoiceId?: string;
  amount: Decimal | string | number; // Accept multiple types for conversion
  currency?: string;
  paymentMethod: PaymentMethod;
  paymentDate?: Date;
  referenceNumber?: string;
  customerNotes?: string;
  adminNotes?: string;
  metadata?: Record<string, any>;
}

export interface CreateStripePaymentData {
  invoiceId: string;
  amount: number;
  currency?: string;
  customerEmail?: string;
  successUrl?: string;
  cancelUrl?: string;
  metadata?: Record<string, any>;
}

export interface ProcessStripeWebhookData {
  signature: string;
  payload: string | Buffer;
}

/**
 * Calculate Stripe processor fees
 * Standard Stripe pricing: 2.9% + $0.30 per successful card charge
 * @param amount - Payment amount in dollars
 * @returns Processor fee in dollars
 */
function calculateStripeProcessorFee(amount: number): number {
  const STRIPE_PERCENTAGE = 0.029; // 2.9%
  const STRIPE_FIXED_FEE = 0.30; // $0.30
  return new Decimal(amount).mul(STRIPE_PERCENTAGE).plus(STRIPE_FIXED_FEE).toDecimalPlaces(2).toNumber();
}

export interface ListPaymentsFilter {
  customerId?: string;
  invoiceId?: string;
  status?: PaymentStatus;
  paymentMethod?: PaymentMethod;
  startDate?: Date;
  endDate?: Date;
  minAmount?: number;
  maxAmount?: number;
}

export interface PaymentStats {
  totalPayments: number;
  totalAmount: number;
  averageAmount: number;
  paymentsByMethod: Record<PaymentMethod, number>;
  paymentsByStatus: Record<PaymentStatus, number>;
  recentPayments: number;
  pendingAmount: number;
}

export class PaymentService {
  private generatePaymentNumber(): string {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2, 8);
    return `PAY-${timestamp}-${random}`.toUpperCase();
  }

  async createPayment(
    data: CreatePaymentData,
    organizationId: string,
    auditContext: { userId?: string; ipAddress?: string; userAgent?: string }
  ): Promise<any> {
    // Verify customer exists and belongs to organization
    const customer = await prisma.customer.findFirst({
      where: {
        id: data.customerId,
        organizationId,
        deletedAt: null
      },
      include: {
        person: true,
        business: true
      }
    });

    if (!customer) {
      throw new Error('Customer not found');
    }

    // If invoice is specified, verify it exists and belongs to customer
    let invoice: Invoice | null = null;
    if (data.invoiceId) {
      invoice = await prisma.invoice.findFirst({
        where: {
          id: data.invoiceId,
          customerId: data.customerId,
          organizationId,
          deletedAt: null
        }
      });

      if (!invoice) {
        throw new Error('Invoice not found or does not belong to customer');
      }

      // Verify payment amount doesn't exceed remaining balance using proper Decimal comparison
      const remainingBalance = new Decimal(invoice.balance.toString());
      const paymentAmount = new Decimal(data.amount.toString());

      if (paymentAmount.greaterThan(remainingBalance)) {
        throw new Error(`Payment amount (${paymentAmount.toString()}) exceeds remaining balance (${remainingBalance.toString()})`);
      }
    }

    const paymentNumber = this.generatePaymentNumber();
    const paymentDate = data.paymentDate || new Date();
    const currency = data.currency || config.DEFAULT_CURRENCY;

    // Convert amount to Decimal for financial precision
    const paymentAmount = new Decimal(data.amount.toString());

    // HIGH-PRIORITY FIX: Calculate processor fees for Stripe payments
    let processorFee = new Decimal(0);
    let netAmount = paymentAmount;

    if (data.paymentMethod === PaymentMethod.STRIPE_CARD) {
      const feeAmount = calculateStripeProcessorFee(paymentAmount.toNumber());
      processorFee = new Decimal(feeAmount);
      netAmount = paymentAmount.minus(processorFee);
    }

    const payment = await prisma.payment.create({
      data: {
        organizationId,
        paymentNumber,
        customerId: data.customerId,
        invoiceId: data.invoiceId,
        paymentMethod: data.paymentMethod,
        amount: paymentAmount,
        currency,
        paymentDate,
        referenceNumber: data.referenceNumber,
        status: data.paymentMethod === PaymentMethod.STRIPE_CARD ? PaymentStatus.PENDING : PaymentStatus.COMPLETED,
        processorFee: processorFee,
        netAmount: netAmount,
        customerNotes: data.customerNotes,
        adminNotes: data.adminNotes,
        metadata: data.metadata ? JSON.stringify(data.metadata) : null,
        processedAt: data.paymentMethod !== PaymentMethod.STRIPE_CARD ? new Date() : null
      },
      include: {
        customer: {
          include: {
            person: true,
            business: true
          }
        },
        invoice: true
      }
    });

    // If payment is completed and linked to invoice, update invoice payment tracking
    if (payment.status === PaymentStatus.COMPLETED && payment.invoiceId) {
      await invoiceService.recordPayment(
        payment.invoiceId,
        payment.amount.toNumber(),
        organizationId,
        { userId: auditContext.userId || 'system', ipAddress: auditContext.ipAddress, userAgent: auditContext.userAgent }
      );
    }

    // Log payment creation
    await auditService.logAction({
      action: 'CREATE',
      entityType: 'Payment',
      entityId: payment.id,
      changes: { payment: payment },
      context: {
        organizationId,
        userId: auditContext.userId,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent
      }
    });

    return payment;
  }

  async createStripePayment(
    data: CreateStripePaymentData,
    organizationId: string,
    auditContext: { userId?: string; ipAddress?: string; userAgent?: string }
  ): Promise<{ paymentIntent: Stripe.PaymentIntent; payment: Payment }> {
    if (!stripe) {
      throw new Error('Stripe is not configured');
    }

    // Verify invoice exists and belongs to organization
    const invoice = await prisma.invoice.findFirst({
      where: {
        id: data.invoiceId,
        organizationId,
        deletedAt: null
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

    if (!invoice) {
      throw new Error('Invoice not found');
    }

    // Verify payment amount doesn't exceed remaining balance
    if (data.amount > invoice.balance.toNumber()) {
      throw new Error(`Payment amount (${data.amount}) exceeds remaining balance (${invoice.balance})`);
    }

    const currency = (data.currency || config.DEFAULT_CURRENCY).toLowerCase();

    // Use Decimal for precise currency conversion to cents (critical for financial accuracy)
    const amount = new Decimal(data.amount.toString());
    const amountInCents = amount.mul(100).round().toNumber();

    // Create Stripe PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency,
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: {
        organizationId,
        invoiceId: data.invoiceId,
        customerId: invoice.customerId,
        ...data.metadata
      }
    });

    // Create payment record in pending status
    const paymentNumber = this.generatePaymentNumber();
    const payment = await prisma.payment.create({
      data: {
        organizationId,
        paymentNumber,
        customerId: invoice.customerId,
        invoiceId: data.invoiceId,
        paymentMethod: PaymentMethod.STRIPE_CARD,
        amount: data.amount,
        currency: currency.toUpperCase(),
        paymentDate: new Date(),
        stripePaymentIntentId: paymentIntent.id,
        status: PaymentStatus.PENDING,
        metadata: data.metadata ? JSON.stringify(data.metadata) : null
      },
      include: {
        customer: {
          include: {
            person: true,
            business: true
          }
        },
        invoice: true
      }
    });

    // Log payment creation
    await auditService.logAction({
      action: 'CREATE',
      entityType: 'Payment',
      entityId: payment.id,
      changes: {
        payment: payment,
        stripePaymentIntentId: paymentIntent.id
      },
      context: {
        organizationId,
        userId: auditContext.userId,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent
      }
    });

    return { paymentIntent, payment };
  }

  async processStripeWebhook(data: ProcessStripeWebhookData): Promise<void> {
    if (!stripe || !config.STRIPE_WEBHOOK_SECRET) {
      throw new Error('Stripe webhook is not configured');
    }

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(
        data.payload,
        data.signature,
        config.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      throw new Error(`Webhook signature verification failed: ${err}`);
    }

    switch (event.type) {
      case 'payment_intent.succeeded':
        await this.handlePaymentIntentSucceeded(event.data.object);
        break;
      case 'payment_intent.payment_failed':
        await this.handlePaymentIntentFailed(event.data.object);
        break;
      case 'charge.succeeded':
        await this.handleChargeSucceeded(event.data.object);
        break;
      default:
        logger.warn('Unhandled Stripe webhook event type', { eventType: event.type });
    }
  }

  private async handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    const payment = await prisma.payment.findFirst({
      where: { stripePaymentIntentId: paymentIntent.id }
    });

    if (!payment) {
      console.error(`Payment not found for PaymentIntent: ${paymentIntent.id}`);
      return;
    }

    // HIGH-PRIORITY FIX: Calculate actual processor fees for Stripe payments
    const amountInDollars = payment.amount.toNumber();
    const processorFee = calculateStripeProcessorFee(amountInDollars);
    const netAmount = amountInDollars - processorFee;

    // Update payment status
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.COMPLETED,
        stripeChargeId: 'charge_placeholder',
        processorFee,
        netAmount,
        processedAt: new Date()
      }
    });

    // Update invoice if payment is linked to one
    if (payment.invoiceId) {
      await invoiceService.recordPayment(
        payment.invoiceId,
        payment.amount.toNumber(),
        payment.organizationId,
        { userId: 'system' }
      );
    }

    // Log payment completion
    await auditService.logAction({
      action: 'UPDATE',
      entityType: 'Payment',
      entityId: payment.id,
      changes: {
        status: { from: PaymentStatus.PENDING, to: PaymentStatus.COMPLETED },
        stripeChargeId: 'charge_placeholder',
        processorFee,
        netAmount
      },
      context: {
        organizationId: payment.organizationId,
        userId: 'system'
      }
    });
  }

  private async handlePaymentIntentFailed(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    const payment = await prisma.payment.findFirst({
      where: { stripePaymentIntentId: paymentIntent.id }
    });

    if (!payment) {
      console.error(`Payment not found for PaymentIntent: ${paymentIntent.id}`);
      return;
    }

    const failureReason = paymentIntent.last_payment_error?.message || 'Payment failed';

    // Update payment status
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.FAILED,
        failureReason
      }
    });

    // Log payment failure
    await auditService.logAction({
      action: 'UPDATE',
      entityType: 'Payment',
      entityId: payment.id,
      changes: {
        status: { from: PaymentStatus.PENDING, to: PaymentStatus.FAILED },
        failureReason
      },
      context: {
        organizationId: payment.organizationId,
        userId: 'system'
      }
    });
  }

  private async handleChargeSucceeded(charge: Stripe.Charge): Promise<void> {
    // Additional processing for successful charges if needed
    logger.info('Stripe charge succeeded', { chargeId: charge.id, amount: charge.amount });
  }

  async getPayment(
    id: string,
    organizationId: string
  ): Promise<any> {
    return await prisma.payment.findFirst({
      where: {
        id,
        organizationId,
        deletedAt: null
      },
      include: {
        customer: {
          include: {
            person: true,
            business: true
          }
        },
        invoice: true
      }
    });
  }

  async updatePaymentStatus(
    id: string,
    status: PaymentStatus,
    organizationId: string,
    auditContext: { userId?: string; ipAddress?: string; userAgent?: string },
    failureReason?: string
  ): Promise<Payment> {
    const existingPayment = await this.getPayment(id, organizationId);
    if (!existingPayment) {
      throw new Error('Payment not found');
    }

    const oldStatus = existingPayment.status;
    const updateData: any = { status };

    if (status === PaymentStatus.COMPLETED && !existingPayment.processedAt) {
      updateData.processedAt = new Date();
    }

    if (status === PaymentStatus.FAILED && failureReason) {
      updateData.failureReason = failureReason;
    }

    const payment = await prisma.payment.update({
      where: { id },
      data: updateData
    });

    // If payment is completed and linked to invoice, update invoice
    if (status === PaymentStatus.COMPLETED && payment.invoiceId && oldStatus !== PaymentStatus.COMPLETED) {
      await invoiceService.recordPayment(
        payment.invoiceId,
        payment.amount.toNumber(),
        organizationId,
        { userId: auditContext.userId || 'system', ipAddress: auditContext.ipAddress, userAgent: auditContext.userAgent }
      );
    }

    // Log status change
    await auditService.logAction({
      action: 'UPDATE',
      entityType: 'Payment',
      entityId: id,
      changes: {
        status: { from: oldStatus, to: status },
        ...(failureReason && { failureReason })
      },
      context: {
        organizationId,
        userId: auditContext.userId,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent
      }
    });

    return payment;
  }

  async listPayments(
    organizationId: string,
    filter: ListPaymentsFilter = {},
    page: number = 1,
    limit: number = 50
  ): Promise<{
    payments: (Payment & { customer?: Customer; invoice?: Invoice })[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const where: any = {
      organizationId,
      deletedAt: null
    };

    if (filter.customerId) where.customerId = filter.customerId;
    if (filter.invoiceId) where.invoiceId = filter.invoiceId;
    if (filter.status) where.status = filter.status;
    if (filter.paymentMethod) where.paymentMethod = filter.paymentMethod;
    if (filter.minAmount || filter.maxAmount) {
      where.amount = {};
      if (filter.minAmount) where.amount.gte = filter.minAmount;
      if (filter.maxAmount) where.amount.lte = filter.maxAmount;
    }
    if (filter.startDate || filter.endDate) {
      where.paymentDate = {};
      if (filter.startDate) where.paymentDate.gte = filter.startDate;
      if (filter.endDate) where.paymentDate.lte = filter.endDate;
    }

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        include: {
          customer: true,
          invoice: true
        },
        orderBy: { paymentDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.payment.count({ where })
    ]);

    return {
      payments: payments as any,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    };
  }

  async refundPayment(
    id: string,
    amount: number,
    reason: string,
    organizationId: string,
    auditContext: { userId?: string; ipAddress?: string; userAgent?: string }
  ): Promise<Payment> {
    const payment = await this.getPayment(id, organizationId);
    if (!payment) {
      throw new Error('Payment not found');
    }

    if (payment.status !== PaymentStatus.COMPLETED) {
      throw new Error('Can only refund completed payments');
    }

    // CRITICAL FIX: Validate against netAmount to prevent refunding more than actually received
    // This prevents financial loss from refunding processor fees
    const maxRefundable = payment.netAmount?.toNumber() ?? payment.amount.toNumber();
    if (amount > maxRefundable) {
      throw new Error(
        `Refund amount ($${amount}) cannot exceed net amount received ($${maxRefundable}). ` +
        `Original payment: $${payment.amount.toNumber()}, Processor fee: $${payment.processorFee?.toNumber() ?? 0}`
      );
    }

    // Process Stripe refund if it's a Stripe payment
    if (payment.stripeChargeId && stripe) {
      const refund = await stripe.refunds.create({
        charge: payment.stripeChargeId,
        amount: new Decimal(amount.toString()).mul(100).round().toNumber(), // Precise conversion to cents
        reason: 'requested_by_customer',
        metadata: {
          organizationId,
          paymentId: payment.id,
          reason
        }
      });

      // Create refund record (this would require a separate Refund model)
      // For now, we'll update the payment with refund information
      await prisma.payment.update({
        where: { id },
        data: {
          adminNotes: `${payment.adminNotes || ''}\nRefund: $${amount} - ${reason}`.trim(),
          metadata: JSON.stringify({
            ...(payment.metadata ? JSON.parse(payment.metadata) : {}),
            refunds: [
              ...((payment.metadata && JSON.parse(payment.metadata).refunds) || []),
              {
                amount,
                reason,
                stripeRefundId: refund.id,
                refundedAt: new Date().toISOString()
              }
            ]
          })
        }
      });
    }

    // Update invoice if payment was linked to one
    if (payment.invoiceId) {
      const invoice = await prisma.invoice.findUnique({
        where: { id: payment.invoiceId }
      });

      if (invoice) {
        // CRITICAL FIX: Update invoice balance to reflect refund
        const refundDecimal = new Decimal(amount);
        const currentAmountPaid = new Decimal(invoice.amountPaid.toString());
        const currentBalance = new Decimal(invoice.balance.toString());
        const newAmountPaid = currentAmountPaid.sub(refundDecimal);
        const newBalance = currentBalance.add(refundDecimal);

        await prisma.invoice.update({
          where: { id: payment.invoiceId },
          data: {
            amountPaid: newAmountPaid,
            balance: newBalance,
            notes: `${invoice.notes || ''}\nRefund processed: $${amount} on ${new Date().toLocaleDateString()}`.trim()
          }
        });
      }
    }

    // Log refund
    await auditService.logAction({
      action: 'REFUND',
      entityType: 'Payment',
      entityId: id,
      changes: {
        refundAmount: amount,
        refundReason: reason
      },
      context: {
        organizationId,
        userId: auditContext.userId,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent
      }
    });

    return await this.getPayment(id, organizationId) as Payment;
  }

  async getPaymentStats(
    organizationId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<PaymentStats> {
    const where: any = {
      organizationId,
      deletedAt: null,
      ...((startDate || endDate) && {
        paymentDate: {
          ...(startDate && { gte: startDate }),
          ...(endDate && { lte: endDate })
        }
      })
    };

    const [payments, recentPayments] = await Promise.all([
      prisma.payment.findMany({
        where,
        select: {
          amount: true,
          paymentMethod: true,
          status: true,
          paymentDate: true
        }
      }),
      prisma.payment.count({
        where: {
          ...where,
          paymentDate: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
          }
        }
      })
    ]);

    const totalAmount = payments.reduce((sum, p) => sum + (p.status === PaymentStatus.COMPLETED ? p.amount.toNumber() : 0), 0);
    const completedPayments = payments.filter(p => p.status === PaymentStatus.COMPLETED);

    const paymentsByMethod = payments.reduce((acc, p) => {
      acc[p.paymentMethod as PaymentMethod] = (acc[p.paymentMethod as PaymentMethod] || 0) + 1;
      return acc;
    }, {} as Record<PaymentMethod, number>);

    const paymentsByStatus = payments.reduce((acc, p) => {
      acc[p.status as PaymentStatus] = (acc[p.status as PaymentStatus] || 0) + 1;
      return acc;
    }, {} as Record<PaymentStatus, number>);

    const pendingAmount = payments
      .filter(p => p.status === PaymentStatus.PENDING)
      .reduce((sum, p) => sum + p.amount.toNumber(), 0);

    return {
      totalPayments: completedPayments.length,
      totalAmount,
      averageAmount: completedPayments.length > 0 ? totalAmount / completedPayments.length : 0,
      paymentsByMethod,
      paymentsByStatus,
      recentPayments,
      pendingAmount
    };
  }
}

export const paymentService = new PaymentService();