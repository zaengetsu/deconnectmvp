import { Inject, Injectable } from '@nestjs/common';
import { type CheckoutInput, monthlyAmountCents } from '@rekonect/contracts';
import { ENV, type Env } from '../../config/env';
import { AccessService } from '../../platform/auth/access.service';
import type { Principal, UserPrincipal } from '../../platform/auth/principal';
import { Clock } from '../../platform/clock';
import { badRequest, conflict, DomainError, forbidden, notFound } from '../../platform/http/errors';
import { PrismaService, type Tx } from '../../platform/prisma/prisma.service';
import { EntitlementsService } from './entitlements.service';
import { BillingGateway } from './gateway';
import { HttpStatus } from '@nestjs/common';

export type BillingOwner = { kind: 'family'; parentId: string } | { kind: 'partner'; partnerId: string };

const ownerWhere = (o: BillingOwner) => (o.kind === 'family' ? { parentId: o.parentId } : { partnerId: o.partnerId });

const MONTHS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export function monthLabel(d: Date): string {
  const m = MONTHS_FR[d.getUTCMonth()];
  return `${m.charAt(0).toUpperCase()}${m.slice(1)} ${d.getUTCFullYear()}`;
}

export function addMonths(d: Date, months: number): Date {
  const r = new Date(d);
  r.setUTCMonth(r.getUTCMonth() + months);
  return r;
}

const paymentsDisabled = () => new DomainError(HttpStatus.SERVICE_UNAVAILABLE, 'BILLING_DISABLED', 'Le paiement en ligne n’est pas encore activé.');

/**
 * Abonnements des familles et des partenaires : Stripe est la source de vérité des paiements,
 * la table subscriptions en est le miroir (synchronisé par webhooks) et porte les droits.
 */
