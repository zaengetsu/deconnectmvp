import { Injectable } from '@nestjs/common';
import type { NotificationListQuery, RegisterPushTokenInput, UpdatePreferencesInput } from '@rekonect/contracts';
import { AccessService } from '../../platform/auth/access.service';
import type { Principal, UserPrincipal } from '../../platform/auth/principal';
import { Clock } from '../../platform/clock';
import { badRequest, notFound } from '../../platform/http/errors';
import { Prisma, PrismaService } from '../../platform/prisma/prisma.service';
import { hhmmToTimeColumn, isValidTimeZone, timeColumnToHhmm } from '../../platform/time';
import { NotificationService } from './notification.service';
import { CATEGORY_TYPES, categoryOf } from './policy';

type Recipient = { recipientType: 'parent' | 'child'; recipientId: string };

function recipientOf(p: Principal): Recipient {
  return p.kind === 'child' ? { recipientType: 'child', recipientId: p.childId } : { recipientType: 'parent', recipientId: p.userId };
}

/** Centre de notifications in-app (5.13), préférences (5.15) et appareils push (5.12). */
@Injectable()
export class NotificationCenterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
    private readonly access: AccessService,
    private readonly clock: Clock,
  ) {}

  private visible(p: Principal): Prisma.NotificationWhereInput {
    return { ...recipientOf(p), status: 'sent', channels: { has: 'in_app' } };
  }

  async list(p: Principal, q: NotificationListQuery) {
    const where: Prisma.NotificationWhereInput = { ...this.visible(p), ...(q.unread ? { isRead: false } : {}) };
    if (q.category === 'action') where.priority = { in: ['critical', 'high'] };
    else if (q.category) {
      const all = await this.prisma.notification.findMany({ where, select: { type: true }, distinct: ['type'] });
      where.type = { in: all.map((r) => r.type ?? '').filter(CATEGORY_TYPES[q.category]) };
    }
    const rows = await this.prisma.notification.findMany({
      where,
      orderBy: [{ sentAt: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const items = rows.slice(0, q.limit).map((n) => ({
      id: n.id,
      type: n.type,
      category: categoryOf(n.type, n.priority),
      title: n.title,
      body: n.body,
      icon: n.icon,
      route: n.route,
      data: n.data,
      priority: n.priority,
      entityType: n.entityType,
      entityId: n.entityId,
      isRead: n.isRead ?? false,
      readAt: n.readAt,
      sentAt: n.sentAt ?? n.createdAt,
    }));
    return { items, nextCursor: rows.length > q.limit ? items[items.length - 1].id : null };
  }

  async unreadCount(p: Principal) {
    const [count, action] = await Promise.all([
      this.prisma.notification.count({ where: { ...this.visible(p), isRead: false } }),
      this.prisma.notification.count({ where: { ...this.visible(p), isRead: false, priority: { in: ['critical', 'high'] } } }),
    ]);
    return { count, action };
  }

  async markRead(p: Principal, id: string, read = true) {
    const res = await this.prisma.notification.updateMany({
      where: { id, ...recipientOf(p) },
      data: { isRead: read, readAt: read ? this.clock.now() : null },
    });
    if (res.count === 0) throw notFound('NOTIFICATION_NOT_FOUND', 'Notification introuvable');
    return this.unreadCount(p);
  }

  async markAllRead(p: Principal) {
    await this.prisma.notification.updateMany({ where: { ...recipientOf(p), isRead: false }, data: { isRead: true, readAt: this.clock.now() } });
    return this.unreadCount(p);
  }

  /** Masquer une notification : elle disparaît du centre mais reste tracée (statut « cancelled »). */
  async remove(p: Principal, id: string) {
    const res = await this.prisma.notification.updateMany({
      where: { id, ...recipientOf(p), status: 'sent' },
      data: { status: 'cancelled', isRead: true, readAt: this.clock.now() },
    });
    if (res.count === 0) throw notFound('NOTIFICATION_NOT_FOUND', 'Notification introuvable');
    return { success: true };
  }

  // ─── Préférences ───────────────────────────────────────────────────────────

  private async prefsRow(p: UserPrincipal, childId?: string) {
    if (childId) await this.access.assertParentOwnsChild(p.userId, childId);
    await this.notifications.prefsFor(this.prisma, childId ? 'child' : 'parent', childId ?? p.userId);
    return this.prisma.notificationPreference.findFirstOrThrow({ where: childId ? { childId } : { parentId: p.userId, childId: null } });
  }

  private present(row: Awaited<ReturnType<NotificationCenterService['prefsRow']>>) {
    const { quietHoursStart, quietHoursEnd, activitySuggestions: _a, validationReminders: _v, rewardUpdates: _r, congratulations: _c, ...rest } = row;
    return { ...rest, quietHoursStart: timeColumnToHhmm(quietHoursStart), quietHoursEnd: timeColumnToHhmm(quietHoursEnd) };
  }

  async preferences(p: UserPrincipal, childId?: string) {
    return this.present(await this.prefsRow(p, childId));
  }

  async updatePreferences(p: UserPrincipal, input: UpdatePreferencesInput, childId?: string) {
    const row = await this.prefsRow(p, childId);
    if (input.timezone && !isValidTimeZone(input.timezone)) throw badRequest('TIMEZONE_INVALID', 'Fuseau horaire inconnu');
    const { quietHoursStart, quietHoursEnd, channelOverrides, ...flags } = input;
    const updated = await this.prisma.notificationPreference.update({
      where: { id: row.id },
      data: {
        ...flags,
        ...(quietHoursStart !== undefined ? { quietHoursStart: hhmmToTimeColumn(quietHoursStart) } : {}),
        ...(quietHoursEnd !== undefined ? { quietHoursEnd: hhmmToTimeColumn(quietHoursEnd) } : {}),
        ...(channelOverrides ? { channelOverrides: { ...(row.channelOverrides as object), ...channelOverrides } as Prisma.InputJsonValue } : {}),
      },
    });
    return this.present(updated);
  }

  // ─── Appareils ─────────────────────────────────────────────────────────────

  /** Un jeton appartient à un seul destinataire : un appareil repris par un autre compte change de propriétaire. */
  async registerPushToken(p: Principal, input: RegisterPushTokenInput) {
    const owner = p.kind === 'child' ? { childId: p.childId, userId: null } : { userId: p.userId, childId: null };
    const now = this.clock.now();
    await this.prisma.pushToken.upsert({
      where: { token: input.token },
      create: { token: input.token, platform: input.platform, environment: input.environment, lastSeenAt: now, ...owner },
      update: { platform: input.platform, environment: input.environment, lastSeenAt: now, ...owner },
    });
    return { success: true };
  }

  async unregisterPushToken(p: Principal, token: string) {
    await this.prisma.pushToken.deleteMany({ where: p.kind === 'child' ? { token, childId: p.childId } : { token, userId: p.userId } });
    return { success: true };
  }
}
