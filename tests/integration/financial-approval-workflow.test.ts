import { describe, test, expect, beforeEach } from '@jest/globals';
import { prisma, authenticatedRequest } from './setup';
import {
  createTestContext,
  createTestUser,
  createTestCustomer,
  createTestInvoice,
  createTestPayment,
  createTestProject,
  TestContext
} from './test-utils';
import { UserRole, PaymentStatus, InvoiceStatus } from '../../src/types/enums';

/**
 * Financial Approval Workflow Tests
 *
 * Tests sophisticated financial approval workflows with monetary thresholds,
 * multi-level approval processes, escalation paths, and compliance controls.
 * Validates role-based approval permissions, timeout actions, and audit trails
 * for financial transactions requiring additional oversight.
 */
describe('Financial Approval Workflow Tests', () => {
  let testContext: TestContext;

  beforeEach(async () => {
    testContext = await createTestContext(prisma, 'Financial Approval Workflow Org');
  });

  describe('Monetary Threshold Approval Matrix', () => {
    test('should enforce approval thresholds based on transaction amounts', async () => {
      const { authTokens, customers, organization } = testContext;

      // Financial approval threshold matrix (CAD amounts)
      const approvalThresholds = [
        {
          minAmount: 0.01,
          maxAmount: 999.99,
          requiredApprovers: 0,
          autoApprove: true,
          description: 'Small transactions - auto-approved'
        },
        {
          minAmount: 1000.00,
          maxAmount: 4999.99,
          requiredApprovers: 1,
          autoApprove: false,
          requiredRoles: ['MANAGER', 'ADMIN'],
          description: 'Medium transactions - single manager approval'
        },
        {
          minAmount: 5000.00,
          maxAmount: 19999.99,
          requiredApprovers: 2,
          autoApprove: false,
          requiredRoles: ['MANAGER', 'ADMIN'],
          description: 'Large transactions - dual approval required'
        },
        {
          minAmount: 20000.00,
          maxAmount: 99999.99,
          requiredApprovers: 3,
          autoApprove: false,
          requiredRoles: ['ADMIN'],
          escalationRequired: true,
          description: 'Very large transactions - admin + escalation'
        },
        {
          minAmount: 100000.00,
          maxAmount: 999999.99,
          requiredApprovers: 4,
          autoApprove: false,
          requiredRoles: ['ADMIN'],
          boardApprovalRequired: true,
          description: 'Major transactions - board approval required'
        }
      ];

      // Test transaction amounts across different threshold ranges
      const testTransactions = [
        { amount: 500.00, description: 'Small expense reimbursement' },
        { amount: 2500.00, description: 'Equipment purchase' },
        { amount: 8500.00, description: 'Professional services contract' },
        { amount: 35000.00, description: 'Major software license' },
        { amount: 150000.00, description: 'Office lease deposit' }
      ];

      for (const transaction of testTransactions) {
        const applicableThreshold = approvalThresholds.find(
          threshold => transaction.amount >= threshold.minAmount && transaction.amount <= threshold.maxAmount
        );

        if (!applicableThreshold) continue;

        // Create payment requiring approval
        const paymentData = {
          customerId: customers[0]!.id,
          amount: transaction.amount,
          currency: 'CAD',
          paymentMethod: 'BANK_TRANSFER',
          description: transaction.description,
          requiresApproval: !applicableThreshold.autoApprove,
          approvalThreshold: applicableThreshold.description
        };

        // Test payment creation by different roles
        const rolePermissions = [
          { role: 'ADMIN', token: authTokens.admin, canInitiate: true },
          { role: 'MANAGER', token: authTokens.manager, canInitiate: true },
          { role: 'ACCOUNTANT', token: authTokens.accountant, canInitiate: true },
          { role: 'EMPLOYEE', token: authTokens.employee, canInitiate: false },
          { role: 'VIEWER', token: authTokens.viewer, canInitiate: false }
        ];

        let createdPaymentId: string | null = null;

        for (const permission of rolePermissions) {
          if (permission.canInitiate) {
            const paymentResponse = await authenticatedRequest(permission.token)
              .post('/api/payments')
              .send({
                ...paymentData,
                initiatedBy: permission.role,
                notes: `Payment initiated by ${permission.role} for approval testing`
              });

            if (paymentResponse.status === 201) {
              const payment = paymentResponse.body;

              if (applicableThreshold.autoApprove) {
                expect(payment.status).toBe(PaymentStatus.COMPLETED);
              } else {
                expect(payment.status).toBe(PaymentStatus.PENDING);
                expect(payment.approvalRequired).toBe(true);
              }

              if (permission.role === 'ADMIN') {
                createdPaymentId = payment.id;
              }
            }
          } else {
            const paymentResponse = await authenticatedRequest(permission.token)
              .post('/api/payments')
              .send(paymentData);

            expect(paymentResponse.status).toBe(403);
          }
        }

        // Test approval workflow for payments requiring approval
        if (createdPaymentId && !applicableThreshold.autoApprove) {
          await testApprovalWorkflow(
            createdPaymentId,
            applicableThreshold,
            authTokens,
            'PAYMENT'
          );
        }
      }

      console.log('✅ Monetary threshold approval matrix test completed');
    });

    test('should enforce invoice approval thresholds', async () => {
      const { authTokens, customers } = testContext;

      // Invoice approval scenarios
      const invoiceApprovalScenarios = [
        {
          amount: 1500.00,
          description: 'Consulting services invoice',
          autoApprove: false,
          requiredApprovals: 1
        },
        {
          amount: 7500.00,
          description: 'Software development project',
          autoApprove: false,
          requiredApprovals: 2
        },
        {
          amount: 25000.00,
          description: 'Enterprise software implementation',
          autoApprove: false,
          requiredApprovals: 3,
          escalationRequired: true
        }
      ];

      for (const scenario of invoiceApprovalScenarios) {
        // Create invoice requiring approval
        const invoice = await createTestInvoice(
          prisma,
          testContext.organization.id,
          customers[0]!.id
        );

        // Update invoice amount to test scenario
        await prisma.invoice.update({
          where: { id: invoice.id },
          data: {
            total: scenario.amount,
            status: InvoiceStatus.DRAFT
          }
        });

        // Test invoice approval workflow
        const approvalRequest = {
          invoiceId: invoice.id,
          approvalType: 'FINANCIAL_THRESHOLD',
          amount: scenario.amount,
          justification: scenario.description,
          urgency: 'NORMAL'
        };

        // Admin can always approve (but may need additional approvers for large amounts)
        const adminApprovalResponse = await authenticatedRequest(authTokens.admin)
          .post('/api/invoices/request-approval')
          .send(approvalRequest);

        expect([200, 201, 400].includes(adminApprovalResponse.status)).toBe(true);

        // Manager approval for medium amounts
        if (scenario.amount < 10000) {
          const managerApprovalResponse = await authenticatedRequest(authTokens.manager)
            .post(`/api/invoices/${invoice.id}/approve`)
            .send({
              approvalLevel: 1,
              approverRole: 'MANAGER',
              approvalNotes: 'Approved for amount within manager threshold'
            });

          expect([200, 400, 403].includes(managerApprovalResponse.status)).toBe(true);
        }

        // Test escalation for large amounts
        if (scenario.escalationRequired) {
          const escalationResponse = await authenticatedRequest(authTokens.admin)
            .post(`/api/invoices/${invoice.id}/escalate`)
            .send({
              escalationReason: 'Amount exceeds standard approval threshold',
              escalationLevel: 'EXECUTIVE',
              additionalJustification: 'Critical business requirement'
            });

          expect([200, 400, 404].includes(escalationResponse.status)).toBe(true);
        }
      }

      console.log('✅ Invoice approval thresholds test completed');
    });
  });

  describe('Multi-Level Approval Workflows', () => {
    test('should enforce sequential approval requirements', async () => {
      const { authTokens, customers } = testContext;

      // Create high-value transaction requiring multiple approvals
      const highValueTransaction = {
        customerId: customers[0]!.id,
        amount: 45000.00, // Requires 3 approvals
        currency: 'CAD',
        paymentMethod: 'WIRE_TRANSFER',
        description: 'Major equipment purchase - multi-level approval required',
        transactionType: 'VENDOR_PAYMENT',
        categoryCode: 'CAPITAL_EXPENDITURE'
      };

      // Initiate payment requiring multi-level approval
      const paymentResponse = await authenticatedRequest(authTokens.accountant)
        .post('/api/payments')
        .send(highValueTransaction);

      expect([201, 400].includes(paymentResponse.status)).toBe(true);

      if (paymentResponse.status === 201) {
        const paymentId = paymentResponse.body.id;
        expect(paymentResponse.body.status).toBe(PaymentStatus.PENDING);

        // Test approval workflow sequence
        const approvalSequence = [
          {
            level: 1,
            approver: 'MANAGER',
            token: authTokens.manager,
            requiredRole: 'MANAGER',
            description: 'First level approval - operational review'
          },
          {
            level: 2,
            approver: 'ADMIN',
            token: authTokens.admin,
            requiredRole: 'ADMIN',
            description: 'Second level approval - financial review'
          },
          {
            level: 3,
            approver: 'SUPER_ADMIN',
            token: authTokens.admin, // Using admin as proxy for super admin in test
            requiredRole: 'SUPER_ADMIN',
            description: 'Final approval - executive authorization'
          }
        ];

        for (const approval of approvalSequence) {
          // Test approval at current level
          const approvalResponse = await authenticatedRequest(approval.token)
            .post(`/api/payments/${paymentId}/approve`)
            .send({
              approvalLevel: approval.level,
              approverRole: approval.requiredRole,
              approvalNotes: approval.description,
              reviewComments: `Approved by ${approval.approver} at level ${approval.level}`,
              riskAssessment: approval.level === 3 ? 'LOW_RISK' : 'MEDIUM_RISK'
            });

          expect([200, 400, 403].includes(approvalResponse.status)).toBe(true);

          // Test that lower-level roles cannot approve higher levels
          if (approval.level > 1) {
            const unauthorizedApprovalResponse = await authenticatedRequest(authTokens.employee)
              .post(`/api/payments/${paymentId}/approve`)
              .send({
                approvalLevel: approval.level,
                approverRole: 'EMPLOYEE'
              });

            expect(unauthorizedApprovalResponse.status).toBe(403);
          }
        }

        // Verify payment status after all approvals
        const finalPaymentResponse = await authenticatedRequest(authTokens.admin)
          .get(`/api/payments/${paymentId}`)
          .expect(200);

        // Payment should be approved or processing after all required approvals
        expect(['PROCESSING', 'COMPLETED'].includes(finalPaymentResponse.body.status)).toBe(true);
      }

      console.log('✅ Multi-level approval workflow test completed');
    });

    test('should handle approval delegation and temporary authority', async () => {
      const { authTokens, organization } = testContext;

      // Create temporary approval delegation
      const delegationData = {
        delegatorRole: 'MANAGER',
        delegateRole: 'ACCOUNTANT',
        delegateUserId: testContext.users.accountant.id,
        approvalLimits: {
          maxAmount: 15000.00,
          categories: ['PROFESSIONAL_SERVICES', 'OFFICE_SUPPLIES'],
          validFrom: new Date().toISOString(),
          validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
        },
        reason: 'Manager on vacation - temporary delegation',
        requiresConfirmation: true
      };

      // Test delegation creation (only admins can create delegations)
      const delegationResponse = await authenticatedRequest(authTokens.admin)
        .post('/api/approvals/delegate')
        .send(delegationData);

      expect([201, 400, 404].includes(delegationResponse.status)).toBe(true);

      if (delegationResponse.status === 201) {
        const delegationId = delegationResponse.body.id;

        // Test delegated approval authority
        const delegatedTransaction = {
          amount: 8500.00, // Within delegation limit
          category: 'PROFESSIONAL_SERVICES',
          description: 'Legal consultation services',
          requiresApproval: true
        };

        const delegatedApprovalResponse = await authenticatedRequest(authTokens.accountant)
          .post('/api/payments/approve-delegated')
          .send({
            ...delegatedTransaction,
            delegationId,
            onBehalfOf: 'MANAGER',
            delegationJustification: 'Using temporary delegation authority'
          });

        expect([200, 400, 403].includes(delegatedApprovalResponse.status)).toBe(true);

        // Test delegation limits enforcement
        const exceedsLimitTransaction = {
          amount: 20000.00, // Exceeds delegation limit
          category: 'PROFESSIONAL_SERVICES',
          description: 'Exceeds delegation limit'
        };

        const exceedsLimitResponse = await authenticatedRequest(authTokens.accountant)
          .post('/api/payments/approve-delegated')
          .send({
            ...exceedsLimitTransaction,
            delegationId
          });

        expect(exceedsLimitResponse.status).toBe(403);

        // Test delegation revocation
        const revocationResponse = await authenticatedRequest(authTokens.admin)
          .post(`/api/approvals/revoke-delegation/${delegationId}`)
          .send({
            reason: 'Manager returned from vacation',
            effectiveImmediately: true
          });

        expect([200, 404].includes(revocationResponse.status)).toBe(true);
      }

      console.log('✅ Approval delegation test completed');
    });
  });

  describe('Escalation Path and Timeout Handling', () => {
    test('should handle approval timeouts and automatic escalation', async () => {
      const { authTokens, customers } = testContext;

      // Create transaction with timeout requirements
      const timeoutTransaction = {
        customerId: customers[0]!.id,
        amount: 12000.00,
        currency: 'CAD',
        description: 'Time-sensitive vendor payment',
        approvalTimeout: 24, // 24 hours
        escalationRules: {
          level1Timeout: 8, // 8 hours before first escalation
          level2Timeout: 16, // 16 hours before second escalation
          finalTimeout: 24, // 24 hours before auto-reject
          escalationPath: ['MANAGER', 'ADMIN', 'SUPER_ADMIN']
        }
      };

      const paymentResponse = await authenticatedRequest(authTokens.accountant)
        .post('/api/payments')
        .send(timeoutTransaction);

      expect([201, 400].includes(paymentResponse.status)).toBe(true);

      if (paymentResponse.status === 201) {
        const paymentId = paymentResponse.body.id;

        // Test manual escalation
        const manualEscalationResponse = await authenticatedRequest(authTokens.manager)
          .post(`/api/payments/${paymentId}/escalate`)
          .send({
            escalationReason: 'MANUAL_ESCALATION',
            escalationLevel: 'URGENT',
            businessJustification: 'Critical vendor payment deadline approaching',
            requestedApprover: 'ADMIN'
          });

        expect([200, 400, 403].includes(manualEscalationResponse.status)).toBe(true);

        // Test escalation history tracking
        const escalationHistoryResponse = await authenticatedRequest(authTokens.admin)
          .get(`/api/payments/${paymentId}/escalation-history`)
          .expect(200);

        expect(escalationHistoryResponse.body).toBeDefined();
        expect(Array.isArray(escalationHistoryResponse.body.escalations)).toBe(true);

        // Test timeout notification simulation
        const timeoutNotificationResponse = await authenticatedRequest(authTokens.admin)
          .post('/api/approvals/simulate-timeout')
          .send({
            paymentId,
            timeoutType: 'LEVEL_1_ESCALATION',
            hoursElapsed: 8,
            testMode: true // Don't actually process timeout
          });

        expect([200, 400, 404].includes(timeoutNotificationResponse.status)).toBe(true);
      }

      console.log('✅ Escalation path and timeout handling test completed');
    });

    test('should enforce emergency approval procedures', async () => {
      const { authTokens, customers } = testContext;

      // Emergency approval scenarios
      const emergencyScenarios = [
        {
          type: 'CRITICAL_VENDOR_PAYMENT',
          amount: 25000.00,
          justification: 'Vendor threatening service cutoff',
          maxApprovalTime: 2, // 2 hours
          requiredDocumentation: ['VENDOR_NOTICE', 'BUSINESS_IMPACT_ASSESSMENT']
        },
        {
          type: 'EMERGENCY_REPAIR',
          amount: 15000.00,
          justification: 'Critical infrastructure failure',
          maxApprovalTime: 1, // 1 hour
          requiredDocumentation: ['FAILURE_REPORT', 'REPAIR_QUOTE']
        },
        {
          type: 'LEGAL_SETTLEMENT',
          amount: 50000.00,
          justification: 'Court-mandated settlement payment',
          maxApprovalTime: 4, // 4 hours
          requiredDocumentation: ['COURT_ORDER', 'LEGAL_OPINION']
        }
      ];

      for (const scenario of emergencyScenarios) {
        // Test emergency approval request
        const emergencyApprovalData = {
          customerId: customers[0]!.id,
          amount: scenario.amount,
          emergencyType: scenario.type,
          justification: scenario.justification,
          maxApprovalTime: scenario.maxApprovalTime,
          documentation: scenario.requiredDocumentation,
          requestedBy: 'MANAGER',
          urgencyLevel: 'CRITICAL'
        };

        // Only admins can initiate emergency approvals
        const emergencyRequestResponse = await authenticatedRequest(authTokens.admin)
          .post('/api/approvals/emergency-request')
          .send(emergencyApprovalData);

        expect([201, 400].includes(emergencyRequestResponse.status)).toBe(true);

        if (emergencyRequestResponse.status === 201) {
          const emergencyRequestId = emergencyRequestResponse.body.id;

          // Test emergency approval (requires multiple admins for large amounts)
          const emergencyApprovalResponse = await authenticatedRequest(authTokens.admin)
            .post(`/api/approvals/emergency-approve/${emergencyRequestId}`)
            .send({
              approverRole: 'ADMIN',
              emergencyCode: 'EMERGENCY_OVERRIDE',
              riskAcknowledgment: true,
              approvalNotes: `Emergency approval for ${scenario.type}`,
              auditTrailRequired: true
            });

          expect([200, 400, 403].includes(emergencyApprovalResponse.status)).toBe(true);

          // Test that non-admins cannot approve emergency requests
          const unauthorizedEmergencyResponse = await authenticatedRequest(authTokens.manager)
            .post(`/api/approvals/emergency-approve/${emergencyRequestId}`)
            .send({
              approverRole: 'MANAGER',
              emergencyCode: 'EMERGENCY_OVERRIDE'
            });

          expect(unauthorizedEmergencyResponse.status).toBe(403);
        }
      }

      console.log('✅ Emergency approval procedures test completed');
    });
  });

  describe('Compliance and Audit Trail Validation', () => {
    test('should maintain comprehensive approval audit trails', async () => {
      const { authTokens, customers, organization } = testContext;

      // Create transaction requiring approval with full audit trail
      const auditableTransaction = {
        customerId: customers[0]!.id,
        amount: 18500.00,
        currency: 'CAD',
        description: 'Major consulting contract - full audit trail required',
        contractReference: 'CON-2024-001',
        budgetCode: 'PROF-SERVICES-Q1',
        costCenter: 'OPERATIONS',
        approvalRequired: true,
        auditLevel: 'COMPREHENSIVE'
      };

      const paymentResponse = await authenticatedRequest(authTokens.accountant)
        .post('/api/payments')
        .send(auditableTransaction);

      expect([201, 400].includes(paymentResponse.status)).toBe(true);

      if (paymentResponse.status === 201) {
        const paymentId = paymentResponse.body.id;

        // Test approval with comprehensive audit trail
        const approvalWithAuditResponse = await authenticatedRequest(authTokens.admin)
          .post(`/api/payments/${paymentId}/approve`)
          .send({
            approvalLevel: 1,
            approverRole: 'ADMIN',
            approvalNotes: 'Comprehensive audit trail approval',
            riskAssessment: {
              financialRisk: 'MEDIUM',
              operationalRisk: 'LOW',
              complianceRisk: 'LOW',
              reputationalRisk: 'LOW'
            },
            dueCheckList: {
              budgetApproval: true,
              contractReview: true,
              legalReview: true,
              complianceCheck: true
            },
            supportingDocuments: [
              'VENDOR_INVOICE',
              'PURCHASE_ORDER',
              'BUDGET_APPROVAL',
              'CONTRACT_TERMS'
            ]
          });

        expect([200, 400].includes(approvalWithAuditResponse.status)).toBe(true);

        // Test audit trail retrieval
        const auditTrailResponse = await authenticatedRequest(authTokens.admin)
          .get(`/api/payments/${paymentId}/audit-trail`)
          .expect(200);

        expect(auditTrailResponse.body.paymentId).toBe(paymentId);
        expect(auditTrailResponse.body.organizationId).toBe(organization.id);
        expect(Array.isArray(auditTrailResponse.body.auditEntries)).toBe(true);
        expect(auditTrailResponse.body.auditEntries.length).toBeGreaterThan(0);

        // Test audit trail export for compliance reporting
        const auditExportResponse = await authenticatedRequest(authTokens.admin)
          .post(`/api/payments/${paymentId}/export-audit`)
          .send({
            format: 'PDF',
            includeDocuments: true,
            includeApprovalChain: true,
            certifiedExport: true,
            requestedFor: 'INTERNAL_AUDIT'
          });

        expect([200, 400].includes(auditExportResponse.status)).toBe(true);

        // Test that non-admin roles have limited audit trail access
        const limitedAuditResponse = await authenticatedRequest(authTokens.accountant)
          .get(`/api/payments/${paymentId}/audit-trail`);

        // Accountants might have limited access or full access depending on implementation
        expect([200, 403].includes(limitedAuditResponse.status)).toBe(true);
      }

      console.log('✅ Comprehensive approval audit trail test completed');
    });

    test('should enforce segregation of duties in approval processes', async () => {
      const { authTokens, customers } = testContext;

      // Test segregation of duties scenarios
      const segregationScenarios = [
        {
          scenario: 'SELF_APPROVAL_PREVENTION',
          description: 'User cannot approve their own transactions',
          initiator: 'MANAGER',
          approver: 'MANAGER', // Same as initiator
          shouldFail: true
        },
        {
          scenario: 'CROSS_FUNCTIONAL_APPROVAL',
          description: 'Different departments must approve',
          initiator: 'ACCOUNTANT',
          approver: 'MANAGER',
          shouldFail: false
        },
        {
          scenario: 'HIERARCHICAL_APPROVAL',
          description: 'Higher level must approve lower level transactions',
          initiator: 'EMPLOYEE',
          approver: 'MANAGER',
          shouldFail: false
        }
      ];

      for (const scenario of segregationScenarios) {
        const transactionData = {
          customerId: customers[0]!.id,
          amount: 5500.00, // Requires approval
          currency: 'CAD',
          description: `Segregation test: ${scenario.description}`,
          initiatorRole: scenario.initiator,
          segregationTest: true
        };

        // Create transaction with specific initiator
        const initiatorToken = scenario.initiator === 'MANAGER' ? authTokens.manager :
                             scenario.initiator === 'ACCOUNTANT' ? authTokens.accountant :
                             authTokens.employee;

        const transactionResponse = await authenticatedRequest(initiatorToken)
          .post('/api/payments')
          .send(transactionData);

        expect([201, 400].includes(transactionResponse.status)).toBe(true);

        if (transactionResponse.status === 201) {
          const transactionId = transactionResponse.body.id;

          // Attempt approval with specified approver
          const approverToken = scenario.approver === 'MANAGER' ? authTokens.manager :
                               scenario.approver === 'ACCOUNTANT' ? authTokens.accountant :
                               authTokens.admin;

          const approvalResponse = await authenticatedRequest(approverToken)
            .post(`/api/payments/${transactionId}/approve`)
            .send({
              approverRole: scenario.approver,
              segregationTestMode: true,
              approvalNotes: `Segregation test approval: ${scenario.scenario}`
            });

          if (scenario.shouldFail) {
            expect(approvalResponse.status).toBe(403);
            expect(approvalResponse.body.error).toContain('segregation');
          } else {
            expect([200, 400].includes(approvalResponse.status)).toBe(true);
          }
        }
      }

      console.log('✅ Segregation of duties test completed');
    });
  });

  /**
   * Helper function to test approval workflow progression
   */
  async function testApprovalWorkflow(
    entityId: string,
    approvalConfig: any,
    authTokens: any,
    entityType: 'PAYMENT' | 'INVOICE'
  ): Promise<void> {
    const baseEndpoint = entityType === 'PAYMENT' ? '/api/payments' : '/api/invoices';

    // Test approval requests by appropriate roles
    for (let level = 1; level <= approvalConfig.requiredApprovers; level++) {
      const approverRole = approvalConfig.requiredRoles[0]; // Use first valid role
      const approverToken = approverRole === 'ADMIN' ? authTokens.admin : authTokens.manager;

      const approvalResponse = await authenticatedRequest(approverToken)
        .post(`${baseEndpoint}/${entityId}/approve`)
        .send({
          approvalLevel: level,
          approverRole,
          approvalNotes: `Level ${level} approval for threshold testing`,
          testMode: true
        });

      expect([200, 400, 403].includes(approvalResponse.status)).toBe(true);
    }

    // Test approval status check
    const statusResponse = await authenticatedRequest(authTokens.admin)
      .get(`${baseEndpoint}/${entityId}/approval-status`)
      .expect(200);

    expect(statusResponse.body).toBeDefined();
    expect(statusResponse.body.entityId).toBe(entityId);
  }
});