import { Router } from 'express';
import { authService } from './auth.service.js';
import { authenticate } from '../../middleware/auth.js';
import type { AuthRequest } from '../../middleware/auth.js';
import { ok } from '../../middleware/errorHandler.js';
import {
  registerSchema, loginSchema, refreshSchema,
  forgotPasswordSchema, resetPasswordSchema, verifyEmailSchema,
} from './auth.schema.js';

export const authRouter = Router();

// POST /api/v1/auth/register
authRouter.post('/register', async (req, res) => {
  const input = registerSchema.parse(req.body);
  const result = await authService.register(input, req.ip);
  ok(res, result, 201);
});

// POST /api/v1/auth/login
authRouter.post('/login', async (req, res) => {
  const input = loginSchema.parse(req.body);
  const result = await authService.login(input, req.ip);
  ok(res, result);
});

// POST /api/v1/auth/refresh
authRouter.post('/refresh', async (req, res) => {
  const { refreshToken } = refreshSchema.parse(req.body);
  const tokens = await authService.refresh(refreshToken);
  ok(res, { tokens });
});

// POST /api/v1/auth/logout
authRouter.post('/logout', authenticate, async (_req, res) => {
  // Token is short-lived; in production add to Redis deny-list here
  ok(res, { message: 'Logged out successfully' });
});

// POST /api/v1/auth/forgot-password
authRouter.post('/forgot-password', async (req, res) => {
  const { email } = forgotPasswordSchema.parse(req.body);
  await authService.forgotPassword(email);
  // Always return 200 — don't reveal whether email exists
  ok(res, { message: 'If that email address exists, a reset link has been sent.' });
});

// POST /api/v1/auth/reset-password
authRouter.post('/reset-password', async (req, res) => {
  const { token, password } = resetPasswordSchema.parse(req.body);
  await authService.resetPassword(token, password, req.ip);
  ok(res, { message: 'Password reset successfully. Please log in.' });
});

// POST /api/v1/auth/verify-email
authRouter.post('/verify-email', async (req, res) => {
  const { token } = verifyEmailSchema.parse(req.body);
  await authService.verifyEmail(token);
  ok(res, { message: 'Email verified successfully. You may now log in.' });
});

// GET /api/v1/auth/me
authRouter.get('/me', authenticate, async (req: AuthRequest, res) => {
  ok(res, { user: req.user });
});
