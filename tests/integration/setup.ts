import { PrismaClient } from '@prisma/client';
import { beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { Server } from 'http';
import request from 'supertest';
import app from '../../src/app';
import { cleanupDatabase } from './test-utils';

// Global test instances
export let prisma: PrismaClient;
export let server: Server;
export let testApp: any;

// Test configuration
const TEST_PORT = process.env.TEST_PORT || 3001;

beforeAll(async () => {
  console.log('🚀 Starting integration test setup...');

  // Initialize Prisma client with test database
  prisma = new PrismaClient({
    datasources: {
      db: {
        url: process.env.TEST_DATABASE_URL || 'file:./test.db'
      }
    }
  });

  await prisma.$connect();

  // Start test server
  testApp = app;
  server = testApp.listen(TEST_PORT, () => {
    console.log(`📡 Test server running on port ${TEST_PORT}`);
  });

  // Wait for server to be ready
  await new Promise<void>((resolve) => {
    server.on('listening', resolve);
  });

  console.log('✅ Integration test setup complete');
});

afterAll(async () => {
  console.log('🛑 Shutting down integration test environment...');

  // Close server
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  // Disconnect Prisma
  if (prisma) {
    await prisma.$disconnect();
  }

  console.log('✅ Integration test shutdown complete');
});

beforeEach(async () => {
  // Clean database before each test to ensure isolation
  await cleanupDatabase(prisma);
});

afterEach(async () => {
  // Additional cleanup if needed
  // This helps catch any test pollution issues
});

// Helper function to create authenticated request
export function authenticatedRequest(token: string) {
  return request(testApp).set('Authorization', `Bearer ${token}`);
}

// Helper function to get base request
export function baseRequest() {
  return request(testApp);
}

export { prisma as testPrisma, testApp };