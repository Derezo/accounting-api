import { Router } from 'express';
import {
  appointmentController,
  validateCreateAppointment,
  validateUpdateAppointment,
  validateListAppointments,
  validateRescheduleAppointment,
  validateCompleteAppointment,
  validateCancelAppointment
} from '../controllers/appointment.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { auditMiddleware } from '../middleware/audit.middleware';
import { UserRole } from '../types/enums';

const router = Router();

// Apply authentication to all routes
router.use(authenticate);

// Apply audit logging to all routes
// router.use(auditMiddleware); // Removed: auditMiddleware returns an object, not a middleware function

/**
 * @swagger
 * /appointments:
 *   post:
 *     tags: [Appointments]
 *     summary: Create a new appointment
 *     description: Schedules a new appointment with a customer including date, time, location, and purpose. Supports various appointment types and automated reminders.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - customerId
 *               - scheduledAt
 *               - duration
 *               - type
 *               - title
 *             properties:
 *               customerId:
 *                 type: string
 *                 description: Customer ID for the appointment
 *                 example: "clp1234567890"
 *               title:
 *                 type: string
 *                 description: Appointment title
 *                 example: "Initial Consultation"
 *                 minLength: 5
 *                 maxLength: 100
 *               description:
 *                 type: string
 *                 description: Detailed appointment description
 *                 example: "Discuss project requirements and budget"
 *                 maxLength: 1000
 *               scheduledAt:
 *                 type: string
 *                 format: date-time
 *                 description: Appointment date and time (ISO 8601)
 *                 example: "2024-01-20T10:00:00Z"
 *               duration:
 *                 type: integer
 *                 description: Appointment duration in minutes
 *                 example: 60
 *                 minimum: 15
 *                 maximum: 480
 *               type:
 *                 type: string
 *                 enum: [CONSULTATION, MEETING, PRESENTATION, REVIEW, FOLLOW_UP, OTHER]
 *                 description: Type of appointment
 *                 example: "CONSULTATION"
 *               location:
 *                 type: object
 *                 properties:
 *                   type:
 *                     type: string
 *                     enum: [IN_PERSON, VIRTUAL, PHONE, CLIENT_SITE]
 *                     example: "IN_PERSON"
 *                   address:
 *                     type: string
 *                     example: "123 Business Ave, Suite 100"
 *                   meetingLink:
 *                     type: string
 *                     format: uri
 *                     example: "https://meet.google.com/abc-defg-hij"
 *                   phone:
 *                     type: string
 *                     example: "+1-555-123-4567"
 *                   notes:
 *                     type: string
 *                     example: "Use main entrance, ask for John"
 *               priority:
 *                 type: string
 *                 enum: [LOW, NORMAL, HIGH, URGENT]
 *                 default: NORMAL
 *                 description: Appointment priority
 *               reminderSettings:
 *                 type: object
 *                 properties:
 *                   enabled:
 *                     type: boolean
 *                     default: true
 *                   emailReminder:
 *                     type: boolean
 *                     default: true
 *                   smsReminder:
 *                     type: boolean
 *                     default: false
 *                   reminderTimes:
 *                     type: array
 *                     items:
 *                       type: integer
 *                     description: Reminder times in minutes before appointment
 *                     example: [1440, 60, 15]
 *               attendees:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     userId:
 *                       type: string
 *                     required:
 *                       type: boolean
 *                       default: false
 *                 description: Internal team members attending
 *               notes:
 *                 type: string
 *                 description: Internal notes about the appointment
 *                 maxLength: 2000
 *     responses:
 *       201:
 *         description: Appointment created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   description: Appointment ID
 *                 title:
 *                   type: string
 *                 scheduledAt:
 *                   type: string
 *                   format: date-time
 *                 duration:
 *                   type: integer
 *                 status:
 *                   type: string
 *                   enum: [SCHEDULED, CONFIRMED, IN_PROGRESS, COMPLETED, CANCELLED, NO_SHOW]
 *                   example: "SCHEDULED"
 *                 customer:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     email:
 *                       type: string
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Invalid input data or scheduling conflict
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       404:
 *         description: Customer not found
 *       409:
 *         description: Conflict - Time slot already booked
 *       500:
 *         description: Internal server error
 */
