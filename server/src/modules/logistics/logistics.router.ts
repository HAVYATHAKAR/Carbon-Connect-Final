import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import type { AuthRequest } from '../../middleware/auth.js';
import { ok } from '../../middleware/errorHandler.js';
import { logisticsService, createShipmentSchema, shipmentEventSchema } from './logistics.service.js';
import { z } from 'zod';
import type { ShipmentStatus } from '@prisma/client';

export const logisticsRouter = Router();
logisticsRouter.use(authenticate);

logisticsRouter.get('/:shipmentId', async (req: AuthRequest, res) => {
  const result = await logisticsService.getShipment(req.params.shipmentId, req.user!);
  ok(res, result);
});

logisticsRouter.post('/:shipmentId/events', async (req: AuthRequest, res) => {
  const input = shipmentEventSchema.parse(req.body);
  const result = await logisticsService.addEvent(req.params.shipmentId, input, req.user!);
  ok(res, result, 201);
});

logisticsRouter.patch('/:shipmentId/status', async (req: AuthRequest, res) => {
  const { status } = z.object({ status: z.string() }).parse(req.body);
  const result = await logisticsService.updateStatus(req.params.shipmentId, status as ShipmentStatus, req.user!);
  ok(res, result);
});

// Contracts sub-route for shipment creation is wired in contracts router
// This also handles: POST /api/v1/contracts/:contractId/shipments
// We re-export a helper used by contracts router
export { logisticsService as shipmentsService };
