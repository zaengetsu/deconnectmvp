/* eslint-disable @typescript-eslint/no-explicit-any */
import { generateKeyPairSync } from 'node:crypto';
import Stripe from 'stripe';
import { loadEnv, type Env } from '../../src/config/env';
import { mapStatus, normalizeEvent, normalizeInvoice, normalizeSubscription, StripeGateway } from '../../src/modules/billing/stripe.gateway';
import { ProviderPushTransport, type PushMessage } from '../../src/modules/notifications/channels/push';
import { BrevoMailer } from '../../src/platform/mail/mailer';

const baseEnv = (over: Record<string, string> = {}): Env => loadEnv({ DATABASE_URL: 'postgresql://x@localhost/db', JWT_ACCESS_SECRET: 'x'.repeat(32), ...over });
const msg: PushMessage = { title: '🎁 Récompense', body: 'Emma attend sa récompense', badge: 3, data: { route: '/parent/rewards/1', notificationId: 'n1' } };
const response = (status: number, body: unknown) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });

describe('push : APNs', () => {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const make = () => {
    const t = new ProviderPushTransport(baseEnv({ APNS_KEY_ID: 'KEY123', APNS_TEAM_ID: 'TEAM42', APNS_PRIVATE_KEY: Buffer.from(pem).toString('base64'), APNS_BUNDLE_ID: 'app.rekonect' }));
    const calls: { host: string; path: string; headers: Record<string, string>; body: string }[] = [];
    let next = { status: 200, body: '' };
    t.http2Request = async (host, path, headers, body) => {
      calls.push({ host, path, headers, body });
      return next;
    };
    return { t, calls, reply: (r: { status: number; body: string }) => (next = r) };
  };

  it('envoi signé ES256, bac à sable pour les jetons de développement, jeton d’auth mis en cache', async () => {
    const { t, calls } = make();
    expect(await t.send({ token: 'abc', platform: 'ios', environment: 'development' }, msg)).toEqual({ ok: true });
    await t.send({ token: 'def', platform: 'ios', environment: 'production' }, msg);
    expect(calls[0].host).toBe('https://api.sandbox.push.apple.com');
    expect(calls[1].host).toBe('https://api.push.apple.com');
    expect(calls[0].path).toBe('/3/device/abc');
    expect(calls[0].headers).toMatchObject({ 'apns-topic': 'app.rekonect', 'apns-push-type': 'alert' });
    expect(calls[0].headers.authorization).toBe(calls[1].headers.authorization);
    const [header] = calls[0].headers.authorization.replace('bearer ', '').split('.');
    expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({ alg: 'ES256', kid: 'KEY123' });
    expect(JSON.parse(calls[0].body)).toMatchObject({ aps: { alert: { title: msg.title }, badge: 3 }, route: '/parent/rewards/1' });
  });

  it('jeton invalide à purger, erreur temporaire à retenter, panne réseau', async () => {
    const { t, reply } = make();
    reply({ status: 410, body: '{"reason":"Unregistered"}' });
    expect(await t.send({ token: 'a', platform: 'ios', environment: 'production' }, msg)).toMatchObject({ ok: false, invalidToken: true, retryable: false });
    reply({ status: 400, body: '{"reason":"BadDeviceToken"}' });
    expect(await t.send({ token: 'a', platform: 'ios', environment: 'production' }, msg)).toMatchObject({ invalidToken: true });
    reply({ status: 503, body: '' });
    expect(await t.send({ token: 'a', platform: 'ios', environment: 'production' }, msg)).toMatchObject({ invalidToken: false, retryable: true });
    t.http2Request = async () => {
      throw new Error('ECONNRESET');
    };
    expect(await t.send({ token: 'a', platform: 'ios', environment: 'production' }, msg)).toMatchObject({ retryable: true, error: 'apns ECONNRESET' });
  });

  it('non configuré, web non pris en charge', async () => {
    const t = new ProviderPushTransport(baseEnv());
    expect(await t.send({ token: 'a', platform: 'ios', environment: 'production' }, msg)).toMatchObject({ skipped: true, error: 'apns_not_configured' });
    expect(await t.send({ token: 'a', platform: 'android', environment: 'production' }, msg)).toMatchObject({ skipped: true, error: 'fcm_not_configured' });
    expect(await t.send({ token: 'a', platform: 'web', environment: 'production' }, msg)).toMatchObject({ skipped: true });
    const bad = new ProviderPushTransport(baseEnv({ FCM_SERVICE_ACCOUNT_JSON: '{pas du json' }));
    expect(await bad.send({ token: 'a', platform: 'android', environment: 'production' }, msg)).toMatchObject({ error: 'fcm_invalid_service_account' });
    t.onModuleDestroy();
  });
});

