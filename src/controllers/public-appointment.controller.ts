import { Request, Response } from 'express';
import { appointmentAvailabilityService } from '../services/appointment-availability.service';
import { logger } from '../utils/logger';
import { sendSuccess, sendError } from '../utils/response';

/**
 * PublicAppointmentController
 * Public-facing API for customers to book appointments
 * No authentication required - secured with booking tokens
 */
export class PublicAppointmentController {

  /**
   * Get available time slots for appointment booking
   * GET /api/v1/public/appointments/availability?quoteId=xxx&token=xxx&startDate=xxx&endDate=xxx
   */
  public async getAvailability(req: Request, res: Response): Promise<void> {
    try {
      const { quoteId, token, startDate, endDate } = req.query;

      // Validate required parameters
      if (!quoteId || typeof quoteId !== 'string') {
        sendError(res, 'VALIDATION_ERROR', 'Quote ID is required', 400);
        return;
      }

      if (!token || typeof token !== 'string') {
        sendError(res, 'VALIDATION_ERROR', 'Booking token is required', 400);
        return;
      }

      // Parse optional date parameters
      let parsedStartDate: Date | undefined;
      let parsedEndDate: Date | undefined;

      if (startDate && typeof startDate === 'string') {
        parsedStartDate = new Date(startDate);
        if (isNaN(parsedStartDate.getTime())) {
          sendError(res, 'VALIDATION_ERROR', 'Invalid start date format', 400);
          return;
        }
      }

      if (endDate && typeof endDate === 'string') {
        parsedEndDate = new Date(endDate);
        if (isNaN(parsedEndDate.getTime())) {
          sendError(res, 'VALIDATION_ERROR', 'Invalid end date format', 400);
          return;
        }
      }

      // Get available slots
      const availableSlots = await appointmentAvailabilityService.getAvailableSlots(
        quoteId,
        token,
        parsedStartDate,
        parsedEndDate
      );

      const responseData = {
        quoteId,
        availableSlots: availableSlots.map(slot => ({
          start: slot.start.toISOString(),
          end: slot.end.toISOString(),
          duration: Math.round((slot.end.getTime() - slot.start.getTime()) / (60 * 1000))
        })),
        count: availableSlots.length
      };

      sendSuccess(res, responseData);
    } catch (error: any) {
      logger.error('Error getting appointment availability', {
        error,
        quoteId: req.query.quoteId
      });

      // Handle specific error types
      if (error.message.includes('Invalid or expired')) {
        sendError(res, 'INVALID_TOKEN', error.message, 401);
      } else {
        sendError(res, 'INTERNAL_ERROR', error.message || 'Failed to retrieve available slots', 500);
      }
    }
  }

  /**
   * Book an appointment
   * POST /api/v1/public/appointments/book
   * Body: { quoteId, token, startTime, endTime, customerEmail, customerName, customerPhone?, notes? }
   */
  public async bookAppointment(req: Request, res: Response): Promise<void> {
    try {
      const {
        quoteId,
        token,
        startTime,
        endTime,
        customerEmail,
        customerName,
        customerPhone,
        notes
      } = req.body;

      // Validate required fields
      if (!quoteId) {
        sendError(res, 'VALIDATION_ERROR', 'Quote ID is required', 400);
        return;
      }

      if (!token) {
        sendError(res, 'VALIDATION_ERROR', 'Booking token is required', 400);
        return;
      }

      if (!startTime) {
        sendError(res, 'VALIDATION_ERROR', 'Start time is required', 400);
        return;
      }

      if (!endTime) {
        sendError(res, 'VALIDATION_ERROR', 'End time is required', 400);
        return;
      }

      if (!customerEmail) {
        sendError(res, 'VALIDATION_ERROR', 'Customer email is required', 400);
        return;
      }

      if (!customerName) {
        sendError(res, 'VALIDATION_ERROR', 'Customer name is required', 400);
        return;
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(customerEmail)) {
        sendError(res, 'VALIDATION_ERROR', 'Invalid email format', 400);
        return;
      }

      // Parse dates
      const parsedStartTime = new Date(startTime);
      const parsedEndTime = new Date(endTime);

      if (isNaN(parsedStartTime.getTime())) {
        sendError(res, 'VALIDATION_ERROR', 'Invalid start time format', 400);
        return;
      }

      if (isNaN(parsedEndTime.getTime())) {
        sendError(res, 'VALIDATION_ERROR', 'Invalid end time format', 400);
        return;
      }

      // Validate time range
      if (parsedEndTime <= parsedStartTime) {
        sendError(res, 'VALIDATION_ERROR', 'End time must be after start time', 400);
        return;
      }

      // Get IP address for audit
      const ipAddress = req.ip || req.socket.remoteAddress;

      // Book appointment
      const appointment = await appointmentAvailabilityService.bookAppointment(
        quoteId,
        token,
        {
          startTime: parsedStartTime,
          endTime: parsedEndTime,
          customerEmail,
          customerName,
          customerPhone,
          notes
        },
        ipAddress
      );

      const responseData = {
        id: appointment.id,
        title: appointment.title,
        startTime: appointment.startTime,
        endTime: appointment.endTime,
        duration: appointment.duration,
        meetingLink: appointment.meetingLink,
        confirmed: appointment.confirmed,
        message: 'Appointment booked successfully! Check your email for confirmation and meeting details.'
      };

      sendSuccess(res, responseData, 201);
    } catch (error: any) {
      logger.error('Error booking appointment', {
        error,
        quoteId: req.body.quoteId,
        customerEmail: req.body.customerEmail
      });

      // Handle specific error types
      if (error.message.includes('Invalid or expired')) {
        sendError(res, 'INVALID_TOKEN', error.message, 401);
      } else if (error.message.includes('already been used')) {
        sendError(res, 'TOKEN_USED', error.message, 409);
      } else if (error.message.includes('must be in the future')) {
        sendError(res, 'VALIDATION_ERROR', error.message, 400);
      } else {
        sendError(res, 'INTERNAL_ERROR', error.message || 'Failed to book appointment', 500);
      }
    }
  }

