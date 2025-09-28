#!/usr/bin/env ts-node
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface GenerateDocsOptions {
  generateTypes?: boolean;
  buildHtml?: boolean;
  validateSpec?: boolean;
  verbose?: boolean;
}

class DocumentationGenerator {
  private readonly projectRoot: string;
  private readonly docsPath: string;
  private readonly openApiPath: string;
  private readonly typesPath: string;

  constructor() {
    this.projectRoot = process.cwd();
    this.docsPath = path.join(this.projectRoot, 'docs');
    this.openApiPath = path.join(this.docsPath, 'openapi.yaml');
    this.typesPath = path.join(this.projectRoot, 'src', 'types', 'api.ts');
  }

  async generateDocumentation(options: GenerateDocsOptions = {}): Promise<void> {
    const {
      generateTypes = true,
      buildHtml = true,
      validateSpec = true,
      verbose = false
    } = options;

    console.log('🚀 Starting documentation generation...\n');

    try {
      // Ensure docs directory exists
      await this.ensureDocsDirectory();

      // Validate OpenAPI specification
      if (validateSpec) {
        await this.validateOpenApiSpec(verbose);
      }

      // Generate TypeScript types
      if (generateTypes) {
        await this.generateTypeScriptTypes(verbose);
      }

      // Build HTML documentation
      if (buildHtml) {
        await this.buildHtmlDocumentation(verbose);
      }

      // Generate additional documentation files
      await this.generateAdditionalDocs();

      console.log('✅ Documentation generation completed successfully!\n');
      this.printSummary();

    } catch (error) {
      console.error('❌ Documentation generation failed:');
      console.error(error);
      process.exit(1);
    }
  }

  private async ensureDocsDirectory(): Promise<void> {
    if (!fs.existsSync(this.docsPath)) {
      fs.mkdirSync(this.docsPath, { recursive: true });
      console.log('📁 Created docs directory');
    }

    // Ensure types directory exists
    const typesDir = path.dirname(this.typesPath);
    if (!fs.existsSync(typesDir)) {
      fs.mkdirSync(typesDir, { recursive: true });
      console.log('📁 Created types directory');
    }
  }

  private async validateOpenApiSpec(verbose: boolean): Promise<void> {
    console.log('🔍 Validating OpenAPI specification...');

    if (!fs.existsSync(this.openApiPath)) {
      throw new Error(`OpenAPI specification not found at: ${this.openApiPath}`);
    }

    try {
      // Basic YAML syntax validation
      const yaml = require('js-yaml');
      const fileContents = fs.readFileSync(this.openApiPath, 'utf8');
      const spec = yaml.load(fileContents);

      // Basic structure validation
      if (!spec.openapi) {
        throw new Error('Missing openapi version in specification');
      }

      if (!spec.info) {
        throw new Error('Missing info section in specification');
      }

      if (!spec.paths) {
        throw new Error('Missing paths section in specification');
      }

      console.log('✅ OpenAPI specification is valid');

      if (verbose) {
        console.log(`   - OpenAPI version: ${spec.openapi}`);
        console.log(`   - API title: ${spec.info.title}`);
        console.log(`   - API version: ${spec.info.version}`);
        console.log(`   - Paths defined: ${Object.keys(spec.paths).length}`);
      }

    } catch (error) {
      throw new Error(`OpenAPI specification validation failed: ${error}`);
    }
  }

  private async generateTypeScriptTypes(verbose: boolean): Promise<void> {
    console.log('🔧 Generating TypeScript types from OpenAPI specification...');

    try {
      const command = `npx openapi-typescript "${this.openApiPath}" -o "${this.typesPath}"`;

      if (verbose) {
        console.log(`   Command: ${command}`);
      }

      const { stderr } = await execAsync(command);

      if (stderr && !stderr.includes('warning')) {
        throw new Error(stderr);
      }

      // Add custom header to generated types file
      const header = `/**
 * Generated TypeScript types from OpenAPI specification
 *
 * @file ${path.basename(this.typesPath)}
 * @generated This file is auto-generated. Do not edit manually.
 * @source ${path.relative(path.dirname(this.typesPath), this.openApiPath)}
 */

`;

      const content = fs.readFileSync(this.typesPath, 'utf8');
      fs.writeFileSync(this.typesPath, header + content);

      console.log('✅ TypeScript types generated successfully');

      if (verbose) {
        const stats = fs.statSync(this.typesPath);
        console.log(`   - File size: ${(stats.size / 1024).toFixed(2)} KB`);
        console.log(`   - Location: ${this.typesPath}`);
      }

    } catch (error) {
      throw new Error(`TypeScript types generation failed: ${error}`);
    }
  }

