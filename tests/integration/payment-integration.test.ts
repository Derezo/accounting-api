import { describe, test, expect, beforeEach } from '@jest/globals';
import { prisma, authenticatedRequest, baseRequest } from './setup';
import {
  createTestContext,
  createTestCustomer,
  createTestInvoice,
  createTestPayment,
  createStripeWebhookEvent,
  delay,
  TestContext
} from './test-utils';
import { PaymentMethod, PaymentStatus, InvoiceStatus } from '../../src/types/enums';

describe('Payment Integration Tests', () => {
  let testContext: TestContext;

  beforeEach(async () => {
    testContext = await createTestContext(prisma, 'Payment Test Org');
  });

  describe('Stripe Payment Processing', () => {
    test('should process complete Stripe payment flow', async () => {
      const { organization, authTokens, customers } = testContext;
      const customer = customers[0];
      const adminToken = authTokens.admin;

      // Step 1: Create invoice
      const invoice = await createTestInvoice(
        prisma,
        organization.id,
        customer.id
      );

      // Step 2: Create payment intent (simulated Stripe response)
      const paymentIntentResponse = await authenticatedRequest(adminToken)
        .post('/api/payments/stripe/create-payment-intent')
        .send({
          customerId: customer.id,
          invoiceId: invoice.id,
          amount: invoice.total,
          currency: 'cad',
          description: `Payment for invoice ${invoice.invoiceNumber}`,
          metadata: {
            invoiceId: invoice.id,
            customerId: customer.id,
            organizationId: organization.id
          }
        })
        .expect(201);

      const paymentIntent = paymentIntentResponse.body;
      expect(paymentIntent.client_secret).toBeTruthy();
      expect(paymentIntent.amount).toBe(Math.round(invoice.total * 100)); // Stripe uses cents

      // Step 3: Simulate successful payment confirmation webhook
      const webhookPayload = createStripeWebhookEvent('payment_intent.succeeded', {
        id: paymentIntent.id,
        amount: paymentIntent.amount,
        currency: 'cad',
        status: 'succeeded',
        metadata: paymentIntent.metadata,
        charges: {
          data: [{
            id: 'ch_test_123456',
            amount: paymentIntent.amount,
            currency: 'cad',
            paid: true,
            status: 'succeeded',
            receipt_url: 'https://pay.stripe.com/receipts/test_receipt'
          }]
        }
      });

      // Process webhook
      const webhookResponse = await baseRequest()
        .post('/api/webhooks/stripe')
        .set('stripe-signature', 'test_signature')
        .send(webhookPayload)
        .expect(200);

      expect(webhookResponse.body.received).toBe(true);

      // Step 4: Verify payment was recorded
      const paymentsResponse = await authenticatedRequest(adminToken)
        .get(`/api/payments?invoiceId=${invoice.id}`)
        .expect(200);

      const payments = paymentsResponse.body.data;
      expect(payments).toHaveLength(1);
      expect(payments[0].status).toBe(PaymentStatus.COMPLETED);
      expect(payments[0].stripePaymentIntentId).toBe(paymentIntent.id);
      expect(payments[0].amount).toBe(invoice.total);

      // Step 5: Verify invoice status updated
      const updatedInvoiceResponse = await authenticatedRequest(adminToken)
        .get(`/api/invoices/${invoice.id}`)
        .expect(200);

      const updatedInvoice = updatedInvoiceResponse.body;
      expect(updatedInvoice.status).toBe(InvoiceStatus.PAID);
      expect(updatedInvoice.amountPaid).toBe(invoice.total);
      expect(updatedInvoice.balance).toBe(0);
      expect(updatedInvoice.paidAt).toBeTruthy();

      console.log('✅ Stripe payment flow test completed');
    });

    test('should handle Stripe payment failures', async () => {
      const { organization, authTokens, customers } = testContext;
      const customer = customers[0];
      const adminToken = authTokens.admin;

      const invoice = await createTestInvoice(
        prisma,
        organization.id,
        customer.id
      );

      // Create payment intent
      const paymentIntentResponse = await authenticatedRequest(adminToken)
        .post('/api/payments/stripe/create-payment-intent')
        .send({
          customerId: customer.id,
          invoiceId: invoice.id,
          amount: invoice.total,
          currency: 'cad'
        })
        .expect(201);

      const paymentIntent = paymentIntentResponse.body;

      // Simulate failed payment webhook
      const failedWebhookPayload = createStripeWebhookEvent('payment_intent.payment_failed', {
        id: paymentIntent.id,
        amount: paymentIntent.amount,
        currency: 'cad',
        status: 'requires_payment_method',
        last_payment_error: {
          type: 'card_error',
          code: 'card_declined',
          decline_code: 'insufficient_funds',
          message: 'Your card has insufficient funds.'
        },
        metadata: paymentIntent.metadata
      });

      // Process failed webhook
      await baseRequest()
        .post('/api/webhooks/stripe')
        .set('stripe-signature', 'test_signature')
        .send(failedWebhookPayload)
        .expect(200);

      // Verify payment failure was recorded
      const paymentsResponse = await authenticatedRequest(adminToken)
        .get(`/api/payments?invoiceId=${invoice.id}&status=${PaymentStatus.FAILED}`)
        .expect(200);

      const failedPayments = paymentsResponse.body.data;
      expect(failedPayments).toHaveLength(1);
      expect(failedPayments[0].status).toBe(PaymentStatus.FAILED);
      expect(failedPayments[0].failureReason).toContain('insufficient_funds');

      // Verify invoice remains unpaid
      const invoiceResponse = await authenticatedRequest(adminToken)
        .get(`/api/invoices/${invoice.id}`)
        .expect(200);

      expect(invoiceResponse.body.status).not.toBe(InvoiceStatus.PAID);
      expect(invoiceResponse.body.amountPaid).toBe(0);

      console.log('✅ Stripe payment failure test completed');
    });

    test('should handle partial payments via Stripe', async () => {
      const { organization, authTokens, customers } = testContext;
      const customer = customers[0];
      const adminToken = authTokens.admin;

      const invoice = await createTestInvoice(
        prisma,
        organization.id,
        customer.id
      );

      const partialAmount = invoice.total * 0.5; // 50% payment

      // Create partial payment intent
      const paymentIntentResponse = await authenticatedRequest(adminToken)
        .post('/api/payments/stripe/create-payment-intent')
        .send({
          customerId: customer.id,
          invoiceId: invoice.id,
          amount: partialAmount,
          currency: 'cad',
          description: 'Partial payment (50%)'
        })
        .expect(201);

      const paymentIntent = paymentIntentResponse.body;

      // Simulate successful partial payment
      const webhookPayload = createStripeWebhookEvent('payment_intent.succeeded', {
        id: paymentIntent.id,
        amount: Math.round(partialAmount * 100),
        currency: 'cad',
        status: 'succeeded',
        metadata: paymentIntent.metadata
      });

      await baseRequest()
        .post('/api/webhooks/stripe')
        .set('stripe-signature', 'test_signature')
        .send(webhookPayload)
        .expect(200);

      // Verify invoice is partially paid
      const invoiceResponse = await authenticatedRequest(adminToken)
        .get(`/api/invoices/${invoice.id}`)
        .expect(200);

      const updatedInvoice = invoiceResponse.body;
      expect(updatedInvoice.status).toBe(InvoiceStatus.PARTIALLY_PAID);
      expect(updatedInvoice.amountPaid).toBe(partialAmount);
      expect(updatedInvoice.balance).toBe(invoice.total - partialAmount);

      console.log('✅ Stripe partial payment test completed');
    });

    test('should handle Stripe refunds', async () => {
      const { organization, authTokens, customers } = testContext;
      const customer = customers[0];
      const adminToken = authTokens.admin;

      // Create completed payment first
      const payment = await createTestPayment(
        prisma,
        organization.id,
        customer.id,
        undefined,
        1000.00
      );

      // Process refund
      const refundResponse = await authenticatedRequest(adminToken)
        .post(`/api/payments/${payment.id}/refund`)
        .send({
          amount: 300.00, // Partial refund
          reason: 'Customer request',
          adminNotes: 'Approved partial refund due to service issue'
        })
        .expect(201);

      const refund = refundResponse.body;
      expect(refund.amount).toBe(300.00);
      expect(refund.paymentMethod).toBe(PaymentMethod.STRIPE_CARD);
      expect(refund.status).toBe(PaymentStatus.COMPLETED);

      // Simulate Stripe refund webhook
      const refundWebhookPayload = createStripeWebhookEvent('charge.refunded', {
        id: payment.stripeChargeId || 'ch_test_123',
        amount: Math.round(payment.amount * 100),
        amount_refunded: Math.round(300.00 * 100),
        refunded: true,
        refunds: {
          data: [{
            id: 'rf_test_123',
            amount: Math.round(300.00 * 100),
            status: 'succeeded',
            reason: 'requested_by_customer'
          }]
        }
      });

      await baseRequest()
        .post('/api/webhooks/stripe')
        .set('stripe-signature', 'test_signature')
        .send(refundWebhookPayload)
        .expect(200);

      // Verify refund was processed
      const paymentResponse = await authenticatedRequest(adminToken)
        .get(`/api/payments/${payment.id}`)
        .expect(200);

      expect(paymentResponse.body.status).toBe(PaymentStatus.REFUNDED);

      console.log('✅ Stripe refund test completed');
    });
  });

  describe('E-Transfer Payment Processing', () => {
    test('should process e-transfer payment workflow', async () => {
      const { organization, authTokens, customers } = testContext;
      const customer = customers[0];
      const adminToken = authTokens.admin;

      const invoice = await createTestInvoice(
        prisma,
        organization.id,
        customer.id
      );

      // Step 1: Customer initiates e-transfer
      const etransferResponse = await authenticatedRequest(adminToken)
        .post('/api/payments/etransfer/initiate')
        .send({
          customerId: customer.id,
          invoiceId: invoice.id,
          amount: invoice.total,
          customerEmail: 'customer@example.com',
          securityQuestion: 'What is your company name?',
          securityAnswer: 'TechCorp'
        })
        .expect(201);

      const etransfer = etransferResponse.body;
      expect(etransfer.status).toBe(PaymentStatus.PENDING);
      expect(etransfer.paymentMethod).toBe(PaymentMethod.INTERAC_ETRANSFER);

      // Step 2: Simulate bank notification of e-transfer
      const bankNotificationResponse = await baseRequest()
        .post('/api/webhooks/etransfer/received')
        .set('x-bank-signature', 'test_bank_signature')
        .send({
          reference_number: etransfer.referenceNumber,
          amount: invoice.total,
          sender_email: 'customer@example.com',
          received_at: new Date().toISOString(),
          transaction_id: 'ETF123456789',
          status: 'completed'
        })
        .expect(200);

      expect(bankNotificationResponse.body.processed).toBe(true);

      // Step 3: Admin confirms e-transfer receipt
      await authenticatedRequest(adminToken)
        .patch(`/api/payments/${etransfer.id}/confirm-etransfer`)
        .send({
          bankTransactionId: 'ETF123456789',
          adminNotes: 'E-transfer received and verified in bank account'
        })
        .expect(200);

      // Step 4: Verify payment completion
      const paymentResponse = await authenticatedRequest(adminToken)
        .get(`/api/payments/${etransfer.id}`)
        .expect(200);

      const completedPayment = paymentResponse.body;
      expect(completedPayment.status).toBe(PaymentStatus.COMPLETED);
      expect(completedPayment.bankReference).toBe('ETF123456789');

      // Step 5: Verify invoice updated
      const invoiceResponse = await authenticatedRequest(adminToken)
        .get(`/api/invoices/${invoice.id}`)
        .expect(200);

      expect(invoiceResponse.body.status).toBe(InvoiceStatus.PAID);

      console.log('✅ E-transfer payment workflow test completed');
    });

    test('should handle e-transfer timeout and cancellation', async () => {
      const { organization, authTokens, customers } = testContext;
      const customer = customers[0];
      const adminToken = authTokens.admin;

      const invoice = await createTestInvoice(
        prisma,
        organization.id,
        customer.id
      );

      // Initiate e-transfer
      const etransferResponse = await authenticatedRequest(adminToken)
        .post('/api/payments/etransfer/initiate')
        .send({
          customerId: customer.id,
          invoiceId: invoice.id,
          amount: invoice.total,
          customerEmail: 'customer@timeout.com',
          securityQuestion: 'Test question?',
          securityAnswer: 'Test answer'
        })
        .expect(201);

      const etransfer = etransferResponse.body;

      // Simulate e-transfer expiry (after 30 days timeout)
      await authenticatedRequest(adminToken)
        .patch(`/api/payments/${etransfer.id}/expire`)
        .send({
          reason: 'E-transfer not claimed within 30 days',
          adminNotes: 'Auto-expired due to timeout'
        })
        .expect(200);

      // Verify payment status
      const expiredPaymentResponse = await authenticatedRequest(adminToken)
        .get(`/api/payments/${etransfer.id}`)
        .expect(200);

      expect(expiredPaymentResponse.body.status).toBe(PaymentStatus.CANCELLED);

      // Cancel and resend
      const resendResponse = await authenticatedRequest(adminToken)
        .post('/api/payments/etransfer/resend')
        .send({
          originalPaymentId: etransfer.id,
          newSecurityQuestion: 'What is the project name?',
          newSecurityAnswer: 'Website Redesign'
        })
        .expect(201);

      expect(resendResponse.body.status).toBe(PaymentStatus.PENDING);
      expect(resendResponse.body.referenceNumber).not.toBe(etransfer.referenceNumber);

      console.log('✅ E-transfer timeout and cancellation test completed');
    });
  });

  describe('Manual Payment Processing', () => {
    test('should record manual cash payment', async () => {
      const { organization, authTokens, customers } = testContext;
      const customer = customers[0];
      const adminToken = authTokens.admin;

      const invoice = await createTestInvoice(
        prisma,
        organization.id,
        customer.id
      );

      // Record cash payment
      const cashPaymentResponse = await authenticatedRequest(adminToken)
        .post('/api/payments/manual/cash')
        .send({
          customerId: customer.id,
          invoiceId: invoice.id,
          amount: invoice.total,
          receivedDate: new Date().toISOString(),
          receiptNumber: 'CASH-001',
          receivedBy: 'John Smith',
          location: 'Main Office',
          adminNotes: 'Cash payment received at front desk'
        })
        .expect(201);

      const cashPayment = cashPaymentResponse.body;
      expect(cashPayment.paymentMethod).toBe(PaymentMethod.CASH);
      expect(cashPayment.status).toBe(PaymentStatus.COMPLETED);
      expect(cashPayment.referenceNumber).toBe('CASH-001');

      // Verify invoice updated
      const invoiceResponse = await authenticatedRequest(adminToken)
        .get(`/api/invoices/${invoice.id}`)
        .expect(200);

      expect(invoiceResponse.body.status).toBe(InvoiceStatus.PAID);

      console.log('✅ Manual cash payment test completed');
    });

    test('should record manual cheque payment', async () => {
      const { organization, authTokens, customers } = testContext;
      const customer = customers[0];
      const adminToken = authTokens.admin;

      const invoice = await createTestInvoice(
        prisma,
        organization.id,
        customer.id
      );

      // Record cheque payment
      const chequePaymentResponse = await authenticatedRequest(adminToken)
        .post('/api/payments/manual/cheque')
        .send({
          customerId: customer.id,
          invoiceId: invoice.id,
          amount: invoice.total,
          receivedDate: new Date().toISOString(),
          chequeNumber: '001234',
          bankName: 'TD Canada Trust',
          chequeDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
          memoLine: `Invoice ${invoice.invoiceNumber}`,
          adminNotes: 'Cheque deposited to main account'
        })
        .expect(201);

      const chequePayment = chequePaymentResponse.body;
      expect(chequePayment.paymentMethod).toBe(PaymentMethod.CHEQUE);
      expect(chequePayment.status).toBe(PaymentStatus.COMPLETED);
      expect(chequePayment.referenceNumber).toBe('001234');

      // Mark cheque as cleared
      await authenticatedRequest(adminToken)
        .patch(`/api/payments/${chequePayment.id}/clear-cheque`)
        .send({
          clearedDate: new Date().toISOString(),
          bankReference: 'DEP789456',
          adminNotes: 'Cheque cleared successfully'
        })
        .expect(200);

      // Verify cheque status
      const clearedPaymentResponse = await authenticatedRequest(adminToken)
        .get(`/api/payments/${chequePayment.id}`)
        .expect(200);

      expect(clearedPaymentResponse.body.bankReference).toBe('DEP789456');

      console.log('✅ Manual cheque payment test completed');
    });

    test('should handle bounced cheque', async () => {
      const { organization, authTokens, customers } = testContext;
      const customer = customers[0];
      const adminToken = authTokens.admin;

      const invoice = await createTestInvoice(
        prisma,
        organization.id,
        customer.id
      );

      // Record cheque payment
      const chequePaymentResponse = await authenticatedRequest(adminToken)
        .post('/api/payments/manual/cheque')
        .send({
          customerId: customer.id,
          invoiceId: invoice.id,
          amount: invoice.total,
          receivedDate: new Date().toISOString(),
          chequeNumber: '001235',
          bankName: 'Royal Bank',
          chequeDate: new Date().toISOString()
        })
        .expect(201);

      const chequePayment = chequePaymentResponse.body;

      // Mark cheque as bounced
      await authenticatedRequest(adminToken)
        .patch(`/api/payments/${chequePayment.id}/bounce-cheque`)
        .send({
          bounceDate: new Date().toISOString(),
          bounceReason: 'NSF - Non-sufficient funds',
          bankFee: 45.00,
          adminNotes: 'Customer notified of bounced cheque'
        })
        .expect(200);

      // Verify payment status
      const bouncedPaymentResponse = await authenticatedRequest(adminToken)
        .get(`/api/payments/${chequePayment.id}`)
        .expect(200);

      expect(bouncedPaymentResponse.body.status).toBe(PaymentStatus.FAILED);
      expect(bouncedPaymentResponse.body.failureReason).toContain('NSF');

      // Verify invoice reverted to unpaid
      const invoiceResponse = await authenticatedRequest(adminToken)
        .get(`/api/invoices/${invoice.id}`)
        .expect(200);

      expect(invoiceResponse.body.status).not.toBe(InvoiceStatus.PAID);
      expect(invoiceResponse.body.amountPaid).toBe(0);

      console.log('✅ Bounced cheque handling test completed');
    });
  });

  describe('Payment Reconciliation', () => {
    test('should reconcile multiple payments for single invoice', async () => {
      const { organization, authTokens, customers } = testContext;
      const customer = customers[0];
      const adminToken = authTokens.admin;

      const invoice = await createTestInvoice(
        prisma,
        organization.id,
        customer.id
      );

      const totalAmount = invoice.total;
      const payment1Amount = totalAmount * 0.3; // 30%
      const payment2Amount = totalAmount * 0.7; // 70%

      // First payment (cash deposit)
      const payment1Response = await authenticatedRequest(adminToken)
        .post('/api/payments/manual/cash')
        .send({
          customerId: customer.id,
          invoiceId: invoice.id,
          amount: payment1Amount,
          receivedDate: new Date().toISOString(),
          receiptNumber: 'CASH-DEPOSIT-001',
          adminNotes: 'Initial deposit payment'
        })
        .expect(201);

      // Verify invoice is partially paid
      let invoiceResponse = await authenticatedRequest(adminToken)
        .get(`/api/invoices/${invoice.id}`)
        .expect(200);

      expect(invoiceResponse.body.status).toBe(InvoiceStatus.PARTIALLY_PAID);
      expect(invoiceResponse.body.amountPaid).toBe(payment1Amount);
      expect(invoiceResponse.body.balance).toBe(totalAmount - payment1Amount);

      // Second payment (final payment via e-transfer)
      const payment2Response = await authenticatedRequest(adminToken)
        .post('/api/payments')
        .send({
          customerId: customer.id,
          invoiceId: invoice.id,
          amount: payment2Amount,
          paymentMethod: PaymentMethod.INTERAC_ETRANSFER,
          referenceNumber: 'ETF987654321',
          adminNotes: 'Final payment to complete invoice'
        })
        .expect(201);

      // Verify invoice is fully paid
      invoiceResponse = await authenticatedRequest(adminToken)
        .get(`/api/invoices/${invoice.id}`)
        .expect(200);

      expect(invoiceResponse.body.status).toBe(InvoiceStatus.PAID);
      expect(invoiceResponse.body.amountPaid).toBe(totalAmount);
      expect(invoiceResponse.body.balance).toBe(0);
      expect(invoiceResponse.body.paidAt).toBeTruthy();

      // Verify both payments are linked to invoice
      const paymentsResponse = await authenticatedRequest(adminToken)
        .get(`/api/payments?invoiceId=${invoice.id}`)
        .expect(200);

      expect(paymentsResponse.body.data).toHaveLength(2);
      expect(paymentsResponse.body.data.every((p: any) => p.status === PaymentStatus.COMPLETED)).toBe(true);

      console.log('✅ Multiple payments reconciliation test completed');
    });

    test('should handle overpayment scenarios', async () => {
      const { organization, authTokens, customers } = testContext;
      const customer = customers[0];
      const adminToken = authTokens.admin;

      const invoice = await createTestInvoice(
        prisma,
        organization.id,
        customer.id
      );

      const overpaymentAmount = invoice.total + 150.00; // $150 overpayment

      // Record overpayment
      const overpaymentResponse = await authenticatedRequest(adminToken)
        .post('/api/payments')
        .send({
          customerId: customer.id,
          invoiceId: invoice.id,
          amount: overpaymentAmount,
          paymentMethod: PaymentMethod.STRIPE_CARD,
          referenceNumber: 'STRIPE_OVERPAY_123',
          adminNotes: 'Customer accidentally overpaid'
        })
        .expect(201);

      const overpayment = overpaymentResponse.body;

      // Verify invoice shows overpayment
      const invoiceResponse = await authenticatedRequest(adminToken)
        .get(`/api/invoices/${invoice.id}`)
        .expect(200);

      expect(invoiceResponse.body.status).toBe(InvoiceStatus.PAID);
      expect(invoiceResponse.body.amountPaid).toBe(overpaymentAmount);
      expect(invoiceResponse.body.balance).toBe(invoice.total - overpaymentAmount); // Negative balance

      // Process refund for overpayment
      const refundResponse = await authenticatedRequest(adminToken)
        .post(`/api/payments/${overpayment.id}/refund`)
        .send({
          amount: 150.00, // Refund the overpayment amount
          reason: 'Overpayment refund',
          adminNotes: 'Refunding excess payment amount'
        })
        .expect(201);

      expect(refundResponse.body.amount).toBe(150.00);

      // Verify final invoice balance
      const finalInvoiceResponse = await authenticatedRequest(adminToken)
        .get(`/api/invoices/${invoice.id}`)
        .expect(200);

      expect(finalInvoiceResponse.body.balance).toBe(0);

      console.log('✅ Overpayment handling test completed');
    });

    test('should generate payment reconciliation report', async () => {
      const { organization, authTokens, customers } = testContext;
      const adminToken = authTokens.admin;

      // Create multiple payments across different methods
      const testPayments = [];

      for (let i = 0; i < 5; i++) {
        const customer = await createTestCustomer(prisma, organization.id, 'PERSON');
        const invoice = await createTestInvoice(prisma, organization.id, customer.id);

        const payment = await createTestPayment(
          prisma,
          organization.id,
          customer.id,
          invoice.id,
          1000 + (i * 500) // Varying amounts
        );

        testPayments.push(payment);
      }

      // Generate reconciliation report
      const reportResponse = await authenticatedRequest(adminToken)
        .get('/api/reports/payment-reconciliation')
        .query({
          startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // Last 30 days
          endDate: new Date().toISOString(),
          groupBy: 'paymentMethod'
        })
        .expect(200);

      const report = reportResponse.body;
      expect(report.summary).toBeDefined();
      expect(report.summary.totalAmount).toBeGreaterThan(0);
      expect(report.summary.paymentCount).toBeGreaterThanOrEqual(5);
      expect(report.breakdown).toBeDefined();

      // Verify breakdown by payment method
      const stripePayments = report.breakdown.find((b: any) => b.paymentMethod === PaymentMethod.STRIPE_CARD);
      expect(stripePayments).toBeDefined();
      expect(stripePayments.count).toBeGreaterThan(0);

      console.log('✅ Payment reconciliation report test completed');
    });
  });

  describe('Payment Security and Validation', () => {
    test('should validate payment amounts and prevent fraud', async () => {
      const { organization, authTokens, customers } = testContext;
      const customer = customers[0];
      const adminToken = authTokens.admin;

      const invoice = await createTestInvoice(
        prisma,
        organization.id,
        customer.id
      );

      // Test negative amount (should fail)
      await authenticatedRequest(adminToken)
        .post('/api/payments')
        .send({
          customerId: customer.id,
          invoiceId: invoice.id,
          amount: -100.00,
          paymentMethod: PaymentMethod.CASH
        })
        .expect(400);

      // Test zero amount (should fail)
      await authenticatedRequest(adminToken)
        .post('/api/payments')
        .send({
          customerId: customer.id,
          invoiceId: invoice.id,
          amount: 0,
          paymentMethod: PaymentMethod.CASH
        })
        .expect(400);

      // Test excessive amount (should require additional approval)
      await authenticatedRequest(adminToken)
        .post('/api/payments')
        .send({
          customerId: customer.id,
          invoiceId: invoice.id,
          amount: 50000.00, // Large amount
          paymentMethod: PaymentMethod.BANK_TRANSFER,
          requiresApproval: true
        })
        .expect(201);

      console.log('✅ Payment validation and fraud prevention test completed');
    });

    test('should handle payment processor webhooks securely', async () => {
      // Test webhook without proper signature (should fail)
      const webhookPayload = createStripeWebhookEvent('payment_intent.succeeded', {
        id: 'pi_test_invalid',
        amount: 10000,
        currency: 'cad',
        status: 'succeeded'
      });

      // Missing signature
      await baseRequest()
        .post('/api/webhooks/stripe')
        .send(webhookPayload)
        .expect(401);

      // Invalid signature
      await baseRequest()
        .post('/api/webhooks/stripe')
        .set('stripe-signature', 'invalid_signature')
        .send(webhookPayload)
        .expect(401);

      console.log('✅ Webhook security test completed');
    });

    test('should prevent duplicate payment processing', async () => {
      const { organization, authTokens, customers } = testContext;
      const customer = customers[0];
      const adminToken = authTokens.admin;

      const invoice = await createTestInvoice(
        prisma,
        organization.id,
        customer.id
      );

      const paymentData = {
        customerId: customer.id,
        invoiceId: invoice.id,
        amount: invoice.total,
        paymentMethod: PaymentMethod.STRIPE_CARD,
        referenceNumber: 'UNIQUE_REF_123'
      };

      // First payment should succeed
      const firstPaymentResponse = await authenticatedRequest(adminToken)
        .post('/api/payments')
        .send(paymentData)
        .expect(201);

      // Duplicate payment with same reference should fail
      await authenticatedRequest(adminToken)
        .post('/api/payments')
        .send(paymentData)
        .expect(409); // Conflict

      // Verify only one payment exists
      const paymentsResponse = await authenticatedRequest(adminToken)
        .get(`/api/payments?invoiceId=${invoice.id}`)
        .expect(200);

      expect(paymentsResponse.body.data).toHaveLength(1);

      console.log('✅ Duplicate payment prevention test completed');
    });
  });

  describe('Payment Analytics and Reporting', () => {
    test('should generate comprehensive payment analytics', async () => {
      const { organization, authTokens } = testContext;
      const adminToken = authTokens.admin;

      // Create sample payment data
      const paymentMethods = [
        PaymentMethod.STRIPE_CARD,
        PaymentMethod.INTERAC_ETRANSFER,
        PaymentMethod.CASH,
        PaymentMethod.CHEQUE
      ];

      for (const method of paymentMethods) {
        for (let i = 0; i < 3; i++) {
          const customer = await createTestCustomer(prisma, organization.id, 'PERSON');
          const invoice = await createTestInvoice(prisma, organization.id, customer.id);

          await prisma.payment.create({
            data: {
              organizationId: organization.id,
              paymentNumber: `PAY-${method}-${i}`,
              customerId: customer.id,
              invoiceId: invoice.id,
              paymentMethod: method,
              amount: 1000 + (i * 200),
              currency: 'CAD',
              paymentDate: new Date(),
              status: PaymentStatus.COMPLETED,
              processedAt: new Date()
            }
          });
        }
      }

      // Get payment analytics
      const analyticsResponse = await authenticatedRequest(adminToken)
        .get('/api/analytics/payments')
        .query({
          period: 'month',
          startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          endDate: new Date().toISOString()
        })
        .expect(200);

      const analytics = analyticsResponse.body;
      expect(analytics.summary).toBeDefined();
      expect(analytics.byPaymentMethod).toBeDefined();
      expect(analytics.dailyTrends).toBeDefined();
      expect(analytics.summary.totalAmount).toBeGreaterThan(0);
      expect(analytics.summary.paymentCount).toBeGreaterThanOrEqual(12);

      // Verify breakdown by payment method
      expect(analytics.byPaymentMethod).toHaveLength(4);
      analytics.byPaymentMethod.forEach((method: any) => {
        expect(method.paymentMethod).toBeTruthy();
        expect(method.count).toBe(3);
        expect(method.totalAmount).toBeGreaterThan(0);
      });

      console.log('✅ Payment analytics test completed');
    });
  });
});