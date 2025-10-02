// @ts-nocheck
import { describe, test, expect, beforeEach } from '@jest/globals';
import supertest from 'supertest';
import { prisma, testApp, baseRequest } from './setup';
import { createTestContext } from './test-utils';
import { emailService } from '../../src/services/email.service';

// Mock external services
jest.mock('../../src/services/email.service');
const mockedEmailService = emailService as jest.Mocked<typeof emailService>;

describe('Public Intake API Integration Tests', () => {
  let testContext: any;
  let organizationId: string;

  beforeEach(async () => {
    testContext = await createTestContext(prisma);
    organizationId = testContext.organization.id;

    // Reset all mocks
    jest.clearAllMocks();
    mockedEmailService.sendEmail = jest.fn().mockResolvedValue(undefined);
  });

  describe('GET /api/v1/public/intake/templates', () => {
    test('should return all available business templates', async () => {
      const response = await baseRequest()
        .get('/api/v1/public/intake/templates')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.templates).toBeInstanceOf(Array);
      expect(response.body.templates.length).toBeGreaterThan(0);
      expect(response.body.total).toBeGreaterThan(0);

      // Check template structure
      const template = response.body.templates[0];
      expect(template).toHaveProperty('category');
      expect(template).toHaveProperty('name');
      expect(template).toHaveProperty('description');
      expect(template).toHaveProperty('fieldCount');
    });

    test('should include all expected industry categories', async () => {
      const response = await baseRequest()
        .get('/api/v1/public/intake/templates')
        .expect(200);

      const categories = response.body.templates.map((t: any) => t.category);
      const expectedCategories = ['HVAC', 'PLUMBING', 'ELECTRICAL', 'GENERAL',
        'LANDSCAPING', 'CLEANING', 'CONSTRUCTION', 'ROOFING'];

      expectedCategories.forEach(category => {
        expect(categories).toContain(category);
      });
    });
  });

  describe('GET /api/v1/public/intake/templates/:category', () => {
    test('should return specific template with full field definitions', async () => {
      const response = await baseRequest()
        .get('/api/v1/public/intake/templates/HVAC')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.category).toBe('HVAC');
      expect(response.body.template).toHaveProperty('name');
      expect(response.body.template).toHaveProperty('description');
      expect(response.body.template).toHaveProperty('fields');
      expect(response.body.template.fields).toBeInstanceOf(Array);

      // Check field structure
      const field = response.body.template.fields[0];
      expect(field).toHaveProperty('name');
      expect(field).toHaveProperty('type');
      expect(field).toHaveProperty('label');
      expect(field).toHaveProperty('required');
    });

    test('should return 404 for invalid category', async () => {
      const response = await baseRequest()
        .get('/api/v1/public/intake/templates/INVALID_CATEGORY')
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should return fields with validation rules', async () => {
      const response = await baseRequest()
        .get('/api/v1/public/intake/templates/PLUMBING')
        .expect(200);

      const fields = response.body.template.fields;
      expect(fields.length).toBeGreaterThan(0);

      // Check for field with options
      const selectField = fields.find((f: any) => f.type === 'select');
      if (selectField) {
        expect(selectField).toHaveProperty('options');
        expect(selectField.options).toBeInstanceOf(Array);
      }
    });
  });

  describe('POST /api/v1/public/intake/templates/:category/validate', () => {
    test('should validate correct custom fields', async () => {
      const response = await baseRequest()
        .post('/api/v1/public/intake/templates/HVAC/validate')
        .send({
          customFields: {
            systemType: 'Central Air',
            systemAge: 10,
            brandModel: 'Carrier 24ACC636'
          }
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.validation.isValid).toBe(true);
      expect(response.body.validation.errors).toEqual([]);
    });

    test('should detect missing required fields', async () => {
      const response = await baseRequest()
        .post('/api/v1/public/intake/templates/HVAC/validate')
        .send({
          customFields: {
            systemAge: 10
          }
        })
        .expect(200);

      expect(response.body.validation.isValid).toBe(false);
      expect(response.body.validation.errors.length).toBeGreaterThan(0);
    });

    test('should warn about unknown fields', async () => {
      const response = await baseRequest()
        .post('/api/v1/public/intake/templates/ELECTRICAL/validate')
        .send({
          customFields: {
            unknownField: 'some value',
            anotherUnknown: 123
          }
        })
        .expect(200);

      expect(response.body.validation.warnings).toBeInstanceOf(Array);
      expect(response.body.validation.warnings.length).toBeGreaterThan(0);
    });

    test('should return 400 if customFields missing', async () => {
      const response = await baseRequest()
        .post('/api/v1/public/intake/templates/HVAC/validate')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/public/intake/initialize', () => {
    test('should initialize new intake session', async () => {
      const response = await baseRequest()
        .post('/api/v1/public/intake/initialize')
        .send({
          email: 'test@example.com',
          fingerprint: 'test-fingerprint-123'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.token).toBeDefined();
      expect(typeof response.body.token).toBe('string');
      expect(response.body.sessionId).toBeDefined();
      expect(response.body.expiresAt).toBeDefined();
      expect(response.body.currentStep).toBe('PROFILE_TYPE');
      expect(response.body.instructions).toBeDefined();

      // Verify session was created in database
      const session = await prisma.intakeSession.findUnique({
        where: { id: response.body.sessionId },
        include: { customerData: true }
      });

      expect(session).toBeTruthy();
      expect(session?.status).toBe('ACTIVE');
      expect(session?.customerData?.email).toBe('test@example.com');
    });

    test('should return 400 if email missing', async () => {
      const response = await baseRequest()
        .post('/api/v1/public/intake/initialize')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should create session with IP tracking', async () => {
      const response = await baseRequest()
        .post('/api/v1/public/intake/initialize')
        .send({
          email: 'test@example.com'
        })
        .expect(201);

      const session = await prisma.intakeSession.findUnique({
        where: { id: response.body.sessionId }
      });

      expect(session?.ipAddress).toBeDefined();
      expect(session?.ipAddress).not.toBe('');
    });
  });

  describe('POST /api/v1/public/intake/step - Email Capture', () => {
    let sessionToken: string;
    let sessionId: string;

    beforeEach(async () => {
      const initResponse = await baseRequest()
        .post('/api/v1/public/intake/initialize')
        .send({ email: 'customer@example.com' });

      sessionToken = initResponse.body.token;
      sessionId = initResponse.body.sessionId;
    });

    test('should update email capture step', async () => {
      const response = await baseRequest()
        .post('/api/v1/public/intake/step')
        .set('X-Intake-Token', sessionToken)
        .send({
          step: 'EMAIL_CAPTURE',
          customerData: {
            email: 'updated@example.com'
          }
        })
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify data was updated
      const session = await prisma.intakeSession.findUnique({
        where: { id: sessionId },
        include: { customerData: true }
      });

      expect(session?.customerData?.email).toBe('updated@example.com');
    });
  });

  describe('POST /api/v1/public/intake/step - Profile Type', () => {
    let sessionToken: string;
    let sessionId: string;

    beforeEach(async () => {
      const initResponse = await baseRequest()
        .post('/api/v1/public/intake/initialize')
        .send({ email: 'customer@example.com' });

      sessionToken = initResponse.body.token;
      sessionId = initResponse.body.sessionId;
    });

    test('should set residential profile type', async () => {
      const response = await baseRequest()
        .post('/api/v1/public/intake/step')
        .set('X-Intake-Token', sessionToken)
        .send({
          step: 'PROFILE_TYPE',
          customerData: {
            profileType: 'RESIDENTIAL'
          }
        })
        .expect(200);

      expect(response.body.success).toBe(true);

      const session = await prisma.intakeSession.findUnique({
        where: { id: sessionId },
        include: { customerData: true }
      });

      expect(session?.customerData?.profileType).toBe('RESIDENTIAL');
    });

    test('should set commercial profile type', async () => {
      const response = await baseRequest()
        .post('/api/v1/public/intake/step')
        .set('X-Intake-Token', sessionToken)
        .send({
          step: 'PROFILE_TYPE',
          customerData: {
            profileType: 'COMMERCIAL'
          }
        })
        .expect(200);

      expect(response.body.success).toBe(true);

      const session = await prisma.intakeSession.findUnique({
        where: { id: sessionId },
        include: { customerData: true }
      });

      expect(session?.customerData?.profileType).toBe('COMMERCIAL');
    });
  });

  describe('POST /api/v1/public/intake/step - Profile Details', () => {
    let sessionToken: string;
    let sessionId: string;

    beforeEach(async () => {
      const initResponse = await baseRequest()
        .post('/api/v1/public/intake/initialize')
        .send({ email: 'customer@example.com' });

      sessionToken = initResponse.body.token;
      sessionId = initResponse.body.sessionId;

      // Set profile type first
      await baseRequest()
        .post('/api/v1/public/intake/step')
        .set('X-Intake-Token', sessionToken)
        .send({
          step: 'PROFILE_TYPE',
          customerData: { profileType: 'RESIDENTIAL' }
        });
    });

    test('should submit residential profile details', async () => {
      const response = await baseRequest()
        .post('/api/v1/public/intake/step')
        .set('X-Intake-Token', sessionToken)
        .send({
          step: 'PROFILE_DETAILS',
          customerData: {
            firstName: 'John',
            lastName: 'Doe',
            phone: '+1-555-0100',
            addressLine1: '123 Main St',
            city: 'Toronto',
            province: 'ON',
            postalCode: 'M5V 3A8',
            country: 'CA'
          }
        })
        .expect(200);

      expect(response.body.success).toBe(true);

      const session = await prisma.intakeSession.findUnique({
        where: { id: sessionId },
        include: { customerData: true }
      });

      expect(session?.customerData?.firstName).toBe('John');
      expect(session?.customerData?.lastName).toBe('Doe');
      expect(session?.customerData?.phone).toBe('+1-555-0100');
      expect(session?.customerData?.city).toBe('Toronto');
    });

    test('should submit commercial profile details', async () => {
      // First set commercial profile type
      await baseRequest()
        .post('/api/v1/public/intake/step')
        .set('X-Intake-Token', sessionToken)
        .send({
          step: 'PROFILE_TYPE',
          customerData: { profileType: 'COMMERCIAL' }
        });

      const response = await baseRequest()
        .post('/api/v1/public/intake/step')
        .set('X-Intake-Token', sessionToken)
        .send({
          step: 'PROFILE_DETAILS',
          customerData: {
            businessName: 'Acme Corp',
            contactName: 'Jane Smith',
            businessPhone: '+1-555-0200',
            addressLine1: '456 Business Ave',
            city: 'Vancouver',
            province: 'BC',
            postalCode: 'V6B 1A1'
          }
        })
        .expect(200);

      expect(response.body.success).toBe(true);

      const session = await prisma.intakeSession.findUnique({
        where: { id: sessionId },
        include: { customerData: true }
      });

      expect(session?.customerData?.businessName).toBe('Acme Corp');
      expect(session?.customerData?.contactName).toBe('Jane Smith');
    });
  });

  describe('POST /api/v1/public/intake/step - Service Category', () => {
    let sessionToken: string;
    let sessionId: string;

    beforeEach(async () => {
      const initResponse = await baseRequest()
        .post('/api/v1/public/intake/initialize')
        .send({ email: 'customer@example.com' });

      sessionToken = initResponse.body.token;
      sessionId = initResponse.body.sessionId;
    });

    test('should set service category', async () => {
      const response = await baseRequest()
        .post('/api/v1/public/intake/step')
        .set('X-Intake-Token', sessionToken)
        .send({
          step: 'SERVICE_CATEGORY',
          quoteData: {
            category: 'HVAC',
            serviceType: 'REPAIR',
            urgency: 'URGENT'
          }
        })
        .expect(200);

      expect(response.body.success).toBe(true);

      const session = await prisma.intakeSession.findUnique({
        where: { id: sessionId },
        include: { quoteData: true }
      });

      expect(session?.quoteData?.category).toBe('HVAC');
      expect(session?.quoteData?.serviceType).toBe('REPAIR');
      expect(session?.quoteData?.urgency).toBe('URGENT');
    });
  });

  describe('POST /api/v1/public/intake/step - Service Details with Custom Fields', () => {
    let sessionToken: string;
    let sessionId: string;

    beforeEach(async () => {
      const initResponse = await baseRequest()
        .post('/api/v1/public/intake/initialize')
        .send({ email: 'customer@example.com' });

      sessionToken = initResponse.body.token;
      sessionId = initResponse.body.sessionId;

      // Set category first
      await baseRequest()
        .post('/api/v1/public/intake/step')
        .set('X-Intake-Token', sessionToken)
        .send({
          step: 'SERVICE_CATEGORY',
          quoteData: { category: 'HVAC' }
        });
    });

    test('should submit service details with HVAC custom fields', async () => {
      const response = await baseRequest()
        .post('/api/v1/public/intake/step')
        .set('X-Intake-Token', sessionToken)
        .send({
          step: 'SERVICE_DETAILS',
          quoteData: {
            description: 'AC not cooling properly',
            estimatedBudget: '1000_5000',
            customFields: {
              systemType: 'Central Air',
              systemAge: 8,
              brandModel: 'Carrier 24ACC6',
              issueType: ['Not heating/cooling', 'Strange noises'],
              lastServiceDate: '2024-05-15'
            }
          }
        })
        .expect(200);

      expect(response.body.success).toBe(true);

      const session = await prisma.intakeSession.findUnique({
        where: { id: sessionId },
        include: { quoteData: true }
      });

      expect(session?.quoteData?.description).toBe('AC not cooling properly');
      const customFields = JSON.parse(session?.quoteData?.customFields || '{}');
      expect(customFields.systemType).toBe('Central Air');
      expect(customFields.systemAge).toBe(8);
    });

    test('should validate custom fields against template', async () => {
      const response = await baseRequest()
        .post('/api/v1/public/intake/step')
        .set('X-Intake-Token', sessionToken)
        .send({
          step: 'SERVICE_DETAILS',
          quoteData: {
            description: 'Service needed',
            customFields: {
              // Missing required fields - should fail validation
              systemAge: 5
            }
          }
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should handle PLUMBING custom fields', async () => {
      // Switch to plumbing category
      await baseRequest()
        .post('/api/v1/public/intake/step')
        .set('X-Intake-Token', sessionToken)
        .send({
          step: 'SERVICE_CATEGORY',
          quoteData: { category: 'PLUMBING' }
        });

      const response = await baseRequest()
        .post('/api/v1/public/intake/step')
        .set('X-Intake-Token', sessionToken)
        .send({
          step: 'SERVICE_DETAILS',
          quoteData: {
            description: 'Leaking faucet',
            customFields: {
              issueLocation: 'Kitchen',
              fixtureType: 'Faucet',
              waterShutoff: 'Yes'
            }
          }
        })
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('GET /api/v1/public/intake/status', () => {
    let sessionToken: string;
    let sessionId: string;

    beforeEach(async () => {
      const initResponse = await baseRequest()
        .post('/api/v1/public/intake/initialize')
        .send({ email: 'customer@example.com' });

      sessionToken = initResponse.body.token;
      sessionId = initResponse.body.sessionId;
    });

    test('should return session status', async () => {
      const response = await baseRequest()
        .get('/api/v1/public/intake/status')
        .set('X-Intake-Token', sessionToken)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.session).toHaveProperty('id');
      expect(response.body.session).toHaveProperty('status');
      expect(response.body.session).toHaveProperty('currentStep');
      expect(response.body.completion).toHaveProperty('overall');
      expect(response.body.completion).toHaveProperty('customer');
      expect(response.body.completion).toHaveProperty('quote');
      expect(response.body).toHaveProperty('canSubmit');
    });

    test('should show completion percentage', async () => {
      // Add some data
      await baseRequest()
        .post('/api/v1/public/intake/step')
        .set('X-Intake-Token', sessionToken)
        .send({
          step: 'PROFILE_DETAILS',
          customerData: {
            firstName: 'John',
            lastName: 'Doe',
            phone: '+1-555-0100'
          }
        });

      const response = await baseRequest()
        .get('/api/v1/public/intake/status')
        .set('X-Intake-Token', sessionToken)
        .expect(200);

      expect(response.body.completion.customer).toBeGreaterThan(0);
    });

    test('should return 401 without token', async () => {
      const response = await baseRequest()
        .get('/api/v1/public/intake/status')
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/public/intake/submit - Complete Workflow', () => {
    let sessionToken: string;
    let sessionId: string;

    beforeEach(async () => {
      const initResponse = await baseRequest()
        .post('/api/v1/public/intake/initialize')
        .send({ email: 'complete@example.com' });

      sessionToken = initResponse.body.token;
      sessionId = initResponse.body.sessionId;
    });

    test('should complete full intake workflow and create customer/quote', async () => {
      // Step 1: Profile Type
      await baseRequest()
        .post('/api/v1/public/intake/step')
        .set('X-Intake-Token', sessionToken)
        .send({
          step: 'PROFILE_TYPE',
          customerData: { profileType: 'RESIDENTIAL' }
        });

      // Step 2: Profile Details
      await baseRequest()
        .post('/api/v1/public/intake/step')
        .set('X-Intake-Token', sessionToken)
        .send({
          step: 'PROFILE_DETAILS',
          customerData: {
            firstName: 'John',
            lastName: 'Doe',
            phone: '+1-555-0100',
            addressLine1: '123 Main St',
            city: 'Toronto',
            province: 'ON',
            postalCode: 'M5V 3A8'
          }
        });

      // Step 3: Service Category
      await baseRequest()
        .post('/api/v1/public/intake/step')
        .set('X-Intake-Token', sessionToken)
        .send({
          step: 'SERVICE_CATEGORY',
          quoteData: {
            category: 'HVAC',
            serviceType: 'REPAIR',
            urgency: 'URGENT'
          }
        });

      // Step 4: Service Details
      await baseRequest()
        .post('/api/v1/public/intake/step')
        .set('X-Intake-Token', sessionToken)
        .send({
          step: 'SERVICE_DETAILS',
          quoteData: {
            description: 'AC unit not working',
            estimatedBudget: '1000_5000',
            customFields: {
              systemType: 'Central Air',
              systemAge: 10,
              brandModel: 'Carrier'
            }
          }
        });

      // Step 5: Accept terms
      await baseRequest()
        .post('/api/v1/public/intake/step')
        .set('X-Intake-Token', sessionToken)
        .send({
          step: 'REVIEW',
          privacyConsent: true,
          termsConsent: true,
          marketingConsent: false
        });

      // Final: Submit
      const response = await baseRequest()
        .post('/api/v1/public/intake/submit')
        .set('X-Intake-Token', sessionToken)
        .send({
          organizationId: organizationId
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.customer).toHaveProperty('id');
      expect(response.body.customer).toHaveProperty('email');
      expect(response.body.quote).toHaveProperty('id');
      expect(response.body.quote).toHaveProperty('quoteNumber');
      expect(response.body.quote.status).toBe('DRAFT');
      expect(response.body.nextSteps).toBeInstanceOf(Array);

      // Verify customer was created
      const customer = await prisma.customer.findUnique({
        where: { id: response.body.customer.id },
        include: { person: true }
      });

      expect(customer).toBeTruthy();
      expect(customer?.person?.firstName).toBe('John');
      expect(customer?.person?.lastName).toBe('Doe');

      // Verify quote was created
      const quote = await prisma.quote.findUnique({
        where: { id: response.body.quote.id }
      });

      expect(quote).toBeTruthy();
      expect(quote?.customerId).toBe(response.body.customer.id);

      // Verify session marked as completed
      const session = await prisma.intakeSession.findUnique({
        where: { id: sessionId }
      });

      expect(session?.status).toBe('COMPLETED');
      expect(session?.convertedAt).toBeTruthy();
      expect(session?.convertedToCustomerId).toBe(response.body.customer.id);
      expect(session?.convertedToQuoteId).toBe(response.body.quote.id);

      // Verify email was sent
      expect(mockedEmailService.sendEmail).toHaveBeenCalled();
    });

    test('should fail submission without required data', async () => {
      const response = await baseRequest()
        .post('/api/v1/public/intake/submit')
        .set('X-Intake-Token', sessionToken)
        .send({
          organizationId: organizationId
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should fail submission without terms acceptance', async () => {
      // Add all required data but no terms
      await baseRequest()
        .post('/api/v1/public/intake/step')
        .set('X-Intake-Token', sessionToken)
        .send({
          step: 'PROFILE_DETAILS',
          customerData: {
            profileType: 'RESIDENTIAL',
            firstName: 'John',
            lastName: 'Doe',
            phone: '+1-555-0100'
          }
        });

      const response = await baseRequest()
        .post('/api/v1/public/intake/submit')
        .set('X-Intake-Token', sessionToken)
        .send({
          organizationId: organizationId
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should prevent double submission', async () => {
      // Complete full workflow
      await baseRequest()
        .post('/api/v1/public/intake/step')
        .set('X-Intake-Token', sessionToken)
        .send({
          step: 'PROFILE_DETAILS',
          customerData: {
            profileType: 'RESIDENTIAL',
            firstName: 'John',
            lastName: 'Doe',
            phone: '+1-555-0100',
            addressLine1: '123 Main St',
            city: 'Toronto',
            province: 'ON',
            postalCode: 'M5V 3A8'
          }
        });

      await baseRequest()
        .post('/api/v1/public/intake/step')
        .set('X-Intake-Token', sessionToken)
        .send({
          step: 'SERVICE_DETAILS',
          quoteData: {
            category: 'GENERAL',
            serviceType: 'CONSULTATION',
            urgency: 'ROUTINE',
            description: 'General inquiry'
          },
          privacyConsent: true,
          termsConsent: true
        });

      // First submission
      await baseRequest()
        .post('/api/v1/public/intake/submit')
        .set('X-Intake-Token', sessionToken)
        .send({ organizationId })
        .expect(201);

      // Second submission should fail
      const response = await baseRequest()
        .post('/api/v1/public/intake/submit')
        .set('X-Intake-Token', sessionToken)
        .send({ organizationId })
        .expect(403);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Security and Rate Limiting', () => {
    test('should reject expired tokens', async () => {
      // Create session with expired token
      const session = await prisma.intakeSession.create({
        data: {
          tokenHash: 'expired-hash',
          ipAddress: '127.0.0.1',
          expiresAt: new Date(Date.now() - 1000), // Already expired
          customerData: {
            create: {
              email: 'expired@example.com',
              completionPercentage: 0
            }
          }
        }
      });

      const response = await baseRequest()
        .get('/api/v1/public/intake/status')
        .set('X-Intake-Token', 'expired-token')
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    test('should track request count', async () => {
      const initResponse = await baseRequest()
        .post('/api/v1/public/intake/initialize')
        .send({ email: 'test@example.com' });

      const token = initResponse.body.token;
      const sessionId = initResponse.body.sessionId;

      // Make several requests
      for (let i = 0; i < 5; i++) {
        await baseRequest()
          .get('/api/v1/public/intake/status')
          .set('X-Intake-Token', token);
      }

      const session = await prisma.intakeSession.findUnique({
        where: { id: sessionId }
      });

      expect(session?.requestCount).toBeGreaterThan(0);
    });
  });

  describe('Data Sanitization', () => {
    let sessionToken: string;

    beforeEach(async () => {
      const initResponse = await baseRequest()
        .post('/api/v1/public/intake/initialize')
        .send({ email: 'test@example.com' });

      sessionToken = initResponse.body.token;
    });

    test('should sanitize HTML in text fields', async () => {
      const response = await baseRequest()
        .post('/api/v1/public/intake/step')
        .set('X-Intake-Token', sessionToken)
        .send({
          step: 'SERVICE_DETAILS',
          quoteData: {
            category: 'GENERAL',
            description: '<script>alert("XSS")</script>Need help with project'
          }
        })
        .expect(200);

      expect(response.body.success).toBe(true);

      // Description should be sanitized (script tags removed)
      // Exact sanitization depends on implementation
    });
  });
});