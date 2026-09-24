import { Injectable } from '@nestjs/common';
import { AccessService } from '../../platform/auth/access.service';
import type { Principal } from '../../platform/auth/principal';
import { Clock } from '../../platform/clock';
import { Prisma, PrismaService } from '../../platform/prisma/prisma.service';
import { AudienceService } from './audience.service';
import { maskCount, roundTen } from './offer-rules';
import { offerInclude, presentOffer } from './offers.service';

const delta = (curr: number, prev: number): number | null => (prev === 0 ? null : Math.round(((curr - prev) / prev) * 100));

const CLAIM_STATUS_LABELS: Record<string, string> = { redeemed: 'Utilisé', unlocked: 'Réservé', expired: 'Expiré', cancelled: 'Annulé' };

/**
 * Mesure côté partenaire : uniquement des volumes, jamais d'identité d'enfant ou de famille.
 * Une enseigne voit l'ensemble de son réseau (ses offres et celles de ses magasins).
 */
@Injectable()
export class PartnerStatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audience: AudienceService,
    private readonly clock: Clock,
  ) {}

  private async scope(partnerId: string): Promise<string[]> {
    const stores = await this.prisma.partner.findMany({ where: { parentPartnerId: partnerId }, select: { id: true } });
    return [partnerId, ...stores.map((s) => s.id)];
  }

  private async offerIds(partnerIds: string[]) {
    return (await this.prisma.partnerOffer.findMany({ where: { partnerId: { in: partnerIds } }, select: { id: true } })).map((o) => o.id);
  }

  private async periodCounts(offerIds: string[], from: Date, to: Date) {
    if (offerIds.length === 0) return { viewers: 0, kids: 0, unlocked: 0, redeemed: 0, basketAvg: null as number | null, started: 0 };
    const [imp] = await this.prisma.$queryRaw<{ viewers: bigint; kids: bigint }[]>`
      SELECT count(DISTINCT viewer_key) AS viewers, count(DISTINCT viewer_key) FILTER (WHERE viewer_key LIKE 'child:%') AS kids
      FROM offer_impressions WHERE offer_id IN (${Prisma.join(offerIds)}) AND day >= ${from}::date AND day < ${to}::date`;
    const [unlocked, redeemed, basket] = await Promise.all([
      this.prisma.offerClaim.count({ where: { offerId: { in: offerIds }, unlockedAt: { gte: from, lt: to } } }),
      this.prisma.offerClaim.count({ where: { offerId: { in: offerIds }, status: 'redeemed', redeemedAt: { gte: from, lt: to } } }),
      this.prisma.offerClaim.aggregate({ _avg: { basketAmountCents: true }, where: { offerId: { in: offerIds }, redeemedAt: { gte: from, lt: to }, basketAmountCents: { not: null } } }),
    ]);
    // « Défi commencé » : enfants ayant vu une offre puis commencé une activité qui la déclenche.
    const [started] = await this.prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(DISTINCT ca.child_id) AS n
      FROM child_activities ca
      JOIN activities a ON a.id = ca.activity_id
      JOIN partner_offers o ON o.id IN (${Prisma.join(offerIds)})
        AND ((o.trigger_type = 'activity_validated' AND o.trigger_activity_id = a.id)
          OR (o.trigger_type = 'category_validated' AND o.trigger_category_id = a.category_id)
          OR (o.kind = 'sponsored_activity' AND o.activity_id = a.id))
      WHERE ca.created_at >= ${from} AND ca.created_at < ${to}
        AND EXISTS (SELECT 1 FROM offer_impressions i WHERE i.offer_id = o.id AND i.viewer_key = 'child:' || ca.child_id::text)`;
    return {
      viewers: Number(imp.viewers),
      kids: Number(imp.kids),
      unlocked,
      redeemed,
      basketAvg: basket._avg.basketAmountCents == null ? null : Math.round(basket._avg.basketAmountCents),
      started: Number(started.n),
    };
  }

  async dashboard(p: Principal, partnerId: string, days = 30) {
    await this.access.assertPartnerMember(p, partnerId, 'viewer');
    const partnerIds = await this.scope(partnerId);
    const ids = await this.offerIds(partnerIds);
    const now = this.clock.now();
    const from = new Date(now.getTime() - days * 86_400_000);
    const prevFrom = new Date(from.getTime() - days * 86_400_000);
    const [curr, prev] = await Promise.all([this.periodCounts(ids, from, new Date(now.getTime() + 1)), // borne incluant l'instant présent
      this.periodCounts(ids, prevFrom, from)]);

    const offers = await this.prisma.partnerOffer.findMany({ where: { partnerId: { in: partnerIds } }, include: offerInclude, orderBy: { publishedAt: 'desc' } });
    const presented = offers.map((o) => presentOffer(o, now));

    return {
      days,
      kpis: {
        kidsReached: { value: maskCount(curr.kids), delta: delta(curr.kids, prev.kids) },
        rewardsObtained: { value: maskCount(curr.unlocked), delta: delta(curr.unlocked, prev.unlocked) },
        vouchersUsed: { value: maskCount(curr.redeemed), delta: delta(curr.redeemed, prev.redeemed), rate: curr.unlocked >= 10 ? Math.round((curr.redeemed / curr.unlocked) * 100) : null },
        averageBasketCents: { value: curr.basketAvg, delta: curr.basketAvg && prev.basketAvg ? delta(curr.basketAvg, prev.basketAvg) : null },
      },
      funnel: [
        { key: 'seen', value: maskCount(curr.viewers) },
        { key: 'started', value: maskCount(curr.started) },
        { key: 'obtained', value: maskCount(curr.unlocked) },
        { key: 'used', value: maskCount(curr.redeemed) },
      ],
      triggers: await this.triggers(ids, from),
      activeOffers: presented.filter((o) => o.displayStatus === 'active').slice(0, 5),
      offerCounts: presented.reduce<Record<string, number>>((acc, o) => ({ ...acc, [o.displayStatus]: (acc[o.displayStatus] ?? 0) + 1 }), {}),
    };
  }

  /** Part des bons obtenus par activité / catégorie déclenchante. */
  private async triggers(offerIds: string[], from: Date) {
    if (!offerIds.length) return [];
    const rows = await this.prisma.$queryRaw<{ label: string | null; slug: string | null; n: bigint }[]>`
      SELECT COALESCE(a.title, cat.name, CASE WHEN o.kind = 'child_reward' THEN 'Points échangés' ELSE 'Autres' END) AS label,
             cat.slug, count(*) AS n
      FROM offer_claims c JOIN partner_offers o ON o.id = c.offer_id
      LEFT JOIN activities a ON a.id = o.trigger_activity_id
      LEFT JOIN activity_categories cat ON cat.id = COALESCE(o.trigger_category_id, a.category_id)
      WHERE c.offer_id IN (${Prisma.join(offerIds)}) AND c.unlocked_at >= ${from}
      GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 5`;
    const total = rows.reduce((s, r) => s + Number(r.n), 0);
    if (total < 10) return [];
    return rows.map((r) => ({ label: r.label ?? 'Autres', categorySlug: r.slug, percent: Math.round((Number(r.n) / total) * 100) }));
  }

  async redemptions(p: Principal, partnerId: string, limit = 50) {
    await this.access.assertPartnerMember(p, partnerId, 'reception');
    const rows = await this.prisma.offerClaim.findMany({
      where: { offer: { partnerId: { in: await this.scope(partnerId) } }, code: { not: null } },
      include: { offer: { select: { title: true } }, redeemedPlace: { select: { name: true } } },
      orderBy: [{ redeemedAt: { sort: 'desc', nulls: 'last' } }, { unlockedAt: 'desc' }],
      take: limit,
    });
    return rows.map((c) => ({
      id: c.id,
      at: c.redeemedAt ?? c.unlockedAt,
      code: c.code,
      offerTitle: c.offer.title,
      place: c.redeemedPlace?.name ?? null,
      status: c.status,
      statusLabel: CLAIM_STATUS_LABELS[c.status] ?? c.status,
    }));
  }

  async redemptionsCsv(p: Principal, partnerId: string): Promise<string> {
    const rows = await this.redemptions(p, partnerId, 5000);
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = rows.map((r) => [r.at.toISOString(), r.code ?? '', r.offerTitle, r.place ?? '', r.statusLabel].map(esc).join(';'));
    return ['﻿date;code;offre;lieu;statut', ...lines].join('\n');
  }

  /** Tableau « Magasins / Équipements / Sites ». */
  async places(p: Principal, partnerId: string) {
    await this.access.assertPartnerMember(p, partnerId, 'viewer');
    const places = await this.prisma.partnerPlace.findMany({ where: { partnerId, isActive: true }, orderBy: { createdAt: 'asc' } });
    const zones = await this.audience.zones(partnerId);
    const kidsByPlace = new Map(zones.zones.map((z) => [z.placeId, z.kids]));
    const out = [];
    for (const place of places) {
      const [localOffers, used] = await Promise.all([
        this.prisma.partnerOffer.count({
          where: { status: { in: ['published', 'pending_review', 'pending_brand'] }, OR: [{ targetPlaceId: place.id }, ...(place.linkedPartnerId ? [{ partnerId: place.linkedPartnerId }] : [])] },
        }),
        this.prisma.offerClaim.count({
          where: { status: 'redeemed', OR: [{ redeemedPlaceId: place.id }, ...(place.linkedPartnerId ? [{ redeemedPlace: { partnerId: place.linkedPartnerId } }] : [])] },
        }),
      ]);
      out.push({ ...place, localOffers, kidsWithin10km: kidsByPlace.get(place.id) ?? null, vouchersUsed: used });
    }
    return out;
  }

  async audienceZones(p: Principal, partnerId: string) {
    await this.access.assertPartnerMember(p, partnerId, 'viewer');
    const [zones, ages] = await Promise.all([this.audience.zones(partnerId), this.audience.ageDistribution(partnerId)]);
    return { ...zones, ages };
  }

  async estimate(p: Principal, partnerId: string, t: Parameters<AudienceService['estimate']>[0]) {
    await this.access.assertPartnerMember(p, partnerId, 'viewer');
    return this.audience.estimate(t);
  }

  /** Volume arrondi exposé dans l'admin (enfants touchés par partenaire). */
  roundedOrNull(n: number) {
    return n < 20 ? null : roundTen(n);
  }
}
