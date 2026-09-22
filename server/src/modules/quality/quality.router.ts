import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import type { AuthRequest } from '../../middleware/auth.js';
import { ok } from '../../middleware/errorHandler.js';
import { prisma } from '../../db/client.js';
import { notFound, forbidden } from '../../shared/errors/AppError.js';
import { z } from 'zod';

export const qualityRouter = Router();
qualityRouter.use(authenticate);

qualityRouter.get('/', async (req: AuthRequest, res) => {
  const { shipmentId } = z.object({ shipmentId: z.string().cuid().optional() }).parse(req.query);
  const records = await prisma.qualityRecord.findMany({
    where: shipmentId ? { shipmentId } : { batch: { listing: { organizationId: req.user!.organizationId } } },
    orderBy: { createdAt: 'desc' },
  });
  ok(res, records);
});

qualityRouter.post('/', async (req: AuthRequest, res) => {
  const input = z.object({
    shipmentId: z.string().cuid().optional(),
    listingId: z.string().cuid().optional(),
    batchId: z.string().cuid().optional(),
    analysisDate: z.coerce.date(),
    laboratoryName: z.string().min(2),
    purity: z.coerce.number().min(0).max(100),
    physicalState: z.enum(['gas', 'liquid', 'solid', 'gas_liquid', 'other']),
    contaminantsJson: z.record(z.number()),
    standardReference: z.string().optional(),
  }).parse(req.body);

  const record = await prisma.qualityRecord.create({ data: { ...input, status: 'pending' } });
  ok(res, record, 201);
});
