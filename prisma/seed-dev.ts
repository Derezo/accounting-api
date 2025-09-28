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
  console.log('🌱 Adding development seed data...');

  // Check existing data
  const existingOrgs = await prisma.organization.count();
  const existingUsers = await prisma.user.count();

  console.log(`📊 Current data: ${existingOrgs} organizations, ${existingUsers} users`);

  // ==================== CREATE ORGANIZATIONS ====================
  console.log('🏢 Creating additional organizations...');

  // Check if Acme Corp already exists
  let acmeOrg = await prisma.organization.findFirst({
    where: { domain: 'acme.dev' }
  });

  if (!acmeOrg) {
    acmeOrg = await prisma.organization.create({
      data: {
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
    console.log('✅ Created Acme Corporation');
  } else {
    console.log('ℹ️  Acme Corporation already exists');
  }

  // Check if TechSolutions already exists
  let techOrg = await prisma.organization.findFirst({
    where: { domain: 'techsolutions.dev' }
  });

  if (!techOrg) {
    techOrg = await prisma.organization.create({
      data: {
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
    console.log('✅ Created TechSolutions Inc');
  } else {
    console.log('ℹ️  TechSolutions Inc already exists');
  }

  // ==================== CREATE USERS WITH DIFFERENT ROLES ====================
  console.log('👥 Creating users with different roles...');

  const users = [
    {
      email: 'admin@acme.dev',
      password: 'SuperAdmin123!',
      role: 'SUPER_ADMIN',
      firstName: 'Sarah',
      lastName: 'Administrator',
      org: acmeOrg
    },
    {
      email: 'manager@acme.dev',
      password: 'OrgAdmin123!',
      role: 'ADMIN',
      firstName: 'Michael',
      lastName: 'Manager',
      org: acmeOrg
    },
    {
      email: 'sales@acme.dev',
      password: 'Manager123!',
      role: 'MANAGER',
      firstName: 'Jennifer',
      lastName: 'Sales',
      org: acmeOrg
    },
    {
      email: 'accounting@acme.dev',
      password: 'Accountant123!',
      role: 'ACCOUNTANT',
      firstName: 'David',
      lastName: 'Numbers',
      org: acmeOrg
    },
    {
      email: 'employee@acme.dev',
      password: 'Employee123!',
      role: 'EMPLOYEE',
      firstName: 'Lisa',
      lastName: 'Worker',
      org: acmeOrg
    },
    {
      email: 'viewer@acme.dev',
      password: 'Viewer123!',
      role: 'VIEWER',
      firstName: 'Robert',
      lastName: 'Observer',
      org: acmeOrg
    },
    {
      email: 'admin@techsolutions.dev',
      password: 'TechAdmin123!',
      role: 'ADMIN',
      firstName: 'Alex',
      lastName: 'Tech',
      org: techOrg
    }
  ];

  for (const userData of users) {
    const existingUser = await prisma.user.findUnique({
      where: { email: userData.email }
    });

    if (!existingUser) {
      await prisma.user.create({
        data: {
          organizationId: userData.org.id,
          email: userData.email,
          passwordHash: await hashPassword(userData.password),
          role: userData.role,
          isActive: true,
          emailVerified: true,
          firstName: userData.firstName,
          lastName: userData.lastName,
          phone: '+1-416-555-010' + Math.floor(Math.random() * 10)
        }
      });
      console.log(`✅ Created user: ${userData.email}`);
    } else {
      console.log(`ℹ️  User already exists: ${userData.email}`);
    }
  }

  // Final count
  const finalOrgs = await prisma.organization.count();
  const finalUsers = await prisma.user.count();

  console.log('\n✅ Development seed data completed successfully!');
  console.log('\n🔑 Development Credentials:');
  console.log('='.repeat(60));
  console.log('Super Admin: admin@acme.dev / SuperAdmin123!');
  console.log('Org Admin:   manager@acme.dev / OrgAdmin123!');
  console.log('Manager:     sales@acme.dev / Manager123!');
  console.log('Accountant:  accounting@acme.dev / Accountant123!');
  console.log('Employee:    employee@acme.dev / Employee123!');
  console.log('Viewer:      viewer@acme.dev / Viewer123!');
  console.log('');
  console.log('Tech Admin:  admin@techsolutions.dev / TechAdmin123!');
  console.log('='.repeat(60));
  console.log('\n📊 Final Data Summary:');
  console.log(`• ${finalOrgs} Organizations`);
  console.log(`• ${finalUsers} Users`);
  console.log('\n🌐 API Testing:');
  console.log('Use these credentials to test different user roles and permissions.');
  console.log('Organization isolation is enforced - users can only access their org data.');
  console.log('\n🔗 Test the API:');
  console.log('• Health Check: curl http://localhost:3000/health');
  console.log('• API Health: curl http://localhost:3000/api/v1/health');
  console.log('• Login: POST http://localhost:3000/api/v1/auth/login');
  console.log('• Documentation: http://127.0.0.1:8080 (if docs server running)');
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });