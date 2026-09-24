import { Injectable } from '@nestjs/common';
import type { CreateDuoInput } from '@rekonect/contracts';
import { AccessService } from '../../platform/auth/access.service';
import { actorOf, type ChildPrincipal, type Principal, type UserPrincipal } from '../../platform/auth/principal';
import { Clock } from '../../platform/clock';
import { EventBus } from '../../platform/events/event-bus';
import { badRequest, conflict, forbidden, notFound } from '../../platform/http/errors';
import { PrismaService, type Tx } from '../../platform/prisma/prisma.service';
import { GamificationService } from '../gamification/gamification.service';

const childCard = { select: { id: true, displayName: true, avatarUrl: true, parentId: true } } as const;

/** Statut d'amitié dérivé des deux accords parentaux (ex-trigger sync_friendship_status). */
export function friendshipStatus(current: string, byInitiator: boolean, byFriend: boolean): string {
  if (current === 'blocked' || current === 'declined') return current;
  return byInitiator && byFriend ? 'approved' : 'pending';
}

@Injectable()
export class SocialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly events: EventBus,
    private readonly gamification: GamificationService,
    private readonly clock: Clock,
  ) {}

  // ─── Amitiés (accord des deux parents obligatoire) ────────────────────────

  async requestFriend(p: ChildPrincipal, friendChildId: string) {
    if (friendChildId === p.childId) throw badRequest('FRIEND_SELF', 'Tu ne peux pas t’ajouter toi-même');
    const friend = await this.prisma.child.findFirst({ where: { id: friendChildId, isActive: true } });
    if (!friend) throw notFound('CHILD_NOT_FOUND', 'Profil introuvable');
    const existing = await this.prisma.childFriend.findFirst({
      where: { OR: [{ childId: p.childId, friendChildId }, { childId: friendChildId, friendChildId: p.childId }] },
    });
    if (existing) throw conflict('FRIEND_EXISTS', 'Une demande existe déjà');
    const sameFamily = friend.parentId === p.parentId;

    return this.prisma.tx(async (tx) => {
      const row = await tx.childFriend.create({
        data: {
          childId: p.childId,
          friendChildId,
          // Frères et sœurs : le parent commun a déjà tout pouvoir, pas de double accord.
          approvedByInitiatorParent: sameFamily,
          approvedByFriendParent: sameFamily,
          status: friendshipStatus('pending', sameFamily, sameFamily),
        },
      });
      if (!sameFamily) {
        await this.events.publish(tx, 'friend.requested', {
          aggregateType: 'child_friend',
          aggregateId: row.id,
          payload: { friendshipId: row.id, childId: p.childId, friendChildId },
          actor: actorOf(p),
        });
      }
      return row;
    });
  }

  async friends(p: Principal, childId?: string) {
    const id = p.kind === 'child' ? p.childId : childId;
    if (!id) throw badRequest('CHILD_REQUIRED', 'Précisez l’enfant');
    if (p.kind === 'user') await this.access.assertParentOwnsChild(p.userId, id);
    return this.prisma.childFriend.findMany({
      where: { OR: [{ childId: id }, { friendChildId: id }], status: { not: 'blocked' } },
      include: { child: childCard, friend: childCard },
      orderBy: { createdAt: 'desc' },
    });
  }

  async decideFriend(p: UserPrincipal, friendshipId: string, approve: boolean) {
    const f = await this.prisma.childFriend.findUnique({ where: { id: friendshipId }, include: { child: true, friend: true } });
    const side = f?.child.parentId === p.userId ? 'initiator' : f?.friend.parentId === p.userId ? 'friend' : null;
    if (!f || !side) throw notFound('FRIENDSHIP_NOT_FOUND', 'Demande introuvable');
    const byInitiator = side === 'initiator' ? approve : f.approvedByInitiatorParent;
    const byFriend = side === 'friend' ? approve : f.approvedByFriendParent;
    return this.prisma.childFriend.update({
      where: { id: f.id },
      data: {
        approvedByInitiatorParent: byInitiator,
        approvedByFriendParent: byFriend,
        status: approve ? friendshipStatus(f.status, byInitiator, byFriend) : 'declined',
      },
    });
  }

  async canDuo(db: Tx | PrismaService, a: string, b: string): Promise<boolean> {
    const [ca, cb] = await Promise.all([db.child.findUnique({ where: { id: a } }), db.child.findUnique({ where: { id: b } })]);
    if (!ca || !cb || !cb.isActive) return false;
    if (ca.parentId === cb.parentId) return true;
    const f = await db.childFriend.findFirst({
      where: { status: 'approved', OR: [{ childId: a, friendChildId: b }, { childId: b, friendChildId: a }] },
    });
    return !!f;
  }

  // ─── Défis duo ─────────────────────────────────────────────────────────────

  async createDuo(p: ChildPrincipal, input: CreateDuoInput) {
    if (input.partnerChildId === p.childId) throw badRequest('DUO_SELF', 'Choisis un autre enfant');
    if (!(await this.canDuo(this.prisma, p.childId, input.partnerChildId))) {
      throw forbidden('NOT_FRIENDS', "Vous n'êtes pas encore amis — demandez à vos parents");
    }
    const activity = await this.prisma.activity.findFirst({ where: { id: input.activityId, isActive: true } });
    if (!activity) throw notFound('ACTIVITY_NOT_FOUND', 'Activité introuvable');
    return this.prisma.tx(async (tx) => {
      const duo = await tx.duoChallenge.create({
        data: {
          activityId: activity.id,
          initiatorChildId: p.childId,
          partnerChildId: input.partnerChildId,
          startsAt: input.startsAt ? new Date(input.startsAt) : null,
        },
      });
      await this.events.publish(tx, 'duo.invited', {
        aggregateType: 'duo_challenge',
        aggregateId: duo.id,
        payload: { challengeId: duo.id, initiatorChildId: p.childId, partnerChildId: input.partnerChildId, startsAt: duo.startsAt?.toISOString() ?? null },
        actor: actorOf(p),
      });
      return duo;
    });
  }

  duos(p: ChildPrincipal) {
    return this.prisma.duoChallenge.findMany({
      where: { OR: [{ initiatorChildId: p.childId }, { partnerChildId: p.childId }] },
      include: { activity: true, initiator: childCard, partner: childCard },
      orderBy: { createdAt: 'desc' },
    });
  }

  async respondDuo(p: ChildPrincipal, id: string, accept: boolean) {
    return this.prisma.tx(async (tx) => {
      const duo = await tx.duoChallenge.findUnique({ where: { id } });
      if (!duo || duo.partnerChildId !== p.childId) throw notFound('DUO_NOT_FOUND', 'Défi introuvable');
      if (duo.status !== 'invited') throw conflict('INVALID_STATUS', 'Ce défi a déjà reçu une réponse');
      if (duo.expiresAt <= this.clock.now()) throw conflict('DUO_EXPIRED', 'Ce défi a expiré');
      const updated = await tx.duoChallenge.update({ where: { id }, data: { status: accept ? 'accepted' : 'declined' } });
      if (accept) {
        await this.events.publish(tx, 'duo.accepted', { aggregateType: 'duo_challenge', aggregateId: id, payload: { challengeId: id }, actor: actorOf(p) });
      } else {
        await this.events.publish(tx, 'duo.closed', { aggregateType: 'duo_challenge', aggregateId: id, payload: { challengeId: id, status: 'declined' }, actor: actorOf(p) });
      }
      return updated;
    });
  }

  async cancelDuo(p: ChildPrincipal, id: string) {
    return this.prisma.tx(async (tx) => {
      const duo = await tx.duoChallenge.findUnique({ where: { id } });
      if (!duo || duo.initiatorChildId !== p.childId) throw notFound('DUO_NOT_FOUND', 'Défi introuvable');
      if (!['invited', 'accepted', 'active'].includes(duo.status)) throw conflict('INVALID_STATUS', 'Ce défi est terminé');
      const updated = await tx.duoChallenge.update({ where: { id }, data: { status: 'cancelled' } });
      await this.events.publish(tx, 'duo.closed', { aggregateType: 'duo_challenge', aggregateId: id, payload: { challengeId: id, status: 'cancelled' }, actor: actorOf(p) });
      return updated;
    });
  }

  /** Chacun déclare sa part ; quand les deux l'ont fait, le bonus est versé aux deux. */
  async completePart(p: ChildPrincipal, id: string) {
    return this.prisma.tx(async (tx) => {
      await tx.$queryRaw`SELECT id FROM duo_challenges WHERE id = ${id}::uuid FOR UPDATE`;
      const duo = await tx.duoChallenge.findUnique({ where: { id }, include: { activity: true } });
      if (!duo || ![duo.initiatorChildId, duo.partnerChildId].includes(p.childId)) throw notFound('DUO_NOT_FOUND', 'Défi introuvable');
      if (!['accepted', 'active'].includes(duo.status)) throw conflict('INVALID_STATUS', "Ce défi n'est pas en cours");
      const now = this.clock.now();
      const isInitiator = duo.initiatorChildId === p.childId;
      const initiatorDoneAt = isInitiator ? (duo.initiatorDoneAt ?? now) : duo.initiatorDoneAt;
      const partnerDoneAt = isInitiator ? duo.partnerDoneAt : (duo.partnerDoneAt ?? now);
      const completed = !!initiatorDoneAt && !!partnerDoneAt;

      const updated = await tx.duoChallenge.update({
        where: { id },
        data: { initiatorDoneAt, partnerDoneAt, status: completed ? 'completed' : 'active', completedAt: completed ? now : null },
      });
      if (completed) {
        for (const childId of [duo.initiatorChildId, duo.partnerChildId]) {
          await this.gamification.award(tx, { childId, points: duo.bonusPoints, source: 'bonus', sourceId: duo.id, reason: `Défi duo : ${duo.activity.title}` });
        }
        await this.events.publish(tx, 'duo.completed', {
          aggregateType: 'duo_challenge',
          aggregateId: id,
          payload: { challengeId: id, bonusPoints: duo.bonusPoints },
          actor: actorOf(p),
        });
      }
      return updated;
    });
  }

  async expireDuos(): Promise<number> {
    const expired = await this.prisma.duoChallenge.findMany({
      where: { status: 'invited', expiresAt: { lt: this.clock.now() } },
      select: { id: true },
    });
    for (const { id } of expired) {
      await this.prisma.tx(async (tx) => {
        const res = await tx.duoChallenge.updateMany({ where: { id, status: 'invited' }, data: { status: 'expired' } });
        if (res.count) {
          await this.events.publish(tx, 'duo.closed', { aggregateType: 'duo_challenge', aggregateId: id, payload: { challengeId: id, status: 'expired' }, actor: { kind: 'system', id: 'duo-expiry' } });
        }
      });
    }
    return expired.length;
  }
}
