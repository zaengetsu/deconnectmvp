import { Inject, Injectable } from '@nestjs/common';
import {
  ageFits,
  type ActivityQuery,
  type AssignActivityInput,
  type CreateActivityInput,
  type SubmitActivityInput,
  type UpdateActivityInput,
} from '@rekonect/contracts';
import { ENV, type Env } from '../../config/env';
import { AccessService } from '../../platform/auth/access.service';
import { actorOf, type ChildPrincipal, type Principal, type UserPrincipal } from '../../platform/auth/principal';
import { Clock } from '../../platform/clock';
import { sha256 } from '../../platform/crypto';
import { EventBus } from '../../platform/events/event-bus';
import { familyTimeZone } from '../../platform/family-tz';
import { badRequest, conflict, forbidden, notFound } from '../../platform/http/errors';
import { Prisma, PrismaService, type Tx } from '../../platform/prisma/prisma.service';
import { isoToDateColumn, localDateString, zonedTimeToUtc } from '../../platform/time';
import { EntitlementsService } from '../billing/entitlements.service';
import { GamificationService } from '../gamification/gamification.service';

export const REPORTS_TO_FLAG = 3;

const activityInclude = { category: true, partner: { select: { id: true, name: true, logoUrl: true } } } as const;

/** Mélange déterministe (même tirage toute la journée pour un enfant donné). */
export function seededPick<T extends { id: string }>(items: T[], seed: string, count: number): T[] {
  return [...items]
    .map((item) => ({ item, key: sha256(`${seed}:${item.id}`) }))
    .sort((a, b) => a.key.localeCompare(b.key))
    .slice(0, count)
    .map((x) => x.item);
}

