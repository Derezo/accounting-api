# Integration Test Suite

This comprehensive integration test suite provides bank-level testing for the accounting API with complete coverage of all customer lifecycle scenarios, security requirements, and production-ready validation.

## Overview

The integration test suite covers:

- **Complete Customer Lifecycle**: Quote → Appointment → Invoice → Payment → Project workflows
- **Multi-tenant Isolation**: Complete data separation and access control testing
- **Authentication & Authorization**: JWT lifecycle, RBAC, session management, security policies
- **Payment Integration**: Stripe, e-transfer, manual payments, webhooks, reconciliation
- **Data Integrity**: ACID transactions, referential integrity, audit trails, consistency
- **Performance & Security**: Rate limiting, SQL injection prevention, XSS protection, load testing
- **Error Handling & Recovery**: Network failures, data corruption, graceful degradation

## Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn
- Docker & Docker Compose (for containerized testing)
- PostgreSQL (for full database testing)

### Installation

```bash
# Install dependencies
npm install

# Install additional test dependencies
npm install --save-dev @faker-js/faker jest-html-reporters jest-junit

# Generate Prisma client
npx prisma generate
```

### Running Tests

#### Local Testing (Recommended for Development)

```bash
# Run all integration tests
npm run test:integration

# Run with coverage
npm run test:integration:coverage

# Run specific test suite
npm run test:integration -- --testPathPattern=customer-lifecycle

# Watch mode for development
npm run test:integration:watch
```

#### Using the Test Runner Script

```bash
# Make script executable (first time only)
chmod +x scripts/run-integration-tests.sh

# Run all tests locally with coverage
./scripts/run-integration-tests.sh -m local -s all -c

# Run specific test suite
./scripts/run-integration-tests.sh -m local -s payments -v

# Run in Docker (full isolation)
./scripts/run-integration-tests.sh -m docker -s all -c

# CI/CD mode
./scripts/run-integration-tests.sh -m ci -s all -c --no-cleanup
```

#### Docker Testing (Production-like Environment)

```bash
# Run all tests in Docker
docker-compose -f docker-compose.test.yml run --rm test-runner

# Run performance tests
docker-compose -f docker-compose.test.yml run --rm performance-tester

# Run security tests
docker-compose -f docker-compose.test.yml run --rm security-tester

# Clean up
docker-compose -f docker-compose.test.yml down -v
```

## Test Structure

### Core Test Files

```
tests/integration/
├── setup.ts                           # Global test configuration
├── global-setup.ts                    # Database and environment setup
├── global-teardown.ts                 # Cleanup procedures
├── test-utils.ts                      # Comprehensive test utilities
├── customer-lifecycle.test.ts         # End-to-end customer workflows
├── multi-tenant-isolation.test.ts     # Tenant separation testing
├── auth-authorization.test.ts         # Security and access control
├── payment-integration.test.ts        # Payment processing workflows
├── data-integrity.test.ts            # Database consistency testing
├── performance-security.test.ts       # Performance and security testing
└── error-handling-recovery.test.ts    # Error scenarios and recovery
```

### Configuration Files

```
├── jest.integration.config.js         # Jest configuration for integration tests
├── docker-compose.test.yml           # Docker testing environment
├── Dockerfile.test                   # Test container configuration
└── .github/workflows/integration-tests.yml  # CI/CD pipeline
```

## Test Suites

### 1. Customer Lifecycle Tests (`customer-lifecycle.test.ts`)

**Complete end-to-end customer journey testing:**

- **Full Workflow**: Quote creation → Sending → Customer acceptance → Project creation → Appointment scheduling → Invoice generation → Payment processing → Project completion
- **Customer Onboarding**: Person and business customer creation with address management
- **Quote Management**: Creation, revisions, approvals, expiry handling
- **Multi-Project Management**: Concurrent projects for single customers
- **Audit Trail Verification**: Complete tracking of all customer interactions

**Key Test Scenarios:**
```typescript
// Complete 16-step customer lifecycle (60s timeout)
test('should complete full customer lifecycle workflow'

// Customer onboarding with validation
test('should handle complete customer onboarding process'

// Quote revision and approval workflow
test('should handle quote lifecycle with revisions and approvals'

// Multiple concurrent projects
test('should handle customer with multiple concurrent projects'
```

### 2. Multi-Tenant Isolation Tests (`multi-tenant-isolation.test.ts`)

