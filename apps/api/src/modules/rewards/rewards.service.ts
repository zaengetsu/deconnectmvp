import { Inject, Injectable } from '@nestjs/common';
import { ageFits, type CreateRewardInput, type UpdateRewardInput } from '@rekonect/contracts';
import { AccessService } from '../../platform/auth/access.service';
import { actorOf, type ChildPrincipal, type Principal, type UserPrincipal } from '../../platform/auth/principal';
import { Clock } from '../../platform/clock';
import { EventBus } from '../../platform/events/event-bus';
import { conflict, notFound } from '../../platform/http/errors';
import { PrismaService, type Tx } from '../../platform/prisma/prisma.service';
import { EntitlementsService } from '../billing/entitlements.service';
import { GamificationService } from '../gamification/gamification.service';
import { PARTNER_REWARDS, type PartnerRewardsPort } from './partner-rewards.port';

const partnerInclude = {
  partnerOffer: { select: { id: true, minAge: true, maxAge: true, partner: { select: { id: true, name: true, logoUrl: true } } } },
} as const;

@Injectable()
export class RewardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly events: EventBus,
    private readonly gamification: GamificationService,
    private readonly clock: Clock,
    @Inject(PARTNER_REWARDS) private readonly partners: PartnerRewardsPort,
    private readonly entitlements: EntitlementsService,
  ) {}

  private async consent(parentId: string): Promise<boolean> {
    const prefs = await this.prisma.notificationPreference.findFirst({ where: { parentId, childId: null }, select: { partnerOffers: true } });
    return prefs?.partnerOffers ?? false;
  }

  // ─── Récompenses de la famille ─────────────────────────────────────────────

  async list(p: Principal, childId?: string) {
    if (p.kind === 'child') {
      const child = await this.prisma.child.findUniqueOrThrow({ where: { id: p.childId } });
      const rows = await this.prisma.reward.findMany({
        where: { parentId: p.parentId, isActive: true, OR: [{ childId: p.childId }, { childId: null }] },
        include: partnerInclude,
        orderBy: { requiredPoints: 'asc' },
      });
      const visible = await this.partners.visibleOfferIds(this.prisma, p.parentId, rows.flatMap((r) => (r.partnerOfferId ? [r.partnerOfferId] : [])));
      return rows
        .filter((r) => !r.partnerOffer || (visible.has(r.partnerOffer.id) && ageFits(child.age, r.partnerOffer.minAge, r.partnerOffer.maxAge)))
        .map((r) => ({ ...r, affordable: child.totalPoints >= r.requiredPoints, missingPoints: Math.max(0, r.requiredPoints - child.totalPoints) }));
    }
    if (childId) await this.access.assertParentOwnsChild(p.userId, childId);
    return this.prisma.reward.findMany({
      where: { parentId: p.userId, isActive: true, ...(childId ? { OR: [{ childId }, { childId: null }] } : {}) },
      include: partnerInclude,
      orderBy: { requiredPoints: 'asc' },
    });
  }

  /** Catalogue Rekonect + récompenses partenaires publiées (si la famille y a consenti). */
  async catalog(p: UserPrincipal) {
    const consent = await this.consent(p.userId);
    const rows = await this.prisma.reward.findMany({
      where: {
        parentId: null,
        isActive: true,
        OR: [{ rewardType: 'catalog' }, ...(consent ? [{ rewardType: 'partner' }] : [])],
      },
      include: partnerInclude,
      orderBy: [{ rewardCategory: 'asc' }, { requiredPoints: 'asc' }],
    });
    const visible = await this.partners.visibleOfferIds(this.prisma, p.userId, rows.flatMap((r) => (r.partnerOfferId ? [r.partnerOfferId] : [])));
    return rows.filter((r) => !r.partnerOfferId || visible.has(r.partnerOfferId));
  }

  /** Copie une récompense du catalogue dans la liste de la famille (comportement mobile actuel). */
  async activate(p: UserPrincipal, catalogRewardId: string, childId?: string) {
    if (childId) await this.access.assertParentOwnsChild(p.userId, childId);
    const source = await this.prisma.reward.findFirst({ where: { id: catalogRewardId, parentId: null, isActive: true } });
    if (!source) throw notFound('REWARD_NOT_FOUND', 'Récompense introuvable');
    if (source.partnerOfferId && !(await this.partners.visibleOfferIds(this.prisma, p.userId, [source.partnerOfferId])).has(source.partnerOfferId)) {
      throw notFound('REWARD_NOT_FOUND', 'Récompense introuvable');
    }
    return this.prisma.reward.create({
      data: {
        parentId: p.userId,
        childId: childId ?? null,
        title: source.title,
        description: source.description,
        requiredPoints: source.requiredPoints,
        rewardCategory: source.rewardCategory,
        rewardType: source.rewardType === 'partner' ? 'partner' : 'custom',
        partnerOfferId: source.partnerOfferId,
        imageUrl: source.imageUrl,
        sourceRewardId: source.id,
      },
      include: partnerInclude,
    });
  }

  async create(p: UserPrincipal, input: CreateRewardInput) {
    if (input.childId) await this.access.assertParentOwnsChild(p.userId, input.childId);
    return this.prisma.reward.create({ data: { ...input, parentId: p.userId, rewardType: 'custom' } });
  }

  async update(p: UserPrincipal, id: string, input: UpdateRewardInput) {
    await this.ownReward(p, id);
    if (input.childId) await this.access.assertParentOwnsChild(p.userId, input.childId);
    return this.prisma.reward.update({ where: { id }, data: input });
  }

  async remove(p: UserPrincipal, id: string) {
    await this.ownReward(p, id);
    await this.prisma.reward.update({ where: { id }, data: { isActive: false } });
    return { success: true };
  }

  private async ownReward(p: UserPrincipal, id: string) {
    const r = await this.prisma.reward.findFirst({ where: { id, parentId: p.userId } });
    if (!r) throw notFound('REWARD_NOT_FOUND', 'Récompense introuvable');
    return r;
  }

  // ─── Demandes ──────────────────────────────────────────────────────────────

  async request(p: ChildPrincipal, rewardId: string) {
    await this.entitlements.assertChildWritable(p.parentId, p.childId);
    return this.prisma.tx(async (tx) => {
      const child = await tx.child.findUniqueOrThrow({ where: { id: p.childId } });
      const reward = await tx.reward.findFirst({
        where: { id: rewardId, parentId: p.parentId, isActive: true, OR: [{ childId: p.childId }, { childId: null }] },
      });
      if (!reward) throw notFound('REWARD_NOT_FOUND', 'Récompense introuvable');
      if (child.totalPoints < reward.requiredPoints) {
        throw conflict('NOT_ENOUGH_POINTS', `Encore ${reward.requiredPoints - child.totalPoints} points avant cette récompense`);
      }
      const pending = await tx.rewardRequest.findFirst({ where: { childId: p.childId, rewardId, status: 'pending' } });
      if (pending) throw conflict('ALREADY_REQUESTED', 'Tu as déjà demandé cette récompense');
      if (reward.partnerOfferId) await this.partners.assertRequestable(tx, reward.partnerOfferId, child.age, p.parentId);

      const req = await tx.rewardRequest.create({ data: { childId: p.childId, rewardId, status: 'pending' } });
      await this.events.publish(tx, 'reward.requested', {
        aggregateType: 'reward_request',
        aggregateId: req.id,
        payload: { requestId: req.id, rewardId, childId: p.childId, parentId: p.parentId },
        actor: actorOf(p),
      });
      return req;
    });
  }

  async listRequests(p: Principal, filter: { status?: string; childId?: string }) {
    if (p.kind === 'child') {
      return this.prisma.rewardRequest.findMany({
        where: { childId: p.childId, ...(filter.status ? { status: filter.status } : {}) },
        include: { reward: true, offerClaims: { select: { code: true, status: true } } },
        orderBy: { requestedAt: 'desc' },
      });
    }
    if (filter.childId) await this.access.assertParentOwnsChild(p.userId, filter.childId);
    return this.prisma.rewardRequest.findMany({
      where: {
        child: { parentId: p.userId },
        ...(filter.childId ? { childId: filter.childId } : {}),
        ...(filter.status ? { status: filter.status } : {}),
      },
      include: { reward: true, child: { select: { id: true, displayName: true, avatarUrl: true } }, offerClaims: true },
      orderBy: { requestedAt: 'desc' },
    });
  }

  /** Approbation : débit des points + code partenaire éventuel, dans la même transaction. */
  async approve(p: UserPrincipal, requestId: string, note?: string) {
    return this.prisma.tx(async (tx) => {
      const req = await this.loadForParent(tx, p, requestId, true);
      if (req.status !== 'pending') throw conflict('INVALID_STATUS', 'Cette demande a déjà été traitée');
      await this.gamification.spend(tx, {
        childId: req.childId,
        points: req.reward.requiredPoints,
        sourceId: req.id,
        reason: req.reward.title,
        createdBy: p.userId,
      });
      await tx.rewardRequest.update({
        where: { id: req.id },
        data: { status: 'approved', approvedAt: this.clock.now(), handledBy: p.userId, parentNote: note ?? null },
      });
      let code: string | null = null;
      if (req.reward.partnerOfferId) {
        ({ code } = await this.partners.onApproved(tx, {
          offerId: req.reward.partnerOfferId,
          requestId: req.id,
          parentId: p.userId,
          childId: req.childId,
        }));
      }
      await this.events.publish(tx, 'reward.approved', {
        aggregateType: 'reward_request',
        aggregateId: req.id,
        payload: { requestId: req.id, rewardId: req.rewardId, childId: req.childId, parentId: p.userId, pointsDeducted: req.reward.requiredPoints },
        actor: actorOf(p),
      });
      return { success: true, pointsDeducted: req.reward.requiredPoints, code };
    });
  }

  async reject(p: UserPrincipal, requestId: string, note?: string) {
    return this.prisma.tx(async (tx) => {
      const req = await this.loadForParent(tx, p, requestId);
      if (req.status !== 'pending') throw conflict('INVALID_STATUS', 'Cette demande a déjà été traitée');
      const updated = await tx.rewardRequest.update({
        where: { id: req.id },
        data: { status: 'rejected', rejectedAt: this.clock.now(), handledBy: p.userId, parentNote: note ?? null },
      });
      await this.events.publish(tx, 'reward.rejected', {
        aggregateType: 'reward_request',
        aggregateId: req.id,
        payload: { requestId: req.id, rewardId: req.rewardId, childId: req.childId, note: note ?? null },
        actor: actorOf(p),
      });
      return updated;
    });
  }

  /** Le parent indique avoir remis la récompense (approved → completed). */
  async deliver(p: UserPrincipal, requestId: string) {
    return this.prisma.tx(async (tx) => {
      const req = await this.loadForParent(tx, p, requestId);
      if (req.status !== 'approved') throw conflict('INVALID_STATUS', "Cette récompense n'est pas encore validée");
      const updated = await tx.rewardRequest.update({ where: { id: req.id }, data: { status: 'completed' } });
      await this.events.publish(tx, 'reward.delivered', {
        aggregateType: 'reward_request',
        aggregateId: req.id,
        payload: { requestId: req.id, rewardId: req.rewardId, childId: req.childId },
        actor: actorOf(p),
      });
      return updated;
    });
  }

  private async loadForParent(tx: Tx, p: UserPrincipal, id: string, lock = false) {
    if (lock) await tx.$queryRaw`SELECT id FROM reward_requests WHERE id = ${id}::uuid FOR UPDATE`;
    const req = await tx.rewardRequest.findUnique({ where: { id }, include: { reward: true, child: true } });
    if (!req || req.child.parentId !== p.userId) throw notFound('REWARD_REQUEST_NOT_FOUND', 'Demande introuvable');
    return req;
  }
}
