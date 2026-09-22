import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createHash } from 'node:crypto';
import { prisma } from '../../db/client.js';
import { env } from '../../config/env.js';
import { notFound, forbidden, badRequest } from '../../shared/errors/AppError.js';
import { auditService } from '../audit/audit.service.js';
import { eventBus, EVENTS } from '../../shared/events/index.js';
import { AUDIT_ACTIONS, ALLOWED_MIME_TYPES, PRESIGNED_URL_EXPIRY_SECONDS, DOWNLOAD_URL_EXPIRY_SECONDS } from '../../config/constants.js';
import type { AuthenticatedUser } from '../../shared/permissions/index.js';
import type { DocumentStatus } from '@prisma/client';
import { z } from 'zod';

const s3 = new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
});

export const uploadRequestSchema = z.object({
  fileName: z.string().min(1).max(255).regex(/^[\w\-. ]+$/, 'Invalid filename'),
  mimeType: z.string().min(1),
  sizeBytes: z.coerce.number().int().positive().max(env.UPLOAD_MAX_SIZE_MB * 1024 * 1024),
  documentType: z.string().min(1),
});

export const confirmUploadSchema = z.object({
  storageKey: z.string().min(1),
  sha256: z.string().length(64),
  sizeBytes: z.coerce.number().int().positive(),
  mimeType: z.string().min(1),
  fileName: z.string().min(1),
  documentType: z.string().min(1),
});

export const documentsService = {
  async requestUploadUrl(input: z.infer<typeof uploadRequestSchema>, actor: AuthenticatedUser) {
    if (!ALLOWED_MIME_TYPES.has(input.mimeType)) {
      throw badRequest('UPLOAD_TYPE_REJECTED', `MIME type '${input.mimeType}' is not allowed. Allowed: PDF, images, spreadsheets, Word documents.`);
    }

    const storageKey = `${actor.organizationId}/${Date.now()}-${input.fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

    const cmd = new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: storageKey,
      ContentType: input.mimeType,
      ContentLength: input.sizeBytes,
      Metadata: { organizationId: actor.organizationId, uploadedBy: actor.userId },
    });

    const uploadUrl = await getSignedUrl(s3, cmd, { expiresIn: PRESIGNED_URL_EXPIRY_SECONDS });
    return { uploadUrl, storageKey, expiresIn: PRESIGNED_URL_EXPIRY_SECONDS };
  },

  async confirmUpload(input: z.infer<typeof confirmUploadSchema>, actor: AuthenticatedUser) {
    // Server records metadata — never trust just the frontend's claim
    const doc = await prisma.document.create({
      data: {
        organizationId: actor.organizationId,
        uploadedBy: actor.userId,
        fileName: input.fileName,
        storageKey: input.storageKey, // Never exposed to client directly
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        sha256: input.sha256,
        documentType: input.documentType,
        status: 'pending',
      },
    });

    await auditService.log({ actorUserId: actor.userId, actorOrganizationId: actor.organizationId, action: AUDIT_ACTIONS.DOCUMENT_UPLOADED, entityType: 'Document', entityId: doc.id, afterJson: { documentType: input.documentType, fileName: input.fileName } });
    return { id: doc.id, status: doc.status, documentType: doc.documentType, fileName: doc.fileName, createdAt: doc.createdAt };
  },

  async list(actor: AuthenticatedUser, page: number, pageSize: number) {
    const skip = (page - 1) * pageSize;
    const [docs, total] = await Promise.all([
      prisma.document.findMany({ where: { organizationId: actor.organizationId }, skip, take: pageSize, orderBy: { createdAt: 'desc' }, select: { id: true, fileName: true, documentType: true, status: true, mimeType: true, sizeBytes: true, createdAt: true, verifiedAt: true } }),
      prisma.document.count({ where: { organizationId: actor.organizationId } }),
    ]);
    return { data: docs, meta: { page, pageSize, total } };
  },

  async getDownloadUrl(documentId: string, actor: AuthenticatedUser) {
    const doc = await prisma.document.findUnique({ where: { id: documentId } });
    if (!doc) throw notFound('Document', documentId);

    // Only org members or admin can download
    if (doc.organizationId !== actor.organizationId && actor.role !== 'PLATFORM_ADMIN' && actor.role !== 'VERIFIER') {
      throw forbidden('Access to this document is not permitted');
    }

    const cmd = new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: doc.storageKey });
    const url = await getSignedUrl(s3, cmd, { expiresIn: DOWNLOAD_URL_EXPIRY_SECONDS });
    return { downloadUrl: url, expiresIn: DOWNLOAD_URL_EXPIRY_SECONDS, fileName: doc.fileName };
  },

  async updateStatus(documentId: string, status: DocumentStatus, notes: string | undefined, actor: AuthenticatedUser) {
    if (actor.role !== 'VERIFIER' && actor.role !== 'PLATFORM_ADMIN') throw forbidden('Only verifiers and admins can change document status');

    const doc = await prisma.document.findUnique({ where: { id: documentId } });
    if (!doc) throw notFound('Document', documentId);

    const before = { status: doc.status };
    const updated = await prisma.document.update({
      where: { id: documentId },
      data: { status, verifiedBy: actor.userId, verifiedAt: new Date(), verificationNotes: notes },
    });

    await auditService.log({ actorUserId: actor.userId, actorOrganizationId: actor.organizationId, action: AUDIT_ACTIONS.DOCUMENT_STATUS_CHANGED, entityType: 'Document', entityId: documentId, beforeJson: before, afterJson: { status } });
    await eventBus.emit(EVENTS.DOCUMENT_STATUS_CHANGED, { documentId, status, organizationId: doc.organizationId });
    return updated;
  },
};
