import { z } from 'zod';

export const paginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(20),
});

export type PaginationParams = z.infer<typeof paginationSchema>;

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

export function paginate<T>(
  items: T[],
  total: number,
  params: PaginationParams,
): PaginatedResult<T> {
  const totalPages = Math.ceil(total / params.pageSize);
  return {
    data: items,
    meta: {
      page: params.page,
      pageSize: params.pageSize,
      total,
      totalPages,
      hasNextPage: params.page < totalPages,
      hasPrevPage: params.page > 1,
    },
  };
}

export function paginationToSkipTake(params: PaginationParams): {
  skip: number;
  take: number;
} {
  return {
    skip: (params.page - 1) * params.pageSize,
    take: params.pageSize,
  };
}

/** Convert price in paise (integer) to INR decimal string */
export function paiseToInr(paise: number | bigint): string {
  const n = typeof paise === 'bigint' ? Number(paise) : paise;
  return (n / 100).toFixed(2);
}

/** Convert INR float to paise integer (never trust frontend totals) */
export function inrToPaise(inr: number): number {
  return Math.round(inr * 100);
}
