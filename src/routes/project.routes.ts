import { Router } from 'express';
import { authorize } from '../middleware/auth.middleware';
import { UserRole } from '../types/enums';
import {
  projectController,
  validateCreateProject,
  validateUpdateProject,
  validateWorkAuthorization,
  validateProjectId,
  validateTimeTracking,
  validateListProjects,
  validateProjectStats
} from '../controllers/project.controller';

const router = Router();

/**
 * @swagger
 * /projects:
 *   post:
 *     tags: [Projects]
 *     summary: Create a new project
 *     description: Creates a new project with specified details, timeline, and budget. Projects serve as containers for tracking work, time, and resources.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - customerId
 *               - description
 *             properties:
 *               name:
 *                 type: string
 *                 description: Project name
 *                 example: "Website Redesign"
 *                 minLength: 2
 *                 maxLength: 100
 *               customerId:
 *                 type: string
 *                 description: Customer ID this project belongs to
 *                 example: "clp1234567890"
 *               description:
 *                 type: string
 *                 description: Detailed project description
 *                 example: "Complete overhaul of company website with modern design"
 *                 maxLength: 2000
 *               budget:
 *                 type: number
 *                 format: float
 *                 description: Project budget in organization currency
 *                 example: 15000.00
 *                 minimum: 0
 *               estimatedHours:
 *                 type: number
 *                 format: float
 *                 description: Estimated project duration in hours
 *                 example: 120.5
 *                 minimum: 0
 *               startDate:
 *                 type: string
 *                 format: date
 *                 description: Project start date (YYYY-MM-DD)
 *                 example: "2024-01-15"
 *               endDate:
 *                 type: string
 *                 format: date
 *                 description: Project end date (YYYY-MM-DD)
 *                 example: "2024-03-15"
 *               priority:
 *                 type: string
 *                 enum: [LOW, MEDIUM, HIGH, URGENT]
 *                 default: MEDIUM
 *                 description: Project priority level
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Project tags for categorization
 *                 example: ["web-development", "design", "responsive"]
 *               assignedTo:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of user IDs assigned to the project
 *     responses:
 *       201:
 *         description: Project created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   description: Project ID
 *                 name:
 *                   type: string
 *                 description:
 *                   type: string
 *                 status:
 *                   type: string
 *                   enum: [DRAFT, ACTIVE, ON_HOLD, COMPLETED, CANCELLED]
 *                   example: "DRAFT"
 *                 budget:
 *                   type: number
 *                   format: float
 *                 customerId:
 *                   type: string
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                 updatedAt:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Invalid input data
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       404:
 *         description: Customer not found
 *       500:
 *         description: Internal server error
 */
router.post(
  '/',
  authorize(UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT),
  validateCreateProject,
  projectController.createProject.bind(projectController)
);

/**
 * @swagger
 * /projects/{id}:
 *   get:
 *     tags: [Projects]
 *     summary: Get project details
 *     description: Retrieves detailed information about a specific project including time tracking, assigned users, and progress metrics.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Project ID
 *         schema:
 *           type: string
 *           example: "clp1234567890"
 *     responses:
 *       200:
 *         description: Project details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   description: Project ID
 *                 name:
 *                   type: string
 *                   example: "Website Redesign"
 *                 description:
 *                   type: string
 *                   example: "Complete overhaul of company website"
 *                 status:
 *                   type: string
 *                   enum: [DRAFT, ACTIVE, ON_HOLD, COMPLETED, CANCELLED]
 *                   example: "ACTIVE"
 *                 priority:
 *                   type: string
 *                   enum: [LOW, MEDIUM, HIGH, URGENT]
 *                   example: "HIGH"
 *                 budget:
 *                   type: number
 *                   format: float
 *                   example: 15000.00
 *                 estimatedHours:
 *                   type: number
 *                   format: float
 *                   example: 120.5
 *                 actualHours:
 *                   type: number
 *                   format: float
 *                   example: 95.25
 *                 startDate:
 *                   type: string
 *                   format: date
 *                   example: "2024-01-15"
 *                 endDate:
 *                   type: string
 *                   format: date
 *                   example: "2024-03-15"
 *                 customer:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                       example: "Acme Corporation"
 *                     email:
 *                       type: string
 *                       example: "contact@acme.com"
 *                 assignedUsers:
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
 *                       hoursLogged:
 *                         type: number
 *                         format: float
 *                 timeTracking:
 *                   type: object
 *                   properties:
 *                     totalHours:
 *                       type: number
 *                       format: float
 *                     billableHours:
 *                       type: number
 *                       format: float
 *                     lastEntry:
 *                       type: string
 *                       format: date-time
 *                 progress:
 *                   type: number
 *                   format: float
 *                   description: Project completion percentage
 *                   example: 75.5
 *                 tags:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["web-development", "design"]
 *                 attachments:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       filename:
 *                         type: string
 *                       url:
 *                         type: string
 *                       uploadedAt:
 *                         type: string
 *                         format: date-time
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                 updatedAt:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       404:
 *         description: Project not found
 *       500:
 *         description: Internal server error
 */
