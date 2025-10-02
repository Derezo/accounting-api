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
 * Seed invoice templates and styles for an organization
 */
export async function seedInvoiceTemplates(organizationId: string): Promise<void> {
  console.log(`📄 Seeding invoice templates for organization ${organizationId}...`);

  const fs = await import('fs/promises');
  const path = await import('path');

  // Load template files
  const templatesDir = path.join(process.cwd(), 'src', 'templates', 'invoice');
  const stylesDir = path.join(process.cwd(), 'src', 'templates', 'invoice');

  try {
    // Check if templates already exist
    const existingTemplates = await prisma.invoiceTemplate.count({
      where: { organizationId, isSystem: true }
    });

    if (existingTemplates > 0) {
      console.log('   ℹ️  System templates already exist, skipping...');
      return;
    }

    // Create Default Professional template
    const defaultTemplate = await prisma.invoiceTemplate.create({
      data: {
        organizationId,
        name: 'Default Professional',
        description: 'Standard professional invoice template with clean layout',
        templateType: 'STANDARD',
        htmlTemplate: await fs.readFile(path.join(templatesDir, 'default.hbs'), 'utf-8'),
        isDefault: true,
        isSystem: true,
        version: '1.0',
        tags: JSON.stringify(['professional', 'standard', 'default'])
      }
    });
    console.log(`   ✅ Created template: ${defaultTemplate.name}`);

    // Create Modern Blue template
    const modernTemplate = await prisma.invoiceTemplate.create({
      data: {
        organizationId,
        name: 'Modern Blue',
        description: 'Contemporary invoice template with blue accent colors',
        templateType: 'MODERN',
        htmlTemplate: await fs.readFile(path.join(templatesDir, 'modern.hbs'), 'utf-8'),
        isDefault: false,
        isSystem: true,
        version: '1.0',
        tags: JSON.stringify(['modern', 'contemporary', 'blue'])
      }
    });
    console.log(`   ✅ Created template: ${modernTemplate.name}`);

    // Create Minimal Clean template
    const minimalTemplate = await prisma.invoiceTemplate.create({
      data: {
        organizationId,
        name: 'Minimal Clean',
        description: 'Minimal text-focused invoice template for simple transactions',
        templateType: 'MINIMAL',
        htmlTemplate: await fs.readFile(path.join(templatesDir, 'minimal.hbs'), 'utf-8'),
        isDefault: false,
        isSystem: true,
        version: '1.0',
        tags: JSON.stringify(['minimal', 'simple', 'clean'])
      }
    });
    console.log(`   ✅ Created template: ${minimalTemplate.name}`);

    // Create Classic Black & White style
    const classicStyle = await prisma.invoiceStyle.create({
      data: {
        organizationId,
        templateId: defaultTemplate.id,
        name: 'Classic Black & White',
        description: 'Professional monochrome design with high contrast',
        cssContent: await fs.readFile(path.join(stylesDir, 'classic.css'), 'utf-8'),
        colorScheme: JSON.stringify({
          primary: '#000000',
          secondary: '#666666',
          accent: '#333333',
          background: '#ffffff',
          text: '#000000'
        }),
        fontFamily: 'Times New Roman, serif',
        isDefault: true,
        isSystem: true,
        version: '1.0',
        tags: JSON.stringify(['classic', 'professional', 'monochrome'])
      }
    });
    console.log(`   ✅ Created style: ${classicStyle.name}`);

    // Create Modern Blue style
    const modernStyle = await prisma.invoiceStyle.create({
      data: {
        organizationId,
        templateId: modernTemplate.id,
        name: 'Modern Blue',
        description: 'Contemporary blue theme with gradient effects',
        cssContent: await fs.readFile(path.join(stylesDir, 'modern-blue.css'), 'utf-8'),
        colorScheme: JSON.stringify({
          primary: '#2563eb',
          secondary: '#64748b',
          accent: '#3b82f6',
          background: '#f8fafc',
          text: '#1e293b'
        }),
        fontFamily: 'Inter, Arial, sans-serif',
        isDefault: false,
        isSystem: true,
        version: '1.0',
        tags: JSON.stringify(['modern', 'blue', 'gradient'])
      }
    });
    console.log(`   ✅ Created style: ${modernStyle.name}`);

    // Create Corporate Gray style
    const corporateStyle = await prisma.invoiceStyle.create({
      data: {
        organizationId,
        templateId: defaultTemplate.id,
        name: 'Corporate Gray',
        description: 'Professional gray palette for conservative businesses',
        cssContent: await fs.readFile(path.join(stylesDir, 'corporate-gray.css'), 'utf-8'),
        colorScheme: JSON.stringify({
          primary: '#374151',
          secondary: '#6b7280',
          accent: '#4b5563',
          background: '#f9fafb',
          text: '#111827'
        }),
        fontFamily: 'Arial, Helvetica, sans-serif',
        isDefault: false,
        isSystem: true,
        version: '1.0',
        tags: JSON.stringify(['corporate', 'professional', 'gray'])
      }
    });
    console.log(`   ✅ Created style: ${corporateStyle.name}`);

    console.log(`   📊 Summary: 3 templates and 3 styles created`);
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
      console.log('✅ Seed completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Seed failed:', error);
      process.exit(1);
    });
}

export default main;