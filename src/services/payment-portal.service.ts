import { CustomerPaymentMethod, Invoice, Customer } from '@prisma/client';
import Decimal from 'decimal.js';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import Stripe from 'stripe';
import { config } from '../config/config';
import { prisma } from '../config/database';
import { auditService } from './audit.service';
import { logger } from '../utils/logger';

/**
 * Payment Portal Service
 * Handles customer-facing payment portal operations including:
 * - Token generation and validation
 * - Payment method management
 * - Customer balance tracking
 * - Stripe Customer Portal integration
 */
export class PaymentPortalService {
  private stripe: Stripe | null = null;

  constructor() {
    if (config.STRIPE_SECRET_KEY) {
      this.stripe = new Stripe(config.STRIPE_SECRET_KEY, {
        apiVersion: '2023-10-16'
      });
    }
  }

  /**
   * Generate customer payment portal token
   * Creates a secure, time-limited token for customer access to payment portal
   *
   * @param customerId - Customer ID
   * @param organizationId - Organization ID
   * @param invoiceId - Optional specific invoice ID
   * @param generatedBy - User ID who generated the token
   * @param tokenLifetimeDays - Token validity period in days (default: 7)
   * @returns Secure token and expiration date
   */
  async generateCustomerPaymentToken(
    customerId: string,
    organizationId: string,
    invoiceId?: string,
    generatedBy?: string,
    tokenLifetimeDays: number = 7
  ): Promise<{ token: string; expiresAt: Date; tokenId: string }> {
    // Verify customer exists
    const customer = await prisma.customer.findFirst({
      where: {
        id: customerId,
        organizationId,
        deletedAt: null
      }
    });

    if (!customer) {
      throw new Error('Customer not found');
    }

    // If invoice specified, verify it belongs to customer
    if (invoiceId) {
      const invoice = await prisma.invoice.findFirst({
        where: {
          id: invoiceId,
          customerId,
          organizationId,
          deletedAt: null
        }
      });

      if (!invoice) {
        throw new Error('Invoice not found or does not belong to customer');
      }
    }

    // Generate secure random token (32 bytes = 64 hex characters)
    const token = crypto.randomBytes(32).toString('hex');

    // Hash token for storage
    const tokenHash = await bcrypt.hash(token, 10);

    // Calculate expiration
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + tokenLifetimeDays);

    // Create token record
    const tokenRecord = await prisma.customerPaymentToken.create({
      data: {
        organizationId,
        customerId,
        invoiceId,
        tokenHash,
        expiresAt,
        generatedBy,
        status: 'ACTIVE'
      }
    });

    // Log token generation
    await auditService.logAction({
      action: 'CREATE',
      entityType: 'CustomerPaymentToken',
      entityId: tokenRecord.id,
      changes: {
        customerId,
        invoiceId,
        expiresAt,
        generatedBy
      },
      context: {
        organizationId,
        userId: generatedBy || 'system'
      }
    });

    logger.info('Payment portal token generated', {
      tokenId: tokenRecord.id,
      customerId,
      invoiceId,
      expiresAt
    });

