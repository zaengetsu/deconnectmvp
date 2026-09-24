import { Injectable } from '@nestjs/common';
import { formatEuros } from '@rekonect/contracts';
import { Clock } from '../../platform/clock';
import type { EmailCategory, EmailData, EmailTemplateId, PeriodStats } from '../../platform/mail/catalog';
import { EMAILS } from '../../platform/mail/catalog';
import { EmailService } from '../../platform/mail/email.service';
import { PrismaService } from '../../platform/prisma/prisma.service';
import { addDays, isoToDateColumn, isoWeekKey, localDateString, zonedTimeToUtc } from '../../platform/time';
import { adminContacts, dayLabel, minutesLabel, monthLabel, parentAccepts, parentContact, partnerContacts, percentLabel, sinceLabel } from './recipients';

const TZ = 'Europe/Paris';
const DAY = 86_400_000;

/** Seuils des relances planifiées (modifiables sans toucher aux modèles). */
export const EMAIL_RULES = {
  offerExpiringDays: 7,
  voucherExpiringDays: 3,
  rewardWaitingHours: 48,
  trialEndingDays: 3,
  partnerOnboardingAfterDays: 3,
  partnerNoLiveOfferDays: 14,
  parentInactiveDays: 14,
  /** Une relance « inactivité » au plus tous les 30 jours. */
  parentInactiveEveryDays: 30,
};

const startOfDay = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return zonedTimeToUtc(y, m, d, 0, 0, TZ);
};

/**
 * Emails planifiés (worker) : bilans, échéances, relances douces. Tous idempotents :
 * la clé de déduplication contient la période ou l'objet concerné, un job relancé n'envoie rien de plus.
 */
