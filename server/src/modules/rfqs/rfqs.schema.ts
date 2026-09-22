import { z } from 'zod';

export const createRfqSchema = z.object({
  title: z.string().min(5).max(200),
  description: z.string().max(2000).optional(),
  gradeRequired: z.string().min(1),
  minimumPurity: z.coerce.number().min(0).max(100),
  physicalState: z.enum(['gas', 'liquid', 'solid', 'gas_liquid', 'other']),
  quantityTonnes: z.coerce.number().positive(),
  quantityUnit: z.string().default('tonnes'),
  deliveryStart: z.coerce.date().optional(),
  deliveryEnd: z.coerce.date().optional(),
  deliveryAddress: z.string().min(5),
  deliveryState: z.string().min(2),
  deliveryCity: z.string().min(2),
  budgetMinInrPerTonne: z.coerce.number().positive().optional(),
  budgetMaxInrPerTonne: z.coerce.number().positive().optional(),
  preferredDeliveryMode: z.string().optional(),
  utilizationType: z.array(z.string()).min(1),
  sourcePreference: z.string().optional(),
  deadline: z.coerce.date().optional(),
  requirements: z.array(z.object({
    requirementType: z.enum(['certificate', 'quality', 'custody', 'delivery', 'compliance', 'other']),
    label: z.string().min(2),
    isRequired: z.boolean().default(true),
  })).optional(),
});

export const updateRfqSchema = createRfqSchema.partial();

export const rfqFiltersSchema = z.object({
  status: z.string().optional(),
  state: z.string().optional(),
  grade: z.string().optional(),
  physicalState: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(20),
});

export type CreateRfqInput = z.infer<typeof createRfqSchema>;
export type UpdateRfqInput = z.infer<typeof updateRfqSchema>;
