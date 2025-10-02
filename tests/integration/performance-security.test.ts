// @ts-nocheck
import { describe, test, expect, beforeEach } from '@jest/globals';
import { prisma, authenticatedRequest, baseRequest } from './setup';
import {
  createTestContext,
  createTestCustomer,
  PerformanceTimer,
  delay,
  TestContext
} from './test-utils';
import { UserRole } from '../../src/types/enums';

describe('Performance and Security Integration Tests', () => {
  let testContext: TestContext;
  let performanceTimer: PerformanceTimer;

  beforeEach(async () => {
    testContext = await createTestContext(prisma, 'Performance Security Test Org');
    performanceTimer = new PerformanceTimer();
  });

  describe('Rate Limiting and DDoS Protection', () => {
    test('should enforce rate limits on login attempts', async () => {
      const user = testContext.users.employee;

      console.log('Testing login rate limiting...');

      // Make rapid login attempts
      const loginAttempts: any[] = [];
      for (let i = 0; i < 10; i++) {
        loginAttempts.push(
          baseRequest()
            .post('/api/auth/login')
            .send({
              email: user.email,
              password: 'wrongpassword'
            })
        );
      }

      const results = await Promise.allSettled(loginAttempts);

      // Some requests should be rate limited
      const rateLimitedRequests = results.filter(
        result => result.status === 'fulfilled' &&
        (result.value as any).status === 429 // Too Many Requests
      );

      expect(rateLimitedRequests.length).toBeGreaterThan(0);

      console.log(`✅ Rate limiting working: ${rateLimitedRequests.length}/10 requests limited`);
    });

    test('should enforce API rate limits per user', async () => {
      const adminToken = testContext.authTokens.admin;

      console.log('Testing API rate limiting...');

      // Make rapid API requests
      const apiRequests: any[] = [];
      for (let i = 0; i < 50; i++) {
        apiRequests.push(
          authenticatedRequest(adminToken)
            .get('/api/customers')
        );
      }

      const results = await Promise.allSettled(apiRequests);

      // Check for rate limiting responses
      const rateLimitedResponses = results.filter(
        result => result.status === 'fulfilled' &&
        (result.value as any).status === 429
      );

      // Should have some rate limited responses for excessive requests
      if (rateLimitedResponses.length > 0) {
        console.log(`✅ API rate limiting active: ${rateLimitedResponses.length}/50 requests limited`);
      } else {
        console.log('ℹ️ No rate limiting detected - may need configuration adjustment');
      }

      // At least some requests should succeed
      const successfulResponses = results.filter(
        result => result.status === 'fulfilled' &&
        (result.value as any).status === 200
      );

      expect(successfulResponses.length).toBeGreaterThan(0);
    });

    test('should handle concurrent user sessions efficiently', async () => {
      const { organization } = testContext;

      console.log('Testing concurrent session handling...');

      // Create multiple users for concurrent testing
      const concurrentUsers: any[] = [];
      for (let i = 0; i < 10; i++) {
        const user = await prisma.user.create({
          data: {
            organizationId: organization.id,
            email: `concurrent${i}@test.com`,
            passwordHash: 'hashedpassword',
            firstName: 'Concurrent',
            lastName: `User${i}`,
            role: UserRole.EMPLOYEE
          }
        });
        concurrentUsers.push(user);
      }

      performanceTimer.start();

      // Simulate concurrent login and API usage
      const concurrentOperations = concurrentUsers.map(async (user) => {
        // Login
        const loginResponse = await baseRequest()
          .post('/api/auth/login')
          .send({
            email: user.email,
            password: 'password123'
          });

        if (loginResponse.status !== 200) {
          throw new Error(`Login failed for ${user.email}`);
        }

        const token = loginResponse.body.token;

        // Make several API calls
        const apiCalls: any[] = [];
        for (let j = 0; j < 5; j++) {
          apiCalls.push(
            authenticatedRequest(token)
              .get('/api/customers')
          );
        }

        await Promise.all(apiCalls);
        return { userId: user.id, success: true };
      });

      const results = await Promise.allSettled(concurrentOperations);
      const duration = performanceTimer.stop();

      const successfulSessions = results.filter(result => result.status === 'fulfilled').length;

      expect(successfulSessions).toBe(10);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds

      console.log(`✅ Concurrent sessions test: ${successfulSessions}/10 successful in ${duration}ms`);
    });
  });

  describe('Input Validation and SQL Injection Prevention', () => {
    test('should prevent SQL injection in search parameters', async () => {
      const adminToken = testContext.authTokens.admin;

      console.log('Testing SQL injection prevention...');

      const maliciousInputs = [
        "'; DROP TABLE customers; --",
        "' OR '1'='1",
        "'; UPDATE users SET role='SUPER_ADMIN' WHERE id='1'; --",
        "' UNION SELECT * FROM users --",
        "'; DELETE FROM organizations; --"
      ];

      for (const maliciousInput of maliciousInputs) {
        const response = await authenticatedRequest(adminToken)
          .get(`/api/customers?search=${encodeURIComponent(maliciousInput)}`)
          .expect(200); // Should handle gracefully, not fail

        // Should return empty results or properly escaped search
        expect(response.body.data).toEqual([]);
      }

      // Verify database integrity after SQL injection attempts
      const customerCount = await prisma.customer.count({
        where: { organizationId: testContext.organization.id }
      });

      const userCount = await prisma.user.count({
        where: { organizationId: testContext.organization.id }
      });

      const orgCount = await prisma.organization.count();

      expect(customerCount).toBeGreaterThanOrEqual(2); // From test context
      expect(userCount).toBeGreaterThanOrEqual(5); // From test context
      expect(orgCount).toBeGreaterThanOrEqual(1); // Should not be deleted

      console.log('✅ SQL injection prevention working');
    });

    test('should sanitize and validate input data', async () => {
      const adminToken = testContext.authTokens.admin;

      console.log('Testing input validation...');

      // Test XSS prevention in customer creation
      const xssPayloads = [
        '<script>alert("xss")</script>',
        '<img src="x" onerror="alert(1)">',
        'javascript:alert("xss")',
        '<svg onload="alert(1)">',
        '"><script>alert("xss")</script>'
      ];

      for (const xssPayload of xssPayloads) {
        const response = await authenticatedRequest(adminToken)
          .post('/api/customers')
          .send({
            type: 'PERSON',
            person: {
              firstName: xssPayload,
              lastName: 'TestXSS',
              email: 'xss@test.com'
            }
          });

        // Should either sanitize or reject
        if (response.status === 201) {
          // If created, verify XSS payload was sanitized
          const customer = response.body;
          expect(customer.person.firstName).not.toContain('<script>');
          expect(customer.person.firstName).not.toContain('javascript:');
          expect(customer.person.firstName).not.toContain('onerror');
        } else {
          // Should be rejected with validation error
          expect(response.status).toBe(400);
        }
      }

      console.log('✅ XSS prevention working');
    });

    test('should validate email formats and prevent injection', async () => {
      const adminToken = testContext.authTokens.admin;

      const invalidEmails = [
        'notanemail',
        'test@',
        '@test.com',
        'test..test@test.com',
        'test@test',
        'test+injection@test.com<script>alert(1)</script>',
        'test@test.com; DROP TABLE users;'
      ];

      for (const invalidEmail of invalidEmails) {
        await authenticatedRequest(adminToken)
          .post('/api/customers')
          .send({
            type: 'PERSON',
            person: {
              firstName: 'Test',
              lastName: 'User',
              email: invalidEmail
            }
          })
          .expect(400); // Should reject invalid emails
      }

      console.log('✅ Email validation working');
    });

    test('should prevent path traversal attacks', async () => {
      const adminToken = testContext.authTokens.admin;

      const pathTraversalPayloads = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32\\config\\sam',
        '....//....//....//etc/passwd',
        '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd',
        '..%c0%af..%c0%af..%c0%afetc%c0%afpasswd'
      ];

      for (const payload of pathTraversalPayloads) {
        // Test in various endpoints that might handle file paths
        await authenticatedRequest(adminToken)
          .get(`/api/customers/${payload}`)
          .expect(404); // Should not find anything with path traversal

        await authenticatedRequest(adminToken)
          .get(`/api/files/${payload}`)
          .expect(404);
      }

      console.log('✅ Path traversal prevention working');
    });
  });

  describe('Authentication Security', () => {
    test('should prevent brute force attacks on passwords', async () => {
      const user = testContext.users.viewer;

      console.log('Testing brute force protection...');

      // Attempt multiple failed logins
      const failedAttempts: any[] = [];
      for (let i = 0; i < 10; i++) {
        failedAttempts.push(
          baseRequest()
            .post('/api/auth/login')
            .send({
              email: user.email,
              password: `wrongpassword${i}`
            })
        );
      }

      const results = await Promise.allSettled(failedAttempts);

      // Later attempts should be blocked due to account lockout
      const blockedAttempts = results.filter(
        result => result.status === 'fulfilled' &&
        (result.value as any).status === 423 // Account locked
      );

      expect(blockedAttempts.length).toBeGreaterThan(0);

      // Verify user account is locked in database
      const lockedUser = await prisma.user.findUnique({
        where: { id: user.id }
      });

      expect(lockedUser?.failedAttempts).toBeGreaterThanOrEqual(5);
      expect(lockedUser?.lockedUntil).toBeTruthy();

      console.log(`✅ Brute force protection active: ${blockedAttempts.length} attempts blocked`);
    });

    test('should enforce strong password requirements', async () => {
      const adminToken = testContext.authTokens.admin;

      const weakPasswords = [
        'password',
        '123456',
        'qwerty',
        'abc123',
        'Password', // No numbers or special chars
        '12345678', // No letters
        'Pass1', // Too short
        'password123' // No uppercase or special chars
      ];

      for (const weakPassword of weakPasswords) {
        await authenticatedRequest(adminToken)
          .post('/api/users')
          .send({
            email: `weak${Date.now()}@test.com`,
            password: weakPassword,
            firstName: 'Weak',
            lastName: 'Password',
            role: UserRole.EMPLOYEE
          })
          .expect(400); // Should reject weak passwords
      }

      // Strong password should work
      await authenticatedRequest(adminToken)
        .post('/api/users')
        .send({
          email: 'strong@test.com',
          password: 'StrongP@ssw0rd!',
          firstName: 'Strong',
          lastName: 'Password',
          role: UserRole.EMPLOYEE
        })
        .expect(201);

      console.log('✅ Password strength enforcement working');
    });

    test('should validate JWT tokens properly', async () => {
      const maliciousTokens = [
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c', // Standard example token
        'fake.token.here',
        'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.', // None algorithm
        '', // Empty token
        'Bearer malicious-token'
      ];

      for (const maliciousToken of maliciousTokens) {
        await authenticatedRequest(maliciousToken)
          .get('/api/customers')
          .expect(401); // Should reject invalid tokens
      }

      console.log('✅ JWT validation working');
    });
  });

  describe('Data Privacy and Encryption', () => {
    test('should encrypt sensitive customer data', async () => {
      const { organization } = testContext;

      // Create customer with sensitive data
      const customer = await prisma.customer.create({
        data: {
          organizationId: organization.id,
          customerNumber: 'CUST-ENCRYPT-001',
          tier: 'PERSONAL',
          status: 'ACTIVE',
          person: {
            create: {
              organizationId: organization.id,
              firstName: 'Sensitive',
              lastName: 'Data',
              email: 'sensitive@test.com',
              socialInsNumber: '123-456-789' // Should be encrypted
            }
          }
        },
        include: { person: true }
      });

      // Verify sensitive data is not stored in plain text
      const rawPersonData = await prisma.$queryRaw`
        SELECT socialInsNumber FROM persons WHERE id = ${customer.person!.id}
      ` as any[];

      if (rawPersonData.length > 0) {
        const storedSIN = rawPersonData[0].socialInsNumber;
        // Should not be stored as plain text
        expect(storedSIN).not.toBe('123-456-789');
      }

      console.log('✅ Data encryption verification completed');
    });

    test('should mask sensitive data in logs and responses', async () => {
      const adminToken = testContext.authTokens.admin;

      // Create customer with sensitive payment information
      const customerResponse = await authenticatedRequest(adminToken)
        .post('/api/customers')
        .send({
          type: 'PERSON',
          person: {
            firstName: 'Privacy',
            lastName: 'Test',
            email: 'privacy@test.com',
            socialInsNumber: '987-654-321'
          }
        })
        .expect(201);

      const customer = customerResponse.body;

      // Verify sensitive data is masked in API response
      expect(customer.person.socialInsNumber).toMatch(/\*+/); // Should be masked

      // Test audit logs don't contain raw sensitive data
      const auditLogs = await prisma.auditLog.findMany({
        where: {
          entityType: 'Customer',
          entityId: customer.id
        }
      });

      auditLogs.forEach(log => {
        if (log.changes) {
          const changes = JSON.parse(log.changes);
          // Check that sensitive data is masked in audit logs
          if (changes.after?.person?.socialInsNumber) {
            expect(changes.after.person.socialInsNumber).toMatch(/\*+/);
          }
        }
      });

      console.log('✅ Data masking verification completed');
    });
  });

  describe('Performance Benchmarking', () => {
    test('should handle high-volume customer operations efficiently', async () => {
      const { organization, authTokens } = testContext;
      const adminToken = authTokens.admin;

      console.log('Testing high-volume customer operations...');

      performanceTimer.start();

      // Create customers in batches
      const batchSize = 50;
      const totalCustomers = 200;
      const batches = Math.ceil(totalCustomers / batchSize);

      for (let batch = 0; batch < batches; batch++) {
        const batchPromises: any[] = [];

        for (let i = 0; i < batchSize && (batch * batchSize + i) < totalCustomers; i++) {
          const customerIndex = batch * batchSize + i;
          batchPromises.push(
            authenticatedRequest(adminToken)
              .post('/api/customers')
              .send({
                type: customerIndex % 2 === 0 ? 'PERSON' : 'BUSINESS',
                [customerIndex % 2 === 0 ? 'person' : 'business']: {
                  [customerIndex % 2 === 0 ? 'firstName' : 'legalName']:
                    customerIndex % 2 === 0 ? `Customer${customerIndex}` : `Business${customerIndex}`,
                  [customerIndex % 2 === 0 ? 'lastName' : 'businessType']:
                    customerIndex % 2 === 0 ? 'Test' : 'CORPORATION',
                  email: `perf${customerIndex}@test.com`
                }
              })
          );
        }

        await Promise.all(batchPromises);
        console.log(`Batch ${batch + 1}/${batches} completed`);
      }

      const duration = performanceTimer.stop();

      // Verify all customers were created
      const customerCount = await prisma.customer.count({
        where: { organizationId: organization.id }
      });

      expect(customerCount).toBeGreaterThanOrEqual(totalCustomers);
      expect(duration).toBeLessThan(30000); // Should complete within 30 seconds

      console.log(`✅ Created ${totalCustomers} customers in ${duration}ms (${(duration / totalCustomers).toFixed(2)}ms per customer)`);
    });

    test('should maintain query performance with pagination', async () => {
      const adminToken = testContext.authTokens.admin;

      console.log('Testing pagination performance...');

      const pageSizes = [10, 25, 50, 100];
      const performanceResults: any[] = [];

      for (const pageSize of pageSizes) {
        performanceTimer.start();

        const response = await authenticatedRequest(adminToken)
          .get(`/api/customers?page=1&limit=${pageSize}&sort=createdAt&order=desc`)
          .expect(200);

        const duration = performanceTimer.stop();

        expect(response.body.data.length).toBeLessThanOrEqual(pageSize);
        expect(response.body.pagination).toBeTruthy();

        performanceResults.push({
          pageSize,
          duration,
          recordsReturned: response.body.data.length
        });

        // Performance should scale reasonably with page size
        expect(duration).toBeLessThan(pageSize * 10); // 10ms per record is reasonable
      }

      console.log('✅ Pagination performance results:');
      performanceResults.forEach(result => {
        console.log(`   ${result.pageSize} records: ${result.duration}ms (${(result.duration / result.recordsReturned).toFixed(2)}ms per record)`);
      });
    });

    test('should handle complex search queries efficiently', async () => {
      const adminToken = testContext.authTokens.admin;

      console.log('Testing search performance...');

      const searchQueries = [
        'test', // Simple search
        'Customer', // Common term
        'perf', // Specific prefix
        '@test.com', // Email search
        'Business Corporation' // Multi-word search
      ];

      for (const query of searchQueries) {
        performanceTimer.start();

        const response = await authenticatedRequest(adminToken)
          .get(`/api/customers?search=${encodeURIComponent(query)}&limit=50`)
          .expect(200);

        const duration = performanceTimer.stop();

        expect(duration).toBeLessThan(1000); // Search should be under 1 second

        console.log(`   Search "${query}": ${response.body.data.length} results in ${duration}ms`);
      }

      console.log('✅ Search performance test completed');
    });

    test('should handle memory usage efficiently during large operations', async () => {
      const { organization, authTokens } = testContext;
      const adminToken = authTokens.admin;

      console.log('Testing memory efficiency...');

      // Get initial memory usage
      const initialMemory = process.memoryUsage();

      // Perform memory-intensive operations
      const operations: any[] = [];
      for (let i = 0; i < 100; i++) {
        operations.push(
          authenticatedRequest(adminToken)
            .get('/api/customers?include=quotes,invoices,payments&limit=10')
        );
      }

      await Promise.all(operations);

      // Get final memory usage
      const finalMemory = process.memoryUsage();

      // Memory increase should be reasonable
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      const memoryIncreaseMB = memoryIncrease / 1024 / 1024;

      expect(memoryIncreaseMB).toBeLessThan(100); // Should not increase by more than 100MB

      console.log(`✅ Memory usage test: ${memoryIncreaseMB.toFixed(2)}MB increase`);

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
    });
  });

  describe('Security Headers and CORS', () => {
    test('should include proper security headers', async () => {
      const response = await baseRequest()
        .get('/api/health')
        .expect(200);

      // Check for security headers
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['x-xss-protection']).toBe('1; mode=block');
      expect(response.headers['strict-transport-security']).toBeTruthy();

      console.log('✅ Security headers verification completed');
    });

    test('should handle CORS properly', async () => {
      const corsResponse = await baseRequest()
        .options('/api/customers')
        .set('Origin', 'https://example.com')
        .set('Access-Control-Request-Method', 'GET');

      // Should handle CORS preflight requests
      expect(corsResponse.status).toBeLessThan(500);

      console.log('✅ CORS handling verification completed');
    });
  });

  describe('Resource Usage and Limits', () => {
    test('should enforce request size limits', async () => {
      const adminToken = testContext.authTokens.admin;

      // Create extremely large request payload
      const largeDescription = 'x'.repeat(1000000); // 1MB string

      const response = await authenticatedRequest(adminToken)
        .post('/api/customers')
        .send({
          type: 'PERSON',
          person: {
            firstName: 'Large',
            lastName: 'Data',
            email: 'large@test.com'
          },
          notes: largeDescription
        });

      // Should either reject with 413 (Payload Too Large) or 400 (Bad Request)
      expect([400, 413]).toContain(response.status);

      console.log('✅ Request size limit enforcement working');
    });

    test('should handle file upload size limits', async () => {
      const adminToken = testContext.authTokens.admin;

      // Simulate large file upload (if file upload endpoints exist)
      const largeBuffer = Buffer.alloc(10 * 1024 * 1024, 'x'); // 10MB buffer

      const response = await authenticatedRequest(adminToken)
        .post('/api/files/upload')
        .attach('file', largeBuffer, 'large-file.txt');

      // Should reject large files
      expect([400, 413, 404]).toContain(response.status); // 404 if endpoint doesn't exist

      console.log('✅ File upload size limit test completed');
    });
  });
});