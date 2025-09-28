import { Response } from 'express';
import { validationResult, body, param, query } from 'express-validator';
import { projectService } from '../services/project.service';
import { ProjectStatus } from '../types/enums';
import { AuthenticatedRequest } from '../middleware/auth.middleware';

export const validateCreateProject = [
  body('customerId')
    .notEmpty()
    .withMessage('Customer ID is required')
    .isUUID()
    .withMessage('Customer ID must be a valid UUID'),
  body('name')
    .notEmpty()
    .withMessage('Project name is required')
    .isLength({ min: 1, max: 255 })
    .withMessage('Project name must be between 1 and 255 characters'),
  body('description')
    .optional()
    .isLength({ max: 2000 })
    .withMessage('Description cannot exceed 2000 characters'),
  body('priority')
    .optional()
    .isInt({ min: 1, max: 5 })
    .withMessage('Priority must be between 1 and 5'),
  body('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO 8601 date'),
  body('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid ISO 8601 date'),
  body('estimatedHours')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Estimated hours must be a positive number'),
  body('hourlyRate')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Hourly rate must be a positive number'),
  body('fixedPrice')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Fixed price must be a positive number'),
  body('assignedToId')
    .optional()
    .isUUID()
    .withMessage('Assigned user ID must be a valid UUID')
];

export const validateUpdateProject = [
  param('id')
    .isUUID()
    .withMessage('Project ID must be a valid UUID'),
  body('name')
    .optional()
    .isLength({ min: 1, max: 255 })
    .withMessage('Project name must be between 1 and 255 characters'),
  body('description')
    .optional()
    .isLength({ max: 2000 })
    .withMessage('Description cannot exceed 2000 characters'),
  body('status')
    .optional()
    .isIn(Object.values(ProjectStatus))
    .withMessage('Invalid project status'),
  body('priority')
    .optional()
    .isInt({ min: 1, max: 5 })
    .withMessage('Priority must be between 1 and 5'),
  body('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO 8601 date'),
  body('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid ISO 8601 date'),
  body('actualStartDate')
    .optional()
    .isISO8601()
    .withMessage('Actual start date must be a valid ISO 8601 date'),
  body('actualEndDate')
    .optional()
    .isISO8601()
    .withMessage('Actual end date must be a valid ISO 8601 date'),
  body('estimatedHours')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Estimated hours must be a positive number'),
  body('actualHours')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Actual hours must be a positive number'),
  body('hourlyRate')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Hourly rate must be a positive number'),
  body('fixedPrice')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Fixed price must be a positive number'),
  body('assignedToId')
    .optional()
    .isUUID()
    .withMessage('Assigned user ID must be a valid UUID')
];

export const validateWorkAuthorization = [
  body('projectId')
    .notEmpty()
    .withMessage('Project ID is required')
    .isUUID()
    .withMessage('Project ID must be a valid UUID'),
  body('authorizedBy')
    .notEmpty()
    .withMessage('Authorized by is required')
    .isLength({ min: 1, max: 255 })
    .withMessage('Authorized by must be between 1 and 255 characters'),
  body('scopeOfWork')
    .notEmpty()
    .withMessage('Scope of work is required')
    .isLength({ min: 1, max: 2000 })
    .withMessage('Scope of work must be between 1 and 2000 characters'),
  body('estimatedCost')
    .notEmpty()
    .withMessage('Estimated cost is required')
    .isFloat({ min: 0 })
    .withMessage('Estimated cost must be a positive number'),
  body('timeframe')
    .notEmpty()
    .withMessage('Timeframe is required')
    .isLength({ min: 1, max: 500 })
    .withMessage('Timeframe must be between 1 and 500 characters'),
  body('terms')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Terms cannot exceed 1000 characters'),
  body('notes')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Notes cannot exceed 1000 characters')
];

export const validateProjectId = [
  param('id')
    .isUUID()
    .withMessage('Project ID must be a valid UUID')
];

export const validateTimeTracking = [
  param('id')
    .isUUID()
    .withMessage('Project ID must be a valid UUID'),
  body('hoursWorked')
    .notEmpty()
    .withMessage('Hours worked is required')
    .isFloat({ min: 0.01 })
    .withMessage('Hours worked must be a positive number')
];

export const validateListProjects = [
  query('customerId')
    .optional()
    .isUUID()
    .withMessage('Customer ID must be a valid UUID'),
  query('assignedToId')
    .optional()
    .isUUID()
    .withMessage('Assigned user ID must be a valid UUID'),
  query('status')
    .optional()
    .isIn(Object.values(ProjectStatus))
    .withMessage('Invalid project status'),
  query('priority')
    .optional()
    .isInt({ min: 1, max: 5 })
    .withMessage('Priority must be between 1 and 5'),
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO 8601 date'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid ISO 8601 date'),
  query('search')
    .optional()
    .isLength({ min: 1, max: 255 })
    .withMessage('Search term must be between 1 and 255 characters'),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
];

