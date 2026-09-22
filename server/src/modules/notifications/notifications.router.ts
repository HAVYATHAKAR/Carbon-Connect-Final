import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import type { AuthRequest } from '../../middleware/auth.js';
import { ok } from '../../middleware/errorHandler.js';
import { notificationService } from './notification.service.js';
import { z } from 'zod';

export const notificationsRouter = Router();
notificationsRouter.use(authenticate);

notificationsRouter.get('/', async (req: AuthRequest, res) => {
  const { page, pageSize } = z.object({ page: z.coerce.number().min(1).default(1), pageSize: z.coerce.number().min(1).max(100).default(20) }).parse(req.query);
  const result = await notificationService.getForUser(req.user!.userId, page, pageSize);
  ok(res, result);
});

notificationsRouter.patch('/:id/read', async (req: AuthRequest, res) => {
  await notificationService.markRead(req.params.id, req.user!.userId);
  ok(res, { success: true });
});

notificationsRouter.post('/mark-all-read', async (req: AuthRequest, res) => {
  await notificationService.markAllRead(req.user!.userId);
  ok(res, { success: true });
});
