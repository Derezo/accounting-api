import * as crypto from 'crypto';
import { Payment } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { config } from '../config/config';
import { auditService } from './audit.service';
import { PaymentMethod, PaymentStatus } from '../types/enums';
import { emailService } from './email.service';



import { prisma } from '../config/database';
export interface CreateETransferData {
  customerId: string;
  invoiceId?: string;
  amount: number;
  currency?: string;
  recipientEmail: string;
  recipientName: string;
  securityQuestion?: string;
  securityAnswer?: string;
  message?: string;
  autoDeposit?: boolean;
  expiryHours?: number;
  metadata?: Record<string, any>;
}

export interface ETransferNotificationData {
  etransferNumber: string;
  amount: number;
  currency: string;
  senderName: string;
  message?: string;
  securityQuestion?: string;
  depositUrl: string;
  expiryDate: Date;
}

export interface ConfirmETransferDepositData {
  etransferNumber: string;
  confirmationCode?: string;
  depositedAt?: Date;
  actualAmount?: number;
  fees?: number;
}

export interface ETransferStats {
  totalSent: number;
  totalPending: number;
  totalDeposited: number;
  totalExpired: number;
  totalCancelled: number;
  averageDepositTime: number; // in hours
  totalFees: number;
}

export class ETransferService {
  private generateETransferNumber(): string {
    const timestamp = Date.now().toString();
    const random = crypto.randomBytes(4).toString('hex').toUpperCase();
    return `ET-${timestamp}-${random}`;
  }

  private generateReferenceNumber(): string {
    // Generate Canadian banking compatible reference number
    const prefix = 'CA';
    const timestamp = Date.now().toString().slice(-8);
    const random = crypto.randomBytes(3).toString('hex').toUpperCase();
    return `${prefix}${timestamp}${random}`;
  }

