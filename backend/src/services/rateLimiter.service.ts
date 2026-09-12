import { redisClient } from '../config/redis.js';
import { env } from '../config/env.js';

export interface RateLimitCheckResult {
  allowed: boolean;
  currentCount: number;
  limit: number;
  remaining: number;
  key: string;
  rescheduleTimestamp?: Date;
  delayToNextWindowMs?: number;
}

export class RateLimiterService {
  /**
   * Generates the Redis key for a sender for the given date/hour:
   * Format: sender:{senderId}:hour:{YYYYMMDDHH}
   */
  public static getHourlyKey(senderId: string, date: Date = new Date()): string {
    const yyyy = date.getUTCFullYear();
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(date.getUTCDate()).padStart(2, '0');
    const hh = String(date.getUTCHours()).padStart(2, '0');
    return `sender:${senderId}:hour:${yyyy}${mm}${dd}${hh}`;
  }

  /**
   * Calculates the exact start timestamp of the next UTC hour window (00:00.000)
   */
  public static getNextHourWindow(date: Date = new Date()): Date {
    const nextHour = new Date(date);
    nextHour.setUTCHours(nextHour.getUTCHours() + 1, 0, 0, 0);
    return nextHour;
  }

  /**
   * Atomically checks and increments the hourly counter for a sender in Redis.
   * If the limit is reached, it returns allowed=false with the exact timestamp
   * of the next hour window for rescheduling.
   */
  public static async checkAndIncrement(
    senderId: string,
    customLimit?: number,
  ): Promise<RateLimitCheckResult> {
    const now = new Date();
    const key = this.getHourlyKey(senderId, now);
    const limit = customLimit !== undefined && customLimit > 0 ? customLimit : env.MAX_EMAILS_PER_HOUR;

    // Lua script executing atomic INCR with 2-hour TTL safety
    const luaScript = `
      local current = redis.call('INCR', KEYS[1])
      if current == 1 then
        redis.call('EXPIRE', KEYS[1], 7200)
      end
      return current
    `;

    const count = (await redisClient.eval(luaScript, 1, key)) as number;

    if (count <= limit) {
      return {
        allowed: true,
        currentCount: count,
        limit,
        remaining: limit - count,
        key,
      };
    }

    // Rate limit exceeded: Decrement the counter back so we don't inflate beyond limit
    await redisClient.decr(key);

    const nextWindow = this.getNextHourWindow(now);
    const delayToNextWindowMs = Math.max(1000, nextWindow.getTime() - now.getTime());

    return {
      allowed: false,
      currentCount: limit,
      limit,
      remaining: 0,
      key,
      rescheduleTimestamp: nextWindow,
      delayToNextWindowMs,
    };
  }

  /**
   * Resets the rate limiter key for testing
   */
  public static async resetSenderRateLimit(senderId: string, date: Date = new Date()): Promise<void> {
    const key = this.getHourlyKey(senderId, date);
    await redisClient.del(key);
  }
}