  private async buildHtmlDocumentation(verbose: boolean): Promise<void> {
    console.log('📚 Building HTML documentation with ReDoc...');

    try {
      const outputPath = path.join(this.docsPath, 'api-docs.html');
      const command = `npx redoc-cli build "${this.openApiPath}" --output "${outputPath}" --title "Accounting API Documentation"`;

      if (verbose) {
        console.log(`   Command: ${command}`);
      }

      const { stderr } = await execAsync(command);

      if (stderr && !stderr.includes('warning')) {
        console.warn(`   Warning: ${stderr}`);
      }

      console.log('✅ HTML documentation built successfully');

      if (verbose) {
        const stats = fs.statSync(outputPath);
        console.log(`   - File size: ${(stats.size / 1024).toFixed(2)} KB`);
        console.log(`   - Location: ${outputPath}`);
      }

    } catch (error) {
      throw new Error(`HTML documentation build failed: ${error}`);
    }
  }

  private async generateAdditionalDocs(): Promise<void> {
    console.log('📋 Generating additional documentation files...');

    // Generate API client examples
    await this.generateApiClientExamples();

    // Generate authentication guide
    await this.generateAuthenticationGuide();

    // Generate changelog template
    await this.generateChangelogTemplate();

    console.log('✅ Additional documentation files generated');
  }

