#!/usr/bin/env ts-node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { TestDataGenerator, TestData } from './test-data-generator';
import { RBACTestSuite, TestSummary } from './rbac-test-suite';
import { WorkflowRBACTestSuite, WorkflowTestResult, BusinessProcessTestResult } from './workflow-rbac-test-suite';
import { AdvancedBoundaryTestSuite, BoundaryTestResult, AdvancedTestSummary } from './advanced-boundary-testing';

interface TestRunnerOptions {
  testType: 'endpoint' | 'workflow' | 'boundary' | 'all';
  organizationCount?: number;
  baseUrl?: string;
  generateData?: boolean;
  exportResults?: boolean;
  verbose?: boolean;
}

class EnhancedRBACTestRunner {
  private testData: TestData | null = null;
  private generator = new TestDataGenerator();

  async run(options: TestRunnerOptions): Promise<void> {
    console.log(chalk.bold.blue('\n🚀 Enhanced RBAC Test Runner'));
    console.log(chalk.gray('Testing role-based access control with business workflow validation\n'));

    const baseUrl = options.baseUrl || 'http://localhost:3000';

    // Step 1: Generate or load test data
    if (options.generateData !== false) {
      await this.generateTestData(options.organizationCount || 3);
    } else {
      console.log(chalk.yellow('⚠️  Using existing test data (if available)'));
    }

    if (!this.testData) {
      console.log(chalk.red('❌ No test data available. Please run with --generate-data'));
      return;
    }

    // Step 2: Run selected tests
    let endpointResults: TestSummary | null = null;
    let workflowResults: { workflowResults: WorkflowTestResult[]; businessProcessResults: BusinessProcessTestResult[] } | null = null;
    let boundaryResults: AdvancedTestSummary | null = null;

    if (options.testType === 'endpoint' || options.testType === 'all') {
      endpointResults = await this.runEndpointTests(baseUrl, this.testData, options.verbose);
    }

    if (options.testType === 'workflow' || options.testType === 'all') {
      workflowResults = await this.runWorkflowTests(baseUrl, this.testData, options.verbose);
    }

    if (options.testType === 'boundary' || options.testType === 'all') {
      boundaryResults = await this.runBoundaryTests(baseUrl, this.testData, options.verbose);
    }

    // Step 3: Display results summary
    this.displayResultsSummary(endpointResults, workflowResults, boundaryResults, options.testType);

    // Step 4: Export results if requested
    if (options.exportResults !== false) {
      await this.exportResults(endpointResults, workflowResults, boundaryResults);
    }

    // Step 5: Display final status
    this.displayFinalStatus(endpointResults, workflowResults, boundaryResults, options.testType);
  }

  private async generateTestData(organizationCount: number): Promise<void> {
    const spinner = ora('Generating comprehensive test data...').start();

    try {
      this.testData = await this.generator.generateComprehensiveTestData(organizationCount);

      spinner.succeed(chalk.green(`✅ Generated test data:`));
      console.log(`   📊 Organizations: ${this.testData.organizations.length}`);
      console.log(`   👥 Users: ${this.testData.users.length} (${this.testData.users.length / organizationCount} per org)`);
      console.log(`   👤 Customers: ${this.testData.customers.length}`);
      console.log(`   📋 Quotes: ${this.testData.quotes.length}`);
      console.log(`   📄 Invoices: ${this.testData.invoices.length}`);
      console.log(`   💰 Payments: ${this.testData.payments.length}`);
      console.log(`   📊 Projects: ${this.testData.projects.length}\n`);

    } catch (error) {
      spinner.fail(chalk.red(`❌ Failed to generate test data: ${error}`));
      throw error;
    }
  }

  private async runEndpointTests(
    baseUrl: string,
    testData: TestData,
    verbose: boolean = false
  ): Promise<TestSummary> {
    console.log(chalk.bold.cyan('\n🔍 Running Endpoint-Based RBAC Tests'));
    console.log(chalk.gray('Testing individual API endpoint permissions...\n'));

    const spinner = ora('Initializing endpoint test suite...').start();

    try {
      const testSuite = new RBACTestSuite(baseUrl, testData);
      spinner.text = 'Running endpoint permission tests...';

      const results = await testSuite.runTests();

      spinner.succeed(chalk.green(`✅ Endpoint tests completed:`));
      console.log(`   📊 Total Tests: ${results.totalTests}`);
      console.log(`   ✅ Passed: ${chalk.green(results.passed)}`);
      console.log(`   ❌ Failed: ${chalk.red(results.failed)}`);
      console.log(`   📈 Success Rate: ${results.successRate.toFixed(1)}%`);

      if (verbose && results.failed > 0) {
        console.log(chalk.yellow('\n⚠️  Failed Tests:'));
        results.failedTests.slice(0, 5).forEach(test => {
          console.log(`   ${test.role}: ${test.method} ${test.endpoint} - Expected: ${test.expected}, Got: ${test.actual}`);
        });
        if (results.failedTests.length > 5) {
          console.log(`   ... and ${results.failedTests.length - 5} more`);
        }
      }

      // Export endpoint results
      await testSuite.exportResults(results);

      return results;

    } catch (error) {
      spinner.fail(chalk.red(`❌ Endpoint tests failed: ${error}`));
      throw error;
    }
  }

