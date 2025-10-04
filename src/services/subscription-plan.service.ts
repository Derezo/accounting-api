import { prisma } from '../config/database';
import { auditService } from './audit.service';
import { systemLogsService } from './system-logs.service';

export interface SubscriptionPlanInput {
  name: string;
  description: string;
  price: number;
  interval: 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
  currency?: string;
  features: string[];
  maxUsers?: number | null;
  maxOrganizations?: number | null;
  status?: 'ACTIVE' | 'INACTIVE';
}

export interface SubscriptionInput {
  planId: string;
  startDate: Date;
  endDate?: Date;
  nextBillingDate?: Date;
  autoRenew?: boolean;
  paymentMethod?: string;
}

export interface AuditContext {
  userId: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Subscription Plan Service
 *
 * Manages subscription plans and organization subscriptions.
 * Supports creating plans with features, limits, and pricing.
 * Handles subscription lifecycle: creation, updates, and cancellation.
 *
 * Features:
 * - Subscription plan CRUD operations
 * - Organization subscription management
 * - Status transitions: ACTIVE, CANCELLED, EXPIRED, SUSPENDED
 * - Billing intervals: MONTHLY, QUARTERLY, YEARLY
 * - Audit logging for all operations
 */
export class SubscriptionPlanService {
  /**
   * Get all subscription plans with optional filtering
   */
  async listPlans(filters?: {
    status?: 'ACTIVE' | 'INACTIVE';
  }): Promise<any[]> {
    const where: any = {};

    if (filters?.status) {
      where.status = filters.status;
    }

    const plans = await prisma.subscriptionPlan.findMany({
      where,
      orderBy: { createdAt: 'desc' }
    });

    return plans.map(plan => ({
      id: plan.id,
      name: plan.name,
      description: plan.description,
      price: plan.price,
      interval: plan.interval,
      currency: plan.currency,
      features: JSON.parse(plan.features),
      maxUsers: plan.maxUsers,
      maxOrganizations: plan.maxOrganizations,
      status: plan.status,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt
    }));
  }

  /**
   * Get a single subscription plan by ID
   */
  async getPlanById(id: string): Promise<any> {
    const plan = await prisma.subscriptionPlan.findUnique({
      where: { id },
      include: {
        subscriptions: {
          include: {
            organization: {
              select: {
                id: true,
                name: true,
                domain: true
              }
            }
          }
        }
      }
    });

    if (!plan) {
      throw new Error('Subscription plan not found');
    }

    return {
      id: plan.id,
      name: plan.name,
      description: plan.description,
      price: plan.price,
      interval: plan.interval,
      currency: plan.currency,
      features: JSON.parse(plan.features),
      maxUsers: plan.maxUsers,
      maxOrganizations: plan.maxOrganizations,
      status: plan.status,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
      subscriptions: plan.subscriptions
    };
  }

  /**
   * Create a new subscription plan
   */
  async createPlan(
    input: SubscriptionPlanInput,
    context: AuditContext
  ): Promise<any> {
    // Validate interval
    if (!['MONTHLY', 'QUARTERLY', 'YEARLY'].includes(input.interval)) {
      throw new Error('Invalid billing interval. Must be MONTHLY, QUARTERLY, or YEARLY');
    }

    const plan = await prisma.subscriptionPlan.create({
      data: {
        name: input.name,
        description: input.description,
        price: input.price,
        interval: input.interval,
        currency: input.currency || 'CAD',
        features: JSON.stringify(input.features),
        maxUsers: input.maxUsers,
        maxOrganizations: input.maxOrganizations,
        status: input.status || 'ACTIVE'
      }
    });

    // Audit log
    await auditService.logAction({
      action: 'CREATE',
      entityType: 'SubscriptionPlan',
      entityId: plan.id,
      context: {
        organizationId: 'system',
        userId: context.userId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent
      }
    });

    // System log
    await systemLogsService.storeLog({
      level: 'INFO',
      message: `Created subscription plan: ${plan.name}`,
      source: 'subscription-plan',
      userId: context.userId
    });

    return {
      id: plan.id,
      name: plan.name,
      description: plan.description,
      price: plan.price,
      interval: plan.interval,
      currency: plan.currency,
      features: JSON.parse(plan.features),
      maxUsers: plan.maxUsers,
      maxOrganizations: plan.maxOrganizations,
      status: plan.status,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt
    };
  }

