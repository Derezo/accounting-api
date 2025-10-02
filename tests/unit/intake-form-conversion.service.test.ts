import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import { IntakeFormConversionService } from '@/services/intake-form-conversion.service';
import { EncryptionService } from '@/services/encryption.service';
import { NotFoundError, ValidationError } from '@/utils/errors';

const prisma = new PrismaClient();

describe('IntakeFormConversionService', () => {
  let service: IntakeFormConversionService;
  let encryptionService: EncryptionService;
  let organizationId: string;
  let templateId: string;
  let userId: string;

  beforeEach(async () => {
    // Create organization
    const organization = await prisma.organization.create({
      data: {
        name: 'Test Org',
        email: 'test@test.local',
        phone: '555-0123',
        encryptionKey: 'test-encryption-key-32-characters',
      },
    });
    organizationId = organization.id;

    // Create user for quote creation
    const user = await prisma.user.create({
      data: {
        organizationId,
        email: 'admin@test.local',
        firstName: 'Admin',
        lastName: 'User',
        passwordHash: 'hashed-password',
        role: 'ADMIN',
        isActive: true,
        emailVerified: true,
      },
    });
    userId = user.id;

    // Create template
    const template = await prisma.intakeFormTemplate.create({
      data: {
        organizationId,
        name: 'Test Template',
        industry: 'HVAC',
        config: JSON.stringify({}),
        completionRules: JSON.stringify({}),
        conversionSettings: JSON.stringify({
          customerMapping: {
            email: 'customer.email',
            firstName: 'customer.firstName',
            lastName: 'customer.lastName',
            phone: 'customer.phone',
            profileType: 'profileType',
            businessName: 'business.name',
          },
          quoteMapping: {
            description: 'service.description',
            serviceType: 'service.type',
            urgency: 'service.urgency',
            estimatedBudget: 'budget',
          },
        }),
      },
    });
    templateId = template.id;

    encryptionService = new EncryptionService(prisma);
    service = new IntakeFormConversionService(prisma, encryptionService);
  });

  afterEach(async () => {
    await prisma.quoteItem.deleteMany({});
    await prisma.quote.deleteMany({});
    await prisma.customer.deleteMany({});
    await prisma.person.deleteMany({});
    await prisma.business.deleteMany({});
    await prisma.intakeFormData.deleteMany({});
    await prisma.intakeFormSession.deleteMany({});
    await prisma.intakeFormTemplate.deleteMany({});
    await prisma.auditLog.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.organization.deleteMany({});
  });

  describe('convertSession', () => {
    test('should convert residential customer session successfully', async () => {
      // Create session
      const session = await prisma.intakeFormSession.create({
        data: {
          templateId,
          tokenHash: 'test-token-hash',
          currentStepKey: 'complete',
          visitedSteps: JSON.stringify(['step1']),
          completedSteps: JSON.stringify(['step1']),
          ipAddress: '192.168.1.1',
          status: 'COMPLETED',
          expiresAt: new Date(Date.now() + 86400000),
        },
      });

      // Create form data
      await prisma.intakeFormData.create({
        data: {
          sessionId: session.id,
          data: JSON.stringify({
            customer: {
              email: 'john@example.com',
              firstName: 'John',
              lastName: 'Doe',
              phone: '555-1234',
            },
            profileType: 'RESIDENTIAL',
            service: {
              type: 'HVAC Repair',
              description: 'AC not cooling',
              urgency: 'HIGH',
            },
            budget: '$500-$1000',
          }),
          completionPercentage: 100,
          isValid: true,
        },
      });

      const result = await service.convertSession(organizationId, session.id);

      expect(result.success).toBe(true);
      expect(result.customerId).toBeDefined();
      expect(result.quoteId).toBeDefined();

      // Verify customer was created
      const customer = await prisma.customer.findUnique({
        where: { id: result.customerId },
        include: { person: true },
      });

      expect(customer).not.toBeNull();
      expect(customer!.tier).toBe('PERSONAL');
      expect(customer!.status).toBe('PROSPECT');
      expect(customer!.person?.email).toBe('john@example.com');
      expect(customer!.person?.firstName).toBe('John');
      expect(customer!.person?.lastName).toBe('Doe');

      // Verify quote was created
      const quote = await prisma.quote.findUnique({
        where: { id: result.quoteId },
      });

      expect(quote).not.toBeNull();
      expect(quote!.customerId).toBe(result.customerId);
      expect(quote!.status).toBe('DRAFT');
      expect(quote!.description).toBe('AC not cooling');

      // Verify session was marked as converted
      const updatedSession = await prisma.intakeFormSession.findUnique({
        where: { id: session.id },
      });

      expect(updatedSession!.convertedAt).not.toBeNull();
      expect(updatedSession!.convertedToCustomerId).toBe(result.customerId);
      expect(updatedSession!.convertedToQuoteId).toBe(result.quoteId);

      // Verify template conversion count incremented
      const updatedTemplate = await prisma.intakeFormTemplate.findUnique({
        where: { id: templateId },
      });

      expect(updatedTemplate!.conversionCount).toBe(1);
    });

    test('should convert commercial customer session successfully', async () => {
      const session = await prisma.intakeFormSession.create({
        data: {
          templateId,
          tokenHash: 'test-token-hash-2',
          currentStepKey: 'complete',
          visitedSteps: JSON.stringify(['step1']),
          completedSteps: JSON.stringify(['step1']),
          ipAddress: '192.168.1.1',
          status: 'COMPLETED',
          expiresAt: new Date(Date.now() + 86400000),
        },
      });

      await prisma.intakeFormData.create({
        data: {
          sessionId: session.id,
          data: JSON.stringify({
            customer: {
              email: 'contact@business.com',
              phone: '555-5678',
            },
            profileType: 'COMMERCIAL',
            business: {
              name: 'Acme Corp',
            },
            service: {
              type: 'Commercial HVAC',
              description: 'Building AC maintenance',
              urgency: 'STANDARD',
            },
          }),
          completionPercentage: 100,
          isValid: true,
        },
      });

      const result = await service.convertSession(organizationId, session.id);

      expect(result.success).toBe(true);
      expect(result.customerId).toBeDefined();

      const customer = await prisma.customer.findUnique({
        where: { id: result.customerId },
        include: { business: true },
      });

      expect(customer).not.toBeNull();
      expect(customer!.tier).toBe('COMMERCIAL');
      expect(customer!.business?.legalName).toBe('Acme Corp');
      expect(customer!.business?.email).toBe('contact@business.com');
    });

    test('should return existing IDs if already converted', async () => {
      const session = await prisma.intakeFormSession.create({
        data: {
          templateId,
          tokenHash: 'test-token-hash-3',
          currentStepKey: 'complete',
          visitedSteps: JSON.stringify(['step1']),
          completedSteps: JSON.stringify(['step1']),
          ipAddress: '192.168.1.1',
          status: 'COMPLETED',
          expiresAt: new Date(Date.now() + 86400000),
          convertedAt: new Date(),
          convertedToCustomerId: 'existing-customer-id',
          convertedToQuoteId: 'existing-quote-id',
        },
      });

      await prisma.intakeFormData.create({
        data: {
          sessionId: session.id,
          data: JSON.stringify({ customer: { email: 'test@test.com' } }),
          completionPercentage: 100,
          isValid: true,
        },
      });

      const result = await service.convertSession(organizationId, session.id);

      expect(result.success).toBe(true);
      expect(result.customerId).toBe('existing-customer-id');
      expect(result.quoteId).toBe('existing-quote-id');
    });

    test('should throw NotFoundError for non-existent session', async () => {
      await expect(
        service.convertSession(organizationId, 'non-existent-id')
      ).rejects.toThrow(NotFoundError);
    });

    test('should throw ValidationError if session not completed', async () => {
      const session = await prisma.intakeFormSession.create({
        data: {
          templateId,
          tokenHash: 'test-token-hash-4',
          currentStepKey: 'step1',
          visitedSteps: JSON.stringify(['step1']),
          completedSteps: JSON.stringify([]),
          ipAddress: '192.168.1.1',
          status: 'ACTIVE',
          expiresAt: new Date(Date.now() + 86400000),
        },
      });

      await prisma.intakeFormData.create({
        data: {
          sessionId: session.id,
          data: JSON.stringify({}),
          completionPercentage: 50,
          isValid: false,
        },
      });

      await expect(
        service.convertSession(organizationId, session.id)
      ).rejects.toThrow(ValidationError);
    });

    test('should throw ValidationError for wrong organization', async () => {
      const otherOrg = await prisma.organization.create({
        data: {
          name: 'Other Org',
          email: 'other@test.local',
          phone: '555-9999',
          encryptionKey: 'other-encryption-key-32-chars-!',
        },
      });

      const session = await prisma.intakeFormSession.create({
        data: {
          templateId,
          tokenHash: 'test-token-hash-5',
          currentStepKey: 'complete',
          visitedSteps: JSON.stringify(['step1']),
          completedSteps: JSON.stringify(['step1']),
          ipAddress: '192.168.1.1',
          status: 'COMPLETED',
          expiresAt: new Date(Date.now() + 86400000),
        },
      });

      await prisma.intakeFormData.create({
        data: {
          sessionId: session.id,
          data: JSON.stringify({ customer: { email: 'test@test.com' } }),
          completionPercentage: 100,
          isValid: true,
        },
      });

      await expect(
        service.convertSession(otherOrg.id, session.id)
      ).rejects.toThrow(ValidationError);

      await prisma.organization.delete({ where: { id: otherOrg.id } });
    });

    test('should handle existing customer by email', async () => {
      // Create existing customer
      const existingPerson = await prisma.person.create({
        data: {
          organizationId,
          email: 'existing@example.com',
          firstName: 'Existing',
          lastName: 'Customer',
        },
      });

      const existingCustomer = await prisma.customer.create({
        data: {
          organizationId,
          customerNumber: 'CUST-000001',
          personId: existingPerson.id,
          tier: 'PERSONAL',
          status: 'ACTIVE',
        },
      });

      // Create session with same email
      const session = await prisma.intakeFormSession.create({
        data: {
          templateId,
          tokenHash: 'test-token-hash-6',
          currentStepKey: 'complete',
          visitedSteps: JSON.stringify(['step1']),
          completedSteps: JSON.stringify(['step1']),
          ipAddress: '192.168.1.1',
          status: 'COMPLETED',
          expiresAt: new Date(Date.now() + 86400000),
        },
      });

      await prisma.intakeFormData.create({
        data: {
          sessionId: session.id,
          data: JSON.stringify({
            customer: {
              email: 'existing@example.com',
              firstName: 'Different',
              lastName: 'Name',
            },
          }),
          completionPercentage: 100,
          isValid: true,
        },
      });

      const result = await service.convertSession(organizationId, session.id);

      expect(result.success).toBe(true);
      expect(result.customerId).toBe(existingCustomer.id);

      // Verify no duplicate customer was created
      const customerCount = await prisma.customer.count({
        where: { organizationId },
      });
      expect(customerCount).toBe(1);
    });

    test('should handle missing email gracefully', async () => {
      const session = await prisma.intakeFormSession.create({
        data: {
          templateId,
          tokenHash: 'test-token-hash-7',
          currentStepKey: 'complete',
          visitedSteps: JSON.stringify(['step1']),
          completedSteps: JSON.stringify(['step1']),
          ipAddress: '192.168.1.1',
          status: 'COMPLETED',
          expiresAt: new Date(Date.now() + 86400000),
        },
      });

      await prisma.intakeFormData.create({
        data: {
          sessionId: session.id,
          data: JSON.stringify({
            customer: {
              firstName: 'No',
              lastName: 'Email',
            },
          }),
          completionPercentage: 100,
          isValid: true,
        },
      });

      const result = await service.convertSession(organizationId, session.id);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain('Email is required');
    });

    test('should handle missing admin user gracefully', async () => {
      // Delete the admin user
      await prisma.user.delete({ where: { id: userId } });

      const session = await prisma.intakeFormSession.create({
        data: {
          templateId,
          tokenHash: 'test-token-hash-8',
          currentStepKey: 'complete',
          visitedSteps: JSON.stringify(['step1']),
          completedSteps: JSON.stringify(['step1']),
          ipAddress: '192.168.1.1',
          status: 'COMPLETED',
          expiresAt: new Date(Date.now() + 86400000),
        },
      });

      await prisma.intakeFormData.create({
        data: {
          sessionId: session.id,
          data: JSON.stringify({
            customer: {
              email: 'test@example.com',
              firstName: 'Test',
              lastName: 'User',
            },
          }),
          completionPercentage: 100,
          isValid: true,
        },
      });

      const result = await service.convertSession(organizationId, session.id);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain('No active admin user found');
    });

    test('should generate sequential customer numbers', async () => {
      // Create first customer
      const session1 = await prisma.intakeFormSession.create({
        data: {
          templateId,
          tokenHash: 'test-token-hash-9',
          currentStepKey: 'complete',
          visitedSteps: JSON.stringify(['step1']),
          completedSteps: JSON.stringify(['step1']),
          ipAddress: '192.168.1.1',
          status: 'COMPLETED',
          expiresAt: new Date(Date.now() + 86400000),
        },
      });

      await prisma.intakeFormData.create({
        data: {
          sessionId: session1.id,
          data: JSON.stringify({
            customer: {
              email: 'customer1@example.com',
              firstName: 'Customer',
              lastName: 'One',
            },
          }),
          completionPercentage: 100,
          isValid: true,
        },
      });

      const result1 = await service.convertSession(organizationId, session1.id);
      const customer1 = await prisma.customer.findUnique({
        where: { id: result1.customerId },
      });

      expect(customer1!.customerNumber).toBe('CUST-000001');

      // Create second customer
      const session2 = await prisma.intakeFormSession.create({
        data: {
          templateId,
          tokenHash: 'test-token-hash-10',
          currentStepKey: 'complete',
          visitedSteps: JSON.stringify(['step1']),
          completedSteps: JSON.stringify(['step1']),
          ipAddress: '192.168.1.1',
          status: 'COMPLETED',
          expiresAt: new Date(Date.now() + 86400000),
        },
      });

      await prisma.intakeFormData.create({
        data: {
          sessionId: session2.id,
          data: JSON.stringify({
            customer: {
              email: 'customer2@example.com',
              firstName: 'Customer',
              lastName: 'Two',
            },
          }),
          completionPercentage: 100,
          isValid: true,
        },
      });

      const result2 = await service.convertSession(organizationId, session2.id);
      const customer2 = await prisma.customer.findUnique({
        where: { id: result2.customerId },
      });

      expect(customer2!.customerNumber).toBe('CUST-000002');
    });

    test('should generate sequential quote numbers', async () => {
      const session = await prisma.intakeFormSession.create({
        data: {
          templateId,
          tokenHash: 'test-token-hash-11',
          currentStepKey: 'complete',
          visitedSteps: JSON.stringify(['step1']),
          completedSteps: JSON.stringify(['step1']),
          ipAddress: '192.168.1.1',
          status: 'COMPLETED',
          expiresAt: new Date(Date.now() + 86400000),
        },
      });

      await prisma.intakeFormData.create({
        data: {
          sessionId: session.id,
          data: JSON.stringify({
            customer: {
              email: 'quote@example.com',
              firstName: 'Quote',
              lastName: 'Test',
            },
          }),
          completionPercentage: 100,
          isValid: true,
        },
      });

      const result = await service.convertSession(organizationId, session.id);
      const quote = await prisma.quote.findUnique({
        where: { id: result.quoteId },
      });

      expect(quote!.quoteNumber).toBe('Q-000001');
    });

    test('should set quote valid until date 30 days ahead', async () => {
      const session = await prisma.intakeFormSession.create({
        data: {
          templateId,
          tokenHash: 'test-token-hash-12',
          currentStepKey: 'complete',
          visitedSteps: JSON.stringify(['step1']),
          completedSteps: JSON.stringify(['step1']),
          ipAddress: '192.168.1.1',
          status: 'COMPLETED',
          expiresAt: new Date(Date.now() + 86400000),
        },
      });

      await prisma.intakeFormData.create({
        data: {
          sessionId: session.id,
          data: JSON.stringify({
            customer: {
              email: 'validity@example.com',
              firstName: 'Valid',
              lastName: 'Test',
            },
          }),
          completionPercentage: 100,
          isValid: true,
        },
      });

      const beforeConversion = new Date();
      const result = await service.convertSession(organizationId, session.id);
      const quote = await prisma.quote.findUnique({
        where: { id: result.quoteId },
      });

      const expectedDate = new Date(beforeConversion);
      expectedDate.setDate(expectedDate.getDate() + 30);

      const validUntil = new Date(quote!.validUntil);
      const daysDiff = Math.abs(validUntil.getTime() - expectedDate.getTime()) / (1000 * 60 * 60 * 24);

      expect(daysDiff).toBeLessThan(1); // Within 1 day of expected
    });

    test('should store form data in quote customFields', async () => {
      const formData = {
        customer: {
          email: 'custom@example.com',
          firstName: 'Custom',
          lastName: 'Fields',
        },
        service: {
          type: 'HVAC',
          description: 'AC repair',
        },
        customField1: 'value1',
        customField2: 'value2',
      };

      const session = await prisma.intakeFormSession.create({
        data: {
          templateId,
          tokenHash: 'test-token-hash-13',
          currentStepKey: 'complete',
          visitedSteps: JSON.stringify(['step1']),
          completedSteps: JSON.stringify(['step1']),
          ipAddress: '192.168.1.1',
          status: 'COMPLETED',
          expiresAt: new Date(Date.now() + 86400000),
        },
      });

      await prisma.intakeFormData.create({
        data: {
          sessionId: session.id,
          data: JSON.stringify(formData),
          completionPercentage: 100,
          isValid: true,
        },
      });

      const result = await service.convertSession(organizationId, session.id);
      const quote = await prisma.quote.findUnique({
        where: { id: result.quoteId },
      });

      const customFields = JSON.parse(quote!.customFields || '{}');
      expect(customFields.customField1).toBe('value1');
      expect(customFields.customField2).toBe('value2');
    });
  });
});
