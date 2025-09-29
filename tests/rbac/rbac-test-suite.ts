import axios, { AxiosResponse, AxiosError } from 'axios';
import { TestData, TestUser, TestOrganization } from './test-data-generator';
import rolePermissionMatrix from './role-permission-matrix.json';

export interface TestResult {
  endpoint: string;
  method: string;
  role: string;
  organizationId: string;
  expected: 'SUCCESS' | 'FORBIDDEN' | 'UNAUTHORIZED';
  actual: 'SUCCESS' | 'FORBIDDEN' | 'UNAUTHORIZED' | 'ERROR';
  statusCode: number;
  passed: boolean;
  error?: string;
  responseTime: number;
}

export interface TestSummary {
  totalTests: number;
  passed: number;
  failed: number;
  successRate: number;
  roleResults: Record<string, { passed: number; failed: number; total: number }>;
  organizationResults: Record<string, { passed: number; failed: number; total: number }>;
  endpointResults: Record<string, { passed: number; failed: number; total: number }>;
  failedTests: TestResult[];
}

/**
 * Comprehensive RBAC Test Suite
 * Validates role-based access control across all API endpoints
 */
export class RBACTestSuite {
  private baseURL: string;
  private testData: TestData;
  private userTokens: Map<string, string> = new Map();
  private results: TestResult[] = [];

  constructor(baseURL: string = 'http://localhost:3000', testData: TestData) {
    this.baseURL = baseURL;
    this.testData = testData;
  }

