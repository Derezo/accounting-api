// @ts-nocheck
import { describe, test, expect, beforeEach } from '@jest/globals';
import { prisma, authenticatedRequest } from './setup';
import {
  createTestContext,
  createTestQuote,
  createTestInvoice,
  createTestPayment,
  createStripeWebhookEvent,
  verifyAuditLog,
  delay,
  TestContext,
  PerformanceTimer
} from './test-utils';
import {
  QuoteStatus,
  InvoiceStatus,
  PaymentStatus,
  PaymentMethod,
  UserRole
} from '../../src/types/enums';

describe('Payment Processing Integration Tests', () => {
  let testContext: TestContext;
  let performanceTimer: PerformanceTimer;

  beforeEach(async () => {
    testContext = await createTestContext(prisma, 'Payment Processing Test Org');
    performanceTimer = new PerformanceTimer();
  });

  describe('Stripe Payment Processing Workflows', () => {
    test('should process complete Stripe payment lifecycle with webhooks', async () => {
      performanceTimer.start();

      const { organization, users, customers, authTokens } = testContext;
      const customer = customers[0];
      const adminToken = authTokens.admin;
      const accountantToken = authTokens.accountant;

      console.log('💳 Starting complete Stripe payment processing test...');

      // ==========================================================================
      // PHASE 1: SETUP INVOICE FOR PAYMENT
      // ==========================================================================
      console.log('📄 PHASE 1: Creating invoice for Stripe payment');

      // Create quote first
      const quoteResponse = await authenticatedRequest(adminToken)
        .post('/api/quotes')
        .send({
          customerId: customer!.id,
          description: 'Stripe Payment Integration Test',
          validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          items: [
            {
              description: 'Software Development Services',
              quantity: 40,
              unitPrice: 125.00,
              taxRate: 0.13,
              discountPercent: 0
            },
            {
              description: 'Premium Support Package',
              quantity: 12,
              unitPrice: 50.00,
              taxRate: 0.13,
              discountPercent: 10
            }
          ],
          terms: 'Payment due upon receipt',
          currency: 'CAD'
        })
        .expect(201);

      const quote = quoteResponse.body;
      const subtotal = (40 * 125.00) + (12 * 50.00 * 0.9); // 5000 + 540 = 5540
      const hstAmount = subtotal * 0.13; // 720.20
      const total = subtotal + hstAmount; // 6260.20

      // Accept quote
      await authenticatedRequest(adminToken)
        .patch(`/api/quotes/${quote.id}/accept`)
        .send({ acceptedByEmail: 'customer@example.com' })
        .expect(200);

      // Create invoice
      const invoiceResponse = await authenticatedRequest(accountantToken)
        .post('/api/invoices')
        .send({
          customerId: customer!.id,
          quoteId: quote.id,
          dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
          terms: 'Payment due upon receipt via credit card',
          notes: 'Stripe payment integration test invoice',
          currency: 'CAD'
        })
        .expect(201);

      const invoice = invoiceResponse.body;

      // Send invoice to customer
      await authenticatedRequest(accountantToken)
        .patch(`/api/invoices/${invoice.id}/send`)
        .expect(200);

      console.log(`✅ Invoice created: $${total.toFixed(2)} CAD`);

      // ==========================================================================
      // PHASE 2: STRIPE PAYMENT INTENT CREATION
      // ==========================================================================
      console.log('🎯 PHASE 2: Creating Stripe Payment Intent');

      // Create Stripe payment intent
      const paymentIntentResponse = await authenticatedRequest(accountantToken)
        .post('/api/payments/stripe/create-intent')
        .send({
          invoiceId: invoice.id,
          customerId: customer!.id,
          amount: invoice.total,
          currency: 'CAD',
          paymentMethodTypes: ['card'],
          captureMethod: 'automatic',
          confirmationMethod: 'automatic',
          customerEmail: 'customer@example.com',
          description: `Payment for invoice ${invoice.invoiceNumber}`,
          metadata: {
            invoiceId: invoice.id,
            customerId: customer!.id,
            organizationId: organization.id,
            invoiceNumber: invoice.invoiceNumber
          }
        })
        .expect(201);

      const paymentIntent = paymentIntentResponse.body;

      // Validate payment intent structure
      expect(paymentIntent.id).toMatch(/^pi_/); // Stripe payment intent ID format
      expect(paymentIntent.amount).toBe(Math.round(invoice.total * 100)); // Amount in cents
      expect(paymentIntent.currency).toBe('cad');
      expect(paymentIntent.status).toBe('requires_payment_method');
      expect(paymentIntent.client_secret).toBeTruthy();

      console.log(`✅ Stripe Payment Intent created: ${paymentIntent.id}`);

      // ==========================================================================
      // PHASE 3: SIMULATE CUSTOMER PAYMENT SUBMISSION
      // ==========================================================================
      console.log('💳 PHASE 3: Simulating customer payment submission');

      // Simulate payment method attachment and confirmation
      const confirmPaymentResponse = await authenticatedRequest(accountantToken)
        .post(`/api/payments/stripe/confirm-intent`)
        .send({
          paymentIntentId: paymentIntent.id,
          paymentMethodId: 'pm_card_visa', // Test payment method
          customerInfo: {
            name: 'John Doe',
            email: 'customer@example.com',
            address: {
              line1: '123 Main Street',
              city: 'Toronto',
              state: 'ON',
              postal_code: 'M5V 3A8',
              country: 'CA'
            }
          },
          billingDetails: {
            name: 'John Doe',
            email: 'customer@example.com'
          }
        })
        .expect(200);

      const confirmedIntent = confirmPaymentResponse.body;
      expect(confirmedIntent.status).toBe('requires_confirmation');

      console.log('✅ Payment method attached and ready for confirmation');

      // ==========================================================================
      // PHASE 4: STRIPE WEBHOOK PROCESSING - PAYMENT SUCCEEDED
      // ==========================================================================
      console.log('🎣 PHASE 4: Processing Stripe webhook - Payment Succeeded');

      // Simulate Stripe charge object
      const stripeCharge = {
        id: 'ch_test_' + Math.random().toString(36).substr(2, 24),
        object: 'charge',
        amount: Math.round(invoice.total * 100),
        amount_captured: Math.round(invoice.total * 100),
        amount_refunded: 0,
        application_fee_amount: null,
        balance_transaction: 'txn_test_' + Math.random().toString(36).substr(2, 24),
        billing_details: {
          address: {
            city: 'Toronto',
            country: 'CA',
            line1: '123 Main Street',
            line2: null,
            postal_code: 'M5V 3A8',
            state: 'ON'
          },
          email: 'customer@example.com',
          name: 'John Doe',
          phone: null
        },
        calculated_statement_descriptor: 'LIFESTREAM DYNAMICS',
        captured: true,
        created: Math.floor(Date.now() / 1000),
        currency: 'cad',
        customer: 'cus_test_customer',
        description: `Payment for invoice ${invoice.invoiceNumber}`,
        failure_code: null,
        failure_message: null,
        fraud_details: {},
        invoice: null,
        livemode: false,
        metadata: {
          invoiceId: invoice.id,
          customerId: customer!.id,
          organizationId: organization.id,
          invoiceNumber: invoice.invoiceNumber
        },
        outcome: {
          network_status: 'approved_by_network',
          reason: null,
          risk_level: 'normal',
          risk_score: 34,
          seller_message: 'Payment complete.',
          type: 'authorized'
        },
        paid: true,
        payment_intent: paymentIntent.id,
        payment_method: 'pm_card_visa',
        payment_method_details: {
          card: {
            brand: 'visa',
            checks: {
              address_line1_check: 'pass',
              address_postal_code_check: 'pass',
              cvc_check: 'pass'
            },
            country: 'US',
            exp_month: 12,
            exp_year: 2025,
            fingerprint: 'test_fingerprint',
            funding: 'credit',
            installments: null,
            last4: '4242',
            network: 'visa',
            three_d_secure: null,
            wallet: null
          },
          type: 'card'
        },
        receipt_email: 'customer@example.com',
        receipt_number: null,
        receipt_url: 'https://pay.stripe.com/receipts/test_receipt',
        refunded: false,
        refunds: {
          object: 'list',
          data: [],
          has_more: false,
          total_count: 0,
          url: '/v1/charges/ch_test_charge/refunds'
        },
        review: null,
        shipping: null,
        source_transfer: null,
        statement_descriptor: null,
        statement_descriptor_suffix: null,
        status: 'succeeded',
        transfer_data: null,
        transfer_group: null
      };

      // Create webhook event
      const webhookEvent = createStripeWebhookEvent('payment_intent.succeeded', {
        ...paymentIntent,
        status: 'succeeded',
        charges: {
          object: 'list',
          data: [stripeCharge],
          has_more: false,
          total_count: 1,
          url: `/v1/payment_intents/${paymentIntent.id}/charges`
        },
        latest_charge: stripeCharge.id
      });

      // Process webhook
      const webhookResponse = await authenticatedRequest(accountantToken)
        .post('/api/webhooks/stripe')
        .set('stripe-signature', 'test_signature')
        .send(webhookEvent)
        .expect(200);

      expect(webhookResponse.body.received).toBe(true);

      console.log('✅ Stripe webhook processed successfully');

      // ==========================================================================
      // PHASE 5: VERIFY PAYMENT RECORD CREATION
      // ==========================================================================
      console.log('💰 PHASE 5: Verifying payment record creation');

      // Get payment record created by webhook
      const paymentsResponse = await authenticatedRequest(accountantToken)
        .get(`/api/payments?invoiceId=${invoice.id}`)
        .expect(200);

      const payments = paymentsResponse.body.data;
      expect(payments).toHaveLength(1);

      const payment = payments[0];

      // Validate payment record
      expect(payment.customerId).toBe(customer!.id);
      expect(payment.invoiceId).toBe(invoice.id);
      expect(payment.amount).toBeCloseTo(invoice.total, 2);
      expect(payment.paymentMethod).toBe(PaymentMethod.STRIPE_CARD);
      expect(payment.status).toBe(PaymentStatus.COMPLETED);
      expect(payment.currency).toBe('CAD');
      expect(payment.referenceNumber).toBe(stripeCharge.id);
      expect(payment.processorFee).toBeCloseTo(invoice.total * 0.029, 2); // 2.9% Stripe fee
      expect(payment.netAmount).toBeCloseTo(invoice.total * 0.971, 2);
      expect(payment.processedAt).toBeTruthy();

      // Verify payment metadata
      const metadata = JSON.parse(payment.metadata || '{}');
      expect(metadata.stripe_payment_intent_id).toBe(paymentIntent.id);
      expect(metadata.stripe_charge_id).toBe(stripeCharge.id);
      expect(metadata.card_last4).toBe('4242');
      expect(metadata.card_brand).toBe('visa');

      console.log(`✅ Payment record created: $${payment.amount.toFixed(2)} (Net: $${payment.netAmount.toFixed(2)})`);

      // ==========================================================================
      // PHASE 6: VERIFY INVOICE STATUS UPDATE
      // ==========================================================================
      console.log('📋 PHASE 6: Verifying invoice status update');

      // Check invoice is marked as paid
      const updatedInvoiceResponse = await authenticatedRequest(accountantToken)
        .get(`/api/invoices/${invoice.id}`)
        .expect(200);

      const updatedInvoice = updatedInvoiceResponse.body;
      expect(updatedInvoice.status).toBe(InvoiceStatus.PAID);
      expect(updatedInvoice.amountPaid).toBeCloseTo(invoice.total, 2);
      expect(updatedInvoice.balance).toBe(0);
      expect(updatedInvoice.paidAt).toBeTruthy();
      expect(updatedInvoice.lastPaymentAt).toBeTruthy();

      console.log('✅ Invoice marked as paid');

      // ==========================================================================
      // PHASE 7: STRIPE REFUND PROCESSING
      // ==========================================================================
      console.log('↩️ PHASE 7: Testing Stripe refund processing');

      // Process partial refund
      const refundAmount = 1000.00; // Partial refund
      const refundResponse = await authenticatedRequest(accountantToken)
        .post('/api/payments/stripe/refund')
        .send({
          chargeId: stripeCharge.id,
          amount: refundAmount,
          reason: 'requested_by_customer',
          metadata: {
            refund_reason: 'Customer requested partial refund for unused services',
            original_payment_id: payment.id,
            refunded_by: users.accountant.id
          }
        })
        .expect(201);

      const refund = refundResponse.body;
      expect(refund.amount).toBe(refundAmount);
      expect(refund.status).toBe('succeeded');
      expect(refund.charge).toBe(stripeCharge.id);

      // Simulate refund webhook
      const refundWebhookEvent = createStripeWebhookEvent('charge.dispute.created', {
        id: stripeCharge.id,
        amount_refunded: Math.round(refundAmount * 100),
        refunded: true,
        refunds: {
          object: 'list',
          data: [{
            id: refund.id,
            object: 'refund',
            amount: Math.round(refundAmount * 100),
            charge: stripeCharge.id,
            created: Math.floor(Date.now() / 1000),
            currency: 'cad',
            metadata: refund.metadata,
            reason: 'requested_by_customer',
            receipt_number: null,
            status: 'succeeded'
          }],
          has_more: false,
          total_count: 1
        }
      });

      // Process refund webhook
      await authenticatedRequest(accountantToken)
        .post('/api/webhooks/stripe')
        .set('stripe-signature', 'test_signature')
        .send(refundWebhookEvent)
        .expect(200);

      // Verify refund record creation
      const refundsResponse = await authenticatedRequest(accountantToken)
        .get(`/api/payments/${payment.id}/refunds`)
        .expect(200);

      const refunds = refundsResponse.body.data;
      expect(refunds).toHaveLength(1);
      expect(refunds[0].amount).toBe(refundAmount);
      expect(refunds[0].status).toBe('COMPLETED');

      console.log(`✅ Refund processed: $${refundAmount.toFixed(2)}`);

      // ==========================================================================
      // PHASE 8: STRIPE SUBSCRIPTION PAYMENT (RECURRING)
      // ==========================================================================
      console.log('🔄 PHASE 8: Testing Stripe subscription payment');

      // Create subscription invoice
      const subscriptionInvoiceResponse = await authenticatedRequest(accountantToken)
        .post('/api/invoices')
        .send({
          customerId: customer!.id,
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          terms: 'Monthly subscription - auto-pay',
          notes: 'Monthly software subscription',
          currency: 'CAD',
          isRecurring: true,
          recurringPeriod: 'MONTHLY',
          items: [
            {
              description: 'Monthly Software License',
              quantity: 1,
              unitPrice: 299.00,
              taxRate: 0.13
            }
          ]
        })
        .expect(201);

      const subscriptionInvoice = subscriptionInvoiceResponse.body;

      // Create subscription in Stripe
      const subscriptionResponse = await authenticatedRequest(accountantToken)
        .post('/api/payments/stripe/create-subscription')
        .send({
          customerId: customer!.id,
          invoiceId: subscriptionInvoice.id,
          priceId: 'price_monthly_license',
          paymentMethodId: 'pm_card_visa',
          defaultPaymentMethod: 'pm_card_visa',
          metadata: {
            organizationId: organization.id,
            customerId: customer!.id,
            subscription_type: 'monthly_license'
          }
        })
        .expect(201);

      const subscription = subscriptionResponse.body;
      expect(subscription.id).toMatch(/^sub_/);
      expect(subscription.status).toBe('active');

      // Simulate subscription invoice payment webhook
      const subscriptionPaymentWebhook = createStripeWebhookEvent('invoice.payment_succeeded', {
        id: 'in_test_subscription',
        subscription: subscription.id,
        amount_paid: Math.round(subscriptionInvoice.total * 100),
        currency: 'cad',
        customer: 'cus_test_customer',
        metadata: {
          organizationId: organization.id,
          customerId: customer!.id
        }
      });

      await authenticatedRequest(accountantToken)
        .post('/api/webhooks/stripe')
        .set('stripe-signature', 'test_signature')
        .send(subscriptionPaymentWebhook)
        .expect(200);

      console.log('✅ Subscription payment processed');

      // ==========================================================================
      // FINAL VALIDATION
      // ==========================================================================
      console.log('🎯 FINAL STRIPE INTEGRATION VALIDATION');

      const endTime = performanceTimer.stop();

      // Verify audit trail
      const auditResponse = await authenticatedRequest(accountantToken)
        .get('/api/audit-logs?entityType=Payment&limit=50')
        .expect(200);

      const auditLogs = auditResponse.body.data;
      expect(auditLogs.length).toBeGreaterThan(5);

      // Verify all payments are linked to organization
      const allPaymentsResponse = await authenticatedRequest(accountantToken)
        .get('/api/payments')
        .expect(200);

      const allPayments = allPaymentsResponse.body.data;
      expect(allPayments.every((p: any) => p.organizationId === organization.id)).toBe(true);

      // Verify financial totals
      const totalProcessed = allPayments.reduce((sum: number, p: any) => sum + p.amount, 0);
      const totalFees = allPayments.reduce((sum: number, p: any) => sum + (p.processorFee || 0), 0);

      console.log(`🎉 STRIPE INTEGRATION COMPLETE in ${endTime.toFixed(0)}ms`);
      console.log(`📊 Stripe Payment Summary:`);
      console.log(`   • Total Payments Processed: $${totalProcessed.toFixed(2)}`);
      console.log(`   • Total Processor Fees: $${totalFees.toFixed(2)}`);
      console.log(`   • Refunds Processed: $${refundAmount.toFixed(2)}`);
      console.log(`   • Active Subscriptions: 1`);
      console.log(`   • Audit Log Entries: ${auditLogs.length}`);

    }, 120000); // 2 minute timeout

    test('should handle Stripe payment failures and retries', async () => {
      const { organization, users, customers, authTokens } = testContext;
      const customer = customers[0];
      const accountantToken = authTokens.accountant;

      console.log('❌ Testing Stripe payment failure scenarios...');

      // Create invoice for failed payment test
      const invoice = await createTestInvoice(prisma, organization.id, customer!.id);

      // Simulate failed payment intent
      const failedPaymentIntent = {
        id: 'pi_failed_' + Math.random().toString(36).substr(2, 24),
        amount: Math.round(invoice.total * 100),
        currency: 'cad',
        status: 'requires_payment_method',
        last_payment_error: {
          code: 'card_declined',
          decline_code: 'insufficient_funds',
          message: 'Your card was declined.',
          type: 'card_error'
        }
      };

      // Process failed payment webhook
      const failureWebhook = createStripeWebhookEvent('payment_intent.payment_failed', failedPaymentIntent);

      const failureResponse = await authenticatedRequest(accountantToken)
        .post('/api/webhooks/stripe')
        .set('stripe-signature', 'test_signature')
        .send(failureWebhook)
        .expect(200);

      // Verify failed payment record
      const failedPaymentsResponse = await authenticatedRequest(accountantToken)
        .get(`/api/payments?status=FAILED&invoiceId=${invoice.id}`)
        .expect(200);

      const failedPayments = failedPaymentsResponse.body.data;
      expect(failedPayments).toHaveLength(1);
      expect(failedPayments[0].status).toBe(PaymentStatus.FAILED);
      expect(failedPayments[0].failureReason).toContain('card_declined');

      // Test retry mechanism
      const retryResponse = await authenticatedRequest(accountantToken)
        .post(`/api/payments/${failedPayments[0].id}/retry`)
        .send({
          paymentMethodId: 'pm_card_visa',
          retryReason: 'Customer provided new payment method'
        })
        .expect(200);

      expect(retryResponse.body.retry_attempt).toBe(2);

      console.log('✅ Payment failure and retry scenarios validated');
    });

    test('should handle Stripe dispute and chargeback processing', async () => {
      const { organization, users, customers, authTokens } = testContext;
      const customer = customers[0];
      const accountantToken = authTokens.accountant;

      console.log('⚖️ Testing Stripe dispute and chargeback processing...');

      // Create successful payment first
      const payment = await createTestPayment(prisma, organization.id, customer!.id);

      // Simulate dispute webhook
      const disputeWebhook = createStripeWebhookEvent('charge.dispute.created', {
        id: 'dp_test_dispute',
        charge: payment.referenceNumber,
        amount: Math.round(payment.amount * 100),
        currency: 'cad',
        reason: 'fraudulent',
        status: 'warning_needs_response',
        evidence_due_by: Math.floor((Date.now() + 7 * 24 * 60 * 60 * 1000) / 1000),
        metadata: {
          payment_id: payment.id,
          organization_id: organization.id
        }
      });

      const disputeResponse = await authenticatedRequest(accountantToken)
        .post('/api/webhooks/stripe')
        .set('stripe-signature', 'test_signature')
        .send(disputeWebhook)
        .expect(200);

      // Verify dispute record creation
      const disputesResponse = await authenticatedRequest(accountantToken)
        .get(`/api/payments/${payment.id}/disputes`)
        .expect(200);

      const disputes = disputesResponse.body.data;
      expect(disputes).toHaveLength(1);
      expect(disputes[0].reason).toBe('fraudulent');
      expect(disputes[0].status).toBe('WARNING_NEEDS_RESPONSE');

      console.log('✅ Dispute processing validated');
    });
  });

  describe('e-Transfer Payment Processing Workflows', () => {
    test('should process complete e-Transfer payment lifecycle', async () => {
      performanceTimer.start();

      const { organization, users, customers, authTokens } = testContext;
      const customer = customers[0];
      const adminToken = authTokens.admin;
      const accountantToken = authTokens.accountant;

      console.log('🏦 Starting complete e-Transfer processing test...');

      // ==========================================================================
      // PHASE 1: SETUP INVOICE FOR E-TRANSFER
      // ==========================================================================
      console.log('📄 PHASE 1: Creating invoice for e-Transfer payment');

      const invoice = await createTestInvoice(prisma, organization.id, customer!.id);

      // Send e-Transfer payment instructions
      const etransferInstructionsResponse = await authenticatedRequest(accountantToken)
        .post(`/api/invoices/${invoice.id}/etransfer-instructions`)
        .send({
          recipientEmail: 'payments@lifestream.ca',
          recipientName: 'Lifestream Dynamics Corp',
          securityQuestion: 'What is our company name?',
          securityAnswer: 'lifestream',
          instructions: 'Please include invoice number in the message field',
          autoDeposit: true
        })
        .expect(201);

      const instructions = etransferInstructionsResponse.body;
      expect(instructions.recipientEmail).toBe('payments@lifestream.ca');
      expect(instructions.securityQuestion).toBeTruthy();

      console.log('✅ e-Transfer instructions sent to customer');

      // ==========================================================================
      // PHASE 2: MANUAL E-TRANSFER RECORDING
      // ==========================================================================
      console.log('💰 PHASE 2: Recording manual e-Transfer receipt');

      // Record e-Transfer receipt
      const etransferPaymentResponse = await authenticatedRequest(accountantToken)
        .post('/api/payments')
        .send({
          customerId: customer!.id,
          invoiceId: invoice.id,
          amount: invoice.total,
          paymentMethod: PaymentMethod.INTERAC_ETRANSFER,
          currency: 'CAD',
          paymentDate: new Date().toISOString(),
          referenceNumber: 'ETRF123456789',
          customerNotes: `e-Transfer for invoice ${invoice.invoiceNumber}`,
          adminNotes: 'e-Transfer received and verified',
          metadata: JSON.stringify({
            etransfer_reference: 'ETRF123456789',
            sender_email: 'customer@example.com',
            recipient_email: 'payments@lifestream.ca',
            security_question: 'What is our company name?',
            deposit_method: 'auto',
            bank_name: 'TD Bank',
            verification_code: 'ABC123'
          }),
          receiptData: {
            etransferRef: 'ETRF123456789',
            bankName: 'TD Bank',
            senderEmail: 'customer@example.com',
            depositTime: new Date().toISOString()
          }
        })
        .expect(201);

      const etransferPayment = etransferPaymentResponse.body;

      // Validate e-Transfer payment record
      expect(etransferPayment.paymentMethod).toBe(PaymentMethod.INTERAC_ETRANSFER);
      expect(etransferPayment.status).toBe(PaymentStatus.COMPLETED);
      expect(etransferPayment.referenceNumber).toBe('ETRF123456789');
      expect(etransferPayment.processorFee).toBe(0); // No processing fees for e-Transfer
      expect(etransferPayment.netAmount).toBe(etransferPayment.amount);

      const metadata = JSON.parse(etransferPayment.metadata);
      expect(metadata.etransfer_reference).toBe('ETRF123456789');
      expect(metadata.sender_email).toBe('customer@example.com');

      console.log(`✅ e-Transfer payment recorded: $${etransferPayment.amount.toFixed(2)}`);

      // ==========================================================================
      // PHASE 3: E-TRANSFER VERIFICATION WORKFLOW
      // ==========================================================================
      console.log('🔍 PHASE 3: e-Transfer verification workflow');

      // Mark payment as pending verification
      await authenticatedRequest(accountantToken)
        .patch(`/api/payments/${etransferPayment.id}/status`)
        .send({
          status: PaymentStatus.PENDING,
          statusReason: 'Pending bank verification',
          verificationRequired: true
        })
        .expect(200);

      // Upload bank statement for verification
      const verificationResponse = await authenticatedRequest(accountantToken)
        .post(`/api/payments/${etransferPayment.id}/verify`)
        .send({
          verificationMethod: 'BANK_STATEMENT',
          verificationData: {
            statementDate: new Date().toISOString(),
            transactionId: 'BANK_TXN_789012',
            depositAmount: invoice.total,
            senderAccount: '****1234',
            verifiedBy: users.accountant.id,
            verificationNotes: 'Amount and reference verified against bank statement'
          },
          documentUpload: {
            fileName: 'bank_statement_verification.pdf',
            fileSize: 125600,
            mimeType: 'application/pdf',
            uploadPath: '/documents/verifications/bank_statement_123.pdf'
          }
        })
        .expect(200);

      const verification = verificationResponse.body;
      expect(verification.status).toBe('VERIFIED');
      expect(verification.verifiedBy).toBe(users.accountant.id);

      // Confirm payment after verification
      await authenticatedRequest(accountantToken)
        .patch(`/api/payments/${etransferPayment.id}/confirm`)
        .send({
          confirmationNotes: 'Payment verified and confirmed',
          confirmedBy: users.accountant.id
        })
        .expect(200);

      console.log('✅ e-Transfer verification completed');

      // ==========================================================================
      // PHASE 4: BULK E-TRANSFER PROCESSING
      // ==========================================================================
      console.log('📊 PHASE 4: Bulk e-Transfer processing');

      // Create multiple invoices for bulk testing
      const bulkInvoices = [];
      for (let i = 0; i < 3; i++) {
        const bulkInvoice = await createTestInvoice(prisma, organization.id, customer!.id);
        bulkInvoices.push(bulkInvoice);
      }

      // Process bulk e-Transfer file upload
      const bulkEtransferResponse = await authenticatedRequest(accountantToken)
        .post('/api/payments/etransfer/bulk-process')
        .send({
          bankFileType: 'TD_COMMERCIAL',
          uploadDate: new Date().toISOString(),
          transactions: bulkInvoices.map((inv, index) => ({
            referenceNumber: `ETRF${100000 + index}`,
            amount: inv.total,
            senderEmail: `customer${index}@example.com`,
            receivedDate: new Date().toISOString(),
            description: `Payment for invoice ${inv.invoiceNumber}`,
            bankTransactionId: `BANK_${200000 + index}`,
            invoiceNumber: inv.invoiceNumber
          })),
          processingOptions: {
            autoMatch: true,
            autoConfirm: false,
            requireManualReview: true
          }
        })
        .expect(201);

      const bulkProcessing = bulkEtransferResponse.body;
      expect(bulkProcessing.totalTransactions).toBe(3);
      expect(bulkProcessing.matchedTransactions).toBe(3);
      expect(bulkProcessing.unmatchedTransactions).toBe(0);

      console.log(`✅ Bulk e-Transfer processing: ${bulkProcessing.matchedTransactions}/3 matched`);

      // ==========================================================================
      // PHASE 5: E-TRANSFER RECONCILIATION
      // ==========================================================================
      console.log('⚖️ PHASE 5: e-Transfer reconciliation');

      // Generate e-Transfer reconciliation report
      const reconciliationResponse = await authenticatedRequest(accountantToken)
        .get(`/api/payments/etransfer/reconciliation?startDate=${new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()}&endDate=${new Date().toISOString()}`)
        .expect(200);

      const reconciliation = reconciliationResponse.body;
      expect(reconciliation.totalEtransfers).toBeGreaterThan(0);
      expect(reconciliation.totalAmount).toBeGreaterThan(0);
      expect(reconciliation.reconciledTransactions).toBeTruthy();
      expect(reconciliation.unreconciledTransactions).toBeTruthy();

      // Reconcile any unmatched transactions
      if (reconciliation.unreconciledTransactions.length > 0) {
        for (const unreconciled of reconciliation.unreconciledTransactions) {
          await authenticatedRequest(accountantToken)
            .post(`/api/payments/etransfer/reconcile`)
            .send({
              transactionId: unreconciled.id,
              reconciliationType: 'MANUAL_MATCH',
              matchedInvoiceId: bulkInvoices[0].id,
              reconciliationNotes: 'Manually matched during reconciliation process',
              reconciledBy: users.accountant.id
            })
            .expect(200);
        }
      }

      console.log('✅ e-Transfer reconciliation completed');

      // ==========================================================================
      // PHASE 6: E-TRANSFER REFUND PROCESSING
      // ==========================================================================
      console.log('↩️ PHASE 6: e-Transfer refund processing');

      // Process e-Transfer refund
      const refundAmount = 500.00;
      const etransferRefundResponse = await authenticatedRequest(accountantToken)
        .post('/api/payments/etransfer/refund')
        .send({
          originalPaymentId: etransferPayment.id,
          refundAmount,
          refundReason: 'Partial refund requested by customer',
          recipientEmail: 'customer@example.com',
          recipientName: 'John Doe',
          refundMethod: 'INTERAC_ETRANSFER',
          securityQuestion: 'What is your favorite color?',
          securityAnswer: 'blue',
          adminNotes: 'Customer requested partial refund for cancelled services'
        })
        .expect(201);

      const etransferRefund = etransferRefundResponse.body;
      expect(etransferRefund.amount).toBe(refundAmount);
      expect(etransferRefund.status).toBe('PENDING_SEND');
      expect(etransferRefund.refundMethod).toBe('INTERAC_ETRANSFER');

      // Mark refund as sent
      await authenticatedRequest(accountantToken)
        .patch(`/api/payments/refunds/${etransferRefund.id}/sent`)
        .send({
          sentDate: new Date().toISOString(),
          referenceNumber: 'ETRF_REFUND_555666',
          sentBy: users.accountant.id,
          confirmationNotes: 'e-Transfer refund sent to customer'
        })
        .expect(200);

      console.log(`✅ e-Transfer refund processed: $${refundAmount.toFixed(2)}`);

      // ==========================================================================
      // FINAL VALIDATION
      // ==========================================================================
      console.log('🎯 FINAL E-TRANSFER INTEGRATION VALIDATION');

      const endTime = performanceTimer.stop();

      // Verify all e-Transfer payments
      const etransferPaymentsResponse = await authenticatedRequest(accountantToken)
        .get('/api/payments?paymentMethod=INTERAC_ETRANSFER')
        .expect(200);

      const etransferPayments = etransferPaymentsResponse.body.data;
      expect(etransferPayments.length).toBeGreaterThan(3);

      // Verify invoice statuses
      const paidInvoicesResponse = await authenticatedRequest(accountantToken)
        .get('/api/invoices?status=PAID')
        .expect(200);

      const paidInvoices = paidInvoicesResponse.body.data;
      expect(paidInvoices.length).toBeGreaterThan(3);

      // Calculate totals
      const totalEtransferAmount = etransferPayments.reduce((sum: number, p: any) => sum + p.amount, 0);
      const totalFees = etransferPayments.reduce((sum: number, p: any) => sum + (p.processorFee || 0), 0);

      console.log(`🎉 E-TRANSFER INTEGRATION COMPLETE in ${endTime.toFixed(0)}ms`);
      console.log(`📊 e-Transfer Summary:`);
      console.log(`   • Total e-Transfers Processed: ${etransferPayments.length}`);
      console.log(`   • Total Amount: $${totalEtransferAmount.toFixed(2)}`);
      console.log(`   • Total Fees: $${totalFees.toFixed(2)} (should be $0.00)`);
      console.log(`   • Bulk Processing: 3 transactions`);
      console.log(`   • Refunds Processed: $${refundAmount.toFixed(2)}`);

    }, 120000); // 2 minute timeout

    test('should handle e-Transfer security and fraud detection', async () => {
      const { organization, users, customers, authTokens } = testContext;
      const customer = customers[0];
      const accountantToken = authTokens.accountant;

      console.log('🔒 Testing e-Transfer security and fraud detection...');

      const invoice = await createTestInvoice(prisma, organization.id, customer!.id);

      // Test suspicious e-Transfer detection
      const suspiciousEtransferResponse = await authenticatedRequest(accountantToken)
        .post('/api/payments')
        .send({
          customerId: customer!.id,
          invoiceId: invoice.id,
          amount: invoice.total,
          paymentMethod: PaymentMethod.INTERAC_ETRANSFER,
          referenceNumber: 'SUSPICIOUS_REF_999',
          customerNotes: 'Urgent payment please process immediately',
          metadata: JSON.stringify({
            sender_email: 'suspicious@fake-domain.com',
            risk_indicators: ['unusual_amount', 'new_sender', 'urgent_language'],
            fraud_score: 85
          })
        })
        .expect(201);

      const suspiciousPayment = suspiciousPaymentResponse.body;

      // Payment should be flagged for review
      expect(suspiciousPayment.status).toBe(PaymentStatus.PENDING);
      expect(suspiciousPayment.requiresReview).toBe(true);

      // Test fraud review workflow
      const fraudReviewResponse = await authenticatedRequest(accountantToken)
        .post(`/api/payments/${suspiciousPayment.id}/fraud-review`)
        .send({
          reviewAction: 'APPROVE',
          reviewNotes: 'Verified with customer via phone call',
          reviewedBy: users.accountant.id,
          additionalVerification: {
            method: 'PHONE_VERIFICATION',
            verificationCode: 'PHONE_VER_123',
            verifiedData: 'Customer confirmed payment details'
          }
        })
        .expect(200);

      expect(fraudReviewResponse.body.status).toBe(PaymentStatus.COMPLETED);
      expect(fraudReviewResponse.body.fraudReviewPassed).toBe(true);

      console.log('✅ e-Transfer fraud detection and review validated');
    });
  });

  describe('Payment Processing Security and Compliance', () => {
    test('should enforce PCI compliance for card data handling', async () => {
      const { organization, users, customers, authTokens } = testContext;
      const accountantToken = authTokens.accountant;

      console.log('🔐 Testing PCI compliance for payment processing...');

      // Test that raw card data cannot be stored
      const pciViolationTest = await authenticatedRequest(accountantToken)
        .post('/api/payments')
        .send({
          customerId: customers[0]!.id,
          amount: 100.00,
          paymentMethod: PaymentMethod.STRIPE_CARD,
          cardNumber: '4242424242424242', // This should be rejected
          cvv: '123',
          expiryMonth: '12',
          expiryYear: '2025'
        })
        .expect(400); // Should reject raw card data

      expect(pciViolationTest.body.error).toContain('Raw card data not permitted');

      // Test that only tokenized card references are allowed
      const validTokenizedPayment = await authenticatedRequest(accountantToken)
        .post('/api/payments')
        .send({
          customerId: customers[0]!.id,
          amount: 100.00,
          paymentMethod: PaymentMethod.STRIPE_CARD,
          stripePaymentMethodId: 'pm_card_visa', // Tokenized reference
          referenceNumber: 'ch_tokenized_payment_123'
        })
        .expect(201);

      expect(validTokenizedPayment.body.cardNumber).toBeUndefined();
      expect(validTokenizedPayment.body.cvv).toBeUndefined();

      console.log('✅ PCI compliance enforced - raw card data rejected');
    });

    test('should implement proper payment authorization controls', async () => {
      const { organization, users, customers, authTokens } = testContext;

      console.log('🔑 Testing payment authorization controls...');

      // Test that VIEWER cannot process payments
      await authenticatedRequest(authTokens.viewer)
        .post('/api/payments')
        .send({
          customerId: customers[0]!.id,
          amount: 1000.00,
          paymentMethod: PaymentMethod.STRIPE_CARD
        })
        .expect(403);

      // Test that EMPLOYEE can process small payments but not large ones
      const largePaymentAmount = 10000.00;
      await authenticatedRequest(authTokens.employee)
        .post('/api/payments')
        .send({
          customerId: customers[0]!.id,
          amount: largePaymentAmount,
          paymentMethod: PaymentMethod.STRIPE_CARD
        })
        .expect(403); // Should require higher authorization

      // Test that ACCOUNTANT can process large payments
      const largePayment = await authenticatedRequest(authTokens.accountant)
        .post('/api/payments')
        .send({
          customerId: customers[0]!.id,
          amount: largePaymentAmount,
          paymentMethod: PaymentMethod.INTERAC_ETRANSFER,
          referenceNumber: 'LARGE_PAYMENT_123',
          requiresApproval: true
        })
        .expect(201);

      expect(largePayment.body.status).toBe(PaymentStatus.PENDING); // Should require approval

      // Test approval workflow
      await authenticatedRequest(authTokens.manager)
        .patch(`/api/payments/${largePayment.body.id}/approve`)
        .send({
          approvalNotes: 'Large payment approved by manager',
          approvedBy: users.manager.id
        })
        .expect(200);

      console.log('✅ Payment authorization controls validated');
    });

    test('should maintain comprehensive audit trails for all payment activities', async () => {
      const { organization, users, customers, authTokens } = testContext;
      const accountantToken = authTokens.accountant;

      console.log('📊 Testing payment audit trail completeness...');

      const payment = await createTestPayment(prisma, organization.id, customers[0]!.id);

      // Perform various payment operations
      await authenticatedRequest(accountantToken)
        .patch(`/api/payments/${payment.id}/status`)
        .send({ status: PaymentStatus.PENDING, statusReason: 'Verification required' })
        .expect(200);

      await authenticatedRequest(accountantToken)
        .post(`/api/payments/${payment.id}/notes`)
        .send({ note: 'Payment verification completed', noteType: 'INTERNAL' })
        .expect(201);

      await authenticatedRequest(accountantToken)
        .patch(`/api/payments/${payment.id}/confirm`)
        .send({ confirmationNotes: 'Payment confirmed' })
        .expect(200);

      // Verify comprehensive audit trail
      const auditResponse = await authenticatedRequest(accountantToken)
        .get(`/api/audit-logs?entityType=Payment&entityId=${payment.id}`)
        .expect(200);

      const auditLogs = auditResponse.body.data;
      expect(auditLogs.length).toBeGreaterThan(4); // Creation + status change + note + confirmation

      // Verify audit log contains all required information
      auditLogs.forEach((log: any) => {
        expect(log.userId).toBeTruthy();
        expect(log.action).toBeTruthy();
        expect(log.timestamp).toBeTruthy();
        expect(log.ipAddress).toBeTruthy();
        expect(log.userAgent).toBeTruthy();
        expect(log.organizationId).toBe(organization.id);
      });

      console.log(`✅ Payment audit trail validated - ${auditLogs.length} entries`);
    });
  });

  describe('Payment Processing Performance and Reliability', () => {
    test('should handle high-volume payment processing efficiently', async () => {
      const { organization, users, customers, authTokens } = testContext;
      const accountantToken = authTokens.accountant;

      console.log('⚡ Testing high-volume payment processing...');

      const startTime = performance.now();
      const batchSize = 20;
      const payments = [];

      // Create batch of payments
      for (let i = 0; i < batchSize; i++) {
        const invoice = await createTestInvoice(prisma, organization.id, customers[0]!.id);

        const paymentPromise = authenticatedRequest(accountantToken)
          .post('/api/payments')
          .send({
            customerId: customers[0]!.id,
            invoiceId: invoice.id,
            amount: invoice.total,
            paymentMethod: PaymentMethod.INTERAC_ETRANSFER,
            referenceNumber: `BATCH_PAYMENT_${i + 1}`,
            customerNotes: `Batch payment ${i + 1}`
          });

        payments.push(paymentPromise);
      }

      // Process all payments concurrently
      const results = await Promise.all(payments);
      const endTime = performance.now();

      // Verify all payments succeeded
      results.forEach(result => {
        expect(result.status).toBe(201);
        expect(result.body.status).toBe(PaymentStatus.COMPLETED);
      });

      const processingTime = endTime - startTime;
      const avgTimePerPayment = processingTime / batchSize;

      expect(avgTimePerPayment).toBeLessThan(1000); // Should process each payment in under 1 second
      expect(processingTime).toBeLessThan(30000); // Total batch should take under 30 seconds

      console.log(`✅ High-volume processing: ${batchSize} payments in ${processingTime.toFixed(0)}ms (avg: ${avgTimePerPayment.toFixed(0)}ms per payment)`);
    });

    test('should implement payment retry and recovery mechanisms', async () => {
      const { organization, users, customers, authTokens } = testContext;
      const accountantToken = authTokens.accountant;

      console.log('🔄 Testing payment retry and recovery mechanisms...');

      // Create a payment that will fail
      const failedPaymentResponse = await authenticatedRequest(accountantToken)
        .post('/api/payments')
        .send({
          customerId: customers[0]!.id,
          amount: 100.00,
          paymentMethod: PaymentMethod.STRIPE_CARD,
          referenceNumber: 'WILL_FAIL_123',
          metadata: JSON.stringify({ simulate_failure: true })
        })
        .expect(201);

      const failedPayment = failedPaymentResponse.body;

      // Simulate payment failure
      await authenticatedRequest(accountantToken)
        .patch(`/api/payments/${failedPayment.id}/fail`)
        .send({
          failureReason: 'Network timeout during processing',
          failureCode: 'NETWORK_TIMEOUT',
          retryable: true
        })
        .expect(200);

      // Test automatic retry mechanism
      const retryResponse = await authenticatedRequest(accountantToken)
        .post(`/api/payments/${failedPayment.id}/retry`)
        .send({
          retryReason: 'Automatic retry after network timeout',
          maxRetries: 3,
          retryDelay: 5000 // 5 seconds
        })
        .expect(200);

      expect(retryResponse.body.retryAttempt).toBe(2);
      expect(retryResponse.body.status).toBe(PaymentStatus.PENDING);

      // Test exponential backoff for multiple failures
      for (let attempt = 2; attempt <= 3; attempt++) {
        await delay(1000); // Wait for retry

        await authenticatedRequest(accountantToken)
          .patch(`/api/payments/${failedPayment.id}/fail`)
          .send({
            failureReason: `Retry attempt ${attempt} failed`,
            failureCode: 'RETRY_FAILED',
            retryable: attempt < 3
          })
          .expect(200);

        if (attempt < 3) {
          await authenticatedRequest(accountantToken)
            .post(`/api/payments/${failedPayment.id}/retry`)
            .expect(200);
        }
      }

      // After max retries, payment should be marked as permanently failed
      const finalStatusResponse = await authenticatedRequest(accountantToken)
        .get(`/api/payments/${failedPayment.id}`)
        .expect(200);

      expect(finalStatusResponse.body.status).toBe(PaymentStatus.FAILED);
      expect(finalStatusResponse.body.retryAttempts).toBe(3);
      expect(finalStatusResponse.body.retryable).toBe(false);

      console.log('✅ Payment retry and recovery mechanisms validated');
    });
  });
});