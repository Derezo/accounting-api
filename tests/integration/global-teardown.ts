import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

const prisma = new PrismaClient();

export default async function globalTeardown() {
  console.log('🧹 Cleaning up integration test environment...');

  try {
    // Disconnect Prisma client
    await prisma.$disconnect();

    // Remove test database file
    const testDatabaseUrl = process.env.TEST_DATABASE_URL || 'file:./test.db';
    const dbPath = testDatabaseUrl.replace('file:', '');

    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
      console.log('📁 Removed test database');
    }

    // Remove any temporary files created during tests
    const tempFiles = [
      './test.db-shm',
      './test.db-wal'
    ];

    tempFiles.forEach(file => {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    });

    console.log('✅ Integration test environment cleanup complete');
  } catch (error) {
    console.error('❌ Failed to cleanup integration test environment:', error);
  }
}