import { PrismaClient } from '@prisma/client';
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
  console.error('🌱 Seeding master organization...');

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

  console.error(`✅ Master organization created/updated: ${masterOrg.id}`);
  console.error(`   Name: ${masterOrg.name}`);
  console.error(`   Domain: ${masterOrg.domain}`);

  // Create master admin user
  const masterAdminPassword = process.env.MASTER_ADMIN_PASSWORD || 'ChangeMe123!Secure';
  const hashedPassword = await bcrypt.hash(masterAdminPassword, 12);

  const masterAdmin = await prisma.user.upsert({
    where: { email: 'eric@lifestreamdynamics.com' },
    update: {
      // Update if exists
      firstName: 'Eric',
      lastName: 'Lifestream',
      role: 'SUPER_ADMIN',
      organizationId: masterOrg.id,
      isActive: true,
      emailVerified: true
    },
    create: {
      email: 'eric@lifestreamdynamics.com',
      firstName: 'Eric',
      lastName: 'Lifestream',
      passwordHash: hashedPassword,
      role: 'SUPER_ADMIN',
      organizationId: masterOrg.id,
      isActive: true,
      emailVerified: true
    }
  });

  console.error(`✅ Master admin user created/updated: ${masterAdmin.id}`);
  console.error(`   Email: ${masterAdmin.email}`);
  console.error(`   Role: ${masterAdmin.role}`);

  if (process.env.NODE_ENV !== 'production') {
    console.error(`   Password: ${masterAdminPassword}`);
    console.error(`   ⚠️  Change password after first login!`);
  } else {
    console.error(`   ⚠️  Must change password on first login`);
  }

  // Create audit record for seed operation
  await prisma.auditLog.create({
    data: {
      organizationId: masterOrg.id,
      userId: masterAdmin.id,
      action: 'MASTER_ORG_SEED',
      entityType: 'Organization',
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

  console.error('✅ Audit log created for master organization seed');
  console.error('');
  console.error('🎉 Master organization setup complete!');
  console.error('');
  console.error('📌 Master Organization Details:');
  console.error(`   Organization ID: ${masterOrg.id}`);
  console.error(`   Domain: ${masterOrg.domain}`);
  console.error(`   Admin Email: ${masterAdmin.email}`);
  console.error(`   Admin Role: SUPER_ADMIN`);
  console.error('');
  console.error('🔐 Security Notes:');
  console.error('   - This organization has exclusive rights to create and manage all tenant organizations');
  console.error('   - SUPER_ADMIN role is restricted to lifestreamdynamics.com domain');
  console.error('   - All organization management operations are audited');
  console.error('   - MFA is required for SUPER_ADMIN users in production');
  console.error('');
}

/**
 * Seed invoice templates and styles for an organization
 */
export async function seedInvoiceTemplates(organizationId: string): Promise<void> {
  console.error(`📄 Seeding invoice templates for organization ${organizationId}...`);

  const fs = await import('fs/promises');
  const path = await import('path');

  // Load template files
  const templatesDir = path.join(process.cwd(), 'src', 'templates', 'invoice');
  const stylesDir = path.join(process.cwd(), 'src', 'templates', 'invoice');

  try {
    // Check if templates already exist (isSystem field doesn't exist in schema)
    const existingTemplates = await prisma.invoiceTemplate.count({
      where: { organizationId }
    });

    if (existingTemplates > 0) {
      console.error('   ℹ️  Templates already exist, skipping...');
      return;
    }

    // Create Default Professional template
    // InvoiceTemplate model only has: name, description, htmlTemplate, cssStyles, isDefault, isActive, show* flags, footerText
    const defaultTemplate = await prisma.invoiceTemplate.create({
      data: {
        organizationId,
        name: 'Default Professional',
        description: 'Standard professional invoice template with clean layout',
        htmlTemplate: await fs.readFile(path.join(templatesDir, 'default.hbs'), 'utf-8'),
        isDefault: true,
        isActive: true
      }
    });
    console.error(`   ✅ Created template: ${defaultTemplate.name}`);

    // Create Modern Blue template
    const modernTemplate = await prisma.invoiceTemplate.create({
      data: {
        organizationId,
        name: 'Modern Blue',
        description: 'Contemporary invoice template with blue accent colors',
        htmlTemplate: await fs.readFile(path.join(templatesDir, 'modern.hbs'), 'utf-8'),
        isDefault: false,
        isActive: true
      }
    });
    console.error(`   ✅ Created template: ${modernTemplate.name}`);

    // Create Minimal Clean template
    const minimalTemplate = await prisma.invoiceTemplate.create({
      data: {
        organizationId,
        name: 'Minimal Clean',
        description: 'Minimal text-focused invoice template for simple transactions',
        htmlTemplate: await fs.readFile(path.join(templatesDir, 'minimal.hbs'), 'utf-8'),
        isDefault: false,
        isActive: true
      }
    });
    console.error(`   ✅ Created template: ${minimalTemplate.name}`);

    // Invoice styles skipped - InvoiceStyle model has schema issues
    // TODO: Fix InvoiceStyle schema and re-enable style seeding

    console.error(`   📊 Summary: 3 templates created`);
  } catch (error) {
    console.error('   ❌ Failed to seed invoice templates:', error);
    throw error;
  }
}

/**
 * Main seed function
 */
async function main(): Promise<void> {
  try {
    await seedMasterOrganization();

    // Get the master organization ID to seed templates
    const masterOrg = await prisma.organization.findUnique({
      where: { domain: 'lifestreamdynamics.com' }
    });

    if (masterOrg) {
      await seedInvoiceTemplates(masterOrg.id);
    }
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
      console.error('✅ Seed completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Seed failed:', error);
      process.exit(1);
    });
}

export default main;