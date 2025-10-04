# Security Fixes Testing Guide

## Pre-Testing Setup

1. **Apply Database Migration**:
```bash
npm run prisma:migrate dev
# Or manually: sqlite3 prisma/dev.db < prisma/migrations/add_password_security.sql
```

2. **Seed Test Data** (if needed):
```bash
npm run prisma:seed
```

3. **Start Development Server**:
```bash
npm run dev
```

## Test Suite 1: Password Strength Validation

### Test 1.1: Reject Short Password
```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test1@example.com",
    "password": "Short1!",
    "firstName": "Test",
    "lastName": "User",
    "organizationName": "Test Org"
  }'

# Expected: 400 Bad Request
# Error: "Password must be at least 12 characters long"
```

### Test 1.2: Reject Password Without Uppercase
```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test2@example.com",
    "password": "nouppercase123!",
    "firstName": "Test",
    "lastName": "User",
    "organizationName": "Test Org"
  }'

# Expected: 400 Bad Request
# Error: "Password must contain at least one uppercase letter"
```

### Test 1.3: Reject Password Without Special Character
```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test3@example.com",
    "password": "NoSpecialChar123",
    "firstName": "Test",
    "lastName": "User",
    "organizationName": "Test Org"
  }'

# Expected: 400 Bad Request
# Error: "Password must contain at least one special character"
```

### Test 1.4: Accept Valid Strong Password
```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test4@example.com",
    "password": "ValidPassword123!@#",
    "firstName": "Test",
    "lastName": "User",
    "organizationName": "Test Org"
  }'

# Expected: 201 Created
# Returns: User object with tokens
```

## Test Suite 2: Password History

### Test 2.1: Create User and Change Password
```bash
# 1. Register user
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "history@example.com",
    "password": "InitialPass123!",
    "firstName": "History",
    "lastName": "Test",
    "organizationName": "History Org"
  }'

# Save the access token from response

# 2. Change password
curl -X POST http://localhost:3000/api/v1/auth/change-password \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "currentPassword": "InitialPass123!",
    "newPassword": "SecondPassword456!",
    "confirmPassword": "SecondPassword456!"
  }'

# Expected: 200 OK
```

### Test 2.2: Try to Reuse Recent Password
```bash
# Try to change back to first password
curl -X POST http://localhost:3000/api/v1/auth/change-password \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_NEW_ACCESS_TOKEN" \
  -d '{
    "currentPassword": "SecondPassword456!",
    "newPassword": "InitialPass123!",
    "confirmPassword": "InitialPass123!"
  }'

# Expected: 400 Bad Request
# Error: "Cannot reuse any of your last 5 passwords"
```

## Test Suite 3: Password Expiration

### Test 3.1: Check Password Expiration Set on Registration
```bash
# After registering a user, check the database
sqlite3 prisma/dev.db "SELECT email, passwordExpiresAt FROM users WHERE email='test4@example.com';"

# Expected: passwordExpiresAt should be 90 days from now
```

### Test 3.2: Simulate Expired Password
```bash
# Manually update database to set password as expired
sqlite3 prisma/dev.db "UPDATE users SET passwordExpiresAt = '2024-01-01' WHERE email='test4@example.com';"

# Try to login
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test4@example.com",
    "password": "ValidPassword123!@#"
  }'

# Expected: 403 Forbidden
# Error: "Your password has expired. Please reset your password."
```

## Test Suite 4: Rate Limiting

### Test 4.1: Login Rate Limit (5 attempts / 15 min)
```bash
# Make 6 failed login attempts
for i in {1..6}; do
  echo "Attempt $i:"
  curl -X POST http://localhost:3000/api/v1/auth/login \
    -H "Content-Type: application/json" \
    -d '{
      "email": "nonexistent@example.com",
      "password": "WrongPassword123!"
    }'
  echo ""
  sleep 1
done

# Expected:
# - Attempts 1-5: 401 Unauthorized (Invalid credentials)
# - Attempt 6: 429 Too Many Requests
# - Response includes retryAfter: 900 (15 minutes in seconds)
```

### Test 4.2: Registration Rate Limit (3 attempts / hour)
```bash
# Make 4 registration attempts
for i in {1..4}; do
  echo "Attempt $i:"
  curl -X POST http://localhost:3000/api/v1/auth/register \
    -H "Content-Type: application/json" \
    -d "{
      \"email\": \"ratelimit$i@example.com\",
      \"password\": \"TestPassword123!\",
      \"firstName\": \"Rate\",
      \"lastName\": \"Limit\",
      \"organizationName\": \"Test Org $i\"
    }"
  echo ""
  sleep 1
done

# Expected:
# - Attempts 1-3: Various responses (success or duplicate email)
# - Attempt 4: 429 Too Many Requests
# - Response includes retryAfter: 3600 (1 hour in seconds)
```

