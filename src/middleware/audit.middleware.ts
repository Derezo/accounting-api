import { Request, Response, NextFunction } from 'express';
import { auditService } from '../services/audit.service';
import { AuthenticatedRequest } from './auth.middleware';
import { AuditAction } from '../types/enums';
import { v4 as uuidv4 } from 'uuid';

interface AuditConfig {
  action: AuditAction;
  entityType: string;
  getEntityId?: (req: Request) => string;
  captureRequestBody?: boolean;
  captureResponseBody?: boolean;
}

export function auditLog(config: AuditConfig) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    const requestId = uuidv4();
    (req as any).requestId = requestId;

    // Capture original response methods
    const originalSend = res.send;
    const originalJson = res.json;

    let responseData: any = null;

    // Override response methods to capture response data
    res.send = function(data: any): Response {
      responseData = data;
      return originalSend.call(this, data);
    };

    res.json = function(data: any): Response {
      responseData = data;
      return originalJson.call(this, data);
    };

    // Continue with request processing
    next();

    // After response is sent, log audit
    res.on('finish', async () => {
      if (!req.user || !req.organization) {
        return; // Skip audit for unauthenticated requests
      }

      try {
        const entityId = config.getEntityId ? config.getEntityId(req) : req.params.id || 'unknown';

        const changes: any = {};

        if (config.captureRequestBody && req.body) {
          changes.request = req.body;
        }

        if (config.captureResponseBody && responseData) {
          changes.response = responseData;
        }

        if (res.statusCode >= 200 && res.statusCode < 300) {
          await auditService.logAction({
            action: config.action,
            entityType: config.entityType,
            entityId,
            changes: Object.keys(changes).length > 0 ? changes : undefined,
            context: {
              userId: req.user.id,
              organizationId: req.user.organizationId,
              ipAddress: req.ip || req.connection.remoteAddress,
              userAgent: req.headers['user-agent'],
              requestId
            }
          });
        }
      } catch (error) {
        console.error('Audit middleware error:', error);
      }
    });
  };
}

export function auditCreate(entityType: string, options?: Partial<AuditConfig>) {
  return auditLog({
    action: AuditAction.CREATE,
    entityType,
    captureRequestBody: true,
    ...options
  });
}

export function auditUpdate(entityType: string, options?: Partial<AuditConfig>) {
  return auditLog({
    action: AuditAction.UPDATE,
    entityType,
    captureRequestBody: true,
    ...options
  });
}

export function auditDelete(entityType: string, options?: Partial<AuditConfig>) {
  return auditLog({
    action: AuditAction.DELETE,
    entityType,
    ...options
  });
}

export function auditView(entityType: string, options?: Partial<AuditConfig>) {
  return auditLog({
    action: AuditAction.VIEW,
    entityType,
    ...options
  });
}

export function auditExport(entityType: string, options?: Partial<AuditConfig>) {
  return auditLog({
    action: AuditAction.EXPORT,
    entityType,
    captureRequestBody: true,
    ...options
  });
}

export function auditLoginAttempt() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const originalJson = res.json;
    let loginSuccess = false;

    res.json = function(data: any): Response {
      loginSuccess = res.statusCode === 200 && data.tokens;
      return originalJson.call(this, data);
    };

    next();

    res.on('finish', async () => {
      const { email } = req.body;
      if (!email) return;

      try {
        // Find user to get organization
        const { PrismaClient } = require('@prisma/client');
        const prisma = new PrismaClient();

        const user = await prisma.user.findUnique({
          where: { email }
        });

        if (user) {
          await auditService.logLogin(
            user.id,
            loginSuccess,
            {
              organizationId: user.organizationId,
              ipAddress: req.ip || req.connection.remoteAddress,
              userAgent: req.headers['user-agent']
            }
          );
        }
      } catch (error) {
        console.error('Audit login error:', error);
      }
    });
  };
}

export function auditMiddleware(entityType: string) {
  return {
    create: auditCreate(entityType),
    update: auditUpdate(entityType),
    delete: auditDelete(entityType),
    view: auditView(entityType),
    export: auditExport(entityType)
  };
}