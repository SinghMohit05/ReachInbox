import { createApp } from './app.js';
import { prisma } from './config/prisma.js';
import { generateToken } from './auth/jwt.js';
import http from 'http';

async function main() {
  console.log('--- Verifying Phase 11: Email REST APIs ---');

  const user = await prisma.user.create({
    data: {
      name: 'API Test Runner',
      email: `api-test-${Date.now()}@domain.io`,
      senders: {
        create: {
          email: `api-sender-${Date.now()}@domain.io`,
          displayName: 'API Sender',
          enabled: true,
        },
      },
    },
    include: { senders: true },
  });
  const sender = user.senders[0];

  const token = generateToken(user);
  const app = createApp();

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  try {
    // 1. GET /api/senders
    const sendersRes = await fetch(`${baseUrl}/api/senders`, { headers: authHeaders });
    const sendersData = (await sendersRes.json()) as any;
    console.log(`✅ GET /api/senders -> Status ${sendersRes.status}, count: ${sendersData.senders?.length}`);
    if (sendersRes.status !== 200 || !Array.isArray(sendersData.senders)) {
      throw new Error('Failed to get senders');
    }

    // 2. GET /api/stats
    const statsRes = await fetch(`${baseUrl}/api/stats`, { headers: authHeaders });
    const statsData = (await statsRes.json()) as any;
    console.log(`✅ GET /api/stats -> Status ${statsRes.status}, stats:`, statsData.stats);
    if (statsRes.status !== 200 || typeof statsData.stats?.scheduledCount !== 'number') {
      throw new Error('Failed to get stats');
    }

    // 3. GET /api/emails/scheduled
    const schedRes = await fetch(`${baseUrl}/api/emails/scheduled`, { headers: authHeaders });
    const schedData = (await schedRes.json()) as any;
    console.log(`✅ GET /api/emails/scheduled -> Status ${schedRes.status}, count: ${schedData.count}`);
    if (schedRes.status !== 200) {
      throw new Error('Failed to get scheduled emails');
    }

    // 4. GET /api/emails/sent
    const sentRes = await fetch(`${baseUrl}/api/emails/sent`, { headers: authHeaders });
    const sentData = (await sentRes.json()) as any;
    console.log(`✅ GET /api/emails/sent -> Status ${sentRes.status}, count: ${sentData.count}`);
    if (sentRes.status !== 200) {
      throw new Error('Failed to get sent emails');
    }

    // 5. POST /api/emails/schedule
    const futureDate = new Date(Date.now() + 60000).toISOString();
    const schedulePayload = {
      senderId: sender.id,
      recipients: ['alice@customer.io', 'bob@customer.io'],
      subject: 'Phase 11 Schedule API Test',
      body: '<p>Testing schedule endpoint multi-recipient batching.</p>',
      scheduledAt: futureDate,
    };

    const createRes = await fetch(`${baseUrl}/api/emails/schedule`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(schedulePayload),
    });
    const createData = (await createRes.json()) as any;
    console.log(`✅ POST /api/emails/schedule -> Status ${createRes.status}, scheduled: ${createData.count}`);
    if (createRes.status !== 201 || createData.count !== 2) {
      throw new Error(`Failed to schedule batch: ${JSON.stringify(createData)}`);
    }

    const testEmailId = createData.scheduled[0].id;

    // 6. GET /api/emails/:id
    const detailRes = await fetch(`${baseUrl}/api/emails/${testEmailId}`, { headers: authHeaders });
    const detailData = (await detailRes.json()) as any;
    console.log(`✅ GET /api/emails/:id -> Status ${detailRes.status}, Subject: "${detailData.email?.subject}"`);
    if (detailRes.status !== 200 || detailData.email?.id !== testEmailId) {
      throw new Error('Failed to fetch email by id');
    }

    // 7. POST /api/emails/:id/cancel
    const cancelRes = await fetch(`${baseUrl}/api/emails/${testEmailId}/cancel`, {
      method: 'POST',
      headers: authHeaders,
    });
    const cancelData = (await cancelRes.json()) as any;
    console.log(`✅ POST /api/emails/:id/cancel -> Status ${cancelRes.status}, message: "${cancelData.message}"`);
    if (cancelRes.status !== 200 || cancelData.email?.status !== 'cancelled') {
      throw new Error('Failed to cancel scheduled email');
    }

    // 8. GET /api/emails/search?q=...
    const searchRes = await fetch(`${baseUrl}/api/emails/search?q=Phase`, { headers: authHeaders });
    const searchData = (await searchRes.json()) as any;
    console.log(`✅ GET /api/emails/search -> Status ${searchRes.status}, matched: ${searchData.count}`);
    if (searchRes.status !== 200) {
      throw new Error('Failed to search emails');
    }

    console.log('🎉 Phase 11 Verified Successfully!');
  } finally {
    server.close();
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Phase 11 verification failed:', err);
  process.exit(1);
});
