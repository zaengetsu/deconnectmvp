import { Injectable, OnModuleInit } from '@nestjs/common';
import type { Principal, UserPrincipal } from '../../platform/auth/principal';
import { Clock } from '../../platform/clock';
import { EventBus } from '../../platform/events/event-bus';
import { EventRegistry } from '../../platform/events/event-registry';
import { conflict, notFound } from '../../platform/http/errors';
import { PrismaService, type Tx } from '../../platform/prisma/prisma.service';
import { isoToDateColumn } from '../../platform/time';
import type { PartnerRewardsPort } from '../rewards/partner-rewards.port';
import { AudienceService, type Targeting } from './audience.service';
import { describeCondition, isOfferLive, rkCode } from './offer-rules';
import { OffersService } from './offers.service';

type OfferRow = Awaited<ReturnType<Tx['partnerOffer']['findUniqueOrThrow']>>;

const targetingOf = (o: OfferRow): Targeting => ({
  targetType: o.targetType,
  targetPlaceId: o.targetPlaceId,
  targetRadiusKm: o.targetRadiusKm,
  targetPostalCodes: o.targetPostalCodes,
  targetPromoCodeId: o.targetPromoCodeId,
  minAge: o.minAge,
  maxAge: o.maxAge,
});

/**
 * Déblocage des offres : réagit aux événements métier (activité validée, objectif, niveau, série)
 * et implémente le port synchrone utilisé à l'approbation d'une récompense partenaire.
 * Toutes les vérifications (consentement, plan, zone, âge, période, stock, limite par famille)
 * sont faites dans la transaction qui attribue le code.
 */
/** Offres débloquées par les efforts de l'enfant : bons parents et récompenses enfant « après des activités ». */
const UNLOCKABLE_KINDS = ['parent_voucher', 'child_reward'];

