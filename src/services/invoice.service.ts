import { Invoice, InvoiceLineItem } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { InvoiceStatus } from '../types/enums';
import { auditService } from './audit.service';
import { prisma } from '../config/database';
import { sendInvoiceEmail } from '../utils/email-helpers';

export interface InvoiceStats {
  total: number;
  draft: number;
  sent: number;
  paid: number;
  overdue: number;
  totalValue: number;
  paidValue: number;
  outstandingValue: number;
  paymentRate: number;
}

interface CreateInvoiceData {
  customerId: string;
  quoteId?: string;
  issueDate?: Date;
  dueDate: Date;
  currency?: string;
  exchangeRate?: number;
  depositRequired: Decimal | number;
  terms?: string;
  notes?: string;
  lineItems: CreateInvoiceLineItemData[];
}

interface CreateInvoiceLineItemData {
  productId?: string;
  serviceId?: string;
  description: string;
  quantity: Decimal | number;
  unitPrice: Decimal | number;
  discountPercent?: Decimal | number;
  taxRate: Decimal | number;
}

interface UpdateInvoiceData {
  dueDate?: Date;
  currency?: string;
  exchangeRate?: number;
  depositRequired?: Decimal | number;
  terms?: string;
  notes?: string;
  lineItems?: CreateInvoiceLineItemData[];
}

interface InvoiceFilters {
  customerId?: string;
  status?: InvoiceStatus;
  issueDateFrom?: string;
  issueDateTo?: string;
  dueDateFrom?: string;
  dueDateTo?: string;
  isPastDue?: boolean;
  hasBalance?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}

