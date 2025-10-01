/**
 * IntakeFormConversionService
 * Converts completed intake form sessions to Customer and Quote records
 */

import { PrismaClient } from '@prisma/client';
import { ConversionSettings, SessionDto } from '@/types/intake-form-template.types';
import { NotFoundError, ValidationError } from '@/utils/errors';
import { EncryptionService } from './encryption.service';

export interface ConversionResult {
  customerId?: string;
  quoteId?: string;
  success: boolean;
  errors?: string[];
}

export class IntakeFormConversionService {
  constructor(
    private prisma: PrismaClient,
    private encryptionService: EncryptionService
  ) {}

  /**
   * Convert a completed session to Customer and Quote
   */
  async convertSession(
    organizationId: string,
    sessionId: string
  ): Promise<ConversionResult> {
    // Get session and template
    const session = await this.prisma.intakeFormSession.findUnique({
      where: { id: sessionId },
      include: {
        formData: true,
        template: true,
      },
    });

    if (!session) {
      throw new NotFoundError('Session not found');
    }

    if (session.template.organizationId !== organizationId) {
      throw new ValidationError('Session does not belong to this organization');
    }

    if (session.status !== 'COMPLETED') {
      throw new ValidationError('Session must be completed before conversion');
    }

    if (session.convertedAt) {
      // Already converted, return existing IDs
      return {
        customerId: session.convertedToCustomerId || undefined,
        quoteId: session.convertedToQuoteId || undefined,
        success: true,
      };
    }

    const formData = session.formData
      ? JSON.parse(session.formData.data)
      : {};

    const conversionSettings: ConversionSettings = session.template.conversionSettings
      ? JSON.parse(session.template.conversionSettings)
      : {};

    const errors: string[] = [];
    let customerId: string | undefined;
    let quoteId: string | undefined;

    try {
      // Convert to customer
      if (conversionSettings.customerMapping) {
        customerId = await this.createCustomer(
          organizationId,
          formData,
          conversionSettings.customerMapping
        );
      }

      // Convert to quote
      if (conversionSettings.quoteMapping && customerId) {
        quoteId = await this.createQuote(
          organizationId,
          customerId,
          formData,
          conversionSettings.quoteMapping
        );
      }

      // Mark session as converted
      await this.prisma.intakeFormSession.update({
        where: { id: sessionId },
        data: {
          convertedAt: new Date(),
          convertedToCustomerId: customerId,
          convertedToQuoteId: quoteId,
        },
      });

      // Update template conversion count
      await this.prisma.intakeFormTemplate.update({
        where: { id: session.templateId },
        data: {
          conversionCount: { increment: 1 },
        },
      });

      return {
        customerId,
        quoteId,
        success: true,
      };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Unknown error');
      return {
        success: false,
        errors,
      };
    }
  }

  /**
   * Create customer from form data
   */
  private async createCustomer(
    organizationId: string,
    formData: Record<string, unknown>,
    mapping: Record<string, string>
  ): Promise<string> {
    // Extract mapped data
    const email = this.getNestedValue(formData, mapping.email || 'email') as string;
    const firstName = this.getNestedValue(formData, mapping.firstName || 'firstName') as string;
    const lastName = this.getNestedValue(formData, mapping.lastName || 'lastName') as string;
    const phone = this.getNestedValue(formData, mapping.phone || 'phone') as string;
    const businessName = this.getNestedValue(formData, mapping.businessName || 'businessName') as string;
    const profileType = this.getNestedValue(formData, mapping.profileType || 'profileType') as string;

    if (!email) {
      throw new ValidationError('Email is required for customer creation');
    }

    // Check if customer already exists
    let existingCustomer = await this.prisma.customer.findFirst({
      where: {
        organizationId,
        person: {
          email,
        },
        deletedAt: null,
      },
      include: {
        person: true,
      },
    });

    if (existingCustomer) {
      return existingCustomer.id;
    }

    // Determine if residential or commercial
    const isCommercial = profileType === 'COMMERCIAL' || !!businessName;

    // Generate customer number
    const customerCount = await this.prisma.customer.count({
      where: { organizationId },
    });
    const customerNumber = `CUST-${String(customerCount + 1).padStart(6, '0')}`;

    // Note: Email and phone are stored in Person/Business models
    // which handle encryption automatically through the existing system
    const personEmail = email;
    const personPhone = phone || undefined;

    if (isCommercial && businessName) {
      // Create business customer
      const business = await this.prisma.business.create({
        data: {
          organizationId,
          legalName: businessName,
          email: personEmail,
          phone: personPhone,
          businessType: 'SOLE_PROPRIETORSHIP',
        },
      });

      const customer = await this.prisma.customer.create({
        data: {
          organizationId,
          customerNumber,
          businessId: business.id,
          tier: 'COMMERCIAL',
          status: 'PROSPECT',
        },
      });

      return customer.id;
    } else {
      // Create person customer
      const person = await this.prisma.person.create({
        data: {
          organizationId,
          firstName: firstName || 'Unknown',
          lastName: lastName || 'Customer',
          email: personEmail,
          phone: personPhone,
        },
      });

      const customer = await this.prisma.customer.create({
        data: {
          organizationId,
          customerNumber,
          personId: person.id,
          tier: 'PERSONAL',
          status: 'PROSPECT',
        },
      });

      return customer.id;
    }
  }