@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: BillingGateway,
    private readonly entitlements: EntitlementsService,
    private readonly access: AccessService,
    private readonly clock: Clock,
    @Inject(ENV) private readonly env: Env,
  ) {}

  // ─── Qui paie ? ────────────────────────────────────────────────────────────

  async ownerFor(p: Principal, partnerId?: string): Promise<BillingOwner> {
    if (partnerId) {
      await this.access.assertPartnerMember(p, partnerId, 'owner');
      const partner = await this.prisma.partner.findUniqueOrThrow({ where: { id: partnerId } });
      if (partner.parentPartnerId) throw forbidden('BILLED_BY_NETWORK', `La facturation est gérée par l'enseigne.`);
      return { kind: 'partner', partnerId };
    }
    const parent = this.access.requireParent(p);
    return { kind: 'family', parentId: parent.userId };
  }

  async subscriptionOf(owner: BillingOwner, db: Tx | PrismaService = this.prisma) {
    const existing = await db.subscription.findFirst({ where: ownerWhere(owner) });
    if (existing) return existing;
    return db.subscription.create({
      data: { ...ownerWhere(owner), plan: owner.kind === 'family' ? 'free' : 'partner_local', status: owner.kind === 'family' ? 'active' : 'trialing' },
    });
  }

  private async ensureCustomer(owner: BillingOwner): Promise<string> {
    const sub = await this.subscriptionOf(owner);
    if (sub.stripeCustomerId) return sub.stripeCustomerId;
    let email: string;
    let name: string | null;
    if (owner.kind === 'family') {
      const profile = await this.prisma.profile.findUniqueOrThrow({ where: { id: owner.parentId } });
      [email, name] = [profile.email, profile.fullName];
    } else {
      const partner = await this.prisma.partner.findUniqueOrThrow({ where: { id: owner.partnerId }, include: { members: { where: { role: 'owner', status: 'active' }, take: 1 } } });
      [email, name] = [partner.contactEmail ?? partner.members[0]?.email ?? '', partner.name];
    }
    const customerId = await this.gateway.createCustomer({ email, name, metadata: { ownerKind: owner.kind, ownerId: owner.kind === 'family' ? owner.parentId : owner.partnerId } });
    await this.prisma.subscription.update({ where: { id: sub.id }, data: { stripeCustomerId: customerId } });
    return customerId;
  }

  /** Crée les prix Stripe manquants d'un plan (au premier achat ou après modification par l'admin). */
  async ensurePrices(planId: string) {
    const plan = await this.prisma.plan.findUnique({ where: { id: planId } });
    if (!plan || !plan.isActive) throw notFound('PLAN_NOT_FOUND', 'Plan introuvable');
    if (plan.stripeProductId && (plan.monthlyPriceCents == null || plan.stripeMonthlyPriceId) && (plan.annualPriceCents == null || plan.stripeAnnualPriceId)) return plan;
    const ids = await this.gateway.syncPlanPrices(plan);
    return this.prisma.plan.update({
      where: { id: planId },
      data: { stripeProductId: ids.productId, stripeMonthlyPriceId: ids.monthlyPriceId, stripeAnnualPriceId: ids.annualPriceId },
    });
  }

  // ─── Lecture ───────────────────────────────────────────────────────────────

  async plans(audience: 'family' | 'partner') {
    const rows = await this.prisma.plan.findMany({ where: { audience, isActive: true, isPublic: true }, orderBy: { sortOrder: 'asc' } });
    return rows.map(({ stripeProductId: _p, stripeMonthlyPriceId: _m, stripeAnnualPriceId: _a, ...plan }) => plan);
  }

  async summary(owner: BillingOwner) {
    const sub = await this.subscriptionOf(owner);
    const plan = owner.kind === 'family' ? await this.entitlements.familyPlan(owner.parentId) : await this.entitlements.partnerPlan(owner.partnerId);
    const planRow = await this.prisma.plan.findUniqueOrThrow({ where: { id: plan.planId } });
    const usage = owner.kind === 'family' ? await this.entitlements.familyUsage(owner.parentId) : await this.partnerUsage(owner.partnerId);
    return {
      plan: { id: planRow.id, name: planRow.name, color: planRow.color, monthlyPriceCents: planRow.monthlyPriceCents, annualPriceCents: planRow.annualPriceCents, features: planRow.features },
      limits: plan.limits,
      usage,
      source: plan.source,
      status: sub.status,
      interval: sub.billingInterval,
      amountCents: sub.amountCents,
      monthlyAmountCents: sub.plan === plan.planId ? monthlyAmountCents(sub.amountCents, sub.billingInterval as 'month' | 'year', sub.quantity) : 0,
      currentPeriodEnd: sub.currentPeriodEnd,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      compUntil: sub.compUntil && sub.compUntil > this.clock.now() ? sub.compUntil : null,
      hasPaymentMethod: !!sub.stripeSubscriptionId,
      paymentsEnabled: this.gateway.enabled,
    };
  }

  async partnerUsage(partnerId: string) {
    const [places, activeOffers, stores] = await Promise.all([
      this.prisma.partnerPlace.count({ where: { partnerId, isActive: true } }),
      this.prisma.partnerOffer.count({ where: { partnerId, status: { in: ['pending_brand', 'pending_review', 'published', 'paused'] } } }),
      this.prisma.partner.count({ where: { parentPartnerId: partnerId } }),
    ]);
    const licenses = await this.prisma.promoCode.aggregate({ _sum: { redemptions: true, maxRedemptions: true }, where: { sponsorPartnerId: partnerId, kind: 'sponsored' } });
    return { places, activeOffers, stores, licensesUsed: licenses._sum.redemptions ?? 0, licensesTotal: licenses._sum.maxRedemptions ?? 0 };
  }

  invoices(owner: BillingOwner) {
    return this.prisma.invoice.findMany({ where: ownerWhere(owner), orderBy: { issuedAt: 'desc' }, take: 24 });
  }

  // ─── Actions ───────────────────────────────────────────────────────────────

  private returnUrls(owner: BillingOwner) {
    const base = owner.kind === 'family' ? `${this.env.MOBILE_APP_URL.replace(/\/$/, '')}/parent/subscription` : `${this.env.WEB_PARTNERS_URL.replace(/\/$/, '')}/billing`;
    return { success: `${base}?checkout=success`, cancel: `${base}?checkout=cancel`, portal: base };
  }

  async checkout(owner: BillingOwner, input: CheckoutInput) {
    if (!this.gateway.enabled) throw paymentsDisabled();
    const plan = await this.ensurePrices(input.planId);
    if (plan.audience !== owner.kind) throw badRequest('PLAN_AUDIENCE', 'Ce plan ne correspond pas à ce compte');
    const priceId = input.interval === 'year' ? plan.stripeAnnualPriceId : plan.stripeMonthlyPriceId;
    if (!priceId) throw badRequest('PLAN_NOT_PURCHASABLE', plan.monthlyPriceCents == null ? 'Ce plan est proposé sur devis : contactez-nous.' : 'Ce plan est gratuit');
    const sub = await this.subscriptionOf(owner);
    if (sub.stripeSubscriptionId && sub.status !== 'cancelled') throw conflict('ALREADY_SUBSCRIBED', 'Un abonnement est déjà actif : changez de plan depuis votre abonnement.');

    let promotionCodeId: string | null = null;
    if (input.promoCode) {
      const promo = await this.findUsablePromo(input.promoCode);
      if (!['percent', 'amount'].includes(promo.kind)) throw badRequest('PROMO_NOT_DISCOUNT', 'Ce code s’active depuis « J’ai un code », sans paiement.');
      if (promo.planId && promo.planId !== plan.id) throw badRequest('PROMO_PLAN', 'Ce code ne s’applique pas à ce plan');
      promotionCodeId = promo.stripePromotionCodeId;
    }
    const customerId = await this.ensureCustomer(owner);
    const urls = this.returnUrls(owner);
    const session = await this.gateway.createCheckout({
      customerId,
      priceId,
      successUrl: urls.success,
      cancelUrl: urls.cancel,
      promotionCodeId,
      metadata: {
        ownerKind: owner.kind,
        ownerId: owner.kind === 'family' ? owner.parentId : owner.partnerId,
        planId: plan.id,
        interval: input.interval,
      },
    });
    return { url: session.url };
  }

  async portal(owner: BillingOwner) {
    if (!this.gateway.enabled) throw paymentsDisabled();
    const customerId = await this.ensureCustomer(owner);
    return this.gateway.createPortal({ customerId, returnUrl: this.returnUrls(owner).portal });
  }

  /** Changement de plan sur un abonnement existant (prorata calculé par Stripe). */
  async changePlan(owner: BillingOwner, input: CheckoutInput) {
    const sub = await this.subscriptionOf(owner);
    if (!sub.stripeSubscriptionId || sub.status === 'cancelled') return this.checkout(owner, input);
    const plan = await this.ensurePrices(input.planId);
    if (plan.audience !== owner.kind) throw badRequest('PLAN_AUDIENCE', 'Ce plan ne correspond pas à ce compte');
    const priceId = input.interval === 'year' ? plan.stripeAnnualPriceId : plan.stripeMonthlyPriceId;
    if (!priceId) throw badRequest('PLAN_NOT_PURCHASABLE', 'Pour revenir au plan gratuit, résiliez votre abonnement.');
    const updated = await this.gateway.changePlan(sub.stripeSubscriptionId, priceId);
    await this.prisma.subscription.update({
      where: { id: sub.id },
      data: { plan: plan.id, stripePriceId: priceId, billingInterval: updated.interval, amountCents: updated.amountCents, cancelAtPeriodEnd: false },
    });
    return this.summary(owner);
  }

  async cancel(owner: BillingOwner, reason?: string) {
    const sub = await this.subscriptionOf(owner);
    if (!sub.stripeSubscriptionId) throw badRequest('NO_SUBSCRIPTION', 'Aucun abonnement payant à résilier');
    await this.gateway.setCancelAtPeriodEnd(sub.stripeSubscriptionId, true);
    await this.prisma.subscription.update({ where: { id: sub.id }, data: { cancelAtPeriodEnd: true, cancelReason: reason ?? null } });
    await this.prisma.subscriptionEvent.create({
      data: { subscriptionId: sub.id, ...ownerWhere(owner), type: 'cancel_scheduled', description: reason ? `Résiliation programmée · « ${reason} »` : 'Résiliation programmée', plan: sub.plan, occurredAt: this.clock.now() },
    });
    return this.summary(owner);
  }

  async resume(owner: BillingOwner) {
    const sub = await this.subscriptionOf(owner);
    if (!sub.stripeSubscriptionId || !sub.cancelAtPeriodEnd) throw badRequest('NOTHING_TO_RESUME', 'Aucune résiliation en cours');
    await this.gateway.setCancelAtPeriodEnd(sub.stripeSubscriptionId, false);
    await this.prisma.subscription.update({ where: { id: sub.id }, data: { cancelAtPeriodEnd: false, cancelReason: null } });
    await this.prisma.subscriptionEvent.create({
      data: { subscriptionId: sub.id, ...ownerWhere(owner), type: 'reactivated', description: 'Résiliation annulée', plan: sub.plan, occurredAt: this.clock.now() },
    });
    return this.summary(owner);
  }

  // ─── Codes ─────────────────────────────────────────────────────────────────

  async findUsablePromo(code: string) {
    const now = this.clock.now();
    const promo = await this.prisma.promoCode.findUnique({ where: { code: code.trim().toUpperCase() } });
    if (!promo || !promo.isActive || (promo.startsAt && promo.startsAt > now) || (promo.expiresAt && promo.expiresAt <= now)) {
      throw badRequest('PROMO_INVALID', 'Code invalide ou expiré');
    }
    if (promo.maxRedemptions != null && promo.redemptions >= promo.maxRedemptions) throw badRequest('PROMO_EXHAUSTED', 'Ce code a atteint son nombre maximal d’utilisations');
    return promo;
  }

  /**
   * « J'ai un code » : mois offerts (NOEL25) ou licences payées par un partenaire (CSE-AIRBUS).
   * Une remise (RENTREE26) est seulement vérifiée ici puis appliquée au paiement.
   */
  async redeem(p: UserPrincipal, code: string) {
    const promo = await this.findUsablePromo(code);
    if (promo.kind === 'percent' || promo.kind === 'amount') {
      return { kind: 'discount' as const, code: promo.code, description: promo.description, percentOff: promo.percentOff, amountOffCents: promo.amountOffCents, planId: promo.planId };
    }
    const now = this.clock.now();
    return this.prisma.tx(async (tx) => {
      const used = await tx.promoRedemption.findUnique({ where: { promoCodeId_parentId: { promoCodeId: promo.id, parentId: p.userId } } });
      if (used) throw conflict('PROMO_ALREADY_USED', 'Vous avez déjà utilisé ce code');
      // Verrou + compteur dans la même transaction : pas de dépassement du nombre de licences.
      const updated = await tx.$executeRaw`
        UPDATE promo_codes SET redemptions = redemptions + 1
        WHERE id = ${promo.id}::uuid AND (max_redemptions IS NULL OR redemptions < max_redemptions)`;
      if (updated === 0) throw badRequest('PROMO_EXHAUSTED', 'Ce code a atteint son nombre maximal d’utilisations');
      await tx.promoRedemption.create({ data: { promoCodeId: promo.id, parentId: p.userId, redeemedAt: now } });

      const sub = await this.subscriptionOf({ kind: 'family', parentId: p.userId }, tx);
      const planId = promo.planId ?? 'family';
      const base = sub.compUntil && sub.compUntil > now && sub.compPlan === planId ? sub.compUntil : now;
      const compUntil = addMonths(base, promo.durationMonths ?? 1);
      await tx.subscription.update({ where: { id: sub.id }, data: { compPlan: planId, compUntil } });
      const sponsor = promo.sponsorPartnerId ? await tx.partner.findUnique({ where: { id: promo.sponsorPartnerId } }) : null;
      await tx.subscriptionEvent.create({
        data: {
          subscriptionId: sub.id,
          parentId: p.userId,
          type: 'promo_redeemed',
          description: sponsor ? `Code ${promo.code} · offert par ${sponsor.name}` : `Code ${promo.code} · ${promo.description}`,
          plan: planId,
          occurredAt: now,
        },
      });
      return { kind: 'comp' as const, code: promo.code, planId, compUntil, sponsor: sponsor?.name ?? null };
    });
  }
}
