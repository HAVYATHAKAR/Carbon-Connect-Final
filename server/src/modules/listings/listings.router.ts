import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import type { AuthRequest } from '../../middleware/auth.js';
import { requireSeller } from '../../middleware/rbac.js';
import { ok } from '../../middleware/errorHandler.js';
import { listingsService } from './listings.service.js';
import { createListingSchema, updateListingSchema, listingFiltersSchema } from './listings.schema.js';

export const listingsRouter = Router();

// Public listing browse
listingsRouter.get('/', async (req: AuthRequest, res) => {
  const filters = listingFiltersSchema.parse(req.query);
  const result = await listingsService.list(filters, req.user);
  ok(res, result);
});

listingsRouter.get('/:id', async (req, res) => {
  const result = await listingsService.getById(req.params.id);
  ok(res, result);
});

// Seller-only routes
listingsRouter.post('/', authenticate, requireSeller, async (req: AuthRequest, res) => {
  const input = createListingSchema.parse(req.body);
  const result = await listingsService.create(input, req.user!);
  ok(res, result, 201);
});

listingsRouter.patch('/:id', authenticate, requireSeller, async (req: AuthRequest, res) => {
  const input = updateListingSchema.parse(req.body);
  const result = await listingsService.update(req.params.id, input, req.user!);
  ok(res, result);
});

listingsRouter.post('/:id/publish', authenticate, requireSeller, async (req: AuthRequest, res) => {
  const result = await listingsService.publish(req.params.id, req.user!);
  ok(res, result);
});

listingsRouter.post('/:id/pause', authenticate, requireSeller, async (req: AuthRequest, res) => {
  const result = await listingsService.pause(req.params.id, req.user!);
  ok(res, result);
});
