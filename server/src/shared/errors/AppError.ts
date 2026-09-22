export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;
  public readonly isOperational: boolean;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: unknown,
    isOperational = true,
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

// ──────────────────────────────────────────────────────────
// Stable error codes
// ──────────────────────────────────────────────────────────

export const ErrorCodes = {
  // Auth
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  ACCOUNT_SUSPENDED: 'ACCOUNT_SUSPENDED',
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  REFRESH_TOKEN_REUSED: 'REFRESH_TOKEN_REUSED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',

  // Validation
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  DUPLICATE_EMAIL: 'DUPLICATE_EMAIL',
  DUPLICATE_BID: 'DUPLICATE_BID',
  DUPLICATE_AWARD: 'DUPLICATE_AWARD',

  // Resources
  NOT_FOUND: 'NOT_FOUND',
  ORG_NOT_FOUND: 'ORG_NOT_FOUND',
  RFQ_NOT_FOUND: 'RFQ_NOT_FOUND',
  BID_NOT_FOUND: 'BID_NOT_FOUND',
  CONTRACT_NOT_FOUND: 'CONTRACT_NOT_FOUND',
  LISTING_NOT_FOUND: 'LISTING_NOT_FOUND',

  // RFQ workflow
  RFQ_NOT_OPEN: 'RFQ_NOT_OPEN',
  RFQ_ALREADY_AWARDED: 'RFQ_ALREADY_AWARDED',
  RFQ_DEADLINE_PASSED: 'RFQ_DEADLINE_PASSED',
  RFQ_WRONG_OWNER: 'RFQ_WRONG_OWNER',

  // Bid workflow
  BID_NOT_ACTIVE: 'BID_NOT_ACTIVE',
  BID_WRONG_RFQ: 'BID_WRONG_RFQ',
  BID_INVALID_QUANTITY: 'BID_INVALID_QUANTITY',
  BID_INVALID_PRICE: 'BID_INVALID_PRICE',
  BID_EVIDENCE_NOT_REVIEWED: 'BID_EVIDENCE_NOT_REVIEWED',
  BID_CO2_NOT_CONFIRMED: 'BID_CO2_NOT_CONFIRMED',
  BID_ALREADY_WITHDRAWN: 'BID_ALREADY_WITHDRAWN',

  // Contract / Payment
  CONTRACT_NOT_SIGNED: 'CONTRACT_NOT_SIGNED',
  PAYMENT_ALREADY_INITIATED: 'PAYMENT_ALREADY_INITIATED',
  WEBHOOK_SIGNATURE_INVALID: 'WEBHOOK_SIGNATURE_INVALID',
  WEBHOOK_ALREADY_PROCESSED: 'WEBHOOK_ALREADY_PROCESSED',

  // Documents
  UPLOAD_TYPE_REJECTED: 'UPLOAD_TYPE_REJECTED',
  UPLOAD_TOO_LARGE: 'UPLOAD_TOO_LARGE',
  DOCUMENT_NOT_ACCESSIBLE: 'DOCUMENT_NOT_ACCESSIBLE',

  // Generic
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

// Helper factories
export const notFound = (entity: string, id?: string) =>
  new AppError(404, ErrorCodes.NOT_FOUND, `${entity}${id ? ` '${id}'` : ''} not found`);

export const forbidden = (msg = 'Access denied') =>
  new AppError(403, ErrorCodes.FORBIDDEN, msg);

export const unauthorized = (msg = 'Authentication required') =>
  new AppError(401, ErrorCodes.UNAUTHORIZED, msg);

export const conflict = (code: string, msg: string, details?: unknown) =>
  new AppError(409, code, msg, details);

export const badRequest = (code: string, msg: string, details?: unknown) =>
  new AppError(400, code, msg, details);
