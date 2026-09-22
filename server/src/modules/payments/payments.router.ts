import { Router } from 'express';
import { ok } from '../../middleware/errorHandler.js';
import { paymentsService } from './payments.service.js';

export const paymentsRouter = Router();

// POST /api/v1/payments/webhooks/provider
// Raw body needed for HMAC verification
paymentsRouter.post('/webhooks/provider', async (req, res) => {
  const signature = req.headers['x-razorpay-signature'] as string ?? req.headers['x-webhook-signature'] as string ?? '';
  const rawBody = JSON.stringify(req.body);
  await paymentsService.handleWebhook(rawBody, signature);
  ok(res, { received: true });
});
