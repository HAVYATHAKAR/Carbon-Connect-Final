import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import type { AuthRequest } from '../../middleware/auth.js';
import { ok } from '../../middleware/errorHandler.js';
import { contractsService } from './contracts.service.js';
import { paymentsService } from '../payments/payments.service.js';

export const contractsRouter = Router();
contractsRouter.use(authenticate);

contractsRouter.get('/:contractId', async (req: AuthRequest, res) => {
  const result = await contractsService.getById(req.params.contractId, req.user!);
  ok(res, result);
});

contractsRouter.post('/:contractId/sign', async (req: AuthRequest, res) => {
  const result = await contractsService.sign(req.params.contractId, req.user!);
  ok(res, result);
});

contractsRouter.post('/:contractId/cancel', async (req: AuthRequest, res) => {
  const result = await contractsService.cancel(req.params.contractId, req.user!);
  ok(res, result);
});

contractsRouter.get('/:contractId/payment-milestones', async (req: AuthRequest, res) => {
  const result = await contractsService.getPaymentMilestones(req.params.contractId, req.user!);
  ok(res, result);
});

contractsRouter.post('/:contractId/payments/:milestoneId/initiate', async (req: AuthRequest, res) => {
  const result = await paymentsService.initiatePayment(req.params.contractId, req.params.milestoneId, req.user!);
  ok(res, result);
});