describe('push : FCM v1', () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const account = { project_id: 'rekonect-prod', client_email: 'push@rekonect.iam', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() };
  const make = (replies: Response[]) => {
    const t = new ProviderPushTransport(baseEnv({ FCM_SERVICE_ACCOUNT_JSON: JSON.stringify(account) }));
    const calls: { url: string; init: RequestInit }[] = [];
    t.fetchFn = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return replies.shift() ?? response(200, {});
    }) as never;
    return { t, calls };
  };

  it('échange OAuth (mis en cache) puis envoi', async () => {
    const { t, calls } = make([response(200, { access_token: 'ya29', expires_in: 3600 }), response(200, { name: 'm1' }), response(200, { name: 'm2' })]);
    expect(await t.send({ token: 'tok', platform: 'android', environment: 'production' }, msg)).toEqual({ ok: true });
    await t.send({ token: 'tok2', platform: 'android', environment: 'production' }, msg);
    expect(calls.map((c) => c.url)).toEqual([
      'https://oauth2.googleapis.com/token',
      'https://fcm.googleapis.com/v1/projects/rekonect-prod/messages:send',
      'https://fcm.googleapis.com/v1/projects/rekonect-prod/messages:send',
    ]);
    expect((calls[1].init.headers as Record<string, string>).authorization).toBe('Bearer ya29');
    expect(JSON.parse(calls[1].init.body as string).message).toMatchObject({ token: 'tok', android: { notification: { notification_count: 3 } }, data: { route: '/parent/rewards/1' } });
  });

  it('jeton non enregistré, quota, échec OAuth', async () => {
    const { t } = make([response(200, { access_token: 'ya29' }), response(404, { error: { status: 'NOT_FOUND', details: 'UNREGISTERED' } }), response(429, 'quota')]);
    expect(await t.send({ token: 'x', platform: 'android', environment: 'production' }, msg)).toMatchObject({ invalidToken: true, retryable: false });
    expect(await t.send({ token: 'x', platform: 'android', environment: 'production' }, msg)).toMatchObject({ invalidToken: false, retryable: true });
    const { t: t2 } = make([response(400, { error: 'invalid_grant' }), response(200, { access_token: 'ok' }), response(200, {})]);
    expect(await t2.send({ token: 'x', platform: 'android', environment: 'production' }, msg)).toMatchObject({ ok: false, retryable: true });
    expect((await t2.send({ token: 'x', platform: 'android', environment: 'production' }, msg)).ok).toBe(true);
  });
});

describe('emails : Brevo', () => {
  const mail = { to: 'camille@x.fr', toName: 'Camille', subject: 'Bienvenue', html: '<p>Salut</p>', text: 'Salut', tags: ['welcome'] };
  it('envoi, erreurs fournisseur, réseau, non configuré', async () => {
    const m = new BrevoMailer(baseEnv({ BREVO_API_KEY: 'key', EMAIL_FROM: 'bonjour@rekonect.app' }));
    let captured: RequestInit | undefined;
    m.fetchFn = (async (_url: string, init: RequestInit) => {
      captured = init;
      return response(201, { messageId: '<m1>' });
    }) as never;
    expect(await m.send(mail)).toEqual({ status: 'sent', id: '<m1>' });
    expect(JSON.parse(captured!.body as string)).toMatchObject({ sender: { email: 'bonjour@rekonect.app' }, to: [{ email: 'camille@x.fr', name: 'Camille' }], tags: ['welcome'] });
    m.fetchFn = (async () => response(400, 'bad sender')) as never;
    expect(await m.send(mail)).toEqual({ status: 'failed', error: '400 bad sender', retryable: false });
    m.fetchFn = (async () => response(503, '')) as never;
    expect(await m.send(mail)).toMatchObject({ retryable: true });
    m.fetchFn = (async () => {
      throw new Error('timeout');
    }) as never;
    expect(await m.send(mail)).toEqual({ status: 'failed', error: 'timeout', retryable: true });
    expect(await new BrevoMailer(baseEnv()).send(mail)).toEqual({ status: 'skipped', reason: 'email_not_configured' });
  });
});

