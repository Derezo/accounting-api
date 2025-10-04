import { Request, Response } from 'express';
import { paymentPortalService } from '../services/payment-portal.service';
import { paymentService } from '../services/payment.service';
import { auditService } from '../services/audit.service';
import { logger } from '../utils/logger';
import { PaymentMethod } from '../types/enums';

/**
 * Public Payment Controller
 * Handles customer-facing payment portal endpoints (no JWT required, token-based auth)
 */
export class PublicPaymentController {
  /**
   * Get invoice details for payment
   * Public endpoint - uses payment token for authentication
   */
  async getInvoiceForPayment(req: Request, res: Response): Promise<void> {
    try {
      const { token } = req.params;
      const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';

      // Validate token
      const tokenData = await paymentPortalService.validatePaymentToken(token, ipAddress);

      // Get invoice details (sanitized for public view)
      const invoice = await paymentService.getPayment(
        tokenData.invoiceId || '',
        tokenData.organizationId
      );

      if (!invoice && tokenData.invoiceId) {
        res.status(404).json({
          error: 'Invoice not found',
          code: 'INVOICE_NOT_FOUND'
        });
        return;
      }

      // If no specific invoice, get customer balance
      const balance = await paymentPortalService.getCustomerBalance(
        tokenData.customerId,
        tokenData.organizationId
      );

      // Get customer details (minimal info for display)
      const { prisma } = await import('../config/database');
      const customer = await prisma.customer.findUnique({
        where: { id: tokenData.customerId },
        include: {
          person: true,
          business: true
        }
      });

      // Log access
      await auditService.logAction({
        action: 'VIEW',
        entityType: 'Invoice',
        entityId: tokenData.invoiceId || 'balance-check',
        changes: { accessMethod: 'payment_token' },
        context: {
          organizationId: tokenData.organizationId,
          userId: tokenData.customerId,
          ipAddress
        }
      });

      res.json({
        success: true,
        customer: {
          id: customer?.id,
          name: customer?.person
            ? `${customer.person.firstName} ${customer.person.lastName}`
            : customer?.business?.legalName,
          email: customer?.person?.email || customer?.business?.email
        },
        invoice: invoice || null,
        balance,
        tokenExpiresAt: tokenData.expiresAt
      });
    } catch (error) {
      logger.error('Get invoice for payment failed', { error });
      res.status(400).json({
        error: 'Failed to retrieve invoice',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Create Stripe PaymentIntent
   * Initiates a payment for an invoice
   */
  async createPaymentIntent(req: Request, res: Response): Promise<void> {
    try {
      const { token } = req.params;
      const { amount, savePaymentMethod } = req.body;
      const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';

      // Validate token
      const tokenData = await paymentPortalService.validatePaymentToken(token, ipAddress);

      // Validate amount
      if (!amount || amount <= 0) {
        res.status(400).json({
          error: 'Invalid payment amount',
          code: 'INVALID_AMOUNT'
        });
        return;
      }

      // If invoice specified, validate amount doesn't exceed balance
      if (tokenData.invoiceId) {
        const { prisma } = await import('../config/database');
        const invoice = await prisma.invoice.findUnique({
          where: { id: tokenData.invoiceId }
        });

        if (!invoice) {
          res.status(404).json({
            error: 'Invoice not found',
            code: 'INVOICE_NOT_FOUND'
          });
          return;
        }

        if (amount > invoice.balance.toNumber()) {
          res.status(400).json({
            error: 'Payment amount exceeds invoice balance',
            code: 'AMOUNT_EXCEEDS_BALANCE',
            details: {
              requestedAmount: amount,
              maxAmount: invoice.balance.toNumber()
            }
          });
          return;
        }
      }

      // Create Stripe PaymentIntent
      const result = await paymentService.createStripePayment(
        {
          invoiceId: tokenData.invoiceId!,
          amount,
          metadata: {
            paymentToken: tokenData.tokenId,
            customerId: tokenData.customerId,
            savePaymentMethod: savePaymentMethod || false
          }
        },
        tokenData.organizationId,
        {
          userId: tokenData.customerId,
          ipAddress
        }
      );

      // Increment payment attempts on token
      const { prisma } = await import('../config/database');
      await prisma.customerPaymentToken.update({
        where: { id: tokenData.tokenId },
        data: {
          paymentAttempts: { increment: 1 }
        }
      });

      // Log payment intent creation
      await auditService.logAction({
        action: 'CREATE',
        entityType: 'PaymentIntent',
        entityId: result.paymentIntent.id,
        changes: {
          amount,
          invoiceId: tokenData.invoiceId,
          customerId: tokenData.customerId
        },
        context: {
          organizationId: tokenData.organizationId,
          userId: tokenData.customerId,
          ipAddress
        }
      });

      res.status(201).json({
        success: true,
        clientSecret: result.paymentIntent.client_secret,
        paymentIntentId: result.paymentIntent.id,
        amount: result.paymentIntent.amount,
        currency: result.paymentIntent.currency
      });
    } catch (error) {
      logger.error('Create payment intent failed', { error });
      res.status(400).json({
        error: 'Failed to create payment intent',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Confirm payment
   * Called after successful Stripe payment to finalize
   */
  async confirmPayment(req: Request, res: Response): Promise<void> {
    try {
      const { token } = req.params;
      const { paymentIntentId } = req.body;
      const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';

      // Validate token
      const tokenData = await paymentPortalService.validatePaymentToken(token, ipAddress);

      // Verify payment intent succeeded
      const { prisma } = await import('../config/database');
      const payment = await prisma.payment.findFirst({
        where: {
          stripePaymentIntentId: paymentIntentId,
          customerId: tokenData.customerId,
          organizationId: tokenData.organizationId
        }
      });

      if (!payment) {
        res.status(404).json({
          error: 'Payment not found',
          code: 'PAYMENT_NOT_FOUND'
        });
        return;
      }

      // Log successful payment
      await auditService.logAction({
        action: 'UPDATE',
        entityType: 'Payment',
        entityId: payment.id,
        changes: {
          status: 'confirmed',
          method: 'public_portal'
        },
        context: {
          organizationId: tokenData.organizationId,
          userId: tokenData.customerId,
          ipAddress
        }
      });

      // Mark token as used
      await paymentPortalService.invalidatePaymentToken(tokenData.tokenId, 'USED');

      res.json({
        success: true,
        message: 'Payment confirmed successfully',
        payment: {
          id: payment.id,
          amount: payment.amount.toNumber(),
          status: payment.status,
          paymentNumber: payment.paymentNumber
        }
      });
    } catch (error) {
      logger.error('Confirm payment failed', { error });
      res.status(400).json({
        error: 'Failed to confirm payment',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get payment history
   * Returns all payments for the customer
   */
  async getPaymentHistory(req: Request, res: Response): Promise<void> {
    try {
      const { token } = req.params;
      const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';

      // Validate token
      const tokenData = await paymentPortalService.validatePaymentToken(token, ipAddress);

      // Get payment history
      const result = await paymentService.listPayments(
        tokenData.organizationId,
        { customerId: tokenData.customerId },
        1,
        50
      );

      // Sanitize payment data for public view
      const sanitizedPayments = result.payments.map(payment => ({
        id: payment.id,
        paymentNumber: payment.paymentNumber,
        amount: payment.amount.toNumber(),
        currency: payment.currency,
        paymentDate: payment.paymentDate,
        paymentMethod: payment.paymentMethod,
        status: payment.status,
        invoiceId: payment.invoiceId
      }));

      res.json({
        success: true,
        payments: sanitizedPayments,
        total: result.total
      });
    } catch (error) {
      logger.error('Get payment history failed', { error });
      res.status(400).json({
        error: 'Failed to retrieve payment history',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * List saved payment methods
   * Returns customer's saved payment methods
   */
  async listPaymentMethods(req: Request, res: Response): Promise<void> {
    try {
      const { token } = req.params;
      const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';

      // Validate token
      const tokenData = await paymentPortalService.validatePaymentToken(token, ipAddress);

      // Get saved payment methods
      const methods = await paymentPortalService.getSavedPaymentMethods(
        tokenData.customerId,
        tokenData.organizationId
      );

      // Sanitize for public view (remove internal IDs)
      const sanitizedMethods = methods.map(method => ({
        id: method.id,
        type: method.type,
        last4: method.last4,
        brand: method.brand,
        expiryMonth: method.expiryMonth,
        expiryYear: method.expiryYear,
        isDefault: method.isDefault
      }));

      res.json({
        success: true,
        paymentMethods: sanitizedMethods
      });
    } catch (error) {
      logger.error('List payment methods failed', { error });
      res.status(400).json({
        error: 'Failed to retrieve payment methods',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Add payment method
   * Saves a new payment method via Stripe
   */
  async addPaymentMethod(req: Request, res: Response): Promise<void> {
    try {
      const { token } = req.params;
      const { stripePaymentMethodId, setAsDefault } = req.body;
      const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';

      // Validate token
      const tokenData = await paymentPortalService.validatePaymentToken(token, ipAddress);

      // Add payment method
      const method = await paymentPortalService.addPaymentMethod(
        tokenData.customerId,
        tokenData.organizationId,
        stripePaymentMethodId,
        setAsDefault || false
      );

      // Log action
      await auditService.logAction({
        action: 'CREATE',
        entityType: 'CustomerPaymentMethod',
        entityId: method.id,
        changes: { stripePaymentMethodId, setAsDefault },
        context: {
          organizationId: tokenData.organizationId,
          userId: tokenData.customerId,
          ipAddress
        }
      });

      res.status(201).json({
        success: true,
        message: 'Payment method added successfully',
        paymentMethod: {
          id: method.id,
          type: method.type,
          last4: method.last4,
          brand: method.brand,
          isDefault: method.isDefault
        }
      });
    } catch (error) {
      logger.error('Add payment method failed', { error });
      res.status(400).json({
        error: 'Failed to add payment method',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Remove payment method
   * Deactivates a saved payment method
   */
  async removePaymentMethod(req: Request, res: Response): Promise<void> {
    try {
      const { token, methodId } = req.params;
      const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';

      // Validate token
      const tokenData = await paymentPortalService.validatePaymentToken(token, ipAddress);

      // Remove payment method
      await paymentPortalService.removePaymentMethod(
        tokenData.customerId,
        tokenData.organizationId,
        methodId
      );

      // Log action
      await auditService.logAction({
        action: 'DELETE',
        entityType: 'CustomerPaymentMethod',
        entityId: methodId,
        changes: {},
        context: {
          organizationId: tokenData.organizationId,
          userId: tokenData.customerId,
          ipAddress
        }
      });

      res.json({
        success: true,
        message: 'Payment method removed successfully'
      });
    } catch (error) {
      logger.error('Remove payment method failed', { error });
      res.status(400).json({
        error: 'Failed to remove payment method',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Set default payment method
   * Updates the default payment method
   */
  async setDefaultPaymentMethod(req: Request, res: Response): Promise<void> {
    try {
      const { token, methodId } = req.params;
      const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';

      // Validate token
      const tokenData = await paymentPortalService.validatePaymentToken(token, ipAddress);

      // Set default
      await paymentPortalService.setDefaultPaymentMethod(
        tokenData.customerId,
        tokenData.organizationId,
        methodId
      );

      // Log action
      await auditService.logAction({
        action: 'UPDATE',
        entityType: 'CustomerPaymentMethod',
        entityId: methodId,
        changes: { isDefault: true },
        context: {
          organizationId: tokenData.organizationId,
          userId: tokenData.customerId,
          ipAddress
        }
      });

      res.json({
        success: true,
        message: 'Default payment method updated successfully'
      });
    } catch (error) {
      logger.error('Set default payment method failed', { error });
      res.status(400).json({
        error: 'Failed to set default payment method',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}

export const publicPaymentController = new PublicPaymentController();
