import { Request, Response, NextFunction } from 'express';
import { UserRole } from '../types/enums';
import { ErrorResponseUtil } from '../utils/error-response';
import { prisma } from '../config/database';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        organizationId: string;
        role: string;
        sessionId: string;
      };
    }
  }
}

export interface AuthenticatedRequest extends Request {}

/**
 * Resource type for permission checking
 */
export type ResourceType = 'customer' | 'quote' | 'invoice' | 'payment' | 'project' | 'appointment';

/**
 * Middleware to check if user has access to a specific resource
 * Verifies:
 * 1. Resource exists
 * 2. Resource belongs to user's organization
 * 3. For VIEWER and CLIENT roles, checks if resource is assigned to them
 *
 * @param resourceType - Type of resource to check
 * @param resourceIdParam - Name of the route parameter containing resource ID (default: 'id')
 */
export function checkResourceAccess(
  resourceType: ResourceType,
  resourceIdParam: string = 'id'
) {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) {
        ErrorResponseUtil.sendAuthenticationError(res, 'Authentication required');
        return;
      }

      const resourceId = req.params[resourceIdParam];
      if (!resourceId) {
        res.status(400).json({ error: `${resourceType} ID required` });
        return;
      }

      const { organizationId, role, id: userId } = req.user;

      // SUPER_ADMIN and ADMIN have access to all resources in their organization
      if (role === UserRole.SUPER_ADMIN || role === UserRole.ADMIN) {
        next();
        return;
      }

      // Check resource exists and belongs to organization
      const resource = await getResource(resourceType, resourceId);

      if (!resource) {
        res.status(404).json({ error: `${resourceType} not found` });
        return;
      }

      if (resource.organizationId !== organizationId) {
        res.status(403).json({ error: 'Access denied to this resource' });
        return;
      }

      // For MANAGER, ACCOUNTANT, EMPLOYEE roles - grant access if in same org
      const managerRoles: string[] = [UserRole.MANAGER, UserRole.ACCOUNTANT, UserRole.EMPLOYEE];
      if (managerRoles.includes(role)) {
        next();
        return;
      }

      // For VIEWER and CLIENT - check if resource is assigned to them
      if (role === UserRole.VIEWER || role === UserRole.CLIENT) {
        const hasAccess = await checkUserResourceAssignment(
          resourceType,
          resourceId,
          userId
        );

        if (!hasAccess) {
          res.status(403).json({
            error: 'Access denied - resource not assigned to you'
          });
          return;
        }
      }

      next();
    } catch (error) {
      console.error(`Resource access check error:`, error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

/**
 * Get resource by type and ID
 */
async function getResource(
  resourceType: ResourceType,
  resourceId: string
): Promise<{ organizationId: string } | null> {
  switch (resourceType) {
    case 'customer':
      return await prisma.customer.findUnique({
        where: { id: resourceId },
        select: { organizationId: true }
      });

    case 'quote':
      return await prisma.quote.findUnique({
        where: { id: resourceId },
        select: { organizationId: true }
      });

    case 'invoice':
      return await prisma.invoice.findUnique({
        where: { id: resourceId },
        select: { organizationId: true }
      });

    case 'payment':
      return await prisma.payment.findUnique({
        where: { id: resourceId },
        select: { organizationId: true }
      });

    case 'project':
      return await prisma.project.findUnique({
        where: { id: resourceId },
        select: { organizationId: true }
      });

    case 'appointment':
      return await prisma.appointment.findUnique({
        where: { id: resourceId },
        select: { organizationId: true }
      });

    default:
      return null;
  }
}

/**
 * Check if user has assignment access to resource
 * For CLIENT role: check if they are the customer on the resource
 * For VIEWER role: check if they are assigned to the resource
 */
async function checkUserResourceAssignment(
  resourceType: ResourceType,
  resourceId: string,
  userId: string
): Promise<boolean> {
  try {
    // Get user to check their customer association
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { customerId: true }
    });

    if (!user) {
      return false;
    }

    switch (resourceType) {
      case 'customer':
        // Users can access their own customer record
        return user.customerId === resourceId;

      case 'quote':
        if (!user.customerId) return false;
        const quote = await prisma.quote.findFirst({
          where: {
            id: resourceId,
            customerId: user.customerId
          }
        });
        return !!quote;

      case 'invoice':
        if (!user.customerId) return false;
        const invoice = await prisma.invoice.findFirst({
          where: {
            id: resourceId,
            customerId: user.customerId
          }
        });
        return !!invoice;

      case 'payment':
        if (!user.customerId) return false;
        // Check payment through invoice
        const payment = await prisma.payment.findFirst({
          where: {
            id: resourceId,
            invoice: {
              customerId: user.customerId
            }
          }
        });
        return !!payment;

      case 'project':
        if (!user.customerId) return false;
        const project = await prisma.project.findFirst({
          where: {
            id: resourceId,
            customerId: user.customerId
          }
        });
        return !!project;

      case 'appointment':
        if (!user.customerId) return false;
        const appointment = await prisma.appointment.findFirst({
          where: {
            id: resourceId,
            customerId: user.customerId
          }
        });
        return !!appointment;

      default:
        return false;
    }
  } catch (error) {
    console.error(`Error checking user resource assignment:`, error);
    return false;
  }
}

