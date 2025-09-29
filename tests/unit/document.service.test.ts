import { PrismaClient } from '@prisma/client';
import { DocumentService } from '../../src/services/document.service';
import { DocumentCategory, ProcessingStatus, AccessLevel } from '../../src/types/enums';
import { prisma } from '../setup';
import fs from 'fs/promises';
import path from 'path';

describe('DocumentService', () => {
  let documentService: DocumentService;
  let testOrganizationId: string;
  let testUserId: string;

  beforeEach(async () => {
    documentService = new DocumentService();

    // Create test organization
    const organization = await prisma.organization.create({
      data: {
        name: 'Test Document Company',
        email: 'test@doccompany.com',
        phone: '+1-555-0299',
        encryptionKey: 'test-key-doc-123',
      },
    });
    testOrganizationId = organization.id;

    // Create test user
    const user = await prisma.user.create({
      data: {
        organizationId: testOrganizationId,
        email: 'docuser@test.com',
        passwordHash: 'hashed-password',
        firstName: 'Doc',
        lastName: 'User',
        role: 'ACCOUNTANT',
      },
    });
    testUserId = user.id;
  });

  describe('uploadDocument', () => {
    it('should create a new document with basic metadata', async () => {
      const documentData = {
        title: 'Test Invoice',
        description: 'Test invoice document',
        category: DocumentCategory.INVOICE,
        tags: ['test', 'invoice'],
        isPublic: false,
        accessLevel: AccessLevel.PRIVATE,
      };

      const mockFile = {
        fieldname: 'file',
        originalname: 'test-invoice.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        size: 1024,
        destination: '/tmp',
        filename: 'test-invoice.pdf',
        path: '/tmp/test-invoice.pdf',
        buffer: Buffer.from('test pdf content'),
        stream: {} as any
      } as Express.Multer.File;

      const result = await documentService.uploadDocument(
        mockFile,
        documentData,
        testOrganizationId,
        { userId: testUserId }
      );

      expect(result).toBeDefined();
      expect(result.title).toBe('Test Invoice');
      expect(result.description).toBe('Test invoice document');
      expect(result.category).toBe(DocumentCategory.INVOICE);
      expect(result.organizationId).toBe(testOrganizationId);
      expect(result.uploadedById).toBe(testUserId);
      expect(result.isPublic).toBe(false);
      expect(result.accessLevel).toBe(AccessLevel.PRIVATE);
      expect(result.filename).toBe('test-invoice.pdf');
      expect(result.mimeType).toBe('application/pdf');
      expect(result.size).toBe(1024);
    });

    it('should handle different document categories', async () => {
      const categories = [
        DocumentCategory.INVOICE,
        DocumentCategory.RECEIPT,
        DocumentCategory.CONTRACT,
        DocumentCategory.TAX_DOCUMENT,
        DocumentCategory.FINANCIAL_STATEMENT,
        DocumentCategory.OTHER,
      ];

      for (let i = 0; i < categories.length; i++) {
        const mockFile = {
          originalname: `test-doc-${i}.pdf`,
          mimetype: 'application/pdf',
          size: 1024,
          buffer: Buffer.from(`test content ${i}`),
          path: `/tmp/test-doc-${i}.pdf`,
        };

        const result = await documentService.uploadDocument(
          testOrganizationId,
          testUserId,
          {
            title: `Test Document ${i}`,
            category: categories[i],
          },
          mockFile
        );

        expect(result.category).toBe(categories[i]);
        expect(result.title).toBe(`Test Document ${i}`);
      }
    });

    it('should set processing status to pending initially', async () => {
      const mockFile = {
        originalname: 'processing-test.pdf',
        mimetype: 'application/pdf',
        size: 2048,
        buffer: Buffer.from('processing test content'),
        path: '/tmp/processing-test.pdf',
      };

      const result = await documentService.uploadDocument(
        testOrganizationId,
        testUserId,
        {
          title: 'Processing Test',
          category: DocumentCategory.OTHER,
        },
        mockFile
      );

      expect(result.processingStatus).toBe(ProcessingStatus.PENDING);
    });

    it('should handle entity linking', async () => {
      const mockFile = {
        originalname: 'linked-doc.pdf',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('linked document content'),
        path: '/tmp/linked-doc.pdf',
      };

      const result = await documentService.uploadDocument(
        testOrganizationId,
        testUserId,
        {
          title: 'Linked Document',
          category: DocumentCategory.INVOICE,
          entityType: 'customer',
          entityId: 'customer-123',
        },
        mockFile
      );

      expect(result.entityType).toBe('customer');
      expect(result.entityId).toBe('customer-123');
    });
  });

  describe('getDocument', () => {
    let testDocumentId: string;

    beforeEach(async () => {
      const mockFile = {
        originalname: 'retrieval-test.pdf',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('retrieval test content'),
        path: '/tmp/retrieval-test.pdf',
      };

      const document = await documentService.uploadDocument(
        testOrganizationId,
        testUserId,
        {
          title: 'Retrieval Test',
          category: DocumentCategory.RECEIPT,
        },
        mockFile
      );
      testDocumentId = document.id;
    });

    it('should retrieve document by ID', async () => {
      const result = await documentService.getDocument(testDocumentId);

      expect(result).toBeDefined();
      expect(result?.id).toBe(testDocumentId);
      expect(result?.title).toBe('Retrieval Test');
      expect(result?.category).toBe(DocumentCategory.RECEIPT);
    });

    it('should return null for non-existent document', async () => {
      const result = await documentService.getDocument('non-existent-id');

      expect(result).toBeNull();
    });

    it('should include metadata in retrieved document', async () => {
      const result = await documentService.getDocument(testDocumentId);

      expect(result).toBeDefined();
      expect(result?.filename).toBe('retrieval-test.pdf');
      expect(result?.mimeType).toBe('application/pdf');
      expect(result?.fileSize).toBe(1024);
      expect(result?.uploadedBy).toBe(testUserId);
      expect(result?.organizationId).toBe(testOrganizationId);
    });
  });

  describe('listDocuments', () => {
    beforeEach(async () => {
      // Create multiple documents with different categories and attributes
      const testDocuments = [
        { title: 'Invoice 1', category: DocumentCategory.INVOICE, isPublic: false },
        { title: 'Invoice 2', category: DocumentCategory.INVOICE, isPublic: true },
        { title: 'Receipt 1', category: DocumentCategory.RECEIPT, isPublic: false },
        { title: 'Contract 1', category: DocumentCategory.CONTRACT, isPublic: false },
        { title: 'Tax Doc 1', category: DocumentCategory.TAX_DOCUMENT, isPublic: true },
      ];

      for (const docData of testDocuments) {
        const mockFile = {
          originalname: `${docData.title.toLowerCase().replace(/\s+/g, '-')}.pdf`,
          mimetype: 'application/pdf',
          size: 1024,
          buffer: Buffer.from(`content for ${docData.title}`),
          path: `/tmp/${docData.title.toLowerCase().replace(/\s+/g, '-')}.pdf`,
        };

        await documentService.uploadDocument(
          testOrganizationId,
          testUserId,
          docData,
          mockFile
        );
      }
    });

    it('should return all documents for organization', async () => {
      const result = await documentService.listDocuments({}, testOrganizationId);

      expect(result.documents).toHaveLength(5);
      expect(result.documents.every(doc => doc.organizationId === testOrganizationId)).toBe(true);
      expect(result.total).toBe(5);
    });

    it('should filter by category', async () => {
      const result = await documentService.listDocuments({
        category: DocumentCategory.INVOICE,
      }, testOrganizationId);

      expect(result.documents).toHaveLength(2);
      expect(result.documents.every(doc => doc.category === DocumentCategory.INVOICE)).toBe(true);
      expect(result.total).toBe(2);
    });

    it('should filter by public status', async () => {
      const result = await documentService.listDocuments({
        isPublic: true,
      }, testOrganizationId);

      expect(result.documents).toHaveLength(2); // Invoice 2 and Tax Doc 1
      expect(result.documents.every(doc => doc.isPublic === true)).toBe(true);
      expect(result.total).toBe(2);
    });

    it('should filter by entity type', async () => {
      // First create a document with entity linking
      const mockFile = {
        originalname: 'customer-doc.pdf',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('customer document'),
        path: '/tmp/customer-doc.pdf',
      };

      await documentService.uploadDocument(
        testOrganizationId,
        testUserId,
        {
          title: 'Customer Document',
          category: DocumentCategory.OTHER,
          entityType: 'customer',
          entityId: 'cust-123',
        },
        mockFile
      );

      const result = await documentService.listDocuments({
        entityType: 'customer',
      }, testOrganizationId);

      expect(result.documents).toHaveLength(1);
      expect(result.documents[0].entityType).toBe('customer');
      expect(result.documents[0].entityId).toBe('cust-123');
      expect(result.total).toBe(1);
    });
  });

  describe('updateDocument', () => {
    let testDocumentId: string;

    beforeEach(async () => {
      const mockFile = {
        originalname: 'update-test.pdf',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('update test content'),
        path: '/tmp/update-test.pdf',
      };

      const document = await documentService.uploadDocument(
        testOrganizationId,
        testUserId,
        {
          title: 'Update Test',
          category: DocumentCategory.OTHER,
          description: 'Original description',
        },
        mockFile
      );
      testDocumentId = document.id;
    });

    it('should update document title', async () => {
      const result = await documentService.updateDocument(testDocumentId, {
        title: 'Updated Title',
      });

      expect(result.title).toBe('Updated Title');
      expect(result.description).toBe('Original description'); // Should remain unchanged
    });

    it('should update document description', async () => {
      const result = await documentService.updateDocument(testDocumentId, {
        description: 'Updated description',
      });

      expect(result.description).toBe('Updated description');
      expect(result.title).toBe('Update Test'); // Should remain unchanged
    });

    it('should update document category', async () => {
      const result = await documentService.updateDocument(testDocumentId, {
        category: DocumentCategory.INVOICE,
      });

      expect(result.category).toBe(DocumentCategory.INVOICE);
    });

    it('should update document tags', async () => {
      const result = await documentService.updateDocument(testDocumentId, {
        tags: ['updated', 'test', 'document'],
      });

      expect(result.tags).toEqual(['updated', 'test', 'document']);
    });

    it('should update processing status', async () => {
      const result = await documentService.updateDocument(testDocumentId, {
        processingStatus: ProcessingStatus.COMPLETED,
      });

      expect(result.processingStatus).toBe(ProcessingStatus.COMPLETED);
    });

    it('should reject updates to non-existent documents', async () => {
      await expect(documentService.updateDocument('non-existent-id', {
        title: 'Updated Title',
      })).rejects.toThrow();
    });
  });

  describe('deleteDocument', () => {
    let testDocumentId: string;

    beforeEach(async () => {
      const mockFile = {
        originalname: 'delete-test.pdf',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('delete test content'),
        path: '/tmp/delete-test.pdf',
      };

      const document = await documentService.uploadDocument(
        testOrganizationId,
        testUserId,
        {
          title: 'Delete Test',
          category: DocumentCategory.OTHER,
        },
        mockFile
      );
      testDocumentId = document.id;
    });

    it('should soft delete document', async () => {
      await documentService.deleteDocument(testDocumentId);

      // Document should not appear in normal queries
      const result = await documentService.getDocument(testDocumentId);
      expect(result).toBeNull();

      // But should still exist in database with deletedAt set
      const deletedDoc = await prisma.document.findUnique({
        where: { id: testDocumentId },
      });
      expect(deletedDoc).toBeDefined();
      expect(deletedDoc?.deletedAt).toBeDefined();
    });

    it('should not affect other documents', async () => {
      const mockFile = {
        originalname: 'other-doc.pdf',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('other document content'),
        path: '/tmp/other-doc.pdf',
      };

      const otherDoc = await documentService.uploadDocument(
        testOrganizationId,
        testUserId,
        {
          title: 'Other Document',
          category: DocumentCategory.OTHER,
        },
        mockFile
      );

      await documentService.deleteDocument(testDocumentId);

      // Other document should still be accessible
      const result = await documentService.getDocument(otherDoc.id);
      expect(result).toBeDefined();
      expect(result?.title).toBe('Other Document');
    });
  });

  describe('file handling', () => {
    it('should handle different file types', async () => {
      const fileTypes = [
        { name: 'test.pdf', mime: 'application/pdf' },
        { name: 'test.jpg', mime: 'image/jpeg' },
        { name: 'test.png', mime: 'image/png' },
        { name: 'test.csv', mime: 'text/csv' },
        { name: 'test.xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
      ];

      for (const fileType of fileTypes) {
        const mockFile = {
          originalname: fileType.name,
          mimetype: fileType.mime,
          size: 1024,
          buffer: Buffer.from(`content for ${fileType.name}`),
          path: `/tmp/${fileType.name}`,
        };

        const result = await documentService.uploadDocument(
          testOrganizationId,
          testUserId,
          {
            title: `Test ${fileType.name}`,
            category: DocumentCategory.OTHER,
          },
          mockFile
        );

        expect(result.filename).toBe(fileType.name);
        expect(result.mimeType).toBe(fileType.mime);
      }
    });

    it('should generate file hash for integrity checking', async () => {
      const mockFile = {
        originalname: 'hash-test.pdf',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('hash test content'),
        path: '/tmp/hash-test.pdf',
      };

      const result = await documentService.uploadDocument(
        testOrganizationId,
        testUserId,
        {
          title: 'Hash Test',
          category: DocumentCategory.OTHER,
        },
        mockFile
      );

      expect(result.fileHash).toBeDefined();
      expect(result.fileHash).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hash pattern
    });
  });

  describe('access control', () => {
    it('should handle different access levels', async () => {
      const accessLevels = [
        AccessLevel.PUBLIC,
        AccessLevel.ORGANIZATION,
        AccessLevel.PRIVATE,
        AccessLevel.RESTRICTED,
      ];

      for (const accessLevel of accessLevels) {
        const mockFile = {
          originalname: `access-${accessLevel.toLowerCase()}.pdf`,
          mimetype: 'application/pdf',
          size: 1024,
          buffer: Buffer.from(`content for ${accessLevel}`),
          path: `/tmp/access-${accessLevel.toLowerCase()}.pdf`,
        };

        const result = await documentService.uploadDocument(
          testOrganizationId,
          testUserId,
          {
            title: `Access Level ${accessLevel}`,
            category: DocumentCategory.OTHER,
            accessLevel: accessLevel,
          },
          mockFile
        );

        expect(result.accessLevel).toBe(accessLevel);
      }
    });

    it('should default to organization access level', async () => {
      const mockFile = {
        originalname: 'default-access.pdf',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('default access content'),
        path: '/tmp/default-access.pdf',
      };

      const result = await documentService.uploadDocument(
        testOrganizationId,
        testUserId,
        {
          title: 'Default Access',
          category: DocumentCategory.OTHER,
          // No accessLevel specified
        },
        mockFile
      );

      expect(result.accessLevel).toBe(AccessLevel.ORGANIZATION);
    });
  });
});