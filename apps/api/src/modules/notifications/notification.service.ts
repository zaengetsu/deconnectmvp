import { Inject, Injectable } from '@nestjs/common';
import { higherPriority, type NotificationPriority, type NotificationType, type RecipientType } from '@rekonect/contracts';
import { ENV, type Env } from '../../config/env';
import { Clock } from '../../platform/clock';
import { Prisma, PrismaService, type Tx } from '../../platform/prisma/prisma.service';
import { nextSendTime, type PreferenceFlags, resolveChannels, typeAllowed } from './policy';
import { type NotificationDraft, templates } from './templates';

export type EnqueueResult =
  | { id: string; status: 'sent' | 'scheduled' | 'suppressed'; grouped?: boolean }
  | { id: null; status: 'duplicate' };

type Db = Tx | PrismaService;

export const DEFAULT_CHILD_QUIET_START = new Date('1970-01-01T20:30:00Z');
export const DEFAULT_CHILD_QUIET_END = new Date('1970-01-01T07:30:00Z');

/**
 * Cœur du système : événement → décision → notification.
 * Port TypeScript de enqueue_notification (migrations 025-028) : préférences, canaux,
 * heures silencieuses, déduplication, regroupement ; puis programmation des livraisons.
 */
@Injectable()
export class NotificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Préférences du destinataire, créées avec les valeurs par défaut si absentes. */
  async prefsFor(db: Db, recipientType: RecipientType, recipientId: string): Promise<PreferenceFlags | null> {
    if (recipientType === 'child') {
      const own = await db.notificationPreference.findFirst({ where: { childId: recipientId } });
      if (own) {
        // Le fuseau de l'enfant suit celui de sa famille.
        const parentTz = await db.notificationPreference.findFirst({ where: { parentId: own.parentId, childId: null }, select: { timezone: true } });
        return { ...own, timezone: parentTz?.timezone ?? own.timezone };
      }
      const child = await db.child.findUnique({ where: { id: recipientId }, select: { parentId: true } });
      if (!child) return null;
      await db.notificationPreference.createMany({
        data: [{ parentId: child.parentId, childId: recipientId, quietHoursStart: DEFAULT_CHILD_QUIET_START, quietHoursEnd: DEFAULT_CHILD_QUIET_END }],
        skipDuplicates: true,
      });
      return this.prefsFor(db, recipientType, recipientId);
    }
    const prefs = await db.notificationPreference.findFirst({ where: { parentId: recipientId, childId: null } });
    if (prefs) return prefs;
    const exists = await db.profile.findUnique({ where: { id: recipientId }, select: { id: true } });
    if (!exists) return null;
    await db.notificationPreference.createMany({ data: [{ parentId: recipientId }], skipDuplicates: true });
    return db.notificationPreference.findFirst({ where: { parentId: recipientId, childId: null } });
  }

  async enqueue(tx: Tx, draft: NotificationDraft): Promise<EnqueueResult> {
    const now = this.clock.now();
    const prefs = await this.prefsFor(tx, draft.recipientType, draft.recipientId);

    let status: 'sent' | 'scheduled' | 'suppressed';
    let channels = draft.channels;
    let when = draft.scheduledAt ?? now;

    if (!typeAllowed(prefs, draft.type)) {
      status = 'suppressed';
      channels = [];
    } else {
      channels = resolveChannels(prefs, draft.type, draft.channels, draft.priority);
      if (!draft.scheduledAt) when = nextSendTime(prefs, draft.priority, now) ?? now;
      status = when > now ? 'scheduled' : 'sent';
    }

    // Une notification bloquée par les préférences n'est tracée qu'une fois par clé (l'index unique ne couvre que sent/scheduled).
    if (status === 'suppressed' && draft.dedupKey) {
      const seen = await tx.notification.findFirst({ where: { dedupKey: draft.dedupKey, status: 'suppressed' }, select: { id: true } });
      if (seen) return { id: null, status: 'duplicate' };
    }

    // Regroupement : une notification vivante et non lue du même groupe absorbe la nouvelle.
    if (draft.groupKey && status === 'sent') {
      const [group] = await tx.$queryRaw<{ id: string; data: Record<string, unknown> | null; priority: NotificationPriority }[]>`
        SELECT id, data, priority FROM notifications
        WHERE group_key = ${draft.groupKey} AND status = 'sent' AND is_read = false
        ORDER BY created_at DESC LIMIT 1 FOR UPDATE`;
      if (group) {
        const count = Number(group.data?.group_count ?? 1) + 1;
        const summary = templates.groupSummary(draft.type, count);
        await tx.notification.update({
          where: { id: group.id },
          data: {
            title: summary.title,
            body: summary.body,
            data: { ...(group.data ?? {}), group_count: count } as Prisma.InputJsonValue,
            sentAt: now,
            priority: higherPriority(group.priority, draft.priority),
          },
        });
        await this.signal(tx, group.id, draft.recipientType, draft.recipientId);
        return { id: group.id, status: 'sent', grouped: true };
      }
    }

    const rows = await tx.notification.createManyAndReturn({
      data: [
        {
          recipientType: draft.recipientType,
          recipientId: draft.recipientId,
          type: draft.type,
          title: draft.title,
          body: draft.body,
          icon: draft.icon,
          route: draft.route,
          data: { ...(draft.data ?? {}), ...(draft.groupKey ? { group_count: 1 } : {}) } as Prisma.InputJsonValue,
          priority: draft.priority,
          entityType: draft.entityType ?? null,
          entityId: draft.entityId ?? null,
          actorChildId: draft.actorChildId ?? null,
          channels,
          status,
          scheduledAt: status === 'scheduled' ? when : null,
          sentAt: status === 'sent' ? now : null,
          dedupKey: draft.dedupKey ?? null,
          groupKey: draft.groupKey ?? null,
          createdAt: now,
        },
      ],
      skipDuplicates: true, // index unique partiel sur dedup_key : pas deux fois la même notification
      select: { id: true },
    });
    if (rows.length === 0) return { id: null, status: 'duplicate' };
    const id = rows[0].id;
    if (status === 'sent') await this.afterSent(tx, id, channels, draft.recipientType, draft.recipientId);
    return { id, status };
  }

  /** Livraisons asynchrones (push, email) + signal temps réel pour l'in-app. */
  async afterSent(tx: Tx, id: string, channels: string[], recipientType: string, recipientId: string): Promise<void> {
    const external = channels.filter((c) => c === 'push' || (c === 'email' && recipientType === 'parent'));
    if (external.length) {
      await tx.notificationDelivery.createMany({
        data: external.map((channel) => ({ notificationId: id, channel, nextAttemptAt: this.clock.now(), createdAt: this.clock.now() })),
        skipDuplicates: true,
      });
      await tx.$executeRaw`SELECT pg_notify('deliveries', ${id})`;
    }
    if (channels.includes('in_app')) await this.signal(tx, id, recipientType, recipientId);
  }

  private async signal(tx: Tx, id: string, recipientType: string, recipientId: string): Promise<void> {
    const payload = JSON.stringify({ id, recipientType, recipientId });
    await tx.$executeRaw`SELECT pg_notify('notifications', ${payload})`;
  }

  /** Annule les notifications programmées d'une entité (activité terminée, récompense remise…). */
  async cancelScheduled(tx: Db, entityType: string, entityId: string, types?: NotificationType[]): Promise<number> {
    const res = await tx.notification.updateMany({
      where: { status: 'scheduled', entityType, entityId, ...(types ? { type: { in: types } } : {}) },
      data: { status: 'cancelled' },
    });
    return res.count;
  }

  get engineEnabled(): boolean {
    return this.env.NOTIFICATIONS_ENGINE === 'api';
  }
}
