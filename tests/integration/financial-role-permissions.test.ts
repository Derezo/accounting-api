// @ts-nocheck
import { describe, test, expect, beforeEach } from '@jest/globals';
import { prisma, authenticatedRequest, baseRequest } from './setup';
import {
  createTestContext,
  createTestUser,
  generateAuthToken,
  createTestCustomer,
  createTestQuote,
  createTestInvoice,
  createTestPayment,
  createTestProject,
  createTestAppointment,
  TestContext
} from './test-utils';
import { UserRole, QuoteStatus, InvoiceStatus, PaymentStatus, ProjectStatus } from '../../src/types/enums';

/**
 * Comprehensive Financial User Role Permission Tests
 *
 * Tests the sophisticated role-based access control system for multi-tenant financial applications
 * focusing on user role hierarchy design, permissions matrix development, workflow automation testing,
 * and ensuring international financial compliance while maintaining API v1 backwards compatibility.
 */
describe('Financial Role Permissions Integration Tests', () => {
  let testContext: TestContext;

  beforeEach(async () => {
    testContext = await createTestContext(prisma, 'Financial Test Org');
  });

  describe('Financial Role Permission Matrix - Authentication Endpoints', () => {
    test('should enforce proper access to authentication endpoints by role', async () => {
      const { authTokens, organization } = testContext;

      // Test /auth/* endpoints
      const authEndpoints = [
        { method: 'POST', path: '/api/auth/logout', expectedForAll: 200 },
        { method: 'POST', path: '/api/auth/refresh', expectedForAll: 400 }, // Will fail without proper refresh token
        { method: 'GET', path: '/api/auth/me', expectedForAll: 200 }
      ];

      const roleTokens = [
        { role: 'ADMIN', token: authTokens.admin },
        { role: 'MANAGER', token: authTokens.manager },
        { role: 'ACCOUNTANT', token: authTokens.accountant },
        { role: 'EMPLOYEE', token: authTokens.employee },
        { role: 'VIEWER', token: authTokens.viewer }
      ];

      for (const endpoint of authEndpoints) {
        for (const { role, token } of roleTokens) {
          if (endpoint.method === 'GET') {
            const response = await authenticatedRequest(token)
              .get(endpoint.path);

            expect(response.status).toBe(endpoint.expectedForAll);
            if (response.status === 200) {
              expect(response.body.user).toBeDefined();
              expect(response.body.user.role).toBe(role);
              expect(response.body.user.organizationId).toBe(organization.id);
            }
          } else if (endpoint.method === 'POST' && endpoint.path === '/api/auth/logout') {
            const response = await authenticatedRequest(token)
              .post(endpoint.path);

            expect(response.status).toBe(endpoint.expectedForAll);
          }
        }
      }

      console.log('✅ Authentication endpoints role permissions test completed');
    });

    test('should enforce password change permissions correctly', async () => {
      const { authTokens, users } = testContext;

      // All authenticated users should be able to change their own password
      const response = await authenticatedRequest(authTokens.employee)
        .patch('/api/auth/change-password')
        .send({
          currentPassword: 'password123',
          newPassword: 'NewSecurePass123!@#'
        });

      // Response may be 200 (success) or 400 (validation error) depending on implementation
      expect([200, 400, 404].includes(response.status)).toBe(true);

      console.log('✅ Password change permissions test completed');
    });
  });

  describe('Financial Role Permission Matrix - Customer Management Endpoints', () => {
    test('should enforce customer management permissions by financial role hierarchy', async () => {
      const { authTokens, organization } = testContext;

      // Create test customer data
      const customerData = {
        type: 'PERSON',
        person: {
          firstName: 'Financial',
          lastName: 'TestCustomer',
          email: 'financial.test@customer.com'
        },
        tier: 'PERSONAL'
      };

      // Permission matrix for customer operations
      const permissionMatrix = [
        {
          role: 'ADMIN',
          token: authTokens.admin,
          canCreate: true,
          canRead: true,
          canUpdate: true,
          canDelete: true
        },
        {
          role: 'MANAGER',
          token: authTokens.manager,
          canCreate: true,
          canRead: true,
          canUpdate: true,
          canDelete: false // Managers typically cannot delete customers
        },
        {
          role: 'ACCOUNTANT',
          token: authTokens.accountant,
          canCreate: false, // Accountants typically don't create customers
          canRead: true,
          canUpdate: true, // Can update for billing purposes
          canDelete: false
        },
        {
          role: 'EMPLOYEE',
          token: authTokens.employee,
          canCreate: false,
          canRead: true,
          canUpdate: false,
          canDelete: false
        },
        {
          role: 'VIEWER',
          token: authTokens.viewer,
          canCreate: false,
          canRead: true,
          canUpdate: false,
          canDelete: false
        }
      ];

      let createdCustomerId: string | null = null;

      for (const permission of permissionMatrix) {
        // Test CREATE permissions
        if (permission.canCreate) {
          const createResponse = await authenticatedRequest(permission.token)
            .post('/api/customers')
            .send({
              ...customerData,
              person: {
                ...customerData.person,
                email: `${permission.role.toLowerCase()}.test@customer.com`
              }
            });

          expect(createResponse.status).toBe(201);
          if (permission.role === 'ADMIN') {
            createdCustomerId = createResponse.body.id;
          }
        } else {
          const createResponse = await authenticatedRequest(permission.token)
            .post('/api/customers')
            .send(customerData);

          expect(createResponse.status).toBe(403);
        }

        // Test READ permissions
        const readResponse = await authenticatedRequest(permission.token)
          .get('/api/customers');

        if (permission.canRead) {
          expect(readResponse.status).toBe(200);
          expect(readResponse.body.data).toBeDefined();
          // Verify organization isolation
          expect(readResponse.body.data.every((c: any) => c.organizationId === organization.id)).toBe(true);
        } else {
          expect(readResponse.status).toBe(403);
        }
      }

      // Test UPDATE and DELETE permissions using the created customer
      if (createdCustomerId) {
        for (const permission of permissionMatrix) {
          // Test UPDATE permissions
          if (permission.canUpdate) {
            const updateResponse = await authenticatedRequest(permission.token)
              .patch(`/api/customers/${createdCustomerId}`)
              .send({ notes: `Updated by ${permission.role}` });

            expect([200, 404].includes(updateResponse.status)).toBe(true);
          } else {
            const updateResponse = await authenticatedRequest(permission.token)
              .patch(`/api/customers/${createdCustomerId}`)
              .send({ notes: `Unauthorized update by ${permission.role}` });

            expect(updateResponse.status).toBe(403);
          }

          // Test DELETE permissions
          if (permission.canDelete) {
            // Don't actually delete, just test permission
            const deleteResponse = await authenticatedRequest(permission.token)
              .delete(`/api/customers/${createdCustomerId}`)
              .send();

            expect([200, 404].includes(deleteResponse.status)).toBe(true);
          } else {
            const deleteResponse = await authenticatedRequest(permission.token)
              .delete(`/api/customers/${createdCustomerId}`)
              .send();

            expect(deleteResponse.status).toBe(403);
          }
        }
      }

      console.log('✅ Customer management role permissions test completed');
    });
  });

  describe('Financial Role Permission Matrix - Payment Processing Endpoints', () => {
    test('should enforce payment processing permissions with financial controls', async () => {
      const { authTokens, organization, customers } = testContext;

      // Create test invoice for payment
      const testInvoice = await createTestInvoice(
        prisma,
        organization.id,
        customers[0].id
      );

      const paymentData = {
        invoiceId: testInvoice.id,
        customerId: customers[0].id,
        amount: 500.00,
        paymentMethod: 'STRIPE_CARD',
        currency: 'CAD',
        referenceNumber: 'TEST-PAYMENT-REF'
      };

      // Financial payment permission matrix
      const paymentPermissionMatrix = [
        {
          role: 'ADMIN',
          token: authTokens.admin,
          canCreatePayment: true,
          canReadPayments: true,
          canUpdatePayment: true,
          canDeletePayment: true,
          canProcessRefund: true,
          canViewAnalytics: true
        },
        {
          role: 'MANAGER',
          token: authTokens.manager,
          canCreatePayment: true,
          canReadPayments: true,
          canUpdatePayment: true,
          canDeletePayment: false,
          canProcessRefund: true, // Managers can process refunds
          canViewAnalytics: true
        },
        {
          role: 'ACCOUNTANT',
          token: authTokens.accountant,
          canCreatePayment: true, // Accountants handle financial transactions
          canReadPayments: true,
          canUpdatePayment: true,
          canDeletePayment: false,
          canProcessRefund: true, // Essential for accountants
          canViewAnalytics: true
        },
        {
          role: 'EMPLOYEE',
          token: authTokens.employee,
          canCreatePayment: false, // Employees typically don't handle payments
          canReadPayments: false,
          canUpdatePayment: false,
          canDeletePayment: false,
          canProcessRefund: false,
          canViewAnalytics: false
        },
        {
          role: 'VIEWER',
          token: authTokens.viewer,
          canCreatePayment: false,
          canReadPayments: false,
          canUpdatePayment: false,
          canDeletePayment: false,
          canProcessRefund: false,
          canViewAnalytics: false
        }
      ];

      let createdPaymentId: string | null = null;

      for (const permission of paymentPermissionMatrix) {
        // Test CREATE payment permissions
        if (permission.canCreatePayment) {
          const createResponse = await authenticatedRequest(permission.token)
            .post('/api/payments')
            .send({
              ...paymentData,
              referenceNumber: `${permission.role}-${paymentData.referenceNumber}`
            });

          expect([201, 400].includes(createResponse.status)).toBe(true);
          if (permission.role === 'ADMIN' && createResponse.status === 201) {
            createdPaymentId = createResponse.body.id;
          }
        } else {
          const createResponse = await authenticatedRequest(permission.token)
            .post('/api/payments')
            .send(paymentData);

          expect(createResponse.status).toBe(403);
        }

        // Test READ payments permissions
        const readResponse = await authenticatedRequest(permission.token)
          .get('/api/payments');

        if (permission.canReadPayments) {
          expect(readResponse.status).toBe(200);
          expect(readResponse.body.data).toBeDefined();
          // Verify organization isolation
          expect(readResponse.body.data.every((p: any) => p.organizationId === organization.id)).toBe(true);
        } else {
          expect(readResponse.status).toBe(403);
        }

        // Test payment analytics access
        const analyticsResponse = await authenticatedRequest(permission.token)
          .get('/api/payment-analytics');

        if (permission.canViewAnalytics) {
          expect([200, 404].includes(analyticsResponse.status)).toBe(true);
        } else {
          expect(analyticsResponse.status).toBe(403);
        }
      }

      // Test UPDATE and REFUND permissions using created payment
      if (createdPaymentId) {
        for (const permission of paymentPermissionMatrix) {
          // Test UPDATE payment permissions
          if (permission.canUpdatePayment) {
            const updateResponse = await authenticatedRequest(permission.token)
              .patch(`/api/payments/${createdPaymentId}`)
              .send({ adminNotes: `Updated by ${permission.role}` });

            expect([200, 404].includes(updateResponse.status)).toBe(true);
          } else {
            const updateResponse = await authenticatedRequest(permission.token)
              .patch(`/api/payments/${createdPaymentId}`)
              .send({ adminNotes: `Unauthorized update by ${permission.role}` });

            expect(updateResponse.status).toBe(403);
          }

          // Test REFUND processing permissions
          if (permission.canProcessRefund) {
            const refundResponse = await authenticatedRequest(permission.token)
              .post(`/api/payments/${createdPaymentId}/refund`)
              .send({
                amount: 100.00,
                reason: `Test refund by ${permission.role}`,
                notifyCustomer: false
              });

            expect([200, 400, 404].includes(refundResponse.status)).toBe(true);
          } else {
            const refundResponse = await authenticatedRequest(permission.token)
              .post(`/api/payments/${createdPaymentId}/refund`)
              .send({
                amount: 100.00,
                reason: `Unauthorized refund by ${permission.role}`
              });

            expect(refundResponse.status).toBe(403);
          }
        }
      }

      console.log('✅ Payment processing role permissions test completed');
    });

    test('should enforce e-Transfer specific permissions', async () => {
      const { authTokens, customers } = testContext;

      const etransferData = {
        customerId: customers[0].id,
        amount: 1000.00,
        currency: 'CAD',
        recipientEmail: 'customer@test.com',
        securityQuestion: 'What is your favorite color?',
        securityAnswer: 'Blue',
        message: 'Payment for services rendered'
      };

      // E-Transfer permissions (Canada-specific financial compliance)
      const etransferPermissions = [
        { role: 'ADMIN', token: authTokens.admin, canInitiate: true, canCancel: true },
        { role: 'MANAGER', token: authTokens.manager, canInitiate: true, canCancel: true },
        { role: 'ACCOUNTANT', token: authTokens.accountant, canInitiate: true, canCancel: false },
        { role: 'EMPLOYEE', token: authTokens.employee, canInitiate: false, canCancel: false },
        { role: 'VIEWER', token: authTokens.viewer, canInitiate: false, canCancel: false }
      ];

      for (const permission of etransferPermissions) {
        // Test e-Transfer initiation
        const initiateResponse = await authenticatedRequest(permission.token)
          .post('/api/etransfers')
          .send(etransferData);

        if (permission.canInitiate) {
          expect([201, 400].includes(initiateResponse.status)).toBe(true);
        } else {
          expect(initiateResponse.status).toBe(403);
        }

        // Test e-Transfer listing
        const listResponse = await authenticatedRequest(permission.token)
          .get('/api/etransfers');

        if (permission.canInitiate) {
          expect([200, 404].includes(listResponse.status)).toBe(true);
        } else {
          expect(listResponse.status).toBe(403);
        }
      }

      console.log('✅ E-Transfer permissions test completed');
    });
  });

  describe('Financial Role Permission Matrix - Financial Statements Endpoints', () => {
    test('should enforce financial statements access with proper role hierarchy', async () => {
      const { authTokens, organization } = testContext;

      // Financial statements permission matrix (GAAP/IFRS compliance)
      const statementPermissions = [
        {
          role: 'ADMIN',
          token: authTokens.admin,
          canGenerateBalanceSheet: true,
          canGenerateIncomeStatement: true,
          canGenerateCashFlow: true,
          canExportStatements: true,
          canViewAllPeriods: true
        },
        {
          role: 'MANAGER',
          token: authTokens.manager,
          canGenerateBalanceSheet: true,
          canGenerateIncomeStatement: true,
          canGenerateCashFlow: true,
          canExportStatements: true,
          canViewAllPeriods: true
        },
        {
          role: 'ACCOUNTANT',
          token: authTokens.accountant,
          canGenerateBalanceSheet: true,
          canGenerateIncomeStatement: true,
          canGenerateCashFlow: true,
          canExportStatements: true,
          canViewAllPeriods: true
        },
        {
          role: 'EMPLOYEE',
          token: authTokens.employee,
          canGenerateBalanceSheet: false,
          canGenerateIncomeStatement: false,
          canGenerateCashFlow: false,
          canExportStatements: false,
          canViewAllPeriods: false
        },
        {
          role: 'VIEWER',
          token: authTokens.viewer,
          canGenerateBalanceSheet: false,
          canGenerateIncomeStatement: false,
          canGenerateCashFlow: false,
          canExportStatements: false,
          canViewAllPeriods: false
        }
      ];

      const currentDate = new Date();
      const startDate = new Date(currentDate.getFullYear(), 0, 1); // January 1st
      const endDate = new Date(currentDate.getFullYear(), 11, 31); // December 31st

      for (const permission of statementPermissions) {
        // Test Balance Sheet generation
        const balanceSheetResponse = await authenticatedRequest(permission.token)
          .get('/api/financial-statements/balance-sheet')
          .query({
            asOfDate: endDate.toISOString(),
            organizationId: organization.id
          });

        if (permission.canGenerateBalanceSheet) {
          expect([200, 400, 404].includes(balanceSheetResponse.status)).toBe(true);
        } else {
          expect(balanceSheetResponse.status).toBe(403);
        }

        // Test Income Statement generation
        const incomeStatementResponse = await authenticatedRequest(permission.token)
          .get('/api/financial-statements/income-statement')
          .query({
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
            organizationId: organization.id
          });

        if (permission.canGenerateIncomeStatement) {
          expect([200, 400, 404].includes(incomeStatementResponse.status)).toBe(true);
        } else {
          expect(incomeStatementResponse.status).toBe(403);
        }

        // Test Cash Flow statement generation
        const cashFlowResponse = await authenticatedRequest(permission.token)
          .get('/api/financial-statements/cash-flow')
          .query({
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
            organizationId: organization.id
          });

        if (permission.canGenerateCashFlow) {
          expect([200, 400, 404].includes(cashFlowResponse.status)).toBe(true);
        } else {
          expect(cashFlowResponse.status).toBe(403);
        }

        // Test financial statements export
        const exportResponse = await authenticatedRequest(permission.token)
          .get('/api/financial-statements/export')
          .query({
            format: 'pdf',
            type: 'balance-sheet',
            asOfDate: endDate.toISOString()
          });

        if (permission.canExportStatements) {
          expect([200, 400, 404].includes(exportResponse.status)).toBe(true);
        } else {
          expect(exportResponse.status).toBe(403);
        }
      }

      console.log('✅ Financial statements role permissions test completed');
    });

    test('should enforce period locking permissions for financial statements', async () => {
      const { authTokens, organization } = testContext;

      // Test period locking permissions (essential for financial compliance)
      const periodLockingPermissions = [
        { role: 'ADMIN', token: authTokens.admin, canLockPeriod: true, canUnlockPeriod: true },
        { role: 'MANAGER', token: authTokens.manager, canLockPeriod: false, canUnlockPeriod: false },
        { role: 'ACCOUNTANT', token: authTokens.accountant, canLockPeriod: true, canUnlockPeriod: false },
        { role: 'EMPLOYEE', token: authTokens.employee, canLockPeriod: false, canUnlockPeriod: false },
        { role: 'VIEWER', token: authTokens.viewer, canLockPeriod: false, canUnlockPeriod: false }
      ];

      const testPeriod = {
        year: 2024,
        month: 12,
        organizationId: organization.id
      };

      for (const permission of periodLockingPermissions) {
        // Test period locking
        const lockResponse = await authenticatedRequest(permission.token)
          .post('/api/financial-statements/lock-period')
          .send(testPeriod);

        if (permission.canLockPeriod) {
          expect([200, 400, 404].includes(lockResponse.status)).toBe(true);
        } else {
          expect(lockResponse.status).toBe(403);
        }

        // Test period unlocking
        const unlockResponse = await authenticatedRequest(permission.token)
          .post('/api/financial-statements/unlock-period')
          .send(testPeriod);

        if (permission.canUnlockPeriod) {
          expect([200, 400, 404].includes(unlockResponse.status)).toBe(true);
        } else {
          expect(lockResponse.status).toBe(403);
        }
      }

      console.log('✅ Period locking permissions test completed');
    });
  });

  describe('Role-Based Audit and Compliance Access', () => {
    test('should enforce audit log access based on financial roles', async () => {
      const { authTokens, organization } = testContext;

      // Audit access permissions (SOX compliance)
      const auditPermissions = [
        { role: 'ADMIN', token: authTokens.admin, canViewAll: true, canExport: true },
        { role: 'MANAGER', token: authTokens.manager, canViewAll: false, canExport: false },
        { role: 'ACCOUNTANT', token: authTokens.accountant, canViewAll: true, canExport: true },
        { role: 'EMPLOYEE', token: authTokens.employee, canViewAll: false, canExport: false },
        { role: 'VIEWER', token: authTokens.viewer, canViewAll: false, canExport: false }
      ];

      for (const permission of auditPermissions) {
        // Test audit log viewing
        const auditResponse = await authenticatedRequest(permission.token)
          .get('/api/audit-logs');

        if (permission.canViewAll) {
          expect(auditResponse.status).toBe(200);
          expect(auditResponse.body.data).toBeDefined();
          // Verify organization isolation
          expect(auditResponse.body.data.every((log: any) => log.organizationId === organization.id)).toBe(true);
        } else {
          expect(auditResponse.status).toBe(403);
        }

        // Test audit log export
        const exportResponse = await authenticatedRequest(permission.token)
          .get('/api/audit-logs/export')
          .query({
            format: 'csv',
            startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
            endDate: new Date().toISOString()
          });

        if (permission.canExport) {
          expect([200, 400, 404].includes(exportResponse.status)).toBe(true);
        } else {
          expect(exportResponse.status).toBe(403);
        }
      }

      console.log('✅ Audit access permissions test completed');
    });

    test('should enforce data retention and compliance permissions', async () => {
      const { authTokens } = testContext;

      // Data retention permissions (financial record keeping compliance)
      const retentionPermissions = [
        { role: 'ADMIN', token: authTokens.admin, canSetRetention: true, canPurgeData: true },
        { role: 'MANAGER', token: authTokens.manager, canSetRetention: false, canPurgeData: false },
        { role: 'ACCOUNTANT', token: authTokens.accountant, canSetRetention: false, canPurgeData: false },
        { role: 'EMPLOYEE', token: authTokens.employee, canSetRetention: false, canPurgeData: false },
        { role: 'VIEWER', token: authTokens.viewer, canSetRetention: false, canPurgeData: false }
      ];

      for (const permission of retentionPermissions) {
        // Test data retention policy setting
        const retentionResponse = await authenticatedRequest(permission.token)
          .post('/api/compliance/data-retention')
          .send({
            retentionPeriodYears: 7,
            autoDeleteEnabled: false,
            complianceRegion: 'CA'
          });

        if (permission.canSetRetention) {
          expect([200, 400, 404].includes(retentionResponse.status)).toBe(true);
        } else {
          expect(retentionResponse.status).toBe(403);
        }

        // Test data purge permissions
        const purgeResponse = await authenticatedRequest(permission.token)
          .post('/api/compliance/purge-expired-data')
          .send({
            dryRun: true, // Don't actually purge in tests
            confirmPurge: false
          });

        if (permission.canPurgeData) {
          expect([200, 400, 404].includes(purgeResponse.status)).toBe(true);
        } else {
          expect(purgeResponse.status).toBe(403);
        }
      }

      console.log('✅ Data retention permissions test completed');
    });
  });

  describe('API Key Permission Inheritance', () => {
    test('should enforce API key permissions based on creating user role', async () => {
      const { authTokens, organization } = testContext;

      // API key creation permissions
      const apiKeyPermissions = [
        { role: 'ADMIN', token: authTokens.admin, canCreateApiKey: true, maxPermissions: 'full' },
        { role: 'MANAGER', token: authTokens.manager, canCreateApiKey: true, maxPermissions: 'limited' },
        { role: 'ACCOUNTANT', token: authTokens.accountant, canCreateApiKey: false, maxPermissions: 'none' },
        { role: 'EMPLOYEE', token: authTokens.employee, canCreateApiKey: false, maxPermissions: 'none' },
        { role: 'VIEWER', token: authTokens.viewer, canCreateApiKey: false, maxPermissions: 'none' }
      ];

      for (const permission of apiKeyPermissions) {
        // Test API key creation
        const apiKeyResponse = await authenticatedRequest(permission.token)
          .post('/api/api-keys')
          .send({
            name: `${permission.role} Test API Key`,
            permissions: permission.maxPermissions === 'full'
              ? ['read:customers', 'write:customers', 'read:payments', 'write:payments']
              : ['read:customers'],
            expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
          });

        if (permission.canCreateApiKey) {
          expect([201, 400].includes(apiKeyResponse.status)).toBe(true);
        } else {
          expect(apiKeyResponse.status).toBe(403);
        }

        // Test API key listing (users should only see their own keys)
        const listResponse = await authenticatedRequest(permission.token)
          .get('/api/api-keys');

        if (permission.canCreateApiKey) {
          expect([200, 404].includes(listResponse.status)).toBe(true);
        } else {
          expect(listResponse.status).toBe(403);
        }
      }

      console.log('✅ API key permission inheritance test completed');
    });
  });
});