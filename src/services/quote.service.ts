import { Quote, QuoteItem, Invoice, InvoiceItem } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { QuoteStatus } from '../types/enums';
import { auditService } from './audit.service';
import { invoiceService } from './invoice.service';
import { appointmentService } from './appointment.service';
import { prisma } from '../config/database';

import { FinancialMath, calculateRatio, add, subtract, multiply, divide } from '../utils/financial';

export interface QuoteStats {
  total: number;
  draft: number;
  sent: number;
  accepted: number;
  rejected: number;
  expired: number;
  totalValue: number;
  acceptedValue: number;
  conversionRate: number;
}

interface CreateQuoteData {
  customerId: string;
  description: string;
  validUntil?: string;
  notes?: string;
  terms?: string;
  items: {
    productId?: string;
    serviceId?: string;
    description: string;
    quantity: number;
    unitPrice: number;
    discountPercent?: number;
    taxRate: number;
  }[];
}

interface UpdateQuoteData {
  description?: string;
  validUntil?: string;
  notes?: string;
  terms?: string;
  status?: QuoteStatus;
  items?: {
    id?: string;
    productId?: string;
    serviceId?: string;
    description: string;
    quantity: number;
    unitPrice: number;
    discountPercent?: number;
    taxRate: number;
  }[];
}

interface QuoteFilters {
  customerId?: string;
  status?: QuoteStatus;
  search?: string;
  validFrom?: string;
  validTo?: string;
  limit?: number;
  offset?: number;
}

export class QuoteService {
  async createQuote(
    data: CreateQuoteData,
    organizationId: string,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<Quote & { items: QuoteItem[]; customer?: unknown }> {
    // Verify customer exists and belongs to organization
    const customer = await prisma.customer.findFirst({
      where: {
        id: data.customerId,
        organizationId,
        deletedAt: null
      }
    });

    if (!customer) {
      throw new Error('Customer not found');
    }

    const quoteNumber = await this.generateQuoteNumber(organizationId);

    // Calculate totals from items using Decimal arithmetic
    let subtotal = new Decimal(0);
    let taxAmount = new Decimal(0);
    const itemCalculations = data.items.map(item => {
      const itemSubtotal = FinancialMath.multiply(item.quantity, item.unitPrice);
      const discountPercent = new Decimal(item.discountPercent || 0);
      const itemDiscountAmount = FinancialMath.multiply(itemSubtotal, FinancialMath.divide(discountPercent, 100));
      const itemAfterDiscount = FinancialMath.subtract(itemSubtotal, itemDiscountAmount);
      const itemTaxAmount = FinancialMath.multiply(itemAfterDiscount, FinancialMath.divide(item.taxRate, 100));
      const itemTotal = FinancialMath.add(itemAfterDiscount, itemTaxAmount);

      subtotal = FinancialMath.add(subtotal, itemSubtotal);
      taxAmount = FinancialMath.add(taxAmount, itemTaxAmount);

      return {
        subtotal: FinancialMath.toNumber(itemSubtotal),
        discountAmount: FinancialMath.toNumber(itemDiscountAmount),
        taxAmount: FinancialMath.toNumber(itemTaxAmount),
        total: FinancialMath.toNumber(itemTotal)
      };
    });

    const totalDiscountAmount = itemCalculations.reduce((sum, calc) => sum + calc.discountAmount, 0);
    const total = FinancialMath.subtract(FinancialMath.add(subtotal, taxAmount), totalDiscountAmount);

    const quote = await prisma.$transaction(async (tx) => {
      // Create quote
      const newQuote = await tx.quote.create({
        data: {
          organizationId,
          customerId: data.customerId,
          createdById: auditContext.userId,
          quoteNumber,
          description: data.description,
          status: QuoteStatus.DRAFT,
          validUntil: data.validUntil ? new Date(data.validUntil) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days default
          notes: data.notes,
          terms: data.terms,
          subtotal: FinancialMath.toNumber(subtotal),
          taxAmount: FinancialMath.toNumber(taxAmount),
          total: FinancialMath.toNumber(total)
        },
        include: {
          items: true,
          customer: {
            include: {
              person: true,
              business: true
            }
          }
        }
      });

      // Create quote items with calculations
      for (let i = 0; i < data.items.length; i++) {
        const itemData = data.items[i]!;
        const calc = itemCalculations[i]!;

        await tx.quoteItem.create({
          data: {
            quoteId: newQuote.id,
            productId: itemData.productId,
            serviceId: itemData.serviceId,
            description: itemData.description,
            quantity: itemData.quantity,
            unitPrice: itemData.unitPrice,
            discountPercent: itemData.discountPercent || 0,
            taxRate: itemData.taxRate,
            subtotal: calc.subtotal,
            discountAmount: calc.discountAmount,
            taxAmount: calc.taxAmount,
            total: calc.total,
            sortOrder: i + 1
          }
        });
      }

      // Fetch the complete quote with items
      const completeQuote = await tx.quote.findUnique({
        where: { id: newQuote.id },
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
          }
        }
      });

      return completeQuote!;
    });

