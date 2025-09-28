import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { invoiceService } from '../../src/services/invoice.service';
import { CustomerTier, CustomerStatus, InvoiceStatus } from '../../src/types/enums';
import { prisma, createTestOrganization, createTestUser, cleanupDatabase } from '../testUtils';

describe('InvoiceService', () => {
  let testUser: any;
  let testOrganization: any;
  let testCustomer: any;
  let testPerson: any;
  let testQuote: any;

  beforeEach(async () => {
    await cleanupDatabase();

    testOrganization = await createTestOrganization('Test Org for Invoices');
    testUser = await createTestUser(testOrganization.id, 'invoice@test.com');

    // Create test person
    testPerson = await prisma.person.create({
      data: {
        organizationId: testOrganization.id,
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com'
      }
    });

    // Create test customer
    testCustomer = await prisma.customer.create({
      data: {
        organizationId: testOrganization.id,
        customerNumber: 'CUST-000001',
        personId: testPerson.id,
        tier: CustomerTier.PERSONAL,
        status: CustomerStatus.ACTIVE
      }
    });

    // Create test quote for quote-to-invoice conversion
    testQuote = await prisma.quote.create({
      data: {
        organizationId: testOrganization.id,
        customerId: testCustomer.id,
        createdById: testUser.id,
        quoteNumber: 'QUO-000001',
        description: 'Test Quote for Invoice',
        status: 'ACCEPTED',
        validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        subtotal: 1000,
        taxAmount: 130,
        total: 1130
      }
    });

    // Create quote items
    await prisma.quoteItem.create({
      data: {
        quoteId: testQuote.id,
        description: 'Test Service',
        quantity: 1,
        unitPrice: 1000,
        discountPercent: 0,
        taxRate: 13,
        subtotal: 1000,
        discountAmount: 0,
        taxAmount: 130,
        total: 1130,
        sortOrder: 1
      }
    });
  });

  afterEach(async () => {
    await prisma.$disconnect();
  });

  describe('createInvoice', () => {
    it('should create a new invoice with valid data', async () => {
      const invoiceData = {
        customerId: testCustomer.id,
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        depositRequired: 300,
        terms: 'Net 30',
        notes: 'Test invoice',
        items: [
          {
            description: 'Test Service',
            quantity: 1,
            unitPrice: 1000,
            taxRate: 13
          }
        ]
      };

      const auditContext = {
        userId: testUser.id,
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent'
      };

      const invoice = await invoiceService.createInvoice(
        invoiceData,
        testOrganization.id,
        auditContext
      );

      expect(invoice).toBeDefined();
      expect(invoice.customerId).toBe(invoiceData.customerId);
      expect(invoice.depositRequired).toBe(invoiceData.depositRequired);
      expect(invoice.terms).toBe(invoiceData.terms);
      expect(invoice.notes).toBe(invoiceData.notes);
      expect(invoice.status).toBe(InvoiceStatus.DRAFT);
      expect(invoice.subtotal).toBe(1000);
      expect(invoice.taxAmount).toBe(130);
      expect(invoice.total).toBe(1130);
      expect(invoice.balance).toBe(830); // total - deposit
      expect(invoice.invoiceNumber).toMatch(/^INV-\d{6}$/);
      expect(invoice.items).toHaveLength(1);
      expect(invoice.customer).toBeDefined();
    });

    it('should reject invoice with non-existent customer', async () => {
      const invoiceData = {
        customerId: 'non-existent-customer',
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        depositRequired: 0,
        items: [
          {
            description: 'Test Service',
            quantity: 1,
            unitPrice: 100,
            taxRate: 13
          }
        ]
      };

      const auditContext = { userId: testUser.id };

      await expect(
        invoiceService.createInvoice(invoiceData, testOrganization.id, auditContext)
      ).rejects.toThrow('Customer not found');
    });

    it('should reject negative deposit requirement', async () => {
      const invoiceData = {
        customerId: testCustomer.id,
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        depositRequired: -100,
        items: [
          {
            description: 'Test Service',
            quantity: 1,
            unitPrice: 100,
            taxRate: 13
          }
        ]
      };

      const auditContext = { userId: testUser.id };

      await expect(
        invoiceService.createInvoice(invoiceData, testOrganization.id, auditContext)
      ).rejects.toThrow('Deposit required cannot be negative');
    });

    it('should reject deposit exceeding total amount', async () => {
      const invoiceData = {
        customerId: testCustomer.id,
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        depositRequired: 200,
        items: [
          {
            description: 'Test Service',
            quantity: 1,
            unitPrice: 100,
            taxRate: 13
          }
        ]
      };

      const auditContext = { userId: testUser.id };

      await expect(
        invoiceService.createInvoice(invoiceData, testOrganization.id, auditContext)
      ).rejects.toThrow('Deposit required cannot exceed total invoice amount');
    });

    it('should create invoice with multiple items', async () => {
      const invoiceData = {
        customerId: testCustomer.id,
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        depositRequired: 300,
        items: [
          {
            description: 'Service 1',
            quantity: 2,
            unitPrice: 500,
            discountPercent: 10,
            taxRate: 13
          },
          {
            description: 'Service 2',
            quantity: 1,
            unitPrice: 200,
            taxRate: 13
          }
        ]
      };

      const auditContext = { userId: testUser.id };

      const invoice = await invoiceService.createInvoice(
        invoiceData,
        testOrganization.id,
        auditContext
      );

      expect(invoice.items).toHaveLength(2);
      expect(invoice.subtotal).toBe(1100); // (500*2*0.9) + 200
      expect(invoice.taxAmount).toBe(143); // 1100 * 0.13
      expect(invoice.total).toBe(1243);
    });
  });

  describe('createInvoiceFromQuote', () => {
    it('should create invoice from accepted quote', async () => {
      const auditContext = {
        userId: testUser.id,
        ipAddress: '127.0.0.1'
      };

      const invoice = await invoiceService.createInvoiceFromQuote(
        testQuote.id,
        testOrganization.id,
        auditContext
      );

      expect(invoice).toBeDefined();
      expect(invoice.quoteId).toBe(testQuote.id);
      expect(invoice.customerId).toBe(testQuote.customerId);
      expect(invoice.subtotal).toBe(testQuote.subtotal);
      expect(invoice.taxAmount).toBe(testQuote.taxAmount);
      expect(invoice.total).toBe(testQuote.total);
      expect(invoice.depositRequired).toBe(339); // 30% of 1130, rounded
      expect(invoice.items).toHaveLength(1);
      expect(invoice.quote).toBeDefined();
    });

    it('should reject non-accepted quote', async () => {
      // Update quote status to DRAFT
      await prisma.quote.update({
        where: { id: testQuote.id },
        data: { status: 'DRAFT' }
      });

      const auditContext = { userId: testUser.id };

      await expect(
        invoiceService.createInvoiceFromQuote(
          testQuote.id,
          testOrganization.id,
          auditContext
        )
      ).rejects.toThrow('Only accepted quotes can be converted to invoices');
    });

    it('should reject non-existent quote', async () => {
      const auditContext = { userId: testUser.id };

      await expect(
        invoiceService.createInvoiceFromQuote(
          'non-existent-quote',
          testOrganization.id,
          auditContext
        )
      ).rejects.toThrow('Quote not found');
    });

    it('should prevent duplicate invoice creation from same quote', async () => {
      const auditContext = { userId: testUser.id };

      // Create first invoice
      await invoiceService.createInvoiceFromQuote(
        testQuote.id,
        testOrganization.id,
        auditContext
      );

      // Try to create second invoice from same quote
      await expect(
        invoiceService.createInvoiceFromQuote(
          testQuote.id,
          testOrganization.id,
          auditContext
        )
      ).rejects.toThrow('Quote has already been converted to an invoice');
    });

    it('should create invoice with custom options', async () => {
      const customDueDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000); // 60 days
      const options = {
        dueDate: customDueDate,
        depositRequired: 500,
        terms: 'Custom terms',
        notes: 'Custom notes'
      };

      const auditContext = { userId: testUser.id };

      const invoice = await invoiceService.createInvoiceFromQuote(
        testQuote.id,
        testOrganization.id,
        auditContext,
        options
      );

      expect(invoice.dueDate.getTime()).toBe(customDueDate.getTime());
      expect(invoice.depositRequired).toBe(options.depositRequired);
      expect(invoice.terms).toBe(options.terms);
      expect(invoice.notes).toBe(options.notes);
    });
  });

  describe('getInvoice', () => {
    let testInvoice: any;

    beforeEach(async () => {
      testInvoice = await invoiceService.createInvoice(
        {
          customerId: testCustomer.id,
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          depositRequired: 200,
          items: [
            {
              description: 'Test Service',
              quantity: 1,
              unitPrice: 1000,
              taxRate: 13
            }
          ]
        },
        testOrganization.id,
        { userId: testUser.id }
      );
    });

    it('should retrieve invoice by id', async () => {
      const invoice = await invoiceService.getInvoice(
        testInvoice.id,
        testOrganization.id,
        { userId: testUser.id }
      );

      expect(invoice).toBeDefined();
      expect(invoice!.id).toBe(testInvoice.id);
      expect(invoice!.customer).toBeDefined();
      expect(invoice!.items).toBeDefined();
    });

    it('should return null when invoice not found', async () => {
      const invoice = await invoiceService.getInvoice(
        'non-existent-id',
        testOrganization.id,
        { userId: testUser.id }
      );

      expect(invoice).toBeNull();
    });
  });

  describe('updateInvoice', () => {
    let testInvoice: any;

    beforeEach(async () => {
      testInvoice = await invoiceService.createInvoice(
        {
          customerId: testCustomer.id,
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          depositRequired: 200,
          items: [
            {
              description: 'Test Service',
              quantity: 1,
              unitPrice: 1000,
              taxRate: 13
            }
          ]
        },
        testOrganization.id,
        { userId: testUser.id }
      );
    });

    it('should update invoice fields', async () => {
      const newDueDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
      const updateData = {
        dueDate: newDueDate,
        depositRequired: 300,
        terms: 'Updated terms',
        notes: 'Updated notes'
      };

      const updatedInvoice = await invoiceService.updateInvoice(
        testInvoice.id,
        updateData,
        testOrganization.id,
        { userId: testUser.id }
      );

      expect(updatedInvoice.dueDate.getTime()).toBe(newDueDate.getTime());
      expect(updatedInvoice.depositRequired).toBe(updateData.depositRequired);
      expect(updatedInvoice.terms).toBe(updateData.terms);
      expect(updatedInvoice.notes).toBe(updateData.notes);
      expect(updatedInvoice.balance).toBe(830); // 1130 - 300
    });

    it('should update invoice items', async () => {
      const updateData = {
        items: [
          {
            description: 'Updated Service 1',
            quantity: 2,
            unitPrice: 600,
            taxRate: 13
          },
          {
            description: 'New Service 2',
            quantity: 1,
            unitPrice: 400,
            taxRate: 13
          }
        ]
      };

      const updatedInvoice = await invoiceService.updateInvoice(
        testInvoice.id,
        updateData,
        testOrganization.id,
        { userId: testUser.id }
      );

      expect(updatedInvoice.items).toHaveLength(2);
      expect(updatedInvoice.subtotal).toBe(1600); // (600*2) + 400
      expect(updatedInvoice.taxAmount).toBe(208); // 1600 * 0.13
      expect(updatedInvoice.total).toBe(1808);
    });

    it('should reject update for non-draft invoice', async () => {
      // Send the invoice first
      await invoiceService.sendInvoice(
        testInvoice.id,
        testOrganization.id,
        { userId: testUser.id }
      );

      await expect(
        invoiceService.updateInvoice(
          testInvoice.id,
          { terms: 'New terms' },
          testOrganization.id,
          { userId: testUser.id }
        )
      ).rejects.toThrow('Only draft invoices can be updated');
    });

    it('should reject non-existent invoice update', async () => {
      await expect(
        invoiceService.updateInvoice(
          'non-existent-id',
          { terms: 'New terms' },
          testOrganization.id,
          { userId: testUser.id }
        )
      ).rejects.toThrow('Invoice not found');
    });
  });

  describe('listInvoices', () => {
    beforeEach(async () => {
      // Create multiple invoices
      const baseDate = Date.now() + 30 * 24 * 60 * 60 * 1000;

      await invoiceService.createInvoice(
        {
          customerId: testCustomer.id,
          dueDate: new Date(baseDate),
          depositRequired: 100,
          items: [{ description: 'Service 1', quantity: 1, unitPrice: 500, taxRate: 13 }]
        },
        testOrganization.id,
        { userId: testUser.id }
      );

      await invoiceService.createInvoice(
        {
          customerId: testCustomer.id,
          dueDate: new Date(baseDate + 24 * 60 * 60 * 1000),
          depositRequired: 200,
          items: [{ description: 'Service 2', quantity: 1, unitPrice: 800, taxRate: 13 }]
        },
        testOrganization.id,
        { userId: testUser.id }
      );
    });

    it('should list all invoices for organization', async () => {
      const result = await invoiceService.listInvoices(
        {},
        testOrganization.id
      );

      expect(result.invoices).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should filter invoices by customer', async () => {
      const result = await invoiceService.listInvoices(
        { customerId: testCustomer.id },
        testOrganization.id
      );

      expect(result.invoices).toHaveLength(2);
      expect(result.invoices.every(inv => inv.customerId === testCustomer.id)).toBe(true);
    });

    it('should filter invoices by status', async () => {
      const result = await invoiceService.listInvoices(
        { status: InvoiceStatus.DRAFT },
        testOrganization.id
      );

      expect(result.invoices).toHaveLength(2);
      expect(result.invoices.every(inv => inv.status === InvoiceStatus.DRAFT)).toBe(true);
    });

    it('should limit and offset results', async () => {
      const result = await invoiceService.listInvoices(
        { limit: 1, offset: 0 },
        testOrganization.id
      );

      expect(result.invoices).toHaveLength(1);
      expect(result.total).toBe(2);
    });
  });

  describe('sendInvoice', () => {
    let testInvoice: any;

    beforeEach(async () => {
      testInvoice = await invoiceService.createInvoice(
        {
          customerId: testCustomer.id,
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          depositRequired: 200,
          items: [{ description: 'Test Service', quantity: 1, unitPrice: 1000, taxRate: 13 }]
        },
        testOrganization.id,
        { userId: testUser.id }
      );
    });

    it('should send draft invoice', async () => {
      const sentInvoice = await invoiceService.sendInvoice(
        testInvoice.id,
        testOrganization.id,
        { userId: testUser.id }
      );

      expect(sentInvoice.status).toBe(InvoiceStatus.SENT);
      expect(sentInvoice.sentAt).toBeDefined();
    });

    it('should reject sending non-draft invoice', async () => {
      // Send it first
      await invoiceService.sendInvoice(
        testInvoice.id,
        testOrganization.id,
        { userId: testUser.id }
      );

      // Try to send again
      await expect(
        invoiceService.sendInvoice(
          testInvoice.id,
          testOrganization.id,
          { userId: testUser.id }
        )
      ).rejects.toThrow('Only draft invoices can be sent');
    });
  });

  describe('markInvoiceAsViewed', () => {
    let testInvoice: any;

    beforeEach(async () => {
      testInvoice = await invoiceService.createInvoice(
        {
          customerId: testCustomer.id,
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          depositRequired: 200,
          items: [{ description: 'Test Service', quantity: 1, unitPrice: 1000, taxRate: 13 }]
        },
        testOrganization.id,
        { userId: testUser.id }
      );

      // Send it first
      await invoiceService.sendInvoice(
        testInvoice.id,
        testOrganization.id,
        { userId: testUser.id }
      );
    });

    it('should mark sent invoice as viewed', async () => {
      const viewedInvoice = await invoiceService.markInvoiceAsViewed(
        testInvoice.id,
        testOrganization.id,
        { userId: testUser.id }
      );

      expect(viewedInvoice.status).toBe(InvoiceStatus.VIEWED);
      expect(viewedInvoice.viewedAt).toBeDefined();
    });

    it('should not update status if already viewed', async () => {
      // Mark as viewed first
      await invoiceService.markInvoiceAsViewed(
        testInvoice.id,
        testOrganization.id,
        { userId: testUser.id }
      );

      // Try to mark as viewed again
      const result = await invoiceService.markInvoiceAsViewed(
        testInvoice.id,
        testOrganization.id,
        { userId: testUser.id }
      );

      expect(result.status).toBe(InvoiceStatus.VIEWED);
    });
  });

  describe('cancelInvoice', () => {
    let testInvoice: any;

    beforeEach(async () => {
      testInvoice = await invoiceService.createInvoice(
        {
          customerId: testCustomer.id,
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          depositRequired: 200,
          items: [{ description: 'Test Service', quantity: 1, unitPrice: 1000, taxRate: 13 }]
        },
        testOrganization.id,
        { userId: testUser.id }
      );
    });

    it('should cancel invoice with reason', async () => {
      const cancellationReason = 'Customer requested cancellation';

      const cancelledInvoice = await invoiceService.cancelInvoice(
        testInvoice.id,
        testOrganization.id,
        { userId: testUser.id },
        cancellationReason
      );

      expect(cancelledInvoice.status).toBe(InvoiceStatus.CANCELLED);
      expect(cancelledInvoice.notes).toContain('Cancellation Reason: ' + cancellationReason);
    });

    it('should reject cancelling paid invoice', async () => {
      // Record full payment
      await invoiceService.recordPayment(
        testInvoice.id,
        1130,
        testOrganization.id,
        { userId: testUser.id }
      );

      await expect(
        invoiceService.cancelInvoice(
          testInvoice.id,
          testOrganization.id,
          { userId: testUser.id }
        )
      ).rejects.toThrow('Cannot cancel paid invoice');
    });

    it('should reject cancelling invoice with payments', async () => {
      // Record partial payment
      await invoiceService.recordPayment(
        testInvoice.id,
        500,
        testOrganization.id,
        { userId: testUser.id }
      );

      await expect(
        invoiceService.cancelInvoice(
          testInvoice.id,
          testOrganization.id,
          { userId: testUser.id }
        )
      ).rejects.toThrow('Cannot cancel invoice with payments. Please process a refund instead.');
    });
  });

  describe('recordPayment', () => {
    let testInvoice: any;

    beforeEach(async () => {
      testInvoice = await invoiceService.createInvoice(
        {
          customerId: testCustomer.id,
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          depositRequired: 200,
          items: [{ description: 'Test Service', quantity: 1, unitPrice: 1000, taxRate: 13 }]
        },
        testOrganization.id,
        { userId: testUser.id }
      );
    });

    it('should record partial payment', async () => {
      const paymentAmount = 500;

      const updatedInvoice = await invoiceService.recordPayment(
        testInvoice.id,
        paymentAmount,
        testOrganization.id,
        { userId: testUser.id }
      );

      expect(updatedInvoice.amountPaid).toBe(paymentAmount);
      expect(updatedInvoice.balance).toBe(630); // 1130 - 500
      expect(updatedInvoice.status).toBe(InvoiceStatus.PARTIALLY_PAID);
      expect(updatedInvoice.paidAt).toBeNull(); // Not fully paid yet
    });

    it('should record full payment', async () => {
      const paymentAmount = 1130;

      const updatedInvoice = await invoiceService.recordPayment(
        testInvoice.id,
        paymentAmount,
        testOrganization.id,
        { userId: testUser.id }
      );

      expect(updatedInvoice.amountPaid).toBe(paymentAmount);
      expect(updatedInvoice.balance).toBe(0);
      expect(updatedInvoice.status).toBe(InvoiceStatus.PAID);
      expect(updatedInvoice.paidAt).toBeDefined();
    });

    it('should record multiple payments', async () => {
      // First payment
      await invoiceService.recordPayment(
        testInvoice.id,
        500,
        testOrganization.id,
        { userId: testUser.id }
      );

      // Second payment
      const finalInvoice = await invoiceService.recordPayment(
        testInvoice.id,
        630,
        testOrganization.id,
        { userId: testUser.id }
      );

      expect(finalInvoice.amountPaid).toBe(1130);
      expect(finalInvoice.balance).toBe(0);
      expect(finalInvoice.status).toBe(InvoiceStatus.PAID);
    });

    it('should reject negative payment amount', async () => {
      await expect(
        invoiceService.recordPayment(
          testInvoice.id,
          -100,
          testOrganization.id,
          { userId: testUser.id }
        )
      ).rejects.toThrow('Payment amount must be positive');
    });

    it('should reject payment exceeding balance', async () => {
      await expect(
        invoiceService.recordPayment(
          testInvoice.id,
          1500, // More than invoice total
          testOrganization.id,
          { userId: testUser.id }
        )
      ).rejects.toThrow('Payment amount exceeds remaining balance');
    });

    it('should reject payment for cancelled invoice', async () => {
      // Cancel invoice first
      await invoiceService.cancelInvoice(
        testInvoice.id,
        testOrganization.id,
        { userId: testUser.id }
      );

      await expect(
        invoiceService.recordPayment(
          testInvoice.id,
          500,
          testOrganization.id,
          { userId: testUser.id }
        )
      ).rejects.toThrow('Cannot record payment for cancelled invoice');
    });
  });

  describe('getInvoiceStats', () => {
    beforeEach(async () => {
      // Create invoices with different statuses
      await invoiceService.createInvoice(
        {
          customerId: testCustomer.id,
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          depositRequired: 100,
          items: [{ description: 'Draft Service', quantity: 1, unitPrice: 500, taxRate: 13 }]
        },
        testOrganization.id,
        { userId: testUser.id }
      );

      const paidInvoice = await invoiceService.createInvoice(
        {
          customerId: testCustomer.id,
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          depositRequired: 0,
          items: [{ description: 'Paid Service', quantity: 1, unitPrice: 800, taxRate: 13 }]
        },
        testOrganization.id,
        { userId: testUser.id }
      );

      // Record full payment for second invoice
      await invoiceService.recordPayment(
        paidInvoice.id,
        904, // 800 + (800 * 0.13)
        testOrganization.id,
        { userId: testUser.id }
      );

      // Create overdue invoice
      const overdueInvoice = await invoiceService.createInvoice(
        {
          customerId: testCustomer.id,
          dueDate: new Date(Date.now() - 24 * 60 * 60 * 1000), // Yesterday
          depositRequired: 0,
          items: [{ description: 'Overdue Service', quantity: 1, unitPrice: 600, taxRate: 13 }]
        },
        testOrganization.id,
        { userId: testUser.id }
      );

      await invoiceService.sendInvoice(
        overdueInvoice.id,
        testOrganization.id,
        { userId: testUser.id }
      );
    });

    it('should return invoice statistics', async () => {
      const stats = await invoiceService.getInvoiceStats(testOrganization.id);

      expect(stats.total).toBe(3);
      expect(stats.draft).toBe(1); // Only the actual draft invoice
      expect(stats.sent).toBe(1); // The overdue invoice that was sent
      expect(stats.paid).toBe(1);
      expect(stats.overdue).toBe(1);
      expect(stats.totalValue).toBeGreaterThan(0);
      expect(stats.paidValue).toBeGreaterThan(0);
      expect(stats.outstandingValue).toBeGreaterThan(0);
      expect(Math.round(stats.paymentRate * 100) / 100).toBe(33.33); // 1/3 * 100, rounded to 2 decimal places
    });

    it('should return customer-specific statistics', async () => {
      const stats = await invoiceService.getInvoiceStats(
        testOrganization.id,
        testCustomer.id
      );

      expect(stats.total).toBe(3);
      expect(stats.paid).toBe(1);
    });
  });
});