  private async generateApiClientExamples(): Promise<void> {
    const examplesPath = path.join(this.docsPath, 'examples');
    if (!fs.existsSync(examplesPath)) {
      fs.mkdirSync(examplesPath, { recursive: true });
    }

    // JavaScript/Node.js example
    const jsExample = `/**
 * Accounting API - JavaScript Client Example
 *
 * This example demonstrates how to interact with the Accounting API
 * using JavaScript/Node.js with axios.
 */

const axios = require('axios');

class AccountingApiClient {
  constructor(baseURL = 'http://localhost:3000/api/v1', apiKey = null) {
    this.baseURL = baseURL;
    this.apiKey = apiKey;
    this.accessToken = null;

    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add request interceptor to include auth token
    this.client.interceptors.request.use((config) => {
      if (this.accessToken) {
        config.headers.Authorization = \`Bearer \${this.accessToken}\`;
      }
      return config;
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          console.error('Authentication failed. Please login again.');
        }
        return Promise.reject(error);
      }
    );
  }

  async login(email, password, organizationId) {
    try {
      const response = await this.client.post('/auth/login', {
        email,
        password,
        organizationId,
      });

      this.accessToken = response.data.accessToken;
      this.refreshToken = response.data.refreshToken;

      return response.data;
    } catch (error) {
      throw new Error(\`Login failed: \${error.response?.data?.message || error.message}\`);
    }
  }

  async refreshAccessToken() {
    try {
      const response = await this.client.post('/auth/refresh', {
        refreshToken: this.refreshToken,
      });

      this.accessToken = response.data.accessToken;
      this.refreshToken = response.data.refreshToken;

      return response.data;
    } catch (error) {
      throw new Error(\`Token refresh failed: \${error.response?.data?.message || error.message}\`);
    }
  }

  async getCustomers(params = {}) {
    try {
      const response = await this.client.get('/customers', { params });
      return response.data;
    } catch (error) {
      throw new Error(\`Failed to fetch customers: \${error.response?.data?.message || error.message}\`);
    }
  }

  async createCustomer(customerData) {
    try {
      const response = await this.client.post('/customers', customerData);
      return response.data;
    } catch (error) {
      throw new Error(\`Failed to create customer: \${error.response?.data?.message || error.message}\`);
    }
  }

  async createInvoice(invoiceData) {
    try {
      const response = await this.client.post('/invoices', invoiceData);
      return response.data;
    } catch (error) {
      throw new Error(\`Failed to create invoice: \${error.response?.data?.message || error.message}\`);
    }
  }
}

// Usage example
async function example() {
  const client = new AccountingApiClient();

  try {
    // Login
    await client.login(
      'admin@example.com',
      'SecurePassword123!',
      '550e8400-e29b-41d4-a716-446655440000'
    );

    // Get customers with pagination
    const customers = await client.getCustomers({
      limit: 20,
      offset: 0,
      sortBy: 'createdAt',
      sortOrder: 'desc'
    });

    console.log('Customers:', customers);

    // Create a new customer
    const newCustomer = await client.createCustomer({
      type: 'PERSON',
      tier: 'PERSONAL',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@example.com',
      phone: '+1 (555) 123-4567',
      address: {
        street: '123 Main St',
        city: 'Toronto',
        province: 'ON',
        postalCode: 'M5V 3A8',
        country: 'Canada'
      }
    });

    console.log('New customer created:', newCustomer);

  } catch (error) {
    console.error('API Error:', error.message);
  }
}

module.exports = AccountingApiClient;

// Run example if this file is executed directly
if (require.main === module) {
  example();
}
`;

    fs.writeFileSync(path.join(examplesPath, 'javascript-client.js'), jsExample);

    // Python example
    const pythonExample = `"""
Accounting API - Python Client Example

This example demonstrates how to interact with the Accounting API
using Python with the requests library.
"""

import requests
import json
from typing import Optional, Dict, Any
from datetime import datetime, timedelta


class AccountingApiClient:
    def __init__(self, base_url: str = "http://localhost:3000/api/v1"):
        self.base_url = base_url
        self.access_token: Optional[str] = None
        self.refresh_token: Optional[str] = None
        self.session = requests.Session()

        # Set default headers
        self.session.headers.update({
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        })

    def _get_headers(self) -> Dict[str, str]:
        headers = {}
        if self.access_token:
            headers['Authorization'] = f'Bearer {self.access_token}'
        return headers

    def _handle_response(self, response: requests.Response) -> Dict[str, Any]:
        if response.status_code == 401:
            raise Exception("Authentication failed. Please login again.")

        response.raise_for_status()
        return response.json()

    def login(self, email: str, password: str, organization_id: str) -> Dict[str, Any]:
        """Login and obtain access tokens."""
        url = f"{self.base_url}/auth/login"
        data = {
            "email": email,
            "password": password,
            "organizationId": organization_id
        }

        response = self.session.post(url, json=data)
        result = self._handle_response(response)

        self.access_token = result['accessToken']
        self.refresh_token = result['refreshToken']

        return result

    def refresh_access_token(self) -> Dict[str, Any]:
        """Refresh the access token using the refresh token."""
        if not self.refresh_token:
            raise Exception("No refresh token available")

        url = f"{self.base_url}/auth/refresh"
        data = {"refreshToken": self.refresh_token}

        response = self.session.post(url, json=data)
        result = self._handle_response(response)

        self.access_token = result['accessToken']
        self.refresh_token = result['refreshToken']

        return result

    def get_customers(self, **params) -> Dict[str, Any]:
        """Get list of customers with optional filtering and pagination."""
        url = f"{self.base_url}/customers"
        headers = self._get_headers()

        response = self.session.get(url, headers=headers, params=params)
        return self._handle_response(response)

    def create_customer(self, customer_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new customer."""
        url = f"{self.base_url}/customers"
        headers = self._get_headers()

        response = self.session.post(url, headers=headers, json=customer_data)
        return self._handle_response(response)

    def get_customer(self, customer_id: str) -> Dict[str, Any]:
        """Get a specific customer by ID."""
        url = f"{self.base_url}/customers/{customer_id}"
        headers = self._get_headers()

        response = self.session.get(url, headers=headers)
        return self._handle_response(response)

    def create_invoice(self, invoice_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new invoice."""
        url = f"{self.base_url}/invoices"
        headers = self._get_headers()

        response = self.session.post(url, headers=headers, json=invoice_data)
        return self._handle_response(response)

    def get_invoices(self, **params) -> Dict[str, Any]:
        """Get list of invoices with optional filtering and pagination."""
        url = f"{self.base_url}/invoices"
        headers = self._get_headers()

        response = self.session.get(url, headers=headers, params=params)
        return self._handle_response(response)


def example_usage():
    """Example usage of the Accounting API client."""
    client = AccountingApiClient()

    try:
        # Login
        login_result = client.login(
            email="admin@example.com",
            password="SecurePassword123!",
            organization_id="550e8400-e29b-41d4-a716-446655440000"
        )
        print("Login successful:", login_result['user']['email'])

        # Get customers with pagination
        customers = client.get_customers(
            limit=20,
            offset=0,
            sort_by="createdAt",
            sort_order="desc"
        )
        print(f"Found {customers['meta']['total']} customers")

        # Create a new customer
        new_customer_data = {
            "type": "PERSON",
            "tier": "PERSONAL",
            "firstName": "Jane",
            "lastName": "Smith",
            "email": "jane.smith@example.com",
            "phone": "+1 (555) 987-6543",
            "address": {
                "street": "456 Oak Ave",
                "city": "Vancouver",
                "province": "BC",
                "postalCode": "V6B 1A1",
                "country": "Canada"
            }
        }

        new_customer = client.create_customer(new_customer_data)
        print("New customer created:", new_customer['id'])

        # Create an invoice for the new customer
        invoice_data = {
            "customerId": new_customer['id'],
            "items": [
                {
                    "description": "Consulting Services",
                    "quantity": "10.00",
                    "unitPrice": "100.00",
                    "total": "1000.00"
                }
            ],
            "subtotal": "1000.00",
            "taxRate": "0.13",
            "taxAmount": "130.00",
            "total": "1130.00",
            "dueDate": (datetime.now() + timedelta(days=30)).isoformat()
        }

        new_invoice = client.create_invoice(invoice_data)
        print("New invoice created:", new_invoice['id'])

    except Exception as e:
        print(f"Error: {e}")


if __name__ == "__main__":
    example_usage()
`;

    fs.writeFileSync(path.join(examplesPath, 'python-client.py'), pythonExample);
  }

