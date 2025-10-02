import { Invoice, InvoiceItem, Organization, Customer, GeneratedPDF, InvoiceTemplate, InvoiceStyle, OrganizationBranding } from '@prisma/client';
import puppeteer, { Browser, Page } from 'puppeteer';
import Handlebars from 'handlebars';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { auditService } from './audit.service';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

export interface InvoicePDFGenerationOptions {
  templateId?: string;
  styleId?: string;
  format?: 'A4' | 'Letter';
  orientation?: 'portrait' | 'landscape';
  includeBackground?: boolean;
}

export interface InvoiceWithRelations extends Invoice {
  items: (InvoiceItem & {
    product?: { sku: string; name: string } | null;
    service?: { code: string; name: string } | null;
  })[];
  customer: Customer & {
    person?: { firstName: string; lastName: string; email?: string; phone?: string } | null;
    business?: { legalName: string; tradeName?: string } | null;
  };
  quote?: { quoteNumber: string } | null;
  organization?: Organization;
}

export interface PDFGenerationContext {
  invoice: InvoiceWithRelations;
  organization: Organization;
  customer: Customer;
  branding: OrganizationBranding;
  template: string;
  styles: string;
}

export class InvoicePDFService {
  private browser: Browser | null = null;
  private templateCache = new Map<string, HandlebarsTemplateDelegate>();
  private styleCache = new Map<string, string>();

  constructor() {
    this.initializeHelpers();
  }

  /**
   * Initialize Handlebars helpers for template rendering
   */
  private initializeHelpers(): void {
    Handlebars.registerHelper('formatDate', (date: Date) => {
      if (!date) return '';
      return new Date(date).toLocaleDateString('en-CA');
    });

    Handlebars.registerHelper('formatCurrency', (amount: number | string) => {
      if (!amount) return '$0.00';
      const num = typeof amount === 'string' ? parseFloat(amount) : amount;
      return new Intl.NumberFormat('en-CA', {
        style: 'currency',
        currency: 'CAD'
      }).format(num);
    });

    Handlebars.registerHelper('formatDecimal', (value: number | string, decimals = 2) => {
      if (!value) return '0';
      const num = typeof value === 'string' ? parseFloat(value) : value;
      return num.toFixed(decimals);
    });

    Handlebars.registerHelper('formatPercent', (value: number | string) => {
      if (!value) return '0';
      const num = typeof value === 'string' ? parseFloat(value) : value;
      return num.toFixed(2);
    });

    Handlebars.registerHelper('eq', (a: any, b: any) => a === b);
    Handlebars.registerHelper('ne', (a: any, b: any) => a !== b);
    Handlebars.registerHelper('gt', (a: any, b: any) => a > b);
    Handlebars.registerHelper('lt', (a: any, b: any) => a < b);
  }

