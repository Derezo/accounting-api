import express from 'express';
import { publicAppointmentController } from '../controllers/public-appointment.controller';
import { rateLimitMiddleware } from '../middleware/rate-limit.middleware';

const router = express.Router();

/**
 * Public Appointment Routes
 * These endpoints are publicly accessible for customers to book appointments
 * No authentication required, but secured with booking tokens
 */

/**
 * @route GET /api/v1/public/appointments/availability
 * @desc Get available time slots for appointment booking
 * @query quoteId - Quote ID (required)
 * @query token - Booking token (required)
 * @query startDate - Start date for availability search (optional, ISO 8601)
 * @query endDate - End date for availability search (optional, ISO 8601)
 * @access Public (with token)
 */
router.get(
  '/availability',
  rateLimitMiddleware({ windowMs: 60000, max: 30 }), // 30 requests per minute
  publicAppointmentController.getAvailability.bind(publicAppointmentController)
);

/**
 * @route POST /api/v1/public/appointments/book
 * @desc Book an appointment
 * @body quoteId - Quote ID (required)
 * @body token - Booking token (required)
 * @body startTime - Appointment start time (required, ISO 8601)
 * @body endTime - Appointment end time (required, ISO 8601)
 * @body customerEmail - Customer email (required)
 * @body customerName - Customer name (required)
 * @body customerPhone - Customer phone (optional)
 * @body notes - Additional notes (optional)
 * @access Public (with token)
 */
router.post(
  '/book',
  rateLimitMiddleware({ windowMs: 60000, max: 5 }), // 5 requests per minute
  publicAppointmentController.bookAppointment.bind(publicAppointmentController)
);

/**
 * @route GET /api/v1/public/appointments/:appointmentId/details
 * @desc Get appointment details
 * @param appointmentId - Appointment ID
 * @query token - Booking token (required)
 * @access Public (with token)
 */
router.get(
  '/:appointmentId/details',
  rateLimitMiddleware({ windowMs: 60000, max: 20 }), // 20 requests per minute
  publicAppointmentController.getAppointmentDetails.bind(publicAppointmentController)
);

/**
 * @route POST /api/v1/public/appointments/:appointmentId/cancel
 * @desc Cancel an appointment
 * @param appointmentId - Appointment ID
 * @body token - Booking token (required)
 * @body reason - Cancellation reason (optional)
 * @access Public (with token)
 */
router.post(
  '/:appointmentId/cancel',
  rateLimitMiddleware({ windowMs: 60000, max: 5 }), // 5 requests per minute
  publicAppointmentController.cancelAppointment.bind(publicAppointmentController)
);

export default router;