  private async runWorkflowTests(
    baseUrl: string,
    testData: TestData,
    verbose: boolean = false
  ): Promise<{ workflowResults: WorkflowTestResult[]; businessProcessResults: BusinessProcessTestResult[] }> {
    console.log(chalk.bold.cyan('\n🔄 Running Workflow-Based RBAC Tests'));
    console.log(chalk.gray('Testing business process workflows and role transitions...\n'));

    const spinner = ora('Initializing workflow test suite...').start();

    try {
      const workflowSuite = new WorkflowRBACTestSuite(baseUrl, testData);
      spinner.text = 'Running workflow permission tests...';

      const results = await workflowSuite.runWorkflowTests();

      spinner.succeed(chalk.green(`✅ Workflow tests completed:`));
      console.log(`   🔄 Workflows: ${results.summary.passedWorkflows}/${results.summary.totalWorkflows} passed`);
      console.log(`   🔒 Business Processes: ${results.summary.passedBusinessProcesses}/${results.summary.totalBusinessProcesses} passed`);
      console.log(`   📈 Overall Success: ${results.summary.overallSuccess ? '✅' : '❌'}`);

      if (verbose) {
        // Show workflow details
        console.log(chalk.yellow('\n📋 Workflow Details:'));
        results.workflowResults.forEach(workflow => {
          const status = workflow.passed ? chalk.green('✅') : chalk.red('❌');
          console.log(`   ${status} ${workflow.workflowName}: ${workflow.completedStages}/${workflow.totalStages} stages`);

          if (!workflow.passed && workflow.failedAt) {
            console.log(`      Failed at: ${chalk.red(workflow.failedAt)}`);
          }
        });

        // Show failed business processes
        const failedProcesses = results.businessProcessResults.filter(bp => !bp.passed);
        if (failedProcesses.length > 0) {
          console.log(chalk.yellow('\n⚠️  Failed Business Processes:'));
          failedProcesses.slice(0, 5).forEach(bp => {
            console.log(`   ${bp.role}: ${bp.processName} - Expected: ${bp.expected}, Got: ${bp.actual}`);
            console.log(`      Reason: ${chalk.gray(bp.businessReason)}`);
          });
          if (failedProcesses.length > 5) {
            console.log(`   ... and ${failedProcesses.length - 5} more`);
          }
        }
      }

      // Export workflow results
      await workflowSuite.exportWorkflowResults(results.workflowResults, results.businessProcessResults);

      return results;

    } catch (error) {
      spinner.fail(chalk.red(`❌ Workflow tests failed: ${error}`));
      throw error;
    }
  }

