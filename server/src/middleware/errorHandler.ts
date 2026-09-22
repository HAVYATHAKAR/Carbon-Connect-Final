import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError, ErrorCodes } from '../shared/errors/AppError.js';
import { logger } from './logger.js';

export interface ApiResponse<T = unknown> {
  data: T | null;
  meta: { requestId: string; timestamp: string };
  error: { code: string; message: string; details?: unknown } | null;
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = (req as Request & { id?: string }).id ?? 'unknown';
  const timestamp = new Date().toISOString();

  if (err instanceof ZodError) {
    const fieldErrors = err.flatten().fieldErrors;
    res.status(400).json({
      data: null,
      meta: { requestId, timestamp },
      error: {
        code: ErrorCodes.VALIDATION_ERROR,
        message: 'Request validation failed',
        details: fieldErrors,
      },
    } satisfies ApiResponse);
    return;
  }

  if (err instanceof AppError) {
    if (!err.isOperational) {
      logger.error({ err, requestId }, 'Unexpected application error');
    }
    res.status(err.statusCode).json({
      data: null,
      meta: { requestId, timestamp },
      error: {
        code: err.code,
        message: err.message,
        details: err.details ?? {},
      },
    } satisfies ApiResponse);
    return;
  }

  // Unknown errors — never leak internals
  logger.error({ err, requestId }, 'Unhandled error');
  res.status(500).json({
    data: null,
    meta: { requestId, timestamp },
    error: {
      code: ErrorCodes.INTERNAL_ERROR,
      message: 'An unexpected error occurred. Please try again.',
    },
  } satisfies ApiResponse);
}

/** Wrap route handler response in the standard envelope */
export function ok<T>(res: Response, data: T, statusCode = 200): void {
  const requestId = (res.req as Request & { id?: string }).id ?? 'unknown';
  res.status(statusCode).json({
    data,
    meta: { requestId, timestamp: new Date().toISOString() },
    error: null,
  } satisfies ApiResponse<T>);
}
