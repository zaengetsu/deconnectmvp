import { Injectable } from '@nestjs/common';
import { canTransitionOffer, type CreateOfferInput, offerIssues, type OfferStatus, type UpdateOfferInput } from '@rekonect/contracts';
import { AccessService } from '../../platform/auth/access.service';
import { actorOf, type Principal, type UserPrincipal } from '../../platform/auth/principal';
import { Clock } from '../../platform/clock';
import { EventBus } from '../../platform/events/event-bus';
import { badRequest, conflict, forbidden, notFound } from '../../platform/http/errors';
import { Prisma, PrismaService } from '../../platform/prisma/prisma.service';
import { EntitlementsService } from '../billing/entitlements.service';
import {
  describeCondition,
  describeScope,
  describeStockPeriod,
  DISPLAY_STATUS_LABELS,
  displayStatus,
  maskCount,
  normalizeCodes,
  OFFER_KIND_LABELS,
  stockLeft,
} from './offer-rules';

type OfferRow = Prisma.PartnerOfferGetPayload<{ include: typeof offerInclude }>;

export const offerInclude = {
  triggerActivity: { select: { id: true, title: true } },
  triggerCategory: { select: { id: true, name: true, slug: true } },
  category: { select: { id: true, name: true, slug: true } },
  targetPlace: { select: { id: true, name: true, city: true } },
  targetPromoCode: { select: { id: true, code: true } },
  partner: { select: { id: true, name: true, color: true, parentPartnerId: true } },
} as const;

/** Vue « carte d'offre » partagée par le portail, la modération et l'app. */
export function presentOffer(o: OfferRow, now: Date) {
  const status = displayStatus(o, now);
  const used = o.stockUsed;
  return {
    ...o,
    kindLabel: OFFER_KIND_LABELS[o.kind] ?? o.kind,
    displayStatus: status,
    displayStatusLabel: DISPLAY_STATUS_LABELS[status],
    condition: describeCondition(o, { activity: o.triggerActivity?.title, category: o.triggerCategory?.name }),
    scope: describeScope(o, { place: o.targetPlace?.name, code: o.targetPromoCode?.code }),
    stockPeriod: describeStockPeriod(o),
    stockLeft: stockLeft(o),
    usage: { used, total: o.stockTotal, percent: o.stockTotal ? Math.round((used / o.stockTotal) * 100) : null },
  };
}

const EDITABLE: OfferStatus[] = ['draft', 'rejected', 'changes_requested'];

