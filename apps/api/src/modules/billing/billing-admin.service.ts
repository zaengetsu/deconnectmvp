import { Injectable } from '@nestjs/common';
import { type CreatePromoCodeInput, monthlyAmountCents, subscriptionGrantsAccess, type UpdatePlanInput } from '@rekonect/contracts';
import { Clock } from '../../platform/clock';
import { conflict, notFound } from '../../platform/http/errors';
import { Prisma, PrismaService } from '../../platform/prisma/prisma.service';
import { addMonths, BillingService } from './billing.service';
import { BillingGateway } from './gateway';

const pct = (num: number, den: number) => (den === 0 ? 0 : Math.round((num / den) * 1000) / 10);

/**
 * Pilotage business : plans, codes promo, MRR, conversion, churn, événements d'abonnement.
 */
@Injectable()
export class BillingAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: BillingGateway,
    private readonly billing: BillingService,
    private readonly clock: Clock,
  ) {}

  // ─── Plans ─────────────────────────────────────────────────────────────────

  async plans(audience: 'family' | 'partner') {
    const [plans, subs] = await Promise.all([
      this.prisma.plan.findMany({ where: { audience }, orderBy: { sortOrder: 'asc' } }),
      this.prisma.subscription.findMany({
        where: audience === 'family' ? { parentId: { not: null } } : { partnerId: { not: null } },
        select: { plan: true, status: true, amountCents: true, billingInterval: true, quantity: true, compPlan: true, compUntil: true },
      }),
    ]);
    const now = this.clock.now();
    const totalFamilies = audience === 'family' ? await this.prisma.profile.count({ where: { role: 'parent' } }) : 0;
    return plans.map((plan) => {
      const paying = subs.filter((s) => s.plan === plan.id && subscriptionGrantsAccess(s.status) && s.amountCents > 0);
      const comped = subs.filter((s) => s.compPlan === plan.id && s.compUntil && s.compUntil > now && !(s.plan === plan.id && s.amountCents > 0));
      const mrr = paying.reduce((sum, s) => sum + monthlyAmountCents(s.amountCents, s.billingInterval as 'month' | 'year', s.quantity), 0);
      // « Gratuit » compte toutes les familles sans plan payant ni plan offert.
      const subscribers =
        plan.id === 'free'
          ? Math.max(0, totalFamilies - subs.filter((s) => (s.plan !== 'free' && subscriptionGrantsAccess(s.status)) || (s.compUntil && s.compUntil > now)).length)
          : paying.length + comped.length + subs.filter((s) => s.plan === plan.id && s.amountCents === 0 && subscriptionGrantsAccess(s.status) && audience === 'partner').length;
      return { ...plan, subscribers, compedSubscribers: comped.length, mrrCents: mrr };
    });
  }

  async updatePlan(id: string, input: UpdatePlanInput) {
    const plan = await this.prisma.plan.findUnique({ where: { id } });
    if (!plan) throw notFound('PLAN_NOT_FOUND', 'Plan introuvable');
    const pricesChanged =
      (input.monthlyPriceCents !== undefined && input.monthlyPriceCents !== plan.monthlyPriceCents) ||
      (input.annualPriceCents !== undefined && input.annualPriceCents !== plan.annualPriceCents);
    const updated = await this.prisma.plan.update({
      where: { id },
      data: {
        ...input,
        ...(input.limits ? { limits: { ...(plan.limits as object), ...input.limits } as Prisma.InputJsonValue } : {}),
      },
    });
    // Nouveau montant = nouveau prix Stripe ; les abonnés existants gardent le leur jusqu'au renouvellement.
    if (pricesChanged && this.gateway.enabled) {
      const ids = await this.gateway.syncPlanPrices(updated);
      return this.prisma.plan.update({
        where: { id },
        data: { stripeProductId: ids.productId, stripeMonthlyPriceId: ids.monthlyPriceId, stripeAnnualPriceId: ids.annualPriceId },
      });
    }
    return updated;
  }

  // ─── Codes promo ───────────────────────────────────────────────────────────

  async promoCodes() {
    const rows = await this.prisma.promoCode.findMany({ include: { sponsor: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' } });
    const now = this.clock.now();
    return rows.map((p) => ({
      ...p,
      state: !p.isActive || (p.expiresAt && p.expiresAt <= now) || (p.maxRedemptions != null && p.redemptions >= p.maxRedemptions) ? 'expired' : 'active',
    }));
  }

  async createPromoCode(input: CreatePromoCodeInput) {
    if (await this.prisma.promoCode.findUnique({ where: { code: input.code } })) throw conflict('PROMO_EXISTS', 'Ce code existe déjà');
    let stripe: { couponId: string; promotionCodeId: string } | null = null;
    if ((input.kind === 'percent' || input.kind === 'amount') && this.gateway.enabled) {
      stripe = await this.gateway.createPromotion({
        code: input.code,
        percentOff: input.percentOff,
        amountOffCents: input.amountOffCents,
        durationMonths: input.durationMonths,
        maxRedemptions: input.maxRedemptions,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      });
    }
    return this.prisma.promoCode.create({
      data: {
        ...input,
        startsAt: input.startsAt ? new Date(input.startsAt) : null,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        stripeCouponId: stripe?.couponId ?? null,
        stripePromotionCodeId: stripe?.promotionCodeId ?? null,
      },
    });
  }

  async setPromoActive(id: string, isActive: boolean) {
    const res = await this.prisma.promoCode.updateMany({ where: { id }, data: { isActive } });
    if (res.count === 0) throw notFound('PROMO_NOT_FOUND', 'Code introuvable');
    return { success: true };
  }

  // ─── Indicateurs ───────────────────────────────────────────────────────────

  async overview() {
    const now = this.clock.now();
    const monthAgo = new Date(now.getTime() - 30 * 86_400_000);
    const subs = await this.prisma.subscription.findMany({
      select: { parentId: true, partnerId: true, plan: true, status: true, amountCents: true, billingInterval: true, quantity: true, compPlan: true, compUntil: true },
    });
    const live = subs.filter((s) => subscriptionGrantsAccess(s.status) && s.amountCents > 0);
    const mrr = (list: typeof subs) => list.reduce((sum, s) => sum + monthlyAmountCents(s.amountCents, s.billingInterval as 'month' | 'year', s.quantity), 0);
    const familyMrr = mrr(live.filter((s) => s.parentId));
    const partnerMrr = mrr(live.filter((s) => s.partnerId));

    const families = await this.prisma.profile.count({ where: { role: 'parent' } });
    const payingFamilies = live.filter((s) => s.parentId).length;
    const compFamilies = subs.filter((s) => s.parentId && s.compUntil && s.compUntil > now && !(subscriptionGrantsAccess(s.status) && s.amountCents > 0)).length;
    const canceled30 = await this.prisma.subscriptionEvent.count({ where: { type: 'canceled', parentId: { not: null }, occurredAt: { gte: monthAgo } } });
    const pastDue = subs.filter((s) => s.status === 'past_due').length;

    const byPlan = await this.plans('family');
    const distribution = byPlan.map((p) => ({ planId: p.id, name: p.name, color: p.color, count: p.subscribers, percent: pct(p.subscribers, Math.max(families, 1)) }));

    return {
      mrrCents: familyMrr + partnerMrr,
      familyMrrCents: familyMrr,
      partnerMrrCents: partnerMrr,
      families,
      payingFamilies,
      compFamilies,
      conversionRate: pct(payingFamilies + compFamilies, families),
      churnRate: pct(canceled30, payingFamilies + canceled30),
      failedPayments: pastDue,
      distribution,
    };
  }

  async events(limit = 20) {
    const rows = await this.prisma.subscriptionEvent.findMany({
      orderBy: { occurredAt: 'desc' },
      take: limit,
      include: { parent: { select: { fullName: true, email: true } }, partner: { select: { name: true } } },
    });
    return rows.map((e) => ({
      id: e.id,
      type: e.type,
      description: e.description,
      amountCents: e.amountCents,
      occurredAt: e.occurredAt,
      plan: e.plan,
      who: e.partner?.name ?? (e.parent ? familyName(e.parent.fullName, e.parent.email) : '—'),
    }));
  }

  // ─── Actions support ───────────────────────────────────────────────────────

  async giftMonths(parentId: string, months: number, planId: string) {
    const profile = await this.prisma.profile.findFirst({ where: { id: parentId, role: 'parent' } });
    if (!profile) throw notFound('FAMILY_NOT_FOUND', 'Famille introuvable');
    const plan = await this.prisma.plan.findFirst({ where: { id: planId, audience: 'family' } });
    if (!plan || plan.id === 'free') throw notFound('PLAN_NOT_FOUND', 'Plan introuvable');
    const now = this.clock.now();
    return this.prisma.tx(async (tx) => {
      const sub = await this.billing.subscriptionOf({ kind: 'family', parentId }, tx);
      const base = sub.compUntil && sub.compUntil > now && sub.compPlan === planId ? sub.compUntil : now;
      const compUntil = addMonths(base, months);
      await tx.subscription.update({ where: { id: sub.id }, data: { compPlan: planId, compUntil } });
      await tx.subscriptionEvent.create({
        data: { subscriptionId: sub.id, parentId, type: 'comp_granted', description: `${months} mois ${plan.name} offert${months > 1 ? 's' : ''} par le support`, plan: planId, occurredAt: now },
      });
      return { compPlan: planId, compUntil };
    });
  }

  async payments(parentId: string) {
    const [invoices, events] = await Promise.all([
      this.prisma.invoice.findMany({ where: { parentId }, orderBy: { issuedAt: 'desc' } }),
      this.prisma.subscriptionEvent.findMany({ where: { parentId }, orderBy: { occurredAt: 'desc' } }),
    ]);
    return { invoices, events };
  }
}

/** « Famille Dupont » à partir du nom du parent (ou de l'email à défaut). */
export function familyName(fullName: string | null, email: string): string {
  const name = fullName?.trim();
  if (name) {
    const parts = name.split(/\s+/);
    return `Famille ${parts.length > 1 ? parts[parts.length - 1] : parts[0]}`;
  }
  return `Famille ${email.split('@')[0]}`;
}
