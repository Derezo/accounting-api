import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { rateLimit } from 'express-rate-limit';
import { config } from './config/config';

import { setupSwagger } from './config/swagger.config';

// Import routes
import authRoutes from './routes/auth.routes';
import organizationRoutes from './routes/organization.routes';
import customerRoutes from './routes/customer.routes';
import quoteRoutes from './routes/quote.routes';
import appointmentRoutes from './routes/appointment.routes';
import invoiceRoutes from './routes/invoice.routes';
import paymentRoutes from './routes/payment.routes';
import projectRoutes from './routes/project.routes';
import etransferRoutes from './routes/etransfer.routes';
import manualPaymentRoutes from './routes/manual-payment.routes';
import paymentAnalyticsRoutes from './routes/payment-analytics.routes';
import userRoutes from './routes/user.routes';
import auditRoutes from './routes/audit.routes';
// import documentRoutes from './routes/document.routes';
import accountingRoutes from './routes/accounting.routes';
import taxRoutes from './routes/tax.routes';
import financialStatementsRoutes from './routes/financial-statements.routes';
import invoicePdfRoutes from './routes/invoice-pdf.routes';
import organizationSettingsRoutes from './routes/organization-settings.routes';

import { prisma } from './config/database';
import { logger } from './utils/logger';
import { validateOrganizationAccess, getOrganizationId } from './middleware/organization.middleware';
import {
  errorHandler,
  errorConverter,
  notFoundHandler,
  requestIdMiddleware
} from './middleware/error-handler.middleware';
import { debugMiddleware, debugOrganizationMiddleware } from './middleware/debug.middleware';
import { timeoutMiddleware } from './middleware/timeout.middleware';
import { addDeprecationWarnings } from './middleware/api-deprecation.middleware';
import { Router } from 'express';
const app: Application = express();

// Request ID middleware for error tracking
app.use(requestIdMiddleware);

// Timeout middleware - prevent hanging requests (30 second default)
app.use(timeoutMiddleware({ timeout: 30000 }));

// DEBUG: Track request entry
if (config.NODE_ENV === 'development') {
  app.use(debugMiddleware('1-REQUEST-ENTRY'));
}

// Security middleware
app.use(helmet());
app.use(cors({
  origin: config.NODE_ENV === 'production' ? process.env.ALLOWED_ORIGINS?.split(',') : '*',
  credentials: true
}));

// Rate limiting - more permissive in development
const limiter = rateLimit({
  windowMs: config.NODE_ENV === 'development' ? 60000 : config.RATE_LIMIT_WINDOW_MS, // 1 minute in dev, 15 minutes in prod
  max: config.NODE_ENV === 'development' ? 1000 : config.RATE_LIMIT_MAX_REQUESTS, // 1000/min in dev, 100/15min in prod
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api', limiter);

// DEBUG: After rate limiting
if (config.NODE_ENV === 'development') {
  app.use(debugMiddleware('2-AFTER-RATE-LIMIT'));
}

// Body parsing with JSON error handling for special characters
app.use(express.json({
  limit: '10mb',
  strict: false, // Allow more flexible JSON parsing
  verify: (req: any, res: any, buf: Buffer) => {
    req.rawBody = buf;
  }
}));

// JSON parsing error handler - moved AFTER routes to prevent interference
// This will be registered after all routes are defined

app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// DEBUG: After body parsing
if (config.NODE_ENV === 'development') {
  app.use(debugMiddleware('3-AFTER-BODY-PARSING'));
}

// Logging
if (config.NODE_ENV !== 'test') {
  app.use(morgan('combined'));
}

// DEBUG: After morgan
if (config.NODE_ENV === 'development') {
  app.use(debugMiddleware('4-AFTER-MORGAN'));
}

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: config.NODE_ENV,
    version: process.env.npm_package_version || '1.0.0'
  });
});

