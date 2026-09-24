import { Inject, Injectable, Logger } from '@nestjs/common';
import type { CreatePartnerInput, InvitePartnerMemberInput, PartnerMemberRole, PlaceInput, UpdatePartnerInput } from '@rekonect/contracts';
import { z } from 'zod';
import { ENV, type Env } from '../../config/env';
import { AccessService } from '../../platform/auth/access.service';
import type { Principal, UserPrincipal } from '../../platform/auth/principal';
import { Clock } from '../../platform/clock';
import { randomToken, sha256 } from '../../platform/crypto';
import { EventBus } from '../../platform/events/event-bus';
import { conflict, forbidden, notFound } from '../../platform/http/errors';
import { Mailer } from '../../platform/mail/mailer';
import { mails } from '../../platform/mail/templates';
import { Prisma, PrismaService } from '../../platform/prisma/prisma.service';
import { EntitlementsService } from '../billing/entitlements.service';
import { normalizeRk, slugify } from './offer-rules';

const INVITE_TTL_DAYS = 7;

export const AdminCreatePartnerInput = z.object({
  name: z.string().trim().min(2).max(120),
  kind: z.enum(['brand', 'store', 'retailer', 'association', 'local_business', 'public_institution', 'cse']).default('brand'),
  subtitle: z.string().max(120).optional(),
  description: z.string().max(2000).optional(),
  websiteUrl: z.url().optional(),
  logoUrl: z.url().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  contactEmail: z.email().optional(),
  ownerEmail: z.string().trim().toLowerCase().pipe(z.email()),
  planId: z.enum(['partner_local', 'partner_network', 'partner_public']).default('partner_local'),
  parentPartnerId: z.uuid().optional(),
  status: z.enum(['pending', 'onboarding', 'trial', 'active']).default('onboarding'),
});
export type AdminCreatePartnerInput = z.infer<typeof AdminCreatePartnerInput>;

export const CreateStoreInput = z.object({
  name: z.string().trim().min(2).max(120),
  address: z.string().max(200).optional(),
  postalCode: z.string().max(10).optional(),
  city: z.string().max(120).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  managerName: z.string().max(120).optional(),
  managerEmail: z.string().trim().toLowerCase().pipe(z.email()),
  accessLevel: z.enum(['delegated', 'read']).default('delegated'),
});
export type CreateStoreInput = z.infer<typeof CreateStoreInput>;

const KIND_LABELS: Record<string, string> = {
  brand: 'Enseigne',
  store: 'Magasin',
  retailer: 'Commerce',
  association: 'Association',
  local_business: 'Commerce',
  public_institution: 'Collectivité',
  cse: 'CSE',
};
export const kindLabel = (k: string) => KIND_LABELS[k] ?? k;

export function initials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  const meaningful = words.filter((w) => !['de', 'du', 'des', 'la', 'le', 'les', 'et', 'd'].includes(w.toLowerCase()));
  const src = meaningful.length ? meaningful : words;
  return (src.length > 1 ? src[0][0] + src[1][0] : (src[0] ?? '?').slice(0, 2)).toUpperCase();
}

@Injectable()
export class PartnersService {
  private readonly logger = new Logger('Partners');

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly events: EventBus,
    private readonly mailer: Mailer,
    private readonly clock: Clock,
    private readonly entitlements: EntitlementsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private async uniqueSlug(name: string): Promise<string> {
    const base = slugify(name);
    let slug = base;
    for (let i = 2; await this.prisma.partner.findUnique({ where: { slug } }); i++) slug = `${base}-${i}`;
    return slug;
  }

  // ─── Organisations ─────────────────────────────────────────────────────────

  /** Création par l'équipe Rekonect (« + Inviter un partenaire ») : organisation, abonnement, invitation du responsable. */
  async create(admin: UserPrincipal, input: AdminCreatePartnerInput) {
    const { ownerEmail, planId, ...data } = input;
    const partner = await this.prisma.tx(async (tx) => {
      const p = await tx.partner.create({ data: { ...data, slug: await this.uniqueSlug(input.name), createdBy: admin.userId } });
      if (!input.parentPartnerId) {
        await tx.subscription.create({ data: { partnerId: p.id, plan: planId, status: input.status === 'trial' ? 'trialing' : 'active' } });
      }
      return p;
    });
    const invitation = await this.invite(partner.id, { email: ownerEmail, role: 'owner' });
    return { ...partner, invitation };
  }

