/* eslint-disable @typescript-eslint/no-explicit-any */
import { Inject, Injectable } from '@nestjs/common';
import Stripe from 'stripe';
import { ENV, type Env } from '../../config/env';
import {
  type BillingEvent,
  BillingGateway,
  type CheckoutRequest,
  type NormalizedInvoice,
  type NormalizedSubscription,
  type PlanPricing,
} from './gateway';

const toDate = (s: number | null | undefined) => (s ? new Date(s * 1000) : null);
const idOf = (v: unknown): string | null => (typeof v === 'string' ? v : v && typeof v === 'object' && 'id' in v ? String((v as { id: string }).id) : null);

/** Statut Stripe → statut Rekonect (les valeurs de la table subscriptions existante). */
export function mapStatus(status: string): NormalizedSubscription['status'] {
  switch (status) {
    case 'active':
      return 'active';
    case 'trialing':
      return 'trialing';
    case 'past_due':
    case 'unpaid':
      return 'past_due';
    case 'canceled':
    case 'incomplete_expired':
      return 'cancelled';
    default:
      return 'inactive';
  }
}

export function normalizeSubscription(sub: any): NormalizedSubscription {
  const item = sub.items?.data?.[0];
  const price = item?.price;
  return {
    id: sub.id,
    customerId: idOf(sub.customer) ?? '',
    status: mapStatus(sub.status),
    priceId: price?.id ?? null,
    interval: price?.recurring?.interval === 'year' ? 'year' : 'month',
    amountCents: price?.unit_amount ?? 0,
    currency: price?.currency ?? 'eur',
    quantity: item?.quantity ?? 1,
    // Depuis l'API 2025-03 la période est portée par l'item ; on garde la compatibilité ascendante.
    currentPeriodEnd: toDate(item?.current_period_end ?? sub.current_period_end),
    cancelAtPeriodEnd: !!sub.cancel_at_period_end || !!sub.cancel_at,
    canceledAt: toDate(sub.canceled_at),
    metadata: sub.metadata ?? {},
  };
}

export function normalizeInvoice(inv: any): NormalizedInvoice {
  const line = inv.lines?.data?.[0];
  return {
    id: inv.id,
    number: inv.number ?? null,
    customerId: idOf(inv.customer) ?? '',
    subscriptionId: idOf(inv.parent?.subscription_details?.subscription) ?? idOf(inv.subscription),
    amountPaidCents: inv.amount_paid ?? 0,
    amountDueCents: inv.amount_due ?? 0,
    currency: inv.currency ?? 'eur',
    status: inv.status ?? 'open',
    billingReason: inv.billing_reason ?? null,
    hostedUrl: inv.hosted_invoice_url ?? null,
    pdfUrl: inv.invoice_pdf ?? null,
    periodStart: toDate(line?.period?.start ?? inv.period_start),
    periodEnd: toDate(line?.period?.end ?? inv.period_end),
    createdAt: toDate(inv.created) ?? new Date(),
  };
}

export function normalizeEvent(event: any): BillingEvent {
  const obj = event.data?.object ?? {};
  switch (event.type) {
    case 'checkout.session.completed':
      return { id: event.id, type: 'checkout.completed', customerId: idOf(obj.customer) ?? '', subscriptionId: idOf(obj.subscription), metadata: obj.metadata ?? {} };
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
      return { id: event.id, type: 'subscription.updated', subscription: normalizeSubscription(obj) };
    case 'customer.subscription.deleted':
      return { id: event.id, type: 'subscription.deleted', subscription: normalizeSubscription(obj) };
    case 'invoice.paid':
      return { id: event.id, type: 'invoice.paid', invoice: normalizeInvoice(obj) };
    case 'invoice.payment_failed':
      return { id: event.id, type: 'invoice.payment_failed', invoice: normalizeInvoice(obj) };
    default:
      return { id: event.id, type: 'ignored', raw: event.type };
  }
}

@Injectable()
export class StripeGateway extends BillingGateway {
  readonly enabled: boolean;
  private readonly stripe: Stripe | null;

  constructor(@Inject(ENV) private readonly env: Env) {
    super();
    this.enabled = !!env.STRIPE_SECRET_KEY;
    this.stripe = env.STRIPE_SECRET_KEY ? new Stripe(env.STRIPE_SECRET_KEY, { maxNetworkRetries: 2, appInfo: { name: 'Rekonect' } }) : null;
  }