  /**
   * Update a subscription plan
   */
  async updatePlan(
    id: string,
    input: Partial<SubscriptionPlanInput>,
    context: AuditContext
  ): Promise<any> {
    const existing = await prisma.subscriptionPlan.findUnique({
      where: { id }
    });

    if (!existing) {
      throw new Error('Subscription plan not found');
    }

    const updateData: any = {};

    if (input.name !== undefined) {
      updateData.name = input.name;
    }
    if (input.description !== undefined) {
      updateData.description = input.description;
    }
    if (input.price !== undefined) {
      updateData.price = input.price;
    }
    if (input.interval !== undefined) {
      if (!['MONTHLY', 'QUARTERLY', 'YEARLY'].includes(input.interval)) {
        throw new Error('Invalid billing interval');
      }
      updateData.interval = input.interval;
    }
    if (input.currency !== undefined) {
      updateData.currency = input.currency;
    }
    if (input.features !== undefined) {
      updateData.features = JSON.stringify(input.features);
    }
    if (input.maxUsers !== undefined) {
      updateData.maxUsers = input.maxUsers;
    }
    if (input.maxOrganizations !== undefined) {
      updateData.maxOrganizations = input.maxOrganizations;
    }
    if (input.status !== undefined) {
      updateData.status = input.status;
    }

    updateData.updatedAt = new Date();

    const plan = await prisma.subscriptionPlan.update({
      where: { id },
      data: updateData
    });

    // Audit log
    await auditService.logAction({
      action: 'UPDATE',
      entityType: 'SubscriptionPlan',
      entityId: plan.id,
      context: {
        organizationId: 'system',
        userId: context.userId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent
      }
    });

    // System log
    await systemLogsService.storeLog({
      level: 'INFO',
      message: `Updated subscription plan: ${plan.name}`,
      source: 'subscription-plan',
      userId: context.userId
    });

    return {
      id: plan.id,
      name: plan.name,
      description: plan.description,
      price: plan.price,
      interval: plan.interval,
      currency: plan.currency,
      features: JSON.parse(plan.features),
      maxUsers: plan.maxUsers,
      maxOrganizations: plan.maxOrganizations,
      status: plan.status,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt
    };
  }

  /**
   * Delete a subscription plan (soft delete - just mark as inactive)
   */
  async deletePlan(id: string, context: AuditContext): Promise<void> {
    const existing = await prisma.subscriptionPlan.findUnique({
      where: { id },
      include: {
        subscriptions: {
          where: { status: 'ACTIVE' }
        }
      }
    });

    if (!existing) {
      throw new Error('Subscription plan not found');
    }

    // Check if plan has active subscriptions
    if (existing.subscriptions.length > 0) {
      throw new Error('Cannot delete plan with active subscriptions');
    }

    // Mark as inactive instead of deleting
    await prisma.subscriptionPlan.update({
      where: { id },
      data: { status: 'INACTIVE' }
    });

    // Audit log
    await auditService.logAction({
      action: 'DELETE',
      entityType: 'SubscriptionPlan',
      entityId: id,
      context: {
        organizationId: 'system',
        userId: context.userId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent
      }
    });

    // System log
    await systemLogsService.storeLog({
      level: 'INFO',
      message: `Deleted (deactivated) subscription plan: ${existing.name}`,
      source: 'subscription-plan',
      userId: context.userId
    });
  }

