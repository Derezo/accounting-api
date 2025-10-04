import { PrismaClient } from '@prisma/client';
import { AuditService } from '../../src/services/audit.service';
import { AuditAction } from '../../src/types/enums';
import { prisma } from '../setup';

describe('AuditService', () => {
  let auditService: AuditService;
  let testOrganizationId: string;
  let testUserId: string;

  beforeEach(async () => {
    auditService = new AuditService();

    // Create test organization
    const organization = await prisma.organization.create({
      data: {
        name: 'Test Audit Company',
        email: 'test@auditcompany.com',
        phone: '+1-555-0399',
        encryptionKey: 'test-key-audit-123',
      },
    });
    testOrganizationId = organization.id;

    // Create test user
    const user = await prisma.user.create({
      data: {
        organizationId: testOrganizationId,
        email: 'audituser@test.com',
        passwordHash: 'hashed-password',
        firstName: 'Audit',
        lastName: 'User',
        role: 'ACCOUNTANT',
      },
    });
    testUserId = user.id;
  });

  describe('logAction', () => {
    it('should create audit log for CREATE action', async () => {
      const auditData = {
        action: AuditAction.CREATE,
        entityType: 'CUSTOMER',
        entityId: 'customer-123',
        changes: {
          name: 'New Customer',
          email: 'customer@test.com',
        },
        context: {
          userId: testUserId,
          organizationId: testOrganizationId,
          ipAddress: '192.168.1.100',
          userAgent: 'Test Browser',
          requestId: 'req-123',
        },
      };

      await auditService.logAction(auditData);

      // Verify audit log was created
      const auditLogs = await prisma.auditLog.findMany({
        where: {
          organizationId: testOrganizationId,
          entityType: 'CUSTOMER',
          entityId: 'customer-123',
        },
      });

      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0].action).toBe(AuditAction.CREATE);
      expect(auditLogs[0].entityType).toBe('CUSTOMER');
      expect(auditLogs[0].entityId).toBe('customer-123');
      expect(auditLogs[0].userId).toBe(testUserId);
      expect(auditLogs[0].organizationId).toBe(testOrganizationId);
      expect(auditLogs[0].ipAddress).toBe('192.168.1.100');
      expect(auditLogs[0].userAgent).toBe('Test Browser');
      expect(auditLogs[0].requestId).toBe('req-123');
    });

    it('should handle UPDATE actions with changes', async () => {
      const auditData = {
        action: AuditAction.UPDATE,
        entityType: 'USER',
        entityId: testUserId,
        changes: {
          before: { firstName: 'Old Name', isActive: true },
          after: { firstName: 'New Name', isActive: true },
        },
        context: {
          userId: testUserId,
          organizationId: testOrganizationId,
        },
      };

      await auditService.logAction(auditData);

      const auditLogs = await prisma.auditLog.findMany({
        where: {
          action: AuditAction.UPDATE,
          entityId: testUserId,
        },
      });

      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0].action).toBe(AuditAction.UPDATE);
      expect(auditLogs[0].changes).toBeDefined();

      const changes = JSON.parse(auditLogs[0].changes!);
      expect(changes.before.firstName).toBe('Old Name');
      expect(changes.after.firstName).toBe('New Name');
    });

    it('should handle DELETE actions', async () => {
      const auditData = {
        action: AuditAction.DELETE,
        entityType: 'DOCUMENT',
        entityId: 'doc-123',
        changes: {
          deletedData: {
            title: 'Deleted Document',
            category: 'INVOICE',
          },
        },
        context: {
          userId: testUserId,
          organizationId: testOrganizationId,
        },
      };

      await auditService.logAction(auditData);

      const auditLogs = await prisma.auditLog.findMany({
        where: {
          action: AuditAction.DELETE,
          entityId: 'doc-123',
        },
      });

      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0].action).toBe(AuditAction.DELETE);
      expect(auditLogs[0].entityType).toBe('DOCUMENT');
    });

    it('should handle VIEW actions for sensitive data access', async () => {
      const auditData = {
        action: AuditAction.VIEW,
        entityType: 'PAYMENT',
        entityId: 'payment-123',
        changes: {
          accessedFields: ['amount', 'accountNumber'],
          accessReason: 'Financial report generation',
        },
        context: {
          userId: testUserId,
          organizationId: testOrganizationId,
          ipAddress: '10.0.0.50',
        },
      };

      await auditService.logAction(auditData);

      const auditLogs = await prisma.auditLog.findMany({
        where: {
          action: AuditAction.VIEW,
          entityType: 'PAYMENT',
        },
      });

      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0].action).toBe(AuditAction.VIEW);
      expect(auditLogs[0].ipAddress).toBe('10.0.0.50');
    });

    it('should handle LOGIN/LOGOUT actions', async () => {
      const loginData = {
        action: AuditAction.LOGIN,
        entityType: 'USER_SESSION',
        entityId: `session-${testUserId}`,
        changes: {
          loginMethod: 'email_password',
          sessionDuration: null,
        },
        context: {
          userId: testUserId,
          organizationId: testOrganizationId,
          ipAddress: '203.0.113.1',
          userAgent: 'Mozilla/5.0 Chrome/91.0',
        },
      };

      await auditService.logAction(loginData);

      const logoutData = {
        action: AuditAction.LOGOUT,
        entityType: 'USER_SESSION',
        entityId: `session-${testUserId}`,
        changes: {
          sessionDuration: 3600, // 1 hour
          reason: 'user_initiated',
        },
        context: {
          userId: testUserId,
          organizationId: testOrganizationId,
          ipAddress: '203.0.113.1',
        },
      };

      await auditService.logAction(logoutData);

      const sessionLogs = await prisma.auditLog.findMany({
        where: {
          entityType: 'USER_SESSION',
          entityId: `session-${testUserId}`,
        },
        orderBy: { timestamp: 'asc' },
      });

      expect(sessionLogs).toHaveLength(2);
      expect(sessionLogs[0].action).toBe(AuditAction.LOGIN);
      expect(sessionLogs[1].action).toBe(AuditAction.LOGOUT);
    });

    it('should work without optional context fields', async () => {
      const minimalData = {
        action: AuditAction.CREATE,
        entityType: 'ACCOUNT',
        entityId: 'account-456',
        context: {
          organizationId: testOrganizationId,
          // No userId, ipAddress, userAgent, or requestId
        },
      };

      await auditService.logAction(minimalData);

      const auditLogs = await prisma.auditLog.findMany({
        where: {
          entityId: 'account-456',
        },
      });

      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0].userId).toBeNull();
      expect(auditLogs[0].ipAddress).toBeNull();
      expect(auditLogs[0].userAgent).toBeNull();
      expect(auditLogs[0].requestId).toBeNull();
      expect(auditLogs[0].organizationId).toBe(testOrganizationId);
    });

    it('should handle large changes objects', async () => {
      const largeChanges = {
        oldData: {
          field1: 'value1'.repeat(100),
          field2: 'value2'.repeat(100),
          field3: Array.from({ length: 50 }, (_, i) => `item${i}`),
        },
        newData: {
          field1: 'newvalue1'.repeat(100),
          field2: 'newvalue2'.repeat(100),
          field3: Array.from({ length: 75 }, (_, i) => `newitem${i}`),
        },
      };

      const auditData = {
        action: AuditAction.UPDATE,
        entityType: 'COMPLEX_ENTITY',
        entityId: 'complex-123',
        changes: largeChanges,
        context: {
          userId: testUserId,
          organizationId: testOrganizationId,
        },
      };

      await auditService.logAction(auditData);

      const auditLogs = await prisma.auditLog.findMany({
        where: {
          entityId: 'complex-123',
        },
      });

      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0].changes).toBeDefined();

      const retrievedChanges = JSON.parse(auditLogs[0].changes!);
      expect(retrievedChanges.oldData.field1).toContain('value1');
      expect(retrievedChanges.newData.field1).toContain('newvalue1');
    });

    it('should not throw errors on audit failures', async () => {
      // This tests the try-catch behavior mentioned in the service
      const invalidData = {
        action: AuditAction.CREATE,
        entityType: 'TEST',
        entityId: 'test-123',
        context: {
          organizationId: 'invalid-org-id', // This might cause a foreign key error
        },
      };

      // Should not throw even if audit logging fails
      await expect(auditService.logAction(invalidData)).resolves.not.toThrow();
    });
  });

  describe('getAuditLogs', () => {
    beforeEach(async () => {
      // Create some test audit logs
      const testActions = [
        { action: AuditAction.CREATE, entityType: 'CUSTOMER', entityId: 'cust-1' },
        { action: AuditAction.UPDATE, entityType: 'CUSTOMER', entityId: 'cust-1' },
        { action: AuditAction.VIEW, entityType: 'CUSTOMER', entityId: 'cust-1' },
        { action: AuditAction.CREATE, entityType: 'INVOICE', entityId: 'inv-1' },
        { action: AuditAction.DELETE, entityType: 'DOCUMENT', entityId: 'doc-1' },
      ];

      for (const actionData of testActions) {
        await auditService.logAction({
          ...actionData,
          context: {
            userId: testUserId,
            organizationId: testOrganizationId,
          },
        });
      }
    });

    it('should retrieve audit logs for organization', async () => {
      const logs = await auditService.getAuditLogs(testOrganizationId);

      expect(logs).toHaveLength(5);
      expect(logs.every(log => log.organizationId === testOrganizationId)).toBe(true);
    });

    it('should filter by entity type', async () => {
      const logs = await auditService.getAuditLogs(testOrganizationId, {
        entityType: 'CUSTOMER',
      });

      expect(logs).toHaveLength(3); // CREATE, UPDATE, VIEW for customer
      expect(logs.every(log => log.entityType === 'CUSTOMER')).toBe(true);
    });

    it('should filter by entity ID', async () => {
      const logs = await auditService.getAuditLogs(testOrganizationId, {
        entityId: 'cust-1',
      });

      expect(logs).toHaveLength(3); // All customer actions
      expect(logs.every(log => log.entityId === 'cust-1')).toBe(true);
    });

    it('should filter by action type', async () => {
      const logs = await auditService.getAuditLogs(testOrganizationId, {
        action: AuditAction.CREATE,
      });

      expect(logs).toHaveLength(2); // Customer and Invoice creates
      expect(logs.every(log => log.action === AuditAction.CREATE)).toBe(true);
    });

    it('should filter by user ID', async () => {
      const logs = await auditService.getAuditLogs(testOrganizationId, {
        userId: testUserId,
      });

      expect(logs).toHaveLength(5); // All logs are from this user
      expect(logs.every(log => log.userId === testUserId)).toBe(true);
    });

    it('should filter by date range', async () => {
      const startDate = new Date();
      startDate.setHours(0, 0, 0, 0); // Start of today

      const endDate = new Date();
      endDate.setHours(23, 59, 59, 999); // End of today

      const logs = await auditService.getAuditLogs(testOrganizationId, {
        startDate,
        endDate,
      });

      expect(logs).toHaveLength(5); // All logs created today
      expect(logs.every(log => {
        const logDate = new Date(log.timestamp);
        return logDate >= startDate && logDate <= endDate;
      })).toBe(true);
    });

    it('should combine multiple filters', async () => {
      const logs = await auditService.getAuditLogs(testOrganizationId, {
        entityType: 'CUSTOMER',
        action: AuditAction.CREATE,
        userId: testUserId,
      });

      expect(logs).toHaveLength(1); // Only CREATE action for CUSTOMER by this user
      expect(logs[0].action).toBe(AuditAction.CREATE);
      expect(logs[0].entityType).toBe('CUSTOMER');
      expect(logs[0].userId).toBe(testUserId);
    });

    it('should order logs by creation date descending', async () => {
      const logs = await auditService.getAuditLogs(testOrganizationId);

      expect(logs).toHaveLength(5);

      // Check that logs are ordered by timestamp DESC
      for (let i = 1; i < logs.length; i++) {
        const prevDate = new Date(logs[i - 1].timestamp);
        const currDate = new Date(logs[i].timestamp);
        expect(prevDate.getTime()).toBeGreaterThanOrEqual(currDate.getTime());
      }
    });

    it('should limit results when specified', async () => {
      const logs = await auditService.getAuditLogs(testOrganizationId, { limit: 3 });

      expect(logs).toHaveLength(3); // Limited to 3 results
    });

    it('should not return logs from other organizations', async () => {
      // Create another organization
      const otherOrg = await prisma.organization.create({
        data: {
          name: 'Other Audit Company',
          email: 'other@audit.com',
          phone: '+1-555-0400',
          encryptionKey: 'other-key-456',
        },
      });

      // Create audit log for other organization
      await auditService.logAction({
        action: AuditAction.CREATE,
        entityType: 'OTHER_ENTITY',
        entityId: 'other-123',
        context: {
          organizationId: otherOrg.id,
        },
      });

      const logs = await auditService.getAuditLogs(testOrganizationId);

      expect(logs).toHaveLength(5); // Should still only return original 5 logs
      expect(logs.every(log => log.organizationId === testOrganizationId)).toBe(true);
    });
  });

  describe('data integrity', () => {
    it('should preserve exact change data', async () => {
      const originalData = {
        stringField: 'test string',
        numberField: 42,
        booleanField: true,
        nullField: null,
        objectField: { nested: 'value' },
        arrayField: [1, 2, 3],
        dateField: new Date('2024-01-15T10:30:00Z'),
      };

      await auditService.logAction({
        action: AuditAction.UPDATE,
        entityType: 'TEST_ENTITY',
        entityId: 'test-integrity',
        changes: originalData,
        context: {
          organizationId: testOrganizationId,
        },
      });

      const logs = await auditService.getAuditLogs(testOrganizationId, {
        entityId: 'test-integrity',
      });

      expect(logs).toHaveLength(1);
      const retrievedData = JSON.parse(logs[0].changes);

      expect(retrievedData.stringField).toBe(originalData.stringField);
      expect(retrievedData.numberField).toBe(originalData.numberField);
      expect(retrievedData.booleanField).toBe(originalData.booleanField);
      expect(retrievedData.nullField).toBe(originalData.nullField);
      expect(retrievedData.objectField).toEqual(originalData.objectField);
      expect(retrievedData.arrayField).toEqual(originalData.arrayField);
      expect(new Date(retrievedData.dateField)).toEqual(originalData.dateField);
    });

    it('should handle special characters and unicode', async () => {
      const specialData = {
        unicode: '测试数据 🚀 émojis',
        specialChars: 'Special: !@#$%^&*()_+-=[]{}|;:,.<>?',
        quotes: 'Single \' and double " quotes',
        backslashes: 'Path\\to\\file',
        newlines: 'Line 1\nLine 2\r\nLine 3',
      };

      await auditService.logAction({
        action: AuditAction.CREATE,
        entityType: 'SPECIAL_CHARS',
        entityId: 'special-test',
        changes: specialData,
        context: {
          organizationId: testOrganizationId,
        },
      });

      const logs = await auditService.getAuditLogs(testOrganizationId, {
        entityId: 'special-test',
      });

      expect(logs).toHaveLength(1);
      const retrievedData = JSON.parse(logs[0].changes);

      expect(retrievedData.unicode).toBe(specialData.unicode);
      expect(retrievedData.specialChars).toBe(specialData.specialChars);
      expect(retrievedData.quotes).toBe(specialData.quotes);
      expect(retrievedData.backslashes).toBe(specialData.backslashes);
      expect(retrievedData.newlines).toBe(specialData.newlines);
    });
  });
});