import { createApp } from './app.js';
import { env } from './config/env.js';
import { dbPool } from './config/db.js';
import { redisClient } from './config/redis.js';
import { emailQueue } from './queues/email.queue.js';
import { startEmailWorker, closeEmailWorker } from './workers/email.worker.js';
import { ReconciliationService } from './services/reconciliation.service.js';
import { ElasticsearchService } from './services/elasticsearch.service.js';

const app = createApp();

const server = app.listen(env.PORT, async () => {
  console.log(`🚀 ReachInbox Backend running on port ${env.PORT} in ${env.NODE_ENV} mode`);
  console.log(`🩺 Health check available at: http://localhost:${env.PORT}/health`);

  // Initialize Elasticsearch index mapping
  await ElasticsearchService.initIndex();

  // Run startup reconciliation: recover missing delayed jobs without duplication
  await ReconciliationService.reconcileScheduledEmails();

  // Start BullMQ Worker
  startEmailWorker();
});

const gracefulShutdown = async (signal: string) => {
  console.log(`\n🛑 Received ${signal}, initiating graceful shutdown...`);
  server.close(async () => {
    console.log('🔒 HTTP server closed');

    try {
      await closeEmailWorker();
    } catch (err) {
      console.error('Error closing email worker:', err);
    }

    try {
      await emailQueue.close();
      console.log('🔒 Email queue closed');
    } catch (err) {
      console.error('Error closing email queue:', err);
    }

    try {
      await redisClient.quit();
      console.log('🔒 Redis connection closed');
    } catch (err) {
      console.error('Error closing Redis connection:', err);
    }

    try {
      await dbPool.end();
      console.log('🔒 PostgreSQL pool closed');
    } catch (err) {
      console.error('Error closing PostgreSQL pool:', err);
    }

    try {
      const { prisma } = await import('./config/prisma.js');
      await prisma.$disconnect();
      console.log('🔒 Prisma disconnected');
    } catch (err) {
      console.error('Error disconnecting Prisma:', err);
    }

    process.exit(0);
  });

  // Force shutdown after 10 seconds if graceful close hangs
  setTimeout(() => {
    console.error('⚠️ Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
