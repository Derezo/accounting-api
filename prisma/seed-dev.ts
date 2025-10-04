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
  console.error('🌱 Adding development seed data...');

  // Check existing data
  const existingOrgs = await prisma.organization.count();
  const existingUsers = await prisma.user.count();

  console.error(`📊 Current data: ${existingOrgs} organizations, ${existingUsers} users`);

  // ==================== CREATE ORGANIZATIONS ====================
  console.error('🏢 Creating additional organizations...');

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
    console.error('✅ Created Acme Corporation');
  } else {
    console.error('ℹ️  Acme Corporation already exists');
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
    console.error('✅ Created TechSolutions Inc');
  } else {
    console.error('ℹ️  TechSolutions Inc already exists');
  }

  // ==================== CREATE USERS WITH DIFFERENT ROLES ====================
  console.error('👥 Creating users with different roles...');

  const users = [
    {
      email: 'admin@acme.dev',
      password: 'DevAdmin123!',
      role: 'SUPER_ADMIN',
      firstName: 'Sarah',
      lastName: 'Administrator',
      org: acmeOrg
    },
    {
      email: 'manager@acme.dev',
      password: 'DevManager123!',
      role: 'ADMIN',
      firstName: 'Michael',
      lastName: 'Manager',
      org: acmeOrg
    },
    {
      email: 'sales@acme.dev',
      password: 'DevSales123!',
      role: 'MANAGER',
      firstName: 'Jennifer',
      lastName: 'Sales',
      org: acmeOrg
    },
    {
      email: 'accounting@acme.dev',
      password: 'DevAcct123!@#',
      role: 'ACCOUNTANT',
      firstName: 'David',
      lastName: 'Numbers',
      org: acmeOrg
    },
    {
      email: 'employee@acme.dev',
      password: 'DevEmployee123!',
      role: 'EMPLOYEE',
      firstName: 'Lisa',
      lastName: 'Worker',
      org: acmeOrg
    },
    {
      email: 'viewer@acme.dev',
      password: 'DevViewer123!',
      role: 'VIEWER',
      firstName: 'Robert',
      lastName: 'Observer',
      org: acmeOrg
    },
    {
      email: 'admin@techsolutions.dev',
      password: 'DevTechAdmin123!',
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
      console.error(`✅ Created user: ${userData.email}`);
    } else {
      console.error(`ℹ️  User already exists: ${userData.email}`);
    }
  }

  // Final count
  const finalOrgs = await prisma.organization.count();
  const finalUsers = await prisma.user.count();

  console.error('\n✅ Development seed data completed successfully!');
  console.error('\n🔑 Development Credentials:');
  console.error('='.repeat(60));
  console.error('Super Admin: admin@acme.dev / DevAdmin123!');
  console.error('Org Admin:   manager@acme.dev / DevManager123!');
  console.error('Manager:     sales@acme.dev / DevSales123!');
  console.error('Accountant:  accounting@acme.dev / DevAcct123!@#');
  console.error('Employee:    employee@acme.dev / DevEmployee123!');
  console.error('Viewer:      viewer@acme.dev / DevViewer123!');
  console.error('');
  console.error('Tech Admin:  admin@techsolutions.dev / DevTechAdmin123!');
  console.error('='.repeat(60));
  console.error('\n⚠️  SECURITY NOTICE - v2.0:');
  console.error('='.repeat(60));
  console.error('');
  console.error('Password Requirements:');
  console.error('  ✓ Minimum 12 characters');
  console.error('  ✓ Uppercase, lowercase, numbers, and special characters');
  console.error('  ✓ Expires after 90 days');
  console.error('');
  console.error('Session Security:');
  console.error('  ✓ 2-hour session expiration');
  console.error('  ✓ 15-minute inactivity timeout');
  console.error('  ✓ Maximum 3 concurrent sessions per user');
  console.error('  ✓ Device fingerprinting enabled');
  console.error('='.repeat(60));
  console.error('\n📊 Final Data Summary:');
  console.error(`• ${finalOrgs} Organizations`);
  console.error(`• ${finalUsers} Users`);
  console.error('\n🌐 API Testing:');
  console.error('Use these credentials to test different user roles and permissions.');
  console.error('Organization isolation is enforced - users can only access their org data.');
  console.error('\n🔗 Test the API:');
  console.error('• Health Check: curl http://localhost:3000/health');
  console.error('• API Health: curl http://localhost:3000/api/v1/health');
  console.error('• Login: POST http://localhost:3000/api/v1/auth/login');
  console.error('• Documentation: http://127.0.0.1:8080 (if docs server running)');
}

void main()
  .catch((e: Error) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
