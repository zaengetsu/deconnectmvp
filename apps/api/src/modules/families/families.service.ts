import { Injectable } from '@nestjs/common';
import type { CreateChildInput, CreateFamilyInvitationInput, UpdateChildInput, UpdateProfileInput } from '@rekonect/contracts';
import { AccessService } from '../../platform/auth/access.service';
import { actorOf, type UserPrincipal } from '../../platform/auth/principal';
import { Clock } from '../../platform/clock';
import { normalizeShortCode, randomHex, shortCode } from '../../platform/crypto';
import { EventBus } from '../../platform/events/event-bus';
import { badRequest, conflict, notFound } from '../../platform/http/errors';
import { PrismaService } from '../../platform/prisma/prisma.service';
import { EntitlementsService } from '../billing/entitlements.service';
import { TokenService } from '../identity/token.service';

export const LINK_CODE_TTL_MINUTES = 15;

@Injectable()
export class FamiliesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly events: EventBus,
    private readonly tokens: TokenService,
    private readonly clock: Clock,
    private readonly entitlements: EntitlementsService,
  ) {}

  // ─── Profil parent ─────────────────────────────────────────────────────────

  async profile(p: UserPrincipal) {
    const profile = await this.prisma.profile.findUnique({
      where: { id: p.userId },
      include: { subscriptions: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    if (!profile) throw notFound('PROFILE_NOT_FOUND', 'Profil introuvable');
    const { subscriptions, ...rest } = profile;
    return { ...rest, subscription: subscriptions[0] ?? null };
  }

  async updateProfile(p: UserPrincipal, input: UpdateProfileInput) {
    return this.prisma.tx(async (tx) => {
      const profile = await tx.profile.update({ where: { id: p.userId }, data: input });
      if (input.fullName) await tx.user.update({ where: { id: p.userId }, data: { fullName: input.fullName } });
      return profile;
    });
  }

  // ─── Enfants ───────────────────────────────────────────────────────────────

  listChildren(p: UserPrincipal) {
    return this.prisma.child.findMany({
      where: { parentId: p.userId, isActive: true },
      orderBy: { createdAt: 'asc' },
      select: childSelect,
    });
  }

  async getChild(p: UserPrincipal, childId: string) {
    await this.access.assertParentOwnsChild(p.userId, childId);
    return this.prisma.child.findUniqueOrThrow({ where: { id: childId }, select: childSelect });
  }

  async createChild(p: UserPrincipal, input: CreateChildInput) {
    return this.prisma.tx(async (tx) => {
      await this.entitlements.assertCanAddChild(p.userId, tx);
      const child = await tx.child.create({
        data: { parentId: p.userId, displayName: input.displayName, age: input.age, avatarUrl: input.avatarUrl ?? null },
        select: childSelect,
      });
      // Préférences enfant : heures silencieuses 20h30 → 7h30 par défaut (5.16).
      await tx.notificationPreference.create({
        data: {
          parentId: p.userId,
          childId: child.id,
          quietHoursStart: new Date('1970-01-01T20:30:00Z'),
          quietHoursEnd: new Date('1970-01-01T07:30:00Z'),
        },
      });
      await this.events.publish(tx, 'child.created', {
        aggregateType: 'child',
        aggregateId: child.id,
        payload: { childId: child.id, parentId: p.userId },
        actor: { kind: 'parent', id: p.userId },
      });
      return child;
    });
  }

  async updateChild(p: UserPrincipal, childId: string, input: UpdateChildInput) {
    await this.access.assertParentOwnsChild(p.userId, childId);
    return this.prisma.child.update({ where: { id: childId }, data: input, select: childSelect });
  }

  /** Suppression douce : l'historique est conservé, l'appareil est déconnecté. */
  async archiveChild(p: UserPrincipal, childId: string) {
    await this.access.assertParentOwnsChild(p.userId, childId);
    await this.prisma.tx(async (tx) => {
      await tx.child.update({ where: { id: childId }, data: { isActive: false } });
      await this.tokens.revokeAllForChild(childId, tx);
      await tx.pushToken.deleteMany({ where: { childId } });
    });
    return { success: true };
  }

  /** Code de liaison de l'appareil enfant : QR (jeton long) + code court à 6 caractères, 15 min. */
  async createLinkCode(p: UserPrincipal, childId: string) {
    await this.access.assertParentOwnsChild(p.userId, childId);
    const expiresAt = new Date(this.clock.now().getTime() + LINK_CODE_TTL_MINUTES * 60_000);
    return this.prisma.tx(async (tx) => {
      await tx.childLinkToken.updateMany({ where: { childId, status: 'pending' }, data: { status: 'expired' } });
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = shortCode();
        const clash = await tx.childLinkToken.findFirst({ where: { shortCode: code, status: 'pending' } });
        if (clash) continue;
        const row = await tx.childLinkToken.create({
          data: { childId, parentId: p.userId, token: randomHex(16), shortCode: code, expiresAt },
        });
        return { token: row.token, code: row.shortCode, expiresAt: row.expiresAt };
      }
      throw conflict('LINK_CODE_UNAVAILABLE', 'Réessayez dans un instant');
    });
  }

  async revokeChildSessions(p: UserPrincipal, childId: string) {
    await this.access.assertParentOwnsChild(p.userId, childId);
    const revoked = await this.prisma.tx(async (tx) => {
      const n = await this.tokens.revokeAllForChild(childId, tx);
      await tx.pushToken.deleteMany({ where: { childId } });
      await tx.child.update({ where: { id: childId }, data: { deviceLinkedAt: null } });
      return n;
    });
    return { revoked };
  }

  // ─── Co-parents ────────────────────────────────────────────────────────────

  async members(p: UserPrincipal) {
    const [owned, joined] = await Promise.all([
      this.prisma.familyMember.findMany({ where: { ownerId: p.userId, status: { not: 'revoked' } }, orderBy: { createdAt: 'asc' } }),
      this.prisma.familyMember.findMany({
        where: { memberId: p.userId, status: 'active' },
        include: { owner: { select: { id: true, fullName: true, email: true } } },
      }),
    ]);
    return { members: owned, memberships: joined };
  }

  async createInvitation(p: UserPrincipal, input: CreateFamilyInvitationInput) {
    await this.entitlements.assertCanAddCoParent(p.userId);
    const inv = await this.prisma.tx(async (tx) => {
      let code = shortCode();
      for (let attempt = 0; attempt < 5 && (await tx.familyInvitation.findFirst({ where: { shortCode: code, status: 'pending' } })); attempt++) code = shortCode();
      const row = await tx.familyInvitation.create({
        data: { ownerId: p.userId, memberRole: input.memberRole, inviteEmail: input.email ?? null, shortCode: code },
      });
      await this.events.publish(tx, 'family.invitation_created', {
        aggregateType: 'family_invitation',
        aggregateId: row.id,
        payload: { invitationId: row.id, ownerId: p.userId, email: row.inviteEmail, role: row.memberRole },
        actor: actorOf(p),
      });
      return row;
    });
    return { token: inv.token, code: inv.shortCode, role: inv.memberRole, expiresAt: inv.expiresAt };
  }

  async acceptInvitation(p: UserPrincipal, token: string) {
    const now = this.clock.now();
    const raw = token.trim();
    const byCode = raw.length <= 8;
    const inv = await this.prisma.familyInvitation.findFirst({
      where: { ...(byCode ? { shortCode: normalizeShortCode(raw) } : { token: raw }), status: 'pending', expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
      include: { owner: { select: { fullName: true } } },
    });
    if (!inv) throw badRequest('INVITATION_INVALID', 'Invitation invalide ou expirée');
    if (inv.ownerId === p.userId) throw badRequest('INVITATION_SELF', 'Vous ne pouvez pas accepter votre propre invitation');
    const me = await this.prisma.profile.findUniqueOrThrow({ where: { id: p.userId } });
    await this.prisma.tx(async (tx) => {
      const already = await tx.familyMember.findFirst({ where: { ownerId: inv.ownerId, memberId: p.userId, status: 'active' } });
      if (!already) await this.entitlements.assertCanAddCoParent(inv.ownerId, tx);
      await tx.familyInvitation.update({ where: { id: inv.id }, data: { status: 'accepted' } });
      const existing = await tx.familyMember.findFirst({ where: { ownerId: inv.ownerId, memberId: p.userId } });
      if (existing) {
        await tx.familyMember.update({ where: { id: existing.id }, data: { status: 'active', memberRole: inv.memberRole, joinedAt: now } });
      } else {
        await tx.familyMember.create({
          data: { ownerId: inv.ownerId, memberId: p.userId, memberEmail: me.email, memberRole: inv.memberRole, status: 'active', joinedAt: now },
        });
      }
      if (!already) {
        await this.events.publish(tx, 'family.member_joined', {
          aggregateType: 'family_invitation',
          aggregateId: inv.id,
          payload: { ownerId: inv.ownerId, memberId: p.userId, role: inv.memberRole },
          actor: actorOf(p),
        });
      }
    });
    return { ownerName: inv.owner.fullName, role: inv.memberRole };
  }

  async revokeMember(p: UserPrincipal, memberId: string) {
    const res = await this.prisma.familyMember.updateMany({ where: { id: memberId, ownerId: p.userId }, data: { status: 'revoked' } });
    if (res.count === 0) throw notFound('MEMBER_NOT_FOUND', 'Membre introuvable');
    return { success: true };
  }
}

export const childSelect = {
  id: true,
  parentId: true,
  displayName: true,
  age: true,
  avatarUrl: true,
  totalPoints: true,
  level: true,
  streakDays: true,
  lastActivityDate: true,
  deviceLinkedAt: true,
  isActive: true,
  createdAt: true,
} as const;
