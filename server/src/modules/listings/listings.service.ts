import { prisma } from '../../db/client.js';
import { notFound, forbidden, badRequest } from '../../shared/errors/AppError.js';
import { generateListingCode } from '../../shared/ids/codes.js';
import { inrToPaise, paginationToSkipTake } from '../../shared/pagination/index.js';
import { auditService } from '../audit/audit.service.js';
import { AUDIT_ACTIONS } from '../../config/constants.js';
import type { CreateListingInput } from './listings.schema.js';
import type { AuthenticatedUser } from '../../shared/permissions/index.js';
import type { Prisma } from '@prisma/client';

export const listingsService = {
  async create(input: CreateListingInput, actor: AuthenticatedUser) {
    const facility = await prisma.facility.findUnique({ where: { id: input.facilityId } });
    if (!facility) throw notFound('Facility', input.facilityId);
    if (facility.organizationId !== actor.organizationId) throw forbidden('Facility does not belong to your organization');

    const listingCode = generateListingCode();
    const listing = await prisma.listing.create({
      data: {
        listingCode,
        organizationId: actor.organizationId,
        facilityId: input.facilityId,
        title: input.title,
        grade: input.grade,
        purityMinimum: input.purityMinimum,
        physicalState: input.physicalState,
        temperature: input.temperature,
        pressure: input.pressure,
        availableQuantityTonnes: input.availableQuantityTonnes,
        minimumOrderTonnes: input.minimumOrderTonnes,
        basePricePaisePerTonne: inrToPaise(input.basePriceInrPerTonne),
        availabilityStart: input.availabilityStart,
        availabilityEnd: input.availabilityEnd,
        deliveryRadiusKm: input.deliveryRadiusKm,
        deliveryTerms: input.deliveryTerms,
        status: 'draft',
      },
    });
    return formatListing(listing);
  },

  async list(filters: {
    state?: string; city?: string; physicalState?: string; grade?: string;
    minPurity?: number; minQty?: number; maxPriceInr?: number; page: number; pageSize: number;
  }, actor?: AuthenticatedUser) {
    const { skip, take } = paginationToSkipTake({ page: filters.page, pageSize: filters.pageSize });

    const where: Prisma.ListingWhereInput = { status: 'published' };
    if (actor?.role === 'SELLER_ADMIN' || actor?.role === 'SELLER_MEMBER') {
      // Sellers also see their own drafts
      where.OR = [{ status: 'published' }, { organizationId: actor.organizationId }];
      delete where.status;
    }
    if (filters.physicalState) where.physicalState = filters.physicalState as never;
    if (filters.grade) where.grade = { contains: filters.grade, mode: 'insensitive' };
    if (filters.minPurity) where.purityMinimum = { gte: filters.minPurity };
    if (filters.minQty) where.availableQuantityTonnes = { gte: filters.minQty };
    if (filters.maxPriceInr) where.basePricePaisePerTonne = { lte: inrToPaise(filters.maxPriceInr) };

    const [listings, total] = await Promise.all([
      prisma.listing.findMany({
        where, skip, take,
        include: { organization: { select: { displayName: true, state: true, city: true } }, facility: { select: { name: true, facilityType: true, state: true, city: true } } },
        orderBy: { basePricePaisePerTonne: 'asc' },
      }),
      prisma.listing.count({ where }),
    ]);

    return {
      data: listings.map(formatListing),
      meta: { page: filters.page, pageSize: filters.pageSize, total, totalPages: Math.ceil(total / filters.pageSize) },
    };
  },

  async getById(listingId: string) {
    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      include: {
        organization: { select: { displayName: true, state: true, city: true, contactEmail: true } },
        facility: true,
        listingDocuments: { include: { document: { select: { id: true, documentType: true, status: true, fileName: true } } } },
      },
    });
    if (!listing || listing.status === 'archived') throw notFound('Listing', listingId);
    return formatListing(listing);
  },

  async update(listingId: string, input: Partial<CreateListingInput>, actor: AuthenticatedUser) {
    const listing = await prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) throw notFound('Listing', listingId);
    if (listing.organizationId !== actor.organizationId) throw forbidden();
    if (!['draft', 'paused'].includes(listing.status)) {
      throw badRequest('LISTING_NOT_EDITABLE', 'Only draft or paused listings can be edited');
    }

    const before = { ...listing };
    const updated = await prisma.listing.update({
      where: { id: listingId },
      data: {
        ...input,
        basePricePaisePerTonne: input.basePriceInrPerTonne ? inrToPaise(input.basePriceInrPerTonne) : undefined,
      },
    });

    await auditService.log({ actorUserId: actor.userId, actorOrganizationId: actor.organizationId, action: AUDIT_ACTIONS.LISTING_EDITED, entityType: 'Listing', entityId: listingId, beforeJson: before, afterJson: updated });
    return formatListing(updated);
  },

  async publish(listingId: string, actor: AuthenticatedUser) {
    const listing = await prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) throw notFound('Listing', listingId);
    if (listing.organizationId !== actor.organizationId) throw forbidden();
    if (!['draft', 'paused'].includes(listing.status)) throw badRequest('LISTING_NOT_PUBLISHABLE', 'Listing cannot be published from current status');

    const updated = await prisma.listing.update({ where: { id: listingId }, data: { status: 'published' } });
    await auditService.log({ actorUserId: actor.userId, actorOrganizationId: actor.organizationId, action: AUDIT_ACTIONS.LISTING_PUBLISHED, entityType: 'Listing', entityId: listingId, afterJson: { status: 'published' } });
    return formatListing(updated);
  },

  async pause(listingId: string, actor: AuthenticatedUser) {
    const listing = await prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) throw notFound('Listing', listingId);
    if (listing.organizationId !== actor.organizationId) throw forbidden();
    const updated = await prisma.listing.update({ where: { id: listingId }, data: { status: 'paused' } });
    await auditService.log({ actorUserId: actor.userId, actorOrganizationId: actor.organizationId, action: AUDIT_ACTIONS.LISTING_PAUSED, entityType: 'Listing', entityId: listingId, afterJson: { status: 'paused' } });
    return formatListing(updated);
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatListing(l: any) {
  return { ...l, basePriceInrPerTonne: l.basePricePaisePerTonne / 100, basePricePaisePerTonne: undefined };
}
