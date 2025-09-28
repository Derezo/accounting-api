import { PrismaClient } from '@prisma/client';
import { beforeAll, afterAll, beforeEach } from '@jest/globals';
import { cleanupDatabase } from './testUtils';

const prisma = new PrismaClient();

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  // Use robust cleanup function that properly handles FK constraints
  await cleanupDatabase();
});

export { prisma };