**Comprehensive tenant separation and security:**

- **Data Isolation**: Complete prevention of cross-tenant data access
- **Role-Based Access Control**: Permission enforcement within tenant boundaries
- **API Key Isolation**: Tenant-specific API key management
- **Session Management**: Isolated user sessions per tenant
- **Attack Prevention**: SQL injection, tenant ID manipulation, concurrent access

**Key Test Scenarios:**
```typescript
// Cross-tenant data access prevention
test('should prevent cross-tenant data access for all entities'

// Cross-tenant modification prevention
test('should prevent cross-tenant data modification'

// Role-based access control across tenants
test('should enforce RBAC within tenant boundaries'

// Security attack simulation
test('should prevent tenant ID manipulation attacks'
```

### 3. Authentication & Authorization Tests (`auth-authorization.test.ts`)

**Complete security validation:**

- **JWT Lifecycle**: Token creation, validation, refresh, expiry, invalidation
- **Role-Based Permissions**: All 6 roles (SUPER_ADMIN → VIEWER) with proper restrictions
- **Session Management**: Concurrent sessions, cleanup, user deactivation
- **Password Security**: Strong passwords, reset flows, account lockout
- **API Key Authentication**: Key-based access with permission scoping

**Key Test Scenarios:**
```typescript
// Complete JWT authentication flow
test('should handle complete JWT lifecycle'

// Role permission enforcement (6 separate tests)
test('should enforce SUPER_ADMIN permissions'
test('should enforce ADMIN permissions'
// ... etc for all roles

// Security features
test('should prevent brute force attacks on passwords'
test('should validate JWT tokens properly'
```

### 4. Payment Integration Tests (`payment-integration.test.ts`)

**Complete payment processing validation:**

- **Stripe Integration**: Payment intents, webhooks, failures, refunds
- **E-Transfer Processing**: Initiation, bank notifications, confirmations, timeouts
- **Manual Payments**: Cash, cheque, bank transfers with reconciliation
- **Payment Reconciliation**: Multiple payments, overpayments, partial payments
- **Security & Validation**: Amount validation, duplicate prevention, fraud protection

**Key Test Scenarios:**
```typescript
// End-to-end Stripe payment processing
test('should process complete Stripe payment flow'

// E-transfer workflow with bank integration
test('should process e-transfer payment workflow'

// Manual payment recording and clearing
test('should record manual cash payment'
test('should record manual cheque payment'

// Complex reconciliation scenarios
test('should reconcile multiple payments for single invoice'
```

### 5. Data Integrity Tests (`data-integrity.test.ts`)

**Database consistency and reliability:**

- **ACID Transactions**: Atomicity, consistency, isolation, durability testing
- **Foreign Key Constraints**: Referential integrity enforcement
- **Business Rules Validation**: Financial calculations, date logic, status workflows
- **Audit Trail Completeness**: Before/after snapshots, change tracking
- **Performance with Scale**: Large dataset handling, query optimization

**Key Test Scenarios:**
```typescript
// Transaction integrity with rollback testing
test('should maintain ACID properties during complex operations'

// Reference integrity across all entities
test('should enforce referential integrity across all entities'

// Business rule enforcement
test('should validate business rules across operations'

// Audit trail verification
test('should create complete audit trail for all operations'
```

### 6. Performance & Security Tests (`performance-security.test.ts`)

**Production-readiness validation:**

- **Rate Limiting**: Login attempts, API calls, DDoS protection
- **Input Validation**: SQL injection, XSS prevention, path traversal
- **Authentication Security**: Token validation, brute force protection
- **Performance Benchmarking**: High-volume operations, memory usage, query performance
- **Security Headers**: CORS, security headers, request size limits

**Key Test Scenarios:**
```typescript
// Rate limiting effectiveness
test('should enforce rate limits on login attempts'

// Security vulnerability prevention
test('should prevent SQL injection in search parameters'
test('should sanitize and validate input data'

// Performance benchmarking
test('should handle high-volume customer operations efficiently'
test('should maintain query performance with pagination'
```

### 7. Error Handling & Recovery Tests (`error-handling-recovery.test.ts`)

**Resilience and failure recovery:**

