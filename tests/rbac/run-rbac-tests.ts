#!/usr/bin/env npx ts-node

import RBACTestDataGenerator from './test-data-generator';
import RBACTestSuite from './rbac-test-suite';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Main RBAC Test Runner
 * Orchestrates complete role-based access control testing
 */
class RBACTestRunner {
  private baseURL: string;
  private generator: RBACTestDataGenerator;
  private testSuite?: RBACTestSuite;

  constructor(baseURL: string = 'http://localhost:3000') {
    this.baseURL = baseURL;
    this.generator = new RBACTestDataGenerator();
  }

  /**
   * Verify API server is running
   */
  async verifyServerConnection(): Promise<boolean> {
    try {
      const axios = (await import('axios')).default;
      const response = await axios.get(`${this.baseURL}/api/v1/health`, { timeout: 5000 });
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }

  /**
   * Run comprehensive RBAC testing
   */
  async runComprehensiveTests(): Promise<void> {
    console.log('🎯 Starting Comprehensive RBAC Testing Suite');
    console.log('=' .repeat(60));

    try {
      // Step 1: Verify server connection
      console.log('\\n🔍 Step 1: Verifying API server connection...');
      const serverOnline = await this.verifyServerConnection();
      if (!serverOnline) {
        throw new Error('API server is not responding. Please ensure the server is running on ' + this.baseURL);
      }
      console.log('✅ API server is online and responding');

      // Step 2: Generate test data
      console.log('\\n📊 Step 2: Generating comprehensive test data...');
      const testData = await this.generator.generateTestData();
      console.log('✅ Test data generation completed');

      // Step 3: Initialize test suite
      console.log('\\n🧪 Step 3: Initializing RBAC test suite...');
      this.testSuite = new RBACTestSuite(this.baseURL, testData);
      console.log('✅ Test suite initialized');

      // Step 4: Run RBAC tests
      console.log('\\n🚀 Step 4: Executing RBAC test suite...');
      const summary = await this.testSuite.runTests();

      // Step 5: Generate reports
      console.log('\\n📄 Step 5: Generating test reports...');
      await this.testSuite.exportResults(summary);

      // Step 6: Display results
      console.log('\\n📈 Step 6: Test Results Summary');
      console.log('=' .repeat(40));
      this.displayTestSummary(summary);

      // Step 7: Cleanup (optional)
      if (process.env.CLEANUP_TEST_DATA === 'true') {
        console.log('\\n🧹 Step 7: Cleaning up test data...');
        await this.generator.cleanup();
        console.log('✅ Test data cleanup completed');
      } else {
        console.log('\\n💡 Note: Test data preserved for manual inspection');
        console.log('   Set CLEANUP_TEST_DATA=true to auto-cleanup test data');
      }

      console.log('\\n🎉 RBAC Testing Suite Completed Successfully!');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('\\n❌ RBAC Testing Failed:', errorMessage);
      console.error('Full error:', error);
      process.exit(1);
    } finally {
      await prisma.$disconnect();
    }
  }

  /**
   * Display formatted test summary
   */
  private displayTestSummary(summary: any): void {
    console.log(`📊 Total Tests: ${summary.totalTests}`);
    console.log(`✅ Passed: ${summary.passed}`);
    console.log(`❌ Failed: ${summary.failed}`);
    console.log(`📈 Success Rate: ${summary.successRate.toFixed(2)}%`);

    if (summary.failed > 0) {
      console.log('\\n🔍 Role-based Results:');
      Object.entries(summary.roleResults).forEach(([role, results]: [string, any]) => {
        const successRate = results.total > 0 ? ((results.passed / results.total) * 100).toFixed(1) : '0';
        console.log(`  ${role}: ${results.passed}/${results.total} (${successRate}%)`);
      });

      console.log('\\n⚠️  Top Failed Tests:');
      summary.failedTests.slice(0, 10).forEach((test: any, index: number) => {
        console.log(`  ${index + 1}. ${test.method} ${test.endpoint} - ${test.role} (Expected: ${test.expected}, Got: ${test.actual})`);
      });

      if (summary.failedTests.length > 10) {
        console.log(`     ... and ${summary.failedTests.length - 10} more failures`);
      }
    }

    console.log('\\n📄 Detailed reports generated in tests/rbac/ directory');
  }

  /**
   * Run quick validation test (subset of full tests)
   */
  async runQuickValidation(): Promise<void> {
    console.log('⚡ Running Quick RBAC Validation');
    console.log('=' .repeat(40));

    try {
      // Create minimal test data
      console.log('📊 Generating minimal test data...');
      await this.generator.createTestOrganizations();
      await this.generator.createTestUsers();

      const testData = {
        organizations: this.generator['testData'].organizations,
        users: this.generator['testData'].users.slice(0, 7), // One user per role
        customers: [],
        invoices: [],
        quotes: [],
        payments: [],
        projects: [],
        accounts: []
      };

      // Run subset of tests
      this.testSuite = new RBACTestSuite(this.baseURL, testData);

      // Test only critical endpoints
      console.log('🧪 Testing critical authorization endpoints...');

      // Quick auth test for each role
      await this.testSuite.authenticateUsers();

      console.log('✅ Quick validation completed');
      console.log('💡 Run full test suite with: npm run test:rbac:full');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('❌ Quick validation failed:', errorMessage);
      process.exit(1);
    } finally {
      await prisma.$disconnect();
    }
  }
}

/**
 * CLI Interface
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'full';
  const baseURL = process.env.API_BASE_URL || 'http://localhost:3000';

  const runner = new RBACTestRunner(baseURL);

  switch (command) {
    case 'full':
      await runner.runComprehensiveTests();
      break;

    case 'quick':
      await runner.runQuickValidation();
      break;

    case 'help':
      console.log(`
RBAC Test Runner Usage:

  npm run test:rbac:full     # Run comprehensive RBAC test suite
  npm run test:rbac:quick    # Run quick validation test
  npm run test:rbac:help     # Show this help

Environment Variables:
  API_BASE_URL              # API server URL (default: http://localhost:3000)
  CLEANUP_TEST_DATA         # Auto-cleanup test data (default: false)

Examples:
  API_BASE_URL=http://localhost:3001 npm run test:rbac:full
  CLEANUP_TEST_DATA=true npm run test:rbac:full
      `);
      break;

    default:
      console.error(`Unknown command: ${command}`);
      console.log('Use "npm run test:rbac:help" for usage information');
      process.exit(1);
  }
}

// Execute if running directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export default RBACTestRunner;