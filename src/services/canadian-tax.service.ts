import { PrismaClient } from '@prisma/client';
import { TaxService, TaxCalculationRequest, TaxCalculationResult, TaxJurisdiction } from './tax.service';
import { FinancialMath, calculateTax, calculateCompoundTax, toCurrency, add } from '../utils/financial';

export interface CanadianTaxContext {
  province: CanadianProvince;
  businessRegistration: {
    gstNumber?: string;
    hstNumber?: string;
    pstNumber?: string;
    qstNumber?: string;
  };
  isSmallSupplier: boolean; // Under $30,000 threshold
  isQuickMethod: boolean;   // GST Quick Method election
  fiscalYearEnd: Date;
}

export type CanadianProvince =
  | 'AB' | 'BC' | 'MB' | 'NB' | 'NL' | 'NS' | 'NT' | 'NU' | 'ON' | 'PE' | 'QC' | 'SK' | 'YT';

export interface HST_GST_Calculation {
  gstRate: number;
  pstRate: number;
  hstRate?: number;
  isHSTProvince: boolean;
  gstAmount: number;
  pstAmount: number;
  hstAmount: number;
  totalTax: number;
  breakdown: {
    federalPortion: number;
    provincialPortion: number;
  };
}

export interface CanadianTaxExemption {
  type: 'ZERO_RATED' | 'EXEMPT' | 'INPUT_TAX_CREDIT';
  description: string;
  code: string;
  category: 'BASIC_GROCERIES' | 'MEDICAL' | 'EDUCATIONAL' | 'FINANCIAL' | 'RESIDENTIAL_RENT' | 'EXPORTS';
}

export interface ITCCalculation {
  eligibleAmount: number;
  itcRate: number;
  itcAmount: number;
  restrictions: string[];
  supportingDocuments: string[];
}

export interface GST_HST_Return {
  organizationId: string;
  reportingPeriod: {
    startDate: Date;
    endDate: Date;
    frequency: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';
  };
  totalSales: number;
  taxableSales: number;
  zeroRatedSales: number;
  exemptSales: number;
  gstHstCollected: number;
  gstHstOwed: number;
  inputTaxCredits: number;
  adjustments: number;
  netTaxOwed: number;
  installmentsPaid: number;
  refundOrBalance: number;
  lineItems: GST_HST_LineItem[];
}

export interface GST_HST_LineItem {
  lineNumber: string;
  description: string;
  amount: number;
  taxRate: number;
  taxAmount: number;
  category: string;
}

export class CanadianTaxService {
  private prisma: PrismaClient;
  private taxService: TaxService;

  // Provincial HST/GST rates (current as of 2024)
  private static readonly PROVINCIAL_RATES: Record<CanadianProvince, {
    federalGST: number;
    provincialPST: number;
    combinedHST?: number;
    isHSTProvince: boolean;
    compound: boolean;
    provinceName: string;
  }> = {
    'AB': { federalGST: 5.0, provincialPST: 0.0, isHSTProvince: false, compound: false, provinceName: 'Alberta' },
    'BC': { federalGST: 5.0, provincialPST: 7.0, isHSTProvince: false, compound: false, provinceName: 'British Columbia' },
    'MB': { federalGST: 5.0, provincialPST: 7.0, isHSTProvince: false, compound: false, provinceName: 'Manitoba' },
    'NB': { federalGST: 0.0, provincialPST: 0.0, combinedHST: 15.0, isHSTProvince: true, compound: false, provinceName: 'New Brunswick' },
    'NL': { federalGST: 0.0, provincialPST: 0.0, combinedHST: 15.0, isHSTProvince: true, compound: false, provinceName: 'Newfoundland and Labrador' },
    'NS': { federalGST: 0.0, provincialPST: 0.0, combinedHST: 15.0, isHSTProvince: true, compound: false, provinceName: 'Nova Scotia' },
    'NT': { federalGST: 5.0, provincialPST: 0.0, isHSTProvince: false, compound: false, provinceName: 'Northwest Territories' },
    'NU': { federalGST: 5.0, provincialPST: 0.0, isHSTProvince: false, compound: false, provinceName: 'Nunavut' },
    'ON': { federalGST: 0.0, provincialPST: 0.0, combinedHST: 13.0, isHSTProvince: true, compound: false, provinceName: 'Ontario' },
    'PE': { federalGST: 0.0, provincialPST: 0.0, combinedHST: 15.0, isHSTProvince: true, compound: false, provinceName: 'Prince Edward Island' },
    'QC': { federalGST: 5.0, provincialPST: 9.975, isHSTProvince: false, compound: true, provinceName: 'Quebec' },
    'SK': { federalGST: 5.0, provincialPST: 6.0, isHSTProvince: false, compound: false, provinceName: 'Saskatchewan' },
    'YT': { federalGST: 5.0, provincialPST: 0.0, isHSTProvince: false, compound: false, provinceName: 'Yukon' }
  };

