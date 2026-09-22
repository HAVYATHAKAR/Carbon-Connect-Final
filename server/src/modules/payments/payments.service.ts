import { createHmac, timingSafeEqual } from 'node:crypto';
import { prisma } from '../../db/client.js';
import { AppError, ErrorCodes, notFound, forbidden, badRequest } from '../../shared/errors/AppError.js';
import { env } from '../../config/env.js';
import { auditService } from '../audit/audit.service.js';
import { AUDIT_ACTIONS } from '../../config/constants.js';
import { eventBus, EVENTS } from '../../shared/events/index.js';
import type { AuthenticatedUser } from '../../shared/permissions/index.js';

export const paymentsService = {
  async initiatePayment(contractId: string, milestoneId: string, actor: AuthenticatedUser) {
    const contract = await prisma.contract.findUnique({ where: { id: contractId } });
    if (!contract) throw notFound('Contract', contractId);
    if (contract.buyerOrganizationId !== actor.organizationId) throw forbidden('Only the buyer can initiate payments');
    if (contract.status !== 'signed') throw badRequest('CONTRACT_NOT_SIGNED', 'Contract must be fully signed before initiating payment');

    const milestone = await prisma.paymentMilestone.findFirst({ where: { id: milestoneId, contractId } });
    if (!milestone) throw notFound('PaymentMilestone', milestoneId);
    if (milestone.status !== 'pending') {
      throw new AppError(409, ErrorCodes.PAYMENT_ALREADY_INITIATED, `Milestone is already in status '${milestone.status}'`);
    }

    if (env.PAYMENT_PROVIDER === 'demo') {
      // Demo provider — simulate success immediately
      const updated = await prisma.paymentMilestone.update({
        where: { id: milestoneId },
        data: { status: 'initiated', providerReference: `DEMO-${Date.now()}` },
      });
      await auditService.log({ actorUserId: actor.userId, actorOrganizationId: actor.organizationId, action: AUDIT_ACTIONS.PAYMENT_INITIATED, entityType: 'PaymentMilestone', entityId: milestoneId, afterJson: { status: 'initiated', provider: 'demo' } });
      return { milestone: { ...updated, amountInr: Number(updated.amountPaise) / 100 }, paymentUrl: null, isDemoMode: true };
    }

    // Production: create Razorpay order
    throw badRequest('PAYMENT_PROVIDER_NOT_CONFIGURED', 'Configure PAYMENT_PROVIDER=razorpay and credentials to enable live payments');
  },

  async handleWebhook(body: string, signature: string): Promise<void> {
    // Verify signature — never trust frontend payment status
    const expectedSig = createHmac('sha256', env.PAYMENT_WEBHOOK_SECRET).update(body).digest('hex');
    const sigBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expectedSig, 'hex');

    if (sigBuffer.length !== expectedBuffer.length || !timingSafeEqual(sigBuffer, expectedBuffer)) {
      throw new AppError(401, ErrorCodes.WEBHOOK_SIGNATURE_INVALID, 'Webhook signature verification failed');
    }

    const event = JSON.parse(body) as { event: string; payload?: { payment?: { entity?: { id?: string; notes?: { milestoneId?: string } } } } };

    // Idempotency — check if already processed
    const paymentId = event.payload?.payment?.entity?.id;
    if (paymentId) {
      const alreadyProcessed = await prisma.paymentMilestone.findFirst({ where: { providerReference: paymentId } });
      if (alreadyProcessed?.status === 'paid') {
        throw new AppError(200, ErrorCodes.WEBHOOK_ALREADY_PROCESSED, 'Webhook already processed');
      }
    }

    if (event.event === 'payment.captured' && event.payload?.payment?.entity?.notes?.milestoneId) {
      const milestoneId = event.payload.payment.entity.notes.milestoneId;
      await prisma.paymentMilestone.update({
        where: { id: milestoneId },
        data: { status: 'paid', paidAt: new Date(), providerReference: paymentId },
      });
      await auditService.log({ action: AUDIT_ACTIONS.PAYMENT_RECEIVED, entityType: 'PaymentMilestone', entityId: milestoneId, afterJson: { status: 'paid', paymentId } });
      await eventBus.emit(EVENTS.PAYMENT_RECEIVED, { milestoneId, contractId: '', amountPaise: 0 });
    }

    if (event.event === 'payment.failed' && event.payload?.payment?.entity?.notes?.milestoneId) {
      const milestoneId = event.payload.payment.entity.notes.milestoneId;
      await prisma.paymentMilestone.update({ where: { id: milestoneId }, data: { status: 'failed' } });
      await auditService.log({ action: AUDIT_ACTIONS.PAYMENT_FAILED, entityType: 'PaymentMilestone', entityId: milestoneId, afterJson: { status: 'failed', paymentId } });
    }
  },
};
