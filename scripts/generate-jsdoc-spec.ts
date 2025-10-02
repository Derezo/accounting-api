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
            },
            timestamp: {
              type: 'string',
              format: 'date-time'
            }
          }
        },
        NotFoundError: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
              enum: ['RESOURCE_NOT_FOUND']
            },
            message: {
              type: 'string'
            },
            timestamp: {
              type: 'string',
              format: 'date-time'
            }
          }
        },
        ConflictError: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
              enum: ['RESOURCE_CONFLICT', 'DUPLICATE_ENTRY']
            },
            message: {
              type: 'string'
            },
            timestamp: {
              type: 'string',
              format: 'date-time'
            }
          }
        },
        Timestamp: {
          type: 'string',
          format: 'date-time',
          description: 'ISO 8601 timestamp'
        },
        Currency: {
          type: 'string',
          enum: ['CAD', 'USD', 'EUR', 'GBP'],
          description: 'ISO 4217 currency code'
        },
        CustomerTier: {
          type: 'string',
          enum: ['PERSONAL', 'SMALL_BUSINESS', 'ENTERPRISE'],
          description: 'Customer service tier'
        },
        CustomerStatus: {
          type: 'string',
          enum: ['PROSPECT', 'ACTIVE', 'INACTIVE', 'SUSPENDED'],
          description: 'Customer account status'
        },
        PaymentMethod: {
          type: 'string',
          enum: ['STRIPE_CARD', 'E_TRANSFER', 'CASH', 'BANK_TRANSFER', 'CHECK'],
          description: 'Payment processing method'
        },
        User: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Unique user identifier'
            },
            organizationId: {
              type: 'string',
              description: 'Organization the user belongs to'
            },
            email: {
              type: 'string',
              format: 'email'
            },
            firstName: {
              type: 'string'
            },
            lastName: {
              type: 'string'
            },
            role: {
              type: 'string',
              enum: ['VIEWER', 'EMPLOYEE', 'ACCOUNTANT', 'MANAGER', 'ADMIN', 'SUPER_ADMIN']
            },
            isActive: {
              type: 'boolean'
            },
            createdAt: {
              type: 'string',
              format: 'date-time'
            },
            updatedAt: {
              type: 'string',
              format: 'date-time'
            }
          }
        },
        Customer: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Unique customer identifier'
            },
            organizationId: {
              type: 'string'
            },
            customerNumber: {
              type: 'string',
              description: 'Organization-specific customer number'
            },
            tier: {
              type: 'string',
              enum: ['PERSONAL', 'SMALL_BUSINESS', 'ENTERPRISE']
            },
            status: {
              type: 'string',
              enum: ['PROSPECT', 'ACTIVE', 'INACTIVE', 'SUSPENDED']
            },
            creditLimit: {
              type: 'number',
              format: 'decimal'
            },
            paymentTerms: {
              type: 'integer',
              description: 'Payment terms in days'
            },
            preferredCurrency: {
              type: 'string',
              enum: ['CAD', 'USD', 'EUR', 'GBP']
            },
            createdAt: {
              type: 'string',
              format: 'date-time'
            },
            updatedAt: {
              type: 'string',
              format: 'date-time'
            }
          }
        },
        Quote: {
          type: 'object',
          properties: {
            id: {
              type: 'string'
            },
            organizationId: {
              type: 'string'
            },
            customerId: {
              type: 'string'
            },
            quoteNumber: {
              type: 'string'
            },
            status: {
              type: 'string',
              enum: ['DRAFT', 'SENT', 'VIEWED', 'ACCEPTED', 'REJECTED', 'EXPIRED']
            },
            subtotal: {
              type: 'number',
              format: 'decimal'
            },
            taxTotal: {
              type: 'number',
              format: 'decimal'
            },
            total: {
              type: 'number',
              format: 'decimal'
            },
            validUntil: {
              type: 'string',
              format: 'date-time'
            },
            createdAt: {
              type: 'string',
              format: 'date-time'
            },
            updatedAt: {
              type: 'string',
              format: 'date-time'
            }
          }
        },
        Payment: {
          type: 'object',
          properties: {
            id: {
              type: 'string'
            },
            organizationId: {
              type: 'string'
            },
            customerId: {
              type: 'string'
            },
            amount: {
              type: 'number',
              format: 'decimal'
            },
            currency: {
              type: 'string',
              enum: ['CAD', 'USD', 'EUR', 'GBP']
            },
            method: {
              type: 'string',
              enum: ['STRIPE_CARD', 'E_TRANSFER', 'CASH', 'BANK_TRANSFER', 'CHECK']
            },
            status: {
              type: 'string',
              enum: ['PENDING', 'COMPLETED', 'FAILED', 'REFUNDED', 'CANCELLED']
            },
            createdAt: {
              type: 'string',
              format: 'date-time'
            }
          }
        },
        Document: {
          type: 'object',
          properties: {
            id: {
              type: 'string'
            },
            organizationId: {
              type: 'string'
            },
            name: {
              type: 'string'
            },
            filename: {
              type: 'string'
            },
            mimeType: {
              type: 'string'
            },
            size: {
              type: 'integer',
              description: 'File size in bytes'
            },
            encrypted: {
              type: 'boolean'
            },
            url: {
              type: 'string',
              format: 'uri'
            },
            createdAt: {
              type: 'string',
              format: 'date-time'
            }
          }
        },
        PaginationMeta: {
          type: 'object',
          properties: {
            page: {
              type: 'integer',
              minimum: 1
            },
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 100
            },
            total: {
              type: 'integer',
              minimum: 0
            },
            totalPages: {
              type: 'integer',
              minimum: 0
            },
            hasNext: {
              type: 'boolean'
            },
            hasPrev: {
              type: 'boolean'
            }
          }
        },
        Pagination: {
          type: 'object',
          properties: {
            page: {
              type: 'integer',
              minimum: 1
            },
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 100
            },
            total: {
              type: 'integer',
              minimum: 0
            },
            totalPages: {
              type: 'integer',
              minimum: 0
            },
            hasNext: {
              type: 'boolean'
            },
            hasPrev: {
              type: 'boolean'
            }
          }
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

