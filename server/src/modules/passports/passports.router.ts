import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import type { AuthRequest } from '../../middleware/auth.js';
import { ok } from '../../middleware/errorHandler.js';
import { prisma } from '../../db/client.js';
import { notFound, forbidden } from '../../shared/errors/AppError.js';
import { generatePassportCode } from '../../shared/ids/codes.js';
import { auditService } from '../audit/audit.service.js';
import { AUDIT_ACTIONS, PHYSICAL_CO2_DISCLAIMER } from '../../config/constants.js';
import { z } from 'zod';

export const passportsRouter = Router();
passportsRouter.use(authenticate);

passportsRouter.get('/:id', async (req: AuthRequest, res) => {
  const passport = await prisma.digitalPassport.findUnique({ where: { id: req.params.id }, include: { batch: true } });
  if (!passport) throw notFound('DigitalPassport', req.params.id);
  ok(res, passport);
});

passportsRouter.post('/', async (req: AuthRequest, res) => {
  if (req.user!.role !== 'PLATFORM_ADMIN' && req.user!.role !== 'SELLER_ADMIN') throw forbidden('Only sellers and admins can issue digital passports');

  const input = z.object({
    batchId: z.string().cuid(),
    shipmentId: z.string().cuid(),
    utilizationType: z.string().min(2),
    acceptanceStatus: z.string().optional(),
  }).parse(req.body);

  const [batch, shipment, qualityRecord] = await Promise.all([
    prisma.batch.findUnique({ where: { id: input.batchId } }),
    prisma.shipment.findUnique({ where: { id: input.shipmentId } }),
    prisma.qualityRecord.findFirst({ where: { batchId: input.batchId }, orderBy: { createdAt: 'desc' } }),
  ]);

  if (!batch) throw notFound('Batch', input.batchId);
  if (!shipment) throw notFound('Shipment', input.shipmentId);

  const passportCode = generatePassportCode();

  const passport = await prisma.digitalPassport.create({
    data: {
      passportCode,
      batchId: input.batchId,
      shipmentId: input.shipmentId,
      puritySnapshot: qualityRecord?.purity ?? 0,
      contaminantsSnapshotJson: qualityRecord?.contaminantsJson ?? {},
      custodyEventsJson: [],
      documentsSnapshotJson: [],
      utilizationType: input.utilizationType,
      physicalCo2Disclaimer: PHYSICAL_CO2_DISCLAIMER,
      acceptanceStatus: input.acceptanceStatus,
      issuedBy: req.user!.userId,
    },
  });

  await auditService.log({ actorUserId: req.user!.userId, actorOrganizationId: req.user!.organizationId, action: AUDIT_ACTIONS.PASSPORT_ISSUED, entityType: 'DigitalPassport', entityId: passport.id, afterJson: { passportCode } });
  ok(res, passport, 201);
});
