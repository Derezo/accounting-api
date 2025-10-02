// @ts-nocheck
import { PrismaClient } from '@prisma/client';
import { beforeAll, afterAll, beforeEach, describe, it, expect } from '@jest/globals';
import { encryptionService } from '@/services/encryption.service';
import { fieldEncryptionService } from '@/services/field-encryption.service';
import fs from 'fs/promises';
import path from 'path';

const prisma = new PrismaClient();

describe('Encryption Service Integration Tests', () => {
  let organizationId: string;
  let userId: string;
  let testFilePath: string;
  let testFileBuffer: Buffer;

  beforeAll(async () => {
    // Create test organization
    const organization = await prisma.organization.create({
      data: {
        name: 'Test Encryption Org',
        type: 'SINGLE_BUSINESS',
        domain: 'encryption-test.com',
        email: 'encryptionorg@test.com',
        phone: '+1-555-0100',
        encryptionKey: 'test-encryption-key'
      }
    });
    organizationId = organization.id;

    // Create test user
    const user = await prisma.user.create({
      data: {
        email: 'encryptiontest@test.com',
        firstName: 'Encryption',
        lastName: 'Tester',
        passwordHash: 'hashedpassword',
        role: 'ADMIN',
        organizationId,
        isActive: true,
        emailVerified: true
      }
    });
    userId = user.id;

    // Prepare test file
    testFilePath = path.join(__dirname, '../fixtures/test-document.txt');
    testFileBuffer = await fs.readFile(testFilePath);
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.user.deleteMany({
      where: { organizationId }
    });
    await prisma.organization.deleteMany({
      where: { id: organizationId }
    });

    await prisma.$disconnect();
  });

  describe('Field-level Encryption', () => {
    it('should encrypt and decrypt text data', async () => {
      const originalText = 'Sensitive customer data: John Doe, SSN: 123-45-6789';

      const encrypted = await fieldEncryptionService.encryptField(originalText, {
        organizationId,
        keyVersion: 1
      });

      expect(encrypted).not.toBe(originalText);
      expect(encrypted).toContain(':'); // Contains IV separator

      const decrypted = await fieldEncryptionService.decryptField(encrypted, {
        organizationId,
        keyVersion: 1
      });

      expect(decrypted).toBe(originalText);
    });

    it('should encrypt and decrypt JSON data', async () => {
      const originalData = {
        customerInfo: {
          name: 'Jane Smith',
          ssn: '987-65-4321',
          creditCard: '4111-1111-1111-1111'
        },
        accountDetails: {
          balance: 1500.50,
          accountNumber: 'ACC-789123'
        }
      };

      const encrypted = await fieldEncryptionService.encryptField(
        JSON.stringify(originalData),
        {
          organizationId,
          keyVersion: 1
        }
      );

      expect(encrypted).not.toContain('Jane Smith');
      expect(encrypted).not.toContain('4111-1111-1111-1111');

      const decrypted = await fieldEncryptionService.decryptField(encrypted, {
        organizationId,
        keyVersion: 1
      });

      const decryptedData = JSON.parse(decrypted);
      expect(decryptedData).toEqual(originalData);
    });

    it('should encrypt and decrypt buffer data', async () => {
      const encrypted = await fieldEncryptionService.encryptBuffer(testFileBuffer, {
        organizationId,
        keyVersion: 1
      });

      expect(encrypted).not.toEqual(testFileBuffer);
      expect(encrypted.length).toBeGreaterThan(testFileBuffer.length); // Due to IV and auth tag

      const decrypted = await fieldEncryptionService.decryptBuffer(encrypted, {
        organizationId,
        keyVersion: 1
      });

      expect(decrypted).toEqual(testFileBuffer);
    });

    it('should handle searchable encryption', async () => {
      const email = 'customer@example.com';
      const phone = '+1-555-123-4567';

      const encryptedEmail = await fieldEncryptionService.encryptSearchableField(email, {
        organizationId,
        keyVersion: 1
      });

      const encryptedPhone = await fieldEncryptionService.encryptSearchableField(phone, {
        organizationId,
        keyVersion: 1
      });

      expect(encryptedEmail).not.toBe(email);
      expect(encryptedPhone).not.toBe(phone);

      // Should be able to generate same hash for search
      const searchHashEmail = await fieldEncryptionService.generateSearchHash(email, {
        organizationId,
        keyVersion: 1
      });

      const searchHashPhone = await fieldEncryptionService.generateSearchHash(phone, {
        organizationId,
        keyVersion: 1
      });

      expect(searchHashEmail).toBeTruthy();
      expect(searchHashPhone).toBeTruthy();
      expect(searchHashEmail).not.toBe(email);
      expect(searchHashPhone).not.toBe(phone);
    });

    it('should enforce organization isolation', async () => {
      // Create second organization
      const org2 = await prisma.organization.create({
        data: {
          name: 'Second Org',
          type: 'SINGLE_BUSINESS',
          domain: 'second-org.com'
        }
      });

      const testData = 'Cross-organization test data';

      // Encrypt with first organization
      const encrypted = await fieldEncryptionService.encryptField(testData, {
        organizationId,
        keyVersion: 1
      });

      // Attempt to decrypt with second organization should fail
      await expect(
        fieldEncryptionService.decryptField(encrypted, {
          organizationId: org2.id,
          keyVersion: 1
        })
      ).rejects.toThrow();

      // Clean up
      await prisma.organization.delete({
        where: { id: org2.id }
      });
    });
  });

  describe('Document Encryption', () => {
    it('should generate document encryption keys', async () => {
      const key1 = await encryptionService.generateDocumentKey(organizationId);
      const key2 = await encryptionService.generateDocumentKey(organizationId);

      expect(key1).toBeTruthy();
      expect(key2).toBeTruthy();
      expect(key1).toBe(key2); // Should be deterministic for same organization
      expect(typeof key1).toBe('string');
    });

    it('should encrypt and decrypt document content', async () => {
      const documentId = `test-doc-${Date.now()}`;

      const encrypted = await encryptionService.encryptDocumentContent(
        testFileBuffer,
        organizationId,
        documentId
      );

      expect(encrypted).not.toEqual(testFileBuffer);
      expect(encrypted.length).toBeGreaterThan(testFileBuffer.length);

      const decrypted = await encryptionService.decryptDocumentContent(
        encrypted,
        organizationId,
        documentId
      );

      expect(decrypted).toEqual(testFileBuffer);

      // Verify content integrity
      const originalContent = testFileBuffer.toString('utf8');
      const decryptedContent = decrypted.toString('utf8');
      expect(decryptedContent).toBe(originalContent);
    });

    it('should handle large binary files', async () => {
      // Create a larger test buffer (simulate a binary file)
      const largeBuffer = Buffer.alloc(1024 * 1024, 'A'); // 1MB of 'A' characters
      const documentId = `large-doc-${Date.now()}`;

      const encrypted = await encryptionService.encryptDocumentContent(
        largeBuffer,
        organizationId,
        documentId
      );

      expect(encrypted.length).toBeGreaterThan(largeBuffer.length);

      const decrypted = await encryptionService.decryptDocumentContent(
        encrypted,
        organizationId,
        documentId
      );

      expect(decrypted).toEqual(largeBuffer);
    });

    it('should prevent cross-document decryption', async () => {
      const doc1Id = 'document-1';
      const doc2Id = 'document-2';
      const testData = Buffer.from('Secret document content');

      // Encrypt with doc1 context
      const encrypted = await encryptionService.encryptDocumentContent(
        testData,
        organizationId,
        doc1Id
      );

      // Attempt to decrypt with doc2 context should fail
      await expect(
        encryptionService.decryptDocumentContent(
          encrypted,
          organizationId,
          doc2Id
        )
      ).rejects.toThrow();
    });
  });

  describe('Key Management', () => {
    it('should handle key versioning', async () => {
      const testData = 'Version test data';

      // Encrypt with version 1
      const encryptedV1 = await fieldEncryptionService.encryptField(testData, {
        organizationId,
        keyVersion: 1
      });

      // Encrypt with version 2 (if supported)
      const encryptedV2 = await fieldEncryptionService.encryptField(testData, {
        organizationId,
        keyVersion: 2
      });

      // Both should decrypt correctly with their respective versions
      const decryptedV1 = await fieldEncryptionService.decryptField(encryptedV1, {
        organizationId,
        keyVersion: 1
      });

      const decryptedV2 = await fieldEncryptionService.decryptField(encryptedV2, {
        organizationId,
        keyVersion: 2
      });

      expect(decryptedV1).toBe(testData);
      expect(decryptedV2).toBe(testData);
      expect(encryptedV1).not.toBe(encryptedV2); // Different versions should produce different ciphertext
    });

    it('should validate key material security', async () => {
      const key = await encryptionService.generateDocumentKey(organizationId);

      // Key should be sufficiently long for AES-256
      expect(key.length).toBeGreaterThan(32); // Base64 encoded 256-bit key

      // Key should be base64 encoded
      expect(() => Buffer.from(key, 'base64')).not.toThrow();

      // Decoded key should be 32 bytes for AES-256
      const decodedKey = Buffer.from(key, 'base64');
      expect(decodedKey.length).toBe(32);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle empty data gracefully', async () => {
      const emptyText = '';
      const emptyBuffer = Buffer.alloc(0);

      // Text encryption
      const encryptedText = await fieldEncryptionService.encryptField(emptyText, {
        organizationId,
        keyVersion: 1
      });
      const decryptedText = await fieldEncryptionService.decryptField(encryptedText, {
        organizationId,
        keyVersion: 1
      });
      expect(decryptedText).toBe(emptyText);

      // Buffer encryption
      const encryptedBuffer = await fieldEncryptionService.encryptBuffer(emptyBuffer, {
        organizationId,
        keyVersion: 1
      });
      const decryptedBuffer = await fieldEncryptionService.decryptBuffer(encryptedBuffer, {
        organizationId,
        keyVersion: 1
      });
      expect(decryptedBuffer).toEqual(emptyBuffer);
    });

    it('should reject invalid ciphertext', async () => {
      const invalidCiphertext = 'invalid:base64:data';

      await expect(
        fieldEncryptionService.decryptField(invalidCiphertext, {
          organizationId,
          keyVersion: 1
        })
      ).rejects.toThrow();
    });

    it('should reject tampered ciphertext', async () => {
      const originalData = 'Important data';
      const encrypted = await fieldEncryptionService.encryptField(originalData, {
        organizationId,
        keyVersion: 1
      });

      // Tamper with the ciphertext
      const tamperedEncrypted = encrypted.substring(0, encrypted.length - 4) + 'XXXX';

      await expect(
        fieldEncryptionService.decryptField(tamperedEncrypted, {
          organizationId,
          keyVersion: 1
        })
      ).rejects.toThrow();
    });

    it('should handle special characters and unicode', async () => {
      const unicodeData = 'Special chars: àáâãäåæçèéêë 你好 🔐🔑 ñáéíóú';

      const encrypted = await fieldEncryptionService.encryptField(unicodeData, {
        organizationId,
        keyVersion: 1
      });

      const decrypted = await fieldEncryptionService.decryptField(encrypted, {
        organizationId,
        keyVersion: 1
      });

      expect(decrypted).toBe(unicodeData);
    });
  });

  describe('Performance and Concurrency', () => {
    it('should handle concurrent encryption operations', async () => {
      const testData = Array.from({ length: 10 }, (_, i) => `Test data ${i}`);

      // Encrypt all data concurrently
      const encryptPromises = testData.map(data =>
        fieldEncryptionService.encryptField(data, {
          organizationId,
          keyVersion: 1
        })
      );

      const encrypted = await Promise.all(encryptPromises);

      // Decrypt all data concurrently
      const decryptPromises = encrypted.map(cipher =>
        fieldEncryptionService.decryptField(cipher, {
          organizationId,
          keyVersion: 1
        })
      );

      const decrypted = await Promise.all(decryptPromises);

      // Verify all data was processed correctly
      expect(decrypted).toEqual(testData);
    });

    it('should maintain performance for bulk operations', async () => {
      const bulkData = Array.from({ length: 100 }, (_, i) => `Bulk test data item ${i}`);

      const startTime = Date.now();

      const encryptPromises = bulkData.map(data =>
        fieldEncryptionService.encryptField(data, {
          organizationId,
          keyVersion: 1
        })
      );

      await Promise.all(encryptPromises);

      const encryptionTime = Date.now() - startTime;

      // Should complete bulk operations in reasonable time (adjust threshold as needed)
      expect(encryptionTime).toBeLessThan(5000); // 5 seconds for 100 operations
    });
  });
});