@Injectable()
export class OffersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly events: EventBus,
    private readonly entitlements: EntitlementsService,
    private readonly clock: Clock,
  ) {}

  private async load(offerId: string) {
    const o = await this.prisma.partnerOffer.findUnique({ where: { id: offerId }, include: offerInclude });
    if (!o) throw notFound('OFFER_NOT_FOUND', 'Offre introuvable');
    return o;
  }

  async list(p: Principal, partnerId: string, filter: { status?: string; kind?: string; display?: string } = {}) {
    await this.access.assertPartnerMember(p, partnerId, 'viewer');
    const rows = await this.prisma.partnerOffer.findMany({
      where: { partnerId, ...(filter.status ? { status: filter.status } : {}), ...(filter.kind ? { kind: filter.kind } : {}) },
      include: offerInclude,
      orderBy: { updatedAt: 'desc' },
    });
    const now = this.clock.now();
    const out = rows.map((o) => presentOffer(o, now));
    return filter.display ? out.filter((o) => o.displayStatus === filter.display) : out;
  }

  async get(p: Principal, offerId: string) {
    const o = await this.load(offerId);
    await this.access.assertPartnerMember(p, o.partnerId, 'viewer');
    const codesAvailable = await this.prisma.voucherCode.count({ where: { offerId, status: 'available' } });
    return { ...presentOffer(o, this.clock.now()), codesAvailable };
  }

  /** Cohérence de ciblage avec le plan et avec les lieux du partenaire. */
  private async checkTargeting(partnerId: string, o: { kind: string; targetType: string; targetRadiusKm?: number | null; targetPlaceId?: string | null; targetPromoCodeId?: string | null }) {
    await this.entitlements.assertTargetingAllowed(partnerId, o);
    if (o.targetPlaceId) {
      const partner = await this.prisma.partner.findUniqueOrThrow({ where: { id: partnerId } });
      const place = await this.prisma.partnerPlace.findFirst({ where: { id: o.targetPlaceId, partnerId: { in: [partnerId, ...(partner.parentPartnerId ? [partner.parentPartnerId] : [])] } } });
      if (!place) throw badRequest('PLACE_INVALID', 'Ce lieu ne vous appartient pas');
      if (o.targetType === 'radius' && (place.latitude == null || place.longitude == null)) throw badRequest('PLACE_NOT_LOCATED', 'Ce lieu n’a pas de coordonnées : complétez son adresse');
    }
    if (o.targetPromoCodeId) {
      const code = await this.prisma.promoCode.findFirst({ where: { id: o.targetPromoCodeId, sponsorPartnerId: partnerId } });
      if (!code) throw badRequest('ACCESS_CODE_INVALID', "Ce code d'accès n'appartient pas à votre organisation");
    }
  }

  async create(p: UserPrincipal, partnerId: string, input: CreateOfferInput) {
    await this.access.assertPartnerMember(p, partnerId, 'editor');
    await this.checkTargeting(partnerId, input);
    const o = await this.prisma.partnerOffer.create({
      data: {
        ...input,
        startsAt: input.startsAt ? new Date(input.startsAt) : null,
        endsAt: input.endsAt ? new Date(input.endsAt) : null,
        partnerId,
        createdBy: p.userId,
        status: 'draft',
      },
      include: offerInclude,
    });
    return presentOffer(o, this.clock.now());
  }

  /** Seuls les brouillons, les offres refusées ou à modifier se modifient ; une offre publiée se met en pause d'abord. */
  async update(p: Principal, offerId: string, input: UpdateOfferInput) {
    const o = await this.load(offerId);
    await this.access.assertPartnerMember(p, o.partnerId, 'editor');
    if (!EDITABLE.includes(o.status as OfferStatus)) throw conflict('OFFER_LOCKED', 'Une offre en relecture ou publiée ne se modifie pas');
    const merged = { ...o, ...input, startsAt: input.startsAt ?? o.startsAt?.toISOString(), endsAt: input.endsAt ?? o.endsAt?.toISOString() };
    const issues = offerIssues(merged as never);
    if (issues.length) throw badRequest('OFFER_INVALID', issues[0], issues);
    await this.checkTargeting(o.partnerId, merged);
    const updated = await this.prisma.partnerOffer.update({
      where: { id: offerId },
      data: {
        ...input,
        ...(input.startsAt !== undefined ? { startsAt: input.startsAt ? new Date(input.startsAt) : null } : {}),
        ...(input.endsAt !== undefined ? { endsAt: input.endsAt ? new Date(input.endsAt) : null } : {}),
        status: o.status === 'changes_requested' ? 'changes_requested' : 'draft',
        rejectionReason: null,
      },
      include: offerInclude,
    });
    return presentOffer(updated, this.clock.now());
  }

  /** Envoi en validation : l'enseigne valide d'abord les offres de ses magasins, puis Rekonect. */
  async submit(p: Principal, offerId: string) {
    const o = await this.load(offerId);
    await this.access.assertPartnerMember(p, o.partnerId, 'editor');
    const target: OfferStatus = o.partner.parentPartnerId ? 'pending_brand' : 'pending_review';
    const from = o.status === 'rejected' ? 'draft' : (o.status as OfferStatus);
    if (!canTransitionOffer(from, target)) throw conflict('INVALID_STATUS', 'Cette offre ne peut pas être envoyée en validation');
    const issues = offerIssues({ ...o, startsAt: o.startsAt?.toISOString(), endsAt: o.endsAt?.toISOString() } as never);
    if (o.codeMode === 'unique_pool' && (await this.prisma.voucherCode.count({ where: { offerId, status: 'available' } })) === 0) {
      issues.push('Importez des codes avant de soumettre');
    }
    if (issues.length) throw badRequest('OFFER_INVALID', issues[0], issues);
    await this.checkTargeting(o.partnerId, o);
    await this.entitlements.assertCanActivateOffer(o.partnerId, o.id);
    return this.prisma.tx(async (tx) => {
      const updated = await tx.partnerOffer.update({
        where: { id: offerId },
        data: { status: target, submittedAt: this.clock.now(), rejectionReason: null },
        include: offerInclude,
      });
      await this.events.publish(tx, 'offer.submitted', {
        aggregateType: 'partner_offer',
        aggregateId: offerId,
        payload: { offerId, partnerId: o.partnerId },
        actor: actorOf(p),
      });
      return presentOffer(updated, this.clock.now());
    });
  }

  /** Offres de magasins en attente de l'enseigne. */
  async brandQueue(p: Principal, brandId: string) {
    await this.access.assertPartnerMember(p, brandId, 'editor');
    const rows = await this.prisma.partnerOffer.findMany({
      where: { status: 'pending_brand', partner: { parentPartnerId: brandId } },
      include: offerInclude,
      orderBy: { submittedAt: 'asc' },
    });
    return rows.map((o) => presentOffer(o, this.clock.now()));
  }

  async brandReview(p: UserPrincipal, offerId: string, decision: { approve: boolean; note?: string }) {
    const o = await this.load(offerId);
    if (!o.partner.parentPartnerId || o.status !== 'pending_brand') throw conflict('INVALID_STATUS', "Cette offre n'attend pas la validation de l'enseigne");
    await this.access.assertPartnerMember(p, o.partner.parentPartnerId, 'editor');
    const updated = await this.prisma.partnerOffer.update({
      where: { id: offerId },
      data: decision.approve
        ? { status: 'pending_review', brandReviewedAt: this.clock.now(), brandReviewedBy: p.userId }
        : { status: 'changes_requested', reviewNote: decision.note ?? 'Modifications demandées par l’enseigne', brandReviewedAt: this.clock.now(), brandReviewedBy: p.userId },
      include: offerInclude,
    });
    return presentOffer(updated, this.clock.now());
  }

  async pause(p: Principal, offerId: string, pause: boolean) {
    const o = await this.load(offerId);
    await this.access.assertPartnerMember(p, o.partnerId, 'editor');
    const target: OfferStatus = pause ? 'paused' : 'published';
    if (!canTransitionOffer(o.status as OfferStatus, target)) throw conflict('INVALID_STATUS', pause ? "Cette offre n'est pas en ligne" : "Cette offre n'est pas en pause");
    return this.prisma.tx(async (tx) => {
      await this.setVisibility(tx, offerId, !pause);
      const updated = await tx.partnerOffer.update({ where: { id: offerId }, data: { status: target }, include: offerInclude });
      return presentOffer(updated, this.clock.now());
    });
  }

  /** Visibilité des lignes créées dans les catalogues (récompense ou activité). */
  async setVisibility(tx: Prisma.TransactionClient, offerId: string, visible: boolean) {
    const o = await tx.partnerOffer.findUniqueOrThrow({ where: { id: offerId } });
    if (o.rewardId) {
      await tx.reward.update({ where: { id: o.rewardId }, data: { isActive: visible } });
      // Les copies activées par les familles suivent la même visibilité.
      await tx.reward.updateMany({ where: { partnerOfferId: offerId, parentId: { not: null } }, data: { isActive: visible } });
    }
    if (o.activityId) await tx.activity.update({ where: { id: o.activityId }, data: { isActive: visible, catalogStatus: visible ? 'published' : 'archived' } });
  }

  async importCodes(p: Principal, offerId: string, codes: string[]) {
    const o = await this.load(offerId);
    await this.access.assertPartnerMember(p, o.partnerId, 'editor');
    if (o.codeMode !== 'unique_pool') throw badRequest('CODE_MODE', 'Cette offre n’utilise pas de codes uniques');
    const clean = normalizeCodes(codes);
    const res = await this.prisma.voucherCode.createMany({ data: clean.map((code) => ({ offerId, code })), skipDuplicates: true });
    const available = await this.prisma.voucherCode.count({ where: { offerId, status: 'available' } });
    return { imported: res.count, duplicates: clean.length - res.count, available };
  }

  async remove(p: Principal, offerId: string) {
    const o = await this.load(offerId);
    await this.access.assertPartnerMember(p, o.partnerId, 'editor');
    if (o.status !== 'draft') throw forbidden('OFFER_NOT_DRAFT', 'Seul un brouillon peut être supprimé');
    await this.prisma.partnerOffer.delete({ where: { id: offerId } });
    return { success: true };
  }

  /** Statistiques d'une offre : agrégées uniquement, seuil de masquage. */
  async stats(p: Principal, offerId: string) {
    const o = await this.load(offerId);
    await this.access.assertPartnerMember(p, o.partnerId, 'viewer');
    const [daily, unlocked, redeemed, viewers] = await Promise.all([
      this.prisma.offerMetricDaily.findMany({ where: { offerId }, orderBy: { day: 'asc' } }),
      this.prisma.offerClaim.count({ where: { offerId, status: { in: ['unlocked', 'redeemed'] } } }),
      this.prisma.offerClaim.count({ where: { offerId, status: 'redeemed' } }),
      this.prisma.offerImpression.findMany({ where: { offerId }, distinct: ['viewerKey'], select: { viewerKey: true } }),
    ]);
    return {
      offerId,
      views: maskCount(viewers.length),
      unlocks: maskCount(unlocked),
      redemptions: maskCount(redeemed),
      redemptionRate: unlocked >= 10 ? Math.round((redeemed / unlocked) * 100) : null,
      stockLeft: stockLeft(o),
      daily: daily.map((d) => ({ day: d.day.toISOString().slice(0, 10), views: maskCount(d.views), unlocks: maskCount(d.unlocks), redemptions: maskCount(d.redemptions) })),
      masked: unlocked < 10,
    };
  }
}