router.post(
  '/',
  authorize(UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT, UserRole.EMPLOYEE),
  validateCreateAppointment,
  appointmentController.createAppointment.bind(appointmentController)
);

/**
 * @swagger
 * /appointments/{id}:
 *   get:
 *     tags: [Appointments]
 *     summary: Get appointment details
 *     description: Retrieves detailed information about a specific appointment including participants, location, history, and related documents.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Appointment ID
 *         schema:
 *           type: string
 *           example: "clp1234567890"
 *     responses:
 *       200:
 *         description: Appointment details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   description: Appointment ID
 *                 title:
 *                   type: string
 *                   example: "Initial Consultation"
 *                 description:
 *                   type: string
 *                   example: "Discuss project requirements and timeline"
 *                 scheduledAt:
 *                   type: string
 *                   format: date-time
 *                   example: "2024-01-20T10:00:00Z"
 *                 duration:
 *                   type: integer
 *                   description: Duration in minutes
 *                   example: 60
 *                 status:
 *                   type: string
 *                   enum: [SCHEDULED, CONFIRMED, IN_PROGRESS, COMPLETED, CANCELLED, NO_SHOW]
 *                   example: "CONFIRMED"
 *                 type:
 *                   type: string
 *                   enum: [CONSULTATION, MEETING, PRESENTATION, REVIEW, FOLLOW_UP, OTHER]
 *                   example: "CONSULTATION"
 *                 priority:
 *                   type: string
 *                   enum: [LOW, NORMAL, HIGH, URGENT]
 *                   example: "HIGH"
 *                 customer:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                       example: "John Doe"
 *                     email:
 *                       type: string
 *                       example: "john@example.com"
 *                     phone:
 *                       type: string
 *                       example: "+1-555-123-4567"
 *                 location:
 *                   type: object
 *                   properties:
 *                     type:
 *                       type: string
 *                       enum: [IN_PERSON, VIRTUAL, PHONE, CLIENT_SITE]
 *                       example: "IN_PERSON"
 *                     address:
 *                       type: string
 *                       example: "123 Business Ave, Suite 100"
 *                     meetingLink:
 *                       type: string
 *                       format: uri
 *                       example: "https://meet.google.com/abc-defg-hij"
 *                     phone:
 *                       type: string
 *                       example: "+1-555-123-4567"
 *                     notes:
 *                       type: string
 *                       example: "Use main entrance, ask for John"
 *                 attendees:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       email:
 *                         type: string
 *                       role:
 *                         type: string
 *                       required:
 *                         type: boolean
 *                       status:
 *                         type: string
 *                         enum: [INVITED, CONFIRMED, DECLINED, TENTATIVE]
 *                 reminderSettings:
 *                   type: object
 *                   properties:
 *                     enabled:
 *                       type: boolean
 *                     emailReminder:
 *                       type: boolean
 *                     smsReminder:
 *                       type: boolean
 *                     reminderTimes:
 *                       type: array
 *                       items:
 *                         type: integer
 *                       description: Reminder times in minutes before appointment
 *                 history:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       action:
 *                         type: string
 *                         enum: [CREATED, UPDATED, CONFIRMED, RESCHEDULED, CANCELLED, COMPLETED]
 *                       timestamp:
 *                         type: string
 *                         format: date-time
 *                       performedBy:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           name:
 *                             type: string
 *                       notes:
 *                         type: string
 *                   description: Appointment history and changes
 *                 attachments:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       filename:
 *                         type: string
 *                       description:
 *                         type: string
 *                       url:
 *                         type: string
 *                       uploadedAt:
 *                         type: string
 *                         format: date-time
 *                       uploadedBy:
 *                         type: string
 *                 relatedRecords:
 *                   type: object
 *                   properties:
 *                     quoteId:
 *                       type: string
 *                       description: Related quote ID (if applicable)
 *                     projectId:
 *                       type: string
 *                       description: Related project ID (if applicable)
 *                     invoiceId:
 *                       type: string
 *                       description: Related invoice ID (if applicable)
 *                 notes:
 *                   type: string
 *                   description: Internal notes about the appointment
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                 updatedAt:
 *                   type: string
 *                   format: date-time
 *                 createdBy:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     role:
 *                       type: string
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       404:
 *         description: Appointment not found
 *       500:
 *         description: Internal server error
 */
