import { prisma } from '../../db/client.js';
import { notFound, forbidden, badRequest } from '../../shared/errors/AppError.js';
import { generateShipmentCode } from '../../shared/ids/codes.js';
import { auditService } from '../audit/audit.service.js';
import { eventBus, EVENTS } from '../../shared/events/index.js';
import { AUDIT_ACTIONS } from '../../config/constants.js';
import { z } from 'zod';
import type { AuthenticatedUser } from '../../shared/permissions/index.js';
import type { ShipmentStatus } from '@prisma/client';

const STATUS_TRANSITIONS: Record<ShipmentStatus, ShipmentStatus[]> = {
  planned: ['dispatched'],
  dispatched: ['in_transit'],
  in_transit: ['arrived'],
  arrived: ['accepted', 'rejected'],
  accepted: ['delivered'],
  rejected: [],
  delivered: [],
};

export const createShipmentSchema = z.object({
  originFacilityId: z.string().cuid(),
  destinationAddress: z.string().min(5),
  destinationCity: z.string().min(2),
  destinationState: z.string().min(2),
  carrierName: z.string().optional(),
  vehicleOrContainerReference: z.string().optional(),
  deliveryMode: z.string().optional(),
  plannedDispatchAt: z.coerce.date().optional(),
  estimatedArrivalAt: z.coerce.date().optional(),
});

export const shipmentEventSchema = z.object({
  eventType: z.string().min(2).max(100),
  eventTime: z.coerce.date(),
  location: z.string().optional(),
  notes: z.string().max(1000).optional(),
});

export const logisticsService = {
  async createShipment(contractId: string, input: z.infer<typeof createShipmentSchema>, actor: AuthenticatedUser) {
    const contract = await prisma.contract.findUnique({ where: { id: contractId } });
    if (!contract) throw notFound('Contract', contractId);

    const isParty = contract.buyerOrganizationId === actor.organizationId || contract.sellerOrganizationId === actor.organizationId;
    if (!isParty && actor.role !== 'PLATFORM_ADMIN') throw forbidden();
    if (!['signed', 'completed'].includes(contract.status)) {
      throw badRequest('CONTRACT_NOT_SIGNED', 'Shipment can only be created for signed contracts');
    }

    const facility = await prisma.facility.findUnique({ where: { id: input.originFacilityId } });
    if (!facility) throw notFound('Facility', input.originFacilityId);
    if (facility.organizationId !== contract.sellerOrganizationId && actor.role !== 'PLATFORM_ADMIN') {
      throw forbidden('Origin facility must belong to the seller organization');
    }

    const shipmentCode = generateShipmentCode();
    const shipment = await prisma.shipment.create({
      data: { shipmentCode, contractId, originFacilityId: input.originFacilityId, destinationAddress: input.destinationAddress, destinationCity: input.destinationCity, destinationState: input.destinationState, carrierName: input.carrierName, vehicleOrContainerReference: input.vehicleOrContainerReference, deliveryMode: input.deliveryMode, plannedDispatchAt: input.plannedDispatchAt, estimatedArrivalAt: input.estimatedArrivalAt },
    });
    await auditService.log({ actorUserId: actor.userId, actorOrganizationId: actor.organizationId, action: AUDIT_ACTIONS.SHIPMENT_CREATED, entityType: 'Shipment', entityId: shipment.id, afterJson: { shipmentCode } });
    return shipment;
  },

  async getShipment(shipmentId: string, actor: AuthenticatedUser) {
    const shipment = await prisma.shipment.findUnique({ where: { id: shipmentId }, include: { events: { orderBy: { eventTime: 'asc' } }, contract: { select: { buyerOrganizationId: true, sellerOrganizationId: true } } } });
    if (!shipment) throw notFound('Shipment', shipmentId);
    const isParty = shipment.contract.buyerOrganizationId === actor.organizationId || shipment.contract.sellerOrganizationId === actor.organizationId;
    if (!isParty && actor.role !== 'PLATFORM_ADMIN') throw forbidden();
    return shipment;
  },

  async addEvent(shipmentId: string, input: z.infer<typeof shipmentEventSchema>, actor: AuthenticatedUser) {
    const shipment = await prisma.shipment.findUnique({ where: { id: shipmentId }, include: { contract: { select: { buyerOrganizationId: true, sellerOrganizationId: true } } } });
    if (!shipment) throw notFound('Shipment', shipmentId);
    const isParty = shipment.contract.buyerOrganizationId === actor.organizationId || shipment.contract.sellerOrganizationId === actor.organizationId;
    if (!isParty && actor.role !== 'PLATFORM_ADMIN') throw forbidden();

    // Append-only — never modify existing events
    const event = await prisma.shipmentEvent.create({ data: { shipmentId, eventType: input.eventType, eventTime: input.eventTime, location: input.location, notes: input.notes, createdBy: actor.userId } });
    await auditService.log({ actorUserId: actor.userId, actorOrganizationId: actor.organizationId, action: AUDIT_ACTIONS.SHIPMENT_EVENT_ADDED, entityType: 'ShipmentEvent', entityId: event.id, afterJson: { eventType: input.eventType } });
    return event;
  },

  async updateStatus(shipmentId: string, newStatus: ShipmentStatus, actor: AuthenticatedUser) {
    const shipment = await prisma.shipment.findUnique({ where: { id: shipmentId }, include: { contract: { select: { buyerOrganizationId: true, sellerOrganizationId: true } } } });
    if (!shipment) throw notFound('Shipment', shipmentId);
    const isParty = shipment.contract.buyerOrganizationId === actor.organizationId || shipment.contract.sellerOrganizationId === actor.organizationId;
    if (!isParty && actor.role !== 'PLATFORM_ADMIN') throw forbidden();

    const allowed = STATUS_TRANSITIONS[shipment.status] ?? [];
    if (!allowed.includes(newStatus)) {
      throw badRequest('INVALID_STATUS_TRANSITION', `Cannot transition shipment from '${shipment.status}' to '${newStatus}'`);
    }

    const updated = await prisma.shipment.update({ where: { id: shipmentId }, data: { status: newStatus, actualArrivalAt: newStatus === 'arrived' ? new Date() : undefined } });

    if (newStatus === 'dispatched') {
      await eventBus.emit(EVENTS.SHIPMENT_DISPATCHED, { shipmentId, contractId: shipment.contractId });
    }
    return updated;
  },
};
