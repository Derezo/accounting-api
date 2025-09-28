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

async function main() {
  console.log('🌱 Starting simple database seeding...');

  // Clear existing data in development
  if (process.env.NODE_ENV === 'development') {
    console.log('🧹 Clearing existing development data...');
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
  console.log('👥 Creating users with different roles...');

  // Super Admin User
  await prisma.user.create({
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
  await prisma.user.create({
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
  await prisma.user.create({
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
  await prisma.user.create({
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
  await prisma.user.create({
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
  await prisma.user.create({
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

  // User for second organization
  await prisma.user.create({
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

  console.log('✅ Simple database seeding completed successfully!');
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