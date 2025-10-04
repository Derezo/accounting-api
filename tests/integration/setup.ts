import { PrismaClient } from '@prisma/client';
import { beforeAll, afterAll, beforeEach } from '@jest/globals';
import { Application } from 'express';
import supertest from 'supertest';
import jwt from 'jsonwebtoken';
import { cleanupDatabase } from './test-utils';

// Global test instances
export let prisma: PrismaClient;
export let testApp: Application;

beforeAll(async () => {
  try {
    console.log('🚀 Starting integration test setup...');

    // Ensure NODE_ENV is set to test
    process.env.NODE_ENV = 'test';
    console.log('📝 NODE_ENV:', process.env.NODE_ENV);

    // Initialize Prisma client with test database
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.TEST_DATABASE_URL || 'file:./test.db'
        }
      },
      log: [] // Disable logging to reduce memory usage
    });

    console.log('🔗 Connecting to database...');
    await prisma.$connect();
    console.log('✅ Database connected');

    // Dynamically import app to ensure it's loaded after environment setup
    console.log('📦 Loading Express application...');
    const appModule = await import('../../src/app');
    console.log('📦 App module loaded, default export type:', typeof appModule.default);
    testApp = appModule.default;

    if (!testApp) {
      console.error('❌ testApp is undefined after import');
      throw new Error('Failed to load Express application');
    }

    console.log('✅ testApp assigned successfully, type:', typeof testApp);
    console.log('✅ Integration test setup complete');
  } catch (error) {
    console.error('❌ SETUP FAILED:', error);
    if (error instanceof Error) {
      console.error('Error stack:', error.stack);
    }
    throw error;
  }
});

afterAll(async () => {
  console.log('🛑 Shutting down integration test environment...');

  // Shutdown encryption audit service
  try {
    const { encryptionAuditService } = await import('../../src/services/encryption-audit.service');
    if (encryptionAuditService) {
      await encryptionAuditService.shutdown();
      console.log('✅ Encryption audit service shut down');
    }
  } catch (error) {
    // Service may not be initialized in all tests
    console.log('ℹ️  Encryption audit service not initialized');
  }

  // Disconnect Prisma
  if (prisma) {
    try {
      await prisma.$disconnect();
      console.log('✅ Database disconnected');
    } catch (error) {
      console.error('Error disconnecting database:', error);
    }
  }

  console.log('✅ Integration test shutdown complete');
});

// DISABLED: Global cleanup was causing issues with tests that manage their own data
// Tests that need cleanup should call cleanupDatabase() explicitly in their own beforeEach
// beforeEach(async () => {
//   // Clean database before each test to ensure isolation
//   try {
//     await cleanupDatabase(prisma);
//   } catch (error) {
//     console.error('Error cleaning database:', error);
//     throw error;
//   }
// });

// Helper function to create authenticated request
// Note: Returns the supertest agent, caller must specify HTTP method (.get(), .post(), etc.)
export function authenticatedRequest(token: string) {
  if (!testApp) {
    throw new Error('testApp is not initialized. Make sure beforeAll has completed.');
  }
  const agent = supertest(testApp);
  // Return a wrapper that adds auth header to any request
  return {
    get: (url: string) => agent.get(url).set('Authorization', `Bearer ${token}`),
    post: (url: string) => agent.post(url).set('Authorization', `Bearer ${token}`),
    put: (url: string) => agent.put(url).set('Authorization', `Bearer ${token}`),
    patch: (url: string) => agent.patch(url).set('Authorization', `Bearer ${token}`),
    delete: (url: string) => agent.delete(url).set('Authorization', `Bearer ${token}`)
  };
}

// Helper function to get base request
export function baseRequest() {
  if (!testApp) {
    throw new Error('testApp is not initialized. Make sure beforeAll has completed.');
  }
  return supertest(testApp);
}

// Setup function for tests that need explicit setup
export async function setupTestApp(): Promise<{ app: Application; prisma: PrismaClient }> {
  if (!testApp || !prisma) {
    throw new Error('Test environment not initialized. This should be called after global beforeAll.');
  }
  return { app: testApp, prisma };
}

// Cleanup function (actual cleanup is handled by global afterAll)
export async function cleanupTestApp(): Promise<void> {
  // Cleanup is handled by global afterAll hook
  // This function exists for compatibility with test files that expect it
  return Promise.resolve();
}

// Create test JWT token - creates a special test token that bypasses DB lookup
export function createTestToken(payload: { organizationId: string; role: string; userId?: string }): string {
  const secret = process.env.JWT_SECRET || 'test-secret-key-for-integration-tests';

  // Use provided userId or generate a test-specific one
  const userId = payload.userId || `test-user-${payload.organizationId}-${payload.role}`;

  return jwt.sign(
    {
      organizationId: payload.organizationId,
      role: payload.role,
      userId: userId,
      sessionId: 'test-session-id',
      type: 'access',
      isTestToken: true // Flag to indicate this is a test token
    },
    secret,
    { expiresIn: '1h' }
  );
}

// Create a real token with database user (for tests that need actual DB records)
export async function createRealTestToken(payload: {
  organizationId: string;
  role: string;
  userId?: string
}): Promise<string> {
  const secret = process.env.JWT_SECRET || 'test-secret-key-for-integration-tests';

  let userId = payload.userId;

  // If no userId provided, create a test user for this organization
  if (!userId) {
    // Check if organization exists, create if not
    let organization = await prisma.organization.findUnique({
      where: { id: payload.organizationId }
    });

    if (!organization) {
      organization = await prisma.organization.create({
        data: {
          name: `Test Org ${payload.organizationId.substring(0, 8)}`,
          type: 'SINGLE_BUSINESS',
          domain: `test-${Date.now()}.com`,
          email: `test-${Date.now()}@test.com`,
          phone: '+1-555-0100',
          encryptionKey: 'test-encryption-key',
          isActive: true
        }
      });

      // Update payload to use the generated organization ID
      payload.organizationId = organization.id;
    }

    // Create or find test user for this organization
    const testEmail = `test-${payload.role.toLowerCase()}-${payload.organizationId}@test.com`;
    let user = await prisma.user.findFirst({
      where: {
        email: testEmail,
        organizationId: payload.organizationId
      }
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: testEmail,
          firstName: 'Test',
          lastName: payload.role,
          passwordHash: 'hashed-test-password',
          role: payload.role,
          organizationId: payload.organizationId,
          isActive: true
        }
      });
    }

    userId = user.id;
  }

  return jwt.sign(
    {
      organizationId: payload.organizationId,
      role: payload.role,
      userId: userId,
      sessionId: 'test-session-id',
      type: 'access'
    },
    secret,
    { expiresIn: '1h' }
  );
}

export { prisma as testPrisma };