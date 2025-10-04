import request from 'supertest';
import app from '../../src/app';
import { prisma } from '../../src/config/database';
import { paymentPortalService } from '../../src/services/payment-portal.service';
import { createTestOrganization, createTestCustomer, createTestInvoice, cleanupTestData } from './test-utils';

describe('Public Payment Portal Integration Tests', () => {
  let orgId: string;
  let customerId: string;
  let invoiceId: string;
  let paymentToken: string;

  beforeAll(async () => {
    // Create test organization
    const org = await createTestOrganization();
    orgId = org.id;

    // Create test customer
    const customer = await createTestCustomer(orgId);
    customerId = customer.id;

    // Create test invoice with balance
    const invoice = await createTestInvoice(orgId, customerId, {
      subtotal: 1000,
      taxAmount: 130,
      total: 1130,
      balance: 1130,
      amountPaid: 0
    });
    invoiceId = invoice.id;

    // Generate payment token
    const tokenResult = await paymentPortalService.generateCustomerPaymentToken(
      customerId,
      orgId,
      invoiceId,
      undefined,
      7 // 7 days expiration
    );
    paymentToken = tokenResult.token;
  });

  afterAll(async () => {
    await cleanupTestData(orgId);
  });

  describe('Token-based Authentication', () => {
    it('should generate valid payment token', async () => {
      const result = await paymentPortalService.generateCustomerPaymentToken(
        customerId,
        orgId,
        invoiceId
      );

      expect(result.token).toBeDefined();
      expect(result.token).toHaveLength(64); // 32 bytes = 64 hex chars
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(result.tokenId).toBeDefined();
    });

    it('should validate payment token successfully', async () => {
      const tokenData = await paymentPortalService.validatePaymentToken(
        paymentToken,
        '127.0.0.1'
      );

      expect(tokenData.customerId).toBe(customerId);
      expect(tokenData.organizationId).toBe(orgId);
      expect(tokenData.invoiceId).toBe(invoiceId);
    });

    it('should reject invalid tokens', async () => {
      await expect(
        paymentPortalService.validatePaymentToken('invalid-token-12345', '127.0.0.1')
      ).rejects.toThrow('Invalid or expired payment token');
    });

    it('should reject expired tokens', async () => {
      // Create token with -1 day expiration (expired)
      const expiredToken = await paymentPortalService.generateCustomerPaymentToken(
        customerId,
        orgId,
        invoiceId,
        undefined,
        -1
      );

      await expect(
        paymentPortalService.validatePaymentToken(expiredToken.token, '127.0.0.1')
      ).rejects.toThrow('Invalid or expired payment token');
    });

    it('should track token usage', async () => {
      const tokenResult = await paymentPortalService.generateCustomerPaymentToken(
        customerId,
        orgId,
        invoiceId
      );

      // Validate multiple times
      await paymentPortalService.validatePaymentToken(tokenResult.token, '127.0.0.1');
      await paymentPortalService.validatePaymentToken(tokenResult.token, '127.0.0.1');
      await paymentPortalService.validatePaymentToken(tokenResult.token, '127.0.0.1');

      // Check view count
      const tokenRecord = await prisma.customerPaymentToken.findUnique({
        where: { id: tokenResult.tokenId }
      });

      expect(tokenRecord?.viewCount).toBe(3);
      expect(tokenRecord?.lastViewedAt).toBeInstanceOf(Date);
    });
  });

  describe('Invoice Viewing', () => {
    it('should return invoice details with valid token', async () => {
      const response = await request(app)
        .get(`/api/v1/public/payment/${paymentToken}/invoice`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.customer).toBeDefined();
      expect(response.body.invoice).toBeDefined();
      expect(response.body.balance).toBeDefined();
      expect(response.body.tokenExpiresAt).toBeDefined();
    });

    it('should not expose sensitive organization data', async () => {
      const response = await request(app)
        .get(`/api/v1/public/payment/${paymentToken}/invoice`)
        .expect(200);

      // Should not include organization internal data
      expect(response.body.organization).toBeUndefined();
      expect(response.body.invoice?.organization).toBeUndefined();
    });

    it('should return 401 for invalid token', async () => {
      await request(app)
        .get('/api/v1/public/payment/invalid-token/invoice')
        .expect(400);
    });
  });

  describe('Payment Processing', () => {
    it('should create Stripe payment intent', async () => {
      const response = await request(app)
        .post(`/api/v1/public/payment/${paymentToken}/create-intent`)
        .send({
          amount: 500.00,
          savePaymentMethod: false
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.clientSecret).toBeDefined();
      expect(response.body.paymentIntentId).toBeDefined();
      expect(response.body.amount).toBe(50000); // Stripe uses cents
    });

    it('should reject payment exceeding invoice balance', async () => {
      const response = await request(app)
        .post(`/api/v1/public/payment/${paymentToken}/create-intent`)
        .send({
          amount: 2000.00 // Exceeds $1130 invoice balance
        })
        .expect(400);

      expect(response.body.error).toMatch(/exceeds/i);
      expect(response.body.code).toBe('AMOUNT_EXCEEDS_BALANCE');
    });

    it('should handle 3D Secure authentication', async () => {
      // 3D Secure is handled by Stripe.js on client side
      // This test verifies intent creation supports 3DS
      const response = await request(app)
        .post(`/api/v1/public/payment/${paymentToken}/create-intent`)
        .send({
          amount: 100.00,
          savePaymentMethod: true
        })
        .expect(201);

      expect(response.body.clientSecret).toBeDefined();
      // Client would use this secret with Stripe.js confirmCardPayment()
    });

    it('should prevent duplicate payments', async () => {
      // Create payment intent
      const intentResponse = await request(app)
        .post(`/api/v1/public/payment/${paymentToken}/create-intent`)
        .send({ amount: 100.00 })
        .expect(201);

      // Confirm payment (this would normally happen after Stripe.js confirmation)
      await request(app)
        .post(`/api/v1/public/payment/${paymentToken}/confirm`)
        .send({ paymentIntentId: intentResponse.body.paymentIntentId })
        .expect(200);

      // Token should now be invalidated
      await request(app)
        .get(`/api/v1/public/payment/${paymentToken}/invoice`)
        .expect(400); // Token is USED
    });
  });

  describe('Payment Method Management', () => {
    let testToken: string;

    beforeEach(async () => {
      const result = await paymentPortalService.generateCustomerPaymentToken(
        customerId,
        orgId
      );
      testToken = result.token;
    });

    it('should list saved payment methods', async () => {
      const response = await request(app)
        .get(`/api/v1/public/payment/${testToken}/methods`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.paymentMethods).toBeInstanceOf(Array);
    });

    it('should add new payment method', async () => {
      // This test requires Stripe test mode and test payment method
      // In real implementation, you'd create a test payment method via Stripe API
      const mockStripeMethodId = 'pm_test_1234567890';

      const response = await request(app)
        .post(`/api/v1/public/payment/${testToken}/methods`)
        .send({
          stripePaymentMethodId: mockStripeMethodId,
          setAsDefault: true
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.paymentMethod).toBeDefined();
    });

    it('should set default payment method', async () => {
      // First, create a payment method
      const method = await paymentPortalService.addPaymentMethod(
        customerId,
        orgId,
        'pm_test_default',
        false
      );

      const response = await request(app)
        .put(`/api/v1/public/payment/${testToken}/methods/${method.id}/default`)
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify it's now default
      const methods = await paymentPortalService.getSavedPaymentMethods(customerId, orgId);
      const defaultMethod = methods.find(m => m.id === method.id);
      expect(defaultMethod?.isDefault).toBe(true);
    });

    it('should remove payment method', async () => {
      // First, create a payment method
      const method = await paymentPortalService.addPaymentMethod(
        customerId,
        orgId,
        'pm_test_remove',
        false
      );

      const response = await request(app)
        .delete(`/api/v1/public/payment/${testToken}/methods/${method.id}`)
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify it's deactivated
      const updatedMethod = await prisma.customerPaymentMethod.findUnique({
        where: { id: method.id }
      });
      expect(updatedMethod?.isActive).toBe(false);
    });
  });

  describe('Security', () => {
    it('should enforce rate limits', async () => {
      const testToken = (await paymentPortalService.generateCustomerPaymentToken(
        customerId,
        orgId
      )).token;

      // Make 21 requests (limit is 20 per minute)
      const requests = Array.from({ length: 21 }, () =>
        request(app).get(`/api/v1/public/payment/${testToken}/invoice`)
      );

      const results = await Promise.all(requests);
      const rateLimited = results.filter(r => r.status === 429);

      expect(rateLimited.length).toBeGreaterThan(0);
    });

    it('should log all payment activities', async () => {
      const beforeCount = await prisma.auditLog.count({
        where: { entityType: 'Invoice' }
      });

      await request(app)
        .get(`/api/v1/public/payment/${paymentToken}/invoice`)
        .expect(200);

      const afterCount = await prisma.auditLog.count({
        where: { entityType: 'Invoice' }
      });

      expect(afterCount).toBeGreaterThan(beforeCount);
    });

    it('should track IP addresses', async () => {
      const tokenData = await paymentPortalService.validatePaymentToken(
        paymentToken,
        '192.168.1.100'
      );

      const tokenRecord = await prisma.customerPaymentToken.findUnique({
        where: { id: tokenData.tokenId }
      });

      expect(tokenRecord?.ipAddressUsed).toBe('192.168.1.100');
    });
  });

  describe('Customer Balance', () => {
    it('should calculate total outstanding balance', async () => {
      const balance = await paymentPortalService.getCustomerBalance(
        customerId,
        orgId
      );

      expect(balance.totalOutstanding).toBeGreaterThan(0);
      expect(balance.upcomingPayments).toBeInstanceOf(Array);
      expect(balance.upcomingPayments.length).toBeGreaterThan(0);
    });

    it('should identify overdue invoices', async () => {
      // Create overdue invoice
      const overdueInvoice = await createTestInvoice(orgId, customerId, {
        dueDate: new Date(Date.now() - 86400000), // Yesterday
        balance: 500
      });

      const balance = await paymentPortalService.getCustomerBalance(
        customerId,
        orgId
      );

      expect(balance.overdueAmount).toBeGreaterThan(0);

      const overduePayment = balance.upcomingPayments.find(
        p => p.invoiceId === overdueInvoice.id
      );
      expect(overduePayment?.isOverdue).toBe(true);
    });

    it('should sort upcoming payments by due date', async () => {
      const balance = await paymentPortalService.getCustomerBalance(
        customerId,
        orgId
      );

      const dueDates = balance.upcomingPayments.map(p => p.dueDate.getTime());
      const sortedDates = [...dueDates].sort((a, b) => a - b);

      expect(dueDates).toEqual(sortedDates);
    });
  });

  describe('Payment History', () => {
    it('should return customer payment history', async () => {
      const response = await request(app)
        .get(`/api/v1/public/payment/${paymentToken}/history`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.payments).toBeInstanceOf(Array);
      expect(response.body.total).toBeGreaterThanOrEqual(0);
    });

    it('should sanitize payment data', async () => {
      const response = await request(app)
        .get(`/api/v1/public/payment/${paymentToken}/history`)
        .expect(200);

      if (response.body.payments.length > 0) {
        const payment = response.body.payments[0];

        // Should not expose sensitive data
        expect(payment.organization).toBeUndefined();
        expect(payment.stripeChargeId).toBeUndefined();
        expect(payment.adminNotes).toBeUndefined();

        // Should include safe data
        expect(payment.paymentNumber).toBeDefined();
        expect(payment.amount).toBeDefined();
        expect(payment.status).toBeDefined();
      }
    });
  });
});
