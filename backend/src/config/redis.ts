import { Redis } from 'ioredis';
import { env } from './env.js';

export const redisClient = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  enableOfflineQueue: false,
  retryStrategy(times) {
    if (times > 5) {
      return 10000;
    }
    return Math.min(times * 1000, 5000);
  },
});

redisClient.on('connect', () => {
  if (env.NODE_ENV !== 'test') {
    console.log('✅ Redis connected successfully');
  }
});

redisClient.on('error', (err) => {
  if (env.NODE_ENV === 'development') {
    console.warn('⚠️ Redis connection notice:', err.message || 'Connecting to Redis...');
  }
});
