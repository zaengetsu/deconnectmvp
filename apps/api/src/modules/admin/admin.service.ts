import { Inject, Injectable } from '@nestjs/common';
import { levelName, monthlyAmountCents, REWARD_CATEGORY_LABELS, subscriptionGrantsAccess } from '@rekonect/contracts';
import { z } from 'zod';
import { ENV, type Env } from '../../config/env';
import { Clock } from '../../platform/clock';
import { hashSecret } from '../../platform/crypto';
import { OutboxRelay } from '../../platform/events/outbox-relay';
import { badRequest, conflict, notFound } from '../../platform/http/errors';
import { Prisma, PrismaService } from '../../platform/prisma/prisma.service';
import { AuthService } from '../identity/auth.service';
import { familyName } from '../billing/billing-admin.service';
import { NotificationService } from '../notifications/notification.service';

interface Page {
  limit: number;
  cursor?: string;
}

const DAY = 86_400_000;
const pct = (num: number, den: number) => (den === 0 ? null : Math.round((num / den) * 1000) / 10);
const delta = (curr: number, prev: number) => (prev === 0 ? null : Math.round(((curr - prev) / prev) * 1000) / 10);

function page<T extends { id: string }>(rows: T[], limit: number) {
  const items = rows.slice(0, limit);
  return { items, nextCursor: rows.length > limit ? items[items.length - 1].id : null };
}

export const AdminActivityInput = z.object({
  title: z.string().trim().min(2).max(120),
  description: z.string().max(2000).nullable().optional(),
  instructions: z.string().max(4000).nullable().optional(),
  categoryId: z.uuid().nullable().optional(),
  points: z.number().int().min(0).max(1000),
  durationMinutes: z.number().int().min(1).max(600).nullable().optional(),
  minAge: z.number().int().min(3).max(18),
  maxAge: z.number().int().min(3).max(18),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  catalogStatus: z.enum(['published', 'draft', 'flagged', 'archived']).default('draft'),
  proofRequired: z.boolean().default(false),
  partnerEligible: z.boolean().default(true),
});
export type AdminActivityInput = z.infer<typeof AdminActivityInput>;

const FAMILY_STATUS_LABELS = { active: 'Active', past_due: 'Impayé', inactive: 'Inactive' } as const;

/**
 * Back-office Rekonect : pilotage, catalogue, familles (lecture seule + actions support), supervision.
 * Pas de contenu privé des familles (notes, preuves) exposé à l'admin.
 */