  /**
   * Create quote from form data
   */
  private async createQuote(
    organizationId: string,
    customerId: string,
    formData: Record<string, unknown>,
    mapping: Record<string, string>
  ): Promise<string> {
    // Get a user to use as creator (system or first admin)
    const creator = await this.prisma.user.findFirst({
      where: {
        organizationId,
        role: 'ADMIN',
        isActive: true,
      },
    });

    if (!creator) {
      throw new ValidationError('No active admin user found for quote creation');
    }

    // Extract mapped data
    const description = this.getNestedValue(
      formData,
      mapping.description || 'description'
    ) as string;
    const serviceType = this.getNestedValue(
      formData,
      mapping.serviceType || 'serviceType'
    ) as string;
    const urgency = this.getNestedValue(
      formData,
      mapping.urgency || 'urgency'
    ) as string;
    const estimatedBudget = this.getNestedValue(
      formData,
      mapping.estimatedBudget || 'estimatedBudget'
    ) as string;

    // Generate quote number
    const quoteCount = await this.prisma.quote.count({
      where: { organizationId },
    });
    const quoteNumber = `Q-${String(quoteCount + 1).padStart(6, '0')}`;

    // Calculate valid until date (30 days from now)
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + 30);

    // Create quote
    const quote = await this.prisma.quote.create({
      data: {
        organizationId,
        quoteNumber,
        customerId,
        createdById: creator.id,
        status: 'DRAFT',
        validUntil,
        subtotal: 0,
        taxAmount: 0,
        total: 0,
        description: description || `${serviceType || 'Service'} - ${urgency || 'Standard'}`,
        notes: estimatedBudget
          ? `Customer estimated budget: ${estimatedBudget}`
          : undefined,
        customFields: JSON.stringify(formData),
      },
    });

    return quote.id;
  }

  /**
   * Get nested value from object using dot notation
   */
  private getNestedValue(
    obj: Record<string, unknown>,
    path: string
  ): unknown {
    if (!path) {
      return undefined;
    }

    const keys = path.split('.');
    let value: any = obj;

    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return undefined;
      }
    }

    return value;
  }

  /**
   * Set nested value in object using dot notation
   */
  private setNestedValue(
    obj: Record<string, unknown>,
    path: string,
    value: unknown
  ): void {
    const keys = path.split('.');
    const lastKey = keys.pop();

    if (!lastKey) {
      return;
    }

    let current: any = obj;

    for (const key of keys) {
      if (!(key in current)) {
        current[key] = {};
      }
      current = current[key];
    }

    current[lastKey] = value;
  }

  /**
   * Transform value using specified transformation function
   */
  private transformValue(value: unknown, transformFn: string): unknown {
    switch (transformFn) {
      case 'uppercase':
        return typeof value === 'string' ? value.toUpperCase() : value;

      case 'lowercase':
        return typeof value === 'string' ? value.toLowerCase() : value;

      case 'trim':
        return typeof value === 'string' ? value.trim() : value;

      case 'toNumber':
        return Number(value);

      case 'toString':
        return String(value);

      case 'toBoolean':
        return Boolean(value);

      case 'toDate':
        return new Date(value as string);

      default:
        return value;
    }
  }
}
