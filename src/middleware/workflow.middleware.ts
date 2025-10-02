import { Request, Response, NextFunction } from 'express';
import { UserRole } from '../types/enums';
import { ErrorResponseUtil } from '../utils/error-response';
import { prisma } from '../config/database';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        organizationId: string;
        role: string;
        sessionId: string;
        isTestToken?: boolean;
      };
    }
  }
}

export interface AuthenticatedRequest extends Request {}

/**
 * Status types for different workflow entities
 */
export type QuoteStatus = 'DRAFT' | 'SENT' | 'VIEWED' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED';
export type InvoiceStatus = 'DRAFT' | 'SENT' | 'VIEWED' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'CANCELLED' | 'VOID';
export type CustomerStatus = 'PROSPECT' | 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'ARCHIVED';
export type PaymentStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'REFUNDED' | 'CANCELLED';

/**
 * Validates that a state transition is allowed based on current status
 *
 * @param fromStatuses - Array of allowed current statuses
 * @param toStatus - Target status (for validation and error messages)
 * @param resourceType - Type of resource being transitioned
 * @param resourceIdParam - Route parameter containing resource ID
 */
export function validateStateTransition(
  fromStatuses: string[],
  toStatus: string,
  resourceType: 'quote' | 'invoice' | 'customer' | 'payment',
  resourceIdParam: string = 'id'
) {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) {
        ErrorResponseUtil.sendAuthenticationError(res, 'Authentication required');
        return;
      }

      const resourceId = req.params[resourceIdParam];
      if (!resourceId) {
        res.status(400).json({ error: `${resourceType} ID required` });
        return;
      }

      // Get current resource status
      const resource = await getResourceStatus(resourceType, resourceId, req.user.organizationId);

      if (!resource) {
        res.status(404).json({ error: `${resourceType} not found` });
        return;
      }

      // Check if current status allows transition
      if (!fromStatuses.includes(resource.status)) {
        res.status(400).json({
          error: `Invalid state transition`,
          details: {
            currentStatus: resource.status,
            targetStatus: toStatus,
            allowedFromStatuses: fromStatuses,
            message: `Cannot transition ${resourceType} from ${resource.status} to ${toStatus}. Allowed statuses: ${fromStatuses.join(', ')}`
          }
        });
        return;
      }

      // Validate prerequisites based on transition type
      const prerequisiteError = await validateTransitionPrerequisites(
        resourceType,
        resourceId,
        resource.status,
        toStatus,
        req.user
      );

      if (prerequisiteError) {
        res.status(400).json({
          error: 'Transition prerequisites not met',
          details: prerequisiteError
        });
        return;
      }

      next();
    } catch (error) {
      console.error(`State transition validation error:`, error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

/**
 * Get current status of a resource
 */
async function getResourceStatus(
  resourceType: string,
  resourceId: string,
  organizationId: string
): Promise<{ status: string; data?: any } | null> {
  switch (resourceType) {
    case 'quote':
      const quote = await prisma.quote.findFirst({
        where: { id: resourceId, organizationId },
        select: {
          status: true,
          customerId: true,
          expiresAt: true
        }
      });
      return quote ? { status: quote.status, data: quote } : null;

    case 'invoice':
      const invoice = await prisma.invoice.findFirst({
        where: { id: resourceId, organizationId },
        select: {
          status: true,
          customerId: true,
          quoteId: true,
          total: true,
          amountPaid: true
        }
      });
      return invoice ? { status: invoice.status, data: invoice } : null;

    case 'customer':
      const customer = await prisma.customer.findFirst({
        where: { id: resourceId, organizationId },
        select: { status: true }
      });
      return customer ? { status: customer.status } : null;

    case 'payment':
      const payment = await prisma.payment.findFirst({
        where: { id: resourceId, organizationId },
        select: {
          status: true,
          invoiceId: true
        }
      });
      return payment ? { status: payment.status, data: payment } : null;

    default:
      return null;
  }
}

/**
 * Validate prerequisites for specific state transitions
 */
async function validateTransitionPrerequisites(
  resourceType: string,
  resourceId: string,
  currentStatus: string,
  targetStatus: string,
  user: { id: string; organizationId: string; role: string }
): Promise<{ reason: string; requirement: string } | null> {

  switch (resourceType) {
    case 'quote':
      return await validateQuoteTransitionPrerequisites(
        resourceId,
        currentStatus,
        targetStatus,
        user
      );

    case 'invoice':
      return await validateInvoiceTransitionPrerequisites(
        resourceId,
        currentStatus,
        targetStatus,
        user
      );

    case 'customer':
      return await validateCustomerTransitionPrerequisites(
        resourceId,
        currentStatus,
        targetStatus,
        user
      );

    case 'payment':
      return await validatePaymentTransitionPrerequisites(
        resourceId,
        currentStatus,
        targetStatus,
        user
      );

    default:
      return null;
  }
}

/**
 * Validate quote transition prerequisites
 */
async function validateQuoteTransitionPrerequisites(
  quoteId: string,
  currentStatus: string,
  targetStatus: string,
  user: { id: string; organizationId: string; role: string }
): Promise<{ reason: string; requirement: string } | null> {

  // Get quote with related data
  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    include: {
      customer: {
        include: {
          person: true,
          business: true
        }
      },
      items: true
    }
  });

  if (!quote) {
    return { reason: 'Quote not found', requirement: 'Valid quote' };
  }

  // ACCEPTED transition requirements
  if (targetStatus === 'ACCEPTED') {
    // Check if customer is approved
    if (quote.customer.status === 'PROSPECT') {
      return {
        reason: 'Customer must be ACTIVE before quote can be accepted',
        requirement: 'Customer status: ACTIVE'
      };
    }

    // Check if quote has expired
    if (quote.expiresAt && quote.expiresAt < new Date()) {
      return {
        reason: 'Cannot accept expired quote',
        requirement: 'Valid (non-expired) quote'
      };
    }

    // Check if quote has items
    if (!quote.items || quote.items.length === 0) {
      return {
        reason: 'Quote must have at least one item',
        requirement: 'Quote items present'
      };
    }

    // Only ADMIN, MANAGER, ACCOUNTANT can accept quotes
    if (!['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT'].includes(user.role)) {
      return {
        reason: 'Insufficient permissions to accept quote',
        requirement: 'ADMIN, MANAGER, or ACCOUNTANT role'
      };
    }
  }

  // SENT transition requirements
  if (targetStatus === 'SENT') {
    if (!quote.items || quote.items.length === 0) {
      return {
        reason: 'Cannot send quote without items',
        requirement: 'At least one quote item'
      };
    }

    // Check customer has contact information (via person or business)
    const hasContact = (quote.customer as any).person?.email || (quote.customer as any).person?.phone ||
                      (quote.customer as any).business?.email || (quote.customer as any).business?.phone;
    if (!hasContact) {
      return {
        reason: 'Customer must have email or phone to send quote',
        requirement: 'Customer contact information'
      };
    }
  }

  return null;
}