router.get(
  '/:id',
  authorize(UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT, UserRole.EMPLOYEE, UserRole.VIEWER),
  validateProjectId,
  projectController.getProject.bind(projectController)
);

/**
 * @swagger
 * /projects/{id}:
 *   put:
 *     tags: [Projects]
 *     summary: Update project
 *     description: Updates project information including details, timeline, budget, and assignments. Employees can update projects they are assigned to.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Project ID
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
 *               name:
 *                 type: string
 *                 description: Project name
 *                 example: "Website Redesign - Updated"
 *                 minLength: 2
 *                 maxLength: 100
 *               description:
 *                 type: string
 *                 description: Project description
 *                 example: "Updated project requirements and scope"
 *                 maxLength: 2000
 *               budget:
 *                 type: number
 *                 format: float
 *                 description: Project budget
 *                 example: 18000.00
 *                 minimum: 0
 *               estimatedHours:
 *                 type: number
 *                 format: float
 *                 description: Estimated hours
 *                 example: 140.0
 *                 minimum: 0
 *               startDate:
 *                 type: string
 *                 format: date
 *                 description: Project start date
 *                 example: "2024-01-20"
 *               endDate:
 *                 type: string
 *                 format: date
 *                 description: Project end date
 *                 example: "2024-04-15"
 *               priority:
 *                 type: string
 *                 enum: [LOW, MEDIUM, HIGH, URGENT]
 *                 description: Project priority
 *               status:
 *                 type: string
 *                 enum: [DRAFT, ACTIVE, ON_HOLD, COMPLETED, CANCELLED]
 *                 description: Project status (Admin/Manager only)
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Project tags
 *               assignedTo:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of user IDs to assign (Admin/Manager only)
 *     responses:
 *       200:
 *         description: Project updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 name:
 *                   type: string
 *                 description:
 *                   type: string
 *                 status:
 *                   type: string
 *                   enum: [DRAFT, ACTIVE, ON_HOLD, COMPLETED, CANCELLED]
 *                 priority:
 *                   type: string
 *                   enum: [LOW, MEDIUM, HIGH, URGENT]
 *                 budget:
 *                   type: number
 *                   format: float
 *                 estimatedHours:
 *                   type: number
 *                   format: float
 *                 updatedAt:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Invalid input data
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       404:
 *         description: Project not found
 *       500:
 *         description: Internal server error
 */
router.put(
  '/:id',
  authorize(UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT, UserRole.EMPLOYEE),
  validateUpdateProject,
  projectController.updateProject.bind(projectController)
);

/**
 * @swagger
 * /projects/authorize:
 *   post:
 *     tags: [Projects]
 *     summary: Authorize work on projects
 *     description: Authorizes work to begin on one or multiple projects. This creates an audit trail for work authorization and can trigger billing processes.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - projectIds
 *               - authorizationType
 *             properties:
 *               projectIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of project IDs to authorize
 *                 example: ["clp1234567890", "clp0987654321"]
 *                 minItems: 1
 *               authorizationType:
 *                 type: string
 *                 enum: [START_WORK, ADDITIONAL_HOURS, SCOPE_CHANGE, BUDGET_INCREASE]
 *                 description: Type of work authorization
 *                 example: "START_WORK"
 *               authorizedAmount:
 *                 type: number
 *                 format: float
 *                 description: Additional budget authorized (if applicable)
 *                 example: 5000.00
 *                 minimum: 0
 *               authorizedHours:
 *                 type: number
 *                 format: float
 *                 description: Additional hours authorized (if applicable)
 *                 example: 40.0
 *                 minimum: 0
 *               notes:
 *                 type: string
 *                 description: Authorization notes or comments
 *                 example: "Approved additional scope for mobile responsiveness"
 *                 maxLength: 1000
 *               expiresAt:
 *                 type: string
 *                 format: date-time
 *                 description: When this authorization expires
 *     responses:
 *       200:
 *         description: Work authorization completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 authorizationId:
 *                   type: string
 *                   description: Unique authorization ID
 *                 authorizedProjects:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       projectId:
 *                         type: string
 *                       projectName:
 *                         type: string
 *                       previousStatus:
 *                         type: string
 *                       newStatus:
 *                         type: string
 *                       authorizedAmount:
 *                         type: number
 *                         format: float
 *                       authorizedHours:
 *                         type: number
 *                         format: float
 *                 totalAuthorizedAmount:
 *                   type: number
 *                   format: float
 *                   description: Total amount authorized across all projects
 *                 totalAuthorizedHours:
 *                   type: number
 *                   format: float
 *                   description: Total hours authorized across all projects
 *                 authorizedBy:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     role:
 *                       type: string
 *                 authorizedAt:
 *                   type: string
 *                   format: date-time
 *                 expiresAt:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Invalid input data or project IDs
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       403:
 *         description: Forbidden - Requires Admin or Manager role
 *       404:
 *         description: One or more projects not found
 *       500:
 *         description: Internal server error
 */