  /**
   * Authenticate all test users and store tokens
   */
  async authenticateUsers(): Promise<void> {
    console.log('🔐 Authenticating test users...');

    for (const user of this.testData.users) {
      try {
        const response = await axios.post(`${this.baseURL}/api/v1/auth/login`, {
          email: user.email,
          password: user.password
        });

        if (response.data?.tokens?.accessToken) {
          this.userTokens.set(user.id, response.data.tokens.accessToken);
          console.log(`  ✅ ${user.role} (${user.email})`);
        } else {
          console.log(`  ❌ Failed to get token for ${user.email}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.log(`  ❌ Authentication failed for ${user.email}:`, errorMessage);
      }
    }

    console.log(`📊 Authenticated ${this.userTokens.size} out of ${this.testData.users.length} users`);
  }

  /**
   * Get authorization header for user
   */
  private getAuthHeader(userId: string): Record<string, string> {
    const token = this.userTokens.get(userId);
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  /**
   * Make HTTP request with timing
   */
  private async makeRequest(
    method: string,
    url: string,
    headers: Record<string, string> = {},
    data?: any
  ): Promise<{ statusCode: number; responseTime: number; data?: any; error?: string }> {
    const startTime = Date.now();

    try {
      const config = {
        method: method.toLowerCase(),
        url,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        ...(data && { data })
      };

      const response: AxiosResponse = await axios(config);
      const responseTime = Date.now() - startTime;

      return {
        statusCode: response.status,
        responseTime,
        data: response.data
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const axiosError = error as AxiosError;

      return {
        statusCode: axiosError.response?.status || 0,
        responseTime,
        error: axiosError.message
      };
    }
  }

  /**
   * Determine expected result based on role and endpoint
   */
  private getExpectedResult(role: string, endpoint: string, method: string): 'SUCCESS' | 'FORBIDDEN' | 'UNAUTHORIZED' {
    const fullEndpoint = `${method} ${endpoint}`;

    // Public endpoints should always succeed
    if (rolePermissionMatrix.endpoints.public.includes(fullEndpoint)) {
      return 'SUCCESS';
    }

    // Authenticated endpoints require valid token
    if (rolePermissionMatrix.endpoints.authenticated.includes(fullEndpoint)) {
      return 'SUCCESS';
    }

    // Check role-specific access
    switch (role) {
      case 'SUPER_ADMIN':
        return 'SUCCESS'; // SUPER_ADMIN has universal access

      case 'ADMIN':
        if (
          rolePermissionMatrix.endpoints['admin-only'].includes(fullEndpoint) ||
          rolePermissionMatrix.endpoints['admin-manager'].includes(fullEndpoint) ||
          rolePermissionMatrix.endpoints['admin-manager-accountant'].includes(fullEndpoint) ||
          rolePermissionMatrix.endpoints['admin-manager-accountant-employee'].includes(fullEndpoint) ||
          rolePermissionMatrix.endpoints['all-authenticated'].includes(fullEndpoint) ||
          rolePermissionMatrix.endpoints['organization-admin'].includes(fullEndpoint) ||
          rolePermissionMatrix.endpoints['organization-management'].includes(fullEndpoint)
        ) {
          return 'SUCCESS';
        }
        return 'FORBIDDEN';

      case 'MANAGER':
        if (
          rolePermissionMatrix.endpoints['admin-manager'].includes(fullEndpoint) ||
          rolePermissionMatrix.endpoints['admin-manager-accountant'].includes(fullEndpoint) ||
          rolePermissionMatrix.endpoints['admin-manager-accountant-employee'].includes(fullEndpoint) ||
          rolePermissionMatrix.endpoints['all-authenticated'].includes(fullEndpoint) ||
          rolePermissionMatrix.endpoints['organization-management'].includes(fullEndpoint)
        ) {
          return 'SUCCESS';
        }
        return 'FORBIDDEN';

      case 'ACCOUNTANT':
        if (
          rolePermissionMatrix.endpoints['admin-manager-accountant'].includes(fullEndpoint) ||
          rolePermissionMatrix.endpoints['admin-manager-accountant-employee'].includes(fullEndpoint) ||
          rolePermissionMatrix.endpoints['all-authenticated'].includes(fullEndpoint)
        ) {
          return 'SUCCESS';
        }
        return 'FORBIDDEN';

      case 'EMPLOYEE':
        if (
          rolePermissionMatrix.endpoints['admin-manager-accountant-employee'].includes(fullEndpoint) ||
          rolePermissionMatrix.endpoints['all-authenticated'].includes(fullEndpoint)
        ) {
          return 'SUCCESS';
        }
        return 'FORBIDDEN';

      case 'VIEWER':
        if (rolePermissionMatrix.endpoints['all-authenticated'].includes(fullEndpoint)) {
          return 'SUCCESS';
        }
        return 'FORBIDDEN';

      case 'CLIENT':
        if (rolePermissionMatrix.endpoints.authenticated.includes(fullEndpoint)) {
          return 'SUCCESS';
        }
        return 'FORBIDDEN';

      default:
        return 'FORBIDDEN';
    }
  }

  /**
   * Convert status code to result type
   */
  private statusCodeToResult(statusCode: number): 'SUCCESS' | 'FORBIDDEN' | 'UNAUTHORIZED' | 'ERROR' {
    if (statusCode >= 200 && statusCode < 300) return 'SUCCESS';
    if (statusCode === 401) return 'UNAUTHORIZED';
    if (statusCode === 403) return 'FORBIDDEN';
    return 'ERROR';
  }

  /**
   * Generate test request data for different endpoints
   */
  private getTestRequestData(endpoint: string, method: string, organizationId: string): any {
    // Extract the base path without parameters
    const basePath = endpoint.split('/').filter(segment => !segment.startsWith(':')).join('/');

    // Get sample data based on endpoint type
    switch (true) {
      case basePath.includes('accounts'):
        return method === 'POST' ? {
          name: 'Test Account',
          type: 'ASSET',
          code: '9999',
          isActive: true
        } : undefined;

      case basePath.includes('customers'):
        return method === 'POST' ? {
          customerNumber: 'TEST-001',
          tier: 'PERSONAL',
          status: 'ACTIVE',
          creditLimit: 1000,
          paymentTerms: 30,
          taxExempt: false,
          preferredCurrency: 'CAD'
        } : undefined;

      case basePath.includes('invoices'):
        const customer = this.testData.customers.find(c => c.organizationId === organizationId);
        return method === 'POST' ? {
          customerId: customer?.id || 'test-customer-id',
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          depositRequired: 0,
          items: [{
            description: 'Test Service',
            quantity: 1,
            unitPrice: 100,
            taxRate: 0.13
          }],
          terms: 'Test payment terms'
        } : undefined;

      case basePath.includes('quotes'):
        const quoteCustomer = this.testData.customers.find(c => c.organizationId === organizationId);
        return method === 'POST' ? {
          customerId: quoteCustomer?.id || 'test-customer-id',
          validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          items: [{
            description: 'Test Quote Item',
            quantity: 1,
            unitPrice: 100,
            taxRate: 0.13
          }],
          terms: 'Test quote terms'
        } : undefined;

      case basePath.includes('users'):
        return method === 'POST' ? {
          email: `test-${Date.now()}@example.com`,
          firstName: 'Test',
          lastName: 'User',
          role: 'EMPLOYEE',
          password: 'TempPass123!'
        } : undefined;

      default:
        return undefined;
    }
  }

  /**
   * Replace URL parameters with actual test data IDs
   */
  private replaceUrlParameters(endpoint: string, organizationId: string): string {
    let url = endpoint;

    // Replace organization ID parameter
    url = url.replace(':organizationId', organizationId);

    // Replace other common parameters with test data
    if (url.includes(':id')) {
      const invoice = this.testData.invoices.find(i => i.organizationId === organizationId);
      url = url.replace(':id', invoice?.id || 'test-id');
    }

    if (url.includes(':userId')) {
      const user = this.testData.users.find(u => u.organizationId === organizationId);
      url = url.replace(':userId', user?.id || 'test-user-id');
    }

    if (url.includes(':etransferNumber')) {
      url = url.replace(':etransferNumber', 'TEST-ETRANSFER-001');
    }

    return url;
  }

  /**
   * Test access control for a specific endpoint and user
   */
  async testEndpointAccess(
    user: TestUser,
    endpoint: string,
    method: string
  ): Promise<TestResult> {
    const fullUrl = this.replaceUrlParameters(
      `${this.baseURL}/api/v1/organizations/${user.organizationId}${endpoint}`,
      user.organizationId
    );

    const authHeaders = this.getAuthHeader(user.id);
    const requestData = this.getTestRequestData(endpoint, method, user.organizationId);
    const expected = this.getExpectedResult(user.role, endpoint, method);

    const response = await this.makeRequest(method, fullUrl, authHeaders, requestData);
    const actual = this.statusCodeToResult(response.statusCode);
    const passed = expected === actual;

    return {
      endpoint,
      method,
      role: user.role,
      organizationId: user.organizationId,
      expected,
      actual,
      statusCode: response.statusCode,
      passed,
      error: response.error,
      responseTime: response.responseTime
    };
  }

  /**
   * Test cross-organization access restrictions
   */
  async testCrossOrganizationAccess(): Promise<TestResult[]> {
    console.log('🔒 Testing cross-organization access restrictions...');

    const crossOrgResults: TestResult[] = [];
    const primaryOrg = this.testData.organizations[0];
    const secondaryOrg = this.testData.organizations[1];

    // Test users from org A trying to access org B data
    const userFromOrgA = this.testData.users.find(u =>
      u.organizationId === primaryOrg.id && u.role === 'ADMIN'
    );

    if (userFromOrgA) {
      const testEndpoints = [
        { endpoint: '/customers', method: 'GET' },
        { endpoint: '/invoices', method: 'GET' },
        { endpoint: '/payments', method: 'GET' }
      ];

      for (const test of testEndpoints) {
        const fullUrl = `${this.baseURL}/api/v1/organizations/${secondaryOrg.id}${test.endpoint}`;
        const authHeaders = this.getAuthHeader(userFromOrgA.id);

        const response = await this.makeRequest(test.method, fullUrl, authHeaders);
        const actual = this.statusCodeToResult(response.statusCode);

        // Should be FORBIDDEN unless SUPER_ADMIN
        const expected = userFromOrgA.role === 'SUPER_ADMIN' ? 'SUCCESS' : 'FORBIDDEN';
        const passed = expected === actual;

        crossOrgResults.push({
          endpoint: `CROSS-ORG: ${test.endpoint}`,
          method: test.method,
          role: userFromOrgA.role,
          organizationId: secondaryOrg.id,
          expected,
          actual,
          statusCode: response.statusCode,
          passed,
          error: response.error,
          responseTime: response.responseTime
        });
      }
    }

    return crossOrgResults;
  }

  /**
   * Run comprehensive RBAC test suite
   */
  async runTests(): Promise<TestSummary> {
    console.log('🚀 Starting comprehensive RBAC test suite...');

    await this.authenticateUsers();

    // Define test endpoints (subset for comprehensive testing)
    const testEndpoints = [
      // Authentication endpoints
      { endpoint: '/auth/me', method: 'GET' },

      // User management endpoints
      { endpoint: '/users', method: 'GET' },
      { endpoint: '/users', method: 'POST' },

      // Financial endpoints
      { endpoint: '/accounts', method: 'GET' },
      { endpoint: '/accounts', method: 'POST' },
      { endpoint: '/customers', method: 'GET' },
      { endpoint: '/customers', method: 'POST' },
      { endpoint: '/invoices', method: 'GET' },
      { endpoint: '/invoices', method: 'POST' },
      { endpoint: '/quotes', method: 'GET' },
      { endpoint: '/quotes', method: 'POST' },
      { endpoint: '/payments', method: 'GET' },
      { endpoint: '/payments', method: 'POST' },

      // Admin endpoints
      { endpoint: '/audit/logs', method: 'GET' },
      { endpoint: '/audit/logs/export', method: 'GET' },

      // Organization endpoints
      { endpoint: '/organization/current', method: 'GET' },
      { endpoint: '/organization/current', method: 'PUT' }
    ];

    console.log(`📋 Testing ${testEndpoints.length} endpoints across ${this.testData.users.length} users...`);

    // Test each endpoint with each user
    for (const user of this.testData.users) {
      for (const test of testEndpoints) {
        const result = await this.testEndpointAccess(user, test.endpoint, test.method);
        this.results.push(result);
      }
    }

    // Test cross-organization access
    const crossOrgResults = await this.testCrossOrganizationAccess();
    this.results.push(...crossOrgResults);

    return this.generateSummary();
  }

  /**
   * Generate test summary
   */
  private generateSummary(): TestSummary {
    const totalTests = this.results.length;
    const passed = this.results.filter(r => r.passed).length;
    const failed = totalTests - passed;
    const successRate = (passed / totalTests) * 100;

    // Role-based results
    const roleResults: Record<string, { passed: number; failed: number; total: number }> = {};
    for (const role of ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'EMPLOYEE', 'VIEWER', 'CLIENT']) {
      const roleTests = this.results.filter(r => r.role === role);
      roleResults[role] = {
        passed: roleTests.filter(r => r.passed).length,
        failed: roleTests.filter(r => !r.passed).length,
        total: roleTests.length
      };
    }

    // Organization-based results
    const organizationResults: Record<string, { passed: number; failed: number; total: number }> = {};
    for (const org of this.testData.organizations) {
      const orgTests = this.results.filter(r => r.organizationId === org.id);
      organizationResults[org.name] = {
        passed: orgTests.filter(r => r.passed).length,
        failed: orgTests.filter(r => !r.passed).length,
        total: orgTests.length
      };
    }

    // Endpoint-based results
    const endpointResults: Record<string, { passed: number; failed: number; total: number }> = {};
    const uniqueEndpoints = [...new Set(this.results.map(r => `${r.method} ${r.endpoint}`))];
    for (const endpoint of uniqueEndpoints) {
      const endpointTests = this.results.filter(r => `${r.method} ${r.endpoint}` === endpoint);
      endpointResults[endpoint] = {
        passed: endpointTests.filter(r => r.passed).length,
        failed: endpointTests.filter(r => !r.passed).length,
        total: endpointTests.length
      };
    }

    return {
      totalTests,
      passed,
      failed,
      successRate,
      roleResults,
      organizationResults,
      endpointResults,
      failedTests: this.results.filter(r => !r.passed)
    };
  }

  /**
   * Export detailed test results
   */
  async exportResults(summary: TestSummary): Promise<void> {
    const fs = await import('fs/promises');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    // Export detailed results
    await fs.writeFile(
      `/home/eric/Projects/accounting-api/tests/rbac/rbac-test-results-${timestamp}.json`,
      JSON.stringify({
        summary,
        detailedResults: this.results
      }, null, 2)
    );

    // Export summary report
    const report = this.generateHTMLReport(summary);
    await fs.writeFile(
      `/home/eric/Projects/accounting-api/tests/rbac/rbac-test-report-${timestamp}.html`,
      report
    );

    console.log(`📄 Test results exported with timestamp: ${timestamp}`);
  }

  /**
   * Generate HTML test report
   */
  private generateHTMLReport(summary: TestSummary): string {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>RBAC Test Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .summary { background: #f5f5f5; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
        .success { color: #28a745; }
        .failure { color: #dc3545; }
        table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
        .passed { background-color: #d4edda; }
        .failed { background-color: #f8d7da; }
    </style>
</head>
<body>
    <h1>RBAC Test Report</h1>

    <div class="summary">
        <h2>Test Summary</h2>
        <p><strong>Total Tests:</strong> ${summary.totalTests}</p>
        <p><strong>Passed:</strong> <span class="success">${summary.passed}</span></p>
        <p><strong>Failed:</strong> <span class="failure">${summary.failed}</span></p>
        <p><strong>Success Rate:</strong> ${summary.successRate.toFixed(2)}%</p>
    </div>

    <h2>Results by Role</h2>
    <table>
        <tr><th>Role</th><th>Passed</th><th>Failed</th><th>Total</th><th>Success Rate</th></tr>
        ${Object.entries(summary.roleResults).map(([role, results]) => `
        <tr>
            <td>${role}</td>
            <td class="success">${results.passed}</td>
            <td class="failure">${results.failed}</td>
            <td>${results.total}</td>
            <td>${results.total > 0 ? ((results.passed / results.total) * 100).toFixed(1) : 0}%</td>
        </tr>
        `).join('')}
    </table>

    <h2>Failed Tests</h2>
    <table>
        <tr><th>Endpoint</th><th>Method</th><th>Role</th><th>Expected</th><th>Actual</th><th>Status Code</th></tr>
        ${summary.failedTests.map(test => `
        <tr class="failed">
            <td>${test.endpoint}</td>
            <td>${test.method}</td>
            <td>${test.role}</td>
            <td>${test.expected}</td>
            <td>${test.actual}</td>
            <td>${test.statusCode}</td>
        </tr>
        `).join('')}
    </table>
</body>
</html>`;
  }
}

export default RBACTestSuite;