  /** Un magasin rattaché à une enseigne : compte, lieu chez l'enseigne, invitation du directeur. */
  async createStore(p: UserPrincipal, brandId: string, input: CreateStoreInput) {
    await this.access.assertPartnerMember(p, brandId, 'owner');
    const brand = await this.prisma.partner.findUniqueOrThrow({ where: { id: brandId } });
    if (brand.parentPartnerId) throw forbidden('STORE_OF_STORE', 'Un magasin ne peut pas avoir de magasins rattachés');
    await this.entitlements.assertCanAddPlace(brandId);
    const store = await this.prisma.tx(async (tx) => {
      const s = await tx.partner.create({
        data: {
          name: input.name,
          slug: await this.uniqueSlug(input.name),
          kind: 'store',
          subtitle: `Rattaché à ${brand.name}`,
          color: brand.color,
          logoUrl: brand.logoUrl,
          status: 'active',
          parentPartnerId: brandId,
          createdBy: p.userId,
        },
      });
      const place = {
        name: input.name,
        address: input.address,
        postalCode: input.postalCode,
        city: input.city,
        latitude: input.latitude,
        longitude: input.longitude,
        managerName: input.managerName,
      };
      await tx.partnerPlace.create({ data: { ...place, partnerId: brandId, linkedPartnerId: s.id, accessLevel: input.accessLevel } });
      await tx.partnerPlace.create({ data: { ...place, partnerId: s.id, accessLevel: 'admin' } });
      return s;
    });
    const invitation = await this.invite(store.id, { email: input.managerEmail, role: input.accessLevel === 'read' ? 'viewer' : 'owner' });
    return { ...store, invitation };
  }

  async list(q?: string) {
    const rows = await this.prisma.partner.findMany({
      where: q ? { name: { contains: q, mode: 'insensitive' } } : {},
      include: {
        subscriptions: { select: { plan: true, status: true }, take: 1 },
        _count: { select: { places: { where: { isActive: true } }, offers: { where: { status: 'published' } }, members: { where: { status: 'active' } } } },
      },
      orderBy: [{ createdAt: 'asc' }],
    });
    const since = new Date(this.clock.now().getTime() - 30 * 86_400_000);
    const touched = await this.prisma.$queryRaw<{ partner_id: string; kids: bigint }[]>`
      SELECT o.partner_id, count(DISTINCT i.viewer_key) AS kids
      FROM offer_impressions i JOIN partner_offers o ON o.id = i.offer_id
      WHERE i.viewer_key LIKE 'child:%' AND i.day >= ${since}::date
      GROUP BY o.partner_id`;
    const kidsBy = new Map(touched.map((t) => [t.partner_id, Number(t.kids)]));
    const plans = new Map((await this.prisma.plan.findMany({ where: { audience: 'partner' } })).map((p) => [p.id, p.name]));
    // Enseignes d'abord, chacune suivie de ses magasins (affichage indenté du back-office).
    const byParent = new Map<string | null, typeof rows>();
    for (const r of rows) byParent.set(r.parentPartnerId, [...(byParent.get(r.parentPartnerId) ?? []), r]);
    const ordered: (typeof rows[number] & { depth: number })[] = [];
    const push = (r: (typeof rows)[number], depth: number) => {
      ordered.push({ ...r, depth });
      for (const child of byParent.get(r.id) ?? []) push(child, depth + 1);
    };
    const ids = new Set(rows.map((r) => r.id));
    for (const r of rows.filter((r) => !r.parentPartnerId || !ids.has(r.parentPartnerId))) push(r, r.parentPartnerId ? 1 : 0);
    return ordered.map((r) => ({
      id: r.id,
      name: r.name,
      subtitle: r.subtitle ?? kindLabel(r.kind),
      initials: initials(r.name),
      color: r.color,
      kind: r.kind,
      kindLabel: kindLabel(r.kind),
      status: r.status,
      parentPartnerId: r.parentPartnerId,
      depth: r.depth,
      plan: r.parentPartnerId ? 'Inclus' : (plans.get(r.subscriptions[0]?.plan ?? '') ?? '—'),
      places: r._count.places,
      activeOffers: r._count.offers,
      members: r._count.members,
      kidsReached30d: kidsBy.get(r.id) ?? 0,
    }));
  }

  async detail(p: Principal, partnerId: string) {
    const { role } = await this.access.assertPartnerMember(p, partnerId, 'reception');
    const partner = await this.prisma.partner.findUnique({
      where: { id: partnerId },
      include: {
        members: { where: { status: { not: 'revoked' } }, orderBy: { invitedAt: 'asc' }, include: { user: { select: { fullName: true } } } },
        parentPartner: { select: { id: true, name: true } },
        stores: { select: { id: true, name: true, status: true } },
        _count: { select: { offers: true, places: true } },
      },
    });
    if (!partner) throw notFound('PARTNER_NOT_FOUND', 'Partenaire introuvable');
    const plan = await this.entitlements.partnerPlan(partnerId);
    return {
      ...partner,
      initials: initials(partner.name),
      kindLabel: kindLabel(partner.kind),
      myRole: role,
      plan: { id: plan.planId, name: plan.planName, limits: plan.limits, source: plan.source },
      members: partner.members.map(({ inviteTokenHash: _h, user, ...m }) => ({ ...m, fullName: user?.fullName ?? null, initials: initials(user?.fullName ?? m.email) })),
    };
  }

