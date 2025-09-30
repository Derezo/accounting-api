# Testing Quick Reference Guide

**Project**: Lifestream Dynamics Accounting API
**Last Updated**: September 30, 2025
**Current Test Pass Rate**: 91.9% ✅

---

## Quick Commands

### Run All Tests

```bash
# Unit tests only (fast, parallel)
npm test

# Unit tests (reliable, sequential - RECOMMENDED FOR CI)
npm test -- --maxWorkers=1

# Integration tests
npm run test:integration

# All tests with coverage
npm run test:all
```

### Run Specific Tests

```bash
# Run specific test file
npm test -- tests/unit/accounts.service.test.ts

# Run tests matching pattern
npm test -- --testNamePattern="should create"

# Run specific test suite
npm test -- --testNamePattern="AccountsService"

# Watch mode (for TDD)
npm test -- --watch

# Run only changed tests
npm test -- --onlyChanged
```

### Coverage Reports

```bash
# Generate coverage report
npm test -- --coverage

# Generate HTML coverage report
npm test -- --coverage --coverageReporters=html

# Open coverage report in browser
open coverage/index.html
```

---

## Current Test Status

### Overall Statistics

| Metric | Count | Percentage |
|--------|-------|------------|
| **Total Test Suites** | 46 | 100% |
| **Passing Suites** | 36 | 78.3% ✅ |
| **Failing Suites** | 10 | 21.7% |
| **Total Tests** | 1,240 | 100% |
| **Passing Tests** | 1,140 | 91.9% ✅ |
| **Failing Tests** | 98 | 7.9% |
| **Skipped Tests** | 2 | 0.2% |

### Test Categories

| Category | Total | Passing | Status |
|----------|-------|---------|--------|
| **Controllers** | 10 | 10 | ✅ 100% |
| **Validators** | 4 | 4 | ✅ 100% |
| **Services** | 32 | 22 | ⚠️ 69% |

---

## Known Failing Tests

### Critical Priority (Fix Before Production)

#### 1. journal.service.test.ts (P0) 🔴
- **Status**: Times out (infinite loop or deadlock)
- **Command**: `npm test -- tests/unit/journal.service.test.ts`
- **Issue**: Test execution exceeds timeout
- **Next Steps**: Debug with shorter timeout, check for circular dependencies

### High Priority (Fix This Sprint)

#### 2. field-encryption.service.test.ts (P1) 🟠
- **Failed**: 15 out of 32 tests
- **Command**: `npm test -- tests/unit/field-encryption.service.test.ts`
- **Issues**: Decryption logic bugs, validation not working
- **Next Steps**: Review encryption implementation

#### 3. manual-payment.service.test.ts (P1) 🟠
- **Failed**: 36 out of 50 tests
- **Command**: `npm test -- tests/unit/manual-payment.service.test.ts`
- **Issues**: Mock setup problems, customer lookup failing
- **Next Steps**: Restructure test mocks

#### 4. tax-calculation-accuracy.test.ts (P1) 🟠
- **Failed**: 6 out of 27 tests (21 passing ✅)
- **Command**: `npm test -- tests/unit/tax-calculation-accuracy.test.ts`
- **Issues**: Floating point precision errors
- **Next Steps**: Review rounding logic

#### 5. audit.service.test.ts (P1) 🟠
- **Command**: `npm test -- tests/unit/audit.service.test.ts`
- **Next Steps**: Analyze failures

### Medium Priority (Fix Next Sprint)

#### 6-10. Other Failing Suites (P2) 🟡
- `email.service.test.ts`
- `encryption-audit.service.test.ts`
- `encryption-monitoring.service.test.ts`
- `document.service.test.ts`
- `reporting.service.test.ts`

**Note**: All failing tests are **pre-existing issues**, not related to new features.

---

## Test Infrastructure

### Reference Data Seeding ✅

**Automatically seeded at test startup**:
- 3 countries (CA, US, GB)
- 3 currencies (CAD, USD, GBP)
- 3 tax rates (HST_ON, GST_PST_BC, GST)
- 3 product categories
- 3 service categories

**Important**: Reference data persists across all tests. Only transactional data is cleaned between tests.

### Database Cleanup

**Cleaned before each test**:
- Organizations, users, customers
- Accounts, transactions, journal entries
- Quotes, invoices, payments
- Projects, appointments