  private get api(): Stripe {
    if (!this.stripe) throw new Error('Stripe non configuré (STRIPE_SECRET_KEY)');
    return this.stripe;
  }

  async createCustomer(input: { email: string; name?: string | null; metadata: Record<string, string> }) {
    const c = await this.api.customers.create({ email: input.email, name: input.name ?? undefined, metadata: input.metadata, preferred_locales: ['fr'] });
    return c.id;
  }

  async createCheckout(input: CheckoutRequest) {
    const session = await this.api.checkout.sessions.create({
      mode: 'subscription',
      customer: input.customerId,
      line_items: [{ price: input.priceId, quantity: input.quantity ?? 1 }],
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      metadata: input.metadata,
      subscription_data: { metadata: input.metadata },
      locale: 'fr',
      ...(input.promotionCodeId ? { discounts: [{ promotion_code: input.promotionCodeId }] } : { allow_promotion_codes: true }),
    });
    return { id: session.id, url: session.url ?? '' };
  }

  async createPortal(input: { customerId: string; returnUrl: string }) {
    const s = await this.api.billingPortal.sessions.create({ customer: input.customerId, return_url: input.returnUrl, locale: 'fr' });
    return { url: s.url };
  }

  async retrieveSubscription(id: string) {
    return normalizeSubscription(await this.api.subscriptions.retrieve(id));
  }

  async changePlan(subscriptionId: string, priceId: string) {
    const sub = await this.api.subscriptions.retrieve(subscriptionId);
    const updated = await this.api.subscriptions.update(subscriptionId, {
      items: [{ id: sub.items.data[0].id, price: priceId }],
      proration_behavior: 'create_prorations',
      cancel_at_period_end: false,
    });
    return normalizeSubscription(updated);
  }

  async setCancelAtPeriodEnd(subscriptionId: string, cancel: boolean) {
    return normalizeSubscription(await this.api.subscriptions.update(subscriptionId, { cancel_at_period_end: cancel }));
  }

  async syncPlanPrices(plan: PlanPricing) {
    const productId =
      plan.stripeProductId ?? (await this.api.products.create({ name: `Rekonect ${plan.name}`, metadata: { planId: plan.id } })).id;
    const ensure = async (amount: number | null, interval: 'month' | 'year', current: string | null) => {
      if (!amount) return null;
      if (current) {
        const existing = await this.api.prices.retrieve(current);
        if (existing.unit_amount === amount && existing.active) return current;
        await this.api.prices.update(current, { active: false });
      }
      const price = await this.api.prices.create({
        product: productId,
        currency: plan.currency,
        unit_amount: amount,
        recurring: { interval },
        metadata: { planId: plan.id, interval },
      });
      return price.id;
    };
    return {
      productId,
      monthlyPriceId: await ensure(plan.monthlyPriceCents, 'month', plan.stripeMonthlyPriceId),
      annualPriceId: await ensure(plan.annualPriceCents, 'year', plan.stripeAnnualPriceId),
    };
  }

  async createPromotion(input: { code: string; percentOff?: number | null; amountOffCents?: number | null; durationMonths?: number | null; maxRedemptions?: number | null; expiresAt?: Date | null }) {
    const coupon = await this.api.coupons.create({
      name: input.code,
      ...(input.percentOff ? { percent_off: input.percentOff } : { amount_off: input.amountOffCents ?? 0, currency: 'eur' }),
      ...(input.durationMonths ? { duration: 'repeating', duration_in_months: input.durationMonths } : { duration: 'once' }),
    });
    const promo = await this.api.promotionCodes.create({
      promotion: { type: 'coupon', coupon: coupon.id },
      code: input.code,
      ...(input.maxRedemptions ? { max_redemptions: input.maxRedemptions } : {}),
      ...(input.expiresAt ? { expires_at: Math.floor(input.expiresAt.getTime() / 1000) } : {}),
    } as any);
    return { couponId: coupon.id, promotionCodeId: promo.id };
  }

  parseWebhook(rawBody: Buffer, signature: string | undefined): BillingEvent {
    if (!this.env.STRIPE_WEBHOOK_SECRET) throw new Error('STRIPE_WEBHOOK_SECRET manquant');
    const event = this.api.webhooks.constructEvent(rawBody, signature ?? '', this.env.STRIPE_WEBHOOK_SECRET);
    return normalizeEvent(event);
  }
}