  /**
   * Get organization's current subscription
   */
  async getOrganizationSubscription(orgId: string): Promise<any> {
    const subscription = await prisma.organizationSubscription.findFirst({
      where: {
        organizationId: orgId,
        status: { in: ['ACTIVE', 'SUSPENDED'] }
      },
      include: {
        plan: true,
        organization: {
          select: {
            id: true,
            name: true,
            domain: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!subscription) {
      return null;
    }

    return {
      id: subscription.id,
      organizationId: subscription.organizationId,
      organization: subscription.organization,
      planId: subscription.planId,
      plan: {
        id: subscription.plan.id,
        name: subscription.plan.name,
        description: subscription.plan.description,
        price: subscription.plan.price,
        interval: subscription.plan.interval,
        currency: subscription.plan.currency,
        features: JSON.parse(subscription.plan.features)
      },
      status: subscription.status,
      startDate: subscription.startDate,
      endDate: subscription.endDate,
      nextBillingDate: subscription.nextBillingDate,
      autoRenew: subscription.autoRenew,
      paymentMethod: subscription.paymentMethod,
      lastPaymentDate: subscription.lastPaymentDate,
      cancelledAt: subscription.cancelledAt,
      cancelReason: subscription.cancelReason,
      createdAt: subscription.createdAt,
      updatedAt: subscription.updatedAt
    };
  }

  /**
   * Subscribe an organization to a plan
   */
  async subscribeOrganization(
    orgId: string,
    input: SubscriptionInput,
    context: AuditContext
  ): Promise<any> {
    // Validate organization exists
    const org = await prisma.organization.findUnique({
      where: { id: orgId }
    });
    if (!org) {
      throw new Error('Organization not found');
    }

    // Validate plan exists
    const plan = await prisma.subscriptionPlan.findUnique({
      where: { id: input.planId }
    });
    if (!plan || plan.status !== 'ACTIVE') {
      throw new Error('Subscription plan not found or inactive');
    }

    // Check for existing active subscription
    const existing = await prisma.organizationSubscription.findFirst({
      where: {
        organizationId: orgId,
        status: { in: ['ACTIVE', 'SUSPENDED'] }
      }
    });

    if (existing) {
      throw new Error('Organization already has an active subscription');
    }

    // Create subscription
    const subscription = await prisma.organizationSubscription.create({
      data: {
        organizationId: orgId,
        planId: input.planId,
        status: 'ACTIVE',
        startDate: input.startDate,
        endDate: input.endDate,
        nextBillingDate: input.nextBillingDate,
        autoRenew: input.autoRenew ?? true,
        paymentMethod: input.paymentMethod
      },
      include: {
        plan: true,
        organization: {
          select: {
            id: true,
            name: true,
            domain: true
          }
        }
      }
    });

    // Audit log
    await auditService.logAction({
      action: 'CREATE',
      entityType: 'OrganizationSubscription',
      entityId: subscription.id,
      context: {
        organizationId: orgId,
        userId: context.userId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent
      }
    });

    // System log
    await systemLogsService.storeLog({
      level: 'INFO',
      message: `Organization ${org.name} subscribed to plan ${plan.name}`,
      source: 'subscription-plan',
      userId: context.userId,
      organizationId: orgId
    });

    return {
      id: subscription.id,
      organizationId: subscription.organizationId,
      organization: subscription.organization,
      planId: subscription.planId,
      plan: {
        id: subscription.plan.id,
        name: subscription.plan.name,
        description: subscription.plan.description,
        price: subscription.plan.price,
        interval: subscription.plan.interval,
        currency: subscription.plan.currency,
        features: JSON.parse(subscription.plan.features)
      },
      status: subscription.status,
      startDate: subscription.startDate,
      endDate: subscription.endDate,
      nextBillingDate: subscription.nextBillingDate,
      autoRenew: subscription.autoRenew,
      paymentMethod: subscription.paymentMethod,
      createdAt: subscription.createdAt,
      updatedAt: subscription.updatedAt
    };
  }

  /**
   * Update subscription details
   */
  async updateSubscription(
    orgId: string,
    input: Partial<{
      status: 'ACTIVE' | 'CANCELLED' | 'EXPIRED' | 'SUSPENDED';
      endDate: Date;
      nextBillingDate: Date;
      autoRenew: boolean;
      paymentMethod: string;
      lastPaymentDate: Date;
    }>,
    context: AuditContext
  ): Promise<any> {
    const subscription = await prisma.organizationSubscription.findFirst({
      where: {
        organizationId: orgId,
        status: { in: ['ACTIVE', 'SUSPENDED'] }
      }
    });

    if (!subscription) {
      throw new Error('No active subscription found for organization');
    }

    const updateData: any = {};

    if (input.status !== undefined) {
      updateData.status = input.status;
    }
    if (input.endDate !== undefined) {
      updateData.endDate = input.endDate;
    }
    if (input.nextBillingDate !== undefined) {
      updateData.nextBillingDate = input.nextBillingDate;
    }
    if (input.autoRenew !== undefined) {
      updateData.autoRenew = input.autoRenew;
    }
    if (input.paymentMethod !== undefined) {
      updateData.paymentMethod = input.paymentMethod;
    }
    if (input.lastPaymentDate !== undefined) {
      updateData.lastPaymentDate = input.lastPaymentDate;
    }

    updateData.updatedAt = new Date();

    const updated = await prisma.organizationSubscription.update({
      where: { id: subscription.id },
      data: updateData,
      include: {
        plan: true,
        organization: {
          select: {
            id: true,
            name: true,
            domain: true
          }
        }
      }
    });

    // Audit log
    await auditService.logAction({
      action: 'UPDATE',
      entityType: 'OrganizationSubscription',
      entityId: updated.id,
      context: {
        organizationId: orgId,
        userId: context.userId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent
      }
    });

    // System log
    await systemLogsService.storeLog({
      level: 'INFO',
      message: `Updated subscription for organization ${updated.organization.name}`,
      source: 'subscription-plan',
      userId: context.userId,
      organizationId: orgId
    });

    return {
      id: updated.id,
      organizationId: updated.organizationId,
      organization: updated.organization,
      planId: updated.planId,
      plan: {
        id: updated.plan.id,
        name: updated.plan.name,
        description: updated.plan.description,
        price: updated.plan.price,
        interval: updated.plan.interval,
        currency: updated.plan.currency,
        features: JSON.parse(updated.plan.features)
      },
      status: updated.status,
      startDate: updated.startDate,
      endDate: updated.endDate,
      nextBillingDate: updated.nextBillingDate,
      autoRenew: updated.autoRenew,
      paymentMethod: updated.paymentMethod,
      lastPaymentDate: updated.lastPaymentDate,
      cancelledAt: updated.cancelledAt,
      cancelReason: updated.cancelReason,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt
    };
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(
    orgId: string,
    reason: string,
    context: AuditContext
  ): Promise<void> {
    const subscription = await prisma.organizationSubscription.findFirst({
      where: {
        organizationId: orgId,
        status: { in: ['ACTIVE', 'SUSPENDED'] }
      },
      include: {
        organization: true
      }
    });

    if (!subscription) {
      throw new Error('No active subscription found for organization');
    }

    await prisma.organizationSubscription.update({
      where: { id: subscription.id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelReason: reason,
        autoRenew: false,
        updatedAt: new Date()
      }
    });

    // Audit log
    await auditService.logAction({
      action: 'DELETE',
      entityType: 'OrganizationSubscription',
      entityId: subscription.id,
      context: {
        organizationId: orgId,
        userId: context.userId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent
      }
    });

    // System log
    await systemLogsService.storeLog({
      level: 'WARN',
      message: `Cancelled subscription for organization ${subscription.organization.name}. Reason: ${reason}`,
      source: 'subscription-plan',
      userId: context.userId,
      organizationId: orgId
    });
  }
}

export const subscriptionPlanService = new SubscriptionPlanService();
