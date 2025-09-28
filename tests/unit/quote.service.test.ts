import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { quoteService } from '../../src/services/quote.service';
import { QuoteStatus, CustomerTier, CustomerStatus } from '../../src/types/enums';
import * as auditService from '../../src/services/audit.service';
import { prisma, createTestOrganization, createTestUser } from '../testUtils';

// Mock audit service to avoid FK constraint issues in tests
jest.mock('../../src/services/audit.service', () => ({
  auditService: {
    logCreate: jest.fn(),
    logUpdate: jest.fn(),
    logView: jest.fn(),
    logDelete: jest.fn()
  }
}));

describe('QuoteService', () => {
  let testUser: any;
  let testOrganization: any;
  let testCustomer: any;
  let testPerson: any;

  beforeEach(async () => {
    // Create test organization
    testOrganization = await createTestOrganization('Test Org for Quote');

    // Create test user
    testUser = await createTestUser(testOrganization.id, 'test@quote-user.com');

    // Create test person
    testPerson = await prisma.person.create({
      data: {
        organizationId: testOrganization.id,
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@customer.com'
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
  });

  afterEach(async () => {
    await prisma.$disconnect();
  });

  describe('createQuote', () => {
    it('should create a quote with valid data', async () => {
      const quoteData = {
        customerId: testCustomer.id,
        description: 'Website Development - Complete website redesign and development',
        validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        notes: 'Please review and approve',
        terms: 'Net 15 payment terms',
        items: [
          {
            serviceId: undefined, // Will be handled by service
            description: 'Frontend Development',
            quantity: 40,
            unitPrice: 75.0,
            discountPercent: 10,
            taxRate: 13
          },
          {
            serviceId: undefined, // Will be handled by service
            description: 'Backend Development',
            quantity: 30,
            unitPrice: 85.0,
            discountPercent: 10,
            taxRate: 13
          }
        ]
      };

      const auditContext = {
        userId: testUser.id,
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent'
      };

      const quote = await quoteService.createQuote(
        quoteData,
        testOrganization.id,
        auditContext
      );

      expect(quote).toBeDefined();
      expect(quote.quoteNumber).toBe('QUO-000001');
      expect(quote.description).toBe('Website Development - Complete website redesign and development');
      expect(quote.status).toBe(QuoteStatus.DRAFT);
      expect(quote.customerId).toBe(testCustomer.id);
      expect(quote.items).toHaveLength(2);
      // Totals will be calculated based on individual item discounts and taxes
    });

    it('should create a quote with item-level discount', async () => {
      const quoteData = {
        customerId: testCustomer.id,
        description: 'Simple Quote',
        items: [
          {
            serviceId: undefined,
            description: 'Consulting',
            quantity: 1,
            unitPrice: 1000.0,
            discountPercent: 10,
            taxRate: 10
          }
        ]
      };

      const auditContext = { userId: testUser.id };

      const quote = await quoteService.createQuote(
        quoteData,
        testOrganization.id,
        auditContext
      );

      expect(quote.items).toHaveLength(1);
      expect(quote.items[0]?.discountPercent).toBe(10);
      expect(quote.items[0]?.taxRate).toBe(10);
    });

    it('should generate unique quote numbers', async () => {
      const quoteData1 = {
        customerId: testCustomer.id,
        description: 'Quote 1',
        items: [{ serviceId: undefined, description: 'Service 1', quantity: 1, unitPrice: 100, discountPercent: 0, taxRate: 0 }]
      };

      const quoteData2 = {
        customerId: testCustomer.id,
        description: 'Quote 2',
        items: [{ serviceId: undefined, description: 'Service 2', quantity: 1, unitPrice: 200, discountPercent: 0, taxRate: 0 }]
      };

      const auditContext = { userId: testUser.id };

      const quote1 = await quoteService.createQuote(quoteData1, testOrganization.id, auditContext);
      const quote2 = await quoteService.createQuote(quoteData2, testOrganization.id, auditContext);

      expect(quote1.quoteNumber).toBe('QUO-000001');
      expect(quote2.quoteNumber).toBe('QUO-000002');
    });

    it('should reject quote creation for non-existent customer', async () => {
      const quoteData = {
        customerId: 'non-existent-customer',
        description: 'Invalid Quote',
        items: [{ serviceId: undefined, description: 'Service', quantity: 1, unitPrice: 100, discountPercent: 0, taxRate: 0 }]
      };

      const auditContext = { userId: testUser.id };

      await expect(
        quoteService.createQuote(quoteData, testOrganization.id, auditContext)
      ).rejects.toThrow('Customer not found');
    });

    it('should call audit service', async () => {
      const quoteData = {
        customerId: testCustomer.id,
        description: 'Audit Test Quote',
        items: [{ serviceId: undefined, description: 'Service', quantity: 1, unitPrice: 100, discountPercent: 0, taxRate: 0 }]
      };

      const auditContext = { userId: testUser.id };

      await quoteService.createQuote(quoteData, testOrganization.id, auditContext);

      expect(auditService.auditService.logCreate).toHaveBeenCalled();
    });
  });

  describe('getQuote', () => {
    let testQuote: any;

    beforeEach(async () => {
      testQuote = await quoteService.createQuote(
        {
          customerId: testCustomer.id,
          description: 'Get Test Quote',
          items: [{ serviceId: undefined, description: 'Service', quantity: 1, unitPrice: 100, discountPercent: 0, taxRate: 0 }]
        },
        testOrganization.id,
        { userId: testUser.id }
      );
    });

    it('should retrieve quote by id', async () => {
      const auditContext = { userId: testUser.id, ipAddress: '127.0.0.1' };

      const quote = await quoteService.getQuote(
        testQuote.id,
        testOrganization.id,
        auditContext
      );

      expect(quote).toBeDefined();
      expect(quote!.id).toBe(testQuote.id);
      expect(quote!.description).toBe('Get Test Quote');
      expect(quote!.customer).toBeDefined();
      expect(quote!.items).toHaveLength(1);
    });

    it('should return null when quote not found', async () => {
      const auditContext = { userId: testUser.id };

      const quote = await quoteService.getQuote(
        'non-existent-id',
        testOrganization.id,
        auditContext
      );

      expect(quote).toBeNull();
    });

    it('should call audit service for view action', async () => {
      const auditContext = { userId: testUser.id };

      await quoteService.getQuote(testQuote.id, testOrganization.id, auditContext);

      expect(auditService.auditService.logView).toHaveBeenCalled();
    });
  });

  describe('updateQuote', () => {
    let testQuote: any;

    beforeEach(async () => {
      testQuote = await quoteService.createQuote(
        {
          customerId: testCustomer.id,
          description: 'Update Test Quote',
          items: [{ serviceId: undefined, description: 'Original Service', quantity: 1, unitPrice: 100, discountPercent: 0, taxRate: 0 }]
        },
        testOrganization.id,
        { userId: testUser.id }
      );
    });

    it('should update quote details', async () => {
      const updateData = {
        description: 'Updated Quote Description',
        notes: 'Updated notes'
      };

      const auditContext = { userId: testUser.id };

      const updatedQuote = await quoteService.updateQuote(
        testQuote.id,
        updateData,
        testOrganization.id,
        auditContext
      );

      expect(updatedQuote.description).toBe('Updated Quote Description');
      expect(updatedQuote.notes).toBe('Updated notes');
    });

    it('should update quote items and recalculate totals', async () => {
      const updateData = {
        items: [
          {
            serviceId: undefined,
            description: 'Updated Service 1',
            quantity: 2,
            unitPrice: 150,
            discountPercent: 0,
            taxRate: 10
          },
          {
            serviceId: undefined,
            description: 'New Service 2',
            quantity: 1,
            unitPrice: 200,
            discountPercent: 0,
            taxRate: 10
          }
        ]
      };

      const auditContext = { userId: testUser.id };

      const updatedQuote = await quoteService.updateQuote(
        testQuote.id,
        updateData,
        testOrganization.id,
        auditContext
      );

      expect(updatedQuote.items).toHaveLength(2);
      // Totals will be calculated based on individual item taxes
    });

    it('should reject update when quote not found', async () => {
      const updateData = { description: 'Updated Description' };
      const auditContext = { userId: testUser.id };

      await expect(
        quoteService.updateQuote('non-existent-id', updateData, testOrganization.id, auditContext)
      ).rejects.toThrow('Quote not found');
    });

    it('should reject update when quote is accepted', async () => {
      // First update status to accepted
      await prisma.quote.update({
        where: { id: testQuote.id },
        data: { status: QuoteStatus.ACCEPTED }
      });

      const updateData = { description: 'Should Not Update' };
      const auditContext = { userId: testUser.id };

      await expect(
        quoteService.updateQuote(testQuote.id, updateData, testOrganization.id, auditContext)
      ).rejects.toThrow('Cannot update quote in current status');
    });

    it('should call audit service for update action', async () => {
      const updateData = { description: 'Audit Update Test' };
      const auditContext = { userId: testUser.id };

      await quoteService.updateQuote(testQuote.id, updateData, testOrganization.id, auditContext);

      expect(auditService.auditService.logUpdate).toHaveBeenCalled();
    });
  });

  describe('listQuotes', () => {
    beforeEach(async () => {
      // Create multiple test quotes
      await quoteService.createQuote(
        {
          customerId: testCustomer.id,
          description: 'Website Development',
          items: [{ serviceId: undefined, description: 'Service', quantity: 1, unitPrice: 1000, discountPercent: 0, taxRate: 0 }]
        },
        testOrganization.id,
        { userId: testUser.id }
      );

      await quoteService.createQuote(
        {
          customerId: testCustomer.id,
          description: 'Mobile App',
          items: [{ serviceId: undefined, description: 'Service', quantity: 1, unitPrice: 2000, discountPercent: 0, taxRate: 0 }]
        },
        testOrganization.id,
        { userId: testUser.id }
      );

      // Create a sent quote
      const sentQuote = await quoteService.createQuote(
        {
          customerId: testCustomer.id,
          description: 'Consulting Services',
          items: [{ serviceId: undefined, description: 'Service', quantity: 1, unitPrice: 500, discountPercent: 0, taxRate: 0 }]
        },
        testOrganization.id,
        { userId: testUser.id }
      );

      await prisma.quote.update({
        where: { id: sentQuote.id },
        data: { status: QuoteStatus.SENT }
      });
    });

    it('should list all quotes', async () => {
      const result = await quoteService.listQuotes({}, testOrganization.id);

      expect(result.quotes).toHaveLength(3);
      expect(result.total).toBe(3);
    });

    it('should filter by status', async () => {
      const result = await quoteService.listQuotes(
        { status: QuoteStatus.DRAFT },
        testOrganization.id
      );

      expect(result.quotes).toHaveLength(2);
      expect(result.quotes.every(q => q.status === QuoteStatus.DRAFT)).toBe(true);
    });

    it('should filter by customer', async () => {
      const result = await quoteService.listQuotes(
        { customerId: testCustomer.id },
        testOrganization.id
      );

      expect(result.quotes).toHaveLength(3);
      expect(result.quotes.every(q => q.customerId === testCustomer.id)).toBe(true);
    });

    it('should search quotes', async () => {
      const result = await quoteService.listQuotes(
        { search: 'Website' },
        testOrganization.id
      );

      expect(result.quotes).toHaveLength(1);
      expect(result.quotes[0]!.description).toBe('Website Development');
    });

    it('should paginate results', async () => {
      const result = await quoteService.listQuotes(
        { limit: 2, offset: 1 },
        testOrganization.id
      );

      expect(result.quotes).toHaveLength(2);
      expect(result.total).toBe(3);
    });
  });

  describe('sendQuote', () => {
    let testQuote: any;

    beforeEach(async () => {
      testQuote = await quoteService.createQuote(
        {
          customerId: testCustomer.id,
          description: 'Send Test Quote',
          items: [{ serviceId: undefined, description: 'Service', quantity: 1, unitPrice: 100, discountPercent: 0, taxRate: 0 }]
        },
        testOrganization.id,
        { userId: testUser.id }
      );
    });

    it('should send a draft quote', async () => {
      const auditContext = { userId: testUser.id };

      const sentQuote = await quoteService.sendQuote(
        testQuote.id,
        testOrganization.id,
        auditContext
      );

      expect(sentQuote.status).toBe(QuoteStatus.SENT);
      expect(sentQuote.sentAt).toBeDefined();
    });

    it('should reject sending non-draft quote', async () => {
      // First send the quote
      await quoteService.sendQuote(testQuote.id, testOrganization.id, { userId: testUser.id });

      // Try to send again
      await expect(
        quoteService.sendQuote(testQuote.id, testOrganization.id, { userId: testUser.id })
      ).rejects.toThrow('Only draft quotes can be sent');
    });

    it('should call audit service', async () => {
      const auditContext = { userId: testUser.id };

      await quoteService.sendQuote(testQuote.id, testOrganization.id, auditContext);

      expect(auditService.auditService.logUpdate).toHaveBeenCalled();
    });
  });

  describe('deleteQuote', () => {
    let testQuote: any;

    beforeEach(async () => {
      testQuote = await quoteService.createQuote(
        {
          customerId: testCustomer.id,
          description: 'Delete Test Quote',
          items: [{ serviceId: undefined, description: 'Service', quantity: 1, unitPrice: 100, discountPercent: 0, taxRate: 0 }]
        },
        testOrganization.id,
        { userId: testUser.id }
      );
    });

    it('should soft delete a draft quote', async () => {
      const auditContext = { userId: testUser.id };

      const deletedQuote = await quoteService.deleteQuote(
        testQuote.id,
        testOrganization.id,
        auditContext
      );

      expect(deletedQuote.deletedAt).toBeDefined();
    });

    it('should reject deleting sent quote', async () => {
      // First send the quote
      await quoteService.sendQuote(testQuote.id, testOrganization.id, { userId: testUser.id });

      // Try to delete
      await expect(
        quoteService.deleteQuote(testQuote.id, testOrganization.id, { userId: testUser.id })
      ).rejects.toThrow('Only draft quotes can be deleted');
    });

    it('should call audit service', async () => {
      const auditContext = { userId: testUser.id };

      await quoteService.deleteQuote(testQuote.id, testOrganization.id, auditContext);

      expect(auditService.auditService.logDelete).toHaveBeenCalled();
    });
  });

  describe('duplicateQuote', () => {
    let testQuote: any;

    beforeEach(async () => {
      testQuote = await quoteService.createQuote(
        {
          customerId: testCustomer.id,
          description: 'Original Quote - Original description',
          notes: 'Original notes',
          items: [
            { serviceId: undefined, description: 'Service 1', quantity: 1, unitPrice: 100, discountPercent: 0, taxRate: 0 },
            { serviceId: undefined, description: 'Service 2', quantity: 2, unitPrice: 200, discountPercent: 0, taxRate: 0 }
          ]
        },
        testOrganization.id,
        { userId: testUser.id }
      );
    });

    it('should duplicate a quote', async () => {
      const auditContext = { userId: testUser.id };

      const duplicatedQuote = await quoteService.duplicateQuote(
        testQuote.id,
        testOrganization.id,
        auditContext
      );

      expect(duplicatedQuote.id).not.toBe(testQuote.id);
      expect(duplicatedQuote.quoteNumber).toBe('QUO-000002');
      expect(duplicatedQuote.description).toBe('Original Quote - Original description (Copy)');
      expect(duplicatedQuote.status).toBe(QuoteStatus.DRAFT);
      expect(duplicatedQuote.items).toHaveLength(2);
      expect(duplicatedQuote.total).toBe(testQuote.total);
    });

    it('should call audit service', async () => {
      const auditContext = { userId: testUser.id };

      await quoteService.duplicateQuote(testQuote.id, testOrganization.id, auditContext);

      expect(auditService.auditService.logCreate).toHaveBeenCalled();
    });
  });

  describe('getQuoteStats', () => {
    beforeEach(async () => {
      // Create quotes with different statuses
      await quoteService.createQuote(
        {
          customerId: testCustomer.id,
          description: 'Draft Quote',
          items: [{ serviceId: undefined, description: 'Service', quantity: 1, unitPrice: 1000, discountPercent: 0, taxRate: 0 }]
        },
        testOrganization.id,
        { userId: testUser.id }
      );

      const sentQuote = await quoteService.createQuote(
        {
          customerId: testCustomer.id,
          description: 'Sent Quote',
          items: [{ serviceId: undefined, description: 'Service', quantity: 1, unitPrice: 2000, discountPercent: 0, taxRate: 0 }]
        },
        testOrganization.id,
        { userId: testUser.id }
      );

      const acceptedQuote = await quoteService.createQuote(
        {
          customerId: testCustomer.id,
          description: 'Accepted Quote',
          items: [{ serviceId: undefined, description: 'Service', quantity: 1, unitPrice: 3000, discountPercent: 0, taxRate: 0 }]
        },
        testOrganization.id,
        { userId: testUser.id }
      );

      // Update statuses
      await prisma.quote.update({
        where: { id: sentQuote.id },
        data: { status: QuoteStatus.SENT }
      });

      await prisma.quote.update({
        where: { id: acceptedQuote.id },
        data: { status: QuoteStatus.ACCEPTED }
      });
    });

    it('should return quote statistics', async () => {
      const stats = await quoteService.getQuoteStats(testOrganization.id);

      expect(stats).toBeDefined();
      expect(stats.total).toBe(3);
      expect(stats.draft).toBe(1);
      expect(stats.sent).toBe(1);
      expect(stats.accepted).toBe(1);
      expect(stats.totalValue).toBe(6000);
      expect(stats.acceptedValue).toBe(3000);
      expect(stats.conversionRate).toBe(100); // 1 accepted out of 1 sent
    });

    it('should filter stats by customer', async () => {
      const stats = await quoteService.getQuoteStats(testOrganization.id, testCustomer.id);

      expect(stats.total).toBe(3);
      expect(stats.totalValue).toBe(6000);
    });
  });
});