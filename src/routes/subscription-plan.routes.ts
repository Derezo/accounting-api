import { Router } from 'express';
import { subscriptionPlanController } from '../controllers/subscription-plan.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// All routes require authentication (applied in app.ts)

// Subscription Plan Routes
router.get('/plans', subscriptionPlanController.listPlans.bind(subscriptionPlanController));
router.get('/plans/:id', subscriptionPlanController.getPlanById.bind(subscriptionPlanController));
router.post('/plans', subscriptionPlanController.createPlan.bind(subscriptionPlanController));
router.put('/plans/:id', subscriptionPlanController.updatePlan.bind(subscriptionPlanController));
router.delete('/plans/:id', subscriptionPlanController.deletePlan.bind(subscriptionPlanController));

// Organization Subscription Routes
router.get('/:orgId', subscriptionPlanController.getOrganizationSubscription.bind(subscriptionPlanController));
router.post('/:orgId/subscribe', subscriptionPlanController.subscribeOrganization.bind(subscriptionPlanController));
router.put('/:orgId', subscriptionPlanController.updateSubscription.bind(subscriptionPlanController));
router.post('/:orgId/cancel', subscriptionPlanController.cancelSubscription.bind(subscriptionPlanController));

export default router;
