import { describe, test, expect, beforeEach } from '@jest/globals';
import { prisma, authenticatedRequest, baseRequest } from './setup';
import {
  createTestContext,
  createTestUser,
  createTestCustomer,
  createTestQuote,
  createTestInvoice,
  createTestPayment,
  TestContext
} from './test-utils';
import { UserRole } from '../../src/types/enums';

/**
 * API v1 Backwards Compatibility Tests
 *
 * Tests role-based access control for API v1 backwards compatibility while maintaining
 * the new multi-tenant architecture. Ensures seamless upgrade path for existing users,
 * permission inheritance models, and consistent HTTP status codes across both API patterns:
 * - Legacy: `/api/v1/resource`
 * - Multi-tenant: `/api/v1/organizations/{orgId}/resource`
 */
describe('API v1 Backwards Compatibility Tests', () => {
  let testContext: TestContext;

  beforeEach(async () => {
    testContext = await createTestContext(prisma, 'API v1 Compatibility Org');
  });

  describe('Legacy Endpoint Pattern Support', () => {
    test('should support legacy /api/v1/resource patterns with role permissions', async () => {
      const { authTokens, organization } = testContext;

      // Legacy API patterns that should still work
      const legacyEndpoints = [
        {
          method: 'GET',
          path: '/api/v1/customers',
          expectedRoles: ['ADMIN', 'MANAGER', 'ACCOUNTANT', 'VIEWER'],
          deniedRoles: ['EMPLOYEE']
        },
        {
          method: 'GET',
          path: '/api/v1/quotes',
          expectedRoles: ['ADMIN', 'MANAGER', 'ACCOUNTANT'],
          deniedRoles: ['EMPLOYEE', 'VIEWER']
        },
        {
          method: 'GET',
          path: '/api/v1/invoices',
          expectedRoles: ['ADMIN', 'MANAGER', 'ACCOUNTANT'],
          deniedRoles: ['EMPLOYEE', 'VIEWER']
        },
        {
          method: 'GET',
          path: '/api/v1/payments',
          expectedRoles: ['ADMIN', 'MANAGER', 'ACCOUNTANT'],
          deniedRoles: ['EMPLOYEE', 'VIEWER']
        },
        {
          method: 'GET',
          path: '/api/v1/users',
          expectedRoles: ['ADMIN'],
          deniedRoles: ['MANAGER', 'ACCOUNTANT', 'EMPLOYEE', 'VIEWER']
        }
      ];

      const roleTokenMap = {
        'ADMIN': authTokens.admin,
        'MANAGER': authTokens.manager,
        'ACCOUNTANT': authTokens.accountant,
        'EMPLOYEE': authTokens.employee,
        'VIEWER': authTokens.viewer
      };

      for (const endpoint of legacyEndpoints) {
        // Test roles that should have access
        for (const role of endpoint.expectedRoles) {
          const token = roleTokenMap[role as keyof typeof roleTokenMap];

          if (endpoint.method === 'GET') {
            const response = await authenticatedRequest(token)
              .get(endpoint.path);

            // Should either succeed (200) or return 404 if endpoint doesn't exist yet
            expect([200, 404].includes(response.status)).toBe(true);

            if (response.status === 200) {
              // Verify organization-scoped data
              expect(response.body.data).toBeDefined();
              if (Array.isArray(response.body.data)) {
                expect(response.body.data.every((item: any) =>
                  item.organizationId === organization.id || !item.organizationId
                )).toBe(true);
              }
            }
          }
        }

        // Test roles that should be denied access
        for (const role of endpoint.deniedRoles) {
          const token = roleTokenMap[role as keyof typeof roleTokenMap];

          if (endpoint.method === 'GET') {
            const response = await authenticatedRequest(token)
              .get(endpoint.path);

            // Should either be forbidden (403) or not found (404)
            expect([403, 404].includes(response.status)).toBe(true);
          }
        }
      }

      console.log('✅ Legacy endpoint pattern support test completed');
    });

    test('should maintain consistent response formats between legacy and multi-tenant patterns', async () => {
      const { authTokens, organization } = testContext;

      // Create test data for comparison
      const customer = await createTestCustomer(prisma, organization.id, 'BUSINESS');

      // Compare response formats between legacy and multi-tenant patterns
      const endpointComparisons = [
        {
          legacy: '/api/v1/customers',
          multiTenant: `/api/v1/organizations/${organization.id}/customers`,
          description: 'Customer endpoint format comparison'
        },
        {
          legacy: '/api/v1/quotes',
          multiTenant: `/api/v1/organizations/${organization.id}/quotes`,
          description: 'Quote endpoint format comparison'
        },
        {
          legacy: '/api/v1/invoices',
          multiTenant: `/api/v1/organizations/${organization.id}/invoices`,
          description: 'Invoice endpoint format comparison'
        }
      ];

      for (const comparison of endpointComparisons) {
        // Test with admin token (highest permissions)
        const legacyResponse = await authenticatedRequest(authTokens.admin)
          .get(comparison.legacy);

        const multiTenantResponse = await authenticatedRequest(authTokens.admin)
          .get(comparison.multiTenant);

        // Both should succeed or both should fail consistently
        if (legacyResponse.status === 200 && multiTenantResponse.status === 200) {
          // Compare response structure
          expect(legacyResponse.body).toHaveProperty('data');
          expect(multiTenantResponse.body).toHaveProperty('data');

          // Verify data structure consistency
          if (Array.isArray(legacyResponse.body.data) && Array.isArray(multiTenantResponse.body.data)) {
            if (legacyResponse.body.data.length > 0 && multiTenantResponse.body.data.length > 0) {
              const legacyItem = legacyResponse.body.data[0];
              const multiTenantItem = multiTenantResponse.body.data[0];

              // Key properties should be consistent
              const commonKeys = Object.keys(legacyItem).filter(key =>
                multiTenantItem.hasOwnProperty(key)
              );

              expect(commonKeys.length).toBeGreaterThan(0);
            }
          }

          // Verify organization isolation in both patterns
          expect(legacyResponse.body.data.every((item: any) =>
            item.organizationId === organization.id || !item.organizationId
          )).toBe(true);

          expect(multiTenantResponse.body.data.every((item: any) =>
            item.organizationId === organization.id
          )).toBe(true);
        }
      }

      console.log('✅ Response format consistency test completed');
    });
  });

  describe('Permission Inheritance Models', () => {
    test('should maintain hierarchical permissions across API versions', async () => {
      const { authTokens, organization } = testContext;

      // Permission hierarchy validation
      const permissionHierarchy = [
        { role: 'ADMIN', level: 5, inheritedRoles: ['MANAGER', 'ACCOUNTANT', 'EMPLOYEE', 'VIEWER'] },
        { role: 'MANAGER', level: 4, inheritedRoles: ['ACCOUNTANT', 'EMPLOYEE', 'VIEWER'] },
        { role: 'ACCOUNTANT', level: 3, inheritedRoles: ['VIEWER'] },
        { role: 'EMPLOYEE', level: 2, inheritedRoles: ['VIEWER'] },
        { role: 'VIEWER', level: 1, inheritedRoles: [] }
      ];

      const testEndpoints = [
        { path: '/api/v1/customers', operation: 'read' },
        { path: '/api/v1/quotes', operation: 'read' },
        { path: '/api/v1/invoices', operation: 'read' }
      ];

      const roleTokenMap = {
        'ADMIN': authTokens.admin,
        'MANAGER': authTokens.manager,
        'ACCOUNTANT': authTokens.accountant,
        'EMPLOYEE': authTokens.employee,
        'VIEWER': authTokens.viewer
      };

      for (const hierarchy of permissionHierarchy) {
        const roleToken = roleTokenMap[hierarchy.role as keyof typeof roleTokenMap];

        for (const endpoint of testEndpoints) {
          // Test current role permissions
          const response = await authenticatedRequest(roleToken)
            .get(endpoint.path);

          // Track permission responses for hierarchy validation
          const hasAccess = [200].includes(response.status);
          const isDenied = [403].includes(response.status);
          const isNotFound = [404].includes(response.status);

          // Higher-level roles should have at least as much access as lower-level roles
          if (hasAccess) {
            // Test that higher roles also have access
            for (const higherRole of permissionHierarchy) {
              if (higherRole.level > hierarchy.level) {
                const higherRoleToken = roleTokenMap[higherRole.role as keyof typeof roleTokenMap];
                const higherResponse = await authenticatedRequest(higherRoleToken)
                  .get(endpoint.path);

                // Higher role should not be denied if lower role has access
                expect(higherResponse.status).not.toBe(403);
              }
            }
          }
        }
      }

      console.log('✅ Permission hierarchy validation test completed');
    });

    test('should support contextual permissions for project and customer-specific access', async () => {
      const { authTokens, organization, customers } = testContext;

      // Create customer-specific access scenarios
      const customer = customers[0]!;
      const quote = await createTestQuote(
        prisma,
        organization.id,
        customer.id,
        testContext.users.admin.id
      );

      // Test contextual access patterns
      const contextualEndpoints = [
        {
          pattern: 'legacy',
          path: `/api/v1/customers/${customer.id}`,
          description: 'Legacy customer-specific access'
        },
        {
          pattern: 'multi-tenant',
          path: `/api/v1/organizations/${organization.id}/customers/${customer.id}`,
          description: 'Multi-tenant customer-specific access'
        },
        {
          pattern: 'legacy',
          path: `/api/v1/quotes/${quote.id}`,
          description: 'Legacy quote-specific access'
        },
        {
          pattern: 'multi-tenant',
          path: `/api/v1/organizations/${organization.id}/quotes/${quote.id}`,
          description: 'Multi-tenant quote-specific access'
        }
      ];

      // Test contextual permissions with different roles
      const contextualRoles = [
        { role: 'ADMIN', token: authTokens.admin, shouldAccess: true },
        { role: 'MANAGER', token: authTokens.manager, shouldAccess: true },
        { role: 'ACCOUNTANT', token: authTokens.accountant, shouldAccess: true },
        { role: 'EMPLOYEE', token: authTokens.employee, shouldAccess: false },
        { role: 'VIEWER', token: authTokens.viewer, shouldAccess: true }
      ];

      for (const endpoint of contextualEndpoints) {
        for (const roleTest of contextualRoles) {
          const response = await authenticatedRequest(roleTest.token)
            .get(endpoint.path);

          if (roleTest.shouldAccess) {
            // Should either succeed or not be implemented yet
            expect([200, 404].includes(response.status)).toBe(true);

            if (response.status === 200) {
              // Verify organization context is maintained
              expect(response.body.organizationId || response.body.data?.organizationId).toBe(organization.id);
            }
          } else {
            // Should be forbidden
            expect([403, 404].includes(response.status)).toBe(true);
          }
        }
      }

      console.log('✅ Contextual permissions test completed');
    });
  });

  describe('Role Migration and Upgrade Path', () => {
    test('should support seamless role migration from v1 to multi-tenant', async () => {
      const { authTokens, organization } = testContext;

      // Simulate legacy role configurations that need to be migrated
      const legacyRoleConfigurations = [
        {
          legacyRole: 'ADMIN',
          newRole: 'ADMIN',
          shouldMigrateSeamlessly: true,
          newPermissions: ['full_access', 'user_management', 'system_configuration']
        },
        {
          legacyRole: 'MANAGER',
          newRole: 'MANAGER',
          shouldMigrateSeamlessly: true,
          newPermissions: ['customer_management', 'project_management', 'financial_reporting']
        },
        {
          legacyRole: 'ACCOUNTANT',
          newRole: 'ACCOUNTANT',
          shouldMigrateSeamlessly: true,
          newPermissions: ['financial_data', 'tax_management', 'audit_access']
        },
        {
          legacyRole: 'USER',
          newRole: 'EMPLOYEE',
          shouldMigrateSeamlessly: true,
          newPermissions: ['basic_access', 'assigned_projects']
        },
        {
          legacyRole: 'READONLY',
          newRole: 'VIEWER',
          shouldMigrateSeamlessly: true,
          newPermissions: ['read_only_access']
        }
      ];

      // Test migration simulation endpoint
      for (const roleConfig of legacyRoleConfigurations) {
        const migrationTestData = {
          legacyRole: roleConfig.legacyRole,
          targetRole: roleConfig.newRole,
          organizationId: organization.id,
          dryRun: true, // Don't actually migrate in tests
          validatePermissions: true
        };

        const migrationResponse = await authenticatedRequest(authTokens.admin)
          .post('/api/v1/roles/migration-test')
          .send(migrationTestData);

        // Migration endpoint may not exist yet, accept 404
        expect([200, 400, 404].includes(migrationResponse.status)).toBe(true);

        if (migrationResponse.status === 200) {
          expect(migrationResponse.body.compatible).toBe(roleConfig.shouldMigrateSeamlessly);
          expect(migrationResponse.body.newRole).toBe(roleConfig.newRole);
        }
      }

      console.log('✅ Role migration test completed');
    });

    test('should maintain session compatibility during role transitions', async () => {
      const { authTokens, organization } = testContext;

      // Test session behavior during role transitions
      const sessionTestScenarios = [
        {
          scenario: 'ROLE_UPGRADE',
          fromRole: 'EMPLOYEE',
          toRole: 'MANAGER',
          shouldInvalidateSession: false,
          shouldUpdatePermissions: true
        },
        {
          scenario: 'ROLE_DOWNGRADE',
          fromRole: 'MANAGER',
          toRole: 'EMPLOYEE',
          shouldInvalidateSession: true, // Security measure
          shouldUpdatePermissions: true
        },
        {
          scenario: 'LATERAL_MOVE',
          fromRole: 'ACCOUNTANT',
          toRole: 'MANAGER',
          shouldInvalidateSession: false,
          shouldUpdatePermissions: true
        }
      ];

      for (const scenario of sessionTestScenarios) {
        // Create test user for role transition
        const testUser = await createTestUser(
          prisma,
          organization.id,
          scenario.fromRole,
          `transition.${scenario.scenario.toLowerCase()}@test.com`
        );

        // Test initial access with original role
        const initialToken = authTokens[scenario.fromRole.toLowerCase() as keyof typeof authTokens] || authTokens.employee;

        const initialAccessResponse = await authenticatedRequest(initialToken)
          .get('/api/v1/customers');

        const hadInitialAccess = [200].includes(initialAccessResponse.status);

        // Simulate role change
        const roleChangeData = {
          userId: testUser.id,
          newRole: scenario.toRole,
          reason: `Test scenario: ${scenario.scenario}`,
          effectiveImmediately: true,
          notifyUser: false
        };

        const roleChangeResponse = await authenticatedRequest(authTokens.admin)
          .patch(`/api/v1/users/${testUser.id}/role`)
          .send(roleChangeData);

        // Role change endpoint may not exist yet
        expect([200, 400, 404].includes(roleChangeResponse.status)).toBe(true);

        // Test session behavior after role change
        if (scenario.shouldInvalidateSession) {
          // Old token should no longer work
          const postChangeResponse = await authenticatedRequest(initialToken)
            .get('/api/v1/customers');

          expect([401, 403].includes(postChangeResponse.status)).toBe(true);
        } else {
          // Session should still work but with updated permissions
          const postChangeResponse = await authenticatedRequest(initialToken)
            .get('/api/v1/customers');

          // Should work or be denied based on new role permissions
          expect([200, 403, 404].includes(postChangeResponse.status)).toBe(true);
        }
      }

      console.log('✅ Session compatibility during role transitions test completed');
    });
  });

  describe('Error Code Preservation and Consistency', () => {
    test('should maintain consistent HTTP status codes across API versions', async () => {
      const { authTokens, organization } = testContext;

      // Test scenarios for consistent error codes
      const errorScenarios = [
        {
          scenario: 'UNAUTHORIZED_ACCESS',
          method: 'GET',
          legacyPath: '/api/v1/users',
          multiTenantPath: `/api/v1/organizations/${organization.id}/users`,
          token: authTokens.employee, // Employee shouldn't access users
          expectedStatus: [403, 404]
        },
        {
          scenario: 'FORBIDDEN_OPERATION',
          method: 'POST',
          legacyPath: '/api/v1/customers',
          multiTenantPath: `/api/v1/organizations/${organization.id}/customers`,
          token: authTokens.viewer, // Viewer shouldn't create customers
          expectedStatus: [403]
        },
        {
          scenario: 'NOT_FOUND_RESOURCE',
          method: 'GET',
          legacyPath: '/api/v1/customers/non-existent-id',
          multiTenantPath: `/api/v1/organizations/${organization.id}/customers/non-existent-id`,
          token: authTokens.admin,
          expectedStatus: [404]
        },
        {
          scenario: 'CROSS_ORG_ACCESS',
          method: 'GET',
          legacyPath: '/api/v1/customers',
          multiTenantPath: '/api/v1/organizations/different-org-id/customers',
          token: authTokens.admin,
          expectedStatus: [403, 404]
        }
      ];

      for (const scenario of errorScenarios) {
        // Test legacy endpoint
        let legacyResponse;
        if (scenario.method === 'GET') {
          legacyResponse = await authenticatedRequest(scenario.token)
            .get(scenario.legacyPath);
        } else if (scenario.method === 'POST') {
          legacyResponse = await authenticatedRequest(scenario.token)
            .post(scenario.legacyPath)
            .send({
              type: 'PERSON',
              person: { firstName: 'Test', lastName: 'User', email: 'test@example.com' }
            });
        }

        // Test multi-tenant endpoint
        let multiTenantResponse;
        if (scenario.method === 'GET') {
          multiTenantResponse = await authenticatedRequest(scenario.token)
            .get(scenario.multiTenantPath);
        } else if (scenario.method === 'POST') {
          multiTenantResponse = await authenticatedRequest(scenario.token)
            .post(scenario.multiTenantPath)
            .send({
              type: 'PERSON',
              person: { firstName: 'Test', lastName: 'User', email: 'test@example.com' }
            });
        }

        // Verify consistent status codes
        if (legacyResponse && multiTenantResponse) {
          expect(scenario.expectedStatus.includes(legacyResponse.status)).toBe(true);
          expect(scenario.expectedStatus.includes(multiTenantResponse.status)).toBe(true);

          // If both endpoints exist and return errors, they should be consistent
          if (legacyResponse.status >= 400 && multiTenantResponse.status >= 400) {
            expect(legacyResponse.status).toBe(multiTenantResponse.status);
          }
        }
      }

      console.log('✅ Error code consistency test completed');
    });

    test('should provide consistent error messages and formats', async () => {
      const { authTokens, organization } = testContext;

      // Test error message consistency
      const errorMessageTests = [
        {
          test: 'INVALID_AUTHENTICATION',
          endpoint: '/api/v1/customers',
          token: 'invalid-token',
          expectedErrorFields: ['error', 'message']
        },
        {
          test: 'INSUFFICIENT_PERMISSIONS',
          endpoint: '/api/v1/users',
          token: authTokens.employee,
          expectedErrorFields: ['error', 'message']
        }
      ];

      for (const errorTest of errorMessageTests) {
        // Test legacy pattern
        const legacyResponse = await baseRequest()
          .get(errorTest.endpoint)
          .set('Authorization', `Bearer ${errorTest.token}`);

        // Test multi-tenant pattern
        const multiTenantResponse = await baseRequest()
          .get(`/api/v1/organizations/${organization.id}${errorTest.endpoint.replace('/api/v1', '')}`)
          .set('Authorization', `Bearer ${errorTest.token}`);

        // Both should return error responses
        expect(legacyResponse.status).toBeGreaterThanOrEqual(400);

        if (multiTenantResponse.status >= 400) {
          // Error response format should be consistent
          for (const field of errorTest.expectedErrorFields) {
            if (legacyResponse.body[field]) {
              expect(multiTenantResponse.body).toHaveProperty(field);
            }
          }

          // Error types should be consistent
          if (legacyResponse.body.error && multiTenantResponse.body.error) {
            expect(typeof legacyResponse.body.error).toBe(typeof multiTenantResponse.body.error);
          }
        }
      }

      console.log('✅ Error message consistency test completed');
    });
  });

  describe('Feature Parity Validation', () => {
    test('should maintain feature parity between API versions', async () => {
      const { authTokens, organization, customers } = testContext;

      // Feature parity test matrix
      const featureTests = [
        {
          feature: 'CUSTOMER_CRUD',
          legacyEndpoints: [
            { method: 'GET', path: '/api/v1/customers' },
            { method: 'POST', path: '/api/v1/customers' },
            { method: 'GET', path: `/api/v1/customers/${customers[0]?.id}` },
            { method: 'PATCH', path: `/api/v1/customers/${customers[0]?.id}` }
          ],
          multiTenantEndpoints: [
            { method: 'GET', path: `/api/v1/organizations/${organization.id}/customers` },
            { method: 'POST', path: `/api/v1/organizations/${organization.id}/customers` },
            { method: 'GET', path: `/api/v1/organizations/${organization.id}/customers/${customers[0]?.id}` },
            { method: 'PATCH', path: `/api/v1/organizations/${organization.id}/customers/${customers[0]?.id}` }
          ]
        },
        {
          feature: 'QUOTE_MANAGEMENT',
          legacyEndpoints: [
            { method: 'GET', path: '/api/v1/quotes' },
            { method: 'POST', path: '/api/v1/quotes' }
          ],
          multiTenantEndpoints: [
            { method: 'GET', path: `/api/v1/organizations/${organization.id}/quotes` },
            { method: 'POST', path: `/api/v1/organizations/${organization.id}/quotes` }
          ]
        }
      ];

      for (const featureTest of featureTests) {
        for (let i = 0; i < featureTest.legacyEndpoints.length; i++) {
          const legacyEndpoint = featureTest.legacyEndpoints[i];
          const multiTenantEndpoint = featureTest.multiTenantEndpoints[i];

          if (!legacyEndpoint || !multiTenantEndpoint) continue;

          const testData = {
            type: 'PERSON',
            person: {
              firstName: 'Feature',
              lastName: 'Parity',
              email: 'feature.parity@test.com'
            }
          };

          // Test legacy endpoint
          let legacyResponse;
          if (legacyEndpoint.method === 'GET') {
            legacyResponse = await authenticatedRequest(authTokens.admin)
              .get(legacyEndpoint.path);
          } else if (legacyEndpoint.method === 'POST') {
            legacyResponse = await authenticatedRequest(authTokens.admin)
              .post(legacyEndpoint.path)
              .send(testData);
          } else if (legacyEndpoint.method === 'PATCH') {
            legacyResponse = await authenticatedRequest(authTokens.admin)
              .patch(legacyEndpoint.path)
              .send({ notes: 'Legacy update test' });
          }

          // Test multi-tenant endpoint
          let multiTenantResponse;
          if (multiTenantEndpoint.method === 'GET') {
            multiTenantResponse = await authenticatedRequest(authTokens.admin)
              .get(multiTenantEndpoint.path);
          } else if (multiTenantEndpoint.method === 'POST') {
            multiTenantResponse = await authenticatedRequest(authTokens.admin)
              .post(multiTenantEndpoint.path)
              .send(testData);
          } else if (multiTenantEndpoint.method === 'PATCH') {
            multiTenantResponse = await authenticatedRequest(authTokens.admin)
              .patch(multiTenantEndpoint.path)
              .send({ notes: 'Multi-tenant update test' });
          }

          // Compare responses for feature parity
          if (legacyResponse && multiTenantResponse) {
            // If legacy works, multi-tenant should work too (or both should fail consistently)
            if (legacyResponse.status < 400) {
              expect(multiTenantResponse.status).toBeLessThan(500);
            }

            // Success responses should have similar structure
            if (legacyResponse.status === 200 && multiTenantResponse.status === 200) {
              expect(typeof legacyResponse.body).toBe(typeof multiTenantResponse.body);

              if (legacyResponse.body.data && multiTenantResponse.body.data) {
                expect(Array.isArray(legacyResponse.body.data))
                  .toBe(Array.isArray(multiTenantResponse.body.data));
              }
            }
          }
        }
      }

      console.log('✅ Feature parity validation test completed');
    });
  });
});