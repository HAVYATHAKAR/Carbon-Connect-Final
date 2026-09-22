import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';
import { prisma } from '../../db/client.js';
import { env } from '../../config/env.js';
import { AppError, ErrorCodes, conflict, badRequest, unauthorized } from '../../shared/errors/AppError.js';
import { auditService } from '../audit/audit.service.js';
import { AUDIT_ACTIONS } from '../../config/constants.js';
import type { RegisterInput, LoginInput } from './auth.schema.js';
import type { MemberRole } from '@prisma/client';

interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

interface AuthResult {
  user: { id: string; email: string; firstName: string; lastName: string };
  organization: { id: string; legalName: string; displayName: string; organizationType: string };
  membership: { role: string };
  tokens: TokenPair;
}

export const authService = {
  async register(input: RegisterInput, ipAddress?: string): Promise<AuthResult> {
    // Check for existing email
    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      throw conflict(ErrorCodes.DUPLICATE_EMAIL, 'An account with this email already exists');
    }

    const passwordHash = await argon2.hash(input.password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    const emailVerifyToken = randomBytes(32).toString('hex');
    const emailVerifyExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: input.email,
          passwordHash,
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone,
          emailVerifyToken,
          emailVerifyExpiry,
          status: env.DEMO_MODE ? 'active' : 'pending', // auto-activate in demo
          emailVerifiedAt: env.DEMO_MODE ? new Date() : null,
        },
      });

      const org = await tx.organization.create({
        data: {
          legalName: input.organizationLegalName,
          displayName: input.organizationDisplayName,
          organizationType: input.organizationType,
          gstin: input.gstin,
          cin: input.cin,
          registeredAddress: input.registeredAddress,
          state: input.state,
          city: input.city,
          contactEmail: input.contactEmail,
          contactPhone: input.contactPhone,
          status: env.DEMO_MODE ? 'active' : 'pending',
        },
      });

      const membership = await tx.organizationMembership.create({
        data: {
          userId: user.id,
          organizationId: org.id,
          role: input.role as MemberRole,
          status: 'active',
          joinedAt: new Date(),
        },
      });

      return { user, org, membership };
    });

    await auditService.log({
      actorUserId: result.user.id,
      actorOrganizationId: result.org.id,
      action: AUDIT_ACTIONS.USER_REGISTERED,
      entityType: 'User',
      entityId: result.user.id,
      afterJson: { email: result.user.email, orgType: input.organizationType },
      ipAddress,
    });

    const tokens = generateTokenPair(result.user.id, result.org.id, result.membership.role);

    return {
      user: { id: result.user.id, email: result.user.email, firstName: result.user.firstName, lastName: result.user.lastName },
      organization: { id: result.org.id, legalName: result.org.legalName, displayName: result.org.displayName, organizationType: result.org.organizationType },
      membership: { role: result.membership.role },
      tokens,
    };
  },

  async login(input: LoginInput, ipAddress?: string): Promise<AuthResult> {
    const user = await prisma.user.findUnique({ where: { email: input.email } });

    if (!user) {
      // Constant-time to prevent user enumeration
      await argon2.hash('dummy-password-to-prevent-timing-attacks');
      throw new AppError(401, ErrorCodes.INVALID_CREDENTIALS, 'Invalid email or password');
    }

    // Check lockout
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      throw new AppError(401, ErrorCodes.ACCOUNT_LOCKED, `Account locked. Try again in ${minutes} minute(s).`);
    }

    const valid = await argon2.verify(user.passwordHash, input.password);
    if (!valid) {
      const attempts = user.loginAttempts + 1;
      const lockedUntil =
        attempts >= env.MAX_LOGIN_ATTEMPTS
          ? new Date(Date.now() + env.LOCKOUT_DURATION_MINUTES * 60 * 1000)
          : null;

      await prisma.user.update({
        where: { id: user.id },
        data: { loginAttempts: attempts, lockedUntil },
      });

      throw new AppError(401, ErrorCodes.INVALID_CREDENTIALS, 'Invalid email or password');
    }

    if (user.status === 'suspended') {
      throw new AppError(403, ErrorCodes.ACCOUNT_SUSPENDED, 'Your account has been suspended.');
    }

    if (user.status === 'pending' && !env.DEMO_MODE) {
      throw new AppError(403, ErrorCodes.EMAIL_NOT_VERIFIED, 'Please verify your email address.');
    }

    // Get active membership
    const membership = await prisma.organizationMembership.findFirst({
      where: { userId: user.id, status: 'active' },
      include: { organization: true },
    });

    if (!membership) {
      throw new AppError(403, ErrorCodes.FORBIDDEN, 'No active organization membership found.');
    }

    // Reset attempts on success
    await prisma.user.update({
      where: { id: user.id },
      data: { loginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    await auditService.log({
      actorUserId: user.id,
      actorOrganizationId: membership.organizationId,
      action: AUDIT_ACTIONS.USER_LOGIN,
      entityType: 'User',
      entityId: user.id,
      ipAddress,
    });

    const tokens = generateTokenPair(user.id, membership.organizationId, membership.role);

    return {
      user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName },
      organization: { id: membership.organization.id, legalName: membership.organization.legalName, displayName: membership.organization.displayName, organizationType: membership.organization.organizationType },
      membership: { role: membership.role },
      tokens,
    };
  },

  async refresh(refreshToken: string): Promise<TokenPair> {
    let payload: { sub: string; orgId: string; role: string; type: string; jti: string };
    try {
      payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as typeof payload;
    } catch {
      throw unauthorized('Invalid or expired refresh token');
    }

    if (payload.type !== 'refresh') throw unauthorized('Invalid token type');

    // Verify membership still active
    const membership = await prisma.organizationMembership.findFirst({
      where: { userId: payload.sub, organizationId: payload.orgId, status: 'active' },
    });
    if (!membership) throw unauthorized('Session revoked');

    return generateTokenPair(payload.sub, payload.orgId, membership.role);
  },

  async forgotPassword(email: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return; // Silent — don't reveal whether email exists

    const token = randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1h

    await prisma.user.update({
      where: { id: user.id },
      data: { resetToken: token, resetTokenExpiry: expiry },
    });

    // Email sending is handled by email service (console in dev)
    const { emailService } = await import('../notifications/email.service.js');
    await emailService.sendPasswordReset(email, token, user.firstName);
  },

  async resetPassword(token: string, newPassword: string, ipAddress?: string): Promise<void> {
    const user = await prisma.user.findFirst({
      where: {
        resetToken: token,
        resetTokenExpiry: { gt: new Date() },
        status: { not: 'deleted' },
      },
    });

    if (!user) {
      throw badRequest(ErrorCodes.TOKEN_INVALID, 'Reset token is invalid or has expired');
    }

    const passwordHash = await argon2.hash(newPassword, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, resetToken: null, resetTokenExpiry: null, loginAttempts: 0, lockedUntil: null },
    });

    await auditService.log({
      actorUserId: user.id,
      action: AUDIT_ACTIONS.USER_PASSWORD_RESET,
      entityType: 'User',
      entityId: user.id,
      ipAddress,
    });
  },

  async verifyEmail(token: string): Promise<void> {
    const user = await prisma.user.findFirst({
      where: {
        emailVerifyToken: token,
        emailVerifyExpiry: { gt: new Date() },
      },
    });

    if (!user) {
      throw badRequest(ErrorCodes.TOKEN_INVALID, 'Email verification token is invalid or expired');
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerifiedAt: new Date(),
        emailVerifyToken: null,
        emailVerifyExpiry: null,
        status: 'active',
      },
    });
  },
};

function generateTokenPair(userId: string, orgId: string, role: string): TokenPair {
  const jti = randomBytes(16).toString('hex');

  const accessToken = jwt.sign(
    { sub: userId, orgId, role, type: 'access' },
    env.JWT_ACCESS_SECRET,
    { expiresIn: env.JWT_ACCESS_EXPIRES_IN } as jwt.SignOptions,
  );

  const refreshToken = jwt.sign(
    { sub: userId, orgId, role, type: 'refresh', jti },
    env.JWT_REFRESH_SECRET,
    { expiresIn: env.JWT_REFRESH_EXPIRES_IN } as jwt.SignOptions,
  );

  return { accessToken, refreshToken, expiresIn: 900 }; // 15 min
}