  private encryptSecurityAnswer(answer: string): string {
    const cipher = crypto.createCipher('aes-256-cbc', config.ENCRYPTION_KEY);
    let encrypted = cipher.update(answer, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
  }

  private _decryptSecurityAnswer(encryptedAnswer: string): string {
    const decipher = crypto.createDecipher('aes-256-cbc', config.ENCRYPTION_KEY);
    let decrypted = decipher.update(encryptedAnswer, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  async createETransfer(
    data: CreateETransferData,
    organizationId: string,
    auditContext: { userId?: string; ipAddress?: string; userAgent?: string }
  ): Promise<unknown> {
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
      const remainingBalanceNum = remainingBalance instanceof Decimal ? remainingBalance.toNumber() : Number(remainingBalance);
      if (data.amount > remainingBalanceNum) {
        throw new Error(`Payment amount (${data.amount}) exceeds remaining balance (${remainingBalanceNum})`);
      }
    }

    const etransferNumber = this.generateETransferNumber();
    const referenceNumber = this.generateReferenceNumber();
    const currency = data.currency || config.DEFAULT_CURRENCY;
    const expiryDate = new Date();
    expiryDate.setHours(expiryDate.getHours() + (data.expiryHours || 72)); // Default 72 hours

    // Calculate fees (simplified - in real implementation would integrate with bank API)
    const processorFee = this.calculateETransferFees(data.amount);
    const netAmount = data.amount - processorFee;

    // Encrypt security answer if provided
    const encryptedSecurityAnswer = data.securityAnswer
      ? this.encryptSecurityAnswer(data.securityAnswer)
      : null;

    // Create payment record with e-transfer specific data
    const payment = await prisma.payment.create({
      data: {
        organizationId,
        paymentNumber: etransferNumber,
        customerId: data.customerId,
        invoiceId: data.invoiceId,
        paymentMethod: PaymentMethod.INTERAC_ETRANSFER,
        amount: data.amount,
        currency,
        paymentDate: new Date(),
        referenceNumber,
        status: PaymentStatus.PENDING,
        processorFee,
        netAmount,
        customerNotes: data.message,
        adminNotes: `E-Transfer to: ${data.recipientEmail}`,
        metadata: JSON.stringify({
          etransfer: {
            recipientEmail: data.recipientEmail,
            recipientName: data.recipientName,
            securityQuestion: data.securityQuestion,
            securityAnswer: encryptedSecurityAnswer,
            autoDeposit: data.autoDeposit || false,
            expiryDate: expiryDate.toISOString(),
            sentAt: new Date().toISOString(),
            ...data.metadata
          }
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

    // In a real implementation, this would integrate with bank APIs
    // For now, we'll simulate the e-transfer sending process
    await this.simulateETransferSending(payment, data);

    // Send notification email to recipient
    if (emailService) {
      try {
        await this.sendETransferNotification(payment, data);
      } catch (error) {
        console.error('Failed to send e-transfer notification:', error);
        // Don't fail the payment creation if email fails
      }
    }

    // Log payment creation
    await auditService.logAction({
      action: 'CREATE',
      entityType: 'ETransfer',
      entityId: payment.id,
      changes: {
        payment: payment,
        etransferData: {
          recipientEmail: data.recipientEmail,
          amount: data.amount,
          currency
        }
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

  private calculateETransferFees(amount: number): number {
    // Canadian bank e-transfer fees (simplified)
    // Typical fees: $1.00 for amounts under $100, $1.50 for amounts $100+
    if (amount < 100) {
      return 1.00;
    } else if (amount < 1000) {
      return 1.50;
    } else {
      return 2.00;
    }
  }

  private async simulateETransferSending(payment: any, _data: CreateETransferData): Promise<void> {
    // In a real implementation, this would integrate with:
    // - Interac e-Transfer API
    // - Bank's API (TD, RBC, BMO, etc.)
    // - Payment processor like Mogo, Nuvei, or similar

    // For now, we'll update the payment status to PROCESSING
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.PROCESSING,
        adminNotes: `${payment.adminNotes}\nE-Transfer initiated at ${new Date().toISOString()}`
      }
    });
  }

  private async sendETransferNotification(payment: any, data: CreateETransferData): Promise<void> {
    const metadata = JSON.parse(payment.metadata);
    const organization = await prisma.organization.findUnique({
      where: { id: payment.organizationId }
    });

    const notificationData: ETransferNotificationData = {
      etransferNumber: payment.paymentNumber,
      amount: payment.amount,
      currency: payment.currency,
      senderName: organization?.name || 'Business',
      message: data.message,
      securityQuestion: data.securityQuestion,
      depositUrl: `${process.env.FRONTEND_URL}/etransfer/deposit/${payment.paymentNumber}`,
      expiryDate: new Date(metadata.etransfer.expiryDate)
    };

    // This would integrate with your email service
    await emailService.sendETransferNotification(data.recipientEmail, notificationData);
  }

  async confirmETransferDeposit(
    data: ConfirmETransferDepositData,
    organizationId: string,
    auditContext: { userId?: string; ipAddress?: string; userAgent?: string }
  ): Promise<Payment> {
    const payment = await prisma.payment.findFirst({
      where: {
        paymentNumber: data.etransferNumber,
        organizationId,
        paymentMethod: PaymentMethod.INTERAC_ETRANSFER,
        deletedAt: null
      },
      include: {
        customer: true,
        invoice: true
      }
    });

    if (!payment) {
      throw new Error('E-Transfer not found');
    }

    if (payment.status === PaymentStatus.COMPLETED) {
      throw new Error('E-Transfer has already been deposited');
    }

    if (payment.status === PaymentStatus.CANCELLED || payment.status === PaymentStatus.FAILED) {
      throw new Error('E-Transfer has been cancelled or failed');
    }

    const metadata = JSON.parse(payment.metadata || '{}');
    const expiryDate = new Date(metadata.etransfer?.expiryDate);

    if (new Date() > expiryDate) {
      // Auto-cancel expired e-transfers
      await this.cancelETransfer(data.etransferNumber, 'Expired', organizationId, auditContext);
      throw new Error('E-Transfer has expired');
    }

    const depositedAt = data.depositedAt || new Date();
    // Convert payment.amount from Decimal to number if needed
    const paymentAmount = payment.amount instanceof Decimal ? payment.amount.toNumber() : Number(payment.amount);
    const actualAmount = data.actualAmount ?
      (typeof data.actualAmount === 'number' ? data.actualAmount : Number(data.actualAmount)) :
      paymentAmount;
    const fees = data.fees || 0;

    // Update payment status to completed
    const netAmountValue = actualAmount - fees;
    const updatedPayment = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.COMPLETED,
        processedAt: depositedAt,
        netAmount: netAmountValue,
        adminNotes: `${payment.adminNotes}\nDeposited at ${depositedAt.toISOString()}${data.confirmationCode ? ` (Confirmation: ${data.confirmationCode})` : ''}`,
        metadata: JSON.stringify({
          ...metadata,
          etransfer: {
            ...metadata.etransfer,
            depositedAt: depositedAt.toISOString(),
            confirmationCode: data.confirmationCode,
            actualAmount,
            fees
          }
        })
      }
    });

    // Update invoice if payment is linked to one
    if (payment.invoiceId) {
      const invoiceService = await import('./invoice.service');
      // actualAmount is already a number from the conversion above
      await invoiceService.invoiceService.recordPayment(
        payment.invoiceId,
        actualAmount,
        organizationId,
        { userId: auditContext.userId || 'system', ipAddress: auditContext.ipAddress, userAgent: auditContext.userAgent }
      );
    }

    // Log deposit confirmation
    await auditService.logAction({
      action: 'UPDATE',
      entityType: 'ETransfer',
      entityId: payment.id,
      changes: {
        status: { from: payment.status, to: PaymentStatus.COMPLETED },
        depositedAt: depositedAt.toISOString(),
        confirmationCode: data.confirmationCode,
        actualAmount,
        fees
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

  async cancelETransfer(
    etransferNumber: string,
    reason: string,
    organizationId: string,
    auditContext: { userId?: string; ipAddress?: string; userAgent?: string }
  ): Promise<Payment> {
    const payment = await prisma.payment.findFirst({
      where: {
        paymentNumber: etransferNumber,
        organizationId,
        paymentMethod: PaymentMethod.INTERAC_ETRANSFER,
        deletedAt: null
      }
    });

    if (!payment) {
      throw new Error('E-Transfer not found');
    }

    if (payment.status === PaymentStatus.COMPLETED) {
      throw new Error('Cannot cancel a completed e-transfer');
    }

    if (payment.status === PaymentStatus.CANCELLED) {
      throw new Error('E-Transfer is already cancelled');
    }

    const updatedPayment = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.CANCELLED,
        failureReason: reason,
        adminNotes: `${payment.adminNotes}\nCancelled at ${new Date().toISOString()}: ${reason}`
      }
    });

    // Log cancellation
    await auditService.logAction({
      action: 'UPDATE',
      entityType: 'ETransfer',
      entityId: payment.id,
      changes: {
        status: { from: payment.status, to: PaymentStatus.CANCELLED },
        cancellationReason: reason
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

  async getETransfer(
    etransferNumber: string,
    organizationId: string
  ): Promise<unknown> {
    const payment = await prisma.payment.findFirst({
      where: {
        paymentNumber: etransferNumber,
        organizationId,
        paymentMethod: PaymentMethod.INTERAC_ETRANSFER,
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

    if (!payment) {
      return null;
    }

    // Parse metadata and decrypt security answer if present
    const metadata = JSON.parse(payment.metadata || '{}');
    if (metadata.etransfer?.securityAnswer) {
      metadata.etransfer.securityAnswer = '[ENCRYPTED]'; // Don't expose actual answer
    }

    return {
      ...payment,
      metadata: JSON.stringify(metadata)
    };
  }

  async listETransfers(
    organizationId: string,
    filter: {
      customerId?: string;
      status?: PaymentStatus;
      startDate?: Date;
      endDate?: Date;
      recipientEmail?: string;
    } = {},
    page: number = 1,
    limit: number = 50
  ): Promise<{
    etransfers: unknown[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const where: Record<string, unknown> = {
      organizationId,
      paymentMethod: PaymentMethod.INTERAC_ETRANSFER,
      deletedAt: null
    };

    if (filter.customerId) where.customerId = filter.customerId;
    if (filter.status) where.status = filter.status;
    if (filter.startDate || filter.endDate) {
      where.paymentDate = {} as any;
      if (filter.startDate) (where.paymentDate as any).gte = filter.startDate;
      if (filter.endDate) (where.paymentDate as any).lte = filter.endDate;
    }

    // Handle recipient email filter (stored in metadata)
    let metadataFilter = {};
    if (filter.recipientEmail) {
      metadataFilter = {
        metadata: {
          contains: filter.recipientEmail
        }
      };
    }

    const [etransfers, total] = await Promise.all([
      prisma.payment.findMany({
        where: { ...where, ...metadataFilter },
        include: {
          customer: {
            include: {
              person: true,
              business: true
            }
          },
          invoice: true
        },
        orderBy: { paymentDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.payment.count({ where: { ...where, ...metadataFilter } })
    ]);

    // Clean up metadata for response
    const cleanedETransfers = etransfers.map(etransfer => {
      const metadata = JSON.parse(etransfer.metadata || '{}');
      if (metadata.etransfer?.securityAnswer) {
        metadata.etransfer.securityAnswer = '[ENCRYPTED]';
      }
      return {
        ...etransfer,
        metadata: JSON.stringify(metadata)
      };
    });

    return {
      etransfers: cleanedETransfers,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    };
  }

  async getETransferStats(
    organizationId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<ETransferStats> {
    const where: Record<string, unknown> = {
      organizationId,
      paymentMethod: PaymentMethod.INTERAC_ETRANSFER,
      deletedAt: null,
      ...((startDate || endDate) && {
        paymentDate: {
          ...(startDate && { gte: startDate }),
          ...(endDate && { lte: endDate })
        }
      })
    };

    const etransfers = await prisma.payment.findMany({
      where,
      select: {
        status: true,
        amount: true,
        processorFee: true,
        paymentDate: true,
        processedAt: true,
        metadata: true
      }
    });

    const stats = {
      totalSent: 0,
      totalPending: 0,
      totalDeposited: 0,
      totalExpired: 0,
      totalCancelled: 0,
      averageDepositTime: 0,
      totalFees: 0
    };

    let totalDepositTime = 0;
    let depositedCount = 0;

    etransfers.forEach(etransfer => {
      switch (etransfer.status) {
        case PaymentStatus.PENDING:
        case PaymentStatus.PROCESSING:
          stats.totalPending++;
          break;
        case PaymentStatus.COMPLETED:
          stats.totalDeposited++;
          if (etransfer.processedAt) {
            const depositTime = (etransfer.processedAt.getTime() - etransfer.paymentDate.getTime()) / (1000 * 60 * 60);
            totalDepositTime += depositTime;
            depositedCount++;
          }
          break;
        case PaymentStatus.CANCELLED:
          // Check if cancelled due to expiry
          try {
            const metadata = JSON.parse(etransfer.metadata || '{}');
            const expiryDate = new Date(metadata.etransfer?.expiryDate);
            if (new Date() > expiryDate) {
              stats.totalExpired++;
            } else {
              stats.totalCancelled++;
            }
          } catch {
            stats.totalCancelled++;
          }
          break;
        case PaymentStatus.FAILED:
          stats.totalCancelled++;
          break;
      }

      stats.totalSent++;
      const fee = typeof etransfer.processorFee === 'number' ? etransfer.processorFee : Number(etransfer.processorFee) || 0;
      stats.totalFees += fee;
    });

    stats.averageDepositTime = depositedCount > 0 ? totalDepositTime / depositedCount : 0;

    return stats;
  }

  async checkExpiredETransfers(organizationId?: string): Promise<number> {
    const where: Record<string, unknown> = {
      paymentMethod: PaymentMethod.INTERAC_ETRANSFER,
      status: {
        in: [PaymentStatus.PENDING, PaymentStatus.PROCESSING]
      },
      deletedAt: null
    };

    if (organizationId) {
      where.organizationId = organizationId;
    }

    const pendingETransfers = await prisma.payment.findMany({
      where,
      select: {
        id: true,
        paymentNumber: true,
        organizationId: true,
        metadata: true
      }
    });

    let expiredCount = 0;
    const now = new Date();

    for (const etransfer of pendingETransfers) {
      try {
        const metadata = JSON.parse(etransfer.metadata || '{}');
        const expiryDate = new Date(metadata.etransfer?.expiryDate);

        if (now > expiryDate) {
          await this.cancelETransfer(
            etransfer.paymentNumber,
            'Automatically expired',
            etransfer.organizationId,
            { userId: 'system' }
          );
          expiredCount++;
        }
      } catch (error) {
        console.error(`Error checking expiry for e-transfer ${etransfer.paymentNumber}:`, error);
      }
    }

    return expiredCount;
  }
}

export const etransferService = new ETransferService();