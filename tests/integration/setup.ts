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
  console.log('🚀 Starting integration test setup...');

  // Ensure NODE_ENV is set to test
  process.env.NODE_ENV = 'test';

  // Initialize Prisma client with test database
  prisma = new PrismaClient({
    datasources: {
      db: {
        url: process.env.TEST_DATABASE_URL || 'file:./test.db'
      }
    },
    log: [] // Disable logging to reduce memory usage
  });

  await prisma.$connect();
  console.log('✅ Database connected');

  // Dynamically import app to ensure it's loaded after environment setup
  const appModule = await import('../../src/app');
  testApp = appModule.default;

  if (!testApp) {
    throw new Error('Failed to load Express application');
  }

  console.log('✅ Integration test setup complete');
});

afterAll(async () => {
  console.log('🛑 Shutting down integration test environment...');

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

beforeEach(async () => {
  // Clean database before each test to ensure isolation
  try {
    await cleanupDatabase(prisma);
  } catch (error) {
    console.error('Error cleaning database:', error);
    throw error;
  }
});

// Helper function to create authenticated request
export function authenticatedRequest(token: string) {
  if (!testApp) {
    throw new Error('testApp is not initialized. Make sure beforeAll has completed.');
  }
  return supertest(testApp).set('Authorization', `Bearer ${token}`);
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
          isActive: true,
          emailVerified: true
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