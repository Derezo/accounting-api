import express, { Application, Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { rateLimit } from "express-rate-limit";
import { config } from "./config/config";

import { setupSwagger } from "./config/swagger.config";

// Import routes
import authRoutes from "./routes/auth.routes";
import organizationRoutes from "./routes/organization.routes";
import domainVerificationRoutes from "./routes/domain-verification.routes";
import customerRoutes from "./routes/customer.routes";
import quoteRoutes from "./routes/quote.routes";
import appointmentRoutes from "./routes/appointment.routes";
import invoiceRoutes from "./routes/invoice.routes";
import paymentRoutes from "./routes/payment.routes";
import projectRoutes from "./routes/project.routes";
import etransferRoutes from "./routes/etransfer.routes";
import manualPaymentRoutes from "./routes/manual-payment.routes";
import etransferReviewRoutes from "./routes/etransfer-review.routes";
import paymentAnalyticsRoutes from "./routes/payment-analytics.routes";
import userRoutes from "./routes/user.routes";
import auditRoutes from "./routes/audit.routes";
// import documentRoutes from './routes/document.routes';
import accountingRoutes from "./routes/accounting.routes";
import taxRoutes from "./routes/tax.routes";
import financialStatementsRoutes from "./routes/financial-statements.routes";
import invoicePdfRoutes from "./routes/invoice-pdf.routes";
import organizationSettingsRoutes from "./routes/organization-settings.routes";
import vendorRoutes from "./routes/vendor.routes";
import purchaseOrderRoutes from "./routes/purchase-order.routes";
import billRoutes from "./routes/bill.routes";
import inventoryRoutes from "./routes/inventory.routes";
import publicIntakeRoutes from "./routes/public-intake.routes";
import publicQuoteRoutes from "./routes/public-quote.routes";
import publicAppointmentRoutes from "./routes/public-appointment.routes";
import publicPaymentRoutes from "./routes/public-payment.routes";
import intakeFormV2Routes from "./routes/intake-form-v2.routes";
import googleOAuthRoutes from "./routes/google-oauth.routes";
import calendarSyncRoutes from "./routes/calendar-sync.routes";
import adminSystemRoutes from "./routes/admin-system.routes";
import systemAnalyticsRoutes from "./routes/system-analytics.routes";
import systemIntegrationsRoutes from "./routes/system-integrations.routes";
import featureToggleRoutes from "./routes/feature-toggle.routes";
import maintenanceWindowRoutes from "./routes/maintenance-window.routes";
import subscriptionPlanRoutes from "./routes/subscription-plan.routes";
import systemUsersRoutes from "./routes/system-users.routes";
import systemBackupRoutes from "./routes/system-backup.routes";

import { prisma } from "./config/database";
import { logger } from "./utils/logger";
import {
  validateOrganizationAccess,
  getOrganizationId,
} from "./middleware/organization.middleware";
import { authenticate } from "./middleware/auth.middleware";
import { requireMasterOrgSuperAdmin } from "./middleware/master-org.middleware";
import {
  errorHandler,
  errorConverter,
  notFoundHandler,
  requestIdMiddleware,
} from "./middleware/error-handler.middleware";
import {
  debugMiddleware,
  debugOrganizationMiddleware,
} from "./middleware/debug.middleware";
import { timeoutMiddleware } from "./middleware/timeout.middleware";
import { addDeprecationWarnings } from "./middleware/api-deprecation.middleware";
import { Router } from "express";
const app: Application = express();

// Request ID middleware for error tracking
app.use(requestIdMiddleware);

// Timeout middleware - prevent hanging requests (30 second default)
app.use(timeoutMiddleware({ timeout: 30000 }));

// DEBUG: Track request entry
if (config.NODE_ENV === "development") {
  app.use(debugMiddleware("1-REQUEST-ENTRY"));
}

// Security middleware
app.use(helmet());
app.use(
  cors({
    origin:
      config.NODE_ENV === "production"
        ? process.env.ALLOWED_ORIGINS?.split(",")
        : "*",
    credentials: true,
  })
);

// Rate limiting - more permissive in development
const limiter = rateLimit({
  windowMs:
    config.NODE_ENV === "development" ? 60000 : config.RATE_LIMIT_WINDOW_MS, // 1 minute in dev, 15 minutes in prod
  max:
    config.NODE_ENV === "development" ? 1000 : config.RATE_LIMIT_MAX_REQUESTS, // 1000/min in dev, 100/15min in prod
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/api", limiter);

// DEBUG: After rate limiting
if (config.NODE_ENV === "development") {
  app.use(debugMiddleware("2-AFTER-RATE-LIMIT"));
}

// Custom JSON body parser to handle special characters in passwords
app.use((req: any, res: any, next: any) => {
  if (req.is('application/json')) {
    let data = '';
    req.setEncoding('utf8');

    req.on('data', (chunk: string) => {
      data += chunk;
    });

    req.on('end', () => {
      try {
        // Store raw body for webhook verification if needed
        req.rawBody = Buffer.from(data, 'utf8');

        // Parse JSON directly without express.json() interference
        req.body = data ? JSON.parse(data) : {};
        next();
      } catch (error: any) {
        res.status(400).json({
          error: 'INVALID_JSON',
          message: 'Invalid JSON in request body',
          details: error.message
        });
      }
    });

    req.on('error', (error: any) => {
      res.status(400).json({
        error: 'REQUEST_ERROR',
        message: 'Error reading request body',
        details: error.message
      });
    });
  } else {
    next();
  }
});

// JSON parsing error handler - moved AFTER routes to prevent interference
// This will be registered after all routes are defined

app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// DEBUG: After body parsing
if (config.NODE_ENV === "development") {
  app.use(debugMiddleware("3-AFTER-BODY-PARSING"));
}

// Logging
if (config.NODE_ENV !== "test") {
  app.use(morgan("combined"));
}

// DEBUG: After morgan
if (config.NODE_ENV === "development") {
  app.use(debugMiddleware("4-AFTER-MORGAN"));
}

// Health check
app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    environment: config.NODE_ENV,
    version: process.env.npm_package_version || "1.0.0",
  });
});

