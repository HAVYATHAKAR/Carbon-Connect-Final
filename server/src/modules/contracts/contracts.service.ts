import { prisma } from '../../db/client.js';
import { notFound, forbidden, badRequest } from '../../shared/errors/AppError.js';
import { auditService } from '../audit/audit.service.js';
import { AUDIT_ACTIONS } from '../../config/constants.js';
import type { AuthenticatedUser } from '../../shared/permissions/index.js';

export const contractsService = {
  async getById(contractId: string, actor: AuthenticatedUser) {
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      include: { paymentMilestones: true },
    });
    if (!contract) throw notFound('Contract', contractId);

    const isBuyer = contract.buyerOrganizationId === actor.organizationId;
    const isSeller = contract.sellerOrganizationId === actor.organizationId;
    if (!isBuyer && !isSeller && actor.role !== 'PLATFORM_ADMIN') throw forbidden();

    return contract;
  },

  async sign(contractId: string, actor: AuthenticatedUser) {
    const contract = await prisma.contract.findUnique({ where: { id: contractId } });
    if (!contract) throw notFound('Contract', contractId);

    const isBuyer = contract.buyerOrganizationId === actor.organizationId;
    const isSeller = contract.sellerOrganizationId === actor.organizationId;
    if (!isBuyer && !isSeller) throw forbidden();

    if (['signed', 'completed', 'cancelled'].includes(contract.status)) {
      throw badRequest('CONTRACT_ALREADY_SIGNED', `Contract status '${contract.status}' cannot be signed`);
    }

    const updateData: Record<string, unknown> = {};
    if (isBuyer && !contract.buyerSignedAt) updateData['buyerSignedAt'] = new Date();
    if (isSeller && !contract.sellerSignedAt) updateData['sellerSignedAt'] = new Date();

    const buyerSigned = contract.buyerSignedAt ?? (isBuyer ? new Date() : null);
    const sellerSigned = contract.sellerSignedAt ?? (isSeller ? new Date() : null);
    const bothSigned = Boolean(buyerSigned && sellerSigned);

    updateData['status'] = bothSigned ? 'signed' : contract.buyerSignedAt || contract.sellerSignedAt ? 'partially_signed' : 'pending_signatures';

    const updated = await prisma.contract.update({ where: { id: contractId }, data: updateData as never });

    // Create payment milestones once fully signed
    if (bothSigned && !contract.buyerSignedAt) {
      const totalPaise = (contract.termsJson as { totalEstimatedValueInr?: number })?.totalEstimatedValueInr
        ? BigInt(Math.round(((contract.termsJson as { totalEstimatedValueInr: number }).totalEstimatedValueInr) * 100))
        : BigInt(0);

      await prisma.paymentMilestone.createMany({
        data: [
          { contractId, milestoneType: 'deposit', amountPaise: (totalPaise * BigInt(30)) / BigInt(100), dueAt: new Date() },
          { contractId, milestoneType: 'dispatch', amountPaise: (totalPaise * BigInt(40)) / BigInt(100), dueAt: new Date(Date.now() + 7 * 86400000) },
          { contractId, milestoneType: 'acceptance', amountPaise: (totalPaise * BigInt(30)) / BigInt(100), dueAt: new Date(Date.now() + 21 * 86400000) },
        ],
      });
    }

    await auditService.log({ actorUserId: actor.userId, actorOrganizationId: actor.organizationId, action: AUDIT_ACTIONS.CONTRACT_SIGNED, entityType: 'Contract', entityId: contractId, afterJson: updateData });
    return updated;
  },

  async cancel(contractId: string, actor: AuthenticatedUser) {
    const contract = await prisma.contract.findUnique({ where: { id: contractId } });
    if (!contract) throw notFound('Contract', contractId);

    const isBuyer = contract.buyerOrganizationId === actor.organizationId;
    if (!isBuyer && actor.role !== 'PLATFORM_ADMIN') throw forbidden();
    if (['signed', 'completed'].includes(contract.status)) throw badRequest('CONTRACT_NOT_CANCELLABLE', 'Signed or completed contracts cannot be cancelled without admin review');

    const updated = await prisma.contract.update({ where: { id: contractId }, data: { status: 'cancelled' } });
    await auditService.log({ actorUserId: actor.userId, actorOrganizationId: actor.organizationId, action: AUDIT_ACTIONS.CONTRACT_CANCELLED, entityType: 'Contract', entityId: contractId, afterJson: { status: 'cancelled' } });
    return updated;
  },

  async getPaymentMilestones(contractId: string, actor: AuthenticatedUser) {
    const contract = await prisma.contract.findUnique({ where: { id: contractId } });
    if (!contract) throw notFound('Contract', contractId);
    const isBuyer = contract.buyerOrganizationId === actor.organizationId;
    const isSeller = contract.sellerOrganizationId === actor.organizationId;
    if (!isBuyer && !isSeller && actor.role !== 'PLATFORM_ADMIN') throw forbidden();

    const milestones = await prisma.paymentMilestone.findMany({ where: { contractId }, orderBy: { createdAt: 'asc' } });
    return milestones.map((m) => ({ ...m, amountInr: Number(m.amountPaise) / 100 }));
  },
};
