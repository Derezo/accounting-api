import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { rateLimit } from 'express-rate-limit';
import { config } from './config/config';
import { PrismaClient } from '@prisma/client';
// import { setupSwagger } from './config/swagger.config';

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

const app: Application = express();
const prisma = new PrismaClient();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: config.NODE_ENV === 'production' ? process.env.ALLOWED_ORIGINS?.split(',') : '*',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_MAX_REQUESTS,
  message: 'Too many requests from this IP, please try again later.'
});

app.use('/api', limiter);

// Body parsing with JSON error handling
app.use(express.json({
  limit: '10mb',
  verify: (req: Request, res: Response, buf: Buffer) => {
    try {
      JSON.parse(buf.toString());
    } catch (error) {
      if (error instanceof SyntaxError) {
        res.status(400).json({
          error: 'Invalid JSON',
          message: 'Request body contains malformed JSON. Please ensure special characters in strings are properly escaped.',
          details: config.NODE_ENV === 'development' ? error.message : undefined
        });
        return;
      }
      throw error;
    }
  }
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
if (config.NODE_ENV !== 'test') {
  app.use(morgan('combined'));
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
// setupSwagger(app);

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

app.use(`/api/${config.API_VERSION}/auth`, authRoutes);
app.use(`/api/${config.API_VERSION}/organizations`, organizationRoutes);
app.use(`/api/${config.API_VERSION}/customers`, customerRoutes);
app.use(`/api/${config.API_VERSION}/quotes`, quoteRoutes);
app.use(`/api/${config.API_VERSION}/appointments`, appointmentRoutes);
app.use(`/api/${config.API_VERSION}/invoices`, invoiceRoutes);
app.use(`/api/${config.API_VERSION}/payments`, paymentRoutes);
app.use(`/api/${config.API_VERSION}/projects`, projectRoutes);
app.use(`/api/${config.API_VERSION}/etransfers`, etransferRoutes);
app.use(`/api/${config.API_VERSION}/manual-payments`, manualPaymentRoutes);
app.use(`/api/${config.API_VERSION}/payment-analytics`, paymentAnalyticsRoutes);

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not Found',
    message: 'The requested resource does not exist.'
  });
});

// Error handling middleware
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err.stack);

  const isDevelopment = config.NODE_ENV === 'development';

  res.status(500).json({
    error: 'Internal Server Error',
    message: isDevelopment ? err.message : 'An unexpected error occurred.',
    stack: isDevelopment ? err.stack : undefined
  });
});

// Graceful shutdown
const gracefulShutdown = async (): Promise<void> => {
  console.log('Starting graceful shutdown...');

  try {
    await prisma.$disconnect();
    console.log('Database connection closed.');

    process.exit(0);
  } catch (error) {
    console.error('Error during graceful shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

export default app;