  async update(p: Principal, partnerId: string, input: UpdatePartnerInput & { color?: string; subtitle?: string }) {
    await this.access.assertPartnerMember(p, partnerId, 'owner');
    return this.prisma.partner.update({ where: { id: partnerId }, data: input });
  }

  /** Suspendre un partenaire met immédiatement ses offres (et celles de ses magasins) en pause. */
  async setStatus(partnerId: string, status: 'pending' | 'onboarding' | 'trial' | 'active' | 'suspended', setVisibility: (tx: Prisma.TransactionClient, offerId: string, visible: boolean) => Promise<void>) {
    return this.prisma.tx(async (tx) => {
      const partner = await tx.partner.update({ where: { id: partnerId }, data: { status } });
      if (status === 'suspended') {
        const ids = [partnerId, ...(await tx.partner.findMany({ where: { parentPartnerId: partnerId }, select: { id: true } })).map((s) => s.id)];
        const live = await tx.partnerOffer.findMany({ where: { partnerId: { in: ids }, status: 'published' }, select: { id: true } });
        for (const o of live) await setVisibility(tx, o.id, false);
        await tx.partnerOffer.updateMany({ where: { partnerId: { in: ids }, status: 'published' }, data: { status: 'paused' } });
      }
      return partner;
    });
  }

  /** Comptes accessibles à l'utilisateur (sélecteur « Changer de compte ») : directs + magasins de ses enseignes. */
  async accounts(p: UserPrincipal) {
    const memberships = await this.prisma.partnerMember.findMany({
      where: { userId: p.userId, status: 'active' },
      include: { partner: { include: { stores: { where: { status: { not: 'suspended' } } } } } },
    });
    const seen = new Set<string>();
    const out: { id: string; name: string; kindLabel: string; subtitle: string | null; color: string; initials: string; role: string; via: string }[] = [];
    const add = (x: { id: string; name: string; kind: string; subtitle: string | null; color: string }, role: string, via: string) => {
      if (seen.has(x.id)) return;
      seen.add(x.id);
      out.push({ id: x.id, name: x.name, kindLabel: kindLabel(x.kind), subtitle: x.subtitle, color: x.color, initials: initials(x.name), role, via });
    };
    for (const m of memberships) {
      add(m.partner, m.role, 'direct');
      if (m.role !== 'reception') for (const s of m.partner.stores) add(s, m.role, 'network');
    }
    return out;
  }

  // ─── Équipe ────────────────────────────────────────────────────────────────

  async inviteMember(p: Principal, partnerId: string, input: InvitePartnerMemberInput & { title?: string }) {
    await this.access.assertPartnerMember(p, partnerId, 'owner');
    return this.invite(partnerId, input);
  }

  private async invite(partnerId: string, input: { email: string; role: PartnerMemberRole; title?: string }) {
    const partner = await this.prisma.partner.findUniqueOrThrow({ where: { id: partnerId } });
    const existing = await this.prisma.partnerMember.findUnique({ where: { partnerId_email: { partnerId, email: input.email } } });
    if (existing?.status === 'active') throw conflict('MEMBER_EXISTS', 'Cette personne fait déjà partie de l’équipe');
    const token = randomToken(32);
    const data = {
      role: input.role,
      title: input.title ?? null,
      status: 'invited',
      inviteTokenHash: sha256(token),
      inviteExpiresAt: new Date(this.clock.now().getTime() + INVITE_TTL_DAYS * 86_400_000),
      invitedAt: this.clock.now(),
    };
    const member = existing
      ? await this.prisma.partnerMember.update({ where: { id: existing.id }, data })
      : await this.prisma.partnerMember.create({ data: { partnerId, email: input.email, ...data } });
    const url = `${this.env.WEB_PARTNERS_URL.replace(/\/$/, '')}/invitation?token=${encodeURIComponent(token)}`;
    const res = await this.mailer.send(mails.partnerInvitation(input.email, partner.name, url));
    if (res.status === 'failed') this.logger.warn(`Invitation non envoyée à ${input.email} : ${res.error}`);
    // Le lien est renvoyé à l'appelant : utile tant que l'email n'est pas configuré.
    return { memberId: member.id, email: member.email, role: member.role, url, expiresAt: data.inviteExpiresAt };
  }