    await auditService.logCreate(
      'Quote',
      quote.id,
      quote,
      {
        organizationId,
        userId: auditContext.userId,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent
      }
    );

    return quote;
  }

  async getQuote(
    id: string,
    organizationId: string,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<(Quote & { items: QuoteItem[]; customer?: unknown }) | null> {
    const quote = await prisma.quote.findFirst({
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
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    });

    if (quote) {
      await auditService.logView(
        'Quote',
        quote.id,
        {
          organizationId,
          userId: auditContext.userId,
          ipAddress: auditContext.ipAddress,
          userAgent: auditContext.userAgent
        }
      );
    }

    return quote;
  }

  async updateQuote(
    id: string,
    data: UpdateQuoteData,
    organizationId: string,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<Quote & { items: QuoteItem[] }> {
    const existingQuote = await prisma.quote.findFirst({
      where: {
        id,
        organizationId,
        deletedAt: null
      },
      include: {
        items: true
      }
    });

    if (!existingQuote) {
      throw new Error('Quote not found');
    }

    // Only allow updates if quote is in DRAFT or SENT status
    if (existingQuote.status !== QuoteStatus.DRAFT && existingQuote.status !== QuoteStatus.SENT) {
      throw new Error('Cannot update quote in current status');
    }

    let subtotal = existingQuote.subtotal;
    let taxAmount = existingQuote.taxAmount;
    let total = existingQuote.total;
    let itemCalculations: Array<{
      subtotal: number;
      discountAmount: number;
      taxAmount: number;
      total: number;
    }> = [];

    // Recalculate if items are provided
    if (data.items) {
      let subtotalDecimal = new Decimal(0);
      let taxAmountDecimal = new Decimal(0);
      itemCalculations = data.items.map(item => {
        const itemSubtotal = FinancialMath.multiply(item.quantity, item.unitPrice);
        const discountPercent = new Decimal(item.discountPercent || 0);
        const itemDiscountAmount = FinancialMath.multiply(itemSubtotal, FinancialMath.divide(discountPercent, 100));
        const itemAfterDiscount = FinancialMath.subtract(itemSubtotal, itemDiscountAmount);
        const itemTaxAmount = FinancialMath.multiply(itemAfterDiscount, FinancialMath.divide(item.taxRate, 100));
        const itemTotal = FinancialMath.add(itemAfterDiscount, itemTaxAmount);

        subtotalDecimal = FinancialMath.add(subtotalDecimal, itemSubtotal);
        taxAmountDecimal = FinancialMath.add(taxAmountDecimal, itemTaxAmount);

        return {
          subtotal: FinancialMath.toNumber(itemSubtotal),
          discountAmount: FinancialMath.toNumber(itemDiscountAmount),
          taxAmount: FinancialMath.toNumber(itemTaxAmount),
          total: FinancialMath.toNumber(itemTotal)
        };
      });

      const totalDiscountAmount = itemCalculations.reduce((sum, calc) => sum + calc.discountAmount, 0);
      subtotal = subtotalDecimal;
      taxAmount = taxAmountDecimal;
      total = FinancialMath.subtract(FinancialMath.add(subtotalDecimal, taxAmountDecimal), totalDiscountAmount);
    }

    const updatedQuote = await prisma.$transaction(async (tx) => {
      // Update quote
      await tx.quote.update({
        where: { id },
        data: {
          description: data.description,
          validUntil: data.validUntil ? new Date(data.validUntil) : undefined,
          notes: data.notes,
          terms: data.terms,
          status: data.status,
          subtotal: subtotal instanceof Decimal ? FinancialMath.toNumber(subtotal) : subtotal,
          taxAmount: taxAmount instanceof Decimal ? FinancialMath.toNumber(taxAmount) : taxAmount,
          total: total instanceof Decimal ? FinancialMath.toNumber(total) : total,
          updatedAt: new Date()
        }
      });

      // Update items if provided
      if (data.items) {
        // Delete existing items
        await tx.quoteItem.deleteMany({
          where: { quoteId: id }
        });

        // Create new items with calculations
        for (let i = 0; i < data.items.length; i++) {
          const itemData = data.items[i]!;
          const calc = itemCalculations[i]!;

          await tx.quoteItem.create({
            data: {
              quoteId: id,
              productId: itemData.productId,
              serviceId: itemData.serviceId,
              description: itemData.description,
              quantity: itemData.quantity,
              unitPrice: itemData.unitPrice,
              discountPercent: itemData.discountPercent || 0,
              taxRate: itemData.taxRate,
              subtotal: calc.subtotal,
              discountAmount: calc.discountAmount,
              taxAmount: calc.taxAmount,
              total: calc.total,
              sortOrder: i + 1
            }
          });
        }
      }

      // Fetch updated quote with items
      const completeQuote = await tx.quote.findUnique({
        where: { id },
        include: {
          items: {
            include: {
              product: true,
              service: true
            }
          }
        }
      });

      return completeQuote!;
    });

    await auditService.logUpdate(
      'Quote',
      id,
      existingQuote,
      updatedQuote,
      {
        organizationId,
        userId: auditContext.userId,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent
      }
    );

    return updatedQuote;
  }

  async listQuotes(
    filters: QuoteFilters,
    organizationId: string
  ): Promise<{ quotes: (Quote & { items?: QuoteItem[]; customer?: unknown })[], total: number }> {
    const where: Record<string, unknown> = {
      organizationId,
      deletedAt: null
    };

    if (filters.customerId) {
      where.customerId = filters.customerId;
    }

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.search) {
      where.OR = [
        { description: { contains: filters.search } },
        { quoteNumber: { contains: filters.search } },
        {
          customer: {
            person: {
              OR: [
                { firstName: { contains: filters.search } },
                { lastName: { contains: filters.search } }
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

    if (filters.validFrom || filters.validTo) {
      where.validUntil = {} as any;
      if (filters.validFrom) {
        (where.validUntil as any).gte = new Date(filters.validFrom);
      }
      if (filters.validTo) {
        (where.validUntil as any).lte = new Date(filters.validTo);
      }
    }

    const [quotes, total] = await Promise.all([
      prisma.quote.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: filters.limit || 50,
        skip: filters.offset || 0,
        include: {
          customer: {
            include: {
              person: true,
              business: true
            }
          },
          items: true,
          createdBy: {
            select: {
              firstName: true,
              lastName: true
            }
          }
        }
      }),
      prisma.quote.count({ where })
    ]);

    return { quotes, total };
  }

  async sendQuote(
    id: string,
    organizationId: string,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<Quote> {
    const quote = await prisma.quote.findFirst({
      where: {
        id,
        organizationId,
        deletedAt: null
      }
    });

    if (!quote) {
      throw new Error('Quote not found');
    }

    if (quote.status !== QuoteStatus.DRAFT) {
      throw new Error('Only draft quotes can be sent');
    }

    const updatedQuote = await prisma.quote.update({
      where: { id },
      data: {
        status: QuoteStatus.SENT,
        sentAt: new Date(),
        updatedAt: new Date()
      }
    });

    await auditService.logUpdate(
      'Quote',
      id,
      quote,
      updatedQuote,
      {
        organizationId,
        userId: auditContext.userId,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent
      }
    );

    // TODO: Send email notification to customer

    return updatedQuote;
  }

  async deleteQuote(
    id: string,
    organizationId: string,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<Quote> {
    const existingQuote = await prisma.quote.findFirst({
      where: {
        id,
        organizationId,
        deletedAt: null
      }
    });

    if (!existingQuote) {
      throw new Error('Quote not found');
    }

    // Only allow deletion of draft quotes
    if (existingQuote.status !== QuoteStatus.DRAFT) {
      throw new Error('Only draft quotes can be deleted');
    }

    const deletedQuote = await prisma.quote.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        updatedAt: new Date()
      }
    });

    await auditService.logDelete(
      'Quote',
      id,
      existingQuote,
      {
        organizationId,
        userId: auditContext.userId,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent
      }
    );

    return deletedQuote;
  }

  async duplicateQuote(
    id: string,
    organizationId: string,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<Quote & { items: QuoteItem[] }> {
    const originalQuote = await prisma.quote.findFirst({
      where: {
        id,
        organizationId,
        deletedAt: null
      },
      include: {
        items: true
      }
    });

    if (!originalQuote) {
      throw new Error('Quote not found');
    }

    const newQuoteNumber = await this.generateQuoteNumber(organizationId);

    const duplicatedQuote = await prisma.$transaction(async (tx) => {
      // Create new quote
      const newQuote = await tx.quote.create({
        data: {
          organizationId,
          customerId: originalQuote.customerId,
          createdById: auditContext.userId,
          quoteNumber: newQuoteNumber,
          description: originalQuote.description ? `${originalQuote.description} (Copy)` : 'Copy',
          status: QuoteStatus.DRAFT,
          validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
          notes: originalQuote.notes,
          terms: originalQuote.terms,
          subtotal: originalQuote.subtotal,
          taxAmount: originalQuote.taxAmount,
          total: originalQuote.total
        },
        include: {
          items: true
        }
      });

      // Duplicate items
      for (const item of originalQuote.items) {
        await tx.quoteItem.create({
          data: {
            quoteId: newQuote.id,
            productId: item.productId,
            serviceId: item.serviceId,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discountPercent: item.discountPercent,
            taxRate: item.taxRate,
            subtotal: item.subtotal,
            discountAmount: item.discountAmount,
            taxAmount: item.taxAmount,
            total: item.total,
            sortOrder: item.sortOrder
          }
        });
      }

      // Fetch complete duplicated quote
      const completeQuote = await tx.quote.findUnique({
        where: { id: newQuote.id },
        include: {
          items: true
        }
      });

      return completeQuote!;
    });

    await auditService.logCreate(
      'Quote',
      duplicatedQuote.id,
      { ...duplicatedQuote, originalQuoteId: id },
      {
        organizationId,
        userId: auditContext.userId,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent
      }
    );

    return duplicatedQuote;
  }

  async acceptQuote(
    id: string,
    organizationId: string,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string },
    acceptanceNotes?: string,
    autoGenerateInvoice: boolean = true
  ): Promise<{
    quote: Quote;
    invoice?: Invoice & { items: InvoiceItem[]; customer?: unknown; quote?: unknown } | null;
    suggestedAppointments?: unknown;
  }> {
    const quote = await prisma.quote.findFirst({
      where: {
        id,
        organizationId,
        deletedAt: null
      },
      include: {
        customer: true
      }
    });

    if (!quote) {
      throw new Error('Quote not found');
    }

    if (quote.status !== QuoteStatus.SENT && quote.status !== QuoteStatus.VIEWED) {
      throw new Error('Only sent or viewed quotes can be accepted');
    }

    if (quote.validUntil && quote.validUntil < new Date()) {
      throw new Error('Quote has expired and cannot be accepted');
    }

    const updatedQuote = await prisma.quote.update({
      where: { id },
      data: {
        status: QuoteStatus.ACCEPTED,
        acceptedAt: new Date(),
        notes: acceptanceNotes ? `${quote.notes || ''}\n\nAcceptance Notes: ${acceptanceNotes}`.trim() : quote.notes,
        updatedAt: new Date()
      }
    });

    await auditService.logUpdate(
      'Quote',
      id,
      quote,
      updatedQuote,
      {
        organizationId,
        userId: auditContext.userId,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent
      }
    );

    let generatedInvoice = null;
    let suggestedAppointments = null;

    // Automatically generate invoice when quote is accepted
    if (autoGenerateInvoice) {
      try {
        // Check if invoice already exists for this quote
        const existingInvoice = await prisma.invoice.findFirst({
          where: { quoteId: id, deletedAt: null }
        });

        if (!existingInvoice) {
          generatedInvoice = await invoiceService.createInvoiceFromQuote(
            id,
            organizationId,
            auditContext,
            {
              // Use customer payment terms or default to 15 days
              dueDate: new Date(Date.now() + ((quote.customer.paymentTerms || 15) * 24 * 60 * 60 * 1000)),
              // Default deposit requirement based on business rules (25-50%)
              depositRequired: Math.round(Number(quote.total) * 0.3 * 100) / 100, // 30% deposit
              terms: quote.terms || 'Payment due within terms. Work begins after deposit payment.',
              notes: `Invoice automatically generated from accepted quote ${updatedQuote.quoteNumber || id}${acceptanceNotes ? `\n\nCustomer Notes: ${acceptanceNotes}` : ''}`
            }
          );
        }
      } catch (error) {
        console.warn('Failed to auto-generate invoice for accepted quote:', error);
        // Don't fail the quote acceptance if invoice generation fails
        // Log this for manual follow-up
        await auditService.logCreate(
          'QuoteWorkflowError',
          id,
          {
            error: 'Failed to auto-generate invoice',
            message: error instanceof Error ? error.message : 'Unknown error',
            quoteId: id,
            organizationId
          },
          {
            organizationId,
            userId: auditContext.userId,
            ipAddress: auditContext.ipAddress,
            userAgent: auditContext.userAgent
          }
        );
      }
    }

    // Suggest available appointment times for consultation
    try {
      suggestedAppointments = await appointmentService.suggestAppointmentAfterQuoteAcceptance(
        organizationId,
        quote.customerId,
        id
      );
    } catch (error) {
      console.warn('Failed to suggest appointment times:', error);
      // Don't fail the quote acceptance if appointment suggestion fails
      await auditService.logCreate(
        'QuoteWorkflowError',
        id,
        {
          error: 'Failed to suggest appointment times',
          message: error instanceof Error ? error.message : 'Unknown error',
          quoteId: id,
          organizationId
        },
        {
          organizationId,
          userId: auditContext.userId,
          ipAddress: auditContext.ipAddress,
          userAgent: auditContext.userAgent
        }
      );
    }

    return {
      quote: updatedQuote,
      invoice: generatedInvoice,
      suggestedAppointments
    };
  }

  async rejectQuote(
    id: string,
    organizationId: string,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string },
    rejectionReason?: string
  ): Promise<Quote> {
    const quote = await prisma.quote.findFirst({
      where: {
        id,
        organizationId,
        deletedAt: null
      }
    });

    if (!quote) {
      throw new Error('Quote not found');
    }

    if (quote.status !== QuoteStatus.SENT && quote.status !== QuoteStatus.VIEWED) {
      throw new Error('Only sent or viewed quotes can be rejected');
    }

    const updatedQuote = await prisma.quote.update({
      where: { id },
      data: {
        status: QuoteStatus.REJECTED,
        rejectedAt: new Date(),
        notes: rejectionReason ? `${quote.notes || ''}\n\nRejection Reason: ${rejectionReason}`.trim() : quote.notes,
        updatedAt: new Date()
      }
    });

    await auditService.logUpdate(
      'Quote',
      id,
      quote,
      updatedQuote,
      {
        organizationId,
        userId: auditContext.userId,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent
      }
    );

    return updatedQuote;
  }

  async markQuoteAsViewed(
    id: string,
    organizationId: string,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<Quote> {
    const quote = await prisma.quote.findFirst({
      where: {
        id,
        organizationId,
        deletedAt: null
      }
    });

    if (!quote) {
      throw new Error('Quote not found');
    }

    if (quote.status !== QuoteStatus.SENT) {
      return quote; // Already viewed or in different status
    }

    const updatedQuote = await prisma.quote.update({
      where: { id },
      data: {
        status: QuoteStatus.VIEWED,
        viewedAt: new Date(),
        updatedAt: new Date()
      }
    });

    await auditService.logUpdate(
      'Quote',
      id,
      quote,
      updatedQuote,
      {
        organizationId,
        userId: auditContext.userId,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent
      }
    );

    return updatedQuote;
  }

  private async generateQuoteNumber(organizationId: string): Promise<string> {
    const count = await prisma.quote.count({
      where: { organizationId }
    });
    return `QUO-${String(count + 1).padStart(6, '0')}`;
  }

  async getQuoteStats(
    organizationId: string,
    customerId?: string
  ): Promise<QuoteStats> {
    const where: Record<string, unknown> = { organizationId, deletedAt: null };
    if (customerId) {
      where.customerId = customerId;
    }

    const [
      totalQuotes,
      draftQuotes,
      sentQuotes,
      acceptedQuotes,
      rejectedQuotes,
      expiredQuotes,
      totalValue,
      acceptedValue
    ] = await Promise.all([
      prisma.quote.count({ where }),
      prisma.quote.count({ where: { ...where, status: QuoteStatus.DRAFT } }),
      prisma.quote.count({ where: { ...where, status: QuoteStatus.SENT } }),
      prisma.quote.count({ where: { ...where, status: QuoteStatus.ACCEPTED } }),
      prisma.quote.count({ where: { ...where, status: QuoteStatus.REJECTED } }),
      prisma.quote.count({ where: { ...where, status: QuoteStatus.EXPIRED } }),
      prisma.quote.aggregate({
        where,
        _sum: { total: true }
      }),
      prisma.quote.aggregate({
        where: { ...where, status: QuoteStatus.ACCEPTED },
        _sum: { total: true }
      })
    ]);

    return {
      total: totalQuotes,
      draft: draftQuotes,
      sent: sentQuotes,
      accepted: acceptedQuotes,
      rejected: rejectedQuotes,
      expired: expiredQuotes,
      totalValue: totalValue._sum.total ? FinancialMath.toNumber(totalValue._sum.total) : 0,
      acceptedValue: acceptedValue._sum.total ? FinancialMath.toNumber(acceptedValue._sum.total) : 0,
      conversionRate: sentQuotes > 0 ? FinancialMath.toNumber(calculateRatio(acceptedQuotes, sentQuotes)) : 0
    };
  }

  /**
   * Convert a quote to an invoice
   */
  async convertToInvoice(
    quoteId: string,
    organizationId: string,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string },
    options?: {
      dueDate?: Date;
      depositRequired?: number;
      terms?: string;
      notes?: string;
    }
  ): Promise<Invoice & { items: InvoiceItem[]; customer?: unknown; quote?: unknown }> {
    return invoiceService.createInvoiceFromQuote(quoteId, organizationId, auditContext, options);
  }
}

export const quoteService = new QuoteService();