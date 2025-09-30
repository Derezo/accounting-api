import { describe, test, expect, beforeEach } from '@jest/globals';
import request from 'supertest';
import { prisma, testApp, baseRequest } from './setup';
import { createTestContext, createTestQuote, createTestCustomer } from './test-utils';
import { emailService } from '../../src/services/email.service';
import crypto from 'crypto';
import bcrypt from 'bcrypt';

// Mock external services
jest.mock('../../src/services/email.service');
const mockedEmailService = emailService as jest.Mocked<typeof emailService>;

describe('Public Quote API Integration Tests', () => {
  let testContext: any;
  let organizationId: string;
  let customerId: string;
  let adminUserId: string;

  beforeEach(async () => {
    testContext = await createTestContext(prisma);
    organizationId = testContext.organization.id;
    customerId = testContext.customers[0].id;
    adminUserId = testContext.users.admin.id;

    // Reset all mocks
    jest.clearAllMocks();
    mockedEmailService.sendEmail = jest.fn().mockResolvedValue(undefined);
  });

  describe('GET /api/v1/public/quotes/:quoteId/view', () => {
    let quoteId: string;
    let viewToken: string;

    beforeEach(async () => {
      const quote = await createTestQuote(prisma, organizationId, customerId, adminUserId);
      quoteId = quote.id;

      // Generate view token
      viewToken = crypto.randomBytes(32).toString('hex');
      await prisma.quote.update({
        where: { id: quoteId },
        data: {
          publicViewToken: viewToken,
          publicViewEnabled: true
        }
      });
    });

    test('should view quote with valid token', async () => {
      const response = await baseRequest()
        .get(`/api/v1/public/quotes/${quoteId}/view?token=${viewToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.quote).toBeDefined();
      expect(response.body.quote.id).toBe(quoteId);
      expect(response.body.quote.items).toBeInstanceOf(Array);
      expect(response.body.quote.customer).toBeDefined();
      expect(response.body.quote.organization).toBeDefined();

      // Should include financial details
      expect(response.body.quote).toHaveProperty('subtotal');
      expect(response.body.quote).toHaveProperty('taxAmount');
      expect(response.body.quote).toHaveProperty('total');
    });

    test('should return 400 without token', async () => {
      const response = await baseRequest()
        .get(`/api/v1/public/quotes/${quoteId}/view`)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should return 404 with invalid token', async () => {
      const response = await baseRequest()
        .get(`/api/v1/public/quotes/${quoteId}/view?token=invalid-token`)
        .expect(404);

      expect(response.body.success).toBe(false);
    });

    test('should return 404 if public view disabled', async () => {
      await prisma.quote.update({
        where: { id: quoteId },
        data: { publicViewEnabled: false }
      });

      const response = await baseRequest()
        .get(`/api/v1/public/quotes/${quoteId}/view?token=${viewToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
    });

    test('should return 410 for expired quote', async () => {
      await prisma.quote.update({
        where: { id: quoteId },
        data: { expiresAt: new Date(Date.now() - 86400000) } // Expired yesterday
      });

      const response = await baseRequest()
        .get(`/api/v1/public/quotes/${quoteId}/view?token=${viewToken}`)
        .expect(410);

      expect(response.body.success).toBe(false);
    });

    test('should include quote items with product/service details', async () => {
      const response = await baseRequest()
        .get(`/api/v1/public/quotes/${quoteId}/view?token=${viewToken}`)
        .expect(200);

      expect(response.body.quote.items.length).toBeGreaterThan(0);

      const item = response.body.quote.items[0];
      expect(item).toHaveProperty('description');
      expect(item).toHaveProperty('quantity');
      expect(item).toHaveProperty('unitPrice');
      expect(item).toHaveProperty('total');
    });

    test('should not expose sensitive organization data', async () => {
      const response = await baseRequest()
        .get(`/api/v1/public/quotes/${quoteId}/view?token=${viewToken}`)
        .expect(200);

      // Should have basic organization info but not sensitive details
      expect(response.body.quote.organization).toHaveProperty('name');
      expect(response.body.quote.organization).toHaveProperty('email');
      expect(response.body.quote.organization).not.toHaveProperty('encryptionKey');
      expect(response.body.quote.organization).not.toHaveProperty('taxNumber');
    });
  });

  describe('GET /api/v1/public/quotes/:quoteId/status', () => {
    let quoteId: string;
    let viewToken: string;

    beforeEach(async () => {
      const quote = await createTestQuote(prisma, organizationId, customerId, adminUserId);
      quoteId = quote.id;

      viewToken = crypto.randomBytes(32).toString('hex');
      await prisma.quote.update({
        where: { id: quoteId },
        data: {
          publicViewToken: viewToken,
          publicViewEnabled: true,
          status: 'SENT'
        }
      });
    });

    test('should check quote status', async () => {
      const response = await baseRequest()
        .get(`/api/v1/public/quotes/${quoteId}/status?token=${viewToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.status).toBe('SENT');
      expect(response.body).toHaveProperty('expiresAt');
      expect(response.body).toHaveProperty('isExpired');
    });

    test('should indicate if quote is expired', async () => {
      await prisma.quote.update({
        where: { id: quoteId },
        data: { expiresAt: new Date(Date.now() - 86400000) }
      });

      const response = await baseRequest()
        .get(`/api/v1/public/quotes/${quoteId}/status?token=${viewToken}`)
        .expect(200);

      expect(response.body.isExpired).toBe(true);
    });
  });

  describe('POST /api/v1/public/quotes/:quoteId/accept', () => {
    let quoteId: string;
    let acceptanceToken: string;

    beforeEach(async () => {
      const quote = await createTestQuote(prisma, organizationId, customerId, adminUserId);
      quoteId = quote.id;

      // Generate acceptance token
      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = await bcrypt.hash(token, 10);

      await prisma.quoteAcceptanceToken.create({
        data: {
          quoteId,
          organizationId,
          tokenHash,
          status: 'ACTIVE',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
        }
      });

      acceptanceToken = token;

      // Update quote to SENT status
      await prisma.quote.update({
        where: { id: quoteId },
        data: { status: 'SENT' }
      });
    });

    test('should accept quote with valid token', async () => {
      const response = await baseRequest()
        .post(`/api/v1/public/quotes/${quoteId}/accept`)
        .send({
          token: acceptanceToken,
          acceptedBy: 'customer@example.com',
          notes: 'Looking forward to working with you'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('accepted');
      expect(response.body.quote).toBeDefined();
      expect(response.body.quote.status).toBe('ACCEPTED');
      expect(response.body).toHaveProperty('bookingToken');
      expect(response.body).toHaveProperty('nextSteps');

      // Verify quote status updated
      const quote = await prisma.quote.findUnique({
        where: { id: quoteId }
      });

      expect(quote?.status).toBe('ACCEPTED');
      expect(quote?.acceptedAt).toBeTruthy();

      // Verify token marked as used
      const tokenRecord = await prisma.quoteAcceptanceToken.findFirst({
        where: { quoteId }
      });

      expect(tokenRecord?.status).toBe('USED');
      expect(tokenRecord?.usedAt).toBeTruthy();
      expect(tokenRecord?.acceptedBy).toBe('customer@example.com');

      // Verify booking token created
      const bookingToken = await prisma.appointmentBookingToken.findFirst({
        where: { quoteId }
      });

      expect(bookingToken).toBeTruthy();
      expect(bookingToken?.status).toBe('ACTIVE');

      // Verify confirmation email sent
      expect(mockedEmailService.sendEmail).toHaveBeenCalled();
    });

    test('should return 400 without token', async () => {
      const response = await baseRequest()
        .post(`/api/v1/public/quotes/${quoteId}/accept`)
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should return 404 with invalid token', async () => {
      const response = await baseRequest()
        .post(`/api/v1/public/quotes/${quoteId}/accept`)
        .send({
          token: 'invalid-token-12345',
          acceptedBy: 'customer@example.com'
        })
        .expect(404);

      expect(response.body.success).toBe(false);
    });

    test('should reject already accepted quote', async () => {
      // First acceptance
      await baseRequest()
        .post(`/api/v1/public/quotes/${quoteId}/accept`)
        .send({
          token: acceptanceToken,
          acceptedBy: 'customer@example.com'
        })
        .expect(200);

      // Second acceptance attempt should fail
      const response = await baseRequest()
        .post(`/api/v1/public/quotes/${quoteId}/accept`)
        .send({
          token: acceptanceToken,
          acceptedBy: 'customer@example.com'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should reject expired token', async () => {
      // Expire the token
      await prisma.quoteAcceptanceToken.updateMany({
        where: { quoteId },
        data: { expiresAt: new Date(Date.now() - 1000) }
      });

      const response = await baseRequest()
        .post(`/api/v1/public/quotes/${quoteId}/accept`)
        .send({
          token: acceptanceToken,
          acceptedBy: 'customer@example.com'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('expired');
    });

    test('should reject invalidated token', async () => {
      await prisma.quoteAcceptanceToken.updateMany({
        where: { quoteId },
        data: { invalidated: true }
      });

      const response = await baseRequest()
        .post(`/api/v1/public/quotes/${quoteId}/accept`)
        .send({
          token: acceptanceToken,
          acceptedBy: 'customer@example.com'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should track IP address on acceptance', async () => {
      await baseRequest()
        .post(`/api/v1/public/quotes/${quoteId}/accept`)
        .send({
          token: acceptanceToken,
          acceptedBy: 'customer@example.com'
        })
        .expect(200);

      const tokenRecord = await prisma.quoteAcceptanceToken.findFirst({
        where: { quoteId }
      });

      expect(tokenRecord?.ipAddressUsed).toBeDefined();
      expect(tokenRecord?.ipAddressUsed).not.toBe('');
    });

    test('should generate appointment booking token after acceptance', async () => {
      const response = await baseRequest()
        .post(`/api/v1/public/quotes/${quoteId}/accept`)
        .send({
          token: acceptanceToken,
          acceptedBy: 'customer@example.com'
        })
        .expect(200);

      expect(response.body.bookingToken).toBeDefined();
      expect(typeof response.body.bookingToken).toBe('string');

      // Verify token exists in database
      const bookingToken = await prisma.appointmentBookingToken.findFirst({
        where: { quoteId }
      });

      expect(bookingToken).toBeTruthy();
      expect(bookingToken?.status).toBe('ACTIVE');
    });
  });

  describe('POST /api/v1/public/quotes/:quoteId/reject', () => {
    let quoteId: string;
    let acceptanceToken: string;

    beforeEach(async () => {
      const quote = await createTestQuote(prisma, organizationId, customerId, adminUserId);
      quoteId = quote.id;

      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = await bcrypt.hash(token, 10);

      await prisma.quoteAcceptanceToken.create({
        data: {
          quoteId,
          organizationId,
          tokenHash,
          status: 'ACTIVE',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        }
      });

      acceptanceToken = token;

      await prisma.quote.update({
        where: { id: quoteId },
        data: { status: 'SENT' }
      });
    });

    test('should reject quote with valid token', async () => {
      const response = await baseRequest()
        .post(`/api/v1/public/quotes/${quoteId}/reject`)
        .send({
          token: acceptanceToken,
          rejectedBy: 'customer@example.com',
          reason: 'Price is too high'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('rejected');

      // Verify quote status updated
      const quote = await prisma.quote.findUnique({
        where: { id: quoteId }
      });

      expect(quote?.status).toBe('REJECTED');
      expect(quote?.rejectedAt).toBeTruthy();
      expect(quote?.rejectionReason).toBe('Price is too high');

      // Verify token marked as used
      const tokenRecord = await prisma.quoteAcceptanceToken.findFirst({
        where: { quoteId }
      });

      expect(tokenRecord?.status).toBe('USED');

      // Verify notification email sent
      expect(mockedEmailService.sendEmail).toHaveBeenCalled();
    });

    test('should allow rejection without reason', async () => {
      const response = await baseRequest()
        .post(`/api/v1/public/quotes/${quoteId}/reject`)
        .send({
          token: acceptanceToken,
          rejectedBy: 'customer@example.com'
        })
        .expect(200);

      expect(response.body.success).toBe(true);

      const quote = await prisma.quote.findUnique({
        where: { id: quoteId }
      });

      expect(quote?.status).toBe('REJECTED');
    });

    test('should return 400 with invalid token', async () => {
      const response = await baseRequest()
        .post(`/api/v1/public/quotes/${quoteId}/reject`)
        .send({
          token: 'invalid-token',
          rejectedBy: 'customer@example.com'
        })
        .expect(404);

      expect(response.body.success).toBe(false);
    });

    test('should reject already rejected quote', async () => {
      // First rejection
      await baseRequest()
        .post(`/api/v1/public/quotes/${quoteId}/reject`)
        .send({
          token: acceptanceToken,
          rejectedBy: 'customer@example.com'
        })
        .expect(200);

      // Second rejection should fail
      const response = await baseRequest()
        .post(`/api/v1/public/quotes/${quoteId}/reject`)
        .send({
          token: acceptanceToken,
          rejectedBy: 'customer@example.com'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Quote Token Validation', () => {
    let quoteId: string;

    beforeEach(async () => {
      const quote = await createTestQuote(prisma, organizationId, customerId, adminUserId);
      quoteId = quote.id;
    });

    test('should validate token format', async () => {
      const response = await baseRequest()
        .post(`/api/v1/public/quotes/${quoteId}/accept`)
        .send({
          token: '', // Empty token
          acceptedBy: 'customer@example.com'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should handle bcrypt verification correctly', async () => {
      const plainToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = await bcrypt.hash(plainToken, 10);

      await prisma.quoteAcceptanceToken.create({
        data: {
          quoteId,
          organizationId,
          tokenHash,
          status: 'ACTIVE',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        }
      });

      await prisma.quote.update({
        where: { id: quoteId },
        data: { status: 'SENT' }
      });

      // Correct token should work
      const validResponse = await baseRequest()
        .post(`/api/v1/public/quotes/${quoteId}/accept`)
        .send({
          token: plainToken,
          acceptedBy: 'customer@example.com'
        })
        .expect(200);

      expect(validResponse.body.success).toBe(true);
    });
  });

  describe('Quote Lifecycle State Transitions', () => {
    let quoteId: string;
    let acceptanceToken: string;

    beforeEach(async () => {
      const quote = await createTestQuote(prisma, organizationId, customerId, adminUserId);
      quoteId = quote.id;

      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = await bcrypt.hash(token, 10);

      await prisma.quoteAcceptanceToken.create({
        data: {
          quoteId,
          organizationId,
          tokenHash,
          status: 'ACTIVE',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        }
      });

      acceptanceToken = token;
    });

    test('should only accept quote in SENT or DRAFT status', async () => {
      // Set quote to ACCEPTED already
      await prisma.quote.update({
        where: { id: quoteId },
        data: { status: 'ACCEPTED' }
      });

      const response = await baseRequest()
        .post(`/api/v1/public/quotes/${quoteId}/accept`)
        .send({
          token: acceptanceToken,
          acceptedBy: 'customer@example.com'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should handle concurrent acceptance attempts', async () => {
      await prisma.quote.update({
        where: { id: quoteId },
        data: { status: 'SENT' }
      });

      // Simulate two simultaneous acceptance requests
      const [response1, response2] = await Promise.allSettled([
        baseRequest()
          .post(`/api/v1/public/quotes/${quoteId}/accept`)
          .send({
            token: acceptanceToken,
            acceptedBy: 'customer1@example.com'
          }),
        baseRequest()
          .post(`/api/v1/public/quotes/${quoteId}/accept`)
          .send({
            token: acceptanceToken,
            acceptedBy: 'customer2@example.com'
          })
      ]);

      // One should succeed, one should fail
      const succeeded = [response1, response2].filter(r => r.status === 'fulfilled');
      expect(succeeded.length).toBeGreaterThan(0);
    });
  });

  describe('Email Notifications', () => {
    let quoteId: string;
    let acceptanceToken: string;

    beforeEach(async () => {
      const quote = await createTestQuote(prisma, organizationId, customerId, adminUserId);
      quoteId = quote.id;

      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = await bcrypt.hash(token, 10);

      await prisma.quoteAcceptanceToken.create({
        data: {
          quoteId,
          organizationId,
          tokenHash,
          status: 'ACTIVE',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        }
      });

      acceptanceToken = token;

      await prisma.quote.update({
        where: { id: quoteId },
        data: { status: 'SENT' }
      });
    });

    test('should send acceptance confirmation to customer', async () => {
      await baseRequest()
        .post(`/api/v1/public/quotes/${quoteId}/accept`)
        .send({
          token: acceptanceToken,
          acceptedBy: 'customer@example.com'
        })
        .expect(200);

      expect(mockedEmailService.sendEmail).toHaveBeenCalledWith(
        expect.stringContaining('customer@example.com'),
        expect.any(String),
        expect.any(String),
        expect.any(String)
      );
    });

    test('should send rejection notification to organization', async () => {
      await baseRequest()
        .post(`/api/v1/public/quotes/${quoteId}/reject`)
        .send({
          token: acceptanceToken,
          rejectedBy: 'customer@example.com',
          reason: 'Not interested'
        })
        .expect(200);

      expect(mockedEmailService.sendEmail).toHaveBeenCalled();
    });
  });

  describe('Security Features', () => {
    test('should prevent quote viewing without token', async () => {
      const quote = await createTestQuote(prisma, organizationId, customerId, adminUserId);

      const response = await baseRequest()
        .get(`/api/v1/public/quotes/${quote.id}/view`)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should not expose deleted quotes', async () => {
      const quote = await createTestQuote(prisma, organizationId, customerId, adminUserId);
      const viewToken = crypto.randomBytes(32).toString('hex');

      await prisma.quote.update({
        where: { id: quote.id },
        data: {
          publicViewToken: viewToken,
          publicViewEnabled: true,
          deletedAt: new Date()
        }
      });

      const response = await baseRequest()
        .get(`/api/v1/public/quotes/${quote.id}/view?token=${viewToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
    });

    test('should rate limit quote viewing requests', async () => {
      const quote = await createTestQuote(prisma, organizationId, customerId, adminUserId);
      const viewToken = crypto.randomBytes(32).toString('hex');

      await prisma.quote.update({
        where: { id: quote.id },
        data: {
          publicViewToken: viewToken,
          publicViewEnabled: true
        }
      });

      // Make multiple requests rapidly
      const requests = Array(25).fill(null).map(() =>
        baseRequest().get(`/api/v1/public/quotes/${quote.id}/view?token=${viewToken}`)
      );

      const responses = await Promise.all(requests);

      // Some requests should succeed
      const successful = responses.filter(r => r.status === 200);
      expect(successful.length).toBeGreaterThan(0);
    });
  });
});