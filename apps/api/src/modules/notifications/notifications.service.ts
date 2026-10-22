import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { NotificationDto, NotificationType } from '@nexvolt/shared';
import type { Notification, Prisma } from '@prisma/client';
import type { Queue } from 'bullmq';
import { AppError } from '../../common/errors/app-error';
import { PrismaService } from '../../common/prisma/prisma.service';
import { notificationPrefs } from '../users/users.service';
import { PUSH_PROVIDER, type PushProvider } from './push.provider';

export const PUSH_QUEUE = Symbol('PUSH_QUEUE');

/** Which preference toggle governs push for each type. Safety alerts always push. */
const CATEGORY: Record<NotificationType, 'bookings' | 'payments' | 'reminders' | 'always'> = {
  BOOKING_REQUESTED: 'bookings',
  BOOKING_APPROVED: 'bookings',
  BOOKING_DECLINED: 'bookings',
  BOOKING_CONFIRMED: 'bookings',
  BOOKING_REMINDER: 'reminders',
  BOOKING_CANCELLED: 'bookings',
  BOOKING_EXPIRED: 'bookings',
  DRIVER_ARRIVED: 'bookings',
  CHARGING_STARTED: 'bookings',
  CHARGING_CONFIRMATION_NEEDED: 'bookings',
  CHARGING_COMPLETED: 'bookings',
  PAYMENT_STATUS: 'payments',
  REFUND_STATUS: 'payments',
  PAYOUT_STATUS: 'payments',
  DISPUTE_UPDATE: 'bookings',
  SAFETY_ALERT: 'always',
  VERIFICATION_UPDATE: 'always',
};

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, string>;
}

export function toNotificationDto(n: Notification): NotificationDto {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    data: (n.data as Record<string, string> | null) ?? null,
    readAt: n.readAt?.toISOString() ?? null,
    createdAt: n.createdAt.toISOString(),
  };
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger('Notifications');

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PUSH_PROVIDER) private readonly push: PushProvider,
    @Optional() @Inject(PUSH_QUEUE) private readonly queue?: Queue | null,
  ) {}

  /**
   * Always records an in-app notification (transactional record); sends push only when
   * the user opted in for that category. Never throws — notifications must not break flows.
   */
  async notify(items: NotifyInput | NotifyInput[]): Promise<void> {
    for (const n of Array.isArray(items) ? items : [items]) {
      try {
        const row = await this.prisma.notification.create({
          data: {
            userId: n.userId,
            type: n.type,
            title: n.title,
            body: n.body,
            data: (n.data ?? undefined) as Prisma.InputJsonValue | undefined,
          },
        });
        await this.maybePush(row.id, n);
      } catch (e) {
        this.logger.warn(`Failed to record notification ${n.type}: ${(e as Error).message}`);
      }
    }
  }

  private async maybePush(notificationId: string, n: NotifyInput): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: n.userId },
      select: { notificationPrefs: true },
    });
    const prefs = notificationPrefs(user?.notificationPrefs);
    const cat = CATEGORY[n.type];
    const allowed = cat === 'always' || (prefs.push && prefs[cat]);
    if (!allowed) {
      await this.prisma.notification.update({
        where: { id: notificationId },
        data: { pushStatus: 'opted_out' },
      });
      return;
    }
    if (!this.push.enabled) {
      await this.prisma.notification.update({
        where: { id: notificationId },
        data: { pushStatus: 'push_not_configured' },
      });
      return;
    }
    if (this.queue)
      await this.queue.add(
        'push',
        { notificationId },
        { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
      );
    else await this.deliver(notificationId);
  }

  /** Called by the push worker. */
  async deliver(notificationId: string): Promise<void> {
    const n = await this.prisma.notification.findUnique({ where: { id: notificationId } });
    if (!n) return;
    const tokens = await this.prisma.deviceToken.findMany({ where: { userId: n.userId } });
    let status = tokens.length ? 'failed' : 'no_devices';
    for (const t of tokens) {
      const r = await this.push.send({
        token: t.token,
        title: n.title,
        body: n.body,
        data: { notificationId: n.id, type: n.type, ...((n.data as Record<string, string>) ?? {}) },
      });
      if (r === 'invalid_token')
        await this.prisma.deviceToken.delete({ where: { id: t.id } }).catch(() => undefined);
      if (r === 'sent') status = 'sent';
    }
    await this.prisma.notification.update({ where: { id: n.id }, data: { pushStatus: status } });
  }

  async list(userId: string, limit = 50) {
    const [items, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: Math.min(limit, 100),
      }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return { items: items.map(toNotificationDto), unread };
  }

  async markRead(userId: string, id: string): Promise<void> {
    const r = await this.prisma.notification.updateMany({
      where: { id, userId },
      data: { readAt: new Date() },
    });
    if (r.count === 0) throw AppError.notFound('Notification');
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}