describe('Stripe', () => {
  const sub = {
    id: 'sub_1',
    customer: { id: 'cus_1' },
    status: 'active',
    cancel_at_period_end: false,
    cancel_at: null,
    canceled_at: null,
    metadata: { ownerType: 'family' },
    items: { data: [{ id: 'si_1', quantity: 1, current_period_end: 1_790_000_000, price: { id: 'price_1', unit_amount: 499, currency: 'eur', recurring: { interval: 'month' } } }] },
  };
  const invoice = {
    id: 'in_1',
    number: 'RK-0001',
    customer: 'cus_1',
    parent: { subscription_details: { subscription: 'sub_1' } },
    amount_paid: 499,
    amount_due: 499,
    currency: 'eur',
    status: 'paid',
    billing_reason: 'subscription_cycle',
    hosted_invoice_url: 'https://pay.stripe.com/i/1',
    invoice_pdf: 'https://pay.stripe.com/i/1.pdf',
    lines: { data: [{ period: { start: 1_787_000_000, end: 1_790_000_000 } }] },
    created: 1_787_000_000,
  };

  it('normalisation des abonnements, factures et événements', () => {
    expect(['active', 'trialing', 'past_due', 'unpaid', 'canceled', 'incomplete_expired', 'incomplete'].map(mapStatus)).toEqual(['active', 'trialing', 'past_due', 'past_due', 'cancelled', 'cancelled', 'inactive']);
    expect(normalizeSubscription(sub)).toMatchObject({ id: 'sub_1', customerId: 'cus_1', priceId: 'price_1', interval: 'month', amountCents: 499, currentPeriodEnd: new Date(1_790_000_000_000), cancelAtPeriodEnd: false });
    expect(normalizeSubscription({ id: 's', customer: 'c', status: 'canceled', cancel_at: 1, current_period_end: 5, items: { data: [{ price: { recurring: { interval: 'year' } } }] } })).toMatchObject({ interval: 'year', cancelAtPeriodEnd: true, currentPeriodEnd: new Date(5000), amountCents: 0, quantity: 1 });
    expect(normalizeInvoice(invoice)).toMatchObject({ id: 'in_1', subscriptionId: 'sub_1', amountPaidCents: 499, periodStart: new Date(1_787_000_000_000) });
    expect(normalizeInvoice({ id: 'in_2', subscription: 'sub_9', period_start: 10, customer: null })).toMatchObject({ subscriptionId: 'sub_9', customerId: '', status: 'open', periodStart: new Date(10_000) });
    expect(normalizeEvent({ id: 'evt', type: 'checkout.session.completed', data: { object: { customer: 'cus_1', subscription: 'sub_1', metadata: { a: '1' } } } })).toEqual({ id: 'evt', type: 'checkout.completed', customerId: 'cus_1', subscriptionId: 'sub_1', metadata: { a: '1' } });
    expect(normalizeEvent({ id: 'e', type: 'customer.subscription.updated', data: { object: sub } }).type).toBe('subscription.updated');
    expect(normalizeEvent({ id: 'e', type: 'customer.subscription.deleted', data: { object: sub } }).type).toBe('subscription.deleted');
    expect(normalizeEvent({ id: 'e', type: 'invoice.paid', data: { object: invoice } }).type).toBe('invoice.paid');
    expect(normalizeEvent({ id: 'e', type: 'invoice.payment_failed', data: { object: invoice } }).type).toBe('invoice.payment_failed');
    expect(normalizeEvent({ id: 'e', type: 'charge.refunded', data: {} })).toEqual({ id: 'e', type: 'ignored', raw: 'charge.refunded' });
  });

  it('webhook : signature réelle vérifiée, signature invalide refusée, secret requis', () => {
    const gw = new StripeGateway(baseEnv({ STRIPE_SECRET_KEY: 'sk_test_123', STRIPE_WEBHOOK_SECRET: 'whsec_test' }));
    const payload = JSON.stringify({ id: 'evt_1', object: 'event', type: 'invoice.paid', data: { object: invoice } });
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_test' });
    expect(gw.parseWebhook(Buffer.from(payload), header)).toMatchObject({ id: 'evt_1', type: 'invoice.paid', invoice: { id: 'in_1' } });
    expect(() => gw.parseWebhook(Buffer.from(payload), 't=1,v1=faux')).toThrow();
    expect(() => new StripeGateway(baseEnv({ STRIPE_SECRET_KEY: 'sk_test_123' })).parseWebhook(Buffer.from(payload), header)).toThrow('STRIPE_WEBHOOK_SECRET');
    const off = new StripeGateway(baseEnv());
    expect(off.enabled).toBe(false);
    return expect(off.createPortal({ customerId: 'c', returnUrl: 'x' })).rejects.toThrow('Stripe non configuré');
  });

  it('appels API : client, checkout (avec ou sans code promo), portail, changement, résiliation, prix, promotions', async () => {
    const gw = new StripeGateway(baseEnv({ STRIPE_SECRET_KEY: 'sk_test_123' }));
    const calls: [string, ...unknown[]][] = [];
    const rec = (name: string, result: unknown) => async (...args: unknown[]) => {
      calls.push([name, ...args]);
      return typeof result === 'function' ? (result as (...a: unknown[]) => unknown)(...args) : result;
    };
    (gw as any).stripe = {
      customers: { create: rec('customers.create', { id: 'cus_9' }) },
      checkout: { sessions: { create: rec('checkout.create', { id: 'cs_1', url: 'https://checkout.stripe.com/c/1' }) } },
      billingPortal: { sessions: { create: rec('portal.create', { url: 'https://billing.stripe.com/p/1' }) } },
      subscriptions: { retrieve: rec('subs.retrieve', sub), update: rec('subs.update', (_id: string, p: any) => ({ ...sub, cancel_at_period_end: !!p.cancel_at_period_end })) },
      products: { create: rec('products.create', { id: 'prod_1' }) },
      prices: {
        retrieve: rec('prices.retrieve', (id: string) => ({ id, unit_amount: id === 'price_same' ? 499 : 100, active: true })),
        update: rec('prices.update', {}),
        create: rec('prices.create', (p: any) => ({ id: `price_${p.recurring.interval}` })),
      },
      coupons: { create: rec('coupons.create', { id: 'co_1' }) },
      promotionCodes: { create: rec('promo.create', { id: 'promo_1' }) },
    };
    expect(await gw.createCustomer({ email: 'c@x.fr', metadata: { parentId: 'p' } })).toBe('cus_9');
    expect(await gw.createCheckout({ customerId: 'cus_9', priceId: 'price_1', successUrl: 's', cancelUrl: 'c', metadata: {} })).toEqual({ id: 'cs_1', url: 'https://checkout.stripe.com/c/1' });
    await gw.createCheckout({ customerId: 'cus_9', priceId: 'price_1', successUrl: 's', cancelUrl: 'c', metadata: {}, promotionCodeId: 'promo_1', quantity: 3 });
    expect(calls[1][1]).toMatchObject({ allow_promotion_codes: true, locale: 'fr' });
    expect(calls[2][1]).toMatchObject({ discounts: [{ promotion_code: 'promo_1' }], line_items: [{ quantity: 3 }] });
    expect(await gw.createPortal({ customerId: 'cus_9', returnUrl: 'r' })).toEqual({ url: 'https://billing.stripe.com/p/1' });
    expect((await gw.retrieveSubscription('sub_1')).id).toBe('sub_1');
    expect((await gw.changePlan('sub_1', 'price_2')).id).toBe('sub_1');
    expect(calls.find((c) => c[0] === 'subs.update')?.[2]).toMatchObject({ items: [{ id: 'si_1', price: 'price_2' }], proration_behavior: 'create_prorations' });
    expect((await gw.setCancelAtPeriodEnd('sub_1', true)).cancelAtPeriodEnd).toBe(true);

    const prices = await gw.syncPlanPrices({ id: 'family', name: 'Famille', currency: 'eur', monthlyPriceCents: 499, annualPriceCents: 4990, stripeProductId: null, stripeMonthlyPriceId: 'price_same', stripeAnnualPriceId: 'price_old' } as never);
    expect(prices).toEqual({ productId: 'prod_1', monthlyPriceId: 'price_same', annualPriceId: 'price_year' });
    expect(calls.some((c) => c[0] === 'prices.update' && c[1] === 'price_old')).toBe(true);
    expect(await gw.syncPlanPrices({ id: 'free', name: 'Gratuit', currency: 'eur', monthlyPriceCents: 0, annualPriceCents: null, stripeProductId: 'prod_0', stripeMonthlyPriceId: null, stripeAnnualPriceId: null } as never)).toEqual({ productId: 'prod_0', monthlyPriceId: null, annualPriceId: null });

    expect(await gw.createPromotion({ code: 'RENTREE', percentOff: 20, durationMonths: 3, maxRedemptions: 100, expiresAt: new Date('2026-12-31') })).toEqual({ couponId: 'co_1', promotionCodeId: 'promo_1' });
    await gw.createPromotion({ code: 'FIXE', amountOffCents: 200 });
    const coupons = calls.filter((c) => c[0] === 'coupons.create').map((c) => c[1]);
    expect(coupons[0]).toMatchObject({ percent_off: 20, duration: 'repeating', duration_in_months: 3 });
    expect(coupons[1]).toMatchObject({ amount_off: 200, currency: 'eur', duration: 'once' });
  });
});