  constructor(prisma: PrismaClient, taxService: TaxService) {
    this.prisma = prisma;
    this.taxService = taxService;
  }

  /**
   * Calculate GST/HST with Canadian-specific rules
   */
  async calculateCanadianTax(
    request: TaxCalculationRequest,
    context: CanadianTaxContext
  ): Promise<TaxCalculationResult & { canadianBreakdown: HST_GST_Calculation }> {
    const { province, isSmallSupplier, isQuickMethod } = context;

    // Tax-exempt customers or small suppliers don't pay tax
    if (request.customerTaxExempt || isSmallSupplier) {
      const baseResult = await this.taxService.calculateTax({
        ...request,
        customerTaxExempt: true
      });

      return {
        ...baseResult,
        canadianBreakdown: {
          gstRate: 0,
          pstRate: 0,
          hstRate: 0,
          isHSTProvince: false,
          gstAmount: 0,
          pstAmount: 0,
          hstAmount: 0,
          totalTax: 0,
          breakdown: { federalPortion: 0, provincialPortion: 0 }
        }
      };
    }

    // Get provincial tax configuration
    const provincialConfig = CanadianTaxService.PROVINCIAL_RATES[province];

    // Update jurisdiction for calculation
    const canadianJurisdiction: TaxJurisdiction = {
      countryCode: 'CA',
      stateProvinceCode: province
    };

    const result = await this.taxService.calculateTax({
      ...request,
      jurisdiction: canadianJurisdiction
    });

    // Calculate Canadian-specific breakdown
    const canadianBreakdown = this.calculateHSTGSTBreakdown(
      result.taxableAmount,
      provincialConfig,
      isQuickMethod
    );

    // Always use Canadian breakdown for accurate tax calculations
    // The base TaxService uses database tax rates which may differ from
    // the precise Canadian provincial rates defined in this service
    const totalTax = canadianBreakdown.totalTax;

    // Use FinancialMath for precise calculation to avoid floating point errors
    const grandTotal = FinancialMath.toNumber(
      FinancialMath.add(
        FinancialMath.subtract(result.subtotal, result.totalDiscount),
        totalTax
      )
    );

    return {
      ...result,
      totalTax,
      grandTotal,
      canadianBreakdown
    };
  }

  /**
   * Calculate Input Tax Credits (ITCs)
   */
  async calculateInputTaxCredits(
    organizationId: string,
    expenseAmount: number,
    taxPaid: number,
    expenseType: string,
    context: CanadianTaxContext
  ): Promise<ITCCalculation> {
    const restrictions: string[] = [];
    let itcRate = 1.0; // 100% by default

    // Apply CRA restrictions on ITCs
    switch (expenseType.toLowerCase()) {
      case 'meals_entertainment':
        itcRate = 0.5; // 50% restriction on meals and entertainment
        restrictions.push('Meals and entertainment expenses limited to 50% ITC');
        break;

      case 'passenger_vehicle':
        // Vehicle restrictions apply
        if (expenseAmount > 30000) { // 2024 limit
          restrictions.push('Passenger vehicle cost exceeds luxury threshold');
          itcRate = 30000 / expenseAmount; // Pro-rate based on limit
        }
        break;

      case 'club_membership':
        itcRate = 0.0; // No ITC for club memberships
        restrictions.push('No ITC available for club memberships');
        break;

      case 'home_office':
        // Personal use restrictions may apply
        restrictions.push('Ensure business use percentage is supportable');
        break;
    }

    const eligibleAmount = expenseAmount * itcRate;
    const itcAmount = taxPaid * itcRate;

    return {
      eligibleAmount,
      itcRate,
      itcAmount,
      restrictions,
      supportingDocuments: this.getRequiredDocuments(expenseType)
    };
  }

