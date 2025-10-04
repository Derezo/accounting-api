import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth.service';
import { UserRole } from '../types/enums';
import { ErrorResponseUtil } from '../utils/error-response';
import { hashApiKey } from '../utils/crypto';
import { prisma } from '../config/database';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        organizationId: string;
        role: string;
        sessionId: string;
        isTestToken?: boolean;
      };
      organization?: any;
    }
  }
}

export interface AuthenticatedRequest extends Request {}

/**
 * Role hierarchy with numeric levels for proper authorization checking
 * Higher number = higher privileges
 */
const roleHierarchy: Record<UserRole, number> = {
  [UserRole.SUPER_ADMIN]: 100,
  [UserRole.ADMIN]: 80,
  [UserRole.MANAGER]: 60,
  [UserRole.ACCOUNTANT]: 50,
  [UserRole.EMPLOYEE]: 40,
  [UserRole.VIEWER]: 20,
  [UserRole.CLIENT]: 10
};

export async function authenticate(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      ErrorResponseUtil.sendAuthenticationError(res, 'Bearer token required');
      return;
    }

    const token = authHeader.substring(7);
    const payload = await authService.verifyToken(token);

    // Test mode bypass: if token has isTestToken flag and we're in test environment
    // IMPORTANT: This ONLY works in test environment
    if (process.env.NODE_ENV === 'test' && payload.isTestToken === true) {
      // Use token payload directly without database lookup
      req.user = {
        id: payload.userId,
        organizationId: payload.organizationId,
        role: payload.role,
        sessionId: payload.sessionId || 'test-session-id',
        isTestToken: true
      };

      // Create a minimal mock organization
      req.organization = {
        id: payload.organizationId,
        name: `Test Organization ${payload.organizationId}`,
        type: 'SINGLE_BUSINESS',
        isActive: true,
        settings: {}
      };

      next();
      return;
    }

    // Normal flow: Load user and organization data from database
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: { organization: true }
    });

    if (!user || !user.isActive) {
      ErrorResponseUtil.sendAuthenticationError(res, 'User account inactive');
      return;
    }

    if (!user.organization.isActive) {
      ErrorResponseUtil.sendAuthorizationError(res, 'Organization account inactive');
      return;
    }

    req.user = {
      id: payload.userId,
      organizationId: payload.organizationId,
      role: payload.role,
      sessionId: payload.sessionId
    };

    req.organization = user.organization;

    next();
  } catch (error) {
    ErrorResponseUtil.sendAuthenticationError(res, 'Invalid authentication token');
  }
}

/**
 * Authorization middleware with proper role hierarchy support
 * SUPER_ADMIN has access to everything
 * Higher roles can access endpoints for lower roles
 *
 * @param roles - Required roles for this endpoint
 * @returns Express middleware function
 */
export function authorize(...allowedRoles: UserRole[] | [UserRole[]]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Handle both array and spread parameter formats
    const roles = Array.isArray(allowedRoles[0]) ? allowedRoles[0] : allowedRoles as UserRole[];

    // SUPER_ADMIN has access to everything - bypass hierarchy check
    if (req.user.role === UserRole.SUPER_ADMIN) {
      next();
      return;
    }

    // Get the user's role level
    const userRoleLevel = roleHierarchy[req.user.role as UserRole] || 0;

    // Get the minimum required role level from the allowed roles
    const minimumRequiredLevel = Math.min(...roles.map(r => roleHierarchy[r] || 0));

    // Check if user's role level meets or exceeds the minimum required level
    if (userRoleLevel >= minimumRequiredLevel) {
      next();
      return;
    }

    // User doesn't have sufficient permissions
    res.status(403).json({
      error: 'Insufficient permissions',
      required: roles,
      current: req.user.role
    });
  };
}

export function authorizeOwner(userIdParam: string = 'userId') {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const requestedUserId = req.params[userIdParam];

    if (req.user.id !== requestedUserId && req.user.role !== UserRole.SUPER_ADMIN && req.user.role !== UserRole.ADMIN) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    next();
  };
}

export async function validateApiKey(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const apiKey = req.headers['x-api-key'] as string;

    if (!apiKey) {
      res.status(401).json({ error: 'API key required' });
      return;
    }

    const hashedKey = hashApiKey(apiKey);

    const key = await prisma.apiKey.findUnique({
      where: { keyHash: hashedKey },
      include: { organization: true }
    });

    if (!key || !key.isActive) {
      res.status(401).json({ error: 'Invalid API key' });
      return;
    }

    if (key.expiresAt && key.expiresAt < new Date()) {
      res.status(401).json({ error: 'API key expired' });
      return;
    }

    // Update last used
    await prisma.apiKey.update({
      where: { id: key.id },
      data: {
        lastUsedAt: new Date(),
        lastUsedIp: req.ip
      }
    });

    req.organization = key.organization;
    req.user = {
      id: 'api-key',
      organizationId: key.organizationId,
      role: UserRole.ADMIN,
      sessionId: 'api-key'
    };

    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid API key' });
  }
}

export function requireOrganization(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const organizationId = req.params.organizationId || req.body.organizationId;

  if (!organizationId) {
    res.status(400).json({ error: 'Organization ID required' });
    return;
  }

  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  if (req.user.organizationId !== organizationId && req.user.role !== UserRole.SUPER_ADMIN) {
    res.status(403).json({ error: 'Access denied to this organization' });
    return;
  }

  next();
}


// Aliases for compatibility
export const authMiddleware = authenticate;
export const authenticateToken = authenticate;
export const authorizeRoles = authorize;
