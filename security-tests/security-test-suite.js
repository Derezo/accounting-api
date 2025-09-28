#!/usr/bin/env node

/**
 * Comprehensive Security Test Suite for Accounting API
 * Bank-level security validation testing
 */

const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class SecurityTestSuite {
    constructor(baseUrl = 'http://localhost:3000') {
        this.baseUrl = baseUrl;
        this.testResults = [];
        this.authTokens = {};
        this.testUsers = {};
        this.organization = null;
    }

    // Utility methods
    log(message, type = 'INFO') {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] [${type}] ${message}`;
        console.log(logMessage);
        this.testResults.push({ timestamp, type, message });
    }

    async makeRequest(method, endpoint, data = null, headers = {}) {
        try {
            const config = {
                method,
                url: `${this.baseUrl}${endpoint}`,
                headers: {
                    'Content-Type': 'application/json',
                    ...headers
                },
                timeout: 10000,
                validateStatus: () => true // Don't throw on any status code
            };

            if (data) {
                config.data = data;
            }

            const response = await axios(config);
            return response;
        } catch (error) {
            return {
                status: 0,
                data: { error: error.message }
            };
        }
    }

    // Test setup
    async setupTestEnvironment() {
        this.log('Setting up test environment...');

        // Test if API is running
        const healthCheck = await this.makeRequest('GET', '/health');
        if (healthCheck.status !== 200) {
            throw new Error('API is not running or not accessible');
        }

        this.log('API health check passed');

        // Create test organization
        await this.createTestOrganization();

        // Create test users with different roles
        await this.createTestUsers();
    }

    async createTestOrganization() {
        const orgData = {
            name: 'Security Test Organization',
            legalName: 'Security Test Corp',
            domain: 'security-test.local',
            email: 'admin@security-test.local',
            phone: '+1-555-0123',
            businessNumber: 'SEC123456789',
            taxNumber: 'TAX987654321'
        };

        const response = await this.makeRequest('POST', '/api/v1/organizations', orgData);

        if (response.status === 201) {
            this.organization = response.data;
            this.log(`Test organization created: ${this.organization.id}`);
        } else {
            this.log(`Failed to create test organization: ${response.status}`, 'ERROR');
        }
    }

    async createTestUsers() {
        const roles = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'EMPLOYEE', 'VIEWER'];

        for (const role of roles) {
            const userData = {
                email: `${role.toLowerCase()}@security-test.local`,
                password: 'SecureTestPassword123!',
                firstName: `Test`,
                lastName: `${role}`,
                role: role,
                organizationId: this.organization?.id
            };

            const response = await this.makeRequest('POST', '/api/v1/auth/register', userData);

            if (response.status === 201) {
                this.testUsers[role] = response.data;
                this.log(`Test user created: ${role}`);

                // Login to get token
                const loginResponse = await this.makeRequest('POST', '/api/v1/auth/login', {
                    email: userData.email,
                    password: userData.password
                });

                if (loginResponse.status === 200) {
                    this.authTokens[role] = loginResponse.data.token;
                    this.log(`Login token obtained for: ${role}`);
                }
            }
        }
    }

    // Authentication bypass tests
    async testAuthenticationBypass() {
        this.log('Testing authentication bypass attempts...', 'TEST');

        const testCases = [
            {
                name: 'No Authorization Header',
                headers: {},
                endpoint: '/api/v1/customers'
            },
            {
                name: 'Invalid Bearer Token',
                headers: { Authorization: 'Bearer invalid_token' },
                endpoint: '/api/v1/customers'
            },
            {
                name: 'Malformed Authorization Header',
                headers: { Authorization: 'InvalidFormat token' },
                endpoint: '/api/v1/customers'
            },
            {
                name: 'Empty Bearer Token',
                headers: { Authorization: 'Bearer ' },
                endpoint: '/api/v1/customers'
            },
            {
                name: 'SQL Injection in Token',
                headers: { Authorization: "Bearer '; DROP TABLE users; --" },
                endpoint: '/api/v1/customers'
            },
            {
                name: 'JWT None Algorithm Attack',
                headers: { Authorization: 'Bearer eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.' },
                endpoint: '/api/v1/customers'
            }
        ];

        for (const testCase of testCases) {
            const response = await this.makeRequest('GET', testCase.endpoint, null, testCase.headers);

            if (response.status === 401) {
                this.log(`✓ ${testCase.name}: Correctly rejected (401)`, 'PASS');
            } else {
                this.log(`✗ ${testCase.name}: Unexpected status ${response.status}`, 'FAIL');
            }
        }
    }

    // Authorization escalation tests
    async testAuthorizationEscalation() {
        this.log('Testing authorization escalation...', 'TEST');

        const testCases = [
            {
                name: 'VIEWER accessing ADMIN endpoints',
                role: 'VIEWER',
                endpoint: '/api/v1/organizations',
                method: 'POST',
                data: { name: 'Evil Org' }
            },
            {
                name: 'EMPLOYEE accessing MANAGER endpoints',
                role: 'EMPLOYEE',
                endpoint: '/api/v1/customers',
                method: 'DELETE',
                data: null
            },
            {
                name: 'ACCOUNTANT accessing ADMIN user management',
                role: 'ACCOUNTANT',
                endpoint: '/api/v1/auth/users',
                method: 'GET',
                data: null
            }
        ];

        for (const testCase of testCases) {
            const token = this.authTokens[testCase.role];
            if (!token) continue;

            const headers = { Authorization: `Bearer ${token}` };
            const response = await this.makeRequest(testCase.method, testCase.endpoint, testCase.data, headers);

            if (response.status === 403) {
                this.log(`✓ ${testCase.name}: Correctly forbidden (403)`, 'PASS');
            } else {
                this.log(`✗ ${testCase.name}: Unexpected status ${response.status}`, 'FAIL');
            }
        }
    }

    // RBAC permission boundary validation
    async testRBACPermissionBoundaries() {
        this.log('Testing RBAC permission boundaries...', 'TEST');

        const rolePermissions = {
            VIEWER: ['GET'],
            EMPLOYEE: ['GET', 'POST'],
            ACCOUNTANT: ['GET', 'POST', 'PUT'],
            MANAGER: ['GET', 'POST', 'PUT', 'DELETE'],
            ADMIN: ['GET', 'POST', 'PUT', 'DELETE'],
            SUPER_ADMIN: ['GET', 'POST', 'PUT', 'DELETE']
        };

        const testEndpoints = [
            '/api/v1/customers',
            '/api/v1/quotes',
            '/api/v1/invoices',
            '/api/v1/payments',
            '/api/v1/projects'
        ];

        for (const [role, allowedMethods] of Object.entries(rolePermissions)) {
            const token = this.authTokens[role];
            if (!token) continue;

            const headers = { Authorization: `Bearer ${token}` };

            for (const endpoint of testEndpoints) {
                for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
                    const response = await this.makeRequest(method, endpoint, {}, headers);

                    const shouldAllow = allowedMethods.includes(method);
                    const actuallyAllowed = response.status !== 403;

                    if (shouldAllow === actuallyAllowed) {
                        this.log(`✓ ${role} ${method} ${endpoint}: Correct permission`, 'PASS');
                    } else {
                        this.log(`✗ ${role} ${method} ${endpoint}: Permission mismatch`, 'FAIL');
                    }
                }
            }
        }
    }

    // SQL Injection tests
    async testSQLInjection() {
        this.log('Testing SQL injection protection...', 'TEST');

        const sqlPayloads = [
            "'; DROP TABLE users; --",
            "' OR '1'='1",
            "' UNION SELECT * FROM users --",
            "'; INSERT INTO users VALUES('hacker', 'password'); --",
            "' AND 1=1 --",
            "' OR 1=1 LIMIT 1 --",
            "') OR '1'='1 --",
            "' WAITFOR DELAY '00:00:10' --"
        ];

        const testEndpoints = [
            { path: '/api/v1/customers', param: 'search' },
            { path: '/api/v1/quotes', param: 'status' },
            { path: '/api/v1/invoices', param: 'customer' }
        ];

        const token = this.authTokens['ADMIN'];
        const headers = { Authorization: `Bearer ${token}` };

        for (const endpoint of testEndpoints) {
            for (const payload of sqlPayloads) {
                const response = await this.makeRequest(
                    'GET',
                    `${endpoint.path}?${endpoint.param}=${encodeURIComponent(payload)}`,
                    null,
                    headers
                );

                // Should not return 500 (internal server error from SQL injection)
                if (response.status !== 500) {
                    this.log(`✓ SQL injection blocked: ${payload}`, 'PASS');
                } else {
                    this.log(`✗ Potential SQL injection: ${payload}`, 'FAIL');
                }
            }
        }
    }

    // XSS Protection tests
    async testXSSProtection() {
        this.log('Testing XSS protection...', 'TEST');

        const xssPayloads = [
            '<script>alert("xss")</script>',
            '"><script>alert("xss")</script>',
            "';alert('xss');//",
            'javascript:alert("xss")',
            '<img src=x onerror=alert("xss")>',
            '<svg onload=alert("xss")>',
            '${alert("xss")}',
            '{{constructor.constructor("alert(\\"xss\\")")()}}'
        ];

        const token = this.authTokens['EMPLOYEE'];
        const headers = { Authorization: `Bearer ${token}` };

        for (const payload of xssPayloads) {
            const customerData = {
                firstName: payload,
                lastName: 'Test',
                email: 'test@example.com',
                phone: '555-0123',
                organizationId: this.organization?.id
            };

            const response = await this.makeRequest('POST', '/api/v1/customers', customerData, headers);

            // Should either sanitize or reject the input
            if (response.status === 400 || (response.status === 201 && !response.data.firstName.includes('<script>'))) {
                this.log(`✓ XSS payload handled: ${payload.substring(0, 30)}...`, 'PASS');
            } else {
                this.log(`✗ XSS payload accepted: ${payload.substring(0, 30)}...`, 'FAIL');
            }
        }
    }

    // Rate limiting tests
    async testRateLimiting() {
        this.log('Testing rate limiting...', 'TEST');

        const endpoint = '/api/v1/auth/login';
        const requestData = {
            email: 'nonexistent@example.com',
            password: 'wrongpassword'
        };

        let rateLimitHit = false;
        const maxRequests = 20; // Should hit rate limit before this

        for (let i = 0; i < maxRequests; i++) {
            const response = await this.makeRequest('POST', endpoint, requestData);

            if (response.status === 429) {
                rateLimitHit = true;
                this.log(`✓ Rate limit hit after ${i + 1} requests`, 'PASS');
                break;
            }

            // Small delay between requests
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        if (!rateLimitHit) {
            this.log(`✗ Rate limit not triggered after ${maxRequests} requests`, 'FAIL');
        }
    }

    // CORS policy enforcement
    async testCORSPolicy() {
        this.log('Testing CORS policy enforcement...', 'TEST');

        const maliciousOrigins = [
            'http://evil.com',
            'https://attacker.org',
            'http://localhost:3001', // Assuming this is not allowed
            null // Missing origin
        ];

        for (const origin of maliciousOrigins) {
            const headers = origin ? { Origin: origin } : {};
            const response = await this.makeRequest('OPTIONS', '/api/v1/customers', null, headers);

            // Check if CORS headers are properly set
            const corsHeader = response.headers?.['access-control-allow-origin'];

            if (!corsHeader || corsHeader !== origin) {
                this.log(`✓ CORS properly restricted for origin: ${origin || 'null'}`, 'PASS');
            } else {
                this.log(`✗ CORS policy too permissive for origin: ${origin || 'null'}`, 'FAIL');
            }
        }
    }

    // Input validation tests
    async testInputValidation() {
        this.log('Testing input validation...', 'TEST');

        const token = this.authTokens['EMPLOYEE'];
        const headers = { Authorization: `Bearer ${token}` };

        const invalidInputs = [
            {
                name: 'Extremely long string',
                data: { firstName: 'A'.repeat(10000), lastName: 'Test', email: 'test@example.com' }
            },
            {
                name: 'Invalid email format',
                data: { firstName: 'Test', lastName: 'User', email: 'not-an-email' }
            },
            {
                name: 'Negative currency amount',
                data: { amount: -1000, currency: 'CAD', customerId: 'test' }
            },
            {
                name: 'Invalid phone number',
                data: { firstName: 'Test', lastName: 'User', phone: 'abc123xyz' }
            },
            {
                name: 'Missing required fields',
                data: { firstName: 'Test' } // Missing required lastName and email
            }
        ];

        for (const testCase of invalidInputs) {
            const response = await this.makeRequest('POST', '/api/v1/customers', testCase.data, headers);

            if (response.status === 400) {
                this.log(`✓ Input validation rejected: ${testCase.name}`, 'PASS');
            } else {
                this.log(`✗ Input validation failed: ${testCase.name} (status: ${response.status})`, 'FAIL');
            }
        }
    }

    // Multi-tenant isolation tests
    async testMultiTenantIsolation() {
        this.log('Testing multi-tenant data isolation...', 'TEST');

        // Create a second organization
        const org2Data = {
            name: 'Second Test Organization',
            email: 'admin@second-test.local',
            phone: '+1-555-0124'
        };

        const org2Response = await this.makeRequest('POST', '/api/v1/organizations', org2Data);
        if (org2Response.status !== 201) {
            this.log('Failed to create second organization for isolation test', 'ERROR');
            return;
        }

        const org2 = org2Response.data;

        // Create user in second organization
        const user2Data = {
            email: 'user@second-test.local',
            password: 'SecureTestPassword123!',
            firstName: 'Test',
            lastName: 'User2',
            role: 'EMPLOYEE',
            organizationId: org2.id
        };

        const user2Response = await this.makeRequest('POST', '/api/v1/auth/register', user2Data);
        if (user2Response.status !== 201) {
            this.log('Failed to create user in second organization', 'ERROR');
            return;
        }

        // Login as user from second organization
        const login2Response = await this.makeRequest('POST', '/api/v1/auth/login', {
            email: user2Data.email,
            password: user2Data.password
        });

        if (login2Response.status !== 200) {
            this.log('Failed to login user from second organization', 'ERROR');
            return;
        }

        const org2Token = login2Response.data.token;

        // Try to access data from first organization using second organization's token
        const headers = { Authorization: `Bearer ${org2Token}` };
        const response = await this.makeRequest('GET', '/api/v1/customers', null, headers);

        // Should not see any customers from the first organization
        if (response.status === 200 && (!response.data || response.data.length === 0)) {
            this.log('✓ Multi-tenant isolation working correctly', 'PASS');
        } else {
            this.log('✗ Multi-tenant isolation breach detected', 'FAIL');
        }
    }

    // Session management tests
    async testSessionManagement() {
        this.log('Testing session management security...', 'TEST');

        const token = this.authTokens['EMPLOYEE'];
        const headers = { Authorization: `Bearer ${token}` };

        // Test 1: Valid token should work
        let response = await this.makeRequest('GET', '/api/v1/customers', null, headers);
        if (response.status === 200) {
            this.log('✓ Valid token accepted', 'PASS');
        } else {
            this.log('✗ Valid token rejected', 'FAIL');
        }

        // Test 2: Logout should invalidate token
        const logoutResponse = await this.makeRequest('POST', '/api/v1/auth/logout', null, headers);
        if (logoutResponse.status === 200) {
            this.log('✓ Logout successful', 'PASS');

            // Test if token is invalidated
            response = await this.makeRequest('GET', '/api/v1/customers', null, headers);
            if (response.status === 401) {
                this.log('✓ Token invalidated after logout', 'PASS');
            } else {
                this.log('✗ Token still valid after logout', 'FAIL');
            }
        } else {
            this.log('✗ Logout failed', 'FAIL');
        }
    }

    // Generate security report
    generateReport() {
        const passCount = this.testResults.filter(r => r.type === 'PASS').length;
        const failCount = this.testResults.filter(r => r.type === 'FAIL').length;
        const totalTests = passCount + failCount;

        const report = {
            summary: {
                timestamp: new Date().toISOString(),
                totalTests,
                passed: passCount,
                failed: failCount,
                successRate: totalTests > 0 ? ((passCount / totalTests) * 100).toFixed(2) + '%' : '0%'
            },
            testResults: this.testResults,
            recommendations: this.generateRecommendations()
        };

        // Save report to file
        const reportPath = path.join(__dirname, `security-report-${Date.now()}.json`);
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

        this.log(`Security report generated: ${reportPath}`);
        return report;
    }

    generateRecommendations() {
        const recommendations = [];

        const failures = this.testResults.filter(r => r.type === 'FAIL');

        if (failures.some(f => f.message.includes('authentication'))) {
            recommendations.push('Strengthen authentication mechanisms and token validation');
        }

        if (failures.some(f => f.message.includes('authorization'))) {
            recommendations.push('Review and tighten authorization controls');
        }

        if (failures.some(f => f.message.includes('SQL injection'))) {
            recommendations.push('Implement parameterized queries and input sanitization');
        }

        if (failures.some(f => f.message.includes('XSS'))) {
            recommendations.push('Add output encoding and Content Security Policy headers');
        }

        if (failures.some(f => f.message.includes('rate limit'))) {
            recommendations.push('Configure and test rate limiting mechanisms');
        }

        if (failures.some(f => f.message.includes('CORS'))) {
            recommendations.push('Review and restrict CORS policy');
        }

        if (failures.some(f => f.message.includes('isolation'))) {
            recommendations.push('Fix multi-tenant data isolation issues');
        }

        return recommendations;
    }

    // Main test runner
    async runAllTests() {
        this.log('Starting comprehensive security test suite...');

        try {
            await this.setupTestEnvironment();

            await this.testAuthenticationBypass();
            await this.testAuthorizationEscalation();
            await this.testRBACPermissionBoundaries();
            await this.testSQLInjection();
            await this.testXSSProtection();
            await this.testRateLimiting();
            await this.testCORSPolicy();
            await this.testInputValidation();
            await this.testMultiTenantIsolation();
            await this.testSessionManagement();

            const report = this.generateReport();

            this.log(`Security testing completed. Score: ${report.summary.successRate}`);

            return report;

        } catch (error) {
            this.log(`Test suite failed: ${error.message}`, 'ERROR');
            throw error;
        }
    }
}

// Export for use as module or run directly
if (require.main === module) {
    const testSuite = new SecurityTestSuite(process.argv[2] || 'http://localhost:3000');
    testSuite.runAllTests()
        .then(report => {
            console.log('\n=== SECURITY TEST SUMMARY ===');
            console.log(`Total Tests: ${report.summary.totalTests}`);
            console.log(`Passed: ${report.summary.passed}`);
            console.log(`Failed: ${report.summary.failed}`);
            console.log(`Success Rate: ${report.summary.successRate}`);

            if (report.recommendations.length > 0) {
                console.log('\n=== RECOMMENDATIONS ===');
                report.recommendations.forEach((rec, i) => {
                    console.log(`${i + 1}. ${rec}`);
                });
            }

            process.exit(report.summary.failed > 0 ? 1 : 0);
        })
        .catch(error => {
            console.error('Security test suite failed:', error);
            process.exit(1);
        });
}

module.exports = SecurityTestSuite;