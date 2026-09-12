import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import {
  getScheduledEmails,
  getSentEmails,
  getEmailById,
  scheduleEmails,
  cancelEmail,
  searchEmails,
  getSenders,
  createSender,
  getStats,
} from '../controllers/email.controller.js';

export const emailRouter = Router();

// Protect all email endpoints with authentication
emailRouter.use(requireAuth);

emailRouter.get('/scheduled', getScheduledEmails);
emailRouter.get('/sent', getSentEmails);
emailRouter.get('/search', searchEmails);
emailRouter.get('/stats', getStats);
emailRouter.get('/senders', getSenders);
emailRouter.post('/senders', createSender);
emailRouter.post('/schedule', scheduleEmails);
emailRouter.get('/:id', getEmailById);
emailRouter.post('/:id/cancel', cancelEmail);
