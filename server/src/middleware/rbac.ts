import type { Response, NextFunction } from 'express';
import type { MemberRole } from '@prisma/client';
import type { AuthRequest } from './auth.js';
import { forbidden, unauthorized } from '../shared/errors/AppError.js';

/** Require one of the specified roles */
export function requireRole(...roles: MemberRole[]) {
  return (req: AuthRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) return void next(unauthorized());
    if (!roles.includes(req.user.role)) {
      return void next(forbidden(`Role '${req.user.role}' cannot perform this action`));
    }
    next();
  };
}

/** Require the request's target organizationId matches the authenticated user's org */
export function requireOwnOrg(getOrgId: (req: AuthRequest) => string | undefined) {
  return (req: AuthRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) return void next(unauthorized());
    const targetOrgId = getOrgId(req);
    if (targetOrgId && targetOrgId !== req.user.organizationId) {
      // Platform admins can cross orgs
      if (req.user.role !== 'PLATFORM_ADMIN') {
        return void next(forbidden('Access to another organization\'s data is not permitted'));
      }
    }
    next();
  };
}

/** Require buyer role */
export const requireBuyer = requireRole('BUYER_ADMIN', 'BUYER_MEMBER');

/** Require seller role */
export const requireSeller = requireRole('SELLER_ADMIN', 'SELLER_MEMBER');

/** Require platform admin */
export const requireAdmin = requireRole('PLATFORM_ADMIN');

/** Require verifier or admin */
export const requireVerifier = requireRole('VERIFIER', 'PLATFORM_ADMIN');
