export const APP_VERSION = '1.0.0';

export const CODE_PREFIXES = {
  RFQ: 'CC-RFQ',
  BID: 'CC-BID',
  LISTING: 'CC-L',
  CONTRACT: 'CC-CON',
  SHIPMENT: 'CC-SHP',
  PASSPORT: 'CC-PAS',
  BATCH: 'CC-BAT',
} as const;

export const PHYSICAL_CO2_DISCLAIMER =
  'This record relates to a physical CO₂ transaction. It does not constitute a carbon credit, ' +
  'carbon offset, CCTS certificate, proof of permanent storage, or government registration. ' +
  'Carbon-Connect is a marketplace for physical CO₂ molecules only.';

export const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/csv',
]);

export const ALLOWED_DOCUMENT_TYPES = [
  'certificate_of_analysis',
  'facility_registration',
  'quality_report',
  'chain_of_custody',
  'delivery_note',
  'gas_analysis_report',
  'environmental_documentation',
  'food_grade_documentation',
  'contract',
  'payment_receipt',
  'mrv_source_record',
  'ccts_context_record',
  'other',
] as const;

export const PRESIGNED_URL_EXPIRY_SECONDS = 900; // 15 minutes
export const DOWNLOAD_URL_EXPIRY_SECONDS = 300;  // 5 minutes

export const NOTIFICATION_TYPES = {
  RFQ_PUBLISHED: 'rfq_published',
  RFQ_MATCHED: 'rfq_matched',
  BID_SUBMITTED: 'bid_submitted',
  BID_SHORTLISTED: 'bid_shortlisted',
  BID_AWARDED: 'bid_awarded',
  BID_DECLINED: 'bid_declined',
  CLARIFICATION_RECEIVED: 'clarification_received',
  CONTRACT_READY: 'contract_ready',
  PAYMENT_MILESTONE_DUE: 'payment_milestone_due',
  PAYMENT_RECEIVED: 'payment_received',
  SHIPMENT_DISPATCHED: 'shipment_dispatched',
  SHIPMENT_DELAYED: 'shipment_delayed',
  QUALITY_REVIEW_REQUESTED: 'quality_review_requested',
  DOCUMENT_VERIFIED: 'document_verified',
  DOCUMENT_REJECTED: 'document_rejected',
  PASSPORT_ISSUED: 'passport_issued',
} as const;

export const AUDIT_ACTIONS = {
  USER_LOGIN: 'USER_LOGIN',
  USER_LOGOUT: 'USER_LOGOUT',
  USER_REGISTERED: 'USER_REGISTERED',
  USER_PASSWORD_RESET: 'USER_PASSWORD_RESET',
  ORG_STATUS_CHANGED: 'ORG_STATUS_CHANGED',
  LISTING_PUBLISHED: 'LISTING_PUBLISHED',
  LISTING_EDITED: 'LISTING_EDITED',
  LISTING_PAUSED: 'LISTING_PAUSED',
  RFQ_PUBLISHED: 'RFQ_PUBLISHED',
  RFQ_EDITED: 'RFQ_EDITED',
  RFQ_CANCELLED: 'RFQ_CANCELLED',
  RFQ_CLOSED: 'RFQ_CLOSED',
  BID_SUBMITTED: 'BID_SUBMITTED',
  BID_REVISED: 'BID_REVISED',
  BID_WITHDRAWN: 'BID_WITHDRAWN',
  BID_SHORTLISTED: 'BID_SHORTLISTED',
  BID_AWARDED: 'BID_AWARDED',
  BID_DECLINED: 'BID_DECLINED',
  CONTRACT_SIGNED: 'CONTRACT_SIGNED',
  CONTRACT_CANCELLED: 'CONTRACT_CANCELLED',
  PAYMENT_INITIATED: 'PAYMENT_INITIATED',
  PAYMENT_RECEIVED: 'PAYMENT_RECEIVED',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  SHIPMENT_CREATED: 'SHIPMENT_CREATED',
  SHIPMENT_EVENT_ADDED: 'SHIPMENT_EVENT_ADDED',
  DOCUMENT_UPLOADED: 'DOCUMENT_UPLOADED',
  DOCUMENT_STATUS_CHANGED: 'DOCUMENT_STATUS_CHANGED',
  QUALITY_STATUS_CHANGED: 'QUALITY_STATUS_CHANGED',
  PASSPORT_ISSUED: 'PASSPORT_ISSUED',
  PASSPORT_REVOKED: 'PASSPORT_REVOKED',
  ADMIN_ACTION: 'ADMIN_ACTION',
} as const;
