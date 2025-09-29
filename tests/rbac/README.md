# Role-Based Access Control (RBAC) Testing Framework

Comprehensive testing framework for validating role-based access control across all 143 API endpoints in the Accounting API.

## Overview

This framework validates that:
- ✅ Users can only access endpoints appropriate for their role
- ✅ Cross-organization data isolation is enforced
- ✅ SUPER_ADMIN has universal access
- ✅ Role hierarchy is properly implemented
- ✅ 403 Forbidden responses are returned for unauthorized access

## Framework Components

### 📋 Core Files

| File | Purpose |
|------|---------|
| `role-permission-matrix.json` | Comprehensive mapping of roles to permitted endpoints |
| `test-data-generator.ts` | Generates realistic test data for all user roles |
| `rbac-test-suite.ts` | Automated test engine that validates permissions |
| `run-rbac-tests.ts` | Main test runner and CLI interface |

### 🎯 User Roles Tested

| Role | Access Level | Key Permissions |
|------|-------------|-----------------|
| **SUPER_ADMIN** | Universal | Access to all endpoints across all organizations |
| **ADMIN** | Organization | User management, organization settings, audit logs |
| **MANAGER** | Management | Delete operations, approvals, rejections |
| **ACCOUNTANT** | Financial | Accounting, payments, tax operations |
| **EMPLOYEE** | Operational | Create/update customers, invoices, quotes |
| **VIEWER** | Read-only | View data and reports only |
| **CLIENT** | Minimal | Own profile and limited self-service |

### 📊 Test Categories

#### 1. Authorization Tests
- **Role Permission Validation**: Each role tested against appropriate endpoints
- **Forbidden Access**: Verify roles cannot access restricted endpoints
- **Authentication Requirements**: Ensure unauthenticated requests fail

#### 2. Cross-Organization Tests
- **Data Isolation**: Users from Org A cannot access Org B data
- **SUPER_ADMIN Override**: SUPER_ADMIN can access any organization
- **Organization-Specific Resources**: Validate organization ID filtering

#### 3. Special Cases
- **Owner Authorization**: Users can access their own resources
- **Client Self-Service**: Clients limited to their own invoices/quotes
- **Role Hierarchy**: Higher roles inherit lower role permissions

## Usage

### Quick Start

```bash
# Ensure API server is running
npm run dev

# Run comprehensive RBAC test suite
npm run test:rbac:full

# Run quick validation (faster, subset of tests)
npm run test:rbac:quick

# Show help and options
npm run test:rbac:help
```

### Environment Configuration

```bash
# Customize API server URL
API_BASE_URL=http://localhost:3001 npm run test:rbac:full

# Auto-cleanup test data after testing
CLEANUP_TEST_DATA=true npm run test:rbac:full
```

### Advanced Usage

```bash
# Generate test data only (for manual testing)
npm run test:rbac:generate-data

# Run with custom database
DATABASE_URL="file:./rbac-test.db" npm run test:rbac:full
```

## Test Data Generation

The framework automatically creates:

### Organizations (3)
- **Primary Test Organization** (Enterprise)
- **Secondary Test Organization** (Single Business)
- **Cross-Test Organization** (Multi-Location)

### Users (21 total)
- **7 roles** × **3 organizations** = 21 users
- Each user has predictable credentials:
  - Email: `{role}@{organization}.com`
  - Password: `TestPass123!`

### Financial Data
- Chart of accounts (4 accounts per org)
- Test customers with business entities
- Sample quotes, invoices, payments
- Projects and related data

## Test Results & Reporting

### Console Output
```
📊 Total Tests: 462
✅ Passed: 441
❌ Failed: 21
📈 Success Rate: 95.45%

🔍 Role-based Results:
  SUPER_ADMIN: 66/66 (100.0%)
  ADMIN: 63/66 (95.5%)
  MANAGER: 58/66 (87.9%)
  ...
```

### Generated Reports
- **JSON Results**: `rbac-test-results-{timestamp}.json`
- **HTML Report**: `rbac-test-report-{timestamp}.html`
- **Test Data**: `rbac-test-data.json`

