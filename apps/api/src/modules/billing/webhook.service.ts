import { Injectable, Logger } from '@nestjs/common';
import { formatEuros } from '@rekonect/contracts';
import { Clock } from '../../platform/clock';
import { EventBus } from '../../platform/events/event-bus';
import { badRequest } from '../../platform/http/errors';
import { PrismaService, type Tx } from '../../platform/prisma/prisma.service';
import { monthLabel } from './billing.service';
import { type BillingEvent, BillingGateway, type NormalizedInvoice, type NormalizedSubscription } from './gateway';

type SubscriptionRow = Awaited<ReturnType<Tx['subscription']['findFirstOrThrow']>>;

const PLAN_RANK: Record<string, number> = { free: 0, family: 1, family_plus: 2, partner_local: 1, partner_network: 2, partner_public: 2 };

/**
 * Synchronisation Stripe → Rekonect. Chaque événement n'est traité qu'une fois (stripe_webhook_events),
 * et tout est rejouable : l'état final ne dépend pas de l'ordre d'arrivée des webhooks.
 */
@Injectable()
export class BillingWebhookService {
  private readonly logger = new Logger('StripeWebhook');

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: BillingGateway,
    private readonly events: EventBus,
    private readonly clock: Clock,
  ) {}

  async handle(rawBody: Buffer | undefined, signature: string | undefined): Promise<{ received: true; duplicate?: boolean; type: string }> {
    if (!rawBody) throw badRequest('WEBHOOK_BODY', 'Corps brut manquant');
    let event: BillingEvent;
    try {
      event = this.gateway.parseWebhook(rawBody, signature);
    } catch (err) {
      throw badRequest('WEBHOOK_SIGNATURE', `Signature invalide : ${(err as Error).message}`);
    }
    return this.prisma.tx(async (tx) => {
      const fresh = await tx.stripeWebhookEvent.createMany({ data: [{ id: event.id, type: event.type }], skipDuplicates: true });
      if (fresh.count === 0) return { received: true as const, duplicate: true, type: event.type };
      switch (event.type) {
        case 'checkout.completed':
          if (event.subscriptionId) await this.syncSubscription(tx, await this.gateway.retrieveSubscription(event.subscriptionId), event.id, event.metadata);
          break;
        case 'subscription.updated':
          await this.syncSubscription(tx, event.subscription, event.id);
          break;
        case 'subscription.deleted':
          await this.syncSubscription(tx, { ...event.subscription, status: 'cancelled' }, event.id);
          break;
        case 'invoice.paid':
        case 'invoice.payment_failed':
          await this.syncInvoice(tx, event.invoice, event.type === 'invoice.paid', event.id);
          break;
        default:
          break;
      }
      return { received: true as const, type: event.type };
    });
  }

  private async findRow(tx: Tx, sub: NormalizedSubscription, metadata?: Record<string, string>): Promise<SubscriptionRow | null> {
    const byStripe = await tx.subscription.findFirst({ where: { stripeSubscriptionId: sub.id } });
    if (byStripe) return byStripe;
    const meta = { ...sub.metadata, ...(metadata ?? {}) };
    if (meta.ownerKind === 'family' && meta.ownerId) return tx.subscription.findFirst({ where: { parentId: meta.ownerId } });
    if (meta.ownerKind === 'partner' && meta.ownerId) return tx.subscription.findFirst({ where: { partnerId: meta.ownerId } });
    return tx.subscription.findFirst({ where: { stripeCustomerId: sub.customerId } });
  }

  private async planForPrice(tx: Tx, priceId: string | null, fallback?: string) {
    if (priceId) {
      const plan = await tx.plan.findFirst({ where: { OR: [{ stripeMonthlyPriceId: priceId }, { stripeAnnualPriceId: priceId }] } });
      if (plan) return plan;
    }
    return fallback ? tx.plan.findUnique({ where: { id: fallback } }) : null;
  }

  private async syncSubscription(tx: Tx, sub: NormalizedSubscription, eventId: string, metadata?: Record<string, string>) {
    const row = await this.findRow(tx, sub, metadata);
    if (!row) {
      this.logger.warn(`Abonnement Stripe ${sub.id} sans propriétaire Rekonect`);
      return;
    }
    const plan = await this.planForPrice(tx, sub.priceId, metadata?.planId ?? sub.metadata.planId);
    const owner = row.parentId ? { parentId: row.parentId } : { partnerId: row.partnerId! };
    const cancelled = sub.status === 'cancelled';
    const nextPlan = cancelled ? (row.parentId ? 'free' : row.plan) : (plan?.id ?? row.plan);
    const previousPlan = row.stripeSubscriptionId ? row.plan : row.parentId ? 'free' : row.plan;
    const now = this.clock.now();

    await tx.subscription.update({
      where: { id: row.id },
      data: {
        plan: nextPlan,
        status: sub.status,
        stripeSubscriptionId: cancelled ? null : sub.id,
        stripeCustomerId: sub.customerId || row.stripeCustomerId,
        stripePriceId: cancelled ? null : sub.priceId,
        billingInterval: sub.interval,
        amountCents: cancelled ? 0 : sub.amountCents,
        currency: sub.currency,
        quantity: sub.quantity,
        currentPeriodEnd: sub.currentPeriodEnd,
        cancelAtPeriodEnd: cancelled ? false : sub.cancelAtPeriodEnd,
        canceledAt: cancelled ? (sub.canceledAt ?? now) : null,
        ...(row.stripeSubscriptionId ? {} : { startedAt: now }),
      },
    });

    const planName = plan?.name ?? nextPlan;
    
    let type: string | null = null;
    let description = '';
    let amount = 0;
    if (cancelled && row.status !== 'cancelled') {
      [type, description, amount] = ['canceled', row.cancelReason ? `Résiliation · « ${row.cancelReason} »` : 'Résiliation', -row.amountCents];
    } else if (!cancelled && !row.stripeSubscriptionId) {
      const quantityLabel = sub.quantity > 1 ? `Achat de ${sub.quantity} licences ${planName}` : null;
      [type, description, amount] = [
        sub.quantity > 1 ? 'licenses_purchased' : 'created',
        quantityLabel ?? `Nouvel abonnement ${planName}${sub.interval === 'year' ? ' (annuel)' : ''}`,
        sub.amountCents * sub.quantity,
      ];
    } else if (!cancelled && nextPlan !== previousPlan) {
      const up = (PLAN_RANK[nextPlan] ?? 0) > (PLAN_RANK[previousPlan] ?? 0);
      [type, description, amount] = [up ? 'upgraded' : 'downgraded', `Passage à ${planName}`, sub.amountCents - row.amountCents];
    } else if (!cancelled && sub.cancelAtPeriodEnd && !row.cancelAtPeriodEnd) {
      [type, description] = ['cancel_scheduled', 'Résiliation programmée en fin de période'];
    } else if (!cancelled && !sub.cancelAtPeriodEnd && row.cancelAtPeriodEnd) {
      [type, description] = ['reactivated', 'Résiliation annulée'];
    }
    if (type) {
      await tx.subscriptionEvent.createMany({
        data: [{ subscriptionId: row.id, ...owner, type, description, amountCents: amount, plan: nextPlan, stripeEventId: eventId, occurredAt: now }],
        skipDuplicates: true,
      });
    }
    if (nextPlan !== row.plan || sub.status !== row.status) {
      await this.events.publish(tx, 'billing.subscription_changed', {
        aggregateType: 'subscription',
        aggregateId: row.id,
        payload: { ownerKind: row.parentId ? 'family' : 'partner', ownerId: row.parentId ?? row.partnerId!, planId: nextPlan, previousPlanId: row.plan, status: sub.status },
        actor: { kind: 'system', id: 'stripe' },
      });
    }
  }

  private async syncInvoice(tx: Tx, inv: NormalizedInvoice, paid: boolean, eventId: string) {
    const row =
      (inv.subscriptionId ? await tx.subscription.findFirst({ where: { stripeSubscriptionId: inv.subscriptionId } }) : null) ??
      (await tx.subscription.findFirst({ where: { stripeCustomerId: inv.customerId } }));
    if (!row) {
      this.logger.warn(`Facture ${inv.id} sans abonnement Rekonect`);
      return;
    }
    const owner = row.parentId ? { parentId: row.parentId } : { partnerId: row.partnerId! };
    const amount = paid ? inv.amountPaidCents : inv.amountDueCents;
    const label = monthLabel(inv.periodStart ?? inv.createdAt);
    const existing = await tx.invoice.findFirst({ where: { stripeInvoiceId: inv.id }, select: { id: true } });
    const invoiceData = {
        ...owner,
        stripeInvoiceId: inv.id,
        number: inv.number,
        label,
        amountCents: amount,
        currency: inv.currency,
        status: paid ? 'paid' : inv.status === 'draft' ? 'draft' : 'open',
        hostedUrl: inv.hostedUrl,
        pdfUrl: inv.pdfUrl,
        periodStart: inv.periodStart,
        periodEnd: inv.periodEnd,
        issuedAt: inv.createdAt,
    };
    if (existing) {
      await tx.invoice.update({ where: { id: existing.id }, data: { status: invoiceData.status, amountCents: amount, hostedUrl: inv.hostedUrl, pdfUrl: inv.pdfUrl, number: inv.number } });
    } else {
      await tx.invoice.create({ data: invoiceData });
    }

    const now = this.clock.now();
    if (paid) {
      if (row.status === 'past_due') await tx.subscription.update({ where: { id: row.id }, data: { status: 'active' } });
      if (!existing && amount > 0) {
        await this.events.publish(tx, 'billing.invoice_paid', {
          aggregateType: 'subscription',
          aggregateId: row.id,
          payload: { ownerKind: row.parentId ? 'family' : 'partner', ownerId: row.parentId ?? row.partnerId!, invoiceId: inv.id, amountCents: amount, recovered: row.status === 'past_due' },
          actor: { kind: 'system', id: 'stripe' },
        });
      } else if (existing && row.status === 'past_due') {
        await this.events.publish(tx, 'billing.invoice_paid', {
          aggregateType: 'subscription',
          aggregateId: row.id,
          payload: { ownerKind: row.parentId ? 'family' : 'partner', ownerId: row.parentId ?? row.partnerId!, invoiceId: inv.id, amountCents: amount, recovered: true },
          actor: { kind: 'system', id: 'stripe' },
        });
      }
      if (inv.billingReason === 'subscription_cycle' || row.status === 'past_due') {
        await tx.subscriptionEvent.createMany({
          data: [{ subscriptionId: row.id, ...owner, type: row.status === 'past_due' ? 'payment_succeeded' : 'renewed', description: row.status === 'past_due' ? 'Paiement régularisé' : 'Renouvellement', amountCents: amount, plan: row.plan, stripeEventId: eventId, occurredAt: now }],
          skipDuplicates: true,
        });
      }
      return;
    }
    await tx.subscription.update({ where: { id: row.id }, data: { status: 'past_due' } });
    await tx.subscriptionEvent.createMany({
      data: [{ subscriptionId: row.id, ...owner, type: 'payment_failed', description: `Paiement échoué · ${formatEuros(amount, { decimals: 'always' })}`, amountCents: amount, plan: row.plan, stripeEventId: eventId, occurredAt: now }],
      skipDuplicates: true,
    });
    await this.events.publish(tx, 'billing.payment_failed', {
      aggregateType: 'subscription',
      aggregateId: row.id,
      payload: { ownerKind: row.parentId ? 'family' : 'partner', ownerId: row.parentId ?? row.partnerId!, amountCents: amount, invoiceId: inv.id },
      actor: { kind: 'system', id: 'stripe' },
    });
  }
}
