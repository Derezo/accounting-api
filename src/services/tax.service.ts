import { PrismaClient, TaxRate, TaxRecord, StateProvince, Prisma } from '@prisma/client';
import { AuditService } from './audit.service';
import { FinancialMath } from '../utils/financial';

export interface TaxCalculationRequest {
  organizationId: string;
  items: TaxableItem[];
  customerTaxExempt?: boolean;
  jurisdiction: TaxJurisdiction;
  calculationDate?: Date;
}

export interface TaxableItem {
  id: string;
  description: string;
  amount: number;
  quantity: number;
  taxable: boolean;
  taxCategory?: string;
  discountAmount?: number;
}

export interface TaxJurisdiction {
  countryCode: string;
  stateProvinceCode?: string;
  municipalityCode?: string;
  postalCode?: string;
}

export interface TaxCalculationResult {
  subtotal: number;
  totalDiscount: number;
  taxableAmount: number;
  taxes: TaxBreakdown[];
  totalTax: number;
  grandTotal: number;
  calculationDate: Date;
  jurisdiction: TaxJurisdiction;
  exemptionApplied: boolean;
}

export interface TaxBreakdown {
  taxRateId: string;
  taxCode: string;
  taxName: string;
  taxType: string;
  rate: number;
  taxableAmount: number;
  taxAmount: number;
  compoundingBase?: number;
  isCompound: boolean;
}

export interface TaxRateConfiguration {
  id?: string;
  code: string;
  name: string;
  rate: number;
  taxType: 'GST' | 'HST' | 'PST' | 'QST' | 'MUNICIPAL' | 'FEDERAL' | 'PROVINCIAL';
  countryCode: string;
  stateProvinceCode?: string;
  effectiveDate: Date;
  expiryDate?: Date;
  isCompound: boolean;
  compoundOrder?: number;
  description?: string;
}

export interface TaxRemittanceCalculation {
  organizationId: string;
  period: {
    startDate: Date;
    endDate: Date;
    frequency: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';
  };
  taxType: string;
  taxesCollected: number;
  taxesPaid: number;
  netTaxOwed: number;
  inputTaxCredits: number;
  adjustments: number;
  penalties: number;
  interest: number;
  totalRemittance: number;
  dueDate: Date;
  transactions: TaxTransactionSummary[];
}

export interface TaxTransactionSummary {
  transactionId: string;
  date: Date;
  description: string;
  taxableAmount: number;
  taxAmount: number;
  taxType: string;
}

export class TaxService {
  private prisma: PrismaClient;
  private auditService: AuditService;

  constructor(prisma: PrismaClient, auditService: AuditService) {
    this.prisma = prisma;
    this.auditService = auditService;
  }

  /**
   * Calculate taxes for a transaction
   */
  async calculateTax(request: TaxCalculationRequest): Promise<TaxCalculationResult> {
    const { organizationId, items, customerTaxExempt = false, jurisdiction, calculationDate = new Date() } = request;

    // Calculate subtotal and discounts
    const subtotal = items.reduce((sum, item) => sum + (item.amount * item.quantity), 0);
    const totalDiscount = items.reduce((sum, item) => sum + (item.discountAmount || 0), 0);

    // Apply customer tax exemption
    if (customerTaxExempt) {
      return {
        subtotal,
        totalDiscount,
        taxableAmount: subtotal - totalDiscount,
        taxes: [],
        totalTax: 0,
        grandTotal: subtotal - totalDiscount,
        calculationDate,
        jurisdiction,
        exemptionApplied: true
      };
    }

    // Get applicable tax rates for jurisdiction
    const applicableTaxRates = await this.getApplicableTaxRates(jurisdiction, calculationDate);

    if (applicableTaxRates.length === 0) {
      throw new Error(`No tax rates found for jurisdiction: ${JSON.stringify(jurisdiction)}`);
    }

    // Calculate taxable amount (exclude non-taxable items)
    const taxableItems = items.filter(item => item.taxable);
    const taxableAmount = taxableItems.reduce(
      (sum, item) => sum + ((item.amount * item.quantity) - (item.discountAmount || 0)), 0
    );

    // Calculate taxes (handle compound taxes properly)
    const taxes = await this.calculateTaxBreakdown(taxableAmount, applicableTaxRates);
    const totalTax = taxes.reduce((sum, tax) => sum + tax.taxAmount, 0);

    return {
      subtotal,
      totalDiscount,
      taxableAmount,
      taxes,
      totalTax,
      grandTotal: subtotal - totalDiscount + totalTax,
      calculationDate,
      jurisdiction,
      exemptionApplied: false
    };
  }

