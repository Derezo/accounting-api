import { describe, test, expect, beforeEach } from '@jest/globals';
import { prisma, baseRequest } from './setup';
import { createTestContext } from './test-utils';
import crypto from 'crypto';

describe('Intake Form V2 Integration Tests', () => {
  let testContext: any;
  let organizationId: string;
  let adminToken: string;
  let templateId: string;
  let sessionToken: string;

  beforeEach(async () => {
    testContext = await createTestContext(prisma);
    organizationId = testContext.organization.id;
    adminToken = testContext.adminToken;
  });

  describe('Template Management', () => {
    test('should create a new intake form template with steps', async () => {
      const response = await baseRequest()
        .post(`/api/v2/organizations/${organizationId}/intake-templates`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'HVAC Service Request',
          description: 'Template for HVAC service intake',
          industry: 'HVAC',
          version: '1.0.0',
          config: {
            theme: { primaryColor: '#0066cc' },
            layout: 'multi-step',
            notifications: { email: true }
          },
          completionRules: {
            requiredFields: ['email', 'service_type', 'property_address']
          },
          steps: [
            {
              stepKey: 'contact_info',
              name: 'Contact Information',
              description: 'Basic contact details',
              sortOrder: 1,
              isRequired: true,
              layout: 'SINGLE_COLUMN'
            },
            {
              stepKey: 'service_details',
              name: 'Service Details',
              description: 'Tell us about your HVAC needs',
              sortOrder: 2,
              isRequired: true,
              layout: 'SINGLE_COLUMN'
            }
          ]
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.template).toHaveProperty('id');
      expect(response.body.template.name).toBe('HVAC Service Request');
      expect(response.body.template.industry).toBe('HVAC');
      expect(response.body.steps).toHaveLength(2);

      templateId = response.body.template.id;
    });

    test('should add fields to a template step', async () => {
      // First create template
      const templateResponse = await baseRequest()
        .post(`/api/v2/organizations/${organizationId}/intake-templates`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Test Template',
          industry: 'GENERAL',
          config: {},
          completionRules: {},
          steps: [
            {
              stepKey: 'step1',
              name: 'Step 1',
              sortOrder: 1,
              isRequired: true
            }
          ]
        })
        .expect(201);

      const createdTemplateId = templateResponse.body.template.id;
      const stepId = templateResponse.body.steps[0].id;

      // Add fields to the step
      const fieldResponse = await baseRequest()
        .post(`/api/v2/organizations/${organizationId}/intake-templates/${createdTemplateId}/fields`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          stepId,
          fieldKey: 'customer_email',
          label: 'Email Address',
          fieldType: 'email',
          dataType: 'string',
          isRequired: true,
          sortOrder: 1,
          width: 'FULL',
          validationRules: {
            pattern: '^[^@]+@[^@]+\\.[^@]+$'
          },
          mappingPath: 'customer.email'
        })
        .expect(201);

      expect(fieldResponse.body.success).toBe(true);
      expect(fieldResponse.body.field.fieldKey).toBe('customer_email');
      expect(fieldResponse.body.field.fieldType).toBe('email');
      expect(fieldResponse.body.field.isRequired).toBe(true);
    });

    test('should list all templates for organization', async () => {
      // Create a template first
      await baseRequest()
        .post(`/api/v2/organizations/${organizationId}/intake-templates`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'List Test Template',
          industry: 'PLUMBING',
          config: {},
          completionRules: {},
          steps: []
        })
        .expect(201);

      // List templates
      const response = await baseRequest()
        .get(`/api/v2/organizations/${organizationId}/intake-templates`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.templates).toBeInstanceOf(Array);
      expect(response.body.templates.length).toBeGreaterThan(0);
    });

    test('should prevent duplicate template names', async () => {
      const templateData = {
        name: 'Duplicate Test',
        industry: 'GENERAL',
        config: {},
        completionRules: {},
        steps: []
      };

      // Create first template
      await baseRequest()
        .post(`/api/v2/organizations/${organizationId}/intake-templates`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(templateData)
        .expect(201);

      // Try to create duplicate
      const response = await baseRequest()
        .post(`/api/v2/organizations/${organizationId}/intake-templates`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(templateData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('already exists');
    });
  });

  describe('Session Management', () => {
    beforeEach(async () => {
      // Create a template for session tests
      const response = await baseRequest()
        .post(`/api/v2/organizations/${organizationId}/intake-templates`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Session Test Template',
          industry: 'HVAC',
          config: {},
          completionRules: {},
          steps: [
            {
              stepKey: 'contact',
              name: 'Contact',
              sortOrder: 1,
              isRequired: true
            }
          ]
        })
        .expect(201);

      templateId = response.body.template.id;

      // Add a field
      const stepId = response.body.steps[0].id;
      await baseRequest()
        .post(`/api/v2/organizations/${organizationId}/intake-templates/${templateId}/fields`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          stepId,
          fieldKey: 'email',
          label: 'Email',
          fieldType: 'email',
          dataType: 'string',
          isRequired: true,
          sortOrder: 1,
          mappingPath: 'customer.email'
        })
        .expect(201);
    });

    test('should create a new anonymous session', async () => {
      const response = await baseRequest()
        .post('/api/v2/public/intake-sessions')
        .send({
          templateId,
          metadata: {
            source: 'website',
            campaign: 'spring_promo'
          }
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.session).toHaveProperty('id');
      expect(response.body.session).toHaveProperty('token');
      expect(response.body.session.status).toBe('ACTIVE');
      expect(response.body.session.currentStepKey).toBe('contact');

      sessionToken = response.body.session.token;
    });

    test('should retrieve session by token', async () => {
      // Create session first
      const createResponse = await baseRequest()
        .post('/api/v2/public/intake-sessions')
        .send({ templateId })
        .expect(201);

      const token = createResponse.body.session.token;

      // Retrieve session
      const response = await baseRequest()
        .get(`/api/v2/public/intake-sessions/${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.session.id).toBe(createResponse.body.session.id);
      expect(response.body.session.templateId).toBe(templateId);
    });

    test('should update form data in session', async () => {
      // Create session
      const createResponse = await baseRequest()
        .post('/api/v2/public/intake-sessions')
        .send({ templateId })
        .expect(201);

      const token = createResponse.body.session.token;

      // Update form data
      const response = await baseRequest()
        .patch(`/api/v2/public/intake-sessions/${token}/data`)
        .send({
          formData: {
            email: 'customer@example.com',
            name: 'John Doe',
            phone: '555-0123'
          }
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.formData.data.email).toBe('customer@example.com');
    });

    test('should advance to next step', async () => {
      // Create template with multiple steps
      const multiStepTemplate = await baseRequest()
        .post(`/api/v2/organizations/${organizationId}/intake-templates`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Multi-Step Template',
          industry: 'GENERAL',
          config: {},
          completionRules: {},
          steps: [
            { stepKey: 'step1', name: 'Step 1', sortOrder: 1, isRequired: true },
            { stepKey: 'step2', name: 'Step 2', sortOrder: 2, isRequired: true }
          ]
        })
        .expect(201);

      const multiTemplateId = multiStepTemplate.body.template.id;

      // Create session
      const sessionResponse = await baseRequest()
        .post('/api/v2/public/intake-sessions')
        .send({ templateId: multiTemplateId })
        .expect(201);

      const token = sessionResponse.body.session.token;

      // Advance to next step
      const response = await baseRequest()
        .post(`/api/v2/public/intake-sessions/${token}/advance`)
        .send({ toStepKey: 'step2' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.session.currentStepKey).toBe('step2');
      expect(response.body.session.visitedSteps).toContain('step1');
    });

    test('should validate required fields on submit', async () => {
      // Create session
      const sessionResponse = await baseRequest()
        .post('/api/v2/public/intake-sessions')
        .send({ templateId })
        .expect(201);

      const token = sessionResponse.body.session.token;

      // Try to submit without required field
      const response = await baseRequest()
        .post(`/api/v2/public/intake-sessions/${token}/submit`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.errors).toBeInstanceOf(Array);
      expect(response.body.errors.some((e: any) => e.field === 'email')).toBe(true);
    });

    test('should complete session with valid data', async () => {
      // Create session
      const sessionResponse = await baseRequest()
        .post('/api/v2/public/intake-sessions')
        .send({ templateId })
        .expect(201);

      const token = sessionResponse.body.session.token;

      // Update with valid data
      await baseRequest()
        .patch(`/api/v2/public/intake-sessions/${token}/data`)
        .send({
          formData: {
            email: 'valid@example.com'
          }
        })
        .expect(200);

      // Submit session
      const response = await baseRequest()
        .post(`/api/v2/public/intake-sessions/${token}/submit`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.session.status).toBe('COMPLETED');
    });

    test('should reject expired session', async () => {
      // Create session
      const sessionResponse = await baseRequest()
        .post('/api/v2/public/intake-sessions')
        .send({ templateId })
        .expect(201);

      const token = sessionResponse.body.session.token;

      // Manually expire the session
      await prisma.intakeFormSession.update({
        where: { tokenHash: crypto.createHash('sha256').update(token).digest('hex') },
        data: { expiresAt: new Date(Date.now() - 1000) }
      });

      // Try to access expired session
      const response = await baseRequest()
        .get(`/api/v2/public/intake-sessions/${token}`)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('expired');
    });

    test('should track bot detection metrics', async () => {
      // Create session with suspicious behavior
      const response = await baseRequest()
        .post('/api/v2/public/intake-sessions')
        .send({
          templateId,
          honeypot: 'bot_value' // This should trigger honeypot
        })
        .expect(201);

      const token = response.body.session.token;

      // Retrieve session and check suspicion score
      const sessionData = await prisma.intakeFormSession.findFirst({
        where: { tokenHash: crypto.createHash('sha256').update(token).digest('hex') }
      });

      expect(sessionData).not.toBeNull();
      expect(sessionData!.honeypotTriggered).toBe(true);
    });
  });

  describe('Security & Rate Limiting', () => {
    test('should rate limit session creation requests', async () => {
      // Create template
      const templateResponse = await baseRequest()
        .post(`/api/v2/organizations/${organizationId}/intake-templates`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Rate Limit Test',
          industry: 'GENERAL',
          config: {},
          completionRules: {},
          steps: []
        })
        .expect(201);

      const testTemplateId = templateResponse.body.template.id;

      // Make multiple rapid requests
      const requests = Array(15).fill(null).map(() =>
        baseRequest()
          .post('/api/v2/public/intake-sessions')
          .send({ templateId: testTemplateId })
      );

      const responses = await Promise.all(requests);
      const rateLimited = responses.filter(r => r.status === 429);

      expect(rateLimited.length).toBeGreaterThan(0);
    });

    test('should enforce multi-tenant isolation', async () => {
      // Create second organization
      const org2Context = await createTestContext(prisma);
      const org2Id = org2Context.organization.id;
      const org2Token = org2Context.adminToken;

      // Create template in org1
      const org1Template = await baseRequest()
        .post(`/api/v2/organizations/${organizationId}/intake-templates`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Org1 Template',
          industry: 'GENERAL',
          config: {},
          completionRules: {},
          steps: []
        })
        .expect(201);

      const org1TemplateId = org1Template.body.template.id;

      // Try to access org1's template from org2
      const response = await baseRequest()
        .get(`/api/v2/organizations/${org2Id}/intake-templates/${org1TemplateId}`)
        .set('Authorization', `Bearer ${org2Token}`)
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });
});
