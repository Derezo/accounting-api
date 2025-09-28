import swaggerJSDoc from 'swagger-jsdoc';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

// JSDoc-based configuration for auto-discovery
const jsdocOptions: swaggerJSDoc.Options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Accounting API',
      version: '1.0.0',
      description: `
Bank-level secure REST API for universal accounting and financial operations.

## Features
- JWT authentication with refresh tokens
- Role-based access control (6 roles)
- Multi-tenant architecture with organization isolation
- Comprehensive validation with express-validator
- Audit logging for all operations
- Stripe payment integration
- File upload capabilities
- Complex filtering and pagination

## Security
This API implements bank-level security measures including:
- End-to-end encryption
- Rate limiting
- CORS protection
- Helmet security headers
- Input validation and sanitization
- Audit trail for all operations

## Authentication
The API uses JWT tokens for authentication. Include the Bearer token in the Authorization header:
\`\`\`
Authorization: Bearer <your-jwt-token>
\`\`\`

## Rate Limiting
API requests are rate-limited. See response headers for current limits:
- \`X-RateLimit-Limit\`: Request limit per window
- \`X-RateLimit-Remaining\`: Remaining requests in window
- \`X-RateLimit-Reset\`: Time when window resets
      `,
      contact: {
        name: 'Lifestream Dynamics',
        email: 'support@lifestreamdynamics.com'
      },
      license: {
        name: 'Proprietary'
      }
    },
    servers: [
      {
        url: `http://localhost:3000/api/v1`,
        description: 'Development server'
      },
      {
        url: `https://api.accounting.com/api/v1`,
        description: 'Production server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
              description: 'Error type'
            },
            message: {
              type: 'string',
              description: 'Error message'
            },
            details: {
              type: 'object',
              description: 'Additional error details'
            }
          }
        },
        Timestamp: {
          type: 'string',
          format: 'date-time',
          description: 'ISO 8601 timestamp'
        }
      }
    },
    tags: [
      {
        name: 'Health',
        description: 'Health check endpoints'
      },
      {
        name: 'Authentication',
        description: 'User authentication and authorization'
      },
      {
        name: 'Organizations',
        description: 'Organization management'
      },
      {
        name: 'Customers',
        description: 'Customer management'
      },
      {
        name: 'Quotes',
        description: 'Quote management'
      },
      {
        name: 'Appointments',
        description: 'Appointment scheduling'
      },
      {
        name: 'Invoices',
        description: 'Invoice management'
      },
      {
        name: 'Payments',
        description: 'Payment processing'
      },
      {
        name: 'Projects',
        description: 'Project management'
      },
      {
        name: 'E-Transfers',
        description: 'Electronic transfer management'
      },
      {
        name: 'Manual Payments',
        description: 'Manual payment processing'
      },
      {
        name: 'Payment Analytics',
        description: 'Payment analytics and reporting'
      }
    ]
  },
  apis: [
    './src/routes/*.ts',
    './src/controllers/*.ts',
    './src/app.ts'
  ]
};

// Generate JSDoc specification
console.log('🚀 Generating JSDoc-based OpenAPI specification...');
const jsdocSpec = swaggerJSDoc(jsdocOptions);

// Save as JSON
const jsonPath = path.join(process.cwd(), 'docs', 'jsdoc-openapi.json');
fs.writeFileSync(jsonPath, JSON.stringify(jsdocSpec, null, 2));

// Save as YAML
const yamlPath = path.join(process.cwd(), 'docs', 'jsdoc-openapi.yaml');
fs.writeFileSync(yamlPath, yaml.dump(jsdocSpec));

console.log(`✅ JSDoc OpenAPI specification generated successfully!`);
console.log(`📄 JSON: ${jsonPath}`);
console.log(`📄 YAML: ${yamlPath}`);
console.log(`📊 Total endpoints documented: ${Object.keys((jsdocSpec as any).paths || {}).length}`);