/**
 * Middleware to check ownership of a resource
 * Ensures only the creator or ADMIN/SUPER_ADMIN can modify
 *
 * @param resourceType - Type of resource
 * @param resourceIdParam - Route parameter name for resource ID
 */
export function checkResourceOwnership(
  resourceType: ResourceType,
  resourceIdParam: string = 'id'
) {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) {
        ErrorResponseUtil.sendAuthenticationError(res, 'Authentication required');
        return;
      }

      const resourceId = req.params[resourceIdParam];
      if (!resourceId) {
        res.status(400).json({ error: `${resourceType} ID required` });
        return;
      }

      const { role, id: userId, organizationId } = req.user;

      // SUPER_ADMIN and ADMIN can modify anything
      if (role === UserRole.SUPER_ADMIN || role === UserRole.ADMIN) {
        next();
        return;
      }

      // Check if user created the resource
      const resource = await getResourceWithCreator(resourceType, resourceId);

      if (!resource) {
        res.status(404).json({ error: `${resourceType} not found` });
        return;
      }

      if (resource.organizationId !== organizationId) {
        res.status(403).json({ error: 'Access denied to this resource' });
        return;
      }

      // MANAGER can modify resources in their organization
      if (role === UserRole.MANAGER) {
        next();
        return;
      }

      // Others can only modify their own resources
      if (resource.createdBy !== userId) {
        res.status(403).json({
          error: 'Access denied - you can only modify resources you created'
        });
        return;
      }

      next();
    } catch (error) {
      console.error(`Resource ownership check error:`, error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

/**
 * Get resource with creator information
 */
async function getResourceWithCreator(
  resourceType: ResourceType,
  resourceId: string
): Promise<{ organizationId: string; createdBy: string | null } | null> {
  switch (resourceType) {
    case 'customer':
      return await prisma.customer.findUnique({
        where: { id: resourceId },
        select: { organizationId: true, createdBy: true }
      });

    case 'quote':
      return await prisma.quote.findUnique({
        where: { id: resourceId },
        select: { organizationId: true, createdBy: true }
      });

    case 'invoice':
      return await prisma.invoice.findUnique({
        where: { id: resourceId },
        select: { organizationId: true, createdBy: true }
      });

    case 'payment':
      return await prisma.payment.findUnique({
        where: { id: resourceId },
        select: { organizationId: true, createdBy: true }
      });

    case 'project':
      return await prisma.project.findUnique({
        where: { id: resourceId },
        select: { organizationId: true, createdBy: true }
      });

    case 'appointment':
      return await prisma.appointment.findUnique({
        where: { id: resourceId },
        select: { organizationId: true, createdBy: true }
      });

    default:
      return null;
  }
}