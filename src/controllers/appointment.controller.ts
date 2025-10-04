import { Response } from 'express';
import { body, query, validationResult } from 'express-validator';
import { appointmentService } from '../services/appointment.service';
import { AuthenticatedRequest } from '../middleware/auth.middleware';

// Validation rules
export const validateCreateAppointment = [
  body('customerId').notEmpty().withMessage('Customer ID is required'),
  body('title').notEmpty().trim().withMessage('Appointment title is required'),
  body('startTime').isISO8601().withMessage('Valid start time is required'),
  body('endTime').isISO8601().withMessage('Valid end time is required'),
  body('duration').isInt({ min: 1 }).withMessage('Duration must be a positive integer in minutes'),
  body('description').optional().trim(),
  body('projectId').optional().isString(),
  body('locationId').optional().isString()
];

export const validateUpdateAppointment = [
  body('title').optional().notEmpty().trim().withMessage('Title cannot be empty'),
  body('startTime').optional().isISO8601().withMessage('Valid start time is required'),
  body('endTime').optional().isISO8601().withMessage('Valid end time is required'),
  body('duration').optional().isInt({ min: 1 }).withMessage('Duration must be a positive integer in minutes'),
  body('description').optional().trim(),
  body('locationId').optional().isString()
];

export const validateListAppointments = [
  query('customerId').optional().isString(),
  query('projectId').optional().isString(),
  query('locationId').optional().isString(),
  query('startDate').optional().isISO8601().withMessage('Valid start date is required'),
  query('endDate').optional().isISO8601().withMessage('Valid end date is required'),
  query('confirmed').optional().isBoolean(),
  query('completed').optional().isBoolean(),
  query('cancelled').optional().isBoolean(),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be non-negative')
];

export const validateRescheduleAppointment = [
  body('startTime').isISO8601().withMessage('Valid start time is required'),
  body('endTime').isISO8601().withMessage('Valid end time is required')
];

export const validateCompleteAppointment = [
  body('notes').optional().trim()
];

export const validateCancelAppointment = [
  body('cancellationReason').optional().trim()
];

export class AppointmentController {
  async createAppointment(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const appointmentData = {
        customerId: req.body.customerId,
        projectId: req.body.projectId,
        locationId: req.body.locationId,
        title: req.body.title,
        description: req.body.description,
        startTime: new Date(req.body.startTime),
        endTime: new Date(req.body.endTime),
        duration: parseInt(req.body.duration)
      };

      const appointment = await appointmentService.createAppointment(
        appointmentData,
        req.user.organizationId,
        {
          userId: req.user.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      );

      res.status(201).json({
        message: 'Appointment created successfully',
        appointment: {
          id: appointment.id,
          title: appointment.title,
          description: appointment.description,
          startTime: appointment.startTime,
          endTime: appointment.endTime,
          duration: appointment.duration,
          confirmed: appointment.confirmed,
          cancelled: appointment.cancelled,
          completed: appointment.completed,
          customer: appointment.customer,
          project: appointment.project,
          location: appointment.location,
          createdAt: appointment.createdAt
        }
      });
    } catch (error: any) {
      if (error.message === 'Customer not found' || error.message === 'Project not found' || error.message === 'Location not found') {
        res.status(404).json({ error: error.message });
      } else if (error.message.includes('conflict') || error.message.includes('past') || error.message.includes('before')) {
        res.status(409).json({ error: error.message });
      } else {
        res.status(500).json({ error: error.message });
      }
    }
  }

