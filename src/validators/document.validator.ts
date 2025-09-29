import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';
import { DocumentCategory, AccessLevel } from '../types/enums';

const documentUploadSchema = z.object({
  body: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    category: z.nativeEnum(DocumentCategory),
    tags: z.array(z.string()).optional().transform(tags =>
      Array.isArray(tags) ? tags : typeof tags === 'string' ? [tags] : []
    ),
    entityType: z.string().optional(),
    entityId: z.string().optional(),
    isPublic: z.string().transform(val => val === 'true').pipe(z.boolean()).optional(),
    isEncrypted: z.string().transform(val => val === 'true').pipe(z.boolean()).optional(),
    accessLevel: z.nativeEnum(AccessLevel).optional(),
    retentionDate: z.string().transform(val => val ? new Date(val) : undefined).optional()
  })
});

const documentUpdateSchema = z.object({
  body: z.object({
    title: z.string().min(1, 'Title cannot be empty').optional(),
    description: z.string().optional(),
    category: z.nativeEnum(DocumentCategory).optional(),
    tags: z.array(z.string()).optional(),
    isPublic: z.boolean().optional(),
    accessLevel: z.nativeEnum(AccessLevel).optional(),
    retentionDate: z.string().transform(val => val ? new Date(val) : undefined).optional()
  })
});

const documentFiltersSchema = z.object({
  query: z.object({
    category: z.nativeEnum(DocumentCategory).optional(),
    entityType: z.string().optional(),
    entityId: z.string().optional(),
    tags: z.union([
      z.string().transform(val => [val]),
      z.array(z.string())
    ]).optional(),
    isPublic: z.string().transform(val => val === 'true').pipe(z.boolean()).optional(),
    accessLevel: z.nativeEnum(AccessLevel).optional(),
    search: z.string().optional(),
    startDate: z.string().transform(val => val ? new Date(val) : undefined).optional(),
    endDate: z.string().transform(val => val ? new Date(val) : undefined).optional(),
    limit: z.string().transform(val => parseInt(val, 10)).pipe(z.number().min(1).max(100)).optional().default('50'),
    offset: z.string().transform(val => parseInt(val, 10)).pipe(z.number().min(0)).optional().default('0')
  })
});

const documentAttachSchema = z.object({
  body: z.object({
    entityType: z.string().min(1, 'Entity type is required'),
    entityId: z.string().min(1, 'Entity ID is required')
  })
});

const documentStatsSchema = z.object({
  query: z.object({
    entityType: z.string().optional(),
    entityId: z.string().optional()
  })
});

export const validateDocumentUpload = (req: Request, res: Response, next: NextFunction): void => {
  try {
    // Check if file is present
    if (!req.file) {
      res.status(400).json({
        error: 'File is required',
        message: 'Please upload a file'
      });
      return;
    }

    const result = documentUploadSchema.safeParse(req);
    if (!result.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: result.error.issues.map(issue => ({
          field: issue.path.join('.'),
          message: issue.message
        }))
      });
      return;
    }

    req.body = result.data.body;
    next();
  } catch (error) {
    res.status(400).json({
      error: 'Validation error',
      message: 'Invalid request data'
    });
  }
};

export const validateDocumentUpdate = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const result = documentUpdateSchema.safeParse(req);
    if (!result.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: result.error.issues.map(issue => ({
          field: issue.path.join('.'),
          message: issue.message
        }))
      });
      return;
    }

    req.body = result.data.body;
    next();
  } catch (error) {
    res.status(400).json({
      error: 'Validation error',
      message: 'Invalid request data'
    });
  }
};

export const validateDocumentFilters = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const result = documentFiltersSchema.safeParse(req);
    if (!result.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: result.error.issues.map(issue => ({
          field: issue.path.join('.'),
          message: issue.message
        }))
      });
      return;
    }

    req.query = result.data.query as any;
    next();
  } catch (error) {
    res.status(400).json({
      error: 'Validation error',
      message: 'Invalid query parameters'
    });
  }
};

export const validateDocumentAttach = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const result = documentAttachSchema.safeParse(req);
    if (!result.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: result.error.issues.map(issue => ({
          field: issue.path.join('.'),
          message: issue.message
        }))
      });
      return;
    }

    req.body = result.data.body;
    next();
  } catch (error) {
    res.status(400).json({
      error: 'Validation error',
      message: 'Invalid request data'
    });
  }
};

export const validateDocumentStats = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const result = documentStatsSchema.safeParse(req);
    if (!result.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: result.error.issues.map(issue => ({
          field: issue.path.join('.'),
          message: issue.message
        }))
      });
      return;
    }

    req.query = result.data.query as any;
    next();
  } catch (error) {
    res.status(400).json({
      error: 'Validation error',
      message: 'Invalid query parameters'
    });
  }
};

export const validateBulkUpload = (req: Request, res: Response, next: NextFunction): void => {
  try {
    // Check if files are present
    if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
      res.status(400).json({
        error: 'Files are required',
        message: 'Please upload at least one file'
      });
      return;
    }

    const bulkUploadSchema = z.object({
      body: z.object({
        category: z.nativeEnum(DocumentCategory),
        entityType: z.string().optional(),
        entityId: z.string().optional(),
        isPublic: z.string().transform(val => val === 'true').pipe(z.boolean()).optional(),
        isEncrypted: z.string().transform(val => val === 'true').pipe(z.boolean()).optional(),
        accessLevel: z.nativeEnum(AccessLevel).optional()
      })
    });

    const result = bulkUploadSchema.safeParse(req);
    if (!result.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: result.error.issues.map(issue => ({
          field: issue.path.join('.'),
          message: issue.message
        }))
      });
      return;
    }

    req.body = result.data.body;
    next();
  } catch (error) {
    res.status(400).json({
      error: 'Validation error',
      message: 'Invalid request data'
    });
  }
};