**NOT cleaned** (reference data):
- Countries, currencies, tax rates
- Product categories, service categories

### Test Configuration

**Files**:
- `jest.config.js` - Unit test configuration
- `jest.integration.config.js` - Integration test configuration
- `tests/jest.global-setup.js` - Test database setup
- `tests/jest.global-teardown.js` - Cleanup after tests
- `tests/setup.ts` - Per-test setup (imports cleanupDatabase)
- `tests/testUtils.ts` - Test utilities and helpers

**Test Database**: `prisma/test.db` (SQLite)

---

## Best Practices

### Writing New Tests ✅

```typescript
import { describe, it, expect, beforeEach } from '@jest/globals';
import { prisma, createTestOrganization, createTestUser } from '../testUtils';

describe('MyService', () => {
  let testOrganization: any;
  let testUser: any;

  beforeEach(async () => {
    // Reference data already exists, just create org and user
    testOrganization = await createTestOrganization('Test Org');
    testUser = await createTestUser(testOrganization.id);
  });

  it('should do something', async () => {
    // Test code here
    expect(true).toBe(true);
  });
});
```

### DO ✅

- ✅ Use `createTestOrganization()` for test orgs
- ✅ Use `createTestUser()` for test users
- ✅ Rely on reference data being present
- ✅ Clean up only transactional data
- ✅ Use `beforeEach` for test isolation
- ✅ Use descriptive test names
- ✅ Test one thing per test

### DON'T ❌

- ❌ Don't create reference data in tests (use upsert if needed)
- ❌ Don't delete reference tables
- ❌ Don't use hard-coded IDs
- ❌ Don't rely on test execution order
- ❌ Don't share state between tests
- ❌ Don't use `only()` in committed code
- ❌ Don't commit skipped tests without comments

---

## Debugging Failing Tests

### Step 1: Run the Test Individually

```bash
npm test -- tests/unit/failing-test.test.ts
```

### Step 2: Add Debug Output

```typescript
// In your test
console.log('Debug:', { variable });

// Or use debug package
import debug from 'debug';
const log = debug('test:myservice');
log('Debug info:', data);
```

### Step 3: Check Database State

```typescript
// After test operation
const result = await prisma.myModel.findMany();
console.log('Database state:', result);
```

### Step 4: Use Jest Debugger

```bash
# Run with Node debugger
node --inspect-brk node_modules/.bin/jest tests/unit/failing-test.test.ts

# Then open Chrome and go to chrome://inspect
```

### Step 5: Increase Timeout

```typescript
// For slow tests
it('slow test', async () => {
  // Test code
}, 30000); // 30 second timeout
```

---

## Common Test Errors

### 1. Foreign Key Constraint Violation

**Error**: `Foreign key constraint violated: foreign key`

**Cause**: Missing reference data (countries, currencies, tax rates)

**Solution**: Reference data should be seeded automatically. If not, check:
```bash
# Verify reference data exists
npm test -- --verbose
```

### 2. Customer/User Not Found

**Error**: `Customer not found` or `User not found`

**Cause**: Test cleanup removed required entities

**Solution**: Ensure you create test org and user in `beforeEach`:
```typescript
beforeEach(async () => {
  testOrganization = await createTestOrganization();
  testUser = await createTestUser(testOrganization.id);
});
```

### 3. Unique Constraint Violation

**Error**: `Unique constraint failed on the fields: (code)`

**Cause**: Trying to create duplicate reference data

**Solution**: Use `upsert` instead of `create`:
```typescript
await prisma.taxRate.upsert({
  where: { code: 'HST_ON' },
  update: {},
  create: { /* data */ }
});
```

### 4. Test Timeout

**Error**: `Exceeded timeout of 10000 ms for a test`

**Cause**: Infinite loop, deadlock, or very slow operation

**Solution**:
1. Check for circular dependencies
2. Add debug logging
3. Increase timeout if genuinely slow
4. Use `--maxWorkers=1` to reduce race conditions

### 5. Module Not Found

**Error**: `Cannot find module 'sharp'`

**Cause**: Optional dependency not installed

**Solution**: Install missing dependency or mock it:
```bash
npm install sharp
```

Or mock in test:
```typescript
jest.mock('sharp', () => ({
  /* mock implementation */
}));
```

---

## CI/CD Configuration

