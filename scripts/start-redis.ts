import { RedisMemoryServer } from 'redis-memory-server';
import { Redis } from 'ioredis';

async function main() {
  console.log('🚀 Starting Redis server on port 6379...');
  const redisServer = new RedisMemoryServer({
    instance: {
      port: 6379,
      ip: '127.0.0.1',
    },
  });

  const host = await redisServer.getHost();
  const port = await redisServer.getPort();
  console.log(`✅ Redis server running at ${host}:${port}`);

  const redis = new Redis({ host, port });
  const pong = await redis.ping();
  console.log(`✅ PING -> ${pong}`);
  await redis.quit();

  console.log('Keeping Redis server running for background tasks...');
  process.on('SIGINT', async () => {
    await redisServer.stop();
    process.exit(0);
  });
}

main().catch(console.error);
