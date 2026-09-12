import { Client } from '@elastic/elasticsearch';
import { env } from './env.js';

export const esClient = new Client({
  node: env.ELASTICSEARCH_URL,
  maxRetries: 0,
  requestTimeout: 1500,
});
