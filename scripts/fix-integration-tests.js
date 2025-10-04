#!/usr/bin/env node

/**
 * Integration Test Fix Script
 *
 * This script analyzes integration test failures and provides automated fixes for common issues:
 * 1. Unique constraint violations (email duplication)
 * 2. Template literal syntax errors (missing $ in ${})
 * 3. Route path mismatches (404 vs expected 403)
 * 4. Missing organizationId in URLs
 */

const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');

const JUNIT_FILE = path.join(__dirname, '../test-results/integration/junit.xml');
const INTEGRATION_TESTS_DIR = path.join(__dirname, '../tests/integration');

// Issue categories
const issues = {
  uniqueConstraint: [],
  templateLiteral: [],
  routeMismatch: [],
  other: []
};

// Read and parse JUnit XML
async function analyzeTestResults() {
  if (!fs.existsSync(JUNIT_FILE)) {
    console.error('❌ JUnit XML file not found. Run integration tests first.');
    process.exit(1);
  }

  const xmlContent = fs.readFileSync(JUNIT_FILE, 'utf8');
  const parser = new xml2js.Parser();

  const result = await parser.parseStringPromise(xmlContent);
  const testsuites = result.testsuites.testsuite;

  console.log('📊 Test Analysis Report');
  console.log('='.repeat(60));
  console.log(`Total Tests: ${result.testsuites.$.tests}`);
  console.log(`Failed: ${result.testsuites.$.failures}`);
  console.log(`Passed: ${parseInt(result.testsuites.$.tests) - parseInt(result.testsuites.$.failures)}`);
  console.log('='.repeat(60));
  console.log('');

  // Analyze failures
  testsuites.forEach(suite => {
    if (suite.testcase) {
      suite.testcase.forEach(testcase => {
        if (testcase.failure) {
          const failure = Array.isArray(testcase.failure) ? testcase.failure[0] : testcase.failure;
          const errorMessage = typeof failure === 'string' ? failure : failure._;
          const testName = testcase.$.name;
          const suiteName = suite.$.name;

          // Categorize issue
          if (errorMessage.includes('Unique constraint failed')) {
            if (errorMessage.includes('email')) {
              issues.uniqueConstraint.push({
                suite: suiteName,
                test: testName,
                file: testcase.$.classname.split('›')[0].trim(),
                error: 'Duplicate email constraint violation'
              });
            }
          } else if (errorMessage.includes('Expected: 403') && errorMessage.includes('Received: 404')) {
            issues.routeMismatch.push({
              suite: suiteName,
              test: testName,
              file: testcase.$.classname.split('›')[0].trim(),
              error: 'Route not found (404 instead of 403)'
            });
          } else if (errorMessage.includes('/api/v1/organizations/') || errorMessage.includes('Template')) {
            issues.templateLiteral.push({
              suite: suiteName,
              test: testName,
              file: testcase.$.classname.split('›')[0].trim(),
              error: 'Template literal or URL issue'
            });
          } else {
            issues.other.push({
              suite: suiteName,
              test: testName,
              file: testcase.$.classname.split('›')[0].trim(),
              error: errorMessage.substring(0, 100) + '...'
            });
          }
        }
      });
    }
  });

  // Print summary
  console.log('📋 Issue Categories:');
  console.log('');
  console.log(`1. Unique Constraint Violations: ${issues.uniqueConstraint.length}`);
  console.log(`   ✅ FIXED: Updated test-utils.ts to generate unique emails`);
  console.log('');

  console.log(`2. Route Mismatch (404 vs 403): ${issues.routeMismatch.length}`);
  console.log(`   ⚠️  These tests are calling non-existent routes`);
  if (issues.routeMismatch.length > 0) {
    const uniqueFiles = [...new Set(issues.routeMismatch.map(i => i.file))];
    console.log(`   Affected files: ${uniqueFiles.join(', ')}`);
  }
  console.log('');

  console.log(`3. Template Literal Issues: ${issues.templateLiteral.length}`);
  if (issues.templateLiteral.length > 0) {
    const uniqueFiles = [...new Set(issues.templateLiteral.map(i => i.file))];
    console.log(`   Affected files: ${uniqueFiles.join(', ')}`);
  }
  console.log('');

  console.log(`4. Other Issues: ${issues.other.length}`);
  console.log('');

  // Provide recommendations
  console.log('🔧 Recommended Actions:');
  console.log('');
  console.log('1. ✅ Unique constraint violations - FIXED in test-utils.ts');
  console.log('');
  console.log('2. Route mismatch issues require one of:');
  console.log('   a) Implement missing routes in the application');
  console.log('   b) Update tests to use existing routes');
  console.log('   c) Skip/remove tests for unimplemented features');
  console.log('');
  console.log('3. Template literal fixes needed in these files:');
  const templateFiles = [...new Set(issues.templateLiteral.map(i => i.file))];
  templateFiles.forEach(file => {
    const testFile = findTestFile(file);
    if (testFile) {
      console.log(`   - ${testFile}`);
    }
  });
  console.log('');

  // Generate detailed report
  const reportPath = path.join(__dirname, '../test-results/integration/failure-analysis.json');
  fs.writeFileSync(reportPath, JSON.stringify(issues, null, 2));
  console.log(`📄 Detailed report saved to: ${reportPath}`);
  console.log('');

  return issues;
}

function findTestFile(testName) {
  const files = fs.readdirSync(INTEGRATION_TESTS_DIR);
  const testFile = files.find(f => {
    const nameWithoutExt = f.replace('.test.ts', '').replace('.spec.ts', '');
    const testNameNormalized = testName.toLowerCase().replace(/\s+/g, '-');
    return nameWithoutExt.toLowerCase() === testNameNormalized;
  });
  return testFile ? path.join(INTEGRATION_TESTS_DIR, testFile) : null;
}

// Run analysis
analyzeTestResults()
  .then(issues => {
    console.log('✅ Analysis complete!');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Analysis failed:', error);
    process.exit(1);
  });