router.get(
  '/:id',
  appointmentController.getAppointment.bind(appointmentController)
);

/**
 * @swagger
 * /appointments/{id}:
 *   put:
 *     tags: [Appointments]
 *     summary: Update appointment
 *     description: Updates appointment details including title, description, location, and participants. Note that changing date/time should use the reschedule endpoint.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Appointment ID
 *         schema:
 *           type: string
 *           example: "clp1234567890"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 description: Appointment title
 *                 example: "Updated Consultation Meeting"
 *                 minLength: 5
 *                 maxLength: 100
 *               description:
 *                 type: string
 *                 description: Detailed appointment description
 *                 example: "Updated: Discuss project scope and requirements"
 *                 maxLength: 1000
 *               type:
 *                 type: string
 *                 enum: [CONSULTATION, MEETING, PRESENTATION, REVIEW, FOLLOW_UP, OTHER]
 *                 description: Type of appointment
 *               priority:
 *                 type: string
 *                 enum: [LOW, NORMAL, HIGH, URGENT]
 *                 description: Appointment priority
 *               location:
 *                 type: object
 *                 properties:
 *                   type:
 *                     type: string
 *                     enum: [IN_PERSON, VIRTUAL, PHONE, CLIENT_SITE]
 *                   address:
 *                     type: string
 *                   meetingLink:
 *                     type: string
 *                     format: uri
 *                   phone:
 *                     type: string
 *                   notes:
 *                     type: string
 *               reminderSettings:
 *                 type: object
 *                 properties:
 *                   enabled:
 *                     type: boolean
 *                   emailReminder:
 *                     type: boolean
 *                   smsReminder:
 *                     type: boolean
 *                   reminderTimes:
 *                     type: array
 *                     items:
 *                       type: integer
 *                     description: Reminder times in minutes before appointment
 *               attendees:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     userId:
 *                       type: string
 *                     required:
 *                       type: boolean
 *                       default: false
 *                 description: Internal team members attending
 *               notes:
 *                 type: string
 *                 description: Internal notes about the appointment
 *                 maxLength: 2000
 *               updateReason:
 *                 type: string
 *                 description: Reason for the update
 *                 example: "Added additional attendees"
 *                 maxLength: 500
 *     responses:
 *       200:
 *         description: Appointment updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 title:
 *                   type: string
 *                 description:
 *                   type: string
 *                 type:
 *                   type: string
 *                   enum: [CONSULTATION, MEETING, PRESENTATION, REVIEW, FOLLOW_UP, OTHER]
 *                 priority:
 *                   type: string
 *                   enum: [LOW, NORMAL, HIGH, URGENT]
 *                 location:
 *                   type: object
 *                 updatedBy:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     role:
 *                       type: string
 *                 updatedAt:
 *                   type: string
 *                   format: date-time
 *                 changes:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       field:
 *                         type: string
 *                       previousValue:
 *                         type: string
 *                       newValue:
 *                         type: string
 *                   description: Summary of changes made
 *                 notificationsSent:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: List of notification types sent
 *       400:
 *         description: Invalid input data
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       404:
 *         description: Appointment not found
 *       409:
 *         description: Conflict - Appointment in invalid state for updates
 *       500:
 *         description: Internal server error
 */
router.put(
  '/:id',
  authorize(UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT, UserRole.EMPLOYEE),
  validateUpdateAppointment,
  appointmentController.updateAppointment.bind(appointmentController)
);

