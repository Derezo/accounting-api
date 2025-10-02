import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.middleware';
import { sendError, sendForbidden } from '../utils/response';

/**
 * Middleware to validate organizationId URL parameter against JWT token
 * Ensures proper multi-tenant security and URL consistency
 */
export function validateOrganizationAccess(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  // Skip validation for auth routes
  if (req.path.startsWith('/auth')) {
    next();
    return;
  }

  // Extract organizationId from URL parameters
  const urlOrganizationId = req.params.organizationId || req.params.orgId;

  // If no organizationId in URL, this might be a legacy route - allow it for backward compatibility
  if (!urlOrganizationId) {
    next();
    return;
  }

  // Ensure user is authenticated
  if (!req.user) {
    sendError(res, 'UNAUTHORIZED', 'Authentication required', 401);
    return;
  }

  // Skip validation for test tokens in test environment
  if (process.env.NODE_ENV === 'test' && req.user.isTestToken === true) {
    req.validatedOrganizationId = urlOrganizationId;
    next();
    return;
  }

  // Validate that the URL organizationId matches the user's organization from JWT
  if (req.user.organizationId !== urlOrganizationId) {
    sendForbidden(
      res,
      'Access denied: You do not have permission to access this organization\'s resources'
    );
    return;
  }

  // Store validated organizationId for easy access in controllers
  req.validatedOrganizationId = urlOrganizationId;

  next();
}

/**
 * Middleware to extract organizationId from either URL or JWT
 * Provides backward compatibility during migration
 */
export function getOrganizationId(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  // For authenticated requests, get organizationId from URL (preferred) or JWT (fallback)
  if (req.user) {
    const urlOrganizationId = req.params.organizationId || req.params.orgId;
    req.effectiveOrganizationId = urlOrganizationId || req.user.organizationId;
  }

  next();
}

/**
 * Helper function to extract organizationId from request
 * Returns organizationId from URL parameter or JWT token
 */
export function getOrganizationIdFromRequest(req: AuthenticatedRequest): string {
  // Prefer validated organizationId from URL
  if (req.validatedOrganizationId) {
    return req.validatedOrganizationId;
  }

  // Fall back to URL parameter
  const urlOrganizationId = req.params.organizationId || req.params.orgId;
  if (urlOrganizationId) {
    return urlOrganizationId;
  }

  // Final fallback to JWT token
  if (req.user?.organizationId) {
    return req.user.organizationId;
  }

  throw new Error('Organization ID not found in request');
}

/**
 * Enhanced AuthenticatedRequest interface with organization validation
 */
declare global {
  namespace Express {
    interface Request {
      validatedOrganizationId?: string;
      effectiveOrganizationId?: string;
    }
  }
}