// @ts-nocheck
import supertest from 'supertest';
import { app } from '@/app';
import { PrismaClient } from '@prisma/client';
import { beforeAll, afterAll, beforeEach, describe, it, expect } from '@jest/globals';

const prisma = new PrismaClient();

describe('Enhanced Customer Lifecycle Automation Integration Tests', () => {
  let authToken: string;
  let organizationId: string;
  let userId: string;
  let customerId: string;
  let quoteId: string;

  beforeAll(async () => {
    // Clean up any existing test data
    await prisma.quote.deleteMany({
      where: { organizationId: { contains: 'test-lifecycle' } }
    });

    // Create test organization and user
    const organization = await prisma.organization.create({
      data: {
        name: 'Test Lifecycle Org',
        type: 'SINGLE_BUSINESS',
        domain: 'test-lifecycle.com',
        email: 'testorg@test.com',
        phone: '+1-555-0102',
        encryptionKey: 'test-encryption-key'
      }
    });
    organizationId = organization.id;

    const user = await prisma.user.create({
      data: {
        email: 'lifecycletest@test.com',
        firstName: 'Lifecycle',
        lastName: 'Tester',
        passwordHash: 'hashedpassword',
        role: 'ADMIN',
        organizationId,
        isActive: true,
      }
    });
    userId = user.id;

    // Create test customer
    const customer = await prisma.customer.create({
      data: {
        organizationId,
        type: 'PERSON',
        tier: 'SMALL_BUSINESS',
        status: 'PROSPECT',
        firstName: 'Test',
        lastName: 'Customer',
        email: 'customer@test.com',
        phone: '555-0123'
      }
    });
    customerId = customer.id;

    // Get auth token (mock for testing)
    authToken = 'test-lifecycle-token';
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.invoice.deleteMany({
      where: { organizationId }
    });
    await prisma.appointment.deleteMany({
      where: { organizationId }
    });
    await prisma.quote.deleteMany({
      where: { organizationId }
    });
    await prisma.customer.deleteMany({
      where: { organizationId }
    });
    await prisma.user.deleteMany({
      where: { organizationId }
    });
    await prisma.organization.deleteMany({
      where: { id: organizationId }
    });

    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Create a fresh quote for each test
    const quote = await prisma.quote.create({
      data: {
        organizationId,
        customerId,
        quotationNumber: `Q-${Date.now()}`,
        title: 'Test Quote for Lifecycle',
        description: 'Automated testing quote',
        status: 'SENT',
        totalAmount: 1500.00,
        currency: 'USD',
        validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        createdById: userId
      }
    });
    quoteId = quote.id;
  });

  describe('Quote Acceptance Automation', () => {
    it('should automatically generate invoice when quote is accepted', async () => {
      const response = await supertest(app)
        .post(`/api/v1/quotes/${quoteId}/accept`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          acceptanceNotes: 'Accepted for automated testing',
          autoGenerateInvoice: true
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('quote');
      expect(response.body).toHaveProperty('invoice');
      expect(response.body).toHaveProperty('suggestedAppointments');

      // Verify quote status updated
      expect(response.body.quote.status).toBe('ACCEPTED');
      expect(response.body.quote.acceptanceNotes).toBe('Accepted for automated testing');

      // Verify invoice was created
      expect(response.body.invoice).toBeTruthy();
      expect(response.body.invoice.quotationId).toBe(quoteId);
      expect(response.body.invoice.totalAmount).toBe(1500.00);
      expect(response.body.invoice.status).toBe('DRAFT');

      // Verify customer status was updated
      const updatedCustomer = await prisma.customer.findUnique({
        where: { id: customerId }
      });
      expect(updatedCustomer?.status).toBe('ACTIVE');
    });

    it('should suggest available appointment slots', async () => {
      const response = await supertest(app)
        .post(`/api/v1/quotes/${quoteId}/accept`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          autoGenerateInvoice: true,
          suggestAppointments: true
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('suggestedAppointments');
      expect(response.body.suggestedAppointments).toBeTruthy();
      expect(response.body.suggestedAppointments.slots.length).toBeGreaterThan(0);

      // Verify appointment slot format
      const firstSlot = response.body.suggestedAppointments.slots[0];
      expect(firstSlot).toHaveProperty('date');
      expect(firstSlot).toHaveProperty('startTime');
      expect(firstSlot).toHaveProperty('endTime');
      expect(firstSlot).toHaveProperty('available');
    });

    it('should handle quote acceptance without invoice generation', async () => {
      const response = await supertest(app)
        .post(`/api/v1/quotes/${quoteId}/accept`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          acceptanceNotes: 'Manual invoice creation',
          autoGenerateInvoice: false
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('quote');
      expect(response.body.quote.status).toBe('ACCEPTED');
      expect(response.body.invoice).toBeUndefined();
    });

    it('should prevent accepting expired quotes', async () => {
      // Create expired quote
      const expiredQuote = await prisma.quote.create({
        data: {
          organizationId,
          customerId,
          quotationNumber: `Q-EXP-${Date.now()}`,
          title: 'Expired Quote',
          status: 'SENT',
          totalAmount: 1000.00,
          currency: 'USD',
          validUntil: new Date(Date.now() - 24 * 60 * 60 * 1000), // Yesterday
          createdById: userId
        }
      });

      const response = await supertest(app)
        .post(`/api/v1/quotes/${expiredQuote.id}/accept`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          autoGenerateInvoice: true
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('expired');

      // Clean up
      await prisma.quote.delete({ where: { id: expiredQuote.id } });
    });
  });

  describe('Appointment Scheduling Integration', () => {
    let invoiceId: string;

    beforeEach(async () => {
      // Accept quote to create invoice first
      const acceptResponse = await supertest(app)
        .post(`/api/v1/quotes/${quoteId}/accept`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          autoGenerateInvoice: true
        });

      invoiceId = acceptResponse.body.invoice.id;
    });

    it('should schedule appointment from suggested slots', async () => {
      // Get suggested appointments first
      const suggestResponse = await supertest(app)
        .get('/api/v1/appointments/available-slots')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          duration: 15,
          daysAhead: 7
        });

      expect(suggestResponse.status).toBe(200);
      const availableSlot = suggestResponse.body.slots[0];

      // Schedule appointment
      const response = await supertest(app)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          customerId,
          quotationId: quoteId,
          invoiceId,
          title: 'Initial Consultation',
          description: 'Project kickoff meeting',
          scheduledAt: availableSlot.startTime,
          duration: 15,
          type: 'CONSULTATION'
        });

      expect(response.status).toBe(201);
      expect(response.body.customerId).toBe(customerId);
      expect(response.body.quotationId).toBe(quoteId);
      expect(response.body.invoiceId).toBe(invoiceId);
      expect(response.body.type).toBe('CONSULTATION');
      expect(response.body.status).toBe('SCHEDULED');
    });

    it('should prevent double-booking appointments', async () => {
      const appointmentTime = new Date(Date.now() + 24 * 60 * 60 * 1000); // Tomorrow

      // Create first appointment
      await supertest(app)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          customerId,
          title: 'First Appointment',
          scheduledAt: appointmentTime.toISOString(),
          duration: 60
        });

      // Try to create conflicting appointment
      const response = await supertest(app)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          customerId,
          title: 'Conflicting Appointment',
          scheduledAt: appointmentTime.toISOString(),
          duration: 30
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('conflict');
    });

    it('should get intelligent appointment suggestions', async () => {
      const response = await supertest(app)
        .get('/api/v1/appointments/smart-suggestions')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          customerId,
          quotationId: quoteId,
          preferredTimeSlots: JSON.stringify(['morning', 'afternoon']),
          duration: 30
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('suggestions');
      expect(response.body).toHaveProperty('recommendations');
      expect(response.body.suggestions.length).toBeGreaterThan(0);

      // Verify suggestion format
      const suggestion = response.body.suggestions[0];
      expect(suggestion).toHaveProperty('datetime');
      expect(suggestion).toHaveProperty('confidence');
      expect(suggestion).toHaveProperty('reasoning');
    });
  });

  describe('Invoice Generation Automation', () => {
    it('should create invoice with correct deposit calculation', async () => {
      const response = await supertest(app)
        .post(`/api/v1/quotes/${quoteId}/accept`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          autoGenerateInvoice: true,
          depositPercentage: 25
        });

      expect(response.status).toBe(200);
      const invoice = response.body.invoice;

      expect(invoice.totalAmount).toBe(1500.00);
      expect(invoice.depositAmount).toBe(375.00); // 25% of 1500
      expect(invoice.remainingAmount).toBe(1125.00);
      expect(invoice.requiresDeposit).toBe(true);
    });

    it('should copy quote items to invoice', async () => {
      // Add items to quote first
      await prisma.quoteItem.createMany({
        data: [
          {
            quoteId,
            description: 'Web Development',
            quantity: 40,
            unitPrice: 25.00,
            totalPrice: 1000.00
          },
          {
            quoteId,
            description: 'Design Work',
            quantity: 20,
            unitPrice: 25.00,
            totalPrice: 500.00
          }
        ]
      });

      const response = await supertest(app)
        .post(`/api/v1/quotes/${quoteId}/accept`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          autoGenerateInvoice: true
        });

      expect(response.status).toBe(200);
      const invoiceId = response.body.invoice.id;

      // Verify invoice items were created
      const invoiceItems = await prisma.invoiceItem.findMany({
        where: { invoiceId }
      });

      expect(invoiceItems.length).toBe(2);
      expect(invoiceItems[0].description).toBe('Web Development');
      expect(invoiceItems[1].description).toBe('Design Work');
    });

    it('should set appropriate payment terms', async () => {
      const response = await supertest(app)
        .post(`/api/v1/quotes/${quoteId}/accept`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          autoGenerateInvoice: true,
          paymentTerms: 'Net 30'
        });

      expect(response.status).toBe(200);
      const invoice = response.body.invoice;

      expect(invoice.paymentTerms).toBe('Net 30');

      const dueDate = new Date(invoice.dueDate);
      const issueDate = new Date(invoice.issueDate);
      const daysDiff = Math.ceil((dueDate.getTime() - issueDate.getTime()) / (1000 * 60 * 60 * 24));

      expect(daysDiff).toBe(30);
    });
  });

  describe('Customer Status Progression', () => {
    it('should track customer journey through lifecycle stages', async () => {
      // Start as PROSPECT
      let customer = await prisma.customer.findUnique({
        where: { id: customerId }
      });
      expect(customer?.status).toBe('PROSPECT');

      // Accept quote - should become ACTIVE
      await supertest(app)
        .post(`/api/v1/quotes/${quoteId}/accept`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          autoGenerateInvoice: true
        });

      customer = await prisma.customer.findUnique({
        where: { id: customerId }
      });
      expect(customer?.status).toBe('ACTIVE');

      // Complete project - should track completion
      const invoiceId = (await prisma.invoice.findFirst({
        where: { quotationId: quoteId }
      }))?.id;

      // Mark invoice as paid
      await prisma.invoice.update({
        where: { id: invoiceId },
        data: { status: 'PAID' }
      });

      // Customer should still be ACTIVE for future projects
      customer = await prisma.customer.findUnique({
        where: { id: customerId }
      });
      expect(customer?.status).toBe('ACTIVE');
    });

    it('should handle customer tier upgrades based on project value', async () => {
      // Create high-value quote
      const highValueQuote = await prisma.quote.create({
        data: {
          organizationId,
          customerId,
          quotationNumber: `Q-HV-${Date.now()}`,
          title: 'High Value Project',
          status: 'SENT',
          totalAmount: 15000.00, // High value
          currency: 'USD',
          validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          createdById: userId
        }
      });

      const response = await supertest(app)
        .post(`/api/v1/quotes/${highValueQuote.id}/accept`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          autoGenerateInvoice: true,
          autoUpgradeTier: true
        });

      expect(response.status).toBe(200);

      // Customer tier should be upgraded
      const customer = await prisma.customer.findUnique({
        where: { id: customerId }
      });
      expect(customer?.tier).toBe('ENTERPRISE');

      // Clean up
      await prisma.quote.delete({ where: { id: highValueQuote.id } });
    });
  });

  describe('Workflow Automation Triggers', () => {
    it('should trigger email notifications on quote acceptance', async () => {
      const response = await supertest(app)
        .post(`/api/v1/quotes/${quoteId}/accept`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          autoGenerateInvoice: true,
          sendNotifications: true
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('notifications');
      expect(response.body.notifications).toHaveProperty('emailSent');
      expect(response.body.notifications.emailSent).toBe(true);
    });

    it('should create project automatically for accepted quotes', async () => {
      const response = await supertest(app)
        .post(`/api/v1/quotes/${quoteId}/accept`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          autoGenerateInvoice: true,
          createProject: true,
          projectDetails: {
            name: 'Automated Project Creation',
            description: 'Project created from quote acceptance',
            estimatedStartDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
          }
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('project');
      expect(response.body.project.name).toBe('Automated Project Creation');
      expect(response.body.project.status).toBe('QUOTED');
    });

    it('should schedule follow-up tasks', async () => {
      const response = await supertest(app)
        .post(`/api/v1/quotes/${quoteId}/accept`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          autoGenerateInvoice: true,
          scheduleFollowUps: true,
          followUpTasks: [
            {
              title: 'Project kickoff call',
              dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
              priority: 'HIGH'
            },
            {
              title: 'Send welcome package',
              dueDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString(),
              priority: 'MEDIUM'
            }
          ]
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('followUpTasks');
      expect(response.body.followUpTasks.length).toBe(2);
      expect(response.body.followUpTasks[0].title).toBe('Project kickoff call');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle quote acceptance with invalid customer', async () => {
      // Create quote with non-existent customer
      const invalidQuote = await prisma.quote.create({
        data: {
          organizationId,
          customerId: 'invalid-customer-id',
          quotationNumber: `Q-INV-${Date.now()}`,
          title: 'Invalid Quote',
          status: 'SENT',
          totalAmount: 1000.00,
          currency: 'USD',
          validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          createdById: userId
        }
      });

      const response = await supertest(app)
        .post(`/api/v1/quotes/${invalidQuote.id}/accept`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          autoGenerateInvoice: true
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Customer');

      // Clean up
      await prisma.quote.delete({ where: { id: invalidQuote.id } });
    });

    it('should handle already accepted quotes', async () => {
      // Accept quote first
      await supertest(app)
        .post(`/api/v1/quotes/${quoteId}/accept`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          autoGenerateInvoice: true
        });

      // Try to accept again
      const response = await supertest(app)
        .post(`/api/v1/quotes/${quoteId}/accept`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          autoGenerateInvoice: true
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('already accepted');
    });

    it('should rollback changes on automation failure', async () => {
      // Simulate automation failure by providing invalid data
      const response = await supertest(app)
        .post(`/api/v1/quotes/${quoteId}/accept`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          autoGenerateInvoice: true,
          invalidField: 'this should cause validation error'
        });

      // Should handle gracefully without partial state changes
      expect(response.status).toBeLessThan(500);

      // Quote should not be marked as accepted if automation failed
      const quote = await prisma.quote.findUnique({
        where: { id: quoteId }
      });

      if (response.status >= 400) {
        expect(quote?.status).toBe('SENT'); // Should remain unchanged
      }
    });
  });
});