### Test 4.3: Password Reset Rate Limit (3 attempts / hour)
```bash
# Make 4 password reset requests
for i in {1..4}; do
  echo "Attempt $i:"
  curl -X POST http://localhost:3000/api/v1/auth/reset-password-request \
    -H "Content-Type: application/json" \
    -d '{
      "email": "test@example.com"
    }'
  echo ""
  sleep 1
done

# Expected:
# - Attempts 1-3: 200 OK
# - Attempt 4: 429 Too Many Requests
# - Response includes retryAfter: 3600
```

### Test 4.4: Verify Audit Logs for Rate Limit Events
```bash
# Check database for audit entries
sqlite3 prisma/dev.db "SELECT action, entityType, changes FROM audit_logs WHERE entityType='Auth' ORDER BY timestamp DESC LIMIT 10;"

# Expected: Audit entries with action='LOGIN', changes containing 'RATE_LIMIT_EXCEEDED'
```

## Test Suite 5: Role Hierarchy

### Test 5.1: Setup Test Users
```bash
# Create users with different roles (requires database access or admin API)

# SUPER_ADMIN user
sqlite3 prisma/dev.db "UPDATE users SET role='SUPER_ADMIN' WHERE email='superadmin@test.com';"

# ADMIN user
sqlite3 prisma/dev.db "UPDATE users SET role='ADMIN' WHERE email='admin@test.com';"

# MANAGER user
sqlite3 prisma/dev.db "UPDATE users SET role='MANAGER' WHERE email='manager@test.com';"

# ACCOUNTANT user
sqlite3 prisma/dev.db "UPDATE users SET role='ACCOUNTANT' WHERE email='accountant@test.com';"

# EMPLOYEE user (default)
```

### Test 5.2: ADMIN Access to ACCOUNTANT Endpoint
```bash
# Endpoint that requires ACCOUNTANT role
# ADMIN (level 80) should be able to access ACCOUNTANT (level 50) endpoints

curl -X GET http://localhost:3000/api/v1/organizations/ORG_ID/financial-statements \
  -H "Authorization: Bearer ADMIN_TOKEN"

# Expected: 200 OK (Before fix: 403 Forbidden)
```

### Test 5.3: MANAGER Access to EMPLOYEE Endpoint
```bash
# Endpoint that requires EMPLOYEE role
# MANAGER (level 60) should be able to access EMPLOYEE (level 40) endpoints

curl -X GET http://localhost:3000/api/v1/organizations/ORG_ID/invoices \
  -H "Authorization: Bearer MANAGER_TOKEN"

# Expected: 200 OK (Before fix: might be 403)
```

### Test 5.4: EMPLOYEE Cannot Access MANAGER Endpoint
```bash
# Endpoint that requires MANAGER role
# EMPLOYEE (level 40) should NOT be able to access MANAGER (level 60) endpoints

curl -X DELETE http://localhost:3000/api/v1/organizations/ORG_ID/projects/PROJECT_ID \
  -H "Authorization: Bearer EMPLOYEE_TOKEN"

# Expected: 403 Forbidden
# Response should show: { "error": "Insufficient permissions", "required": ["MANAGER"], "current": "EMPLOYEE" }
```

### Test 5.5: SUPER_ADMIN Access to Everything
```bash
# SUPER_ADMIN should have access to all endpoints

curl -X GET http://localhost:3000/api/v1/organizations/ORG_ID/any-endpoint \
  -H "Authorization: Bearer SUPER_ADMIN_TOKEN"

# Expected: 200 OK (or appropriate success response)
```

## Test Suite 6: Test Token Security

### Test 6.1: Test Token in Test Environment
```bash
# Set environment to test
export NODE_ENV=test

# Generate a test token (using your test utilities)
# The token should have isTestToken: true

curl -X GET http://localhost:3000/api/v1/auth/profile \
  -H "Authorization: Bearer TEST_TOKEN_WITH_FLAG"

# Expected: 200 OK (test tokens work in test environment)
```

### Test 6.2: Test Token in Production Environment
```bash
# Set environment to production
export NODE_ENV=production

# Use the same test token
curl -X GET http://localhost:3000/api/v1/auth/profile \
  -H "Authorization: Bearer TEST_TOKEN_WITH_FLAG"

# Expected: 401 Unauthorized (test tokens rejected in production)
```

## Test Suite 7: Resource Access Controls

