import { Injectable, Logger } from '@nestjs/common';
import { Clock } from '../../platform/clock';
import { backoffSeconds } from '../../platform/events/outbox-relay';
import { EmailService } from '../../platform/mail/email.service';
import { PrismaService } from '../../platform/prisma/prisma.service';
import { PushTransport } from './channels/push';

export const DELIVERY_MAX_ATTEMPTS = 5;

interface DeliveryRow {
  id: string;
  notification_id: string;
  channel: 'push' | 'email';
  attempts: number;
}

type Outcome = { status: 'sent' | 'skipped'; sentCount: number; targetCount: number; error?: string } | { status: 'retry' | 'failed'; error: string; sentCount: number; targetCount: number };

/**
 * Livraison push/email, découplée de la création de la notification :
 * une panne APNs ou Brevo ne bloque ni la transaction métier ni l'in-app, et se retente.
 */
@Injectable()
export class DeliveryService {
  private readonly logger = new Logger('Delivery');

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushTransport,
    private readonly emails: EmailService,
    private readonly clock: Clock,
  ) {}

  async processPending(limit = 100): Promise<number> {
    const now = this.clock.now();
    const lease = new Date(now.getTime() + 60_000);
    const rows = await this.prisma.$queryRaw<DeliveryRow[]>`
      UPDATE notification_deliveries SET next_attempt_at = ${lease}
      WHERE id IN (
        SELECT id FROM notification_deliveries
        WHERE status = 'pending' AND next_attempt_at <= ${now}
        ORDER BY next_attempt_at LIMIT ${limit}
        FOR UPDATE SKIP LOCKED)
      RETURNING id, notification_id, channel, attempts`;

    for (const row of rows) {
      let outcome: Outcome;
      try {
        outcome = row.channel === 'push' ? await this.deliverPush(row.notification_id) : await this.deliverEmail(row.notification_id);
      } catch (err) {
        outcome = { status: 'retry', error: (err as Error).message, sentCount: 0, targetCount: 0 };
      }
      await this.record(row, outcome);
    }
    return rows.length;
  }

  private async record(row: DeliveryRow, o: Outcome): Promise<void> {
    const attempts = row.attempts + 1;
    const now = this.clock.now();
    let status: 'sent' | 'skipped' | 'pending' | 'failed' = o.status === 'retry' ? 'pending' : o.status;
    if (o.status === 'retry' && attempts >= DELIVERY_MAX_ATTEMPTS) status = 'failed';
    await this.prisma.notificationDelivery.update({
      where: { id: row.id },
      data: {
        status,
        attempts,
        sentCount: o.sentCount,
        targetCount: o.targetCount,
        lastError: o.error?.slice(0, 1000) ?? null,
        deliveredAt: status === 'sent' ? now : null,
        nextAttemptAt: new Date(now.getTime() + backoffSeconds(attempts) * 1000),
      },
    });
    if (status === 'failed') this.logger.warn(`Livraison ${row.channel} ${row.notification_id} abandonnée : ${o.error}`);
  }

  private async deliverPush(notificationId: string): Promise<Outcome> {
    const n = await this.prisma.notification.findUnique({ where: { id: notificationId } });
    if (!n || n.status !== 'sent') return { status: 'skipped', sentCount: 0, targetCount: 0, error: 'notification_not_sent' };

    const tokens = await this.prisma.pushToken.findMany({
      where: n.recipientType === 'child' ? { childId: n.recipientId } : { userId: n.recipientId },
    });
    if (tokens.length === 0) return { status: 'skipped', sentCount: 0, targetCount: 0, error: 'no_device' };

    const badge = await this.prisma.notification.count({
      where: { recipientType: n.recipientType, recipientId: n.recipientId, isRead: false, status: 'sent', channels: { has: 'in_app' } },
    });
    const data: Record<string, string> = {
      notificationId: n.id,
      type: n.type ?? 'generic',
      route: n.route ?? '',
      entityType: n.entityType ?? '',
      entityId: n.entityId ?? '',
    };

    let sent = 0;
    let retryable = false;
    let skipped = 0;
    const errors: string[] = [];
    const stale: string[] = [];
    for (const t of tokens) {
      const res = await this.push.send(
        { token: t.token, platform: t.platform as 'ios' | 'android' | 'web', environment: t.environment as 'development' | 'production' },
        { title: n.title, body: n.body, badge, data },
      );
      if (res.ok) {
        sent++;
        continue;
      }
      if (res.skipped) skipped++;
      if (res.invalidToken) stale.push(t.id);
      if (res.retryable) retryable = true;
      errors.push(res.error);
    }
    // Purge des jetons morts : sans ça la table se remplit d'appareils fantômes.
    if (stale.length) await this.prisma.pushToken.deleteMany({ where: { id: { in: stale } } });

    const error = errors.length ? errors.join(' | ') : undefined;
    if (sent > 0) return { status: 'sent', sentCount: sent, targetCount: tokens.length, error };
    if (skipped === tokens.length) return { status: 'skipped', sentCount: 0, targetCount: tokens.length, error };
    if (retryable) return { status: 'retry', sentCount: 0, targetCount: tokens.length, error: error! };
    return { status: 'failed', sentCount: 0, targetCount: tokens.length, error: error ?? 'no_valid_device' };
  }

  private async deliverEmail(notificationId: string): Promise<Outcome> {
    const n = await this.prisma.notification.findUnique({ where: { id: notificationId } });
    if (!n || n.status !== 'sent' || n.recipientType !== 'parent') return { status: 'skipped', sentCount: 0, targetCount: 0 };
    const user = await this.prisma.user.findUnique({ where: { id: n.recipientId } });
    const profile = user ? null : await this.prisma.profile.findUnique({ where: { id: n.recipientId } });
    const email = user?.email ?? profile?.email;
    if (!email) return { status: 'skipped', sentCount: 0, targetCount: 0, error: 'no_email' };

    // Remis à la file d'emails (reprises, désinscription, journal) : la livraison est acquise une fois en file.
    const res = await this.emails.queue(this.prisma, 'parent.notification', {
      to: email,
      toName: user?.fullName ?? profile?.fullName ?? null,
      recipientId: n.recipientId,
      data: { title: n.title, body: n.body, route: n.route },
      dedupKey: `notification:${n.id}`,
    });
    if (res.status === 'pending' || res.status === 'duplicate') return { status: 'sent', sentCount: 1, targetCount: 1 };
    return { status: 'skipped', sentCount: 0, targetCount: 1, error: res.status };
  }
}
