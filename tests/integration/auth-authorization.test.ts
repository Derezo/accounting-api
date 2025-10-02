// @ts-nocheck
import { describe, test, expect, beforeEach } from '@jest/globals';
import { prisma, authenticatedRequest, baseRequest } from './setup';
import {
  createTestContext,
  createTestUser,
  generateAuthToken,
  delay,
  TestContext
} from './test-utils';
import { UserRole } from '../../src/types/enums';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

describe('Authentication and Authorization Integration Tests', () => {
  let testContext: TestContext;

  beforeEach(async () => {
    testContext = await createTestContext(prisma, 'Auth Test Org');
  });

  describe('JWT Authentication Flow', () => {
    test('should handle complete JWT lifecycle', async () => {
      const { organization } = testContext;

      // Step 1: User registration/login
      const loginResponse = await baseRequest()
        .post('/api/auth/login')
        .send({
          email: testContext.users.admin.email,
          password: 'password123' // This should match the test password
        })
        .expect(200);

      expect(loginResponse.body.token).toBeTruthy();
      expect(loginResponse.body.refreshToken).toBeTruthy();
      expect(loginResponse.body.user.organizationId).toBe(organization.id);

      const { token, refreshToken } = loginResponse.body;

      // Step 2: Use token to access protected endpoint
      const protectedResponse = await authenticatedRequest(token)
        .get('/api/customers')
        .expect(200);

      expect(protectedResponse.body).toBeDefined();

      // Step 3: Token refresh
      const refreshResponse = await baseRequest()
        .post('/api/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expect(refreshResponse.body.token).toBeTruthy();
      expect(refreshResponse.body.token).not.toBe(token); // Should be a new token

      // Step 4: Use refreshed token
      const newToken = refreshResponse.body.token;
      await authenticatedRequest(newToken)
        .get('/api/customers')
        .expect(200);

      // Step 5: Logout (invalidate tokens)
      await authenticatedRequest(token)
        .post('/api/auth/logout')
        .expect(200);

      // Step 6: Verify old token is invalidated
      await authenticatedRequest(token)
        .get('/api/customers')
        .expect(401); // Unauthorized

      console.log('✅ JWT lifecycle test completed');
    });

    test('should handle token expiry correctly', async () => {
      const { users } = testContext;

      // Create an expired token
      const expiredToken = jwt.sign(
        {
          userId: users.admin.id,
          organizationId: users.admin.organizationId,
          role: users.admin.role,
          email: users.admin.email
        },
        process.env.JWT_SECRET || 'test-secret',
        { expiresIn: '-1h' } // Expired 1 hour ago
      );

      // Attempt to use expired token
      await authenticatedRequest(expiredToken)
        .get('/api/customers')
        .expect(401);

      console.log('✅ Token expiry test completed');
    });

    test('should handle invalid tokens', async () => {
      // Test with malformed token
      await authenticatedRequest('invalid.token.here')
        .get('/api/customers')
        .expect(401);

      // Test with missing token
      await baseRequest()
        .get('/api/customers')
        .expect(401);

      // Test with token for non-existent user
      const fakeToken = jwt.sign(
        {
          userId: 'non-existent-user-id',
          organizationId: testContext.organization.id,
          role: UserRole.ADMIN,
          email: 'fake@test.com'
        },
        process.env.JWT_SECRET || 'test-secret',
        { expiresIn: '1h' }
      );

      await authenticatedRequest(fakeToken)
        .get('/api/customers')
        .expect(401);

      console.log('✅ Invalid token tests completed');
    });
  });

  describe('Role-Based Access Control (RBAC)', () => {
    test('should enforce SUPER_ADMIN permissions', async () => {
      // Create SUPER_ADMIN user
      const superAdmin = await createTestUser(
        prisma,
        testContext.organization.id,
        UserRole.SUPER_ADMIN,
        'superadmin@test.com'
      );
      const superAdminToken = generateAuthToken(superAdmin);

      // SUPER_ADMIN should access everything
      await authenticatedRequest(superAdminToken)
        .get('/api/organizations')
        .expect(200);

      await authenticatedRequest(superAdminToken)
        .get('/api/users')
        .expect(200);

      await authenticatedRequest(superAdminToken)
        .get('/api/customers')
        .expect(200);

      await authenticatedRequest(superAdminToken)
        .get('/api/audit-logs')
        .expect(200);

      // SUPER_ADMIN can create users
      await authenticatedRequest(superAdminToken)
        .post('/api/users')
        .send({
          email: 'newuser@test.com',
          password: 'password123',
          firstName: 'New',
          lastName: 'User',
          role: UserRole.EMPLOYEE
        })
        .expect(201);

      console.log('✅ SUPER_ADMIN permissions test completed');
    });

    test('should enforce ADMIN permissions', async () => {
      const adminToken = testContext.authTokens.admin;

      // ADMIN can manage most resources
      await authenticatedRequest(adminToken)
        .get('/api/customers')
        .expect(200);

      await authenticatedRequest(adminToken)
        .post('/api/customers')
        .send({
          type: 'PERSON',
          person: {
            firstName: 'Test',
            lastName: 'Customer',
            email: 'test@customer.com'
          }
        })
        .expect(201);

      await authenticatedRequest(adminToken)
        .get('/api/quotes')
        .expect(200);

      await authenticatedRequest(adminToken)
        .get('/api/invoices')
        .expect(200);

      await authenticatedRequest(adminToken)
        .get('/api/payments')
        .expect(200);

      // ADMIN can create other users (but not SUPER_ADMIN)
      await authenticatedRequest(adminToken)
        .post('/api/users')
        .send({
          email: 'manager@test.com',
          password: 'password123',
          firstName: 'New',
          lastName: 'Manager',
          role: UserRole.MANAGER
        })
        .expect(201);

      // ADMIN cannot create SUPER_ADMIN
      await authenticatedRequest(adminToken)
        .post('/api/users')
        .send({
          email: 'superadmin2@test.com',
          password: 'password123',
          firstName: 'Fake',
          lastName: 'SuperAdmin',
          role: UserRole.SUPER_ADMIN
        })
        .expect(403);

      console.log('✅ ADMIN permissions test completed');
    });

    test('should enforce MANAGER permissions', async () => {
      const managerToken = testContext.authTokens.manager;

      // MANAGER can manage customers and projects
      await authenticatedRequest(managerToken)
        .get('/api/customers')
        .expect(200);

      await authenticatedRequest(managerToken)
        .post('/api/customers')
        .send({
          type: 'BUSINESS',
          business: {
            legalName: 'Manager Created Business',
            businessType: 'LLC',
            email: 'manager@business.com'
          }
        })
        .expect(201);

      await authenticatedRequest(managerToken)
        .get('/api/projects')
        .expect(200);

      await authenticatedRequest(managerToken)
        .get('/api/quotes')
        .expect(200);

      // MANAGER cannot create users
      await authenticatedRequest(managerToken)
        .post('/api/users')
        .send({
          email: 'unauthorized@test.com',
          password: 'password123',
          firstName: 'Unauthorized',
          lastName: 'User',
          role: UserRole.EMPLOYEE
        })
        .expect(403);

      // MANAGER cannot access all audit logs (only their own actions)
      await authenticatedRequest(managerToken)
        .get('/api/audit-logs')
        .expect(403);

      console.log('✅ MANAGER permissions test completed');
    });

    test('should enforce ACCOUNTANT permissions', async () => {
      const accountantToken = testContext.authTokens.accountant;

      // ACCOUNTANT can manage financial data
      await authenticatedRequest(accountantToken)
        .get('/api/invoices')
        .expect(200);

      await authenticatedRequest(accountantToken)
        .get('/api/payments')
        .expect(200);

      await authenticatedRequest(accountantToken)
        .get('/api/expenses')
        .expect(200);

      // ACCOUNTANT can view customers but limited modification
      await authenticatedRequest(accountantToken)
        .get('/api/customers')
        .expect(200);

      // ACCOUNTANT cannot create quotes (business development function)
      await authenticatedRequest(accountantToken)
        .post('/api/quotes')
        .send({
          customerId: testContext.customers[0]!.id,
          validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          items: [{
            description: 'Test service',
            quantity: 1,
            unitPrice: 100,
            taxRate: 0.13
          }]
        })
        .expect(403);

      // ACCOUNTANT cannot manage users
      await authenticatedRequest(accountantToken)
        .get('/api/users')
        .expect(403);

      console.log('✅ ACCOUNTANT permissions test completed');
    });

    test('should enforce EMPLOYEE permissions', async () => {
      const employeeToken = testContext.authTokens.employee;

      // EMPLOYEE can view customers (for work purposes)
      await authenticatedRequest(employeeToken)
        .get('/api/customers')
        .expect(200);

      // EMPLOYEE can view assigned projects
      await authenticatedRequest(employeeToken)
        .get('/api/projects')
        .expect(200);

      // EMPLOYEE cannot create customers
      await authenticatedRequest(employeeToken)
        .post('/api/customers')
        .send({
          type: 'PERSON',
          person: {
            firstName: 'Unauthorized',
            lastName: 'Customer',
            email: 'unauthorized@customer.com'
          }
        })
        .expect(403);

      // EMPLOYEE cannot access financial data
      await authenticatedRequest(employeeToken)
        .get('/api/payments')
        .expect(403);

      await authenticatedRequest(employeeToken)
        .get('/api/invoices')
        .expect(403);

      // EMPLOYEE cannot manage users
      await authenticatedRequest(employeeToken)
        .get('/api/users')
        .expect(403);

      console.log('✅ EMPLOYEE permissions test completed');
    });

    test('should enforce VIEWER permissions', async () => {
      const viewerToken = testContext.authTokens.viewer;

      // VIEWER can only read basic data
      await authenticatedRequest(viewerToken)
        .get('/api/customers')
        .expect(200);

      // VIEWER cannot create anything
      await authenticatedRequest(viewerToken)
        .post('/api/customers')
        .send({
          type: 'PERSON',
          person: {
            firstName: 'Viewer',
            lastName: 'Attempt',
            email: 'viewer@attempt.com'
          }
        })
        .expect(403);

      await authenticatedRequest(viewerToken)
        .post('/api/quotes')
        .send({
          customerId: testContext.customers[0]!.id,
          validUntil: new Date().toISOString(),
          items: []
        })
        .expect(403);

      // VIEWER cannot update anything
      await authenticatedRequest(viewerToken)
        .patch(`/api/customers/${testContext.customers[0]!.id}`)
        .send({ notes: 'Viewer attempted update' })
        .expect(403);

      // VIEWER cannot delete anything
      await authenticatedRequest(viewerToken)
        .delete(`/api/customers/${testContext.customers[0]!.id}`)
        .expect(403);

      // VIEWER cannot access sensitive data
      await authenticatedRequest(viewerToken)
        .get('/api/users')
        .expect(403);

      await authenticatedRequest(viewerToken)
        .get('/api/audit-logs')
        .expect(403);

      console.log('✅ VIEWER permissions test completed');
    });
  });

  describe('Session Management', () => {
    test('should handle concurrent sessions for same user', async () => {
      const user = testContext.users.admin;

      // Create multiple sessions for the same user
      const session1Response = await baseRequest()
        .post('/api/auth/login')
        .send({
          email: user.email,
          password: 'password123'
        })
        .expect(200);

      await delay(100); // Small delay to ensure different session timestamps

      const session2Response = await baseRequest()
        .post('/api/auth/login')
        .send({
          email: user.email,
          password: 'password123'
        })
        .expect(200);

      const token1 = session1Response.body.token;
      const token2 = session2Response.body.token;

      expect(token1).not.toBe(token2);

      // Both sessions should work independently
      await authenticatedRequest(token1)
        .get('/api/customers')
        .expect(200);

      await authenticatedRequest(token2)
        .get('/api/customers')
        .expect(200);

      // Logout one session
      await authenticatedRequest(token1)
        .post('/api/auth/logout')
        .expect(200);

      // First session should be invalid
      await authenticatedRequest(token1)
        .get('/api/customers')
        .expect(401);

      // Second session should still work
      await authenticatedRequest(token2)
        .get('/api/customers')
        .expect(200);

      console.log('✅ Concurrent sessions test completed');
    });

    test('should handle session cleanup on user deactivation', async () => {
      const { organization, authTokens } = testContext;

      // Create a test user
      const testUser = await createTestUser(
        prisma,
        organization.id,
        UserRole.EMPLOYEE,
        'testuser@session.com'
      );

      // Login to create session
      const loginResponse = await baseRequest()
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: 'password123'
        })
        .expect(200);

      const userToken = loginResponse.body.token;

      // Verify user can access resources
      await authenticatedRequest(userToken)
        .get('/api/customers')
        .expect(200);

      // Admin deactivates the user
      await authenticatedRequest(authTokens.admin)
        .patch(`/api/users/${testUser.id}`)
        .send({ isActive: false })
        .expect(200);

      // User's token should now be invalid
      await authenticatedRequest(userToken)
        .get('/api/customers')
        .expect(401);

      console.log('✅ Session cleanup on deactivation test completed');
    });
  });

  describe('Password Security', () => {
    test('should enforce strong password requirements', async () => {
      const adminToken = testContext.authTokens.admin;

      // Test weak passwords
      const weakPasswords = [
        'password',      // Too common
        '123456',        // Too simple
        'abc',           // Too short
        'PASSWORD123',   // No special characters
        'password123'    // No uppercase
      ];

      for (const weakPassword of weakPasswords) {
        await authenticatedRequest(adminToken)
          .post('/api/users')
          .send({
            email: `weak${Date.now()}@test.com`,
            password: weakPassword,
            firstName: 'Weak',
            lastName: 'Password',
            role: UserRole.EMPLOYEE
          })
          .expect(400); // Should fail validation
      }

      // Test strong password
      await authenticatedRequest(adminToken)
        .post('/api/users')
        .send({
          email: 'strongpassword@test.com',
          password: 'StrongPass123!@#',
          firstName: 'Strong',
          lastName: 'Password',
          role: UserRole.EMPLOYEE
        })
        .expect(201);

      console.log('✅ Password strength test completed');
    });

    test('should handle password reset flow', async () => {
      const user = testContext.users.employee;

      // Request password reset
      const resetResponse = await baseRequest()
        .post('/api/auth/forgot-password')
        .send({ email: user.email })
        .expect(200);

      expect(resetResponse.body.message).toContain('reset');

      // Verify reset token was created in database
      const updatedUser = await prisma.user.findUnique({
        where: { id: user.id }
      });

      expect(updatedUser?.passwordResetToken).toBeTruthy();
      expect(updatedUser?.passwordResetExpires).toBeTruthy();

      // Use reset token to change password
      await baseRequest()
        .post('/api/auth/reset-password')
        .send({
          token: updatedUser!.passwordResetToken,
          newPassword: 'NewSecurePass123!@#'
        })
        .expect(200);

      // Verify old password no longer works
      await baseRequest()
        .post('/api/auth/login')
        .send({
          email: user.email,
          password: 'password123' // Old password
        })
        .expect(401);

      // Verify new password works
      await baseRequest()
        .post('/api/auth/login')
        .send({
          email: user.email,
          password: 'NewSecurePass123!@#' // New password
        })
        .expect(200);

      console.log('✅ Password reset flow test completed');
    });

    test('should handle account lockout on failed attempts', async () => {
      const user = testContext.users.viewer;

      // Make multiple failed login attempts
      for (let i = 0; i < 5; i++) {
        await baseRequest()
          .post('/api/auth/login')
          .send({
            email: user.email,
            password: 'wrongpassword'
          })
          .expect(401);
      }

      // Account should now be locked
      await baseRequest()
        .post('/api/auth/login')
        .send({
          email: user.email,
          password: 'password123' // Correct password
        })
        .expect(423); // Account locked

      // Verify lockout in database
      const lockedUser = await prisma.user.findUnique({
        where: { id: user.id }
      });

      expect(lockedUser?.failedAttempts).toBeGreaterThanOrEqual(5);
      expect(lockedUser?.lockedUntil).toBeTruthy();

      console.log('✅ Account lockout test completed');
    });
  });

  describe('API Key Authentication', () => {
    test('should authenticate with valid API key', async () => {
      const adminToken = testContext.authTokens.admin;

      // Create API key
      const apiKeyResponse = await authenticatedRequest(adminToken)
        .post('/api/api-keys')
        .send({
          name: 'Test Integration Key',
          permissions: ['read:customers', 'write:quotes'],
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
        })
        .expect(201);

      const apiKey = apiKeyResponse.body.key;

      // Use API key to access resources
      const customersResponse = await baseRequest()
        .get('/api/customers')
        .set('X-API-Key', apiKey)
        .expect(200);

      expect(customersResponse.body.data).toBeDefined();

      console.log('✅ API key authentication test completed');
    });

    test('should respect API key permissions', async () => {
      const adminToken = testContext.authTokens.admin;

      // Create limited API key
      const apiKeyResponse = await authenticatedRequest(adminToken)
        .post('/api/api-keys')
        .send({
          name: 'Limited API Key',
          permissions: ['read:customers'], // Only read customers
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
        })
        .expect(201);

      const apiKey = apiKeyResponse.body.key;

      // Should work for allowed operations
      await baseRequest()
        .get('/api/customers')
        .set('X-API-Key', apiKey)
        .expect(200);

      // Should fail for forbidden operations
      await baseRequest()
        .post('/api/customers')
        .set('X-API-Key', apiKey)
        .send({
          type: 'PERSON',
          person: {
            firstName: 'API',
            lastName: 'Test',
            email: 'api@test.com'
          }
        })
        .expect(403);

      await baseRequest()
        .get('/api/invoices')
        .set('X-API-Key', apiKey)
        .expect(403);

      console.log('✅ API key permissions test completed');
    });

    test('should handle expired API keys', async () => {
      const adminToken = testContext.authTokens.admin;

      // Create expired API key (mock by creating one and then updating it to be expired)
      const apiKeyResponse = await authenticatedRequest(adminToken)
        .post('/api/api-keys')
        .send({
          name: 'Expired API Key',
          permissions: ['read:customers'],
          expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() // Expired yesterday
        })
        .expect(201);

      const apiKey = apiKeyResponse.body.key;

      // Should fail with expired API key
      await baseRequest()
        .get('/api/customers')
        .set('X-API-Key', apiKey)
        .expect(401);

      console.log('✅ Expired API key test completed');
    });
  });

  describe('Authorization Edge Cases', () => {
    test('should handle role changes during active session', async () => {
      const { organization, authTokens } = testContext;

      // Create test user
      const testUser = await createTestUser(
        prisma,
        organization.id,
        UserRole.MANAGER,
        'rolechange@test.com'
      );

      // Login and get token
      const loginResponse = await baseRequest()
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: 'password123'
        })
        .expect(200);

      const userToken = loginResponse.body.token;

      // User can access manager-level resources
      await authenticatedRequest(userToken)
        .get('/api/customers')
        .expect(200);

      // Admin downgrades user to VIEWER
      await authenticatedRequest(authTokens.admin)
        .patch(`/api/users/${testUser.id}`)
        .send({ role: UserRole.VIEWER })
        .expect(200);

      // Existing token should still work but with old permissions until refresh
      // This depends on your implementation - you might want to invalidate tokens on role change
      await authenticatedRequest(userToken)
        .get('/api/customers')
        .expect(200);

      // New login should have updated permissions
      const newLoginResponse = await baseRequest()
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: 'password123'
        })
        .expect(200);

      const newToken = newLoginResponse.body.token;

      // Should still read but not create
      await authenticatedRequest(newToken)
        .get('/api/customers')
        .expect(200);

      await authenticatedRequest(newToken)
        .post('/api/customers')
        .send({
          type: 'PERSON',
          person: {
            firstName: 'Should',
            lastName: 'Fail',
            email: 'should@fail.com'
          }
        })
        .expect(403);

      console.log('✅ Role change during session test completed');
    });

    test('should handle organization access after user transfer', async () => {
      // Create second organization
      const org2 = await prisma.organization.create({
        data: {
          name: 'Second Organization',
          email: 'org2@test.com',
          phone: '+1-555-0002',
          encryptionKey: 'test-key-32-chars-org2-5678901234'
        }
      });

      // Create user in first organization
      const testUser = await createTestUser(
        prisma,
        testContext.organization.id,
        UserRole.EMPLOYEE,
        'transfer@test.com'
      );

      // Login to first org
      const token1 = generateAuthToken(testUser);

      // Can access first org's customers
      await authenticatedRequest(token1)
        .get('/api/customers')
        .expect(200);

      // Transfer user to second organization (simulate org change)
      await prisma.user.update({
        where: { id: testUser.id },
        data: { organizationId: org2.id }
      });

      // Old token should no longer work (organization mismatch)
      await authenticatedRequest(token1)
        .get('/api/customers')
        .expect(401);

      // New token for new org should work
      const updatedUser = await prisma.user.findUnique({ where: { id: testUser.id } });
      const token2 = generateAuthToken(updatedUser!);

      await authenticatedRequest(token2)
        .get('/api/customers')
        .expect(200);

      console.log('✅ Organization transfer test completed');
    });
  });
});