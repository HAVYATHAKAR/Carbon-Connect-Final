import { prisma } from '../../db/client.js';

interface AuditLogEntry {
  actorUserId?: string;
  actorOrganizationId?: string;
  action: string;
  entityType: string;
  entityId: string;
  beforeJson?: unknown;
  afterJson?: unknown;
  ipAddress?: string;
  userAgent?: string;
}

export const auditService = {
  async log(entry: AuditLogEntry): Promise<void> {
    // Append-only — never update or delete
    try {
      await prisma.auditLog.create({
        data: {
          actorUserId: entry.actorUserId,
          actorOrganizationId: entry.actorOrganizationId,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
          beforeJson: entry.beforeJson ? (entry.beforeJson as object) : undefined,
          afterJson: entry.afterJson ? (entry.afterJson as object) : undefined,
          ipAddress: entry.ipAddress,
          userAgent: entry.userAgent,
        },
      });
    } catch (err) {
      // Never let audit failures break business operations
      console.error('[AUDIT] Failed to write audit log:', err);
    }
  },

  async list(filters: {
    actorUserId?: string;
    entityType?: string;
    entityId?: string;
    action?: string;
    page: number;
    pageSize: number;
  }): Promise<{ data: unknown[]; total: number }> {
    const where: Record<string, unknown> = {};
    if (filters.actorUserId) where['actorUserId'] = filters.actorUserId;
    if (filters.entityType) where['entityType'] = filters.entityType;
    if (filters.entityId) where['entityId'] = filters.entityId;
    if (filters.action) where['action'] = filters.action;

    const skip = (filters.page - 1) * filters.pageSize;
    const [data, total] = await Promise.all([
      prisma.auditLog.findMany({ where, skip, take: filters.pageSize, orderBy: { createdAt: 'desc' } }),
      prisma.auditLog.count({ where }),
    ]);
    return { data, total };
  },
};
