import { eventBus, EVENTS } from '../../shared/events/index.js';
import { notificationService } from './notification.service.js';
import { NOTIFICATION_TYPES } from '../../config/constants.js';
import { prisma } from '../../db/client.js';

export function setupNotificationHandlers(): void {
  // ── RFQ Published → notify matched sellers ─────────────────────────────
  eventBus.on(EVENTS.RFQ_PUBLISHED, async (payload: { rfqId: string; rfqCode: string; title: string; buyerOrganizationId: string }) => {
    // Find sellers with active published listings
    const sellers = await prisma.organization.findMany({
      where: {
        status: 'active',
        organizationType: { in: ['seller', 'buyer_seller'] },
        id: { not: payload.buyerOrganizationId },
      },
      select: { id: true },
    });

    for (const seller of sellers) {
      await notificationService.createForOrg({
        organizationId: seller.id,
        type: NOTIFICATION_TYPES.RFQ_MATCHED,
        title: 'New RFQ matching your listings',
        body: `Buyer posted: "${payload.title}" (${payload.rfqCode}). Review and submit a bid.`,
        link: `/rfqs/${payload.rfqId}`,
      });
    }
  });

  // ── Bid Submitted → notify buyer ───────────────────────────────────────
  eventBus.on(EVENTS.BID_SUBMITTED, async (payload: { bidId: string; bidCode: string; rfqId: string; buyerOrganizationId: string; sellerOrganizationId: string }) => {
    await notificationService.createForOrg({
      organizationId: payload.buyerOrganizationId,
      type: NOTIFICATION_TYPES.BID_SUBMITTED,
      title: 'New bid received',
      body: `A supplier submitted bid ${payload.bidCode} on your RFQ. Review and compare bids.`,
      link: `/rfqs/${payload.rfqId}/bids`,
    });
  });

  // ── Bid Awarded → notify winner and losers ─────────────────────────────
  eventBus.on(EVENTS.BID_AWARDED, async (payload: { awardId: string; bidId: string; rfqId: string; buyerOrganizationId: string; sellerOrganizationId: string; declinedBidIds: string[] }) => {
    // Winner notification
    await notificationService.createForOrg({
      organizationId: payload.sellerOrganizationId,
      type: NOTIFICATION_TYPES.BID_AWARDED,
      title: '🎉 Your bid has been awarded!',
      body: 'Congratulations! The buyer has selected your bid. Please review and sign the contract.',
      link: `/rfqs/${payload.rfqId}`,
    });

    // Loser notifications
    for (const declinedBidId of payload.declinedBidIds) {
      const declinedBid = await prisma.bid.findUnique({ where: { id: declinedBidId }, select: { sellerOrganizationId: true } });
      if (declinedBid) {
        await notificationService.createForOrg({
          organizationId: declinedBid.sellerOrganizationId,
          type: NOTIFICATION_TYPES.BID_DECLINED,
          title: 'Bid not selected',
          body: 'The buyer has selected another supplier for this requirement. Other RFQs are available.',
          link: '/rfqs',
        });
      }
    }
  });

  // ── Contract Ready → notify both parties ──────────────────────────────
  eventBus.on(EVENTS.CONTRACT_READY, async (payload: { contractId: string; rfqId: string; buyerOrganizationId: string; sellerOrganizationId: string }) => {
    for (const orgId of [payload.buyerOrganizationId, payload.sellerOrganizationId]) {
      await notificationService.createForOrg({
        organizationId: orgId,
        type: NOTIFICATION_TYPES.CONTRACT_READY,
        title: 'Contract ready for signature',
        body: 'A new contract has been created and is awaiting your review and signature.',
        link: `/contracts/${payload.contractId}`,
      });
    }
  });

  // ── Document Status Changed ────────────────────────────────────────────
  eventBus.on(EVENTS.DOCUMENT_STATUS_CHANGED, async (payload: { documentId: string; status: string; organizationId: string }) => {
    const type = payload.status === 'verified'
      ? NOTIFICATION_TYPES.DOCUMENT_VERIFIED
      : NOTIFICATION_TYPES.DOCUMENT_REJECTED;
    await notificationService.createForOrg({
      organizationId: payload.organizationId,
      type,
      title: `Document ${payload.status}`,
      body: `A document has been ${payload.status} by the platform.`,
      link: `/documents/${payload.documentId}`,
    });
  });
}
