import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import type { AuthRequest } from '../../middleware/auth.js';
import { ok } from '../../middleware/errorHandler.js';
import { prisma } from '../../db/client.js';
import { z } from 'zod';

export const mrvRouter = Router();
mrvRouter.use(authenticate);

mrvRouter.get('/', async (req: AuthRequest, res) => {
  const records = await prisma.mrvRecord.findMany({
    where: { organizationId: req.user!.organizationId },
    orderBy: { createdAt: 'desc' },
  });
  ok(res, records);
});

mrvRouter.post('/', async (req: AuthRequest, res) => {
  const input = z.object({
    facilityId: z.string().cuid().optional(),
    contractId: z.string().cuid().optional(),
    shipmentId: z.string().cuid().optional(),
    activityType: z.string().min(2),
    measurementType: z.string().min(2),
    value: z.coerce.number(),
    unit: z.string().min(1),
    methodology: z.string().optional(),
    dataStatus: z.enum(['measured', 'estimated', 'verified']).default('measured'),
    reviewNotes: z.string().optional(),
  }).parse(req.body);

  const record = await prisma.mrvRecord.create({
    data: { ...input, organizationId: req.user!.organizationId },
  });
  ok(res, record, 201);
});
