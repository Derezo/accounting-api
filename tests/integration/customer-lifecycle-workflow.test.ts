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
  TestContext,
  PerformanceTimer
} from './test-utils';
import {
  QuoteStatus,
  InvoiceStatus,
  PaymentStatus,
  ProjectStatus,
  PaymentMethod,
  CustomerStatus,
  UserRole
} from '../../src/types/enums';

describe('Complete Customer Lifecycle Workflow Integration Tests', () => {
  let testContext: TestContext;
  let performanceTimer: PerformanceTimer;

  beforeEach(async () => {
    testContext = await createTestContext(prisma, 'Lifecycle Workflow Test Org');
    performanceTimer = new PerformanceTimer();
  });

  describe('8-Stage Customer Lifecycle: Complete End-to-End Workflow', () => {
    test('should complete all 8 stages of customer lifecycle with comprehensive validations', async () => {
      performanceTimer.start();

      const { organization, users, customers, authTokens } = testContext;
      const customer = customers[0];
      const adminToken = authTokens.admin;
      const managerToken = authTokens.manager;
      const accountantToken = authTokens.accountant;

      // ==========================================================================
      // STAGE 1: REQUEST QUOTE - Customer submits project inquiry
      // ==========================================================================
      console.log('🏁 STAGE 1: Request Quote - Customer inquiry submission');

      // Simulate customer request through contact form/API
      const quoteRequestResponse = await authenticatedRequest(adminToken)
        .post('/api/quotes')
        .send({
          customerId: customer!.id,
          description: 'E-commerce website development with payment integration',
          notes: 'Customer requesting modern e-commerce platform with Stripe integration, inventory management, and admin dashboard',
          validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          items: [
            {
              description: 'Initial consultation and requirements gathering',
              quantity: 4,
              unitPrice: 150.00,
              taxRate: 0.13,
              discountPercent: 0
            },
            {
              description: 'UI/UX Design and Mockups',
              quantity: 16,
              unitPrice: 125.00,
              taxRate: 0.13,
              discountPercent: 0
            },
            {
              description: 'Frontend Development (React)',
              quantity: 40,
              unitPrice: 175.00,
              taxRate: 0.13,
              discountPercent: 0
            },
            {
              description: 'Backend Development (Node.js/Express)',
              quantity: 35,
              unitPrice: 175.00,
              taxRate: 0.13,
              discountPercent: 0
            },
            {
              description: 'Payment Gateway Integration (Stripe)',
              quantity: 8,
              unitPrice: 200.00,
              taxRate: 0.13,
              discountPercent: 0
            },
            {
              description: 'Testing and Quality Assurance',
              quantity: 12,
              unitPrice: 150.00,
              taxRate: 0.13,
              discountPercent: 0
            }
          ],
          terms: 'Net 30 days, 50% deposit required to start work',
          currency: 'CAD'
        })
        .expect(201);

      const quote = quoteRequestResponse.body;

      // Stage 1 Validations
      expect(quote.status).toBe(QuoteStatus.DRAFT);
      expect(quote.organizationId).toBe(organization.id);
      expect(quote.customerId).toBe(customer!.id);
      expect(quote.total).toBeGreaterThan(0);
      expect(quote.subtotal).toBeGreaterThan(0);
      expect(quote.taxAmount).toBeGreaterThan(0);
      expect(quote.items).toHaveLength(6);
      expect(quote.createdById).toBe(users.admin.id);
      expect(quote.quoteNumber).toMatch(/^Q-\d{6}$/);
      expect(quote.validUntil).toBeTruthy();

      // Verify audit log for quote creation
      await verifyAuditLog(prisma, organization.id, 'CREATE', 'Quote', quote.id, users.admin.id);

      // Calculate expected totals
      const expectedSubtotal = 600 + 2000 + 7000 + 6125 + 1600 + 1800; // 19,125
      const expectedTax = expectedSubtotal * 0.13; // 2,486.25
      const expectedTotal = expectedSubtotal + expectedTax; // 21,611.25

      expect(quote.subtotal).toBeCloseTo(expectedSubtotal, 2);
      expect(quote.taxAmount).toBeCloseTo(expectedTax, 2);
      expect(quote.total).toBeCloseTo(expectedTotal, 2);

      console.log(`✅ Stage 1 Complete: Quote created with total $${quote.total.toFixed(2)}`);

      // ==========================================================================
      // STAGE 2: QUOTE ESTIMATED - Internal team reviews and prices quote
      // ==========================================================================
      console.log('💰 STAGE 2: Quote Estimated - Internal review and pricing');

      // Manager reviews and adds internal estimates
      const estimationResponse = await authenticatedRequest(managerToken)
        .patch(`/api/quotes/${quote.id}/estimate`)
        .send({
          internalNotes: 'Reviewed requirements. Complexity is moderate. Timeline: 8-10 weeks.',
          estimatedHours: 115, // Sum of all item quantities
          estimatedCost: 12000, // Internal cost estimate
          profitMargin: 0.45, // 45% profit margin
          riskFactor: 0.1, // 10% risk buffer
          competitorAnalysis: 'Market rate for similar projects: $18k-$25k',
          recommendedAdjustments: 'Pricing is competitive for the scope provided'
        })
        .expect(200);

      const estimatedQuote = estimationResponse.body;

      // Stage 2 Validations
      expect(estimatedQuote.status).toBe(QuoteStatus.ESTIMATED);
      expect(estimatedQuote.estimatedAt).toBeTruthy();
      expect(estimatedQuote.estimatedById).toBe(users.manager.id);
      expect(estimatedQuote.internalNotes).toContain('Reviewed requirements');

      // Verify audit log for quote estimation
      await verifyAuditLog(prisma, organization.id, 'UPDATE', 'Quote', quote.id, users.manager.id);

      console.log('✅ Stage 2 Complete: Quote estimated and reviewed by management');

      // ==========================================================================
      // STAGE 3: QUOTE ACCEPTED - Customer accepts the quote
      // ==========================================================================
      console.log('📋 STAGE 3: Quote Accepted - Customer approval process');

      // First, send quote to customer
      const sentQuoteResponse = await authenticatedRequest(adminToken)
        .patch(`/api/quotes/${quote.id}/send`)
        .send({
          emailSubject: 'Your E-commerce Development Quote #' + quote.quoteNumber,
          emailMessage: 'Thank you for your interest in our services. Please review the attached quote.',
          sendToEmails: [customer!.personId ? 'customer@example.com' : 'business@example.com']
        })
        .expect(200);

      // Stage 3a Validations - Quote Sent
      expect(sentQuoteResponse.body.status).toBe(QuoteStatus.SENT);
      expect(sentQuoteResponse.body.sentAt).toBeTruthy();
      expect(sentQuoteResponse.body.sentById).toBe(users.admin.id);

      // Simulate customer viewing the quote
      await authenticatedRequest(adminToken)
        .patch(`/api/quotes/${quote.id}/view`)
        .send({
          viewedByEmail: customer!.personId ? 'customer@example.com' : 'business@example.com',
          viewedAt: new Date().toISOString()
        })
        .expect(200);

      // Customer accepts the quote
      const acceptedQuoteResponse = await authenticatedRequest(adminToken)
        .patch(`/api/quotes/${quote.id}/accept`)
        .send({
          acceptedByEmail: customer!.personId ? 'customer@example.com' : 'business@example.com',
          acceptanceNotes: 'Looks great! Ready to proceed with the project.',
          signatureHash: 'digital_signature_hash_abc123',
          acceptanceMethod: 'DIGITAL_SIGNATURE'
        })
        .expect(200);

      const acceptedQuote = acceptedQuoteResponse.body;

      // Stage 3 Validations - Quote Accepted
      expect(acceptedQuote.status).toBe(QuoteStatus.ACCEPTED);
      expect(acceptedQuote.acceptedAt).toBeTruthy();
      expect(acceptedQuote.acceptanceNotes).toContain('Ready to proceed');
      expect(acceptedQuote.signatureHash).toBe('digital_signature_hash_abc123');

      // Verify audit logs for quote sending and acceptance
      await verifyAuditLog(prisma, organization.id, 'UPDATE', 'Quote', quote.id, users.admin.id);

      console.log('✅ Stage 3 Complete: Quote accepted by customer with digital signature');

      // ==========================================================================
      // STAGE 4: APPOINTMENT SCHEDULED - Initial project meeting
      // ==========================================================================
      console.log('📅 STAGE 4: Appointment Scheduled - Project kickoff planning');

      // Create project record first (required for appointment)
      const projectResponse = await authenticatedRequest(managerToken)
        .post('/api/projects')
        .send({
          name: 'E-commerce Website Development',
          description: 'Complete e-commerce platform with payment integration based on accepted quote',
          customerId: customer!.id,
          quoteId: quote.id,
          assignedToId: users.admin.id,
          estimatedHours: 115,
          hourlyRate: 165.00, // Average rate from quote items
          fixedPrice: quote.total,
          startDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          endDate: new Date(Date.now() + 70 * 24 * 60 * 60 * 1000).toISOString(), // 10 weeks
          priority: 2, // High priority
          tags: ['ecommerce', 'react', 'stripe', 'nodejs'],
          deliverables: [
            'Requirements documentation',
            'UI/UX mockups',
            'Functional website',
            'Admin dashboard',
            'Payment system',
            'User documentation'
          ]
        })
        .expect(201);

      const project = projectResponse.body;

      // Stage 4a Validations - Project Created
      expect(project.status).toBe(ProjectStatus.QUOTED);
      expect(project.customerId).toBe(customer!.id);
      expect(project.quoteId).toBe(quote.id);
      expect(project.fixedPrice).toBe(quote.total);
      expect(project.projectNumber).toMatch(/^PROJ-\d{6}$/);

      // Schedule initial consultation appointment
      const appointmentResponse = await authenticatedRequest(adminToken)
        .post('/api/appointments')
        .send({
          customerId: customer!.id,
          projectId: project.id,
          title: 'Project Kickoff & Requirements Review',
          description: 'Initial meeting to review project requirements, timeline, and deliverables. Technical architecture discussion.',
          startTime: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(), // 2 days from now
          endTime: new Date(Date.now() + 48 * 60 * 60 * 1000 + 90 * 60 * 1000).toISOString(), // 90 minutes
          duration: 90,
          appointmentType: 'KICKOFF_MEETING',
          meetingLocation: 'Conference Room A / Video Call',
          attendees: [
            { email: users.admin.email, role: 'Lead Developer' },
            { email: users.manager.email, role: 'Project Manager' },
            { email: customer!.personId ? 'customer@example.com' : 'business@example.com', role: 'Client' }
          ],
          preparationNotes: 'Review quote details, prepare technical questions, bring brand assets'
        })
        .expect(201);

      const appointment = appointmentResponse.body;

      // Stage 4 Validations - Appointment Scheduled
      expect(appointment.customerId).toBe(customer!.id);
      expect(appointment.projectId).toBe(project.id);
      expect(appointment.confirmed).toBe(false);
      expect(appointment.duration).toBe(90);
      expect(appointment.title).toContain('Kickoff');

      // Confirm appointment
      const confirmedAppointmentResponse = await authenticatedRequest(adminToken)
        .patch(`/api/appointments/${appointment.id}/confirm`)
        .send({
          confirmationNotes: 'Meeting confirmed. Calendar invites sent to all attendees.',
          confirmedById: users.admin.id
        })
        .expect(200);

      // Stage 4b Validations - Appointment Confirmed
      expect(confirmedAppointmentResponse.body.confirmed).toBe(true);
      expect(confirmedAppointmentResponse.body.confirmedAt).toBeTruthy();
      expect(confirmedAppointmentResponse.body.confirmedById).toBe(users.admin.id);

      console.log('✅ Stage 4 Complete: Project created and kickoff appointment scheduled & confirmed');

      // ==========================================================================
      // STAGE 5: INVOICE GENERATED - Convert quote to invoice
      // ==========================================================================
      console.log('🧾 STAGE 5: Invoice Generated - Billing preparation');

      // Generate invoice from accepted quote
      const invoiceResponse = await authenticatedRequest(accountantToken)
        .post('/api/invoices')
        .send({
          customerId: customer!.id,
          quoteId: quote.id,
          projectId: project.id,
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
          terms: 'Net 30 days. 50% deposit required before work begins.',
          paymentInstructions: 'Payment can be made via credit card, e-Transfer, or bank transfer. Contact for payment details.',
          depositRequired: Math.round(quote.total * 0.5 * 100) / 100, // 50% deposit
          notes: 'Invoice generated from accepted quote #' + quote.quoteNumber + '. Deposit payment will initiate project work.',
          currency: 'CAD',
          exchangeRate: 1.0,
          billToContact: {
            name: customer!.personId ? 'John Doe' : 'Tech Solutions Inc.',
            email: customer!.personId ? 'customer@example.com' : 'business@example.com',
            phone: '+1-555-123-4567'
          }
        })
        .expect(201);

      const invoice = invoiceResponse.body;

      // Stage 5 Validations - Invoice Generated
      expect(invoice.status).toBe(InvoiceStatus.DRAFT);
      expect(invoice.customerId).toBe(customer!.id);
      expect(invoice.quoteId).toBe(quote.id);
      expect(invoice.projectId).toBe(project.id);
      expect(invoice.total).toBe(quote.total);
      expect(invoice.subtotal).toBe(quote.subtotal);
      expect(invoice.taxAmount).toBe(quote.taxAmount);
      expect(invoice.depositRequired).toBe(Math.round(quote.total * 0.5 * 100) / 100);
      expect(invoice.amountPaid).toBe(0);
      expect(invoice.balance).toBe(invoice.total);
      expect(invoice.invoiceNumber).toMatch(/^INV-\d{6}$/);

      // Copy quote items to invoice items
      const invoiceItemsResponse = await authenticatedRequest(accountantToken)
        .get(`/api/invoices/${invoice.id}/items`)
        .expect(200);

      expect(invoiceItemsResponse.body.data).toHaveLength(6); // Same as quote items

      // Send invoice to customer
      const sentInvoiceResponse = await authenticatedRequest(accountantToken)
        .patch(`/api/invoices/${invoice.id}/send`)
        .send({
          emailSubject: 'Invoice #' + invoice.invoiceNumber + ' - E-commerce Development Project',
          emailMessage: 'Please find your invoice attached. 50% deposit is required to begin work.',
          sendToEmails: [customer!.personId ? 'customer@example.com' : 'business@example.com'],
          ccEmails: [users.manager.email],
          attachments: ['invoice_pdf', 'payment_instructions']
        })
        .expect(200);

      // Stage 5b Validations - Invoice Sent
      expect(sentInvoiceResponse.body.status).toBe(InvoiceStatus.SENT);
      expect(sentInvoiceResponse.body.sentAt).toBeTruthy();
      expect(sentInvoiceResponse.body.sentById).toBe(users.accountant.id);

      // Verify audit logs for invoice creation and sending
      await verifyAuditLog(prisma, organization.id, 'CREATE', 'Invoice', invoice.id, users.accountant.id);

      console.log(`✅ Stage 5 Complete: Invoice generated and sent - Total: $${invoice.total.toFixed(2)}, Deposit Required: $${invoice.depositRequired.toFixed(2)}`);

      // ==========================================================================
      // STAGE 6: DEPOSIT PAID (25-50%) - Customer pays deposit
      // ==========================================================================
      console.log('💳 STAGE 6: Deposit Paid - Customer payment processing');

      // Simulate customer viewing invoice
      await authenticatedRequest(accountantToken)
        .patch(`/api/invoices/${invoice.id}/view`)
        .send({
          viewedByEmail: customer!.personId ? 'customer@example.com' : 'business@example.com',
          viewedAt: new Date().toISOString()
        })
        .expect(200);

      // Process deposit payment via Stripe
      const depositAmount = invoice.depositRequired;
      const stripeFee = Math.round(depositAmount * 0.029 * 100) / 100; // 2.9% Stripe fee
      const netDepositAmount = depositAmount - stripeFee;

      const depositPaymentResponse = await authenticatedRequest(accountantToken)
        .post('/api/payments')
        .send({
          customerId: customer!.id,
          invoiceId: invoice.id,
          projectId: project.id,
          amount: depositAmount,
          paymentMethod: PaymentMethod.STRIPE_CARD,
          currency: 'CAD',
          paymentDate: new Date().toISOString(),
          referenceNumber: 'pi_stripe_intent_12345abc',
          customerNotes: 'Deposit payment for e-commerce website development project',
          adminNotes: 'Deposit payment received via Stripe. Project can now begin.',
          processorFee: stripeFee,
          netAmount: netDepositAmount,
          metadata: JSON.stringify({
            stripe_payment_intent_id: 'pi_stripe_intent_12345abc',
            stripe_charge_id: 'ch_stripe_charge_67890def',
            payment_type: 'deposit',
            card_last4: '4242',
            card_brand: 'visa',
            processor: 'stripe'
          }),
          receiptData: {
            cardLast4: '4242',
            cardBrand: 'visa',
            authCode: 'AUTH123456',
            transactionId: 'TXN789012345'
          }
        })
        .expect(201);

      const depositPayment = depositPaymentResponse.body;

      // Stage 6 Validations - Deposit Payment
      expect(depositPayment.status).toBe(PaymentStatus.COMPLETED);
      expect(depositPayment.amount).toBe(depositAmount);
      expect(depositPayment.paymentMethod).toBe(PaymentMethod.STRIPE_CARD);
      expect(depositPayment.processorFee).toBe(stripeFee);
      expect(depositPayment.netAmount).toBe(netDepositAmount);
      expect(depositPayment.paymentNumber).toMatch(/^PAY-\d{6}$/);
      expect(depositPayment.processedAt).toBeTruthy();

      // Verify invoice is partially paid
      const partiallyPaidInvoiceResponse = await authenticatedRequest(accountantToken)
        .get(`/api/invoices/${invoice.id}`)
        .expect(200);

      const partiallyPaidInvoice = partiallyPaidInvoiceResponse.body;
      expect(partiallyPaidInvoice.status).toBe(InvoiceStatus.PARTIALLY_PAID);
      expect(partiallyPaidInvoice.amountPaid).toBe(depositAmount);
      expect(partiallyPaidInvoice.balance).toBe(invoice.total - depositAmount);
      expect(partiallyPaidInvoice.lastPaymentAt).toBeTruthy();

      // Verify audit logs for payment
      await verifyAuditLog(prisma, organization.id, 'CREATE', 'Payment', depositPayment.id, users.accountant.id);

      console.log(`✅ Stage 6 Complete: Deposit payment processed - Amount: $${depositAmount.toFixed(2)}, Remaining: $${partiallyPaidInvoice.balance.toFixed(2)}`);

      // ==========================================================================
      // STAGE 7: WORK BEGINS - Project activation and progress tracking
      // ==========================================================================
      console.log('🚀 STAGE 7: Work Begins - Project execution phase');

      // Approve project for work to begin (deposit received)
      const approvedProjectResponse = await authenticatedRequest(managerToken)
        .patch(`/api/projects/${project.id}/approve`)
        .send({
          approvalNotes: 'Deposit payment received. Project approved to begin work.',
          approvedById: users.manager.id,
          depositConfirmed: true,
          workAuthorizationNumber: 'WA-' + project.projectNumber
        })
        .expect(200);

      // Stage 7a Validations - Project Approved
      expect(approvedProjectResponse.body.status).toBe(ProjectStatus.APPROVED);
      expect(approvedProjectResponse.body.approvedAt).toBeTruthy();
      expect(approvedProjectResponse.body.approvedById).toBe(users.manager.id);

      // Start the project officially
      const startedProjectResponse = await authenticatedRequest(adminToken)
        .patch(`/api/projects/${project.id}/start`)
        .send({
          startNotes: 'Project kickoff meeting completed. Beginning development phase.',
          actualStartDate: new Date().toISOString(),
          initialTasks: [
            'Set up development environment',
            'Create project repository',
            'Initialize database schema',
            'Begin UI/UX mockups'
          ]
        })
        .expect(200);

      const startedProject = startedProjectResponse.body;

      // Stage 7b Validations - Project Started
      expect(startedProject.status).toBe(ProjectStatus.IN_PROGRESS);
      expect(startedProject.actualStartDate).toBeTruthy();
      expect(startedProject.actualHours).toBe(0);

      // Complete the kickoff appointment
      const completedAppointmentResponse = await authenticatedRequest(adminToken)
        .patch(`/api/appointments/${appointment.id}/complete`)
        .send({
          completionNotes: 'Kickoff meeting successful. Requirements clarified, timeline confirmed.',
          actualDuration: 95, // Slightly longer than planned
          outcomes: [
            'Requirements documented',
            'Technical stack confirmed',
            'Milestone schedule agreed',
            'Communication plan established'
          ],
          nextSteps: [
            'Begin UI/UX design phase',
            'Set up development environment',
            'Create project documentation'
          ]
        })
        .expect(200);

      expect(completedAppointmentResponse.body.completed).toBe(true);
      expect(completedAppointmentResponse.body.completedAt).toBeTruthy();

      // Record initial project progress
      await delay(1000); // Ensure timestamp differences

      const progressResponse = await authenticatedRequest(adminToken)
        .patch(`/api/projects/${project.id}/progress`)
        .send({
          hoursWorked: 12,
          progressNotes: 'Completed initial setup: development environment, repository, and database schema design',
          milestonesCompleted: ['Development Environment Setup'],
          blockers: [],
          nextMilestones: ['UI/UX Design Phase'],
          percentComplete: 10
        })
        .expect(200);

      // Stage 7c Validations - Project Progress
      expect(progressResponse.body.actualHours).toBe(12);
      expect(progressResponse.body.percentComplete).toBe(10);

      // Verify audit logs for project approval and start
      await verifyAuditLog(prisma, organization.id, 'UPDATE', 'Project', project.id, users.manager.id);

      console.log('✅ Stage 7 Complete: Project approved, started, and initial progress recorded');

      // ==========================================================================
      // STAGE 8: PROJECT COMPLETION - Final delivery and closure
      // ==========================================================================
      console.log('🎉 STAGE 8: Project Completion - Final delivery and closure');

      // Simulate significant project progress over time
      const progressUpdates = [
        { hours: 20, notes: 'UI/UX design completed, frontend development begun', percent: 25 },
        { hours: 35, notes: 'Frontend development 70% complete, backend API development started', percent: 45 },
        { hours: 50, notes: 'Backend development complete, payment integration in progress', percent: 65 },
        { hours: 65, notes: 'Payment integration complete, testing phase begun', percent: 80 },
        { hours: 75, notes: 'Testing complete, deployment and final optimizations', percent: 95 }
      ];

      for (const update of progressUpdates) {
        await delay(500); // Small delays for timestamp differentiation
        await authenticatedRequest(adminToken)
          .patch(`/api/projects/${project.id}/progress`)
          .send({
            hoursWorked: update.hours,
            progressNotes: update.notes,
            percentComplete: update.percent
          })
          .expect(200);
      }

      // Process final payment
      const remainingAmount = partiallyPaidInvoice.balance;
      const finalPaymentResponse = await authenticatedRequest(accountantToken)
        .post('/api/payments')
        .send({
          customerId: customer!.id,
          invoiceId: invoice.id,
          projectId: project.id,
          amount: remainingAmount,
          paymentMethod: PaymentMethod.INTERAC_ETRANSFER,
          currency: 'CAD',
          paymentDate: new Date().toISOString(),
          referenceNumber: 'ETRF987654321',
          customerNotes: 'Final payment for completed e-commerce website project',
          adminNotes: 'Final payment received via e-Transfer. Project deliverables complete.',
          metadata: JSON.stringify({
            payment_type: 'final',
            etransfer_reference: 'ETRF987654321',
            processor: 'interac'
          }),
          receiptData: {
            etransferRef: 'ETRF987654321',
            bankName: 'TD Bank',
            securityQuestion: 'What is the project name?',
            securityAnswer: 'ecommerce'
          }
        })
        .expect(201);

      const finalPayment = finalPaymentResponse.body;

      // Stage 8a Validations - Final Payment
      expect(finalPayment.status).toBe(PaymentStatus.COMPLETED);
      expect(finalPayment.amount).toBe(remainingAmount);
      expect(finalPayment.paymentMethod).toBe(PaymentMethod.INTERAC_ETRANSFER);

      // Verify invoice is fully paid
      const paidInvoiceResponse = await authenticatedRequest(accountantToken)
        .get(`/api/invoices/${invoice.id}`)
        .expect(200);

      const paidInvoice = paidInvoiceResponse.body;
      expect(paidInvoice.status).toBe(InvoiceStatus.PAID);
      expect(paidInvoice.amountPaid).toBe(invoice.total);
      expect(paidInvoice.balance).toBe(0);
      expect(paidInvoice.paidAt).toBeTruthy();

      // Complete the project
      const completedProjectResponse = await authenticatedRequest(adminToken)
        .patch(`/api/projects/${project.id}/complete`)
        .send({
          completionNotes: 'E-commerce website project completed successfully. All deliverables met client requirements.',
          finalHours: 110, // Final hour count
          actualEndDate: new Date().toISOString(),
          deliverables: [
            'Fully functional e-commerce website',
            'Stripe payment integration',
            'Admin dashboard',
            'User authentication system',
            'Inventory management',
            'Order management',
            'Documentation and training materials'
          ],
          clientSatisfactionRating: 5,
          projectLessons: 'Excellent communication throughout. Client was very responsive to feedback.',
          qualityAssurance: {
            tested: true,
            bugCount: 0,
            performanceScore: 95,
            securityAudit: 'passed'
          }
        })
        .expect(200);

      const completedProject = completedProjectResponse.body;

      // Stage 8 Final Validations - Project Completed
      expect(completedProject.status).toBe(ProjectStatus.COMPLETED);
      expect(completedProject.completedAt).toBeTruthy();
      expect(completedProject.actualEndDate).toBeTruthy();
      expect(completedProject.actualHours).toBe(110);
      expect(completedProject.percentComplete).toBe(100);

      // Update customer status to reflect successful project completion
      const updatedCustomerResponse = await authenticatedRequest(adminToken)
        .patch(`/api/customers/${customer!.id}`)
        .send({
          status: CustomerStatus.ACTIVE,
          notes: 'Successfully completed e-commerce website project. Excellent client relationship.',
          lastProjectDate: new Date().toISOString(),
          totalProjectsCompleted: 1,
          lifetimeValue: invoice.total
        })
        .expect(200);

      expect(updatedCustomerResponse.body.status).toBe(CustomerStatus.ACTIVE);

      console.log('✅ Stage 8 Complete: Project delivered, final payment received, customer relationship maintained');

      // ==========================================================================
      // COMPREHENSIVE FINAL VALIDATIONS
      // ==========================================================================
      console.log('🔍 COMPREHENSIVE VALIDATION: End-to-end workflow verification');

      const endTime = performanceTimer.stop();

      // Verify complete audit trail
      const completeAuditResponse = await authenticatedRequest(adminToken)
        .get(`/api/audit-logs?organizationId=${organization.id}&limit=100`)
        .expect(200);

      const auditLogs = completeAuditResponse.body.data;
      expect(auditLogs.length).toBeGreaterThan(20); // Should have many audit entries

      // Verify all entities exist and are properly linked
      const finalQuoteResponse = await authenticatedRequest(adminToken)
        .get(`/api/quotes/${quote.id}`)
        .expect(200);

      const finalInvoiceResponse = await authenticatedRequest(adminToken)
        .get(`/api/invoices/${invoice.id}`)
        .expect(200);

      const finalProjectResponse = await authenticatedRequest(adminToken)
        .get(`/api/projects/${project.id}`)
        .expect(200);

      const paymentsResponse = await authenticatedRequest(adminToken)
        .get(`/api/payments?invoiceId=${invoice.id}`)
        .expect(200);

      const appointmentsResponse = await authenticatedRequest(adminToken)
        .get(`/api/appointments?projectId=${project.id}`)
        .expect(200);

      // Final Entity Validations
      expect(finalQuoteResponse.body.status).toBe(QuoteStatus.ACCEPTED);
      expect(finalInvoiceResponse.body.status).toBe(InvoiceStatus.PAID);
      expect(finalProjectResponse.body.status).toBe(ProjectStatus.COMPLETED);
      expect(paymentsResponse.body.data).toHaveLength(2); // Deposit + Final
      expect(appointmentsResponse.body.data).toHaveLength(1);

      // Verify financial totals
      const totalPayments = paymentsResponse.body.data.reduce((sum: number, payment: any) => sum + payment.amount, 0);
      expect(totalPayments).toBe(invoice.total);

      // Verify multi-tenant isolation
      const organizationCheck = await authenticatedRequest(adminToken)
        .get(`/api/quotes?organizationId=${organization.id}`)
        .expect(200);

      expect(organizationCheck.body.data.every((q: any) => q.organizationId === organization.id)).toBe(true);

      // Performance validation
      expect(endTime).toBeLessThan(30000); // Should complete within 30 seconds

      console.log(`🎯 WORKFLOW COMPLETE: All 8 stages successful in ${endTime.toFixed(0)}ms`);
      console.log(`📊 Final Summary:`);
      console.log(`   • Quote Total: $${quote.total.toFixed(2)}`);
      console.log(`   • Payments Received: $${totalPayments.toFixed(2)}`);
      console.log(`   • Project Hours: ${completedProject.actualHours}`);
      console.log(`   • Customer Status: ${updatedCustomerResponse.body.status}`);
      console.log(`   • Audit Log Entries: ${auditLogs.length}`);

      // Business Logic Validations
      expect(quote.organizationId).toBe(organization.id);
      expect(invoice.organizationId).toBe(organization.id);
      expect(project.organizationId).toBe(organization.id);
      expect(depositPayment.organizationId).toBe(organization.id);
      expect(finalPayment.organizationId).toBe(organization.id);

    }, 90000); // 90 second timeout for comprehensive test

    test('should handle workflow failures and recovery scenarios', async () => {
      const { organization, users, customers, authTokens } = testContext;
      const customer = customers[1]; // Use second customer
      const adminToken = authTokens.admin;

      // Test quote rejection and revision cycle
      const quoteResponse = await authenticatedRequest(adminToken)
        .post('/api/quotes')
        .send({
          customerId: customer!.id,
          description: 'Mobile app development',
          items: [{
            description: 'Mobile app development',
            quantity: 100,
            unitPrice: 150.00,
            taxRate: 0.13
          }],
          validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        })
        .expect(201);

      const quote = quoteResponse.body;

      // Send and reject quote
      await authenticatedRequest(adminToken)
        .patch(`/api/quotes/${quote.id}/send`)
        .expect(200);

      const rejectedQuoteResponse = await authenticatedRequest(adminToken)
        .patch(`/api/quotes/${quote.id}/reject`)
        .send({
          rejectionReason: 'Price too high for our budget',
          rejectedByEmail: 'customer@example.com'
        })
        .expect(200);

      expect(rejectedQuoteResponse.body.status).toBe(QuoteStatus.REJECTED);
      expect(rejectedQuoteResponse.body.rejectedAt).toBeTruthy();

      // Create revised quote with lower price
      const revisedQuoteResponse = await authenticatedRequest(adminToken)
        .post('/api/quotes')
        .send({
          customerId: customer!.id,
          description: 'Mobile app development (Revised)',
          items: [{
            description: 'Mobile app development - reduced scope',
            quantity: 80,
            unitPrice: 125.00,
            discountPercent: 10,
            taxRate: 0.13
          }],
          validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          notes: 'Revised quote based on customer feedback'
        })
        .expect(201);

      expect(revisedQuoteResponse.body.total).toBeLessThan(quote.total);

      // Test payment failure scenario
      const invoice = await createTestInvoice(prisma, organization.id, customer!.id);

      // Simulate failed payment
      const failedPaymentResponse = await authenticatedRequest(adminToken)
        .post('/api/payments')
        .send({
          customerId: customer!.id,
          invoiceId: invoice.id,
          amount: 100.00,
          paymentMethod: PaymentMethod.STRIPE_CARD,
          referenceNumber: 'failed_payment_123',
          customerNotes: 'Test failed payment'
        })
        .expect(201);

      // Mark payment as failed
      await authenticatedRequest(adminToken)
        .patch(`/api/payments/${failedPaymentResponse.body.id}/fail`)
        .send({
          failureReason: 'Insufficient funds',
          processorMessage: 'Card declined: insufficient_funds'
        })
        .expect(200);

      const failedPayment = await authenticatedRequest(adminToken)
        .get(`/api/payments/${failedPaymentResponse.body.id}`)
        .expect(200);

      expect(failedPayment.body.status).toBe(PaymentStatus.FAILED);

      // Verify invoice remains unpaid
      const unpaidInvoice = await authenticatedRequest(adminToken)
        .get(`/api/invoices/${invoice.id}`)
        .expect(200);

      expect(unpaidInvoice.body.status).toBe(InvoiceStatus.SENT);
      expect(unpaidInvoice.body.amountPaid).toBe(0);

      console.log('✅ Failure scenarios and recovery mechanisms validated');
    });
  });

  describe('Role-Based Workflow Permissions', () => {
    test('should enforce proper role permissions throughout lifecycle', async () => {
      const { organization, users, customers, authTokens } = testContext;
      const customer = customers[0];

      // Test that VIEWER cannot create quotes
      await authenticatedRequest(authTokens.viewer)
        .post('/api/quotes')
        .send({
          customerId: customer!.id,
          description: 'Test quote',
          items: [{ description: 'Test', quantity: 1, unitPrice: 100, taxRate: 0.13 }]
        })
        .expect(403);

      // Test that EMPLOYEE can create quotes but not approve projects
      const employeeQuoteResponse = await authenticatedRequest(authTokens.employee)
        .post('/api/quotes')
        .send({
          customerId: customer!.id,
          description: 'Employee created quote',
          items: [{ description: 'Test', quantity: 1, unitPrice: 100, taxRate: 0.13 }]
        })
        .expect(201);

      const project = await createTestProject(prisma, organization.id, customer!.id, users.employee.id);

      // Employee cannot approve project
      await authenticatedRequest(authTokens.employee)
        .patch(`/api/projects/${project.id}/approve`)
        .send({ approvalNotes: 'Test approval' })
        .expect(403);

      // Manager can approve project
      await authenticatedRequest(authTokens.manager)
        .patch(`/api/projects/${project.id}/approve`)
        .send({ approvalNotes: 'Manager approval' })
        .expect(200);

      // Test that only ACCOUNTANT can process refunds
      const payment = await createTestPayment(prisma, organization.id, customer!.id);

      await authenticatedRequest(authTokens.employee)
        .post(`/api/payments/${payment.id}/refund`)
        .send({ amount: 50.00, reason: 'Test refund' })
        .expect(403);

      await authenticatedRequest(authTokens.accountant)
        .post(`/api/payments/${payment.id}/refund`)
        .send({ amount: 50.00, reason: 'Authorized refund' })
        .expect(201);

      console.log('✅ Role-based permission enforcement validated');
    });
  });

  describe('Data Integrity and Consistency', () => {
    test('should maintain data integrity throughout entire workflow', async () => {
      const { organization, users, customers, authTokens } = testContext;
      const customer = customers[0];
      const adminToken = authTokens.admin;

      // Create quote with specific totals
      const quoteResponse = await authenticatedRequest(adminToken)
        .post('/api/quotes')
        .send({
          customerId: customer!.id,
          description: 'Data integrity test',
          items: [
            { description: 'Item 1', quantity: 2, unitPrice: 100.00, taxRate: 0.13 },
            { description: 'Item 2', quantity: 3, unitPrice: 150.00, taxRate: 0.13 }
          ]
        })
        .expect(201);

      const quote = quoteResponse.body;
      const expectedSubtotal = (2 * 100) + (3 * 150); // 650
      const expectedTax = expectedSubtotal * 0.13; // 84.50
      const expectedTotal = expectedSubtotal + expectedTax; // 734.50

      expect(quote.subtotal).toBeCloseTo(expectedSubtotal, 2);
      expect(quote.taxAmount).toBeCloseTo(expectedTax, 2);
      expect(quote.total).toBeCloseTo(expectedTotal, 2);

      // Create invoice from quote
      const invoiceResponse = await authenticatedRequest(adminToken)
        .post('/api/invoices')
        .send({
          customerId: customer!.id,
          quoteId: quote.id,
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        })
        .expect(201);

      const invoice = invoiceResponse.body;

      // Verify invoice totals match quote
      expect(invoice.subtotal).toBeCloseTo(quote.subtotal, 2);
      expect(invoice.taxAmount).toBeCloseTo(quote.taxAmount, 2);
      expect(invoice.total).toBeCloseTo(quote.total, 2);

      // Test partial payments sum correctly
      const payment1Response = await authenticatedRequest(adminToken)
        .post('/api/payments')
        .send({
          customerId: customer!.id,
          invoiceId: invoice.id,
          amount: 300.00,
          paymentMethod: PaymentMethod.STRIPE_CARD,
          referenceNumber: 'payment1'
        })
        .expect(201);

      const payment2Response = await authenticatedRequest(adminToken)
        .post('/api/payments')
        .send({
          customerId: customer!.id,
          invoiceId: invoice.id,
          amount: 434.50,
          paymentMethod: PaymentMethod.INTERAC_ETRANSFER,
          referenceNumber: 'payment2'
        })
        .expect(201);

      // Verify invoice is fully paid
      const paidInvoiceResponse = await authenticatedRequest(adminToken)
        .get(`/api/invoices/${invoice.id}`)
        .expect(200);

      const paidInvoice = paidInvoiceResponse.body;
      expect(paidInvoice.amountPaid).toBeCloseTo(734.50, 2);
      expect(paidInvoice.balance).toBeCloseTo(0, 2);
      expect(paidInvoice.status).toBe(InvoiceStatus.PAID);

      // Verify all amounts are consistent in the database
      const dbInvoice = await prisma.invoice.findUnique({
        where: { id: invoice.id },
        include: { payments: true }
      });

      const totalPayments = dbInvoice!.payments.reduce((sum, payment) => sum + payment.amount, 0);
      expect(totalPayments).toBeCloseTo(paidInvoice.amountPaid, 2);

      console.log('✅ Data integrity and financial calculation consistency validated');
    });
  });
});