  async getAppointment(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const appointment = await appointmentService.getAppointment(
        req.params.id,
        req.user.organizationId,
        {
          userId: req.user.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      );

      if (!appointment) {
        res.status(404).json({ error: 'Appointment not found' });
        return;
      }

      res.json({
        appointment: {
          id: appointment.id,
          title: appointment.title,
          description: appointment.description,
          startTime: appointment.startTime,
          endTime: appointment.endTime,
          duration: appointment.duration,
          confirmed: appointment.confirmed,
          cancelled: appointment.cancelled,
          completed: appointment.completed,
          cancellationReason: appointment.cancellationReason,
          reminderSent: appointment.reminderSent,
          reminderSentAt: appointment.reminderSentAt,
          customer: appointment.customer,
          project: appointment.project,
          location: appointment.location,
          createdAt: appointment.createdAt,
          updatedAt: appointment.updatedAt
        }
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  async updateAppointment(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const updateData: any = {};
      if (req.body.title !== undefined) updateData.title = req.body.title;
      if (req.body.description !== undefined) updateData.description = req.body.description;
      if (req.body.startTime !== undefined) updateData.startTime = new Date(req.body.startTime);
      if (req.body.endTime !== undefined) updateData.endTime = new Date(req.body.endTime);
      if (req.body.duration !== undefined) updateData.duration = parseInt(req.body.duration);
      if (req.body.locationId !== undefined) updateData.locationId = req.body.locationId;

      const appointment = await appointmentService.updateAppointment(
        req.params.id,
        updateData,
        req.user.organizationId,
        {
          userId: req.user.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      );

      res.json({
        message: 'Appointment updated successfully',
        appointment: {
          id: appointment.id,
          title: appointment.title,
          description: appointment.description,
          startTime: appointment.startTime,
          endTime: appointment.endTime,
          duration: appointment.duration,
          confirmed: appointment.confirmed,
          cancelled: appointment.cancelled,
          completed: appointment.completed,
          updatedAt: appointment.updatedAt
        }
      });
    } catch (error: any) {
      if (error.message === 'Appointment not found' || error.message === 'Location not found') {
        res.status(404).json({ error: error.message });
      } else if (error.message.includes('Cannot update') || error.message.includes('conflict') || error.message.includes('past') || error.message.includes('before')) {
        res.status(409).json({ error: error.message });
      } else {
        res.status(500).json({ error: error.message });
      }
    }
  }

  async listAppointments(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const filters = {
        customerId: req.query.customerId as string,
        projectId: req.query.projectId as string,
        locationId: req.query.locationId as string,
        startDate: req.query.startDate as string,
        endDate: req.query.endDate as string,
        confirmed: req.query.confirmed === 'true' ? true : req.query.confirmed === 'false' ? false : undefined,
        completed: req.query.completed === 'true' ? true : req.query.completed === 'false' ? false : undefined,
        cancelled: req.query.cancelled === 'true' ? true : req.query.cancelled === 'false' ? false : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
        offset: req.query.offset ? parseInt(req.query.offset as string) : undefined
      };

      const result = await appointmentService.listAppointments(filters, req.user.organizationId);

      res.json({
        appointments: result.appointments.map(appointment => ({
          id: appointment.id,
          title: appointment.title,
          description: appointment.description,
          startTime: appointment.startTime,
          endTime: appointment.endTime,
          duration: appointment.duration,
          confirmed: appointment.confirmed,
          cancelled: appointment.cancelled,
          completed: appointment.completed,
          customer: appointment.customer,
          project: appointment.project,
          location: appointment.location,
          createdAt: appointment.createdAt
        })),
        pagination: {
          total: result.total,
          limit: filters.limit || 50,
          offset: filters.offset || 0
        }
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  async confirmAppointment(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const appointment = await appointmentService.confirmAppointment(
        req.params.id,
        req.user.organizationId,
        {
          userId: req.user.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      );

      res.json({
        message: 'Appointment confirmed successfully',
        appointment: {
          id: appointment.id,
          confirmed: appointment.confirmed,
          updatedAt: appointment.updatedAt
        }
      });
    } catch (error: any) {
      if (error.message === 'Appointment not found') {
        res.status(404).json({ error: error.message });
      } else if (error.message.includes('Cannot confirm')) {
        res.status(409).json({ error: error.message });
      } else {
        res.status(500).json({ error: error.message });
      }
    }
  }

  async completeAppointment(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const { notes } = req.body;

      const appointment = await appointmentService.completeAppointment(
        req.params.id,
        req.user.organizationId,
        {
          userId: req.user.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        },
        notes
      );

      res.json({
        message: 'Appointment completed successfully',
        appointment: {
          id: appointment.id,
          completed: appointment.completed,
          description: appointment.description,
          updatedAt: appointment.updatedAt
        }
      });
    } catch (error: any) {
      if (error.message === 'Appointment not found') {
        res.status(404).json({ error: error.message });
      } else if (error.message.includes('Cannot complete')) {
        res.status(409).json({ error: error.message });
      } else {
        res.status(500).json({ error: error.message });
      }
    }
  }

  async cancelAppointment(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const { cancellationReason } = req.body;

      const appointment = await appointmentService.cancelAppointment(
        req.params.id,
        req.user.organizationId,
        {
          userId: req.user.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        },
        cancellationReason
      );

      res.json({
        message: 'Appointment cancelled successfully',
        appointment: {
          id: appointment.id,
          cancelled: appointment.cancelled,
          cancellationReason: appointment.cancellationReason,
          updatedAt: appointment.updatedAt
        }
      });
    } catch (error: any) {
      if (error.message === 'Appointment not found') {
        res.status(404).json({ error: error.message });
      } else if (error.message.includes('Cannot cancel')) {
        res.status(409).json({ error: error.message });
      } else {
        res.status(500).json({ error: error.message });
      }
    }
  }

  async rescheduleAppointment(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const { startTime, endTime } = req.body;

      const appointment = await appointmentService.rescheduleAppointment(
        req.params.id,
        new Date(startTime),
        new Date(endTime),
        req.user.organizationId,
        {
          userId: req.user.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      );

      res.json({
        message: 'Appointment rescheduled successfully',
        appointment: {
          id: appointment.id,
          startTime: appointment.startTime,
          endTime: appointment.endTime,
          duration: appointment.duration,
          confirmed: appointment.confirmed,
          updatedAt: appointment.updatedAt
        }
      });
    } catch (error: any) {
      if (error.message === 'Appointment not found') {
        res.status(404).json({ error: error.message });
      } else if (error.message.includes('Cannot reschedule') || error.message.includes('conflict') || error.message.includes('past') || error.message.includes('before')) {
        res.status(409).json({ error: error.message });
      } else {
        res.status(500).json({ error: error.message });
      }
    }
  }

  async getAppointmentStats(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const customerId = req.query.customerId as string;
      const stats = await appointmentService.getAppointmentStats(
        req.user.organizationId,
        customerId
      );

      res.json({ stats });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
}

export const appointmentController = new AppointmentController();