router.post(
  '/authorize',
  authorize(UserRole.ADMIN, UserRole.MANAGER),
  validateWorkAuthorization,
  projectController.authorizeWork.bind(projectController)
);

/**
 * @swagger
 * /projects/{id}/start:
 *   patch:
 *     tags: [Projects]
 *     summary: Start project
 *     description: Changes project status to ACTIVE and begins time tracking. This action triggers notifications to assigned team members and initializes project timelines.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Project ID
 *         schema:
 *           type: string
 *           example: "clp1234567890"
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notes:
 *                 type: string
 *                 description: Optional notes about starting the project
 *                 example: "Project kickoff meeting completed"
 *                 maxLength: 500
 *               actualStartDate:
 *                 type: string
 *                 format: date
 *                 description: Actual start date (defaults to current date)
 *                 example: "2024-01-20"
 *     responses:
 *       200:
 *         description: Project started successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   description: Project ID
 *                 name:
 *                   type: string
 *                   example: "Website Redesign"
 *                 status:
 *                   type: string
 *                   example: "ACTIVE"
 *                 actualStartDate:
 *                   type: string
 *                   format: date
 *                 startedBy:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     role:
 *                       type: string
 *                 startedAt:
 *                   type: string
 *                   format: date-time
 *                 notifiedUsers:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: User IDs that were notified
 *       400:
 *         description: Invalid request - Project already started or invalid status
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       404:
 *         description: Project not found
 *       500:
 *         description: Internal server error
 */
router.patch(
  '/:id/start',
  authorize(UserRole.ADMIN, UserRole.MANAGER, UserRole.EMPLOYEE),
  validateProjectId,
  projectController.startProject.bind(projectController)
);

/**
 * @swagger
 * /projects/{id}/complete:
 *   patch:
 *     tags: [Projects]
 *     summary: Complete project
 *     description: Marks project as COMPLETED, finalizes time tracking, and triggers completion workflows including final billing and client notifications.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Project ID
 *         schema:
 *           type: string
 *           example: "clp1234567890"
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               completionNotes:
 *                 type: string
 *                 description: Notes about project completion
 *                 example: "All deliverables completed and client approved"
 *                 maxLength: 1000
 *               actualEndDate:
 *                 type: string
 *                 format: date
 *                 description: Actual completion date (defaults to current date)
 *                 example: "2024-03-10"
 *               finalDeliverables:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                     url:
 *                       type: string
 *                     description:
 *                       type: string
 *                 description: List of final project deliverables
 *               generateInvoice:
 *                 type: boolean
 *                 default: false
 *                 description: Whether to automatically generate final invoice
 *     responses:
 *       200:
 *         description: Project completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 name:
 *                   type: string
 *                 status:
 *                   type: string
 *                   example: "COMPLETED"
 *                 actualEndDate:
 *                   type: string
 *                   format: date
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
 *                 finalMetrics:
 *                   type: object
 *                   properties:
 *                     totalHours:
 *                       type: number
 *                       format: float
 *                     totalCost:
 *                       type: number
 *                       format: float
 *                     budgetVariance:
 *                       type: number
 *                       format: float
 *                       description: Difference between budget and actual cost
 *                     timeVariance:
 *                       type: number
 *                       format: float
 *                       description: Difference between estimated and actual hours
 *                 generatedInvoiceId:
 *                   type: string
 *                   description: ID of automatically generated invoice (if requested)
 *       400:
 *         description: Invalid request - Project already completed or invalid status
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       404:
 *         description: Project not found
 *       500:
 *         description: Internal server error
 */