  /**
   * Initialize Puppeteer browser instance
   */
  private async initializeBrowser(): Promise<Browser> {
    if (this.browser) {
      return this.browser;
    }

    try {
      this.browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ]
      });

      logger.info('PDF service browser initialized');
      return this.browser;
    } catch (error) {
      logger.error('Failed to initialize PDF browser:', error);
      throw new Error('Failed to initialize PDF generation service');
    }
  }

  /**
   * Get compiled template from cache or load and compile
   */
  private async getCompiledTemplate(templateName: string): Promise<HandlebarsTemplateDelegate> {
    const cacheKey = templateName;

    if (this.templateCache.has(cacheKey)) {
      return this.templateCache.get(cacheKey)!;
    }

    try {
      const templatePath = path.join(process.cwd(), 'src', 'templates', 'invoice', `${templateName}.hbs`);
      const templateContent = await fs.readFile(templatePath, 'utf-8');
      const compiled = Handlebars.compile(templateContent);

      this.templateCache.set(cacheKey, compiled);
      return compiled;
    } catch (error) {
      logger.error(`Failed to load template ${templateName}:`, error);

      // Fallback to default template
      if (templateName !== 'default') {
        return this.getCompiledTemplate('default');
      }

      throw new Error(`Template ${templateName} not found and fallback failed`);
    }
  }

  /**
   * Get CSS styles from cache or load from file
   */
  private async getStyles(styleName: string): Promise<string> {
    const cacheKey = styleName;

    if (this.styleCache.has(cacheKey)) {
      return this.styleCache.get(cacheKey)!;
    }

    try {
      const stylePath = path.join(process.cwd(), 'src', 'templates', 'styles', `${styleName}.css`);
      const styleContent = await fs.readFile(stylePath, 'utf-8');

      this.styleCache.set(cacheKey, styleContent);
      return styleContent;
    } catch (error) {
      logger.warn(`Failed to load style ${styleName}, using empty styles:`, error);
      return '';
    }
  }

  /**
   * Get organization branding settings
   * Uses upsert to handle concurrent requests safely
   */
  private async getOrganizationBranding(organizationId: string): Promise<OrganizationBranding> {
    // Use upsert to avoid race conditions with concurrent requests
    const branding = await prisma.organizationBranding.upsert({
      where: { organizationId },
      update: {}, // Don't update anything if it exists
      create: {
        organizationId,
        logoUrl: null,
        showLogo: true,
        showOrgName: true,
        primaryColor: '#000000',
        secondaryColor: '#666666',
        accentColor: '#0066cc',
        backgroundColor: '#ffffff',
        textColor: '#000000',
        displaySettings: JSON.stringify({
          dateFormat: 'YYYY-MM-DD',
          currency: 'CAD',
          layout: 'standard'
        }),
        taxesEnabled: true,
        defaultTaxExempt: false
      }
    });

    return branding;
  }

  /**
   * Generate PDF from invoice data
   */
  async generateInvoicePDF(
    invoiceId: string,
    organizationId: string,
    options: InvoicePDFGenerationOptions = {},
    auditContext: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<GeneratedPDF> {
    try {
      // First, check if invoice exists at all (for proper 404 vs 403 errors)
      const invoiceExists = await prisma.invoice.findFirst({
        where: { id: invoiceId, deletedAt: null },
        select: { id: true, organizationId: true }
      });

      if (!invoiceExists) {
        throw new Error('Invoice not found');
      }

      // Then validate organization access
      if (invoiceExists.organizationId !== organizationId) {
        throw new Error('Access denied: Invoice belongs to a different organization');
      }

      // Get invoice with all related data
      const invoice = await prisma.invoice.findFirst({
        where: { id: invoiceId, organizationId, deletedAt: null },
        include: {
          items: {
            include: {
              product: { select: { sku: true, name: true } },
              service: { select: { code: true, name: true } }
            }
          },
          customer: {
            include: {
              person: { select: { firstName: true, lastName: true, email: true, phone: true } },
              business: { select: { legalName: true, tradeName: true } }
            }
          },
          quote: { select: { quoteNumber: true } },
          organization: true
        }
      }) as InvoiceWithRelations | null;

      if (!invoice) {
        throw new Error('Invoice not found');
      }

      // Get branding settings
      const branding = await this.getOrganizationBranding(organizationId);

      // Determine template and style to use
      const templateName = options.templateId ?
        (await this.getTemplateById(options.templateId))?.templateType.toLowerCase() || 'default' :
        'default';

      const styleName = options.styleId ?
        (await this.getStyleById(options.styleId))?.name.toLowerCase() || 'classic' :
        branding.defaultStyleId ?
          (await this.getStyleById(branding.defaultStyleId))?.name.toLowerCase() || 'classic' :
          'classic';

      // Check if PDF already exists
      const existingPDF = await prisma.generatedPDF.findFirst({
        where: {
          invoiceId,
          templateId: options.templateId || null,
          styleId: options.styleId || null,
          status: 'GENERATED'
        }
      });

      if (existingPDF) {
        // Check if file still exists
        try {
          await fs.access(existingPDF.filePath);
          return existingPDF;
        } catch {
          // File doesn't exist, regenerate
          await prisma.generatedPDF.delete({ where: { id: existingPDF.id } });
        }
      }

      // Generate new PDF
      const browser = await this.initializeBrowser();
      const page = await browser.newPage();

      try {
        // Set page options
        await page.setViewport({ width: 1200, height: 1600 });

        // Get template and styles
        const template = await this.getCompiledTemplate(templateName);
        const styles = await this.getStyles(styleName);

        // Convert Decimal fields to numbers for template rendering
        const toNumber = (val: any): number => {
          if (val === null || val === undefined) return 0;
          if (typeof val === 'number') return val;
          if (typeof val === 'object' && 'toNumber' in val) return val.toNumber();
          return parseFloat(String(val)) || 0;
        };

        // Prepare context with tax handling and Decimal conversion
        const context = {
          invoice: {
            ...invoice,
            subtotal: toNumber(invoice.subtotal),
            taxAmount: branding.taxesEnabled ? toNumber(invoice.taxAmount) : 0,
            total: toNumber(invoice.total),
            depositRequired: toNumber(invoice.depositRequired),
            amountPaid: toNumber(invoice.amountPaid),
            balance: toNumber(invoice.balance),
            exchangeRate: toNumber(invoice.exchangeRate),
            items: invoice.items.map(item => ({
              ...item,
              quantity: toNumber(item.quantity),
              unitPrice: toNumber(item.unitPrice),
              discountPercent: toNumber(item.discountPercent),
              taxRate: branding.taxesEnabled ? toNumber(item.taxRate) : 0,
              subtotal: toNumber(item.subtotal),
              discountAmount: toNumber(item.discountAmount),
              taxAmount: branding.taxesEnabled ? toNumber(item.taxAmount) : 0,
              total: toNumber(item.total)
            }))
          },
          organization: invoice.organization!,
          customer: invoice.customer,
          branding: {
            ...branding,
            taxDisabled: !branding.taxesEnabled,
            fontFamily: 'Arial, sans-serif'
          },
          styles
        };

        // Render HTML
        const html = template(context);

        // Set content and generate PDF
        await page.setContent(html, {
          waitUntil: 'networkidle0',
          timeout: 30000
        });

        const pdfBuffer = await page.pdf({
          format: options.format || 'A4',
          landscape: options.orientation === 'landscape',
          printBackground: options.includeBackground !== false,
          margin: {
            top: '0.5in',
            right: '0.5in',
            bottom: '0.5in',
            left: '0.5in'
          }
        });

        // Generate file path and save
        const filename = `invoice-${invoice.invoiceNumber}-${Date.now()}.pdf`;
        const filePath = path.join(process.cwd(), 'storage', 'pdfs', filename);

        // Ensure directory exists
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, pdfBuffer);

        // Calculate hash
        const fileHash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');

        // Save to database
        const generatedPDF = await prisma.generatedPDF.create({
          data: {
            organizationId,
            invoiceId,
            templateId: options.templateId || null,
            styleId: options.styleId || null,
            filename,
            fileSize: pdfBuffer.length,
            filePath,
            fileHash,
            templateVersion: '1.0',
            generatedBy: auditContext.userId,
            generationParams: JSON.stringify(options),
            status: 'GENERATED'
          }
        });

        // Audit log
        await auditService.logCreate(
          'GeneratedPDF',
          generatedPDF.id,
          { invoiceId, filename, fileSize: pdfBuffer.length },
          {
            organizationId,
            userId: auditContext.userId,
            ipAddress: auditContext.ipAddress,
            userAgent: auditContext.userAgent
          }
        );

        return generatedPDF;

      } finally {
        await page.close();
      }

    } catch (error) {
      logger.error('PDF generation failed:', error);

      // Only create failed PDF record if the error is not about missing invoice or access denial
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const shouldCreateFailedRecord = !errorMessage.includes('not found') &&
                                       !errorMessage.includes('Access denied') &&
                                       !errorMessage.includes('Invalid');

      if (shouldCreateFailedRecord) {
        try {
          await prisma.generatedPDF.create({
            data: {
              organizationId,
              invoiceId,
              templateId: options.templateId || null,
              styleId: options.styleId || null,
              filename: `failed-${Date.now()}.pdf`,
              fileSize: 0,
              filePath: '',
              fileHash: '',
              templateVersion: '1.0',
              generatedBy: auditContext.userId,
              generationParams: JSON.stringify(options),
              status: 'FAILED',
              errorMessage
            }
          });
        } catch (dbError) {
          // If we can't create the failed record, just log it and continue with the original error
          logger.warn('Failed to create failed PDF record:', dbError);
        }
      }

      // Re-throw the original error for proper error handling
      throw error;
    }
  }

  /**
   * Get PDF buffer for serving
   */
  async getPDFBuffer(pdfId: string, organizationId: string): Promise<Buffer> {
    const pdf = await prisma.generatedPDF.findFirst({
      where: { id: pdfId, organizationId, status: 'GENERATED' }
    });

    if (!pdf) {
      throw new Error('PDF not found');
    }

    try {
      return await fs.readFile(pdf.filePath);
    } catch (error) {
      logger.error('Failed to read PDF file:', error);
      throw new Error('PDF file not accessible');
    }
  }

  /**
   * Get template by ID
   */
  private async getTemplateById(templateId: string): Promise<InvoiceTemplate | null> {
    return await prisma.invoiceTemplate.findUnique({
      where: { id: templateId, deletedAt: null }
    });
  }

  /**
   * Get style by ID
   */
  private async getStyleById(styleId: string): Promise<InvoiceStyle | null> {
    return await prisma.invoiceStyle.findUnique({
      where: { id: styleId, deletedAt: null }
    });
  }

  /**
   * Clean up old PDF files
   */
  async cleanupExpiredPDFs(): Promise<void> {
    const expiredPDFs = await prisma.generatedPDF.findMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } },
          { createdAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } // 30 days old
        ]
      }
    });

    for (const pdf of expiredPDFs) {
      try {
        await fs.unlink(pdf.filePath);
      } catch (error) {
        logger.warn(`Failed to delete PDF file: ${pdf.filePath}`, error);
      }

      await prisma.generatedPDF.delete({ where: { id: pdf.id } });
    }

    logger.info(`Cleaned up ${expiredPDFs.length} expired PDF files`);
  }

  /**
   * Close browser instance
   */
  async closeBrowser(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      logger.info('PDF service browser closed');
    }
  }

  /**
   * Clear template and style caches
   */
  clearCaches(): void {
    this.templateCache.clear();
    this.styleCache.clear();
    logger.info('PDF service caches cleared');
  }
}

export const invoicePDFService = new InvoicePDFService();