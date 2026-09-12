import { Request, Response } from 'express';
import { prisma } from '../config/prisma.js';
import { redisClient } from '../config/redis.js';
import { esClient } from '../config/elasticsearch.js';

export const getGeneralHealth = async (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    service: 'reachinbox-email-scheduler',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
};

export const getDbHealth = async (_req: Request, res: Response) => {
  const start = Date.now();
  try {
    const result = await prisma.$queryRaw<Array<{ connected: number }>>`SELECT 1 as connected`;
    const latencyMs = Date.now() - start;
    if (result?.[0]?.connected === 1) {
      return res.status(200).json({
        status: 'ok',
        component: 'db',
        latencyMs,
        message: 'PostgreSQL connection active via Prisma',
      });
    }
    return res.status(503).json({
      status: 'error',
      component: 'db',
      latencyMs,
      message: 'Unexpected query response from PostgreSQL',
    });
  } catch (error) {
    const latencyMs = Date.now() - start;
    return res.status(503).json({
      status: 'error',
      component: 'db',
      latencyMs,
      message: error instanceof Error ? error.message : 'Database connection error',
    });
  }
};

export const getRedisHealth = async (_req: Request, res: Response) => {
  const start = Date.now();
  try {
    const pingPromise = redisClient.ping();
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Redis ping timed out after 3000ms')), 3000),
    );
    const pong = await Promise.race([pingPromise, timeoutPromise]);
    const latencyMs = Date.now() - start;
    if (pong === 'PONG') {
      return res.status(200).json({
        status: 'ok',
        component: 'redis',
        latencyMs,
        message: 'Redis ping successful',
      });
    }
    return res.status(503).json({
      status: 'error',
      component: 'redis',
      latencyMs,
      message: `Unexpected response from Redis: ${pong}`,
    });
  } catch (error) {
    const latencyMs = Date.now() - start;
    return res.status(503).json({
      status: 'error',
      component: 'redis',
      latencyMs,
      message: error instanceof Error ? error.message : 'Redis connection error',
    });
  }
};

export const getElasticsearchHealth = async (_req: Request, res: Response) => {
  const start = Date.now();
  try {
    const healthPromise = esClient.cluster.health();
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Elasticsearch health check timed out after 3000ms')), 3000),
    );
    const health: any = await Promise.race([healthPromise, timeoutPromise]);
    const latencyMs = Date.now() - start;
    return res.status(200).json({
      status: 'ok',
      component: 'elasticsearch',
      latencyMs,
      clusterName: health.cluster_name,
      clusterStatus: health.status,
      message: 'Elasticsearch cluster responsive',
    });
  } catch (error) {
    const latencyMs = Date.now() - start;
    return res.status(503).json({
      status: 'error',
      component: 'elasticsearch',
      latencyMs,
      message: error instanceof Error ? error.message : 'Elasticsearch connection error',
    });
  }
};
