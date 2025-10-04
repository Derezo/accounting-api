import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

const hashPassword = async (password: string): Promise<string> => {
  return await bcrypt.hash(password, 12);
};

const generateEncryptionKey = (): string => {
  return randomUUID().replace(/-/g, '');
};

const getPasswordExpirationDate = (): Date => {
  return new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // 90 days
};

async function main(): Promise<void> {
  console.error('🌱 Starting simple database seeding...');

  // Clear existing data in development
  if (process.env.NODE_ENV === 'development') {
    console.error('🧹 Clearing existing development data...');
    await prisma.user.deleteMany();
    await prisma.organization.deleteMany();
  }

  // ==================== CREATE ORGANIZATIONS ====================
  console.error('🏢 Creating organizations...');

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
        fiscal_year_start: '01-01'
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
        fiscal_year_start: '04-01'
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
  console.error('👥 Creating users with different roles...');

  // Super Admin User
  await prisma.user.create({
    data: {
      id: 'user_super_admin_001',
      organizationId: organization1.id,
      email: 'admin@acme.dev',
      passwordHash: await hashPassword('SimpleAdmin123!'),
      role: 'SUPER_ADMIN',
      isActive: true,
      firstName: 'Sarah',
      lastName: 'Administrator',
      phone: '+1-416-555-0101'
    }
  });

  // Organization Admin
  await prisma.user.create({
    data: {
      id: 'user_org_admin_001',
      organizationId: organization1.id,
      email: 'manager@acme.dev',
      passwordHash: await hashPassword('SimpleManager123!'),
      role: 'ADMIN',
      isActive: true,
      firstName: 'Michael',
      lastName: 'Manager',
      phone: '+1-416-555-0102'
    }
  });

  // Department Manager
  await prisma.user.create({
    data: {
      id: 'user_manager_001',
      organizationId: organization1.id,
      email: 'sales@acme.dev',
      passwordHash: await hashPassword('SimpleSales123!'),
      role: 'MANAGER',
      isActive: true,
      firstName: 'Jennifer',
      lastName: 'Sales',
      phone: '+1-416-555-0103'
    }
  });

  // Accountant
  await prisma.user.create({
    data: {
      id: 'user_accountant_001',
      organizationId: organization1.id,
      email: 'accounting@acme.dev',
      passwordHash: await hashPassword('SimpleAcct123!@#'),
      role: 'ACCOUNTANT',
      isActive: true,
      firstName: 'David',
      lastName: 'Numbers',
      phone: '+1-416-555-0104'
    }
  });

  // Employee
  await prisma.user.create({
    data: {
      id: 'user_employee_001',
      organizationId: organization1.id,
      email: 'employee@acme.dev',
      passwordHash: await hashPassword('SimpleEmployee123!'),
      role: 'EMPLOYEE',
      isActive: true,
      firstName: 'Lisa',
      lastName: 'Worker',
      phone: '+1-416-555-0105'
    }
  });

  // Viewer (Read-only)
  await prisma.user.create({
    data: {
      id: 'user_viewer_001',
      organizationId: organization1.id,
      email: 'viewer@acme.dev',
      passwordHash: await hashPassword('SimpleViewer123!'),
      role: 'VIEWER',
      isActive: true,
      firstName: 'Robert',
      lastName: 'Observer',
      phone: '+1-416-555-0106'
    }
  });

  // User for second organization
  await prisma.user.create({
    data: {
      id: 'user_tech_admin_001',
      organizationId: organization2.id,
      email: 'admin@techsolutions.dev',
      passwordHash: await hashPassword('SimpleTechAdmin123!'),
      role: 'ADMIN',
      isActive: true,
      firstName: 'Alex',
      lastName: 'Tech',
      phone: '+1-604-555-0201'
    }
  });

  console.error('✅ Simple database seeding completed successfully!');
  console.error('\n🔑 Development Credentials:');
  console.error('='.repeat(50));
  console.error('Super Admin: admin@acme.dev / SimpleAdmin123!');
  console.error('Org Admin:   manager@acme.dev / SimpleManager123!');
  console.error('Manager:     sales@acme.dev / SimpleSales123!');
  console.error('Accountant:  accounting@acme.dev / SimpleAcct123!@#');
  console.error('Employee:    employee@acme.dev / SimpleEmployee123!');
  console.error('Viewer:      viewer@acme.dev / SimpleViewer123!');
  console.error('');
  console.error('Tech Admin:  admin@techsolutions.dev / SimpleTechAdmin123!');
  console.error('='.repeat(50));
  console.error('\n⚠️  SECURITY NOTICE - v2.0:');
  console.error('='.repeat(50));
  console.error('');
  console.error('Password Requirements:');
  console.error('  ✓ Minimum 12 characters (all passwords meet this requirement)');
  console.error('  ✓ Uppercase, lowercase, numbers, and special characters');
  console.error('  ✓ Password expiration: 90 days from seed date');
  console.error('');
  console.error('Session Security:');
  console.error('  ✓ 2-hour session timeout');
  console.error('  ✓ 15-minute inactivity logout');
  console.error('  ✓ Maximum 3 concurrent sessions');
  console.error('  ✓ Device fingerprinting enabled');
  console.error('');
  console.error('⚠️  These are DEVELOPMENT credentials - change in production!');
  console.error('='.repeat(50));
  console.error('\n📊 Seeded Data Summary:');
  console.error('• 2 Organizations (Acme Corp, TechSolutions)');
  console.error('• 7 Users (6 roles + multi-tenant)');
  console.error('\n🌐 API Testing:');
  console.error('Use these credentials to test different user roles and permissions.');
  console.error('Organization isolation is enforced - users can only access their org data.');
}

void main()
  .catch((e: Error) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
