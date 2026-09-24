import { Injectable } from '@nestjs/common';
import { Clock } from '../../platform/clock';
import { PrismaService } from '../../platform/prisma/prisma.service';
import { addDays, isoToDateColumn, isoWeekKey, localDateString, zonedTimeToUtc } from '../../platform/time';
import { NotificationService } from './notification.service';
import { templates } from './templates';

/** Seuil sous lequel une baisse de temps d'écran n'est pas un signal (ex-migration 028). */
export const SCREEN_TIME_MIN_DROP_PERCENT = 10;

const startOfLocalDay = (isoDate: string, tz: string) => {
  const [y, m, d] = isoDate.split('-').map(Number);
  return zonedTimeToUtc(y, m, d, 0, 0, tz);
};

/**
 * Notifications calculées (résumés, rappels contextuels, temps d'écran).
 * Elles lisent les données des autres modules en lecture seule et respectent les préférences.
 */
@Injectable()
export class DigestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
    private readonly clock: Clock,
  ) {}

  /** 🌙 Résumé du soir — uniquement s'il y a quelque chose à dire et si le parent l'a activé. */
  async dailySummaries(): Promise<number> {
    const parents = await this.prisma.notificationPreference.findMany({ where: { childId: null, dailySummary: true }, select: { parentId: true, timezone: true } });
    let sent = 0;
    for (const { parentId, timezone } of parents) {
      const today = localDateString(this.clock.now(), timezone);
      const since = startOfLocalDay(today, timezone);
      const [perChild, pending] = await Promise.all([
        this.prisma.childActivity.groupBy({
          by: ['childId'],
          where: { status: 'validated', validatedAt: { gte: since }, child: { parentId } },
          _count: { _all: true },
        }),
        this.prisma.rewardRequest.count({ where: { status: 'pending', child: { parentId } } }),
      ]);
      if (perChild.length === 0 && pending === 0) continue;
      const names = await this.prisma.child.findMany({ where: { id: { in: perChild.map((r) => r.childId) } }, select: { id: true, displayName: true } });
      const nameOf = new Map(names.map((c) => [c.id, c.displayName]));
      const lines = perChild.map((r) => `${nameOf.get(r.childId)} : ${r._count._all} activité${r._count._all > 1 ? 's' : ''} terminée${r._count._all > 1 ? 's' : ''}`);
      const total = perChild.reduce((s, r) => s + r._count._all, 0);
      const res = await this.prisma.tx((tx) => this.notifications.enqueue(tx, templates.dailySummary(parentId, lines, pending, total, today)));
      if (res.status === 'sent' || res.status === 'scheduled') sent++;
    }
    return sent;
  }

  /** 📊 Récapitulatif hebdomadaire (in-app + push + email). */
  async weeklySummaries(): Promise<number> {
    const parents = await this.prisma.notificationPreference.findMany({ where: { childId: null, weeklySummary: true }, select: { parentId: true, timezone: true } });
    let sent = 0;
    for (const { parentId, timezone } of parents) {
      const today = localDateString(this.clock.now(), timezone);
      const rows = await this.prisma.childActivity.findMany({
        where: { status: 'validated', validatedAt: { gte: startOfLocalDay(addDays(today, -6), timezone) }, child: { parentId } },
        select: { activity: { select: { durationMinutes: true } } },
      });
      if (rows.length === 0) continue;
      const minutes = rows.reduce((s, r) => s + (r.activity.durationMinutes ?? 0), 0);
      const res = await this.prisma.tx((tx) => this.notifications.enqueue(tx, templates.weeklySummary(parentId, rows.length, minutes, isoWeekKey(today))));
      if (res.status === 'sent' || res.status === 'scheduled') sent++;
    }
    return sent;
  }

  /** 📌 Le parent est prévenu des activités que ses enfants avaient prévues aujourd'hui. */
  async parentContextReminders(): Promise<number> {
    const rows = await this.prisma.childActivity.findMany({
      where: { status: 'selected', scheduledFor: { not: null }, child: { isActive: true } },
      include: { activity: { select: { title: true } }, child: { select: { id: true, displayName: true, age: true, parentId: true } } },
    });
    const tzCache = new Map<string, string>();
    let sent = 0;
    for (const ca of rows) {
      let tz = tzCache.get(ca.child.parentId);
      if (!tz) {
        tz = (await this.prisma.notificationPreference.findFirst({ where: { parentId: ca.child.parentId, childId: null }, select: { timezone: true } }))?.timezone ?? 'Europe/Paris';
        tzCache.set(ca.child.parentId, tz);
      }
      const today = localDateString(this.clock.now(), tz);
      if (ca.scheduledFor?.toISOString().slice(0, 10) !== today) continue;
      const res = await this.prisma.tx((tx) => this.notifications.enqueue(tx, templates.parentPlannedReminder(ca.child, ca.activity, ca.id, today)));
      if (res.status !== 'duplicate') sent++;
    }
    return sent;
  }

  /** 📱 Objectifs de temps d'écran atteints hier + progression sur 7 jours — seulement les bonnes nouvelles (5.8). */
  async screenTime(): Promise<number> {
    const today = localDateString(this.clock.now(), 'Europe/Paris');
    const yesterday = addDays(today, -1);
    let sent = 0;

    const reached = await this.prisma.screenTimeDaily.findMany({
      where: { day: isoToDateColumn(yesterday), goalMinutes: { not: null }, child: { isActive: true } },
      include: { child: { select: { id: true, displayName: true, age: true, parentId: true } } },
    });
    for (const r of reached) {
      if (r.goalMinutes == null || r.minutes > r.goalMinutes) continue;
      const res = await this.prisma.tx((tx) => this.notifications.enqueue(tx, templates.screenTimeGoal(r.child, r.minutes, yesterday)));
      if (res.status !== 'duplicate') sent++;
    }

    const children = await this.prisma.child.findMany({ where: { isActive: true, screenTime: { some: {} } }, select: { id: true, displayName: true, age: true, parentId: true } });
    for (const child of children) {
      const [prev, curr] = await Promise.all([
        this.prisma.screenTimeDaily.aggregate({ _sum: { minutes: true }, where: { childId: child.id, day: { gte: isoToDateColumn(addDays(today, -14)), lt: isoToDateColumn(addDays(today, -7)) } } }),
        this.prisma.screenTimeDaily.aggregate({ _sum: { minutes: true }, where: { childId: child.id, day: { gte: isoToDateColumn(addDays(today, -7)) } } }),
      ]);
      const p = prev._sum.minutes ?? 0;
      const c = curr._sum.minutes ?? 0;
      if (p === 0 || c >= p) continue;
      const drop = Math.round(((p - c) / p) * 100);
      if (drop < SCREEN_TIME_MIN_DROP_PERCENT) continue;
      const res = await this.prisma.tx((tx) => this.notifications.enqueue(tx, templates.screenTimeImproved(child, drop, isoWeekKey(today))));
      if (res.status !== 'duplicate') sent++;
    }
    return sent;
  }
}