/**
 * @swagger
 * /appointments/stats/summary:
 *   get:
 *     tags: [Appointments]
 *     summary: Get appointment statistics
 *     description: Retrieves comprehensive appointment statistics including status distribution, booking trends, and performance metrics for the organization.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [day, week, month, quarter, year]
 *           default: month
 *         description: Time period for statistics calculation
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for custom period (YYYY-MM-DD)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for custom period (YYYY-MM-DD)
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [CONSULTATION, MEETING, PRESENTATION, REVIEW, FOLLOW_UP, OTHER]
 *         description: Filter by appointment type
 *     responses:
 *       200:
 *         description: Appointment statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 summary:
 *                   type: object
 *                   properties:
 *                     totalAppointments:
 *                       type: integer
 *                       description: Total number of appointments
 *                     completedAppointments:
 *                       type: integer
 *                       description: Successfully completed appointments
 *                     cancelledAppointments:
 *                       type: integer
 *                       description: Cancelled appointments
 *                     noShowAppointments:
 *                       type: integer
 *                       description: No-show appointments
 *                     upcomingAppointments:
 *                       type: integer
 *                       description: Scheduled future appointments
 *                     completionRate:
 *                       type: number
 *                       format: float
 *                       description: Percentage of completed appointments
 *                 statusDistribution:
 *                   type: object
 *                   properties:
 *                     SCHEDULED:
 *                       type: integer
 *                     CONFIRMED:
 *                       type: integer
 *                     IN_PROGRESS:
 *                       type: integer
 *                     COMPLETED:
 *                       type: integer
 *                     CANCELLED:
 *                       type: integer
 *                     NO_SHOW:
 *                       type: integer
 *                 typeDistribution:
 *                   type: object
 *                   properties:
 *                     CONSULTATION:
 *                       type: integer
 *                     MEETING:
 *                       type: integer
 *                     PRESENTATION:
 *                       type: integer
 *                     REVIEW:
 *                       type: integer
 *                     FOLLOW_UP:
 *                       type: integer
 *                     OTHER:
 *                       type: integer
 *                 trends:
 *                   type: object
 *                   properties:
 *                     bookingsPerDay:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           date:
 *                             type: string
 *                             format: date
 *                           count:
 *                             type: integer
 *                     averageDuration:
 *                       type: number
 *                       format: float
 *                       description: Average appointment duration in minutes
 *                     peakHours:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           hour:
 *                             type: integer
 *                           count:
 *                             type: integer
 *                 performance:
 *                   type: object
 *                   properties:
 *                     onTimeRate:
 *                       type: number
 *                       format: float
 *                       description: Percentage of on-time appointments
 *                     averageLeadTime:
 *                       type: number
 *                       format: float
 *                       description: Average days between booking and appointment
 *                     customerSatisfaction:
 *                       type: number
 *                       format: float
 *                       description: Average satisfaction rating
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       500:
 *         description: Internal server error
 */
router.get(
  '/stats/summary',
  appointmentController.getAppointmentStats.bind(appointmentController)
);

/**
 * @swagger
 * /appointments:
 *   get:
 *     tags: [Appointments]
 *     summary: List appointments
 *     description: Retrieves a paginated list of appointments with filtering and search capabilities. Users can view all appointments within their organization.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *         description: Number of appointments per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search term for appointment title or customer name
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [SCHEDULED, CONFIRMED, IN_PROGRESS, COMPLETED, CANCELLED, NO_SHOW]
 *         description: Filter by appointment status
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [CONSULTATION, MEETING, PRESENTATION, REVIEW, FOLLOW_UP, OTHER]
 *         description: Filter by appointment type
 *       - in: query
 *         name: customerId
 *         schema:
 *           type: string
 *         description: Filter by specific customer
 *       - in: query
 *         name: assignedTo
 *         schema:
 *           type: string
 *         description: Filter by assigned user ID
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter appointments from this date (YYYY-MM-DD)
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter appointments to this date (YYYY-MM-DD)
 *       - in: query
 *         name: priority
 *         schema:
 *           type: string
 *           enum: [LOW, NORMAL, HIGH, URGENT]
 *         description: Filter by appointment priority
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [scheduledAt, createdAt, updatedAt, title, status, priority]
 *           default: scheduledAt
 *         description: Field to sort by
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: asc
 *         description: Sort order
 *     responses:
 *       200:
 *         description: Appointments retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         description: Appointment ID
 *                       title:
 *                         type: string
 *                         example: "Initial Consultation"
 *                       description:
 *                         type: string
 *                       scheduledAt:
 *                         type: string
 *                         format: date-time
 *                       duration:
 *                         type: integer
 *                         description: Duration in minutes
 *                       status:
 *                         type: string
 *                         enum: [SCHEDULED, CONFIRMED, IN_PROGRESS, COMPLETED, CANCELLED, NO_SHOW]
 *                       type:
 *                         type: string
 *                         enum: [CONSULTATION, MEETING, PRESENTATION, REVIEW, FOLLOW_UP, OTHER]
 *                       priority:
 *                         type: string
 *                         enum: [LOW, NORMAL, HIGH, URGENT]
 *                       customer:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           name:
 *                             type: string
 *                           email:
 *                             type: string
 *                       location:
 *                         type: object
 *                         properties:
 *                           type:
 *                             type: string
 *                           address:
 *                             type: string
 *                           meetingLink:
 *                             type: string
 *                       assignedTo:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             id:
 *                               type: string
 *                             name:
 *                               type: string
 *                             role:
 *                               type: string
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       updatedAt:
 *                         type: string
 *                         format: date-time
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     pages:
 *                       type: integer
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       500:
 *         description: Internal server error
 */
