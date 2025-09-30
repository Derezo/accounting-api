import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

/**
 * Generate a secure encryption key for organization-specific encryption
 */
function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Seed the master organization for Lifestream Dynamics
 * This organization has exclusive privileges to create and manage all tenant organizations
 */
export async function seedMasterOrganization(): Promise<void> {
  console.log('🌱 Seeding master organization...');

  // Create master organization
  const masterOrg = await prisma.organization.upsert({
    where: { domain: 'lifestreamdynamics.com' },
    update: {
      // Update if exists to ensure consistency
      name: 'Lifestream Dynamics',
      legalName: 'Lifestream Dynamics Inc.',
      type: 'PLATFORM_MASTER',
      isActive: true,
      email: 'support@lifestreamdynamics.com',
      phone: '+1-555-DYNAMICS',
      website: 'https://lifestreamdynamics.com',
      settings: JSON.stringify({
        timezone: 'America/Toronto',
        currency: 'CAD',
        dateFormat: 'YYYY-MM-DD',
        fiscalYearEnd: '12-31',
        features: {
          organizationManagement: true,
          systemAnalytics: true,
          advancedSecurity: true,
          unlimitedStorage: true,
          prioritySupport: true
        },
        branding: {
          primaryColor: '#0066cc',
          logoUrl: 'https://lifestreamdynamics.com/logo.png',
          companyName: 'Lifestream Dynamics'
        },
        security: {
          enforceStrongPasswords: true,
          sessionTimeout: 15,
          requireMfa: true,
          ipWhitelist: []
        },
        notifications: {
          email: true,
          sms: false,
          inApp: true,
          webhooks: true
        }
      })
    },
    create: {
      name: 'Lifestream Dynamics',
      domain: 'lifestreamdynamics.com',
      legalName: 'Lifestream Dynamics Inc.',
      type: 'PLATFORM_MASTER',
      isActive: true,
      email: 'support@lifestreamdynamics.com',
      phone: '+1-555-DYNAMICS',
      website: 'https://lifestreamdynamics.com',
      businessNumber: null,
      taxNumber: null,
      encryptionKey: generateEncryptionKey(),
      settings: JSON.stringify({
        timezone: 'America/Toronto',
        currency: 'CAD',
        dateFormat: 'YYYY-MM-DD',
        fiscalYearEnd: '12-31',
        features: {
          organizationManagement: true,
          systemAnalytics: true,
          advancedSecurity: true,
          unlimitedStorage: true,
          prioritySupport: true
        },
        branding: {
          primaryColor: '#0066cc',
          logoUrl: 'https://lifestreamdynamics.com/logo.png',
          companyName: 'Lifestream Dynamics'
        },
        security: {
          enforceStrongPasswords: true,
          sessionTimeout: 15,
          requireMfa: true,
          ipWhitelist: []
        },
        notifications: {
          email: true,
          sms: false,
          inApp: true,
          webhooks: true
        }
      })
    }
  });

  console.log(`✅ Master organization created/updated: ${masterOrg.id}`);
  console.log(`   Name: ${masterOrg.name}`);
  console.log(`   Domain: ${masterOrg.domain}`);

  // Create master admin user
  const masterAdminPassword = process.env.MASTER_ADMIN_PASSWORD || 'ChangeMe123!Secure';
  const hashedPassword = await bcrypt.hash(masterAdminPassword, 12);

  const masterAdmin = await prisma.user.upsert({
    where: { email: 'eric@lifestreamdynamics.com' },
    update: {
      // Update if exists
      name: 'Eric',
      role: UserRole.SUPER_ADMIN,
      organizationId: masterOrg.id,
      isActive: true,
      emailVerified: true,
      mustChangePassword: process.env.NODE_ENV === 'production' ? true : false
    },
    create: {
      email: 'eric@lifestreamdynamics.com',
      name: 'Eric',
      password: hashedPassword,
      role: UserRole.SUPER_ADMIN,
      organizationId: masterOrg.id,
      isActive: true,
      emailVerified: true,
      mustChangePassword: process.env.NODE_ENV === 'production' ? true : false,
      createdBy: 'SYSTEM_SEED'
    }
  });

  console.log(`✅ Master admin user created/updated: ${masterAdmin.id}`);
  console.log(`   Email: ${masterAdmin.email}`);
  console.log(`   Role: ${masterAdmin.role}`);

  if (process.env.NODE_ENV !== 'production') {
    console.log(`   Password: ${masterAdminPassword}`);
    console.log(`   ⚠️  Change password after first login!`);
  } else {
    console.log(`   ⚠️  Must change password on first login`);
  }

  // Create audit record for seed operation
  await prisma.auditLog.create({
    data: {
      organizationId: masterOrg.id,
      userId: masterAdmin.id,
      action: 'MASTER_ORG_SEED',
      entity: 'Organization',
      entityId: masterOrg.id,
      changes: JSON.stringify({
        operation: 'SEED_MASTER_ORGANIZATION',
        masterOrgId: masterOrg.id,
        masterAdminId: masterAdmin.id,
        timestamp: new Date().toISOString()
      }),
      ipAddress: '127.0.0.1',
      userAgent: 'System Seed Script'
    }
  });

  console.log('✅ Audit log created for master organization seed');
  console.log('');
  console.log('🎉 Master organization setup complete!');
  console.log('');
  console.log('📌 Master Organization Details:');
  console.log(`   Organization ID: ${masterOrg.id}`);
  console.log(`   Domain: ${masterOrg.domain}`);
  console.log(`   Admin Email: ${masterAdmin.email}`);
  console.log(`   Admin Role: SUPER_ADMIN`);
  console.log('');
  console.log('🔐 Security Notes:');
  console.log('   - This organization has exclusive rights to create and manage all tenant organizations');
  console.log('   - SUPER_ADMIN role is restricted to lifestreamdynamics.com domain');
  console.log('   - All organization management operations are audited');
  console.log('   - MFA is required for SUPER_ADMIN users in production');
  console.log('');
}

/**
 * Main seed function
 */
async function main(): Promise<void> {
  try {
    await seedMasterOrganization();
  } catch (error) {
    console.error('❌ Error seeding master organization:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run if executed directly
if (require.main === module) {
  main()
    .then(() => {
      console.log('✅ Seed completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Seed failed:', error);
      process.exit(1);
    });
}

export default main;