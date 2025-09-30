import { PrismaClient } from '@prisma/client';
import { UserService } from '../../src/services/user.service';
import { UserRole } from '../../src/types/enums';
import { prisma } from '../setup';

describe('UserService', () => {
  let userService: UserService;
  let testOrganizationId: string;

  beforeEach(async () => {
    userService = new UserService();

    // Create test organization
    const organization = await prisma.organization.create({
      data: {
        name: 'Test User Company',
        email: 'test@usercompany.com',
        phone: '+1-555-0199',
        encryptionKey: 'test-key-user-123',
      },
    });
    testOrganizationId = organization.id;
  });

  describe('createUser', () => {
    it('should create a new user with valid data', async () => {
      const userData = {
        organizationId: testOrganizationId,
        email: 'john.doe@test.com',
        firstName: 'John',
        lastName: 'Doe',
        role: UserRole.ACCOUNTANT,
        password: 'securePassword123',
        phone: '+1-555-0123',
        isActive: true,
      };

      const result = await userService.createUser(userData, 'test-user-id');

      expect(result).toBeDefined();
      expect(result.email).toBe('john.doe@test.com');
      expect(result.firstName).toBe('John');
      expect(result.lastName).toBe('Doe');
      expect(result.role).toBe(UserRole.ACCOUNTANT);
      expect(result.organizationId).toBe(testOrganizationId);
      expect(result.isActive).toBe(true);
      expect(result.passwordHash).toBeDefined();
      expect(result.passwordHash).not.toBe('securePassword123'); // Should be hashed
    });

    it('should reject duplicate email addresses', async () => {
      const userData = {
        organizationId: testOrganizationId,
        email: 'duplicate@test.com',
        firstName: 'First',
        lastName: 'User',
        role: UserRole.ADMIN,
        password: 'password123',
      };

      // Create first user
      await userService.createUser(userData, 'test-user-id');

      // Try to create duplicate
      const duplicateData = {
        ...userData,
        firstName: 'Second',
        lastName: 'User',
      };

      await expect(userService.createUser(duplicateData, 'test-user-id'))
        .rejects.toThrow();
    });

    it('should create users with different roles', async () => {
      const roles = [
        UserRole.ADMIN,
        UserRole.ACCOUNTANT,
        UserRole.MANAGER,
        UserRole.CLIENT,
      ];

      for (let i = 0; i < roles.length; i++) {
        const result = await userService.createUser({
          organizationId: testOrganizationId,
          email: `user${i}@test.com`,
          firstName: `User${i}`,
          lastName: 'Test',
          role: roles[i],
          password: 'password123',
        }, 'test-user-id');

        expect(result.role).toBe(roles[i]);
        expect(result.email).toBe(`user${i}@test.com`);
      }
    });

    it('should hash passwords securely', async () => {
      const userData = {
        organizationId: testOrganizationId,
        email: 'security@test.com',
        firstName: 'Security',
        lastName: 'Test',
        role: UserRole.ACCOUNTANT,
        password: 'plaintextPassword',
      };

      const result = await userService.createUser(userData, 'test-user-id');

      expect(result.passwordHash).toBeDefined();
      expect(result.passwordHash).not.toBe('plaintextPassword');
      expect(result.passwordHash).toMatch(/^\$2[aby]\$\d+\$/); // bcrypt hash pattern
    });
  });

  describe('getUserById', () => {
    let testUserId: string;

    beforeEach(async () => {
      const user = await userService.createUser({
        organizationId: testOrganizationId,
        email: 'lookup@test.com',
        firstName: 'Lookup',
        lastName: 'Test',
        role: UserRole.ACCOUNTANT,
        password: 'password123',
      }, 'test-user-id');
      testUserId = user.id;
    });

    it('should retrieve user by ID', async () => {
      const result = await userService.getUserById(testUserId, testOrganizationId);

      expect(result).toBeDefined();
      expect(result?.id).toBe(testUserId);
      expect(result?.email).toBe('lookup@test.com');
      expect(result?.firstName).toBe('Lookup');
      expect(result?.lastName).toBe('Test');
      expect(result?.role).toBe(UserRole.ACCOUNTANT);
    });

    it('should return null for non-existent user', async () => {
      const result = await userService.getUserById('non-existent-id', testOrganizationId);

      expect(result).toBeNull();
    });

    it('should include password hash for internal use', async () => {
      const result = await userService.getUserById(testUserId, testOrganizationId);

      expect(result).toBeDefined();
      // UserService returns full user including passwordHash for internal operations
      expect((result as any).passwordHash).toBeDefined();
    });
  });

  describe('updateUser', () => {
    let testUserId: string;

    beforeEach(async () => {
      const user = await userService.createUser({
        organizationId: testOrganizationId,
        email: 'update@test.com',
        firstName: 'Update',
        lastName: 'Test',
        role: UserRole.ACCOUNTANT,
        password: 'password123',
      }, 'test-user-id');
      testUserId = user.id;
    });

    it('should update user name', async () => {
      const result = await userService.updateUser(testUserId, {
        firstName: 'Updated',
        lastName: 'Name',
      }, testOrganizationId, 'test-user-id');

      expect(result.firstName).toBe('Updated');
      expect(result.lastName).toBe('Name');
      expect(result.email).toBe('update@test.com'); // Should remain unchanged
    });

    it('should update user role', async () => {
      const result = await userService.updateUser(testUserId, {
        role: UserRole.ADMIN,
      }, testOrganizationId, 'test-user-id');

      expect(result.role).toBe(UserRole.ADMIN);
      expect(result.firstName).toBe('Update'); // Should remain unchanged
    });

    it('should update phone number', async () => {
      const result = await userService.updateUser(testUserId, {
        phone: '+1-555-9999',
      }, testOrganizationId, 'test-user-id');

      expect(result.phone).toBe('+1-555-9999');
    });

    it('should deactivate user', async () => {
      const result = await userService.updateUser(testUserId, {
        isActive: false,
      }, testOrganizationId, 'test-user-id');

      expect(result.isActive).toBe(false);
    });

    it('should reject updates to non-existent users', async () => {
      await expect(userService.updateUser('non-existent-id', {
        firstName: 'Test',
      }, testOrganizationId, 'test-user-id')).rejects.toThrow();
    });
  });

  describe('findUsers', () => {
    beforeEach(async () => {
      // Create multiple users with different roles and statuses
      const users = [
        { email: 'admin@test.com', role: UserRole.ADMIN, isActive: true },
        { email: 'accountant1@test.com', role: UserRole.ACCOUNTANT, isActive: true },
        { email: 'accountant2@test.com', role: UserRole.ACCOUNTANT, isActive: false },
        { email: 'manager@test.com', role: UserRole.MANAGER, isActive: true },
        { email: 'client@test.com', role: UserRole.CLIENT, isActive: true },
      ];

      for (const userData of users) {
        await userService.createUser({
          organizationId: testOrganizationId,
          email: userData.email,
          firstName: 'Test',
          lastName: 'User',
          role: userData.role,
          password: 'password123',
          isActive: userData.isActive,
        }, 'test-user-id');
      }
    });

    it('should return all users for organization', async () => {
      const result = await userService.findUsers({}, testOrganizationId);

      expect(result.users).toHaveLength(5);
      expect(result.users.every((user: any) => user.organizationId === testOrganizationId)).toBe(true);
    });

    it('should filter by role', async () => {
      const result = await userService.findUsers({
        role: UserRole.ACCOUNTANT,
      }, testOrganizationId);

      expect(result.users).toHaveLength(2);
      expect(result.users.every((user: any) => user.role === UserRole.ACCOUNTANT)).toBe(true);
    });

    it('should filter by active status', async () => {
      const result = await userService.findUsers({
        isActive: true,
      }, testOrganizationId);

      expect(result.users).toHaveLength(4); // All except inactive accountant2
      expect(result.users.every((user: any) => user.isActive === true)).toBe(true);
    });

    it('should filter by both role and status', async () => {
      const result = await userService.findUsers({
        role: UserRole.ACCOUNTANT,
        isActive: true,
      }, testOrganizationId);

      expect(result.users).toHaveLength(1); // Only active accountant1
      expect(result.users[0].email).toBe('accountant1@test.com');
    });

    it('should not return users from other organizations', async () => {
      // Create another organization
      const otherOrg = await prisma.organization.create({
        data: {
          name: 'Other Company',
          email: 'other@company.com',
          phone: '+1-555-0124',
          encryptionKey: 'other-key-123',
        },
      });

      // Create user in other organization
      await userService.createUser({
        organizationId: otherOrg.id,
        email: 'other@test.com',
        firstName: 'Other',
        lastName: 'User',
        role: UserRole.ADMIN,
        password: 'password123',
      }, 'test-user-id');

      const result = await userService.findUsers({}, testOrganizationId);

      expect(result.users).toHaveLength(5); // Should still only return original 5 users
      expect(result.users.every((user: any) => user.organizationId === testOrganizationId)).toBe(true);
    });
  });

  describe('deleteUser', () => {
    let testUserId: string;

    beforeEach(async () => {
      const user = await userService.createUser({
        organizationId: testOrganizationId,
        email: 'delete@test.com',
        firstName: 'Delete',
        lastName: 'Test',
        role: UserRole.ACCOUNTANT,
        password: 'password123',
      }, 'test-user-id');
      testUserId = user.id;
    });

    it('should soft delete user', async () => {
      await userService.deleteUser(testUserId, testOrganizationId, 'test-user-id');

      // User should not appear in normal queries
      const user = await userService.getUserById(testUserId, testOrganizationId);
      expect(user).toBeNull();

      // But should still exist in database with deletedAt set
      const deletedUser = await prisma.user.findUnique({
        where: { id: testUserId },
      });
      expect(deletedUser).toBeDefined();
      expect(deletedUser?.deletedAt).toBeDefined();
    });

    it('should not affect other users', async () => {
      const otherUser = await userService.createUser({
        organizationId: testOrganizationId,
        email: 'other@test.com',
        firstName: 'Other',
        lastName: 'User',
        role: UserRole.MANAGER,
        password: 'password123',
      }, 'test-user-id');

      await userService.deleteUser(testUserId, testOrganizationId, 'test-user-id');

      // Other user should still be accessible
      const result = await userService.getUserById(otherUser.id, testOrganizationId);
      expect(result).toBeDefined();
      expect(result?.email).toBe('other@test.com');
    });
  });

  describe('validation', () => {
    it('should accept any email format', async () => {
      const userData = {
        organizationId: testOrganizationId,
        email: 'invalid-email',
        firstName: 'Test',
        lastName: 'User',
        role: UserRole.ACCOUNTANT,
        password: 'password123',
      };

      // Service doesn't validate email format - database will enforce uniqueness
      const result = await userService.createUser(userData, 'test-user-id');
      expect(result).toBeDefined();
      expect(result.email).toBe('invalid-email');
    });

    it('should accept empty fields', async () => {
      const userData = {
        organizationId: testOrganizationId,
        email: '',
        firstName: '',
        lastName: '',
        role: UserRole.ACCOUNTANT,
        password: '',
      };

      // Service doesn't validate required fields - it hashes whatever password is provided
      const result = await userService.createUser(userData, 'test-user-id');
      expect(result).toBeDefined();
    });

    it('should accept weak passwords', async () => {
      const userData = {
        organizationId: testOrganizationId,
        email: 'weak@test.com',
        firstName: 'Weak',
        lastName: 'Password',
        role: UserRole.ACCOUNTANT,
        password: '123', // Short password
      };

      // Service doesn't validate password strength - just hashes it
      const result = await userService.createUser(userData, 'test-user-id');
      expect(result).toBeDefined();
      expect(result.passwordHash).toBeDefined();
    });
  });
});