// Database health check
app.get("/health/db", async (_req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: "healthy",
      database: "connected",
    });
  } catch (error) {
    res.status(503).json({
      status: "unhealthy",
      database: "disconnected",
      error: config.NODE_ENV === "development" ? error : undefined,
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
    status: "healthy",
    timestamp: new Date().toISOString(),
    environment: config.NODE_ENV,
    version: process.env.npm_package_version || "1.0.0",
    api_version: config.API_VERSION,
  });
});

// Authentication routes (no organization context needed)
app.use(`/api/${config.API_VERSION}/auth`, authRoutes);

// Google OAuth routes (no organization context needed)
app.use(`/api/${config.API_VERSION}/auth/google`, googleOAuthRoutes);

// Organization management routes
app.use(`/api/${config.API_VERSION}/organizations`, organizationRoutes);

// Domain verification routes (part of organization management)
app.use(`/api/${config.API_VERSION}/organizations`, domainVerificationRoutes);

// Admin system routes (SUPER_ADMIN only, master org required)
app.use(
  `/api/${config.API_VERSION}/admin/system`,
  authenticate as any,
  requireMasterOrgSuperAdmin as any,
  adminSystemRoutes
);

// Admin analytics routes (SUPER_ADMIN only, master org required)
app.use(
  `/api/${config.API_VERSION}/admin/analytics`,
  authenticate as any,
  requireMasterOrgSuperAdmin as any,
  systemAnalyticsRoutes
);

// Admin integrations routes (SUPER_ADMIN or ADMIN, authentication required)
app.use(
  `/api/${config.API_VERSION}/admin/integrations`,
  authenticate as any,
  systemIntegrationsRoutes
);

// Admin feature toggles routes (SUPER_ADMIN only, master org required)
app.use(
  `/api/${config.API_VERSION}/admin/feature-toggles`,
  authenticate as any,
  requireMasterOrgSuperAdmin as any,
  featureToggleRoutes
);

// Admin maintenance windows routes (SUPER_ADMIN only, master org required)

// Admin subscription plan routes (SUPER_ADMIN only, master org required)
app.use(
  `/api/${config.API_VERSION}/admin/subscription-plans`,
  authenticate as any,
  requireMasterOrgSuperAdmin as any,
  subscriptionPlanRoutes
);

// Admin organization subscription routes (SUPER_ADMIN only, master org required)
app.use(
  `/api/${config.API_VERSION}/admin/subscriptions`,
  authenticate as any,
  requireMasterOrgSuperAdmin as any,
  subscriptionPlanRoutes
);
app.use(
  `/api/${config.API_VERSION}/admin/maintenance-windows`,
  authenticate as any,
  requireMasterOrgSuperAdmin as any,
  maintenanceWindowRoutes
);

// Admin users routes (SUPER_ADMIN only, master org required)
app.use(
  `/api/${config.API_VERSION}/admin/users`,
  authenticate as any,
  requireMasterOrgSuperAdmin as any,
  systemUsersRoutes
);

// Admin backups routes (SUPER_ADMIN only, master org required)
app.use(
  `/api/${config.API_VERSION}/admin/backups`,
  authenticate as any,
  requireMasterOrgSuperAdmin as any,
  systemBackupRoutes
);

// Public intake routes (no authentication required)
app.use(`/api/${config.API_VERSION}/public/intake`, publicIntakeRoutes);

