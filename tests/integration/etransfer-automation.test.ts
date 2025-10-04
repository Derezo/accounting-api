import request from 'supertest';
import app from '../../src/app';
import { prisma } from '../../src/config/database';
import { createTestOrganization, createTestUser, createTestCustomer, createTestInvoice, generateAuthToken } from './test-utils';
import { eTransferAutoMatchService } from '../../src/services/etransfer-auto-match.service';
import { PaymentStatus } from '../../src/types/enums';

/**
 * E-Transfer Automation Integration Tests
 * Tests email parsing, auto-matching, and admin review workflows
 */
describe('E-Transfer Automation', () => {
  let organizationId: string;
  let adminToken: string;
  let customerId: string;
  let invoiceId: string;

  beforeAll(async () => {
    // Create test organization
    const org = await createTestOrganization({
      name: 'E-Transfer Test Org',
      email: 'admin@etransfertest.com'
    });
    organizationId = org.id;

    // Create admin user
    const admin = await createTestUser({
      organizationId,
      email: 'admin@etransfertest.com',
      role: 'ADMIN'
    });
    adminToken = generateAuthToken(admin.id, organizationId);

    // Create test customer
    const customer = await createTestCustomer({
      organizationId,
      email: 'customer@test.com',
      firstName: 'John',
      lastName: 'Smith'
    });
    customerId = customer.id;

    // Create test invoice
    const invoice = await createTestInvoice({
      organizationId,
      customerId,
      amount: 500.00,
      status: 'SENT'
    });
    invoiceId = invoice.id;
  });

  afterAll(async () => {
    // Cleanup
    await prisma.payment.deleteMany({ where: { organizationId } });
    await prisma.invoice.deleteMany({ where: { organizationId } });
    await prisma.customer.deleteMany({ where: { organizationId } });
    await prisma.user.deleteMany({ where: { organizationId } });
    await prisma.organization.delete({ where: { id: organizationId } });
  });

  describe('Auto-Matching Algorithm', () => {
    it('should match by exact reference number', async () => {
      const invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId },
        include: { customer: { include: { person: true, business: true } } }
      });

      const matchResult = await eTransferAutoMatchService.matchTransfer(organizationId, {
        senderName: 'John Smith',
        senderEmail: 'customer@test.com',
        amount: 500.00,
        referenceNumber: invoice!.invoiceNumber,
        transferDate: new Date(),
        messageId: 'test-msg-001'
      });

      expect(matchResult.confidence).toBe('HIGH');
      expect(matchResult.score).toBeGreaterThanOrEqual(90);
      expect(matchResult.invoice?.id).toBe(invoiceId);
      expect(matchResult.requiresReview).toBe(false);
    });

    it('should match by exact amount', async () => {
      const matchResult = await eTransferAutoMatchService.matchTransfer(organizationId, {
        senderName: 'John Smith',
        senderEmail: 'customer@test.com',
        amount: 500.00,
        referenceNumber: '',
        transferDate: new Date(),
        messageId: 'test-msg-002'
      });

      expect(matchResult.invoice?.id).toBe(invoiceId);
      expect(matchResult.score).toBeGreaterThan(0);
    });

    it('should match by customer name', async () => {
      const matchResult = await eTransferAutoMatchService.matchTransfer(organizationId, {
        senderName: 'John Smith',
        senderEmail: 'different@email.com',
        amount: 500.00,
        referenceNumber: '',
        transferDate: new Date(),
        messageId: 'test-msg-003'
      });

      expect(matchResult.invoice?.id).toBe(invoiceId);
    });

    it('should match by email address', async () => {
      const matchResult = await eTransferAutoMatchService.matchTransfer(organizationId, {
        senderName: 'Different Name',
        senderEmail: 'customer@test.com',
        amount: 500.00,
        referenceNumber: '',
        transferDate: new Date(),
        messageId: 'test-msg-004'
      });

      expect(matchResult.invoice?.id).toBe(invoiceId);
    });

    it('should require review for high-value transfers', async () => {
      // Create high-value invoice
      const highValueInvoice = await createTestInvoice({
        organizationId,
        customerId,
        amount: 10000.00,
        status: 'SENT'
      });

      const matchResult = await eTransferAutoMatchService.matchTransfer(organizationId, {
        senderName: 'John Smith',
        senderEmail: 'customer@test.com',
        amount: 10000.00,
        referenceNumber: highValueInvoice.invoiceNumber,
        transferDate: new Date(),
        messageId: 'test-msg-005'
      });

      expect(matchResult.requiresReview).toBe(true);

      // Cleanup
      await prisma.invoice.delete({ where: { id: highValueInvoice.id } });
    });

    it('should require review for multiple close matches', async () => {
      // Create two invoices with same amount
      const invoice1 = await createTestInvoice({
        organizationId,
        customerId,
        amount: 250.00,
        status: 'SENT'
      });

      const customer2 = await createTestCustomer({
        organizationId,
        email: 'customer2@test.com',
        firstName: 'John',
        lastName: 'Doe'
      });

      const invoice2 = await createTestInvoice({
        organizationId,
        customerId: customer2.id,
        amount: 250.00,
        status: 'SENT'
      });

      const matchResult = await eTransferAutoMatchService.matchTransfer(organizationId, {
        senderName: 'John Someone',
        senderEmail: 'unknown@test.com',
        amount: 250.00,
        referenceNumber: '',
        transferDate: new Date(),
        messageId: 'test-msg-006'
      });

      expect(matchResult.matches.length).toBeGreaterThanOrEqual(2);

      // Cleanup
      await prisma.invoice.delete({ where: { id: invoice1.id } });
      await prisma.invoice.delete({ where: { id: invoice2.id } });
      await prisma.customer.delete({ where: { id: customer2.id } });
    });

    it('should detect duplicate transfers', async () => {
      const transferData = {
        senderName: 'John Smith',
        senderEmail: 'customer@test.com',
        amount: 500.00,
        referenceNumber: 'INV-001',
        transferDate: new Date(),
        messageId: 'duplicate-test-001'
      };

      // Create first payment
      await eTransferAutoMatchService.createPaymentFromMatch(
        organizationId,
        invoiceId,
        transferData,
        95,
        'system'
      );

      // Try to match same transfer again
      const matchResult = await eTransferAutoMatchService.matchTransfer(
        organizationId,
        transferData
      );

      expect(matchResult.confidence).toBe('NONE');
      expect(matchResult.requiresReview).toBe(true);
    });
  });

  describe('Admin Review API', () => {
    let pendingPaymentId: string;

    beforeEach(async () => {
      // Create pending review payment
      const payment = await prisma.payment.create({
        data: {
          organizationId,
          paymentNumber: 'PAY-REVIEW-' + Date.now(),
          customerId,
          invoiceId,
          paymentMethod: 'INTERAC_ETRANSFER',
          amount: 500.00,
          currency: 'CAD',
          paymentDate: new Date(),
          status: PaymentStatus.PENDING_REVIEW,
          adminNotes: 'Requires manual review',
          metadata: JSON.stringify({
            requiresReview: true,
            messageId: 'test-review-001',
            senderEmail: 'customer@test.com'
          })
        }
      });
      pendingPaymentId = payment.id;
    });

    afterEach(async () => {
      await prisma.payment.deleteMany({
        where: {
          id: pendingPaymentId
        }
      });
    });

    it('should get pending reviews', async () => {
      const response = await request(app)
        .get(`/api/v1/organizations/${organizationId}/etransfer/review/pending`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.data[0].id).toBe(pendingPaymentId);
    });

    it('should approve pending e-Transfer', async () => {
      const response = await request(app)
        .post(`/api/v1/organizations/${organizationId}/etransfer/review/${pendingPaymentId}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ notes: 'Approved after manual review' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe(PaymentStatus.COMPLETED);
    });

    it('should reassign e-Transfer to different invoice', async () => {
      // Create another invoice
      const newInvoice = await createTestInvoice({
        organizationId,
        customerId,
        amount: 300.00,
        status: 'SENT'
      });

      const response = await request(app)
        .post(`/api/v1/organizations/${organizationId}/etransfer/review/${pendingPaymentId}/reassign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          invoiceId: newInvoice.id,
          notes: 'Reassigned to correct invoice'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.invoiceId).toBe(newInvoice.id);

      // Cleanup
      await prisma.invoice.delete({ where: { id: newInvoice.id } });
    });

    it('should reject e-Transfer', async () => {
      const response = await request(app)
        .post(`/api/v1/organizations/${organizationId}/etransfer/review/${pendingPaymentId}/reject`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Invalid transfer' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe(PaymentStatus.FAILED);
    });

    it('should get automation statistics', async () => {
      const response = await request(app)
        .get(`/api/v1/organizations/${organizationId}/etransfer/review/stats`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('total');
      expect(response.body.data).toHaveProperty('autoMatched');
      expect(response.body.data).toHaveProperty('pendingReview');
      expect(response.body.data).toHaveProperty('autoMatchRate');
    });

    it('should require admin role for approval', async () => {
      // Create employee user
      const employee = await createTestUser({
        organizationId,
        email: 'employee@etransfertest.com',
        role: 'EMPLOYEE'
      });
      const employeeToken = generateAuthToken(employee.id, organizationId);

      await request(app)
        .post(`/api/v1/organizations/${organizationId}/etransfer/review/${pendingPaymentId}/approve`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ notes: 'Should fail' })
        .expect(403);

      // Cleanup
      await prisma.user.delete({ where: { id: employee.id } });
    });
  });

  describe('Payment Creation from Match', () => {
    it('should create payment and update invoice balance', async () => {
      const invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId }
      });
      const initialBalance = invoice!.balance;

      const payment = await eTransferAutoMatchService.createPaymentFromMatch(
        organizationId,
        invoiceId,
        {
          senderName: 'John Smith',
          senderEmail: 'customer@test.com',
          amount: 200.00,
          referenceNumber: 'PARTIAL-001',
          transferDate: new Date(),
          messageId: 'payment-test-001'
        },
        92,
        'system'
      );

      expect(payment.amount).toBe(200.00);
      expect(payment.status).toBe(PaymentStatus.COMPLETED);

      const updatedInvoice = await prisma.invoice.findUnique({
        where: { id: invoiceId }
      });

      expect(Number(updatedInvoice!.balance)).toBe(Number(initialBalance) - 200.00);

      // Cleanup
      await prisma.payment.delete({ where: { id: payment.id } });
      await prisma.invoice.update({
        where: { id: invoiceId },
        data: { balance: initialBalance }
      });
    });
  });
});
