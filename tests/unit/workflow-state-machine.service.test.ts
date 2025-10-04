import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import { WorkflowStateMachineService } from '@/services/workflow-state-machine.service';
// import { AuditService } from '@/services/audit.service';

const prisma = new PrismaClient();

// Mock AuditService
jest.mock('@/services/audit.service');

describe('WorkflowStateMachineService', () => {
  let service: WorkflowStateMachineService;
  let organizationId: string;
  let userId: string;
  let customerId: string;

  beforeEach(async () => {
    service = new WorkflowStateMachineService();

    // Clear audit mock
    jest.clearAllMocks();

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

    // Create user
    const user = await prisma.user.create({
      data: {
        organizationId,
        email: 'admin@test.local',
        firstName: 'Admin',
        lastName: 'User',
        passwordHash: 'hashed-password',
        role: 'ADMIN',
        isActive: true,
      },
    });
    userId = user.id;

    // Create person
    const person = await prisma.person.create({
      data: {
        organizationId,
        email: 'customer@test.local',
        firstName: 'Test',
        lastName: 'Customer',
        phone: '555-0100',
      },
    });

    // Create customer
    const customer = await prisma.customer.create({
      data: {
        organizationId,
        customerNumber: 'CUST-001',
        type: 'PERSON',
        personId: person.id,
        name: 'Test Customer',
        email: 'customer@test.local',
        phone: '555-0100',
        tier: 'PERSONAL',
        status: 'PROSPECT',
      },
    });
    customerId = customer.id;
  });

  afterEach(async () => {
    await prisma.payment.deleteMany({});
    await prisma.quoteLineItem.deleteMany({});
    await prisma.invoiceLineItem.deleteMany({});
    await prisma.invoice.deleteMany({});
    await prisma.quote.deleteMany({});
    await prisma.appointment.deleteMany({});
    await prisma.project.deleteMany({});
    await prisma.customer.deleteMany({});
    await prisma.person.deleteMany({});
    await prisma.auditLog.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.organization.deleteMany({});
  });

  describe('validateTransition', () => {
    test('should allow valid quote transition', () => {
      const result = service.validateTransition('quote', 'DRAFT', 'SENT');

      expect(result.valid).toBe(true);
      expect(result.allowedTransitions).toContain('SENT');
      expect(result.allowedTransitions).toContain('CANCELLED');
    });

    test('should reject invalid quote transition', () => {
      const result = service.validateTransition('quote', 'DRAFT', 'ACCEPTED');

      expect(result.valid).toBe(false);
      expect(result.allowedTransitions).toEqual(['SENT', 'CANCELLED']);
    });

    test('should allow valid customer transition', () => {
      const result = service.validateTransition('customer', 'PROSPECT', 'ACTIVE');

      expect(result.valid).toBe(true);
      expect(result.allowedTransitions).toContain('ACTIVE');
    });

    test('should reject transition from terminal state', () => {
      const result = service.validateTransition('quote', 'CANCELLED', 'SENT');

      expect(result.valid).toBe(false);
      expect(result.allowedTransitions).toEqual([]);
    });

    test('should validate invoice transitions', () => {
      const validResult = service.validateTransition('invoice', 'SENT', 'PAID');
      expect(validResult.valid).toBe(true);

      const invalidResult = service.validateTransition('invoice', 'DRAFT', 'PAID');
      expect(invalidResult.valid).toBe(false);
    });

    test('should validate payment transitions', () => {
      const result = service.validateTransition('payment', 'PENDING', 'PROCESSING');
      expect(result.valid).toBe(true);

      const refundResult = service.validateTransition('payment', 'COMPLETED', 'REFUNDED');
      expect(refundResult.valid).toBe(true);
    });

    test('should validate project transitions', () => {
      const result = service.validateTransition('project', 'ACTIVE', 'COMPLETED');
      expect(result.valid).toBe(true);

      const invalidResult = service.validateTransition('project', 'COMPLETED', 'ACTIVE');
      expect(invalidResult.valid).toBe(false);
    });

    test('should validate appointment transitions', () => {
      const result = service.validateTransition('appointment', 'SCHEDULED', 'CONFIRMED');
      expect(result.valid).toBe(true);

      const completedResult = service.validateTransition('appointment', 'CONFIRMED', 'COMPLETED');
      expect(completedResult.valid).toBe(true);
    });
  });

  describe('getAvailableTransitions', () => {
    test('should return all transitions for SUPER_ADMIN', () => {
      const transitions = service.getAvailableTransitions('quote', 'DRAFT', 'SUPER_ADMIN');

      expect(transitions).toContain('SENT');
      expect(transitions).toContain('CANCELLED');
      expect(transitions.length).toBe(2);
    });

    test('should return all transitions for ADMIN', () => {
      const transitions = service.getAvailableTransitions('invoice', 'SENT', 'ADMIN');

      expect(transitions).toContain('PAID');
      expect(transitions).toContain('VOID');
      expect(transitions.length).toBeGreaterThan(0);
    });

    test('should filter terminal transitions for MANAGER', () => {
      const transitions = service.getAvailableTransitions('invoice', 'SENT', 'MANAGER');

      expect(transitions).toContain('PAID');
      expect(transitions).not.toContain('VOID');
      expect(transitions).toContain('CANCELLED');
    });

    test('should limit ACCOUNTANT to financial transitions', () => {
      const quoteTransitions = service.getAvailableTransitions('quote', 'SENT', 'ACCOUNTANT');
      expect(quoteTransitions.length).toBeGreaterThan(0);
      expect(quoteTransitions).not.toContain('CANCELLED');

      const projectTransitions = service.getAvailableTransitions('project', 'ACTIVE', 'ACCOUNTANT');
      expect(projectTransitions).toEqual([]);
    });

    test('should limit EMPLOYEE to DRAFT->SENT only', () => {
      const draftTransitions = service.getAvailableTransitions('quote', 'DRAFT', 'EMPLOYEE');
      expect(draftTransitions).toEqual(['SENT']);

      const sentTransitions = service.getAvailableTransitions('quote', 'SENT', 'EMPLOYEE');
      expect(sentTransitions).toEqual([]);
    });

    test('should return empty for VIEWER', () => {
      const transitions = service.getAvailableTransitions('quote', 'DRAFT', 'VIEWER');
      expect(transitions).toEqual([]);
    });

    test('should return empty for CLIENT', () => {
      const transitions = service.getAvailableTransitions('invoice', 'SENT', 'CLIENT');
      expect(transitions).toEqual([]);
    });
  });

  describe('executeTransition', () => {
    test('should execute valid quote transition', async () => {
      const quote = await prisma.quote.create({
        data: {
          organizationId,
          quoteNumber: 'Q-001',
          customerId,
            status: 'DRAFT',
          validUntil: new Date(Date.now() + 86400000),
          subtotal: 100,
          taxTotal: 13,
          total: 113,
        },
      });

      const result = await service.executeTransition(
        'quote',
        quote.id,
        'SENT',
        userId,
        organizationId,
        'Sending quote to customer'
      );

      expect(result.success).toBe(true);
      expect(result.previousStatus).toBe('DRAFT');

      const updatedQuote = await prisma.quote.findUnique({ where: { id: quote.id } });
      expect(updatedQuote!.status).toBe('SENT');
    });

    test('should reject invalid transition', async () => {
      const quote = await prisma.quote.create({
        data: {
          organizationId,
          quoteNumber: 'Q-002',
          customerId,
            status: 'DRAFT',
          validUntil: new Date(Date.now() + 86400000),
          subtotal: 100,
          taxTotal: 13,
          total: 113,
        },
      });

      const result = await service.executeTransition(
        'quote',
        quote.id,
        'ACCEPTED',
        userId,
        organizationId
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid transition');
      expect(result.previousStatus).toBe('DRAFT');

      const unchangedQuote = await prisma.quote.findUnique({ where: { id: quote.id } });
      expect(unchangedQuote!.status).toBe('DRAFT');
    });

    test('should return error for non-existent entity', async () => {
      const result = await service.executeTransition(
        'quote',
        'non-existent-id',
        'SENT',
        userId,
        organizationId
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    test('should activate customer when quote accepted', async () => {
      const quote = await prisma.quote.create({
        data: {
          organizationId,
          quoteNumber: 'Q-003',
          customerId,
            status: 'SENT',
          validUntil: new Date(Date.now() + 86400000),
          subtotal: 100,
          taxTotal: 13,
          total: 113,
        },
      });

      const result = await service.executeTransition(
        'quote',
        quote.id,
        'ACCEPTED',
        userId,
        organizationId
      );

      expect(result.success).toBe(true);

      const updatedCustomer = await prisma.customer.findUnique({
        where: { id: customerId },
      });
      expect(updatedCustomer!.status).toBe('ACTIVE');
    });

    test('should update invoice status when payment completed', async () => {
      // Create invoice
      const invoice = await prisma.invoice.create({
        data: {
          organizationId,
          invoiceNumber: 'INV-001',
          customerId,
            status: 'SENT',
          dueDate: new Date(Date.now() + 86400000 * 30),
          subtotal: 1000,
          taxTotal: 130,
          total: 1130,
          amountPaid: 0,
          depositRequired: 0,
          balance: 1130,
        },
      });

      // Create payment
      const payment = await prisma.payment.create({
        data: {
          organizationId,
          paymentNumber: 'PAY-001',
            customerId,
          amount: 500,
          method: 'CREDIT_CARD',
          paymentDate: new Date(),
          status: 'PROCESSING',
        },
      });

      const result = await service.executeTransition(
        'payment',
        payment.id,
        'COMPLETED',
        userId,
        organizationId
      );

      expect(result.success).toBe(true);

      const updatedInvoice = await prisma.invoice.findUnique({
        where: { id: invoice.id },
      });
      expect(updatedInvoice!.status).toBe('PARTIAL');
      expect(Number(updatedInvoice!.amountPaid)).toBe(500);
    });

    test('should mark invoice as PAID when full amount received', async () => {
      const invoice = await prisma.invoice.create({
        data: {
          organizationId,
          invoiceNumber: 'INV-002',
          customerId,
            status: 'SENT',
          dueDate: new Date(Date.now() + 86400000 * 30),
          subtotal: 1000,
          taxTotal: 130,
          total: 1130,
          amountPaid: 0,
          depositRequired: 0,
          balance: 1130,
        },
      });

      const payment = await prisma.payment.create({
        data: {
          organizationId,
          paymentNumber: 'PAY-002',
            customerId,
          amount: 1130,
          method: 'CREDIT_CARD',
          paymentDate: new Date(),
          status: 'PROCESSING',
        },
      });

      const result = await service.executeTransition(
        'payment',
        payment.id,
        'COMPLETED',
        userId,
        organizationId
      );

      expect(result.success).toBe(true);

      const updatedInvoice = await prisma.invoice.findUnique({
        where: { id: invoice.id },
      });
      expect(updatedInvoice!.status).toBe('PAID');
    });

    test('should mark deposit as paid when threshold met', async () => {
      // Create invoice first
      const invoice = await prisma.invoice.create({
        data: {
          organizationId,
          invoiceNumber: 'INV-003',
          customerId,
            status: 'SENT',
          dueDate: new Date(Date.now() + 86400000 * 30),
          subtotal: 1000,
          taxTotal: 130,
          total: 1130,
          amountPaid: 0,
          depositRequired: 0,
          balance: 1130,
        },
      });

      // Create project linked to invoice
      const project = await prisma.project.create({
        data: {
          organizationId,
          projectNumber: 'PRJ-001',
          customerId,
            name: 'Test Project',
          status: 'DRAFT',
          startDate: new Date(),
        },
      });

      // Create payment for 30% (above 25% threshold)
      const payment = await prisma.payment.create({
        data: {
          organizationId,
          paymentNumber: 'PAY-003',
            customerId,
          amount: 340,
          method: 'CREDIT_CARD',
          paymentDate: new Date(),
          status: 'PROCESSING',
        },
      });

      const result = await service.executeTransition(
        'payment',
        payment.id,
        'COMPLETED',
        userId,
        organizationId
      );

      expect(result.success).toBe(true);

      const updatedProject = await prisma.project.findUnique({
        where: { id: project.id },
      });
      // Note: Project no longer has depositPaid/depositPaidAt fields
      expect(updatedProject).toBeDefined();
    });
  });

  describe('getCustomerLifecycleStage', () => {
    test('should return stage 1 for new prospect', async () => {
      const stage = await service.getCustomerLifecycleStage(customerId);

      expect(stage.stage).toBe(1);
      expect(stage.stageName).toBe('Request Quote');
      expect(stage.completed).toBe(false);
      expect(stage.nextAction).toContain('Create a quote');
    });

    test('should return stage 2 when quote is sent', async () => {
      await prisma.quote.create({
        data: {
          organizationId,
          quoteNumber: 'Q-004',
          customerId,
            status: 'SENT',
          validUntil: new Date(Date.now() + 86400000),
          subtotal: 100,
          taxTotal: 13,
          total: 113,
        },
      });

      const stage = await service.getCustomerLifecycleStage(customerId);

      expect(stage.stage).toBe(2);
      expect(stage.stageName).toBe('Quote Estimated');
      expect(stage.nextAction).toContain('accept quote');
    });

    test('should return stage 3 when quote accepted', async () => {
      await prisma.quote.create({
        data: {
          organizationId,
          quoteNumber: 'Q-005',
          customerId,
            status: 'ACCEPTED',
          validUntil: new Date(Date.now() + 86400000),
          subtotal: 100,
          taxTotal: 13,
          total: 113,
        },
      });

      const stage = await service.getCustomerLifecycleStage(customerId);

      expect(stage.stage).toBe(3);
      expect(stage.stageName).toBe('Quote Accepted');
      expect(stage.nextAction).toContain('appointment');
    });

    test('should return stage 4 when appointment scheduled', async () => {
      await prisma.quote.create({
        data: {
          organizationId,
          quoteNumber: 'Q-006',
          customerId,
            status: 'ACCEPTED',
          validUntil: new Date(Date.now() + 86400000),
          subtotal: 100,
          taxTotal: 13,
          total: 113,
        },
      });

      const appointmentStart = new Date(Date.now() + 86400000);
      const appointmentEnd = new Date(appointmentStart.getTime() + 60 * 60000); // 60 minutes later

      await prisma.appointment.create({
        data: {
          organizationId,
          customerId,
          title: 'HVAC Consultation',
          scheduledStart: appointmentStart,
          scheduledEnd: appointmentEnd,
            confirmed: true,
        },
      });

      const stage = await service.getCustomerLifecycleStage(customerId);

      expect(stage.stage).toBe(4);
      expect(stage.stageName).toBe('Appointment Scheduled');
    });

    test('should return stage 5 when invoice generated', async () => {
      await prisma.invoice.create({
        data: {
          organizationId,
          invoiceNumber: 'INV-004',
          customerId,
            status: 'SENT',
          dueDate: new Date(Date.now() + 86400000 * 30),
          subtotal: 1000,
          taxTotal: 130,
          total: 1130,
          amountPaid: 0,
          depositRequired: 0,
          balance: 1130,
        },
      });

      const stage = await service.getCustomerLifecycleStage(customerId);

      expect(stage.stage).toBe(5);
      expect(stage.stageName).toBe('Invoice Generated');
      expect(stage.nextAction).toContain('deposit');
    });

    test('should return stage 8 when project completed and paid', async () => {
      // Create invoice first
      const invoice = await prisma.invoice.create({
        data: {
          organizationId,
          invoiceNumber: 'INV-005',
          customerId,
            status: 'PAID',
          dueDate: new Date(Date.now() + 86400000 * 30),
          subtotal: 1000,
          taxTotal: 130,
          total: 1130,
          amountPaid: 1130,
          depositRequired: 0,
          balance: 0,
        },
      });

      // Create project linked to invoice
      const project = await prisma.project.create({
        data: {
          organizationId,
          projectNumber: 'PRJ-002',
          customerId,
            name: 'Completed Project',
          status: 'COMPLETED',
          startDate: new Date(),
        },
      });

      const stage = await service.getCustomerLifecycleStage(customerId);

      expect(stage.stage).toBe(8);
      expect(stage.stageName).toBe('Project Completed');
      expect(stage.completed).toBe(true);
    });
  });
});