router.patch(
  '/:id/complete',
  authorize(UserRole.ADMIN, UserRole.MANAGER, UserRole.EMPLOYEE),
  validateProjectId,
  projectController.completeProject.bind(projectController)
);

/**
 * @swagger
 * /projects/{id}/time:
 *   patch:
 *     tags: [Projects]
 *     summary: Update time tracking
 *     description: Logs time entries for project work including billable hours, tasks performed, and time period. Essential for accurate project costing and billing.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Project ID
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
 *               - hours
 *               - date
 *               - description
 *             properties:
 *               hours:
 *                 type: number
 *                 format: float
 *                 description: Number of hours worked
 *                 example: 8.5
 *                 minimum: 0.1
 *                 maximum: 24
 *               date:
 *                 type: string
 *                 format: date
 *                 description: Date work was performed (YYYY-MM-DD)
 *                 example: "2024-01-20"
 *               description:
 *                 type: string
 *                 description: Description of work performed
 *                 example: "Implemented responsive navigation menu"
 *                 minLength: 5
 *                 maxLength: 500
 *               billable:
 *                 type: boolean
 *                 default: true
 *                 description: Whether these hours are billable
 *               hourlyRate:
 *                 type: number
 *                 format: float
 *                 description: Hourly rate for this time entry (overrides default)
 *                 example: 85.00
 *                 minimum: 0
 *               category:
 *                 type: string
 *                 enum: [DEVELOPMENT, DESIGN, TESTING, MEETING, RESEARCH, DOCUMENTATION, OTHER]
 *                 default: DEVELOPMENT
 *                 description: Category of work performed
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Tags for categorizing the work
 *                 example: ["frontend", "javascript", "responsive"]
 *               startTime:
 *                 type: string
 *                 format: time
 *                 description: Start time of work (HH:MM)
 *                 example: "09:00"
 *               endTime:
 *                 type: string
 *                 format: time
 *                 description: End time of work (HH:MM)
 *                 example: "17:30"
 *     responses:
 *       200:
 *         description: Time tracking updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 timeEntryId:
 *                   type: string
 *                   description: ID of the created time entry
 *                 projectId:
 *                   type: string
 *                 userId:
 *                   type: string
 *                 hours:
 *                   type: number
 *                   format: float
 *                 date:
 *                   type: string
 *                   format: date
 *                 description:
 *                   type: string
 *                 billable:
 *                   type: boolean
 *                 amount:
 *                   type: number
 *                   format: float
 *                   description: Calculated billable amount
 *                 projectTotals:
 *                   type: object
 *                   properties:
 *                     totalHours:
 *                       type: number
 *                       format: float
 *                     billableHours:
 *                       type: number
 *                       format: float
 *                     totalAmount:
 *                       type: number
 *                       format: float
 *                     remainingBudget:
 *                       type: number
 *                       format: float
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Invalid input data or time entry validation failed
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       404:
 *         description: Project not found
 *       409:
 *         description: Conflict - Overlapping time entries or project not active
 *       500:
 *         description: Internal server error
 */
router.patch(
  '/:id/time',
  authorize(UserRole.ADMIN, UserRole.MANAGER, UserRole.EMPLOYEE),
  validateTimeTracking,
  projectController.updateTimeTracking.bind(projectController)
);

