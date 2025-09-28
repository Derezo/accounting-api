import app from './app';
import { config } from './config/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function startServer(): Promise<void> {
  try {
    // Test database connection
    await prisma.$connect();
    console.log('✅ Database connected successfully');

    // Start server
    const server = app.listen(config.PORT, () => {
      console.log(`
╔════════════════════════════════════════════════════════╗
║                                                        ║
║     Accounting API Server                             ║
║     Bank-Level Secure REST API                        ║
║                                                        ║
║     Environment: ${config.NODE_ENV.padEnd(37)}║
║     Port: ${String(config.PORT).padEnd(44)}║
║     API Version: ${config.API_VERSION.padEnd(37)}║
║                                                        ║
║     Ready to accept connections...                    ║
║                                                        ║
╚════════════════════════════════════════════════════════╝
      `);
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