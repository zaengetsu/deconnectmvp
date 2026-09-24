import { Injectable } from '@nestjs/common';
import { NUDGE_TYPES } from '@rekonect/contracts';
import { Clock } from '../../platform/clock';
import { DEFAULT_TIMEZONE } from '../../platform/family-tz';
import { PrismaService } from '../../platform/prisma/prisma.service';
import { addDays, isoToDateColumn, isoWeekKey, localDateString, weekStart, zonedParts, zonedTimeToUtc } from '../../platform/time';
import { type ChildFacts, childNudgeHour, ENGAGEMENT, pickChildNudge, pickOfTheDay } from './engagement.rules';
import { NotificationService } from './notification.service';
import { nextSendTime } from './policy';
import { templates } from './templates';

const DAY = 86_400_000;
const CHILD_NUDGES = NUDGE_TYPES.filter((t) => t !== 'parent_nudge_idle');

interface Options {
  /** Ignore l'heure locale (tests, relance manuelle depuis le back-office). */
  anyHour?: boolean;
}

const dayStart = (iso: string, tz: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return zonedTimeToUtc(y, m, d, 0, 0, tz);
};

/**
 * Moteur d'engagement (5.9) : relances contextuelles calculées à partir de ce que fait vraiment
 * l'enfant — série à protéger, activité commencée, récompense proche, objectif familial, activité
 * favorite délaissée, pause suggérée — et, côté parent, validations en attente et enfant inactif.
 * Tourne toutes les heures ; chaque famille est traitée à son heure locale.
 */