  /**
   * Generate GST/HST return for filing
   */
  async generateGSTHSTReturn(
    organizationId: string,
    startDate: Date,
    endDate: Date,
    context: CanadianTaxContext
  ): Promise<GST_HST_Return> {
    // Get all sales (invoices) for the period
    const invoices = await this.prisma.invoice.findMany({
      where: {
        organizationId,
        issueDate: { gte: startDate, lte: endDate },
        status: { in: ['SENT', 'PAID', 'PARTIAL_PAID'] },
        deletedAt: null
      },
      include: { items: true }
    });

    // Get all purchases (expenses) for the period
    const expenses = await this.prisma.expense.findMany({
      where: {
        organizationId,
        expenseDate: { gte: startDate, lte: endDate },
        deletedAt: null
      }
    });

    // Calculate sales figures
    let totalSales = 0;
    let taxableSales = 0;
    let zeroRatedSales = 0;
    let exemptSales = 0;
    let gstHstCollected = 0;

    for (const invoice of invoices) {
      const subtotal = Number(invoice.subtotal);
      const taxAmount = Number(invoice.taxAmount);

      totalSales += subtotal;

      if (taxAmount > 0) {
        taxableSales += subtotal;
        gstHstCollected += taxAmount;
      } else {
        // Would need logic to distinguish between zero-rated and exempt
        zeroRatedSales += subtotal;
      }
    }

    // Calculate Input Tax Credits
    let inputTaxCredits = 0;
    for (const expense of expenses) {
      const taxAmount = Number(expense.taxAmount);
      // Apply ITC restrictions
      const itc = await this.calculateInputTaxCredits(
        organizationId,
        Number(expense.amount),
        taxAmount,
        'general', // Would categorize based on expense type
        context
      );
      inputTaxCredits += itc.itcAmount;
    }

    const gstHstOwed = gstHstCollected;
    const adjustments = 0; // Would implement specific adjustments
    const netTaxOwed = Math.max(0, gstHstOwed - inputTaxCredits + adjustments);

    // Get installments paid (would track separately)
    const installmentsPaid = 0;
    const refundOrBalance = netTaxOwed - installmentsPaid;

    // Determine reporting frequency
    const frequency = this.determineReportingFrequency(totalSales);

    const lineItems: GST_HST_LineItem[] = [
      {
        lineNumber: '101',
        description: 'Total sales and other revenue',
        amount: totalSales,
        taxRate: 0,
        taxAmount: 0,
        category: 'SALES'
      },
      {
        lineNumber: '103',
        description: 'GST/HST collected or collectible',
        amount: taxableSales,
        taxRate: this.getApplicableTaxRate(context.province),
        taxAmount: gstHstCollected,
        category: 'TAX_COLLECTED'
      },
      {
        lineNumber: '106',
        description: 'Total GST/HST collected or collectible',
        amount: 0,
        taxRate: 0,
        taxAmount: gstHstOwed,
        category: 'TAX_OWED'
      },
      {
        lineNumber: '108',
        description: 'Total Input Tax Credits',
        amount: 0,
        taxRate: 0,
        taxAmount: inputTaxCredits,
        category: 'ITC'
      }
    ];

    return {
      organizationId,
      reportingPeriod: { startDate, endDate, frequency },
      totalSales,
      taxableSales,
      zeroRatedSales,
      exemptSales,
      gstHstCollected,
      gstHstOwed,
      inputTaxCredits,
      adjustments,
      netTaxOwed,
      installmentsPaid,
      refundOrBalance,
      lineItems
    };
  }

  /**
   * Check if item qualifies for zero-rated GST/HST
   */
  isZeroRated(itemDescription: string, itemCategory?: string): boolean {
    const zeroRatedKeywords = [
      'groceries',
      'grocery',
      'prescription',
      'medication',
      'medical device',
      'export',
      'agricultural',
      'fishing'
    ];

    const description = itemDescription.toLowerCase();
    const category = itemCategory?.toLowerCase() || '';

    return zeroRatedKeywords.some(keyword =>
      description.includes(keyword) || category.includes(keyword)
    );
  }