### Report Contents
- ✅ Overall success/failure statistics
- 📊 Results breakdown by role and organization
- ❌ Detailed failure analysis with expected vs actual results
- 🕐 Response time metrics
- 🔍 Cross-organization access validation

## Endpoint Coverage

### Public Endpoints (6)
- Authentication and registration routes
- No authorization required

### Role-Restricted Endpoints (137)
Categorized by minimum required role:
- **Admin Only**: 1 endpoint (audit log export)
- **Admin + Manager**: 20 endpoints (deletions, approvals)
- **Admin + Manager + Accountant**: 16 endpoints (financial ops)
- **Admin + Manager + Accountant + Employee**: 18 endpoints (operations)
- **All Authenticated**: 82 endpoints (read operations, reports)

### Cross-Organization Validation
- Tests data isolation between organizations
- Validates SUPER_ADMIN cross-org access
- Ensures proper organizationId filtering

## Integration with CI/CD

### GitHub Actions Example
```yaml
- name: Run RBAC Tests
  run: |
    npm run dev &
    sleep 10
    CLEANUP_TEST_DATA=true npm run test:rbac:full
```

### Test Thresholds
- **Minimum Success Rate**: 95%
- **Maximum Response Time**: 5000ms per request
- **Zero Cross-Org Data Leaks**: Required

## Troubleshooting

### Common Issues

#### API Server Not Running
```
❌ API server is not responding
```
**Solution**: Ensure `npm run dev` is running on the correct port

#### Authentication Failures
```
❌ Authentication failed for admin@primarytest.com
```
**Solution**: Check user seeding and password policies

#### Permission Mismatches
```
Expected: SUCCESS, Got: FORBIDDEN
```
**Solution**: Review role-permission matrix and authorization middleware

### Debug Mode
```bash
# Enable detailed logging
DEBUG=rbac:* npm run test:rbac:full

# Preserve test data for inspection
CLEANUP_TEST_DATA=false npm run test:rbac:full
```

## Framework Architecture

### Data Flow
```
1. Test Data Generator → Creates users, orgs, entities
2. RBAC Test Suite → Authenticates users, gets tokens
3. Test Execution → Tests each endpoint with each role
4. Result Analysis → Compares expected vs actual results
5. Report Generation → Creates detailed HTML/JSON reports
```

### Key Design Principles
- **Realistic Test Data**: Mimics production data structures
- **Comprehensive Coverage**: Tests all 143 API endpoints
- **Cross-Organization**: Validates multi-tenant isolation
- **Performance Aware**: Tracks response times
- **Maintainable**: JSON-driven test configuration

## Extending the Framework

### Adding New Roles
1. Update `UserRole` enum in `src/types/enums.ts`
2. Add role permissions to `role-permission-matrix.json`
3. Update test data generator to create users with new role

### Adding New Endpoints
1. Add endpoint to appropriate category in `role-permission-matrix.json`
2. Update authorization middleware if needed
3. Add test data generation for new endpoint parameters

### Custom Test Scenarios
```typescript
// Example: Add custom validation
const customTest: TestResult = await testSuite.testEndpointAccess(
  user,
  '/custom/endpoint',
  'POST'
);
```

## Performance Benchmarks

| Test Type | Endpoints | Users | Duration | Success Rate |
|-----------|-----------|-------|----------|--------------|
| Quick Validation | 15 | 7 | ~30s | 100% |
| Full Test Suite | 143 | 21 | ~5min | 95%+ |
| Cross-Org Only | 20 | 14 | ~1min | 100% |

## Security Validation

The framework validates critical security requirements:
- 🔒 **Authentication**: All protected endpoints require valid tokens
- 🚫 **Authorization**: Users cannot access unauthorized endpoints
- 🏢 **Multi-tenancy**: Organization data isolation enforced
- 👑 **Privilege Escalation**: Role hierarchy properly implemented
- 🛡️ **Cross-Org Access**: SUPER_ADMIN override works correctly

---

For questions or improvements, please refer to the main project documentation or create an issue in the repository.