// Public quote routes (no authentication required, secured with tokens)
app.use(`/api/${config.API_VERSION}/public/quotes`, publicQuoteRoutes);

// Public appointment routes (no authentication required, secured with tokens)
app.use(`/api/${config.API_VERSION}/public/appointments`, publicAppointmentRoutes);

// V2 Intake Form routes (template-based, mixed auth)
app.use(`/api/v2`, intakeFormV2Routes);

// Public payment portal routes (no authentication required, secured with tokens)
app.use(`/api/${config.API_VERSION}/public/payment`, publicPaymentRoutes);

// NEW: Multi-tenant routes with organizationId in URL (preferred pattern)
app.use(
  `/api/${config.API_VERSION}/organizations/:organizationId/customers`,
  config.NODE_ENV === "development"
    ? debugMiddleware("5-CUSTOMER-ROUTE")
    : (req, res, next) => next(),
  authenticate,
  validateOrganizationAccess,
  customerRoutes
);
app.use(
  `/api/${config.API_VERSION}/organizations/:organizationId/quotes`,
  authenticate,
  validateOrganizationAccess,
  quoteRoutes
);
app.use(
  `/api/${config.API_VERSION}/organizations/:organizationId/appointments`,
  authenticate,
  validateOrganizationAccess,
  appointmentRoutes
);
// Invoice routes (includes PDF routes)
// IMPORTANT: PDF routes MUST be registered BEFORE invoice routes
// because invoice routes have /:id which would catch /templates and /styles
const invoiceRouter = Router();
invoiceRouter.use(invoicePdfRoutes);  // Register PDF routes first
invoiceRouter.use(invoiceRoutes);      // Register invoice routes second
app.use(
  `/api/${config.API_VERSION}/organizations/:organizationId/invoices`,
  authenticate,
  validateOrganizationAccess,
  invoiceRouter
);

app.use(
  `/api/${config.API_VERSION}/organizations/:organizationId/payments`,
  config.NODE_ENV === "development"
    ? debugMiddleware("5-PAYMENT-ROUTE")
    : (req, res, next) => next(),
  config.NODE_ENV === "development"
    ? debugOrganizationMiddleware
    : (req, res, next) => next(),
  authenticate,
  validateOrganizationAccess,
  config.NODE_ENV === "development"
    ? debugMiddleware("6-AFTER-ORG-VALIDATION")
    : (req, res, next) => next(),
  paymentRoutes
);
app.use(
  `/api/${config.API_VERSION}/organizations/:organizationId/projects`,
  authenticate,
  validateOrganizationAccess,
  projectRoutes
);
app.use(
  `/api/${config.API_VERSION}/organizations/:organizationId/etransfers`,
  authenticate,
  validateOrganizationAccess,
  etransferRoutes
);
app.use(
  `/api/${config.API_VERSION}/organizations/:organizationId/etransfer/review`,
  authenticate,
  validateOrganizationAccess,
  etransferReviewRoutes
);
app.use(
  `/api/${config.API_VERSION}/organizations/:organizationId/manual-payments`,
  authenticate,
  validateOrganizationAccess,
  manualPaymentRoutes
);
app.use(
  `/api/${config.API_VERSION}/organizations/:organizationId/payment-analytics`,
  authenticate,
  validateOrganizationAccess,
  paymentAnalyticsRoutes
);
app.use(
  `/api/${config.API_VERSION}/organizations/:organizationId/users`,
  authenticate,
  validateOrganizationAccess,
  userRoutes
);
app.use(
  `/api/${config.API_VERSION}/organizations/:organizationId/audit`,
  authenticate,
  validateOrganizationAccess,
  auditRoutes
);
// app.use(`/api/${config.API_VERSION}/organizations/:organizationId/documents`, validateOrganizationAccess, documentRoutes);

// Calendar sync routes
app.use(
  `/api/${config.API_VERSION}/organizations/:organizationId/sync/calendar`,
  authenticate,
  validateOrganizationAccess,
  calendarSyncRoutes
);

// Invoice PDF routes (merged with invoice routes above on line 168)

// Organization settings and branding routes
app.use(
  `/api/${config.API_VERSION}/organizations/:organizationId/settings`,
  validateOrganizationAccess,
  organizationSettingsRoutes
);

// Vendor and purchase order routes
app.use(
  `/api/${config.API_VERSION}/organizations/:organizationId/vendors`,
  validateOrganizationAccess,
  vendorRoutes
);
app.use(
  `/api/${config.API_VERSION}/organizations/:organizationId/purchase-orders`,
  validateOrganizationAccess,
  purchaseOrderRoutes
);
app.use(
  `/api/${config.API_VERSION}/organizations/:organizationId/bills`,
  validateOrganizationAccess,
  billRoutes
);
app.use(
  `/api/${config.API_VERSION}/organizations/:organizationId/inventory`,
  validateOrganizationAccess,
  inventoryRoutes
);

