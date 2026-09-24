import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  AcceptPartnerInvitationInput,
  ChangeEmailInput,
  ChangePasswordInput,
  ChildLinkInput,
  ChildPinLoginInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
} from '@rekonect/contracts';
import { ENV, type Env } from '../../config/env';
import type { Principal, UserPrincipal } from '../../platform/auth/principal';
import { Clock } from '../../platform/clock';
import { hashSecret, isLegacyHash, normalizeShortCode, randomToken, sha256, verifySecret } from '../../platform/crypto';
import { EventBus } from '../../platform/events/event-bus';
import { badRequest, conflict, notFound, tooMany, unauthorized } from '../../platform/http/errors';
import { EmailService } from '../../platform/mail/email.service';
import { PrismaService } from '../../platform/prisma/prisma.service';
import { TokenService } from './token.service';

export const PIN_MAX_ATTEMPTS = 5;
export const PIN_LOCK_MINUTES = 15;

interface Meta {
  userAgent?: string | null;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger('Auth');

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly events: EventBus,
    private readonly emails: EmailService,
    private readonly clock: Clock,
    @Inject(ENV) private readonly env: Env,
  ) {}

  // ─── Parents ───────────────────────────────────────────────────────────────

  async register(input: RegisterInput, meta: Meta = {}) {
    const exists = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (exists) throw conflict('EMAIL_TAKEN', 'Un compte existe déjà avec cet email');
    const passwordHash = await hashSecret(input.password);

    return this.prisma.tx(async (tx) => {
      const user = await tx.user.create({
        data: { email: input.email, passwordHash, role: 'parent', fullName: input.fullName, lastLoginAt: this.clock.now() },
      });
      await tx.profile.create({ data: { id: user.id, email: user.email, fullName: input.fullName, role: 'parent' } });
      await tx.subscription.create({ data: { parentId: user.id, plan: 'free', status: 'active' } });
      await tx.notificationPreference.create({ data: { parentId: user.id } });
      await this.events.publish(tx, 'user.registered', {
        aggregateType: 'user',
        aggregateId: user.id,
        payload: { userId: user.id, role: 'parent', email: user.email },
        actor: { kind: 'parent', id: user.id },
      });
      const pair = await this.tokens.issue({ userId: user.id, role: 'parent' }, meta, tx);
      return { ...this.stripId(pair), user: this.publicUser(user) };
    });
  }

  async login(input: LoginInput, meta: Meta = {}) {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    // Même message que le compte existe ou non : pas d'énumération des emails.
    const ok = await verifySecret(user?.passwordHash, input.password);
    if (!user || !ok) throw unauthorized('INVALID_CREDENTIALS', 'Email ou mot de passe incorrect');
    if (user.disabledAt) throw unauthorized('ACCOUNT_DISABLED', 'Ce compte est désactivé');

    const data: { lastLoginAt: Date; passwordHash?: string } = { lastLoginAt: this.clock.now() };
    if (user.passwordHash && isLegacyHash(user.passwordHash)) data.passwordHash = await hashSecret(input.password);
    await this.prisma.user.update({ where: { id: user.id }, data });

    const knownDevice = await this.isKnownDevice(user.id, meta.userAgent);
    const pair = await this.tokens.issue({ userId: user.id, role: user.role as 'parent' | 'admin' | 'partner' }, meta);
    if (!knownDevice && meta.userAgent) {
      await this.emails.queue(this.prisma, 'auth.new_login', {
        to: user.email,
        toName: user.fullName,
        recipientId: user.id,
        data: { device: describeDevice(meta.userAgent), when: formatParisDateTime(this.clock.now()) },
        dedupKey: `new_login:${user.id}:${sha256(meta.userAgent).slice(0, 16)}`,
      });
    }
    return { ...this.stripId(pair), user: this.publicUser(user) };
  }

  /**
   * Appareil déjà vu : même navigateur / app lors d'une connexion précédente. Première connexion du compte :
   * rien à signaler (c'est l'inscription). Sans User-Agent, on ne conclut rien.
   */
  private async isKnownDevice(userId: string, userAgent: string | null | undefined): Promise<boolean> {
    if (!userAgent) return true;
    const previous = await this.prisma.refreshToken.findMany({ where: { userId }, select: { userAgent: true }, orderBy: { createdAt: 'desc' }, take: 50 });
    if (previous.length === 0) return true;
    return previous.some((t) => t.userAgent === userAgent);
  }

  refresh(refreshToken: string, meta: Meta = {}) {
    return this.tokens.rotate(refreshToken, meta.userAgent);
  }

  async logout(refreshToken: string | undefined, p: Principal, pushToken?: string) {
    if (refreshToken) await this.tokens.revoke(refreshToken);
    if (pushToken) {
      // Un appareil déconnecté ne doit plus recevoir les notifications de ce compte.
      await this.prisma.pushToken.deleteMany({
        where: p.kind === 'child' ? { token: pushToken, childId: p.childId } : { token: pushToken, userId: p.userId },
      });
    }
    return { success: true };
  }

  async me(p: Principal) {
    if (p.kind === 'child') {
      const child = await this.prisma.child.findUnique({ where: { id: p.childId } });
      if (!child) throw notFound('CHILD_NOT_FOUND', 'Profil introuvable');
      return { kind: 'child' as const, child: this.publicChild(child) };
    }
    const user = await this.prisma.user.findUnique({
      where: { id: p.userId },
      include: { partnerMembers: { where: { status: 'active' }, include: { partner: true } } },
    });
    if (!user) throw notFound('USER_NOT_FOUND', 'Compte introuvable');
    return {
      kind: 'user' as const,
      user: this.publicUser(user),
      partners: user.partnerMembers.map((m) => ({
        id: m.partner.id,
        name: m.partner.name,
        slug: m.partner.slug,
        status: m.partner.status,
        logoUrl: m.partner.logoUrl,
        role: m.role,
      })),
    };
  }

  // ─── Mot de passe ──────────────────────────────────────────────────────────

  async forgotPassword(email: string): Promise<{ success: true }> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user && !user.disabledAt) {
      const raw = randomToken(32);
      const now = this.clock.now();
      await this.prisma.tx(async (tx) => {
        await tx.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: now } });
        await tx.passwordResetToken.create({
          data: { userId: user.id, token: sha256(raw), expiresAt: new Date(now.getTime() + 3_600_000) },
        });
      });
      const base =
        user.role === 'admin' ? this.env.WEB_ADMIN_URL : user.role === 'partner' ? this.env.WEB_PARTNERS_URL : this.env.MOBILE_APP_URL;
      const url = `${base.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(raw)}`;
      const res = await this.emails.sendNow('auth.password_reset', { to: user.email, toName: user.fullName, recipientId: user.id, data: { url } });
      if (res.status !== 'pending') this.logger.warn(`Email de réinitialisation non envoyé : ${res.status}`);
    }
    return { success: true };
  }

  async resetPassword(input: ResetPasswordInput) {
    const now = this.clock.now();
    const row = await this.prisma.passwordResetToken.findUnique({ where: { token: sha256(input.token) } });
    if (!row || row.usedAt || row.expiresAt <= now) throw badRequest('RESET_TOKEN_INVALID', 'Lien invalide ou expiré');
    const passwordHash = await hashSecret(input.password);
    const user = await this.prisma.tx(async (tx) => {
      await tx.passwordResetToken.update({ where: { id: row.id }, data: { usedAt: now } });
      const u = await tx.user.update({ where: { id: row.userId }, data: { passwordHash } });
      await this.tokens.revokeAllForUser(u.id, tx);
      return u;
    });
    await this.emails.sendNow('auth.password_changed', { to: user.email, toName: user.fullName, recipientId: user.id, data: {} });
    return { success: true };
  }

  // ─── Compte connecté ───────────────────────────────────────────────────────

  /** Nouveau mot de passe : les autres sessions sont fermées, celle-ci reçoit une nouvelle paire de jetons. */
  async changePassword(p: UserPrincipal, input: ChangePasswordInput, meta: Meta = {}) {
    const user = await this.prisma.user.findUnique({ where: { id: p.userId } });
    if (!user || !(await verifySecret(user.passwordHash, input.currentPassword))) {
      throw unauthorized('INVALID_CREDENTIALS', 'Mot de passe actuel incorrect');
    }
    const passwordHash = await hashSecret(input.newPassword);
    const pair = await this.prisma.tx(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
      await this.tokens.revokeAllForUser(user.id, tx);
      return this.tokens.issue({ userId: user.id, role: user.role as 'parent' | 'admin' | 'partner' }, meta, tx);
    });
    await this.emails.sendNow('auth.password_changed', { to: user.email, toName: user.fullName, recipientId: user.id, data: {} });
    return { ...this.stripId(pair), user: this.publicUser(user) };
  }

  /** Nouvelle adresse, confirmée par le mot de passe. L'ancienne adresse est prévenue. */
  async changeEmail(p: UserPrincipal, input: ChangeEmailInput) {
    const user = await this.prisma.user.findUnique({ where: { id: p.userId } });
    if (!user || !(await verifySecret(user.passwordHash, input.password))) {
      throw unauthorized('INVALID_CREDENTIALS', 'Mot de passe incorrect');
    }
    if (input.email === user.email) return { user: this.publicUser(user) };
    const taken = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (taken) throw conflict('EMAIL_TAKEN', 'Un compte existe déjà avec cet email');
    const updated = await this.prisma.tx(async (tx) => {
      const u = await tx.user.update({ where: { id: user.id }, data: { email: input.email, emailVerifiedAt: null } });
      await tx.profile.updateMany({ where: { id: user.id }, data: { email: input.email } });
      return u;
    });
    await this.emails.sendNow('auth.email_changed', { to: user.email, toName: user.fullName, recipientId: user.id, data: { newEmail: input.email } });
    return { user: this.publicUser(updated) };
  }

  // ─── Enfants ───────────────────────────────────────────────────────────────

  /** L'appareil de l'enfant échange le QR / code court + un PIN choisi contre une session enfant. */
  async claimChildLink(input: ChildLinkInput, meta: Meta = {}) {
    const now = this.clock.now();
    const raw = input.code.trim();
    const where = /^[0-9a-fA-F]{32}$/.test(raw)
      ? { token: raw.toLowerCase() }
      : { shortCode: normalizeShortCode(raw) };
    const link = await this.prisma.childLinkToken.findFirst({
      where: { ...where, status: 'pending', expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
      include: { child: true, parent: { select: { fullName: true } } },
    });
    if (!link || !link.child.isActive) {
      throw badRequest('LINK_CODE_INVALID', "Code invalide ou expiré. Demande à ton parent d'en générer un nouveau.");
    }
    const pinHash = await hashSecret(input.pin);

    return this.prisma.tx(async (tx) => {
      const claimed = await tx.childLinkToken.updateMany({
        where: { id: link.id, status: 'pending' },
        data: { status: 'linked', linkedAt: now, pinHash, deviceId: input.deviceId ?? null },
      });
      if (claimed.count === 0) throw badRequest('LINK_CODE_INVALID', 'Ce code vient déjà d’être utilisé.');
      const child = await tx.child.update({
        where: { id: link.childId },
        data: { pinHash, failedPinAttempts: 0, pinLockedUntil: null, deviceLinkedAt: now },
      });
      await this.events.publish(tx, 'child.device_linked', {
        aggregateType: 'child',
        aggregateId: child.id,
        payload: { childId: child.id, parentId: child.parentId },
        actor: { kind: 'child', id: child.id },
      });
      const pair = await this.tokens.issue({ childId: child.id, parentId: child.parentId }, { deviceId: input.deviceId, ...meta }, tx);
      return { ...this.stripId(pair), child: this.publicChild(child), parentName: link.parent.fullName };
    });
  }

  /** Reconnexion de l'enfant avec son PIN : 5 essais, puis blocage 15 minutes (migration 016). */
  async childPinLogin(input: ChildPinLoginInput, meta: Meta = {}) {
    const now = this.clock.now();
    const child = await this.prisma.child.findFirst({ where: { id: input.childId, isActive: true } });
    if (!child) throw notFound('CHILD_NOT_FOUND', 'Profil introuvable');

    if (child.pinLockedUntil && child.pinLockedUntil > now) {
      throw tooMany('PIN_LOCKED', `Trop de tentatives. Réessaie dans ${PIN_LOCK_MINUTES} minutes.`, {
        lockedUntil: child.pinLockedUntil,
      });
    }
    const attemptsSoFar = child.pinLockedUntil ? 0 : child.failedPinAttempts;
    if (!child.pinHash) throw badRequest('PIN_NOT_SET', 'Aucun PIN configuré');

    if (!(await verifySecret(child.pinHash, input.pin))) {
      const attempts = attemptsSoFar + 1;
      const locked = attempts >= PIN_MAX_ATTEMPTS;
      await this.prisma.child.update({
        where: { id: child.id },
        data: {
          failedPinAttempts: locked ? 0 : attempts,
          pinLockedUntil: locked ? new Date(now.getTime() + PIN_LOCK_MINUTES * 60_000) : null,
        },
      });
      if (locked) throw tooMany('PIN_LOCKED', `Trop de tentatives. Réessaie dans ${PIN_LOCK_MINUTES} minutes.`);
      throw unauthorized('PIN_INVALID', 'PIN incorrect');
    }

    const data: { failedPinAttempts: number; pinLockedUntil: null; pinHash?: string } = { failedPinAttempts: 0, pinLockedUntil: null };
    if (isLegacyHash(child.pinHash)) data.pinHash = await hashSecret(input.pin);
    const updated = await this.prisma.child.update({ where: { id: child.id }, data });
    const pair = await this.tokens.issue({ childId: child.id, parentId: child.parentId }, { deviceId: input.deviceId, ...meta });
    return { ...this.stripId(pair), child: this.publicChild(updated) };
  }

  // ─── Partenaires ───────────────────────────────────────────────────────────

  async acceptPartnerInvitation(input: AcceptPartnerInvitationInput, meta: Meta = {}) {
    const now = this.clock.now();
    const member = await this.prisma.partnerMember.findFirst({
      where: { inviteTokenHash: sha256(input.token), status: 'invited' },
      include: { partner: true },
    });
    if (!member || (member.inviteExpiresAt && member.inviteExpiresAt <= now)) {
      throw badRequest('INVITATION_INVALID', 'Invitation invalide ou expirée');
    }
    const existing = await this.prisma.user.findUnique({ where: { email: member.email } });
    if (existing && existing.role !== 'partner') {
      throw conflict('EMAIL_TAKEN', 'Cet email est déjà utilisé par un compte Rekonect. Demandez une invitation sur une autre adresse.');
    }
    const passwordHash = await hashSecret(input.password);

    return this.prisma.tx(async (tx) => {
      const user = existing
        ? await tx.user.update({ where: { id: existing.id }, data: { passwordHash, fullName: input.fullName, lastLoginAt: now } })
        : await tx.user.create({
            data: { email: member.email, passwordHash, role: 'partner', fullName: input.fullName, emailVerifiedAt: now, lastLoginAt: now },
          });
      await tx.partnerMember.update({
        where: { id: member.id },
        data: { userId: user.id, status: 'active', joinedAt: now, inviteTokenHash: null, inviteExpiresAt: null },
      });
      await this.events.publish(tx, 'partner.member_joined', {
        aggregateType: 'partner_member',
        aggregateId: member.id,
        payload: { partnerId: member.partnerId, memberId: member.id, userId: user.id, role: member.role },
        actor: { kind: 'partner', id: user.id },
      });
      if (member.role === 'owner' && member.partner.status === 'pending') {
        await tx.partner.update({ where: { id: member.partnerId }, data: { status: 'active' } });
      }
      const pair = await this.tokens.issue({ userId: user.id, role: 'partner' }, meta, tx);
      return { ...this.stripId(pair), user: this.publicUser(user), partnerId: member.partnerId };
    });
  }

  // ─── Présentation ──────────────────────────────────────────────────────────

  private stripId<T extends { id: string }>(pair: T): Omit<T, 'id'> {
    const { id: _id, ...rest } = pair;
    return rest;
  }

  publicUser(u: { id: string; email: string; role: string; fullName: string | null; createdAt: Date }) {
    return { id: u.id, email: u.email, role: u.role, fullName: u.fullName, createdAt: u.createdAt };
  }

  publicChild(c: { id: string; displayName: string; avatarUrl: string | null; age: number; level: number; totalPoints: number; parentId: string; streakDays: number; lastActivityDate?: Date | null; isActive?: boolean }) {
    return {
      id: c.id,
      displayName: c.displayName,
      avatarUrl: c.avatarUrl,
      age: c.age,
      level: c.level,
      totalPoints: c.totalPoints,
      streakDays: c.streakDays,
      lastActivityDate: c.lastActivityDate ?? null,
      isActive: c.isActive ?? true,
      parentId: c.parentId,
    };
  }
}

/** Libellé lisible d'un User-Agent (« iPhone · Safari », « Mac · Chrome », « App Rekonect »). */
export function describeDevice(ua: string): string {
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : null;
  const app = /Rekonect|Capacitor|okhttp|CFNetwork|Dart/i.test(ua) ? 'App Rekonect' : null;
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : null;
  const parts = [os, app ?? browser].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Appareil inconnu';
}

export function formatParisDateTime(d: Date): string {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Paris' }).format(d);
}
