type EventHandler<T = unknown> = (payload: T) => void | Promise<void>;

class EventBus {
  private handlers = new Map<string, EventHandler[]>();

  on<T>(event: string, handler: EventHandler<T>): void {
    const existing = this.handlers.get(event) ?? [];
    this.handlers.set(event, [...existing, handler as EventHandler]);
  }

  async emit<T>(event: string, payload: T): Promise<void> {
    const handlers = this.handlers.get(event) ?? [];
    await Promise.allSettled(handlers.map((h) => h(payload)));
  }
}

export const eventBus = new EventBus();

// ──────────────────────────────────────────────────────────
// Typed event definitions
// ──────────────────────────────────────────────────────────

export interface RfqPublishedEvent {
  rfqId: string;
  rfqCode: string;
  buyerOrganizationId: string;
  title: string;
}

export interface BidSubmittedEvent {
  bidId: string;
  bidCode: string;
  rfqId: string;
  sellerOrganizationId: string;
  buyerOrganizationId: string;
}

export interface BidAwardedEvent {
  awardId: string;
  bidId: string;
  rfqId: string;
  buyerOrganizationId: string;
  sellerOrganizationId: string;
  declinedBidIds: string[];
}

export interface BidDeclinedEvent {
  bidId: string;
  rfqId: string;
  sellerOrganizationId: string;
}

export interface ContractReadyEvent {
  contractId: string;
  rfqId: string;
  buyerOrganizationId: string;
  sellerOrganizationId: string;
}

export interface PaymentReceivedEvent {
  milestoneId: string;
  contractId: string;
  amountPaise: number;
}

export interface ShipmentDispatchedEvent {
  shipmentId: string;
  contractId: string;
}

export interface DocumentStatusChangedEvent {
  documentId: string;
  status: string;
  organizationId: string;
}

export interface PassportIssuedEvent {
  passportId: string;
  passportCode: string;
  organizationId: string;
}

// Event names
export const EVENTS = {
  RFQ_PUBLISHED: 'rfq.published',
  BID_SUBMITTED: 'bid.submitted',
  BID_AWARDED: 'bid.awarded',
  BID_DECLINED: 'bid.declined',
  BID_SHORTLISTED: 'bid.shortlisted',
  CONTRACT_READY: 'contract.ready',
  PAYMENT_RECEIVED: 'payment.received',
  SHIPMENT_DISPATCHED: 'shipment.dispatched',
  DOCUMENT_STATUS_CHANGED: 'document.status_changed',
  PASSPORT_ISSUED: 'passport.issued',
} as const;
