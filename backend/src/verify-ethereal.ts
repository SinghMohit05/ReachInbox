import assert from 'assert';
import { prisma } from './config/prisma.js';
import { scheduleEmailJob, emailQueue } from './queues/email.queue.js';
import { startEmailWorker, closeEmailWorker } from './workers/email.worker.js';

async function testEthereal() {
  console.log('📧 Verifying Phase 5 Ethereal Email Sending & State Transitions...');

  // 1. Create ephemeral test user & sender
  const user = await prisma.user.create({
    data: {
      name: 'Ethereal Test Runner',
      email: `ethereal-test-${Date.now()}@domain.io`,
      senders: {
        create: {
          email: `ethereal-sender-${Date.now()}@domain.io`,
          displayName: 'Ethereal Sender',
          enabled: true,
        },
      },
    },
    include: { senders: true },
  });

  const sender = user.senders[0];
  console.log(`👤 Using sender: ${sender.displayName} <${sender.email}>`);

  // Start worker
  startEmailWorker();

  // Test 1: Real successful Ethereal email send
  console.log('📬 Step 1: Creating scheduled email for real Ethereal delivery...');
  const testEmail = await prisma.email.create({
    data: {
      userId: user.id,
      senderId: sender.id,
      recipient: 'ethereal.test.recipient@example.com',
      subject: 'ReachInbox Production Test — Ethereal Delivery',
      body: '<div style="font-family: sans-serif; padding: 20px;"><h2>Hello from ReachInbox!</h2><p>This is a verified test email sent via Nodemailer and Ethereal SMTP.</p></div>',
      status: 'scheduled',
      scheduledAt: new Date(),
      idempotencyKey: `ethereal-test-success-${Date.now()}`,
    },
  });

  assert.strictEqual(testEmail.status, 'scheduled');
  assert.strictEqual(testEmail.sentAt, null);
  console.log(`  -> Created Email record ID=${testEmail.id}, status="scheduled"`);

  // Queue BullMQ job
  await scheduleEmailJob(
    {
      emailId: testEmail.id,
      userId: user.id,
      senderId: sender.id,
      recipient: testEmail.recipient,
      subject: testEmail.subject,
      body: testEmail.body,
      scheduledAt: testEmail.scheduledAt.toISOString(),
      idempotencyKey: testEmail.idempotencyKey,
    },
    0, // immediate
  );
  console.log('  -> Queued job into BullMQ. Waiting for worker to process via SMTP...');

  // Poll database for state transition: scheduled -> processing -> sent
  let finalEmailState = null;
  const startTime = Date.now();
  while (Date.now() - startTime < 15000) {
    const check = await prisma.email.findUnique({ where: { id: testEmail.id } });
    if (check && check.status === 'sent') {
      finalEmailState = check;
      break;
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  assert(finalEmailState, 'Email did not transition to "sent" within 15 seconds');
  assert.strictEqual(finalEmailState.status, 'sent');
  assert(finalEmailState.sentAt instanceof Date, 'sentAt must be a valid DateTime');
  assert.strictEqual(finalEmailState.errorMessage, null);
  console.log(`✅ SUCCESSFUL STATE TRANSITION VERIFIED: Email ${testEmail.id} is now "sent" at ${finalEmailState.sentAt?.toISOString()}`);

  // Test 2: Failure state transition on SMTP error
  console.log('\n💥 Step 2: Testing SMTP failure handling (processing -> failed)...');
  // Create email with an invalid sender configuration to simulate SMTP connection error
  const failingSender = await prisma.sender.create({
    data: {
      userId: user.id,
      email: 'failing.sender@example.com',
      displayName: 'Failing Sender',
      smtpHost: 'nonexistent.smtp.host.invalid',
      smtpPort: 587,
      smtpUser: 'bad_user',
      smtpPass: 'bad_pass',
      enabled: true,
    },
  });

  const failingEmail = await prisma.email.create({
    data: {
      userId: user.id,
      senderId: failingSender.id,
      recipient: 'fail.target@example.com',
      subject: 'This should fail cleanly',
      body: '<p>Failing email</p>',
      status: 'scheduled',
      scheduledAt: new Date(),
      idempotencyKey: `ethereal-test-fail-${Date.now()}`,
    },
  });

  await scheduleEmailJob(
    {
      emailId: failingEmail.id,
      userId: user.id,
      senderId: failingSender.id,
      recipient: failingEmail.recipient,
      subject: failingEmail.subject,
      body: failingEmail.body,
      scheduledAt: failingEmail.scheduledAt.toISOString(),
      idempotencyKey: failingEmail.idempotencyKey,
    },
    0,
  );

  let finalFailedEmail = null;
  const startFailTime = Date.now();
  while (Date.now() - startFailTime < 15000) {
    const check = await prisma.email.findUnique({ where: { id: failingEmail.id } });
    if (check && check.status === 'failed') {
      finalFailedEmail = check;
      break;
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  assert(finalFailedEmail, 'Email did not transition to "failed" on SMTP error');
  assert.strictEqual(finalFailedEmail.status, 'failed');
  assert(finalFailedEmail.failedAt instanceof Date);
  assert(finalFailedEmail.errorMessage && finalFailedEmail.errorMessage.length > 0);
  console.log(`✅ FAILURE STATE TRANSITION VERIFIED: Email ${failingEmail.id} marked "failed" with error: "${finalFailedEmail.errorMessage}"`);

  // Cleanup test records
  console.log('\n🧹 Cleaning up test records & shutting down worker...');
  await prisma.email.delete({ where: { id: testEmail.id } }).catch(() => {});
  await prisma.email.delete({ where: { id: failingEmail.id } }).catch(() => {});
  await prisma.sender.delete({ where: { id: failingSender.id } }).catch(() => {});
  await prisma.user.delete({ where: { id: user.id } }).catch(() => {});

  await closeEmailWorker();
  await emailQueue.close();

  console.log('🎯 Phase 5 Ethereal Email Verification PASSED 100%!');
  process.exit(0);
}

testEthereal().catch((err) => {
  console.error('❌ Ethereal test failed:', err);
  process.exit(1);
});
