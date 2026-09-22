import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import type { AuthRequest } from '../../middleware/auth.js';
import { ok } from '../../middleware/errorHandler.js';
import { documentsService, uploadRequestSchema, confirmUploadSchema } from './documents.service.js';
import { z } from 'zod';
import type { DocumentStatus } from '@prisma/client';

export const documentsRouter = Router();
documentsRouter.use(authenticate);

documentsRouter.post('/upload-url', async (req: AuthRequest, res) => {
  const input = uploadRequestSchema.parse(req.body);
  const result = await documentsService.requestUploadUrl(input, req.user!);
  ok(res, result);
});

documentsRouter.post('/confirm-upload', async (req: AuthRequest, res) => {
  const input = confirmUploadSchema.parse(req.body);
  const result = await documentsService.confirmUpload(input, req.user!);
  ok(res, result, 201);
});

documentsRouter.get('/', async (req: AuthRequest, res) => {
  const { page, pageSize } = z.object({ page: z.coerce.number().min(1).default(1), pageSize: z.coerce.number().min(1).max(100).default(20) }).parse(req.query);
  const result = await documentsService.list(req.user!, page, pageSize);
  ok(res, result);
});

documentsRouter.get('/:id/download-url', async (req: AuthRequest, res) => {
  const result = await documentsService.getDownloadUrl(req.params.id, req.user!);
  ok(res, result);
});

documentsRouter.patch('/:id/status', async (req: AuthRequest, res) => {
  const { status, notes } = z.object({ status: z.enum(['pending', 'under_review', 'verified', 'rejected', 'expired']), notes: z.string().optional() }).parse(req.body);
  const result = await documentsService.updateStatus(req.params.id, status as DocumentStatus, notes, req.user!);
  ok(res, result);
});
