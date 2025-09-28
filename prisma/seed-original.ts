import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

// Helper function to hash passwords
const hashPassword = async (password: string): Promise<string> => {
  return await bcrypt.hash(password, 12);
};

// Generate organization encryption key
const generateEncryptionKey = (): string => {
  return randomUUID().replace(/-/g, '');
};

async function main() {
  console.log('🌱 Starting database seeding...');

  // Clear existing data in development
  if (process.env.NODE_ENV === 'development') {
    console.log('🧹 Clearing existing development data...');
    await prisma.session.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.invoice.deleteMany();
    await prisma.quote.deleteMany();
    await prisma.appointment.deleteMany();
    await prisma.project.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.user.deleteMany();
    await prisma.organization.deleteMany();
  }

  // ==================== CREATE ORGANIZATIONS ====================
  console.log('🏢 Creating organizations...');

  const organization1 = await prisma.organization.create({
    data: {
      id: 'org_acme_corp_001',
      name: 'Acme Corporation',
      legalName: 'Acme Corporation Ltd.',
      domain: 'acme.dev',
      type: 'SINGLE_BUSINESS',
      isActive: true,
      settings: JSON.stringify({
        timezone: 'America/Toronto',
        currency: 'CAD',
        fiscal_year_start: '01-01',
        tax_settings: {
          hst_rate: 0.13,
          gst_rate: 0.05,
          pst_rate: 0.08
        },
        invoice_settings: {
          default_terms: 'NET_30',
          auto_send_reminders: true,
          late_fee_percentage: 2.5
        }
      }),
      encryptionKey: generateEncryptionKey(),
      businessNumber: '123456789RC0001',
      taxNumber: 'CA123456789',
      email: 'contact@acme.dev',
      phone: '+1-416-555-0001',
      website: 'https://acme.dev'
    }
  });

  const organization2 = await prisma.organization.create({
    data: {
      id: 'org_tech_solutions_002',
      name: 'TechSolutions Inc',
      legalName: 'TechSolutions Incorporated',
      domain: 'techsolutions.dev',
      type: 'SINGLE_BUSINESS',
      isActive: true,
      settings: JSON.stringify({
        timezone: 'America/Vancouver',
        currency: 'CAD',
        fiscal_year_start: '04-01',
        tax_settings: {
          hst_rate: 0.12,
          gst_rate: 0.05,
          pst_rate: 0.07
        },
        invoice_settings: {
          default_terms: 'NET_15',
          auto_send_reminders: true,
          late_fee_percentage: 1.5
        }
      }),
      encryptionKey: generateEncryptionKey(),
      businessNumber: '987654321RC0001',
      taxNumber: 'CA987654321',
      email: 'hello@techsolutions.dev',
      phone: '+1-604-555-0002',
      website: 'https://techsolutions.dev'
    }
  });

  // ==================== CREATE USERS WITH DIFFERENT ROLES ====================
  console.log('👥 Creating users with different roles...');

  // Super Admin User
  const superAdmin = await prisma.user.create({
    data: {
      id: 'user_super_admin_001',
      organizationId: organization1.id,
      email: 'admin@acme.dev',
      passwordHash: await hashPassword('SuperAdmin123!'),
      role: 'SUPER_ADMIN',
      isActive: true,
      emailVerified: true,
      firstName: 'Sarah',
      lastName: 'Administrator',
      phone: '+1-416-555-0101'
    }
  });

  // Organization Admin
  const orgAdmin = await prisma.user.create({
    data: {
      id: 'user_org_admin_001',
      organizationId: organization1.id,
      email: 'manager@acme.dev',
      passwordHash: await hashPassword('OrgAdmin123!'),
      role: 'ADMIN',
      isActive: true,
      emailVerified: true,
      firstName: 'Michael',
      lastName: 'Manager',
      phone: '+1-416-555-0102'
    }
  });

  // Department Manager
  const manager = await prisma.user.create({
    data: {
      id: 'user_manager_001',
      organizationId: organization1.id,
      email: 'sales@acme.dev',
      passwordHash: await hashPassword('Manager123!'),
      role: 'MANAGER',
      isActive: true,
      emailVerified: true,
      firstName: 'Jennifer',
      lastName: 'Sales',
      phone: '+1-416-555-0103'
    }
  });

  // Accountant
  const accountant = await prisma.user.create({
    data: {
      id: 'user_accountant_001',
      organizationId: organization1.id,
      email: 'accounting@acme.dev',
      passwordHash: await hashPassword('Accountant123!'),
      role: 'ACCOUNTANT',
      isActive: true,
      emailVerified: true,
      firstName: 'David',
      lastName: 'Numbers',
      phone: '+1-416-555-0104'
    }
  });

  // Employee
  const employee = await prisma.user.create({
    data: {
      id: 'user_employee_001',
      organizationId: organization1.id,
      email: 'employee@acme.dev',
      passwordHash: await hashPassword('Employee123!'),
      role: 'EMPLOYEE',
      isActive: true,
      emailVerified: true,
      firstName: 'Lisa',
      lastName: 'Worker',
      phone: '+1-416-555-0105'
    }
  });

  // Viewer (Read-only)
  const viewer = await prisma.user.create({
    data: {
      id: 'user_viewer_001',
      organizationId: organization1.id,
      email: 'viewer@acme.dev',
      passwordHash: await hashPassword('Viewer123!'),
      role: 'VIEWER',
      isActive: true,
      emailVerified: true,
      firstName: 'Robert',
      lastName: 'Observer',
      phone: '+1-416-555-0106'
    }
  });

  // Users for second organization
  const techAdmin = await prisma.user.create({
    data: {
      id: 'user_tech_admin_001',
      organizationId: organization2.id,
      email: 'admin@techsolutions.dev',
      passwordHash: await hashPassword('TechAdmin123!'),
      role: 'ADMIN',
      isActive: true,
      emailVerified: true,
      firstName: 'Alex',
      lastName: 'Tech',
      phone: '+1-604-555-0201'
    }
  });

  // ==================== CREATE CUSTOMERS ====================
  console.log('👤 Creating customers...');

  const customer1 = await prisma.customer.create({
    data: {
      id: 'cust_001',
      organizationId: organization1.id,
      type: 'BUSINESS',
      companyName: 'Global Manufacturing Ltd',
      firstName: 'John',
      lastName: 'Smith',
      email: 'john.smith@globalmanufacturing.com',
      phone: '+1-416-555-1001',
      website: 'https://globalmanufacturing.com',
      taxNumber: 'CA111222333',
      creditLimit: 50000.00,
      paymentTerms: 'NET_30',
      isActive: true,
      notes: 'Long-term client, excellent payment history. Key contact for manufacturing partnerships.'
    }
  });

  const customer2 = await prisma.customer.create({
    data: {
      id: 'cust_002',
      organizationId: organization1.id,
      type: 'INDIVIDUAL',
      firstName: 'Emily',
      lastName: 'Johnson',
      email: 'emily.johnson@email.com',
      phone: '+1-416-555-1002',
      creditLimit: 10000.00,
      paymentTerms: 'NET_15',
      isActive: true,
      notes: 'Individual client, prefers email communication. Small business owner.'
    }
  });

  const customer3 = await prisma.customer.create({
    data: {
      id: 'cust_003',
      organizationId: organization1.id,
      type: 'BUSINESS',
      companyName: 'Startup Innovations Inc',
      firstName: 'Mark',
      lastName: 'Wilson',
      email: 'mark@startupinnovations.com',
      phone: '+1-416-555-1003',
      website: 'https://startupinnovations.com',
      creditLimit: 25000.00,
      paymentTerms: 'NET_15',
      isActive: true,
      notes: 'Growing startup, fast payments. Technology services client.'
    }
  });

  // ==================== CREATE PROJECTS ====================
  console.log('📋 Creating projects...');

  const project1 = await prisma.project.create({
    data: {
      id: 'proj_001',
      organizationId: organization1.id,
      customerId: customer1.id,
      name: 'Manufacturing System Integration',
      description: 'Complete ERP system integration for Global Manufacturing including inventory management, production planning, and quality control modules.',
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      budget: 150000.00,
      estimatedHours: 800,
      actualHours: 450,
      startDate: new Date('2024-01-15'),
      endDate: new Date('2024-06-30'),
      isActive: true,
      notes: 'Phase 1 completed ahead of schedule. Currently working on Phase 2: Inventory Management.'
    }
  });

  const project2 = await prisma.project.create({
    data: {
      id: 'proj_002',
      organizationId: organization1.id,
      customerId: customer3.id,
      name: 'Website Redesign & Development',
      description: 'Modern responsive website with e-commerce capabilities, admin dashboard, and customer portal.',
      status: 'PLANNING',
      priority: 'MEDIUM',
      budget: 35000.00,
      estimatedHours: 200,
      actualHours: 0,
      startDate: new Date('2024-03-01'),
      endDate: new Date('2024-05-15'),
      isActive: true,
      notes: 'Waiting for final design approval. Development to start next week.'
    }
  });

  // ==================== CREATE QUOTES ====================
  console.log('💰 Creating quotes...');

  const quote1 = await prisma.quote.create({
    data: {
      id: 'quote_001',
      organizationId: organization1.id,
      customerId: customer2.id,
      createdById: manager.id,
      quoteNumber: 'QUO-2024-001',
      title: 'Small Business Accounting Setup',
      description: 'Complete accounting system setup including chart of accounts, initial data entry, and staff training.',
      status: 'SENT',
      priority: 'MEDIUM',
      subtotal: 5000.00,
      taxAmount: 650.00,
      totalAmount: 5650.00,
      currency: 'CAD',
      validUntil: new Date('2024-04-15'),
      terms: 'NET_15',
      notes: 'Includes 3 months of support. Additional training sessions available at $150/hour.',
      items: JSON.stringify([
        {
          id: 1,
          description: 'Initial System Setup',
          quantity: 1,
          unitPrice: 2500.00,
          total: 2500.00
        },
        {
          id: 2,
          description: 'Data Migration',
          quantity: 1,
          unitPrice: 1500.00,
          total: 1500.00
        },
        {
          id: 3,
          description: 'Staff Training (2 sessions)',
          quantity: 2,
          unitPrice: 500.00,
          total: 1000.00
        }
      ])
    }
  });

  const quote2 = await prisma.quote.create({
    data: {
      id: 'quote_002',
      organizationId: organization1.id,
      customerId: customer1.id,
      createdById: manager.id,
      quoteNumber: 'QUO-2024-002',
      title: 'Manufacturing ERP Phase 3',
      description: 'Implementation of Quality Control and Reporting modules for the existing ERP system.',
      status: 'ACCEPTED',
      priority: 'HIGH',
      subtotal: 75000.00,
      taxAmount: 9750.00,
      totalAmount: 84750.00,
      currency: 'CAD',
      validUntil: new Date('2024-05-01'),
      terms: 'NET_30',
      notes: 'Extension of existing contract. Implementation starts immediately upon acceptance.',
      items: JSON.stringify([
        {
          id: 1,
          description: 'Quality Control Module',
          quantity: 1,
          unitPrice: 45000.00,
          total: 45000.00
        },
        {
          id: 2,
          description: 'Advanced Reporting System',
          quantity: 1,
          unitPrice: 25000.00,
          total: 25000.00
        },
        {
          id: 3,
          description: 'Integration & Testing',
          quantity: 1,
          unitPrice: 5000.00,
          total: 5000.00
        }
      ])
    }
  });

  // ==================== CREATE INVOICES ====================
  console.log('📄 Creating invoices...');

  const invoice1 = await prisma.invoice.create({
    data: {
      id: 'inv_001',
      organizationId: organization1.id,
      customerId: customer1.id,
      quoteId: quote2.id,
      invoiceNumber: 'INV-2024-001',
      title: 'Manufacturing ERP Phase 3 - Initial Payment',
      description: 'First installment for Quality Control and Reporting modules implementation.',
      status: 'PAID',
      subtotal: 37500.00,
      taxAmount: 4875.00,
      totalAmount: 42375.00,
      currency: 'CAD',
      dueDate: new Date('2024-03-15'),
      paidDate: new Date('2024-03-10'),
      terms: 'NET_30',
      notes: 'Payment received 5 days early. Excellent client!',
      items: JSON.stringify([
        {
          id: 1,
          description: 'Quality Control Module - 50% Payment',
          quantity: 1,
          unitPrice: 22500.00,
          total: 22500.00
        },
        {
          id: 2,
          description: 'Advanced Reporting System - 60% Payment',
          quantity: 1,
          unitPrice: 15000.00,
          total: 15000.00
        }
      ])
    }
  });

  const invoice2 = await prisma.invoice.create({
    data: {
      id: 'inv_002',
      organizationId: organization1.id,
      customerId: customer2.id,
      quoteId: quote1.id,
      invoiceNumber: 'INV-2024-002',
      title: 'Small Business Accounting Setup',
      description: 'Complete accounting system setup as per accepted quote QUO-2024-001.',
      status: 'SENT',
      subtotal: 5000.00,
      taxAmount: 650.00,
      totalAmount: 5650.00,
      currency: 'CAD',
      dueDate: new Date('2024-04-01'),
      terms: 'NET_15',
      notes: 'Setup completed successfully. Payment due within 15 days.',
      items: JSON.stringify([
        {
          id: 1,
          description: 'Initial System Setup',
          quantity: 1,
          unitPrice: 2500.00,
          total: 2500.00
        },
        {
          id: 2,
          description: 'Data Migration',
          quantity: 1,
          unitPrice: 1500.00,
          total: 1500.00
        },
        {
          id: 3,
          description: 'Staff Training (2 sessions)',
          quantity: 2,
          unitPrice: 500.00,
          total: 1000.00
        }
      ])
    }
  });

  // ==================== CREATE PAYMENTS ====================
  console.log('💳 Creating payments...');

  const payment1 = await prisma.payment.create({
    data: {
      id: 'pay_001',
      organizationId: organization1.id,
      customerId: customer1.id,
      invoiceId: invoice1.id,
      amount: 42375.00,
      currency: 'CAD',
      method: 'BANK_TRANSFER',
      status: 'COMPLETED',
      transactionId: 'TXN-BT-20240310-001',
      processedAt: new Date('2024-03-10T14:30:00Z'),
      notes: 'Wire transfer received from Global Manufacturing. Reference: INV-2024-001',
      metadata: JSON.stringify({
        bank_reference: 'WT-GM-20240310-123456',
        transaction_fee: 25.00,
        exchange_rate: 1.0000
      })
    }
  });

  // ==================== CREATE APPOINTMENTS ====================
  console.log('📅 Creating appointments...');

  const appointment1 = await prisma.appointment.create({
    data: {
      id: 'appt_001',
      organizationId: organization1.id,
      customerId: customer2.id,
      title: 'Initial Consultation - Accounting Setup',
      description: 'Discuss accounting requirements, current processes, and implementation timeline.',
      type: 'CONSULTATION',
      status: 'COMPLETED',
      priority: 'MEDIUM',
      startDateTime: new Date('2024-02-15T10:00:00Z'),
      endDateTime: new Date('2024-02-15T11:30:00Z'),
      location: 'Acme Corporation Office - Conference Room A',
      notes: 'Productive meeting. Client ready to proceed with full setup. Follow-up scheduled for training.',
      attendees: JSON.stringify([
        {
          name: 'Emily Johnson',
          email: 'emily.johnson@email.com',
          role: 'Client'
        },
        {
          name: 'Jennifer Sales',
          email: 'sales@acme.dev',
          role: 'Sales Manager'
        }
      ])
    }
  });

  const appointment2 = await prisma.appointment.create({
    data: {
      id: 'appt_002',
      organizationId: organization1.id,
      customerId: customer1.id,
      title: 'ERP Phase 3 Project Kickoff',
      description: 'Project kickoff meeting for Quality Control and Reporting modules implementation.',
      type: 'PROJECT_MEETING',
      status: 'CONFIRMED',
      priority: 'HIGH',
      startDateTime: new Date('2024-04-01T09:00:00Z'),
      endDateTime: new Date('2024-04-01T11:00:00Z'),
      location: 'Global Manufacturing Office - Boardroom',
      notes: 'All stakeholders confirmed. Presentation materials prepared.',
      attendees: JSON.stringify([
        {
          name: 'John Smith',
          email: 'john.smith@globalmanufacturing.com',
          role: 'Project Sponsor'
        },
        {
          name: 'Michael Manager',
          email: 'manager@acme.dev',
          role: 'Project Manager'
        },
        {
          name: 'Sarah Administrator',
          email: 'admin@acme.dev',
          role: 'Technical Lead'
        }
      ])
    }
  });

  // ==================== CREATE AUDIT LOGS ====================
  console.log('📝 Creating audit logs...');

  await prisma.auditLog.create({
    data: {
      id: 'audit_001',
      organizationId: organization1.id,
      userId: manager.id,
      action: 'CREATE',
      entityType: 'Quote',
      entityId: quote1.id,
      changes: JSON.stringify({
        created: {
          quoteNumber: 'QUO-2024-001',
          customerId: customer2.id,
          totalAmount: 5650.00,
          status: 'DRAFT'
        }
      }),
      metadata: JSON.stringify({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        ipAddress: '192.168.1.100',
        sessionId: 'sess_001'
      })
    }
  });

  await prisma.auditLog.create({
    data: {
      id: 'audit_002',
      organizationId: organization1.id,
      userId: accountant.id,
      action: 'UPDATE',
      entityType: 'Invoice',
      entityId: invoice1.id,
      changes: JSON.stringify({
        before: { status: 'SENT' },
        after: { status: 'PAID', paidDate: '2024-03-10T14:30:00Z' }
      }),
      metadata: JSON.stringify({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        ipAddress: '192.168.1.105',
        sessionId: 'sess_002'
      })
    }
  });

  console.log('✅ Database seeding completed successfully!');
  console.log('\n🔑 Development Credentials:');
  console.log('='.repeat(50));
  console.log('Super Admin: admin@acme.dev / SuperAdmin123!');
  console.log('Org Admin:   manager@acme.dev / OrgAdmin123!');
  console.log('Manager:     sales@acme.dev / Manager123!');
  console.log('Accountant:  accounting@acme.dev / Accountant123!');
  console.log('Employee:    employee@acme.dev / Employee123!');
  console.log('Viewer:      viewer@acme.dev / Viewer123!');
  console.log('');
  console.log('Tech Admin:  admin@techsolutions.dev / TechAdmin123!');
  console.log('='.repeat(50));
  console.log('\n📊 Seeded Data Summary:');
  console.log('• 2 Organizations (Acme Corp, TechSolutions)');
  console.log('• 7 Users (6 roles + multi-tenant)');
  console.log('• 3 Customers (1 individual, 2 businesses)');
  console.log('• 2 Projects (1 in progress, 1 planning)');
  console.log('• 2 Quotes (1 sent, 1 accepted)');
  console.log('• 2 Invoices (1 paid, 1 sent)');
  console.log('• 1 Payment (bank transfer)');
  console.log('• 2 Appointments (1 completed, 1 confirmed)');
  console.log('• Audit trail entries');
  console.log('\n🌐 API Testing:');
  console.log('Use these credentials to test different user roles and permissions.');
  console.log('Organization isolation is enforced - users can only access their org data.');
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });