import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import type { AuthRequest } from '../../middleware/auth.js';
import { ok } from '../../middleware/errorHandler.js';
import { bidsService } from './bids.service.js';

export const bidsRouter = Router();
bidsRouter.use(authenticate);

// GET /api/v1/bids/:bidId
bidsRouter.get('/:bidId', async (req: AuthRequest, res) => {
  const result = await bidsService.getById(req.params.bidId, req.user!);
  ok(res, result);
});

// POST /api/v1/bids/:bidId/withdraw
bidsRouter.post('/:bidId/withdraw', async (req: AuthRequest, res) => {
  const result = await bidsService.withdraw(req.params.bidId, req.user!);
  ok(res, result);
});