  /**
   * Get appointment details
   * GET /api/v1/public/appointments/:appointmentId/details?token=xxx
   */
  public async getAppointmentDetails(req: Request, res: Response): Promise<void> {
    try {
      const { appointmentId } = req.params;
      const { token } = req.query;

      if (!token || typeof token !== 'string') {
        sendError(res, 'VALIDATION_ERROR', 'Token is required', 400);
        return;
      }

      const appointment = await appointmentAvailabilityService.getAppointmentDetails(
        appointmentId,
        token
      );

      // Prepare response (exclude sensitive information)
      const responseData = {
        id: appointment.id,
        title: appointment.title,
        description: appointment.description,
        startTime: appointment.startTime,
        endTime: appointment.endTime,
        duration: appointment.duration,
        meetingLink: appointment.meetingLink,
        confirmed: appointment.confirmed,
        cancelled: appointment.cancelled,
        cancellationReason: appointment.cancellationReason,
        quote: {
          id: appointment.quote.id,
          quoteNumber: appointment.quote.quoteNumber,
          status: appointment.quote.status
        },
        customer: {
          name: appointment.quote.customer.person
            ? `${appointment.quote.customer.person.firstName} ${appointment.quote.customer.person.lastName}`
            : appointment.quote.customer.business?.legalName || 'Customer',
          email: appointment.quote.customer.person?.email || appointment.quote.customer.business?.email
        }
      };

      sendSuccess(res, responseData);
    } catch (error: any) {
      logger.error('Error getting appointment details', {
        error,
        appointmentId: req.params.appointmentId
      });

      if (error.message.includes('Invalid or expired')) {
        sendError(res, 'INVALID_TOKEN', error.message, 401);
      } else if (error.message.includes('not found')) {
        sendError(res, 'NOT_FOUND', error.message, 404);
      } else {
        sendError(res, 'INTERNAL_ERROR', error.message || 'Failed to retrieve appointment details', 500);
      }
    }
  }

  /**
   * Cancel appointment (public endpoint)
   * POST /api/v1/public/appointments/:appointmentId/cancel
   * Body: { token, reason? }
   */
  public async cancelAppointment(req: Request, res: Response): Promise<void> {
    try {
      const { appointmentId } = req.params;
      const { token, reason } = req.body;

      if (!token) {
        sendError(res, 'VALIDATION_ERROR', 'Token is required', 400);
        return;
      }

      // Validate token first
      const appointment = await appointmentAvailabilityService.getAppointmentDetails(
        appointmentId,
        token
      );

      if (!appointment) {
        sendError(res, 'NOT_FOUND', 'Appointment not found', 404);
        return;
      }

      // Cancel appointment
      const cancelled = await appointmentAvailabilityService.cancelAppointment(
        appointmentId,
        reason
      );

      const responseData = {
        id: cancelled.id,
        cancelled: cancelled.cancelled,
        cancellationReason: cancelled.cancellationReason,
        message: 'Appointment cancelled successfully. You will receive a confirmation email shortly.'
      };

      sendSuccess(res, responseData);
    } catch (error: any) {
      logger.error('Error cancelling appointment', {
        error,
        appointmentId: req.params.appointmentId
      });

      if (error.message.includes('Invalid or expired')) {
        sendError(res, 'INVALID_TOKEN', error.message, 401);
      } else if (error.message.includes('not found')) {
        sendError(res, 'NOT_FOUND', error.message, 404);
      } else if (error.message.includes('already cancelled')) {
        sendError(res, 'ALREADY_CANCELLED', error.message, 409);
      } else {
        sendError(res, 'INTERNAL_ERROR', error.message || 'Failed to cancel appointment', 500);
      }
    }
  }
}

export const publicAppointmentController = new PublicAppointmentController();