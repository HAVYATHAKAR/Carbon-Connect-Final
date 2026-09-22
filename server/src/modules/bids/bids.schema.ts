import { z } from 'zod';

export const createBidSchema = z.object({
  listingId: z.string().cuid(),
  quantityTonnes: z.coerce.number().positive(),
  exWorksPriceInrPerTonne: z.coerce.number().positive(),
  logisticsPriceInrPerTonne: z.coerce.number().min(0),
  leadTimeBusinessDays: z.coerce.number().int().min(1).max(365),
  validUntil: z.coerce.date().optional(),
  sellerNote: z.string().max(2000).optional(),
  evidenceSummary: z.string().max(1000).optional(),
  idempotencyKey: z.string().max(100).optional(),
});

export const awardBidSchema = z.object({
  bidId: z.string().cuid(),
  awardNote: z.string().max(2000).optional(),
  confirmEvidenceReviewed: z.literal(true, {
    errorMap: () => ({ message: 'You must confirm evidence has been reviewed before awarding' }),
  }),
  confirmPhysicalCo2Transaction: z.literal(true, {
    errorMap: () => ({ message: 'You must confirm this is a physical CO₂ transaction' }),
  }),
  idempotencyKey: z.string().max(100).optional(),
});

export type CreateBidInput = z.infer<typeof createBidSchema> & { rfqId: string };
export type AwardBidInput = z.infer<typeof awardBidSchema>;
