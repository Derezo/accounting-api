import swaggerJSDoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Application } from 'express';
import path from 'path';
import fs from 'fs';
import { config } from './config';

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
        url: `http://localhost:${config.PORT}/api/${config.API_VERSION}`,
        description: 'Development server'
      },
      {
        url: `https://api.accounting.com/api/${config.API_VERSION}`,
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

// Load the existing OpenAPI specification as fallback
const openApiSpecPath = path.join(process.cwd(), 'docs', 'openapi.yaml');
let staticOpenApiSpec: any = {};

try {
  if (fs.existsSync(openApiSpecPath)) {
    const yaml = require('js-yaml');
    const fileContents = fs.readFileSync(openApiSpecPath, 'utf8');
    staticOpenApiSpec = yaml.load(fileContents);
  }
} catch (error) {
  console.warn('Could not load static OpenAPI specification:', error);
}

// Generate JSDoc specification
const jsdocSpec = swaggerJSDoc(jsdocOptions);

// Merge static and JSDoc specifications (JSDoc takes precedence for route definitions)
const mergedSpec = {
  ...staticOpenApiSpec,
  ...jsdocSpec,
  paths: {
    ...((staticOpenApiSpec as any)?.paths || {}),
    ...jsdocSpec.paths
  },
  components: {
    ...((staticOpenApiSpec as any)?.components || {}),
    ...jsdocSpec.components
  }
};

// Swagger UI options
const swaggerOptions = {
  explorer: true,
  swaggerOptions: {
    url: '/api-docs/openapi.json',
    persistAuthorization: true,
    displayRequestDuration: true,
    filter: true,
    showExtensions: true,
    showCommonExtensions: true,
    docExpansion: 'list',
    defaultModelsExpandDepth: 2,
    defaultModelExpandDepth: 2,
    tryItOutEnabled: true,
  },
  customCss: `
    .swagger-ui .topbar { display: none; }
    .swagger-ui .info { margin: 20px 0; }
    .swagger-ui .info .title { color: #2c3e50; font-size: 32px; }
    .swagger-ui .info .description { font-size: 14px; line-height: 1.6; }
    .swagger-ui .scheme-container {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 15px;
      border-radius: 8px;
      margin: 20px 0;
    }
    .swagger-ui .btn.authorize {
      background-color: #28a745;
      border-color: #28a745;
    }
    .swagger-ui .btn.authorize:hover {
      background-color: #218838;
      border-color: #1e7e34;
    }
    .swagger-ui .opblock.opblock-get .opblock-summary-method {
      background: #28a745;
    }
    .swagger-ui .opblock.opblock-post .opblock-summary-method {
      background: #007bff;
    }
    .swagger-ui .opblock.opblock-put .opblock-summary-method {
      background: #ffc107;
    }
    .swagger-ui .opblock.opblock-delete .opblock-summary-method {
      background: #dc3545;
    }
    .swagger-ui .parameter__name.required:after {
      color: #dc3545;
      content: " *";
      font-weight: bold;
    }
    .swagger-ui .model-title {
      color: #2c3e50;
      font-weight: 600;
    }
    .swagger-ui .response-col_description__inner p {
      margin: 0;
      font-size: 14px;
    }
  `,
  customSiteTitle: 'Accounting API Documentation',
  customfavIcon: '/favicon.ico',
};

export const setupSwagger = (app: Application): void => {
  // Serve OpenAPI specification as JSON
  app.get('/api-docs/openapi.json', (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(mergedSpec);
  });

  // Swagger UI setup
  app.use('/api-docs', swaggerUi.serve);
  app.get('/api-docs', swaggerUi.setup(mergedSpec, swaggerOptions));

  // Alternative documentation endpoints
  app.get('/docs', (_req, res) => {
    res.redirect('/api-docs');
  });

  // Health check for documentation
  app.get('/api-docs/health', (_req, res) => {
    res.json({
      status: 'healthy',
      documentation: {
        swagger: '/api-docs',
        openapi: '/api-docs/openapi.json',
        redoc: process.env.NODE_ENV === 'development' ? '/redoc' : null,
      },
      endpoints: {
        static: Object.keys(((staticOpenApiSpec as any)?.paths) || {}).length,
        jsdoc: Object.keys(jsdocSpec.paths || {}).length,
        merged: Object.keys(mergedSpec.paths || {}).length
      },
      timestamp: new Date().toISOString(),
    });
  });

  console.log(`📚 Swagger UI available at: http://localhost:${config.PORT}/api-docs`);
  console.log(`📋 OpenAPI spec available at: http://localhost:${config.PORT}/api-docs/openapi.json`);
  console.log(`🔍 Documented endpoints: ${Object.keys(mergedSpec.paths || {}).length}`);
};

export { mergedSpec as openApiSpec };