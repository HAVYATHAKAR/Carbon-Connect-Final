import { prisma } from '../../db/client.js';
import { AppError, ErrorCodes, notFound, forbidden, badRequest } from '../../shared/errors/AppError.js';
import { generateRfqCode } from '../../shared/ids/codes.js';
import { paginationToSkipTake, inrToPaise } from '../../shared/pagination/index.js';
import { eventBus, EVENTS } from '../../shared/events/index.js';
import { auditService } from '../audit/audit.service.js';
import { AUDIT_ACTIONS } from '../../config/constants.js';
import type { CreateRfqInput, UpdateRfqInput } from './rfqs.schema.js';
import type { AuthenticatedUser } from '../../shared/permissions/index.js';
import type { RfqStatus } from '@prisma/client';

const OPEN_RFQ_STATUSES: RfqStatus[] = ['published', 'bids_received', 'shortlisted'];
const CANCELLABLE_STATUSES: RfqStatus[] = ['draft', 'published', 'bids_received', 'shortlisted'];

export const rfqsService = {
  async create(input: CreateRfqInput, actor: AuthenticatedUser): Promise<unknown> {
    const rfqCode = generateRfqCode();

    const rfq = await prisma.rfq.create({
      data: {
        rfqCode,
        buyerOrganizationId: actor.organizationId,
        title: input.title,
        description: input.description,
        gradeRequired: input.gradeRequired,
        minimumPurity: input.minimumPurity,
        physicalState: input.physicalState,
        quantityTonnes: input.quantityTonnes,
        quantityUnit: input.quantityUnit,
        deliveryStart: input.deliveryStart,
        deliveryEnd: input.deliveryEnd,
        deliveryAddress: input.deliveryAddress,
        deliveryState: input.deliveryState,
        deliveryCity: input.deliveryCity,
        budgetMinPaisePerTonne: input.budgetMinInrPerTonne ? inrToPaise(input.budgetMinInrPerTonne) : null,
        budgetMaxPaisePerTonne: input.budgetMaxInrPerTonne ? inrToPaise(input.budgetMaxInrPerTonne) : null,
        preferredDeliveryMode: input.preferredDeliveryMode,
        utilizationType: input.utilizationType,
        sourcePreference: input.sourcePreference,
        deadline: input.deadline,
        status: 'draft',
        createdBy: actor.userId,
        requirements: input.requirements
          ? { create: input.requirements }
          : undefined,
      },
      include: { requirements: true },
    });

    await auditService.log({
      actorUserId: actor.userId, actorOrganizationId: actor.organizationId,
      action: AUDIT_ACTIONS.RFQ_PUBLISHED, entityType: 'Rfq', entityId: rfq.id,
      afterJson: { rfqCode, status: 'draft' },
    });

    return formatRfq(rfq);
  },

  async list(actor: AuthenticatedUser, filters: { status?: string; page: number; pageSize: number }): Promise<unknown> {
    const { skip, take } = paginationToSkipTake({ page: filters.page, pageSize: filters.pageSize });

    const where: Record<string, unknown> = {};
    if (actor.role === 'BUYER_ADMIN' || actor.role === 'BUYER_MEMBER') {
      where['buyerOrganizationId'] = actor.organizationId;
    } else if (actor.role === 'SELLER_ADMIN' || actor.role === 'SELLER_MEMBER') {
      // Sellers see open RFQs that match published listings
      where['status'] = { in: OPEN_RFQ_STATUSES };
    } else if (actor.role !== 'PLATFORM_ADMIN') {
      where['buyerOrganizationId'] = actor.organizationId;
    }
    if (filters.status) where['status'] = filters.status;

    const [rfqs, total] = await Promise.all([
      prisma.rfq.findMany({ where, skip, take, orderBy: { createdAt: 'desc' }, include: { requirements: true, _count: { select: { bids: true } } } }),
      prisma.rfq.count({ where }),
    ]);

    return { data: rfqs.map(formatRfq), meta: { page: filters.page, pageSize: filters.pageSize, total } };
  },

  async getById(rfqId: string, actor: AuthenticatedUser): Promise<unknown> {
    const rfq = await prisma.rfq.findUnique({
      where: { id: rfqId },
      include: { requirements: true, _count: { select: { bids: true } } },
    });
    if (!rfq) throw notFound('RFQ', rfqId);
    assertRfqAccess(rfq, actor);
    return formatRfq(rfq);
  },

  async update(rfqId: string, input: UpdateRfqInput, actor: AuthenticatedUser): Promise<unknown> {
    const rfq = await prisma.rfq.findUnique({ where: { id: rfqId } });
    if (!rfq) throw notFound('RFQ', rfqId);
    if (rfq.buyerOrganizationId !== actor.organizationId) throw forbidden();
    if (rfq.status !== 'draft') {
      throw badRequest('RFQ_NOT_DRAFT', 'Only draft RFQs can be edited');
    }

    const updated = await prisma.rfq.update({
      where: { id: rfqId },
      data: {
        ...input,
        budgetMinPaisePerTonne: input.budgetMinInrPerTonne ? inrToPaise(input.budgetMinInrPerTonne) : undefined,
        budgetMaxPaisePerTonne: input.budgetMaxInrPerTonne ? inrToPaise(input.budgetMaxInrPerTonne) : undefined,
        budgetMinInrPerTonne: undefined,
        budgetMaxInrPerTonne: undefined,
      },
      include: { requirements: true },
    });

    await auditService.log({
      actorUserId: actor.userId, actorOrganizationId: actor.organizationId,
      action: AUDIT_ACTIONS.RFQ_EDITED, entityType: 'Rfq', entityId: rfqId,
      beforeJson: rfq, afterJson: updated,
    });

    return formatRfq(updated);
  },

  async publish(rfqId: string, actor: AuthenticatedUser): Promise<unknown> {
    const rfq = await prisma.rfq.findUnique({ where: { id: rfqId } });
    if (!rfq) throw notFound('RFQ', rfqId);
    if (rfq.buyerOrganizationId !== actor.organizationId) throw forbidden();
    if (rfq.status !== 'draft') {
      throw badRequest('RFQ_NOT_DRAFT', 'Only draft RFQs can be published');
    }

    const updated = await prisma.rfq.update({
      where: { id: rfqId },
      data: { status: 'published', publishedAt: new Date() },
      include: { requirements: true },
    });

    await auditService.log({
      actorUserId: actor.userId, actorOrganizationId: actor.organizationId,
      action: AUDIT_ACTIONS.RFQ_PUBLISHED, entityType: 'Rfq', entityId: rfqId,
      beforeJson: { status: 'draft' }, afterJson: { status: 'published' },
    });

    await eventBus.emit(EVENTS.RFQ_PUBLISHED, {
      rfqId: rfq.id, rfqCode: rfq.rfqCode,
      buyerOrganizationId: rfq.buyerOrganizationId, title: rfq.title,
    });

    return formatRfq(updated);
  },

  async cancel(rfqId: string, actor: AuthenticatedUser): Promise<unknown> {
    const rfq = await prisma.rfq.findUnique({ where: { id: rfqId } });
    if (!rfq) throw notFound('RFQ', rfqId);
    if (rfq.buyerOrganizationId !== actor.organizationId && actor.role !== 'PLATFORM_ADMIN') throw forbidden();
    if (!CANCELLABLE_STATUSES.includes(rfq.status)) {
      throw new AppError(409, 'RFQ_CANNOT_CANCEL', `RFQ in status '${rfq.status}' cannot be cancelled`);
    }

    const updated = await prisma.rfq.update({
      where: { id: rfqId },
      data: { status: 'cancelled' },
    });

    await auditService.log({
      actorUserId: actor.userId, actorOrganizationId: actor.organizationId,
      action: AUDIT_ACTIONS.RFQ_CANCELLED, entityType: 'Rfq', entityId: rfqId,
      beforeJson: { status: rfq.status }, afterJson: { status: 'cancelled' },
    });

    return formatRfq(updated);
  },

  async close(rfqId: string, actor: AuthenticatedUser): Promise<unknown> {
    const rfq = await prisma.rfq.findUnique({ where: { id: rfqId } });
    if (!rfq) throw notFound('RFQ', rfqId);
    if (rfq.buyerOrganizationId !== actor.organizationId && actor.role !== 'PLATFORM_ADMIN') throw forbidden();

    const updated = await prisma.rfq.update({
      where: { id: rfqId },
      data: { status: 'closed', closedAt: new Date() },
    });

    await auditService.log({
      actorUserId: actor.userId, actorOrganizationId: actor.organizationId,
      action: AUDIT_ACTIONS.RFQ_CLOSED, entityType: 'Rfq', entityId: rfqId,
      beforeJson: { status: rfq.status }, afterJson: { status: 'closed' },
    });

    return formatRfq(updated);
  },

  async getMessages(rfqId: string, actor: AuthenticatedUser): Promise<unknown> {
    const rfq = await prisma.rfq.findUnique({ where: { id: rfqId } });
    if (!rfq) throw notFound('RFQ', rfqId);

    const messages = await prisma.bidMessage.findMany({
      where: {
        rfqId,
        OR: [
          { senderOrganizationId: actor.organizationId },
          { recipientOrganizationId: actor.organizationId },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });
    return messages;
  },

  async postMessage(rfqId: string, message: string, recipientOrgId: string, actor: AuthenticatedUser): Promise<unknown> {
    const rfq = await prisma.rfq.findUnique({ where: { id: rfqId } });
    if (!rfq) throw notFound('RFQ', rfqId);

    const msg = await prisma.bidMessage.create({
      data: {
        rfqId, message,
        senderOrganizationId: actor.organizationId,
        recipientOrganizationId: recipientOrgId,
        senderId: actor.userId,
      },
    });
    return msg;
  },
};

function assertRfqAccess(rfq: { buyerOrganizationId: string; status: RfqStatus }, actor: AuthenticatedUser): void {
  if (actor.role === 'PLATFORM_ADMIN') return;
  if (actor.role === 'BUYER_ADMIN' || actor.role === 'BUYER_MEMBER') {
    if (rfq.buyerOrganizationId !== actor.organizationId) throw forbidden();
    return;
  }
  // Sellers can see published/open RFQs
  if (!OPEN_RFQ_STATUSES.includes(rfq.status)) {
    throw forbidden('This RFQ is not currently visible to suppliers');
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatRfq(rfq: any): unknown {
  return {
    ...rfq,
    budgetMinInrPerTonne: rfq.budgetMinPaisePerTonne ? rfq.budgetMinPaisePerTonne / 100 : null,
    budgetMaxInrPerTonne: rfq.budgetMaxPaisePerTonne ? rfq.budgetMaxPaisePerTonne / 100 : null,
    budgetMinPaisePerTonne: undefined,
    budgetMaxPaisePerTonne: undefined,
  };
}
