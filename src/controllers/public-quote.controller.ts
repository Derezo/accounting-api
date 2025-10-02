import { Request, Response } from 'express';
import { quoteLifecycleService } from '../services/quote-lifecycle.service';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { sendSuccess, sendError } from '../utils/response';

/**
 * PublicQuoteController
 * Public-facing API for customers to view and interact with quotes
 */
export class PublicQuoteController {

  /**
   * View quote details (public, requires view token)
   */
  public async viewQuote(req: Request, res: Response): Promise<void> {
    try {
      const { quoteId } = req.params;
      const { token } = req.query;

      if (!token || typeof token !== 'string') {
        sendError(res, 'VALIDATION_ERROR', 'View token is required', 400);
        return;
      }

      // Find quote with view token
      const quote = await prisma.quote.findFirst({
        where: {
          id: quoteId,
          publicViewToken: token,
          publicViewEnabled: true,
          deletedAt: null
        },
        include: {
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  description: true
                }
              },
              service: {
                select: {
                  id: true,
                  name: true,
                  description: true
                }
              }
            },
            orderBy: {
              sortOrder: 'asc'
            }
          },
          customer: {
            include: {
              person: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                  phone: true
                }
              },
              business: {
                select: {
                  id: true,
                  legalName: true,
                  email: true,
                  phone: true
                }
              }
            }
          },
          organization: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              website: true,
              settings: true
            }
          }
        }
      });

      if (!quote) {
        sendError(res, 'NOT_FOUND', 'Quote not found or invalid token', 404);
        return;
      }

      // Check if expired
      if (quote.expiresAt && quote.expiresAt < new Date()) {
        sendError(res, 'QUOTE_EXPIRED', 'Quote has expired', 410);
        return;
      }

      // Track view
      await quoteLifecycleService.trackQuoteView(quoteId, token);

      // Prepare response data (exclude sensitive fields)
      const responseData = {
        id: quote.id,
        quoteNumber: quote.quoteNumber,
        status: quote.status,
        description: quote.description,
        terms: quote.terms,
        notes: quote.notes,
        subtotal: quote.subtotal,
        taxAmount: quote.taxAmount,
        total: quote.total,
        currency: quote.currency,
        validUntil: quote.validUntil,
        expiresAt: quote.expiresAt,
        sentAt: quote.sentAt,
        viewedAt: quote.viewedAt,
        acceptedAt: quote.acceptedAt,
        items: quote.items.map(item => ({
          id: item.id,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discountPercent: item.discountPercent,
          taxRate: item.taxRate,
          subtotal: item.subtotal,
          discountAmount: item.discountAmount,
          taxAmount: item.taxAmount,
          total: item.total,
          product: item.product,
          service: item.service
        })),
        customer: {
          name: quote.customer.person
            ? `${quote.customer.person.firstName} ${quote.customer.person.lastName}`
            : quote.customer.business?.legalName || 'Customer',
          email: quote.customer.person?.email || quote.customer.business?.email,
          phone: quote.customer.person?.phone || quote.customer.business?.phone
        },
        organization: {
          name: quote.organization.name,
          email: quote.organization.email,
          phone: quote.organization.phone,
          website: quote.organization.website,
          settings: quote.organization.settings ? JSON.parse(quote.organization.settings) : {}
        },
        // Include acceptance token if quote is in SENT status
        acceptanceToken: quote.status === 'SENT' ? quote.acceptanceToken : undefined
      };

      sendSuccess(res, responseData);
    } catch (error: any) {
      logger.error('Error viewing quote', { error, quoteId: req.params.quoteId });
      sendError(res, 'INTERNAL_ERROR', error.message || 'Failed to retrieve quote', 500);
    }
  }

  /**
   * Accept quote (public, requires acceptance token)
   */
  public async acceptQuote(req: Request, res: Response): Promise<void> {
    try {
      const { quoteId } = req.params;
      const { token, customerEmail, notes } = req.body;

      if (!token) {
        sendError(res, 'VALIDATION_ERROR', 'Acceptance token is required', 400);
        return;
      }

      if (!customerEmail) {
        sendError(res, 'VALIDATION_ERROR', 'Customer email is required', 400);
        return;
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(customerEmail)) {
        sendError(res, 'VALIDATION_ERROR', 'Invalid email format', 400);
        return;
      }

      const ipAddress = req.ip || req.socket.remoteAddress;

      const result = await quoteLifecycleService.acceptQuote(
        quoteId,
        token,
        customerEmail,
        notes,
        ipAddress
      );

      // Prepare response
      const responseData = {
        id: result.quote.id,
        quoteNumber: result.quote.quoteNumber,
        status: result.quote.status,
        acceptedAt: result.quote.acceptedAt,
        message: 'Quote accepted successfully! Please book your appointment to proceed.',
        // Include booking URL and token in response
        bookingUrl: `${process.env.FRONTEND_URL || 'https://account.lifestreamdynamics.com'}/public/appointments/book?quoteId=${result.quote.id}`,
        ...(result.bookingToken && { bookingToken: result.bookingToken })
      };

      sendSuccess(res, responseData);
    } catch (error: any) {
      logger.error('Error accepting quote', { error, quoteId: req.params.quoteId });

      // Handle custom AppError instances with appropriate status codes
      if (error.statusCode) {
        sendError(res, error.errorCode || 'ERROR', error.message, error.statusCode);
      } else {
        sendError(res, 'INTERNAL_ERROR', error.message || 'Failed to accept quote', 500);
      }
    }
  }

  /**
   * Reject quote (public, requires acceptance token)
   */
  public async rejectQuote(req: Request, res: Response): Promise<void> {
    try {
      const { quoteId } = req.params;
      const { token, customerEmail, reason } = req.body;

      if (!token) {
        sendError(res, 'VALIDATION_ERROR', 'Acceptance token is required', 400);
        return;
      }

      if (!customerEmail) {
        sendError(res, 'VALIDATION_ERROR', 'Customer email is required', 400);
        return;
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(customerEmail)) {
        sendError(res, 'VALIDATION_ERROR', 'Invalid email format', 400);
        return;
      }

      const ipAddress = req.ip || req.socket.remoteAddress;

      const rejectedQuote = await quoteLifecycleService.rejectQuote(
        quoteId,
        token,
        customerEmail,
        reason,
        ipAddress
      );

      const responseData = {
        id: rejectedQuote.id,
        quoteNumber: rejectedQuote.quoteNumber,
        status: rejectedQuote.status,
        rejectedAt: rejectedQuote.rejectedAt,
        message: 'Thank you for your consideration. We appreciate the opportunity to quote your project.'
      };

      sendSuccess(res, responseData);
    } catch (error: any) {
      logger.error('Error rejecting quote', { error, quoteId: req.params.quoteId });

      // Handle custom AppError instances with appropriate status codes
      if (error.statusCode) {
        sendError(res, error.errorCode || 'ERROR', error.message, error.statusCode);
      } else {
        sendError(res, 'INTERNAL_ERROR', error.message || 'Failed to decline quote', 500);
      }
    }
  }

  /**
   * Check quote status (public, requires view token)
   */
  public async checkQuoteStatus(req: Request, res: Response): Promise<void> {
    try {
      const { quoteId } = req.params;
      const { token } = req.query;

      if (!token || typeof token !== 'string') {
        sendError(res, 'VALIDATION_ERROR', 'View token is required', 400);
        return;
      }

      const quote = await prisma.quote.findFirst({
        where: {
          id: quoteId,
          publicViewToken: token,
          publicViewEnabled: true,
          deletedAt: null
        },
        select: {
          id: true,
          quoteNumber: true,
          status: true,
          sentAt: true,
          viewedAt: true,
          acceptedAt: true,
          rejectedAt: true,
          expiresAt: true
        }
      });

      if (!quote) {
        sendError(res, 'NOT_FOUND', 'Quote not found or invalid token', 404);
        return;
      }

      const responseData = {
        id: quote.id,
        quoteNumber: quote.quoteNumber,
        status: quote.status,
        sentAt: quote.sentAt,
        viewedAt: quote.viewedAt,
        acceptedAt: quote.acceptedAt,
        rejectedAt: quote.rejectedAt,
        expiresAt: quote.expiresAt,
        isExpired: quote.expiresAt ? quote.expiresAt < new Date() : false
      };

      sendSuccess(res, responseData);
    } catch (error: any) {
      logger.error('Error checking quote status', { error, quoteId: req.params.quoteId });
      sendError(res, 'INTERNAL_ERROR', error.message || 'Failed to check quote status', 500);
    }
  }
}

export const publicQuoteController = new PublicQuoteController();