@Injectable()
export class ActivitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly events: EventBus,
    private readonly gamification: GamificationService,
    private readonly clock: Clock,
    @Inject(ENV) private readonly env: Env,
    private readonly entitlements: EntitlementsService,
  ) {}

  /**
   * Le contenu partenaire est toujours filtré par âge (protection de l'enfance). Le catalogue Rekonect
   * ne l'est que si CATALOG_AGE_FILTER est actif : ses tranches valent toutes 9-14 aujourd'hui,
   * les filtrer priverait les moins de 9 ans et les plus de 14 ans de tout le catalogue.
   */
  private fitsAge(a: { activityType: string; minAge: number | null; maxAge: number | null }, age: number): boolean {
    if (a.activityType === 'custom_parent') return true;
    if (a.activityType === 'catalog' && !this.env.CATALOG_AGE_FILTER) return true;
    return ageFits(age, a.minAge, a.maxAge);
  }

  // ─── Catalogue ─────────────────────────────────────────────────────────────

  categories() {
    return this.prisma.activityCategory.findMany({ orderBy: { name: 'asc' } });
  }

  /** Les activités sponsorisées ne sont visibles que si la famille a consenti aux offres partenaires. */
  private async partnerConsent(parentId: string): Promise<boolean> {
    const prefs = await this.prisma.notificationPreference.findFirst({ where: { parentId, childId: null }, select: { partnerOffers: true } });
    return prefs?.partnerOffers ?? false;
  }

  async list(p: Principal, query: ActivityQuery) {
    const parentId = p.kind === 'child' ? p.parentId : p.userId;
    let age = query.age;
    if (p.kind === 'child') age = (await this.prisma.child.findUniqueOrThrow({ where: { id: p.childId } })).age;
    const consent = await this.partnerConsent(parentId);

    const origins: Prisma.ActivityWhereInput[] = [];
    if (query.origin === 'all' || query.origin === 'catalog') origins.push({ activityType: 'catalog', isPublic: true });
    if (query.origin === 'all' || query.origin === 'custom') origins.push({ activityType: 'custom_parent', createdBy: parentId });
    if ((query.origin === 'all' || query.origin === 'partner') && consent) origins.push({ activityType: 'partner', isPublic: true });
    if (origins.length === 0) return [];

    const rows = await this.prisma.activity.findMany({
      where: {
        isActive: true,
        OR: origins,
        ...(query.categoryId ? { categoryId: query.categoryId } : {}),
        ...(query.q ? { title: { contains: query.q, mode: 'insensitive' } } : {}),
      },
      include: activityInclude,
      orderBy: { title: 'asc' },
    });
    return age == null ? rows : rows.filter((a) => this.fitsAge(a, age!));
  }

  async get(p: Principal, id: string) {
    const parentId = p.kind === 'child' ? p.parentId : p.userId;
    const a = await this.prisma.activity.findUnique({ where: { id }, include: activityInclude });
    const visible =
      a && (a.activityType !== 'custom_parent' || a.createdBy === parentId) && (a.isActive || a.createdBy === parentId);
    if (!a || !visible) throw notFound('ACTIVITY_NOT_FOUND', 'Activité introuvable');
    return a;
  }

  async create(p: UserPrincipal, input: CreateActivityInput) {
    if (input.minAge && input.maxAge && input.minAge > input.maxAge) {
      throw badRequest('AGE_RANGE_INVALID', "L'âge minimum dépasse l'âge maximum");
    }
    await this.entitlements.assertCanAddCustomActivity(p.userId);
    return this.prisma.activity.create({
      data: { ...input, createdBy: p.userId, activityType: 'custom_parent', isPublic: false },
      include: activityInclude,
    });
  }

  /** Signalement d'une activité du catalogue par une famille ; 3 signalements ouverts = « Signalée » dans l'admin. */
  async report(p: UserPrincipal, activityId: string, input: { reason: string; details?: string }) {
    const activity = await this.prisma.activity.findFirst({ where: { id: activityId, activityType: { in: ['catalog', 'partner'] } } });
    if (!activity) throw notFound('ACTIVITY_NOT_FOUND', 'Activité introuvable');
    const already = await this.prisma.activityReport.findFirst({ where: { activityId, parentId: p.userId, resolvedAt: null } });
    if (already) throw conflict('ALREADY_REPORTED', 'Vous avez déjà signalé cette activité');
    return this.prisma.tx(async (tx) => {
      const report = await tx.activityReport.create({ data: { activityId, parentId: p.userId, reason: input.reason, details: input.details ?? null, createdAt: this.clock.now() } });
      const open = await tx.activityReport.count({ where: { activityId, resolvedAt: null } });
      if (open >= REPORTS_TO_FLAG && activity.catalogStatus === 'published') await tx.activity.update({ where: { id: activityId }, data: { catalogStatus: 'flagged' } });
      await this.events.publish(tx, 'activity.reported', { aggregateType: 'activity', aggregateId: activityId, payload: { reportId: report.id, activityId, reason: input.reason }, actor: actorOf(p) });
      return { success: true };
    });
  }

  async update(p: UserPrincipal, id: string, input: UpdateActivityInput) {
    const a = await this.prisma.activity.findFirst({ where: { id, createdBy: p.userId, activityType: 'custom_parent' } });
    if (!a) throw notFound('ACTIVITY_NOT_FOUND', 'Activité introuvable');
    return this.prisma.activity.update({ where: { id }, data: input, include: activityInclude });
  }

  async dailyChallenges(p: Principal, childId: string) {
    const child = await this.access.assertCanReadChild(p, childId);
    const tz = await familyTimeZone(this.prisma, child.parentId);
    const today = localDateString(this.clock.now(), tz);
    const startOfDay = zonedTimeToUtc(...(today.split('-').map(Number) as [number, number, number]), 0, 0, tz);
    const doneToday = await this.prisma.childActivity.findMany({
      where: { childId, createdAt: { gte: startOfDay } },
      select: { activityId: true },
    });
    const exclude = new Set(doneToday.map((d) => d.activityId));
    const pool = (
      await this.prisma.activity.findMany({ where: { isActive: true, isPublic: true, activityType: 'catalog' }, include: activityInclude })
    ).filter((a) => !exclude.has(a.id) && this.fitsAge(a, child.age));
    return seededPick(pool, `${childId}:${today}`, 3);
  }

  // ─── Cycle de vie child_activities ─────────────────────────────────────────

  async listForChild(p: Principal, childId: string, status?: string) {
    await this.access.assertCanReadChild(p, childId);
    return this.prisma.childActivity.findMany({
      where: { childId, ...(status ? { status } : {}) },
      include: { activity: { include: activityInclude } },
      orderBy: { createdAt: 'desc' },
    });
  }

  pendingValidations(p: UserPrincipal) {
    return this.prisma.childActivity.findMany({
      where: { status: 'submitted', child: { parentId: p.userId } },
      include: { activity: true, child: { select: { id: true, displayName: true, avatarUrl: true, age: true } } },
      orderBy: { submittedAt: 'asc' },
    });
  }

  /** Le parent propose une activité : l'enfant la voit « à faire ». */
  async assign(p: UserPrincipal, childId: string, input: AssignActivityInput) {
    const child = await this.access.assertParentOwnsChild(p.userId, childId);
    await this.entitlements.assertChildWritable(p.userId, childId);
    const activity = await this.get(p, input.activityId);
    if (!activity.isActive) throw badRequest('ACTIVITY_INACTIVE', 'Cette activité n’est plus disponible');
    return this.prisma.tx(async (tx) => {
      const ca = await tx.childActivity.create({
        data: {
          childId,
          activityId: activity.id,
          status: 'available',
          assignedBy: p.userId,
          assignedByRole: 'parent',
          scheduledFor: input.scheduledFor ? isoToDateColumn(input.scheduledFor) : null,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        },
      });
      await this.events.publish(tx, 'activity.assigned', {
        aggregateType: 'child_activity',
        aggregateId: ca.id,
        payload: { childActivityId: ca.id, childId, parentId: child.parentId, activityId: activity.id },
        actor: actorOf(p),
      });
      return ca;
    });
  }

  /** L'enfant choisit une activité du catalogue, ou démarre une activité proposée. */
  async select(p: ChildPrincipal, input: { activityId?: string; childActivityId?: string; scheduledFor?: string }) {
    await this.entitlements.assertChildWritable(p.parentId, p.childId);
    return this.prisma.tx(async (tx) => {
      let ca;
      if (input.childActivityId) {
        const current = await this.loadForChild(tx, p, input.childActivityId);
        if (current.status !== 'available') throw conflict('INVALID_STATUS', 'Cette activité est déjà commencée');
        ca = await tx.childActivity.update({
          where: { id: current.id },
          data: { status: 'selected', ...(input.scheduledFor ? { scheduledFor: isoToDateColumn(input.scheduledFor) } : {}) },
        });
      } else if (input.activityId) {
        const activity = await this.get(p, input.activityId);
        ca = await tx.childActivity.create({
          data: {
            childId: p.childId,
            activityId: activity.id,
            status: 'selected',
            assignedByRole: 'child',
            scheduledFor: input.scheduledFor ? isoToDateColumn(input.scheduledFor) : null,
          },
        });
      } else {
        throw badRequest('ACTIVITY_REQUIRED', 'Activité manquante');
      }
      if (ca.scheduledFor) {
        await this.events.publish(tx, 'activity.planned', {
          aggregateType: 'child_activity',
          aggregateId: ca.id,
          payload: { childActivityId: ca.id, childId: p.childId, scheduledFor: ca.scheduledFor.toISOString().slice(0, 10) },
          actor: actorOf(p),
        });
      }
      return ca;
    });
  }

  async submit(p: ChildPrincipal, childActivityId: string, input: SubmitActivityInput) {
    await this.entitlements.assertChildWritable(p.parentId, p.childId);
    return this.prisma.tx(async (tx) => {
      const ca = await this.loadForChild(tx, p, childActivityId);
      if (!['available', 'selected', 'rejected'].includes(ca.status)) {
        throw conflict('INVALID_STATUS', 'Cette activité a déjà été envoyée');
      }
      const updated = await tx.childActivity.update({
        where: { id: ca.id },
        data: {
          status: 'submitted',
          submittedAt: this.clock.now(),
          childNote: input.note ?? null,
          proofUrl: input.proofUrl ?? ca.proofUrl,
          proofType: input.proofType ?? ca.proofType,
        },
      });
      await this.events.publish(tx, 'activity.submitted', {
        aggregateType: 'child_activity',
        aggregateId: ca.id,
        payload: { childActivityId: ca.id, childId: p.childId, parentId: p.parentId, activityId: ca.activityId },
        actor: actorOf(p),
      });
      return updated;
    });
  }

  async abandon(p: ChildPrincipal, childActivityId: string) {
    return this.prisma.tx(async (tx) => {
      const ca = await this.loadForChild(tx, p, childActivityId);
      if (ca.status !== 'selected') throw conflict('INVALID_STATUS', 'Seule une activité en cours peut être mise de côté');
      const updated = await tx.childActivity.update({ where: { id: ca.id }, data: { status: 'available' } });
      await this.events.publish(tx, 'activity.abandoned', {
        aggregateType: 'child_activity',
        aggregateId: ca.id,
        payload: { childActivityId: ca.id, childId: p.childId },
        actor: actorOf(p),
      });
      return updated;
    });
  }

  /** Validation parent : points, niveau, badges, série — tout ou rien (ex-RPC validate_child_activity). */
  async validate(p: UserPrincipal, childActivityId: string, note?: string) {
    return this.prisma.tx(async (tx) => {
      // Verrou : deux validations simultanées ne créditent pas deux fois.
      await tx.$queryRaw`SELECT id FROM child_activities WHERE id = ${childActivityId}::uuid FOR UPDATE`;
      const ca = await this.loadForParent(tx, p, childActivityId);
      if (ca.status !== 'submitted') throw conflict('INVALID_STATUS', "Cette activité n'est pas en attente de validation");
      const points = ca.activity.points;

      await tx.childActivity.update({
        where: { id: ca.id },
        data: { status: 'validated', validatedAt: this.clock.now(), validatedBy: p.userId, earnedPoints: points, parentNote: note ?? null },
      });
      const result = await this.gamification.award(tx, {
        childId: ca.childId,
        points,
        source: 'activity_validation',
        sourceId: ca.id,
        reason: ca.activity.title,
        createdBy: p.userId,
      });
      await this.gamification.touchStreak(tx, ca.childId, await familyTimeZone(tx, p.userId));

      await this.events.publish(tx, 'activity.validated', {
        aggregateType: 'child_activity',
        aggregateId: ca.id,
        payload: {
          childActivityId: ca.id,
          childId: ca.childId,
          parentId: p.userId,
          activityId: ca.activityId,
          categoryId: ca.activity.categoryId,
          points,
          newTotal: result.newTotal,
          newLevel: result.newLevel,
          levelUp: result.levelUp,
          badgesAwarded: result.badgesAwarded,
        },
        actor: actorOf(p),
      });
      return {
        success: true,
        pointsAwarded: points,
        newTotal: result.newTotal,
        newLevel: result.newLevel,
        levelUp: result.levelUp,
        badgesAwarded: result.badgesAwarded,
      };
    });
  }

  async reject(p: UserPrincipal, childActivityId: string, reason?: string) {
    return this.prisma.tx(async (tx) => {
      const ca = await this.loadForParent(tx, p, childActivityId);
      if (ca.status !== 'submitted') throw conflict('INVALID_STATUS', "Cette activité n'est pas en attente de validation");
      const updated = await tx.childActivity.update({
        where: { id: ca.id },
        data: { status: 'rejected', rejectedAt: this.clock.now(), validatedBy: p.userId, rejectionReason: reason ?? null },
      });
      await this.events.publish(tx, 'activity.rejected', {
        aggregateType: 'child_activity',
        aggregateId: ca.id,
        payload: { childActivityId: ca.id, childId: ca.childId, reason: reason ?? null },
        actor: actorOf(p),
      });
      return updated;
    });
  }

  /** Tâches expirées non commencées → refusées automatiquement (ex-expire_overdue_tasks). */
  async expireOverdue(): Promise<number> {
    const res = await this.prisma.childActivity.updateMany({
      where: { expiresAt: { lt: this.clock.now() }, status: { in: ['available', 'selected'] } },
      data: { status: 'rejected', rejectionReason: 'Tâche expirée automatiquement', rejectedAt: this.clock.now() },
    });
    return res.count;
  }

  private async loadForChild(tx: Tx, p: ChildPrincipal, id: string) {
    const ca = await tx.childActivity.findUnique({ where: { id } });
    if (!ca || ca.childId !== p.childId) throw notFound('CHILD_ACTIVITY_NOT_FOUND', 'Activité introuvable');
    return ca;
  }

  private async loadForParent(tx: Tx, p: UserPrincipal, id: string) {
    const ca = await tx.childActivity.findUnique({ where: { id }, include: { activity: true, child: true } });
    if (!ca || ca.child.parentId !== p.userId) throw notFound('CHILD_ACTIVITY_NOT_FOUND', 'Activité introuvable');
    if (!ca.child.isActive) throw forbidden('CHILD_ARCHIVED', 'Ce profil enfant est archivé');
    return ca;
  }
}