// Database health check
app.get('/health/db', async (_req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: 'healthy',
      database: 'connected'
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      database: 'disconnected',
      error: config.NODE_ENV === 'development' ? error : undefined
    });
  }
});

// Setup API documentation - extensive JSDoc annotations are complete
// Live documentation available via npm scripts (npm run docs:serve)
setupSwagger(app);

// Note: Use npm scripts for documentation generation:
// - npm run docs:serve - Live documentation server on port 8080
// - npm run docs:build - Generate static HTML documentation
// - npm run docs:generate - Complete documentation generation pipeline

// API routes
// API Health endpoint
app.get(`/api/${config.API_VERSION}/health`, (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: config.NODE_ENV,
    version: process.env.npm_package_version || '1.0.0',
    api_version: config.API_VERSION
  });
});

// Authentication routes (no organization context needed)
app.use(`/api/${config.API_VERSION}/auth`, authRoutes);

// Organization management routes
app.use(`/api/${config.API_VERSION}/organizations`, organizationRoutes);

// NEW: Multi-tenant routes with organizationId in URL (preferred pattern)
app.use(`/api/${config.API_VERSION}/organizations/:organizationId/customers`,
  config.NODE_ENV === 'development' ? debugMiddleware('5-CUSTOMER-ROUTE') : (req, res, next) => next(),
  validateOrganizationAccess,
  customerRoutes);
app.use(`/api/${config.API_VERSION}/organizations/:organizationId/quotes`, validateOrganizationAccess, quoteRoutes);
app.use(`/api/${config.API_VERSION}/organizations/:organizationId/appointments`, validateOrganizationAccess, appointmentRoutes);
// Invoice routes (includes PDF routes)
const invoiceRouter = Router();
invoiceRouter.use(invoiceRoutes);
invoiceRouter.use(invoicePdfRoutes);
app.use(`/api/${config.API_VERSION}/organizations/:organizationId/invoices`, validateOrganizationAccess, invoiceRouter);

app.use(`/api/${config.API_VERSION}/organizations/:organizationId/payments`,
  config.NODE_ENV === 'development' ? debugMiddleware('5-PAYMENT-ROUTE') : (req, res, next) => next(),
  config.NODE_ENV === 'development' ? debugOrganizationMiddleware : (req, res, next) => next(),
  validateOrganizationAccess,
  config.NODE_ENV === 'development' ? debugMiddleware('6-AFTER-ORG-VALIDATION') : (req, res, next) => next(),
  paymentRoutes);
app.use(`/api/${config.API_VERSION}/organizations/:organizationId/projects`, validateOrganizationAccess, projectRoutes);
app.use(`/api/${config.API_VERSION}/organizations/:organizationId/etransfers`, validateOrganizationAccess, etransferRoutes);
app.use(`/api/${config.API_VERSION}/organizations/:organizationId/manual-payments`, validateOrganizationAccess, manualPaymentRoutes);
app.use(`/api/${config.API_VERSION}/organizations/:organizationId/payment-analytics`, validateOrganizationAccess, paymentAnalyticsRoutes);
app.use(`/api/${config.API_VERSION}/organizations/:organizationId/users`, validateOrganizationAccess, userRoutes);
app.use(`/api/${config.API_VERSION}/organizations/:organizationId/audit`, validateOrganizationAccess, auditRoutes);
// app.use(`/api/${config.API_VERSION}/organizations/:organizationId/documents`, validateOrganizationAccess, documentRoutes);

// Invoice PDF routes (merged with invoice routes above on line 168)

// Organization settings and branding routes
app.use(`/api/${config.API_VERSION}/organizations/:organizationId/settings`, validateOrganizationAccess, organizationSettingsRoutes);

// Financial and accounting routes with organizationId
app.use(`/api/${config.API_VERSION}/organizations/:organizationId`, validateOrganizationAccess, accountingRoutes);
app.use(`/api/${config.API_VERSION}/organizations/:organizationId`, validateOrganizationAccess, taxRoutes);
app.use(`/api/${config.API_VERSION}/organizations/:organizationId`, validateOrganizationAccess, financialStatementsRoutes);