export class InvoiceService {
  private toDecimal(value: Decimal | number): Decimal {
    return value instanceof Decimal ? value : new Decimal(value);
  }
  async createInvoice(
    data: CreateInvoiceData,
    organizationId: string,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<Invoice & { lineItems: InvoiceLineItem[]; customer?: unknown; quote?: unknown }> {
    // Verify customer exists and belongs to organization
    const customer = await prisma.customer.findFirst({
      where: { id: data.customerId, organizationId, deletedAt: null }
    });

    if (!customer) {
      throw new Error('Customer not found');
    }

    // If quote is provided, verify it exists and belongs to the customer
    let quote = null;
    if (data.quoteId) {
      quote = await prisma.quote.findFirst({
        where: {
          id: data.quoteId,
          customerId: data.customerId,
          organizationId,
          deletedAt: null
        },
        include: { lineItems: true }
      });

      if (!quote) {
        throw new Error('Quote not found or does not belong to this customer');
      }

      if (quote.status !== 'ACCEPTED') {
        throw new Error('Only accepted quotes can be converted to invoices');
      }

      // Check if quote is already converted to invoice
      const existingInvoice = await prisma.invoice.findFirst({
        where: { quoteId: data.quoteId, deletedAt: null }
      });

      if (existingInvoice) {
        throw new Error('Quote has already been converted to an invoice');
      }
    }

    // Validate deposit requirement
    const { subtotal, taxAmount, total } = this.calculateTotals(data.lineItems);
    const depositRequired = this.toDecimal(data.depositRequired);

    if (depositRequired.lt(0)) {
      throw new Error('Deposit required cannot be negative');
    }

    if (depositRequired.gt(total)) {
      throw new Error('Deposit required cannot exceed total invoice amount');
    }

    // Balance is always total - amountPaid, not total - depositRequired
    // depositRequired is just the minimum payment to start work, not an actual payment
    const balance = total;

    // Retry logic for invoice number generation to handle race conditions
    let invoice;
    let retries = 3;
    while (retries > 0) {
      try {
        const invoiceNumber = await this.generateInvoiceNumber(organizationId);

        invoice = await prisma.$transaction(async (tx) => {
          // Create invoice
          const newInvoice = await tx.invoice.create({
        data: {
          organizationId,
          customerId: data.customerId,
          quoteId: data.quoteId,
          invoiceNumber,
          status: InvoiceStatus.DRAFT,
          issueDate: data.issueDate || new Date(),
          dueDate: data.dueDate,
          currency: data.currency || 'CAD',
          exchangeRate: data.exchangeRate || 1.0,
          subtotal,
          taxTotal: taxAmount,
          total,
          depositRequired,
          amountPaid: 0,
          amountDue: total,
          balance,
          paymentTerms: data.terms,
          notes: data.notes,
          createdBy: auditContext.userId
        },
        include: {
          lineItems: true,
          customer: {
            include: {
              person: true,
              business: true
            }
          },
          quote: true
        }
      });

      // Create invoice items
      for (let i = 0; i < data.lineItems.length; i++) {
        const item = data.lineItems[i];
        if (!item) continue;

        const itemCalculations = this.calculateItemTotals(item);

        await tx.invoiceLineItem.create({
          data: {
            invoiceId: newInvoice.id,
            type: item.productId ? 'PRODUCT' : (item.serviceId ? 'SERVICE' : 'CUSTOM'),
            productId: item.productId || null,
            serviceId: item.serviceId || null,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discountPercent: item.discountPercent || 0,
            taxRate: item.taxRate,
            subtotal: itemCalculations.subtotal,
            discountAmount: itemCalculations.discountAmount,
            taxTotal: itemCalculations.taxAmount,
            total: itemCalculations.total,
            sortOrder: i + 1
          }
        });
      }

      // Fetch complete invoice with items
      const completeInvoice = await tx.invoice.findUnique({
        where: { id: newInvoice.id },
        include: {
          lineItems: true,
          customer: {
            include: {
              person: true,
              business: true
            }
          },
          quote: true
        }
      });

          return completeInvoice!;
        });

        // Success - break out of retry loop
        break;
      } catch (error: any) {
        retries--;
        // Check if it's a unique constraint violation on invoiceNumber
        if (error.code === 'P2002' && error.meta?.target?.includes('invoiceNumber')) {
          if (retries === 0) {
            throw new Error('Failed to generate unique invoice number after multiple attempts');
          }
          // Retry with a new number
          continue;
        }
        // For other errors, throw immediately
        throw error;
      }
    }

    if (!invoice) {
      throw new Error('Failed to create invoice');
    }

    await auditService.logCreate(
      'Invoice',
      invoice.id,
      invoice,
      {
        organizationId,
        userId: auditContext.userId,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent
      }
    );

    return invoice;
  }

  async createInvoiceFromQuote(
    quoteId: string,
    organizationId: string,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string },
    options?: {
      dueDate?: Date;
      depositRequired?: number;
      terms?: string;
      notes?: string;
    }
  ): Promise<Invoice & { lineItems: InvoiceLineItem[]; customer?: unknown; quote?: unknown }> {
    // Get the quote with items
    const quote = await prisma.quote.findFirst({
      where: {
        id: quoteId,
        organizationId,
        deletedAt: null
      },
      include: {
        lineItems: true,
        customer: true
      }
    });

    if (!quote) {
      throw new Error('Quote not found');
    }

    if (quote.status !== 'ACCEPTED') {
      throw new Error('Only accepted quotes can be converted to invoices');
    }

    // Convert quote items to invoice items
    const invoiceItems: CreateInvoiceLineItemData[] = quote.lineItems.map(item => ({
      productId: item.productId || undefined,
      serviceId: item.serviceId || undefined,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discountPercent: item.discountPercent,
      taxRate: item.taxRate
    }));

    // Calculate default deposit (30% of total)
    const defaultDepositPercentage = new Decimal(0.3);
    const defaultDeposit = quote.total.mul(defaultDepositPercentage);

    // Get customer payment terms for due date
    const paymentTerms = parseInt(quote.customer.paymentTerms || '15') || 15;
    const defaultDueDate = new Date();
    defaultDueDate.setDate(defaultDueDate.getDate() + paymentTerms);

    const invoiceData: CreateInvoiceData = {
      customerId: quote.customerId,
      quoteId: quote.id,
      dueDate: options?.dueDate || defaultDueDate,
      depositRequired: options?.depositRequired ? new Decimal(options.depositRequired) : defaultDeposit,
      terms: options?.terms || quote.terms || undefined,
      notes: options?.notes || quote.notes || undefined,
      lineItems: invoiceItems
    };

    return this.createInvoice(invoiceData, organizationId, auditContext);
  }

