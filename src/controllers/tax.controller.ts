import { Request, Response } from 'express';

import { TaxService } from '../services/tax.service';
import { CanadianTaxService, CanadianProvince } from '../services/canadian-tax.service';
import { AuditService } from '../services/audit.service';


import { prisma } from '../config/database';
const auditService = new AuditService();
const taxService = new TaxService(prisma, auditService);
const canadianTaxService = new CanadianTaxService(prisma, taxService);

export class TaxController {
  /**
   * @desc    Calculate tax for a transaction
   * @route   POST /api/v1/organizations/:organizationId/tax/calculate
   * @access  Private
   */
  static async calculateTax(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId } = req.params;
      const { items, customerTaxExempt, jurisdiction, calculationDate } = req.body;

      const result = await taxService.calculateTax({
        organizationId,
        items,
        customerTaxExempt,
        jurisdiction,
        calculationDate: calculationDate ? new Date(calculationDate) : undefined
      });

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Error calculating tax:', error);
      res.status(500).json({
        error: 'Failed to calculate tax',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * @desc    Calculate Canadian tax with provincial rules
   * @route   POST /api/v1/organizations/:organizationId/tax/calculate/canadian
   * @access  Private
   */
  static async calculateCanadianTax(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId } = req.params;
      const { items, customerTaxExempt, jurisdiction, context } = req.body;

      const result = await canadianTaxService.calculateCanadianTax(
        {
          organizationId,
          items,
          customerTaxExempt,
          jurisdiction
        },
        context
      );

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Error calculating Canadian tax:', error);
      res.status(500).json({
        error: 'Failed to calculate Canadian tax',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * @desc    Calculate Input Tax Credits (ITCs)
   * @route   POST /api/v1/organizations/:organizationId/tax/itc/calculate
   * @access  Private
   */
  static async calculateInputTaxCredits(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId } = req.params;
      const { expenseAmount, taxPaid, expenseType, context } = req.body;

      const result = await canadianTaxService.calculateInputTaxCredits(
        organizationId,
        expenseAmount,
        taxPaid,
        expenseType,
        context
      );

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Error calculating ITCs:', error);
      res.status(500).json({
        error: 'Failed to calculate Input Tax Credits',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * @desc    Generate GST/HST return
   * @route   POST /api/v1/organizations/:organizationId/tax/gst-hst-return
   * @access  Private (ACCOUNTANT+)
   */
  static async generateGSTHSTReturn(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId } = req.params;
      const { startDate, endDate, context } = req.body;

      const result = await canadianTaxService.generateGSTHSTReturn(
        organizationId,
        new Date(startDate),
        new Date(endDate),
        context
      );

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Error generating GST/HST return:', error);
      res.status(500).json({
        error: 'Failed to generate GST/HST return',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * @desc    Calculate tax remittance for a period
   * @route   POST /api/v1/organizations/:organizationId/tax/remittance
   * @access  Private (ACCOUNTANT+)
   */
  static async calculateTaxRemittance(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId } = req.params;
      const { taxType, startDate, endDate, frequency } = req.body;

      const result = await taxService.calculateTaxRemittance(
        organizationId,
        taxType,
        new Date(startDate),
        new Date(endDate),
        frequency
      );

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Error calculating tax remittance:', error);
      res.status(500).json({
        error: 'Failed to calculate tax remittance',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * @desc    Record tax payment
   * @route   POST /api/v1/organizations/:organizationId/tax/payments
   * @access  Private (ACCOUNTANT+)
   */
  static async recordTaxPayment(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId } = req.params;
      const { taxType, taxPeriod, taxYear, amountPaid, paymentDate, paymentReference } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const result = await taxService.recordTaxPayment(
        organizationId,
        taxType,
        taxPeriod,
        taxYear,
        amountPaid,
        new Date(paymentDate),
        paymentReference,
        userId
      );

      res.status(201).json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Error recording tax payment:', error);
      res.status(500).json({
        error: 'Failed to record tax payment',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * @desc    Get tax rates for jurisdiction
   * @route   GET /api/v1/organizations/:organizationId/tax/rates
   * @access  Private
   */
  static async getTaxRatesForJurisdiction(req: Request, res: Response): Promise<void> {
    try {
      const { countryCode, stateProvinceCode, municipalityCode, postalCode } = req.query;

      const jurisdiction = {
        countryCode: countryCode as string,
        stateProvinceCode: stateProvinceCode as string,
        municipalityCode: municipalityCode as string,
        postalCode: postalCode as string
      };

      const result = await taxService.getTaxRatesForJurisdiction(jurisdiction);

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Error getting tax rates:', error);
      res.status(500).json({
        error: 'Failed to get tax rates',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * @desc    Configure tax rate
   * @route   POST /api/v1/tax/rates
   * @access  Private (SUPER_ADMIN)
   */
  static async configureTaxRate(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const result = await taxService.configureTaxRate(req.body, userId);

      res.status(201).json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Error configuring tax rate:', error);
      res.status(500).json({
        error: 'Failed to configure tax rate',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * @desc    Initialize Canadian tax rates
   * @route   POST /api/v1/tax/rates/canadian/initialize
   * @access  Private (SUPER_ADMIN)
   */
  static async initializeCanadianTaxRates(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const result = await canadianTaxService.initializeCanadianTaxRates(userId);

      res.status(201).json({
        success: true,
        data: result,
        message: `Initialized ${result.length} Canadian tax rates`
      });
    } catch (error) {
      console.error('Error initializing Canadian tax rates:', error);
      res.status(500).json({
        error: 'Failed to initialize Canadian tax rates',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * @desc    Check if item is zero-rated
   * @route   POST /api/v1/tax/zero-rated/check
   * @access  Private
   */
  static async checkZeroRated(req: Request, res: Response): Promise<void> {
    try {
      const { itemDescription, itemCategory } = req.body;

      const isZeroRated = canadianTaxService.isZeroRated(itemDescription, itemCategory);

      res.json({
        success: true,
        data: {
          itemDescription,
          itemCategory,
          isZeroRated
        }
      });
    } catch (error) {
      console.error('Error checking zero-rated status:', error);
      res.status(500).json({
        error: 'Failed to check zero-rated status',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * @desc    Check if item is GST exempt
   * @route   POST /api/v1/tax/exempt/check
   * @access  Private
   */
  static async checkGSTExempt(req: Request, res: Response): Promise<void> {
    try {
      const { itemDescription, itemCategory } = req.body;

      const isExempt = canadianTaxService.isGSTExempt(itemDescription, itemCategory);

      res.json({
        success: true,
        data: {
          itemDescription,
          itemCategory,
          isExempt
        }
      });
    } catch (error) {
      console.error('Error checking GST exempt status:', error);
      res.status(500).json({
        error: 'Failed to check GST exempt status',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * @desc    Validate GST number
   * @route   POST /api/v1/tax/gst-number/validate
   * @access  Private
   */
  static async validateGSTNumber(req: Request, res: Response): Promise<void> {
    try {
      const { gstNumber } = req.body;

      const isValid = canadianTaxService.validateGSTNumber(gstNumber);

      res.json({
        success: true,
        data: {
          gstNumber,
          isValid,
          format: 'Canadian GST/HST number format: 9 digits + RT + 4 digits (e.g., 123456789RT0001)'
        }
      });
    } catch (error) {
      console.error('Error validating GST number:', error);
      res.status(500).json({
        error: 'Failed to validate GST number',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * @desc    Get small supplier threshold
   * @route   GET /api/v1/tax/small-supplier/threshold
   * @access  Private
   */
  static async getSmallSupplierThreshold(req: Request, res: Response): Promise<void> {
    try {
      const threshold = canadianTaxService.getSmallSupplierThreshold();

      res.json({
        success: true,
        data: {
          threshold,
          currency: 'CAD',
          description: 'Annual revenue threshold below which businesses are not required to register for GST/HST'
        }
      });
    } catch (error) {
      console.error('Error getting small supplier threshold:', error);
      res.status(500).json({
        error: 'Failed to get small supplier threshold',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * @desc    Get Quick Method rate
   * @route   GET /api/v1/tax/quick-method/rate
   * @access  Private
   */
  static async getQuickMethodRate(req: Request, res: Response): Promise<void> {
    try {
      const { province, businessType } = req.query;

      const rate = canadianTaxService.getQuickMethodRate(
        province as CanadianProvince,
        businessType as 'SERVICE' | 'RETAIL' | 'MANUFACTURING'
      );

      res.json({
        success: true,
        data: {
          province,
          businessType,
          rate,
          description: 'GST/HST Quick Method remittance rate for eligible businesses'
        }
      });
    } catch (error) {
      console.error('Error getting Quick Method rate:', error);
      res.status(500).json({
        error: 'Failed to get Quick Method rate',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}