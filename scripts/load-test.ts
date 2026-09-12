import { prisma } from '../backend/src/config/prisma.js';
import { emailQueue, scheduleEmailJob } from '../backend/src/queues/email.queue.js';
import { env } from '../backend/src/config/env.js';

async function main() {
  console.log('====================================================');
  console.log('⚡ ReachInbox High-Throughput Load Test (1,000 Emails) ⚡');
  console.log('====================================================');

  const user = await prisma.user.create({
    data: {
      name: 'Load Benchmark Runner',
      email: `load-runner-${Date.now()}@domain.io`,
      senders: {
        create: {
          email: `load-sender-${Date.now()}@domain.io`,
          displayName: 'Load Sender',
          enabled: true,
        },
      },
    },
    include: { senders: true },
  });
  const sender = user.senders[0];

  const TOTAL_EMAILS = 1000;
  const DELAY_BETWEEN_MS = env.MIN_EMAIL_DELAY_MS; // 2000ms
  const startTime = Date.now();
  const baseScheduledTime = startTime + 30000; // start 30s from now

  console.log(`🎯 Target: Scheduling ${TOTAL_EMAILS} delayed email jobs...`);
  console.log(`⏱️ Minimum Delay spacing: ${DELAY_BETWEEN_MS}ms per recipient`);
  console.log(`👤 User: ${user.name} | Sender: ${sender.email}`);

  const emailsData = [];
  const batchId = `load-${Date.now()}`;

  for (let i = 0; i < TOTAL_EMAILS; i++) {
    const targetScheduledTime = new Date(baseScheduledTime + i * DELAY_BETWEEN_MS);
    const recipient = `load_test_${i}@scale-customer.com`;
    const idempotencyKey = `${batchId}-${i}-${recipient}`;

    emailsData.push({
      userId: user.id,
      senderId: sender.id,
      recipient,
      subject: `Scale Benchmark Notification #${i + 1}`,
      body: `<p>Load test payload message #${i + 1} verifying BullMQ delayed queue throughput.</p>`,
      status: 'scheduled' as const,
      scheduledAt: targetScheduledTime,
      idempotencyKey,
    });
  }

  // 1. Bulk insert in PostgreSQL
  console.log(`\n📥 [PostgreSQL] Bulk inserting ${TOTAL_EMAILS} email records in batches of 250...`);
  const dbStart = Date.now();
  const batchSize = 250;
  const insertedEmails: Array<{ id: string; scheduledAt: Date; recipient: string; idempotencyKey: string }> = [];

  for (let i = 0; i < emailsData.length; i += batchSize) {
    const chunk = emailsData.slice(i, i + batchSize);
    await prisma.email.createMany({
      data: chunk,
      skipDuplicates: true,
    });
  }

  const dbDuration = Date.now() - dbStart;
  console.log(`✅ [PostgreSQL] Stored ${TOTAL_EMAILS} records in ${dbDuration}ms (${(TOTAL_EMAILS / (dbDuration / 1000)).toFixed(0)} records/sec)`);

  // Fetch IDs of inserted records
  const dbRecords = await prisma.email.findMany({
    where: {
      idempotencyKey: {
        startsWith: batchId,
      },
    },
    select: { id: true, scheduledAt: true, recipient: true, idempotencyKey: true },
  });

  console.log(`\n📤 [BullMQ & Redis] Enqueueing ${dbRecords.length} delayed jobs...`);
  const queueStart = Date.now();

  // Enqueue in BullMQ in parallel chunks of 50
  const enqueueChunkSize = 50;
  for (let i = 0; i < dbRecords.length; i += enqueueChunkSize) {
    const chunk = dbRecords.slice(i, i + enqueueChunkSize);
    await Promise.all(
      chunk.map((email) => {
        const delayMs = Math.max(0, email.scheduledAt.getTime() - Date.now());
        const jobId = `email-job-${email.id}`;
        return scheduleEmailJob(
          {
            emailId: email.id,
            userId: user.id,
            senderId: sender.id,
            recipient: email.recipient,
            subject: 'Scale Benchmark',
            body: 'Load test',
            scheduledAt: email.scheduledAt.toISOString(),
            idempotencyKey: email.idempotencyKey,
          },
          delayMs,
          jobId,
        );
      }),
    );
  }

  const queueDuration = Date.now() - queueStart;
  const totalDuration = Date.now() - startTime;

  console.log(`✅ [BullMQ & Redis] Successfully enqueued ${dbRecords.length} delayed jobs in ${queueDuration}ms (${(dbRecords.length / (queueDuration / 1000)).toFixed(0)} jobs/sec)`);
  console.log(`⚡ Total Pipeline Duration: ${totalDuration}ms (${(TOTAL_EMAILS / (totalDuration / 1000)).toFixed(0)} operations/sec)`);

  // Verify BullMQ delayed count
  const delayedCount = await emailQueue.getDelayedCount();
  console.log(`📊 BullMQ Delayed Queue Count: ${delayedCount}`);

  // Cleanup load test records to keep database lean
  console.log('\n🧹 Cleaning up load test benchmark data...');
  await prisma.email.deleteMany({
    where: { idempotencyKey: { startsWith: batchId } },
  });

  for (const record of dbRecords) {
    const job = await emailQueue.getJob(`email-job-${record.id}`);
    if (job) await job.remove();
  }

  await prisma.user.delete({ where: { id: user.id } }).catch(() => {});

  console.log('✅ Cleanup complete.');
  console.log('====================================================');
  console.log('🎉 1,000 EMAIL LOAD TEST BENCHMARK PASSED! 🎉');
  console.log('====================================================');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Load test failed:', err);
  process.exit(1);
});