@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly relay: OutboxRelay,
    private readonly notifications: NotificationService,
    private readonly auth: AuthService,
    private readonly clock: Clock,
    @Inject(ENV) private readonly env: Env,
  ) {}

  // ─── Vue d'ensemble ────────────────────────────────────────────────────────

  private async activeFamilies(from: Date, to: Date): Promise<number> {
    const [row] = await this.prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(DISTINCT c.parent_id) AS n FROM child_activities ca JOIN children c ON c.id = ca.child_id
      WHERE ca.status = 'validated' AND ca.validated_at >= ${from} AND ca.validated_at < ${to}`;
    return Number(row.n);
  }

  private async mrrCents(): Promise<{ total: number; partner: number }> {
    const subs = await this.prisma.subscription.findMany({ where: { amountCents: { gt: 0 } }, select: { status: true, amountCents: true, billingInterval: true, quantity: true, partnerId: true } });
    const live = subs.filter((s) => subscriptionGrantsAccess(s.status));
    const sum = (l: typeof live) => l.reduce((a, s) => a + monthlyAmountCents(s.amountCents, s.billingInterval as 'month' | 'year', s.quantity), 0);
    return { total: sum(live), partner: sum(live.filter((s) => s.partnerId)) };
  }

  async overview(days = 30) {
    const now = this.clock.now();
    const from = new Date(now.getTime() - days * DAY);
    const prevFrom = new Date(from.getTime() - days * DAY);

    const [activeNow, activePrev, kidsNow, kidsBefore, newFamilies, validatedNow, validatedPrev, rejectedNow, activeKids, familiesTotal] = await Promise.all([
      this.activeFamilies(from, new Date(now.getTime() + 1)),
      this.activeFamilies(prevFrom, from),
      this.prisma.child.count({ where: { isActive: true } }),
      this.prisma.child.count({ where: { isActive: true, createdAt: { lt: from } } }),
      this.prisma.profile.count({ where: { role: 'parent', createdAt: { gte: from } } }),
      this.prisma.childActivity.count({ where: { status: 'validated', validatedAt: { gte: from } } }),
      this.prisma.childActivity.count({ where: { status: 'validated', validatedAt: { gte: prevFrom, lt: from } } }),
      this.prisma.childActivity.count({ where: { status: 'rejected', rejectedAt: { gte: from } } }),
      this.prisma.childActivity.findMany({ where: { status: 'validated', validatedAt: { gte: from } }, distinct: ['childId'], select: { childId: true } }),
      this.prisma.profile.count({ where: { role: 'parent' } }),
    ]);
    const mrr = await this.mrrCents();
    const netNew = await this.prisma.subscriptionEvent.aggregate({ _sum: { amountCents: true }, where: { occurredAt: { gte: from }, type: { in: ['created', 'upgraded', 'downgraded', 'canceled', 'licenses_purchased'] } } });
    const mrrPrev = mrr.total - (netNew._sum.amountCents ?? 0);

    const [pendingOffers, oldestPending, pastDue, flaggedActivities, flagReasons] = await Promise.all([
      this.prisma.partnerOffer.count({ where: { status: 'pending_review' } }),
      this.prisma.partnerOffer.findFirst({ where: { status: 'pending_review' }, orderBy: { submittedAt: 'asc' }, select: { submittedAt: true } }),
      this.prisma.subscription.count({ where: { status: 'past_due' } }),
      this.prisma.activity.count({ where: { catalogStatus: 'flagged' } }),
      this.prisma.activityReport.groupBy({ by: ['reason'], where: { resolvedAt: null }, _count: { _all: true }, orderBy: { _count: { reason: 'desc' } }, take: 2 }),
    ]);

    return {
      environment: this.env.APP_ENV,
      asOf: now,
      days,
      alerts: {
        pendingOffers,
        oldestPendingAt: oldestPending?.submittedAt ?? null,
        failedPayments: pastDue,
        flaggedActivities,
        flagReasons: flagReasons.map((r) => r.reason),
      },
      kpis: {
        activeFamilies: { value: activeNow, delta: delta(activeNow, activePrev), newFamilies },
        children: { value: kidsNow, delta: delta(kidsNow, kidsBefore), perFamily: familiesTotal ? Math.round((kidsNow / familiesTotal) * 100) / 100 : 0 },
        validatedActivities: { value: validatedNow, delta: delta(validatedNow, validatedPrev), perActiveChild: activeKids.length ? Math.round((validatedNow / activeKids.length) * 10) / 10 : 0 },
        mrr: { valueCents: mrr.total, delta: delta(mrr.total, mrrPrev), partnerCents: mrr.partner },
      },
      health: await this.health(from, validatedNow, rejectedNow),
    };
  }

  private async health(from: Date, validated: number, rejected: number) {
    const [delay] = await this.prisma.$queryRaw<{ seconds: number | null }[]>`
      SELECT avg(extract(epoch FROM validated_at - submitted_at))::float AS seconds
      FROM child_activities WHERE status = 'validated' AND validated_at >= ${from} AND submitted_at IS NOT NULL`;
    const [streaks, parents, withPush] = await Promise.all([
      this.prisma.child.count({ where: { isActive: true, streakDays: { gte: 7 } } }),
      this.prisma.profile.count({ where: { role: 'parent' } }),
      this.prisma.profile.count({ where: { role: 'parent', pushTokens: { some: {} }, notificationPreferences: { some: { childId: null, pushEnabled: true } } } }),
    ]);
    return {
      avgValidationDelaySeconds: delay.seconds == null ? null : Math.round(delay.seconds),
      refusalRate: pct(rejected, validated + rejected),
      streaks7Plus: streaks,
      notificationsEnabledRate: pct(withPush, parents),
    };
  }

  /** Familles actives par mois, payantes / gratuites, sur 12 mois glissants. */
  async activeFamiliesByMonth() {
    const now = this.clock.now();
    const months: { label: string; start: Date; end: Date }[] = [];
    for (let i = 11; i >= 0; i--) {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
      months.push({ label: 'JFMAMJJASOND'[start.getUTCMonth()], start, end });
    }
    const out = [];
    for (const m of months) {
      const rows = await this.prisma.$queryRaw<{ paid: bigint; total: bigint }[]>`
        SELECT count(DISTINCT c.parent_id) AS total,
               count(DISTINCT c.parent_id) FILTER (WHERE EXISTS (
                 SELECT 1 FROM subscriptions s WHERE s.parent_id = c.parent_id AND (
                   (s.amount_cents > 0 AND s.started_at < ${m.end} AND (s.canceled_at IS NULL OR s.canceled_at >= ${m.start}))
                   OR (s.comp_until IS NOT NULL AND s.comp_until >= ${m.start})))) AS paid
        FROM child_activities ca JOIN children c ON c.id = ca.child_id
        WHERE ca.status = 'validated' AND ca.validated_at >= ${m.start} AND ca.validated_at < ${m.end}`;
      const total = Number(rows[0].total);
      const paid = Number(rows[0].paid);
      out.push({ label: m.label, month: m.start.toISOString().slice(0, 7), paid, free: total - paid });
    }
    return out;
  }

  async topActivities(days = 30, limit = 6) {
    const from = new Date(this.clock.now().getTime() - days * DAY);
    const rows = await this.prisma.$queryRaw<{ id: string; title: string; category: string | null; slug: string | null; validated: bigint; rejected: bigint }[]>`
      SELECT a.id, a.title, cat.name AS category, cat.slug,
             count(*) FILTER (WHERE ca.status = 'validated') AS validated,
             count(*) FILTER (WHERE ca.status = 'rejected') AS rejected
      FROM child_activities ca JOIN activities a ON a.id = ca.activity_id
      LEFT JOIN activity_categories cat ON cat.id = a.category_id
      WHERE a.activity_type IN ('catalog', 'partner') AND COALESCE(ca.validated_at, ca.rejected_at, ca.created_at) >= ${from}
      GROUP BY a.id, a.title, cat.name, cat.slug
      ORDER BY validated DESC LIMIT ${limit}`;
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      category: r.category,
      categorySlug: r.slug,
      validated: Number(r.validated),
      validationRate: pct(Number(r.validated), Number(r.validated) + Number(r.rejected)),
    }));
  }

  async topRewards(days = 30, limit = 5) {
    const from = new Date(this.clock.now().getTime() - days * DAY);
    const rows = await this.prisma.$queryRaw<{ title: string; category: string | null; partner: string | null; n: bigint }[]>`
      SELECT COALESCE(src.title, r.title) AS title, COALESCE(src.reward_category, r.reward_category) AS category, pa.name AS partner, count(*) AS n
      FROM reward_requests rr JOIN rewards r ON r.id = rr.reward_id
      LEFT JOIN rewards src ON src.id = r.source_reward_id
      LEFT JOIN partner_offers po ON po.id = r.partner_offer_id
      LEFT JOIN partners pa ON pa.id = po.partner_id
      WHERE rr.status IN ('approved', 'completed') AND rr.approved_at >= ${from}
        AND (r.source_reward_id IS NOT NULL OR r.partner_offer_id IS NOT NULL)
      GROUP BY 1, 2, 3 ORDER BY n DESC LIMIT ${limit}`;
    return rows.map((r, i) => ({
      rank: String(i + 1).padStart(2, '0'),
      title: r.title,
      source: r.partner ?? `Native · ${REWARD_CATEGORY_LABELS[r.category ?? ''] ?? 'Autres'}`,
      partner: !!r.partner,
      exchanges: Number(r.n),
    }));
  }

  // ─── Catalogue d'activités ─────────────────────────────────────────────────

  async activities(q: { categoryId?: string; status?: string; q?: string; origin?: string; limit: number; cursor?: string }) {
    const since = new Date(this.clock.now().getTime() - 30 * DAY);
    const where: Prisma.ActivityWhereInput = {
      activityType: q.origin === 'partner' ? 'partner' : q.origin === 'all' ? { in: ['catalog', 'partner'] } : 'catalog',
      ...(q.categoryId ? { categoryId: q.categoryId } : {}),
      ...(q.status ? { catalogStatus: q.status } : {}),
      ...(q.q ? { title: { contains: q.q, mode: 'insensitive' } } : {}),
    };
    const rows = await this.prisma.activity.findMany({
      where,
      include: { category: true, partner: { select: { id: true, name: true } }, _count: { select: { reports: { where: { resolvedAt: null } } } } },
      orderBy: [{ title: 'asc' }, { id: 'asc' }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const ids = rows.map((r) => r.id);
    const stats = ids.length
      ? await this.prisma.$queryRaw<{ activity_id: string; assigned: bigint; validated: bigint; rejected: bigint; families: bigint }[]>`
          SELECT ca.activity_id,
                 count(*) FILTER (WHERE ca.created_at >= ${since}) AS assigned,
                 count(*) FILTER (WHERE ca.status = 'validated') AS validated,
                 count(*) FILTER (WHERE ca.status = 'rejected') AS rejected,
                 count(DISTINCT c.parent_id) AS families
          FROM child_activities ca JOIN children c ON c.id = ca.child_id
          WHERE ca.activity_id IN (${Prisma.join(ids)})
          GROUP BY ca.activity_id`
      : [];
    const byId = new Map(stats.map((s) => [s.activity_id, s]));
    const items = rows.map((a) => {
      const s = byId.get(a.id);
      const validated = Number(s?.validated ?? 0);
      const rejected = Number(s?.rejected ?? 0);
      return {
        ...a,
        openReports: a._count.reports,
        assigned30d: Number(s?.assigned ?? 0),
        validated,
        validationRate: pct(validated, validated + rejected),
        families: Number(s?.families ?? 0),
      };
    });
    const [categories, total, published] = await Promise.all([
      this.prisma.activityCategory.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { activities: { where: { activityType: 'catalog' } } } } } }),
      this.prisma.activity.count({ where: { activityType: 'catalog' } }),
      this.prisma.activity.count({ where: { activityType: 'catalog', catalogStatus: 'published' } }),
    ]);
    return {
      ...page(items, q.limit),
      total,
      published,
      categories: categories.map((c) => ({ id: c.id, name: c.name, slug: c.slug, count: c._count.activities })),
    };
  }

  async activityDetail(id: string) {
    const a = await this.prisma.activity.findUnique({ where: { id }, include: { category: true, reports: { where: { resolvedAt: null }, orderBy: { createdAt: 'desc' } } } });
    if (!a) throw notFound('ACTIVITY_NOT_FOUND', 'Activité introuvable');
    const res = await this.activities({ q: a.title, limit: 50, origin: 'all' });
    const stats = res.items.find((x) => x.id === id);
    return { ...a, assigned30d: stats?.assigned30d ?? 0, validationRate: stats?.validationRate ?? null, families: stats?.families ?? 0 };
  }

  private activityData(input: Partial<AdminActivityInput>) {
    if (input.minAge != null && input.maxAge != null && input.minAge > input.maxAge) throw badRequest('AGE_RANGE_INVALID', "L'âge minimum dépasse l'âge maximum");
    return { ...input, ...(input.catalogStatus ? { isActive: input.catalogStatus === 'published' || input.catalogStatus === 'flagged' } : {}) };
  }

  createActivity(input: AdminActivityInput) {
    return this.prisma.activity.create({ data: { ...this.activityData(input), activityType: 'catalog', isPublic: true } as Prisma.ActivityUncheckedCreateInput });
  }

  async updateActivity(id: string, input: Partial<AdminActivityInput>) {
    const a = await this.prisma.activity.findFirst({ where: { id, activityType: 'catalog' } });
    if (!a) throw notFound('ACTIVITY_NOT_FOUND', 'Activité introuvable (les activités partenaires se gèrent via leur offre)');
    return this.prisma.activity.update({ where: { id }, data: this.activityData(input) as Prisma.ActivityUncheckedUpdateInput });
  }

  /** Import CSV (séparateur « ; ») : titre;catégorie;points;difficulté;âge min;âge max;consigne. Crée des brouillons. */
  async importActivities(csv: string) {
    const categories = new Map((await this.prisma.activityCategory.findMany()).map((c) => [c.slug, c.id]));
    const diff: Record<string, 'easy' | 'medium' | 'hard'> = { facile: 'easy', easy: 'easy', moyen: 'medium', medium: 'medium', difficile: 'hard', hard: 'hard' };
    const lines = csv.replace(/^﻿/, '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const errors: { line: number; message: string }[] = [];
    let created = 0;
    for (const [i, line] of lines.entries()) {
      if (i === 0 && /^titre;/i.test(line)) continue;
      const [title, slug, points, difficulty, minAge, maxAge, instructions] = line.split(';').map((c) => c?.trim());
      const parsed = AdminActivityInput.safeParse({
        title,
        categoryId: slug ? (categories.get(slug) ?? null) : null,
        points: Number(points),
        difficulty: diff[(difficulty ?? '').toLowerCase()] ?? difficulty,
        minAge: Number(minAge),
        maxAge: Number(maxAge),
        instructions: instructions || null,
        catalogStatus: 'draft',
      });
      if (!parsed.success) {
        errors.push({ line: i + 1, message: parsed.error.issues[0].message });
        continue;
      }
      if (slug && !categories.has(slug)) {
        errors.push({ line: i + 1, message: `Catégorie inconnue : ${slug}` });
        continue;
      }
      await this.createActivity(parsed.data);
      created++;
    }
    return { created, errors };
  }

  async reports() {
    return this.prisma.activityReport.findMany({
      where: { resolvedAt: null },
      include: { activity: { select: { id: true, title: true, catalogStatus: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async resolveReports(activityId: string, resolution: string, status?: 'published' | 'archived') {
    await this.prisma.tx(async (tx) => {
      await tx.activityReport.updateMany({ where: { activityId, resolvedAt: null }, data: { resolvedAt: this.clock.now(), resolution } });
      if (status) await tx.activity.update({ where: { id: activityId }, data: { catalogStatus: status, isActive: status === 'published' } });
    });
    return { success: true };
  }

  async createCategory(data: { name: string; slug: string; description?: string; icon?: string }) {
    if (await this.prisma.activityCategory.findUnique({ where: { slug: data.slug } })) throw conflict('SLUG_TAKEN', 'Ce slug existe déjà');
    return this.prisma.activityCategory.create({ data });
  }

  // ─── Récompenses natives ───────────────────────────────────────────────────

  async catalogRewards() {
    const since = new Date(this.clock.now().getTime() - 30 * DAY);
    const rows = await this.prisma.reward.findMany({ where: { parentId: null, rewardType: 'catalog' }, orderBy: [{ rewardCategory: 'asc' }, { requiredPoints: 'asc' }] });
    const ids = rows.map((r) => r.id);
    const stats = ids.length
      ? await this.prisma.$queryRaw<{ source: string; families: bigint; exchanges: bigint }[]>`
          SELECT r.source_reward_id AS source, count(DISTINCT r.parent_id) AS families,
                 count(rr.id) FILTER (WHERE rr.status IN ('approved','completed') AND rr.approved_at >= ${since}) AS exchanges
          FROM rewards r LEFT JOIN reward_requests rr ON rr.reward_id = r.id
          WHERE r.source_reward_id IN (${Prisma.join(ids)}) GROUP BY r.source_reward_id`
      : [];
    const byId = new Map(stats.map((s) => [s.source, s]));
    const items = rows.map((r) => ({
      ...r,
      categoryLabel: REWARD_CATEGORY_LABELS[r.rewardCategory ?? ''] ?? 'Autres',
      families: Number(byId.get(r.id)?.families ?? 0),
      exchanges30d: Number(byId.get(r.id)?.exchanges ?? 0),
    }));
    const totalExchanges = items.reduce((s, r) => s + r.exchanges30d, 0);
    const categories = Object.entries(
      items.reduce<Record<string, { count: number; exchanges: number }>>((acc, r) => {
        const k = r.rewardCategory ?? 'other';
        acc[k] = { count: (acc[k]?.count ?? 0) + 1, exchanges: (acc[k]?.exchanges ?? 0) + r.exchanges30d };
        return acc;
      }, {}),
    ).map(([key, v]) => ({ key, label: REWARD_CATEGORY_LABELS[key] ?? 'Autres', ideas: v.count, share: totalExchanges ? Math.round((v.exchanges / totalExchanges) * 100) : 0 }));
    return { items, categories };
  }

  createCatalogReward(data: { title: string; description?: string; requiredPoints: number; rewardCategory?: string }) {
    return this.prisma.reward.create({ data: { ...data, parentId: null, rewardType: 'catalog' } });
  }

  async updateCatalogReward(id: string, data: Prisma.RewardUncheckedUpdateInput) {
    const r = await this.prisma.reward.findFirst({ where: { id, parentId: null, rewardType: 'catalog' } });
    if (!r) throw notFound('REWARD_NOT_FOUND', 'Récompense introuvable');
    return this.prisma.reward.update({ where: { id }, data });
  }

  createBadge(data: { name: string; description?: string; icon?: string; conditionType: string; conditionValue: number }) {
    return this.prisma.badge.create({ data });
  }

  // ─── Familles ──────────────────────────────────────────────────────────────

  async familyStats() {
    const since = new Date(this.clock.now().getTime() - 30 * DAY);
    const [families, newFamilies, children, linked, active] = await Promise.all([
      this.prisma.profile.count({ where: { role: 'parent' } }),
      this.prisma.profile.count({ where: { role: 'parent', createdAt: { gte: since } } }),
      this.prisma.child.count({ where: { isActive: true } }),
      this.prisma.child.count({ where: { isActive: true, deviceLinkedAt: { not: null } } }),
      this.activeFamilies(since, this.clock.now()),
    ]);
    return {
      families,
      children,
      newFamilies30d: newFamilies,
      childrenPerFamily: families ? Math.round((children / families) * 100) / 100 : 0,
      deviceLinkedRate: pct(linked, children),
      inactive30d: Math.max(0, families - active),
    };
  }

  private async familyRows(ids: string[]) {
    if (!ids.length) return new Map<string, { last: Date | null }>();
    const rows = await this.prisma.$queryRaw<{ parent_id: string; last: Date | null }[]>`
      SELECT c.parent_id, max(COALESCE(ca.validated_at, ca.submitted_at, ca.created_at)) AS last
      FROM children c LEFT JOIN child_activities ca ON ca.child_id = c.id
      WHERE c.parent_id IN (${Prisma.join(ids)}) GROUP BY c.parent_id`;
    return new Map(rows.map((r) => [r.parent_id, { last: r.last }]));
  }

  private familyStatus(sub: { status: string } | undefined, lastActivity: Date | null, lastLogin: Date | null): keyof typeof FAMILY_STATUS_LABELS {
    if (sub?.status === 'past_due') return 'past_due';
    const since = this.clock.now().getTime() - 30 * DAY;
    const latest = Math.max(lastActivity?.getTime() ?? 0, lastLogin?.getTime() ?? 0);
    return latest >= since ? 'active' : 'inactive';
  }

  private effectivePlan(sub: { plan: string; status: string; compPlan: string | null; compUntil: Date | null } | undefined): string {
    if (!sub) return 'free';
    const now = this.clock.now();
    const paid = subscriptionGrantsAccess(sub.status) ? sub.plan : 'free';
    const comp = sub.compPlan && sub.compUntil && sub.compUntil > now ? sub.compPlan : 'free';
    const rank: Record<string, number> = { free: 0, family: 1, family_plus: 2 };
    return (rank[comp] ?? 0) > (rank[paid] ?? 0) ? comp : paid;
  }

  async families(q: Page & { q?: string; plan?: string; status?: string }) {
    const planNames = new Map((await this.prisma.plan.findMany({ where: { audience: 'family' } })).map((p) => [p.id, p.name]));
    // Filtres calculés (plan effectif, statut) : on filtre en mémoire sur une page élargie.
    const batch = q.plan || q.status ? 500 : q.limit + 1;
    const rows = await this.prisma.profile.findMany({
      where: {
        role: 'parent',
        ...(q.q ? { OR: [{ email: { contains: q.q, mode: 'insensitive' } }, { fullName: { contains: q.q, mode: 'insensitive' } }, { city: { contains: q.q, mode: 'insensitive' } }] } : {}),
        ...(q.status === 'past_due' ? { subscriptions: { some: { status: 'past_due' } } } : {}),
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        city: true,
        createdAt: true,
        _count: { select: { children: { where: { isActive: true } } } },
        subscriptions: { select: { plan: true, status: true, compPlan: true, compUntil: true }, take: 1 },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: batch,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const users = new Map((await this.prisma.user.findMany({ where: { id: { in: rows.map((r) => r.id) } }, select: { id: true, lastLoginAt: true } })).map((u) => [u.id, u.lastLoginAt]));
    const extra = await this.familyRows(rows.map((r) => r.id));
    let items = rows.map((r) => {
      const sub = r.subscriptions[0];
      const plan = this.effectivePlan(sub);
      const last = extra.get(r.id)?.last ?? null;
      const status = this.familyStatus(sub, last, users.get(r.id) ?? null);
      return {
        id: r.id,
        name: familyName(r.fullName, r.email),
        parentName: r.fullName ?? r.email,
        email: r.email,
        city: r.city,
        children: r._count.children,
        plan,
        planName: planNames.get(plan) ?? plan,
        createdAt: r.createdAt,
        lastActivityAt: [last, users.get(r.id) ?? null].filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0] ?? null,
        status,
        statusLabel: FAMILY_STATUS_LABELS[status],
      };
    });
    if (q.plan) items = items.filter((i) => i.plan === q.plan);
    if (q.status) items = items.filter((i) => i.status === q.status);
    return page(items, q.limit);
  }

  async family(id: string) {
    const profile = await this.prisma.profile.findFirst({
      where: { id, role: 'parent' },
      select: {
        id: true,
        email: true,
        fullName: true,
        createdAt: true,
        city: true,
        country: true,
        subscriptions: { take: 1, include: { planRef: { select: { name: true } } } },
        children: { where: { isActive: true }, orderBy: { createdAt: 'asc' }, select: { id: true, displayName: true, age: true, level: true, totalPoints: true, streakDays: true, avatarUrl: true, deviceLinkedAt: true, createdAt: true } },
        ownedFamilyMembers: { where: { status: 'active' }, include: { member: { select: { fullName: true, email: true } } } },
      },
    });
    if (!profile) throw notFound('FAMILY_NOT_FOUND', 'Famille introuvable');
    const user = await this.prisma.user.findUnique({ where: { id }, select: { lastLoginAt: true, disabledAt: true } });
    const since = new Date(this.clock.now().getTime() - 30 * DAY);
    const activity30d = await this.prisma.childActivity.count({ where: { child: { parentId: id }, status: 'validated', validatedAt: { gte: since } } });
    const sub = profile.subscriptions[0];
    const last = (await this.familyRows([id])).get(id)?.last ?? null;
    const status = this.familyStatus(sub, last, user?.lastLoginAt ?? null);
    const plan = this.effectivePlan(sub);
    const planName = (await this.prisma.plan.findUnique({ where: { id: plan } }))?.name ?? plan;
    return {
      id: profile.id,
      name: familyName(profile.fullName, profile.email),
      city: profile.city,
      country: profile.country,
      createdAt: profile.createdAt,
      plan,
      planName,
      subscription: sub ? { status: sub.status, compUntil: sub.compUntil, currentPeriodEnd: sub.currentPeriodEnd, cancelAtPeriodEnd: sub.cancelAtPeriodEnd } : null,
      status,
      statusLabel: FAMILY_STATUS_LABELS[status],
      parents: [
        { name: profile.fullName ?? profile.email, email: profile.email, role: 'administrateur' },
        ...profile.ownedFamilyMembers.map((m) => ({ name: m.member?.fullName ?? m.memberEmail, email: m.member?.email ?? m.memberEmail, role: m.memberRole === 'co_parent' ? 'co-parent' : m.memberRole })),
      ],
      children: profile.children.map((c) => ({ ...c, levelName: levelName(c.level) })),
      lastLoginAt: user?.lastLoginAt ?? null,
      disabledAt: user?.disabledAt ?? null,
      activity30d,
    };
  }

  async setUserDisabled(id: string, disabled: boolean) {
    const res = await this.prisma.user.updateMany({ where: { id, role: { not: 'admin' } }, data: { disabledAt: disabled ? this.clock.now() : null } });
    if (res.count === 0) throw notFound('USER_NOT_FOUND', 'Compte introuvable');
    if (disabled) await this.prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: this.clock.now() } });
    return { success: true };
  }

  /** « Renvoyer l'email de connexion » : lien de réinitialisation du mot de passe. */
  async resendLogin(id: string) {
    const profile = await this.prisma.profile.findFirst({ where: { id, role: 'parent' } });
    if (!profile) throw notFound('FAMILY_NOT_FOUND', 'Famille introuvable');
    await this.auth.forgotPassword(profile.email);
    return { success: true, email: profile.email };
  }

  /**
   * Suppression RGPD : compte, profils enfants, historique et appareils sont effacés (cascade).
   * Les agrégats partenaires, déjà anonymes, sont conservés.
   */
  async deleteFamily(id: string, confirmEmail: string) {
    const profile = await this.prisma.profile.findFirst({ where: { id, role: 'parent' } });
    if (!profile) throw notFound('FAMILY_NOT_FOUND', 'Famille introuvable');
    if (profile.email.toLowerCase() !== confirmEmail.trim().toLowerCase()) throw badRequest('CONFIRMATION_MISMATCH', "L'email de confirmation ne correspond pas");
    await this.prisma.tx(async (tx) => {
      const children = await tx.child.findMany({ where: { parentId: id }, select: { id: true } });
      const recipients = [id, ...children.map((c) => c.id)];
      await tx.notification.deleteMany({ where: { recipientId: { in: recipients } } });
      await tx.refreshToken.deleteMany({ where: { OR: [{ userId: id }, { childId: { in: children.map((c) => c.id) } }] } });
      await tx.passwordResetToken.deleteMany({ where: { userId: id } });
      await tx.profile.delete({ where: { id } });
      await tx.user.deleteMany({ where: { id } });
    });
    return { success: true };
  }

  /** Export CSV des familles (séparateur « ; », BOM pour Excel) : pas de données enfants nominatives. */
  async familiesCsv(q: { q?: string; plan?: string; status?: string }) {
    const rows: Awaited<ReturnType<AdminService['families']>>['items'] = [];
    let cursor: string | undefined;
    do {
      const page = await this.families({ ...q, limit: 200, cursor });
      rows.push(...page.items);
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [
      'famille;parent;email;ville;enfants;plan;inscrite le;dernière activité;statut',
      ...rows.map((r) =>
        [r.name, r.parentName, r.email, r.city, r.children, r.planName, r.createdAt?.toISOString().slice(0, 10) ?? "", r.lastActivityAt?.toISOString().slice(0, 10) ?? '', r.statusLabel]
          .map(cell)
          .join(';'),
      ),
    ];
    return '\uFEFF' + lines.join('\n');
  }

  /** Bandeau de la page Partenaires. */
  async partnerStats() {
    const since = new Date(this.clock.now().getTime() - 30 * DAY);
    const [accounts, activeOffers, used, subs] = await Promise.all([
      this.prisma.partner.count(),
      this.prisma.partnerOffer.count({ where: { status: 'published', OR: [{ endsAt: null }, { endsAt: { gt: this.clock.now() } }] } }),
      this.prisma.offerClaim.count({ where: { status: 'redeemed', redeemedAt: { gte: since } } }),
      this.prisma.subscription.findMany({ where: { partnerId: { not: null }, amountCents: { gt: 0 } }, select: { status: true, amountCents: true, billingInterval: true, quantity: true } }),
    ]);
    const mrr = subs
      .filter((s) => subscriptionGrantsAccess(s.status))
      .reduce((sum, s) => sum + monthlyAmountCents(s.amountCents, s.billingInterval as 'month' | 'year', s.quantity), 0);
    return { accounts, activeOffers, vouchersUsed30d: used, partnerMrrCents: mrr };
  }

  // ─── Recherche ⌘K ──────────────────────────────────────────────────────────

  async search(term: string) {
    const q = term.trim();
    if (q.length < 2) return { families: [], activities: [], partners: [] };
    const contains = { contains: q, mode: 'insensitive' as const };
    const [families, activities, partners] = await Promise.all([
      this.prisma.profile.findMany({ where: { role: 'parent', OR: [{ email: contains }, { fullName: contains }] }, take: 5, select: { id: true, email: true, fullName: true, city: true } }),
      this.prisma.activity.findMany({ where: { activityType: { in: ['catalog', 'partner'] }, title: contains }, take: 5, select: { id: true, title: true, catalogStatus: true } }),
      this.prisma.partner.findMany({ where: { name: contains }, take: 5, select: { id: true, name: true, kind: true, status: true } }),
    ]);
    return {
      families: families.map((f) => ({ id: f.id, name: familyName(f.fullName, f.email), subtitle: [f.fullName, f.city].filter(Boolean).join(' · ') })),
      activities,
      partners,
    };
  }

  // ─── Supervision ───────────────────────────────────────────────────────────

  async notificationLog(q: Page & { status?: string; type?: string }) {
    const rows = await this.prisma.notification.findMany({
      where: { ...(q.status ? { status: q.status } : {}), ...(q.type ? { type: q.type } : {}) },
      select: {
        id: true,
        type: true,
        recipientType: true,
        recipientId: true,
        title: true,
        priority: true,
        status: true,
        channels: true,
        scheduledAt: true,
        sentAt: true,
        readAt: true,
        createdAt: true,
        deliveries: { select: { channel: true, status: true, attempts: true, sentCount: true, targetCount: true, lastError: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    return page(rows, q.limit);
  }

  async sendTest(input: { recipientType: 'parent' | 'child'; recipientId: string; title: string; body: string }) {
    return this.prisma.tx((tx) => this.notifications.enqueue(tx, { ...input, type: 'tip', icon: '🔔', route: null, priority: 'normal', channels: ['in_app', 'push'], dedupKey: null }));
  }

  async events(q: Page & { status?: string }) {
    const rows = await this.prisma.outboxEvent.findMany({
      where: q.status ? { status: q.status } : {},
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      include: { processed: { select: { consumer: true, processedAt: true } } },
    });
    return page(
      rows.map(({ seq, ...e }) => ({ ...e, seq: seq.toString() })),
      q.limit,
    );
  }

  async retryEvent(id: string) {
    const e = await this.prisma.outboxEvent.findUnique({ where: { id } });
    if (!e) throw notFound('EVENT_NOT_FOUND', 'Événement introuvable');
    await this.relay.retry(id);
    return { success: true };
  }

  admins() {
    return this.prisma.user.findMany({ where: { role: 'admin' }, select: { id: true, email: true, fullName: true, lastLoginAt: true, disabledAt: true, createdAt: true } });
  }

  async createAdmin(input: { email: string; fullName: string; password: string }) {
    if (await this.prisma.user.findUnique({ where: { email: input.email } })) throw conflict('EMAIL_TAKEN', 'Cet email est déjà utilisé');
    const user = await this.prisma.user.create({
      data: { email: input.email, fullName: input.fullName, role: 'admin', passwordHash: await hashSecret(input.password), emailVerifiedAt: this.clock.now() },
    });
    return { id: user.id, email: user.email, fullName: user.fullName, role: user.role };
  }
}
