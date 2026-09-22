import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import type { AuthRequest } from '../../middleware/auth.js';
import { requireBuyer, requireSeller } from '../../middleware/rbac.js';
import { ok } from '../../middleware/errorHandler.js';
import { rfqsService } from './rfqs.service.js';
import { createRfqSchema, updateRfqSchema, rfqFiltersSchema } from './rfqs.schema.js';
import { z } from 'zod';

export const rfqsRouter = Router();

rfqsRouter.use(authenticate);

// POST /api/v1/rfqs
rfqsRouter.post('/', requireBuyer, async (req: AuthRequest, res) => {
  const input = createRfqSchema.parse(req.body);
  const result = await rfqsService.create(input, req.user!);
  ok(res, result, 201);
});

// GET /api/v1/rfqs
rfqsRouter.get('/', async (req: AuthRequest, res) => {
  const filters = rfqFiltersSchema.parse(req.query);
  const result = await rfqsService.list(req.user!, filters);
  ok(res, result);
});

// GET /api/v1/rfqs/:rfqId
rfqsRouter.get('/:rfqId', async (req: AuthRequest, res) => {
  const result = await rfqsService.getById(req.params.rfqId, req.user!);
  ok(res, result);
});

// PATCH /api/v1/rfqs/:rfqId
rfqsRouter.patch('/:rfqId', requireBuyer, async (req: AuthRequest, res) => {
  const input = updateRfqSchema.parse(req.body);
  const result = await rfqsService.update(req.params.rfqId, input, req.user!);
  ok(res, result);
});

// POST /api/v1/rfqs/:rfqId/publish
rfqsRouter.post('/:rfqId/publish', requireBuyer, async (req: AuthRequest, res) => {
  const result = await rfqsService.publish(req.params.rfqId, req.user!);
  ok(res, result);
});

// POST /api/v1/rfqs/:rfqId/cancel
rfqsRouter.post('/:rfqId/cancel', requireBuyer, async (req: AuthRequest, res) => {
  const result = await rfqsService.cancel(req.params.rfqId, req.user!);
  ok(res, result);
});

// POST /api/v1/rfqs/:rfqId/close
rfqsRouter.post('/:rfqId/close', requireBuyer, async (req: AuthRequest, res) => {
  const result = await rfqsService.close(req.params.rfqId, req.user!);
  ok(res, result);
});

// GET /api/v1/rfqs/:rfqId/messages
rfqsRouter.get('/:rfqId/messages', async (req: AuthRequest, res) => {
  const result = await rfqsService.getMessages(req.params.rfqId, req.user!);
  ok(res, result);
});

// POST /api/v1/rfqs/:rfqId/messages
rfqsRouter.post('/:rfqId/messages', async (req: AuthRequest, res) => {
  const { message, recipientOrganizationId } = z.object({
    message: z.string().min(1).max(2000),
    recipientOrganizationId: z.string().cuid(),
  }).parse(req.body);
  const result = await rfqsService.postMessage(req.params.rfqId, message, recipientOrganizationId, req.user!);
  ok(res, result, 201);
});

// GET /api/v1/rfqs/:rfqId/bids — also served here for convenience
rfqsRouter.get('/:rfqId/bids', async (req: AuthRequest, res) => {
  const { bidsService } = await import('../bids/bids.service.js');
  const result = await bidsService.listForRfq(req.params.rfqId, req.user!);
  ok(res, result);
});

// POST /api/v1/rfqs/:rfqId/bids
rfqsRouter.post('/:rfqId/bids', requireSeller, async (req: AuthRequest, res) => {
  const { bidsService } = await import('../bids/bids.service.js');
  const { createBidSchema } = await import('../bids/bids.schema.js');
  const input = createBidSchema.parse(req.body);
  const result = await bidsService.submit({ ...input, rfqId: req.params.rfqId }, req.user!);
  ok(res, result, 201);
});

// POST /api/v1/rfqs/:rfqId/bids/:bidId/shortlist
rfqsRouter.post('/:rfqId/bids/:bidId/shortlist', requireBuyer, async (req: AuthRequest, res) => {
  const { bidsService } = await import('../bids/bids.service.js');
  const result = await bidsService.shortlist(req.params.bidId, req.params.rfqId, req.user!);
  ok(res, result);
});

// POST /api/v1/rfqs/:rfqId/award
rfqsRouter.post('/:rfqId/award', requireBuyer, async (req: AuthRequest, res) => {
  const { bidsService } = await import('../bids/bids.service.js');
  const { awardBidSchema } = await import('../bids/bids.schema.js');
  const input = awardBidSchema.parse(req.body);
  const result = await bidsService.award(req.params.rfqId, input, req.user!);
  ok(res, result, 201);
});
