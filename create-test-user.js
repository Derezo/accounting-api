const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function createTestUser() {
  try {
    // Create a test organization
    const organization = await prisma.organization.create({
      data: {
        name: "Test Organization",
        legalName: "Test Organization Ltd.",
        type: "SINGLE_BUSINESS",
        email: "admin@test.com",
        phone: "+1-555-0123",
        encryptionKey: "test-encryption-key-12345",
        isActive: true
      }
    });

    console.log('✅ Created organization:', organization.name);

    // Hash the password
    const hashedPassword = await bcrypt.hash('admin123', 10);

    // Create a test user
    const user = await prisma.user.create({
      data: {
        organizationId: organization.id,
        email: "admin@test.com",
        passwordHash: hashedPassword,
        role: "SUPER_ADMIN",
        firstName: "Admin",
        lastName: "User",
        isActive: true,
        emailVerified: true
      }
    });

    console.log('✅ Created user:', user.email);
    console.log('\n🔑 Login credentials:');
    console.log('Email: admin@test.com');
    console.log('Password: admin123');
    console.log('\n🚀 You can now test the login API!');

  } catch (error) {
    console.error('❌ Error creating test user:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createTestUser();