@Injectable()
export class OfferEngine implements OnModuleInit, PartnerRewardsPort {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: EventRegistry,
    private readonly events: EventBus,
    private readonly offers: OffersService,
    private readonly audience: AudienceService,
    private readonly clock: Clock,
  ) {}

  onModuleInit(): void {
    this.registry.on('activity.validated', 'partners.unlock', async (e, tx) => {
      const p = e.payload;
      const [child, activity] = await Promise.all([
        tx.child.findUniqueOrThrow({ where: { id: p.childId } }),
        tx.activity.findUnique({ where: { id: p.activityId }, select: { partnerEligible: true } }),
      ]);
      if (activity && !activity.partnerEligible) return;
      const offers = await tx.partnerOffer.findMany({
        where: {
          kind: { in: UNLOCKABLE_KINDS },
          status: 'published',
          OR: [
            { triggerType: 'activity_validated', triggerActivityId: p.activityId },
            ...(p.categoryId ? [{ triggerType: 'category_validated', triggerCategoryId: p.categoryId }] : []),
            ...(p.levelUp ? [{ triggerType: 'level_reached', triggerThreshold: { lte: p.newLevel } }] : []),
            { triggerType: 'streak_days', triggerThreshold: { lte: child.streakDays } },
          ],
        },
      });
      for (const offer of offers) {
        if (!(await this.audience.isFamilyEligible(tx, targetingOf(offer), p.parentId, child.age))) continue;
        if (['activity_validated', 'category_validated'].includes(offer.triggerType) && !(await this.thresholdMet(tx, offer, p.parentId))) continue;
        // Une série ou un niveau ne débloque qu'une fois par enfant.
        const sourceKey = offer.triggerType === 'streak_days' || offer.triggerType === 'level_reached' ? `${offer.triggerType}:${child.id}` : `${e.type}:${e.id}`;
        await this.unlock(tx, offer, { parentId: p.parentId, childId: p.childId, sourceKey });
      }
    });

    this.registry.on('goal.completed', 'partners.unlock', async (e, tx) => {
      const offers = await tx.partnerOffer.findMany({ where: { kind: { in: UNLOCKABLE_KINDS }, status: 'published', triggerType: 'goal_completed' } });
      for (const offer of offers) {
        if (!(await this.audience.isFamilyEligible(tx, targetingOf(offer), e.payload.parentId))) continue;
        await this.unlock(tx, offer, { parentId: e.payload.parentId, childId: null, sourceKey: `goal:${e.payload.goalId}` });
      }
    });
  }

  /** Activités qualifiantes de la famille, depuis le début de l'offre et dans la fenêtre glissante. */
  async qualifyingCount(db: Tx | PrismaService, offer: OfferRow, parentId: string): Promise<number> {
    const now = this.clock.now();
    const from = [offer.startsAt ?? offer.publishedAt, offer.triggerWindowDays ? new Date(now.getTime() - offer.triggerWindowDays * 86_400_000) : null]
      .filter((d): d is Date => !!d)
      .sort((a, b) => b.getTime() - a.getTime())[0];
    return db.childActivity.count({
      where: {
        status: 'validated',
        child: { parentId },
        activity: { partnerEligible: true, ...(offer.triggerType === 'activity_validated' ? { id: offer.triggerActivityId! } : { categoryId: offer.triggerCategoryId }) },
        ...(from ? { validatedAt: { gte: from } } : {}),
      },
    });
  }

  /** « 10 activités Sport » : débloqué quand le compte atteint un multiple du seuil (10, 20…), dans la limite par famille. */
  private async thresholdMet(tx: Tx, offer: OfferRow, parentId: string): Promise<boolean> {
    if (offer.triggerThreshold <= 1) return true;
    const count = await this.qualifyingCount(tx, offer, parentId);
    return count > 0 && count % offer.triggerThreshold === 0;
  }

  private async uniqueRk(tx: Tx): Promise<string> {
    for (let i = 0; i < 8; i++) {
      const code = rkCode();
      if (!(await tx.offerClaim.findFirst({ where: { code }, select: { id: true } }))) return code;
    }
    throw new Error('Impossible de générer un code unique');
  }

  /** Attribue l'offre à une famille ; renvoie null si non éligible (période, stock, limite, source déjà traitée). */
  async unlock(tx: Tx, offer: OfferRow, input: { parentId: string; childId: string | null; sourceKey: string; rewardRequestId?: string }) {
    // Verrou de ligne : le stock ne peut pas être dépassé par deux déblocages simultanés.
    await tx.$queryRaw`SELECT id FROM partner_offers WHERE id = ${offer.id}::uuid FOR UPDATE`;
    const fresh = await tx.partnerOffer.findUniqueOrThrow({ where: { id: offer.id } });
    if (!isOfferLive(fresh, this.clock.now())) return null;
    const already = await tx.offerClaim.count({ where: { offerId: offer.id, parentId: input.parentId, status: { in: ['unlocked', 'redeemed'] } } });
    if (already >= fresh.perFamilyLimit) return null;

    const claims = await tx.offerClaim.createManyAndReturn({
      data: [{ offerId: offer.id, parentId: input.parentId, childId: input.childId, sourceKey: input.sourceKey, rewardRequestId: input.rewardRequestId ?? null, expiresAt: fresh.endsAt, unlockedAt: this.clock.now(), createdAt: this.clock.now() }],
      skipDuplicates: true,
    });
    if (claims.length === 0) return null;
    const claim = claims[0];

    let code: string | null = fresh.codeMode === 'generic' ? fresh.genericCode : null;
    if (fresh.codeMode === 'rekonect') code = await this.uniqueRk(tx);
    if (fresh.codeMode === 'unique_pool') {
      const [row] = await tx.$queryRaw<{ id: string; code: string }[]>`
        SELECT id, code FROM voucher_codes WHERE offer_id = ${offer.id}::uuid AND status = 'available'
        ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED`;
      if (!row) {
        // Réserve épuisée : l'offre se met en pause d'elle-même plutôt que de promettre un bon vide.
        await tx.offerClaim.delete({ where: { id: claim.id } });
        await tx.partnerOffer.update({ where: { id: offer.id }, data: { status: 'paused' } });
        await this.offers.setVisibility(tx, offer.id, false);
        return null;
      }
      await tx.voucherCode.update({ where: { id: row.id }, data: { status: 'assigned', claimId: claim.id, assignedAt: this.clock.now() } });
      code = row.code;
    }
    await tx.offerClaim.update({ where: { id: claim.id }, data: { code } });
    const stock = await tx.partnerOffer.update({ where: { id: offer.id }, data: { stockUsed: { increment: 1 } }, select: { stockUsed: true, stockTotal: true } });
    await this.bumpMetric(tx, offer.id, 'unlocks');
    await this.stockSignals(tx, offer.id, fresh.partnerId, stock.stockUsed, stock.stockTotal);
    await this.events.publish(tx, 'offer.unlocked', {
      aggregateType: 'offer_claim',
      aggregateId: claim.id,
      payload: { claimId: claim.id, offerId: offer.id, parentId: input.parentId, childId: input.childId },
      actor: { kind: 'system', id: 'partners' },
    });
    return { ...claim, code };
  }

  /** Prévient le partenaire quand il reste 20 % du stock, puis quand il est épuisé (une seule fois chacun). */
  private async stockSignals(tx: Tx, offerId: string, partnerId: string, used: number, total: number | null) {
    if (!total || total <= 0) return;
    const remaining = total - used;
    const threshold = Math.max(1, Math.ceil(total * 0.2));
    if (remaining === threshold && remaining > 0) {
      await this.events.publish(tx, 'offer.stock_low', { aggregateType: 'partner_offer', aggregateId: offerId, payload: { offerId, partnerId, remaining, total }, actor: { kind: 'system', id: 'partners' } });
    }
    if (remaining === 0) {
      await this.events.publish(tx, 'offer.sold_out', { aggregateType: 'partner_offer', aggregateId: offerId, payload: { offerId, partnerId, total }, actor: { kind: 'system', id: 'partners' } });
    }
  }

  private async bumpMetric(tx: Tx, offerId: string, field: 'views' | 'unlocks' | 'redemptions') {
    const day = isoToDateColumn(this.clock.now().toISOString().slice(0, 10));
    await tx.offerMetricDaily.upsert({
      where: { offerId_day: { offerId, day } },
      create: { offerId, day, [field]: 1 },
      update: { [field]: { increment: 1 } },
    });
  }

  async redeem(claimId: string, meta: { placeId?: string | null; userId?: string | null; basketAmountCents?: number | null } = {}) {
    return this.prisma.tx(async (tx) => {
      const claim = await tx.offerClaim.findUniqueOrThrow({ where: { id: claimId } });
      if (claim.status !== 'unlocked') return claim;
      const updated = await tx.offerClaim.update({
        where: { id: claimId },
        data: { status: 'redeemed', redeemedAt: this.clock.now(), redeemedPlaceId: meta.placeId ?? null, redeemedBy: meta.userId ?? null, basketAmountCents: meta.basketAmountCents ?? null },
      });
      await tx.voucherCode.updateMany({ where: { claimId }, data: { status: 'redeemed' } });
      await this.bumpMetric(tx, claim.offerId, 'redemptions');
      await this.events.publish(tx, 'offer.redeemed', {
        aggregateType: 'offer_claim',
        aggregateId: claimId,
        payload: { claimId, offerId: claim.offerId },
        actor: { kind: 'system', id: 'partners' },
      });
      return updated;
    });
  }

  // ─── Port utilisé par le module récompenses ────────────────────────────────

  async assertRequestable(tx: Tx, offerId: string, childAge: number, parentId?: string): Promise<void> {
    const o = await tx.partnerOffer.findUnique({ where: { id: offerId } });
    const eligible = o && isOfferLive(o, this.clock.now()) && (!parentId || (await this.audience.isFamilyEligible(tx, targetingOf(o), parentId, childAge)));
    if (!eligible) throw conflict('OFFER_UNAVAILABLE', "Cette récompense n'est plus disponible pour le moment");
  }

  async onApproved(tx: Tx, input: { offerId: string; requestId: string; parentId: string; childId: string }) {
    const offer = await tx.partnerOffer.findUnique({ where: { id: input.offerId } });
    if (!offer) throw conflict('OFFER_UNAVAILABLE', "Cette récompense partenaire n'existe plus");
    const claim = await this.unlock(tx, offer, { parentId: input.parentId, childId: input.childId, rewardRequestId: input.requestId, sourceKey: `reward_request:${input.requestId}` });
    if (!claim) throw conflict('OFFER_UNAVAILABLE', "Cette récompense partenaire n'est plus disponible (stock épuisé ou offre terminée)");
    return { code: claim.code };
  }

  /** Offres (ids) visibles par une famille parmi une liste : sert au catalogue de récompenses. */
  async visibleOfferIds(tx: Tx | PrismaService, parentId: string, offerIds: string[]): Promise<Set<string>> {
    const offers = await tx.partnerOffer.findMany({ where: { id: { in: offerIds } } });
    const now = this.clock.now();
    const out = new Set<string>();
    for (const o of offers) if (isOfferLive(o, now) && (await this.audience.isFamilyEligible(tx as Tx, targetingOf(o), parentId))) out.add(o.id);
    return out;
  }

  // ─── Côté parent (« Bons & avantages ») ────────────────────────────────────

  async claims(p: UserPrincipal) {
    const rows = await this.prisma.offerClaim.findMany({
      where: { parentId: p.userId },
      include: {
        offer: { select: { id: true, title: true, description: true, terms: true, discountLabel: true, imageUrl: true, endsAt: true, redemptionMethod: true, codeMode: true, partner: { select: { name: true, logoUrl: true, websiteUrl: true, color: true } } } },
        child: { select: { id: true, displayName: true } },
      },
      orderBy: { unlockedAt: 'desc' },
    });
    // Le QR code encode le code RK : c'est lui que la caisse scanne.
    return rows.map((c) => ({ ...c, qrPayload: c.code && c.offer.codeMode === 'rekonect' ? `rekonect:voucher:${c.code}` : null }));
  }

  /** Bons en cours d'obtention pour la famille, avec la progression (« 6 / 10 activités »). */
  async progress(p: UserPrincipal) {
    const offers = await this.prisma.partnerOffer.findMany({
      where: { kind: { in: UNLOCKABLE_KINDS }, status: 'published', triggerType: { in: ['activity_validated', 'category_validated'] } },
      include: { partner: { select: { name: true, color: true, logoUrl: true } }, triggerCategory: { select: { name: true } }, triggerActivity: { select: { title: true } } },
    });
    const now = this.clock.now();
    const out = [];
    for (const o of offers) {
      if (!isOfferLive(o, now) || !(await this.audience.isFamilyEligible(this.prisma as unknown as Tx, targetingOf(o), p.userId))) continue;
      const claimed = await this.prisma.offerClaim.count({ where: { offerId: o.id, parentId: p.userId, status: { in: ['unlocked', 'redeemed'] } } });
      if (claimed >= o.perFamilyLimit) continue;
      const count = await this.qualifyingCount(this.prisma, o, p.userId);
      const done = count % o.triggerThreshold;
      out.push({
        offerId: o.id,
        title: o.title,
        partner: o.partner,
        condition: describeCondition(o, { category: o.triggerCategory?.name, activity: o.triggerActivity?.title }),
        done,
        target: o.triggerThreshold,
        percent: Math.round((done / o.triggerThreshold) * 100),
        endsAt: o.endsAt,
      });
    }
    return out;
  }

  async markRedeemed(p: UserPrincipal, claimId: string) {
    const claim = await this.prisma.offerClaim.findFirst({ where: { id: claimId, parentId: p.userId } });
    if (!claim) throw notFound('CLAIM_NOT_FOUND', 'Bon introuvable');
    if (claim.status !== 'unlocked') throw conflict('INVALID_STATUS', 'Ce bon a déjà été utilisé ou a expiré');
    return this.redeem(claimId, { userId: null });
  }

  /** Vue d'une offre dans l'app (une fois par personne et par jour) : alimente « enfants touchés ». */
  async recordImpression(p: Principal, offerId: string) {
    const offer = await this.prisma.partnerOffer.findUnique({ where: { id: offerId }, select: { id: true, status: true } });
    if (!offer || offer.status !== 'published') throw notFound('OFFER_NOT_FOUND', 'Offre introuvable');
    const viewerKey = p.kind === 'child' ? `child:${p.childId}` : `parent:${p.userId}`;
    const day = isoToDateColumn(this.clock.now().toISOString().slice(0, 10));
    const res = await this.prisma.offerImpression.createMany({ data: [{ offerId, viewerKey, day }], skipDuplicates: true });
    if (res.count) await this.prisma.tx((tx) => this.bumpMetric(tx, offerId, 'views'));
    return { recorded: res.count > 0 };
  }

  // ─── Jobs ──────────────────────────────────────────────────────────────────

  /** Offres arrivées à échéance → expirées et retirées des catalogues ; bons non utilisés → expirés. */
  async expire(): Promise<number> {
    const now = this.clock.now();
    const ended = await this.prisma.partnerOffer.findMany({ where: { status: { in: ['published', 'paused'] }, endsAt: { lte: now } }, select: { id: true, partnerId: true } });
    for (const { id, partnerId } of ended) {
      await this.prisma.tx(async (tx) => {
        await this.offers.setVisibility(tx, id, false);
        await tx.partnerOffer.update({ where: { id }, data: { status: 'expired' } });
        await this.events.publish(tx, 'offer.expired', { aggregateType: 'partner_offer', aggregateId: id, payload: { offerId: id, partnerId }, actor: { kind: 'system', id: 'offer-expiry' } });
      });
    }
    await this.prisma.offerClaim.updateMany({ where: { status: 'unlocked', expiresAt: { lte: now } }, data: { status: 'expired' } });
    return ended.length;
  }
}