- **Network Failures**: Database timeouts, external service unavailability
- **Data Corruption**: Detection, recovery, orphaned records
- **Graceful Degradation**: Reduced functionality, meaningful errors, backpressure
- **Recovery Procedures**: Manual recovery, data export, system restart
- **Monitoring & Alerting**: Error logging, cascading failure prevention

**Key Test Scenarios:**
```typescript
// Network failure handling
test('should handle database connection timeouts gracefully'
test('should recover from temporary database unavailability'

// Data corruption recovery
test('should detect and handle data integrity violations'
test('should handle orphaned records recovery'

// System resilience
test('should provide meaningful error messages to users'
test('should handle high load with appropriate backpressure'
```

## Test Utilities

### Core Utilities (`test-utils.ts`)

The test utilities provide comprehensive helper functions:

```typescript
// Test context creation with full organization setup
async function createTestContext(prisma: PrismaClient): Promise<TestContext>

// Individual entity creation helpers
async function createTestCustomer(prisma, organizationId, type): Promise<TestCustomer>
async function createTestQuote(prisma, organizationId, customerId): Promise<Quote>
async function createTestInvoice(prisma, organizationId, customerId): Promise<Invoice>
async function createTestPayment(prisma, organizationId, customerId): Promise<Payment>

// Authentication helpers
function generateAuthToken(user: TestUser): string
function authenticatedRequest(token: string): SuperTest

// Multi-tenant testing
async function createIsolatedTenants(prisma): Promise<{tenant1, tenant2}>

// Performance testing
class PerformanceTimer {
  start(): void
  stop(): number
  getAverage(): number
  getMax(): number
}

// Audit verification
async function verifyAuditLog(prisma, organizationId, action, entityType): Promise<AuditLog>

// Mock external services
function createStripeWebhookEvent(type: string, data: any): StripeEvent
```

### Database Management

```typescript
// Complete database cleanup maintaining referential integrity
async function cleanupDatabase(prisma: PrismaClient): Promise<void>

// Health checks
async function checkDatabaseHealth(prisma: PrismaClient): Promise<boolean>
```

## Configuration

### Jest Configuration (`jest.integration.config.js`)

```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  displayName: 'Integration Tests',
  roots: ['<rootDir>/tests/integration'],
  testMatch: ['**/integration/**/*.test.ts'],
  coverageThreshold: {
    global: {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85
    }
  },
  testTimeout: 30000,
  maxWorkers: 1, // Sequential execution for database isolation
  forceExit: true,
  detectOpenHandles: true,
  globalSetup: '<rootDir>/tests/integration/global-setup.ts',
  globalTeardown: '<rootDir>/tests/integration/global-teardown.ts'
}
```

### Environment Variables

```bash
# Database
DATABASE_URL="file:./test-integration.db"
TEST_DATABASE_URL="file:./test-integration.db"

# Authentication
JWT_SECRET="test-jwt-secret"
ENCRYPTION_KEY="test-encryption-key-32-chars"

# External Services
STRIPE_SECRET_KEY="sk_test_..."
REDIS_URL="redis://localhost:6379"

# Test Configuration
NODE_ENV="test"
CI="true"
TEST_TIMEOUT="30000"
```

## CI/CD Integration

### GitHub Actions (`.github/workflows/integration-tests.yml`)

The CI/CD pipeline includes:

- **Multi-Node Testing**: Node.js 18.x and 20.x
- **Service Dependencies**: PostgreSQL and Redis containers
- **Security Scanning**: Trivy vulnerability scanning, npm audit
- **Performance Testing**: Scheduled performance benchmarks
- **Deployment Gates**: Staging and production deployment controls
- **Artifact Management**: Test results, coverage reports, performance data

**Pipeline Stages:**

1. **Setup**: Environment preparation, dependency installation
2. **Linting**: Code quality and type checking
3. **Unit Tests**: Fast feedback loop
4. **Integration Tests**: Comprehensive integration validation
5. **Security Scan**: Vulnerability assessment
6. **Performance Tests**: Load and performance validation (scheduled/labeled PRs)
7. **Deployment**: Staging and production deployment with health checks

### Docker Testing Environment

Complete containerized testing with:

- **PostgreSQL 15**: Production-grade database testing
- **Redis 7**: Session and cache testing
- **Isolated Containers**: Test runner, performance tester, security tester
- **Volume Management**: Persistent test results and coverage data
- **Health Checks**: Service readiness validation

## Running Specific Test Scenarios

