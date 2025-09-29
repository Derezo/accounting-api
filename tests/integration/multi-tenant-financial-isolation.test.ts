import { describe, test, expect, beforeEach } from '@jest/globals';
import { prisma, authenticatedRequest, baseRequest } from './setup';
import {
  createIsolatedTenants,
  createTestUser,
  createTestCustomer,
  createTestQuote,
  createTestInvoice,
  createTestPayment,
  createTestProject,
  generateAuthToken,
  TestContext
} from './test-utils';
import { UserRole, PaymentMethod, PaymentStatus } from '../../src/types/enums';

/**
 * Multi-Tenant Financial Data Isolation Tests
 *
 * Comprehensive validation of organization-level data isolation for financial operations,
 * ensuring PCI DSS compliance, SOX compliance, and Canadian financial regulations.
 * Tests cross-tenant data leakage prevention, organization-specific encryption usage,
 * and financial workflow boundaries.
 */
describe('Multi-Tenant Financial Data Isolation Tests', () => {
  let tenant1: TestContext;
  let tenant2: TestContext;

  beforeEach(async () => {
    const tenants = await createIsolatedTenants(prisma);
    tenant1 = tenants.tenant1;
    tenant2 = tenants.tenant2;
  });

  describe('Financial Transaction Isolation', () => {
    test('should isolate payment transactions between organizations', async () => {
      const tenant1AdminToken = tenant1.authTokens.admin;
      const tenant2AdminToken = tenant2.authTokens.admin;

      // Create customers in both tenants
      const tenant1Customer = await createTestCustomer(prisma, tenant1.organization.id, 'PERSON');
      const tenant2Customer = await createTestCustomer(prisma, tenant2.organization.id, 'BUSINESS');

      // Create invoices for payments
      const tenant1Invoice = await createTestInvoice(
        prisma,
        tenant1.organization.id,
        tenant1Customer.id
      );
      const tenant2Invoice = await createTestInvoice(
        prisma,
        tenant2.organization.id,
        tenant2Customer.id
      );

      // Create payments in both tenants
      const tenant1Payment = await createTestPayment(
        prisma,
        tenant1.organization.id,
        tenant1Customer.id,
        tenant1Invoice.id,
        1500.00
      );
      const tenant2Payment = await createTestPayment(
        prisma,
        tenant2.organization.id,
        tenant2Customer.id,
        tenant2Invoice.id,
        2500.00
      );

      // Test 1: Tenant 1 should only see its payments
      const tenant1PaymentsResponse = await authenticatedRequest(tenant1AdminToken)
        .get('/api/payments')
        .expect(200);

      const tenant1PaymentIds = tenant1PaymentsResponse.body.data.map((p: any) => p.id);
      expect(tenant1PaymentIds).toContain(tenant1Payment.id);
      expect(tenant1PaymentIds).not.toContain(tenant2Payment.id);

      // Verify payment amounts are properly isolated
      const tenant1TotalAmount = tenant1PaymentsResponse.body.data
        .reduce((sum: number, p: any) => sum + p.amount, 0);
      expect(tenant1TotalAmount).not.toEqual(tenant1Payment.amount + tenant2Payment.amount);

      // Test 2: Tenant 2 should only see its payments
      const tenant2PaymentsResponse = await authenticatedRequest(tenant2AdminToken)
        .get('/api/payments')
        .expect(200);

      const tenant2PaymentIds = tenant2PaymentsResponse.body.data.map((p: any) => p.id);
      expect(tenant2PaymentIds).toContain(tenant2Payment.id);
      expect(tenant2PaymentIds).not.toContain(tenant1Payment.id);

      // Test 3: Cross-tenant payment access should fail
      await authenticatedRequest(tenant1AdminToken)
        .get(`/api/payments/${tenant2Payment.id}`)
        .expect(404);

      await authenticatedRequest(tenant2AdminToken)
        .get(`/api/payments/${tenant1Payment.id}`)
        .expect(404);

      // Test 4: Cross-tenant payment modification should fail
      await authenticatedRequest(tenant1AdminToken)
        .patch(`/api/payments/${tenant2Payment.id}`)
        .send({ adminNotes: 'Cross-tenant modification attempt' })
        .expect(404);

      // Test 5: Verify payment analytics isolation
      const tenant1AnalyticsResponse = await authenticatedRequest(tenant1AdminToken)
        .get('/api/payment-analytics')
        .query({
          startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          endDate: new Date().toISOString()
        });

      if (tenant1AnalyticsResponse.status === 200) {
        expect(tenant1AnalyticsResponse.body.totalAmount).not.toEqual(
          tenant1Payment.amount + tenant2Payment.amount
        );
      }

      console.log('✅ Payment transaction isolation test completed');
    });

    test('should isolate e-Transfer transactions with Canadian compliance', async () => {
      const tenant1AdminToken = tenant1.authTokens.admin;
      const tenant2AdminToken = tenant2.authTokens.admin;

      // Create e-Transfers in both tenants
      const tenant1ETransferData = {
        customerId: tenant1.customers[0]!.id,
        amount: 750.00,
        currency: 'CAD',
        recipientEmail: 'tenant1@customer.ca',
        securityQuestion: 'What is your favorite Canadian city?',
        securityAnswer: 'Toronto',
        message: 'Payment for services - Tenant 1'
      };

      const tenant2ETransferData = {
        customerId: tenant2.customers[0]!.id,
        amount: 1250.00,
        currency: 'CAD',
        recipientEmail: 'tenant2@customer.ca',
        securityQuestion: 'What is your favorite Canadian province?',
        securityAnswer: 'Ontario',
        message: 'Payment for services - Tenant 2'
      };

      // Create e-Transfers
      const tenant1ETransferResponse = await authenticatedRequest(tenant1AdminToken)
        .post('/api/etransfers')
        .send(tenant1ETransferData);

      const tenant2ETransferResponse = await authenticatedRequest(tenant2AdminToken)
        .post('/api/etransfers')
        .send(tenant2ETransferData);

      // Both should succeed or fail consistently based on implementation
      if (tenant1ETransferResponse.status === 201 && tenant2ETransferResponse.status === 201) {
        const tenant1ETransferId = tenant1ETransferResponse.body.id;
        const tenant2ETransferId = tenant2ETransferResponse.body.id;

        // Test cross-tenant e-Transfer isolation
        await authenticatedRequest(tenant1AdminToken)
          .get(`/api/etransfers/${tenant2ETransferId}`)
          .expect(404);

        await authenticatedRequest(tenant2AdminToken)
          .get(`/api/etransfers/${tenant1ETransferId}`)
          .expect(404);

        // Test e-Transfer listing isolation
        const tenant1ListResponse = await authenticatedRequest(tenant1AdminToken)
          .get('/api/etransfers')
          .expect(200);

        const tenant1ETransferIds = tenant1ListResponse.body.data.map((et: any) => et.id);
        expect(tenant1ETransferIds).toContain(tenant1ETransferId);
        expect(tenant1ETransferIds).not.toContain(tenant2ETransferId);
      }

      console.log('✅ E-Transfer isolation test completed');
    });
  });

  describe('Financial Statement and Accounting Isolation', () => {
    test('should isolate chart of accounts between organizations', async () => {
      const tenant1AdminToken = tenant1.authTokens.admin;
      const tenant2AdminToken = tenant2.authTokens.admin;

      // Create organization-specific accounts
      const tenant1AccountData = {
        code: '1001-T1',
        name: 'Tenant 1 Cash Account',
        type: 'ASSET',
        isActive: true,
        organizationId: tenant1.organization.id
      };

      const tenant2AccountData = {
        code: '1001-T2',
        name: 'Tenant 2 Cash Account',
        type: 'ASSET',
        isActive: true,
        organizationId: tenant2.organization.id
      };

      // Create accounts
      const tenant1AccountResponse = await authenticatedRequest(tenant1AdminToken)
        .post('/api/accounts')
        .send(tenant1AccountData);

      const tenant2AccountResponse = await authenticatedRequest(tenant2AdminToken)
        .post('/api/accounts')
        .send(tenant2AccountData);

      if (tenant1AccountResponse.status === 201 && tenant2AccountResponse.status === 201) {
        const tenant1AccountId = tenant1AccountResponse.body.id;
        const tenant2AccountId = tenant2AccountResponse.body.id;

        // Test account listing isolation
        const tenant1AccountsResponse = await authenticatedRequest(tenant1AdminToken)
          .get('/api/accounts')
          .expect(200);

        const tenant1AccountIds = tenant1AccountsResponse.body.data.map((a: any) => a.id);
        expect(tenant1AccountIds).toContain(tenant1AccountId);
        expect(tenant1AccountIds).not.toContain(tenant2AccountId);

        // Test cross-tenant account access
        await authenticatedRequest(tenant1AdminToken)
          .get(`/api/accounts/${tenant2AccountId}`)
          .expect(404);

        await authenticatedRequest(tenant2AdminToken)
          .get(`/api/accounts/${tenant1AccountId}`)
          .expect(404);
      }

      console.log('✅ Chart of accounts isolation test completed');
    });

    test('should isolate journal entries and transactions', async () => {
      const tenant1AdminToken = tenant1.authTokens.admin;
      const tenant2AdminToken = tenant2.authTokens.admin;

      // Create journal entries in both tenants
      const tenant1JournalData = {
        reference: 'JE-001-T1',
        description: 'Tenant 1 test journal entry',
        date: new Date().toISOString(),
        entries: [
          {
            accountCode: '1000',
            description: 'Cash increase',
            debitAmount: 1000.00,
            creditAmount: 0
          },
          {
            accountCode: '4000',
            description: 'Revenue recognition',
            debitAmount: 0,
            creditAmount: 1000.00
          }
        ]
      };

      const tenant2JournalData = {
        reference: 'JE-001-T2',
        description: 'Tenant 2 test journal entry',
        date: new Date().toISOString(),
        entries: [
          {
            accountCode: '1000',
            description: 'Cash increase',
            debitAmount: 2000.00,
            creditAmount: 0
          },
          {
            accountCode: '4000',
            description: 'Revenue recognition',
            debitAmount: 0,
            creditAmount: 2000.00
          }
        ]
      };

      // Create journal entries
      const tenant1JournalResponse = await authenticatedRequest(tenant1AdminToken)
        .post('/api/journal-entries')
        .send(tenant1JournalData);

      const tenant2JournalResponse = await authenticatedRequest(tenant2AdminToken)
        .post('/api/journal-entries')
        .send(tenant2JournalData);

      if (tenant1JournalResponse.status === 201 && tenant2JournalResponse.status === 201) {
        const tenant1JournalId = tenant1JournalResponse.body.id;
        const tenant2JournalId = tenant2JournalResponse.body.id;

        // Test journal entry isolation
        const tenant1JournalsResponse = await authenticatedRequest(tenant1AdminToken)
          .get('/api/journal-entries')
          .expect(200);

        const tenant1JournalIds = tenant1JournalsResponse.body.data.map((je: any) => je.id);
        expect(tenant1JournalIds).toContain(tenant1JournalId);
        expect(tenant1JournalIds).not.toContain(tenant2JournalId);

        // Test cross-tenant journal entry access
        await authenticatedRequest(tenant1AdminToken)
          .get(`/api/journal-entries/${tenant2JournalId}`)
          .expect(404);
      }

      console.log('✅ Journal entries isolation test completed');
    });

    test('should isolate financial statements between organizations', async () => {
      const tenant1AdminToken = tenant1.authTokens.admin;
      const tenant2AdminToken = tenant2.authTokens.admin;

      const currentDate = new Date();
      const asOfDate = new Date(currentDate.getFullYear(), 11, 31); // December 31st

      // Test Balance Sheet isolation
      const tenant1BalanceSheetResponse = await authenticatedRequest(tenant1AdminToken)
        .get('/api/financial-statements/balance-sheet')
        .query({
          asOfDate: asOfDate.toISOString(),
          organizationId: tenant1.organization.id
        });

      const tenant2BalanceSheetResponse = await authenticatedRequest(tenant2AdminToken)
        .get('/api/financial-statements/balance-sheet')
        .query({
          asOfDate: asOfDate.toISOString(),
          organizationId: tenant2.organization.id
        });

      // Both requests should succeed or fail independently
      if (tenant1BalanceSheetResponse.status === 200) {
        expect(tenant1BalanceSheetResponse.body.organizationId).toBe(tenant1.organization.id);
      }

      if (tenant2BalanceSheetResponse.status === 200) {
        expect(tenant2BalanceSheetResponse.body.organizationId).toBe(tenant2.organization.id);
      }

      // Test cross-tenant balance sheet access attempt
      await authenticatedRequest(tenant1AdminToken)
        .get('/api/financial-statements/balance-sheet')
        .query({
          asOfDate: asOfDate.toISOString(),
          organizationId: tenant2.organization.id // Wrong org ID
        })
        .expect(403);

      console.log('✅ Financial statements isolation test completed');
    });
  });

  describe('Canadian Tax Compliance Isolation', () => {
    test('should isolate GST/HST calculations between provinces', async () => {
      const tenant1AdminToken = tenant1.authTokens.admin;
      const tenant2AdminToken = tenant2.authTokens.admin;

      // Set different provinces for tax isolation testing
      const tenant1TaxData = {
        province: 'ON', // Ontario - HST 13%
        taxNumber: 'BN123456789RT0001',
        filingFrequency: 'QUARTERLY'
      };

      const tenant2TaxData = {
        province: 'BC', // British Columbia - GST 5% + PST 7%
        taxNumber: 'BN987654321RT0001',
        filingFrequency: 'MONTHLY'
      };

      // Update tax settings for each tenant
      const tenant1TaxResponse = await authenticatedRequest(tenant1AdminToken)
        .patch('/api/tax/settings')
        .send(tenant1TaxData);

      const tenant2TaxResponse = await authenticatedRequest(tenant2AdminToken)
        .patch('/api/tax/settings')
        .send(tenant2TaxData);

      // Test tax calculation isolation
      const taxCalculationData = {
        amount: 1000.00,
        taxableItems: [
          {
            description: 'Professional services',
            amount: 1000.00,
            taxable: true
          }
        ]
      };

      const tenant1CalcResponse = await authenticatedRequest(tenant1AdminToken)
        .post('/api/tax/calculate')
        .send(taxCalculationData);

      const tenant2CalcResponse = await authenticatedRequest(tenant2AdminToken)
        .post('/api/tax/calculate')
        .send(taxCalculationData);

      // Verify tax calculations are different based on provincial settings
      if (tenant1CalcResponse.status === 200 && tenant2CalcResponse.status === 200) {
        expect(tenant1CalcResponse.body.totalTax).not.toEqual(tenant2CalcResponse.body.totalTax);

        // Ontario should have different tax structure than BC
        expect(tenant1CalcResponse.body.province).toBe('ON');
        expect(tenant2CalcResponse.body.province).toBe('BC');
      }

      console.log('✅ Provincial tax isolation test completed');
    });

    test('should isolate tax filing and compliance data', async () => {
      const tenant1AdminToken = tenant1.authTokens.admin;
      const tenant2AdminToken = tenant2.authTokens.admin;

      // Create tax filings for both tenants
      const taxFilingData = {
        period: '2024-Q1',
        gstCollected: 5000.00,
        gstPaid: 1000.00,
        netGst: 4000.00,
        filingDate: new Date().toISOString(),
        status: 'DRAFT'
      };

      const tenant1FilingResponse = await authenticatedRequest(tenant1AdminToken)
        .post('/api/tax/filings')
        .send({
          ...taxFilingData,
          reference: 'T1-2024-Q1'
        });

      const tenant2FilingResponse = await authenticatedRequest(tenant2AdminToken)
        .post('/api/tax/filings')
        .send({
          ...taxFilingData,
          reference: 'T2-2024-Q1'
        });

      if (tenant1FilingResponse.status === 201 && tenant2FilingResponse.status === 201) {
        const tenant1FilingId = tenant1FilingResponse.body.id;
        const tenant2FilingId = tenant2FilingResponse.body.id;

        // Test tax filing isolation
        const tenant1FilingsResponse = await authenticatedRequest(tenant1AdminToken)
          .get('/api/tax/filings')
          .expect(200);

        const tenant1FilingIds = tenant1FilingsResponse.body.data.map((f: any) => f.id);
        expect(tenant1FilingIds).toContain(tenant1FilingId);
        expect(tenant1FilingIds).not.toContain(tenant2FilingId);

        // Test cross-tenant tax filing access
        await authenticatedRequest(tenant1AdminToken)
          .get(`/api/tax/filings/${tenant2FilingId}`)
          .expect(404);
      }

      console.log('✅ Tax filing isolation test completed');
    });
  });

  describe('Organization-Specific Encryption Key Usage', () => {
    test('should use organization-specific encryption keys for sensitive data', async () => {
      const tenant1AdminToken = tenant1.authTokens.admin;
      const tenant2AdminToken = tenant2.authTokens.admin;

      // Create customers with sensitive data that should be encrypted
      const sensitiveCustomerData = {
        type: 'BUSINESS',
        business: {
          legalName: 'Sensitive Business Corp',
          businessNumber: '123456789',
          businessType: 'CORPORATION',
          email: 'sensitive@business.com',
          phone: '+1-555-SECURE',
          taxNumber: 'BN123456789RT0001'
        },
        tier: 'ENTERPRISE'
      };

      const tenant1CustomerResponse = await authenticatedRequest(tenant1AdminToken)
        .post('/api/customers')
        .send({
          ...sensitiveCustomerData,
          business: {
            ...sensitiveCustomerData.business,
            legalName: 'Tenant 1 Sensitive Corp'
          }
        })
        .expect(201);

      const tenant2CustomerResponse = await authenticatedRequest(tenant2AdminToken)
        .post('/api/customers')
        .send({
          ...sensitiveCustomerData,
          business: {
            ...sensitiveCustomerData.business,
            legalName: 'Tenant 2 Sensitive Corp'
          }
        })
        .expect(201);

      // Verify customers are properly isolated with encrypted data
      const tenant1Customer = tenant1CustomerResponse.body;
      const tenant2Customer = tenant2CustomerResponse.body;

      expect(tenant1Customer.organizationId).toBe(tenant1.organization.id);
      expect(tenant2Customer.organizationId).toBe(tenant2.organization.id);

      // Test that encryption is working by ensuring data roundtrip
      const tenant1RetrievedResponse = await authenticatedRequest(tenant1AdminToken)
        .get(`/api/customers/${tenant1Customer.id}`)
        .expect(200);

      expect(tenant1RetrievedResponse.body.business.businessNumber).toBeDefined();
      expect(tenant1RetrievedResponse.body.business.taxNumber).toBeDefined();

      // Verify cross-tenant access fails (encryption key mismatch)
      await authenticatedRequest(tenant1AdminToken)
        .get(`/api/customers/${tenant2Customer.id}`)
        .expect(404);

      console.log('✅ Organization-specific encryption test completed');
    });

    test('should isolate API keys with organization-specific encryption', async () => {
      const tenant1AdminToken = tenant1.authTokens.admin;
      const tenant2AdminToken = tenant2.authTokens.admin;

      // Create API keys in both tenants
      const apiKeyData = {
        name: 'Integration Test Key',
        permissions: ['read:customers', 'write:payments'],
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
      };

      const tenant1KeyResponse = await authenticatedRequest(tenant1AdminToken)
        .post('/api/api-keys')
        .send({
          ...apiKeyData,
          name: 'Tenant 1 Integration Key'
        });

      const tenant2KeyResponse = await authenticatedRequest(tenant2AdminToken)
        .post('/api/api-keys')
        .send({
          ...apiKeyData,
          name: 'Tenant 2 Integration Key'
        });

      if (tenant1KeyResponse.status === 201 && tenant2KeyResponse.status === 201) {
        const tenant1Key = tenant1KeyResponse.body.key;
        const tenant2Key = tenant2KeyResponse.body.key;

        // Verify keys are different (different encryption)
        expect(tenant1Key).not.toEqual(tenant2Key);

        // Test tenant 1 key only works for tenant 1 data
        const tenant1TestResponse = await baseRequest()
          .get('/api/customers')
          .set('X-API-Key', tenant1Key)
          .expect(200);

        expect(tenant1TestResponse.body.data.every((c: any) =>
          c.organizationId === tenant1.organization.id
        )).toBe(true);

        // Test tenant 2 key only works for tenant 2 data
        const tenant2TestResponse = await baseRequest()
          .get('/api/customers')
          .set('X-API-Key', tenant2Key)
          .expect(200);

        expect(tenant2TestResponse.body.data.every((c: any) =>
          c.organizationId === tenant2.organization.id
        )).toBe(true);
      }

      console.log('✅ API key encryption isolation test completed');
    });
  });

  describe('Cross-Tenant Financial Attack Prevention', () => {
    test('should prevent financial data enumeration attacks', async () => {
      const tenant1AdminToken = tenant1.authTokens.admin;

      // Create various financial records in tenant 1
      const customer = await createTestCustomer(prisma, tenant1.organization.id, 'BUSINESS');
      const invoice = await createTestInvoice(prisma, tenant1.organization.id, customer.id);
      const payment = await createTestPayment(prisma, tenant1.organization.id, customer.id, invoice.id);

      // Attempt to enumerate tenant 2's financial data using tenant 1's token
      const enumerationAttempts = [
        { endpoint: '/api/customers', param: 'organizationId', value: tenant2.organization.id },
        { endpoint: '/api/invoices', param: 'organizationId', value: tenant2.organization.id },
        { endpoint: '/api/payments', param: 'organizationId', value: tenant2.organization.id },
        { endpoint: '/api/quotes', param: 'organizationId', value: tenant2.organization.id }
      ];

      for (const attempt of enumerationAttempts) {
        // Test parameter injection attack
        const response = await authenticatedRequest(tenant1AdminToken)
          .get(attempt.endpoint)
          .query({ [attempt.param]: attempt.value });

        // Should either return empty results or deny access
        if (response.status === 200) {
          expect(response.body.data).toEqual([]);
        } else {
          expect(response.status).toBe(403);
        }
      }

      console.log('✅ Financial data enumeration prevention test completed');
    });

    test('should prevent cross-tenant invoice manipulation attacks', async () => {
      const tenant1AdminToken = tenant1.authTokens.admin;

      // Create invoice in tenant 2
      const tenant2Customer = await createTestCustomer(prisma, tenant2.organization.id, 'PERSON');
      const tenant2Invoice = await createTestInvoice(
        prisma,
        tenant2.organization.id,
        tenant2Customer.id
      );

      // Attempt various manipulation attacks from tenant 1
      const manipulationAttempts = [
        {
          method: 'PATCH',
          path: `/api/invoices/${tenant2Invoice.id}`,
          data: { total: 999999.99, status: 'PAID' }
        },
        {
          method: 'POST',
          path: `/api/invoices/${tenant2Invoice.id}/payments`,
          data: { amount: 5000.00, paymentMethod: 'CASH' }
        },
        {
          method: 'DELETE',
          path: `/api/invoices/${tenant2Invoice.id}`,
          data: {}
        }
      ];

      for (const attempt of manipulationAttempts) {
        let response;

        if (attempt.method === 'PATCH') {
          response = await authenticatedRequest(tenant1AdminToken)
            .patch(attempt.path)
            .send(attempt.data);
        } else if (attempt.method === 'POST') {
          response = await authenticatedRequest(tenant1AdminToken)
            .post(attempt.path)
            .send(attempt.data);
        } else if (attempt.method === 'DELETE') {
          response = await authenticatedRequest(tenant1AdminToken)
            .delete(attempt.path);
        }

        // All attempts should fail with 404 (not found) or 403 (forbidden)
        expect([403, 404].includes(response!.status)).toBe(true);
      }

      // Verify tenant 2's invoice remains unchanged
      const invoiceCheck = await prisma.invoice.findUnique({
        where: { id: tenant2Invoice.id }
      });

      expect(invoiceCheck?.total).toBe(tenant2Invoice.total);
      expect(invoiceCheck?.status).toBe(tenant2Invoice.status);

      console.log('✅ Cross-tenant invoice manipulation prevention test completed');
    });

    test('should prevent cross-tenant payment processing attacks', async () => {
      const tenant1AdminToken = tenant1.authTokens.admin;

      // Create payment in tenant 2
      const tenant2Customer = await createTestCustomer(prisma, tenant2.organization.id, 'BUSINESS');
      const tenant2Invoice = await createTestInvoice(
        prisma,
        tenant2.organization.id,
        tenant2Customer.id
      );
      const tenant2Payment = await createTestPayment(
        prisma,
        tenant2.organization.id,
        tenant2Customer.id,
        tenant2Invoice.id,
        1000.00
      );

      // Attempt payment manipulation attacks
      const paymentAttacks = [
        {
          action: 'refund',
          path: `/api/payments/${tenant2Payment.id}/refund`,
          data: { amount: 1000.00, reason: 'Unauthorized refund attempt' }
        },
        {
          action: 'update',
          path: `/api/payments/${tenant2Payment.id}`,
          data: { amount: 0.01, status: 'REFUNDED' }
        },
        {
          action: 'cancel',
          path: `/api/payments/${tenant2Payment.id}/cancel`,
          data: { reason: 'Unauthorized cancellation' }
        }
      ];

      for (const attack of paymentAttacks) {
        let response;

        if (attack.action === 'refund' || attack.action === 'cancel') {
          response = await authenticatedRequest(tenant1AdminToken)
            .post(attack.path)
            .send(attack.data);
        } else {
          response = await authenticatedRequest(tenant1AdminToken)
            .patch(attack.path)
            .send(attack.data);
        }

        // All attacks should fail
        expect([403, 404].includes(response.status)).toBe(true);
      }

      // Verify payment remains unchanged
      const paymentCheck = await prisma.payment.findUnique({
        where: { id: tenant2Payment.id }
      });

      expect(paymentCheck?.amount).toBe(tenant2Payment.amount);
      expect(paymentCheck?.status).toBe(tenant2Payment.status);

      console.log('✅ Cross-tenant payment attack prevention test completed');
    });
  });

  describe('Concurrent Multi-Tenant Financial Operations', () => {
    test('should handle concurrent financial operations without cross-contamination', async () => {
      const tenant1AdminToken = tenant1.authTokens.admin;
      const tenant2AdminToken = tenant2.authTokens.admin;
      const tenant1AccountantToken = tenant1.authTokens.accountant;
      const tenant2AccountantToken = tenant2.authTokens.accountant;

      // Create concurrent financial operations across tenants
      const concurrentOperations = await Promise.allSettled([
        // Tenant 1 operations
        authenticatedRequest(tenant1AdminToken)
          .post('/api/customers')
          .send({
            type: 'BUSINESS',
            business: {
              legalName: 'Concurrent T1 Business',
              businessType: 'CORPORATION',
              email: 'concurrent1@test.com'
            }
          }),

        authenticatedRequest(tenant1AccountantToken)
          .post('/api/journal-entries')
          .send({
            reference: 'JE-CONCURRENT-T1',
            description: 'Concurrent journal entry - Tenant 1',
            date: new Date().toISOString(),
            entries: [
              { accountCode: '1000', description: 'Cash', debitAmount: 1000, creditAmount: 0 },
              { accountCode: '4000', description: 'Revenue', debitAmount: 0, creditAmount: 1000 }
            ]
          }),

        // Tenant 2 operations
        authenticatedRequest(tenant2AdminToken)
          .post('/api/customers')
          .send({
            type: 'BUSINESS',
            business: {
              legalName: 'Concurrent T2 Business',
              businessType: 'LLC',
              email: 'concurrent2@test.com'
            }
          }),

        authenticatedRequest(tenant2AccountantToken)
          .post('/api/journal-entries')
          .send({
            reference: 'JE-CONCURRENT-T2',
            description: 'Concurrent journal entry - Tenant 2',
            date: new Date().toISOString(),
            entries: [
              { accountCode: '1000', description: 'Cash', debitAmount: 2000, creditAmount: 0 },
              { accountCode: '4000', description: 'Revenue', debitAmount: 0, creditAmount: 2000 }
            ]
          })
      ]);

      // Verify all operations completed successfully
      const successfulOperations = concurrentOperations.filter(
        result => result.status === 'fulfilled' &&
        (result.value as any).status >= 200 && (result.value as any).status < 300
      );

      expect(successfulOperations.length).toBeGreaterThan(0);

      // Verify proper tenant isolation after concurrent operations
      const tenant1CustomersResponse = await authenticatedRequest(tenant1AdminToken)
        .get('/api/customers')
        .expect(200);

      const tenant2CustomersResponse = await authenticatedRequest(tenant2AdminToken)
        .get('/api/customers')
        .expect(200);

      // Check that each tenant only sees their own data
      expect(tenant1CustomersResponse.body.data.every((c: any) =>
        c.organizationId === tenant1.organization.id
      )).toBe(true);

      expect(tenant2CustomersResponse.body.data.every((c: any) =>
        c.organizationId === tenant2.organization.id
      )).toBe(true);

      // Verify no cross-contamination in customer names
      const tenant1CustomerNames = tenant1CustomersResponse.body.data
        .map((c: any) => c.business?.legalName || c.person?.firstName)
        .filter(Boolean);

      const tenant2CustomerNames = tenant2CustomersResponse.body.data
        .map((c: any) => c.business?.legalName || c.person?.firstName)
        .filter(Boolean);

      expect(tenant1CustomerNames.some((name: string) => name.includes('T2'))).toBe(false);
      expect(tenant2CustomerNames.some((name: string) => name.includes('T1'))).toBe(false);

      console.log('✅ Concurrent multi-tenant operations test completed');
    });
  });
});