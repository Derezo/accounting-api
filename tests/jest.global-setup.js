// Global setup that runs before all tests and before any modules are imported
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

module.exports = async () => {
  // Set environment variables before any modules are loaded
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'file:./test.db';
  process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-32-chars';
  process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-key-for-testing-32-chars';
  process.env.ENCRYPTION_KEY = 'test-encryption-key-32-characters';
  process.env.API_KEY_SALT = 'test-api-key-salt-for-testing';

  // Set other test configuration variables
  process.env.JWT_EXPIRES_IN = '15m';
  process.env.JWT_REFRESH_EXPIRES_IN = '7d';
  process.env.API_VERSION = 'v1';
  process.env.PORT = '3001';

  // Disable external services for tests
  process.env.STRIPE_SECRET_KEY = 'sk_test_dummy_key_for_testing';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_dummy_secret';
  process.env.EMAIL_PROVIDER = 'test';
  process.env.LOG_LEVEL = 'error';

  // Rate limiting (more permissive for tests)
  process.env.RATE_LIMIT_WINDOW_MS = '900000';
  process.env.RATE_LIMIT_MAX_REQUESTS = '1000';

  // Ensure test database is created and schema is pushed
  const testDbPath = path.join(__dirname, '..', 'prisma', 'test.db');

  // Remove old test database if it exists
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
  if (fs.existsSync(testDbPath + '-journal')) {
    fs.unlinkSync(testDbPath + '-journal');
  }

  // Push schema to test database
  try {
    execSync('npx prisma db push --skip-generate --accept-data-loss', {
      stdio: 'ignore',
      env: { ...process.env, DATABASE_URL: 'file:./test.db', NODE_ENV: 'test' }
    });
    console.log('Test database schema created successfully');

    // Seed reference data after schema is created
    const { seedReferenceData } = require('./seedReferenceData');
    await seedReferenceData();
  } catch (error) {
    console.error('Failed to create test database schema:', error);
    throw error;
  }
};