// Financial and accounting routes with organizationId
app.use(
  `/api/${config.API_VERSION}/organizations/:organizationId`,
  validateOrganizationAccess,
  accountingRoutes
);
app.use(
  `/api/${config.API_VERSION}/organizations/:organizationId`,
  validateOrganizationAccess,
  taxRoutes
);
app.use(
  `/api/${config.API_VERSION}/organizations/:organizationId`,
  validateOrganizationAccess,
  financialStatementsRoutes
);

// LEGACY: Backward compatibility routes (JWT-based organizationId) - DEPRECATED
// These routes are deprecated and will be removed on 2026-01-01
app.use(
  `/api/${config.API_VERSION}/customers`,
  addDeprecationWarnings(
    "/customers",
    "2026-01-01",
    "/api/v1/organizations/:orgId/customers"
  ),
  customerRoutes
);
app.use(
  `/api/${config.API_VERSION}/quotes`,
  addDeprecationWarnings(
    "/quotes",
    "2026-01-01",
    "/api/v1/organizations/:orgId/quotes"
  ),
  quoteRoutes
);
app.use(
  `/api/${config.API_VERSION}/appointments`,
  addDeprecationWarnings(
    "/appointments",
    "2026-01-01",
    "/api/v1/organizations/:orgId/appointments"
  ),
  appointmentRoutes
);
app.use(
  `/api/${config.API_VERSION}/invoices`,
  addDeprecationWarnings(
    "/invoices",
    "2026-01-01",
    "/api/v1/organizations/:orgId/invoices"
  ),
  invoiceRoutes
);
app.use(
  `/api/${config.API_VERSION}/payments`,
  addDeprecationWarnings(
    "/payments",
    "2026-01-01",
    "/api/v1/organizations/:orgId/payments"
  ),
  config.NODE_ENV === "development"
    ? debugMiddleware("5-LEGACY-PAYMENT-ROUTE")
    : (req, res, next) => next(),
  paymentRoutes
);
app.use(
  `/api/${config.API_VERSION}/projects`,
  addDeprecationWarnings(
    "/projects",
    "2026-01-01",
    "/api/v1/organizations/:orgId/projects"
  ),
  projectRoutes
);
app.use(
  `/api/${config.API_VERSION}/etransfers`,
  addDeprecationWarnings(
    "/etransfers",
    "2026-01-01",
    "/api/v1/organizations/:orgId/etransfers"
  ),
  etransferRoutes
);
app.use(
  `/api/${config.API_VERSION}/manual-payments`,
  addDeprecationWarnings(
    "/manual-payments",
    "2026-01-01",
    "/api/v1/organizations/:orgId/manual-payments"
  ),
  manualPaymentRoutes
);
app.use(
  `/api/${config.API_VERSION}/payment-analytics`,
  addDeprecationWarnings(
    "/payment-analytics",
    "2026-01-01",
    "/api/v1/organizations/:orgId/payment-analytics"
  ),
  paymentAnalyticsRoutes
);
app.use(
  `/api/${config.API_VERSION}/users`,
  addDeprecationWarnings(
    "/users",
    "2026-01-01",
    "/api/v1/organizations/:orgId/users"
  ),
  userRoutes
);
app.use(
  `/api/${config.API_VERSION}/audit`,
  addDeprecationWarnings(
    "/audit",
    "2026-01-01",
    "/api/v1/organizations/:orgId/audit"
  ),
  auditRoutes
);
app.use(
  `/api/${config.API_VERSION}`,
  addDeprecationWarnings(
    "/accounting",
    "2026-01-01",
    "/api/v1/organizations/:orgId/accounting"
  ),
  accountingRoutes
);
app.use(
  `/api/${config.API_VERSION}`,
  addDeprecationWarnings(
    "/tax",
    "2026-01-01",
    "/api/v1/organizations/:orgId/tax"
  ),
  taxRoutes
);
app.use(
  `/api/${config.API_VERSION}`,
  addDeprecationWarnings(
    "/financial-statements",
    "2026-01-01",
    "/api/v1/organizations/:orgId/financial-statements"
  ),
  financialStatementsRoutes
);

// JSON parsing error handler temporarily disabled to diagnose issue

// Error conversion middleware (convert common errors to AppErrors)
app.use(errorConverter);

// 404 handler
app.use(notFoundHandler);

// Global error handling middleware (must be last)
app.use(errorHandler);

// Graceful shutdown
const gracefulShutdown = async (): Promise<void> => {
  logger.info("Starting graceful shutdown");

  try {
    await prisma.$disconnect();
    logger.info("Database connection closed");

    process.exit(0);
  } catch (error) {
    logger.error("Error during graceful shutdown", error);
    process.exit(1);
  }
};

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);

export default app;
