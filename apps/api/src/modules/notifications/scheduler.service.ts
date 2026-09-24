import { Injectable } from '@nestjs/common';
import { Clock } from '../../platform/clock';
import { PrismaService } from '../../platform/prisma/prisma.service';
import { NotificationService } from './notification.service';
import { nextSendTime } from './policy';
import { stillRelevant } from './relevance';

interface DueRow {
  id: string;
  type: string | null;
  entity_type: string | null;
  entity_id: string | null;
  recipient_type: 'parent' | 'child';
  recipient_id: string;
  priority: 'critical' | 'high' | 'normal' | 'low';
  channels: string[];
}

/**
 * Libère les notifications programmées arrivées à échéance (ex-release_due_notifications) :
 * pertinence revérifiée, heures silencieuses respectées, priorité d'abord.
 */
@Injectable()
export class NotificationScheduler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
    private readonly clock: Clock,
  ) {}

  async releaseDue(limit = 200): Promise<{ released: number; cancelled: number; deferred: number }> {
    return this.prisma.tx(async (tx) => {
      const now = this.clock.now();
      const due = await tx.$queryRaw<DueRow[]>`
        SELECT id, type, entity_type, entity_id, recipient_type, recipient_id, priority, channels
        FROM notifications
        WHERE status = 'scheduled' AND scheduled_at <= ${now}
        ORDER BY CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, scheduled_at
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED`;

      let released = 0;
      let cancelled = 0;
      let deferred = 0;
      for (const n of due) {
        if (!(await stillRelevant(tx, { type: n.type, entityType: n.entity_type, entityId: n.entity_id }))) {
          await tx.notification.update({ where: { id: n.id }, data: { status: 'cancelled' } });
          cancelled++;
          continue;
        }
        const prefs = await this.notifications.prefsFor(tx, n.recipient_type, n.recipient_id);
        const defer = nextSendTime(prefs, n.priority, now);
        if (defer) {
          await tx.notification.update({ where: { id: n.id }, data: { scheduledAt: defer } });
          deferred++;
          continue;
        }
        await tx.notification.update({ where: { id: n.id }, data: { status: 'sent', sentAt: now } });
        await this.notifications.afterSent(tx, n.id, n.channels, n.recipient_type, n.recipient_id);
        released++;
      }
      return { released, cancelled, deferred };
    });
  }
}