### Test 7.1: Payment Refund - Cross-Organization Attempt
```bash
# User in Org A tries to refund payment in Org B

curl -X POST http://localhost:3000/api/v1/organizations/ORG_A_ID/payments/ORG_B_PAYMENT_ID/refund \
  -H "Authorization: Bearer ORG_A_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 50.00,
    "reason": "Customer request"
  }'

# Expected: 404 Not Found or 403 Forbidden
# Error: "payment not found" or "Access denied to this resource"
```

### Test 7.2: Payment Refund - Same Organization Success
```bash
# Admin in Org A refunds payment in Org A

curl -X POST http://localhost:3000/api/v1/organizations/ORG_A_ID/payments/ORG_A_PAYMENT_ID/refund \
  -H "Authorization: Bearer ORG_A_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 50.00,
    "reason": "Customer request"
  }'

# Expected: 200 OK
```

### Test 7.3: Payment Status - Insufficient Role
```bash
# EMPLOYEE tries to update payment status (requires ACCOUNTANT+)

curl -X PUT http://localhost:3000/api/v1/organizations/ORG_ID/payments/PAYMENT_ID/status \
  -H "Authorization: Bearer EMPLOYEE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "COMPLETED"
  }'

# Expected: 403 Forbidden
# Error: "Insufficient permissions"
```

### Test 7.4: Invoice Update - Employee Cannot Modify Others' Invoices
```bash
# Employee A tries to update Employee B's invoice

curl -X PUT http://localhost:3000/api/v1/organizations/ORG_ID/invoices/EMPLOYEE_B_INVOICE_ID \
  -H "Authorization: Bearer EMPLOYEE_A_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "notes": "Trying to modify someone elses invoice"
  }'

# Expected: 403 Forbidden
# Error: "Access denied - you can only modify resources you created"
```

### Test 7.5: Invoice Update - Employee Can Modify Own Invoice
```bash
# Employee updates their own invoice

curl -X PUT http://localhost:3000/api/v1/organizations/ORG_ID/invoices/EMPLOYEE_OWN_INVOICE_ID \
  -H "Authorization: Bearer EMPLOYEE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "notes": "Updated my own invoice"
  }'

# Expected: 200 OK
```

### Test 7.6: Invoice Update - Manager Can Modify Any Invoice
```bash
# Manager updates any invoice in their organization

curl -X PUT http://localhost:3000/api/v1/organizations/ORG_ID/invoices/ANY_INVOICE_ID \
  -H "Authorization: Bearer MANAGER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "notes": "Manager override"
  }'

# Expected: 200 OK
```

### Test 7.7: Invoice Cancel - Resource Access Check
```bash
# Try to cancel invoice from different organization

curl -X POST http://localhost:3000/api/v1/organizations/ORG_A_ID/invoices/ORG_B_INVOICE_ID/cancel \
  -H "Authorization: Bearer ORG_A_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "Cancellation request"
  }'

# Expected: 404 Not Found or 403 Forbidden
```

## Automated Testing

### Run Integration Tests
```bash
npm run test:integration -- --testPathPattern="auth|payment|invoice"
```

### Run RBAC Tests
```bash
npm run test:rbac:full
```

## Post-Testing Cleanup

```bash
# Reset rate limiters (restart server or wait for windows to expire)
# Clear test database
npm run prisma:migrate reset
npm run prisma:seed
```

## Success Criteria

All tests should pass with expected results:

- ✅ Weak passwords rejected
- ✅ Password history prevents reuse
- ✅ Password expiration enforced
- ✅ Rate limits trigger at correct thresholds
- ✅ Rate limit violations logged to audit
- ✅ Higher roles can access lower role endpoints
- ✅ Lower roles blocked from higher role endpoints
- ✅ Test tokens only work in test environment
- ✅ Cross-organization resource access blocked
- ✅ Resource ownership enforced correctly

## Troubleshooting

### Rate Limits Not Working
- Check if NODE_ENV=test (rate limits are disabled in test mode)
- Verify express-rate-limit middleware is imported correctly
- Check server logs for middleware execution

### Password Validation Not Working
- Verify validatePasswordStrength is called in auth service
- Check error messages returned to client
- Ensure validation happens before password hashing

### Role Hierarchy Not Working
- Verify authorize() middleware is using the new implementation
- Check roleHierarchy constant is defined
- Ensure routes are using authorize() not old authorization logic

### Resource Access Not Working
- Verify checkResourceAccess/checkResourceOwnership are imported in routes
- Check middleware is placed before controller in route chain
- Ensure resource IDs are correct in test requests
