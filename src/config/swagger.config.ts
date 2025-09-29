import { Options } from 'swagger-jsdoc';
import { version } from '../../package.json';

const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'Lifestream Dynamics Accounting API',
    version,
    description: `
# Universal Accounting API

A comprehensive REST API for accounting, financial management, and business operations designed for small to medium businesses.

## Features

- **Double-Entry Bookkeeping**: Complete journal entry system with automatic balance validation
- **Multi-Tenant SaaS**: Organization-level data isolation with bank-level security
- **Canadian Tax Compliance**: GST/HST/PST calculation and reporting
- **Financial Statements**: Balance Sheet, Income Statement, Cash Flow generation
- **Document Management**: Secure document storage with encryption
- **Audit Logging**: Comprehensive change tracking and compliance reporting

## Authentication

All API endpoints (except health checks and auth) require authentication via JWT bearer tokens:

\`\`\`
Authorization: Bearer <your-jwt-token>
\`\`\`

## Rate Limiting

- **Standard**: 1000 requests per hour per organization
- **Burst**: 100 requests per minute
- **Documentation**: Unlimited (health, auth endpoints)

## Error Handling

All errors follow RFC 7807 Problem Details format:

\`\`\`json
{
  "error": "Brief error description",
  "message": "Detailed error message",
  "code": "ERROR_CODE",
  "details": {
    "field": "validation details"
  }
}
\`\`\`

## Data Format

- **Dates**: ISO 8601 format (YYYY-MM-DDTHH:mm:ss.sssZ)
- **Decimals**: Two decimal places for currency amounts
- **IDs**: CUID format (e.g., "cmg123abc...")
- **Pagination**: Cursor-based with \`limit\` and \`cursor\` parameters
    `,
    contact: {
      name: 'Lifestream Dynamics Support',
      email: 'api-support@lifestreamdynamics.com',
      url: 'https://lifestreamdynamics.com/support'
    },
    license: {
      name: 'Proprietary',
      url: 'https://lifestreamdynamics.com/license'
    },
    termsOfService: 'https://lifestreamdynamics.com/terms'
  },
  servers: [
    {
      url: 'http://localhost:3000',
      description: 'Development Server'
    },
    {
      url: 'https://api-staging.lifestreamdynamics.com',
      description: 'Staging Server'
    },
    {
      url: 'https://api.lifestreamdynamics.com',
      description: 'Production Server'
    }
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT authorization header using the Bearer scheme'
      },
      apiKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-Key',
        description: 'API key for service-to-service authentication'
      }
    },
    schemas: {
      // Common response schemas
      SuccessResponse: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
            example: true
          },
          data: {
            type: 'object',
            description: 'Response data'
          }
        },
        required: ['success', 'data']
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          error: {
            type: 'string',
            description: 'Brief error description'
          },
          message: {
            type: 'string',
            description: 'Detailed error message'
          },
          code: {
            type: 'string',
            description: 'Machine-readable error code'
          },
          details: {
            type: 'object',
            description: 'Additional error details'
          }
        },
        required: ['error']
      },

      // Accounting schemas
      JournalTransaction: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Transaction identifier',
            example: 'txn_cmg123abc'
          },
          transactionNumber: {
            type: 'string',
            description: 'Human-readable transaction number',
            example: 'TXN-20240115-0001'
          },
          date: {
            type: 'string',
            format: 'date-time',
            description: 'Transaction date',
            example: '2024-01-15T00:00:00.000Z'
          },
          description: {
            type: 'string',
            description: 'Transaction description',
            example: 'Office supplies purchase'
          },
          totalDebits: {
            type: 'number',
            format: 'decimal',
            description: 'Total debit amount',
            example: 500.00
          },
          totalCredits: {
            type: 'number',
            format: 'decimal',
            description: 'Total credit amount',
            example: 500.00
          },
          entries: {
            type: 'array',
            items: { $ref: '#/components/schemas/JournalEntry' }
          },
          createdAt: {
            type: 'string',
            format: 'date-time',
            example: '2024-01-15T10:30:00.000Z'
          }
        }
      },

      JournalEntry: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            example: 'entry_cmg456def'
          },
          accountId: {
            type: 'string',
            description: 'Account identifier',
            example: 'acc_cmg789ghi'
          },
          type: {
            type: 'string',
            enum: ['DEBIT', 'CREDIT'],
            description: 'Entry type',
            example: 'DEBIT'
          },
          amount: {
            type: 'number',
            format: 'decimal',
            description: 'Entry amount (always positive)',
            example: 500.00
          },
          description: {
            type: 'string',
            description: 'Entry description',
            example: 'Office supplies expense'
          },
          account: {
            $ref: '#/components/schemas/Account'
          }
        }
      },

      Account: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            example: 'acc_cmg123abc'
          },
          accountNumber: {
            type: 'string',
            description: 'Unique account number',
            example: '1000'
          },
          name: {
            type: 'string',
            description: 'Account name',
            example: 'Cash'
          },
          type: {
            type: 'string',
            enum: ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'],
            description: 'Account type',
            example: 'ASSET'
          },
          balance: {
            type: 'number',
            format: 'decimal',
            description: 'Current account balance',
            example: 15000.00
          },
          isActive: {
            type: 'boolean',
            description: 'Whether account is active',
            example: true
          },
          parentId: {
            type: 'string',
            nullable: true,
            description: 'Parent account ID for hierarchical structure',
            example: null
          },
          description: {
            type: 'string',
            nullable: true,
            description: 'Account description',
            example: 'Primary cash account for operations'
          }
        }
      },

      TrialBalance: {
        type: 'object',
        properties: {
          entries: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                accountId: { type: 'string', example: 'acc_123' },
                accountNumber: { type: 'string', example: '1000' },
                accountName: { type: 'string', example: 'Cash' },
                accountType: { type: 'string', example: 'ASSET' },
                debitBalance: { type: 'number', example: 15000.00 },
                creditBalance: { type: 'number', example: 0.00 },
                balance: { type: 'number', example: 15000.00 }
              }
            }
          },
          totalDebits: {
            type: 'number',
            description: 'Total of all debit balances',
            example: 15000.00
          },
          totalCredits: {
            type: 'number',
            description: 'Total of all credit balances',
            example: 15000.00
          },
          isBalanced: {
            type: 'boolean',
            description: 'Whether debits equal credits',
            example: true
          },
          asOfDate: {
            type: 'string',
            format: 'date-time',
            description: 'Date of trial balance calculation',
            example: '2024-01-31T00:00:00.000Z'
          }
        }
      },

      AccountingEquationValidation: {
        type: 'object',
        properties: {
          isValid: {
            type: 'boolean',
            description: 'Whether the accounting equation balances',
            example: true
          },
          assets: {
            type: 'number',
            description: 'Total asset value',
            example: 58500.00
          },
          liabilities: {
            type: 'number',
            description: 'Total liability value',
            example: 4000.00
          },
          equity: {
            type: 'number',
            description: 'Total equity value (including retained earnings)',
            example: 54500.00
          },
          difference: {
            type: 'number',
            description: 'Difference between assets and (liabilities + equity)',
            example: 0.00
          }
        }
      }
    },

    responses: {
      Unauthorized: {
        description: 'Authentication required',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
            example: {
              error: 'Authentication required',
              message: 'Valid JWT token must be provided',
              code: 'AUTH_REQUIRED'
            }
          }
        }
      },
      Forbidden: {
        description: 'Insufficient permissions',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
            example: {
              error: 'Access forbidden',
              message: 'Insufficient permissions for this operation',
              code: 'ACCESS_FORBIDDEN'
            }
          }
        }
      },
      NotFound: {
        description: 'Resource not found',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
            example: {
              error: 'Resource not found',
              message: 'The requested resource could not be found',
              code: 'NOT_FOUND'
            }
          }
        }
      },
      ValidationError: {
        description: 'Validation error',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
            example: {
              error: 'Validation failed',
              message: 'Request validation failed',
              code: 'VALIDATION_ERROR',
              details: {
                field: 'Field-specific validation message'
              }
            }
          }
        }
      },
      ServerError: {
        description: 'Internal server error',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
            example: {
              error: 'Internal server error',
              message: 'An unexpected error occurred',
              code: 'INTERNAL_ERROR'
            }
          }
        }
      }
    }
  },
  security: [
    {
      bearerAuth: []
    }
  ],
  tags: [
    {
      name: 'Authentication',
      description: 'User authentication and authorization'
    },
    {
      name: 'Organizations',
      description: 'Organization management'
    },
    {
      name: 'Accounting',
      description: 'Double-entry bookkeeping and financial transactions'
    },
    {
      name: 'Journal Entries',
      description: 'Journal entry management and transaction creation'
    },
    {
      name: 'Accounts',
      description: 'Chart of accounts management'
    },
    {
      name: 'Reports',
      description: 'Financial reporting and analysis'
    },
    {
      name: 'Documents',
      description: 'Document management and file storage'
    },
    {
      name: 'Customers',
      description: 'Customer relationship management'
    },
    {
      name: 'Payments',
      description: 'Payment processing and reconciliation'
    },
    {
      name: 'Tax',
      description: 'Tax calculation and compliance (Canadian focus)'
    },
    {
      name: 'Audit',
      description: 'Audit logging and compliance tracking'
    },
    {
      name: 'Health',
      description: 'API health and monitoring'
    }
  ]
};

const options: Options = {
  definition: swaggerDefinition,
  apis: [
    './src/routes/*.ts',
    './src/controllers/*.ts',
    './src/types/*.ts',
    './src/models/*.ts'
  ]
};

export default options;
export { swaggerDefinition };