router.get(
  '/',
  validateListAppointments,
  appointmentController.listAppointments.bind(appointmentController)
);

/**
 * @swagger
 * /appointments/{id}/confirm:
 *   post:
 *     tags: [Appointments]
 *     summary: Confirm appointment
 *     description: Confirms a scheduled appointment, changing status from SCHEDULED to CONFIRMED. Triggers confirmation notifications to all participants.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Appointment ID
 *         schema:
 *           type: string
 *           example: "clp1234567890"
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               confirmationNotes:
 *                 type: string
 *                 description: Notes about the confirmation
 *                 example: "Customer confirmed availability"
 *                 maxLength: 500
 *               sendNotifications:
 *                 type: boolean
 *                 default: true
 *                 description: Whether to send confirmation notifications
 *     responses:
 *       200:
 *         description: Appointment confirmed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 title:
 *                   type: string
 *                 status:
 *                   type: string
 *                   example: "CONFIRMED"
 *                 confirmedBy:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     role:
 *                       type: string
 *                 confirmedAt:
 *                   type: string
 *                   format: date-time
 *                 notificationsSent:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: List of notification types sent
 *       400:
 *         description: Invalid request - Appointment cannot be confirmed
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       404:
 *         description: Appointment not found
 *       409:
 *         description: Conflict - Appointment already confirmed or in invalid state
 *       500:
 *         description: Internal server error
 */
router.post(
  '/:id/confirm',
  authorize(UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT, UserRole.EMPLOYEE),
  appointmentController.confirmAppointment.bind(appointmentController)
);

/**
 * @swagger
 * /appointments/{id}/complete:
 *   post:
 *     tags: [Appointments]
 *     summary: Complete appointment
 *     description: Marks appointment as completed with outcome details, follow-up actions, and billing information. Essential for tracking service delivery.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Appointment ID
 *         schema:
 *           type: string
 *           example: "clp1234567890"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - outcome
 *             properties:
 *               outcome:
 *                 type: string
 *                 enum: [SUCCESSFUL, PARTIALLY_COMPLETED, RESCHEDULED, CLIENT_NO_SHOW, CANCELLED]
 *                 description: Appointment outcome
 *                 example: "SUCCESSFUL"
 *               completionNotes:
 *                 type: string
 *                 description: Detailed notes about the appointment
 *                 example: "Discussed project requirements, provided quote"
 *                 minLength: 10
 *                 maxLength: 2000
 *               actualDuration:
 *                 type: integer
 *                 description: Actual duration in minutes
 *                 example: 75
 *                 minimum: 1
 *               followUpRequired:
 *                 type: boolean
 *                 default: false
 *                 description: Whether follow-up is required
 *               followUpDate:
 *                 type: string
 *                 format: date
 *                 description: Suggested follow-up date
 *               nextSteps:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: List of next steps or action items
 *                 example: ["Send detailed quote", "Schedule site visit"]
 *               billableHours:
 *                 type: number
 *                 format: float
 *                 description: Billable hours for this appointment
 *                 example: 1.25
 *                 minimum: 0
 *               expenses:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     description:
 *                       type: string
 *                     amount:
 *                       type: number
 *                       format: float
 *                     category:
 *                       type: string
 *                 description: Expenses incurred during appointment
 *               clientSatisfaction:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *                 description: Client satisfaction rating (1-5)
 *               attachments:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     filename:
 *                       type: string
 *                     description:
 *                       type: string
 *                     url:
 *                       type: string
 *                 description: Files or documents related to the appointment
 *     responses:
 *       200:
 *         description: Appointment completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 title:
 *                   type: string
 *                 status:
 *                   type: string
 *                   example: "COMPLETED"
 *                 outcome:
 *                   type: string
 *                 completedBy:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     role:
 *                       type: string
 *                 completedAt:
 *                   type: string
 *                   format: date-time
 *                 actualDuration:
 *                   type: integer
 *                 billableAmount:
 *                   type: number
 *                   format: float
 *                   description: Calculated billable amount
 *                 followUpAppointmentId:
 *                   type: string
 *                   description: ID of created follow-up appointment (if any)
 *                 generatedInvoiceId:
 *                   type: string
 *                   description: ID of generated invoice (if applicable)
 *       400:
 *         description: Invalid input data or appointment cannot be completed
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       404:
 *         description: Appointment not found
 *       409:
 *         description: Conflict - Appointment already completed or in invalid state
 *       500:
 *         description: Internal server error
 */
