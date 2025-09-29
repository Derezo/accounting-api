import { beforeAll, afterAll, beforeEach } from '@jest/globals';
import { cleanupDatabase } from './testUtils';
import { prisma } from '../src/config/database';

beforeAll(async () => {
  // Environment variables are now set in src/config/database.ts
  await prisma.$connect();
});

afterAll(async () => {
  try {
    await prisma.$disconnect();
  } catch (error) {
    // Ignore disconnect errors in tests
    console.warn('Warning: Prisma disconnect error in tests:', error);
  }
});

beforeEach(async () => {
  // Use robust cleanup function that properly handles FK constraints
  await cleanupDatabase();
});

export { prisma };