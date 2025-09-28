import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { organizationService } from '../../src/services/organization.service';
import { OrganizationType } from '../../src/types/enums';
import { prisma, createTestOrganization, createTestUser } from '../testUtils';

describe('OrganizationService', () => {
  let testUser: any;
  let testOrganization: any;

  beforeEach(async () => {
    // Create test organization for user FK constraint
    testOrganization = await createTestOrganization('Test Org for User');

    // Create test user for audit FK constraint
    testUser = await createTestUser(testOrganization.id, 'test@user.com');
  });

  afterEach(async () => {
    await prisma.$disconnect();
  });

  describe('createOrganization', () => {
    it('should create a new organization with valid data', async () => {
      const organizationData = {
        name: 'Test Organization',
        legalName: 'Test Organization LLC',
        domain: 'testorg.com',
        type: OrganizationType.SINGLE_BUSINESS,
        email: 'admin@testorg.com',
        phone: '+1-555-0123',
        website: 'https://testorg.com',
        businessNumber: 'BN123456789',
        taxNumber: 'TN987654321'
      };

      const auditContext = {
        userId: testUser.id,
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent'
      };

      const organization = await organizationService.createOrganization(
        organizationData,
        auditContext
      );

      expect(organization).toBeDefined();
      expect(organization.name).toBe(organizationData.name);
      expect(organization.legalName).toBe(organizationData.legalName);
      expect(organization.domain).toBe(organizationData.domain);
      expect(organization.type).toBe(organizationData.type);
      expect(organization.email).toBe(organizationData.email);
      expect(organization.phone).toBe(organizationData.phone);
      expect(organization.website).toBe(organizationData.website);
      expect(organization.businessNumber).toBe(organizationData.businessNumber);
      expect(organization.taxNumber).toBe(organizationData.taxNumber);
      expect(organization.isActive).toBe(true);
      expect(organization.encryptionKey).toBeDefined();
      expect(organization.encryptionKey.length).toBe(64); // 32 bytes in hex
    });

    it('should set default type when not provided', async () => {
      const organizationData = {
        name: 'Test Organization',
        email: 'admin@testorg.com',
        phone: '+1-555-0123'
      };

      const auditContext = {
        userId: testUser.id,
        ipAddress: '127.0.0.1'
      };

      const organization = await organizationService.createOrganization(
        organizationData,
        auditContext
      );

      expect(organization.type).toBe(OrganizationType.SINGLE_BUSINESS);
    });

    it('should create audit log entry', async () => {
      const organizationData = {
        name: 'Audit Test Org',
        email: 'audit@test.com',
        phone: '+1-555-0123'
      };

      const auditContext = {
        userId: testUser.id,
        ipAddress: '127.0.0.1'
      };

      const organization = await organizationService.createOrganization(
        organizationData,
        auditContext
      );

      const auditLogs = await prisma.auditLog.findMany({
        where: {
          organizationId: organization.id,
          entityType: 'Organization',
          action: 'CREATE'
        }
      });

      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0]?.entityId).toBe(organization.id);
    });
  });

  describe('getOrganization', () => {
    let testOrg: any;

    beforeEach(async () => {
      testOrg = await organizationService.createOrganization(
        {
          name: 'Get Test Org',
          email: 'get@test.com',
          phone: '+1-555-0123'
        },
        { userId: testUser.id }
      );
    });

    it('should retrieve organization by id when user belongs to org', async () => {
      const auditContext = {
        userId: testUser.id,
        ipAddress: '127.0.0.1'
      };

      const organization = await organizationService.getOrganization(
        testOrg.id,
        testOrg.id,
        auditContext
      );

      expect(organization).toBeDefined();
      expect(organization!.id).toBe(testOrg.id);
      expect(organization!.name).toBe('Get Test Org');
    });

    it('should return null when organization not found', async () => {
      const auditContext = {
        userId: testUser.id,
        ipAddress: '127.0.0.1'
      };

      const organization = await organizationService.getOrganization(
        'non-existent-id',
        testOrg.id,
        auditContext
      );

      expect(organization).toBeNull();
    });

    it('should create audit log for view action', async () => {
      const auditContext = {
        userId: testUser.id,
        ipAddress: '127.0.0.1'
      };

      await organizationService.getOrganization(
        testOrg.id,
        testOrg.id,
        auditContext
      );

      const auditLogs = await prisma.auditLog.findMany({
        where: {
          organizationId: testOrg.id,
          entityType: 'Organization',
          action: 'VIEW'
        }
      });

      expect(auditLogs.length).toBeGreaterThan(0);
    });
  });

  describe('updateOrganization', () => {
    let testOrg: any;

    beforeEach(async () => {
      testOrg = await organizationService.createOrganization(
        {
          name: 'Update Test Org',
          email: 'update@test.com',
          phone: '+1-555-0123'
        },
        { userId: testUser.id }
      );
    });

    it('should update organization when user has access', async () => {
      const updateData = {
        name: 'Updated Organization Name',
        email: 'updated@test.com',
        website: 'https://updated.com'
      };

      const auditContext = {
        userId: testUser.id,
        ipAddress: '127.0.0.1'
      };

      const updatedOrg = await organizationService.updateOrganization(
        testOrg.id,
        updateData,
        testOrg.id,
        auditContext
      );

      expect(updatedOrg.name).toBe(updateData.name);
      expect(updatedOrg.email).toBe(updateData.email);
      expect(updatedOrg.website).toBe(updateData.website);
      expect(updatedOrg.updatedAt.getTime()).toBeGreaterThan(testOrg.updatedAt.getTime());
    });

    it('should reject update when user does not have access', async () => {
      const updateData = { name: 'Unauthorized Update' };
      const auditContext = { userId: 'unauthorized-user' };

      await expect(
        organizationService.updateOrganization(
          testOrg.id,
          updateData,
          'different-org-id',
          auditContext
        )
      ).rejects.toThrow('Access denied');
    });

    it('should reject update when organization not found', async () => {
      const updateData = { name: 'Update Non-existent' };
      const auditContext = { userId: 'test-user' };

      await expect(
        organizationService.updateOrganization(
          'non-existent-id',
          updateData,
          'non-existent-id',
          auditContext
        )
      ).rejects.toThrow('Organization not found');
    });

    it('should create audit log for update action', async () => {
      const updateData = { name: 'Audit Update Test' };
      const auditContext = {
        userId: testUser.id,
        ipAddress: '127.0.0.1'
      };

      await organizationService.updateOrganization(
        testOrg.id,
        updateData,
        testOrg.id,
        auditContext
      );

      const auditLogs = await prisma.auditLog.findMany({
        where: {
          organizationId: testOrg.id,
          entityType: 'Organization',
          action: 'UPDATE'
        }
      });

      expect(auditLogs.length).toBeGreaterThan(0);
      const changes = JSON.parse(auditLogs[0]!.changes!);
      expect(changes.name.old).toBe('Update Test Org');
      expect(changes.name.new).toBe('Audit Update Test');
    });
  });

  describe('validateDomain', () => {
    beforeEach(async () => {
      await organizationService.createOrganization(
        {
          name: 'Domain Test Org',
          domain: 'existing.com',
          email: 'domain@test.com',
          phone: '+1-555-0123'
        },
        { userId: testUser.id }
      );
    });

    it('should return false for existing domain', async () => {
      const isValid = await organizationService.validateDomain('existing.com');
      expect(isValid).toBe(false);
    });

    it('should return true for new domain', async () => {
      const isValid = await organizationService.validateDomain('new-domain.com');
      expect(isValid).toBe(true);
    });

    it('should return true for existing domain when excluding same org', async () => {
      const org = await prisma.organization.findUnique({
        where: { domain: 'existing.com' }
      });

      const isValid = await organizationService.validateDomain('existing.com', org!.id);
      expect(isValid).toBe(true);
    });
  });

  describe('getOrganizationStats', () => {
    let testOrg: any;

    beforeEach(async () => {
      testOrg = await organizationService.createOrganization(
        {
          name: 'Stats Test Org',
          email: 'stats@test.com',
          phone: '+1-555-0123'
        },
        { userId: testUser.id }
      );
    });

    it('should return organization statistics', async () => {
      const stats = await organizationService.getOrganizationStats(
        testOrg.id,
        testOrg.id
      );

      expect(stats).toBeDefined();
      expect(typeof stats.users).toBe('number');
      expect(typeof stats.customers).toBe('number');
      expect(typeof stats.quotes).toBe('number');
      expect(typeof stats.invoices).toBe('number');
      expect(typeof stats.payments).toBe('number');
      expect(typeof stats.totalRevenue).toBe('number');
      expect(typeof stats.activeProjects).toBe('number');
    });

    it('should reject stats request when user does not have access', async () => {
      await expect(
        organizationService.getOrganizationStats(testOrg.id, 'different-org-id')
      ).rejects.toThrow('Access denied');
    });
  });

  describe('settings management', () => {
    let testOrg: any;

    beforeEach(async () => {
      testOrg = await organizationService.createOrganization(
        {
          name: 'Settings Test Org',
          email: 'settings@test.com',
          phone: '+1-555-0123'
        },
        { userId: testUser.id }
      );
    });

    it('should return empty object when no settings exist', async () => {
      const settings = await organizationService.getOrganizationSettings(
        testOrg.id,
        testOrg.id
      );

      expect(settings).toEqual({});
    });

    it('should update and retrieve settings', async () => {
      const newSettings = {
        defaultCurrency: 'USD',
        defaultTaxRate: 0.08,
        timezone: 'America/New_York'
      };

      const auditContext = {
        userId: testUser.id,
        ipAddress: '127.0.0.1'
      };

      const updatedSettings = await organizationService.updateOrganizationSettings(
        testOrg.id,
        newSettings,
        testOrg.id,
        auditContext
      );

      expect(updatedSettings).toEqual(newSettings);

      const retrievedSettings = await organizationService.getOrganizationSettings(
        testOrg.id,
        testOrg.id
      );

      expect(retrievedSettings).toEqual(newSettings);
    });

    it('should create audit log for settings update', async () => {
      const newSettings = { defaultCurrency: 'EUR' };
      const auditContext = {
        userId: testUser.id,
        ipAddress: '127.0.0.1'
      };

      await organizationService.updateOrganizationSettings(
        testOrg.id,
        newSettings,
        testOrg.id,
        auditContext
      );

      const auditLogs = await prisma.auditLog.findMany({
        where: {
          organizationId: testOrg.id,
          entityType: 'OrganizationSettings',
          action: 'UPDATE'
        }
      });

      expect(auditLogs.length).toBeGreaterThan(0);
    });
  });
});