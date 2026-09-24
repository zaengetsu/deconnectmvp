import { Injectable } from '@nestjs/common';
import { canTransitionOffer, type OfferStatus } from '@rekonect/contracts';
import { actorOf, type UserPrincipal } from '../../platform/auth/principal';
import { Clock } from '../../platform/clock';
import { EventBus } from '../../platform/events/event-bus';
import { conflict, notFound } from '../../platform/http/errors';
import { EmailService } from '../../platform/mail/email.service';
import { PrismaService, type Tx } from '../../platform/prisma/prisma.service';
import { initials } from './partners.service';
import { offerInclude, OffersService, presentOffer } from './offers.service';

/**
 * Modération Rekonect : seule porte vers la publication, parce que ces contenus s'adressent à des enfants.
 * À l'approbation, l'offre devient une ligne des catalogues existants — pas de système parallèle.
 */
@Injectable()
export class ModerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventBus,
    private readonly offers: OffersService,
    private readonly emails: EmailService,
    private readonly clock: Clock,
  ) {}

  /** File de modération, et décisions récentes (48 h) pour garder le contexte à l'écran. */
  async queue() {
    const since = new Date(this.clock.now().getTime() - 48 * 3_600_000);
    const rows = await this.prisma.partnerOffer.findMany({
      where: { OR: [{ status: 'pending_review' }, { reviewedAt: { gte: since }, status: { in: ['published', 'rejected', 'changes_requested'] } }] },
      include: offerInclude,
      orderBy: [{ submittedAt: 'asc' }],
    });
    const now = this.clock.now();
    return rows
      .map((o) => ({ ...presentOffer(o, now), partnerInitials: initials(o.partner.name), decided: o.status !== 'pending_review' }))
      .sort((a, b) => Number(a.decided) - Number(b.decided));
  }

  pendingCount() {
    return this.prisma.partnerOffer.count({ where: { status: 'pending_review' } });
  }

  async approve(admin: UserPrincipal, offerId: string) {
    const offer = await this.prisma.tx(async (tx) => {
      const o = await tx.partnerOffer.findUnique({ where: { id: offerId }, include: { partner: true } });
      if (!o) throw notFound('OFFER_NOT_FOUND', 'Offre introuvable');
      if (!canTransitionOffer(o.status as OfferStatus, 'published') || o.status !== 'pending_review') throw conflict('INVALID_STATUS', "Cette offre n'est pas en relecture");
      if (o.partner.status === 'suspended') throw conflict('PARTNER_SUSPENDED', 'Ce partenaire est suspendu');

      const links = await this.materialize(tx, o);
      const now = this.clock.now();
      const updated = await tx.partnerOffer.update({
        where: { id: offerId },
        data: { status: 'published', reviewedAt: now, reviewedBy: admin.userId, publishedAt: now, rejectionReason: null, reviewNote: null, ...links },
        include: offerInclude,
      });
      if (['pending', 'onboarding'].includes(o.partner.status)) await tx.partner.update({ where: { id: o.partnerId }, data: { status: 'active' } });
      await this.offers.setVisibility(tx, offerId, true);
      await this.events.publish(tx, 'offer.published', {
        aggregateType: 'partner_offer',
        aggregateId: offerId,
        payload: { offerId, partnerId: o.partnerId, kind: o.kind },
        actor: actorOf(admin),
      });
      return presentOffer(updated, now);
    });
    await this.notifyPartner(offerId, 'approved');
    return offer;
  }

  async reject(admin: UserPrincipal, offerId: string, reason: string) {
    return this.decide(admin, offerId, 'rejected', reason);
  }

  /** « Demander une modif. » : l'offre revient au partenaire avec la remarque, sans être refusée. */
  async requestChanges(admin: UserPrincipal, offerId: string, note: string) {
    return this.decide(admin, offerId, 'changes_requested', note);
  }

  private async decide(admin: UserPrincipal, offerId: string, status: 'rejected' | 'changes_requested', text: string) {
    const offer = await this.prisma.tx(async (tx) => {
      const o = await tx.partnerOffer.findUnique({ where: { id: offerId } });
      if (!o) throw notFound('OFFER_NOT_FOUND', 'Offre introuvable');
      if (o.status !== 'pending_review') throw conflict('INVALID_STATUS', "Cette offre n'est pas en relecture");
      const updated = await tx.partnerOffer.update({
        where: { id: offerId },
        data: {
          status,
          reviewedAt: this.clock.now(),
          reviewedBy: admin.userId,
          ...(status === 'rejected' ? { rejectionReason: text } : { reviewNote: text }),
        },
        include: offerInclude,
      });
      if (status === 'rejected') {
        await this.events.publish(tx, 'offer.rejected', {
          aggregateType: 'partner_offer',
          aggregateId: offerId,
          payload: { offerId, partnerId: o.partnerId, reason: text },
          actor: actorOf(admin),
        });
      }
      return presentOffer(updated, this.clock.now());
    });
    await this.notifyPartner(offerId, status === 'rejected' ? 'rejected' : 'changes', text);
    return offer;
  }

  /** Crée (ou met à jour) la récompense catalogue ou l'activité correspondant à l'offre. */
  private async materialize(tx: Tx, o: Awaited<ReturnType<Tx['partnerOffer']['findUniqueOrThrow']>>) {
    // Récompense enfant « après des activités » : pas d'entrée au catalogue de points, elle se débloque comme un bon.
    if (o.kind === 'child_reward' && !o.requiredPoints) return {};
    if (o.kind === 'child_reward') {
      const data = {
        title: o.title,
        description: o.description,
        requiredPoints: o.requiredPoints ?? 0,
        rewardType: 'partner',
        rewardCategory: 'partner',
        imageUrl: o.imageUrl,
        partnerOfferId: o.id,
        isActive: true,
      };
      const reward = o.rewardId ? await tx.reward.update({ where: { id: o.rewardId }, data }) : await tx.reward.create({ data: { ...data, parentId: null } });
      return { rewardId: reward.id };
    }
    if (o.kind === 'sponsored_activity') {
      const data = {
        title: o.title,
        description: o.description,
        instructions: o.terms,
        categoryId: o.categoryId,
        durationMinutes: o.durationMinutes,
        minAge: o.minAge,
        maxAge: o.maxAge,
        points: 10,
        activityType: 'partner',
        catalogStatus: 'published',
        isPublic: true,
        isActive: true,
        partnerId: o.partnerId,
        imageUrl: o.imageUrl,
      };
      const activity = o.activityId ? await tx.activity.update({ where: { id: o.activityId }, data }) : await tx.activity.create({ data });
      return { activityId: activity.id };
    }
    return {};
  }

  private async notifyPartner(offerId: string, decision: 'approved' | 'rejected' | 'changes', text?: string) {
    const o = await this.prisma.partnerOffer.findUniqueOrThrow({
      where: { id: offerId },
      include: { partner: { include: { members: { where: { status: 'active', role: { in: ['owner', 'editor'] } } } } } },
    });
    const stamp = (o.reviewedAt ?? this.clock.now()).toISOString();
    for (const m of o.partner.members) {
      const input = { to: m.email, recipientId: m.userId, dedupKey: `offer_decision:${o.id}:${decision}:${stamp}:${m.email}` };
      if (decision === 'approved') {
        await this.emails.sendNow('partner.offer_published', { ...input, data: { offerTitle: o.title, offerId: o.id, audienceLabel: null } });
      } else {
        await this.emails.sendNow('partner.offer_rejected', { ...input, data: { offerTitle: o.title, offerId: o.id, reason: text ?? 'non précisé', changesOnly: decision === 'changes' } });
      }
    }
  }
}
