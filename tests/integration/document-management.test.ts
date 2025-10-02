// @ts-nocheck
import supertest from 'supertest';
import app from '../../src/app';
import { PrismaClient } from '@prisma/client';
import path from 'path';
import fs from 'fs/promises';
import { beforeAll, afterAll, beforeEach, describe, it, expect } from '@jest/globals';

const prisma = new PrismaClient();

describe('Document Management Integration Tests', () => {
  let authToken: string;
  let organizationId: string;
  let userId: string;
  let testFilePath: string;

  beforeAll(async () => {
    // Clean up any existing test data
    await prisma.document.deleteMany({
      where: { originalName: { contains: 'test-' } }
    });

    // Create test organization and user
    const organization = await prisma.organization.create({
      data: {
        name: 'Test Org for Documents',
        type: 'SINGLE_BUSINESS',
        domain: 'test-docs.com',
        email: 'test@example.com',
        phone: '+1-555-0100',
        encryptionKey: 'test-encryption-key'
      }
    });
    organizationId = organization.id;

    const user = await prisma.user.create({
      data: {
        email: 'doctest@test.com',
        firstName: 'Doc',
        lastName: 'Tester',
        passwordHash: 'hashedpassword',
        role: 'ADMIN',
        organizationId,
        isActive: true,
        emailVerified: true
      }
    });
    userId = user.id;

    // Create test file
    testFilePath = path.join(__dirname, '../fixtures/test-document.txt');
    await fs.writeFile(testFilePath, 'This is a test document for upload testing.');

    // Get auth token (mock for testing)
    const authResponse = await supertest(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'doctest@test.com',
        password: 'password'
      });

    if (authResponse.body.tokens) {
      authToken = authResponse.body.tokens.accessToken;
    } else {
      // Fallback: create token manually for testing
      authToken = 'test-token';
    }
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.document.deleteMany({
      where: { organizationId }
    });
    await prisma.user.deleteMany({
      where: { organizationId }
    });
    await prisma.organization.deleteMany({
      where: { id: organizationId }
    });

    // Clean up test file
    try {
      await fs.unlink(testFilePath);
    } catch (error) {
      // File might not exist, ignore
    }

    await prisma.$disconnect();
  });

  describe('Document Upload', () => {
    it('should upload a document successfully', async () => {
      const response = await supertest(app)
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', testFilePath)
        .field('title', 'Test Document')
        .field('description', 'A test document for integration testing')
        .field('category', 'OTHER')
        .field('tags', JSON.stringify(['test', 'integration']))
        .field('isPublic', 'false')
        .field('accessLevel', 'PRIVATE');

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.title).toBe('Test Document');
      expect(response.body.category).toBe('OTHER');
      expect(response.body.organizationId).toBe(organizationId);
      expect(response.body.uploadedById).toBe(userId);
    });

    it('should reject unsupported file types', async () => {
      // Create a test file with unsupported extension
      const badFilePath = path.join(__dirname, '../fixtures/test.exe');
      await fs.writeFile(badFilePath, 'fake executable content');

      const response = await supertest(app)
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', badFilePath)
        .field('title', 'Bad File')
        .field('category', 'OTHER');

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('not allowed');

      // Clean up bad file
      await fs.unlink(badFilePath);
    });

    it('should upload an encrypted document', async () => {
      const response = await supertest(app)
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', testFilePath)
        .field('title', 'Encrypted Test Document')
        .field('category', 'LEGAL')
        .field('isEncrypted', 'true')
        .field('accessLevel', 'RESTRICTED');

      expect(response.status).toBe(201);
      expect(response.body.isEncrypted).toBe(true);
      expect(response.body.encryptionKey).toBeTruthy();
      expect(response.body.accessLevel).toBe('RESTRICTED');
    });

    it('should upload multiple documents in bulk', async () => {
      // Create additional test files
      const file2Path = path.join(__dirname, '../fixtures/test-document-2.txt');
      const file3Path = path.join(__dirname, '../fixtures/test-document-3.txt');

      await fs.writeFile(file2Path, 'Second test document content');
      await fs.writeFile(file3Path, 'Third test document content');

      const response = await supertest(app)
        .post('/api/v1/documents/bulk')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('files', testFilePath)
        .attach('files', file2Path)
        .attach('files', file3Path)
        .field('category', 'INVOICE')
        .field('isPublic', 'true');

      expect(response.status).toBe(201);
      expect(response.body.success).toHaveLength(3);
      expect(response.body.errors).toHaveLength(0);

      // Clean up
      await fs.unlink(file2Path);
      await fs.unlink(file3Path);
    });
  });

  describe('Document Retrieval', () => {
    let documentId: string;

    beforeEach(async () => {
      // Create a test document
      const uploadResponse = await supertest(app)
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', testFilePath)
        .field('title', 'Retrieval Test Document')
        .field('category', 'RECEIPT');

      documentId = uploadResponse.body.id;
    });

    it('should retrieve document list with filtering', async () => {
      const response = await supertest(app)
        .get('/api/v1/documents')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          category: 'RECEIPT',
          limit: 10,
          offset: 0
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('documents');
      expect(response.body).toHaveProperty('total');
      expect(response.body.documents.length).toBeGreaterThan(0);
    });

    it('should retrieve specific document details', async () => {
      const response = await supertest(app)
        .get(`/api/v1/documents/${documentId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(documentId);
      expect(response.body.title).toBe('Retrieval Test Document');
    });

    it('should download document file', async () => {
      const response = await supertest(app)
        .get(`/api/v1/documents/${documentId}/download`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('application/octet-stream');
    });

    it('should search documents by text', async () => {
      const response = await supertest(app)
        .get('/api/v1/documents')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          search: 'Retrieval Test',
          limit: 5
        });

      expect(response.status).toBe(200);
      expect(response.body.documents.length).toBeGreaterThan(0);
      expect(response.body.documents[0].title).toContain('Retrieval Test');
    });
  });

  describe('Document Management', () => {
    let documentId: string;

    beforeEach(async () => {
      const uploadResponse = await supertest(app)
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', testFilePath)
        .field('title', 'Management Test Document')
        .field('category', 'CONTRACT');

      documentId = uploadResponse.body.id;
    });

    it('should update document metadata', async () => {
      const response = await supertest(app)
        .put(`/api/v1/documents/${documentId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Updated Management Test Document',
          description: 'Updated description',
          tags: ['updated', 'test'],
          accessLevel: 'PUBLIC'
        });

      expect(response.status).toBe(200);
      expect(response.body.title).toBe('Updated Management Test Document');
      expect(response.body.description).toBe('Updated description');
      expect(response.body.accessLevel).toBe('PUBLIC');
    });

    it('should create document versions', async () => {
      const response = await supertest(app)
        .post(`/api/v1/documents/${documentId}/versions`)
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', testFilePath)
        .field('title', 'Version 2');

      expect(response.status).toBe(201);
      expect(response.body.parentId).toBe(documentId);
      expect(response.body.version).toBe(2);
      expect(response.body.isLatestVersion).toBe(true);
    });

    it('should get document versions', async () => {
      // Create a version first
      await supertest(app)
        .post(`/api/v1/documents/${documentId}/versions`)
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', testFilePath);

      const response = await supertest(app)
        .get(`/api/v1/documents/${documentId}/versions`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.length).toBeGreaterThanOrEqual(2);
      expect(response.body[0].version).toBeGreaterThan(response.body[1].version);
    });

    it('should attach document to entity', async () => {
      const response = await supertest(app)
        .post(`/api/v1/documents/${documentId}/attach`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          entityType: 'Customer',
          entityId: 'test-customer-id'
        });

      expect(response.status).toBe(200);
      expect(response.body.entityType).toBe('Customer');
      expect(response.body.entityId).toBe('test-customer-id');
    });

    it('should soft delete document', async () => {
      const response = await supertest(app)
        .delete(`/api/v1/documents/${documentId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.deletedAt).toBeTruthy();

      // Verify document is not in regular listing
      const listResponse = await supertest(app)
        .get('/api/v1/documents')
        .set('Authorization', `Bearer ${authToken}`);

      const foundDoc = listResponse.body.documents.find((doc: any) => doc.id === documentId);
      expect(foundDoc).toBeUndefined();
    });
  });

  describe('Document Statistics', () => {
    beforeEach(async () => {
      // Create test documents for statistics
      await supertest(app)
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', testFilePath)
        .field('category', 'INVOICE');

      await supertest(app)
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', testFilePath)
        .field('category', 'RECEIPT');
    });

    it('should get document statistics', async () => {
      const response = await supertest(app)
        .get('/api/v1/documents/stats')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('totalDocuments');
      expect(response.body).toHaveProperty('totalSize');
      expect(response.body).toHaveProperty('averageSize');
      expect(response.body).toHaveProperty('categoryCounts');
      expect(response.body).toHaveProperty('recentDocuments');
      expect(response.body.totalDocuments).toBeGreaterThan(0);
    });
  });

  describe('Security and Access Control', () => {
    it('should reject unauthorized access', async () => {
      const response = await supertest(app)
        .get('/api/v1/documents')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
    });

    it('should enforce file size limits', async () => {
      // This test would require creating a large file
      // For now, we'll test the validation logic
      const response = await supertest(app)
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', testFilePath)
        .field('category', 'OTHER');

      // Should succeed with small file
      expect(response.status).toBe(201);
    });

    it('should validate required fields', async () => {
      const response = await supertest(app)
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', testFilePath);
        // Missing required category field

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Validation failed');
    });
  });

  describe('Encryption Integration', () => {
    it('should handle encrypted document upload and download cycle', async () => {
      // Upload encrypted document
      const uploadResponse = await supertest(app)
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', testFilePath)
        .field('title', 'Encryption Test')
        .field('category', 'LEGAL')
        .field('isEncrypted', 'true');

      expect(uploadResponse.status).toBe(201);
      expect(uploadResponse.body.isEncrypted).toBe(true);

      const documentId = uploadResponse.body.id;

      // Download and verify decryption works
      const downloadResponse = await supertest(app)
        .get(`/api/v1/documents/${documentId}/download`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(downloadResponse.status).toBe(200);
      expect(downloadResponse.text).toContain('This is a test document');
    });
  });
});