  private async generateAuthenticationGuide(): Promise<void> {
    const authGuide = `# Authentication Guide

## Overview

The Accounting API uses JWT (JSON Web Tokens) for authentication with a refresh token mechanism for enhanced security.

## Authentication Flow

### 1. Initial Login

\`\`\`http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePassword123!",
  "organizationId": "550e8400-e29b-41d4-a716-446655440000"
}
\`\`\`

**Response:**
\`\`\`json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": { ... },
  "organization": { ... }
}
\`\`\`

### 2. Using Access Token

Include the access token in the Authorization header for all API requests:

\`\`\`http
GET /api/v1/customers
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
\`\`\`

### 3. Token Refresh

When the access token expires (15 minutes), use the refresh token to get a new one:

\`\`\`http
POST /api/v1/auth/refresh
Content-Type: application/json

{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
\`\`\`

### 4. Logout

Invalidate the refresh token when logging out:

\`\`\`http
POST /api/v1/auth/logout
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
\`\`\`

## Token Expiration

- **Access Token**: 15 minutes
- **Refresh Token**: 7 days

## Security Best Practices

1. **Store tokens securely**: Never store tokens in localStorage or sessionStorage in web applications. Use secure, httpOnly cookies instead.

2. **Implement automatic refresh**: Set up your client to automatically refresh tokens before they expire.

3. **Handle token expiration**: Always handle 401 responses gracefully by attempting to refresh the token.

4. **Logout properly**: Always call the logout endpoint to invalidate refresh tokens.

5. **Use HTTPS**: Never send tokens over unencrypted connections in production.

## Role-Based Access Control

The API implements role-based access control with the following roles:

| Role | Description | Permissions |
|------|-------------|-------------|
| \`SUPER_ADMIN\` | System administrator | Full access to all organizations |
| \`ADMIN\` | Organization administrator | Full access within organization |
| \`MANAGER\` | Department manager | Manage customers, quotes, invoices, projects |
| \`ACCOUNTANT\` | Financial operator | Focus on financial operations and reporting |
| \`EMPLOYEE\` | Regular employee | Limited access to assigned tasks |
| \`VIEWER\` | Read-only user | View-only access to organization data |

## Error Responses

### 401 Unauthorized
\`\`\`json
{
  "error": "AuthenticationError",
  "message": "Invalid credentials"
}
\`\`\`

### 403 Forbidden
\`\`\`json
{
  "error": "AuthorizationError",
  "message": "Insufficient permissions"
}
\`\`\`

### 429 Too Many Requests
\`\`\`json
{
  "error": "RateLimitError",
  "message": "Too many requests from this IP, please try again later"
}
\`\`\`

## Rate Limiting

Authentication endpoints have additional rate limiting:

- **Login**: 5 attempts per minute per IP
- **Registration**: 3 attempts per minute per IP
- **Other endpoints**: 100 requests per minute per IP

## Multi-Tenant Architecture

Each request is scoped to an organization. Users can only access data within their organization unless they have \`SUPER_ADMIN\` role.
`;

    fs.writeFileSync(path.join(this.docsPath, 'authentication.md'), authGuide);
  }

