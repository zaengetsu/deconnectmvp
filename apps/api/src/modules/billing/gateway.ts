// Passerelle de paiement : l'API ne dépend que de ce contrat. Stripe en production, un faux en test.

export interface NormalizedSubscription {
  id: string;
  customerId: string;
  status: 'active' | 'trialing' | 'past_due' | 'cancelled' | 'inactive';
  priceId: string | null;
  interval: 'month' | 'year';
  amountCents: number;
  currency: string;
  quantity: number;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: Date | null;
  metadata: Record<string, string>;
}

export interface NormalizedInvoice {
  id: string;
  number: string | null;
  customerId: string;
  subscriptionId: string | null;
  amountPaidCents: number;
  amountDueCents: number;
  currency: string;
  status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';
  billingReason: string | null;
  hostedUrl: string | null;
  pdfUrl: string | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  createdAt: Date;
}

export type BillingEvent =
  | { id: string; type: 'checkout.completed'; customerId: string; subscriptionId: string | null; metadata: Record<string, string> }
  | { id: string; type: 'subscription.updated' | 'subscription.deleted'; subscription: NormalizedSubscription }
  | { id: string; type: 'invoice.paid' | 'invoice.payment_failed'; invoice: NormalizedInvoice }
  | { id: string; type: 'ignored'; raw: string };

export interface PlanPricing {
  id: string;
  name: string;
  currency: string;
  monthlyPriceCents: number | null;
  annualPriceCents: number | null;
  stripeProductId: string | null;
  stripeMonthlyPriceId: string | null;
  stripeAnnualPriceId: string | null;
}

export interface CheckoutRequest {
  customerId: string;
  priceId: string;
  quantity?: number;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
  promotionCodeId?: string | null;
}

export abstract class BillingGateway {
  /** false si aucune clé Stripe n'est configurée : l'API refuse alors les paiements proprement. */
  abstract readonly enabled: boolean;
  abstract createCustomer(input: { email: string; name?: string | null; metadata: Record<string, string> }): Promise<string>;
  abstract createCheckout(input: CheckoutRequest): Promise<{ id: string; url: string }>;
  abstract createPortal(input: { customerId: string; returnUrl: string }): Promise<{ url: string }>;
  abstract changePlan(subscriptionId: string, priceId: string): Promise<NormalizedSubscription>;
  abstract setCancelAtPeriodEnd(subscriptionId: string, cancel: boolean): Promise<NormalizedSubscription>;
  abstract retrieveSubscription(subscriptionId: string): Promise<NormalizedSubscription>;
  /** Crée le produit et les prix manquants ; un prix Stripe est immuable, un nouveau montant = un nouveau prix. */
  abstract syncPlanPrices(plan: PlanPricing): Promise<{ productId: string; monthlyPriceId: string | null; annualPriceId: string | null }>;
  abstract createPromotion(input: { code: string; percentOff?: number | null; amountOffCents?: number | null; durationMonths?: number | null; maxRedemptions?: number | null; expiresAt?: Date | null }): Promise<{ couponId: string; promotionCodeId: string }>;
  abstract parseWebhook(rawBody: Buffer, signature: string | undefined): BillingEvent;
}

/** Passerelle de test : mémorise les appels et produit des objets cohérents. */
export class FakeBillingGateway extends BillingGateway {
  enabled = true;
  seq = 0;
  readonly calls: { method: string; args: unknown }[] = [];
  readonly subscriptions = new Map<string, NormalizedSubscription>();
  private readonly prices = new Map<string, { amount: number; interval: 'month' | 'year' }>();

  private id(prefix: string) {
    return `${prefix}_test_${++this.seq}`;
  }

  async createCustomer(input: { email: string }) {
    this.calls.push({ method: 'createCustomer', args: input });
    return this.id('cus');
  }

