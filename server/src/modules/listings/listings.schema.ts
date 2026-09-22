import { z } from 'zod';

export const createListingSchema = z.object({
  facilityId: z.string().cuid(),
  title: z.string().min(5).max(200),
  grade: z.string().min(1),
  purityMinimum: z.coerce.number().min(0).max(100),
  physicalState: z.enum(['gas', 'liquid', 'solid', 'gas_liquid', 'other']),
  temperature: z.string().optional(),
  pressure: z.string().optional(),
  availableQuantityTonnes: z.coerce.number().positive(),
  minimumOrderTonnes: z.coerce.number().positive(),
  basePriceInrPerTonne: z.coerce.number().positive(),
  availabilityStart: z.coerce.date().optional(),
  availabilityEnd: z.coerce.date().optional(),
  deliveryRadiusKm: z.coerce.number().int().positive().optional(),
  deliveryTerms: z.string().max(500).optional(),
});

export const updateListingSchema = createListingSchema.partial();

export const listingFiltersSchema = z.object({
  state: z.string().optional(),
  city: z.string().optional(),
  physicalState: z.string().optional(),
  grade: z.string().optional(),
  minPurity: z.coerce.number().optional(),
  minQty: z.coerce.number().optional(),
  maxPriceInr: z.coerce.number().optional(),
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(20),
});

export type CreateListingInput = z.infer<typeof createListingSchema>;