  async updateMember(p: Principal, partnerId: string, memberId: string, input: { role?: PartnerMemberRole; title?: string | null }) {
    await this.access.assertPartnerMember(p, partnerId, 'owner');
    const member = await this.prisma.partnerMember.findFirst({ where: { id: memberId, partnerId } });
    if (!member) throw notFound('MEMBER_NOT_FOUND', 'Membre introuvable');
    if (member.role === 'owner' && input.role && input.role !== 'owner') await this.assertNotLastOwner(partnerId);
    const { inviteTokenHash: _h, ...updated } = await this.prisma.partnerMember.update({ where: { id: memberId }, data: input });
    return updated;
  }

  private async assertNotLastOwner(partnerId: string) {
    const owners = await this.prisma.partnerMember.count({ where: { partnerId, role: 'owner', status: 'active' } });
    if (owners <= 1) throw conflict('LAST_OWNER', 'Il faut au moins un responsable');
  }

  async revokeMember(p: Principal, partnerId: string, memberId: string) {
    await this.access.assertPartnerMember(p, partnerId, 'owner');
    const member = await this.prisma.partnerMember.findFirst({ where: { id: memberId, partnerId } });
    if (!member) throw notFound('MEMBER_NOT_FOUND', 'Membre introuvable');
    if (member.role === 'owner' && member.status === 'active') await this.assertNotLastOwner(partnerId);
    await this.prisma.partnerMember.update({ where: { id: memberId }, data: { status: 'revoked', inviteTokenHash: null } });
    return { success: true };
  }

  // ─── Lieux ─────────────────────────────────────────────────────────────────

  async places(p: Principal, partnerId: string) {
    await this.access.assertPartnerMember(p, partnerId, 'viewer');
    return this.prisma.partnerPlace.findMany({ where: { partnerId, isActive: true }, orderBy: { createdAt: 'asc' } });
  }

  async createPlace(p: Principal, partnerId: string, input: PlaceInput) {
    await this.access.assertPartnerMember(p, partnerId, 'owner');
    await this.entitlements.assertCanAddPlace(partnerId);
    return this.prisma.partnerPlace.create({ data: { ...input, partnerId } });
  }

  async updatePlace(p: Principal, partnerId: string, placeId: string, input: Partial<PlaceInput> & { isActive?: boolean }) {
    await this.access.assertPartnerMember(p, partnerId, 'owner');
    const res = await this.prisma.partnerPlace.updateMany({ where: { id: placeId, partnerId }, data: input });
    if (res.count === 0) throw notFound('PLACE_NOT_FOUND', 'Lieu introuvable');
    return this.prisma.partnerPlace.findUniqueOrThrow({ where: { id: placeId } });
  }

  // ─── Bons en caisse ────────────────────────────────────────────────────────

  /**
   * Vérifier (et marquer utilisé) un bon présenté en caisse ou à l'accueil.
   * Un magasin valide aussi les bons des offres nationales de son enseigne.
   */
  async verifyCode(p: UserPrincipal, partnerId: string, input: { code: string; redeem: boolean; placeId?: string; basketAmountCents?: number }, redeemClaim: (claimId: string, meta: { placeId?: string | null; userId: string; basketAmountCents?: number }) => Promise<unknown>) {
    await this.access.assertPartnerMember(p, partnerId, 'reception');
    const partner = await this.prisma.partner.findUniqueOrThrow({ where: { id: partnerId } });
    const owners = [partnerId, ...(partner.parentPartnerId ? [partner.parentPartnerId] : [])];
    const code = normalizeRk(input.code);
    const claim = await this.prisma.offerClaim.findFirst({
      where: { code, offer: { partnerId: { in: owners } } },
      include: { offer: { select: { id: true, title: true, discountLabel: true, codeMode: true, endsAt: true, partnerId: true } } },
    });
    if (!claim || claim.offer.codeMode === 'generic') throw notFound('CODE_NOT_FOUND', 'Code inconnu');
    const summary = { claimId: claim.id, offer: claim.offer, unlockedAt: claim.unlockedAt, expiresAt: claim.expiresAt ?? claim.offer.endsAt };
    if (claim.status === 'redeemed') return { valid: false, reason: 'already_redeemed' as const, redeemedAt: claim.redeemedAt, ...summary };
    if (claim.status !== 'unlocked' || (claim.expiresAt && claim.expiresAt <= this.clock.now())) return { valid: false, reason: 'expired' as const, ...summary };
    let placeId = input.placeId ?? null;
    if (!placeId) placeId = (await this.prisma.partnerPlace.findFirst({ where: { partnerId, isActive: true }, orderBy: { createdAt: 'asc' } }))?.id ?? null;
    if (input.redeem) await redeemClaim(claim.id, { placeId, userId: p.userId, basketAmountCents: input.basketAmountCents });
    return { valid: true, redeemed: input.redeem, ...summary };
  }
}