    return {
      token,
      expiresAt,
      tokenId: tokenRecord.id
    };
  }

  /**
   * Validate payment portal token
   * Verifies token is valid, not expired, and returns associated data
   *
   * @param token - Token to validate
   * @param ipAddress - IP address of request (for security logging)
   * @returns Token data including customer and invoice IDs
   */
  async validatePaymentToken(
    token: string,
    ipAddress?: string
  ): Promise<{
    customerId: string;
    organizationId: string;
    invoiceId?: string;
    expiresAt: Date;
    tokenId: string;
  }> {
    // Find all active tokens (we need to hash-compare each one)
    const activeTokens = await prisma.customerPaymentToken.findMany({
      where: {
        status: 'ACTIVE',
        invalidated: false,
        expiresAt: {
          gte: new Date()
        }
      }
    });

    // Compare token against all active hashes
    let matchedToken = null;
    for (const tokenRecord of activeTokens) {
      const isMatch = await bcrypt.compare(token, tokenRecord.tokenHash);
      if (isMatch) {
        matchedToken = tokenRecord;
        break;
      }
    }

    if (!matchedToken) {
      logger.warn('Invalid payment token attempt', { ipAddress });
      throw new Error('Invalid or expired payment token');
    }

    // Update view tracking
    await prisma.customerPaymentToken.update({
      where: { id: matchedToken.id },
      data: {
        viewCount: matchedToken.viewCount + 1,
        lastViewedAt: new Date(),
        ipAddressUsed: ipAddress
      }
    });

    return {
      customerId: matchedToken.customerId,
      organizationId: matchedToken.organizationId,
      invoiceId: matchedToken.invoiceId || undefined,
      expiresAt: matchedToken.expiresAt,
      tokenId: matchedToken.id
    };
  }

  /**
   * Create Stripe Customer Portal session
   * Allows customers to manage payment methods via Stripe-hosted portal
   *
   * @param customerId - Customer ID
   * @param organizationId - Organization ID
   * @param returnUrl - URL to return to after portal session
   * @returns Stripe portal session URL
   */
  async createCustomerPortalSession(
    customerId: string,
    organizationId: string,
    returnUrl: string
  ): Promise<{ url: string }> {
    if (!this.stripe) {
      throw new Error('Stripe is not configured');
    }

    // Get customer's Stripe customer ID
    const customer = await prisma.customer.findFirst({
      where: {
        id: customerId,
        organizationId,
        deletedAt: null
      }
    });

    if (!customer) {
      throw new Error('Customer not found');
    }

    // Get or create Stripe customer
    // For now, we'll assume Stripe customer ID is stored somewhere
    // This would typically be in customer metadata or a separate field
    let stripeCustomerId: string | undefined;

    // Try to find existing payment method with Stripe ID
    const existingMethod = await prisma.customerPaymentMethod.findFirst({
      where: {
        customerId,
        organizationId,
        isActive: true
      }
    });

    if (existingMethod?.stripeMethodId) {
      // Get payment method to find customer ID
      const paymentMethod = await this.stripe.paymentMethods.retrieve(
        existingMethod.stripeMethodId
      );
      stripeCustomerId = paymentMethod.customer as string;
    }

    // If no Stripe customer exists, create one
    if (!stripeCustomerId) {
      const stripeCustomer = await this.stripe.customers.create({
        metadata: {
          customerId,
          organizationId
        }
      });
      stripeCustomerId = stripeCustomer.id;
    }

    // Create portal session
    const session = await this.stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: returnUrl
    });

    // Log portal access
    await auditService.logAction({
      action: 'VIEW',
      entityType: 'CustomerPortal',
      entityId: customerId,
      changes: {
        stripeCustomerId,
        sessionId: session.id
      },
      context: {
        organizationId,
        userId: customerId
      }
    });

    return { url: session.url };
  }

  /**
   * Get customer saved payment methods
   * Returns all active payment methods for a customer
   *
   * @param customerId - Customer ID
   * @param organizationId - Organization ID
   * @returns Array of payment methods
   */
  async getSavedPaymentMethods(
    customerId: string,
    organizationId: string
  ): Promise<CustomerPaymentMethod[]> {
    return await prisma.customerPaymentMethod.findMany({
      where: {
        customerId,
        organizationId,
        isActive: true
      },
      orderBy: [
        { isDefault: 'desc' },
        { createdAt: 'desc' }
      ]
    });
  }

  /**
   * Add payment method via Stripe
   * Attaches a Stripe payment method to customer
   *
   * @param customerId - Customer ID
   * @param organizationId - Organization ID
   * @param stripePaymentMethodId - Stripe payment method ID
   * @param setAsDefault - Whether to set as default payment method
   * @returns Created payment method record
   */
  async addPaymentMethod(
    customerId: string,
    organizationId: string,
    stripePaymentMethodId: string,
    setAsDefault: boolean = false
  ): Promise<CustomerPaymentMethod> {
    if (!this.stripe) {
      throw new Error('Stripe is not configured');
    }

    // Verify customer exists
    const customer = await prisma.customer.findFirst({
      where: {
        id: customerId,
        organizationId,
        deletedAt: null
      }
    });

    if (!customer) {
      throw new Error('Customer not found');
    }

    // Retrieve payment method from Stripe
    const paymentMethod = await this.stripe.paymentMethods.retrieve(
      stripePaymentMethodId
    );

    // If setting as default, unset other defaults
    if (setAsDefault) {
      await prisma.customerPaymentMethod.updateMany({
        where: {
          customerId,
          organizationId,
          isDefault: true
        },
        data: {
          isDefault: false
        }
      });
    }

    // Determine payment method type
    let methodType = 'CARD';
    if (paymentMethod.type === 'us_bank_account' || paymentMethod.type === 'sepa_debit') {
      methodType = 'BANK_ACCOUNT';
    }

    // Extract card details if available
    const card = paymentMethod.card;
    const last4 = card?.last4 || paymentMethod.us_bank_account?.last4;
    const brand = card?.brand || paymentMethod.type;
    const expiryMonth = card?.exp_month;
    const expiryYear = card?.exp_year;

    // Create payment method record
    const savedMethod = await prisma.customerPaymentMethod.create({
      data: {
        organizationId,
        customerId,
        type: methodType,
        stripeMethodId: stripePaymentMethodId,
        last4,
        brand,
        expiryMonth,
        expiryYear,
        isDefault: setAsDefault,
        isActive: true
      }
    });

    // Log payment method addition
    await auditService.logAction({
      action: 'CREATE',
      entityType: 'CustomerPaymentMethod',
      entityId: savedMethod.id,
      changes: {
        customerId,
        type: methodType,
        last4,
        brand,
        isDefault: setAsDefault
      },
      context: {
        organizationId,
        userId: customerId
      }
    });

    logger.info('Payment method added', {
      customerId,
      methodId: savedMethod.id,
      type: methodType,
      isDefault: setAsDefault
    });

    return savedMethod;
  }

  /**
   * Set default payment method
   * Updates which payment method is the customer's default
   *
   * @param customerId - Customer ID
   * @param organizationId - Organization ID
   * @param methodId - Payment method ID to set as default
   */
  async setDefaultPaymentMethod(
    customerId: string,
    organizationId: string,
    methodId: string
  ): Promise<void> {
    // Verify method exists and belongs to customer
    const method = await prisma.customerPaymentMethod.findFirst({
      where: {
        id: methodId,
        customerId,
        organizationId,
        isActive: true
      }
    });

    if (!method) {
      throw new Error('Payment method not found');
    }

    // Unset all other defaults
    await prisma.customerPaymentMethod.updateMany({
      where: {
        customerId,
        organizationId,
        isDefault: true
      },
      data: {
        isDefault: false
      }
    });

    // Set new default
    await prisma.customerPaymentMethod.update({
      where: { id: methodId },
      data: { isDefault: true }
    });

    // Log default change
    await auditService.logAction({
      action: 'UPDATE',
      entityType: 'CustomerPaymentMethod',
      entityId: methodId,
      changes: {
        isDefault: { from: false, to: true }
      },
      context: {
        organizationId,
        userId: customerId
      }
    });

    logger.info('Default payment method updated', {
      customerId,
      methodId
    });
  }

  /**
   * Remove payment method
   * Deactivates a payment method (soft delete)
   *
   * @param customerId - Customer ID
   * @param organizationId - Organization ID
   * @param methodId - Payment method ID to remove
   */
  async removePaymentMethod(
    customerId: string,
    organizationId: string,
    methodId: string
  ): Promise<void> {
    // Verify method exists and belongs to customer
    const method = await prisma.customerPaymentMethod.findFirst({
      where: {
        id: methodId,
        customerId,
        organizationId,
        isActive: true
      }
    });

    if (!method) {
      throw new Error('Payment method not found');
    }

    // Detach from Stripe if applicable
    if (method.stripeMethodId && this.stripe) {
      try {
        await this.stripe.paymentMethods.detach(method.stripeMethodId);
      } catch (error) {
        logger.warn('Failed to detach Stripe payment method', {
          error,
          stripeMethodId: method.stripeMethodId
        });
        // Continue with removal even if Stripe detach fails
      }
    }

    // Soft delete
    await prisma.customerPaymentMethod.update({
      where: { id: methodId },
      data: {
        isActive: false,
        isDefault: false
      }
    });

    // Log removal
    await auditService.logAction({
      action: 'DELETE',
      entityType: 'CustomerPaymentMethod',
      entityId: methodId,
      changes: {
        isActive: { from: true, to: false }
      },
      context: {
        organizationId,
        userId: customerId
      }
    });

    logger.info('Payment method removed', {
      customerId,
      methodId
    });
  }

  /**
   * Get customer outstanding balance
   * Calculates total outstanding, overdue amounts, and upcoming payments
   *
   * @param customerId - Customer ID
   * @param organizationId - Organization ID
   * @returns Balance summary with upcoming payments
   */
  async getCustomerBalance(
    customerId: string,
    organizationId: string
  ): Promise<{
    totalOutstanding: number;
    overdueAmount: number;
    upcomingPayments: Array<{
      invoiceId: string;
      invoiceNumber: string;
      amount: number;
      dueDate: Date;
      isOverdue: boolean;
    }>;
  }> {
    // Verify customer exists
    const customer = await prisma.customer.findFirst({
      where: {
        id: customerId,
        organizationId,
        deletedAt: null
      }
    });

    if (!customer) {
      throw new Error('Customer not found');
    }

    // Get all unpaid invoices
    const invoices = await prisma.invoice.findMany({
      where: {
        customerId,
        organizationId,
        deletedAt: null,
        balance: {
          gt: 0
        }
      },
      select: {
        id: true,
        invoiceNumber: true,
        balance: true,
        dueDate: true
      },
      orderBy: {
        dueDate: 'asc'
      }
    });

    const now = new Date();
    let totalOutstanding = 0;
    let overdueAmount = 0;

    const upcomingPayments = invoices.map(invoice => {
      const amount = invoice.balance.toNumber();
      const isOverdue = invoice.dueDate < now;

      totalOutstanding += amount;
      if (isOverdue) {
        overdueAmount += amount;
      }

      return {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        amount,
        dueDate: invoice.dueDate,
        isOverdue
      };
    });

    return {
      totalOutstanding,
      overdueAmount,
      upcomingPayments
    };
  }

  /**
   * Invalidate payment token
   * Marks a token as used or invalidated
   *
   * @param tokenId - Token ID to invalidate
   * @param reason - Reason for invalidation (USED, EXPIRED, MANUAL_REVOKE)
   */
  async invalidatePaymentToken(
    tokenId: string,
    reason: 'USED' | 'EXPIRED' | 'MANUAL_REVOKE'
  ): Promise<void> {
    const status = reason === 'USED' ? 'USED' : 'INVALIDATED';

    await prisma.customerPaymentToken.update({
      where: { id: tokenId },
      data: {
        status,
        invalidated: true,
        usedAt: reason === 'USED' ? new Date() : undefined
      }
    });

    logger.info('Payment token invalidated', {
      tokenId,
      reason,
      status
    });
  }
}

export const paymentPortalService = new PaymentPortalService();