router.post(
  '/:id/complete',
  authorize(UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT, UserRole.EMPLOYEE),
  validateCompleteAppointment,
  appointmentController.completeAppointment.bind(appointmentController)
);

/**
 * @swagger
 * /appointments/{id}/cancel:
 *   post:
 *     tags: [Appointments]
 *     summary: Cancel appointment
 *     description: Cancels an appointment with reason and notification options. Handles cancellation policies and rescheduling suggestions.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Appointment ID
 *         schema:
 *           type: string
 *           example: "clp1234567890"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reason
 *               - cancelledBy
 *             properties:
 *               reason:
 *                 type: string
 *                 enum: [CLIENT_REQUEST, EMERGENCY, SCHEDULING_CONFLICT, WEATHER, ILLNESS, OTHER]
 *                 description: Reason for cancellation
 *                 example: "CLIENT_REQUEST"
 *               cancelledBy:
 *                 type: string
 *                 enum: [CLIENT, STAFF, SYSTEM]
 *                 description: Who initiated the cancellation
 *                 example: "CLIENT"
 *               notes:
 *                 type: string
 *                 description: Additional cancellation notes
 *                 example: "Client had to travel unexpectedly"
 *                 maxLength: 1000
 *               refundAmount:
 *                 type: number
 *                 format: float
 *                 description: Refund amount (if applicable)
 *                 minimum: 0
 *               rescheduleRequested:
 *                 type: boolean
 *                 default: false
 *                 description: Whether client wants to reschedule
 *               suggestedRescheduleDate:
 *                 type: string
 *                 format: date-time
 *                 description: Suggested new appointment time
 *               notifyClient:
 *                 type: boolean
 *                 default: true
 *                 description: Whether to notify the client
 *               applyPenalty:
 *                 type: boolean
 *                 default: false
 *                 description: Whether to apply cancellation penalty
 *     responses:
 *       200:
 *         description: Appointment cancelled successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 title:
 *                   type: string
 *                 status:
 *                   type: string
 *                   example: "CANCELLED"
 *                 reason:
 *                   type: string
 *                 cancelledBy:
 *                   type: string
 *                 cancelledAt:
 *                   type: string
 *                   format: date-time
 *                 refundProcessed:
 *                   type: object
 *                   properties:
 *                     amount:
 *                       type: number
 *                       format: float
 *                     transactionId:
 *                       type: string
 *                     processingTime:
 *                       type: string
 *                 rescheduleOptions:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       date:
 *                         type: string
 *                         format: date-time
 *                       available:
 *                         type: boolean
 *                   description: Available reschedule slots
 *                 penaltyApplied:
 *                   type: object
 *                   properties:
 *                     amount:
 *                       type: number
 *                       format: float
 *                     reason:
 *                       type: string
 *                 notificationsSent:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: List of notification types sent
 *       400:
 *         description: Invalid input data or appointment cannot be cancelled
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       404:
 *         description: Appointment not found
 *       409:
 *         description: Conflict - Appointment already cancelled or in invalid state
 *       500:
 *         description: Internal server error
 */