// Fix security scheme references and undefined schema references
const fixSpec = (obj: any, definedSchemas: Set<string>): any => {
  if (obj && typeof obj === 'object') {
    if (Array.isArray(obj)) {
      return obj.map(item => fixSpec(item, definedSchemas));
    }
    const fixed: any = {};
    for (const key in obj) {
      if (key === 'security' && Array.isArray(obj[key])) {
        // Fix BearerAuth -> bearerAuth
        fixed[key] = obj[key].map((item: any) => {
          if (item.BearerAuth) {
            return { bearerAuth: item.BearerAuth };
          }
          return item;
        });
      } else if (key === '$ref' && typeof obj[key] === 'string') {
        // Check if referenced schema exists
        const match = obj[key].match(/#\/components\/schemas\/(.+)$/);
        if (match && !definedSchemas.has(match[1])) {
          // Replace undefined schema reference with generic object
          console.log(`⚠️  Warning: Undefined schema reference: ${match[1]} - replacing with generic object`);
          return { type: 'object', description: `${match[1]} object` };
        }
        fixed[key] = obj[key];
      } else {
        fixed[key] = fixSpec(obj[key], definedSchemas);
      }
    }
    return fixed;
  }
  return obj;
};

// Get list of defined schemas
const definedSchemas = new Set<string>(
  Object.keys((jsdocSpec as any).components?.schemas || {})
);
console.log(`📋 Defined schemas: ${Array.from(definedSchemas).join(', ')}`);

const fixedSpec = fixSpec(jsdocSpec, definedSchemas);

// Save as JSON
const jsonPath = path.join(process.cwd(), 'docs', 'jsdoc-openapi.json');
fs.writeFileSync(jsonPath, JSON.stringify(fixedSpec, null, 2));

// Save as YAML
const yamlPath = path.join(process.cwd(), 'docs', 'jsdoc-openapi.yaml');
fs.writeFileSync(yamlPath, yaml.dump(fixedSpec));

console.log(`✅ JSDoc OpenAPI specification generated successfully!`);
console.log(`📄 JSON: ${jsonPath}`);
console.log(`📄 YAML: ${yamlPath}`);
console.log(`📊 Total endpoints documented: ${Object.keys((fixedSpec as any).paths || {}).length}`);