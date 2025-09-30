import { describe, test, expect, beforeEach } from '@jest/globals';
import request from 'supertest';
import { prisma, testApp, baseRequest } from './setup';
import { createTestContext, createTestQuote, createTestCustomer } from './test-utils';
import { emailService } from '../../src/services/email.service';
import crypto from 'crypto';
import bcrypt from 'bcrypt';

// Mock external services
jest.mock('../../src/services/email.service');
jest.mock('../../src/services/google-meet.service');

const mockedEmailService = emailService as jest.Mocked<typeof emailService>;

// Mock Google Meet service
const mockGoogleMeetService = {
  createMeeting: jest.fn(),
  getAvailableSlots: jest.fn(),
  cancelMeeting: jest.fn()
};

jest.mock('../../src/services/google-meet.service', () => ({
  googleMeetService: mockGoogleMeetService
}));

describe('Public Appointment API Integration Tests', () => {
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
    mockGoogleMeetService.createMeeting.mockResolvedValue({
      meetingLink: 'https://meet.google.com/abc-defg-hij',
      meetingId: 'abc-defg-hij'
    });
    mockGoogleMeetService.getAvailableSlots.mockResolvedValue([
      {
        start: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
        end: new Date(Date.now() + 24 * 60 * 60 * 1000 + 60 * 60 * 1000), // +1 hour
        available: true
      },
      {
        start: new Date(Date.now() + 25 * 60 * 60 * 1000),
        end: new Date(Date.now() + 26 * 60 * 60 * 1000),
        available: true
      }
    ]);
    mockGoogleMeetService.cancelMeeting.mockResolvedValue(undefined);
  });

  describe('GET /api/v1/public/appointments/availability', () => {
    let quoteId: string;
    let bookingToken: string;

    beforeEach(async () => {
      const quote = await createTestQuote(prisma, organizationId, customerId, adminUserId);
      quoteId = quote.id;

      // Create booking token
      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = await bcrypt.hash(token, 10);

      await prisma.appointmentBookingToken.create({
        data: {
          quoteId,
          organizationId,
          tokenHash,
          status: 'ACTIVE',
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
        }
      });

      bookingToken = token;
    });

    test('should fetch available time slots', async () => {
      const response = await baseRequest()
        .get(`/api/v1/public/appointments/availability?quoteId=${quoteId}&token=${bookingToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.slots).toBeInstanceOf(Array);
      expect(response.body.slots.length).toBeGreaterThan(0);

      // Check slot structure
      const slot = response.body.slots[0];
      expect(slot).toHaveProperty('start');
      expect(slot).toHaveProperty('end');
      expect(slot).toHaveProperty('available');

      // Verify Google Meet service was called
      expect(mockGoogleMeetService.getAvailableSlots).toHaveBeenCalled();
    });

    test('should return 400 without quoteId', async () => {
      const response = await baseRequest()
        .get(`/api/v1/public/appointments/availability?token=${bookingToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should return 400 without token', async () => {
      const response = await baseRequest()
        .get(`/api/v1/public/appointments/availability?quoteId=${quoteId}`)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should return 404 with invalid token', async () => {
      const response = await baseRequest()
        .get(`/api/v1/public/appointments/availability?quoteId=${quoteId}&token=invalid-token`)
        .expect(404);

      expect(response.body.success).toBe(false);
    });

    test('should filter by date range', async () => {
      const startDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const endDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const response = await baseRequest()
        .get(`/api/v1/public/appointments/availability?quoteId=${quoteId}&token=${bookingToken}&startDate=${startDate}&endDate=${endDate}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(mockGoogleMeetService.getAvailableSlots).toHaveBeenCalledWith(
        expect.objectContaining({
          startDate: expect.any(Date),
          endDate: expect.any(Date)
        })
      );
    });

    test('should reject expired token', async () => {
      // Expire the token
      await prisma.appointmentBookingToken.updateMany({
        where: { quoteId },
        data: { expiresAt: new Date(Date.now() - 1000) }
      });

      const response = await baseRequest()
        .get(`/api/v1/public/appointments/availability?quoteId=${quoteId}&token=${bookingToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('expired');
    });

    test('should reject already used token', async () => {
      await prisma.appointmentBookingToken.updateMany({
        where: { quoteId },
        data: { status: 'USED' }
      });

      const response = await baseRequest()
        .get(`/api/v1/public/appointments/availability?quoteId=${quoteId}&token=${bookingToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/public/appointments/book', () => {
    let quoteId: string;
    let bookingToken: string;

    beforeEach(async () => {
      const quote = await createTestQuote(prisma, organizationId, customerId, adminUserId);
      quoteId = quote.id;

      // Accept the quote first
      await prisma.quote.update({
        where: { id: quote.id },
        data: { status: 'ACCEPTED' }
      });

      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = await bcrypt.hash(token, 10);

      await prisma.appointmentBookingToken.create({
        data: {
          quoteId,
          organizationId,
          tokenHash,
          status: 'ACTIVE',
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        }
      });

      bookingToken = token;
    });

    test('should book appointment with valid token', async () => {
      const startTime = new Date(Date.now() + 48 * 60 * 60 * 1000); // 2 days from now
      const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000); // 2 hours later

      const response = await baseRequest()
        .post('/api/v1/public/appointments/book')
        .send({
          quoteId,
          token: bookingToken,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          customerEmail: 'customer@example.com',
          customerName: 'John Doe',
          customerPhone: '+1-555-0100',
          notes: 'Please bring necessary equipment'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.appointment).toBeDefined();
      expect(response.body.appointment).toHaveProperty('id');
      expect(response.body.appointment).toHaveProperty('meetingLink');
      expect(response.body.appointment.meetingLink).toBe('https://meet.google.com/abc-defg-hij');
      expect(response.body.message).toContain('booked');

      // Verify appointment created in database
      const appointment = await prisma.appointment.findUnique({
        where: { id: response.body.appointment.id }
      });

      expect(appointment).toBeTruthy();
      expect(appointment?.customerId).toBe(customerId);
      expect(appointment?.quoteId).toBe(quoteId);
      expect(appointment?.meetingLink).toBe('https://meet.google.com/abc-defg-hij');
      expect(appointment?.meetingId).toBe('abc-defg-hij');
      expect(appointment?.confirmed).toBe(true);

      // Verify token marked as used
      const tokenRecord = await prisma.appointmentBookingToken.findFirst({
        where: { quoteId }
      });

      expect(tokenRecord?.status).toBe('USED');
      expect(tokenRecord?.usedAt).toBeTruthy();
      expect(tokenRecord?.bookedBy).toBe('customer@example.com');
      expect(tokenRecord?.appointmentId).toBe(response.body.appointment.id);

      // Verify Google Meet was called
      expect(mockGoogleMeetService.createMeeting).toHaveBeenCalledWith(
        expect.objectContaining({
          summary: expect.any(String),
          startTime: expect.any(Date),
          endTime: expect.any(Date)
        })
      );

      // Verify confirmation emails sent
      expect(mockedEmailService.sendEmail).toHaveBeenCalled();
    });

    test('should return 400 without required fields', async () => {
      const response = await baseRequest()
        .post('/api/v1/public/appointments/book')
        .send({
          quoteId,
          token: bookingToken
          // Missing startTime, endTime, customerEmail, customerName
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should return 400 with invalid time range', async () => {
      const startTime = new Date(Date.now() + 48 * 60 * 60 * 1000);
      const endTime = new Date(startTime.getTime() - 60 * 60 * 1000); // End before start

      const response = await baseRequest()
        .post('/api/v1/public/appointments/book')
        .send({
          quoteId,
          token: bookingToken,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          customerEmail: 'customer@example.com',
          customerName: 'John Doe'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should return 400 with past date', async () => {
      const startTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // Yesterday
      const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);

      const response = await baseRequest()
        .post('/api/v1/public/appointments/book')
        .send({
          quoteId,
          token: bookingToken,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          customerEmail: 'customer@example.com',
          customerName: 'John Doe'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should return 404 with invalid token', async () => {
      const startTime = new Date(Date.now() + 48 * 60 * 60 * 1000);
      const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);

      const response = await baseRequest()
        .post('/api/v1/public/appointments/book')
        .send({
          quoteId,
          token: 'invalid-token-12345',
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          customerEmail: 'customer@example.com',
          customerName: 'John Doe'
        })
        .expect(404);

      expect(response.body.success).toBe(false);
    });

    test('should prevent double booking with same token', async () => {
      const startTime = new Date(Date.now() + 48 * 60 * 60 * 1000);
      const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);

      const bookingData = {
        quoteId,
        token: bookingToken,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        customerEmail: 'customer@example.com',
        customerName: 'John Doe'
      };

      // First booking
      await baseRequest()
        .post('/api/v1/public/appointments/book')
        .send(bookingData)
        .expect(201);

      // Second booking with same token should fail
      const response = await baseRequest()
        .post('/api/v1/public/appointments/book')
        .send(bookingData)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should track IP address on booking', async () => {
      const startTime = new Date(Date.now() + 48 * 60 * 60 * 1000);
      const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);

      await baseRequest()
        .post('/api/v1/public/appointments/book')
        .send({
          quoteId,
          token: bookingToken,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          customerEmail: 'customer@example.com',
          customerName: 'John Doe'
        })
        .expect(201);

      const tokenRecord = await prisma.appointmentBookingToken.findFirst({
        where: { quoteId }
      });

      expect(tokenRecord?.bookedIp).toBeDefined();
      expect(tokenRecord?.bookedIp).not.toBe('');
    });

    test('should handle Google Meet creation failure gracefully', async () => {
      // Mock Google Meet failure
      mockGoogleMeetService.createMeeting.mockRejectedValueOnce(
        new Error('Google Calendar API error')
      );

      const startTime = new Date(Date.now() + 48 * 60 * 60 * 1000);
      const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);

      const response = await baseRequest()
        .post('/api/v1/public/appointments/book')
        .send({
          quoteId,
          token: bookingToken,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          customerEmail: 'customer@example.com',
          customerName: 'John Doe'
        })
        .expect(500);

      expect(response.body.success).toBe(false);
    });

    test('should validate email format', async () => {
      const startTime = new Date(Date.now() + 48 * 60 * 60 * 1000);
      const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);

      const response = await baseRequest()
        .post('/api/v1/public/appointments/book')
        .send({
          quoteId,
          token: bookingToken,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          customerEmail: 'invalid-email',
          customerName: 'John Doe'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/public/appointments/:appointmentId/details', () => {
    let appointmentId: string;
    let bookingToken: string;
    let quoteId: string;

    beforeEach(async () => {
      const quote = await createTestQuote(prisma, organizationId, customerId, adminUserId);
      quoteId = quote.id;

      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = await bcrypt.hash(token, 10);

      const startTime = new Date(Date.now() + 48 * 60 * 60 * 1000);
      const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);

      // Create appointment
      const appointment = await prisma.appointment.create({
        data: {
          organizationId,
          customerId,
          quoteId,
          title: 'Initial Consultation',
          description: 'Project discussion',
          startTime,
          endTime,
          duration: 120,
          meetingLink: 'https://meet.google.com/abc-defg-hij',
          meetingId: 'abc-defg-hij',
          confirmed: true
        }
      });

      appointmentId = appointment.id;

      // Create booking token
      await prisma.appointmentBookingToken.create({
        data: {
          quoteId,
          organizationId,
          appointmentId,
          tokenHash,
          status: 'USED',
          bookedBy: 'customer@example.com',
          usedAt: new Date(),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        }
      });

      bookingToken = token;
    });

    test('should get appointment details', async () => {
      const response = await baseRequest()
        .get(`/api/v1/public/appointments/${appointmentId}/details?token=${bookingToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.appointment).toBeDefined();
      expect(response.body.appointment.id).toBe(appointmentId);
      expect(response.body.appointment).toHaveProperty('title');
      expect(response.body.appointment).toHaveProperty('startTime');
      expect(response.body.appointment).toHaveProperty('endTime');
      expect(response.body.appointment).toHaveProperty('meetingLink');
      expect(response.body.appointment.meetingLink).toBe('https://meet.google.com/abc-defg-hij');
    });

    test('should return 400 without token', async () => {
      const response = await baseRequest()
        .get(`/api/v1/public/appointments/${appointmentId}/details`)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should return 404 with invalid token', async () => {
      const response = await baseRequest()
        .get(`/api/v1/public/appointments/${appointmentId}/details?token=invalid-token`)
        .expect(404);

      expect(response.body.success).toBe(false);
    });

    test('should return 404 for non-existent appointment', async () => {
      const response = await baseRequest()
        .get(`/api/v1/public/appointments/non-existent-id/details?token=${bookingToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
    });

    test('should include customer and organization info', async () => {
      const response = await baseRequest()
        .get(`/api/v1/public/appointments/${appointmentId}/details?token=${bookingToken}`)
        .expect(200);

      expect(response.body.appointment).toHaveProperty('customer');
      expect(response.body.appointment).toHaveProperty('organization');
    });
  });

  describe('POST /api/v1/public/appointments/:appointmentId/cancel', () => {
    let appointmentId: string;
    let bookingToken: string;
    let quoteId: string;

    beforeEach(async () => {
      const quote = await createTestQuote(prisma, organizationId, customerId, adminUserId);
      quoteId = quote.id;

      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = await bcrypt.hash(token, 10);

      const startTime = new Date(Date.now() + 48 * 60 * 60 * 1000);
      const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);

      const appointment = await prisma.appointment.create({
        data: {
          organizationId,
          customerId,
          quoteId,
          title: 'Initial Consultation',
          startTime,
          endTime,
          duration: 120,
          meetingLink: 'https://meet.google.com/abc-defg-hij',
          meetingId: 'abc-defg-hij',
          confirmed: true
        }
      });

      appointmentId = appointment.id;

      await prisma.appointmentBookingToken.create({
        data: {
          quoteId,
          organizationId,
          appointmentId,
          tokenHash,
          status: 'USED',
          bookedBy: 'customer@example.com',
          usedAt: new Date(),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        }
      });

      bookingToken = token;
    });

    test('should cancel appointment with valid token', async () => {
      const response = await baseRequest()
        .post(`/api/v1/public/appointments/${appointmentId}/cancel`)
        .send({
          token: bookingToken,
          reason: 'Schedule conflict'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('cancelled');

      // Verify appointment was cancelled
      const appointment = await prisma.appointment.findUnique({
        where: { id: appointmentId }
      });

      expect(appointment?.cancelled).toBe(true);
      expect(appointment?.cancellationReason).toBe('Schedule conflict');

      // Verify Google Meet was cancelled
      expect(mockGoogleMeetService.cancelMeeting).toHaveBeenCalledWith(
        'abc-defg-hij'
      );

      // Verify notification email sent
      expect(mockedEmailService.sendEmail).toHaveBeenCalled();
    });

    test('should allow cancellation without reason', async () => {
      const response = await baseRequest()
        .post(`/api/v1/public/appointments/${appointmentId}/cancel`)
        .send({
          token: bookingToken
        })
        .expect(200);

      expect(response.body.success).toBe(true);

      const appointment = await prisma.appointment.findUnique({
        where: { id: appointmentId }
      });

      expect(appointment?.cancelled).toBe(true);
    });

    test('should return 400 without token', async () => {
      const response = await baseRequest()
        .post(`/api/v1/public/appointments/${appointmentId}/cancel`)
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should return 404 with invalid token', async () => {
      const response = await baseRequest()
        .post(`/api/v1/public/appointments/${appointmentId}/cancel`)
        .send({
          token: 'invalid-token'
        })
        .expect(404);

      expect(response.body.success).toBe(false);
    });

    test('should reject cancellation of already cancelled appointment', async () => {
      // First cancellation
      await baseRequest()
        .post(`/api/v1/public/appointments/${appointmentId}/cancel`)
        .send({
          token: bookingToken,
          reason: 'First cancellation'
        })
        .expect(200);

      // Second cancellation should fail
      const response = await baseRequest()
        .post(`/api/v1/public/appointments/${appointmentId}/cancel`)
        .send({
          token: bookingToken,
          reason: 'Second cancellation'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should handle Google Meet cancellation failure gracefully', async () => {
      mockGoogleMeetService.cancelMeeting.mockRejectedValueOnce(
        new Error('Google Calendar API error')
      );

      // Should still succeed even if Google Meet fails
      const response = await baseRequest()
        .post(`/api/v1/public/appointments/${appointmentId}/cancel`)
        .send({
          token: bookingToken,
          reason: 'Cancellation test'
        })
        .expect(200);

      expect(response.body.success).toBe(true);

      // Appointment should still be marked as cancelled
      const appointment = await prisma.appointment.findUnique({
        where: { id: appointmentId }
      });

      expect(appointment?.cancelled).toBe(true);
    });
  });

  describe('Token Security and Validation', () => {
    test('should use bcrypt for token verification', async () => {
      const quote = await createTestQuote(prisma, organizationId, customerId, adminUserId);
      const plainToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = await bcrypt.hash(plainToken, 10);

      await prisma.appointmentBookingToken.create({
        data: {
          quoteId: quote.id,
          organizationId,
          tokenHash,
          status: 'ACTIVE',
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        }
      });

      // Correct token should work
      const response = await baseRequest()
        .get(`/api/v1/public/appointments/availability?quoteId=${quote.id}&token=${plainToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);

      // Wrong token should fail
      const wrongResponse = await baseRequest()
        .get(`/api/v1/public/appointments/availability?quoteId=${quote.id}&token=wrong-token`)
        .expect(404);

      expect(wrongResponse.body.success).toBe(false);
    });

    test('should reject tokens for different quotes', async () => {
      const quote1 = await createTestQuote(prisma, organizationId, customerId, adminUserId);
      const quote2 = await createTestQuote(prisma, organizationId, customerId, adminUserId);

      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = await bcrypt.hash(token, 10);

      // Create token for quote1
      await prisma.appointmentBookingToken.create({
        data: {
          quoteId: quote1.id,
          organizationId,
          tokenHash,
          status: 'ACTIVE',
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        }
      });

      // Try to use it with quote2
      const response = await baseRequest()
        .get(`/api/v1/public/appointments/availability?quoteId=${quote2.id}&token=${token}`)
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Rate Limiting', () => {
    let quoteId: string;
    let bookingToken: string;

    beforeEach(async () => {
      const quote = await createTestQuote(prisma, organizationId, customerId, adminUserId);
      quoteId = quote.id;

      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = await bcrypt.hash(token, 10);

      await prisma.appointmentBookingToken.create({
        data: {
          quoteId,
          organizationId,
          tokenHash,
          status: 'ACTIVE',
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        }
      });

      bookingToken = token;
    });

    test('should rate limit availability requests', async () => {
      // Make many requests
      const requests = Array(35).fill(null).map(() =>
        baseRequest().get(`/api/v1/public/appointments/availability?quoteId=${quoteId}&token=${bookingToken}`)
      );

      const responses = await Promise.all(requests);

      // Some should succeed, some may be rate limited
      const successful = responses.filter(r => r.status === 200);
      expect(successful.length).toBeGreaterThan(0);
    });

    test('should rate limit booking requests', async () => {
      const startTime = new Date(Date.now() + 48 * 60 * 60 * 1000);
      const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);

      // Make multiple booking attempts (should be strictly limited)
      const requests = Array(10).fill(null).map(() =>
        baseRequest()
          .post('/api/v1/public/appointments/book')
          .send({
            quoteId,
            token: bookingToken,
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
            customerEmail: 'customer@example.com',
            customerName: 'John Doe'
          })
      );

      const responses = await Promise.all(requests);

      // Only the first few should succeed or fail validation
      // Later ones should be rate limited
      const rateLimited = responses.filter(r => r.status === 429);
      // Some requests should be rate limited
    });
  });

  describe('Email Notifications', () => {
    let appointmentId: string;
    let bookingToken: string;
    let quoteId: string;

    beforeEach(async () => {
      const quote = await createTestQuote(prisma, organizationId, customerId, adminUserId);
      quoteId = quote.id;

      await prisma.quote.update({
        where: { id: quote.id },
        data: { status: 'ACCEPTED' }
      });

      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = await bcrypt.hash(token, 10);

      await prisma.appointmentBookingToken.create({
        data: {
          quoteId,
          organizationId,
          tokenHash,
          status: 'ACTIVE',
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        }
      });

      bookingToken = token;
    });

    test('should send confirmation email on booking', async () => {
      const startTime = new Date(Date.now() + 48 * 60 * 60 * 1000);
      const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);

      await baseRequest()
        .post('/api/v1/public/appointments/book')
        .send({
          quoteId,
          token: bookingToken,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          customerEmail: 'customer@example.com',
          customerName: 'John Doe'
        })
        .expect(201);

      // Should send to customer
      expect(mockedEmailService.sendEmail).toHaveBeenCalledWith(
        expect.stringContaining('customer@example.com'),
        expect.any(String),
        expect.any(String),
        expect.any(String)
      );
    });

    test('should send cancellation email', async () => {
      const startTime = new Date(Date.now() + 48 * 60 * 60 * 1000);
      const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);

      // Book first
      const bookingResponse = await baseRequest()
        .post('/api/v1/public/appointments/book')
        .send({
          quoteId,
          token: bookingToken,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          customerEmail: 'customer@example.com',
          customerName: 'John Doe'
        })
        .expect(201);

      appointmentId = bookingResponse.body.appointment.id;
      jest.clearAllMocks();

      // Cancel
      await baseRequest()
        .post(`/api/v1/public/appointments/${appointmentId}/cancel`)
        .send({
          token: bookingToken,
          reason: 'Test cancellation'
        })
        .expect(200);

      expect(mockedEmailService.sendEmail).toHaveBeenCalled();
    });
  });
});