@Injectable()
export class EngagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
    private readonly clock: Clock,
  ) {}

  private async families(): Promise<{ parentId: string; timezone: string; encouragements: boolean }[]> {
    return this.prisma.notificationPreference.findMany({ where: { childId: null }, select: { parentId: true, timezone: true, encouragements: true } });
  }

  async run(opts: Options = {}): Promise<{ children: number; parents: number }> {
    return { children: await this.nudgeChildren(opts), parents: await this.nudgeParents(opts) };
  }

  // ─── Enfants ───────────────────────────────────────────────────────────────

  async nudgeChildren(opts: Options = {}): Promise<number> {
    const now = this.clock.now();
    let sent = 0;
    for (const fam of await this.families()) {
      if (!fam.encouragements) continue;
      const tz = fam.timezone || DEFAULT_TIMEZONE;
      const local = zonedParts(now, tz);
      if (!opts.anyHour && local.hour !== childNudgeHour(local.weekday)) continue;
      const children = await this.prisma.child.findMany({
        where: { parentId: fam.parentId, isActive: true, deviceLinkedAt: { not: null } },
        select: { id: true, displayName: true, age: true, parentId: true, totalPoints: true, streakDays: true, lastActivityDate: true },
      });
      for (const child of children) {
        const own = await this.prisma.notificationPreference.findFirst({ where: { childId: child.id }, select: { encouragements: true } });
        if (own && !own.encouragements) continue;
        const facts = await this.childFacts(child, tz);
        const nudge = pickChildNudge(facts);
        if (!nudge) continue;
        // Une relance différée au lendemain matin n'aurait plus de sens : pendant les heures silencieuses, on s'abstient.
        if (nextSendTime(await this.notifications.prefsFor(this.prisma, 'child', child.id), 'low', now)) continue;
        const today = localDateString(now, tz);
        const res = await this.prisma.tx((tx) => this.notifications.enqueue(tx, templates.nudge(child, nudge, today)));
        if (res.status === 'sent' || res.status === 'scheduled') sent++;
      }
    }
    return sent;
  }

  /** Tout ce qu'il faut savoir sur un enfant pour choisir (ou non) une relance. */
  async childFacts(
    child: { id: string; parentId: string; age: number; totalPoints: number; streakDays: number; lastActivityDate: Date | null },
    tz: string,
  ): Promise<ChildFacts> {
    const now = this.clock.now();
    const today = localDateString(now, tz);
    const todayStart = dayStart(today, tz);
    const weekAgo = new Date(now.getTime() - 7 * DAY);

    const [actedToday, plannedToday, nudgesThisWeek, nudgedToday, lastValidated] = await Promise.all([
      this.prisma.childActivity.count({ where: { childId: child.id, OR: [{ validatedAt: { gte: todayStart } }, { submittedAt: { gte: todayStart } }] } }),
      this.prisma.childActivity.count({ where: { childId: child.id, status: 'selected', scheduledFor: isoToDateColumn(today) } }),
      this.prisma.notification.count({ where: { recipientType: 'child', recipientId: child.id, type: { in: [...CHILD_NUDGES] }, status: { in: ['sent', 'scheduled'] }, createdAt: { gte: weekAgo } } }),
      this.prisma.notification.count({ where: { recipientType: 'child', recipientId: child.id, type: { in: [...CHILD_NUDGES] }, createdAt: { gte: todayStart } } }),
      this.prisma.childActivity.findFirst({ where: { childId: child.id, status: 'validated' }, orderBy: { validatedAt: 'desc' }, select: { validatedAt: true } }),
    ]);

    const lastDay = child.lastActivityDate?.toISOString().slice(0, 10) ?? (lastValidated?.validatedAt ? localDateString(lastValidated.validatedAt, tz) : null);
    const daysSinceLastActivity = lastDay ? Math.round((Date.parse(today) - Date.parse(lastDay)) / DAY) : null;

    // Activité commencée avant aujourd'hui (pas une activité programmée pour plus tard).
    const started = await this.prisma.childActivity.findFirst({
      where: {
        childId: child.id,
        status: 'selected',
        updatedAt: { lt: todayStart },
        OR: [{ scheduledFor: null }, { scheduledFor: { lt: isoToDateColumn(today) } }],
      },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, activity: { select: { title: true } } },
    });

    // Récompense la plus proche parmi celles de la famille, sans demande déjà en cours.
    const rewards = await this.prisma.reward.findMany({
      where: { isActive: true, parentId: child.parentId, OR: [{ childId: null }, { childId: child.id }], requiredPoints: { gt: child.totalPoints } },
      orderBy: { requiredPoints: 'asc' },
      take: 3,
      select: { id: true, title: true, requiredPoints: true, requests: { where: { childId: child.id, status: 'pending' }, select: { id: true } } },
    });
    const reward = rewards.find((r) => r.requests.length === 0);

    // Objectif familial de la semaine.
    const goal = await this.prisma.familyGoal.findFirst({ where: { parentId: child.parentId, weekStart: isoToDateColumn(weekStart(today)), achievedAt: null } });
    let familyGoalRemaining: number | null = null;
    if (goal) {
      const done = await this.prisma.childActivity.count({
        where: { status: 'validated', validatedAt: { gte: dayStart(weekStart(today), tz) }, child: { parentId: child.parentId } },
      });
      familyGoalRemaining = Math.max(0, goal.targetActivities - done);
    }

    // Activité favorite (90 jours) : la plus refaite, et depuis quand.
    const favRows = await this.prisma.childActivity.groupBy({
      by: ['activityId'],
      where: { childId: child.id, status: 'validated', validatedAt: { gte: new Date(now.getTime() - 90 * DAY) } },
      _count: { _all: true },
      _max: { validatedAt: true },
      orderBy: { _count: { activityId: 'desc' } },
      take: 1,
    });
    let favorite: ChildFacts['favorite'] = null;
    const fav = favRows[0];
    if (fav && fav._count._all >= ENGAGEMENT.favoriteMinCount && fav._max.validatedAt) {
      const inProgress = await this.prisma.childActivity.count({ where: { childId: child.id, activityId: fav.activityId, status: { in: ['selected', 'submitted'] } } });
      const a = await this.prisma.activity.findUnique({ where: { id: fav.activityId }, select: { id: true, title: true, isActive: true, category: { select: { icon: true } } } });
      if (a?.isActive && inProgress === 0) {
        favorite = { activityId: a.id, title: a.title, icon: a.category?.icon ?? null, daysSince: Math.floor((now.getTime() - fav._max.validatedAt.getTime()) / DAY) };
      }
    }

    // Idée courte adaptée à l'âge, stable dans la journée.
    const ideas = await this.prisma.activity.findMany({
      where: { isActive: true, isPublic: true, catalogStatus: 'published', durationMinutes: { lte: 20 }, minAge: { lte: child.age }, maxAge: { gte: child.age } },
      select: { id: true, title: true, durationMinutes: true },
      orderBy: { createdAt: 'asc' },
      take: 30,
    });
    const idea = pickOfTheDay(ideas, `${child.id}:${today}`);

    return {
      actedToday: actedToday > 0,
      plannedToday: plannedToday > 0,
      nudgesThisWeek,
      nudgedToday: nudgedToday > 0,
      streakDays: child.streakDays,
      lastActivityYesterday: lastDay === addDays(today, -1),
      started: started ? { activityTitle: started.activity.title, childActivityId: started.id } : null,
      closestReward: reward ? { title: reward.title, missing: reward.requiredPoints - child.totalPoints, cost: reward.requiredPoints } : null,
      familyGoalRemaining,
      favorite,
      daysSinceLastActivity,
      suggestion: idea ? { id: idea.id, title: idea.title, minutes: idea.durationMinutes } : null,
    };
  }

  // ─── Parents ───────────────────────────────────────────────────────────────

  async nudgeParents(opts: Options = {}): Promise<number> {
    const now = this.clock.now();
    let sent = 0;
    for (const fam of await this.families()) {
      const tz = fam.timezone || DEFAULT_TIMEZONE;
      if (!opts.anyHour && zonedParts(now, tz).hour !== ENGAGEMENT.parentHour) continue;
      const today = localDateString(now, tz);

      // 1. Validations en attente depuis la veille (utile, pas une relance d'engagement : pas de plafond).
      const waiting = await this.prisma.childActivity.findMany({
        where: { status: 'submitted', submittedAt: { lte: new Date(now.getTime() - ENGAGEMENT.validationBacklogHours * 3_600_000) }, child: { parentId: fam.parentId, isActive: true } },
        orderBy: { submittedAt: 'asc' },
        select: { child: { select: { displayName: true } } },
      });
      if (waiting.length > 0) {
        const res = await this.prisma.tx((tx) => this.notifications.enqueue(tx, templates.validationBacklog(fam.parentId, waiting.length, waiting[0].child.displayName, today)));
        if (res.status === 'sent' || res.status === 'scheduled') sent++;
      }

      // 2. Enfant inactif depuis quelques jours : une idée concrète (2 par semaine au plus).
      if (!fam.encouragements) continue;
      const week = isoWeekKey(today);
      const already = await this.prisma.notification.count({ where: { recipientType: 'parent', recipientId: fam.parentId, type: 'parent_nudge_idle', createdAt: { gte: new Date(now.getTime() - 7 * DAY) } } });
      if (already >= ENGAGEMENT.maxParentIdlePerWeek) continue;
      const children = await this.prisma.child.findMany({
        where: { parentId: fam.parentId, isActive: true, createdAt: { lte: new Date(now.getTime() - ENGAGEMENT.parentIdleDays * DAY) } },
        select: { id: true, displayName: true, age: true, parentId: true, lastActivityDate: true },
      });
      let budget = ENGAGEMENT.maxParentIdlePerWeek - already;
      for (const c of children) {
        if (budget <= 0) break;
        const last = c.lastActivityDate?.toISOString().slice(0, 10) ?? null;
        const days = last ? Math.round((Date.parse(today) - Date.parse(last)) / DAY) : null;
        if (days !== null && days < ENGAGEMENT.parentIdleDays) continue;
        const inProgress = await this.prisma.childActivity.count({ where: { childId: c.id, status: { in: ['selected', 'submitted'] } } });
        if (inProgress > 0) continue;
        const ideas = await this.prisma.activity.findMany({
          where: { isActive: true, isPublic: true, catalogStatus: 'published', minAge: { lte: c.age }, maxAge: { gte: c.age } },
          select: { title: true },
          orderBy: { createdAt: 'asc' },
          take: 30,
        });
        const idea = pickOfTheDay(ideas, `${c.id}:${week}`);
        const res = await this.prisma.tx((tx) => this.notifications.enqueue(tx, templates.parentNudgeIdle(fam.parentId, c, days ?? ENGAGEMENT.parentIdleDays, idea, week)));
        if (res.status === 'sent' || res.status === 'scheduled') {
          sent++;
          budget--;
        }
      }
    }
    return sent;
  }
}