/**
 * @swagger
 * /projects/stats/summary:
 *   get:
 *     tags: [Projects]
 *     summary: Get project statistics summary
 *     description: Retrieves comprehensive statistics and analytics for all projects in the organization including status distribution, budget utilization, and time tracking metrics.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [week, month, quarter, year, all]
 *           default: month
 *         description: Time period for statistics calculation
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [DRAFT, ACTIVE, ON_HOLD, COMPLETED, CANCELLED]
 *         description: Filter statistics by project status
 *       - in: query
 *         name: customerId
 *         schema:
 *           type: string
 *         description: Filter statistics by specific customer
 *     responses:
 *       200:
 *         description: Project statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 summary:
 *                   type: object
 *                   properties:
 *                     totalProjects:
 *                       type: integer
 *                       description: Total number of projects
 *                     activeProjects:
 *                       type: integer
 *                       description: Currently active projects
 *                     completedProjects:
 *                       type: integer
 *                       description: Completed projects in period
 *                     totalBudget:
 *                       type: number
 *                       format: float
 *                       description: Combined budget of all projects
 *                     totalSpent:
 *                       type: number
 *                       format: float
 *                       description: Total amount spent across projects
 *                 statusDistribution:
 *                   type: object
 *                   properties:
 *                     DRAFT:
 *                       type: integer
 *                     ACTIVE:
 *                       type: integer
 *                     ON_HOLD:
 *                       type: integer
 *                     COMPLETED:
 *                       type: integer
 *                     CANCELLED:
 *                       type: integer
 *                 timeTracking:
 *                   type: object
 *                   properties:
 *                     totalHoursLogged:
 *                       type: number
 *                       format: float
 *                     estimatedHours:
 *                       type: number
 *                       format: float
 *                     efficiency:
 *                       type: number
 *                       format: float
 *                       description: Efficiency percentage (actual vs estimated)
 *                 topProjects:
 *                   type: array
 *                   description: Top projects by budget or activity
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       budget:
 *                         type: number
 *                         format: float
 *                       hoursLogged:
 *                         type: number
 *                         format: float
 *                       status:
 *                         type: string
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       500:
 *         description: Internal server error
 */
router.get(
  '/stats/summary',
  authorize(UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT),
  validateProjectStats,
  projectController.getProjectStats.bind(projectController)
);

/**
 * @swagger
 * /projects:
 *   get:
 *     tags: [Projects]
 *     summary: List projects
 *     description: Retrieves a paginated list of projects with filtering and search capabilities. Users can only see projects within their organization.
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
 *         description: Number of projects per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search term for project name or description
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [DRAFT, ACTIVE, ON_HOLD, COMPLETED, CANCELLED]
 *         description: Filter by project status
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
 *         name: priority
 *         schema:
 *           type: string
 *           enum: [LOW, MEDIUM, HIGH, URGENT]
 *         description: Filter by project priority
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [name, createdAt, updatedAt, startDate, endDate, budget, priority]
 *           default: createdAt
 *         description: Field to sort by
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort order
 *     responses:
 *       200:
 *         description: Projects retrieved successfully
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
 *                         description: Project ID
 *                       name:
 *                         type: string
 *                         example: "Website Redesign"
 *                       description:
 *                         type: string
 *                       status:
 *                         type: string
 *                         enum: [DRAFT, ACTIVE, ON_HOLD, COMPLETED, CANCELLED]
 *                       priority:
 *                         type: string
 *                         enum: [LOW, MEDIUM, HIGH, URGENT]
 *                       budget:
 *                         type: number
 *                         format: float
 *                       estimatedHours:
 *                         type: number
 *                         format: float
 *                       actualHours:
 *                         type: number
 *                         format: float
 *                       startDate:
 *                         type: string
 *                         format: date
 *                       endDate:
 *                         type: string
 *                         format: date
 *                       customer:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           name:
 *                             type: string
 *                       assignedUsers:
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
 *                       progress:
 *                         type: number
 *                         format: float
 *                         description: Project completion percentage
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
  authorize(UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT, UserRole.EMPLOYEE, UserRole.VIEWER),
  validateListProjects,
  projectController.listProjects.bind(projectController)
);

/**
 * @swagger
 * /projects/{id}/assign:
 *   patch:
 *     tags: [Projects]
 *     summary: Assign project to users
 *     description: Assigns or reassigns project to specific users with defined roles and responsibilities. Triggers notifications to assigned users.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Project ID
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
 *               - assignments
 *             properties:
 *               assignments:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - userId
 *                     - role
 *                   properties:
 *                     userId:
 *                       type: string
 *                       description: ID of user to assign
 *                       example: "clp1234567890"
 *                     role:
 *                       type: string
 *                       enum: [PROJECT_MANAGER, LEAD_DEVELOPER, DEVELOPER, DESIGNER, TESTER, CONSULTANT]
 *                       description: Role for this assignment
 *                       example: "LEAD_DEVELOPER"
 *                     hourlyRate:
 *                       type: number
 *                       format: float
 *                       description: Hourly rate for this user on this project
 *                       example: 85.00
 *                       minimum: 0
 *                     maxHours:
 *                       type: number
 *                       format: float
 *                       description: Maximum hours allocated for this user
 *                       example: 40.0
 *                       minimum: 0
 *                     responsibilities:
 *                       type: array
 *                       items:
 *                         type: string
 *                       description: List of responsibilities
 *                       example: ["Frontend development", "Code review"]
 *                     startDate:
 *                       type: string
 *                       format: date
 *                       description: When this assignment starts
 *                       example: "2024-01-20"
 *                     endDate:
 *                       type: string
 *                       format: date
 *                       description: When this assignment ends
 *                       example: "2024-03-15"
 *                 minItems: 1
 *                 description: Array of user assignments
 *               replaceExisting:
 *                 type: boolean
 *                 default: false
 *                 description: Whether to replace all existing assignments
 *               notifyUsers:
 *                 type: boolean
 *                 default: true
 *                 description: Whether to send notifications to assigned users
 *               assignmentNotes:
 *                 type: string
 *                 description: Notes about the assignment
 *                 example: "Please start with requirements analysis"
 *                 maxLength: 500
 *     responses:
 *       200:
 *         description: Project assignment updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 projectId:
 *                   type: string
 *                 assignments:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       userId:
 *                         type: string
 *                       userName:
 *                         type: string
 *                       userEmail:
 *                         type: string
 *                       role:
 *                         type: string
 *                       hourlyRate:
 *                         type: number
 *                         format: float
 *                       maxHours:
 *                         type: number
 *                         format: float
 *                       responsibilities:
 *                         type: array
 *                         items:
 *                           type: string
 *                       assignedAt:
 *                         type: string
 *                         format: date-time
 *                       notified:
 *                         type: boolean
 *                 previousAssignments:
 *                   type: array
 *                   items:
 *                     type: object
 *                   description: Previous assignments that were removed
 *                 totalAssignedUsers:
 *                   type: integer
 *                   description: Total number of users assigned to project
 *                 estimatedTotalCost:
 *                   type: number
 *                   format: float
 *                   description: Estimated total cost based on assignments
 *       400:
 *         description: Invalid input data or user assignments
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       403:
 *         description: Forbidden - Requires Admin or Manager role
 *       404:
 *         description: Project or one or more users not found
 *       409:
 *         description: Conflict - User assignment conflicts or capacity issues
 *       500:
 *         description: Internal server error
 */
