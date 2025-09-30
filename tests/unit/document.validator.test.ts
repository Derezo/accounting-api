import {
  validateDocumentUpload,
  validateDocumentUpdate,
  validateDocumentFilters,
  validateDocumentAttach,
  validateDocumentStats,
  validateBulkUpload
} from '../../src/validators/document.validator';
import { Request, Response, NextFunction } from 'express';
import { DocumentCategory, AccessLevel } from '../../src/types/enums';

describe('Document Validator', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let nextFunction: NextFunction;

  beforeEach(() => {
    mockRequest = {};
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    nextFunction = jest.fn();
  });

  describe('validateDocumentUpload', () => {
    it('should validate valid document upload', () => {
      mockRequest.file = {
        originalname: 'test.pdf',
        mimetype: 'application/pdf',
        size: 1024
      } as any;

      mockRequest.body = {
        title: 'Test Document',
        description: 'Test description',
        category: DocumentCategory.INVOICE,
        tags: ['tag1', 'tag2'],
        entityType: 'invoice',
        entityId: '123',
        isPublic: 'false',
        isEncrypted: 'true',
        accessLevel: AccessLevel.PRIVATE,
        retentionDate: '2024-12-31T00:00:00.000Z'
      };

      validateDocumentUpload(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should reject upload without file', () => {
      mockRequest.body = {
        category: DocumentCategory.INVOICE
      };

      validateDocumentUpload(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'File is required',
        message: 'Please upload a file'
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should reject upload with invalid category', () => {
      mockRequest.file = {
        originalname: 'test.pdf',
        mimetype: 'application/pdf',
        size: 1024
      } as any;

      mockRequest.body = {
        category: 'INVALID_CATEGORY'
      };

      validateDocumentUpload(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Validation failed',
        details: expect.arrayContaining([
          expect.objectContaining({
            field: 'body.category',
            message: expect.stringContaining('Invalid enum value')
          })
        ])
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should transform boolean string values correctly', () => {
      mockRequest.file = {
        originalname: 'test.pdf',
        mimetype: 'application/pdf',
        size: 1024
      } as any;

      mockRequest.body = {
        category: DocumentCategory.INVOICE,
        isPublic: 'true',
        isEncrypted: 'false'
      };

      validateDocumentUpload(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
      expect(mockRequest.body.isPublic).toBe(true);
      expect(mockRequest.body.isEncrypted).toBe(false);
    });

    it('should transform tags array correctly', () => {
      mockRequest.file = {
        originalname: 'test.pdf',
        mimetype: 'application/pdf',
        size: 1024
      } as any;

      mockRequest.body = {
        category: DocumentCategory.INVOICE,
        tags: ['single-tag']
      };

      validateDocumentUpload(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
      expect(mockRequest.body.tags).toEqual(['single-tag']);
    });

    it('should handle malformed request data', () => {
      mockRequest.file = {
        originalname: 'test.pdf',
        mimetype: 'application/pdf',
        size: 1024
      } as any;

      // Create a malformed request that will cause parsing to throw
      mockRequest.body = null;

      validateDocumentUpload(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Validation failed',
        details: expect.arrayContaining([
          expect.objectContaining({
            field: 'body',
            message: expect.stringContaining('Expected object')
          })
        ])
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });
  });

  describe('validateDocumentUpdate', () => {
    it('should validate valid document update', () => {
      mockRequest.body = {
        title: 'Updated Document',
        description: 'Updated description',
        category: DocumentCategory.CONTRACT,
        tags: ['updated-tag'],
        isPublic: false,
        accessLevel: AccessLevel.RESTRICTED,
        retentionDate: '2025-01-01T00:00:00.000Z'
      };

      validateDocumentUpdate(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should reject empty title', () => {
      mockRequest.body = {
        title: '',
        category: DocumentCategory.INVOICE
      };

      validateDocumentUpdate(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Validation failed',
        details: expect.arrayContaining([
          expect.objectContaining({
            field: 'body.title',
            message: 'Title cannot be empty'
          })
        ])
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should allow partial updates', () => {
      mockRequest.body = {
        title: 'Just Title Update'
      };

      validateDocumentUpdate(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should validate invalid access level', () => {
      mockRequest.body = {
        accessLevel: 'INVALID_ACCESS_LEVEL'
      };

      validateDocumentUpdate(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Validation failed',
        details: expect.arrayContaining([
          expect.objectContaining({
            field: 'body.accessLevel',
            message: expect.stringContaining('Invalid enum value')
          })
        ])
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });
  });

  describe('validateDocumentFilters', () => {
    it('should validate valid document filters', () => {
      mockRequest.query = {
        category: DocumentCategory.INVOICE,
        entityType: 'customer',
        entityId: '123',
        tags: ['tax', 'important'],
        isPublic: 'true',
        accessLevel: AccessLevel.PUBLIC,
        search: 'test query',
        startDate: '2023-01-01T00:00:00.000Z',
        endDate: '2023-12-31T23:59:59.000Z',
        limit: '25',
        offset: '10'
      };

      validateDocumentFilters(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
      expect(mockRequest.query.limit).toBe(25);
      expect(mockRequest.query.offset).toBe(10);
      expect(mockRequest.query.isPublic).toBe(true);
    });

    it('should apply default values', () => {
      mockRequest.query = {};

      validateDocumentFilters(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
      expect(mockRequest.query.limit).toBe(50);
      expect(mockRequest.query.offset).toBe(0);
    });

    it('should transform string tags to array', () => {
      mockRequest.query = {
        tags: 'single-tag'
      };

      validateDocumentFilters(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
      expect(mockRequest.query.tags).toEqual(['single-tag']);
    });

    it('should reject invalid limit values', () => {
      mockRequest.query = {
        limit: '0' // Below minimum
      };

      validateDocumentFilters(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Validation failed',
        details: expect.arrayContaining([
          expect.objectContaining({
            field: 'query.limit',
            message: expect.stringContaining('greater than or equal to 1')
          })
        ])
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should reject limit over maximum', () => {
      mockRequest.query = {
        limit: '101' // Above maximum
      };

      validateDocumentFilters(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Validation failed'
        })
      );
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should reject negative offset', () => {
      mockRequest.query = {
        offset: '-1'
      };

      validateDocumentFilters(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Validation failed'
        })
      );
      expect(nextFunction).not.toHaveBeenCalled();
    });
  });

  describe('validateDocumentAttach', () => {
    it('should validate valid attach request', () => {
      mockRequest.body = {
        entityType: 'customer',
        entityId: 'customer-123'
      };

      validateDocumentAttach(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should reject missing entityType', () => {
      mockRequest.body = {
        entityId: 'customer-123'
      };

      validateDocumentAttach(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Validation failed',
        details: expect.arrayContaining([
          expect.objectContaining({
            field: 'body.entityType',
            message: expect.stringContaining('Required')
          })
        ])
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should reject empty entityType', () => {
      mockRequest.body = {
        entityType: '',
        entityId: 'customer-123'
      };

      validateDocumentAttach(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Validation failed',
        details: expect.arrayContaining([
          expect.objectContaining({
            field: 'body.entityType',
            message: 'Entity type is required'
          })
        ])
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should reject missing entityId', () => {
      mockRequest.body = {
        entityType: 'customer'
      };

      validateDocumentAttach(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Validation failed',
        details: expect.arrayContaining([
          expect.objectContaining({
            field: 'body.entityId',
            message: expect.stringContaining('Required')
          })
        ])
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });
  });

  describe('validateDocumentStats', () => {
    it('should validate valid stats request', () => {
      mockRequest.query = {
        entityType: 'invoice',
        entityId: 'invoice-123'
      };

      validateDocumentStats(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should validate empty stats request', () => {
      mockRequest.query = {};

      validateDocumentStats(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });
  });

  describe('validateBulkUpload', () => {
    it('should validate valid bulk upload', () => {
      mockRequest.files = [
        { originalname: 'doc1.pdf', mimetype: 'application/pdf', size: 1024 },
        { originalname: 'doc2.pdf', mimetype: 'application/pdf', size: 2048 }
      ] as any[];

      mockRequest.body = {
        category: DocumentCategory.CONTRACT,
        entityType: 'project',
        entityId: 'project-123',
        isPublic: 'false',
        isEncrypted: 'true',
        accessLevel: AccessLevel.PRIVATE
      };

      validateBulkUpload(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
      expect(mockRequest.body.isPublic).toBe(false);
      expect(mockRequest.body.isEncrypted).toBe(true);
    });

    it('should reject bulk upload without files', () => {
      mockRequest.files = [];
      mockRequest.body = {
        category: DocumentCategory.CONTRACT
      };

      validateBulkUpload(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Files are required',
        message: 'Please upload at least one file'
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should reject bulk upload when files is not an array', () => {
      mockRequest.files = 'not-an-array' as any;
      mockRequest.body = {
        category: DocumentCategory.CONTRACT
      };

      validateBulkUpload(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Files are required',
        message: 'Please upload at least one file'
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should reject bulk upload with missing category', () => {
      mockRequest.files = [
        { originalname: 'doc1.pdf', mimetype: 'application/pdf', size: 1024 }
      ] as any[];

      mockRequest.body = {
        entityType: 'project'
      };

      validateBulkUpload(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Validation failed',
        details: expect.arrayContaining([
          expect.objectContaining({
            field: 'body.category',
            message: expect.stringContaining('Required')
          })
        ])
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should reject bulk upload with invalid category', () => {
      mockRequest.files = [
        { originalname: 'doc1.pdf', mimetype: 'application/pdf', size: 1024 }
      ] as any[];

      mockRequest.body = {
        category: 'INVALID_CATEGORY'
      };

      validateBulkUpload(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Validation failed',
        details: expect.arrayContaining([
          expect.objectContaining({
            field: 'body.category',
            message: expect.stringContaining('Invalid enum value')
          })
        ])
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle unexpected errors in document upload validation', () => {
      mockRequest.file = {
        originalname: 'test.pdf',
        mimetype: 'application/pdf',
        size: 1024
      } as any;

      // Mock a request structure that will cause an error in safeParse
      Object.defineProperty(mockRequest, 'body', {
        get: () => {
          throw new Error('Getter error');
        },
        enumerable: true,
        configurable: true
      });

      validateDocumentUpload(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Validation error',
        message: 'Invalid request data'
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should handle unexpected errors in document update validation', () => {
      // Mock a request structure that will cause an error in safeParse
      Object.defineProperty(mockRequest, 'body', {
        get: () => {
          throw new Error('Getter error');
        },
        enumerable: true,
        configurable: true
      });

      validateDocumentUpdate(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Validation error',
        message: 'Invalid request data'
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should handle unexpected errors in document filters validation', () => {
      // Mock a request structure that will cause an error in safeParse
      Object.defineProperty(mockRequest, 'query', {
        get: () => {
          throw new Error('Getter error');
        },
        enumerable: true,
        configurable: true
      });

      validateDocumentFilters(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Validation error',
        message: 'Invalid query parameters'
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should handle unexpected errors in document attach validation', () => {
      // Mock a request structure that will cause an error in safeParse
      Object.defineProperty(mockRequest, 'body', {
        get: () => {
          throw new Error('Getter error');
        },
        enumerable: true,
        configurable: true
      });

      validateDocumentAttach(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Validation error',
        message: 'Invalid request data'
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should handle unexpected errors in document stats validation', () => {
      // Mock a request structure that will cause an error in safeParse
      Object.defineProperty(mockRequest, 'query', {
        get: () => {
          throw new Error('Getter error');
        },
        enumerable: true,
        configurable: true
      });

      validateDocumentStats(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Validation error',
        message: 'Invalid query parameters'
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should handle unexpected errors in bulk upload validation', () => {
      mockRequest.files = [
        { originalname: 'doc1.pdf', mimetype: 'application/pdf', size: 1024 }
      ] as any[];

      // Mock a request structure that will cause an error in safeParse
      Object.defineProperty(mockRequest, 'body', {
        get: () => {
          throw new Error('Getter error');
        },
        enumerable: true,
        configurable: true
      });

      validateBulkUpload(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Validation error',
        message: 'Invalid request data'
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });
  });

  describe('transformation logic', () => {
    it('should correctly transform date strings', () => {
      mockRequest.file = {
        originalname: 'test.pdf',
        mimetype: 'application/pdf',
        size: 1024
      } as any;

      mockRequest.body = {
        category: DocumentCategory.INVOICE,
        retentionDate: '2024-12-31T23:59:59.000Z'
      };

      validateDocumentUpload(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
      expect(mockRequest.body.retentionDate).toBeInstanceOf(Date);
    });

    it('should handle empty date strings', () => {
      mockRequest.file = {
        originalname: 'test.pdf',
        mimetype: 'application/pdf',
        size: 1024
      } as any;

      mockRequest.body = {
        category: DocumentCategory.INVOICE,
        retentionDate: ''
      };

      validateDocumentUpload(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
      expect(mockRequest.body.retentionDate).toBeUndefined();
    });
  });
});