  private async runBoundaryTests(
    baseUrl: string,
    testData: TestData,
    verbose: boolean = false
  ): Promise<AdvancedTestSummary> {
    console.log(chalk.bold.cyan('\n🛡️ Running Advanced Boundary Tests'));
    console.log(chalk.gray('Testing security vulnerabilities and edge cases...\n'));

    const spinner = ora('Initializing advanced boundary test suite...').start();

    try {
      const boundaryTestSuite = new AdvancedBoundaryTestSuite(baseUrl, testData);
      spinner.text = 'Running advanced boundary tests...';

      const results = await boundaryTestSuite.runAdvancedBoundaryTests();

      spinner.succeed(chalk.green(`✅ Boundary tests completed:`));
      console.log(`   📊 Total Tests: ${results.totalTests}`);
      console.log(`   ✅ Passed: ${chalk.green(results.passed)}`);
      console.log(`   ❌ Failed: ${chalk.red(results.failed)}`);
      console.log(`   📈 Success Rate: ${results.successRate.toFixed(1)}%`);
      console.log(`   🚨 Critical Failures: ${chalk.red(results.criticalFailures.length)}`);
      console.log(`   ⚠️  High Risk Failures: ${chalk.yellow(results.highRiskFailures.length)}`);

      if (verbose) {
        // Show category breakdown
        console.log(chalk.yellow('\n📋 Test Categories:'));
        Object.entries(results.categories).forEach(([category, stats]) => {
          const rate = stats.total > 0 ? ((stats.passed / stats.total) * 100).toFixed(1) : '0';
          const status = stats.passed === stats.total ? chalk.green('✅') : chalk.red('❌');
          console.log(`   ${status} ${category}: ${rate}% (${stats.passed}/${stats.total})`);
        });

        // Show security level breakdown
        console.log(chalk.yellow('\n🔒 Security Levels:'));
        Object.entries(results.securityLevels).forEach(([level, stats]) => {
          const rate = stats.total > 0 ? ((stats.passed / stats.total) * 100).toFixed(1) : '0';
          const status = stats.passed === stats.total ? chalk.green('✅') : chalk.red('❌');
          const color = level === 'critical' ? chalk.red : level === 'high' ? chalk.yellow : chalk.white;
          console.log(`   ${status} ${color(level.toUpperCase())}: ${rate}% (${stats.passed}/${stats.total})`);
        });

        // Show critical failures
        if (results.criticalFailures.length > 0) {
          console.log(chalk.red('\n🚨 CRITICAL FAILURES:'));
          results.criticalFailures.forEach(failure => {
            console.log(`   ${chalk.red('❌')} ${failure.testName}: ${failure.description}`);
            if (failure.impact) {
              console.log(`      Impact: ${chalk.gray(failure.impact)}`);
            }
          });
        }
      }

      // Export boundary results
      await boundaryTestSuite.exportAdvancedResults(results);

      return results;

    } catch (error) {
      spinner.fail(chalk.red(`❌ Boundary tests failed: ${error}`));
      throw error;
    }
  }

  private displayResultsSummary(
    endpointResults: TestSummary | null,
    workflowResults: { workflowResults: WorkflowTestResult[]; businessProcessResults: BusinessProcessTestResult[] } | null,
    boundaryResults: AdvancedTestSummary | null,
    testType: string
  ): void {
    console.log(chalk.bold.blue('\n📊 Test Results Summary'));
    console.log('─'.repeat(50));

    if (endpointResults) {
      console.log(chalk.cyan('🔍 Endpoint Tests:'));
      console.log(`   Success Rate: ${endpointResults.successRate.toFixed(1)}% (${endpointResults.passed}/${endpointResults.totalTests})`);

      // Role breakdown
      Object.entries(endpointResults.roleResults).forEach(([role, results]) => {
        const rate = results.total > 0 ? ((results.passed / results.total) * 100).toFixed(1) : '0';
        const status = results.passed === results.total ? '✅' : '❌';
        console.log(`   ${status} ${role}: ${rate}% (${results.passed}/${results.total})`);
      });
    }

    if (workflowResults) {
      console.log(chalk.cyan('\n🔄 Workflow Tests:'));
      const wfSummary = {
        totalWorkflows: workflowResults.workflowResults.length,
        passedWorkflows: workflowResults.workflowResults.filter(w => w.passed).length,
        totalBusinessProcesses: workflowResults.businessProcessResults.length,
        passedBusinessProcesses: workflowResults.businessProcessResults.filter(bp => bp.passed).length
      };

      const workflowRate = wfSummary.totalWorkflows > 0 ?
        ((wfSummary.passedWorkflows / wfSummary.totalWorkflows) * 100).toFixed(1) : '0';
      const businessRate = wfSummary.totalBusinessProcesses > 0 ?
        ((wfSummary.passedBusinessProcesses / wfSummary.totalBusinessProcesses) * 100).toFixed(1) : '0';

      console.log(`   Workflow Success: ${workflowRate}% (${wfSummary.passedWorkflows}/${wfSummary.totalWorkflows})`);
      console.log(`   Business Process Success: ${businessRate}% (${wfSummary.passedBusinessProcesses}/${wfSummary.totalBusinessProcesses})`);
    }

    if (boundaryResults) {
      console.log(chalk.cyan('\n🛡️  Boundary Tests:'));
      console.log(`   Success Rate: ${boundaryResults.successRate.toFixed(1)}% (${boundaryResults.passed}/${boundaryResults.totalTests})`);
      console.log(`   🚨 Critical Failures: ${chalk.red(boundaryResults.criticalFailures.length)}`);
      console.log(`   ⚠️  High Risk Failures: ${chalk.yellow(boundaryResults.highRiskFailures.length)}`);
    }
  }

