import assert from 'assert';
import { prisma } from './config/prisma.js';
import { RateLimiterService } from './services/rateLimiter.service.js';
import { defaultProcessor } from './workers/email.worker.js';
import { Job } from 'bullmq';
import { EmailJobData, emailQueue } from './queues/email.queue.js';
import { env } from './config/env.js';

async function testRateLimiter() {
  console.log('⚡ Verifying Phase 8 Distributed Redis Hourly Rate Limiting...');

  const user = await prisma.user.create({
    data: {
      name: 'Rate Limit Test Runner',
      email: `rate-test-${Date.now()}@domain.io`,
      senders: {
        create: {
          email: `rate-sender-${Date.now()}@domain.io`,
          displayName: 'Rate Limit Sender',
          enabled: true,
        },
      },
    },
    include: { senders: true },
  });
  const sender = user.senders[0];

  // Reset rate limit key for this sender
  await RateLimiterService.resetSenderRateLimit(sender.id);
  const testLimit = 3; // Use limit of 3 for testing

  console.log(`\n📊 Testing with test limit of ${testLimit} emails/hour for sender ${sender.email}...`);

  // Step 1: Send 3 emails under limit
  for (let i = 1; i <= testLimit; i++) {
    const check = await RateLimiterService.checkAndIncrement(sender.id, testLimit);
    assert.strictEqual(check.allowed, true, `Email #${i} should be allowed`);
    assert.strictEqual(check.currentCount, i);
    console.log(`  -> Email #${i} under limit: allowed=true, count=${check.currentCount}/${testLimit}`);
  }

  // Step 2: Email #4 exceeds hourly limit -> must NOT be dropped, must be rescheduled
  console.log('\n🛑 Testing Rate Limit Hit (Email #4 exceeding limit)...');
  const excessCheck = await RateLimiterService.checkAndIncrement(sender.id, testLimit);
  assert.strictEqual(excessCheck.allowed, false, 'Email #4 must be rejected by rate limiter');
  assert(excessCheck.rescheduleTimestamp instanceof Date, 'Must provide rescheduleTimestamp');
  assert(excessCheck.delayToNextWindowMs! > 0, 'Must calculate delay to next hour window');
  console.log(`  -> Email #4 rejected: next window=${excessCheck.rescheduleTimestamp?.toISOString()}, delay=${excessCheck.delayToNextWindowMs}ms`);

  // Step 3: End-to-end Worker Rescheduling Test
  console.log('\n🔄 Testing Worker Automatic Rescheduling on Rate Limit Hit...');
  // Set Redis counter to MAX_EMAILS_PER_HOUR (200) to simulate reaching the production limit
  const hourlyKey = RateLimiterService.getHourlyKey(sender.id);
  await RateLimiterService.resetSenderRateLimit(sender.id);
  const { redisClient } = await import('./config/redis.js');
  await redisClient.set(hourlyKey, env.MAX_EMAILS_PER_HOUR);
  console.log(`  -> Seeded Redis key ${hourlyKey} with ${env.MAX_EMAILS_PER_HOUR} emails (hourly limit reached)`);
  const rateLimitEmail = await prisma.email.create({
    data: {
      userId: user.id,
      senderId: sender.id,
      recipient: 'rate.limited.recipient@example.com',
      subject: 'Rate Limit Reschedule Test',
      body: '<p>Should be rescheduled to next hour</p>',
      status: 'scheduled',
      scheduledAt: new Date(),
      idempotencyKey: `rate-limit-test-${Date.now()}`,
    },
  });

  // Note: sender is already at limit (3/3).
  // Mock worker execution of rateLimitEmail
  const mockJob = {
    id: `rl-job-${rateLimitEmail.id}`,
    data: {
      emailId: rateLimitEmail.id,
      userId: user.id,
      senderId: sender.id,
      recipient: rateLimitEmail.recipient,
      subject: rateLimitEmail.subject,
      body: rateLimitEmail.body,
      scheduledAt: rateLimitEmail.scheduledAt.toISOString(),
      idempotencyKey: rateLimitEmail.idempotencyKey,
    },
  } as unknown as Job<EmailJobData>;

  const workerResult = await defaultProcessor(mockJob);
  assert.strictEqual(workerResult.rescheduled, true, 'Worker must report rescheduled: true');
  assert(workerResult.rescheduledTo instanceof Date);
  console.log(`  -> Worker output: rescheduled=${workerResult.rescheduled}, nextWindow=${workerResult.rescheduledTo.toISOString()}`);

  // Check database record: must NOT be failed, must be scheduled with new future timestamp
  const updatedEmail = await prisma.email.findUnique({ where: { id: rateLimitEmail.id } });
  assert.strictEqual(updatedEmail?.status, 'scheduled', 'Email status must be returned to scheduled, NOT failed or dropped');
  assert(updatedEmail!.scheduledAt.getTime() > Date.now(), 'scheduledAt must be moved to the future next-hour window');
  console.log(`✅ DATABASE VERIFIED: Email ${rateLimitEmail.id} safely preserved with status="scheduled" and scheduledAt=${updatedEmail?.scheduledAt.toISOString()}`);

  // Clean up
  await RateLimiterService.resetSenderRateLimit(sender.id);
  await prisma.email.delete({ where: { id: rateLimitEmail.id } }).catch(() => {});
  await prisma.user.delete({ where: { id: user.id } }).catch(() => {});

  console.log('\n🎯 Phase 8 Distributed Redis Hourly Rate Limiting Verification PASSED 100%!');
  process.exit(0);
}

testRateLimiter().catch((err) => {
  console.error('❌ Rate limiter test failed:', err);
  process.exit(1);
});
