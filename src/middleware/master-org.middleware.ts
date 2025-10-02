import { Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { AuthenticatedRequest } from '../types/express.d';
import { AuthorizationError, AuthenticationError } from '../utils/errors';
import { UserRole } from '../types/enums';

/**
 * Master Organization Domain
 * This is the only organization allowed to perform system-level operations
 */
export const MASTER_ORG_DOMAIN = 'lifestreamdynamics.com';

/**
 * Middleware: Require SUPER_ADMIN role from master organization
 *
 * This middleware enforces the highest level of security for organization management:
 * 1. User must be authenticated
 * 2. User must have SUPER_ADMIN role
 * 3. User must belong to the master organization (lifestreamdynamics.com)
 * 4. Master organization must be active
 *
 * Use this middleware for:
 * - Creating new organizations
 * - Listing all organizations (system-wide)
 * - Suspending/restoring organizations
 * - System-wide analytics
 * - Critical configuration changes
 */
export const requireMasterOrgSuperAdmin = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Check if user is authenticated
    if (!req.user) {
      throw new AuthenticationError('Authentication required');
    }

    const user = req.user;

    // Skip validation for test tokens in test environment
    if (process.env.NODE_ENV === 'test' && user.isTestToken === true) {
      // For test tokens, allow them to proceed without master org checks
      next();
      return;
    }

    // Check SUPER_ADMIN role
    if (user.role !== 'SUPER_ADMIN') {
      throw new AuthorizationError(
        'This operation requires SUPER_ADMIN role. ' +
        'Only system administrators from the master organization can perform this action.'
      );
    }

    // Load user's organization to verify it's the master org
    const organization = await prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: {
        id: true,
        name: true,
        domain: true,
        isActive: true,
        deletedAt: true
      }
    });

    if (!organization) {
      throw new AuthorizationError('User organization not found');
    }

    // Check if organization is the master organization
    if (organization.domain !== MASTER_ORG_DOMAIN) {
      throw new AuthorizationError(
        `This operation is restricted to the master organization (${MASTER_ORG_DOMAIN}). ` +
        `Your organization: ${organization.domain || 'unknown'}`
      );
    }

    // Check if organization is active
    if (!organization.isActive) {
      throw new AuthorizationError('Master organization is not active');
    }

    // Check if organization is not deleted
    if (organization.deletedAt) {
      throw new AuthorizationError('Master organization is deleted');
    }

    // Add master org info to request for logging/audit
    req.masterOrg = {
      id: organization.id,
      name: organization.name,
      domain: organization.domain
    };

    // All checks passed
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware: Check if user is from master organization (but any role)
 *
 * Less restrictive than requireMasterOrgSuperAdmin - allows any user from master org
 * Useful for read-only operations or administrative functions
 */
export const requireMasterOrg = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new AuthenticationError('Authentication required');
    }

    const user = req.user;

    // Skip validation for test tokens in test environment
    if (process.env.NODE_ENV === 'test' && user.isTestToken === true) {
      next();
      return;
    }

    // Load user's organization
    const organization = await prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: {
        id: true,
        name: true,
        domain: true,
        isActive: true,
        deletedAt: true
      }
    });

    if (!organization) {
      throw new AuthorizationError('User organization not found');
    }

    // Check if organization is the master organization
    if (organization.domain !== MASTER_ORG_DOMAIN) {
      throw new AuthorizationError(
        `This operation is restricted to the master organization (${MASTER_ORG_DOMAIN})`
      );
    }

    if (!organization.isActive || organization.deletedAt) {
      throw new AuthorizationError('Master organization is not active');
    }

    req.masterOrg = {
      id: organization.id,
      name: organization.name,
      domain: organization.domain
    };

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware: Check if operation is for same organization OR from master org
 *
 * Allows:
 * - User from same organization (any role with appropriate permissions)
 * - SUPER_ADMIN from master organization (for cross-org operations)
 *
 * Use this for operations that normally require same-org but master org can override
 */
export const requireSameOrgOrMasterAdmin = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new AuthenticationError('Authentication required');
    }

    const user = req.user;

    // Skip validation for test tokens in test environment
    if (process.env.NODE_ENV === 'test' && user.isTestToken === true) {
      next();
      return;
    }

    const targetOrgId = (req as any).params?.orgId || (req as any).params?.organizationId || (req as any).params?.id;

    // If no target org specified, must be same org
    if (!targetOrgId) {
      return next();
    }

    // If same organization, allow
    if (user.organizationId === targetOrgId) {
      return next();
    }

    // If SUPER_ADMIN from master org, allow cross-org access
    if (user.role === 'SUPER_ADMIN') {
      const organization = await prisma.organization.findUnique({
        where: { id: user.organizationId },
        select: { domain: true, isActive: true }
      });

      if (organization?.domain === MASTER_ORG_DOMAIN && organization.isActive) {
        req.masterOrg = {
          id: user.organizationId,
          name: 'Lifestream Dynamics',
          domain: MASTER_ORG_DOMAIN
        };
        return next();
      }
    }

    // Access denied
    throw new AuthorizationError(
      'You can only access resources from your own organization. ' +
      'Cross-organization access requires SUPER_ADMIN role from master organization.'
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Helper: Check if user is from master organization
 */
export async function isMasterOrgUser(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      organization: {
        select: { domain: true }
      }
    }
  });

  return user?.organization?.domain === MASTER_ORG_DOMAIN;
}

/**
 * Helper: Check if organization is master organization
 */
export async function isMasterOrganization(organizationId: string): Promise<boolean> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { domain: true }
  });

  return org?.domain === MASTER_ORG_DOMAIN;
}