  /**
   * Check if item is GST/HST exempt
   */
  isGSTExempt(itemDescription: string, itemCategory?: string): boolean {
    const exemptKeywords = [
      'residential rent',
      'healthcare',
      'health care',
      'medical service',
      'educational',
      'education',
      'daycare',
      'legal aid',
      'financial service'
    ];

    const description = itemDescription.toLowerCase();
    const category = itemCategory?.toLowerCase() || '';

    return exemptKeywords.some(keyword =>
      description.includes(keyword) || category.includes(keyword)
    );
  }

  // Private helper methods

  private calculateHSTGSTBreakdown(
    taxableAmount: number,
    provincialConfig: any,
    isQuickMethod: boolean = false
  ): HST_GST_Calculation {
    let gstAmount = 0;
    let pstAmount = 0;
    let hstAmount = 0;
    let federalPortion = 0;
    let provincialPortion = 0;

    if (provincialConfig.isHSTProvince) {
      // HST Province - combined rate using precise decimal calculation
      hstAmount = FinancialMath.toNumber(FinancialMath.calculateTax(taxableAmount, provincialConfig.combinedHST));

      // Calculate federal vs provincial portions for HST
      if (provincialConfig.combinedHST === 13.0) { // Ontario
        federalPortion = FinancialMath.toNumber(FinancialMath.calculateTax(taxableAmount, 5)); // 5% GST
        provincialPortion = FinancialMath.toNumber(FinancialMath.calculateTax(taxableAmount, 8)); // 8% Provincial
      } else if (provincialConfig.combinedHST === 15.0) { // Atlantic provinces
        federalPortion = FinancialMath.toNumber(FinancialMath.calculateTax(taxableAmount, 5)); // 5% GST
        provincialPortion = FinancialMath.toNumber(FinancialMath.calculateTax(taxableAmount, 10)); // 10% Provincial
      }
    } else {
      // GST + PST Province using precise decimal calculation
      gstAmount = FinancialMath.toNumber(FinancialMath.calculateTax(taxableAmount, provincialConfig.federalGST));
      federalPortion = gstAmount;

      if (provincialConfig.provincialPST > 0) {
        if (provincialConfig.compound) {
          // Quebec has compound tax (PST applied on GST + base)
          const compoundResult = FinancialMath.calculateCompoundTax(taxableAmount, provincialConfig.federalGST, provincialConfig.provincialPST);
          gstAmount = FinancialMath.toNumber(compoundResult.firstTax);
          pstAmount = FinancialMath.toNumber(compoundResult.secondTax);
          federalPortion = gstAmount;
        } else {
          // Regular PST on base amount only
          pstAmount = FinancialMath.toNumber(FinancialMath.calculateTax(taxableAmount, provincialConfig.provincialPST));
        }
        provincialPortion = pstAmount;
      }
    }

    // Calculate total tax using precise decimal arithmetic
    const totalTax = FinancialMath.toNumber(
      FinancialMath.add(
        FinancialMath.add(gstAmount, pstAmount),
        hstAmount
      )
    );

    return {
      gstRate: provincialConfig.federalGST,
      pstRate: provincialConfig.provincialPST,
      hstRate: provincialConfig.combinedHST || 0,
      isHSTProvince: provincialConfig.isHSTProvince,
      gstAmount,
      pstAmount,
      hstAmount,
      totalTax,
      breakdown: {
        federalPortion,
        provincialPortion
      }
    };
  }

  private getRequiredDocuments(expenseType: string): string[] {
    const baseDocuments = ['Receipt or invoice', 'Proof of payment'];

    switch (expenseType.toLowerCase()) {
      case 'meals_entertainment':
        return [...baseDocuments, 'Business purpose documentation', 'List of attendees'];

      case 'travel':
        return [...baseDocuments, 'Travel itinerary', 'Business purpose'];

      case 'home_office':
        return [...baseDocuments, 'Home office calculation worksheet', 'Utility bills'];

      case 'vehicle':
        return [...baseDocuments, 'Vehicle log', 'Business km calculation'];

      default:
        return baseDocuments;
    }
  }