  private async exportResults(
    endpointResults: TestSummary | null,
    workflowResults: { workflowResults: WorkflowTestResult[]; businessProcessResults: BusinessProcessTestResult[] } | null,
    boundaryResults: AdvancedTestSummary | null
  ): Promise<void> {
    const spinner = ora('Exporting test results...').start();

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

      // Create combined summary
      const combinedSummary = {
        timestamp,
        endpoint: endpointResults ? {
          totalTests: endpointResults.totalTests,
          passed: endpointResults.passed,
          failed: endpointResults.failed,
          successRate: endpointResults.successRate
        } : null,
        workflow: workflowResults ? {
          totalWorkflows: workflowResults.workflowResults.length,
          passedWorkflows: workflowResults.workflowResults.filter(w => w.passed).length,
          totalBusinessProcesses: workflowResults.businessProcessResults.length,
          passedBusinessProcesses: workflowResults.businessProcessResults.filter(bp => bp.passed).length
        } : null,
        boundary: boundaryResults ? {
          totalTests: boundaryResults.totalTests,
          passed: boundaryResults.passed,
          failed: boundaryResults.failed,
          successRate: boundaryResults.successRate,
          criticalFailures: boundaryResults.criticalFailures.length,
          highRiskFailures: boundaryResults.highRiskFailures.length
        } : null
      };

      const fs = await import('fs/promises');
      await fs.writeFile(
        `/home/eric/Projects/accounting-api/tests/rbac/enhanced-rbac-summary-${timestamp}.json`,
        JSON.stringify(combinedSummary, null, 2)
      );

      spinner.succeed(chalk.green(`✅ Results exported: enhanced-rbac-summary-${timestamp}.json`));

    } catch (error) {
      spinner.fail(chalk.red(`❌ Failed to export results: ${error}`));
    }
  }

  private displayFinalStatus(
    endpointResults: TestSummary | null,
    workflowResults: { workflowResults: WorkflowTestResult[]; businessProcessResults: BusinessProcessTestResult[] } | null,
    boundaryResults: AdvancedTestSummary | null,
    testType: string
  ): void {
    console.log('\n' + '='.repeat(60));

    let overallSuccess = true;

    if (endpointResults) {
      overallSuccess = overallSuccess && endpointResults.successRate === 100;
    }

    if (workflowResults) {
      const allWorkflowsPassed = workflowResults.workflowResults.every(w => w.passed);
      const allBusinessProcessesPassed = workflowResults.businessProcessResults.every(bp => bp.passed);
      overallSuccess = overallSuccess && allWorkflowsPassed && allBusinessProcessesPassed;
    }

    if (boundaryResults) {
      overallSuccess = overallSuccess && (boundaryResults.successRate === 100);
    }

    if (overallSuccess) {
      console.log(chalk.bold.green('🎉 ALL RBAC TESTS PASSED! 🎉'));
      console.log(chalk.green('✅ Role-based access control is working correctly'));
      console.log(chalk.green('✅ Business workflows respect role permissions'));
      console.log(chalk.green('✅ Security boundaries are properly enforced'));
      console.log(chalk.green('✅ Advanced boundary conditions handled correctly'));
    } else {
      console.log(chalk.bold.red('❌ SOME RBAC TESTS FAILED'));
      console.log(chalk.red('⚠️  Role-based access control needs attention'));

      // Show specific failure areas
      if (boundaryResults && (boundaryResults.criticalFailures.length > 0 || boundaryResults.highRiskFailures.length > 0)) {
        console.log(chalk.red(`🚨 Critical security issues found: ${boundaryResults.criticalFailures.length}`));
        console.log(chalk.yellow(`⚠️  High risk issues found: ${boundaryResults.highRiskFailures.length}`));
      }

      console.log(chalk.yellow('📋 Check the detailed reports for specific issues'));
    }

    console.log('='.repeat(60));
  }
}

// CLI Setup
const program = new Command();

program
  .name('enhanced-rbac-runner')
  .description('Enhanced RBAC test runner with workflow-based testing')
  .version('1.0.0');

program
  .command('test')
  .description('Run RBAC tests')
  .option('-t, --test-type <type>', 'Type of test to run: endpoint, workflow, boundary, or all', 'all')
  .option('-o, --organizations <count>', 'Number of test organizations to create', '3')
  .option('-u, --base-url <url>', 'Base URL for the API', 'http://localhost:3000')
  .option('--no-generate-data', 'Skip test data generation')
  .option('--no-export-results', 'Skip exporting results to files')
  .option('-v, --verbose', 'Enable verbose output')
  .action(async (options) => {
    try {
      const runner = new EnhancedRBACTestRunner();
      await runner.run({
        testType: options.testType,
        organizationCount: parseInt(options.organizations),
        baseUrl: options.baseUrl,
        generateData: options.generateData,
        exportResults: options.exportResults,
        verbose: options.verbose
      });

      process.exit(0);
    } catch (error) {
      console.error(chalk.red(`\n❌ Test run failed: ${error}`));
      process.exit(1);
    }
  });

