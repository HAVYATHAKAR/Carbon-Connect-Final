import { customAlphabet } from 'nanoid';
import { CODE_PREFIXES } from '../../config/constants.js';

// Numeric-only ID for human-readable codes
const numericId = customAlphabet('0123456789', 4);

function pad(n: string, len = 4): string {
  return n.padStart(len, '0');
}

function fourDigit(): string {
  return pad(String(Math.floor(1000 + Math.random() * 9000)));
}

export function generateRfqCode(): string {
  return `${CODE_PREFIXES.RFQ}-${fourDigit()}`;
}

export function generateBidCode(): string {
  return `${CODE_PREFIXES.BID}-${fourDigit()}`;
}

export function generateListingCode(): string {
  return `${CODE_PREFIXES.LISTING}-${fourDigit()}`;
}

export function generateContractCode(): string {
  return `${CODE_PREFIXES.CONTRACT}-${fourDigit()}`;
}

export function generateShipmentCode(): string {
  return `${CODE_PREFIXES.SHIPMENT}-${fourDigit()}`;
}

export function generatePassportCode(): string {
  return `${CODE_PREFIXES.PASSPORT}-${fourDigit()}`;
}

export function generateBatchCode(): string {
  const year = new Date().getFullYear().toString().slice(-2);
  const month = String(new Date().getMonth() + 1).padStart(2, '0');
  return `${CODE_PREFIXES.BATCH}-${year}${month}-${numericId()}`;
}
