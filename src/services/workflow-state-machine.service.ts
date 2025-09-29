import { prisma } from '../config/database';
import { AuditService } from './audit.service';

/**
 * Workflow State Machine Service
 *
 * Manages state transitions for the 8-stage customer lifecycle:
 * 1. Request Quote (Customer: PROSPECT)
 * 2. Quote Estimated (Quote: DRAFT → SENT)
 * 3. Quote Accepted (Quote: SENT → ACCEPTED)
 * 4. Appointment Scheduled (Appointment: SCHEDULED)
 * 5. Invoice Generated (Invoice: DRAFT → SENT)
 * 6. Deposit Paid (Payment: COMPLETED, 25-50% of total)
 * 7. Work Begins (Project: ACTIVE)
 * 8. Project Completion (Project: COMPLETED, Invoice: PAID)
 */
export class WorkflowStateMachineService {
  private auditService: AuditService;

  constructor() {
    this.auditService = new AuditService();
  }

  /**
   * Valid state transitions for each entity type
   */
  private readonly transitions = {
    customer: {
      PROSPECT: ['ACTIVE', 'ARCHIVED'],
      ACTIVE: ['INACTIVE', 'SUSPENDED', 'ARCHIVED'],
      INACTIVE: ['ACTIVE', 'ARCHIVED'],
      SUSPENDED: ['ACTIVE', 'ARCHIVED'],
      ARCHIVED: [] // Terminal state
    },
    quote: {
      DRAFT: ['SENT', 'CANCELLED'],
      SENT: ['VIEWED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED'],
      VIEWED: ['ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED'],
      ACCEPTED: ['CANCELLED'], // Rarely cancelled after acceptance
      REJECTED: [], // Terminal state
      EXPIRED: ['SENT'], // Can be resent with new expiry
      CANCELLED: [] // Terminal state
    },
    invoice: {
      DRAFT: ['SENT', 'CANCELLED'],
      SENT: ['VIEWED', 'PAID', 'PARTIAL', 'OVERDUE', 'CANCELLED', 'VOID'],
      VIEWED: ['PAID', 'PARTIAL', 'OVERDUE', 'CANCELLED', 'VOID'],
      PARTIAL: ['PAID', 'OVERDUE', 'CANCELLED', 'VOID'],
      PAID: ['VOID'], // Can be voided if refund needed
      OVERDUE: ['PAID', 'PARTIAL', 'CANCELLED', 'VOID'],
      CANCELLED: [], // Terminal state
      VOID: [] // Terminal state
    },
    payment: {
      PENDING: ['PROCESSING', 'CANCELLED', 'FAILED'],
      PROCESSING: ['COMPLETED', 'FAILED'],
      COMPLETED: ['REFUNDED'],
      FAILED: ['PENDING'], // Can retry
      REFUNDED: [], // Terminal state
      CANCELLED: [] // Terminal state
    },
    project: {
      DRAFT: ['ACTIVE', 'CANCELLED'],
      ACTIVE: ['ON_HOLD', 'COMPLETED', 'CANCELLED'],
      ON_HOLD: ['ACTIVE', 'CANCELLED'],
      COMPLETED: [], // Terminal state
      CANCELLED: [] // Terminal state
    },
    appointment: {
      SCHEDULED: ['CONFIRMED', 'RESCHEDULED', 'CANCELLED'],
      CONFIRMED: ['COMPLETED', 'RESCHEDULED', 'NO_SHOW', 'CANCELLED'],
      RESCHEDULED: ['SCHEDULED'],
      COMPLETED: [], // Terminal state
      NO_SHOW: [], // Terminal state
      CANCELLED: [] // Terminal state
    }
  };

  /**
   * Validate if a state transition is allowed
   */
  validateTransition(
    entityType: keyof typeof this.transitions,
    fromStatus: string,
    toStatus: string
  ): { valid: boolean; allowedTransitions: string[] } {
    const entityTransitions = this.transitions[entityType];

    if (!entityTransitions || !entityTransitions[fromStatus]) {
      return {
        valid: false,
        allowedTransitions: []
      };
    }

    const allowedTransitions = entityTransitions[fromStatus];

    return {
      valid: allowedTransitions.includes(toStatus),
      allowedTransitions
    };
  }