@Injectable()
export class EmailJobs {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emails: EmailService,
    private readonly clock: Clock,
  ) {}

  private async toParent<T extends EmailTemplateId>(parentId: string, template: T, data: EmailData<T>, dedupKey: string): Promise<boolean> {
    const c = await parentContact(this.prisma, parentId);
    if (!c || !parentAccepts(c, EMAILS[template].category as EmailCategory)) return false;
    const res = await this.emails.queue(this.prisma, template, { to: c.email, toName: c.name, recipientId: c.id, data, dedupKey });
    return res.status === 'pending';
  }

  private async toPartner<T extends EmailTemplateId>(partnerId: string, roles: string[], template: T, data: EmailData<T>, dedupKey: string): Promise<number> {
    let n = 0;
    for (const c of await partnerContacts(this.prisma, partnerId, roles)) {
      const res = await this.emails.queue(this.prisma, template, { to: c.email, toName: c.name, recipientId: c.id, data, dedupKey: `${dedupKey}:${c.email}` });
      if (res.status === 'pending') n++;
    }
    return n;
  }

  // ─── Quotidien ─────────────────────────────────────────────────────────────

  async daily(): Promise<Record<string, number>> {
    return {
      offersExpiring: await this.offersExpiring(),
      vouchersExpiring: await this.vouchersExpiring(),
      rewardsWaiting: await this.rewardsWaiting(),
      trialsEnding: await this.trialsEnding(),
      partnerOnboarding: await this.partnerOnboarding(),
      parentInactive: await this.parentInactive(),
    };
  }

  async offersExpiring(): Promise<number> {
    const now = this.clock.now();
    const offers = await this.prisma.partnerOffer.findMany({
      where: { status: 'published', endsAt: { gt: now, lte: new Date(now.getTime() + EMAIL_RULES.offerExpiringDays * DAY) } },
      select: { id: true, title: true, partnerId: true, endsAt: true, _count: { select: { claims: true } } },
    });
    let n = 0;
    for (const o of offers) {
      n += await this.toPartner(o.partnerId, ['owner', 'editor'], 'partner.offer_expiring', { offerTitle: o.title, offerId: o.id, endLabel: dayLabel(o.endsAt!), unlocked: o._count.claims }, `offer_expiring:${o.id}:${o.endsAt!.toISOString()}`);
    }
    return n;
  }

  async vouchersExpiring(): Promise<number> {
    const now = this.clock.now();
    const claims = await this.prisma.offerClaim.findMany({
      where: { status: 'unlocked', expiresAt: { gt: now, lte: new Date(now.getTime() + EMAIL_RULES.voucherExpiringDays * DAY) }, offer: { kind: 'parent_voucher' } },
      select: { id: true, parentId: true, expiresAt: true, offer: { select: { title: true, partner: { select: { name: true } } } } },
    });
    let n = 0;
    for (const c of claims) {
      if (await this.toParent(c.parentId, 'parent.voucher_expiring', { partnerName: c.offer.partner.name, offerTitle: c.offer.title, expiresLabel: dayLabel(c.expiresAt!), claimId: c.id }, `voucher_expiring:${c.id}`)) n++;
    }
    return n;
  }

  /** Récompense en attente depuis 48 h : le push est déjà parti, l'email est le dernier rappel. */
  async rewardsWaiting(): Promise<number> {
    const now = this.clock.now();
    const rows = await this.prisma.rewardRequest.findMany({
      where: { status: 'pending', requestedAt: { lte: new Date(now.getTime() - EMAIL_RULES.rewardWaitingHours * 3_600_000) }, child: { isActive: true } },
      select: { id: true, requestedAt: true, reward: { select: { title: true } }, child: { select: { displayName: true, parentId: true } } },
    });
    let n = 0;
    for (const r of rows) {
      if (await this.toParent(r.child.parentId, 'parent.reward_waiting', { childName: r.child.displayName, rewardTitle: r.reward.title, since: sinceLabel(r.requestedAt ?? now, now) }, `reward_waiting:${r.id}`)) n++;
    }
    return n;
  }

  async trialsEnding(): Promise<number> {
    const now = this.clock.now();
    const subs = await this.prisma.subscription.findMany({
      where: { status: 'trialing', cancelAtPeriodEnd: false, currentPeriodEnd: { gt: now, lte: new Date(now.getTime() + EMAIL_RULES.trialEndingDays * DAY) } },
      include: { planRef: { select: { name: true } }, partner: { select: { name: true } } },
    });
    let n = 0;
    for (const s of subs) {
      const endLabel = dayLabel(s.currentPeriodEnd!);
      const key = `trial_ending:${s.id}:${s.currentPeriodEnd!.toISOString().slice(0, 10)}`;
      if (s.parentId) {
        const amountLabel = `${formatEuros(s.amountCents, { decimals: 'always' })} ${s.billingInterval === 'year' ? 'par an' : 'par mois'}`;
        if (await this.toParent(s.parentId, 'parent.trial_ending', { planName: s.planRef.name, endLabel, amountLabel }, key)) n++;
      } else if (s.partnerId && s.partner) {
        n += await this.toPartner(s.partnerId, ['owner'], 'partner.trial_ending', { partnerName: s.partner.name, planName: s.planRef.name, endLabel }, key);
      }
    }
    return n;
  }

  /** Partenaire inscrit depuis quelques jours sans lieu géolocalisé ou sans offre : un rappel, une seule fois. */
  async partnerOnboarding(): Promise<number> {
    const before = new Date(this.clock.now().getTime() - EMAIL_RULES.partnerOnboardingAfterDays * DAY);
    const partners = await this.prisma.partner.findMany({
      where: { status: { in: ['onboarding', 'active', 'trial'] }, createdAt: { lte: before }, members: { some: { status: 'active', role: 'owner' } } },
      select: {
        id: true,
        name: true,
        parentPartnerId: true,
        _count: { select: { offers: true, places: { where: { isActive: true, latitude: { not: null } } } } },
      },
    });
    let n = 0;
    for (const p of partners) {
      const missing: string[] = [];
      if (p._count.places === 0 && !p.parentPartnerId) missing.push('Ajouter l’adresse d’au moins un lieu, pour toucher les familles proches');
      if (p._count.offers === 0) missing.push('Créer votre première offre (relue par l’équipe Rekonect sous 48 h)');
      if (missing.length === 0) continue;
      n += await this.toPartner(p.id, ['owner'], 'partner.onboarding_incomplete', { partnerName: p.name, missing }, `onboarding:${p.id}`);
    }
    return n;
  }

  /** Aucune activité validée depuis 14 jours dans une famille qui en avait : une relance douce par mois au plus. */
  async parentInactive(): Promise<number> {
    const now = this.clock.now();
    const since = new Date(now.getTime() - EMAIL_RULES.parentInactiveDays * DAY);
    const rows = await this.prisma.$queryRaw<{ parent_id: string; last: Date }[]>`
      SELECT c.parent_id, max(ca.validated_at) AS last
      FROM child_activities ca JOIN children c ON c.id = ca.child_id
      WHERE ca.status = 'validated' AND c.is_active = true
      GROUP BY c.parent_id
      HAVING max(ca.validated_at) < ${since}`;
    let n = 0;
    for (const r of rows) {
      const recent = await this.prisma.emailMessage.findFirst({
        where: { template: 'parent.inactive_nudge', recipientId: r.parent_id, createdAt: { gt: new Date(now.getTime() - EMAIL_RULES.parentInactiveEveryDays * DAY) } },
        select: { id: true },
      });
      if (recent) continue;
      const children = await this.prisma.child.findMany({ where: { parentId: r.parent_id, isActive: true }, select: { displayName: true, age: true } });
      if (children.length === 0) continue;
      const age = Math.min(...children.map((c) => c.age ?? 10));
      const idea = await this.prisma.activity.findFirst({
        where: { isActive: true, isPublic: true, catalogStatus: 'published', minAge: { lte: age }, maxAge: { gte: age }, durationMinutes: { lte: 30 } },
        orderBy: { createdAt: 'asc' },
        select: { title: true, durationMinutes: true },
      });
      const days = Math.floor((now.getTime() - new Date(r.last).getTime()) / DAY);
      const ideaLabel = idea ? `${idea.title}${idea.durationMinutes ? ` (${idea.durationMinutes} min)` : ''}` : null;
      if (await this.toParent(r.parent_id, 'parent.inactive_nudge', { childNames: children.map((c) => c.displayName), days, idea: ideaLabel }, `inactive:${r.parent_id}:${localDateString(now, TZ).slice(0, 7)}`)) n++;
    }
    return n;
  }

  // ─── Bilans ────────────────────────────────────────────────────────────────

  /** Chiffres d'un partenaire (et de ses magasins) sur une période. */
  async partnerStats(partnerId: string, from: Date, to: Date): Promise<PeriodStats> {
    const stores = await this.prisma.partner.findMany({ where: { parentPartnerId: partnerId }, select: { id: true } });
    const ids = [partnerId, ...stores.map((s) => s.id)];
    const fromDay = isoToDateColumn(localDateString(from, TZ));
    const toDay = isoToDateColumn(localDateString(new Date(to.getTime() - 1), TZ));
    const metrics = await this.prisma.offerMetricDaily.groupBy({
      by: ['offerId'],
      where: { day: { gte: fromDay, lte: toDay }, offer: { partnerId: { in: ids } } },
      _sum: { views: true, unlocks: true, redemptions: true },
    });
    const sum = (k: 'views' | 'unlocks' | 'redemptions') => metrics.reduce((s, m) => s + (m._sum[k] ?? 0), 0);
    const top = [...metrics].sort((a, b) => (b._sum.unlocks ?? 0) - (a._sum.unlocks ?? 0))[0];
    const topOffer = top && (top._sum.unlocks ?? 0) > 0 ? (await this.prisma.partnerOffer.findUnique({ where: { id: top.offerId }, select: { title: true } }))?.title ?? null : null;
    const basket = await this.prisma.offerClaim.aggregate({
      where: { redeemedAt: { gte: from, lt: to }, basketAmountCents: { not: null }, offer: { partnerId: { in: ids } } },
      _avg: { basketAmountCents: true },
    });
    const unlocked = sum('unlocks');
    const redeemed = sum('redemptions');
    return {
      impressions: sum('views'),
      unlocked,
      redeemed,
      redemptionRate: `${percentLabel(redeemed, unlocked)} d’utilisation`,
      basketLabel: basket._avg.basketAmountCents != null ? formatEuros(Math.round(basket._avg.basketAmountCents), { decimals: 'always' }) : null,
      topOffer,
    };
  }

  private async reportablePartners() {
    return this.prisma.partner.findMany({
      where: { status: { in: ['active', 'trial'] }, parentPartnerId: null, members: { some: { status: 'active' } } },
      select: { id: true, name: true, createdAt: true },
    });
  }

  /** Lundi matin : la semaine écoulée. Pas d'email si rien ne s'est passé et qu'aucune offre n'est en ligne. */
  async partnerWeekly(): Promise<number> {
    const now = this.clock.now();
    const today = localDateString(now, TZ);
    const to = startOfDay(today);
    const from = startOfDay(addDays(today, -7));
    const week = isoWeekKey(addDays(today, -1));
    let n = 0;
    for (const p of await this.reportablePartners()) {
      const [stats, liveOffers] = await Promise.all([this.partnerStats(p.id, from, to), this.prisma.partnerOffer.count({ where: { partnerId: p.id, status: 'published' } })]);
      if (stats.impressions + stats.unlocked + stats.redeemed === 0) {
        n += await this.noLiveOffer(p, liveOffers, week);
        continue;
      }
      const tip =
        liveOffers === 0
          ? 'Vous n’avez plus d’offre en ligne : relancez-en une pour rester visible.'
          : stats.unlocked > 0 && stats.redeemed === 0
            ? 'Des familles ont obtenu vos bons mais ne sont pas encore venues : un rappel en caisse ou sur vos réseaux peut aider.'
            : null;
      n += await this.toPartner(p.id, ['owner', 'editor', 'viewer'], 'partner.weekly_report', { partnerName: p.name, weekLabel: `Semaine du ${dayLabel(from)}`, stats, liveOffers, tip }, `partner_weekly:${p.id}:${week}`);
    }
    return n;
  }

  /** Relance « aucune offre en ligne » : toutes les deux semaines au plus. */
  private async noLiveOffer(p: { id: string; name: string; createdAt: Date }, liveOffers: number, week: string): Promise<number> {
    if (liveOffers > 0) return 0;
    const now = this.clock.now();
    const last = await this.prisma.partnerOffer.findFirst({ where: { partnerId: p.id }, orderBy: { updatedAt: 'desc' }, select: { title: true, updatedAt: true } });
    const since = last?.updatedAt ?? p.createdAt;
    const days = Math.floor((now.getTime() - since.getTime()) / DAY);
    if (days < EMAIL_RULES.partnerNoLiveOfferDays || !last) return 0;
    const [, w] = week.split('-W').map(Number);
    return this.toPartner(p.id, ['owner', 'editor'], 'partner.no_live_offer', { partnerName: p.name, days, lastOffer: last.title }, `no_live_offer:${p.id}:${week.slice(0, 5)}${Math.floor(w / 2)}`);
  }

  /** Le 1er du mois : le mois écoulé, avec l'évolution. */
  async partnerMonthly(): Promise<number> {
    const now = this.clock.now();
    const today = localDateString(now, TZ);
    const [y, m] = today.split('-').map(Number);
    const to = zonedTimeToUtc(y, m, 1, 0, 0, TZ);
    const from = zonedTimeToUtc(m === 1 ? y - 1 : y, m === 1 ? 12 : m - 1, 1, 0, 0, TZ);
    const before = zonedTimeToUtc(m <= 2 ? y - 1 : y, ((m + 9) % 12) + 1, 1, 0, 0, TZ);
    const label = monthLabel(from);
    let n = 0;
    for (const p of await this.reportablePartners()) {
      const [stats, prev] = await Promise.all([this.partnerStats(p.id, from, to), this.partnerStats(p.id, before, from)]);
      if (stats.impressions + stats.unlocked + stats.redeemed === 0) continue;
      n += await this.toPartner(p.id, ['owner', 'editor', 'viewer'], 'partner.monthly_report', { partnerName: p.name, monthLabel: label, stats, previousUnlocked: prev.unlocked }, `partner_monthly:${p.id}:${localDateString(from, TZ).slice(0, 7)}`);
    }
    return n;
  }

  /** Données du bilan famille sur une période. */
  private async familyPeriod(parentId: string, from: Date, to: Date) {
    const rows = await this.prisma.childActivity.findMany({
      where: { status: 'validated', validatedAt: { gte: from, lt: to }, child: { parentId, isActive: true } },
      select: { earnedPoints: true, childId: true, activity: { select: { durationMinutes: true } }, child: { select: { displayName: true } } },
    });
    const byChild = new Map<string, { name: string; activities: number; minutes: number; points: number }>();
    for (const r of rows) {
      const c = byChild.get(r.childId) ?? { name: r.child.displayName, activities: 0, minutes: 0, points: 0 };
      c.activities++;
      c.minutes += r.activity.durationMinutes ?? 0;
      c.points += r.earnedPoints ?? 0;
      byChild.set(r.childId, c);
    }
    const children = [...byChild.values()].sort((a, b) => b.activities - a.activities);
    return {
      children,
      activities: rows.length,
      minutes: children.reduce((s, c) => s + c.minutes, 0),
      points: children.reduce((s, c) => s + c.points, 0),
    };
  }

  /** Dimanche soir : le bilan détaillé de la semaine (le push court part via DigestService). */
  async parentWeekly(): Promise<number> {
    const parents = await this.prisma.notificationPreference.findMany({ where: { childId: null, weeklySummary: true, emailEnabled: true }, select: { parentId: true, timezone: true } });
    let n = 0;
    for (const { parentId, timezone } of parents) {
      const today = localDateString(this.clock.now(), timezone);
      const [y, m, d] = addDays(today, 1).split('-').map(Number);
      const to = zonedTimeToUtc(y, m, d, 0, 0, timezone);
      const from = startOfDay(addDays(today, -6));
      const period = await this.familyPeriod(parentId, from, to);
      if (period.activities === 0) continue;
      const pendingRewards = await this.prisma.rewardRequest.count({ where: { status: 'pending', child: { parentId } } });
      const best = period.children[0];
      const highlight = period.children.length > 1 && best ? `Bravo à ${best.name}, le plus actif de la semaine avec ${best.activities} activités !` : best && best.activities >= 3 ? `${best.name} a fait ${best.activities} activités cette semaine. Belle régularité !` : null;
      if (
        await this.toParent(
          parentId,
          'parent.weekly_report',
          { weekLabel: `Semaine du ${dayLabel(from)}`, activities: period.activities, minutesLabel: minutesLabel(period.minutes), points: period.points, pendingRewards, children: period.children, highlight },
          `parent_weekly:${parentId}:${isoWeekKey(today)}`,
        )
      )
        n++;
    }
    return n;
  }

  async parentMonthly(): Promise<number> {
    const now = this.clock.now();
    const today = localDateString(now, TZ);
    const [y, m] = today.split('-').map(Number);
    const to = zonedTimeToUtc(y, m, 1, 0, 0, TZ);
    const from = zonedTimeToUtc(m === 1 ? y - 1 : y, m === 1 ? 12 : m - 1, 1, 0, 0, TZ);
    const before = zonedTimeToUtc(m <= 2 ? y - 1 : y, ((m + 9) % 12) + 1, 1, 0, 0, TZ);
    const parents = await this.prisma.notificationPreference.findMany({ where: { childId: null, weeklySummary: true, emailEnabled: true }, select: { parentId: true } });
    let n = 0;
    for (const { parentId } of parents) {
      const period = await this.familyPeriod(parentId, from, to);
      if (period.activities === 0) continue;
      const [prev, rewards] = await Promise.all([
        this.familyPeriod(parentId, before, from),
        this.prisma.rewardRequest.count({ where: { status: { in: ['approved', 'completed'] }, approvedAt: { gte: from, lt: to }, child: { parentId } } }),
      ]);
      const trend = prev.activities > 0 && period.activities > prev.activities ? `En progrès : ${period.activities - prev.activities} activités de plus que le mois précédent.` : null;
      if (
        await this.toParent(
          parentId,
          'parent.monthly_report',
          { monthLabel: monthLabel(from), activities: period.activities, minutesLabel: minutesLabel(period.minutes), points: period.points, rewards, children: period.children, trend },
          `parent_monthly:${parentId}:${localDateString(from, TZ).slice(0, 7)}`,
        )
      )
        n++;
    }
    return n;
  }

  /** Point du jour pour l'équipe Rekonect : seulement s'il y a quelque chose à traiter ou à savoir. */
  async adminDigest(): Promise<number> {
    const now = this.clock.now();
    const since = new Date(now.getTime() - DAY);
    const [pendingOffers, openReports, newFamilies, paymentFailures, activitiesValidated] = await Promise.all([
      this.prisma.partnerOffer.count({ where: { status: 'pending_review' } }),
      this.prisma.activityReport.count({ where: { resolvedAt: null } }),
      this.prisma.profile.count({ where: { role: 'parent', createdAt: { gte: since } } }),
      this.prisma.subscriptionEvent.count({ where: { type: 'payment_failed', occurredAt: { gte: since } } }),
      this.prisma.childActivity.count({ where: { status: 'validated', validatedAt: { gte: since } } }),
    ]);
    if (pendingOffers + openReports + newFamilies + paymentFailures + activitiesValidated === 0) return 0;
    const day = localDateString(now, TZ);
    let n = 0;
    for (const a of await adminContacts(this.prisma)) {
      const res = await this.emails.queue(this.prisma, 'admin.daily_digest', {
        to: a.email,
        toName: a.name,
        recipientId: a.id,
        data: { dateLabel: dayLabel(now), pendingOffers, openReports, newFamilies, paymentFailures, activitiesValidated },
        dedupKey: `admin_digest:${day}:${a.email}`,
      });
      if (res.status === 'pending') n++;
    }
    return n;
  }
}