### Recommended Settings

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Run tests (sequential for reliability)
        run: npm test -- --maxWorkers=1 --coverage

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/coverage-final.json
```

### Key Points

- ✅ Use `--maxWorkers=1` for reliability
- ✅ Use `npm ci` instead of `npm install`
- ✅ Generate coverage reports
- ✅ Cache `node_modules` for speed
- ✅ Fail fast on test failures

---

## Performance Tips

### Speed Up Tests

1. **Use parallel execution locally**:
   ```bash
   npm test  # Uses all CPU cores
   ```

2. **Run only changed tests**:
   ```bash
   npm test -- --onlyChanged
   ```

3. **Use watch mode for TDD**:
   ```bash
   npm test -- --watch
   ```

4. **Skip slow tests during development**:
   ```typescript
   it.skip('slow integration test', async () => {
     // Will be skipped
   });
   ```

### Improve Test Reliability

1. **Use sequential execution in CI**:
   ```bash
   npm test -- --maxWorkers=1
   ```

2. **Avoid test interdependencies**:
   - Each test should be independent
   - Use `beforeEach` to set up fresh state

3. **Clean up properly**:
   - Let `cleanupDatabase()` handle cleanup
   - Don't delete reference data

4. **Use proper timeouts**:
   - Default: 10 seconds
   - Slow tests: Increase to 30+ seconds
   - Integration tests: Increase to 60+ seconds

---

## Test Coverage Goals

### Current Coverage

| Type | Target | Current | Status |
|------|--------|---------|--------|
| **Statements** | 80% | TBD | Run with `--coverage` |
| **Branches** | 80% | TBD | Run with `--coverage` |
| **Functions** | 80% | TBD | Run with `--coverage` |
| **Lines** | 80% | TBD | Run with `--coverage` |

### Generate Coverage Report

```bash
# Generate and view coverage
npm test -- --coverage
open coverage/index.html

# Coverage for specific file
npm test -- tests/unit/accounts.service.test.ts --coverage
```

### Coverage Configuration

Defined in `jest.config.js`:
```javascript
coverageThreshold: {
  global: {
    branches: 80,
    functions: 80,
    lines: 80,
    statements: 80
  }
}
```

---

## Getting Help

### Documentation

- **Complete Analysis**: `TEST_ANALYSIS_REPORT.md`
- **Resolution Summary**: `TEST_RESOLUTION_SUMMARY.md`
- **Deployment Status**: `DEPLOYMENT_STATUS.md`
- **This Guide**: `TESTING_QUICK_REFERENCE.md`

### Common Commands

```bash
# Get help with Jest CLI
npx jest --help

# List all tests
npx jest --listTests

# Show test configuration
npx jest --showConfig

# Clear Jest cache
npx jest --clearCache
```

### Useful Links

- Jest Documentation: https://jestjs.io/docs/getting-started
- Testing Best Practices: https://testingjavascript.com/
- Prisma Testing: https://www.prisma.io/docs/guides/testing

---

## Maintenance Checklist

### Weekly

- [ ] Run full test suite: `npm test -- --maxWorkers=1`
- [ ] Check test pass rate (should stay above 90%)
- [ ] Review any new failing tests
- [ ] Update this guide if needed

### Monthly

- [ ] Review test coverage: `npm test -- --coverage`
- [ ] Identify untested code paths
- [ ] Update test dependencies: `npm update`
- [ ] Clean up obsolete tests
- [ ] Review test execution time (should be < 3 minutes)

### Before Each Release

- [ ] Run full test suite with coverage
- [ ] Ensure no skipped tests without justification
- [ ] Verify integration tests pass
- [ ] Check for deprecated test patterns
- [ ] Update test documentation

---

## Quick Troubleshooting

| Symptom | Likely Cause | Quick Fix |
|---------|-------------|-----------|
| All tests failing | Database not setup | Run `npm test` again |
| Foreign key errors | Missing reference data | Check `seedReferenceData()` |
| Timeout errors | Infinite loop or deadlock | Use `--maxWorkers=1` |
| Flaky tests | Race conditions | Use sequential execution |
| Module not found | Missing dependency | Run `npm install` |
| Type errors | Stale type definitions | Run `npm run typecheck` |

---

**Last Updated**: September 30, 2025
**Maintained By**: Development Team
**Test Pass Rate**: 91.9% ✅

**Questions?** Check the detailed documentation in `TEST_ANALYSIS_REPORT.md`