  /**
   * Get all possible next states for current status
   */
  getAvailableTransitions(
    entityType: keyof typeof this.transitions,
    currentStatus: string,
    userRole: string
  ): string[] {
    const entityTransitions = this.transitions[entityType];

    if (!entityTransitions || !entityTransitions[currentStatus]) {
      return [];
    }

    let availableTransitions = entityTransitions[currentStatus];

    // Filter based on user role permissions
    availableTransitions = this.filterTransitionsByRole(
      entityType,
      currentStatus,
      availableTransitions,
      userRole
    );

    return availableTransitions;
  }

  /**
   * Filter transitions based on user role
   */
  private filterTransitionsByRole(
    entityType: string,
    currentStatus: string,
    transitions: string[],
    userRole: string
  ): string[] {
    // SUPER_ADMIN and ADMIN can perform all transitions
    if (userRole === 'SUPER_ADMIN' || userRole === 'ADMIN') {
      return transitions;
    }

    // MANAGER can perform most transitions except terminal state changes
    if (userRole === 'MANAGER') {
      return transitions.filter(t => !['VOID', 'ARCHIVED'].includes(t));
    }

    // ACCOUNTANT can handle quote/invoice/payment transitions
    if (userRole === 'ACCOUNTANT') {
      if (['quote', 'invoice', 'payment'].includes(entityType)) {
        return transitions.filter(t => !['VOID', 'CANCELLED', 'ARCHIVED'].includes(t));
      }
      return [];
    }

    // EMPLOYEE can only handle draft->sent transitions
    if (userRole === 'EMPLOYEE') {
      if (currentStatus === 'DRAFT') {
        return transitions.filter(t => t === 'SENT');
      }
      return [];
    }

    // VIEWER and CLIENT have no transition permissions
    return [];
  }

