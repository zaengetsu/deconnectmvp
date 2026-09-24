import { Injectable } from '@nestjs/common';
import type { CreateRitualInput, UpdateRitualInput } from '@rekonect/contracts';
import { AccessService } from '../../platform/auth/access.service';
import { actorOf, type Principal, type UserPrincipal } from '../../platform/auth/principal';
import { Clock } from '../../platform/clock';
import { EventBus } from '../../platform/events/event-bus';
import { familyTimeZone } from '../../platform/family-tz';
import { badRequest, conflict, notFound } from '../../platform/http/errors';
import { PrismaService, type Tx } from '../../platform/prisma/prisma.service';
import {
  addDays,
  hhmmToTimeColumn,
  isoToDateColumn,
  localDateString,
  timeColumnToHhmm,
  weekStart,
  zonedParts,
  zonedTimeToUtc,
} from '../../platform/time';
import { GamificationService } from '../gamification/gamification.service';

export const RITUAL_HORIZON_DAYS = 14;

@Injectable()
export class RitualsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly events: EventBus,
    private readonly gamification: GamificationService,
    private readonly clock: Clock,
  ) {}

  private present<T extends { startTime: Date }>(r: T) {
    return { ...r, startTime: timeColumnToHhmm(r.startTime) };
  }

  async list(p: UserPrincipal) {
    const rows = await this.prisma.familyRitual.findMany({ where: { parentId: p.userId }, orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }] });
    return rows.map((r) => this.present(r));
  }

  async create(p: UserPrincipal, input: CreateRitualInput) {
    const r = await this.prisma.familyRitual.create({
      data: { ...input, parentId: p.userId, startTime: hhmmToTimeColumn(input.startTime)! },
    });
    await this.generateFor(r.id);
    return this.present(r);
  }

  async update(p: UserPrincipal, id: string, input: UpdateRitualInput) {
    const r = await this.prisma.familyRitual.findFirst({ where: { id, parentId: p.userId } });
    if (!r) throw notFound('RITUAL_NOT_FOUND', 'Rituel introuvable');
    const { startTime, ...rest } = input;
    const updated = await this.prisma.familyRitual.update({
      where: { id },
      data: { ...rest, ...(startTime ? { startTime: hhmmToTimeColumn(startTime)! } : {}) },
    });
    // Horaire ou jour modifié, ou rituel désactivé : les occurrences futures sont annulées puis régénérées.
    if (startTime || input.weekday != null || input.isActive === false) {
      const future = await this.prisma.familyRitualOccurrence.findMany({
        where: { ritualId: id, status: 'planned', scheduledAt: { gt: this.clock.now() } },
        select: { id: true },
      });
      for (const o of future) await this.closeOccurrence(o.id, 'cancelled');
    }
    if (updated.isActive) await this.generateFor(id);
    return this.present(updated);
  }

  async occurrences(p: Principal) {
    const parentId = p.kind === 'child' ? p.parentId : p.userId;
    return this.prisma.familyRitualOccurrence.findMany({
      where: { ritual: { parentId }, scheduledAt: { gte: new Date(this.clock.now().getTime() - 7 * 86_400_000) } },
      include: { ritual: { select: { id: true, title: true, points: true, durationMinutes: true } } },
      orderBy: { scheduledAt: 'asc' },
    });
  }

  /** Le parent confirme que le rituel a eu lieu et coche les enfants présents : points pour chacun. */
  async confirm(p: UserPrincipal, occurrenceId: string, attendees: string[]) {
    return this.prisma.tx(async (tx) => {
      const occ = await tx.familyRitualOccurrence.findUnique({ where: { id: occurrenceId }, include: { ritual: true } });
      if (!occ || occ.ritual.parentId !== p.userId) throw notFound('OCCURRENCE_NOT_FOUND', 'Rituel introuvable');
      if (occ.status === 'done') throw conflict('INVALID_STATUS', 'Ce rituel est déjà confirmé');
      if (occ.status === 'cancelled') throw conflict('INVALID_STATUS', 'Ce rituel a été annulé');
      const unique = [...new Set(attendees)];
      const owned = await tx.child.count({ where: { id: { in: unique }, parentId: p.userId, isActive: true } });
      if (owned !== unique.length) throw badRequest('ATTENDEES_INVALID', 'Un des enfants ne fait pas partie de la famille');

      const updated = await tx.familyRitualOccurrence.update({
        where: { id: occ.id },
        data: { status: 'done', doneAt: this.clock.now(), attendees: unique },
      });
      for (const childId of unique) {
        await this.gamification.award(tx, { childId, points: occ.ritual.points, source: 'bonus', sourceId: occ.id, reason: `Rituel famille : ${occ.ritual.title}` });
      }
      await this.events.publish(tx, 'ritual.done', {
        aggregateType: 'ritual_occurrence',
        aggregateId: occ.id,
        payload: { occurrenceId: occ.id, ritualId: occ.ritualId, attendees: unique, points: occ.ritual.points },
        actor: actorOf(p),
      });
      return updated;
    });
  }

  async cancel(p: UserPrincipal, occurrenceId: string) {
    const occ = await this.prisma.familyRitualOccurrence.findUnique({ where: { id: occurrenceId }, include: { ritual: true } });
    if (!occ || occ.ritual.parentId !== p.userId) throw notFound('OCCURRENCE_NOT_FOUND', 'Rituel introuvable');
    if (occ.status !== 'planned') throw conflict('INVALID_STATUS', "Ce rituel n'est plus prévu");
    await this.closeOccurrence(occ.id, 'cancelled');
    return { success: true };
  }

  private async closeOccurrence(id: string, status: 'missed' | 'cancelled', db?: Tx) {
    const run = async (tx: Tx) => {
      const res = await tx.familyRitualOccurrence.updateMany({ where: { id, status: 'planned' }, data: { status } });
      if (res.count) {
        await this.events.publish(tx, 'ritual.closed', {
          aggregateType: 'ritual_occurrence',
          aggregateId: id,
          payload: { occurrenceId: id, status },
          actor: { kind: 'system', id: 'rituals' },
        });
      }
    };
    return db ? run(db) : this.prisma.tx(run);
  }

  // ─── Objectif familial hebdomadaire ────────────────────────────────────────

  async goal(p: UserPrincipal) {
    const tz = await familyTimeZone(this.prisma, p.userId);
    const week = weekStart(localDateString(this.clock.now(), tz));
    const goal = await this.prisma.familyGoal.findFirst({ where: { parentId: p.userId, weekStart: isoToDateColumn(week) } });
    const done = await this.countValidated(this.prisma, p.userId, week, tz);
    return { weekStart: week, targetActivities: goal?.targetActivities ?? null, done, achievedAt: goal?.achievedAt ?? null };
  }

  async setGoal(p: UserPrincipal, targetActivities: number) {
    const tz = await familyTimeZone(this.prisma, p.userId);
    const week = weekStart(localDateString(this.clock.now(), tz));
    await this.prisma.familyGoal.upsert({
      where: { parentId_weekStart: { parentId: p.userId, weekStart: isoToDateColumn(week) } },
      create: { parentId: p.userId, weekStart: isoToDateColumn(week), targetActivities },
      update: { targetActivities },
    });
    await this.checkGoal(p.userId);
    return this.goal(p);
  }

  private async countValidated(db: Tx | PrismaService, parentId: string, week: string, tz: string): Promise<number> {
    const [y, m, d] = week.split('-').map(Number);
    return db.childActivity.count({
      where: { status: 'validated', child: { parentId }, validatedAt: { gte: zonedTimeToUtc(y, m, d, 0, 0, tz) } },
    });
  }

  /** Objectif atteint → goal.completed ; à une activité près → goal.progress (dédupliqué côté notifications). */
  async checkGoal(parentId: string, db?: Tx): Promise<'completed' | 'almost' | null> {
    const tz = await familyTimeZone(db ?? this.prisma, parentId);
    const week = weekStart(localDateString(this.clock.now(), tz));
    const run = async (tx: Tx): Promise<'completed' | 'almost' | null> => {
      const goal = await tx.familyGoal.findFirst({ where: { parentId, weekStart: isoToDateColumn(week), achievedAt: null } });
      if (!goal) return null;
      const done = await this.countValidated(tx, parentId, week, tz);
      if (done >= goal.targetActivities) {
        await tx.familyGoal.update({ where: { id: goal.id }, data: { achievedAt: this.clock.now() } });
        await this.events.publish(tx, 'goal.completed', {
          aggregateType: 'family_goal',
          aggregateId: goal.id,
          payload: { goalId: goal.id, parentId, done },
          actor: { kind: 'system', id: 'goals' },
        });
        return 'completed';
      }
      if (goal.targetActivities - done === 1) {
        await this.events.publish(tx, 'goal.progress', {
          aggregateType: 'family_goal',
          aggregateId: goal.id,
          payload: { goalId: goal.id, parentId, remaining: 1 },
          actor: { kind: 'system', id: 'goals' },
        });
        return 'almost';
      }
      return null;
    };
    return db ? run(db) : this.prisma.tx(run);
  }

  async checkAllGoals(): Promise<number> {
    const parents = await this.prisma.familyGoal.findMany({
      where: { achievedAt: null, weekStart: { gte: isoToDateColumn(addDays(localDateString(this.clock.now(), 'UTC'), -7)) } },
      select: { parentId: true },
      distinct: ['parentId'],
    });
    let n = 0;
    for (const { parentId } of parents) if (await this.checkGoal(parentId)) n++;
    return n;
  }

  // ─── Jobs ──────────────────────────────────────────────────────────────────

  /** Occurrences des 14 prochains jours, à l'heure locale de la famille (ex-generate_ritual_occurrences). */
  async generateFor(ritualId: string): Promise<number> {
    const ritual = await this.prisma.familyRitual.findUnique({ where: { id: ritualId } });
    if (!ritual || !ritual.isActive) return 0;
    const tz = await familyTimeZone(this.prisma, ritual.parentId);
    const now = this.clock.now();
    const today = localDateString(now, tz);
    const [hh, mm] = timeColumnToHhmm(ritual.startTime)!.split(':').map(Number);
    let created = 0;

    for (let i = 0; i < RITUAL_HORIZON_DAYS; i++) {
      const day = addDays(today, i);
      const [y, m, d] = day.split('-').map(Number);
      const at = zonedTimeToUtc(y, m, d, hh, mm, tz);
      if (zonedParts(at, tz).weekday !== ritual.weekday || at <= now) continue;

      await this.prisma.tx(async (tx) => {
        const rows = await tx.familyRitualOccurrence.createManyAndReturn({
          data: [{ ritualId: ritual.id, scheduledAt: at }],
          skipDuplicates: true,
        });
        if (rows.length === 0) return;
        created++;
        await this.events.publish(tx, 'ritual.scheduled', {
          aggregateType: 'ritual_occurrence',
          aggregateId: rows[0].id,
          payload: {
            occurrenceId: rows[0].id,
            ritualId: ritual.id,
            parentId: ritual.parentId,
            title: ritual.title,
            scheduledAt: at.toISOString(),
            startTime: timeColumnToHhmm(ritual.startTime)!,
          },
          actor: { kind: 'system', id: 'rituals' },
        });
      });
    }
    return created;
  }

  async generateAll(): Promise<number> {
    const rituals = await this.prisma.familyRitual.findMany({ where: { isActive: true }, select: { id: true } });
    let n = 0;
    for (const r of rituals) n += await this.generateFor(r.id);
    return n;
  }

  /** Occurrences passées depuis plus de 2 h après la fin → « missed », sans notification (choix produit). */
  async closePast(): Promise<number> {
    const planned = await this.prisma.familyRitualOccurrence.findMany({
      where: { status: 'planned', scheduledAt: { lt: this.clock.now() } },
      include: { ritual: { select: { durationMinutes: true } } },
    });
    const limit = this.clock.now().getTime() - 2 * 3_600_000;
    let n = 0;
    for (const o of planned) {
      if (o.scheduledAt.getTime() + o.ritual.durationMinutes * 60_000 < limit) {
        await this.closeOccurrence(o.id, 'missed');
        n++;
      }
    }
    return n;
  }
}
