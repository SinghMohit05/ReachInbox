import assert from 'assert';
import { prisma } from './config/prisma.js';
import { defaultProcessor } from './workers/email.worker.js';
import { Job } from 'bullmq';
import { EmailJobData } from './queues/email.queue.js';

async function testIdempotency() {
  console.log('🛡️ Verifying Phase 6 Defense-in-Depth Idempotency & Duplicate Protection...');

  const user = await prisma.user.create({
    data: {
      name: 'Idempotency Test Runner',
      email: `idemp-test-${Date.now()}@domain.io`,
      senders: {
        create: {
          email: `idemp-sender-${Date.now()}@domain.io`,
          displayName: 'Idempotency Sender',
          enabled: true,
        },
      },
    },
    include: { senders: true },
  });
  const sender = user.senders[0];

  // =========================================================================
  // TEST 1: Atomic Database Claim Race Condition (10 parallel workers on 1 email)
  // =========================================================================
  console.log('\n⚔️ TEST 1: Simulating 10 concurrent workers racing to claim 1 scheduled email...');
  const raceEmail = await prisma.email.create({
    data: {
      userId: user.id,
      senderId: sender.id,
      recipient: 'race.test@example.com',
      subject: 'Race Condition Claim Test',
      body: '<p>Testing single execution among concurrent workers</p>',
      status: 'scheduled',
      scheduledAt: new Date(),
      idempotencyKey: `idemp-race-${Date.now()}`,
    },
  });

  const jobData: EmailJobData = {
    emailId: raceEmail.id,
    userId: user.id,
    senderId: sender.id,
    recipient: raceEmail.recipient,
    subject: raceEmail.subject,
    body: raceEmail.body,
    scheduledAt: raceEmail.scheduledAt.toISOString(),
    idempotencyKey: raceEmail.idempotencyKey,
  };

  // Launch 10 worker calls in parallel
  const workerSimulations = Array.from({ length: 10 }, (_, index) => {
    const mockJob = {
      id: `simulated-worker-job-${index}`,
      data: jobData,
    } as unknown as Job<EmailJobData>;

    return defaultProcessor(mockJob);
  });

  const results = await Promise.all(workerSimulations);

  const successfulSends = results.filter((r) => r.processed === true && r.status === 'sent');
  const skippedClaims = results.filter((r) => r.skipped === true);

  console.log(`  -> Total parallel worker executions: ${results.length}`);
  console.log(`  -> Successfully claimed and sent: ${successfulSends.length}`);
  console.log(`  -> Blocked by atomic idempotency lock: ${skippedClaims.length}`);

  assert.strictEqual(
    successfulSends.length,
    1,
    `CRITICAL IDEMPOTENCY FAILURE: Exactly 1 worker must send the email! Got ${successfulSends.length}`,
  );
  assert.strictEqual(
    skippedClaims.length,
    9,
    `Expected exactly 9 workers to be blocked by atomic claim lock! Got ${skippedClaims.length}`,
  );
  console.log('✅ TEST 1 PASSED: Exactly 1 worker claimed and delivered the email; all 9 racing workers were rejected.');

  // =========================================================================
  // TEST 2: Pre-Send Guard on Already-Sent Email
  // =========================================================================
  console.log('\n🔒 TEST 2: Testing pre-send state guard on already sent email...');
  const mockSecondAttempt = {
    id: 'late-arriving-job-id',
    data: jobData,
  } as unknown as Job<EmailJobData>;

  const lateResult = await defaultProcessor(mockSecondAttempt);
  assert.strictEqual(lateResult.skipped, true);
  assert.strictEqual(lateResult.reason, 'Already sent');
  console.log(`✅ TEST 2 PASSED: Pre-send check immediately rejected send on already-sent email (${lateResult.reason}).`);

  // =========================================================================
  // TEST 3: Pre-Send Guard on Cancelled Email
  // =========================================================================
  console.log('\n🚫 TEST 3: Testing pre-send state guard on cancelled email...');
  const cancelledEmail = await prisma.email.create({
    data: {
      userId: user.id,
      senderId: sender.id,
      recipient: 'cancelled@example.com',
      subject: 'Cancelled Email Test',
      body: '<p>Should not send</p>',
      status: 'cancelled',
      scheduledAt: new Date(),
      idempotencyKey: `idemp-cancelled-${Date.now()}`,
    },
  });

  const cancelMockJob = {
    id: 'cancelled-job-id',
    data: {
      ...jobData,
      emailId: cancelledEmail.id,
      idempotencyKey: cancelledEmail.idempotencyKey,
    },
  } as unknown as Job<EmailJobData>;

  const cancelResult = await defaultProcessor(cancelMockJob);
  assert.strictEqual(cancelResult.skipped, true);
  assert.strictEqual(cancelResult.reason, 'Cancelled');
  console.log(`✅ TEST 3 PASSED: Pre-send check immediately rejected send on cancelled email (${cancelResult.reason}).`);

  // Clean up
  await prisma.email.delete({ where: { id: raceEmail.id } }).catch(() => {});
  await prisma.email.delete({ where: { id: cancelledEmail.id } }).catch(() => {});
  await prisma.user.delete({ where: { id: user.id } }).catch(() => {});

  console.log('\n🎯 Phase 6 Idempotency & Duplicate Protection Verification PASSED 100%!');
  process.exit(0);
}

testIdempotency().catch((err) => {
  console.error('❌ Idempotency verification failed:', err);
  process.exit(1);
});