  /**
   * Execute a state transition with audit logging
   */
  async executeTransition(
    entityType: keyof typeof this.transitions,
    entityId: string,
    toStatus: string,
    userId: string,
    organizationId: string,
    reason?: string
  ): Promise<{ success: boolean; error?: string; previousStatus?: string }> {
    try {
      // Get current entity state
      const entity = await this.getEntity(entityType, entityId);

      if (!entity) {
        return { success: false, error: `${entityType} not found` };
      }

      const fromStatus = entity.status;

      // Validate transition
      const validation = this.validateTransition(entityType, fromStatus, toStatus);

      if (!validation.valid) {
        return {
          success: false,
          error: `Invalid transition from ${fromStatus} to ${toStatus}. Allowed: ${validation.allowedTransitions.join(', ')}`,
          previousStatus: fromStatus
        };
      }

      // Execute transition in a transaction
      await prisma.$transaction(async (tx) => {
        // Update entity status
        await this.updateEntityStatus(tx, entityType, entityId, toStatus, userId);

        // Create audit log
        await this.auditService.logAction(
          userId,
          organizationId,
          'UPDATE',
          entityType.toUpperCase(),
          entityId,
          {
            action: 'STATE_TRANSITION',
            fromStatus,
            toStatus,
            reason: reason || 'Manual state transition'
          }
        );

        // Execute post-transition actions
        await this.executePostTransitionActions(
          tx,
          entityType,
          entityId,
          fromStatus,
          toStatus,
          userId,
          organizationId
        );
      });

      return { success: true, previousStatus: fromStatus };
    } catch (error) {
      console.error(`State transition error:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get entity with current status
   */
  private async getEntity(
    entityType: string,
    entityId: string
  ): Promise<{ status: string } | null> {
    switch (entityType) {
      case 'customer':
        return await prisma.customer.findUnique({
          where: { id: entityId },
          select: { status: true }
        });
      case 'quote':
        return await prisma.quote.findUnique({
          where: { id: entityId },
          select: { status: true }
        });
      case 'invoice':
        return await prisma.invoice.findUnique({
          where: { id: entityId },
          select: { status: true }
        });
      case 'payment':
        return await prisma.payment.findUnique({
          where: { id: entityId },
          select: { status: true }
        });
      case 'project':
        return await prisma.project.findUnique({
          where: { id: entityId },
          select: { status: true }
        });
      case 'appointment':
        return await prisma.appointment.findUnique({
          where: { id: entityId },
          select: { status: true }
        });
      default:
        return null;
    }
  }

  /**
   * Update entity status
   */
  private async updateEntityStatus(
    tx: any,
    entityType: string,
    entityId: string,
    status: string,
    userId: string
  ): Promise<void> {
    const updateData = {
      status,
      updatedBy: userId,
      updatedAt: new Date()
    };

    switch (entityType) {
      case 'customer':
        await tx.customer.update({
          where: { id: entityId },
          data: updateData
        });
        break;
      case 'quote':
        await tx.quote.update({
          where: { id: entityId },
          data: updateData
        });
        break;
      case 'invoice':
        await tx.invoice.update({
          where: { id: entityId },
          data: updateData
        });
        break;
      case 'payment':
        await tx.payment.update({
          where: { id: entityId },
          data: updateData
        });
        break;
      case 'project':
        await tx.project.update({
          where: { id: entityId },
          data: updateData
        });
        break;
      case 'appointment':
        await tx.appointment.update({
          where: { id: entityId },
          data: updateData
        });
        break;
    }
  }

  /**
   * Execute actions after successful state transition
   */
  private async executePostTransitionActions(
    tx: any,
    entityType: string,
    entityId: string,
    fromStatus: string,
    toStatus: string,
    userId: string,
    organizationId: string
  ): Promise<void> {
    // Quote accepted -> Activate customer
    if (entityType === 'quote' && toStatus === 'ACCEPTED') {
      const quote = await tx.quote.findUnique({
        where: { id: entityId },
        select: { customerId: true }
      });

      if (quote) {
        await tx.customer.update({
          where: { id: quote.customerId },
          data: {
            status: 'ACTIVE',
            updatedBy: userId,
            updatedAt: new Date()
          }
        });
      }
    }

    // Payment completed -> Check if deposit paid and update invoice
    if (entityType === 'payment' && toStatus === 'COMPLETED') {
      const payment = await tx.payment.findUnique({
        where: { id: entityId },
        include: {
          invoice: {
            include: {
              project: true,
              payments: {
                where: { status: 'COMPLETED' }
              }
            }
          }
        }
      });

      if (payment && payment.invoice) {
        // Calculate total paid
        const totalPaid = payment.invoice.payments.reduce(
          (sum, p) => sum + Number(p.amount),
          0
        ) + Number(payment.amount);

        const invoiceTotal = Number(payment.invoice.total);
        const depositThreshold = invoiceTotal * 0.25;

        // Check if invoice status should change
        let newInvoiceStatus = payment.invoice.status;
        if (totalPaid >= invoiceTotal) {
          newInvoiceStatus = 'PAID';
        } else if (totalPaid > 0 && totalPaid < invoiceTotal) {
          newInvoiceStatus = 'PARTIAL';
        }

        // Update invoice
        await tx.invoice.update({
          where: { id: payment.invoiceId },
          data: {
            amountPaid: totalPaid,
            status: newInvoiceStatus,
            updatedBy: userId,
            updatedAt: new Date()
          }
        });

        // Mark deposit as paid if threshold met
        if (payment.invoice.project && !payment.invoice.project.depositPaid && totalPaid >= depositThreshold) {
          await tx.project.update({
            where: { id: payment.invoice.project.id },
            data: {
              depositPaid: true,
              depositPaidAt: new Date(),
              updatedBy: userId,
              updatedAt: new Date()
            }
          });
        }
      }
    }

    // Invoice paid -> Mark project as ready for completion
    if (entityType === 'invoice' && toStatus === 'PAID') {
      const invoice = await tx.invoice.findUnique({
        where: { id: entityId },
        include: { project: true }
      });

      if (invoice && invoice.project && invoice.project.status === 'ACTIVE') {
        // Project can now be marked as completed by user
        // We don't auto-complete as physical work may still be in progress
      }
    }
  }

  /**
   * Get workflow stage for customer lifecycle
   */
  async getCustomerLifecycleStage(customerId: string): Promise<{
    stage: number;
    stageName: string;
    completed: boolean;
    nextAction: string;
  }> {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        quotes: true,
        invoices: {
          include: {
            payments: true
          }
        },
        projects: true,
        appointments: true
      }
    });

    if (!customer) {
      return {
        stage: 0,
        stageName: 'Unknown',
        completed: false,
        nextAction: 'Customer not found'
      };
    }

    // Stage 1: Request Quote
    if (customer.status === 'PROSPECT' && customer.quotes.length === 0) {
      return {
        stage: 1,
        stageName: 'Request Quote',
        completed: false,
        nextAction: 'Create a quote for the customer'
      };
    }

    // Stage 2: Quote Estimated
    const draftOrSentQuotes = customer.quotes.filter(q => ['DRAFT', 'SENT', 'VIEWED'].includes(q.status));
    if (draftOrSentQuotes.length > 0) {
      return {
        stage: 2,
        stageName: 'Quote Estimated',
        completed: false,
        nextAction: 'Customer needs to accept quote'
      };
    }

    // Stage 3: Quote Accepted
    const acceptedQuotes = customer.quotes.filter(q => q.status === 'ACCEPTED');
    if (acceptedQuotes.length > 0 && customer.invoices.length === 0) {
      return {
        stage: 3,
        stageName: 'Quote Accepted',
        completed: false,
        nextAction: 'Schedule appointment or generate invoice'
      };
    }

    // Stage 4: Appointment Scheduled
    const scheduledAppointments = customer.appointments.filter(a => ['SCHEDULED', 'CONFIRMED'].includes(a.status));
    if (scheduledAppointments.length > 0 && customer.invoices.length === 0) {
      return {
        stage: 4,
        stageName: 'Appointment Scheduled',
        completed: false,
        nextAction: 'Generate invoice after appointment'
      };
    }

    // Stage 5: Invoice Generated
    const activeInvoices = customer.invoices.filter(i => ['DRAFT', 'SENT', 'VIEWED'].includes(i.status));
    if (activeInvoices.length > 0) {
      return {
        stage: 5,
        stageName: 'Invoice Generated',
        completed: false,
        nextAction: 'Collect deposit payment (25-50%)'
      };
    }

    // Stage 6: Deposit Paid
    const partialInvoices = customer.invoices.filter(i => i.status === 'PARTIAL');
    if (partialInvoices.length > 0) {
      const project = customer.projects.find(p => p.status === 'DRAFT');
      if (project && !project.depositPaid) {
        return {
          stage: 6,
          stageName: 'Awaiting Deposit',
          completed: false,
          nextAction: 'Process deposit payment to begin work'
        };
      }

      return {
        stage: 6,
        stageName: 'Deposit Paid',
        completed: true,
        nextAction: 'Begin work on project'
      };
    }

    // Stage 7: Work Begins
    const activeProjects = customer.projects.filter(p => p.status === 'ACTIVE');
    if (activeProjects.length > 0) {
      return {
        stage: 7,
        stageName: 'Work in Progress',
        completed: false,
        nextAction: 'Complete project work'
      };
    }

    // Stage 8: Project Completion
    const completedProjects = customer.projects.filter(p => p.status === 'COMPLETED');
    const paidInvoices = customer.invoices.filter(i => i.status === 'PAID');

    if (completedProjects.length > 0 && paidInvoices.length > 0) {
      return {
        stage: 8,
        stageName: 'Project Completed',
        completed: true,
        nextAction: 'Lifecycle complete - customer may request new services'
      };
    }

    // Default fallback
    return {
      stage: 1,
      stageName: 'Initial Contact',
      completed: false,
      nextAction: 'Create quote for customer'
    };
  }
}