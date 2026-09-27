import { createServer } from 'http';
import app from './app.js';
import env from './config/env.js';
import connectDB from './config/db.js';
import { initSocket } from './utils/socketManager.js';

const startServer = async () => {
  // Connect to MongoDB
  await connectDB();

  // Create HTTP server
  const httpServer = createServer(app);

  // Initialize Socket.IO
  initSocket(httpServer);

  // Start HTTP server
  const server = httpServer.listen(env.PORT, '0.0.0.0', () => {
    console.log(`\n🚀 ABES Autonomy API Server`);
    console.log(`   Environment: ${env.NODE_ENV}`);
    console.log(`   Port:        ${env.PORT}`);
    console.log(`   API:         http://localhost:${env.PORT}/api`);
    console.log(`   Health:      http://localhost:${env.PORT}/api/health\n`);
  });

  // Graceful shutdown
  const shutdown = (signal) => {
    console.log(`\n${signal} received. Shutting down gracefully...`);
    server.close(() => {
      console.log('Server closed.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

process.on('uncaughtException', (err) => {
  console.error('CRITICAL: Uncaught Exception:', err);
  // Optional: process.exit(1); depending on whether we want to risk corrupted state
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('CRITICAL: Unhandled Rejection at:', promise, 'reason:', reason);
});

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
