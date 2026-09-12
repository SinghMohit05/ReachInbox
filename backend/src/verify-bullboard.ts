import { createApp } from './app.js';
import http from 'http';

async function main() {
  console.log('--- Verifying Phase 13: BullMQ Live Dashboard (Bull Board) ---');

  const app = createApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/admin/queues/`);
    console.log(`✅ Bull Board endpoint status: ${res.status}`);
    const html = await res.text();

    if (res.status === 200 && (html.includes('BullBoard') || html.includes('bull-board') || html.includes('id="root"'))) {
      console.log('✅ Bull Board UI HTML successfully rendered.');
    } else {
      console.log('Response body snippet:', html.slice(0, 300));
      throw new Error('Bull Board did not return expected UI page');
    }

    console.log('🎉 Phase 13 Verified Successfully!');
  } finally {
    server.close();
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Phase 13 verification failed:', err);
  process.exit(1);
});