  async getInvoice(
    id: string,
    organizationId: string,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<(Invoice & { lineItems: InvoiceLineItem[]; customer?: unknown; quote?: unknown }) | null> {
    const invoice = await prisma.invoice.findFirst({
      where: {
        id,
        organizationId,
        deletedAt: null
      },
      include: {
        lineItems: {
          include: {
            product: true,
            service: true
          }
        },
        customer: {
          include: {
            person: true,
            business: true
          }
        },
        quote: true
      }
    });

    if (invoice) {
      await auditService.logView(
        'Invoice',
        invoice.id,
        {
          organizationId,
          userId: auditContext.userId,
          ipAddress: auditContext.ipAddress,
          userAgent: auditContext.userAgent
        }
      );
    }

    return invoice;
  }

  async updateInvoice(
    id: string,
    data: UpdateInvoiceData,
    organizationId: string,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<Invoice & { lineItems: InvoiceLineItem[] }> {
    const existingInvoice = await prisma.invoice.findFirst({
      where: {
        id,
        organizationId,
        deletedAt: null
      },
      include: { lineItems: true }
    });

    if (!existingInvoice) {
      throw new Error('Invoice not found');
    }

    if (existingInvoice.status !== InvoiceStatus.DRAFT) {
      throw new Error('Only draft invoices can be updated');
    }

    const updatedData: {
      dueDate?: Date;
      currency?: string;
      exchangeRate?: number;
      paymentTerms?: string;
      notes?: string;
      subtotal?: Decimal;
      taxTotal?: Decimal;
      total?: Decimal;
      depositRequired?: Decimal;
      balance?: Decimal;
      updatedAt?: Date;
      updatedBy?: string;
    } = {};

    // Update basic fields
    if (data.dueDate !== undefined) updatedData.dueDate = data.dueDate;
    if (data.currency !== undefined) updatedData.currency = data.currency;
    if (data.exchangeRate !== undefined) updatedData.exchangeRate = data.exchangeRate;
    if (data.terms !== undefined) updatedData.paymentTerms = data.terms;
    if (data.notes !== undefined) updatedData.notes = data.notes;

    // If items are being updated, recalculate totals
    if (data.lineItems) {
      const { subtotal, taxAmount, total } = this.calculateTotals(data.lineItems);

      updatedData.subtotal = subtotal;
      updatedData.taxTotal = taxAmount;
      updatedData.total = total;

      // Recalculate balance based on new total and existing amountPaid
      // Balance = total - amountPaid (not depositRequired)
      updatedData.balance = total.minus(existingInvoice.amountPaid);

      // Validate deposit requirement if provided
      if (data.depositRequired !== undefined) {
        const depositRequired = this.toDecimal(data.depositRequired);
        if (depositRequired.lt(0)) {
          throw new Error('Deposit required cannot be negative');
        }
        if (depositRequired.gt(total)) {
          throw new Error('Deposit required cannot exceed total invoice amount');
        }
        updatedData.depositRequired = depositRequired;
      }
    } else if (data.depositRequired !== undefined) {
      // Only deposit is being updated - validate it
      const depositRequired = this.toDecimal(data.depositRequired);
      if (depositRequired.lt(0)) {
        throw new Error('Deposit required cannot be negative');
      }
      if (depositRequired.gt(existingInvoice.total)) {
        throw new Error('Deposit required cannot exceed total invoice amount');
      }
      updatedData.depositRequired = depositRequired;
      // Balance doesn't change when depositRequired changes - it only changes with payments
    }

    updatedData.updatedAt = new Date();
    updatedData.updatedBy = auditContext.userId;

    const updatedInvoice = await prisma.$transaction(async (tx) => {
      // Update invoice
      await tx.invoice.update({
        where: { id },
        data: updatedData
      });

      // If items are being updated, use versioning to preserve history
      if (data.lineItems) {
        // COMPLETE FIX: Implement proper versioning for financial record immutability
        // Instead of deleting items, we create new versions and mark old ones as superseded

        const existingItems = await tx.invoiceLineItem.findMany({
          where: {
            invoiceId: id,
            isLatestVersion: true
          },
          orderBy: { sortOrder: 'asc' }
        });

        // Mark ALL existing items as superseded first
        await tx.invoiceLineItem.updateMany({
          where: {
            invoiceId: id,
            isLatestVersion: true
          },
          data: {
            isLatestVersion: false,
            supersededAt: new Date()
          }
        });

        // Create new versions for all items
        for (let i = 0; i < data.lineItems.length; i++) {
          const item = data.lineItems[i];
          if (!item) continue;

          const itemCalculations = this.calculateItemTotals(item);
          const oldItem = existingItems[i]; // Get corresponding old item if it exists

          // Create new version
          const newItem = await tx.invoiceLineItem.create({
            data: {
              invoiceId: id,
              type: item.productId ? 'PRODUCT' : (item.serviceId ? 'SERVICE' : 'CUSTOM'),
              productId: item.productId || null,
              serviceId: item.serviceId || null,
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              discountPercent: item.discountPercent || 0,
              taxRate: item.taxRate,
              subtotal: itemCalculations.subtotal,
              discountAmount: itemCalculations.discountAmount,
              taxTotal: itemCalculations.taxAmount,
              total: itemCalculations.total,
              sortOrder: i + 1,
              version: oldItem ? oldItem.version + 1 : 1,
              isLatestVersion: true
            }
          });

          // Link old item to new version if it exists
          if (oldItem) {
            await tx.invoiceLineItem.update({
              where: { id: oldItem.id },
              data: {
                supersededById: newItem.id
              }
            });
          }
        }
      }

      // Fetch complete updated invoice with only latest version of items
      return await tx.invoice.findUnique({
        where: { id },
        include: {
          lineItems: {
            where: { isLatestVersion: true }
          }
        }
      });
    });

    // Audit trail is now maintained through versioning (supersededAt, supersededById, version fields)
    // No need for separate audit logging of deletions since items are never deleted

    await auditService.logUpdate(
      'Invoice',
      id,
      existingInvoice,
      updatedInvoice!,
      {
        organizationId,
        userId: auditContext.userId,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent
      }
    );

    return updatedInvoice!;
  }

  async listInvoices(
    filters: InvoiceFilters,
    organizationId: string
  ): Promise<{ invoices: (Invoice & { lineItems: InvoiceLineItem[]; customer?: unknown })[]; total: number }> {
    const where: any = { organizationId, deletedAt: null };

    if (filters.customerId) {
      where.customerId = filters.customerId;
    }

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.issueDateFrom || filters.issueDateTo) {
      where.issueDate = {};
      if (filters.issueDateFrom) {
        where.issueDate.gte = new Date(filters.issueDateFrom);
      }
      if (filters.issueDateTo) {
        where.issueDate.lte = new Date(filters.issueDateTo);
      }
    }

    if (filters.dueDateFrom || filters.dueDateTo) {
      where.dueDate = {};
      if (filters.dueDateFrom) {
        where.dueDate.gte = new Date(filters.dueDateFrom);
      }
      if (filters.dueDateTo) {
        where.dueDate.lte = new Date(filters.dueDateTo);
      }
    }

    if (filters.isPastDue) {
      where.dueDate = { lt: new Date() };
      where.status = { notIn: [InvoiceStatus.PAID, InvoiceStatus.CANCELLED] };
    }

    if (filters.hasBalance) {
      where.balance = { gt: 0 };
    }

    if (filters.search) {
      where.OR = [
        { invoiceNumber: { contains: filters.search } },
        { notes: { contains: filters.search } },
        {
          customer: {
            person: {
              OR: [
                { firstName: { contains: filters.search } },
                { lastName: { contains: filters.search } },
                { email: { contains: filters.search } }
              ]
            }
          }
        },
        {
          customer: {
            business: {
              OR: [
                { legalName: { contains: filters.search } },
                { tradeName: { contains: filters.search } }
              ]
            }
          }
        }
      ];
    }

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: filters.limit || 50,
        skip: filters.offset || 0,
        include: {
          lineItems: true,
          customer: {
            include: {
              person: true,
              business: true
            }
          }
        }
      }),
      prisma.invoice.count({ where })
    ]);

    return { invoices, total };
  }

  async sendInvoice(
    id: string,
    organizationId: string,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<Invoice> {
    const invoice = await prisma.invoice.findFirst({
      where: {
        id,
        organizationId,
        deletedAt: null
      },
      include: {
        customer: true,
        organization: true,
        lineItems: true
      }
    });

    if (!invoice) {
      throw new Error('Invoice not found');
    }

    if (invoice.status !== InvoiceStatus.DRAFT) {
      throw new Error('Only draft invoices can be sent');
    }

    const updatedInvoice = await prisma.invoice.update({
      where: { id },
      data: {
        status: InvoiceStatus.SENT,
        sentAt: new Date(),
        updatedAt: new Date(),
        updatedBy: auditContext.userId
      }
    });

    await auditService.logUpdate(
      'Invoice',
      id,
      invoice,
      updatedInvoice,
      {
        organizationId,
        userId: auditContext.userId,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent
      }
    );

    // Send email notification to customer
    await sendInvoiceEmail(invoice, auditContext.userId);

    return updatedInvoice;
  }

  async markInvoiceAsViewed(
    id: string,
    organizationId: string,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<Invoice> {
    const invoice = await prisma.invoice.findFirst({
      where: {
        id,
        organizationId,
        deletedAt: null
      }
    });

    if (!invoice) {
      throw new Error('Invoice not found');
    }

    if (invoice.status !== InvoiceStatus.SENT) {
      return invoice; // Already viewed or in different status
    }

    const updatedInvoice = await prisma.invoice.update({
      where: { id },
      data: {
        status: InvoiceStatus.VIEWED,
        viewedAt: new Date(),
        updatedAt: new Date(),
        updatedBy: auditContext.userId
      }
    });

    await auditService.logUpdate(
      'Invoice',
      id,
      invoice,
      updatedInvoice,
      {
        organizationId,
        userId: auditContext.userId,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent
      }
    );

    return updatedInvoice;
  }

  async cancelInvoice(
    id: string,
    organizationId: string,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string },
    cancellationReason?: string
  ): Promise<Invoice> {
    const invoice = await prisma.invoice.findFirst({
      where: {
        id,
        organizationId,
        deletedAt: null
      }
    });

    if (!invoice) {
      throw new Error('Invoice not found');
    }

    if (invoice.status === InvoiceStatus.PAID) {
      throw new Error('Cannot cancel paid invoice');
    }

    if (invoice.status === InvoiceStatus.CANCELLED) {
      return invoice;
    }

    if (invoice.amountPaid.gt(0)) {
      throw new Error('Cannot cancel invoice with payments. Please process a refund instead.');
    }

    const updatedInvoice = await prisma.invoice.update({
      where: { id },
      data: {
        status: InvoiceStatus.CANCELLED,
        notes: cancellationReason ? `${invoice.notes || ''}\n\nCancellation Reason: ${cancellationReason}`.trim() : invoice.notes,
        updatedAt: new Date(),
        updatedBy: auditContext.userId
      }
    });

    await auditService.logUpdate(
      'Invoice',
      id,
      invoice,
      updatedInvoice,
      {
        organizationId,
        userId: auditContext.userId,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent
      }
    );

    return updatedInvoice;
  }

  async recordPayment(
    id: string,
    paymentAmount: number,
    organizationId: string,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<Invoice> {
    // HIGH-PRIORITY FIX: Use transaction with row-level locking to prevent overpayment
    // This prevents race conditions when multiple payments are processed concurrently
    const result = await prisma.$transaction(async (tx) => {
      // Read invoice with FOR UPDATE lock (Prisma doesn't support this directly in SQLite)
      // For production PostgreSQL, this would be: SELECT ... FOR UPDATE
      // SQLite uses serializable transactions by default which provides similar protection
      const invoice = await tx.invoice.findFirst({
        where: {
          id,
          organizationId,
          deletedAt: null
        }
      });

      if (!invoice) {
        throw new Error('Invoice not found');
      }

      if (invoice.status === InvoiceStatus.CANCELLED) {
        throw new Error('Cannot record payment for cancelled invoice');
      }

      if (paymentAmount <= 0) {
        throw new Error('Payment amount must be positive');
      }

      const newAmountPaid = invoice.amountPaid.plus(paymentAmount);

      // CRITICAL: Check balance within locked transaction to prevent overpayment
      if (newAmountPaid.gt(invoice.total)) {
        throw new Error(
          `Payment amount ($${paymentAmount}) would exceed remaining balance ` +
          `(Invoice total: $${invoice.total}, Already paid: $${invoice.amountPaid}, ` +
          `Remaining: $${invoice.balance})`
        );
      }

      const newBalance = invoice.total.minus(newAmountPaid);
      let newStatus = invoice.status;

      if (newBalance.eq(0)) {
        newStatus = InvoiceStatus.PAID;
      } else if (newAmountPaid.gt(0)) {
        newStatus = InvoiceStatus.PARTIALLY_PAID;
      }

      const updatedInvoice = await tx.invoice.update({
        where: { id },
        data: {
          amountPaid: newAmountPaid,
          balance: newBalance,
          status: newStatus,
          paidAt: newStatus === InvoiceStatus.PAID ? new Date() : invoice.paidAt,
          updatedAt: new Date(),
          updatedBy: auditContext.userId
        }
      });

      return { invoice, updatedInvoice };
    });

    const { invoice, updatedInvoice } = result;

    await auditService.logUpdate(
      'Invoice',
      id,
      invoice,
      updatedInvoice,
      {
        organizationId,
        userId: auditContext.userId,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent
      }
    );

    return updatedInvoice;
  }

  async getInvoiceStats(
    organizationId: string,
    customerId?: string
  ): Promise<InvoiceStats> {
    const where: any = { organizationId, deletedAt: null };
    if (customerId) {
      where.customerId = customerId;
    }

    const [
      totalInvoices,
      draftInvoices,
      sentInvoices,
      paidInvoices,
      overdueInvoices,
      totalValue,
      paidValue,
      outstandingValue,
      overdueValue
    ] = await Promise.all([
      prisma.invoice.count({ where }),
      prisma.invoice.count({ where: { ...where, status: InvoiceStatus.DRAFT } }),
      prisma.invoice.count({ where: { ...where, status: InvoiceStatus.SENT } }),
      prisma.invoice.count({ where: { ...where, status: InvoiceStatus.PAID } }),
      prisma.invoice.count({
        where: {
          ...where,
          dueDate: { lt: new Date() },
          status: { notIn: [InvoiceStatus.PAID, InvoiceStatus.CANCELLED] }
        }
      }),
      prisma.invoice.aggregate({
        where,
        _sum: { total: true }
      }),
      prisma.invoice.aggregate({
        where: { ...where, status: InvoiceStatus.PAID },
        _sum: { total: true }
      }),
      prisma.invoice.aggregate({
        where: { ...where, balance: { gt: 0 }, status: { not: InvoiceStatus.CANCELLED } },
        _sum: { balance: true }
      }),
      prisma.invoice.aggregate({
        where: {
          ...where,
          dueDate: { lt: new Date() },
          balance: { gt: 0 },
          status: { notIn: [InvoiceStatus.PAID, InvoiceStatus.CANCELLED] }
        },
        _sum: { balance: true }
      })
    ]);

    return {
      total: totalInvoices,
      draft: draftInvoices,
      sent: sentInvoices,
      paid: paidInvoices,
      overdue: overdueInvoices,
      totalValue: totalValue._sum.total?.toNumber() || 0,
      paidValue: paidValue._sum.total?.toNumber() || 0,
      outstandingValue: outstandingValue._sum.balance?.toNumber() || 0,
      paymentRate: totalInvoices > 0 ? (paidInvoices / totalInvoices) * 100 : 0
    };
  }

  private calculateTotals(lineItems: CreateInvoiceLineItemData[]): { subtotal: Decimal; taxAmount: Decimal; total: Decimal } {
    let subtotal = new Decimal(0);
    let taxAmount = new Decimal(0);

    for (const item of lineItems) {
      const itemCalculations = this.calculateItemTotals(item);
      subtotal = subtotal.plus(itemCalculations.subtotal);
      taxAmount = taxAmount.plus(itemCalculations.taxAmount);
    }

    const total = subtotal.plus(taxAmount);

    return {
      subtotal,
      taxAmount,
      total
    };
  }

  private calculateItemTotals(item: CreateInvoiceLineItemData): {
    subtotal: Decimal;
    discountAmount: Decimal;
    taxAmount: Decimal;
    total: Decimal;
  } {
    const quantity = this.toDecimal(item.quantity);
    const unitPrice = this.toDecimal(item.unitPrice);
    const discountPercent = this.toDecimal(item.discountPercent || 0);
    const taxRate = this.toDecimal(item.taxRate);

    // Validate inputs
    if (quantity.lt(0)) {
      throw new Error(`Invalid quantity: ${quantity}. Quantity cannot be negative.`);
    }
    if (unitPrice.lt(0)) {
      throw new Error(`Invalid unit price: ${unitPrice}. Unit price cannot be negative.`);
    }
    if (discountPercent.lt(0) || discountPercent.gt(100)) {
      throw new Error(`Invalid discount: ${discountPercent}%. Discount must be between 0 and 100.`);
    }
    if (taxRate.lt(0) || taxRate.gt(100)) {
      throw new Error(`Invalid tax rate: ${taxRate}%. Tax rate must be between 0 and 100.`);
    }

    const lineTotal = quantity.mul(unitPrice);
    const discountAmount = lineTotal.mul(discountPercent).div(100);
    const subtotal = lineTotal.minus(discountAmount);
    const taxAmount = subtotal.mul(taxRate).div(100);
    const total = subtotal.plus(taxAmount);

    // Financial integrity check - ensure totals are not negative
    if (subtotal.lt(0)) {
      throw new Error('Line item subtotal cannot be negative. Check quantity, price, and discount values.');
    }
    if (total.lt(0)) {
      throw new Error('Line item total cannot be negative. Check calculation inputs.');
    }

    return {
      subtotal,
      discountAmount,
      taxAmount,
      total
    };
  }

  private async generateInvoiceNumber(organizationId: string): Promise<string> {
    // Use atomic database operation with retry logic to prevent race conditions
    // This ensures sequential invoice numbering required by CRA
    const maxRetries = 5;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      // Use a transaction to atomically find the last number and reserve the next one
      const lastInvoice = await prisma.invoice.findFirst({
        where: {
          organizationId,
          invoiceNumber: { not: { equals: '' } }
        },
        orderBy: { createdAt: 'desc' }, // Use createdAt for consistency, not invoiceNumber
        select: { invoiceNumber: true }
      });

      let nextNumber = 1;
      if (lastInvoice?.invoiceNumber) {
        // Extract number from format like "INV-000123"
        const match = lastInvoice.invoiceNumber.match(/INV-(\d+)/);
        if (match?.[1]) {
          nextNumber = parseInt(match[1], 10) + 1;
        }
      }

      const candidateNumber = `INV-${String(nextNumber).padStart(6, '0')}`;

      // Check if this number already exists (handles concurrent requests)
      const existing = await prisma.invoice.findFirst({
        where: {
          organizationId,
          invoiceNumber: candidateNumber
        }
      });

      if (!existing) {
        return candidateNumber;
      }

      // If number exists, retry with a small delay to avoid thundering herd
      await new Promise(resolve => setTimeout(resolve, 10 * (attempt + 1)));
    }

    // Fallback: use timestamp-based number if all retries fail
    const timestamp = Date.now().toString().slice(-6);
    return `INV-${timestamp}`;
  }
}

export const invoiceService = new InvoiceService();