  private determineReportingFrequency(annualSales: number): 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' {
    if (annualSales > 6000000) {
      return 'MONTHLY'; // Over $6M must file monthly
    } else if (annualSales > 1500000) {
      return 'QUARTERLY'; // $1.5M - $6M can file quarterly
    } else {
      return 'ANNUAL'; // Under $1.5M can file annually
    }
  }

  private getApplicableTaxRate(province: CanadianProvince): number {
    const config = CanadianTaxService.PROVINCIAL_RATES[province];

    if (config.isHSTProvince) {
      return config.combinedHST || 0;
    } else {
      return config.federalGST + config.provincialPST;
    }
  }

  /**
   * Validate GST/HST number format
   */
  validateGSTNumber(gstNumber: string): boolean {
    // Canadian GST number format: 9 digits + RT + 4 digits
    // Example: 123456789RT0001
    const gstRegex = /^\d{9}RT\d{4}$/;
    return gstRegex.test(gstNumber);
  }

  /**
   * Get current small supplier threshold
   */
  getSmallSupplierThreshold(): number {
    return 30000; // Current CRA threshold as of 2024
  }

  /**
   * Calculate Quick Method credit rate
   */
  getQuickMethodRate(province: CanadianProvince, businessType: 'SERVICE' | 'RETAIL' | 'MANUFACTURING'): number {
    // Quick Method rates vary by province and business type
    // These are simplified rates - actual rates have more complexity

    const baseRates = {
      'SERVICE': 3.6,
      'RETAIL': 1.8,
      'MANUFACTURING': 2.5
    };

    // Adjust for provincial differences
    const provincialAdjustment = CanadianTaxService.PROVINCIAL_RATES[province].isHSTProvince ? 0.5 : 0.0;

    return baseRates[businessType] + provincialAdjustment;
  }

  /**
   * Initialize Canadian provincial and federal tax rates in the database
   */
  async initializeCanadianTaxRates(userId: string): Promise<any[]> {
    const rates: any[] = [];

    // Initialize rates for each province/territory
    for (const [provinceCode, config] of Object.entries(CanadianTaxService.PROVINCIAL_RATES)) {
      const jurisdiction = {
        countryCode: 'CA',
        stateProvinceCode: provinceCode,
        municipalityCode: null,
        postalCode: null
      };

      // Add federal GST rate
      if (config.federalGST > 0) {
        const gstRate = await this.taxService.configureTaxRate({
          code: 'GST',
          name: `Federal GST - ${config.provinceName}`,
          taxType: 'GST',
          rate: config.federalGST,
          countryCode: 'CA',
          stateProvinceCode: provinceCode,
          effectiveDate: new Date(),
          isCompound: false,
          description: `Federal GST for ${config.provinceName}`
        }, userId);
        rates.push(gstRate);
      }

      // Add provincial HST rate (for HST provinces)
      if (config.isHSTProvince && config.combinedHST && config.combinedHST > 0) {
        const hstRate = await this.taxService.configureTaxRate({
          code: 'HST',
          name: `Combined HST - ${config.provinceName}`,
          taxType: 'HST',
          rate: config.combinedHST,
          countryCode: 'CA',
          stateProvinceCode: provinceCode,
          effectiveDate: new Date(),
          isCompound: false,
          description: `Combined HST for ${config.provinceName}`
        }, userId);
        rates.push(hstRate);
      }

      // Add provincial PST rate (for GST+PST provinces)
      if (!config.isHSTProvince && config.provincialPST > 0) {
        const pstRate = await this.taxService.configureTaxRate({
          code: 'PST',
          name: `Provincial PST - ${config.provinceName}`,
          taxType: 'PST',
          rate: config.provincialPST,
          countryCode: 'CA',
          stateProvinceCode: provinceCode,
          effectiveDate: new Date(),
          isCompound: config.compound || false,
          description: `Provincial PST for ${config.provinceName}`
        }, userId);
        rates.push(pstRate);
      }
    }

    return rates;
  }
}