  async createCheckout(input: CheckoutRequest) {
    this.calls.push({ method: 'createCheckout', args: input });
    const id = this.id('cs');
    return { id, url: `https://checkout.stripe.test/${id}` };
  }

  async createPortal(input: { customerId: string; returnUrl: string }) {
    this.calls.push({ method: 'createPortal', args: input });
    return { url: `https://billing.stripe.test/portal/${input.customerId}` };
  }

  /** Simule l'abonnement que Stripe crée à l'issue du checkout. */
  seedSubscription(input: { customerId: string; priceId: string; quantity?: number; metadata?: Record<string, string>; periodEnd?: Date }): NormalizedSubscription {
    const price = this.prices.get(input.priceId) ?? { amount: 0, interval: 'month' as const };
    const sub: NormalizedSubscription = {
      id: this.id('sub'),
      customerId: input.customerId,
      status: 'active',
      priceId: input.priceId,
      interval: price.interval,
      amountCents: price.amount,
      currency: 'eur',
      quantity: input.quantity ?? 1,
      currentPeriodEnd: input.periodEnd ?? new Date('2026-10-23T10:00:00Z'),
      cancelAtPeriodEnd: false,
      canceledAt: null,
      metadata: input.metadata ?? {},
    };
    this.subscriptions.set(sub.id, sub);
    return sub;
  }

  async changePlan(subscriptionId: string, priceId: string) {
    this.calls.push({ method: 'changePlan', args: { subscriptionId, priceId } });
    const sub = this.subscriptions.get(subscriptionId)!;
    const price = this.prices.get(priceId)!;
    Object.assign(sub, { priceId, amountCents: price.amount, interval: price.interval });
    return { ...sub };
  }

  async setCancelAtPeriodEnd(subscriptionId: string, cancel: boolean) {
    this.calls.push({ method: 'setCancelAtPeriodEnd', args: { subscriptionId, cancel } });
    const sub = this.subscriptions.get(subscriptionId)!;
    sub.cancelAtPeriodEnd = cancel;
    return { ...sub };
  }

  async retrieveSubscription(subscriptionId: string) {
    const sub = this.subscriptions.get(subscriptionId);
    if (!sub) throw new Error(`No such subscription: ${subscriptionId}`);
    return { ...sub };
  }

  async syncPlanPrices(plan: PlanPricing) {
    this.calls.push({ method: 'syncPlanPrices', args: plan.id });
    const productId = plan.stripeProductId ?? this.id('prod');
    const make = (amount: number | null, interval: 'month' | 'year', current: string | null) => {
      if (amount == null) return null;
      if (current && this.prices.get(current)?.amount === amount) return current;
      const id = this.id(`price_${plan.id}_${interval}`);
      this.prices.set(id, { amount, interval });
      return id;
    };
    return {
      productId,
      monthlyPriceId: make(plan.monthlyPriceCents, 'month', plan.stripeMonthlyPriceId),
      annualPriceId: make(plan.annualPriceCents, 'year', plan.stripeAnnualPriceId),
    };
  }

  async createPromotion(input: { code: string }) {
    this.calls.push({ method: 'createPromotion', args: input });
    return { couponId: this.id('coupon'), promotionCodeId: this.id('promo') };
  }

  /** En test, le corps est l'événement normalisé lui-même ; la signature doit valoir « valid ». */
  parseWebhook(rawBody: Buffer, signature: string | undefined): BillingEvent {
    if (signature !== 'valid') throw new Error('Invalid signature');
    const event = JSON.parse(rawBody.toString('utf8'));
    const revive = (o: Record<string, unknown>) => {
      for (const k of ['currentPeriodEnd', 'canceledAt', 'periodStart', 'periodEnd', 'createdAt']) if (typeof o[k] === 'string') o[k] = new Date(o[k] as string);
    };
    if (event.subscription) revive(event.subscription);
    if (event.invoice) revive(event.invoice);
    return event as BillingEvent;
  }
}
