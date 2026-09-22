import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { prisma } from '../db/client.js';
import { unauthorized } from '../shared/errors/AppError.js';
import type { AuthenticatedUser } from '../shared/permissions/index.js';
import type { MemberRole, OrgType } from '@prisma/client';

export interface AuthRequest extends Request {
  user?: AuthenticatedUser;
}

export async function authenticate(
  req: AuthRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw unauthorized();
    }

    const token = authHeader.slice(7);
    let payload: { sub: string; orgId: string; role: string; type: string };
    try {
      payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as typeof payload;
    } catch {
      throw unauthorized('Invalid or expired access token');
    }

    if (payload.type !== 'access') {
      throw unauthorized('Invalid token type');
    }

    // Verify user is still active
    const membership = await prisma.organizationMembership.findFirst({
      where: {
        userId: payload.sub,
        organizationId: payload.orgId,
        status: 'active',
      },
      include: {
        user: { select: { status: true } },
        organization: { select: { status: true, organizationType: true } },
      },
    });

    if (!membership) throw unauthorized('Session no longer valid');
    if (membership.user.status !== 'active') throw unauthorized('Account suspended');
    if (membership.organization.status === 'suspended') throw unauthorized('Organization suspended');

    req.user = {
      userId: payload.sub,
      organizationId: payload.orgId,
      role: membership.role as MemberRole,
      orgType: membership.organization.organizationType as OrgType,
    };

    next();
  } catch (err) {
    next(err);
  }
}

/** Optional auth — does not throw if no token present */
export async function optionalAuthenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return next();
  return authenticate(req, res, next);
}