router.patch(
  '/:id/assign',
  authorize(UserRole.ADMIN, UserRole.MANAGER),
  validateProjectId,
  projectController.assignProject.bind(projectController)
);

/**
 * @swagger
 * /projects/{id}:
 *   delete:
 *     tags: [Projects]
 *     summary: Delete project
 *     description: Soft deletes a project and all associated data including time entries, assignments, and files. This action is irreversible and requires proper authorization.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Project ID
 *         schema:
 *           type: string
 *           example: "clp1234567890"
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 description: Reason for project deletion
 *                 example: "Project cancelled by client"
 *                 minLength: 10
 *                 maxLength: 500
 *               archiveData:
 *                 type: boolean
 *                 default: true
 *                 description: Whether to archive project data for compliance
 *               notifyTeam:
 *                 type: boolean
 *                 default: true
 *                 description: Whether to notify assigned team members
 *     responses:
 *       200:
 *         description: Project deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Project deleted successfully"
 *                 projectId:
 *                   type: string
 *                 projectName:
 *                   type: string
 *                 deletedAt:
 *                   type: string
 *                   format: date-time
 *                 deletedBy:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     role:
 *                       type: string
 *                 archivedData:
 *                   type: object
 *                   properties:
 *                     timeEntries:
 *                       type: integer
 *                       description: Number of time entries archived
 *                     attachments:
 *                       type: integer
 *                       description: Number of attachments archived
 *                     totalHours:
 *                       type: number
 *                       format: float
 *                       description: Total hours logged on project
 *                     totalCost:
 *                       type: number
 *                       format: float
 *                       description: Total project cost
 *                     archiveLocation:
 *                       type: string
 *                       description: Location of archived data
 *                 notifiedUsers:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: User IDs that were notified
 *       400:
 *         description: Invalid request - Cannot delete active project with time entries
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       403:
 *         description: Forbidden - Requires Admin or Manager role
 *       404:
 *         description: Project not found
 *       409:
 *         description: Conflict - Project has dependencies that prevent deletion
 *       500:
 *         description: Internal server error
 */
router.delete(
  '/:id',
  authorize(UserRole.ADMIN, UserRole.MANAGER),
  validateProjectId,
  projectController.deleteProject.bind(projectController)
);

export default router;