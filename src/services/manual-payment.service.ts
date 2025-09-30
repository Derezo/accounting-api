import crypto from 'crypto';
import { Payment } from '@prisma/client';
import { config } from '../config/config';
import { auditService } from './audit.service';
import { emailService } from './email.service';
import { PaymentMethod, PaymentStatus } from '../types/enums';



import { prisma } from '../config/database';
export interface CreateManualPaymentData {
  customerId: string;
  invoiceId?: string;
  amount: number;
  currency?: string;
  paymentMethod: PaymentMethod;
  paymentDate?: Date;
  referenceNumber?: string;
  chequeNumber?: string;
  bankReference?: string;
  exchangeRate?: number;
  originalAmount?: number;
  originalCurrency?: string;
  customerNotes?: string;
  adminNotes?: string;
  receiptDocuments?: string[]; // S3 URLs or file paths
  metadata?: Record<string, any>;
}

export interface BatchPaymentData {
  payments: CreateManualPaymentData[];
  batchReference?: string;
  batchNotes?: string;
}

export interface ReconciliationData {
  bankStatementReference: string;
  bankStatementDate: Date;
  bankAmount: number;
  paymentIds: string[];
  reconciliationNotes?: string;
}

export interface PaymentPlanData {
  customerId: string;
  invoiceId?: string;
  totalAmount: number;
  currency?: string;
  installments: {
    amount: number;
    dueDate: Date;
    description?: string;
  }[];
  paymentMethod?: PaymentMethod;
  setupFee?: number;
  interestRate?: number;
  notes?: string;
}

export interface PartialPaymentAllocation {
  paymentId: string;
  allocations: {
    invoiceId: string;
    amount: number;
    description?: string;
  }[];
}

export interface BatchPaymentResult {
  successful: Payment[];
  failed: { error: string; data: CreateManualPaymentData }[];
  batchId: string;
}

export interface ReconciliationResult {
  reconciledPayments: Payment[];
  discrepancies: {
    type: string;
    expected: number;
    actual: number;
    difference: number;
  }[];
}

export interface PaymentPlanResult {
  paymentPlan: {
    id: string;
    customerId: string;
    invoiceId?: string;
    totalAmount: number;
    currency: string;
    installments: number;
    status: string;
    createdAt: Date;
  };
  scheduledPayments: Payment[];
}

export class ManualPaymentService {
  /**
   * Helper to safely log audit actions without blocking operations
   * Audit failures should never prevent financial operations from completing
   */
  private async safeAuditLog(auditData: any): Promise<void> {
    try {
      await auditService.logAction(auditData);
    } catch (error) {
      console.error('Audit logging failed (non-blocking):', error);
    }
  }

  private generatePaymentNumber(paymentMethod: PaymentMethod): string {
    const methodPrefix = this.getMethodPrefix(paymentMethod);
    const timestamp = Date.now().toString();
    const random = crypto.randomBytes(3).toString('hex').toUpperCase();
    return `${methodPrefix}-${timestamp}-${random}`;
  }

  private getMethodPrefix(paymentMethod: PaymentMethod): string {
    switch (paymentMethod) {
      case PaymentMethod.CASH:
        return 'CASH';
      case PaymentMethod.CHEQUE:
        return 'CHQ';
      case PaymentMethod.BANK_TRANSFER:
        return 'WIRE';
      case PaymentMethod.INTERAC_ETRANSFER:
        return 'ET';
      case PaymentMethod.OTHER:
        return 'OTH';
      default:
        return 'PAY';
    }
  }

  async createManualPayment(
    data: CreateManualPaymentData,
    organizationId: string,
    auditContext: { userId?: string; ipAddress?: string; userAgent?: string }
  ): Promise<Payment> {
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
    let invoice = null;
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

      // Verify payment amount doesn't exceed remaining balance
      const remainingBalance = invoice.balance;
      if (data.amount > remainingBalance.toNumber()) {
        throw new Error(`Payment amount (${data.amount}) exceeds remaining balance (${remainingBalance})`);
      }
    }

    const paymentNumber = this.generatePaymentNumber(data.paymentMethod);
    const paymentDate = data.paymentDate || new Date();
    const currency = data.currency || config.DEFAULT_CURRENCY;

