/**
 * Routes for template-based intake form system (V2)
 */

import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { IntakeFormV2Controller } from '@/controllers/intake-form-v2.controller';
import { EncryptionService } from '@/services/encryption.service';
import { authenticate } from '@/middleware/auth.middleware';
import { validateRequest } from '@/middleware/validation.middleware';
import { rateLimitMiddleware } from '@/middleware/rate-limit.middleware';
import {
  createTemplateSchema,
  updateTemplateSchema,
  createStepSchema,
  updateStepSchema,
  createFieldSchema,
  updateFieldSchema,
  createSessionSchema,
  updateSessionDataSchema,
  advanceStepSchema,
} from '@/validators/intake-form-v2.schemas';

const router = Router();
const prisma = new PrismaClient();
const encryptionService = new EncryptionService(prisma);
const controller = new IntakeFormV2Controller(prisma, encryptionService);

// ==================== ADMIN ROUTES (Authenticated) ====================

// Template Management
router.post(
  '/organizations/:orgId/intake-forms/templates',
  authenticate,
  controller.createTemplate
);

router.get(
  '/organizations/:orgId/intake-forms/templates',
  authenticate,
  controller.listTemplates
);

router.get(
  '/organizations/:orgId/intake-forms/templates/:id',
  authenticate,
  controller.getTemplate
);

router.put(
  '/organizations/:orgId/intake-forms/templates/:id',
  authenticate,
  controller.updateTemplate
);

router.delete(
  '/organizations/:orgId/intake-forms/templates/:id',
  authenticate,
  controller.deleteTemplate
);

// Step Management
router.post(
  '/organizations/:orgId/intake-forms/templates/:templateId/steps',
  authenticate,
  controller.createStep
);

router.put(
  '/organizations/:orgId/intake-forms/templates/:templateId/steps/:stepId',
  authenticate,
  controller.updateStep
);

router.delete(
  '/organizations/:orgId/intake-forms/templates/:templateId/steps/:stepId',
  authenticate,
  controller.deleteStep
);

// Field Management
router.post(
  '/organizations/:orgId/intake-forms/templates/:templateId/fields',
  authenticate,
  controller.createField
);

router.put(
  '/organizations/:orgId/intake-forms/templates/:templateId/fields/:fieldId',
  authenticate,
  controller.updateField
);

router.delete(
  '/organizations/:orgId/intake-forms/templates/:templateId/fields/:fieldId',
  authenticate,
  controller.deleteField
);

// Conversion
router.post(
  '/organizations/:orgId/intake-forms/sessions/:sessionId/convert',
  authenticate,
  controller.convertSession
);

// ==================== PUBLIC ROUTES (No Auth Required) ====================

// Public Template Access (read-only)
router.get(
  '/intake-forms/templates/default',
  rateLimitMiddleware({ windowMs: 15 * 60 * 1000, max: 100 }),
  controller.getDefaultTemplateByDomain
);

router.get(
  '/intake-forms/templates/:id',
  rateLimitMiddleware({ windowMs: 15 * 60 * 1000, max: 100 }),
  controller.getPublicTemplate
);

// Session Management
router.post(
  '/intake-forms/:templateId/sessions',
  rateLimitMiddleware({ windowMs: 15 * 60 * 1000, max: 10 }), // 10 requests per 15 minutes
  controller.createPublicSession
);

router.get(
  '/intake-forms/sessions/:token',
  rateLimitMiddleware({ windowMs: 15 * 60 * 1000, max: 100 }),
  controller.getSession
);

router.get(
  '/intake-forms/sessions/:token/progress',
  rateLimitMiddleware({ windowMs: 15 * 60 * 1000, max: 100 }),
  controller.getSessionProgress
);

router.patch(
  '/intake-forms/sessions/:token/data',
  rateLimitMiddleware({ windowMs: 15 * 60 * 1000, max: 100 }),
  controller.updateSessionData
);

router.post(
  '/intake-forms/sessions/:token/advance',
  rateLimitMiddleware({ windowMs: 15 * 60 * 1000, max: 100 }),
  controller.advanceStep
);

router.post(
  '/intake-forms/sessions/:token/complete',
  rateLimitMiddleware({ windowMs: 15 * 60 * 1000, max: 10 }),
  controller.completeSession
);

router.post(
  '/intake-forms/sessions/:token/abandon',
  rateLimitMiddleware({ windowMs: 15 * 60 * 1000, max: 10 }),
  controller.abandonSession
);

export default router;
