import { Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { documentService } from '../services/document.service';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { DocumentCategory, AccessLevel } from '../types/enums';
import path from 'path';

export const validateUploadDocument = [
  body('title')
    .optional()
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('Title must be 1-255 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Description cannot exceed 1000 characters'),
  body('category')
    .isIn(Object.values(DocumentCategory))
    .withMessage('Valid category is required'),
  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array'),
  body('tags.*')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Each tag must be 1-50 characters'),
  body('entityType')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Entity type must be 1-50 characters'),
  body('entityId')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Entity ID must be 1-50 characters'),
  body('isPublic')
    .optional()
    .isBoolean()
    .withMessage('isPublic must be a boolean'),
  body('isEncrypted')
    .optional()
    .isBoolean()
    .withMessage('isEncrypted must be a boolean'),
  body('accessLevel')
    .optional()
    .isIn(Object.values(AccessLevel))
    .withMessage('Valid access level is required'),
  body('retentionDate')
    .optional()
    .isISO8601()
    .withMessage('Retention date must be a valid ISO 8601 date')
];

export const validateUpdateDocument = [
  param('documentId')
    .isString()
    .isLength({ min: 1 })
    .withMessage('Valid document ID is required'),
  body('title')
    .optional()
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('Title must be 1-255 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Description cannot exceed 1000 characters'),
  body('category')
    .optional()
    .isIn(Object.values(DocumentCategory))
    .withMessage('Valid category is required'),
  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array'),
  body('isPublic')
    .optional()
    .isBoolean()
    .withMessage('isPublic must be a boolean'),
  body('accessLevel')
    .optional()
    .isIn(Object.values(AccessLevel))
    .withMessage('Valid access level is required'),
  body('retentionDate')
    .optional()
    .isISO8601()
    .withMessage('Retention date must be a valid ISO 8601 date')
];

export const validateListDocuments = [
  query('category')
    .optional()
    .isIn(Object.values(DocumentCategory))
    .withMessage('Valid category is required'),
  query('entityType')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Entity type must be 1-50 characters'),
  query('entityId')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Entity ID must be 1-50 characters'),
  query('isPublic')
    .optional()
    .isBoolean()
    .withMessage('isPublic must be a boolean'),
  query('accessLevel')
    .optional()
    .isIn(Object.values(AccessLevel))
    .withMessage('Valid access level is required'),
  query('search')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Search term must be 1-100 characters'),
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO 8601 date'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid ISO 8601 date'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('offset')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Offset must be 0 or greater')
];

export const validateDocumentParam = [
  param('documentId')
    .isString()
    .isLength({ min: 1 })
    .withMessage('Valid document ID is required')
];

export const validateAttachDocument = [
  param('documentId')
    .isString()
    .isLength({ min: 1 })
    .withMessage('Valid document ID is required'),
  body('entityType')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Entity type is required and must be 1-50 characters'),
  body('entityId')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Entity ID is required and must be 1-50 characters')
];

export class DocumentController {
  constructor() {
    this.uploadDocument = this.uploadDocument.bind(this);
    this.getDocument = this.getDocument.bind(this);
    this.listDocuments = this.listDocuments.bind(this);
    this.updateDocument = this.updateDocument.bind(this);
    this.deleteDocument = this.deleteDocument.bind(this);
    this.downloadDocument = this.downloadDocument.bind(this);
    this.createVersion = this.createVersion.bind(this);
    this.getVersions = this.getVersions.bind(this);
    this.attachToEntity = this.attachToEntity.bind(this);
    this.getDocumentStats = this.getDocumentStats.bind(this);
  }

  async uploadDocument(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
        return;
      }

      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
      }

      const documentData = {
        title: req.body.title,
        description: req.body.description,
        category: req.body.category,
        tags: req.body.tags,
        entityType: req.body.entityType,
        entityId: req.body.entityId,
        isPublic: req.body.isPublic === 'true',
        isEncrypted: req.body.isEncrypted === 'true',
        accessLevel: req.body.accessLevel || AccessLevel.PRIVATE,
        retentionDate: req.body.retentionDate ? new Date(req.body.retentionDate) : undefined
      };

      const document = await documentService.uploadDocument(
        req.file,
        documentData,
        req.user.organizationId,
        {
          userId: req.user.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      );

      res.status(201).json({
        success: true,
        message: 'Document uploaded successfully',
        data: {
          id: document.id,
          title: document.title,
          originalName: document.originalName,
          filename: document.filename,
          mimeType: document.mimeType,
          size: document.size,
          category: document.category,
          isPublic: document.isPublic,
          accessLevel: document.accessLevel,
          createdAt: document.createdAt,
          uploadedBy: document.uploadedById
        }
      });
    } catch (error: any) {
      console.error('Error uploading document:', error);
      res.status(500).json({
        error: 'Failed to upload document',
        message: error.message
      });
    }
  }

  async getDocument(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
        return;
      }

      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const document = await documentService.getDocument(
        req.params.documentId,
        req.user.organizationId,
        {
          userId: req.user.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      );

      if (!document) {
        res.status(404).json({ error: 'Document not found' });
        return;
      }

      res.json({
        success: true,
        data: {
          id: document.id,
          title: document.title,
          description: document.description,
          originalName: document.originalName,
          filename: document.filename,
          mimeType: document.mimeType,
          size: document.size,
          category: document.category,
          tags: document.tags ? JSON.parse(document.tags) : [],
          entityType: document.entityType,
          entityId: document.entityId,
          isPublic: document.isPublic,
          isEncrypted: document.isEncrypted,
          accessLevel: document.accessLevel,
          version: document.version,
          isLatestVersion: document.isLatestVersion,
          retentionDate: document.retentionDate,
          isArchived: document.isArchived,
          createdAt: document.createdAt,
          updatedAt: document.updatedAt,
          uploadedBy: document.uploadedById
        }
      });
    } catch (error: any) {
      console.error('Error fetching document:', error);
      res.status(500).json({
        error: 'Failed to fetch document',
        message: error.message
      });
    }
  }

  async listDocuments(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
        return;
      }

      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const filters = {
        category: req.query.category as DocumentCategory,
        entityType: req.query.entityType as string,
        entityId: req.query.entityId as string,
        tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
        isPublic: req.query.isPublic ? req.query.isPublic === 'true' : undefined,
        accessLevel: req.query.accessLevel as AccessLevel,
        search: req.query.search as string,
        startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
        endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
        offset: req.query.offset ? parseInt(req.query.offset as string) : undefined
      };

      const result = await documentService.listDocuments(filters, req.user.organizationId);

      const documentsData = result.documents.map(doc => ({
        id: doc.id,
        title: doc.title,
        description: doc.description,
        originalName: doc.originalName,
        filename: doc.filename,
        mimeType: doc.mimeType,
        size: doc.size,
        category: doc.category,
        tags: doc.tags ? JSON.parse(doc.tags) : [],
        entityType: doc.entityType,
        entityId: doc.entityId,
        isPublic: doc.isPublic,
        accessLevel: doc.accessLevel,
        version: doc.version,
        isLatestVersion: doc.isLatestVersion,
        createdAt: doc.createdAt,
        uploadedBy: doc.uploadedById
      }));

      res.json({
        success: true,
        data: documentsData,
        pagination: {
          total: result.total,
          limit: filters.limit || 50,
          offset: filters.offset || 0,
          pages: Math.ceil(result.total / (filters.limit || 50))
        }
      });
    } catch (error: any) {
      console.error('Error listing documents:', error);
      res.status(500).json({
        error: 'Failed to list documents',
        message: error.message
      });
    }
  }

  async updateDocument(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
        return;
      }

      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const document = await documentService.updateDocument(
        req.params.documentId,
        req.body,
        req.user.organizationId,
        {
          userId: req.user.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      );

      res.json({
        success: true,
        message: 'Document updated successfully',
        data: {
          id: document.id,
          title: document.title,
          description: document.description,
          category: document.category,
          tags: document.tags ? JSON.parse(document.tags) : [],
          isPublic: document.isPublic,
          accessLevel: document.accessLevel,
          retentionDate: document.retentionDate,
          updatedAt: document.updatedAt
        }
      });
    } catch (error: any) {
      console.error('Error updating document:', error);
      if (error.message === 'Document not found') {
        res.status(404).json({ error: error.message });
      } else {
        res.status(500).json({
          error: 'Failed to update document',
          message: error.message
        });
      }
    }
  }

  async deleteDocument(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
        return;
      }

      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const permanent = req.query.permanent === 'true';

      await documentService.deleteDocument(
        req.params.documentId,
        req.user.organizationId,
        {
          userId: req.user.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        },
        permanent
      );

      res.json({
        success: true,
        message: permanent ? 'Document permanently deleted' : 'Document deleted successfully'
      });
    } catch (error: any) {
      console.error('Error deleting document:', error);
      if (error.message === 'Document not found') {
        res.status(404).json({ error: error.message });
      } else {
        res.status(500).json({
          error: 'Failed to delete document',
          message: error.message
        });
      }
    }
  }

  async downloadDocument(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const result = await documentService.downloadDocument(
        req.params.documentId,
        req.user.organizationId,
        {
          userId: req.user.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      );

      res.setHeader('Content-Type', result.document.mimeType);
      res.setHeader('Content-Length', result.document.size);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${result.document.originalName}"`
      );

      res.send(result.fileBuffer);
    } catch (error: any) {
      console.error('Error downloading document:', error);
      if (error.message === 'Document not found') {
        res.status(404).json({ error: error.message });
      } else {
        res.status(500).json({
          error: 'Failed to download document',
          message: error.message
        });
      }
    }
  }

  async createVersion(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
      }

      const documentData = {
        title: req.body.title,
        description: req.body.description,
        category: req.body.category,
        tags: req.body.tags
      };

      const document = await documentService.createDocumentVersion(
        req.params.documentId,
        req.file,
        documentData,
        req.user.organizationId,
        {
          userId: req.user.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      );

      res.status(201).json({
        success: true,
        message: 'Document version created successfully',
        data: {
          id: document.id,
          version: document.version,
          parentId: document.parentId,
          isLatestVersion: document.isLatestVersion,
          createdAt: document.createdAt
        }
      });
    } catch (error: any) {
      console.error('Error creating document version:', error);
      res.status(500).json({
        error: 'Failed to create document version',
        message: error.message
      });
    }
  }

  async getVersions(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const versions = await documentService.getDocumentVersions(
        req.params.documentId,
        req.user.organizationId
      );

      const versionsData = versions.map(doc => ({
        id: doc.id,
        version: doc.version,
        parentId: doc.parentId,
        isLatestVersion: doc.isLatestVersion,
        title: doc.title,
        size: doc.size,
        mimeType: doc.mimeType,
        createdAt: doc.createdAt,
        uploadedBy: doc.uploadedById
      }));

      res.json({
        success: true,
        data: versionsData
      });
    } catch (error: any) {
      console.error('Error fetching document versions:', error);
      res.status(500).json({
        error: 'Failed to fetch document versions',
        message: error.message
      });
    }
  }

  async attachToEntity(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
        return;
      }

      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const document = await documentService.attachDocumentToEntity(
        req.params.documentId,
        req.body.entityType,
        req.body.entityId,
        req.user.organizationId,
        {
          userId: req.user.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      );

      res.json({
        success: true,
        message: 'Document attached to entity successfully',
        data: {
          id: document.id,
          entityType: document.entityType,
          entityId: document.entityId,
          updatedAt: document.updatedAt
        }
      });
    } catch (error: any) {
      console.error('Error attaching document to entity:', error);
      if (error.message === 'Document not found') {
        res.status(404).json({ error: error.message });
      } else {
        res.status(500).json({
          error: 'Failed to attach document to entity',
          message: error.message
        });
      }
    }
  }

  async getDocumentStats(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const stats = await documentService.getDocumentStats(
        req.user.organizationId,
        req.query.entityType as string,
        req.query.entityId as string
      );

      res.json({
        success: true,
        data: stats
      });
    } catch (error: any) {
      console.error('Error fetching document stats:', error);
      res.status(500).json({
        error: 'Failed to fetch document stats',
        message: error.message
      });
    }
  }
}

export const documentController = new DocumentController();