### Development Workflow

```bash
# Quick smoke test during development
npm run test:integration -- --testPathPattern=customer-lifecycle --testNamePattern="should complete full customer lifecycle"

# Test specific payment scenarios
npm run test:integration -- --testPathPattern=payment-integration

# Security testing
npm run test:integration -- --testPathPattern=performance-security --testNamePattern="security|authentication"

# Performance benchmarking
npm run test:integration -- --testPathPattern=performance-security --testNamePattern="performance|benchmarking"
```

### Pre-deployment Validation

```bash
# Full test suite with coverage
./scripts/run-integration-tests.sh -m local -s all -c -v

# Docker validation (production-like)
./scripts/run-integration-tests.sh -m docker -s all -c

# Security validation
./scripts/run-integration-tests.sh -m local -s security -v
```

### CI/CD Validation

```bash
# CI-optimized run
./scripts/run-integration-tests.sh -m ci -s all -c --no-cleanup

# Performance validation (scheduled)
./scripts/run-integration-tests.sh -m ci -s security --no-cleanup
```

## Test Data Management

### Realistic Test Data

All test data uses the Faker.js library for realistic data generation:

- **Customer Data**: Real names, addresses, phone numbers, emails
- **Financial Data**: Realistic amounts, tax rates, payment terms
- **Business Data**: Company names, business numbers, legal structures
- **Temporal Data**: Logical date sequences, appointment scheduling

### Data Isolation

- **Database Cleanup**: Complete cleanup between tests maintaining referential integrity
- **Organization Isolation**: Each test gets a fresh organization context
- **Sequential Execution**: Tests run sequentially to prevent database conflicts
- **Deterministic IDs**: Consistent ID generation for reproducible tests

## Troubleshooting

### Common Issues

1. **Database Connection Errors**
   ```bash
   # Verify database is accessible
   npx prisma db push --force-reset

   # Check environment variables
   echo $DATABASE_URL
   ```

2. **Port Conflicts**
   ```bash
   # Kill processes using test ports
   lsof -ti:3001 | xargs kill -9
   lsof -ti:6379 | xargs kill -9
   ```

3. **Memory Issues with Large Tests**
   ```bash
   # Run with increased memory
   node --max-old-space-size=4096 node_modules/.bin/jest --config jest.integration.config.js
   ```

4. **Docker Issues**
   ```bash
   # Reset Docker environment
   docker-compose -f docker-compose.test.yml down -v
   docker system prune -f
   ```

### Debug Mode

```bash
# Enable debug logging
DEBUG=true npm run test:integration

# Verbose Jest output
npm run test:integration -- --verbose

# Run single test for debugging
npm run test:integration -- --testNamePattern="specific test name"
```

## Performance Benchmarks

Expected performance benchmarks for integration tests:

- **Customer Creation**: < 200ms per customer
- **Payment Processing**: < 500ms end-to-end
- **Database Queries**: < 100ms for simple operations, < 1s for complex joins
- **Full Test Suite**: < 10 minutes local, < 15 minutes Docker
- **Memory Usage**: < 512MB peak during testing

## Security Validation

The test suite validates all security requirements:

- ✅ **Authentication**: JWT lifecycle, session management
- ✅ **Authorization**: Role-based access control (6 roles)
- ✅ **Input Validation**: SQL injection, XSS, path traversal prevention
- ✅ **Rate Limiting**: Login attempts, API calls, DDoS protection
- ✅ **Data Privacy**: Encryption, masking, audit trails
- ✅ **Multi-tenant Isolation**: Complete data separation
- ✅ **Payment Security**: PCI compliance, webhook validation

## Contributing

When adding new integration tests:

1. **Follow Naming Conventions**: `describe('Feature Name Integration Tests')`
2. **Use Test Utilities**: Leverage existing helper functions
3. **Maintain Isolation**: Each test should be independent
4. **Add Documentation**: Update this README for new test suites
5. **Performance Considerations**: Keep tests under 30s timeout
6. **Security Focus**: Always test security boundaries

## Support

For issues with the integration test suite:

1. Check this documentation first
2. Review existing test patterns in the codebase
3. Verify environment setup and dependencies
4. Check CI/CD pipeline logs for additional context
5. Review test artifacts and coverage reports

The integration test suite provides enterprise-grade validation ensuring your accounting API meets bank-level security and reliability standards.