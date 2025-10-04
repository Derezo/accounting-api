import express from 'express';
import { body, param, query } from 'express-validator';
import maintenanceWindowController from '@/controllers/maintenance-window.controller';

const router = express.Router();

/**
 * Validation middleware for creating maintenance window
 */
const createMaintenanceWindowValidation = [
  body('title')
    .isString()
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('Title must be between 1 and 255 characters'),
  body('description')
    .isString()
    .trim()
    .isLength({ min: 1 })
    .withMessage('Description is required'),
  body('scheduledStart')
    .isISO8601()
    .withMessage('Scheduled start must be a valid ISO 8601 date')
    .custom((value) => {
      const startDate = new Date(value);
      if (startDate < new Date()) {
        throw new Error('Scheduled start must be in the future');
      }
      return true;
    }),
  body('scheduledEnd')
    .isISO8601()
    .withMessage('Scheduled end must be a valid ISO 8601 date')
    .custom((value, { req }) => {
      const endDate = new Date(value);
      const startDate = new Date(req.body.scheduledStart);
      if (endDate <= startDate) {
        throw new Error('Scheduled end must be after scheduled start');
      }
      return true;
    }),
  body('impact')
    .isIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
    .withMessage('Impact must be one of: LOW, MEDIUM, HIGH, CRITICAL'),
  body('affectedServices')
    .isArray({ min: 1 })
    .withMessage('Affected services must be a non-empty array'),
  body('affectedServices.*')
    .isString()
    .trim()
    .isLength({ min: 1 })
    .withMessage('Each affected service must be a non-empty string'),
  body('notifyUsers')
    .isBoolean()
    .withMessage('Notify users must be a boolean'),
  body('tasks')
    .isArray({ min: 1 })
    .withMessage('Tasks must be a non-empty array'),
  body('tasks.*.description')
    .isString()
    .trim()
    .isLength({ min: 1 })
    .withMessage('Each task must have a description'),
  body('tasks.*.assignedTo')
    .optional()
    .isString()
    .withMessage('Assigned to must be a string'),
  body('notes')
    .optional()
    .isString()
    .trim(),
];

/**
 * Validation middleware for updating maintenance window
 */
const updateMaintenanceWindowValidation = [
  param('id')
    .isString()
    .trim()
    .isLength({ min: 1 })
    .withMessage('ID is required'),
  body('title')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('Title must be between 1 and 255 characters'),
  body('description')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 1 })
    .withMessage('Description must not be empty'),
  body('scheduledStart')
    .optional()
    .isISO8601()
    .withMessage('Scheduled start must be a valid ISO 8601 date'),
  body('scheduledEnd')
    .optional()
    .isISO8601()
    .withMessage('Scheduled end must be a valid ISO 8601 date'),
  body('impact')
    .optional()
    .isIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
    .withMessage('Impact must be one of: LOW, MEDIUM, HIGH, CRITICAL'),
  body('affectedServices')
    .optional()
    .isArray({ min: 1 })
    .withMessage('Affected services must be a non-empty array'),
  body('affectedServices.*')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 1 })
    .withMessage('Each affected service must be a non-empty string'),
  body('notifyUsers')
    .optional()
    .isBoolean()
    .withMessage('Notify users must be a boolean'),
  body('tasks')
    .optional()
    .isArray({ min: 1 })
    .withMessage('Tasks must be a non-empty array'),
  body('tasks.*.description')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 1 })
    .withMessage('Each task must have a description'),
  body('notes')
    .optional()
    .isString()
    .trim(),
];

/**
 * Validation middleware for window ID parameter
 */
const windowIdValidation = [
  param('id')
    .isString()
    .trim()
    .isLength({ min: 1 })
    .withMessage('ID is required'),
];

/**
 * Validation middleware for list query parameters
 */
const listQueryValidation = [
  query('status')
    .optional()
    .isIn(['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'])
    .withMessage('Status must be one of: PLANNED, IN_PROGRESS, COMPLETED, CANCELLED'),
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO 8601 date'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid ISO 8601 date'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be an integer between 1 and 100'),
  query('offset')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Offset must be a non-negative integer'),
];

// Routes

/**
 * GET /admin/maintenance-windows
 * List all maintenance windows
 */
router.get(
  '/',
  listQueryValidation,
  maintenanceWindowController.listMaintenanceWindows.bind(maintenanceWindowController)
);

/**
 * GET /admin/maintenance-windows/:id
 * Get maintenance window details
 */
router.get(
  '/:id',
  windowIdValidation,
  maintenanceWindowController.getMaintenanceWindow.bind(maintenanceWindowController)
);

/**
 * POST /admin/maintenance-windows
 * Schedule new maintenance window
 */
router.post(
  '/',
  createMaintenanceWindowValidation,
  maintenanceWindowController.createMaintenanceWindow.bind(maintenanceWindowController)
);

/**
 * PUT /admin/maintenance-windows/:id
 * Update maintenance window
 */
router.put(
  '/:id',
  updateMaintenanceWindowValidation,
  maintenanceWindowController.updateMaintenanceWindow.bind(maintenanceWindowController)
);

/**
 * POST /admin/maintenance-windows/:id/start
 * Start maintenance
 */
router.post(
  '/:id/start',
  windowIdValidation,
  maintenanceWindowController.startMaintenanceWindow.bind(maintenanceWindowController)
);

/**
 * POST /admin/maintenance-windows/:id/complete
 * Complete maintenance
 */
router.post(
  '/:id/complete',
  windowIdValidation,
  body('completionNotes').optional().isString().trim(),
  maintenanceWindowController.completeMaintenanceWindow.bind(maintenanceWindowController)
);

/**
 * POST /admin/maintenance-windows/:id/cancel
 * Cancel maintenance
 */
router.post(
  '/:id/cancel',
  windowIdValidation,
  body('reason').optional().isString().trim(),
  maintenanceWindowController.cancelMaintenanceWindow.bind(maintenanceWindowController)
);

export default router;
