import { Request, Response } from 'express';
import { subscriptionPlanService } from '../services/subscription-plan.service';
import { ErrorResponseUtil } from '../utils/error-response';
import { AuthenticatedRequest } from '../middleware/auth.middleware';

/**
 * @swagger
 * tags:
 *   name: Subscription Plans
 *   description: Subscription plan and organization subscription management
 */

export class SubscriptionPlanController {
  /**
   * @swagger
   * /admin/subscription-plans:
   *   get:
   *     summary: List all subscription plans
   *     tags: [Subscription Plans]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: status
   *         schema:
   *           type: string
   *           enum: [ACTIVE, INACTIVE]
   *         description: Filter by plan status
   *     responses:
   *       200:
   *         description: List of subscription plans
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
   *                       name:
   *                         type: string
   *                       description:
   *                         type: string
   *                       price:
   *                         type: number
   *                       interval:
   *                         type: string
   *                         enum: [MONTHLY, QUARTERLY, YEARLY]
   *                       currency:
   *                         type: string
   *                       features:
   *                         type: array
   *                         items:
   *                           type: string
   *                       maxUsers:
   *                         type: number
   *                       maxOrganizations:
   *                         type: number
   *                       status:
   *                         type: string
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden - requires SUPER_ADMIN role
   */
  async listPlans(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { status } = req.query;

      const filters: any = {};
      if (status) {
        filters.status = status as string;
      }

      const plans = await subscriptionPlanService.listPlans(filters);

      res.json({
        data: plans,
        pagination: {
          total: plans.length
        }
      });
    } catch (error: any) {
      ErrorResponseUtil.sendInternalServerError(res, error.message);
    }
  }

  /**
   * @swagger
   * /admin/subscription-plans/{id}:
   *   get:
   *     summary: Get subscription plan by ID
   *     tags: [Subscription Plans]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Subscription plan ID
   *     responses:
   *       200:
   *         description: Subscription plan details
   *       404:
   *         description: Plan not found
   */
  async getPlanById(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const plan = await subscriptionPlanService.getPlanById(id);

      res.json({ data: plan });
    } catch (error: any) {
      if (error.message === 'Subscription plan not found') {
        ErrorResponseUtil.sendNotFoundError(res, error.message);
      } else {
        ErrorResponseUtil.sendInternalServerError(res, error.message);
      }
    }
  }

  /**
   * @swagger
   * /admin/subscription-plans:
   *   post:
   *     summary: Create new subscription plan
   *     tags: [Subscription Plans]
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
   *               - description
   *               - price
   *               - interval
   *               - features
   *             properties:
   *               name:
   *                 type: string
   *                 example: Professional
   *               description:
   *                 type: string
   *                 example: Full-featured plan for growing businesses
   *               price:
   *                 type: number
   *                 example: 99.99
   *               interval:
   *                 type: string
   *                 enum: [MONTHLY, QUARTERLY, YEARLY]
   *                 example: MONTHLY
   *               currency:
   *                 type: string
   *                 example: CAD
   *               features:
   *                 type: array
   *                 items:
   *                   type: string
   *                 example: ["unlimited_users", "advanced_reporting", "api_access"]
   *               maxUsers:
   *                 type: number
   *                 nullable: true
   *                 example: 50
   *               maxOrganizations:
   *                 type: number
   *                 nullable: true
   *                 example: null
   *               status:
   *                 type: string
   *                 enum: [ACTIVE, INACTIVE]
   *                 example: ACTIVE
   *     responses:
   *       201:
   *         description: Subscription plan created
   *       400:
   *         description: Invalid input
   */
  async createPlan(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const input = req.body;

      if (!input.name || !input.description || !input.price || !input.interval || !input.features) {
        ErrorResponseUtil.sendBusinessLogicError(res, 'Missing required fields');
        return;
      }

      if (!Array.isArray(input.features)) {
        ErrorResponseUtil.sendBusinessLogicError(res, 'Features must be an array');
        return;
      }

      const context = {
        userId: req.user!.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      };

      const plan = await subscriptionPlanService.createPlan(input, context);

      res.status(201).json({ data: plan });
    } catch (error: any) {
      if (error.message.includes('Invalid billing interval')) {
        ErrorResponseUtil.sendBusinessLogicError(res, error.message);
      } else {
        ErrorResponseUtil.sendInternalServerError(res, error.message);
      }
    }
  }

  /**
   * @swagger
   * /admin/subscription-plans/{id}:
   *   put:
   *     summary: Update subscription plan
   *     tags: [Subscription Plans]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               name:
   *                 type: string
   *               description:
   *                 type: string
   *               price:
   *                 type: number
   *               interval:
   *                 type: string
   *                 enum: [MONTHLY, QUARTERLY, YEARLY]
   *               currency:
   *                 type: string
   *               features:
   *                 type: array
   *                 items:
   *                   type: string
   *               maxUsers:
   *                 type: number
   *                 nullable: true
   *               maxOrganizations:
   *                 type: number
   *                 nullable: true
   *               status:
   *                 type: string
   *                 enum: [ACTIVE, INACTIVE]
   *     responses:
   *       200:
   *         description: Plan updated
   *       404:
   *         description: Plan not found
   */
  async updatePlan(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const input = req.body;

      const context = {
        userId: req.user!.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      };

      const plan = await subscriptionPlanService.updatePlan(id, input, context);

      res.json({ data: plan });
    } catch (error: any) {
      if (error.message === 'Subscription plan not found') {
        ErrorResponseUtil.sendNotFoundError(res, error.message);
      } else if (error.message.includes('Invalid billing interval')) {
        ErrorResponseUtil.sendBusinessLogicError(res, error.message);
      } else {
        ErrorResponseUtil.sendInternalServerError(res, error.message);
      }
    }
  }

  /**
   * @swagger
   * /admin/subscription-plans/{id}:
   *   delete:
   *     summary: Delete (deactivate) subscription plan
   *     tags: [Subscription Plans]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       204:
   *         description: Plan deleted
   *       400:
   *         description: Cannot delete plan with active subscriptions
   *       404:
   *         description: Plan not found
   */
  async deletePlan(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const context = {
        userId: req.user!.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      };

      await subscriptionPlanService.deletePlan(id, context);

      res.status(204).send();
    } catch (error: any) {
      if (error.message === 'Subscription plan not found') {
        ErrorResponseUtil.sendNotFoundError(res, error.message);
      } else if (error.message.includes('active subscriptions')) {
        ErrorResponseUtil.sendBusinessLogicError(res, error.message);
      } else {
        ErrorResponseUtil.sendInternalServerError(res, error.message);
      }
    }
  }

  /**
   * @swagger
   * /admin/subscriptions/{orgId}:
   *   get:
   *     summary: Get organization subscription
   *     tags: [Subscription Plans]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: orgId
   *         required: true
   *         schema:
   *           type: string
   *         description: Organization ID
   *     responses:
   *       200:
   *         description: Organization subscription details
   *       404:
   *         description: No subscription found
   */
  async getOrganizationSubscription(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { orgId } = req.params;

      const subscription = await subscriptionPlanService.getOrganizationSubscription(orgId);

      if (!subscription) {
        ErrorResponseUtil.sendNotFoundError(res, 'No active subscription found for organization');
        return;
      }

      res.json({ data: subscription });
    } catch (error: any) {
      ErrorResponseUtil.sendInternalServerError(res, error.message);
    }
  }

  /**
   * @swagger
   * /admin/subscriptions/{orgId}/subscribe:
   *   post:
   *     summary: Subscribe organization to a plan
   *     tags: [Subscription Plans]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: orgId
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - planId
   *               - startDate
   *             properties:
   *               planId:
   *                 type: string
   *               startDate:
   *                 type: string
   *                 format: date-time
   *               endDate:
   *                 type: string
   *                 format: date-time
   *               nextBillingDate:
   *                 type: string
   *                 format: date-time
   *               autoRenew:
   *                 type: boolean
   *               paymentMethod:
   *                 type: string
   *     responses:
   *       201:
   *         description: Subscription created
   *       400:
   *         description: Organization already has active subscription
   */
  async subscribeOrganization(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { orgId } = req.params;
      const input = req.body;

      if (!input.planId || !input.startDate) {
        ErrorResponseUtil.sendBusinessLogicError(res, 'Missing required fields: planId and startDate');
        return;
      }

      const context = {
        userId: req.user!.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      };

      // Convert string dates to Date objects
      const subscriptionInput = {
        ...input,
        startDate: new Date(input.startDate),
        endDate: input.endDate ? new Date(input.endDate) : undefined,
        nextBillingDate: input.nextBillingDate ? new Date(input.nextBillingDate) : undefined
      };

      const subscription = await subscriptionPlanService.subscribeOrganization(
        orgId,
        subscriptionInput,
        context
      );

      res.status(201).json({ data: subscription });
    } catch (error: any) {
      if (error.message.includes('not found') || error.message.includes('inactive')) {
        ErrorResponseUtil.sendNotFoundError(res, error.message);
      } else if (error.message.includes('already has')) {
        ErrorResponseUtil.sendBusinessLogicError(res, error.message);
      } else {
        ErrorResponseUtil.sendInternalServerError(res, error.message);
      }
    }
  }

  /**
   * @swagger
   * /admin/subscriptions/{orgId}:
   *   put:
   *     summary: Update organization subscription
   *     tags: [Subscription Plans]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: orgId
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               status:
   *                 type: string
   *                 enum: [ACTIVE, CANCELLED, EXPIRED, SUSPENDED]
   *               endDate:
   *                 type: string
   *                 format: date-time
   *               nextBillingDate:
   *                 type: string
   *                 format: date-time
   *               autoRenew:
   *                 type: boolean
   *               paymentMethod:
   *                 type: string
   *               lastPaymentDate:
   *                 type: string
   *                 format: date-time
   *     responses:
   *       200:
   *         description: Subscription updated
   *       404:
   *         description: No active subscription found
   */
  async updateSubscription(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { orgId } = req.params;
      const input = req.body;

      const context = {
        userId: req.user!.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      };

      // Convert string dates to Date objects
      const updateInput: any = { ...input };
      if (input.endDate) {
        updateInput.endDate = new Date(input.endDate);
      }
      if (input.nextBillingDate) {
        updateInput.nextBillingDate = new Date(input.nextBillingDate);
      }
      if (input.lastPaymentDate) {
        updateInput.lastPaymentDate = new Date(input.lastPaymentDate);
      }

      const subscription = await subscriptionPlanService.updateSubscription(
        orgId,
        updateInput,
        context
      );

      res.json({ data: subscription });
    } catch (error: any) {
      if (error.message.includes('No active subscription')) {
        ErrorResponseUtil.sendNotFoundError(res, error.message);
      } else {
        ErrorResponseUtil.sendInternalServerError(res, error.message);
      }
    }
  }

  /**
   * @swagger
   * /admin/subscriptions/{orgId}/cancel:
   *   post:
   *     summary: Cancel organization subscription
   *     tags: [Subscription Plans]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: orgId
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - reason
   *             properties:
   *               reason:
   *                 type: string
   *                 example: Customer requested cancellation
   *     responses:
   *       204:
   *         description: Subscription cancelled
   *       404:
   *         description: No active subscription found
   */
  async cancelSubscription(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { orgId } = req.params;
      const { reason } = req.body;

      if (!reason) {
        ErrorResponseUtil.sendBusinessLogicError(res, 'Cancellation reason is required');
        return;
      }

      const context = {
        userId: req.user!.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      };

      await subscriptionPlanService.cancelSubscription(orgId, reason, context);

      res.status(204).send();
    } catch (error: any) {
      if (error.message.includes('No active subscription')) {
        ErrorResponseUtil.sendNotFoundError(res, error.message);
      } else {
        ErrorResponseUtil.sendInternalServerError(res, error.message);
      }
    }
  }
}

export const subscriptionPlanController = new SubscriptionPlanController();
