import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { eTransferAutoMatchService } from '../services/etransfer-auto-match.service';
import { auditService } from '../services/audit.service';
import { logger } from '../utils/logger';
import { PaymentStatus, AuditAction } from '../types/enums';
import Decimal from 'decimal.js';

/**
 * E-Transfer Review Controller
 * Handles admin review of e-Transfers requiring manual approval
 */
export class ETransferReviewController {
  /**
   * Get all e-Transfers pending manual review
   * GET /api/v1/organizations/:orgId/etransfer/review/pending
   */
  async getPendingReviews(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId } = req.params;
      const userId = req.user?.id;

      const pending = await prisma.payment.findMany({
        where: {
          organizationId,
          paymentMethod: 'INTERAC_ETRANSFER',
          status: PaymentStatus.PENDING_REVIEW,
          deletedAt: null
        },
        include: {
          customer: {
            include: {
              person: true,
              business: true
            }
          },
          invoice: {
            include: {
              customer: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      // Parse metadata to include potential matches
      const enrichedPending = pending.map(payment => {
        let metadata = {};
        try {
          metadata = payment.metadata ? JSON.parse(payment.metadata) : {};
        } catch (e) {
          logger.warn('Failed to parse payment metadata', { paymentId: payment.id });
        }

        return {
          ...payment,
          metadata,
          potentialMatches: (metadata as any).potentialMatches || []
        };
      });

      logger.info('Retrieved pending e-Transfer reviews', {
        organizationId,
        userId,
        count: pending.length
      });

      res.json({
        success: true,
        data: enrichedPending,
        count: pending.length
      });
    } catch (error) {
      logger.error('Error retrieving pending reviews', { error });
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve pending reviews'
      });
    }
  }

  /**
   * Approve auto-matched e-Transfer
   * POST /api/v1/organizations/:orgId/etransfer/review/:paymentId/approve
   */
  async approveMatch(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId, paymentId } = req.params;
      const userId = req.user?.id;
      const { notes } = req.body;

      const payment = await prisma.payment.findFirst({
        where: {
          id: paymentId,
          organizationId,
          status: PaymentStatus.PENDING_REVIEW,
          deletedAt: null
        },
        include: {
          invoice: true
        }
      });

      if (!payment) {
        res.status(404).json({
          success: false,
          error: 'Payment not found or not pending review'
        });
        return;
      }

      // Update payment status to completed
      const updatedPayment = await prisma.payment.update({
        where: { id: paymentId },
        data: {
          status: PaymentStatus.COMPLETED,
          processedAt: new Date(),
          adminNotes: `${payment.adminNotes || ''}\n\nApproved by admin ${userId}: ${notes || 'No notes'}`,
          updatedBy: userId
        }
      });

      // Update invoice balance if linked
      if (payment.invoiceId && payment.invoice) {
        const currentBalance = payment.invoice.balance instanceof Decimal
          ? payment.invoice.balance
          : new Decimal(payment.invoice.balance);
        const paymentAmount = payment.amount instanceof Decimal
          ? payment.amount
          : new Decimal(payment.amount);
        const newBalance = currentBalance.minus(paymentAmount);

        await prisma.invoice.update({
          where: { id: payment.invoiceId },
          data: {
            balance: newBalance.toNumber(),
            status: newBalance.lessThanOrEqualTo(0) ? 'PAID' : payment.invoice.status
          }
        });
      }

      // Audit log
      await auditService.logAction({
        action: AuditAction.UPDATE,
        entityType: 'Payment',
        entityId: paymentId,
        changes: {
          status: { from: PaymentStatus.PENDING_REVIEW, to: PaymentStatus.COMPLETED },
          approved: { after: true },
          approvedBy: { after: userId }
        },
        context: {
          organizationId,
          userId: userId || 'unknown',
          ipAddress: req.ip || 'unknown',
          userAgent: req.get('user-agent') || 'unknown'
        }
      });

      logger.info('E-Transfer review approved', {
        paymentId,
        organizationId,
        userId,
        amount: payment.amount
      });

      res.json({
        success: true,
        data: updatedPayment,
        message: 'E-Transfer approved successfully'
      });
    } catch (error) {
      logger.error('Error approving e-Transfer', { error });
      res.status(500).json({
        success: false,
        error: 'Failed to approve e-Transfer'
      });
    }
  }

  /**
   * Reject and reassign to different invoice
   * POST /api/v1/organizations/:orgId/etransfer/review/:paymentId/reassign
   */
  async reassignMatch(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId, paymentId } = req.params;
      const { invoiceId, notes } = req.body;
      const userId = req.user?.id;

      if (!invoiceId) {
        res.status(400).json({
          success: false,
          error: 'Invoice ID is required'
        });
        return;
      }

      const payment = await prisma.payment.findFirst({
        where: {
          id: paymentId,
          organizationId,
          status: PaymentStatus.PENDING_REVIEW,
          deletedAt: null
        }
      });

      if (!payment) {
        res.status(404).json({
          success: false,
          error: 'Payment not found or not pending review'
        });
        return;
      }

      // Verify invoice exists and belongs to organization
      const invoice = await prisma.invoice.findFirst({
        where: {
          id: invoiceId,
          organizationId,
          deletedAt: null
        }
      });

      if (!invoice) {
        res.status(404).json({
          success: false,
          error: 'Invoice not found'
        });
        return;
      }

      // Update payment with new invoice
      const updatedPayment = await prisma.payment.update({
        where: { id: paymentId },
        data: {
          invoiceId,
          customerId: invoice.customerId,
          status: PaymentStatus.COMPLETED,
          processedAt: new Date(),
          adminNotes: `${payment.adminNotes || ''}\n\nManually reassigned to ${invoice.invoiceNumber} by admin ${userId}: ${notes || 'No notes'}`,
          updatedBy: userId
        }
      });

      // Update invoice balance
      const currentBalance = invoice.balance instanceof Decimal
        ? invoice.balance
        : new Decimal(invoice.balance);
      const paymentAmount = payment.amount instanceof Decimal
        ? payment.amount
        : new Decimal(payment.amount);
      const newBalance = currentBalance.minus(paymentAmount);

      await prisma.invoice.update({
        where: { id: invoiceId },
        data: {
          balance: newBalance.toNumber(),
          status: newBalance.lessThanOrEqualTo(0) ? 'PAID' : invoice.status
        }
      });

      // Audit log
      await auditService.logAction({
        action: AuditAction.UPDATE,
        entityType: 'Payment',
        entityId: paymentId,
        changes: {
          invoiceId: { from: payment.invoiceId, to: invoiceId },
          status: { from: PaymentStatus.PENDING_REVIEW, to: PaymentStatus.COMPLETED },
          reassigned: { after: true },
          reassignedBy: { after: userId }
        },
        context: {
          organizationId,
          userId: userId || 'unknown',
          ipAddress: req.ip || 'unknown',
          userAgent: req.get('user-agent') || 'unknown'
        }
      });

      logger.info('E-Transfer reassigned', {
        paymentId,
        oldInvoiceId: payment.invoiceId,
        newInvoiceId: invoiceId,
        userId
      });

      res.json({
        success: true,
        data: updatedPayment,
        message: 'E-Transfer reassigned successfully'
      });
    } catch (error) {
      logger.error('Error reassigning e-Transfer', { error });
      res.status(500).json({
        success: false,
        error: 'Failed to reassign e-Transfer'
      });
    }
  }

  /**
   * Reject e-Transfer (mark as failed/cancelled)
   * POST /api/v1/organizations/:orgId/etransfer/review/:paymentId/reject
   */
  async rejectTransfer(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId, paymentId } = req.params;
      const { reason } = req.body;
      const userId = req.user?.id;

      const payment = await prisma.payment.findFirst({
        where: {
          id: paymentId,
          organizationId,
          status: PaymentStatus.PENDING_REVIEW,
          deletedAt: null
        }
      });

      if (!payment) {
        res.status(404).json({
          success: false,
          error: 'Payment not found or not pending review'
        });
        return;
      }

      const updatedPayment = await prisma.payment.update({
        where: { id: paymentId },
        data: {
          status: PaymentStatus.FAILED,
          failureReason: reason || 'Rejected by admin',
          adminNotes: `${payment.adminNotes || ''}\n\nRejected by admin ${userId}: ${reason || 'No reason provided'}`,
          updatedBy: userId
        }
      });

      // Audit log
      await auditService.logAction({
        action: AuditAction.UPDATE,
        entityType: 'Payment',
        entityId: paymentId,
        changes: {
          status: { from: PaymentStatus.PENDING_REVIEW, to: PaymentStatus.FAILED },
          rejected: { after: true },
          rejectedBy: { after: userId },
          reason: { after: reason }
        },
        context: {
          organizationId,
          userId: userId || 'unknown',
          ipAddress: req.ip || 'unknown',
          userAgent: req.get('user-agent') || 'unknown'
        }
      });

      logger.info('E-Transfer rejected', {
        paymentId,
        userId,
        reason
      });

      res.json({
        success: true,
        data: updatedPayment,
        message: 'E-Transfer rejected'
      });
    } catch (error) {
      logger.error('Error rejecting e-Transfer', { error });
      res.status(500).json({
        success: false,
        error: 'Failed to reject e-Transfer'
      });
    }
  }

  /**
   * Get e-Transfer automation statistics
   * GET /api/v1/organizations/:orgId/etransfer/review/stats
   */
  async getStats(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId } = req.params;
      const { startDate, endDate } = req.query;

      const dateFilter: any = {
        organizationId,
        paymentMethod: 'INTERAC_ETRANSFER',
        deletedAt: null
      };

      if (startDate || endDate) {
        dateFilter.createdAt = {};
        if (startDate) dateFilter.createdAt.gte = new Date(startDate as string);
        if (endDate) dateFilter.createdAt.lte = new Date(endDate as string);
      }

      const [total, autoMatched, pendingReview, approved, rejected] = await Promise.all([
        prisma.payment.count({ where: dateFilter }),
        prisma.payment.count({
          where: {
            ...dateFilter,
            metadata: { contains: '"autoMatched":true' }
          }
        }),
        prisma.payment.count({
          where: {
            ...dateFilter,
            status: PaymentStatus.PENDING_REVIEW
          }
        }),
        prisma.payment.count({
          where: {
            ...dateFilter,
            status: PaymentStatus.COMPLETED,
            adminNotes: { contains: 'Approved by admin' }
          }
        }),
        prisma.payment.count({
          where: {
            ...dateFilter,
            status: PaymentStatus.FAILED,
            adminNotes: { contains: 'Rejected by admin' }
          }
        })
      ]);

      const autoMatchRate = total > 0 ? (autoMatched / total * 100).toFixed(1) : '0.0';

      res.json({
        success: true,
        data: {
          total,
          autoMatched,
          pendingReview,
          approved,
          rejected,
          autoMatchRate: parseFloat(autoMatchRate),
          manualReviewRate: total > 0 ? ((pendingReview + approved + rejected) / total * 100).toFixed(1) : '0.0'
        }
      });
    } catch (error) {
      logger.error('Error getting e-Transfer stats', { error });
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve statistics'
      });
    }
  }
}

export const eTransferReviewController = new ETransferReviewController();
