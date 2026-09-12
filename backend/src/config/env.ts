import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

// Load environment variables from .env file
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().transform((val) => parseInt(val, 10)).default('4000'),
  DATABASE_URL: z.string().url().default('postgresql://postgres:postgrespassword@localhost:5432/reachinbox?schema=public'),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  ELASTICSEARCH_URL: z.string().url().default('http://localhost:9200'),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
  WORKER_CONCURRENCY: z.string().transform((val) => parseInt(val, 10)).default('5'),
  MIN_EMAIL_DELAY_MS: z.string().transform((val) => parseInt(val, 10)).default('2000'),
  MAX_EMAILS_PER_HOUR: z.string().transform((val) => parseInt(val, 10)).default('200'),
  SESSION_SECRET: z.string().min(16).default('reachinbox_super_secret_session_key_32chars'),
  JWT_SECRET: z.string().min(16).default('reachinbox_super_secret_jwt_key_32chars'),
  GOOGLE_CLIENT_ID: z.string().optional().default(''),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(''),
  GOOGLE_CALLBACK_URL: z.string().default('http://localhost:4000/auth/google/callback'),
  SLACK_CLIENT_ID: z.string().optional().default(''),
  SLACK_CLIENT_SECRET: z.string().optional().default(''),
  SLACK_REDIRECT_URI: z.string().default('http://localhost:4000/auth/slack/callback'),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ Invalid environment variables configuration:', parsedEnv.error.format());
  process.exit(1);
}

export const env = parsedEnv.data;
