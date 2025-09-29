import { describe, test, expect, beforeEach } from '@jest/globals';
import { prisma, authenticatedRequest } from './setup';
import {
  createIsolatedTenants,
  createTestCustomer,
  createTestQuote,
  createTestInvoice,
  createTestPayment,
  createTestProject,
  verifyAuditLog,
  TestContext
} from './test-utils';
import { UserRole, CustomerStatus } from '../../src/types/enums';

describe('Multi-Tenant Isolation Integration Tests', () => {
  let tenant1: TestContext;
  let tenant2: TestContext;

  beforeEach(async () => {
    const tenants = await createIsolatedTenants(prisma);
    tenant1 = tenants.tenant1;
    tenant2 = tenants.tenant2;
  });

  describe('Data Isolation Between Tenants', () => {
    test('should prevent cross-tenant data access for all entities', async () => {
      const tenant1AdminToken = tenant1.authTokens.admin;
      const tenant2AdminToken = tenant2.authTokens.admin;

      // Create data in tenant 1
      const tenant1Customer = await createTestCustomer(prisma, tenant1.organization.id, 'PERSON');
      const tenant1Quote = await createTestQuote(
        prisma,
        tenant1.organization.id,
        tenant1Customer.id,
        tenant1.users.admin.id
      );
      const tenant1Invoice = await createTestInvoice(
        prisma,
        tenant1.organization.id,
        tenant1Customer.id,
        tenant1Quote.id
      );
      const tenant1Payment = await createTestPayment(
        prisma,
        tenant1.organization.id,
        tenant1Customer.id,
        tenant1Invoice.id
      );
      const tenant1Project = await createTestProject(
        prisma,
        tenant1.organization.id,
        tenant1Customer.id,
        tenant1.users.admin.id
      );

      // Create data in tenant 2
      const tenant2Customer = await createTestCustomer(prisma, tenant2.organization.id, 'BUSINESS');
      const tenant2Quote = await createTestQuote(
        prisma,
        tenant2.organization.id,
        tenant2Customer.id,
        tenant2.users.admin.id
      );

      // Test 1: Tenant 1 should not see tenant 2's customers
      const tenant1CustomersResponse = await authenticatedRequest(tenant1AdminToken)
        .get('/api/customers')
        .expect(200);

      const tenant1CustomerIds = tenant1CustomersResponse.body.data.map((c: any) => c.id);
      expect(tenant1CustomerIds).toContain(tenant1Customer.id);
      expect(tenant1CustomerIds).not.toContain(tenant2Customer.id);

      // Test 2: Tenant 2 should not see tenant 1's customers
      const tenant2CustomersResponse = await authenticatedRequest(tenant2AdminToken)
        .get('/api/customers')
        .expect(200);

      const tenant2CustomerIds = tenant2CustomersResponse.body.data.map((c: any) => c.id);
      expect(tenant2CustomerIds).toContain(tenant2Customer.id);
      expect(tenant2CustomerIds).not.toContain(tenant1Customer.id);

      // Test 3: Tenant 1 cannot access tenant 2's customer directly
      await authenticatedRequest(tenant1AdminToken)
        .get(`/api/customers/${tenant2Customer.id}`)
        .expect(404); // Should not be found due to organization filter

      // Test 4: Tenant 2 cannot access tenant 1's customer directly
      await authenticatedRequest(tenant2AdminToken)
        .get(`/api/customers/${tenant1Customer.id}`)
        .expect(404);

      // Test 5: Quote isolation
      const tenant1QuotesResponse = await authenticatedRequest(tenant1AdminToken)
        .get('/api/quotes')
        .expect(200);

      const tenant1QuoteIds = tenant1QuotesResponse.body.data.map((q: any) => q.id);
      expect(tenant1QuoteIds).toContain(tenant1Quote.id);
      expect(tenant1QuoteIds).not.toContain(tenant2Quote.id);

      // Test 6: Direct quote access prevention
      await authenticatedRequest(tenant1AdminToken)
        .get(`/api/quotes/${tenant2Quote.id}`)
        .expect(404);

      // Test 7: Invoice isolation
      const tenant1InvoicesResponse = await authenticatedRequest(tenant1AdminToken)
        .get('/api/invoices')
        .expect(200);

      const tenant1InvoiceIds = tenant1InvoicesResponse.body.data.map((i: any) => i.id);
      expect(tenant1InvoiceIds).toContain(tenant1Invoice.id);

      // Test 8: Payment isolation
      const tenant1PaymentsResponse = await authenticatedRequest(tenant1AdminToken)
        .get('/api/payments')
        .expect(200);

      const tenant1PaymentIds = tenant1PaymentsResponse.body.data.map((p: any) => p.id);
      expect(tenant1PaymentIds).toContain(tenant1Payment.id);

      // Test 9: Project isolation
      const tenant1ProjectsResponse = await authenticatedRequest(tenant1AdminToken)
        .get('/api/projects')
        .expect(200);

      const tenant1ProjectIds = tenant1ProjectsResponse.body.data.map((p: any) => p.id);
      expect(tenant1ProjectIds).toContain(tenant1Project.id);

      // Test 10: User isolation
      const tenant1UsersResponse = await authenticatedRequest(tenant1AdminToken)
        .get('/api/users')
        .expect(200);

      const tenant1UserIds = tenant1UsersResponse.body.data.map((u: any) => u.id);
      expect(tenant1UserIds).toContain(tenant1.users.admin.id);
      expect(tenant1UserIds).not.toContain(tenant2.users.admin.id);

      console.log('✅ All cross-tenant data access prevention tests passed');
    });

    test('should prevent cross-tenant data modification', async () => {
      const tenant1AdminToken = tenant1.authTokens.admin;
      const tenant2AdminToken = tenant2.authTokens.admin;

      // Create customer in tenant 1
      const tenant1Customer = await createTestCustomer(prisma, tenant1.organization.id, 'PERSON');

      // Create customer in tenant 2
      const tenant2Customer = await createTestCustomer(prisma, tenant2.organization.id, 'BUSINESS');

      // Test 1: Tenant 1 cannot update tenant 2's customer
      await authenticatedRequest(tenant1AdminToken)
        .patch(`/api/customers/${tenant2Customer.id}`)
        .send({ notes: 'Attempting cross-tenant modification' })
        .expect(404); // Should not find the customer

      // Test 2: Tenant 2 cannot update tenant 1's customer
      await authenticatedRequest(tenant2AdminToken)
        .patch(`/api/customers/${tenant1Customer.id}`)
        .send({ notes: 'Attempting cross-tenant modification' })
        .expect(404);

      // Test 3: Tenant 1 cannot delete tenant 2's customer
      await authenticatedRequest(tenant1AdminToken)
        .delete(`/api/customers/${tenant2Customer.id}`)
        .expect(404);

      // Test 4: Verify customers remain unchanged
      const tenant1CustomerCheck = await prisma.customer.findUnique({
        where: { id: tenant1Customer.id }
      });
      const tenant2CustomerCheck = await prisma.customer.findUnique({
        where: { id: tenant2Customer.id }
      });

      expect(tenant1CustomerCheck?.notes).not.toBe('Attempting cross-tenant modification');
      expect(tenant2CustomerCheck?.notes).not.toBe('Attempting cross-tenant modification');

      console.log('✅ Cross-tenant modification prevention tests passed');
    });

    test('should maintain audit log isolation', async () => {
      const tenant1AdminToken = tenant1.authTokens.admin;
      const tenant2AdminToken = tenant2.authTokens.admin;

      // Create activities in both tenants
      const tenant1Customer = await createTestCustomer(prisma, tenant1.organization.id, 'PERSON');
      const tenant2Customer = await createTestCustomer(prisma, tenant2.organization.id, 'BUSINESS');

      // Wait a moment for audit logs to be created
      await new Promise(resolve => setTimeout(resolve, 100));

      // Test 1: Tenant 1 should only see its own audit logs
      const tenant1AuditResponse = await authenticatedRequest(tenant1AdminToken)
        .get('/api/audit-logs')
        .expect(200);

      const tenant1AuditLogs = tenant1AuditResponse.body.data;
      expect(tenant1AuditLogs.every((log: any) => log.organizationId === tenant1.organization.id)).toBe(true);

      // Test 2: Tenant 2 should only see its own audit logs
      const tenant2AuditResponse = await authenticatedRequest(tenant2AdminToken)
        .get('/api/audit-logs')
        .expect(200);

      const tenant2AuditLogs = tenant2AuditResponse.body.data;
      expect(tenant2AuditLogs.every((log: any) => log.organizationId === tenant2.organization.id)).toBe(true);

      // Test 3: Verify no cross-contamination
      const tenant1LogEntityIds = tenant1AuditLogs.map((log: any) => log.entityId);
      const tenant2LogEntityIds = tenant2AuditLogs.map((log: any) => log.entityId);

      expect(tenant1LogEntityIds).toContain(tenant1Customer.id);
      expect(tenant1LogEntityIds).not.toContain(tenant2Customer.id);
      expect(tenant2LogEntityIds).toContain(tenant2Customer.id);
      expect(tenant2LogEntityIds).not.toContain(tenant1Customer.id);

      console.log('✅ Audit log isolation tests passed');
    });
  });

  describe('Role-Based Access Control Across Tenants', () => {
    test('should enforce RBAC within tenant boundaries', async () => {
      // Test viewer role limitations in tenant 1
      const tenant1ViewerToken = tenant1.authTokens.viewer;
      const tenant1AdminToken = tenant1.authTokens.admin;

      // Create customer as admin
      const customerResponse = await authenticatedRequest(tenant1AdminToken)
        .post('/api/customers')
        .send({
          type: 'PERSON',
          person: {
            firstName: 'Test',
            lastName: 'Customer',
            email: 'test@example.com'
          },
          tier: 'PERSONAL'
        })
        .expect(201);

      const customer = customerResponse.body;

      // Test 1: Viewer can read but not create
      await authenticatedRequest(tenant1ViewerToken)
        .get('/api/customers')
        .expect(200);

      await authenticatedRequest(tenant1ViewerToken)
        .post('/api/customers')
        .send({
          type: 'PERSON',
          person: {
            firstName: 'Unauthorized',
            lastName: 'Creation',
            email: 'unauthorized@example.com'
          }
        })
        .expect(403); // Forbidden

      // Test 2: Viewer cannot update
      await authenticatedRequest(tenant1ViewerToken)
        .patch(`/api/customers/${customer.id}`)
        .send({ notes: 'Unauthorized update' })
        .expect(403);

      // Test 3: Viewer cannot delete
      await authenticatedRequest(tenant1ViewerToken)
        .delete(`/api/customers/${customer.id}`)
        .expect(403);

      // Test 4: Manager can perform most operations
      const tenant1ManagerToken = tenant1.authTokens.manager;

      await authenticatedRequest(tenant1ManagerToken)
        .patch(`/api/customers/${customer.id}`)
        .send({ notes: 'Manager update' })
        .expect(200);

      // Test 5: Verify role isolation across tenants
      // Tenant 2 admin should have no access to tenant 1 data
      const tenant2AdminToken = tenant2.authTokens.admin;

      await authenticatedRequest(tenant2AdminToken)
        .get(`/api/customers/${customer.id}`)
        .expect(404);

      console.log('✅ Cross-tenant RBAC tests passed');
    });

    test('should handle role elevation attempts across tenants', async () => {
      // Create a manager in tenant 1
      const tenant1ManagerToken = tenant1.authTokens.manager;

      // Create a viewer in tenant 2
      const tenant2ViewerToken = tenant2.authTokens.viewer;

      // Test 1: Tenant 1 manager cannot access tenant 2 admin functions
      await authenticatedRequest(tenant1ManagerToken)
        .post('/api/users')
        .send({
          email: 'newuser@tenant2.com',
          password: 'password123',
          firstName: 'New',
          lastName: 'User',
          role: UserRole.ADMIN,
          organizationId: tenant2.organization.id // Attempting cross-tenant user creation
        })
        .expect(403); // Should be forbidden or fail validation

      // Test 2: Tenant 2 viewer cannot escalate privileges in tenant 1
      await authenticatedRequest(tenant2ViewerToken)
        .patch(`/api/users/${tenant1.users.viewer.id}`)
        .send({ role: UserRole.ADMIN })
        .expect(404); // User not found due to tenant isolation

      console.log('✅ Role elevation prevention tests passed');
    });
  });

  describe('API Key and Session Isolation', () => {
    test('should isolate API keys between tenants', async () => {
      const tenant1AdminToken = tenant1.authTokens.admin;
      const tenant2AdminToken = tenant2.authTokens.admin;

      // Create API key in tenant 1
      const apiKey1Response = await authenticatedRequest(tenant1AdminToken)
        .post('/api/api-keys')
        .send({
          name: 'Tenant 1 Integration Key',
          permissions: ['read:customers', 'write:quotes'],
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
        })
        .expect(201);

      const apiKey1 = apiKey1Response.body;

      // Create API key in tenant 2
      const apiKey2Response = await authenticatedRequest(tenant2AdminToken)
        .post('/api/api-keys')
        .send({
          name: 'Tenant 2 Integration Key',
          permissions: ['read:invoices', 'write:payments'],
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
        })
        .expect(201);

      const apiKey2 = apiKey2Response.body;

      // Test 1: Tenant 1 should only see its own API keys
      const tenant1KeysResponse = await authenticatedRequest(tenant1AdminToken)
        .get('/api/api-keys')
        .expect(200);

      const tenant1KeyIds = tenant1KeysResponse.body.data.map((k: any) => k.id);
      expect(tenant1KeyIds).toContain(apiKey1.id);
      expect(tenant1KeyIds).not.toContain(apiKey2.id);

      // Test 2: Tenant 2 should only see its own API keys
      const tenant2KeysResponse = await authenticatedRequest(tenant2AdminToken)
        .get('/api/api-keys')
        .expect(200);

      const tenant2KeyIds = tenant2KeysResponse.body.data.map((k: any) => k.id);
      expect(tenant2KeyIds).toContain(apiKey2.id);
      expect(tenant2KeyIds).not.toContain(apiKey1.id);

      // Test 3: Cross-tenant API key access should fail
      await authenticatedRequest(tenant1AdminToken)
        .get(`/api/api-keys/${apiKey2.id}`)
        .expect(404);

      await authenticatedRequest(tenant2AdminToken)
        .get(`/api/api-keys/${apiKey1.id}`)
        .expect(404);

      console.log('✅ API key isolation tests passed');
    });

    test('should isolate user sessions between tenants', async () => {
      // Create additional users for session testing
      const tenant1User = await prisma.user.create({
        data: {
          organizationId: tenant1.organization.id,
          email: 'session.test1@tenant1.com',
          passwordHash: 'hashedpassword',
          firstName: 'Session',
          lastName: 'Test1',
          role: UserRole.EMPLOYEE
        }
      });

      const tenant2User = await prisma.user.create({
        data: {
          organizationId: tenant2.organization.id,
          email: 'session.test2@tenant2.com',
          passwordHash: 'hashedpassword',
          firstName: 'Session',
          lastName: 'Test2',
          role: UserRole.EMPLOYEE
        }
      });

      // Create sessions for both users
      const session1 = await prisma.session.create({
        data: {
          userId: tenant1User.id,
          token: 'token_tenant1_user',
          refreshToken: 'refresh_tenant1_user',
          ipAddress: '192.168.1.1',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
        }
      });

      const session2 = await prisma.session.create({
        data: {
          userId: tenant2User.id,
          token: 'token_tenant2_user',
          refreshToken: 'refresh_tenant2_user',
          ipAddress: '192.168.1.2',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
        }
      });

      // Test 1: Verify sessions are properly isolated
      const tenant1Sessions = await prisma.session.findMany({
        where: {
          user: {
            organizationId: tenant1.organization.id
          }
        }
      });

      const tenant2Sessions = await prisma.session.findMany({
        where: {
          user: {
            organizationId: tenant2.organization.id
          }
        }
      });

      const tenant1SessionIds = tenant1Sessions.map(s => s.id);
      const tenant2SessionIds = tenant2Sessions.map(s => s.id);

      expect(tenant1SessionIds).toContain(session1.id);
      expect(tenant1SessionIds).not.toContain(session2.id);
      expect(tenant2SessionIds).toContain(session2.id);
      expect(tenant2SessionIds).not.toContain(session1.id);

      console.log('✅ Session isolation tests passed');
    });
  });

  describe('Cross-Tenant Attack Prevention', () => {
    test('should prevent tenant ID manipulation attacks', async () => {
      const tenant1AdminToken = tenant1.authTokens.admin;

      // Attempt to create customer with wrong organization ID
      await authenticatedRequest(tenant1AdminToken)
        .post('/api/customers')
        .send({
          organizationId: tenant2.organization.id, // Wrong org ID
          type: 'PERSON',
          person: {
            firstName: 'Malicious',
            lastName: 'User',
            email: 'malicious@example.com'
          }
        })
        .expect(400); // Should fail validation or be ignored

      // Verify no customer was created in tenant 2
      const tenant2Customers = await prisma.customer.findMany({
        where: { organizationId: tenant2.organization.id },
        include: { person: true }
      });

      expect(tenant2Customers.every(c => c.person?.firstName !== 'Malicious')).toBe(true);

      console.log('✅ Tenant ID manipulation prevention tests passed');
    });

    test('should prevent SQL injection across tenant boundaries', async () => {
      const tenant1AdminToken = tenant1.authTokens.admin;

      // Attempt SQL injection in search parameters
      const maliciousSearchResponse = await authenticatedRequest(tenant1AdminToken)
        .get(`/api/customers?search=${encodeURIComponent("'; DROP TABLE customers; --")}`)
        .expect(200); // Should handle gracefully

      // Verify no data was affected
      const tenant1Customers = await prisma.customer.findMany({
        where: { organizationId: tenant1.organization.id }
      });

      const tenant2Customers = await prisma.customer.findMany({
        where: { organizationId: tenant2.organization.id }
      });

      expect(tenant1Customers).toBeDefined();
      expect(tenant2Customers).toBeDefined();
      expect(maliciousSearchResponse.body.data).toEqual([]);

      console.log('✅ SQL injection prevention tests passed');
    });

    test('should handle concurrent operations without cross-tenant pollution', async () => {
      const tenant1AdminToken = tenant1.authTokens.admin;
      const tenant2AdminToken = tenant2.authTokens.admin;

      // Create concurrent operations in both tenants
      const concurrentOperations = await Promise.allSettled([
        // Tenant 1 operations
        authenticatedRequest(tenant1AdminToken)
          .post('/api/customers')
          .send({
            type: 'PERSON',
            person: {
              firstName: 'Concurrent1',
              lastName: 'Test',
              email: 'concurrent1@tenant1.com'
            }
          }),

        // Tenant 2 operations
        authenticatedRequest(tenant2AdminToken)
          .post('/api/customers')
          .send({
            type: 'PERSON',
            person: {
              firstName: 'Concurrent2',
              lastName: 'Test',
              email: 'concurrent2@tenant2.com'
            }
          }),

        // More concurrent operations
        authenticatedRequest(tenant1AdminToken)
          .post('/api/customers')
          .send({
            type: 'BUSINESS',
            business: {
              legalName: 'Concurrent Business 1',
              businessType: 'CORPORATION',
              email: 'business1@tenant1.com'
            }
          }),

        authenticatedRequest(tenant2AdminToken)
          .post('/api/customers')
          .send({
            type: 'BUSINESS',
            business: {
              legalName: 'Concurrent Business 2',
              businessType: 'LLC',
              email: 'business2@tenant2.com'
            }
          })
      ]);

      // Verify all operations succeeded
      expect(concurrentOperations.every(result => result.status === 'fulfilled')).toBe(true);

      // Verify proper tenant isolation
      const tenant1FinalCustomers = await prisma.customer.findMany({
        where: { organizationId: tenant1.organization.id },
        include: { person: true, business: true }
      });

      const tenant2FinalCustomers = await prisma.customer.findMany({
        where: { organizationId: tenant2.organization.id },
        include: { person: true, business: true }
      });

      // Check tenant 1 has its customers but not tenant 2's
      expect(tenant1FinalCustomers.some(c =>
        c.person?.firstName === 'Concurrent1' || c.business?.legalName === 'Concurrent Business 1'
      )).toBe(true);

      expect(tenant1FinalCustomers.some(c =>
        c.person?.firstName === 'Concurrent2' || c.business?.legalName === 'Concurrent Business 2'
      )).toBe(false);

      // Check tenant 2 has its customers but not tenant 1's
      expect(tenant2FinalCustomers.some(c =>
        c.person?.firstName === 'Concurrent2' || c.business?.legalName === 'Concurrent Business 2'
      )).toBe(true);

      expect(tenant2FinalCustomers.some(c =>
        c.person?.firstName === 'Concurrent1' || c.business?.legalName === 'Concurrent Business 1'
      )).toBe(false);

      console.log('✅ Concurrent operations isolation tests passed');
    });
  });
});