router.post(
  '/:id/cancel',
  authorize(UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT, UserRole.EMPLOYEE),
  validateCancelAppointment,
  appointmentController.cancelAppointment.bind(appointmentController)
);

/**
 * @swagger
 * /appointments/{id}/reschedule:
 *   post:
 *     tags: [Appointments]
 *     summary: Reschedule appointment
 *     description: Reschedules an existing appointment to a new date and time while preserving all appointment details and history.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Appointment ID
 *         schema:
 *           type: string
 *           example: "clp1234567890"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - newScheduledAt
 *               - reason
 *             properties:
 *               newScheduledAt:
 *                 type: string
 *                 format: date-time
 *                 description: New appointment date and time (ISO 8601)
 *                 example: "2024-01-25T14:00:00Z"
 *               newDuration:
 *                 type: integer
 *                 description: New appointment duration in minutes (optional)
 *                 example: 90
 *                 minimum: 15
 *                 maximum: 480
 *               reason:
 *                 type: string
 *                 enum: [CLIENT_REQUEST, STAFF_UNAVAILABLE, SCHEDULING_CONFLICT, EMERGENCY, OTHER]
 *                 description: Reason for rescheduling
 *                 example: "CLIENT_REQUEST"
 *               rescheduledBy:
 *                 type: string
 *                 enum: [CLIENT, STAFF, SYSTEM]
 *                 description: Who initiated the reschedule
 *                 example: "CLIENT"
 *               notes:
 *                 type: string
 *                 description: Additional rescheduling notes
 *                 example: "Client needs later time due to work schedule"
 *                 maxLength: 1000
 *               updateLocation:
 *                 type: object
 *                 description: Updated location information (optional)
 *                 properties:
 *                   type:
 *                     type: string
 *                     enum: [IN_PERSON, VIRTUAL, PHONE, CLIENT_SITE]
 *                   address:
 *                     type: string
 *                   meetingLink:
 *                     type: string
 *                     format: uri
 *                   phone:
 *                     type: string
 *               notifyParticipants:
 *                 type: boolean
 *                 default: true
 *                 description: Whether to notify all participants
 *               sendCalendarUpdate:
 *                 type: boolean
 *                 default: true
 *                 description: Whether to send calendar updates
 *               preserveReminders:
 *                 type: boolean
 *                 default: true
 *                 description: Whether to preserve existing reminder settings
 *     responses:
 *       200:
 *         description: Appointment rescheduled successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 title:
 *                   type: string
 *                 previousScheduledAt:
 *                   type: string
 *                   format: date-time
 *                   description: Original appointment time
 *                 newScheduledAt:
 *                   type: string
 *                   format: date-time
 *                   description: New appointment time
 *                 duration:
 *                   type: integer
 *                 status:
 *                   type: string
 *                   example: "SCHEDULED"
 *                 rescheduledBy:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     role:
 *                       type: string
 *                 rescheduledAt:
 *                   type: string
 *                   format: date-time
 *                 rescheduleHistory:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       previousDate:
 *                         type: string
 *                         format: date-time
 *                       newDate:
 *                         type: string
 *                         format: date-time
 *                       reason:
 *                         type: string
 *                       rescheduledAt:
 *                         type: string
 *                         format: date-time
 *                   description: History of reschedules for this appointment
 *                 notificationsSent:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: List of notification types sent
 *                 calendarUpdated:
 *                   type: boolean
 *                   description: Whether calendar invites were updated
 *                 conflictWarnings:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: Any scheduling conflicts or warnings
 *       400:
 *         description: Invalid input data or new time slot unavailable
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       404:
 *         description: Appointment not found
 *       409:
 *         description: Conflict - New time slot already booked or scheduling conflict
 *       500:
 *         description: Internal server error
 */
router.post(
  '/:id/reschedule',
  authorize(UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT, UserRole.EMPLOYEE),
  validateRescheduleAppointment,
  appointmentController.rescheduleAppointment.bind(appointmentController)
);

export default router;