program
  .command('endpoint')
  .description('Run only endpoint-based RBAC tests')
  .option('-o, --organizations <count>', 'Number of test organizations to create', '3')
  .option('-u, --base-url <url>', 'Base URL for the API', 'http://localhost:3000')
  .option('-v, --verbose', 'Enable verbose output')
  .action(async (options) => {
    try {
      const runner = new EnhancedRBACTestRunner();
      await runner.run({
        testType: 'endpoint',
        organizationCount: parseInt(options.organizations),
        baseUrl: options.baseUrl,
        verbose: options.verbose
      });

      process.exit(0);
    } catch (error) {
      console.error(chalk.red(`\n❌ Endpoint tests failed: ${error}`));
      process.exit(1);
    }
  });

program
  .command('workflow')
  .description('Run only workflow-based RBAC tests')
  .option('-o, --organizations <count>', 'Number of test organizations to create', '3')
  .option('-u, --base-url <url>', 'Base URL for the API', 'http://localhost:3000')
  .option('-v, --verbose', 'Enable verbose output')
  .action(async (options) => {
    try {
      const runner = new EnhancedRBACTestRunner();
      await runner.run({
        testType: 'workflow',
        organizationCount: parseInt(options.organizations),
        baseUrl: options.baseUrl,
        verbose: options.verbose
      });

      process.exit(0);
    } catch (error) {
      console.error(chalk.red(`\n❌ Workflow tests failed: ${error}`));
      process.exit(1);
    }
  });

program
  .command('boundary')
  .description('Run only advanced boundary RBAC tests')
  .option('-o, --organizations <count>', 'Number of test organizations to create', '3')
  .option('-u, --base-url <url>', 'Base URL for the API', 'http://localhost:3000')
  .option('-v, --verbose', 'Enable verbose output')
  .action(async (options) => {
    try {
      const runner = new EnhancedRBACTestRunner();
      await runner.run({
        testType: 'boundary',
        organizationCount: parseInt(options.organizations),
        baseUrl: options.baseUrl,
        verbose: options.verbose
      });

      process.exit(0);
    } catch (error) {
      console.error(chalk.red(`\n❌ Boundary tests failed: ${error}`));
      process.exit(1);
    }
  });

program
  .command('help')
  .description('Show detailed help and usage examples')
  .action(() => {
    console.log(chalk.bold.blue('\n🚀 Enhanced RBAC Test Runner - Help\n'));

    console.log(chalk.yellow('USAGE EXAMPLES:'));
    console.log('  npm run test:rbac:enhanced test              # Run all tests');
    console.log('  npm run test:rbac:enhanced endpoint          # Run endpoint tests only');
    console.log('  npm run test:rbac:enhanced workflow          # Run workflow tests only');
    console.log('  npm run test:rbac:enhanced boundary          # Run boundary tests only');
    console.log('  npm run test:rbac:enhanced test -t all -v    # Run all tests with verbose output');

    console.log(chalk.yellow('\nTEST TYPES:'));
    console.log('  endpoint  - Test individual API endpoint permissions');
    console.log('  workflow  - Test business process workflows and role transitions');
    console.log('  boundary  - Test security vulnerabilities and edge cases');
    console.log('  all       - Run all test types (default)');

    console.log(chalk.yellow('\nOUTPUT:'));
    console.log('  - Console output with progress and results');
    console.log('  - JSON files with detailed test results');
    console.log('  - HTML reports with visual test summaries');

    console.log(chalk.yellow('\nWHAT GETS TESTED:'));
    console.log('  ✅ 8-stage customer lifecycle workflow');
    console.log('  ✅ Role-specific business process restrictions');
    console.log('  ✅ Cross-role workflow validation');
    console.log('  ✅ Client access restrictions');
    console.log('  ✅ Business rule enforcement');
    console.log('  ✅ 143 API endpoint permissions');
    console.log('  ✅ Cross-organization data isolation');
    console.log('  🛡️  Security vulnerability testing');
    console.log('  🔍 Edge case and boundary condition testing');
    console.log('  ⚡ Performance under load testing');
    console.log('  🔄 Concurrent access scenarios');
  });

// Handle unknown commands
program.on('command:*', () => {
  console.error(chalk.red('Invalid command. Use "help" to see available commands.'));
  process.exit(1);
});

// Parse CLI arguments
if (process.argv.length < 3) {
  program.help();
} else {
  program.parse(process.argv);
}

export { EnhancedRBACTestRunner };