  private async generateChangelogTemplate(): Promise<void> {
    const changelog = `# Changelog

All notable changes to the Accounting API will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial release of the Accounting API
- JWT authentication with refresh tokens
- Role-based access control
- Multi-tenant architecture
- Customer management endpoints
- Quote management with workflow stages
- Invoice management with Stripe integration
- Payment processing with webhook support
- Project management with time tracking
- Appointment scheduling
- Comprehensive audit logging
- Rate limiting and security measures
- OpenAPI 3.0 specification
- Interactive API documentation

### Changed

### Deprecated

### Removed

### Fixed

### Security

## [1.0.0] - ${new Date().toISOString().split('T')[0]}

### Added
- Initial public release
- Complete REST API for accounting operations
- Bank-level security implementation
- Comprehensive documentation and examples

---

## How to Update

When making changes to the API:

1. **Added**: New features or endpoints
2. **Changed**: Changes in existing functionality
3. **Deprecated**: Soon-to-be removed features
4. **Removed**: Removed features
5. **Fixed**: Bug fixes
6. **Security**: Security-related changes

### Version Numbering

- **Major version** (X.0.0): Breaking changes
- **Minor version** (0.X.0): New features, backward compatible
- **Patch version** (0.0.X): Bug fixes, backward compatible
`;

    fs.writeFileSync(path.join(this.docsPath, 'CHANGELOG.md'), changelog);
  }

  private printSummary(): void {
    console.log('📋 Documentation Summary:');
    console.log('─'.repeat(50));
    console.log(`📄 OpenAPI Spec: ${this.openApiPath}`);
    console.log(`🔧 TypeScript Types: ${this.typesPath}`);
    console.log(`📚 HTML Docs: ${path.join(this.docsPath, 'api-docs.html')}`);
    console.log(`🔐 Auth Guide: ${path.join(this.docsPath, 'authentication.md')}`);
    console.log(`📝 Changelog: ${path.join(this.docsPath, 'CHANGELOG.md')}`);
    console.log(`💻 Examples: ${path.join(this.docsPath, 'examples/')}`);
    console.log('─'.repeat(50));
    console.log('🌐 Access documentation at:');
    console.log('   • Swagger UI: http://localhost:3000/api-docs');
    console.log('   • OpenAPI JSON: http://localhost:3000/api-docs/openapi.json');
    console.log('   • Static HTML: Open docs/api-docs.html in browser');
  }
}

// CLI interface
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options: GenerateDocsOptions = {
    generateTypes: !args.includes('--no-types'),
    buildHtml: !args.includes('--no-html'),
    validateSpec: !args.includes('--no-validate'),
    verbose: args.includes('--verbose') || args.includes('-v'),
  };

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: ts-node scripts/generate-docs.ts [options]

Options:
  --no-types      Skip TypeScript types generation
  --no-html       Skip HTML documentation build
  --no-validate   Skip OpenAPI specification validation
  --verbose, -v   Enable verbose output
  --help, -h      Show this help message

Examples:
  ts-node scripts/generate-docs.ts
  ts-node scripts/generate-docs.ts --verbose
  ts-node scripts/generate-docs.ts --no-html --no-types
`);
    process.exit(0);
  }

  const generator = new DocumentationGenerator();
  await generator.generateDocumentation(options);
}

// Run if called directly
if (require.main === module) {
  main().catch((error) => {
    console.error('❌ Script failed:', error.message);
    process.exit(1);
  });
}

export { DocumentationGenerator };