/**
 * Validate invoice transition prerequisites
 */
async function validateInvoiceTransitionPrerequisites(
  invoiceId: string,
  currentStatus: string,
  targetStatus: string,
  user: { id: string; organizationId: string; role: string }
): Promise<{ reason: string; requirement: string } | null> {

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      customer: {
        include: {
          person: true,
          business: true
        }
      },
      items: true,
      quote: true,
      payments: true
    }
  });

  if (!invoice) {
    return { reason: 'Invoice not found', requirement: 'Valid invoice' };
  }

  // SENT transition requirements
  if (targetStatus === 'SENT') {
    if (!invoice.items || invoice.items.length === 0) {
      return {
        reason: 'Cannot send invoice without items',
        requirement: 'At least one invoice item'
      };
    }

    // Check customer has contact information (via person or business)
    const hasContact = (invoice.customer as any).person?.email || (invoice.customer as any).person?.phone ||
                      (invoice.customer as any).business?.email || (invoice.customer as any).business?.phone;
    if (!hasContact) {
      return {
        reason: 'Customer must have email or phone to send invoice',
        requirement: 'Customer contact information'
      };
    }
  }

  // PAID transition requirements
  if (targetStatus === 'PAID') {
    const totalPaid = invoice.payments
      ?.filter(p => p.status === 'COMPLETED')
      .reduce((sum, p) => sum + Number(p.amount), 0) || 0;

    if (totalPaid < Number(invoice.total)) {
      return {
        reason: `Insufficient payment received. Paid: ${totalPaid}, Total: ${invoice.total}`,
        requirement: 'Full payment received'
      };
    }

    // Only ADMIN, MANAGER, ACCOUNTANT can mark as paid
    if (!['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT'].includes(user.role)) {
      return {
        reason: 'Insufficient permissions to mark invoice as paid',
        requirement: 'ADMIN, MANAGER, or ACCOUNTANT role'
      };
    }
  }

  // VOID/CANCELLED transition requirements
  if (targetStatus === 'VOID' || targetStatus === 'CANCELLED') {
    if (invoice.status === 'PAID') {
      return {
        reason: 'Cannot void/cancel paid invoice. Issue refund instead.',
        requirement: 'Invoice not paid or refunded'
      };
    }

    // Only ADMIN, MANAGER can void/cancel
    if (!['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(user.role)) {
      return {
        reason: 'Insufficient permissions to void/cancel invoice',
        requirement: 'ADMIN or MANAGER role'
      };
    }
  }

  return null;
}

