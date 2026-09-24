import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { type DomainEventType, formatEuros, PARTNER_ROLE_LABELS } from '@rekonect/contracts';
import { ENV, type Env } from '../../config/env';
import { Clock } from '../../platform/clock';
import { type EventHandler, EventRegistry } from '../../platform/events/event-registry';
import type { EmailCategory, EmailData, EmailTemplateId } from '../../platform/mail/catalog';
import { EMAILS } from '../../platform/mail/catalog';
import { EmailService } from '../../platform/mail/email.service';
import type { Tx } from '../../platform/prisma/prisma.service';
import { OFFER_KIND_LABELS } from '../partners/offer-rules';
import { adminContacts, type Contact, dayLabel, parentAccepts, parentContact, partnerContacts } from './recipients';

const PLAN_RANK: Record<string, number> = { free: 0, family: 1, family_plus: 2, partner_local: 1, partner_network: 2, partner_public: 2 };
/** Caps de bons obtenus fêtés auprès du partenaire. */
export const PARTNER_MILESTONES = [10, 50, 100, 250, 500, 1000, 2500, 5000];

const role = (r: string) => PARTNER_ROLE_LABELS[r] ?? r;
const FAMILY_ROLE_LABELS: Record<string, string> = { co_parent: 'co-parent', educator: 'éducateur', grandparent: 'grand-parent', babysitter: 'baby-sitter' };

/**
 * Emails déclenchés par les événements métier (5.14) : un consommateur « emails » par événement,
 * idempotent (processed_events + dedup_key). Les emails partent dans la transaction du consommateur :
 * si elle échoue, l'événement est rejoué et aucun email n'a été envoyé.
 */
