// @ts-nocheck
import { PrismaClient, Invoice, InvoiceItem } from '@prisma/client';
import { InvoiceStatus } from '../types/enums';
import { auditService } from './audit.service';

const prisma = new PrismaClient();

interface CreateInvoiceData {
  customerId: string;
  quoteId?: string;
  issueDate?: Date;
  dueDate: Date;
  currency?: string;
  exchangeRate?: number;
  depositRequired: number;
  terms?: string;
  notes?: string;
  items: CreateInvoiceItemData[];
}

interface CreateInvoiceItemData {
  productId?: string;
  serviceId?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
  taxRate: number;
}

interface UpdateInvoiceData {
  dueDate?: Date;
  currency?: string;
  exchangeRate?: number;
  depositRequired?: number;
  terms?: string;
  notes?: string;
  items?: CreateInvoiceItemData[];
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
  async createInvoice(
    data: CreateInvoiceData,
    organizationId: string,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<Invoice & { items: InvoiceItem[]; customer?: any; quote?: any }> {
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
        include: { items: true }
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
    const { subtotal, taxAmount, total } = this.calculateTotals(data.items);

    if (data.depositRequired < 0) {
      throw new Error('Deposit required cannot be negative');
    }

    if (data.depositRequired > total) {
      throw new Error('Deposit required cannot exceed total invoice amount');
    }

    const invoiceNumber = await this.generateInvoiceNumber(organizationId);
    const balance = total - (data.depositRequired || 0);

    const invoice = await prisma.$transaction(async (tx) => {
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
          taxAmount,
          total,
          depositRequired: data.depositRequired,
          amountPaid: 0,
          balance,
          terms: data.terms,
          notes: data.notes
        },
        include: {
          items: true,
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
      for (let i = 0; i < data.items.length; i++) {
        const item = data.items[i];
        if (!item) continue;

        const itemCalculations = this.calculateItemTotals(item);

        await tx.invoiceItem.create({
          data: {
            invoiceId: newInvoice.id,
            productId: item.productId || null,
            serviceId: item.serviceId || null,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discountPercent: item.discountPercent || 0,
            taxRate: item.taxRate,
            subtotal: itemCalculations.subtotal,
            discountAmount: itemCalculations.discountAmount,
            taxAmount: itemCalculations.taxAmount,
            total: itemCalculations.total,
            sortOrder: i + 1
          }
        });
      }

      // Fetch complete invoice with items
      const completeInvoice = await tx.invoice.findUnique({
        where: { id: newInvoice.id },
        include: {
          items: true,
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
  ): Promise<Invoice & { items: InvoiceItem[]; customer?: any; quote?: any }> {
    // Get the quote with items
    const quote = await prisma.quote.findFirst({
      where: {
        id: quoteId,
        organizationId,
        deletedAt: null
      },
      include: {
        items: true,
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
    const invoiceItems: CreateInvoiceItemData[] = quote.items.map(item => ({
      productId: item.productId || undefined,
      serviceId: item.serviceId || undefined,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discountPercent: item.discountPercent,
      taxRate: item.taxRate
    }));

    // Calculate default deposit (30% of total)
    const defaultDepositPercentage = 0.3;
    const defaultDeposit = Math.round(quote.total * defaultDepositPercentage * 100) / 100;

    // Get customer payment terms for due date
    const paymentTerms = quote.customer.paymentTerms || 15;
    const defaultDueDate = new Date();
    defaultDueDate.setDate(defaultDueDate.getDate() + paymentTerms);

    const invoiceData: CreateInvoiceData = {
      customerId: quote.customerId,
      quoteId: quote.id,
      dueDate: options?.dueDate || defaultDueDate,
      depositRequired: options?.depositRequired ?? defaultDeposit,
      terms: options?.terms || quote.terms || undefined,
      notes: options?.notes || quote.notes || undefined,
      items: invoiceItems
    };

    return this.createInvoice(invoiceData, organizationId, auditContext);
  }

  async getInvoice(
    id: string,
    organizationId: string,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<(Invoice & { items: InvoiceItem[]; customer?: any; quote?: any }) | null> {
    const invoice = await prisma.invoice.findFirst({
      where: {
        id,
        organizationId,
        deletedAt: null
      },
      include: {
        items: {
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
  ): Promise<Invoice & { items: InvoiceItem[] }> {
    const existingInvoice = await prisma.invoice.findFirst({
      where: {
        id,
        organizationId,
        deletedAt: null
      },
      include: { items: true }
    });

    if (!existingInvoice) {
      throw new Error('Invoice not found');
    }

    if (existingInvoice.status !== InvoiceStatus.DRAFT) {
      throw new Error('Only draft invoices can be updated');
    }

    let updatedData: any = {};

    // Update basic fields
    if (data.dueDate !== undefined) updatedData.dueDate = data.dueDate;
    if (data.currency !== undefined) updatedData.currency = data.currency;
    if (data.exchangeRate !== undefined) updatedData.exchangeRate = data.exchangeRate;
    if (data.terms !== undefined) updatedData.terms = data.terms;
    if (data.notes !== undefined) updatedData.notes = data.notes;

    // If items are being updated, recalculate totals
    if (data.items) {
      const { subtotal, taxAmount, total } = this.calculateTotals(data.items);

      updatedData.subtotal = subtotal;
      updatedData.taxAmount = taxAmount;
      updatedData.total = total;

      // Validate deposit requirement
      if (data.depositRequired !== undefined) {
        if (data.depositRequired < 0) {
          throw new Error('Deposit required cannot be negative');
        }
        if (data.depositRequired > total) {
          throw new Error('Deposit required cannot exceed total invoice amount');
        }
        updatedData.depositRequired = data.depositRequired;
        updatedData.balance = total - data.depositRequired;
      } else {
        updatedData.balance = total - existingInvoice.depositRequired;
      }
    } else if (data.depositRequired !== undefined) {
      // Only deposit is being updated
      if (data.depositRequired < 0) {
        throw new Error('Deposit required cannot be negative');
      }
      if (data.depositRequired > existingInvoice.total) {
        throw new Error('Deposit required cannot exceed total invoice amount');
      }
      updatedData.depositRequired = data.depositRequired;
      updatedData.balance = existingInvoice.total - data.depositRequired;
    }

    updatedData.updatedAt = new Date();

    const updatedInvoice = await prisma.$transaction(async (tx) => {
      // Update invoice
      await tx.invoice.update({
        where: { id },
        data: updatedData
      });

      // If items are being updated, replace them
      if (data.items) {
        // Delete existing items
        await tx.invoiceItem.deleteMany({
          where: { invoiceId: id }
        });

        // Create new items
        for (let i = 0; i < data.items.length; i++) {
          const item = data.items[i];
          if (!item) continue;

          const itemCalculations = this.calculateItemTotals(item);

          await tx.invoiceItem.create({
            data: {
              invoiceId: id,
              productId: item.productId || null,
              serviceId: item.serviceId || null,
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              discountPercent: item.discountPercent || 0,
              taxRate: item.taxRate,
              subtotal: itemCalculations.subtotal,
              discountAmount: itemCalculations.discountAmount,
              taxAmount: itemCalculations.taxAmount,
              total: itemCalculations.total,
              sortOrder: i + 1
            }
          });
        }
      }

      // Fetch complete updated invoice
      return await tx.invoice.findUnique({
        where: { id },
        include: { items: true }
      });
    });

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
  ): Promise<{ invoices: (Invoice & { items: InvoiceItem[]; customer?: any })[]; total: number }> {
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
          items: true,
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
        updatedAt: new Date()
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

    // TODO: Send email notification to customer

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
        updatedAt: new Date()
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

    if (invoice.amountPaid > 0) {
      throw new Error('Cannot cancel invoice with payments. Please process a refund instead.');
    }

    const updatedInvoice = await prisma.invoice.update({
      where: { id },
      data: {
        status: InvoiceStatus.CANCELLED,
        notes: cancellationReason ? `${invoice.notes || ''}\n\nCancellation Reason: ${cancellationReason}`.trim() : invoice.notes,
        updatedAt: new Date()
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

    if (invoice.status === InvoiceStatus.CANCELLED) {
      throw new Error('Cannot record payment for cancelled invoice');
    }

    if (paymentAmount <= 0) {
      throw new Error('Payment amount must be positive');
    }

    const newAmountPaid = invoice.amountPaid + paymentAmount;
    if (newAmountPaid > invoice.total) {
      throw new Error('Payment amount exceeds remaining balance');
    }

    const newBalance = invoice.total - newAmountPaid;
    let newStatus = invoice.status;

    if (newBalance === 0) {
      newStatus = InvoiceStatus.PAID;
    } else if (newAmountPaid > 0) {
      newStatus = InvoiceStatus.PARTIALLY_PAID;
    }

    const updatedInvoice = await prisma.invoice.update({
      where: { id },
      data: {
        amountPaid: newAmountPaid,
        balance: newBalance,
        status: newStatus,
        paidAt: newStatus === InvoiceStatus.PAID ? new Date() : invoice.paidAt,
        updatedAt: new Date()
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

  async getInvoiceStats(
    organizationId: string,
    customerId?: string
  ): Promise<any> {
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
      totalValue: totalValue._sum.total || 0,
      paidValue: paidValue._sum.total || 0,
      outstandingValue: outstandingValue._sum.balance || 0,
      overdueValue: overdueValue._sum.balance || 0,
      paymentRate: totalInvoices > 0 ? (paidInvoices / totalInvoices) * 100 : 0,
      overdueRate: totalInvoices > 0 ? (overdueInvoices / totalInvoices) * 100 : 0
    };
  }

  private calculateTotals(items: CreateInvoiceItemData[]): { subtotal: number; taxAmount: number; total: number } {
    let subtotal = 0;
    let taxAmount = 0;

    for (const item of items) {
      const itemCalculations = this.calculateItemTotals(item);
      subtotal += itemCalculations.subtotal;
      taxAmount += itemCalculations.taxAmount;
    }

    const total = subtotal + taxAmount;

    return {
      subtotal: Math.round(subtotal * 100) / 100,
      taxAmount: Math.round(taxAmount * 100) / 100,
      total: Math.round(total * 100) / 100
    };
  }

  private calculateItemTotals(item: CreateInvoiceItemData): {
    subtotal: number;
    discountAmount: number;
    taxAmount: number;
    total: number;
  } {
    const lineTotal = item.quantity * item.unitPrice;
    const discountPercent = item.discountPercent || 0;
    const discountAmount = (lineTotal * discountPercent) / 100;
    const subtotal = lineTotal - discountAmount;
    const taxAmount = (subtotal * item.taxRate) / 100;
    const total = subtotal + taxAmount;

    return {
      subtotal: Math.round(subtotal * 100) / 100,
      discountAmount: Math.round(discountAmount * 100) / 100,
      taxAmount: Math.round(taxAmount * 100) / 100,
      total: Math.round(total * 100) / 100
    };
  }

  private async generateInvoiceNumber(organizationId: string): Promise<string> {
    const count = await prisma.invoice.count({
      where: { organizationId }
    });
    return `INV-${String(count + 1).padStart(6, '0')}`;
  }
}

export const invoiceService = new InvoiceService();