export const validateProjectStats = [
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO 8601 date'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid ISO 8601 date')
];

export class ProjectController {
  async createProject(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
        return;
      }

      const project = await projectService.createProject(
        req.body,
        req.user!.organizationId,
        {
          userId: req.user!.id,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent')
        }
      );

      res.status(201).json({
        message: 'Project created successfully',
        project
      });
    } catch (error) {
      res.status(400).json({
        error: 'Failed to create project',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async getProject(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
        return;
      }

      const { id } = req.params;
      if (!id) {
        res.status(400).json({
          error: 'Project ID is required'
        });
        return;
      }

      const project = await projectService.getProject(id, req.user!.organizationId);

      if (!project) {
        res.status(404).json({
          error: 'Project not found'
        });
        return;
      }

      res.json({ project });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to retrieve project',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async updateProject(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
        return;
      }

      const { id } = req.params;
      const project = await projectService.updateProject(
        id!,
        req.body,
        req.user!.organizationId,
        {
          userId: req.user!.id,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent')
        }
      );

      res.json({
        message: 'Project updated successfully',
        project
      });
    } catch (error) {
      res.status(400).json({
        error: 'Failed to update project',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async authorizeWork(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
        return;
      }

      const project = await projectService.authorizeWork(
        req.body,
        req.user!.organizationId,
        {
          userId: req.user!.id,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent')
        }
      );

      res.json({
        message: 'Work authorization completed successfully',
        project
      });
    } catch (error) {
      res.status(400).json({
        error: 'Failed to authorize work',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async startProject(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
        return;
      }

      const { id } = req.params;
      const project = await projectService.startProject(
        id!,
        req.user!.organizationId,
        {
          userId: req.user!.id,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent')
        }
      );

      res.json({
        message: 'Project started successfully',
        project
      });
    } catch (error) {
      res.status(400).json({
        error: 'Failed to start project',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async completeProject(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
        return;
      }

      const { id } = req.params;
      const { actualHours } = req.body;

      const project = await projectService.completeProject(
        id!,
        actualHours,
        req.user!.organizationId,
        {
          userId: req.user!.id,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent')
        }
      );

      res.json({
        message: 'Project completed successfully',
        project
      });
    } catch (error) {
      res.status(400).json({
        error: 'Failed to complete project',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async updateTimeTracking(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
        return;
      }

      const { id } = req.params;
      const { hoursWorked } = req.body;

      const project = await projectService.updateTimeTracking(
        id!,
        hoursWorked,
        req.user!.organizationId,
        {
          userId: req.user!.id,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent')
        }
      );

      res.json({
        message: 'Time tracking updated successfully',
        project
      });
    } catch (error) {
      res.status(400).json({
        error: 'Failed to update time tracking',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async listProjects(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
        return;
      }

      const filter: any = {};
      const { customerId, assignedToId, status, priority, startDate, endDate, search } = req.query;

      if (customerId) filter.customerId = customerId as string;
      if (assignedToId) filter.assignedToId = assignedToId as string;
      if (status) filter.status = status as string;
      if (priority) filter.priority = parseInt(priority as string);
      if (startDate) filter.startDate = new Date(startDate as string);
      if (endDate) filter.endDate = new Date(endDate as string);
      if (search) filter.search = search as string;

      const page = parseInt((req.query.page as string) || '1');
      const limit = parseInt((req.query.limit as string) || '50');

      const result = await projectService.listProjects(
        req.user!.organizationId,
        filter,
        page,
        limit
      );

      res.json(result);
    } catch (error) {
      res.status(500).json({
        error: 'Failed to list projects',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async getProjectStats(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
        return;
      }

      const { startDate, endDate } = req.query;

      const stats = await projectService.getProjectStats(
        req.user!.organizationId,
        startDate ? new Date(startDate as string) : undefined,
        endDate ? new Date(endDate as string) : undefined
      );

      res.json({ stats });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to retrieve project statistics',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async assignProject(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
        return;
      }

      const { id } = req.params;
      const { assignedToId } = req.body;

      if (!assignedToId) {
        res.status(400).json({
          error: 'Assigned user ID is required'
        });
        return;
      }

      const project = await projectService.assignProject(
        id!,
        assignedToId,
        req.user!.organizationId,
        {
          userId: req.user!.id,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent')
        }
      );

      res.json({
        message: 'Project assigned successfully',
        project
      });
    } catch (error) {
      res.status(400).json({
        error: 'Failed to assign project',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async deleteProject(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
        return;
      }

      const { id } = req.params;

      await projectService.deleteProject(
        id!,
        req.user!.organizationId,
        {
          userId: req.user!.id,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent')
        }
      );

      res.json({
        message: 'Project deleted successfully'
      });
    } catch (error) {
      res.status(400).json({
        error: 'Failed to delete project',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}

export const projectController = new ProjectController();