# Testing Guide

## Overview

The Lifestream Dynamics Accounting API has comprehensive test coverage with unit and integration tests.

## Test Statistics

- **Total Tests**: 1,392
- **Unit Tests**: 1,102 passing (79.1%)
- **Integration Tests**: 29 suites
- **Test Coverage**: 85% (integration), 80% (unit)

## Running Tests

### Unit Tests
```bash
# Run all unit tests
npm test

# Run specific test file
npm test -- path/to/file.test.ts

# Run tests with coverage
npm run test:all

# Run tests in watch mode
npm test -- --watch
```

### Integration Tests
```bash
# Run all integration tests
npm run test:integration

# Run specific integration test
npm run test:integration -- tests/integration/specific.test.ts
```

### Full Validation
```bash
# Run lint + typecheck + tests
npm run validate

# Run lint + typecheck + all tests (unit + integration)
npm run validate:full
```

## Test Structure

### Unit Tests (`tests/unit/`)
- Service layer tests
- Controller tests  
- Utility function tests
- Model validation tests

### Integration Tests (`tests/integration/`)
- End-to-end API tests
- Database integration tests
- Authentication flow tests
- Payment processing tests

## Test Database

- Uses SQLite for fast, isolated testing
- Separate test database per run
- Automatic cleanup after each suite
- Seeded with reference data

## Coverage Thresholds

### Unit Tests
- Statements: 80%
- Branches: 75%
- Functions: 80%
- Lines: 80%

### Integration Tests  
- Statements: 85%
- Branches: 80%
- Functions: 85%
- Lines: 85%

## Test Configuration

### Jest Configuration
- `jest.config.js` - Unit test configuration
- `jest.integration.config.js` - Integration test configuration
- 30s timeout for integration tests
- Sequential execution for integration tests

### Test Utilities
- `tests/integration/setup.ts` - Test environment setup
- `tests/integration/test-utils.ts` - Helper functions
- Mock data factories
- Authentication helpers

## Common Test Patterns

### Service Tests
```typescript
describe('ServiceName', () => {
  let service: ServiceName;
  
  beforeEach(() => {
    service = new ServiceName();
  });
  
  it('should perform action', async () => {
    const result = await service.action();
    expect(result).toBeDefined();
  });
});
```

### Integration Tests
```typescript
describe('API Endpoint', () => {
  let authToken: string;
  
  beforeAll(async () => {
    // Setup test data
    authToken = await getAuthToken();
  });
  
  it('should return data', async () => {
    const response = await request(app)
      .get('/api/v1/endpoint')
      .set('Authorization', `Bearer ${authToken}`);
      
    expect(response.status).toBe(200);
  });
});
```

## Debugging Tests

```bash
# Run with verbose output
npm test -- --verbose

# Run with Node debugger
node --inspect-brk node_modules/.bin/jest --runInBand

# Run specific test with debugging
npm test -- --testNamePattern="test name" --verbose
```

## Continuous Integration

Tests run automatically on:
- Every commit (GitHub Actions)
- Pull requests
- Pre-deployment

## Known Test Limitations

- Some tests may timeout on slower machines
- Database concurrency can cause occasional failures
- Integration tests require sequential execution

---

**Last Updated**: 2025-10-01