  /**
   * Create or update tax rate configuration
   */
  async configureTaxRate(config: TaxRateConfiguration, userId: string): Promise<TaxRate> {
    const { id, ...taxRateData } = config;

    try {
      let taxRate: TaxRate;

      if (id) {
        // Update existing tax rate
        taxRate = await this.prisma.taxRate.update({
          where: { id },
          data: {
            ...taxRateData,
            rate: new Prisma.Decimal(taxRateData.rate)
          }
        });

        await this.auditService.logAction({
          action: 'UPDATE',
          entityType: 'TAX_RATE',
          entityId: taxRate.id,
          changes: { taxCode: taxRate.code, newRate: taxRateData.rate },
          context: {
            organizationId: 'SYSTEM', // Tax rates are system-wide
            userId
          }
        });
      } else {
        // Create new tax rate
        taxRate = await this.prisma.taxRate.create({
          data: {
            ...taxRateData,
            rate: new Prisma.Decimal(taxRateData.rate)
          }
        });

        await this.auditService.logAction({
          action: 'CREATE',
          entityType: 'TAX_RATE',
          entityId: taxRate.id,
          changes: { taxCode: taxRate.code, rate: taxRateData.rate },
          context: {
            organizationId: 'SYSTEM',
            userId
          }
        });
      }

      return taxRate;
    } catch (error) {
      throw new Error(`Failed to configure tax rate: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Calculate tax remittance for a period
   */
  async calculateTaxRemittance(
    organizationId: string,
    taxType: string,
    startDate: Date,
    endDate: Date,
    frequency: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL'
  ): Promise<TaxRemittanceCalculation> {
    // Get all invoices with tax for the period
    const invoices = await this.prisma.invoice.findMany({
      where: {
        organizationId,
        issueDate: {
          gte: startDate,
          lte: endDate
        },
        status: { in: ['SENT', 'PAID', 'PARTIAL_PAID'] },
        deletedAt: null
      },
      include: {
        items: true
      }
    });

    // Get all expenses with tax for the period
    const expenses = await this.prisma.expense.findMany({
      where: {
        organizationId,
        expenseDate: {
          gte: startDate,
          lte: endDate
        },
        deletedAt: null
      }
    });

    // Calculate taxes collected (output tax)
    let taxesCollected = 0;
    const salesTransactions: TaxTransactionSummary[] = [];

    for (const invoice of invoices) {
      const taxAmount = Number(invoice.taxAmount);
      if (taxAmount > 0) {
        taxesCollected += taxAmount;
        salesTransactions.push({
          transactionId: invoice.id,
          date: invoice.issueDate,
          description: `Invoice ${invoice.invoiceNumber}`,
          taxableAmount: Number(invoice.subtotal),
          taxAmount,
          taxType: 'OUTPUT'
        });
      }
    }

    // Calculate taxes paid (input tax credits)
    let taxesPaid = 0;
    const purchaseTransactions: TaxTransactionSummary[] = [];

    for (const expense of expenses) {
      const taxAmount = Number(expense.taxAmount);
      if (taxAmount > 0) {
        taxesPaid += taxAmount;
        purchaseTransactions.push({
          transactionId: expense.id,
          date: expense.expenseDate,
          description: expense.description,
          taxableAmount: Number(expense.amount),
          taxAmount,
          taxType: 'INPUT'
        });
      }
    }

    // Calculate net tax owed
    const inputTaxCredits = taxesPaid;
    const netTaxOwed = Math.max(0, taxesCollected - inputTaxCredits);

    // Calculate due date based on frequency
    const dueDate = this.calculateTaxDueDate(endDate, frequency);

    // Check for previous adjustments, penalties, interest
    const adjustments = 0; // Would implement based on business rules
    const penalties = 0;   // Would implement based on business rules
    const interest = 0;    // Would implement based on business rules

    const totalRemittance = netTaxOwed + adjustments + penalties + interest;

    return {
      organizationId,
      period: {
        startDate,
        endDate,
        frequency
      },
      taxType,
      taxesCollected,
      taxesPaid,
      netTaxOwed,
      inputTaxCredits,
      adjustments,
      penalties,
      interest,
      totalRemittance,
      dueDate,
      transactions: [...salesTransactions, ...purchaseTransactions]
    };
  }

  /**
   * Get current tax rates for jurisdiction
   */
  async getTaxRatesForJurisdiction(jurisdiction: TaxJurisdiction): Promise<TaxRate[]> {
    const currentDate = new Date();
    return await this.getApplicableTaxRates(jurisdiction, currentDate);
  }

  /**
   * Record tax payment/remittance
   */
  async recordTaxPayment(
    organizationId: string,
    taxType: string,
    taxPeriod: string,
    taxYear: number,
    amountPaid: number,
    paymentDate: Date,
    paymentReference: string,
    userId: string
  ): Promise<TaxRecord> {
    try {
      // Find existing tax record or create new one
      let taxRecord = await this.prisma.taxRecord.findFirst({
        where: {
          organizationId,
          taxType,
          taxPeriod,
          taxYear
        }
      });

      if (taxRecord) {
        // Update existing record
        const newTaxPaid = Number(taxRecord.taxPaid) + amountPaid;
        const newTaxBalance = Number(taxRecord.taxOwed) - newTaxPaid;

        taxRecord = await this.prisma.taxRecord.update({
          where: { id: taxRecord.id },
          data: {
            taxPaid: new Prisma.Decimal(newTaxPaid),
            taxBalance: new Prisma.Decimal(newTaxBalance),
            status: newTaxBalance <= 0.01 ? 'PAID' : 'PARTIAL_PAID'
          }
        });
      } else {
        // Create new tax record
        taxRecord = await this.prisma.taxRecord.create({
          data: {
            organizationId,
            taxYear,
            taxPeriod,
            jurisdiction: 'FEDERAL', // Would determine based on tax type
            taxType,
            grossIncome: new Prisma.Decimal(0),
            taxableIncome: new Prisma.Decimal(0),
            taxOwed: new Prisma.Decimal(amountPaid),
            taxPaid: new Prisma.Decimal(amountPaid),
            taxBalance: new Prisma.Decimal(0),
            dueDate: new Date(),
            status: 'PAID'
          }
        });
      }

      // Log tax payment
      await this.auditService.logAction({
        action: 'CREATE',
        entityType: 'TAX_PAYMENT',
        entityId: taxRecord.id,
        changes: {
          taxType,
          taxPeriod,
          taxYear,
          amountPaid,
          paymentDate,
          paymentReference
        },
        context: {
          organizationId,
          userId
        }
      });

      return taxRecord;
    } catch (error) {
      throw new Error(`Failed to record tax payment: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Private helper methods

  private async getApplicableTaxRates(jurisdiction: TaxJurisdiction, date: Date): Promise<TaxRate[]> {
    const { countryCode, stateProvinceCode } = jurisdiction;

    const whereClause: any = {
      countryCode,
      effectiveDate: { lte: date },
      OR: [
        { expiryDate: null },
        { expiryDate: { gte: date } }
      ]
    };

    // Add state/province filter if specified (use stateProvince, not stateProvinceCode)
    if (stateProvinceCode) {
      whereClause.stateProvince = stateProvinceCode;
    }

    return await this.prisma.taxRate.findMany({
      where: whereClause,
      orderBy: [
        { code: 'asc' }
      ]
    });
  }

  private async calculateTaxBreakdown(
    taxableAmount: number,
    taxRates: TaxRate[]
  ): Promise<TaxBreakdown[]> {
    const taxes: TaxBreakdown[] = [];
    let compoundingBase = taxableAmount;

    // Sort tax rates by code (since the model doesn't have compound ordering)
    const sortedRates = taxRates.sort((a, b) => a.code.localeCompare(b.code));

    for (const taxRate of sortedRates) {
      // Determine if this is a compound tax based on tax code (QST is compound in Quebec)
      const isCompound = taxRate.code === 'QST' || taxRate.code.includes('QST');
      const baseAmount = isCompound ? compoundingBase : taxableAmount;
      const taxAmount = FinancialMath.toNumber(FinancialMath.calculateTax(baseAmount, Number(taxRate.rate)));

      // Determine tax type from code
      const taxType = taxRate.code.includes('HST') ? 'HST' :
                     taxRate.code.includes('PST') ? 'PST' :
                     taxRate.code.includes('QST') ? 'QST' :
                     taxRate.code.includes('GST') ? 'GST' : 'OTHER';

      taxes.push({
        taxRateId: taxRate.id,
        taxCode: taxRate.code,
        taxName: taxRate.name,
        taxType,
        rate: Number(taxRate.rate),
        taxableAmount: baseAmount,
        taxAmount,
        compoundingBase: isCompound ? compoundingBase : undefined,
        isCompound
      });

      // Update compounding base for subsequent compound taxes
      if (isCompound) {
        compoundingBase += taxAmount;
      }
    }

    return taxes;
  }

  private calculateTaxDueDate(periodEndDate: Date, frequency: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL'): Date {
    const dueDate = new Date(periodEndDate);

    switch (frequency) {
      case 'MONTHLY':
        dueDate.setMonth(dueDate.getMonth() + 1);
        dueDate.setDate(15); // Due 15th of following month
        break;
      case 'QUARTERLY':
        dueDate.setMonth(dueDate.getMonth() + 2);
        dueDate.setDate(15); // Due 15th of second month following quarter end
        break;
      case 'ANNUAL':
        dueDate.setMonth(5); // June
        dueDate.setDate(15); // Due June 15th following year end
        break;
    }

    return dueDate;
  }

  /**
   * Initialize standard Canadian tax rates
   */
  async initializeCanadianTaxRates(userId: string): Promise<TaxRate[]> {
    const canadianTaxRates: TaxRateConfiguration[] = [
      // Federal GST
      {
        code: 'GST',
        name: 'Goods and Services Tax',
        rate: 5.0,
        taxType: 'GST',
        countryCode: 'CA',
        effectiveDate: new Date('2008-01-01'),
        isCompound: false,
        description: 'Federal Goods and Services Tax'
      },

      // Provincial HST rates
      {
        code: 'HST_ON',
        name: 'Harmonized Sales Tax - Ontario',
        rate: 13.0,
        taxType: 'HST',
        countryCode: 'CA',
        stateProvinceCode: 'ON',
        effectiveDate: new Date('2010-07-01'),
        isCompound: false,
        description: 'Ontario Harmonized Sales Tax (GST + PST combined)'
      },

      {
        code: 'HST_BC',
        name: 'Harmonized Sales Tax - British Columbia',
        rate: 12.0,
        taxType: 'HST',
        countryCode: 'CA',
        stateProvinceCode: 'BC',
        effectiveDate: new Date('2010-07-01'),
        expiryDate: new Date('2013-03-31'),
        isCompound: false,
        description: 'British Columbia Harmonized Sales Tax (reverted to GST+PST)'
      },

      // Provincial PST rates (for provinces not using HST)
      {
        code: 'PST_BC',
        name: 'Provincial Sales Tax - British Columbia',
        rate: 7.0,
        taxType: 'PST',
        countryCode: 'CA',
        stateProvinceCode: 'BC',
        effectiveDate: new Date('2013-04-01'),
        isCompound: false,
        description: 'British Columbia Provincial Sales Tax'
      },

      {
        code: 'PST_SK',
        name: 'Provincial Sales Tax - Saskatchewan',
        rate: 6.0,
        taxType: 'PST',
        countryCode: 'CA',
        stateProvinceCode: 'SK',
        effectiveDate: new Date('2017-04-01'),
        isCompound: false,
        description: 'Saskatchewan Provincial Sales Tax'
      },

      {
        code: 'PST_MB',
        name: 'Retail Sales Tax - Manitoba',
        rate: 7.0,
        taxType: 'PST',
        countryCode: 'CA',
        stateProvinceCode: 'MB',
        effectiveDate: new Date('2019-07-01'),
        isCompound: false,
        description: 'Manitoba Retail Sales Tax'
      },

      // Quebec Sales Tax (compound tax)
      {
        code: 'QST',
        name: 'Quebec Sales Tax',
        rate: 9.975,
        taxType: 'QST',
        countryCode: 'CA',
        stateProvinceCode: 'QC',
        effectiveDate: new Date('2013-01-01'),
        isCompound: true,
        compoundOrder: 1,
        description: 'Quebec Sales Tax (applied on GST + selling price)'
      }
    ];

    const createdRates: TaxRate[] = [];

    for (const config of canadianTaxRates) {
      try {
        const taxRate = await this.configureTaxRate(config, userId);
        createdRates.push(taxRate);
      } catch (error) {
        console.warn(`Failed to create tax rate ${config.code}:`, error);
      }
    }

    return createdRates;
  }
}