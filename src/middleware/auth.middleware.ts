import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth.service';
import { UserRole } from '../types/enums';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    organizationId: string;
    role: string;
    sessionId: string;
  };
  organization?: any;
}

export async function authenticate(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const token = authHeader.substring(7);
    const payload = await authService.verifyToken(token);

    // Load user and organization data
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: { organization: true }
    });

    if (!user || !user.isActive) {
      res.status(401).json({ error: 'User account inactive' });
      return;
    }

    if (!user.organization.isActive) {
      res.status(403).json({ error: 'Organization account inactive' });
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
    res.status(401).json({ error: 'Invalid authentication token' });
  }
}

export function authorize(...allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (!allowedRoles.includes(req.user.role as UserRole)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    next();
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

    const hashedKey = require('../utils/crypto').hashApiKey(apiKey);

    const key = await prisma.apiKey.findUnique({
      where: { hashedKey },
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

export function multiTenantScope(model: any) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Add organization filter to all database queries
    const originalFindMany = model.findMany;
    const originalFindUnique = model.findUnique;
    const originalFindFirst = model.findFirst;
    const originalCreate = model.create;
    const originalUpdate = model.update;
    const originalDelete = model.delete;

    model.findMany = function(args: any = {}) {
      args.where = { ...args.where, organizationId: req.user!.organizationId };
      return originalFindMany.call(this, args);
    };

    model.findUnique = function(args: any) {
      args.where = { ...args.where, organizationId: req.user!.organizationId };
      return originalFindUnique.call(this, args);
    };

    model.findFirst = function(args: any = {}) {
      args.where = { ...args.where, organizationId: req.user!.organizationId };
      return originalFindFirst.call(this, args);
    };

    model.create = function(args: any) {
      args.data = { ...args.data, organizationId: req.user!.organizationId };
      return originalCreate.call(this, args);
    };

    model.update = function(args: any) {
      args.where = { ...args.where, organizationId: req.user!.organizationId };
      return originalUpdate.call(this, args);
    };

    model.delete = function(args: any) {
      args.where = { ...args.where, organizationId: req.user!.organizationId };
      return originalDelete.call(this, args);
    };

    next();
  };
}