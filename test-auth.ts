import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

interface TestResult {
  email: string;
  role: string;
  passwordTest: boolean;
  exists: boolean;
  organization?: string;
}

async function testAuthentication() {
  console.log('🔐 Testing Development Credentials\n');
  console.log('='.repeat(60));

  const testCredentials = [
    { email: 'admin@acme.dev', password: 'SuperAdmin123!', expectedRole: 'SUPER_ADMIN' },
    { email: 'manager@acme.dev', password: 'OrgAdmin123!', expectedRole: 'ADMIN' },
    { email: 'sales@acme.dev', password: 'Manager123!', expectedRole: 'MANAGER' },
    { email: 'accounting@acme.dev', password: 'Accountant123!', expectedRole: 'ACCOUNTANT' },
    { email: 'employee@acme.dev', password: 'Employee123!', expectedRole: 'EMPLOYEE' },
    { email: 'viewer@acme.dev', password: 'Viewer123!', expectedRole: 'VIEWER' },
    { email: 'admin@techsolutions.dev', password: 'TechAdmin123!', expectedRole: 'ADMIN' }
  ];

  const results: TestResult[] = [];

  for (const cred of testCredentials) {
    try {
      const user = await prisma.user.findUnique({
        where: { email: cred.email },
        include: {
          organization: {
            select: {
              name: true,
              domain: true
            }
          }
        }
      });

      if (user) {
        const passwordMatch = await bcrypt.compare(cred.password, user.passwordHash);

        results.push({
          email: cred.email,
          role: user.role,
          passwordTest: passwordMatch,
          exists: true,
          organization: user.organization?.name
        });

        const status = passwordMatch ? '✅' : '❌';
        const roleMatch = user.role === cred.expectedRole ? '✅' : '❌';

        console.log(`${status} ${cred.email}`);
        console.log(`   Password: ${passwordMatch ? 'VALID' : 'INVALID'}`);
        console.log(`   Role: ${user.role} ${roleMatch}`);
        console.log(`   Organization: ${user.organization?.name}`);
        console.log(`   Active: ${user.isActive ? 'Yes' : 'No'}`);
        console.log(`   Email Verified: ${user.emailVerified ? 'Yes' : 'No'}`);
        console.log('');
      } else {
        results.push({
          email: cred.email,
          role: 'NOT_FOUND',
          passwordTest: false,
          exists: false
        });

        console.log(`❌ ${cred.email}`);
        console.log(`   Status: USER NOT FOUND`);
        console.log('');
      }
    } catch (error) {
      console.log(`💥 ${cred.email}`);
      console.log(`   Error: ${error}`);
      console.log('');
    }
  }

  // Summary
  console.log('='.repeat(60));
  console.log('📊 SUMMARY');
  console.log('='.repeat(60));

  const validCredentials = results.filter(r => r.exists && r.passwordTest);
  const invalidCredentials = results.filter(r => !r.exists || !r.passwordTest);

  console.log(`✅ Valid Credentials: ${validCredentials.length}/${results.length}`);
  console.log(`❌ Invalid Credentials: ${invalidCredentials.length}/${results.length}`);

  if (invalidCredentials.length > 0) {
    console.log('\n❌ Failed Credentials:');
    invalidCredentials.forEach(cred => {
      console.log(`   - ${cred.email}: ${!cred.exists ? 'Not Found' : 'Wrong Password'}`);
    });
  }

  // Organization breakdown
  const orgBreakdown: { [org: string]: number } = {};
  validCredentials.forEach(cred => {
    const org = cred.organization || 'Unknown';
    orgBreakdown[org] = (orgBreakdown[org] || 0) + 1;
  });

  console.log('\n🏢 Users by Organization:');
  Object.entries(orgBreakdown).forEach(([org, count]) => {
    console.log(`   - ${org}: ${count} users`);
  });

  console.log('\n🎯 Seed Script Status:');
  if (validCredentials.length === results.length) {
    console.log('✅ All development credentials are working correctly!');
    console.log('   The seed script executed successfully.');
    console.log('   All user accounts are ready for API testing.');
  } else {
    console.log('⚠️  Some credentials failed validation.');
    console.log('   You may need to re-run the seed script.');
  }

  await prisma.$disconnect();
}

testAuthentication()
  .catch((e) => {
    console.error('❌ Error during authentication test:', e);
    process.exit(1);
  });