// LEGACY: Backward compatibility routes (JWT-based organizationId) - DEPRECATED
// These routes are deprecated and will be removed on 2026-01-01
app.use(`/api/${config.API_VERSION}/customers`,
  addDeprecationWarnings('/customers', '2026-01-01', '/api/v1/organizations/:orgId/customers'),
  customerRoutes);
app.use(`/api/${config.API_VERSION}/quotes`,
  addDeprecationWarnings('/quotes', '2026-01-01', '/api/v1/organizations/:orgId/quotes'),
  quoteRoutes);
app.use(`/api/${config.API_VERSION}/appointments`,
  addDeprecationWarnings('/appointments', '2026-01-01', '/api/v1/organizations/:orgId/appointments'),
  appointmentRoutes);
app.use(`/api/${config.API_VERSION}/invoices`,
  addDeprecationWarnings('/invoices', '2026-01-01', '/api/v1/organizations/:orgId/invoices'),
  invoiceRoutes);
app.use(`/api/${config.API_VERSION}/payments`,
  addDeprecationWarnings('/payments', '2026-01-01', '/api/v1/organizations/:orgId/payments'),
  config.NODE_ENV === 'development' ? debugMiddleware('5-LEGACY-PAYMENT-ROUTE') : (req, res, next) => next(),
  paymentRoutes);
app.use(`/api/${config.API_VERSION}/projects`,
  addDeprecationWarnings('/projects', '2026-01-01', '/api/v1/organizations/:orgId/projects'),
  projectRoutes);
app.use(`/api/${config.API_VERSION}/etransfers`,
  addDeprecationWarnings('/etransfers', '2026-01-01', '/api/v1/organizations/:orgId/etransfers'),
  etransferRoutes);
app.use(`/api/${config.API_VERSION}/manual-payments`,
  addDeprecationWarnings('/manual-payments', '2026-01-01', '/api/v1/organizations/:orgId/manual-payments'),
  manualPaymentRoutes);
app.use(`/api/${config.API_VERSION}/payment-analytics`,
  addDeprecationWarnings('/payment-analytics', '2026-01-01', '/api/v1/organizations/:orgId/payment-analytics'),
  paymentAnalyticsRoutes);
app.use(`/api/${config.API_VERSION}/users`,
  addDeprecationWarnings('/users', '2026-01-01', '/api/v1/organizations/:orgId/users'),
  userRoutes);
app.use(`/api/${config.API_VERSION}/audit`,
  addDeprecationWarnings('/audit', '2026-01-01', '/api/v1/organizations/:orgId/audit'),
  auditRoutes);
app.use(`/api/${config.API_VERSION}`,
  addDeprecationWarnings('/accounting', '2026-01-01', '/api/v1/organizations/:orgId/accounting'),
  accountingRoutes);
app.use(`/api/${config.API_VERSION}`,
  addDeprecationWarnings('/tax', '2026-01-01', '/api/v1/organizations/:orgId/tax'),
  taxRoutes);
app.use(`/api/${config.API_VERSION}`,
  addDeprecationWarnings('/financial-statements', '2026-01-01', '/api/v1/organizations/:orgId/financial-statements'),
  financialStatementsRoutes);

// JSON parsing error handler temporarily disabled to diagnose issue

// Error conversion middleware (convert common errors to AppErrors)
app.use(errorConverter);

// 404 handler
app.use(notFoundHandler);

// Global error handling middleware (must be last)
app.use(errorHandler);

// Graceful shutdown
const gracefulShutdown = async (): Promise<void> => {
  logger.info('Starting graceful shutdown');

  try {
    await prisma.$disconnect();
    logger.info('Database connection closed');

    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown', error);
    process.exit(1);
  }
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

export default app;