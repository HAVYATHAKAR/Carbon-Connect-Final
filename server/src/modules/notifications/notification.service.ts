import { prisma } from '../../db/client.js';
import { NOTIFICATION_TYPES } from '../../config/constants.js';
import type { NotificationType } from '@prisma/client';

// We use string type since Prisma uses String for notification type
type NotifType = string;

export const notificationService = {
  async createForUser(params: {
    userId: string;
    organizationId?: string;
    type: NotifType;
    title: string;
    body: string;
    link?: string;
  }): Promise<void> {
    try {
      await prisma.notification.create({
        data: {
          userId: params.userId,
          organizationId: params.organizationId,
          type: params.type,
          title: params.title,
          body: params.body,
          link: params.link,
        },
      });
    } catch (err) {
      console.error('[NOTIFICATION] Failed to create notification:', err);
    }
  },

  /** Send to all active members of an organization */
  async createForOrg(params: {
    organizationId: string;
    type: NotifType;
    title: string;
    body: string;
    link?: string;
  }): Promise<void> {
    try {
      const members = await prisma.organizationMembership.findMany({
        where: { organizationId: params.organizationId, status: 'active' },
        select: { userId: true },
      });

      await prisma.notification.createMany({
        data: members.map((m) => ({
          userId: m.userId,
          organizationId: params.organizationId,
          type: params.type,
          title: params.title,
          body: params.body,
          link: params.link,
        })),
      });
    } catch (err) {
      console.error('[NOTIFICATION] Failed to create org notification:', err);
    }
  },

  async getForUser(userId: string, page: number, pageSize: number): Promise<{ data: unknown[]; total: number; unread: number }> {
    const skip = (page - 1) * pageSize;
    const [data, total, unread] = await Promise.all([
      prisma.notification.findMany({
        where: { userId },
        skip, take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.notification.count({ where: { userId } }),
      prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return { data, total, unread };
  },

  async markRead(notifId: string, userId: string): Promise<void> {
    await prisma.notification.updateMany({
      where: { id: notifId, userId },
      data: { readAt: new Date() },
    });
  },

  async markAllRead(userId: string): Promise<void> {
    await prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  },
};
