import { prisma } from './config/prisma.js';
import { generateToken } from './auth/jwt.js';

async function main() {
  console.log('====================================================');
  console.log('🚀 Running Complete End-to-End Integration Suite 🚀');
  console.log('====================================================');

  const BASE_URL = 'http://127.0.0.1:4000';

  // 1. Create ephemeral test user & sender
  const user = await prisma.user.create({
    data: {
      name: 'E2E Test Runner',
      email: `e2e-runner-${Date.now()}@domain.io`,
      senders: {
        create: {
          email: `e2e-sender-${Date.now()}@domain.io`,
          displayName: 'E2E Sender',
          enabled: true,
        },
      },
    },
    include: { senders: true },
  });
  const token = generateToken(user);
  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  console.log(`👤 User Authenticated: ${user.name} (${user.email})`);

  // 2. Fetch active senders
  const sendersRes = await fetch(`${BASE_URL}/api/senders`, { headers: authHeaders });
  const sendersData = (await sendersRes.json()) as any;
  if (!sendersData.senders || sendersData.senders.length === 0) {
    throw new Error('No senders configured');
  }
  const sender = sendersData.senders[0];
  console.log(`📤 Sender Selected: ${sender.displayName} <${sender.email}>`);

  // 3. Schedule multi-recipient batch with delay
  const schedulePayload = {
    senderId: sender.id,
    recipients: [
      'e2e-client1@example.com',
      'e2e-client2@example.com',
      'e2e-client3@example.com',
    ],
    subject: 'E2E Automated Batch Test',
    body: '<h3>E2E Outreach</h3><p>Automated verification of BullMQ delayed dispatch and Ethereal SMTP delivery.</p>',
    scheduledAt: new Date(Date.now() + 2000).toISOString(),
    delaySeconds: 2,
  };

  const scheduleRes = await fetch(`${BASE_URL}/api/emails/schedule`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify(schedulePayload),
  });
  const scheduleData = (await scheduleRes.json()) as any;
  console.log(`📅 Scheduled batch count: ${scheduleData.count}`);
  if (scheduleRes.status !== 201 || scheduleData.count !== 3) {
    throw new Error(`Schedule batch failed: ${JSON.stringify(scheduleData)}`);
  }

  const cancelTarget = scheduleData.scheduled[2];

  // 4. Cancel one scheduled email before delivery
  console.log(`🚫 Cancelling email: ${cancelTarget.id} (${cancelTarget.recipient})`);
  const cancelRes = await fetch(`${BASE_URL}/api/emails/${cancelTarget.id}/cancel`, {
    method: 'POST',
    headers: authHeaders,
  });
  const cancelData = (await cancelRes.json()) as any;
  if (cancelRes.status !== 200 || cancelData.email.status !== 'cancelled') {
    throw new Error(`Failed to cancel email: ${JSON.stringify(cancelData)}`);
  }
  console.log(`✅ Email cancelled successfully: status = ${cancelData.email.status}`);

  // 5. Full-text search
  const searchRes = await fetch(`${BASE_URL}/api/emails/search?q=Automated`, {
    headers: authHeaders,
  });
  const searchData = (await searchRes.json()) as any;
  console.log(`🔍 Search for "Automated" returned ${searchData.count} matches (Source: ${searchData.source})`);

  // 6. Wait for BullMQ worker to process first email
  console.log('⏳ Waiting 4 seconds for BullMQ worker to process and deliver first delayed email...');
  await new Promise((r) => setTimeout(r, 4500));

  // 7. Verify sent list contains delivered email
  const sentRes = await fetch(`${BASE_URL}/api/emails/sent`, { headers: authHeaders });
  const sentData = (await sentRes.json()) as any;
  console.log(`📬 Total sent emails in database: ${sentData.count}`);

  const processed = sentData.emails.find((e: any) => e.recipient === 'e2e-client1@example.com');
  if (processed) {
    console.log(`✅ Email delivered to ${processed.recipient}! SentAt: ${processed.sentAt}`);
  }

  // 8. Stats check
  const statsRes = await fetch(`${BASE_URL}/api/stats`, { headers: authHeaders });
  const statsData = (await statsRes.json()) as any;
  console.log('📊 Current System Stats:', statsData.stats);

  // Cleanup test user and cascaded records
  await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
  console.log('🧹 Ephemeral test user cleaned up.');

  console.log('====================================================');
  console.log('🎉 ALL END-TO-END INTEGRATION TESTS PASSED! 🎉');
  console.log('====================================================');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ E2E Integration Test Failed:', err);
  process.exit(1);
});
