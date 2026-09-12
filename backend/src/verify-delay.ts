import assert from 'assert';
import { prisma } from './config/prisma.js';
import { SchedulerService } from './services/scheduler.service.js';
import { emailQueue } from './queues/email.queue.js';
import { env } from './config/env.js';

async function testDelayScheduling() {
  console.log('⏱️ Verifying Phase 7 Minimum Delay Between Emails Implementation...');

  // 1. Math Calculation Verification (Example from prompt specification: 10:00:00, 2s delay)
  console.log('\n📐 Step 1: Testing exact schedule math against prompt specification...');
  const fixedStart = new Date(Date.now() + 60000); // 1 minute in the future
  const sampleRecipients = [
    'email1@example.com',
    'email2@example.com',
    'email3@example.com',
    'email4@example.com',
  ];

  const plans = SchedulerService.calculateBatchSchedule(sampleRecipients, fixedStart, 2);

  assert.strictEqual(plans.length, 4);
  const baseMs = fixedStart.getTime();

  assert.strictEqual(plans[0].scheduledAt.getTime(), baseMs);
  assert.strictEqual(plans[1].scheduledAt.getTime(), baseMs + 2000);
  assert.strictEqual(plans[2].scheduledAt.getTime(), baseMs + 4000);
  assert.strictEqual(plans[3].scheduledAt.getTime(), baseMs + 6000);

  console.log('  Email 1 scheduled at:', plans[0].scheduledAt.toISOString(), '(+0s)');
  console.log('  Email 2 scheduled at:', plans[1].scheduledAt.toISOString(), '(+2s)');
  console.log('  Email 3 scheduled at:', plans[2].scheduledAt.toISOString(), '(+4s)');
  console.log('  Email 4 scheduled at:', plans[3].scheduledAt.toISOString(), '(+6s)');
  console.log('✅ Math calculation matches specification exactly.');

  // 2. Minimum Delay Enforcement Test
  console.log('\n🛡️ Step 2: Testing minimum delay enforcement (MIN_EMAIL_DELAY_MS)...');
  // If user requests 0.5s (500ms) but MIN_EMAIL_DELAY_MS is 2000ms:
  const shortDelayPlans = SchedulerService.calculateBatchSchedule(
    ['a@test.com', 'b@test.com'],
    fixedStart,
    0.5, // 500ms
  );
  const diffMs = shortDelayPlans[1].scheduledAt.getTime() - shortDelayPlans[0].scheduledAt.getTime();
  assert.strictEqual(
    diffMs,
    env.MIN_EMAIL_DELAY_MS,
    `Difference must be enforced to MIN_EMAIL_DELAY_MS (${env.MIN_EMAIL_DELAY_MS}ms), got ${diffMs}ms`,
  );
  console.log(`✅ System enforced MIN_EMAIL_DELAY_MS (${env.MIN_EMAIL_DELAY_MS}ms) when user requested 500ms.`);

  // If user requests 5s (larger than minimum):
  const largeDelayPlans = SchedulerService.calculateBatchSchedule(
    ['a@test.com', 'b@test.com'],
    fixedStart,
    5, // 5000ms
  );
  const largeDiffMs = largeDelayPlans[1].scheduledAt.getTime() - largeDelayPlans[0].scheduledAt.getTime();
  assert.strictEqual(largeDiffMs, 5000, `Difference should honor user request of 5000ms, got ${largeDiffMs}ms`);
  console.log('✅ System honored user-specified delay of 5000ms.');

  // 3. End-to-End Database + BullMQ Delayed Job Schedule Verification
  console.log('\n🚀 Step 3: Testing end-to-end scheduleBatch() execution...');
  const user = await prisma.user.create({
    data: {
      name: 'Delay Test Runner',
      email: `delay-test-${Date.now()}@domain.io`,
      senders: {
        create: {
          email: `delay-sender-${Date.now()}@domain.io`,
          displayName: 'Delay Sender',
          enabled: true,
        },
      },
    },
    include: { senders: true },
  });
  const sender = user.senders[0];

  try {
    const batchResult = await SchedulerService.scheduleBatch({
      userId: user.id,
      senderId: sender.id,
      recipients: [
        'delay.test.1@example.com',
        'delay.test.2@example.com',
        'delay.test.3@example.com',
      ],
      subject: 'Batch Scheduled with Configurable Delay',
      body: '<p>Testing non-blocking BullMQ delay</p>',
      startAt: new Date(Date.now() + 5000), // 5s in future
      delayBetweenEmailsSeconds: 2,
    });

    assert.strictEqual(batchResult.scheduledCount, 3);
    console.log(`  -> Successfully scheduled batch of ${batchResult.scheduledCount} emails in DB.`);

    // Verify BullMQ jobs exist in delayed state
    for (const item of batchResult.emails) {
      const job = await emailQueue.getJob(item.jobId);
      assert(job, `BullMQ job ${item.jobId} must exist in Redis`);
      const state = await job.getState();
      assert.strictEqual(state, 'delayed', `Job state must be "delayed", got "${state}"`);
      console.log(`  -> Verified BullMQ job ${item.jobId}: state="${state}", delay=${job.delay}ms`);
    }

    // Clean up BullMQ jobs
    for (const item of batchResult.emails) {
      const job = await emailQueue.getJob(item.jobId);
      await job?.remove().catch(() => {});
    }
  } finally {
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
    console.log('🧹 Cleaned up ephemeral test user and batch.');
  }

  console.log('🎯 Phase 7 Minimum Delay Between Emails Verification PASSED 100%!');
  process.exit(0);
}

testDelayScheduling().catch((err) => {
  console.error('❌ Delay scheduling verification failed:', err);
  process.exit(1);
});