/**
 * Validate customer transition prerequisites
 */
async function validateCustomerTransitionPrerequisites(
  customerId: string,
  currentStatus: string,
  targetStatus: string,
  user: { id: string; organizationId: string; role: string }
): Promise<{ reason: string; requirement: string } | null> {

  // ACTIVE transition requirements
  if (targetStatus === 'ACTIVE') {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        quotes: {
          where: { status: 'ACCEPTED' }
        }
      }
    });

    if (!customer) {
      return { reason: 'Customer not found', requirement: 'Valid customer' };
    }

    // Require accepted quote before activating from PROSPECT
    if (currentStatus === 'PROSPECT' && (!customer.quotes || customer.quotes.length === 0)) {
      return {
        reason: 'Customer must have at least one accepted quote to become ACTIVE',
        requirement: 'Accepted quote'
      };
    }
  }

  // SUSPENDED/ARCHIVED requires ADMIN or MANAGER
  if (targetStatus === 'SUSPENDED' || targetStatus === 'ARCHIVED') {
    if (!['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(user.role)) {
      return {
        reason: `Insufficient permissions to ${targetStatus.toLowerCase()} customer`,
        requirement: 'ADMIN or MANAGER role'
      };
    }
  }

  return null;
}

/**
 * Validate payment transition prerequisites
 */
async function validatePaymentTransitionPrerequisites(
  paymentId: string,
  currentStatus: string,
  targetStatus: string,
  user: { id: string; organizationId: string; role: string }
): Promise<{ reason: string; requirement: string } | null> {

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      invoice: {
        include: {
          project: true
        }
      }
    }
  });

  if (!payment) {
    return { reason: 'Payment not found', requirement: 'Valid payment' };
  }

  // COMPLETED transition requirements
  if (targetStatus === 'COMPLETED') {
    // Check if this is a deposit payment for a project
    if (payment.invoice?.project && !payment.invoice.project.depositPaid) {
      const invoiceTotal = Number(payment.invoice.total);
      const depositRequired = invoiceTotal * 0.25; // 25% minimum deposit
      const paymentAmount = Number(payment.amount);

      if (paymentAmount < depositRequired) {
        return {
          reason: `Minimum deposit of ${depositRequired.toFixed(2)} (25% of ${invoiceTotal.toFixed(2)}) required for project`,
          requirement: `Payment amount >= ${depositRequired.toFixed(2)}`
        };
      }
    }

    // Only ADMIN, MANAGER, ACCOUNTANT can complete payments
    if (!['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT'].includes(user.role)) {
      return {
        reason: 'Insufficient permissions to complete payment',
        requirement: 'ADMIN, MANAGER, or ACCOUNTANT role'
      };
    }
  }

  // REFUNDED transition requirements
  if (targetStatus === 'REFUNDED') {
    if (currentStatus !== 'COMPLETED') {
      return {
        reason: 'Can only refund completed payments',
        requirement: 'Payment status: COMPLETED'
      };
    }

    // Only ADMIN, MANAGER can issue refunds
    if (!['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(user.role)) {
      return {
        reason: 'Insufficient permissions to refund payment',
        requirement: 'ADMIN or MANAGER role'
      };
    }
  }

  return null;
}

/**
 * Middleware to enforce deposit payment before allowing work to begin
 */
export function requireDepositPaid(projectIdParam: string = 'projectId') {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const projectId = req.params[projectIdParam] || req.body[projectIdParam];

      if (!projectId) {
        res.status(400).json({ error: 'Project ID required' });
        return;
      }

      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
          invoice: {
            include: {
              payments: {
                where: { status: 'COMPLETED' }
              }
            }
          }
        }
      });

      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      if (!project.depositPaid) {
        const totalPaid = project.invoice?.payments?.reduce(
          (sum, p) => sum + Number(p.amount),
          0
        ) || 0;

        const invoiceTotal = Number(project.invoice?.total || 0);
        const depositRequired = invoiceTotal * 0.25;

        res.status(400).json({
          error: 'Deposit payment required before work can begin',
          details: {
            depositRequired: depositRequired.toFixed(2),
            totalPaid: totalPaid.toFixed(2),
            invoiceTotal: invoiceTotal.toFixed(2),
            minimumPercentage: '25%'
          }
        });
        return;
      }

      next();
    } catch (error) {
      console.error(`Deposit validation error:`, error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}