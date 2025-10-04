import axios, { AxiosResponse, AxiosError } from 'axios';
import { TestData, TestUser, TestOrganization } from './test-data-generator';
import rolePermissionMatrix from './role-permission-matrix.json';
import workflowMapping from './workflow-role-mapping.json';

export interface WorkflowTestResult {
  workflowName: string;
  organizationId: string;
  stages: WorkflowStageResult[];
  passed: boolean;
  totalStages: number;
  completedStages: number;
  failedAt?: string;
  executionTime: number;
}

export interface WorkflowStageResult {
  stageName: string;
  role: string;
  endpoint: string;
  method: string;
  expected: 'SUCCESS' | 'FORBIDDEN' | 'BAD_REQUEST';
  actual: 'SUCCESS' | 'FORBIDDEN' | 'BAD_REQUEST' | 'ERROR';
  statusCode: number;
  passed: boolean;
  responseTime: number;
  businessRule?: string;
  error?: string;
  responseData?: any;
}

export interface BusinessProcessTestResult {
  processName: string;
  organizationId: string;
  userId: string;
  role: string;
  expected: 'SUCCESS' | 'FORBIDDEN' | 'BAD_REQUEST';
  actual: 'SUCCESS' | 'FORBIDDEN' | 'BAD_REQUEST' | 'ERROR';
  statusCode: number;
  passed: boolean;
  businessReason: string;
  responseTime: number;
  error?: string;
}

/**
 * Enhanced RBAC Test Suite with Workflow-Based Testing
 * Tests complete business processes and role-specific workflows
 */
export class WorkflowRBACTestSuite {
  private baseURL: string;
  private testData: TestData;
  private userTokens: Map<string, string> = new Map();
  private workflowResults: WorkflowTestResult[] = [];
  private businessProcessResults: BusinessProcessTestResult[] = [];

  constructor(baseURL: string = 'http://localhost:3000', testData: TestData) {
    this.baseURL = baseURL;
    this.testData = testData;
  }

