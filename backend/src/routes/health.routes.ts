import { Router } from 'express';
import {
  getGeneralHealth,
  getDbHealth,
  getRedisHealth,
  getElasticsearchHealth,
} from '../controllers/health.controller.js';

export const healthRouter = Router();

healthRouter.get('/', getGeneralHealth);
healthRouter.get('/db', getDbHealth);
healthRouter.get('/redis', getRedisHealth);
healthRouter.get('/elasticsearch', getElasticsearchHealth);