    // Handle multi-currency payments
    let finalAmount = data.amount;
    let exchangeData = null;

    if (data.originalCurrency && data.originalCurrency !== currency) {
      if (!data.exchangeRate || !data.originalAmount) {
        throw new Error('Exchange rate and original amount required for multi-currency payments');
      }

      exchangeData = {
        originalAmount: data.originalAmount,
        originalCurrency: data.originalCurrency,
        exchangeRate: data.exchangeRate,
        convertedAmount: data.amount
      };
    }

    // Generate reference number if not provided
    let referenceNumber = data.referenceNumber;
    if (!referenceNumber) {
      referenceNumber = this.generateReferenceNumber(data.paymentMethod);
    }

    // Validate payment method specific fields
    this.validatePaymentMethodFields(data);

    // Calculate processor fees (usually none for manual payments)
    const processorFee = 0;
    const netAmount = finalAmount - processorFee;

    const payment = await prisma.payment.create({
      data: {
        organizationId,
        paymentNumber,
        customerId: data.customerId,
        invoiceId: data.invoiceId,
        paymentMethod: data.paymentMethod,
        amount: finalAmount,
        currency,
        paymentDate,
        referenceNumber,
        bankReference: data.bankReference,
        status: PaymentStatus.COMPLETED, // Manual payments are typically completed immediately
        processorFee,
        netAmount,
        customerNotes: data.customerNotes,
        adminNotes: data.adminNotes,
        processedAt: new Date(),
        metadata: JSON.stringify({
          manualPayment: true,
          chequeNumber: data.chequeNumber,
          receiptDocuments: data.receiptDocuments || [],
          exchangeData,
          ...data.metadata
        })
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

    // Update invoice if payment is linked to one
    if (payment.invoiceId) {
      const invoiceService = await import('./invoice.service');
      await invoiceService.invoiceService.recordPayment(
        payment.invoiceId,
        payment.amount.toNumber(),
        organizationId,
        { userId: auditContext.userId || 'system', ipAddress: auditContext.ipAddress, userAgent: auditContext.userAgent }
      );
    }

    // Send payment receipt if customer has email
    const customerEmail = customer.person?.email || customer.business?.email;
    if (customerEmail && emailService) {
      try {
        await emailService.sendPaymentReceipt(customerEmail, {
          paymentNumber: payment.paymentNumber,
          amount: payment.amount.toNumber(),
          currency: payment.currency,
          paymentMethod: this.formatPaymentMethod(payment.paymentMethod as PaymentMethod),
          paymentDate: payment.paymentDate,
          customerName: customer.person
            ? `${customer.person.firstName} ${customer.person.lastName}`
            : customer.business?.legalName || 'Customer',
          invoiceNumber: invoice?.invoiceNumber,
          businessName: 'Your Business' // This should come from organization
        });
      } catch (error) {
        console.error('Failed to send payment receipt:', error);
        // Don't fail the payment creation if email fails
      }
    }

    // Log payment creation (non-blocking)
    await this.safeAuditLog({
      action: 'CREATE',
      entityType: 'ManualPayment',
      entityId: payment.id,
      changes: {
        payment: payment,
        paymentMethod: data.paymentMethod,
        amount: data.amount
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

  private validatePaymentMethodFields(data: CreateManualPaymentData): void {
    switch (data.paymentMethod) {
      case PaymentMethod.CHEQUE:
        if (!data.chequeNumber) {
          throw new Error('Cheque number is required for cheque payments');
        }
        break;
      case PaymentMethod.BANK_TRANSFER:
        if (!data.bankReference) {
          throw new Error('Bank reference is required for bank transfer payments');
        }
        break;
      case PaymentMethod.CASH:
        // Cash payments might require receipt documents
        if (!data.receiptDocuments || data.receiptDocuments.length === 0) {
          console.warn('No receipt documents provided for cash payment');
        }
        break;
    }
  }

  private generateReferenceNumber(paymentMethod: PaymentMethod): string {
    const prefix = this.getMethodPrefix(paymentMethod);
    const timestamp = Date.now().toString().slice(-8);
    const random = crypto.randomBytes(2).toString('hex').toUpperCase();
    return `${prefix}${timestamp}${random}`;
  }

  private formatPaymentMethod(method: PaymentMethod): string {
    switch (method) {
      case PaymentMethod.CASH:
        return 'Cash';
      case PaymentMethod.CHEQUE:
        return 'Cheque';
      case PaymentMethod.BANK_TRANSFER:
        return 'Bank Transfer';
      case PaymentMethod.INTERAC_ETRANSFER:
        return 'Interac e-Transfer';
      case PaymentMethod.STRIPE_CARD:
        return 'Credit Card';
      case PaymentMethod.OTHER:
        return 'Other';
      default:
        return method;
    }
  }

  async processBatchPayments(
    batchData: BatchPaymentData,
    organizationId: string,
    auditContext: { userId?: string; ipAddress?: string; userAgent?: string }
  ): Promise<{
    successful: unknown[];
    failed: { payment: CreateManualPaymentData; error: string }[];
    batchId: string;
  }> {
    const batchId = crypto.randomUUID();
    const successful: unknown[] = [];
    const failed: { payment: CreateManualPaymentData; error: string }[] = [];

    // Process each payment in the batch
    for (const paymentData of batchData.payments) {
      try {
        const payment = await this.createManualPayment(
          {
            ...paymentData,
            adminNotes: `${paymentData.adminNotes || ''}\nBatch ID: ${batchId}${batchData.batchNotes ? `\nBatch Notes: ${batchData.batchNotes}` : ''}`.trim()
          },
          organizationId,
          auditContext
        );
        successful.push(payment);
      } catch (error) {
        failed.push({
          payment: paymentData,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    // Log batch processing
    await this.safeAuditLog({
      action: 'CREATE',
      entityType: 'BatchPayment',
      entityId: batchId,
      changes: {
        batchId,
        totalPayments: batchData.payments.length,
        successful: successful.length,
        failed: failed.length,
        batchReference: batchData.batchReference,
        batchNotes: batchData.batchNotes
      },
      context: {
        organizationId,
        userId: auditContext.userId,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent
      }
    });

    return {
      successful,
      failed,
      batchId
    };
  }

  async reconcilePayments(
    reconciliationData: ReconciliationData,
    organizationId: string,
    auditContext: { userId?: string; ipAddress?: string; userAgent?: string }
  ): Promise<{
    reconciledPayments: unknown[];
    discrepancies: unknown[];
  }> {
    // Verify all payments exist and belong to organization
    const payments = await prisma.payment.findMany({
      where: {
        id: { in: reconciliationData.paymentIds },
        organizationId,
        deletedAt: null
      }
    });

    if (payments.length !== reconciliationData.paymentIds.length) {
      throw new Error('Some payments not found or do not belong to organization');
    }

    const reconciledPayments: unknown[] = [];
    const discrepancies: unknown[] = [];

    const totalPaymentAmount = payments.reduce((sum, payment) => sum + payment.amount.toNumber(), 0);

    // Check for amount discrepancies
    if (Math.abs(totalPaymentAmount - reconciliationData.bankAmount) > 0.01) {
      discrepancies.push({
        type: 'amount_mismatch',
        expected: totalPaymentAmount,
        actual: reconciliationData.bankAmount,
        difference: reconciliationData.bankAmount - totalPaymentAmount
      });
    }

    // Update payments with reconciliation information
    for (const payment of payments) {
      const updatedPayment = await prisma.payment.update({
        where: { id: payment.id },
        data: {
          bankReference: reconciliationData.bankStatementReference,
          adminNotes: `${payment.adminNotes || ''}\nReconciled: ${reconciliationData.bankStatementDate.toISOString()}${reconciliationData.reconciliationNotes ? `\nReconciliation Notes: ${reconciliationData.reconciliationNotes}` : ''}`.trim(),
          metadata: JSON.stringify({
            ...JSON.parse(payment.metadata || '{}'),
            reconciliation: {
              bankStatementReference: reconciliationData.bankStatementReference,
              bankStatementDate: reconciliationData.bankStatementDate,
              bankAmount: reconciliationData.bankAmount,
              reconciledAt: new Date(),
              reconciledBy: auditContext.userId
            }
          })
        }
      });

      reconciledPayments.push(updatedPayment);
    }

    // Log reconciliation
    await this.safeAuditLog({
      action: 'UPDATE',
      entityType: 'PaymentReconciliation',
      entityId: reconciliationData.bankStatementReference,
      changes: {
        bankStatementReference: reconciliationData.bankStatementReference,
        bankStatementDate: reconciliationData.bankStatementDate,
        bankAmount: reconciliationData.bankAmount,
        paymentIds: reconciliationData.paymentIds,
        totalPaymentAmount,
        discrepancies
      },
      context: {
        organizationId,
        userId: auditContext.userId,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent
      }
    });

    return {
      reconciledPayments,
      discrepancies
    };
  }

  async createPaymentPlan(
    planData: PaymentPlanData,
    organizationId: string,
    auditContext: { userId?: string; ipAddress?: string; userAgent?: string }
  ): Promise<{
    paymentPlan: any;
    scheduledPayments: unknown[];
  }> {
    // Verify customer exists and belongs to organization
    const customer = await prisma.customer.findFirst({
      where: {
        id: planData.customerId,
        organizationId,
        deletedAt: null
      }
    });

    if (!customer) {
      throw new Error('Customer not found');
    }

    // Verify invoice if specified
    let invoice = null;
    if (planData.invoiceId) {
      invoice = await prisma.invoice.findFirst({
        where: {
          id: planData.invoiceId,
          customerId: planData.customerId,
          organizationId,
          deletedAt: null
        }
      });

      if (!invoice) {
        throw new Error('Invoice not found or does not belong to customer');
      }
    }

    const planId = crypto.randomUUID();
    const currency = planData.currency || config.DEFAULT_CURRENCY;

    // Validate installment amounts
    const totalInstallmentAmount = planData.installments.reduce((sum, installment) => sum + installment.amount, 0);
    const expectedTotal = planData.totalAmount + (planData.setupFee || 0);

    if (Math.abs(totalInstallmentAmount - expectedTotal) > 0.01) {
      throw new Error('Sum of installments does not match total amount plus setup fee');
    }

    // Create payment plan metadata
    const paymentPlan = {
      id: planId,
      customerId: planData.customerId,
      invoiceId: planData.invoiceId,
      totalAmount: planData.totalAmount,
      currency,
      installmentCount: planData.installments.length,
      setupFee: planData.setupFee || 0,
      interestRate: planData.interestRate || 0,
      paymentMethod: planData.paymentMethod,
      notes: planData.notes,
      createdAt: new Date(),
      status: 'ACTIVE'
    };

    // Create individual scheduled payments
    const scheduledPayments = [];
    for (let i = 0; i < planData.installments.length; i++) {
      const installment = planData.installments[i];
      const paymentNumber = this.generatePaymentNumber(planData.paymentMethod || PaymentMethod.OTHER);

      const scheduledPayment = await prisma.payment.create({
        data: {
          organizationId,
          paymentNumber,
          customerId: planData.customerId,
          invoiceId: planData.invoiceId,
          paymentMethod: planData.paymentMethod || PaymentMethod.OTHER,
          amount: installment.amount,
          currency,
          paymentDate: installment.dueDate,
          status: PaymentStatus.PENDING,
          customerNotes: installment.description,
          adminNotes: `Payment Plan Installment ${i + 1}/${planData.installments.length}\nPlan ID: ${planId}`,
          metadata: JSON.stringify({
            paymentPlan: {
              planId,
              installmentNumber: i + 1,
              totalInstallments: planData.installments.length,
              dueDate: installment.dueDate
            }
          })
        }
      });

      scheduledPayments.push(scheduledPayment);
    }

    // Log payment plan creation
    await this.safeAuditLog({
      action: 'CREATE',
      entityType: 'PaymentPlan',
      entityId: planId,
      changes: {
        paymentPlan,
        scheduledPayments: scheduledPayments.length
      },
      context: {
        organizationId,
        userId: auditContext.userId,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent
      }
    });

    return {
      paymentPlan,
      scheduledPayments
    };
  }

  async allocatePartialPayment(
    allocationData: PartialPaymentAllocation,
    organizationId: string,
    auditContext: { userId?: string; ipAddress?: string; userAgent?: string }
  ): Promise<Payment> {
    // Verify payment exists and belongs to organization
    const payment = await prisma.payment.findFirst({
      where: {
        id: allocationData.paymentId,
        organizationId,
        deletedAt: null
      }
    });

    if (!payment) {
      throw new Error('Payment not found');
    }

    // Verify all invoices exist and belong to organization
    const invoiceIds = allocationData.allocations.map(allocation => allocation.invoiceId);
    const invoices = await prisma.invoice.findMany({
      where: {
        id: { in: invoiceIds },
        organizationId,
        deletedAt: null
      }
    });

    if (invoices.length !== invoiceIds.length) {
      throw new Error('Some invoices not found or do not belong to organization');
    }

    // Validate allocation amounts
    const totalAllocated = allocationData.allocations.reduce((sum, allocation) => sum + allocation.amount, 0);
    if (Math.abs(totalAllocated - payment.amount.toNumber()) > 0.01) {
      throw new Error('Total allocated amount does not match payment amount');
    }

    // Update payment with allocation information
    const updatedPayment = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        adminNotes: `${payment.adminNotes || ''}\nPartial Payment Allocated: ${new Date().toISOString()}`,
        metadata: JSON.stringify({
          ...JSON.parse(payment.metadata || '{}'),
          partialAllocation: {
            allocations: allocationData.allocations,
            allocatedAt: new Date(),
            allocatedBy: auditContext.userId
          }
        })
      }
    });

    // Apply allocations to invoices
    const invoiceService = await import('./invoice.service');
    for (const allocation of allocationData.allocations) {
      await invoiceService.invoiceService.recordPayment(
        allocation.invoiceId,
        allocation.amount,
        organizationId,
        { userId: auditContext.userId || 'system', ipAddress: auditContext.ipAddress, userAgent: auditContext.userAgent }
      );
    }

    // Log partial payment allocation
    await this.safeAuditLog({
      action: 'UPDATE',
      entityType: 'PartialPaymentAllocation',
      entityId: payment.id,
      changes: {
        paymentId: payment.id,
        allocations: allocationData.allocations,
        totalAllocated
      },
      context: {
        organizationId,
        userId: auditContext.userId,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent
      }
    });

    return updatedPayment;
  }

  async updateChequeStatus(
    paymentId: string,
    status: 'CLEARED' | 'BOUNCED' | 'CANCELLED',
    clearingDate?: Date,
    notes?: string,
    organizationId?: string,
    auditContext?: { userId?: string; ipAddress?: string; userAgent?: string }
  ): Promise<unknown> {
    const payment = await prisma.payment.findFirst({
      where: {
        id: paymentId,
        paymentMethod: PaymentMethod.CHEQUE,
        ...(organizationId && { organizationId }),
        deletedAt: null
      }
    });

    if (!payment) {
      throw new Error('Cheque payment not found');
    }

    let newStatus = payment.status;
    if (status === 'BOUNCED' || status === 'CANCELLED') {
      newStatus = PaymentStatus.FAILED;
    }

    const updatedPayment = await prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: newStatus,
        processedAt: clearingDate || new Date(),
        adminNotes: `${payment.adminNotes || ''}\nCheque ${status}: ${new Date().toISOString()}${notes ? `\nNotes: ${notes}` : ''}`.trim(),
        metadata: JSON.stringify({
          ...JSON.parse(payment.metadata || '{}'),
          chequeStatus: {
            status,
            statusDate: new Date(),
            clearingDate,
            notes
          }
        })
      }
    });

    // If cheque bounced, reverse the invoice payment
    if (status === 'BOUNCED' && payment.invoiceId) {
      const invoiceService = await import('./invoice.service');
      // This would require implementing a reverse payment method in invoice service
      console.warn('Cheque bounced - manual invoice adjustment required');
    }

    // Log cheque status update
    if (auditContext) {
      await this.safeAuditLog({
        action: 'UPDATE',
        entityType: 'ChequeStatus',
        entityId: paymentId,
        changes: {
          status: { from: payment.status, to: newStatus },
          chequeStatus: status,
          clearingDate
        },
        context: {
          organizationId: payment.organizationId,
          userId: auditContext.userId,
          ipAddress: auditContext.ipAddress,
          userAgent: auditContext.userAgent
        }
      });
    }

    return updatedPayment;
  }
}

export const manualPaymentService = new ManualPaymentService();