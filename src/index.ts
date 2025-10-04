import app from './app';
import { config } from './config/config';
import { logger } from './utils/logger';
import { prisma } from './config/database';
// TEMP DISABLED: import { eTransferOrchestrator } from './services/etransfer-orchestrator.service';

async function startServer(): Promise<void> {
  try {
    // Test database connection
    await prisma.$connect();
    logger.info('Database connected successfully');

    // TEMP DISABLED: Start e-Transfer automation (if configured)
    // if (process.env.ETRANSFER_EMAIL_USER && process.env.ETRANSFER_EMAIL_PASSWORD) {
    //   try {
    //     await eTransferOrchestrator.start();
    //     logger.info('E-Transfer automation started successfully');
    //   } catch (error) {
    //     logger.warn('E-Transfer automation failed to start', { error });
    //     // Don't fail server startup if email monitoring fails
    //   }
    // } else {
    logger.info('E-Transfer automation temporarily disabled due to etransfer-email-parser.service.ts compilation errors');
    // }

    // Start server
    const server = app.listen(config.PORT, () => {
      logger.info('Accounting API Server started', {
        environment: config.NODE_ENV,
        port: config.PORT,
        apiVersion: config.API_VERSION,
        message: 'Bank-Level Secure REST API ready to accept connections'
      });
    });

    // Handle server errors
    server.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`❌ Port ${config.PORT} is already in use`);
      } else {
        console.error('❌ Server error:', error);
      }
      process.exit(1);
    });

    // Graceful shutdown
    const gracefulShutdown = async (signal: string): Promise<void> => {
      logger.info(`${signal} received. Starting graceful shutdown...`);

      // TEMP DISABLED: Stop e-Transfer orchestrator
      // await eTransferOrchestrator.stop();

      // Close database connection
      await prisma.$disconnect();

      // Close server
      server.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });

      // Force exit after 30 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 30000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Handle uncaught errors
process.on('uncaughtException', (error: Error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the server
startServer().catch(error => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});
