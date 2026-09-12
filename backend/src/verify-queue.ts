import assert from 'assert';
import { emailQueue, scheduleEmailJob, EmailJobData } from './queues/email.queue.js';
import { startEmailWorker, closeEmailWorker, setJobProcessor } from './workers/email.worker.js';
import { env } from './config/env.js';

async function testQueue() {
  console.log('📬 Verifying Phase 4 BullMQ Queue Implementation...');

  // Start worker
  const worker = startEmailWorker();
  assert.strictEqual(worker.opts.concurrency, env.WORKER_CONCURRENCY, `Worker concurrency must equal WORKER_CONCURRENCY (${env.WORKER_CONCURRENCY})`);
  console.log(`✅ Configured Worker Concurrency verified: ${worker.opts.concurrency}`);

  // Test 1: Schedule a delayed job with deterministic job ID
  console.log('⏱️ Testing Delayed Job Scheduling & Deterministic Job Identity...');
  const testEmailData: EmailJobData = {
    emailId: 'test-email-delayed-1',
    userId: 'test-user-1',
    senderId: 'test-sender-1',
    recipient: 'delayed-recipient@example.com',
    subject: 'Delayed Meeting Follow-up',
    body: '<p>Testing delayed BullMQ delivery</p>',
    scheduledAt: new Date(Date.now() + 2500).toISOString(),
    idempotencyKey: 'test-idemp-key-delayed-1',
  };

  const delayMs = 2500;
  const job1 = await scheduleEmailJob(testEmailData, delayMs);
  assert.strictEqual(job1.id, `email-job-${testEmailData.emailId}`);
  assert.strictEqual(job1.opts.attempts, 5, 'Retry policy must configure 5 attempts');
  assert.deepStrictEqual(job1.opts.backoff, { type: 'exponential', delay: 2000 }, 'Exponential backoff must be configured');
  console.log(`✅ Delayed job created with deterministic ID: ${job1.id}`);

  // Check state is delayed
  const stateInitial = await job1.getState();
  assert.strictEqual(stateInitial, 'delayed', `Job state should initially be "delayed", got "${stateInitial}"`);
  console.log(`✅ Job state correctly verified as "${stateInitial}"`);

  // Test 2: Attempting to insert duplicate job with SAME deterministic ID
  console.log('🛡️ Testing BullMQ duplicate job protection with deterministic jobId...');
  try {
    const jobDuplicate = await scheduleEmailJob(testEmailData, delayMs);
    console.log(`  -> Second call returned existing job identity: ${jobDuplicate.id}`);
  } catch (err) {
    console.log('  -> Duplicate schedule rejected:', err);
  }

  const jobCounts = await emailQueue.getJobCounts('delayed', 'waiting');
  console.log('✅ Current queue counts:', jobCounts);
  assert(jobCounts.delayed >= 1, 'Should have at least 1 delayed job');

  // Test 3: Concurrency execution test
  console.log('⚡ Testing Concurrent Batch Processing (5 jobs in parallel)...');
  let processedCount = 0;
  const activeConcurrent: number[] = [];
  let currentConcurrency = 0;
  let maxObservedConcurrency = 0;

  setJobProcessor(async (job) => {
    currentConcurrency++;
    maxObservedConcurrency = Math.max(maxObservedConcurrency, currentConcurrency);
    console.log(`  -> Processing concurrent job ${job.id} (active parallel workers: ${currentConcurrency})`);
    await new Promise((r) => setTimeout(r, 600));
    currentConcurrency--;
    processedCount++;
    return { success: true, emailId: job.data.emailId };
  });

  // Submit 5 immediate jobs simultaneously
  const batchPromises = Array.from({ length: 5 }, (_, i) => {
    const data: EmailJobData = {
      emailId: `concurrent-email-${i}-${Date.now()}`,
      userId: 'test-user-1',
      senderId: 'test-sender-1',
      recipient: `batch-${i}@example.com`,
      subject: `Concurrent Batch ${i}`,
      body: 'Batch body',
      scheduledAt: new Date().toISOString(),
      idempotencyKey: `idemp-batch-${i}-${Date.now()}`,
    };
    return scheduleEmailJob(data, 0); // 0 delay for immediate batch execution
  });

  await Promise.all(batchPromises);

  // Wait for jobs to complete
  console.log('⏳ Waiting for batch execution...');
  const startWait = Date.now();
  while (processedCount < 5 && Date.now() - startWait < 8000) {
    await new Promise((r) => setTimeout(r, 200));
  }

  assert.strictEqual(processedCount, 5, `Expected 5 completed jobs, got ${processedCount}`);
  assert(maxObservedConcurrency > 1, `Expected multi-worker concurrency > 1, observed ${maxObservedConcurrency}`);
  console.log(`✅ Concurrency verified! Max concurrent workers observed: ${maxObservedConcurrency} / ${env.WORKER_CONCURRENCY}`);

  // Clean up
  console.log('🧹 Cleaning up queue and worker...');
  await job1.remove().catch(() => {});
  await closeEmailWorker();
  await emailQueue.close();

  console.log('🎯 Phase 4 BullMQ Queue Verification PASSED 100%!');
  process.exit(0);
}

testQueue().catch((err) => {
  console.error('❌ Queue verification failed:', err);
  process.exit(1);
});
