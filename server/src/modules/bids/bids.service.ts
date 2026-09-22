import { prisma } from '../../db/client.js';
import { AppError, ErrorCodes, notFound, forbidden, badRequest, conflict } from '../../shared/errors/AppError.js';
import { generateBidCode, generateContractCode } from '../../shared/ids/codes.js';
import { inrToPaise } from '../../shared/pagination/index.js';
import { eventBus, EVENTS } from '../../shared/events/index.js';
import { auditService } from '../audit/audit.service.js';
import { AUDIT_ACTIONS, PHYSICAL_CO2_DISCLAIMER } from '../../config/constants.js';
import type { CreateBidInput, AwardBidInput } from './bids.schema.js';
import type { AuthenticatedUser } from '../../shared/permissions/index.js';
import type { BidStatus, Prisma } from '@prisma/client';

const ACTIVE_BID_STATUSES: BidStatus[] = ['submitted', 'shortlisted'];

export const bidsService = {
  async submit(input: CreateBidInput, actor: AuthenticatedUser): Promise<unknown> {
    // 1. Validate RFQ is open
    const rfq = await prisma.rfq.findUnique({ where: { id: input.rfqId } });
    if (!rfq) throw notFound('RFQ', input.rfqId);
    if (!['published', 'bids_received', 'shortlisted'].includes(rfq.status)) {
      throw new AppError(409, ErrorCodes.RFQ_NOT_OPEN, 'This RFQ is no longer accepting bids');
    }
    if (rfq.deadline && rfq.deadline < new Date()) {
      throw new AppError(409, ErrorCodes.RFQ_DEADLINE_PASSED, 'The bid deadline for this RFQ has passed');
    }

    // 2. Check for existing active bid from this org on this RFQ
    const existingBid = await prisma.bid.findFirst({
      where: {
        rfqId: input.rfqId,
        sellerOrganizationId: actor.organizationId,
        status: { in: ACTIVE_BID_STATUSES },
      },
    });
    if (existingBid) {
      throw conflict(ErrorCodes.DUPLICATE_BID, 'Your organization already has an active bid on this RFQ. Withdraw it before submitting a new one.');
    }

    // 3. Idempotency check
    if (input.idempotencyKey) {
      const idem = await prisma.bid.findFirst({ where: { idempotencyKey: input.idempotencyKey } });
      if (idem) return formatBid(idem);
    }

    // 4. Validate listing
    const listing = await prisma.listing.findUnique({ where: { id: input.listingId } });
    if (!listing) throw notFound('Listing', input.listingId);
    if (listing.organizationId !== actor.organizationId) throw forbidden('You can only bid with your own listings');
    if (listing.status !== 'published') throw badRequest('LISTING_NOT_PUBLISHED', 'Listing must be published to use in a bid');

    // 5. Quantity validation
    if (Number(input.quantityTonnes) > Number(listing.availableQuantityTonnes)) {
      throw badRequest(ErrorCodes.BID_INVALID_QUANTITY, `Bid quantity (${input.quantityTonnes}t) exceeds listing available quantity (${listing.availableQuantityTonnes}t)`);
    }

    // 6. Price validation
    if (input.exWorksPriceInrPerTonne <= 0) {
      throw badRequest(ErrorCodes.BID_INVALID_PRICE, 'Ex-works price must be positive');
    }

    // 7. SERVER-SIDE price calculation — never trust frontend totals
    const exWorksPaise = inrToPaise(input.exWorksPriceInrPerTonne);
    const logisticsPaise = inrToPaise(input.logisticsPriceInrPerTonne);
    const deliveredPaise = exWorksPaise + logisticsPaise;
    const totalPaise = BigInt(deliveredPaise) * BigInt(Math.round(Number(input.quantityTonnes) * 100)) / BigInt(100);

    const bidCode = generateBidCode();

    const bid = await prisma.$transaction(async (tx) => {
      const newBid = await tx.bid.create({
        data: {
          bidCode,
          rfqId: input.rfqId,
          sellerOrganizationId: actor.organizationId,
          listingId: input.listingId,
          quantityTonnes: input.quantityTonnes,
          exWorksPricePaisePerTonne: exWorksPaise,
          logisticsPricePaisePerTonne: logisticsPaise,
          deliveredPricePaisePerTonne: deliveredPaise,
          totalEstimatedValuePaise: totalPaise,
          leadTimeBusinessDays: input.leadTimeBusinessDays,
          validUntil: input.validUntil,
          sellerNote: input.sellerNote,
          evidenceSummary: input.evidenceSummary,
          idempotencyKey: input.idempotencyKey,
          status: 'submitted',
          submittedAt: new Date(),
        },
      });

      // Advance RFQ status to bids_received if it was published
      if (rfq.status === 'published') {
        await tx.rfq.update({ where: { id: input.rfqId }, data: { status: 'bids_received' } });
      }

      return newBid;
    });

    await auditService.log({
      actorUserId: actor.userId, actorOrganizationId: actor.organizationId,
      action: AUDIT_ACTIONS.BID_SUBMITTED, entityType: 'Bid', entityId: bid.id,
      afterJson: { bidCode, rfqId: input.rfqId, deliveredPriceInr: deliveredPaise / 100 },
    });

    await eventBus.emit(EVENTS.BID_SUBMITTED, {
      bidId: bid.id, bidCode, rfqId: input.rfqId,
      sellerOrganizationId: actor.organizationId,
      buyerOrganizationId: rfq.buyerOrganizationId,
    });

    return formatBid(bid);
  },

  async listForRfq(rfqId: string, actor: AuthenticatedUser): Promise<unknown> {
    const rfq = await prisma.rfq.findUnique({ where: { id: rfqId } });
    if (!rfq) throw notFound('RFQ', rfqId);

    // Buyers see all bids on their RFQ; sellers see only their own
    const where: Prisma.BidWhereInput = { rfqId };
    if (actor.role === 'SELLER_ADMIN' || actor.role === 'SELLER_MEMBER') {
      where.sellerOrganizationId = actor.organizationId;
    } else if (actor.role !== 'PLATFORM_ADMIN') {
      if (rfq.buyerOrganizationId !== actor.organizationId) throw forbidden();
    }

    const bids = await prisma.bid.findMany({
      where,
      include: { listing: { select: { listingCode: true, title: true, grade: true, facilityId: true } } },
      orderBy: { deliveredPricePaisePerTonne: 'asc' },
    });

    return bids.map(formatBid);
  },

  async getById(bidId: string, actor: AuthenticatedUser): Promise<unknown> {
    const bid = await prisma.bid.findUnique({
      where: { id: bidId },
      include: { listing: true, rfq: true },
    });
    if (!bid) throw notFound('Bid', bidId);

    // Access control — buyer owns RFQ or seller owns bid
    const rfq = bid.rfq;
    const isBuyer = rfq.buyerOrganizationId === actor.organizationId;
    const isBidOwner = bid.sellerOrganizationId === actor.organizationId;
    if (!isBuyer && !isBidOwner && actor.role !== 'PLATFORM_ADMIN') throw forbidden();

    return formatBid(bid);
  },

  async withdraw(bidId: string, actor: AuthenticatedUser): Promise<unknown> {
    const bid = await prisma.bid.findUnique({ where: { id: bidId } });
    if (!bid) throw notFound('Bid', bidId);
    if (bid.sellerOrganizationId !== actor.organizationId) throw forbidden();
    if (bid.status === 'withdrawn') throw new AppError(409, ErrorCodes.BID_ALREADY_WITHDRAWN, 'Bid already withdrawn');
    if (!['submitted', 'shortlisted'].includes(bid.status)) {
      throw badRequest('BID_CANNOT_WITHDRAW', `Bid in status '${bid.status}' cannot be withdrawn`);
    }

    const updated = await prisma.bid.update({
      where: { id: bidId },
      data: { status: 'withdrawn', withdrawnAt: new Date() },
    });

    await auditService.log({
      actorUserId: actor.userId, actorOrganizationId: actor.organizationId,
      action: AUDIT_ACTIONS.BID_WITHDRAWN, entityType: 'Bid', entityId: bidId,
      beforeJson: { status: bid.status }, afterJson: { status: 'withdrawn' },
    });

    return formatBid(updated);
  },

  async shortlist(bidId: string, rfqId: string, actor: AuthenticatedUser): Promise<unknown> {
    const bid = await prisma.bid.findUnique({ where: { id: bidId }, include: { rfq: true } });
    if (!bid) throw notFound('Bid', bidId);
    if (bid.rfqId !== rfqId) throw badRequest(ErrorCodes.BID_WRONG_RFQ, 'Bid does not belong to this RFQ');
    if (bid.rfq.buyerOrganizationId !== actor.organizationId) throw forbidden();
    if (!['submitted', 'shortlisted'].includes(bid.status)) {
      throw badRequest('BID_CANNOT_SHORTLIST', 'Only submitted bids can be shortlisted');
    }

    const newStatus: BidStatus = bid.status === 'shortlisted' ? 'submitted' : 'shortlisted';
    const updated = await prisma.bid.update({ where: { id: bidId }, data: { status: newStatus } });

    await auditService.log({
      actorUserId: actor.userId, actorOrganizationId: actor.organizationId,
      action: AUDIT_ACTIONS.BID_SHORTLISTED, entityType: 'Bid', entityId: bidId,
      beforeJson: { status: bid.status }, afterJson: { status: newStatus },
    });

    if (newStatus === 'shortlisted') {
      await eventBus.emit(EVENTS.BID_SHORTLISTED, { bidId, rfqId, sellerOrganizationId: bid.sellerOrganizationId });
    }

    return formatBid(updated);
  },

  // ─────────────────────────────────────────────────────────────────────────
  // AWARD — runs in a DB transaction with row-level locking
  // Idempotent: same idempotencyKey + rfqId returns same result
  // Atomically declines all other active bids
  // Creates Award record + draft Contract
  // ─────────────────────────────────────────────────────────────────────────
  async award(rfqId: string, input: AwardBidInput, actor: AuthenticatedUser): Promise<unknown> {
    // Pre-checks outside transaction (fast-fail)
    const rfq = await prisma.rfq.findUnique({
      where: { id: rfqId },
      include: { award: true },
    });
    if (!rfq) throw notFound('RFQ', rfqId);
    if (rfq.buyerOrganizationId !== actor.organizationId) throw forbidden('Only the buyer can award their own RFQ');

    // Idempotency — if already awarded with same bidId, return existing
    if (rfq.award) {
      if (rfq.award.bidId === input.bidId) {
        const existing = await prisma.award.findUnique({
          where: { id: rfq.award.id },
          include: { contract: true },
        });
        return existing;
      }
      throw new AppError(409, ErrorCodes.DUPLICATE_AWARD, 'This RFQ has already been awarded');
    }

    if (!['published', 'bids_received', 'shortlisted'].includes(rfq.status)) {
      throw new AppError(409, ErrorCodes.RFQ_ALREADY_AWARDED, `RFQ status '${rfq.status}' does not allow awarding`);
    }

    // Validate the target bid
    const targetBid = await prisma.bid.findUnique({ where: { id: input.bidId } });
    if (!targetBid) throw notFound('Bid', input.bidId);
    if (targetBid.rfqId !== rfqId) throw badRequest(ErrorCodes.BID_WRONG_RFQ, 'Bid does not belong to this RFQ');
    if (!['submitted', 'shortlisted'].includes(targetBid.status)) {
      throw new AppError(409, ErrorCodes.BID_NOT_ACTIVE, `Bid status '${targetBid.status}' cannot be awarded`);
    }

    // Confirmations — non-negotiable
    if (!input.confirmEvidenceReviewed) {
      throw badRequest(ErrorCodes.BID_EVIDENCE_NOT_REVIEWED, 'You must confirm evidence has been reviewed');
    }
    if (!input.confirmPhysicalCo2Transaction) {
      throw badRequest(ErrorCodes.BID_CO2_NOT_CONFIRMED, 'You must confirm this is a physical CO₂ transaction');
    }

    const contractCode = generateContractCode();

    // ── Transactional award ────────────────────────────────────────────────
    const result = await prisma.$transaction(async (tx) => {
      // Lock the RFQ row to prevent concurrent awards
      await tx.$queryRaw`SELECT id FROM rfqs WHERE id = ${rfqId} FOR UPDATE`;

      // Double-check no award was created in the race window
      const latestRfq = await tx.rfq.findUnique({ where: { id: rfqId } });
      if (latestRfq?.awardedBidId) {
        throw new AppError(409, ErrorCodes.DUPLICATE_AWARD, 'This RFQ was just awarded by another request');
      }

      // Decline all other active bids
      const declinedBids = await tx.bid.findMany({
        where: {
          rfqId,
          id: { not: input.bidId },
          status: { in: ACTIVE_BID_STATUSES },
        },
        select: { id: true, sellerOrganizationId: true },
      });

      await tx.bid.updateMany({
        where: { rfqId, id: { not: input.bidId }, status: { in: ACTIVE_BID_STATUSES } },
        data: { status: 'declined' },
      });

      // Award the winning bid
      await tx.bid.update({ where: { id: input.bidId }, data: { status: 'awarded' } });

      // Create Award record
      const award = await tx.award.create({
        data: {
          rfqId,
          bidId: input.bidId,
          buyerOrganizationId: actor.organizationId,
          sellerOrganizationId: targetBid.sellerOrganizationId,
          awardedBy: actor.userId,
          awardNote: input.awardNote,
          idempotencyKey: input.idempotencyKey,
        },
      });

      // Create draft Contract
      const contract = await tx.contract.create({
        data: {
          contractCode,
          rfqId,
          bidId: input.bidId,
          awardId: award.id,
          buyerOrganizationId: actor.organizationId,
          sellerOrganizationId: targetBid.sellerOrganizationId,
          status: 'draft',
          termsJson: {
            disclaimer: PHYSICAL_CO2_DISCLAIMER,
            rfqCode: rfq.rfqCode,
            bidCode: targetBid.bidCode,
            quantityTonnes: Number(targetBid.quantityTonnes),
            deliveredPriceInrPerTonne: targetBid.deliveredPricePaisePerTonne / 100,
            totalEstimatedValueInr: Number(targetBid.totalEstimatedValuePaise) / 100,
            leadTimeBusinessDays: targetBid.leadTimeBusinessDays,
            awardNote: input.awardNote,
            awardedAt: new Date().toISOString(),
          },
        },
      });

      // Mark RFQ as awarded
      await tx.rfq.update({
        where: { id: rfqId },
        data: { status: 'awarded', awardedBidId: input.bidId },
      });

      return { award, contract, declinedBids };
    });

    // ── Post-transaction audit & events ───────────────────────────────────
    await auditService.log({
      actorUserId: actor.userId, actorOrganizationId: actor.organizationId,
      action: AUDIT_ACTIONS.BID_AWARDED, entityType: 'Award', entityId: result.award.id,
      afterJson: { bidId: input.bidId, rfqId, contractCode, declinedBidCount: result.declinedBids.length },
    });

    for (const declined of result.declinedBids) {
      await auditService.log({
        actorUserId: actor.userId, actorOrganizationId: actor.organizationId,
        action: AUDIT_ACTIONS.BID_DECLINED, entityType: 'Bid', entityId: declined.id,
        afterJson: { status: 'declined', reason: 'Another bid was awarded' },
      });
    }

    await eventBus.emit(EVENTS.BID_AWARDED, {
      awardId: result.award.id,
      bidId: input.bidId,
      rfqId,
      buyerOrganizationId: actor.organizationId,
      sellerOrganizationId: targetBid.sellerOrganizationId,
      declinedBidIds: result.declinedBids.map((b) => b.id),
    });

    await eventBus.emit(EVENTS.CONTRACT_READY, {
      contractId: result.contract.id,
      rfqId,
      buyerOrganizationId: actor.organizationId,
      sellerOrganizationId: targetBid.sellerOrganizationId,
    });

    return {
      award: result.award,
      contract: { id: result.contract.id, contractCode: result.contract.contractCode, status: result.contract.status },
      declinedBidCount: result.declinedBids.length,
    };
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatBid(bid: any): unknown {
  return {
    ...bid,
    exWorksPriceInrPerTonne: bid.exWorksPricePaisePerTonne / 100,
    logisticsPriceInrPerTonne: bid.logisticsPricePaisePerTonne / 100,
    deliveredPriceInrPerTonne: bid.deliveredPricePaisePerTonne / 100,
    totalEstimatedValueInr: Number(bid.totalEstimatedValuePaise) / 100,
    exWorksPricePaisePerTonne: undefined,
    logisticsPricePaisePerTonne: undefined,
    deliveredPricePaisePerTonne: undefined,
    totalEstimatedValuePaise: undefined,
  };
}