@Injectable()
export class EmailConsumers implements OnModuleInit {
  constructor(
    private readonly registry: EventRegistry,
    private readonly emails: EmailService,
    private readonly clock: Clock,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private on<T extends DomainEventType>(type: T, handler: EventHandler<T>, consumer = 'emails'): void {
    this.registry.on(type, consumer, handler);
  }

  /** Envoi à un parent en respectant ses préférences (sauf emails de service). */
  private async toParent<T extends EmailTemplateId>(tx: Tx, parentId: string, template: T, data: EmailData<T>, dedupKey: string) {
    const c = await parentContact(tx, parentId);
    if (!c || !parentAccepts(c, EMAILS[template].category as EmailCategory)) return;
    await this.emails.queue(tx, template, { to: c.email, toName: c.name, recipientId: c.id, data, dedupKey });
  }

  private async toAll<T extends EmailTemplateId>(tx: Tx, contacts: Contact[], template: T, data: EmailData<T>, dedupKey: string) {
    for (const c of contacts) {
      await this.emails.queue(tx, template, { to: c.email, toName: c.name, recipientId: c.id, data, dedupKey: `${dedupKey}:${c.email}` });
    }
  }

  onModuleInit(): void {
    // ─── Familles ───
    this.on('user.registered', async (e, tx) => {
      if (e.payload.role !== 'parent') return;
      const c = await parentContact(tx, e.payload.userId);
      if (!c) return;
      await this.emails.queue(tx, 'parent.welcome', { to: c.email, toName: c.name, recipientId: c.id, data: { name: c.name }, dedupKey: `welcome:${c.id}` });
    });

    this.on('child.created', async (e, tx) => {
      const child = await tx.child.findUnique({ where: { id: e.payload.childId }, select: { displayName: true } });
      if (!child) return;
      await this.toParent(tx, e.payload.parentId, 'parent.child_added', { childName: child.displayName }, `child_added:${e.payload.childId}`);
    });

    this.on('child.device_linked', async (e, tx) => {
      const child = await tx.child.findUnique({ where: { id: e.payload.childId }, select: { displayName: true } });
      if (!child) return;
      await this.toParent(tx, e.payload.parentId, 'parent.device_linked', { childName: child.displayName }, `device_linked:${e.id}`);
    });

    this.on('family.invitation_created', async (e, tx) => {
      const p = e.payload;
      if (!p.email) return;
      const [inv, owner] = await Promise.all([tx.familyInvitation.findUnique({ where: { id: p.invitationId } }), parentContact(tx, p.ownerId)]);
      if (!inv) return;
      const url = `${this.env.MOBILE_APP_URL.replace(/\/$/, '')}/join-family?token=${encodeURIComponent(inv.token)}`;
      await this.emails.queue(tx, 'parent.coparent_invitation', {
        to: p.email,
        data: { inviterName: owner?.name ?? 'Un parent', role: FAMILY_ROLE_LABELS[p.role] ?? p.role, url, token: inv.token },
        dedupKey: `coparent_invite:${p.invitationId}`,
      });
    });

    this.on('family.member_joined', async (e, tx) => {
      const member = e.payload.memberId ? await parentContact(tx, e.payload.memberId) : null;
      await this.toParent(tx, e.payload.ownerId, 'parent.coparent_joined', { memberName: member?.name ?? member?.email ?? 'Un parent' }, `coparent_joined:${e.payload.ownerId}:${e.payload.memberId}`);
    });

    this.on('activity.validated', async (e, tx) => {
      const p = e.payload;
      // Première activité de toute la famille : un email pour installer l'habitude (une seule fois).
      const count = await tx.childActivity.count({ where: { status: 'validated', child: { parentId: p.parentId } } });
      if (count !== 1) return;
      const [child, activity] = await Promise.all([
        tx.child.findUnique({ where: { id: p.childId }, select: { displayName: true } }),
        tx.activity.findUnique({ where: { id: p.activityId }, select: { title: true } }),
      ]);
      if (!child || !activity) return;
      await this.toParent(tx, p.parentId, 'parent.first_activity', { childName: child.displayName, activityTitle: activity.title, points: p.points }, `first_activity:${p.parentId}`);
    });

    this.on('offer.unlocked', async (e, tx) => {
      const claim = await tx.offerClaim.findUnique({
        where: { id: e.payload.claimId },
        include: { offer: { select: { kind: true, title: true, discountLabel: true, partner: { select: { name: true } } } }, child: { select: { displayName: true } } },
      });
      // Les bons parents ont une valeur marchande : ils méritent un email. Les récompenses enfant restent en push.
      if (!claim || claim.offer.kind !== 'parent_voucher') return;
      await this.toParent(
        tx,
        claim.parentId,
        'parent.voucher_unlocked',
        {
          childName: claim.child?.displayName ?? null,
          partnerName: claim.offer.partner.name,
          offerTitle: claim.offer.title,
          discountLabel: claim.offer.discountLabel,
          expiresLabel: claim.expiresAt ? dayLabel(claim.expiresAt) : null,
          claimId: claim.id,
        },
        `voucher:${claim.id}`,
      );
    });

    // ─── Facturation ───
    this.on('billing.subscription_changed', async (e, tx) => {
      const p = e.payload;
      const plans = await tx.plan.findMany({ where: { id: { in: [p.planId, p.previousPlanId] } }, select: { id: true, name: true, features: true } });
      const name = (id: string) => plans.find((x) => x.id === id)?.name ?? id;
      const key = `sub:${e.id}`;
      if (p.ownerKind === 'partner') {
        const partner = await tx.partner.findUnique({ where: { id: p.ownerId }, select: { name: true } });
        if (!partner || p.status === 'canceled') return;
        await this.toAll(tx, await partnerContacts(tx, p.ownerId, ['owner']), 'partner.subscription_changed', {
          partnerName: partner.name,
          planName: name(p.planId),
          previousPlanName: p.previousPlanId && p.previousPlanId !== p.planId ? name(p.previousPlanId) : null,
          status: p.status,
        }, key);
        return;
      }
      const sub = await tx.subscription.findFirst({ where: { parentId: p.ownerId } });
      if (p.status === 'canceled' || p.planId === 'free') {
        await this.toParent(tx, p.ownerId, 'parent.subscription_cancelled', { planName: name(p.previousPlanId), endLabel: null }, key);
        return;
      }
      if (!p.previousPlanId || p.previousPlanId === 'free') {
        const plan = plans.find((x) => x.id === p.planId);
        await this.toParent(tx, p.ownerId, 'parent.subscription_started', {
          planName: name(p.planId),
          amountLabel: formatEuros(sub?.amountCents ?? 0, { decimals: 'always' }),
          interval: sub?.billingInterval === 'year' ? 'par an' : 'par mois',
          features: (plan?.features ?? []).slice(0, 4),
        }, key);
        return;
      }
      if (p.previousPlanId !== p.planId) {
        await this.toParent(tx, p.ownerId, 'parent.subscription_changed', {
          planName: name(p.planId),
          previousPlanName: name(p.previousPlanId),
          upgrade: (PLAN_RANK[p.planId] ?? 0) > (PLAN_RANK[p.previousPlanId] ?? 0),
        }, key);
      }
    });

    this.on('billing.payment_failed', async (e, tx) => {
      const p = e.payload;
      const amountLabel = formatEuros(p.amountCents, { decimals: 'always' });
      if (p.ownerKind === 'family') {
        const sub = await tx.subscription.findFirst({ where: { parentId: p.ownerId }, include: { planRef: { select: { name: true } } } });
        await this.toParent(tx, p.ownerId, 'parent.payment_failed', { amountLabel, planName: sub?.planRef.name ?? 'actuel' }, `payment_failed:${p.invoiceId}`);
        return;
      }
      const partner = await tx.partner.findUnique({ where: { id: p.ownerId }, select: { name: true } });
      if (!partner) return;
      await this.toAll(tx, await partnerContacts(tx, p.ownerId, ['owner']), 'partner.payment_failed', { partnerName: partner.name, amountLabel }, `payment_failed:${p.invoiceId}`);
      await this.toAll(tx, await adminContacts(tx), 'admin.partner_payment_failed', { partnerName: partner.name, amountLabel }, `admin_payment_failed:${p.invoiceId}`);
    });

    this.on('billing.invoice_paid', async (e, tx) => {
      const p = e.payload;
      const amountLabel = formatEuros(p.amountCents, { decimals: 'always' });
      if (p.ownerKind === 'family') {
        if (!p.recovered) return; // Stripe envoie déjà le reçu ; on ne confirme que la régularisation.
        const sub = await tx.subscription.findFirst({ where: { parentId: p.ownerId }, include: { planRef: { select: { name: true } } } });
        await this.toParent(tx, p.ownerId, 'parent.payment_recovered', { amountLabel, planName: sub?.planRef.name ?? 'actuel' }, `payment_recovered:${p.invoiceId}`);
        return;
      }
      const [partner, invoice] = await Promise.all([
        tx.partner.findUnique({ where: { id: p.ownerId }, select: { name: true } }),
        tx.invoice.findFirst({ where: { stripeInvoiceId: p.invoiceId }, select: { label: true, pdfUrl: true, hostedUrl: true } }),
      ]);
      if (!partner) return;
      await this.toAll(tx, await partnerContacts(tx, p.ownerId, ['owner']), 'partner.invoice_available', {
        partnerName: partner.name,
        amountLabel,
        label: invoice?.label ?? dayLabel(this.clock.now()),
        url: invoice?.pdfUrl ?? invoice?.hostedUrl ?? null,
        recovered: p.recovered,
      }, `invoice:${p.invoiceId}:${p.recovered ? 'recovered' : 'paid'}`);
    });

    // ─── Partenaires : équipe ───
    this.on('partner.member_joined', async (e, tx) => {
      const p = e.payload;
      const [partner, member, liveOffers] = await Promise.all([
        tx.partner.findUnique({ where: { id: p.partnerId }, select: { name: true } }),
        tx.partnerMember.findUnique({ where: { id: p.memberId }, select: { email: true, user: { select: { fullName: true } } } }),
        tx.partnerOffer.count({ where: { partnerId: p.partnerId } }),
      ]);
      if (!partner || !member) return;
      const name = member.user?.fullName ?? null;
      await this.emails.queue(tx, 'partner.welcome', {
        to: member.email,
        toName: name,
        recipientId: p.userId,
        data: { name, partnerName: partner.name, role: role(p.role), hasOffer: liveOffers > 0 },
        dedupKey: `partner_welcome:${p.memberId}`,
      });
      const owners = (await partnerContacts(tx, p.partnerId, ['owner'])).filter((c) => c.email !== member.email);
      await this.toAll(tx, owners, 'partner.member_joined', { partnerName: partner.name, memberName: name ?? member.email, memberEmail: member.email, role: role(p.role) }, `member_joined:${p.memberId}`);
      // Premier responsable qui active le compte : l'équipe Rekonect est prévenue.
      if (p.role === 'owner' && owners.length === 0) {
        await this.toAll(tx, await adminContacts(tx), 'admin.partner_activated', { partnerName: partner.name, ownerEmail: member.email }, `partner_activated:${p.partnerId}`);
      }
    });

    this.on('partner.member_updated', async (e, tx) => {
      const p = e.payload;
      const [partner, member] = await Promise.all([
        tx.partner.findUnique({ where: { id: p.partnerId }, select: { name: true } }),
        tx.partnerMember.findUnique({ where: { id: p.memberId }, select: { email: true, userId: true } }),
      ]);
      if (!partner || !member) return;
      await this.emails.queue(tx, 'partner.member_role_changed', { to: member.email, recipientId: member.userId, data: { partnerName: partner.name, role: role(p.role), previousRole: role(p.previousRole) }, dedupKey: `role:${e.id}` });
    });

    this.on('partner.member_revoked', async (e, tx) => {
      const partner = await tx.partner.findUnique({ where: { id: e.payload.partnerId }, select: { name: true } });
      if (!partner) return;
      await this.emails.queue(tx, 'partner.member_revoked', { to: e.payload.email, data: { partnerName: partner.name }, dedupKey: `revoked:${e.id}` });
    });

    this.on('partner.status_changed', async (e, tx) => {
      const p = e.payload;
      const status = p.status === 'suspended' ? 'suspended' : p.status === 'active' && p.previousStatus === 'suspended' ? 'active' : null;
      if (!status) return;
      const partner = await tx.partner.findUnique({ where: { id: p.partnerId }, select: { name: true } });
      if (!partner) return;
      await this.toAll(tx, await partnerContacts(tx, p.partnerId, ['owner', 'editor']), 'partner.status_changed', { partnerName: partner.name, status }, `status:${e.id}`);
    });

    // ─── Partenaires : offres ───
    this.on('offer.submitted', async (e, tx) => {
      const offer = await tx.partnerOffer.findUnique({ where: { id: e.payload.offerId }, select: { title: true, kind: true, partner: { select: { name: true } } } });
      if (!offer) return;
      await this.toAll(tx, await partnerContacts(tx, e.payload.partnerId), 'partner.offer_submitted', { offerTitle: offer.title, offerId: e.payload.offerId }, `offer_submitted:${e.id}`);
      const pending = await tx.partnerOffer.count({ where: { status: 'pending_review' } });
      await this.toAll(tx, await adminContacts(tx), 'admin.offer_to_moderate', { partnerName: offer.partner.name, offerTitle: offer.title, kindLabel: OFFER_KIND_LABELS[offer.kind] ?? offer.kind, pending }, `moderate:${e.id}`);
    });

    this.on('offer.stock_low', async (e, tx) => {
      const p = e.payload;
      const offer = await tx.partnerOffer.findUnique({ where: { id: p.offerId }, select: { title: true } });
      if (!offer) return;
      await this.toAll(tx, await partnerContacts(tx, p.partnerId), 'partner.stock_low', { offerTitle: offer.title, offerId: p.offerId, remaining: p.remaining, total: p.total }, `stock_low:${p.offerId}:${p.total}`);
    });

    this.on('offer.sold_out', async (e, tx) => {
      const p = e.payload;
      const offer = await tx.partnerOffer.findUnique({ where: { id: p.offerId }, select: { title: true } });
      if (!offer) return;
      await this.toAll(tx, await partnerContacts(tx, p.partnerId), 'partner.sold_out', { offerTitle: offer.title, offerId: p.offerId, total: p.total }, `sold_out:${p.offerId}:${p.total}`);
    });

    this.on('offer.expired', async (e, tx) => {
      const p = e.payload;
      const [offer, unlocked, redeemed] = await Promise.all([
        tx.partnerOffer.findUnique({ where: { id: p.offerId }, select: { title: true } }),
        tx.offerClaim.count({ where: { offerId: p.offerId } }),
        tx.offerClaim.count({ where: { offerId: p.offerId, status: 'redeemed' } }),
      ]);
      if (!offer) return;
      await this.toAll(tx, await partnerContacts(tx, p.partnerId), 'partner.offer_ended', { offerTitle: offer.title, offerId: p.offerId, unlocked, redeemed }, `offer_ended:${p.offerId}`);
    });

    this.on('offer.redeemed', async (e, tx) => {
      const claim = await tx.offerClaim.findUnique({ where: { id: e.payload.claimId }, select: { id: true, offer: { select: { title: true, partnerId: true } }, redeemedPlace: { select: { name: true } } } });
      if (!claim) return;
      const partnerId = claim.offer.partnerId;
      // Le tout premier bon utilisé chez ce partenaire (ordre stable même si deux passages sont traités ensemble).
      const first = await tx.offerClaim.findFirst({ where: { status: 'redeemed', offer: { partnerId } }, orderBy: [{ redeemedAt: 'asc' }, { id: 'asc' }], select: { id: true } });
      if (first?.id !== claim.id) return;
      await this.toAll(tx, await partnerContacts(tx, partnerId, ['owner', 'editor']), 'partner.first_redemption', { offerTitle: claim.offer.title, placeName: claim.redeemedPlace?.name ?? null }, `first_redemption:${partnerId}`);
    });

    // Caps de bons obtenus (sur l'ensemble des offres du partenaire) : rang du bon dans l'ordre de déblocage.
    this.on('offer.unlocked', async (e, tx) => {
      const claim = await tx.offerClaim.findUnique({ where: { id: e.payload.claimId }, select: { id: true, unlockedAt: true, offer: { select: { partnerId: true, partner: { select: { name: true } } } } } });
      if (!claim) return;
      const partnerId = claim.offer.partnerId;
      const rank = await tx.offerClaim.count({
        where: { offer: { partnerId }, OR: [{ unlockedAt: { lt: claim.unlockedAt } }, { unlockedAt: claim.unlockedAt, id: { lte: claim.id } }] },
      });
      if (!PARTNER_MILESTONES.includes(rank)) return;
      await this.toAll(tx, await partnerContacts(tx, partnerId, ['owner', 'editor']), 'partner.milestone', { partnerName: claim.offer.partner.name, count: rank }, `milestone:${partnerId}:${rank}`);
    }, 'emails.milestones');

    // ─── Back-office ───
    this.on('activity.reported', async (e, tx) => {
      const [activity, open] = await Promise.all([
        tx.activity.findUnique({ where: { id: e.payload.activityId }, select: { title: true } }),
        tx.activityReport.count({ where: { resolvedAt: null } }),
      ]);
      await this.toAll(tx, await adminContacts(tx), 'admin.activity_reported', { activityTitle: activity?.title ?? 'Activité', reason: e.payload.reason, openReports: open }, `reported:${e.payload.reportId}`);
    });
  }
}