  /**
   * Authenticate all test users and store tokens
   */
  async authenticateUsers(): Promise<void> {
    console.log('🔐 Authenticating test users for workflow testing...');

    for (const user of this.testData.users) {
      try {
        const response = await axios.post(`${this.baseURL}/api/v1/auth/login`, {
          email: user.email,
          password: user.password
        });

        if (response.data?.tokens?.accessToken) {
          this.userTokens.set(user.id, response.data.tokens.accessToken);
          console.log(`  ✅ ${user.role} (${user.email})`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.log(`  ❌ Authentication failed for ${user.email}:`, errorMessage);
      }
    }

    console.log(`📊 Authenticated ${this.userTokens.size} users for workflow testing`);
  }

  /**
   * Test complete 8-stage customer lifecycle workflow
   */
  async testCustomerLifecycleWorkflow(organizationId: string): Promise<WorkflowTestResult> {
    console.log('🔄 Testing complete customer lifecycle workflow...');

    const startTime = Date.now();
    const stages: WorkflowStageResult[] = [];
    let currentCustomerId: string | undefined;
    let currentQuoteId: string | undefined;
    let currentInvoiceId: string | undefined;
    let currentProjectId: string | undefined;

    // Stage 1: Quote Creation (EMPLOYEE)
    const employeeUser = this.getUserByRole(organizationId, 'EMPLOYEE');
    if (employeeUser) {
      // Create customer first
      const customerStage = await this.executeWorkflowStage(
        'create_customer',
        'EMPLOYEE',
        'POST',
        `/organizations/${organizationId}/customers`,
        employeeUser.id,
        {
          customerNumber: `WF-${Date.now()}`,
          tier: 'PERSONAL',
          status: 'ACTIVE',
          firstName: 'Workflow',
          lastName: 'Test',
          email: `workflow-test-${Date.now()}@example.com`,
          creditLimit: 1000,
          paymentTerms: 30,
          taxExempt: false,
          preferredCurrency: 'CAD'
        }
      );
      stages.push(customerStage);

      if (customerStage.passed && customerStage.responseData?.id) {
        currentCustomerId = customerStage.responseData.id;

        // Create quote
        const quoteStage = await this.executeWorkflowStage(
          'create_quote',
          'EMPLOYEE',
          'POST',
          `/organizations/${organizationId}/quotes`,
          employeeUser.id,
          {
            customerId: currentCustomerId,
            validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            items: [{
              description: 'Workflow Test Service',
              quantity: 1,
              unitPrice: 500,
              taxRate: 0.13
            }],
            terms: 'Workflow test terms'
          }
        );
        stages.push(quoteStage);

        if (quoteStage.passed && quoteStage.responseData?.id) {
          currentQuoteId = quoteStage.responseData.id;
        }
      }
    }

    // Stage 2: Quote Acceptance (MANAGER)
    const managerUser = this.getUserByRole(organizationId, 'MANAGER');
    if (managerUser && currentQuoteId) {
      const acceptStage = await this.executeWorkflowStage(
        'accept_quote',
        'MANAGER',
        'POST',
        `/organizations/${organizationId}/quotes/${currentQuoteId}/accept`,
        managerUser.id
      );
      stages.push(acceptStage);
    }

    // Stage 3: Invoice Generation (EMPLOYEE)
    if (employeeUser && currentQuoteId) {
      const invoiceStage = await this.executeWorkflowStage(
        'generate_invoice',
        'EMPLOYEE',
        'POST',
        `/organizations/${organizationId}/invoices/from-quote`,
        employeeUser.id,
        { quoteId: currentQuoteId }
      );
      stages.push(invoiceStage);

      if (invoiceStage.passed && invoiceStage.responseData?.id) {
        currentInvoiceId = invoiceStage.responseData.id;
      }
    }

    // Stage 4: Payment Processing (ACCOUNTANT)
    const accountantUser = this.getUserByRole(organizationId, 'ACCOUNTANT');
    if (accountantUser && currentInvoiceId && currentCustomerId) {
      const paymentStage = await this.executeWorkflowStage(
        'process_payment',
        'ACCOUNTANT',
        'POST',
        `/organizations/${organizationId}/payments`,
        accountantUser.id,
        {
          customerId: currentCustomerId,
          invoiceId: currentInvoiceId,
          amount: 250, // 50% deposit
          method: 'BANK_TRANSFER',
          reference: `WF-PAY-${Date.now()}`
        }
      );
      stages.push(paymentStage);
    }

    // Stage 5: Project Creation (EMPLOYEE)
    if (employeeUser && currentCustomerId) {
      const projectStage = await this.executeWorkflowStage(
        'create_project',
        'EMPLOYEE',
        'POST',
        `/organizations/${organizationId}/projects`,
        employeeUser.id,
        {
          name: 'Workflow Test Project',
          customerId: currentCustomerId,
          status: 'ACTIVE',
          startDate: new Date().toISOString(),
          estimatedBudget: 500
        }
      );
      stages.push(projectStage);

      if (projectStage.passed && projectStage.responseData?.id) {
        currentProjectId = projectStage.responseData.id;
      }
    }

    // Stage 6: Project Completion (MANAGER)
    if (managerUser && currentProjectId) {
      const completeStage = await this.executeWorkflowStage(
        'complete_project',
        'MANAGER',
        'POST',
        `/organizations/${organizationId}/projects/${currentProjectId}/complete`,
        managerUser.id
      );
      stages.push(completeStage);
    }

    const executionTime = Date.now() - startTime;
    const passed = stages.every(stage => stage.passed);
    const completedStages = stages.filter(stage => stage.passed).length;
    const failedAt = stages.find(stage => !stage.passed)?.stageName;

    return {
      workflowName: 'customer_lifecycle',
      organizationId,
      stages,
      passed,
      totalStages: stages.length,
      completedStages,
      failedAt,
      executionTime
    };
  }

  /**
   * Test role violation scenarios
   */
  async testRoleViolations(organizationId: string): Promise<BusinessProcessTestResult[]> {
    console.log('🚫 Testing role violation scenarios...');

    const results: BusinessProcessTestResult[] = [];
    const violations = workflowMapping.workflowTestScenarios.roleViolationTests;

    for (const violation of violations) {
      const user = this.getUserByRole(organizationId, violation.role);
      if (!user) continue;

      const startTime = Date.now();

      try {
        // Extract endpoint parts
        const [method, endpoint] = violation.action.split(' ');
        const fullUrl = `${this.baseURL}/api/v1${endpoint.replace(':id', 'test-id')}`;
        const token = this.userTokens.get(user.id);

        if (!token) {
          results.push({
            processName: violation.name,
            organizationId,
            userId: user.id,
            role: violation.role,
            expected: violation.expectedResult as any,
            actual: 'ERROR',
            statusCode: 0,
            passed: false,
            businessReason: violation.businessReason,
            responseTime: Date.now() - startTime,
            error: 'No authentication token'
          });
          continue;
        }

        const response = await axios({
          method: method.toLowerCase() as any,
          url: fullUrl,
          headers: { Authorization: `Bearer ${token}` },
          data: method !== 'GET' ? { testData: true } : undefined,
          validateStatus: () => true
        });

        const actual = this.statusCodeToResult(response.status);
        const expected = violation.expectedResult as any;
        const passed = expected === actual;

        results.push({
          processName: violation.name,
          organizationId,
          userId: user.id,
          role: violation.role,
          expected,
          actual,
          statusCode: response.status,
          passed,
          businessReason: violation.businessReason,
          responseTime: Date.now() - startTime
        });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        results.push({
          processName: violation.name,
          organizationId,
          userId: user.id,
          role: violation.role,
          expected: violation.expectedResult as any,
          actual: 'ERROR',
          statusCode: 0,
          passed: false,
          businessReason: violation.businessReason,
          responseTime: Date.now() - startTime,
          error: errorMessage
        });
      }
    }

    return results;
  }

  /**
   * Test client-specific access restrictions
   */
  async testClientAccessRestrictions(organizationId: string): Promise<BusinessProcessTestResult[]> {
    console.log('👤 Testing client access restrictions...');

    const results: BusinessProcessTestResult[] = [];
    const clientUser = this.getUserByRole(organizationId, 'CLIENT');

    if (!clientUser) {
      console.log('⚠️  No CLIENT user found for testing');
      return results;
    }

    // Test 1: CLIENT trying to create quotes (should fail)
    const createQuoteTest = await this.testBusinessProcess(
      'client_create_quote_violation',
      clientUser,
      'POST',
      `/organizations/${organizationId}/quotes`,
      { testData: true },
      'FORBIDDEN',
      'Clients cannot create their own quotes'
    );
    results.push(createQuoteTest);

    // Test 2: CLIENT trying to access user management (should fail)
    const userMgmtTest = await this.testBusinessProcess(
      'client_user_management_violation',
      clientUser,
      'GET',
      `/organizations/${organizationId}/users`,
      undefined,
      'FORBIDDEN',
      'Clients cannot access user management'
    );
    results.push(userMgmtTest);

    // Test 3: CLIENT accessing own profile (should succeed)
    const profileTest = await this.testBusinessProcess(
      'client_own_profile_access',
      clientUser,
      'GET',
      `/auth/me`,
      undefined,
      'SUCCESS',
      'Clients can access their own profile'
    );
    results.push(profileTest);

    return results;
  }

  /**
   * Test business process integrity rules
   */
  async testBusinessProcessIntegrity(organizationId: string): Promise<BusinessProcessTestResult[]> {
    console.log('🔒 Testing business process integrity rules...');

    const results: BusinessProcessTestResult[] = [];
    const employeeUser = this.getUserByRole(organizationId, 'EMPLOYEE');

    if (!employeeUser) {
      console.log('⚠️  No EMPLOYEE user found for testing');
      return results;
    }

    // Test 1: Try to create invoice without accepted quote
    // First create a quote but don't accept it
    const customer = this.testData.customers.find(c => c.organizationId === organizationId);
    if (customer) {
      const quoteResponse = await this.makeRequest(
        'POST',
        `/organizations/${organizationId}/quotes`,
        employeeUser.id,
        {
          customerId: customer.id,
          validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          items: [{
            description: 'Test Service',
            quantity: 1,
            unitPrice: 100,
            taxRate: 0.13
          }]
        }
      );

      if (quoteResponse.success && quoteResponse.data?.id) {
        // Try to create invoice from unaccepted quote
        const invoiceTest = await this.testBusinessProcess(
          'invoice_without_acceptance',
          employeeUser,
          'POST',
          `/organizations/${organizationId}/invoices/from-quote`,
          { quoteId: quoteResponse.data.id },
          'BAD_REQUEST',
          'Cannot create invoice from unaccepted quote'
        );
        results.push(invoiceTest);
      }
    }

    return results;
  }

  /**
   * Execute a single workflow stage
   */
  private async executeWorkflowStage(
    stageName: string,
    role: string,
    method: string,
    endpoint: string,
    userId: string,
    requestData?: any
  ): Promise<WorkflowStageResult> {
    const startTime = Date.now();
    const fullUrl = `${this.baseURL}/api/v1${endpoint}`;

    try {
      const response = await this.makeRequest(method, endpoint, userId, requestData);
      const actual = response.statusCode >= 200 && response.statusCode < 300 ? 'SUCCESS' :
                    response.statusCode === 403 ? 'FORBIDDEN' :
                    response.statusCode === 400 ? 'BAD_REQUEST' : 'ERROR';

      return {
        stageName,
        role,
        endpoint,
        method,
        expected: 'SUCCESS',
        actual,
        statusCode: response.statusCode,
        passed: actual === 'SUCCESS',
        responseTime: Date.now() - startTime,
        responseData: response.data,
        error: response.error
      };
    } catch (error) {
      return {
        stageName,
        role,
        endpoint,
        method,
        expected: 'SUCCESS',
        actual: 'ERROR',
        statusCode: 0,
        passed: false,
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Test a business process
   */
  private async testBusinessProcess(
    processName: string,
    user: TestUser,
    method: string,
    endpoint: string,
    requestData: any,
    expected: 'SUCCESS' | 'FORBIDDEN' | 'BAD_REQUEST',
    businessReason: string
  ): Promise<BusinessProcessTestResult> {
    const startTime = Date.now();

    try {
      const response = await this.makeRequest(method, endpoint, user.id, requestData);
      const actual = this.statusCodeToResult(response.statusCode);
      const passed = expected === actual;

      return {
        processName,
        organizationId: user.organizationId,
        userId: user.id,
        role: user.role,
        expected,
        actual,
        statusCode: response.statusCode,
        passed,
        businessReason,
        responseTime: Date.now() - startTime,
        error: response.error
      };
    } catch (error) {
      return {
        processName,
        organizationId: user.organizationId,
        userId: user.id,
        role: user.role,
        expected,
        actual: 'ERROR',
        statusCode: 0,
        passed: false,
        businessReason,
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Make HTTP request with authentication
   */
  private async makeRequest(
    method: string,
    endpoint: string,
    userId: string,
    data?: any
  ): Promise<{ success: boolean; statusCode: number; data?: any; error?: string }> {
    const token = this.userTokens.get(userId);
    if (!token) {
      return { success: false, statusCode: 401, error: 'No authentication token' };
    }

    const fullUrl = endpoint.startsWith('/api/v1') ?
      `${this.baseURL}${endpoint}` :
      `${this.baseURL}/api/v1${endpoint}`;

    try {
      const response = await axios({
        method: method.toLowerCase() as any,
        url: fullUrl,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        data: data,
        validateStatus: () => true
      });

      return {
        success: response.status >= 200 && response.status < 300,
        statusCode: response.status,
        data: response.data
      };
    } catch (error) {
      return {
        success: false,
        statusCode: 0,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Convert status code to result type
   */
  private statusCodeToResult(statusCode: number): 'SUCCESS' | 'FORBIDDEN' | 'BAD_REQUEST' | 'ERROR' {
    if (statusCode >= 200 && statusCode < 300) return 'SUCCESS';
    if (statusCode === 403) return 'FORBIDDEN';
    if (statusCode === 400) return 'BAD_REQUEST';
    return 'ERROR';
  }

  /**
   * Get user by role for an organization
   */
  private getUserByRole(organizationId: string, role: string): TestUser | undefined {
    return this.testData.users.find(u =>
      u.organizationId === organizationId && u.role === role
    );
  }

  /**
   * Run comprehensive workflow-based RBAC tests
   */
  async runWorkflowTests(): Promise<{
    workflowResults: WorkflowTestResult[];
    businessProcessResults: BusinessProcessTestResult[];
    summary: {
      totalWorkflows: number;
      passedWorkflows: number;
      totalBusinessProcesses: number;
      passedBusinessProcesses: number;
      overallSuccess: boolean;
    };
  }> {
    console.log('🚀 Starting comprehensive workflow-based RBAC testing...');

    await this.authenticateUsers();

    const workflowResults: WorkflowTestResult[] = [];
    const businessProcessResults: BusinessProcessTestResult[] = [];

    // Test customer lifecycle workflows for each organization
    for (const org of this.testData.organizations) {
      console.log(`\n📋 Testing workflows for organization: ${org.name}`);

      // Test complete customer lifecycle
      const lifecycleResult = await this.testCustomerLifecycleWorkflow(org.id);
      workflowResults.push(lifecycleResult);

      // Test role violations
      const violationResults = await this.testRoleViolations(org.id);
      businessProcessResults.push(...violationResults);

      // Test client access restrictions
      const clientResults = await this.testClientAccessRestrictions(org.id);
      businessProcessResults.push(...clientResults);

      // Test business process integrity
      const integrityResults = await this.testBusinessProcessIntegrity(org.id);
      businessProcessResults.push(...integrityResults);
    }

    const summary = {
      totalWorkflows: workflowResults.length,
      passedWorkflows: workflowResults.filter(w => w.passed).length,
      totalBusinessProcesses: businessProcessResults.length,
      passedBusinessProcesses: businessProcessResults.filter(bp => bp.passed).length,
      overallSuccess: workflowResults.every(w => w.passed) && businessProcessResults.every(bp => bp.passed)
    };

    console.log(`\n📊 Workflow Test Summary:`);
    console.log(`   Workflows: ${summary.passedWorkflows}/${summary.totalWorkflows} passed`);
    console.log(`   Business Processes: ${summary.passedBusinessProcesses}/${summary.totalBusinessProcesses} passed`);
    console.log(`   Overall Success: ${summary.overallSuccess ? '✅' : '❌'}`);

    return { workflowResults, businessProcessResults, summary };
  }

  /**
   * Export workflow test results
   */
  async exportWorkflowResults(
    workflowResults: WorkflowTestResult[],
    businessProcessResults: BusinessProcessTestResult[]
  ): Promise<void> {
    const fs = await import('fs/promises');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    // Export detailed results
    await fs.writeFile(
      `/home/eric/Projects/accounting-api/tests/rbac/workflow-test-results-${timestamp}.json`,
      JSON.stringify({
        timestamp,
        workflowResults,
        businessProcessResults,
        summary: {
          totalWorkflows: workflowResults.length,
          passedWorkflows: workflowResults.filter(w => w.passed).length,
          totalBusinessProcesses: businessProcessResults.length,
          passedBusinessProcesses: businessProcessResults.filter(bp => bp.passed).length
        }
      }, null, 2)
    );

    // Export HTML report
    const report = this.generateWorkflowHTMLReport(workflowResults, businessProcessResults);
    await fs.writeFile(
      `/home/eric/Projects/accounting-api/tests/rbac/workflow-test-report-${timestamp}.html`,
      report
    );

    console.log(`📄 Workflow test results exported with timestamp: ${timestamp}`);
  }

  /**
   * Generate HTML report for workflow tests
   */
  private generateWorkflowHTMLReport(
    workflowResults: WorkflowTestResult[],
    businessProcessResults: BusinessProcessTestResult[]
  ): string {
    const passedWorkflows = workflowResults.filter(w => w.passed).length;
    const passedBusinessProcesses = businessProcessResults.filter(bp => bp.passed).length;

    return `
<!DOCTYPE html>
<html>
<head>
    <title>Workflow-Based RBAC Test Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .summary { background: #f5f5f5; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
        .success { color: #28a745; }
        .failure { color: #dc3545; }
        .workflow { margin-bottom: 30px; border: 1px solid #ddd; padding: 15px; }
        .workflow-header { font-weight: bold; margin-bottom: 10px; }
        .stage { margin-left: 20px; margin-bottom: 5px; }
        table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
        .passed { background-color: #d4edda; }
        .failed { background-color: #f8d7da; }
    </style>
</head>
<body>
    <h1>Workflow-Based RBAC Test Report</h1>

    <div class="summary">
        <h2>Test Summary</h2>
        <p><strong>Workflows:</strong> ${passedWorkflows}/${workflowResults.length} passed</p>
        <p><strong>Business Processes:</strong> ${passedBusinessProcesses}/${businessProcessResults.length} passed</p>
        <p><strong>Overall Success:</strong> ${(passedWorkflows === workflowResults.length && passedBusinessProcesses === businessProcessResults.length) ? '<span class="success">✅ PASSED</span>' : '<span class="failure">❌ FAILED</span>'}</p>
    </div>

    <h2>Workflow Results</h2>
    ${workflowResults.map(workflow => `
    <div class="workflow ${workflow.passed ? 'passed' : 'failed'}">
        <div class="workflow-header">
            ${workflow.workflowName} - ${workflow.passed ? '✅ PASSED' : '❌ FAILED'}
            (${workflow.completedStages}/${workflow.totalStages} stages)
        </div>
        ${workflow.stages.map(stage => `
        <div class="stage ${stage.passed ? 'success' : 'failure'}">
            ${stage.stageName} (${stage.role}): ${stage.method} ${stage.endpoint} - ${stage.passed ? '✅' : '❌'} ${stage.statusCode}
            ${stage.businessRule ? `<br><em>${stage.businessRule}</em>` : ''}
        </div>
        `).join('')}
    </div>
    `).join('')}

    <h2>Business Process Results</h2>
    <table>
        <tr>
            <th>Process</th>
            <th>Role</th>
            <th>Expected</th>
            <th>Actual</th>
            <th>Status</th>
            <th>Business Reason</th>
        </tr>
        ${businessProcessResults.map(bp => `
        <tr class="${bp.passed ? 'passed' : 'failed'}">
            <td>${bp.processName}</td>
            <td>${bp.role}</td>
            <td>${bp.expected}</td>
            <td>${bp.actual}</td>
            <td>${bp.passed ? '✅ PASSED' : '❌ FAILED'}</td>
            <td>${bp.businessReason}</td>
        </tr>
        `).join('')}
    </table>
</body>
</html>`;
  }
}

export default WorkflowRBACTestSuite;