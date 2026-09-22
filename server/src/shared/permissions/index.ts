import type { MemberRole, OrgType } from '@prisma/client';

// ──────────────────────────────────────────────────────────
// Role hierarchy helpers
// ──────────────────────────────────────────────────────────

export const BUYER_ROLES: MemberRole[] = ['BUYER_ADMIN', 'BUYER_MEMBER'];
export const SELLER_ROLES: MemberRole[] = ['SELLER_ADMIN', 'SELLER_MEMBER'];
export const ADMIN_ROLES: MemberRole[] = ['PLATFORM_ADMIN'];
export const VERIFIER_ROLES: MemberRole[] = ['VERIFIER'];
export const LOGISTICS_ROLES: MemberRole[] = ['LOGISTICS_OPERATOR'];

export function isBuyer(role: MemberRole): boolean {
  return BUYER_ROLES.includes(role);
}

export function isSeller(role: MemberRole): boolean {
  return SELLER_ROLES.includes(role);
}

export function isPlatformAdmin(role: MemberRole): boolean {
  return role === 'PLATFORM_ADMIN';
}

export function isAdminOrVerifier(role: MemberRole): boolean {
  return role === 'PLATFORM_ADMIN' || role === 'VERIFIER';
}

export function canManageOrg(role: MemberRole): boolean {
  return role === 'BUYER_ADMIN' || role === 'SELLER_ADMIN' || role === 'PLATFORM_ADMIN';
}

export function canSubmitBid(role: MemberRole): boolean {
  return SELLER_ROLES.includes(role);
}

export function canAwardBid(role: MemberRole): boolean {
  return role === 'BUYER_ADMIN' || role === 'BUYER_MEMBER';
}

export function canPublishRfq(role: MemberRole): boolean {
  return role === 'BUYER_ADMIN' || role === 'BUYER_MEMBER';
}

export function canVerifyDocument(role: MemberRole): boolean {
  return role === 'VERIFIER' || role === 'PLATFORM_ADMIN';
}

export function canAccessAdmin(role: MemberRole): boolean {
  return role === 'PLATFORM_ADMIN';
}

// ──────────────────────────────────────────────────────────
// Request context typed user
// ──────────────────────────────────────────────────────────

export interface AuthenticatedUser {
  userId: string;
  organizationId: string;
  role: MemberRole;
  orgType: OrgType;
}
