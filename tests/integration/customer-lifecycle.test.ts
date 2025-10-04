// @ts-nocheck
import { describe, test, expect, beforeEach } from '@jest/globals';
import { prisma, authenticatedRequest, baseRequest } from './setup';
import {
  createTestContext,
  createTestQuote,
  createTestInvoice,
  createTestPayment,
  createTestProject,
  createTestAppointment,
  verifyAuditLog,
  delay,
  TestContext
} from './test-utils';
import { QuoteStatus, InvoiceStatus, PaymentStatus, ProjectStatus, PaymentMethod } from '../../src/types/enums';

describe('Customer Lifecycle Integration Tests', () => {
  let testContext: TestContext;

  beforeEach(async () => {
    testContext = await createTestContext(prisma, 'Lifecycle Test Org');
  });

  describe('Complete Customer Journey: Quote → Invoice → Payment → Project', () => {
    test('should complete full customer lifecycle workflow', async () => {
      const { organization, users, customers, authTokens } = testContext;
      const customer = customers[0];
      const adminToken = authTokens.admin;

      // Step 1: Create initial quote
      console.log('📋 Step 1: Creating initial quote...');
      const quoteResponse = await authenticatedRequest(adminToken)
        .post('/api/quotes')
        .send({
          customerId: customer.id,
          validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          items: [
            {
              description: 'Web Development Services',
              quantity: 40,
              unitPrice: 150.00,
              taxRate: 0.13
            },
            {
              description: 'Project Management',
              quantity: 10,
              unitPrice: 120.00,
              taxRate: 0.13
            }
          ],
          description: 'Complete website development project',
          terms: 'Net 30 days',
          notes: 'Includes responsive design and CMS integration'
        })
        .expect(201);

      const quote = quoteResponse.body;
      expect(quote.status).toBe(QuoteStatus.DRAFT);
      expect(quote.total).toBeGreaterThan(0);

      // Verify audit log for quote creation
      await verifyAuditLog(prisma, organization.id, 'CREATE', 'Quote', quote.id, users.admin.id);

      // Step 2: Send quote to customer
      console.log('📤 Step 2: Sending quote to customer...');
      const sentQuoteResponse = await authenticatedRequest(adminToken)
        .patch(`/api/quotes/${quote.id}/send`)
        .expect(200);

      expect(sentQuoteResponse.body.status).toBe(QuoteStatus.SENT);
      expect(sentQuoteResponse.body.sentAt).toBeTruthy();

      // Step 3: Customer views quote (simulate external view)
      console.log('👀 Step 3: Customer viewing quote...');
      await authenticatedRequest(adminToken)
        .patch(`/api/quotes/${quote.id}/view`)
        .expect(200);

      // Step 4: Customer accepts quote
      console.log('✅ Step 4: Customer accepting quote...');
      const acceptedQuoteResponse = await authenticatedRequest(adminToken)
        .patch(`/api/quotes/${quote.id}/accept`)
        .expect(200);

      expect(acceptedQuoteResponse.body.status).toBe(QuoteStatus.ACCEPTED);
      expect(acceptedQuoteResponse.body.acceptedAt).toBeTruthy();

      // Step 5: Create project from accepted quote
      console.log('🚀 Step 5: Creating project from quote...');
      const projectResponse = await authenticatedRequest(adminToken)
        .post('/api/projects')
        .send({
          name: 'Website Development Project',
          description: 'Complete website development based on accepted quote',
          customerId: customer.id,
          assignedToId: users.admin.id,
          estimatedHours: 50,
          hourlyRate: 145.00,
          startDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          endDate: new Date(Date.now() + 37 * 24 * 60 * 60 * 1000).toISOString()
        })
        .expect(201);

      const project = projectResponse.body;
      expect(project.status).toBe(ProjectStatus.QUOTED);

      // Step 6: Schedule appointment for project kickoff
      console.log('📅 Step 6: Scheduling project kickoff appointment...');
      const appointmentResponse = await authenticatedRequest(adminToken)
        .post('/api/appointments')
        .send({
          customerId: customer.id,
          projectId: project.id,
          title: 'Project Kickoff Meeting',
          description: 'Initial meeting to discuss project requirements and timeline',
          startTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          endTime: new Date(Date.now() + 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000).toISOString(),
          duration: 120
        })
        .expect(201);

      const appointment = appointmentResponse.body;
      expect(appointment.confirmed).toBe(false);

      // Step 7: Confirm appointment
      console.log('✅ Step 7: Confirming appointment...');
      await authenticatedRequest(adminToken)
        .patch(`/api/appointments/${appointment.id}/confirm`)
        .expect(200);

      // Step 8: Convert quote to invoice
      console.log('🧾 Step 8: Converting quote to invoice...');
      const invoiceResponse = await authenticatedRequest(adminToken)
        .post('/api/invoices')
        .send({
          customerId: customer.id,
          quoteId: quote.id,
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          terms: 'Net 30 days',
          notes: 'Invoice generated from accepted quote'
        })
        .expect(201);

      const invoice = invoiceResponse.body;
      expect(invoice.status).toBe(InvoiceStatus.DRAFT);
      expect(invoice.quoteId).toBe(quote.id);
      expect(invoice.total).toBe(quote.total);

      // Step 9: Send invoice to customer
      console.log('📧 Step 9: Sending invoice to customer...');
      const sentInvoiceResponse = await authenticatedRequest(adminToken)
        .patch(`/api/invoices/${invoice.id}/send`)
        .expect(200);

      expect(sentInvoiceResponse.body.status).toBe(InvoiceStatus.SENT);
      expect(sentInvoiceResponse.body.sentAt).toBeTruthy();

      // Step 10: Customer views invoice
      console.log('👁️ Step 10: Customer viewing invoice...');
      await authenticatedRequest(adminToken)
        .patch(`/api/invoices/${invoice.id}/view`)
        .expect(200);

      // Step 11: Process deposit payment (50%)
      console.log('💰 Step 11: Processing deposit payment...');
      const depositAmount = invoice.total * 0.5;
      const depositPaymentResponse = await authenticatedRequest(adminToken)
        .post('/api/payments')
        .send({
          customerId: customer.id,
          invoiceId: invoice.id,
          amount: depositAmount,
          paymentMethod: PaymentMethod.STRIPE_CARD,
          referenceNumber: 'STRIPE_INTENT_12345',
          customerNotes: 'Deposit payment for project',
          metadata: JSON.stringify({
            stripe_payment_intent_id: 'pi_test_12345',
            payment_type: 'deposit'
          })
        })
        .expect(201);

      const depositPayment = depositPaymentResponse.body;
      expect(depositPayment.status).toBe(PaymentStatus.COMPLETED);
      expect(depositPayment.amount).toBe(depositAmount);

      // Verify invoice is partially paid
      const updatedInvoiceResponse = await authenticatedRequest(adminToken)
        .get(`/api/invoices/${invoice.id}`)
        .expect(200);

      expect(updatedInvoiceResponse.body.status).toBe(InvoiceStatus.PARTIALLY_PAID);
      expect(updatedInvoiceResponse.body.amountPaid).toBe(depositAmount);
      expect(updatedInvoiceResponse.body.balance).toBe(invoice.total - depositAmount);

      // Step 12: Approve and start project
      console.log('🎯 Step 12: Approving and starting project...');
      const approvedProjectResponse = await authenticatedRequest(adminToken)
        .patch(`/api/projects/${project.id}/status`)
        .send({ status: ProjectStatus.APPROVED })
        .expect(200);

      expect(approvedProjectResponse.body.status).toBe(ProjectStatus.APPROVED);

      // Start the project
      const startedProjectResponse = await authenticatedRequest(adminToken)
        .patch(`/api/projects/${project.id}/start`)
        .expect(200);

      expect(startedProjectResponse.body.status).toBe(ProjectStatus.IN_PROGRESS);
      expect(startedProjectResponse.body.actualStartDate).toBeTruthy();

      // Step 13: Complete appointment (project kickoff)
      console.log('🏁 Step 13: Completing project kickoff appointment...');
      await authenticatedRequest(adminToken)
        .patch(`/api/appointments/${appointment.id}/complete`)
        .expect(200);

      // Step 14: Record project progress (simulate work completion)
      console.log('⚡ Step 14: Recording project progress...');
      await delay(1000); // Small delay to ensure timestamp differences

      // Add some work hours
      const progressResponse = await authenticatedRequest(adminToken)
        .patch(`/api/projects/${project.id}/progress`)
        .send({
          hoursWorked: 25,
          progressNotes: 'Completed initial design and development setup'
        })
        .expect(200);

      expect(progressResponse.body.actualHours).toBe(25);

      // Step 15: Process final payment
      console.log('💳 Step 15: Processing final payment...');
      const finalAmount = invoice.total - depositAmount;
      const finalPaymentResponse = await authenticatedRequest(adminToken)
        .post('/api/payments')
        .send({
          customerId: customer.id,
          invoiceId: invoice.id,
          amount: finalAmount,
          paymentMethod: PaymentMethod.INTERAC_ETRANSFER,
          referenceNumber: 'ETRF789456123',
          customerNotes: 'Final payment for completed work',
          metadata: JSON.stringify({
            payment_type: 'final',
            etransfer_reference: 'ETRF789456123'
          })
        })
        .expect(201);

      const finalPayment = finalPaymentResponse.body;
      expect(finalPayment.status).toBe(PaymentStatus.COMPLETED);
      expect(finalPayment.amount).toBe(finalAmount);

      // Verify invoice is fully paid
      const finalInvoiceResponse = await authenticatedRequest(adminToken)
        .get(`/api/invoices/${invoice.id}`)
        .expect(200);

      expect(finalInvoiceResponse.body.status).toBe(InvoiceStatus.PAID);
      expect(finalInvoiceResponse.body.amountPaid).toBe(invoice.total);
      expect(finalInvoiceResponse.body.balance).toBe(0);
      expect(finalInvoiceResponse.body.paidAt).toBeTruthy();

      // Step 16: Complete project
      console.log('🎉 Step 16: Completing project...');
      const completedProjectResponse = await authenticatedRequest(adminToken)
        .patch(`/api/projects/${project.id}/complete`)
        .send({
          completionNotes: 'Project completed successfully. All requirements met.',
          finalHours: 48
        })
        .expect(200);

      expect(completedProjectResponse.body.status).toBe(ProjectStatus.COMPLETED);
      expect(completedProjectResponse.body.completedAt).toBeTruthy();
      expect(completedProjectResponse.body.actualEndDate).toBeTruthy();

      // Step 17: Verify complete audit trail
      console.log('📊 Step 17: Verifying complete audit trail...');
      const auditLogsResponse = await authenticatedRequest(adminToken)
        .get(`/api/audit-logs?entityType=Quote&entityId=${quote.id}`)
        .expect(200);

      const quoteAuditLogs = auditLogsResponse.body.data;
      expect(quoteAuditLogs.length).toBeGreaterThan(0);

      // Verify key audit events exist
      const auditActions = quoteAuditLogs.map((log: any) => log.action);
      expect(auditActions).toContain('CREATE');

      console.log('✅ Customer lifecycle test completed successfully!');

      // Final verification: Check that all entities are properly linked
      const finalQuote = await prisma.quote.findUnique({
        where: { id: quote.id },
        include: { invoice: true }
      });

      const finalInvoice = await prisma.invoice.findUnique({
        where: { id: invoice.id },
        include: { payments: true }
      });

      const finalProject = await prisma.project.findUnique({
        where: { id: project.id },
        include: { appointments: true }
      });

      expect(finalQuote?.invoice?.id).toBe(invoice.id);
      expect(finalInvoice?.payments).toHaveLength(2); // Deposit + Final payment
      expect(finalProject?.appointments).toHaveLength(1);
      expect(finalProject?.status).toBe(ProjectStatus.COMPLETED);

      console.log('🔗 All entity relationships verified successfully!');
    }, 60000); // 60 second timeout for this comprehensive test
  });

  describe('Customer Onboarding Workflow', () => {
    test('should handle complete customer onboarding process', async () => {
      const { authTokens } = testContext;
      const adminToken = authTokens.admin;

      // Step 1: Create person customer
      const personCustomerResponse = await authenticatedRequest(adminToken)
        .post('/api/customers')
        .send({
          type: 'PERSON',
          person: {
            firstName: 'John',
            lastName: 'Doe',
            email: 'john.doe@example.com',
            phone: '+1-555-123-4567',
            dateOfBirth: '1985-06-15'
          },
          tier: 'PERSONAL',
          paymentTerms: 15,
          notes: 'New individual customer'
        })
        .expect(201);

      const personCustomer = personCustomerResponse.body;
      expect(personCustomer.person).toBeTruthy();
      expect(personCustomer.person.firstName).toBe('John');

      // Step 2: Add customer address
      const addressResponse = await authenticatedRequest(adminToken)
        .post(`/api/customers/${personCustomer.id}/addresses`)
        .send({
          addressType: 'BILLING',
          isPrimary: true,
          address: {
            line1: '123 Main Street',
            line2: 'Apt 4B',
            city: 'Toronto',
            stateProvince: 'Ontario',
            postalCode: 'M5V 3A8',
            countryId: await getCanadaCountryId()
          }
        })
        .expect(201);

      expect(addressResponse.body.isPrimary).toBe(true);

      // Step 3: Create business customer
      const businessCustomerResponse = await authenticatedRequest(adminToken)
        .post('/api/customers')
        .send({
          type: 'BUSINESS',
          business: {
            legalName: 'Tech Solutions Inc.',
            tradeName: 'TechSol',
            businessNumber: '123456789',
            businessType: 'CORPORATION',
            email: 'info@techsol.com',
            phone: '+1-555-987-6543',
            website: 'https://techsol.com'
          },
          tier: 'SMALL_BUSINESS',
          paymentTerms: 30,
          creditLimit: 50000,
          notes: 'New corporate client'
        })
        .expect(201);

      const businessCustomer = businessCustomerResponse.body;
      expect(businessCustomer.business).toBeTruthy();
      expect(businessCustomer.business.legalName).toBe('Tech Solutions Inc.');

      // Step 4: Verify customers are searchable
      const searchResponse = await authenticatedRequest(adminToken)
        .get('/api/customers?search=john')
        .expect(200);

      expect(searchResponse.body.data.some((c: any) => c.id === personCustomer.id)).toBe(true);

      // Step 5: Update customer status through lifecycle
      await authenticatedRequest(adminToken)
        .patch(`/api/customers/${personCustomer.id}`)
        .send({ status: 'ACTIVE' })
        .expect(200);

      const updatedCustomer = await authenticatedRequest(adminToken)
        .get(`/api/customers/${personCustomer.id}`)
        .expect(200);

      expect(updatedCustomer.body.status).toBe('ACTIVE');
    });

    async function getCanadaCountryId(): Promise<string> {
      const country = await prisma.country.findFirst({
        where: { code: 'CA' }
      });
      return country!.id;
    }
  });

  describe('Quote Management Workflow', () => {
    test('should handle quote lifecycle with revisions and approvals', async () => {
      const { customers, authTokens, users } = testContext;
      const customer = customers[0];
      const adminToken = authTokens.admin;
      const managerToken = authTokens.manager;

      // Create initial quote
      const quoteResponse = await authenticatedRequest(adminToken)
        .post('/api/quotes')
        .send({
          customerId: customer.id,
          validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          items: [
            {
              description: 'Consulting Services',
              quantity: 20,
              unitPrice: 200.00,
              taxRate: 0.13
            }
          ],
          description: 'Business consulting engagement'
        })
        .expect(201);

      const quote = quoteResponse.body;

      // Send quote
      await authenticatedRequest(adminToken)
        .patch(`/api/quotes/${quote.id}/send`)
        .expect(200);

      // Customer rejects with feedback
      await authenticatedRequest(adminToken)
        .patch(`/api/quotes/${quote.id}/reject`)
        .send({
          rejectionReason: 'Budget too high, please revise pricing'
        })
        .expect(200);

      // Create revised quote
      const revisedQuoteResponse = await authenticatedRequest(managerToken)
        .post('/api/quotes')
        .send({
          customerId: customer.id,
          validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          items: [
            {
              description: 'Consulting Services (Revised)',
              quantity: 20,
              unitPrice: 150.00, // Reduced price
              discountPercent: 10, // Additional discount
              taxRate: 0.13
            }
          ],
          description: 'Revised business consulting engagement',
          notes: 'Pricing adjusted based on customer feedback'
        })
        .expect(201);

      const revisedQuote = revisedQuoteResponse.body;
      expect(revisedQuote.total).toBeLessThan(quote.total);

      // Send and accept revised quote
      await authenticatedRequest(managerToken)
        .patch(`/api/revisedQuotes/${revisedQuote.id}/send`)
        .expect(200);

      await authenticatedRequest(managerToken)
        .patch(`/api/quotes/${revisedQuote.id}/accept`)
        .expect(200);

      // Verify quote acceptance
      const finalQuote = await authenticatedRequest(adminToken)
        .get(`/api/quotes/${revisedQuote.id}`)
        .expect(200);

      expect(finalQuote.body.status).toBe(QuoteStatus.ACCEPTED);
    });
  });

  describe('Multi-Project Customer Management', () => {
    test('should handle customer with multiple concurrent projects', async () => {
      const { customers, authTokens, users } = testContext;
      const customer = customers[0];
      const adminToken = authTokens.admin;

      // Create multiple projects for the same customer
      const project1Response = await authenticatedRequest(adminToken)
        .post('/api/projects')
        .send({
          name: 'Website Development',
          description: 'Company website redesign',
          customerId: customer.id,
          assignedToId: users.admin.id,
          estimatedHours: 40,
          hourlyRate: 150.00
        })
        .expect(201);

      const project2Response = await authenticatedRequest(adminToken)
        .post('/api/projects')
        .send({
          name: 'Mobile App Development',
          description: 'iOS and Android mobile application',
          customerId: customer.id,
          assignedToId: users.manager.id,
          estimatedHours: 80,
          hourlyRate: 175.00
        })
        .expect(201);

      const project3Response = await authenticatedRequest(adminToken)
        .post('/api/projects')
        .send({
          name: 'SEO Optimization',
          description: 'Search engine optimization services',
          customerId: customer.id,
          assignedToId: users.accountant.id,
          estimatedHours: 20,
          hourlyRate: 125.00
        })
        .expect(201);

      // Get customer projects summary
      const customerProjectsResponse = await authenticatedRequest(adminToken)
        .get(`/api/customers/${customer.id}/projects`)
        .expect(200);

      expect(customerProjectsResponse.body.data).toHaveLength(3);

      // Start projects at different times
      await authenticatedRequest(adminToken)
        .patch(`/api/projects/${project1Response.body.id}/start`)
        .expect(200);

      await delay(1000);

      await authenticatedRequest(adminToken)
        .patch(`/api/projects/${project2Response.body.id}/start`)
        .expect(200);

      // Create appointments for all projects
      const appointmentDates = [
        new Date(Date.now() + 1 * 24 * 60 * 60 * 1000), // Tomorrow
        new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // Day after tomorrow
        new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)  // Three days from now
      ];

      for (let i = 0; i < 3; i++) {
        const projectId = [project1Response.body.id, project2Response.body.id, project3Response.body.id][i];
        await authenticatedRequest(adminToken)
          .post('/api/appointments')
          .send({
            customerId: customer.id,
            projectId,
            title: `Project ${i + 1} Check-in`,
            description: `Progress review for project ${i + 1}`,
            startTime: appointmentDates[i].toISOString(),
            endTime: new Date(appointmentDates[i].getTime() + 60 * 60 * 1000).toISOString(),
            duration: 60
          })
          .expect(201);
      }

      // Get customer's upcoming appointments
      const appointmentsResponse = await authenticatedRequest(adminToken)
        .get(`/api/customers/${customer.id}/appointments?upcoming=true`)
        .expect(200);

      expect(appointmentsResponse.body.data).toHaveLength(3);

      // Complete first project
      await authenticatedRequest(adminToken)
        .patch(`/api/projects/${project1Response.body.id}/complete`)
        .send({
          completionNotes: 'Website successfully launched',
          finalHours: 38
        })
        .expect(200);

      // Verify customer dashboard shows correct project statuses
      const customerDashboardResponse = await authenticatedRequest(adminToken)
        .get(`/api/customers/${customer.id}/dashboard`)
        .expect(200);

      const dashboard = customerDashboardResponse.body;
      expect(dashboard.projects.total).toBe(3);
      expect(dashboard.projects.completed).toBe(1);
      expect(dashboard.projects.inProgress).toBe(2);
    });
  });
});