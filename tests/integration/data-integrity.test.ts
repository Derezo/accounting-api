import { describe, test, expect, beforeEach } from '@jest/globals';
import { prisma, authenticatedRequest } from './setup';
import {
  createTestContext,
  createTestCustomer,
  createTestQuote,
  createTestInvoice,
  createTestPayment,
  createTestProject,
  delay,
  TestContext
} from './test-utils';
import { QuoteStatus, InvoiceStatus, PaymentStatus, ProjectStatus } from '../../src/types/enums';

describe('Data Integrity and Consistency Integration Tests', () => {
  let testContext: TestContext;

  beforeEach(async () => {
    testContext = await createTestContext(prisma, 'Data Integrity Test Org');
  });

  describe('Database Transaction Integrity', () => {
    test('should maintain ACID properties during complex operations', async () => {
      const { organization, authTokens, customers } = testContext;
      const customer = customers[0];
      const adminToken = authTokens.admin;

      // Create quote with multiple items
      const quoteResponse = await authenticatedRequest(adminToken)
        .post('/api/quotes')
        .send({
          customerId: customer.id,
          validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          items: [
            {
              description: 'Service A',
              quantity: 10,
              unitPrice: 100.00,
              taxRate: 0.13
            },
            {
              description: 'Service B',
              quantity: 5,
              unitPrice: 200.00,
              taxRate: 0.13
            },
            {
              description: 'Service C',
              quantity: 2,
              unitPrice: 500.00,
              taxRate: 0.13
            }
          ]
        })
        .expect(201);

      const quote = quoteResponse.body;

      // Verify all quote items were created atomically
      const quoteItems = await prisma.quoteItem.findMany({
        where: { quoteId: quote.id }
      });

      expect(quoteItems).toHaveLength(3);

      // Verify calculated totals are consistent
      const expectedSubtotal = (10 * 100) + (5 * 200) + (2 * 500); // 3000
      const expectedTax = expectedSubtotal * 0.13; // 390
      const expectedTotal = expectedSubtotal + expectedTax; // 3390

      expect(quote.subtotal).toBe(expectedSubtotal);
      expect(quote.taxAmount).toBe(expectedTax);
      expect(quote.total).toBe(expectedTotal);

      // Test transaction rollback on error
      try {
        await authenticatedRequest(adminToken)
          .post('/api/quotes')
          .send({
            customerId: 'invalid-customer-id', // This should cause an error
            validUntil: new Date().toISOString(),
            items: [
              {
                description: 'Should not be created',
                quantity: 1,
                unitPrice: 100.00,
                taxRate: 0.13
              }
            ]
          })
          .expect(400);
      } catch (error) {
        // Expected to fail
      }

      // Verify no orphaned quote items were created
      const orphanedItems = await prisma.quoteItem.findMany({
        where: {
          quote: {
            customerId: 'invalid-customer-id'
          }
        }
      });

      expect(orphanedItems).toHaveLength(0);

      console.log('✅ ACID transaction integrity test completed');
    });

    test('should handle concurrent operations without data corruption', async () => {
      const { organization, authTokens, customers } = testContext;
      const customer = customers[0];
      const adminToken = authTokens.admin;

      // Create invoice for concurrent payment testing
      const invoice = await createTestInvoice(
        prisma,
        organization.id,
        customer.id
      );

      const paymentAmount = invoice.total / 3; // Each payment is 1/3 of total

      // Simulate concurrent payment processing
      const concurrentPayments = await Promise.allSettled([
        authenticatedRequest(adminToken)
          .post('/api/payments')
          .send({
            customerId: customer.id,
            invoiceId: invoice.id,
            amount: paymentAmount,
            paymentMethod: 'STRIPE_CARD',
            referenceNumber: 'CONCURRENT_1'
          }),

        authenticatedRequest(adminToken)
          .post('/api/payments')
          .send({
            customerId: customer.id,
            invoiceId: invoice.id,
            amount: paymentAmount,
            paymentMethod: 'INTERAC_ETRANSFER',
            referenceNumber: 'CONCURRENT_2'
          }),

        authenticatedRequest(adminToken)
          .post('/api/payments')
          .send({
            customerId: customer.id,
            invoiceId: invoice.id,
            amount: paymentAmount,
            paymentMethod: 'CASH',
            referenceNumber: 'CONCURRENT_3'
          })
      ]);

      // All payments should succeed
      expect(concurrentPayments.every(result => result.status === 'fulfilled')).toBe(true);

      // Verify invoice totals are correct
      const updatedInvoice = await prisma.invoice.findUnique({
        where: { id: invoice.id },
        include: { payments: true }
      });

      expect(updatedInvoice?.payments).toHaveLength(3);
      expect(updatedInvoice?.amountPaid).toBe(invoice.total);
      expect(updatedInvoice?.balance).toBe(0);
      expect(updatedInvoice?.status).toBe(InvoiceStatus.PAID);

      console.log('✅ Concurrent operations integrity test completed');
    });
  });

  describe('Foreign Key Constraint Validation', () => {
    test('should enforce referential integrity across all entities', async () => {
      const { organization, authTokens } = testContext;
      const adminToken = authTokens.admin;

      // Test 1: Cannot create quote with non-existent customer
      await authenticatedRequest(adminToken)
        .post('/api/quotes')
        .send({
          customerId: 'non-existent-customer-id',
          validUntil: new Date().toISOString(),
          items: []
        })
        .expect(400);

      // Test 2: Cannot create invoice with non-existent quote
      const customer = await createTestCustomer(prisma, organization.id, 'PERSON');

      await authenticatedRequest(adminToken)
        .post('/api/invoices')
        .send({
          customerId: customer.id,
          quoteId: 'non-existent-quote-id',
          dueDate: new Date().toISOString()
        })
        .expect(400);

      // Test 3: Cannot create payment with non-existent invoice
      await authenticatedRequest(adminToken)
        .post('/api/payments')
        .send({
          customerId: customer.id,
          invoiceId: 'non-existent-invoice-id',
          amount: 100.00,
          paymentMethod: 'CASH'
        })
        .expect(400);

      // Test 4: Cannot delete customer with existing quotes
      const quote = await createTestQuote(
        prisma,
        organization.id,
        customer.id,
        testContext.users.admin.id
      );

      await authenticatedRequest(adminToken)
        .delete(`/api/customers/${customer.id}`)
        .expect(409); // Conflict due to existing quotes

      // Test 5: Can delete customer after removing dependent records
      await prisma.quoteItem.deleteMany({ where: { quoteId: quote.id } });
      await prisma.quote.delete({ where: { id: quote.id } });

      await authenticatedRequest(adminToken)
        .delete(`/api/customers/${customer.id}`)
        .expect(200);

      console.log('✅ Referential integrity test completed');
    });

    test('should handle cascading deletes properly', async () => {
      const { organization, authTokens } = testContext;
      const adminToken = authTokens.admin;

      // Create customer with complete data hierarchy
      const customer = await createTestCustomer(prisma, organization.id, 'PERSON');
      const quote = await createTestQuote(
        prisma,
        organization.id,
        customer.id,
        testContext.users.admin.id
      );
      const invoice = await createTestInvoice(
        prisma,
        organization.id,
        customer.id,
        quote.id
      );
      const payment = await createTestPayment(
        prisma,
        organization.id,
        customer.id,
        invoice.id
      );
      const project = await createTestProject(
        prisma,
        organization.id,
        customer.id,
        testContext.users.admin.id
      );

      // Get initial counts
      const initialQuoteItems = await prisma.quoteItem.count({ where: { quoteId: quote.id } });
      const initialInvoiceItems = await prisma.invoiceItem.count({ where: { invoiceId: invoice.id } });

      expect(initialQuoteItems).toBeGreaterThan(0);
      expect(initialInvoiceItems).toBeGreaterThan(0);

      // Soft delete customer (should maintain referential integrity)
      await authenticatedRequest(adminToken)
        .patch(`/api/customers/${customer.id}`)
        .send({ deletedAt: new Date().toISOString() })
        .expect(200);

      // Verify soft delete doesn't break references
      const softDeletedCustomer = await prisma.customer.findUnique({
        where: { id: customer.id },
        include: {
          quotes: true,
          invoices: true,
          payments: true,
          projects: true
        }
      });

      expect(softDeletedCustomer?.deletedAt).toBeTruthy();
      expect(softDeletedCustomer?.quotes).toHaveLength(1);
      expect(softDeletedCustomer?.invoices).toHaveLength(1);
      expect(softDeletedCustomer?.payments).toHaveLength(1);
      expect(softDeletedCustomer?.projects).toHaveLength(1);

      console.log('✅ Cascading delete handling test completed');
    });
  });

  describe('Data Validation Consistency', () => {
    test('should validate business rules across operations', async () => {
      const { organization, authTokens, customers } = testContext;
      const customer = customers[0];
      const adminToken = authTokens.admin;

      // Test 1: Quote total must match sum of items
      await authenticatedRequest(adminToken)
        .post('/api/quotes')
        .send({
          customerId: customer.id,
          validUntil: new Date().toISOString(),
          subtotal: 1000.00, // Incorrect total
          taxAmount: 130.00,
          total: 1130.00,
          items: [
            {
              description: 'Service',
              quantity: 1,
              unitPrice: 500.00, // Should result in different total
              taxRate: 0.13
            }
          ]
        })
        .expect(400); // Should fail validation

      // Test 2: Payment amount cannot exceed invoice balance
      const invoice = await createTestInvoice(
        prisma,
        organization.id,
        customer.id
      );

      await authenticatedRequest(adminToken)
        .post('/api/payments')
        .send({
          customerId: customer.id,
          invoiceId: invoice.id,
          amount: invoice.total + 1000.00, // Exceeds invoice total
          paymentMethod: 'CASH'
        })
        .expect(400);

      // Test 3: Project dates must be logical
      await authenticatedRequest(adminToken)
        .post('/api/projects')
        .send({
          name: 'Invalid Date Project',
          customerId: customer.id,
          startDate: new Date('2024-12-01').toISOString(),
          endDate: new Date('2024-11-01').toISOString(), // End before start
          estimatedHours: 40
        })
        .expect(400);

      // Test 4: Quote cannot be accepted if expired
      const expiredQuote = await createTestQuote(
        prisma,
        organization.id,
        customer.id,
        testContext.users.admin.id
      );

      // Manually set quote as expired
      await prisma.quote.update({
        where: { id: expiredQuote.id },
        data: { validUntil: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Yesterday
      });

      await authenticatedRequest(adminToken)
        .patch(`/api/quotes/${expiredQuote.id}/accept`)
        .expect(400); // Should fail - quote expired

      console.log('✅ Business rules validation test completed');
    });

    test('should maintain numerical precision in financial calculations', async () => {
      const { organization, authTokens, customers } = testContext;
      const customer = customers[0];
      const adminToken = authTokens.admin;

      // Test with precise decimal calculations
      const quoteResponse = await authenticatedRequest(adminToken)
        .post('/api/quotes')
        .send({
          customerId: customer.id,
          validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          items: [
            {
              description: 'Precision Test Service',
              quantity: 3.333,
              unitPrice: 123.456,
              discountPercent: 5.5,
              taxRate: 0.13
            }
          ]
        })
        .expect(201);

      const quote = quoteResponse.body;
      const item = quote.items[0];

      // Verify calculations maintain precision
      const expectedSubtotal = 3.333 * 123.456; // 411.5193
      const expectedDiscount = expectedSubtotal * 0.055; // 22.6336
      const expectedAfterDiscount = expectedSubtotal - expectedDiscount; // 388.8857
      const expectedTax = expectedAfterDiscount * 0.13; // 50.5551
      const expectedTotal = expectedAfterDiscount + expectedTax; // 439.4408

      // Allow for small floating point differences
      expect(Math.abs(item.subtotal - expectedSubtotal)).toBeLessThan(0.01);
      expect(Math.abs(item.discountAmount - expectedDiscount)).toBeLessThan(0.01);
      expect(Math.abs(item.taxAmount - expectedTax)).toBeLessThan(0.01);
      expect(Math.abs(item.total - expectedTotal)).toBeLessThan(0.01);

      // Test currency rounding
      const roundedTotal = Math.round(item.total * 100) / 100; // Round to cents
      expect(item.total).toBeCloseTo(roundedTotal, 2);

      console.log('✅ Numerical precision test completed');
    });
  });

  describe('Audit Trail Completeness', () => {
    test('should create complete audit trail for all operations', async () => {
      const { organization, authTokens, customers, users } = testContext;
      const customer = customers[0];
      const adminToken = authTokens.admin;

      // Create a complete business workflow and track audit trail
      const initialAuditCount = await prisma.auditLog.count({
        where: { organizationId: organization.id }
      });

      // Step 1: Create quote
      const quoteResponse = await authenticatedRequest(adminToken)
        .post('/api/quotes')
        .send({
          customerId: customer.id,
          validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          items: [
            {
              description: 'Audit Test Service',
              quantity: 1,
              unitPrice: 1000.00,
              taxRate: 0.13
            }
          ]
        })
        .expect(201);

      const quote = quoteResponse.body;

      // Step 2: Send quote
      await authenticatedRequest(adminToken)
        .patch(`/api/quotes/${quote.id}/send`)
        .expect(200);

      // Step 3: Accept quote
      await authenticatedRequest(adminToken)
        .patch(`/api/quotes/${quote.id}/accept`)
        .expect(200);

      // Step 4: Create invoice
      const invoiceResponse = await authenticatedRequest(adminToken)
        .post('/api/invoices')
        .send({
          customerId: customer.id,
          quoteId: quote.id,
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        })
        .expect(201);

      const invoice = invoiceResponse.body;

      // Step 5: Process payment
      await authenticatedRequest(adminToken)
        .post('/api/payments')
        .send({
          customerId: customer.id,
          invoiceId: invoice.id,
          amount: invoice.total,
          paymentMethod: 'STRIPE_CARD',
          referenceNumber: 'AUDIT_TEST_123'
        })
        .expect(201);

      // Verify audit trail completeness
      const finalAuditCount = await prisma.auditLog.count({
        where: { organizationId: organization.id }
      });

      // Should have created multiple audit entries
      expect(finalAuditCount).toBeGreaterThan(initialAuditCount + 5);

      // Get all audit logs for this workflow
      const auditLogs = await prisma.auditLog.findMany({
        where: {
          organizationId: organization.id,
          userId: users.admin.id,
          OR: [
            { entityType: 'Quote', entityId: quote.id },
            { entityType: 'Invoice', entityId: invoice.id },
            { entityType: 'Payment' }
          ]
        },
        orderBy: { timestamp: 'asc' }
      });

      // Verify key audit events
      const auditActions = auditLogs.map(log => ({ action: log.action, entityType: log.entityType }));

      expect(auditActions.some(a => a.action === 'CREATE' && a.entityType === 'Quote')).toBe(true);
      expect(auditActions.some(a => a.action === 'UPDATE' && a.entityType === 'Quote')).toBe(true);
      expect(auditActions.some(a => a.action === 'CREATE' && a.entityType === 'Invoice')).toBe(true);
      expect(auditActions.some(a => a.action === 'CREATE' && a.entityType === 'Payment')).toBe(true);

      // Verify audit logs contain change details
      const quoteCreationLog = auditLogs.find(log =>
        log.action === 'CREATE' && log.entityType === 'Quote' && log.entityId === quote.id
      );

      expect(quoteCreationLog).toBeTruthy();
      expect(quoteCreationLog?.changes).toBeTruthy();

      const changes = JSON.parse(quoteCreationLog!.changes!);
      expect(changes.after).toBeTruthy();
      expect(changes.after.status).toBe(QuoteStatus.DRAFT);

      console.log('✅ Audit trail completeness test completed');
    });

    test('should track data changes with before/after snapshots', async () => {
      const { organization, authTokens, customers, users } = testContext;
      const customer = customers[0];
      const adminToken = authTokens.admin;

      // Update customer with trackable changes
      const originalCustomer = await prisma.customer.findUnique({
        where: { id: customer.id }
      });

      const updateResponse = await authenticatedRequest(adminToken)
        .patch(`/api/customers/${customer.id}`)
        .send({
          paymentTerms: 45, // Change from original
          notes: 'Updated payment terms for better cash flow',
          creditLimit: 5000.00
        })
        .expect(200);

      // Find the audit log for this update
      const updateAuditLog = await prisma.auditLog.findFirst({
        where: {
          organizationId: organization.id,
          userId: users.admin.id,
          action: 'UPDATE',
          entityType: 'Customer',
          entityId: customer.id
        },
        orderBy: { timestamp: 'desc' }
      });

      expect(updateAuditLog).toBeTruthy();
      expect(updateAuditLog?.changes).toBeTruthy();

      const changes = JSON.parse(updateAuditLog!.changes!);
      expect(changes.before).toBeTruthy();
      expect(changes.after).toBeTruthy();

      // Verify specific field changes
      expect(changes.before.paymentTerms).toBe(originalCustomer?.paymentTerms);
      expect(changes.after.paymentTerms).toBe(45);
      expect(changes.after.notes).toBe('Updated payment terms for better cash flow');

      console.log('✅ Data change tracking test completed');
    });
  });

  describe('Data Consistency Across Services', () => {
    test('should maintain consistency between quotes and invoices', async () => {
      const { organization, authTokens, customers } = testContext;
      const customer = customers[0];
      const adminToken = authTokens.admin;

      // Create quote
      const quote = await createTestQuote(
        prisma,
        organization.id,
        customer.id,
        testContext.users.admin.id
      );

      // Accept quote
      await authenticatedRequest(adminToken)
        .patch(`/api/quotes/${quote.id}/accept`)
        .expect(200);

      // Create invoice from quote
      const invoiceResponse = await authenticatedRequest(adminToken)
        .post('/api/invoices')
        .send({
          customerId: customer.id,
          quoteId: quote.id,
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        })
        .expect(201);

      const invoice = invoiceResponse.body;

      // Verify invoice inherits quote data correctly
      expect(invoice.customerId).toBe(quote.customerId);
      expect(invoice.quoteId).toBe(quote.id);
      expect(invoice.total).toBe(quote.total);
      expect(invoice.subtotal).toBe(quote.subtotal);
      expect(invoice.taxAmount).toBe(quote.taxAmount);

      // Verify invoice items match quote items
      const quoteItems = await prisma.quoteItem.findMany({
        where: { quoteId: quote.id },
        orderBy: { sortOrder: 'asc' }
      });

      const invoiceItems = await prisma.invoiceItem.findMany({
        where: { invoiceId: invoice.id },
        orderBy: { sortOrder: 'asc' }
      });

      expect(invoiceItems).toHaveLength(quoteItems.length);

      for (let i = 0; i < quoteItems.length; i++) {
        const quoteItem = quoteItems[i];
        const invoiceItem = invoiceItems[i];

        expect(invoiceItem.description).toBe(quoteItem.description);
        expect(invoiceItem.quantity).toBe(quoteItem.quantity);
        expect(invoiceItem.unitPrice).toBe(quoteItem.unitPrice);
        expect(invoiceItem.total).toBe(quoteItem.total);
      }

      console.log('✅ Quote-Invoice consistency test completed');
    });

    test('should maintain payment-invoice balance integrity', async () => {
      const { organization, authTokens, customers } = testContext;
      const customer = customers[0];
      const adminToken = authTokens.admin;

      const invoice = await createTestInvoice(
        prisma,
        organization.id,
        customer.id
      );

      const payment1Amount = invoice.total * 0.4; // 40%
      const payment2Amount = invoice.total * 0.6; // 60%

      // First payment
      const payment1Response = await authenticatedRequest(adminToken)
        .post('/api/payments')
        .send({
          customerId: customer.id,
          invoiceId: invoice.id,
          amount: payment1Amount,
          paymentMethod: 'CASH',
          referenceNumber: 'CASH_001'
        })
        .expect(201);

      // Check invoice after first payment
      let invoiceCheck = await prisma.invoice.findUnique({
        where: { id: invoice.id }
      });

      expect(invoiceCheck?.amountPaid).toBe(payment1Amount);
      expect(invoiceCheck?.balance).toBe(invoice.total - payment1Amount);
      expect(invoiceCheck?.status).toBe(InvoiceStatus.PARTIALLY_PAID);

      // Second payment
      const payment2Response = await authenticatedRequest(adminToken)
        .post('/api/payments')
        .send({
          customerId: customer.id,
          invoiceId: invoice.id,
          amount: payment2Amount,
          paymentMethod: 'STRIPE_CARD',
          referenceNumber: 'STRIPE_002'
        })
        .expect(201);

      // Check invoice after second payment
      invoiceCheck = await prisma.invoice.findUnique({
        where: { id: invoice.id }
      });

      expect(invoiceCheck?.amountPaid).toBe(invoice.total);
      expect(invoiceCheck?.balance).toBe(0);
      expect(invoiceCheck?.status).toBe(InvoiceStatus.PAID);
      expect(invoiceCheck?.paidAt).toBeTruthy();

      // Verify payment totals
      const allPayments = await prisma.payment.findMany({
        where: { invoiceId: invoice.id }
      });

      const totalPaid = allPayments.reduce((sum, payment) => sum + payment.amount, 0);
      expect(totalPaid).toBe(invoice.total);

      console.log('✅ Payment-Invoice balance integrity test completed');
    });

    test('should handle complex multi-entity consistency scenarios', async () => {
      const { organization, authTokens, customers } = testContext;
      const customer = customers[0];
      const adminToken = authTokens.admin;

      // Create a complex scenario: Quote → Invoice → Partial Payment → Project → Completion

      // Step 1: Create and accept quote
      const quote = await createTestQuote(
        prisma,
        organization.id,
        customer.id,
        testContext.users.admin.id
      );

      await authenticatedRequest(adminToken)
        .patch(`/api/quotes/${quote.id}/accept`)
        .expect(200);

      // Step 2: Create invoice from quote
      const invoiceResponse = await authenticatedRequest(adminToken)
        .post('/api/invoices')
        .send({
          customerId: customer.id,
          quoteId: quote.id,
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        })
        .expect(201);

      const invoice = invoiceResponse.body;

      // Step 3: Create project from quote
      const projectResponse = await authenticatedRequest(adminToken)
        .post('/api/projects')
        .send({
          name: 'Integration Test Project',
          customerId: customer.id,
          assignedToId: testContext.users.admin.id,
          estimatedHours: 40,
          hourlyRate: 150.00
        })
        .expect(201);

      const project = projectResponse.body;

      // Step 4: Make partial payment (50%)
      const partialAmount = invoice.total * 0.5;
      await authenticatedRequest(adminToken)
        .post('/api/payments')
        .send({
          customerId: customer.id,
          invoiceId: invoice.id,
          amount: partialAmount,
          paymentMethod: 'STRIPE_CARD',
          referenceNumber: 'PARTIAL_PAY_001'
        })
        .expect(201);

      // Step 5: Start project
      await authenticatedRequest(adminToken)
        .patch(`/api/projects/${project.id}/start`)
        .expect(200);

      // Step 6: Complete payment
      const remainingAmount = invoice.total - partialAmount;
      await authenticatedRequest(adminToken)
        .post('/api/payments')
        .send({
          customerId: customer.id,
          invoiceId: invoice.id,
          amount: remainingAmount,
          paymentMethod: 'INTERAC_ETRANSFER',
          referenceNumber: 'FINAL_PAY_001'
        })
        .expect(201);

      // Step 7: Complete project
      await authenticatedRequest(adminToken)
        .patch(`/api/projects/${project.id}/complete`)
        .send({
          completionNotes: 'Project completed successfully',
          finalHours: 38
        })
        .expect(200);

      // Verify final state consistency
      const finalQuote = await prisma.quote.findUnique({
        where: { id: quote.id },
        include: { invoice: true }
      });

      const finalInvoice = await prisma.invoice.findUnique({
        where: { id: invoice.id },
        include: { payments: true }
      });

      const finalProject = await prisma.project.findUnique({
        where: { id: project.id }
      });

      // Verify all relationships and states
      expect(finalQuote?.status).toBe(QuoteStatus.ACCEPTED);
      expect(finalQuote?.invoice?.id).toBe(invoice.id);

      expect(finalInvoice?.status).toBe(InvoiceStatus.PAID);
      expect(finalInvoice?.amountPaid).toBe(invoice.total);
      expect(finalInvoice?.balance).toBe(0);
      expect(finalInvoice?.payments).toHaveLength(2);

      expect(finalProject?.status).toBe(ProjectStatus.COMPLETED);
      expect(finalProject?.completedAt).toBeTruthy();

      // Verify financial consistency
      const totalPayments = finalInvoice!.payments.reduce((sum, p) => sum + p.amount, 0);
      expect(totalPayments).toBe(invoice.total);

      console.log('✅ Complex multi-entity consistency test completed');
    });
  });

  describe('Database Performance and Optimization', () => {
    test('should maintain query performance with large datasets', async () => {
      const { organization, authTokens } = testContext;
      const adminToken = authTokens.admin;

      // Create large dataset
      const customerCount = 100;
      const quotesPerCustomer = 5;

      console.log('Creating large test dataset...');

      const customers = [];
      for (let i = 0; i < customerCount; i++) {
        const customer = await createTestCustomer(
          prisma,
          organization.id,
          i % 2 === 0 ? 'PERSON' : 'BUSINESS'
        );
        customers.push(customer);
      }

      // Create quotes for each customer
      for (const customer of customers) {
        for (let j = 0; j < quotesPerCustomer; j++) {
          await createTestQuote(
            prisma,
            organization.id,
            customer.id,
            testContext.users.admin.id
          );
        }
      }

      console.log('Testing query performance...');

      // Test paginated customer listing performance
      const startTime = Date.now();

      const customersResponse = await authenticatedRequest(adminToken)
        .get('/api/customers?page=1&limit=50&sort=createdAt&order=desc')
        .expect(200);

      const queryTime = Date.now() - startTime;

      expect(customersResponse.body.data).toHaveLength(50);
      expect(customersResponse.body.pagination.total).toBe(customerCount + 2); // +2 from beforeEach
      expect(queryTime).toBeLessThan(1000); // Should complete within 1 second

      // Test search performance
      const searchStartTime = Date.now();

      await authenticatedRequest(adminToken)
        .get('/api/customers?search=test')
        .expect(200);

      const searchTime = Date.now() - searchStartTime;
      expect(searchTime).toBeLessThan(500); // Search should be fast

      // Test complex query with joins
      const complexQueryStartTime = Date.now();

      const complexResponse = await authenticatedRequest(adminToken)
        .get('/api/customers?include=quotes,invoices,payments&limit=25')
        .expect(200);

      const complexQueryTime = Date.now() - complexQueryStartTime;
      expect(complexQueryTime).toBeLessThan(2000); // Complex queries allowed more time

      console.log(`✅ Performance test completed:
        - Simple query: ${queryTime}ms
        - Search query: ${searchTime}ms
        - Complex query: ${complexQueryTime}ms`);
    });
  });
});